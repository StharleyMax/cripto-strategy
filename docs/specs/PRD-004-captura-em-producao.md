# PRD-004 — Captura em produção: coletores 24/7 → fila → escritor único, subindo por `compose` em dois alvos

**Feature:** `captura-em-producao` (**filha** de `plataforma-dados` — `harness pipeline show captura-em-producao` → `init`, `relate`, `dispatch pm` em `2026-09-07T17:38:02-03Z`; `[PREMISSA-OWNER: 2026-09-07]` *"podemos puxar essa de captura em produção em um ladger novo e limpo"*) · **Data:** 2026-09-07 · **Estado do pipeline ao escrever:** `INIT` (`harness pipeline state captura-em-producao` → `INIT`) → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `sentimento` (produtor real, escritor único, registro de run) · `infra` (Dockerfiles, `compose` em dois alvos, Redis dedicado, serviços de vida longa) · `docs`. `web` **não é tocado** — `/collector-status` já existe e o contrato `ADR-030/D5` não muda. `harness policy --key components` → 7 elementos, os três acima incluídos `[MEDIDO 2026-09-07]`.
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` devolve **saída vazia com `rc=0`** e `docs.external_prd_paths` → `[]` ⇒ este PRD **nasce aqui**.
**Insumos lidos (integralmente):** [`handoff/PRD.md`](../context/captura-em-producao/handoff/PRD.md) (60 linhas) · `ADR-027` (144) · `ADR-029` §D1/§"NÃO decide" · `ADR-002` §D1 + emenda 2026-08-29 · `ADR-014` §D1e · `ADR-030` §D5 · `tasks_review-T-07.15-a-17-fiacao-producao.md` §3 · `tasks-candidatas-fiacao-producao.md` · `proposta-topologia-ingest.md` · `tasks.toml` da mãe (`T-07.15/16/17`, `:1204-1252`) · `deploy/compose.yml` (95) · `backend/src/main/__init__.py` · `redis_stream_bus.py:1-60` · `redis_series_write_queue.py:1-30` · `force_order_collector_cli.py:1-40` · `premium_index_probe_cli.py:1-30` · `collector_status.py` (use case) · PR #159 (`confirmacao-sem-captura-real-2026-09-07.md`, **branch não mergeada** `origin/docs/confirmacao-sem-captura-real-2026-09-07`, 1 commit `4abe7d8`). **Não lido:** `.env.example` — **leitura negada pela sandbox desta sessão** (padrão `.env`); todo nome de variável citado aqui vem de `deploy/compose.yml`, não do `.env.example` `[NÃO MEDIDO]`.
**Rev de ancoragem de TODA medição deste documento:** **`master@0acf947`** (`git rev-parse --short HEAD`).
**Tracker:** `harness policy --key tracker` → `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}`. **O MCP `atlassian` local está autenticado nesta sessão** — usado **só para leitura** (2 chamadas `jira_get_issue`: `CST-109`, `CST-112`, §1.4). **Nada foi criado, editado ou comentado no tracker** — unidade de valor é ato posterior à validação do arquiteto (`commands/pm.md`), e task é do `/tech-lead`. Candidatas em §6.
**Ledger:** `INIT` antes. **Um único ato deste documento: `harness pipeline advance captura-em-producao PRD_DRAFT`** depois de gravado o arquivo (§17). Nenhum `approve`, `dispatch` ou `scope`.
**Glossário:** `harness policy --key glossary_doc` → **saída vazia, `rc=0`** `[MEDIDO 2026-09-07]` — dívida `ADR-013/D4` continua; termos usados definidos em §9.

---

## 0. Como ler este documento

1. **Este PRD é sobre fiação, não sobre lógica.** A fila (`T-07.4`), o escritor único (`T-07.5`) e os dois coletores 24/7 (`T-03.2`, `T-03.3`, `T-03.7`) estão `done` e testados. **Nenhum deles está ligado ao outro em produção** (§1.2). O que este PRD entrega é a ligação e o meio de subi-la — em `deploy/` **e** na máquina do dev.
2. **O requisito não negociável é o `compose` em dois alvos** (`[PREMISSA-OWNER: 2026-09-07]` §1.1). Ele é `RF-8`/`RF-9`, tem fase própria (F3) e três critérios executáveis (`CA-F3-1..3`). **A forma da distinção deploy × local** (override, profile, arquivo por ambiente) **é do `/architect`**, não deste PRD (`[Q7]`).
3. **O critério ponta a ponta mais barato é `/collector-status` mostrar linhas reais** — e ele tem uma **pré-condição que o handoff não nomeou**: hoje **nenhum dos dois coletores 24/7 grava `md.ingest_run`** (§1.2 l.7). A rota lê `IngestRecordSource.runs()`; a linha única que existe vem do probe NTP. Sem `RF-4`, ligar coletor → fila → Postgres deixa `/collector-status` **exatamente como está**. Isso é um `[GAP G2]` com dono, não um `[INFERRED]`.
4. **Herda sem reabrir** (§3): `ADR-027/D1` (3 processos de vida longa) e `D2` (Redis dedicado), `ADR-009/D2` (Streams), `ADR-002` (motor), `ADR-029/D1` (Caddy estruturado, não implantado), premissas de recurso. **Onde o repositório diverge da ADR que herda, o PRD aponta e não corrige** (`postgres:16-alpine` × `postgres:15`, §13 `[GAP G3]`).
5. **O owner não estava disponível.** Nenhuma pergunta bloqueante foi feita; o que precisa dele está em §14 (menu, com custo) ou §15 (perguntas, com dono). `[NÃO SEI]` aparece **sete** vezes e nenhuma virou `[INFERRED]`.

---

## 1. Contexto e problema

### 1.1 O pedido, literal

> *"ta, podemos puxar essa de captura em produção em um ladger novo e limpo, como sugeriu. Único ponto é q tem q ter os composer para build em deploy e local."*
> `[PREMISSA-OWNER: 2026-09-07]` — a única frase do owner com este rótulo neste documento.

Leitura adotada pelo coordenador do despacho e **adotada aqui** `[INFERRED I-1]`: *"composer para build em deploy e local"* = `docker compose build` **e** `docker compose up` funcionando em **dois alvos** — `deploy/` (VPS) e local (máquina do dev) — com as **imagens construídas**, não só o YAML validado.

### 1.2 O que está medido — a captura hoje, em `0acf947`

| # | fato | comando | resultado | rótulo |
|---|---|---|---|---|
| 1 | arquivos de `backend/src` que importam `redis` | `grep -rl 'import redis\|from redis' backend/src \| wc -l` | **0** | `[MEDIDO 2026-09-07]` |
| 2 | entrypoint de produção do escritor único | `find backend/src -iname 'single_writer_cli*' \| wc -l` | **0** | `[MEDIDO 2026-09-07]` |
| 3 | produtores reais do Stream | `redis_series_write_queue.py:4-7` — *"no producer publishes onto this stream yet"* | **0** | `[DOC]` |
| 4 | serviços em `deploy/compose.yml` | `grep -nE '^\s{2}[a-z_-]+:$' deploy/compose.yml` | **4** — `postgres`, `api`, `web`, `caddy` (+3 volumes); **nenhum `redis`, nenhum escritor, nenhum coletor** | `[MEDIDO 2026-09-07]` |
| 5 | **Dockerfile para os `build:` declarados** | `ls backend/Dockerfile frontend/Dockerfile` | **ambos ausentes** — `api` e `web` têm `build: context: ../backend` / `../frontend` **sem Dockerfile** ⇒ `docker compose build` **falha por construção** hoje | `[MEDIDO 2026-09-07]` |
| 6 | `config` do compose sem `.env` | `cd deploy && docker compose -f compose.yml config -q` | *"required variable POSTGRES_PASSWORD is missing a value"* (interpolação `:?`) — validar exige `.env` presente | `[MEDIDO 2026-09-07; rc mascarado pelo pipe]` |
| 7 | **quem grava `md.ingest_run` hoje** | `grep -rln SqliteIngestRecordStore backend/src` → 9 arquivos; os CLIs entre eles: `ingest_health_cli`, `clock_skew_tolerance_cli`, `ntp_skew_probe_cli`. E `grep -nE 'IngestRun\|ingest_run' force_order_collector_cli.py reconnect_force_order_stream.py collect_premium_index.py` | **0** — os dois coletores 24/7 **não registram run** | `[MEDIDO 2026-09-07]` |
| 8 | store que a API lê | `backend/src/main/__init__.py:45,50,144` | `SqliteIngestRecordStore(INGEST_HEALTH_STORE_PATH)`, default `data/md/ingest_health.sqlite3`; **única** implementação de `IngestRecordSource` (`grep -rn 'class .*RecordStore' backend/src` → 1) | `[MEDIDO 2026-09-07]` |
| 9 | `api` em compose monta esse store? | `grep -n 'volumes' deploy/compose.yml` sob `api:` | **não** — dentro do container o SQLite é efêmero e vazio; o `postgres` do compose **não é lido pela API** | `[MEDIDO 2026-09-07]` |
| 10 | gatilho `G-A` de `ADR-014/D1e` (dependência de Postgres entra) | `grep -nE 'psycopg\|asyncpg\|sqlalchemy' backend/pyproject.toml` | **linha 64: `psycopg[binary] (==3.3.5)`** ⇒ **disparado** | `[MEDIDO 2026-09-07]` |
| 11 | versão do Postgres | `grep -rnoE 'postgres:1[5-9][a-z-]*' deploy/compose.yml docs/adr/ADR-002-*.md` | compose: `postgres:16-alpine`; `ADR-002`: `postgres:15` (5 ocorrências); `T-07.16`: *"TimescaleDB/postgres:15"*; **nenhuma imagem TimescaleDB** em compose | `[MEDIDO 2026-09-07]` |
| 12 | arquivos em `deploy/` | `find deploy -type f \| wc -l` | **2** (`compose.yml`, `Caddyfile`) — o DoD 2 de `T-07.17` (*"> 1 pela primeira vez"*) **já está satisfeito por `ADR-029`**, sem esta feature | `[MEDIDO 2026-09-07]` |
| 13 | regra própria sobre o compose | `harness rules --mode file --path deploy/compose.yml` | saída vazia, `rc=0` | `[MEDIDO 2026-09-07]` |
| 14 | Docker local | `docker --version; docker compose version` | `20.10.17` / `v2.19.1` | `[MEDIDO 2026-09-07]` |
| 15 | RSS de referência | `ADR-027:59-65` | Python vazio 10,8 MB · FastAPI 40,8 · 1 CLI 23,2 · Redis client + escritor 14,9 · `redis:7-alpine` 9,6 MiB idle / 39,1 MB imagem | `[DOC: ADR-027, medido 2026-09-04]` |
| 16 | vazão dos dois coletores 24/7 | `grep -rnE 'forceOrder' docs/... \| grep -E '[0-9]+ (eventos\|frames)'` | **0 linhas** — **não há número medido de eventos/min do `!forceOrder@arr`** neste repositório; `premiumIndex` sem `symbol` = **875 símbolos por peso 10** `[DOC: recorte-plataforma.md:195]`, cadência de ciclo **`[NÃO SEI]`** | `[NÃO MEDIDO]` |
| 17 | tasks da mãe não terminais | `grep -nE '^id = \|^status = ' docs/context/plataforma-dados/tasks.toml \| paste - - \| grep -v done` | **8** — 3 `todo` (`T-07.15/16/17`) + 5 `blocked` | `[MEDIDO 2026-09-07]` |
| 18 | regras bloqueantes em vigor | `harness rules list --severity block` | **8** | `[MEDIDO 2026-09-07]` |

### 1.3 O diagnóstico — três ligações ausentes, e a ordem entre elas

**(a) Produtor → fila.** `RedisStreamPublisher` existe (`redis_stream_bus.py:50`) e tem **zero** chamadores de produção (l.3). Os coletores gravam **local**: `force_order_collector_cli.py` escreve *"raw frame enveloped"* em arquivo (`:150-171`) e `premium_index_probe_cli.py` usa `PremiumIndexJsonlSink`. O **schema de wire** (`SeriesRow` → `Mapping[str,str]`, 12 campos, `provenance.py:144-175`) está deliberadamente indefinido e **pertence à task que ligar o primeiro produtor** (`ADR-027/D1`, `redis_series_write_queue.py:7`).

**(b) Fila → Postgres.** `run_single_writer` (`run_single_writer.py:52`) existe e tem exatamente 1 call site de produção guardado por AST (`test_single_writer_call_sites.py`); não há entrypoint (l.2) nem sink real — o único store Postgres do repositório é `backtest/infra/postgres_run_registry_store.py`, de outro módulo.

**(c) Registro → `/collector-status`.** É a ligação que **ninguém nomeou**: a rota agrega `runs()` por `(source, endpoint)` (`ADR-030/D0-D4`); se coletor e escritor não escrevem `IngestRun`, **o painel não muda** com (a)+(b) prontos. E o store desse registro está em **divergência declarada** — `ADR-002/D1` decide Postgres, `ADR-014/D1` mantém SQLite em F0 com **três gatilhos**: `G-A` **já disparou** (l.10); `G-B` (*"um segundo processo passa a ler o registro"*) **dispara com esta feature** — o escritor único e a API são dois processos, em dois containers. **Esta feature é o foro que `ADR-014/D1f` disse que não existia** — a decisão de motor do registro é do `/architect` (§8 `RN-3`, §14 `M2`).

**Ordem:** (a) → (b) → (c) → compose. Compose antes do produtor real é a *"construção especulativa"* que `ADR-027` recusa (`:126`) e que `tasks-candidatas` reafirma (*"compose só depois dos dois primeiros, nunca antes"*).

### 1.4 Verificação no tracker — a referência errada da PR #159

`mcp__atlassian__jira_get_issue` `[MEDIDO 2026-09-07]`: **`CST-109`** = Tarefa *"[infra] 07 · deploy/compose.yml ganha redis:7-alpine…"*, status *Tarefas pendentes*, pai **`CST-5`** (Epic *"F3 · Aquisição em regime + console de coleta"*); **`CST-112`** = **Epic** *"Leitura do painel · F1 · A página diz a verdade"*. Confirma o handoff: a PR #159 cita `CST-112` para `T-07.17` e **está errada** — `tasks.toml:1252` aponta `CST-109`. Este PRD **não edita a PR** (branch de outra sessão); registra em §13 `[GAP G5]`.

---

## 2. Objetivo

**Que os dois coletores 24/7 (`!forceOrder@arr`, `premiumIndex`) capturem dado real de forma contínua, publicando numa fila durável consumida por um escritor único que grava em Postgres — e que essa topologia suba por `docker compose build && up` tanto em `deploy/` quanto na máquina do dev, com `/collector-status` mostrando as séries capturadas.** Em termos verificáveis:

1. Cada coletor 24/7 publica via `RedisStreamPublisher` num Stream com schema de wire documentado e testado por round-trip.
2. Um entrypoint de produção do escritor único consome a fila e grava; matar e reiniciar o escritor **não perde nem duplica** mensagem (`ADR-002/D5`, falsificador `F3` de `ADR-027`).
3. Cada sessão/ciclo de coletor registra um `IngestRun` no store que **a API lê**, e `GET {API_PREFIX}/collector-status` passa de **1** linha para **≥ 3** (`n_rows`), com `source`/`endpoint` reais.
4. `docker compose config -q` e `docker compose build` passam nos **dois alvos**; local sobe **sem** `caddy`; deploy é o `deploy/compose.yml` existente **estendido**, não recriado.
5. Todo processo novo declara pegada (RSS, imagem, teto de log, retenção da fila) **com número e rótulo**; nada ocupa disco sem teto.

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo | onde | efeito aqui |
|---|---|---|---|---|
| D-a | **Três processos de vida longa — coletor (2 streams num processo), escritor único, API; "nada mais vira container permanente"** | `[DOC: ADR-027/D1]`, aprovada pelo owner 2026-09-04 | `ADR-027:74-102` | compose ganha **no máximo 2** serviços de aplicação novos (`collector`, `writer`) + `redis`; coletores one-shot/diários **não** viram serviço (`NG-6`) |
| D-b | **Redis dedicado a este projeto** (`redis:7-alpine` próprio) | `[DECISÃO-OWNER: 2026-09-04, escolha entre alternativas apresentadas]` | `ADR-027/D2` | serviço `redis` em `deploy/compose.yml`; nunca o do `anything_monorepo` |
| D-c | **Streams + consumer group, nunca Pub/Sub** | `[DOC: ADR-009/D2]` | `redis_stream_bus.py:1-17` | `RF-1` usa `XADD`/`XREADGROUP`/`XACK` exclusivamente |
| D-d | **Motor de armazenamento**: série de mercado em TimescaleDB (candidato 4, `D4` decidido por `T-08.1`); catálogo/registro em Postgres (`D1`), SQLite **provisório** em F0 (`ADR-014/D1`) | `[DOC: ADR-002 D1/D4 + emendas]` | `ADR-002:39-47,134-198` | o sink do escritor é Postgres; **o motor do registro é decisão do `/architect` via gatilhos disparados** (`RN-3`) |
| D-e | **Caddy próprio, estruturado, NÃO implantado**; API sem `ports:`; `API_PREFIX` constante única | `[PREMISSA-OWNER: 2026-09-04]` + `[DOC: ADR-029 D1/D2/D5]` | `ADR-029` | a captura **entra ao lado** dos 4 serviços; `NG-1` herda a cláusula *"salvo o owner dizer o contrário"* (`M3`) |
| D-f | **Ler-antes-de-escrever vive no escritor único**: backfill MODELADO nunca sobrescreve captura OBSERVADA | `[DOC: ADR-002/D5; T-07.5]` | `run_single_writer.py` | o entrypoint **não** contorna o predicado (`CA-F2-2`) |
| D-g | **Premissas de recurso**: VPS compartilhada (6 serviços, disco sob pressão), só Postgres, R2 free tier; *"gigas de aggTrades"* morto | `[PREMISSA-OWNER: 2026-09-03]` | `.claude/agents/infra-architect.md:39-48` | `RNF-1..3`; teto declarado por recurso (`RN-5`) |
| D-h | **`/collector-status`: rota, envelope e 4 fórmulas** | `[DOC: ADR-030 D0-D5]` | `ADR-030` | **contrato intocado** — esta feature muda o **dado**, não o envelope (`NG-8`) |
| D-i | **Feature filha, ledger novo** | `[PREMISSA-OWNER: 2026-09-07]` | ledger `relate` | fases `F1`–`F3` próprias; tasks em `docs/context/captura-em-producao/` |
| D-j | **Fila da API de leitura (`ADR-005`) e canal de alarme (`Q3` da mãe)** | fora — `ADR-027` §"NÃO decide" | `ADR-027:137-144` | `NG-7`; esta feature **não desbloqueia** `T-07.11`/`T-09.5` |

---

## 4. Escopo

### 4.1 Os três processos de `ADR-027/D1`, e o que cada um ganha

| processo | hoje | depois desta feature | fase |
|---|---|---|---|
| **(a) coletor** | 2 CLIs de probe, gravação local em arquivo, sem `redis`, sem `IngestRun` | 1 processo de vida longa rodando os 2 streams, publicando via `RedisStreamPublisher`, registrando `IngestRun` por sessão/ciclo | F1 |
| **(b) escritor único** | `run_single_writer` sem entrypoint, sem sink real | `single_writer_cli` consumindo o Stream, sink Postgres, `ack` por mensagem, restart sem perda | F2 |
| **(c) API** | existe (`src.main`), lê SQLite local, `n_rows=1` | **código intocado**; passa a ler o store onde (a)/(b) registram runs — ligação por configuração/adaptador, decisão `RN-3` | F2 (pré-condição do E2E) |
| **compose** | 4 serviços, `build:` sem Dockerfile | + `redis`, `writer`, `collector`; Dockerfiles; alvo local sem `caddy` | F3 |

### 4.2 O que migra da mãe — referência, não cópia

`T-07.15` (`CST-110`) → F1 · `T-07.16` (`CST-111`) → F2 · `T-07.17` (`CST-109`) → F3. **Três correções em relação aos DoDs originais**, para o `/tech-lead` não herdar critério envelhecido: (i) o DoD 2 de `T-07.17` (*"`find deploy -type f | wc -l` > 1"*) **já está satisfeito** (l.12) — substituir por `CA-F3-1..3`; (ii) `T-07.17` diz *"NÃO decide TLS/reverse proxy"* — hoje **já decidido** por `ADR-029`, o serviço `caddy` existe e a captura **não o toca**; (iii) nenhum dos três DoDs exige `IngestRun` dos coletores — `RF-4` acrescenta. **O destino das 3 tasks da mãe é escolha do owner** (`M1`).

---

## 5. User stories — com fronteira por fase

Ordem obrigatória **F1 → F2 → F3** (§1.3). Componente por story; todos em `harness policy --key components`.

### F1 · O coletor publica e se registra — `sentimento`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-1** | Como operador, os dois coletores 24/7 **publicam cada evento/leitura num Redis Stream** em vez de (ou além de) gravar em arquivo local, e o formato no fio está **escrito e testado**. | `force_order_collector_cli`/`reconnect_force_order_stream` e `collect_premium_index` ganham porta de publicação; `encode(SeriesRow) -> Mapping[str,str]` e `decode` inverso, **um módulo**, dono do schema de wire; **decisão dentro da task** (`quant-architect`): gravação local crua desaparece ou fica como redundância até o `ack` | `CA-F1-1..2` |
| **US-2** | Como operador, se o coletor morrer no meio de uma sessão, **nenhuma mensagem já publicada se perde**: ela fica na `PEL` e é lida por `read_pending` após restart. | teste de integração com listener **real** (`fakeredis.TcpFakeServer` já é dev-dep, `pyproject.toml:95`) ou `redis:7-alpine` local; fecha `F3` de `ADR-027` | `CA-F1-3` |
| **US-3** | Como operador, **cada sessão do `forceOrder` e cada ciclo do `premiumIndex` vira uma linha de `md.ingest_run`**, com `source`/`endpoint`/`verdict`/`n_returned`/`started_at`/`ended_at`, para que `/collector-status` tenha o que agregar. | `IngestRun` emitido pela **porta** `IngestRecordSource`-compatível já existente (`SqliteIngestRecordStore` hoje; motor final por `RN-3`); **o que é "um run"** para um stream contínuo é `[Q3]` (`quant-architect`) — proposta `[INFERRED I-3]` em §12 | `CA-F1-4` |

### F2 · O escritor único vira processo de produção — `sentimento` (+ `infra` para configuração)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-4** | Como operador, existe **um comando** que sobe o escritor único consumindo o Stream e gravando em Postgres, com log estruturado por `ack`. | `single_writer_cli.py`; monta `RedisSeriesWriteQueue` com o `decode` de US-1 + sink Postgres; chama `run_single_writer` em loop; **continua sendo o único call site de produção** | `CA-F2-1..2` |
| **US-5** | Como operador, **matar o escritor e reiniciá-lo** com produtor real publicando **não perde e não duplica** nenhuma linha no Postgres. | teste de processo real (subir, publicar N via US-1, `kill`, reiniciar, contar) | `CA-F2-3` |
| **US-6** | Como operador, o escritor **se recusa a subir** sem endereço de Redis ou de Postgres válidos — misconfiguração **não** vira processo "rodando" que nada grava. | fail-fast no boot, mesma doutrina de `ADR-029/D3` (`create_app` recusa store inválido) | `CA-F2-4` |
| **US-7** | Como operador, **a API lê o mesmo registro em que coletor e escritor escrevem** — em compose, dois containers, um registro. | adaptador `IngestRecordSource` para o motor decidido por `RN-3` **ou** volume compartilhado do SQLite — **decisão do `/architect`** com custo em `M2`; `src.main` bind por env | `CA-F2-5` |

### F3 · Sobe por `compose` em dois alvos — `infra`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-8** | Como owner, `docker compose -f deploy/compose.yml config -q` **e** `build` passam, com `redis`, `writer` e `collector` **ao lado** de `postgres`/`api`/`web`/`caddy`. | `backend/Dockerfile` (uma imagem, três `command:`, `ADR-027/D1` *"mesma imagem, comando diferente"*), `frontend/Dockerfile`; `redis:7-alpine` com volume e `--appendonly`/`MAXLEN` conforme `RNF-2`; `logging` com teto em **todo** serviço novo; credencial só por `${VAR}` | `CA-F3-1..2,5,6,7` |
| **US-9** | Como dev, **na minha máquina** um segundo comando de compose sobe **a mesma topologia sem `caddy`/TLS**, com portas locais, e o `/collector-status` responde. | arquivo/perfil local — **forma a decidir pelo `/architect`** (`[Q7]`); reusa os mesmos Dockerfiles; `.env` local documentado | `CA-F3-3..4` |
| **US-10** | Como operador, com a topologia local de pé por ≥ 1 ciclo de cada coletor, **`GET /collector-status` mostra as séries capturadas** — e, com os coletores parados, elas viram `PARADO` pela regra de `ADR-030/D1`, sem que `n_rows` cresça. | **critério ponta a ponta** — nenhum código de `web`; mede a soma F1+F2+F3 | `CA-E2E-1..3` |

---

## 6. Unidades de valor candidatas (para o tracker, DEPOIS da validação do arquiteto)

| UV | título | fases | componente | Epic pai |
|---|---|---|---|---|
| UV-1 | Coletores 24/7 publicam no Stream e registram runs | F1 | `sentimento` | `CST-5` `[INFERRED I-4: `CST-109/110/111` já têm `CST-5` como pai — `jira_get_issue` 2026-09-07; alternativa é Epic próprio da filha — decisão do `/tech-lead`]` |
| UV-2 | Escritor único em produção, sem perda no restart, lendo/escrevendo o registro que a API lê | F2 | `sentimento`, `infra` | idem |
| UV-3 | Topologia de captura sobe por compose em `deploy/` e local | F3 | `infra` | idem |

**Nada disto foi criado.** O MCP está autenticado; a criação é ato posterior ao `approve prd` do `/architect`, e as **tasks** são do `/tech-lead`.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | story |
|---|---|---|
| RF-1 | Os dois coletores 24/7 publicam via `RedisStreamPublisher.publish` (o **único** `XADD` do repositório, `redis_stream_bus.py:10`); nenhum `XADD` fora dele | US-1 |
| RF-2 | Schema de wire: `encode(SeriesRow) -> Mapping[str,str]` e `decode` **num único módulo**, com `decode(encode(row)) == row` para os 4 valores de `Provenance` e os 12 campos de `SeriesRow` (`provenance.py:164-175`) | US-1 |
| RF-3 | Mensagem publicada e não `ack`ada sobrevive à morte do produtor e do consumidor (`PEL` + `read_pending`) | US-2, US-5 |
| RF-4 | Cada sessão/ciclo de coletor grava um `IngestRun` (`ingest_record.py:100`, 15 campos) no registro; `verdict` do conjunto fechado de `SPEC-001 §3.5`; `n_returned` = eventos/leituras da sessão | US-3 |
| RF-5 | `single_writer_cli` é o entrypoint de produção; `test_single_writer_call_sites.py` continua com **exatamente 1** call site | US-4 |
| RF-6 | Sink real em Postgres para `SeriesRow`; o predicado *modelado não sobrescreve observado* fica **no use case**, não no sink | US-4, US-5 |
| RF-7 | Escritor e coletor **recusam subir** sem `REDIS_*`/`POSTGRES_*` resolvíveis (nomes finais do `/architect`); erro nomeia a variável | US-6 |
| RF-8 | `deploy/compose.yml` **estendido** (não recriado) com `redis`, `writer`, `collector`; `backend/Dockerfile` e `frontend/Dockerfile` existem e `build` passa | US-8 |
| RF-9 | Um alvo **local** de compose sobe a mesma topologia **sem `caddy`**, com portas publicadas só localmente; mesma imagem, mesmo `.env.example` como fonte | US-9 |
| RF-10 | A API lê o registro em que coletor/escritor escrevem, em compose (dois containers) — por adaptador Postgres **ou** volume compartilhado (`RN-3`/`M2`) | US-7 |
| RF-11 | Coletores one-shot/diários (`coinalyze_one_shot_cli`, `daily_instrument_universe_snapshot_cli`, …) **não** viram serviço de compose | D-a |

### 7.2 Não-funcionais

| id | requisito | rótulo / medição |
|---|---|---|
| RNF-1 | **Pegada de RAM** dos 3 processos de vida longa + Redis ≤ **~80 MB RSS** somados em idle (40,8 API + 14,9 escritor + ~23 coletor + 9,6 Redis ≈ 88 MB; teto 2× = falsificador `F2` de `ADR-027`) | `[DOC: ADR-027:59-65]`; produção real `[NÃO MEDIDO]` — medir em F3 (`CA-F3-8`) |
| RNF-2 | **Retenção da fila**: Stream com teto declarado (`MAXLEN ~` ou trim por idade) **e** AOF/volume do Redis com tamanho máximo declarado — hoje `grep -rn 'MAXLEN\|maxlen' backend/src` → **0** | `[MEDIDO 2026-09-07]`; valor do teto é `M4` |
| RNF-3 | **Pegada de disco em Postgres por fonte**: `[NÃO SEI]` — depende da vazão do `forceOrder` (l.16, não medida) e da cadência do `premiumIndex` (875 símbolos/ciclo `[DOC]`, cadência `[NÃO SEI]`). Fase F1 **mede** por 24 h antes de F3 dimensionar (`CA-F1-5`) | `[NÃO MEDIDO]` |
| RNF-4 | **Teto de log**: todo serviço novo com `logging: max-size/max-file` (≈ 30 MB/container, padrão herdado de `api`) | `[DOC: deploy/compose.yml:56-59]` |
| RNF-5 | **Imagens**: `postgres:16-alpine` local = 294 MB `[MEDIDO: docker image ls]`; `redis:7-alpine` 39,1 MB `[DOC]`; imagem Python do backend `[NÃO MEDIDO]` — declarar em F3 | |
| RNF-6 | **Frescor do painel**: `/collector-status` reflete um run **≤ 1 ciclo** após o `ack` (leitura direta do registro, sem cache) | `[DOC: ADR-030/D1]` |
| RNF-7 | **Sem segredo em compose ou código**: `own.compose-hardcoded-secret` e `core.hardcoded-secret` `rc=0` em todo arquivo novo | regra em vigor |

---

## 8. Regras de negócio

| id | regra | falsificador |
|---|---|---|
| **RN-1** | **Compose só depois do produtor e do escritor reais** — F3 não começa antes de `CA-F1-*` e `CA-F2-*` verdes | task de F3 `in_progress` com F1/F2 abertas ⇒ `/tech-lead` reprova a ordem |
| **RN-2** | **Um `XADD`, um `decode`**: o schema de wire mora num módulo e é a única fonte para produtor e consumidor | `grep -rn 'XADD' backend/src --include='*.py' \| grep -v redis_stream_bus.py` ≠ 0 ⇒ reprova |
| **RN-3** | **O motor do registro (`md.ingest_run`) é decidido pelo `/architect` nesta feature**, porque `G-A` disparou e `G-B` dispara aqui (`ADR-014/D1e`) — em ADR ou emenda de `ADR-014`, nunca por omissão | F2 fechada com API e escritor apontando para stores **diferentes** ⇒ `CA-E2E-1` reprova por construção |
| **RN-4** | **Fail-fast**: processo de vida longa que não consegue alcançar sua dependência **não sobe** (não fica `Up` sem gravar) | `docker compose ps` mostrando `writer Up` com `REDIS_*` inválido ⇒ reprova |
| **RN-5** | **Nenhum recurso novo sem teto declarado** (fila, AOF, log, tabela) — `D-g` | diff de F3 com volume/tabela nova sem teto no mesmo diff ⇒ reprova |
| **RN-6** | **`/collector-status` muda de dado, não de contrato** — envelope `ADR-030/D5` intocado | diff em `domain/collector_status.py` ou `routes/collector_status.py` ⇒ fora de escopo (`NG-8`) |
| **RN-7** | **Implantar não acontece** nesta feature (herda `ADR-029/D1`), salvo `M3` | `docker compose -f deploy/compose.yml ps` na VPS mostrando `collector` ⇒ escopo violado — **até o owner escolher `M3(b)`** |
| **RN-8** | Mensagem de exceção, evento de log e identificador novos **em inglês** (`CLAUDE.md` linha 1/10 e §mensagem de exceção); vocabulário `sentimento` fica | `/review` do builder |

---

## 9. Tipos e contratos críticos

| contrato | estado | dono | prazo |
|---|---|---|---|
| **Schema de wire** `SeriesRow` ↔ `Mapping[str,str]` (12 campos; `Provenance` 4 valores; ints como decimal ASCII) | **`TBD`** — deliberadamente aberto até o primeiro produtor (`redis_series_write_queue.py:7`) | `quant-architect`, na task de F1 | **F1** |
| Nome do Stream e do consumer group | **`TBD`** | `/architect` (SPEC) | F1 |
| **Definição de "run"** para stream contínuo (`forceOrder`) e para ciclo (`premiumIndex`) — mapeamento para os 15 campos de `IngestRun` | **`TBD`** — `[Q3]`; proposta `I-3` | `quant-architect` | **antes de F1 fechar** |
| Sink Postgres de `SeriesRow` (tabela, partição por `T-07.6`/`T-07.8`, `compaction_epoch`/`content_hash` por `ADR-002/D6c`) | tipos existem; DDL de produção **`TBD`** | `/architect` + `quant-architect` | F2 |
| Adaptador `IngestRecordSource` para Postgres **ou** contrato de volume compartilhado | **`TBD`** — `RN-3`/`M2` | `/architect` (`ADR-014` emenda) | F2 |
| Variáveis de ambiente novas (`REDIS_*`, `POSTGRES_*` já existe, `*_STREAM`, `*_MAXLEN`) | **`TBD`** — nomes em inglês; fonte única `.env.example` | `infra-architect` | F3 |
| Forma da distinção deploy × local (override / profile / arquivo) | **`TBD`** — `[Q7]` | `/architect` | F3 |
| Envelope `collector_status` | **fechado** — `ADR-030/D5` | — | — |

**Termos (na ausência de glossário):** *produtor real* — processo que publica dado observado de exchange no Stream, não fixture; *sessão* — uma conexão WebSocket do `forceOrder` do `connect` ao fechamento; *ciclo* — uma chamada HTTP em lote do `premiumIndex`; *registro* — as tabelas `md.ingest_run`/`md.ingest_gap` que `/collector-status` e `/ingest-health` leem; *alvo de compose* — um conjunto de arquivos `compose*.yml` que sobe em um ambiente (deploy ou local).

---

## 10. Critérios de aceite — testáveis, com o comando e a coluna "morde"

Convenção: **Redis de pé** = `redis:7-alpine` local ou `fakeredis.TcpFakeServer`; **Postgres de pé** = serviço `postgres` do compose local. Coluna **morde** = o que **tem de acontecer** quando a pré-condição falta; se der o mesmo veredito, o CA não mede nada.

### F1

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F1-1 | Os dois coletores publicam via o bus | `grep -c 'RedisStreamPublisher' backend/src/modules/sentimento/infra/force_order_collector_cli.py backend/src/modules/sentimento/use_cases/collect_premium_index.py` (ou o módulo que os compõe) → **≥ 1 cada** (hoje **0**); `grep -rn 'RedisStreamPublisher(' backend/src --include='*.py' \| grep -v redis_stream_bus.py \| wc -l` → **≥ 1** (hoje 0 `[DOC: redis_series_write_queue.py:4]`) | com Redis **no chão**, o coletor **não sobe** (`RN-4`) — se subir e "capturar", repetiu o defeito de hoje |
| CA-F1-2 | Round-trip do wire | `cd backend && .venv/bin/pytest tests/sentimento -k 'wire and round_trip' -q` → passa para **4/4** `Provenance` × **12** campos | mutante que troca a ordem de 2 campos ⇒ **reprova** |
| CA-F1-3 | Mensagem sobrevive à morte do produtor | teste de integração: publicar 10, `kill -9` produtor após a 5ª, subir consumidor, `read_pending` → **5 em `PEL`**, 0 perdidas | com `XREAD` (sem grupo) no lugar de `XREADGROUP` ⇒ **0 em `PEL`** — reprova |
| CA-F1-4 | Sessão/ciclo vira `IngestRun` | rodar 1 sessão curta + 1 ciclo; `sqlite3 $INGEST_HEALTH_STORE_PATH "select source,endpoint,count(*) from ingest_run group by 1,2"` → **≥ 2 pares novos** além de `/fapi/v1/time` (hoje **1 par**) | mesma consulta **antes** de rodar → só `/fapi/v1/time` |
| CA-F1-5 | Vazão medida por 24 h | `XLEN <stream>` e `select count(*) …` em `t` e `t+24h`; resultado em `docs/context/captura-em-producao/medicoes/` com `n` e comando | **fecha `[NÃO MEDIDO]` de `RNF-3`**; sem esse arquivo F3 não dimensiona `M4` |

### F2

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F2-1 | Entrypoint existe e é o único call site | `find backend/src -iname 'single_writer_cli.py' \| wc -l` → **1**; `pytest tests/sentimento/test_single_writer_call_sites.py -q` → passa (**1** call site) | 2º call site plantado ⇒ o teste AST **reprova** |
| CA-F2-2 | Predicado *modelado não sobrescreve observado* preservado pelo entrypoint | publicar 1 linha `OBSERVED` e 1 `MODELED` para a mesma chave; `select provenance from …` → **`OBSERVED`** | entrypoint que chama o sink direto (sem `run_single_writer`) ⇒ `MODELED` vence — reprova |
| CA-F2-3 | Restart sem perda nem duplicata | publicar N=100 via F1 com escritor de pé; `kill -9` a meio; reiniciar; `select count(*)` → **100**; `select count(*) from (select … group by chave having count(*)>1)` → **0** | escritor com `ack` **antes** do commit ⇒ `< 100` — reprova |
| CA-F2-4 | Fail-fast por configuração | `REDIS_HOST=nao-existe python -m src.modules.sentimento.infra.single_writer_cli` → `rc≠0` **em ≤ 5 s**, mensagem nomeia a variável | processo `Up`/bloqueado em retry infinito ⇒ reprova |
| CA-F2-5 | API e escritor leem/escrevem o mesmo registro | em compose local: após `CA-F1-4`, `curl -s http://127.0.0.1:$APP_PORT$API_PREFIX/collector-status \| jq .n_rows` → **≥ 3** (hoje **1**) | `api` apontando para SQLite efêmero do próprio container (estado de hoje, l.9) ⇒ `n_rows` **0 ou 1** — reprova |

