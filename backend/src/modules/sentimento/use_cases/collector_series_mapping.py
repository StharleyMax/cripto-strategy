r"""The `SeriesKey` mapping `collectors_cli.main()` was missing: `T-01.4`'s named `[NAO SEI]`.

`infra/redis_stream_series_sink.py` and `domain/price_source_catalog.py` both refused, on the
record, to decide which `SeriesKey`(s) one `premiumIndex` reading or one keyed `forceOrder`
liquidation becomes — "no catalog for these two producers exists yet ... this task's dependencies
do not resolve it". That refusal was correct at `T-01.4` (no run-shape, no symbol universe, no
consumer yet); it stopped being correct the day `collectors_cli.main()` shipped with NO OTHER
default, so `_mapping_not_decided_yet` fired on the first non-empty read in every real
environment — `[MEDIDO 2026-09-08]`: `docker inspect deploy-collector-1 --format
'{{.RestartCount}}'` -> 55 restarts in ~10 min
(`docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md` §1.1,
`docs/context/captura-em-producao/gates/CA-E2E-local.md` §5). No test ever exercised the real
mapping either: `backend/tests/helpers/collectors_cli_driver.py` injects `_never_maps`/
`_one_row_premium_index_mapping`, fabricated stand-ins, in every scenario.

`[PREMISSA-OWNER: 2026-09-08]`, literal: *"uma das primeiras definições fizemos nessa applicação
foi definir os simbolos q iam rodar inicialmente. (BTCUSDT, SOLUSDT, EHTUSDT, LINKUSDT)"*.
`EHTUSDT` is corrected to `ETHUSDT` below — `[MEDIDO 2026-09-08]`:
`curl -s https://fapi.binance.com/fapi/v1/exchangeInfo` lists `ETHUSDT` among USDⓈ-M Futures
symbols and does not list `EHTUSDT` at all; `EHTUSDT` is not a tradable pair on any Binance
market. This module is where that four-symbol universe becomes the actual filter both collector
threads apply — no OTHER symbol from the batch/stream ever reaches a `SeriesRow` today.

── WHAT `SeriesRow` DOES AND DOES NOT CARRY, AND WHY THAT SHRINKS THIS DECISION ────────────────

`domain/provenance.py`'s `SeriesRow` has NO numeric value column (`infra/postgres_series_sink.py`
§`SCHEMA_SQL` confirms: `md.series` stores identity + provenance + timing, never a price or a
rate). Building the mapping below is therefore a decision about WHICH `SeriesKey`(s) exist and
WHEN they were observed, never about what number to publish — the raw bytes stay exactly where
`ADR-004`/`force_order_raw_recorder.py` and `infra/premium_index_jsonl_sink.py` already put them,
untouched by this module. That is what keeps this a `quant-architect` catalog decision instead of
a numeric-modeling one.

── THREE METRICS, EACH WITH A NAMED PRECEDENT — NOT FOUR, NOT ZERO ─────────────────────────────

`premiumIndex` publishes seven fields per symbol (`domain/premium_index_batch.py`); this module
catalogs TWO of them, for the same reason `price_source_catalog.py` leaves `index_price` and
`estimatedSettlePrice` uncataloged: "cataloguing a series nobody reads yet would be a row with no
evidence behind it."

  * `mark_price` — `Nature.STOCK`/`Reduction.POINT`, the live poll's own reading. Distinct from
    the ALREADY-cataloged `price_mark_close` (`price_source_catalog.py`): that one is a 5-minute
    `Reduction.CLOSE` reconstruction from the `metrics` dump (`sum_open_interest_value /
    sum_open_interest`, `D4.9`), a different `SeriesKey` by every one of `interval`/`reduction`.
    Two names for the same underlying concept, at two different grids, is exactly what
    `series_key.py`'s fifteen terms exist to keep apart rather than collapse.
  * `FundingSource.ESTIMATED.value` (`"funding_estimado"`, `domain/funding_settlement.py`) — NOT
    a new name: that module already named `premiumIndex.lastFundingRate` polling as its own
    future producer ("this module's shape does not foreclose it"). Reusing the constant, not
    hand-writing the string, is what keeps the two modules from drifting on the same word.

`estimatedSettlePrice` and `interestRate` are left uncataloged for the identical reason
`index_price` is: no `price_use`/consumer exists for either today, `[NAO SEI]` left named.

`!forceOrder@arr` gets ONE metric, `"liquidation"` (`Nature.EVENT`, `Reduction.POINT` — "one
reading, stamped at the close of the window" degenerates correctly to one instant when the window
has zero width): a raw liquidation carries `price`/`orig_qty` (`ForceOrderNaturalKey`), but
`SeriesRow` has nowhere to put a notional value even if this module computed one, so it does not
— the row records only that a liquidation for this symbol happened AT `trade_time`, exactly the
information `md.series` can hold.

── THE OPEN QUESTION THIS MODULE DOES NOT CLOSE, NAMED RATHER THAN HIDDEN ──────────────────────

`[NAO SEI]`: `event_time`/`available_at` here are `reading.source_time`/`observation.key.
trade_time` (Binance's own clock) against `received_at` (this collector's clock) respectively —
`domain/provenance.reject_clock_skew` is never called on the rows this module builds, matching
every OTHER caller in this package today (`grep -rn 'reject_clock_skew\|build_series_row'
backend/src` has zero call sites outside `provenance.py` itself, `[MEDIDO 2026-09-08]`). The day
a caller wires that check in, the two clocks feeding these rows are exactly what it will test
against a real tolerance — this module does not foreclose that, it just does not do it yet,
because nothing else in the codebase does either.
"""

