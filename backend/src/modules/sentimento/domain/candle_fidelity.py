"""`candle_fidelity` — the stored `klines_ohlc` candle compared against the ORIGIN's own kline."""
#
#
# `T-01.7` (`CST-203`), `DoD 9` of plan `01`, `SPEC-008`/`A-8`, and it exists because of a
# MEASURED finding, not a worry: `docs/context/candle-real-e-eixo-unico/gates/
# ACHADO-vela-viva-diverge-da-origem.md` recorded four stored buckets whose interval did not
# contain the origin's `low` (`+41,00` at `21:13`), beside `[M-9]`'s measurement that the sibling
# `klines_volume` off the SAME array understates the origin by `-2,2%`..`-4,5%` with `pos=0` in
# `4/4` buckets.
#
# ⛔ THIS MODULE DOES NOT FIX ANYTHING. The root cause is `ADR-034` + `/architect` (`[M-9]`).
# What it does is stop the feature from propagating the defect in SILENCE onto the price — the
# difference between declared debt and a new defect. It is a MEASURING instrument, and every
# number it produces travels with the universe it swept.
#
# ── THE TOLERANCE, DECLARED, WITH THE REASON ────────────────────────────────────────────────
#
# `EXACT`. Zero. Not a percentage, not a tick.
#
# The justification is in the code path, not in taste: `use_cases/collector_series_mapping.
# build_klines_to_rows` publishes `value_raw = kline.open_price`…`kline.close_price`, the
# SOURCE'S OWN DECIMAL STRING, copied verbatim off the array `infra/binance_klines_client.py`
# preserved whole. There is no arithmetic anywhere between the origin's byte and the stored byte
# — no unit conversion, no rounding, no float. A path that only copies has exactly one faithful
# outcome, and it is equality. Any tolerance above zero here would be a budget for a defect that
# has no mechanism to produce it, and it would swallow the very finding this task was written
# against (`+41,00` would survive a 0,1% tolerance on an `81.000` price: `81` > `41`).
#
# ⚠️ THE COMPARISON IS ON `Decimal`, NOT ON THE STRING, and that is not a weakening of the
# tolerance — it is what makes the tolerance MEAN "same value". `"81001.10"` and `"81001.1"` are
# two spellings of one number; the exchange is free to change its own trailing zeros without
# changing what it quoted, and a byte comparison would report that as a fidelity defect. `float`
# is refused for the reason the whole module chain refuses it: `Decimal("80960.00")` is the
# number the venue quoted, `float("80960.00")` is the nearest binary approximation of it.
#
# ── WHAT `pos=0` MEANS HERE, AND WHY THE SIGN IS COUNTED SEPARATELY FROM THE MAGNITUDE ───────
#
# A copy that drifts is impossible; a copy of the WRONG BUCKET is not. The signature that tells
# the two apart is the SIGN DISTRIBUTION: noise straddles zero, while a snapshot taken inside the
# bar and stored as final is WRONG IN ONE DIRECTION — the `HIGH` cannot yet have reached its
# maximum and the `LOW` cannot yet have reached its minimum, so `stored_high <= origin_high` and
# `stored_low >= origin_low` on EVERY bucket. `[M-9]` measured exactly that shape on the volume
# sibling (`pos=0` in `4/4`). `unilateral_bias` below is that test, and it is reported per
# `Reduction` because the four readings fail in different directions.
#
# ── ⛔ WHAT THE ACHADO'S "DEFEITO 1" IS **NOT** SUFFICIENT EVIDENCE OF ───────────────────────
#
# The finding recorded two ADJACENT grid instants carrying byte-identical values across all four
# reductions and read it as "the same kline stored under two `event_time`". That inference does
# NOT follow from the observation, and this module is written so the next reader cannot repeat
# it: `/series-history` serves a FIXED one-minute report grid whose rows are `as_of` readings at
# each grid instant (`domain/series_history_report.SeriesHistoryRow`: "`event_time` is the GRID
# INSTANT … never the raw `event_time` column of the winning observation"), and `klines_ohlc` is
# `nature=STOCK` with `max_staleness_ms = 120_000` — "twice the native grid … a reader may `LOCF`
# at most one missed bar before the row is stale" (`domain/klines_ohlc_catalog.py`). So ONE
# stored bar legitimately answers TWO adjacent grid instants, by design, and a pair of identical
# adjacent rows is the DESIGNED staircase, not evidence of a duplicate write.
#
# `repeat_runs` below therefore reports that structure as a DIAGNOSTIC and never as a finding: a
# run of length 2 is the bound the catalog declares, and only a run of length 3 or more exceeds
# what `LOCF` is allowed to produce. What DOES morde in either case is the comparison against the
# origin — a carried bar and a duplicated bar are both WRONG against the origin bucket of the
# instant they answer, and that is the assertion this module makes.
#
# ── HOW THE TWO WRITE PATHS ARE SEPARATED (the `[NAO MEDIDO]` the achado left open) ──────────
#
# The backfill CLI (`infra/klines_backfill_cli.py`) and the collector
# (`infra/collectors_cli._run_klines_collector`) share `build_klines_to_rows`, so "which path
# produced it" has three answers and they cost different repairs. Two of them are separated HERE,
# by a field already on the wire, and the third is separated by a test rather than by data:
#
#   * THE SHARED MAPPING is exonerated (or convicted) OFFLINE, with no network and no database:
#     feed one origin page through `build_klines_to_rows` and compare the four published
#     `value_raw` against the four fields of the same array. `backend/tests/sentimento/
#     test_candle_fidelity.py::test_the_shared_mapping_copies_the_four_origin_prices_verbatim`
#     is that test, and swapping the `HIGH`/`LOW` accessors kills it.
#   * WHICH PATH WROTE A GIVEN STORED POINT is read off `available_at - event_time`, the
#     publication lag. A live tail pass stamps `available_at` with its own clock moments after
#     the bucket closed; a replay walk stamps a bucket that closed hours or days earlier with
#     the clock of the walk. The two are separated by THREE ORDERS OF MAGNITUDE, so the bound
#     below does not need to be precise to be decisive.
#
# ⚠️ `REPLAY` COVERS TWO PRODUCERS, NOT ONE, and saying otherwise would be the cheap half-answer:
# the standalone backfill CLI AND the collector's own boot backfill (`backfill_days`, re-read on
# every restart) both stamp old buckets with the clock of the moment. Telling THOSE two apart
# needs `run_id`/`md.ingest_run`, which is not on this wire — `[NAO MEDIDO]` here, and named so.

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_MAX_STALENESS_MS,
    KLINES_OHLC_NATIVE_GRID_MS,
    KLINES_OHLC_REDUCTIONS,
)
from src.modules.sentimento.domain.series_key import Reduction

