/**
 * The PANE REGISTRY — `SPEC-009` §5 (`D3`), `ADR-044/D1–D3`, plan `01` item `1.2` (`T-01.2`).
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────────────────────
 *
 * Under `S-1` (`ADR-044/D1`) the symbol page is ONE `createChart` with one native pane per
 * metric. The registry is the DATA that says which panes exist and what each one draws: an
 * ordered array whose POSITION is the `paneIndex`, top to bottom. There is no `paneIndex`
 * field on purpose — a field could disagree with the position, and the library only knows the
 * position.
 *
 * ── WHY THE INVARIANTS LIVE HERE, AND NOT IN A DOM CONTRACT ───────────────────────────────
 *
 * Under six charts, each pane's construction was a separate block of `SymbolClient.tsx`, and
 * the `*-pane-dom-contract.test.ts` suites pinned that construction by regex over the source
 * text (`ARQ-1` §6: ~7 of 56 tests). Under one chart those blocks collapse into the registry,
 * and the properties those regexes guarded become properties OF THE REGISTRY, checked on the
 * value itself:
 *
 *   (i)   every `seriesKeyId` exists in the catalog that was served;
 *   (ii)  every pane has at least one `primary` series;
 *   (iii) every `FLOW` data series of `kind = histogram` has the `absence_mark` + `zero_mark`
 *         pair (`RN-4`, `ADR-044/D3′` (iii-a)) — so the fusion of phase `04` cannot "forget" a
 *         mark. A `FLOW` LINE needs no mark (`D3′` (iii-b): it is fed by the lossless adapter, and
 *         the adapter's own test is what refuses a carried value). A `FLOW` CANDLESTICK does not
 *         exist today and is refused until classified (`D3′`, same principle as
 *         `UncoveredReductionPairError`);
 *   (iv)  no legend is literal: the label (and the reading policy) is DERIVED from the
 *         `SeriesKey` in the catalog (`RF-5`, `CA-5`);
 *   (v)   every `time` of every `setData` belongs to the canonical grid (`ADR-044/D2`). Under
 *         `S-1` an off-grid time is no longer a local defect: it inserts a new logical index
 *         into EVERY pane and shifts all of them (`ARQ-1` §2).
 *
 * ── BOUNDARY (`ADR-003/FR-2`) ─────────────────────────────────────────────────────────────
 *
 * `web` owns the COMPOSITION (this file). It holds no geometry: `stretch` is a relative weight
 * whose value is the `design_gate`'s, and `scaleRef` is a NAME of a scale, never a pixel or a
 * margin. The 14 geometry constants still in `SymbolClient.tsx` do not move here.
 *
 * ── BROWSER-SAFE ──────────────────────────────────────────────────────────────────────────
 *
 * The catalog arrives as a map ALREADY keyed by `series_key_id`. Computing that id needs
 * `node:crypto` (`series-key-id.ts`), and this module must stay importable from a Client
 * Component, so the hashing stays with the caller.
 */

import {
  LIQUIDATION_SCALE_IDS,
  liquidationSideOfScale,
  type LiquidationSide,
} from "../../charts/index.ts";
import {
  buildSeriesLabel,
  type Nature,
  type SeriesCatalogEntry,
} from "../../features/s3-inspector/series-catalog.ts";

// ── Shape ───────────────────────────────────────────────────────────────────────────────

/**
 * The stable, ASCII, English pane keys (`SPEC-009` §5). Phase `01` had the two liquidation legs as
 * two panes (`liquidation_long`, `liquidation_short`); `T-04.2` (plan `04` item `4.1`, the `web`
 * half, `ADR-044/D4`) fuses them into ONE pane, `liquidation`: the `short` leg above the zero line,
 * the `long` leg below it, each on the scale its `scale_ref` names (`LIQUIDATION_LEG_SCALE_REF`).
 */
export type PaneId = "price" | "liquidation" | "oi" | "long_short" | "cvd";

/**
 * The top-to-bottom order of the five panes: price+volume · liquidations · OI · long/short · CVD
 * (`SPEC-009` §5, `RF-1`, the same order the `design_gate`'s weights in `handoff/DESIGN-LAYOUT.md`
 * §6 name). The final value is the `design_gate`'s; this constant is the one place it is written.
 */
