"""ZL-1..ZL-3 (`SPEC-001` §5.3, plan 06 item 6.13, `D6.10`) as an executable contract."""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.liquidation_zero_legitimacy import (
    ClassifiedSidePoint,
    InvalidClassifiedSidePointError,
    LiquidationSide,
    MalformedSidePointError,
    NonMonotonicSidePointsError,
    SidePoint,
    classify_side_points,
    retention_window_per_side,
)
from src.modules.sentimento.domain.provenance import Absence

# One-minute grid, matching `D6.10`'s `/liquidation-history?interval=1min` measurement.
ONE_MINUTE_MS = 60_000


def _points(*quantities: str) -> tuple[SidePoint, ...]:
    """Build a strictly increasing 1-minute-grid sequence from a list of raw quantity strings."""
    return tuple(
        SidePoint(event_time=index * ONE_MINUTE_MS, raw_quantity=quantity)
        for index, quantity in enumerate(quantities)
    )


# ── ZL-2: zero before the first non-zero of THIS side becomes `NO_SOURCE` ──────────────────


def test_zl2_leading_zeros_before_first_nonzero_become_no_source() -> None:
    """`D6.10`'s pattern: the `s` side reports `0` before it has ever been seen operating."""
    points = _points("0", "0", "0", "1.5", "0")
    classified = classify_side_points(points)

    assert [point.absence for point in classified] == [
        Absence.NO_SOURCE,
        Absence.NO_SOURCE,
        Absence.NO_SOURCE,
        None,
        None,
    ]
    assert [point.value for point in classified] == [None, None, None, Decimal("1.5"), Decimal("0")]


def test_zl2_no_source_points_carry_no_value() -> None:
    """A `NO_SOURCE` point never smuggles a numeric value alongside the absence."""
    classified = classify_side_points(_points("0"))
    assert classified[0].value is None
    assert classified[0].absence is Absence.NO_SOURCE


# ── ZL-3: zero AFTER the first non-zero is a legitimate, distinguishable value ─────────────


def test_zl3_zero_after_first_nonzero_is_a_legitimate_value_not_absence() -> None:
    """Once a side has proved life, a later zero is real data — `Decimal(0)`, not `NO_SOURCE`."""
    points = _points("2.0", "0", "0")
    classified = classify_side_points(points)

    assert classified[1] == ClassifiedSidePoint(
        event_time=ONE_MINUTE_MS, value=Decimal("0"), absence=None
    )
    assert classified[2] == ClassifiedSidePoint(
        event_time=2 * ONE_MINUTE_MS, value=Decimal("0"), absence=None
    )
    # The falsifier this test rejects: a mechanism that treats every zero the same way would
    # produce `Absence.NO_SOURCE` here too, exactly like the leading zeros in `ZL-2`'s test —
    # collapsing "never seen operating" and "operated, then went quiet" into one signal is the
    # defect `D6.10` measured downstream (a chart reading "no liquidation" where the truth is
    # "we do not know").
    assert classified[1].absence is None
    assert classified[2].absence is None


def test_zl3_legitimate_zero_is_never_equal_to_a_no_source_point() -> None:
    """A legitimate zero and a `NO_SOURCE` absence are never mistakable for one another by value."""
    legitimate_zero = ClassifiedSidePoint(event_time=0, value=Decimal("0"), absence=None)
    no_source = ClassifiedSidePoint(event_time=0, value=None, absence=Absence.NO_SOURCE)
    assert legitimate_zero != no_source


def test_classified_side_point_refuses_both_value_and_absence() -> None:
    """A point cannot carry a numeric value AND a named absence at the same time."""
    with pytest.raises(InvalidClassifiedSidePointError):
        ClassifiedSidePoint(event_time=0, value=Decimal("0"), absence=Absence.NO_SOURCE)


def test_classified_side_point_refuses_neither_value_nor_absence() -> None:
    """A point must carry a numeric value OR a named absence — never a bare, silent point."""
    with pytest.raises(InvalidClassifiedSidePointError):
        ClassifiedSidePoint(event_time=0, value=None, absence=None)


def test_classified_side_point_refuses_an_absence_other_than_no_source() -> None:
    """`classify_side_points` produces exactly one absence reason — a different one is a bug."""
    with pytest.raises(InvalidClassifiedSidePointError):
        ClassifiedSidePoint(event_time=0, value=None, absence=Absence.NO_POINT)


def test_classified_side_point_refuses_a_negative_value() -> None:
    """A negative liquidated quantity is not a value this side can legitimately report."""
    with pytest.raises(InvalidClassifiedSidePointError):
        ClassifiedSidePoint(event_time=0, value=Decimal("-1"), absence=None)


# ── malformed / out-of-order input ──────────────────────────────────────────────────────────


def test_classify_refuses_non_numeric_quantity() -> None:
    """A `raw_quantity` that does not parse as `Decimal` is refused, never coerced to zero."""
    with pytest.raises(MalformedSidePointError):
        classify_side_points((SidePoint(event_time=0, raw_quantity="not-a-number"),))


def test_classify_refuses_negative_quantity() -> None:
    """A negative raw quantity is refused before it could ever be classified either way."""
    with pytest.raises(MalformedSidePointError):
        classify_side_points((SidePoint(event_time=0, raw_quantity="-1"),))


def test_classify_refuses_non_monotonic_event_time() -> None:
    """Points out of increasing `event_time` order are refused, never silently re-ordered."""
    points = (
        SidePoint(event_time=ONE_MINUTE_MS, raw_quantity="0"),
        SidePoint(event_time=0, raw_quantity="1"),
    )
    with pytest.raises(NonMonotonicSidePointsError):
        classify_side_points(points)


