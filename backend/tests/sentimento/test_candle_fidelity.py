"""`T-01.7` (`CST-203`): the stored candle against the ORIGIN's own kline, and what MORDE.

⛔ THIS FILE DOES NOT START FROM A WORRY. It starts from two MEASURED findings, and every
assertion below is written so that the finding it encodes cannot pass:

  * `docs/context/candle-real-e-eixo-unico/gates/ACHADO-vela-viva-diverge-da-origem.md`
    `[MEDIDO 2026-09-19 ~21:20 UTC, n=4 buckets]`: the stored interval at `21:13` was
    `[81001.00, 81023.10]` against the origin's `[80960.00, 81023.00]` — our `low` `+41,00`
    ABOVE the true one, so the stored interval does NOT CONTAIN the origin's low, and the true
    `close` (`80966.60`) appears in none of the four readings;
  * `[M-9]`, escalated by `/architect` `[MEDIDO 2026-09-19, n=4 buckets x 240 min = 960
    comparisons]`: the sibling `klines_volume`, off the SAME array, understates the origin by
    `-2,450%` / `-4,474%` / `-2,212%` / `-2,227%` with `pos=0` in `4/4` — a UNILATERAL bias,
    which is the signature of an intrabar snapshot stored as `final_only`, not of noise.

`T-01.7` does not fix either (that is `ADR-034` + `/architect`). It makes them impossible to
propagate in silence.

── ⚠️ THE ONE PLACE THIS FILE CONTRADICTS THE ACHADO, AND IT DOES SO WITH A TEST ────────────

The achado read its "defeito 1" — two adjacent grid instants carrying byte-identical values
across all four reductions — as *"o mesmo kline gravado sob dois `event_time`"*. That inference
does not follow, and
`test_one_stored_bar_answers_two_adjacent_grid_instants_with_no_duplicate_write_at_all`
below builds the whole signature from a SINGLE written bar, through the production writer and
the production `as_of`, with nothing duplicated anywhere. `klines_ohlc` is `nature=STOCK` with
`max_staleness_ms = 120_000` — twice its native grid — so one bar legitimately answers two
adjacent instants. The observation is real; the conclusion drawn from it was not available from
it. What remains true, and is what this file asserts on, is the comparison against the ORIGIN:
a carried bar and a duplicated bar are both wrong for the minute they answer.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
)
from src.modules.sentimento.domain.candle_fidelity import (
    LIVE_TAIL_PUBLICATION_BOUND_MS,
    MAX_LOCF_RUN_LENGTH,
    CandleFidelityError,
    CandleFidelityReport,
    FidelityVerdict,
    OriginCandle,
    StoredReading,
    WriterTrace,
    aggregate_origin_window,
    aggregate_stored_window,
    compare_candles,
    origin_bucket_end,
)
from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_MAX_STALENESS_MS,
    KLINES_OHLC_NATIVE_GRID_MS,
    KLINES_OHLC_REDUCTIONS,
    build_klines_ohlc_entry,
)
from src.modules.sentimento.domain.series_key import Reduction
from src.modules.sentimento.infra.binance_klines_client import KlineRow
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
    klines_bucket_end,
)

_SYMBOL = "BTCUSDT"
_T0 = 1_788_000_000_000
_CLOSE_OFFSET_MS = KLINES_BUCKET_WIDTH_MS - 1

# The `verified_by` of the four SERVED `klines_ohlc` rows, written as a literal and NOT
# imported from production, for the reason `test_collector_klines_mapping.py` already states:
# importing it would make a contract assertion compare a value with itself.
_OHLC_VERIFIED_BY = "test_klines_ohlc_catalog.py"

# ── THE ACHADO'S OWN NUMBERS, TRANSCRIBED ───────────────────────────────────────────────────
#
# `[MEDIDO 2026-09-19 ~21:20 UTC]`, bucket `21:13`, from
# `gates/ACHADO-vela-viva-diverge-da-origem.md`. They are here as a FIXTURE so the finding is
# replayable offline for ever, and so the day the harness stops rejecting it, a test says so.
_ACHADO_ORIGIN = ("81001.10", "81023.00", "80960.00", "80966.60")
_ACHADO_STORED_INTERVAL_LOW = "81001.00"
_ACHADO_STORED_INTERVAL_HIGH = "81023.10"
_ACHADO_LOW_ERROR = Decimal("41.00")


def _kline(
    open_time_ms: int, *, prices: tuple[str, str, str, str] = ("100.0", "101.0", "99.0", "100.5")
) -> KlineRow:
    """Build a REAL `KlineRow` with the 12 fields the endpoint returns; `prices` is O/H/L/C."""
    return KlineRow(
        raw=(
            open_time_ms,
            *prices,
            "10.0",
            open_time_ms + _CLOSE_OFFSET_MS,
            "1000.0",
            42,
            "5.0",
            "500.0",
            "0",
        )
    )


def _origin(index: int, prices: tuple[str, str, str, str]) -> OriginCandle:
    """Build one origin bucket at grid position `index`, from four decimal strings."""
    return OriginCandle(
        open_time_ms=_T0 + index * KLINES_OHLC_NATIVE_GRID_MS,
        open=Decimal(prices[0]),
        high=Decimal(prices[1]),
        low=Decimal(prices[2]),
        close=Decimal(prices[3]),
    )


def _stored(
    index: int, prices: tuple[str, str, str, str], *, lag_ms: int = 2_000
) -> tuple[StoredReading, ...]:
    """Build the four stored readings of the grid instant `index` answers."""
    event_time = origin_bucket_end(_T0 + index * KLINES_OHLC_NATIVE_GRID_MS)
    return tuple(
        StoredReading(
            reduction=reduction,
            event_time=event_time,
            value=Decimal(price),
            available_at=event_time + lag_ms,
        )
        for reduction, price in zip(KLINES_OHLC_REDUCTIONS, prices, strict=True)
    )


_FAITHFUL_PRICES: tuple[tuple[str, str, str, str], ...] = (
    ("100.0", "104.0", "99.0", "103.0"),
    ("103.0", "106.5", "102.5", "104.0"),
    ("104.0", "104.8", "101.1", "101.9"),
    ("101.9", "107.2", "101.0", "106.6"),
    ("106.6", "108.0", "105.4", "105.9"),
)


def _faithful_pair(
    prices: tuple[tuple[str, str, str, str], ...] = _FAITHFUL_PRICES,
) -> tuple[tuple[OriginCandle, ...], tuple[StoredReading, ...]]:
    """Return an origin window and a byte-faithful copy of it on the stored side."""
    origin = tuple(_origin(index, quad) for index, quad in enumerate(prices))
    stored = tuple(reading for index, quad in enumerate(prices) for reading in _stored(index, quad))
    return origin, stored


def _compare(
    origin: tuple[OriginCandle, ...],
    stored: tuple[StoredReading, ...],
    *,
    minimum_bias_n: int = 4,
) -> CandleFidelityReport:
    """Run the comparison with the harness' own `minimum_bias_n` unless a test varies it."""
    return compare_candles(
        symbol=_SYMBOL,
        window_start_ms=_T0,
        window_end_ms=_T0 + 1_000 * KLINES_OHLC_NATIVE_GRID_MS,
        origin=origin,
        stored=stored,
        minimum_bias_n=minimum_bias_n,
    )


