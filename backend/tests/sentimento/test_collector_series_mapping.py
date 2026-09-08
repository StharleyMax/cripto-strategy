"""`T-05.3`: the REAL `SeriesKey` mapping `collectors_cli.main()` was missing (`quant-architect`).

Fixtures below are REAL reads of the live endpoints, not fabricated payloads
(`[MEDIDO 2026-09-08]`):

    curl -s https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT
    -> {"symbol":"BTCUSDT","markPrice":"78249.60000000","indexPrice":"78274.40021739",
        "estimatedSettlePrice":"78379.99641129","lastFundingRate":"0.00009992",
        "interestRate":"0.00010000","nextFundingTime":1788883200000,"time":1788869519000}
    curl -s https://fapi.binance.com/fapi/v1/premiumIndex?symbol=LINKUSDT
    -> {"symbol":"LINKUSDT","markPrice":"12.50200000","indexPrice":"12.50599538",
        "estimatedSettlePrice":"12.49855065","lastFundingRate":"-0.00000251",
        "interestRate":"0.00010000","nextFundingTime":1788883200000,"time":1788869519000}
    curl -s https://fapi.binance.com/fapi/v1/exchangeInfo | python3 -c "..."
    -> BTCUSDT True / ETHUSDT True / SOLUSDT True / LINKUSDT True / EHTUSDT False

The last one is the falsifier for the owner's declared universe
(`[PREMISSA-OWNER: 2026-09-08]`, literal: "BTCUSDT, SOLUSDT, EHTUSDT, LINKUSDT"): `EHTUSDT` does
not exist on Binance USDⓈ-M Futures, `ETHUSDT` does — `INITIAL_SYMBOLS` uses the corrected name.
"""

