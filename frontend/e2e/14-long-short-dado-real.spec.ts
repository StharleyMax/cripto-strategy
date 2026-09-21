import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-04.7` (`SPEC-007` plan `04` item `4.7`, `DoD-3`) â the `LongShortPane` with REAL data on
 * screen, counted against the API the page itself read, and counted in NATIVE BARS rather than in
 * steps of the staircase.
 *
 * â ï¸ THE FILE NAME DIVERGES FROM THE TASK, AND THE DIVERGENCE IS DELIBERATE: `tasks.toml:654`
 * names `e2e/12-long-short-dado-real.spec.ts`, and the `12` prefix was taken by
 * `12-oi-dado-real.spec.ts` (created 2026-09-15, after this task's text was written) and `13` by
 * `13-liquidacoes-dado-real.spec.ts`. Two files sharing a prefix would make the suite's reading
 * order ambiguous for nothing; `14` keeps the intent (a new, dedicated spec at the end of the
 * queue). Same precedent, same reason, as the `11 -> 12` note at the top of `12-oi-dado-real`.
 *
 * ââ WHY "HTTP 200" IS NOT THE SUBJECT ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * `D2` refused the API-only DoD with a number, and phase `03` proved it again: the backend was
 * ready, `/series-history` answered `200`, and the pane stayed `SEM_PONTO` because the PAGE asked
 * for the wrong series. What this file measures is the DOM: how many bars the pane SAYS it has,
 * and whether that number is the API's over EXACTLY the window the server declared in `<main>`.
 *
 * ââ â­ THE DIVISOR OF `RN-S1`: THE PLAN'S `/5` IS WRONG FOR THIS SERIES, AND THIS FILE MEASURES
 *      IT INSTEAD OF INHERITING EITHER ANSWER âââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * The plan and `handoff/T-04.5-HANDOFF-FRONT.md` write `native_bars = dom_points / 5`. The pane
 * (`view-model.ts::countNativeBarsByPublication`) instead counts DISTINCT `available_at`. The two
 * disagree, so this spec refuses to assume either and asserts the STRUCTURAL INVARIANTS that any
 * correct count has to satisfy, all of them recomputed from the API response:
 *
 *   ceil(wire / 5) <= native <= wire          one publication covers 1..5 slots of the `1m` grid
 *   native        <= buckets_in_window        a window of `W` minutes holds at most `W/5 + 1`
 *
 * `/5` is the LOWER BOUND of that band, exact only if every run is exactly five slots long. It is
 * not: measured against production over 240 minutes the runs group as `1x1, 2x7, 3x15, 4x15,
 * 5x11`, so `175/5 = 35` against `49` distinct publications, against `48` buckets the window can
 * hold `[MEDIDO 2026-09-16, GET /api/v1/series-history?series_key_id=279d3172â¦&symbol=BTCUSDT&
 * interval=1m&bar_policy=final_only]`. The `% 300_000` grid filter â how `OiPane` finds ITS native
 * grid â answers `11` on the same response, a 4,5x undercount, because this series' publications
 * do not land on the five-minute grid (delays of `9,6 s` and `70,8 s` on consecutive buckets,
 * `long_short_catalog.py`). So the test asserts the band AND publishes what each of the two cheap
 * answers would have said, as facts, so a future reader can see which one drifts.
 *
 * ââ THE TWO UNIVERSES, DECLARED ON EVERY RUN âââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 *   WEAK   (sqlite, what `make e2e`/`make verify` compose): `/series-history` REFUSES (`500`).
 *          What gets proven is `RN-1`: facing a backend that cannot answer, the screen says
 *          `SEM_PONTO` and never a `0`, and the DOM contract is published. This is the universe
 *          that runs in the portÃ£o.
 *   STRONG (Postgres with reader, the production API on `:8000`): `N >= 30` NATIVE BARS in the
 *          DOM, equal to the API's. That is `DoD-3`.
 *
 * â The WEAK universe is never reported as if it were the STRONG one: every run prints
 * `series_window_reader_present`, `long_short_dom_native_bars` and `long_short_dom_wire_points`.
 * â NOTHING HERE SEEDS THE SHARED POSTGRES (`[P-seed]`, `D2`): there is no `INSERT`, no `psql`
 * and no `docker` in this file outside this paragraph. The one synthetic fixture below lives in
 * memory, inside a single test, and never leaves it.
 */

const SPEC = "14-long-short-dado-real";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const ONE_MINUTE_MS = 60_000;
/** The NATIVE grid of this series (`interval="5m"`, `nativeGrid="5min"` in the catalog). Used as a
 * BUCKET SIZE to bound the count from above â never as a `/5` over a count, which is the very
 * divisor this file falsifies. */
const NATIVE_GRID_MS = 300_000;
/** The number of `1m` slots one `5m` publication can cover at most. Named so the invariant below
 * reads as what it is instead of as a magic `5`. */
const SLOTS_PER_NATIVE_BUCKET = NATIVE_GRID_MS / ONE_MINUTE_MS;

const apiBaseUrl = sentimentoApiBaseUrl;

/** The stable handles of this pane in `SymbolClient.tsx`. Written by hand, not imported: importing
 * `SymbolClient.tsx` would drag in `lightweight-charts` (and `view-model.ts` would drag
 * `charts/index.ts` -> `jsdom`, which dies under Playwright's module loader and takes the whole
 * COLLECTION to `Total: 0 tests`). `long-short-pane-dom-contract.test.ts` guards the same strings
 * from the other side â two independent witnesses to one contract.
 *
 * â `data-testid`, NEVER `aria-label`: the pt-BR microcopy is exactly what `T-04.6`'s designer has
 * the right to rewrite, and an assert anchored on it would make this gate a veto on form. */
const LONG_SHORT_PANE_TESTID = "long-short-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `DoD-3`: `N >= 30` NATIVE BARS â not `N > 0`, and not 30 steps of the staircase. */
const MINIMUM_NATIVE_BARS = 30;

/** The TWO terms that identify this series â the same rule as
 * `view-model.ts::matchesCountLongShortRatio`, written by hand here for the reason above.
 *
 * â ï¸ AND THE ONE-TERM GUARD OF `12-oi-dado-real.spec.ts` CANNOT BE COPIED HERE, which is stated
 * rather than quietly dropped: the served catalog carries exactly ONE `count_long_short_ratio` row
 * per instrument today, so `metric` alone and `metric + provider` are INDISTINGUISHABLE against
 * the live catalog. The synthetic-catalog test below is what proves `provider` does any work, and
 * the live test publishes the one-term subtotal as a fact so the day the Coinalyze mirror lands is
 * visible in the gate report instead of silent. */
function isBinanceCountLongShortRatio(key: SeriesKey): boolean {
  return key.metric === "count_long_short_ratio" && key.provider === "binance";
}

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly maxStalenessMs: number;
  readonly nativeGrid: string;
  readonly reconstructedFrom: string | null;
}

interface HistoryRow {
  readonly event_time: number;
  /** `ADR-038`: the instant the observation became KNOWABLE. The read path repeats this one stamp
   * across every `1m` slot the `5m` bucket covers â which is what produces the staircase, and what
   * makes a distinct `available_at` a distinct native observation. `null` exactly when `value` is. */
  readonly available_at: number | null;
  readonly value: string | null;
  readonly absence: string | null;
}

interface RenderedRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

function requiredNumberAttribute(value: string | null, name: string): number {
  if (value === null) {
    throw new Error(`the page did not declare ${name} â SymbolClient.tsx stopped publishing its own request`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is ${JSON.stringify(value)}, not a finite epoch-ms instant`);
  }
  return parsed;
}

