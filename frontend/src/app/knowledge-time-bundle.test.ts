// Testes de `T-05.8` — `DoD D5.4` e item 5.6 do plano 05.
//
// Run with: npm --prefix frontend run test:web (ou node --test 'src/app/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bundleUrl,
  decodeBundle,
  encodeBundle,
  navigate,
  parseBundleFromUrl,
  returnToLive,
  withKnowledgeTime,
} from "./knowledge-time-bundle.ts";
import type { AsOfBundle, LiveBundle, Window } from "./knowledge-time-bundle.ts";

const WINDOW: Window = { from: "2023-10-26T00:00:00Z", to: "2023-10-27T00:00:00Z" };
const T = "2023-10-26T14:30:00Z";
// Base de teste, nao endereco de producao -- `bundleUrl` exige um `base` absoluto para
// construir `URL`, e nenhum host real e contatado nestes testes.
const TEST_BASE_URL = "https://painel.local/simbolo";

const LIVE: LiveBundle = { mode: "live", symbol: "BTCUSDT", window: WINDOW };
const AS_OF: AsOfBundle = { mode: "as_of", symbol: "BTCUSDT", window: WINDOW, knowledgeTime: T };

test("encodeBundle/decodeBundle round-trips a AO VIVO bundle sem parametro asOf", () => {
  const params = encodeBundle(LIVE);
  assert.equal(params.get("mode"), "live");
  assert.equal(params.has("asOf"), false, "AO VIVO nao pode carregar knowledge_time na URL");
  assert.deepEqual(decodeBundle(params), LIVE);
});

test("encodeBundle/decodeBundle round-trips um bundle COMO EM T, com knowledge_time na URL", () => {
  const params = encodeBundle(AS_OF);
  assert.equal(params.get("mode"), "as_of");
  assert.equal(params.get("asOf"), T, "knowledge_time tem de estar no parametro asOf da URL — item 5.6");
  assert.deepEqual(decodeBundle(params), AS_OF);
});

test("bundleUrl/parseBundleFromUrl fecham o laco: o bundle so existe como URL", () => {
  const url = bundleUrl(TEST_BASE_URL, AS_OF);
  assert.match(url.toString(), /[?&]asOf=2023-10-26T14%3A30%3A00Z/);
  assert.deepEqual(parseBundleFromUrl(url), AS_OF);
});

// ── D5.4, caso POSITIVO: COMO EM T sobrevive a TRES saltos de navegacao ─────────────────

test("navigate preserva mode=as_of e knowledgeTime atraves de tres saltos de navegacao", () => {
  const hop1 = navigate(AS_OF, { symbol: "ETHUSDT" });
  const hop2 = navigate(hop1, { window: { from: "2023-10-27T00:00:00Z", to: "2023-10-28T00:00:00Z" } });
  const hop3 = navigate(hop2, { symbol: "BTCUSDT" });

  assert.equal(hop1.mode, "as_of");
  assert.equal(hop2.mode, "as_of");
  assert.equal(hop3.mode, "as_of");
  assert.equal((hop1 as AsOfBundle).knowledgeTime, T, "salto 1: knowledge_time sobrevive");
  assert.equal((hop2 as AsOfBundle).knowledgeTime, T, "salto 2: knowledge_time sobrevive");
  assert.equal((hop3 as AsOfBundle).knowledgeTime, T, "salto 3: knowledge_time sobrevive");

  // E sobrevive tambem ao ciclo completo de virar URL e voltar — o que a barra de
  // enderecos do navegador de fato faz a cada navegacao.
  const roundTripped = parseBundleFromUrl(bundleUrl(TEST_BASE_URL, hop3));
  assert.deepEqual(roundTripped, hop3);
});

// ── D5.4, caso NEGATIVO OBRIGATORIO: voltar para AO VIVO tem sintoma visivel ────────────
//
// O DoD e explicito: "voltar para AGORA nao tem sintoma visivel => reprova". Este modulo
// nao pinta pixel (isso e da S2 canonica, ja verificada pelo gate de design), mas garante a
// PRE-CONDICAO estrutural do sintoma: o campo que o chrome usa para escolher fill+borda
// (`mode`) SEMPRE muda, e `knowledgeTime` SEMPRE desaparece — nunca fica "escondido".

test("returnToLive descarta knowledgeTime por TIPO, nao por convencao", () => {
  const back = returnToLive(AS_OF);
  assert.equal(back.mode, "live");
  assert.deepEqual(back, LIVE);
  assert.equal("knowledgeTime" in back, false, "o campo nao pode sobreviver nem como undefined");
});

test("returnToLive produz uma URL sem o parametro asOf — o sintoma e observavel na propria URL", () => {
  const url = bundleUrl(TEST_BASE_URL, returnToLive(AS_OF));
  assert.equal(url.searchParams.has("asOf"), false);
  assert.equal(url.searchParams.get("mode"), "live");
});

test("navegar depois de voltar para AO VIVO nao ressuscita knowledge_time (sem estado zumbi)", () => {
  const back = returnToLive(AS_OF);
  const afterHop = navigate(back, { symbol: "ETHUSDT" });
  assert.equal(afterHop.mode, "live");
  assert.equal("knowledgeTime" in afterHop, false);
});

test("decodeBundle RECUSA mode=live com asOf ainda presente — e o bug que D5.4 proibe, tornado impossivel", () => {
  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    from: WINDOW.from,
    to: WINDOW.to,
    mode: "live",
    asOf: T,
  });
  assert.throws(() => decodeBundle(params), /retrocesso silencioso que D5.4 proibe/);
});

test("decodeBundle RECUSA mode=as_of sem asOf — COMO EM T sem knowledge_time nao e um estado valido", () => {
  const params = new URLSearchParams({ symbol: "BTCUSDT", from: WINDOW.from, to: WINDOW.to, mode: "as_of" });
  assert.throws(() => decodeBundle(params), /exige o parametro "asOf"/);
});

test("decodeBundle RECUSA mode fora do vocabulario fechado", () => {
  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    from: WINDOW.from,
    to: WINDOW.to,
    mode: "as-of-mal-escrito",
  });
  assert.throws(() => decodeBundle(params), /"live" ou "as_of"/);
});

test("decodeBundle RECUSA parametro obrigatorio ausente em vez de assumir default", () => {
  const params = new URLSearchParams({ from: WINDOW.from, to: WINDOW.to, mode: "live" });
  assert.throws(() => decodeBundle(params), /"symbol" ausente/);
});

test("assertValidBundle RECUSA janela invertida", () => {
  const inverted: LiveBundle = { mode: "live", symbol: "BTCUSDT", window: { from: WINDOW.to, to: WINDOW.from } };
  assert.throws(() => encodeBundle(inverted), /window\.from .* nao e anterior a window\.to/);
});

test("withKnowledgeTime entra em COMO EM T preservando simbolo e janela", () => {
  const entered = withKnowledgeTime(LIVE, T);
  assert.equal(entered.mode, "as_of");
  assert.equal(entered.knowledgeTime, T);
  assert.equal(entered.symbol, LIVE.symbol);
  assert.deepEqual(entered.window, LIVE.window);
});