export const F1_PANE_ORDER: readonly PaneId[] = ["price", "liquidation", "oi", "long_short", "cvd"];

/**
 * `T-01.6` — the relative height of each pane, handed to `setStretchFactor`
 * (`handoff/DESIGN-LAYOUT.md` §6, row "altura"; `SPEC-009` §3).
 *
 * The `design_gate` approved **34 · 11 · 15 · 9 · 9 · 9 · 9** for SEVEN panes (price · liquidations ·
 * OI · L/S · funding · CVD delta · CVD cumulative). Phase `01` had SIX: funding is `NG-3`, the CVD
 * stays one pane (`NG-5`), and the liquidation was TWO panes of **11 each** until phase `04` (the
 * floor argument of `T-01.6`: at 5,5 the lightest pane binds the 72px floor past the 1.024px
 * viewport; at 11 it binds at `72 × 89 / 9 = 712px`).
 *
 *   - `liquidation` → **22**, the SUM of the two legs it replaces (`T-04.2`). ⚠️ `[INFERRED]`, and it
 *     is a PROPOSAL: it is the only value that moves NO other pane by a pixel (`Σ = 89` before and
 *     after, so every other pane's height and the floor arithmetic are unchanged) and keeps the
 *     liquidation's total height. The size of the pane and of its two halves is `[Q-DG-2]`, the
 *     `design_gate`'s, decided in `T-04.4` — changing a value here is the whole change.
 *   - `cvd` → **9**, the weight of a line pane (the floor was specified "por pane de linha").
 */
export const F1_PANE_STRETCH: Readonly<Record<PaneId, number>> = {
  price: 34,
  liquidation: 22,
  oi: 15,
  long_short: 9,
  cvd: 9,
};

/**
 * `T-01.6` — the `data-testid` of the ROOT of a pane's DOM layer, derived from its `pane_id`
 * (`SPEC-009` §3: "os `data-testid` atuais sobrevivem, derivados de `pane_id`, na raiz da camada").
 *
 * The rule is `<pane_id with "-" for "_">-pane`, which reproduces every testid the e2e suite reads
 * (`price-pane`, `liquidation-pane`, `oi-pane`, `cvd-pane`, `long-short-pane`). Since `T-04.2` there is
 * no exception: the fused liquidation pane's root is `liquidation-pane`, the handle `e2e/13` has
 * always used for the pane, and the two cohort groups `liquidation-cohort-<cohort>` live INSIDE it.
 */
export function paneLayerTestId(paneId: PaneId): string {
  return `${paneId.replace(/_/g, "-")}-pane`;
}

// ── The fused liquidation pane (`T-04.2`, `[Q-LIQ-2]`, `SPEC-009` §7.1) ──────────────────────

/** The two cohorts `liquidation_catalog.py::COHORTS` publishes — closed, so a third leg cannot be
 * born without a scale of its own. */
export type LiquidationCohort = "long" | "short";

/**
 * Which scale each leg of the fused pane hangs on — the ONE place the cohort → side choice is
 * written (`SPEC-009` §7.1: *"a mudança, se um dia for revertida, é uma troca de lado no registry (a
 * inversão de `scale_ref` nas duas pernas)"*).
 *
 * `short` → the UPPER scale (normal), `long` → the LOWER scale (`invertScale: true`, `ADR-044/D4`):
 * the Coinalyze convention, `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`
 * (`[Q-LIQ-2]`; the refused one was TradingView Markets). A short liquidation is forced BUYING, so
 * it goes up, in the token of the rise; a long liquidation is forced SELLING, down, in the token of
 * the fall (`RNF-3`: the same grammar as the candle).
 *
 * The values are the NAMES `charts` gives the scales (`LIQUIDATION_SCALE_IDS`), never a margin or a
 * pixel (`ADR-003/FR-2`). The side, and with it the ink, follows the scale and nothing else.
 */
export const LIQUIDATION_LEG_SCALE_REF: Readonly<Record<LiquidationCohort, string>> = {
  short: LIQUIDATION_SCALE_IDS.up.bars,
  long: LIQUIDATION_SCALE_IDS.down.bars,
};

/** The registry's leg → scale map with the two `scale_ref`s swapped — the ablation `CA-LIQ` names
 * (plan `04` DoD 2, *"Morde: trocar o `scale_ref` das duas pernas"*). Pure; production never calls
 * it outside the e2e switch. */
