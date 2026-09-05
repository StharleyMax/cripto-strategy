# REVISAO-FB — `frontend-architect` · comunicação front↔back do `/painel`

- **Papel:** `architect` do componente `web` (`A6`). Julgo transporte, contrato na borda, estrutura do app.
  **Não** julgo interação/microcopy (`design_gate`), fidelidade do dado (`quant-architect`) nem infra.
- **Árvore:** `c8e7193` (`git rev-parse --short HEAD`), 2026-09-04. Nenhum código de produção alterado;
  nenhum `approve`/`advance`; nenhum commit. Um probe efêmero foi criado e removido (§2.3, `git status` limpo).
- **Entrada:** `handoff/revisao-comunicacao-front-back-2026-09-04.md`, `handoff/lacunas-leitura-api-painel.md`.
- **Pedido do owner** `[PREMISSA-OWNER: 2026-09-04]`: *"Aplicação cheia de furos de comunicação e experiencia."*

## 0. Veredito

**`/painel` não tem furo de comunicação — tem AUSÊNCIA de comunicação, e ela é decisão que ninguém tomou, não
bug que alguém deixou.** O contrato (`ADR-005/D6.1`) está fixado, o servidor serve (`GET /ingest-health`), o
cliente TS decodifica e prova paridade contra uvicorn real (**8/8** testes, §1). O que não existe é **um ponto
legal de chamada**: o portão de `T-05.16` (`eslint.config.mjs:274-292`) reprova **todo** `import` de valor de
`ingest-health-query.ts` fora de teste — inclusive de um Server Component — enquanto `ADR-019/D4` delega a
fiação exatamente a *"um Server Component/Route Handler"*. **Fiação delegada por uma ADR e proibida por um
portão é lacuna de DECISÃO.** Enquanto ela dura, a página fecha todo dia com o servidor ausente — o defeito que
o falsificador `05_fatia_visivel.md:225` nomeia para os DoD, reproduzido na tela.

## 1. Universo medido (comando → resultado)

