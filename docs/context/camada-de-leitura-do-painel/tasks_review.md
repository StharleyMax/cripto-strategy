# Narrativa de review de tasks — `camada-de-leitura-do-painel`

**Papel:** `/tech-lead` · **Data:** 2026-09-05 · **Feature:** `camada-de-leitura-do-painel` (**filha** de `plataforma-dados`, `relate` no ledger)
**Status desta narrativa: APROVADA POR PRÉ-AUTORIZAÇÃO DO OWNER** — modo `--create`. Declaração literal, `[PREMISSA-OWNER: 2026-09-05]`: *"ok, considere aprovado. Podemos avançar com TL, criar as taks e em seguida abrir a pr e merge"*. A pré-autorização cobre **criar as tasks**; não cobre nenhum código, nenhum commit, nenhuma implantação.
**Insumos lidos integralmente:** [`SPEC-003`](../../specs/SPEC-003-camada-de-leitura-do-painel.md) (301 linhas) · [`index.md`](../../plans/SPEC-003-camada-de-leitura-do-painel/index.md) + [`01`](../../plans/SPEC-003-camada-de-leitura-do-painel/01_pagina_diz_a_verdade.md) · [`02`](../../plans/SPEC-003-camada-de-leitura-do-painel/02_api_alcancavel_e_honesta.md) · [`03`](../../plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md) · [`ADR-028`](../../adr/ADR-028-leitura-do-painel-em-server-component-e-o-portao-de-d6-4-medido-pela-propriedade.md) · [`ADR-029`](../../adr/ADR-029-topologia-da-camada-de-leitura-caddy-proprio-mesma-origem-por-caminho-e-readiness-que-discrimina.md) · `PRD-003` §6 (UVs candidatas) e §11 (CAs, só as linhas `CA-F*`).
**Zero código. Zero commit. Nenhuma task criada no Jira** (§5 explica, com o número).

---

## 0. Gate de entrada — conferido, com o comando

| condição | comando | resultado |
|---|---|---|
| estado == `SPEC_APPROVED` | `harness pipeline state camada-de-leitura-do-painel` | **`SPEC_APPROVED`** `[MEDIDO 2026-09-05]` |
| o ledger é a identidade | `harness pipeline show camada-de-leitura-do-painel` | `approve spec` em `2026-09-05T12:53:22Z` com a leitura adotada (M1 = F1+F2+F3, M2–M5 nos defaults); `advance SPEC_APPROVED` `12:53:23Z`; `dispatch tech-lead` `12:53:38Z` — **não repetido** `[MEDIDO]` |
| `index.md` do plano existe | `wc -l docs/plans/SPEC-003-camada-de-leitura-do-painel/*.md` | 4 arquivos (`index` 48 · `01` 45 · `02` 43 · `03` 38 linhas) `[MEDIDO]` |
| destino no tracker | `harness policy --key tracker` | `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}` `[MEDIDO]` |
| integração do tracker | `curl -s -o /dev/null -w '%{http_code}' https://conversationhub.atlassian.net/rest/api/3/myself` | **`401`** (chamador anônimo); MCP `atlassian` **não autenticado** nesta sessão `[MEDIDO 2026-09-05]` — §5 |
| vocabulário de componentes | `harness policy --key components` | `["sentimento","charts","convergencia","backtest","web","docs","infra"]` — **7** (`CLAUDE.md` lista 6; `[GAP G1]`, dono owner, **não** desta feature) `[MEDIDO]` |
| roteamento por componente | `harness policy --key agents` | `web` → `frontend-architect`/`frontend-builder`/`frontend-qa` + `design_gate`; `infra` → `infra-architect`; `sentimento` → `quant-architect` `[MEDIDO]` |

**O texto da `SPEC-003` diz `SPEC_DRAFT` (linha 3) e o ledger diz `SPEC_APPROVED`.** O ledger manda. O resíduo textual, e o `Status: proposto` das duas ADRs (*"vira `aceito` no `approve spec`"*), viram a task `T-01.10` — em vez de ficarem como divergência que custa a leitura de alguém.

---

## 1. A leitura de M1–M5 que esta quebra obedece

O motivo do `approve spec` (ledger) fixa: **M1 = F1+F2+F3** (as três fases entram; `F3` continua condicionada à ADR do `quant-architect`, prazo 2026-09-11) e **M2–M5 nos defaults** da `SPEC-003` linhas 17–21. Efeito na quebra:

| decisão | efeito na task |
|---|---|
| M1 = F1+F2+F3 | 3 fases materializadas: `01` (10 tasks), `02` (7), `03` (8) — **25** |
| M2 `/api/v1` | `T-02.2` fixa o default; `[Q2]` continua do owner, custo de reverter 2 linhas |
| M3 remover `abrir` | dentro de `T-01.4` (o controle sai com `openedSeriesId`); reexibir custa 1 componente quando o recurso `6` existir |
| M4 `basic_auth` inerte por env | dentro de `T-02.7` (bloco condicionado a `{$PANEL_BASIC_AUTH_HASH}`) |
| M5 e2e **fora** de `verify` | `T-01.8` cria `make e2e` e **não toca** `scripts/verify.sh`; ligar em `verify` é ato do owner, 1 linha |

---

## 2. Princípios da quebra — e por que não copiei os itens do plano 1:1