### F3

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F3-1 | Deploy valida | `cp .env.example .env` (valores de teste) `&& docker compose -f deploy/compose.yml config -q` → `rc=0` | sem `.env` ⇒ erro de interpolação (l.6) — **é o comportamento desejado**, credencial obrigatória |
| CA-F3-2 | Deploy constrói | `docker compose -f deploy/compose.yml build` → `rc=0`; `ls backend/Dockerfile frontend/Dockerfile` → **2** (hoje **0**) | remover um Dockerfile ⇒ `build` reprova nomeando o serviço |
| CA-F3-3 | Local valida e constrói **sem `caddy`** | `docker compose <alvo local> config --services \| sort` → contém `api web postgres redis writer collector`, **não contém `caddy`**; `build` `rc=0` | `deploy/compose.yml` sozinho ⇒ contém `caddy` — os dois alvos **têm de diferir** nesse serviço |
| CA-F3-4 | Local sobe e responde | `docker compose <alvo local> up -d && sleep 20 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT$API_PREFIX/collector-status` → **200** | `down` ⇒ `000` |
| CA-F3-5 | Deploy ganhou exatamente os serviços de `ADR-027/D1` | `docker compose -f deploy/compose.yml config --services \| sort` → `api caddy collector postgres redis web writer` (**7**; hoje **4**) | serviço para coletor one-shot ⇒ **8** — viola `D-a`/`NG-6` |
| CA-F3-6 | Zero segredo literal | `harness rules --mode file --path <cada compose*.yml e Dockerfile>` → saída vazia, `rc=0` | senha literal plantada ⇒ `own.compose-hardcoded-secret` reprova |
| CA-F3-7 | Teto de log em todo serviço novo | `docker compose -f deploy/compose.yml config \| grep -c 'max-size'` → **≥ 4** (api + 3 novos) | serviço sem `logging` ⇒ contagem menor |
| CA-F3-8 | Pegada medida, não projetada | `docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'` após 10 min de `up` local, registrado em `medicoes/` | soma > **2×** 88 MB ⇒ falsificador `F2` de `ADR-027` **dispara** — escalar ao `/architect` |
| CA-F3-9 | Fila com teto | `docker compose … config \| grep -cE 'MAXLEN\|maxmemory\|appendonly'` → **≥ 1**; `grep -rn 'MAXLEN\|maxlen' backend/src` → **≥ 1** (hoje **0**) | ausente ⇒ `RN-5` reprova |

