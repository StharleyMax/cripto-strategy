# REVISAO-FB — camada de API/consumidora, lado servidor da comunicação front↔back

**Revisor:** `infra-architect` (componente `infra`, `ADR-009/D6.5`) · **Data:** 2026-09-04 ·
**Insumos:** `handoff/revisao-comunicacao-front-back-2026-09-04.md`, `handoff/lacunas-leitura-api-painel.md` ·
**Superfície julgada:** `backend/src/api/`, `backend/src/main/`, `deploy/`, topologia dev/prod ·
**Ato:** revisão. Nenhum código de produção alterado, nenhum `approve`/`advance`, nenhum commit.
Todo processo que subi foi morto (`pgrep -f "uvicorn src.main:app --host 127.0.0.1 --port 53455" | wc -l` → `0`).

## Veredito em uma linha

A camada consumidora existe, está no lugar certo (`src.main` → `src.api` → `use_cases`, fora do bounded
context) e é **corretamente magra** — mas **não é alcançável por nada**: nenhum lugar do repositório
define `INGEST_HEALTH_API_BASE_URL`, não há alvo de `make`, `.env.example`, ingress ou compose para a
API, e o único sinal que a API dá sobre um store mal apontado é **`200 {"n_runs":0}`** — o `rc=0`
ambíguo de `ADR-012`, agora em HTTP. O que falta antes de qualquer rota nova é **topologia e
readiness**, não rota.

## 0 · O que existe, medido de novo hoje

| fato | comando | resultado | força |
|---|---|---|---|
| rotas HTTP | `curl -s 127.0.0.1:$PORT/openapi.json \| python3 -c '…sorted(d["paths"])'` | `['/ingest-health']`, versão OpenAPI `0.1.0` (default do FastAPI, não declarada) | `[MEDIDO]` |
| dependências injetadas | `grep -c '^def ' backend/src/api/dependencies.py` | `1` (`get_ingest_record_source`, que **levanta** `NotImplementedError` sem override — `dependencies.py:29`) | `[MEDIDO]` |
| CORS / SSE / health / readiness / versão | `grep -rnEi 'CORSMiddleware\|StreamingResponse\|EventSourceResponse\|sse_starlette\|text/event-stream\|/health\|/ready\|readiness\|/version\|prefix="/v' backend/src --include='*.py'` | **1 linha, e é falso positivo**: `quota_bucket.py:109 path_prefix="/v1/"` é o prefixo da Coinalyze, não nosso | `[MEDIDO, n=1]` |
| `ETag` (`ADR-005/D6.3`) | `curl -D - -o /dev/null http://127.0.0.1:$PORT/ingest-health \| grep -i etag` | **nenhum** — só `content-type: application/json` | `[MEDIDO]` |
| preflight CORS | `curl -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: GET' …/ingest-health` | `405 Method Not Allowed`, zero header `access-control-*` | `[MEDIDO]` |
| `GET /health` | `curl …/health` | `404 {"detail":"Not Found"}` | `[MEDIDO]` |
| composição | `backend/src/main/__init__.py:48-52` | `create_app(store_path)` → `include_router` + `dependency_overrides[get_ingest_record_source] = lambda: store`; **zero** middleware | `[DOC]` |
| bind | `backend/src/main/__main__.py:27` | `host="127.0.0.1"`, `port=int(os.environ.get("APP_PORT","8000"))` — loopback é imposto **pelo processo**, não por `deploy/` (o próprio docstring `:24-25` diz isso) | `[DOC]` |
| store default | `backend/src/main/__init__.py:33,38` | `data/md/ingest_health.sqlite3`, override por `INGEST_HEALTH_STORE_PATH` | `[DOC]` |
| store local | `find . -name '*.sqlite*' -not -path '*/node_modules/*' -not -path '*/.mypy_cache/*'`; `ls data/md` | **0 arquivos**; `data/md` **inexistente** | `[MEDIDO]` |
| `src/jobs` | `ls backend/src/jobs` | **inexistente** — a metade "worker" da camada consumidora ainda não nasceu | `[MEDIDO]` |
| alvo de `make` para a API | `grep -c 'src.main' Makefile` | `0` | `[MEDIDO]` |
| `INGEST_HEALTH_API_BASE_URL` definida fora do módulo TS | `grep -rn INGEST_HEALTH_API_BASE_URL . \| grep -v node_modules \| grep -vE 'ingest-health-query\.ts\|\.test\.ts'` | **0 arquivos de configuração**; só 3 docs (`gates/T-05.14-*.md`, `ADR-019:102`) | `[MEDIDO]` |
| `.env` do front / `.env.example` | `ls -a frontend \| grep -Ei '^\.env'`; `find . -name '*.env.example' -not -path '*/node_modules/*'` | **nenhum** | `[MEDIDO]` |
| `route.ts` (BFF) no Next | `find frontend/src/app -name route.ts \| wc -l` | `0` — coerente com `A4` (BFF recusado) | `[MEDIDO]` |
| portas em escuta | `ss -ltn \| grep -E ':(3000\|8000\|8001\|8010)\b'` | só `*:3000` (Next dev do owner, **em todas as interfaces**); nenhuma API | `[MEDIDO]` |
| `deploy/` | `find deploy -type f \| wc -l`; `git log --format='%h %ad %s' --date=short -- deploy backend/src/api backend/src/main` | **1 arquivo** (`deploy/compose.yml`, só Postgres); 2 commits (`02149f4` 2026-09-03, `253757c` 2026-09-04) | `[MEDIDO]` |

