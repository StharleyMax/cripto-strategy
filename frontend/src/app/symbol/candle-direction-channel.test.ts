/**
 * `T-01.10`'s `design_gate` fix — THE CHANNEL PRICE DIRECTION TRAVELS ON, MEASURED AS PAINT.
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT REPLACES ──────────────────────────────────────────────
 *
 * The `design_gate` of `T-01.10` returned `NEEDS_FIX` with two blockers and one serious finding
 * about the instrument itself
 * (`docs/context/candle-real-e-eixo-unico/gates/T-01.10-designgate.md`):
 *
 *   `[BLOCKER-1]` direction travelled by HUE ONLY. `#089981` and `#f23645` are `135` and `129`
 *                 in grayscale — a ratio of `1,092:1`, the number `ADR-010:113` publishes. In
 *                 grayscale the rise and the fall were the SAME MARK ⇒ WCAG SC 1.4.1, level A.
 *   `[BLOCKER-2]` the DOJI was painted as a RISE, byte for byte, because the library resolves
 *                 `isUp = open <= close` (`dist/lightweight-charts.development.mjs:2811`). That
 *                 is not a poor channel, it is a FALSE statement: `ADR-010:110` says
 *                 `CRUZ (doji) = close == open ⇒ DIREÇÃO NÃO AFIRMADA`.
 *   `[SERIOUS-1]` the test that was supposed to guard this — a `deepEqual` over the 6 style
 *                 fields — was GREEN with both defects present, because none of its assertions
 *                 measured SHAPE. A test that passes identically with the defect present is not
 *                 evidence, and replacing it is half of this file's job.
 *
 * So nothing here asserts over a style object. Every number below comes out of the
 * `CanvasRenderingContext2D` the library actually paints into, on the PRODUCTION render path:
 * `installGlobals` + `chartConstructorOptions` + `candlestickSeriesColors` +
 * `candlestickSeriesLossless`, all imported from `src/`, none re-implemented here.
 *
 * ── `[SERIOUS-1-REGATE]`: THE SECOND ROUND, AND IT WAS THIS FILE THAT FAILED ────────────────
 *
 * The re-gate of `2026-09-19` returned `APPROVED` for the SCREEN and a should-fix for THIS
 * INSTRUMENT (`gates/T-01.10-regate-validador.md` §4.2/§4.4). The accusation, raised by
 * `ux-ui-mastery:accessibility-check` in a separate process and confirmed by the validator:
 *
 *   (a) the ablation replaced TWO LITERAL HEXES (`089981`, `f23645`). `#8b949e` — the doji —
 *       went through untouched, so the doji stayed distinct BY COLOR on a test that claimed to
 *       have removed color. Under a TRUE luminance grayscale the doji is `#939393` against the
 *       fall's `#818181`: `1,27:1`, the same mark for any practical purpose.
 *   (b) `signature()` was `op:color`. It carried NO GEOMETRY, so the one channel that does
 *       separate the doji without color could not even be expressed.
 *
 * Both are fixed here, and neither fix touches `src/` — the render rule was right, the guard
 * was weak:
 *
 *   `grayAblate`      -> WCAG relative luminance, applied to EVERY hex `src/` sends to the
 *                        canvas (series style, per-item overrides AND the chart options), each
 *                        hex replaced by the gray of the SAME luminance. No literal survives.
 *   `signature`       -> `op:width×height:color`. Geometry first.
 *   `colorBlindClass` -> geometry + body OPACITY, with color DISCARDED rather than grayed. This
 *                        is what `D3` now rests on, and it is the whole point: `fall` and `doji`
 *                        must separate with no color at all.
 *
 * ⚠️ THE DOJI'S SHAPE IS A PROPERTY OF THE DATA, NOT OF THE FIX, and this file says so rather
 * than letting the reader infer a stronger claim: `open === close` is a zero-height body, which
 * the library draws as a 1 px trace instead of the `w3:h32` rectangle a rise or a fall emits, so
 * the doji reads as a LINE and the fall as a BLOCK on a monochrome screen. That is true in the
 * legacy run too (`D4`). What `D6` guards is the REGRESSION: a doji that starts emitting a body.
 *
 * ── THE FALSIFIER PAIRS, AND THEY ARE THE POINT ─────────────────────────────────────────────
 *
 * Every claim is measured twice — once against production and once against something that must
 * FAIL it:
 *
 *   `D3`/`D4`  `LEGACY_HUE_ONLY_STYLE`, the exact style this fix replaced, as a NEGATIVE
 *              CONTROL: with color discarded its rise and its fall are the SAME MARK, which is
 *              `BLOCKER-1` reproduced without any ablation at all; and its doji carries the
 *              rise's colors byte for byte, which is `BLOCKER-2`.
 *   `D6`       a MUTANT doji that emits a body. `assertDojiEmitsNoBody` is applied to both: it
 *              CALA on production and MORDE on the mutant. And the same test measures that the
 *              OLD instrument — a color-only signature — stays GREEN on that mutant, which is
 *              exactly the blind spot `[SERIOUS-1-REGATE]` named.
 *
 * ── `[SERIOUS-2]`: WHERE THE MEASUREMENT IS TAKEN, AND WHY IT IS NOT THE DEFAULT VIEW ───────
 *
 * The gate also measured that the shape channel does not EXIST below ~3.5 px/bar: the library
 * skips the body fill entirely unless `barWidth > borderWidth * 2`
 * (`:14761`), so a hollow candle at the default `fitContent()` over `5.760` slots
 * (`barSpacing` = `0,500 px`) paints no interior at all and the correction would be invisible.
 * An assertion taken there would pass while proving nothing — the defect class `MEMORY.md`
 * records as *"assert de DOM não prova pixel"*.
 *
 * This file therefore asserts at `LEGIBLE_BAR_COUNT` bars, REFUSES the run if the resulting bar
 * spacing is under `INTERIOR_THRESHOLD_PX`, and pins the default-view number as a separate,
 * explicitly non-passing measurement. Choosing the default view's density is NOT this task's —
 * it is `T-05.3`+/chrome's, as `s2-headless-run.ts:101-111` already states.
 *
 * ⚠️ WHAT THIS FILE DOES NOT CLAIM: it does not rasterize. `jsdom` has no 2D backend, so what is
 * recorded is the sequence of drawing CALLS and the colors set on them — what the library asks
 * the canvas to do. The browser half is `T-01.11`'s e2e against the real app.
 *
 * ⚠️ `localization: { locale: "en-US" }` is added to the production chart options here and ONLY
 * here: without it the price axis throws `RangeError: Incorrect locale information provided`
 * inside `jsdom` and the pane never reaches the paint stage — which would produce a vacuous
 * "nothing was painted" green. It changes tick-label formatting, never a candle color.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import {
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  dojiItemColors,
  flushFrames,
  installGlobals,
  HOLLOW_BODY_FILL,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Width of the pane the measurement happens in — the same the `design_gate` measured on. */
