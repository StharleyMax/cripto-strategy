import { F1_PANE_STACK_FORM, stackedPaneLayout } from "../../../../charts/index.ts";
import { F1_PANE_ORDER, F1_PANE_STRETCH } from "../../pane-registry.ts";

/** ⛔ NOT THE CHART HEIGHT ANY MORE (`T-01.6`), AND SINCE `T-04.2` NOTHING IN PRODUCTION READS IT.
 * Until `T-01.5` each pane was its own chart of this height; the ONE chart takes its height from
 * `PANE_STACK` below. The last production reader was the nominal band of the two-pane liquidation's
 * marks; the fused pane of `T-04.2` sizes its marks off the MEASURED pane
 * (`charts::liquidationPaneLayout` → `markBandGeometry`). It stays, exported, because
 * `price-candle.test.ts` and `candle-direction-channel.test.ts` read it off this source as the
 * nominal single-pane height they measure a candle in — re-anchoring those two is not this task's. */
export const CHART_HEIGHT_PX = 220;

/**
 * `T-01.6` — the ONE chart's vertical layout: chart height and stretch factors, computed once
 * (`charts/pane-stack-layout.ts`, `ADR-003/FR-2`). The weights are the registry's
 * (`F1_PANE_STRETCH`, in `F1_PANE_ORDER`), the pixels the `design_gate`'s form (`F1_PANE_STACK_FORM`).
 */
export const PANE_STACK = stackedPaneLayout({
  ...F1_PANE_STACK_FORM,
  weights: F1_PANE_ORDER.map((paneId) => F1_PANE_STRETCH[paneId]),
});
