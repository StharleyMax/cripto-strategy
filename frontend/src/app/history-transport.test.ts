// Testes de `T-05.9` — `DoD D5.8` e item 5.12 do plano 05 (`ADR-005/D1`).
//
// Run with: npm --prefix frontend run test:app (ou node --test 'src/app/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
  assertValidHistoryRequestKey,
  contentAddress,
  decodeHistoryRequest,
  encodeHistoryRequest,
  historyRequestUrl,
  HistoryResponseCache,
} from "./history-transport.ts";
import type { HistoryRequestKey } from "./history-transport.ts";

// Base de teste, nao endereco de producao -- nenhum host real e contatado nestes testes
// (mesmo precedente de knowledge-time-bundle.test.ts).
const TEST_BASE_URL = "https://painel.local/historico";

const WINDOW_START_MS = 1_787_184_000_000; // 2026-08-20T00:00:00Z
const WINDOW_END_MS = 1_787_529_600_000; // 2026-08-24T00:00:00Z

const KEY_FINAL_ONLY: HistoryRequestKey = {
  series_key_id: "BTCUSDT.oi.5m",
  symbol: "BTCUSDT",
  interval: "5m",
  window_start_ms: WINDOW_START_MS,
  window_end_ms: WINDOW_END_MS,
  knowledge_time_ms: WINDOW_END_MS,
  bar_policy: "final_only",
};

const KEY_INTRABAR: HistoryRequestKey = { ...KEY_FINAL_ONLY, bar_policy: "intrabar" };

// ── Chave endereçável por conteúdo (ADR-005/D1) ─────────────────────────────────────────────

test("encodeHistoryRequest/decodeHistoryRequest fazem round-trip para final_only", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  assert.equal(params.get("bar_policy"), "final_only");
  assert.deepEqual(decodeHistoryRequest(params), KEY_FINAL_ONLY);
});

test("encodeHistoryRequest/decodeHistoryRequest fazem round-trip para intrabar", () => {
  const params = encodeHistoryRequest(KEY_INTRABAR);
  assert.equal(params.get("bar_policy"), "intrabar");
  assert.deepEqual(decodeHistoryRequest(params), KEY_INTRABAR);
});

test("historyRequestUrl carrega os sete termos da chave de ADR-005/D1 na URL, nomes reais de ADR-034", () => {
  const url = historyRequestUrl(TEST_BASE_URL, KEY_FINAL_ONLY);
  assert.match(url.toString(), /series_key_id=BTCUSDT\.oi\.5m/);
  assert.match(url.toString(), /symbol=BTCUSDT/);
  assert.match(url.toString(), /interval=5m/);
  assert.match(url.toString(), new RegExp(`window_start_ms=${WINDOW_START_MS}`));
  assert.match(url.toString(), new RegExp(`window_end_ms=${WINDOW_END_MS}`));
  assert.match(url.toString(), new RegExp(`knowledge_time_ms=${WINDOW_END_MS}`));
  assert.match(url.toString(), /bar_policy=final_only/);
});

test("assertValidHistoryRequestKey recusa window invertida", () => {
  const invalid: HistoryRequestKey = {
    ...KEY_FINAL_ONLY,
    window_start_ms: WINDOW_END_MS,
    window_end_ms: WINDOW_START_MS,
  };
  assert.throws(() => assertValidHistoryRequestKey(invalid), /nao pode ser posterior a/);
});

test("assertValidHistoryRequestKey aceita window de um unico instante (start === end)", () => {
  const singleInstant: HistoryRequestKey = {
    ...KEY_FINAL_ONLY,
    window_start_ms: WINDOW_START_MS,
    window_end_ms: WINDOW_START_MS,
  };
  assert.doesNotThrow(() => assertValidHistoryRequestKey(singleInstant));
});

test("assertValidHistoryRequestKey recusa series_key_id vazio", () => {
  assert.throws(
    () => assertValidHistoryRequestKey({ ...KEY_FINAL_ONLY, series_key_id: "  " }),
    /series_key_id.*vazio/,
  );
});

// ── D4: bar_policy é declarado pelo consumidor, NUNCA default (falsificador obrigatório) ───

test("decodeHistoryRequest RECUSA quando bar_policy esta ausente da URL — nao ha default", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  params.delete("bar_policy");
  assert.throws(() => decodeHistoryRequest(params), /bar_policy.*ausente/);
});

test("decodeHistoryRequest RECUSA um bar_policy fora do conjunto fechado", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  params.set("bar_policy", "intrabar_secreto");
  assert.throws(() => decodeHistoryRequest(params), /final_only.*ou.*intrabar/);
});

