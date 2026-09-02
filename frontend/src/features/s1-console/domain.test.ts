// Testes de `T-07.12` — `DoD D7.12`-`D7.15` e `D17` (STITCH_CONTEXT.md §9 item 5).
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  badgeClassForStatus,
  computeUniformWindowDays,
  DECLARED_SLO_TRAIL_MULTIPLIER,
  makeComputedUniformWindow,
  NEUTRAL_STATUS_BADGE_CLASS,
  orderRowsBySeverity,
  resilienceMultiplierFromWindows,
  STOPPED_STATUS_GLYPH,
  totalStorageBudgetGbPerDay,
  type CollectorRow,
  type CollectorStatus,
} from "./domain.ts";

// ── D7.12: janela_de_perda é FÓRMULA, verificada contra os números publicados no plano ──

test("computeUniformWindowDays reproduz o caso EXATO do plano: OI grade 1m, 2.206 pts", () => {
  const days = computeUniformWindowDays(2206, 1);
  assert.equal(days.toFixed(1), "1.5", "plano D7.12: 2.206 pts x 1m ~= 1,5 dia");
});

test("makeComputedUniformWindow mantem points/intervalMinutes/days em sincronia", () => {
  const window = makeComputedUniformWindow(2016, 5);
  assert.equal(window.kind, "computed_uniform");
  assert.equal(window.points, 2016);
  assert.equal(window.intervalMinutes, 5);
  assert.equal(window.days, 7, "2016 * 5 / 1440 = 7.0 exatamente — escolha do fixture, ver fixtures.ts");
});

test("computeUniformWindowDays recusa points/intervalMinutes nao positivos", () => {
  assert.throws(() => computeUniformWindowDays(0, 1), RangeError);
  assert.throws(() => computeUniformWindowDays(-5, 1), RangeError);
  assert.throws(() => computeUniformWindowDays(100, 0), RangeError);
});

// ── D7.14: a serie de liquidacao e ESPARSA — a formula uniforme NAO reproduz o numero ──
// publicado (8 dias), e essa DIFERENCA e o motivo de existir o tipo `measured_sparse` em
// vez de forcar `computed_uniform` sobre uma serie que nao tem cadencia regular.

test("D7.14 falsificador: a formula uniforme NAO reproduz a janela publicada da serie esparsa", () => {
  const naive = computeUniformWindowDays(3052, 1);
  assert.notEqual(
    naive.toFixed(1),
    "8.0",
    "se isto passasse a bater, `Liq · grade 1m` deixaria de precisar do tipo measured_sparse",
  );
  assert.ok(naive < 3, "3.052 pts x 1m uniforme daria ~2,1 dias, bem abaixo dos 8 dias medidos");
});

// ── D7.13: o multiplicador declarado (~4,7x) e consistente com as duas janelas do plano ──

test("resilienceMultiplierFromWindows(1.5, 7.0) arredonda para o multiplicador declarado", () => {
  const ratio = resilienceMultiplierFromWindows(1.5, 7.0);
  assert.equal(ratio.toFixed(1), DECLARED_SLO_TRAIL_MULTIPLIER.toFixed(1));
});

test("resilienceMultiplierFromWindows recusa janela de 1m nao positiva", () => {
  assert.throws(() => resilienceMultiplierFromWindows(0, 7), RangeError);
});

// ── D17: severidade e POSICAO + GLIFO, nunca cor ──────────────────────────────────────

function rowWithStatus(status: CollectorStatus): CollectorRow {
  return {
    series: `serie-${status}`,
    retention: { kind: "not_applicable" },
    resilience: { kind: "unavailable" },
    status,
    uptimePercent: null,
    statusDetail: null,
  };
}

test("D17 falsificador: as 4 badges de status compartilham a MESMA classe neutra", () => {
  const statuses: CollectorStatus[] = ["ATIVO", "PARADO", "ARQUIVO", "PENDENTE"];
  const classes = new Set(statuses.map(badgeClassForStatus));
  assert.equal(classes.size, 1, "uma segunda classe aqui seria cor-por-severidade, que D17 proibe");
  assert.equal([...classes][0], NEUTRAL_STATUS_BADGE_CLASS);
});

test("orderRowsBySeverity move o coletor PARADO para o topo, preservando a ordem dos demais", () => {
  const rows = [rowWithStatus("ATIVO"), rowWithStatus("ARQUIVO"), rowWithStatus("PARADO"), rowWithStatus("PENDENTE")];
  const ordered = orderRowsBySeverity(rows);
  assert.equal(ordered[0]?.status, "PARADO");
  assert.deepEqual(
    ordered.slice(1).map((row) => row.status),
    ["ATIVO", "ARQUIVO", "PENDENTE"],
    "a ordem relativa das linhas nao-paradas nao muda",
  );
});

test("orderRowsBySeverity e identidade quando ja nao ha linha PARADA", () => {
  const rows = [rowWithStatus("ATIVO"), rowWithStatus("ARQUIVO")];
  assert.deepEqual(orderRowsBySeverity(rows), rows);
});

test("STOPPED_STATUS_GLYPH so se aplica ao status PARADO (contrato do view-model)", () => {
  // O glifo em si e uma constante — este teste apenas documenta que ela existe e nao e
  // vazia, o contrato real (so aparece na linha PARADO) e verificado em view-model.test.ts.
  assert.ok(STOPPED_STATUS_GLYPH.length > 0);
});

// ── "orcamento aritmetico": o total tem de ser a SOMA das partes, nunca um numero solto ──

test("totalStorageBudgetGbPerDay soma so as linhas ativas, tratando null como 0 sem mascarar", () => {
  const total = totalStorageBudgetGbPerDay([
    { label: "Coinalyze OI", gbPerDay: 1.2 },
    { label: "Coinalyze Liq", gbPerDay: 0.4 },
    { label: "/futures/data/*", gbPerDay: null },
  ]);
  assert.ok(Math.abs(total - 1.6) < 1e-9, `esperava ~1.6, recebi ${total}`);
});

test("totalStorageBudgetGbPerDay falsificador: mudar uma linha muda o total (nao esta hard-coded)", () => {
  const before = totalStorageBudgetGbPerDay([{ label: "x", gbPerDay: 1 }]);
  const after = totalStorageBudgetGbPerDay([{ label: "x", gbPerDay: 2 }]);
  assert.notEqual(before, after);
});