# How many grid instants one stored bar may legitimately answer, INCLUDING its own. Derived
# from the two constants the catalog already declares rather than typed as a literal, so the
# day `max_staleness_ms` moves this bound moves with it instead of silently disagreeing:
# `120_000 / 60_000 = 2` — the bar's own instant plus one carried instant (`SPEC-001` §3.2,
# "one missed bar is latency, two are a gap").
MAX_LOCF_RUN_LENGTH: Final[int] = KLINES_OHLC_MAX_STALENESS_MS // KLINES_OHLC_NATIVE_GRID_MS

# The publication lag above which a stored point was written by a REPLAY and not by the live
# tail. Three native grid steps.
#
# THE NUMBER COMES FROM THE COLLECTOR'S OWN SHAPE, not from a guess: `_tail_limit` asks for
# `bars_per_cycle + _KLINES_TAIL_MARGIN_BARS` = `1 + 2 = 3` bars per 60-second cycle, and
# `is_closed_bucket` drops the newest (in-progress) one, so the OLDEST bar a live pass can
# publish is two grid steps old. The third step is slack for the duration of the pass itself.
#
# It does not need to be tight, and that is the point: a replay of a 90-day window stamps
# buckets whose lag is measured in HOURS TO DAYS (`>= 3.600.000 ms`), so any bound between one
# cycle and one hour classifies the same way. A bound that had to be precise to be correct
# would be a bound that fails quietly when the cadence changes.
LIVE_TAIL_PUBLICATION_BOUND_MS: Final[int] = 3 * KLINES_OHLC_NATIVE_GRID_MS


