"""`ADR-037`'s falsifier, versioned: the M3 matrix, 2 widths x 2 natures, four numbers pinned.

`ADR-037` §"Falsificador desta ADR" is explicit that the matrix which diagnosed the defect was
produced by an ad-hoc script and that *"um falsificador que mora em `/tmp` nao e falsificador"*.
This module is the versioned replacement, and it pins all four cells of M3:

| series (BTCUSDT)                       | `bucket_interval_ms = 60_000` | `= 300_000` |
|----------------------------------------|------------------------------:|------------:|
| `globalLongShortAccountRatio` · RATIO   | **0 / 61**                    | **4 / 61**  |
| `openInterestHist` · STOCK              | 1 / 61                        | 1 / 61      |

plus the two `E1`/`D16`-simulated rows (48/61 and 61/61) the same measurement carried.

⚠️ THE FIXTURES ARE NOT INVENTED SHAPES. They reproduce, in miniature, the publication pattern
measured on the live base — `ADR-037`/M1 (lag per endpoint), M2 (5-minute spacing) and M5 (at
most 2 live buckets per symbol, every other row a backfill batch):

* RATIO: buckets every 300_000 ms; ONE live batch publishing the second-newest bucket at
  `bucket_end + 66_712` (M1's `globalLongShortAccountRatio` minimum lag); every other bucket
  stamped with a batch instant past the end of the window, which is what "backfill, invisible
  to `as_of` until `D16`" means arithmetically.
* STOCK: buckets every 300_000 ms, ALL stamped with ONE batch instant at
  `last_bucket_end + 34_532` (M1's `openInterestHist` minimum lag) — the single-`available_at`
  shape the live rows actually have.

The matrix is re-measured here at 2026-09-12 against the live base and agrees cell by cell
`[MEDIDO 2026-09-12: 61 grid instants, t = grid + 59_999, the real `as_of`; RATIO n=1.000 rows
-> 0/61 and 4/61, STOCK n=2.016 rows -> 1/61 and 1/61]`.

WHAT EACH ROW OF THE MATRIX PROVES, in `ADR-037`'s own words:

1. MORDE — the RATIO row moves from 0 to 4 with `CARRY_FORWARD_BY_NATURE[Nature.RATIO]`
   untouched at `False`. `test_ratio_carry_forward_is_still_false` pins that premise: if anyone
   has to flip it for a DoD to pass, `ADR-037`'s diagnosis was wrong and options (A)/(B)/(C)
   come back to the table.
2. CALA — injecting `60_000` back gives EXACTLY `0 / 61`. A test that passed under both widths
   would not be measuring this decision at all.
3. THE NEGATIVE CONTROL — the STOCK row is INVARIANT under the width (1 -> 1, 61 -> 61),
   because `and not CARRY_FORWARD_BY_NATURE[...]` skips the clause entirely. If it moves, the
   change reached the carry-forward path, which `ADR-037` does not authorize touching.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Final

import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    CARRY_FORWARD_BY_NATURE,
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

SYMBOL: Final[str] = "BTCUSDT"

REPORT_STEP_MS: Final[int] = 60_000
"""`_GRID_STEP_MS` of `use_cases/series_history.py` — the REPORT's grid, `ADR-034/D6`."""

NATIVE_GRID_MS: Final[int] = 300_000
"""The 5-minute grid both `openInterestHist` and `globalLongShortAccountRatio` publish on
(`ADR-037`/M2: `p50 == max == 300_000` over n=1.000 rows per symbol)."""

GRID_INSTANTS: Final[int] = 61
"""One hour of 1-minute slots, inclusive of both ends — the window M3 exercised."""

RATIO_LAG_MS: Final[int] = 66_712
"""`ADR-037`/M1: the minimum publication lag of `globalLongShortAccountRatio`, n=4.000 rows."""

