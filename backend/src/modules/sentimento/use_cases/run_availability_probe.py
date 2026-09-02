"""The `availability_probe` mechanism itself: sweep both sources, each paced by its own broker.

`plano 03` item 3.4 (`CA-F0-9`, `Q19`): a CONTINUOUS probe, not a one-shot. `domain/
local_quota_broker.py` (`T-02.2`) already solved "how fast can I go without ever bursting" for
ONE blind bucket at a FIXED interval; this use case applies the same fixed-interval discipline
to TWO buckets running side by side, each on its own declared period. `domain/ramp_plan.py`
(`T-03.7`) is the opposite job — it ACCELERATES to find a ceiling — and is deliberately not
reused here: this probe already knows its ceiling (`D3.3`) and must never approach it.

── WHY A SINGLE ROUND-ROBIN LOOP, NOT TWO THREADS ─────────────────────────────────────────────

Two independently paced schedules ("next Binance call is due at t1", "next Coinalyze call is
due at t2") are merged by always advancing whichever is due FIRST, exactly like a two-way merge
of two sorted streams. This keeps the whole use case single-threaded and OFFLINE-testable: a
fake clock that only advances when `sleep()` is called can drive an entire multi-minute proof
run in zero real seconds, the same trick `use_cases/run_quota_ramp.py`'s tests already rely on.
"""

from __future__ import annotations

import itertools
from collections.abc import Iterator
from typing import Protocol

from src.modules.sentimento.domain.availability_poll import (
    AvailabilityPollAttempt,
    AvailabilityPollOutcome,
)
from src.modules.sentimento.domain.availability_probe_set import (
    AvailabilityProbeSet,
    BinanceFuturesDataEndpoint,
)
from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind


class AvailabilityTransport(Protocol):
    """The two probe calls this use case needs — one per source, each with its own request shape."""

    def poll_binance(
        self, endpoint: BinanceFuturesDataEndpoint, symbol: str
    ) -> AvailabilityPollOutcome:
        """Issue one Binance `/futures/data/*` call and describe what came back, parsed."""
        ...

    def poll_coinalyze(self, kind: SeriesKind, symbol: str) -> AvailabilityPollOutcome:
        """Issue one Coinalyze history call and describe what came back, parsed."""
        ...


class ProbeClock(Protocol):
    """The three time operations this loop needs, separated by what they are FOR.

    `monotonic` schedules and cannot go backwards. `now_ms` stamps `available_at` — it has to be
    the SAME clock a consumer would read `SPEC-001` §2.2 against, which is wall clock, not a
    monotonic counter with an arbitrary origin.
    """

    def monotonic(self) -> float:
        """Return a monotonically increasing reading, in seconds."""
        ...

    def now_ms(self) -> int:
        """Return the local wall clock, in whole epoch milliseconds."""
        ...

    def sleep(self, seconds: float) -> None:
        """Block for `seconds`."""
        ...


class InvalidProbeRunError(Exception):
    """A run that was asked to measure a non-positive window."""


def _binance_targets(
    probe_set: AvailabilityProbeSet,
) -> tuple[tuple[BinanceFuturesDataEndpoint, str], ...]:
    """Enumerate every (endpoint, symbol) pair one Binance sweep visits, in a fixed order."""
    return tuple(
        (endpoint, symbol)
        for endpoint in probe_set.binance_endpoints
        for symbol in probe_set.symbols
    )


def _coinalyze_targets(probe_set: AvailabilityProbeSet) -> tuple[tuple[SeriesKind, str], ...]:
    """Enumerate every (kind, symbol) pair one Coinalyze sweep visits, in a fixed order."""
    return tuple(
        (kind, symbol) for kind in probe_set.coinalyze_endpoints for symbol in probe_set.symbols
    )


def run_availability_probe(
    probe_set: AvailabilityProbeSet,
    transport: AvailabilityTransport,
    clock: ProbeClock,
    *,
    total_duration_seconds: float,
    observer_region: str,
) -> tuple[AvailabilityPollAttempt, ...]:
    """Sweep both sources for `total_duration_seconds` of WALL TIME, each on its own fixed pace.

    Returns every raw attempt — `D3.4` needs every line of the window, not a sample.
    `domain/availability_lag.classify_transitions` and `domain/availability_lag_stats.
    summarize_lag` are the next two steps, deliberately left to the caller: this function's only
    job is the CONTINUOUS SWEEP, and it stays a pure orchestration of two injected ports so the
    logic is exercised offline exactly like `use_cases/run_quota_ramp.py`'s tests do for the
    ramp.
    """
    if total_duration_seconds <= 0:
        raise InvalidProbeRunError(
            f"total_duration_seconds={total_duration_seconds}: "
            f"uma janela nao positiva nao mede nada"
        )
    binance_cycle: Iterator[tuple[BinanceFuturesDataEndpoint, str]] = itertools.cycle(
        _binance_targets(probe_set)
    )
    coinalyze_cycle: Iterator[tuple[SeriesKind, str]] = itertools.cycle(
        _coinalyze_targets(probe_set)
    )
    binance_interval = probe_set.binance_broker.interval_seconds
    coinalyze_interval = probe_set.coinalyze_broker.interval_seconds

    start = clock.monotonic()
    deadline = start + total_duration_seconds
    binance_next_due = start
    coinalyze_next_due = start
    attempts: list[AvailabilityPollAttempt] = []

    while True:
        if binance_next_due <= coinalyze_next_due:
            due_at, poll_binance_next = binance_next_due, True
        else:
            due_at, poll_binance_next = coinalyze_next_due, False
        if due_at >= deadline:
            break
        wait = due_at - clock.monotonic()
        if wait > 0:
            clock.sleep(wait)
        if poll_binance_next:
            endpoint, symbol = next(binance_cycle)
            outcome = transport.poll_binance(endpoint, symbol)
            attempts.append(
                AvailabilityPollAttempt(
                    source=probe_set.binance_bucket.identifier,
                    endpoint=endpoint.value,
                    symbol=symbol,
                    observer_region=observer_region,
                    polled_at_ms=clock.now_ms(),
                    outcome=outcome,
                )
            )
            binance_next_due += binance_interval
        else:
            kind, symbol = next(coinalyze_cycle)
            outcome = transport.poll_coinalyze(kind, symbol)
            attempts.append(
                AvailabilityPollAttempt(
                    source=probe_set.coinalyze_bucket.identifier,
                    endpoint=kind.value,
                    symbol=symbol,
                    observer_region=observer_region,
                    polled_at_ms=clock.now_ms(),
                    outcome=outcome,
                )
            )
            coinalyze_next_due += coinalyze_interval

    return tuple(attempts)
