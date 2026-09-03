/**
 * `T-05.6` (plan `05_fatia_visivel.md` item 5.8, `SPEC-001` §3.6): `pointer_mode ∈ { read,
 * annotate }` declared, with an overlay layer reserved above the plot and below the
 * crosshair, and the click/Space semantics pinned to `read` only.
 *
 * ── WHAT THIS TASK IS, LITERAL FROM THE DISPATCH ──────────────────────────────────────────
 *
 * "torna Q11 decisao de horas, nao de arquitetura": `Q11` ("owner marca o corpus") is OPEN —
 * whether the marking MODE ships in F4 is undecided. `SPEC-001:647` is explicit that
 * `<Anotacao>` + `pointer_mode` are required TODAY regardless of that answer ("custo de
 * campos num JSON"), and the point of building the declaration now is that whichever way
 * `Q11` resolves later, the cost is filling in `annotate`'s behavior — not inventing the mode
 * enum, the layer stack, or the click/Space dispatch from scratch. That is what "decisao de
 * horas, nao de arquitetura" means operationally: the shape below is the architecture, and it
 * does not change size when `Q11` answers.
 *
 * ── SCOPE, STATED because `<Anotacao>`'s full key is much bigger than this ───────────────
 *
 * `s2-annotation-identity.ts` (`T-05.2`, `D5.10`) already named this task by number as the
 * owner of `pointer_mode` and left it out of its own scope. Symmetrically: `swing_point`
 * (`SPEC-001` §3.6, "o primeiro primitivo de `<Anotacao>`") is `T-08.7`'s job, not this one.
 * This module declares WHAT happens when a pointer event arrives in each mode — it does NOT
 * implement marking, does not draw anything, and does not touch the DOM (`ADR-003` FR-1:
 * "`charts` não faz I/O" — zero `fetch`, zero event listener, zero `node:fs`; every input
 * below is a plain argument).
 *
 * ── THE OVERLAY STACK, DECLARED AS DATA SO ITS ORDER IS A TESTABLE FACT ──────────────────
 *
 * `SPEC-001:284`: "camada de overlay reservada acima do plot e abaixo do crosshair". Rather
 * than leaving that sentence as prose a future renderer might get backwards, `LAYER_ORDER`
 * fixes it as an ordered, exhaustive array (bottom → top) and `assertOverlayIsSandwiched`
 * checks the invariant by POSITION, not by name — a future 4th layer or a reordering trips
 * the assertion instead of silently drawing marks under the candles.
 *
 * ── CLICK/SPACE, PINNED TO THE ONE SENTENCE THAT MATTERS ─────────────────────────────────
 *
 * `SPEC-001:284`: "`clique`/`Espaço` só significam \"travar crosshair\" em `read`." —
 * `resolvePointerAction` is that sentence made executable: in `read` it returns
 * `lock_crosshair`, in `annotate` it NEVER does (it returns `annotate_reserved`, the explicit
 * placeholder `T-08.7` fills in). The two branches are asserted apart in
 * `s2-pointer-mode.test.ts` precisely so a future edit that collapses them back to one
 * behavior fails a test instead of silently reintroducing the bug this sentence exists to
 * prevent.
 */

/** The two declared pointer modes — `SPEC-001:284`. Closed, not open for a 3rd value yet. */
export type PointerMode = "read" | "annotate";

/** Runtime-checkable enumeration of `PointerMode`, so validation never drifts from the type. */
export const POINTER_MODES: readonly PointerMode[] = ["read", "annotate"];

export class InvalidPointerModeError extends Error {}

/** Refuses any value outside `POINTER_MODES` rather than defaulting it to `read`. */
export function assertPointerMode(mode: string): PointerMode {
  if (!POINTER_MODES.includes(mode as PointerMode)) {
    throw new InvalidPointerModeError(
      `pointer_mode "${mode}" is not one of the declared modes (${POINTER_MODES.join(", ")}) — ` +
        "SPEC-001 §3.6 closes the set at read/annotate; an unrecognized mode must fail loudly, " +
        "not fall back to a default that hides the caller's mistake",
    );
  }
  return mode as PointerMode;
}

/**
 * The three layers a chart pane stacks, bottom to top. `SPEC-001:284` names only the
 * relative position of `overlay` ("acima do plot e abaixo do crosshair") — `plot` and
 * `crosshair` are the two landmarks that sentence is relative to, not new decisions made
 * here.
 */
