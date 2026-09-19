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
 * ── THE FALSIFIER PAIR, AND IT IS THE POINT ─────────────────────────────────────────────────
 *
 * Every claim is measured twice, once against production and once against `LEGACY_HUE_ONLY_STYLE`
 * — the exact style this fix replaced, kept here as a NEGATIVE CONTROL. The guard is therefore
 * shown REJECTING something rather than merely agreeing with today's code:
 *
 *   production, no ablation  -> 3 distinct paint signatures for rise / fall / doji
 *   production, gray ablation-> 3 distinct  (alpha is not hue, so the hollow body survives)
 *   legacy,     no ablation  -> 2 distinct  (the doji's signature EQUALS the rise's: BLOCKER-2)
 *   legacy,     gray ablation-> 1 distinct  (everything collapses onto one gray: BLOCKER-1)
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
  /** `fillRect` calls painting a transparent interior taller than 2 px — the HOLLOW body. */
  readonly hollowInteriors: readonly PaintOp[];
}

/** `s/089981/808080/; s/f23645/808080/` — the gate's grayscale ablation, applied to VALUES, so
 * every hue collapses onto one gray and `rgba(0,0,0,0)` is untouched. Alpha is not hue. */
function grayAblate(value: string): string {
  return value.replace(/089981/gi, "808080").replace(/f23645/gi, "808080");
}

function ablateRecord<T extends Record<string, unknown>>(record: T, ablate: boolean): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, ablate && typeof value === "string" ? grayAblate(value) : value]),
  );
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
 */
async function paint(options: {
  readonly direction: Direction;
  readonly bars: number;
  readonly legacy?: boolean;
  readonly ablate?: boolean;
}): Promise<PaintRun> {
  const { direction, bars, legacy = false, ablate = false } = options;
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
  const chart = lightweight.createChart(container, {
    ...chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX),
    localization: { locale: "en-US" },
  });

  const style = ablateRecord(legacy ? LEGACY_HUE_ONLY_STYLE : candlestickSeriesColors(), ablate);
  const series = chart.addSeries(lightweight.CandlestickSeries, style as never);
  const items = candlestickSeriesLossless(slotsOf(direction, bars)).map((item) => {
    const entries = Object.entries(item).filter(
      ([key]) => !legacy || !["color", "borderColor", "wickColor"].includes(key),
    );
    return ablateRecord(Object.fromEntries(entries), ablate);
  });
  series.setData(items as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barSpacingPx = chart.timeScale().options().barSpacing;
  chart.remove();
  return {
    ops,
    barSpacingPx,
    hollowInteriors: ops.filter(
      (candidate) => candidate.op === "fillRect" && candidate.fill === HOLLOW_BODY_FILL && (candidate.args[3] ?? 0) > 2,
    ),
  };
}

/** The set of `op:color` pairs a run emitted — the run's SIGNATURE. Two directions that share a
 * signature are, as far as the canvas is concerned, the same mark. */
function signature(run: PaintRun): string {
  return [...new Set(run.ops.map((entry) => `${entry.op}:${entry.fill || entry.stroke}`))].sort().join(" ");
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

test("D2: rise, fall and doji paint THREE distinct signatures — and only the rise is hollow", async () => {
  const runs = await paintAll({ bars: LEGIBLE_BAR_COUNT });
  const tokens = colorTokens();

  assert.equal(
    distinctSignatures(runs),
    3,
    `the three states collapsed onto ${distinctSignatures(runs)} distinct paint signature(s):\n` +
      `  rise: ${signature(runs.rise)}\n  fall: ${signature(runs.fall)}\n  doji: ${signature(runs.doji)}`,
  );

  // `A1`: the RISE is the only state with a transparent interior. This is the non-color channel.
  assert.ok(runs.rise.hollowInteriors.length > 0, "the rise must paint a HOLLOW body");
  assert.equal(runs.fall.hollowInteriors.length, 0, "the fall must be FILLED, never hollow");
  assert.equal(runs.doji.hollowInteriors.length, 0, "the doji must not borrow the rise's hollow body");

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

// ── D3. THE GRAY ABLATION (`A3`) — 3 classes before, 3 classes after ─────────────────────────

test("D3: with both direction hues collapsed onto one gray, the three states STAY distinct", async () => {
  const before = await paintAll({ bars: LEGIBLE_BAR_COUNT });
  const after = await paintAll({ bars: LEGIBLE_BAR_COUNT, ablate: true });

  assert.equal(distinctSignatures(before), 3, "precondition: the three states must be distinct before the ablation");
  assert.equal(
    distinctSignatures(after),
    3,
    `the ablation collapsed the states onto ${distinctSignatures(after)} class(es) — direction is ` +
      `still travelling by HUE, which is exactly what SC 1.4.1 (level A) forbids:\n` +
      `  rise: ${signature(after.rise)}\n  fall: ${signature(after.fall)}\n  doji: ${signature(after.doji)}`,
  );

  // WHY it survives, stated as an assertion rather than as a comment: the grayed rise still
  // paints an interior the grayed fall does not. `rgba(0,0,0,0)` has no hue to collapse.
  assert.ok(after.rise.hollowInteriors.length > 0, "the hollow body did not survive the ablation — alpha was treated as hue");
  assert.equal(after.fall.hollowInteriors.length, 0, "the grayed fall must stay filled");
  assert.ok(
    !colorsPainted(after.rise).has("#089981") && !colorsPainted(after.fall).has("#f23645"),
    "the ablation did not actually remove the hues — it measured nothing",
  );
});

// ── D4. THE NEGATIVE CONTROL: the style this fix replaced FAILS both assertions above ────────

test("⛔ D4 (negative control): the legacy hue-only style paints the DOJI exactly like the RISE", async () => {
  const runs = await paintAll({ bars: LEGIBLE_BAR_COUNT, legacy: true });

  assert.equal(
    signature(runs.doji),
    signature(runs.rise),
    "the legacy defect did not reproduce — if the library stopped resolving `isUp = open <= close`, " +
      "re-read BLOCKER-2 before trusting D2",
  );
  assert.equal(distinctSignatures(runs), 2, "legacy paints only 2 distinct marks for 3 states");
  assert.equal(runs.rise.hollowInteriors.length, 0, "legacy has no hollow body at all — that is BLOCKER-1");
});

test("⛔ D4 (negative control): under the gray ablation the legacy style collapses to ONE mark", async () => {
  const after = await paintAll({ bars: LEGIBLE_BAR_COUNT, legacy: true, ablate: true });

  assert.equal(
    distinctSignatures(after),
    1,
    "the legacy style survived the ablation — then the ablation is not measuring what D3 claims it measures",
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
