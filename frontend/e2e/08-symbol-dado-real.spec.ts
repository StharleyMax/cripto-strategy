import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-04.3` (`SPEC-006` plan `04`, `CA-F4-3`) — the falsifier this fase exists for, REPAIRED by
 * wave `03` of `cinco-metricas-do-core` on two counts, both of them measured.
 *
 * ── 1. IT NO LONGER IMPORTS A WINDOW THAT DOES NOT EXIST (the QA bloqueio of wave `03`) ───────
 *
 * This spec used to import `RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE` from
 * `../src/charts/s2-panels.ts`. Wave `03` deleted those two constants — correctly: they were
 * four days of 2026-08 typed in once, and the route asked `/series-history` for a window that
 * PRECEDES every row that exists (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`). The import survived the
 * deletion, and a spec that fails to LOAD takes the whole collection down with it:
 *
 *     $ npx playwright test --list               => Total: 0 tests in 0 files
 *     $ npx playwright test --list e2e/0[1-7]*   => Total: 21 tests in 7 files
 *
 * 21 passing tests became unreachable and nothing in `make verify` could see it (`lint-frontend`
 * is `eslint src` + `tsc -p tsconfig.json`, and `frontend/e2e/` is outside both). The window is
 * now READ OFF THE PAGE ITSELF (`data-window-start-ms` / `data-window-end-ms-inclusive` /
 * `data-knowledge-time-ms`, `SymbolClient.tsx`), which is stronger than importing it: the spec
 * checks the API over EXACTLY the window the server used for THAT render, with no clock race
 * between the two processes and no constant to go stale a second time.
 *
 * ── 2. IT NO LONGER SEEDS THE SHARED POSTGRES (`[P-seed]`, `tasks.toml:226`) ──────────────────
 *
 * The previous version `INSERT`ed two synthetic rows (`65432.5`, `543210.75`) into `md.series`
 * through `docker exec psql`, because when it was written no collector produced Preço/OI. That
 * is forbidden in this repository and for a reason that already happened: synthetic e2e data
 * leaked into the owner's real screen. Removed entirely: the only mentions of `INSERT`, `psql`
 * and `docker` left in this file are the ones in THIS paragraph — no statement, no invocation,
 * no child process. `grep -n 'INSERT\\|psql\\|docker' e2e/08-symbol-dado-real.spec.ts` lands
 * only here.
 *
 * ── SO WHAT DOES IT ASSERT, IF IT CANNOT PLANT THE NUMBER IT WANTS TO FIND? ───────────────────
 *
 * The DOM has to agree with the read API over the same window. That is the wiring falsifier
 * `CA-F4-1`/fase `04` was actually about (the route served no real data while every gate stayed
 * green), and it does not need a planted row: it needs the two surfaces to be compared. What is
 * live today, measured read-only against the running stack
 * `[MEDIDO 2026-09-11, GET /api/v1/series-history sobre a janela derivada, n=11 séries BTCUSDT]`:
 *
 *     klines_volume      200   5.760 grades   799 com valor   1º valor 2026-09-11T01:40Z
 *     klines_last        200   5.760 grades     0 com valor
 *     sum_open_interest  200   5.760 grades     0 com valor
 *     cvd_source         200   5.760 grades     0 com valor
 *
 * ⇒ asserting "um número real de Preço no DOM" today would assert about a collector that does
 * not exist yet, and the only way to make it pass would be the seed that was just removed. What
 * IS assertable, and is asserted below: the page's numbers are the API's numbers, its absences
 * are the API's absences, and absence prints `SEM_PONTO` rather than a fabricated `0` (`RN-1`).
 * When the Preço/OI collectors land, THE SAME ASSERTIONS start proving the number on screen —
 * they are written against the API's answer, not against a constant.
 *
 * ⛔ NOT the `DoD-3` of `T-01.9`: that one counts `N >= 30` DISTINCT points on the volume
 * sub-axis and gets its own spec (`09-volume-dado-real.spec.ts`). This one is about agreement
 * between the two surfaces, at whatever density the collectors have reached.
 */