### Ponta a ponta

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-E2E-1 | **`/collector-status` mostra linhas reais** | alvo local `up` por ≥ 1 sessão + 1 ciclo; `curl … /collector-status \| jq '.n_rows, [.rows[].series]'` → `n_rows ≥ 3`, séries incluem `binance-futures · <endpoint forceOrder>` e `binance-futures · <endpoint premiumIndex>` (endpoints exatos são `[Q3]`) | `docker compose stop collector writer` e repetir ⇒ **`n_rows` igual** (durável, não cresce); após `stale_after_s` (`ADR-030/D1`) ⇒ `status` das séries novas = **`PARADO`** |
| CA-E2E-2 | O dado é **observado**, não fixture | `select count(*) from <tabela série> where provenance='OBSERVED'` → **> 0** e cresce entre duas leituras com coletor de pé | com coletor parado ⇒ **não cresce** |
| CA-E2E-3 | A leitura não mudou de contrato | `git diff --stat <base>..HEAD -- backend/src/api/routes/collector_status.py backend/src/modules/sentimento/domain/collector_status.py frontend/src` → **vazio** | qualquer linha ⇒ `NG-8` violado |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | **Implantar** na VPS (`up` real, DNS, TLS, `caddy` de pé) | herda `ADR-029/D1` *"estruturado, não implantado"* — **salvo o owner escolher `M3(b)`** |
| **NG-2** | Novos coletores além de `forceOrder` e `premiumIndex` | `ADR-027/D1`: só esses dois precisam de disponibilidade contínua |
| **NG-3** | SSE / `AO VIVO` / qualquer mudança em `web` | `PRD-003 NG-4`; esta feature é o lado de **escrita** |
| **NG-4** | Backfill histórico (Coinalyze, OI history) como serviço | são one-shot; `D-a`; `T-07.5` já garante que backfill não sobrescreve observado |
| **NG-5** | Backup com restauração provada | `T-02.4b` `blocked` por `Q1` da mãe; `ADR-027` §NÃO decide |
| **NG-6** | Coletores one-shot/diários como serviço de compose (cron/timer) | `D-a`; `T-07.17` original já excluía |
| **NG-7** | Canal de alarme externo (`Q3` da mãe), `T-07.11`/`T-09.5` | `ADR-027:141-144` — *"esta ADR não desbloqueia"* |
| **NG-8** | Mudar envelope/fórmulas de `/collector-status` ou as 15 colunas de `/ingest-health` | `ADR-030/D5`, `ADR-008/D3` (`sha256`) |
| **NG-9** | Renomear os 4 eventos de log e `janela_de_perda` | `SPEC-002 §6.3`; `CLAUDE.md` linhas 10/11 |
| **NG-10** | Migrar a **série de mercado** para fora do candidato 4 | `ADR-002/D4` decidido por `T-08.1` |
| **NG-11** | Decidir a **forma** da distinção deploy × local | é do `/architect` (`[Q7]`); o PRD exige só o **efeito** (`CA-F3-3`) |