export function swappedLiquidationLegScaleRefs(
  refs: Readonly<Record<LiquidationCohort, string>> = LIQUIDATION_LEG_SCALE_REF,
): Readonly<Record<LiquidationCohort, string>> {
  return { short: refs.long, long: refs.short };
}

/** The side (`up`/`down`) each cohort is drawn on, off its `scale_ref` alone. Throws when a ref is
 * not a scale of the fused pane, or when both legs landed on the same side. */
export function liquidationSidesOf(
  refs: Readonly<Record<LiquidationCohort, string>>,
): Readonly<Record<LiquidationCohort, LiquidationSide>> {
  const sideOf = (cohort: LiquidationCohort): LiquidationSide => {
    const side = liquidationSideOfScale(refs[cohort]);
    if (side === null) {
      throw new PaneRegistryError(`liquidation leg ${cohort} points at ${refs[cohort]}, not a scale of the liquidation pane`);
    }
    return side;
  };
  const sides = { short: sideOf("short"), long: sideOf("long") };
  if (sides.short === sides.long) {
    throw new PaneRegistryError(`both liquidation legs are on side ${sides.short}: one goes up, the other down`);
  }
  return sides;
}

/** The cohorts ordered top first (the `up` leg, then the `down` one), from the `scale_ref`s. */
export function liquidationCohortsTopFirst(
  refs: Readonly<Record<LiquidationCohort, string>> = LIQUIDATION_LEG_SCALE_REF,
): readonly LiquidationCohort[] {
  const sides = liquidationSidesOf(refs);
  return sides.short === "up" ? ["short", "long"] : ["long", "short"];
}

/** The marks scale on the same side as a leg's bars scale (`LIQUIDATION_SCALE_IDS`). */
export function liquidationMarksScaleOf(barsScaleRef: string): string {
  const side = liquidationSideOfScale(barsScaleRef);
  if (side === null) {
    throw new PaneRegistryError(`${barsScaleRef} is not a scale of the liquidation pane`);
  }
  return LIQUIDATION_SCALE_IDS[side].marks;
}

/** `primary`/`secondary` draw the DATA; the two marks draw the absence and the legitimate zero
 * of a `FLOW` series, which a bar of height zero cannot tell apart (`RN-4`). */
export type SeriesRole = "primary" | "secondary" | "absence_mark" | "zero_mark";

/** The series kinds `charts` renders (`ADR-003`: `charts` owns `kind`). */
export type SeriesKind = "candlestick" | "line" | "histogram";

/**
 * `T-03.11` (plan `03` item `3b.4`, `RF-8`) — the kind of the series that draws each pane's DATA
 * (its `primary` role). The OI pane is `candlestick` since this task: one candle of contracts per
 * bucket, green when `close > open`, red when `close < open` (`RF-9`), fed by the `oi_candles` the
 * route serves (`ADR-045/D2`). It was `line` from `T-02.4` until here.
 *
 * `SymbolClient.tsx`'s `OiPane` mounts the kind it reads HERE (`oiPaneSeriesKind`), so "o pane `oi`
 * passa de `line` para `candlestick` no registry" is this one value, and the ablation of `DoD-6`
 * (*"ao trocar a fonte do pane de volta para `line`, o candle some"*) is the same value flipped.
 * The other four panes mount their kind in their own component (phase `01` wiring); their entries
 * here are the DECLARATION the registry fixture validates, not a switch.
 */
export const F1_PANE_DATA_KIND: Readonly<Record<PaneId, SeriesKind>> = {
  price: "candlestick",
  liquidation: "histogram",
  oi: "candlestick",
  long_short: "line",
  cvd: "line",
};

/** The two kinds the OI pane can be mounted as. */
export type OiPaneSeriesKind = Extract<SeriesKind, "candlestick" | "line">;

/**
 * The kind the OI pane mounts: the registry's, or `line` under the e2e ablation (`?e2eOiLine=1`,
 * `DoD-6`). Throws when the registry names a kind the pane has no feed for — a `histogram` of open
 * interest would need the absence/zero marks of invariant (iii), which the pane does not build.
 */
