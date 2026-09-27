/**
 * `paineis-de-fluxo` `T-04.4` (`[Q-DG-2]`, `CA-12`) — the decided FORM of the fused liquidation pane,
 * pinned. `gates/T-04.4-design-gate.md` §5.1 is the literal; §5.2 is the invariant this file fixes in
 * the layout `charts` computes from it, at the pane heights the app really has: `217 px` at every
 * viewport measured, and a legend bottom of `78 px` at 1m and `126 px` at 5m+ — the `96`/`144 px` of
 * gate §1 minus the `18 px` log note line this task removes (gate §4: data area `113 → 131 px`).
 *
 * The pixels of the real app are `e2e/34`'s; this file is the fast half: the constant is the one the
 * gate approved, and the geometry it yields keeps each leg's marks out of its bars.
 *
 * MORDE, in this file: the log proposal this task retired (`6`/`18` px marks in a `0,12` band, gap
 * `0,04`) and three hand-broken forms, each REJECTED by the same checks the decided form passes.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidLiquidationPaneForm,
  LiquidationPaneError,
  liquidationBarBase,
  liquidationPaneLayout,
  type LiquidationPaneForm,
} from "../../charts/index.ts";
import { F1_PANE_STRETCH } from "./pane-registry.ts";
import { LIQUIDATION_PANE_FORM } from "./liquidation-pane-form.ts";

/** Gate §1: the pane's height; gate §1 − 18 px (§4): the two legend bottoms without the log note. */
const PANE_HEIGHT_PX = 217;
const LEGEND_BOTTOMS_PX = [78, 126] as const;

/** The form this task retired — the `charts` proposal of `T-04.1`, log. */
const RETIRED_LOG_PROPOSAL: LiquidationPaneForm = {
  mode: "logarithmic",
  zeroLine: 0.5,
  up: { marks: { top: 0, bottom: 0.12 }, barsTop: 0.16 },
  down: { barsBottom: 0.84, marks: { top: 0.88, bottom: 1 } },
  absenceMarkPx: 6,
  zeroMarkPx: 18,
};

interface Rows {
  readonly top: number;
  readonly bottom: number;
}

/** The facts §5.2 asks for, in CSS px of the pane, for one form at one legend height. */
function geometry(form: LiquidationPaneForm, legendBottomPx: number) {
  const layout = liquidationPaneLayout(form, { paneHeightPx: PANE_HEIGHT_PX, legendBottomPx });
  assert.equal(layout.kind, "layout", `no layout for legend ${legendBottomPx}`);
  if (layout.kind !== "layout") throw new Error("unreachable");
  const rows = (margins: { top: number; bottom: number }): Rows => ({
    top: PANE_HEIGHT_PX * margins.top,
    bottom: PANE_HEIGHT_PX * (1 - margins.bottom),
  });
  const sides = (["up", "down"] as const).map((side) => {
    const band = layout.sides[side].markBand;
    return {
      side,
      bars: rows(layout.sides[side].bars.scaleMargins),
      marks: rows(layout.sides[side].marks.scaleMargins),
      band,
    };
  });
  return { layout, sides };
}

/** §5.2: per leg, the mark band and the bar band share no pixel row, the marks are on the OUTER edge,
 * the zero mark is strictly taller than the absence mark, and the bars get at least `minBarPx`. */
function holdsGateInvariant(form: LiquidationPaneForm, minBarPx: number): boolean {
  try {
    assertValidLiquidationPaneForm(form);
  } catch (error) {
    if (error instanceof LiquidationPaneError) return false;
    throw error;
  }
  return LEGEND_BOTTOMS_PX.every((legendBottomPx) => {
    const { sides } = geometry(form, legendBottomPx);
    return sides.every(({ side, bars, marks, band }) => {
      const disjoint = side === "up" ? Math.ceil(marks.bottom) <= Math.floor(bars.top) : Math.ceil(bars.bottom) <= Math.floor(marks.top);
      const taller = band.kind === "band" && band.zeroMarkValue > band.absenceMarkValue && band.absenceMarkValue >= 1;
      const barPx = bars.bottom - bars.top;
      // The marks may never climb to the size of the bars they frame (gate §2.2, row L: marks 23x the
      // bars' ink once the bars went linear) — the zero mark stays under a quarter of the leg's bars.
      const subordinate = band.kind === "band" && band.zeroMarkValue < barPx / 4;
      return disjoint && taller && barPx >= minBarPx && subordinate;
    });
  });
}

