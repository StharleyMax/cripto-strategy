import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, waitForChartSettled, type NextInstanceHandle } from "./helpers.ts";
import { readView, showView } from "./view.ts";

/**
 * `paineis-de-fluxo` `T-03.13` (`CST-288`; plan `03` DoD-03b items 3-6; `SPEC-009` §9 `CA-7`, `CA-8′`;
 * `ADR-045` D1/D2-bis) — THE ACCEPTANCE OF THE OI CANDLE, BUCKET BY BUCKET, IN THE PRODUCTION PAGE,
 * AGAINST THE ROUTE THE PAGE READ, WITH THE ABLATION.
 *
 * `e2e/36` proved the pane draws candles in AGGREGATE (more up columns than down). This file judges
 * EVERY visible `5m` bucket: its identity from the crosshair (`data-legend-bucket-ms` of the OI legend),
 * its pixels from the canvas column under the candle's centre, its truth from `/series-history` asked
 * the SAME question the page asked (the window and `knowledge_time_ms` the server declared on `<main>`).
 * The judges are pure functions written here from the DoD's words, never imported from the code under test.
 *
 * ── WHAT IS JUDGED ─────────────────────────────────────────────────────────────────────────────
 *
 *   CA-7  (DoD 3)  per bucket with a served closed candle: the ink under its centre is the sign of the
 *                  route's `close − open` (up ink / down ink / neutral doji ink). `n >= 50` judged buckets
 *                  IN EACH REGIME, and each regime has >= 1 bucket where the sign of the PRICE candle
 *                  (route, same bucket) and the sign of the OI candle DIVERGE. MORDE: colouring by price.
 *   CA-8′ (DoD 4)  a hole of the `openInterestHist` series in the historical regime (no polling point in
 *                  it): the route serves NO candle in the hole nor in the first bucket after it, and the
 *                  canvas has NO candle ink in those columns. MORDE: stitching the anchor with the last
 *                  point before the hole.
 *   D2-bis (DoD 5) the bucket in which a capture starts, and the one after it: the candle's `derived_from`
 *                  is ONE declared source, and `open`/`close`/`high`/`low`/`open_at_ms`/`close_at_ms`/
 *                  `samples.present` are exactly what `ADR-045/D1` gives on THAT series' own points (read
 *                  from the route); the legend, hovered on that bucket, shows that candle and that
 *                  `derived_from`. MORDE: building the historical anchor with the polling's samples.
 *   PX    (DoD 6)  ablation `?e2eOiLine=1` (the pane's source back to `line`): on the same buckets the
 *                  candle ink is GONE (0 up, 0 down) and the line's ink is there.
 *
 * ── INCONCLUSIVE IS NOT GREEN ──────────────────────────────────────────────────────────────────
 *
 * `n < 50` in a regime, no divergent bucket in a regime, no hole with its first-after bucket on screen,
 * no capture start on screen: the test FAILS with `INCONCLUSIVO`, it never passes.
 *
 * ── TWO UNIVERSES, ONE INSTRUMENT ──────────────────────────────────────────────────────────────
 *
 *   GATE (always, what `make verify` runs): the production page (`next start` of the gate's build) on a
 *     stub API over the REAL catalog of the e2e API. The stub's candles are built HERE from raw points by
 *     `ADR-045/D1` + `D2-bis` (a hole in the history, a capture start mid-bucket, price and OI directions
 *     that agree and diverge). **Nothing is seeded in any database.** `E2E_T0313_STUB_MUTATION=stitch|mix`
 *     makes the stub commit the two backend defects the DoD names, to show the judges reject them.
 *   REAL (only with `E2E_OI_REAL_API_BASE_URL`): the same page on a read API that serves `oi_candles`
 *     over real `md.series` rows (the read-only bench of `gates/T-03.13-builder.md` §3: the worktree's own
 *     route function over a `psql` read-only export, everything else passed to the owner's API). Without
 *     the variable the REAL tests are SKIPPED with the reason (a skip is not a pass).
 *
 * Run: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (or `npx playwright test 38-oi-candle` with the e2e env).
 */

const SPEC = "38-oi-candle-acceptance-per-bucket";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const OI_PANE_TESTID = "oi-pane";
const INTERVAL_QUERY = "interval=5m";
const ABLATION_QUERY = "e2eOiLine=1";
const MIN = 60_000;
const FIVE = 300_000;
/** `DoD-3`: `n >= 50` buckets IN EACH REGIME. */
const MIN_PER_REGIME = 50;
/** Buckets narrower than this are not read one by one (the body would be a line). */
const MIN_SPACING_PX = 6;
const SWEEP_STEPS_PER_BUCKET = 3;
const INK_TOLERANCE = 12;
/** Buckets of margin each side of a view, so the sweep's first and last bucket are inside the plot. */
const VIEW_MARGIN_BUCKETS = 2;
const TOKENS = colorTokens();
const HIST: OiSource = "binance_point_5m";
const POLL: OiSource = "binance_poll_1m";
const REAL_API = process.env.E2E_OI_REAL_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const STUB_MUTATION = process.env.E2E_T0313_STUB_MUTATION ?? "none";

type OiSource = "binance_point_5m" | "binance_poll_1m";

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

interface OiCandle {
  readonly bucket_end_ms: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly open_at_ms: number;
  readonly close_at_ms: number;
  readonly samples: { readonly present: number; readonly expected: number };
  readonly closed: boolean;
  readonly derived_from: string;
}

interface OiSourceDecl {
  readonly derived_from: string;
  readonly series_key_id: string;
  readonly native_grid_ms: number;
  readonly bucket_interval_ms: number;
}

interface RenderedRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

/** What the route answers to the page's own question, plus each source series' raw points. */
interface Truth {
  readonly request: RenderedRequest;
  readonly candles: ReadonlyMap<number, OiCandle>;
  readonly sources: readonly OiSourceDecl[];
  /** `p(t)` of each source series, by `derived_from`, as the route serves it on the series' native grid. */
  readonly points: ReadonlyMap<string, ReadonlyMap<number, number>>;
  readonly priceOpen: ReadonlyMap<number, number>;
  readonly priceClose: ReadonlyMap<number, number>;
}

// ── The catalog and the route ─────────────────────────────────────────────────────────────────────

function pickKey(catalog: CatalogEnvelope, label: string, match: (key: SeriesKey) => boolean): SeriesKey {
  const entry = catalog.entries.find((candidate) => candidate.key.instrumentId === SYMBOL && match(candidate.key));
  if (entry === undefined) throw new Error(`the catalog has no ${label} for ${SYMBOL}`);
  return entry.key;
}

const histKeyOf = (catalog: CatalogEnvelope) =>
  pickKey(catalog, "binance sum_open_interest POINT", (k) => k.provider === "binance" && k.metric === "sum_open_interest" && k.reduction === "POINT");
const pollKeyOf = (catalog: CatalogEnvelope) =>
  pickKey(catalog, "binance open_interest 1m POINT", (k) => k.provider === "binance" && k.metric === "open_interest");
const priceKeyOf = (catalog: CatalogEnvelope, reduction: "OPEN" | "CLOSE") =>
  pickKey(catalog, `klines_ohlc ${reduction}`, (k) => k.metric === "klines_ohlc" && k.reduction === reduction);

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    response = await fetch(url);
  }
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: null };
  }
}

async function fetchCatalog(apiBase: string): Promise<CatalogEnvelope> {
  const { status, body } = await fetchJson(`${apiBase}/series-catalog`);
  if (status !== 200 || body === null) throw new Error(`GET ${apiBase}/series-catalog answered ${status}`);
  return body as CatalogEnvelope;
}

interface HistoryEnvelope {
  readonly rows?: readonly { readonly event_time: number; readonly value: string | null }[];
  readonly oi_candles?: { readonly sources: readonly OiSourceDecl[]; readonly candles: readonly OiCandle[] } | null;
}

async function fetchHistory(apiBase: string, seriesKeyId: string, interval: string, request: RenderedRequest): Promise<HistoryEnvelope> {
  const query = new URLSearchParams({
    series_key_id: seriesKeyId,
    symbol: SYMBOL,
    interval,
    window_start_ms: String(request.windowStartMs),
    window_end_ms: String(request.windowEndMsInclusive),
    knowledge_time_ms: String(request.knowledgeTimeMs),
    bar_policy: "final_only",
  });
  const { status, body } = await fetchJson(`${apiBase}/series-history?${query.toString()}`);
  if (status !== 200 || body === null) throw new Error(`GET /series-history (${seriesKeyId.slice(0, 10)}…, ${interval}) answered ${status}`);
  return body as HistoryEnvelope;
}