const MEASUREMENT_WIDTH_PX = 900;

/** `CHART_HEIGHT_PX` READ FROM THE PRODUCTION COMPONENT, never retyped — same discipline as
 * `price-candle.test.ts`: a copy here would measure the pane THIS file chose instead of the
 * one the screen draws, and would keep measuring it after the screen changed. */
const CHART_HEIGHT_PX = (() => {
  const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
  const match = /const CHART_HEIGHT_PX = (\d+);/.exec(source);
  assert.ok(match !== null, "CHART_HEIGHT_PX was not found in SymbolClient.tsx — the anchor moved, fix this test");
  return Number(match[1]);
})();

/**
 * Below this bar spacing the library does not paint a candle BODY at all (`:14761`,
 * `!borderVisible || barWidth > borderWidth * 2`), so the hollow interior — the whole non-color
 * channel — does not exist. Measured, not assumed: the gate's own density table reproduces here
 * (`0,500 px` at 5.760 bars, `3,492` at 240, `6,983` at 120), and `D1` asserts the boundary in
 * BOTH directions — the interior exists where this file measures, and does NOT at the default
 * view.
 */
const INTERIOR_THRESHOLD_PX = 3.5;

/** ~7 px/bar in a 900 px pane — the density the gate called legible, and where the interior is
 * `3 px` wide rather than `1 px`. */
const LEGIBLE_BAR_COUNT = 120;

/** The grid the price panel actually opens on (`price_slots:5760`, plan `01_vela.md:34`). */
const DEFAULT_VIEW_BAR_COUNT = 5_760;

const ONE_MINUTE_MS = 60_000;
const FIRST_BUCKET_MS = Date.UTC(2026, 7, 24, 0, 0, 0);

/**
 * THE STYLE THIS FIX REPLACED, kept verbatim as the negative control. Copied from
 * `color-tokens.ts` at `2f79365` (`candlestickSeriesColors` before `T-01.10`'s fix): 6 fields,
 * 2 hues, no shape, no third state.
 */
const LEGACY_HUE_ONLY_STYLE = {
  upColor: "#089981",
  downColor: "#f23645",
  borderUpColor: "#089981",
  borderDownColor: "#f23645",
  wickUpColor: "#089981",
  wickDownColor: "#f23645",
} as const;

/**
 * Colors the LIBRARY sets from ITS OWN defaults — `#2b2b43` is `lightweight-charts@5.2.1`'s grid
 * and pane-separator color, and `src/` never names it, so the ablation below cannot reach it.
 * It is EXEMPTED rather than silently ignored, and the exemption is guarded: `D3` asserts each
 * of these reaches ALL THREE states or NONE, so an exempted color can never be the thing that
 * distinguishes one direction from another.
 */
const LIBRARY_DEFAULT_COLORS: ReadonlySet<string> = new Set(["#2b2b43"]);

/** A candle body is at least 2 px wide (the wick is exactly 1) and at least 3 px tall (the body's
 * own border edges are exactly 1). Measured at `LEGIBLE_BAR_COUNT`: body `w3:h32`, wick `w1:h34`
 * and `w1:h67`, border edges `w3:h1`. */
const BODY_MIN_WIDTH_PX = 2;
const BODY_MIN_HEIGHT_PX = 3;

/** Two grays this close are the same mark. Used ONLY against the FROZEN `LEGACY_HUE_ONLY_STYLE`,
 * never against production tokens: a production token that became luminance-distinct would be an
 * IMPROVEMENT, and a bound asserted over it would reject the improvement. */
