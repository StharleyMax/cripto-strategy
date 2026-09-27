/**
 * `paineis-de-fluxo` `T-04.6` (`CST-274`; plan `04` DoD 1-6; `SPEC-009` §9 `CA-LIQ`, `CA-9′`,
 * `CA-10′`, `CA-1′`; `ADR-044` `F-6`) — THE ACCEPTANCE OF THE FUSED LIQUIDATION PANE, BUCKET BY
 * BUCKET, IN THE PRODUCTION PAGE, AGAINST THE API THE PAGE READ, WITH THE THREE ABLATIONS.
 *
 * `e2e/31`-`34` each pinned one property of the pane (geometry in the standalone lib, sides and ink in
 * aggregate, the legend, the linear scale). This file is the DoD of the phase: every criterion is read
 * PER BUCKET — the bucket's identity from the crosshair (`data-legend-bucket-ms`), its pixels from the
 * canvas column under the bar's centre, its truth from `/series-history` on the window and
 * `knowledge_time_ms` the server declared on `<main>` — and judged by pure functions written here from
 * the DoD's words, never imported from the code under test.
 *
 * ── WHAT IS JUDGED, PER BUCKET ─────────────────────────────────────────────────────────────────
 *
 *   F-6 (DoD 1)   (i) the bases of the two legs' bars coincide within `1` CSS px on the canvas, and
 *                 with the published zero line; (ii) no value `< 0` reaches `setData` of any of the six
 *                 liquidation series — observed in the lib ITSELF (see "THE setData TAP" below).
 *   CA-LIQ (2)    for `n >= 20` buckets with a leg `> 0`: the `short` bar's top is ABOVE the zero line,
 *                 in the rise token; the `long` bar's bottom BELOW it, in the fall token. A bucket with
 *                 ONE leg `> 0` has no bar on the other side, and with both `> 0` (ratio `>= 2`) the
 *                 taller bar is on the larger leg's side — this is what makes a swap visible where both
 *                 legs have a bar.
 *   CA-9′ (3)     (a) = F-6 (ii); (b) exactly 2 visible numerals, each equal to ITS leg in the API
 *                 (`ausente` where the API has no value), never signed; (c) in buckets with both legs
 *                 `> 0` and distinct, no number on the pane equals `|long − short|` (nor `long + short`).
 *   CA-10′ (4)    per leg, the mark drawn on an ABSENT bucket and the mark drawn on a ZERO bucket are
 *                 different pixels (ink × height), on that leg's side, and every absent/zero bucket has
 *                 its mark.
 *   CA-1′ (5)     one `.tv-lightweight-charts`, and 5 pane layers with `N > 0` points (real data).
 *   non-regr. (6) `DoD-2`: `/series-history` of `coinalyze·sum_liquidation·1m·SUM` answers `n_points > 0`
 *                 for BOTH cohorts (real data; `DoD-1`, the `md.series` count, is a read-only `psql` in
 *                 `gates/T-04.6-builder.md`, because a spec does not talk to the database).
 *
 * ── INCONCLUSIVE IS NOT GREEN ──────────────────────────────────────────────────────────────────
 *
 * The DoD's two clauses — (c) needs a bucket with both legs `> 0` and distinct, `CA-10′` needs both
 * states in the window, per leg — and the `n >= 20` floor of `CA-LIQ` are checked BEFORE any verdict:
 * missing, the test FAILS with `INCONCLUSIVO`, it never passes.
 *
 * ── TWO UNIVERSES, ONE INSTRUMENT ──────────────────────────────────────────────────────────────
 *
 *   GATE (always, what `make verify` runs): the production page (`next start` of the gate's build),
 *     served by a stub API over the REAL catalog of the e2e API with synthetic values in which each leg
 *     has its own period of absent / zero / positive (`e2e/33`'s pattern, so every combination of the
 *     two legs is on screen within 15 minutes). **Nothing is seeded in any database.** The ablations
 *     run here, on the same page, through the same judges.
 *   REAL (only with a window reader of `md.series`, e.g. the owner's stack): the default app
 *     (`E2E_BASE_URL`) on the real API (`E2E_SENTIMENTO_API_BASE_URL`), zoomed onto the densest stretch
 *     of the window. In the weak universe (sqlite) `/series-history` refuses and this test is SKIPPED
 *     with the reason (a skip is not a pass). Run by hand:
 *       `E2E_BASE_URL=http://127.0.0.1:<next> E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1 \
 *        npx playwright test 35-liquidation-acceptance-per-bucket`
 *
 * ── THE setData TAP ────────────────────────────────────────────────────────────────────────────
 *
 * "No value `< 0` in `setData`" is a statement about the calls the LIBRARY receives, and nothing in
 * the DOM witnesses it. So the spec intercepts the page's own JS chunks (`page.route`) and rewrites
 * ONE method of the bundled `lightweight-charts` — `SeriesApi.setData` — to hand its items to
 * `globalThis.__e2eLiquidationTap` first (installed by `addInitScript`). The tap records, for every
 * series on a `liquidation_*` price scale, how many items carried a value and how many were `< 0`.
 * The rewrite is asserted to have hit EXACTLY one method, or the test fails as "instrument blind" —
 * a lib upgrade that renames the method cannot turn this into a silent green.
 *
 * ── THE ABLATIONS (the task's `refs`, literal: *"trocar o scale_ref; somar/subtrair as pernas; fundir
 * ausencia e zero"*) ─────────────────────────────────────────────────────────────────────────────
 *
 *   swap `scale_ref`     `?e2eSwapLiquidationSides=1` (production switch of `T-04.2`) ⇒ `CA-LIQ` REJECTS.
 *   subtract the legs    the tap feeds the lower leg's bars as `−v` (a signed leg: what subtracting puts
 *                        on the path) ⇒ `CA-9′ (a)` REJECTS (and the wrong-side ink appears).
 *   sum the legs         the upper leg's numeral rewritten as `short + long` ⇒ `CA-9′ (b)` and (c)
 *                        REJECT; the difference injected in the legend ⇒ (c) REJECTS.
 *   fuse absent and zero the tap draws every zero mark as the absence mark (value and ink) ⇒ `CA-10′`
 *                        REJECTS.
 *   (pure) twins         each judge is also bitten on synthetic readings (last test), in both universes.
 *
 * Mutations of PRODUCTION code (rebuild per mutation) are run by hand and recorded in
 * `gates/T-04.6-builder.md`.
 */

import http from "node:http";

import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

const SPEC = "35-liquidation-acceptance-per-bucket";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PANE_TESTID = "liquidation-pane";
const SWAP_QUERY = "e2eSwapLiquidationSides=1";
const ONE_MINUTE_MS = 60_000;
const ABSENCE_WORD = "ausente";

/** `CA-LIQ`: `n >= 20` buckets with a leg `> 0`, judged. */
const MIN_POSITIVE_BUCKETS = 20;
/** Each leg must be seen `> 0` at least this often, or its side and ink were never read. */
const MIN_POSITIVE_PER_LEG = 5;
/** `F-6`: the two bases coincide within this, CSS px. */
const MAX_BASE_DISTANCE_PX = 1;
/** Share of columns whose base sits on the modal row — below it the base wobbles and `F-6` reprova. */
const MIN_BASE_MODE_SHARE = 0.95;
/** Both legs `> 0`: the size order is read only where it is decidable on the pixel. */
const ORDER_MIN_RATIO = 2;
const ORDER_MIN_ROWS_DIFFERENCE = 2;

/** Zoom until a bucket is this wide, so the column under the bar's centre is the bar's own. */
const MIN_SPACING_PX = 8;
const MIN_VISIBLE_SLOTS = 80;
const ZOOM_STEP_DELTA = -200;
const ZOOM_BURST = 5;
const MAX_ZOOM_STEPS = 200;
/** The crosshair sweep moves a quarter of a bucket per step. */
const SWEEP_STEPS_PER_BUCKET = 4;

const INK_TOLERANCE = 12;
const TOKENS = colorTokens();
const UP_INK = TOKENS.directionUpFill;
const DOWN_INK = TOKENS.directionDownFill;
const ABSENCE_INK = TOKENS.provenanceWeak;
const ZERO_INK = TOKENS.provenanceStrong;

type Cohort = "short" | "long";
const COHORTS: readonly Cohort[] = ["short", "long"];
type Side = "up" | "down";
/** THE EXPECTATION, written from the DoD (`[Q-LIQ-2]`, Coinalyze): short up, long down. Never read
 * from the registry — reading it from the code under test would make the swap pass. */
