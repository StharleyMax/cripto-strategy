// Testes de `T-07.12` — traducao do modelo de dominio para texto de tela, e o contrato de
// arredondamento/formatacao pt-BR (`Q14`: formatacao e so de MICROCOPY, nunca de dado).
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import { COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, RECONNECTION_EVENTS, STORAGE_BUDGET_LINES } from "./fixtures.ts";
import {
  buildS1ViewModel,
  formatPtBrDecimal,
  formatPtBrThousands,
  resilienceCellText,
  retentionCellText,
} from "./view-model.ts";

// ── formatadores: deterministicos, sem depender de locale de runtime (Q14) ──────────────

test("formatPtBrThousands agrupa milhares com ponto, como '2.206' e '14.204' na tela aprovada", () => {
  assert.equal(formatPtBrThousands(2206), "2.206");
  assert.equal(formatPtBrThousands(14204), "14.204");
  assert.equal(formatPtBrThousands(999), "999");
  assert.equal(formatPtBrThousands(-1500), "-1.500");
});

test("formatPtBrDecimal usa virgula decimal, como '1,5' e '7,0' na coluna JANELA_DE_PERDA", () => {
  assert.equal(formatPtBrDecimal(1.5319444, 1), "1,5");
  assert.equal(formatPtBrDecimal(7, 1), "7,0");
  assert.equal(formatPtBrDecimal(8, 0), "8");
});

// ── D7.12: celula de retencao, por variante de RetentionWindow ──────────────────────────

test("retentionCellText: computed_uniform produz o texto EXATO da linha OI 1m aprovada", () => {
  const cell = retentionCellText({ kind: "computed_uniform", points: 2206, intervalMinutes: 1, days: 2206 / 1440 });
  assert.equal(cell.primary, "2.206 pts × 1m ≈ 1,5 dia");
  assert.equal(cell.secondary, null);
});

test("retentionCellText: computed_uniform da linha OI 5m usa plural 'dias' e bate com 7,0", () => {
  const cell = retentionCellText({ kind: "computed_uniform", points: 2016, intervalMinutes: 5, days: 7 });
  assert.equal(cell.primary, "2.016 pts × 5m ≈ 7,0 dias");
});

test("retentionCellText: measured_sparse carrega a nota de regime como linha SECUNDARIA — D7.14", () => {
  const cell = retentionCellText({
    kind: "measured_sparse",
    points: 3052,
    intervalMinutes: 1,
    days: 8,
    regimeNote: "janela válida no regime atual, não garantida em cascata",
  });
  assert.equal(cell.primary, "3.052 pts × 1m ≈ 8 dias");
  assert.equal(cell.secondary, "janela válida no regime atual, não garantida em cascata");
});

test("retentionCellText: doc_only / unmeasured / not_applicable nunca inventam numero", () => {
  assert.equal(retentionCellText({ kind: "doc_only" }).primary, "[DOC-ONLY]");
  assert.equal(retentionCellText({ kind: "unmeasured" }).primary, "NÃO MEDIDA");
  assert.equal(retentionCellText({ kind: "not_applicable" }).primary, "-");
});

// ── D7.13: celula de resiliencia ─────────────────────────────────────────────────────────

test("resilienceCellText: slo_multiplier produz o texto EXATO 'T1m / SLO ~4.7x'", () => {
  assert.equal(resilienceCellText({ kind: "slo_multiplier", grade: "T1m", multiplier: 4.7 }), "T1m / SLO ~4.7x");
  assert.equal(resilienceCellText({ kind: "slo_multiplier", grade: "T5m", multiplier: 4.7 }), "T5m / SLO ~4.7x");
});

test("resilienceCellText: os tres outros casos batem com os rotulos da tela aprovada", () => {
  assert.equal(resilienceCellText({ kind: "unavailable" }), "-");
  assert.equal(resilienceCellText({ kind: "not_scored" }), "N/A");
  assert.equal(resilienceCellText({ kind: "external_sla", label: "S3 SLA" }), "S3 SLA");
});

// ── buildS1ViewModel: a montagem completa, sobre os fixtures canonicos ──────────────────

test("buildS1ViewModel ordena PARADO no topo mesmo com o fixture embaralhado", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  assert.equal(vm.rows[0]?.statusCell.status, "PARADO");
  assert.equal(vm.rows[0]?.series, "/futures/data/* · ws · BTC");
});

test("buildS1ViewModel: SO a linha PARADO carrega o glifo de stop — D17", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  const withGlyph = vm.rows.filter((row) => row.statusCell.glyph !== null);
  assert.equal(withGlyph.length, 1);
  assert.equal(withGlyph[0]?.statusCell.status, "PARADO");
});

test("buildS1ViewModel: todas as 6 linhas usam a MESMA classe de badge neutra — D17", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  const classes = new Set(vm.rows.map((row) => row.statusCell.badgeClass));
  assert.equal(classes.size, 1);
  assert.equal(vm.rows.length, 6);
});

test("buildS1ViewModel: orcamento total bate com a soma das linhas e com o '1.6 GB' aprovado", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  assert.equal(vm.storageBudget.totalText, "1.6 GB");
  assert.equal(vm.storageBudget.lines.length, 3);
  const parado = vm.storageBudget.lines.find((line) => line.label === "/futures/data/*");
  assert.equal(parado?.valueText, "PARADO", "coletor parado nao soma um GB/dia silencioso");
});

test("buildS1ViewModel: fila ETL formatada bate com '14.204' da tela aprovada", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  assert.equal(vm.storageBudget.etlQueueDepthText, "14.204");
});

test("buildS1ViewModel: reconexoes passam intactas, 5 eventos, mesma ordem do fixture — D7.15", () => {
  const vm = buildS1ViewModel(COLLECTOR_ROWS, ETL_QUEUE_DEPTH_PENDING, STORAGE_BUDGET_LINES, RECONNECTION_EVENTS);
  assert.equal(vm.reconnectionEvents.length, 5);
  assert.deepEqual(vm.reconnectionEvents, RECONNECTION_EVENTS);
  // Falsificador de tipo, nao de runtime: `ReconnectionEvent` nao tem campo de severidade,
  // entao nao ha como este teste (nem nenhum outro) discriminar "drop" de "resume" por cor —
  // ver o comentario de `ReconnectionEvent` em domain.ts.
});
