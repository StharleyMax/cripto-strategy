/**
 * `T-03.12` (`paineis-de-fluxo`, plan `03` item `3b.5`, `Q-OI-3`, `[Q-DG-3]`) — what the OI pane marks
 * about the REGIME its candles come from, derived from the served candles and nothing else.
 *
 * The form is `gates/T-03.12-design-gate.md` (`ui-designer`, `APPROVED` by `ux-ui-mastery` in its
 * §8-r3); the domain limits are `handoff/T-03.12-quant-architect.md` (R1–R5, V1–V8). This module is
 * the executable half of the gate's §3 items 1 and 5 — pure, no DOM, no library — and
 * `SymbolClient.tsx` only draws what it returns.
 *
 * ── THE THREE CHANNELS (`DG-5`, `R3`), AND WHY THEY ARE INDEPENDENT ─────────────────────────────
 *
 * Over each consecutive pair `(a, b)` of served candles, with `w(df) = sources[df].bucket_interval_ms`:
 *
 *   - `change = a.derived_from ≠ b.derived_from`;
 *   - `gap    = b.bucket_end_ms − a.bucket_end_ms > w(b.derived_from)`.
 *
 * and three lists come out, each answering ONE question:
 *
 *   - RULES — *"the source changed here"*: one per pair with `change`, WITHOUT looking at `gap`
 *     (`N-1`: a change that coincides with a hole is both, and the hole must not erase the rule).
 *   - BANDS — *"a pre-capture candle that was served measures this minute"*: the maximal runs of
 *     `binance_point_5m` candles with neither `change` nor `gap` between them. A hole BREAKS a band.
 *   - blank outside a band — *"no served candle measures this slot"*: not a list, it is what is left.
 *
 * ── WHERE A BAND STARTS (`N-5`) ───────────────────────────────────────────────────────────────
 *
 * A candle at `bucket_end_ms = T1` measures `(T1 − w, T1]`. So a band is
 * `(max(first.bucket_end_ms − w(A), prev.bucket_end_ms), last.bucket_end_ms]`: the first candle of
 * the run covers ITS OWN interval too (in `1m`, the 4 slots before it), by the same argument that
 * shades the blanks between two of its candles; and the cut at `prev` (the served candle before the
 * run) keeps a band from ever covering a slot a candle of another regime served.
 *
 * ── WHAT THIS MODULE REFUSES (the vetoes of the quant, `V1`–`V8`) ───────────────────────────────
 *
 * It never repeats, interpolates or carries a candle into another slot, never moves a candle off
 * `bucket_end_ms`, never links two candles, and never marks an instant written by hand: every mark
 * is a function of `derived_from` on the served candles (`V7`). It does not colour anything.
 *
 * ── `hlUnmeasured` (`DG-4`, `R4`, `N-7`) ─────────────────────────────────────────────────────────
 *
 * `oi_candle.py:336-351`: `high = max({open} ∪ S)`, `low = min({open} ∪ S)`, with `open = p(T0)` when
 * the reading at `T0` exists. With at most 2 readings in `{open} ∪ S` the set IS `{O, C}`, and `H`/`L`
 * equal `O`/`C` BY CONSTRUCTION — a legend that prints them as numbers states *"no excursion"* where
 * nothing was measured. The readings are `samples.present` plus the anchor, and the anchor exists
 * iff `open_at_ms == bucket_end_ms − bucket_interval_ms` (the samples lie in `(T0, T1]`,
 * `oi_candle.py:306`) — `[MEDIDO pelo validador: 9.610/9.610 velas, bruto == servido]`.
 *
 * Browser-safe: imported by the client, pulls nothing server-side.
 */

import { nativeGridTerm } from "./oi-candle-pane.ts";
import type { OiCandleSource, OiCandleSourceWire, OiCandleWire } from "./series-history-envelope.ts";

/**
 * The regime the band marks: the historical series (`openInterestHist`), before the 1-minute polling
 * existed — `DG-1`: *"toda sequência de candles consecutivos com `derived_from = binance_point_5m`"*.
 * Typed against the closed enum, so a rename of the wire value is a compile error here.
 *
 * Why the band marks THIS regime and not the other (`DG-1`, refused alternative "faixa em B"): the
 * polled regime is the current one and the default from here on; marking the normal would shade the
 * whole screen in daily use.
 */
export const OI_PRE_CAPTURE_SOURCE: OiCandleSource = "binance_point_5m";

export class OiRegimeMarksError extends Error {}

/** The declared source of `derivedFrom`; throws when no source declares it (never a guessed width). */
function sourceOf(derivedFrom: OiCandleSource, sources: readonly OiCandleSourceWire[]): OiCandleSourceWire {
  const source = sources.find((candidate) => candidate.derived_from === derivedFrom);
  if (source === undefined) {
    throw new OiRegimeMarksError(`derived_from ${derivedFrom} is not declared by any source of this block`);
  }
  return source;
}