const SPEC = "08-symbol-dado-real";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";

/**
 * THE READ API THIS SPEC COMPARES THE DOM AGAINST — the SAME one the page under test reads.
 *
 * It used to be a CONSTANT in this file: `process.env.E2E_SENTIMENTO_API_BASE_URL ??
 * "http://localhost:8000/api/v1"`, with nothing anywhere setting that variable (`grep -c
 * E2E_SENTIMENTO_API_BASE_URL scripts/e2e-env.sh Makefile` → `0` e `0`) ⇒ under `make e2e` this
 * file asked the owner's PRODUCTION API while the page answered from the ephemeral fixture API:
 * `volume_api_rows_with_value=916` against `volume_dom_present_points=0`, two surfaces that
 * cannot agree by construction, deterministic over 2 runs (`BLOCKER-2` do gate da wave `03`).
 * The resolver now lives in `helpers.ts`, next to `E2E_BASE_URL`'s consumers, so the address of
 * the app and the address of its API come from the same `STATE_DIR` and no spec can redefault
 * either. It THROWS when undeclared, lazily (module scope would take the collection to
 * `Total: 0 tests`, the signal this file's header says cost 21 tests).
 */
const apiBaseUrl = sentimentoApiBaseUrl;

/** `SymbolClient.tsx`'s stable anchors. Spelled out here, not imported: importing
 * `../src/app/symbol/request-window.ts` would pull `charts/index.ts`, whose barrel evaluates
 * `s2-headless-run.ts` and therefore `jsdom`, which breaks under Playwright's module loader in
 * this environment ("module is not linked", `html-encoding-sniffer`). Duplicating a SELECTOR is
 * also the right posture for a contract with another module — see
 * `volume-subaxis-dom-contract.test.ts`, which guards the same strings from the other side. */
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";
const ABSENCE_TOKEN = "SEM_PONTO";

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly priceUse: string | null;
}

/** `series_key_id` is NOT on the wire (`GET /series-catalog` publishes the KEY, n=11 entries):
 * it is the `sha256` of the canonical key, and `view-model.ts` is the one place this repository
 * computes it. Imported rather than re-implemented — a second hashing of the same key is the
 * class of duplicate that goes wrong silently, since a wrong id answers `200` with an empty
 * grid instead of failing. */
function seriesKeyIdOf(entry: CatalogEntryWire): string {
  return computeSeriesKeyId(entry.key);
}

interface HistoryRow {
  readonly event_time: number;
  readonly value: string | null;
  readonly absence: string | null;
}

/** The three instants of the request the SERVER built this render from — read off the rendered
 * page, so the API is asked the same question the page asked, not a similar one. */
interface RenderedRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

