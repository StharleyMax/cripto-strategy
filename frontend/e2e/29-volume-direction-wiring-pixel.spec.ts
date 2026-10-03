import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import { colorTokens } from "../src/charts/color-tokens.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";
import { showView } from "./view.ts";

/**
 * `paineis-de-fluxo` `T-02.3` — the WIRING of plan `02` item `2.4`, read off the PIXELS of the real
 * app (`next start` of the built `.next`), against a deterministic stub: the price pane's volume bar
 * series is fed `directionalVolumeSeriesLossless(volume.slots, panels.price.series.slots)`, so the
 * bar under a candle takes that candle's direction ink, and a bar with no candle at its instant keeps
 * the neutral ink (`RN-4`).
 *
 * WHAT IS COMPARED, per canvas COLUMN of the price pane: the ink of the candle drawn in that column
 * (read ABOVE the volume band, where only candles draw) against the ink of the volume bar in the same
 * column (read on the bars' BASE row, where only bars draw — every present bar is at least 1 px tall,
 * the library's floor). The stub draws LONG runs of one direction (240 min up, 240 min down) so a
 * column holds one direction even when several 1-minute bars share it, and then a 120-minute stretch
 * with volume but NO candle, which is what `RN-4` is about.
 *
 * ⛔ THIS IS NOT `T-02.4` (`CA-6`). That one reads BTCUSDT's REAL data against `/series-history`, per
 * bar, `n >= 50`. This one is the wiring's proof inside `make verify`, which composes the WEAK universe
 * (sqlite, `/series-history` refuses) where a spec on real data never bites — the reason `e2e/28`
 * uses a stub too. Nothing is written to any database.
 *
 * ⚠️ DEFAULT TF (`1m`) ONLY: the stub answers 1-minute rows whatever `interval` is asked, so it cannot
 * stand for a TF ≠ `1m`. The time pairing across TFs is `T-02.1`'s unit test
 * (`charts/volume-direction.test.ts`) plus the real-data check recorded in `gates/T-02.3-builder.md`.
 *
 * ABLATION, run by hand and recorded in `gates/T-02.3-builder.md` (a rebuild per mutant, too slow for
 * the gate): the wiring back to `positiveValueSeriesLossless` fails the agreement (every bar neutral);
 * the comparator inverted in `volumeBarColor` fails it too (every bar the opposite ink).
 *
 * Run with: `npx playwright test 29-volume-direction-wiring-pixel` (needs a built `.next`).
 */

const SPEC = "29-volume-direction-wiring-pixel";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PRICE_PANE_TESTID = "price-pane";
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";
const ONE_MINUTE_MS = 60_000;

/** The stub's cycle, in minutes: `[0, 240)` up, `[240, 480)` down, `[480, 600)` volume without candle. */
const RUN_MINUTES = 240;
const GAP_MINUTES = 120;
const CYCLE_MINUTES = 2 * RUN_MINUTES + GAP_MINUTES;

/** How many columns must be compared, per direction, for the verdict to mean anything. Below it the
 * result is INCONCLUSIVE, never green (plan `02` DoD 2 says the same of `T-02.4`'s window). */
const MIN_COLUMNS_PER_DIRECTION = 40;
/** A column boundary between two runs can hold both inks; the rest must agree. */
const MIN_AGREEMENT = 0.97;
/** A 120-minute gap is >= 25 px at the densest window this page has served (`0.21 px/bucket`,
 * `e2e/15`); half of that is the floor for "the gap drew neutral bars". */
const MIN_NEUTRAL_RUN_COLUMNS = 12;

// ── The stub ────────────────────────────────────────────────────────────────────────────────

type Candle = { readonly open: number; readonly high: number; readonly low: number; readonly close: number };

/** The candle of minute `t`, or `null` inside the gap. A continuous zig-zag: `open(m+1) = close(m)`. */
function stubCandle(t: number): Candle | null {
  const phase = Math.floor(t / ONE_MINUTE_MS) % CYCLE_MINUTES;
  if (phase >= 2 * RUN_MINUTES) {
    return null;
  }
  const up = phase < RUN_MINUTES;
  const open = up ? 1_000 + phase : 1_000 + 2 * RUN_MINUTES - phase;
  const close = up ? open + 1 : open - 1;
  return { open, close, high: Math.max(open, close) + 0.25, low: Math.min(open, close) - 0.25 };
}

/** Present, strictly positive, every minute (no absence, no zero: the marks are `e2e/28`'s). */
function stubVolume(t: number): string {
  return (50 + (Math.floor(t / ONE_MINUTE_MS) % 7) * 10).toFixed(4);
}

