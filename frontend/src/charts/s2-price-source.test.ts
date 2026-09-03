// `T-05.5` / item `5.7` — `ADR-007`'s decision table made executable on the `charts` side,
// and `PS-1` ("pedir preço sem `price_use` é erro, nunca default silencioso") as a falsifier:
// the negative case (`null`, and a value outside the closed set) is asserted to THROW, not
// merely that the positive cases resolve — a resolver that silently defaulted would still
// pass every positive-only assertion here.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolvePriceSource,
  PRICE_USES,
  MissingPriceUseError,
  InvalidPriceUseError,
} from "./s2-price-source.ts";
import type { PriceUse } from "./s2-price-source.ts";

test("ADR-007's decision table, all five price_use values resolve to the source the table names", () => {
  const expected: Record<PriceUse, string> = {
    structure_detection: "klines_last",
    liquidation_trigger: "mark_price",
    funding: "mark_price",
    execution: "klines_last",
    cost: "mark_price",
  };
  for (const priceUse of PRICE_USES) {
    assert.equal(resolvePriceSource(priceUse), expected[priceUse]);
  }
});

test("PS-1 falsifier: omitting price_use (null) throws MissingPriceUseError, never a default", () => {
  assert.throws(() => resolvePriceSource(null), MissingPriceUseError);
});

test("PS-1 falsifier: a price_use outside the closed set throws InvalidPriceUseError, never a default", () => {
  assert.throws(
    () => resolvePriceSource("nao_existe" as unknown as PriceUse),
    InvalidPriceUseError,
  );
});
