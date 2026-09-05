# SPEC-003 — Camada de leitura do `/painel`: contratos, fronteiras e comportamento de borda

**Status:** `SPEC_DRAFT` — **e é `DRAFT` porque o ledger diz `DRAFT`** (`harness pipeline state camada-de-leitura-do-painel`). Promover a `SPEC_APPROVED` é `approve spec` do **owner**; escrever "aprovada" aqui sem o evento seria violação, não atalho.
**Feature:** `camada-de-leitura-do-painel` (**filha** de `plataforma-dados`, `relate` no ledger) · **Data:** 2026-09-04 · **Componentes:** `web` (predominante) · `infra` · `sentimento` (`F3`) · `docs`
**Ledger ao escrever:** `PRD_VALIDATED` — `approve prd` (architect) + `advance PRD_VALIDATED` em 2026-09-04, após a Gap Analysis de §0 · **Rev de ancoragem de TODA medição:** `master@c8e7193` (a mesma do `PRD-003` e dos 4 relatórios `REVISAO-FB-*` — nenhum número envelheceu)
**Insumos:** [`PRD-003`](PRD-003-camada-de-leitura-do-painel.md) · [`handoff_to_architect.md`](../context/camada-de-leitura-do-painel/handoff_to_architect.md) · [`handoff/PRD.md`](../context/camada-de-leitura-do-painel/handoff/PRD.md) (falas literais do owner) · `REVISAO-FB-{frontend-architect,infra-architect,playwright,ux-gate}.md` em `docs/context/plataforma-dados/gates/` (evidência medida, **citada, não transcrita**) · `ADR-005` D5/D6 · `ADR-019` D4 · `ADR-027` · `05_fatia_visivel.md:215-225`
**ADRs que nascem com esta SPEC:** [`ADR-028`](../adr/ADR-028-leitura-do-painel-em-server-component-e-o-portao-de-d6-4-medido-pela-propriedade.md) (Server Component + `server-only`; portão de `D6.4` pela propriedade — co-assinatura `quant-architect` exigida por `RN-1`) · [`ADR-029`](../adr/ADR-029-topologia-da-camada-de-leitura-caddy-proprio-mesma-origem-por-caminho-e-readiness-que-discrimina.md) (Caddy próprio, mesma origem por caminho, readiness, falha no boot)
**Glossário:** `harness policy --key glossary_doc` → 1 byte (`\n`), `rc=0`; `grep -n glossary harness.toml` → `rc=1` `[MEDIDO 2026-09-04]`. Não há glossário; termos em §1.2.
**Zero código.** Contratos, formas de dado, limites de camada, comportamento de borda.

### ⚠️ Decisões que o `approve spec` do owner toma ao aprovar esta SPEC — lidas antes de aprovar

O owner **não estava disponível**. Nada abaixo bloqueia o `DRAFT`; tudo abaixo é fechado **pelo ato de aprovar**, e o motivo do `approve` deve nomear o que ele escolheu onde discordar do default.

| # | decisão | default adotado nesta SPEC | rótulo | custo de reverter depois |
|---|---|---|---|---|
| **M1** | **Quantas fases entram** | **`F1` entra sempre.** `F2` e `F3` estão especificadas com custo (§6) — o `approve spec` diz *"F1"*, *"F1+F2"* ou *"F1+F2+F3"* | `[DECISÃO-OWNER pendente]` | fase não aprovada fica no plano como **declarada**; virar feature filha depois custa 0 retrabalho (nada de `F1` é jogado fora) |
| **M2** | Prefixo de URL da API | `/api/v1` | `[INFERRED: versiona desde o dia 1; menu M2(a)]` | 2 linhas (`src.main` default + `.env.example`) — `ADR-029/D2` faz o Caddy seguir |
| **M3** | Botão `abrir` (Camada 2) sem `RawDataRow` | **remover** o controle até o recurso `6` existir | `[INFERRED: H3 — controle que promete e não faz é pior que ausente; FB-ux-gate Rec. 4]` | 1 componente reexibido quando `6` entrar |
| **M4** | Exposição pública quando implantar | `basic_auth` no Caddy **reservado por env**, inerte sem `PANEL_BASIC_AUTH_HASH` | `[INFERRED: menu M4(a)]`; decisão continua do owner (`ADR-029/D6`) | 0 código: preencher ou apagar 1 bloco |
| **M5** | Suíte de front em `make verify` | **não** — `F1` entrega `make e2e` (alvo próprio, sobe API de teste + Next + Playwright); ligar em `verify` é ato do owner | `[INFERRED: NG-10 do PRD; +~35 s por verify (e2e 30,9 s hoje, FB-playwright §2)]` | 1 linha em `scripts/verify.sh` |

---

## 0. Veredito do peer review do `PRD-003` — **[READY FOR SPEC]**

**Aprovado. Nenhum bloqueante.** Re-medi **14** afirmações quantitativas em `c8e7193`; **as 14 conclusões se confirmam**. Encontrei **3 defeitos de critério** (nenhum de conclusão) e **1 lacuna de desenho** que o PRD não podia ver sem implementação — os quatro estão **resolvidos aqui** (§0.2), não devolvidos ao `/pm`. Gaps classificados: bloqueante → **0**; não-bloqueante → `[Q1]`–`[Q10]` do PRD mantidos com dono (§8) + `[Q11]` novo; inferível → `I-1`..`I-7` do PRD aceitos, + `I-8`..`I-10` desta SPEC.

### 0.1 O que re-medi, e o veredito de cada um

