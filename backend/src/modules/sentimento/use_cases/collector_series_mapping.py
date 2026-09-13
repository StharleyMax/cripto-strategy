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
market. This module is where that four-symbol universe becomes the actual filter every collector
thread applies — no OTHER symbol from the batch/stream/page ever reaches a `SeriesRow` today.

── THE THIRD PRODUCER, ADDED BY `T-01.3` ───────────────────────────────────────────────────────

`/fapi/v1/klines` -> `klines_volume` (M1, `SPEC-007` §4.1) joins the two above at the bottom of
this file. It differs from them in one way that is worth naming up here rather than burying in
the builder: it is the only producer whose source hands back a bucket that has NOT HAPPENED YET
in full — the minute currently in progress — so this module is where `RS-3.4`'s anti-lookahead
cut is applied, and `is_closed_bucket` is where the SIGN of that cut is written down.

── THE FOURTH PRODUCER, ADDED BY `T-04.3` ──────────────────────────────────────────────────────

`/futures/data/globalLongShortAccountRatio` -> `count_long_short_ratio` (M3, `SPEC-007` §4.2,
`ADR-036/D3`) is at the very bottom of this file. It is the first producer on a `5m` grid, and the
first whose points arrive as RAW JSON objects rather than a parsed row type — see the section
header there for why the payload's two field names live in this module and nowhere else.

── WHAT `SeriesRow` DOES AND DOES NOT CARRY, AND WHY THAT SHRINKS THIS DECISION ────────────────

`domain/provenance.py`'s `SeriesRow` had NO numeric value column when this module was written
(`infra/postgres_series_sink.py` §`SCHEMA_SQL` confirmed: `md.series` stored identity +
provenance + timing, never a price or a rate). `ADR-034/D7` (plan `00`) closed that gap with
`value_raw TEXT NOT NULL` — a straight PASS-THROUGH of the raw string the reading/observation
already carries for the metric, never a value this module computes or models. Building the
mapping below is still a decision about WHICH `SeriesKey`(s) exist and WHEN they were observed;
which RAW FIELD backs `value_raw` for each metric is the same 1:1 correspondence (`mark_price`
name, `mark_price_raw` field) as every other producer in this module, not a new numeric-modeling
decision — the raw bytes stay exactly where `ADR-004`/`force_order_raw_recorder.py` and
`infra/premium_index_jsonl_sink.py` already put them, this module only points `value_raw` at the
same string. That is what keeps this a `quant-architect` catalog decision instead of a
numeric-modeling one.

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
has zero width): a raw liquidation carries `price`/`orig_qty` (`ForceOrderNaturalKey`). Since
`ADR-034/D7` (plan `00`), `value_raw` holds `observation.key.price` — the natural-key's own raw
price string, unchanged — never `orig_qty` or a notional this module would have to compute; this
module still records no size/notional, only that a liquidation for this symbol happened AT
`trade_time`, at the price the source published.

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

from collections.abc import Callable, Mapping, Sequence
from typing import Final, Protocol

