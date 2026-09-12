"""One liquidation collection cycle: the seven `RS-3.*` requirements, composed and nothing else.

`T-05.5`, plan `05` item 5.3. The policy lives in `domain/liquidation_collection.py`, the recoil
in `domain/recoil_policy.py`, the zero-vs-silence rule in `domain/liquidation_zero_legitimacy.py`.
This module wires them into ONE pass over the symbol universe, and it holds no clock and no
socket of its own — `clock` and `source` are injected ports, which is what lets the whole cycle,
including the `429` path and the quota refusal, run offline with literals (`backend/scripts/
test.sh`'s "ZERO REDE").

── THE ONE THING A READER SHOULD CHECK FIRST: WHY THE RETRY REPEATS ON `unmet_seconds` ────────

`domain/recoil_policy.py`'s header carries a warning addressed to exactly this module:

    "Capping the sleep is safe HERE because this ramp stops at the first `429` and never
     resumes — a shorter pause sends no request. A broker in regime DOES resume, and resuming
     after `seconds` when `unmet_seconds > 0` would hit the provider before it said to."

So `_serve_the_recoil` below loops until the decision is `honoured_in_full`, sleeping `seconds`
at a time. Resuming on `seconds` alone would take the cap as permission — the provider asked for
more, the cap is OUR guarantee about a single sleep, and the two are not the same number.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Protocol

from src.modules.sentimento.domain.coinalyze_daily_series import (
    DailyPoint,
    MalformedCoinalizeResponseError,
    parse_daily_points,
    to_coinalyze_symbol,
)
from src.modules.sentimento.domain.liquidation_collection import (
    COHORT_BY_SIDE,
    LIQUIDATION_HISTORY_PATH,
    RetryLedger,
    SlidingQuotaWindow,
    answered_symbols,
    is_settled_bucket,
    liquidation_history_path,
    side_points,
    spread_interval_seconds,
    unanswered_symbols,
)
from src.modules.sentimento.domain.liquidation_zero_legitimacy import (
    LiquidationSide,
    classify_side_points,
)
from src.modules.sentimento.domain.recoil_policy import RecoilPolicy, parse_retry_after

# `RS-3.5`: the cadence is CONFIGURATION, and this is only the default the SPEC adopted —
# `SPEC-007` §6.3, 5 minutes, which at `N = 10` spends `2 u/min` = 5% of the measured ceiling.
# `infra/collectors_cli.py` reads it from the environment; nothing here hardcodes a schedule.
DEFAULT_CYCLE_SECONDS: float = 300.0

# How far back each cycle asks for. Wider than the cadence ON PURPOSE, and the width is FREE:
# a request costs the same one unit whether it covers 5 buckets or 1.800
# `[MEDIDO 2026-09-10, MEDICAO §4.2.3-§4.2.5: 4 chamadas de 1.800 buckets custaram as mesmas 40
# unidades que 4 de 5 buckets]`. That is the whole recoverability argument of `ADR-036/D4`: a
# collector three hours down catches up in one call per symbol. The margin also covers the
# newest bucket that `RS-3.4` refuses to write, which would otherwise be re-asked-for and never
# arrive settled.
DEFAULT_LOOKBACK_SECONDS: int = 3 * 60 * 60


@dataclass(frozen=True)
class LiquidationFetch:
    """What ONE call to `/v1/liquidation-history` produced — a dispatch XOR a failure to dispatch.

    Same control as `CoinalizeHistoryResponse` and `RawPremiumIndexFetch`, restated at this layer
    because `use_cases` may not import `infra`: "the request never left this machine" and "the
    request left and we did not like the answer" are different findings, and one optional field
    would collapse them into the same silence.

    `retry_after` is the RAW header, unparsed. Parsing belongs to `recoil_policy.parse_retry_after`,
    which knows both legal forms and treats junk as absent — a second parser here would be a
    second place the `RFC 9110` date form could be forgotten.
    """

    status: int | None = None
    body: bytes = b""
    retry_after: str | None = None
    transport_error: str | None = None

    def __post_init__(self) -> None:
        """Reject a fetch that is neither a dispatch nor a failure to dispatch."""
        if (self.status is None) == (self.transport_error is None):
            raise ValueError(
                "a fetch must carry an HTTP status OR a transport error, never both nor neither"
            )

    @property
    def is_success(self) -> bool:
        """Return whether the provider answered `2xx`."""
        return self.status is not None and 200 <= self.status < 300

    @property
    def is_throttled(self) -> bool:
        """Return whether the provider refused for rate — the only status that earns a recoil."""
        return self.status == 429


class LiquidationHistorySource(Protocol):
    """Port: one GET against a built path. `infra` implements it; tests script it."""

    def fetch(self, path: str) -> LiquidationFetch: ...  # noqa: D102


class CollectorClock(Protocol):
    """Port: the three instants this cycle needs, none of them read from a module-level clock.

    `provenance.py` is literal that every instant in this package is an INJECTED VALUE
    (`ADR-016/D1`: "mesmo codigo, outra maquina, outra resposta"), and it is what makes the
    quota window, the spread and the `429` recoil testable without a real second passing.
    """

    def monotonic(self) -> float: ...  # noqa: D102

    def epoch_ms(self) -> int: ...  # noqa: D102

    def sleep(self, seconds: float) -> None: ...  # noqa: D102


# Called once per (cohort, settled bucket) with the raw digits the provider sent. The composition
# root turns it into a `SeriesRow`; this module never builds one, because a `SeriesRow` needs a
# `SeriesKey`, an observer and an `observed_at` that belong to the caller.
PublishPoint = Callable[[str, str, int, str], None]


@dataclass(frozen=True)
class LiquidationCycleResult:
    """What one pass measured — the operands of `build_liquidation_history_run`, and the gaps.

    `n_returned` and `n_published` stay SEPARATE for the reason `_KlinesPassTotals` states: their
    difference is the size of what `RS-3.4` (unsettled) and `ZL-2` (a side never seen operating)
    refused, and collapsing them would make both refusals invisible in the record an operator
    reads.

    `notes` is the reason a REJECTED verdict would name (`T-05.6`/`RS-4`). It is populated on
    every failure path, not just the fatal one, so a cycle that ends `ACCEPTED_WITH_WARNING`
    still records WHY it warned.
    """

    n_returned: int = 0
    n_published: int = 0
    n_calls: int = 0
    n_throttled: int = 0
    api_code: int | None = None
    unanswered: tuple[str, ...] = ()
    notes: str | None = None
    src_sha256: str = hashlib.sha256(b"").hexdigest()


@dataclass
class LiquidationCollectorState:
    """What survives BETWEEN cycles — the two facts a single pass cannot know on its own.

    `seen_nonzero` is `ZL-2`'s memory per `(symbol, side)`: a side this process has already seen
    report a real non-zero. Without it, a five-minute window that happens to start quiet would
    demote that side's legitimate `ZL-3` zeros back to `NO_SOURCE` every cycle, and the same
    bucket would be a value or an absence depending only on where the window began.

    `quota` is the sliding window itself, which is meaningless per-cycle by definition: its whole
    job is to remember calls made in the previous 60 seconds, and a cycle boundary is not a
    quota boundary.
    """

    quota: SlidingQuotaWindow = field(default_factory=SlidingQuotaWindow)
    seen_nonzero: set[tuple[str, str]] = field(default_factory=set)


def _serve_the_recoil(
    policy: RecoilPolicy, clock: CollectorClock, throttle_index: int, retry_after_raw: str | None
) -> float:
    """Sleep out one `429`, IN FULL, and return the total time slept.

    Loops on `unmet_seconds`, never on `seconds` — see the module docstring. `cap_seconds`
    bounds a SINGLE sleep so an operator can predict the longest block; it is not a licence to
    resume before the provider said to, and a provider that asked for more than the cap gets the
    rest of its request served by the next turn of this loop.

    `Retry-After` is obeyed from the RESPONSE (`RS-3.2`). A fixed blind back-off is forbidden and
    the waste is measured: observed values were 49,1 s / 56,8 s / 59,0 s `[DOC: MEDICAO §3]`, so
    a flat 60 s throws away ~18% of the window against the first of them.
    """
    slept = 0.0
    # EPOCH seconds, never `monotonic()`: `Retry-After` has a legal HTTP-DATE form, and
    # `parse_retry_after` subtracts `now` from that absolute instant. A monotonic reading is an
    # arbitrary origin, so the date form would produce a pause off by decades in either
    # direction — and the seconds form would look perfectly fine, which is how the defect would
    # survive a test that only exercised the common case.
    requested = parse_retry_after(retry_after_raw, clock.epoch_ms() / 1000.0)
    decision = policy.decide(throttle_index, requested)
    while True:
        clock.sleep(decision.seconds)
        slept += decision.seconds
        if decision.honoured_in_full:
            return slept
        decision = policy.decide(throttle_index, decision.unmet_seconds)


def _publish_settled_points(
    *,
    binance_symbol: str,
    points: Sequence[DailyPoint],
    observed_at_ms: int,
    state: LiquidationCollectorState,
    publish: PublishPoint,
) -> int:
    """Write every SETTLED, legitimately-valued bucket of both sides; return how many.

    THREE refusals happen here and each one is a different fact:

    - `RS-3.4`: the newest bucket has not closed, so it is dropped — not written and not a gap.
      It arrives settled on a later cycle, which is free because the window's width costs
      nothing.
    - `ZL-2`: a side that has never once reported a non-zero is SILENT, not zero. Dropping it
      leaves `SEM_PONTO`, which is what the read path is built to show.
    - a `ZL-3` legitimate zero IS written, because a side that has proved it can report tells
      the truth when it reports nothing — and `SEM_PONTO` there would erase a real observation.

    The two sides are classified INDEPENDENTLY (`ZL-1`): they are two sequences riding one grid,
    and `classify_side_points` refuses merged input precisely so this cannot be done by accident.
    """
    published = 0
    for side in LiquidationSide:
        cohort = COHORT_BY_SIDE[side]
        raw_side = side_points(points, side)
        settled = tuple(
            point for point in raw_side if is_settled_bucket(point.event_time, observed_at_ms)
        )
        memory_key = (binance_symbol, side.value)
        classified = classify_side_points(settled, seen_nonzero=memory_key in state.seen_nonzero)
        for point in classified:
            if point.value is None:
                continue
            if point.value != Decimal(0):
                state.seen_nonzero.add(memory_key)
            publish(binance_symbol, cohort, point.event_time, str(point.value))
            published += 1
    return published


@dataclass
class _SymbolOutcome:
    """One `(symbol, endpoint)` pair's contribution to the cycle."""

    n_returned: int = 0
    n_published: int = 0
    n_calls: int = 0
    n_throttled: int = 0
    api_code: int | None = None
    answered: bool = False
    note: str | None = None