| # | afirmação do `PRD-003` | comando | meu resultado | veredito |
|---|---|---|---|---|
| 1 | `route.ts` sob `frontend/src/app`: **0** (`RN-2`, `CA-F1-6`) | `find frontend/src/app -name route.ts \| wc -l` | **0** | confere |
| 2 | imports de `fixtures.ts` em produção: **2** (`RN-3`) | `grep -rn 'fixtures' frontend/src/app frontend/src/features --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **2** (`page.tsx:12,15`) | confere |
| 3 | `*.css` no front: **0** (`CA-F1-15`) | `find frontend -name '*.css' -not -path '*/node_modules/*' -not -path '*/.next/*' \| wc -l` | **0** | confere |
| 4 | rotas HTTP do backend: **1** | `grep -rnE '@(router\|app)\.(get\|post\|put\|delete)' backend/src \| wc -l` | **1** (`routes/ingest_health.py:25`) | confere |
| 5 | CORS/ETag/health/ready/SSE: **0 reais, "1 falso positivo"** | `grep -rnEi 'CORSMiddleware\|ETag\|/health\|/ready\|text/event-stream' backend/src --include='*.py'` | **9 linhas, 0 reais** — todas `AggTradeBucketAggregate`/`BucketAggIdGap` casando `etAg` com `-i` | **conclusão confere; a contagem de falsos positivos não** (9, não 1) — defeito de critério `[C1]` |
| 6 | `loading/error/not-found/route`: **0** | `find frontend/src/app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx' -o -name 'route.ts' \| wc -l` | **0** | confere |
| 7 | `SeriesCatalogEntry(` constantes: **7** em 3 módulos | `grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' \| grep -v test \| wc -l` | **7** (`cvd_source_catalog`, `price_source_catalog`, `open_interest_catalog`) | confere |
| 8 | `deploy/`: **1** arquivo | `find deploy -type f \| wc -l` | **1** (`compose.yml`) | confere |
| 9 | `INGEST_HEALTH_API_BASE_URL` em config: **0** | `grep -rln INGEST_HEALTH_API_BASE_URL . --exclude-dir=node_modules --exclude-dir=.git \| grep -vE 'ingest-health-query\.ts\|\.test\.ts\|\.md$' \| wc -l` | **0** | confere |
| 10 | `page.tsx` é `"use client"` hoje (base de `CA-F1-3`) | `grep -c '"use client"' frontend/src/app/painel/page.tsx` | **1** | confere |
| 11 | testes de front fora de portão: **37** unitários + e2e | `find frontend/src -name '*.test.ts*' \| wc -l`; `grep -n 'node --test\|playwright' Makefile scripts/verify.sh \| wc -l` | **37**; **0** | confere |
| 12 | e2e: **16** testes | `grep -o 'test(' frontend/e2e/*.spec.ts \| wc -l` | **15** chamadas `test(` em 7 specs; o runner reportou 16 `[DOC: FB-playwright §2]` | conclusão (suíte fora de portão, 12 ✘) confere; a contagem estática difere em 1 — `[Q11]`, `/frontend-qa` explica ao reescrever |
| 13 | regras bloqueantes: **8** | `harness rules list --severity block` | **8** | confere |
| 14 | `components`: **7**, `CLAUDE.md` lista 6 (`[GAP G1]`) | `harness policy --key components` | **7** (`infra` incluído) | confere; `[GAP G1]` mantido, dono owner |

### 0.2 Os defeitos de critério e a lacuna de desenho — consertados aqui

- **`[C1]`** §1.2 linha 6 do PRD: "1 falso positivo" → são **9**, e a causa é `-i` casando `etAg`. Conclusão intacta (0 reais). Esta SPEC usa `grep -rn 'CORSMiddleware'` (case-sensitive, `ADR-029/F-029-8`) como instrumento.
- **`[C2]`** §17 do PRD: *"`web-fullstack.browser-imports-server` é exatamente a propriedade de `CA-F1-4`"*. **Não é.** A regra do pack é `regex = "from\s+["'](\.\./)*backend/|require\(["'].*backend/"` sobre `frontend/src/**` (`packs/web-fullstack/rules.toml:12-17`) — mede *import de caminho `backend/`*, não *módulo server-only no grafo do browser*. A propriedade de `CA-F1-4` é medida por `next build` + `import "server-only"` (`ADR-028/D2`); a regra do pack é **endereçável** (não dispara) mas não é o instrumento. §7 corrige o mapeamento.
- **`[C3]`** `CA-F1-8` do PRD: *"`error.tsx` distingue 3 causas"*. Em build de produção o Next **redige a mensagem** de erro de servidor entregue ao boundary cliente (só `digest` chega) `[INFERRED: comportamento documentado do App Router; não medível nesta árvore — não há `error.tsx`]`. Três textos via `error.tsx` passariam em `next dev` e colapsariam em `next start`. **Resolvido por `ADR-028/D4`**: o Server Component renderiza o erro a partir de um discriminante tipado; `error.tsx` é rede de última instância. `CA-F1-8` mantém a **propriedade** (3 causas distintas) e ganha a cláusula *"sob `next start`"* (§5, `F-028-6`).
- **`[L1]` lacuna de desenho** `[GAP G2]` — causa raiz do 0 CSS, que o PRD delegou ao `frontend-architect`: **medida aqui como AUSÊNCIA, não quebra** — `layout.tsx` não importa stylesheet (`:1-12`), `frontend/package.json` tem **0** ocorrência de `tailwind`, não existe `postcss.config.*`/`tailwind.config.*` (`ls frontend/` → 8 arquivos, nenhum deles), e `layout.tsx:3-5` declara *"Styling/Tailwind pipeline is out of scope for T-05.11"* `[MEDIDO 2026-09-04]`. `DESIGN_SYSTEM.md` referencia a paleta *"na config do Tailwind"* (`:242,:293,:307`) e `STITCH_CONTEXT.md` cita Tailwind em **16** linhas. **Diagnóstico:** o pipeline de estilo nunca foi configurado; o design aprovado vive em documento e não em runtime. §3.3 fixa o **contrato** (≥ 1 stylesheet da app aplicada; glifos em fonte de ícone); o **mecanismo** (Tailwind conforme `DESIGN_SYSTEM.md` × CSS puro) é decisão do `frontend-architect` sob gate `ux-ui-mastery` dentro de `F1`, com `[INFERRED I-8: Tailwind, porque é onde o `DESIGN_SYSTEM.md` já declara os tokens — custo de reversão: os tokens são W3C-agnósticos, 1 arquivo de config]`.

