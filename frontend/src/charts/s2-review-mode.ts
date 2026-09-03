/**
 * `T-08.9` (plan `08_superficie_e_reprodutibilidade.md` item `8.6`, `SPEC-001` §6): "marcação
 * de fixture com **teclado obrigatório**" — the other half of this task's title (the first is
 * `s2-asof-frame.ts`).
 *
 * ── SCOPE, LITERAL FROM THE DISPATCH ──────────────────────────────────────────────────────
 *
 * `ADR-017` is `RASCUNHO` (no `approve` event in the ledger) — this module consumes ONLY what
 * this task's own refs cite literally: `Q11` (RESPONDIDA, "pode aceitar o default"), `Q20`
 * (RESPONDIDA, "coexistem"), `D2`, and `D3`. Verbatim, `D2`: "O detector propõe; o humano
 * julga quando quiser. `swing_point` ganha `provenance ∈ {HUMANO, DETECTOR}` … `pointer_mode
 * = annotate` ganha o sub-modo `review`. O humano só marca do zero via `add` — e `add` é o
 * PISO do que o gerador perdeu." `Q20`: "a tela de review nasce com swing E zona (OB) como
 * candidatos." Nothing else from `ADR-017` is built here — no `detector_key`, no
 * `structure_definition`, no `break_by`, no zone SHAPE (undecided by any ratified document).
 *
 * `provenance`/`detector_key` themselves are `swing_point`'s own fields (`T-08.10`'s DoD
 * conflict, not this task's) — this module does not touch `s2-swing-point.ts`'s shape; it
 * only JUDGES a candidate (of either kind) against a keyboard input and returns the verdict.
 *
 * ── WHY KEYBOARD IS MANDATORY, LITERAL ────────────────────────────────────────────────────
 *
 * `tasks_review.md`, `T-08.9`'s own row: "Teclado é obrigatório porque é trabalho de sessão
 * longa e repetitiva." Marking hundreds of candidates by mouse click fatigues in a way a held
 * key does not — this is enforced STRUCTURALLY, not left as a convention a future edit could
 * quietly relax: `ReviewInput`'s only variant carries `source: "keyboard"` (there is no
 * `"mouse"`/`"click"` branch to construct), and `assertKeyboardSourced` refuses anything else
 * at the boundary — mirroring `s2-pointer-mode.ts`'s own discipline
 * (`assertPointerMode`/`assertPointerInputKind`) for the identical reason: a value crossing
 * this boundary is exactly where a caller that smuggled a mouse event past the type system
 * would otherwise reach here silently.
 *
 * ── KEYS, AND WHY THESE FOUR ──────────────────────────────────────────────────────────────
 *
 * `scripts/pilot-swing-marker/build.mjs` — `Q20`'s own named "piloto de referência" — binds
 * `a`/`r` to accept/reject and `h`/`l` to adding a swing high/low from scratch, ALL keyboard
 * (its own comment: "Keyboard is mandatory (T-08.9). Mouse only hovers / locks the crosshair").
 * This module reuses exactly those four, verbatim, so the owner's muscle memory from the
 * piloto transfers directly. The pilot ALSO binds `x`/`u`/`f`/`g`/`v`/`s`/navigation/etc. —
 * those are session UI STATE (clear/undo/filter/navigate/layer-toggle), not a `review_verdict`,
 * and belong to whatever mounts this module (`web`, later, per `ADR-003` FR-1: `charts` does
 * no I/O, no DOM, no session history). `D2`'s own verdict enum is exactly `{accept, reject,
 * add}` — this module closes on that set, nothing wider.
 *
 * `add` is swing-only here: `h`/`l` name WHICH extreme, mirroring `s2-swing-point.ts`'s own
 * `SwingKind`. There is no `add` for a `zone` candidate — `zone`'s shape (OB) is undecided by
 * any ratified document, and `T-08.10` already refused to build it for the same reason
 * ("zone (OB/FVG/Fib) depende de Q20 e NAO entra aqui"). `accept`/`reject`, by contrast, do
 * NOT need to know a candidate's internal shape — `Q20`'s "coexistem" answer is honored by
 * letting a `zone` candidate be judged through the exact same two keys as a `swing` one.
 *
 * PURE — `ADR-003` FR-1: no I/O, no DOM, no timers. This module JUDGES a candidate handed to
 * it; it never proposes one (that is the detector's job, out of scope here and undecided by
 * any ratified document either).
 */

import { assertSwingKind } from "./s2-swing-point.ts";
import type { SwingKind } from "./s2-swing-point.ts";

/** `Q20`: "a tela de review nasce com swing E zona (OB) como candidatos." */
export type ReviewCandidateKind = "swing" | "zone";

export const REVIEW_CANDIDATE_KINDS: readonly ReviewCandidateKind[] = ["swing", "zone"];

export class InvalidReviewCandidateKindError extends Error {}

