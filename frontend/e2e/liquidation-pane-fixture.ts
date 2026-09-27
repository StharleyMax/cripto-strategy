/**
 * `T-04.1` — the Node half of `e2e/31-liquidation-pane-pixel.spec.ts`. Run as its own `node`
 * process (`node e2e/liquidation-pane-fixture.ts <paneHeightPx> <legendBottomPx>`), it prints ONE
 * JSON object on stdout: the fused liquidation pane's scales and feeds, built by the REAL
 * `liquidationPaneLayout` / `liquidationPaneFeeds` / `sharedMagnitudeAutoscale` of `charts`, for the
 * design and for each ablation.
 *
 * `T-04.4`: the form is the app's own (`LIQUIDATION_PANE_FORM`, linear — `gates/T-04.4-design-gate.md`
 * §5), so `normal:design` IS what the app draws; the `logarithmic:*` charts keep the same form in log,
 * as the comparison the gate measured (§2.2, row A) and to keep the geometry honest in both modes.
 *
 * ⚠️ WHY A SEPARATE PROCESS: the same reason `e2e/sparse-feed-fixture.ts` gives — the barrel
 * re-exports the jsdom harness, and Playwright's loader cannot link jsdom's dependency chain.
 *
 * ⚠️ THE SHARED AUTOSCALE CROSSES AS A NUMBER. A provider is a closure and cannot cross into the
 * page as JSON, so the fixture evaluates the REAL provider for the range the page draws
 * (`fitContent`, i.e. the whole grid — `visibleLogicalRange() = null`) and the page hangs a
 * constant provider with that answer on both bar series. The provider's behaviour over a MOVING
 * range is measured against the library in `src/charts/liquidation-pane-geometry.test.ts`.
 */

import { LIQUIDATION_PANE_FORM } from "../src/app/symbol/liquidation-pane-form.ts";
import {
  LIQUIDATION_SCALE_IDS,
  countNegativeFeedValues,
  liquidationPaneFeeds,
  liquidationPaneLayout,
  sharedMagnitudeAutoscale,
  type LiquidationLegInput,
  type LiquidationScaleMode,
} from "../src/charts/index.ts";
import type { ScalarSlot } from "../src/charts/s2-scalar-grid.ts";

const SLOT_COUNT = 240;
const START_MS = 1_700_000_040_000;
const ONE_MINUTE_MS = 60_000;
export const SAME_VALUE = 5_000;
const SHORT_SAME_SLOT = 50;
const LONG_SAME_SLOT = 60;

/** Same shape as the node test's legs: sparse, both states of absence, a 10x ratio of maxima. */
function shortValue(index: number): number | null {
  if (index === SHORT_SAME_SLOT) return SAME_VALUE;
  if (index === 100) return 40_000;
  if (index % 7 === 0) return 200 + ((index * 37) % 900);
  if (index % 7 === 3) return 0;
  return null;
}

function longValue(index: number): number | null {
  if (index === LONG_SAME_SLOT) return SAME_VALUE;
  if (index === 180) return 400_000;
  if (index % 5 === 0) return 300 + ((index * 53) % 1_500);
  if (index % 5 === 2) return 0;
  return null;
}

function slotsOf(value: (index: number) => number | null): ScalarSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_unused, index) => ({ time: START_MS + index * ONE_MINUTE_MS, value: value(index) }));
}

const SHORT = slotsOf(shortValue);
const LONG = slotsOf(longValue);

type Variant = "design" | "swapped" | "independent" | "shifted";

function legsFor(variant: Variant): LiquidationLegInput[] {
  const swapped = variant === "swapped";
  return [
    { cohort: "short", scaleRef: swapped ? LIQUIDATION_SCALE_IDS.down.bars : LIQUIDATION_SCALE_IDS.up.bars, slots: SHORT },
    { cohort: "long", scaleRef: swapped ? LIQUIDATION_SCALE_IDS.up.bars : LIQUIDATION_SCALE_IDS.down.bars, slots: LONG },
  ];
}

const [paneHeightArg, legendBottomArg] = process.argv.slice(2);
const paneHeightPx = Number(paneHeightArg);
const legendBottomPx = Number(legendBottomArg);

function chartFor(mode: LiquidationScaleMode, variant: Variant) {
  const layout = liquidationPaneLayout({ ...LIQUIDATION_PANE_FORM, mode }, { paneHeightPx, legendBottomPx });
  if (layout.kind !== "layout") {
    throw new Error(`layout is ${layout.kind} for a ${paneHeightPx} px pane`);
  }
  const markValues = { up: { absence: 0, zero: 0 }, down: { absence: 0, zero: 0 } };
  for (const side of ["up", "down"] as const) {
    const band = layout.sides[side].markBand;
    if (band.kind !== "band") {
      throw new Error(`${side} mark band is ${band.kind}`);
    }
    markValues[side] = { absence: band.absenceMarkValue, zero: band.zeroMarkValue };
  }
  const legs = legsFor(variant);
  const feeds = liquidationPaneFeeds(legs, markValues);
  const shared = sharedMagnitudeAutoscale(
    legs.map((leg) => leg.slots),
    mode,
    () => null,
  )();
  const series = feeds.map((feed) => {
    const side = layout.sides[feed.side];
    const scale = feed.role === "bars" ? side.bars : side.marks;
    let scaleMargins = scale.scaleMargins;
    if (variant === "shifted" && feed.role === "bars" && feed.side === "down") {
      // The F-6 control of `T-04.0` §2: the lower bars' margin 3 px down.
      scaleMargins = { top: scaleMargins.top + 3 / paneHeightPx, bottom: scaleMargins.bottom };
    }
    return {
      id: `${feed.cohort}:${feed.role}`,
      cohort: feed.cohort,
      side: feed.side,
      role: feed.role,
      priceScaleId: scale.priceScaleId,
      scaleMargins,
      invertScale: scale.invertScale,
      logarithmic: scale.mode === "logarithmic",
      base: feed.role === "bars" ? side.bars.base : 0,
      /** `null` = the library's own autoscale (the `independent` ablation, bars only). */
      priceRange:
        feed.role === "bars"
          ? variant === "independent"
            ? null
            : shared?.priceRange ?? null
          : (side.markBand as { priceRange: { minValue: number; maxValue: number } }).priceRange,
      items: feed.items,
    };
  });
  return { name: `${mode}:${variant}`, mode, variant, zeroLinePx: layout.zeroLinePx, negatives: countNegativeFeedValues(feeds), series };
}

let negationRefused = false;
try {
  liquidationPaneFeeds(
    legsFor("design").map((leg) =>
      leg.cohort === "long" ? { ...leg, slots: leg.slots.map((slot) => ({ ...slot, value: slot.value === null ? null : -slot.value })) } : leg,
    ),
    { up: { absence: 2, zero: 6 }, down: { absence: 2, zero: 6 } },
  );
} catch {
  negationRefused = true;
}

const charts = (["normal", "logarithmic"] as const).flatMap((mode) =>
  (["design", "swapped", "independent", "shifted"] as const).map((variant) => chartFor(mode, variant)),
);

process.stdout.write(
  JSON.stringify({
    paneHeightPx,
    legendBottomPx,
    sameValue: SAME_VALUE,
    sameValueTimes: { short: (START_MS + SHORT_SAME_SLOT * ONE_MINUTE_MS) / 1000, long: (START_MS + LONG_SAME_SLOT * ONE_MINUTE_MS) / 1000 },
    negationRefused,
    charts,
  }),
);