### 0.3 O que o PRD pediu ao `/architect` e o estado de cada pedido

| pedido (`handoff_to_architect.md`) | estado |
|---|---|
| Gap Analysis | **feita** — §0.1/§0.2; `approve prd` + `advance PRD_VALIDATED` registrados |
| ADR de `RN-1` com co-assinatura `quant-architect` | **`ADR-028`** escrita; co-assinatura do `quant-architect` **CO-ASSINA** (2026-09-04, seção final da ADR) — com `F-028-4` re-baselinado (2 hits de `crypto.subtle`, ambos comentário ⇒ 0 filtrando comentário) e **3 falsificadores acrescentados**: `F-028-1''` (morde transitivo, prova a hierarquia `D2 > D3`), `F-028-7` (`server-only` exige `--conditions=react-server` no `node --test`, senão mata o instrumento de `DoD-2`), `F-028-8` (`fingerprint-sync-boundary.test.ts` reescrito, não apagado). Os três entram em §3.2 e no DoD de `F1` |
| Fixar a data do `TBD` do envelope agregado por série (`[Q7]`) | **fixada em §3.6**: **2026-09-11** `[INFERRED I-9]`; `F3` não recebe `dispatch builder` sem a ADR do `quant-architect` referenciada em `03_recursos_baratos.md` |
| SPEC + plano em 3 fases | esta SPEC + [`docs/plans/SPEC-003-camada-de-leitura-do-painel/`](../plans/SPEC-003-camada-de-leitura-do-painel/index.md) |

---

## 1. Objetivo e fronteira

### 1.1 Objetivo, em cinco propriedades verificáveis (herdadas de `PRD-003` §2, sem reescrita)

1. Todo dado em `/painel` vem de resposta HTTP da API **na renderização**, ou a página exibe **estado de sistema**; nunca fixture em bundle de produção.
2. A API é alcançável por configuração **versionada** (dev) e **estruturada** para produção (compose + Caddy próprio), **sem ser implantada**.
3. A API **discrimina** misconfiguração de "sem dado".
4. O design aprovado **chega ao browser**.
5. Cada propriedade tem teste executável (Playwright / `node --test` / pytest) que **reprova com o servidor ausente** — ou, para estados de erro, com o servidor **presente**. Nunca os dois verdes.

### 1.2 Termos (na ausência de glossário — `[GAP G5]` do PRD, dono `/pm`)

*Server Component* — componente React renderizado no processo Next (Node), nunca no browser · *Client Component* — arquivo com diretiva `"use client"` como primeira instrução · *módulo de transporte* — `frontend/src/features/s1-console/ingest-health-query.ts` · *store* — SQLite (dev) / Postgres (prod) que `/ingest-health` lê · *mesma origem por caminho* — um host público; o proxy roteia `${API_PREFIX}/*` para a API e o resto para o Next · *estado "sem fonte"* — bloco da tela cujo dado não tem rota na API nesta feature e que diz isso · *fact* — par `nome:valor` que o e2e lê de `data-fact` e grava em `facts.jsonl`.

### 1.3 Fora, por remissão (não reabrir aqui)

Implantação (`NG-1`) · escrita (`ADR-027`, `NG-2`) · recursos `2`/`3`/`4c`/`6` (`NG-3`, sujeito a M1 — e M1 aqui é *quantas fases*, não *quais recursos*: os quatro continuam fora em todas as combinações) · SSE (`NG-4`) · redesign (`NG-5`) · auth (`NG-6`, com `ADR-029/D6` reservando estrutura) · CORS (`NG-7`) · renomes de `/painel`, `janela_de_perda`, eventos de log (`NG-8`) · crescer as 15 colunas (`NG-9`) · e2e em `make verify` (`NG-10`, M5).

---

## 2. Decisões normativas que esta SPEC USA (e não reabre)

| decisão | onde | efeito nesta SPEC |
|---|---|---|
| Porta de leitura é o backend; Next renderiza; BFF recusado | `ADR-005/D5` `[DECISÃO-OWNER: 2026-09-03]` | `route.ts` = 0; zero SQL/schema no Next (§4) |
| Envelope `{query, n_runs, n_gaps, runs[15], gaps[8]}`; `ETag` fora da região hasheada; `fingerprint` síncrono em Node/Python | `ADR-005/D6.1, D6.3, D6.4` | §3.2, §3.4; campo novo **no envelope** não move o `sha256`, em `runs[]` move |
| Base URL por env do servidor; nunca `NEXT_PUBLIC_*`; parser estrito em campo ausente | `ADR-019/D2, D4` | §3.2, §3.5 |
| Server Component + `server-only`; ESLint por diretiva; erro renderizado pelo servidor | **`ADR-028`** D1–D5 | §3.1–§3.3 |
| Caddy próprio, mesma origem, `API_PREFIX` única, `create_app` recusa, `/ready`, `ETag`/`304`, porta não publicada | **`ADR-029`** D1–D6 | §3.4–§3.5 |
| API é o processo (c) de `ADR-027/D1` — *"já existe (`src.main`)"*; mesma imagem Python | `ADR-027/D1` | serviço `api` do compose reutiliza a imagem; 0 processo novo além do Caddy |
| `janela_de_perda` é coluna de contrato; fórmula no backend | `CLAUDE.md` linha 11; `ADR-008/D3` | §3.7: rótulo de UI ≠ nome de coluna; front não recalcula |
| String de UI pt-BR; numeral no fio com ponto decimal | `SPEC-001 §3.8`; `CLAUDE.md` linha 8 | §3.7 |
| Design decide o `ui-designer`; vale quando `ux-ui-mastery` concorda | `CLAUDE.md` §Design | toda forma/microcopy de §3.3 é *TBD pelo gate*, com o **contrato de estado** fixado aqui |

