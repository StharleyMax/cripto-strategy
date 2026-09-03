/**
 * `T-08.10` (plan `08_superficie_e_reprodutibilidade.md` item `8.7`, `SPEC-001` §3.6, `Q20`):
 * `<Anotacao>`'s FIRST primitive, `swing_point`.
 *
 * `SPEC-001:282`, literal: "O primeiro primitivo de `<Anotacao>` é `swing_point`, não `zone`.
 * Argumento, sob QUALQUER resposta de `Q20`: pivô É uma definição de swing · âncora de
 * Fibonacci É um par de swings · BOS/CHoCH É rompimento de swing · BSL/SSL É extremo de swing.
 * … um corpus de swings sobrevive a qualquer resposta; um corpus de zonas não. Esta SPEC
 * entrega o primitivo e a chave, e ZERO ALGORITMO, ZERO LIMIAR, ZERO 'NÍVEL'."
 *
 * That sentence is the entire scope boundary for this module, read as a checklist:
 *
 *   - zero algoritmo — no swing DETECTION here. `createSwingPoint` records a point a human (or
 *     a future detector, out of scope) already identified; it never compares neighboring bars,
 *     never runs a lookback window, never decides "is this actually a swing".
 *   - zero limiar — no minimum move size, no `ThresholdSpec` (`SPEC-001` §3.7), no percentile.
 *   - zero "nível" — no Fibonacci ratio, no zone (OB/FVG), no `structure_definition`. `Q20`
 *     ("SMC × pivôs+Fibonacci") is explicitly OUT OF SCOPE for this task — whichever
 *     vocabulary it resolves to, both are built FROM this primitive, per the SPEC argument
 *     above, and neither is built HERE.
 *
 * COMPOSED, not reimplemented — same discipline `s2-annotation-price-binding.ts` (`T-05.5`)
 * already follows on top of `s2-annotation-identity.ts` (`T-05.2`/`D5.10`): `createSwingPoint`
 * calls `createPriceBoundAnnotation` verbatim rather than duplicating `principalId` or
 * `price_use` validation. This module adds exactly the three fields a swing pivot needs on top
 * of that: WHICH extreme (`kind`: high/low — `SwingKind` mirrors SMC's BSL/SSL vocabulary
 * without committing to it), WHERE in time (`eventTimeMs`, the same `event_time` concept
 * `s2-badge.ts`'s `CellEnvelope` already uses for a market cell — a swing pivot sits on a bar,
 * not a raw click coordinate), and WHAT PRICE (`price`, read verbatim from what the human
 * marked — never computed, never snapped).
 *
 * `primitive: "swing_point"` is a literal discriminant, not decoration: `SPEC-001:282` names
 * `swing_point` as `<Anotacao>`'s FIRST primitive, implying more may follow (`zone`, once `Q20`
 * and the zone vocabulary are decided) — a future `AnnotationPrimitive = SwingPoint | Zone`
 * union needs a tag to discriminate on, and adding it now costs nothing while making the
 * "first of possibly several" reading of the SPEC sentence executable instead of implicit.
 *
 * OUT OF SCOPE, stated because a draft ADR (`ADR-017`, `Status: RASCUNHO — "aprovar é gate do
 * owner"`, not an `approve` event in the ledger) names additional fields for this exact task —
 * `provenance ∈ {HUMANO, DETECTOR}`, `detector_key`, `review_verdict`, `structure_definition`
 * with `break_by`/`ref_policy`/`impulse`. This task's own dispatch refs are `SPEC-001` §3.6 +
 * plan item `8.7` only, and neither mentions `ADR-017`. Building those fields now would be
 * building on a decision the owner has not yet ratified (the commit that added `ADR-017` calls
 * it "(rascunho)" in its own message) — exactly the "amplie escopo" this protocol forbids.
 * `provenance = HUMANO` for every `<Anotacao>` row is already the SPEC-001 §3.6 baseline (`"provenance
 * = HUMANO, autor, criada_em"`, unconditional, no `DETECTOR` branch) and is already carried by
 * `createPriceBoundAnnotation`'s own `AnnotationIdentity`; this module adds nothing on top of
 * that baseline. If `ADR-017` is later approved, its `provenance`/`detector_key`/`review_verdict`
 * fields are additive to `SwingPoint`, not a rewrite of it — the DoD conflict is named in this
 * task's own QA Gate Context Block, not resolved by guessing here.
 */