1. **Uma task = uma unidade coesa com DoD próprio**, não um item do plano. Onde dois itens do plano só fecham juntos, virou uma task (`1.1` + `1.4` → `T-01.4`: o Server Component **é** o que renderiza `SourceState`; separar produziria uma task "página lê a API" cujo DoD `D1.3` não fecha sem os estados de `D1.5`/`D1.6`). Onde um item do plano escondia duas unidades (`1.8` → `make api` em `T-01.7` e `make e2e` em `T-01.8`; `2.9` "testes" distribuídos em cada task), separei.
2. **Teste vive na task que ele mede**, nunca em task "testes" separada — é `R-B` do plano: DoD sem a coluna "servidor ausente" não é DoD, e uma task de testes ao final é exatamente onde a coluna se perde.
3. **`depends_on` só com aresta real** (arquivo, símbolo ou instrumento que a task de destino precisa que exista). A ordem `F1 → F2 → F3` do `SPEC-003` §6 é imposta pelo portão de fase do workflow (QA por fase), não por aresta fabricada — a única aresta `F1 → F2` de código é `T-02.5 → T-01.4` (o Server Component que envia `If-None-Match`) e `T-02.x → T-01.7` (`.env.example`/`make api` são o instrumento de `D2.1`/`D2.7`).
4. **A dependência da ADR do `quant-architect` é uma task** (`T-03.1`), não uma chave. `blocked_reason` **não é chave válida** do validador (`V-09` a ignora — `harness tasks validate plataforma-dados` mostra 5 avisos exatamente por isso). `D3.0` do plano (*"dispatch builder recusado sem a ADR"*) vira `depends_on = ["T-03.1"]` nas três tasks de rota de `F3` — greppável em `harness tasks json`.
5. **Forma e microcopy são do gate de design** (`R-E`). O gate é trabalho com artefato e veredito → task `T-01.3`, com dois juízes nomeados (`frontend-architect` para o mecanismo de estilo, `ux-ui-mastery` para forma/estado). Ela corre em paralelo com `T-01.1`/`T-01.2` e **precede** `T-01.4`/`T-01.5`, para que ninguém invente microcopy.
6. **Prefixo de título = lista `components`, na mesma ordem** (convenção da mãe: `[docs][sentimento]`).

---

## 3. As tasks — fase `01` · A página diz a verdade (10)

Componente predominante `web`; `infra` em `T-01.7`/`T-01.8`; `docs` em `T-01.3`/`T-01.10`. Requisitos da fase: `US-1`..`US-4`, `RF-1`..`RF-5`, `RF-10`, `RF-12`, `RN-2`..`RN-5`, `RN-7`, `CA-F1-1`..`CA-F1-16`. DoD por ID (`D1.x`) remete a `01_pagina_diz_a_verdade.md` — **não transcrevo o comando**, cito onde ele está.

