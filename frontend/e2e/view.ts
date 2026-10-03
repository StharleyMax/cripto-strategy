/**
 * `paineis-de-fluxo` `T-06.1` — puts the ONE time axis of `/symbol` where a spec says, instead of
 * every spec depending on where the page happens to open (`VIEW_BARS`, `timeframe-window.ts`).
 *
 * Design: `docs/context/paineis-de-fluxo/handoff/T-06.1-desenho.md` §1. The decision that matters:
 * this is a GESTURE IN A CLOSED LOOP — wheel + drag, exactly what an operator does — reading only
 * what the page already publishes:
 *
 *   - `data-visible-logical-from`/`-to` and `data-bar-spacing-px` on the chart host
 *     (`SymbolClient.tsx`, `handleRangeChange`/`publishBarSpacing`);
 *   - `data-window-start-ms`/`data-window-end-ms-inclusive` on `<main>`;
 *   - `window.__historyPageLatencyProbe` (`requestedMs`/`drawnMs`) to see a history page asked for.
 *
 * ⛔ No production surface was added for it: no state setter on `window`, no URL parameter, no build
 * flag. A setter would stop the specs from exercising wheel/drag → `onCandidateRange` → pager, which
 * is what several of them prove; a URL parameter would test a mount no operator receives.
 *
 * THE MATH THE GESTURES REST ON (`lightweight-charts@5.2.1`, `dist/lightweight-charts.development.mjs`):
 *   - wheel (`_onMousewheel`, :11099): `zoomScale = sign(−deltaY/100) · min(1, |deltaY/100|)`, and
 *     `_internal_zoom` (:6306) sets `barSpacing += zoomScale · barSpacing / 10` while keeping the
 *     float index under the cursor at its x. So ONE event of `deltaY = d`, `|d| ≤ 100`, multiplies the
 *     spacing by `1 − d/1000` around the cursor — the helper computes the events, it does not guess;
 *   - the library's default `minBarSpacing` is 0.5 px (`typings.d.ts`, quoted in
 *     `charts/s2-headless-run.ts`), and `/symbol` does not override it: the widest view is
 *     `plotWidth / 0.5` slots. A target wider than that is REFUSED, never approximated;
 *   - a drag of `dx` px to the RIGHT reveals the past: `from' = from − dx / spacing` (`e2e/16`).
 *
 * The axis is in LOGICAL slots of the timeframe on screen: slot `i` starts at
 * `windowStartMs + i · stepMs` (`charts::toLogicalRange`), so `lastBars: N` is `[slotCount − N,
 * slotCount]` and a time range maps by the same affine law. Every iteration re-reads the window,
 * because a history page moves `windowStartMs` and shifts every logical index.
 */
import type { Page } from "@playwright/test";

// Type-only: brings `window.__historyPageLatencyProbe`'s declaration, erased at runtime.
import type { HistoryPageLatencyProbe } from "../src/app/symbol/history-page-latency-probe.ts";
import { DEFAULT_TIMEFRAME, SUPPORTED_TIMEFRAMES } from "../src/app/symbol/supported-timeframes.ts";

export type { HistoryPageLatencyProbe };

const CHART_HOST_TESTID = "symbol-chart-host";
/** The price pane's layer is `absolute inset-0` inside the pane's plot cell (`SymbolClient.tsx`,
 * the per-pane DOM layer), so its box IS the plot area: no price axis, no separator. */
const PRICE_PANE_TESTID = "price-pane";
const ONE_MINUTE_MS = 60_000;
/** `lightweight-charts` default `timeScale.minBarSpacing` (see the module docstring). */
const LIBRARY_MIN_BAR_SPACING_PX = 0.5;
/** A target this close to the floor is still refused: the last events of a zoom-out would be
 * clamped by the library and the loop would chase a span it cannot draw. */
const FLOOR_MARGIN = 0.99;
/** A hull of the screen and the target wider than this fraction of the floor is "far": the helper
 * zooms out to `FAR_ZOOM_FRACTION_OF_FLOOR` and walks instead. Close to `FLOOR_MARGIN` on purpose — a
 * lower bound left a hull of 0,96 floor to be walked by 6-px drags the library ignores (`F3` (f),
 * inventory run R240 of `T-06.1`). */
