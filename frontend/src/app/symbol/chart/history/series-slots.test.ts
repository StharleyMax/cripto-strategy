// `estrutura-do-front` `T-03.3` — `series-slots.ts`, the slot-keyed records of the history path and
// the fetch plan the pager walks. The table here is a LITERAL with the shape of `INDICATOR_CATALOG`:
// this file is under `chart/**`, which does not import `indicators/**` (P2, `SPEC-011 §5.3`). The
// count over the real catalog is `../../history-pager-requests.test.ts`.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  historyFetchPlan,
  mapSlotRecord,
  SeriesSlotError,
  slotRecordOf,
  slotRecordValues,
  slotValueAt,
  tableSlotValue,
  type HistorySeriesTable,
  type SeriesAddress,
} from "./series-slots.ts";

const TABLE: HistorySeriesTable = [
  { kind: "volume", series: [{ slot: "volume" }] },
  { kind: "liquidation", series: [{ slot: "long" }, { slot: "short" }] },
  { kind: "oi", series: [{ slot: "oi" }] },
  { kind: "long_short", series: [{ slot: "ratio" }] },
  { kind: "cvd", series: [{ slot: "cvd" }] },
];

function label(address: SeriesAddress): string {
  return address.group === "price" ? `price/${address.slot}` : `${address.kind}/${address.slot}`;
}

test("the plan is the four price reductions, then every series of the table in table order", () => {
  assert.deepEqual(historyFetchPlan(TABLE).map(label), [
    "price/open",
    "price/high",
    "price/low",
    "price/close",
    "volume/volume",
    "liquidation/long",
    "liquidation/short",
    "oi/oi",
    "long_short/ratio",
    "cvd/cvd",
  ]);
});

test("MORDE: a table that forgets a series plans one fetch fewer — the 10 of ADR-050/D5 is the table's", () => {
  const forgetful = TABLE.map((entry) => (entry.kind === "liquidation" ? { ...entry, series: entry.series.slice(0, 1) } : entry));
  assert.equal(historyFetchPlan(TABLE).length, 10);
  assert.equal(historyFetchPlan(forgetful).length, 9);
});

test("MORDE: a repeated kind, or a slot repeated under one kind, is refused — the second would overwrite the first", () => {
  assert.throws(() => historyFetchPlan([...TABLE, { kind: "oi", series: [{ slot: "other" }] }]), /kind "oi" appears twice/);
  assert.throws(
    () => historyFetchPlan([{ kind: "liquidation", series: [{ slot: "long" }, { slot: "long" }] }]),
    /slot "long" appears twice under kind "liquidation"/,
  );
  // The same slot NAME under two kinds is fine: slots are local to an indicator.
  assert.doesNotThrow(() => historyFetchPlan([{ kind: "a", series: [{ slot: "x" }] }, { kind: "b", series: [{ slot: "x" }] }]));
});

test("a record built over the plan reads back every address, price first, and maps without losing a slot", () => {
  const plan = historyFetchPlan(TABLE);
  const record = slotRecordOf(plan, (address) => label(address));
  for (const address of plan) {
    assert.equal(slotValueAt(record, address), label(address));
  }
  assert.deepEqual(slotRecordValues(record), plan.map(label));
  const mapped = mapSlotRecord(record, (value) => value.length);
  assert.deepEqual(slotRecordValues(mapped), plan.map((address) => label(address).length));
});

test("MORDE: an address the record does not carry throws, naming it — never read as an empty series", () => {
  const record = slotRecordOf(historyFetchPlan(TABLE), () => 0);
  assert.throws(() => slotValueAt(record, { group: "indicator", kind: "sma", slot: "line" }), SeriesSlotError);
  assert.throws(() => slotValueAt(record, { group: "indicator", kind: "oi", slot: "close" }), /no value under oi\/close/);
  // `Object.prototype` keys are not slots.
  assert.throws(() => slotValueAt(record, { group: "indicator", kind: "toString", slot: "x" }), SeriesSlotError);
});

test("MORDE: tableSlotValue refuses a series the table does not declare, even when the record carries it", () => {
  const record = slotRecordOf(historyFetchPlan(TABLE), () => 1);
  const withoutCvd = TABLE.filter((entry) => entry.kind !== "cvd");
  assert.equal(tableSlotValue(TABLE, record, "cvd", "cvd"), 1);
  assert.throws(() => tableSlotValue(withoutCvd, record, "cvd", "cvd"), /no series "cvd" under kind "cvd"/);
});
