/**
 * `liquidation-pane-geometry.ts` — the ONE liquidation pane of phase `04` (`paineis-de-fluxo`
 * `T-04.1`, plan `04` items `4.1` (the `charts` half) and `4.2`, `RF-10`, `RN-3`, `RN-4`,
 * `ADR-044/D4`, `SPEC-009` §7).
 *
 * Until phase `04` the two liquidation legs are two panes (`liquidation_long`, `liquidation_short`),
 * each with one bar series and its own absence/zero marks. `ADR-044/D4` fuses them: ONE pane, the
 * `short` leg above a zero line and the `long` leg below it — and the long leg goes DOWN BY AN
 * INVERTED SCALE, NEVER BY A SIGN. Both legs enter the chart as magnitudes `>= 0`.
 *
 * WHAT THIS MODULE OWNS (`ADR-003/FR-2`: series → geometry is `charts`):
 *
 *   - the FOUR price scales of the pane, named here (`LIQUIDATION_SCALE_IDS`) so that `web`'s
 *     registry can point at them by `scale_ref` and never by a margin or a pixel. Scales are named
 *     by SIDE (`up`/`down`), not by cohort: which cohort goes up is the registry's `scale_ref`, so
 *     reverting the owner's `[Q-LIQ-2]` choice is "swap the `scale_ref` of the two legs", with no
 *     change here (`SPEC-009` §7.1, last paragraph);
 *   - the scale MARGINS of the four, from the pane's measured height and the legend's measured
 *     bottom (`liquidationPaneLayout`), and the values of each leg's two marks;
 *   - the SIX feeds of the pane (`liquidationPaneFeeds`): per leg, the bars, the absence mark and
 *     the zero mark — each leg's pair on ITS side of the zero (`RN-4`, `ARQ-1` §3.3);
 *   - the SHARED autoscale of the two bar scales (`sharedMagnitudeAutoscale`): the same value is
 *     the same height in both legs (`C-3` of `gates/DESIGN-LAYOUT-ux-critique-r2.md`).
 *
 * WHAT IT DOES NOT OWN (`ADR-003/FR-1`): colour, the bar shape (hollow/filled), the legend, the log
 * × linear choice (`[Q-DG-2]`, `T-04.4`) and the size of the two halves — those are FORM, `web`'s,
 * with the `design_gate`'s verdict. They enter as `LiquidationPaneForm`, and
 * `LIQUIDATION_PANE_FORM_PROPOSAL` below is a PROPOSAL submitted to that gate, not a decision.
 *
 * ── THE FOUR GUARANTEES, AND WHERE EACH ONE LIVES ─────────────────────────────────────────────
 *
 * (1) NO NEGATIVE NUMBER ON THE DATA PATH (`RN-3`, `ADR-044/D4` reason 1, `F-6 (b)`). The bars are
 *     built by `positiveValueSeriesLossless`, which THROWS on a negative value; the marks are fixed
 *     positive heights. `liquidationPaneFeeds` then re-counts every fed value and throws if one is
 *     `< 0`. A signed `short − long` is not expressible because no signed number exists here.
 *
 * (2) THE TWO BASES MEET AT ONE ZERO LINE (`F-6 (a)`). The form does not declare two bar bands; it
 *     declares ONE `zeroLine` and the outer edge of each leg's bars. The up bars end at the zero line
 *     and the down bars start there, BY CONSTRUCTION. Both are mapped through the SAME affine map
 *     (data area under the legend, above the separator clearance), so a legend of any height moves
 *     the zero line for both legs at once — the equivalent of `keepFloor` that `T-04.0` §5 asked
 *     for, without the asymmetry of compressing one leg only. What remains is the library's own
 *     one-pixel offset between a normal scale's floor (`h − 1 − bottom·h`) and an inverted scale's
 *     top (`top·h`): two adjacent pixel rows, one per leg, measured `libDiff = 1` in 468/468 renders
 *     by the spike (`gates/T-04.0-spike-f6.md` §2.1). ⛔ It is NOT compensated: compensating makes
 *     the legs share one row and the series drawn last erases the other's base (§3.2 there).
 *
 * (3) EACH LEG'S MARKS ARE DISJOINT FROM ITS BARS, ON ITS OWN SIDE (`RN-4`, `T-04.0` §3.1). With the
 *     bars glued to the zero line, "disjoint and on the same side" leaves ONE legal place for the
 *     marks: the OUTER edge of the leg. The form is validated as one strict chain,
 *
 *         up.marks.top < up.marks.bottom < up.barsTop < zeroLine < down.barsBottom
 *                      < down.marks.top < down.marks.bottom
 *
 *     so a form that puts a mark band inside the bars (the collision the spike measured at 26 px in
 *     a dense 1m window) or on the other leg's side is refused at construction, not at review.
 *
 * (4) THE SAME MAXIMUM ON BOTH LEGS (`C-3`). Two independent autoscales would draw a `40.000` long
 *     liquidation and a `40.000` short liquidation at different heights whenever the two legs'
 *     visible maxima differ — the spike measured up to `428 px` of error that way, against `≤ 0,50
 *     px` with a shared range (`T-04.0` §4.3). `sharedMagnitudeAutoscale` computes the maximum over
 *     the VISIBLE LOGICAL RANGE of BOTH legs (logical index `i` is grid slot `i`, `ADR-044/D2`), and
 *     both bar series hang the same provider.
 *
 * ⚠️ LOG MODE AND A VALUE BELOW THE BASE. On a logarithmic scale the bars start at
 * `LIQUIDATION_LOG_BASE = 1` (an absolute anchor in USD, the same argument `SymbolClient.tsx` gives
 * today). A value in `(0, 1)` would draw from the zero line TOWARD THE OTHER LEG. Not guarded here,
 * and the reason is a number: the smallest positive value over BTCUSDT and ETHUSDT, both legs, 4 days
 * of 1m (`4 × 5.760` slots) is `2,67` USD `[MEDIDO 2026-09-26, GET /api/v1/series-history, T-04.1
 * builder report]`. If `[Q-DG-2]` keeps log, `T-04.6` is where a sub-base value would show.
 *
 * `charts` imports nothing from `lightweight-charts` here: numbers in, numbers out. `web` maps
 * `mode` onto `PriceScaleMode` and hands the rest to `applyOptions`/`addSeries`.
 */

