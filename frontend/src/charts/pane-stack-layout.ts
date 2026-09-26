/**
 * `pane-stack-layout.ts` — the vertical geometry of the ONE chart's stacked panes (`paineis-de-fluxo`
 * `T-01.6`, plan `01` item `1.5`, `[Q-DG-1]`, `ADR-044/D1`, `ADR-003/FR-2`).
 *
 * Two questions live here, both geometry, both pure:
 *
 *   1. HOW TALL IS THE CHART, AND HOW TALL IS EACH PANE. The `design_gate` fixed relative weights
 *      (`setStretchFactor`) and a FLOOR of `72px` per pane (`handoff/DESIGN-LAYOUT.md` §6, row
 *      "altura"; `gates/DESIGN-LAYOUT-ux-critique-r2.md` §3). `setStretchFactor` alone guarantees no
 *      floor: at a small enough chart height every pane shrinks proportionally, the floor included.
 *      So the chart height is chosen HERE, as the larger of the target and the smallest height at
 *      which the lightest pane still gets its floor. The weights go to the library unchanged.
 *
 *   2. WHERE A PANE'S PRICE SCALES MAY DRAW. The per-pane DOM layer (title, legend, badges) sits ON
 *      TOP of the canvas, with `pointer-events: none` (`DESIGN-LAYOUT.md` §6, row "a camada não cobre
 *      a série"). What keeps the tallest mark out from under the text is the pane's scale margins:
 *      the scales that draw near the top of the pane are compressed into the part of the pane BELOW
 *      the measured legend. And a scale anchored at the very bottom of the pane (the volume bars, the
 *      mark bands) keeps a clearance of `SEPARATOR_CLEARANCE_PX` off the separator, because the
 *      absence mark and the volume doji are `#8b949e` — the separator's own colour — and touching it
 *      they fuse (`C-6` of the gate r2).
 *
 * ⛔ WHY THE LEGEND RESERVE IS MEASURED AND NOT COUNTED. The design text says "linhas × 16px + 4px".
 * A count of lines is a second statement of the DOM's height, free to drift from it the day a line
 * wraps, a badge appears, or a font loads late. The caller passes the legend's MEASURED bottom edge
 * (in CSS px, relative to the pane's top) and this module adds the gap. One number, read once.
 *
 * ⛔ WHY THE MARGINS ARE COMPRESSED, NOT MERELY RAISED. A pane can hold two scales that split it
 * (the CVD pane: delta on the upper half, cumulative on the lower). Raising only the upper scale's
 * `top` to clear the legend would squeeze it against its own `bottom` and leave the lower one
 * untouched — the split point would stay where it was and the upper half could collapse to nothing.
 * Mapping the WHOLE base layout `[0, 1]` onto `[r, 1]` (where `r` is the reserve as a fraction of the
 * pane) keeps every scale's share and order, and only the region under the legend is given up.
 *
 * `charts` imports nothing from `lightweight-charts` (`ADR-003/FR-1`): inputs are numbers, outputs
 * are numbers; `web` hands them to `setStretchFactor`/`applyOptions`.
 */

/** Height, in CSS px, of the library's pane separator row (`SeparatorConstants.SeparatorHeight`,
 * `lightweight-charts@5.2.1` `dist/lightweight-charts.development.mjs:8606`). */
export const PANE_SEPARATOR_PX = 1;

/** `C-6` of `gates/DESIGN-LAYOUT-ux-critique-r2.md`: a bottom-anchored scale keeps at least this
 * many CSS px off the separator below it ("margem inferior ≥ 4px"). */
export const SEPARATOR_CLEARANCE_PX = 4;

/** Free space, in CSS px, between the legend's bottom edge and the first pixel a reserved scale may
 * draw (`DESIGN-LAYOUT.md` §6: "linhas × 16px + **4px**"). */
export const LEGEND_GAP_PX = 4;

/** Share of a pane above which the legend reserve is refused: a legend that would leave less than a
 * quarter of its pane to the data is a legend that has to be shortened, not a pane that has to give
 * way. The result is then `overflow`, and the caller has to see it. */
export const MAX_LEGEND_RESERVE_FRACTION = 0.75;

export interface PaneStackForm {
  /** Relative weights, top to bottom — the `design_gate`'s values, handed to `setStretchFactor`. */
  readonly weights: readonly number[];
  /** Minimum height, in CSS px, of every pane. */
  readonly floorPx: number;
  /** The chart height the layout aims at when the floor does not force more. */
  readonly targetChartHeightPx: number;
  /** CSS px of the chart height that no pane gets (the time-axis row). */
  readonly timeAxisPx: number;
}