const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;
type OhlcReduction = (typeof OHLC_REDUCTIONS)[number];

/** The four `klines_ohlc` keys (as `e2e/25`) and the `klines_volume` key (as `e2e/28`). */
function ohlcKey(reduction: OhlcReduction): SeriesKey {
  return {
    provider: "binance",
    venue: "binance",
    instrumentId: SYMBOL,
    metric: "klines_ohlc",
    cohort: "NA",
    interval: "1m",
    unit: "USD",
    denom: "USD",
    nature: "STOCK",
    tsConvention: "OHLC_OVER_BUCKET",
    reduction,
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "NA",
    verifiedBy: "T-02.3-synthetic-stub",
  } as SeriesKey;
}

const VOLUME_KEY = {
  provider: "binance",
  venue: "usdm_futures",
  instrumentId: SYMBOL,
  metric: "klines_volume",
  cohort: "all",
  interval: "1m",
  unit: "BTC",
  denom: "base",
  nature: "FLOW",
  tsConvention: "AGGREGATE_OVER_BUCKET",
  reduction: "SUM",
  quantityField: "NA",
  labelShift: 0,
  aggregationScope: "Symbol",
  verifiedBy: "T-02.3-synthetic-stub",
} as SeriesKey;

type Role = OhlcReduction | "VOLUME";

function syntheticCatalog(): { readonly envelope: unknown; readonly roleById: ReadonlyMap<string, Role> } {
  const roleById = new Map<string, Role>();
  const entries = [
    ...OHLC_REDUCTIONS.map((reduction) => {
      const key = ohlcKey(reduction);
      roleById.set(computeSeriesKeyId(key), reduction);
      return { key, nativeGrid: "1m", maxStalenessMs: 600_000, priceUse: null, reconstructedFrom: null, publishedError: null };
    }),
    (() => {
      roleById.set(computeSeriesKeyId(VOLUME_KEY), "VOLUME");
      return { key: VOLUME_KEY, nativeGrid: "1min", maxStalenessMs: 120_000, priceUse: null, reconstructedFrom: null, publishedError: null };
    })(),
  ];
  return { envelope: { query: "series_catalog", n_entries: entries.length, entries }, roleById };
}

function valueFor(role: Role, t: number): string | null {
  if (role === "VOLUME") {
    return stubVolume(t);
  }
  const candle = stubCandle(t);
  if (candle === null) {
    return null;
  }
  const field = { OPEN: candle.open, HIGH: candle.high, LOW: candle.low, CLOSE: candle.close }[role];
  return field.toFixed(4);
}

