# PRD-003 — Camada de leitura do `/painel`

**Feature:** `camada-de-leitura-do-painel` (**filha** de `plataforma-dados` — `harness pipeline show camada-de-leitura-do-painel` → evento `relate` em `2026-09-04T23:31:07Z`; `[PREMISSA-OWNER: 2026-09-04]` *"pode ir como filha, é melhor para organizar"*) · **Data:** 2026-09-04 · **Estado do pipeline ao escrever:** `INIT` (`harness pipeline state camada-de-leitura-do-painel` → `INIT`; 3 eventos: `init`, `relate`, `dispatch pm`, todos em `2026-09-04T23:31:07-08Z`) → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `web` (predominante — a página, os estados, a fiação) · `infra` (a camada consumidora `backend/src/api`/`backend/src/main`, `deploy/`, Caddy estruturado) · `sentimento` (use cases de leitura novos: catálogo, agregado por série, listagem de quarentena) · `docs`. **`infra` é componente adotado**, não proposto: `harness policy --key components` devolve **7** elementos — `sentimento, charts, convergencia, backtest, web, docs, infra` — e `harness.toml:39-46` registra o ato `[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]`. ⚠️ `CLAUDE.md` §"Vocabulário fechado de componentes" ainda lista **6** — divergência documental, registrada em §13 `[GAP G1]`, não corrigida aqui (`CLAUDE.md` é do owner).
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` devolve **saída vazia com `rc=0`** e `docs.external_prd_paths` devolve `[]` ⇒ este PRD **nasce aqui**. Não é referência nem extração de fonte externa.
**Insumos lidos (integralmente, nesta ordem):** [`handoff/PRD.md`](../context/camada-de-leitura-do-painel/handoff/PRD.md) (49 linhas) · [`lacunas-leitura-api-painel.md`](../context/plataforma-dados/handoff/lacunas-leitura-api-painel.md) (162) · [`revisao-comunicacao-front-back-2026-09-04.md`](../context/plataforma-dados/handoff/revisao-comunicacao-front-back-2026-09-04.md) (52) · [`REVISAO-FB-frontend-architect.md`](../context/plataforma-dados/gates/REVISAO-FB-frontend-architect.md) (252) · [`REVISAO-FB-infra-architect.md`](../context/plataforma-dados/gates/REVISAO-FB-infra-architect.md) (174) · [`REVISAO-FB-playwright.md`](../context/plataforma-dados/gates/REVISAO-FB-playwright.md) (140) · [`REVISAO-FB-ux-gate.md`](../context/plataforma-dados/gates/REVISAO-FB-ux-gate.md) (66) · `ADR-005` §D5/§D6 · `ADR-019` §D4 · `ADR-027` §D1 · `05_fatia_visivel.md:83-87,215-225` · `decisoes-do-owner.md:668-684` · `deploy/compose.yml` · `frontend/src/app/*` · `frontend/e2e/helpers.ts:50-55` · `frontend/eslint.config.mjs:274-292`. **Não lidos integralmente, por tamanho (`wc -l`): `STITCH_CONTEXT.md` (1.865) e `DESIGN_SYSTEM.md` (1.084)** — este PRD **não redesenha**, e o que precisa deles cabe em uma frase: o design aprovado existe em documento e **não chega ao browser** (`[MEDIDO: REVISAO-FB-playwright §4 #5]`).
**Rev de ancoragem de TODA medição deste documento:** **`master@c8e7193`** (`git rev-parse --short HEAD`). Todo número herdado dos relatórios de revisão foi medido **na mesma árvore** (os quatro relatórios declaram `c8e7193`/2026-09-04) — nenhum número envelheceu entre a revisão e este PRD.
**Tracker:** `harness policy --key tracker` → `{"kind": "jira", "project": "CST", "board_id": "36", "parent_kind": "Epic", "child_kind": "Tarefa"}`. **Modo desta sessão: `local_only`. Motivo: o MCP Atlassian não está autenticado nesta sessão** (a lista de servidores exige OAuth interativo, indisponível aqui). **Nada foi criado, editado ou comentado no tracker por este documento** — e não seria ainda que estivesse autenticado: unidade de valor no tracker é ato posterior à validação do arquiteto (`commands/pm.md`). As unidades de valor candidatas estão em §6, para quem materializar depois.
**Ledger:** `INIT` antes. **Um único ato deste documento: `harness pipeline advance camada-de-leitura-do-painel PRD_DRAFT`** depois de gravado o arquivo (registrado em §17). Nenhum `approve`, nenhum `dispatch`, nenhum `scope`.
**Glossário:** `harness policy --key glossary_doc` devolve **1 byte (só o newline) com `rc=0`**; `grep -n 'glossary' harness.toml` → `rc=1` `[MEDIDO 2026-09-04 em c8e7193]`. **Continua não existindo glossário** — a dívida `ADR-013/D4` que `PRD-002 [GAP G3]` registrou não foi paga. Este PRD não a paga; define os termos que usa em §9.

---

## 0. Como ler este documento

1. **Este PRD é sobre uma AUSÊNCIA, não sobre um bug.** Os quatro revisores convergiram, independentemente, no mesmo diagnóstico: `/painel` não tem *furo* de comunicação — tem **zero** comunicação, e o zero é resultado de uma decisão que ninguém tomou (`ADR-019/D4` delega a fiação a um Server Component; o portão ESLint `D5.17b` de `T-05.16` a proíbe; nenhuma task recebeu o DoD *"a página lê a rota"*) `[DOC: REVISAO-FB-frontend-architect §0, §2.2]`. O que este PRD entrega é a **decisão** e o **contrato de estado**, não um conserto.

2. **Nenhum critério de aceite deste PRD passa com o servidor ausente.** O falsificador de `05_fatia_visivel.md:225` — *"se o teste novo passar com o servidor no chão, o item novo repetiu o defeito que ele existe para consertar"* — é **cláusula de todo `CA-*` de §10**, por escrito, em coluna própria. Foi assim que a tela chegou a exibir `ATIVO 99.8%` sobre uma API que devolve `000` `[MEDIDO: REVISAO-FB-playwright §4 #1, #2]`.

3. **Os seis recursos NÃO custam o mesmo, e este PRD não os trata como um bloco.** A tabela de custo do handoff (`lacunas-leitura-api-painel.md` §Síntese), corrigida pelo `infra-architect` (`REVISAO-FB-infra-architect §1.2`), separa *fiação* (5), *projeção pura* (4a), *agregação sobre dado existente* (1), *rota sobre store existente* (4b), *cálculo/log novos* (4c, 3), *medição do zero* (2) e *transporte novo* (6). §4 propõe um corte `[INFERRED]`; **a escolha do corte é do owner, via menu (§14)**.

4. **`[PREMISSA-OWNER]` é exclusivamente citação literal.** Há **quatro** frases do owner com esse rótulo neste documento (§3), e nenhuma outra afirmação o carrega. As decisões de menu levam `[DECISÃO-OWNER]`. Leitura adotada por agente leva `[INFERRED: motivo]`.

5. **O owner não estava disponível nesta sessão.** Nenhuma pergunta bloqueante foi feita; o que precisava dele está em §13 (Perguntas em Aberto, com dono) ou em §14 (menu, com custo por opção). `[NÃO SEI]` aparece **oito** vezes, e nenhuma foi convertida em `[INFERRED]` para o documento parecer completo.

---

## 1. Contexto e problema

### 1.1 O pedido, literal

> *"Estamos com esse problema. De uma revisada na nossa arquitetura. Comunicação entre front back, use o playwrigth e valide o front. Aplicação cheia de furos de comunicação e experiencia."*
> `[PREMISSA-OWNER: 2026-09-04]`

> *"ok, pode seguir com pm e arquiteto"*
> `[PREMISSA-OWNER: 2026-09-04]` — autorização desta feature, em resposta à revisão.

### 1.2 O que a revisão mediu — a tela, a API e o que há entre elas

| # | fato | comando | resultado | fonte |
|---|---|---|---|---|
| 1 | páginas Next | `find frontend/src/app -name page.tsx` | **1** (`painel/page.tsx`) | `[MEDIDO: FB-frontend-architect §1 l.4]` |
| 2 | requisições do browser a algo parecido com API | e2e `02-rede-e-estados.spec.ts`, `isApiLike` | **0 de 16** (1 `document` + 15 `script`, todas ao Next dev) | `[MEDIDO: FB-playwright §4 #1, n=16]` |
| 3 | `<main>.innerText` com API no ar × API morta | e2e `02`, re-rodado após `curl → 000` | **1318 bytes = 1318 bytes**, screenshots byte-idênticos (`sha256 dc30fd31…`) | `[MEDIDO: FB-playwright §4 #2, §3]` |
| 4 | o que `page.tsx` importa | `grep -n import frontend/src/app/painel/page.tsx` | `fixtures.ts` de S1 (`:7-12`) e S3 (`:15`), `Filter.tsx` de bancada (`:5`); **0** import de `ingest-health-query.ts` | `[MEDIDO 2026-09-04]` |
| 5 | rotas HTTP do backend | `grep -rnE '@(router\|app)\.(get\|post\|put\|delete)' backend/src` | **1** — `GET /ingest-health` | `[MEDIDO: FB-frontend-architect §1 l.14]` |
| 6 | CORS · ETag · `/health` · `/ready` · SSE no backend | `grep -rnEi 'CORSMiddleware\|ETag\|/health\|/ready\|text/event-stream' backend/src --include='*.py'` | **0** reais (1 falso positivo, prefixo da Coinalyze) | `[MEDIDO: FB-infra-architect §0 l.3]` |
| 7 | API sobre `store_path` cujo **diretório-pai não existe** | `INGEST_HEALTH_STORE_PATH=<x>/nao-existe/… uvicorn …; curl /ingest-health` | **`200 {"n_runs":0,…}`** — misconfiguração indistinguível de "coletor nunca rodou" | `[MEDIDO: FB-infra-architect §2, n=2 estados]` |
| 8 | onde `INGEST_HEALTH_API_BASE_URL` está definida | `grep -rn INGEST_HEALTH_API_BASE_URL . \| grep -v node_modules \| grep -vE 'ingest-health-query\.ts\|\.test\.ts'` | **0 arquivos de configuração**; 6 documentos | `[MEDIDO: FB-infra-architect §0 l.11]` |
| 9 | `deploy/` | `find deploy -type f \| wc -l` | **1** (`compose.yml`, só Postgres; sem API, sem Next, sem ingress) | `[MEDIDO: FB-infra-architect §0 l.17]` |
| 10 | arquivos `.css` no front | `find frontend -name '*.css' -not -path '*/node_modules/*' -not -path '*/.next/*'` | **0**; `layout.tsx:3-5` declara *"Styling/Tailwind pipeline is out of scope for T-05.11"* | `[MEDIDO 2026-09-04]` |
| 11 | CSS que chega ao browser | e2e `01`: `link[rel=stylesheet]`, `document.styleSheets`, `font-family` de `td` | **0 stylesheets da app**; `td` em `Times New Roman`; ícones renderizam o **nome** do glifo (`PARADOstop_circle`) | `[MEDIDO: FB-playwright §4 #5]` |
| 12 | controles da app e quantos fazem algo | e2e `04` | **3** (1 `input`, 2 `button abrir`); **2 inertes** — filtro 2→2→2 linhas; `abrir` 0 cabeçalho "Linhas Cruas" | `[MEDIDO: FB-playwright §4 #3, #4, #15]` |
| 13 | `loading.tsx` · `error.tsx` · `not-found.tsx` · `route.ts` | `find frontend/src/app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx' -o -name 'route.ts' \| wc -l` | **0** | `[MEDIDO: FB-frontend-architect §1 l.11]` |
| 14 | probe: import de VALOR de `ingest-health-query.ts` em arquivo **sem** `"use client"` sob `src/app/` | `npx --no-install eslint <probe efêmero>` | **reprova** (`✖ 1 problem`, mensagem `D5.17b`) | `[MEDIDO: FB-frontend-architect §2.3]` |
| 15 | cliente TS contra uvicorn **real** | `cd frontend && node --test src/features/s1-console/ingest-health-query-http.test.ts` | **8/8 passam**, incluindo `D5.14(i)` servidor ausente ⇒ reprova | `[MEDIDO: FB-frontend-architect §1 l.21]` |
| 16 | testes de front em portão | `grep -n 'node --test\|test:s1\|test:app\|test:s3\|test:charts\|playwright' Makefile scripts/verify.sh \| wc -l` | **0** — 37 arquivos de teste unitário + 16 e2e, nenhum em `make verify` | `[MEDIDO: FB-frontend-architect §1 l.3; FB-playwright §1]` |
| 17 | e2e hoje | `npm --prefix frontend run test:e2e` | **12 ✘ / 4 ✓**, 5 BLOCKER · 7 WARNING · 5 INFO | `[MEDIDO: FB-playwright §2, §4, n=16 testes]` |
| 18 | gate de UX | `ux-ui-mastery:ux-audit` sobre §4 do Playwright + shots 01/07 | **18/100**, *"NÃO CONCORDA com o estado atual"* | `[DOC: REVISAO-FB-ux-gate]` |

### 1.3 O diagnóstico, em três camadas — e por que a ordem importa

**Camada 1 — decisão (raiz).** *Onde a leitura acontece?* `ADR-019/D4` diz *"Server Component/Route Handler… jamais `use client`"*; `A4` (`[DECISÃO-OWNER: 2026-09-03]`) recusa o Route Handler BFF; o portão `D5.17b` reprova import de valor em **qualquer** arquivo não-teste sob `src/` — inclusive um Server Component (linha 14). Sobra **nenhum ponto legal de chamada**. O `frontend-architect` **decidiu** (`REVISAO-FB-frontend-architect §3`): Server Component + `import "server-only"` no módulo de transporte + regra ESLint reescrita para morder só em arquivos `"use client"`. Este PRD **adota** essa decisão como requisito (`RF-1`) e a delega ao `/architect` para formalizar em ADR (§8, `RN-1`).

**Camada 2 — alcançabilidade (infra).** Mesmo decidido *onde* ler, hoje **não há o que alcançar**: nenhuma variável definida (linha 8), nenhum `make api`, nenhum serviço em `deploy/` (linha 9), e o único sinal de erro da API é um `200` vazio (linha 7). O `infra-architect` foi explícito: *"o que falta antes de qualquer rota nova é topologia e readiness, não rota"* (`§Veredito`).

**Camada 3 — experiência (sintoma).** Sem CSS (linhas 10–11), sem estados (linha 13), com 2 de 3 controles inertes (linha 12) e um texto de bancada de lint como primeira linha da tela. **O gate de UX concorda que corrigir isto antes das camadas 1–2 é *"pintura sobre dado falso"*** (`REVISAO-FB-ux-gate` Rec. 1). Por isso a **ordem das fases em §5 é 1 → 2 → 3**, e não a ordem de visibilidade.

### 1.4 ⚠️ Um critério herdado que REPROVARIA a implementação correta — e este PRD o corrige antes de herdar

O teste e2e `02-rede-e-estados.spec.ts:9` pergunta *"/painel faz alguma requisição a uma API?"* e classifica via `isApiLike` (`helpers.ts:50-55`: host ≠ `:3000` **ou** caminho casa `/ingest-health|\/api\//`). **Sob a decisão da Camada 1, o browser continua fazendo 0 requisições à API** — o `fetch` acontece no processo Next, do lado do servidor. Esse teste, como está, **reprovaria a arquitetura escolhida e aprovaria a alternativa recusada (C, `fetch` direto do browser)**. `[INFERRED: leitura do spec e da decisão §3(A); não executado contra implementação porque ela não existe]`. Consequência: **`CA-F1-1` mede a comunicação pelo LADO DO SERVIDOR** (log de acesso da API por render + conteúdo da página variando com API no ar × morta), e a asserção de `02:9` **tem de ser reescrita** para a propriedade certa (§10). Um `✘` que vira `✓` "sem mexer no spec", como `REVISAO-FB-playwright §6` promete, **não vale para este teste**.

---

## 2. Objetivo

**Que `/painel` mostre ao operador o estado real dos coletores, lido da API por um caminho decidido, declarado e medido — e que, quando não puder, diga que não pode.** Em termos verificáveis:

1. Todo dado exibido em `/painel` vem de uma resposta HTTP da API na renderização, ou a página exibe um **estado de sistema** (carregando / erro / sem fonte / vazio) — **nunca fixture** em bundle de produção.
2. A API é **alcançável por configuração versionada** (dev) e **estruturada para produção** (compose + Caddy próprio em subdomínio existente), **sem ser implantada** nesta feature.
3. A API **discrimina** misconfiguração de "sem dado": processo não sobe sobre caminho inválido; `/ready` expõe o estado do store.
4. O design já aprovado pelo gate (`T-06.10-design.md`, `T-07.12-design.md`, `DESIGN_SYSTEM.md`) **chega ao browser**.
5. Cada propriedade acima tem um teste **executável por Playwright ou `node --test`**, e **cada um deles reprova com o servidor ausente** (ou, para os de estado de erro, reprova com o servidor **presente**) — nunca os dois verdes ao mesmo tempo.

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo | onde está | efeito aqui |
|---|---|---|---|---|
| D-a | **BFF em Next Route Handler recusado** — *"reabre a porta de segunda verdade… o schema passa a existir em dois lugares"* | `[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` | `decisoes-do-owner.md:672-682`; `ADR-005/D5` | `find frontend/src/app -name route.ts` **tem de continuar 0** (`CA-F1-6`) |
| D-b | **FastAPI é a única porta de leitura; Next renderiza e, se precisar, proxia sessão/auth apenas** | `[DECISÃO-OWNER: 2026-09-03]` (`A4`) | `ADR-005/D5` | zero SQL, zero regra de domínio no Next (`RN-2`) |
| D-c | **`INGEST_HEALTH_API_BASE_URL` é server-only; nunca `NEXT_PUBLIC_*`** | `[DOC: ADR-019/D4]` | `ADR-019:100-118` | `CA-F1-7` |
| D-d | **`fingerprint()` é síncrono, Python e Node, nunca no caminho de render do browser** | `[DOC: ADR-005/D6.4]` | `ADR-005:165` | o instrumento (portão ESLint) muda; a propriedade fica — co-assinatura do `quant-architect` (`RN-1`) |
| D-e | **Envelope `{query, n_runs, n_gaps, runs[15], gaps[8]}`; `ETag` fora da região hasheada** | `[DOC: ADR-005/D6.1, D6.3]` | `ADR-005:136,157` | campo novo **no envelope** não move o `sha256`; em `runs[]` move (`F-D6-2`) |
| D-f | **Caddy**: *"sobre o caddy, 1 n vamos subir agora mas precisa estar estruturado, 2 vai ser um subdomain do dns que já tenho para n ter mais custo enquanto valido. então vai ter o caddy ali sim"* | `[PREMISSA-OWNER: 2026-09-04]` | `handoff/PRD.md` §Decisões | leitura adotada `[INFERRED: "ali" = deploy/ deste projeto, respondendo ao menu "Caddy do vizinho × próprio" de FB-infra-architect §3]` ⇒ **Caddy próprio, em `deploy/`, subdomínio de DNS já existente, mesma origem por caminho, estruturado e NÃO implantado** (`RF-6`, non-goal `NG-1`) |
| D-g | **Feature filha de `plataforma-dados`**: *"pode ir como filha, é melhor para organizar"* | `[PREMISSA-OWNER: 2026-09-04]` | ledger `relate` | numeração de fase própria (`F1`–`F3`), tasks depois em `docs/context/camada-de-leitura-do-painel/` |
| D-h | **Premissas de infra**: VPS compartilhada (6 serviços, disco sob pressão), só Postgres em prod, R2 free tier | `[PREMISSA-OWNER: 2026-09-03]` | `.claude/agents/infra-architect.md:39-48`; `premissas-de-infra-e-stack.md` | nenhum recurso desta feature ocupa disco novo sem teto declarado (`RN-6`); +1 container (Caddy) aceito pelo owner em D-f |
| D-i | **Escrita** (coletor → fila → escritor único) já decidida | `[DOC: ADR-027 D1/D2]` | `ADR-027` | fora deste PRD (`NG-2`); a API é o processo **(c)** de `ADR-027/D1`, *"já existe (`src.main`)"* |
| D-j | **Rota `/painel` (linha 12 da tabela de idioma)**: NÃO decidida, dono owner | `[NÃO SEI]` | `CLAUDE.md` §linha 12; `PRD-002 [Q2]` | **não decidido aqui** — `[Q1]` em §13 |
| D-k | **`janela_de_perda` é coluna de contrato; fórmula mora no backend; front não recalcula** | `[DOC: CLAUDE.md linha 11; FB-frontend-architect §4.1]` | `ingest_record.py:38,210` | `RN-4`; `computeUniformWindowDays` vira código só de teste |
| D-l | **`sentimento`/`web` string de UI em pt-BR; numeral com ponto decimal invariante de locale** | `[DOC: SPEC-001 §3.8; CLAUDE.md linha 8]` | `SPEC-001:309-320` | `RF-11`, `CA-F3-3` |

---

## 4. Escopo — os seis recursos e as pré-condições, com o corte proposto

### 4.1 Pré-condições que valem para os seis (nenhuma é rota) — `[DOC: FB-infra-architect §1.1]`

| # | lacuna | quem | fase |
|---|---|---|---|
| P0 | **alcançabilidade** — `.env.example`, `make api`, `INGEST_HEALTH_API_BASE_URL` definida em algum lugar versionado | `infra` | **F1** |
| P1 | **readiness que discrimina store** — `create_app` falha se `Path(store_path).parent` não existe; `GET /ready` expõe `{store: {path, exists, schema_present}}` com `200`/`503` | `infra` | **F2** |
| P2 | **`ETag`** emitida (valor = `fingerprint`, dono `quant-architect`); Server Component envia `If-None-Match` | `infra` emite · `quant-architect` valor · `web` consome | **F2** |
| P3 | **prefixo de URL** (`/api/v1` proposto) — é o que permite roteamento same-origin no Caddy sem CORS | **owner decide o segmento** (`[Q2]`) · `infra` implementa | **F2** (estrutura com prefixo como constante única) |
| P4 | **CORS: não** — same-origin por proxy + leitura server-side torna `CORSMiddleware` desnecessário; `allow_origins=["*"]` é **recusado** | `infra` | (decisão, não trabalho) |
| P5 | **SSE** — só necessário para `AO VIVO`/recurso 6 | `infra` transporta · `quant-architect` envelope | **fora** (`NG-4`) |

### 4.2 Os seis recursos — custo corrigido e corte proposto

| # | recurso | tela | o que já existe | o que falta | custo (infra) | **corte proposto** `[INFERRED]` |
|---|---|---|---|---|---|---|
| 5 | `GapMarkerRow` | S3 | endpoint + cliente TS + `IngestHealthGapRow` (8 col) | ligar o Server Component; **mesmo `fetch`** alimenta S1 rows e S3 gaps | 0 backend; **P0** | **F1** |
| 1-mín | `CollectorRow` mínimo | S1 | `collectorRowsFromIngestHealthProjection` (`:557`) — último run por `(source,endpoint)` | nada para a leitura mínima; `uptimePercent` é `n_written/n_expected` do último run, `resilience: not_scored` | 0 | **F1** (o que o fio de hoje expressa) |
| 4a | `CatalogRow.entry` | S3 | **7** `SeriesCatalogEntry(` constantes em 3 módulos de `domain/` `[MEDIDO: FB-infra §1.2, n=7]` | use case de 1 função + DI stub + rota; `parseCatalogEnvelope` no TS | 0 I/O, 0 disco, 0 env var | **F3** |
| 1-agr | `CollectorRow` agregado (status, uptime, resiliência) | S1 | mesmo store, mesma porta injetada | use case de agregação; **envelope separado** (não tocar as 15 colunas — `ADR-008/D3`); forma do agregado `[NÃO SEI]`, dono `quant-architect` | 0 | **F3** |
| 4b | `QuarantineTerms` | S3 | tabela `series_quarantine` (13 col) escrita por `coinalyze_one_shot_cli` | método `list_all()` na porta (`sentimento/infra`, dono `quant-architect`) + **2ª env var** de store + DI stub + rota; **não devolver `points_json` por padrão** | 0 novo; caminho do store em prod `[NÃO SEI]` (`ADR-002`) | **F3** |
| 4c | `Completeness` | S3 | nada | cálculo esperado × presente (`grid`) / contiguidade (`tick`) — `quant-architect` | 0 | **fora** (`NG-3`) — sem dado local para validar |
| 3 | `ReconnectionEvent` | S1 | lógica de overlap/colisão em 4 módulos | **log persistido** — primeiro recurso que **ocupa disco sem teto natural**; teto por linhas antes de nascer | disco | **fora** (`NG-3`) |
| 2 | `StorageBudgetLine` | S1 | primitiva `pg_total_relation_size`/`Path.stat().st_size` | atribuição por `source` (`[NÃO SEI]`, schema `ADR-002`); GB/**dia** exige 1 linha/dia/fonte | 1 linha/dia/fonte | **fora** (`NG-3`) |
| 6 | `RawDataRow` | S3 | `HistoryRequestKey`, `HistoryResponseCache`, `assertNoTickLevelFields` reutilizáveis | rota + parser; para `TICK` **colide com o falsificador de `ADR-005`** (*"nenhum tick chega ao browser"*); 3ª família de rota ou linha `charts`? `[NÃO SEI]`, dono `ADR-005` | exige P2 (cache) e, com `AO VIVO`, P5 | **fora** (`NG-3`) |

**Por que este corte e não "os seis" `[INFERRED]`:** (i) os quatro recursos "fora" exigem, cada um, uma decisão de `quant-architect`/`ADR-005`/`ADR-002` que **não é de produto** e ainda não foi tomada — embarcá-los faz o PRD prometer o que não pode especificar; (ii) três deles (`2`, `3`, `6`) são os únicos que **ocupam disco ou abrem conexão longa**, contra a premissa D-h; (iii) a tela **já tem lugar** para "sem fonte" — o `frontend-architect` decidiu que *"a página não os preenche com fixture — mostra estado 'sem fonte'"* (`§3`), o que dá a esta feature um fim observável **sem** eles. **Custo de errar este corte:** se o owner quiser os seis, o custo é uma segunda feature filha, não retrabalho — nada em F1–F3 é jogado fora. **A escolha é do owner: §14, item M1.**

### 4.3 O que a tela mostra para o que NÃO tem fonte nesta feature — `RN-3`

`StorageBudgetLine`, `ReconnectionEvent`, `ETL_QUEUE_DEPTH_PENDING`, `Completeness`, `RawDataRow` (Camada 2): **estado "sem fonte"** (forma e microcopy: `design_gate`), **nunca fixture**. E o controle que abre a Camada 2 (`abrir`) **não pode continuar inerte** — `RN-5` exige ligar ou remover; como `RawDataRow` está fora, a escolha entre *"remover até existir"* e *"abrir a camada com estado sem fonte"* é **M3 do menu**.

---

## 5. User stories — com fronteira por fase

Cada fase é uma unidade que fecha sozinha, com falsificador próprio. **Ordem obrigatória F1 → F2 → F3** (§1.3). Componente declarado por story; `harness policy --key components` cobre todos.

### F1 · A página diz a verdade — `web` (+ `infra` para P0)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-1** | Como operador, ao abrir `/painel` vejo linhas de coletor e marcadores de lacuna **lidos da API na renderização**, e nada que venha de fixture. | `page.tsx` vira Server Component `async`; `PainelClient.tsx` (`"use client"`) guarda estado de UI; `import "server-only"` em `ingest-health-query.ts`; portão `D5.17b` reescrito para morder só em `"use client"`; `fixtures.ts` **fora** de `src/app` e `src/features` de produção | `CA-F1-1..7` |
| **US-2** | Como operador, quando a API não responde, não está configurada ou devolve vazio, **vejo isso escrito** — e nunca uma tabela cheia de dado antigo ou inventado. | `loading.tsx`, `error.tsx` (distinguindo *"sem endereço"* de *"recusou conexão"* de *"respondeu ≠ 2xx"*), ramo vazio em `S1Console`/`S3Inspector`, estado "sem fonte" para os recursos de §4.3. Microcopy pt-BR pelo `design_gate` | `CA-F1-8..11` |
| **US-3** | Como desenvolvedor, subo API e front com **dois comandos versionados** e o front encontra a API sem eu adivinhar variável. | `.env.example` (`APP_PORT`, `INGEST_HEALTH_API_BASE_URL`), `make api`, README de 10 linhas | `CA-F1-12` |
| **US-4** | Como quem aprova esta fase, tenho uma suíte Playwright que **reprova com a API no chão** e passa com ela de pé — e o inverso para o estado de erro. | `frontend/e2e/` reescrito onde o critério herdado está errado (§1.4); resultado por spec em `facts.jsonl` | `CA-F1-13`; portão: `[Q4]` |

### F2 · A API é alcançável e honesta — `infra` (+ `quant-architect` para o valor do `ETag`)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-5** | Como operador, sei se a API está **pronta** e sobre **qual store**, e a API **se recusa a subir** sobre um caminho que não existe. | `create_app` falha se `Path(store_path).parent` não existe; `GET /ready` → `{store:{path, exists, schema_present}}` `200`/`503`; `/ingest-health` **continua `200` vazio** para arquivo ausente/0 byte (contrato `D6.1` intocado) | `CA-F2-1..3` |
| **US-6** | Como consumidor da API, recebo `ETag` = `fingerprint` e posso pedir `If-None-Match` → `304`. | header no handler (`infra`); valor `IngestHealthReport.fingerprint()` (`quant-architect`); Server Component envia `If-None-Match`; até lá `cache: "no-store"` explícito | `CA-F2-4..5` |
| **US-7** | Como owner, tenho em `deploy/` a topologia de produção **estruturada e não implantada**: API, Next e **Caddy próprio** servindo um subdomínio de DNS que já tenho, mesma origem por caminho. | `deploy/compose.yml` ganha serviços `api` (mesma imagem Python de `ADR-027`, porta só em rede interna), `web` (Next), `caddy` (`caddy:2-alpine`, `Caddyfile` versionado, `${PUBLIC_HOST}` por env); `/api/*` → `api`, resto → `web`; **sem TLS auto-gerenciado até implantar** `[NÃO SEI: se o DNS existente já tem certificado wildcard — dono owner]`; toda credencial por `${VAR}` (`own.compose-hardcoded-secret`) | `CA-F2-6..8`; non-goal `NG-1` |
| **US-8** | Como owner, o segmento de URL da API é **uma constante em um lugar**, para que mudar `[Q2]` custe uma linha. | `API_PREFIX` (default proposto `/api/v1`) em `src.main` **e** no `Caddyfile` via env | `CA-F2-9` |

### F3 · Os recursos baratos entram pelo caminho decidido — `sentimento` + `infra` + `web`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-9** | Como operador, vejo no S3 o **catálogo real de séries** (as 7 entradas que hoje só existem em código). | use case `list_series_catalog()` concatenando as 7 constantes (`quant-architect`); rota `GET {prefix}/series-catalog` (`infra`); `parseCatalogEnvelope` compondo `assertValidCatalogEntry` + `QuarantineTerms` + `Completeness: unmeasured` (`web`) | `CA-F3-1` |
| **US-10** | Como operador, vejo no S1 **status agregado por série** (status, uptime, resiliência) vindo do backend, não do último run. | use case de agregação sobre `IngestRecordSource`; **envelope separado** com parser próprio; forma do agregado é `[NÃO SEI]`, dono `quant-architect` — `TBD` com data em §9 | `CA-F3-2` |
| **US-11** | Como operador, vejo os **termos de quarentena reais** por série. | `list_all()` na porta de quarentena (`sentimento/infra`); `QUARANTINE_STORE_PATH` em `src.main`; rota `GET {prefix}/series-quarantine` **sem `points_json`** por padrão | `CA-F3-4` |
| **US-12** | Como operador, leio numerais com **uma** convenção na tela inteira e cabeçalhos humanos (`Janela de perda`, não `JANELA_DE_PERDA`). | formatador único (`Intl.NumberFormat('pt-BR')` só na camada de apresentação; dado no fio continua ponto decimal — `SPEC-001 §3.8`); rótulo de UI ≠ nome de coluna de contrato (linha 11 intocada) | `CA-F3-3` |

**Higiene de produção (transversal, F1):** `Filter.tsx` de bancada sai da rota; `metadata.title`; `h1`; `/` → `/painel` (redirect); `not-found.tsx` pt-BR — `CA-F1-14`. Forma: `design_gate`.

---

## 6. Unidades de valor candidatas (para o tracker, DEPOIS da validação do arquiteto)

| UV | título | fases | componente | Epic pai |
|---|---|---|---|---|
| UV-1 | `/painel` lê a API por Server Component e mostra estados de sistema | F1 | `web`, `infra` | `CST-5` `[INFERRED: mesmo Epic de plataforma-dados, por ser filha; alternativa é Epic próprio — decisão do /tech-lead]` |
| UV-2 | API alcançável, pronta e estruturada para produção (readiness, ETag, compose + Caddy) | F2 | `infra` | idem |
| UV-3 | Catálogo, agregado por série e quarentena servidos pela API | F3 | `sentimento`, `infra`, `web` | idem |

**Nada disto foi criado.** `local_only` — motivo no cabeçalho.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | story |
|---|---|---|
| RF-1 | `/painel` é renderizado por um **Server Component** que chama `fetchIngestHealthProjectionViaHttp()` **uma vez por render** e entrega view-models serializáveis a um Client Component | US-1 |
| RF-2 | **Nenhum** `import` de valor de `fixtures.ts` em `frontend/src/app/**` nem em `frontend/src/features/**/*.tsx` de produção | US-1 |
| RF-3 | O mesmo `fetch` alimenta S1 (`CollectorRow` mínimo) **e** S3 (`GapMarkerRow`) | US-1 |
| RF-4 | Estados: `loading.tsx`; `error.tsx` com **três** textos distintos (sem endereço · conexão recusada · resposta ≠ 2xx); ramo vazio em S1 e S3 (`n_runs = 0`); estado "sem fonte" nos blocos de §4.3 | US-2 |
| RF-5 | `.env.example` versionado; alvo `make api`; documentação de 10 linhas | US-3 |
| RF-6 | `deploy/compose.yml` declara `api`, `web`, `caddy`; `deploy/Caddyfile` roteia `${API_PREFIX}/*` → `api`, resto → `web`; `PUBLIC_HOST` por env; **nenhum comando de implantação é executado** | US-7 |
| RF-7 | `create_app` **recusa subir** quando `Path(store_path).parent` não existe; `GET /ready` discrimina `exists`/`schema_present` | US-5 |
| RF-8 | `GET /ingest-health` emite `ETag` = `fingerprint`; responde `304` a `If-None-Match` igual | US-6 |
| RF-9 | `GET {prefix}/series-catalog` e `GET {prefix}/series-quarantine` (sem `points_json` por padrão) e envelope agregado por série | US-9/10/11 |
| RF-10 | Controle interativo em produção **ou faz o que promete ou não existe** (filtro do catálogo filtra; `abrir` — decisão M3) | US-2 |
| RF-11 | Numeral em pt-BR **só** na camada de apresentação, por um formatador único; nenhum `toLocaleString` espalhado; dado no fio com ponto decimal | US-12 |
| RF-12 | CSS do design aprovado **chega ao browser**: ≥ 1 stylesheet da app aplicada; glifos em fonte de ícone, não em `Times New Roman` | US-1 (`CA-F1-15`) |

### 7.2 Não-funcionais

| id | requisito | rótulo / medição |
|---|---|---|
| RNF-1 | **Frescor:** cada render de `/painel` é um `fetch` **sem cache** (`cache: "no-store"` explícito) até o `ETag` existir; depois, `If-None-Match` + `304` | `[INFERRED: default do Next ≥ 15 já é no-store; declarar evita depender do default — FB-frontend-architect §5]` |
| RNF-2 | **Volumetria:** `/ingest-health` devolve **todos** os runs do store, sem paginação — **`[NÃO SEI]` quantos runs existem em produção** (0 store local para medir). Teto ou paginação é `[Q5]` | `[NÃO MEDIDO]` |
| RNF-3 | **Pegada:** tudo até F3 = **0 byte novo em disco, 0 processo novo** exceto o container Caddy (~10–15 MB RSS `[INFERRED: caddy:2-alpine idle — FB-infra §3]`), aceito pelo owner em D-f; API já contabilizada em `ADR-027:62` (40,8 MB RSS `[DOC]`) | |
| RNF-4 | **Latência de render:** `[NÃO MEDIDO]` — `[Q6]` propõe orçamento; sem número do owner, o aceite é "render completo em ≤ 3 s com store de teste" `[INFERRED: teto arbitrário para o e2e não pendurar; substituível]` | |
| RNF-5 | **Bind:** API em `127.0.0.1` no processo (`__main__.py:27`); em compose, porta **só na rede interna**, nunca `ports:` publicada | `[DOC]` |
| RNF-6 | **Acesso público:** quando o subdomínio for implantado, o painel fica **exposto sem autenticação** (`5.11` saiu de escopo: *"vps n é problema agora, vai rodar muito local até lá"* `[PREMISSA-OWNER: 2026-08-25]`, citada em `05_fatia_visivel.md:223`). **Não implantado nesta feature ⇒ não bloqueante; mas é risco não visto** — `[Q3]`, menu M4 | `[NÃO SEI]` |

---

## 8. Regras de negócio

| id | regra | falsificador |
|---|---|---|
| **RN-1** | A decisão "Server Component + `server-only`" e a reescrita do portão `D5.17b` **nascem em ADR**, co-assinada pelo `quant-architect` (dono da propriedade `D6.4`) — o instrumento muda, a propriedade não | ADR sem a co-assinatura ⇒ `/architect` reprova o handoff |
| **RN-2** | O Next **não** define schema, **não** faz SQL, **não** re-emite JSON: `route.ts` continua **0** | `find frontend/src/app -name route.ts \| wc -l` ≠ 0 ⇒ reprova (é D-a) |
| **RN-3** | **Fixture nunca é ponte.** Recurso sem fonte mostra estado "sem fonte"; **nunca** dado inventado | `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' \| grep -v '\.test\.'` ≠ 0 ⇒ reprova (hoje **2** `[MEDIDO: FB-frontend §3 f.3]`) |
| **RN-4** | `janela_de_perda` e resiliência **não são recalculadas no front**; o fio carrega o valor (hoje `null`, `LOSS_WINDOW_NOT_COMPUTED_IN_F0`) e a tela o exibe como "não computada" | `grep -rn 'computeUniformWindowDays' frontend/src \| grep -v test \| grep -v domain.ts \| grep -v fixtures` ≥ 1 ⇒ reprova |
| **RN-5** | Controle que não faz nada é **removido ou ligado** antes de fechar F1 | e2e `04`: filtro com texto não-casante ⇒ 0 linhas; `abrir` conforme M3 |
| **RN-6** | Nenhum recurso desta feature cria armazenamento sem **teto declarado** (D-h) | `git diff --stat deploy/ backend/src` da fase mostrando volume/tabela nova sem teto no mesmo diff ⇒ reprova |
| **RN-7** | **Todo CA reprova com o servidor ausente** (ou, para CAs de estado de erro, com o servidor presente) — os dois estados **nunca** dão o mesmo veredito | §10, coluna "servidor ausente" |
| **RN-8** | Nome de coluna de contrato (`janela_de_perda`, `window`, `class`) **não muda**; rótulo de UI é superfície separada (linha 8 × linha 11 de `CLAUDE.md`) | `to_envelope()` diff em `runs[]` ⇒ `sha256` move ⇒ `F-D6-1/2` reprova |
| **RN-9** | Implantação (subir Caddy/API/Next na VPS, DNS, TLS) **não acontece** nesta feature | `docker compose -f deploy/compose.yml ps` na VPS mostrando `caddy` ⇒ escopo violado |

---

## 9. Tipos e contratos críticos

| contrato | estado | dono | prazo |
|---|---|---|---|
| Envelope `ingest_health_query` (15 col `run` / 8 col `gap`) | **fechado** — `ADR-005/D6.1`; `to_envelope()` `ingest_record.py:181-195`; `parseIngestHealthEnvelope` `:412` | `quant-architect` | — |
| `ETag` = `IngestHealthReport.fingerprint()` (hex sha256) | **decidido** `ADR-005/D6.3`; **não implementado** (0 no backend) | valor: `quant-architect` · header: `infra` | F2 |
| `GET /ready` → `{"store": {"path": str, "exists": bool, "schema_present": bool}}` | **proposto** por `FB-infra §2`; adotado aqui | `infra` | F2 |
| Envelope **agregado por série** (`CollectorRow` completo: `status`, `uptimePercent`, `resilience`, `retention` — 6 variantes de `RetentionWindow`, `domain.ts:59-79`) | **`TBD`** — o fio de 15 colunas não expressa `D7.12`/`D7.14`; envelope separado, não tocar as 15 | `quant-architect` | **antes de F3 começar** (data: no handoff do `/architect`) |
| Envelope de catálogo (`SeriesCatalogEntry` + `QuarantineTerms` + `Completeness`) | tipos TS existem (`series-catalog.ts:134,145`, `quarantine.ts:15`, `domain.ts:32,39`); envelope HTTP **`TBD`** | `quant-architect` forma · `frontend-architect` parser | F3 |
| `API_PREFIX` | **`TBD`**, dono **owner** (`[Q2]`); default proposto `/api/v1` | owner | F2 (estrutura tolera mudança em 1 linha) |
| Estados de UI (`loading` / `error` × 3 / vazio / sem fonte) — **contrato de estado**, forma pelo gate | **`TBD`** | `ui-designer` + `ux-ui-mastery` | F1 |

**Termos (na ausência de glossário):** *Server Component* — componente React renderizado no processo Next, nunca no browser; *fixture* — dado constante compilado no bundle para demonstração/teste; *store* — arquivo SQLite (dev) ou Postgres (prod) que `/ingest-health` lê; *same-origin por caminho* — um único host público em que o proxy roteia `/api/*` para a API e o resto para o Next, eliminando CORS; *estado "sem fonte"* — bloco da tela cujo dado ainda não tem rota na API e que diz isso.

---

## 10. Critérios de aceite — testáveis, com o comando e a coluna "servidor ausente"

Convenção: **API de pé** = `cd backend && INGEST_HEALTH_STORE_PATH=<store de teste com ≥ 1 run> .venv/bin/uvicorn src.main:app --port $PORT`; **API no chão** = processo morto, `curl → 000`. `NEXT` = `next dev`/`next start` com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:$PORT`. Toda linha da coluna **servidor ausente** é o que **tem de acontecer** com a API no chão — se acontecer o mesmo que com ela de pé, o CA **não mede nada**.

### F1

| id | critério | comando (cala) | **servidor ausente (morde)** |
|---|---|---|---|
| CA-F1-1 | **A página fala com a API pelo lado do servidor**: 1 `GET /ingest-health` no log de acesso do uvicorn **por `GET /painel`**; `<main>` contém linhas = nº de `(source,endpoint)` distintos do store de teste | `curl -s localhost:3000/painel >/dev/null; grep -c 'GET /ingest-health' <uvicorn.log>` → **incrementa em 1**; e2e reescrito: asserção sobre **conteúdo**, não sobre requisições do browser (§1.4) | `<main>` **sem `<tr>` de coletor**; `error.tsx` renderizado; o e2e **reprova** por ausência de linhas. **Se renderizar linha com API `000`, repetiu `:225`** |
| CA-F1-2 | Conteúdo varia com o estado da API | e2e `02` refeito: `main_text_bytes_api_up ≠ main_text_bytes_api_down`; `sha256` dos screenshots **diferentes** (hoje iguais `dc30fd31…`) | é a própria metade que morde |
| CA-F1-3 | `page.tsx` é Server Component; estado de UI vive em `PainelClient.tsx` | `grep -c '"use client"' frontend/src/app/painel/page.tsx` → **0**; `grep -c '"use client"' frontend/src/app/painel/PainelClient.tsx` → **1** | n/a (estrutural) — mas `CA-F1-1` cobre o comportamento |
| CA-F1-4 | `server-only` protege o módulo de transporte | `grep -c 'import "server-only"' frontend/src/features/s1-console/ingest-health-query.ts` → **1**; **morde:** arquivo `"use client"` plantado importando `fetchIngestHealthProjectionViaHttp` por valor ⇒ `next build` **reprova nomeando `server-only`**; **cala:** o mesmo import em `page.tsx` ⇒ `next build` verde | n/a (build-time) |
| CA-F1-5 | Portão ESLint reescrito: morde só em `"use client"` | probe efêmero **sem** `"use client"` em `src/app/` com import de valor ⇒ `npx eslint` **`0 problems`** (hoje `1 error` `[MEDIDO: FB-frontend §2.3]`); probe **com** `"use client"` ⇒ `1 error` | n/a |
| CA-F1-6 | Sem BFF | `find frontend/src/app -name route.ts \| wc -l` → **0** | n/a (D-a) |
| CA-F1-7 | Base URL nunca no bundle do browser | `grep -rn 'NEXT_PUBLIC_INGEST' frontend/src \| wc -l` → **0**; `grep -c INGEST_HEALTH_API_BASE_URL frontend/.next/static -r` → **0** após `next build` | n/a |
| CA-F1-8 | `error.tsx` distingue 3 causas | e2e: (a) `INGEST_HEALTH_API_BASE_URL` **unset** ⇒ texto "sem endereço"; (b) porta sem listener ⇒ "conexão recusada"; (c) stub que responde `500` ⇒ "respondeu 500". Três textos **distintos** (`fact error_kind`) | (b) **é** o servidor ausente; com API de pé, `error.tsx` **não** renderiza — se renderizar, reprova |
| CA-F1-9 | `loading.tsx` existe e é o fallback | `test -f frontend/src/app/painel/loading.tsx`; e2e com API respondendo após 2 s (stub com `sleep`) ⇒ `loading` visível antes das linhas | com API no chão o loading **dá lugar ao erro**, não a linhas |
| CA-F1-10 | Ramo vazio | API de pé sobre store **0 runs** ⇒ S1 e S3 exibem estado vazio (texto pt-BR do gate), **0 `<tr>` de dado**, **0 `error.tsx`** | API no chão ⇒ `error.tsx`, **não** o vazio — os dois estados têm `fact` distinto |
| CA-F1-11 | Estado "sem fonte" nos blocos de §4.3 | e2e: blocos `Orçamento`, `Reconexões`, `Fila de ETL` exibem marcador "sem fonte" e **0 número** vindo de fixture (`grep -c '1.6 GB\|99.8%' <main>` → 0) | idem com API no chão (o bloco não depende dela) — e **isto está declarado**: este CA não mede comunicação, mede ausência de fixture |
| CA-F1-12 | Dev sobe com comandos versionados | `test -f .env.example && grep -c 'INGEST_HEALTH_API_BASE_URL\|APP_PORT' .env.example` → **2**; `make -n api` imprime o comando `uvicorn src.main:app` | `make api` com `INGEST_HEALTH_STORE_PATH` apontando para diretório inexistente ⇒ **não sobe** (é `CA-F2-1`, antecipável) |
| CA-F1-13 | Suíte e2e reescrita para a arquitetura escolhida | `npm --prefix frontend run test:e2e` com API de pé ⇒ **todos os specs de F1 ✓**; asserção de `02:9` reescrita para *"o servidor Next fez a chamada"* (log da API) | a mesma suíte com API no chão ⇒ **`CA-F1-1/2/10` ✘ e `CA-F1-8(b)` ✓** — veredito **diferente** do "de pé" |
| CA-F1-14 | Higiene de produção | `grep -rn 'features/panel/Filter' frontend/src/app \| wc -l` → **0**; e2e `01`: `document.title ≠ ""`, `h1_count = 1`; e2e `03`: `GET /` → **3xx para `/painel`**; `/nao-existe` ⇒ `not-found.tsx` com `lang=pt-BR` e link para `/painel` | n/a |
| CA-F1-15 | CSS chega ao browser | e2e `01`: `stylesheets_applied ≥ 1` da app (não `__nextjs-Geist`); `glyph_font_families` **não contém** `Times New Roman`; `find frontend -name '*.css' -not -path '*/node_modules/*' -not -path '*/.next/*' \| wc -l` ≥ 1 (hoje **0**) | n/a — **causa raiz `[NÃO SEI]`** (`FB-ux-gate` Rec. 3), diagnóstico é do `frontend-architect` |
| CA-F1-16 | Filtro do catálogo filtra | e2e `04`: `catalog_rows_after_nonmatching_filter = 0`; com texto casante ⇒ `≤ before` e `≥ 1` | com API no chão não há catálogo ⇒ o teste **não roda** (pré-condição `CA-F1-1`) |

### F2

| id | critério | comando (cala) | **servidor ausente (morde)** |
|---|---|---|---|
| CA-F2-1 | Misconfig não vira dado | `INGEST_HEALTH_STORE_PATH=<x>/nao-existe/ih.sqlite3 python -m src.main` ⇒ **`rc ≠ 0`** com mensagem nomeando o caminho (hoje sobe e devolve `200 {"n_runs":0}` `[MEDIDO: FB-infra §2]`) | é a própria metade que morde |
| CA-F2-2 | `/ready` discrimina | arquivo ausente ⇒ `503 {"store":{"exists":false,…}}`; 0 byte ⇒ `503 {…"schema_present":false}`; store válido ⇒ `200 {…true,true}` | API no chão ⇒ `curl → 000`; teste de `/ready` **reprova por conexão recusada** |
| CA-F2-3 | Contrato `D6.1` intocado | `/ingest-health` sobre arquivo ausente/0 byte **continua `200 {"n_runs":0}`**; `node --test ingest-health-query-http.test.ts` → **8/8** ainda | `D5.14(i)` já reprova com servidor ausente (`…-http.test.ts:495`) |
| CA-F2-4 | `ETag` emitida = fingerprint | `curl -D - -o /dev/null $API/ingest-health \| grep -i etag` → **1 linha**; valor **igual** a `IngestHealthReport.fingerprint()` sobre o mesmo store (teste Python) **e** ao `fingerprint()` do TS sobre o corpo (teste TS) | `curl → 000`; teste reprova por conexão |
| CA-F2-5 | `304` funciona | `curl -H "If-None-Match: <etag>" -o /dev/null -w '%{http_code}'` → **304**; com `ETag` errado → **200** | idem |
| CA-F2-6 | Compose estruturado, **não implantado** | `grep -cE '^  (api|web|caddy):' deploy/compose.yml` → **3**; `docker compose -f deploy/compose.yml config -q` → `rc=0`; `harness rules --mode file --path deploy/compose.yml` → **vazio, `rc=0`** (`own.compose-hardcoded-secret` cala) | **morde:** compose com `POSTGRES_PASSWORD: literal` plantado ⇒ `harness rules` ≠ 0 (é `D1.14`, já existe) |
| CA-F2-7 | Caddy roteia same-origin por caminho | `caddy validate --config deploy/Caddyfile` → `rc=0`; `grep -c 'reverse_proxy' deploy/Caddyfile` → **2** (`${API_PREFIX}/*` → `api:${APP_PORT}`, `*` → `web:3000`); `grep -c 'PUBLIC_HOST' deploy/Caddyfile` ≥ 1 | **NÃO há "servidor de pé" para este CA por desenho** (`RN-9`) — ele mede estrutura, e diz isso |
| CA-F2-8 | Porta da API não publicada | `grep -A12 '^  api:' deploy/compose.yml \| grep -c 'ports:'` → **0** | n/a |
| CA-F2-9 | Prefixo é constante única | `grep -rn 'API_PREFIX' backend/src/main deploy/ \| wc -l` ≥ 2; mudar o default ⇒ `openapi.json` paths **e** `Caddyfile` mudam juntos (teste) | n/a |

### F3

| id | critério | comando (cala) | **servidor ausente (morde)** |
|---|---|---|---|
| CA-F3-1 | Catálogo servido = 7 constantes | `curl $API$PREFIX/series-catalog \| python3 -c 'import json,sys;print(len(json.load(sys.stdin)["entries"]))'` → **7** (`= grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' \| grep -v test \| wc -l`); S3 exibe **7** linhas; handler com `0` linha de SQL (`D5.13c`) | `curl → 000`; S3 exibe erro/sem fonte, **0** linhas |
| CA-F3-2 | Agregado por série em envelope **separado** | `sha256` do envelope de `/ingest-health` **não muda** com a rota nova (`F-D6-2`); parser novo valida campo a campo e **reprova** campo ausente (`ADR-019/D2`) | conexão recusada ⇒ S1 mostra erro, não o último `CollectorRow` em cache |
| CA-F3-3 | Locale único na tela | e2e `07`: `comma_decimal_hits` **ou** `dot_decimal_hits` = 0 (não os dois > 0 — hoje 2 e 13); no **fio**: `curl … \| grep -c ','` em campo numérico → **0** (`SPEC-001 §3.8`) | n/a (formatação) — mas só mede com dado real (`CA-F1-1`) |
| CA-F3-4 | Quarentena listada sem `points_json` | `curl $API$PREFIX/series-quarantine \| python3 -c '…assert "points_json" not in rows[0]'`; `QUARANTINE_STORE_PATH` ausente ⇒ `create_app` **recusa subir** (mesma regra de `CA-F2-1`) | `curl → 000`; gaveta exibe erro, **não** `FIXTURE_DIVERGENCES` |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | **Implantar** Caddy/API/Next na VPS; DNS; TLS; `docker compose up` em produção | `[PREMISSA-OWNER: 2026-09-04]` *"n vamos subir agora mas precisa estar estruturado"* |
| **NG-2** | Qualquer coisa do lado **escrita** (coletores, fila, escritor único, novos coletores) | `ADR-027` já decidiu; esta feature é o espelho de **leitura** |
| **NG-3** | Recursos `2` (`StorageBudgetLine`), `3` (`ReconnectionEvent`), `4c` (`Completeness`), `6` (`RawDataRow`) | cada um exige decisão de `quant-architect`/`ADR-005`/`ADR-002` não tomada; três ocupam disco/conexão longa (D-h). **Sujeito a M1** |
| **NG-4** | SSE / borda direita / `AO VIVO` | só necessário para `6`; envelope de `ADR-005/D2` é de bucket, não de evento |
| **NG-5** | **Redesign visual** além de fazer o design já aprovado chegar ao browser | `CLAUDE.md` §Design: decisão de design é do `ui-designer` com gate — este PRD só exige que o que foi aprovado **exista em runtime** |
| **NG-6** | Autenticação/sessão (`5.11`) | fora de escopo por `[PREMISSA-OWNER: 2026-08-25]`; **risco registrado** em `RNF-6`/`[Q3]` porque o subdomínio muda a premissa "roda local" |
| **NG-7** | CORS (`CORSMiddleware`) | desnecessário sob same-origin + leitura server-side; `allow_origins=["*"]` recusado (`FB-infra §3`) |
| **NG-8** | Renomear `/painel`, `janela_de_perda`, eventos de log em português | linha 12 é `[Q1]` do owner; linha 11 é `ADR-008/D3`; linha 10 é `SPEC-002 §6.3` |
| **NG-9** | Crescer as 15 colunas do envelope de `ingest_health` | move o `sha256` de todo relatório emitido — ato de `ADR-008/D3` |
| **NG-10** | Colocar Playwright/`node --test` em `make verify` | **ato do owner** (`[Q4]`); este PRD só exige que a suíte **exista e discrimine** |

---

## 12. `[INFERRED]` — sete, com motivo e custo de reversão

| # | inferência | motivo | custo se errada |
|---|---|---|---|
| I-1 | *"ali"* na fala do owner sobre Caddy = `deploy/` deste projeto (Caddy **próprio**) | é a resposta ao menu "vizinho × próprio" de `FB-infra §3`; "vai ter o caddy ali sim" segue "subdomain do dns que já tenho" | se for o Caddy do vizinho: `deploy/compose.yml` perde 1 serviço e o `Caddyfile` vira **trecho** para o outro repositório — ~1 arquivo |
| I-2 | Corte de escopo: F1–F3 dentro, `2`/`3`/`4c`/`6` fora | §4.2 (i)–(iii) | M1 — segunda feature filha, zero retrabalho |
| I-3 | Default do Next ≥ 15 é `no-store`; declarar explicitamente | `FB-frontend §5` | 1 linha |
| I-4 | `caddy:2-alpine` idle ≈ 10–15 MB RSS | herdado de `FB-infra §3` como `[INFERRED]` | se maior, é decisão do owner (já aceitou +1 container) |
| I-5 | Epic pai das UVs = `CST-5` | filha de `plataforma-dados` | `/tech-lead` decide; 0 custo agora (`local_only`) |
| I-6 | `≤ 3 s` de render como teto do e2e | sem número do owner; evita o e2e pendurar | `[Q6]`; 1 constante |
| I-7 | O e2e `02:9` reprovaria a implementação correta (§1.4) | leitura de `isApiLike` + decisão (A); **não executado** contra implementação inexistente | se errada, o spec fica como está e `CA-F1-1` mantém a medição pelo log da API — o critério não depende da inferência |

---

## 13. GAPs nomeados por esta rodada

| gap | severidade | dono | ação |
|---|---|---|---|
| `[GAP G1]` `CLAUDE.md` lista **6** componentes; `harness policy --key components` devolve **7** (`infra` adotado em `harness.toml:39-46`) | baixa (documental), custo de esquecer médio — a regra "vocabulário fechado" tem duas verdades | **owner** (`CLAUDE.md` é dele) | linha em `docs/INDEX.md`; não editado aqui |
| `[GAP G2]` causa raiz de **0 CSS** não medida (`layout.tsx` sem import? Tailwind/PostCSS nunca configurados? `0 *.css` na árvore) | alta para F1 — `CA-F1-15` não fecha sem diagnóstico | `frontend-architect` | no handoff |
| `[GAP G3]` volumetria de `/ingest-health` em produção desconhecida; rota sem paginação | média | `quant-architect` + owner (`[Q5]`) | `RNF-2` |
| `[GAP G4]` cliente TS e suíte e2e **fora de portão** (37 + 16 testes, 0 em `make verify`) | média — verde que ninguém roda é `D1.7c` | **owner** (`[Q4]`) | `NG-10` |
| `[GAP G5]` glossário continua vazio (1 byte, `rc=0`) — dívida `ADR-013/D4` | baixa | `/pm` (dono nomeado por `ADR-013/D4`) — **não paga aqui**, §9 define termos localmente | — |
| `[GAP G6]` `T-05.11` marcou Playwright como *"quando entrar"* e não o instalou; a suíte nasceu **na revisão**, fora de task | baixa | `/tech-lead` | task de F1 absorve `frontend/e2e/` |

---

## 14. Menu para o owner — escolhas com o custo de cada opção

Nenhum item bloqueia `PRD_DRAFT` nem a leitura do `/architect`. **M1 bloqueia a SPEC** (define o universo); os demais podem esperar até a fase em que caem.

| # | pergunta | opção | custo | proposta `[INFERRED]` |
|---|---|---|---|---|
| **M1** | **Escopo**: quais recursos entram? | **(a)** F1–F3 (recursos `5`, `1`, `4a`, `4b`) — esta redação | 3 fases; tela com 3 blocos "sem fonte" até a próxima feature | **(a)** |
| | | (b) os seis | +4 decisões de arquitetura pendentes (`ADR-005` 3ª família, `ADR-002` schema, teto de log, `Completeness`); disco novo; SSE; prazo indefinível hoje | |
| | | (c) só F1 (fiação + estados + dev topology) | fecha o defeito visível; deixa API sem `/ready`/`ETag` e sem `deploy/` — o `infra-architect` disse que isto é P0/P1 | |
| **M2** | **Prefixo de URL da API** (`[Q2]`, P3) | (a) `/api/v1` | versiona desde o dia 1; 1 rota hoje | **(a)** |
| | | (b) `/api` | mais curto; versionar depois quebra URL | |
| | | (c) nenhum (raiz) | **inviabiliza** same-origin por caminho ⇒ obriga CORS ou dois hosts | |
| **M3** | **Botão `abrir` (Camada 2) sem `RawDataRow`** | (a) remover o botão até `6` existir | tela honesta; S3 perde a *promessa* da Camada 2 | **(a)** `[INFERRED: H3 — controle que promete e não faz é pior que ausente, FB-ux-gate Rec. 4]` |
| | | (b) abrir a camada com estado "sem fonte" | mantém a arquitetura da tela; mostra um bloco vazio | |
| **M4** | **Exposição pública quando implantar** (`RNF-6`) — decidir agora, implementar depois | (a) `basic_auth` no Caddy (1 bloco, credencial por env) | 0 código de app; suficiente para "valido sozinho" | **(a)** |
| | | (b) restringir por IP no Caddy | frágil com IP dinâmico | |
| | | (c) nada até `5.11` | subdomínio público com painel operacional aberto | |
| **M5** | **Playwright + `node --test` em `make verify`** (`[Q4]`) | (a) sim, `test:e2e` com API de teste subida pelo próprio alvo | +~35 s por `verify` `[MEDIDO: e2e 30,9 s hoje]`; verde passa a significar algo | **(a)** |
| | | (b) só `node --test` (4 s) | e2e continua manual | |
| | | (c) não | 53 testes continuam fora de portão | |

---

## 15. Perguntas em Aberto — classificadas, com quem decide

| id | pergunta | bloqueia? | decide |
|---|---|---|---|
| **[Q1]** | Segmento `/painel` fica em português? (linha 12) | não | **owner** — herdada de `PRD-002 [Q2]`, **1 rota hoje**, custo monotonicamente crescente |
| **[Q2]** | Prefixo/versão da URL da API | **F2** (estrutura tolera, mas o `Caddyfile` precisa de um valor) | **owner** (M2) |
| **[Q3]** | Autenticação mínima quando o subdomínio subir | não (não implantado) | **owner** (M4) |
| **[Q4]** | Suíte de front entra em `make verify`? | não | **owner** (M5) |
| **[Q5]** | Teto/paginação de `/ingest-health`; quantos runs em produção? | não para F1; sim para dimensionar `RNF-2` | `quant-architect` (forma) + owner (teto) |
| **[Q6]** | Orçamento de latência de render | não | owner; default `I-6` |
| **[Q7]** | Forma do envelope **agregado por série** (US-10) | **F3** | `quant-architect` — `TBD` com data no handoff |
| **[Q8]** | Onde mora o store de quarentena em prod (SQLite × Postgres) | **F3-US-11** | `ADR-002` |
| **[Q9]** | O operador vê o `fingerprint` na tela? (`ADR-005/D6.4 [NÃO SEI]`) | não | **owner** — empurrada pelo `frontend-architect` §8, mantida aberta |
| **[Q10]** | O DNS existente já tem certificado (wildcard) para o subdomínio? | não (`NG-1`) | **owner** — define se o `Caddyfile` usa `tls internal`, ACME ou certificado fornecido |

---

## 16. Registro da varredura de discovery

| dimensão | estado | fonte / gap |
|---|---|---|
| stakeholders e consumidores | `[COBERTO]` operador único (owner); consumidores da API: Server Component do Next; **futuro** público do subdomínio | `RNF-6`, `[Q3]` |
| volumetria e escala | `[GAP]` runs em produção desconhecidos; 0 store local | `[Q5]`, `RNF-2` |
| requisitos não-funcionais | `[COBERTO]` frescor (`no-store` → `ETag`/`304`); pegada (0 disco, +1 container aceito); `[GAP]` latência | `RNF-1..5`, `[Q6]` |
| estados e casos de borda | `[COBERTO]` loading · erro × 3 · vazio · sem fonte · misconfig (`create_app` recusa) · 0 byte · corrompido (`500` já) · duplicado/fora de ordem **não se aplicam** (leitura idempotente, sem escrita) | `RF-4`, `RF-7`, `CA-F1-8..11`, `CA-F2-1..3` |
| contrato e dependências | `[COBERTO]` envelope `D6.1` fechado; `ETag` decidido/não implementado; `[GAP]` agregado por série, catálogo, quarentena — `TBD` com dono | §9, `[Q7]`, `[Q8]` |
| métricas e observabilidade | `[COBERTO]` `/ready`; log de acesso da API como instrumento de `CA-F1-1`; `facts.jsonl` do e2e; `[GAP]` métricas de uso da tela — **fora** (não há usuário além do owner) | `CA-F2-2`, `CA-F1-13` |
| escopo e non-goals | `[COBERTO]` §4, §11; corte sujeito a M1 | |

**O que foi perguntado ao owner nesta sessão: nada** — indisponível por declaração do despacho. Tudo o que precisava dele está em §14/§15.

---

## 17. Gate de handoff — a checklist, conferida

- [x] cada story tem fronteira clara e cabe numa fase — 12 stories em 3 fases (§5)
- [x] as regras bloqueantes em vigor são **endereçáveis** — `harness rules list --severity block` → **8** regras `[MEDIDO 2026-09-04]`: `core.relative-import`, `core.silent-except`, `core.print-statement` (código Python novo em `src/api`/`src/main`/use cases); `core.hardcoded-secret` e `own.compose-hardcoded-secret` (`deploy/compose.yml`, `Caddyfile` por `${VAR}` — `CA-F2-6`); `web-fullstack.browser-imports-server` (**é exatamente a propriedade de `CA-F1-4`** — `server-only` a reforça); `web-fullstack.tenant-from-request` (n/a, sem tenant); `web-fullstack.server-test-directory-present` (`backend/tests/` existe, 114 arquivos `[DOC: 05_fatia_visivel.md:83]`)
- [x] tipos e contratos críticos definidos, ou `TBD` com dono e data — §9 (3 `TBD`, donos nomeados; data do agregado fixada pelo `/architect` no handoff)
- [x] non-goals escritos — §11, 10 itens

**Gaps classificados:** bloqueante → **nenhum** (o owner indisponível não bloqueia `PRD_DRAFT`; M1 bloqueia a SPEC, não o PRD); não-bloqueante → `[Q1]`–`[Q10]`; inferível → `I-1`–`I-7`.

**Ledger:** `harness pipeline advance camada-de-leitura-do-painel PRD_DRAFT` — executado após gravar este arquivo; resultado registrado em `docs/INDEX.md`.

**Próximo passo:** `/architect` sobre [`handoff_to_architect.md`](../context/camada-de-leitura-do-painel/handoff_to_architect.md) — validar este PRD (Gap Analysis), formalizar a ADR de `RN-1` (co-assinatura `quant-architect`), fixar a data do `TBD` de `[Q7]`, e produzir SPEC + plano em 3 fases.