/**
 * The pixel form of the phase `01` stack, minus the weights (those are `web`'s registry,
 * `pane-registry.ts::F1_PANE_STRETCH`, relative numbers and no pixel).
 *
 * - `floorPx: 72` — `handoff/DESIGN-LAYOUT.md` §6, row "altura": "piso de **72px** por pane".
 * - `targetChartHeightPx: 910` — the height the gate r2 ran its own sanity arithmetic on
 *   (`gates/DESIGN-LAYOUT-ux-critique-r2.md` §3, `[INFERRED: altura de gráfico H ≈ 910px suposta]`),
 *   which leaves the 1.024px viewport room for the timeframe bar and the mode stamp (§9 item 16(l):
 *   no scrolling inside the stack). ⚠️ Not a measured optimum — the gate's own assumption, adopted so
 *   the screenshot of `T-01.11` is judged at the height the gate reasoned about.
 * - `timeAxisPx: 28` — an ALLOWANCE for the time-axis row of `lightweight-charts@5.2.1`, not a
 *   measurement of it (`[NÃO MEDIDO]` here). It only feeds the floor arithmetic, and at the 910px
 *   target the floor has ~190px of slack, so the allowance does not decide anything today; what
 *   proves the floor is `e2e/23-pane-layer.spec.ts`, which reads every pane's height off the render.
 *
 * Lives in `charts` because it is geometry (`ADR-003/FR-2`), and so the 14 geometry constants of
 * `web` (`ADR-044` §Consequências) do not grow.
 */
export const F1_PANE_STACK_FORM: Omit<PaneStackForm, "weights"> = {
  floorPx: 72,
  targetChartHeightPx: 910,
  timeAxisPx: 28,
};

export interface PaneStackLayout {
  /** The height to create the chart with — `>= targetChartHeightPx`. */
  readonly chartHeightPx: number;
  /** What each pane gets, in CSS px, if the library splits by weight exactly (it rounds). */
  readonly paneHeightsPx: readonly number[];
  /** What to hand to `IPaneApi.setStretchFactor`, index = `paneIndex`. The weights, unchanged. */
  readonly stretchFactors: readonly number[];
  /** `true` when the target was too short for the floor and the chart was made taller. */
  readonly grewForFloor: boolean;
}

function assertValidForm(form: PaneStackForm): void {
  if (form.weights.length === 0) {
    throw new RangeError("a pane stack needs at least one pane");
  }
  for (const [index, weight] of form.weights.entries()) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`pane ${index} has weight ${weight}; every weight must be a positive number`);
    }
  }
  if (!Number.isFinite(form.floorPx) || form.floorPx < 0) {
    throw new RangeError(`floor of ${form.floorPx}px is not a height`);
  }
  if (!Number.isFinite(form.targetChartHeightPx) || form.targetChartHeightPx <= 0) {
    throw new RangeError(`target chart height of ${form.targetChartHeightPx}px is not a height`);
  }
  if (!Number.isFinite(form.timeAxisPx) || form.timeAxisPx < 0) {
    throw new RangeError(`time axis of ${form.timeAxisPx}px is not a height`);
  }
}

/**
 * The chart height and the per-pane split. Pure.
 *
 * The lightest pane is the one the floor binds on: `h_i = P · w_i / Σw`, so every `h_i >= floor`
 * iff `P >= floor · Σw / min(w)`, where `P` is the height left to panes (chart − time axis −
 * separators). The chart is made exactly that tall when the target is shorter, and never shorter
 * than the target.
 */
export function stackedPaneLayout(form: PaneStackForm): PaneStackLayout {
  assertValidForm(form);
  const total = form.weights.reduce((sum, weight) => sum + weight, 0);
  const lightest = Math.min(...form.weights);
  const separatorsPx = (form.weights.length - 1) * PANE_SEPARATOR_PX;
  const fixedPx = form.timeAxisPx + separatorsPx;
  const floorPanesPx = (form.floorPx * total) / lightest;
  const floorChartPx = Math.ceil(floorPanesPx + fixedPx);
  const grewForFloor = floorChartPx > form.targetChartHeightPx;
  const chartHeightPx = grewForFloor ? floorChartPx : form.targetChartHeightPx;
  const panesPx = chartHeightPx - fixedPx;
  return {
    chartHeightPx,
    paneHeightsPx: form.weights.map((weight) => (panesPx * weight) / total),
    stretchFactors: [...form.weights],
    grewForFloor,
  };
}