def _spend_one_call(
    *,
    state: LiquidationCollectorState,
    clock: CollectorClock,
    source: LiquidationHistorySource,
    path: str,
) -> LiquidationFetch:
    """Wait for room in the sliding window, count the call, and issue it (`RS-3.1`).

    The wait is COMPUTED from the window's own oldest timestamp, never a fixed pause: the window
    knows exactly when a slot frees, and guessing here would be the blind back-off `RS-3.2`
    forbids one layer down.
    """
    now = clock.monotonic()
    if not state.quota.has_room(now):
        clock.sleep(state.quota.seconds_until_room(now))
        now = clock.monotonic()
    state.quota.spend(now)
    return source.fetch(path)


def _collect_one_symbol(
    *,
    binance_symbol: str,
    state: LiquidationCollectorState,
    source: LiquidationHistorySource,
    clock: CollectorClock,
    ledger: RetryLedger,
    recoil: RecoilPolicy,
    publish: PublishPoint,
    digest: hashlib._Hash,
    lookback_seconds: int,
) -> _SymbolOutcome:
    """Fetch, parse and publish ONE symbol, retrying THIS PAIR ONLY when it fails (`RS-3.3`).

    ⛔ THE RETRY UNIT IS THE PAIR, AND THAT IS AN OWNER DECISION (`D4`), NOT A PREFERENCE. A
    cycle of `N = 10` costs 10 units; re-running it because one symbol failed spends 10 to
    re-fetch 9 answers already in hand, inside the same sliding window that just paid for them.
    The budget would be blown by construction rather than by bad luck.
    """
    outcome = _SymbolOutcome()
    coinalyze_symbol = to_coinalyze_symbol(binance_symbol)
    observed_at_ms = clock.epoch_ms()
    to_epoch = observed_at_ms // 1000
    path = liquidation_history_path(coinalyze_symbol, to_epoch - lookback_seconds, to_epoch)
    while ledger.may_retry(binance_symbol, LIQUIDATION_HISTORY_PATH):
        ledger.record_attempt(binance_symbol, LIQUIDATION_HISTORY_PATH)
        fetch = _spend_one_call(state=state, clock=clock, source=source, path=path)
        outcome.n_calls += 1
        if fetch.transport_error is not None:
            outcome.note = f"{binance_symbol}: transport: {fetch.transport_error}"
            continue
        if fetch.is_throttled:
            outcome.n_throttled += 1
            outcome.api_code = fetch.status
            outcome.note = f"{binance_symbol}: HTTP 429, recoil obeyed Retry-After"
            _serve_the_recoil(recoil, clock, outcome.n_throttled - 1, fetch.retry_after)
            continue
        if not fetch.is_success:
            outcome.api_code = fetch.status
            outcome.note = f"{binance_symbol}: HTTP {fetch.status}"
            continue
        digest.update(fetch.body)
        try:
            points = parse_daily_points(fetch.body)
            # `RS-3.7`: whether the provider MENTIONED this symbol, which is a different
            # question from whether it had any liquidation to report — see `answered_symbols`.
            outcome.answered = len(answered_symbols(fetch.body)) > 0
        except MalformedCoinalizeResponseError as failure:
            outcome.note = f"{binance_symbol}: malformed body: {failure}"
            continue
        outcome.n_returned = len(points)
        outcome.n_published = _publish_settled_points(
            binance_symbol=binance_symbol,
            points=points,
            observed_at_ms=observed_at_ms,
            state=state,
            publish=publish,
        )
        return outcome
    return outcome


