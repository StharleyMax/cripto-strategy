import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-02.2` — the volume sub-axis on the LINEAR base-0 scale, read off the
 * PIXELS of the real app (`next start` of the built `.next`), against a deterministic stub.
 *
 * The decision is `docs/context/paineis-de-fluxo/gates/T-02.2-design-gate.md` (option B, cycle 2
 * APPROVED, §8). This spec is the app half of its two deciding falsifiers (§6):
 *
 *   - `F-2` (marks): the absence/zero marks sit in a strip of their own BELOW the bars' base. Read on
 *     the canvas as: from the pane floor up, a short run of mark ink, then at least ONE row with no
 *     ink in ANY column (the gutter), then the bars' base row. A mark and a bar never share a row.
 *   - `F-3` (peak): at the default TF (1m), the tallest bar column is at least `4×` the median of the
 *     bar columns (`N-2`: the median is of BAR columns only, the mark strip is not counted).
 *
 * ⛔ WHY A STUB AND NOT THE PRODUCTION DATA: `make verify` composes the WEAK universe (sqlite,
 * `/series-history` refuses), so a spec on real data never bites inside the gate. The stub is a
 * long tail with the `max/p50` of real 1-minute volume, plus gaps and legitimate zeros, and serves
 * NO price series: without candles, every non-background pixel in the bottom of the price pane is a
 * volume bar or a mark, so the instrument needs no colour rule that `T-02.3` (direction colour)
 * would break (`N-2`). Nothing is written to any database.
 *
 * ABLATION, run by hand and recorded in `gates/T-02.2-builder.md` (a rebuild per mutant, too slow for
 * the gate): `PriceScaleMode.Logarithmic` fails `F-3`; the marks back on `VOLUME_SCALE_MARGINS`
 * fail `F-2`.
 *
 * Run with: `npx playwright test 28-volume-linear-scale-pixel` (needs a built `.next`).
 */

const SPEC = "28-volume-linear-scale-pixel";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PRICE_PANE_TESTID = "price-pane";
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";
const ONE_MINUTE_MS = 60_000;

/** `F-3`'s threshold, verbatim from the gate (§6): "≥ 4× a mediana das colunas desenhadas". */
const PEAK_OVER_MEDIAN_FLOOR = 4;
/** The mark strip is the bottom 3% of a ~335-px pane minus the 4-px separator clearance: ~6 px.
 * A first ink run taller than this is not a mark strip — it is bars growing from the floor. */
const MAX_MARK_STRIP_ROWS = 8;
/** How far up from the pane floor the scan looks: the bars' band is the bottom 20% (+3% strip). */
const SCAN_FRACTION = 0.3;

// ── The stub ────────────────────────────────────────────────────────────────────────────────

/** Deterministic long tail between 10 and ~4,931 (`max/p50 ~ 60x`, the real 1-minute ratio), a
 * peak every 12 h, a gap every 97 minutes and a legitimate zero every 89. */
function stubVolume(t: number): string | null {
  const minute = Math.floor(t / ONE_MINUTE_MS);
  if (minute % 97 === 0) {
    return null;
  }
  if (minute % 89 === 0) {
    return "0";
  }
  if (minute % 720 === 0) {
    return "20000";
  }
  let bits = (minute % 4096) + 1;
  let fraction = 0;
  let denominator = 0.5;
  while (bits > 0) {
    fraction += (bits % 2) * denominator;
    bits = Math.floor(bits / 2);
    denominator /= 2;
  }
  return (10 * 10 ** (fraction ** 1.6 * Math.log10(493))).toFixed(4);
}

/** One catalog line: `klines_volume`, the key the production catalog serves for `BTCUSDT`
 * (`GET /api/v1/series-catalog`, 2026-09-26), `verifiedBy` marked synthetic. */
function syntheticCatalogEnvelope(): { readonly query: string; readonly n_entries: number; readonly entries: unknown[] } {
  const entries = [
    {
      key: {
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
        verifiedBy: "T-02.2-synthetic-stub",
      },
      nativeGrid: "1min",
      maxStalenessMs: 120_000,
      priceUse: null,
      reconstructedFrom: null,
      publishedError: null,
    },
  ];
  return { query: "series_catalog", n_entries: entries.length, entries };
}

async function startVolumeStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const catalog = syntheticCatalogEnvelope();
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
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("synthetic stub: window_start_ms/window_end_ms missing or not numeric");
        return;
      }
      // One row per grid instant, present or absent — the shape `/series-history` serves (it walks
      // the whole grid); an OMITTED row would shrink the grid instead of drawing an absence mark.
      const rows: { event_time: number; available_at: number | null; value: string | null; absence: string | null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = stubVolume(t);
        rows.push(
          value === null
            ? { event_time: t, available_at: null, value: null, absence: "NO_OBSERVATION", coverage: null }
            : { event_time: t, available_at: t, value, absence: null, coverage: null },
        );
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: incoming.searchParams.get("series_key_id") ?? "unknown",
            source: "T-02.2-synthetic-stub",
            nature: "FLOW",
            unit: "BTC",
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ── The instrument ─────────────────────────────────────────────────────────────────────────

function rgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`rgb: ${hex} is not #rrggbb — the tokens changed spelling`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Every ink a volume bar or a mark can have: the provenance ramp (bars today, both marks) and the
 * two direction fills (bars once `T-02.3` wires the direction colour). */