---

## 3. Contratos

### 3.1 A página — Server Component e Client Component (`web`, `F1`)

| elemento | contrato |
|---|---|
| `frontend/src/app/painel/page.tsx` | **Server Component `async`**; sem `"use client"`; chama o módulo de transporte **uma vez por render**; constrói `S1ViewModel` e `S3ViewModel` (serializáveis: só JSON — sem `Date`, função ou classe) e os passa por props a `PainelClient` |
| `frontend/src/app/painel/PainelClient.tsx` | **`"use client"`**; recebe `{ s1: S1ViewModel; s3: S3ViewModel; sourceState: SourceState }`; guarda o estado de UI (`filterText`; `openedSeriesId` **sai** — M3); importa de `ingest-health-query.ts` **só `import type`** |
| `frontend/src/app/painel/loading.tsx` | existe; é o fallback de streaming enquanto `page.tsx` aguarda a API; `data-fact="ui_state:loading"` |
| `frontend/src/app/painel/error.tsx` | existe (`"use client"`); texto **genérico** pt-BR + ação "tentar de novo"; **não** tenta distinguir causa (`ADR-028/D4`); `data-fact="ui_state:error_boundary"` |
| `frontend/src/app/not-found.tsx` | pt-BR, `lang=pt-BR` herdado do layout, link para `/painel` |
| `frontend/src/app/page.tsx` (raiz) ou `next.config.ts` | `GET /` → redirect **3xx** para `/painel` (mecanismo: redirect declarado em config ou `redirect()` — quem implementa escolhe; o contrato é o 3xx) |
| `SourceState` | `{ kind: "ok" } \| { kind: "empty" } \| { kind: "error"; error: TransportErrorKind }` — o Server Component o computa e a UI o renderiza; **é ele, não `error.tsx`, que carrega a causa** |
| blocos sem fonte | `Orçamento de disco`, `Reconexões`, `Fila de ETL`, `Completeness`, Camada 2 (`RawDataRow`) renderizam **marcador "sem fonte"** com `data-fact="source:none"`; **0** número vindo de fixture |

**Invariantes:** `find frontend/src/app -name route.ts | wc -l` = 0 · `grep -rn 'NEXT_PUBLIC_INGEST' frontend/src | wc -l` = 0 · `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' | grep -v '\.test\.' | wc -l` = 0 · `grep -rn 'features/panel/Filter' frontend/src/app | wc -l` = 0.

### 3.2 O módulo de transporte (`web`, `F1`; `F2` acrescenta `If-None-Match`)

| aspecto | contrato |
|---|---|
| primeira linha | `import "server-only"` (devDependency `server-only`) — **o portão de `D6.4`** (`ADR-028/D2`) |
| entrada | `fetchIngestHealthProjectionViaHttp(options?)` continua; `baseUrl = options.baseUrl ?? process.env.INGEST_HEALTH_API_BASE_URL`; **lança `missing_base_url`** se ambos ausentes (já lança hoje, `:486`; passa a lançar com discriminante) |
| cache | `F1`: `cache: "no-store"` **explícito**. `F2`: envia `If-None-Match: <etag conhecido>` quando houver; `304` ⇒ reutiliza a projeção anterior **do mesmo processo** (nunca do browser) |
| erro tipado | `TransportErrorKind = "missing_base_url" \| "connection_refused" \| "non_2xx" \| "malformed_envelope"`; classe única com `kind` e, para `non_2xx`, `status: number`. **A string da mensagem é em inglês** (`CLAUDE.md` §mensagem de exceção); o texto pt-BR é da camada de apresentação |
| saída | `IngestHealthHttpResult` como hoje (`projection`, `fingerprint`, `status`) + `etag: string \| null` (`F2`) |
| view-models | `buildS1ViewModelFromIngestHealthProjection` e `collectorRowsFromIngestHealthProjection` (`:557,:574`) continuam no módulo; `S3` recebe `GapMarkerRow[]` do **mesmo** envelope (`RF-3`); `CollectorRow` mínimo: `uptimePercent = n_written/n_expected` do último run, `resilience: not_scored`, `retention` conforme o run, `janela_de_perda` **exibida como recebida** (`null` ⇒ "não computada") |
| ESLint | `no-restricted-imports` de `ingest-health-query.ts` **morde só** em arquivo com diretiva `"use client"`; `import type` sempre permitido. Formas admitidas: regra local por diretiva **ou** convenção `*.client.tsx` + glob (`ADR-028/D3`). Mensagem continua nomeando `ADR-005/D6.4` |
| **custo de `server-only` nos testes** (`ADR-028/F-028-7`, achado da co-assinatura) | `server-only@0.0.1` **lança na importação** fora da condição `react-server`; `test:s1` roda `node --test` sem condição ⇒ `ingest-health-query-http.test.ts` (8/8 hoje, instrumento de `ADR-008/DoD-2`) **morreria**. Contrato: os scripts `test:s1`/`test:app` que alcançam o módulo passam a rodar com `--conditions=react-server` (ou equivalente) e continuam **verdes** — vermelho com *"cannot be imported from a Client Component module"* é `F-D6-1` deixando de medir |
| **`fingerprint-sync-boundary.test.ts`** (`ADR-028/F-028-8`) | é **reescrito, não apagado**: os probes MORDE ganham `"use client"` na primeira linha; entra um CONTROL **sem** diretiva com import de valor que deve ficar limpo (é o `page.tsx` server de `D1`); o CONTROL `import type` continua. `git log --diff-filter=D -- <arquivo>` não vazio ⇒ o portão foi apagado em vez de reescrito |

