import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import { colorTokens } from "../src/charts/color-tokens.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-02.4` — `CA-6` (plan `02` DoD 2-4): on BTCUSDT's REAL data, in the default TF
 * (`1m`), the ink read off the canvas on the column of volume bar `i` equals the direction of candle
 * `i` computed from the values `/series-history` serves, for `n >= 50` bars, with at least one up and
 * one down candle among them.
 *
 * ── WHY THE ZOOM, AND WHAT "PER BAR" MEANS HERE ───────────────────────────────────────────────────
 *
 * At the default framing a `1m` bar is ~0.5 px wide (`gates/T-02.2-design-gate.md` MF-4: 2210 slots on
 * ~1100 px); two bars share a pixel column and the column's ink is whichever was drawn last. Reading
 * "the colour of bar i" there is not a proposition the pixel can answer — which is exactly why the
 * column-agreement check of `gates/T-02.3-builder.md` gave 92% at `1m` and 100% at `15m`. So this spec
 * ZOOMS (mouse wheel over the right part of the pane, a bounded UI interaction, not a wait loop — R9)
 * until the bar spacing is `>= MIN_SPACING_PX`, and then only counts a bar whose ink run on the bars'
 * base row is `>= MIN_BAR_WIDTH_PX` wide around its centre. The spacing and the measured widths are
 * published as facts in every run.
 *
 * ── THE IDENTITY OF BAR `i`, FROM THE PAGE ITSELF ──────────────────────────────────────────────────
 *
 * The bars are found on the canvas: the bars' base row is segmented into runs of one bar ink (one run
 * per bar — the library leaves a 1 px gap between columns at this spacing). The pointer is moved to the
 * CENTRE of every run, the crosshair snaps to the bar under it, and the legend publishes that bar's
 * `data-legend-slot-index` and `data-legend-bucket-ms`. The identity is then CHECKED, not trusted: two
 * neighbouring runs must be named slots that differ by exactly the number of bar spacings between their
 * centres, and the price and volume legends must name the same slot. The candle's instant (the bucket)
 * is looked up in the rows `/series-history` serves for the four `klines_ohlc` keys — on the SAME window
 * and `knowledge_time_ms` the server declared on `<main>`. Two independent witnesses: the canvas (ink)
 * and the API (open/close).
 *
 * ── THE EXPECTED INK ───────────────────────────────────────────────────────────────────────────────
 *
 * `close > open` ⇒ `directionUpFill`; `close < open` ⇒ `directionDownFill`; `close === open` (doji) and
 * "no whole candle at that instant" ⇒ the neutral `provenanceWeak` (`charts/volume-direction.ts`, the
 * `T-02.1-DOJI` decision; `dojiItemColors().color === provenanceWeak`). The expectation is written here
 * from the API's numbers, never imported from `volumeBarColor` — importing it would make the spec agree
 * with whatever the function does, including the inverted comparator this spec exists to reject.
 *
 * ── INCONCLUSIVE IS NOT GREEN, AND THE TWO UNIVERSES ──────────────────────────────────────────────
 *
 *   WEAK   (sqlite, what `make e2e`/`make verify` compose): `/series-history` refuses (`500`), there is
 *          no candle and no bar to compare. The real-data test is SKIPPED with the reason (a skip is
 *          not a pass); what runs is the instrument's own bite (`judgeBars` on synthetic readings).
 *   STRONG (Postgres with a reader): the full `CA-6`. Fewer than `MIN_COMPARED_BARS` bars read, or no
 *          up bar, or no down bar ⇒ the test FAILS with `INCONCLUSIVO`, never passes.
 *
 * ⛔ ABLATION (plan `02` DoD 3): the comparator inverted in `volumeBarColor` (`>` → `<`) must fail this
 * spec. That needs a rebuild, so it is run by hand and recorded in `gates/T-02.4-builder.md`. What runs
 * in EVERY strong run is the instrument-side twin: the same screen reading judged against the INVERTED
 * expectation must be rejected — the proof that this reading discriminates the two inks on this data.
 *
 * NOTHING IS WRITTEN TO ANY DATABASE. Reading the source is not test data (`SPEC-007 §3.7`).
 *
 * Run by hand against the live stack: `E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1
 * E2E_BASE_URL=http://127.0.0.1:<next port> npx playwright test 30-volume-direction-per-bar-real-data`.
 */