export function oiPaneSeriesKind(lineAblation: boolean, registry: Readonly<Record<PaneId, SeriesKind>> = F1_PANE_DATA_KIND): OiPaneSeriesKind {
  if (lineAblation) {
    return "line";
  }
  const kind = registry.oi;
  if (kind !== "candlestick" && kind !== "line") {
    throw new PaneRegistryError(`the OI pane has no feed for kind ${kind}`);
  }
  return kind;
}

export interface PaneSeriesSpec {
  readonly role: SeriesRole;
  /** `sha256` of the `SeriesKey`, taken from the served catalog — never a literal. A mark
   * carries the id of the data series it marks. */
  readonly seriesKeyId: string;
  readonly kind: SeriesKind;
  /** The NAME of a price scale declared by `charts` — never a margin or a pixel. */
  readonly scaleRef: string;
  /** Which field of the pager's assembly feeds this series. */
  readonly slotsRef: string;
}

export interface PaneLegendSpec {
  /** The `seriesKeyId` whose `SeriesKey` names the pane. */
  readonly labelFrom: string;
  /** DERIVED — `resolvePaneLegend` writes it; invariant (iv) rejects anything else. */
  readonly label: string;
  /** DERIVED — the `nature` of `labelFrom`, which picks the reading function (`ADR-044/D2`). */
  readonly readingPolicy: Nature;
}

export interface PaneSpec {
  readonly paneId: PaneId;
  /** Relative height handed to `setStretchFactor`. The value is the `design_gate`'s. */
  readonly stretch: number;
  readonly series: readonly PaneSeriesSpec[];
  readonly legend: PaneLegendSpec;
  /** Key in `panelStatus`. */
  readonly statusRef: string;
  /** Key in `pager.panelCoverage`. */
  readonly coverageRef: string;
}

/** Position = `paneIndex`. */
export type PaneRegistry = readonly PaneSpec[];

/** The served catalog, keyed by `series_key_id` (hashed by the caller, see the module note). */
export type ServedCatalog = ReadonlyMap<string, SeriesCatalogEntry>;

/** How a pane's label is derived from its catalog entry. Injected so the legend task
 * (`T-01.6`) can pick the final form; the invariant only requires that it is a FUNCTION of the
 * key, so that changing the key changes the name (`CA-5`). */
export type PaneLabelDerivation = (entry: SeriesCatalogEntry) => string;

/** The default derivation: the full series label `STITCH_CONTEXT.md` §9 item 10 requires. */
export const DEFAULT_PANE_LABEL_DERIVATION: PaneLabelDerivation = buildSeriesLabel;

// ── Construction helpers ────────────────────────────────────────────────────────────────

export class PaneRegistryError extends Error {}

/**
 * Builds the legend of a pane FROM the catalog — the only sanctioned way to fill
 * `PaneLegendSpec.label`/`readingPolicy`.
 */
export function resolvePaneLegend(
  labelFrom: string,
  catalog: ServedCatalog,
  deriveLabel: PaneLabelDerivation = DEFAULT_PANE_LABEL_DERIVATION,
): PaneLegendSpec {
  const entry = catalog.get(labelFrom);
  if (entry === undefined) {
    throw new PaneRegistryError(`legend source ${labelFrom} is not in the served catalog`);
  }
  return { labelFrom, label: deriveLabel(entry), readingPolicy: entry.key.nature };
}

/** The `paneIndex` of `paneId` — its position in the registry. */
export function paneIndexOf(registry: PaneRegistry, paneId: PaneId): number {
  const index = registry.findIndex((pane) => pane.paneId === paneId);
  if (index < 0) {
    throw new PaneRegistryError(`pane ${paneId} is not in the registry`);
  }
  return index;
}

// ── Validation ──────────────────────────────────────────────────────────────────────────

/** Which invariant a violation breaks. `structure` covers the shape checks that are not one
 * of `SPEC-009` §5's five (empty registry, duplicate or malformed `paneId`, bad `stretch`). */
export type PaneInvariant = "structure" | "i" | "ii" | "iii" | "iv" | "v";

export interface PaneRegistryViolation {
  readonly invariant: PaneInvariant;
  /** `paneIndex` of the offending pane, or `null` when the violation is registry-wide. */
  readonly paneIndex: number | null;
  readonly message: string;
}

