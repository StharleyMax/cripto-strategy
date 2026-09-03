/**
 * `D5.10` ("identidade é dimensão ... `principal_id` preenchido, nunca `NULL`, nunca
 * constante implícita") — the minimal slice of `<Anotacao>` this task closes.
 *
 * SCOPE, stated because `<Anotacao>`'s full key is much bigger than this: `PRD-001:360`
 * fixes `<Anotacao>` to `(instrument_id, venue_symbol_as_of, interval, janela, grid_hash,
 * knowledge_time, price_source, price_use, bar_policy, tick_size, price_precision,
 * multiplier, cvd_anchor, universe_source)` + a URL, plus `provenance = HUMANO, autor,
 * criada_em`. Most of that key is EXPLICITLY later work — `price_source`/`price_use` is
 * `T-05.5`, `pointer_mode` is `T-05.6`, the `swing_point` primitive is `T-08.7` — and this
 * task's handoff lists all three as out of scope. Building the full key here would be
 * exactly the kind of speculative construction `PRD-001` §12 forbids.
 *
 * What `D5.10` actually tests, read literally, is narrower: that `principal_id` is a
 * DIMENSION (varies per act) on any row that records a human act, never a hardcoded
 * constant and never `null`. This module proves exactly that slice — `AnnotationIdentity`
 * carries `principalId` + `createdAtMs`, and `createAnnotationIdentity` REFUSES an empty or
 * missing `principalId` rather than defaulting it, mirroring the refusal pattern
 * `MissingCvdAnchorError` already uses in the backend (`cvd.py`, cited in `s2-cvd.ts`) for
 * the same reason: a required identity field silently defaulted is indistinguishable, later,
 * from one that was genuinely supplied.
 */

export class MissingPrincipalIdError extends Error {}

export interface AnnotationIdentity {
  readonly principalId: string;
  readonly createdAtMs: number;
}

/**
 * Builds the identity half of an `<Anotacao>` row. `principalId` has NO DEFAULT — a caller
 * that omits it fails at the call site with `TypeError` (required parameter), and an empty
 * string arriving from an upstream boundary is the second layer this function refuses.
 */
export function createAnnotationIdentity(principalId: string, createdAtMs: number): AnnotationIdentity {
  if (principalId.trim().length === 0) {
    throw new MissingPrincipalIdError(
      "principalId must be a non-empty identity — D5.10 requires principal_id as a " +
        "dimension on every row that records a human act, never NULL and never an implicit constant",
    );
  }
  return { principalId, createdAtMs };
}