class CandleFidelityError(Exception):
    """The comparison cannot be performed at all, so it returns nothing rather than a verdict."""


class WriterTrace(Enum):
    """Which KIND of write put a stored point there, as read off its publication lag."""

    LIVE_TAIL = "live_tail"
    """Published within `LIVE_TAIL_PUBLICATION_BOUND_MS` of the instant it answers — the
    60-second cycle of `_run_klines_collector` polling the tail of `/fapi/v1/klines`."""

    REPLAY = "replay"
    """Published long after the bucket closed — the standalone `klines_backfill_cli` walk OR
    the collector's own boot backfill. `[NAO MEDIDO]`: which of those two, from this field."""

    CARRIED = "carried"
    """Published BEFORE the instant it answers, so it is not an observation OF that instant at
    all — it is the `LOCF` carry of an earlier bucket, and the negative lag PROVES it.

    ⛔ THE PROOF IS ARITHMETIC, NOT A HEURISTIC. `build_klines_to_rows` stamps `available_at`
    with the collector's clock at publication and publishes only buckets `is_closed_bucket`
    admits (`close_time_ms < received_at`), so a written row always has
    `available_at >= bucket_end`. A served cell with `available_at < event_time` therefore
    CANNOT be an observation stamped on that grid instant; the only thing `as_of` can be
    answering with is an earlier bucket carried forward.

    `[MEDIDO 2026-09-19, this harness on the live tail]`: the achado's own `21:13` cell came
    back with `lag_ms = -53.993` — one grid step minus the collector's ~6 s publication lag,
    which is the carry of the bucket before it, to the millisecond."""

    UNKNOWN = "unknown"
    """No `available_at` on the wire, which `SeriesHistoryRow` guarantees only for an ABSENT
    row. A present value with no `available_at` is a contract break, not a classification."""


class FidelityVerdict(Enum):
    """The three answers, and `NOT_MEASURED` is deliberately NOT a shade of green."""

    FAITHFUL = "faithful"
    REJECTED = "rejected"
    NOT_MEASURED = "not_measured"
    """No stored point in the window, so NOTHING WAS COMPARED. `ADR-012` names the failure this
    member exists to prevent: `rc=0` over an empty universe is indistinguishable between
    "nothing diverged" and "the instrument never looked", and the second is what an empty
    window actually is. A caller must map this onto a refusal (`rc=3`), never onto success."""


@dataclass(frozen=True)
class OriginCandle:
    """One `/fapi/v1/klines` bucket as the ORIGIN published it — the ground truth of the assert.

    `open_time_ms` is the source's own label, the FIRST millisecond of the bucket. The instant
    this repository stamps the same bucket on is `bucket_end` (`ceil(close_time/B)*B`, one
    native grid step later), which is what `event_time` means on the report grid — see
    `origin_bucket_end` for why the shift is stated once, here, instead of at each call site.
    """

    open_time_ms: int
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal

    def __post_init__(self) -> None:
        """Refuse a bucket the ORIGIN itself could not have published — `low <= high`.

        This guard is about the FIXTURE, not about our data: a comparison run against an origin
        whose own interval is inverted would report divergences that say nothing about this
        repository. An impossible ground truth must fail loudly at construction rather than
        become the denominator of a percentage.
        """
        if self.low > self.high:
            raise CandleFidelityError(
                f"origin bucket at open_time={self.open_time_ms} has low={self.low} above "
                f"high={self.high}, which no exchange publishes: the GROUND TRUTH of this "
                f"comparison is malformed, so any verdict drawn from it would be meaningless"
            )

    @property
    def bucket_end(self) -> int:
        """Return the instant this repository stamps this bucket on — the report grid's `t`."""
        return origin_bucket_end(self.open_time_ms)

    def price_of(self, reduction: Reduction) -> Decimal:
        """Return the origin price this `Reduction` names, refusing any other member.

        ⛔ THE PAIRING OF `Reduction` TO FIELD IS THE WHOLE RISK OF THIS FILE, the same risk
        `KLINES_OHLC_PRICE_READINGS` is written once for one layer up: `HIGH` reading `low`
        keeps the arity, keeps the type, passes `ruff` and `mypy`, and turns the assert into a
        generator of false findings that no exception ever reports. It is pinned by
        `test_candle_fidelity.py::test_each_reduction_reads_the_origin_field_of_its_own_name`.
        """
        prices: Mapping[Reduction, Decimal] = {
            Reduction.OPEN: self.open,
            Reduction.HIGH: self.high,
            Reduction.LOW: self.low,
            Reduction.CLOSE: self.close,
        }
        price = prices.get(reduction)
        if price is None:
            raise CandleFidelityError(
                f"{reduction!r} is not one of the four readings of a candle "
                f"({[r.value for r in KLINES_OHLC_REDUCTIONS]}), so this comparison has no "
                f"origin field to quote for it"
            )
        return price


