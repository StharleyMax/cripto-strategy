import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens, OI_REGIME_BAND_SURFACE, SURFACE_BASE } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, waitForChartSettled, type NextInstanceHandle } from "./helpers.ts";
import { readView, showView, type ViewTarget } from "./view.ts";

/**
 * `paineis-de-fluxo` `T-03.12` (plan `03` item `3b.5`, `Q-OI-3`, `[Q-DG-3]`) — the regime marks of the
 * OI pane, read off the canvas and the DOM of the real app (`next start`, secondary instance), each
 * with its ablation. The form is `gates/T-03.12-design-gate.md` (`APPROVED` in its §8-r3), and the
 * criteria below are its §4:
 *
 *   RM-1 (`Q-1`, `Q-3`)  the DOM facts of the derivation: 3 bands (before a hole inside A, after it up
 *        to the capture, and a 1-candle island), 3 rules (A→B at the capture, B→A and A→B around the
 *        island), each at the instant `oi-regime-marks.ts` puts it — never at a hand-written one.
 *   RM-2 (`Q-2`)         pixel: inside a band the modal background is `--sup-regime` `#1e2230`, outside
 *        it `--sup-base` `#131722`. ABLATION `?e2eOiRegimeMarks=0`: the two modes are equal.
 *   RM-3 (`DG-2`)        pixel: a `provenanceWeak` column across the pane at each rule. ABLATION: none.
 *   RM-4 (`DG-3`, `Q-7`) the labels `amostras 5m`/`amostras 1m` are there (two regimes visible), inside
 *        the reserved strip (below the legend, above the scale), over no candle ink. ABLATION: none.
 *   RM-5 (`Q-4` (iv))    `1m`: the legend over a pre-capture candle AND over a polled one shows the one
 *        cell `H/L não medidos` and no H/L numeral; the root keeps the served numbers.
 *   RM-6 (`Q-5`, `Q-4` (iii)) `5m`: over the last A candle (1/1, anchored: 2 readings) the cell; over a
 *        polled candle with 2/5 + anchor and a wick (3 readings) the two numerals. The legend's width
 *        is the same ± 1 px in both.
 *
 * ── WHY A LOCAL STUB ─────────────────────────────────────────────────────────────────────────
 *
 * The posture of `e2e/24`/`e2e/36`: the CATALOG is the real one, read from the e2e API; only the
 * values are synthetic. Nothing is written to Postgres (`memory: nao-seedar-teste-no-postgres`).
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (or `npx playwright test 37-oi-regime`).
 */

const SPEC = "37-oi-regime-marks-pixel";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const OI_PANE_TESTID = "oi-pane";
const MIN = 60_000;
const FIVE = 5 * MIN;
const HOUR = 60 * MIN;
const TOL = 2;
const INK_TOLERANCE = 12;

const A = "binance_point_5m";
const B = "binance_poll_1m";
type OiSource = typeof A | typeof B;

/** The instants of the scenario, all 5-minute aligned, relative to the load (`1m` layout). */
const NOW5 = Math.floor(Date.now() / FIVE) * FIVE;
const HOLE_FROM = NOW5 - 30 * HOUR; // last A before the hole inside A
const HOLE_TO = NOW5 - 27 * HOUR; // first A after it
const CAPTURE_LAST_A = NOW5 - 16 * HOUR; // last A; the first polled candle is 4 min later
const ISLAND_A = NOW5 - 6 * HOUR; // the 1-candle island of A, with the last B 3 min before it

interface StubOiCandle {
  readonly bucket_end_ms: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly open_at_ms: number;
  readonly close_at_ms: number;
  readonly samples: { readonly present: number; readonly expected: number };
  readonly closed: boolean;
  readonly derived_from: OiSource;
}