const FAR_HULL_FRACTION_OF_FLOOR = 0.98;
/** The span the far zoom-out aims at. */
const FAR_ZOOM_FRACTION_OF_FLOOR = 0.95;
/** The largest drag, as a fraction of the plot's width (`gates/T-05.1-build.md` §2). */
const MAX_DRAG_FRACTION = 0.45;
/** How long a gesture has to move the published range before it counts as "did nothing" (R9). */
const GESTURE_SETTLE_TIMEOUT_MS = 2_000;
/** How long a history page has to be drawn once it was asked for. */
const PAGE_DRAWN_TIMEOUT_MS = 15_000;
/** Two gestures in a row that move nothing ⇒ the view is stuck, and the helper says where. */
const MAX_IDLE_GESTURES = 2;
const DEFAULT_MAX_ITERATIONS = 12;
/** `settledView`'s bound: ~2 frames per read, so ~0,3 s at 60 Hz before it gives up agreeing. */
const SETTLE_MAX_READS = 10;
/** Bound on wheel events in one zoom: `x0.05` at a quarter of 10% per event is ~120 events. */
const MAX_WHEEL_EVENTS_PER_ZOOM = 400;
/** A zoom stops once the published spacing is within 0.5% of the wanted one; the outer loop corrects the rest. */
const WHEEL_SPACING_TOLERANCE = 0.005;

export interface ViewState {
  /** `data-visible-logical-from`/`-to` of the chart host. */
  readonly fromLogical: number;
  readonly toLogical: number;
  /** `data-bar-spacing-px` — the library's width of one bar. */
  readonly barSpacingPx: number;
  /** `<main data-window-start-ms>` — the instant of logical slot 0. */
  readonly windowStartMs: number;
  /** `<main data-window-end-ms-inclusive>` — the LAST ONE-MINUTE instant of the window (it is
   * written on the `1m` grid in every timeframe: `lastInstantMs(panels, ONE_MINUTE_MS)`). */
  readonly windowEndMsInclusive: number;
  /** The width of one slot, from `?interval=` (`SUPPORTED_TIMEFRAMES`; absent ⇒ `DEFAULT_TIMEFRAME`). */
  readonly stepMs: number;
  /** Slots on the axis: `(windowEndMsInclusive + 1 min − windowStartMs) / stepMs`. The end is on the
   * one-minute grid, not the timeframe's, hence `+ 1 min`, not `+ 1 step`. */
  readonly slotCount: number;
  /** The plot area of the price pane, page CSS px — where the gestures land. */
  readonly plot: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** `window.__historyPageLatencyProbe`'s `requestedMs.length` / `drawnMs.length` (0 when absent). */
  readonly pagesRequested: number;
  readonly pagesDrawn: number;
}

export type ViewTarget =
  /** The last `bars` slots of the axis, flush with its right edge. */
  | { readonly kind: "lastBars"; readonly bars: number }
  /** `[fromMs, toMs)` on screen, edge to edge. */
  | { readonly kind: "timeRange"; readonly fromMs: number; readonly toMs: number };

export interface ViewOptions {
  /** How far each edge may land from the target, in slots. Default: `max(1, 2% of the target span)`. */
  readonly toleranceSlots?: number;
  /** Default `false`: a gesture that makes the pager ask for a history page THROWS, with the trace. */
  readonly allowPaging?: boolean;
  /** At least this spacing: a target too wide for it is narrowed around its anchor (the right edge
   * for `lastBars`, the centre for `timeRange`) to `plotWidth / minBarSpacingPx` slots. */
  readonly minBarSpacingPx?: number;
  /** Gestures before giving up (R9). Default 12; the trace goes into the error. */
  readonly maxIterations?: number;
}

export interface ViewTraceStep {
  readonly action: string;
  readonly from: number;
  readonly to: number;
  readonly spacing: number;
}