const EXPECTED_SIDE: Readonly<Record<Cohort, Side>> = { short: "up", long: "down" };

// ── Truth: the API the page read ────────────────────────────────────────────────────────────────

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
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

/** A leg at a bucket, as the API serves it. `negative` exists so a broken upstream is SEEN. */
type LegTruth =
  | { readonly state: "absent" }
  | { readonly state: "zero"; readonly value: 0 }
  | { readonly state: "positive"; readonly value: number }
  | { readonly state: "negative"; readonly value: number };

interface Truth {
  readonly request: RenderedRequest;
  readonly statuses: Readonly<Record<Cohort, number>>;
  readonly rows: Readonly<Record<Cohort, ReadonlyMap<number, string | null>>>;
}

function legTruth(truth: Truth, cohort: Cohort, bucketMs: number): LegTruth {
  const raw = truth.rows[cohort].get(bucketMs);
  if (raw === undefined || raw === null) return { state: "absent" };
  const value = Number(raw);
  if (value === 0) return { state: "zero", value: 0 };
  return value > 0 ? { state: "positive", value } : { state: "negative", value };
}

function inDeclaredWindow(truth: Truth, bucketMs: number): boolean {
  return bucketMs >= truth.request.windowStartMs && bucketMs <= truth.request.windowEndMsInclusive;
}

async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    return await fetch(url);
  }
}

async function fetchCatalog(apiBase: string): Promise<CatalogEnvelope> {
  const response = await fetchWithOneRetry(`${apiBase}/series-catalog`);
  if (!response.ok) throw new Error(`GET ${apiBase}/series-catalog answered ${response.status}`);
  return (await response.json()) as CatalogEnvelope;
}

function liquidationKey(catalog: CatalogEnvelope, cohort: Cohort): SeriesKey {
  const entry = catalog.entries.find(
    (candidate) =>
      candidate.key.metric === "sum_liquidation" &&
      candidate.key.instrumentId === SYMBOL &&
      candidate.key.cohort === cohort &&
      candidate.key.interval === "1m" &&
      candidate.key.reduction === "SUM",
  );
  if (entry === undefined) throw new Error(`the catalog has no coinalyze sum_liquidation 1m SUM ${cohort} for ${SYMBOL}`);
  return entry.key;
}

/** The SAME question the page asks, on the window the server declared. The body is read as TEXT
 * first: the weak universe answers `Internal Server Error`. */
async function fetchTruth(apiBase: string, catalog: CatalogEnvelope, request: RenderedRequest): Promise<Truth> {
  const statuses: Record<string, number> = {};
  const rows: Record<string, Map<number, string | null>> = {};
  for (const cohort of COHORTS) {
    const query = new URLSearchParams({
      series_key_id: computeSeriesKeyId(liquidationKey(catalog, cohort)),
      symbol: SYMBOL,
      interval: "1m",
      window_start_ms: String(request.windowStartMs),
      window_end_ms: String(request.windowEndMsInclusive),
      knowledge_time_ms: String(request.knowledgeTimeMs),
      bar_policy: "final_only",
    });
    const response = await fetchWithOneRetry(`${apiBase}/series-history?${query.toString()}`);
    const text = await response.text();
    let parsed: readonly HistoryRow[];
    try {
      parsed = (JSON.parse(text) as { rows?: readonly HistoryRow[] }).rows ?? [];
    } catch {
      parsed = [];
    }
    statuses[cohort] = response.status;
    rows[cohort] = new Map(parsed.map((row) => [row.event_time, row.value]));
  }
  return {
    request,
    statuses: statuses as Record<Cohort, number>,
    rows: rows as Record<Cohort, Map<number, string | null>>,
  };
}

/** Does this deployment have a window reader of `md.series`? Asked of the API (`/ready`'s
 * `store.path`), never of an env var — an env var here would be an allowlist in disguise. */
async function seriesWindowReaderPresent(apiBase: string): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBase}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") throw new Error("GET /ready did not publish store.path");
  return !storePath.endsWith(".sqlite3");
}

// ── The stub of the GATE universe ───────────────────────────────────────────────────────────────

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

/** Each leg's own period of the three states (`e2e/33`): long absent on `m % 3 = 1`, zero on
 * `m % 3 = 2`; short absent on `m % 5 = 2`, zero on `m % 5 = 4`. The positive values are in the same
 * range on both legs (so both bars leave the 1 px floor and the size order is readable) and carry a
 * fractional part that makes `short ± long` never an integer — no static count on the pane (the
 * horizon's `N/5760`) can collide with them. */
function stubLeg(cohort: Cohort, bucketMs: number): number | null {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
  if (cohort === "long") {
    const phase = ((minute % 3) + 3) % 3;
    if (phase === 1) return null;
    if (phase === 2) return 0;
    return 600.5 + wave(minute, 4) * 3;
  }
  const phase = ((minute % 5) + 5) % 5;
  if (phase === 2) return null;
  if (phase === 4) return 0;
  return 1000.25 + wave(minute, 5) * 4;
}

function stubValue(key: SeriesKey, bucketMs: number): string | null {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
  const close = (m: number) => 100 + wave(m, 1) / 4;
  switch (key.metric) {
    case "klines_ohlc": {
      const open = close(minute - 1);
      const last = close(minute);
      if (key.reduction === "OPEN") return String(open);
      if (key.reduction === "HIGH") return String(Math.max(open, last) + 0.5);
      if (key.reduction === "LOW") return String(Math.min(open, last) - 0.5);
      return String(last);
    }
    case "klines_volume":
      return String(10 + wave(minute, 2) / 4);
    case "cvd_source":
      return String(wave(minute, 3) - 498);
    case "sum_liquidation": {
      const value = stubLeg(key.cohort === "short" ? "short" : "long", bucketMs);
      return value === null ? null : String(value);
    }
    case "sum_open_interest":
      return String(50_000 + wave(Math.floor(minute / 5) * 5, 6) / 4);
    case "count_long_short_ratio":
      return String(0.5 + wave(Math.floor(minute / 5) * 5, 7) / 512);
    default:
      return String(wave(minute, 9) / 4);
  }
}

