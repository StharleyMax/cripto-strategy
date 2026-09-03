/**
 * The BADGE (`selo`) — `SPEC-001` §6.1's four fields, and the three-level HOISTING
 * (`içamento`) that makes it cheap — `T-05.3`, plan `05` items 5.3+5.4.
 *
 * SCOPE, stated because the badge's full surface is bigger than what this module closes:
 * `SPEC-001` §6.1 describes the badge as it renders in the finished UI (ink color, the `~`
 * glyph, a guide-line pointing back to the real mark for `D5.2`). Wiring this into an actual
 * mounted chart component is a rendering task for later — `frontend/src/charts/` has zero
 * `.tsx` today (`T-05.1`/`T-05.2` are pure `.ts`, and there is no mounting code for a badge
 * to attach to yet). What THIS module closes is narrower and fully testable without a DOM:
 *
 *   1. the DATA MODEL for the four visible fields (`buildBadge` — série/idade/procedência/
 *      completude, §6.1's own vocabulary);
 *   2. the THREE-LEVEL envelope that keeps panel/session metadata OUT of every cell
 *      (`SessionEnvelope`/`PanelEnvelope`/`CellEnvelope`, `ADR-005`/D3);
 *   3. a falsifier proving the hoisted shape never repeats panel identity per cell
 *      (`CA-F4-14`'s "envelope completo por célula custa 519 B contra 54 B, 9,6×" argument
 *      — see `s2-badge.test.ts` for what is actually measured here, and why this module
 *      does not claim to reproduce that exact historical byte count: its schema is not in
 *      this repo, and re-deriving a number without the command that produced it is exactly
 *      what `CLAUDE.md` forbids).
 *
 * PURE — `ADR-003` FR-1: no I/O, no timers, no `Date.now()`. The caller always supplies
 * `referenceTimeMs` (`idade = tempo_de_referência − available_at`, NEVER `now − available_at`
 * — §6.1's own text, echoed in `ADR-005`'s consequence section). Composes on top of
 * `T-05.2`'s panels (`s2-panels.ts`, `s2-scalar-grid.ts`, `canonical-grid-chart-consumer.ts`)
 * without touching their grid/bucket-boundary arithmetic — this file only shapes the
 * metadata that travels ALONGSIDE a panel's slots, never the slots themselves.
 */

/** `procedência` — §6.1's four values, exactly. */
export type Provenance = "OBSERVADO" | "DERIVADO" | "MODELADO" | "HUMANO";

/** Only two bases license an idade READING (§6.1's idade row: "OBSERVED ... MODELED ..."). */
export type AgeBasis = "OBSERVED" | "MODELED";

/** Nível 1 — SESSÃO: 1× por TELA (`ADR-005`/D3's table, row "sessão"). */
export interface SessionEnvelope {
  readonly timezone: string;
  /** "agora" em `AO_VIVO`; `T` em `COMO_EM_T` — the same value `buildIdade` receives as `referenceTimeMs`. */
  readonly referenceTimeMs: number;
  readonly mode: "AO_VIVO" | "COMO_EM_T";
  readonly bundleVersion: string;
  readonly env: string;
  readonly principalId: string;
}

/**
 * `completude` (§6.1): grid series report `n lido/n esperado`; tick series have no
 * `n_expected`. `gapRuns` is the count of CONTIGUOUS missing regions, not `nEsperado -
 * nLido` — §6.1's own example, `285/288 · 1 lacuna`, is exactly the case that tells the two
 * apart: 3 missing points that are all ADJACENT are one gap, not three (see
 * `countGapRuns`/its falsifier in `s2-badge.test.ts` for the naive-subtraction bug this
 * distinction exists to avoid).
 */
export type PanelCompletude =
  | { readonly kind: "grid"; readonly nLido: number; readonly nEsperado: number; readonly gapRuns: number }
  | { readonly kind: "tick"; readonly gapCount: number };

/**
 * Counts CONTIGUOUS runs of `null` in `values` — one adjacent block of missing slots is one
 * `lacuna`, no matter how many slots wide. Mirrors the shape `ScalarSlot`/`GridSlot` already
 * use (`value`/`candle` is `null` for an explicit gap), so a caller can pass
 * `panel.slots.map((s) => s.value)` straight through without re-deriving gap positions.
 */
export function countGapRuns(values: readonly (unknown | null)[]): number {
  let runs = 0;
  let inGap = false;
  for (const v of values) {
    if (v === null) {
      if (!inGap) {
        runs += 1;
        inGap = true;
      }
    } else {
      inGap = false;
    }
  }
  return runs;
}