from src.modules.sentimento.domain.cvd_source_catalog import build_kline_takerbuy_entry
from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.funding_settlement import FundingSource
from src.modules.sentimento.domain.instrument import base_asset
from src.modules.sentimento.domain.kline_cvd import kline_cvd_delta
from src.modules.sentimento.domain.klines_volume_catalog import build_klines_volume_entry
from src.modules.sentimento.domain.liquidation_catalog import coinalyze_liquidation_key
from src.modules.sentimento.domain.liquidation_collection import LIQUIDATION_BUCKET_MS
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key
from src.modules.sentimento.domain.modeled_availability import (
    MODELED_AVAILABILITY_SOURCE,
    modeled_available_at_for_endpoint,
)
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
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
    KLINES_ENDPOINT,
    KLINES_OBSERVER_ID,
    LIQUIDATION_HISTORY_ENDPOINT,
    LIQUIDATION_OBSERVER_ID,
    LONG_SHORT_ENDPOINT,
    LONG_SHORT_OBSERVER_ID,
    OPEN_INTEREST_HIST_ENDPOINT,
    OPEN_INTEREST_OBSERVER_ID,
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
    value_raw: str,
) -> SeriesRow:
    """Build the one `SeriesRow` every builder above shares — `Provenance.OBSERVED`.

    `instant_ms` is the SOURCE's own clock (`reading.source_time`/`observation.key.trade_time`),
    kept as `event_time`/`bucket_end`; `received_at` is THIS collector's clock, kept as
    `available_at`/`ingested_at`/`observed_at` — the two are never collapsed into one instant
    (module docstring's "THE OPEN QUESTION").

    `value_raw` (`ADR-034/D7`, `md.series` column this module's docstring predates) is the raw
    string the SAME reading/observation already carries for the metric `key` names — never a
    value this module computes: `mark_price` reads `reading.mark_price_raw`, `funding_estimado`
    reads `reading.last_funding_rate_raw`, `liquidation` reads `observation.key.price`, each the
    one field the caller already has for the metric it names.
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
        value_raw=value_raw,
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
                value_raw=reading.mark_price_raw,
            ),
            _build_row(
                _funding_estimado_key(reading.symbol, interval),
                symbol=reading.symbol,
                source=PREMIUM_INDEX_ENDPOINT,
                instant_ms=reading.source_time,
                received_at=received_at,
                observer_id=PREMIUM_INDEX_OBSERVER_ID,
                value_raw=reading.last_funding_rate_raw,
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
                value_raw=observation.key.price,
            ),
        )

    return _to_rows


# ── `klines_volume` (M1) — THE THIRD PRODUCER, AND THE ANTI-LOOKAHEAD CUT ───────────────────
#
# `T-01.3` / `SPEC-007` phase `01` items 1.3 + 1.4, `RS-3.4`, `RNF-3`.
#
# ⛔ `_KLINES_VOLUME_VERIFIED_BY` IS A CROSS-TASK CONTRACT, NOT A LOCAL STYLE CHOICE.
# `verified_by` is the fifteenth term of `SeriesKey` and the `sha256` of the canonical
# projection of all fifteen IS the `series_key_id` (`series_key.py:226-234`). The rows this
# module publishes have to land under the SAME `series_key_id` the SERVED catalog
# (`use_cases/series_catalog.py::list_series_catalog`, `T-01.6`) registers, or
# `/api/v1/series-history` answers `422 UnknownSeriesKeyIdError` for a `md.series` that is full
# of rows — the worst shape of this failure, because both halves look healthy in isolation.
# `T-01.1` created the identity and named its test; `T-01.6`'s own task text says to reuse
# "o nome do teste que T-01.1 criou, nao um nome inventado", and that name is the value below.
# `test_collector_klines_mapping.py` pins the whole triple (`instrument_id`, `unit`,
# `verified_by`) by rebuilding the entry and comparing `series_key_id`, so a divergence fails a
# test instead of emptying a chart.
_KLINES_VOLUME_VERIFIED_BY: Final[str] = "test_klines_volume_catalog.py"

# `klines_volume` carries `denom="base"` (`domain/klines_volume_catalog.py`), so `unit` must be
# the instrument's OWN base asset — `BTC` for `BTCUSDT`, `ETH` for `ETHUSDT`. The READING of
# that base asset off the symbol MOVED to `domain/instrument.py::base_asset`: it is a fact
# about the instrument, not about this collector mapping, and `domain/open_interest_catalog.py`
# needs the same reading while being structurally forbidden from importing a use case
# (`[tool.importlinter]`'s `layers` contract). `SymbolNotQuotedInUsdtError` moved with it, so
# the refusal this module already made is the one the whole domain now makes.

# One minute, in milliseconds: the width of the `interval="1m"` bucket this series is built on,
# and the step `use_cases/series_history.py` walks its grid with (`_GRID_STEP_MS` there).
KLINES_BUCKET_WIDTH_MS: Final[int] = 60_000


class KlineLike(Protocol):
    """The four things this mapping reads off one kline array.

    Structural, not an import: `infra/binance_klines_client.KlineRow` satisfies this, and
    `use_cases` may not import `infra` (`[tool.importlinter]`'s `layers` contract). The same
    shape `SeriesWindowReader`/`IngestRecordSource` already use to name a port in a use case
    and wire the adapter at composition.

    `taker_buy_base_volume` was added by `T-02.3` and it is THE whole network cost of phase
    `02`: index `[9]` was already in the array `T-01.2` refused to project away, so reading it
    here adds a field to a protocol, not a request to the exchange.
    """

    @property
    def open_time_ms(self) -> int:
        """Return the bucket's opening instant, epoch milliseconds."""
        ...

    @property
    def close_time_ms(self) -> int:
        """Return the bucket's closing instant, epoch milliseconds (Binance: open + 59999)."""
        ...

    @property
    def volume(self) -> str:
        """Return index `[5]`, base-asset volume, as the exact decimal string the source sent."""
        ...

    @property
    def taker_buy_base_volume(self) -> str:
        """Return index `[9]`, the aggressor-buy share of `volume`, as the source's own string."""
        ...


KlinesToRows = Callable[[int, str, Sequence[KlineLike]], tuple[SeriesRow, ...]]


def is_closed_bucket(kline: KlineLike, observed_at_ms: int) -> bool:
    """Say whether `kline`'s bucket had ALREADY CLOSED at `observed_at_ms` — `RS-3.4`.

    ⛔ THE SIGN OF THIS COMPARISON IS THE WHOLE ANTI-LOOKAHEAD RULE, and `CLAUDE.md` records
    that an anti-lookahead rule of this project has already been INVERTED once and propagated
    through two documents before anyone noticed. So the falsifier is written against the SIGN,
    not against the existence of a flag:
    `test_collector_klines_mapping.py::test_the_in_progress_bucket_is_the_one_dropped_not_the_ones_around_it`
    pins WHICH buckets survive, so swapping `<` for `>` (or for `<=` on a boundary tick) fails.

    `/fapi/v1/klines` ALWAYS returns the bucket currently in progress as its newest element,
    with a partial `volume` that keeps growing until the minute ends — `[MEDIDO 2026-09-10:
    `v=4,413` no bucket mais novo contra `10`–`44` nos vizinhos, defasagem de ~58 s]`. Storing
    it as a fact understates the traded volume of that minute by whatever had not traded yet,
    which is the textbook lookahead defect in reverse: a number that a decision taken AT that
    minute could not have seen, recorded as if it had settled.

    `close_time_ms` is the LAST millisecond that belongs to the bucket, not the first
    millisecond after it, so the bucket is closed exactly when the observation instant is
    strictly greater than it. `close_time_ms == observed_at_ms` is the boundary tick and counts
    as STILL OPEN: that millisecond is still inside the bucket.
    """
    return kline.close_time_ms < observed_at_ms


def build_klines_to_rows(
    *,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> KlinesToRows:
    """Build the `klines` -> `SeriesRow` mapping the klines collector publishes through.

    The returned callable takes the collector's own clock (`received_at`), the symbol the page
    was requested for, and the page's klines; it answers ONLY the rows for buckets that had
    already closed at `received_at` (`is_closed_bucket`). A symbol outside `symbols` yields no
    rows, the same filter the other two producers in this module already apply.

    ── TWO ROWS PER CLOSED BAR SINCE `T-02.3`, AND THE SECOND ONE COSTS NO REQUEST ──────────

    `klines_volume` (index `[5]`) and `cvd_source`/`kline_takerbuy` (`2 * takerBuy[9] - volume`,
    `domain/kline_cvd.kline_cvd_delta`) are TWO IDENTITIES OFF ONE ARRAY. That is the capability
    phase `02` exists to demonstrate and the reason it is a phase of its own rather than a line
    inside phase `01`: a second metric riding an existing collector, with a diff of ZERO network
    calls (`DoD 7`) — `T-01.2` already refused to project the 12-field array down, precisely so
    this moment would cost a field read instead of a second integration.

    The two rows share `bucket_end`, `event_time` and every provenance field, because they are
    two readings OF THE SAME OBSERVATION; they differ only in `series_key_id` and `value_raw`.
    They are built by iterating a pair of `(series_key_id, value_raw)` tuples rather than by a
    closure defined inside the loop — there is no late-binding hazard either way (a closure
    called in the same iteration reads the current value), and a mutation test confirmed that:
    removing a default-argument binding written to "protect" against it killed NO test, because
    there was nothing to protect against. The pair loop is what the code actually needs, and it
    keeps the sixteen provenance fields written once instead of twice.

    ⚠️ `series_key_id()` is computed ONCE PER PAGE, above the loop, not once per row: it is a
    `sha256` over the canonical projection of fifteen terms, and a seven-day backfill is 10.080
    bars per symbol — 20.160 hashes per symbol per restart if it were recomputed per row.

    The CVD delta is computed through the domain function, never inline here, so the invariant
    `0 <= takerBuy <= volume` (item 2.4) is enforced on every bar the collector publishes: an
    impossible pair raises `TakerBuyExceedsVolumeError` and the pass closes `REJECTED` instead
    of writing a delta larger than the bucket it came from.

    ⛔ THE IN-PROGRESS BUCKET IS DROPPED, NOT FLAGGED, and the two options are not equivalent
    here. `is_final=False` would also be honest — the `as_of` accessor refuses such a row
    outright, in its `_is_closed_bucket` predicate (`row.bucket_end <= t and row.is_final is
    not False`; the module is named without its filename here on purpose, because
    `test_as_of_is_the_single_reader.py` polices that name by TEXT SEARCH and a prose citation
    would register this module as a fifth importer of an accessor it never imports) — but
    `md.series` is APPEND-ONLY, so a 60-second cycle over four symbols would append four rows
    per minute (`5.760/day`) that no read path can ever admit, on a host whose own premise is
    scarce resources. Dropping costs nothing and leaves nothing to explain later; the rows that
    ARE published carry `is_final=True`, which is the source genuinely DECLARING finality —
    the case `SeriesRow.is_final`'s own docstring reserves the column for.

    `bucket_end` is `open_time_ms + KLINES_BUCKET_WIDTH_MS`, i.e. `close_time_ms + 1`: whole
    minute instants, because `use_cases/series_history.py` states that "`md.series.bucket_end`
    values are stamped on the whole-minute grid" and walks its X axis on exactly that step. The
    source's own `...59999` would still be admitted by `as_of` (`bucket_end <= t`), but it
    would put every volume bar one millisecond off the grid every other series is stamped on.

    `event_time` is the SOURCE's instant (the bucket boundary) while `available_at`/
    `ingested_at`/`observed_at` are THIS collector's clock — the same separation `_build_row`
    documents for the other two producers, and the reason the ~58-second publication lag of
    this endpoint is visible in the data instead of being flattened away.
    """

    def _to_rows(
        received_at: int, symbol: str, klines: Sequence[KlineLike]
    ) -> tuple[SeriesRow, ...]:
        if symbol not in symbols:
            return ()
        unit = base_asset(symbol)
        volume_key = build_klines_volume_entry(
            symbol, unit=unit, verified_by=_KLINES_VOLUME_VERIFIED_BY
        ).key
        cvd_key = build_kline_takerbuy_entry(symbol, unit=unit).key
        volume_key_id = volume_key.series_key_id()
        cvd_key_id = cvd_key.series_key_id()
        rows: list[SeriesRow] = []
        for kline in klines:
            if not is_closed_bucket(kline, received_at):
                continue
            bucket_end = kline.open_time_ms + KLINES_BUCKET_WIDTH_MS
            delta = kline_cvd_delta(
                volume=kline.volume, taker_buy_base_volume=kline.taker_buy_base_volume
            )
            for series_key_id, value_raw in (
                (volume_key_id, kline.volume),
                (cvd_key_id, str(delta)),
            ):
                rows.append(
                    SeriesRow(
                        series_key_id=series_key_id,
                        symbol=symbol,
                        source=KLINES_ENDPOINT,
                        bucket_end=bucket_end,
                        event_time=bucket_end,
                        available_at=received_at,
                        availability_source=AvailabilitySource.OBSERVED,
                        ingested_at=received_at,
                        observed_at=received_at,
                        provenance=Provenance.OBSERVED,
                        src_label_raw=KLINES_ENDPOINT,
                        observer_id=KLINES_OBSERVER_ID,
                        observer_region=UNKNOWN_OBSERVER_REGION,
                        is_final=True,
                        value_raw=value_raw,
                    )
                )
        return tuple(rows)

    return _to_rows


# ── `sum_open_interest` (M2) — THE FOURTH PRODUCER, AND WHY ITS CUT IS A DIFFERENT CUT ──────
#
# `T-03.3` / `SPEC-007` phase `03` items 3.2 + 3.3, `RS-3.4`, `RF-1`.
#
# ⛔ THE IDENTITY IS NOT BUILT HERE, IT IS IMPORTED — and that is the same cross-task contract
# `_KLINES_VOLUME_VERIFIED_BY` above exists for, paid in a cheaper currency. `klines_volume`
# has to quote a `verified_by` STRING because its builder takes one; open interest does not,
# because `domain/open_interest_catalog.binance_open_interest_key` hardcodes its own
# `_VERIFIED_BY` and is the ONE construction of that key in this codebase. So the writer below
# and the SERVED catalog (`use_cases/series_catalog.list_series_catalog`, which already calls
# `open_interest_catalog_entries` for every pilot instrument) land on the same
# `series_key_id` because they call the same function, not because two strings were kept in
# step by hand. `test_collector_open_interest_mapping.py` pins that anyway, by rebuilding the
# key and comparing ids — a `422 UnknownSeriesKeyIdError` over a full `md.series` is the
# failure whose two halves both look healthy in isolation.
#
# ── THE CUT IS `bucket_end <= observed_at`, AND IT IS **NOT** `is_closed_bucket` ────────────
#
# `klines_volume` is a `FLOW` aggregated OVER a bucket, so its newest element is genuinely
# PARTIAL and grows until the minute ends — `is_closed_bucket` drops it. Open interest is a
# `STOCK`: `/futures/data/openInterestHist` publishes ONE INSTANT READING per 5-minute grid
# point, not an aggregate, and the reading is complete the moment it appears.
# `[MEDIDO 2026-09-12, polling de 10 s sobre `openInterestHist?symbol=BTCUSDT&period=5m`: o
# ponto rotulado `timestamp=1789218300000` APARECEU em `now=1789218306231`, isto e
# `now - timestamp = 6.231 ms` — SEIS SEGUNDOS depois do proprio rotulo. Um agregado sobre
# `[T, T+300.000)` nao pode existir 6 s dentro dele; a leitura e um INSTANTE em `T`. Deltas
# entre `timestamp` consecutivos = {300000} e `timestamp % 300000 == 0` para todos,
# n=12 pontos]`.
#
# So the thing this cut refuses is NOT a partial aggregate — it is a row stamped at an instant
# that has not happened yet on THIS collector's clock. That is the residual lookahead risk of a
# snapshot producer: the two clocks are different (`available_at`/`observed_at` are ours,
# `bucket_end` is Binance's), and a skew, a badly-built window, or a future `period` would put
# `bucket_end` ahead of `observed_at`. `as_of` admits a row on `bucket_end <= t`, so such a row
# would be drawn at an instant the collector could not have observed. The cut is written
# against the SIGN for the same reason `is_closed_bucket`'s is: `CLAUDE.md` records an
# anti-lookahead rule of this project that was already INVERTED once and propagated through two
# documents before anyone noticed.
OPEN_INTEREST_BUCKET_WIDTH_MS: Final[int] = 300_000

# The two fields this mapping reads off one raw point of the page. Named rather than inlined so
# the payload's own spelling is greppable — `[MEDIDO 2026-09-12: as chaves de um ponto real sao
# `['CMCCirculatingSupply', 'sumOpenInterest', 'sumOpenInterestValue', 'symbol', 'timestamp']`,
# n=1 resposta de 12 pontos]`. `sumOpenInterestValue` is the notional in USDT and is NOT what
# this series carries: `binance_open_interest_key` declares `denom="base"`, so the raw string
# that backs `value_raw` is the base-asset quantity, `sumOpenInterest`.
OPEN_INTEREST_TIMESTAMP_FIELD: Final[str] = "timestamp"
OPEN_INTEREST_VALUE_FIELD: Final[str] = "sumOpenInterest"

OpenInterestPoint = Mapping[str, object]
OpenInterestToRows = Callable[[int, str, Sequence[OpenInterestPoint]], tuple[SeriesRow, ...]]


class MalformedOpenInterestPointError(Exception):
    """A returned point lacks an integer `timestamp` or a string `sumOpenInterest`."""


def open_interest_bucket_end(point: OpenInterestPoint) -> int:
    """Return the instant this reading belongs to — the source's own `timestamp`, unshifted.

    `binance_open_interest_key` declares `ts_convention = POINT_AT_BUCKET_END`, and this is the
    function that says what that resolves to on the wire: the point labelled `T` is the reading
    at `T`, so `bucket_end = T`. The measurement in this section's header is what forces that
    reading rather than `T + OPEN_INTEREST_BUCKET_WIDTH_MS` — a point labelled `T` is already
    published ~1 minute after `T`, so `T` cannot be the START of a bucket whose aggregate the
    point reports, and stamping it `T + 300_000` would publish a row for an instant five
    minutes in the future of the only instant the source ever measured.

    ⚠️ `SeriesKey.label_shift` is NOT applied here, and that is not an oversight: it is a TERM
    OF IDENTITY (`series_key.py`, the fifteen-term `sha256`), never a transform any writer in
    this package runs — `klines_volume` carries `label_shift=0` and still adds a bucket width
    to its own source label. Whether `label_shift=300_000` describes the Binance row as
    accurately as it describes the Coinalyze one is a question for `ADR-036`/`SPEC-001` §2.1,
    and reopening it RE-IDENTIFIES the series (a different `series_key_id`, a migration, not a
    fix); it is registered in `PENDENCIAS-PARA-AVALIAR-DEPOIS.md` instead of settled here.
    """
    raw = point.get(OPEN_INTEREST_TIMESTAMP_FIELD)
    if not isinstance(raw, int):
        raise MalformedOpenInterestPointError(
            f"point has no integer {OPEN_INTEREST_TIMESTAMP_FIELD!r} field to stamp a row "
            f"with: {point!r}"
        )
    return raw


def open_interest_value_raw(point: OpenInterestPoint) -> str:
    """Return `sumOpenInterest` as the EXACT decimal string the source sent (`ADR-034/D7`)."""
    raw = point.get(OPEN_INTEREST_VALUE_FIELD)
    if not isinstance(raw, str) or not raw.strip():
        raise MalformedOpenInterestPointError(
            f"point has no non-blank string {OPEN_INTEREST_VALUE_FIELD!r} field to carry as "
            f"`value_raw`: {point!r}"
        )
    return raw


def is_settled_open_interest_point(point: OpenInterestPoint, observed_at_ms: int) -> bool:
    """Say whether `point`'s instant had ALREADY PASSED at `observed_at_ms` — `RS-3.4`.

    ⛔ THE SIGN IS THE RULE. A reading stamped exactly AT `observed_at_ms` is admitted:
    `bucket_end == observed_at_ms` means the instant has arrived, and `as_of` admits a row on
    `bucket_end <= t` with the same boundary. A reading stamped AFTER it is refused — that is
    the only lookahead this snapshot producer can commit, and the falsifier
    `test_collector_open_interest_mapping.py::test_a_point_stamped_after_the_observation_instant_is_the_one_dropped`
    pins WHICH points survive, so flipping the comparison fails a test instead of a chart.
    """
    return open_interest_bucket_end(point) <= observed_at_ms


def build_open_interest_to_rows(
    *,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> OpenInterestToRows:
    """Build the `openInterestHist` -> `SeriesRow` mapping the open-interest collector uses.

    The returned callable takes the collector's own clock (`received_at`), the symbol the page
    was requested for, and the page's raw points; it answers ONLY the rows whose instant had
    already arrived at `received_at`. A symbol outside `symbols` yields no rows — the same
    four-symbol filter (`INITIAL_SYMBOLS`) every other producer in this module applies.

    `is_final=True`, and it is the source genuinely declaring finality rather than this module
    hoping: a `STOCK` snapshot at an instant that has passed cannot still be growing, which is
    exactly what the measurement in this section's header established and what separates it
    from `klines_volume`'s in-progress bar.

    `event_time`/`bucket_end` are the SOURCE's instant while `ingested_at`/`observed_at` are
    THIS collector's clock — the same separation `_build_row` documents.

    ── `available_at` IS MODELED HERE, AND IT IS `ADR-038`/`D1` ────────────────────────────

    `available_at` USED to be `received_at` stamped `OBSERVED`, and that was wrong for this
    endpoint in a way that emptied the panel: `99,85 %` of the `8.064` open-interest rows in
    `md.series` came from ONE backfill pass, so `received_at` is the instant OUR request ran —
    up to `604.539.911 ms ~ 7,0 d` after the bucket it labels `[MEDIDO 2026-09-12, ADR-038
    §1.1b, n=8.064 linhas, 8.052 delas backfill]`. `as_of` admits a row on `available_at <= t`,
    so every one of those rows was invisible at the instant it describes. Measured on the real
    store with the real `as_of`: `1/61` slots legible before, `61/61` after `[MEDIDO
    2026-09-12T23:20Z-2026-09-13T00:05Z, ADR-038 §1.2 e a remedicao de ADR-038-remedicao-e1.py,
    universo de 61 slots, kt=agora, controles C0=0/61 e C1=61/61]`.

    ⚠️ THE HOUR IS PART OF THAT MEASUREMENT, not decoration. Production went live at
    `2026-09-12T23:41Z` and the open-interest collector has polled every ~5 min since
    `23:45:29Z`, so the STARTING point moved while the ceiling did not: re-measured at
    `2026-09-13T00:19Z` the same harness reads `40/61 -> 61/61` on the 1-min grid and
    `9/61 -> 61/61` on the 5-min grid the panel draws `[MEDIDO 2026-09-13T00:19Z, n=4.040
    linhas OI, mesmo arnes]`. The GAIN is unchanged and still maximal (`61/61`); what expired
    is the sentence "`1/61`", which described a store with no live rows in it. A date without
    an hour is ambiguous across three different populations today (`1` -> `34` -> `58` runs).

    So `available_at` is now the next NATIVE GRID point after the bucket
    (`modeled_available_at_for_endpoint`, `SPEC-001` §5.2 rounded up), stamped `MODELED`
    because it is COMPUTED — the consequence `D16` already declared and the reason every
    consumer of these rows must read `availability_source`.

    ⛔ `observed_at` and `ingested_at` STAY `received_at`, and that is a boundary, not an
    oversight. Moving `observed_at` onto the stamp is `ADR-038` §7.1, which amends a sentence
    of `D16` ("o instante da busca continua em `ingested_at`/`observed_at`") and is therefore
    the OWNER's call, still pending.

    ── THIS STAMP IS WHY `F-1` READS `observed_at`, AND IT IS DECLARED, NOT SILENT ──────────

    Stamping `MODELED` on EVERY row — including a live poll `4,4 s` after the bucket, which
    `test_the_modeled_stamp_does_not_move_when_the_collector_is_early_or_late` pins on purpose
    — means this producer NEVER writes `availability_source = 'OBSERVED'` again. `ADR-038` §5
    designates `F-1` as the falsifier OF `D1`, so a version of `F-1` that filtered on
    `OBSERVED` would have had its universe frozen at the legacy rows and, after `D15`
    (TRUNCATE + reingest), would have returned `rc=0` with ZERO lines: the falsifier of this
    very decision, switched off by this very decision, with the ambiguous signal `ADR-012`
    names. That is a consequence to declare, not to discover later.

    The real fetch delay is NOT lost, and this line is what keeps it: `observed_at` stays
    `received_at`, so `observed_at - bucket_end` reproduces it. `ADR-038` §5/`F-1` was amended
    to read exactly that, per poll (`group by observed_at`, `min(...)`) rather than per row,
    because one `STOCK` poll writes many buckets by carry-forward. Measured on production:
    `n_polls = 52`, `p99 = 85.187 ms`, range `4.417`-`85.187 ms`, every one inside
    `(0, 300.000]` `[MEDIDO 2026-09-13T00:36Z, deploy-postgres-1 read-only]`.

    ⛔ CHANGING `observed_at` HERE BREAKS `F-1`. `docs/context/cinco-metricas-do-core/gates/
    QA-ADR-038-D1-F1-probe.py` and `test_observed_at_keeps_the_fetch_instant_so_f_1_stays_
    computable` both fail if it moves.

    ── THE CONSEQUENCE FOR THE BACKTEST, AND ITS UNIVERSE IS DECLARED ──────────────────────

    ⛔ CORRECTION `2026-09-13T01:47Z`. The previous version of this paragraph said the backtest
    horizon "still reads `1/61`" and that "a `61/61` at `knowledge_time = t` today would mean
    someone shipped §7.1 without the owner". BOTH HALVES WERE FALSIFIED BY MEASUREMENT, and the
    sentence was WRITTEN IN THE VERY COMMIT THAT FIXED `F-1` — a rule of inference with no
    universe attached, which is the failure mode `F-1` had just been repaired for.

    `1/61` is what `gates/ADR-038-D1-pos-implementacao.py:37` measures, and that harness
    COLLAPSES every `observed_at` onto one instant (`received_at = max(observed_at)`, "the
    single backfill pass instant"): it measures a SYNTHETIC store, the production that stopped
    existing at `2026-09-12T23:45:29Z`. Over the REAL store the answer depends on the WINDOW,
    and here it is, both arms on the same rows, the counterproof arm being `§7.1` itself
    (`observed_at := the stamp`) `[MEDIDO 2026-09-13T01:45Z, n=4.057 linhas OI, BTCUSDT,
    gates/ADR-038-F2-universo-historico.py, deploy-postgres-1 read-only]`:

    | 61 slots ending at            | grid  | this code | `§7.1` counterproof |
    |-------------------------------|-------|-----------|---------------------|
    | newest bucket (live-covered)  | 1 min | `61/61`   | `61/61` — SATURATED |
    | newest bucket                 | 5 min | `26/61`   | `61/61`             |
    | last bucket before `23:41:13Z`| 1 min | ` 0/61`   | `61/61`             |
    | last bucket before `23:41:13Z`| 5 min | ` 1/61`   | `61/61`             |

    ⇒ on slots the live collector COVERED, a `STOCK` row fetched ~60 s after its bucket is
    legitimately knowable at `knowledge_time = t`, so this code ALREADY reads `61/61` there and
    `§7.1` buys NOTHING. On slots older than the collector, `observed_at` still bars the read
    and `§7.1` buys ALL of them. The backtest ceiling is real but SCOPED TO HISTORY — which is
    exactly what `ADR-036/D5` (klines since `2019-09-08`) was bought for — and it retreats by
    clock time as live coverage accumulates.

    ⇒ `61/61` at `knowledge_time = t` is therefore NOT evidence that anyone shipped `§7.1`. The
    evidence is the DIFFERENTIAL between the two arms over the HISTORICAL window, which is how
    `ADR-038` §5/`F-2` was amended to read. `§7.1` remains the OWNER's call, still pending.
    """

    def _to_rows(
        received_at: int, symbol: str, points: Sequence[OpenInterestPoint]
    ) -> tuple[SeriesRow, ...]:
        if symbol not in symbols:
            return ()
        key = binance_open_interest_key(instrument_id=symbol)
        series_key_id = key.series_key_id()
        rows: list[SeriesRow] = []
        for point in points:
            if not is_settled_open_interest_point(point, received_at):
                continue
            bucket_end = open_interest_bucket_end(point)
            rows.append(
                SeriesRow(
                    series_key_id=series_key_id,
                    symbol=symbol,
                    source=OPEN_INTEREST_HIST_ENDPOINT,
                    bucket_end=bucket_end,
                    event_time=bucket_end,
                    available_at=modeled_available_at_for_endpoint(
                        endpoint=OPEN_INTEREST_HIST_ENDPOINT, bucket_end_ms=bucket_end
                    ),
                    availability_source=MODELED_AVAILABILITY_SOURCE,
                    ingested_at=received_at,
                    observed_at=received_at,
                    provenance=Provenance.OBSERVED,
                    src_label_raw=OPEN_INTEREST_HIST_ENDPOINT,
                    observer_id=OPEN_INTEREST_OBSERVER_ID,
                    observer_region=UNKNOWN_OBSERVER_REGION,
                    is_final=True,
                    value_raw=open_interest_value_raw(point),
                )
            )
        return tuple(rows)

    return _to_rows


# ── `count_long_short_ratio` (M3) — THE FOURTH PRODUCER ─────────────────────────────────────
#
# `T-04.3` / `SPEC-007` phase `04` items 4.2 + 4.3, `RF-1`, `ADR-036/D3`.
#
# THE POINTS ARRIVE AS RAW JSON OBJECTS, ON PURPOSE. `infra/binance_futures_data_client.py`
# hands back the list the endpoint sent, untouched, because WHICH FIELD of which object becomes
# `value_raw` is a mapping decision and this module is where mapping decisions live. So the two
# field names below are the only place in the codebase that knows the payload's shape, and
# `test_collector_long_short_mapping.py` pins them against a fixture copied from a real body.
#
# ⛔ THE FOUR SERIES ARE STILL FOUR. This builder publishes exactly ONE of them —
# `count_long_short_ratio`, from `/futures/data/globalLongShortAccountRatio`. Adding
# `sum_taker_long_short_vol_ratio` later is another catalog entry and another call, NOT another
# pipe (plan `04`'s own falsifier says so) — and it would need a DIFFERENT builder, because that
# series is a RATIO of FLOW and `long_short_ratio_series.py` refuses to coarsen it from the bare
# quotient BY TYPE (`resample_bare_taker_ratio_refuses`). Nothing here may be generalised into
# "the long/short mapping" without reopening that refusal.

# The two keys this mapping reads off one point of the payload. Binance spells them in camelCase
# and they are the SOURCE's own spelling, exactly like `QuantityField`'s `q`/`nq` values — the
# constant names are English, the VALUES are a third party's field names and are not translated.
_LONG_SHORT_TIMESTAMP_FIELD: Final[str] = "timestamp"
_LONG_SHORT_RATIO_FIELD: Final[str] = "longShortRatio"

LongShortToRows = Callable[[int, str, Sequence[Mapping[str, object]]], tuple[SeriesRow, ...]]


class MalformedLongShortPointError(Exception):
    """A `/futures/data/globalLongShortAccountRatio` point missing a field this mapping needs.

    It raises instead of skipping the point: a silently dropped observation is a gap that no run
    record and no log line would ever account for, and `md.series` cannot tell "the source did
    not publish this bucket" from "we could not read what it published" after the fact.
    """


def is_settled_point(timestamp_ms: int, observed_at_ms: int) -> bool:
    """Say whether a point's own instant had ALREADY PASSED when it was observed — `RS-3.4`.

    ⛔ THE SIGN OF THIS COMPARISON IS AN ANTI-LOOKAHEAD RULE, and `CLAUDE.md` records that an
    anti-lookahead rule of this project was already INVERTED once and propagated through two
    documents. So the falsifier is written against the SIGN:
    `test_collector_long_short_mapping.py::test_a_point_stamped_in_the_future_is_the_one_dropped`
    pins WHICH points survive, so swapping `<=` for `>=` fails.

    `[MEDIDO 2026-09-12, poll de 10 s, n=2 fronteiras]` the endpoint publishes a point 9,6 s and
    70,8 s AFTER the instant it is stamped with, so in normal operation EVERY point comes back
    already settled and this cut removes nothing. That is exactly why it is written down
    rather than left implicit: a cut that never fires in the happy path is invisible until the
    day a clock disagrees, and `value_raw` for a future instant is a number no decision taken at
    that instant could have seen.

    `timestamp_ms == observed_at_ms` counts as SETTLED: the reading is OF that instant, and
    `POINT_AT_BUCKET_END` means the instant itself belongs to the observation.
    """
    return timestamp_ms <= observed_at_ms


def _long_short_point_fields(point: Mapping[str, object]) -> tuple[int, str]:
    """Read `(timestamp_ms, ratio_raw)` off one payload object, refusing anything else.

    `timestamp` is accepted only as an `int` and `longShortRatio` only as a `str`: those are the
    types a real body carries (`[MEDIDO 2026-09-12]`), and coercing a surprise into one of them
    would turn a changed contract into a plausible-looking number.
    """
    timestamp = point.get(_LONG_SHORT_TIMESTAMP_FIELD)
    ratio_raw = point.get(_LONG_SHORT_RATIO_FIELD)
    if not isinstance(timestamp, int) or isinstance(timestamp, bool):
        raise MalformedLongShortPointError(
            f"point has no integer {_LONG_SHORT_TIMESTAMP_FIELD!r}: {point!r}"
        )
    if not isinstance(ratio_raw, str) or not ratio_raw.strip():
        raise MalformedLongShortPointError(
            f"point has no non-blank string {_LONG_SHORT_RATIO_FIELD!r}: {point!r}"
        )
    return timestamp, ratio_raw


def build_long_short_to_rows(
    *,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> LongShortToRows:
    """Build the `globalLongShortAccountRatio` -> `SeriesRow` mapping the fourth collector uses.

    The returned callable takes the collector's own clock (`received_at`), the symbol the page
    was requested for, and the raw points; it answers the rows for the points that had already
    settled at `received_at` (`is_settled_point`). A symbol outside `symbols` yields no rows —
    the same filter the other three producers in this module apply.

    `bucket_end == event_time == timestamp`, with NO shift applied, and that is measured rather
    than assumed: `long_short_catalog.LONG_SHORT_LABEL_SHIFT_MS` is an explicit `0` because the
    endpoint publishes a point 9,6 s / 70,8 s AFTER the instant it stamps it with (`n=2`), never
    the ~300 s a bucket-START label would imply, so the stamp is already the end of its window.
    The open-interest rows carry `+interval` for the OPPOSITE reason (the Coinalyze `t` is a
    bucket START), and copying that number here would have applied one source's labelling
    measurement to another source.

    `is_final=True`: the point is a settled snapshot of a closed bucket, which is the case
    `SeriesRow.is_final` reserves the column for — the source genuinely declaring finality, not
    this mapping guessing it.

    The key comes from `count_long_short_ratio_key`, the SAME builder
    `use_cases/series_catalog.py` registers, so writer and served catalog land on one
    `series_key_id` by construction instead of by two hardcoded strings agreeing.

    ⛔ `available_at` IS **NOT** MODELED HERE, AND `ADR-038`/`D1` SAYS IT SHOULD BE ────────

    `ADR-038` §3 extends `D1` to this endpoint on the grounds that it shares open interest's
    `300_000 ms` native grid. The grid is shared; the NATURE is not. `count_long_short_ratio` is
    `Nature.RATIO`, and `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` is `False`, so
    the `as_of` accessor vetoes any read whose `age_ms >= bucket_interval_ms`. A row stamped
    `available_at = bucket_end + 300_000` is admissible only from `bucket_end + 300_000` onward,
    where `age_ms >= 300_000` ALWAYS — so the veto fires at every readable instant, by
    arithmetic rather than by data.

    Measured, driving THIS mapper and the real `as_of` over the real store, `61` slots of 1 min
    at `knowledge_time = agora`, BTCUSDT `[MEDIDO 2026-09-12, n=1.000 linhas; C0=0/61, C1=61/61]`:
    offset `34.532` -> `61/61`; `66.712` -> `48/61` (the value `ADR-038` §1.2 row `F` reports);
    `299.999` -> `12/61`; **`300.000` -> `0/61`**. `D1`'s round-up produces exactly the last one,
    and the endpoint reads `4/61` today — so applying `D1` here is a measured REGRESSION, and
    `ADR-038` §1.2 never measured its own decision for this endpoint (it simulated the RAW lag,
    which rounding up does not emit).

    `domain/modeled_availability.py` refuses the entry in its constructor rather than leaving
    this as a comment, and the question is back with `ADR-038`'s author —
    `docs/context/cinco-metricas-do-core/gates/ADR-038-D1-builder.md`.
    """

    def _to_rows(
        received_at: int, symbol: str, points: Sequence[Mapping[str, object]]
    ) -> tuple[SeriesRow, ...]:
        if symbol not in symbols:
            return ()
        key_id = count_long_short_ratio_key(symbol).series_key_id()
        rows: list[SeriesRow] = []
        for point in points:
            timestamp_ms, ratio_raw = _long_short_point_fields(point)
            if not is_settled_point(timestamp_ms, received_at):
                continue
            rows.append(
                SeriesRow(
                    series_key_id=key_id,
                    symbol=symbol,
                    source=LONG_SHORT_ENDPOINT,
                    bucket_end=timestamp_ms,
                    event_time=timestamp_ms,
                    available_at=received_at,
                    availability_source=AvailabilitySource.OBSERVED,
                    ingested_at=received_at,
                    observed_at=received_at,
                    provenance=Provenance.OBSERVED,
                    src_label_raw=LONG_SHORT_ENDPOINT,
                    observer_id=LONG_SHORT_OBSERVER_ID,
                    observer_region=UNKNOWN_OBSERVER_REGION,
                    is_final=True,
                    value_raw=ratio_raw,
                )
            )
        return tuple(rows)

    return _to_rows


# ── THE SIXTH PRODUCER: Coinalyze `liquidation-history`, TWO ROWS PER BUCKET (`T-05.5`) ─────

# One `SeriesRow` from one settled bucket of one cohort. `cohort` travels as an argument and not
# as two separate builders because it is a TERM OF THE IDENTITY (`coinalyze_liquidation_key`
# refuses to default it), and a caller that picked the wrong builder would be indistinguishable
# from one that picked the right one.
LiquidationPointToRow = Callable[[int, str, str, int, str], SeriesRow]


class UnknownLiquidationSymbolError(Exception):
    """A row was asked for a symbol outside the configured universe (`T-05.5`)."""


def build_liquidation_history_to_row(
    *,
    symbols: frozenset[str] = INITIAL_SYMBOLS,
) -> LiquidationPointToRow:
    """Build the mapper from one settled `(symbol, cohort, bucket start, raw value)` to a row.

    ── `bucket_end = (t + 60 s)`, AND `label_shift` IS NOT APPLIED HERE ───────────────────

    Coinalyze's `t` is the bucket's START — measured, not assumed: at 14:14Z the `daily` series
    already carried `t = 2026-09-12T00:00:00Z` for a day that had not ended, and a bucket-END
    convention cannot emit a label for a bucket that has not closed
    `[MEDIDO 2026-09-12, gates/retencao-liquidation-history.md, n=5 intervalos]`. The canonical
    grid is end-labelled, so the writer adds the bucket width to reach it — exactly what
    `klines_volume` does with its own `openTime`, and exactly what `open_interest_bucket_end`'s
    warning says a writer must NOT confuse with `SeriesKey.label_shift`, which is a term of the
    fifteen-term identity `sha256` and never a transform any writer runs.

    ── `is_final=True`, AND IT IS EARNED BY THE CALLER, NOT ASSUMED HERE ──────────────────

    Only SETTLED buckets reach this function (`RS-3.4`, `is_settled_bucket`): the newest bucket
    of every response is partial by construction and is dropped before this point. So a row
    built here is final — and the assertion is safe only because the refusal happens upstream,
    which is why that refusal has its own falsifier rather than living in a comment.

    A symbol outside `symbols` returns nothing to publish — same guard the other builders carry,
    so a universe change is one constant and not five call sites.
    """

    def _to_row(
        received_at: int, symbol: str, cohort: str, bucket_start_seconds: int, value_raw: str
    ) -> SeriesRow:
        if symbol not in symbols:
            raise UnknownLiquidationSymbolError(
                f"symbol {symbol!r} is outside the configured universe {sorted(symbols)!r}: a "
                f"row built for it would carry an identity nothing in the catalog serves"
            )
        bucket_end = (bucket_start_seconds * 1000) + LIQUIDATION_BUCKET_MS
        return SeriesRow(
            series_key_id=coinalyze_liquidation_key(cohort, instrument_id=symbol).series_key_id(),
            symbol=symbol,
            source=LIQUIDATION_HISTORY_ENDPOINT,
            bucket_end=bucket_end,
            event_time=bucket_end,
            available_at=received_at,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=received_at,
            observed_at=received_at,
            provenance=Provenance.OBSERVED,
            src_label_raw=LIQUIDATION_HISTORY_ENDPOINT,
            observer_id=LIQUIDATION_OBSERVER_ID,
            observer_region=UNKNOWN_OBSERVER_REGION,
            is_final=True,
            value_raw=value_raw,
        )

    return _to_row
