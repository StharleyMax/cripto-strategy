"""`list_series_catalog`: the ONE query that concatenates the catalog rows `T-06.x` populated.

`SPEC-003` §3.4 fixes the envelope: `{"query": "series_catalog", "n_entries", "entries": […]}`,
with `SeriesCatalogEntry` on the wire named exactly as `series-catalog.ts:134`'s already-published
TS interface — camelCase (`nativeGrid`, `maxStalenessMs`, `priceUse`, `reconstructedFrom`,
`publishedError`, and `key`'s own `instrumentId`/`tsConvention`/`quantityField`/`labelShift`/
`aggregationScope`/`verifiedBy`). That TS file's OWN docstring claims these fields are kept
"Python/wire NAMES (snake_case)" — but the interface it introduces two lines later is camelCase
throughout, and `assertValidSeriesKey`/`assertValidCatalogEntry` (already written, `T-06.10`)
read `key.instrumentId` etc. directly, never re-casing. This module follows the CODE that is
already published and that `SPEC-003` cites by line number, not the stale claim in its prose.

── THE "7" IN `SPEC-003`/plan `03`/`tasks.toml` DOES NOT SURVIVE CONTACT WITH THE DISK ──────

`SPEC-003` §0.1#7, the plan's D3.1 and `tasks.toml`'s own DoD all write the SAME equation:
`n_entries = 7 = grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' | grep -v test |
wc -l`. That grep counts literal CALL SITES across `cvd_source_catalog.py` (3),
`price_source_catalog.py` (2) and `open_interest_catalog.py` (2) — and it is still 7 today
(re-measured building this task). But a call SITE is not a ROW: `open_interest_catalog_entries`
(`T-06.5`, `CA-F2-17`) builds FOUR of its five rows from ONE list-comprehension call site — its
own module docstring, unchanged since 2026-09-03 (two days before `SPEC-003` was written): "five
rows, never a collapsed one". Concatenating the three modules' own catalog-builder functions in
full — `build_cvd_source_catalog_entries` (3) + `build_price_series_entries` (2) +
`open_interest_catalog_entries` (5) — measures **10**, not 7:

    .venv/bin/python -c "
    from src.modules.sentimento.domain.cvd_source_catalog import build_cvd_source_catalog_entries
    from src.modules.sentimento.domain.price_source_catalog import build_price_series_entries
    from src.modules.sentimento.domain.open_interest_catalog import open_interest_catalog_entries
    combined = [*build_cvd_source_catalog_entries('BTCUSDT', unit='BTC', verified_by='x'),
                *build_price_series_entries('BTCUSDT', verified_by='x'),
                *open_interest_catalog_entries('BTCUSDT').entries]
    raise SystemExit(len(combined))"
    # exit code -> 10 (this module's own test suite asserts the same number, not a shell echo)

Collapsing to 7 here would mean silently dropping THREE real Coinalyze open-interest series
(keeping only `CLOSE` + Binance's `POINT`, discarding `OPEN`/`HIGH`/`LOW`) — the exact failure
`CA-F2-17` exists to forbid, and it would happen inside the very use case whose title says it
"concatena as 7 constantes". This module instead concatenates the FULL, real output of the three
modules' own aggregate builders and reports the ACTUAL count (`n_entries = len(entries)`,
computed — never a literal `7`, so the field cannot drift from the list it counts). The mismatch
against `SPEC-003`'s illustrative envelope and `tasks.toml`'s DoD equation is named in this task's
QA gate report for `docs/plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md`'s own
owners to reconcile — not resolved here by quietly shipping a catalog with fewer real series than
the source modules already, deliberately, populate.

── `T-01.6` (`SPEC-007` §4.5, `RF-2`): THE COUNT IS 11, AND IT IS STILL COMPUTED ────────────

`klines_volume` (`domain/klines_volume_catalog.py`, built by `T-01.1`) is appended as the
eleventh row. The number above moves from 10 to 11 for the same reason it was never a literal:
`n_entries = len(catalog.entries)`, so the count follows the list and the list follows the
builders. A FOURTH source module now feeds this function, which is the only structural change —
the envelope, the field names and the order of the ten pre-existing rows are untouched (`RS-1`:
content may change here, form may not).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Final

from src.modules.sentimento.domain.cvd_source_catalog import build_cvd_source_catalog_entries
from src.modules.sentimento.domain.instrument import base_asset
from src.modules.sentimento.domain.klines_volume_catalog import build_klines_volume_entry
from src.modules.sentimento.domain.open_interest_catalog import open_interest_catalog_entries
from src.modules.sentimento.domain.price_source_catalog import build_price_series_entries
from src.modules.sentimento.domain.series_catalog import (
    PublishedError,
    SeriesCatalog,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import SeriesKey
from src.modules.sentimento.use_cases.collector_series_mapping import INITIAL_SYMBOLS

logger = logging.getLogger(__name__)

# The name is STABLE, matching `ingest_health.py::INGEST_HEALTH_QUERY_NAME`'s own reasoning:
# `SPEC-003` §3.4 fixes it as the `"query"` field's value.
SERIES_CATALOG_QUERY_NAME: Final[str] = "series_catalog"

# The instrument every catalog-builder module already defaults to (`open_interest_catalog.py`'s
# own default). It is NOT "the universe" — it is the head of `PILOT_INSTRUMENT_IDS` below, kept
# as the single-instrument default of `list_series_catalog` so that function stays exactly what
# its tests call it: a pure function of ONE `instrument_id`.
_INSTRUMENT_ID: Final[str] = "BTCUSDT"

# ── THE SERVED CATALOG COVERED 1 INSTRUMENT WHILE THE WRITER WROTE 4 ────────────────────────
#
# `INITIAL_SYMBOLS` (`collector_series_mapping.py`) is the set the COLLECTOR writes rows for,
# and `md.series` in production carries exactly those four
# `[MEDIDO 2026-09-11: docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy
# -At -c "select count(distinct symbol) from md.series;" -> 4; symbols BTCUSDT, ETHUSDT,
# LINKUSDT, SOLUSDT, n=4]`. The served catalog was built by `list_series_catalog()` with its
# single-instrument default, so THREE of the four symbols had no catalog row at all, and
# `/api/v1/series-history` answered `422 UnknownSeriesKeyIdError` for `series_key_id`s whose
# rows were sitting in the table — the failure `collector_series_mapping.py`'s own
# `_KLINES_VOLUME_VERIFIED_BY` comment names, arriving through the instrument term instead of
# through `verified_by`.
#
# This is CONFIGURATION, not an architecture choice: the universe was already declared twice —
# by the owner (`SPEC-007` §0.1, literal: "no piloto estamos rodando 4 symbols, quando virar n
# vamos chegar a 10" `[PREMISSA-OWNER: 2026-09-10]`) and, in code, by `INITIAL_SYMBOLS`. So the
# reader REUSES the writer's own set rather than declaring a second list that could drift from
# it: one list means the two sides cannot disagree about which instruments exist.
#
# ORDER IS FORM, and `RS-1` forbids changing form here: `_INSTRUMENT_ID` stays FIRST and the
# rest follow sorted, so every row that already had an index in `"entries"` keeps it and the
# new instruments are APPENDED — the same reasoning `T-01.6` used to append `klines_volume`
# instead of inserting it.
PILOT_INSTRUMENT_IDS: Final[tuple[str, ...]] = (
    _INSTRUMENT_ID,
    *sorted(INITIAL_SYMBOLS - {_INSTRUMENT_ID}),
)

# ── `_BASE_ASSET_UNIT` IS GONE, AND THE LITERAL IT HELD WAS A DEFECT ────────────────────────
#
# It read `_BASE_ASSET_UNIT: Final[str] = "BTC"` and was passed to
# `build_cvd_source_catalog_entries` and `build_klines_volume_entry` for WHATEVER
# `instrument_id` this function was called with. Both builders require `unit` from the caller
# precisely so it is never hardcoded — `cvd_source_catalog.py:190` ("the summed quantity is in
# the instrument's OWN base asset") and `klines_volume_catalog.py` ("the base asset of
# `ETHUSDT` is `ETH`, and a hardcoded `"BTC"` would silently mislabel every non-`BTC`
# instrument"). This module reintroduced the literal one layer above them, so
# `list_series_catalog("ETHUSDT")` published ETH volume and ETH CVD labelled `unit="BTC"`.
#
# The unit is now DERIVED from the instrument, by the same `domain/instrument.py::base_asset`
# the WRITER uses (`collector_series_mapping.build_klines_to_rows`) — which is what makes the
# two sides land on the same `series_key_id` instead of on two that merely look alike. For
# `BTCUSDT` the derived value is `"BTC"`, byte-identical to the old literal, so no existing
# row's `series_key_id` moves.

# `verified_by` names the test that empirically backs a `SeriesKey` (`SPEC-001` §2.1's fifteenth
# term) — the same convention `open_interest_catalog.py` already hardcodes in PRODUCTION code
# for its own rows (`_VERIFIED_BY` there). `cvd_source_catalog.py`/`price_source_catalog.py`
# take `verified_by` as a REQUIRED caller argument instead — this task is the first production
# caller of `build_cvd_source_catalog_entries`/`build_price_series_entries` (`grep -rn
# 'build_cvd_source_catalog_entries\|build_price_series_entries' backend/src --include='*.py'`
# finds no caller outside their own test files before this module) — so these two constants
# name the SAME test files each module's own test suite already uses as its `_VERIFIED_BY`.
_CVD_VERIFIED_BY: Final[str] = "test_cvd_source_catalog.py"
_PRICE_VERIFIED_BY: Final[str] = "test_price_source_catalog.py"

# `T-01.6`, and this one is LOAD-BEARING BEYOND THIS FILE. `verified_by` is the fifteenth term
# of `SeriesKey`, so it enters `series_key_id()`'s `sha256` (`series_key.py:226-234`): the
# `klines_volume` row SERVED here and the `klines_volume` row the collector WRITES to
# `md.series` are the same series only while both carry this exact string. `T-01.1` created the
# test and the name (`backend/tests/sentimento/test_klines_volume_catalog.py`); the writer side
# (`T-01.3`, `collector_series_mapping.py`) has to quote THIS constant's value, not re-invent
# one. If the two ever diverge, `/api/v1/series-history` answers `200` with `n_points = 0` for
# a series whose rows are sitting in the table under a different id — a `rc=0` that means
# "nothing here", which is the silent-break class `ADR-012` names, not a `422` anyone would see.
_KLINES_VOLUME_VERIFIED_BY: Final[str] = "test_klines_volume_catalog.py"


def list_series_catalog(instrument_id: str = _INSTRUMENT_ID) -> SeriesCatalog:
    """Build `series_catalog` from the three modules `T-06.x` already populated, for one instrument.

    `build_series_catalog` (`series_catalog.py`) re-validates `SPEC-001` §3.3's "UMA linha por
    `SeriesKey`" over the COMBINED tuple, not merely trusting each source module's own internal
    check — a real cross-source collision would raise `DuplicateSeriesKeyError` here rather than
    silently keep one of the two rows.

    `T-01.6` APPENDS `klines_volume` (`SPEC-007` §4, row M1) as the eleventh row. Appended, not
    inserted: `RS-1` lets this task change the catalog's CONTENT and forbids changing its FORM,
    and the ORDER of `"entries"` is form — appending leaves all ten pre-existing rows at the
    indices they already had. Registering it here is what `SPEC-007` §4.5 means by "reusar não é
    não fazer nada": the identity `T-01.1` built lives in `domain/`, and until this line exists
    `/api/v1/series-history` refuses its `series_key_id` with `422 UnknownSeriesKeyIdError`
    (`series_history.py:119-121` → `catalog.entry_for_id` returns `None`).
    """
    entries: list[SeriesCatalogEntry] = [
        *build_cvd_source_catalog_entries(
            instrument_id, unit=base_asset(instrument_id), verified_by=_CVD_VERIFIED_BY
        ),
        *build_price_series_entries(instrument_id, verified_by=_PRICE_VERIFIED_BY),
        *open_interest_catalog_entries(instrument_id).entries,
        build_klines_volume_entry(
            instrument_id, unit=base_asset(instrument_id), verified_by=_KLINES_VOLUME_VERIFIED_BY
        ),
    ]
    # DEBUG, not INFO — same reasoning `ingest_health_query` already documents: this read path
    # is not a byte contract of its own, but a library that logs at INFO by default imposes its
    # volume on every host regardless of whether anyone asked.
    logger.debug("series_catalog_query_read", extra={"n_entries": len(entries)})
    return build_series_catalog(entries)


def list_pilot_series_catalog(
    instrument_ids: Sequence[str] = PILOT_INSTRUMENT_IDS,
) -> SeriesCatalog:
    """Concatenate `list_series_catalog` over the PILOT universe — the catalog the API serves.

    This is the function `src/main` wires, and the reason it exists is measured above: the
    collector writes `md.series` rows for four instruments and the served catalog described
    one, so three quarters of what was on disk was unaddressable by `series_key_id`.

    `build_series_catalog` re-validates "UMA linha por `SeriesKey`" (`SPEC-001` §3.3) over the
    CONCATENATION, not merely inside each instrument's own catalog: two instruments cannot
    collide (`instrument_id` is a term of the key), but a repeated entry in `instrument_ids`
    would, and it raises `DuplicateSeriesKeyError` here instead of publishing the row twice.

    The unit of each row is derived per instrument by `list_series_catalog`, so `ETHUSDT`'s
    volume and CVD rows carry `unit="ETH"` — never the old hardcoded `"BTC"`.
    """
    entries: list[SeriesCatalogEntry] = [
        entry
        for instrument_id in instrument_ids
        for entry in list_series_catalog(instrument_id).entries
    ]
    logger.debug(
        "series_catalog_pilot_read",
        extra={"n_entries": len(entries), "n_instruments": len(tuple(instrument_ids))},
    )
    return build_series_catalog(entries)


def _series_key_to_wire(key: SeriesKey) -> dict[str, object]:
    """Project `SeriesKey` onto `series-catalog.ts:67-83`'s field names — camelCase, on purpose.

    Enum members are projected as their `.value` (matching `SeriesKey.canonical_terms()`'s own
    reasoning) so the wire carries the same string a JS `Nature`/`TsConvention`/`Reduction`/
    `QuantityField` union already names, never a Python repr.
    """
    return {
        "provider": key.provider,
        "venue": key.venue,
        "instrumentId": key.instrument_id,
        "metric": key.metric,
        "cohort": key.cohort,
        "interval": key.interval,
        "unit": key.unit,
        "denom": key.denom,
        "nature": key.nature.value,
        "tsConvention": key.ts_convention.value,
        "reduction": key.reduction.value,
        "quantityField": key.quantity_field.value,
        "labelShift": key.label_shift,
        "aggregationScope": key.aggregation_scope,
        "verifiedBy": key.verified_by,
    }


def _published_error_to_wire(published_error: PublishedError | None) -> dict[str, object] | None:
    """Project `PublishedError` onto `series-catalog.ts:125-129`'s field names, or `None`.

    `median_bp`/`p99_bp` are `Decimal` in `PublishedError` (`series_catalog.py`'s own reasoning:
    canonical arithmetic, never `float`, to avoid silent drift from a measured basis-point
    figure) — projected here as `float`, matching the TS `PublishedError.medianBp: number`
    already published: the WIRE is JSON, and JSON has no `Decimal`.
    """
    if published_error is None:
        return None
    return {
        "medianBp": float(published_error.median_bp),
        "p99Bp": float(published_error.p99_bp),
        "n": published_error.n,
    }


def _entry_to_wire(entry: SeriesCatalogEntry) -> dict[str, object]:
    """Project one `SeriesCatalogEntry` onto `series-catalog.ts:134`'s field names.

    `Completeness` never appears here (`SPEC-003` §3.4: "não vai no fio — o front preenche
    `unmeasured`") — this function projects exactly the six fields that interface declares,
    nothing else.
    """
    return {
        "key": _series_key_to_wire(entry.key),
        "nativeGrid": entry.native_grid,
        "maxStalenessMs": entry.max_staleness_ms,
        "priceUse": entry.price_use,
        "reconstructedFrom": entry.reconstructed_from,
        "publishedError": _published_error_to_wire(entry.published_error),
    }


def series_catalog_envelope(catalog: SeriesCatalog) -> dict[str, object]:
    """`{"query": "series_catalog", "n_entries", "entries": […]}` — `SPEC-003` §3.4.

    `n_entries` is `len(catalog.entries)`, COMPUTED from the same list `"entries"` serializes —
    never a literal number that could drift from it (see this module's own docstring for why a
    literal `7` here would be actively wrong, not merely stale).
    """
    return {
        "query": SERIES_CATALOG_QUERY_NAME,
        "n_entries": len(catalog.entries),
        "entries": [_entry_to_wire(entry) for entry in catalog.entries],
    }