## 1 · O que falta estruturalmente para o `/painel` consumir os 6 recursos — e em que ordem

### 1.1 Pré-condições que valem para os seis (nenhuma é rota)

| # | lacuna | evidência | quem |
|---|---|---|---|
| P0 | **Alcançabilidade**: o cliente TS exige `INGEST_HEALTH_API_BASE_URL` e **lança** se ausente (`ingest-health-query.ts:480-489`); nada no repositório a define; não há `make api`, `.env.example`, compose ou ingress para o processo `src.main` | tabela §0, linhas 11–13 | **infra** (este documento, §3) |
| P1 | **Readiness que discrimina store**: hoje "store nunca configurado", "diretório errado", "coletor nunca rodou" e "0 byte" dão o **mesmo `200`** (§2) | §2 | **infra** (rota `/ready` é camada consumidora) |
| P2 | **`ETag`** de `ADR-005/D6.3` não é emitida (§0, linha 4). O `fingerprint` já existe no domínio (`IngestHealthReport.fingerprint()`, `ADR-019/D3`); falta o header — **1 linha no handler**, mas o handler é meu e o valor é do domínio | §0 | **infra** emite; **quant-architect** dono do valor |
| P3 | **Prefixo/versão de URL**: OpenAPI `0.1.0` por omissão; nenhum `/api` ou `/v1`. Custa 1 rota hoje e é monotonicamente mais caro (mesma classe da linha 12 do `CLAUDE.md`) — e um prefixo `/api/*` é **o que permite roteamento same-origin no ingress** (§3) sem CORS | §0 | **owner** decide o segmento; infra propõe `/api/v1` |
| P4 | **CORS**: **não recomendo `CORSMiddleware`**. Com `A4` (Next server-side lê a API; `INGEST_HEALTH_API_BASE_URL` é server-only por `ADR-019/D4`) e ingress same-origin (§3), CORS é desnecessário no histórico. Só a **borda direita** (SSE, browser → servidor) precisa de origem resolvida — e same-origin por proxy resolve isso sem middleware | `ADR-005/D1`, `decisoes-do-owner.md:672-682` | **infra** (topologia) + **frontend-architect** (quem abre o `EventSource`) |
| P5 | **SSE**: zero código servidor (§0). `uvicorn` bare serve `StreamingResponse` sem dependência nova; o custo real é de **ingress** (proxy não pode bufferizar `text/event-stream`) e de **processo** (conexões longas × workers). Só é necessário para `#6`/`AO VIVO` | `ADR-005/D1` | **infra** transporta; **quant-architect** envelope |