import {
  LEGEND_GAP_PX,
  MAX_LEGEND_RESERVE_FRACTION,
  SEPARATOR_CLEARANCE_PX,
  type PaneScaleMeasure,
  type ScaleMargins,
} from "./pane-stack-layout.ts";
import { markBandGeometry, type MarkBandGeometry } from "./mark-band-geometry.ts";
import {
  absenceMarkSeries,
  positiveValueSeriesLossless,
  zeroMarkSeries,
  type LineItem,
  type WhitespaceItem,
} from "./s2-lightweight-adapter.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

// ── Names ─────────────────────────────────────────────────────────────────────────────────────

/** The two sides of the zero line. `up` draws on a normal scale, `down` on an inverted one. */
export type LiquidationSide = "up" | "down";

export const LIQUIDATION_SIDES: readonly LiquidationSide[] = ["up", "down"];

/** The four price scales of the fused pane — the only names a registry `scale_ref` may carry for
 * it. Named by SIDE on purpose: the cohort → side choice is the registry's (see the module note). */
export const LIQUIDATION_SCALE_IDS = {
  up: { bars: "liquidation_up", marks: "liquidation_up_marks" },
  down: { bars: "liquidation_down", marks: "liquidation_down_marks" },
} as const satisfies Record<LiquidationSide, { readonly bars: string; readonly marks: string }>;

/** Whether a side's scales are inverted — `ADR-044/D4`: the lower leg descends by `invertScale`. */
export const LIQUIDATION_INVERTED_SIDE: Readonly<Record<LiquidationSide, boolean>> = { up: false, down: true };

/** `log10` anchor of the bars on a logarithmic scale: `1` in the series' unit (USD), the same
 * absolute anchor `SymbolClient.tsx` uses for the two-pane liquidation of phase `01`. */
export const LIQUIDATION_LOG_BASE = 1;

export type LiquidationScaleMode = "normal" | "logarithmic";