/** `fetch` with ONE retry, and only on a transport error â the same measured reason `08`/`10`/`12`
 * document (`undici` reuses the connection a worker that just answered `500` already closed). No
 * assertion is loosened: any HTTP response comes back untouched. */
async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
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
  // Body read as TEXT first: a route that refuses answers `Internal Server Error`, and
  // `response.json()` would become a `SyntaxError`, hiding the status the caller must judge.
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

interface WireCounts {
  /** Distinct `available_at` among readable rows â the pane's headline rule, recomputed from
   * outside the process. */
  readonly nativeByPublication: number;
  /** Readable rows on the `1m` wire grid â the staircase, never "how much data there is". */
  readonly wire: number;
  /** What the PLAN's divisor would have answered. Published as a fact, never asserted as truth. */
  readonly nativeByPlanDivisor: number;
  /** What `OiPane`'s grid filter would have answered on this series. Same treatment. */
  readonly nativeByFiveMinuteGrid: number;
  /** The widest PUBLICATION GROUP, in slots â all readable rows sharing one `available_at`. The
   * read path repeats one stamp across the slots its `5m` bucket covers, so a group wider than
   * `SLOTS_PER_NATIVE_BUCKET` means the staircase model this whole count rests on is wrong (two
   * buckets collapsed into one stamp â the BACKFILL mode `countNativeBarsByPublication` declares). */
  readonly widestPublicationSlots: number;
  /** Groups whose slots are NOT a contiguous stretch of the `1m` grid. Must be zero: one bucket is
   * one uninterrupted stretch, and a hole inside a group is the same collapse seen from the side. */
  readonly nonContiguousPublications: number;
  /** Groups carrying more than one distinct value. Must be zero for the same reason: one native
   * observation has one value, so two values under one stamp are two observations counted as one. */
  readonly multiValuedPublications: number;
  /** Whether the average group is narrower than five slots â i.e. some publication covers fewer
   * than five. When true, `/5` provably undercounts, and the pane's headline must NOT equal it.
   *
   * â WHY GROUPS AND NOT "RUNS OF CONSECUTIVE READABLE SLOTS", which is what the first draft of
   * this file counted and what the run under `make e2e` REJECTED at `frontend/e2e/14-â¦:400`: a
   * publication covering the full five slots leaves the NEXT one starting one minute later, so two
   * distinct buckets merge into one run. The run count is therefore not an independent view of the
   * bucket count â it is a lower bound that the data's own density moves. Grouping by the stamp is. */
  readonly hasNarrowPublication: boolean;
}