### 1.2 A tabela de custo do handoff, linha a linha — confirmada ou refutada com comando

| # | recurso | veredito sobre a linha do handoff | comando / evidência |
|---|---|---|---|
| 5 | `GapMarkerRow` — "zero backend novo, só fiação" | **CONFIRMADO com ressalva**: endpoint + cliente existem; mas "fiação" inclui **P0** — sem `INGEST_HEALTH_API_BASE_URL` o cliente lança, e nada a define. O "zero backend novo" é verdadeiro; o "só ligar" esconde topologia | `grep -rn INGEST_HEALTH_API_BASE_URL …` → 0 config `[MEDIDO]`; `ingest-health-query.ts:480-489` `[DOC]` |
| 4a | `CatalogRow.entry` — "onde as linhas vivem precisa ser conferido" | **RESPONDIDO: vivem em CÓDIGO, como constantes de domínio** — 7 instanciações de `SeriesCatalogEntry(` em 3 módulos: `cvd_source_catalog.py` (3), `open_interest_catalog.py` (2), `price_source_catalog.py` (2). Nenhum store, nenhum arquivo. Uma rota `GET` é **projeção pura, zero I/O, zero pegada em disco** — é o **2º mais barato**, não a quarentena | `grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' \| grep -v test \| cut -d: -f1 \| sort \| uniq -c` `[MEDIDO, n=7]`; `grep -rnEi 'catalog.*store\|catalog.*sqlite' backend/src \| grep -v test` → só 2 comentários em `series_key.py` `[MEDIDO]` |
| 4b | `QuarantineTerms` — "só falta uma rota GET sobre tabela que já tem dado real" | **REFUTADO em 3 pontos**: (i) o store só lê **por chave** — `read_promoted(series_kind, binance_symbol)` e `read_latest(…)` (`sqlite_series_quarantine_store.py:154,164`); **não há `list`/`iter`** — uma rota de catálogo precisa de método novo (dentro de `sentimento/infra`, dono `quant-architect`); (ii) o **caminho do store é `argv`** sem default e sem doc — `coinalyze_one_shot_cli.py:166,169`, `liquidation_reconciliation_cli.py:112,120`; `grep -rnoE '[^ ]*quarantine[^ ]*\.sqlite3?' docs backend/src` → **0**; `src.main` precisaria de uma **segunda** env var de store; (iii) **"dado real" não é mensurável aqui**: 0 `*.sqlite*` no disco local. Continua barato, mas é "método + env var + DI stub + rota", não "só rota" | `[MEDIDO]` os três |
| 4c | `Completeness` — "não existe cálculo" | **CONFIRMADO** (fora do meu julgamento; dono `quant-architect`) | — |
| 1 | `CollectorRow` — "agregação sobre dado que já existe" | **CONFIRMADO**, e **custo de infra zero**: lê o mesmo store de `/ingest-health` pela mesma porta injetada. Onde mora a fórmula (`janela_de_perda`) é do `quant-architect` | `dependencies.py:20` — mesma `IngestRecordSource` `[DOC]` |
| 3 | `ReconnectionEvent` — "log persistido novo" | **CONFIRMADO, e é o primeiro que OCUPA DISCO**: um log append-only de eventos de transporte precisa de **teto de retenção declarado antes de nascer** (premissa de disco). Em prod mora no Postgres (`ADR-002`), não em arquivo solto na VPS; pegada: `[NÃO SEI]` até definir cardinalidade (reconexões/dia) — proponho teto por linhas, não por dias | `premissas-de-infra-e-stack.md`; `ADR-002` |
| 2 | `StorageBudgetLine` — "nada, do zero" | **PARCIALMENTE REFUTADO — a primitiva de medição já existe e é minha**: em prod é `pg_total_relation_size(...)` por tabela (1 consulta de catálogo, zero armazenamento novo); em dev é `Path.stat().st_size` do SQLite. O que falta é **atribuição por `source`** (depende de tabela-por-fonte ou coluna `source` — `[NÃO SEI]`, decide o schema de `ADR-002`) e o "GB/**dia**" (derivada, exige 2 leituras no tempo → 1 linha por dia por fonte, pegada desprezível se com teto). É **mais barato que o handoff diz**, mas exige adapter duplo (Postgres/SQLite) | `[INFERRED: `pg_total_relation_size` é função de catálogo padrão do Postgres 15]` |
| 6 | `RawDataRow` — "maior; reusar `ADR-005`" | **CONFIRMADO**. Do meu lado: é o único que **obriga** P5 (SSE) se incluir `AO VIVO`; o histórico endereçável por conteúdo pede **cache por `ETag`** no ingress — sem P2 não há o que cachear | `ADR-005/D1` `[DOC]` |

