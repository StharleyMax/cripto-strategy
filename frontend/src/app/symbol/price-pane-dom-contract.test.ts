/**
 * `T-01.8` — THE DOM/WIRING CONTRACT OF THE PRICE PANE. `price-candle.test.ts` proves the CANDLE
 * on the data and geometry side; this file proves the route that feeds it and the DOM that declares
 * it.
 *
 * `estrutura-do-front` `T-10.11` — the half about the DOM stopped reading `SymbolClient.tsx`. It
 * RENDERS `PricePane` (exported for this, `gates/T-10.11-padrao.md` §5 option P1) with literal props
 * under `../component-render.ts`, and asserts `data-testid`, `data-price-candles` and `data-fact` on
 * the DOM. The in-memory MORDE that used to sit here is gone with the regexes it defended (DoD 3):
 * its route mutant was a duplicate of the "each reduction is fetched SEPARATELY" test
 * (`gates/T-10.8-build.md` row #35), and its two DOM mutants are what the render now fails on.
 *
 * Measured before this file existed (`[MEDIDO 2026-09-19, universo: 324 testes]`), three mutations
 * passed green: `open: openResult.rows` → `closeResult.rows` (a candle whose body collapses while
 * every geometry assertion keeps passing), `data-fact="price_candles:…"` renamed, and the pane testid
 * suffixed. The first is guarded by section 1 below; the other two by section 2.
 *
 * ⚠️ RESIDUAL SOURCE SCAN — section 1 still reads `[symbol]/page.tsx`. It is a Server Component with
 * route-level side effects: no render pattern reaches it, and its regexes become value tests in
 * `F3` (plan item 3.4, `UNIT-FRONT-analise.md` §4). Until then they stay, named as residual.
 *
 * ⚠️ WHERE THE WIRING IN `SymbolClient` IS PROVEN (DoD 2): that `SymbolClient` mounts `PricePane` and
 * feeds it the route's count is `e2e/15-vela-e-ablacao.spec.ts`, test `CA-3: /symbol declara a leitura
 * de preço, e ela é ausente só quando a API é` (`data-price-candles` on `[data-testid="price-pane"]`
 * equals the candles the API serves for the page's own window). That price NEVER receives the wall badge
 * is proven HERE, by render: `PricePane` has no `wallState` prop at all (a call site passing one
 * fails `tsc --strict`), and its render carries no `[data-fact$=":beyond"]`.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, render } from "../component-render.ts";
import { buildS2Panels, ONE_MINUTE_MS, S2_PRICE_USE } from "../../charts/index.ts";
import type { CoverageMagnitude } from "./coverage-magnitude.ts";
import type { PaneRegistrar } from "./chart/host/registrar.ts";
import type { LegendFrame } from "./chart/legend/legend-frame.ts";
import type { LegendSeriesId, PaneHeading } from "./chart/legend/pane-legend.ts";
import type { PriceCandleData, VolumeSubAxisData } from "./SymbolClient.tsx";

const { PricePane } = await import("./SymbolClient.tsx");
const { ChartHostContext } = await import("./chart/host/registrar.ts");
const { LegendFrameContext } = await import("./chart/legend/legend-frame.ts");
const { createCrosshairSlotStore, EMPTY_PANE_HEADING } = await import("./chart/legend/pane-legend.ts");
const { BeyondCoverageBadge } = await import("./chart/marks/BeyondCoverageBadge.tsx");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(path.join(HERE, "[symbol]", "page.tsx"), "utf8");

/** `page.tsx` with every comment removed — the asserts below ask what the CODE does, and this
 * file's route documents the retired scalar price series in prose. Same crude stripper, same
 * justification, as `cvd-pane-dom-contract.test.ts`'s. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. THE ROUTE READS FOUR SERIES, EACH ONE ITS OWN ─────────────────────────────────────────

test("the route resolves the FOUR klines_ohlc reductions, by identity, through the unique-match helper", () => {
  for (const reduction of ["OPEN", "HIGH", "LOW", "CLOSE"]) {
    assert.match(
      pageCode,
      new RegExp(`resolveOhlcCatalogEntry\\(catalog, catalogStatus, routeSymbol, "${reduction}"\\)`),
      `the route does not resolve ${reduction} — a candle missing one reading is a candle nobody can draw`,
    );
  }
  assert.match(
    pageCode,
    /resolveCatalogEntry\(catalog, symbol, \(entry\) => matchesKlinesOhlc\(entry\.key, reduction\)\)/,
    "the four must resolve by metric + provider + reduction, never by metric alone",
  );
});

test("⛔ each reduction is fetched SEPARATELY and fed to its OWN field — the defect here is silent", () => {
  // A candle assembled with `open: closeResult.rows` draws a body of exactly zero pixels while
  // every other number on screen stays plausible. That is the half-degenerate `RN-2` retired,
  // and it is one character away at this call site.
  for (const [field, result] of [
    ["open", "openResult"],
    ["high", "highResult"],
    ["low", "lowResult"],
    ["close", "closeResult"],
  ] as const) {
    assert.match(
      pageCode,
      new RegExp(`${field}: ${result}\\.rows,`),
      `assembleOhlcCandles' \`${field}\` must come from \`${result}\`, not from a sibling reduction`,
    );
  }
  assert.match(pageCode, /const candleAssembly = assembleOhlcCandles\(\{/);
  assert.match(
    pageCode,
    /candles: candleAssembly\.candles,/,
    "the panel must draw the assembled candles — anything else is a second assembly (RN-2)",
  );
});

test("the price panel degrades on ALL FOUR statuses, never on one of them", () => {
  assert.match(
    pageCode,
    /const priceStatus = firstAbsentStatus\(\[\s*openResult\.status,\s*highResult\.status,\s*lowResult\.status,\s*closeResult\.status,\s*\]\)/,
    "one failing series means no candle anywhere — the panel must say so instead of reporting ok",
  );
  assert.match(pageCode, /price: priceStatus,/, "and that status is the one the pane renders");
});

test("the retired scalar price series is NOT fetched any more — it only opens the live stream", () => {
  assert.match(
    pageCode,
    /price: buildLiveUrl\(baseUrl, routeSymbol, resolvedEntry\(priceLiveStreamResolution\)\)/,
    "the live-stream row keeps its own resolution, named for what it is",
  );
  assert.ok(
    !/fetchPanelRows\(priceLiveStreamResolution/.test(pageCode),
    "fetching a series nothing draws is a request per render that no pixel depends on",
  );
  assert.ok(
    !/rawCandlesFromHistoryRows/.test(pageCode),
    "the degenerate mapping must not come back through the route either (RN-2)",
  );
});
test("the drawn-candle count is counted off the SLOTS the canvas gets, never off the raw rows", () => {
  assert.match(
    pageCode,
    /drawnCandles: countPresentCandleSlots\(panels\.price\.series\.slots\)/,
    "the printed number and the plotted bars must come from one array",
  );
  assert.match(pageCode, /gridSlots: panels\.price\.series\.slots\.length/);
  assert.match(pageCode, /partialBuckets: candleAssembly\.partialBuckets/);
});

// ── 2. WHAT THE PANE DECLARES ABOUT THE BARS IT DREW — rendered ──────────────────────────────

/** The selector `T-01.11`'s e2e will `page.locator()` by. Written out ON PURPOSE: a contract with
 * another task is not guarded by importing the constant it is made of. */