/** ASCII, lowercase English words joined by `_` — the form `SPEC-009` §5 fixes for `pane_id`. */
const PANE_ID_FORM = /^[a-z]+(?:_[a-z]+)*$/;

const DATA_ROLES: ReadonlySet<SeriesRole> = new Set<SeriesRole>(["primary", "secondary"]);

export interface RegistryValidationOptions {
  readonly catalog: ServedCatalog;
  readonly deriveLabel?: PaneLabelDerivation;
}

/**
 * Checks the registry against the structural rules and invariants (i)–(iv). Returns every
 * violation found — an empty array means the registry is valid. (v) needs the `setData`
 * payloads and is checked by `validateSetDataOnCanonicalGrid`.
 */
export function validatePaneRegistry(
  registry: PaneRegistry,
  options: RegistryValidationOptions,
): readonly PaneRegistryViolation[] {
  const { catalog } = options;
  const deriveLabel = options.deriveLabel ?? DEFAULT_PANE_LABEL_DERIVATION;
  const violations: PaneRegistryViolation[] = [];
  const report = (invariant: PaneInvariant, paneIndex: number | null, message: string): void => {
    violations.push({ invariant, paneIndex, message });
  };

  if (registry.length === 0) {
    report("structure", null, "the registry has no pane");
  }
  const seenPaneIds = new Map<string, number>();

  registry.forEach((pane, paneIndex) => {
    // ── structure ──
    if (!PANE_ID_FORM.test(pane.paneId)) {
      report("structure", paneIndex, `pane_id '${pane.paneId}' is not lowercase ASCII words joined by '_'`);
    }
    const firstIndex = seenPaneIds.get(pane.paneId);
    if (firstIndex !== undefined) {
      report("structure", paneIndex, `pane_id '${pane.paneId}' repeats the pane at index ${firstIndex}`);
    } else {
      seenPaneIds.set(pane.paneId, paneIndex);
    }
    if (!Number.isFinite(pane.stretch) || pane.stretch <= 0) {
      report("structure", paneIndex, `pane '${pane.paneId}' has stretch ${pane.stretch}; it must be a positive number`);
    }

    // ── (i) every seriesKeyId is in the served catalog ──
    pane.series.forEach((series, seriesIndex) => {
      if (!catalog.has(series.seriesKeyId)) {
        report(
          "i",
          paneIndex,
          `pane '${pane.paneId}' series ${seriesIndex} (${series.role}) points at ${series.seriesKeyId}, ` +
            "which the served catalog does not carry",
        );
      }
    });

    // ── (ii) at least one primary ──
    if (!pane.series.some((series) => series.role === "primary")) {
      report("ii", paneIndex, `pane '${pane.paneId}' has no primary series`);
    }

    // ── (iii′) every FLOW HISTOGRAM data series carries the absence_mark + zero_mark pair ──
    // `ADR-044/D3′`: the pair exists because a bar of height zero cannot be told apart from no bar.
    // A line (iii-b) is guarded by the lossless adapter's own test; a FLOW candlestick has no rule.
    pane.series.forEach((series, seriesIndex) => {
      if (!DATA_ROLES.has(series.role)) {
        return;
      }
      const entry = catalog.get(series.seriesKeyId);
      if (entry === undefined || entry.key.nature !== "FLOW") {
        return; // a missing entry is (i)'s violation, not this one
      }
      if (series.kind === "line") {
        return; // (iii-b): absence is whitespace from the lossless adapter, never a mark
      }
      if (series.kind === "candlestick") {
        report(
          "iii",
          paneIndex,
          `pane '${pane.paneId}' series ${seriesIndex} is a FLOW candlestick (${series.seriesKeyId}): ` +
            "no absence rule is classified for that kind (ADR-044/D3')",
        );
        return;
      }
      for (const markRole of ["absence_mark", "zero_mark"] as const) {
        const hasMark = pane.series.some(
          (candidate) => candidate.role === markRole && candidate.seriesKeyId === series.seriesKeyId,
        );
        if (!hasMark) {
          report(
            "iii",
            paneIndex,
            `pane '${pane.paneId}' series ${seriesIndex} is FLOW (${series.seriesKeyId}) and has no ${markRole}: ` +
              "absence and a legitimate zero would draw the same",
          );
        }
      }
    });

    // ── (iv) the legend is derived from the catalog, never written by hand ──
    const { legend } = pane;
    if (!pane.series.some((series) => series.seriesKeyId === legend.labelFrom)) {
      report("iv", paneIndex, `pane '${pane.paneId}' takes its legend from ${legend.labelFrom}, which it does not draw`);
    }
    const legendEntry = catalog.get(legend.labelFrom);
    if (legendEntry === undefined) {
      report("iv", paneIndex, `pane '${pane.paneId}' takes its legend from ${legend.labelFrom}, which is not in the catalog`);
    } else {
      const derived = deriveLabel(legendEntry);
      if (legend.label !== derived) {
        report(
          "iv",
          paneIndex,
          `pane '${pane.paneId}' label '${legend.label}' is not derived from its SeriesKey (expected '${derived}')`,
        );
      }
      if (legend.readingPolicy !== legendEntry.key.nature) {
        report(
          "iv",
          paneIndex,
          `pane '${pane.paneId}' reads as ${legend.readingPolicy} but its SeriesKey is ${legendEntry.key.nature}`,
        );
      }
    }
  });

  return violations;
}

