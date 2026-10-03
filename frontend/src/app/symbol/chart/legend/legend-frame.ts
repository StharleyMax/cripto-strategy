import { createContext, useContext } from "react";
import { formatCoverageSpan } from "../../coverage-magnitude.ts";
import type { LegendSeriesId, PaneHeading } from "./pane-legend.ts";
import type { PaneLegendSpec } from "../../pane-registry.ts";

// ── `T-01.7` — the crosshair → legend wiring (`pane-legend.ts`, `RF-4`, `RF-5`, `CA-3′`, `C-8`) ──

/** What every legend reads besides its own slots: the names and reading policies DERIVED once from
 * the catalog (`resolvePaneLegends`), the grid step, and the instant a bucket counts as closed. */
export interface LegendFrame {
  readonly legends: Readonly<Record<LegendSeriesId, PaneLegendSpec | null>>;
  readonly axisStepMs: number;
  /** `knowledge_time_ms` of the request: the page is "COMO EM T", so a bucket is closed iff it
   * closed at T (`ChromeModeStamp`), never at the browser's clock. */
  readonly asOfMs: number;
  /** W1-FIX (`gates/W1-DESIGN-REVIEW.md` MF-B): the width of the served bar — the page's TF. Above
   * `1m` a bar is ONE point on the slot of its open, so the legend snaps the slot it reads to that
   * open (`charts::resolveLegendReading`'s `bucketMs`), instead of reading an empty minute. */
  readonly bucketMs: number;
  /** `T-05.6` (`W7-DESIGN-REVIEW` N-2): each pane's heading — the page's TF outside the parenthesis,
   * the series' identity inside it (`pane-legend.ts::resolvePaneHeadings`). */
  readonly headings: Readonly<Record<LegendSeriesId, PaneHeading>>;
}

export const LegendFrameContext = createContext<LegendFrame | null>(null);

export function useLegendFrame(): LegendFrame {
  const frame = useContext(LegendFrameContext);
  if (frame === null) {
    throw new Error("useLegendFrame must be called within a LegendFrameContext provider");
  }
  return frame;
}

/** `paineis-de-fluxo` `T-05.4` (item extra of `gates/T-05.1-build.md` §6) — the width of ONE slot of
 * the axis, in the words the panes print ("1 min", "15 min", "1 h", "4 h"). Since `T-05.1` the slot is
 * the timeframe's bar, so the nine sentences that said "de 1 min" were false at every TF but `1m`
 * ("Vela completa em 42 de 42 buckets de 1 min" at `4h`). Same duration format as the coverage
 * warning (`coverage-magnitude.ts::formatCoverageSpan`), so the screen spells a span one way. */
export function useSlotUnit(): string {
  return formatCoverageSpan(useLegendFrame().axisStepMs);
}