---

## 12. `[INFERRED]` — cinco, com motivo e custo de reversão

| # | inferência | motivo | custo se errada |
|---|---|---|---|
| I-1 | *"composer para build em deploy e local"* = `compose build`+`up` em 2 alvos com imagens construídas | leitura do coordenador, adotada; "build" é verbo do Docker, não de docs | se o owner quis só YAML validado: F3 encolhe (Dockerfiles ficam — `build:` já os exige, l.5) |
| I-2 | O coletor de vida longa é **1 processo com os 2 streams** | `ADR-027/D1` literal; falsificador `F1` daquela ADR cobre a reversão | 2 serviços de compose em vez de 1; `CA-F3-5` vira 8 |
| I-3 | "Run" = **1 sessão WebSocket** para `forceOrder` (do `connect` ao fechamento/reconexão) e **1 ciclo HTTP** para `premiumIndex`; `n_expected` = `n_returned` para stream (não há esperado) | é a unidade que `T-03.3` (reconexão por classe) já delimita; `IngestRun` exige `started_at`/`ended_at` finitos | `quant-architect` redefine em `[Q3]`; custo = o mapeamento de 15 campos, 1 módulo |
| I-4 | Epic pai das UVs = `CST-5` | `CST-109/110/111` têm `CST-5` como pai `[MEDIDO: jira_get_issue]` | `/tech-lead` cria Epic próprio; 0 custo agora |
| I-5 | Teto de RAM de referência = **88 MB** (soma de `ADR-027:59-65` + coletor como "1 CLI") | única tabela medida; `RNF-1` a declara como projeção | `CA-F3-8` mede; se `> 2×`, `ADR-027/F2` dispara e a decisão volta ao `/architect` |