### 1.3 Ordem que recomendo (infra), com o custo de cada passo declarado

`P0 (topologia + env) → P1 (/ready) → 5 → 4a (catálogo, constantes) → P2 (ETag) → 1 → 4b (quarentena) → P3/P4 decisão de prefixo/same-origin → 2 → 3 → P5 + 6`

Pegada de tudo até `4b`: **zero byte novo em disco**, **zero container**, **zero processo** — são rotas
sobre o processo que `ADR-027` já contabiliza em **40,8 MB RSS** (`ADR-027:62`, `[DOC]`). O primeiro
byte de armazenamento novo aparece em `2` (1 linha/dia/fonte) e o primeiro sem teto natural em `3`.

## 2 · Comportamento sobre store ausente/vazio — medido, e o veredito

Experimento (`backend/`, `.venv/bin/uvicorn src.main:app --host 127.0.0.1 --port 53455 --log-level warning`, porta livre obtida por `socket.bind(("127.0.0.1",0))`):

```
INGEST_HEALTH_STORE_PATH=<scratch>/nao-existe/ingest_health.sqlite3   # diretório-pai INEXISTENTE
GET /ingest-health → HTTP 200  {"query":"ingest_health_query","n_runs":0,"n_gaps":0,"runs":[],"gaps":[]}
  (nenhum arquivo/diretório criado — a leitura não cria o store)
INGEST_HEALTH_STORE_PATH=<scratch>/vazio.sqlite3                      # arquivo de 0 byte
GET /ingest-health → HTTP 200  {"query":"ingest_health_query","n_runs":0,"n_gaps":0,"runs":[],"gaps":[]}
GET /health        → HTTP 404  {"detail":"Not Found"}
OPTIONS /ingest-health (Origin :3000) → HTTP 405, sem access-control-*
```
`[MEDIDO 2026-09-04, n=2 estados de store × 1 rota]`. Log do uvicorn: vazio (`--log-level warning`).

**Por que o `200` vazio é deliberado, e onde ele para de ser defensável.** `_fetch`
(`sqlite_ingest_record_store.py:249-287`) trata *arquivo ausente* e *arquivo sem schema* como "zero
runs" **por decisão medida** (`/qa` 2026-08-29: 6 de 40 SIGKILLs deixam arquivo de 0 byte) e recusa
`except` genérico para que **corrupção propague** — isso é correto para o **registro F0** e não é meu
reabrir. O defeito é **um nível acima**: a **API** herda a semântica do store e passa a dizer `200`
também para **"caminho errado"** — o caso `nao-existe/` acima, em que o **diretório-pai não existe**,
que não é "coletor nunca rodou", é **misconfiguração**. É exatamente a ambiguidade de `ADR-012:25-33`
(`rc=0`, 0 byte, "declarado e vazio" × "nunca declarado"), em HTTP.

**Veredito: nem "falha explícita" nem "200 vazio" sozinhos — separar por estado, no lugar certo:**