| # | fato | comando | resultado | rótulo |
|---|---|---|---|---|
| 1 | módulos TS/TSX do front | `find frontend/src -name '*.ts' -o -name '*.tsx' \| wc -l` | **84** | `[MEDIDO]` |
| 2 | arquivos de teste do front | `find frontend/src -name '*.test.ts' \| wc -l` | **37** | `[MEDIDO]` |
| 3 | testes do front em portão | `grep -n 'node --test\|test:s1\|test:app\|test:s3\|test:charts' Makefile scripts/verify.sh .git/hooks/pre-push \| wc -l` | **0** | `[MEDIDO]` |
| 4 | páginas Next | `find frontend/src/app -name page.tsx` | **1** (`painel/page.tsx`) | `[MEDIDO]` |
| 5 | `"use client"` em produção | `grep -rn 'use client' frontend/src \| grep -v test` | **1** — `page.tsx:1` | `[MEDIDO]` |
| 6 | call sites `fetch(`/`EventSource(` em produção | `grep -rnoE '(fetch\|EventSource)\(' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.'` | **0** (`rc=1`; o único `fetch` é `doFetch(url)` via `fetchImpl` injetável, `ingest-health-query.ts:506`) | `[MEDIDO]` |
| 7 | importadores de `ingest-health-query.ts` | `grep -rln 'ingest-health-query' frontend/src` | **11** arquivos; **0** é `page.tsx`; os 4 de produção são `import type` | `[MEDIDO]` |
| 8 | `process.env` em produção do front | `grep -rn 'process.env' frontend/src … \| grep -v '\.test\.'` | **1** — `INGEST_HEALTH_API_BASE_URL` (`:480`) | `[MEDIDO]` |
| 9 | arquivo `.env*` no front | `ls -a frontend \| grep -iE env` | só `next-env.d.ts` — **nenhum** `.env` | `[MEDIDO]` |
| 10 | onde a var está documentada | `grep -rl INGEST_HEALTH_API_BASE_URL --include='*.md' --include='*.toml' .` | **6** documentos, **0** arquivo de ambiente | `[MEDIDO]` |
| 11 | `loading.tsx`/`error.tsx`/`not-found.tsx`/`route.ts` | `find frontend/src/app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx' -o -name 'route.ts' \| wc -l` | **0** | `[MEDIDO]` |
| 12 | `ETag`/`If-None-Match`/`Cache-Control`/`revalidate` no front (prod.) | `grep -rn 'If-None-Match\|ETag\|etag\|Cache-Control\|revalidate\|no-store' frontend/src … \| grep -v '\.test\.' \| wc -l` | **0** | `[MEDIDO]` |
| 13 | `ETag` no backend | `grep -rn 'ETag\|etag' backend/src --include='*.py' \| wc -l` | **0** | `[MEDIDO]` |
| 14 | rotas HTTP do backend | `grep -rnE '@(router\|app)\.(get\|post\|put\|delete)' backend/src` | **1** — `GET /ingest-health` (`routes/ingest_health.py:25`) | `[MEDIDO]` |
| 15 | CORS no backend | `grep -rn 'CORSMiddleware\|allow_origins' backend/src \| wc -l` | **0** | `[MEDIDO]` |
| 16 | SSE em qualquer lado (prod.) | `grep -rn 'text/event-stream\|EventSource\|StreamingResponse' backend/src frontend/src … \| grep -v '\.test\.'` | **1**, e é COMENTÁRIO (`live-transport.ts:29`, *"no `EventSource` wiring"*) | `[MEDIDO]` |
| 17 | API no ar | `curl -s -o /dev/null -w '%{http_code}' localhost:8000/ingest-health` | **`000`** | `[MEDIDO 22:5xZ]` |
| 18 | front no ar | `curl … localhost:3000/painel` | **`200`** | `[MEDIDO]` |
| 19 | o que o `200` serve | `curl -s localhost:3000/painel \| grep -oE 'Filtro: any resultado serve\|binance…\|Monitoramento…'` | **3 acertos**: fixture (`binance`), título S1 e **`"Filtro: any resultado serve"`** | `[MEDIDO]` |
| 20 | store que a API lê | `test -d data/md` | **`rc=1`** — não existe; API subiria sobre banco inexistente | `[MEDIDO]` |
| 21 | cliente TS contra uvicorn REAL | `cd frontend && node --test src/features/s1-console/ingest-health-query-http.test.ts` | **`tests 8 · pass 8 · fail 0`**, 4,0 s (log em scratchpad) | `[MEDIDO]` |
| 22 | probe: Server-side VALUE import do cliente | §2.3 | **ESLint reprova** (`✖ 1 problem (1 error)`, mensagem `D5.17b`) | `[MEDIDO]` |
| 23 | `harness code-paths classify frontend/src/app/painel/page.tsx` | idem | **`producao`**; `frontend/app/page.tsx` → `nao-producao` | `[MEDIDO]` |
| 24 | `server-only` disponível | `grep -c 'server-only' frontend/package-lock.json` | **0** | `[MEDIDO]` |
| 25 | fórmula `computeUniformWindowDays` fora de `domain.ts`/teste | `grep -rn 'computeUniformWindowDays\|makeComputedUniformWindow' frontend/src … \| grep -v '\.test\.' \| grep -v domain.ts` | **só `fixtures.ts`** (`:22,:40,:56,:73`) | `[MEDIDO]` |
| 26 | `janela_de_perda` no backend | `grep -rn janela_de_perda backend/src --include='*.py'` | `ingest_record.py:38` (coluna) e **`:210` → `LOSS_WINDOW_NOT_COMPUTED_IN_F0`** (sempre `null`) | `[MEDIDO]` |

## 2. Q1 — por que `/painel` roda 100% sobre fixtures

### 2.1 Não é lacuna de CONTRATO

`ADR-005/D6.1` fixa o envelope `{query, n_runs, n_gaps, runs[15 col], gaps[8 col]}`; `to_envelope()`
(`ingest_record.py:181-195`) o serve; `parseIngestHealthEnvelope` (`ingest-health-query.ts:412`) o valida
campo a campo (`ADR-019/D2`: estrito em ausente/malformado); `fetchIngestHealthProjectionViaHttp` (`:501`)
faz a volta completa; `collectorRowsFromIngestHealthProjection` (`:557`) e
`buildS1ViewModelFromIngestHealthProjection` (`:574`) chegam ao `S1ViewModel`. A linha 21 da tabela prova
isso **contra um uvicorn real, incluindo os controles negativos** (`F-D6-1` reordenação, `F-D6-2` campo em
`runs[]` × envelope, `D5.14(i)` servidor ausente/queda no meio — `ingest-health-query-http.test.ts:338,368,495,504`).
`[DOC: ADR-019 §Falsificador G1–G4]`. Contrato: **fechado.**