import { createPriceBoundAnnotation } from "./s2-annotation-price-binding.ts";
import type { PriceBoundAnnotation } from "./s2-annotation-price-binding.ts";
import type { PriceUse } from "./s2-price-source.ts";

/**
 * The two swing extremes. Deliberately just `high`/`low` — SMC's BSL/SSL and the pivot
 * vocabulary both reduce to "which extreme", per `SPEC-001:282`'s argument; nothing beyond
 * that reduction belongs here (that would be the zone/structure vocabulary `Q20` still owns).
 */
export type SwingKind = "high" | "low";

/** Runtime-checkable enumeration of `SwingKind`, mirroring `s2-pointer-mode.ts`'s own pattern
 * (`POINTER_MODES`) so validation never drifts from the type. */
export const SWING_KINDS: readonly SwingKind[] = ["high", "low"];

export class InvalidSwingKindError extends Error {}

/** Refuses any value outside `SWING_KINDS` rather than defaulting it — same discipline as
 * `s2-pointer-mode.ts`'s `assertPointerMode`. */
export function assertSwingKind(kind: string): SwingKind {
  if (!SWING_KINDS.includes(kind as SwingKind)) {
    throw new InvalidSwingKindError(
      `swing kind "${kind}" is not one of the declared kinds (${SWING_KINDS.join(", ")}) — ` +
        "SPEC-001 §3.6 reduces a swing to which extreme it marks; an unrecognized kind must " +
        "fail loudly, not fall back to a default that hides the caller's mistake",
    );
  }
  return kind as SwingKind;
}

export class NonFiniteSwingEventTimeError extends RangeError {}
export class NonFiniteSwingPriceError extends RangeError {}

/**
 * `<Anotacao>`'s first primitive (`SPEC-001` §3.6, `T-08.10`). A single marked swing pivot:
 * WHICH extreme (`kind`), WHERE in time (`eventTimeMs`, the bar the pivot sits on), WHAT price
 * the human marked (`price`, verbatim). Nothing else — see this module's own docstring for the
 * "zero algoritmo, zero limiar, zero nível" checklist this shape is built to satisfy.
 */
export interface SwingPoint extends PriceBoundAnnotation {
  readonly primitive: "swing_point";
  readonly kind: SwingKind;
  readonly eventTimeMs: number;
  readonly price: number;
}

/**
 * Builds a `swing_point` `<Anotacao>` row. Identity (`principalId`/`createdAtMs`) and the
 * price-series binding (`priceSource`/`priceUse`) are entirely `createPriceBoundAnnotation`'s
 * (`T-05.5`/`D5.10`) — not repeated here. This function adds only the three fields a swing
 * pivot needs on top of that, and refuses each independently rather than trusting a caller
 * that skipped validation upstream:
 *
 *   - `kind` outside `SWING_KINDS` → `InvalidSwingKindError`
 *   - `eventTimeMs` not a finite, non-negative number → `NonFiniteSwingEventTimeError`
 *     (mirrors `canonical-grid.ts`'s own refusal of a non-positive `timeframeMs` — a swing
 *     with no real bar underneath it is not a fabricated ZERO, it is a refusal)
 *   - `price` not a finite, strictly positive number → `NonFiniteSwingPriceError` (a crypto
 *     price is never zero or negative; a swing pivot with no real price is the same class of
 *     bug `MissingPrincipalIdError` refuses for identity — never silently defaulted)
 */
export function createSwingPoint(
  principalId: string,
  createdAtMs: number,
  priceUse: PriceUse | null,
  kind: string,
  eventTimeMs: number,
  price: number,
): SwingPoint {
  const priceBound = createPriceBoundAnnotation(principalId, createdAtMs, priceUse);
  const checkedKind = assertSwingKind(kind);
  if (!Number.isFinite(eventTimeMs) || eventTimeMs < 0) {
    throw new NonFiniteSwingEventTimeError(
      `eventTimeMs (${eventTimeMs}) must be a finite, non-negative number — a swing_point ` +
        "marks a real bar (SPEC-001 §3.6); it is never fabricated onto a timestamp that does " +
        "not resolve to one",
    );
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new NonFiniteSwingPriceError(
      `price (${price}) must be a finite, strictly positive number — a swing_point records ` +
        "the price a human marked verbatim (SPEC-001 §3.6); it is never zero, negative, or " +
        "computed",
    );
  }
  return {
    ...priceBound,
    primitive: "swing_point",
    kind: checkedKind,
    eventTimeMs,
    price,
  };
}
