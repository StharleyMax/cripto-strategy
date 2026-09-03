/**
 * `T-06.10` — TypeScript mirror of `quarantine_terms.py` (backend, `T-06.6`).
 *
 * `SPEC-001` §5.2, quoted verbatim in the Python source:
 *   QUARENTENA  <=>  label_shift IS NULL  OR  unit IS NULL  OR  available_at IS NULL
 *
 * Unlike `series-catalog.ts` (a wire/column shape, kept snake_case), `QuarantineTerms` is an
 * ordinary domain type — the three presence bits, never persisted under these exact names — so
 * it is camelCased per this repository's TS convention (`domain.ts` in `s1-console` does the
 * same for `uptimePercent`, `intervalMinutes`, none of which are DB columns either).
 */

/** The three presence bits `SPEC-001` §5.2 ORs together — mirrors
 * `quarantine_terms.py::QuarantineTerms`, one field per term, none implicit. */
export interface QuarantineTerms {
  readonly labelShiftPresent: boolean;
  readonly unitPresent: boolean;
  readonly availableAtPresent: boolean;
}

/** De Morgan flip of `SPEC-001`'s "OR of NULLs" into "AND of presents" — mirrors
 * `QuarantineTerms.is_quarantined`. */
export function isQuarantined(terms: QuarantineTerms): boolean {
  return !(terms.labelShiftPresent && terms.unitPresent && terms.availableAtPresent);
}

/** Name every absent term, in the SAME order the Python property checks them — mirrors
 * `QuarantineTerms.open_terms`. This order is what the quarantine drawer's microcopy reads out
 * loud (e.g. "sem procedência" cases name `available_at` last, matching the predicate's own
 * left-to-right reading), so a reorder here is a display regression, not a refactor. */
export function openTerms(terms: QuarantineTerms): readonly string[] {
  const missing: string[] = [];
  if (!terms.labelShiftPresent) {
    missing.push("label_shift");
  }
  if (!terms.unitPresent) {
    missing.push("unit");
  }
  if (!terms.availableAtPresent) {
    missing.push("available_at");
  }
  return missing;
}

/** Mirrors `quarantine_terms.py::COINALYZE_ONE_SHOT_TERMS` — `SPEC-001` §5.2's own worked
 * example: the Coinalyze one-shot resolves `label_shift`/`unit` but not `available_at` (`Q19`
 * still open). Used by `fixtures.ts` so the quarantined fixture row reproduces a REAL, named
 * case instead of an arbitrary one. */
export const COINALYZE_ONE_SHOT_TERMS: QuarantineTerms = {
  labelShiftPresent: true,
  unitPresent: true,
  availableAtPresent: false,
};

/** The terms of a series that is NOT quarantined — the common case, named so a fixture that
 * wants "fully resolved" does not have to spell out three `true`s inline every time. */
export const FULLY_RESOLVED_TERMS: QuarantineTerms = {
  labelShiftPresent: true,
  unitPresent: true,
  availableAtPresent: true,
};