# ── THE ALIGNMENT: THE ONE THING THAT MANUFACTURES THE DEFECT IT LOOKS FOR ──────────────────


def test_the_alignment_agrees_with_the_stamp_the_writer_actually_uses() -> None:
    """`origin_bucket_end` lands on the same instant `klines_bucket_end` stamps, bar for bar.

    Morde: `domain` may not import `use_cases`, so the harness re-states the shift with the
    catalog's own `native_grid_ms`. Without this test the two constants could drift apart
    silently and every comparison would be off by one native bar — which is `DoD 10`'s naive
    floor, reappearing on the READING side after `T-01.4` removed it from the writing side.
    """
    klines = [_kline(_T0 + index * KLINES_BUCKET_WIDTH_MS) for index in range(5)]
    assert [origin_bucket_end(k.open_time_ms) for k in klines] == [
        klines_bucket_end(k) for k in klines
    ]
    assert all(origin_bucket_end(k.open_time_ms) != k.open_time_ms for k in klines)


def test_comparing_on_the_origin_label_instead_of_the_bucket_end_manufactures_a_finding() -> None:
    """A FAITHFUL window read one bar off reports divergences — the false positive, pinned.

    This is the falsifier of the alignment itself, and it is the reason the achado's per-bucket
    numbers could not be taken at face value: comparing our `21:13` row against the origin
    array element LABELLED `21:13` compares two different minutes of a moving market. Here the
    same data is compared correctly (zero divergences) and then one step off (divergences on
    every bucket), from one fixture.
    """
    origin, stored = _faithful_pair()
    assert _compare(origin, stored).verdict is FidelityVerdict.FAITHFUL
    misaligned = tuple(
        StoredReading(
            reduction=reading.reduction,
            event_time=reading.event_time - KLINES_OHLC_NATIVE_GRID_MS,
            value=reading.value,
            available_at=reading.available_at,
        )
        for reading in stored
    )
    shifted = _compare(origin, misaligned)
    assert shifted.verdict is FidelityVerdict.REJECTED
    assert len(shifted.divergences) >= 4