STOCK_LAG_MS: Final[int] = 34_532
"""`ADR-037`/M1: the minimum publication lag of `openInterestHist`, n=8.064 rows."""

MAX_STALENESS_MS: Final[int] = 600_000
"""Both catalogs publish `2 * interval` for a 5-minute series (`open_interest_catalog.py`)."""

WINDOW_END_MS: Final[int] = 1_789_222_200_000
"""A real `bucket_end` from the live base, aligned to both 60_000 and 300_000."""

WINDOW_START_MS: Final[int] = WINDOW_END_MS - (GRID_INSTANTS - 1) * REPORT_STEP_MS

_LOOKBACK_BUCKETS: Final[int] = 3
"""Buckets generated BEFORE the window, so the earliest grid instants have something to read —
without them the `E1`-simulated rows would measure the fixture's left edge, not the policy."""


def _key(nature: Nature, metric: str) -> SeriesKey:
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=SYMBOL,
        metric=metric,
        cohort="all",
        interval="5m",
        unit="ratio" if nature is Nature.RATIO else "BTC",
        denom="none" if nature is Nature.RATIO else "base",
        nature=nature,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_history_native_grid.py",
    )


RATIO_KEY: Final[SeriesKey] = _key(Nature.RATIO, "count_long_short_ratio")
STOCK_KEY: Final[SeriesKey] = _key(Nature.STOCK, "sum_open_interest")


def _bucket_ends() -> tuple[int, ...]:
    first = WINDOW_START_MS - _LOOKBACK_BUCKETS * NATIVE_GRID_MS
    count = (WINDOW_END_MS - first) // NATIVE_GRID_MS + 1
    return tuple(first + index * NATIVE_GRID_MS for index in range(count))


def _observation(key: SeriesKey, bucket_end: int, available_at: int) -> Observation:
    return Observation(
        row=SeriesRow(
            series_key_id=key.series_key_id(),
            symbol=SYMBOL,
            source="binance",
            bucket_end=bucket_end,
            event_time=bucket_end,
            available_at=available_at,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=available_at,
            observed_at=available_at,
            provenance=Provenance.OBSERVED,
            src_label_raw="x",
            observer_id="test",
            observer_region=UNKNOWN_OBSERVER_REGION,
            is_final=None,
            value_raw="1.2345",
        ),
        value=Decimal("1.2345"),
    )


def ratio_observations_as_measured() -> tuple[Observation, ...]:
    """Build the live shape: ONE live bucket, every other row a backfill batch past the window."""
    live_bucket = WINDOW_END_MS - NATIVE_GRID_MS
    backfill_at = WINDOW_END_MS + 10 * REPORT_STEP_MS
    return tuple(
        _observation(
            RATIO_KEY,
            bucket_end,
            bucket_end + RATIO_LAG_MS if bucket_end == live_bucket else backfill_at,
        )
        for bucket_end in _bucket_ends()
    )


def stock_observations_as_measured() -> tuple[Observation, ...]:
    """Build the live shape: every row stamped with ONE batch instant, `last + 34_532` (M1)."""
    batch_at = WINDOW_END_MS + STOCK_LAG_MS
    return tuple(_observation(STOCK_KEY, bucket_end, batch_at) for bucket_end in _bucket_ends())


def observations_with_e1_lag(key: SeriesKey, lag_ms: int) -> tuple[Observation, ...]:
    """`E1`/`D16` simulated: every bucket published one real lag after it closed."""
    return tuple(
        _observation(key, bucket_end, bucket_end + lag_ms) for bucket_end in _bucket_ends()
    )