### 2.2 É lacuna de FIAÇÃO — e a fiação está PROIBIDA

`page.tsx:8-16` importa `COLLECTOR_ROWS`, `ETL_QUEUE_DEPTH_PENDING`, `STORAGE_BUDGET_LINES`,
`RECONNECTION_EVENTS`, `FIXTURE_CATALOG_ROWS`, `FIXTURE_DIVERGENCES`. `[MEDIDO: leitura integral, 51 linhas]`.
Isto foi **desenho, não descuido**: `ADR-018/D2:54,63-68` fixa `page.tsx` como *"Client Component… compõe os 3
`.tsx` que já existem, sem inventar dado novo… fixtures de `T-07.12`"*. O DoD que `T-05.11` tinha de fechar
era `D5.16b` (*"o app RENDERIZA, e não só compila"*), e fechou. **Nenhuma task posterior recebeu o DoD "a
página lê a rota".** `T-05.14` ligou o *cliente* à rota (por teste); `T-05.16` protegeu o cliente; a página
ficou onde `T-05.11` a deixou.

E o portão que `T-05.16` instalou fecha a porta que `ADR-019/D4` deixou aberta:

| documento | o que diz | linha |
|---|---|---|
| `ADR-019/D4` | *"Quem cabeia isto num Server Component é decisão de quem implementa (`painel/page.tsx`/`S1Console` ou um Route Handler)… a restrição que vincula é: jamais `"use client"`"* | `ADR-019:100-118` |
| `eslint.config.mjs` (`T-05.16`, DoD `D5.17b`) | `files: ["src/**/*.{ts,tsx,mts,cts}"]`, `ignores: ["src/**/*.test.ts(x)"]`, `@typescript-eslint/no-restricted-imports` `group: ["**/ingest-health-query.ts"]`, `allowTypeImports: true` | `:274-292` |

O primeiro delega a fiação a um Server Component; o segundo reprova qualquer `import` de valor **de qualquer
arquivo não-teste sob `src/`** — e um Server Component em `src/app/` é um arquivo não-teste sob `src/`.

### 2.3 O probe que decide (par morde/cala)

```bash
# efêmero, criado e removido no mesmo comando; git status limpo depois
printf 'import { fetchIngestHealthProjectionViaHttp } from "../features/s1-console/ingest-health-query.ts";…' \
  > frontend/src/app/_ephemeral-revisao-fb-probe.ts
npx --no-install eslint frontend/src/app/_ephemeral-revisao-fb-probe.ts
# → 1:1 error '../features/s1-console/ingest-health-query.ts' import is restricted … (D5.17b)
# → ✖ 1 problem (1 error, 0 warnings)
```

`[MEDIDO 2026-09-04]` — **morde** sobre um arquivo sem `"use client"`, em `src/app/`, sem nenhum `React`. O
portão mede um **proxy** (*"algum import de valor em `src/`"*) da **propriedade** que `ADR-005/D6.4` enuncia
(*"nunca do caminho de render do BROWSER"*), e o proxy é mais largo que a propriedade: Node executa
`createHash` síncrono; um Server Component **é** Node. **O cala do portão hoje é vacuoso do lado de produção:
0 importadores de valor porque 0 são permitidos, não porque 0 são necessários.**

### 2.4 O falsificador `05_fatia_visivel.md:225`, aplicado à página

> *"Qualquer um de `D5.13`/`D5.14` fechando com o processo servidor ausente… Se o teste novo passar com o
> servidor no chão, o item novo repetiu o defeito."*

Os DoD respeitam a letra: `D5.14(i)` reprova com a porta sem listener (`…-http.test.ts:495`). A **página**
viola o espírito todo dia: linhas 17–19 — API `000`, `/painel` `200` **com seis linhas de coletores**. Um
operador que abra a tela hoje vê `ATIVO`/`PARADO` sobre um servidor que não existe. Isto é *falso verde de
produto*, a mesma classe de sinal que `ADR-012` nomeia para `rc=0`.

**Classificação final: decisão (raiz) → fiação (sintoma). Contrato: não.** A decisão em falta tem duas
metades: (i) `page.tsx` é Server ou Client depois de `ADR-018`? (ii) como o portão de `D6.4` distingue
*bundle de browser* de *render em Node*? Nenhum documento responde às duas; `ADR-019/D4` responde à
primeira ("nunca `use client`") e `T-05.16` a contradiz na prática.

