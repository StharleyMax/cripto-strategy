"""QA probes: five behaviours the delivered suite does not pin. Each kills one survivor.

Every test here PASSES against `982055b` and FAILS against the mutant named in its docstring,
which is what makes the survivor a gap rather than an equivalent mutant.
"""

from __future__ import annotations

from decimal import Decimal

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    Absence,
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

BUCKET_MS = 300_000
LAG_MS = 60_000
B1 = 1_000_000_000_000
B2 = B1 + BUCKET_MS
B3 = B2 + BUCKET_MS
STALENESS_MS = 2 * BUCKET_MS + LAG_MS


def _key(**overrides: object) -> SeriesKey:
    defaults: dict[str, object] = {
        "provider": "binance",
        "venue": "binance-futures-usdm",
        "instrument_id": "BTCUSDT",
        "metric": "sum_open_interest",
        "cohort": "all",
        "interval": "5m",
        "unit": "BTC",
        "denom": "BASE_ASSET",
        "nature": Nature.STOCK,
        "ts_convention": TsConvention.POINT_AT_BUCKET_END,
        "reduction": Reduction.POINT,
        "quantity_field": QuantityField.NA,
        "label_shift": 300_000,
        "aggregation_scope": "Symbol",
        "verified_by": "tests/sentimento/test_qa_probe_survivors.py",
    }
    return SeriesKey(**{**defaults, **overrides})  # type: ignore[arg-type]


STOCK_KEY = _key()
FLOW_NQ_KEY = _key(quantity_field=QuantityField.NQ, metric="cvd_delta", nature=Nature.FLOW)


def _policy(**overrides: object) -> SeriesReadPolicy:
    defaults: dict[str, object] = {
        "asof_max_staleness_ms": STALENESS_MS,
        "render_max_staleness_ms": None,
        "bucket_interval_ms": BUCKET_MS,
        "first_capture_at": None,
    }
    return SeriesReadPolicy(**{**defaults, **overrides})  # type: ignore[arg-type]


def _row(
    key: SeriesKey,
    *,
    bucket_end: int,
    observed_at: int,
    available_at: int,
    ingested_at: int | None = None,
    source: str = "binance-rest",
) -> SeriesRow:
    return SeriesRow(
        series_key_id=key.series_key_id(),
        symbol="BTCUSDT",
        source=source,
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=available_at,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=available_at if ingested_at is None else ingested_at,
        observed_at=observed_at,
        provenance=Provenance.OBSERVED,
        src_label_raw="sumOpenInterest",
        observer_id="vps-1",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=None,
    )


def _read(
    observations: list[Observation],
    *,
    key: SeriesKey = STOCK_KEY,
    t: int,
    knowledge_time: int | None = None,
    policy: SeriesReadPolicy | None = None,
) -> object:
    return as_of(
        series=key,
        symbol="BTCUSDT",
        t=t,
        observations=observations,
        policy=_policy() if policy is None else policy,
        bar_policy=BarPolicy.FINAL_ONLY,
        purpose=ReadPurpose.ENTRY_CONDITION,
        knowledge_time=t + BUCKET_MS if knowledge_time is None else knowledge_time,
    )


def test_qa_q2_a_bucket_that_closed_exactly_at_t_is_admitted_by_r2() -> None:
    """Kills `bucket_end <= t` -> `bucket_end < t`. R-2 reaches the grid point itself."""
    rows = [
        Observation(
            row=_row(STOCK_KEY, bucket_end=B2, observed_at=B2, available_at=B2),
            value=Decimal("11.5"),
        )
    ]
    reading = _read(rows, t=B2)
    assert reading.value == Decimal("11.5")  # type: ignore[attr-defined]
    assert reading.age_ms == 0  # type: ignore[attr-defined]


def test_qa_q3_an_observation_made_exactly_at_the_horizon_is_inside_it() -> None:
    """Kills `observed_at <= knowledge_time` -> `<`. The horizon INCLUDES its own instant."""
    rows = [
        Observation(
            row=_row(STOCK_KEY, bucket_end=B2, observed_at=B2 + LAG_MS, available_at=B2 + LAG_MS),
            value=Decimal("11.5"),
        ),
        Observation(
            row=_row(STOCK_KEY, bucket_end=B3, observed_at=B3 + LAG_MS, available_at=B3 + LAG_MS),
            value=Decimal("12.5"),
        ),
    ]
    reading = _read(rows, t=B3 + LAG_MS, knowledge_time=B3 + LAG_MS)
    assert reading.value == Decimal("12.5")  # type: ignore[attr-defined]


def test_qa_q8_at_the_first_capture_instant_the_absence_is_no_point_not_no_source() -> None:
    """Kills `t < first_capture_at` -> `t <= first_capture_at`. QF-4 covers what PRECEDES."""
    reading = _read([], key=FLOW_NQ_KEY, t=B2, policy=_policy(first_capture_at=B2))
    assert reading.absence is Absence.NO_POINT  # type: ignore[attr-defined]


def test_qa_q11_the_tiebreak_reads_source_before_ingested_at() -> None:
    """Kills the reordered tuple in `_first_observation_order`.

    Two observations of one bucket tie on `observed_at`, and `source` order disagrees with
    `ingested_at` order — the only shape in which "a declared total order" says WHICH term
    decides first. The delivered tie test passes under either ordering.
    """
    tie = B2 + LAG_MS
    rows = [
        Observation(
            row=_row(
                STOCK_KEY,
                bucket_end=B2,
                observed_at=tie,
                available_at=tie,
                ingested_at=tie + 2,
                source="a-source",
            ),
            value=Decimal("1.0"),
        ),
        Observation(
            row=_row(
                STOCK_KEY,
                bucket_end=B2,
                observed_at=tie,
                available_at=tie,
                ingested_at=tie + 1,
                source="b-source",
            ),
            value=Decimal("2.0"),
        ),
    ]
    reading = _read(rows, t=B2 + LAG_MS)
    assert reading.observation.row.source == "a-source"  # type: ignore[attr-defined]
    assert reading.value == Decimal("1.0")  # type: ignore[attr-defined]


def test_qa_q18_the_projection_carries_exactly_the_eight_declared_keys() -> None:
    """Kills a dropped key in `projection()`. `D4.6` is BIT-IDENTITY, so the shape is pinned.

    A comparison of two projections stays equal when a term disappears from BOTH sides, so
    the key set has to be asserted directly or the wire shape is not pinned at all.
    """
    rows = [
        Observation(
            row=_row(STOCK_KEY, bucket_end=B2, observed_at=B2 + LAG_MS, available_at=B2 + LAG_MS),
            value=Decimal("11.5"),
        )
    ]
    projected = _read(rows, t=B2 + LAG_MS).projection()  # type: ignore[attr-defined]
    assert set(projected) == {
        "value",
        "absence",
        "knowledge_time",
        "bar_policy",
        "age_ms",
        "observed_at",
        "available_at",
        "bucket_end",
    }