/** Where the bars start, in value: `0` on a linear scale, `LIQUIDATION_LOG_BASE` on a log one. The
 * mode is ONE for the two bar scales (`LiquidationPaneForm.mode`) — two modes would make the same
 * value two heights, which is the `C-3` violation by another road. */
export function liquidationBarBase(mode: LiquidationScaleMode): number {
  return mode === "logarithmic" ? LIQUIDATION_LOG_BASE : 0;
}

/** Resolves a `scale_ref` of the fused pane (a bars or a marks scale id) to its side, or `null`
 * when the name is not one of the four. */
export function liquidationSideOfScale(scaleRef: string): LiquidationSide | null {
  for (const side of LIQUIDATION_SIDES) {
    const ids = LIQUIDATION_SCALE_IDS[side];
    if (scaleRef === ids.bars || scaleRef === ids.marks) {
      return side;
    }
  }
  return null;
}

export class LiquidationPaneError extends Error {}

// ── Form (web's) and layout (charts') ─────────────────────────────────────────────────────────

/** A vertical band, as fractions of the pane's DATA AREA (below the legend reserve, above the
 * separator clearance), `0` = top of that area. */
export interface VerticalBand {
  readonly top: number;
  readonly bottom: number;
}

/** The FORM of the fused pane — `web`'s, with the `design_gate`'s verdict. All positions are
 * fractions of the data area, top = `0`. */
export interface LiquidationPaneForm {
  /** ONE mode for both bar scales (`[Q-DG-2]`, `T-04.4`). */
  readonly mode: LiquidationScaleMode;
  /** Where the two legs meet. `0,5` = two equal halves (`[Q-DG-2]` decides the share). */
  readonly zeroLine: number;
  readonly up: {
    /** The mark band of the upper leg, at the pane's TOP edge. */
    readonly marks: VerticalBand;
    /** The ceiling of the upper bars; their floor is `zeroLine`. */
    readonly barsTop: number;
  };
  readonly down: {
    /** The floor of the lower bars; their ceiling is `zeroLine`. */
    readonly barsBottom: number;
    /** The mark band of the lower leg, at the pane's BOTTOM edge. */
    readonly marks: VerticalBand;
  };
  /** Nominal heights, CSS px, of the two marks (the zero mark strictly taller — `markBandGeometry`). */
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
}

/**
 * ⚠️ A PROPOSAL, submitted to the `design_gate` with `T-04.4`/`T-04.7` — not a decision. It keeps
 * what phase `01` has today (log mode, marks `6`/`18` px, a gap between marks and bars of the same
 * order as the `0,85 < 0,88` of `SymbolClient.tsx`), splits the pane in two equal halves and puts
 * each leg's marks on its outer edge, which is the only legal place (guarantee (3) above).
 */
export const LIQUIDATION_PANE_FORM_PROPOSAL: LiquidationPaneForm = {
  mode: "logarithmic",
  zeroLine: 0.5,
  up: { marks: { top: 0, bottom: 0.12 }, barsTop: 0.16 },
  down: { barsBottom: 0.84, marks: { top: 0.88, bottom: 1 } },
  absenceMarkPx: 6,
  zeroMarkPx: 18,
};

function assertFraction(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new LiquidationPaneError(`${name}=${value} is not a fraction of the pane's data area in [0, 1]`);
  }
}

/** Guarantee (3), as one strict chain. Exported so `web`'s registry test can refuse a form. */
export function assertValidLiquidationPaneForm(form: LiquidationPaneForm): void {
  const chain: readonly (readonly [string, number])[] = [
    ["up.marks.top", form.up.marks.top],
    ["up.marks.bottom", form.up.marks.bottom],
    ["up.barsTop", form.up.barsTop],
    ["zeroLine", form.zeroLine],
    ["down.barsBottom", form.down.barsBottom],
    ["down.marks.top", form.down.marks.top],
    ["down.marks.bottom", form.down.marks.bottom],
  ];
  for (const [name, value] of chain) {
    assertFraction(name, value);
  }
  for (let index = 1; index < chain.length; index += 1) {
    const [previousName, previous] = chain[index - 1]!;
    const [name, value] = chain[index]!;
    if (!(previous < value)) {
      throw new LiquidationPaneError(
        `${previousName}=${previous} must be strictly above ${name}=${value}: each leg's marks sit on its ` +
          `OUTER edge, disjoint from its bars, and both bar bands meet at zeroLine (ADR-044/D4, RN-4)`,
      );
    }
  }
  if (!(form.mode === "normal" || form.mode === "logarithmic")) {
    throw new LiquidationPaneError(`mode ${String(form.mode)} is neither "normal" nor "logarithmic"`);
  }
}