const EXPECTED_TESTID = "price-pane";
/** The machine key of the candle count. ⛔ ASCII, and NOT derived from the pt-BR label beside it
 * (`SPEC-008`/`D7`, `RF-8`/`RN-5`). */
const EXPECTED_CANDLES_FACT = "price_candles";

// A three-minute window on the 1m grid, one candle on its LAST slot: the readout resolves `exact`.
const WINDOW_START_MS = Date.UTC(2026, 9, 3, 0, 0);
const WINDOW = { startMs: WINDOW_START_MS, endMsExclusive: WINDOW_START_MS + 3 * ONE_MINUTE_MS, days: ["2026-10-03"] };
const PANELS = buildS2Panels({
  window: WINDOW,
  axisStepMs: ONE_MINUTE_MS,
  candles: [{ openTimeMs: WINDOW_START_MS + 2 * ONE_MINUTE_MS, open: 10, high: 12, low: 9, close: 11, volume: 0 }],
  priceUse: S2_PRICE_USE,
  oiPoints: [],
  oiMissingDays: [],
  cvdDeltas: [],
  cvdMissingDays: [],
  cvdCoveredDays: [],
});
const NO_COVERAGE_GAP: CoverageMagnitude = {
  partialBuckets: 0,
  reaggregatedBuckets: 0,
  missingFacts: 0,
  expectedFacts: 0,
  headExcludedFacts: 0,
  nativeGridMs: ONE_MINUTE_MS,
};
const VOLUME: VolumeSubAxisData = {
  slots: PANELS.oi.slots,
  legendSlots: PANELS.oi.slots,
  presentPoints: 0,
  firstPresentMs: null,
  reading: { kind: "absent", value: null },
  partialCoverage: NO_COVERAGE_GAP,
};
const HEADINGS: Readonly<Record<LegendSeriesId, PaneHeading>> = {
  price: EMPTY_PANE_HEADING,
  volume: EMPTY_PANE_HEADING,
  oi: EMPTY_PANE_HEADING,
  cvd: EMPTY_PANE_HEADING,
  liquidation_long: EMPTY_PANE_HEADING,
  liquidation_short: EMPTY_PANE_HEADING,
  long_short: EMPTY_PANE_HEADING,
};
const LEGEND_FRAME: LegendFrame = {
  legends: { price: null, volume: null, oi: null, cvd: null, liquidation_long: null, liquidation_short: null, long_short: null },
  axisStepMs: ONE_MINUTE_MS,
  asOfMs: WINDOW.endMsExclusive,
  bucketMs: ONE_MINUTE_MS,
  headings: HEADINGS,
};

/** Renders `PricePane` inside the two contexts it reads — a chart host that only RECORDS which panes
 * registered (no canvas: the series are `price-candle.test.ts`'s) and the legend frame. */
