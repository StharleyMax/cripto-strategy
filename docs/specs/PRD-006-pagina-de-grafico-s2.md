# PRD-006 — Página de gráfico S2: rota que monta o motor `charts`, as duas rotas de backend que `ADR-005/D1` exige, e a migração de `/painel` para inglês

**Feature:** `pagina-de-grafico-s2` (**filha** de `plataforma-dados`, irmã de `captura-em-producao` e `coinalyze-fora-da-quarentena` — `harness pipeline show pagina-de-grafico-s2` → `init`, `relate parent plataforma-dados`, `dispatch pm`) · **Data:** 2026-09-08 · **Estado do pipeline ao escrever:** `INIT` (`harness pipeline state pagina-de-grafico-s2` → `INIT`) → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `web` (rota Next nova, montagem da página, migração de `/painel`) · `charts` (nenhum código novo de geometria — a S2 já existe testada; consumo do `history-transport`/`live-transport` existentes) · `sentimento` (as duas rotas de backend, leitura do registro de série já gravado por `captura-em-producao`) · `docs`. `backtest`/`convergencia` **não são tocados**. `harness policy --key components` → **7 elementos** `["sentimento","charts","convergencia","backtest","web","docs","infra"]` `[MEDIDO 2026-09-08]` — divergência já registrada pelas irmãs (`PRD-004`/`PRD-005`): `CLAUDE.md` ainda lista 6, este PRD não reabre a reconciliação.
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` → saída vazia, `rc=0`; `docs.external_prd_paths` → `[]` ⇒ este PRD **nasce aqui**.
**Insumos lidos (integralmente ou na faixa citada):** [`docs/context/pagina-de-grafico-s2/handoff_to_pm.md`](../context/pagina-de-grafico-s2/handoff_to_pm.md) (42 linhas, íntegro) · [`docs/context/plataforma-dados/handoff/pagina-de-grafico-q12-2026-09-07.md`](../context/plataforma-dados/handoff/pagina-de-grafico-q12-2026-09-07.md) (60 linhas, íntegro — handoff original medido, PR #170) · `docs/adr/ADR-005-...md` (D1, D5, D6 — transporte de leitura) · `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md:12` (item 5.1) e `08_superficie_e_reprodutibilidade.md:17` (item 8.6) · `docs/context/plataforma-dados/tasks.toml` (`T-05.2`/`CST-36`, `T-08.9`/`CST-77`, cabeçalhos de fase `05`/`08`) · `frontend/src/app/routes.ts` (17 linhas, íntegro) · `frontend/src/app/painel/*.tsx` · `frontend/src/app/{history,live}-transport.ts` · `frontend/e2e/01-painel-carrega.spec.ts` (existência) · `docs/product/STITCH_CONTEXT.md:1-6` (design S2 aprovado) · `CLAUDE.md` §"Idioma de identificador" linha 12 (RESPONDIDA 2026-09-08) · `PRD-004-captura-em-producao.md` e `PRD-005-coinalyze-fora-da-quarentena.md` (383 e 376 linhas, íntegros — padrão de formato reusado). **Não lido:** conteúdo completo dos 32 módulos `s2-*` de `frontend/src/charts/` (fora do escopo de julgamento do PM; são geometria já testada, não requisito novo).
**Rev de ancoragem de TODA medição deste documento:** **`master@025d1da`** (`git rev-parse --short HEAD`).
**Tracker:** `harness policy --key tracker` → `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}`. **Nada criado nesta sessão** — unidade de valor é ato posterior à validação do arquiteto; candidatas em §6.
**Ledger:** `INIT` antes. Ato deste documento: `harness pipeline advance pagina-de-grafico-s2 PRD_DRAFT` depois de gravado (§17).
**Glossário:** `harness policy --key glossary_doc` → saída vazia, `rc=0` (1 byte, só newline); `grep -n glossary harness.toml` → `rc=1`, nenhuma linha ⇒ dívida `ADR-013/D4` continua, não é desta feature. Termos usados definidos em §9.

---

## 0. Como ler este documento

1. **Duas decisões do owner já estão tomadas e este PRD não as reabre** (`handoff_to_pm.md`): (1) **caminho A** — terceira filha de `plataforma-dados`, `depends_on` `captura-em-producao` fase `02`/F2 (já `done`, 8/8 tasks, §1.2 l.13); (2) **rotas nascem em inglês, com migração retroativa de `/painel`** — fecha a linha 12 da tabela de fronteira de idioma em `CLAUDE.md` (era `[NÃO SEI]`/`[Q2]`).
2. **O nome exato do novo segmento de rota NÃO é decisão deste PRD** — é do `/architect`/`frontend-architect`, que decide entre alternativas (`symbol`, `chart`, `s2`, etc.) com o custo de cada uma. Este documento nomeia o requisito (rota em inglês) e o gap (nome ainda aberto), não a palavra.
3. **A geometria da S2 já existe e já está testada** — 32 módulos `s2-*` em `frontend/src/charts/`, motor headless rodando sem DOM. O que falta são **as duas pontas**: a rota Next que monta essa geometria com dado real, e as rotas de backend que a alimentam. Isto **não é feature de UI do zero** — é fiação, no mesmo sentido em que `PRD-004` foi fiação de captura, não lógica nova de coleta.
4. **A dependência de dado real já está satisfeita.** O handoff original condicionava a S2 a `captura-em-producao` gravar séries reais; `captura-em-producao` está com as 3 fases (`01`/`02`/`03`) `done` no ledger de tasks, aguardando só `advance DONE` do owner (`harness pipeline state captura-em-producao` → `BUILD_AUTHORIZED`). Este PRD não bloqueia nisso, mas o falsificador de ponta a ponta (§10, `CA-E2E-1`) só morde de verdade depois do `DONE`.
5. **O owner não estava disponível para o discovery interrogativo desta rodada.** Nada foi levado a ele nesta sessão além do que já está citado do handoff; o que falta decidir está em §14 (menu, com custo) e §15 (perguntas, com dono).

---

## 1. Contexto e problema

### 1.1 O que está medido — o estado hoje, em `025d1da`

| # | fato | comando | resultado | rótulo |
|---|---|---|---|---|
| 1 | rotas Next existentes | `find frontend/src/app -name page.tsx \| wc -l` | **1** — só `/painel` (S1 + S3) | `[MEDIDO 2026-09-08]` |
| 2 | módulos `charts` com prefixo `s2-` | `ls frontend/src/charts \| grep -c '^s2-'` | **32** | `[MEDIDO 2026-09-08]` |
| 3 | página que importe `history-transport`/`live-transport` para desenhar | `grep -rln` sobre `frontend/src/app` fora de teste | **0** — só testes e as queries de S1/S3 (reuso de tipo) | `[MEDIDO 2026-09-08]` |
| 4 | rotas HTTP do backend hoje | `grep -rhoE '@router\.get\("[^"]+"' backend/src/api/routes` | `/series-catalog`, `/series-quarantine`, `/ready`, `/collector-status`, `/ingest-health` — **5** | `[MEDIDO 2026-09-08]` |
| 5 | rota de histórico/ao vivo de série (`ADR-005/D1`) no backend | `grep -rlE '"/history\|"/live\|text/event-stream' backend/src/api` | **0 arquivos** — **não existe** | `[MEDIDO 2026-09-08]` |
| 6 | design da S2 | `docs/product/STITCH_CONTEXT.md:5` | **APROVADA**: `S2 Símbolo - Operacional Core Rev. B` (`8174…`), 0 reprovações | `[DOC]` |
| 7 | item `5.1` da mãe (S2-mínima) — task e status | `tasks.toml`: `T-05.2`/`CST-36` | `status = "done"` — QA APPROVED (2 rodadas) + REVIEW COMPLIANT (2 rodadas), PR #102 | `[MEDIDO 2026-09-08]` |
| 8 | item `8.6` da mãe (S2 completa) — task e status | `tasks.toml`: `T-08.9`/`CST-77` | `status = "done"` | `[MEDIDO 2026-09-08]` |
| 9 | o que "done" de `T-05.2`/`T-08.9` de fato cobriu | `docs/plans/.../05_fatia_visivel.md`, `08_superficie_e_reprodutibilidade.md` | DoD daquelas tasks é sobre o **motor de charts** (geometria, as-of, bin, review de marcação) — nenhum DoD pede uma rota Next servindo dado real | `[INFERRED: leitura do DoD das duas tasks, nenhuma cita `page.tsx` ou rota HTTP]` |
| 10 | rota `/painel`, onde vive | `frontend/src/app/routes.ts:15` | `panel: "/painel"` — **único** segmento de URL em português no repositório | `[MEDIDO 2026-09-08]` |
| 11 | arquivos que referenciam `ROUTES.panel`/`"/painel"` fora de teste | `grep -rln 'ROUTES.panel\|"/painel"' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '.test.'` | **2** — `routes.ts`, `not-found.tsx` | `[MEDIDO 2026-09-08]` |
| 12 | diretório da rota `/painel` | `find frontend/src/app/painel -type f` | `page.tsx`, `PainelClient.tsx`, `error.tsx`, `loading.tsx` — **4 arquivos** | `[MEDIDO 2026-09-08]` |
| 13 | e2e que depende do caminho `/painel` | `find frontend -iname '*painel*' -path '*e2e*'` | `frontend/e2e/01-painel-carrega.spec.ts` — **1** | `[MEDIDO 2026-09-08]` |
| 14 | dependência de dado real — `captura-em-producao` | `harness pipeline state captura-em-producao` | `BUILD_AUTHORIZED`; tasks por fase: `01` 9/9 done, `02` 8/8 done, `03` 8/8 done `[MEDIDO por contagem de `status` em `docs/context/captura-em-producao/tasks.toml`]` | `[MEDIDO 2026-09-08]` |
| 15 | regras bloqueantes em vigor | `harness rules list --severity block` | **8** — as mesmas 8 de `PRD-004`/`PRD-005` | `[MEDIDO 2026-09-08]` |
| 16 | `CLAUDE.md` linha 12 (idioma de rota) | `grep -n 'Linha 12' CLAUDE.md` | **RESPONDIDA em 2026-09-08** — rotas nascem em inglês, migração retroativa incluída | `[DOC]` |

### 1.2 O diagnóstico — geometria pronta, as duas pontas ausentes

A S2 existe como **geometria testada** (`charts`, 32 módulos, motor headless), como **design aprovado** (Stitch, Rev. B, 0 reprovações) e como **protocolo de transporte no cliente** (`history-transport.ts`, `live-transport.ts`, já com teste próprio). Faltam:

- **(a) a rota Next** que monta essa geometria com o protocolo de transporte já existente, servindo BTCUSDT/Preço+OI+CVD (`SPEC-001` item `5.1`) e, depois, os painéis restantes com as-of/marcação de fixture (item `8.6`);
- **(b) as duas rotas de backend** que `ADR-005/D1` exige e que **não existem**: histórico HTTP endereçável por conteúdo, e ao vivo por SSE.

É o mesmo defeito que a revisão de 2026-09-04 achou no `/painel` — cliente pronto, servidor ausente — repetido no componente `charts`. A diferença: aqui **nem o cliente que desenha está montado**, só a geometria headless.

### 1.3 Por que os itens `5.1`/`8.6` da mãe aparecem como `done` sem a página existir

`T-05.2` e `T-08.9` fecharam contra um DoD que testava **a geometria** (eixo aguentando carga, bin de overflow, moldura as-of, marcação por teclado) — não contra uma página Next servida com dado real. O DoD nunca pediu isso; não é retrabalho malfeito, é escopo que **nenhuma task da mãe cobriu**. Isso é o mesmo padrão de `T-07.15/16/17` em `captura-em-producao`: uma task fechou um pedaço real e necessário, mas o "produto visível" prometido pelo item do plano só existe quando outra feature (esta) fecha a ponta que faltava — daí `5.1`/`8.6` virarem candidatas a `superseded`, não a reabertura (§4.2).

---

## 2. Objetivo

**Que exista uma página em `/[rota-em-inglês]` que renderize a S2 (BTCUSDT, painéis Preço + OI + CVD) sobre dado real gravado por `captura-em-producao`, alimentada pelas duas rotas de backend que `ADR-005/D1` já decidiu e nunca foram construídas — e que a única rota em português do repositório (`/painel`) seja migrada para inglês no mesmo ciclo.** Em termos verificáveis:

1. `GET {API_PREFIX}/<rota-histórico>` responde com envelope endereçável por conteúdo (`ADR-005/D6`) para uma janela fechada de série real.
2. Uma rota SSE serve o envelope de bucket parcial (`ADR-005/D2`) na borda direita do tempo.
3. Uma página Next nova monta a S2-mínima (item `5.1`) sobre essas duas rotas — sem fixture, sem mock em produção.
4. `/painel` deixa de existir em português: o segmento de URL, o diretório, `ROUTES.panel` e os arquivos que o referenciam migram para o nome em inglês que `/architect` decidir.
5. Nenhuma mudança no envelope de `/collector-status`, `/ingest-health`, `/series-catalog` ou `/series-quarantine` (contratos herdados, intocados).

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo | onde | efeito aqui |
|---|---|---|---|---|
| D-a | **Caminho A** — terceira filha de `plataforma-dados`, não `F4` de `camada-de-leitura-do-painel`, não `override` na mãe | `[DECISÃO-OWNER: 2026-09-08, escolha entre alternativas apresentadas]` | `handoff_to_pm.md` | ledger próprio, fases próprias; `5.1`/`8.6` da mãe viram candidatas a `superseded` (§4.2) |
| D-b | **Rotas em inglês, com migração retroativa de `/painel`** | `[PREMISSA-OWNER: 2026-09-08]` — *"rotas em ingles, inclusive o que tiver de rotas em ptbr pode ser migrado para ingles"* | `handoff_to_pm.md`, `CLAUDE.md` linha 12 | RF-4/RF-5 (migração); o **nome exato** do segmento novo e do segmento migrado é do `/architect` |
| D-c | Duas rotas por classe de tempo — histórico HTTP endereçável por conteúdo; borda direita por SSE; nenhuma rota chama exchange direto | `[DOC: ADR-005/D1]` | `ADR-005:19-26` | RF-1/RF-2 |
| D-d | A porta de leitura é o backend (FastAPI); `Next` renderiza, não hospeda regra de domínio nem SQL | `[DECISÃO-OWNER: 2026-09-03]` | `ADR-005/D5` | rotas novas vivem em `backend/src/api/routes`, não em Next Route Handler |
| D-e | Schema da resposta: linhas-objeto em envelope JSON tipado; projeção canônica nunca é formato de transporte | `[DOC: ADR-005/D6]` | `ADR-005/D6.0-D6.4` | contrato das duas rotas novas segue este envelope, não reinventa |
| D-f | Fronteira `charts`↔`web` é executável e contratual (`D5.12`), decidida em `ADR-003` | `[DOC: ADR-003]` | `ADR-003`, `D5.12` de `T-05.1` | a página nova não reimplementa geometria; importa de `charts` |
| D-g | Grade canônica é uma função, dona de `charts`; motores importam, nunca reimplementam | `[DOC: T-05.1/ADR-003 FR-3]` | `05_fatia_visivel.md` item 5.2 | a rota nova consome a grade existente |
| D-h | `captura-em-producao` fase `02` (escritor único em produção) já `done` — a dependência de dado real está satisfeita hoje, não é bloqueio futuro | `[MEDIDO 2026-09-08]` | `docs/context/captura-em-producao/tasks.toml` | `depends_on` desta feature é sobre o ledger, não sobre trabalho pendente |
| D-i | `/collector-status`/`/ingest-health`: envelope e fórmulas intocados | `[DOC: ADR-030/D5, ADR-008/D3]` | `ADR-030`, `ADR-008` | esta feature não muda essas rotas |
| D-j | Feature filha, ledger novo | `[PREMISSA-OWNER: 2026-09-08, aplicada por analogia ao padrão das irmãs]` | `relate` | fases próprias, tasks em `docs/context/pagina-de-grafico-s2/` |

---

## 4. Escopo

### 4.1 As três peças, e o que cada uma ganha

| peça | hoje | depois desta feature | fase |
|---|---|---|---|
| **(a) backend — histórico** | 0 rotas (`ADR-005/D1` não implementado) | rota HTTP endereçável por conteúdo, chave `(series_key_id, symbol, interval, janela, knowledge_time, bar_policy)`, envelope `D6` | F1 |
| **(b) backend — ao vivo** | 0 rotas | rota SSE, envelope de bucket parcial (`D2`), `Content-Type: text/event-stream` | F1 |
| **(c) frontend — página S2** | 0 rotas Next que montem a S2 | 1 página nova, consumindo `history-transport.ts`/`live-transport.ts` já existentes + os 32 módulos `s2-*` | F2 |
| **(d) migração `/painel`** | segmento, diretório, `ROUTES.panel` e 2 arquivos em português | segmento em inglês (nome do `/architect`), diretório renomeado, `ROUTES.panel` atualizado, `not-found.tsx` e o e2e ajustados | F3 |

### 4.2 O que migra da mãe — candidatas a `superseded`, mesmo padrão de `T-07.15/16/17`

| task da mãe | tracker | item do plano | por que vira candidata |
|---|---|---|---|
| `T-05.2` | `CST-36` | `5.1` — S2-mínima | fechou a geometria (DoD real, PR #102); **não** entregou a rota Next nem o backend — esta feature entrega a peça que faltava |
| `T-08.9` | `CST-77` | `8.6` — S2 completa | fechou as-of + marcação por teclado (DoD real); mesma lacuna de página/rota |

**O destino de `5.1`/`8.6` é escolha do owner** (`M1`, §14) — este PRD só nomeia a candidatura, não executa a transição de status no tracker (isso é o `/tech-lead`, mesmo padrão de `PRD-004 §4.2`).

---

## 5. User stories — com fronteira por fase

Ordem obrigatória **F1 → F2 → F3** (as rotas de backend precedem a página que as consome; a migração de `/painel` é independente das duas primeiras e pode correr em paralelo, mas fecha por último para não competir por revisão com a rota nova). Componente por story.

### F1 · As duas rotas de backend — `sentimento` (leitura do registro), `web` (contrato da rota)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-1** | Como cliente do gráfico, peço uma janela fechada de série (BTCUSDT, OI, CVD) por HTTP e recebo uma resposta **endereçável por conteúdo** — a mesma chave sempre devolve a mesma resposta, cacheável para sempre. | rota nova em `backend/src/api/routes`; chave e envelope por `ADR-005/D1`/`D6`; lê o registro que `captura-em-producao` grava | `CA-F1-1..3` |
| **US-2** | Como cliente do gráfico, na borda direita do tempo recebo um fluxo SSE com o envelope de bucket parcial, e a resolução exibida da idade nunca é mais fina que o transporte entrega. | rota SSE nova; envelope `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` a `max(1 Hz, 1/TF)` (`ADR-005/D2`) | `CA-F1-4..5` |
| **US-3** | Como operador, nenhuma das duas rotas chama exchange/Coinalyze diretamente — inclusive OI "agora" é série ingerida como qualquer outra. | herda `ADR-005/D1` cláusula final | `CA-F1-6` |

### F2 · A página que monta a S2 — `web`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-4** | Como usuário, acesso uma rota (nome final do `/architect`) e vejo BTCUSDT com painéis Preço + OI + CVD (delta e acumulado) sobre dado real, 4 dias de janela — item `5.1`. | página Next nova; consome `history-transport.ts`/`live-transport.ts`; importa geometria de `charts`, não reimplementa | `CA-F2-1..2` |
| **US-5** | Como usuário, o carimbo de idade aparece só na borda direita do tempo, e ausência de OI/CVD é lida como ausência, nunca como zero. | herda `D5.1`/`D5.2`/`D5.3` do DoD de fase `05` da mãe, já testados no motor `charts` — a página só precisa não quebrar o contrato ao renderizar | `CA-F2-3` |
| **US-6** | Como usuário, quando `captura-em-producao` estiver `DONE` e gravando, a página **não mostra fixture** — mostra o vazio real ou o dado real, nunca um mock em produção. | mesma doutrina que a revisão de 2026-09-04 aplicou ao `/painel` | `CA-E2E-1` |

### F3 · Migração de `/painel` para inglês — `web`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-7** | Como operador, o segmento de URL `/painel` deixa de existir em português — o diretório, `ROUTES.panel` e todo arquivo que o referencia (`not-found.tsx`, o e2e) apontam para o nome novo em inglês. | nome exato é do `/architect` (`[Q2]`); esta story só exige o **efeito** | `CA-F3-1..3` |
| **US-8** | Como usuário que tinha `/painel` salvo, um bookmark antigo **não quebra silenciosamente** — recebe redirect ou 404 com link para a rota nova (decisão de forma é do `/architect`, custo nomeado em `[Q3]`). | `next.config`/middleware de redirect, ou aceitar 404 — decisão nomeada, não tomada aqui | `CA-F3-4` |

---

## 6. Unidades de valor candidatas (para o tracker, DEPOIS da validação do arquiteto)

| UV | título | fases | componente | Epic pai |
|---|---|---|---|---|
| UV-1 | As duas rotas de backend de `ADR-005/D1` (histórico HTTP + SSE) existem e leem série real | F1 | `sentimento`, `web` | `[INFERRED I-2]` mesmo Epic da mãe para `charts`/S2 (`CST-3` ou `CST-6`) — `/tech-lead` decide |
| UV-2 | Página S2 nova monta a geometria existente sobre as rotas de F1 | F2 | `web`, `charts` | idem |
| UV-3 | `/painel` migrado para inglês, sem link/bookmark quebrando em silêncio | F3 | `web` | idem |

**Nada disto foi criado.** Ato posterior ao `approve prd` do `/architect`.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | story |
|---|---|---|
| RF-1 | Rota HTTP de histórico responde com chave endereçável por conteúdo `(series_key_id, symbol, interval, janela, knowledge_time, bar_policy)`; a mesma chave sempre devolve o mesmo corpo | US-1 |
| RF-2 | Rota SSE serve o envelope de bucket parcial a `max(1 Hz, 1/TF)`; resolução exibida da idade nunca mais fina que o transporte | US-2 |
| RF-3 | Nenhuma das duas rotas chama exchange/Coinalyze direto; toda série passa pelo registro ingerido | US-3 |
| RF-4 | Existe uma página Next em rota nova (nome do `/architect`) que monta BTCUSDT, Preço+OI+CVD, 4 dias, sobre dado real | US-4 |
| RF-5 | `/painel` (segmento, diretório, `ROUTES.panel`, `not-found.tsx`, e2e) migra para o nome em inglês decidido pelo `/architect`; **zero** segmento de URL em português ao fim da fase F3 | US-7 |
| RF-6 | Bookmark/link para `/painel` recebe tratamento decidido (`redirect` ou `404` com link) — não falha em silêncio (página em branco, erro não tratado) | US-8 |
| RF-7 | Nenhuma mudança em `/collector-status`, `/ingest-health`, `/series-catalog`, `/series-quarantine` | D-i |

### 7.2 Não-funcionais

| id | requisito | rótulo / medição |
|---|---|---|
| RNF-1 | A rota de histórico é cacheável para sempre pela chave — nenhuma leitura de banco por requisição repetida com a mesma chave e o mesmo `knowledge_time` | `[DOC: ADR-005/D1]` |
| RNF-2 | O eixo aguenta a carga da S2-mínima (288 pontos + candles da janela de 4 dias) com tolerância de 0,5 px nas coordenadas X — herdado como risco técnico maior já nomeado em `D5.11`/`ADR-005` | `[DOC: SPEC-001 §9.2]`; medição desta feature é sobre dado real, não sintético — `[NÃO MEDIDO]` até F2 |
| RNF-3 | A SSE reconecta sozinha e atravessa proxy — sem canal do browser para o servidor | `[DOC: ADR-005/D1]` |
| RNF-4 | Zero segredo literal nas rotas novas | regra em vigor (`core.hardcoded-secret`) |
| RNF-5 | Pegada de disco/RAM das duas rotas novas — sem processo de vida longa extra (rotas vivem no backend já existente, não sobem serviço novo) | `[INFERRED: ADR-027/D1 já fixa os processos de vida longa; rotas de leitura não são um deles]` |

---

## 8. Regras de negócio

| id | regra | falsificador |
|---|---|---|
| **RN-1** | **A porta de leitura é o backend** — `Next` não hospeda SQL, regra de domínio nem subprocess (`ADR-005/D5`) | `grep -rn 'spawnSync\|psycopg\|SELECT ' frontend/src` fora de teste ⇒ reprova |
| **RN-2** | **Nenhuma rota chama exchange/Coinalyze direto** — toda série é ingerida (`D-c`) | rota nova com `httpx`/`requests` para domínio de exchange ⇒ reprova |
| **RN-3** | **A página não reimplementa geometria** — importa de `charts`, nunca duplica grade/bin/as-of | diff de F2 declarando função de grade/bin dentro de `frontend/src/app` ⇒ `D5.12`/`ADR-003` violado |
| **RN-4** | **Migração de `/painel` é total ou não é** — nenhum segmento de URL em português sobrevive à F3 | o falsificador de `CLAUDE.md` (`git ls-tree` + `grep -vxE` da tabela de componentes) ⇒ **0 segmentos** fora do vocabulário fechado, ao fim de F3 |
| **RN-5** | **Sem fixture em produção** — a página não mostra mock quando `captura-em-producao` está `DONE` e gravando | mesma doutrina da revisão de 2026-09-04; `CA-E2E-1` reprova se a página renderizar sem consumir as rotas de F1 |
| **RN-6** | Mensagem de exceção, evento de log e identificador novos em inglês (`CLAUDE.md` linha 1/10); vocabulário `sentimento`/`charts`/`web` fica | `/review` |

---

## 9. Tipos e contratos críticos

| contrato | estado | dono | prazo |
|---|---|---|---|
| Nome do segmento de rota novo (S2) | **`TBD`** — `[Q1]` | `/architect`/`frontend-architect` | F2 |
| Nome do segmento que substitui `/painel` | **`TBD`** — `[Q2]` | `/architect`/`frontend-architect` | F3 |
| Forma do tratamento de bookmark antigo (`redirect`/`404`) | **`TBD`** — `[Q3]` | `frontend-architect` | F3 |
| Schema exato do envelope de histórico (campos além dos citados em `ADR-005/D6`) | **`TBD`** | `/architect` | F1 |
| Nome/rota exata dos dois endpoints novos (`/series/history`, `/series/live`, ou outro) | **`TBD`** | `/architect` | F1 |
| `bar_policy` — valores aceitos na requisição do consumidor | **`TBD`** — `ADR-005/D4` já decide que é do consumidor, falta o enum | `quant-architect` | F1 |

**Termos (na ausência de glossário):** *rota endereçável por conteúdo* — resposta HTTP cuja chave determina o corpo de forma imutável, cacheável para sempre; *borda direita do tempo* — a fronteira entre histórico fechado e "agora", servida por SSE; *envelope de bucket parcial* — a estrutura `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` que representa uma barra ainda em formação; *S2-mínima* — item `5.1`, 1 símbolo (BTCUSDT), 4 dias, painéis Preço+OI+CVD; *S2 completa* — item `8.6`, painéis restantes + as-of + marcação de fixture.

---

## 10. Critérios de aceite — testáveis, com o comando e a coluna "morde"

### F1

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F1-1 | Rota de histórico existe | `grep -rlE '"/history\|"/live\|text/event-stream' backend/src/api \| wc -l` → **≥ 1** (hoje **0**) | ausência ⇒ mesma medição do handoff original, reprova |
| CA-F1-2 | Resposta é endereçável por conteúdo | 2 chamadas com a mesma chave `(series_key_id, symbol, interval, janela, knowledge_time, bar_policy)` → corpos **byte-idênticos** | corpo muda entre chamadas com a mesma chave ⇒ reprova |
| CA-F1-3 | Nenhum `x-mbx-*`/header de exchange vaza na resposta | `curl -sD - <rota> \| grep -i 'x-mbx\|x-coinalyze'` → vazio | header de fornecedor vazando ⇒ reprova `RN-2` por evidência indireta |
| CA-F1-4 | Rota SSE responde com `Content-Type: text/event-stream` | `curl -sD - <rota-sse> \| grep -i 'text/event-stream'` → **1** linha | ausência ⇒ reprova |
| CA-F1-5 | Envelope de bucket parcial tem os 5 campos declarados | schema check sobre 1 evento SSE recebido | campo faltando ⇒ reprova |
| CA-F1-6 | Nenhuma chamada de exchange direta nas rotas novas | `grep -rn 'binance\|coinalyze' backend/src/api/routes/<rota-nova>*.py` além de nome de série/label ⇒ **0 chamadas HTTP externas** | `httpx.get`/`requests.get` para domínio externo dentro da rota ⇒ reprova |

### F2

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F2-1 | Página nova existe e importa a geometria de `charts` | `find frontend/src/app -name page.tsx \| wc -l` → **≥ 2** (hoje **1**); `grep -n 'from.*charts' <página nova>` → **≥ 1** import | página sem import de `charts` ⇒ reprova `RN-3` |
| CA-F2-2 | Página consome `history-transport.ts`/`live-transport.ts` existentes | `grep -n 'history-transport\|live-transport' <página nova>` → **≥ 1** cada | página com fetch direto/hardcoded ⇒ reprova |
| CA-F2-3 | Ausência de OI/CVD é lida como ausência | herda teste de `D5.2`/`D5.3` do motor `charts`, agora exercitado pela página real | valor renderizado como zero em vez de ausência ⇒ reprova |

### F3

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F3-1 | Zero segmento de URL em português | falsificador de `CLAUDE.md`: `git ls-tree -r --name-only HEAD \| grep -E '^(backend/src\|backend/tests\|frontend/src)/' \| awk -F/ '{for(i=1;i<NF;i++) print $i}' \| sort -u \| grep -vxE 'sentimento\|charts\|convergencia\|backtest\|web\|docs\|infra'` → **sem `painel`** | `painel` ainda presente ⇒ migração incompleta |
| CA-F3-2 | `ROUTES.panel` aponta para o nome novo | `grep -n 'panel:' frontend/src/app/routes.ts` → valor em inglês, não `/painel` | valor antigo ⇒ reprova |
| CA-F3-3 | `not-found.tsx` e o e2e apontam para a rota nova | `grep -rn '/painel' frontend/src frontend/e2e` → **0** ocorrências fora de string de teste que não é rota real | ocorrência viva ⇒ reprova |
| CA-F3-4 | Bookmark antigo tratado, não quebrado em silêncio | acessar `/painel` após a migração → `redirect` (3xx) **ou** `404` com link para a rota nova — nunca página em branco/erro não tratado | resposta genérica sem link/redirect ⇒ reprova `RF-6` |

### Ponta a ponta

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-E2E-1 | A S2-mínima renderiza sobre dado real, não fixture | com `captura-em-producao` `DONE` e gravando, acessar a rota nova → painéis Preço/OI/CVD populados a partir das rotas de F1 | página servindo fixture/mock em produção ⇒ reprova (mesma doutrina de 2026-09-04) |
| CA-E2E-2 | Nenhum contrato herdado mudou | `git diff --stat <base>..HEAD -- backend/src/api/routes/collector_status.py backend/src/api/routes/ingest_health.py backend/src/api/routes/series_catalog.py backend/src/api/routes/series_quarantine.py` → vazio | qualquer linha ⇒ fora de escopo |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | Decidir o nome exato dos segmentos de rota (novo e migrado) | é do `/architect`/`frontend-architect` (`[Q1]`, `[Q2]`) |
| **NG-2** | Reabrir o caminho A/B/C ou o predicado da fronteira de idioma | ambos decididos pelo owner (`D-a`, `D-b`) |
| **NG-3** | Construir geometria nova de `charts` | os 32 módulos `s2-*` já existem e estão testados |
| **NG-4** | Mudar `/collector-status`, `/ingest-health`, `/series-catalog`, `/series-quarantine` | contratos herdados, `D-i` |
| **NG-5** | Implantar na VPS | herda `ADR-029/D1`, fora de escopo salvo owner dizer o contrário |
| **NG-6** | Painéis além de Preço/OI/CVD na S2-mínima (item `5.1`) | item `8.6` (S2 completa) é o que traz os painéis restantes; esta feature cobre ambos os itens do plano, mas a ordem de entrega dentro de F2 é do `/tech-lead` |
| **NG-7** | Autenticação/tela de login | `SPEC-001` item `5.11` já rebaixou essa superfície — não reaberto aqui |
| **NG-8** | Renomear qualquer coisa fora de `/painel` (outros diretórios, outros identificadores) | fora do gatilho desta rodada (`handoff_to_pm.md` só nomeia `/painel`) |

---

## 12. `[INFERRED]` — com motivo e custo de reversão

| # | inferência | motivo | custo se errada |
|---|---|---|---|
| I-1 | O DoD de `T-05.2`/`T-08.9` cobriu geometria, não página/rota | leitura dos itens `5.1`/`8.6` do plano — nenhum cita `page.tsx` ou rota HTTP; confirmado pelo handoff original (§0 item 3 deste PRD) | se errado: as tasks já cobrem mais do que este PRD assume, e parte do escopo de F2 encolhe — `/architect` confere ao ler as tasks originais |
| I-2 | Epic pai das UVs segue o mesmo da mãe para `charts`/S2 (`CST-3` ou `CST-6`) | não há Epic próprio nomeado para esta filha ainda | 0 custo — Epic é ato de tracker, do `/tech-lead` |
| I-3 | A ordem F1→F2→F3 é a correta (backend antes de página; migração de `/painel` por último) | rota sem backend não tem o que mostrar; migração de `/painel` é independente e não deveria competir por revisão com a rota nova que é o objetivo central | se `/architect` preferir paralelizar F1 e F3 (times diferentes), o custo é de coordenação, não de dependência técnica real |

---

## 13. GAPs nomeados por esta rodada

| gap | severidade | dono | ação |
|---|---|---|---|
| `[GAP G1]` As duas rotas de `ADR-005/D1` nunca foram construídas, apesar da ADR estar aprovada desde antes de `captura-em-producao` existir | **alta** — é o corpo desta feature | `/architect` + `frontend-architect` | RF-1, RF-2 |
| `[GAP G2]` Nome do segmento de rota novo e do segmento que substitui `/painel` nunca foram decididos — `CLAUDE.md` linha 12 fechou o **idioma**, não a **palavra** | média | `/architect`/`frontend-architect` | `[Q1]`, `[Q2]` |
| `[GAP G3]` Forma do tratamento de bookmark/link antigo para `/painel` não está decidida | média | `frontend-architect` | `[Q3]` |
| `[GAP G4]` `RNF-2` (eixo sob carga real) nunca foi medido contra dado real — só contra fixture, no motor headless | média — é o maior risco técnico já nomeado por `ADR-005`/`SPEC-001` | `frontend-architect` | medir em F2 |
| `[GAP G5]` `bar_policy` — `ADR-005/D4` decide que é do consumidor mas não fixa o enum de valores aceitos | média | `quant-architect` | F1 |
| `[GAP G6]` `harness policy --key components` (7) diverge de `CLAUDE.md` (6, falta `infra`) — herdado das irmãs, não desta feature | baixa, documental | dono da reconciliação (fora desta feature) | apenas registrado |

---

## 14. Menu para o owner — escolhas com o custo de cada opção

Nenhum item bloqueia `PRD_DRAFT` nem a leitura do `/architect`. `M1` pode esperar até o `/tech-lead`.

| # | pergunta | opção | custo | proposta `[INFERRED]` |
|---|---|---|---|---|
| **M1** | Destino de `T-05.2` (`CST-36`) e `T-08.9` (`CST-77`) na mãe | **(a)** marcar `superseded`, `refs` apontando para as tasks desta filha — mesmo padrão de `T-07.15/16/17` | histórico preservado; a mãe registra que a entrega real migrou; transições no Jira | **(a)** |
| | | (b) deixar `done` como está, sem `refs` cruzando para a filha | duas verdades sobre o que "S2 pronta" significa — quem ler `5.1`/`8.6` isolado conclui que a página existe | |
| **M2** | Tratamento de bookmark antigo para `/painel` (`[Q3]`) | **(a)** `redirect` 308 permanente | 0 link quebrado; exige middleware/`next.config` novo | `[NÃO SEI]` — proposta do `frontend-architect` |
| | | (b) `404` com link para a rota nova | mais simples de implementar; usuário perde 1 clique | |

---

## 15. Perguntas em Aberto — classificadas, com quem decide

| id | pergunta | bloqueia? | decide |
|---|---|---|---|
| **[Q1]** | Nome exato do segmento de rota da S2 nova | **F2** | `/architect`/`frontend-architect` |
| **[Q2]** | Nome exato do segmento que substitui `/painel` | **F3** | `/architect`/`frontend-architect` |
| **[Q3]** | Forma do tratamento de bookmark antigo (`redirect` vs `404`) | F3 | `frontend-architect` |
| **[Q4]** | Nomes/rotas exatas dos dois endpoints de backend (`/series/history`, `/series/live`, ou outro) | F1 | `/architect` |
| **[Q5]** | Enum de `bar_policy` aceito na requisição | F1 | `quant-architect` |
| **[Q6]** | A migração de `/painel` (F3) entra na mesma SPEC/plano desta feature, ou vira task separada dentro dela? | não bloqueia PRD | `/architect` (nomeado como pergunta em `handoff_to_pm.md`) |

---

## 16. Registro da varredura de discovery

| dimensão | estado | fonte / gap |
|---|---|---|
| stakeholders e consumidores | `[COBERTO]` usuário único (owner, via browser); consumidor de backend: a própria página Next (`D-d`) | §2 |
| volumetria e escala | `[COBERTO]` 4 dias de janela, 1 símbolo (item `5.1`); `[GAP]` carga real do eixo nunca medida (`G4`) | `RNF-2` |
| requisitos não-funcionais (latência, frescor) | `[COBERTO]` cacheável para sempre (histórico), `max(1 Hz, 1/TF)` (ao vivo) — ambos herdados de `ADR-005` | `RNF-1`, `RNF-3` |
| estados e casos de borda | `[COBERTO]` ausência de OI/CVD (herdado do motor, `D5.2`/`D5.3`), fixture vs. dado real (`RN-5`), bookmark antigo (`[Q3]`) | §10 |
| contrato e dependências | `[COBERTO]` envelope `ADR-005/D6`; `[GAP]` nomes de rota e `bar_policy` (`[Q1]`, `[Q4]`, `[Q5]`) | §9 |
| métricas e observabilidade | `[GAP]` nenhum instrumento novo pedido nesta rodada — a página é o instrumento visível; não é `[Q]`, é achado sem dono forçado | — |
| escopo e non-goals | `[COBERTO]` §11, 8 itens; caminho A/B/C e idioma de rota resolvidos fora desta feature | `D-a`, `D-b` |

**O que foi perguntado ao owner nesta sessão:** nada — as duas decisões relevantes (`D-a`, `D-b`) já vieram prontas do `handoff_to_pm.md`, citadas com o rótulo original. O restante está em §14/§15.

---

## 17. Gate de handoff — a checklist, conferida

- [x] cada story tem fronteira clara e cabe numa fase — **8 stories em 3 fases** (§5)
- [x] as regras bloqueantes em vigor são **endereçáveis** — `harness rules list --severity block` → **8** `[MEDIDO 2026-09-08]`: mesmas 8 de `PRD-004`/`PRD-005`; `web-fullstack.browser-imports-server` e `tenant-from-request` mordem em código novo de F1/F2 (rota backend não vaza para browser; nenhum identificador de inquilino vem do request); `core.*` (import relativo, except silencioso, print, segredo) mordem no Python novo das duas rotas; `own.compose-hardcoded-secret` cai por vacuidade — **declarado**, nenhum compose novo nesta feature
- [x] tipos e contratos críticos definidos, ou `TBD` com dono e data — §9 (**6 `TBD`**, donos nomeados, prazo por fase)
- [x] non-goals escritos — §11, **8 itens**

**Gaps classificados:** bloqueante → **nenhum** para `PRD_DRAFT`; não-bloqueante → `[Q1]`–`[Q6]`, `G1`–`G6`; inferível → `I-1`–`I-3`.

**Ledger:** `harness pipeline advance pagina-de-grafico-s2 PRD_DRAFT` — executado após gravar este arquivo; registrado em `docs/INDEX.md`.

**Próximo passo:** `/architect` sobre `handoff_to_architect.md` (a escrever) — Gap Analysis; decidir `[Q1]`/`[Q2]` (nomes de rota), `[Q3]` (bookmark), `[Q4]`/`[Q5]` (contrato das rotas de backend); SPEC + plano em 3 fases na ordem F1 → F2 → F3.