const SPEC = "30-volume-direction-per-bar-real-data";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PRICE_PANE_TESTID = "price-pane";
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";

/** Plan `02` DoD 2: `n >= 50` bars compared. */
const MIN_COMPARED_BARS = 50;
/** The bar's ink run on the base row, in CSS px, below which "the colour of bar i" is not read. The
 * `T-02.2` design gate measured ~0.19-0.5 px per bar at the default framing; `3` is the floor the
 * dispatch set for a per-bar reading. */
const MIN_BAR_WIDTH_PX = 3;
/** The zoom stops once the spacing reaches this. The library leaves a 1 px gap between histogram
 * columns, so `6` px of spacing gives a bar of ~5 px, above `MIN_BAR_WIDTH_PX` with margin. */
const MIN_SPACING_PX = 6;
/** Keep at least this many slots on screen — `MIN_COMPARED_BARS` plus room for absent bars. */
const MIN_VISIBLE_SLOTS = 90;
const ZOOM_STEP_DELTA = -200;
const ZOOM_BURST = 5;
const MAX_ZOOM_STEPS = 160;
/** How far (fraction of the pane width) the zoom anchor sits: on the right, where the data is. */
const ZOOM_ANCHOR_FRACTION = 0.8;
/** Colour distance, per channel, for an ink to match a token (anti-aliasing never reaches the centre
 * of a >= 3 px bar; this only absorbs rounding). */
const CHANNEL_TOLERANCE = 12;

type Ink = "up" | "down" | "neutral";

// ── The API under test ─────────────────────────────────────────────────────────────────────────

interface CatalogEntryWire {
  readonly key: SeriesKey;
}

interface HistoryRow {
  readonly event_time: number;
  readonly value: string | null;
}

interface RenderedRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

/** One `fetch` retry, only on a transport error — same measured reason `08`/`09`/`15` document. */
async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    return await fetch(url);
  }
}

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/series-catalog`);
  if (!response.ok) throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  return ((await response.json()) as { entries: readonly CatalogEntryWire[] }).entries;
}

/** The SAME question the page asks (`1m` grid, `final_only`), on the window the server declared. The
 * body is read as TEXT first: the weak universe answers `Internal Server Error`, and `json()` would
 * trade the status — which decides the universe — for a `SyntaxError`. */
async function fetchSeriesHistory(
  seriesKeyId: string,
  request: RenderedRequest,
): Promise<{ readonly status: number; readonly rows: readonly HistoryRow[] }> {
  const query = new URLSearchParams({
    series_key_id: seriesKeyId,
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: String(request.windowStartMs),
    window_end_ms: String(request.windowEndMsInclusive),
    knowledge_time_ms: String(request.knowledgeTimeMs),
    bar_policy: "final_only",
  });
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/series-history?${query.toString()}`);
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

/** Does this deployment have a window reader of `md.series`? Asked of the API itself (`/ready`'s
 * `store.path`), never of an env var — an env var here would be an allowlist in disguise. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") throw new Error("GET /ready did not publish store.path");
  return !storePath.endsWith(".sqlite3");
}

const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

interface ApiCandle {
  readonly open: number;
  readonly close: number;
}

/** The four `klines_ohlc` keys of the symbol, assembled into candles by the panel's own rule: a bucket
 * with 1..3 of the four readings is a gap, not a candle (`assembleOhlcCandles`). */
async function fetchApiCandles(
  entries: readonly CatalogEntryWire[],
  request: RenderedRequest,
): Promise<{ readonly statuses: readonly number[]; readonly candles: ReadonlyMap<number, ApiCandle> }> {
  const readings: Record<string, Map<number, number>> = {};
  const statuses: number[] = [];
  for (const reduction of OHLC_REDUCTIONS) {
    const entry = entries.find(
      (candidate) =>
        candidate.key.metric === "klines_ohlc" && candidate.key.instrumentId === SYMBOL && candidate.key.reduction === reduction,
    );
    if (entry === undefined) throw new Error(`the served catalog has no klines_ohlc/${reduction} for ${SYMBOL}`);
    const { status, rows } = await fetchSeriesHistory(computeSeriesKeyId(entry.key), request);
    statuses.push(status);
    const map = new Map<number, number>();
    for (const row of rows) if (row.value !== null) map.set(row.event_time, Number(row.value));
    readings[reduction] = map;
  }
  const candles = new Map<number, ApiCandle>();
  for (const [time, open] of readings.OPEN!) {
    const close = readings.CLOSE!.get(time);
    if (readings.HIGH!.has(time) && readings.LOW!.has(time) && close !== undefined) candles.set(time, { open, close });
  }
  return { statuses, candles };
}