/** The options of one of the four price scales, ready for `priceScale(id).applyOptions` once `web`
 * maps `mode` onto `PriceScaleMode`. */
export interface LiquidationPriceScaleOptions {
  readonly priceScaleId: string;
  readonly scaleMargins: ScaleMargins;
  readonly invertScale: boolean;
  readonly mode: LiquidationScaleMode;
}

export interface LiquidationSideLayout {
  readonly bars: LiquidationPriceScaleOptions & {
    /** The histogram `base` of this side's bar series — `liquidationBarBase(mode)`. */
    readonly base: number;
  };
  readonly marks: LiquidationPriceScaleOptions;
  /** The mark band of this side (`markBandGeometry` over the applied margins): the autoscale range
   * of the marks scale and the values the two mark series are fed. */
  readonly markBand: MarkBandGeometry;
}

export type LiquidationPaneLayout =
  | {
      /** Pane or legend not laid out yet — ask again next frame. */
      readonly kind: "unmeasured";
    }
  | {
      /** The pane has no data area left once the legend and the separator clearance are taken. */
      readonly kind: "collapsed";
      readonly paneHeightPx: number;
    }
  | {
      readonly kind: "layout";
      readonly paneHeightPx: number;
      /** `true` when the legend passed `MAX_LEGEND_RESERVE_FRACTION` of the pane and was NOT
       * reserved: the upper marks may run under the text, and `web` has to surface it. */
      readonly legendOverflow: boolean;
      /** CSS px from the pane's top: the data area, and the zero line inside it. */
      readonly dataTopPx: number;
      readonly dataBottomPx: number;
      readonly zeroLinePx: number;
      readonly sides: Readonly<Record<LiquidationSide, LiquidationSideLayout>>;
    };

/**
 * The margins of the four scales and the two mark bands, from the pane's MEASURED height and the
 * legend's MEASURED bottom (`PaneScaleMeasure`, the same measure `paneScaleMargins` takes). Pure.
 */
export function liquidationPaneLayout(form: LiquidationPaneForm, measure: PaneScaleMeasure): LiquidationPaneLayout {
  assertValidLiquidationPaneForm(form);
  const height = measure.paneHeightPx;
  if (!Number.isFinite(height) || height <= 0) {
    return { kind: "unmeasured" };
  }
  if (measure.legendBottomPx === null || !Number.isFinite(measure.legendBottomPx)) {
    return { kind: "unmeasured" };
  }
  let reservePx = Math.max(0, measure.legendBottomPx) + LEGEND_GAP_PX;
  const legendOverflow = reservePx / height > MAX_LEGEND_RESERVE_FRACTION;
  if (legendOverflow) {
    reservePx = 0;
  }
  const dataTopPx = reservePx;
  const dataBottomPx = height - SEPARATOR_CLEARANCE_PX;
  const dataPx = dataBottomPx - dataTopPx;
  if (dataPx <= 0) {
    return { kind: "collapsed", paneHeightPx: height };
  }
  const toPx = (fraction: number): number => dataTopPx + fraction * dataPx;
  const margins = (topFraction: number, bottomFraction: number): ScaleMargins => ({
    top: toPx(topFraction) / height,
    bottom: (height - toPx(bottomFraction)) / height,
  });
  const base = liquidationBarBase(form.mode);
  const side = (
    name: LiquidationSide,
    bars: ScaleMargins,
    marks: ScaleMargins,
  ): LiquidationSideLayout => ({
    bars: {
      priceScaleId: LIQUIDATION_SCALE_IDS[name].bars,
      scaleMargins: bars,
      invertScale: LIQUIDATION_INVERTED_SIDE[name],
      mode: form.mode,
      base,
    },
    marks: {
      priceScaleId: LIQUIDATION_SCALE_IDS[name].marks,
      scaleMargins: marks,
      invertScale: LIQUIDATION_INVERTED_SIDE[name],
      mode: "normal",
    },
    markBand: markBandGeometry(height, {
      scaleMargins: marks,
      absenceMarkPx: form.absenceMarkPx,
      zeroMarkPx: form.zeroMarkPx,
    }),
  });
  return {
    kind: "layout",
    paneHeightPx: height,
    legendOverflow,
    dataTopPx,
    dataBottomPx,
    zeroLinePx: toPx(form.zeroLine),
    sides: {
      up: side("up", margins(form.up.barsTop, form.zeroLine), margins(form.up.marks.top, form.up.marks.bottom)),
      down: side(
        "down",
        margins(form.zeroLine, form.down.barsBottom),
        margins(form.down.marks.top, form.down.marks.bottom),
      ),
    },
  };
}

