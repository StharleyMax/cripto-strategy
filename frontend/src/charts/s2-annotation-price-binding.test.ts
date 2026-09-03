// `T-05.5` / `D5.5`: "a marcação fica amarrada à série de preço" — marcar sob
// `price_source = klines_last` (price_use = structure_detection) e reabrir sob `mark_price`
// (price_use = liquidation_trigger) ⇒ a marcação NÃO é reexibida como se fosse a mesma (ou
// vem rotulada `marcada sobre outra série de preço`). This is the literal negative test the
// plan/DoD names, run against the primitive `describeAnnotationOnReopen` builds it from.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPriceBoundAnnotation,
  describeAnnotationOnReopen,
  PRICE_SERIES_MISMATCH_LABEL,
} from "./s2-annotation-price-binding.ts";
import { resolvePriceSource } from "./s2-price-source.ts";
import { MissingPrincipalIdError } from "./s2-annotation-identity.ts";
import { MissingPriceUseError } from "./s2-price-source.ts";

test("createPriceBoundAnnotation carries price_source (derived) AND price_use verbatim — PS-3", () => {
  const annotation = createPriceBoundAnnotation("owner-stharley", 1_000, "structure_detection");
  assert.equal(annotation.priceUse, "structure_detection");
  assert.equal(annotation.priceSource, "klines_last");
  assert.equal(annotation.principalId, "owner-stharley");
});

test("D5.5 falsifier: mark under klines_last, reopen under mark_price — NOT reexhibited as the same mark", () => {
  const markedUnderKlinesLast = createPriceBoundAnnotation("owner-stharley", 1_000, "structure_detection");
  assert.equal(markedUnderKlinesLast.priceSource, "klines_last");

  const currentPriceSourceOnReopen = resolvePriceSource("liquidation_trigger"); // "mark_price"
  const view = describeAnnotationOnReopen(markedUnderKlinesLast, currentPriceSourceOnReopen);

  assert.equal(view.isSamePriceSeries, false);
  assert.equal(view.label, PRICE_SERIES_MISMATCH_LABEL);
  assert.equal(view.label, "marcada sobre outra série de preço");
});

test("positive control: reopening under the SAME price_source carries no mismatch label", () => {
  const marked = createPriceBoundAnnotation("owner-stharley", 1_000, "structure_detection");
  const view = describeAnnotationOnReopen(marked, "klines_last");
  assert.equal(view.isSamePriceSeries, true);
  assert.equal(view.label, null);
});

test("PS-1 propagates to marks: creating a mark without price_use throws MissingPriceUseError", () => {
  assert.throws(() => createPriceBoundAnnotation("owner-stharley", 1_000, null), MissingPriceUseError);
});

test("D5.10's own refusal still applies: an empty principalId throws, price_use notwithstanding", () => {
  assert.throws(
    () => createPriceBoundAnnotation("", 1_000, "structure_detection"),
    MissingPrincipalIdError,
  );
});