async function fetchApiVolume(
  entries: readonly CatalogEntryWire[],
  request: RenderedRequest,
): Promise<ReadonlyMap<number, number>> {
  const entry = entries.find((candidate) => candidate.key.metric === "klines_volume" && candidate.key.instrumentId === SYMBOL);
  if (entry === undefined) throw new Error(`the served catalog has no klines_volume for ${SYMBOL}`);
  const { rows } = await fetchSeriesHistory(computeSeriesKeyId(entry.key), request);
  const map = new Map<number, number>();
  for (const row of rows) if (row.value !== null) map.set(row.event_time, Number(row.value));
  return map;
}

/** The ink the bar of this candle must have, written from the API's numbers (see the file docstring:
 * NOT imported from `volumeBarColor`). */
function expectedInk(candle: ApiCandle | undefined): Ink {
  if (candle === undefined || candle.close === candle.open) return "neutral";
  return candle.close > candle.open ? "up" : "down";
}

// ── The judge: pure, and bitten in both universes ──────────────────────────────────────────────

interface BarReading {
  readonly slotIndex: number;
  readonly bucketMs: number;
  /** What the API says the bar's ink must be. */
  readonly expected: Ink;
  /** What the canvas shows on the bar's base row, at its centre. */
  readonly observed: Ink;
  readonly widthPx: number;
}

interface BarVerdict {
  readonly compared: number;
  readonly comparedUp: number;
  readonly comparedDown: number;
  readonly comparedNeutral: number;
  readonly agreeing: number;
  readonly disagreements: readonly BarReading[];
  /** `INCONCLUSIVO` reason, or `null` when the window can answer the question at all. */
  readonly inconclusive: string | null;
}

function judgeBars(readings: readonly BarReading[]): BarVerdict {
  const compared = readings.length;
  const comparedUp = readings.filter((r) => r.expected === "up").length;
  const comparedDown = readings.filter((r) => r.expected === "down").length;
  const comparedNeutral = compared - comparedUp - comparedDown;
  const disagreements = readings.filter((r) => r.observed !== r.expected);
  let inconclusive: string | null = null;
  if (compared < MIN_COMPARED_BARS) inconclusive = `only ${compared} bars read (< ${MIN_COMPARED_BARS})`;
  else if (comparedUp === 0) inconclusive = "no up candle among the bars read";
  else if (comparedDown === 0) inconclusive = "no down candle among the bars read";
  return { compared, comparedUp, comparedDown, comparedNeutral, agreeing: compared - disagreements.length, disagreements, inconclusive };
}

/** The verdict is GREEN only if the window can answer and every bar agrees. */
function isGreen(verdict: BarVerdict): boolean {
  return verdict.inconclusive === null && verdict.agreeing === verdict.compared;
}

/** The instrument-side twin of the comparator ablation: the expectation up↔down swapped. */
function invertExpectation(readings: readonly BarReading[]): BarReading[] {
  const swap = (ink: Ink): Ink => (ink === "up" ? "down" : ink === "down" ? "up" : ink);
  return readings.map((r) => ({ ...r, expected: swap(r.expected) }));
}

