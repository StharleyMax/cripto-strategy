// Testes de `T-06.10` — porte fiel de `quarantine_terms.py` (backend, `T-06.6`).
//
// Run with: npm --prefix frontend run test:s3 (ou node --test 'src/features/s3-inspector/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COINALYZE_ONE_SHOT_TERMS,
  FULLY_RESOLVED_TERMS,
  isQuarantined,
  openTerms,
  type QuarantineTerms,
} from "./quarantine.ts";

test("isQuarantined é falso só quando os TRÊS termos estão presentes", () => {
  assert.equal(isQuarantined(FULLY_RESOLVED_TERMS), false);
});

test("isQuarantined é verdadeiro quando QUALQUER um dos três termos falta", () => {
  const cases: QuarantineTerms[] = [
    { labelShiftPresent: false, unitPresent: true, availableAtPresent: true },
    { labelShiftPresent: true, unitPresent: false, availableAtPresent: true },
    { labelShiftPresent: true, unitPresent: true, availableAtPresent: false },
    { labelShiftPresent: false, unitPresent: false, availableAtPresent: false },
  ];
  for (const terms of cases) {
    assert.equal(isQuarantined(terms), true, JSON.stringify(terms));
  }
});

test("COINALYZE_ONE_SHOT_TERMS reproduz SPEC-001 §5.2: label_shift/unit presentes, available_at não", () => {
  assert.equal(isQuarantined(COINALYZE_ONE_SHOT_TERMS), true);
  assert.deepEqual(openTerms(COINALYZE_ONE_SHOT_TERMS), ["available_at"]);
});

test("openTerms nomeia os três termos na ordem do predicado, quando todos faltam", () => {
  const allMissing: QuarantineTerms = {
    labelShiftPresent: false,
    unitPresent: false,
    availableAtPresent: false,
  };
  assert.deepEqual(openTerms(allMissing), ["label_shift", "unit", "available_at"]);
});

test("openTerms devolve lista vazia para uma série totalmente resolvida", () => {
  assert.deepEqual(openTerms(FULLY_RESOLVED_TERMS), []);
});