/** A scale's margins, as `lightweight-charts` takes them (`PriceScaleMargins`): fractions of the
 * pane's height left empty above and below the scale. */
export interface ScaleMargins {
  readonly top: number;
  readonly bottom: number;
}

export interface PaneScaleRole {
  /** The scale draws near the top of the pane, so it must stay clear of the legend. */
  readonly belowLegend: boolean;
  /** The scale is anchored at the pane's bottom, so it keeps `SEPARATOR_CLEARANCE_PX` off the
   * separator. */
  readonly clearSeparator: boolean;
  /** With `belowLegend`: only the scale's CEILING descends under the legend, its FLOOR stays at
   * the base `bottom`. For a scale whose floor is a geometric guarantee against a sibling band
   * (the liquidation bars over the marks band, `RN-4`): compressing `bottom` with the legend
   * walked the floor of the bar band into the marks band as soon as the reserve passed `0,2` of
   * the pane (`W1-CODE-REVIEW-r2` C-2). Absent means `false`. */
  readonly keepFloor?: boolean;
}

export interface PaneScaleMeasure {
  /** `IPaneApi.getHeight()`, CSS px. `0` before the first frame. */
  readonly paneHeightPx: number;
  /** The legend's bottom edge, CSS px from the pane's top. `null` while the layer is not mounted. */
  readonly legendBottomPx: number | null;
}

export type PaneScaleMargins =
  | {
      /** The pane or its legend is not laid out yet — nothing to derive; ask again next frame. */
      readonly kind: "unmeasured";
    }
  | {
      readonly kind: "margins";
      readonly margins: ScaleMargins;
      /** CSS px given up under the legend (`0` for a scale that does not reserve). */
      readonly reservedPx: number;
    }
  | {
      /** The legend is taller than `MAX_LEGEND_RESERVE_FRACTION` of its pane. The base margins are
       * kept (the marks may run under the text), and the caller has to surface it. */
      readonly kind: "overflow";
      readonly margins: ScaleMargins;
      readonly reservedPx: number;
    };

function assertValidMargins(base: ScaleMargins): void {
  const { top, bottom } = base;
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top < 0 || bottom < 0 || top + bottom >= 1) {
    throw new RangeError(`scale margins top=${top} bottom=${bottom} leave no room — each >= 0, sum < 1`);
  }
}

/**
 * The margins a scale must be given in a pane of a MEASURED height, under a MEASURED legend.
 *
 * - `belowLegend`: the base layout `[0, 1]` is mapped onto `[r, 1]`, `r = (legendBottom + gap) / h`
 *   — `top' = r + top·(1−r)`, `bottom' = bottom·(1−r)`. Every reserved scale keeps its share.
 *   With `keepFloor`, `bottom' = bottom`: the band shrinks from the top only, and a floor another
 *   band relies on does not move with the legend.
 * - `clearSeparator`: `bottom' >= SEPARATOR_CLEARANCE_PX / h`.
 */
export function paneScaleMargins(base: ScaleMargins, role: PaneScaleRole, measure: PaneScaleMeasure): PaneScaleMargins {
  assertValidMargins(base);
  const height = measure.paneHeightPx;
  if (!Number.isFinite(height) || height <= 0) {
    return { kind: "unmeasured" };
  }
  let top = base.top;
  let bottom = base.bottom;
  let reservedPx = 0;
  let overflow = false;
  if (role.belowLegend) {
    if (measure.legendBottomPx === null || !Number.isFinite(measure.legendBottomPx)) {
      return { kind: "unmeasured" };
    }
    reservedPx = Math.max(0, measure.legendBottomPx) + LEGEND_GAP_PX;
    const reserve = reservedPx / height;
    if (reserve > MAX_LEGEND_RESERVE_FRACTION) {
      overflow = true;
    } else {
      top = reserve + base.top * (1 - reserve);
      bottom = role.keepFloor === true ? base.bottom : base.bottom * (1 - reserve);
    }
  }
  if (role.clearSeparator) {
    bottom = Math.max(bottom, SEPARATOR_CLEARANCE_PX / height);
  }
  if (top + bottom >= 1) {
    // Only reachable through `clearSeparator` on a pane a few px tall: keep the base, say so.
    return { kind: "overflow", margins: { top: base.top, bottom: base.bottom }, reservedPx };
  }
  const margins = { top, bottom };
  return overflow ? { kind: "overflow", margins: { top: base.top, bottom }, reservedPx } : { kind: "margins", margins, reservedPx };
}
