// Unit tests for the GridSlot/ScalarSlot -> lightweight-charts shape mapping.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  absenceMarkSeries,
  candlestickSeriesLossless,
  lineSeriesLossless,
  naiveDropGapsLine,
  positiveValueSeriesLossless,
  zeroMarkSeries,
} from "./s2-lightweight-adapter.ts";
import type { GridSlot } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

test("candlestickSeriesLossless emits one item per slot, whitespace for gaps, seconds not ms", () => {
  const slots: readonly GridSlot[] = [
    { time: 60_000, candle: { openTimeMs: 60_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 } },
    { time: 120_000, candle: null },
  ];
  const items = candlestickSeriesLossless(slots);
  assert.deepEqual(items[0], { time: 60, open: 1, high: 2, low: 0.5, close: 1.5 });
  assert.deepEqual(items[1], { time: 120 });
  assert.equal(Object.keys(items[1]).length, 1, "the gap item must carry ONLY time — no OHLC key at all");
});

test("lineSeriesLossless mirrors the same contract for scalar slots", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 42 },
    { time: 300_000, value: null },
  ];
  const items = lineSeriesLossless(slots);
  assert.deepEqual(items[0], { time: 0, value: 42 });
  assert.deepEqual(items[1], { time: 300 });
});

test("toUnixSeconds refuses a time that is not a whole number of seconds", () => {
  const slots: readonly ScalarSlot[] = [{ time: 1500, value: 1 }];
  assert.throws(() => lineSeriesLossless(slots), RangeError);
});

test("naiveDropGapsLine (the negative control) actually drops gap slots instead of marking them", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 1 },
    { time: 300_000, value: null },
    { time: 600_000, value: 2 },
  ];
  const items = naiveDropGapsLine(slots);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.time),
    [0, 600],
  );
});

// ── `T-01.8` — os três mapeamentos que o `design_gate` da fase `01` exigiu ────────────────────
//
// `BLOCKER-1` (escala log10) e `BLOCKER-2` (a ausência sem marca) de
// `docs/context/cinco-metricas-do-core/gates/design-01.md`. Os testes abaixo provam a
// GEOMETRIA pura; que a configuração de produção de fato usa estas funções, e com que altura em
// pixel, é medido contra a biblioteca real em
// `src/app/symbol/volume-subaxis-geometry.test.ts`.

test("positiveValueSeriesLossless: um item por slot, e SÓ o valor estritamente positivo vira barra", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 42 },
    { time: 60_000, value: null },
    { time: 120_000, value: 0 },
    { time: 180_000, value: 0.5 },
  ];
  const items = positiveValueSeriesLossless(slots);
  assert.equal(items.length, slots.length, "a posição de eixo de cada slot tem de sobreviver");
  assert.deepEqual(items[0], { time: 0, value: 42 });
  assert.deepEqual(items[1], { time: 60 }, "ausência é whitespace");
  assert.deepEqual(items[2], { time: 120 }, "o zero legítimo SAI da série de barras — quem o desenha é zeroMarkSeries");
  assert.deepEqual(items[3], { time: 180, value: 0.5 });
});

test("positiveValueSeriesLossless recusa um valor negativo em vez de escondê-lo num dos três baldes", () => {
  assert.throws(() => positiveValueSeriesLossless([{ time: 0, value: -1 }]), RangeError);
});

test("absenceMarkSeries marca EXATAMENTE as lacunas, e é o inverso de positiveValueSeriesLossless", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 42 },
    { time: 60_000, value: null },
    { time: 120_000, value: 0 },
  ];
  const marks = absenceMarkSeries(slots, 2);
  assert.deepEqual(marks[0], { time: 0 });
  assert.deepEqual(marks[1], { time: 60, value: 2 });
  assert.deepEqual(marks[2], { time: 120 }, "zero legítimo NÃO é lacuna — é a colisão que o BLOCKER-2 proíbe");
  // Inverso, dito como propriedade e não como três asserts: nenhum instante carrega marca nas
  // duas séries, e todo instante carrega marca em exatamente uma das três.
  const bars = positiveValueSeriesLossless(slots);
  const zeros = zeroMarkSeries(slots, 6);
  for (let i = 0; i < slots.length; i += 1) {
    const drawn = [bars[i]!, marks[i]!, zeros[i]!].filter((item) => "value" in item).length;
    assert.equal(drawn, 1, `o instante ${slots[i]!.time} tem de ser desenhado por exatamente UMA das três séries`);
  }
});

test("zeroMarkSeries marca o zero legítimo — inclusive -0, que é zero relatado", () => {
  const marks = zeroMarkSeries([{ time: 0, value: -0 }, { time: 60_000, value: null }], 6);
  assert.deepEqual(marks[0], { time: 0, value: 6 });
  assert.deepEqual(marks[1], { time: 60 });
});

test("MORDE: uma marca de altura 0 (ou não-finita) é recusada — ela seria indistinguível da ausência", () => {
  for (const markValue of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => absenceMarkSeries([{ time: 0, value: null }], markValue),
      RangeError,
      `markValue=${markValue} passou — a guarda é vazia`,
    );
    assert.throws(() => zeroMarkSeries([{ time: 0, value: 0 }], markValue), RangeError);
  }
});
