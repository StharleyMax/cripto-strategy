/**
 * `T-01.10` (`ADR-044/D2′`, `handoff/T-01.10-desenho.md` §4 row F-E) — the host's feed ORDER: the
 * carrier first, with `axis.slotCount` items and never filtered; then every pane feed as plot items
 * only (or lossless under `?e2eDenseSeries=1`). Plus the parse of the two `e2e…` switches.
 *
 * The MORDE tests build the two named mutations of F-E by hand and show the invariant rejects them.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { gridCarrierItems, isPlotItem, lineSeriesLossless, plotItemsOnly, type TimeAxis } from "../../charts/index.ts";
import {
  busyWait,
  DENSE_SERIES_ABLATION_QUERY_PARAM,
  hostSeriesFeeds,
  isDenseSeriesAblationRequested,
  PAGE_APPLY_BUSY_MAX_MS,
  PAGE_APPLY_BUSY_QUERY_PARAM,
  paneSeriesFeeds,
  requestedPageApplyBusyMs,
  type SeriesFeed,
} from "./host-series-feed.ts";

const AXIS: TimeAxis = { startMs: 1_700_000_040_000, stepMs: 60_000, slotCount: 10 };
const VALUES: readonly (number | null)[] = [1, null, null, 4, 5, null, 7, 0, null, 10];

function paneFeeds(): readonly SeriesFeed<string>[] {
  const slots = VALUES.map((value, index) => ({ time: AXIS.startMs + index * AXIS.stepMs, value }));
  return [
    { series: "price", items: lineSeriesLossless(slots) },
    { series: "oi", items: lineSeriesLossless(slots.map((slot) => ({ ...slot, value: slot.value === null ? 3 : null }))) },
  ];
}

/** The invariant F-E states, as one predicate over a feed sequence. */
function violatesCarrierFirst(feeds: readonly SeriesFeed<string>[], carrier: string, axis: TimeAxis): string | null {
  const first = feeds[0];
  if (first === undefined || first.series !== carrier) {
    return "the carrier is not the first feed";
  }
  if (first.items.length !== axis.slotCount) {
    return `the carrier has ${first.items.length} items, not axis.slotCount=${axis.slotCount}`;
  }
  const grid = new Set(first.items.map((item) => item.time));
  for (const feed of feeds.slice(1)) {
    if (feed.series === carrier) {
      return "the carrier is fed twice";
    }
    if (!feed.items.every((item) => grid.has(item.time))) {
      return `pane ${feed.series} carries a time off the grid`;
    }
  }
  return null;
}

test("F-E: the carrier is fed FIRST, with exactly axis.slotCount {time} items", () => {
  const feeds = hostSeriesFeeds("carrier", AXIS, paneFeeds(), false);
  assert.equal(violatesCarrierFirst(feeds, "carrier", AXIS), null);
  assert.deepEqual(feeds[0]!.items, gridCarrierItems(AXIS));
  assert.deepEqual(
    feeds.map((feed) => feed.series),
    ["carrier", "price", "oi"],
  );
});

test("F-E: every pane feed is plot items only, in the panes' order, times ⊆ grid", () => {
  const input = paneFeeds();
  const feeds = hostSeriesFeeds("carrier", AXIS, input, false).slice(1);
  feeds.forEach((feed, index) => {
    assert.ok(feed.items.every(isPlotItem), `${feed.series}: a whitespace item reached setData`);
    assert.deepEqual(feed.items, plotItemsOnly(input[index]!.items));
  });
  assert.equal(feeds[0]!.items.length, 6); // 10 slots, 4 null; the 0 at slot 7 is a plot item
});

test("ablation ?e2eDenseSeries=1: the panes get the lossless items of before, and the carrier STAYS first", () => {
  const input = paneFeeds();
  const feeds = hostSeriesFeeds("carrier", AXIS, input, true);
  assert.equal(violatesCarrierFirst(feeds, "carrier", AXIS), null);
  assert.equal(feeds[1]!.items, input[0]!.items);
  assert.equal(feeds[1]!.items.length, AXIS.slotCount);
});

test("MORDE F-E: the carrier fed through plotItemsOnly is REJECTED (it would carry no grid)", () => {
  const good = hostSeriesFeeds("carrier", AXIS, paneFeeds(), false);
  const mutant = [{ series: "carrier", items: plotItemsOnly(good[0]!.items) }, ...good.slice(1)];
  assert.match(violatesCarrierFirst(mutant, "carrier", AXIS) ?? "", /not axis.slotCount/);
});

test("MORDE F-E: the carrier placed AFTER the panes is REJECTED", () => {
  const good = hostSeriesFeeds("carrier", AXIS, paneFeeds(), false);
  const mutant = [...good.slice(1), good[0]!];
  assert.match(violatesCarrierFirst(mutant, "carrier", AXIS) ?? "", /not the first feed/);
});

test("paneSeriesFeeds keeps the series identity of each feed", () => {
  const input = paneFeeds();
  assert.deepEqual(
    paneSeriesFeeds(input, false).map((feed) => feed.series),
    input.map((feed) => feed.series),
  );
});

test("the dense ablation switch reads only `=1`", () => {
  assert.equal(isDenseSeriesAblationRequested(`?${DENSE_SERIES_ABLATION_QUERY_PARAM}=1`), true);
  assert.equal(isDenseSeriesAblationRequested(`?${DENSE_SERIES_ABLATION_QUERY_PARAM}=0`), false);
  assert.equal(isDenseSeriesAblationRequested(`?${DENSE_SERIES_ABLATION_QUERY_PARAM}=true`), false);
  assert.equal(isDenseSeriesAblationRequested(""), false);
});

test("the busy-wait switch: whole milliseconds only, capped, 0 otherwise", () => {
  assert.equal(requestedPageApplyBusyMs(`?${PAGE_APPLY_BUSY_QUERY_PARAM}=80`), 80);
  assert.equal(requestedPageApplyBusyMs(`?${PAGE_APPLY_BUSY_QUERY_PARAM}=99999`), PAGE_APPLY_BUSY_MAX_MS);
  assert.equal(requestedPageApplyBusyMs(`?${PAGE_APPLY_BUSY_QUERY_PARAM}=-5`), 0);
  assert.equal(requestedPageApplyBusyMs(`?${PAGE_APPLY_BUSY_QUERY_PARAM}=1.5`), 0);
  assert.equal(requestedPageApplyBusyMs(`?${PAGE_APPLY_BUSY_QUERY_PARAM}=abc`), 0);
  assert.equal(requestedPageApplyBusyMs(""), 0);
});

test("busyWait spins until the clock has advanced by the duration, and not at all for 0", () => {
  let clock = 0;
  let reads = 0;
  const now = () => {
    reads += 1;
    clock += 10;
    return clock;
  };
  busyWait(50, now);
  assert.ok(clock >= 60, `clock ${clock}`);
  const readsBefore = reads;
  busyWait(0, now);
  assert.equal(reads, readsBefore);
});