def collect_liquidation_history_once(
    *,
    symbols: Sequence[str],
    source: LiquidationHistorySource,
    clock: CollectorClock,
    state: LiquidationCollectorState,
    recoil: RecoilPolicy,
    publish: PublishPoint,
    ledger: RetryLedger | None = None,
    cycle_seconds: float = DEFAULT_CYCLE_SECONDS,
    lookback_seconds: int = DEFAULT_LOOKBACK_SECONDS,
) -> LiquidationCycleResult:
    """Run ONE pass over `symbols`, spread across the cadence, never bursting (`RS-3.6`).

    ⚠️ MÉDIA NÃO É PICO, and the spread is the whole reason this loop sleeps between symbols
    instead of iterating as fast as the network allows. At `N = 10` and a 5-minute cadence the
    AVERAGE spend is `2 u/min` — 5% of the ceiling. Firing those ten back to back still puts ten
    units inside one 60-second sliding window, so a `429` retry landing in that same minute
    meets a window that is a quarter full, and the average says nothing about it. The pause is
    `cycle_seconds / n_calls`, floored at the blind bucket's own `60/40 = 1,5 s` pace.

    `n - 1` pauses for `n` calls: the last symbol is not followed by a wait for a call that will
    never come, the same asymmetry `LocalQuotaBroker.total_seconds_for` carries.
    """
    ledger = ledger if ledger is not None else RetryLedger()
    ledger.reset()
    digest = hashlib.sha256()
    pause = spread_interval_seconds(cycle_seconds, len(symbols))
    answered: list[str] = []
    notes: list[str] = []
    totals = LiquidationCycleResult()
    for index, symbol in enumerate(symbols):
        if index > 0:
            clock.sleep(pause)
        outcome = _collect_one_symbol(
            binance_symbol=symbol,
            state=state,
            source=source,
            clock=clock,
            ledger=ledger,
            recoil=recoil,
            publish=publish,
            digest=digest,
            lookback_seconds=lookback_seconds,
        )
        if outcome.answered:
            answered.append(symbol)
        if outcome.note is not None:
            notes.append(outcome.note)
        totals = LiquidationCycleResult(
            n_returned=totals.n_returned + outcome.n_returned,
            n_published=totals.n_published + outcome.n_published,
            n_calls=totals.n_calls + outcome.n_calls,
            n_throttled=totals.n_throttled + outcome.n_throttled,
            api_code=totals.api_code if totals.api_code is not None else outcome.api_code,
        )
    unanswered = unanswered_symbols(symbols, answered)
    if unanswered:
        # `RS-3.7`. NOT a log line: a symbol asked for and not answered is an absence with a
        # shape, and `md.ingest_gap` is where an absence with a shape belongs. The provider
        # signals nothing — a call for 20 came back with 19 `[DOC: MEDICAO §3.1]` — so this note
        # and the gap the caller records are the ONLY places it is ever visible.
        notes.append(f"unanswered symbols: {','.join(unanswered)}")
    return LiquidationCycleResult(
        n_returned=totals.n_returned,
        n_published=totals.n_published,
        n_calls=totals.n_calls,
        n_throttled=totals.n_throttled,
        api_code=totals.api_code,
        unanswered=unanswered,
        notes="; ".join(notes) if notes else None,
        src_sha256=digest.hexdigest(),
    )