---

## 13. GAPs nomeados por esta rodada

| gap | severidade | dono | ação |
|---|---|---|---|
| `[GAP G1]` `deploy/compose.yml` declara `build:` para `api`/`web` **sem Dockerfile** (l.5) — o compose de `ADR-029` valida por `config -q` mas **nunca construiu** | **alta** para F3 — é o requisito do owner | `infra-architect` | `RF-8`, `CA-F3-2` |
| `[GAP G2]` Coletores 24/7 **não registram `IngestRun`** (l.7) — o critério ponta a ponta do handoff não fecha só com `T-07.15/16/17` | **alta** — sem `RF-4`, `CA-E2E-1` é inalcançável | `quant-architect` (`[Q3]`) | `US-3`, `RF-4` |
| `[GAP G3]` `postgres:16-alpine` em compose × `postgres:15` em `ADR-002` (5×) × *"TimescaleDB/postgres:15"* em `T-07.16`; **nenhuma imagem TimescaleDB** declarada (l.11) | média — sink de F2 precisa saber em qual imagem a extensão existe | `/architect` (`ADR-002`) | `[Q5]` |
| `[GAP G4]` Gatilhos `G-A` (disparado, l.10) e `G-B` (dispara aqui) de `ADR-014/D1e` **sem foro** — `ADR-014/D1f` chama de *"dívida órfã"* | média — decide `RF-10` | `/architect` | `RN-3`, `M2` |
| `[GAP G5]` PR #159 cita `CST-112` (Epic da irmã) para `T-07.17`; correto é `CST-109` (`tasks.toml:1252`, Jira) | baixa (documental, branch não mergeada) | quem mergear #159 | corrigir antes do merge |
| `[GAP G6]` Vazão do `forceOrder` **nunca medida** em eventos/min; cadência do `premiumIndex` não escrita (l.16) | média — `RNF-2/3` e `M4` dependem | `quant-architect` | `CA-F1-5` mede em 24 h |
| `[GAP G7]` DoD 2 de `T-07.17` envelhecido (l.12) e "NÃO decide TLS" superado por `ADR-029` | baixa | `/tech-lead` | §4.2 |
| `[GAP G8]` `.env.example` ilegível nesta sessão (sandbox) — nomes de variável só por `compose.yml` | baixa | `/architect` confere | — |