| id | título | escopo (o que entra) | DoD (comando ⇒ verde · servidor ausente ⇒ reprova) | deps | cobre |
|---|---|---|---|---|---|
| `T-01.1` | `[web]` Transporte server-only com erro tipado | `import "server-only"` na 1ª linha de `ingest-health-query.ts`; devDependency `server-only`; `TransportErrorKind` (4 variantes, mensagem em inglês, `status` em `non_2xx`); `cache: "no-store"` explícito; `etag: null` no resultado; `test:s1`/`test:app` com `--conditions=react-server` (`F-028-7`) **na mesma task** — sem isto `ingest-health-query-http.test.ts` 8/8 morre | `D1.2` (metade `server-only` + `F-028-7`): `grep -c 'import "server-only"' … → 1`; `npm --prefix frontend run test:s1` verde (universo `ls …/s1-console/*.test.ts`); `F-028-4` rebaselinado → 0. Ausente: n/a (build/lint) — **declarado** | — | `RF-1`, `RF-4`, `CA-F1-4`, `ADR-028/D2` |
| `T-01.2` | `[web]` Portão ESLint por diretiva e teste de fronteira reescrito | `D5.17b` morde **só** em arquivo `"use client"` (forma (i) ou (ii), `ADR-028/D3`); `import type` sempre passa; mensagem nomeia `ADR-005/D6.4`; `fingerprint-sync-boundary.test.ts` **reescrito** (probes MORDE ganham `"use client"`, CONTROL sem diretiva com import de valor limpo) | `D1.2` (metade ESLint): `F-028-3` (sem diretiva `0 problems`, com `1 error`), `F-028-1''` (transitivo: `build` reprova, `eslint` passa), `F-028-8` (`git log --diff-filter=D -- <teste>` vazio). Ausente: n/a — declarado | `T-01.1` | `RN-1`, `CA-F1-5`, `ADR-028/D3` |
| `T-01.3` | `[web][docs]` Gate de design de `F1` — estados, microcopy e mecanismo de estilo | `ui-designer` traduz §3.3 (7 estados + "sem fonte") em forma/microcopy pt-BR; `frontend-architect` decide o mecanismo de estilo (`I-8` Tailwind com tokens de `DESIGN_SYSTEM.md` × CSS puro); `ux-ui-mastery` julga; veredito em `gates/F1-design.md`; `docs/product/` atualizado | `test -f docs/context/camada-de-leitura-do-painel/gates/F1-design.md` **e** o arquivo contém veredito do validador **concordando** (`D1.8`, última coluna); cada estado de §3.3 tem forma + texto; contrato `data-fact` **intocado**. Ausente: n/a — é decisão | — | `RF-12`, `[L1]`, `R-E`, `CLAUDE.md §Design` |
| `T-01.4` | `[web]` `page.tsx` Server Component lê a API e renderiza estado de sistema | `page.tsx` `async` sem `"use client"`, 1 chamada por render; `PainelClient.tsx` (`"use client"`, `import type` só) com `{s1, s3, sourceState}`; `SourceState` computado no servidor com `data-fact` de §3.3; `loading.tsx`; `error.tsx` genérico (`ADR-028/D4`); ramo vazio S1/S3; marcador "sem fonte" nos 5 blocos; `fixtures.ts` fora do grafo de produção; `openedSeriesId` e `abrir` **saem** (M3) | `D1.1`, `D1.3`, `D1.4`, `D1.5` (três causas **sob `next start`**), `D1.6`, `D1.7`. Ausente (API `000`): **0 `<tr>`**, `error_kind:connection_refused`, access log **não** incrementa — linha renderizada com API no chão ⇒ `05_fatia_visivel.md:225` repetido | `T-01.2`, `T-01.3` | `US-1`..`US-3`, `RF-1`..`RF-4`, `RN-2`, `RN-3`, `CA-F1-1`..`CA-F1-3`, `CA-F1-6`..`CA-F1-11`, `ADR-028/D1, D4, D5` |
| `T-01.5` | `[web]` Pipeline de estilo — o design aprovado chega ao browser | `layout.tsx` importa ≥ 1 stylesheet global; pipeline conforme decisão de `T-01.3`; tokens de `DESIGN_SYSTEM.md` sem redefinição (`NG-5`); fonte de ícone carregada (glifo ≠ texto `PARADOstop_circle`) | `D1.8`: `find frontend -name '*.css' … | wc -l ≥ 1` (hoje 0); e2e `01` `stylesheets_applied ≥ 1`, `glyph_font_families ∌ Times New Roman`. Ausente: n/a — declarado | `T-01.3` | `RF-12`, `CA-F1-15`, `[GAP G2]` |
| `T-01.6` | `[web]` Higiene de rota e controles honestos | `features/panel/Filter.tsx` fora de `src/app`; `metadata.title`; 1 `h1`; `GET /` → `3xx /painel`; `not-found.tsx` pt-BR com link; filtro do catálogo **filtra**; rótulo `Janela de perda` (linha 8) sem tocar a coluna (linha 11) | `D1.9`: `grep -rn 'features/panel/Filter' frontend/src/app | wc -l → 0`; e2e `01`/`03`/`04`; `grep -c 'abrir' <main> → 0`. Ausente: e2e `04` não roda sem catálogo (pré-condição `D1.3`) — declarado | `T-01.4` | `RF-10`, `CA-F1-14`, `CA-F1-16`, `RN-5`, `RN-8` (rótulo) |
| `T-01.7` | `[infra]` `.env.example` + `make api` com access log | `.env.example` (raiz, **não existe hoje** `[MEDIDO: test -f → ausente]`) com `APP_PORT`, `API_PREFIX`, `INGEST_HEALTH_STORE_PATH`, `INGEST_HEALTH_API_BASE_URL` — só chaves e defaults não-secretos; alvo `api` (`cd backend && .venv/bin/python -m src.main`, honrando `.env`, uvicorn com access log **ligado** — instrumento de `CA-F1-1`); `frontend/README.md` ≤ 10 linhas "como subir" | `D1.10`: `grep -c '…' .env.example → 4`; `make -n api` imprime `python -m src.main`. Ausente: `make api` com `INGEST_HEALTH_STORE_PATH` em diretório inexistente **ainda sobe** em `F1` — **lacuna declarada que `T-02.1` fecha** | — | `RF-5`, `CA-F1-12`, `ADR-029/D5` |
| `T-01.8` | `[infra]` `make e2e` — API de teste efêmera + `next start` + Playwright | alvo `e2e`: sobe API sobre store efêmero com ≥ 1 run (seed versionado), `next start` com `INGEST_HEALTH_API_BASE_URL`, `playwright test`, derruba tudo; `rc` do Playwright; **fora** de `verify` (M5); `scripts/verify.sh` **intocado** | `make -n e2e` imprime `playwright test`; `git diff --stat scripts/verify.sh` vazio. Ausente: o alvo com a API deliberadamente no chão é o modo "no chão" de `D1.11` — o alvo tem de suportar os dois modos | `T-01.7` | `RF-5`, `CA-F1-13`, `NG-10` |
| `T-01.9` | `[web]` Suíte e2e reescrita para a arquitetura — mede §5 B1–B9 | specs `01`–`07` alinhados a §5; `02:9` deixa de perguntar "o browser chamou a API?" e passa a medir access log + `data-fact`; `facts.jsonl` por spec; stub `500` e stub `sleep 2`; `[Q11]` (15 `test(` × 16 reportados) explicado no relatório em `gates/` | `D1.11`: `make e2e` de pé ⇒ todos ✓ (universo `grep -o 'test(' frontend/e2e/*.spec.ts | wc -l`, hoje 15). **No chão ⇒ `D1.3`/`D1.4`/`D1.6` ✘ e `D1.5(b)` ✓** — veredito igual nos dois ⇒ a suíte não mede (falsificador da fase) | `T-01.4`, `T-01.5`, `T-01.6`, `T-01.8` | `US-4`, `RN-7`, `CA-F1-2`, `CA-F1-13`, `[Q11]` |
| `T-01.10` | `[docs]` Status das ADR-028/029 e da SPEC-003 apontam para o ledger | `Status: proposto` → `aceito` em `ADR-028`/`ADR-029` citando `approve spec` de `2026-09-05T12:53:22Z`; linha 3 da `SPEC-003` e cabeçalho do `index.md` do plano deixam de dizer `DRAFT`; nenhuma decisão reaberta; `docs/INDEX.md` append-only | `grep -c 'Status:\*\* \`aceito\`' docs/adr/ADR-028-*.md docs/adr/ADR-029-*.md → 1 cada`; `grep -c SPEC_DRAFT docs/specs/SPEC-003-*.md → 0` no cabeçalho; `git log --diff-filter=D -- docs/INDEX.md` vazio. Ausente: n/a | — | `CLAUDE.md §ledger`, `SPEC-003 §10` |