/**
 * Nível 2 — PAINEL: 1× por PAINEL (`ADR-005`/D3's table, row "painel"). Never copied onto a
 * cell — that copy is exactly the rejected alternative `denormalizeCell` exists to measure.
 */
export interface PanelEnvelope {
  /** "OI", "CVD", "Preço" — §6.1: "as strings ... sozinhas não existem na UI", only via `buildSerieLabel`. */
  readonly metric: string;
  readonly qualifier: string;
  readonly symbol: string;
  readonly source: string;
  readonly unit: string;
  readonly denom: string | null;
  readonly provenance: Provenance;
  readonly labelShiftMs: number | null;
  readonly universe: string;
  readonly completude: PanelCompletude;
}

/**
 * Nível 3 — CÉLULA: por PONTO (`ADR-005`/D3's table, row "célula": "`(valor | ausência,
 * event_time, available_at)` + referência à coluna"). Deliberately only 5 fields — anything
 * that does not vary point-to-point belongs on `PanelEnvelope`/`SessionEnvelope` instead.
 */
export interface CellEnvelope {
  /** `null` = ausência (an explicit gap, never fabricated — same posture as `ScalarSlot`). */
  readonly value: number | null;
  readonly eventTimeMs: number;
  /** `null` = `lag_ms` não medido → idade "`?`" (§6.1). Distinct from `value === null` (absence of DATA, not of AGE). */
  readonly availableAtMs: number | null;
  readonly ageBasis: AgeBasis;
  /** Referência à coluna/painel — an id, NOT the panel repeated (`CA-F4-14`). */
  readonly columnRef: string;
}

// ── The badge's four visible fields ──────────────────────────────────────────────────────

export type IdadeDisplay =
  | { readonly kind: "absent" } // fora da borda direita do tempo — zero carimbo, "e isso está certo" (ADR-005)
  | { readonly kind: "unknown" } // "idade ?"
  | { readonly kind: "observed"; readonly ageMs: number }
  | { readonly kind: "modeled"; readonly ageMs: number };

export interface Badge {
  readonly serie: string;
  readonly idade: IdadeDisplay;
  readonly procedencia: Provenance;
  readonly completude: string;
}

export class NegativeAgeError extends RangeError {}

/** §6.1: `OI · grade 5m · BTC · bn-dump` — never the bare metric name. */
export function buildSerieLabel(panel: PanelEnvelope): string {
  return `${panel.metric} · ${panel.qualifier} · ${panel.symbol} · ${panel.source}`;
}

/** §6.1: `285/288 · 1 lacuna` for grid series; `contiguidade (N saltos de agg_id)` for tick series. */
export function buildCompletudeLabel(completude: PanelCompletude): string {
  if (completude.kind === "tick") {
    return `contiguidade (${completude.gapCount} saltos de agg_id)`;
  }
  const suffix = completude.gapRuns > 0 ? ` · ${completude.gapRuns} ${completude.gapRuns === 1 ? "lacuna" : "lacunas"}` : "";
  return `${completude.nLido}/${completude.nEsperado}${suffix}`;
}

/**
 * `isRightEdge` — true only when this cell sits at the visible right edge of time. `ADR-005`'s
 * consequence: "se `viewport_fim < agora − cadência_nativa`, o chip de idade é substituído
 * pelo rótulo absoluto ... um gráfico de 3 dias tem zero carimbos de idade, e isso está
 * certo" — so a caller viewing a fully-historical window passes `isRightEdge = false` for
 * every cell, never fabricating an age for a bucket nowhere near "now"/`T`.
 *
 * `session.referenceTimeMs` IS `tempo_de_referência` (`T` under `COMO EM T`) — this function
 * never reads a clock itself, which is what makes `idade = tempo_de_referência − available_at`
 * (never `now − available_at`) a property of the CALLER's discipline, not an accident of
 * whichever line happened to run last.
 */
export function buildIdade(session: SessionEnvelope, cell: CellEnvelope, isRightEdge: boolean): IdadeDisplay {
  if (!isRightEdge) {
    return { kind: "absent" };
  }
  if (cell.availableAtMs === null) {
    return { kind: "unknown" };
  }
  const ageMs = session.referenceTimeMs - cell.availableAtMs;
  if (ageMs < 0) {
    throw new NegativeAgeError(
      `availableAtMs (${cell.availableAtMs}) is after referenceTimeMs (${session.referenceTimeMs}) — ` +
        "idade = tempo_de_referência − available_at can never be negative under COMO EM T " +
        "(SPEC-001 §6.1); the caller passed an available_at from the future relative to T",
    );
  }
  return cell.ageBasis === "OBSERVED" ? { kind: "observed", ageMs } : { kind: "modeled", ageMs };
}