---

## 14. Menu para o owner — escolhas com o custo de cada opção

Nenhum item bloqueia `PRD_DRAFT` nem a leitura do `/architect`. **`M2` bloqueia a SPEC de F2**; `M1` pode esperar até o `/tech-lead`.

| # | pergunta | opção | custo | proposta `[INFERRED]` |
|---|---|---|---|---|
| **M1** | **Destino de `T-07.15/16/17` (`CST-110/111/109`) na mãe** | **(a)** fechar como `superseded`, `refs` apontando para as tasks da filha; Jira: comentário + transição para *Concluído/Cancelado* | mãe fica com 5 `blocked` e 0 `todo`; histórico preservado; 3 transições no Jira | **(a)** |
| | | (b) **mover** as 3 tasks para `docs/context/captura-em-producao/tasks.toml` mantendo ids e `CST-*` | ids `T-07.x` numa feature com fases `F1-F3` confundem; DoDs envelhecidos (`G7`) migram junto | |
| | | (c) deixar na mãe e a filha só "referencia" | duas verdades sobre a mesma unidade de trabalho — o que `override` na mãe já custa hoje | |
| **M2** | **Motor do registro `md.ingest_run` em produção** (`RN-3`, `G4`) | **(a)** Postgres: adaptador `PostgresIngestRecordStore` implementando `IngestRecordSource`; `src.main` escolhe por env; SQLite continua em dev/teste | 1 adaptador (~1 arquivo + testes); fecha `ADR-002/D1` e `ADR-014/D1e`; `psycopg` já está (l.10) | **(a)** |
| | | (b) SQLite em volume compartilhado entre `writer` e `api` | 0 código; **1 host só** (volume local), escrita concorrente de 2 processos em SQLite sobre volume Docker é frágil; adia a dívida órfã | |
| **M3** | **Implantar de fato na VPS ao fim de F3?** | **(a)** não — estruturado, `CA-F3-*` provam local; herda `ADR-029/D1` | zero risco na VPS compartilhada; captura real só quando o owner subir | **(a)** `[INFERRED: ADR-029 vale até o owner dizer o contrário]` |
| | | (b) sim — `up` de `redis writer collector postgres api` (sem `caddy`) na VPS | **+~90 MB RSS** e disco da fila/Postgres na VPS *"sob pressão"*; exige `M4` e `RNF-3` medidos antes; DNS/TLS continuam fora | |
| **M4** | **Teto da fila Redis** (`RNF-2`) | **(a)** `MAXLEN ~ 100 000` entradas + `appendonly yes` com volume | ordem de **dezenas de MB** `[INFERRED: ~200-500 B/entrada × 1e5]`; perde dado só se o escritor ficar > horas fora — e `PEL` avisa | **(a)** até `CA-F1-5` medir |
| | | (b) sem teto | fila cresce sem limite se o escritor morrer — o cenário exato de `D-g` | |
| | | (c) teto por tempo (`MINID`) | precisa de clock confiável no Redis; `T-03.8` mediu skew — viável, mais complexo | |
| **M5** | **Gravação local crua dos coletores após ligar o Stream** | (a) remover — o Stream + Postgres são a fonte | menos disco; perde o "arquivo cru" que `T-03.2` chamou de evidência | `[NÃO SEI]` — é do `quant-architect` dentro de F1; owner só se quiser opinar sobre disco |
| | | (b) manter como redundância até o `ack` | dobra escrita em disco por evento | |