def _count_readable(
    key: SeriesKey, observations: tuple[Observation, ...], *, bucket_interval_ms: int
) -> int:
    """Count grid slots that come back with a VALUE — the report's own read, instant by instant.

    `t = grid + REPORT_STEP_MS - 1` is `_read_instant(..., FINAL_ONLY)` of
    `use_cases/series_history.py`, transcribed rather than imported so this module measures the
    POLICY ARGUMENT in isolation: the only term that differs between the two columns of the
    matrix is `bucket_interval_ms`.
    """
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=MAX_STALENESS_MS,
        render_max_staleness_ms=MAX_STALENESS_MS,
        bucket_interval_ms=bucket_interval_ms,
        first_capture_at=None,
    )
    readable = 0
    for index in range(GRID_INSTANTS):
        instant = WINDOW_START_MS + index * REPORT_STEP_MS
        read_at = instant + REPORT_STEP_MS - 1
        reading = as_of(
            series=key,
            symbol=SYMBOL,
            t=read_at,
            observations=observations,
            policy=policy,
            bar_policy=BarPolicy.FINAL_ONLY,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=read_at,
        )
        if reading.value is not None:
            readable += 1
    return readable


# ── The matrix itself — every cell of `ADR-037`/M3, as one parametrized table ───────────────


@pytest.mark.parametrize(
    ("case", "expected_at_report_step", "expected_at_native_grid"),
    [
        ("ratio_as_measured", 0, 4),
        ("ratio_with_e1", 0, 48),
        ("stock_as_measured", 1, 1),
        ("stock_with_e1", 61, 61),
    ],
)
def test_the_m3_matrix(
    case: str, expected_at_report_step: int, expected_at_native_grid: int
) -> None:
    """Both columns of `ADR-037`/M3, cell by cell, with the width as the ONLY varying term."""
    key, observations = {
        "ratio_as_measured": (RATIO_KEY, ratio_observations_as_measured()),
        "ratio_with_e1": (RATIO_KEY, observations_with_e1_lag(RATIO_KEY, RATIO_LAG_MS)),
        "stock_as_measured": (STOCK_KEY, stock_observations_as_measured()),
        "stock_with_e1": (STOCK_KEY, observations_with_e1_lag(STOCK_KEY, STOCK_LAG_MS)),
    }[case]
    at_report_step = _count_readable(key, observations, bucket_interval_ms=REPORT_STEP_MS)
    at_native_grid = _count_readable(key, observations, bucket_interval_ms=NATIVE_GRID_MS)
    assert (at_report_step, at_native_grid) == (
        expected_at_report_step,
        expected_at_native_grid,
    ), (
        f"{case}: {at_report_step}/{GRID_INSTANTS} at the report step and "
        f"{at_native_grid}/{GRID_INSTANTS} at the native grid; ADR-037/M3 measured "
        f"{expected_at_report_step} and {expected_at_native_grid}"
    )


def test_the_stock_row_is_invariant_under_the_width() -> None:
    """The negative control (`ADR-037` falsifier item 3): carry-forward skips the clause.

    Stated as its own test, not only as two equal numbers in the table above, because this is
    the assertion that would catch a change reaching the carry-forward path — the one path
    `ADR-037` explicitly does not authorize touching.
    """
    for observations in (
        stock_observations_as_measured(),
        observations_with_e1_lag(STOCK_KEY, STOCK_LAG_MS),
    ):
        assert _count_readable(
            STOCK_KEY, observations, bucket_interval_ms=REPORT_STEP_MS
        ) == _count_readable(STOCK_KEY, observations, bucket_interval_ms=NATIVE_GRID_MS)


def test_ratio_carry_forward_is_still_false() -> None:
    """`ADR-037` falsifier item 1: the fix works WITHOUT touching `CARRY_FORWARD_BY_NATURE`.

    If this ever has to become `True` for a `DoD` to pass, the diagnosis in `ADR-037` was wrong
    and escalated options (A)/(B)/(C) return to the table — which is exactly why the premise is
    pinned here, beside the numbers it makes true, and not left to a `grep` nobody runs.
    """
    assert CARRY_FORWARD_BY_NATURE[Nature.RATIO] is False
    assert CARRY_FORWARD_BY_NATURE[Nature.STOCK] is True