from __future__ import annotations

from collections.abc import Callable

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.funding_settlement import FundingSource
from src.modules.sentimento.domain.premium_index_batch import (
    PREMIUM_INDEX_ENDPOINT,
    PremiumIndexReading,
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
from src.modules.sentimento.use_cases.collector_run_mapping import (
    FORCE_ORDER_ENDPOINT,
    FORCE_ORDER_OBSERVER_ID,
    PREMIUM_INDEX_OBSERVER_ID,
)

# `[PREMISSA-OWNER: 2026-09-08]`, `EHTUSDT` corrected to `ETHUSDT` (module docstring). The ONLY
# symbols either collector thread turns into a `SeriesRow` today — everything else the
# `!forceOrder@arr` stream/the `premiumIndex` batch carries is read, keyed/parsed, and dropped
# before it reaches this module's two builders.
INITIAL_SYMBOLS: frozenset[str] = frozenset({"BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"})

# `verified_by` (`SeriesKey`'s fifteenth term) names the regression that pins this module's row
# shape — `series_key.py`'s own convention (`price_source_catalog.py`'s `build_klines_last_entry`
# docstring: "an explicit zero, not an unmeasured default, because `verified_by` names the test").
_VERIFIED_BY: str = "backend/tests/sentimento/test_collector_series_mapping.py"

_MARK_PRICE_METRIC: str = "mark_price"
_LIQUIDATION_METRIC: str = "liquidation"

PremiumIndexReadingToRows = Callable[[int, PremiumIndexReading], tuple[SeriesRow, ...]]
ForceOrderObservationToRows = Callable[[int, ForceOrderKeyObservation], tuple[SeriesRow, ...]]


def _mark_price_key(instrument_id: str, interval: str) -> SeriesKey:
    """Build the live `premiumIndex.markPrice` key — never `price_mark_close` (module docstring)."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=_MARK_PRICE_METRIC,
        cohort="all",
        interval=interval,
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def _funding_estimado_key(instrument_id: str, interval: str) -> SeriesKey:
    """`premiumIndex.lastFundingRate`, the running estimate `funding_settlement.py` anticipated."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=FundingSource.ESTIMATED.value,
        cohort="all",
        interval=interval,
        unit="ratio",
        denom="NA",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def _liquidation_key(instrument_id: str) -> SeriesKey:
    """One `!forceOrder@arr` event for `instrument_id` — `Nature.EVENT`, no bucket grid."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=_LIQUIDATION_METRIC,
        cohort="all",
        interval="event",
        unit="count",
        denom="NA",
        nature=Nature.EVENT,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def _build_row(
    key: SeriesKey,
    *,
    symbol: str,
    source: str,
    instant_ms: int,
    received_at: int,
    observer_id: str,
) -> SeriesRow:
    """Build the one `SeriesRow` every builder above shares — `Provenance.OBSERVED`, no value.

    `instant_ms` is the SOURCE's own clock (`reading.source_time`/`observation.key.trade_time`),
    kept as `event_time`/`bucket_end`; `received_at` is THIS collector's clock, kept as
    `available_at`/`ingested_at`/`observed_at` — the two are never collapsed into one instant
    (module docstring's "THE OPEN QUESTION").
    """
    return SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=symbol,
        source=source,
        bucket_end=instant_ms,
        event_time=instant_ms,
        available_at=received_at,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=received_at,
        observed_at=received_at,
        provenance=Provenance.OBSERVED,
        src_label_raw=source,
        observer_id=observer_id,
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=None,
    )


def build_premium_index_to_rows(
    *,
    interval_s: float,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> PremiumIndexReadingToRows:
    """Build the REAL `premium_index_to_rows` `collectors_cli.main()` was missing.

    `interval_s` closes over `config.premium_index_cycle_interval_s` (`Q3` §4: "Decisao: 60
    segundos" by default) so the `SeriesKey.interval` term reflects the ACTUAL configured poll
    cadence rather than a hardcoded `"60s"` that would silently drift the day the env var is
    overridden. A `reading.symbol` outside `symbols` yields NO rows — the owner's four-symbol
    universe is enforced here, once, rather than by every caller remembering to filter.
    """
    interval = f"{int(interval_s)}s"

    def _to_rows(received_at: int, reading: PremiumIndexReading) -> tuple[SeriesRow, ...]:
        if reading.symbol not in symbols:
            return ()
        return (
            _build_row(
                _mark_price_key(reading.symbol, interval),
                symbol=reading.symbol,
                source=PREMIUM_INDEX_ENDPOINT,
                instant_ms=reading.source_time,
                received_at=received_at,
                observer_id=PREMIUM_INDEX_OBSERVER_ID,
            ),
            _build_row(
                _funding_estimado_key(reading.symbol, interval),
                symbol=reading.symbol,
                source=PREMIUM_INDEX_ENDPOINT,
                instant_ms=reading.source_time,
                received_at=received_at,
                observer_id=PREMIUM_INDEX_OBSERVER_ID,
            ),
        )

    return _to_rows


def build_force_order_to_rows(
    *,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> ForceOrderObservationToRows:
    """Build the REAL `force_order_to_rows` `collectors_cli.main()` was missing.

    An `observation.key.symbol` outside `symbols` yields NO rows — the SAME four-symbol filter
    `build_premium_index_to_rows` applies, kept as two functions (not one parametrized over the
    producer) because the two raw shapes (`PremiumIndexReading` vs `ForceOrderKeyObservation`)
    share no field this module reads.
    """

    def _to_rows(received_at: int, observation: ForceOrderKeyObservation) -> tuple[SeriesRow, ...]:
        symbol = observation.key.symbol
        if symbol not in symbols:
            return ()
        return (
            _build_row(
                _liquidation_key(symbol),
                symbol=symbol,
                source=FORCE_ORDER_ENDPOINT,
                instant_ms=observation.key.trade_time,
                received_at=received_at,
                observer_id=FORCE_ORDER_OBSERVER_ID,
            ),
        )

    return _to_rows