---

## 15. Perguntas em Aberto — classificadas, com quem decide

| id | pergunta | bloqueia? | decide |
|---|---|---|---|
| **[Q1]** | Qual a vazão real do `!forceOrder@arr` (eventos/min, bytes/evento)? | não para F1; **sim** para dimensionar `M4`/`RNF-3` | `quant-architect` (`CA-F1-5`) |
| **[Q2]** | Cadência do ciclo do `premiumIndex` em produção (peso 10 por ciclo, 2400/min de orçamento) | F1 (constante do coletor) | `quant-architect` |
| **[Q3]** | O que é **um run** para stream contínuo e para ciclo; quais `endpoint` strings entram em `IngestRun` | **F1** — sem isso `RF-4` não fecha | `quant-architect` |
| **[Q4]** | Nomes do Stream, do consumer group e das variáveis de ambiente | F1/F3 | `/architect` (SPEC) |
| **[Q5]** | Imagem do Postgres de produção: `postgres:16-alpine` (compose) × `postgres:15` (`ADR-002`) × TimescaleDB — em qual existe a extensão que o candidato 4 exige? | **F2** | `/architect` (`ADR-002`) |
| **[Q6]** | Como o compose sabe que `writer`/`collector` estão vivos (não expõem HTTP)? `healthcheck` por comando, heartbeat em chave Redis, ou nada além de `restart: unless-stopped`? | F3 | `infra-architect` |
| **[Q7]** | Forma da distinção deploy × local: `compose.override.yml`, `profiles`, ou `compose.local.yml` | F3 | `/architect` |
| **[Q8]** | O `.env` é um só para os dois alvos ou há `.env.local`? | F3 | `infra-architect` |
| **[Q9]** | Quando o owner implantar (`M3(b)` ou depois), quem opera restart/upgrade do Redis dedicado? | não | owner |
| **[Q10]** | O escritor grava `md.ingest_gap` quando detecta lacuna no `forceOrder` (reconexão)? Ou isso é de `T-07.11` (alarme)? | F2 | `quant-architect` |

