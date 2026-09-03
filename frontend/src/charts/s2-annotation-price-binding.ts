/**
 * `ADR-007`/`PS-3` + plan `D5.5` ("a marcação fica amarrada à série de preço"), made
 * executable on top of `s2-annotation-identity.ts`'s `D5.10` slice — COMPOSED, not
 * reimplemented: `createAnnotationIdentity`'s own `principalId` refusal is reused verbatim
 * here rather than duplicated.
 *
 * `PS-3`, literal: "Toda `<Anotacao>` carrega `price_source` E `price_use`. Teste negativo:
 * marcar sob `klines_last` e reabrir sob `mark_price` ⇒ a marcação NÃO é reexibida como se
 * fosse a mesma (ou vem rotulada `marcada sobre outra série de preço`)."
 *
 * SCOPE, same posture as `s2-annotation-identity.ts`'s own module docstring: `<Anotacao>`'s
 * full key (`PRD-001:360`) is much bigger than the two fields this task adds. This module
 * binds exactly `price_source` + `price_use` to the identity slice `T-05.4`(`D5.10`) already
 * built; `pointer_mode` (`T-05.6`) and the rest of the key are explicitly out of scope here.
 */

import { createAnnotationIdentity } from "./s2-annotation-identity.ts";
import type { AnnotationIdentity } from "./s2-annotation-identity.ts";
import { resolvePriceSource } from "./s2-price-source.ts";
import type { PriceSource, PriceUse } from "./s2-price-source.ts";

/** One `<Anotacao>` row's identity + the price series it was made under. `priceSource` is
 * ALWAYS derived from `priceUse` (`resolvePriceSource`), never an independent field a caller
 * could set inconsistently with it — the same discipline `PricePanel` (`s2-panels.ts`)
 * follows for the panel row itself. */
export interface PriceBoundAnnotation extends AnnotationIdentity {
  readonly priceSource: PriceSource;
  readonly priceUse: PriceUse;
}

/**
 * Builds a `<Anotacao>` identity bound to the price series in effect when the human made the
 * mark. `priceUse: PriceUse | null` (not optional) carries `PS-1`'s refusal through to marks,
 * not only to panels: a mark made without a `price_use` throws `MissingPriceUseError`
 * (`resolvePriceSource`), it is never silently attributed to whichever source happens to be
 * on screen. `principalId`/`createdAtMs` validation is entirely `createAnnotationIdentity`'s
 * (`D5.10`) — not repeated here.
 */
export function createPriceBoundAnnotation(
  principalId: string,
  createdAtMs: number,
  priceUse: PriceUse | null,
): PriceBoundAnnotation {
  const identity = createAnnotationIdentity(principalId, createdAtMs);
  const priceSource = resolvePriceSource(priceUse);
  return { ...identity, priceSource, priceUse: priceUse as PriceUse };
}

/** The exact label `ADR-007`/`PS-3` names for a mark reopened under a different price series. */
export const PRICE_SERIES_MISMATCH_LABEL = "marcada sobre outra série de preço";

export interface AnnotationReopenView {
  /** `true` only when `currentPriceSource` is bit-for-bit the same source the mark was made under. */
  readonly isSamePriceSeries: boolean;
  /** `PRICE_SERIES_MISMATCH_LABEL` when `isSamePriceSeries` is `false`, `null` otherwise. */
  readonly label: string | null;
}

/**
 * `D5.5`'s negative test, made executable: reopening `annotation` while the panel currently
 * shows `currentPriceSource` must never present it as if it were made on that series.
 *
 * This function does not hide, delete, or silently reposition the mark — it reports the fact
 * (`isSamePriceSeries`) and the required label, leaving what a renderer DOES with a mismatch
 * (refuse to draw it, draw it greyed out, draw it with the label) to a later, `web`-owned UI
 * task; `D5.5`'s own DoD accepts either "não é reexibida como se fosse a mesma" outcome or
 * the label, and this function is the primitive both of those are built from.
 */
export function describeAnnotationOnReopen(
  annotation: PriceBoundAnnotation,
  currentPriceSource: PriceSource,
): AnnotationReopenView {
  const isSamePriceSeries = annotation.priceSource === currentPriceSource;
  return {
    isSamePriceSeries,
    label: isSamePriceSeries ? null : PRICE_SERIES_MISMATCH_LABEL,
  };
}