test(`MORDE do instrumento: o juiz por barra REJEITA comparador invertido e janela de uma direção só, e CALA sobre a leitura certa (${SPEC})`, () => {
  // Synthetic readings only — nothing here touches a database. Runs in BOTH universes, so the gate
  // (weak universe) still executes the judge's bite even where no real bar can be read.
  const bar = (i: number, expected: Ink, observed: Ink = expected): BarReading => ({
    slotIndex: i,
    bucketMs: i * 60_000,
    expected,
    observed,
    widthPx: 5,
  });
  const mixed = Array.from({ length: 60 }, (_u, i) => bar(i, i % 3 === 0 ? "up" : i % 3 === 1 ? "down" : "neutral"));
  // CALA: the right reading, both directions, n = 60.
  expect(isGreen(judgeBars(mixed))).toBe(true);
  // MORDE (1): the comparator inverted on the screen side — every up bar drawn down and vice versa.
  const invertedScreen = mixed.map((r) => ({ ...r, observed: r.expected === "up" ? "down" : r.expected === "down" ? "up" : r.expected }) as BarReading);
  expect(isGreen(judgeBars(invertedScreen))).toBe(false);
  // ...and the instrument-side twin rejects the right reading too.
  expect(isGreen(judgeBars(invertExpectation(mixed)))).toBe(false);
  // MORDE (2): ONE bar off is enough — the verdict is per bar, not a majority.
  expect(isGreen(judgeBars(mixed.map((r, i) => (i === 7 ? { ...r, observed: "neutral" as Ink } : r))))).toBe(false);
  // MORDE (3): a window with only up candles is INCONCLUSIVO, not green, even with 100% agreement.
  const onlyUp = Array.from({ length: 60 }, (_u, i) => bar(i, "up"));
  expect(judgeBars(onlyUp).inconclusive).toMatch(/no down candle/);
  expect(isGreen(judgeBars(onlyUp))).toBe(false);
  // MORDE (4): n = 49 is below the floor.
  expect(isGreen(judgeBars(mixed.slice(0, MIN_COMPARED_BARS - 1)))).toBe(false);
  expect(isGreen(judgeBars(mixed.slice(0, MIN_COMPARED_BARS)))).toBe(true);
});

// ── The screen ─────────────────────────────────────────────────────────────────────────────────

function rgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`rgb: ${hex} is not #rrggbb — the tokens changed spelling`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

async function priceCanvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).locator("xpath=../canvas").first().boundingBox();
  if (box === null) throw new Error("the price pane's canvas has no box — nothing was mounted");
  return box;
}