// ── "O cache É o knowledge_time" (D1) ───────────────────────────────────────────────────────

test("contentAddress e determinístico: a mesma chave produz sempre o mesmo endereco", () => {
  assert.equal(contentAddress(KEY_FINAL_ONLY), contentAddress({ ...KEY_FINAL_ONLY }));
});

test("contentAddress muda quando SÓ knowledge_time_ms muda — a janela de conhecimento discrimina", () => {
  const other = { ...KEY_FINAL_ONLY, knowledge_time_ms: WINDOW_END_MS + 300_000 };
  assert.notEqual(contentAddress(KEY_FINAL_ONLY), contentAddress(other));
});

test("contentAddress muda quando SÓ bar_policy muda — final_only e intrabar nao colidem", () => {
  assert.notEqual(contentAddress(KEY_FINAL_ONLY), contentAddress(KEY_INTRABAR));
});

test("HistoryResponseCache: set/get fazem round-trip para a mesma chave", () => {
  const cache = new HistoryResponseCache<{ readonly value: string }>();
  cache.set(KEY_FINAL_ONLY, { value: "42" });
  assert.deepEqual(cache.get(KEY_FINAL_ONLY), { value: "42" });
  assert.equal(cache.has(KEY_FINAL_ONLY), true);
  assert.equal(cache.has(KEY_INTRABAR), false);
});

test("HistoryResponseCache: escrever o MESMO conteudo duas vezes na mesma chave e idempotente", () => {
  const cache = new HistoryResponseCache<{ readonly value: string }>();
  cache.set(KEY_FINAL_ONLY, { value: "42" });
  assert.doesNotThrow(() => cache.set(KEY_FINAL_ONLY, { value: "42" }));
});

test("HistoryResponseCache: RECUSA sobrescrever a mesma chave com conteudo DIFERENTE — imutabilidade de D1", () => {
  const cache = new HistoryResponseCache<{ readonly value: string }>();
  cache.set(KEY_FINAL_ONLY, { value: "42" });
  assert.throws(() => cache.set(KEY_FINAL_ONLY, { value: "43" }), /cache endereçavel por conteudo violado/);
});

// ── Falsificador 1 de ADR-005: zero campo de nível de tick ─────────────────────────────────

test("assertNoTickLevelFields aceita um envelope de bucket legitimo (D2: last_price, n_trades)", () => {
  const envelope = {
    bucket_open_ts: "2026-08-24T00:00:00Z",
    cvd_delta_parcial: "1.5",
    last_price: "72998.8",
    n_trades: 42,
    seq: 7,
  };
  assert.doesNotThrow(() => assertNoTickLevelFields(envelope));
});

test("assertNoTickLevelFields aceita uma serie de pontos com o formato de projecao do accessor", () => {
  const points = [
    { value: "72998.8", absence: null, knowledge_time: 1787270400000, bar_policy: "final_only", age_ms: 0 },
    { value: null, absence: "SEM_PONTO", knowledge_time: 1787270400000, bar_policy: "final_only", age_ms: null },
  ];
  assert.doesNotThrow(() => assertNoTickLevelFields(points));
});

test("assertNoTickLevelFields RECUSA agg_id em qualquer profundidade — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", trades: [{ agg_id: 3415253153, last_price: "1" }] };
  assert.throws(() => assertNoTickLevelFields(poisoned), /agg_id/);
});

test("assertNoTickLevelFields RECUSA price por trade — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", price: "72998.8", quantity: "0.045" };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"price"/);
});

test("assertNoTickLevelFields RECUSA quantity por trade mesmo sem price no mesmo objeto", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", quantity: "0.045" };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"quantity"/);
});

// Os 4 nomes a seguir (agg_trade_id, first_trade_id, last_trade_id, transact_time) so
// apareciam antes no teste coletivo de MUTAÇÃO (is_buyer_maker) e no cabecalho do dump citado
// no comentario de TICK_LEVEL_FIELD_NAMES — nenhum tinha teste que o planta ISOLADO. Sem isto,
// remover qualquer um deles do Set (8 nomes) nao reprovava nenhum teste (QA T-05.9, mutacao C).

test("assertNoTickLevelFields RECUSA agg_trade_id sozinho — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", agg_trade_id: 3415253153 };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"agg_trade_id"/);
});

test("assertNoTickLevelFields RECUSA first_trade_id sozinho — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", first_trade_id: 3415253100 };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"first_trade_id"/);
});