/** A regime band: the interval `(leftExclusiveMs, rightInclusiveMs]` a run of pre-capture candles measures. */
export interface OiRegimeBand {
  readonly leftExclusiveMs: number;
  readonly rightInclusiveMs: number;
  readonly derivedFrom: OiCandleSource;
  /** How many served candles the band holds. */
  readonly candles: number;
}

/** A boundary rule between two consecutive served candles of different `derived_from`. */
export interface OiRegimeRule {
  /** The instant whose slot's RIGHT edge the rule is drawn at — the band's edge, on the band's side. */
  readonly atMs: number;
  readonly from: OiCandleSource;
  readonly to: OiCandleSource;
}

/** A stretch a label may name: a band of the pre-capture regime, or a run of any other regime. */
export interface OiRegimeLabelSpan {
  readonly leftExclusiveMs: number;
  readonly rightInclusiveMs: number;
  readonly derivedFrom: OiCandleSource;
  /** `amostras <term>`, the term off the source's `native_grid_ms` (`nativeGridTerm`, never by enum). */
  readonly text: string;
}

export interface OiRegimeMarks {
  readonly bands: readonly OiRegimeBand[];
  readonly rules: readonly OiRegimeRule[];
  readonly labelSpans: readonly OiRegimeLabelSpan[];
}

export const NO_OI_REGIME_MARKS: OiRegimeMarks = { bands: [], rules: [], labelSpans: [] };

/** `DG-3`: the label of a stretch — the SAME cadence term the `DERIVADO` label prints. */
export function oiRegimeLabelText(source: OiCandleSourceWire): string {
  return `amostras ${nativeGridTerm(source.native_grid_ms)}`;
}

/**
 * The bands, rules and label spans of the served candles, in the order served (ascending
 * `bucket_end_ms`, which `parseOiCandlesBlock` already enforces).
 */
export function oiRegimeMarks(candles: readonly OiCandleWire[], sources: readonly OiCandleSourceWire[]): OiRegimeMarks {
  if (candles.length === 0) {
    return NO_OI_REGIME_MARKS;
  }
  const bands: OiRegimeBand[] = [];
  const rules: OiRegimeRule[] = [];
  const runs: { derivedFrom: OiCandleSource; leftExclusiveMs: number; rightInclusiveMs: number }[] = [];
  let band: { leftExclusiveMs: number; rightInclusiveMs: number; candles: number } | null = null;
  const closeBand = () => {
    if (band !== null) {
      bands.push({ ...band, derivedFrom: OI_PRE_CAPTURE_SOURCE });
      band = null;
    }
  };
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const previous = index === 0 ? null : candles[index - 1]!;
    const width = sourceOf(candle.derived_from, sources).bucket_interval_ms;
    const ownLeftMs = candle.bucket_end_ms - width;
    const leftExclusiveMs = previous === null ? ownLeftMs : Math.max(ownLeftMs, previous.bucket_end_ms);
    const change = previous !== null && previous.derived_from !== candle.derived_from;
    const gap = previous !== null && candle.bucket_end_ms - previous.bucket_end_ms > width;
    if (change) {
      // A→B at the band's right edge (the last A candle's slot); B→A at the left edge of the band
      // that starts at `b`. Either way on the band's edge, and never at an instant written by hand.
      rules.push({
        atMs: candle.derived_from === OI_PRE_CAPTURE_SOURCE ? leftExclusiveMs : previous!.bucket_end_ms,
        from: previous!.derived_from,
        to: candle.derived_from,
      });
    }
    if (previous === null || change) {
      runs.push({ derivedFrom: candle.derived_from, leftExclusiveMs, rightInclusiveMs: candle.bucket_end_ms });
    } else {
      runs[runs.length - 1]!.rightInclusiveMs = candle.bucket_end_ms;
    }
    if (candle.derived_from !== OI_PRE_CAPTURE_SOURCE) {
      closeBand();
      continue;
    }
    if (band !== null && !change && !gap) {
      band.rightInclusiveMs = candle.bucket_end_ms;
      band.candles += 1;
    } else {
      closeBand();
      band = { leftExclusiveMs, rightInclusiveMs: candle.bucket_end_ms, candles: 1 };
    }
  }
  closeBand();
  // A label names a BAND for the pre-capture regime (one per band, `DG-3`: *"cada faixa"*), and a
  // RUN for any other regime (*"o trecho de B"*).
  const labelSpans: OiRegimeLabelSpan[] = [
    ...bands.map((each) => ({
      leftExclusiveMs: each.leftExclusiveMs,
      rightInclusiveMs: each.rightInclusiveMs,
      derivedFrom: each.derivedFrom,
      text: oiRegimeLabelText(sourceOf(each.derivedFrom, sources)),
    })),
    ...runs
      .filter((run) => run.derivedFrom !== OI_PRE_CAPTURE_SOURCE)
      .map((run) => ({ ...run, text: oiRegimeLabelText(sourceOf(run.derivedFrom, sources)) })),
  ].sort((left, right) => left.leftExclusiveMs - right.leftExclusiveMs);
  return { bands, rules, labelSpans };
}