export function buildBadge(
  session: SessionEnvelope,
  panel: PanelEnvelope,
  cell: CellEnvelope,
  isRightEdge: boolean,
): Badge {
  return {
    serie: buildSerieLabel(panel),
    idade: buildIdade(session, cell, isRightEdge),
    procedencia: panel.provenance,
    completude: buildCompletudeLabel(panel.completude),
  };
}

function formatAgeMs(ageMs: number): string {
  const totalSeconds = Math.floor(ageMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Plain-text form of `idade` — §6.1's ink distinction (OBSERVED = tinta normal, MODELED =
 * tinta fraca com `~`) is a rendering property this function only half-carries: it emits the
 * `~` glyph (the part that survives to plain text) and leaves the ink color itself to
 * whatever renders `Badge` later.
 */
export function formatIdade(idade: IdadeDisplay): string {
  switch (idade.kind) {
    case "absent":
      return "";
    case "unknown":
      return "idade ?";
    case "observed":
      return formatAgeMs(idade.ageMs);
    case "modeled":
      return `~${formatAgeMs(idade.ageMs)}`;
  }
}

// ── Içamento como mecanismo de custo — o falsificador (`ADR-005`/D3, `CA-F4-14`) ─────────

/** `CA-F4-14` / `ADR-005`/D3: "na tela de 570 × 6 células". */
export const SCREEN_WIDTH_CELLS = 570;
export const SCREEN_PANEL_COUNT = 6;
/** 570 × 6 = 3.420 — the exact count `tasks_review.md`'s `T-05.3` line names ("afirmado 3.420 vezes por tela"). */
export const SCREEN_TOTAL_CELLS = SCREEN_WIDTH_CELLS * SCREEN_PANEL_COUNT;

export interface HoistedScreen {
  readonly session: SessionEnvelope;
  /** Length is ALWAYS `SCREEN_PANEL_COUNT` — panel identity is asserted once per panel, never once per cell. */
  readonly panels: readonly PanelEnvelope[];
  /** Length is ALWAYS `SCREEN_TOTAL_CELLS`; no element carries panel identity (see `CellEnvelope`). */
  readonly cells: readonly CellEnvelope[];
}

/**
 * Assembles one screen's worth of hoisted data. Refuses a shape that does not match the
 * `570 × 6` contract this module documents, rather than silently accepting a different
 * screen size and mislabeling the falsifier below.
 */
export function buildHoistedScreen(
  session: SessionEnvelope,
  panels: readonly PanelEnvelope[],
  cellsByPanelIndex: ReadonlyMap<number, readonly CellEnvelope[]>,
): HoistedScreen {
  if (panels.length !== SCREEN_PANEL_COUNT) {
    throw new RangeError(
      `expected ${SCREEN_PANEL_COUNT} panels (CA-F4-14's "tela de 570×6"), got ${panels.length}`,
    );
  }
  const cells: CellEnvelope[] = [];
  panels.forEach((_panel, panelIndex) => {
    const panelCells = cellsByPanelIndex.get(panelIndex) ?? [];
    if (panelCells.length !== SCREEN_WIDTH_CELLS) {
      throw new RangeError(
        `panel ${panelIndex}: expected ${SCREEN_WIDTH_CELLS} cells (CA-F4-14's "tela de 570×6"), ` +
          `got ${panelCells.length}`,
      );
    }
    cells.push(...panelCells);
  });
  return { session, panels, cells };
}

/**
 * The REJECTED alternative — `ADR-005`'s "Envelope completo por célula" (the same row
 * `s2-badge.ts`'s module docstring cites for CA-F4-14's 9,6× argument). Built ONLY so
 * `s2-badge.test.ts` can measure it; no production caller in this repo constructs one — a
 * cell that inlines the panel identity `PanelEnvelope` exists precisely to keep off the cell.
 */
export interface DenormalizedCell {
  readonly metric: string;
  readonly qualifier: string;
  readonly symbol: string;
  readonly source: string;
  readonly unit: string;
  readonly denom: string | null;
  readonly provenance: Provenance;
  readonly value: number | null;
  readonly eventTimeMs: number;
  readonly availableAtMs: number | null;
}

export function denormalizeCell(panel: PanelEnvelope, cell: CellEnvelope): DenormalizedCell {
  return {
    metric: panel.metric,
    qualifier: panel.qualifier,
    symbol: panel.symbol,
    source: panel.source,
    unit: panel.unit,
    denom: panel.denom,
    provenance: panel.provenance,
    value: cell.value,
    eventTimeMs: cell.eventTimeMs,
    availableAtMs: cell.availableAtMs,
  };
}

/** UTF-8 byte length of a value's JSON encoding — the unit `ADR-005`/D3's "519 B"/"54 B" are in. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