### 3.3 Contrato de estado da UI e de estilo (`web`, `F1`) — forma pelo `design_gate`, discriminação pelo e2e

| estado | quando | o que a tela GARANTE (contrato) | `data-fact` |
|---|---|---|---|
| carregando | `page.tsx` aguardando a API | `loading.tsx` visível; **0 `<tr>` de dado** | `ui_state:loading` |
| erro · sem endereço | `missing_base_url` | texto pt-BR nomeando *configuração ausente*; 0 `<tr>`; **sem** número | `error_kind:missing_base_url` |
| erro · conexão recusada | `connection_refused` (API no chão, `curl → 000`) | texto pt-BR nomeando *API inacessível*; 0 `<tr>` | `error_kind:connection_refused` |
| erro · resposta ≠ 2xx | `non_2xx` (inclui `500` por store corrompido) | texto pt-BR com o `status`; 0 `<tr>` | `error_kind:non_2xx` |
| erro · envelope malformado | `malformed_envelope` (`ADR-019/D2` reprova campo ausente) | idem, nomeando *resposta inválida* | `error_kind:malformed_envelope` |
| vazio | `200` com `n_runs = 0` | S1 e S3 com estado vazio pt-BR; **0 `<tr>` de dado, 0 erro** | `ui_state:empty` |
| sem fonte | bloco de §3.1 sem rota | marcador "sem fonte"; 0 número de fixture | `source:none` |
| ok | `n_runs ≥ 1` | `N` `<tr>` em S1, `N` = `(source,endpoint)` distintos; `n_gaps` marcadores em S3 | `ui_state:ok`, `rows:<N>` |

**Regra transversal:** dois estados **nunca** produzem o mesmo conjunto de `data-fact` — é isso que faz `CA-F1-2` medir algo (hoje `sha256` de `<main>` é idêntico com API viva e morta). Microcopy, cor, ícone, layout: `ui-designer` + `ux-ui-mastery`, **dentro de `F1`**, com o gate registrado em `docs/context/camada-de-leitura-do-painel/gates/`.

**Estilo (`RF-12`, `[L1]`):** `layout.tsx` importa **≥ 1** stylesheet global da app; o browser aplica **≥ 1** `document.styleSheets` cujo `href` **não** é `__nextjs-Geist`/interno; `td` **não** herda `Times New Roman`; glifos renderizam em **fonte de ícone**, não como texto (`PARADOstop_circle` é o defeito, `FB-playwright §4 #5`). Mecanismo: `frontend-architect` (`I-8`). Tokens: os do `DESIGN_SYSTEM.md` — esta SPEC **não** os redefine (`NG-5`).

**Controles (`RF-10`, `RN-5`):** filtro do catálogo **filtra** (`catalog_rows_after_nonmatching_filter = 0`; casante ⇒ `1 ≤ n ≤ before`); `abrir` **removido** (M3 default). Nenhum controle inerte em produção.

### 3.4 A API — readiness, boot, `ETag`, prefixo (`infra`; `F2`, com `F1` antecipando só `.env.example` + `make api`)

| contrato | forma |
|---|---|
| **boot** | `create_app(store_path)` **lança** (mensagem em inglês nomeando o caminho) se `Path(store_path).parent.exists()` é `False`; `python -m src.main` ⇒ `rc ≠ 0`. A verificação vive no **composition root**, nunca no store nem no use case |
| **`GET {API_PREFIX}/ready`** | `200` ou `503`; corpo `{"store": {"path": "<str>", "exists": <bool>, "schema_present": <bool>}}`. `200` ⇔ `exists ∧ schema_present`. Nenhum outro campo em `F2` (campo novo depois é aditivo) |
| **`GET {API_PREFIX}/ingest-health`** | corpo **intocado** (`ADR-005/D6.1`): arquivo ausente / 0 byte / sem tabela ⇒ `200 {"query":"ingest_health_query","n_runs":0,"n_gaps":0,"runs":[],"gaps":[]}`; corrompido ⇒ `500` (já é). **Header novo:** `ETag: "<hex sha256 de IngestHealthReport.fingerprint()>"` (aspas fortes, sem `W/`). `If-None-Match` igual ⇒ `304` **sem corpo**, `ETag` repetido; diferente/ausente ⇒ `200` |
| **`API_PREFIX`** | lido **uma vez** em `src.main` de `API_PREFIX` (env), default `/api/v1`; todas as rotas montadas sob ele; `openapi.json` reflete; o `Caddyfile` recebe o **mesmo** valor por env. Ausente ⇒ default, nunca raiz |
| **bind** | `127.0.0.1:${APP_PORT}` (`__main__.py:27`, inalterado) |
| **log de acesso** | uvicorn com access log **ligado** no `make api` — é o instrumento de `CA-F1-1` (1 linha `GET {API_PREFIX}/ingest-health` por render) |
| **CORS** | **nenhum** middleware (`ADR-029/D2`) |

### 3.5 Configuração e `deploy/` — estrutura, não implantação (`infra`; `.env.example` + `make api` em `F1`, resto em `F2`)

