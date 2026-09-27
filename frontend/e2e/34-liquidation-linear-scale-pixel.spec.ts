/**
 * `paineis-de-fluxo` `T-04.4` (`CST-272`, plan `04` item `4.4`, `[Q-DG-2]`, `CA-12`) — THE DECIDED
 * SCALE OF THE LIQUIDATION PANE, READ IN THE PIXELS OF THE REAL APP, WITH THE ABLATIONS.
 *
 * The decision is `gates/T-04.4-design-gate.md` §5 (APPROVED in §9): linear, zero line fixed at half,
 * marks `2`/`6` px, weight `22`, the scale declared in the key line; plus the validator's V-3 (the
 * zero line is drawn ON PURPOSE, not left to chance).
 *
 * Same arrangement as `e2e/32`/`e2e/33`: the production page (`next start` of the gate's build) served
 * by a stub API that returns the REAL catalog of the e2e API and synthetic values — **nothing is
 * seeded in the shared Postgres**. The stub is built so the decision's own falsifier is readable:
 *
 *   - both legs carry NOISE (`1.000..1.999` USD) almost every minute, and one SPIKE each per 2 hours:
 *     `long` `800.000` and `short` `400.000` — exactly half, the proportionality probe;
 *   - both legs are ABSENT on 30 consecutive minutes of every 2 hours — the columns where no bar
 *     exists and the zero line is the only thing on the zero row (V-3);
 *   - each leg has its own ZEROS (`short` on `k % 7 = 3`, `long` on `k % 5 = 2`), so both marks draw.
 *
 * ── WHAT THE SPEC ASSERTS (design, `1280x800`, 1m, DPR 1) ──────────────────────────────────────
 *
 *   (a) the library carries the decided scale: `data-liquidation-bar-scales` =
 *       `up:upright:normal;down:inverted:normal` (read back from `priceScale().options()`);
 *   (b) `F-1` of the gate, the argument that decides: per leg, the tallest drawn column is `>= 4x`
 *       the median drawn column (the gate measured `11,5x`/`53x` linear, `1,7x`/`1,9x` log);
 *   (c) the height is proportional: the long spike (`800.000`) is drawn `1,7x..2,3x` the short spike
 *       (`400.000`) — ONE shared maximum (`C-3`) and a linear map give `2x`; log gives `~1,05x`;
 *   (d) `F-3`: per leg, 0 rows of mark ink inside the bars' rows, and the zero mark strictly taller
 *       than the absence mark;
 *   (e) V-3: in the columns with no bar of either leg, the zero row (± 2 px) carries the grid's
 *       reference ink in `>= 90%` of them;
 *   (f) the declaration: the visible key says `altura linear, a mesma escala nas duas pernas` with
 *       `data-fact="liquidation_scale:linear"`, and no text of the pane (the `sr-only` legend included)
 *       says `log10` or `ordem de grandeza`.
 *
 * ── THE ABLATIONS ─────────────────────────────────────────────────────────────────────────────
 *
 *   - `?e2eLiquidationLogScale=1` draws the SAME form in `log10` and nothing else. (a) reads it back
 *     (the ablation reached the library), and the SAME instrument must REJECT (b) and (c) there.
 *   - the grid removed at the canvas (an init script that skips any `stroke()` in the grid's ink):
 *     (e) must drop to `<= 10%` — proof that the reference ink (e) found IS the grid line the pane's
 *     first series puts on the zero, and not background noise the instrument happens to match.
 */

import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { chartSurfaceTheme } from "../src/charts/chart-theme.ts";
import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, shot, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

