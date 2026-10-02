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
 *     - `longest`   — `C-3`: the LONGEST text §2.4 can produce on a real window, in `1h` (7 d loaded):
 *                     short `6 d 23 h`, long `23 h 59 min`, two legs different over one denominator.
 *   Nothing is written to any database (memória `nao-seedar-teste-no-postgres-compartilhado`).
 *
 *   REAL — the app under test (`E2E_BASE_URL`) on the read API it was given
 *   (`E2E_SENTIMENTO_API_BASE_URL`). Skipped when the API has no window reader of `md.series` (the
 *   weak universe: `/series-history` refuses) — a skip is not a green. In `5m`/`15m`/`1h`/`4h`: A-1 on
 *   every chip present, cross-checked against the API on the page's own declared request; A-4; A-5;
 *   A-6. Then `C-3` on real data: the chips' visible text is swapped for the longest string (a probe,
 *   `page.evaluate`) and A-4/A-5/A-6 are read again after the host re-lays the scales.
 *
 * ⚠️ A-4 is asserted at 1280×800 only, because that is the viewport §3.2 declares its floors at. At
 * 1024×768 the areas are MEASURED and written to `facts.jsonl`, not judged: below ~1150 px the
 * liquidation legs wrap (§2.5, "4 linhas, ainda melhor que as 6 de hoje") and §3.2 sets no floor there.
 *
 * Production-code ablations (rebuild per mutation) are run by hand and recorded in
 * `docs/context/paineis-de-fluxo/gates/T-05.4-build.md`.
 */

import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

const SPEC = "40-coverage-magnitude-and-legend-room";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const ONE_MINUTE_MS = 60_000;
/** `COVERAGE_HEAD_GRACE_MS` of `coverage-magnitude.ts`, LITERAL on purpose: the spec judges the
 * production constant, it does not inherit it (the `GRACE = 0` ablation must not move this one). */
const HEAD_GRACE_MS = 600_000;
const INTERVAL_MS: Readonly<Record<string, number>> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
const REAGGREGATED_TFS = ["5m", "15m", "1h", "4h"] as const;

const VIEWPORTS = [
  { name: "1280x800", width: 1280, height: 800, judgesArea: true },
  { name: "1024x768", width: 1024, height: 768, judgesArea: false },
] as const;

/** §3.2 with `C-4` (non-regression floors = measured − 1 px): `[testid, floor px]`. */
const AREA_FLOORS: readonly (readonly [string, number])[] = [
  ["price-pane", 220],
  ["liquidation-pane", 140],
  ["oi-pane", 71],
  ["long-short-pane", 36.6],
  ["cvd-pane", 40],
];
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
      // 1h, 168 rows × 60: short loses 167 whole buckets (10 020 min → "6 d 23 h", 99.4%); the
      // others lose 1 439 min ("23 h 59 min", 14.3%): 23 whole buckets plus 59 of the 24th.
      const target = family === "liquidation_short" ? 167 * perBucket : 23 * perBucket + (perBucket - 1);
      const before = index * perBucket;
      return Math.max(0, Math.min(perBucket, target - before));
    }
  }
}

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
    }
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
        oi_candles: null,
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

async function openSymbol(page: Page, baseUrl: string, interval: string, cacheBuster: string): Promise<DeclaredRequest> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}?interval=${interval}&e2eCoverage=${cacheBuster}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} did not answer ok`).toBe(true);
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
        chipText: chip?.querySelector("[data-coverage-visible]")?.textContent ?? "NO CHIP",
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

/** A-4 (§3.2 with `C-4`). */
function judgeAreas(areas: readonly PaneArea[]): string[] {
  const defects: string[] = [];
  for (const [testId, floor] of AREA_FLOORS) {
    const area = areas.find((a) => a.testId === testId);
    if (area === undefined || !Number.isFinite(area.areaPx)) {
      defects.push(`${testId}: area not published`);
      continue;
    }
    if (area.areaPx < floor) defects.push(`${testId}: data area ${area.areaPx.toFixed(2)} px < ${floor} px`);
    if (testId === "liquidation-pane" && area.areaPx < LIQUIDATION_AREA_SHARE_FLOOR * area.paneHeightPx) {
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
        text: chip.querySelector("[data-coverage-visible]")?.textContent ?? "",
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

  for (const viewport of VIEWPORTS) {
    test(`C-3 at ${viewport.name}: the longest text (1h, two legs different) — A-1, A-5, A-6${viewport.judgesArea ? ", A-4 (C-4)" : " (A-4 measured, not judged)"}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      stub!.mode = "longest";
      await openSymbol(page, instance!.baseUrl, "1h", `longest-${viewport.name}`);
      const facts = await readChipFacts(page);
      const lines = await readChipLines(page);
      const areas = await readAreas(page);
      const truncation = await judgeTruncation(page);
      fact(SPEC, `gate_longest_${viewport.name}`, { facts, lines, areas, truncation: truncation.readings });

      // The case IS the longest string: production wrote exactly what C-3 asked to measure.
      const texts = lines.map((l) => l.text).sort();
      // `expect.soft` from here on: an ablation must show EVERY assert it breaks, not only the first one.
      expect.soft(texts, "the stub's longest mode must make production write the longest texts").toEqual(
        [LONGEST_LIQUIDATION_TEXT, LONGEST_SINGLE_TEXT, LONGEST_SINGLE_TEXT].sort(),
      );
      expect.soft(judgeMagnitude(facts), "A-1").toEqual([]);
      for (const family of FAMILIES) {
        const truth = servedTruth(family);
        const matching = facts.filter((f) => f.factKey === FACT_KEY[family]).map((f) => `${f.missing}/${f.expected}`);
        expect.soft(matching, `A-1 ${family}: the fact is the served magnitude`).toEqual([`${truth.missing}/${truth.expected}`]);
      }
      expect.soft(truncation.defects, "A-5").toEqual([]);
      expect.soft(judgeOneLine(lines), "A-6").toEqual([]);
      if (viewport.judgesArea) expect.soft(judgeAreas(areas), "A-4").toEqual([]);
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