@dataclass(frozen=True)
class StoredReading:
    """One cell of the `/series-history` report: one `Reduction` at one GRID instant.

    `value` and `absence` are the discriminated pair `SeriesHistoryRow` serves, carried here
    unchanged: exactly one of them is set. `available_at` is `None` exactly when the point is
    absent, which is the contract `SeriesHistoryRow`'s own docstring states.
    """

    reduction: Reduction
    event_time: int
    value: Decimal | None
    available_at: int | None
    absence: str | None = None

    def __post_init__(self) -> None:
        """Refuse a cell that is both a value and an absence, or neither."""
        if (self.value is None) == (self.absence is None):
            raise CandleFidelityError(
                f"stored reading {self.reduction.value}@{self.event_time} is either a value or "
                f"a named absence, never both and never neither: collapsing the two would let "
                f"a hole in the series be compared against the origin as if it were a number"
            )

    @property
    def writer_trace(self) -> WriterTrace:
        """Classify WHICH KIND of write produced this cell, from its publication lag."""
        lag = self.publication_lag_ms
        if lag is None:
            return WriterTrace.UNKNOWN
        if lag < 0:
            return WriterTrace.CARRIED
        if lag <= LIVE_TAIL_PUBLICATION_BOUND_MS:
            return WriterTrace.LIVE_TAIL
        return WriterTrace.REPLAY

    @property
    def publication_lag_ms(self) -> int | None:
        """Return `available_at - event_time`, or `None` for an absent cell.

        ⛔ ON A CARRIED CELL THIS GOES NEGATIVE, AND THAT IS THE MOST USEFUL THING IT DOES.
        `event_time` is the instant being ANSWERED, not the `bucket_end` of the observation
        answering it, so a cell carried one grid step forward reports its own lag MINUS one
        grid step. A written row cannot have `available_at < bucket_end` (see
        `WriterTrace.CARRIED`), so a negative value here is a PROOF of carry rather than a
        defect of this subtraction — and it is why the harness can tell the designed staircase
        apart from a bad write without ever seeing the observation's own `bucket_end`, which
        `/series-history` does not serve.

        For a cell that is NOT carried the subtraction is exact, because `event_time` is then
        the `bucket_end` the writer stamped.
        """
        if self.available_at is None:
            return None
        return self.available_at - self.event_time


@dataclass(frozen=True)
class ReadingDivergence:
    """One reading that did not equal the origin — the atom of a `REJECTED` verdict."""

    reduction: Reduction
    event_time: int
    origin_value: Decimal
    stored_value: Decimal
    writer_trace: WriterTrace
    publication_lag_ms: int | None

    @property
    def delta(self) -> Decimal:
        """Return `stored - origin`, signed. The SIGN is what `unilateral_bias` counts."""
        return self.stored_value - self.origin_value