**`.env.example`** (raiz), chaves e semântica — todas lidas por processo, nunca inlinadas no bundle:

| chave | quem lê | default de dev |
|---|---|---|
| `APP_PORT` | `api` | `8000` |
| `API_PREFIX` | `api`, `caddy` | `/api/v1` |
| `INGEST_HEALTH_STORE_PATH` | `api` | `data/md/ingest_health.sqlite3` |
| `INGEST_HEALTH_API_BASE_URL` | `web` (servidor) | `http://127.0.0.1:8000` (dev) · `http://api:8000` (compose) |
| `PUBLIC_HOST` | `caddy` | — (obrigatória em compose; ausente em dev) |
| `PANEL_BASIC_AUTH_HASH` | `caddy` | vazia ⇒ bloco de auth inerte (`ADR-029/D6`) |
| `QUARANTINE_STORE_PATH` | `api` (`F3`) | `data/md/series_quarantine.sqlite3` `[NÃO SEI: caminho em prod — [Q8]]` |
| `POSTGRES_*` | `postgres` | já existem no `compose.yml` |

**`Makefile`:** alvo `api` (`cd backend && .venv/bin/python -m src.main`, honrando `.env`) e alvo `e2e` (sobe API de **teste** sobre store efêmero com ≥ 1 run, sobe `next start`, roda `playwright test`, derruba tudo; `rc` do Playwright) — **não** entra em `verify` (M5).

**`deploy/compose.yml`** — serviços: `postgres` (existente) · `api` (imagem Python de `ADR-027`, `command` = `python -m src.main`, **sem `ports:`**, `env_file`, `restart: unless-stopped`, log com teto `max-size: 10m × max-file: 3` como `ADR-027:69`) · `web` (`next start`, sem `ports:`) · `caddy` (`caddy:2-alpine`, `ports: 80/443`, volumes `Caddyfile` + `caddy_data`/`caddy_config` — únicos volumes novos, **com teto natural**: certificados e config, KB). Toda credencial por `${VAR}` (`own.compose-hardcoded-secret`).

**`deploy/Caddyfile`** — um site `{$PUBLIC_HOST}`; `handle_path`/`handle {$API_PREFIX}/*` → `reverse_proxy api:{$APP_PORT}`; `handle` → `reverse_proxy web:3000`; bloco `basic_auth` condicionado a `{$PANEL_BASIC_AUTH_HASH}`; TLS parametrizado (`[Q10]`). `grep -c reverse_proxy` = **2**.

### 3.6 Os três envelopes de `F3` (`sentimento` forma · `infra` rota · `web` parser)

Todos seguem a **família de `ADR-005/D6.1`**: envelope JSON tipado, `query` nomeada, contadores, linhas-objeto; parser permissivo em campo desconhecido e **estrito** em campo ausente (`ADR-019/D2`); **nenhum** toca as 15 colunas de `ingest_health` (`NG-9`).

| envelope | rota | forma (contrato) | estado |
|---|---|---|---|
| **catálogo** | `GET {API_PREFIX}/series-catalog` | `{"query":"series_catalog","n_entries":7,"entries":[SeriesCatalogEntry…]}`; `SeriesCatalogEntry` no fio = os campos do tipo TS `series-catalog.ts:134` (mesmos nomes; `Completeness` **não** vai no fio — o front preenche `unmeasured`); handler com **0** linha de SQL — concatena as 7 constantes via use case `list_series_catalog()` | **fechado aqui na forma; nomes de campo = os do TS já publicado** |
| **quarentena** | `GET {API_PREFIX}/series-quarantine` | `{"query":"series_quarantine","n_rows":N,"rows":[{source, series_kind, binance_symbol, coinalyze_symbol, n_points, recorded_at, terms…}]}`; **`points_json` nunca vai** por padrão; porta `list_all()` no store (`sqlite_series_quarantine_store.py`); `QUARANTINE_STORE_PATH` ausente ⇒ `create_app` recusa (mesma regra de §3.4) | **fechado na forma**; campos `terms…` = `QuarantineTerms` do TS (`quarantine.ts:15`) |
| **agregado por série** (`US-10`) | `GET {API_PREFIX}/collector-status` `[INFERRED I-10: nome; 1 linha para trocar]` | `{"query":"collector_status","n_rows":N,"rows":[CollectorRow…]}` com `status`, `uptimePercent`, `resilience`, `retention` (6 variantes, `domain.ts:59-79`) — **a fórmula de cada campo é `TBD`, dono `quant-architect`** (`[Q7]`); use case sobre `IngestRecordSource.runs()` (porta existente, sem método novo) | **`TBD` com data: ADR do `quant-architect` até 2026-09-11** `[INFERRED I-9: 1 semana; F3 não recebe `dispatch builder` sem ela]` |

### 3.7 Locale, rótulo e coluna de contrato (`web`, `F3`; a parte de rótulo pode antecipar em `F1` sem custo)

- **Um** formatador (`Intl.NumberFormat("pt-BR")`) na camada de apresentação; **0** `toLocaleString` espalhado (`grep -rn toLocaleString frontend/src --include='*.tsx' | grep -v test | wc -l` = 0); no **fio**, ponto decimal (`SPEC-001 §3.8`).
- Rótulo de UI é superfície da linha 8 (`Janela de perda`); nome de coluna é linha 11 (`janela_de_perda`) — **os dois coexistem**, nenhum renomeia o outro (`RN-8`).
- `computeUniformWindowDays` fica **só** em `domain.ts`/teste; a tela exibe `janela_de_perda` **como veio** (`RN-4`).

---

## 4. Limites de camada