/**
 * `data-oi-regime-bands-at` (`gate §3 item 7`): every band as `<leftExclMs>-<rightInclMs>`, comma
 * separated — the interval of the band, not the slot of its first candle.
 */
export function oiRegimeBandsAtFact(marks: OiRegimeMarks): string {
  return marks.bands.map((band) => `${band.leftExclusiveMs}-${band.rightInclusiveMs}`).join(",");
}

/**
 * `DG-4` (r3, `N-7`) — `H` and `L` of this candle are NOT a measured range: the bucket had at most two
 * readings (`samples.present` plus the anchor `p(T0)`), so `{H, L} = {O, C}` by construction.
 *
 * ⛔ WHAT IT DOES NOT LOOK AT: `samples.expected` (the r2 trigger `expected == 1` missed 8 real
 * candles, the `15m` island of 09-27T11:45Z among them, `N-7`), nor the VALUE of `H`/`L` (a trigger
 * by value mistakes *"not measured"* for *"measured and monotone"* — 496 real candles of ≥ 3 readings
 * have no wick and ARE measured). The width of the anchor term is `bucket_interval_ms`, never
 * `native_grid_ms` (`O-5` of the validator: the swap keeps the total and moves 7 candles each way).
 */
export function hlUnmeasured(candle: OiCandleWire, sources: readonly OiCandleSourceWire[]): boolean {
  const bucketStartMs = candle.bucket_end_ms - sourceOf(candle.derived_from, sources).bucket_interval_ms;
  const anchor = candle.open_at_ms === bucketStartMs ? 1 : 0;
  return candle.samples.present + anchor <= 2;
}

// ── Where the labels go, once the pane knows its x coordinates ───────────────────────────────────

/** A label placed on the pane: `leftPx` from the plot's left edge, the span it names, and its text. */
export interface PlacedOiRegimeLabel {
  readonly derivedFrom: OiCandleSource;
  readonly text: string;
  readonly leftPx: number;
}

/** Padding between a band's visible left edge and its label (`DG-3`: *"+ 4 px"*). */
export const OI_REGIME_LABEL_INSET_PX = 4;
/** A band narrower than its label plus this gets no label (`DG-3`: *"rótulo + 8 px"*). */
export const OI_REGIME_LABEL_CLEARANCE_PX = 8;

/**
 * `DG-3`: which label spans get a label, and where. `edgePx(ms)` is the x of the RIGHT edge of the
 * slot at `ms` (so `(leftExcl, rightIncl]` spans `edgePx(leftExcl)`..`edgePx(rightIncl)`); `widthPx`
 * the plot's width; `labelWidthPx(text)` the rendered width of a label.
 *
 *   - a span is drawn only where it is VISIBLE (clipped to `[0, widthPx]`), and its label sits at the
 *     visible left edge + 4 px — grudado, so a screen entirely inside a band still says what it is;
 *   - the pre-capture regime is always labelled; any other regime only when ≥ 2 regimes are visible
 *     (with only the polled regime on screen, the daily use, there is no label at all);
 *   - a span narrower than its label + 8 px gets none (the `15m` island: the band and the two rules
 *     stay, the `DERIVADO` under the crosshair still says `5m`, `O-4`).
 */
export function placeOiRegimeLabels(
  spans: readonly OiRegimeLabelSpan[],
  edgePx: (ms: number) => number,
  widthPx: number,
  labelWidthPx: (text: string) => number,
): readonly PlacedOiRegimeLabel[] {
  const visible = spans
    .map((span) => ({
      span,
      leftPx: Math.max(0, edgePx(span.leftExclusiveMs)),
      rightPx: Math.min(widthPx, edgePx(span.rightInclusiveMs)),
    }))
    .filter(({ leftPx, rightPx }) => rightPx > leftPx);
  const regimes = new Set(visible.map(({ span }) => span.derivedFrom));
  return visible
    .filter(({ span }) => span.derivedFrom === OI_PRE_CAPTURE_SOURCE || regimes.size >= 2)
    .filter(({ span, leftPx, rightPx }) => rightPx - leftPx >= labelWidthPx(span.text) + OI_REGIME_LABEL_CLEARANCE_PX)
    .map(({ span, leftPx }) => ({ derivedFrom: span.derivedFrom, text: span.text, leftPx: leftPx + OI_REGIME_LABEL_INSET_PX }));
}