/** â EVERY COUNT SIDE BY SIDE, ALL DERIVED FROM THE SAME RESPONSE. Nothing here decides which one
 * is right â the assertions do that, from the invariants each count must satisfy. */
function countRows(rows: readonly HistoryRow[]): WireCounts {
  const readable = rows.filter((row) => row.value !== null).sort((a, b) => a.event_time - b.event_time);
  const groups = new Map<number, HistoryRow[]>();
  for (const row of readable) {
    if (row.available_at === null) continue;
    const group = groups.get(row.available_at);
    if (group === undefined) groups.set(row.available_at, [row]);
    else group.push(row);
  }
  let widest = 0;
  let nonContiguous = 0;
  let multiValued = 0;
  for (const group of groups.values()) {
    widest = Math.max(widest, group.length);
    const span = group[group.length - 1]!.event_time - group[0]!.event_time;
    if (span !== ONE_MINUTE_MS * (group.length - 1)) nonContiguous += 1;
    if (new Set(group.map((row) => row.value)).size > 1) multiValued += 1;
  }
  return {
    nativeByPublication: groups.size,
    wire: readable.length,
    nativeByPlanDivisor: Math.floor(readable.length / SLOTS_PER_NATIVE_BUCKET),
    nativeByFiveMinuteGrid: readable.filter((row) => row.event_time % NATIVE_GRID_MS === 0).length,
    widestPublicationSlots: widest,
    nonContiguousPublications: nonContiguous,
    multiValuedPublications: multiValued,
    hasNarrowPublication: groups.size > 0 && readable.length < groups.size * SLOTS_PER_NATIVE_BUCKET,
  };
}

/** Does this deployment have a window reader for `md.series`? Asked OF THE API ITSELF, never of an
 * environment variable â an env var here would be an allowlist in disguise. `/ready` publishes
 * `store.path`, and `ADR-034/D9` gives no sqlite fallback for `md.series`. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error("GET /ready did not publish store.path â cannot tell which engine this API composed");
  }
  return !storePath.endsWith(".sqlite3");
}

async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "the page does not declare its own request (data-window-start-ms)").toHaveCount(1);
  return {
    windowStartMs: requiredNumberAttribute(await main.getAttribute("data-window-start-ms"), "data-window-start-ms"),
    windowEndMsInclusive: requiredNumberAttribute(
      await main.getAttribute("data-window-end-ms-inclusive"),
      "data-window-end-ms-inclusive",
    ),
    knowledgeTimeMs: requiredNumberAttribute(
      await main.getAttribute("data-knowledge-time-ms"),
      "data-knowledge-time-ms",
    ),
  };
}

/**
 * Reads a count off the pane REQUIRING it to exist and to be digits, before converting.
 *
 * â The requirement comes before the conversion, and the order is the asset: `Number(null)` and
 * `Number("")` are both `0`, and `0` is exactly what the API serves in the weak universe â without
 * these two assertions `expect(dom).toBe(api)` compares `0 === 0` and stays green over a DOM whose
 * contract was ERASED. That was `BLOCKER-3` of wave `03`, `rc=0, 24 passed`.
 */
function requireDigits(raw: string | null, attribute: string): number {
  expect(
    raw,
    `the page stopped publishing \`${attribute}\` â with no attribute there is nothing to compare against the ` +
      "API, and `Number(null) === 0` would make the assertion pass over a contract-less DOM",
  ).not.toBeNull();
  expect(raw ?? "", `\`${attribute}\` has to be a count in digits; an empty string becomes 0 in \`Number()\``).toMatch(
    /^\d+$/,
  );
  return Number(raw);
}