def test_classify_refuses_duplicate_event_time() -> None:
    """Two points sharing one `event_time` are refused — `<=`, not strict `<`, catches the tie."""
    points = (
        SidePoint(event_time=0, raw_quantity="0"),
        SidePoint(event_time=0, raw_quantity="1"),
    )
    with pytest.raises(NonMonotonicSidePointsError):
        classify_side_points(points)


def test_classify_empty_sequence_returns_empty() -> None:
    """An empty side has nothing to classify, and returns nothing rather than refusing."""
    assert classify_side_points(()) == ()


# ── ZL-1: `pontos x intervalo` recomputed PER SIDE, never for the whole series ─────────────


def test_zl1_retention_window_is_per_side_not_summed() -> None:
    """The `l` and `s` sides retain DIFFERENT windows because they have different point counts.

    `long` has 1 leading `NO_SOURCE` bucket then 3 legitimate points; `short` has 3 leading
    `NO_SOURCE` buckets then 1 legitimate point. A mechanism that summed both sides' RAW bucket
    counts before multiplying (`4 + 4 = 8` buckets) would report the SAME window for both sides
    (`8 x 60_000 ms`) — this test rejects that: the two windows below are neither equal to each
    other nor equal to that merged number.
    """
    long_points = _points("0", "1", "2", "3")
    short_points = _points("0", "0", "0", "5")

    long_classified = classify_side_points(long_points)
    short_classified = classify_side_points(short_points)

    long_window = retention_window_per_side(
        LiquidationSide.LONG, long_classified, interval_ms=ONE_MINUTE_MS
    )
    short_window = retention_window_per_side(
        LiquidationSide.SHORT, short_classified, interval_ms=ONE_MINUTE_MS
    )

    assert long_window.n_points == 3
    assert long_window.window_ms == 3 * ONE_MINUTE_MS
    assert short_window.n_points == 1
    assert short_window.window_ms == 1 * ONE_MINUTE_MS

    # The falsifier: a "whole series" (wrong) mechanism computes ONE count for both sides —
    # here, summing the raw bucket counts of both sides (4 + 4 = 8) and applying it to each.
    whole_series_wrong_window_ms = (len(long_points) + len(short_points)) * ONE_MINUTE_MS
    assert long_window.window_ms != whole_series_wrong_window_ms
    assert short_window.window_ms != whole_series_wrong_window_ms
    assert long_window.window_ms != short_window.window_ms


def test_zl1_no_source_points_never_count_toward_the_window() -> None:
    """`NO_SOURCE` buckets (ZL-2) are not retained observations of this side (ZL-1's other half).

    Counting them would let a side that has NEVER reported a non-zero value still claim a
    non-zero retention window — exactly the optimism `NO_SOURCE` exists to remove, one function
    downstream.
    """
    all_no_source = classify_side_points(_points("0", "0", "0"))
    window = retention_window_per_side(
        LiquidationSide.SHORT, all_no_source, interval_ms=ONE_MINUTE_MS
    )
    assert window.n_points == 0
    assert window.window_ms == 0


def test_zl1_reproduces_d6_10_pattern_at_fixture_scale() -> None:
    """Reproduces `D6.10`'s measured shape: many leading `s = 0` buckets, then real activity.

    `SPEC-001` §5.3 / `D6.10` measured **361 buckets with `s = 0` literal** against real
    `/liquidation-history?interval=1min` data whose `daily` aggregate reports real non-zero BTC
    totals for the same days (`289,65 / 154,53 / 4.547,61 BTC`) — evidence that those buckets
    are "never seen operating", not "zero liquidations". That capture is raw third-party data
    and is not versioned in this repository (`CLAUDE.md`, "Dado bruto nao e versionado"); this
    fixture reproduces the SAME PATTERN — N leading zeros before a side's first non-zero — at a
    scale a list literal can carry, which is what `classify_side_points` actually decides on.
    """
    leading_zero_count = 20
    points = _points(*(["0"] * leading_zero_count), "289.65", "0", "154.53")
    classified = classify_side_points(points)

    no_source_points = [point for point in classified if point.absence is Absence.NO_SOURCE]
    legitimate_points = [point for point in classified if point.absence is None]

    assert len(no_source_points) == leading_zero_count
    assert len(legitimate_points) == 3
    assert legitimate_points[0].value == Decimal("289.65")
    # The zero immediately after the first non-zero is legitimate, not `NO_SOURCE`.
    assert legitimate_points[1].value == Decimal("0")
    assert legitimate_points[2].value == Decimal("154.53")

    window = retention_window_per_side(LiquidationSide.SHORT, classified, interval_ms=ONE_MINUTE_MS)
    assert window.n_points == 3
    assert window.window_ms == 3 * ONE_MINUTE_MS


def test_retention_window_refuses_non_positive_interval() -> None:
    """A zero or negative `interval_ms` has no meaning as a grid width."""
    with pytest.raises(ValueError):
        retention_window_per_side(LiquidationSide.LONG, (), interval_ms=0)


def test_liquidation_side_values_are_the_coinalyze_wire_fields() -> None:
    """`LiquidationSide` values ARE the wire field letters (`docs/medicao-coinalyze.md` §2.1)."""
    assert LiquidationSide.LONG.value == "l"
    assert LiquidationSide.SHORT.value == "s"