| estado | discriminador | comportamento proposto | dono |
|---|---|---|---|
| pai do `store_path` **não existe** | `Path(store_path).parent.exists()` → `False` | **falha no `create_app`** (composição, `src.main`): processo não sobe. Misconfig não vira dado | infra |
| arquivo ausente / 0 byte / sem tabela | `_fetch` já separa via `sqlite_master` | `/ingest-health` **continua `200` com `n_runs:0`** (contrato `D6.1` intocado), **e** `GET /ready` devolve `{"store":{"path":…,"exists":bool,"schema_present":bool}}` com `200`/`503` | infra |
| corrompido | `DatabaseError` propaga | `500` — hoje já é assim (`_fetch` não engole) | já feito |
| opcional: bloco `source_state` **no envelope, fora de `runs[]`** | `ADR-005/F-D6-2`: campo novo **no envelope** não move o `sha256` — é permitido por construção | só se o `quant-architect` aceitar: `to_envelope()` é dele | quant-architect |

O que **não** proponho: `404`/`503` em `/ingest-health` para store vazio — quebra o cliente TS que
já valida o envelope (`T-05.14`) e mistura "sem dado" com "sem serviço".

## 3 · Topologia dev/prod — como front e API se encontram hoje: **não se encontram**

| pergunta | resposta | evidência |
|---|---|---|
| variável de ambiente que o front lê | `INGEST_HEALTH_API_BASE_URL`, **server-only**, nunca `NEXT_PUBLIC_*` | `ingest-health-query.ts:463-489`; `ADR-019/D4` `[DOC]` |
| onde ela é definida | **em lugar nenhum** | `grep -rn` §0 linha 11 `[MEDIDO, n=0]` |
| porta/bind da API | `127.0.0.1:${APP_PORT:-8000}` | `__main__.py:27` `[DOC]` |
| como subir a API | só `python -m src.main` ou `uvicorn src.main:app`, ambos **fora do `Makefile`** | `grep -c 'src.main' Makefile` → 0 `[MEDIDO]` |
| `deploy/` | 1 arquivo, só Postgres, **sem serviço para `src.main`**, sem Caddy, sem Next | `deploy/compose.yml:18-35` `[DOC]` |
| ingress em prod | **`[NÃO SEI]` para este projeto.** O vizinho tem Caddy (`caddy:2-alpine`, TLS, `${PUBLIC_HOST}`) e expõe o stack publicamente | `premissas-de-infra-e-stack.md:44,46` `[DOC]` |
| Next em dev | `*:3000`, **todas as interfaces** (processo do owner) | `ss -ltn` `[MEDIDO]` |
| BFF / Route Handler | recusado por `A4` (*"reabre a porta de segunda verdade"*); Next "proxia sessão/auth apenas" | `decisoes-do-owner.md:672-682` `[DECISÃO-OWNER: 2026-09-03]` |

**Proposta (candidata a `ADR`, não decisão minha ainda), com pegada:**

- **dev:** `.env.example` versionado com `APP_PORT=8000` e `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`,
  alvo `make api` (`poetry run python -m src.main`), Next lê a var **server-side** (já é assim). Pegada: 0.
- **prod (VPS compartilhada, 6 serviços):** `src.main` como **1 serviço** em `deploy/compose.yml`
  (mesma imagem Python dos coletores/escritor de `ADR-027`, `restart: unless-stopped`, porta **só em
  rede interna do compose**, nunca publicada). Ingress **same-origin por caminho** (`/api/*` → `api:8000`,
  resto → Next), o que **elimina CORS** e serve SSE sem middleware. Pegada: **~41 MB RSS** (`ADR-027:62`),
  **0 byte de disco além de log com teto** (`max-size: 10m × max-file: 3` = 30 MB, `ADR-027:69`).
  ⚠️ A pergunta que **só o owner responde**: o ingress é **o Caddy do vizinho** (0 container novo,
  mas edita config de outro projeto) **ou um Caddy próprio** (+1 container, ~10–15 MB RSS `[INFERRED:
  caddy:2-alpine idle]`). Decidir isso é `1.14`/`ADR-009/D5`, não esta revisão.
- **O que recuso propor:** `CORSMiddleware` com `allow_origins=["*"]` para "destravar" o painel —
  troca uma decisão de topologia por um buraco permanente; e `NEXT_PUBLIC_INGEST_HEALTH_API_BASE_URL`,
  que `ADR-019/D4` proíbe por escrito.