def test_each_reduction_reads_the_origin_field_of_its_own_name() -> None:
    """`price_of` pairs `Reduction` with the field that carries its name, and nothing else.

    Morde: swap the `HIGH`/`LOW` entries of the mapping and this fails on both members at once.
    A swap keeps the arity, the types, `ruff` and `mypy` — nothing else in this file would
    notice, and the harness would then invent findings on faithful data.
    """
    candle = _origin(0, ("1.0", "4.0", "0.5", "2.0"))
    assert candle.price_of(Reduction.OPEN) == Decimal("1.0")
    assert candle.price_of(Reduction.HIGH) == Decimal("4.0")
    assert candle.price_of(Reduction.LOW) == Decimal("0.5")
    assert candle.price_of(Reduction.CLOSE) == Decimal("2.0")


def test_a_reduction_that_is_not_one_of_the_four_is_refused_not_guessed() -> None:
    """Asking a candle for a fifth reading raises instead of answering something plausible."""
    with pytest.raises(CandleFidelityError, match="not one of the four readings"):
        _origin(0, ("1.0", "4.0", "0.5", "2.0")).price_of(Reduction.SUM)


def test_an_origin_bucket_with_an_inverted_interval_is_refused_at_construction() -> None:
    """A malformed GROUND TRUTH fails loudly instead of becoming a denominator."""
    with pytest.raises(CandleFidelityError, match="GROUND TRUTH"):
        OriginCandle(
            open_time_ms=_T0,
            open=Decimal("1"),
            high=Decimal("1"),
            low=Decimal("2"),
            close=Decimal("1"),
        )


# ── THE TOLERANCE IS EXACT, AND THE COMPARISON IS ON THE NUMBER, NOT ON THE BYTES ───────────


def test_a_byte_faithful_copy_of_the_origin_is_faithful() -> None:
    """The green baseline, with its universe named: 5 buckets x 4 readings = 20 comparisons."""
    report = _compare(*_faithful_pair())
    assert report.verdict is FidelityVerdict.FAITHFUL
    assert report.n_compared == 20
    assert report.divergences == ()


def test_one_cent_of_divergence_on_one_reading_of_one_bucket_still_morde() -> None:
    """The tolerance is ZERO, so the smallest representable drift is a finding.

    Morde: give `compare_candles` any tolerance above zero and this passes — and so would the
    achado's own `+41,00`, if the tolerance were expressed as a fraction of an `81.000` price.
    """
    origin, stored = _faithful_pair()
    poisoned = tuple(
        StoredReading(
            reduction=reading.reduction,
            event_time=reading.event_time,
            value=(reading.value or Decimal(0)) + Decimal("0.01")
            if reading.reduction is Reduction.CLOSE and reading.event_time == origin[2].bucket_end
            else reading.value,
            available_at=reading.available_at,
        )
        for reading in stored
    )
    report = _compare(origin, poisoned)
    assert report.verdict is FidelityVerdict.REJECTED
    assert len(report.divergences) == 1
    assert report.divergences[0].delta == Decimal("0.01")


def test_a_different_spelling_of_the_same_number_is_not_a_divergence() -> None:
    """`"103.00"` and `"103.0"` are one number, and the venue owns its own trailing zeros.

    Morde: compare the raw strings instead of `Decimal`s and this reports four false findings
    on data that is byte-faithful in every sense that matters.
    """
    origin = (_origin(0, ("100.0", "104.0", "99.0", "103.0")),)
    stored = _stored(0, ("100.000", "104.00", "99.0000", "103.0"))
    assert _compare(origin, stored).verdict is FidelityVerdict.FAITHFUL


# ── THE `[M-9]` SIGNATURE: UNILATERAL BIAS, WHICH IS NOT NOISE ──────────────────────────────


def test_an_intrabar_snapshot_stored_as_final_is_rejected_with_the_pos_zero_signature() -> None:
    """The `[M-9]` shape, built on purpose: every `HIGH` short, every `LOW` high, `pos=0`.

    This is what a snapshot taken INSIDE the bar and filed as `final_only` looks like from the
    outside: at the instant of the snapshot the bar had not yet reached its maximum, and had
    not yet reached its minimum either, so the wick is truncated AT BOTH ENDS and it is
    truncated in the SAME DIRECTION on every bucket. Noise cannot do that.

    Morde: drop the sign counting and keep only the divergence count, and this test still
    passes while losing the one thing that separates a systematic defect from jitter — which is
    exactly the distinction `[M-9]` was escalated on.
    """
    origin, _ = _faithful_pair()
    stored: list[StoredReading] = []
    for index, candle in enumerate(origin):
        stored.extend(
            _stored(
                index,
                (
                    str(candle.open),
                    str(candle.high - Decimal("0.5")),
                    str(candle.low + Decimal("0.5")),
                    str(candle.close),
                ),
            )
        )
    report = _compare(origin, tuple(stored))
    assert report.verdict is FidelityVerdict.REJECTED
    assert set(report.biased_reductions) == {Reduction.HIGH, Reduction.LOW}
    assert report.sign_counts[Reduction.HIGH].positive == 0
    assert report.sign_counts[Reduction.HIGH].negative == 5
    assert report.sign_counts[Reduction.LOW].negative == 0
    assert report.sign_counts[Reduction.LOW].positive == 5