/** Which source serves `t` in the `1m` layout (`null` = no candle). */
function source1m(t: number): OiSource | null {
  if (t <= CAPTURE_LAST_A) {
    if (t % FIVE !== 0 || (t > HOLE_FROM && t < HOLE_TO)) return null;
    return A;
  }
  if (t < CAPTURE_LAST_A + 4 * MIN) return null; // the suppression blanks of the change
  if (t === ISLAND_A) return A;
  if (t > ISLAND_A - 3 * MIN && t < ISLAND_A) return null;
  return B;
}

/** The `5m` layout: A up to `CAPTURE_LAST_A` (1/1, anchored), B after it (5/5, or 2/5 at the probe). */
const PROBE_B_5M = CAPTURE_LAST_A + 3 * FIVE;

function level(t: number, derivedFrom: OiSource): number {
  return (derivedFrom === A ? 50_000 : 50_120) + (Math.round(t / MIN) % 9) * 6;
}

function oiCandle(t: number, interval: string, knowledgeMs: number): StubOiCandle | null {
  const up = Math.round(t / MIN) % 3 !== 0;
  if (interval === "5m") {
    if (t % FIVE !== 0) return null;
    const derivedFrom: OiSource = t <= CAPTURE_LAST_A ? A : B;
    const base = level(t, derivedFrom);
    const [open, close] = up ? [base, base + 30] : [base + 30, base];
    // A: 1 reading + the anchor = 2 → H/L are O/C by construction. B: a measured wick.
    const wick = derivedFrom === B ? 12 : 0;
    const present = derivedFrom === A ? 1 : t === PROBE_B_5M ? 2 : 5;
    return {
      bucket_end_ms: t,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - (derivedFrom === B && t !== PROBE_B_5M ? wick : 0),
      close,
      open_at_ms: t - FIVE,
      close_at_ms: t,
      samples: { present, expected: derivedFrom === A ? 1 : 5 },
      closed: t <= knowledgeMs,
      derived_from: derivedFrom,
    };
  }
  const derivedFrom = source1m(t);
  if (derivedFrom === null) return null;
  const base = level(t, derivedFrom);
  const [open, close] = up ? [base, base + 30] : [base + 30, base];
  return {
    bucket_end_ms: t,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    open_at_ms: t - (derivedFrom === A ? FIVE : MIN),
    close_at_ms: t,
    samples: { present: 1, expected: 1 },
    closed: t <= knowledgeMs,
    derived_from: derivedFrom,
  };
}

function syntheticValue(key: SeriesKey, t: number): string {
  const minute = Math.round(t / MIN);
  switch (key.metric) {
    case "klines_ohlc": {
      const open = 100 + (minute % 5);
      const close = open + (minute % 2 === 0 ? 1 : -1);
      if (key.reduction === "OPEN") return String(open);
      if (key.reduction === "HIGH") return String(Math.max(open, close) + 0.5);
      if (key.reduction === "LOW") return String(Math.min(open, close) - 0.5);
      return String(close);
    }
    case "sum_open_interest":
      return String(50_000 + (minute % 9) * 6);
    case "cvd_source":
      return String((minute % 11) - 5);
    case "sum_liquidation":
      return String(1 + (minute % 9));
    case "count_long_short_ratio":
      return String(0.5 + (minute % 13) / 512);
    default:
      return String(10 + (minute % 17));
  }
}