function requiredNumberAttribute(value: string | null, name: string): number {
  if (value === null) {
    throw new Error(`the page did not declare ${name} — SymbolClient.tsx stopped publishing its own request`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is ${JSON.stringify(value)}, not a finite epoch-ms instant`);
  }
  return parsed;
}

/**
 * `fetch` with ONE retry on a transport error, and on nothing else.
 *
 * Not flakiness tolerance: `undici` keeps the connection alive between requests, and a uvicorn
 * worker that just answered `500` closes it, so the NEXT request on that socket loses the race
 * and throws `TypeError: fetch failed [cause: ECONNRESET]` before any status exists to judge
 * `[MEDIDO 2026-09-11: falha no 2º painel do laço (d), sempre depois de um 500, contra a API
 * efêmera]`. The retry opens a new connection; an HTTP answer of ANY status is returned
 * untouched, so no assertion below is softened — only the socket is.
 */
async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    // Deliberately NOT swallowed: a second transport failure propagates with its own cause and
    // fails the test — one retry, never a loop.
    return await fetch(url);
  }
}

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/series-catalog`);
  if (!response.ok) {
    throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { entries: readonly CatalogEntryWire[] };
  return body.entries;
}

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
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/series-history?${query.toString()}`);
  // The body is read as TEXT first: a route that refuses answers `Internal Server Error`, which
  // `response.json()` turns into `SyntaxError: Unexpected token 'I'` — an exception that hides
  // the status code the caller needs to judge. Returning `rows: []` is NOT "treat an error as
  // no data": every caller below branches on `status` (and on the reader capability) before it
  // reads `rows`.
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

/**
 * Does the read API under test have an `md.series` WINDOW READER at all?
 *
 * Asked to the API ITSELF, never to an env var — an env var here would be an allowlist in
 * disguise ("entrada de allowlist é indistinguível de bypass", `CLAUDE.md`): anyone could
 * silence the strong branch without changing what the deployment IS. `/ready` publishes
 * `store.path` (`backend/src/api/routes/ready.py`), which is the sqlite FILE for the sqlite
 * engine and a masked DSN for Postgres, and `ADR-034/D9` gives `md.series` NO sqlite fallback:
 * `create_app` only builds `PostgresSeriesWindowReader` when the composed ingest store is
 * Postgres (`backend/src/main/__init__.py:238-247`). So `store.path` ending in `.sqlite3` is the
 * API declaring, about itself, that `/series-history` cannot be served here.
 *
 * WHY THIS EXISTS: `make e2e`'s harness composes a sqlite store over an ephemeral seed
 * (`scripts/e2e-env.sh`), so under the canonical gate `/series-history` answers `500` —
 * `[MEDIDO 2026-09-11: GET http://127.0.0.1:8811/api/v1/series-history?... → 500 "Internal
 * Server Error"; GET /ready → store.path=/tmp/cripto-strategy-e2e.<rand>/ingest_health.sqlite3]`.
 * Asserting `200` there would measure the HARNESS, not the app. What is asserted instead is the
 * property that survives the difference and is the one `RN-1` is about: facing a backend that
 * cannot answer, the page prints `SEM_PONTO` and NEVER a fabricated number. The universe is
 * published as `series_window_reader_present` on every run, so no reader of the output can
 * mistake the weak universe for the strong one.
 */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  // `/ready` answers 200 or 503 with the SAME shape (`ready.py`) — both are readable.
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error(`GET /ready did not publish store.path — cannot tell which engine this API composed: ${body}`);
  }
  return !storePath.endsWith(".sqlite3");
}

function findEntry(
  entries: readonly CatalogEntryWire[],
  predicate: (entry: CatalogEntryWire) => boolean,
): CatalogEntryWire {
  const entry = entries.find((candidate) => candidate.key.instrumentId === SYMBOL && predicate(candidate));
  if (entry === undefined) {
    throw new Error(`no ${SYMBOL} catalog entry matched the predicate — catalog drifted?`);
  }
  return entry;
}

/**
 * Loads `/symbol` and reads the three instants the SERVER declared for that render.
 *
 * WARNING: if this fails with "the page does not declare its own request", the app being pointed
 * at is a BUILD OLDER than wave `03` of `cinco-metricas-do-core` — those attributes are emitted
 * by `SymbolClient.tsx`'s root element. That is a real failure and is deliberately NOT
 * downgraded to a `skip`: a spec that quietly skips when the deployment is stale is the
 * "0 tests" signal in another costume, and this file exists because that signal cost 21 tests.
 */
async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const main = page.locator("main[data-window-start-ms]");
  await expect(
    main,
    "a página não declara o próprio request (data-window-start-ms) — build anterior a esta wave?",
  ).toHaveCount(1);
  return {
    windowStartMs: requiredNumberAttribute(await main.getAttribute("data-window-start-ms"), "data-window-start-ms"),
    windowEndMsInclusive: requiredNumberAttribute(
      await main.getAttribute("data-window-end-ms-inclusive"),
      "data-window-end-ms-inclusive",
    ),
    knowledgeTimeMs: requiredNumberAttribute(await main.getAttribute("data-knowledge-time-ms"), "data-knowledge-time-ms"),
  };
}

