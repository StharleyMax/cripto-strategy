/**
 * The WIRING between the crosshair and the per-pane legends — `T-01.7` (`paineis-de-fluxo`,
 * plan `01` item `1.6`, the `web` half of the split; the pure reading is `T-01.4`,
 * `charts/legend-reading.ts`). `RF-4`, `RF-5`, `CA-3′`, `CA-4`, `CA-5`, and `C-8` of
 * `gates/DESIGN-LAYOUT-ux-critique-r2.md`.
 *
 * Everything here is a pure function or a tiny store with no React in it, so the properties the
 * DoD names are testable without a browser (`pane-legend.test.ts`). `SymbolClient.tsx` only
 * subscribes the chart to the handler and renders what these functions return.
 *
 * ── ONE CROSSHAIR, EVERY LEGEND (`CA-3′`, `ADR-044` §Consequências) ─────────────────────────
 *
 * Under `S-1` the six panes are ONE chart, so there is ONE `subscribeCrosshairMove`, and the
 * `param.logical` it carries is the same logical index in every pane (invariant (v) of the pane
 * registry: every series is handed exactly the canonical grid). The handler therefore publishes
 * `param.logical` to every legend and NEVER looks at `param.paneIndex`: hovering the price pane at
 * `x` must move the OI, CVD, liquidation and long/short legends to `x` too. Filtering by the pane
 * the pointer is over is `CA-3′`'s named mutation, and `pane-legend.test.ts` rejects it.
 *
 * ── THE NAME IS DERIVED, ONCE PER PANE (`RF-5`, `CA-5`) ─────────────────────────────────────
 *
 * `paneIdentityLabel` is the function that already named the long/short pane (`identityTerms`,
 * `T-04.8`: cadence then unit, both terms of the series' KEY), lifted off that one pane and fed the
 * served catalog entry instead of a pane's transcribed props. It is called through the registry's
 * own `resolvePaneLegend` — the only sanctioned way to fill a `PaneLegendSpec` — once per pane,
 * when the page mounts. Change the key in the catalog and the name changes; a hand-written name
 * would not, which is `CA-5`'s mutation.
 *
 * ── THE NUMERAL SITS IN A FIXED COLUMN (`C-8`) ──────────────────────────────────────────────
 *
 * Under the crosshair a numeral changes width on every move (`30258` → `0`), and whatever follows
 * it on the same `nowrap` line would walk. The numeral gets a slot of FIXED width in `ch`, right
 * aligned, wide enough for EVERY value the pane can show (the widest numeral of its slots, or the
 * absence token), and the mark of a held/forming reading gets its own fixed slot after it. The body
 * font is monospaced (`globals.css`, JetBrains Mono, `tabular-nums`), so `1ch` is one character.
 */

import type { LegendReading, ReadingNature } from "../../charts/index.ts";
import type { SeriesCatalogEntry } from "../../features/s3-inspector/series-catalog.ts";
import type { Absence } from "../history-transport.ts";
import { resolvePaneLegend, type PaneLegendSpec, type ServedCatalog } from "./pane-registry.ts";

// ── The name (`RF-5`, `CA-5`) ────────────────────────────────────────────────────────────

/**
 * The series that carry a legend value on the page: the six panes of phase `01`, plus the volume
 * sub-axis of the price pane (a second series inside it, with its own legend line). The CVD pane
 * reads its delta and its cumulative off ONE entry (`cvd`), so it is one source here.
 */
export type LegendSeriesId =
  | "price"
  | "volume"
  | "oi"
  | "cvd"
  | "liquidation_long"
  | "liquidation_short"
  | "long_short";

/** Every `LegendSeriesId`, in page order — the list `resolvePaneLegends` walks. */
export const LEGEND_SERIES_IDS: readonly LegendSeriesId[] = [
  "price",
  "volume",
  "oi",
  "cvd",
  "liquidation_long",
  "liquidation_short",
  "long_short",
];

/** What the route resolved for one legend: the entry of the served catalog and its
 * `series_key_id` (hashed server-side, `page.tsx`, because hashing needs `node:crypto`). */