@dataclass(frozen=True)
class SignCounts:
    """How the signed deltas of ONE `Reduction` were distributed — the bias test's operands."""

    positive: int
    negative: int
    zero: int

    @property
    def n(self) -> int:
        """Return how many buckets were compared for this reduction."""
        return self.positive + self.negative + self.zero

    @property
    def n_diverging(self) -> int:
        """Return how many of them diverged at all."""
        return self.positive + self.negative

    def unilateral_bias(self, *, minimum_n: int) -> bool:
        """Say whether every divergence fell on ONE side — the `[M-9]` signature.

        `minimum_n` is REQUIRED and has no default: `pos=0` over one diverging bucket is a coin
        flip, not a signature, and a default would let a caller report a coin flip as evidence.
        """
        if self.n_diverging < minimum_n:
            return False
        return self.positive == 0 or self.negative == 0


@dataclass(frozen=True)
class RepeatRun:
    """Consecutive grid instants answered by ONE AND THE SAME observation.

    ⛔ "SAME OBSERVATION" AND NOT "SAME NUMBER", AND THE DIFFERENCE WAS MEASURED, NOT ARGUED.
    The first version of this type folded runs on the VALUE alone and immediately reported two
    findings on the live tail that were not findings at all: `HIGH` held `81044.90` across
    `event_time` `…420000`, `…480000` and `…540000` with `available_at` `…422375`, `…482346`
    and `…542336` — THREE distinct observations, each with its own ~2,3 s publication lag,
    that simply agreed about the high of three quiet minutes `[MEDIDO 2026-09-19, this harness
    on the live tail, n=3 cells]`. A flat market is not a stuck reader, and an instrument that
    cannot tell them apart cries wolf on every quiet hour.

    Folding on `(value, available_at)` makes the run mean what its name says: one observation,
    stamped once, answering several instants. Two distinct bars published in the SAME page
    share `available_at` but differ in value, so they do not fold either.

    Reported for every `Reduction` as a DIAGNOSTIC. A run of `MAX_LOCF_RUN_LENGTH` is what the
    catalog's own `max_staleness_ms` authorises and is therefore not a finding; a longer run is
    a `LOCF` that outlived its declared bound and IS one. See the module docstring for why the
    achado's "two identical adjacent buckets" does not establish a duplicate write.
    """

    reduction: Reduction
    first_event_time: int
    length: int
    value: Decimal

    @property
    def exceeds_locf_bound(self) -> bool:
        """Say whether this run is longer than `LOCF` is allowed to produce."""
        return self.length > MAX_LOCF_RUN_LENGTH


@dataclass(frozen=True)
class CandleFidelityReport:
    """The whole measurement: the universe swept, what diverged, and the verdict over both."""

    symbol: str
    window_start_ms: int
    """The half-open window `[start, end)` this report swept, carried ON the report.

    A count without the window it was drawn over is not a measurement: `27 divergences` says
    nothing until the reader knows whether that was two hours or ninety days. It travels with
    the numbers so a line pasted into a gate block cannot lose it.
    """

    window_end_ms: int
    n_origin_buckets: int
    n_compared: int
    n_absent: int
    n_carried: int
    divergences: tuple[ReadingDivergence, ...]
    """Cells a WRITER is answerable for: the observation was stamped on the instant it
    answers, and it did not equal the origin. These, and only these, convict a write path."""

    carried_divergences: tuple[ReadingDivergence, ...]
    """Cells `as_of` answered by carrying an EARLIER bucket forward (`WriterTrace.CARRIED`),
    which then disagreed with the origin bucket of the minute they were drawn on.

    ⛔ THEY ARE REPORTED AND THEY DO NOT MOVE THE VERDICT, and the asymmetry is the whole
    correction this module makes to the achado. A carried cell disagreeing with a moving market
    is `LOCF` doing exactly what `max_staleness_ms = 120_000` authorises it to do; counting it
    as a fidelity defect would convict the writer for the reader's declared behaviour, and
    would make the harness reject every quiet gap in the collection. What it IS evidence of is
    a HOLE in the series at that minute — which is `DoD`'s coverage question, not this one."""

    sign_counts: Mapping[Reduction, SignCounts]
    repeat_runs: tuple[RepeatRun, ...]
    minimum_bias_n: int

    @property
    def verdict(self) -> FidelityVerdict:
        """Return the verdict, and NEVER `FAITHFUL` over an empty comparison."""
        if self.n_compared == 0:
            return FidelityVerdict.NOT_MEASURED
        if self.divergences or self.runs_exceeding_locf_bound:
            return FidelityVerdict.REJECTED
        return FidelityVerdict.FAITHFUL

    @property
    def runs_exceeding_locf_bound(self) -> tuple[RepeatRun, ...]:
        """Return only the repeat runs that outlive the declared `LOCF` bound."""
        return tuple(run for run in self.repeat_runs if run.exceeds_locf_bound)

    @property
    def biased_reductions(self) -> tuple[Reduction, ...]:
        """Return the reductions whose divergences ALL fell on one side of zero."""
        return tuple(
            reduction
            for reduction in KLINES_OHLC_REDUCTIONS
            if reduction in self.sign_counts
            and self.sign_counts[reduction].unilateral_bias(minimum_n=self.minimum_bias_n)
        )

    @property
    def writer_traces(self) -> tuple[WriterTrace, ...]:
        """Return, deduplicated and in a stable order, which write kinds the divergences came from.

        THIS IS THE ANSWER TO THE ACHADO'S OPEN QUESTION, and it is an answer about the data
        rather than about the code: a defect whose divergences are all `REPLAY` did not come
        from the live cycle, and one whose divergences are all `LIVE_TAIL` did not come from the
        backfill walk. A mix convicts the code they SHARE, which is `build_klines_to_rows` —
        and that third case is the one the offline mapping test settles without any data.
        """
        seen = [
            trace for trace in WriterTrace if any(d.writer_trace is trace for d in self.divergences)
        ]
        return tuple(seen)


