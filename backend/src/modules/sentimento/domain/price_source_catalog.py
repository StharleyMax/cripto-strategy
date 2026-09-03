"""`price_source` declared BY `price_use` — `ADR-007`'s decision table, made executable."""

# Plan `06` items 6.6+6.7. `T-06.1` (`series_catalog.py`) built `PRICE_USES` and the
# `SeriesCatalogEntry.price_use` field as the CONTRACT, explicitly deferring the real
# assignment to "the future consumer" — this module is that consumer.
#
# ── WHY THE ASSIGNMENT IS A SEPARATE TABLE, AND NOT ONE `price_use` PER CATALOG ROW ─────────
#
# `ADR-007`'s decision table assigns THREE of the five `price_use` values to `mark_price`
# (`liquidation_trigger`, `funding`, `cost`) and the other two to `klines_last`
# (`structure_detection`, `execution`). `SeriesCatalogEntry.price_use` is a SCALAR
# (`str | None`) — one row cannot carry three uses without either losing two of them or
# duplicating the row under an identical `SeriesKey` (which `SeriesCatalog.__post_init__`
# refuses as `DuplicateSeriesKeyError`, correctly: `mark_price` for `funding` and `mark_price`
# for `cost` are NOT two series, they are the same series read for two purposes).
#
# So `PRICE_SOURCE_BY_USE` below — not the scalar field — is what `ADR-007` means by "`price_
# source` declarado por `price_use` no catálogo": the catalog rows this module builds
# (`build_price_series_entries`) establish that `klines_last` and `price_mark_close` EXIST as
# real, catalogued series (closing item 6.6); this table is what a caller consults to answer
# "which source, for this use" (closing item 6.7, `ADR-007`/PS-1). A row's own `price_use` is
# left `None` here — correctly, per the reasoning above, not as an omission — this table is
# the single place the assignment lives, so there is exactly one place to update it.
#
# ── `PS-1` — THE MECHANISM, NOT A CONVENTION ────────────────────────────────────────────────
#
# `ADR-007`, literal: "Pedir preço SEM `price_use` é ERRO, nunca default silencioso — um
# default aqui escolhe QUAL GRANDEZA o consumidor recebeu, e a escolha muda ONDE O SWING ESTÁ."
# `resolve_price_source` below is the enforcement: omitting `price_use` (`None`) or passing a
# value outside the closed set both raise, and neither ever falls back to a source.
#
# ── `price_mark_close`, NOT `implied_avg_price` (`PS-2`) ───────────────────────────────────
#
# The name is already forbidden at the identity layer: `series_key.py`'s
# `FORBIDDEN_METRIC_NAMES` refuses `implied_avg_price` inside `SeriesKey.__post_init__`, so no
# `SeriesCatalogEntry` — not only the ones this module builds — can ever be constructed over
# that name. `test_price_source_catalog.py::test_implied_avg_price_is_still_forbidden_here` is
# a regression pinning that this module's own construction path goes through that guard rather
# than around it.
#
# `price_mark_close` reads `Nature.STOCK` / `Reduction.CLOSE` / `TsConvention.
# POINT_AT_BUCKET_END`: it is `ADR-007`'s "brinde" — `sum_open_interest_value /
# sum_open_interest`, exact to 8 decimals against `markPriceKlines.close` of the same bucket,
# 288/288 on two days of BTCUSDT (`ADR-007`, `provenance.py`'s `DETERMINISTIC_FUNCTIONS_OF_
# OBSERVED`) — so its `provenance` at write time is `Provenance.DERIVED`, never `MODELADO`
# (`provenance.reject_modeled_for_deterministic_metric` already enforces this; this module
# does not repeat that check).
#
# `klines_last` reads `Reduction.LAST`: it is the CLOSE/last trade price of the bucket, the
# series `ADR-007` names for `structure_detection` and `execution` because it is the
# negotiated price, not the 1 Hz-sampled mark.
#
# ── SCOPE: `sentimento` ONLY, `PS-3` IS NOT HERE ────────────────────────────────────────────
#
# `ADR-007`/`PS-3` ("toda `<Anotacao>` carrega `price_source` e `price_use`; reabrir sob outra
# série não reexibe como a mesma marcação") is about `<Anotacao>`, which `provenance.py`
# already notes belongs to `charts`/`backtest`/`web` — out of this component's boundary. This
# module gives those components the resolver they will need; it does not build the
# annotation type.
#
# `index_price` and `premium_index` are members of `PRICE_SOURCES` (`SPEC-001` §3.7's closed
# set, transcribed below) but `ADR-007`'s table assigns them to no `price_use` today — they
# are therefore NOT built as catalog rows by this module. Cataloguing a series nobody reads
# yet would be a row with no evidence behind it; the day a `price_use` needs one of them, that
# row is one function added here, not a redesign.

from __future__ import annotations

from types import MappingProxyType
from typing import Final