async function visibleRange(page: Page): Promise<{ from: number; to: number }> {
  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  const from = Number(await host.getAttribute("data-visible-logical-from"));
  const to = Number(await host.getAttribute("data-visible-logical-to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error(`the host did not publish a usable visible logical range (${from}..${to})`);
  }
  return { from, to };
}

/** One contiguous run of a single bar ink on the bars' base row, in CSS px of the canvas box. */
interface InkRun {
  readonly ink: Ink;
  readonly leftPx: number;
  /** Exclusive. */
  readonly rightPx: number;
}

interface BaseRowReading {
  readonly barBaseRow: number;
  readonly runs: readonly InkRun[];
}

/**
 * Segments the bars' BASE row (where only bars draw) into runs of one bar ink. With the spacing of the
 * zoom, the library leaves a 1 px gap between two histogram columns, so one run is one bar — also when
 * two neighbours share the ink `[MEDIDO 2026-09-26: runs of 7-8 px every 8.64 px, four "down" in a row
 * still four runs]`. A run wider than 1.5x the spacing would be two bars merged; the caller refuses it.
 *
 * ⚠️ WHY NOT THE LINEAR x OF THE LOGICAL RANGE: `(i + 0.5 - from) / (to - from) * width` drifts ~1.6 px
 * every 27 slots against the drawn bars (`from`/`to` are not measured on the canvas width), and past
 * the middle of the pane the pointer landed on the left edge of bar `i` and the crosshair snapped to
 * `i - 1` — 72 of 126 targets `[MEDIDO 2026-09-26]`. The runs are what the canvas drew.
 */
async function readBaseRowRuns(page: Page): Promise<BaseRowReading> {
  const tokens = colorTokens();
  return page.evaluate(
    ({ testid, up, down, neutral, tolerance }) => {
      const pane = document.querySelector(`[data-testid="${testid}"]`);
      if (pane === null) throw new Error(`no [data-testid="${testid}"] on the page`);
      const siblings = Array.from(pane.parentElement?.children ?? []).filter((c) => c instanceof HTMLCanvasElement);
      const canvas = (siblings as HTMLCanvasElement[]).find((c) => c.width > 200 && c.height > 100);
      if (canvas === undefined) throw new Error("the price pane has no chart canvas with area");
      const width = canvas.width;
      const height = canvas.height;
      const cssToCanvas = width / canvas.getBoundingClientRect().width;
      const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const near = (at: number, c: readonly number[]) =>
        Math.abs(data[at]! - c[0]!) <= tolerance && Math.abs(data[at + 1]! - c[1]!) <= tolerance && Math.abs(data[at + 2]! - c[2]!) <= tolerance;
      const inkAt = (x: number, rowFromFloor: number): "up" | "down" | "neutral" | null => {
        const at = ((height - 1 - rowFromFloor) * width + x) * 4;
        if (data[at + 3] === 0) return null;
        if (near(at, up)) return "up";
        if (near(at, down)) return "down";
        if (near(at, neutral)) return "neutral";
        return null;
      };
      // The base: the first row from the floor with bar ink in at least a third of the columns.
      const scanRows = Math.ceil(height * 0.3);
      let barBaseRow = -1;
      for (let r = 0; r < scanRows && barBaseRow < 0; r += 1) {
        let inked = 0;
        for (let x = 0; x < width; x += 1) if (inkAt(x, r) !== null) inked += 1;
        if (inked >= width / 3) barBaseRow = r;
      }
      if (barBaseRow < 0) throw new Error("no bars' base row found in the bottom 30% of the price pane");
      const runs: { ink: "up" | "down" | "neutral"; leftPx: number; rightPx: number }[] = [];
      let x = 0;
      while (x < width) {
        const ink = inkAt(x, barBaseRow);
        if (ink === null) {
          x += 1;
          continue;
        }
        const left = x;
        while (x < width && inkAt(x, barBaseRow) === ink) x += 1;
        runs.push({ ink, leftPx: left / cssToCanvas, rightPx: x / cssToCanvas });
      }
      return { barBaseRow, runs };
    },
    {
      testid: PRICE_PANE_TESTID,
      up: [...rgb(tokens.directionUpFill)],
      down: [...rgb(tokens.directionDownFill)],
      neutral: [...rgb(tokens.provenanceWeak)],
      tolerance: CHANNEL_TOLERANCE,
    },
  );
}

/** Wheel-zooms over the right part of the price pane until the spacing reaches `MIN_SPACING_PX`,
 * without going below `MIN_VISIBLE_SLOTS` on screen. A bounded UI interaction (R9). */
async function zoomToPerBarSpacing(page: Page): Promise<{ readonly steps: number; readonly spacingPx: number }> {
  const box = await priceCanvasBox(page);
  const anchorX = box.x + box.width * ZOOM_ANCHOR_FRACTION;
  const midY = box.y + box.height / 2;
  let { from, to } = await visibleRange(page);
  let steps = 0;
  const spacing = () => box.width / (to - from);
  while (steps < MAX_ZOOM_STEPS && spacing() < MIN_SPACING_PX && to - from > MIN_VISIBLE_SLOTS) {
    await page.mouse.move(anchorX, midY);
    for (let i = 0; i < ZOOM_BURST; i += 1) await page.mouse.wheel(0, ZOOM_STEP_DELTA);
    steps += ZOOM_BURST;
    await page.waitForTimeout(250);
    ({ from, to } = await visibleRange(page));
  }
  return { steps, spacingPx: spacing() };
}

async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  expect(response?.status(), "GET /symbol did not answer 200").toBe(200);
  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "the page does not declare its own request (data-window-start-ms)").toHaveCount(1);
  const num = async (name: string) => {
    const raw = await main.getAttribute(name);
    const value = Number(raw);
    if (raw === null || raw === "" || !Number.isFinite(value)) throw new Error(`${name} is ${JSON.stringify(raw)}`);
    return value;
  };
  return {
    windowStartMs: await num("data-window-start-ms"),
    windowEndMsInclusive: await num("data-window-end-ms-inclusive"),
    knowledgeTimeMs: await num("data-knowledge-time-ms"),
  };
}

