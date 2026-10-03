/**
 * `paineis-de-fluxo` `T-05.4` — DoD 4 of plan `05` (`docs/plans/SPEC-009-paineis-de-fluxo/05_correcoes_de_uso.md`):
 * the coverage warning's `data-fact` carries the MAGNITUDE, and with full coverage the warning does not
 * exist. Norm: `docs/context/paineis-de-fluxo/handoff/T-05.4-desenho.md` §6.3 (A-1..A-6) plus `C-3`/`C-4`
 * of `gates/T-05.4-design-critique.md`.
 *
 * TWO UNIVERSES, the precedent of `e2e/35`:
 *
 *   GATE — a stub HTTP API over the REAL catalog, read by a SECOND `next start`
 *   (`startSecondaryNextInstance`). It serves `/series-history` per `interval` as the backend does
 *   (`series_history.py:359-360,819,828`): one row per OUTER bucket end, from `ceil(window_start,
 *   interval)` to `<= window_end_ms`, `coverage {present, expected = interval / 1 min}` (`null` on `1m`).
 *   Its `mode` decides which buckets are short, so every case is deterministic:
 *     - `full`      — nothing missing                              ⇒ A-2: 0 chips;
 *     - `mid-3`     — 3 native minutes missing in ONE middle bucket ⇒ A-2/A-1: 1 chip, `3/<expected>`;
 *     - `head-only` — 3 missing only in the NEWEST bucket, in `5m` ⇒ A-3: 0 chips, head published.
 *                     `5m` because it is the one TF where the head rule bites: the newest outer bucket
 *                     is `interval + 4 min` old (`KNOWLEDGE_TIME_LAG_MS`), 9 min in `5m`, 19/64/244 min
 *                     in `15m`/`1h`/`4h` (`handoff/T-05.4-estado.md`);
 *     - `longest`   — `C-3`: the LONGEST text §2.4 can produce on a real window, two legs different
 *                     over one denominator: short loses the most whole hours short of the window, the others
 *                     `23 h 59 min`. In `1h` (7 d loaded): short `6 d 23 h`; in `15m` (4 d loaded,
 *                     `T-05.6`): short `3 d 23 h` — the same number of characters, so `15m` is the TF
 *                     where the pane headings are longest (`Volume 15m (1m, BTC)`, one more glyph).
 *   Nothing is written to any database (memória `nao-seedar-teste-no-postgres-compartilhado`).
 *
 *   REAL — the app under test (`E2E_BASE_URL`) on the read API it was given
 *   (`E2E_SENTIMENTO_API_BASE_URL`). Skipped when the API has no window reader of `md.series` (the
 *   weak universe: `/series-history` refuses) — a skip is not a green. In `5m`/`15m`/`1h`/`4h`: A-1 on
 *   every chip present, cross-checked against the API on the page's own declared request; A-4; A-5;
 *   A-6. Then `C-3` on real data: the chips' visible text is swapped for the longest string (a probe,
 *   `page.evaluate`) and A-4/A-5/A-6 are read again after the host re-lays the scales.
 *
 * ⚠️ A-4 is asserted against the DESIGN floors of §3.2 at 1280×800 only, the viewport §3.2 declares them
 * at. At 1024×768 it is asserted against `AREA_FLOORS_1024`, a NON-REGRESSION SNAPSHOT (`K-3` of
 * `gates/T-05.4-design-critique-C3.md`), not a legibility floor. At 1200/1240 the areas are MEASURED and
 * written to `facts.jsonl`, not judged.
 *
 * `C-3` (`handoff/T-05.4-desenho.md` §10): below 1140 px of legend content width the chip paints its
 * COMPACT form (no `cobertura parcial — `, no denominator). A-7 checks that exactly one form is painted
 * and that it is the one the measured width calls for; 1200/1240 bracket the threshold. `K-1`: the real
 * universe runs A-5 + A-7 at 1240/1280 in `4h` on the four `PILOT_SYMBOLS`.
 *
 * `B-1` of `gates/W8-DESIGN-REVIEW.md` (the OI data area at 1024×768), with the falsifiers of
 * `gates/W8-OI-1024-DESIGN-GATE.md` §4: F-1 — on REAL data, the OI area per TF (`1m` included) against
 * `OI_AREA_FLOORS_1024`; F-2 — in the stub's `longest` cases at 1024, the O·H·L·C row stays on one line
 * with its numerals widened by a probe (the stub now serves `oi_candles`, so there IS a row); F-3 — at
 * 1024 and 1280, in both universes, a provenance term label is never painted without its value, read
 * by geometry AND by paint (`paintsIn`).
 *
 * Production-code ablations (rebuild per mutation) are run by hand and recorded in
 * `docs/context/paineis-de-fluxo/gates/T-05.4-build.md` and, for `B-1`, `gates/W8-OI-1024-build.md`.
 */

import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

const SPEC = "40-coverage-magnitude-and-legend-room";
const SYMBOL = "BTCUSDT";
/** `PILOT_SYMBOLS` of `[symbol]/page.tsx`, LITERAL: `K-1` runs F-5 on the universe that exists. */
const PILOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"] as const;
const CHART_HOST_TESTID = "symbol-chart-host";
const ONE_MINUTE_MS = 60_000;
/** `COVERAGE_HEAD_GRACE_MS` of `coverage-magnitude.ts`, LITERAL on purpose: the spec judges the
 * production constant, it does not inherit it (the `GRACE = 0` ablation must not move this one). */
const HEAD_GRACE_MS = 600_000;
const INTERVAL_MS: Readonly<Record<string, number>> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
const REAGGREGATED_TFS = ["5m", "15m", "1h", "4h"] as const;

/** `areaFloors`: which A-4 floors judge this viewport — the design ones (§3.2), the 1024 snapshot
 * (`K-3`), or none (measured only). 1200 and 1240 bracket `CHIP_COMPACT_BELOW_PX` (§10.6). */
const VIEWPORTS = [
  { name: "1024x768", width: 1024, height: 768, areaFloors: "1024" },
  { name: "1200x800", width: 1200, height: 800, areaFloors: null },
  { name: "1240x800", width: 1240, height: 800, areaFloors: null },
  { name: "1280x800", width: 1280, height: 800, areaFloors: "design" },
] as const;
type AreaFloorSet = (typeof VIEWPORTS)[number]["areaFloors"];

/** `C-3` (§10.2): the legend content width from which the chip paints its FULL form; below it, the
 * compact one. LITERAL, not imported: the spec judges the production threshold (`@max-[1140px]/legend`). */
const CHIP_COMPACT_BELOW_PX = 1140;

/** §3.2 with `C-4` (non-regression floors = measured − 1 px): `[testid, floor px]`. */
const AREA_FLOORS: readonly (readonly [string, number])[] = [
  ["price-pane", 220],
  ["liquidation-pane", 140],
  ["oi-pane", 71],
  ["long-short-pane", 36.6],
  ["cvd-pane", 40],
];
/**
 * `K-3`: a NON-REGRESSION SNAPSHOT at 1024×768, not a legibility floor. Each value is the LOWEST data
 * area measured with the compact form painted, over the four TFs of the real universe and the stub's
 * `longest`, minus 1 px. It only says "no worse than on 2026-10-02"; whether these heights are readable
 * is not measured (the OI one is open with the OI's own task, `gates/T-05.4-build.md` §6).
 */
