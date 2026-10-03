/**
 * `estrutura-do-front` `T-03.3` (plan `03` DoD 2, `ADR-050/D5`) — the pager, RENDERED, receives the
 * indicator table by parameter and fires ONE `/series-history` request per series of a page: the four
 * price reductions plus the six series of `INDICATOR_CATALOG`, ten in all, each for its own
 * `series_key_id`.
 *
 * This is the fast half of DoD 2. The browser half is `e2e/43-history-requests-per-page.spec.ts`,
 * which counts the same requests with `page.on('request')` against the built app. Here the hook runs
 * under `node --test` (`../component-render.ts`, the `T-10.11` pattern), `fetch` is a stub that
 * answers an empty, valid envelope, and the page is triggered the way the chart triggers it: a
 * candidate range at the left edge of the axis (`onCandidateRange`).
 *
 * Ablations (recorded in `gates/T-03.3-build.md`): `historyFetchPlan` skipping one series of the table
 * ⇒ 9 requests ⇒ the count test fails; the table losing a series ⇒ the mount throws, naming it.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, render } from "../component-render.ts";

import { S2_PRICE_USE } from "../../charts/index.ts";
import { historyFetchPlan, slotRecordOf, type SeriesAddress } from "./chart/history/series-slots.ts";
import { INDICATOR_CATALOG } from "./indicators/catalog.ts";
import { EMPTY_OI_CANDLE_BUNDLE } from "./oi-candle-pane.ts";

const { useHistoryPager } = await import("./chart/history/use-history-pager.ts");
type Pager = ReturnType<typeof useHistoryPager>;
type Seed = Parameters<typeof useHistoryPager>[1];
type Table = Parameters<typeof useHistoryPager>[0];

const ONE_MINUTE_MS = 60_000;
const WINDOW_START_MS = Date.UTC(2026, 8, 30, 0, 0);
const WINDOW = { startMs: WINDOW_START_MS, endMsExclusive: WINDOW_START_MS + 600 * ONE_MINUTE_MS };
const KNOWLEDGE_TIME_MS = WINDOW.endMsExclusive + 4 * ONE_MINUTE_MS;
const STUB_ENDPOINT = "http://pager-requests.stub.invalid/series-history";

function keyOf(address: SeriesAddress): string {
  return address.group === "price" ? `stub-price-${address.slot}` : `stub-${address.kind}-${address.slot}`;
}

function seedFor(table: Table): Seed {
  const plan = historyFetchPlan(table);
  const grid = ONE_MINUTE_MS;
  return {
    symbol: "BTCUSDT",
    interval: "1m",
    barPolicy: "final_only",
    knowledgeTimeMs: KNOWLEDGE_TIME_MS,
    historyBaseUrl: STUB_ENDPOINT,
    window: WINDOW,
    keys: slotRecordOf(plan, keyOf),
    rows: { ...slotRecordOf(plan, () => []), oiCandles: EMPTY_OI_CANDLE_BUNDLE },
    staticContext: {
      priceUse: S2_PRICE_USE,
      cvdAnchorMs: WINDOW.startMs,
      windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
      windowEndMsExclusive: WINDOW.endMsExclusive,
      longShortRecentSpanMs: 4 * 60 * ONE_MINUTE_MS,
      oiMaxStalenessMs: null,
      knowledgeTimeMs: KNOWLEDGE_TIME_MS,
      coverageGridMs: { volume: grid, cvd: grid, liquidationLong: grid, liquidationShort: grid },
    },
  };
}

/** Every `/series-history` request the stub answered, by `series_key_id`. */
function installFetchStub(): { readonly requested: string[]; restore(): void } {
  const requested: string[] = [];
  const saved = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    assert.ok(url.pathname.endsWith("/series-history"), `the pager asked for ${url.pathname}`);
    const seriesKeyId = url.searchParams.get("series_key_id") ?? "";
    requested.push(seriesKeyId);
    const body = {
      session: { principal_id: null, server_now_ms: KNOWLEDGE_TIME_MS },
      panel: {
        series_key_id: seriesKeyId,
        source: "T-03.3-pager-requests",
        nature: "STOCK",
        unit: "USD",
        coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
      },
      rows: [],
      oi_candles: null,
      knowledge_time: Number(url.searchParams.get("knowledge_time_ms")),
      bar_policy: "final_only",
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return {
    requested,
    restore: () => {
      globalThis.fetch = saved;
    },
  };
}

async function mountPager(table: Table, seed: Seed): Promise<{ readonly current: () => Pager; readonly unmount: () => void }> {
  let latest: Pager | undefined;
  function Probe(): null {
    latest = useHistoryPager(table, seed);
    return null;
  }
  const rendered = await render(createElement(Probe));
  return {
    current: () => {
      assert.ok(latest !== undefined, "the pager never rendered");
      return latest;
    },
    unmount: rendered.unmount,
  };
}

test("DoD 2 (fast half): one history page fires ten requests, one per series of the table plus the four price reductions", async () => {
  const stub = installFetchStub();
  const seed = seedFor(INDICATOR_CATALOG);
  const pager = await mountPager(INDICATOR_CATALOG, seed);
  try {
    assert.deepEqual(stub.requested, [], "the mount fetches nothing: the SSR already did");
    // The chart reports a view whose left edge sits on the loaded edge: a page is owed.
    await act(async () => {
      pager.current().onCandidateRange({ fromMs: WINDOW.startMs, toMs: WINDOW.startMs + 60 * ONE_MINUTE_MS });
    });
    for (let tick = 0; tick < 50 && pager.current().window.startMs === WINDOW.startMs; tick += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    assert.ok(pager.current().window.startMs < WINDOW.startMs, "the page never landed: the window did not widen");

    const expected = historyFetchPlan(INDICATOR_CATALOG).map(keyOf);
    assert.equal(stub.requested.length, 10, `requests on one page: ${JSON.stringify(stub.requested)}`);
    assert.deepEqual([...stub.requested].sort(), [...expected].sort(), "each series once, for its own series_key_id");
  } finally {
    pager.unmount();
    stub.restore();
  }
});

test("MORDE: a table that lost a series is refused at mount, by name — never a page that silently skips it", async () => {
  const withoutShort: Table = INDICATOR_CATALOG.map((entry) =>
    entry.kind === "liquidation" ? { ...entry, series: entry.series.filter((series) => series.slot !== "short") } : entry,
  );
  assert.equal(historyFetchPlan(withoutShort).length, 9, "the plan of the ablated table is one short");
  const stub = installFetchStub();
  try {
    await assert.rejects(mountPager(withoutShort, seedFor(withoutShort)), /no series "short" under kind "liquidation"/);
    assert.deepEqual(stub.requested, []);
  } finally {
    stub.restore();
  }
});