const SPEC = "34-liquidation-linear-scale-pixel";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const CHART_HOST_TESTID = "symbol-chart-host";
const PANE_TESTID = "liquidation-pane";
const LOG_ABLATION_QUERY = "e2eLiquidationLogScale=1";
const ONE_MINUTE_MS = 60_000;
const INK_TOLERANCE = 12;
/** Gate §6, F-1: below `4x` the linear scale loses its main argument. */
const PEAK_OVER_MEDIAN_MIN = 4;
/** `800.000 / 400.000` drawn linearly on ONE maximum is `2x`; the slack covers the 1 px floor. */
const SPIKE_RATIO_RANGE = [1.7, 2.3] as const;
/** V-3: the zero row carries the reference ink in at least this share of the bar-less columns. */
const ZERO_REFERENCE_MIN_SHARE = 0.9;
const ZERO_REFERENCE_ABLATED_MAX_SHARE = 0.1;
const ZERO_ROW_SLACK_PX = 2;
const MIN_BARLESS_COLUMNS = 20;

const PERIOD_MIN = 120;
const LONG_SPIKE_K = 100;
const SHORT_SPIKE_K = 20;
const LONG_SPIKE_USD = 800_000;
const SHORT_SPIKE_USD = 400_000;
const ABSENT_FROM_K = 40;
const ABSENT_TO_K = 69;

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

/** One leg's value at one minute, or `null` for NO ROW (absence). */
function liquidationValue(cohort: string | null | undefined, minute: number): string | null {
  const k = ((minute % PERIOD_MIN) + PERIOD_MIN) % PERIOD_MIN;
  if (k >= ABSENT_FROM_K && k <= ABSENT_TO_K) return null;
  if (cohort === "short") {
    if (k === SHORT_SPIKE_K) return String(SHORT_SPIKE_USD);
    if (k % 7 === 3) return "0";
    return String(1_000 + wave(minute, 5));
  }
  if (k === LONG_SPIKE_K) return String(LONG_SPIKE_USD);
  if (k % 5 === 2) return "0";
  return String(1_000 + wave(minute, 4));
}