def test_divergences_that_straddle_zero_are_not_called_a_unilateral_bias() -> None:
    """Jitter is rejected as a divergence and NOT decorated with a signature it does not have.

    The harness has to be able to say "this diverged, and it is not `[M-9]`" — otherwise the
    bias flag means nothing when it does fire.
    """
    origin, _ = _faithful_pair()
    stored: list[StoredReading] = []
    for index, candle in enumerate(origin):
        drift = Decimal("0.2") if index % 2 == 0 else Decimal("-0.2")
        stored.extend(
            _stored(
                index,
                (str(candle.open + drift), str(candle.high), str(candle.low), str(candle.close)),
            )
        )
    report = _compare(origin, tuple(stored))
    assert report.verdict is FidelityVerdict.REJECTED
    assert report.biased_reductions == ()


def test_a_unilateral_bias_is_not_claimed_over_fewer_buckets_than_the_declared_minimum() -> None:
    """Three same-sign draws is `25%` under a fair coin, so it is not a signature.

    Morde: default `minimum_n` to `1` and a single diverging bucket gets reported as the
    `[M-9]` signature, which would make the loudest line of the report the least reliable one.
    """
    origin, _ = _faithful_pair(_FAITHFUL_PRICES[:3])
    stored: list[StoredReading] = []
    for index, candle in enumerate(origin):
        stored.extend(
            _stored(
                index,
                (
                    str(candle.open),
                    str(candle.high - Decimal("0.5")),
                    str(candle.low),
                    str(candle.close),
                ),
            )
        )
    report = _compare(origin, tuple(stored))
    assert report.verdict is FidelityVerdict.REJECTED
    assert report.biased_reductions == ()
    assert report.sign_counts[Reduction.HIGH].negative == 3


def test_a_bias_claim_over_an_empty_universe_is_refused_at_the_call() -> None:
    """`minimum_bias_n < 1` is an assertion about nothing, and the comparison refuses it."""
    origin, stored = _faithful_pair()
    with pytest.raises(CandleFidelityError, match="empty universe"):
        compare_candles(
            symbol=_SYMBOL,
            window_start_ms=_T0,
            window_end_ms=_T0 + KLINES_OHLC_NATIVE_GRID_MS,
            origin=origin,
            stored=stored,
            minimum_bias_n=0,
        )


# ── THE ACHADO ITSELF, REPLAYED OFFLINE, FOR EVER ───────────────────────────────────────────


def test_the_measured_achado_bucket_is_rejected_and_the_low_error_is_the_one_measured() -> None:
    """Replay `21:13` `[MEDIDO 2026-09-19]` and pin the `+41,00` the achado recorded.

    ⛔ THE HARNESS HAS TO REJECT THE ONE CASE IT WAS BUILT FOR, or nothing else it says can be
    trusted. The four stored readings are the achado's own, mapped onto O/H/L/C by the only
    assignment its interval `[81001.00 , 81023.10]` admits; the achado states, and this test
    inherits, that the conclusion does not depend on which key is which reduction, because the
    stored SPAN does not contain the origin's `low` under any assignment.
    """
    origin = (_origin(0, _ACHADO_ORIGIN),)
    stored = _stored(
        0,
        (
            "81001.20",
            _ACHADO_STORED_INTERVAL_HIGH,
            _ACHADO_STORED_INTERVAL_LOW,
            "81023.00",
        ),
    )
    report = _compare(origin, stored, minimum_bias_n=1)
    assert report.verdict is FidelityVerdict.REJECTED
    low = next(d for d in report.divergences if d.reduction is Reduction.LOW)
    assert low.delta == _ACHADO_LOW_ERROR
    assert low.stored_value > low.origin_value


# ── AN EMPTY WINDOW IS NOT A SMALL MEASUREMENT (`ADR-012`) ──────────────────────────────────