## 3. Q2 — onde a leitura acontece: DECISÃO

**Decido: a leitura acontece em um Server Component, e o módulo de transporte passa a declarar
`import "server-only"`.** `page.tsx` deixa de ser `"use client"`, vira `async`, chama
`fetchIngestHealthProjectionViaHttp()` (base URL do processo Next, `ADR-019/D4`), monta os view-models
(objetos serializáveis, já são) e os entrega a um `PainelClient.tsx` (`"use client"`) que guarda os dois
`useState` de hoje (`page.tsx:28-29`). `fingerprint()` roda em Node, síncrono — `D6.4` intacta.

| alternativa | o que exige | custo | veredito |
|---|---|---|---|
| **(A) Server Component** | split `page.tsx` → server + `PainelClient.tsx`; trocar o portão de `T-05.16` por `server-only` no módulo + regra só em arquivos `"use client"`; `INGEST_HEALTH_API_BASE_URL` no processo Next; `error.tsx`/`loading.tsx` | 2 arquivos novos, 1 regra ESLint reescrita (co-assinatura `quant-architect`, dono de `D6.4`), 1 devDependency (`server-only`, `[MEDIDO: 0 hoje]`) | **escolhida** — cumpre `A4` (*"Next renderiza"*), `ADR-019/D4`, `D6.4`; zero schema no Next |
| (B) Route Handler BFF (`src/app/api/**/route.ts`) | um handler que refaz o `fetch` e re-emite | **recusada pelo owner** `[DECISÃO-OWNER: 2026-09-03]`: *"reabre a porta de segunda verdade… o schema passa a existir em dois lugares"* (`decisoes-do-owner.md:678-680`). Mesmo um pass-through cria uma segunda URL pública para o mesmo dado; `A4` só admite *"sessão/auth"* | recusada |
| (C) `fetch` direto do browser | `NEXT_PUBLIC_*` (proibido por `ADR-019/D4`), `CORSMiddleware` no FastAPI (**0** hoje, linha 15), `fingerprint` via `crypto.subtle` (assíncrono ⇒ **viola `D6.4`**), porta exposta ao cliente | reescreve o instrumento de `DoD-2` e reabre o `[NÃO SEI]` de `D6.4` (*"o operador vê o selo?"*, dono owner) | recusada |

**Por que (A) não é BFF disfarçado:** o Server Component não expõe URL, não re-emite JSON, não define
schema — consome o envelope de `D6.1` como qualquer cliente e produz HTML. A "segunda verdade" que o owner
recusou é *schema em dois lugares*; aqui o schema continua em um (`to_envelope()` + `parseIngestHealthEnvelope`).

**O portão certo para `D6.4`, e por que ele é melhor que o de hoje:** `import "server-only"` faz `next
build` **reprovar** quando o módulo entra no grafo de um componente cliente — mede exatamente *"caminho de
render do browser"*, não *"qualquer import"*. Complemento ESLint: `no-restricted-imports` de
`ingest-health-query.ts` **restrito a arquivos que contêm `"use client"`** (não é expressável só por glob;
precisa de `files` por convenção de nome, ex.: `*.client.tsx`, ou de plugin — `[NÃO SEI]` qual forma o
`T-05.16` successor escolhe; a propriedade é o que fixo aqui).

**Falsificador da decisão (par morde/cala, três casos):**

1. **morde** — arquivo `"use client"` plantado importando `fetchIngestHealthProjectionViaHttp` por valor ⇒
   `next build` reprova nomeando `server-only` · **cala** — o mesmo import em `page.tsx` (server) ⇒ `next
   build` verde.
2. **morde** — API derrubada (`curl → 000`) ⇒ `GET /painel` renderiza `error.tsx` (microcopy pt-BR, dona:
   `design_gate`) e **zero `<tr>` em S1** · **cala** — API de pé ⇒ linhas = `(source,endpoint)` distintos do
   store. **Se a página renderizar linha com a API no chão, a fiação repetiu `:225`.**
3. **erosão** — `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' | grep -v
   '\.test\.'` → **0** (hoje **2**: `page.tsx:12,15`). Fixture volta ao bundle de produção ⇒ reprova.

