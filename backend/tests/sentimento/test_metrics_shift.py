"""`plano 04` items 4.1/4.2/4.4 as an executable contract, on synthetic rows."""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.metrics_shift import (
    LABEL_SHIFT_MS,
    LabeledMetricsRow,
    RawMetricsRow,
    detect_gaps,
    label_and_sort_metrics_rows,
    label_metrics_row,
    shift_to_event_time,
)

_ZERO = Decimal("0")


def _raw(create_time_ms: int, create_time_raw: str = "") -> RawMetricsRow:
    """Build a `RawMetricsRow` with every metric at zero — only the clock fields are the point."""
    return RawMetricsRow(
        create_time_ms=create_time_ms,
        create_time_raw=create_time_raw or str(create_time_ms),
        symbol="BTCUSDT",
        sum_open_interest=_ZERO,
        sum_open_interest_value=_ZERO,
        count_toptrader_long_short_ratio=_ZERO,
        sum_toptrader_long_short_ratio=_ZERO,
        count_long_short_ratio=_ZERO,
        sum_taker_long_short_vol_ratio=_ZERO,
    )


# ── 4.1: the shift is ONE constant, applied ONCE per row ──────────────────────────────────


def test_the_shift_is_exactly_300000_ms() -> None:
    """`SPEC-001` §2.2's constant, named so a future edit of the value is a diff, not a typo."""
    assert LABEL_SHIFT_MS == 300_000


def test_shift_to_event_time_adds_the_constant_and_nothing_else() -> None:
    """A pure function of one integer — no clock, no rounding, no per-symbol branch."""
    assert shift_to_event_time(0) == 300_000
    assert shift_to_event_time(1_755_648_600_000) == 1_755_648_600_000 + 300_000


def test_label_metrics_row_carries_src_label_raw_unchanged() -> None:
    """`src_label_raw` is the file's OWN string, not a re-render of the parsed number."""
    raw = _raw(1_755_648_600_000, create_time_raw="2026-08-20 00:10:00")
    labeled = label_metrics_row(raw)
    assert labeled.event_time == 1_755_648_600_000 + LABEL_SHIFT_MS
    assert labeled.src_label_raw == "2026-08-20 00:10:00"
    assert labeled.symbol == "BTCUSDT"


def test_the_shift_applies_to_the_whole_row_not_per_metric_column() -> None:
    """One `event_time` per row: `plano 04` item 4.1, "aplicado UMA vez às oito colunas".

    A per-column shift would need eight instants; this dataclass has exactly one, which is
    the type-level guarantee that a future change cannot special-case a single metric without
    changing the shape of `LabeledMetricsRow` itself — a diff nobody could miss.
    """
    labeled_fields = {
        f
        for f in vars(
            LabeledMetricsRow(
                event_time=0,
                src_label_raw="",
                symbol="",
                sum_open_interest=_ZERO,
                sum_open_interest_value=_ZERO,
                count_toptrader_long_short_ratio=_ZERO,
                sum_toptrader_long_short_ratio=_ZERO,
                count_long_short_ratio=_ZERO,
                sum_taker_long_short_vol_ratio=_ZERO,
            )
        )
    }
    assert "event_time" in labeled_fields
    assert sum(1 for name in labeled_fields if "time" in name) == 1


# ── 4.2: sorting is mandatory, and there is no way to opt out ──────────────────────────────


def test_label_and_sort_returns_rows_in_event_time_order() -> None:
    """Feed it out of order; get back monotonic — the sort is not the caller's job."""
    raw_rows = [_raw(300_000), _raw(0), _raw(600_000), _raw(0)]
    labeled = label_and_sort_metrics_rows(raw_rows)
    event_times = [row.event_time for row in labeled]
    assert event_times == sorted(event_times)
    assert len(labeled) == len(raw_rows)


def test_label_and_sort_is_stable_on_ties() -> None:
    """Two rows sharing an `event_time` keep their relative order — a total order needs it."""
    raw_rows = [_raw(0, "first"), _raw(0, "second")]
    labeled = label_and_sort_metrics_rows(raw_rows)
    assert [row.src_label_raw for row in labeled] == ["first", "second"]