function valueMap(envelope: HistoryEnvelope): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of envelope.rows ?? []) {
    if (row.value !== null && row.value !== "") out.set(row.event_time, Number(row.value));
  }
  return out;
}

/** The SAME question the page asks (the OI series at `5m`, on the declared window), then each source. */
async function fetchTruth(apiBase: string, catalog: CatalogEnvelope, request: RenderedRequest): Promise<Truth> {
  const oi = await fetchHistory(apiBase, computeSeriesKeyId(histKeyOf(catalog)), "5m", request);
  if (oi.oi_candles === undefined || oi.oi_candles === null) throw new Error("the route served no oi_candles block for the OI series");
  const points = new Map<string, Map<number, number>>();
  for (const source of oi.oi_candles.sources) {
    const interval = source.native_grid_ms === FIVE ? "5m" : "1m";
    points.set(source.derived_from, valueMap(await fetchHistory(apiBase, source.series_key_id, interval, request)));
  }
  return {
    request,
    candles: new Map(oi.oi_candles.candles.map((candle) => [candle.bucket_end_ms, candle])),
    sources: oi.oi_candles.sources,
    points,
    priceOpen: valueMap(await fetchHistory(apiBase, computeSeriesKeyId(priceKeyOf(catalog, "OPEN")), "5m", request)),
    priceClose: valueMap(await fetchHistory(apiBase, computeSeriesKeyId(priceKeyOf(catalog, "CLOSE")), "5m", request)),
  };
}

// ── ADR-045 D1 + D2-bis, from the ADR's table (the stub's builder and the D2-bis judge's reference) ─────

interface Built {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly open_at_ms: number;
  readonly close_at_ms: number;
  readonly present: number;
}

/** `ADR-045/D1` on ONE series' points for `B = (T1 − w, T1]`: `null` when the table says "nenhum candle". */
function adr045Candle(points: ReadonlyMap<number, number>, gridMs: number, bucketEndMs: number, widthMs: number): Built | null {
  const t0 = bucketEndMs - widthMs;
  const samples: [number, number][] = [];
  for (let t = t0 + gridMs; t <= bucketEndMs; t += gridMs) {
    const value = points.get(t);
    if (value !== undefined) samples.push([t, value]);
  }
  if (samples.length === 0) return null;
  const anchor = points.get(t0);
  if (anchor === undefined && samples.length < 2) return null;
  const [openAt, open] = anchor !== undefined ? [t0, anchor] : samples[0]!;
  const [closeAt, close] = samples[samples.length - 1]!;
  const all = [open, ...samples.map(([, v]) => v)];
  return { open, high: Math.max(...all), low: Math.min(...all), close, open_at_ms: openAt, close_at_ms: closeAt, present: samples.length };
}

// ── The stub of the GATE universe ─────────────────────────────────────────────────────────────────

/** Right edge of the stub's data: the page's window ends `RIGHT_EDGE_LAG` before now, on the `5m` grid. */
const STUB_END = Math.floor(Date.now() / FIVE) * FIVE;
/** The capture starts MID-bucket (2 min in): that bucket is historical, the next is polling (`D2-bis`). */
const STUB_CAPTURE_MS = STUB_END - 80 * FIVE + 2 * MIN;
/** Four missing `openInterestHist` points, 70 buckets before the capture. */
const STUB_HOLE_FIRST = Math.floor(STUB_CAPTURE_MS / FIVE) * FIVE - 70 * FIVE;
const STUB_HOLE_LENGTH = 4;

function stubHist(t: number): number | undefined {
  if (t % FIVE !== 0 || t > STUB_END) return undefined;
  if (t >= STUB_HOLE_FIRST && t < STUB_HOLE_FIRST + STUB_HOLE_LENGTH * FIVE) return undefined;
  const k = Math.round(t / FIVE);
  // An up/down alternation of uneven steps, and a doji (the same value twice) every 23rd bucket.
  const level = (j: number) => 50_000 + 10 * ((j * 7) % 13);
  return k % 23 === 0 ? level(k - 1) : level(k);
}

function stubPoll(t: number): number | undefined {
  if (t % MIN !== 0 || t < STUB_CAPTURE_MS || t > STUB_END) return undefined;
  const m = Math.round(t / MIN);
  // ~120 contracts above the history: a candle that mixed the two series would show it in its values.
  return 50_120 + 3 * ((m * 5) % 17);
}

function stubPoints(gridMs: number, pointAt: (t: number) => number | undefined, fromMs: number, toMs: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let t = Math.ceil(fromMs / gridMs) * gridMs; t <= toMs; t += gridMs) {
    const value = pointAt(t);
    if (value !== undefined) out.set(t, value);
  }
  return out;
}

/** The price of the `5m` bucket ending at `t`: a period-3 direction against the OI's period-2 one. */
function stubPrice(t: number, reduction: string): string {
  const k = Math.round(t / FIVE);
  const open = 100 + (k % 5);
  const close = k % 3 === 0 ? open - 1 : open + 1;
  if (reduction === "OPEN") return String(open);
  if (reduction === "HIGH") return String(Math.max(open, close) + 0.5);
  if (reduction === "LOW") return String(Math.min(open, close) - 0.5);
  return String(close);
}

function stubOther(key: SeriesKey, t: number): string {
  const minute = Math.round(t / MIN);
  switch (key.metric) {
    case "cvd_source":
      return String((minute % 11) - 5);
    case "sum_liquidation":
      return String(1 + (minute % 9));
    case "count_long_short_ratio":
      return String(0.5 + (minute % 13) / 512);
    case "sum_open_interest":
      return String(stubHist(Math.floor(t / FIVE) * FIVE) ?? 50_000);
    default:
      return String(10 + (minute % 17));
  }
}

function stubCandle(hist: ReadonlyMap<number, number>, poll: ReadonlyMap<number, number>, t1: number, knowledgeMs: number): OiCandle | null {
  const t0 = t1 - FIVE;
  // `D2-bis`: the polling if it has a point at `T0`, the history if it does not — never both.
  const [source, points, grid]: [OiSource, ReadonlyMap<number, number>, number] = poll.has(t0) ? [POLL, poll, MIN] : [HIST, hist, FIVE];
  let built = adr045Candle(points, grid, t1, FIVE);
  const firstAfterHole = STUB_HOLE_FIRST + STUB_HOLE_LENGTH * FIVE;
  if (STUB_MUTATION === "stitch" && t1 === firstAfterHole) {
    // THE DEFECT `CA-8′` NAMES: the anchor stitched to the last point before the hole.
    const before = STUB_HOLE_FIRST - FIVE;
    const open = hist.get(before)!;
    const close = hist.get(t1)!;
    built = { open, close, high: Math.max(open, close), low: Math.min(open, close), open_at_ms: before, close_at_ms: t1, present: 1 };
  }
  const captureBucketEnd = Math.ceil(STUB_CAPTURE_MS / FIVE) * FIVE;
  if (STUB_MUTATION === "mix" && t1 === captureBucketEnd && built !== null) {
    // THE DEFECT `D2-bis` NAMES: the history's anchor with the polling's samples.
    const pollBuilt = adr045Candle(poll, MIN, t1, FIVE);
    if (pollBuilt !== null) {
      const all = [built.open, ...[...poll.entries()].filter(([t]) => t > t0 && t <= t1).map(([, v]) => v)];
      built = { ...built, close: pollBuilt.close, close_at_ms: pollBuilt.close_at_ms, high: Math.max(...all), low: Math.min(...all), present: pollBuilt.present };
    }
  }
  if (built === null) return null;
  return {
    bucket_end_ms: t1,
    open: built.open,
    high: built.high,
    low: built.low,
    close: built.close,
    open_at_ms: built.open_at_ms,
    close_at_ms: built.close_at_ms,
    samples: { present: built.present, expected: FIVE / grid },
    closed: t1 <= knowledgeMs,
    derived_from: source,
  };
}

