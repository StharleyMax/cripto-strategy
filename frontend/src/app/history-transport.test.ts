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

const WINDOW = { from: "2026-08-20T00:00:00Z", to: "2026-08-24T00:00:00Z" };

const KEY_FINAL_ONLY: HistoryRequestKey = {
  seriesKeyId: "BTCUSDT.oi.5m",
  symbol: "BTCUSDT",
  interval: "5m",
  window: WINDOW,
  knowledgeTime: "2026-08-24T00:00:00Z",
  barPolicy: "final_only",
};

const KEY_INTRABAR: HistoryRequestKey = { ...KEY_FINAL_ONLY, barPolicy: "intrabar" };

// ── Chave endereçável por conteúdo (ADR-005/D1) ─────────────────────────────────────────────

test("encodeHistoryRequest/decodeHistoryRequest fazem round-trip para final_only", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  assert.equal(params.get("barPolicy"), "final_only");
  assert.deepEqual(decodeHistoryRequest(params), KEY_FINAL_ONLY);
});

test("encodeHistoryRequest/decodeHistoryRequest fazem round-trip para intrabar", () => {
  const params = encodeHistoryRequest(KEY_INTRABAR);
  assert.equal(params.get("barPolicy"), "intrabar");
  assert.deepEqual(decodeHistoryRequest(params), KEY_INTRABAR);
});

test("historyRequestUrl carrega os seis termos da chave de ADR-005/D1 na URL", () => {
  const url = historyRequestUrl(TEST_BASE_URL, KEY_FINAL_ONLY);
  assert.match(url.toString(), /seriesKeyId=BTCUSDT\.oi\.5m/);
  assert.match(url.toString(), /symbol=BTCUSDT/);
  assert.match(url.toString(), /interval=5m/);
  assert.match(url.toString(), /knowledgeTime=2026-08-24T00%3A00%3A00Z/);
  assert.match(url.toString(), /barPolicy=final_only/);
});

test("assertValidHistoryRequestKey recusa window invertida", () => {
  const invalid: HistoryRequestKey = {
    ...KEY_FINAL_ONLY,
    window: { from: "2026-08-24T00:00:00Z", to: "2026-08-20T00:00:00Z" },
  };
  assert.throws(() => assertValidHistoryRequestKey(invalid), /nao e anterior a/);
});

test("assertValidHistoryRequestKey recusa seriesKeyId vazio", () => {
  assert.throws(
    () => assertValidHistoryRequestKey({ ...KEY_FINAL_ONLY, seriesKeyId: "  " }),
    /seriesKeyId.*vazio/,
  );
});

// ── D4: bar_policy é declarado pelo consumidor, NUNCA default (falsificador obrigatório) ───

test("decodeHistoryRequest RECUSA quando barPolicy esta ausente da URL — nao ha default", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  params.delete("barPolicy");
  assert.throws(() => decodeHistoryRequest(params), /barPolicy.*ausente/);
});

test("decodeHistoryRequest RECUSA um barPolicy fora do conjunto fechado", () => {
  const params = encodeHistoryRequest(KEY_FINAL_ONLY);
  params.set("barPolicy", "intrabar_secreto");
  assert.throws(() => decodeHistoryRequest(params), /final_only.*ou.*intrabar/);
});

// ── "O cache É o knowledge_time" (D1) ───────────────────────────────────────────────────────

test("contentAddress e determinístico: a mesma chave produz sempre o mesmo endereco", () => {
  assert.equal(contentAddress(KEY_FINAL_ONLY), contentAddress({ ...KEY_FINAL_ONLY }));
});

test("contentAddress muda quando SÓ knowledgeTime muda — a janela de conhecimento discrimina", () => {
  const other = { ...KEY_FINAL_ONLY, knowledgeTime: "2026-08-24T00:05:00Z" };
  assert.notEqual(contentAddress(KEY_FINAL_ONLY), contentAddress(other));
});

test("contentAddress muda quando SÓ barPolicy muda — final_only e intrabar nao colidem", () => {
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