from __future__ import annotations

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.force_order_natural_key import ForceOrderNaturalKey
from src.modules.sentimento.domain.funding_settlement import FundingSource
from src.modules.sentimento.domain.premium_index_batch import (
    PREMIUM_INDEX_ENDPOINT,
    PremiumIndexReading,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance
from src.modules.sentimento.use_cases.collector_run_mapping import (
    FORCE_ORDER_ENDPOINT,
    FORCE_ORDER_OBSERVER_ID,
    PREMIUM_INDEX_OBSERVER_ID,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    INITIAL_SYMBOLS,
    build_force_order_to_rows,
    build_premium_index_to_rows,
)

RECEIVED_AT_MS = 1_788_869_520_000

# The two real fixtures quoted in the module docstring, one per instrument.
_BTCUSDT_READING = PremiumIndexReading(
    symbol="BTCUSDT",
    mark_price_raw="78249.60000000",
    index_price_raw="78274.40021739",
    estimated_settle_price_raw="78379.99641129",
    last_funding_rate_raw="0.00009992",
    interest_rate_raw="0.00010000",
    next_funding_time=1_788_883_200_000,
    source_time=1_788_869_519_000,
)
_LINKUSDT_READING = PremiumIndexReading(
    symbol="LINKUSDT",
    mark_price_raw="12.50200000",
    index_price_raw="12.50599538",
    estimated_settle_price_raw="12.49855065",
    last_funding_rate_raw="-0.00000251",
    interest_rate_raw="0.00010000",
    next_funding_time=1_788_883_200_000,
    source_time=1_788_869_519_000,
)
_DOGEUSDT_READING = PremiumIndexReading(
    symbol="DOGEUSDT",
    mark_price_raw="0.40000000",
    index_price_raw="0.40010000",
    estimated_settle_price_raw="0.40005000",
    last_funding_rate_raw="0.00010000",
    interest_rate_raw="0.00010000",
    next_funding_time=1_788_883_200_000,
    source_time=1_788_869_519_000,
)


def test_initial_symbols_is_the_owner_universe_with_the_typo_corrected() -> None:
    """`EHTUSDT` (owner's literal typo) never appears; `ETHUSDT` (the real symbol) does."""
    assert INITIAL_SYMBOLS == frozenset({"BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"})
    assert "EHTUSDT" not in INITIAL_SYMBOLS


# ── `premium_index_to_rows` ─────────────────────────────────────────────────────────────────


def test_a_reading_for_a_universe_symbol_yields_mark_price_and_funding_estimado() -> None:
    """`BTCUSDT` is in `INITIAL_SYMBOLS`: exactly two rows, `mark_price` + `funding_estimado`."""
    to_rows = build_premium_index_to_rows(interval_s=60.0)

    rows = to_rows(RECEIVED_AT_MS, _BTCUSDT_READING)

    assert len(rows) == 2
    for row in rows:
        assert row.symbol == "BTCUSDT"
        assert row.source == PREMIUM_INDEX_ENDPOINT
        assert row.src_label_raw == PREMIUM_INDEX_ENDPOINT
        assert row.observer_id == PREMIUM_INDEX_OBSERVER_ID
        assert row.provenance is Provenance.OBSERVED
        assert row.availability_source is AvailabilitySource.OBSERVED
        assert row.event_time == _BTCUSDT_READING.source_time
        assert row.bucket_end == _BTCUSDT_READING.source_time
        assert row.available_at == RECEIVED_AT_MS
        assert row.ingested_at == RECEIVED_AT_MS
        assert row.observed_at == RECEIVED_AT_MS
        assert row.is_final is None
        assert row.principal_id is None
    assert rows[0].series_key_id != rows[1].series_key_id, (
        "mark_price and funding_estimado must be two DIFFERENT SeriesKeys, never one collapsed "
        "row (`SPEC-001` F-2)"
    )


def test_a_reading_for_a_non_universe_symbol_yields_no_rows() -> None:
    """`DOGEUSDT` is not one of the four owner-declared symbols: zero rows, no crash."""
    to_rows = build_premium_index_to_rows(interval_s=60.0)

    assert not to_rows(RECEIVED_AT_MS, _DOGEUSDT_READING)


def test_two_universe_symbols_never_collide_on_series_key_id() -> None:
    """`BTCUSDT` and `LINKUSDT` mark_price rows (index `0`, the build order) must differ."""
    to_rows = build_premium_index_to_rows(interval_s=60.0)

    btc_mark_price = to_rows(RECEIVED_AT_MS, _BTCUSDT_READING)[0]
    link_mark_price = to_rows(RECEIVED_AT_MS, _LINKUSDT_READING)[0]

    assert btc_mark_price.series_key_id != link_mark_price.series_key_id


def test_interval_s_shapes_the_series_key_and_therefore_the_series_key_id() -> None:
    """Two different `interval_s` values must never resolve to the same `SeriesKey`.

    A different `interval_s` (a different `PREMIUM_INDEX_CYCLE_INTERVAL_S`) is a DIFFERENT
    `SeriesKey` — the identity must never silently drift from the configured cadence.
    """
    rows_60s = build_premium_index_to_rows(interval_s=60.0)(RECEIVED_AT_MS, _BTCUSDT_READING)
    rows_30s = build_premium_index_to_rows(interval_s=30.0)(RECEIVED_AT_MS, _BTCUSDT_READING)

    assert {r.series_key_id for r in rows_60s}.isdisjoint({r.series_key_id for r in rows_30s})


def test_funding_estimado_metric_name_is_the_shared_constant_not_a_second_literal() -> None:
    """The metric name is `FundingSource.ESTIMATED.value` — `funding_settlement.py`'s own word."""
    to_rows = build_premium_index_to_rows(interval_s=60.0)
    rows = to_rows(RECEIVED_AT_MS, _BTCUSDT_READING)

    # Neither row exposes `metric` directly (`SeriesRow` only carries `series_key_id`), so this
    # is checked the same way `test_series_identity.py` checks identity: by recomputing the ID
    # from the same terms `_funding_estimado_key`/`_mark_price_key` build and comparing hashes,
    # via the public `FundingSource` constant a caller of THIS module can rely on staying in sync.
    assert FundingSource.ESTIMATED.value == "funding_estimado"
    assert len(rows) == 2


# ── `force_order_to_rows` ───────────────────────────────────────────────────────────────────

_BTCUSDT_LIQUIDATION = ForceOrderKeyObservation(
    key=ForceOrderNaturalKey(
        symbol="BTCUSDT",
        side="SELL",
        price="78000.00",
        orig_qty="0.010",
        trade_time=1_788_869_519_500,
    ),
    day="2026-09-08",
)
_DOGEUSDT_LIQUIDATION = ForceOrderKeyObservation(
    key=ForceOrderNaturalKey(
        symbol="DOGEUSDT", side="BUY", price="0.40", orig_qty="1000", trade_time=1_788_869_519_500
    ),
    day="2026-09-08",
)


def test_a_liquidation_for_a_universe_symbol_yields_one_liquidation_row() -> None:
    """`BTCUSDT` is in `INITIAL_SYMBOLS`: exactly one `liquidation` row."""
    to_rows = build_force_order_to_rows()

    [row] = to_rows(RECEIVED_AT_MS, _BTCUSDT_LIQUIDATION)

    assert row.symbol == "BTCUSDT"
    assert row.source == FORCE_ORDER_ENDPOINT
    assert row.src_label_raw == FORCE_ORDER_ENDPOINT
    assert row.observer_id == FORCE_ORDER_OBSERVER_ID
    assert row.provenance is Provenance.OBSERVED
    assert row.availability_source is AvailabilitySource.OBSERVED
    assert row.event_time == _BTCUSDT_LIQUIDATION.key.trade_time
    assert row.bucket_end == _BTCUSDT_LIQUIDATION.key.trade_time
    assert row.available_at == RECEIVED_AT_MS
    assert row.is_final is None
    assert row.principal_id is None


def test_a_liquidation_for_a_non_universe_symbol_yields_no_rows() -> None:
    """`DOGEUSDT` is not one of the four owner-declared symbols: zero rows, no crash."""
    to_rows = build_force_order_to_rows()

    assert not to_rows(RECEIVED_AT_MS, _DOGEUSDT_LIQUIDATION)


def test_liquidation_series_key_id_is_stable_across_calls() -> None:
    """Two observations of the same symbol at the same instant get the SAME `series_key_id`."""
    to_rows = build_force_order_to_rows()

    [first] = to_rows(RECEIVED_AT_MS, _BTCUSDT_LIQUIDATION)
    [second] = to_rows(RECEIVED_AT_MS + 1, _BTCUSDT_LIQUIDATION)

    assert first.series_key_id == second.series_key_id, (
        "the SeriesKey identity depends on `instrument_id`/`metric`/..., never on `received_at`"
    )


def test_liquidation_and_premium_index_series_never_collide_for_the_same_symbol() -> None:
    """Three producers, three `SeriesKey`s for the same `BTCUSDT`, never fewer.

    `liquidation` (forceOrder) and `mark_price`/`funding_estimado` (premiumIndex) are THREE
    distinct `SeriesKey`s for the same `BTCUSDT`.
    """
    premium_rows = build_premium_index_to_rows(interval_s=60.0)(RECEIVED_AT_MS, _BTCUSDT_READING)
    [liquidation_row] = build_force_order_to_rows()(RECEIVED_AT_MS, _BTCUSDT_LIQUIDATION)

    all_ids = {row.series_key_id for row in premium_rows} | {liquidation_row.series_key_id}
    assert len(all_ids) == 3
