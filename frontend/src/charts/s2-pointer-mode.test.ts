// `T-05.6` (`SPEC-001` §3.6, plan `05_fatia_visivel.md` item 5.8) — the falsifiers for
// `s2-pointer-mode.ts`. Every negative case here plants the WRONG value and asserts the
// module rejects it, per the builder mandate: "se voce afirma que uma protecao funciona,
// mostre o caso que ela rejeita".
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  POINTER_MODES,
  POINTER_INPUT_KINDS,
  LAYER_ORDER,
  InvalidPointerModeError,
  InvalidPointerInputError,
  assertPointerMode,
  assertPointerInputKind,
  assertOverlayIsSandwiched,
  resolvePointerAction,
} from "./s2-pointer-mode.ts";
import type { ChartLayer, PointerInputKind, PointerMode } from "./s2-pointer-mode.ts";

test("pointer_mode is declared as exactly {read, annotate} — SPEC-001 §3.6 closes the set", () => {
  assert.deepEqual(POINTER_MODES, ["read", "annotate"]);
});

test("assertPointerMode accepts both declared modes and returns them unchanged", () => {
  assert.equal(assertPointerMode("read"), "read");
  assert.equal(assertPointerMode("annotate"), "annotate");
});

test("MORDE: assertPointerMode refuses an undeclared mode instead of defaulting it", () => {
  assert.throws(() => assertPointerMode("edit"), InvalidPointerModeError);
  assert.throws(() => assertPointerMode(""), InvalidPointerModeError);
  // Case sensitivity is part of the contract: "Read" is not "read".
  assert.throws(() => assertPointerMode("Read"), InvalidPointerModeError);
});

test("the overlay layer sits strictly between plot and crosshair — SPEC-001:284, by position", () => {
  const plotIndex = LAYER_ORDER.indexOf("plot");
  const overlayIndex = LAYER_ORDER.indexOf("overlay");
  const crosshairIndex = LAYER_ORDER.indexOf("crosshair");
  assert.ok(plotIndex < overlayIndex, "overlay must be above plot");
  assert.ok(overlayIndex < crosshairIndex, "overlay must be below crosshair");
  assert.equal(LAYER_ORDER.length, 3, "no 4th layer declared yet — a change here is a decision, not a drift");
});

test("assertOverlayIsSandwiched CALA: the real LAYER_ORDER passes", () => {
  assert.doesNotThrow(() => assertOverlayIsSandwiched(LAYER_ORDER));
});

test("MORDE: assertOverlayIsSandwiched rejects overlay placed BELOW plot", () => {
  const wrong: readonly ChartLayer[] = ["overlay", "plot", "crosshair"];
  assert.throws(() => assertOverlayIsSandwiched(wrong), RangeError);
});

test("MORDE: assertOverlayIsSandwiched rejects overlay placed ABOVE crosshair", () => {
  const wrong: readonly ChartLayer[] = ["plot", "crosshair", "overlay"];
  assert.throws(() => assertOverlayIsSandwiched(wrong), RangeError);
});

test("MORDE: assertOverlayIsSandwiched rejects a layer set missing a landmark", () => {
  const incomplete = ["plot", "overlay"] as unknown as readonly ChartLayer[];
  assert.throws(() => assertOverlayIsSandwiched(incomplete), RangeError);
});

test("in read mode, click AND Space both lock the crosshair — SPEC-001:284", () => {
  assert.deepEqual(resolvePointerAction("read", "click"), { kind: "lock_crosshair" });
  assert.deepEqual(resolvePointerAction("read", "space"), { kind: "lock_crosshair" });
});

test("MORDE: in annotate mode, click/Space NEVER lock the crosshair", () => {
  const clickResult = resolvePointerAction("annotate", "click");
  const spaceResult = resolvePointerAction("annotate", "space");
  assert.notDeepEqual(clickResult, { kind: "lock_crosshair" });
  assert.notDeepEqual(spaceResult, { kind: "lock_crosshair" });
  assert.deepEqual(clickResult, { kind: "annotate_reserved", mode: "annotate" });
  assert.deepEqual(spaceResult, { kind: "annotate_reserved", mode: "annotate" });
});

test("MORDE: resolvePointerAction refuses a mode value that bypassed the type system", () => {
  const smuggled = "edit" as unknown as PointerMode;
  assert.throws(() => resolvePointerAction(smuggled, "click"), InvalidPointerModeError);
});

test("pointer input kinds are declared as exactly {click, space}", () => {
  assert.deepEqual(POINTER_INPUT_KINDS, ["click", "space"]);
});

test("MORDE: assertPointerInputKind refuses an undeclared input", () => {
  assert.throws(() => assertPointerInputKind("doubleclick"), InvalidPointerInputError);
});

test("MORDE: resolvePointerAction refuses an input kind that bypassed the type system", () => {
  const smuggled = "doubleclick" as unknown as PointerInputKind;
  assert.throws(() => resolvePointerAction("read", smuggled), InvalidPointerInputError);
});