def test_bypassing_the_mandatory_sort_reproves_on_an_out_of_order_input() -> None:
    """The mutant `D4.1` names: label without going through `label_and_sort_metrics_rows`.

    `label_metrics_row` is exposed on its own (needed by the fixture-level regression test),
    which means it is POSSIBLE to bypass the sort by calling it directly in file order. This
    test is the falsifier: doing that on out-of-order input leaves the disorder visible, so a
    monotonicity check written against the bypassed path REPROVES — proving the sort in
    `label_and_sort_metrics_rows` is not decorative.
    """
    raw_rows = [_raw(300_000), _raw(0), _raw(600_000)]
    bypassed = tuple(label_metrics_row(raw) for raw in raw_rows)
    event_times = [row.event_time for row in bypassed]
    assert event_times != sorted(event_times)
    with pytest.raises(AssertionError):
        assert event_times == sorted(event_times)


# ── 4.4: a gap is counted, never filled ─────────────────────────────────────────────────────


def _labeled_at(*event_times: int) -> tuple[LabeledMetricsRow, ...]:
    return tuple(
        LabeledMetricsRow(
            event_time=t,
            src_label_raw=str(t),
            symbol="BTCUSDT",
            sum_open_interest=_ZERO,
            sum_open_interest_value=_ZERO,
            count_toptrader_long_short_ratio=_ZERO,
            sum_toptrader_long_short_ratio=_ZERO,
            count_long_short_ratio=_ZERO,
            sum_taker_long_short_vol_ratio=_ZERO,
        )
        for t in event_times
    )


def test_no_gap_on_a_fully_dense_grid() -> None:
    """Consecutive rows exactly one grid step apart: zero gaps, not a gap of size zero."""
    rows = _labeled_at(0, 300_000, 600_000)
    assert detect_gaps(rows, grid_ms=300_000) == ()


def test_three_consecutive_missing_buckets_are_one_gap_not_three() -> None:
    """`CA-F1-2`'s correction: 11:45/11:50/11:55 missing is ONE gap of `n_missing=3`.

    The fixture this mirrors (`data/binance/metrics/btcusdt/2026-08-12.csv`) is exercised for
    real in `test_metrics_event_time_fixtures.py`; this is the synthetic minimal case so the
    counting rule is pinned independently of any file on disk.
    """
    grid = 300_000
    rows = _labeled_at(0, 4 * grid)  # 3 buckets missing in between
    gaps = detect_gaps(rows, grid_ms=grid)
    assert len(gaps) == 1
    assert gaps[0].n_missing == 3
    assert gaps[0].from_event_time == 0
    assert gaps[0].to_event_time == 4 * grid


def test_two_separate_gaps_stay_separate() -> None:
    """A dense run between two gaps must not merge them into one."""
    grid = 300_000
    rows = _labeled_at(0, 2 * grid, 3 * grid, 6 * grid)
    gaps = detect_gaps(rows, grid_ms=grid)
    assert [(g.from_event_time, g.to_event_time, g.n_missing) for g in gaps] == [
        (0, 2 * grid, 1),
        (3 * grid, 6 * grid, 2),
    ]


def test_detect_gaps_never_returns_a_value_for_the_missing_bucket() -> None:
    """`MetricsGap` structurally cannot carry an interpolated value — there is no field for one.

    This is the type-level half of "lacuna nunca preenchida por interpolação": the strongest
    version of the guarantee is that a filled value has nowhere to be attached, not merely
    that this function chooses not to attach one.
    """
    gap_fields = set(vars(detect_gaps(_labeled_at(0, 600_000), grid_ms=300_000)[0]))
    assert gap_fields == {"from_event_time", "to_event_time", "n_missing"}


def test_detect_gaps_raises_on_a_grid_that_is_not_positive() -> None:
    """A zero or negative grid makes every delta divide into nonsense — refuse instead."""
    with pytest.raises(ValueError, match="grid_ms"):
        detect_gaps(_labeled_at(0, 300_000), grid_ms=0)


def test_detect_gaps_refuses_an_unsorted_sequence() -> None:
    """`detect_gaps` trusts its precondition exactly as far as it is documented — no further."""
    with pytest.raises(ValueError, match="not sorted"):
        detect_gaps(_labeled_at(600_000, 0), grid_ms=300_000)