const SAME_GRAY_MAX_RATIO = 1.5;

type Direction = "rise" | "fall" | "doji";

/** One recorded drawing call: what was asked, and the color that was set when it was asked. */
interface PaintOp {
  readonly op: string;
  readonly fill: string;
  readonly stroke: string;
  readonly args: readonly number[];
}

interface PaintRun {
  readonly ops: readonly PaintOp[];
  /** The library's own bar spacing after `fitContent()`, in CSS px. */
  readonly barSpacingPx: number;
  /** The candle BODY rectangles — the mark a rise and a fall emit and a doji does not. */
  readonly bodyRects: readonly PaintOp[];
  /** The subset of `bodyRects` painted with a transparent interior — the HOLLOW body. */
  readonly hollowInteriors: readonly PaintOp[];
}

// ── THE ABLATION. TRUE LUMINANCE, NOT TWO LITERAL SUBSTITUTIONS (`[SERIOUS-1-REGATE]`/a) ─────

/** WCAG 2.1 §relative luminance, one sRGB channel — the same linearization
 * `color-tokens.test.ts` uses for its contrast floors. */
function channelLuminance(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.040_45 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

function contrastRatio(first: string, second: string): number {
  const luminances = [first, second].map((hex) => {
    const parsed = parseHex(hex);
    assert.ok(parsed !== null, `contrastRatio was handed ${hex}, which is not a #rrggbb`);
    return relativeLuminance(parsed[0], parsed[1], parsed[2]);
  });
  const [lighter, darker] = [Math.max(...luminances), Math.min(...luminances)];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHex(color: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (match === null) {
    return null;
  }
  const digits = match[1];
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

function isGray(color: string): boolean {
  const parsed = parseHex(color);
  return parsed !== null && parsed[0] === parsed[1] && parsed[1] === parsed[2];
}

/**
 * THE GRAYSCALE ABLATION, and it is a real one: every `#rrggbb` is replaced by the gray with the
 * SAME WCAG relative luminance. `#089981` -> `#878787`, `#f23645` -> `#818181`,
 * `#8b949e` -> `#939393` `[MEDIDO 2026-09-19]`. The previous version replaced two literals, so
 * the doji's `#8b949e` survived and `D3` kept distinguishing it BY COLOR on a test that claimed
 * to have removed color — `[SERIOUS-1-REGATE]`.
 *
 * `rgba(0,0,0,0)` is untouched and that is not an oversight: ALPHA IS NOT HUE. A transparent body
 * lets the background through whatever the palette is, which is why it survives a monochrome
 * screen and why `ADR-010/D-2` rests the rise on it.
 */
function grayAblate(value: string): string {
  return value.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    const parsed = parseHex(hex);
    assert.ok(parsed !== null, `the hex matcher accepted ${hex} and the parser did not`);
    const luminance = relativeLuminance(parsed[0], parsed[1], parsed[2]);
    const encoded = luminance <= 0.003_130_8 ? luminance * 12.92 : 1.055 * luminance ** (1 / 2.4) - 0.055;
    const level = Math.round(Math.min(255, Math.max(0, encoded * 255)));
    const digits = level.toString(16).padStart(2, "0");
    return `#${digits}${digits}${digits}`;
  });
}

/** Applied to EVERYTHING `src/` hands the library — series style, per-item overrides and the
 * chart constructor options — so the whole pane goes monochrome, not just the candles. A shallow
 * pass would leave `chartConstructorOptions`' nested `layout`/`grid` hues on the canvas. */
function ablateDeep(value: unknown, ablate: boolean): unknown {
  if (!ablate) {
    return value;
  }
  if (typeof value === "string") {
    return grayAblate(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => ablateDeep(entry, ablate));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, ablateDeep(entry, ablate)]));
  }
  return value;
}

/** `bars` slots of one direction, all with the same real range, so only the BODY differs. */
function slotsOf(direction: Direction, bars: number) {
  const close = direction === "rise" ? 110 : direction === "fall" ? 90 : 100;
  return Array.from({ length: bars }, (_unused, index) => {
    const time = FIRST_BUCKET_MS + index * ONE_MINUTE_MS;
    return { time, candle: { openTimeMs: time, open: 100, high: 120, low: 80, close, volume: 1 } };
  });
}

/**
 * Renders one direction through the production path and records every drawing call.
 *
 * The recorder wraps `getContext` AFTER `installGlobals` has installed the headless stub, so
 * what is observed is the library talking to the same context production talks to. The
 * background CLEAR (a `fillRect` covering the whole canvas) is dropped: it is the surface, not
 * a mark, and keeping it would put an identical entry in all three signatures.
 *
 * `dojiWithBody` is THE MUTANT of `D6` and exists only there: it renders a doji-painted candle
 * over RISE data, i.e. a neutral candle that emits a body. It is a screen state, not a style
 * option — nothing in `src/` can produce it today, which is the point of a mutant.
 */