export interface ViewReached extends ViewState {
  /** Gestures made — `0` when the target was already on screen. */
  readonly iterations: number;
  /** History pages asked for while positioning (always `0` without `allowPaging`). */
  readonly pagesRequestedDuring: number;
  readonly trace: readonly ViewTraceStep[];
}

function stepMsOf(pageUrl: string): number {
  const interval = new URL(pageUrl).searchParams.get("interval") ?? DEFAULT_TIMEFRAME;
  const option = SUPPORTED_TIMEFRAMES.find((candidate) => candidate.interval === interval);
  if (option === undefined) {
    throw new Error(`view: ?interval=${interval} is not a served timeframe`);
  }
  return option.stepMs;
}

function finite(raw: string | null | undefined, name: string): number {
  const value = raw === null || raw === undefined || raw === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`view: the page does not publish a usable ${name} (${JSON.stringify(raw)})`);
  }
  return value;
}

/** One reading of everything the helper steers by. Throws if the page does not publish it. */
export async function readView(page: Page): Promise<ViewState> {
  const raw = await page.evaluate(
    ({ hostTestId, paneTestId }) => {
      const host = document.querySelector<HTMLElement>(`[data-testid="${hostTestId}"]`);
      const main = document.querySelector<HTMLElement>("main[data-window-start-ms]");
      const pane = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`);
      const rect = pane?.getBoundingClientRect();
      const probe = window.__historyPageLatencyProbe;
      return {
        from: host?.dataset.visibleLogicalFrom,
        to: host?.dataset.visibleLogicalTo,
        spacing: host?.dataset.barSpacingPx,
        layers: host?.dataset.paneLayers,
        start: main?.dataset.windowStartMs,
        end: main?.dataset.windowEndMsInclusive,
        plot: rect === undefined ? null : { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        requested: probe?.requestedMs.length ?? 0,
        drawn: probe?.drawnMs.length ?? 0,
      };
    },
    { hostTestId: CHART_HOST_TESTID, paneTestId: PRICE_PANE_TESTID },
  );
  if (raw.layers !== "anchored") {
    throw new Error(`view: the pane layers are not anchored (data-pane-layers=${JSON.stringify(raw.layers)}) — the price pane box is not the plot area`);
  }
  if (raw.plot === null || raw.plot.width <= 0) {
    throw new Error("view: the price pane has no box");
  }
  const stepMs = stepMsOf(page.url());
  const windowStartMs = finite(raw.start, "data-window-start-ms");
  const windowEndMsInclusive = finite(raw.end, "data-window-end-ms-inclusive");
  return {
    fromLogical: finite(raw.from, "data-visible-logical-from"),
    toLogical: finite(raw.to, "data-visible-logical-to"),
    barSpacingPx: finite(raw.spacing, "data-bar-spacing-px"),
    windowStartMs,
    windowEndMsInclusive,
    stepMs,
    slotCount: (windowEndMsInclusive + ONE_MINUTE_MS - windowStartMs) / stepMs,
    plot: raw.plot,
    pagesRequested: raw.requested,
    pagesDrawn: raw.drawn,
  };
}

/** The target in logical slots of `state`'s axis, and the point a narrowing keeps fixed. */
function logicalTarget(state: ViewState, target: ViewTarget): { readonly left: number; readonly right: number; readonly anchor: number } {
  if (target.kind === "lastBars") {
    if (!(target.bars > 0)) throw new Error(`view: lastBars needs a positive bar count, received ${target.bars}`);
    const right = state.slotCount;
    return { left: right - target.bars, right, anchor: right };
  }
  if (!(target.toMs > target.fromMs)) throw new Error(`view: timeRange needs fromMs < toMs, received [${target.fromMs}, ${target.toMs})`);
  const left = (target.fromMs - state.windowStartMs) / state.stepMs;
  const right = (target.toMs - state.windowStartMs) / state.stepMs;
  return { left, right, anchor: (left + right) / 2 };
}

/** `range.to − range.from` slots, narrowed for `minBarSpacingPx`; throws past the library's floor. */
function effectiveTarget(state: ViewState, target: ViewTarget, minBarSpacingPx: number | undefined): { readonly left: number; readonly right: number } {
  const { left, right, anchor } = logicalTarget(state, target);
  let span = right - left;
  if (minBarSpacingPx !== undefined) {
    // 2% under the bound, so a landing inside the tolerance still clears the spacing.
    const widest = (state.plot.width / minBarSpacingPx) * 0.98;
    span = Math.min(span, widest);
  }
  const floorSlots = state.plot.width / LIBRARY_MIN_BAR_SPACING_PX;
  if (span > floorSlots * FLOOR_MARGIN) {
    throw new Error(
      `view: below the floor: ${span.toFixed(1)} slots asked, floor ${floorSlots.toFixed(1)} ` +
        `(plot ${state.plot.width.toFixed(1)} px at the library's minBarSpacing ${LIBRARY_MIN_BAR_SPACING_PX} px)`,
    );
  }
  const fraction = (anchor - left) / (right - left);
  const newLeft = anchor - fraction * span;
  return { left: newLeft, right: newLeft + span };
}

function xOfLogical(state: ViewState, logical: number): number {
  const fraction = (logical - state.fromLogical) / (state.toLogical - state.fromLogical);
  const x = state.plot.x + fraction * state.plot.width;
  // Inside the plot: the library clamps the zoom point to `[1, width]` anyway.
  return Math.min(state.plot.x + state.plot.width - 1, Math.max(state.plot.x + 1, x));
}

function signature(state: ViewState): string {
  return `${state.fromLogical}|${state.toLogical}|${state.barSpacingPx}|${state.windowStartMs}`;
}

/** Waits until the host publishes a range different from `before`; `false` when nothing moved. */
async function waitForRangeChange(page: Page, before: ViewState): Promise<boolean> {
  return page
    .waitForFunction(
      ({ hostTestId, from, to }) => {
        const host = document.querySelector<HTMLElement>(`[data-testid="${hostTestId}"]`);
        return host?.dataset.visibleLogicalFrom !== from || host?.dataset.visibleLogicalTo !== to;
      },
      { hostTestId: CHART_HOST_TESTID, from: String(before.fromLogical), to: String(before.toLogical) },
      { timeout: GESTURE_SETTLE_TIMEOUT_MS, polling: "raf" },
    )
    .then(() => true)
    .catch(() => false);
}

/** Reads until two readings two animation frames apart agree (bounded): a deferred write of the
 * page — the pager's right-edge cap after a pointer release, a page drawn late — lands before the
 * helper decides where it is. */
async function settledView(page: Page): Promise<ViewState> {
  let previous = await readView(page);
  for (let attempt = 0; attempt < SETTLE_MAX_READS; attempt += 1) {
    await nextFrames(page);
    const next = await readView(page);
    if (signature(next) === signature(previous)) return next;
    previous = next;
  }
  return previous;
}

async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/**
 * Wheel events, at `x`, that multiply the bar spacing by `ratio` (> 1 zooms in). Each event moves
 * it by at most 10%, so a big ratio is several events.
 *
 * CLOSED LOOP PER EVENT — the event is sized from the spacing the host PUBLISHED after the previous
 * one, never from a count computed up front. The `1 − d/1000` law above holds for the `deltaY` the
 * library RECEIVES, and that is not always the one sent: under `deviceScaleFactor: 2` (`e2e/33`) a
 * gesture asking `x0.060` from the 120-bar mount reached `[5523, 5760]`, i.e. `x0.51` — the same
 * every run (`ln 0.51 / ln 0.06 ≈ 0.24`: about a quarter of each event arrived), and 12 gestures
 * ended at `[3955, 5760]` of a wanted `[3760, 5760]`. Waiting for the new range before the next event
 * also keeps Chromium from coalescing queued events into one whose `deltaY` is the sum, which the
 * library's 10% clamp would cut. A wait that times out means nothing moves any more (the floor, or
 * the ceiling); the outer loop re-reads and decides.
 */
async function wheelZoom(page: Page, state: ViewState, x: number, ratio: number): Promise<void> {
  await page.mouse.move(x, state.plot.y + state.plot.height * 0.5);
  const wantedSpacing = state.barSpacingPx * ratio;
  let current = state;
  for (let events = 0; events < MAX_WHEEL_EVENTS_PER_ZOOM; events += 1) {
    const remaining = wantedSpacing / current.barSpacingPx;
    if (Math.abs(remaining - 1) <= WHEEL_SPACING_TOLERANCE) break;
    const factor = Math.min(1.1, Math.max(0.9, remaining));
    await page.mouse.wheel(0, -1_000 * (factor - 1));
    if (!(await waitForRangeChange(page, current))) break;
    current = await readView(page);
  }
}

/** One drag of `dx` px (positive = to the right = towards the past), centred in the plot. */
async function drag(page: Page, state: ViewState, dx: number): Promise<void> {
  const y = state.plot.y + state.plot.height * 0.5;
  const startX = state.plot.x + state.plot.width / 2 - dx / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  // The library needs the pauses to see a drag, not a teleport (`e2e/16`, `e2e/22`).
  await page.waitForTimeout(100);
  await page.mouse.move(startX + dx, y, { steps: Math.max(5, Math.min(30, Math.round(Math.abs(dx) / 10))) });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

function describe(target: ViewTarget): string {
  return target.kind === "lastBars" ? `lastBars ${target.bars}` : `timeRange [${target.fromMs}, ${target.toMs})`;
}

function traceText(trace: readonly ViewTraceStep[]): string {
  return trace.map((step) => `${step.action} → [${step.from.toFixed(1)}, ${step.to.toFixed(1)}] @${step.spacing.toFixed(3)}px`).join("; ");
}

/**
 * Puts `target` on screen with wheel and drag, re-reading the page after every gesture, and
 * returns where it landed. Throws — with the trace — when the target is past the library's floor,
 * when a gesture asks for a history page and `allowPaging` is off, or when `maxIterations` gestures
 * did not land within the tolerance. Never stops "near". Ends with the pointer off the chart.
 */
export async function showView(page: Page, target: ViewTarget, options: ViewOptions = {}): Promise<ViewReached> {
  const allowPaging = options.allowPaging ?? false;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const trace: ViewTraceStep[] = [];
  let state = await readView(page);
  const requestedAtStart = state.pagesRequested;
  const drawnAtStart = state.pagesDrawn;
  let iterations = 0;
  let idle = 0;
  const fail = (why: string): never => {
    throw new Error(`view: ${describe(target)}: ${why}. trace: ${traceText(trace) || "(no gesture)"}`);
  };

  for (;;) {
    const goal = effectiveTarget(state, target, options.minBarSpacingPx);
    const goalSpan = goal.right - goal.left;
    const tolerance = options.toleranceSlots ?? Math.max(1, 0.02 * goalSpan);
    const span = state.toLogical - state.fromLogical;
    const landed = Math.abs(state.fromLogical - goal.left) <= tolerance && Math.abs(state.toLogical - goal.right) <= tolerance;
    if (landed) break;
    if (iterations >= maxIterations) {
      fail(`not reached in ${maxIterations} gestures: on screen [${state.fromLogical.toFixed(2)}, ${state.toLogical.toFixed(2)}], wanted [${goal.left.toFixed(2)}, ${goal.right.toFixed(2)}] ± ${tolerance.toFixed(2)}`);
    }
    iterations += 1;

    const floorSlots = state.plot.width / LIBRARY_MIN_BAR_SPACING_PX;
    const contains = state.fromLogical <= goal.left + tolerance && state.toLogical >= goal.right - tolerance;
    // The view the next gesture aims at: the goal itself when it is on screen; otherwise the hull of
    // the screen and the goal, so the goal comes into view — capped near the floor when it is far.
    let aim = { from: goal.left, to: goal.right };
    if (!contains) {
      const hull = { from: Math.min(state.fromLogical, goal.left), to: Math.max(state.toLogical, goal.right) };
      aim = hull;
      if (hull.to - hull.from > floorSlots * FAR_HULL_FRACTION_OF_FLOOR) aim = { from: Number.NaN, to: Number.NaN };
    }

    let action: string;
    if (Number.isNaN(aim.from)) {
      // Far: zoom out to near the floor (growing towards the goal), then walk with drags.
      const wide = floorSlots * FAR_ZOOM_FRACTION_OF_FLOOR;
      if (span < wide * 0.9) {
        const goalIsLeft = goal.left < state.fromLogical;
        const pivot = goalIsLeft ? state.toLogical : state.fromLogical;
        action = `zoom-out-far x${(span / wide).toFixed(3)}`;
        await wheelZoom(page, state, xOfLogical(state, pivot), span / wide);
      } else {
        // Walk towards CENTRING the goal, not towards touching it: an edge-to-edge walk ends in
        // drags of a few px, which the library does not take as a pan.
        const centredFrom = (goal.left + goal.right) / 2 - span / 2;
        const wantedDx = (state.fromLogical - centredFrom) * state.barSpacingPx;
        const dx = Math.sign(wantedDx) * Math.min(Math.abs(wantedDx), state.plot.width * MAX_DRAG_FRACTION);
        action = `walk ${dx.toFixed(0)}px`;
        await drag(page, state, dx);
      }
    } else if (Math.abs(aim.to - aim.from - span) > tolerance) {
      // Zoom so that the screen becomes `aim`: the cursor goes on the one logical point that a
      // scale of `s` around it maps `[from, to]` onto `[aim.from, aim.to]`.
      const s = (aim.to - aim.from) / span;
      const pivot = (aim.from - state.fromLogical * s) / (1 - s);
      action = `zoom x${(1 / s).toFixed(3)} at ${pivot.toFixed(1)}`;
      await wheelZoom(page, state, xOfLogical(state, pivot), 1 / s);
    } else {
      const wantedDx = (state.fromLogical - aim.from) * state.barSpacingPx;
      const dx = Math.sign(wantedDx) * Math.min(Math.abs(wantedDx), state.plot.width * MAX_DRAG_FRACTION);
      action = `pan ${dx.toFixed(1)}px`;
      await drag(page, state, dx);
    }
    // The crosshair off the chart before reading: the legend follows it, and some specs read the legend.
    await page.mouse.move(2, 2);

    const before = state;
    const moved = await waitForRangeChange(page, before);
    state = await settledView(page);
    trace.push({ action, from: state.fromLogical, to: state.toLogical, spacing: state.barSpacingPx });

    if (state.pagesRequested > before.pagesRequested) {
      if (!allowPaging) {
        fail(`the gesture requested a history page (requestedMs ${before.pagesRequested} → ${state.pagesRequested}) and allowPaging is off`);
      }
      const wanted = drawnAtStart + (state.pagesRequested - requestedAtStart);
      await page
        .waitForFunction((n) => (window.__historyPageLatencyProbe?.drawnMs.length ?? 0) >= n, wanted, { timeout: PAGE_DRAWN_TIMEOUT_MS })
        .catch(() => fail(`a history page was requested and not drawn in ${PAGE_DRAWN_TIMEOUT_MS} ms`));
      state = await settledView(page);
    }
    if (!moved && signature(state) === signature(before)) {
      idle += 1;
      if (idle >= MAX_IDLE_GESTURES) fail(`${idle} gestures in a row moved nothing`);
    } else {
      idle = 0;
    }
  }
  await page.mouse.move(2, 2);
  if (!allowPaging) {
    // A request fired by the last gesture's echo, after the read that ended the loop.
    await nextFrames(page);
    const after = await readView(page);
    if (after.pagesRequested > requestedAtStart) fail(`a history page was requested after landing (requestedMs ${requestedAtStart} → ${after.pagesRequested})`);
  }
  return { ...state, iterations, pagesRequestedDuring: state.pagesRequested - requestedAtStart, trace };
}