interface CatalogEnvelope {
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

interface StubHandle {
  readonly url: string;
  readonly served: Map<string, Map<number, StubOiCandle>>;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
  const served = new Map<string, Map<number, StubOiCandle>>();
  const server = http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (incoming.pathname.endsWith("/series-history")) {
      const startMs = Number(incoming.searchParams.get("window_start_ms"));
      const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
      const knowledgeParam = Number(incoming.searchParams.get("knowledge_time_ms"));
      const knowledge = Number.isFinite(knowledgeParam) ? knowledgeParam : Date.now();
      const interval = incoming.searchParams.get("interval") ?? "1m";
      const stepMs = interval === "5m" ? FIVE : MIN;
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
      const key = keysById.get(seriesKeyId);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`T-03.12 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      const candles: StubOiCandle[] = [];
      const byInterval = served.get(interval) ?? new Map<number, StubOiCandle>();
      served.set(interval, byInterval);
      const first = Math.ceil(startMs / stepMs) * stepMs;
      for (let t = first; t <= endMsInclusive; t += stepMs) {
        rows.push({ event_time: t, available_at: t, value: syntheticValue(key, t), absence: null, coverage: null });
        if (key.metric === "sum_open_interest") {
          const candle = oiCandle(t, interval, knowledge);
          if (candle !== null) {
            candles.push(candle);
            byInterval.set(t, candle);
          }
        }
      }
      const bucket = interval === "5m" ? FIVE : MIN;
      const oiBlock =
        key.metric === "sum_open_interest"
          ? {
              timeframe_ms: bucket,
              sources: [
                { derived_from: A, series_key_id: seriesKeyId, native_grid_ms: FIVE, bucket_interval_ms: FIVE },
                { derived_from: B, series_key_id: "t-03-12-stub-poll", native_grid_ms: MIN, bucket_interval_ms: bucket },
              ],
              candles,
            }
          : null;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-03.12-synthetic-values",
            nature: key.nature,
            unit: key.unit,
            coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
          },
          rows,
          oi_candles: oiBlock,
          knowledge_time: knowledge,
          bar_policy: "final_only",
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("T-03.12 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-03.12 stub: no port");
  return { url: `http://127.0.0.1:${address.port}`, served, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

const toHex = (rgb: readonly number[]) => `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
const near = (rgb: readonly number[], hex: string, tol: number) => hexToRgb(hex).every((channel, index) => Math.abs(channel - rgb[index]!) <= tol);

async function openSymbol(page: Page, baseUrl: string, query = ""): Promise<void> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH}${query} não respondeu ok`).toBe(true);
  await expect(page.locator(".tv-lightweight-charts").first()).toBeVisible({ timeout: 120_000 });
  await waitForChartSettled(page);
}

interface Frame {
  readonly from: number;
  readonly to: number;
  readonly windowStartMs: number;
  /** `T-05.1`: the axis slot is the timeframe's own bar (`5m` → 5 min), no longer always 1 min. */
  readonly stepMs: number;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

async function frameOf(page: Page, stepMs: number = MIN): Promise<Frame> {
  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  const from = Number(await host.getAttribute("data-visible-logical-from"));
  const to = Number(await host.getAttribute("data-visible-logical-to"));
  const windowStartMs = Number(await page.locator("main[data-window-start-ms]").getAttribute("data-window-start-ms"));
  const box = (await page.locator(`[data-testid="${OI_PANE_TESTID}"]`).boundingBox())!;
  return { from, to, windowStartMs, stepMs, box };
}

/** Page x of the RIGHT edge of the slot at `ms` — the same `index + 0.5` the primitive draws at. */
function edgeX(frame: Frame, ms: number): number {
  const logical = (ms - frame.windowStartMs) / frame.stepMs + 0.5;
  return frame.box.x + ((logical - frame.from) / (frame.to - frame.from)) * frame.box.width;
}

/** `paineis-de-fluxo` `T-06.1` — every test puts its view on screen explicitly (`view.ts::showView`),
 * not wherever the mount frames (`VIEW_BARS`, 2 h at `1m` and 10 h at `5m` since `T-05.1`, while the
 * scenario reaches 30 h back). `1m`: the LAST `REGIME_VIEW_BARS_1M` slots — near the library's
 * `minBarSpacing` floor, the geometry the mount had before `T-05.1` and that the pixel tolerances of
 * RM-2/RM-3 were measured on (two rules 3 min apart are ~2 px apart there), under the floor of a
 * 1280-px plot. `5m` (whose 1.152-slot axis is shorter than the floor): from `marginSlots` before `ms`
 * to the right edge, so the view never reaches the paging trigger (`showView` throws on a page). */
const REGIME_VIEW_BARS_1M = 2_200;

async function showFrame(page: Page, ms: number, stepMs: number, marginSlots: number): Promise<Frame> {
  const state = await readView(page);
  const target: ViewTarget =
    stepMs === MIN
      ? { kind: "lastBars", bars: REGIME_VIEW_BARS_1M }
      : { kind: "timeRange", fromMs: ms - marginSlots * stepMs, toMs: state.windowStartMs + state.slotCount * stepMs };
  const view = await showView(page, target);
  const frame = await frameOf(page, stepMs);
  const wanted = (ms - frame.windowStartMs) / stepMs - marginSlots;
  fact(SPEC, `view_${stepMs}`, { iterations: view.iterations, from: frame.from, to: frame.to, wanted, spacingPx: view.barSpacingPx });
  // The tolerance of `showView` is 2% of the span: the margin, not the edge, is what must hold.
  expect(frame.from, `a vista não trouxe ${ms} para a tela (from ${frame.from}, alvo ${wanted})`).toBeLessThanOrEqual(wanted + Math.max(1, 0.02 * (frame.to - frame.from)));
  return frame;
}

/** Page x of the CENTRE of the slot at `ms`. */
function slotX(frame: Frame, ms: number): number {
  return edgeX(frame, ms) - (0.5 * frame.box.width) / (frame.to - frame.from);
}

interface CanvasRead {
  /** The modal colour of the pane's opaque pixels with page x in `[x0, x1]` and y in the plot area. */
  readonly modeIn: string;
  readonly modeOut: string;
  /** Page x of every column where `provenanceWeak` covers ≥ half the pane's height. */
  readonly ruleColumns: readonly number[];
  /** Candle ink (up/down) pixels inside each label's box. */
  readonly inkUnderLabels: readonly number[];
  /** `T-03.14` (`MF-1`): bitmap rows of the legend block (`[0, data-legend-bottom-px)`) and the
   * `provenanceWeak` (rule) and band-surface pixels found in them, over the pane's whole width
   * (band pixels only inside a run of ≥ 3, see below). */
  readonly legendRows: {
    readonly rows: number;
    readonly weak: number;
    readonly band: number;
    /** The first hits, `[x, y, r, g, b]` in bitmap px, so a red names where the ink is. */
    readonly samples: readonly (readonly number[])[];
  };
}

async function readCanvas(page: Page, inside: readonly [number, number], outside: readonly [number, number]): Promise<CanvasRead> {
  const tokens = colorTokens();
  return page.evaluate(
    ({ testId, inside, outside, weak, up, down, band, tol, bandTol, inkTol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      const canvases = Array.from(layer.parentElement?.children ?? []).filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement);
      const main = canvases[0]!;
      const rect = main.getBoundingClientRect();
      const sx = main.width / rect.width;
      const sy = main.height / rect.height;
      const data = main.getContext("2d")!.getImageData(0, 0, main.width, main.height).data;
      const reservedTop = Number(layer.dataset.reservedScaleTopPx ?? "0");
      const yFrom = Math.ceil((reservedTop + 4) * sy);
      const px = (x: number, y: number) => {
        const at = (y * main.width + x) * 4;
        return [data[at]!, data[at + 1]!, data[at + 2]!, data[at + 3]!] as const;
      };
      const mode = (range: readonly [number, number]) => {
        const counts = new Map<string, number>();
        const x0 = Math.max(0, Math.round((range[0] - rect.left) * sx));
        const x1 = Math.min(main.width - 1, Math.round((range[1] - rect.left) * sx));
        for (let x = x0; x <= x1; x += 1) {
          for (let y = yFrom; y < main.height; y += 2) {
            const [r, g, b, a] = px(x, y);
            if (a === 0) continue;
            const k = `${r},${g},${b}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
        let best = "";
        let n = -1;
        for (const [k, c] of counts) if (c > n) [best, n] = [k, c];
        return best;
      };
      const isNear = (p: readonly number[], rgb: readonly number[], t: number) => rgb.every((c, i) => Math.abs(c - p[i]!) <= t);
      const ruleColumns: number[] = [];
      for (let x = 0; x < main.width; x += 1) {
        let hits = 0;
        for (let y = 0; y < main.height; y += 1) if (isNear(px(x, y), weak, tol)) hits += 1;
        if (hits >= main.height * 0.5) ruleColumns.push(rect.left + x / sx);
      }
      const inkUnderLabels = Array.from(layer.querySelectorAll<HTMLElement>('[data-fact^="oi_regime_band_label:"]')).map((label) => {
        const box = label.getBoundingClientRect();
        let ink = 0;
        for (let x = Math.round((box.left - rect.left) * sx); x <= Math.round((box.right - rect.left) * sx); x += 1)
          for (let y = Math.round((box.top - rect.top) * sy); y <= Math.round((box.bottom - rect.top) * sy); y += 1) {
            if (x < 0 || y < 0 || x >= main.width || y >= main.height) continue;
            const p = px(x, y);
            if (isNear(p, up, inkTol) || isNear(p, down, inkTol)) ink += 1;
          }
        return ink;
      });
      const legendRowCount = Math.min(main.height, Math.ceil(Number(layer.dataset.legendBottomPx ?? "0") * sy));
      const legendRows = { rows: legendRowCount, weak: 0, band: 0, samples: [] as number[][] };
      // A band pixel counts only inside a horizontal run of ≥ 3 (the band is a solid fill): an isolated
      // pixel where two grid lines cross blends to within `TOL` of the band surface — measured on the
      // fixed render: 6 such pixels, at the 3 vertical grid lines × the 2 horizontal ones in the rows.
      const bandAt = (x: number, y: number) => x >= 0 && x < main.width && isNear(px(x, y), band, bandTol);
      for (let y = 0; y < legendRowCount; y += 1)
        for (let x = 0; x < main.width; x += 1) {
          const p = px(x, y);
          const isWeak = isNear(p, weak, tol);
          const isBand = bandAt(x - 1, y) && bandAt(x, y) && bandAt(x + 1, y);
          if (isWeak) legendRows.weak += 1;
          if (isBand) legendRows.band += 1;
          if ((isWeak || isBand) && legendRows.samples.length < 12) legendRows.samples.push([x, y, p[0], p[1], p[2]]);
        }
      return { modeIn: mode(inside), modeOut: mode(outside), ruleColumns, inkUnderLabels, legendRows };
    },
    {
      testId: OI_PANE_TESTID,
      inside,
      outside,
      weak: hexToRgb(tokens.provenanceWeak),
      up: hexToRgb(tokens.directionUpFill),
      down: hexToRgb(tokens.directionDownFill),
      band: hexToRgb(OI_REGIME_BAND_SURFACE),
      tol: 6,
      bandTol: TOL,
      inkTol: INK_TOLERANCE,
    },
  );
}

interface LegendRead {
  readonly derivedFrom: string;
  readonly samples: string;
  readonly unmeasuredAttr: string;
  readonly cellVisible: boolean;
  readonly cellText: string;
  readonly visibleHlNumerals: number;
  readonly high: number;
  readonly low: number;
  readonly bucketEndProbe: number;
  readonly widthPx: number;
}

async function readLegend(page: Page): Promise<LegendRead> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-legend-ohlc="oi"]')!;
    const cell = root.querySelector<HTMLElement>('[data-legend-ohlc-part="hl-unmeasured"]');
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const hl = Array.from(root.querySelectorAll('[data-legend-ohlc-part="high"] [data-legend-numeral], [data-legend-ohlc-part="low"] [data-legend-numeral]'));
    return {
      derivedFrom: root.dataset.legendDerivedFrom ?? "",
      samples: root.dataset.legendSamples ?? "",
      unmeasuredAttr: root.dataset.legendHlUnmeasured ?? "",
      cellVisible: cell !== null && visible(cell),
      cellText: cell?.querySelector<HTMLElement>("[data-legend-hl-text]")?.textContent?.trim() ?? "",
      visibleHlNumerals: hl.filter(visible).length,
      high: Number(root.dataset.legendHigh),
      low: Number(root.dataset.legendLow),
      bucketEndProbe: Number(root.querySelector<HTMLElement>('[data-legend-value="oi"]')?.dataset.legendBucketMs ?? Number.NaN),
      widthPx: root.getBoundingClientRect().width,
    };
  });
}

/** Hover the OI pane at the centre of the slot of `ms` and read the legend. */
async function hoverLegend(page: Page, frame: Frame, ms: number): Promise<LegendRead> {
  await page.mouse.move(slotX(frame, ms), frame.box.y + frame.box.height * 0.6, { steps: 4 });
  await waitForChartSettled(page);
  return readLegend(page);
}

test.use({ viewport: { width: 1280, height: 1200 } });

test.describe(`T-03.12: marcas de regime do pane de OI (faixa, regra, rótulo, H/L não medidos) com ablação (${SPEC})`, () => {
  let stub: StubHandle;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
    const catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "scenario", { NOW5, HOLE_FROM, HOLE_TO, CAPTURE_LAST_A, ISLAND_A, PROBE_B_5M });
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("RM-1..RM-4 (1m): bandas e regras derivadas do derived_from, faixa e regra no pixel, rótulos na faixa reservada", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    await showFrame(page, HOLE_FROM, MIN, 60);
    const pane = page.locator(`[data-testid="${OI_PANE_TESTID}"]`);
    // RM-1 — the derivation, as the DOM publishes it.
    const facts = {
      bands: Number(await pane.getAttribute("data-oi-regime-bands")),
      rules: Number(await pane.getAttribute("data-oi-regime-rules")),
      bandsAt: (await pane.getAttribute("data-oi-regime-bands-at")) ?? "",
      rulesAt: (await pane.getAttribute("data-oi-regime-rules-at")) ?? "",
      marks: await pane.getAttribute("data-oi-regime-marks"),
      labels: (await pane.getAttribute("data-oi-regime-labels")) ?? "",
    };
    fact(SPEC, "design_facts", facts);
    expect(facts.marks).toBe("painted");
    expect(facts.rules, "RM-1: uma regra por troca de derived_from (A→B, B→A, A→B)").toBe(3);
    expect(facts.rulesAt).toBe([CAPTURE_LAST_A, ISLAND_A - 3 * MIN, ISLAND_A].join(","));
    const bandsAt = facts.bandsAt.split(",");
    expect(bandsAt.length, "RM-1: o buraco dentro de A quebra a faixa, e a ilha tem a sua").toBe(3);
    expect(bandsAt.slice(1)).toEqual([`${HOLE_TO - FIVE}-${CAPTURE_LAST_A}`, `${ISLAND_A - 3 * MIN}-${ISLAND_A}`]);
    expect(Number(bandsAt[0]!.split("-")[1])).toBe(HOLE_FROM);

    const frame = await frameOf(page);
    fact(SPEC, "frame", frame);
    expect(edgeX(frame, HOLE_FROM), "o cenário não está na faixa visível").toBeGreaterThan(frame.box.x);
    // RM-2 — inside the band after the hole vs inside the polled stretch before the island.
    const inside: [number, number] = [edgeX(frame, HOLE_TO + HOUR), edgeX(frame, CAPTURE_LAST_A - HOUR)];
    const outside: [number, number] = [edgeX(frame, CAPTURE_LAST_A + HOUR), edgeX(frame, ISLAND_A - HOUR)];
    const design = await readCanvas(page, inside, outside);
    fact(SPEC, "design_canvas", { ...design, modeIn: toHex(design.modeIn.split(",").map(Number)), modeOut: toHex(design.modeOut.split(",").map(Number)) });
    expect(near(design.modeIn.split(",").map(Number), OI_REGIME_BAND_SURFACE, TOL), `RM-2: fundo dentro da faixa não é ${OI_REGIME_BAND_SURFACE}`).toBe(true);
    expect(near(design.modeOut.split(",").map(Number), SURFACE_BASE, TOL), `RM-2: fundo fora da faixa não é ${SURFACE_BASE}`).toBe(true);
    // RM-3 — a full-height provenanceWeak column at each rule (± 3 px of the edge the derivation gives).
    for (const atMs of [CAPTURE_LAST_A, ISLAND_A - 3 * MIN, ISLAND_A]) {
      const x = edgeX(frame, atMs);
      expect(
        design.ruleColumns.some((column) => Math.abs(column - x) <= 3),
        `RM-3: nenhuma coluna de regra perto de x=${x.toFixed(1)} (${new Date(atMs).toISOString()})`,
      ).toBe(true);
    }
    // RM-3b (`T-03.14` `MF-1`) — neither the rule nor the band inks the legend's rows: painted from
    // y = 0, the rule struck through the legend text (5/5 scenes, 38/38 rows) and the band sat behind it.
    expect(design.legendRows.rows, "RM-3b: a legenda não foi medida — a checagem abaixo seria vazia").toBeGreaterThan(0);
    expect(design.legendRows.weak, `RM-3b: tinta de regra (provenanceWeak) nas ${design.legendRows.rows} linhas da legenda: ${JSON.stringify(design.legendRows.samples)}`).toBe(0);
    expect(design.legendRows.band, `RM-3b: fundo de faixa nas ${design.legendRows.rows} linhas da legenda: ${JSON.stringify(design.legendRows.samples)}`).toBe(0);
    // RM-4 — the labels: both regimes on screen, so both named; inside the reserved strip; no ink under.
    const labels = await page.evaluate((testId) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      const top = layer.getBoundingClientRect().top;
      return {
        legendBottom: Number(layer.dataset.legendBottomPx),
        reservedTop: Number(layer.dataset.reservedScaleTopPx),
        labels: Array.from(layer.querySelectorAll<HTMLElement>('[data-fact^="oi_regime_band_label:"]')).map((label) => {
          const box = label.getBoundingClientRect();
          return { fact: label.dataset.fact, text: label.textContent, top: box.top - top, bottom: box.bottom - top, visible: getComputedStyle(label).visibility };
        }),
      };
    }, OI_PANE_TESTID);
    fact(SPEC, "design_labels", labels);
    const factsOf = new Set(labels.labels.map((label) => label.fact));
    expect([...factsOf].sort(), "RM-4: com os dois regimes na tela, os dois têm rótulo").toEqual([
      `oi_regime_band_label:${A}`,
      `oi_regime_band_label:${B}`,
    ]);
    for (const label of labels.labels) {
      expect(label.text).toBe(label.fact === `oi_regime_band_label:${A}` ? "amostras 5m" : "amostras 1m");
      expect(label.visible).toBe("visible");
      expect(label.top, "RM-4: rótulo acima do fim da legenda").toBeGreaterThanOrEqual(labels.legendBottom - 0.5);
      expect(label.bottom, "RM-4: rótulo abaixo do topo da escala (cobriria vela)").toBeLessThanOrEqual(labels.reservedTop + 0.5);
    }
    expect(design.inkUnderLabels.every((ink) => ink === 0), `Q-7: tinta de vela sob um rótulo (${design.inkUnderLabels.join(",")})`).toBe(true);

    // ABLATION — `?e2eOiRegimeMarks=0`: nothing painted, the derivation still published.
    await openSymbol(page, instance!.baseUrl, "?e2eOiRegimeMarks=0");
    await showFrame(page, HOLE_FROM, MIN, 60);
    expect(await pane.getAttribute("data-oi-regime-marks")).toBe("ablated");
    expect(Number(await pane.getAttribute("data-oi-regime-rules"))).toBe(3);
    const ablatedFrame = await frameOf(page);
    const ablated = await readCanvas(
      page,
      [edgeX(ablatedFrame, HOLE_TO + HOUR), edgeX(ablatedFrame, CAPTURE_LAST_A - HOUR)],
      [edgeX(ablatedFrame, CAPTURE_LAST_A + HOUR), edgeX(ablatedFrame, ISLAND_A - HOUR)],
    );
    fact(SPEC, "ablation_canvas", { ...ablated, modeIn: toHex(ablated.modeIn.split(",").map(Number)), modeOut: toHex(ablated.modeOut.split(",").map(Number)) });
    expect(ablated.modeIn, "RM-2 ablação: sem faixa, o fundo dentro e fora é o mesmo").toBe(ablated.modeOut);
    expect(ablated.ruleColumns.length, "RM-3 ablação: sem regra, nenhuma coluna de provenanceWeak de altura inteira").toBe(0);
    expect(await pane.locator('[data-fact^="oi_regime_band_label:"]').count(), "RM-4 ablação: sem rótulo").toBe(0);
  });

  test("RM-5 (1m, Q-4 (iv)): sobre uma vela de A e uma de B, a legenda diz 'H/L não medidos' e não mostra numeral de H/L", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const frame = await showFrame(page, HOLE_TO, MIN, 60);
    const served = stub.served.get("1m")!;
    const seen = new Set<string>();
    for (const ms of [HOLE_TO + 2 * HOUR, CAPTURE_LAST_A + 3 * HOUR]) {
      const legend = await hoverLegend(page, frame, ms);
      fact(SPEC, `legend_1m_${ms}`, legend);
      const candle = [...served.values()].find((each) => each.high === legend.high && each.low === legend.low && each.derived_from === legend.derivedFrom);
      expect(candle, "RM-5: a legenda não é uma vela servida").toBeDefined();
      expect(legend.unmeasuredAttr).toBe("true");
      expect(legend.cellVisible, "RM-5: a célula 'H/L não medidos' não está visível").toBe(true);
      expect(legend.cellText).toBe("H/L não medidos");
      expect(legend.visibleHlNumerals, "RM-5: numeral de H/L visível numa vela de 2 leituras").toBe(0);
      seen.add(legend.derivedFrom);
    }
    expect([...seen].sort()).toEqual([A, B]);
  });

  test("RM-6 (5m, Q-5 + Q-4 (iii)): 2 leituras → célula; 3 leituras com pavio → numerais; largura igual ± 1 px", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "?interval=5m");
    const frame = await showFrame(page, CAPTURE_LAST_A, FIVE, 12);
    fact(SPEC, "frame_5m", frame);
    const lastA = await hoverLegend(page, frame, CAPTURE_LAST_A);
    const probe = await hoverLegend(page, frame, PROBE_B_5M);
    const fiveOfFive = await hoverLegend(page, frame, PROBE_B_5M + FIVE);
    fact(SPEC, "legend_5m", { lastA, probe, fiveOfFive });
    expect(lastA.derivedFrom, "RM-6: o hover não caiu na última vela de A").toBe(A);
    expect(lastA.samples).toBe("1/1");
    expect(lastA.cellVisible).toBe(true);
    expect(lastA.visibleHlNumerals).toBe(0);
    expect(probe.derivedFrom, "RM-6: o hover não caiu na vela 2/5 de B").toBe(B);
    expect(probe.samples).toBe("2/5");
    expect(probe.unmeasuredAttr, "Q-4 (iii): 2/5 + âncora = 3 leituras, pavio medido").toBe("false");
    expect(probe.cellVisible).toBe(false);
    expect(probe.visibleHlNumerals, "Q-4 (iii): os dois numerais de H/L").toBe(2);
    expect(fiveOfFive.samples).toBe("5/5");
    expect(fiveOfFive.visibleHlNumerals).toBe(2);
    expect(Math.abs(lastA.widthPx - probe.widthPx), `Q-5: largura da legenda ${lastA.widthPx} vs ${probe.widthPx}`).toBeLessThanOrEqual(1);
    expect(Math.abs(lastA.widthPx - fiveOfFive.widthPx)).toBeLessThanOrEqual(1);
  });
});