/** Gate §4: at 1m the bars of each leg get `53,7 px`, at 5m+ `34,0 px` `[MEDIDO: data-reserved-scale-top-px]`. */
const MIN_BAR_PX = 33;

test("T-04.4 §5.1: the form is literally the one the design_gate approved", () => {
  assert.deepEqual(LIQUIDATION_PANE_FORM, {
    mode: "normal",
    zeroLine: 0.5,
    up: { marks: { top: 0, bottom: 0.06 }, barsTop: 0.09 },
    down: { barsBottom: 0.91, marks: { top: 0.94, bottom: 1 } },
    absenceMarkPx: 2,
    zeroMarkPx: 6,
  });
  assert.doesNotThrow(() => assertValidLiquidationPaneForm(LIQUIDATION_PANE_FORM));
  // Linear ⇒ the bars start at 0: a value in (0, 1) USD can no longer draw toward the other leg (§4, 5).
  assert.equal(liquidationBarBase(LIQUIDATION_PANE_FORM.mode), 0);
  // §5.4: the halves are fixed (H1) and the pane's weight stays 22 (H3 refused).
  assert.equal(LIQUIDATION_PANE_FORM.zeroLine, 0.5);
  assert.equal(F1_PANE_STRETCH.liquidation, 22);
});

test("T-04.4 §5.2: marks never share a row with their bars, the zero mark is taller, at 1m and 5m+", () => {
  assert.ok(holdsGateInvariant(LIQUIDATION_PANE_FORM, MIN_BAR_PX));
  for (const legendBottomPx of LEGEND_BOTTOMS_PX) {
    const { layout, sides } = geometry(LIQUIDATION_PANE_FORM, legendBottomPx);
    // The zero line is the midpoint of the data area, fixed (H1): it does not follow the data.
    assert.ok(Math.abs(layout.zeroLinePx - (layout.dataTopPx + layout.dataBottomPx) / 2) < 1e-9);
    for (const { side, bars, band } of sides) {
      assert.equal(band.kind, "band", `${side} marks collapsed at legend ${legendBottomPx}`);
      // Both legs get the same bar height: the axis is symmetric around zero (PRD-009:168).
      assert.ok(Math.abs(bars.bottom - bars.top - (sides[0]!.bars.bottom - sides[0]!.bars.top)) < 1e-9);
    }
  }
});

test("MORDE: the retired log proposal and three broken forms are rejected by the same invariant", () => {
  // The log proposal: valid geometry, but its 18 px zero mark is more than a quarter of the bars it
  // frames, and at 5m+ the bars get 22 px (gate §1) — the "wall" §2.2 measured.
  assert.equal(holdsGateInvariant(RETIRED_LOG_PROPOSAL, MIN_BAR_PX), false, "the retired proposal passes — the invariant is vacuous");
  const base = LIQUIDATION_PANE_FORM;
  const broken: readonly [string, LiquidationPaneForm][] = [
    ["upper marks reach into the upper bars", { ...base, up: { marks: { top: 0, bottom: 0.12 }, barsTop: 0.09 } }],
    ["zero mark not taller than the absence mark", { ...base, absenceMarkPx: 6, zeroMarkPx: 6 }],
    ["bars squeezed by a wide gap", { ...base, up: { ...base.up, barsTop: 0.3 }, down: { ...base.down, barsBottom: 0.7 } }],
  ];
  for (const [name, form] of broken) {
    let rejected: boolean;
    try {
      rejected = !holdsGateInvariant(form, MIN_BAR_PX);
    } catch {
      rejected = true;
    }
    assert.ok(rejected, `${name}: not rejected`);
  }
});