## 4 · Quarentena e catálogo — onde as linhas vivem e o custo real de um `GET`

| | catálogo (`series_catalog.py`) | quarentena (`sqlite_series_quarantine_store.py`) |
|---|---|---|
| onde as linhas vivem | **em código**: 7 `SeriesCatalogEntry(` constantes em 3 módulos de `domain/` `[MEDIDO, n=7]` | tabela `series_quarantine` (13 colunas, PK `(source, series_kind, binance_symbol)`, `:35-50`), em arquivo SQLite cujo **caminho é `argv[1]` do CLI** — sem default, sem doc `[MEDIDO]` |
| dado presente localmente | sim (é código) | **não**: 0 `*.sqlite*` no repositório `[MEDIDO]` |
| leitura existente | nenhuma função agregadora (cada módulo exporta as suas) | `read_promoted(kind, symbol)`, `read_latest(kind, symbol)` — **por chave, sem listagem** `[MEDIDO :154,164]` |
| custo real de `GET` | **use case de 1 função** que concatena as 7 (dono `quant-architect`) + DI stub + rota: **0 I/O, 0 disco, 0 env var** | método `list_all()`/porta nova em `infra/` (quant-architect) + **2ª env var** de store em `src.main` + DI stub + rota; `points_json` pode ser grande — a rota **não deve devolver `points_json`** por padrão (pegada de resposta `[NÃO SEI]` sem arquivo para medir) |
| pegada | 0 | 0 novo (lê o que o CLI já escreve); onde esse arquivo mora em prod é **decisão pendente** — se prod é só Postgres (`ADR-002`), a quarentena em SQLite é **dívida de motor**, não minha reabrir |

## 5 · O que NÃO é meu, com dono nomeado

- **Forma do envelope, `to_envelope()`, fingerprint, fórmula de `janela_de_perda`/resiliência, `Completeness`, agregação de `IngestRun`, método `list` na quarentena, reuso de `ADR-005` para `RawDataRow`** → `quant-architect`.
- **`/painel` ligar ao cliente em vez de fixtures, `use client`, `EventSource`, `history-transport.ts`/`live-transport.ts`, base URL no lado Next** → `frontend-architect`.
- **Estados vazios/erro na tela** (o que o usuário vê quando a API responde `n_runs:0` ou `503`) → `design_gate` (`ux-ui-mastery`).
- **Motor de armazenamento** (quarentena em SQLite × Postgres em prod, colunar) → `ADR-002`.
- **Segmento de URL (`/api/v1`), ingress compartilhado × próprio, qualquer container novo** → `owner`.

## 6 · O sinal do meu próprio rótulo — dito em voz alta

`find deploy -type f | wc -l` → **1** `[MEDIDO 2026-09-04]`, o mesmo 1 de `02149f4` (2026-09-03). É o
sinal que `ADR-009/F-D6-5b` e `01_governanca_gateante.md:186` mandam observar. Ele ainda **não** é
falsificador disparado — a cláusula é *"depois da fase que construir o deploy de verdade"*, e essa fase
não existe. Mas **esta revisão inteira aponta para `deploy/` como a lacuna P0**, e se a decisão que
nascer dela criar rotas sem criar serviço/ingress, o contador fica em 1 e `infra` terá rotulado só API.
Quem lê isto daqui a uma fase deve rodar o comando antes de acreditar no rótulo.

## 7 · Reprodução

```bash
cd backend && PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
INGEST_HEALTH_STORE_PATH=/tmp/x/nao-existe.sqlite3 .venv/bin/uvicorn src.main:app --host 127.0.0.1 --port $PORT --log-level warning &
curl -s --retry 15 --retry-connrefused --retry-delay 1 -w '\nHTTP %{http_code}\n' http://127.0.0.1:$PORT/ingest-health
curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: GET' http://127.0.0.1:$PORT/ingest-health | head -1
kill %1
```
