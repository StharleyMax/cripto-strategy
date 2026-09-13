"""`RS-3.1..RS-3.7`, as pure policy: what the liquidation collector is allowed to do, and when.

`T-05.5`, plan `05` item 5.3. Everything in this module is a function of its arguments — no
clock, no socket, no store — so every one of the seven requirements below is testable with
literals. `use_cases/collect_liquidation_history.py` is where they are composed into a cycle,
and `infra/collectors_cli.py` is where that cycle gets a real connection.

── WHY THIS MODULE EXISTS AT ALL, GIVEN HOW MUCH ALREADY DID ──────────────────────────────────

`MEDIÇÃO §6` and `T-05.5` both say REUSE, and they are obeyed literally: the HTTP call is
`infra/coinalyze_history_client.py`, the auth is `infra/https_quota_probe.py`, the bucket is
`domain/quota_bucket.COINALYZE`, the pacing floor is `domain/local_quota_broker.py`, the recoil is
`domain/recoil_policy.py`, the zero-vs-silence rule is `domain/liquidation_zero_legitimacy.py`,
the identity is `domain/liquidation_catalog.py`, and the gap record is
`infra/postgres_ingest_record_store.record_gap`. What NONE of them holds is the part that is new
here: a collector in REGIME. The one-shot (`use_cases/capture_coinalyze_daily_series.py`) sweeps
once and stops; a regime collector comes back every cycle, and the three things that only matter
in regime — a window that SLIDES rather than a call counter that resets, a retry scoped to the
one pair that failed, and a newest bucket that is still growing — have no home in any of those.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from src.modules.sentimento.domain.coinalyze_daily_series import (
    DailyPoint,
    MalformedCoinalizeResponseError,
)
from src.modules.sentimento.domain.liquidation_catalog import (
    CONVERT_TO_USD_REQUIRED,
    LONG,
    SHORT,
)
from src.modules.sentimento.domain.liquidation_zero_legitimacy import LiquidationSide, SidePoint
from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.domain.quota_bucket import COINALYZE

# The endpoint, spelled here and not imported from `ENDPOINT_PATH_BY_KIND`, for the reason
# `collector_run_mapping.KLINES_ENDPOINT` documents: crossing a layer to borrow a string is
# worse than spelling it twice with a test that pins the two spellings together —
# `test_liquidation_collection.py::test_the_path_prefix_matches_the_one_shot_endpoint_table`
# makes that executable instead of trusted.
LIQUIDATION_HISTORY_PATH: Final[str] = "/v1/liquidation-history"

# `1min`, spelled exactly as the provider spells it (`liquidation_catalog.NATIVE_GRID`), and NOT
# `1m`: the `interval` query parameter and the `SeriesKey.interval` term are different
# vocabularies that happen to describe the same grid, and collapsing them is how a request and
# an identity drift apart in silence.
LIQUIDATION_INTERVAL: Final[str] = "1min"
LIQUIDATION_BUCKET_SECONDS: Final[int] = 60
LIQUIDATION_BUCKET_MS: Final[int] = LIQUIDATION_BUCKET_SECONDS * 1000

# The two Coinalyze wire letters, paired with the two cohorts of the identity. The pairing is
# declared ONCE, here, because it is the one place a swap would be invisible: `l` written under
# `cohort="short"` produces a complete, plausible, wrong series — no exception, no empty answer,
# nothing to notice. `test_liquidation_collection.py::test_the_cohort_of_each_wire_letter` is the
# executable form of this sentence.
COHORT_BY_SIDE: Final[Mapping[LiquidationSide, str]] = {
    LiquidationSide.LONG: LONG,
    LiquidationSide.SHORT: SHORT,
}

# `RS-3.1`'s ceiling. `[MEDIDO 2026-09-10, n=41 requisicoes]` — 40 units per SLIDING 60 s window,
# the number `domain/quota_bucket.COINALYZE` already carries as the bucket's published limit.
QUOTA_CEILING: Final[int] = 40
QUOTA_WINDOW_SECONDS: Final[float] = 60.0


class QuotaExhaustedError(Exception):
    """The sliding window has no room for another call right now (`RS-3.1`)."""


class InvalidCadenceError(ValueError):
    """A cadence that cannot spread the calls it was asked to spread (`RS-3.6`)."""


def liquidation_history_path(
    coinalyze_symbol: str, from_epoch_seconds: int, to_epoch_seconds: int
) -> str:
    """Build the `1min` query path for ONE symbol — `convert_to_usd` is NOT optional here.

    ⛔ `convert_to_usd=true` IS A CORRECTNESS TERM, NOT A FORMATTING CHOICE. The provider's
    DEFAULT is `false`, and `false` returns the BASE quantity while `liquidation_catalog` labels
    the series `unit="USD"`, `denom="quote"`. Sending the request without the parameter produces
    a `200`, a full history, and a series whose every value is off by the price of the
    instrument — `0.003` where the USD notional is `231.85`
    `[MEDIDO 2026-09-12, gates/falsificador-denom-liquidacao.md, n=4 pares]`. NOTHING in the
    response says which convention it used.

    So the flag is read from `liquidation_catalog.CONVERT_TO_USD_REQUIRED` rather than written
    here: the identity and the request then have exactly one place they can disagree, and
    `test_liquidation_collection.py::test_the_path_always_asks_for_the_usd_notional` fails if
    that place ever says `false`.

    One symbol per call, like `history_path_for`: the provider's own doc says a comma-joined
    list still spends one unit per symbol, so batching buys HTTP round trips and no quota.
    """
    if from_epoch_seconds >= to_epoch_seconds:
        raise ValueError(
            f"from_epoch_seconds={from_epoch_seconds} >= to_epoch_seconds={to_epoch_seconds}: "
            "an inverted or empty window requests no history at all"
        )
    convert = "true" if CONVERT_TO_USD_REQUIRED else "false"
    return (
        f"{LIQUIDATION_HISTORY_PATH}?symbols={coinalyze_symbol}"
        f"&interval={LIQUIDATION_INTERVAL}"
        f"&convert_to_usd={convert}"
        f"&from={from_epoch_seconds}&to={to_epoch_seconds}"
    )


# ── `RS-3.1` — THE COUNTER IS OURS, BECAUSE THE PROVIDER PUBLISHES NONE ────────────────────


@dataclass
class SlidingQuotaWindow:
    """Our own count of calls inside a window that SLIDES — `RS-3.1`, `quota_bucket.COINALYZE`.

    `COINALYZE.visibility is BucketVisibility.BLIND` and its `counter_header` is `None`: a `200`
    from this provider carries no quota at all — "nem consumido, nem restante, nem janela", in
    that bucket's own `blindness_reason`. There is nothing to read back, so the only honest
    accounting is the one this process keeps `[DOC: docs/medicao-coinalyze.md §3.1]`.

    ⛔ SLIDING, NOT TUMBLING — AND THE DIFFERENCE IS THE WHOLE DEFECT `RS-3.6` NAMES. A tumbling
    counter (reset every minute on the minute) would let 40 calls land at 11:59:59 and 40 more
    at 12:00:01: 80 calls inside one real 60-second window, every one of them "within budget"
    according to a counter that had just reset. This window keeps the TIMESTAMPS and expires
    them individually, so the budget is measured over the last 60 seconds from wherever the
    caller is standing — which is the same window the provider enforces.

    ⚠️ AND THE AVERAGE IS NOT THE PEAK. A cycle of `N=10` at a 5-minute cadence spends
    `2 u/min`, 5% of the ceiling (`SPEC-007` §6.3) — and firing those 10 in one burst still
    occupies a tenth of a single window, so the NEXT retry inside that same minute can take a
    `429` while the average reads 5%. `spread_interval_seconds` below is the answer to that,
    and this counter is what proves it worked.
    """

    ceiling: int = QUOTA_CEILING
    window_seconds: float = QUOTA_WINDOW_SECONDS
    _spent_at: list[float] = field(default_factory=list, repr=False)

    def __post_init__(self) -> None:
        """Reject a window that could never permit a call, or that measures no span."""
        if self.ceiling < 1:
            raise ValueError(f"ceiling={self.ceiling}: a window that permits no call paces nothing")
        if self.window_seconds <= 0:
            raise ValueError(f"window_seconds={self.window_seconds}: not a window")

    def _expire(self, now_seconds: float) -> None:
        """Drop every timestamp that has slid out of the trailing window."""
        horizon = now_seconds - self.window_seconds
        self._spent_at = [moment for moment in self._spent_at if moment > horizon]

    def spent_in_window(self, now_seconds: float) -> int:
        """Return how many calls were made in the last `window_seconds` as of `now_seconds`."""
        self._expire(now_seconds)
        return len(self._spent_at)

    def has_room(self, now_seconds: float) -> bool:
        """Return whether one more call fits inside the trailing window right now."""
        return self.spent_in_window(now_seconds) < self.ceiling

    def seconds_until_room(self, now_seconds: float) -> float:
        """Return how long to wait before one more call fits — `0.0` when it already does.

        The oldest timestamp in the window is the one that frees a slot when it expires, so the
        wait is exactly how long that one has left. Computed rather than guessed: a fixed pause
        here would be the blind recoil `RS-3.2` forbids one layer up.
        """
        if self.has_room(now_seconds):
            return 0.0
        oldest = min(self._spent_at)
        return max(0.0, (oldest + self.window_seconds) - now_seconds)

    def spend(self, now_seconds: float) -> None:
        """Record one call, REFUSING when the window is full (`RS-3.1`).

        Refusing rather than counting-and-warning is the point: a counter that lets the call
        through and logs about it is a counter the collector can ignore, and the DoD asks for a
        collector that *recusa ultrapassar 40 u/60 s*, not one that reports having done it.
        """
        if not self.has_room(now_seconds):
            raise QuotaExhaustedError(
                f"{self.spent_in_window(now_seconds)} calls already spent in the trailing "
                f"{self.window_seconds:g}s window (ceiling {self.ceiling}, bucket "
                f"{COINALYZE.identifier!r}): a 41st call inside one sliding window is the 429 "
                f"this counter exists to never take"
            )
        self._spent_at.append(now_seconds)


# ── `RS-3.6` — SPREAD ACROSS THE CADENCE, NEVER A BURST ────────────────────────────────────


def spread_interval_seconds(
    cycle_seconds: float, n_calls: int, floor_seconds: float | None = None
) -> float:
    """Return the pause BETWEEN two calls so a cycle's calls fill the cadence instead of its head.

    `n` calls take `n - 1` pauses — the same asymmetry `LocalQuotaBroker.total_seconds_for` and
    the ramp's load loop both carry: the pause follows a call and precedes the next, so the last
    call of a cycle does not wait for a call that never comes.

    `floor_seconds` defaults to `LocalQuotaBroker(QUOTA_CEILING, QUOTA_WINDOW_SECONDS)
    .interval_seconds` — `60/40 = 1,5 s`, the fixed pace that module derives for this same blind
    bucket. It is a FLOOR and not the answer: a 5-minute cadence with `N=10` spreads to `33,3 s`
    between calls, twenty times slower than the floor, and taking the floor there would be
    exactly the burst wearing an average that `RS-3.6` forbids.

    A cycle with one call has nothing to spread and returns `0.0`.
    """
    if cycle_seconds <= 0:
        raise InvalidCadenceError(f"cycle_seconds={cycle_seconds}: a cadence is a positive span")
    if n_calls < 0:
        raise InvalidCadenceError(f"n_calls={n_calls}: a negative call count does not exist")
    if n_calls <= 1:
        return 0.0
    floor = (
        floor_seconds
        if floor_seconds is not None
        else LocalQuotaBroker(
            calls_per_window=QUOTA_CEILING, window_seconds=QUOTA_WINDOW_SECONDS
        ).interval_seconds
    )
    return max(floor, cycle_seconds / n_calls)


# ── `RS-3.4` — THE NEWEST BUCKET IS STILL GROWING ──────────────────────────────────────────


def is_settled_bucket(bucket_start_seconds: int, observed_at_ms: int) -> bool:
    """Return whether a bucket has CLOSED — the only kind this collector is allowed to write.

    Coinalyze's `t` is the bucket's START (`liquidation_catalog.LIQUIDATION_LABEL_SHIFT_MS`,
    measured: at 14:14Z the `daily` series already carried `t = 2026-09-12T00:00:00Z` for a day
    that had not ended). So the newest bucket of any response is PARTIAL by construction, and it
    keeps growing after we read it.

    Writing it as final publishes a number that is still moving — and for a `Nature.FLOW`
    series that is not a rounding error: the same `bucket_end` would carry a different value on
    the next cycle, and `md.series`' `as_of` returns `argmin(observed_at)`, so the FIRST, most
    truncated reading is the one a reader gets forever. It is also the anti-lookahead rule
    inverted: a bucket published before it closed.
    """
    return (bucket_start_seconds + LIQUIDATION_BUCKET_SECONDS) * 1000 <= observed_at_ms


# ── THE WIRE POINTS, SPLIT INTO THE TWO INDEPENDENT SIDES (`ZL-1`) ─────────────────────────


def side_points(points: Sequence[DailyPoint], side: LiquidationSide) -> tuple[SidePoint, ...]:
    """Project the wire's `{t, l, s}` onto ONE side's sequence, in `t` order, raw digits kept.

    `ZL-1` is literal that the two sides are two INDEPENDENT sequences riding one bucket grid,
    and `classify_side_points` refuses points that are not strictly increasing precisely so a
    caller cannot hand it the two sides merged. This function is the split that makes obeying
    that cheap — and it keeps `raw_quantity` a STRING, so the provider's digits are parsed to
    `Decimal` exactly once, at classification, and never re-parsed downstream.

    A point missing the side's letter is a SCHEMA CHANGE, not an empty bucket: the provider
    documents `{t, l, s}` and a response without `l` is a different wire shape. Raising is the
    same refusal `parse_daily_points` makes for a missing `t` — "the provider changed" and
    "this bucket is empty" are different facts (`SPEC-001` §5.5).
    """
    projected: list[SidePoint] = []
    for point in points:
        letter = side.value
        if letter not in point.raw:
            raise MalformedCoinalizeResponseError(
                f"bucket t={point.timestamp_epoch_seconds} has no {letter!r} field: the "
                f"documented wire shape of {LIQUIDATION_HISTORY_PATH} is {{t, l, s}}, so its "
                f"absence is a schema change and not an empty bucket"
            )
        projected.append(
            SidePoint(
                event_time=point.timestamp_epoch_seconds,
                raw_quantity=str(point.raw[letter]),
            )
        )
    return tuple(projected)


# ── `RS-3.7` — A SYMBOL ASKED FOR AND NOT ANSWERED IS A GAP, NEVER A SHRUG ─────────────────


def unanswered_symbols(requested: Sequence[str], answered: Iterable[str]) -> tuple[str, ...]:
    """Return the requested symbols the provider did not answer for, in request order.

    ⛔ THIS IS NOT DEFENSIVE PROGRAMMING — IT IS A MEASURED BEHAVIOUR OF THIS PROVIDER. A call
    for 20 symbols came back with 19, and a call for 40 came back with 38
    `[DOC: MEDIÇÃO §3.1]`. The response carries no error, no code and no note about the
    missing ones: the array is simply shorter. A collector that trusted `len(response)` would
    drop a symbol off the panel with nothing anywhere saying it had been dropped — which is
    the silent-`rc=0` failure `ADR-012` names, and the reason the answer is an `IngestGap`
    (`postgres_ingest_record_store.record_gap`) rather than a log line.
    """
    answered_set = set(answered)
    return tuple(symbol for symbol in requested if symbol not in answered_set)


def answered_symbols(body: bytes) -> tuple[str, ...]:
    """Return the symbols the response actually carries an ENTRY for, answered or empty.

    ⛔ THIS IS NOT `len(parse_daily_points(body))`, AND THE DIFFERENCE IS THE WHOLE OF `RS-3.7`.
    `parse_daily_points` returns `()` for BOTH `[]` (the provider ignored the symbol) and
    `[{"symbol": "X", "history": []}]` (the provider answered, and this symbol had no
    liquidation in the window). The first is a gap; the second is the 79,8% of quiet minutes
    this series is made of `[MEDIDO 2026-09-12, n=14.344 buckets, 2.900 preenchidos]`. A
    collector that read the point count alone would file a gap for every quiet symbol — and
    would file NO gap when the provider really did drop one, because the symptom is identical.

    So this reads the OUTER shape only: which symbols the array mentions. A body that is not
    a JSON array of objects is a schema change and raises, the same refusal
    `parse_daily_points` makes — never a silent empty tuple, which would report every symbol
    as unanswered and bury the real finding in noise.
    """
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as failure:
        raise MalformedCoinalizeResponseError(
            f"body is not valid JSON: {type(failure).__name__}: {failure}"
        ) from failure
    if not isinstance(payload, list):
        raise MalformedCoinalizeResponseError(
            f"expected body as a list, got {type(payload).__name__}"
        )
    names: list[str] = []
    for index, entry in enumerate(payload):
        if not isinstance(entry, dict) or "symbol" not in entry:
            shape = sorted(entry) if isinstance(entry, dict) else type(entry).__name__
            raise MalformedCoinalizeResponseError(
                f"element {index} missing 'symbol' field: {shape}"
            )
        names.append(str(entry["symbol"]))
    return tuple(names)


# ── `RS-3.3` — RETRY THE PAIR THAT FAILED, NEVER THE CYCLE ─────────────────────────────────


@dataclass
class RetryLedger:
    """Attempts counted PER `(symbol, endpoint)`, which is the unit `RS-3.3` fixes (`D4`, owner).

    ⛔ WHY NOT RETRY THE CYCLE. A cycle of `N=10` costs 10 units. Re-running it because ONE
    symbol failed spends 10 units to re-fetch 9 answers we already have, inside the same sliding
    window that just paid for them — 20 units for 10 symbols, and the budget is blown by
    construction rather than by bad luck. Retrying the one pair costs 1.

    `max_attempts` counts TOTAL attempts, not extra ones, so `2` means "the original call and one
    retry". A pair that exhausts its attempts stops being retried THIS cycle and comes back
    naturally on the next one — a REST history is re-readable at will (`ADR-036/D4`'s whole
    argument), so nothing is lost by waiting one cadence, and an unbounded retry inside one
    cycle would be the burst this module exists to prevent.
    """

    max_attempts: int = 2
    _attempts: dict[tuple[str, str], int] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        """Reject a ledger that would permit no attempt at all."""
        if self.max_attempts < 1:
            raise ValueError(
                f"max_attempts={self.max_attempts}: a pair that may not be attempted once is "
                f"not a retry policy, it is a disabled collector"
            )

    def attempts(self, symbol: str, endpoint: str) -> int:
        """Return how many attempts this pair has already spent in this ledger."""
        return self._attempts.get((symbol, endpoint), 0)

    def record_attempt(self, symbol: str, endpoint: str) -> int:
        """Count one attempt against this pair and return the new total."""
        key = (symbol, endpoint)
        self._attempts[key] = self._attempts.get(key, 0) + 1
        return self._attempts[key]

    def may_retry(self, symbol: str, endpoint: str) -> bool:
        """Return whether this pair — and ONLY this pair — has an attempt left."""
        return self.attempts(symbol, endpoint) < self.max_attempts

    def reset(self) -> None:
        """Forget every attempt, at the start of a new cycle."""
        self._attempts.clear()
