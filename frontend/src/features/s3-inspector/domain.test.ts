// Testes de `T-06.10` — D6.15 (src_label_raw+event_time na mesma linha, lacunas intercaladas),
// gaveta de quarentena (predicado de três termos) e "não reconcilia automaticamente".
//
// Run with: npm --prefix frontend run test:s3 (ou node --test 'src/features/s3-inspector/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildQuarantineDrawer,
  EMPTY_CATALOG_FILTER,
  filterCatalogRows,
  mergeRawAndGapRows,
  type CatalogRow,
} from "./domain.ts";
import {
  FIXTURE_CATALOG_ROWS,
  FIXTURE_GAP_ROWS,
  FIXTURE_RAW_ROWS,
} from "./fixtures.ts";
import { buildSeriesLabel } from "./series-catalog.ts";

// ── D6.15: abrir linhas cruas mostra src_label_raw NA MESMA LINHA que event_time, e a lacuna
//    de md.ingest_gap aparece intercalada, nunca numa tabela separada ───────────────────────

test("mergeRawAndGapRows intercala a lacuna cronologicamente entre as linhas de dado", () => {
  const merged = mergeRawAndGapRows(FIXTURE_RAW_ROWS, FIXTURE_GAP_ROWS);
  assert.equal(merged.length, FIXTURE_RAW_ROWS.length + FIXTURE_GAP_ROWS.length);
  // A fixture tem 2 linhas de dado antes da lacuna e 1 depois (D4.2: 11:40, 11:45, [lacuna], 12:05).
  assert.equal(merged[0]?.kind, "data");
  assert.equal(merged[1]?.kind, "data");
  assert.equal(merged[2]?.kind, "gap");
  assert.equal(merged[3]?.kind, "data");
});

test("toda linha de dado carrega src_label_raw e event_time NA MESMA LINHA (D6.15)", () => {
  for (const row of FIXTURE_RAW_ROWS) {
    assert.equal(row.kind, "data");
    assert.ok(row.srcLabelRaw.length > 0);
    assert.ok(Number.isFinite(row.eventTime));
  }
});

test("a lacuna carrega n_missing — a fixture reproduz o exemplo publicado de D4.2 (n_missing=3)", () => {
  assert.equal(FIXTURE_GAP_ROWS.length, 1);
  assert.equal(FIXTURE_GAP_ROWS[0]?.n_missing, 3);
});

// ── Catálogo filtrável ───────────────────────────────────────────────────────────────────────

test("filterCatalogRows sem filtro devolve o catálogo inteiro", () => {
  assert.equal(filterCatalogRows(FIXTURE_CATALOG_ROWS, EMPTY_CATALOG_FILTER).length, FIXTURE_CATALOG_ROWS.length);
});

test("filterCatalogRows por texto casa símbolo/métrica/fonte, case-insensitive", () => {
  const filtered = filterCatalogRows(FIXTURE_CATALOG_ROWS, {
    ...EMPTY_CATALOG_FILTER,
    text: "coinalyze",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.entry.key.provider, "coinalyze");
});

test("filterCatalogRows por onlyQuarantined devolve só as séries em quarentena", () => {
  const filtered = filterCatalogRows(FIXTURE_CATALOG_ROWS, {
    ...EMPTY_CATALOG_FILTER,
    onlyQuarantined: true,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.entry.key.provider, "coinalyze");
});

test("filterCatalogRows por provenance recusa série de outra procedência", () => {
  const filtered = filterCatalogRows(FIXTURE_CATALOG_ROWS, {
    ...EMPTY_CATALOG_FILTER,
    provenance: "DERIVADO",
  });
  assert.equal(filtered.length, 0, "nenhuma linha da fixture é DERIVADO");
});

// ── Gaveta de quarentena: vazia é ESTADO VÁLIDO, distinto de "dado quebrado" ────────────────

test("buildQuarantineDrawer conta exatamente as séries em quarentena, com os termos em aberto", () => {
  const drawer = buildQuarantineDrawer(FIXTURE_CATALOG_ROWS, (row) => buildSeriesLabel(row.entry));
  assert.equal(drawer.isEmpty, false);
  assert.equal(drawer.rows.length, 1);
  assert.deepEqual(drawer.rows[0]?.openTerms, ["available_at"]);
});

test("buildQuarantineDrawer com catálogo sem quarentena marca isEmpty=true explicitamente", () => {
  const noneQuarantined: readonly CatalogRow[] = FIXTURE_CATALOG_ROWS.filter(
    (row) => row.entry.key.provider !== "coinalyze",
  );
  const drawer = buildQuarantineDrawer(noneQuarantined, (row) => buildSeriesLabel(row.entry));
  assert.equal(drawer.isEmpty, true);
  assert.deepEqual(drawer.rows, []);
});