**Falsificador da fase (herdado):** `D1.3`, `D1.4`, `D1.11` com o mesmo veredito de pé e no chão ⇒ a fase não fecha. `D1.5` verde só em `next dev` ⇒ re-executar em `next start`.

## 3b. Fase `02` · A API é alcançável e honesta (7)

Componente `infra` (valor do `ETag` é `sentimento` existente, `ingest_record.py:177` — nenhum código de domínio novo); `web` em `T-02.5`. Requisitos: `US-5`..`US-8`, `RF-6`..`RF-8`, `RNF-1`, `RNF-3`, `RNF-5`, `RN-6`, `RN-9`, `CA-F2-1`..`CA-F2-9`. Juiz: `infra-architect`. **Nenhuma implantação** (`R-D`): `docker compose config -q` e `caddy validate` são o teto.

| id | título | escopo | DoD | deps | cobre |
|---|---|---|---|---|---|
| `T-02.1` | `[infra]` `create_app` recusa store com diretório-pai inexistente | verificação no **composition root** (`src.main`), nunca no store/use case; `raise` em inglês nomeando o caminho; `python -m src.main` ⇒ `rc ≠ 0`; `_fetch` e o `200` vazio de `/ingest-health` **intocados**; pytest em `backend/tests/api/` | `D2.1`: `INGEST_HEALTH_STORE_PATH=<scratch>/nao-existe/ih.sqlite3 … -m src.main; echo $?` → **≠ 0**, stderr nomeia o caminho (hoje sobe `[MEDIDO: FB-infra §2]`); `D2.3` 8/8 do TS continua. É a própria metade que morde | `T-01.7` | `RF-7`, `CA-F2-1`, `CA-F2-3`, `ADR-029/D3`, `core.silent-except` |
| `T-02.2` | `[infra]` `API_PREFIX` lido uma vez, default `/api/v1`, todas as rotas sob ele | env lida **uma** vez em `src.main`; rotas montadas sob o prefixo; `openapi.json` reflete; ausente ⇒ default, nunca raiz; `curl $API/ingest-health` sem prefixo → `404`; `.env.example` já tem a chave (`T-01.7`) | `D2.7` (metade backend): `grep -rn 'API_PREFIX' backend/src/main .env.example | wc -l ≥ 2`; pytest `API_PREFIX=/x` ⇒ paths de `openapi.json` começam por `/x`. Ausente: n/a | `T-01.7` | `US-8`, `CA-F2-9`, `ADR-029/D2`, M2 |
| `T-02.3` | `[infra]` `GET {API_PREFIX}/ready` discrimina três estados do store | `200`/`503`; corpo exatamente `{"store":{"path","exists","schema_present"}}`; `200 ⇔ exists ∧ schema_present`; não é health de processo; não consulta Postgres; `DatabaseError` propaga (`500`) | `D2.2`: 3 execuções (ausente ⇒ `503 exists:false`; 0 byte ⇒ `503 schema_present:false`; válido ⇒ `200 true,true`). Ausente: `curl → 000`; pytest reprova por **conexão**, não por `503` | `T-02.2` | `RF-7`, `CA-F2-2`, `ADR-029/D3` |
| `T-02.4` | `[infra]` `ETag` = `fingerprint()` no handler e `304` a `If-None-Match` igual | `ETag: "<hex>"` (aspas fortes, sem `W/`), valor de `IngestHealthReport.fingerprint()`; igual ⇒ `304` **sem corpo** com `ETag` repetido; corpo de `200` intocado (`D6.1`); pytest: header `==` `fingerprint()` **e controle negativo** (1 run a mais ⇒ muda) | `D2.4` (lado Python) + `D2.5`: `curl -sD - … | grep -ci '^etag:' → 1`; `If-None-Match` igual → `304`, errado → `200`. Ausente: `000`. **Igualdade só de um lado é `DoD-2` comparando um número consigo mesmo** (falsificador da fase) | `T-02.2` | `RF-8`, `CA-F2-4`, `CA-F2-5`, `ADR-005/D6.3`, `ADR-029/D4` |
| `T-02.5` | `[web]` Server Component envia `If-None-Match` e reutiliza a projeção no processo em `304` | transporte envia o `etag` conhecido; `304` ⇒ projeção anterior **do mesmo processo Next** (nunca browser); `etag: string | null` preenchido; teste TS `etag == fingerprint(parseIngestHealthEnvelope(body))` sobre a API de pé | `D2.4` (lado TS) + `D2.6`: 2º `GET /painel` ⇒ access log mostra `304` na 2ª linha; `<main>` idêntico ao 1º. Ausente: `error_kind:connection_refused`, **não** a projeção reutilizada — cache de processo nunca substitui erro de transporte | `T-01.4`, `T-02.4` | `US-6`, `RF-8`, `RNF-1`, `CA-F2-4` |
| `T-02.6` | `[infra]` `deploy/compose.yml` ganha `api`, `web`, `caddy` — estruturado, não implantado | `api` (imagem Python de `ADR-027`, `command = python -m src.main`, **sem `ports:`**, `env_file`, `restart`, log `10m × 3`); `web` (`next start`, sem `ports:`); `caddy` (`caddy:2-alpine`, `80/443`, volumes `Caddyfile` + `caddy_data`/`caddy_config`); toda credencial `${VAR}`; `.env.example` ganha `PUBLIC_HOST`, `PANEL_BASIC_AUTH_HASH` (vazia), variante `http://api:${APP_PORT}` comentada | `D2.8`: `grep -cE '^  (api|web|caddy):' → 3`; `docker compose -f deploy/compose.yml config -q` `rc=0`; `ports:` em `api` → 0. `D2.9`: `harness rules --mode file --path deploy/compose.yml` vazio; **morde** com `POSTGRES_PASSWORD: literal` plantado. Ausente: **declarado** — não há "de pé" (`RN-9`); `docker compose ps` na VPS mostrando `caddy` ⇒ escopo violado | `T-01.7`, `T-02.2` | `RF-6`, `RNF-3`, `RNF-5`, `RN-6`, `RN-9`, `CA-F2-6`, `CA-F2-8`, `ADR-029/D1, D5`, `own.compose-hardcoded-secret` |
| `T-02.7` | `[infra]` `deploy/Caddyfile` — mesma origem por caminho; prefixo é uma constante | site `{$PUBLIC_HOST}`; `{$API_PREFIX}/*` → `api:{$APP_PORT}`; resto → `web:3000`; `basic_auth` condicionado a `{$PANEL_BASIC_AUTH_HASH}` (M4, inerte sem valor); TLS parametrizado (`[Q10]`); teste: `API_PREFIX=/x` move `openapi.json` **e** o `Caddyfile` renderizado **juntos** (`F-029-7`) | `D2.7` (metade Caddy) + `D2.8`: `caddy validate --config deploy/Caddyfile` `rc=0` (via `docker run --rm … caddy:2-alpine` se não houver binário); `grep -c reverse_proxy → 2`; `D2.10` `grep -rn 'CORSMiddleware' backend/src | wc -l → 0`. Ausente: n/a — declarado | `T-02.2`, `T-02.6` | `RF-6`, `CA-F2-7`, `CA-F2-9`, `ADR-029/D2, D6`, M4, `NG-7` |