interface StubHandle {
  readonly url: string;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
  const histId = computeSeriesKeyId(histKeyOf(catalog));
  const pollId = computeSeriesKeyId(pollKeyOf(catalog));
  const server = http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (!incoming.pathname.endsWith("/series-history")) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("T-03.13 stub: no route");
      return;
    }
    const startMs = Number(incoming.searchParams.get("window_start_ms"));
    const endMs = Number(incoming.searchParams.get("window_end_ms"));
    const knowledgeParam = Number(incoming.searchParams.get("knowledge_time_ms"));
    const knowledge = Number.isFinite(knowledgeParam) ? knowledgeParam : Date.now();
    const interval = incoming.searchParams.get("interval") ?? "1m";
    const step = interval === "5m" ? FIVE : MIN;
    const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
    const key = keysById.get(seriesKeyId);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || key === undefined) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end(`T-03.13 stub: bad request (${seriesKeyId || "no series_key_id"})`);
      return;
    }
    const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
    for (let t = Math.ceil(startMs / step) * step; t <= endMs; t += step) {
      let value: string | undefined;
      if (seriesKeyId === pollId) value = stubPoll(t)?.toString();
      else if (seriesKeyId === histId) value = stubHist(t)?.toString();
      else if (key.metric === "klines_ohlc") value = stubPrice(interval === "5m" ? t : Math.ceil(t / FIVE) * FIVE, key.reduction);
      else value = stubOther(key, t);
      if (value !== undefined) rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
    }
    let oiBlock: unknown = null;
    if (key.metric === "sum_open_interest") {
      const hist = stubPoints(FIVE, stubHist, startMs - FIVE, endMs);
      const poll = stubPoints(MIN, stubPoll, startMs - FIVE, endMs);
      const candles: OiCandle[] = [];
      if (interval === "5m") {
        for (let t = Math.ceil(startMs / FIVE) * FIVE; t <= endMs; t += FIVE) {
          const candle = stubCandle(hist, poll, t, knowledge);
          if (candle !== null) candles.push(candle);
        }
      }
      oiBlock = {
        timeframe_ms: step,
        sources: [
          { derived_from: HIST, series_key_id: histId, native_grid_ms: FIVE, bucket_interval_ms: FIVE },
          { derived_from: POLL, series_key_id: pollId, native_grid_ms: MIN, bucket_interval_ms: step },
        ],
        candles,
      };
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-03.13-synthetic-values",
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
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-03.13 stub: no port");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

// ── The page ──────────────────────────────────────────────────────────────────────────────────────

async function openSymbol(page: Page, baseUrl: string, query: string): Promise<RenderedRequest> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}?${query}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH}?${query} did not answer ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", { timeout: 120_000 });
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveCount(1);
  await waitForChartSettled(page);
  const main = page.locator("main[data-window-start-ms]");
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

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function oiCanvasBox(page: Page): Promise<Box> {
  return page.evaluate((testId) => {
    const layer = document.querySelector(`[data-testid="${testId}"]`)!;
    const canvases = Array.from(layer.parentElement?.children ?? []).filter(
      (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
    );
    if (canvases.length === 0) throw new Error("the OI pane has no canvas with area");
    const rect = canvases[0]!.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, OI_PANE_TESTID);
}

interface LegendReading {
  readonly source: string;
  readonly bucketMs: number | null;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly derivedFrom: string;
  readonly fact: string;
}

/** The OI legend, two animation frames after the pointer moved (it follows the crosshair a frame late). */
async function readLegend(page: Page): Promise<LegendReading> {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.querySelector<HTMLElement>('[data-legend-ohlc="oi"]');
    const value = root?.querySelector<HTMLElement>('[data-legend-value="oi"]');
    const num = (raw: string | undefined) => (raw === undefined || raw === "" ? Number.NaN : Number(raw));
    const bucket = value?.dataset.legendBucketMs ?? "";
    return {
      source: value?.dataset.legendSource ?? "",
      bucketMs: bucket === "" ? null : Number(bucket),
      open: num(root?.dataset.legendOpen),
      high: num(root?.dataset.legendHigh),
      low: num(root?.dataset.legendLow),
      close: num(root?.dataset.legendClose),
      derivedFrom: root?.dataset.legendDerivedFrom ?? "",
      fact: root?.querySelector<HTMLElement>('[data-fact^="oi_candle_provenance:"]')?.dataset.fact ?? "",
    };
  });
}

/** `bucketMs → x` as `x = a + b·(bucketMs / 5 min)`, from two crosshair readings far apart. */
interface Mapping {
  readonly a: number;
  readonly b: number;
  readonly leftMs: number;
  readonly rightMs: number;
}

async function calibrate(page: Page): Promise<Mapping> {
  const box = await oiCanvasBox(page);
  const y = box.y + box.height * 0.6;
  const named: { x: number; k: number }[] = [];
  const misses: string[] = [];
  for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = box.x + box.width * fraction;
    await page.mouse.move(x, y);
    const legend = await readLegend(page);
    if (legend.source === "crosshair" && legend.bucketMs !== null) named.push({ x, k: legend.bucketMs / FIVE });
    else misses.push(`${fraction}:${legend.source}:${legend.bucketMs}`);
  }
  await page.mouse.move(2, 2);
  const p = named[0];
  const q = named[named.length - 1];
  if (p === undefined || q === undefined || q.k === p.k) throw new Error(`calibration: the OI legend named too few buckets (${misses.join(", ")})`);
  const b = (q.x - p.x) / (q.k - p.k);
  const a = p.x - b * p.k;
  const toMs = (x: number) => ((x - a) / b) * FIVE;
  return { a, b, leftMs: toMs(box.x), rightMs: toMs(box.x + box.width) };
}

/** `paineis-de-fluxo` `T-06.1` — `[fromMs, toMs]` on screen, `VIEW_MARGIN_BUCKETS` of margin each side
 * (the right one only as far as the axis goes), put there by `view.ts::showView` — wheel and drag in
 * a closed loop, from WHEREVER the page is, so no view depends on the mount's framing (`VIEW_BARS`).
 * Paging is allowed: the older-page view sits before the SSR window, and a view near the window's left
 * edge may cross the trigger, as the walk before `T-06.1` could. `minSpacingPx`: the view is narrowed
 * around its centre until a bucket is that wide (`measurePhase`). Then `calibrate` maps ms → px from
 * the crosshair — it is the phase/legend instrument, not navigation. */
async function calibratedView(page: Page, fromMs: number, toMs: number, minSpacingPx?: number): Promise<Mapping> {
  const state = await readView(page);
  const axisEndMs = state.windowStartMs + state.slotCount * state.stepMs;
  const target = {
    kind: "timeRange" as const,
    fromMs: fromMs - VIEW_MARGIN_BUCKETS * FIVE,
    toMs: Math.min(axisEndMs, toMs + VIEW_MARGIN_BUCKETS * FIVE),
  };
  const view = await showView(page, target, { allowPaging: true, minBarSpacingPx: minSpacingPx });
  fact(SPEC, "show_range_trace", { fromMs, toMs, iterations: view.iterations, pages: view.pagesRequestedDuring, trace: view.trace });
  return calibrate(page);
}

interface ColumnInk {
  readonly up: number;
  readonly down: number;
  readonly neutral: number;
  readonly line: number;
}

type InkClass = "up" | "down" | "neutral" | "none" | "mixed";

function classify(ink: ColumnInk): InkClass {
  if (ink.up > 0 && ink.down > 0) return "mixed";
  if (ink.up > 0) return "up";
  if (ink.down > 0) return "down";
  return ink.neutral > 0 ? "neutral" : "none";
}

function rgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`rgb: ${hex} is not #rrggbb — the tokens changed spelling`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Ink rows in the 3 device columns under each page-CSS `x`, over the whole OI pane (pointer parked). */
async function readColumns(page: Page, xs: readonly number[]): Promise<ColumnInk[]> {
  return page.evaluate(
    ({ testId, xs, inks, tol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      const canvases = Array.from(layer.parentElement?.children ?? []).filter(
        (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
      );
      const rect = canvases[0]!.getBoundingClientRect();
      const dpr = canvases[0]!.width / rect.width;
      // ONLY the pane's main canvas: the series (candle or line) is drawn there. The top canvas carries the
      // crosshair and the last-value line, whose grey is within tolerance of the doji ink
      // (`149,152,161` vs `#8b949e`, `[MEDIDO 2026-09-27]` in the stub's hole columns).
      const images = canvases.slice(0, 1).map((c) => ({ width: c.width, height: c.height, data: c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data }));
      const near = (data: Uint8ClampedArray, at: number, color: readonly number[]) =>
        Math.abs(data[at]! - color[0]!) <= tol && Math.abs(data[at + 1]! - color[1]!) <= tol && Math.abs(data[at + 2]! - color[2]!) <= tol;
      return xs.map((pageX) => {
        const center = Math.round((pageX - rect.left) * dpr);
        const ink = { up: 0, down: 0, neutral: 0, line: 0 };
        for (const image of images) {
          for (let x = center - 1; x <= center + 1; x += 1) {
            if (x < 0 || x >= image.width) continue;
            for (let y = 0; y < image.height; y += 1) {
              const at = (y * image.width + x) * 4;
              if (image.data[at + 3] === 0) continue;
              if (near(image.data, at, inks.up)) ink.up += 1;
              else if (near(image.data, at, inks.down)) ink.down += 1;
              else if (near(image.data, at, inks.neutral)) ink.neutral += 1;
              else if (near(image.data, at, inks.line)) ink.line += 1;
            }
          }
        }
        return ink;
      });
    },
    {
      testId: OI_PANE_TESTID,
      xs: [...xs],
      inks: { up: [...rgb(TOKENS.directionUpFill)], down: [...rgb(TOKENS.directionDownFill)], neutral: [...rgb(TOKENS.provenanceWeak)], line: [...rgb(TOKENS.provenanceStrong)] },
      tol: INK_TOLERANCE,
    },
  );
}

/** One bucket as the screen shows it: identity, candle centre, the legend read ON the candle, and the ink. */
interface BucketReading {
  readonly bucketMs: number;
  readonly centerX: number;
  readonly legend: LegendReading;
  readonly ink: ColumnInk;
}

interface ViewAudit {
  readonly spacingPx: number;
  /** Worst distance of a legend group's centre from the least-squares line (half a bucket = unusable). */
  readonly fitResidualPx: number;
  /** Half the gap between the forward and the backward sweep's centres: the legend's lag. */
  readonly lagPx: number;
  /** Where the candles are, relative to the legend groups' centres (half a spacing from the scan's gap). */
  readonly candlePhasePx: number;
  /** The legend read on the LEFT and on the RIGHT quarter of probed candles: `self` / `previous` / `next`. */
  readonly leftQuarter: Readonly<Record<string, number>>;
  readonly rightQuarter: Readonly<Record<string, number>>;
  readonly buckets: readonly BucketReading[];
}

/**
 * Finds every visible bucket's candle and reads it, in four moves:
 *
 *  1. sweeps the crosshair both ways a third of a bucket per step and groups the steps by the bucket the
 *     OI legend names; a least-squares line through the groups' centres gives the spacing `b` and a grid;
 *  2. scans the candle ink under `grid + δ`, `δ ∈ [−b/2, b/2]`, and takes the phase half a spacing from
 *     the empty gap between bodies (`candlePhaseOf`) — the candles' own
 *     x, found on the canvas, not assumed from the legend (`[MEDIDO 2026-09-27]`, on the 1-minute slot
 *     before `T-05.1`: they sat HALF A BUCKET off the legend groups' centres, `gates/T-03.13-builder.md` §4);
 *  3. names each candle by hovering its RIGHT quarter (inside the candle, and inside the legend region of
 *     the candle itself whichever way the legend's half-bar boundary falls), and asserts ONE integer shift
 *     between the grid and those names;
 *  4. parks the pointer and reads the canvas column under every candle centre.
 */
interface PhaseScanStep {
  readonly delta: number;
  /** Candle ink (up + down + doji) in the columns under `grid + delta`. */
  readonly ink: number;
}

/** A scan with a candle on the canvas has columns between the bodies with (almost) no candle ink. */
const PHASE_SCAN_FLOOR_RATIO = 0.1;

/**
 * The candle phase off a phase scan, or `null` when the scan is FLAT — no step below
 * `PHASE_SCAN_FLOOR_RATIO` of the peak. A flat scan has no candle in it (the `?e2eOiLine=1` line
 * leaves ~100–400 px of anti-aliased stray ink on EVERY step, `[MEDIDO 2026-09-27]`), and any phase
 * read off it is noise: on the same stub the argmax landed on −3, −5 and +2 in three runs, and a phase
 * near `+b/4` puts the right-quarter probe on the legend's half-bar boundary, which is the
 * `ONE bucket shift of the grid (1,0)` of `W6-QA-FRONT`.
 *
 * `paineis-de-fluxo` `T-05.1` — the phase is HALF A SPACING FROM THE CENTRE OF THE GAP, no longer the
 * argmax. The argmax was the centre while a body was ~2 px wide (a `5m` candle on one 1-minute slot of
 * five). Since `T-05.1` the body takes ~80% of the spacing, and a RISING body is HOLLOW (`borderVisible`,
 * `color-tokens.test.ts`): its ink is on its two vertical edges, so the argmax lands on an edge, ~b/2.6
 * off the centre, and the right-quarter probe crossed the boundary — `(1,0)` again, in the first run
 * after the zoom-in (`T-05.1` fechamento, 2026-10-02). The gap between two bodies is empty for every
 * candle kind (filled, hollow, doji), and the floor steps — the very ones the guard demands — are it:
 * their CIRCULAR mean (period `spacingPx`, the gap may straddle `±b/2`) is the gap's centre, and the
 * candle's centre is the opposite point of the period.
 */
function candlePhaseOf(scan: readonly PhaseScanStep[], spacingPx: number = scan.length): number | null {
  if (scan.length === 0) return null;
  let peak = scan[0]!.ink;
  let floor = scan[0]!.ink;
  for (const step of scan) {
    peak = Math.max(peak, step.ink);
    floor = Math.min(floor, step.ink);
  }
  if (!(peak > 0 && floor <= PHASE_SCAN_FLOOR_RATIO * peak)) return null;
  let cos = 0;
  let sin = 0;
  for (const step of scan) {
    if (step.ink > PHASE_SCAN_FLOOR_RATIO * peak) continue;
    const angle = (2 * Math.PI * step.delta) / spacingPx;
    cos += Math.cos(angle);
    sin += Math.sin(angle);
  }
  const gap = (Math.atan2(sin, cos) * spacingPx) / (2 * Math.PI);
  const phase = ((((gap + spacingPx) % spacingPx) + spacingPx) % spacingPx) - spacingPx / 2;
  return Math.round(phase) + 0;
}

/**
 * `phaseFraction` — the candle phase as a fraction of the spacing, measured on the candle page by a
 * previous `auditView`. The ablation passes it: there is no candle on its canvas to scan a phase on,
 * and the phase is a property of the time scale and the legend, not of the series drawn.
 */
async function auditView(page: Page, mapping: Mapping, phaseFraction?: number): Promise<ViewAudit> {
  const box = await oiCanvasBox(page);
  const y = box.y + box.height * 0.6;
  const step = mapping.b / SWEEP_STEPS_PER_BUCKET;
  const sweep = async (xs: readonly number[]) => {
    const groups = new Map<number, number[]>();
    for (const x of xs) {
      await page.mouse.move(x, y);
      const legend = await readLegend(page);
      if (legend.source !== "crosshair" || legend.bucketMs === null) continue;
      const group = groups.get(legend.bucketMs);
      if (group === undefined) groups.set(legend.bucketMs, [x]);
      else group.push(x);
    }
    return groups;
  };
  const xs: number[] = [];
  for (let x = box.x + 4; x < box.x + box.width - 4; x += step) xs.push(x);
  const forward = await sweep(xs);
  const backward = await sweep([...xs].reverse());
  const centerOf = (group: readonly number[]) => (Math.min(...group) + Math.max(...group)) / 2;
  // The first and last bucket of the sweep are cut by its ends: their centre is not measured.
  const ordered = [...forward.entries()]
    .filter(([ms]) => backward.has(ms))
    .sort((p, q) => p[0] - q[0])
    .slice(1, -1);
  if (ordered.length < 3) throw new Error(`auditView: the legend named only ${ordered.length} buckets`);
  const lags = ordered.map(([ms, group]) => (centerOf(group) - centerOf(backward.get(ms)!)) / 2);
  const centers = ordered.map(([ms, group]) => (centerOf(group) + centerOf(backward.get(ms)!)) / 2);
  const ks = ordered.map(([ms]) => ms / FIVE);
  const meanK = ks.reduce((sum, k) => sum + k, 0) / ks.length;
  const meanX = centers.reduce((sum, x) => sum + x, 0) / centers.length;
  const b = ks.reduce((sum, k, i) => sum + (k - meanK) * (centers[i]! - meanX), 0) / ks.reduce((sum, k) => sum + (k - meanK) ** 2, 0);
  const residual = ks.reduce((worst, k, i) => Math.max(worst, Math.abs(meanX + b * (k - meanK) - centers[i]!)), 0);
  const groupX = (k: number) => meanX + b * (k - meanK);

  // 2. The phase: parked pointer, candle ink (up + down + doji) under `grid + δ`, 1 px steps.
  await page.mouse.move(2, 2);
  await waitForChartSettled(page);
  const firstK = ks[0]!;
  const lastK = ks[ks.length - 1]!;
  const allK: number[] = [];
  for (let k = firstK; k <= lastK; k += 1) allK.push(k);
  let phase: number;
  if (phaseFraction === undefined) {
    const scan: PhaseScanStep[] = [];
    const half = Math.floor(b / 2);
    for (let delta = -half; delta <= half; delta += 1) {
      const inks = await readColumns(page, allK.map((k) => groupX(k) + delta));
      scan.push({ delta, ink: inks.reduce((sum, ink) => sum + ink.up + ink.down + ink.neutral, 0) });
    }
    fact(SPEC, "phase_scan", { spacingPx: b, scan });
    const found = candlePhaseOf(scan, b);
    if (found === null) {
      throw new Error(`auditView: the phase scan is flat — no candle on the canvas to find a phase on ${JSON.stringify(scan)}`);
    }
    phase = found;
  } else {
    phase = Math.round(phaseFraction * b);
  }
  const candleX = (k: number) => groupX(k) + phase;

  // 3. The names: the legend on the right quarter of probed candles (and, for the record, the left quarter).
  const inkAtGrid = await readColumns(page, allK.map(candleX));
  const inked = allK.filter((_, i) => inkAtGrid[i]!.up + inkAtGrid[i]!.down + inkAtGrid[i]!.neutral > 0);
  const probeKs = inked.filter((_, i) => i % Math.max(1, Math.floor(inked.length / 8)) === 0).slice(0, 8);
  const shifts = new Set<number>();
  const leftQuarter: Record<string, number> = {};
  const rightQuarter: Record<string, number> = {};
  const relation = (named: number | null, k: number) => (named === null ? "none" : named / FIVE === k ? "self" : named / FIVE === k - 1 ? "previous" : named / FIVE === k + 1 ? "next" : "other");
  for (const k of probeKs) {
    await page.mouse.move(candleX(k) + b / 4, y);
    const right = await readLegend(page);
    shifts.add(right.bucketMs === null ? Number.NaN : right.bucketMs / FIVE - k);
    await page.mouse.move(candleX(k) - b / 4, y);
    const left = await readLegend(page);
    const r = relation(right.bucketMs, k);
    const l = relation(left.bucketMs, k + (right.bucketMs === null ? 0 : right.bucketMs / FIVE - k));
    rightQuarter[r] = (rightQuarter[r] ?? 0) + 1;
    leftQuarter[l] = (leftQuarter[l] ?? 0) + 1;
  }
  if (shifts.size !== 1 || !Number.isInteger([...shifts][0]!)) {
    throw new Error(`auditView: the candles do not map to ONE bucket shift of the grid (${[...shifts].join(",")})`);
  }
  const shift = [...shifts][0]!;

  // 4. Every bucket of the grid, named `(k + shift) · 5 min`, read under its candle's centre, legend on its right quarter.
  const buckets: BucketReading[] = [];
  const inks = await readColumns(page, allK.map(candleX));
  for (const [i, k] of allK.entries()) buckets.push({ bucketMs: (k + shift) * FIVE, centerX: candleX(k), legend: EMPTY_LEGEND, ink: inks[i]! });
  await page.mouse.move(2, 2);
  return {
    spacingPx: b,
    fitResidualPx: residual,
    lagPx: lags.reduce((sum, lag) => sum + lag, 0) / lags.length,
    candlePhasePx: phase,
    leftQuarter,
    rightQuarter,
    buckets,
  };
}

const EMPTY_LEGEND: LegendReading = { source: "", bucketMs: null, open: Number.NaN, high: Number.NaN, low: Number.NaN, close: Number.NaN, derivedFrom: "", fact: "" };

/** The legend read with the pointer on the right quarter of the candle of `bucketMs`. */
async function legendOnCandle(page: Page, bucket: BucketReading, spacingPx: number): Promise<LegendReading> {
  const box = await oiCanvasBox(page);
  await page.mouse.move(bucket.centerX + spacingPx / 4, box.y + box.height * 0.6);
  const legend = await readLegend(page);
  await page.mouse.move(2, 2);
  return legend;
}

// ── The judges: pure ──────────────────────────────────────────────────────────────────────────────

interface Verdict {
  readonly defects: readonly string[];
  /** Set when the screen cannot answer the question — never green. */
  readonly inconclusive: string | null;
  readonly counts: Readonly<Record<string, number>>;
}

const sign = (x: number): InkClass => (x > 0 ? "up" : x < 0 ? "down" : "neutral");

function judgeColour(buckets: readonly BucketReading[], truth: Truth): Verdict {
  const defects: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (name: string) => (counts[name] = (counts[name] ?? 0) + 1);
  for (const bucket of buckets) {
    const candle = truth.candles.get(bucket.bucketMs);
    if (candle === undefined || !candle.closed) continue;
    const regime = candle.derived_from;
    bump(`n_${regime}`);
    const expected = sign(candle.close - candle.open);
    const seen = classify(bucket.ink);
    if (seen !== expected) defects.push(`${bucket.bucketMs} (${regime}): route close−open ${expected}, canvas ${seen} ${JSON.stringify(bucket.ink)}`);
    const priceOpen = truth.priceOpen.get(bucket.bucketMs);
    const priceClose = truth.priceClose.get(bucket.bucketMs);
    if (priceOpen === undefined || priceClose === undefined) continue;
    const price = sign(priceClose - priceOpen);
    if (price !== "neutral" && expected !== "neutral" && price !== expected) bump(`divergent_${regime}`);
  }
  const missing = [HIST, POLL].flatMap((regime) => {
    const out: string[] = [];
    if ((counts[`n_${regime}`] ?? 0) < MIN_PER_REGIME) out.push(`${regime}: n=${counts[`n_${regime}`] ?? 0} < ${MIN_PER_REGIME}`);
    if ((counts[`divergent_${regime}`] ?? 0) === 0) out.push(`${regime}: no bucket where price and OI signs diverge`);
    return out;
  });
  return { defects, inconclusive: missing.length > 0 ? `INCONCLUSIVO — ${missing.join("; ")}` : null, counts };
}

interface Hole {
  readonly firstMissingMs: number;
  readonly lastMissingMs: number;
  /** The bucket ending at the first point after the hole: no anchor at its `T0`, so no candle. */
  readonly firstAfterMs: number;
}

/** Holes of the history inside the window, bounded by points on both sides, with no polling point in
 * `[first − 5 min, firstAfter]` (the historical regime). */
function historicalHoles(truth: Truth): Hole[] {
  const hist = truth.points.get(HIST) ?? new Map<number, number>();
  const poll = truth.points.get(POLL) ?? new Map<number, number>();
  const holes: Hole[] = [];
  const start = Math.ceil(truth.request.windowStartMs / FIVE) * FIVE;
  let first: number | null = null;
  for (let t = start; t <= truth.request.windowEndMsInclusive; t += FIVE) {
    if (!hist.has(t)) {
      if (first === null && hist.has(t - FIVE)) first = t;
      continue;
    }
    if (first !== null) {
      const from = first - FIVE;
      const polled = [...poll.keys()].some((p) => p >= from && p <= t);
      if (!polled) holes.push({ firstMissingMs: first, lastMissingMs: t - FIVE, firstAfterMs: t });
      first = null;
    }
  }
  return holes;
}

function judgeHoles(buckets: readonly BucketReading[], truth: Truth): Verdict {
  const byMs = new Map(buckets.map((bucket) => [bucket.bucketMs, bucket]));
  const defects: string[] = [];
  let holesJudged = 0;
  let slotsJudged = 0;
  for (const hole of historicalHoles(truth)) {
    if (!byMs.has(hole.firstAfterMs)) continue;
    holesJudged += 1;
    for (let t = hole.firstMissingMs; t <= hole.firstAfterMs; t += FIVE) {
      const reading = byMs.get(t);
      if (truth.candles.has(t)) defects.push(`${t}: the route served a candle ${t === hole.firstAfterMs ? "on the first bucket after" : "inside"} the hole ${hole.firstMissingMs}..${hole.lastMissingMs}`);
      if (reading === undefined) continue;
      slotsJudged += 1;
      const seen = classify(reading.ink);
      if (seen !== "none") defects.push(`${t}: candle ink (${seen}) on the canvas ${t === hole.firstAfterMs ? "on the first bucket after" : "inside"} the hole ${JSON.stringify(reading.ink)} x=${reading.centerX.toFixed(1)}`);
    }
  }
  return {
    defects,
    inconclusive: holesJudged === 0 ? "INCONCLUSIVO — no historical hole with its first-after bucket on screen" : null,
    counts: { holes_judged: holesJudged, slots_judged: slotsJudged },
  };
}

/** The buckets in which a capture starts (the first polling point after none), and the one after. */
function captureBuckets(truth: Truth): number[] {
  const poll = truth.points.get(POLL) ?? new Map<number, number>();
  const out: number[] = [];
  for (const t of [...poll.keys()].sort((p, q) => p - q)) {
    if (poll.has(t - MIN) || t - MIN < truth.request.windowStartMs) continue;
    const bucketEnd = Math.ceil(t / FIVE) * FIVE;
    out.push(bucketEnd, bucketEnd + FIVE);
  }
  return out;
}

function judgeOneSeries(buckets: readonly BucketReading[], truth: Truth, hovered: ReadonlyMap<number, LegendReading>): Verdict {
  const byMs = new Map(buckets.map((bucket) => [bucket.bucketMs, bucket]));
  const defects: string[] = [];
  let judged = 0;
  for (const t1 of captureBuckets(truth)) {
    const candle = truth.candles.get(t1);
    if (candle === undefined || !byMs.has(t1)) continue;
    judged += 1;
    const source = truth.sources.find((s) => s.derived_from === candle.derived_from);
    if (source === undefined) {
      defects.push(`${t1}: derived_from ${candle.derived_from} is not a declared source`);
      continue;
    }
    const points = truth.points.get(source.derived_from)!;
    const reference = adr045Candle(points, source.native_grid_ms, t1, FIVE);
    const served = { open: candle.open, high: candle.high, low: candle.low, close: candle.close, open_at_ms: candle.open_at_ms, close_at_ms: candle.close_at_ms, present: candle.samples.present };
    if (reference === null) defects.push(`${t1}: the route served a candle ${candle.derived_from} that ADR-045/D1 does not give on that series`);
    else if (JSON.stringify(reference) !== JSON.stringify(served)) {
      defects.push(`${t1}: ${candle.derived_from} candle is not that series' own (served ${JSON.stringify(served)}, D1 on ${candle.derived_from} ${JSON.stringify(reference)})`);
    }
    if (points.get(candle.open_at_ms) !== candle.open) defects.push(`${t1}: open_at_ms ${candle.open_at_ms} is not a point of ${candle.derived_from} with the open`);
    if (points.get(candle.close_at_ms) !== candle.close) defects.push(`${t1}: close_at_ms ${candle.close_at_ms} is not a point of ${candle.derived_from} with the close`);
    const legend = hovered.get(t1);
    if (legend === undefined) defects.push(`${t1}: the legend was not read on this bucket`);
    else if (
      legend.derivedFrom !== candle.derived_from ||
      legend.fact !== `oi_candle_provenance:${candle.derived_from}` ||
      legend.open !== candle.open ||
      legend.high !== candle.high ||
      legend.low !== candle.low ||
      legend.close !== candle.close
    ) {
      defects.push(`${t1}: the legend shows ${JSON.stringify(legend)}, not the served ${candle.derived_from} candle`);
    }
  }
  return { defects, inconclusive: judged === 0 ? "INCONCLUSIVO — no capture-start bucket with a candle on screen" : null, counts: { capture_buckets_judged: judged } };
}

function judgeAblation(buckets: readonly BucketReading[], truth: Truth): Verdict {
  const defects: string[] = [];
  let judged = 0;
  let lineInk = 0;
  for (const bucket of buckets) {
    lineInk += bucket.ink.line;
    const candle = truth.candles.get(bucket.bucketMs);
    if (candle === undefined || !candle.closed) continue;
    judged += 1;
    if (bucket.ink.up > 0 || bucket.ink.down > 0) defects.push(`${bucket.bucketMs}: candle ink survived the ablation ${JSON.stringify(bucket.ink)}`);
  }
  if (lineInk === 0) defects.push("the ablation's line drew nothing — the control is blind");
  return { defects, inconclusive: judged < MIN_PER_REGIME ? `INCONCLUSIVO — only ${judged} candle buckets under the ablation` : null, counts: { judged, line_ink: lineInk } };
}

function expectGreen(name: string, verdict: Verdict): void {
  fact(SPEC, `verdict_${name}`, { counts: verdict.counts, inconclusive: verdict.inconclusive, defects: verdict.defects.length, first: verdict.defects.slice(0, 5) });
  expect(verdict.inconclusive, `${name}: ${verdict.inconclusive}`).toBeNull();
  expect(verdict.defects, `${name}: ${verdict.defects.length} defect(s)`).toEqual([]);
}

// ── The views: where on the window the judged buckets are ─────────────────────────────────────────

interface View {
  readonly name: string;
  readonly fromMs: number;
  readonly toMs: number;
}

/** The capture-start bucket that follows the LONGEST polling gap in the window, or null when polling never
 * stopped for more than a minute. On real data this is the return after an ingestion stall — a second
 * B→A→B boundary, which only the first capture's view would otherwise never put on screen. */
function longestGapRestart(pollMs: readonly number[]): number | null {
  const poll = [...pollMs].sort((p, q) => p - q);
  let best: { gapMs: number; bucketEndMs: number } | null = null;
  for (let i = 1; i < poll.length; i += 1) {
    const gapMs = poll[i]! - poll[i - 1]!;
    if (gapMs > MIN && (best === null || gapMs > best.gapMs)) best = { gapMs, bucketEndMs: Math.ceil(poll[i]! / FIVE) * FIVE };
  }
  return best === null ? null : best.bucketEndMs;
}

/** Up to three views: the hole nearest before the first capture (its tail, the first-after bucket and ~45
 * historical buckets after it), the capture start (~55 historical buckets before, ~60 polling after), and
 * the RE-ENTRY after the longest polling gap (`W6-QA-FRONT-r2`: on real data the first capture was the only
 * boundary ever judged). The GATE stub has one capture, so there the re-entry view does not exist. */
function viewsOf(truth: Truth): View[] {
  const captures = captureBuckets(truth).filter((_, i) => i % 2 === 0);
  const last = Math.floor(truth.request.windowEndMsInclusive / FIVE) * FIVE - 2 * FIVE;
  const capture = captures[0];
  if (capture === undefined) return [];
  const holes = historicalHoles(truth).filter((hole) => hole.firstAfterMs < capture);
  const views: View[] = [];
  const hole = holes[holes.length - 1];
  if (hole !== undefined) views.push({ name: "hole", fromMs: hole.firstAfterMs - 20 * FIVE, toMs: hole.firstAfterMs + 45 * FIVE });
  views.push({ name: "capture", fromMs: capture - 55 * FIVE, toMs: Math.min(last, capture + 60 * FIVE) });
  const reentry = longestGapRestart([...(truth.points.get(POLL) ?? new Map<number, number>()).keys()]);
  if (reentry !== null && reentry !== capture && captures.includes(reentry) && reentry + 2 * FIVE <= last) {
    views.push({ name: "reentry", fromMs: reentry - 30 * FIVE, toMs: Math.min(last, reentry + 45 * FIVE) });
  }
  return views;
}

interface Acceptance {
  readonly buckets: readonly BucketReading[];
  readonly hovered: ReadonlyMap<number, LegendReading>;
}

async function auditViews(
  page: Page,
  views: readonly View[],
  hoverMs: ReadonlySet<number>,
  label: string,
  phaseFraction?: number,
): Promise<Acceptance> {
  const all = new Map<number, BucketReading>();
  const hovered = new Map<number, LegendReading>();
  for (const view of views) {
    const mapping = await calibratedView(page, view.fromMs, view.toMs);
    const audit = await auditView(page, mapping, phaseFraction);
    fact(SPEC, `${label}_view_${view.name}`, {
      view,
      spacingPx: audit.spacingPx,
      fitResidualPx: audit.fitResidualPx,
      lagPx: audit.lagPx,
      candlePhasePx: audit.candlePhasePx,
      leftQuarter: audit.leftQuarter,
      rightQuarter: audit.rightQuarter,
      buckets: audit.buckets.length,
      first: audit.buckets[0]?.bucketMs,
      last: audit.buckets[audit.buckets.length - 1]?.bucketMs,
    });
    expect(audit.spacingPx, `${view.name}: buckets too narrow to read one by one`).toBeGreaterThanOrEqual(MIN_SPACING_PX);
    // Half a bucket: a skipped or doubled slot would put a centre a whole bucket off the line.
    expect(audit.fitResidualPx, `${view.name}: the crosshair centres are not on a line (the identity is not trustworthy)`).toBeLessThan(audit.spacingPx / 2);
    for (const bucket of audit.buckets) {
      if (!all.has(bucket.bucketMs)) all.set(bucket.bucketMs, bucket);
      if (hoverMs.has(bucket.bucketMs) && !hovered.has(bucket.bucketMs)) hovered.set(bucket.bucketMs, await legendOnCandle(page, bucket, audit.spacingPx));
    }
  }
  return { buckets: [...all.values()].sort((p, q) => p.bucketMs - q.bucketMs), hovered };
}

/**
 * `paineis-de-fluxo` `T-05.1` — THE PHASE IS MEASURED ON A ZOOMED-IN STRETCH, AND ONLY THERE.
 *
 * Since `T-05.1` the axis slot of `5m` is the 5-minute bar itself (it was a 1-minute slot, with the
 * candle on one of five), so the candle body takes ~80% of the bucket's spacing instead of ~16%. At
 * the spacing the views settle on (~12.7 px) the gap between two bodies is ~2.7 px, narrower than the
 * 3-px column `readColumns` reads, and the phase scan never reached a step below
 * `PHASE_SCAN_FLOOR_RATIO` of its peak: `1.261 / 5.290` (`make verify` of 2026-10-02) — `candlePhaseOf`
 * read a canvas full of candles as flat. The scan is right to refuse that (the `?e2eOiLine=1` line
 * gives the same ratio), so the criterion stays; what changes is WHERE it is read: a stretch of
 * `PHASE_VIEW_BUCKETS` consecutive closed candles of the route, zoomed in to `>= PHASE_MIN_SPACING_PX`,
 * where the gap (~6 px) is wider than the column. The phase is a property of the time scale and the
 * legend, not of the zoom (the ablation already carried it across pages as a FRACTION of the spacing),
 * so every view is then named with that fraction. The flat-scan guard still runs, on this stretch:
 * a page with no candle throws here, as it threw before.
 */
const PHASE_VIEW_BUCKETS = 20;
const PHASE_MIN_SPACING_PX = 30;

function phaseRange(truth: Truth, views: readonly View[]): View {
  for (const view of views) {
    let runStart: number | null = null;
    for (let t = Math.ceil(view.fromMs / FIVE) * FIVE; t <= view.toMs; t += FIVE) {
      const candle = truth.candles.get(t);
      if (candle === undefined || !candle.closed) {
        runStart = null;
        continue;
      }
      runStart ??= t;
      if (t - runStart >= (PHASE_VIEW_BUCKETS - 1) * FIVE) return { name: `phase_${view.name}`, fromMs: runStart, toMs: t };
    }
  }
  throw new Error(`INCONCLUSIVO — no run of ${PHASE_VIEW_BUCKETS} closed candles in the views to measure the phase on`);
}

async function measurePhase(page: Page, truth: Truth, views: readonly View[], label: string): Promise<number> {
  const range = phaseRange(truth, views);
  const audit = await auditView(page, await calibratedView(page, range.fromMs, range.toMs, PHASE_MIN_SPACING_PX));
  const phaseFraction = audit.candlePhasePx / audit.spacingPx;
  fact(SPEC, `${label}_phase`, { view: range, candlePhasePx: audit.candlePhasePx, spacingPx: audit.spacingPx, phaseFraction });
  expect(audit.spacingPx, "the phase stretch is not zoomed in enough for the gap between bodies to show").toBeGreaterThanOrEqual(PHASE_MIN_SPACING_PX);
  return phaseFraction;
}

async function acceptance(page: Page, baseUrl: string, apiBase: string, catalog: CatalogEnvelope, label: string): Promise<void> {
  const request = await openSymbol(page, baseUrl, INTERVAL_QUERY);
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveAttribute("data-oi-series-kind", "candlestick");
  const truth = await fetchTruth(apiBase, catalog, request);
  const views = viewsOf(truth);
  fact(SPEC, `${label}_truth`, {
    request,
    candles: truth.candles.size,
    sources: truth.sources.map((s) => s.derived_from),
    holes: historicalHoles(truth),
    capture_buckets: captureBuckets(truth),
    views,
  });
  expect(views.length, "INCONCLUSIVO — no capture start in the window").toBeGreaterThan(0);
  const phaseFraction = await measurePhase(page, truth, views, label);
  const { buckets, hovered } = await auditViews(page, views, new Set(captureBuckets(truth)), label, phaseFraction);
  expectGreen(`${label}_ca7_colour`, judgeColour(buckets, truth));
  expectGreen(`${label}_ca8_hole`, judgeHoles(buckets, truth));
  expectGreen(`${label}_d2bis_one_series`, judgeOneSeries(buckets, truth, hovered));
}

async function ablation(page: Page, baseUrl: string, apiBase: string, catalog: CatalogEnvelope, label: string): Promise<void> {
  // The phase comes from the CANDLE page, on the first view: the line leaves no candle to scan
  // a phase on (`candlePhaseOf`), and naming the columns by a noise phase was `W6-QA-FRONT`'s flake.
  const candleRequest = await openSymbol(page, baseUrl, INTERVAL_QUERY);
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveAttribute("data-oi-series-kind", "candlestick");
  const candleTruth = await fetchTruth(apiBase, catalog, candleRequest);
  const candleViews = viewsOf(candleTruth);
  expect(candleViews.length, "INCONCLUSIVO — no capture start in the window").toBeGreaterThan(0);
  const phaseFraction = await measurePhase(page, candleTruth, candleViews, `${label}_ablation`);

  const request = await openSymbol(page, baseUrl, `${INTERVAL_QUERY}&${ABLATION_QUERY}`);
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveAttribute("data-oi-series-kind", "line");
  const truth = await fetchTruth(apiBase, catalog, request);
  const views = viewsOf(truth);
  expect(views.length, "INCONCLUSIVO — no capture start in the window").toBeGreaterThan(0);
  const { buckets } = await auditViews(page, views, new Set<number>(), `${label}_ablation`, phaseFraction);
  expectGreen(`${label}_px_ablation`, judgeAblation(buckets, truth));
  // The same colour judge that is green on the candle has to REJECT the line: the candle is gone.
  const colour = judgeColour(buckets, truth);
  fact(SPEC, `${label}_ablation_colour_defects`, colour.defects.length);
  expect(colour.defects.length, "the colour judge still passes with the candle gone — it is not reading the candle").toBeGreaterThan(0);
}

/** How many buckets the older-page view spans, all of them BEFORE the SSR window's first bucket. */
const OLDER_VIEW_BUCKETS = 60;

/** The older-page judge (`W6-QA-FRONT-r2` E5): every closed candle the stub serves before the SSR window
 * is on the canvas with the colour of its own close − open. The stub serves the history for any
 * `t <= STUB_END`, so those candles only reach the screen through the pager's merge of the OLDER page;
 * a pager that dropped the older page's `oi_candles` leaves those columns with no candle ink. */
function judgeOlderPage(buckets: readonly BucketReading[], request: RenderedRequest): Verdict {
  const defects: string[] = [];
  let judged = 0;
  const olderMs = buckets.filter((bucket) => bucket.bucketMs < request.windowStartMs).map((bucket) => bucket.bucketMs);
  if (olderMs.length === 0) return { defects, inconclusive: "INCONCLUSIVO — no bucket before the SSR window on screen", counts: { judged } };
  const fromMs = Math.min(...olderMs) - 2 * FIVE;
  const toMs = Math.max(...olderMs);
  const hist = stubPoints(FIVE, stubHist, fromMs, toMs);
  const poll = stubPoints(MIN, stubPoll, fromMs, toMs);
  for (const bucket of buckets) {
    if (bucket.bucketMs >= request.windowStartMs) continue;
    const candle = stubCandle(hist, poll, bucket.bucketMs, request.knowledgeTimeMs);
    if (candle === null || !candle.closed) continue;
    judged += 1;
    const expected = sign(candle.close - candle.open);
    const seen = classify(bucket.ink);
    if (seen !== expected) defects.push(`${bucket.bucketMs}: older page served close−open ${expected}, canvas ${seen} ${JSON.stringify(bucket.ink)}`);
  }
  return { defects, inconclusive: judged < MIN_PER_REGIME ? `INCONCLUSIVO — only ${judged} older-page candles on screen` : null, counts: { judged } };
}

async function olderPage(page: Page, baseUrl: string, apiBase: string, catalog: CatalogEnvelope, label: string): Promise<void> {
  // The phase, on the SSR window's candles (the pager plays no part in it), before the walk.
  const candleRequest = await openSymbol(page, baseUrl, INTERVAL_QUERY);
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveAttribute("data-oi-series-kind", "candlestick");
  const candleTruth = await fetchTruth(apiBase, catalog, candleRequest);
  const phaseFraction = await measurePhase(page, candleTruth, viewsOf(candleTruth), `${label}_older`);

  const request = await openSymbol(page, baseUrl, INTERVAL_QUERY);
  await expect(page.locator(`[data-testid="${OI_PANE_TESTID}"]`)).toHaveAttribute("data-oi-series-kind", "candlestick");
  const toMs = Math.floor(request.windowStartMs / FIVE) * FIVE - 2 * FIVE;
  const view: View = { name: "older", fromMs: toMs - OLDER_VIEW_BUCKETS * FIVE, toMs };
  fact(SPEC, `${label}_older_page_view`, { request, view });
  const { buckets } = await auditViews(page, [view], new Set<number>(), `${label}_older`, phaseFraction);
  expectGreen(`${label}_e5_older_page`, judgeOlderPage(buckets, request));
}

test.use({ viewport: { width: 1600, height: 1300 } });

test.describe(`T-03.13: o instrumento — a fase da vela, ${SPEC}`, () => {
  const scanOf = (inks: readonly number[]): PhaseScanStep[] => {
    const half = Math.floor(inks.length / 2);
    return inks.map((ink, i) => ({ delta: i - half, ink }));
  };

  test("uma varredura com vela dá a fase oposta ao vão; a varredura plana da linha (?e2eOiLine=1) não dá fase", () => {
    // Recorded on the GATE stub, capture view (b = 10.13), `[MEDIDO 2026-09-27, W6-QA-FRONT fix]`.
    // The argmax said −4; since `T-05.1` the phase is the point opposite the gap's centre (+0,5 ⇒ −4,57).
    expect(candlePhaseOf(scanOf([3209, 3318, 2048, 109, 0, 0, 0, 0, 0, 869, 3196]), 10.13), "candles: opposite the gap").toBe(-5);
    // `T-05.1`: bodies at ~80% of b = 12.73 (the 120-bar mount's spacing at `5m`): the 3-px column never
    // sits in the 2.7-px gap, no step under the floor ⇒ flat, which is why `measurePhase` zooms in first
    // `[MEDIDO 2026-10-02, make verify]`.
    expect(
      candlePhaseOf(scanOf([1890, 3793, 5092, 5255, 4931, 4783, 4726, 4919, 5290, 4864, 3467, 1547, 1261]), 12.73),
      "wide bodies at the mount's spacing: flat",
    ).toBeNull();
    // The same view under the ablation, three runs: the argmax walked −2/−2/−2 here and −3/−5/+2 on
    // the hole view — noise, not a phase.
    expect(candlePhaseOf(scanOf([184, 291, 350, 392, 299, 268, 261, 283, 275, 235, 187])), "the line: flat").toBeNull();
    expect(candlePhaseOf(scanOf([119, 147, 169, 168, 166, 160, 160, 166, 172, 160, 153, 133, 119])), "the line: flat").toBeNull();
    expect(candlePhaseOf(scanOf([0, 0, 0])), "no ink at all").toBeNull();
    expect(candlePhaseOf([]), "no scan").toBeNull();
  });

  test("a vista de reentrada: a volta depois do MAIOR buraco do polling; sem buraco, nenhuma", () => {
    const run = (fromMs: number, n: number): number[] => Array.from({ length: n }, (_, i) => fromMs + i * MIN);
    const t0 = 1_790_391_780_000; // 09-26T03:03Z, the first real capture
    // Cala: polling that never stops for more than a minute has no re-entry.
    expect(longestGapRestart(run(t0, 50)), "no gap").toBeNull();
    expect(longestGapRestart([]), "no polling").toBeNull();
    // Morde: a 31 min gap, then the long stall back at 09-27T11:39Z. The LONGER one wins, and the answer is
    // the bucket END that contains the first point back (11:39Z → 11:40Z), not the point.
    const stallBack = 1_790_509_140_000; // 09-27T11:39Z
    const pts = [...run(t0, 10), ...run(t0 + 40 * MIN, 10), ...run(stallBack, 5)];
    expect(longestGapRestart(pts)).toBe(1_790_509_200_000);
    // Order does not matter: the polling map is not sorted.
    expect(longestGapRestart([...pts].reverse())).toBe(1_790_509_200_000);
    // The longest, not the last: gaps of 691 min then 21 min pick the first (t0 + 700 min = 14:43Z → bucket end 14:45Z).
    expect(longestGapRestart([...run(t0, 10), ...run(t0 + 700 * MIN, 10), ...run(t0 + 730 * MIN, 5)])).toBe(1_790_433_900_000);
  });
});

test.describe(`T-03.13: aceite do candle de OI por balde — GATE (stub), ${SPEC}`, () => {
  test.describe.configure({ timeout: 600_000 });
  let catalog: CatalogEnvelope;
  let stub: StubHandle;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    catalog = await fetchCatalog(sentimentoApiBaseUrl());
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    fact(SPEC, "stub", { end: STUB_END, capture: STUB_CAPTURE_MS, hole_first: STUB_HOLE_FIRST, hole_length: STUB_HOLE_LENGTH, mutation: STUB_MUTATION });
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("CA-7 + CA-8′ + D2-bis: cor por contratos, buraco sem vela, uma vela uma série — por balde", async ({ page }) => {
    await acceptance(page, instance!.baseUrl, `${stub.url}/api/v1`, catalog, "gate");
  });

  test("DoD-6: sob ?e2eOiLine=1 a vela some em todos os baldes julgados", async ({ page }) => {
    await ablation(page, instance!.baseUrl, `${stub.url}/api/v1`, catalog, "gate");
  });

  test("E5: as velas de OI da página ANTIGA chegam à tela — o pager não as descarta", async ({ page }) => {
    await olderPage(page, instance!.baseUrl, `${stub.url}/api/v1`, catalog, "gate");
  });
});

test.describe(`T-03.13: aceite do candle de OI por balde — REAL (md.series só leitura), ${SPEC}`, () => {
  test.describe.configure({ timeout: 600_000 });
  let catalog: CatalogEnvelope;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    if (REAL_API === "") return;
    catalog = await fetchCatalog(REAL_API);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: REAL_API.replace(/\/api\/v1$/, "") });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
  });

  test("REAL — CA-7 + CA-8′ + D2-bis por balde, sobre o dado real", async ({ page }) => {
    test.skip(REAL_API === "", "E2E_OI_REAL_API_BASE_URL not set: no read API serving oi_candles over real md.series");
    await acceptance(page, instance!.baseUrl, REAL_API, catalog, "real");
  });

  test("REAL — DoD-6: sob ?e2eOiLine=1 a vela some, sobre o dado real", async ({ page }) => {
    test.skip(REAL_API === "", "E2E_OI_REAL_API_BASE_URL not set: no read API serving oi_candles over real md.series");
    await ablation(page, instance!.baseUrl, REAL_API, catalog, "real");
  });
});