def test_a_window_with_no_stored_point_is_not_measured_and_never_faithful() -> None:
    """The `0/240` case this task was written under: `NOT_MEASURED`, and it is not green.

    Morde: return `FAITHFUL` on an empty comparison and the harness answers "nothing diverged"
    for a universe it never looked at — the `rc=0` ambiguity `ADR-012` names, and the way a
    falsifier stops falsifying anything without one line changing.
    """
    origin, _ = _faithful_pair()
    report = _compare(origin, ())
    assert report.verdict is FidelityVerdict.NOT_MEASURED
    assert report.n_compared == 0
    assert report.n_origin_buckets == 5


def test_an_absent_cell_is_counted_as_absent_and_never_compared_as_a_number() -> None:
    """`SEM_PONTO` is a hole, not a zero — `RN-1` at the level of the measuring instrument."""
    origin, _ = _faithful_pair(_FAITHFUL_PRICES[:1])
    absent = tuple(
        StoredReading(
            reduction=reduction,
            event_time=origin[0].bucket_end,
            value=None,
            available_at=None,
            absence="SEM_PONTO",
        )
        for reduction in KLINES_OHLC_REDUCTIONS
    )
    report = _compare(origin, absent)
    assert report.verdict is FidelityVerdict.NOT_MEASURED
    assert report.n_absent == 4


def test_a_cell_that_is_both_a_value_and_an_absence_is_refused() -> None:
    """The discriminated pair is enforced here too, so a half-built row cannot be compared."""
    with pytest.raises(CandleFidelityError, match="either a value or"):
        StoredReading(
            reduction=Reduction.OPEN,
            event_time=_T0,
            value=Decimal("1"),
            available_at=_T0,
            absence="SEM_PONTO",
        )


# ── THE STAIRCASE: WHY "DEFEITO 1" DOES NOT ESTABLISH A DUPLICATE WRITE ─────────────────────


def test_one_stored_bar_answers_two_adjacent_grid_instants_with_no_duplicate_write_at_all() -> None:
    """Build the achado's "defeito 1" signature from ONE bar, end to end, nothing duplicated.

    ⛔ THIS IS THE CORRECTION, AND IT IS A TEST RATHER THAN A PARAGRAPH. One closed kline goes
    through the PRODUCTION writer (`build_klines_to_rows`) and comes out as exactly four rows;
    those four rows are read back through the PRODUCTION accessor (`as_of`) at two adjacent
    instants of the report grid, and both answer — with byte-identical values, in all four
    reductions. That is the achado's entire "defeito 1" observation, with `n=1` written bar.

    `klines_ohlc` is `nature=STOCK` with `max_staleness_ms = 120_000`, twice its native grid,
    which is `LOCF` over at most one missed bar by explicit declaration (`SPEC-001` §3.2). So
    the observation is real and the inference from it was not: adjacency plus identity is the
    designed staircase, and it takes the comparison against the ORIGIN to tell a carried bar
    from a duplicated one.

    Morde: the third instant. `as_of` at `bucket_end + 2 * grid` must NOT answer, because that
    is where the declared bound ends — so a `max_staleness` raised to three grid steps fails
    this test instead of quietly widening the staircase under the panel.
    """
    kline = _kline(_T0, prices=("100.0", "104.0", "99.0", "103.0"))
    bucket_end = klines_bucket_end(kline)
    # The collector's own shape: it polls at `bucket_end + offset_s`, so `available_at` is a
    # couple of seconds PAST the instant the bar is stamped on. That is why the bar does not
    # answer at `bucket_end` itself (`available_at <= t` is `R-1`, and it fails there) and the
    # staircase starts one grid step later — measured below, not assumed.
    rows = build_klines_to_rows()(bucket_end + 2_000, _SYMBOL, (kline,))
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=KLINES_OHLC_MAX_STALENESS_MS,
        render_max_staleness_ms=None,
        bucket_interval_ms=KLINES_OHLC_NATIVE_GRID_MS,
        first_capture_at=None,
    )
    answers: dict[int, list[Decimal]] = {}
    for step in (0, 1, 2, 3):
        instant = bucket_end + step * KLINES_OHLC_NATIVE_GRID_MS
        values: list[Decimal] = []
        for reduction in KLINES_OHLC_REDUCTIONS:
            key = build_klines_ohlc_entry(
                reduction, instrument_id=_SYMBOL, verified_by=_OHLC_VERIFIED_BY
            ).key
            observations = tuple(
                Observation(row=row, value=Decimal(row.value_raw))
                for row in rows
                if row.series_key_id == key.series_key_id()
            )
            reading = as_of(
                series=key,
                symbol=_SYMBOL,
                t=instant,
                observations=observations,
                policy=policy,
                bar_policy=BarPolicy.FINAL_ONLY,
                purpose=ReadPurpose.ENTRY_CONDITION,
                knowledge_time=instant,
            )
            if reading.value is not None:
                values.append(reading.value)
        answers[step] = values
    assert len(rows) == 6, "one closed bar publishes six identities, four of them the candle"
    assert answers[0] == [], "R-1 (`available_at <= t`) holds the bar back one grid step"
    assert len(answers[1]) == 4
    assert answers[2] == answers[1], "the carried instant repeats the SAME bar, by design"
    assert answers[3] == [], "and the declared bound stops the staircase there"
    assert MAX_LOCF_RUN_LENGTH == 2