**Falsificador da fase (herdado):** `D2.4` de um lado só ⇒ vacuidade de `ADR-005/D6`; `D2.1` subindo com pai inexistente ⇒ `ADR-029/D3` não existe.

## 3c. Fase `03` · Os recursos baratos entram pelo caminho decidido (8)

`sentimento` (use cases, forma dos envelopes) + `infra` (rotas, DI, 2ª env de store) + `web` (parsers, formatador). Requisitos: `US-9`..`US-12`, `RF-9`, `RF-11`, `RN-8`, `CA-F3-1`..`CA-F3-4`. **Condição de entrada `D3.0`:** a ADR do `quant-architect` sobre o agregado por série (`[Q7]`) existe em `docs/adr/`, datada ≤ **2026-09-11**, e está citada em `03_recursos_baratos.md` — é a task `T-03.1`, e as três tasks de rota dependem dela.

| id | título | escopo | DoD | deps | cobre |
|---|---|---|---|---|---|
| `T-03.1` | `[sentimento][docs]` ADR do envelope agregado por série — fórmulas de `status`, `uptimePercent`, `resilience`, `retention` | escrita pelo **`quant-architect`** (dono de `sentimento`); fixa as fórmulas sobre `IngestRecordSource.runs()` (porta existente, sem método novo), o nome da rota (`I-10` `collector-status`, 1 linha para trocar), os campos de `CollectorRow` no fio; declara o que **não** consegue julgar; **não** toca as 15 colunas nem `to_envelope()` (`NG-9`); referenciada em `03_recursos_baratos.md` | `D3.0`: `grep -n 'ADR-0[0-9][0-9]' docs/plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md` cita a ADR nova; `ls docs/adr/ADR-0NN-*` existe com data ≤ 2026-09-11. **Sem ela ⇒ `dispatch builder` de `T-03.2`/`T-03.4`/`T-03.6` recusado.** Prazo vencido sem ADR ⇒ sinal para o owner, não silêncio | — | `[Q7]`, `I-9`, `I-10`, `US-10`, `SPEC-003 §3.6` |
| `T-03.2` | `[sentimento][infra]` Use case `list_series_catalog()` e rota `GET {API_PREFIX}/series-catalog` | concatena as **7** constantes `SeriesCatalogEntry(` (`cvd_source_catalog`, `price_source_catalog`, `open_interest_catalog`); envelope `{"query":"series_catalog","n_entries":7,"entries":[…]}` com os nomes de campo do TS `series-catalog.ts:134`; `Completeness` **não** vai no fio; **0** SQL no handler; DI em `dependencies.py`; pytest | `D3.1`: `curl … series-catalog | python3 -c '…print(d["n_entries"],len(d["entries"]))' → 7 7` `=` `grep -rn 'SeriesCatalogEntry(' backend/src … | wc -l`; `grep -rn SELECT backend/src/api | wc -l → 0`. Ausente: `000` | `T-03.1`, `T-02.2` | `US-9`, `RF-9`, `CA-F3-1`, `NG-3` (`4c` fora) |
| `T-03.3` | `[web]` `parseCatalogEnvelope` e S3 exibe as 7 linhas da API | parser compõe `assertValidCatalogEntry` + `QuarantineTerms` + `Completeness: unmeasured`; estrito em campo ausente (`ADR-019/D2`); `FIXTURE_CATALOG_ROWS` fora do grafo de produção; teste TS (1 campo removido por vez) | e2e: S3 `catalog_rows = 7`. **Ausente: `error_kind:connection_refused`, `catalog_rows = 0`; `FIXTURE_CATALOG_ROWS` visível ⇒ reprova** | `T-03.2`, `T-01.4` | `US-9`, `CA-F3-1`, `RN-3` |
| `T-03.4` | `[sentimento][infra]` Porta `list_all()` da quarentena, `QUARANTINE_STORE_PATH` e rota `GET {API_PREFIX}/series-quarantine` | `list_all()` em `sqlite_series_quarantine_store.py`; `QUARANTINE_STORE_PATH` em `src.main` (ausente/pai inexistente ⇒ `create_app` recusa, mesma regra de `T-02.1`); envelope `{"query":"series_quarantine","n_rows":N,"rows":[…]}` **sem `points_json`**; campos `terms…` = `QuarantineTerms` (`quarantine.ts:15`); `.env.example` ganha a chave; pytest | `D3.2`: `curl … | python3 -c '…assert r==[] or "points_json" not in r[0]'`; `QUARANTINE_STORE_PATH=<x>/nao-existe/q.sqlite3 python -m src.main → rc ≠ 0`. Ausente: `000` | `T-03.1`, `T-02.1`, `T-02.2` | `US-11`, `RF-9`, `CA-F3-4`, `[Q8]` (não decide prod) |
| `T-03.5` | `[web]` Gaveta de quarentena lê a rota; `FIXTURE_DIVERGENCES` fora | parser estrito; gaveta consome `/series-quarantine`; fixture só em `*.test.ts` | `grep -c FIXTURE_DIVERGENCES <main> → 0` **sempre**. Ausente: gaveta mostra erro, **não** a fixture | `T-03.4`, `T-01.4` | `US-11`, `CA-F3-4`, `RN-3` |
| `T-03.6` | `[sentimento][infra]` Use case de agregação por série e rota `GET {API_PREFIX}/collector-status` conforme a ADR | envelope **separado** `{"query":"collector_status","n_rows":N,"rows":[CollectorRow…]}`; fórmulas **conforme `T-03.1`**; sobre `IngestRecordSource.runs()` sem método novo; `/ingest-health` e as 15 colunas **intocados**; pytest + `F-D6-2` | `D3.3`: `sha256` do corpo de `/ingest-health` **igual** antes e depois sobre o mesmo store (`F-D6-2`); `curl … collector-status | python3 -c '…assert d["query"]=="collector_status"'`. Ausente: `000`. **`sha256` de `/ingest-health` mudar ⇒ `NG-9` violado** (falsificador da fase) | `T-03.1`, `T-02.2` | `US-10`, `RF-9`, `CA-F3-2`, `NG-9` |
| `T-03.7` | `[web]` Parser do agregado e S1 exibe o agregado, não o último run | parser próprio, reprova campo ausente (universo = nº de campos da ADR, 1 removido por vez); S1 troca `CollectorRow` mínimo pelo agregado; **não** recalcula `janela_de_perda` (`RN-4`) | teste TS por campo; e2e S1 com dado real. Ausente: S1 mostra erro, **não** o último `CollectorRow` de cache nem fixture | `T-03.6`, `T-01.4` | `US-10`, `CA-F3-2`, `RN-4` |
| `T-03.8` | `[web]` Formatador único pt-BR e e2e `07` de locale | **um** `Intl.NumberFormat("pt-BR")` na apresentação; **0** `toLocaleString` espalhado; fio com ponto decimal; cabeçalhos humanos (`Janela de perda`) sem tocar a coluna; e2e `07` reescrito | `D3.4`: e2e `07` `comma_decimal_hits = 0` **ou** `dot_decimal_hits = 0` (hoje 2 e 13); `grep -rn toLocaleString frontend/src --include='*.tsx' | grep -v test | wc -l → 0`; `D3.5`: `<th>` contém `Janela de perda`; `grep -c '"janela_de_perda"' …/ingest_record.py` inalterado. Ausente: n/a — só mede com dado real (`D1.3`), declarado | `T-01.9`, `T-03.3`, `T-03.7` | `US-12`, `RF-11`, `RN-8`, `CA-F3-3`, `SPEC-001 §3.8` |

