import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/view-model.ts";
// Imported from `s2-panels.ts` DIRECTLY, not the `charts/index.ts` barrel: the barrel also
// re-exports `runHeadlessChart` (`s2-headless-run.ts`), which pulls in `jsdom` at module-eval
// time — fine for the app/build, but `jsdom`'s ESM/CJS interop breaks under Playwright's own
// module loader in this environment ("module is not linked", `html-encoding-sniffer`). Going
// straight to the source module these four constants live in avoids the barrel's wider
// evaluation graph entirely.
import { RANGE_END_MS_EXCLUSIVE, RANGE_START_MS, S2_PRICE_USE, SYMBOL } from "../src/charts/s2-panels.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact } from "./helpers.ts";

/**
 * `T-04.3` (`SPEC-006` plan `04`, `CA-F4-3`) — the falsifier this fase exists for.
 *
 * `01`/`02`'s own gates measured `rc=0`/`200` only against a `TestClient`/fixture, never the
 * REAL composed app (`docs/context/pagina-de-grafico-s2/handoff/T-04.md`) — that is exactly how
 * `GET /series-history` shipped `500`/`NotImplementedError` in production while every prior
 * gate stayed green. This spec closes that gap the SAME way: real `docker compose` stack
 * (`deploy-web-1`/`deploy-api-1`/`deploy-postgres-1`), real Postgres, and an assertion of a
 * NUMBER in the DOM — not merely the absence of a `500`, which is the exact under-specification
 * that let the bug through once already.
 *
 * `/symbol` reads a FIXED historical window (`RANGE_START_MS`..`RANGE_END_MS_EXCLUSIVE`,
 * `charts/s2-panels.ts`) that no collector this repository runs today has ever populated for
 * `klines_last`/`sum_open_interest` (`docs/context/pagina-de-grafico-s2/handoff/T-04.md`: "hoje
 * não existe coletor real de klines/OI escrito, só o poll de premiumIndex") — so this spec
 * seeds ONE real row per panel directly into `md.series` (the exact table
 * `PostgresSeriesWindowReader` reads, `T-04.1`) before asserting, the same way
 * `backend/tests/main/test_create_app_wires_series_window_reader.py` seeds its own MORDE case.
 * This is not a fixture standing in for the backend: the row lands in the SAME Postgres the
 * `api` container reads from, through `docker exec ... psql`, and `/series-history` computes
 * every number the DOM ends up showing from it — no shortcut through `page.route`/mocking.
 */

const SPEC = "08-symbol-dado-real";
const SYMBOL_PATH = "/symbol";

const API_BASE_URL = process.env.E2E_SENTIMENTO_API_BASE_URL ?? "http://localhost:8000/api/v1";
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? "deploy-postgres-1";
const POSTGRES_DB = process.env.E2E_POSTGRES_DB ?? "cripto_strategy";
const POSTGRES_USER = process.env.E2E_POSTGRES_USER ?? "cripto_strategy";

const PRICE_VALUE_RAW = "65432.5";
const OI_VALUE_RAW = "543210.75";
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
/** The window's own last 1-minute grid instant — the ONE instant `SymbolClient.tsx`'s "leitura
 * atual" readouts query (`LAST_INSTANT_MS`, mirrored here rather than imported: that constant
 * lives in a client component module this Node-side test setup should not import). Price's
 * native grid IS 1 minute, so seeding exactly here makes `resolveStockReading` return `"exact"`. */
const LAST_INSTANT_MS = RANGE_END_MS_EXCLUSIVE - ONE_MINUTE_MS;
const PRICE_BUCKET_END_MS = LAST_INSTANT_MS;
/** OI's native grid is 5 minutes (`FIVE_MINUTES_MS`, `s2-panels.ts::buildOiPanel`) and
 * `resolveStockReading` holds back AT MOST one native bucket-width (§5.11) — so the seeded row
 * has to land on the 5-minute-aligned instant AT OR BEFORE `LAST_INSTANT_MS`, the same floor
 * `alignToTimeframeStart` computes, or the "leitura atual" readout stays `"absent"` even with a
 * real row sitting one grid step too early. */
