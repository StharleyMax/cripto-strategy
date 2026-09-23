import http from "node:http";

import { expect, test } from "@playwright/test";

import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance } from "./helpers.ts";

/**
 * `T-04.5` (`CST-232`) — a integração final da fase `04`
 * (`docs/plans/SPEC-008-candle-real-e-eixo-unico/04_oi_honesto.md`, "DoD verificável" 1–4), contra
 * o **app real**. `T-04.1`/`T-04.2`/`T-04.3`/`T-04.4` (já mergeadas nesta branch) cobriram cada
 * item por unit test/contrato de fonte; este arquivo é o SEGUNDO testemunho, pelo pixel.
 *
 * ── OS QUATRO ITENS, E QUAL TESTE PAGA CADA UM ────────────────────────────────────────────────
 *
 *   `CA-9`     — o rótulo soletra os três termos (`grandeza`/`universo`/`coorte`), contra o
 *                catálogo que a API REAL serve hoje.
 *   `DoD-3`    — zero chave de máquina não-ASCII, universo COMPLETO de `data-fact="..."` na
 *                página — `T-04.4` já auditou isso ESTATICAMENTE (fonte); aqui é o HTML servido.
 *   `DoD-4`    — o rótulo está VISÍVEL, com assert de posição — não só presente no DOM
 *                (`MEMORY.md`: "Assert de DOM não prova pixel"). O próprio instrumento se
 *                falsifica no fim do teste, forçando `display:none` na página real e confirmando
 *                que a MESMA asserção reprovaria.
 *   `⛔ CA-10` — ABLAÇÃO DE DERIVAÇÃO: trocada a chave da série no catálogo DE TESTE (um stub
 *                HTTP sintético, nunca a API de produção — `[P-seed]` não se aplica, este arquivo
 *                não toca banco nenhum), o rótulo muda **sem tocar em `SymbolClient.tsx` nem em
 *                `page.tsx`**. MORDE se o rótulo não mudar — `RN-5` teria caído (rótulo
 *                hard-coded em vez de derivado da chave resolvida).
 *
 * `DoD-5` (`ADR-036/D2` intacta) já está coberto por `T-04.2`
 * (`openInterestAdr036D2Violations`) e por `12-oi-dado-real.spec.ts`; este arquivo não o
 * reprova, só não regride (a chave DEFAULT da ablação abaixo honra os quatro termos).
 *
 * ── POR QUE A ABLAÇÃO USA UM STUB SINTÉTICO, E NÃO UM PROXY SOBRE A API REAL ──────────────────
 *
 * `CA-10` pede "a chave da série no catálogo DE TESTE" — literal. Diferente de
 * `15-vela-e-ablacao.spec.ts` (que ABLA uma métrica da API de PRODUÇÃO via proxy de leitura, para
 * provar que a TINTA reage a dado real), aqui o que se prova é DERIVAÇÃO PURA — uma função de
 * `SeriesKey` para rótulo — e o jeito mais direto de isolar isso é servir um catálogo
 * completamente sintético, com UMA linha (a de OI), pelo mesmo `startSecondaryNextInstance`
 * (`helpers.ts`) que `02-rede-e-estados.spec.ts` já usa para B3–B6. Um servidor HTTP só, sem
 * caminho de escrita, sem `INSERT`/`psql`/`docker` — zero risco de `[P-seed]`.
 *
 * Run with: npm --prefix frontend run test:e2e (needs `make e2e`'s ephemeral env — see
 * `scripts/e2e-env.sh`) or `make e2e`.
 */

const SPEC = "19-oi-provenance-ablacao-e-ascii";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota é `/symbol/[symbol]`, segmento em inglês; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const OI_PANE_TESTID = "oi-pane";

// ── A MESMA REGRA DE `view-model.ts::matchesBinanceOpenInterest`/`deriveOiProvenanceLabel`,
// ESCRITA À MÃO — importar `view-model.ts` traria `charts/index.ts` → `jsdom`, que morre sob o
// carregador de módulos do Playwright (mesma razão que `12-oi-dado-real.spec.ts`/
// `15-vela-e-ablacao.spec.ts` já documentam para `SymbolClient.tsx`). Duas testemunhas
// independentes do mesmo contrato, não uma segunda implementação importada. ──────────────────