def origin_bucket_end(open_time_ms: int) -> int:
    """Return the report-grid instant that the origin bucket labelled `open_time_ms` lands on.

    ⛔ THIS IS THE ALIGNMENT OF THE WHOLE COMPARISON, AND GETTING IT WRONG MANUFACTURES THE
    DEFECT IT IS LOOKING FOR. `/fapi/v1/klines` labels a bucket by its FIRST millisecond;
    `use_cases/collector_series_mapping.klines_bucket_end` stamps the same bucket on
    `ceil(close_time/B)*B`, which is one native grid step LATER (`DoD 10`, `T-01.4`: taking the
    source's `openTime` as the stamp is "the NAIVE FLOOR, and it shifts the entire series by ONE
    NATIVE BAR"). Comparing our `21:13` row against the origin's `21:13` LABEL therefore
    compares two different minutes, and two adjacent minutes of a moving market differ — which
    is a false finding that looks exactly like a real one.

    It is written here, once, instead of being inlined at the call sites, and
    `test_candle_fidelity.py::test_the_alignment_agrees_with_the_stamp_the_writer_uses` pins it
    against `klines_bucket_end` itself over real klines, so the two cannot drift apart. The
    constant is the catalog's `native_grid_ms`, not a second literal `60_000`: `domain` may not
    import `use_cases`, so agreement is proved by the test rather than by a shared import.
    """
    return open_time_ms + KLINES_OHLC_NATIVE_GRID_MS


def _repeat_runs_of(readings: Sequence[StoredReading]) -> tuple[RepeatRun, ...]:
    """Fold one reduction's grid-ordered readings into maximal runs of an identical value."""
    runs: list[RepeatRun] = []
    start: StoredReading | None = None
    length = 0
    for reading in readings:
        if (
            start is not None
            and reading.value is not None
            and reading.value == start.value
            and reading.available_at == start.available_at
        ):
            length += 1
            continue
        if start is not None and start.value is not None and length > 1:
            runs.append(
                RepeatRun(
                    reduction=start.reduction,
                    first_event_time=start.event_time,
                    length=length,
                    value=start.value,
                )
            )
        start = reading if reading.value is not None else None
        length = 1 if reading.value is not None else 0
    if start is not None and start.value is not None and length > 1:
        runs.append(
            RepeatRun(
                reduction=start.reduction,
                first_event_time=start.event_time,
                length=length,
                value=start.value,
            )
        )
    return tuple(runs)