const AREA_FLOORS_1024: readonly (readonly [string, number])[] = [
  // [MEDIDO 2026-10-02, facts of `e2e/40` (real 5m/15m/1h/4h + probe, stub `longest`), compact form painted]
  ["price-pane", 233.4], // 234.4 in every case
  ["liquidation-pane", 134], // 135.0 real (the legs wrap), 155.0 stub
  // 59.2 real 1h/4h and stub, 72.0 real 5m/15m. On REAL data the OI is judged per TF instead
  // (`OI_AREA_FLOORS_1024`); this one is the stub's, where the freshness line wraps at 1024 (its
  // data is older than the real one) and the OI legend is one line taller for that reason alone.
  ["oi-pane", 58.2],
  ["long-short-pane", 36.6], // 37.6 in every case
  ["cvd-pane", 43.65], // 44.65 in every case
];
/**
 * `B-1` (`gates/W8-DESIGN-REVIEW.md`; floor amended by `gates/W8-OI-1024-DESIGN-GATE.md` §4 F-1):
 * the OI data area at 1024×768 per TF, `C-4` convention (master's measured − 1 px). Master measured
 * 72.0 in 1m/5m/15m and 59.2 in 1h/4h (`handoff/W8-oi-1024-decisao.md` §1.2); the regression `B-1`
 * exists to catch (59.2 and 32.0, the O·H·L·C row wrapping) fails by 12 px and 26 px. A floor with 0 px
 * of margin would fail a sub-pixel and teach the next reader to ignore the test. ⚠️ The gate's own
 * condition is the MEASURED value: below 72.0 / 59.2 `B-1` does not close even with this test green.
 */
const OI_AREA_FLOORS_1024: Readonly<Record<string, number>> = { "1m": 71, "5m": 71, "15m": 71, "1h": 58.2, "4h": 58.2 };
/** §3.2: the liquidation data area is also `>= 0.6 ×` the pane's own height. */
const LIQUIDATION_AREA_SHARE_FLOOR = 0.6;
/** A-6: a chip is ONE line — its height `<= 1.5 ×` the line-height of the legend line. */
const ONE_LINE_FACTOR = 1.5;
/** A-5: room the `…` of a truncated line takes at its right edge (one glyph of `text-xs`). */
const ELLIPSIS_ROOM_PX = 8;

/** `C-3` — the longest visible line the stub's `longest` mode makes production write, and the one the
 * REAL-universe probe writes. It is LONGER than the gate's own example (`… long: faltam 1 h 4 min (1.1%),
 * de 6 d 23 h`), so passing it passes the example. */
const LONGEST_LIQUIDATION_TEXT = "cobertura parcial — short: faltam 6 d 23 h (99.4%) · long: faltam 23 h 59 min (14.3%), de 7 d";
const LONGEST_SINGLE_TEXT = "cobertura parcial — faltam 23 h 59 min de 7 d (14.3%)";
/** The same two, in the COMPACT form (§10.2): without the prefix and without the denominator. */
const LONGEST_LIQUIDATION_COMPACT = "short: faltam 6 d 23 h (99.4%) · long: faltam 23 h 59 min (14.3%)";
const LONGEST_SINGLE_COMPACT = "faltam 23 h 59 min (14.3%)";

/** `T-05.6` (`gates/T-05.6-DESIGN-GATE.md`, falsifier 1 of (b)): `C-3` runs in `15m` too, the TF whose
 * pane headings are the longest. The stub's `longest` mode in `15m` (384 buckets × 15 min = 4 d): short
 * loses 380 buckets (5 700 min → "3 d 23 h", 99.0%), the others 1 439 min ("23 h 59 min", 25.0%). Same
 * glyph count as the `1h` strings, by hand: the chip is as long, only the headings grew. */
const LONGEST_TEXTS: Readonly<Record<"1h" | "15m", readonly [full: string, compact: string][]>> = {
  "1h": [
    [LONGEST_LIQUIDATION_TEXT, LONGEST_LIQUIDATION_COMPACT],
    [LONGEST_SINGLE_TEXT, LONGEST_SINGLE_COMPACT],
    [LONGEST_SINGLE_TEXT, LONGEST_SINGLE_COMPACT],
  ],
  "15m": [
    [
      "cobertura parcial — short: faltam 3 d 23 h (99.0%) · long: faltam 23 h 59 min (25.0%), de 4 d",
      "short: faltam 3 d 23 h (99.0%) · long: faltam 23 h 59 min (25.0%)",
    ],
    ["cobertura parcial — faltam 23 h 59 min de 4 d (25.0%)", "faltam 23 h 59 min (25.0%)"],
    ["cobertura parcial — faltam 23 h 59 min de 4 d (25.0%)", "faltam 23 h 59 min (25.0%)"],
  ],
};

type Family = "volume" | "cvd" | "liquidation_short" | "liquidation_long";
const FAMILIES: readonly Family[] = ["volume", "cvd", "liquidation_short", "liquidation_long"];
const FACT_KEY: Readonly<Record<Family, string>> = {
  volume: "volume_partial_coverage",
  cvd: "cvd_partial_coverage",
  liquidation_short: "liquidation_partial_coverage:short",
  liquidation_long: "liquidation_partial_coverage:long",
};

// ── the independent arithmetic (NOT imported from production: the spec judges it) ─────────────

/** `100 × m / e` with one decimal, `<0.1` / `>99.9` at the edges (§2.4). */
function percentText(missing: number, expected: number): string {
  const text = ((100 * missing) / expected).toFixed(1);
  if (text === "0.0") return "<0.1";
  if (text === "100.0" && missing < expected) return ">99.9";
  return text;
}

interface CoverageRowWire {
  readonly event_time: number;
  readonly coverage: { readonly present: number; readonly expected: number } | null;
}

/** Missing outside the head and expected over the whole window, from rows as the route serves them. */
function foldRows(rows: readonly CoverageRowWire[], knowledgeTimeMs: number): { missing: number; expected: number; head: number } {
  let missing = 0;
  let expected = 0;
  let head = 0;
  for (const row of rows) {
    if (row.coverage === null) continue;
    expected += row.coverage.expected;
    const short = Math.max(0, row.coverage.expected - row.coverage.present);
    if (row.event_time > knowledgeTimeMs - HEAD_GRACE_MS) head += short;
    else missing += short;
  }
  return { missing, expected, head };
}

// ── the stub of the GATE universe ───────────────────────────────────────────────────────────────

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

type StubMode = "full" | "mid-3" | "head-only" | "longest";

function familyOf(key: SeriesKey): Family | null {
  if (key.metric === "klines_volume") return "volume";
  if (key.metric === "cvd_source") return "cvd";
  if (key.metric === "sum_liquidation") return key.cohort === "short" ? "liquidation_short" : "liquidation_long";
  return null;
}

/** How many native minutes the stub takes out of row `index` of `n` (each row expects `perBucket`). */
function missingAt(mode: StubMode, family: Family | null, index: number, n: number, perBucket: number): number {
  if (family === null) return 0;
  switch (mode) {
    case "full":
      return 0;
    case "mid-3":
      return index === Math.floor(n / 2) ? Math.min(3, perBucket) : 0;
    case "head-only":
      return index === n - 1 ? Math.min(3, perBucket) : 0;
    case "longest": {
      // Short loses the most WHOLE HOURS short of the window (production rounds a missing span UP to
      // the hour above a day, so 5 745 min would print "4 d", not the longer "3 d 23 h"); the others
      // lose 1 439 min ("23 h 59 min").
      // 1h, 168 rows × 60: short 167 h (10 020 min → "6 d 23 h", 99.4%), others 14.3%.
      // 15m, 384 rows × 15 (`T-05.6`): short 95 h (5 700 min → "3 d 23 h", 99.0%), others 25.0%.
      const target =
        family === "liquidation_short" ? Math.floor(((n - 1) * perBucket) / 60) * 60 : LONGEST_OTHERS_MISSING_MIN;
      const before = index * perBucket;
      return Math.max(0, Math.min(perBucket, target - before));
    }
  }
}

/** `C-3`: what every family but the short leg loses in `longest` — one minute short of a day. */
const LONGEST_OTHERS_MISSING_MIN = 24 * 60 - 1;

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

function stubValue(key: SeriesKey, bucketMs: number): string {
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
      return String((key.cohort === "short" ? 1000.25 : 600.5) + wave(minute, key.cohort === "short" ? 5 : 4) * 3);
    case "sum_open_interest":
      return String(50_000 + wave(Math.floor(minute / 5) * 5, 6) / 4);
    case "count_long_short_ratio":
      return String(0.5 + wave(Math.floor(minute / 5) * 5, 7) / 512);
    default:
      return String(wave(minute, 9) / 4);
  }
}

