// Testes de `T-06.10` — formatação (view-model), incluindo o falsificador estrutural de
// "não reconcilia automaticamente": uma divergência nunca colapsa a uma leitura só.
//
// Run with: npm --prefix frontend run test:s3 (ou node --test 'src/features/s3-inspector/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeRawAndGapRows } from "./domain.ts";
import {
  FIXTURE_CATALOG_ROWS,
  FIXTURE_DIVERGENCES,
  FIXTURE_GAP_ROWS,
  FIXTURE_RAW_ROWS,
} from "./fixtures.ts";
import {
  buildCatalogRowView,
  buildDivergenceRowView,
  buildInspectorRowViews,
  buildQuarantineDrawerView,
  buildS3ViewModel,
  completenessText,
  EMPTY_CATALOG_FILTER,
  formatEventTimeIso,
  quarantineBadgeText,
} from "./view-model.ts";
import { buildQuarantineDrawer } from "./domain.ts";
import { buildSeriesLabel } from "./series-catalog.ts";
import { COINALYZE_ONE_SHOT_TERMS, FULLY_RESOLVED_TERMS } from "./quarantine.ts";

test("formatEventTimeIso é determinístico e usa o formato ...Z, sem milissegundos", () => {
  assert.equal(formatEventTimeIso(Date.UTC(2026, 7, 12, 11, 45, 0)), "2026-08-12T11:45:00Z");
});

// ── STITCH_CONTEXT.md §9 item 10: completude de GRADE vs completude de TICK ─────────────────

test("completenessText de série de grade usa N/M · k lacuna(s), singular/plural corretos", () => {
  assert.equal(completenessText({ kind: "grid", present: 285, expected: 288, gaps: 1 }), "285/288 · 1 lacuna");
  assert.equal(completenessText({ kind: "grid", present: 1440, expected: 1440, gaps: 0 }), "1440/1440 · 0 lacunas");
});

test("completenessText de série de tick usa contiguidade (N saltos), nunca um denominador", () => {
  const text = completenessText({ kind: "tick", contiguous: 998, jumps: 2 });
  assert.equal(text, "contiguidade (2 saltos)");
  assert.ok(!text.includes("/"), "série de tick não tem denominador esperado — inventar um é defeito");
});

// ── Quarentena: losango + palavra + violeta, NUNCA vermelho — a cor é o TERCEIRO canal ──────

test("quarantineBadgeText de série resolvida não produz badge (ausência, não falso)", () => {
  const badge = quarantineBadgeText(FULLY_RESOLVED_TERMS);
  assert.equal(badge.isQuarantined, false);
  assert.equal(badge.word, null);
});

test("quarantineBadgeText de série em quarentena traz a palavra QUARENTENA e os termos em aberto", () => {
  const badge = quarantineBadgeText(COINALYZE_ONE_SHOT_TERMS);
  assert.equal(badge.isQuarantined, true);
  assert.equal(badge.word, "QUARENTENA");
  assert.equal(badge.openTermsText, "available_at");
});

test("buildCatalogRowView nunca introduz uma cor no texto — só strings, o componente decide a tinta", () => {
  const view = buildCatalogRowView(FIXTURE_CATALOG_ROWS[1]!); // coinalyze, quarentena
  assert.equal(view.label, "open_interest · grade 1m · BTCUSDT · coinalyze");
  assert.equal(view.quarantineBadge.word, "QUARENTENA");
});

// ── D6.15: linha de dado carrega src_label_raw ao lado de event_time; linha de lacuna é
//    ESTRUTURALMENTE distinta (union discriminado), nunca uma linha de dado "tingida" ───────

test("buildInspectorRowViews mantém src_label_raw e event_time na MESMA linha formatada", () => {
  const merged = mergeRawAndGapRows(FIXTURE_RAW_ROWS, FIXTURE_GAP_ROWS);
  const views = buildInspectorRowViews(merged);
  const dataViews = views.filter((view) => view.kind === "data");
  assert.equal(dataViews.length, FIXTURE_RAW_ROWS.length);
  for (const view of dataViews) {
    if (view.kind === "data") {
      assert.ok(view.eventTimeText.length > 0);
      assert.ok(view.srcLabelRaw.length > 0);
    }
  }
});

test("a linha de lacuna nunca carrega um campo 'valuesText' — é estruturalmente outra coisa", () => {
  const merged = mergeRawAndGapRows(FIXTURE_RAW_ROWS, FIXTURE_GAP_ROWS);
  const views = buildInspectorRowViews(merged);
  const gapView = views.find((view) => view.kind === "gap");
  assert.ok(gapView, "a fixture tem exatamente uma lacuna");
  if (gapView?.kind === "gap") {
    assert.equal(gapView.nMissingText, "3");
    assert.ok(!("valuesText" in gapView), "gap não é uma linha de dado tingida de neutro");
  }
});

// ── Falsificador estrutural de "não reconcilia automaticamente" (handoff §DoD) ──────────────

test("buildDivergenceRowView preserva TODAS as leituras — nenhuma é descartada/escolhida", () => {
  const view = buildDivergenceRowView(FIXTURE_DIVERGENCES[0]!);
  assert.equal(view.readingsText.length, FIXTURE_DIVERGENCES[0]!.readings.length);
  assert.ok(view.readingsText.length >= 2, "uma divergência com 1 leitura só não é uma divergência");
  // As DUAS fontes sobrevivem no texto formatado — nenhuma é substituída pela outra.
  assert.ok(view.readingsText.some((text) => text.includes("binance")));
  assert.ok(view.readingsText.some((text) => text.includes("coinalyze")));
});

// ── Gaveta de quarentena formatada: vazia é texto explícito, não ausência de painel ─────────

test("buildQuarantineDrawerView produz o texto de estado vazio exigido pelo handoff", () => {
  const emptyDrawer = buildQuarantineDrawer([], () => "");
  const view = buildQuarantineDrawerView(emptyDrawer);
  assert.equal(view.isEmpty, true);
  assert.equal(view.emptyStateText, "nenhuma série em quarentena no momento");
  assert.deepEqual(view.rows, []);
});

// ── S3ViewModel: o objeto único que o componente consome ────────────────────────────────────

test("buildS3ViewModel monta o estado completo da tela a partir do catálogo + série aberta", () => {
  const merged = mergeRawAndGapRows(FIXTURE_RAW_ROWS, FIXTURE_GAP_ROWS);
  const selected = FIXTURE_CATALOG_ROWS[0]!; // binance, resolvida
  const viewModel = buildS3ViewModel(
    FIXTURE_CATALOG_ROWS,
    EMPTY_CATALOG_FILTER,
    selected,
    merged,
    FIXTURE_DIVERGENCES,
  );
  assert.equal(viewModel.catalogRows.length, FIXTURE_CATALOG_ROWS.length);
  assert.equal(viewModel.selectedSeriesLabel, buildSeriesLabel(selected.entry));
  assert.equal(viewModel.inspectorRows.length, merged.length);
  assert.equal(viewModel.quarantineDrawer.isEmpty, false, "a fixture tem uma série coinalyze em quarentena");
});

test("buildS3ViewModel com nenhuma série selecionada devolve selectedSeriesLabel=null", () => {
  const viewModel = buildS3ViewModel(FIXTURE_CATALOG_ROWS, EMPTY_CATALOG_FILTER, null, [], []);
  assert.equal(viewModel.selectedSeriesLabel, null);
  assert.deepEqual(viewModel.inspectorRows, []);
  assert.deepEqual(viewModel.divergences, []);
});