**Falsificadores da fase (herdados):** `sha256` de `/ingest-health` muda ⇒ `NG-9`; S1/S3 com linha alguma no chão ⇒ fixture virou ponte (`RN-3`); `D3.5` passando por renomear a coluna ⇒ `RN-8` violada e o `sha256` de todo relatório moveu (`ADR-008/D3`).

---

## 4. Grafo de dependências — só arestas reais

```
F1  T-01.1 → T-01.2 ─┐
    T-01.3 ──────────┼→ T-01.4 → T-01.6 ─┐
    T-01.3 → T-01.5 ─┼───────────────────┼→ T-01.9
    T-01.7 → T-01.8 ─┘───────────────────┘
    T-01.10 (sem aresta; pode ser a primeira)
F2  T-01.7 → T-02.1
    T-01.7 → T-02.2 → T-02.3
                    → T-02.4 → T-02.5 (← T-01.4)
                    → T-02.6 (← T-01.7) → T-02.7 (← T-02.2)
F3  T-03.1 → T-03.2 (← T-02.2) → T-03.3 (← T-01.4) ─┐
    T-03.1 → T-03.4 (← T-02.1, T-02.2) → T-03.5      ├→ T-03.8 (← T-01.9)
    T-03.1 → T-03.6 (← T-02.2) → T-03.7 (← T-01.4) ─┘
```