interface ServedWindow {
  readonly rows: readonly CoverageRowWire[];
  readonly knowledgeTimeMs: number;
  readonly interval: string;
}

interface Stub {
  readonly url: string;
  mode: StubMode;
  /** The last `/series-history` answer per family — the TRUTH the DOM is compared with. */
  readonly served: Map<Family, ServedWindow>;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<Stub> {
  const keysById = new Map<string, SeriesKey>(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
  const served = new Map<Family, ServedWindow>();
  const stub = { url: "", mode: "full" as StubMode, served, close: async () => {} };
  const server = http.createServer((request, response) => {
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (!incoming.pathname.endsWith("/series-history")) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("T-05.4 stub: no route");
      return;
    }
    const startMs = Number(incoming.searchParams.get("window_start_ms"));
    const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
    const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
    const interval = incoming.searchParams.get("interval") ?? "1m";
    const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
    const key = keysById.get(seriesKeyId);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end(`T-05.4 stub: bad request (${seriesKeyId || "no series_key_id"})`);
      return;
    }
    const rows: Record<string, unknown>[] = [];
    const candles: Record<string, unknown>[] = [];
    const stepMs = INTERVAL_MS[interval];
    if (stepMs === undefined) {
      // `1m`: the native grid, no reaggregation, `coverage: null` (`series_history.py`, degenerate case).
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        rows.push({ event_time: t, available_at: t, value: stubValue(key, t), absence: null, coverage: null });
      }
    } else {
      const perBucket = stepMs / ONE_MINUTE_MS;
      const first = Math.ceil(startMs / stepMs) * stepMs;
      const ends: number[] = [];
      for (let t = first; t <= endMsInclusive; t += stepMs) ends.push(t);
      const family = familyOf(key);
      ends.forEach((end, index) => {
        const present = perBucket - missingAt(stub.mode, family, index, ends.length, perBucket);
        const coverage = { present, expected: perBucket };
        rows.push(
          present === 0
            ? { event_time: end, available_at: null, value: null, absence: "SEM_PONTO", coverage }
            : { event_time: end, available_at: end, value: stubValue(key, end), absence: null, coverage },
        );
      });
      if (family !== null) {
        served.set(family, { rows: rows as unknown as CoverageRowWire[], knowledgeTimeMs, interval });
      }
      if (key.metric === "sum_open_interest") {
        // `B-1` F-2: the OI pane needs CANDLES for its O·H·L·C row to exist at all (without them the
        // legend prints absences and F-2 would measure nothing). The shape is the real route's at an
        // outer TF (`GET /series-history`, measured 2026-10-03 on BTCUSDT 1h): one candle per outer
        // bucket end, `binance_poll_1m` with `bucket_interval_ms` = the TF, `samples` = the minutes.
        ends.forEach((end) => {
          const open = Number(stubValue(key, end - stepMs));
          const close = Number(stubValue(key, end));
          candles.push({
            bucket_end_ms: end,
            open,
            high: Math.max(open, close) + 0.5,
            low: Math.min(open, close) - 0.5,
            close,
            open_at_ms: end - stepMs,
            close_at_ms: end,
            samples: { present: perBucket, expected: perBucket },
            closed: end <= knowledgeTimeMs,
            derived_from: "binance_poll_1m",
          });
        });
      }
    }
    const oiCandles =
      candles.length === 0
        ? null
        : {
            timeframe_ms: stepMs,
            sources: [{ derived_from: "binance_poll_1m", series_key_id: seriesKeyId, native_grid_ms: ONE_MINUTE_MS, bucket_interval_ms: stepMs }],
            candles,
          };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-05.4-synthetic-coverage",
          nature: key.nature,
          unit: key.unit,
          coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
        },
        rows,
        knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
        bar_policy: "final_only",
        oi_candles: oiCandles,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-05.4 stub: no port");
  stub.url = `http://127.0.0.1:${address.port}`;
  stub.close = () => new Promise((resolve) => server.close(() => resolve()));
  return stub;
}

// ── reading the page ────────────────────────────────────────────────────────────────────────────

interface DeclaredRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