function volumeInks(): readonly (readonly [number, number, number])[] {
  const tokens = colorTokens();
  return [tokens.provenanceWeak, tokens.provenanceStrong, tokens.directionUpFill, tokens.directionDownFill].map(rgb);
}

interface FooterProfile {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Rows counted from the pane floor (0 = the bottom row). `inkColumns[r]` = columns inked at row r. */
  readonly inkColumns: readonly number[];
  /** Per column, the rows (from the floor) that carry ink, within the scanned band. */
  readonly columns: readonly (readonly number[])[];
}

async function readFooterProfile(page: Page): Promise<FooterProfile> {
  return page.evaluate(
    ({ testid, inks, scanFraction }) => {
      const pane = document.querySelector(`[data-testid="${testid}"]`);
      if (pane === null) throw new Error(`no [data-testid="${testid}"] on the page`);
      const wrapper = pane.parentElement;
      const siblings = wrapper === null ? [] : Array.from(wrapper.children).filter((c) => c instanceof HTMLCanvasElement);
      const canvas = (siblings as HTMLCanvasElement[]).find((c) => c.width > 200 && c.height > 100);
      if (canvas === undefined) throw new Error("the price pane has no chart canvas with area");
      const width = canvas.width;
      const height = canvas.height;
      const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const scanRows = Math.ceil(height * scanFraction);
      const inkColumns = new Array<number>(scanRows).fill(0);
      const columns: number[][] = [];
      for (let x = 0; x < width; x += 1) {
        const rows: number[] = [];
        for (let r = 0; r < scanRows; r += 1) {
          const at = ((height - 1 - r) * width + x) * 4;
          if (data[at + 3] === 0) continue;
          const isInk = inks.some(
            (c) => Math.abs(data[at]! - c[0]!) <= 12 && Math.abs(data[at + 1]! - c[1]!) <= 12 && Math.abs(data[at + 2]! - c[2]!) <= 12,
          );
          if (isInk) {
            rows.push(r);
            inkColumns[r]! += 1;
          }
        }
        columns.push(rows);
      }
      return { canvasWidth: width, canvasHeight: height, inkColumns, columns };
    },
    { testid: PRICE_PANE_TESTID, inks: volumeInks().map((c) => [...c]), scanFraction: SCAN_FRACTION },
  );
}

interface Strips {
  /** Rows from the floor: the mark strip `[markLow, markHigh]`, the gutter, the bars' base row. */
  readonly markLow: number;
  readonly markHigh: number;
  readonly gutterRows: number;
  readonly barBaseRow: number;
}

/** From the floor up: empty rows (the separator clearance), a run of ink (the mark strip), a run of
 * rows with no ink in any column (the gutter), then the bars' base. `null` when the canvas does not
 * have that shape — which is `F-2` failing. */
function findStrips(profile: FooterProfile): Strips | null {
  const inked = (r: number): boolean => (profile.inkColumns[r] ?? 0) > 0;
  let r = 0;
  while (r < profile.inkColumns.length && !inked(r)) r += 1;
  const markLow = r;
  while (r < profile.inkColumns.length && inked(r)) r += 1;
  const markHigh = r - 1;
  const gutterLow = r;
  while (r < profile.inkColumns.length && !inked(r)) r += 1;
  const gutterRows = r - gutterLow;
  if (markHigh < markLow || markHigh - markLow + 1 > MAX_MARK_STRIP_ROWS || gutterRows < 1 || r >= profile.inkColumns.length) {
    return null;
  }
  return { markLow, markHigh, gutterRows, barBaseRow: r };
}

