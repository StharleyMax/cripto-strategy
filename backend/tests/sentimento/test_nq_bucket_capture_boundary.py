"""`D3.8`/`QF-4`: a `quantity_field=nq` read before the first live capture is `SEM_FONTE`.

`docs/plans/SPEC-001-plataforma-dados/03_captura_continua.md`, `D3.8`, literal: "leitura sob
`quantity_field = nq` de janela anterior à 1ª captura ⇒ `SEM_FONTE`, nunca um valor. Teste: 1
janela que atravesse a borda de quando o coletor começou a existir."

The anti-weld MECHANISM itself (`as_of` + `SeriesReadPolicy.first_capture_at` +
`Absence.NO_SOURCE`) already exists and is proven, exhaustively, by `test_as_of_accessor.py`
(`T-04.4`, `D4.6` class (c)) — this file does not re-derive it. What it proves is specific to
THIS task: that a bucket folded by `aggtrade_bucket_aggregate.py` from a DUMP replay (`raw_nq
=None` on every trade, `CL-5`) produces literally NO observation an `nq`-keyed read could ever
admit, while a bucket folded from a LIVE capture (both quantities on every trade) produces one
`as_of` reads normally the moment `t` crosses `first_capture_at` — the two bucket kinds
`aggregate_by_bucket` can build, wired into the boundary this task's DoD names.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from src.modules.sentimento.domain.aggtrade_bucket_aggregate import (
    BUCKET_WIDTH_MS,
    AggTradeBucketTrade,
    aggregate_by_bucket,
)
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

SYMBOL = "BTCUSDT"
LAG_MS = 5_000

# `B_DUMP` is the bucket a CSV-dump replay would fold (`raw_nq=None` on every trade, `CL-5`).
# `B_LIVE` is the very next bucket, folded from a live capture where every trade carries both
# quantities — the instant the collector "começou a existir", which `first_capture_at` names.
B_DUMP = 1_000_000_000_000
B_LIVE = B_DUMP + BUCKET_WIDTH_MS


def _nq_key(**overrides: Any) -> SeriesKey:
    defaults: dict[str, Any] = {
        "provider": "binance",
        "venue": "binance-futures-usdm",
        "instrument_id": SYMBOL,
        "metric": "cvd_delta",
        "cohort": "all",
        "interval": "1m",
        "unit": "BASE_ASSET",
        "denom": "BASE_ASSET",
        "nature": Nature.FLOW,
        "ts_convention": TsConvention.AGGREGATE_OVER_BUCKET,
        "reduction": Reduction.SUM,
        "quantity_field": QuantityField.NQ,
        "label_shift": 0,
        "aggregation_scope": "Symbol",
        "verified_by": "tests/sentimento/test_nq_bucket_capture_boundary.py",
    }
    return SeriesKey(**{**defaults, **overrides})


def _dump_bucket_trade(agg_id: int, transact_time_ms: int) -> AggTradeBucketTrade:
    """Build a trade shaped like the S3 dump: `raw_nq=None`, always (`CL-5`)."""
    return AggTradeBucketTrade(
        agg_id=agg_id,
        transact_time_ms=transact_time_ms,
        raw_q="1",
        raw_nq=None,
        is_buyer_maker=False,
    )


def _live_bucket_trade(
    agg_id: int, transact_time_ms: int, *, raw_nq: str, is_buyer_maker: bool
) -> AggTradeBucketTrade:
    """Build a trade shaped like a live WS/REST capture: both quantities present."""
    return AggTradeBucketTrade(
        agg_id=agg_id,
        transact_time_ms=transact_time_ms,
        raw_q=raw_nq,
        raw_nq=raw_nq,
        is_buyer_maker=is_buyer_maker,
    )


def _observation_from_live_bucket(key: SeriesKey) -> Observation:
    """Fold ONE live bucket and turn its signed `nq` net flow into an `Observation`.

    `value = sum_nq_buy - sum_nq_sell` mirrors `cvd.py`'s own signed convention — this is not a
    new sign rule, it is the same one applied to the `nq` pair instead of the resolved `q`/`nq`
    scalar `CvdTrade` already carries.
    """
    (bucket,) = aggregate_by_bucket(
        SYMBOL,
        [
            _live_bucket_trade(101, B_LIVE, raw_nq="12", is_buyer_maker=False),
            _live_bucket_trade(102, B_LIVE + 1_000, raw_nq="5", is_buyer_maker=True),
        ],
    )
    assert bucket.sum_nq_buy is not None
    assert bucket.sum_nq_sell is not None
    value = bucket.sum_nq_buy - bucket.sum_nq_sell

    bucket_end = B_LIVE + BUCKET_WIDTH_MS
    available_at = bucket_end + LAG_MS
    row = SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        source="binance-ws",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=available_at,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=available_at,
        observed_at=available_at,
        provenance=Provenance.OBSERVED,
        src_label_raw="aggTrade.nq",
        observer_id="vps-1",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=None,
    )
    return Observation(row=row, value=value)


def test_d3_8_a_dump_replayed_bucket_yields_no_nq_observation_to_admit_at_all() -> None:
    """Structural half of `D3.8`: `CL-5` is enforced at the FOLD, before any read ever runs.

    A bucket built only from dump-shaped trades has `sum_nq_buy is None` — there is no `Decimal`
    to wrap into an `Observation` under `quantity_field=nq` in the first place, which is a
    stronger guarantee than "the read refuses": the weld is impossible to CONSTRUCT.
    """
    (bucket,) = aggregate_by_bucket(
        SYMBOL,
        [_dump_bucket_trade(1, B_DUMP), _dump_bucket_trade(2, B_DUMP + 1_000)],
    )
    assert bucket.sum_nq_buy is None
    assert bucket.sum_nq_sell is None


def test_d3_8_a_read_before_first_capture_is_sem_fonte_never_a_value() -> None:
    """The window that atravessa a borda: `t` inside the DUMP bucket, before `first_capture_at`.

    The only `Observation` in play comes from the LIVE bucket (the dump bucket cannot produce
    one at all, per the test above) — so this also proves the read does not accidentally admit
    a stale live point instead of correctly reporting `SEM_FONTE`.
    """
    key = _nq_key()
    live_observation = _observation_from_live_bucket(key)
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=2 * BUCKET_WIDTH_MS,
        render_max_staleness_ms=None,
        bucket_interval_ms=BUCKET_WIDTH_MS,
        first_capture_at=B_LIVE,
    )
    t_before_capture = B_DUMP + 30_000  # inside the dump bucket, before B_LIVE

    reading = as_of(
        series=key,
        symbol=SYMBOL,
        t=t_before_capture,
        observations=[live_observation],
        policy=policy,
        bar_policy=BarPolicy.FINAL_ONLY,
        purpose=ReadPurpose.RENDERING,
        knowledge_time=t_before_capture,
    )

    assert reading.value is None
    assert reading.observation is None
    assert reading.absence is Absence.NO_SOURCE


def test_d3_8_the_other_side_of_the_border_returns_the_live_value() -> None:
    """Right after `first_capture_at`, the SAME series reads the LIVE bucket's `nq` value.

    Pins that `first_capture_at` is a genuine border and not a constant that always refuses —
    the same falsifier shape `test_as_of_accessor.py::
    test_after_the_first_capture_the_nq_series_stops_being_no_source` already uses one layer up.
    """
    key = _nq_key()
    live_observation = _observation_from_live_bucket(key)
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=2 * BUCKET_WIDTH_MS,
        render_max_staleness_ms=None,
        bucket_interval_ms=BUCKET_WIDTH_MS,
        first_capture_at=B_LIVE,
    )
    bucket_end = B_LIVE + BUCKET_WIDTH_MS
    t_after_capture = bucket_end + LAG_MS

    reading = as_of(
        series=key,
        symbol=SYMBOL,
        t=t_after_capture,
        observations=[live_observation],
        policy=policy,
        bar_policy=BarPolicy.FINAL_ONLY,
        purpose=ReadPurpose.RENDERING,
        knowledge_time=t_after_capture,
    )

    assert reading.absence is None
    assert reading.value == Decimal("7")  # sum_nq_buy(12) - sum_nq_sell(5)