async function openSymbol(
  page: Page,
  baseUrl: string,
  interval: string,
  cacheBuster: string,
  symbol: string = SYMBOL,
): Promise<DeclaredRequest> {
  await page.mouse.move(2, 2);
  const symbolPath = `/symbol/${symbol}`;
  const response = await page.goto(`${baseUrl}${symbolPath}?interval=${interval}&e2eCoverage=${cacheBuster}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${symbolPath} did not answer ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
    timeout: 120_000,
  });
  await settleLayout(page);
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

/** Waits until every pane's `data-pane-height-px`/`data-reserved-scale-top-px` stop moving: the host
 * re-lays the scales on a `ResizeObserver` of the legends, so a reading taken mid-layout is a reading of
 * nothing. Two equal readings 400 ms apart. */
async function settleLayout(page: Page): Promise<void> {
  const snapshot = () =>
    page.evaluate((ids) => ids.map((id) => {
      const root = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      return `${root?.dataset.paneHeightPx ?? "?"}|${root?.dataset.reservedScaleTopPx ?? "?"}`;
    }).join(","), AREA_FLOORS.map(([id]) => id));
  let previous = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(400);
    const current = await snapshot();
    if (current === previous && !current.includes("?") && !current.includes("|,") && !current.endsWith("|")) return;
    previous = current;
  }
  throw new Error(`the pane layout never settled: ${previous}`);
}

interface ChipFact {
  readonly factKey: string;
  readonly missing: number;
  readonly expected: number;
  readonly missingMs: number;
  readonly expectedMs: number;
  readonly gridMs: number;
  readonly chipText: string;
}

async function readChipFacts(page: Page): Promise<readonly ChipFact[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-fact*="partial_coverage"]')].map((carrier) => {
      const raw = carrier.getAttribute("data-fact") ?? "";
      const match = /^(.*):(\d+)\/(\d+)$/.exec(raw);
      const chip = carrier.closest<HTMLElement>("[data-coverage-chip]");
      return {
        factKey: match?.[1] ?? `MALFORMED(${raw})`,
        missing: Number(match?.[2] ?? NaN),
        expected: Number(match?.[3] ?? NaN),
        missingMs: Number(carrier.dataset.coverageMissingMs),
        expectedMs: Number(carrier.dataset.coverageExpectedMs),
        gridMs: Number(carrier.dataset.coverageNativeGridMs),
        chipText:
          [...(chip?.querySelectorAll<HTMLElement>("[data-coverage-visible]") ?? [])].find(
            (form) => form.getClientRects().length > 0 && form.getBoundingClientRect().width > 0,
          )?.textContent ?? "NO PAINTED CHIP",
      };
    }),
  );
}

/** A-1 on whatever chips the page shows. Returns the defects, so an ablation's rejection is READ. */
function judgeMagnitude(facts: readonly ChipFact[]): string[] {
  const defects: string[] = [];
  for (const f of facts) {
    const at = `${f.factKey}:${f.missing}/${f.expected}`;
    if (!Object.values(FACT_KEY).includes(f.factKey)) defects.push(`${at}: unknown or malformed fact key`);
    if (!(Number.isInteger(f.missing) && Number.isInteger(f.expected) && f.missing >= 1 && f.missing <= f.expected)) {
      defects.push(`${at}: not 1 <= missing <= expected`);
    }
    if (!(f.gridMs > 0)) defects.push(`${at}: native grid ${f.gridMs} is not positive`);
    if (f.missingMs !== f.missing * f.gridMs) defects.push(`${at}: missing-ms ${f.missingMs} ≠ missing × grid (${f.missing} × ${f.gridMs})`);
    if (f.expectedMs !== f.expected * f.gridMs) defects.push(`${at}: expected-ms ${f.expectedMs} ≠ expected × grid (${f.expected} × ${f.gridMs})`);
    const percent = `${percentText(f.missing, f.expected)}%)`;
    if (!f.chipText.includes(percent)) defects.push(`${at}: chip text ${JSON.stringify(f.chipText)} lacks "${percent}"`);
  }
  return defects;
}

interface PaneArea {
  readonly testId: string;
  readonly paneHeightPx: number;
  readonly reservedTopPx: number;
  readonly areaPx: number;
}

async function readAreas(page: Page): Promise<readonly PaneArea[]> {
  return page.evaluate(
    (ids) =>
      ids.map((testId) => {
        const root = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        const paneHeightPx = Number(root?.dataset.paneHeightPx);
        const reservedTopPx = Number(root?.dataset.reservedScaleTopPx);
        return { testId, paneHeightPx, reservedTopPx, areaPx: paneHeightPx - reservedTopPx };
      }),
    AREA_FLOORS.map(([id]) => id),
  );
}

/** A-4 (§3.2 with `C-4`; at 1024 the `K-3` snapshot, and the OI's per-TF floor of `B-1`). */
function judgeAreas(areas: readonly PaneArea[], floors: Exclude<AreaFloorSet, null> = "design", realOiInterval?: string): string[] {
  const defects: string[] = [];
  for (const [testId, snapshotFloor] of floors === "design" ? AREA_FLOORS : AREA_FLOORS_1024) {
    const perTf = floors === "1024" && testId === "oi-pane" && realOiInterval !== undefined;
    const floor = perTf ? OI_AREA_FLOORS_1024[realOiInterval] : snapshotFloor;
    if (floor === undefined) {
      defects.push(`${testId}: no floor declared for ${realOiInterval}`);
      continue;
    }
    const area = areas.find((a) => a.testId === testId);
    if (area === undefined || !Number.isFinite(area.areaPx)) {
      defects.push(`${testId}: area not published`);
      continue;
    }
    if (area.areaPx < floor) defects.push(`${testId}: data area ${area.areaPx.toFixed(2)} px < ${floor} px`);
    if (floors === "design" && testId === "liquidation-pane" && area.areaPx < LIQUIDATION_AREA_SHARE_FLOOR * area.paneHeightPx) {
      defects.push(
        `${testId}: data area ${area.areaPx.toFixed(2)} px < ${LIQUIDATION_AREA_SHARE_FLOOR} × pane ${area.paneHeightPx} px ` +
          `(${(area.areaPx / area.paneHeightPx).toFixed(3)})`,
      );
    }
  }
  return defects;
}

interface PhraseVisibility {
  readonly needle: string;
  readonly found: boolean;
  readonly widthPx: number;
  readonly visibleWidthPx: number;
  readonly rightPx: number;
  readonly paneRightPx: number;
}

/** A-5: the rect of `needle`'s own text (a `Range`), intersected with every clipping ancestor up to the
 * pane layer root (the plot area — the price scale is the `<td>` to its right, `PANE_LAYER_CLASS`). A
 * truncated ancestor also loses the room its `…` takes. Only text in the painted legend counts: the
 * `sr-only` details carry the same words and are not what the owner reads. */
async function phraseVisibility(page: Page, paneTestId: string, needle: string): Promise<PhraseVisibility> {
  return page.evaluate(
    ({ paneTestId, needle, ellipsisRoom }) => {
      const root = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`);
      const legend = root?.querySelector<HTMLElement>("[data-pane-legend]") ?? null;
      const none = { needle, found: false, widthPx: 0, visibleWidthPx: 0, rightPx: 0, paneRightPx: 0 };
      if (root === null || root === undefined || legend === null) return none;
      const walker = document.createTreeWalker(legend, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.nodeValue ?? "";
        const at = text.indexOf(needle);
        if (at < 0 || (node.parentElement?.closest(".sr-only") ?? null) !== null) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        const rect = range.getBoundingClientRect();
        let left = rect.left;
        let right = rect.right;
        for (let element: HTMLElement | null = node.parentElement; element !== null; element = element.parentElement) {
          const style = getComputedStyle(element);
          if (style.overflowX !== "visible") {
            const box = element.getBoundingClientRect();
            const truncated = style.textOverflow === "ellipsis" && element.scrollWidth > element.clientWidth + 0.5;
            left = Math.max(left, box.left);
            right = Math.min(right, box.right - (truncated ? ellipsisRoom : 0));
          }
          if (element === root) break;
        }
        const paneRight = root.getBoundingClientRect().right;
        return { needle, found: true, widthPx: rect.width, visibleWidthPx: Math.max(0, right - left), rightPx: rect.right, paneRightPx: paneRight };
      }
      return none;
    },
    { paneTestId, needle, ellipsisRoom: ELLIPSIS_ROOM_PX },
  );
}

/** A-5: `Dado de TERCEIRO` (`RS-5`) and `(escala linear)` (`T-02.2` §5.3) wholly visible, left of the scale. */
async function judgeTruncation(page: Page): Promise<{ readonly readings: readonly PhraseVisibility[]; readonly defects: string[] }> {
  const readings = [
    await phraseVisibility(page, "liquidation-pane", "Dado de TERCEIRO"),
    await phraseVisibility(page, "price-pane", "(escala linear)"),
  ];
  const defects: string[] = [];
  for (const r of readings) {
    if (!r.found) defects.push(`"${r.needle}": not in the painted legend`);
    else if (r.visibleWidthPx < r.widthPx - 0.5) defects.push(`"${r.needle}": only ${r.visibleWidthPx.toFixed(1)} of ${r.widthPx.toFixed(1)} px visible`);
    else if (r.rightPx > r.paneRightPx + 0.5) defects.push(`"${r.needle}": ends at ${r.rightPx.toFixed(1)}, past the scale border ${r.paneRightPx.toFixed(1)}`);
  }
  return { readings, defects };
}

// ── `B-1`: the OI legend at 1024 (`gates/W8-OI-1024-DESIGN-GATE.md` §4) ───────────────────────

/** F-2's probe width: ~3 digits more than the real OI, so the stub's shorter numbers cannot pass
 * by having too few digits for anything to wrap (`handoff/W8-oi-1024-decisao.md` §5). */
const OHLC_PROBE_NUMERAL_WIDTH = "13ch";

interface OhlcRowProbe {
  readonly oiCandles: number;
  readonly parts: readonly { readonly part: string; readonly top: number }[];
  readonly derivedTop: number | null;
}

/** F-2 — widens every O·H·L·C numeral to `OHLC_PROBE_NUMERAL_WIDTH` and reads where each part and
 * the `DERIVADO` label land. ⚠️ MUTATES the DOM: run it after every other reading of the page. */
async function probeOhlcRow(page: Page): Promise<OhlcRowProbe> {
  return page.evaluate(async (width) => {
    const pane = document.querySelector<HTMLElement>('[data-testid="oi-pane"]');
    const root = pane?.querySelector<HTMLElement>('[data-legend-ohlc="oi"]') ?? null;
    for (const numeral of root?.querySelectorAll<HTMLElement>("[data-legend-numeral]") ?? []) numeral.style.width = width;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      oiCandles: Number(pane?.dataset.oiCandles),
      parts: [...(root?.querySelectorAll<HTMLElement>("[data-legend-ohlc-part]") ?? [])].map((part) => ({
        part: part.dataset.legendOhlcPart ?? "",
        top: part.getBoundingClientRect().top,
      })),
      derivedTop: root?.querySelector<HTMLElement>('[data-fact^="oi_candle_provenance:"]')?.getBoundingClientRect().top ?? null,
    };
  }, OHLC_PROBE_NUMERAL_WIDTH);
}

/** F-2: the O·H·L·C parts share ONE line, and `DERIVADO (…)` is below it. Never passes on nothing:
 * without a candle there is no row to measure, and that is a defect of the case, not a green. */
function judgeOhlcRow(probe: OhlcRowProbe): string[] {
  if (!(probe.oiCandles > 0)) return [`sem vela, F-2 não mede (data-oi-candles=${probe.oiCandles})`];
  const defects: string[] = [];
  if (probe.parts.length < 3) defects.push(`only ${probe.parts.length} O·H·L·C parts in the legend`);
  const first = probe.parts[0]?.top ?? Number.NaN;
  for (const p of probe.parts) {
    if (!(Math.abs(p.top - first) < 1)) defects.push(`part ${p.part} at top ${p.top.toFixed(1)} ≠ ${first.toFixed(1)}: the row wrapped`);
  }
  if (probe.derivedTop === null) defects.push("no DERIVADO label to place");
  else if (!(probe.derivedTop > first + 1)) defects.push(`DERIVADO at top ${probe.derivedTop.toFixed(1)}, not below the row (${first.toFixed(1)})`);
  return defects;
}

