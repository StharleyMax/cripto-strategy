/**
 * `estrutura-do-front` `T-03.3` (plan `03` items `3.2b` and `3.3`, `SPEC-011 §3`, `G-R`, `RF-4`) —
 * the shape the history path keys every per-series value by: the core's four price reductions,
 * and then one record PER INDICATOR, keyed by the slot names that indicator declared.
 *
 * Before this module, the keys, the rows and the declared coverage of a page were three
 * hand-written ten-field objects (`open`, …, `liquidationLong`, `longShort`), and the pager fired
 * ten hand-written fetches. A series the catalog added had to be spelled in four places of the
 * core, and the core named every indicator. Now the pager walks the TABLE it receives
 * (`historyFetchPlan`), and the records are built from that walk.
 *
 * ⛔ The core does NOT import `indicators/catalog.ts` (P2, `SPEC-011 §5.3`): `HistorySeriesTable`
 * is the core's own view of that table — a kind, and the slot of each series — and
 * `SymbolClient.tsx`, which may import the catalog, passes it in BY PARAMETER.
 *
 * Price is not an indicator (`gates/FRONTEND-ARCH-estudo.md` §2.1): its four reductions are the
 * core's, fixed, and come first in every plan.
 */

import type { SeriesRequirement } from "./series-requirement.ts";

/** The core's four price reductions, in the order every plan fetches them. */
export const PRICE_SLOTS = ["open", "high", "low", "close"] as const;
export type PriceSlot = (typeof PRICE_SLOTS)[number];

/** What the core reads of one row of the indicator table: its kind and the slot of each series. */
export interface HistorySeriesTableEntry {
  readonly kind: string;
  readonly series: readonly Pick<SeriesRequirement, "slot">[];
}

/** The indicator table, as the core sees it. `INDICATOR_CATALOG` is one. */
export type HistorySeriesTable = readonly HistorySeriesTableEntry[];

/** One value per series a page carries: the four price reductions, then `kind → slot → value`. */
export interface SeriesSlotRecord<V> {
  readonly price: Readonly<Record<PriceSlot, V>>;
  readonly indicators: Readonly<Record<string, Readonly<Record<string, V>>>>;
}

/** Where one series lives in a `SeriesSlotRecord`. */
export type SeriesAddress =
  | { readonly group: "price"; readonly slot: PriceSlot }
  | { readonly group: "indicator"; readonly kind: string; readonly slot: string };

export class SeriesSlotError extends Error {}

function addressLabel(address: SeriesAddress): string {
  return address.group === "price" ? `price/${address.slot}` : `${address.kind}/${address.slot}`;
}

/**
 * Every series ONE history page fetches, in order: the four price reductions, then every slot of
 * every entry of `table`, in table order. A table that forgets a series fetches one fewer — the
 * `10` of `ADR-050/D5` is the length of this list over `INDICATOR_CATALOG`.
 *
 * Refuses a repeated kind and a slot repeated within one kind: either would fold two series onto
 * the same key of the records below, and the second fetch would overwrite the first.
 */
export function historyFetchPlan(table: HistorySeriesTable): readonly SeriesAddress[] {
  const plan: SeriesAddress[] = PRICE_SLOTS.map((slot) => ({ group: "price", slot }));
  const kinds = new Set<string>();
  for (const entry of table) {
    if (kinds.has(entry.kind)) {
      throw new SeriesSlotError(`history table: kind "${entry.kind}" appears twice`);
    }
    kinds.add(entry.kind);
    const slots = new Set<string>();
    for (const series of entry.series) {
      if (slots.has(series.slot)) {
        throw new SeriesSlotError(`history table: slot "${series.slot}" appears twice under kind "${entry.kind}"`);
      }
      slots.add(series.slot);
      plan.push({ group: "indicator", kind: entry.kind, slot: series.slot });
    }
  }
  return plan;
}

/**
 * The value under `address`. Throws when the record has none: a record built by another table
 * than the one walking it is a contract break between `page.tsx` and the pager, and reading it as
 * "no rows" would hide it.
 */
export function slotValueAt<V>(record: SeriesSlotRecord<V>, address: SeriesAddress): V {
  if (address.group === "price") {
    return record.price[address.slot];
  }
  const bySlot = Object.hasOwn(record.indicators, address.kind) ? record.indicators[address.kind] : undefined;
  if (bySlot === undefined || !Object.hasOwn(bySlot, address.slot)) {
    throw new SeriesSlotError(`series record: no value under ${addressLabel(address)}`);
  }
  return bySlot[address.slot] as V;
}

/** Builds a record over `plan`, one value per address. */
export function slotRecordOf<V>(plan: readonly SeriesAddress[], valueAt: (address: SeriesAddress, index: number) => V): SeriesSlotRecord<V> {
  const price: Partial<Record<PriceSlot, V>> = {};
  const indicators: Record<string, Record<string, V>> = {};
  plan.forEach((address, index) => {
    const value = valueAt(address, index);
    if (address.group === "price") {
      price[address.slot] = value;
      return;
    }
    (indicators[address.kind] ??= {})[address.slot] = value;
  });
  for (const slot of PRICE_SLOTS) {
    if (!Object.hasOwn(price, slot)) {
      throw new SeriesSlotError(`series record: the plan has no price/${slot}`);
    }
  }
  return { price: price as Record<PriceSlot, V>, indicators };
}

/** The same record with every value mapped — the shape is kept, not re-derived from a table. */
export function mapSlotRecord<V, W>(record: SeriesSlotRecord<V>, map: (value: V) => W): SeriesSlotRecord<W> {
  const price = Object.fromEntries(PRICE_SLOTS.map((slot) => [slot, map(record.price[slot])])) as Record<PriceSlot, W>;
  const indicators = Object.fromEntries(
    Object.entries(record.indicators).map(([kind, bySlot]) => [
      kind,
      Object.fromEntries(Object.entries(bySlot).map(([slot, value]) => [slot, map(value)])),
    ]),
  );
  return { price, indicators };
}

/** Every value of the record, price first. */
export function slotRecordValues<V>(record: SeriesSlotRecord<V>): readonly V[] {
  return [
    ...PRICE_SLOTS.map((slot) => record.price[slot]),
    ...Object.values(record.indicators).flatMap((bySlot) => Object.values(bySlot)),
  ];
}

/**
 * The value of indicator series `kind/slot`, read only if `table` declares it. This is how
 * `panel-assembly.ts` reads its rows: an assembly that reads a series the table does not ask for
 * is reading rows no page fetches, and it throws instead of deriving from the SSR window forever.
 */
export function tableSlotValue<V>(table: HistorySeriesTable, record: SeriesSlotRecord<V>, kind: string, slot: string): V {
  const declared = table.some((entry) => entry.kind === kind && entry.series.some((series) => series.slot === slot));
  if (!declared) {
    throw new SeriesSlotError(`history table: no series "${slot}" under kind "${kind}"`);
  }
  return slotValueAt(record, { group: "indicator", kind, slot });
}