Caminho crítico de `F1`: `T-01.1 → T-01.2 → T-01.4 → T-01.6 → T-01.9` (5), com `T-01.3` e `T-01.7`/`T-01.8` em paralelo. Paralelismo máximo no início: **4** tasks sem dependência (`T-01.1`, `T-01.3`, `T-01.7`, `T-01.10`).

---

## 5. Tracker — NÃO cardadas, e o vocabulário é deliberado

`tracker.kind = jira`, projeto `CST`, `child_kind = Tarefa`, `parent_kind = Epic`. Item pai candidato: **`CST-5`** (`PRD-003` §6, `[INFERRED: mesmo Epic de plataforma-dados, por ser filha]`) — alternativa é Epic próprio; **quem decide é o owner ao cardar**, e as três UVs candidatas (`UV-1` F1, `UV-2` F2, `UV-3` F3) são do `/pm`, não minhas.

**O que aconteceu:** MCP `atlassian` **não autenticado** nesta sessão (a plataforma lista o servidor entre os que exigem OAuth; sessão não-interativa); REST anônima → `401` `[MEDIDO 2026-09-05: curl -s -o /dev/null -w '%{http_code}' https://conversationhub.atlassian.net/rest/api/3/myself]`. **Zero** issue criada, editada ou comentada.

**O que isso É e o que NÃO é**, no vocabulário do gate do `/tech-lead` (*"tracker declarado mas indisponível … se é só falta de sincronizar, deixe sem marcação e diga isso no handoff"*):

- **Não é `local_only`.** `local_only = true` significa *"o owner decidiu não cardar, nunca"* — a fala do owner diz o contrário (*"criar as taks"*). Escrevê-lo aqui colapsaria "decidi" com "não consegui", e é exatamente o marcador que a mãe já recusou uma vez (`plataforma-dados/tasks.toml:217` — *"O `uncarded` anterior era FALHA DE ACESSO e nunca decisao — nao havia `local_only`, e nao ha agora"*). A instrução de despacho pedia `local_only` com motivo; **discordo e registro** — o gate do comando e o precedente da mãe pesam mais que a conveniência de um marcador que nada lê como "pendente".
- **É `uncarded`, sem marcação**, e o eixo que o expõe é `harness tasks list camada-de-leitura-do-painel` → `total=25 linked=0 local=0 uncarded=25`. Sinal âmbar **consciente**: aparece toda vez que alguém lista.

**Instrução de cadastro (manual ou na próxima sessão com MCP autenticado):** 25 `Tarefa` em `CST`, item pai `CST-5` (ou Epic próprio, decisão do owner), título = campo `title` de `tasks.toml`, descrição = linha da tabela de §3 + link para o plano da fase; ao criar, preencher `tracker = { provider = "jira", id = "CST-NNN", url = "…" }` **inline** em cada task e re-rodar `harness tasks validate`. Ordem sugerida de criação: a de `T-01.1`..`T-03.8` (o `depends_on` vira link "blocks" no Jira).


**Nota 2026-09-05 (posterior ao texto acima, que fica como registro):** o MCP `atlassian` autenticou nesta sessão e as 25 tasks **foram cardadas** — `uncarded=25` deixou de ser o estado. A alternativa *"Epic próprio"* foi a escolhida (owner: *"criar as taks"* / *"deixar tudo liberado"* `[PREMISSA-OWNER: 2026-09-05]`): 3 Epics em `CST` — `CST-112` (F1), `CST-113` (F2), `CST-114` (F3) — e 25 `Tarefa` `CST-115..CST-139` (`T-01.x → 115–124`, `T-02.x → 125–131`, `T-03.x → 132–139`), com `parent` = Epic da fase e labels `fase-NN`/`spec-003`/components. `tracker = { provider = "jira", id, url }` inline em cada `[[tasks]]` de `tasks.toml`; `harness tasks validate camada-de-leitura-do-painel` → OK e `harness tasks list camada-de-leitura-do-painel` → `linked=25 uncarded=0` `[MEDIDO 2026-09-05]`. O item pai candidato `CST-5` **não** foi usado.