test(`T-05.4 real data: A-1 against the API, A-4, A-5, A-6 in 5m/15m/1h/4h, then C-3 by probe (${SPEC})`, async ({ page, baseURL }) => {
  test.setTimeout(400_000);
  const apiBase = sentimentoApiBaseUrl();
  const readerPresent = await seriesWindowReaderPresent(apiBase);
  fact(SPEC, "series_window_reader_present", readerPresent);
  test.skip(!readerPresent, "universo FRACO: sem leitor de janela de md.series, /series-history recusa (skip não é verde)");
  const catalog = (await (await fetch(`${apiBase}/series-catalog`)).json()) as CatalogEnvelope;
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const interval of REAGGREGATED_TFS) {
    const declared = await openSymbol(page, baseURL ?? "", interval, `real-${interval}`);
    const facts = await readChipFacts(page);
    const ledgers = await readLedgers(page);
    const lines = await readChipLines(page);
    const areas = await readAreas(page);
    const truncation = await judgeTruncation(page);
    fact(SPEC, `real_${interval}`, { declared, facts, ledgers, lines, areas, truncation: truncation.readings });

    expect(judgeMagnitude(facts), `A-1 ${interval}`).toEqual([]);
    for (const family of ["volume", "liquidation_short", "liquidation_long"] as const) {
      const key = uniqueKey(catalog, family);
      if (key === null) throw new Error(`the catalog has no unique ${family} entry for ${SYMBOL}`);
      const truth = await apiTruth(apiBase, key, interval, declared);
      const ledger = ledgers[FACT_KEY[family]];
      expect(ledger, `${interval} ${family}: ledger`).toBeDefined();
      expect(
        { missing: ledger.missing, expected: ledger.expected, head: ledger.head },
        `A-1 ${interval} ${family}: the page's coverage is the API's, on the page's own request`,
      ).toEqual(truth);
      const shown = facts.filter((f) => f.factKey === FACT_KEY[family]).map((f) => `${f.missing}/${f.expected}`);
      expect(shown, `A-1/A-2 ${interval} ${family}: a chip iff something is missing outside the head`).toEqual(
        truth.missing >= 1 ? [`${truth.missing}/${truth.expected}`] : [],
      );
    }
    expect.soft(judgeAreas(areas), `A-4 ${interval}`).toEqual([]);
    expect.soft(truncation.defects, `A-5 ${interval}`).toEqual([]);
    expect.soft(judgeOneLine(lines), `A-6 ${interval}`).toEqual([]);
  }

  // C-3 on real data: the chips present are made to say the longest text, then everything is re-read.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openSymbol(page, baseURL ?? "", "1h", `real-probe-${viewport.name}`);
    const probed = await page.evaluate(
      ({ liquidationText, singleText }) => {
        let n = 0;
        for (const chip of document.querySelectorAll<HTMLElement>("[data-coverage-chip]")) {
          const visible = chip.querySelector("[data-coverage-visible]");
          if (visible === null) continue;
          visible.textContent = chip.closest('[data-testid="liquidation-pane"]') !== null ? liquidationText : singleText;
          n += 1;
        }
        return n;
      },
      { liquidationText: LONGEST_LIQUIDATION_TEXT, singleText: LONGEST_SINGLE_TEXT },
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
    fact(SPEC, `real_probe_${viewport.name}`, { lines, areas, truncation: truncation.readings });
    expect.soft(truncation.defects, `C-3 A-5 ${viewport.name}`).toEqual([]);
    expect.soft(judgeOneLine(lines), `C-3 A-6 ${viewport.name}`).toEqual([]);
    if (viewport.judgesArea) expect.soft(judgeAreas(areas), `C-4 A-4 ${viewport.name}`).toEqual([]);
  }
});