// ── Feeds ─────────────────────────────────────────────────────────────────────────────────────

export interface LiquidationLegInput {
  /** The catalog's `cohort` (`long` / `short`) — carried through, never interpreted here. */
  readonly cohort: string;
  /** The registry's `scale_ref` for this leg (a bars or marks id of `LIQUIDATION_SCALE_IDS`). It
   * alone decides the side: swapping it between the two legs swaps them across the zero line. */
  readonly scaleRef: string;
  /** The leg's slots on the canonical grid, in grid order (slot `i` = logical index `i`). */
  readonly slots: readonly ScalarSlot[];
}

export type LiquidationFeedRole = "bars" | "absence_mark" | "zero_mark";

export interface LiquidationSeriesFeed {
  readonly cohort: string;
  readonly side: LiquidationSide;
  readonly role: LiquidationFeedRole;
  readonly priceScaleId: string;
  readonly items: readonly (LineItem | WhitespaceItem)[];
}

/** The two mark values of a side — `markBand.absenceMarkValue` / `zeroMarkValue` of its layout. */
export interface LiquidationMarkValues {
  readonly absence: number;
  readonly zero: number;
}

/** Counts the fed values `< 0` — the instrument of `F-6 (b)`. `0` is the only acceptable answer. */
export function countNegativeFeedValues(feeds: readonly LiquidationSeriesFeed[]): number {
  let negatives = 0;
  for (const feed of feeds) {
    for (const item of feed.items) {
      if ("value" in item && item.value < 0) {
        negatives += 1;
      }
    }
  }
  return negatives;
}

function assertSameGrid(first: LiquidationLegInput, second: LiquidationLegInput): void {
  if (first.slots.length !== second.slots.length) {
    throw new LiquidationPaneError(
      `legs ${first.cohort} (${first.slots.length} slots) and ${second.cohort} (${second.slots.length} slots) ` +
        `are not on the same grid — the shared maximum reads both by logical index`,
    );
  }
  for (let index = 0; index < first.slots.length; index += 1) {
    if (first.slots[index]!.time !== second.slots[index]!.time) {
      throw new LiquidationPaneError(
        `legs ${first.cohort} and ${second.cohort} disagree on the time of slot ${index} ` +
          `(${first.slots[index]!.time} vs ${second.slots[index]!.time})`,
      );
    }
  }
}

/**
 * The six feeds of the fused pane, leg by leg: bars (magnitudes, `positiveValueSeriesLossless`),
 * absence mark, zero mark — each on the scales of the side the leg's `scaleRef` names. Throws on
 * anything but two legs on two distinct sides and one grid, and on any value `< 0`.
 */
