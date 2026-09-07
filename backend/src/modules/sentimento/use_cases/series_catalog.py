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
"""

from __future__ import annotations

import logging
from typing import Final

from src.modules.sentimento.domain.cvd_source_catalog import build_cvd_source_catalog_entries
from src.modules.sentimento.domain.open_interest_catalog import open_interest_catalog_entries
from src.modules.sentimento.domain.price_source_catalog import build_price_series_entries
from src.modules.sentimento.domain.series_catalog import (
    PublishedError,
    SeriesCatalog,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import SeriesKey

logger = logging.getLogger(__name__)

# The name is STABLE, matching `ingest_health.py::INGEST_HEALTH_QUERY_NAME`'s own reasoning:
# `SPEC-003` §3.4 fixes it as the `"query"` field's value.
SERIES_CATALOG_QUERY_NAME: Final[str] = "series_catalog"

# The one instrument every catalog-builder module already populates rows for
# (`open_interest_catalog.py`'s own default, `"BTCUSDT"`) — no second instrument exists in this
# codebase yet, so this use case names it explicitly rather than re-guessing a default.
_INSTRUMENT_ID: Final[str] = "BTCUSDT"

# The base-asset unit for `_INSTRUMENT_ID` — `cvd_source_catalog`'s builders require it as an
# explicit argument, never a hardcoded default inside that module (`ADR-001`: the summed
# quantity is denominated in the instrument's OWN base asset, and a hardcoded `"BTC"` there
# would silently mislabel a future non-BTC instrument). `open_interest_catalog.py` hardcodes the
# same value, `"BTC"`, for the same instrument, internally.
_CVD_UNIT: Final[str] = "BTC"

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


def list_series_catalog(instrument_id: str = _INSTRUMENT_ID) -> SeriesCatalog:
    """Build `series_catalog` from the three modules `T-06.x` already populated, for one instrument.

    `build_series_catalog` (`series_catalog.py`) re-validates `SPEC-001` §3.3's "UMA linha por
    `SeriesKey`" over the COMBINED tuple, not merely trusting each source module's own internal
    check — a real cross-source collision would raise `DuplicateSeriesKeyError` here rather than
    silently keep one of the two rows.
    """
    entries: list[SeriesCatalogEntry] = [
        *build_cvd_source_catalog_entries(
            instrument_id, unit=_CVD_UNIT, verified_by=_CVD_VERIFIED_BY
        ),
        *build_price_series_entries(instrument_id, verified_by=_PRICE_VERIFIED_BY),
        *open_interest_catalog_entries(instrument_id).entries,
    ]
    # DEBUG, not INFO — same reasoning `ingest_health_query` already documents: this read path
    # is not a byte contract of its own, but a library that logs at INFO by default imposes its
    # volume on every host regardless of whether anyone asked.
    logger.debug("series_catalog_query_read", extra={"n_entries": len(entries)})
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
