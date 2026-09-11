/**
 * `series_key_id` — the `sha256` of a canonical `SeriesKey`, recomputed client-side.
 *
 * ── WHY ITS OWN MODULE, SPLIT OUT OF `view-model.ts` (wave `03`) ─────────────────────────────
 *
 * `e2e/08-symbol-dado-real.spec.ts` needs this id to ask `/series-history` the same question the
 * page asked, and importing it from `view-model.ts` drags in `charts/index.ts` — whose barrel
 * evaluates `s2-headless-run.ts` and therefore `jsdom`, which dies under Playwright's module
 * loader in this environment ("module is not linked", `html-encoding-sniffer`) and takes the
 * COLLECTION of every spec down with it (`Total: 0 tests in 0 files`). This module imports
 * `node:crypto` and one TYPE, nothing else, so it is safe to reach from a spec.
 *
 * ⛔ The alternative — re-implementing the hash inside the spec — was refused: a second hashing
 * of the same key fails SILENTLY, because a wrong id answers `200` with an all-absent grid
 * rather than an error. The one place this repository computes it stays one place.
 *
 * `view-model.ts` re-exports it, so every existing caller is unchanged.
 */

import { createHash } from "node:crypto";

import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

// ── `series_key_id` — computed client-side, not read off the wire ──────────────────────────
//
// `GET /series-catalog`'s envelope (`series_catalog.py::_entry_to_wire`) carries the 15 RAW
// terms of a `SeriesKey` (`key`) but never the `sha256` id itself — `/series-history`'s own
// query parameter — so `web` cannot look an id up, it has to RECOMPUTE the same hash the
// backend computes, from the same 15 terms `/series-catalog` already hands it.
// `series_key.py::SeriesKey.series_key_id()`, transcribed here field-for-field:
//
//   sha256(json.dumps({term: key[term] for term in SERIES_KEY_TERMS}, ensure_ascii=True,
//                     separators=(",", ":"), sort_keys=False)).hexdigest()
//
// `canonical_json.py`'s own docstring: "insertion order IS the field order" — `SERIES_KEY_
// TERMS`'s order (`provider, venue, instrument_id, metric, cohort, interval, unit, denom,
// nature, ts_convention, reduction, quantity_field, label_shift, aggregation_scope,
// verified_by`) is reproduced below as insertion order into a plain object, which
// `JSON.stringify` preserves for non-integer-like string keys (every key here is) — and
// `JSON.stringify`'s default output already carries no whitespace, matching Python's
// `separators=(",", ":")` byte-for-byte for the ASCII field values this catalog only ever
// carries (symbol/metric/etc. are all plain ASCII, so `ensure_ascii=True`'s escaping is a
// no-op here). `SeriesKey.nature`/`.tsConvention`/`.reduction`/`.quantityField` are ALREADY
// the enum's string VALUE on the wire (`series-catalog-query.ts`'s own
// `NATURE_VALUES`/`TS_CONVENTION_VALUES`/etc. sets, checked against those exact strings) — no
// `.value` projection is needed here, unlike the Python `Enum` member `canonical_terms()`
// unwraps on its own side.
const SERIES_KEY_BACKEND_TERM_ORDER: ReadonlyArray<readonly [keyof SeriesKey, string]> = [
  ["provider", "provider"],
  ["venue", "venue"],
  ["instrumentId", "instrument_id"],
  ["metric", "metric"],
  ["cohort", "cohort"],
  ["interval", "interval"],
  ["unit", "unit"],
  ["denom", "denom"],
  ["nature", "nature"],
  ["tsConvention", "ts_convention"],
  ["reduction", "reduction"],
  ["quantityField", "quantity_field"],
  ["labelShift", "label_shift"],
  ["aggregationScope", "aggregation_scope"],
  ["verifiedBy", "verified_by"],
];

/**
 * Recomputes `SeriesKey.series_key_id()` (`series_key.py`) client-side, from the 15 raw terms
 * `GET /series-catalog` already serves — see the module-level comment above for the exact
 * mirroring and why it is necessary (the wire carries no id of its own).
 */
export function computeSeriesKeyId(key: SeriesKey): string {
  const projected: Record<string, string | number> = {};
  for (const [tsField, backendTerm] of SERIES_KEY_BACKEND_TERM_ORDER) {
    projected[backendTerm] = key[tsField] as string | number;
  }
  const canonical = JSON.stringify(projected);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