| de → para | permitido | proibido | instrumento |
|---|---|---|---|
| Client Component (`"use client"`) → `ingest-health-query.ts` | `import type` | import de **valor** | ESLint por diretiva (sinal) + `next build`/`server-only` (juiz) — `ADR-028/D2-D3` |
| qualquer `frontend/src/**` → `backend/` | — | tudo | `web-fullstack.browser-imports-server` (pack, `[BLOQUEIO]`) — endereçável, nunca dispara |
| `frontend/src/app/**` → `features/panel/Filter.tsx` (bancada) | — | tudo | `grep` de §3.1 |
| Next → SQL / schema / `route.ts` | — | tudo (`ADR-005/D5`) | `find … route.ts` = 0; `F-D5-2` de `ADR-005` |
| `src.api` → `src.modules.sentimento.infra` | — | direto (só via `src.main` injeta) | `make boundaries` (`ADR-009/D6.3`, contrato `layers` `["main","api \| jobs","modules"]`) |
| `src.api` handler → SQL | — | tudo (`D5.13c`) | `grep -rn 'SELECT' backend/src/api | wc -l` = 0 |
| `web` → `charts` | — | tudo (`D5.12`) | ESLint boundary existente |
| `deploy/*` → segredo literal | `${VAR}` | literal | `own.compose-hardcoded-secret` (`deploy/` em `include_prefixes`, `harness.toml:369`) |

---

## 5. Comportamento de borda — a tabela que o e2e executa

Convenção: **API de pé** = `make api` sobre store de teste com ≥ 1 run · **API no chão** = processo morto (`curl → 000`) · **NEXT** = `next start` (não `next dev`) com `INGEST_HEALTH_API_BASE_URL` apontando para a API.

| # | condição | API de pé | API no chão | o que reprova |
|---|---|---|---|---|
| B1 | `GET /painel` | `N ≥ 1` `<tr>`; access log da API `+1`; `ui_state:ok` | 0 `<tr>`; `error_kind:connection_refused`; access log **não** incrementa | linha com API `000` ⇒ `:225` repetido |
| B2 | `<main>` de pé × chão | bytes e `sha256` **diferentes** | — | iguais ⇒ `CA-F1-2` não mede (hoje `dc30fd31…` nos dois) |
| B3 | env `INGEST_HEALTH_API_BASE_URL` **unset** | `error_kind:missing_base_url` (mesmo com API de pé — não há endereço) | idem | qualquer `<tr>` |
| B4 | stub que responde `500` | `error_kind:non_2xx`, `status:500` | n/a | texto igual ao de B1-chão ⇒ `D4` falhou |
| B5 | store com **0 runs** | `ui_state:empty`; 0 `<tr>`; 0 erro | `error_kind:connection_refused` | vazio e erro com o mesmo `fact` |
| B6 | API responde após 2 s (stub com `sleep`) | `ui_state:loading` visível **antes** de `ui_state:ok` | `loading` ⇒ `error`, nunca `ok` | `ok` sem passar por loading não reprova (streaming pode ser rápido); `ok` com API no chão reprova |
| B7 | blocos sem fonte | `source:none`; `grep -c '1.6 GB\|99.8%' <main>` = 0 | idem | número de fixture visível |
| B8 | `GET /` | `3xx` → `/painel` | idem | `200` na raiz |
| B9 | `GET /nao-existe` | `not-found.tsx` pt-BR com link `/painel` | idem | 404 padrão em inglês |
| B10 | `python -m src.main` com pai do store inexistente | **`rc ≠ 0`** | — | sobe (hoje sobe) |
| B11 | `GET /ready` × 3 estados | `503`/`503`/`200` com corpos distintos | `000` | dois estados iguais |
| B12 | `If-None-Match` igual / diferente | `304` / `200` | `000` | `200` para igual |
| B13 | `docker compose -f deploy/compose.yml config -q` | `rc=0`; 3 serviços novos; `api` sem `ports:` | (estrutura; não há "de pé") | `ports:` em `api` |
| B14 | (`F3`) `GET /series-catalog` | `n_entries = 7 = grep -c 'SeriesCatalogEntry('` | `000`; S3 mostra erro, 0 linhas | S3 com linhas sem API |
| B15 | (`F3`) `GET /series-quarantine` | `"points_json" not in rows[0]` | `000`; gaveta mostra erro, **não** `FIXTURE_DIVERGENCES` | fixture na gaveta |
| B16 | (`F3`) tela inteira | `comma_decimal_hits = 0` **ou** `dot_decimal_hits = 0` (hoje 2 e 13) | n/a | as duas > 0 |

**Regra `RN-7` do PRD, adotada como cláusula de toda linha:** as colunas "de pé" e "no chão" **nunca** têm o mesmo veredito para o mesmo CA. Os CAs de estrutura (B13) e de ausência de fixture (B7) **declaram** que não medem comunicação — e é por isso que existem B1/B2 ao lado deles.

---

## 6. Fases e o que M1 decide — `F1` sempre; `F2`/`F3` com custo declarado