test(`the served catalog matches EXACTLY ONE count_long_short_ratio row for ${SYMBOL} (${SPEC})`, async () => {
  // The selector-drift guard, run against the catalog the API under test really serves â while
  // `long-short-series-selector.test.ts` runs against a fixture transcribed from
  // `long_short_catalog.py`. Two witnesses, two sources.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const metricOnly = forSymbol.filter((entry) => entry.key.metric === "count_long_short_ratio");
  const matched = forSymbol.filter((entry) => isBinanceCountLongShortRatio(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_rows_for_symbol", forSymbol.length);
  fact(SPEC, "catalog_count_long_short_ratio_rows_for_symbol", metricOnly.length);
  fact(SPEC, "catalog_binance_matches", matched.length);

  expect(
    matched.length,
    `the two-term filter matched ${matched.length} rows â DoD-3 reads ONE pane, and \`find\` would pick one ` +
      "of them without saying which",
  ).toBe(1);
  // The chosen row is the DIRECT reading from the origin, not a third party's reconstruction
  // (`ADR-036/D2`/`D3`).
  expect(matched[0]!.reconstructedFrom, "the chosen row must not be a reconstruction").toBeNull();
  expect(matched[0]!.key.nature, "nature RATIO is what makes this series never carry a value forward").toBe("RATIO");
  expect(matched[0]!.key.reduction).toBe("POINT");
  expect(matched[0]!.key.unit, "the pane prints this unit beside the numeral (W-1 of gates/design-01.md)").toBe("ratio");
  // And the native grid this file bounds its count with is the one the CATALOG declares â not a
  // `5` typed in here. If the backend changes this series' interval, the test fails instead of
  // silently counting against the wrong bucket size.
  fact(SPEC, "catalog_native_grid", matched[0]!.nativeGrid);
  expect(matched[0]!.key.interval).toBe("5m");
  expect(matched[0]!.nativeGrid).toBe("5min");
  expect(matched[0]!.maxStalenessMs, "the staleness ceiling is 2x the native bucket").toBe(2 * NATIVE_GRID_MS);
});

test(`MORDE of the selector: \`provider\` is what keeps the pane on the ORIGIN (${SPEC})`, () => {
  // â THE GUARD THE LIVE CATALOG CANNOT PROVIDE TODAY, and the reason it is here rather than
  // hand-waved: the served catalog has ONE `count_long_short_ratio` row, so a one-term filter and
  // the real two-term filter agree on it, and an assertion over the live catalog proves nothing
  // about `provider`. `ADR-036/D3` says Coinalyze mirrors this same quotient in its `r` field, so
  // the day that row is cataloged the one-term filter starts matching two. This fixture is that
  // day, in memory.
  const base: SeriesKey = {
    provider: "binance",
    venue: "usdm_futures",
    instrumentId: SYMBOL,
    metric: "count_long_short_ratio",
    cohort: "all",
    interval: "5m",
    unit: "ratio",
    denom: "NA",
    nature: "RATIO",
    tsConvention: "POINT_AT_BUCKET_END",
    reduction: "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "Symbol",
    verifiedBy: "e2e-fixture",
  } as SeriesKey;
  const mirror: SeriesKey = { ...base, provider: "coinalyze" };
  const catalog = [base, mirror];

  expect(catalog.filter((key) => key.metric === "count_long_short_ratio"), "the one-term filter matches BOTH").toHaveLength(
    2,
  );
  expect(catalog.filter(isBinanceCountLongShortRatio), "the two-term filter keeps the ORIGIN only").toHaveLength(1);
  expect(catalog.filter(isBinanceCountLongShortRatio)[0]!.provider).toBe("binance");
  // And a CALA: the two-term filter does not depend on terms nobody agreed to pin. A cohort or a
  // `verifiedBy` change is not a different series, and narrowing on those would let the backend
  // erase this pane with a rename (`T-03.5`, literally what happened to the OI pane).
  const renamed: SeriesKey = { ...base, cohort: "top_traders", verifiedBy: "another_test.py::x" } as SeriesKey;
  expect([renamed].filter(isBinanceCountLongShortRatio), "the filter stays silent about terms it never pinned").toHaveLength(
    1,
  );
});

test(`MORDE of the instrument: the plan's \`/5\` UNDERCOUNTS this staircase (${SPEC})`, () => {
  // â THE FALSIFIER OF THE MEASURING DEVICE ITSELF, and it runs in BOTH universes â including in
  // the portÃ£o, where the API has no reader and no assertion about real data can bite. Without it,
  // "the e2e passes" under `make verify` would be compatible with a counter that cannot count.
  //
  // A synthetic fixture, here and only here (nothing in it touches any database), shaped like what
  // production actually serves: publications land OFF the five-minute grid (a 60 s delay) and
  // cover 3, 5 or 4 slots, which is the measured shape (`1x1, 2x7, 3x15, 4x15, 5x11`).
  const RUN_SLOTS = [3, 5, 4];
  const PUBLICATION_DELAY_MS = 60_000;
  const rows: HistoryRow[] = [];
  const buckets = 42;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const bucketStart = bucket * NATIVE_GRID_MS + PUBLICATION_DELAY_MS;
    const availableAt = bucketStart - 11_000;
    for (let step = 0; step < RUN_SLOTS[bucket % RUN_SLOTS.length]!; step += 1) {
      rows.push({
        event_time: bucketStart + step * ONE_MINUTE_MS,
        available_at: availableAt,
        value: String(1.5 + bucket / 1000),
        absence: null,
      });
    }
  }
  const counted = countRows(rows);
  fact(SPEC, "morde_fixture_native_by_publication", counted.nativeByPublication);
  fact(SPEC, "morde_fixture_wire", counted.wire);
  fact(SPEC, "morde_fixture_plan_divisor", counted.nativeByPlanDivisor);
  fact(SPEC, "morde_fixture_five_minute_grid", counted.nativeByFiveMinuteGrid);

  expect(counted.wire, "the staircase has 14x(3+5+4) steps").toBe(168);
  expect(counted.nativeByPublication, "and 42 native observations â THIS is the number DoD-3 counts").toBe(buckets);
  // Each publication is one contiguous stretch of the grid, no wider than its own bucket, carrying
  // one value â the three properties the live assertions check on the real response.
  expect(counted.widestPublicationSlots).toBeLessThanOrEqual(SLOTS_PER_NATIVE_BUCKET);
  expect(counted.nonContiguousPublications).toBe(0);
  expect(counted.multiValuedPublications).toBe(0);

  // â­ THE TWO CHEAP ANSWERS, EACH SHOWN WRONG ON THE SAME FIXTURE.
  expect(counted.nativeByPlanDivisor, "`wire/5` answers 33 where there are 42 buckets â it UNDERCOUNTS").toBe(33);
  expect(counted.nativeByPlanDivisor).toBeLessThan(counted.nativeByPublication);
  expect(
    counted.nativeByFiveMinuteGrid,
    "and `event_time % 300_000` only ever catches the 5-slot runs â a 3x undercount",
  ).toBe(14);
  expect(counted.nativeByFiveMinuteGrid).toBeLessThan(counted.nativeByPublication);

  // The invariants the live test asserts, exercised against a fixture whose answer is known.
  expect(counted.nativeByPublication).toBeGreaterThanOrEqual(Math.ceil(counted.wire / SLOTS_PER_NATIVE_BUCKET));
  expect(counted.nativeByPublication).toBeLessThanOrEqual(counted.wire);

  // If the data disappears, every count goes with it: none of them survives as a constant.
  const erased = rows.map((row) => ({ ...row, value: null, available_at: null, absence: ABSENCE_TOKEN }));
  expect(countRows(erased)).toMatchObject({ nativeByPublication: 0, wire: 0, widestPublicationSlots: 0 });

  // And six real bars do NOT pass for thirty â the phase's own named failure mode ("contar 150
  // pontos onde hÃ¡ 30 barras") applied to its worst case.
  const sixBuckets = rows.filter((row) => row.event_time < 6 * NATIVE_GRID_MS + PUBLICATION_DELAY_MS);
  expect(countRows(sixBuckets).nativeByPublication, "six buckets are six, not thirty").toBe(6);
  expect(countRows(sixBuckets).nativeByPublication).toBeLessThan(MINIMUM_NATIVE_BARS);

  // â THE COLLAPSE THE RULE CAN SUFFER, AND THE ONE IT CANNOT SEE â both named, because a measuring
  // device whose blind spot is undeclared is worse than a cruder one.
  //
  // (i) BACKFILL: two buckets fetched in one pass share one stamp. Caught â the group stops being a
  //     contiguous stretch of at most five slots, and it carries two values.
  const backfilled: HistoryRow[] = [
    { event_time: 0, available_at: 7, value: "1.5", absence: null },
    { event_time: 6 * ONE_MINUTE_MS, available_at: 7, value: "1.7", absence: null },
  ];
  const backfillCounts = countRows(backfilled);
  expect(backfillCounts.nativeByPublication, "two buckets under one stamp count as ONE â an UNDERCOUNT").toBe(1);
  expect(backfillCounts.nonContiguousPublications, "and the group is what dissents: it has a hole").toBe(1);
  expect(backfillCounts.multiValuedPublications, "and two values under one stamp").toBe(1);
  //
  // (ii) DOUBLE PUBLICATION of one bucket under two stamps would OVERCOUNT, and no group-level
  //      property sees it: both halves stay contiguous and single-valued. The bound that catches it
  //      is the window's own bucket ceiling (`native <= nativeBucketsInWindow` in the live test),
  //      which catches it systemically and not one-off. DECLARED, not covered.
  const doublePublished: HistoryRow[] = [
    { event_time: 0, available_at: 1, value: "1.5", absence: null },
    { event_time: ONE_MINUTE_MS, available_at: 2, value: "1.5", absence: null },
  ];
  const doubleCounts = countRows(doublePublished);
  expect(doubleCounts.nativeByPublication, "one bucket, two stamps, counted twice").toBe(2);
  expect(doubleCounts.nonContiguousPublications, "and nothing at the group level objects â this is the blind spot").toBe(
    0,
  );
});

test(`the LongShortPane's bar count is the API's, over the SAME window (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  // The window's grid, derived from the instants the SERVER declared in `<main>` â never from this
  // process' clock, which would race the render's.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / ONE_MINUTE_MS + 1;
  const nativeBucketsInWindow = Math.floor((request.windowEndMsInclusive - request.windowStartMs) / NATIVE_GRID_MS) + 1;
  const entries = await fetchCatalogEntries();
  const entry = entries.find((candidate) => candidate.key.instrumentId === SYMBOL && isBinanceCountLongShortRatio(candidate.key));
  expect(entry, `no binance count_long_short_ratio row in the catalog for ${SYMBOL}`).toBeDefined();

  const seriesKeyId = computeSeriesKeyId(entry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const api = countRows(rows);
  const readerPresent = await seriesWindowReaderPresent();

  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "long_short_series_key_id", seriesKeyId);
  fact(SPEC, "long_short_series_history_status", status);
  fact(SPEC, "long_short_series_history_rows", rows.length);
  fact(SPEC, "long_short_api_native_by_publication", api.nativeByPublication);
  fact(SPEC, "long_short_api_wire_points", api.wire);
  fact(SPEC, "long_short_api_plan_divisor", api.nativeByPlanDivisor);
  fact(SPEC, "long_short_api_five_minute_grid", api.nativeByFiveMinuteGrid);
  fact(SPEC, "long_short_api_widest_publication_slots", api.widestPublicationSlots);
  fact(SPEC, "long_short_api_non_contiguous_publications", api.nonContiguousPublications);
  fact(SPEC, "long_short_api_multi_valued_publications", api.multiValuedPublications);
  fact(SPEC, "long_short_window_grid_slots", windowGridSlots);
  fact(SPEC, "long_short_native_buckets_in_window", nativeBucketsInWindow);

  // ââ (a) the DOM contract exists, and is read BEFORE any comparison âââââââââââââââââââââââââ
  const pane = page.locator(`[data-testid="${LONG_SHORT_PANE_TESTID}"]`);
  await expect(pane, `no long/short pane in the DOM under [data-testid="${LONG_SHORT_PANE_TESTID}"]`).toHaveCount(1);
  const domNativeBars = requireDigits(await pane.getAttribute("data-long-short-native-bars"), "data-long-short-native-bars");
  const domWirePoints = requireDigits(await pane.getAttribute("data-long-short-wire-points"), "data-long-short-wire-points");
  fact(SPEC, "long_short_dom_native_bars", domNativeBars);
  fact(SPEC, "long_short_dom_wire_points", domWirePoints);

  // ââ (b) both counts on screen are the API's, exactly âââââââââââââââââââââââââââââââââââââââ
  //
  // Exactly, not approximately: both sides came from the SAME declared window, so a divergence is
  // a wiring defect, not a race.
  expect(domNativeBars, "the pane's headline has to be the API's NATIVE bar count").toBe(api.nativeByPublication);
  expect(domWirePoints, "and the step count beside it has to be the API's staircase").toBe(api.wire);

  // ââ (c) the readable horizon is DECLARED, with both numbers and the grid it was served on ââ
  const slotsFact = await pane.locator('[data-fact^="long_short_slots:"]').getAttribute("data-fact");
  const domSlots = Number(slotsFact!.split(":")[1]);
  fact(SPEC, "long_short_dom_slots", domSlots);
  const horizon = pane.locator('[data-fact^="long_short_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "long_short_readable_horizon_fact", horizonFact);
  expect(horizonFact).toBe(`long_short_readable_horizon:${api.nativeByPublication}/${api.wire}/${domSlots}`);

  // ââ (c bis) `D-1` â the faixa das 4 h, which Â§R3.5 of the design gate measured as MISSING ââ
  //
  // `[DECISÃO-OWNER 2026-09-16 Â§D18]` prescribes *"faixa de 4h + rodapÃ© numÃ©rico"*, and the report
  // found the second half on screen and the first half nowhere: *"o cÃ³digo tem 1 sÃ©rie `Line` e ZERO
  // sobreposiÃ§Ã£o"*. This is the assertion that the band EXISTS in the rendered DOM â which a source
  // scan structurally cannot answer, because the band's coordinates only exist once a real browser
  // has laid out a real chart.
  const bandLocator = pane.locator('[data-fact^="long_short_recent_band:"]');
  const recentScale = pane.locator('[data-fact^="long_short_recent_scale:"]');
  const recentSpanMs = Number(await recentScale.getAttribute("data-recent-span-ms"));
  fact(SPEC, "long_short_recent_span_ms", recentSpanMs);

  const readingLocator = pane.locator('[data-fact^="long_short_last_reading:"]');
  const readoutText = (await readingLocator.textContent())?.trim() ?? "";
  const readingKind = (await readingLocator.getAttribute("data-fact"))!.split(":")[1];
  fact(SPEC, "long_short_last_reading_kind", readingKind);
  fact(SPEC, "long_short_last_reading_text", readoutText);

  // ââ (d) the verdict, per universe âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!readerPresent) {
    // The API just declared, about itself, that it composed the sqlite engine, which `ADR-034/D9`
    // gives no `md.series` reader. The assertion that MEANS something here is the opposite one:
    // the route must REFUSE loudly, never answer `200` with an invented grid, and the screen must
    // say the absence with the token, never with a number.
    expect(status, "with no window reader the route must REFUSE, never answer 200 with an invented grid").toBe(500);
    expect(api.nativeByPublication).toBe(0);
    expect(api.wire).toBe(0);
    expect(domSlots, "no rows, no slots â the pane must not invent a grid either").toBe(0);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // â `RN-1` literally: no digit where there is no observation. A `0` here would be the claim
    // "the long/short ratio of this series is zero" â and `0` is a LEGIBLE ratio (nobody long),
    // so the fabricated value would not even look wrong.
    expect(readoutText).not.toMatch(/\d/);
    // And `D-1` in the same posture: with no grid there is nothing to delimit, so there is NO band.
    // A rectangle drawn over an empty plot would be the screen pointing at four hours of nothing.
    await expect(bandLocator, "no slots, no band â the overlay must not invent a window").toHaveCount(0);
    return;
  }

  // ââ STRONG UNIVERSE: `DoD-3` ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  expect(status).toBe(200);
  // One row per instant of the PANEL grid (1 min), present or absent â `rows.length` alone is NOT
  // evidence of data; it is evidence that the grid asked for is the grid served.
  expect(rows.length).toBe(windowGridSlots);
  expect(domSlots, "the pane transcribes the served grid, slot for slot").toBe(windowGridSlots);
  // Absence DECLARED, never implicit: every row without a value names its reason.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);
  // And every readable row carries the stamp the count rests on. A readable row with a `null`
  // `available_at` would be silently dropped by the pane's counter â so it is refused here instead.
  expect(
    rows.filter((row) => row.value !== null && row.available_at === null),
    "a readable row with no `available_at` is invisible to a count by publication",
  ).toHaveLength(0);

  // â THE STAIRCASE EXISTS, WHICH IS WHAT MAKES `RN-S1` TESTABLE AT ALL. If `wire === native`,
  // this series stopped being served as a ladder and the assertions above no longer distinguish
  // the two counts â the test would pass while proving nothing about `RN-S1`.
  expect(
    api.wire,
    "with real data the 1-min grid must carry MORE readable rows than there are native observations â without " +
      "that, RN-S1 is not being exercised by this run",
  ).toBeGreaterThan(api.nativeByPublication);
  expect(domNativeBars, "and the pane's headline is NOT the staircase number").not.toBe(api.wire);

  // â­ THE INVARIANTS ANY CORRECT NATIVE COUNT SATISFIES â the band this spec asserts INSTEAD of
  // inheriting either the plan's divisor or the pane's rule. A publication covers between 1 and 5
  // slots of the `1m` grid, and the window holds a bounded number of `5m` buckets.
  expect(
    domNativeBars,
    "a publication covers at most 5 slots, so the native count cannot be below `ceil(wire/5)`",
  ).toBeGreaterThanOrEqual(Math.ceil(api.wire / SLOTS_PER_NATIVE_BUCKET));
  expect(domNativeBars, "and it covers at least 1 slot, so it cannot exceed the staircase").toBeLessThanOrEqual(api.wire);
  expect(
    domNativeBars,
    `the window spans ${nativeBucketsInWindow} native buckets â more observations than buckets would mean the ` +
      "same bucket was counted twice",
  ).toBeLessThanOrEqual(nativeBucketsInWindow);
  // The SHAPE of each publication, which is what makes one stamp equal one native observation:
  // a contiguous stretch of the grid, no wider than its own bucket, carrying a single value. A
  // violation is the BACKFILL collapse `countNativeBarsByPublication` declares â two buckets under
  // one stamp â which errs toward UNDERSTATING (safe for an `N >= 30` gate) but is not silent here.
  expect(api.widestPublicationSlots, "no publication can cover more than 5 slots of the 1-min grid").toBeLessThanOrEqual(
    SLOTS_PER_NATIVE_BUCKET,
  );
  expect(
    api.nonContiguousPublications,
    "a publication with a hole in it is two buckets sharing one stamp â the count would understate",
  ).toBe(0);
  expect(api.multiValuedPublications, "and two different values under one stamp are two observations, not one").toBe(0);

  // â­ AND THE PLAN'S DIVISOR, JUDGED AGAINST THE LIVE RESPONSE INSTEAD OF QUOTED. It is the lower
  // bound of the band, reached only when every publication covers exactly five slots. Whenever some
  // covers fewer, `/5` is provably below the truth and the pane must not be publishing it.
  if (api.hasNarrowPublication) {
    expect(
      api.nativeByPlanDivisor,
      "some publication covers fewer than 5 slots, so `wire/5` is strictly below the number of buckets served",
    ).toBeLessThan(api.nativeByPublication);
    expect(domNativeBars, "and the pane must not be publishing the plan's undercount").not.toBe(api.nativeByPlanDivisor);
  }

  // `DoD-3`: `N >= 30` NATIVE BARS, read off the DOM.
  expect(
    domNativeBars,
    `DoD-3 asks for N >= ${MINIMUM_NATIVE_BARS} native bars on the LongShortPane; the screen declares ` +
      `${domNativeBars} (${domWirePoints} steps on the 1-min grid)`,
  ).toBeGreaterThanOrEqual(MINIMUM_NATIVE_BARS);

  // ââ â­ `D-1`: THE BAND IS ON SCREEN, AND IT DELIMITS THE SLOTS THE FOOTER DESCRIBES ââââââââ
  //
  // Not "an element exists": the band publishes the two slot indices it was measured from, and they
  // are recomputed here from the window the SERVER declared plus the span the pane itself published
  // (`data-recent-span-ms`). A band over a different stretch than the numerals beside it would be
  // two answers to *"quais Ãºltimas 4 h"* on one pane â the `M-1` class of defect.
  await expect(bandLocator, "the faixa das 4 h must be in the DOM once the plot has slots").toHaveCount(1);
  const bandFact = (await bandLocator.getAttribute("data-fact"))!;
  const bandLeftPx = Number(await bandLocator.getAttribute("data-recent-band-left-px"));
  const bandWidthPx = Number(await bandLocator.getAttribute("data-recent-band-width-px"));
  fact(SPEC, "long_short_recent_band_fact", bandFact);
  fact(SPEC, "long_short_recent_band_left_px", bandLeftPx);
  fact(SPEC, "long_short_recent_band_width_px", bandWidthPx);

  const expectedLastIndex = domSlots - 1;
  const expectedFirstIndex = expectedLastIndex - recentSpanMs / ONE_MINUTE_MS;
  expect(recentSpanMs, "the pane must publish the span its own numerals were computed over").toBeGreaterThan(0);
  expect(bandFact, "the band ends at the window's last slot and starts exactly one span earlier").toBe(
    `long_short_recent_band:${expectedFirstIndex}/${expectedLastIndex}`,
  );
  // The geometry came from the chart's own time scale, so it has to land INSIDE the plot and have a
  // width. `0` would be two coincident borders; a width wider than the canvas would be a proportion
  // computed against the wrong element, which is the failure a percentage-based overlay produces.
  // ââ­ AND THE ASSERTION THAT "IT IS IN THE DOM" IS NOT â THIS ONE IS MEASURED AGAINST A DEFECT
  // THAT REALLY SHIPPED FOR ONE ITERATION OF `T-04.10`. The first working band satisfied every
  // assertion above â `toHaveCount(1)`, a `120x192` box at the right coordinates, the exact slot
  // indices â and a screenshot of the pane showed NOTHING: `lightweight-charts` paints its canvases
  // at `z-index: 1` and `2`, none of their ancestors opens a stacking context, so an overlay at
  // `auto` sorts UNDER them. A DOM assertion cannot see that, which is precisely the failure mode
  // `docs/context/.../QA de frontend exige Playwright contra app real` names. So the stacking order
  // is compared, in the browser, against the canvases the band has to clear.
  const stacking = await pane.evaluate((paneEl) => {
    const bandEl = paneEl.querySelector('[data-fact^="long_short_recent_band:"]')!;
    const host = bandEl.parentElement!.firstElementChild!;
    const canvasZ = [...host.querySelectorAll("canvas")].map((c) => Number(getComputedStyle(c).zIndex) || 0);
    return { bandZ: Number(getComputedStyle(bandEl).zIndex) || 0, maxCanvasZ: Math.max(0, ...canvasZ), canvases: canvasZ.length };
  });
  fact(SPEC, "long_short_band_z_index", stacking.bandZ);
  fact(SPEC, "long_short_chart_max_canvas_z_index", stacking.maxCanvasZ);
  fact(SPEC, "long_short_chart_canvases", stacking.canvases);
  expect(
    stacking.bandZ,
    `the band paints at z-index ${stacking.bandZ} and the chart's canvases up to ${stacking.maxCanvasZ} â the band ` +
      "would be in the DOM and invisible on screen, which every other assertion in this file cannot see",
  ).toBeGreaterThan(stacking.maxCanvasZ);

  const canvasBox = await pane.locator("canvas").first().boundingBox();
  expect(canvasBox, "the pane draws no canvas at all").not.toBeNull();
  fact(SPEC, "long_short_canvas_width_px", canvasBox!.width);
  expect(bandWidthPx, "a zero-width band is two coincident borders over a four-hour window").toBeGreaterThan(0);
  expect(bandLeftPx).toBeGreaterThanOrEqual(0);
  expect(bandLeftPx + bandWidthPx, "the band must land inside the chart it was measured from").toBeLessThanOrEqual(
    Math.ceil(canvasBox!.width),
  );

  // ââ (e) the current readout is the API's, tied at the EXACT instant the pane reads âââââââââ
  //
  // `page.tsx` calls `resolveFlowReadingOrAbsent(slots, windowEndMsInclusive)`, and this series is
  // `Nature.RATIO` with `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False`: nothing is held forward,
  // so the reading at the window's last instant is EXACT or it is `SEM_PONTO`. That is why the
  // anchor here is the last slot itself and not "the last readable row", which is the anchor
  // `12-oi-dado-real.spec.ts` needs for a STOCK series the server carries forward.
  const lastSlotRow = rows.find((row) => row.event_time === request.windowEndMsInclusive);
  expect(lastSlotRow, "the served grid does not contain the window's own last instant").toBeDefined();
  fact(SPEC, "long_short_last_slot_value", lastSlotRow!.value);
  if (lastSlotRow!.value === null) {
    expect(readingKind, "no observation at the last instant â the pane must say the absence").toBe("absent");
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    expect(readingKind, "there IS an observation at the last instant â the pane must print it").toBe("present");
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(
      readoutText,
      `the readout has to print the value the API serves at the window's last instant (${String(lastSlotRow!.value)})`,
    ).toContain(String(Number(lastSlotRow!.value)));
    // The unit travels with the numeral â a bare number on this screen was a finding once (`W-1`,
    // `gates/design-01.md`), and `ratio` is what the catalog published for this series.
    expect(readoutText, "the numeral carries the unit the catalog declared").toContain(entry!.key.unit);
  }
});