async function startDirectionStub(): Promise<{ readonly url: string; readonly unknownIds: () => number; close(): Promise<void> }> {
  const { envelope, roleById } = syntheticCatalog();
  let unknownIds = 0;
  const server = http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(envelope));
      return;
    }
    if (incoming.pathname.endsWith("/series-history")) {
      const startMs = Number(incoming.searchParams.get("window_start_ms"));
      const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
      const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "unknown";
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("synthetic stub: window_start_ms/window_end_ms missing or not numeric");
        return;
      }
      const role = roleById.get(seriesKeyId);
      if (role === undefined) {
        unknownIds += 1;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = role === undefined ? null : valueFor(role, t);
        // Price rows in the gap are OMITTED (no candle: the four readings are all-or-nothing); volume
        // is present on every minute, so it never needs an absence row.
        if (value !== null) {
          rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
        }
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-02.3-synthetic-stub",
            nature: role === "VOLUME" ? "FLOW" : "STOCK",
            unit: role === "VOLUME" ? "BTC" : "USD",
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
    response.end("synthetic stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("synthetic stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    unknownIds: () => unknownIds,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ── The instrument ─────────────────────────────────────────────────────────────────────────

function rgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`rgb: ${hex} is not #rrggbb — the tokens changed spelling`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

type Ink = "up" | "down" | "neutral";

interface ColumnReading {
  /** The candle's direction in this column, from the rows above the volume band; `null` = no candle
   * ink there, `"mixed"` = both inks (a run boundary). */
  readonly candle: "up" | "down" | "mixed" | null;
  /** The bar's ink on the bars' base row; `null` = no bar ink. */
  readonly bar: Ink | null;
}

interface PaneReading {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Rows from the pane floor: the bars' base row and the top of the tallest bar. */
  readonly barBaseRow: number;
  readonly bandTopRow: number;
  readonly columns: readonly ColumnReading[];
}

async function readPane(page: Page): Promise<PaneReading> {
  const tokens = colorTokens();
  return page.evaluate(
    ({ testid, up, down, neutral }) => {
      const pane = document.querySelector(`[data-testid="${testid}"]`);
      if (pane === null) throw new Error(`no [data-testid="${testid}"] on the page`);
      const wrapper = pane.parentElement;
      const siblings = wrapper === null ? [] : Array.from(wrapper.children).filter((c) => c instanceof HTMLCanvasElement);
      const canvas = (siblings as HTMLCanvasElement[]).find((c) => c.width > 200 && c.height > 100);
      if (canvas === undefined) throw new Error("the price pane has no chart canvas with area");
      const width = canvas.width;
      const height = canvas.height;
      const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const near = (at: number, c: readonly number[]) =>
        Math.abs(data[at]! - c[0]!) <= 12 && Math.abs(data[at + 1]! - c[1]!) <= 12 && Math.abs(data[at + 2]! - c[2]!) <= 12;
      const inkAt = (x: number, rowFromFloor: number): "up" | "down" | "neutral" | null => {
        const at = ((height - 1 - rowFromFloor) * width + x) * 4;
        if (data[at + 3] === 0) return null;
        if (near(at, up)) return "up";
        if (near(at, down)) return "down";
        if (near(at, neutral)) return "neutral";
        return null;
      };
      // The bars' base: the first row from the floor that carries bar ink in at least half the columns.
      const scanRows = Math.ceil(height * 0.3);
      let barBaseRow = -1;
      for (let r = 0; r < scanRows && barBaseRow < 0; r += 1) {
        let inked = 0;
        for (let x = 0; x < width; x += 1) if (inkAt(x, r) !== null) inked += 1;
        if (inked >= width / 2) barBaseRow = r;
      }
      if (barBaseRow < 0) throw new Error("no bars' base row found in the bottom 30% of the price pane");
      // The volume band's top: the tallest contiguous bar-ink run from the base, over all columns.
      let bandTopRow = barBaseRow;
      const bars: ("up" | "down" | "neutral" | null)[] = [];
      for (let x = 0; x < width; x += 1) {
        const base = inkAt(x, barBaseRow);
        bars.push(base);
        if (base === null) continue;
        let r = barBaseRow;
        while (r + 1 < scanRows && inkAt(x, r + 1) === base) r += 1;
        bandTopRow = Math.max(bandTopRow, r);
      }
      // Candles: every row ABOVE the band (with 2 rows of margin), direction inks only.
      const columns: { candle: "up" | "down" | "mixed" | null; bar: "up" | "down" | "neutral" | null }[] = [];
      for (let x = 0; x < width; x += 1) {
        let ups = 0;
        let downs = 0;
        for (let r = bandTopRow + 3; r < height; r += 1) {
          const ink = inkAt(x, r);
          if (ink === "up") ups += 1;
          else if (ink === "down") downs += 1;
        }
        const candle = ups > 0 && downs > 0 ? "mixed" : ups > 0 ? "up" : downs > 0 ? "down" : null;
        columns.push({ candle, bar: bars[x]! });
      }
      return { canvasWidth: width, canvasHeight: height, barBaseRow, bandTopRow, columns };
    },
    {
      testid: PRICE_PANE_TESTID,
      up: [...rgb(tokens.directionUpFill)],
      down: [...rgb(tokens.directionDownFill)],
      neutral: [...rgb(tokens.provenanceWeak)],
    },
  );
}

/**
 * `paineis-de-fluxo` `T-06.1` — the verdict reads the LAST `VOLUME_VIEW_BARS` slots of the axis, put
 * there explicitly (`view.ts::showView`), not wherever the mount frames (`VIEW_BARS`). History:
 * `T-05.1` moved the mount to 120 bars (2 h at `1m`), inside ONE of the stub's 240-minute runs, and the
 * verdict went `INCONCLUSIVO: only 0 up-candle columns`; the fix was a private zoom-out to the
 * library's floor (~2.400 slots), the geometry `MIN_COLUMNS_PER_DIRECTION`/`MIN_NEUTRAL_RUN_COLUMNS`
 * were set on. 2.000 keeps that geometry (~0,6 px per slot), spans more than three stub cycles
 * (`CYCLE_MINUTES` = 600), and sits under the floor of a 1280-px plot, so the target is reachable
 * without paging (`showView` throws otherwise).
 */
const VOLUME_VIEW_BARS = 2_000;
/** Below this the view would not leave one run, and the verdict would be blind. */
const MIN_VIEW_SPAN_SLOTS = 2 * CYCLE_MINUTES;

interface Verdict {
  readonly compared: number;
  readonly comparedUp: number;
  readonly comparedDown: number;
  readonly agreeing: number;
  readonly longestNeutralNoCandleRun: number;
  readonly neutralUnderCandle: number;
  readonly directionWithoutCandle: number;
}

function judge(columns: readonly ColumnReading[]): Verdict {
  let compared = 0;
  let comparedUp = 0;
  let comparedDown = 0;
  let agreeing = 0;
  let neutralUnderCandle = 0;
  let directionWithoutCandle = 0;
  let run = 0;
  let longestNeutralNoCandleRun = 0;
  for (const { candle, bar } of columns) {
    if ((candle === "up" || candle === "down") && bar !== null) {
      compared += 1;
      if (candle === "up") comparedUp += 1;
      else comparedDown += 1;
      if (bar === candle) agreeing += 1;
      if (bar === "neutral") neutralUnderCandle += 1;
    }
    if (candle === null && (bar === "up" || bar === "down")) directionWithoutCandle += 1;
    if (candle === null && bar === "neutral") {
      run += 1;
      longestNeutralNoCandleRun = Math.max(longestNeutralNoCandleRun, run);
    } else {
      run = 0;
    }
  }
  return { compared, comparedUp, comparedDown, agreeing, longestNeutralNoCandleRun, neutralUnderCandle, directionWithoutCandle };
}

test(`T-02.3: no app real, a barra de volume toma a direção da vela da mesma coluna; sem vela, fica neutra (${SPEC})`, async ({ page }) => {
  test.setTimeout(240_000);
  const stub = await startDirectionStub();
  let instance: NextInstanceHandle | undefined;
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
    expect(response?.ok(), "GET /symbol did not answer ok").toBe(true);
    await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", { timeout: 60_000 });
    const subAxis = page.locator(`[data-testid="${VOLUME_SUBAXIS_TESTID}"]`);
    await expect
      .poll(async () => Number(await subAxis.getAttribute("data-volume-present-points")), { timeout: 60_000 })
      .toBeGreaterThan(1_000);
    // The candles are drawn too — otherwise every bar would be neutral for the WRONG reason.
    await expect
      .poll(async () => {
        const raw = await page.locator('[data-fact^="price_candles:"]').getAttribute("data-fact");
        return Number(/^price_candles:(\d+)\//.exec(raw ?? "")?.[1] ?? 0);
      }, { timeout: 60_000 })
      .toBeGreaterThan(500);
    await page.waitForTimeout(1_000);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(stub.unknownIds(), "the page asked for a series_key_id the stub does not know — the keys drifted").toBe(0);
    const view = await showView(page, { kind: "lastBars", bars: VOLUME_VIEW_BARS });
    fact(SPEC, "view", { iterations: view.iterations, from: view.fromLogical, to: view.toLogical, spacingPx: view.barSpacingPx });
    expect(view.toLogical - view.fromLogical, "a vista não saiu de um ciclo do stub").toBeGreaterThanOrEqual(MIN_VIEW_SPAN_SLOTS);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    const reading = await readPane(page);
    const verdict = judge(reading.columns);
    fact(SPEC, "canvas", `${reading.canvasWidth}x${reading.canvasHeight}`);
    fact(SPEC, "bar_base_row_and_band_top_row", [reading.barBaseRow, reading.bandTopRow]);
    fact(SPEC, "price_candles", await page.locator('[data-fact^="price_candles:"]').getAttribute("data-fact"));
    fact(SPEC, "verdict", verdict);

    // INCONCLUSIVE is not green: without both directions on screen, agreement proves nothing.
    expect(verdict.comparedUp, `INCONCLUSIVO: only ${verdict.comparedUp} up-candle columns compared`).toBeGreaterThanOrEqual(MIN_COLUMNS_PER_DIRECTION);
    expect(verdict.comparedDown, `INCONCLUSIVO: only ${verdict.comparedDown} down-candle columns compared`).toBeGreaterThanOrEqual(MIN_COLUMNS_PER_DIRECTION);
    const agreement = verdict.agreeing / verdict.compared;
    fact(SPEC, "agreement", Number(agreement.toFixed(4)));
    expect(
      agreement,
      `the bar ink agrees with the candle above it in ${verdict.agreeing}/${verdict.compared} columns — ` +
        "the volume series is not colored by the candle at the same instant (T-02.3)",
    ).toBeGreaterThanOrEqual(MIN_AGREEMENT);
    // `RN-4`: where there is volume and no candle, the bar claims no direction.
    expect(
      verdict.longestNeutralNoCandleRun,
      "the 120-minute stretch with volume and no candle did not draw a run of neutral bars (RN-4)",
    ).toBeGreaterThanOrEqual(MIN_NEUTRAL_RUN_COLUMNS);
  } finally {
    await instance?.close();
    await stub.close();
  }
});