---

## 6. Escopo de caminhos — e a colisão com a mãe, declarada antes de existir

Prefixos declarados via `harness pipeline scope camada-de-leitura-do-painel add …` (conferidos contra a SPEC — `frontend/` inteiro porque `package.json`, `eslint.config.mjs`, `e2e/`, `README.md` e a config de estilo ficam **fora** de `frontend/src`; `backend/tests` porque `T-02.x`/`T-03.x` acrescentam pytest em `backend/tests/api/`; `.env.example` e `Makefile` são raiz):

`frontend/` · `backend/src` · `backend/tests` · `deploy/` · `Makefile` · `.env.example` · `docs/specs` · `docs/plans` · `docs/adr` · `docs/context/camada-de-leitura-do-painel` · `docs/INDEX.md` · `docs/product`

**⚠ Colisão prevista, e ela é do owner, não minha:** `plataforma-dados` está em `BUILD_AUTHORIZED` e reivindica `frontend`, `backend/src`, `deploy`, `Makefile`, `docs/specs`, `docs/plans`, `docs/adr`, `docs/INDEX.md` (`harness pipeline scope plataforma-dados list`, 22 prefixos `[MEDIDO 2026-09-05]`). O portão de escrita (`scripts/pipeline.sh:42-43`, `:1049`) bloqueia por **`COLISÃO DE ESCOPO`** quando **>1 feature ≥ `BUILD_AUTHORIZED`** reivindica o mesmo path, salvo override de **uma** delas. Enquanto esta filha estiver em `TASKS_APPROVED` ela **não** disputa; no `advance BUILD_AUTHORIZED` (ato do **owner**) a colisão nasce em `frontend/`, `backend/src`, `deploy/`, `Makefile` e `docs/*`. As saídas, no vocabulário do próprio portão: (a) `harness pipeline override camada-de-leitura-do-painel "<motivo>"` no build (a mãe já tem 31 overrides scoped logados — padrão conhecido aqui); ou (b) re-scope da mãe (`scope plataforma-dados clear/add`) — que é mudança de governança da mãe, não desta feature. **Não escolhi por ele.** Fica no handoff como a primeira coisa que o `/build` encontra.

---

## 7. Decisões do `/tech-lead` que o owner pode reverter — cada uma custa uma linha

| # | decisão | por quê | custo de reverter |
|---|---|---|---|
| 1 | `T-03.2` e `T-03.4` (catálogo, quarentena) **dependem de `T-03.1`** (ADR do agregado), embora tecnicamente não precisem dela | `D3.0` diz *"dispatch builder **desta fase** é recusado sem ela"* — a fase inteira, não só o agregado. Encodei o que o plano escreveu | apagar `"T-03.1"` de 2 `depends_on` — e o owner ganha catálogo/quarentena antes de 2026-09-11 |
| 2 | Gate de design é task (`T-01.3`), com `frontend-architect` decidindo o mecanismo de estilo dentro dela | `R-E` + `[L1]`: microcopy e mecanismo são decisões com artefato e veredito; sem task, ficam "dentro de `T-01.4`" e o gate vira opcional | fundir em `T-01.4` (perde o veredito registrado em `gates/F1-design.md` como DoD próprio) |
| 3 | Testes distribuídos nas tasks que medem (itens `2.9`/`3.8` do plano **não** viraram task) | `R-B`: DoD sem coluna "servidor ausente" não é DoD; task "testes" ao final é onde a coluna se perde | criar `T-02.8`/`T-03.9` "testes" — desaconselho |
| 4 | `T-01.10` (`docs`) existe | duas ADRs dizem `proposto` e a SPEC diz `DRAFT` com o ledger em `SPEC_APPROVED`; sem task, o resíduo fica para sempre | apagar a task; o resíduo fica |
| 5 | `uncarded` sem `local_only` (§5) | vocabulário do gate + precedente da mãe | escrever `local_only` nas 25 — **desaconselho por escrito**: mente sobre a intenção do owner |
| 6 | `T-01.1` carrega `--conditions=react-server` nos scripts de teste | `F-028-7`: é o **custo de `D2`**, medido pelo `quant-architect`; separá-lo deixa `test:s1` vermelho entre duas tasks | mover para `T-01.2` (aceita 1 commit com `test:s1` vermelho) |

---

## 8. O que esta narrativa NÃO faz

Não cria UV (é do `/pm`) · não escreve código · não implanta · não decide M1–M5 nem `[Q1]`–`[Q11]` (a leitura de M1–M5 é a do ledger) · não renomeia `/painel`, `janela_de_perda`, eventos de log · não toca `harness.toml` nem `CLAUDE.md` (`[GAP G1]` é do owner) · não repete `dispatch tech-lead` · **não commita** — a PR e o merge são o passo seguinte da fala do owner, feitos por ele.