async function paint(options: {
  readonly direction: Direction;
  readonly bars: number;
  readonly legacy?: boolean;
  readonly ablate?: boolean;
  readonly dojiWithBody?: boolean;
}): Promise<PaintRun> {
  const { direction, bars, legacy = false, ablate = false, dojiWithBody = false } = options;
  assert.ok(!dojiWithBody || direction === "doji", "the mutant only makes sense for the doji");
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);

  const ops: PaintOp[] = [];
  const baseGetContext = dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.getContext = function recordingGetContext(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const context = (baseGetContext as unknown as (...rest: unknown[]) => unknown).apply(this, args) as object;
    const state = { fillStyle: "", strokeStyle: "" };
    return new Proxy(context, {
      get(target, property): unknown {
        if (property === "fillStyle") {
          return state.fillStyle;
        }
        if (property === "strokeStyle") {
          return state.strokeStyle;
        }
        const value = Reflect.get(target, property);
        if (typeof property === "string" && ["fillRect", "fill", "stroke", "strokeRect"].includes(property)) {
          return (...callArgs: number[]): unknown => {
            const width = callArgs[2] ?? 0;
            const height = callArgs[3] ?? 0;
            const isBackgroundClear =
              property === "fillRect" && width >= MEASUREMENT_WIDTH_PX - 1 && height >= CHART_HEIGHT_PX - 1;
            if (!isBackgroundClear) {
              ops.push({ op: property, fill: state.fillStyle, stroke: state.strokeStyle, args: callArgs });
            }
            return typeof value === "function" ? (value as (...rest: unknown[]) => unknown).apply(target, callArgs) : undefined;
          };
        }
        return value;
      },
      set(_target, property, value): boolean {
        if (property === "fillStyle") {
          state.fillStyle = String(value);
        } else if (property === "strokeStyle") {
          state.strokeStyle = String(value);
        }
        return true;
      },
    });
  } as unknown as HTMLCanvasElement["getContext"];

  const lightweight = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  const chart = lightweight.createChart(
    container,
    ablateDeep({ ...chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX), localization: { locale: "en-US" } }, ablate) as never,
  );

  const style = ablateDeep(legacy ? LEGACY_HUE_ONLY_STYLE : candlestickSeriesColors(), ablate);
  const series = chart.addSeries(lightweight.CandlestickSeries, style as never);
  const items = candlestickSeriesLossless(slotsOf(dojiWithBody ? "rise" : direction, bars)).map((item) => {
    const entries = Object.entries(item).filter(
      ([key]) => !legacy || !["color", "borderColor", "wickColor"].includes(key),
    );
    const mutated = dojiWithBody ? { ...Object.fromEntries(entries), ...dojiItemColors() } : Object.fromEntries(entries);
    return ablateDeep(mutated, ablate);
  });
  series.setData(items as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barSpacingPx = chart.timeScale().options().barSpacing;
  chart.remove();
  const bodyRects = ops.filter((candidate) => {
    const width = candidate.args[2] ?? Number.POSITIVE_INFINITY;
    const height = candidate.args[3] ?? 0;
    return (
      candidate.op === "fillRect" &&
      width >= BODY_MIN_WIDTH_PX &&
      width <= barSpacingPx &&
      height >= BODY_MIN_HEIGHT_PX
    );
  });
  return {
    ops,
    barSpacingPx,
    bodyRects,
    hollowInteriors: bodyRects.filter((candidate) => candidate.fill === HOLLOW_BODY_FILL),
  };
}

// ── THE THREE SIGNATURES. GEOMETRY IS NOW FIRST-CLASS (`[SERIOUS-1-REGATE]`/b) ───────────────

/** The full mark: what was drawn, HOW BIG, and in what color. */
function signature(run: PaintRun): string {
  return [...new Set(run.ops.map((entry) => `${entry.op}:${geometryOf(entry)}:${entry.fill || entry.stroke}`))]
    .sort()
    .join(" ");
}

/** The mark with COLOR DISCARDED — not grayed, discarded. This is the channel a monochrome
 * screen still has. */
function shapeSignature(run: PaintRun): string {
  return [...new Set(run.ops.map((entry) => `${entry.op}:${geometryOf(entry)}`))].sort().join(" ");
}

/** The OLD signature, `op:color`, kept under its real name because it is exactly what the legacy
 * defect of `BLOCKER-2` is a statement about — and because `D6` uses it to show that a color-only
 * instrument stays GREEN on a mutant this file now rejects. */
function colorSignature(run: PaintRun): string {
  return [...new Set(run.ops.map((entry) => `${entry.op}:${entry.fill || entry.stroke}`))].sort().join(" ");
}

function geometryOf(entry: PaintOp): string {
  return `w${Math.round(entry.args[2] ?? -1)}:h${Math.round(entry.args[3] ?? -1)}`;
}

/** The alpha a canvas color carries. `#rrggbb` is opaque by definition; `rgba(r,g,b,a)` says so
 * itself. Used instead of comparing against `HOLLOW_BODY_FILL` so that the classifier below has
 * NO color literal in it at all. */
function alphaOf(color: string): number {
  const functional = /^rgba?\(([^)]*)\)$/i.exec(color.trim());
  if (functional === null) {
    return 1;
  }
  const parts = functional[1].split(",");
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

function bodyOpacityOf(run: PaintRun): "none" | "hollow" | "filled" {
  if (run.bodyRects.length === 0) {
    return "none";
  }
  return run.bodyRects.every((rect) => alphaOf(rect.fill) === 0) ? "hollow" : "filled";
}