**Estado do dado durante a transição:** enquanto a API não serve `StorageBudgetLine`/`ReconnectionEvent`/
`ETL_QUEUE_DEPTH_PENDING` (§4), a página **não** os preenche com fixture — mostra estado *"sem fonte"*
(forma: `design_gate`). Fixture em produção é o que este relatório reprova; não pode ser a ponte.

## 4. Q3 — os 6 recursos: contrato TS na borda, e onde mora a fórmula

| # | recurso | contrato TS que EXISTE na borda | o que FALTA na borda (`web`) | decisão / `[NÃO SEI]` (dono) |
|---|---|---|---|---|
| 1 | `CollectorRow` (S1) | `IngestHealthRunRow` 15 col + `parseIngestHealthEnvelope` (`:177,:412`); agregação *"último run por `(source,endpoint)`"* **já existe no TS** (`:557`) — o handoff diz que falta no backend, mas a leitura mínima já é feita aqui | envelope **agregado por série** (status, uptime, resiliência) com parser próprio — hoje `uptimePercent` é `n_written/n_expected` do **último run** (`:540`), não uptime; `resilience: not_scored`; `status` só de `verdict` (liveness é `D7.9`) | **fórmula de `janela_de_perda`: mora no BACKEND, e o front não a recalcula** — ver §4.1. Forma do agregado: **`[NÃO SEI]`, dono `quant-architect`** (`A1`) |
| 2 | `StorageBudgetLine` (S1) | tipo de domínio (`domain.ts:205`), **0** parser | `parseStorageBudgetEnvelope` — rows HTTP, não SSE (é medição por dia, não borda direita) | fonte da medição GB/dia: **`[NÃO SEI]`, donos `infra-architect`** (pegada de disco) **+ `quant-architect`** (semântica) |
| 3 | `ReconnectionEvent` (S1) | tipo (`domain.ts:229`), **0** parser | parser de rows HTTP para histórico; **e** decidir se a cauda ao vivo vai por SSE — o envelope de `ADR-005/D2` é de **bucket**, não de evento | log persistido: `quant-architect` (`SPEC-001 §5.4`). SSE de evento não-bucket: **`[NÃO SEI]`, dono `ADR-005`** (`quant-architect`) — eu só declaro que o envelope de `D2` não o expressa |
| 4 | `CatalogRow` (S3) | `SeriesCatalogEntry` + `assertValidCatalogEntry` (`series-catalog.ts:134,145`) — **validação na borda já existe**; `QuarantineTerms` (`quarantine.ts:15`); `Completeness`/`Provenance` (`domain.ts:32,39`) | `parseCatalogEnvelope` compondo os 3 sub-validadores; rota de catálogo e de quarentena no backend | quarentena é a mais barata (store SQLite real) — concordo com o handoff. `Completeness`: cálculo é `quant-architect` |
| 5 | `GapMarkerRow` (S3) | `IngestHealthGapRow` 8 col, `class` (`:198`) — **zero contrato novo** | ligar: o **mesmo** `fetch` do Server Component alimenta S1 rows **e** S3 gaps | decidido — é a mesma resposta HTTP, uma requisição por render |
| 6 | `RawDataRow` (S3) | `{event_time, src_label_raw, values: Record<string,string>}` (`domain.ts:56-62`); do lado transporte, `HistoryRequestKey` (6 termos), `HistoryResponseCache`, `assertNoTickLevelFields` (`history-transport.ts:60,217,280`) reutilizáveis | rota + parser. ⚠️ para `nature=TICK` o saco `values` carregaria campo por trade ⇒ **colide com o falsificador de `ADR-005`** (*"nenhum tick chega ao browser"*) — a rota de auditoria de série TICK ou é bucketizada ou não existe | é uma **terceira família** (auditoria) ou cabe na linha `charts` de `D6.1`? **`[NÃO SEI]`, dono `ADR-005`** — `F-D6-3` é o gatilho nomeado |

### 4.1 `janela_de_perda` — backend, e o motivo é de contrato, não de gosto

1. É **uma das 15 colunas** que `ADR-008/D3` fixou e que alimentam o `sha256` de `DoD-2` `[DOC: ADR-005/D6.1]`
   ⇒ o valor **é dado do fio**, não derivado no cliente. Se o front recalculasse, a tela poderia divergir do
   `fingerprint` que os dois lados comparam — exatamente a *"duplicação da fórmula nos dois lados"* que o
   handoff teme e `D6.1` recusou.