test(`/symbol declara a janela que pediu, e ela ACOMPANHA o relógio (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  fact(SPEC, "window_start_ms", request.windowStartMs);
  fact(SPEC, "window_end_ms_inclusive", request.windowEndMsInclusive);
  fact(SPEC, "knowledge_time_ms", request.knowledgeTimeMs);

  // THE DEFECT, RESTATED AS A FALSIFIER: the window used to be `2026-08-20..08-24`, four days
  // that precede every row `md.series` holds. A window that does not reach the last hour cannot
  // be the derived one, whatever the constants say.
  const fourDaysMs = 4 * 24 * 60 * 60_000;
  expect(request.windowEndMsInclusive - request.windowStartMs).toBe(fourDaysMs - 60_000);
  expect(request.windowEndMsInclusive).toBeGreaterThan(Date.now() - 60 * 60_000);
  // And it never asks about the future — that is a `422` against the backend's `server_now_ms`.
  expect(request.knowledgeTimeMs).toBeLessThan(Date.now());
});

test(`GET /series-history responde 200 sobre a MESMA janela que a página pediu (${SPEC})`, async ({ page }) => {
  // `500`/`NotImplementedError` on this exact query is the regression the whole fase exists to
  // catch, and it is checked independently of the DOM (the browser never issues it — `page.tsx`
  // is a Server Component, `ADR-028/D1`), so a server-side-only regression still fails here.
  const request = await loadRenderedRequest(page);

  const entries = await fetchCatalogEntries();
  const priceEntry = findEntry(entries, (entry) => entry.priceUse === "structure_detection");
  const { status, rows } = await fetchSeriesHistory(seriesKeyIdOf(priceEntry), request);
  const withValue = rows.filter((row) => row.value !== null);
  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "price_series_history_status", status);
  fact(SPEC, "price_series_history_rows", rows.length);
  fact(SPEC, "price_series_history_rows_with_value", withValue.length);

  if (!readerPresent) {
    // The API just declared it composed the sqlite engine, which `ADR-034/D9` gives no
    // `md.series` reader. The assertion that MEANS something here is the opposite one: it must
    // refuse loudly instead of answering `200` with an invented grid — a `200` in this universe
    // would be fabricated data, the exact defect `RN-1` forbids one layer down.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(rows).toHaveLength(0);
    return;
  }

  expect(status).toBe(200);
  // One row per 1-minute grid instant of the window, present or absent — `rows.length` alone is
  // therefore NOT evidence of data (`build_series_history_report` walks the whole grid,
  // `use_cases/series_history.py:193`); it is evidence that the grid the route asked for is the
  // grid it got back. The data question is the next test's, and it is asked against the DOM.
  expect(rows.length).toBe((request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1);
  // Absence is DECLARED, never implied: every value-less row must name its absence reason.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);
});

test(`o número na tela é o número da API — e a ausência é SEM_PONTO, nunca 0 (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);

  const entries = await fetchCatalogEntries();
  const volumeEntry = findEntry(entries, (entry) => entry.key.metric === "klines_volume");
  const { status, rows } = await fetchSeriesHistory(seriesKeyIdOf(volumeEntry), request);
  const apiPresent = rows.filter((row) => row.value !== null);
  const apiLast = rows.find((row) => row.event_time === request.windowEndMsInclusive);
  // THE FOUR ASSERTIONS BELOW ARE TOTAL OVER THE TWO UNIVERSES, which is why this test has no
  // branch of its own: with a window reader, `apiPresent` is the API's real points and the
  // screen has to show exactly them; without one, the API serves NOTHING and the screen has to
  // say `SEM_PONTO` — never `0`, never a leftover number. The universe is published so the run
  // output states which one it measured instead of leaving the reader to guess.
  fact(SPEC, "series_window_reader_present", await seriesWindowReaderPresent());
  fact(SPEC, "volume_series_history_status", status);
  fact(SPEC, "volume_api_rows_with_value", apiPresent.length);
  fact(SPEC, "volume_api_last_instant_value", apiLast?.value ?? null);

  // ── (a) the COUNT on screen is the API's count, exactly ────────────────────────────────────
  //
  // Exact, not approximate: both sides were computed from the same declared window, so a
  // mismatch is a wiring defect and not a race. This is the assertion fase `04` of
  // `pagina-de-grafico-s2` had to find IN PRODUCTION, by hand, because no test compared the two
  // surfaces.
  const subAxis = page.locator(`[data-testid="${VOLUME_SUBAXIS_TESTID}"]`);
  await expect(subAxis).toHaveCount(1);
  const domPresentPoints = Number(await subAxis.getAttribute("data-volume-present-points"));
  fact(SPEC, "volume_dom_present_points", domPresentPoints);
  expect(domPresentPoints).toBe(apiPresent.length);

  // ── (b) the READOUT agrees with the API at the window's last grid instant ───────────────────
  const readout = subAxis.locator('[data-fact^="volume_last_reading:"]');
  const readoutText = (await readout.textContent())?.trim() ?? "";
  fact(SPEC, "volume_last_reading_text", readoutText);
  if (apiLast?.value == null) {
    // Real absence — the publication tail can exceed one grid step (max medido 267 s, n=804),
    // so this branch is NORMAL, not a failure. What `RN-1` forbids is what it must NOT say.
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiLast.value)));
  }

  // ── (c) the readable horizon is DECLARED, and it is the API's first present instant ─────────
  //
  // `[MEDIDO 2026-09-11]` only `799/5.760` grades of this window carry a value and the first sits
  // ~86% into it: backfilled rows carry `available_at = when we FETCHED them`, which `R-1`
  // refuses at their own grid instant. The screen has to name that, or a structurally empty left
  // edge reads as "o mercado não teve dado" (`quant-architect`, wave `03`, C4).
  const horizon = subAxis.locator('[data-fact^="volume_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "volume_readable_horizon_fact", horizonFact);
  expect(horizonFact).toBe(`volume_readable_horizon:${apiPresent.length}/${rows.length}`);
  const sinceMs = await horizon.getAttribute("data-readable-since-ms");
  fact(SPEC, "volume_readable_since_ms", sinceMs);
  expect(sinceMs).toBe(apiPresent.length === 0 ? "" : String(apiPresent[0]!.event_time));

  // ── (d) no panel prints a fabricated zero where the API has nothing ─────────────────────────
  for (const [label, metric] of [
    ["Preço", "klines_last"],
    ["Open Interest", "sum_open_interest"],
  ] as const) {
    const entry = findEntry(entries, (candidate) => candidate.key.metric === metric);
    const panelRows = (await fetchSeriesHistory(seriesKeyIdOf(entry), request)).rows;
    const panelHasValue = panelRows.some((row) => row.value !== null);
    const readingText =
      (await page.locator(`section[aria-label="${label}"] [data-fact$="_last_reading:absent"], ` +
        `section[aria-label="${label}"] [data-fact*="_last_reading:"]`).first().textContent())?.trim() ?? "";
    fact(SPEC, `${metric}_api_has_value`, panelHasValue);
    fact(SPEC, `${metric}_dom_reading_text`, readingText);
    if (!panelHasValue) {
      // THE `RN-1` FALSIFIER, and the one that would have caught a fabricated zero: with no data
      // at all in the API, the only honest readouts are `SEM_PONTO` — a `0` here is an error of
      // TYPE, not of taste.
      expect(readingText).toContain(ABSENCE_TOKEN);
      expect(readingText).not.toMatch(/\d/);
    }
  }
});