function syntheticValue(key: SeriesKey, bucketMs: number): string | null {
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
    case "sum_liquidation":
      return liquidationValue(key.cohort, minute);
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
        response.end(`T-04.4 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = syntheticValue(key, t);
        if (value !== null) rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-04.4-synthetic-values",
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
    response.end("T-04.4 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-04.4 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Skips every canvas `stroke()` made in the grid's ink — the grid ablation, installed before load. */
function gridAblationScript(gridHex: string): string {
  return `(() => {
    const grid = ${JSON.stringify(gridHex.toLowerCase())};
    const original = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      if (String(this.strokeStyle).toLowerCase() === grid) return;
      return original.apply(this, args);
    };
  })();`;
}

interface LegReading {
  /** Drawn bar height per column (px of the leg's ink in that column), columns with ink only. */
  readonly heights: readonly number[];
  readonly peak: number;
  readonly median: number;
  /** Rows of bar ink: top and bottom. */
  readonly barTop: number | null;
  readonly barBottom: number | null;
  /** Rows of this leg's mark ink that fall inside its bar rows (`F-3`). */
  readonly markRowsInBars: number;
  /** Tallest run of each mark's ink in any column. */
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
}

interface PaneReading {
  readonly barScales: string | null;
  readonly sides: string | null;
  readonly zeroLinePx: number;
  readonly dpr: number;
  readonly canvasCount: number;
  readonly up: LegReading;
  readonly down: LegReading;
  readonly barlessColumns: number;
  readonly barlessWithZeroReference: number;
  readonly keyText: string;
  readonly paneText: string;
  readonly linearFacts: number;
  readonly logFacts: number;
}

async function openAndRead(page: Page, baseUrl: string, query: string): Promise<PaneReading> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query === "" ? "" : `?${query}`}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
    timeout: 120_000,
  });
  const pane = page.locator(`[data-testid="${PANE_TESTID}"]`);
  await expect(pane).toHaveCount(1);
  await expect(pane).toHaveAttribute("data-liquidation-zero-line-px", /^\d/);
  await expect(pane).toHaveAttribute("data-liquidation-bar-scales", /up:/);
  await page.waitForTimeout(1_500);
  const tokens = colorTokens();
  return page.evaluate(
    ({ paneTestId, inks, tol, slack }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`)!;
      const canvases = Array.from(layer.parentElement?.children ?? []).filter(
        (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
      );
      const zeroLinePx = Number(layer.dataset.liquidationZeroLinePx);
      const dpr = canvases.length === 0 ? 1 : canvases[0]!.width / canvases[0]!.getBoundingClientRect().width;
      const width = canvases[0]?.width ?? 0;
      const height = canvases[0]?.height ?? 0;
      const zeroRow = zeroLinePx * dpr;
      // Composite class per pixel over all the pane's canvases: the last canvas with a known ink wins.
      const cls = new Int8Array(width * height).fill(-1);
      const names = ["up", "down", "absence", "zero", "grid"] as const;
      const rgbs = names.map((name) => inks[name]);
      for (const canvas of canvases) {
        const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
        for (let at = 0, px = 0; px < width * height; px += 1, at += 4) {
          if (data[at + 3] === 0) continue;
          for (let c = 0; c < rgbs.length; c += 1) {
            const rgb = rgbs[c]!;
            if (Math.abs(data[at]! - rgb[0]) <= tol && Math.abs(data[at + 1]! - rgb[1]) <= tol && Math.abs(data[at + 2]! - rgb[2]) <= tol) {
              cls[px] = c;
              break;
            }
          }
        }
      }
      const leg = (barClass: number, upper: boolean) => {
        const heights: number[] = [];
        let barTop = Number.POSITIVE_INFINITY;
        let barBottom = Number.NEGATIVE_INFINITY;
        const inHalf = (y: number) => (upper ? y < zeroRow + dpr : y > zeroRow - dpr);
        for (let x = 0; x < width; x += 1) {
          let n = 0;
          for (let y = 0; y < height; y += 1) {
            if (cls[y * width + x] === barClass && inHalf(y)) {
              n += 1;
              barTop = Math.min(barTop, y);
              barBottom = Math.max(barBottom, y);
            }
          }
          if (n > 0) heights.push(n / dpr);
        }
        const sorted = [...heights].sort((a, b) => a - b);
        const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
        let markRowsInBars = 0;
        const markRun = { absence: 0, zero: 0 };
        for (let x = 0; x < width; x += 1) {
          const run = { absence: 0, zero: 0 };
          for (let y = 0; y < height; y += 1) {
            if (!inHalf(y)) continue;
            const c = cls[y * width + x];
            if (c === 2 || c === 3) {
              if (y >= barTop && y <= barBottom) markRowsInBars += 1;
              run[c === 2 ? "absence" : "zero"] += 1;
            }
          }
          markRun.absence = Math.max(markRun.absence, run.absence);
          markRun.zero = Math.max(markRun.zero, run.zero);
        }
        return {
          heights,
          peak: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
          median,
          barTop: Number.isFinite(barTop) ? barTop / dpr : null,
          barBottom: Number.isFinite(barBottom) ? barBottom / dpr : null,
          markRowsInBars,
          absenceMarkPx: markRun.absence / dpr,
          zeroMarkPx: markRun.zero / dpr,
        };
      };
      // V-3: columns with no bar ink of either leg anywhere, and whether the zero row carries grid ink.
      let barlessColumns = 0;
      let barlessWithZeroReference = 0;
      const lo = Math.max(0, Math.floor(zeroRow - slack * dpr));
      const hi = Math.min(height - 1, Math.ceil(zeroRow + slack * dpr));
      for (let x = 0; x < width; x += 1) {
        let bar = false;
        for (let y = 0; y < height && !bar; y += 1) {
          const c = cls[y * width + x];
          if (c === 0 || c === 1) bar = true;
        }
        if (bar) continue;
        barlessColumns += 1;
        for (let y = lo; y <= hi; y += 1) {
          if (cls[y * width + x] === 4) {
            barlessWithZeroReference += 1;
            break;
          }
        }
      }
      const key = layer.querySelector<HTMLElement>("[data-liquidation-marks-key]");
      return {
        barScales: layer.dataset.liquidationBarScales ?? null,
        sides: layer.dataset.liquidationSides ?? null,
        zeroLinePx,
        dpr,
        canvasCount: canvases.length,
        up: leg(0, true),
        down: leg(1, false),
        barlessColumns,
        barlessWithZeroReference,
        keyText: key?.textContent ?? "",
        paneText: layer.textContent ?? "",
        linearFacts: layer.querySelectorAll('[data-fact="liquidation_scale:linear"]').length,
        logFacts: layer.querySelectorAll('[data-fact="liquidation_scale:log10"]').length,
      };
    },
    {
      paneTestId: PANE_TESTID,
      inks: {
        up: hexToRgb(tokens.directionUpFill),
        down: hexToRgb(tokens.directionDownFill),
        absence: hexToRgb(tokens.provenanceWeak),
        zero: hexToRgb(tokens.provenanceStrong),
        grid: hexToRgb(chartSurfaceTheme().gridLineColor),
      },
      tol: INK_TOLERANCE,
      slack: ZERO_ROW_SLACK_PX,
    },
  );
}