def test_a_repeat_run_within_the_declared_bound_is_reported_but_is_not_a_finding() -> None:
    """Two identical adjacent instants is the staircase, so the verdict stays `FAITHFUL`."""
    origin = (_origin(0, ("100.0", "104.0", "99.0", "103.0")),)
    carried = origin[0].bucket_end + KLINES_OHLC_NATIVE_GRID_MS
    stored = (
        *_stored(0, ("100.0", "104.0", "99.0", "103.0")),
        *(
            StoredReading(
                reduction=reduction,
                event_time=carried,
                value=Decimal(price),
                available_at=origin[0].bucket_end + 2_000,
            )
            for reduction, price in zip(
                KLINES_OHLC_REDUCTIONS, ("100.0", "104.0", "99.0", "103.0"), strict=True
            )
        ),
    )
    report = _compare(origin, stored)
    assert report.verdict is FidelityVerdict.FAITHFUL
    assert {run.length for run in report.repeat_runs} == {2}
    assert report.runs_exceeding_locf_bound == ()


def test_a_repeat_run_longer_than_the_declared_bound_is_rejected() -> None:
    """Three identical adjacent instants outlives `max_staleness_ms`, and THAT is a finding.

    Morde: this is the assertion that would have caught a genuine duplicate write, and it fires
    on a run the catalog's own bound cannot explain — unlike a run of two, which it can.
    """
    origin = (_origin(0, ("100.0", "104.0", "99.0", "103.0")),)
    stored = tuple(
        StoredReading(
            reduction=reduction,
            event_time=origin[0].bucket_end + step * KLINES_OHLC_NATIVE_GRID_MS,
            value=Decimal(price),
            available_at=origin[0].bucket_end + 2_000,
        )
        for step in (0, 1, 2)
        for reduction, price in zip(
            KLINES_OHLC_REDUCTIONS, ("100.0", "104.0", "99.0", "103.0"), strict=True
        )
    )
    report = _compare(origin, stored)
    assert report.verdict is FidelityVerdict.REJECTED
    assert {run.length for run in report.runs_exceeding_locf_bound} == {3}


# ── WHICH PATH WROTE IT: THE `[NAO MEDIDO]` THE ACHADO LEFT OPEN ────────────────────────────


def test_the_shared_mapping_copies_the_four_origin_prices_verbatim() -> None:
    """`build_klines_to_rows` publishes the ORIGIN's own strings — the shared path, exonerated.

    ⛔ THIS IS HALF THE ANSWER TO "WHICH PATH PRODUCED IT", AND IT NEEDS NO DATA, NO NETWORK AND
    NO DATABASE. The backfill CLI and the collector share exactly one piece of code on the way
    from the array to `md.series`, and this test drives that piece with a real `KlineRow` and
    compares what comes out against the same array's own fields. Green here means the shared
    mapping is not the culprit, and the question reduces to WHICH PAGE each path fetched.

    Morde: swap the `HIGH`/`LOW` entries of `KLINES_OHLC_PRICE_READINGS` and this fails naming
    both readings — the same failure class `T-01.2` wrote its accessor test against.
    """
    prices = ("81001.10", "81023.00", "80960.00", "80966.60")
    kline = _kline(_T0, prices=prices)
    rows = build_klines_to_rows()(_T0 + 2 * KLINES_BUCKET_WIDTH_MS, _SYMBOL, (kline,))
    published = {
        reduction: next(
            row.value_raw
            for row in rows
            if row.series_key_id
            == build_klines_ohlc_entry(
                reduction, instrument_id=_SYMBOL, verified_by=_OHLC_VERIFIED_BY
            ).key.series_key_id()
        )
        for reduction in KLINES_OHLC_REDUCTIONS
    }
    assert published == dict(zip(KLINES_OHLC_REDUCTIONS, prices, strict=True))
    assert published[Reduction.OPEN] == kline.open_price
    assert published[Reduction.HIGH] == kline.high_price
    assert published[Reduction.LOW] == kline.low_price
    assert published[Reduction.CLOSE] == kline.close_price