2. O backend hoje emite `null` (`ingest_record.py:210`, `LOSS_WINDOW_NOT_COMPUTED_IN_F0`) e o **TS já tem
   teste pinando isso**: *"D7.12: janela_de_perda esta presente e null na projecao real — F0 nunca inventa a
   formula"* (`…-http.test.ts:459`) `[MEDIDO: passa, linha 21]`.
3. `computeUniformWindowDays` só é usado por `fixtures.ts` (linha 25) ⇒ com dado real vira **código só de
   teste**; não há consumidor de produção a preservar.

**O que NÃO decido:** `RetentionWindow` é união de **6 variantes** (`domain.ts:59-79`: `computed_uniform`,
`measured_sparse`, `doc_only`, `declared_constant`, `unmeasured`, `not_applicable`) e o fio carrega
`number | null`. O fio **não expressa `D7.12`/`D7.14`**. Crescer a projeção de 15 colunas move o `sha256` de
todo relatório emitido (`CLAUDE.md` §linha 11) ⇒ **ato de `ADR-008/D3`**, não meu. Minha recomendação ao
dono: envelope **separado** (agregado por série) em vez de tocar as 15 colunas — é o desfecho que `F-D6-3`
prescreve quando *"a projeção de 15 colunas não expressa"*.

## 5. Q4 — estados de transporte que o front não modela (arquivo:linha)

| estado | onde deveria estar | onde está ausente | evidência |
|---|---|---|---|
| **loading** | `frontend/src/app/painel/loading.tsx` ou `<Suspense>` | `page.tsx:31-37` computa síncrono sobre constantes; **0** `loading.tsx` (linha 11) | `[MEDIDO]` |
| **erro de rede** (`fetch` rejeita, `!response.ok`) | `frontend/src/app/painel/error.tsx` (Client Component, obrigatório pelo Next) | lançador existe — `ingest-health-query.ts:507-512` (`answered ${status}`) e rejeição de `doFetch` — **nenhum** apanhador; **0** `error.tsx`; `page.tsx` sem `try` (51 linhas lidas) | `[MEDIDO]` |
| **API fora do ar / não configurada** | idem `error.tsx`, com texto distinto para *"sem endereço"* (`resolveIngestHealthBaseUrl` lança em `:481-487`) e *"recusou conexão"* | a página nem chama o cliente ⇒ o estado é **inobservável**: API `000` e painel `200` com dados (linhas 17–19) | `[MEDIDO]` |
| **dado vazio** | ramo de tabela vazia em S1 e no catálogo S3 | `S1Console.tsx:54` `viewModel.rows.map(...)` sem ramo vazio; `S3Inspector.tsx:100` `catalogRows.map`, `:166` `inspectorRows.map` sem ramo vazio. Único empty-state do app: gaveta de quarentena, `s3-inspector/view-model.ts:168` | `[MEDIDO: grep rows.length/emptyState → só :168]` |
| **`ETag` stale / revalidação** | `If-None-Match` no cliente ↔ `ETag` no servidor (`ADR-005/D6.3`) | **os dois lados em 0** (linhas 12–13); envelope sem campo de fingerprint (`ingest_record.py:181-195`); `HistoryResponseCache` só cobre a rota de `D1` e é memória de processo | `[MEDIDO]` |

Sobre `ETag`: `ADR-019/D3` manda o cliente **recomputar** e nunca confiar no `ETag` — correto para paridade.
Mas `D6.3` também dá ao `ETag` a função de **frescor** (*"torna barata a recusa byte-a-byte"*), e essa função
não existe em lado nenhum. `/ingest-health` é **mutável** (cresce a cada run), logo não é cacheável por
construção como a rota de `D1` — o sinal de frescor certo é `ETag`+`304`. **Decido pela minha metade:** o
Server Component envia `If-None-Match` quando o servidor emitir `ETag`; até lá, **nenhum cache** no render
(`fetch` do Next com `cache: "no-store"` explícito — `[INFERRED: default de Next ≥15 já é no-store; declarar
evita depender do default]`). **O conteúdo do `ETag` (= `fingerprint`) é `D6.3`, dono `quant-architect`.**

