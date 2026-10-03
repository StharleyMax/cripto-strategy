import { useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { resolveLegendReading, type S2Panels } from "../../../../charts/index.ts";
import { CrosshairSlotContext } from "../host/registrar.ts";
import {
  ABSENCE_MICROCOPY,
  createCrosshairSlotStore,
  formatLegendReading,
  LEGEND_GRID_ABSENCE,
  LEGEND_MARK_TEXT,
  legendMarkWidthCh,
  legendNumeralWidthCh,
  type CrosshairSlotStore,
  type LegendSeriesId,
} from "./pane-legend.ts";
import { useLegendFrame } from "./legend-frame.ts";

/** `ScalarSlot`'s shape, read off the barrel's own `S2Panels` (`ADR-034/D8` — no deep import
 * into `charts`, and no import of `view-model.ts`, which is server-side: it pulls
 * `node:crypto`, and `web-fullstack.browser-imports-server` is a BLOQUEIO). */
export type VolumeSlot = S2Panels["oi"]["slots"][number];

export const NO_CROSSHAIR_STORE: CrosshairSlotStore = createCrosshairSlotStore();
export const noCrosshairSnapshot = (): number | undefined => undefined;

/**
 * ONE legend value (`RF-4`): the slot under the crosshair, or — with no crosshair — the last closed
 * bucket, read by the series' `nature` (`charts::resolveLegendReading`, `ADR-044/D2`). It is the only
 * node that re-renders on a crosshair move: it subscribes to the store itself, so a move re-renders
 * these spans and nothing else of the page.
 *
 * `C-8`: the numeral is right-aligned in a column of fixed width, in `ch`, sized to every numeral the
 * pane can show; the held/forming mark has a fixed column of its own after it.
 *
 * The `data-legend-*` attributes are the CONTRACT half (`CA-3′`/`CA-4`, asserted against
 * `/series-history` by `T-01.9`); the classes and the mark words are FORM, submitted with the
 * screenshot of `T-01.11`.
 */
export function LegendValue({
  seriesId,
  factKey,
  slots,
  nativeTimeframeMs,
  prefix,
  lead,
}: {
  /** Which derived legend names and reads this value. */
  readonly seriesId: LegendSeriesId;
  /** ASCII key of the value (`cvd_delta` and `cvd_cumulative` share the `cvd` legend). */
  readonly factKey: string;
  /** The slots on the canonical grid — slot `i` IS logical index `i` (registry invariant (v)). */
  readonly slots: readonly VolumeSlot[];
  /** The series' own cadence, when coarser than the grid (OI's 5 min); the grid step otherwise. */
  readonly nativeTimeframeMs?: number;
  /** pt-BR word before the numeral, when a pane shows two values. */
  readonly prefix?: string;
  /** `T-04.3` — a mark drawn IMMEDIATELY before the numeral column (the liquidation leg's square,
   * `SPEC-009` §7.3). Never text: the numeral stays the only number of this value. */
  readonly lead?: ReactNode;
}) {
  const frame = useLegendFrame();
  const store = useContext(CrosshairSlotContext) ?? NO_CROSSHAIR_STORE;
  const logical = useSyncExternalStore(store.subscribe, store.getSnapshot, noCrosshairSnapshot);
  const legend = frame.legends[seriesId];
  // `T-01.11-FIX` (`MF-3`): the painted numeral of an absent slot is the pt-BR word, not the enum;
  // the enum stays machine-readable in `data-legend-absence`.
  const absenceText = ABSENCE_MICROCOPY[LEGEND_GRID_ABSENCE];
  const numeralWidthCh = useMemo(() => legendNumeralWidthCh(slots, absenceText), [slots, absenceText]);
  const reading =
    legend === null
      ? null
      : resolveLegendReading({
          logical,
          slots,
          nature: legend.readingPolicy,
          axisStepMs: frame.axisStepMs,
          nativeTimeframeMs: nativeTimeframeMs ?? frame.axisStepMs,
          asOfMs: frame.asOfMs,
          bucketMs: frame.bucketMs,
        });
  // No resolved entry ⇒ no series ⇒ nothing to read: the token, never a number.
  const text =
    reading === null ? { numeral: absenceText, mark: "none" as const, rawValue: null } : formatLegendReading(reading, absenceText);
  const isAbsent = text.rawValue === null;
  const markWidthCh = legend === null ? 0 : legendMarkWidthCh(legend.readingPolicy);
  return (
    <span
      data-legend-value={factKey}
      data-legend-kind={reading?.kind ?? "absent"}
      data-legend-source={logical === undefined ? "last_closed" : "crosshair"}
      data-legend-slot-index={reading?.slotIndex ?? ""}
      data-legend-bucket-ms={reading?.bucketStartMs ?? ""}
      data-legend-raw={text.rawValue ?? ""}
      data-legend-absence={isAbsent ? LEGEND_GRID_ABSENCE : ""}
      className="inline-flex items-baseline gap-x-1"
    >
      {prefix === undefined ? null : <span className="text-provenance-weak">{prefix}</span>}
      {lead ?? null}
      <span
        data-legend-numeral=""
        style={{ width: `${numeralWidthCh}ch` }}
        className={`inline-block text-right font-data-sm tabular-nums ${isAbsent ? "text-provenance-weak" : "text-on-surface"}`}
      >
        {text.numeral}
      </span>
      <span data-legend-mark={text.mark} style={{ width: `${markWidthCh}ch` }} className="inline-block text-provenance-weak">
        {LEGEND_MARK_TEXT[text.mark]}
      </span>
    </span>
  );
}