def test_the_publication_lag_separates_a_live_tail_write_from_a_replay_write() -> None:
    """The other half of the answer, and it is read off a field already on the wire.

    A live pass stamps `available_at` with its own clock seconds after the bucket closed; a
    replay walk stamps a bucket that closed hours earlier with the clock of the walk. The two
    differ by three orders of magnitude, which is why the bound does not have to be tight.
    """
    origin, _ = _faithful_pair(_FAITHFUL_PRICES[:1])
    instant = origin[0].bucket_end
    fresh = StoredReading(
        reduction=Reduction.OPEN,
        event_time=instant,
        value=Decimal("1"),
        available_at=instant + LIVE_TAIL_PUBLICATION_BOUND_MS,
    )
    late = StoredReading(
        reduction=Reduction.OPEN,
        event_time=instant,
        value=Decimal("1"),
        available_at=instant + LIVE_TAIL_PUBLICATION_BOUND_MS + 1,
    )
    absent = StoredReading(
        reduction=Reduction.OPEN,
        event_time=instant,
        value=None,
        available_at=None,
        absence="SEM_PONTO",
    )
    assert fresh.writer_trace is WriterTrace.LIVE_TAIL
    assert late.writer_trace is WriterTrace.REPLAY
    assert absent.writer_trace is WriterTrace.UNKNOWN
    assert fresh.publication_lag_ms == LIVE_TAIL_PUBLICATION_BOUND_MS
    assert absent.publication_lag_ms is None


def test_the_report_names_which_write_kind_each_divergence_came_from() -> None:
    """A divergence carries its own provenance, so the repair can be aimed at one path."""
    origin, _ = _faithful_pair(_FAITHFUL_PRICES[:1])
    stored = tuple(
        StoredReading(
            reduction=reduction,
            event_time=origin[0].bucket_end,
            value=origin[0].price_of(reduction) + Decimal("1"),
            available_at=origin[0].bucket_end + 6 * 3_600_000,
        )
        for reduction in KLINES_OHLC_REDUCTIONS
    )
    report = _compare(origin, stored, minimum_bias_n=4)
    assert report.writer_traces == (WriterTrace.REPLAY,)
    assert all(d.writer_trace is WriterTrace.REPLAY for d in report.divergences)


# ── THE OWNER-VERIFIABLE QUADRUPLE OVER THE WINDOW ──────────────────────────────────────────


def test_the_window_aggregate_is_the_four_numbers_the_owner_can_read_off_the_chart() -> None:
    """`first(open)` · `max(high)` · `min(low)` · `last(close)`, over a complete window."""
    origin, stored = _faithful_pair()
    from_origin = aggregate_origin_window(origin, expected_buckets=5)
    from_stored = aggregate_stored_window(stored, expected_buckets=5)
    assert from_origin == from_stored
    assert from_origin.first_open == Decimal("100.0")
    assert from_origin.max_high == Decimal("108.0")
    assert from_origin.min_low == Decimal("99.0")
    assert from_origin.last_close == Decimal("105.9")


def test_an_incomplete_window_is_refused_rather_than_aggregated_over_what_arrived() -> None:
    """`first(open)` off a window missing its first minute is a lie that looks like an answer.

    Morde: drop the completeness refusal and this returns the open of the SECOND minute while
    still being labelled `first_open` — a number with the right name and the wrong meaning,
    which is the failure mode this repository spends the most effort on.
    """
    origin, stored = _faithful_pair()
    without_first = tuple(r for r in stored if r.event_time != origin[0].bucket_end)
    with pytest.raises(CandleFidelityError, match="NOT MEASURED, not a smaller measurement"):
        aggregate_stored_window(without_first, expected_buckets=5)
    with pytest.raises(CandleFidelityError, match="NOT MEASURED"):
        aggregate_origin_window(origin[:4], expected_buckets=5)


def test_an_aggregate_over_an_empty_window_is_refused_at_the_argument() -> None:
    """`expected_buckets=0` asks for four numbers about nothing."""
    with pytest.raises(CandleFidelityError, match="empty window"):
        aggregate_origin_window((), expected_buckets=0)


# ── THE CARRIED CELL: THE ACHADO'S `21:13`, EXPLAINED BY A FIELD ALREADY ON THE WIRE ────────