export function liquidationPaneFeeds(
  legs: readonly LiquidationLegInput[],
  markValues: Readonly<Record<LiquidationSide, LiquidationMarkValues>>,
): readonly LiquidationSeriesFeed[] {
  if (legs.length !== 2) {
    throw new LiquidationPaneError(`the liquidation pane has exactly 2 legs, got ${legs.length}`);
  }
  const [first, second] = legs as readonly [LiquidationLegInput, LiquidationLegInput];
  if (first.cohort === second.cohort) {
    throw new LiquidationPaneError(`both legs carry cohort ${first.cohort}`);
  }
  const sides = legs.map((leg) => {
    const side = liquidationSideOfScale(leg.scaleRef);
    if (side === null) {
      throw new LiquidationPaneError(
        `leg ${leg.cohort} points at scale ${leg.scaleRef}, which is not a scale of the liquidation pane`,
      );
    }
    return side;
  });
  if (sides[0] === sides[1]) {
    throw new LiquidationPaneError(
      `legs ${first.cohort} and ${second.cohort} are both on side ${sides[0]} — one goes up, the other down`,
    );
  }
  assertSameGrid(first, second);
  const feeds: LiquidationSeriesFeed[] = [];
  legs.forEach((leg, index) => {
    const side = sides[index]!;
    const ids = LIQUIDATION_SCALE_IDS[side];
    const marks = markValues[side];
    feeds.push(
      { cohort: leg.cohort, side, role: "bars", priceScaleId: ids.bars, items: positiveValueSeriesLossless(leg.slots) },
      { cohort: leg.cohort, side, role: "absence_mark", priceScaleId: ids.marks, items: absenceMarkSeries(leg.slots, marks.absence) },
      { cohort: leg.cohort, side, role: "zero_mark", priceScaleId: ids.marks, items: zeroMarkSeries(leg.slots, marks.zero) },
    );
  });
  const negatives = countNegativeFeedValues(feeds);
  if (negatives !== 0) {
    throw new LiquidationPaneError(`${negatives} fed value(s) < 0 — the liquidation pane carries magnitudes only (RN-3)`);
  }
  return feeds;
}

// ── Shared maximum (C-3) ──────────────────────────────────────────────────────────────────────

/** The visible logical range — `chart.timeScale().getVisibleLogicalRange()`, structurally. */
export type VisibleLogicalRangeSource = () => { readonly from: number; readonly to: number } | null;

/** The shape an `autoscaleInfoProvider` returns. */
export interface MagnitudeAutoscaleInfo {
  readonly priceRange: { readonly minValue: number; readonly maxValue: number };
}

/**
 * ONE autoscale for the two bar scales: `{minValue: base, maxValue: max over BOTH legs of the
 * values inside the visible logical range}`. Hang the returned function as the
 * `autoscaleInfoProvider` of BOTH bar series.
 *
 * The range is widened to whole slots (`floor(from)`..`ceil(to)`): a slot that is only partly on
 * screen is still drawn, and a bar taller than the range would climb out of its band into the
 * leg's own marks. `null` when no visible value is above the base (nothing to scale; the library
 * keeps its own answer for an empty series).
 */
export function sharedMagnitudeAutoscale(
  legs: readonly (readonly ScalarSlot[])[],
  mode: LiquidationScaleMode,
  visibleLogicalRange: VisibleLogicalRangeSource,
): () => MagnitudeAutoscaleInfo | null {
  const base = liquidationBarBase(mode);
  // Sparse (index, value) lists: liquidation is the sparsest series on the screen (`~900` present
  // of `5.760` 1m slots per leg, `T-04.0` §1.3), and the provider runs on every autoscale pass.
  const present = legs.map((slots) => {
    const entries: (readonly [number, number])[] = [];
    slots.forEach((slot, index) => {
      if (slot.value !== null && slot.value > 0) {
        entries.push([index, slot.value]);
      }
    });
    return entries;
  });
  const slotCount = Math.max(0, ...legs.map((slots) => slots.length));
  return () => {
    const range = visibleLogicalRange();
    const from = range === null ? 0 : Math.max(0, Math.floor(range.from));
    const to = range === null ? slotCount - 1 : Math.min(slotCount - 1, Math.ceil(range.to));
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const entries of present) {
      for (const [index, value] of entries) {
        if (index >= from && index <= to && value > maxValue) {
          maxValue = value;
        }
      }
    }
    if (!(maxValue > base)) {
      return null;
    }
    return { priceRange: { minValue: base, maxValue } };
  };
}