/**
 * THE MARK ON A SCREEN WITH NO COLOR AT ALL: geometry plus the body's OPACITY. No hue, no gray,
 * no hex — two runs with the same class are the same mark to an operator who cannot use color,
 * whatever palette is in force. This is what `D3` rests on now, instead of on three gray strings
 * that happen not to be equal.
 */
function colorBlindClass(run: PaintRun): string {
  return `${shapeSignature(run)} | body=${bodyOpacityOf(run)}`;
}

/** Every color this run set on a drawing call, lowercased — used to ask whether a direction
 * token reached the canvas at all. */
function colorsPainted(run: PaintRun): ReadonlySet<string> {
  const painted = new Set<string>();
  for (const entry of run.ops) {
    if (entry.fill !== "") {
      painted.add(entry.fill.toLowerCase());
    }
    if (entry.stroke !== "") {
      painted.add(entry.stroke.toLowerCase());
    }
  }
  return painted;
}

/** THE single hex a candle is painted in, taken from the drawing calls at candle scale (never
 * wider than one bar) and with the library's own defaults excluded. Asserts there is exactly
 * one: two would mean the ablation left a second value on the candle and every number derived
 * from this would be a guess. */
function candleHexOf(run: PaintRun): string {
  const hexes = new Set<string>();
  for (const entry of run.ops) {
    const width = entry.args[2] ?? Number.POSITIVE_INFINITY;
    if (entry.op !== "fillRect" || width > run.barSpacingPx) {
      continue;
    }
    const color = (entry.fill || entry.stroke).toLowerCase();
    if (parseHex(color) !== null && !LIBRARY_DEFAULT_COLORS.has(color)) {
      hexes.add(color);
    }
  }
  assert.equal(hexes.size, 1, `expected exactly one candle-scale hex, found ${[...hexes].join(", ") || "none"}`);
  return [...hexes][0];
}

/**
 * THE SHAPE ASSERTION `[SERIOUS-1-REGATE]` asked for, as a NAMED function on purpose: `D3`
 * applies it to production and `D6` asserts that it THROWS on the mutant. Same predicate, two
 * inputs, one green and one red — the pair that makes a guard evidence rather than agreement.
 *
 * `context` carries the numbers measured by the caller into the failure message, so a red run
 * prints what it saw instead of what someone once wrote.
 */
function assertDojiEmitsNoBody(doji: PaintRun, reference: PaintRun, context: string): void {
  assert.ok(
    reference.bodyRects.length > 0,
    `the reference direction emitted NO body rectangle — there is nothing to be different from, ` +
      `and this assertion would pass on a chart that painted nothing. ${context}`,
  );
  assert.equal(
    doji.bodyRects.length,
    0,
    `the doji emitted ${doji.bodyRects.length} body rectangle(s) (${doji.bodyRects
      .slice(0, 1)
      .map((rect) => geometryOf(rect))
      .join("")}), the same mark the reference emits ${reference.bodyRects.length} of. On a screen ` +
      `with no color the doji would read as a BLOCK, not as a trace, and nothing would separate it ` +
      `from a direction. ${context}`,
  );
  assert.notEqual(
    colorBlindClass(doji),
    colorBlindClass(reference),
    `with color discarded the doji and the reference are the SAME MARK. ${context}`,
  );
}

async function paintAll(options: {
  readonly bars: number;
  readonly legacy?: boolean;
  readonly ablate?: boolean;
}): Promise<Record<Direction, PaintRun>> {
  return {
    rise: await paint({ ...options, direction: "rise" }),
    fall: await paint({ ...options, direction: "fall" }),
    doji: await paint({ ...options, direction: "doji" }),
  };
}

function distinctSignatures(runs: Record<Direction, PaintRun>): number {
  return new Set([signature(runs.rise), signature(runs.fall), signature(runs.doji)]).size;
}

function distinctColorSignatures(runs: Record<Direction, PaintRun>): number {
  return new Set([colorSignature(runs.rise), colorSignature(runs.fall), colorSignature(runs.doji)]).size;
}

function distinctColorBlindClasses(runs: Record<Direction, PaintRun>): number {
  return new Set([colorBlindClass(runs.rise), colorBlindClass(runs.fall), colorBlindClass(runs.doji)]).size;
}

// ── D1. THE DENSITY GUARD (`[SERIOUS-2]`/`A4`) — refuse a measurement taken where the channel
//        does not exist, and pin the default view as a number rather than as a hope ───────────

test("D1: the hollow interior EXISTS at the measurement density and does NOT at the default view", async () => {
  const legible = await paint({ direction: "rise", bars: LEGIBLE_BAR_COUNT });
  assert.ok(
    legible.barSpacingPx >= INTERIOR_THRESHOLD_PX,
    `the measurement density collapsed to ${legible.barSpacingPx.toFixed(3)} px/bar, under the ` +
      `${INTERIOR_THRESHOLD_PX} px the body fill needs — every assertion in this file would be vacuous`,
  );
  assert.ok(
    legible.hollowInteriors.length > 0,
    "no transparent interior was painted at the legible density — the non-color channel is not on screen",
  );
  assert.ok(
    (legible.hollowInteriors[0]?.args[2] ?? 0) >= 3,
    `the interior is ${legible.hollowInteriors[0]?.args[2]} px wide; under 3 px it is a hairline, not a channel`,
  );

  // And the other half of the same fact, stated so nobody reads D2/D3 as a claim about the
  // screen the operator opens today: at `fitContent()` over the real grid there is NO interior.
  // This is `A7`/`T-05.3`+'s to decide, NOT this task's — `s2-headless-run.ts:101-111`.
  const defaultView = await paint({ direction: "rise", bars: DEFAULT_VIEW_BAR_COUNT });
  assert.ok(
    defaultView.barSpacingPx < INTERIOR_THRESHOLD_PX,
    "the default view got legible on its own — re-read A7 before trusting the number below",
  );
  assert.equal(
    defaultView.hollowInteriors.length,
    0,
    "a hollow interior appeared at 5.760 slots; the threshold moved and this file's premise needs re-measuring",
  );
});