def test_a_cell_published_before_the_instant_it_answers_is_classified_as_carried() -> None:
    """A NEGATIVE publication lag proves the answering observation belongs to an earlier bucket.

    ⛔ THE PROOF IS ARITHMETIC. `build_klines_to_rows` publishes only buckets `is_closed_bucket`
    admits (`close_time_ms < received_at`) and stamps `available_at = received_at`, so every
    written row satisfies `available_at >= bucket_end`. A served cell with
    `available_at < event_time` therefore cannot be an observation OF that instant.

    Morde: classify a negative lag as `LIVE_TAIL` and the harness convicts the collector for
    every minute the collection simply did not cover — which is what the first live run of this
    harness did before this branch existed `[MEDIDO 2026-09-19: lag_ms = -53.993 on the
    achado's own cell]`.
    """
    instant = _T0 + KLINES_OHLC_NATIVE_GRID_MS
    carried = StoredReading(
        reduction=Reduction.LOW,
        event_time=instant,
        value=Decimal("81001.00"),
        available_at=instant - KLINES_OHLC_NATIVE_GRID_MS + 6_007,
    )
    assert carried.writer_trace is WriterTrace.CARRIED
    assert carried.publication_lag_ms == -53_993


def test_a_carried_cell_that_disagrees_with_the_origin_does_not_convict_a_writer() -> None:
    """`LOCF` over a hole is the reader doing what `max_staleness_ms` authorises.

    It is REPORTED — the minute has no observation of its own, and that matters — and it does
    not move the verdict. Morde: count carried cells in `divergences` and the harness rejects
    every quiet gap in the collection as a fidelity defect of the collector.
    """
    origin, _ = _faithful_pair(_FAITHFUL_PRICES[:1])
    instant = origin[0].bucket_end
    stored = tuple(
        StoredReading(
            reduction=reduction,
            event_time=instant,
            value=origin[0].price_of(reduction) + Decimal("5"),
            available_at=instant - KLINES_OHLC_NATIVE_GRID_MS + 2_000,
        )
        for reduction in KLINES_OHLC_REDUCTIONS
    )
    report = _compare(origin, stored)
    assert report.verdict is FidelityVerdict.NOT_MEASURED
    assert report.n_carried == 4
    assert report.n_compared == 0
    assert len(report.carried_divergences) == 4
    assert report.divergences == ()


def test_quiet_minutes_that_agree_on_a_price_are_not_folded_into_a_run() -> None:
    """Three DISTINCT observations carrying the same number is a flat market, not a carry.

    Morde: fold runs on the value alone and this reports a `LOCF` run of 3 over three healthy
    observations — the false positive the live harness actually emitted before the fold was
    tightened to `(value, available_at)`.
    """
    quiet = tuple(
        StoredReading(
            reduction=Reduction.HIGH,
            event_time=_T0 + step * KLINES_OHLC_NATIVE_GRID_MS,
            value=Decimal("81044.90"),
            available_at=_T0 + step * KLINES_OHLC_NATIVE_GRID_MS + 2_300 + step,
        )
        for step in (1, 2, 3)
    )
    assert _compare((), quiet).repeat_runs == ()


def test_a_run_that_ends_inside_the_window_is_reported_just_like_one_that_ends_at_the_edge() -> (
    None
):
    """A stuck reading followed by a healthy one still folds — the run is closed, not dropped."""
    stamp = _T0 + 2_000
    stuck = tuple(
        StoredReading(
            reduction=Reduction.OPEN,
            event_time=_T0 + step * KLINES_OHLC_NATIVE_GRID_MS,
            value=Decimal("100.0"),
            available_at=stamp,
        )
        for step in (0, 1, 2)
    )
    fresh = (
        StoredReading(
            reduction=Reduction.OPEN,
            event_time=_T0 + 3 * KLINES_OHLC_NATIVE_GRID_MS,
            value=Decimal("101.0"),
            available_at=_T0 + 3 * KLINES_OHLC_NATIVE_GRID_MS + 2_000,
        ),
    )
    runs = _compare((), stuck + fresh).repeat_runs
    assert [(run.length, run.first_event_time) for run in runs] == [(3, _T0)]


def test_a_window_whose_minutes_were_carried_is_refused_by_the_aggregate_too() -> None:
    """A carried minute has no observation of its own, so it cannot stand in the quadruple.

    Morde: admit carried cells and `first_open` becomes the open of an EARLIER minute wearing
    the name of this one — the same lie `expected_buckets` refuses for an absent cell, arriving
    through the one door that still looks like a number.
    """
    origin, stored = _faithful_pair()
    carried = tuple(
        StoredReading(
            reduction=reading.reduction,
            event_time=reading.event_time,
            value=reading.value,
            available_at=reading.event_time - KLINES_OHLC_NATIVE_GRID_MS + 2_000,
        )
        if reading.event_time == origin[0].bucket_end
        else reading
        for reading in stored
    )
    with pytest.raises(CandleFidelityError, match="NOT MEASURED, not a smaller measurement"):
        aggregate_stored_window(carried, expected_buckets=5)