interface StubHandle {
  readonly url: string;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map<string, SeriesKey>(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
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
      const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
      const key = keysById.get(seriesKeyId);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`T-04.6 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = stubValue(key, t);
        if (value !== null) rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-04.6-synthetic-values",
            nature: key.nature,
            unit: key.unit,
            coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
          },
          rows,
          knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
          bar_policy: "final_only",
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("T-04.6 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-04.6 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ── The setData tap ─────────────────────────────────────────────────────────────────────────────

/** `SeriesApi.setData` of `lightweight-charts@5.2.1` as the production bundle carries it (the lib's
 * own minified text survives Turbopack): `setData(t){this.Pu,this.ae.bh(),this.Gg.Jg(this.ae,t),
 * this.Qg("full")}` `[MEDIDO 2026-09-27: 1 occurrence in the built chunk that holds the lib]`. The
 * pattern pins the SHAPE, not the mangled names. */
const SET_DATA_METHOD = /setData\((\w+)\)\{(this\.\w+,this\.\w+\.\w+\(\),this\.\w+\.\w+\(this\.\w+,\1\),this\.\w+\("full"\))\}/g;

type TapAblation = "none" | "negate-lower-leg" | "fuse-absence-and-zero";

interface TapRecord {
  readonly scale: string;
  readonly role: string;
  readonly n: number;
  readonly valued: number;
  readonly negatives: number;
  readonly min: number | null;
}

interface TapHandle {
  /** How many `setData` methods the rewrite hit, over every chunk the page loaded. */
  patched(): number;
}

function tapInit({ ablation, absenceInk, zeroInk }: { ablation: TapAblation; absenceInk: string; zeroInk: string }): void {
  type Item = { time: unknown; value?: number; color?: string };
  const records: unknown[] = [];
  const absenceValueByScale: Record<string, number> = {};
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.__e2eLiquidationTapRecords = records;
  scope.__e2eLiquidationTap = (api: { options(): { priceScaleId?: unknown; color?: unknown } }, items: readonly Item[]) => {
    let options: { priceScaleId?: unknown; color?: unknown };
    try {
      options = api.options();
    } catch {
      return items;
    }
    const scale = options.priceScaleId;
    if (typeof scale !== "string" || !scale.startsWith("liquidation_")) return items;
    const color = String(options.color ?? "").toLowerCase();
    const role = !scale.endsWith("_marks") ? "bars" : color === absenceInk ? "absence_mark" : color === zeroInk ? "zero_mark" : `mark:${color}`;
    if (role === "absence_mark") {
      const first = items.find((item) => typeof item.value === "number");
      if (first !== undefined) absenceValueByScale[scale] = first.value!;
    }
    let out: readonly Item[] = items;
    if (ablation === "negate-lower-leg" && role === "bars" && scale === "liquidation_down") {
      out = items.map((item) => (typeof item.value === "number" ? { ...item, value: -item.value } : item));
    }
    if (ablation === "fuse-absence-and-zero" && role === "zero_mark") {
      const absence = absenceValueByScale[scale];
      out = items.map((item) =>
        typeof item.value === "number" ? { ...item, value: absence ?? item.value, color: absenceInk } : item,
      );
    }
    let valued = 0;
    let negatives = 0;
    let min = Number.POSITIVE_INFINITY;
    for (const item of out) {
      if (typeof item.value !== "number") continue;
      valued += 1;
      if (item.value < 0) negatives += 1;
      min = Math.min(min, item.value);
    }
    records.push({ scale, role, n: out.length, valued, negatives, min: valued === 0 ? null : min });
    return out;
  };
}

async function installSetDataTap(page: Page, ablation: TapAblation): Promise<TapHandle> {
  let patched = 0;
  await page.addInitScript(tapInit, { ablation, absenceInk: ABSENCE_INK.toLowerCase(), zeroInk: ZERO_INK.toLowerCase() });
  await page.route(/\/_next\/static\/chunks\/[^?]*\.js(\?.*)?$/, async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();
    let hits = 0;
    const rewritten = body.replace(SET_DATA_METHOD, (_match, items: string, rest: string) => {
      hits += 1;
      return `setData(${items}){${items}=globalThis.__e2eLiquidationTap?globalThis.__e2eLiquidationTap(this,${items}):${items};${rest}}`;
    });
    patched += hits;
    const headers = { ...response.headers() };
    delete headers["content-length"];
    delete headers["content-encoding"];
    await route.fulfill({ status: response.status(), headers, body: rewritten });
  });
  return { patched: () => patched };
}

async function readTap(page: Page): Promise<readonly TapRecord[]> {
  return page.evaluate(() => ((globalThis as unknown as Record<string, unknown>).__e2eLiquidationTapRecords ?? []) as TapRecord[]);
}

// ── The page ────────────────────────────────────────────────────────────────────────────────────

async function openSymbol(page: Page, baseUrl: string, query: string): Promise<RenderedRequest> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query === "" ? "" : `?${query}`}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} did not answer ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
    timeout: 120_000,
  });
  await expect(page.locator(`[data-testid="${PANE_TESTID}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-testid="${PANE_TESTID}"]`)).toHaveAttribute("data-liquidation-zero-line-px", /^\d/);
  await page.waitForTimeout(1_000);
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

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The liquidation pane's drawing canvas (the widest canvas next to the layer), page CSS px. */
async function paneCanvasBox(page: Page): Promise<CanvasBox> {
  return page.evaluate((paneTestId) => {
    const layer = document.querySelector(`[data-testid="${paneTestId}"]`)!;
    const canvases = Array.from(layer.parentElement?.children ?? []).filter(
      (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
    );
    if (canvases.length === 0) throw new Error("the liquidation pane has no canvas with area");
    const rect = canvases[0]!.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, PANE_TESTID);
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

/** Wheel-zooms at `anchorFraction` of the pane until a bucket is `MIN_SPACING_PX` wide. Bounded (R9). */
async function zoomToPerBucketSpacing(page: Page, anchorFraction: number): Promise<{ steps: number; spacingPx: number; from: number; to: number }> {
  const box = await paneCanvasBox(page);
  const anchorX = box.x + box.width * anchorFraction;
  const midY = box.y + box.height * 0.75;
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
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  return { steps, spacingPx: spacing(), from, to };
}

interface LegReading {
  readonly kind: string;
  readonly source: string;
  readonly bucketMs: number | null;
  readonly slotIndex: number | null;
  readonly raw: string;
  readonly numeral: string;
}

interface LegendSnapshot {
  readonly legs: Readonly<Record<Cohort, LegReading>>;
  readonly visibleNumerals: number;
  /** Every numeric token of the pane's visible text, numerals included. */
  readonly allTokens: readonly string[];
}

/** One legend reading, after two animation frames (the legend follows the crosshair a frame late). */
async function legendSnapshot(page: Page): Promise<LegendSnapshot> {
  return page.evaluate(
    async ({ paneTestId, cohorts }) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const layer = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`)!;
      const legs: Record<string, unknown> = {};
      for (const cohort of cohorts) {
        const value = layer.querySelector<HTMLElement>(`[data-legend-value="liquidation_${cohort}"]`);
        const bucket = value?.dataset.legendBucketMs ?? "";
        const slot = value?.dataset.legendSlotIndex ?? "";
        legs[cohort] = {
          kind: value?.dataset.legendKind ?? "",
          source: value?.dataset.legendSource ?? "",
          bucketMs: bucket === "" ? null : Number(bucket),
          slotIndex: slot === "" ? null : Number(slot),
          raw: value?.dataset.legendRaw ?? "",
          numeral: value?.querySelector("[data-legend-numeral]")?.textContent ?? "",
        };
      }
      const visible = (element: Element | null): boolean => {
        if (element === null || element.closest(".sr-only") !== null) return false;
        if (!(element as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      };
      const visibleNumerals = Array.from(layer.querySelectorAll("[data-legend-numeral]")).filter(visible).length;
      const allTokens: string[] = [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!visible(node.parentElement)) continue;
        allTokens.push(...((node.textContent ?? "").match(/[-−]?\d+(?:\.\d+)?/g) ?? []));
      }
      return { legs, visibleNumerals, allTokens } as unknown as LegendSnapshot;
    },
    { paneTestId: PANE_TESTID, cohorts: COHORTS },
  );
}

/** The ink in one canvas column, split by side of the zero line. Device rows. */
interface ColumnInk {
  readonly upBar: { readonly rows: number; readonly top: number | null; readonly bottom: number | null };
  readonly downBar: { readonly rows: number; readonly top: number | null; readonly bottom: number | null };
  /** Mark ink rows on each side, by ink. */
  readonly upMarks: { readonly weak: number; readonly strong: number };
  readonly downMarks: { readonly weak: number; readonly strong: number };
  /** Bar ink on the wrong side of the zero line (rise token below it, fall token above it). */
  readonly wrongSide: number;
}

interface PaneGeometry {
  readonly dpr: number;
  readonly zeroRow: number;
  readonly zeroLinePx: number;
  readonly sides: string | null;
  readonly barScales: string | null;
  readonly columns: readonly ColumnInk[];
}

/** Reads the canvas column under each page-CSS `x` (the pointer is parked outside the chart first). */
async function readColumns(page: Page, xs: readonly number[]): Promise<PaneGeometry> {
  return page.evaluate(
    ({ paneTestId, xs, inks, tol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`)!;
      const canvases = Array.from(layer.parentElement?.children ?? []).filter(
        (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
      );
      const rect = canvases[0]!.getBoundingClientRect();
      const dpr = canvases[0]!.width / rect.width;
      const zeroLinePx = Number(layer.dataset.liquidationZeroLinePx);
      const zeroRow = zeroLinePx * dpr;
      const images = canvases.map((c) => ({ width: c.width, height: c.height, data: c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data }));
      const near = (data: Uint8ClampedArray, at: number, rgb: readonly number[]) =>
        Math.abs(data[at]! - rgb[0]!) <= tol && Math.abs(data[at + 1]! - rgb[1]!) <= tol && Math.abs(data[at + 2]! - rgb[2]!) <= tol;
      const classify = (x: number, y: number): "up" | "down" | "weak" | "strong" | null => {
        for (const image of images) {
          if (x >= image.width || y >= image.height) continue;
          const at = (y * image.width + x) * 4;
          if (image.data[at + 3] === 0) continue;
          if (near(image.data, at, inks.up)) return "up";
          if (near(image.data, at, inks.down)) return "down";
          if (near(image.data, at, inks.weak)) return "weak";
          if (near(image.data, at, inks.strong)) return "strong";
        }
        return null;
      };
      const height = images[0]!.height;
      const columns = xs.map((pageX) => {
        const x = Math.round((pageX - rect.left) * dpr);
        const upBar = { rows: 0, top: null as number | null, bottom: null as number | null };
        const downBar = { rows: 0, top: null as number | null, bottom: null as number | null };
        const upMarks = { weak: 0, strong: 0 };
        const downMarks = { weak: 0, strong: 0 };
        let wrongSide = 0;
        for (let y = 0; y < height; y += 1) {
          const ink = classify(x, y);
          if (ink === null) continue;
          const above = y < zeroRow;
          if (ink === "up" || ink === "down") {
            const bar = ink === "up" ? upBar : downBar;
            bar.rows += 1;
            bar.top = bar.top === null ? y : Math.min(bar.top, y);
            bar.bottom = bar.bottom === null ? y : Math.max(bar.bottom, y);
            // One device row of slack each way: the two bases are ADJACENT rows (`T-04.0` §2.1).
            if (ink === "up" ? y > zeroRow + dpr : y < zeroRow - dpr) wrongSide += 1;
          } else {
            (above ? upMarks : downMarks)[ink] += 1;
          }
        }
        return { upBar, downBar, upMarks, downMarks, wrongSide };
      });
      return {
        dpr,
        zeroRow,
        zeroLinePx,
        sides: layer.dataset.liquidationSides ?? null,
        barScales: layer.dataset.liquidationBarScales ?? null,
        columns,
      };
    },
    {
      paneTestId: PANE_TESTID,
      xs: [...xs],
      inks: { up: [...rgb(UP_INK)], down: [...rgb(DOWN_INK)], weak: [...rgb(ABSENCE_INK)], strong: [...rgb(ZERO_INK)] },
      tol: INK_TOLERANCE,
    },
  );
}

function rgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`rgb: ${hex} is not #rrggbb — the tokens changed spelling`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** One bucket as the screen shows it: its identity (crosshair), its legend and its canvas column. */
interface BucketReading {
  readonly bucketMs: number;
  readonly centerX: number;
  readonly legend: LegendSnapshot;
  readonly column: ColumnInk;
}

interface PaneAudit {
  readonly spacingPx: number;
  readonly geometry: Omit<PaneGeometry, "columns">;
  readonly buckets: readonly BucketReading[];
  /** Snapshots whose two legs named different buckets — the legend must never split. */
  readonly splitSnapshots: number;
}

/**
 * Sweeps the crosshair over `[fromFraction, toFraction]` of the pane a quarter-bucket per step, groups
 * the steps by the bucket the legend names, takes each bucket's centre as the middle of its steps
 * (the crosshair snaps to the nearest bar, so that interval is symmetric around the bar), then parks the
 * pointer and reads the canvas column under every centre.
 */
async function auditPane(page: Page, spacingPx: number, fromFraction: number, toFraction: number): Promise<PaneAudit> {
  const box = await paneCanvasBox(page);
  const zeroLinePx = Number(await page.locator(`[data-testid="${PANE_TESTID}"]`).getAttribute("data-liquidation-zero-line-px"));
  const y = box.y + Math.min(box.height - 4, zeroLinePx + (box.height - zeroLinePx) * 0.5);
  const step = spacingPx / SWEEP_STEPS_PER_BUCKET;
  const byBucket = new Map<number, { xs: number[]; legend: LegendSnapshot }>();
  let splitSnapshots = 0;
  for (let x = box.x + box.width * fromFraction; x < box.x + box.width * toFraction; x += step) {
    await page.mouse.move(x, y);
    const snapshot = await legendSnapshot(page);
    const [s, l] = [snapshot.legs.short, snapshot.legs.long];
    if (s.source !== "crosshair" || s.bucketMs === null) continue;
    if (l.bucketMs !== s.bucketMs) {
      splitSnapshots += 1;
      continue;
    }
    const entry = byBucket.get(s.bucketMs);
    if (entry === undefined) byBucket.set(s.bucketMs, { xs: [x], legend: snapshot });
    else entry.xs.push(x);
  }
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  // The first and last bucket of the sweep are cut by its ends: their centre is not measured.
  const ordered = [...byBucket.entries()].sort((a, b) => a[0] - b[0]).slice(1, -1);
  const centers = ordered.map(([, entry]) => (Math.min(...entry.xs) + Math.max(...entry.xs)) / 2);
  const geometry = await readColumns(page, centers);
  const { columns, ...rest } = geometry;
  return {
    spacingPx,
    geometry: rest,
    buckets: ordered.map(([bucketMs, entry], index) => ({ bucketMs, centerX: centers[index]!, legend: entry.legend, column: columns[index]! })),
    splitSnapshots,
  };
}

// ── The judges: pure, and bitten on synthetic readings in the last test ─────────────────────────

interface Verdict {
  readonly defects: readonly string[];
  /** Set when the window cannot answer the question — never green. */
  readonly inconclusive: string | null;
  readonly counts: Readonly<Record<string, number>>;
  /** What the judge saw, for the facts (e.g. the mark signatures per state). */
  readonly detail?: unknown;
}

function isGreen(verdict: Verdict): boolean {
  return verdict.inconclusive === null && verdict.defects.length === 0;
}

function barOf(column: ColumnInk, side: Side): ColumnInk["upBar"] {
  return side === "up" ? column.upBar : column.downBar;
}

function marksOf(column: ColumnInk, side: Side): ColumnInk["upMarks"] {
  return side === "up" ? column.upMarks : column.downMarks;
}

/** `CA-LIQ` (DoD 2): side and ink of every bar, per bucket, against the API. */
function judgeSides(audit: PaneAudit, truth: Truth): Verdict {
  const defects: string[] = [];
  const positive: Record<Cohort, number> = { short: 0, long: 0 };
  let bucketsWithPositive = 0;
  let orderJudged = 0;
  const zeroRow = audit.geometry.zeroRow;
  for (const bucket of audit.buckets) {
    if (!inDeclaredWindow(truth, bucket.bucketMs)) continue;
    const legs = { short: legTruth(truth, "short", bucket.bucketMs), long: legTruth(truth, "long", bucket.bucketMs) };
    const at = `@${bucket.bucketMs}`;
    if (bucket.column.wrongSide !== 0) defects.push(`${at}: ${bucket.column.wrongSide} bar row(s) on the wrong side of the zero line`);
    let any = false;
    for (const cohort of COHORTS) {
      const leg = legs[cohort];
      const side = EXPECTED_SIDE[cohort];
      const bar = barOf(bucket.column, side);
      if (leg.state === "positive") {
        any = true;
        positive[cohort] += 1;
        if (bar.rows === 0) {
          defects.push(`${cohort}${at}: API ${leg.value} > 0, no ${side === "up" ? "rise" : "fall"}-token bar on its side`);
        } else if (side === "up" ? bar.top! >= zeroRow : bar.bottom! <= zeroRow) {
          defects.push(`${cohort}${at}: the bar does not reach ${side === "up" ? "above" : "below"} the zero line`);
        }
      } else if (bar.rows !== 0) {
        // The other leg is not `> 0` here, so any bar on this side is the wrong leg's.
        defects.push(`${cohort}${at}: API ${leg.state}, but a bar is drawn on ${cohort}'s side (${bar.rows} rows)`);
      }
    }
    if (any) bucketsWithPositive += 1;
    if (legs.short.state === "positive" && legs.long.state === "positive") {
      const [s, l] = [legs.short.value, legs.long.value];
      const [hUp, hDown] = [bucket.column.upBar.rows, bucket.column.downBar.rows];
      if (Math.max(s, l) / Math.min(s, l) >= ORDER_MIN_RATIO && Math.abs(hUp - hDown) >= ORDER_MIN_ROWS_DIFFERENCE) {
        orderJudged += 1;
        if (s > l !== hUp > hDown) defects.push(`${at}: short ${s} vs long ${l}, but up ${hUp} rows vs down ${hDown} rows`);
      }
    }
  }
  let inconclusive: string | null = null;
  if (bucketsWithPositive < MIN_POSITIVE_BUCKETS) {
    inconclusive = `INCONCLUSIVO: ${bucketsWithPositive} bucket(s) with a leg > 0 judged, the DoD floor is ${MIN_POSITIVE_BUCKETS}`;
  } else if (positive.short < MIN_POSITIVE_PER_LEG || positive.long < MIN_POSITIVE_PER_LEG) {
    inconclusive = `INCONCLUSIVO: short > 0 in ${positive.short}, long > 0 in ${positive.long} bucket(s); each leg needs ${MIN_POSITIVE_PER_LEG}`;
  }
  return { defects, inconclusive, counts: { bucketsWithPositive, shortPositive: positive.short, longPositive: positive.long, orderJudged } };
}

/** `F-6 (i)` (DoD 1): the two bases coincide within `MAX_BASE_DISTANCE_PX`, on the published zero line. */
function judgeBaselines(audit: PaneAudit): Verdict {
  const upBases: number[] = [];
  const downBases: number[] = [];
  for (const bucket of audit.buckets) {
    if (bucket.column.upBar.bottom !== null) upBases.push(bucket.column.upBar.bottom);
    if (bucket.column.downBar.top !== null) downBases.push(bucket.column.downBar.top);
  }
  if (upBases.length < MIN_POSITIVE_PER_LEG || downBases.length < MIN_POSITIVE_PER_LEG) {
    return { defects: [], inconclusive: `INCONCLUSIVO: ${upBases.length} up / ${downBases.length} down bar(s) to read a base from`, counts: {} };
  }
  const mode = (values: readonly number[]) => {
    const tally = new Map<number, number>();
    for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
    const [row, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;
    return { row, share: n / values.length };
  };
  const up = mode(upBases);
  const down = mode(downBases);
  const { dpr, zeroRow } = audit.geometry;
  const distancePx = (down.row - up.row) / dpr;
  const defects: string[] = [];
  if (up.share < MIN_BASE_MODE_SHARE) defects.push(`the upper base wobbles: only ${(up.share * 100).toFixed(1)}% of bars on row ${up.row}`);
  if (down.share < MIN_BASE_MODE_SHARE) defects.push(`the lower base wobbles: only ${(down.share * 100).toFixed(1)}% of bars on row ${down.row}`);
  if (distancePx < 0 || distancePx > MAX_BASE_DISTANCE_PX) defects.push(`the bases are ${distancePx} CSS px apart (rows ${up.row} / ${down.row}), F-6 allows ${MAX_BASE_DISTANCE_PX}`);
  for (const [name, row] of [["upper", up.row], ["lower", down.row]] as const) {
    if (Math.abs(row + 0.5 - zeroRow) / dpr > MAX_BASE_DISTANCE_PX + 0.5) defects.push(`the ${name} base (row ${row}) is off the published zero line (${zeroRow})`);
  }
  return {
    defects,
    inconclusive: null,
    counts: { upBaseRow: up.row, downBaseRow: down.row, distanceCssPx: distancePx, upShare: up.share, downShare: down.share, upBars: upBases.length, downBars: downBases.length },
  };
}

/** `F-6 (ii)` = `CA-9′ (a)`: the six liquidation series were fed, and not one value `< 0`. */
function judgeNoNegativeFed(records: readonly TapRecord[], patched: number): Verdict {
  if (patched !== 1) {
    return { defects: [], inconclusive: `INCONCLUSIVO: the setData rewrite hit ${patched} method(s), not 1 — instrument blind`, counts: { patched } };
  }
  const series = new Map<string, { calls: number; valued: number; negatives: number }>();
  for (const record of records) {
    const id = `${record.scale}/${record.role}`;
    const entry = series.get(id) ?? { calls: 0, valued: 0, negatives: 0 };
    entry.calls += 1;
    entry.valued += record.valued;
    entry.negatives += record.negatives;
    series.set(id, entry);
  }
  const expected = [
    "liquidation_up/bars",
    "liquidation_down/bars",
    "liquidation_up_marks/absence_mark",
    "liquidation_up_marks/zero_mark",
    "liquidation_down_marks/absence_mark",
    "liquidation_down_marks/zero_mark",
  ];
  const missing = expected.filter((id) => !series.has(id));
  if (missing.length > 0) {
    return { defects: [], inconclusive: `INCONCLUSIVO: the tap never saw ${missing.join(", ")} — instrument blind`, counts: { patched } };
  }
  const defects: string[] = [];
  for (const id of ["liquidation_up/bars", "liquidation_down/bars"]) {
    if (series.get(id)!.valued === 0) defects.push(`${id} was fed no value at all`);
  }
  const negatives = [...series.values()].reduce((sum, entry) => sum + entry.negatives, 0);
  if (negatives > 0) defects.push(`${negatives} value(s) < 0 reached setData of the liquidation series`);
  const unknown = [...series.keys()].filter((id) => !expected.includes(id));
  if (unknown.length > 0) defects.push(`unexpected liquidation series fed: ${unknown.join(", ")}`);
  return { defects, inconclusive: null, counts: { patched, calls: records.length, negatives, series: series.size } };
}

/** `CA-9′ (b)`: exactly 2 numerals, each its own leg's API value; (c) no combination of the legs. */
function judgeLegend(audit: PaneAudit, truth: Truth): Verdict {
  const defects: string[] = [];
  let bothPositiveDistinct = 0;
  let judged = 0;
  if (audit.splitSnapshots > 0) defects.push(`${audit.splitSnapshots} snapshot(s) where the two legs named different buckets`);
  for (const bucket of audit.buckets) {
    if (!inDeclaredWindow(truth, bucket.bucketMs)) continue;
    judged += 1;
    const { legend } = bucket;
    const at = `@${bucket.bucketMs}`;
    if (legend.visibleNumerals !== 2) defects.push(`${at}: ${legend.visibleNumerals} visible numerals, not 2`);
    const values: Partial<Record<Cohort, number>> = {};
    for (const cohort of COHORTS) {
      const leg = legTruth(truth, cohort, bucket.bucketMs);
      const shown = legend.legs[cohort];
      if (/[-−]/.test(shown.numeral)) defects.push(`${cohort}${at}: signed numeral ${shown.numeral}`);
      if (leg.state === "absent") {
        if (shown.kind !== "absent" || shown.numeral !== ABSENCE_WORD) defects.push(`${cohort}${at}: API absent, legend ${shown.kind}/${shown.numeral}`);
        continue;
      }
      values[cohort] = leg.value;
      // `raw` is the served number; the painted numeral drops IEEE-754 noise (15 significant digits).
      if (shown.kind === "absent" || Number(shown.raw) !== leg.value || Number(shown.numeral) !== Number(leg.value.toPrecision(15))) {
        defects.push(`${cohort}${at}: API ${leg.value}, legend ${shown.kind}/${shown.raw}/${shown.numeral}`);
      }
    }
    const [s, l] = [values.short, values.long];
    if (s !== undefined && l !== undefined && s > 0 && l > 0 && s !== l) {
      bothPositiveDistinct += 1;
      const combined = [Math.abs(l - s), l + s];
      for (const token of legend.allTokens) {
        const n = Math.abs(Number(token.replace("−", "-")));
        if (combined.some((c) => Math.abs(n - c) <= 1e-9 * Math.max(1, c))) {
          defects.push(`${at}: the pane shows ${token}, a combination of the legs (short ${s}, long ${l})`);
        }
      }
    }
  }
  const inconclusive =
    bothPositiveDistinct === 0 ? "INCONCLUSIVO: no bucket with both legs > 0 and distinct in the window (CA-9′ (c))" : judged === 0 ? "INCONCLUSIVO: no bucket judged" : null;
  return { defects, inconclusive, counts: { judged, bothPositiveDistinct } };
}

/** `CA-10′` (DoD 4): per leg, absent and zero draw different marks, on that leg's side. */
function judgeAbsenceVsZero(audit: PaneAudit, truth: Truth): Verdict {
  const defects: string[] = [];
  const counts: Record<string, number> = {};
  const detail: Record<string, unknown> = {};
  const inconclusive: string[] = [];
  for (const cohort of COHORTS) {
    const side = EXPECTED_SIDE[cohort];
    const signatures: Record<"absent" | "zero", Map<string, number>> = { absent: new Map(), zero: new Map() };
    for (const bucket of audit.buckets) {
      if (!inDeclaredWindow(truth, bucket.bucketMs)) continue;
      const leg = legTruth(truth, cohort, bucket.bucketMs);
      const marks = marksOf(bucket.column, side);
      if (leg.state !== "absent" && leg.state !== "zero") {
        if (marks.weak + marks.strong > 0) defects.push(`${cohort}@${bucket.bucketMs}: API ${leg.state}, a mark is drawn on its side`);
        continue;
      }
      if (marks.weak + marks.strong === 0) {
        defects.push(`${cohort}@${bucket.bucketMs}: API ${leg.state}, no mark on ${cohort}'s side`);
        continue;
      }
      const signature = `${marks.weak}w${marks.strong}s`;
      signatures[leg.state].set(signature, (signatures[leg.state].get(signature) ?? 0) + 1);
    }
    const nAbsent = [...signatures.absent.values()].reduce((a, b) => a + b, 0);
    const nZero = [...signatures.zero.values()].reduce((a, b) => a + b, 0);
    counts[`${cohort}Absent`] = nAbsent;
    counts[`${cohort}Zero`] = nZero;
    detail[cohort] = { absent: Object.fromEntries(signatures.absent), zero: Object.fromEntries(signatures.zero) };
    if (nAbsent === 0 || nZero === 0) {
      inconclusive.push(`${cohort}: ${nAbsent} absent / ${nZero} zero bucket(s) with a mark`);
      continue;
    }
    const shared = [...signatures.absent.keys()].filter((signature) => signatures.zero.has(signature));
    if (shared.length > 0) {
      defects.push(`${cohort}: absent and zero draw the same mark ${shared.join(", ")} (absent ${[...signatures.absent.keys()]}, zero ${[...signatures.zero.keys()]})`);
    }
  }
  return { defects, inconclusive: inconclusive.length === 0 ? null : `INCONCLUSIVO: ${inconclusive.join("; ")}`, counts, detail };
}

function summary(verdict: Verdict): unknown {
  return {
    green: isGreen(verdict),
    inconclusive: verdict.inconclusive,
    counts: verdict.counts,
    detail: verdict.detail ?? null,
    defects: verdict.defects.slice(0, 12),
    nDefects: verdict.defects.length,
  };
}

/** A green verdict or a failure that names the inconclusive clause or the first defects. */
function expectGreen(verdict: Verdict, name: string): void {
  expect(verdict.inconclusive, `${name}: ${verdict.inconclusive}`).toBeNull();
  expect(verdict.defects, `${name}: defects`).toEqual([]);
}

/** A rejection by DEFECT (not by an inconclusive window): the ablation bit. */
function expectRejected(verdict: Verdict, name: string): void {
  expect(verdict.inconclusive, `${name}: the ablation made the window inconclusive instead of failing the judge`).toBeNull();
  expect(verdict.defects.length, `MORDE: ${name} had to reject the ablated page`).toBeGreaterThan(0);
}

// ── GATE universe: the production page on a stub ────────────────────────────────────────────────

test.use({ viewport: { width: 1280, height: 1200 } });

test.describe(`T-04.6 gate: the fused liquidation pane, per bucket, with the ablations (${SPEC})`, () => {
  let stub: StubHandle | undefined;
  let instance: NextInstanceHandle | undefined;
  let catalog: CatalogEnvelope | undefined;

  test.beforeAll(async () => {
    catalog = await fetchCatalog(sentimentoApiBaseUrl());
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  /** Opens the page (with an optional query and tap ablation), zooms on the right, sweeps half of it. */
  async function auditGate(page: Page, query: string, ablation: TapAblation) {
    const tap = await installSetDataTap(page, ablation);
    const request = await openSymbol(page, instance!.baseUrl, query);
    const zoom = await zoomToPerBucketSpacing(page, 0.8);
    const audit = await auditPane(page, zoom.spacingPx, 0.45, 0.95);
    const truth = await fetchTruth(stub!.url, catalog!, request);
    return { tap, request, zoom, audit, truth, records: await readTap(page) };
  }

  test("design: F-6, CA-LIQ, CA-9′ (a)(b)(c) and CA-10′ are green bucket by bucket; the legend ablations are rejected", async ({ page }) => {
    const { tap, zoom, audit, truth, records } = await auditGate(page, "", "none");
    const verdicts = {
      f6Bases: judgeBaselines(audit),
      noNegativeFed: judgeNoNegativeFed(records, tap.patched()),
      sides: judgeSides(audit, truth),
      legend: judgeLegend(audit, truth),
      absenceVsZero: judgeAbsenceVsZero(audit, truth),
    };
    fact(SPEC, "gate_design", {
      zoom,
      buckets: audit.buckets.length,
      geometry: audit.geometry,
      verdicts: Object.fromEntries(Object.entries(verdicts).map(([name, verdict]) => [name, summary(verdict)])),
    });
    expect(audit.geometry.sides, "the page does not declare the registry's sides").toBe("short:up;long:down");
    expect(audit.buckets.length, "too few buckets swept — the instrument is blind").toBeGreaterThanOrEqual(40);
    for (const [name, verdict] of Object.entries(verdicts)) expectGreen(verdict, name);

    // ABLATION "sum the legs" in the legend, and the difference injected: (b) and (c) reject.
    const target = audit.buckets.find(
      (bucket) => legTruth(truth, "short", bucket.bucketMs).state === "positive" && legTruth(truth, "long", bucket.bucketMs).state === "positive",
    )!;
    const box = await paneCanvasBox(page);
    await page.mouse.move(target.centerX, box.y + box.height * 0.75);
    const before = await legendSnapshot(page);
    expect(before.legs.short.bucketMs, "the crosshair did not return to the target bucket").toBe(target.bucketMs);
    const [s, l] = [Number(before.legs.short.raw), Number(before.legs.long.raw)];
    const one = (legend: LegendSnapshot): PaneAudit => ({ ...audit, splitSnapshots: 0, buckets: [{ ...target, legend }] });
    expect(judgeLegend(one(before), truth).defects, "the untouched legend at the target bucket").toEqual([]);
    await page.evaluate(
      ({ paneTestId, text }) => {
        document.querySelector(`[data-testid="${paneTestId}"] [data-legend-value="liquidation_short"] [data-legend-numeral]`)!.textContent = text;
      },
      { paneTestId: PANE_TESTID, text: String(Number((s + l).toPrecision(15))) },
    );
    const summed = judgeLegend(one(await legendSnapshot(page)), truth);
    fact(SPEC, "gate_ablation_sum_in_legend", summary(summed));
    expect(summed.defects.some((d) => /^short@.*legend/.test(d)), "MORDE: (b) had to reject short + long in the short numeral").toBe(true);
    expect(summed.defects.some((d) => /combination of the legs/.test(d)), "MORDE: (c) had to reject short + long on the pane").toBe(true);
    await page.evaluate(
      ({ paneTestId, text }) => {
        const line = document.querySelector(`[data-testid="${paneTestId}"] [data-legend-value="liquidation_long"]`)!.parentElement!;
        const span = document.createElement("span");
        span.textContent = text;
        line.appendChild(span);
      },
      { paneTestId: PANE_TESTID, text: String(Number(Math.abs(l - s).toPrecision(15))) },
    );
    const subtracted = judgeLegend(one(await legendSnapshot(page)), truth);
    fact(SPEC, "gate_ablation_difference_in_legend", summary(subtracted));
    expect(subtracted.defects.filter((d) => /combination of the legs/.test(d)).length, "MORDE: (c) had to reject |long − short|").toBeGreaterThanOrEqual(2);
  });

  test("ablation: the two scale_ref swapped — CA-LIQ rejects", async ({ page }) => {
    const { audit, truth } = await auditGate(page, SWAP_QUERY, "none");
    const sides = judgeSides(audit, truth);
    fact(SPEC, "gate_ablation_swap", { sides: audit.geometry.sides, verdict: summary(sides) });
    expect(audit.geometry.sides, "the ablation did not reach the page").toBe("short:down;long:up");
    expectRejected(sides, "CA-LIQ");
  });

  test("ablation: the lower leg fed as a signed value (subtracting) — CA-9′ (a) rejects", async ({ page }) => {
    const { tap, audit, truth, records } = await auditGate(page, "", "negate-lower-leg");
    const fed = judgeNoNegativeFed(records, tap.patched());
    const sides = judgeSides(audit, truth);
    fact(SPEC, "gate_ablation_negate_lower_leg", { fed: summary(fed), sides: summary(sides) });
    expectRejected(fed, "CA-9′ (a)");
    expect(fed.defects.some((d) => /< 0 reached setData/.test(d))).toBe(true);
  });

  test("ablation: every zero mark drawn as the absence mark — CA-10′ rejects", async ({ page }) => {
    const { audit, truth } = await auditGate(page, "", "fuse-absence-and-zero");
    const marks = judgeAbsenceVsZero(audit, truth);
    fact(SPEC, "gate_ablation_fuse_absence_zero", summary(marks));
    expectRejected(marks, "CA-10′");
    for (const cohort of COHORTS) {
      expect(marks.defects.some((d) => d.startsWith(`${cohort}: absent and zero draw the same mark`)), `MORDE: CA-10′ had to reject ${cohort}`).toBe(true);
    }
  });
});

// ── REAL universe: the default app on the real API ──────────────────────────────────────────────

/**
 * Where to zoom on real data: the `width`-slot window, inside the visible `[from, to]`, that best
 * answers the DoD's clauses — first the buckets with BOTH legs `> 0` and distinct (`CA-9′ (c)`, capped
 * at 5), then the buckets with a leg `> 0` (`CA-LIQ`'s floor, capped at 40), then each leg's positives
 * and zeros (`CA-10′`). Returns the window's first slot and the ANCHOR slot to zoom at: the wheel keeps
 * the anchor at its screen fraction `f = (c − from) / (to − from)`, so the zoomed view is
 * `[c − f·width, c + (1 − f)·width]`, and `c` is solved for that view to start at the window.
 */
function zoomTarget(
  truth: Truth,
  t0: { slot: number; bucketMs: number },
  from: number,
  to: number,
  width: number,
): { readonly first: number; readonly anchor: number; readonly score: Readonly<Record<string, number>> } {
  const count = (first: number) => {
    const c = { both: 0, anyPositive: 0, shortPositive: 0, longPositive: 0, shortZero: 0, longZero: 0 };
    // The sweep drops its first and last bucket, and the zoomed width is an estimate: a margin each side.
    for (let i = first + 6; i < first + width - 6; i += 1) {
      const bucketMs = t0.bucketMs + (i - t0.slot) * ONE_MINUTE_MS;
      const s = legTruth(truth, "short", bucketMs);
      const l = legTruth(truth, "long", bucketMs);
      if (s.state === "positive") c.shortPositive += 1;
      if (l.state === "positive") c.longPositive += 1;
      if (s.state === "zero") c.shortZero += 1;
      if (l.state === "zero") c.longZero += 1;
      if (s.state === "positive" || l.state === "positive") c.anyPositive += 1;
      if (s.state === "positive" && l.state === "positive" && s.value !== l.value) c.both += 1;
    }
    return c;
  };
  const scoreOf = (c: ReturnType<typeof count>) =>
    Math.min(c.both, 5) * 1e7 +
    Math.min(c.anyPositive, 40) * 1e5 +
    Math.min(c.shortPositive, c.longPositive) * 1e2 +
    Math.min(c.shortZero, c.longZero, 99);
  let best = Math.floor(to - width);
  let bestCounts = count(best);
  for (let first = Math.ceil(from); first <= Math.floor(to - width); first += 3) {
    const counts = count(first);
    if (scoreOf(counts) > scoreOf(bestCounts)) [best, bestCounts] = [first, counts];
  }
  const range = to - from;
  const anchor = (best - (from * width) / range) / (1 - width / range);
  return { first: best, anchor, score: bestCounts };
}

/** Real data: zoom onto the stretch `zoomTarget` picks, sweep the whole pane, judge every criterion. */
async function auditRealZoomed(page: Page, truth: Truth, tap: TapHandle) {
  const box = await paneCanvasBox(page);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75);
  const probe = await legendSnapshot(page);
  await page.mouse.move(2, 2);
  const { from, to } = await visibleRange(page);
  if (probe.legs.short.slotIndex === null || probe.legs.short.bucketMs === null) {
    throw new Error("the crosshair named no slot — cannot map slots to time");
  }
  const target = zoomTarget(
    truth,
    { slot: probe.legs.short.slotIndex, bucketMs: probe.legs.short.bucketMs },
    from,
    to,
    Math.floor(box.width / MIN_SPACING_PX),
  );
  const anchor = Math.min(0.99, Math.max(0.01, (target.anchor + 0.5 - from) / (to - from)));
  const zoom = await zoomToPerBucketSpacing(page, anchor);
  const audit = await auditPane(page, zoom.spacingPx, 0.01, 0.99);
  const records = await readTap(page);
  const verdicts = {
    f6Bases: judgeBaselines(audit),
    noNegativeFed: judgeNoNegativeFed(records, tap.patched()),
    sides: judgeSides(audit, truth),
    legend: judgeLegend(audit, truth),
    absenceVsZero: judgeAbsenceVsZero(audit, truth),
  };
  return { target, anchor, zoom, audit, verdicts };
}

function verdictFacts(verdicts: Readonly<Record<string, Verdict>>): unknown {
  return Object.fromEntries(Object.entries(verdicts).map(([name, verdict]) => [name, summary(verdict)]));
}

test(`T-04.6 real data: every criterion of the phase on the real API, per bucket (${SPEC})`, async ({ page, baseURL }) => {
  test.setTimeout(400_000);
  const apiBase = sentimentoApiBaseUrl();
  const readerPresent = await seriesWindowReaderPresent(apiBase);
  fact(SPEC, "series_window_reader_present", readerPresent);
  test.skip(!readerPresent, "universo FRACO: sem leitor de janela de md.series, /series-history recusa — não há dado real para julgar (skip não é verde)");

  const tap = await installSetDataTap(page, "none");
  const request = await openSymbol(page, baseURL ?? "", "");
  const catalog = await fetchCatalog(apiBase);
  const truth = await fetchTruth(apiBase, catalog, request);
  const nPoints = Object.fromEntries(COHORTS.map((c) => [c, [...truth.rows[c].values()].filter((v) => v !== null).length]));
  fact(SPEC, "real_request", { request, statuses: truth.statuses, nPoints });

  // DoD 6 (non-regression, DoD-2): the API answers both cohorts with points.
  for (const cohort of COHORTS) {
    expect(truth.statuses[cohort], `${cohort}: /series-history status`).toBe(200);
    expect(nPoints[cohort], `DoD-2: ${cohort} has no point in the window`).toBeGreaterThan(0);
  }

  // DoD 5 (CA-1′): one chart, five pane layers, each with N > 0 points.
  const panes = await page.evaluate(() => {
    const pointsOf = (testId: string, attr: string, groups?: readonly string[]) => {
      const layer = document.querySelector(`[data-testid="${testId}"]`);
      if (layer === null) return Number.NaN;
      if (groups === undefined) return Number(layer.getAttribute(attr) ?? Number.NaN);
      return Math.min(...groups.map((g) => Number(layer.querySelector(`[data-testid="${g}"]`)?.getAttribute(attr) ?? Number.NaN)));
    };
    return {
      charts: document.querySelectorAll(".tv-lightweight-charts").length,
      oldLiquidationPanes: document.querySelectorAll('[data-testid="liquidation-long-pane"], [data-testid="liquidation-short-pane"]').length,
      points: {
        price: pointsOf("price-pane", "data-price-candles"),
        liquidation: pointsOf("liquidation-pane", "data-liquidation-present-points", ["liquidation-cohort-short", "liquidation-cohort-long"]),
        oi: pointsOf("oi-pane", "data-oi-wire-points"),
        longShort: pointsOf("long-short-pane", "data-long-short-wire-points"),
        cvd: pointsOf("cvd-pane", "data-cvd-present-points"),
      },
    };
  });
  fact(SPEC, "real_ca1", panes);
  expect.soft(panes.charts, "CA-1′: more than one chart").toBe(1);
  expect.soft(panes.oldLiquidationPanes, "CA-1′: a per-cohort liquidation pane is still mounted").toBe(0);
  const withPoints = Object.values(panes.points).filter((n) => n > 0).length;
  expect.soft(withPoints, `CA-1′: panes with N > 0 (${JSON.stringify(panes.points)})`).toBe(5);

  const { target, anchor, zoom, audit, verdicts } = await auditRealZoomed(page, truth, tap);
  fact(SPEC, "real_audit", {
    target,
    anchor,
    zoom,
    buckets: audit.buckets.length,
    firstBucketMs: audit.buckets[0]?.bucketMs ?? null,
    lastBucketMs: audit.buckets.at(-1)?.bucketMs ?? null,
    geometry: audit.geometry,
    verdicts: verdictFacts(verdicts),
  });
  expect.soft(audit.geometry.sides).toBe("short:up;long:down");
  for (const [name, verdict] of Object.entries(verdicts)) {
    expect.soft(verdict.inconclusive, `${name}: ${verdict.inconclusive}`).toBeNull();
    expect.soft(verdict.defects, `${name}: defects`).toEqual([]);
  }
});

test(`T-04.6 real data: the three ablations are rejected on the real API too (${SPEC})`, async ({ browser, baseURL }) => {
  test.setTimeout(400_000);
  const apiBase = sentimentoApiBaseUrl();
  test.skip(!(await seriesWindowReaderPresent(apiBase)), "universo FRACO: sem leitor de janela de md.series (skip não é verde)");
  const catalog = await fetchCatalog(apiBase);
  const run = async (query: string, ablation: TapAblation) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, locale: "pt-BR" });
    try {
      const tap = await installSetDataTap(page, ablation);
      const request = await openSymbol(page, baseURL ?? "", query);
      const truth = await fetchTruth(apiBase, catalog, request);
      return await auditRealZoomed(page, truth, tap);
    } finally {
      await page.close();
    }
  };
  const swapped = await run(SWAP_QUERY, "none");
  fact(SPEC, "real_ablation_swap", { sides: swapped.audit.geometry.sides, sidesVerdict: summary(swapped.verdicts.sides) });
  expect.soft(swapped.audit.geometry.sides, "the swap did not reach the page").toBe("short:down;long:up");
  expectRejected(swapped.verdicts.sides, "CA-LIQ (real, swapped scale_ref)");

  const negated = await run("", "negate-lower-leg");
  fact(SPEC, "real_ablation_negate_lower_leg", { fed: summary(negated.verdicts.noNegativeFed), sides: summary(negated.verdicts.sides) });
  expectRejected(negated.verdicts.noNegativeFed, "CA-9′ (a) (real, signed lower leg)");

  const fused = await run("", "fuse-absence-and-zero");
  fact(SPEC, "real_ablation_fuse_absence_zero", summary(fused.verdicts.absenceVsZero));
  expectRejected(fused.verdicts.absenceVsZero, "CA-10′ (real, fused marks)");
});

// ── The judges bitten on synthetic readings (both universes; nothing touches a page) ─────────────

test(`T-04.6 judges: each one rejects its ablation on a synthetic reading (${SPEC})`, () => {
  const zeroRow = 100;
  const bar = (rows: number, side: Side) =>
    rows === 0 ? { rows: 0, top: null, bottom: null } : side === "up" ? { rows, top: zeroRow - rows, bottom: zeroRow - 1 } : { rows, top: zeroRow, bottom: zeroRow + rows - 1 };
  const noMarks = { weak: 0, strong: 0 };
  const absentMark = { weak: 2, strong: 0 };
  const zeroMark = { weak: 0, strong: 6 };
  const legOf = (minute: number): Record<Cohort, number | null> => {
    const t = minute * ONE_MINUTE_MS;
    return { short: stubLeg("short", t), long: stubLeg("long", t) };
  };
  const minutes = Array.from({ length: 60 }, (_u, i) => 29_000_000 + i);
  const truth: Truth = {
    request: { windowStartMs: minutes[0]! * ONE_MINUTE_MS, windowEndMsInclusive: minutes.at(-1)! * ONE_MINUTE_MS, knowledgeTimeMs: 0 },
    statuses: { short: 200, long: 200 },
    rows: {
      short: new Map(minutes.map((m) => [m * ONE_MINUTE_MS, legOf(m).short === null ? null : String(legOf(m).short)])),
      long: new Map(minutes.map((m) => [m * ONE_MINUTE_MS, legOf(m).long === null ? null : String(legOf(m).long)])),
    },
  };
  const markFor = (v: number | null) => (v === null ? absentMark : v === 0 ? zeroMark : noMarks);
  const heightFor = (v: number | null) => (v === null || v === 0 ? 0 : Math.max(1, Math.round(v / 100)));
  const numeral = (v: number | null) => (v === null ? ABSENCE_WORD : String(v));
  const reading = (swap = false, fuse = false, shift = 0): PaneAudit => ({
    spacingPx: 8,
    geometry: { dpr: 1, zeroRow, zeroLinePx: zeroRow, sides: "short:up;long:down", barScales: null },
    splitSnapshots: 0,
    buckets: minutes.map((m, i) => {
      const legs = legOf(m);
      const [upV, downV] = swap ? [legs.long, legs.short] : [legs.short, legs.long];
      const fused = (mark: { weak: number; strong: number }) => (fuse && mark === zeroMark ? absentMark : mark);
      const down = bar(heightFor(downV), "down");
      return {
        bucketMs: m * ONE_MINUTE_MS,
        centerX: i * 8,
        column: {
          upBar: bar(heightFor(upV), "up"),
          downBar: down.rows === 0 ? down : { ...down, top: down.top! + shift, bottom: down.bottom! + shift },
          upMarks: fused(markFor(upV)),
          downMarks: fused(markFor(downV)),
          wrongSide: 0,
        },
        legend: {
          visibleNumerals: 2,
          allTokens: [numeral(legs.short), numeral(legs.long)].filter((t) => t !== ABSENCE_WORD),
          legs: Object.fromEntries(
            COHORTS.map((c) => [
              c,
              { kind: legs[c] === null ? "absent" : "value", source: "crosshair", bucketMs: m * ONE_MINUTE_MS, slotIndex: i, raw: legs[c] === null ? "" : String(legs[c]), numeral: numeral(legs[c]) },
            ]),
          ) as Record<Cohort, LegReading>,
        },
      };
    }),
  });
  const design = reading();
  // CALA: the right reading is green on every judge.
  expect(isGreen(judgeSides(design, truth))).toBe(true);
  expect(isGreen(judgeBaselines(design))).toBe(true);
  expect(isGreen(judgeLegend(design, truth))).toBe(true);
  expect(isGreen(judgeAbsenceVsZero(design, truth))).toBe(true);
  // MORDE: swap the scale_ref ⇒ CA-LIQ; fuse the marks ⇒ CA-10′; shift a base 3 px ⇒ F-6.
  expect(judgeSides(reading(true), truth).defects.length).toBeGreaterThan(0);
  expect(judgeAbsenceVsZero(reading(false, true), truth).defects.length).toBeGreaterThan(0);
  expect(judgeBaselines(reading(false, false, 3)).defects.length).toBeGreaterThan(0);
  // MORDE: the sum in a numeral ⇒ (b); the difference on the pane ⇒ (c).
  const both = design.buckets.findIndex((b) => b.legend.legs.short.raw !== "" && b.legend.legs.long.raw !== "" && Number(b.legend.legs.short.raw) > 0 && Number(b.legend.legs.long.raw) > 0);
  const tamper = (edit: (legend: LegendSnapshot) => LegendSnapshot): PaneAudit => ({
    ...design,
    buckets: design.buckets.map((b, i) => (i === both ? { ...b, legend: edit(b.legend) } : b)),
  });
  const s = Number(design.buckets[both]!.legend.legs.short.raw);
  const l = Number(design.buckets[both]!.legend.legs.long.raw);
  expect(judgeLegend(tamper((g) => ({ ...g, legs: { ...g.legs, short: { ...g.legs.short, numeral: String(s + l) } } })), truth).defects.length).toBeGreaterThan(0);
  expect(judgeLegend(tamper((g) => ({ ...g, allTokens: [...g.allTokens, String(Math.abs(l - s))] })), truth).defects.length).toBeGreaterThan(0);
  expect(judgeLegend(tamper((g) => ({ ...g, visibleNumerals: 3 })), truth).defects.length).toBeGreaterThan(0);
  // MORDE: a negative fed value ⇒ (a); a rewrite that hit nothing ⇒ INCONCLUSIVO, never green.
  const fed: TapRecord[] = [
    ["liquidation_up", "bars"],
    ["liquidation_down", "bars"],
    ["liquidation_up_marks", "absence_mark"],
    ["liquidation_up_marks", "zero_mark"],
    ["liquidation_down_marks", "absence_mark"],
    ["liquidation_down_marks", "zero_mark"],
  ].map(([scale, role]) => ({ scale: scale!, role: role!, n: 10, valued: 5, negatives: 0, min: 1 }));
  expect(isGreen(judgeNoNegativeFed(fed, 1))).toBe(true);
  expect(judgeNoNegativeFed(fed.map((r, i) => (i === 1 ? { ...r, negatives: 3, min: -5 } : r)), 1).defects.length).toBeGreaterThan(0);
  expect(judgeNoNegativeFed(fed, 0).inconclusive).toMatch(/instrument blind/);
  expect(judgeNoNegativeFed(fed.slice(1), 1).inconclusive).toMatch(/instrument blind/);
  // INCONCLUSIVO, not green: fewer than 20 buckets with a leg > 0; no bucket with both legs > 0.
  expect(judgeSides({ ...design, buckets: design.buckets.slice(0, 10) }, truth).inconclusive).toMatch(/INCONCLUSIVO/);
  const oneLegTruth: Truth = { ...truth, rows: { ...truth.rows, long: new Map() } };
  expect(judgeLegend(design, oneLegTruth).inconclusive).toMatch(/INCONCLUSIVO/);
  expect(judgeAbsenceVsZero(design, oneLegTruth).inconclusive).toMatch(/INCONCLUSIVO: long: \d+ absent \/ 0 zero/);
});