| fase | entrega | componente | custo (declarado, não medido) | sem ela, o que fica |
|---|---|---|---|---|
| **`F1` — a página diz a verdade** (`US-1`..`US-4`, `RF-1`..`RF-5`, `RF-10`, `RF-12`) | Server Component + `server-only` + ESLint reescrito; estados; fixture fora; CSS no browser; `.env.example` + `make api`; e2e reescrito + `make e2e`; higiene (`Filter`, `title`, `h1`, redirect, 404) | `web` (+`infra` P0) | 2 arquivos novos de rota, 1 devDependency, 1 regra ESLint, 1 pipeline de estilo, 7 specs reescritos | **nada** — é a fase que fecha o defeito visível (0 comunicação, 0 estado, 0 CSS) |
| **`F2` — a API é alcançável e honesta** (`US-5`..`US-8`, `RF-6`..`RF-8`) | `create_app` recusa; `/ready`; `ETag`/`304`; `API_PREFIX`; `compose.yml` + `Caddyfile` estruturados | `infra` | ~4 arquivos backend (boot, 1 rota, header, prefixo) + 2 em `deploy/` + testes pytest/TS de igualdade do `ETag` | API continua dizendo `200` vazio para caminho errado; sem readiness; sem topologia de produção — o `infra-architect` chamou isto de P0/P1 (`FB-infra §Veredito`) |
| **`F3` — os recursos baratos** (`US-9`..`US-12`, `RF-9`, `RF-11`) | catálogo, quarentena, agregado por série; locale único | `sentimento` + `infra` + `web` | 3 use cases, 3 rotas, 3 parsers, 1 formatador; **bloqueada** até a ADR do `quant-architect` (§3.6, 2026-09-11) | S3 mostra "sem fonte" em catálogo/quarentena; S1 mostra o último run, não o agregado; duas convenções numéricas |

**Ordem obrigatória `F1 → F2 → F3`** (`PRD-003` §1.3): decidir *onde ler* antes de *o que alcançar* antes de *o que mais servir*. `F2` não depende de `F1` em código, mas depende dele em **medição** — `CA-F1-1` é o único instrumento que prova que o `ETag` de `F2` é consumido.

---

## 7. Regras bloqueantes em vigor — endereçadas pelo desenho (`harness rules list --severity block` → 8)

| regra | onde esta feature a toca | como o desenho a satisfaz |
|---|---|---|
| `core.relative-import` | código Python novo em `src/main`, `src/api`, use cases | imports absolutos `src.…` (padrão da árvore) |
| `core.silent-except` | `create_app` (boot), handler `/ready` | erro de boot **relança** com o caminho; `/ready` não engole — `DatabaseError` propaga (`500`) |
| `core.print-statement` | idem | logger nomeado; evento de log **novo em inglês** (`CLAUDE.md` linha 10) |
| `core.hardcoded-secret` | `deploy/`, `.env.example` | `.env.example` só com **chaves e defaults não-secretos**; nenhum valor de credencial |
| `own.compose-hardcoded-secret` | `deploy/compose.yml` | `${VAR}` em toda credencial; `harness rules --mode file --path deploy/compose.yml` vazio (`F-029-6`) |
| `web-fullstack.browser-imports-server` | `frontend/src/**` | nunca importa `backend/`; **não é** o instrumento de `server-only` (`[C2]`) |
| `web-fullstack.tenant-from-request` | n/a | sem tenant |
| `web-fullstack.server-test-directory-present` | `backend/tests/` | existe; `F2` acrescenta testes em `backend/tests/api/` (hoje 3 `def test_`, 2 arquivos) |

Avisos relevantes: `web-fullstack.hardcoded-url` (URL só por env — `ADR-019/D4`); `web-fullstack.browser-test-file-present` (satisfeita por `frontend/e2e/`).

---

## 8. Perguntas em Aberto — com dono; nenhuma bloqueia `SPEC_DRAFT`

| id | pergunta | bloqueia | dono |
|---|---|---|---|
| `[Q1]` | `/painel` em português (linha 12) | não | **owner** — 1 rota hoje, custo cresce com `F3` |
| `[Q2]` | `API_PREFIX` definitivo | `F2` estrutura tolera (default `/api/v1`) | **owner** (M2) |
| `[Q3]` | auth mínima ao implantar | não | **owner** (M4); estrutura reservada (`ADR-029/D6`) |
| `[Q4]` | e2e em `make verify` | não | **owner** (M5) |
| `[Q5]` | teto/paginação de `/ingest-health`; runs em prod | não em `F1`/`F2` | `quant-architect` + owner |
| `[Q6]` | orçamento de latência de render | não (`≤ 3 s` no e2e, `I-6`) | owner |
| `[Q7]` | forma do agregado por série | **`F3`** — até **2026-09-11** | `quant-architect` |
| `[Q8]` | store de quarentena em prod | `F3`/`US-11` | `ADR-002` |
| `[Q9]` | operador vê o `fingerprint`? | não — mas se "sim", `D6.4` reabre | **owner** |
| `[Q10]` | certificado do subdomínio | não (`NG-1`) | **owner** |
| **`[Q11]`** | e2e: 15 `test(` estáticos × 16 reportados pelo runner | não | `/frontend-qa`, ao reescrever a suíte em `F1` |
| `[GAP G1]` | `CLAUDE.md` 6 × `components` 7 | não | **owner** |

**`[INFERRED]` novos desta SPEC:** `I-8` Tailwind como mecanismo de estilo (§0.2 `[L1]`) · `I-9` data 2026-09-11 para `[Q7]` · `I-10` nome `collector-status` da rota agregada.

---

## 9. Falsificador desta SPEC

Se **qualquer** DoD de `F1`–`F3` fechar `done` com a API ausente da passada **e o mesmo veredito** com ela presente, esta SPEC repetiu o defeito de `05_fatia_visivel.md:225` — e a coluna "no chão" de §5 existe para que isso seja um comando, não uma opinião. Segundo falsificador: se `ADR-028` chegar a `approve spec` **sem** a co-assinatura do `quant-architect` preenchida, `RN-1` foi violada e o `/architect` reprovou o próprio handoff.

## 10. Ledger

`approve prd` (architect) → `advance PRD_VALIDATED` → **esta SPEC** → `advance SPEC_DRAFT`. Próximo gate: `approve spec` do **owner** (com M1–M5 nomeados no motivo) → `SPEC_APPROVED` → `/tech-lead`.