/** Refuses any value outside `REVIEW_CANDIDATE_KINDS` — same discipline as
 * `s2-swing-point.ts`'s `assertSwingKind` / `s2-pointer-mode.ts`'s `assertPointerMode`. */
export function assertReviewCandidateKind(kind: string): ReviewCandidateKind {
  if (!REVIEW_CANDIDATE_KINDS.includes(kind as ReviewCandidateKind)) {
    throw new InvalidReviewCandidateKindError(
      `review candidate kind "${kind}" is not one of the declared kinds ` +
        `(${REVIEW_CANDIDATE_KINDS.join(", ")}) — Q20 ("coexistem") closes the set at swing/zone; ` +
        "an unrecognized kind must fail loudly, not fall back to a default",
    );
  }
  return kind as ReviewCandidateKind;
}

/** An opaque reference to a candidate under review — this module never inspects the
 * candidate's own payload (a `swing_point` row, or a future zone shape), only its identity
 * and kind, because judging a verdict never requires reading what is being judged. */
export interface ReviewCandidate {
  readonly candidateId: string;
  readonly kind: ReviewCandidateKind;
}

/** `D2`, verbatim: `review_verdict ∈ {accept, reject, add}`. */
export type ReviewVerdict = "accept" | "reject" | "add";

export const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["accept", "reject", "add"];

/**
 * The ONLY input shape this module accepts. There is deliberately no `"mouse"`/`"click"`
 * variant — see this module's docstring, "WHY KEYBOARD IS MANDATORY". `key` is the raw
 * keyboard key string (e.g. `KeyboardEvent.key`), validated by `resolveReviewKey` below.
 */
export interface ReviewInput {
  readonly source: "keyboard";
  readonly key: string;
}

export class MouseSourcedReviewInputError extends Error {}

/**
 * Refuses any `input.source !== "keyboard"` — checked as a plain string, not narrowed by the
 * `ReviewInput` type, so a caller that smuggled a mouse-sourced value past TypeScript (exactly
 * the boundary a browser event handler crosses) is still caught here, not trusted.
 */
export function assertKeyboardSourced(input: { readonly source: string }): void {
  if (input.source !== "keyboard") {
    throw new MouseSourcedReviewInputError(
      `review input source "${input.source}" is not "keyboard" — marking is teclado obrigatório ` +
        '(tasks_review.md, T-08.9: "trabalho de sessão longa e repetitiva"); a review_verdict can ' +
        "never be assigned from a pointer event",
    );
  }
}

/** The four keys this module binds — see this module's docstring, "KEYS, AND WHY THESE FOUR". */
export type ReviewKey = "a" | "r" | "h" | "l";

export const REVIEW_KEYS: readonly ReviewKey[] = ["a", "r", "h", "l"];

export class UnboundReviewKeyError extends Error {}
export class NoCurrentCandidateError extends Error {}

/** The result of judging one keyboard input — always carries `verdict`, one of
 * `REVIEW_VERDICTS`, so a caller can switch on it exhaustively without a separate `kind` tag. */
export type ReviewAction =
  | { readonly verdict: "accept"; readonly candidateId: string }
  | { readonly verdict: "reject"; readonly candidateId: string }
  | { readonly verdict: "add"; readonly swingKind: SwingKind };

/**
 * `D2`, executable: `a`/`r` judge `currentCandidate` (either kind — `Q20`'s "coexistem");
 * `h`/`l` add a swing from scratch, the piloto's own keys, and need no current candidate
 * (`add` marks something the detector never proposed — `D2`: "o piso do que o gerador
 * perdeu"). Refuses `input.source !== "keyboard"` BEFORE reading `key` — teclado obrigatório
 * is checked at the boundary, never assumed by the caller.
 */
export function resolveReviewKey(
  input: ReviewInput,
  currentCandidate: ReviewCandidate | null,
): ReviewAction {
  assertKeyboardSourced(input);
  switch (input.key) {
    case "a": {
      if (currentCandidate === null) {
        throw new NoCurrentCandidateError(
          'key "a" (accept) was pressed with no current candidate under review — there is nothing ' +
            "to accept",
        );
      }
      return { verdict: "accept", candidateId: currentCandidate.candidateId };
    }
    case "r": {
      if (currentCandidate === null) {
        throw new NoCurrentCandidateError(
          'key "r" (reject) was pressed with no current candidate under review — there is nothing ' +
            "to reject",
        );
      }
      return { verdict: "reject", candidateId: currentCandidate.candidateId };
    }
    case "h":
      return { verdict: "add", swingKind: assertSwingKind("high") };
    case "l":
      return { verdict: "add", swingKind: assertSwingKind("low") };
    default:
      throw new UnboundReviewKeyError(
        `key "${input.key}" is not bound to a review action (${REVIEW_KEYS.join(", ")}) — an ` +
          "unrecognized key must fail loudly, not silently do nothing (SPEC-001 §6, T-08.9); keys " +
          "the piloto binds for session UI state (clear/undo/filter/navigate/...) are out of this " +
          "module's scope on purpose, see its docstring",
      );
  }
}