**Furo de EXPERIÊNCIA que é de arquitetura, não de pixel:** `features/panel/Filter.tsx` é *"Bench file 3 of 3
for `D1.3b`"* — um **artefato de bancada do ESLint** (`ADR-011/D4`) que renderiza o texto literal
**`"Filtro: any resultado serve"`**, e `page.tsx:5,41` o monta na única rota do produto (linha 19 confirma
no HTML servido). O filtro real do S3 é outro (`S3Inspector.tsx:70`, `<input onChange=…>`). `harness
code-paths classify` diz `producao` para tudo em `frontend/src/`, então a bancada **é** produção por
definição do repositório. Decisão minha: bancada sai de `features/` (vai para diretório de teste/bench
declarado); o que entra no lugar é do `design_gate`.

## 6. Q5 — o que NÃO é meu, e quem é o dono

| assunto | dono | por quê |
|---|---|---|
| microcopy e forma de `loading`/`error`/vazio; substituto do `Filter` de bancada; gaveta de quarentena (`T-06.10-design.md §6`, `PENDING`) | `ui-designer` + gate `ux-ui-mastery` | `CLAUDE.md` §Design; `docs/gate-de-design.md` |
| `A1`–`A3`; forma do agregado por série; `Completeness`; semântica de `uptime`; SSE de evento não-bucket; 3ª família de rota (`RawDataRow`); conteúdo do `ETag` (`D6.3`) | `quant-architect` (`ADR-005`, `ADR-008/D3`) | fidelidade do dado e schema de transporte |
| crescer as 15 colunas (`janela_de_perda` tipada) | `ADR-008/D3` | move o `sha256` de todo relatório emitido |
| CORS/TLS, processo da API, container, provisionar `INGEST_HEALTH_API_BASE_URL` e `data/md/`, GB/dia em disco | `infra-architect` | `ADR-009/D5` continua aberto (owner) |
| idioma de `"/painel"` (linha 12); fingerprint exibido na tela (`D6.4 [NÃO SEI]`); Playwright em `make verify`; enunciado de `D5.8` | **owner** | atos de owner nomeados em `CLAUDE.md`, `ADR-005/D6.4`, `05_fatia_visivel.md:104` |

## 7. Portões: o que hoje não protege nada

- **37 arquivos de teste do front, 0 em portão** (linhas 2–3). A suíte de paridade **passa aqui em 4,0 s
  contra uvicorn real** (linha 21) e **ninguém a roda em `make verify`**. Verde que ninguém executa é o
  achado de `D1.7c`. Recomendo `test:s1`/`test:app` dentro de `make test` ou de `lint-frontend` — dono da
  mudança em `Makefile`: `tech-lead`; a propriedade é minha.
- `INGEST_HEALTH_API_BASE_URL`: **6 documentos, 0 arquivos de ambiente** (linhas 9–10). Com (A), o `next dev`
  do owner falharia no primeiro render até a variável existir — e isso é o comportamento **correto**
  (`ADR-019/D4`: *"falha observável, não fuga silenciosa"*), desde que `error.tsx` a torne legível.

## 8. Próximo ato recomendado (não é decisão de owner tomada por mim)

**Uma `ADR` de `web`** — título proposto: *"Camada de leitura do `/painel`: Server Component como único
ponto de `fetch`"* — com quatro decisões: (1) §3 (A); (2) `server-only` substitui a regra ampla de
`T-05.16`, **co-assinada pelo `quant-architect`** porque o instrumento muda e a propriedade (`D6.4`) é dele;
(3) `error.tsx`/`loading.tsx` como **contrato de estado**, forma pelo `design_gate`; (4) fixture sai do
bundle de produção (falsificador 3 de §3). Depois dela, a ordem de custo do handoff vale: **5 → 4-quarentena
→ 1**, com a ressalva de §4.1 sobre 1.

**Perguntas que só o owner fecha, e que esta revisão empurra sem responder:** linha 12 (`/painel`); o operador
vê o `fingerprint`? (`D6.4`); Playwright entra em portão?; `ADR-009/D5` (`infra`).

## Falsificador deste relatório

- Se um arquivo **sem** `"use client"` em `src/app/` importando `fetchIngestHealthProjectionViaHttp` por
  valor passar no ESLint da árvore atual, §2.3 está errado e a lacuna **não** é de decisão. `[MEDIDO: reprova]`.
- Se `curl localhost:3000/painel` devolver `200` **sem** linha de coletor com a API em `000` depois de (A),
  §2.4 deixou de valer — que é o objetivo.
- Se `grep -rn 'computeUniformWindowDays' frontend/src | grep -v test | grep -v domain.ts | grep -v fixtures`
  devolver ≥ 1, §4.1(3) está errado e há consumidor de produção da fórmula no front.