from src.modules.sentimento.domain.series_catalog import (
    PRICE_USES,
    InvalidPriceUseError,
    SeriesCatalogEntry,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# `SPEC-001` §3.7, transcribed verbatim: the closed set of price sources.
PRICE_SOURCES: Final[frozenset[str]] = frozenset(
    {"klines_last", "mark_price", "index_price", "premium_index", "price_mark_close"}
)

# `mark_price` (the CONCEPT `ADR-007`'s table names) is materialized in this catalog as the
# `price_mark_close` metric (`SPEC-001` §3.1 / PS-2) — the free, zero-error reconstruction from
# the `metrics` dump that this project already ingests, rather than a separate ingest of
# `markPriceKlines`. `_CONCEPT_TO_CATALOGED_SOURCE` records that one substitution; every other
# `PRICE_SOURCES` member catalogs under its own name.
_CONCEPT_TO_CATALOGED_SOURCE: Final[MappingProxyType[str, str]] = MappingProxyType(
    {"mark_price": "price_mark_close"}
)

# `ADR-007`'s decision table, transcribed verbatim (price_use -> price_source, pre-substitution).
_PRICE_SOURCE_BY_USE_RAW: Final[MappingProxyType[str, str]] = MappingProxyType(
    {
        "structure_detection": "klines_last",
        "liquidation_trigger": "mark_price",
        "funding": "mark_price",
        "execution": "klines_last",
        "cost": "mark_price",
    }
)

# The table a caller actually consults: `ADR-007`'s assignment with the `mark_price` concept
# already substituted for the catalogued `price_mark_close` metric — a caller of `resolve_
# price_source` gets back the name it can look up with `SeriesCatalog.entry_for`, never the
# concept name `ADR-007`'s prose uses.
PRICE_SOURCE_BY_USE: Final[MappingProxyType[str, str]] = MappingProxyType(
    {
        use: _CONCEPT_TO_CATALOGED_SOURCE.get(source, source)
        for use, source in _PRICE_SOURCE_BY_USE_RAW.items()
    }
)

if frozenset(PRICE_SOURCE_BY_USE) != PRICE_USES:
    # Not `assert`: this module-level invariant must hold even when Python runs with `-O`
    # (which strips `assert`), and `ruff`'s `S101` refuses `assert` outside tests for the same
    # reason. A `price_use` missing here would let `resolve_price_source` `KeyError` silently
    # instead of naming the gap.
    raise RuntimeError(
        "PRICE_SOURCE_BY_USE must assign every price_use ADR-007/SPEC-001 §3.7 declares"
    )


class MissingPriceUseError(Exception):
    """`price_use` was omitted (`None`) asking for a price source — `ADR-007`/`PS-1`.

    Deliberately its own type, not folded into `InvalidPriceUseError`: `PS-1`'s point is that
    OMITTING the use is a different mistake from naming a use the SPEC never declared, and a
    caller that wants to tell "forgot to ask" apart from "asked for something that doesn't
    exist" can catch this one without inspecting the message.
    """


def resolve_price_source(price_use: str | None) -> str:
    """Return the `price_source` `ADR-007` assigns to `price_use` — never a silent default.

    `price_use=None` raises `MissingPriceUseError`; a value outside `SPEC-001` §3.7's closed
    set raises `InvalidPriceUseError` (reused from `series_catalog.py`, not reimplemented) —
    `PS-1`, literal: "um default aqui escolhe QUAL GRANDEZA o consumidor recebeu, e a escolha
    muda ONDE O SWING ESTÁ".
    """
    if price_use is None:
        raise MissingPriceUseError(
            "price_use is required to resolve a price_source (`ADR-007`/`PS-1`): a default "
            "here would silently pick which price GRANDEZA the caller receives, and that "
            "choice decides where the swing is"
        )
    if price_use not in PRICE_USES:
        raise InvalidPriceUseError(
            f"price_use = {price_use!r} is outside `SPEC-001` §3.7's closed set "
            f"{sorted(PRICE_USES)!r}"
        )
    return PRICE_SOURCE_BY_USE[price_use]


def build_klines_last_entry(instrument_id: str, *, verified_by: str) -> SeriesCatalogEntry:
    """Build the `klines_last` catalog row for `instrument_id` — the negotiated-price series.

    `Reduction.LAST`: the last trade price of the 5-minute bucket. `ADR-007` names it for
    `structure_detection` and `execution` because the mark price is subsampled at 1 Hz
    (`count = 300`/bucket against a mean of 11.245 trades/bucket) and its extremes are
    therefore undersampled by construction — swing, BOS/CHoCH and sweep need the traded price.

    `label_shift=0`: no dump-vs-REST divergence is measured for `klines` in this task (unlike
    the `metrics` endpoints `T-06.2` tables) — an explicit zero, not an unmeasured default,
    because `verified_by` names the test that pins it.
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric="klines_last",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.LAST,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(key=key, native_grid="5min", max_staleness_ms=600_000)


def build_price_mark_close_entry(instrument_id: str, *, verified_by: str) -> SeriesCatalogEntry:
    """Build the `price_mark_close` catalog row for `instrument_id` — `mark_price`, cataloged.

    `Reduction.CLOSE` / `Nature.STOCK`: the close-of-bucket mark price, reconstructed as
    `sum_open_interest_value / sum_open_interest` from the `metrics` dump this project already
    ingests — `ADR-007`'s "brinde", exact to 8 decimals against `markPriceKlines.close` of the
    same bucket, 288/288 on two days of BTCUSDT. `ADR-007` names it for `liquidation_trigger`,
    `funding` and `cost` because liquidation and funding are computed ON the mark, never on
    last.

    This is the row `PS-2` requires to exist: `price_mark_close` "declarada no catálogo — não
    subproduto do painel de OI". `implied_avg_price` cannot reach this function at all — the
    name is fixed here, and `SeriesKey.__post_init__` would refuse it regardless
    (`FORBIDDEN_METRIC_NAMES`).
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric="price_mark_close",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.CLOSE,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(key=key, native_grid="5min", max_staleness_ms=600_000)


def build_price_series_entries(
    instrument_id: str, *, verified_by: str
) -> tuple[SeriesCatalogEntry, ...]:
    """Build every price-series catalog row this task populates, for one `instrument_id`.

    Two rows today (`klines_last`, `price_mark_close`) — `index_price` and `premium_index`
    join the day a `price_use` is assigned to either (see the module docstring's "SCOPE"
    section).
    """
    return (
        build_klines_last_entry(instrument_id, verified_by=verified_by),
        build_price_mark_close_entry(instrument_id, verified_by=verified_by),
    )