// ── D2. THE THREE STATES, AS PAINT (`[BLOCKER-1]`/`[BLOCKER-2]`, actions `A1`/`A2`) ──────────

test("D2: rise, fall and doji paint THREE distinct signatures — the rise hollow, the doji bodiless", async () => {
  const runs = await paintAll({ bars: LEGIBLE_BAR_COUNT });
  const tokens = colorTokens();

  assert.equal(
    distinctSignatures(runs),
    3,
    `the three states collapsed onto ${distinctSignatures(runs)} distinct paint signature(s):\n` +
      `  rise: ${signature(runs.rise)}\n  fall: ${signature(runs.fall)}\n  doji: ${signature(runs.doji)}`,
  );

  // `A1`: the RISE is the only state with a transparent interior. This is the non-color channel
  // that separates it from the FALL, whose body is opaque.
  assert.ok(runs.rise.hollowInteriors.length > 0, "the rise must paint a HOLLOW body");
  assert.equal(runs.fall.hollowInteriors.length, 0, "the fall must be FILLED, never hollow");
  assert.equal(runs.doji.hollowInteriors.length, 0, "the doji must not borrow the rise's hollow body");

  // `[SERIOUS-1-REGATE]`: and THE SHAPE, which no assertion in this file used to make. The rise
  // and the fall emit a body rectangle; the doji, whose body is zero pixels tall, does not.
  assert.ok(runs.rise.bodyRects.length > 0, "the rise must emit a body rectangle");
  assert.ok(runs.fall.bodyRects.length > 0, "the fall must emit a body rectangle");
  assertDojiEmitsNoBody(runs.doji, runs.fall, "measured on the production style, no ablation");

  // `A2`: the doji affirms NO direction — neither token reaches the canvas (`ADR-010:110`).
  const dojiColors = colorsPainted(runs.doji);
  assert.ok(
    !dojiColors.has(tokens.directionUpFill.toLowerCase()),
    `the doji painted ${tokens.directionUpFill} — the screen is affirming a RISE the data does not carry`,
  );
  assert.ok(
    !dojiColors.has(tokens.directionDownFill.toLowerCase()),
    `the doji painted ${tokens.directionDownFill} — the screen is affirming a FALL the data does not carry`,
  );
  assert.ok(
    dojiColors.has(dojiItemColors().color.toLowerCase()),
    `the doji did not paint its neutral ${dojiItemColors().color} (STITCH_CONTEXT.md:1257)`,
  );

  // And the two directions do reach the canvas, each only in its own state — otherwise the
  // assertions above would pass on a chart that painted nothing at all.
  assert.ok(colorsPainted(runs.rise).has(tokens.directionUpFill.toLowerCase()), "the rise must carry its token");
  assert.ok(colorsPainted(runs.fall).has(tokens.directionDownFill.toLowerCase()), "the fall must carry its token");
  assert.ok(!colorsPainted(runs.rise).has(tokens.directionDownFill.toLowerCase()), "the rise must not paint the fall's token");
  assert.ok(!colorsPainted(runs.fall).has(tokens.directionUpFill.toLowerCase()), "the fall must not paint the rise's token");
});

// ── D3. THE ABLATION, NOW BY LUMINANCE — and the separation restated WITHOUT color (`A3`) ────