interface ProvenanceTermPaint {
  readonly label: string;
  readonly found: boolean;
  /** The label's own `Range` ∩ the `<p>`'s box (the gate's "largura visível do rótulo"). */
  readonly labelInBoxPx: number;
  /** Whether hiding the element that holds the label changes a single pixel of that box. */
  readonly painted: boolean | null;
  readonly headText: string;
  readonly headWidthPx: number;
  /** The head's `Range` ∩ the `<p>`'s box minus the room of its `…` when it is truncated. */
  readonly headVisiblePx: number;
}

interface ProvenanceReading {
  readonly found: boolean;
  readonly textContent: string;
  readonly expectedText: string;
  readonly truncated: boolean;
  readonly firstTermWidthPx: number;
  readonly firstTermVisiblePx: number;
  /** Control of the pixel method: hiding the whole `<p>` changes the pixels of `Grandeza: …`. */
  readonly controlPainted: boolean;
  readonly terms: readonly ProvenanceTermPaint[];
}

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Two screenshots of `box`, with the element `selector` toggled to `visibility: hidden` between
 * them: `true` iff the element paints anything there. Re-shot until the unhidden baseline is stable
 * (the canvas under the legend may repaint), so a moving chart is never read as paint. */
async function paintsIn(page: Page, selector: string, box: Box): Promise<boolean> {
  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.max(1, Math.ceil(box.x + box.width) - Math.floor(box.x)),
    height: Math.max(1, Math.ceil(box.y + box.height) - Math.floor(box.y)),
  };
  const toggle = (hidden: boolean) =>
    page.evaluate(
      async ({ selector, hidden }) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element === null) throw new Error(`paintsIn: ${selector} is not in the page`);
        element.style.visibility = hidden ? "hidden" : "";
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      },
      { selector, hidden },
    );
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = await page.screenshot({ clip });
    await toggle(true);
    const hidden = await page.screenshot({ clip });
    await toggle(false);
    const again = await page.screenshot({ clip });
    if (shown.equals(again)) return !shown.equals(hidden);
  }
  throw new Error(`paintsIn: the pixels under ${selector} never settled`);
}

/** `B-1`, measured not judged: the height of each block of the OI legend (what the host reserves the
 * scale top for), so a data area below the floor names WHICH block grew. */
async function readOiLegendBlocks(page: Page): Promise<readonly { readonly tag: string; readonly text: string; readonly heightPx: number }[]> {
  return page.evaluate(() =>
    [...(document.querySelector('[data-testid="oi-pane"] [data-pane-legend]')?.children ?? [])].map((child) => ({
      tag: child.tagName.toLowerCase(),
      text: (child.textContent ?? "").slice(0, 60),
      heightPx: child.getBoundingClientRect().height,
    })),
  );
}

const OI_PROVENANCE_SELECTOR = '[data-testid="oi-pane"] [data-pane-legend] [data-fact^="oi_provenance:"]';

/** F-3: the OI provenance line, read by geometry AND by paint. Every term after the first is located
 * by its label's text (`Universo:`, `Coorte:`), never by a class or attribute of the fix, so the
 * reading is the same on the shape it judges and on its ablation. */
async function readOiProvenance(page: Page): Promise<ProvenanceReading> {
  const geometry = await page.evaluate(
    ({ selector, ellipsisRoom }) => {
      const p = document.querySelector<HTMLElement>(selector);
      if (p === null) return null;
      const fact = p.getAttribute("data-fact") ?? "";
      const values = Object.fromEntries(
        fact.replace(/^oi_provenance:/, "").split(";").map((pair) => pair.split("=") as [string, string]),
      );
      if (values.grandeza === undefined) return null;
      const expectedText = `Grandeza: ${values.grandeza} · Universo: ${values.universo} · Coorte: ${values.coorte}`;
      const box = p.getBoundingClientRect();
      const truncated = p.scrollWidth > p.clientWidth + 0.5;
      const edge = box.right - (truncated ? ellipsisRoom : 0);
      const rectOf = (needle: string, after = "") => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const text = node.nodeValue ?? "";
          const at = text.indexOf(after + needle);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at + after.length);
          range.setEnd(node, at + after.length + needle.length);
          return { rect: range.getBoundingClientRect(), holder: node.parentElement as HTMLElement };
        }
        return null;
      };
      const span = (r: DOMRect, right: number) => Math.max(0, Math.min(r.right, right) - Math.max(r.left, box.left));
      const first = rectOf(`Grandeza: ${values.grandeza}`);
      const terms = (
        [
          ["Universo", values.universo ?? ""],
          ["Coorte", values.coorte ?? ""],
        ] as const
      ).map(([label, value]) => {
        const head = value.includes("/") ? value.slice(0, value.indexOf("/")) : value;
        const labelHit = rectOf(`${label}:`);
        const headHit = rectOf(head, `${label}: `);
        if (labelHit === null || headHit === null) {
          return { label, found: false, labelInBoxPx: 0, headText: head, headWidthPx: 0, headVisiblePx: 0, holder: null, labelBox: null };
        }
        // Mark the element that holds the label, so the paint probe can toggle exactly it.
        labelHit.holder.setAttribute("data-e2e-provenance-holder", label);
        const lr = labelHit.rect;
        const left = Math.max(lr.left, box.left);
        const right = Math.min(lr.right, box.right);
        return {
          label,
          found: true,
          labelInBoxPx: span(lr, box.right),
          headText: head,
          headWidthPx: headHit.rect.width,
          headVisiblePx: span(headHit.rect, edge),
          holder: label,
          labelBox: right > left ? { x: left, y: Math.max(lr.top, box.top), width: right - left, height: Math.min(lr.bottom, box.bottom) - Math.max(lr.top, box.top) } : null,
        };
      });
      return {
        textContent: p.textContent ?? "",
        expectedText,
        truncated,
        firstTermWidthPx: first?.rect.width ?? 0,
        firstTermVisiblePx: first === null ? 0 : span(first.rect, edge),
        firstBox: first === null ? null : { x: first.rect.left, y: first.rect.top, width: first.rect.width, height: first.rect.height },
        terms,
      };
    },
    { selector: OI_PROVENANCE_SELECTOR, ellipsisRoom: ELLIPSIS_ROOM_PX },
  );
  if (geometry === null) {
    return { found: false, textContent: "", expectedText: "", truncated: false, firstTermWidthPx: 0, firstTermVisiblePx: 0, controlPainted: false, terms: [] };
  }
  const controlPainted = geometry.firstBox === null ? false : await paintsIn(page, OI_PROVENANCE_SELECTOR, geometry.firstBox);
  const terms: ProvenanceTermPaint[] = [];
  for (const t of geometry.terms) {
    const painted =
      t.labelBox === null || t.labelInBoxPx <= 0
        ? null
        : await paintsIn(page, `${OI_PROVENANCE_SELECTOR} [data-e2e-provenance-holder="${t.label}"], ${OI_PROVENANCE_SELECTOR}[data-e2e-provenance-holder="${t.label}"]`, t.labelBox);
    terms.push({
      label: t.label,
      found: t.found,
      labelInBoxPx: t.labelInBoxPx,
      painted,
      headText: t.headText,
      headWidthPx: t.headWidthPx,
      headVisiblePx: t.headVisiblePx,
    });
  }
  return {
    found: true,
    textContent: geometry.textContent,
    expectedText: geometry.expectedText,
    truncated: geometry.truncated,
    firstTermWidthPx: geometry.firstTermWidthPx,
    firstTermVisiblePx: geometry.firstTermVisiblePx,
    controlPainted,
    terms,
  };
}