export type ChartLayer = "plot" | "overlay" | "crosshair";

/** Bottom → top. Index in this array IS the stacking order — see `assertOverlayIsSandwiched`. */
export const LAYER_ORDER: readonly ChartLayer[] = ["plot", "overlay", "crosshair"];

/**
 * Checks the `SPEC-001:284` invariant by POSITION in `order`, not by trusting the literal
 * array above — so a caller that reorders `LAYER_ORDER` (or hands in some other candidate
 * order, e.g. from a future config) gets the same refusal a bad reorder deserves. Throws
 * `RangeError` naming which side broke; returns nothing on success (the invariant, not a
 * value, is the product).
 */
export function assertOverlayIsSandwiched(order: readonly ChartLayer[]): void {
  const plotIndex = order.indexOf("plot");
  const overlayIndex = order.indexOf("overlay");
  const crosshairIndex = order.indexOf("crosshair");
  if (plotIndex === -1 || overlayIndex === -1 || crosshairIndex === -1) {
    throw new RangeError(
      `layer order ${JSON.stringify(order)} is missing one of plot/overlay/crosshair — ` +
        "SPEC-001 §3.6 requires all three to be present to state the sandwich at all",
    );
  }
  if (!(plotIndex < overlayIndex && overlayIndex < crosshairIndex)) {
    throw new RangeError(
      `layer order ${JSON.stringify(order)} violates SPEC-001 §3.6: overlay (index ` +
        `${overlayIndex}) must sit strictly above plot (index ${plotIndex}) and strictly ` +
        `below crosshair (index ${crosshairIndex})`,
    );
  }
}

/** The two pointer inputs `SPEC-001:284` names by their literal keys. */
export type PointerInputKind = "click" | "space";

/** Runtime-checkable enumeration of `PointerInputKind`, mirroring `POINTER_MODES` above. */
export const POINTER_INPUT_KINDS: readonly PointerInputKind[] = ["click", "space"];

export class InvalidPointerInputError extends Error {}

/** Refuses any value outside `POINTER_INPUT_KINDS` — same discipline as `assertPointerMode`. */
export function assertPointerInputKind(input: string): PointerInputKind {
  if (!POINTER_INPUT_KINDS.includes(input as PointerInputKind)) {
    throw new InvalidPointerInputError(
      `pointer input "${input}" is not one of the declared kinds (${POINTER_INPUT_KINDS.join(", ")}) — ` +
        "SPEC-001 §3.6 names click/Space literally; an unrecognized input must fail loudly",
    );
  }
  return input as PointerInputKind;
}

/**
 * What a pointer input MEANS, discriminated by `kind` so a caller cannot mistake one branch
 * for the other. `lock_crosshair` is the only behavior `SPEC-001:284` actually specifies;
 * `annotate_reserved` is the explicit placeholder for whatever `T-08.7`'s `swing_point`
 * primitive (or `Q11`'s answer) decides `annotate` mode does — it is a distinct, named
 * outcome precisely so it can never be silently equal to `lock_crosshair`.
 */
export type PointerAction =
  | { readonly kind: "lock_crosshair" }
  | { readonly kind: "annotate_reserved"; readonly mode: "annotate" };

/**
 * `SPEC-001:284`, executable: click/Space lock the crosshair ONLY in `read`. Both `mode` and
 * `input` are validated at this boundary (`assertPointerMode`/`assertPointerInputKind`)
 * rather than trusted as already-narrowed — this is the function a browser event handler
 * calls across, and a value crossing that boundary is exactly where an invalid mode or input
 * kind would otherwise silently reach here as a plain string. `input` does not currently
 * branch the OUTCOME (both click and Space mean the same thing in each mode, per the
 * sentence this function encodes) — it is still validated because a caller passing something
 * other than the two declared keys is a bug at the call site, not a value this function
 * should render harmless by ignoring it.
 */
export function resolvePointerAction(mode: PointerMode, input: PointerInputKind): PointerAction {
  const checkedMode = assertPointerMode(mode);
  assertPointerInputKind(input);
  if (checkedMode === "read") {
    return { kind: "lock_crosshair" };
  }
  return { kind: "annotate_reserved", mode: "annotate" };
}