export interface PaneLegendSource {
  readonly seriesKeyId: string;
  readonly entry: SeriesCatalogEntry;
}

/** `null` where the catalog resolution failed or was ambiguous — that pane has no series, so it
 * has no identity to state either (the same posture `LongShortPaneData.unit` takes). */
export type PaneLegendSources = Readonly<Record<LegendSeriesId, PaneLegendSource | null>>;

/**
 * The identity terms of a series, off its catalog entry: CADENCE then UNIT, both terms of the
 * `SeriesKey`. This is `identityTerms` of `T-04.8` (`SymbolClient.tsx`), generalized from the
 * long/short pane's transcribed `nativeInterval`/`unit` to the entry every pane resolves — the
 * function `SPEC-009` §4 names for `RF-5`.
 */
export function paneIdentityLabel(entry: SeriesCatalogEntry): string {
  const terms = [entry.key.interval, entry.key.unit].filter((term) => term.trim().length > 0);
  return terms.join(", ");
}

/**
 * The legend of every series, derived ONCE from its catalog entry through the registry's
 * `resolvePaneLegend` (`SPEC-009` §4: "chamada uma vez por pane, no registry"). `null` where the
 * route resolved no entry.
 */
export function resolvePaneLegends(
  sources: PaneLegendSources,
  deriveLabel: (entry: SeriesCatalogEntry) => string = paneIdentityLabel,
): Readonly<Record<LegendSeriesId, PaneLegendSpec | null>> {
  const legends = {} as Record<LegendSeriesId, PaneLegendSpec | null>;
  for (const id of LEGEND_SERIES_IDS) {
    const source = sources[id];
    if (source === null) {
      legends[id] = null;
      continue;
    }
    const catalog: ServedCatalog = new Map([[source.seriesKeyId, source.entry]]);
    legends[id] = resolvePaneLegend(source.seriesKeyId, catalog, deriveLabel);
  }
  return legends;
}

// ── The crosshair (`CA-3′`) ──────────────────────────────────────────────────────────────

/** The two fields of `lightweight-charts`' `MouseEventParams` the legend is allowed to depend on.
 * `paneIndex` is here only so the handler's signature says out loud that it is IGNORED. */
export interface CrosshairMoveParam {
  readonly logical?: number;
  readonly paneIndex?: number;
}

/**
 * The slot the crosshair is over, shared by every legend. The snapshot is the ROUNDED logical
 * index (bar `i` spans `[i − 0.5, i + 0.5)`, the rule `legend-reading.ts` applies), or `undefined`
 * when there is no crosshair — so a move inside the same bar notifies nobody, and the legends
 * re-render only when the slot they read changes.
 */
export interface CrosshairSlotStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => number | undefined;
  readonly publish: (logical: number | undefined) => void;
}