/**
 * F-3 (`gates/W8-OI-1024-DESIGN-GATE.md` §4): a term label is never painted without its value.
 * For `Universo:` and `Coorte:`: if the label shows inside the `<p>` AND paints, the head of its
 * value (up to the first `/`) is wholly visible. `Grandeza: <valor>` is wholly visible. The `<p>`'s
 * `textContent` is the one sentence the screen reader always read.
 *
 * `headAt1280`, the counter-ablation: at 1280×800 the `Universo` head paints, whole — the adjustment
 * must not hide on the main viewport what it used to show (`binance`).
 */
function judgeOiProvenance(r: ProvenanceReading, headAt1280 = false): string[] {
  if (!r.found) return ["the OI provenance line is not in the painted legend"];
  const defects: string[] = [];
  if (r.textContent !== r.expectedText) defects.push(`textContent ${JSON.stringify(r.textContent)} ≠ ${JSON.stringify(r.expectedText)}`);
  if (!r.controlPainted) defects.push("control: hiding the <p> changed no pixel of `Grandeza: …` — the paint probe sees nothing");
  if (r.firstTermVisiblePx < r.firstTermWidthPx - 0.5) {
    defects.push(`Grandeza: only ${r.firstTermVisiblePx.toFixed(1)} of ${r.firstTermWidthPx.toFixed(1)} px visible`);
  }
  for (const t of r.terms) {
    if (!t.found) {
      defects.push(`${t.label}: label or head not found in the line`);
      continue;
    }
    if (t.painted === true && t.headVisiblePx < t.headWidthPx - 0.5) {
      defects.push(`${t.label}: label painted with its head "${t.headText}" at ${t.headVisiblePx.toFixed(1)} of ${t.headWidthPx.toFixed(1)} px`);
    }
  }
  if (headAt1280) {
    const universo = r.terms.find((t) => t.label === "Universo");
    if (universo === undefined || universo.painted !== true || universo.headVisiblePx < universo.headWidthPx - 0.5) {
      defects.push(`contra-ablação: at 1280 the Universo head is not painted whole (${JSON.stringify(universo)})`);
    }
  }
  return defects;
}

interface ChipLine {
  readonly chip: string;
  readonly chipHeightPx: number;
  readonly lineHeightPx: number;
  readonly lineBoxHeightPx: number;
  readonly text: string;
}

/** A-6: each chip, and the legend line that holds it, is one line tall. */
async function readChipLines(page: Page): Promise<readonly ChipLine[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-coverage-chip]")].map((chip) => {
      const line = chip.parentElement as HTMLElement;
      const style = getComputedStyle(line);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        chip: chip.getAttribute("data-coverage-chip") ?? "",
        chipHeightPx: chip.getBoundingClientRect().height,
        lineHeightPx: Number.isFinite(lineHeight) ? lineHeight : 1.2 * Number.parseFloat(style.fontSize),
        lineBoxHeightPx: line.getBoundingClientRect().height,
        text:
          [...chip.querySelectorAll<HTMLElement>("[data-coverage-visible]")].find(
            (form) => form.getClientRects().length > 0 && form.getBoundingClientRect().width > 0,
          )?.textContent ?? "",
      };
    }),
  );
}

function judgeOneLine(lines: readonly ChipLine[]): string[] {
  const defects: string[] = [];
  for (const l of lines) {
    const ceiling = ONE_LINE_FACTOR * l.lineHeightPx;
    if (l.chipHeightPx > ceiling) defects.push(`${l.chip}: chip ${l.chipHeightPx.toFixed(1)} px > ${ceiling.toFixed(1)} px`);
    if (l.lineBoxHeightPx > ceiling) defects.push(`${l.chip}: legend line ${l.lineBoxHeightPx.toFixed(1)} px > ${ceiling.toFixed(1)} px`);
  }
  return defects;
}

interface ChipForms {
  readonly chip: string;
  /** The legend's CONTENT box width (`clientWidth − padding`, CI-3): what the container query compares. */
  readonly legendContentPx: number;
  readonly painted: readonly string[];
  readonly full: string;
  readonly compact: string;
}

/** A-7: per chip, which `[data-coverage-visible]` forms have a painted box, and the legend width. */
async function readChipForms(page: Page): Promise<readonly ChipForms[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-coverage-chip]")].map((chip) => {
      const legend = chip.closest<HTMLElement>("[data-pane-legend]");
      const style = legend === null ? null : getComputedStyle(legend);
      const legendContentPx =
        legend === null || style === null
          ? Number.NaN
          : legend.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const forms = [...chip.querySelectorAll<HTMLElement>("[data-coverage-visible]")];
      const textOf = (name: string) => forms.find((form) => form.dataset.coverageVisible === name)?.textContent ?? "MISSING";
      return {
        chip: chip.getAttribute("data-coverage-chip") ?? "",
        legendContentPx,
        painted: forms
          .filter((form) => form.getClientRects().length > 0 && form.getBoundingClientRect().width > 0)
          .map((form) => form.dataset.coverageVisible ?? "?"),
        full: textOf("full"),
        compact: textOf("compact"),
      };
    }),
  );
}

/** A-7: exactly one form painted, and it is `full` iff the legend content width is `>= 1140`. */
function judgeForms(forms: readonly ChipForms[]): string[] {
  const defects: string[] = [];
  for (const f of forms) {
    const expected = f.legendContentPx >= CHIP_COMPACT_BELOW_PX ? "full" : "compact";
    if (!Number.isFinite(f.legendContentPx)) defects.push(`${f.chip}: no [data-pane-legend] around the chip`);
    else if (f.painted.length !== 1 || f.painted[0] !== expected) {
      defects.push(`${f.chip}: legend ${f.legendContentPx.toFixed(1)}px ⇒ ${expected} form, ${f.painted.join("+") || "none"} painted`);
    }
  }
  return defects;
}

async function readLedgers(page: Page): Promise<Readonly<Record<string, { missing: number; expected: number; head: number }>>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-coverage-ledger]")].map((ledger) => [
        ledger.getAttribute("data-coverage-ledger") ?? "",
        {
          missing: Number(ledger.dataset.coverageMissingFacts),
          expected: Number(ledger.dataset.coverageExpectedFacts),
          head: Number(ledger.dataset.coverageHeadExcludedFacts),
        },
      ]),
    ),
  );
}

// ── GATE universe ───────────────────────────────────────────────────────────────────────────────