test(`CA-6: no dado real, a cor da barra de volume i no canvas é a direção da vela i na API, n >= ${MIN_COMPARED_BARS}, TF 1m com zoom (${SPEC})`, async ({
  page,
}) => {
  test.setTimeout(400_000);
  const request = await loadRenderedRequest(page);
  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);
  const entries = await fetchCatalogEntries();
  const { statuses, candles } = await fetchApiCandles(entries, request);
  fact(SPEC, "ohlc_series_history_statuses", statuses);
  fact(SPEC, "api_candles_in_window", candles.size);

  if (!readerPresent) {
    // WEAK universe: the route must REFUSE loudly (never a 200 with an invented grid), and then there
    // is no candle and no bar to read. A skip is declared, not a pass.
    expect(statuses.every((status) => status === 500), "without a window reader /series-history must refuse").toBe(true);
    fact(SPEC, "universe", "FRACO");
    test.skip(true, "universo FRACO: /series-history recusa, não há vela nem barra de dado real para ler — CA-6 não é mensurável aqui");
    return;
  }
  fact(SPEC, "universe", "FORTE");
  expect(statuses.every((status) => status === 200)).toBe(true);
  const volumeByTime = await fetchApiVolume(entries, request);
  fact(SPEC, "api_volume_rows_with_value", volumeByTime.size);

  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", { timeout: 60_000 });
  const subAxis = page.locator(`[data-testid="${VOLUME_SUBAXIS_TESTID}"]`);
  await expect
    .poll(async () => Number(await subAxis.getAttribute("data-volume-present-points")), { timeout: 60_000 })
    .toBeGreaterThan(0);

  const before = await visibleRange(page);
  const box = await priceCanvasBox(page);
  fact(SPEC, "default_framing", { tf: "1m", slots: before.to - before.from, spacingPx: box.width / (before.to - before.from) });
  const zoom = await zoomToPerBarSpacing(page);
  await page.waitForTimeout(500);
  const { from, to } = await visibleRange(page);
  fact(SPEC, "zoom", { steps: zoom.steps, from, to, visibleSlots: to - from, spacingPx: zoom.spacingPx, canvasCssWidth: box.width });
  expect(zoom.spacingPx, `the zoom did not reach ${MIN_SPACING_PX} px per bar — no per-bar reading is possible`).toBeGreaterThanOrEqual(MIN_SPACING_PX);

  const spacingPx = box.width / (to - from);
  const screen = await readBaseRowRuns(page);
  fact(SPEC, "bar_base_row", screen.barBaseRow);
  // Bars wholly inside the canvas (a bar's margin at each edge), one run per bar.
  const inside = screen.runs.filter((run) => run.leftPx >= spacingPx && run.rightPx <= box.width - spacingPx);
  const merged = inside.filter((run) => run.rightPx - run.leftPx > 1.5 * spacingPx);
  const narrowBars = inside.filter((run) => run.rightPx - run.leftPx < MIN_BAR_WIDTH_PX).length;
  expect(merged, "a run of bar ink wider than 1.5 bar spacings — two bars merged, the per-bar reading is not possible").toHaveLength(0);
  const targets = inside.filter((run) => run.rightPx - run.leftPx >= MIN_BAR_WIDTH_PX);

  // The page's own identity of each bar: the pointer at the run's CENTRE, the crosshair snaps to the
  // bar under it, and the legend publishes its slot and its bucket.
  const midY = box.y + box.height * 0.5;
  const identities: { run: InkRun; centrePx: number; slot: number; bucketMs: number; volumeSlot: number }[] = [];
  await page.mouse.move(box.x + 2, midY, { steps: 5 });
  await expect(page.locator('[data-legend-value="price"]')).toHaveAttribute("data-legend-source", "crosshair");
  let previousSlot = "none";
  for (const run of targets) {
    const centrePx = (run.leftPx + run.rightPx) / 2;
    await page.mouse.move(box.x + centrePx, midY, { steps: 2 });
    // The legend re-renders frames after the crosshair event: read it once it has LEFT the previous
    // target's slot. Consecutive runs are distinct bars, so the change is owed; if it never comes, the
    // stale slot is read and the identity assertion below names it.
    await page
      .waitForFunction(
        (previous) => document.querySelector<HTMLElement>('[data-legend-value="price"]')?.dataset.legendSlotIndex !== previous,
        previousSlot,
        { timeout: 1_500 },
      )
      .catch(() => undefined);
    const legend = await page.evaluate(() => {
      const price = document.querySelector<HTMLElement>('[data-legend-value="price"]');
      const volume = document.querySelector<HTMLElement>('[data-legend-value="volume"]');
      const num = (raw: string | undefined) => (raw === undefined || raw === "" ? Number.NaN : Number(raw));
      return { slot: num(price?.dataset.legendSlotIndex), bucket: num(price?.dataset.legendBucketMs), volumeSlot: num(volume?.dataset.legendSlotIndex) };
    });
    previousSlot = String(legend.slot);
    identities.push({ run, centrePx, slot: legend.slot, bucketMs: legend.bucket, volumeSlot: legend.volumeSlot });
  }
  // The pointer leaves the chart; the screen must not have moved while the bars were identified.
  await page.mouse.move(2, 2, { steps: 5 });
  await page.waitForTimeout(300);
  const after = await visibleRange(page);
  expect(after.from, "the visible range moved while the bars were being identified").toBeCloseTo(from, 3);
  const screenAfter = await readBaseRowRuns(page);
  expect(screenAfter.runs, "the bars on screen changed while they were being identified").toEqual(screen.runs);

  // ⛔ The identity check: the slot the legend names for two neighbouring runs differs by exactly the
  // number of bar spacings between their centres. A pointer that lands on the wrong bar breaks it.
  let identityBreaks = 0;
  for (let k = 1; k < identities.length; k += 1) {
    const expectedDelta = Math.round((identities[k]!.centrePx - identities[k - 1]!.centrePx) / spacingPx);
    if (identities[k]!.slot - identities[k - 1]!.slot !== expectedDelta) identityBreaks += 1;
  }
  const volumeLegendDisagrees = identities.filter((id) => id.volumeSlot !== id.slot).length;
  fact(SPEC, "identity", { targets: identities.length, identityBreaks, volumeLegendDisagrees, spacingPx });
  expect(identityBreaks, "the legend's slot does not step with the bars on screen — bar i is not identified").toBe(0);
  expect(volumeLegendDisagrees, "the price and volume legends name different slots under the same pointer").toBe(0);

  const bars: BarReading[] = [];
  let neutralWithoutCandle = 0;
  let barWithoutApiVolume = 0;
  let outsideWindow = 0;
  for (const id of identities) {
    if (!Number.isFinite(id.bucketMs) || id.bucketMs < request.windowStartMs || id.bucketMs > request.windowEndMsInclusive) {
      outsideWindow += 1;
      continue;
    }
    const apiVolume = volumeByTime.get(id.bucketMs);
    // A bar on screen where the API has no (positive) volume is a wiring defect of its own.
    if (apiVolume === undefined || apiVolume <= 0) {
      barWithoutApiVolume += 1;
      continue;
    }
    if (!candles.has(id.bucketMs)) neutralWithoutCandle += 1;
    bars.push({
      slotIndex: id.slot,
      bucketMs: id.bucketMs,
      expected: expectedInk(candles.get(id.bucketMs)),
      observed: id.run.ink,
      widthPx: id.run.rightPx - id.run.leftPx,
    });
  }
  const widths = bars.map((b) => b.widthPx).sort((a, b) => a - b);
  fact(SPEC, "bar_width_px", { min: widths[0] ?? null, median: widths[Math.floor(widths.length / 2)] ?? null, max: widths.at(-1) ?? null });
  fact(SPEC, "skipped", { runsOnScreen: screen.runs.length, narrowBars, barWithoutApiVolume, outsideWindow });
  fact(SPEC, "neutral_expected_without_whole_candle", neutralWithoutCandle);
  fact(SPEC, "slots_and_buckets", {
    firstSlot: bars[0]?.slotIndex ?? null,
    lastSlot: bars.at(-1)?.slotIndex ?? null,
    firstBucketMs: bars[0]?.bucketMs ?? null,
    lastBucketMs: bars.at(-1)?.bucketMs ?? null,
  });

  const verdict = judgeBars(bars);
  fact(SPEC, "verdict", {
    compared: verdict.compared,
    up: verdict.comparedUp,
    down: verdict.comparedDown,
    neutral: verdict.comparedNeutral,
    agreeing: verdict.agreeing,
    inconclusive: verdict.inconclusive,
    firstDisagreements: verdict.disagreements.slice(0, 8),
  });
  const inverted = judgeBars(invertExpectation(bars));
  fact(SPEC, "instrument_inverted_comparator", { agreeing: inverted.agreeing, compared: inverted.compared });

  expect(barWithoutApiVolume, "bars drawn where the API serves no positive volume").toBe(0);
  // INCONCLUSIVE is not green.
  expect(verdict.inconclusive, `INCONCLUSIVO: ${verdict.inconclusive ?? ""}`).toBeNull();
  expect(
    verdict.agreeing,
    `CA-6: the bar ink equals the API candle's direction in ${verdict.agreeing}/${verdict.compared} bars`,
  ).toBe(verdict.compared);
  // The instrument-side ablation, on THIS reading: the inverted comparator must be rejected.
  expect(isGreen(inverted), "the same reading also agrees with the INVERTED comparator — the instrument does not discriminate").toBe(false);
});