test("D3: under a TRUE luminance grayscale the three states stay distinct — and fall × doji separate with color DISCARDED", async () => {
  const before = await paintAll({ bars: LEGIBLE_BAR_COUNT });
  const after = await paintAll({ bars: LEGIBLE_BAR_COUNT, ablate: true });
  const tokens = colorTokens();

  assert.equal(distinctSignatures(before), 3, "precondition: the three states must be distinct before the ablation");

  // (a) THE ABLATION MEASURED SOMETHING. Every hue `src/` ships reached the canvas before and
  //     none survives after — including the doji's `#8b949e`, which the two literal substitutions
  //     this replaces left untouched. `rc=0` over an ablation that removed nothing is exactly the
  //     ambiguous green `ADR-012` names.
  const paintedBefore = new Set([
    ...colorsPainted(before.rise),
    ...colorsPainted(before.fall),
    ...colorsPainted(before.doji),
  ]);
  const paintedAfter = new Set([...colorsPainted(after.rise), ...colorsPainted(after.fall), ...colorsPainted(after.doji)]);
  for (const hue of [tokens.directionUpFill, tokens.directionDownFill, dojiItemColors().color]) {
    assert.ok(paintedBefore.has(hue.toLowerCase()), `${hue} never reached the canvas — the ablation has nothing to remove`);
    assert.ok(
      !paintedAfter.has(hue.toLowerCase()),
      `${hue} SURVIVED the ablation — it is a literal substitution again, not a grayscale (SERIOUS-1-REGATE)`,
    );
  }

  // (b) and what is left on the canvas carries no hue at all: every hex is a true gray, except
  //     the library's own defaults, which are exempted AND guarded — an exempted color must reach
  //     all three states or none, so it can never be what tells them apart.
  for (const color of paintedAfter) {
    if (parseHex(color) === null) {
      continue; // `rgba(0,0,0,0)` and the `rgb(...)` labels the library computes itself
    }
    assert.ok(
      isGray(color) || LIBRARY_DEFAULT_COLORS.has(color),
      `${color} still carries hue after the ablation — the grayscale does not reach everything src/ paints`,
    );
  }
  for (const exempted of LIBRARY_DEFAULT_COLORS) {
    const reached = [after.rise, after.fall, after.doji].filter((run) => colorsPainted(run).has(exempted)).length;
    assert.ok(
      reached === 0 || reached === 3,
      `${exempted} is exempted from the ablation but reaches ${reached}/3 states — it could be carrying direction`,
    );
  }

  // (c) the three marks survive the grayscale...
  assert.equal(
    distinctSignatures(after),
    3,
    `the ablation collapsed the states onto ${distinctSignatures(after)} class(es):\n` +
      `  rise: ${signature(after.rise)}\n  fall: ${signature(after.fall)}\n  doji: ${signature(after.doji)}`,
  );

  // (d) ...AND THIS IS THE CLAIM THAT USED TO BE OVERSTATED: they survive with color DISCARDED,
  //     not merely grayed. What the grayscale leaves on the fall and on the doji is ~1,27:1 apart
  //     (measured below and printed on failure) — for any practical purpose the same gray. If the
  //     geometry did not separate them, nothing would, and `D3` would be asserting a color
  //     distinction while claiming to have removed color.
  const fallGray = candleHexOf(after.fall);
  const dojiGray = candleHexOf(after.doji);
  const grayRatio = contrastRatio(fallGray, dojiGray);
  const measured =
    `[MEDIDO nesta execução] after the luminance ablation the fall is ${fallGray} and the doji ` +
    `${dojiGray} — ${grayRatio.toFixed(2)}:1 apart, against the 3.0 the tokens themselves demand of a ` +
    `surface distinction (color-tokens.ts:164). NOTE: this ratio is reported, never asserted — a ` +
    `token that became luminance-distinct would be an improvement and a bound here would reject it.`;

  assert.equal(
    distinctColorBlindClasses(after),
    3,
    `with color DISCARDED the three states collapse onto ${distinctColorBlindClasses(after)} class(es):\n` +
      `  rise: ${colorBlindClass(after.rise)}\n  fall: ${colorBlindClass(after.fall)}\n` +
      `  doji: ${colorBlindClass(after.doji)}\n${measured}`,
  );
  assertDojiEmitsNoBody(after.doji, after.fall, measured);

  // (e) and the rise's channel is ALPHA, which no grayscale can take away.
  assert.ok(after.rise.hollowInteriors.length > 0, "the hollow body did not survive the ablation — alpha was treated as hue");
  assert.equal(after.fall.hollowInteriors.length, 0, "the grayed fall must stay filled");
  assert.equal(bodyOpacityOf(after.rise), "hollow");
  assert.equal(bodyOpacityOf(after.fall), "filled");
  assert.equal(bodyOpacityOf(after.doji), "none");
});

// ── D4. THE NEGATIVE CONTROL: the style this fix replaced FAILS both assertions above ────────

test("⛔ D4 (negative control): the legacy hue-only style paints the DOJI with the RISE's colors", async () => {
  const runs = await paintAll({ bars: LEGIBLE_BAR_COUNT, legacy: true });

  assert.equal(
    colorSignature(runs.doji),
    colorSignature(runs.rise),
    "the legacy defect did not reproduce — if the library stopped resolving `isUp = open <= close`, " +
      "re-read BLOCKER-2 before trusting D2",
  );
  assert.equal(distinctColorSignatures(runs), 2, "legacy paints only 2 distinct COLOR marks for 3 states");
  assert.equal(runs.rise.hollowInteriors.length, 0, "legacy has no hollow body at all — that is BLOCKER-1");

  // ⚠️ AND THE HONEST HALF, stated so the shape channel is not read as something this fix
  // invented: the legacy doji emits no body either, because a zero-height body is a property of
  // `open === close`, not of any style. What legacy lacks is the channel that separates the RISE
  // from the FALL — the next test measures exactly that.
  assert.equal(runs.doji.bodyRects.length, 0, "the doji's bodiless shape comes from the DATA and is present in legacy too");
});