/** Per column, the contiguous ink rows from the bars' base up: the painted bar height. */
function barColumnHeights(profile: FooterProfile, barBaseRow: number): readonly number[] {
  return profile.columns
    .map((rows) => {
      const set = new Set(rows);
      let h = 0;
      while (set.has(barBaseRow + h)) h += 1;
      return h;
    })
    .filter((h) => h > 0);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

test(`T-02.2 F-2/F-3: no app real, rodapé linear — faixa de marcas separada e pico ≥ 4× a mediana (${SPEC})`, async ({ page }) => {
  test.setTimeout(240_000);
  const stub = await startVolumeStub();
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
    await page.waitForTimeout(1_000);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    // The DOM half: the scale is declared, in words, and the copy no longer says "linha de base".
    const scaleNote = page.locator('[data-fact="volume_scale:linear"]');
    await expect(scaleNote).toHaveText(/proporcional ao volume \(escala linear\)/);
    const legend = page.locator('[data-fact="volume_marks_legend:2"]');
    await expect(legend).toHaveCount(1);
    expect(await legend.textContent(), "the marks legend still says 'linha de base'").not.toMatch(/linha de base/);

    const profile = await readFooterProfile(page);
    const strips = findStrips(profile);
    fact(SPEC, "canvas", `${profile.canvasWidth}x${profile.canvasHeight}`);
    fact(SPEC, "present_points", await subAxis.getAttribute("data-volume-present-points"));
    fact(SPEC, "ink_columns_by_row_from_floor", profile.inkColumns.slice(0, 16));
    fact(SPEC, "strips", strips);
    expect(strips, "F-2: the footer has no mark strip + empty gutter + bars shape — the marks touch the bars (BLOCKER-2)").not.toBeNull();
    const { barBaseRow, markLow, markHigh } = strips!;
    // Both kinds of mark are drawn, and inside the strip.
    const strong = rgb(colorTokens().provenanceStrong);
    const zeroInkInStrip = await page.evaluate(
      ({ testid, low, high, ink }) => {
        const pane = document.querySelector(`[data-testid="${testid}"]`)!;
        const canvas = Array.from(pane.parentElement!.children).find(
          (c) => c instanceof HTMLCanvasElement && c.width > 200 && c.height > 100,
        ) as HTMLCanvasElement;
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let r = low; r <= high; r += 1) {
          const y = canvas.height - 1 - r;
          for (let x = 0; x < canvas.width; x += 1) {
            const at = (y * canvas.width + x) * 4;
            if (Math.abs(data[at]! - ink[0]!) <= 12 && Math.abs(data[at + 1]! - ink[1]!) <= 12 && Math.abs(data[at + 2]! - ink[2]!) <= 12) count += 1;
          }
        }
        return count;
      },
      { testid: PRICE_PANE_TESTID, low: markLow, high: markHigh, ink: [...strong] },
    );
    fact(SPEC, "zero_mark_pixels_in_strip", zeroInkInStrip);
    // Absence (the weak ink) and zero (the strong one) BOTH in the strip: the strip's lowest rows
    // carry more columns than the zero marks alone, i.e. the absence marks are there too.
    const markColumnsAtFloor = profile.inkColumns[markLow] ?? 0;
    const zeroColumns = profile.inkColumns[markHigh] ?? 0;
    fact(SPEC, "mark_columns_at_strip_floor_vs_top", [markColumnsAtFloor, zeroColumns]);
    expect(markColumnsAtFloor, "no absence mark below the zero marks — absence and zero drew the same height").toBeGreaterThan(zeroColumns);
    expect(zeroInkInStrip, "the legitimate-zero mark was not drawn in the mark strip").toBeGreaterThan(0);

    const heights = barColumnHeights(profile, barBaseRow);
    const tallest = Math.max(...heights);
    const med = median(heights);
    fact(SPEC, "bar_columns", heights.length);
    fact(SPEC, "bar_tallest_px", tallest);
    fact(SPEC, "bar_median_px", med);
    fact(SPEC, "peak_over_median", Number((tallest / med).toFixed(2)));
    expect(heights.length, "too few bar columns — the measurement would be weak").toBeGreaterThan(500);
    expect(tallest / med, `F-3: peak ${tallest}px / median ${med}px — the peak does not stand out (gate §6)`).toBeGreaterThanOrEqual(PEAK_OVER_MEDIAN_FLOOR);
  } finally {
    await instance?.close();
    await stub.close();
  }
});