---

## 16. Registro da varredura de discovery

| dimensão | estado | fonte / gap |
|---|---|---|
| stakeholders e consumidores | `[COBERTO]` operador único (owner); consumidores: `/collector-status` (via API, contrato fixo), futuras fases da mãe (`04` contrato temporal lê a série) | `D-h`, `NG-8` |
| volumetria e escala | `[GAP]` vazão do `forceOrder` não medida; cadência `premiumIndex` não escrita; 875 símbolos/ciclo `[DOC]` | `[Q1]`, `[Q2]`, `G6`, `CA-F1-5` |
| requisitos não-funcionais | `[COBERTO]` RSS projetado 88 MB `[DOC]`; teto de log; `[GAP]` retenção da fila e disco por fonte | `RNF-1..7`, `M4` |
| estados e casos de borda | `[COBERTO]` restart do escritor (`CA-F2-3`), morte do produtor (`CA-F1-3`), misconfig (`CA-F2-4`), fila cheia (`M4`), duplicata (`CA-F2-3`), coletor parado ⇒ `PARADO` (`CA-E2E-1`); `[GAP]` lacuna por reconexão ⇒ `ingest_gap`? | `[Q10]` |
| contrato e dependências | `[COBERTO]` bus fechado (`ADR-009/D2`); `[GAP]` wire `TBD` (dono e prazo), motor do registro (`RN-3`), run de stream (`[Q3]`) | §9 |
| métricas e observabilidade | `[COBERTO]` `/collector-status` é o instrumento; `CA-F3-8` mede RSS; `[GAP]` liveness de processos sem HTTP | `[Q6]` |
| escopo e non-goals | `[COBERTO]` §4, §11; implantação sujeita a `M3` | |

**O que foi perguntado ao owner nesta sessão: nada** — indisponível por declaração do despacho. Tudo em §14/§15.

---

## 17. Gate de handoff — a checklist, conferida

- [x] cada story tem fronteira clara e cabe numa fase — **10 stories em 3 fases** (§5)
- [x] as regras bloqueantes em vigor são **endereçáveis** — `harness rules list --severity block` → **8** `[MEDIDO 2026-09-07]`: `core.relative-import`, `core.silent-except`, `core.print-statement` (Python novo: wire, `single_writer_cli`, adaptador — coletores já usam logger nomeado); `core.hardcoded-secret` + `own.compose-hardcoded-secret` (**`CA-F3-6`**, todo `compose*.yml`/Dockerfile por `${VAR}`); `web-fullstack.browser-imports-server` e `tenant-from-request` (não há código de browser nesta feature — **caem por vacuidade, e isto está declarado**); `web-fullstack.server-test-directory-present` (`backend/tests/` existe)
- [x] tipos e contratos críticos definidos, ou `TBD` com dono e data — §9 (**6 `TBD`**, donos nomeados, prazo por fase; a data-calendário fixa o `/architect` no handoff)
- [x] non-goals escritos — §11, **11 itens**

**Gaps classificados:** bloqueante → **nenhum** para `PRD_DRAFT` (`M2` bloqueia a **SPEC de F2**, não o PRD); não-bloqueante → `[Q1]`–`[Q10]`, `G1`–`G8`; inferível → `I-1`–`I-5`.

**Ledger:** `harness pipeline advance captura-em-producao PRD_DRAFT` — executado após gravar este arquivo; registrado em `docs/INDEX.md`.

**Próximo passo:** `/architect` sobre [`handoff_to_architect.md`](../context/captura-em-producao/handoff_to_architect.md) — Gap Analysis; decidir `RN-3` (`M2`, emenda de `ADR-014` ou ADR nova); resolver `[Q5]` (imagem do Postgres/Timescale) e `[Q7]` (forma dos dois alvos); fixar dono+data de `[Q3]`; SPEC + plano em 3 fases na ordem F1 → F2 → F3.