test.describe(`T-05.4 gate: the coverage warning's magnitude, its absence, the head, and the legend room (${SPEC})`, () => {
  let stub: Stub | undefined;
  let instance: NextInstanceHandle | undefined;
  let catalog: CatalogEnvelope | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog answered ${response.status}`);
    catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  /** The served truth of one family, folded by the spec's own arithmetic. */
  function servedTruth(family: Family) {
    const served = stub!.served.get(family);
    if (served === undefined) throw new Error(`the page never asked the stub for ${family}`);
    return { ...foldRows(served.rows, served.knowledgeTimeMs), interval: served.interval };
  }

  test("A-2 + A-1: full coverage ⇒ no chip at all; 3 minutes short in one middle bucket ⇒ one chip per pane with 3/<expected>", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const interval of ["15m", "4h"] as const) {
      stub!.mode = "full";
      await openSymbol(page, instance!.baseUrl, interval, `full-${interval}`);
      const fullChips = await page.locator('[data-fact*="partial_coverage"]').count();
      const fullLedgers = await readLedgers(page);
      fact(SPEC, `gate_full_${interval}`, { chips: fullChips, ledgers: fullLedgers });
      expect(fullChips, `A-2 ${interval}: a window with nothing missing must render NO coverage fact`).toBe(0);
      await expect(page.locator("[data-coverage-chip]"), `A-2 ${interval}: no chip element either`).toHaveCount(0);
      for (const family of FAMILIES) {
        const ledger = fullLedgers[FACT_KEY[family]];
        expect(ledger, `${family}: the ledger exists even without a chip`).toBeDefined();
        expect(ledger.missing, `${family}: ledger missing`).toBe(0);
        expect(ledger.expected, `${family}: ledger expected = the served Σ expected`).toBe(servedTruth(family).expected);
      }

      stub!.mode = "mid-3";
      await openSymbol(page, instance!.baseUrl, interval, `mid-${interval}`);
      const facts = await readChipFacts(page);
      fact(SPEC, `gate_mid3_${interval}`, facts);
      expect(judgeMagnitude(facts), `A-1 ${interval}`).toEqual([]);
      for (const family of FAMILIES) {
        const truth = servedTruth(family);
        expect(truth.missing, `${family}: the stub served 3 missing outside the head`).toBe(3);
        const matching = facts.filter((f) => f.factKey === FACT_KEY[family]);
        expect(matching.map((f) => `${f.missing}/${f.expected}`), `A-2 ${interval} ${family}: ONE fact, the served magnitude`).toEqual([
          `${truth.missing}/${truth.expected}`,
        ]);
      }
      // §2.4: both legs short by the same amount ⇒ ONE chip for the liquidation pane, two carriers in it.
      await expect(page.locator('[data-testid="liquidation-pane"] [data-coverage-chip]')).toHaveCount(1);
      await expect(page.locator("[data-coverage-chip]")).toHaveCount(3);
    }
  });

  test("A-3: in 5m, a shortfall only in the newest bucket (inside the 10 min head) shows no chip and publishes the head", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    stub!.mode = "head-only";
    const declared = await openSymbol(page, instance!.baseUrl, "5m", "head-5m");
    const chips = await page.locator('[data-fact*="partial_coverage"]').count();
    const ledgers = await readLedgers(page);
    const newest = Math.max(...stub!.served.get("volume")!.rows.map((row) => row.event_time));
    fact(SPEC, "gate_head_5m", { chips, ledgers, newestAgeMs: declared.knowledgeTimeMs - newest });
    // The precondition the case stands on: the newest bucket IS inside the grace.
    expect(newest, "the newest 5m bucket must be inside the head").toBeGreaterThan(declared.knowledgeTimeMs - HEAD_GRACE_MS);
    expect(chips, "A-3: a head-only shortfall is latency, not a hole — no chip").toBe(0);
    for (const family of FAMILIES) {
      const ledger = ledgers[FACT_KEY[family]];
      expect(ledger, `A-3 ${family}: the ledger node exists without the chip`).toBeDefined();
      expect({ missing: ledger.missing, head: ledger.head }, `A-3 ${family}: missing 0, head published`).toEqual({ missing: 0, head: 3 });
    }
  });

  // `T-05.6`: `15m` too — the TF whose pane headings are one glyph longer (`Volume 15m (1m, BTC)`).
  const longestCases = (["1h", "15m"] as const).flatMap((interval) => VIEWPORTS.map((viewport) => [interval, viewport] as const));
  for (const [interval, viewport] of longestCases) {
    const areaNote = viewport.areaFloors === "design" ? ", A-4 (C-4)" : viewport.areaFloors === "1024" ? ", A-4 (K-3 snapshot)" : " (A-4 measured, not judged)";
    test(`C-3 at ${viewport.name} in ${interval}: the longest text (two legs different) — A-1, A-5, A-6, A-7${areaNote}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      stub!.mode = "longest";
      await openSymbol(page, instance!.baseUrl, interval, `longest-${interval}-${viewport.name}`);
      const facts = await readChipFacts(page);
      const lines = await readChipLines(page);
      const areas = await readAreas(page);
      const truncation = await judgeTruncation(page);
      const forms = await readChipForms(page);
      const suffix = interval === "1h" ? "" : `_${interval}`;
      fact(SPEC, `gate_longest_${viewport.name}${suffix}`, { facts, lines, areas, forms, truncation: truncation.readings });

      // The case IS the longest string: production wrote exactly what C-3 asked to measure — in BOTH
      // forms, since production always renders the two and the container query picks the painted one.
      // `expect.soft` from here on: an ablation must show EVERY assert it breaks, not only the first one.
      expect.soft(
        forms.map((f) => `${f.full} | ${f.compact}`).sort(),
        "the stub's longest mode must make production write the longest texts, full | compact",
      ).toEqual(LONGEST_TEXTS[interval].map(([full, compact]) => `${full} | ${compact}`).sort());
      expect.soft(judgeForms(forms), "A-7").toEqual([]);
      expect.soft(judgeMagnitude(facts), "A-1").toEqual([]);
      for (const family of FAMILIES) {
        const truth = servedTruth(family);
        const matching = facts.filter((f) => f.factKey === FACT_KEY[family]).map((f) => `${f.missing}/${f.expected}`);
        expect.soft(matching, `A-1 ${family}: the fact is the served magnitude`).toEqual([`${truth.missing}/${truth.expected}`]);
      }
      expect.soft(truncation.defects, "A-5").toEqual([]);
      expect.soft(judgeOneLine(lines), "A-6").toEqual([]);
      if (viewport.areaFloors !== null) expect.soft(judgeAreas(areas, viewport.areaFloors), "A-4").toEqual([]);
      // `B-1` F-3 at 1024 (and its counter-ablation at 1280) on the stub, so `make verify` sees it:
      // the stub serves the REAL catalog, so the provenance sentence is the real one.
      if (viewport.width === 1024 || viewport.width === 1280) {
        const provenance = await readOiProvenance(page);
        fact(SPEC, `gate_longest_oi_provenance_${viewport.name}${suffix}`, { ...provenance, blocks: await readOiLegendBlocks(page) });
        expect.soft(judgeOiProvenance(provenance, viewport.width === 1280), `F-3 ${viewport.name}`).toEqual([]);
      }
      // `B-1` F-2 — LAST, because the probe rewrites the numerals' width.
      if (viewport.width === 1024) {
        const row = await probeOhlcRow(page);
        fact(SPEC, `gate_longest_oi_ohlc_row_${viewport.name}${suffix}`, row);
        expect.soft(judgeOhlcRow(row), `F-2 ${viewport.name}`).toEqual([]);
      }
    });
  }
});

// ── REAL universe ───────────────────────────────────────────────────────────────────────────────

