"""Orchestrate the one-shot: for every symbol, fetch OI + liquidation, pace, quarantine, store."""

# This is the use case plano 02 items 2.3 and 2.4 describe: it does not open a socket (that is
# `infra/coinalyze_history_client.py`'s job) and it does not decide WHAT quarantine means (that
# is `domain/quarantine_terms.py`'s job) — it sequences the two, one symbol and one series at a
# time, pacing every call through the injected `LocalQuotaBroker` so the bucket this task spends
# is never bursted (`CA-F3-9`).
#
# `source`, `clock` and `sink` are `Protocol`s for the same reason every other use case in this
# package injects its ports: the live pass against Coinalyze is NOT a test and never will be
# (`backend/scripts/test.sh` — "ZERO REDE"), and what the suite owns is this sequencing logic,
# proven offline with a scripted fake exactly like `use_cases/run_quota_ramp.py`'s tests do for
# the ramp.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from src.modules.sentimento.domain.coinalyze_daily_series import (
    REQUIREMENT_BY_KIND,
    MalformedCoinalizeResponseError,
    SeriesKind,
    evaluate_series_requirement,
    history_path_for,
    parse_daily_points,
    to_coinalyze_symbol,
)
from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.domain.quarantine_terms import COINALYZE_ONE_SHOT_TERMS
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry

# Both series this task captures, in the fixed order they are swept for every symbol — declared
# once here so the plan (`_sweep_plan`) and any test asserting call order agree on the same list.
SERIES_KINDS: tuple[SeriesKind, ...] = (SeriesKind.OPEN_INTEREST, SeriesKind.LIQUIDATION)


class CoinalizeHistorySource(Protocol):
    """The one operation this use case needs from the transport: fetch one path, get bytes back."""

    def fetch(self, path: str) -> HistoryResponseLike:
        """Issue the request and describe the outcome without interpreting it."""
        ...


class HistoryResponseLike(Protocol):
    """The three things this use case reads off a response — matches `CoinalizeHistoryResponse`."""

    @property
    def status(self) -> int | None:
        """Return the HTTP status, or `None` when the request never dispatched."""
        ...

    @property
    def body(self) -> bytes:
        """Return the raw response body."""
        ...

    @property
    def transport_error(self) -> str | None:
        """Return the transport failure description, or `None` when the request dispatched."""
        ...

    @property
    def is_success(self) -> bool:
        """Return whether the response is a `2xx`."""
        ...


class OneShotClock(Protocol):
    """The one operation this use case needs from time: pace itself, nothing else."""

    def sleep(self, seconds: float) -> None:
        """Block for `seconds` — the pacing pause the broker computed."""
        ...


class SeriesQuarantineSink(Protocol):
    """The one operation this use case needs from storage: persist one captured entry."""

    def record(self, entry: QuarantinedSeriesEntry) -> None:
        """Persist `entry`, durably, before this call returns."""
        ...


@dataclass(frozen=True)
class SymbolSeriesOutcome:
    """What happened to ONE (symbol, series) pair — dispatched and stored, or why not."""

    binance_symbol: str
    series_kind: SeriesKind
    status: int | None
    transport_error: str | None
    n_points: int
    requirement_met: bool | None
    reasons: tuple[str, ...]
    stored: bool


def _sweep_plan(binance_symbols: Sequence[str]) -> tuple[tuple[str, SeriesKind], ...]:
    """Enumerate every (symbol, series) pair, series nested inside symbol — 2 calls per symbol."""
    return tuple(
        (symbol, kind) for symbol in binance_symbols for kind in SERIES_KINDS
    )


def _capture_one(
    binance_symbol: str,
    series_kind: SeriesKind,
    source: CoinalizeHistorySource,
    sink: SeriesQuarantineSink,
    run_id: str,
    received_at: str,
    from_epoch_seconds: int,
    to_epoch_seconds: int,
) -> SymbolSeriesOutcome:
    """Fetch, parse, quarantine and store ONE (symbol, series) pair; never raise on bad data.

    A malformed body or a non-`2xx` status becomes a named outcome instead of an exception,
    because a 1.140-call sweep that dies on the first symbol Coinalyze does not recognise would
    lose every call spent before it — `SPEC-001` §5.6's survivorship rule ("nunca REJECTED,
    nunca zero linhas gravadas") is written for the Binance snapshot, and the same argument
    applies here: one bad symbol is data about that symbol, not a reason to abort the sweep.
    """
    coinalyze_symbol = to_coinalyze_symbol(binance_symbol)
    path = history_path_for(series_kind, coinalyze_symbol, from_epoch_seconds, to_epoch_seconds)
    response = source.fetch(path)
    if not response.is_success:
        return SymbolSeriesOutcome(
            binance_symbol=binance_symbol,
            series_kind=series_kind,
            status=response.status,
            transport_error=response.transport_error,
            n_points=0,
            requirement_met=None,
            reasons=(),
            stored=False,
        )
    try:
        points = parse_daily_points(response.body)
    except MalformedCoinalizeResponseError as failure:
        return SymbolSeriesOutcome(
            binance_symbol=binance_symbol,
            series_kind=series_kind,
            status=response.status,
            transport_error=str(failure),
            n_points=0,
            requirement_met=None,
            reasons=(),
            stored=False,
        )
    verdict = evaluate_series_requirement(REQUIREMENT_BY_KIND[series_kind], points)
    entry = QuarantinedSeriesEntry(
        source="coinalyze",
        series_kind=series_kind,
        binance_symbol=binance_symbol,
        coinalyze_symbol=coinalyze_symbol,
        points=points,
        requirement_verdict=verdict,
        quarantine=COINALYZE_ONE_SHOT_TERMS,
        received_at=received_at,
        run_id=run_id,
    )
    sink.record(entry)
    return SymbolSeriesOutcome(
        binance_symbol=binance_symbol,
        series_kind=series_kind,
        status=response.status,
        transport_error=None,
        n_points=verdict.n_points,
        requirement_met=verdict.met,
        reasons=verdict.reasons,
        stored=True,
    )


def capture_one_shot(
    binance_symbols: Sequence[str],
    broker: LocalQuotaBroker,
    source: CoinalizeHistorySource,
    clock: OneShotClock,
    sink: SeriesQuarantineSink,
    run_id: str,
    received_at: str,
    from_epoch_seconds: int,
    to_epoch_seconds: int,
) -> tuple[SymbolSeriesOutcome, ...]:
    """Sweep every symbol for both series, pacing every call and never bursting the bucket.

    `n` calls take `n - 1` pauses (same asymmetry `LocalQuotaBroker.total_seconds_for` and the
    ramp's own load loop both name): the pause FOLLOWS a call and precedes the next one, so the
    very last call of the sweep is not delayed waiting for a call that will never come.
    """
    plan = _sweep_plan(binance_symbols)
    outcomes: list[SymbolSeriesOutcome] = []
    for index, (symbol, kind) in enumerate(plan, start=1):
        outcomes.append(
            _capture_one(
                symbol,
                kind,
                source,
                sink,
                run_id,
                received_at,
                from_epoch_seconds,
                to_epoch_seconds,
            )
        )
        if index < len(plan):
            clock.sleep(broker.interval_seconds)
    return tuple(outcomes)