/** One `setData` payload item as `lightweight-charts` receives it: UNIX SECONDS. */
export interface TimedItem {
  readonly time: number;
}

/**
 * The `setData` payloads of a chart, parallel to the registry: `payloads[paneIndex][seriesIndex]`
 * is what that series was (or is about to be) given.
 */
export type RegistryPayloads = readonly (readonly (readonly TimedItem[])[])[];

/**
 * Invariant (v): every series is handed EXACTLY the canonical grid — every `time` on the grid,
 * none missing, in grid order (`ADR-044/D2`, "exatamente com os `time` da grade canônica").
 *
 * `canonicalGridMs` is `buildCanonicalGrid`'s output (epoch milliseconds); the payload times are
 * UNIX SECONDS, as the lossless adapters emit them. The conversion happens here, once, because a
 * unit mismatch is exactly the kind of off-grid time this check exists to catch.
 */
export function validateSetDataOnCanonicalGrid(
  registry: PaneRegistry,
  payloads: RegistryPayloads,
  canonicalGridMs: readonly number[],
): readonly PaneRegistryViolation[] {
  const violations: PaneRegistryViolation[] = [];
  const gridSeconds = canonicalGridMs.map((ms) => ms / 1000);
  const onGrid = new Set(gridSeconds);

  if (payloads.length !== registry.length) {
    violations.push({
      invariant: "v",
      paneIndex: null,
      message: `${payloads.length} pane payload(s) for ${registry.length} pane(s)`,
    });
  }

  registry.forEach((pane, paneIndex) => {
    const panePayloads = payloads[paneIndex] ?? [];
    pane.series.forEach((series, seriesIndex) => {
      const where = `pane '${pane.paneId}' series ${seriesIndex} (${series.role})`;
      const items = panePayloads[seriesIndex];
      if (items === undefined) {
        violations.push({ invariant: "v", paneIndex, message: `${where} has no setData payload` });
        return;
      }
      const offGrid = items.filter((item) => !onGrid.has(item.time));
      if (offGrid.length > 0) {
        violations.push({
          invariant: "v",
          paneIndex,
          message:
            `${where} sets ${offGrid.length} time(s) off the canonical grid (first: ${offGrid[0].time}); ` +
            "each one inserts a logical index into every pane",
        });
        return;
      }
      const sameSequence =
        items.length === gridSeconds.length && items.every((item, slot) => item.time === gridSeconds[slot]);
      if (!sameSequence) {
        violations.push({
          invariant: "v",
          paneIndex,
          message:
            `${where} sets ${items.length} time(s) for a grid of ${gridSeconds.length}, ` +
            "not the grid in order: every slot must be present, absent ones as whitespace",
        });
      }
    });
  });

  return violations;
}

/** Throws with every violation listed when either check fails; returns silently otherwise. */
export function assertValidPaneRegistry(
  registry: PaneRegistry,
  options: RegistryValidationOptions,
): void {
  const violations = validatePaneRegistry(registry, options);
  if (violations.length > 0) {
    const lines = violations.map((v) => `(${v.invariant}) ${v.message}`);
    throw new PaneRegistryError(`invalid pane registry:\n${lines.join("\n")}`);
  }
}