const OI_BUCKET_END_MS = Math.floor(LAST_INSTANT_MS / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly priceUse: string | null;
}

let dockerAvailable = true;
try {
  execFileSync("docker", ["--version"], { stdio: "ignore" });
} catch {
  dockerAvailable = false;
}

test.skip(!dockerAvailable, "docker not on PATH — this spec needs the real compose stack");

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetch(`${API_BASE_URL}/series-catalog`);
  if (!response.ok) {
    throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { entries: readonly CatalogEntryWire[] };
  return body.entries;
}

function findEntry(
  entries: readonly CatalogEntryWire[],
  predicate: (entry: CatalogEntryWire) => boolean,
): CatalogEntryWire {
  const entry = entries.find((candidate) => candidate.key.instrumentId === SYMBOL && predicate(candidate));
  if (entry === undefined) {
    throw new Error(`no BTCUSDT catalog entry matched the predicate — catalog drifted?`);
  }
  return entry;
}

/** Escapes a value for a single-quoted SQL literal — every value here is one of this file's
 * own constants (never user input), so this only needs to survive the one apostrophe risk. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function seedSeriesRow(args: {
  readonly seriesKeyId: string;
  readonly source: string;
  readonly valueRaw: string;
  readonly srcLabelRaw: string;
  readonly bucketEndMs: number;
}): void {
  const sql = `
    INSERT INTO md.series (
      series_key_id, symbol, source, bucket_end, event_time, available_at,
      availability_source, ingested_at, observed_at, provenance, src_label_raw,
      observer_id, observer_region, is_final, principal_id, value_raw
    ) VALUES (
      ${sqlString(args.seriesKeyId)}, ${sqlString(SYMBOL)}, ${sqlString(args.source)},
      ${args.bucketEndMs}, ${args.bucketEndMs}, ${args.bucketEndMs},
      'OBSERVED', ${args.bucketEndMs}, ${args.bucketEndMs},
      'OBSERVADO', ${sqlString(args.srcLabelRaw)}, 'e2e-seed', 'unknown', true, NULL,
      ${sqlString(args.valueRaw)}
    )
    ON CONFLICT (series_key_id, symbol, source, bucket_end, observed_at) DO NOTHING;
  `;
  execFileSync(
    "docker",
    ["exec", "-i", POSTGRES_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", POSTGRES_USER, "-d", POSTGRES_DB, "-c", sql],
    { stdio: "pipe" },
  );
}

interface HistoryRow {
  readonly event_time: number;
  readonly value: string | null;
  readonly absence: string | null;
}

async function fetchSeriesHistory(seriesKeyId: string): Promise<{ readonly status: number; readonly rows: readonly HistoryRow[] }> {
  const query = new URLSearchParams({
    series_key_id: seriesKeyId,
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: String(RANGE_START_MS),
    window_end_ms: String(LAST_INSTANT_MS),
    knowledge_time_ms: String(RANGE_END_MS_EXCLUSIVE),
    bar_policy: "final_only",
  });
  const response = await fetch(`${API_BASE_URL}/series-history?${query.toString()}`);
  const body = (await response.json()) as { rows?: readonly HistoryRow[] };
  return { status: response.status, rows: body.rows ?? [] };
}

let priceSeriesKeyId: string;
let oiSeriesKeyId: string;

test.beforeAll(async () => {
  const entries = await fetchCatalogEntries();
  const priceEntry = findEntry(entries, (entry) => entry.priceUse === S2_PRICE_USE);
  const oiEntry = findEntry(entries, (entry) => entry.key.metric === "sum_open_interest");
  priceSeriesKeyId = computeSeriesKeyId(priceEntry.key);
  oiSeriesKeyId = computeSeriesKeyId(oiEntry.key);

  seedSeriesRow({
    seriesKeyId: priceSeriesKeyId,
    source: priceEntry.key.provider,
    valueRaw: PRICE_VALUE_RAW,
    srcLabelRaw: "klines",
    bucketEndMs: PRICE_BUCKET_END_MS,
  });
  seedSeriesRow({
    seriesKeyId: oiSeriesKeyId,
    source: oiEntry.key.provider,
    valueRaw: OI_VALUE_RAW,
    srcLabelRaw: "sumOpenInterest",
    bucketEndMs: OI_BUCKET_END_MS,
  });
});

// `CA-F4-1`'s falsifier, restated for the EXACT query `/symbol` issues for Preço: `500` here is
// the regression this whole fase exists to catch, and it is checked independently of the DOM
// (the browser never sees this request — `page.tsx` is a Server Component, `ADR-028/D1`) so a
// server-side-only regression still fails this spec even if a stale client bundle hid it.
//
// `rows.length > 0` alone is NOT the falsifier: `build_series_history_report` walks every
// 1-minute grid instant across the WHOLE requested window and returns one row per instant
// regardless of data (`absence` filled for a gap) — for `/symbol`'s own multi-day window that
// is thousands of rows even with ZERO real data, so a length check alone would pass on the
// pre-fix `500` bug's sibling failure mode (200, all absent) just as easily as on real data.
// The row with a non-null `value` is the one this fase's fix is actually responsible for.
test(`GET /series-history responde 200 com um valor real para o series_key_id de Preço (${SPEC})`, async () => {
  const { status, rows } = await fetchSeriesHistory(priceSeriesKeyId);
  const withValue = rows.filter((row) => row.value !== null);
  fact(SPEC, "price_series_history_status", status);
  fact(SPEC, "price_series_history_rows", rows.length);
  fact(SPEC, "price_series_history_rows_with_value", withValue.length);
  expect(status).toBe(200);
  expect(rows.length).toBeGreaterThan(0);
  expect(withValue.length).toBeGreaterThan(0);
  expect(withValue.some((row) => row.value === PRICE_VALUE_RAW)).toBe(true);
});

test(`/symbol mostra valor numérico real (não a string de ausência) em Preço e OI (${SPEC})`, async ({ page }) => {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const priceAbsence = page.locator('section[aria-label="Preço"] [data-fact^="panel_absent:"]');
  await expect(priceAbsence, "Preço não pode mostrar o banner de ausência com dado real seeded").toHaveCount(0);

  const priceReading = page.locator('section[aria-label="Preço"] [data-fact^="price_last_reading:"]');
  const priceReadingFact = await priceReading.getAttribute("data-fact");
  fact(SPEC, "price_last_reading_fact", priceReadingFact);
  expect(priceReadingFact).not.toBeNull();
  expect(priceReadingFact).not.toContain("absent");
  const priceReadingText = (await priceReading.textContent())?.trim() ?? "";
  fact(SPEC, "price_last_reading_text", priceReadingText);
  expect(priceReadingText).not.toContain("SEM_PONTO");
  expect(priceReadingText).toMatch(/[0-9]/);
  // The degenerate candle's close (`view-model.ts`'s "honest degenerate candle") is the raw
  // value seeded above, verbatim — the falsifier this test would catch if the wiring silently
  // fed the wrong row: any OTHER number here proves a mismatch between what was seeded and
  // what `/series-history` actually returned for THIS `series_key_id`.
  expect(priceReadingText).toContain(PRICE_VALUE_RAW);

  const oiAbsence = page.locator('section[aria-label="Open Interest"] [data-fact^="panel_absent:"]');
  await expect(oiAbsence, "OI não pode mostrar o banner de ausência com dado real seeded").toHaveCount(0);

  const oiReading = page.locator('section[aria-label="Open Interest"] [data-fact^="oi_last_reading:"]');
  const oiReadingFact = await oiReading.getAttribute("data-fact");
  fact(SPEC, "oi_last_reading_fact", oiReadingFact);
  expect(oiReadingFact).not.toBeNull();
  expect(oiReadingFact).not.toContain("absent");
  const oiReadingText = (await oiReading.textContent())?.trim() ?? "";
  fact(SPEC, "oi_last_reading_text", oiReadingText);
  expect(oiReadingText).not.toContain("SEM_PONTO");
  expect(oiReadingText).toMatch(/[0-9]/);
  expect(oiReadingText).toContain(OI_VALUE_RAW);
});