export function createCrosshairSlotStore(): CrosshairSlotStore {
  let slot: number | undefined;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => slot,
    publish(logical) {
      // A non-finite logical (the library never sends one, but a `NaN` would round to `NaN` and
      // never equal itself, notifying forever) reads as "no crosshair", never as a slot.
      const next = logical === undefined || !Number.isFinite(logical) ? undefined : Math.round(logical) + 0;
      if (next === slot) {
        return;
      }
      slot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/**
 * The `subscribeCrosshairMove` handler: `param.logical` to every legend, WITHOUT a filter by
 * `param.paneIndex` (`CA-3′`). `logical` is `undefined` when the pointer left the chart, and then
 * every legend falls back to the last closed bucket (`RF-4`).
 */
export function crosshairMoveHandler(store: CrosshairSlotStore): (param: CrosshairMoveParam) => void {
  return (param) => {
    store.publish(param.logical);
  };
}

// ── The text and the fixed column (`RF-4`, `C-8`) ────────────────────────────────────────

/** The mark a legend numeral carries: a held `STOCK` value or a bucket still in formation is never
 * shown as if it were the closed bucket's own reading (`ADR-026/D3`, `SPEC-009` §4). */
export type LegendMark = "none" | "held" | "forming";

/** The pt-BR microcopy of each mark. ⚠️ FORM — a builder's placeholder, submitted with the
 * screenshot of `T-01.11`; the rule is only that the two states are MARKED. */
export const LEGEND_MARK_TEXT: Readonly<Record<LegendMark, string>> = {
  none: "",
  held: "retido",
  forming: "em formação",
};

/**
 * `T-01.11-FIX` (`MF-3` of `gates/T-01.11-design-review.md`) — the pt-BR word the LEGEND prints for
 * each `Absence` reason, instead of the domain enum. The review measured `SEM_PONTO` as the numeral
 * of all 8 legend values under the crosshair in a gap (and `deltaSEM_PONTO` on the CVD line): the
 * enum is the machine's spelling, and the legend is the most-read text on the screen.
 *
 * ⚠️ WHAT DOES NOT CHANGE: the enum stays the machine-readable contract — in `data-legend-absence`
 * next to this word, and in every `*_last_reading` readout the e2e of phases `01`-`05` pin
 * (`RN-1`, `DoD-3`). Only the painted numeral speaks Portuguese.
 *
 * ⚠️ FORM — `ausente` is the review's own word (plan `01` item 1.6: *"slot ausente mostra
 * ausente"*); the other three are a builder's proposal, submitted to the revalidation of `T-01.11`.
 * The grid legend can only reach `SEM_PONTO` today (`LEGEND_GRID_ABSENCE`); the map is total so a
 * reason that reaches it later has a word before it has a screen.
 */
export const ABSENCE_MICROCOPY: Readonly<Record<Absence, string>> = {
  SEM_PONTO: "ausente",
  NAO_LIDO: "não lido",
  QUARENTENA: "em quarentena",
  SEM_FONTE: "sem fonte",
};

/** The one `Absence` a legend slot can carry: the canonical grid keeps no reason — an absent slot
 * is a `null` value, "the grid has a slot here and no source point filled it" (`ScalarSlot`). */
export const LEGEND_GRID_ABSENCE: Absence = "SEM_PONTO";

export interface LegendText {
  /** The number as the API served it, or the absence token — never `0` for an absent slot. */
  readonly numeral: string;
  readonly mark: LegendMark;
  /** The number, for the `data-` attribute an e2e compares with `/series-history`; `null` when absent. */
  readonly rawValue: number | null;
}

/** A reading, as text. `String(value)` and not a locale format: the legend is compared, digit for
 * digit, with the value `/series-history` served (`CA-3′`/`CA-4`). */
export function formatLegendReading(reading: LegendReading, absenceToken: string): LegendText {
  switch (reading.kind) {
    case "absent":
      return { numeral: absenceToken, mark: "none", rawValue: null };
    case "forming":
      return { numeral: String(reading.valueSoFar), mark: "forming", rawValue: reading.valueSoFar };
    case "held":
      return { numeral: String(reading.value), mark: "held", rawValue: reading.value };
    case "value":
      return { numeral: String(reading.value), mark: "none", rawValue: reading.value };
  }
}

/**
 * The width, in `ch`, of the numeral column of one legend: wide enough for the widest numeral any
 * slot of the pane can show, and for the absence token. Computed over ALL the slots, not the one
 * under the crosshair — sizing to the current value is exactly the column that walks (`C-8`).
 */
export function legendNumeralWidthCh(
  slots: readonly { readonly value: number | null }[],
  absenceToken: string,
): number {
  let width = absenceToken.length;
  for (const slot of slots) {
    if (slot.value !== null) {
      width = Math.max(width, String(slot.value).length);
    }
  }
  return width;
}

/** The width, in `ch`, of the mark column: the longest mark this nature can produce. Only `STOCK`
 * holds a value forward; every nature can land on the bucket in formation. */
export function legendMarkWidthCh(nature: ReadingNature): number {
  const marks: LegendMark[] = nature === "STOCK" ? ["held", "forming"] : ["forming"];
  return Math.max(...marks.map((mark) => LEGEND_MARK_TEXT[mark].length));
}