async function seriesWindowReaderPresent(apiBase: string): Promise<boolean> {
  const response = await fetch(`${apiBase}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") throw new Error("GET /ready did not publish store.path");
  return !storePath.endsWith(".sqlite3");
}

/** The ONE catalog entry of a family whose identity is unambiguous for `BTCUSDT` (volume, both
 * liquidation legs). CVD has four `cvd_source` rows for the symbol, and which one the page picked is
 * the selector's business (`cvd-series-selector.ts`): its fact is judged by A-1's own arithmetic only. */
function uniqueKey(catalog: CatalogEnvelope, family: Family): SeriesKey | null {
  const matches = catalog.entries.filter((entry) => {
    const key = entry.key;
    if (key.instrumentId !== SYMBOL || key.interval !== "1m") return false;
    if (family === "volume") return key.metric === "klines_volume";
    if (family === "liquidation_short") return key.metric === "sum_liquidation" && key.cohort === "short";
    if (family === "liquidation_long") return key.metric === "sum_liquidation" && key.cohort === "long";
    return false;
  });
  return matches.length === 1 ? matches[0].key : null;
}

async function apiTruth(apiBase: string, key: SeriesKey, interval: string, declared: DeclaredRequest) {
  const query = new URLSearchParams({
    series_key_id: computeSeriesKeyId(key),
    symbol: SYMBOL,
    interval,
    window_start_ms: String(declared.windowStartMs),
    window_end_ms: String(declared.windowEndMsInclusive),
    knowledge_time_ms: String(declared.knowledgeTimeMs),
    bar_policy: "final_only",
  });
  const response = await fetch(`${apiBase}/series-history?${query.toString()}`);
  if (!response.ok) throw new Error(`GET /series-history (${key.metric}) answered ${response.status}`);
  const body = (await response.json()) as { rows: readonly CoverageRowWire[] };
  return foldRows(body.rows, declared.knowledgeTimeMs);
}

test(`T-05.4 real data: A-1 against the API, A-4, A-5, A-6, A-7 in 5m/15m/1h/4h at 1280 and 1024, then C-3 by probe (${SPEC})`, async ({ page, baseURL }) => {
  test.setTimeout(900_000);
  const apiBase = sentimentoApiBaseUrl();
  const readerPresent = await seriesWindowReaderPresent(apiBase);
  fact(SPEC, "series_window_reader_present", readerPresent);
  test.skip(!readerPresent, "universo FRACO: sem leitor de janela de md.series, /series-history recusa (skip não é verde)");
  const catalog = (await (await fetch(`${apiBase}/series-catalog`)).json()) as CatalogEnvelope;

  for (const viewport of VIEWPORTS.filter((v) => v.areaFloors !== null)) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const interval of REAGGREGATED_TFS) {
      const at = `${interval}@${viewport.name}`;
      const declared = await openSymbol(page, baseURL ?? "", interval, `real-${interval}-${viewport.name}`);
      const facts = await readChipFacts(page);
      const ledgers = await readLedgers(page);
      const lines = await readChipLines(page);
      const areas = await readAreas(page);
      const truncation = await judgeTruncation(page);
      const forms = await readChipForms(page);
      fact(SPEC, `real_${interval}_${viewport.name}`, { declared, facts, ledgers, lines, areas, forms, truncation: truncation.readings });

      expect(judgeMagnitude(facts), `A-1 ${at}`).toEqual([]);
      for (const family of ["volume", "liquidation_short", "liquidation_long"] as const) {
        const key = uniqueKey(catalog, family);
        if (key === null) throw new Error(`the catalog has no unique ${family} entry for ${SYMBOL}`);
        const truth = await apiTruth(apiBase, key, interval, declared);
        const ledger = ledgers[FACT_KEY[family]];
        expect(ledger, `${at} ${family}: ledger`).toBeDefined();
        expect(
          { missing: ledger.missing, expected: ledger.expected, head: ledger.head },
          `A-1 ${at} ${family}: the page's coverage is the API's, on the page's own request`,
        ).toEqual(truth);
        const shown = facts.filter((f) => f.factKey === FACT_KEY[family]).map((f) => `${f.missing}/${f.expected}`);
        expect(shown, `A-1/A-2 ${at} ${family}: a chip iff something is missing outside the head`).toEqual(
          truth.missing >= 1 ? [`${truth.missing}/${truth.expected}`] : [],
        );
      }
      if (viewport.areaFloors !== null) expect.soft(judgeAreas(areas, viewport.areaFloors, interval), `A-4 ${at}`).toEqual([]);
      expect.soft(truncation.defects, `A-5 ${at}`).toEqual([]);
      expect.soft(judgeOneLine(lines), `A-6 ${at}`).toEqual([]);
      expect.soft(judgeForms(forms), `A-7 ${at}`).toEqual([]);
      // `B-1` F-3 on real data (and the counter-ablation at 1280).
      const provenance = await readOiProvenance(page);
      fact(SPEC, `real_oi_provenance_${interval}_${viewport.name}`, provenance);
      expect.soft(judgeOiProvenance(provenance, viewport.width === 1280), `F-3 ${at}`).toEqual([]);
    }
  }

  // `B-1` F-1 + F-3 in `1m` at 1024×768: the OI's fifth TF, which `REAGGREGATED_TFS` (the coverage
  // TFs — `1m` has no coverage) leaves out. Only the OI is judged here; A-1/A-5..A-7 are about chips.
  {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSymbol(page, baseURL ?? "", "1m", "real-1m-1024x768");
    const areas = await readAreas(page);
    const provenance = await readOiProvenance(page);
    fact(SPEC, "real_1m_1024x768", { areas, provenance });
    const oi = areas.filter((a) => a.testId === "oi-pane");
    expect.soft(
      judgeAreas(oi, "1024", "1m").filter((d) => d.startsWith("oi-pane")),
      "F-1 1m@1024x768",
    ).toEqual([]);
    expect.soft(judgeOiProvenance(provenance), "F-3 1m@1024x768").toEqual([]);
  }

  // C-3 on real data: the chips present are made to say the longest text — the full one in the full
  // form, the compact one in the compact form — then everything is re-read.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openSymbol(page, baseURL ?? "", "1h", `real-probe-${viewport.name}`);
    const probed = await page.evaluate(
      ({ liquidationText, singleText, liquidationCompact, singleCompact }) => {
        let n = 0;
        for (const chip of document.querySelectorAll<HTMLElement>("[data-coverage-chip]")) {
          const full = chip.querySelector<HTMLElement>('[data-coverage-visible="full"]');
          const compact = chip.querySelector<HTMLElement>('[data-coverage-visible="compact"]');
          if (full === null || compact === null) continue;
          const liquidation = chip.closest('[data-testid="liquidation-pane"]') !== null;
          full.textContent = liquidation ? liquidationText : singleText;
          compact.textContent = liquidation ? liquidationCompact : singleCompact;
          n += 1;
        }
        return n;
      },
      {
        liquidationText: LONGEST_LIQUIDATION_TEXT,
        singleText: LONGEST_SINGLE_TEXT,
        liquidationCompact: LONGEST_LIQUIDATION_COMPACT,
        singleCompact: LONGEST_SINGLE_COMPACT,
      },
    );
    fact(SPEC, `real_probe_${viewport.name}_chips`, probed);
    if (probed === 0) {
      // F-2 of the design: with T-05.2/T-05.3 live and re-populated, no chip exists to probe. The gate
      // universe above still renders the longest text through production code.
      continue;
    }
    await settleLayout(page);
    const lines = await readChipLines(page);
    const areas = await readAreas(page);
    const truncation = await judgeTruncation(page);
    const forms = await readChipForms(page);
    fact(SPEC, `real_probe_${viewport.name}`, { lines, areas, forms, truncation: truncation.readings });
    expect.soft(truncation.defects, `C-3 A-5 ${viewport.name}`).toEqual([]);
    expect.soft(judgeOneLine(lines), `C-3 A-6 ${viewport.name}`).toEqual([]);
    expect.soft(judgeForms(forms), `C-3 A-7 ${viewport.name}`).toEqual([]);
    if (viewport.areaFloors !== null) expect.soft(judgeAreas(areas, viewport.areaFloors, "1h"), `A-4 ${viewport.name}`).toEqual([]);
  }
});

/** `K-1` of `gates/T-05.4-design-critique-C3.md`: F-5 on the universe that exists. In `4h`, with real
 * data, on each of the four `PILOT_SYMBOLS` at 1240 and 1280: A-5 and A-7, with the legend width and
 * where each protected phrase ends written to `facts.jsonl`. A symbol whose `A-5` fails with the FULL
 * form painted sends the threshold back to the `ui-designer` (§10.7 F-5) — the threshold does not move
 * silently in code. */
test(`T-05.4 real data K-1: A-5 + A-7 in 4h on the four PILOT_SYMBOLS at 1240x800 and 1280x800 (${SPEC})`, async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  const apiBase = sentimentoApiBaseUrl();
  const readerPresent = await seriesWindowReaderPresent(apiBase);
  test.skip(!readerPresent, "universo FRACO: sem leitor de janela de md.series, /series-history recusa (skip não é verde)");
  for (const viewport of VIEWPORTS.filter((v) => v.width >= 1240)) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const symbol of PILOT_SYMBOLS) {
      const at = `${symbol} 4h@${viewport.name}`;
      await openSymbol(page, baseURL ?? "", "4h", `k1-${symbol}-${viewport.name}`, symbol);
      const truncation = await judgeTruncation(page);
      const forms = await readChipForms(page);
      const lines = await readChipLines(page);
      const scrollbarPx = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
      fact(SPEC, `real_k1_${symbol}_${viewport.name}`, { forms, lines, scrollbarPx, truncation: truncation.readings });
      expect.soft(truncation.defects, `K-1 A-5 ${at} (painted: ${forms.map((f) => f.painted.join("+")).join(", ")})`).toEqual([]);
      expect.soft(judgeForms(forms), `K-1 A-7 ${at}`).toEqual([]);
    }
  }
});