test("assertNoTickLevelFields RECUSA last_trade_id sozinho — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", last_trade_id: 3415253200 };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"last_trade_id"/);
});

test("assertNoTickLevelFields RECUSA transact_time sozinho — falsificador literal da ADR", () => {
  const poisoned = { bucket_open_ts: "2026-08-24T00:00:00Z", transact_time: 1787270400123 };
  assert.throws(() => assertNoTickLevelFields(poisoned), /"transact_time"/);
});

test("assertNoTickLevelFields e MUTAÇÃO: um envelope legítimo que passa deixa de passar ao ganhar 1 campo de tick", () => {
  const envelope: Record<string, unknown> = {
    bucket_open_ts: "2026-08-24T00:00:00Z",
    last_price: "72998.8",
    n_trades: 42,
  };
  assert.doesNotThrow(() => assertNoTickLevelFields(envelope));
  envelope["is_buyer_maker"] = false; // planta o defeito que a ADR proíbe
  assert.throws(() => assertNoTickLevelFields(envelope), /is_buyer_maker/);
});

// ── Falsificador 2 de ADR-005: taxa ≤ max(1 Hz, 1/TF) ───────────────────────────────────────

test("assertBucketSpacingWithinInterval aceita buckets espaçados exatamente pelo TF pedido", () => {
  const fiveMinBuckets = [
    "2026-08-24T00:00:00Z",
    "2026-08-24T00:05:00Z",
    "2026-08-24T00:10:00Z",
  ];
  assert.doesNotThrow(() => assertBucketSpacingWithinInterval(fiveMinBuckets, 5 * 60_000));
});

test("assertBucketSpacingWithinInterval aceita buckets mais ESPAÇADOS que o TF (gap declarado, nao tick)", () => {
  const withGap = ["2026-08-24T00:00:00Z", "2026-08-24T00:15:00Z"];
  assert.doesNotThrow(() => assertBucketSpacingWithinInterval(withGap, 5 * 60_000));
});

test("assertBucketSpacingWithinInterval RECUSA um tick disfarçado de bucket extra — falsificador literal da ADR", () => {
  const withTick = [
    "2026-08-24T00:00:00Z",
    "2026-08-24T00:00:00.400Z", // 400ms depois — muito mais fino que 1/TF de 5 min
    "2026-08-24T00:05:00Z",
  ];
  assert.throws(
    () => assertBucketSpacingWithinInterval(withTick, 5 * 60_000),
    /taxa acima de max\(1 Hz, 1\/TF\)/,
  );
});

test("assertBucketSpacingWithinInterval RECUSA espaçamento a 0,7×intervalMs — mata limiar frouxado para 2× (QA T-05.9, mutacao B)", () => {
  // intervalMs = 60_000 (1 min); espaçamento = 42_000ms = 0,7×intervalMs. Fica ESTRITAMENTE
  // entre 0,5×intervalMs (30_000ms, o valor que uma mutacao "spacing < intervalMs/2" ainda
  // aceitaria) e 1×intervalMs (60_000ms) — a faixa que os casos de violacao pre-existentes
  // (400ms/300000ms e 500ms/60000ms, ambos ~100-750x menores) nunca exercitavam.
  const intervalMs = 60_000;
  const spacedAt0_7x = ["2026-08-24T00:00:00Z", "2026-08-24T00:00:42.000Z"];
  assert.throws(
    () => assertBucketSpacingWithinInterval(spacedAt0_7x, intervalMs),
    /taxa acima de max\(1 Hz, 1\/TF\)/,
  );
});

test("assertBucketSpacingWithinInterval e MUTAÇÃO: a mesma serie limpa reprova ao ganhar 1 ponto fino demais", () => {
  const clean = ["2026-08-24T00:00:00Z", "2026-08-24T00:01:00Z", "2026-08-24T00:02:00Z"];
  assert.doesNotThrow(() => assertBucketSpacingWithinInterval(clean, 60_000));
  const poisoned = [...clean, "2026-08-24T00:02:00.500Z"]; // planta o defeito
  assert.throws(() => assertBucketSpacingWithinInterval(poisoned, 60_000));
});

test("assertBucketSpacingWithinInterval RECUSA sequencia fora de ordem em vez de reordenar em silencio", () => {
  const outOfOrder = ["2026-08-24T00:05:00Z", "2026-08-24T00:00:00Z"];
  assert.throws(() => assertBucketSpacingWithinInterval(outOfOrder, 60_000), /fora de ordem/);
});