def _divergence(
    reduction: Reduction, reading: StoredReading, origin_value: Decimal
) -> ReadingDivergence:
    """Pair one stored cell with the origin price it failed to equal, carrying its provenance."""
    if reading.value is None:
        raise CandleFidelityError(
            f"an absent cell ({reduction.value}@{reading.event_time}) has no value to pair "
            f"with an origin price, so it cannot be a divergence"
        )
    return ReadingDivergence(
        reduction=reduction,
        event_time=reading.event_time,
        origin_value=origin_value,
        stored_value=reading.value,
        writer_trace=reading.writer_trace,
        publication_lag_ms=reading.publication_lag_ms,
    )


def compare_candles(
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
    origin: Sequence[OriginCandle],
    stored: Sequence[StoredReading],
    minimum_bias_n: int,
) -> CandleFidelityReport:
    """Compare every stored reading against the ORIGIN bucket of the instant it answers.

    The comparison is EXACT (see the module docstring for why zero is the only defensible
    tolerance on a path that copies a decimal string). A grid instant with no origin bucket is
    NOT compared and NOT counted as faithful — it is outside the universe, and silently
    counting it would inflate the denominator that every number in the report divides by.

    `minimum_bias_n` has no default for the reason `SignCounts.unilateral_bias` states.
    """
    if minimum_bias_n < 1:
        raise CandleFidelityError(
            f"minimum_bias_n={minimum_bias_n} would let a unilateral-bias claim be made over "
            f"zero diverging buckets, which is an assertion about an empty universe"
        )
    by_instant = {candle.bucket_end: candle for candle in origin}
    divergences: list[ReadingDivergence] = []
    carried: list[ReadingDivergence] = []
    counts: dict[Reduction, dict[str, int]] = {
        reduction: {"positive": 0, "negative": 0, "zero": 0} for reduction in KLINES_OHLC_REDUCTIONS
    }
    runs: list[RepeatRun] = []
    n_compared = 0
    n_absent = 0
    n_carried = 0
    for reduction in KLINES_OHLC_REDUCTIONS:
        mine = sorted(
            (reading for reading in stored if reading.reduction is reduction),
            key=lambda reading: reading.event_time,
        )
        runs.extend(_repeat_runs_of(mine))
        for reading in mine:
            candle = by_instant.get(reading.event_time)
            if candle is None:
                continue
            if reading.value is None:
                n_absent += 1
                continue
            origin_value = candle.price_of(reduction)
            delta = reading.value - origin_value
            if reading.writer_trace is WriterTrace.CARRIED:
                n_carried += 1
                if delta != 0:
                    carried.append(_divergence(reduction, reading, origin_value))
                continue
            n_compared += 1
            if delta == 0:
                counts[reduction]["zero"] += 1
                continue
            counts[reduction]["positive" if delta > 0 else "negative"] += 1
            divergences.append(_divergence(reduction, reading, origin_value))
    return CandleFidelityReport(
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        n_origin_buckets=len(by_instant),
        n_compared=n_compared,
        n_absent=n_absent,
        n_carried=n_carried,
        divergences=tuple(divergences),
        carried_divergences=tuple(carried),
        sign_counts={
            reduction: SignCounts(
                positive=tally["positive"], negative=tally["negative"], zero=tally["zero"]
            )
            for reduction, tally in counts.items()
        },
        repeat_runs=tuple(runs),
        minimum_bias_n=minimum_bias_n,
    )


@dataclass(frozen=True)
class CandleWindowAggregate:
    """The four numbers a HUMAN can check against the venue's own chart, over one window.

    `T-01.7`'s task entry fixes the universe of the assert in exactly this shape, collected
    from the ORIGIN and described there as *"auto-verificavel pelo owner no grafico da
    Binance"*: `BTCUSDT`, the closed window `2026-09-18 12:00 -> 16:00 UTC`, `240/240` minutes,
    `first(open)` · `max(high)` · `min(low)` · `last(close)`.

    ⛔ THAT AUDITABILITY IS THE BEST PROPERTY OF THIS TASK AND IT IS WHY THE AGGREGATE EXISTS AS
    A TYPE. A per-bucket comparison proves more, but nobody outside this repository can check
    it; four numbers on a four-hour candle can be read off the venue's own screen by the owner,
    with no tooling and no trust in this code. The two are complementary and both are reported.

    `first_open` and `last_close` are ORDER-DEPENDENT, which is why building one of these over
    an INCOMPLETE window is refused rather than allowed with a smaller `n`: the `open` of the
    window is the open of its first minute, and if that minute is missing, the number silently
    becomes the open of some other minute while still looking like an answer to the question.
    `max_high`/`min_low` would survive a hole; the other two would lie.
    """

    n_buckets: int
    first_open: Decimal
    max_high: Decimal
    min_low: Decimal
    last_close: Decimal