/** What the facts file keeps: the reading without the per-column arrays. */
function summary(reading: PaneReading) {
  const leg = ({ heights, ...rest }: LegReading) => ({ ...rest, columns: heights.length });
  return {
    ...reading,
    up: leg(reading.up),
    down: leg(reading.down),
    paneText: undefined,
    spikeRatio: spikeRatio(reading),
    peakOverMedian: { up: peakOverMedian(reading.up), down: peakOverMedian(reading.down) },
    zeroReferenceShare: zeroReferenceShare(reading),
  };
}

function peakOverMedian(leg: LegReading): number {
  return leg.median === 0 ? Number.POSITIVE_INFINITY : leg.peak / leg.median;
}

/** `[Q-LIQ-2]`: the upper leg is `short` (400.000), the lower is `long` (800.000). */
function spikeRatio(reading: PaneReading): number {
  return reading.up.peak === 0 ? Number.POSITIVE_INFINITY : reading.down.peak / reading.up.peak;
}

function zeroReferenceShare(reading: PaneReading): number {
  return reading.barlessColumns === 0 ? 0 : reading.barlessWithZeroReference / reading.barlessColumns;
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe(`T-04.4: a liquidação em escala linear, zero fixo e declarado, lida no pixel do app (${SPEC})`, () => {
  let stub: StubHandle | undefined;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
    const catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("desenho: linear, o pico salta, a altura é proporcional, marcas fora das barras, zero desenhado, escala declarada", async ({ page }) => {
    const reading = await openAndRead(page, instance!.baseUrl, "");
    await shot(page, `${SPEC}-design`);
    fact(SPEC, "design", summary(reading));

    // (a) the library carries the decided scale
    expect(reading.canvasCount, "nenhum canvas no pane — o instrumento está cego").toBeGreaterThan(0);
    expect(reading.sides).toBe("short:up;long:down");
    expect(reading.barScales, "(a) a escala das barras não é a linear decidida").toBe("up:upright:normal;down:inverted:normal");

    // (b) F-1: the peak jumps out, per leg
    expect(reading.up.heights.length, "(b) poucas colunas com barra de cima").toBeGreaterThanOrEqual(20);
    expect(reading.down.heights.length, "(b) poucas colunas com barra de baixo").toBeGreaterThanOrEqual(20);
    expect(peakOverMedian(reading.up), "(b) F-1: o pico da perna de cima não salta (< 4x a mediana)").toBeGreaterThanOrEqual(PEAK_OVER_MEDIAN_MIN);
    expect(peakOverMedian(reading.down), "(b) F-1: o pico da perna de baixo não salta (< 4x a mediana)").toBeGreaterThanOrEqual(PEAK_OVER_MEDIAN_MIN);

    // (c) proportional heights on ONE maximum
    expect(spikeRatio(reading), "(c) 800.000 não é desenhado ~2x 400.000").toBeGreaterThanOrEqual(SPIKE_RATIO_RANGE[0]);
    expect(spikeRatio(reading), "(c) 800.000 não é desenhado ~2x 400.000").toBeLessThanOrEqual(SPIKE_RATIO_RANGE[1]);

    // (d) F-3: marks out of the bars, zero taller than absence, per leg
    for (const side of ["up", "down"] as const) {
      const leg = reading[side];
      expect(leg.markRowsInBars, `(d) F-3 ${side}: tinta de marca na região de barras`).toBe(0);
      expect(leg.absenceMarkPx, `(d) ${side}: marca de ausência não desenhada`).toBeGreaterThan(0);
      expect(leg.zeroMarkPx, `(d) ${side}: marca de zero não é mais alta que a de ausência`).toBeGreaterThan(leg.absenceMarkPx);
    }

    // (e) V-3: the zero line is drawn where no bar is
    expect(reading.barlessColumns, "(e) poucas colunas sem barra — o instrumento não tem onde olhar").toBeGreaterThanOrEqual(MIN_BARLESS_COLUMNS);
    expect(zeroReferenceShare(reading), "(e) V-3: a linha do zero não está desenhada nas colunas sem barra").toBeGreaterThanOrEqual(ZERO_REFERENCE_MIN_SHARE);

    // (f) the declaration, visible and in the sr-only legend
    expect(reading.keyText).toContain("altura linear, a mesma escala nas duas pernas");
    expect(reading.linearFacts, "(f) o fato liquidation_scale:linear").toBe(1);
    expect(reading.logFacts, "(f) sobrou a nota de log10").toBe(0);
    expect(reading.paneText).toContain("altura proporcional ao valor em USD, na mesma escala nas duas pernas; o topo é a maior barra visível das duas");
    expect(reading.paneText, "(f) o pane ainda fala em log10").not.toContain("log10");
    expect(reading.paneText, "(f) o pane ainda fala em ordem de grandeza").not.toContain("ordem de grandeza");
  });

  test("ablação: a MESMA forma em log10 REPROVA o F-1 e a proporção", async ({ page }) => {
    const reading = await openAndRead(page, instance!.baseUrl, LOG_ABLATION_QUERY);
    await shot(page, `${SPEC}-ablation-log`);
    fact(SPEC, "ablation_log", summary(reading));

    expect(reading.barScales, "a ablação não chegou à biblioteca").toBe("up:upright:logarithmic;down:inverted:logarithmic");
    // The instrument still sees both legs (the ablation changed the scale, not the data).
    expect(reading.up.heights.length).toBeGreaterThanOrEqual(20);
    expect(reading.down.heights.length).toBeGreaterThanOrEqual(20);
    expect(
      peakOverMedian(reading.up) < PEAK_OVER_MEDIAN_MIN && peakOverMedian(reading.down) < PEAK_OVER_MEDIAN_MIN,
      `MORDE: em log o pico tinha de ficar < 4x a mediana nas duas pernas (up ${peakOverMedian(reading.up)}, down ${peakOverMedian(reading.down)})`,
    ).toBe(true);
    expect(spikeRatio(reading), "MORDE: em log 800.000 e 400.000 tinham de sair quase da mesma altura").toBeLessThan(SPIKE_RATIO_RANGE[0]);
  });

  test("ablação: sem a grade no canvas, a referência do zero some (V-3 não mede ruído)", async ({ page }) => {
    await page.addInitScript(gridAblationScript(chartSurfaceTheme().gridLineColor));
    const reading = await openAndRead(page, instance!.baseUrl, "");
    fact(SPEC, "ablation_grid", summary(reading));

    expect(reading.barlessColumns).toBeGreaterThanOrEqual(MIN_BARLESS_COLUMNS);
    expect(zeroReferenceShare(reading), "MORDE: sem a grade, (e) tinha de reprovar").toBeLessThanOrEqual(ZERO_REFERENCE_ABLATED_MAX_SHARE);
  });
});