function matchesBinanceOpenInterest(key: SeriesKey): boolean {
  return key.metric === "sum_open_interest" && key.provider === "binance" && key.reduction === "POINT";
}

/** Mirror de `deriveOiProvenanceLabel` (`view-model.ts`) — os TRÊS termos do `CA-9`, na mesma
 * grafia do `data-fact` que `OiProvenance` (`SymbolClient.tsx`) publica. */
function expectedProvenanceFact(key: Pick<SeriesKey, "unit" | "denom" | "provider" | "venue" | "cohort">): string {
  const grandeza =
    key.denom === "base" ? `contracts (${key.unit})` : key.denom === "quote" ? `notional (${key.unit})` : `${key.denom} (${key.unit})`;
  const universo = `${key.provider}/${key.venue}`;
  return `oi_provenance:grandeza=${grandeza};universo=${universo};coorte=${key.cohort}`;
}

async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    return await fetch(url);
  }
}

interface CatalogEntryWire {
  readonly key: SeriesKey;
}

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/series-catalog`);
  if (!response.ok) {
    throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  }
  return ((await response.json()) as { entries: readonly CatalogEntryWire[] }).entries;
}

test(`CA-9: o rótulo de OI soletra os três termos, contra o catálogo que a API real serve (${SPEC})`, async ({
  page,
}) => {
  const entries = await fetchCatalogEntries();
  const matched = entries.filter(
    (entry) => entry.key.instrumentId === SYMBOL && matchesBinanceOpenInterest(entry.key),
  );
  fact(SPEC, "catalog_binance_oi_matches", matched.length);
  expect(matched.length, "T-04.1 pressupõe exatamente UMA linha binance/POINT de OI para o piloto").toBe(1);

  const expected = expectedProvenanceFact(matched[0]!.key);
  fact(SPEC, "expected_oi_provenance_fact", expected);

  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const pane = page.locator(`[data-testid="${OI_PANE_TESTID}"]`);
  await expect(pane, "o painel de OI não existe no DOM").toHaveCount(1);
  const provenance = pane.locator('[data-fact^="oi_provenance:"]');
  await expect(provenance, "CA-9 morde: nenhum data-fact oi_provenance no painel").toHaveCount(1);
  const rendered = await provenance.getAttribute("data-fact");
  fact(SPEC, "rendered_oi_provenance_fact", rendered);

  // Os TRÊS termos, cada um nomeado — não basta "a chave está presente".
  expect(rendered).toContain("grandeza=");
  expect(rendered).toContain("universo=");
  expect(rendered).toContain("coorte=");
  expect(
    rendered,
    "o rótulo renderizado diverge do que a chave RESOLVIDA pela própria API descreve",
  ).toBe(expected);
});

test(`DoD-3: zero data-fact com chave de máquina não-ASCII, universo COMPLETO de /symbol (${SPEC})`, async ({
  page,
}) => {
  await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  const html = await page.content();
  const keys = [...html.matchAll(/data-fact="([^"]*)"/g)].map((m) => m[1]!);
  const nonAscii = keys.filter((k) => /[^\x00-\x7F]/.test(k));
  fact(SPEC, "data_fact_keys_total", keys.length);
  fact(SPEC, "data_fact_keys_non_ascii", nonAscii);

  // O universo do falsificador tem de ser > 0 — senão o grep está varrendo página vazia e "0
  // não-ASCII" não prova nada (mesma disciplina do guarda `> 1`/`toBeGreaterThan` que
  // `12-oi-dado-real.spec.ts` e `18-tf-refetch-e-ablacao.spec.ts` já usam).
  expect(keys.length, "nenhum data-fact na página — o falsificador varreria um universo vazio").toBeGreaterThan(0);
  expect(
    nonAscii,
    `DoD-3 morde: ${JSON.stringify(nonAscii)} carrega caractere de máquina não-ASCII na CHAVE`,
  ).toEqual([]);
});

test(`DoD-4: o rótulo de proveniência está VISÍVEL na tela, com posição — não só no DOM (${SPEC})`, async ({
  page,
}) => {
  await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  const provenance = page.locator(`[data-testid="${OI_PANE_TESTID}"] [data-fact^="oi_provenance:"]`);
  await expect(provenance).toHaveCount(1);

  const text = (await provenance.textContent())?.trim() ?? "";
  fact(SPEC, "oi_provenance_text", text);
  expect(text.length, "o elemento existe mas não tem texto — a mesma classe de verde falso").toBeGreaterThan(0);

  await expect(
    provenance,
    'MEMORY.md: "Assert de DOM não prova pixel" — presente no DOM não é estar na tela',
  ).toBeVisible();

  // Scroll real até o elemento — o mesmo movimento que um operador faria. Um elemento escondido
  // por `position: absolute; left: -9999px` (ou equivalente) NÃO fica dentro do viewport depois
  // disso, e é exatamente essa técnica que a asserção de posição abaixo precisa rejeitar.
  await provenance.scrollIntoViewIfNeeded();
  const box = await provenance.boundingBox();
  fact(SPEC, "oi_provenance_bounding_box", box);
  expect(box, "toBeVisible() passou mas boundingBox() é null — contradição, tratada como falha").not.toBeNull();
  expect(box!.width, "largura zero é a mesma classe de verde falso que MEMORY.md nomeia").toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  const viewport = page.viewportSize();
  expect(viewport, "viewport ausente — não há como comparar posição").not.toBeNull();
  expect(box!.x, "x negativo é a técnica clássica de esconder um elemento fora da tela").toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x, "depois de scrollIntoViewIfUnneeded, o pixel tem de estar DENTRO do viewport, não além dele").toBeLessThan(
    viewport!.width,
  );
  expect(box!.y).toBeLessThan(viewport!.height);

  // ⛔ O FALSIFICADOR DO PRÓPRIO INSTRUMENTO — mostrando o caso que ele rejeita, não só o que
  // aceita. Todas as asserções acima (presença, `data-fact`, texto) passariam do mesmo jeito com
  // `display:none`; só `toBeVisible()` distingue isso. Prova direta, sobre a PÁGINA REAL: força
  // `display:none` no próprio elemento e confirma que a MESMA asserção agora reprova.
  await page.evaluate((testid: string) => {
    const el = document.querySelector(`[data-testid="${testid}"] [data-fact^="oi_provenance:"]`);
    if (el instanceof HTMLElement) el.style.display = "none";
  }, OI_PANE_TESTID);
  await expect(
    provenance,
    "MORDE do falsificador: display:none tinha de derrubar toBeVisible() — se não derrubou, o instrumento não mede nada",
  ).not.toBeVisible();
});

// ── A ABLAÇÃO (`CA-10`) — catálogo DE TESTE, stub HTTP sintético, zero escrita em banco ───────

interface CatalogStub {
  readonly url: string;
  setEntries(entries: readonly unknown[]): void;
  close(): Promise<void>;
}

/** Um `GET /api/v1/series-catalog` sintético — o `INGEST_HEALTH_API_BASE_URL` de uma SEGUNDA
 * instância `next start` aponta para cá (`startSecondaryNextInstance`, mesmo padrão de
 * `02-rede-e-estados.spec.ts` B4/B5/B6). Toda outra rota (`series-history`, `series-live`, …)
 * recusa alto: os painéis que não são o de OI degradam para ausência, comportamento já coberto
 * por `page.tsx`'s own docstring ("a catalog fetch itself failed ⇒ every panel degrades
 * together" — aqui é o INVERSO, cada `fetchPanelRows` falha SOZINHO, o mesmo caminho de código).
 * Este arquivo não assere nada sobre os outros painéis. */
async function startCatalogStub(): Promise<CatalogStub> {
  let entries: readonly unknown[] = [];
  const server = http.createServer((request, response) => {
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname === "/api/v1/series-catalog") {
      const body = JSON.stringify({ query: "series_catalog", n_entries: entries.length, entries });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ detail: "catalog stub: only /api/v1/series-catalog is served" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("startCatalogStub: could not allocate a port");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    setEntries: (next) => {
      entries = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Os 15 termos de `SeriesKey`, válidos por construção (`assertValidSeriesKey`/
 * `assertValidCatalogEntry`, `series-catalog.ts`) — só os QUATRO que `deriveOiProvenanceLabel`
 * lê (`unit`/`denom`/`venue`/`cohort`) variam entre chamadas; os TRÊS que
 * `matchesBinanceOpenInterest` exige (`metric`/`provider`/`reduction`) ficam fixos, senão o
 * painel nem RESOLVERIA a linha — não seria ablação de rótulo, seria ausência. */
function buildOiCatalogEntry(overrides: {
  readonly venue?: string;
  readonly unit?: string;
  readonly denom?: string;
  readonly cohort?: string;
}) {
  return {
    key: {
      provider: "binance",
      venue: overrides.venue ?? "usdm_futures",
      instrumentId: SYMBOL,
      metric: "sum_open_interest",
      cohort: overrides.cohort ?? "all",
      interval: "5m",
      unit: overrides.unit ?? "BTC",
      denom: overrides.denom ?? "base",
      nature: "STOCK",
      tsConvention: "POINT_AT_BUCKET_END",
      reduction: "POINT",
      quantityField: "NA",
      labelShift: 0,
      aggregationScope: "Symbol",
      verifiedBy: "e2e-fixture-T-04.5",
    },
    nativeGrid: "5min",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  };
}

test(`⛔ CA-10: trocada a chave da série no catálogo de teste, o rótulo muda SEM TOCAR no componente (${SPEC})`, async ({
  browser,
}) => {
  const stub = await startCatalogStub();
  const instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  try {
    // ADR-036/D2 intacta na entrada DEFAULT (DoD-5, não regredido): origem, contratos, BTC, Symbol.
    const defaultEntry = buildOiCatalogEntry({});
    const ablatedEntry = buildOiCatalogEntry({
      venue: "coinm_futures",
      unit: "USD",
      denom: "quote",
      cohort: "stable_margined",
    });
    const defaultFact = expectedProvenanceFact(defaultEntry.key);
    const ablatedFact = expectedProvenanceFact(ablatedEntry.key);
    expect(
      defaultFact,
      "a fixture precisa mudar os TRÊS termos, senão esta ablação não prova RN-5 sobre nenhum deles",
    ).not.toBe(ablatedFact);

    const page = await browser.newPage({ baseURL: instance.baseUrl });

    // ── (a) catálogo DEFAULT: binance/usdm_futures, contratos em BTC, coorte "all" ───────────
    stub.setEntries([defaultEntry]);
    await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
    const before = page.locator('[data-fact^="oi_provenance:"]');
    await expect(before, "o pane de OI não publicou oi_provenance sob o catálogo default").toHaveCount(1);
    const beforeFact = await before.getAttribute("data-fact");
    fact(SPEC, "oi_provenance_before_ablation", beforeFact);
    expect(beforeFact).toBe(defaultFact);

    // ── (b) MESMA instância `next start`, MESMO `SymbolClient.tsx`/`page.tsx` — só a resposta
    // que o stub serve para `/api/v1/series-catalog` mudou. ──────────────────────────────────
    stub.setEntries([ablatedEntry]);
    await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
    const after = page.locator('[data-fact^="oi_provenance:"]');
    await expect(after).toHaveCount(1);
    const afterFact = await after.getAttribute("data-fact");
    fact(SPEC, "oi_provenance_after_ablation", afterFact);

    // ⛔ MORDE: se o rótulo não mudasse aqui, RN-5 teria caído — hard-coded em vez de derivado.
    expect(
      afterFact,
      "CA-10 morde: o rótulo tem de mudar quando só a CHAVE do catálogo de teste muda",
    ).not.toBe(beforeFact);
    expect(afterFact).toBe(ablatedFact);

    // ── (c) e o caso SEM entrada nenhuma continua publicando o fato, como `unresolved` — o
    // mesmo componente, o mesmo `<OiProvenance>`, só o catálogo (agora vazio) mudou de novo. ──
    stub.setEntries([]);
    await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
    const absent = page.locator('[data-fact="oi_provenance:unresolved"]');
    await expect(
      absent,
      "sem entrada no catálogo o data-fact tem de continuar presente, como unresolved (não sumir)",
    ).toHaveCount(1);
    fact(SPEC, "oi_provenance_no_catalog_entry", "oi_provenance:unresolved");

    await page.close();
  } finally {
    await instance.close();
    await stub.close();
  }
});