def aggregate_origin_window(
    origin: Sequence[OriginCandle], *, expected_buckets: int
) -> CandleWindowAggregate:
    """Reduce origin buckets to the owner-verifiable quadruple, refusing an incomplete window."""
    ordered = sorted(origin, key=lambda candle: candle.open_time_ms)
    _refuse_incomplete_window(len(ordered), expected_buckets=expected_buckets, side="origin")
    return CandleWindowAggregate(
        n_buckets=len(ordered),
        first_open=ordered[0].open,
        max_high=max(candle.high for candle in ordered),
        min_low=min(candle.low for candle in ordered),
        last_close=ordered[-1].close,
    )


def aggregate_stored_window(
    stored: Sequence[StoredReading], *, expected_buckets: int
) -> CandleWindowAggregate:
    """Reduce STORED readings to the same quadruple, over the same refusal.

    An ABSENT cell counts as a missing bucket and therefore trips the refusal: this repository's
    whole position on absence is that "nao sabemos" and "foi zero" are never the same pixels
    (`RN-1`), and an aggregate that skipped the hole would state a `min_low` for a window it
    never saw the bottom of.

    ⛔ A CARRIED CELL COUNTS AS MISSING TOO, and that is the same rule rather than a second
    one. `WriterTrace.CARRIED` means the minute has NO observation of its own — `as_of` answered
    it by carrying the bucket before it — so admitting it would let the open of one minute be
    reported as the open of another, which is the exact failure `expected_buckets` exists to
    refuse. The cell is legitimate to DRAW (that is what `max_staleness_ms` authorises); it is
    not legitimate to AGGREGATE as evidence about the minute it was drawn on.
    """
    by_reduction: dict[Reduction, list[StoredReading]] = {
        reduction: sorted(
            (
                r
                for r in stored
                if r.reduction is reduction
                and r.value is not None
                and r.writer_trace is not WriterTrace.CARRIED
            ),
            key=lambda reading: reading.event_time,
        )
        for reduction in KLINES_OHLC_REDUCTIONS
    }
    for reduction, readings in by_reduction.items():
        _refuse_incomplete_window(
            len(readings), expected_buckets=expected_buckets, side=f"stored {reduction.value}"
        )
    opens = by_reduction[Reduction.OPEN]
    closes = by_reduction[Reduction.CLOSE]
    return CandleWindowAggregate(
        n_buckets=len(opens),
        first_open=_value_of(opens[0]),
        max_high=max(_value_of(r) for r in by_reduction[Reduction.HIGH]),
        min_low=min(_value_of(r) for r in by_reduction[Reduction.LOW]),
        last_close=_value_of(closes[-1]),
    )


def _value_of(reading: StoredReading) -> Decimal:
    """Return a present reading's value, refusing an absent one — the type narrowing, named."""
    if reading.value is None:
        raise CandleFidelityError(
            f"reading {reading.reduction.value}@{reading.event_time} is absent, so it has no "
            f"value to aggregate"
        )
    return reading.value


def _refuse_incomplete_window(n: int, *, expected_buckets: int, side: str) -> None:
    """Refuse an aggregate over a window that is not whole — `NOT MEASURED`, never a number."""
    if expected_buckets < 1:
        raise CandleFidelityError(
            f"expected_buckets={expected_buckets} asks for an aggregate over an empty window"
        )
    if n != expected_buckets:
        raise CandleFidelityError(
            f"the {side} side of this window has {n} of {expected_buckets} buckets, so "
            f"first(open)/last(close) would be read off the wrong minute while still looking "
            f"like an answer: this is NOT MEASURED, not a smaller measurement"
        )
