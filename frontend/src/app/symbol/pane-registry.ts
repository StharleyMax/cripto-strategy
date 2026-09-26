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
  buildSeriesLabel,
  type Nature,
  type SeriesCatalogEntry,
} from "../../features/s3-inspector/series-catalog.ts";

// ── Shape ───────────────────────────────────────────────────────────────────────────────

/**
 * The stable, ASCII, English pane keys of phase `01` (`SPEC-009` §5). Phase `04` fuses the two
 * liquidation legs into one `liquidation` pane; until then they are two panes.
 */
export type PaneId = "price" | "liquidation_long" | "liquidation_short" | "oi" | "long_short" | "cvd";

/**
 * The top-to-bottom order of the six panes of phase `01`: price+volume · liquidations · OI ·
 * long/short · CVD (`SPEC-009` §5, `RF-1`, the same order the `design_gate`'s weights in
 * `handoff/DESIGN-LAYOUT.md` §6 name). The final value is the `design_gate`'s; this constant is
 * the one place it is written.
 */
export const F1_PANE_ORDER: readonly PaneId[] = [
  "price",
  "liquidation_long",
  "liquidation_short",
  "oi",
  "long_short",
  "cvd",
];

/**
 * `T-01.6` — the relative height of each pane of phase `01`, handed to `setStretchFactor`
 * (`handoff/DESIGN-LAYOUT.md` §6, row "altura"; `SPEC-009` §3).
 *
 * The `design_gate` approved **34 · 11 · 15 · 9 · 9 · 9 · 9** for SEVEN panes (price · liquidations ·
 * OI · L/S · funding · CVD delta · CVD cumulative). Phase `01` has SIX: funding is `NG-3` and the CVD
 * stays one pane (`NG-5`), and the liquidation is TWO panes until phase `04` fuses it (`R-2` of
 * `tasks_review.md`). `SPEC-009` §3: "os 6 panes da F1 recebem os pesos correspondentes,
 * renormalizados" — `setStretchFactor` is relative, so renormalizing is only the choice of which
 * weight each F1 pane corresponds to:
 *
 *   - `liquidation_long` / `liquidation_short` → **11 each**, not 5,5. Not a taste: at 5,5 the
 *     lightest pane binds the 72px floor at a chart of `72 × 83,5 / 5,5 ≈ 1.093px` of panes, past the
 *     1.024px viewport the same gate asked the stack to fit without scrolling (§9 item 16(l)); at 11
 *     the floor binds at `72 × 89 / 9 = 712px`. The two approved constraints leave only this value.
 *   - `cvd` → **9**, the weight of a line pane (the floor was specified "por pane de linha").
 *
 * ⚠️ `[INFERRED]`, and it is a PROPOSAL: `R-2` says the renormalization is the `design_gate`'s, decided
 * in this task. A builder cannot dispatch the gate from inside a task (no nested agents); the
 * argument above is written so the `ui-designer` + `ux-ui-mastery` can accept or overturn it on the
 * screenshot of `T-01.11` without re-deriving it. Changing a value here is the whole change.
 */
export const F1_PANE_STRETCH: Readonly<Record<PaneId, number>> = {
  price: 34,
  liquidation_long: 11,
  liquidation_short: 11,
  oi: 15,
  long_short: 9,
  cvd: 9,
};

/**
 * `T-01.6` — the `data-testid` of the ROOT of a pane's DOM layer, derived from its `pane_id`
 * (`SPEC-009` §3: "os `data-testid` atuais sobrevivem, derivados de `pane_id`, na raiz da camada").
 *
 * The rule is `<pane_id with "-" for "_">-pane`, which reproduces every testid the e2e suite already
 * reads (`price-pane`, `oi-pane`, `cvd-pane`, `long-short-pane`). The two liquidation legs are the
 * one exception, and it is inherited, not chosen: until phase `04` fuses them their layers are the
 * two cohort groups `e2e/13` has always read, `liquidation-cohort-<cohort>`.
 */
export function paneLayerTestId(paneId: PaneId): string {
  switch (paneId) {
    case "liquidation_long":
      return "liquidation-cohort-long";
    case "liquidation_short":
      return "liquidation-cohort-short";
    default:
      return `${paneId.replace(/_/g, "-")}-pane`;
  }
}

/** `primary`/`secondary` draw the DATA; the two marks draw the absence and the legitimate zero
 * of a `FLOW` series, which a bar of height zero cannot tell apart (`RN-4`). */
export type SeriesRole = "primary" | "secondary" | "absence_mark" | "zero_mark";

/** The series kinds `charts` renders (`ADR-003`: `charts` owns `kind`). */
export type SeriesKind = "candlestick" | "line" | "histogram";

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