test("⛔ D4 (negative control): with color discarded, the legacy RISE and FALL are the SAME MARK", async () => {
  const legacy = await paintAll({ bars: LEGIBLE_BAR_COUNT, legacy: true });
  const live = await paintAll({ bars: LEGIBLE_BAR_COUNT });

  assert.equal(
    colorBlindClass(legacy.rise),
    colorBlindClass(legacy.fall),
    "the legacy rise and fall separated without color — then BLOCKER-1 never existed and D3 proves nothing",
  );
  assert.equal(distinctColorBlindClasses(legacy), 2, "legacy leaves 2 color-blind marks for 3 states");
  assert.notEqual(
    colorBlindClass(live.rise),
    colorBlindClass(live.fall),
    "production did NOT separate the rise from the fall without color — the fix is not on the render path",
  );
  assert.equal(distinctColorBlindClasses(live), 3, "production must leave 3 color-blind marks for 3 states");

  // And the ablation is shown doing real work on a FROZEN style, where asserting a bound is safe:
  // the two legacy hues land on grays ~1,09:1 apart — the number `ADR-010:113` publishes.
  const legacyAfter = await paintAll({ bars: LEGIBLE_BAR_COUNT, legacy: true, ablate: true });
  const riseGray = candleHexOf(legacyAfter.rise);
  const fallGray = candleHexOf(legacyAfter.fall);
  const ratio = contrastRatio(riseGray, fallGray);
  assert.ok(
    ratio < SAME_GRAY_MAX_RATIO,
    `the legacy hues landed on ${riseGray} and ${fallGray}, ${ratio.toFixed(2)}:1 apart — over the ` +
      `${SAME_GRAY_MAX_RATIO}:1 this file calls "the same mark", so the ablation is not collapsing them`,
  );
});

// ── D5. THE LAST-VALUE LABEL, a defect the hollow body CREATES and `priceLineColor` repairs ──

test("D5: the price-axis last-value label is never painted OPAQUE BLACK by the transparent body", async () => {
  const runs = await paintAll({ bars: LEGIBLE_BAR_COUNT });
  for (const [direction, run] of Object.entries(runs)) {
    assert.ok(
      !colorsPainted(run).has("rgb(0, 0, 0)"),
      `the ${direction} run painted rgb(0, 0, 0) — generateContrastColors stripped the alpha off ` +
        `the hollow body (dist/lightweight-charts.development.mjs:406-412) and produced a black ` +
        `label no ADR-010 role carries. priceLineColor is what stops it (:3415-3417).`,
    );
  }
  assert.ok(
    colorsPainted(runs.rise).has(colorTokens().provenanceStrong.toLowerCase()) ||
      colorsPainted(runs.rise).has("rgb(230, 233, 239)"),
    "the label did not take `priceLineColor` — the repair is not on the render path",
  );
});

// ── D6. THE MUTATION (`[SERIOUS-1-REGATE]`): a doji that emits a body must REPROVAR ──────────

test("⛔ D6 (mutation): a DOJI THAT EMITS A BODY is rejected by the same assertion that passes on production", async () => {
  const fall = await paint({ direction: "fall", bars: LEGIBLE_BAR_COUNT });
  const honest = await paint({ direction: "doji", bars: LEGIBLE_BAR_COUNT });
  const mutant = await paint({ direction: "doji", bars: LEGIBLE_BAR_COUNT, dojiWithBody: true });

  // CALA — the production doji passes, so the assertion is not one that fails on everything.
  assertDojiEmitsNoBody(honest, fall, "mutation test, honest doji");

  // MORDE — the mutant does not, and the failure names the body it emitted.
  assert.throws(
    () => assertDojiEmitsNoBody(mutant, fall, "mutation test, mutant doji"),
    /emitted \d+ body rectangle/,
    "the shape assertion stayed GREEN on a doji that emits a body — it is not measuring shape",
  );
  assert.ok(mutant.bodyRects.length > 0, "the mutant did not actually emit a body — nothing was mutated");
  assert.equal(
    colorBlindClass(mutant),
    colorBlindClass(fall),
    "with color discarded the mutant doji must read exactly like a FALL — that is why it is a defect",
  );

  // ⛔ AND THE POINT OF THE WHOLE REWRITE: the instrument this file replaces — a color-only
  // signature — is BLIND to this mutant, and the measurement is stronger than expected. It does
  // not merely fail to flag the defect: it cannot tell the mutant from the honest doji AT ALL,
  // because both paint exactly the same `op:color` pairs. So the old `D2`/`D3` count of "3
  // distinct marks" is unmoved by the mutation, and the old file would report GREEN on a screen
  // where the doji is a block `[MEDIDO 2026-09-19: colorSignature(mutant) === colorSignature(honest)]`.
  const rise = await paint({ direction: "rise", bars: LEGIBLE_BAR_COUNT });
  assert.equal(
    colorSignature(mutant),
    colorSignature(honest),
    "the color-only signature can already tell the mutant from the honest doji — then it was not blind " +
      "and this test proves nothing",
  );
  assert.equal(
    new Set([colorSignature(rise), colorSignature(fall), colorSignature(mutant)]).size,
    3,
    "the old instrument's own count moved on the mutant screen — re-read what D3 used to assert",
  );
  assert.ok(
    colorsPainted(mutant).has(dojiItemColors().color.toLowerCase()) &&
      !colorsPainted(mutant).has(colorTokens().directionUpFill.toLowerCase()) &&
      !colorsPainted(mutant).has(colorTokens().directionDownFill.toLowerCase()),
    "the mutant would also pass D2's color assertions — it paints the neutral token and neither direction",
  );
});