async function renderPricePane(priceCandles: PriceCandleData) {
  const registered: string[] = [];
  const registrar: PaneRegistrar = {
    surfaceRef: { current: null },
    crosshairStore: createCrosshairSlotStore(),
    register: (instanceKey) => {
      registered.push(instanceKey);
      return () => undefined;
    },
    refeed: () => undefined,
  };
  const pane = createElement(PricePane, {
    panels: PANELS,
    priceCandles,
    status: { kind: "ok" },
    volume: VOLUME,
    volumeStatus: { kind: "ok" },
  });
  const rendered = await render(
    createElement(ChartHostContext.Provider, { value: registrar }, createElement(LegendFrameContext.Provider, { value: LEGEND_FRAME }, pane)),
  );
  return { ...rendered, registered };
}

/** The predicates under test — each one read by the positive render AND by its control. */
function pricePaneOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${EXPECTED_TESTID}"]`);
}
function candleFactOf(container: HTMLElement): string | null {
  return pricePaneOf(container)?.querySelector(`[data-fact^="${EXPECTED_CANDLES_FACT}:"]`)?.getAttribute("data-fact") ?? null;
}
function wallBadgesIn(root: ParentNode): number {
  return root.querySelectorAll('[data-fact$=":beyond"]').length;
}

test("T-01.11 contract: the pane carries the stable testid AND the drawn-candle count, on the SAME element", async () => {
  const rendered = await renderPricePane({ drawnCandles: 7, gridSlots: 9, partialBuckets: 2 });
  const pane = pricePaneOf(rendered.container);
  assert.ok(pane !== null, `no [data-testid="${EXPECTED_TESTID}"] — the e2e finds the pane by this exact string`);
  assert.equal(pane.getAttribute("aria-label"), "Preço");
  assert.equal(pane.getAttribute("data-price-candles"), "7", "a sibling is invisible to getAttribute");
  assert.deepEqual(rendered.registered, ["price"], "the pane declared itself to the chart host, once");
  rendered.unmount();
});

test("the candle facts are published as a machine key, in ASCII, with BOTH numbers and the partial buckets", async () => {
  const rendered = await renderPricePane({ drawnCandles: 7, gridSlots: 9, partialBuckets: 2 });
  const fact = candleFactOf(rendered.container);
  assert.equal(fact, `${EXPECTED_CANDLES_FACT}:7/9`, "the fact must carry the pair — a bare count cannot say 7 OF WHAT");
  assert.ok(/^[\x20-\x7E]+$/.test(fact), "a machine key an operator's grep cannot type is a key nobody queries (SPEC-008/D7)");
  const factElement = pricePaneOf(rendered.container)?.querySelector(`[data-fact="${fact}"]`);
  assert.equal(
    factElement?.getAttribute("data-price-partial-buckets"),
    "2",
    "the partial buckets must reach the DOM: without their own number they read as plain absence",
  );
  rendered.unmount();
});

test("negative control by PROP mutation: the count, the fact and the partial buckets TRACK priceCandles", async () => {
  const rendered = await renderPricePane({ drawnCandles: 3, gridSlots: 5, partialBuckets: 1 });
  assert.equal(candleFactOf(rendered.container), `${EXPECTED_CANDLES_FACT}:3/5`);
  assert.throws(() => assert.equal(candleFactOf(rendered.container), `${EXPECTED_CANDLES_FACT}:7/9`));
  assert.equal(pricePaneOf(rendered.container)?.getAttribute("data-price-candles"), "3");
  assert.equal(
    pricePaneOf(rendered.container)?.querySelector("[data-price-partial-buckets]")?.getAttribute("data-price-partial-buckets"),
    "1",
  );
  rendered.unmount();
});

test("RN-1 in words: the pane says the lacuna is a lacuna, and names what it is NOT", async () => {
  // Microcopy is pt-BR and the `ui-designer` owns its form (`T-01.10`); what a builder guards is
  // that the DISTINCTION is stated at all.
  const rendered = await renderPricePane({ drawnCandles: 7, gridSlots: 9, partialBuckets: 2 });
  const text = pricePaneOf(rendered.container)?.textContent ?? "";
  assert.match(text, /em lacuna/, "the incomplete bucket must be named on screen");
  assert.match(text, /nunca uma vela de altura zero/, "a flat bar IS a market that did not move");
  rendered.unmount();
});

test("T-05.6 DoD item 2: price is structurally excluded from the wall badge — its render carries none", async () => {
  // PRESENCE control first, same predicate: the selector does see a badge where there is one.
  const badge = await render(createElement(BeyondCoverageBadge, { factKey: "oi_coverage" }));
  assert.equal(wallBadgesIn(badge.container), 1, "the predicate must see the badge it is about to say is absent");
  badge.unmount();
  const rendered = await renderPricePane({ drawnCandles: 7, gridSlots: 9, partialBuckets: 2 });
  const pane = pricePaneOf(rendered.container);
  assert.ok(pane !== null, "anchor: the price pane rendered — an empty render would pass the absence below");
  assert.equal(wallBadgesIn(pane), 0, "price must never name the wall: it keeps drawing bars past it");
  rendered.unmount();
});
