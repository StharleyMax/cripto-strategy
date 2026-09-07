# SPEC-004 — Captura em produção: coletores 24/7 → Redis Stream → escritor único → Postgres, subindo por `compose` em dois alvos

**Status:** `SPEC_APPROVED` — `approve spec` do **owner** em `2026-09-07T18:23:31Z`, `P1–P10` nos defaults do cabeçalho (`harness pipeline show captura-em-producao`); o estado corrente **é sempre** `harness pipeline state captura-em-producao`, e este texto não o substitui.
**Feature:** `captura-em-producao` (**filha** de `plataforma-dados`, `relate` no ledger) · **Data:** 2026-09-07 · **Componentes:** `sentimento` (produtor, wire, escritor, registro) · `infra` (Dockerfiles, compose, composição em `src.main`, serviços) · `docs`. **`web` não é tocado.**
**Ledger ao escrever:** `PRD_VALIDATED` — `approve prd` (architect) + `advance PRD_VALIDATED` em 2026-09-07, após a Gap Analysis em [`gates/PRD-004-architect.md`](../context/captura-em-producao/gates/PRD-004-architect.md) · **Rev de ancoragem de TODA medição:** `master@0acf947` (a mesma do `PRD-004`).
**Insumos:** [`PRD-004`](PRD-004-captura-em-producao.md) · [`handoff_to_architect.md`](../context/captura-em-producao/handoff_to_architect.md) · [`handoff/PRD.md`](../context/captura-em-producao/handoff/PRD.md) (fala literal do owner) · `ADR-027`, `ADR-029`, `ADR-030`, `ADR-002` (D1/D4/D5 + emendas), `ADR-014` (D1e/D1f), `ADR-009/D2` · código: `redis_stream_bus.py`, `redis_series_write_queue.py`, `run_single_writer.py`, `ingest_record.py`, `provenance.py`, `sqlite_ingest_record_store.py`, `src/main/__init__.py`, `postgres_run_registry_store.py`, `deploy/compose.yml`, `.env.example` (via `git show HEAD:`).
**ADRs que nascem com esta SPEC:** [`ADR-031`](../adr/ADR-031-motor-do-registro-em-producao-postgres-por-adaptador-e-a-imagem-do-candidato-4.md) (motor do registro; imagem do candidato 4; quem grava o run) · [`ADR-032`](../adr/ADR-032-dois-alvos-de-compose-um-arquivo-de-deploy-e-um-overlay-local-explicito.md) (dois alvos; Dockerfiles; `.env` único; teto do Redis; liveness mínima).
**Glossário:** `harness policy --key glossary_doc` → saída vazia, `rc=0` `[MEDIDO 2026-09-07]`. Não há glossário; termos em §1.2.
**Zero código.** Contratos, formas de dado, limites de camada, comportamento de borda.

### ⚠️ Decisões que o `approve spec` do owner toma ao aprovar esta SPEC — lidas antes de aprovar

O owner **não estava disponível**. Nada abaixo bloqueia o `DRAFT`; tudo abaixo é fechado **pelo ato de aprovar**, e o motivo do `approve` deve nomear onde ele discorda do default.

| # | decisão | default adotado | rótulo | custo de reverter depois |
|---|---|---|---|---|
| **P1** (`M2`) | Motor do registro `md.ingest_run` em produção | **Postgres por adaptador** (`ADR-031/D1`); SQLite continua em dev/teste | `[INFERRED: premissa "só Postgres" + G-A/G-B disparados]` | 1 adaptador fica sem uso em produção; voltar a SQLite exige volume compartilhado e reabre `ADR-014/FA-7` |
| **P2** (`[Q5]`) | Imagem do serviço `postgres` | **`timescale/timescaledb:2.17.2-pg15`** nos dois alvos (`ADR-031/D2`) | `[INFERRED: única imagem medida por ADR-002/D4]` | 1 linha + recriar volume — **zero antes de `M3`**, não-zero depois |
| **P3** (`[Q7]`) | Forma dos dois alvos | **`deploy/compose.yml` (7 serviços) + `deploy/compose.local.yml` (overlay explícito)** (`ADR-032/D1`) | `[INFERRED: medido E2–E5]` | renomear 1 arquivo + 2 alvos de `make` |
| **P4** (`[Q8]`) | `.env` | **um só, na raiz**, `--env-file .env` nos dois alvos (`ADR-032/D3`) | `[INFERRED]` | criar `.env.local` = 1 flag a mais |
| **P5** (`M4`) | Teto da fila | `XADD MAXLEN ~ 100000` + Redis `maxmemory 64mb noeviction` + AOF (`ADR-032/D4`) | `[INFERRED: ~200–500 B/entrada × 1e5 = dezenas de MB]`; `CA-F1-5` mede | 2 valores em `.env.example` |
| **P6** (`M3`) | Implantar na VPS ao fim de F3 | **não** (`RN-7`, herda `ADR-029/D1`) | `[INFERRED: ADR-029 vale até o owner dizer o contrário]` | `up` na VPS é ato do owner, sem código novo |
| **P7** (`[Q3]`) | Definição de "run" para stream e ciclo | **`I-3` do PRD como provisório**; **quem decide é o `quant-architect`**, antes de `F1` fechar (§3.3) | `[NÃO SEI]` — não é decisão do `/architect` | 1 módulo de mapeamento (16 campos) |
| **P8** (`[Q6]`) | Liveness de `writer`/`collector` | `restart` + fail-fast + `/collector-status` `PARADO`; `healthcheck` por comando **declarado, não implementado** (`ADR-032/D5`) | `[INFERRED]`; `infra-architect` pode trocar no gate | 1 bloco por serviço |
| **P9** (`M5`) | Gravação local crua após ligar o Stream | **`[NÃO SEI]`** — `quant-architect` dentro de `F1`; a SPEC só exige que `n_returned` conte o que foi **publicado** | — | disco: dobra escrita se mantida |
| **P10** (`M1`) | Destino de `T-07.15/16/17` na mãe | não é desta SPEC — `/tech-lead` + owner; default `(a)` superseded. ⚠ o DoD de `T-07.15` (*"import redis"*) **mede zero por construção** (gate C1) — não copiar | — | — |

---

## 0. Veredito do peer review do `PRD-004` — **[READY FOR SPEC]**

Relatório completo: [`gates/PRD-004-architect.md`](../context/captura-em-producao/gates/PRD-004-architect.md) — 11 números re-medidos (`G1` confirmado: `build:` em `compose.yml:46,63`, Dockerfile ausente ×2), 0 bloqueantes, 6 correções que **esta SPEC absorve**: **C1** `import redis` mede zero por construção (produção fala RESP2 por socket cru, `pyproject.toml:89-91`) — o instrumento é `RedisStreamPublisher(`; **C2** `[GAP G9]` `.env.example` não declara `POSTGRES_*` (§3.6 corrige); **C3** `SeriesRow` = **15** campos, não 12; **C4** `IngestRun` = **16**, não 15; **C5** `ADR-002:172` nomeia a imagem Timescale (`P2`); **C6** `include:` é ignorado em silêncio no compose 2.19.1 (recusado em `ADR-032`).

---

## 1. Objetivo e fronteira

### 1.1 Objetivo, em cinco propriedades verificáveis (herdadas de `PRD-004 §2`, com as contagens corrigidas)

1. Cada coletor 24/7 publica via `RedisStreamPublisher.publish` num Stream com wire **num único módulo**, round-trip provado para **4 `Provenance` × 15 campos**.
2. `single_writer_cli` consome a fila e grava em Postgres; `kill -9` + restart **não perde nem duplica** (`ADR-002/D5`, `ADR-027/F3`).
3. Cada sessão/ciclo grava um `IngestRun` (**16 campos**) no registro que **a API lê**; `GET {API_PREFIX}/collector-status` passa de `n_rows=1` para **≥ 3**.
4. `docker compose --env-file .env -f deploy/compose.yml config -q && build` e o mesmo com `-f deploy/compose.local.yml` passam; local **sem `caddy`**; deploy = arquivo existente **estendido**.
5. Todo recurso novo tem teto declarado e a pegada é **medida** em `docs/context/captura-em-producao/medicoes/`.

### 1.2 Termos (na ausência de glossário)

*produtor real* — processo que publica dado observado de exchange no Stream, não fixture · *sessão* — uma conexão WebSocket do `forceOrder`, do `connect` ao fechamento/reconexão · *ciclo* — uma chamada HTTP em lote do `premiumIndex` · *registro* — `md.ingest_run`/`md.ingest_gap`, lidos por `/collector-status` e `/ingest-health` · *série* — as linhas `SeriesRow` que o escritor único grava · *alvo de compose* — o conjunto de `-f` que sobe em um ambiente · *wire* — a codificação `SeriesRow ↔ Mapping[str,str]` no Stream.

### 1.3 Fora, por remissão

`NG-1..NG-11` do PRD. Em particular: **nenhuma linha** em `backend/src/api/routes/collector_status.py`, `backend/src/modules/sentimento/domain/collector_status.py` ou `frontend/src` (`CA-E2E-3`); os 4 eventos de log em português e `janela_de_perda` intocados (`CLAUDE.md` linhas 10/11); fila da API de leitura e alarme externo (`ADR-027` §NÃO decide); implantação (`P6`).

---

## 2. Decisões normativas que esta SPEC USA (e não reabre)

`ADR-027/D1` (3 processos; coletores no mesmo processo por threads; *"mesma imagem, comando diferente"*) e `D2` (Redis dedicado) · `ADR-009/D2` (Streams + consumer group; `XADD` só em `RedisStreamPublisher.publish`) · `ADR-002/D1` (registro em Postgres), `D4` (candidato 4 = TimescaleDB em pg15), `D5` (ler-antes-de-escrever no escritor único, não no motor), `D6` emenda (`compaction_epoch`/`content_hash`) · `ADR-029/D3` (misconfiguração recusa subir), `D5` (`api` sem `ports:` no deploy) · `ADR-030/D1` (`PARADO` por `stale_after_s`), `D5` (envelope intocado) · `ADR-014/D1e` (gatilhos, agora respondidos por `ADR-031`) · `CLAUDE.md` §Idioma (código, evento de log, chave de `extra`, mensagem de exceção **novos** em inglês; `sentimento` fica).

---

## 3. Contratos

### 3.1 O processo coletor — `collectors_cli` (`sentimento`, `F1`)

| aspecto | contrato |
|---|---|
| **entrypoint** | `python -m src.modules.sentimento.infra.collectors_cli` — **um** processo, **duas** threads (`forceOrder` stream; `premiumIndex` poll), `ADR-027/D1`. Os CLIs de probe existentes continuam existindo para diagnóstico; o processo de produção é este |
| **boot (fail-fast, `RN-4`)** | resolve `REDIS_HOST`/`REDIS_PORT`/`REDIS_STREAM`/`REDIS_STREAM_MAXLEN`, `INGEST_RECORD_BACKEND` (+ `POSTGRES_*` se `postgres`), `PREMIUM_INDEX_CYCLE_INTERVAL_S`; abre a conexão RESP (`connect_resp2`) e faz `PING`; `describe_readiness()` do registro. Qualquer falha ⇒ `rc ≠ 0` em **≤ 5 s**, mensagem em inglês **nomeando a variável**; nenhum retry infinito no boot |
| **publicação** | por evento (`forceOrder`) e por leitura (`premiumIndex`): `encode(row)` (§3.2) → `RedisStreamPublisher.publish(fields)`; **nenhum outro `XADD`** (`RN-2`) |
| **registro** | ao fechar uma sessão (fechamento/reconexão/`SIGTERM`) e ao terminar um ciclo: `record_run(IngestRun)` pelo adaptador de §3.5 (`ADR-031/D3`) |
| **parada** | `SIGTERM` ⇒ fecha sessão corrente, grava o `IngestRun` dela com `verdict` do conjunto de §3.3, sai `rc=0`. Mensagens já publicadas ficam no Stream (durável) |
| **falha do Redis em regime** | `XADD` falha (rede ou `noeviction` por fila cheia) ⇒ o coletor **encerra a sessão com `verdict=REJECTED`**, registra, e sai `rc ≠ 0` — `restart: unless-stopped` o traz de volta; **nunca** continua "capturando" sem publicar (`CA-F1-1` morde) |
| **gravação local crua** | `P9` — `[NÃO SEI]`, `quant-architect` em `F1`. Invariante desta SPEC: `n_returned` = eventos/leituras **publicados** na sessão/ciclo, independente do que vai a disco |

### 3.2 O wire — `series_row_wire` (`sentimento`, `F1`)

| aspecto | contrato |
|---|---|
| **módulo** | `backend/src/modules/sentimento/infra/series_row_wire.py` — **dono único** do wire; `encode(SeriesRow) -> Mapping[str, str]`, `decode(Mapping[str, str]) -> SeriesRow` |
| **campos** | os **15** de `SeriesRow` (`provenance.py`, `[MEDIDO: dataclasses.fields → 15]`: `series_key_id symbol source bucket_end event_time available_at availability_source ingested_at observed_at provenance src_label_raw observer_id observer_region is_final principal_id`), **chave = nome do campo**, valor `str`: inteiros em decimal ASCII, enums pelo `.name`, booleanos `"0"`/`"1"`, `None` **não existe no wire** (campo opcional vira string vazia só se o dataclass o permitir — hoje nenhum) |
| **propriedade** | `decode(encode(row)) == row` para os **4** valores de `Provenance` × 15 campos; campo ausente, extra ou não parseável ⇒ **exceção tipada** (em inglês), nunca `None` silencioso — a mensagem é `ack`ada? **Não**: o escritor a deixa na `PEL` e loga `writer_message_rejected` (§3.7); a decisão do que fazer com mensagens envenenadas é `[Q10]`-adjacente, `quant-architect` |
| **teto** | `RedisStreamPublisher.publish` ganha `MAXLEN ~ N` (aproximado, `~`), `N = REDIS_STREAM_MAXLEN` (default `100000`, `P5`) — o **único** lugar onde `XADD` é montado (`redis_stream_bus.py:58`) |
| **nomes (`[Q4]`)** | Stream `REDIS_STREAM` default **`md.series.write`**; grupo `REDIS_STREAM_GROUP` default **`single_writer`**; consumidor `REDIS_STREAM_CONSUMER` default `writer-1`. Inglês, `RN-8` |

### 3.3 O registro de run — mapeamento para os **16** campos de `IngestRun` (`sentimento`, `F1`; decisão `P7` do `quant-architect`)

Provisório `[INFERRED I-3, PRD §12]` até o `quant-architect` assinar `docs/context/captura-em-producao/gates/Q3-run-definition.md` — **pré-condição do DoD de F1** (plano `01`, item 1.6). O que esta SPEC **fixa** independentemente da resposta: (a) `verdict ∈ KNOWN_VERDICTS` (`ingest_record.py:79`: `ACCEPTED`, `ACCEPTED_WITH_WARNING`, `REJECTED`); (b) `started_at`/`ended_at` finitos, ISO-8601 UTC; (c) `source` = **o mesmo literal** que os runs existentes usam (`select distinct source from ingest_run` no store do owner — `[NÃO SEI]` o valor aqui: não há store local em `0acf947`); (d) `endpoint` distinto por coletor — proposta `!forceOrder@arr` e `/fapi/v1/premiumIndex` (o segundo já é literal em `premium_index_batch.py:22`); (e) `run_id` único (`uuid4`); (f) `n_returned` = publicados; `n_written` = `0` no coletor (quem escreve a série é o escritor — o campo não mente); (g) para stream, `n_expected = n_returned` (não há esperado) — **ou** o que o `quant-architect` fixar; (h) `api_code = None` para WS, HTTP status para o ciclo; (i) `window`, `src_sha256`, `weight_used`, `clock_skew_ms`, `observer_*`: **do `quant-architect`** — a SPEC exige apenas não-vazios e determinísticos.

### 3.4 O escritor em produção — `single_writer_cli` + sink Postgres (`sentimento`, `F2`)

| aspecto | contrato |
|---|---|
| **entrypoint** | `python -m src.modules.sentimento.infra.single_writer_cli`; **o único call site de produção** de `run_single_writer` (`test_single_writer_call_sites.py` continua em **1**, `RF-5`) |
| **composição** | `connect_resp2` → `RedisStreamConsumerGroup(connection, stream, group, consumer)` → `ensure_group()` → `RedisSeriesWriteQueue(group, decode)` (§3.2); conexão Postgres → `PostgresSeriesSink` (implementa `SeriesSink`) + `PostgresObservedLookup` (implementa `ObservedLookup`) — **ambos em `infra`**; loop: `run_single_writer(queue, lookup, sink, batch_size=WRITER_BATCH_SIZE)`; fila vazia ⇒ dorme `WRITER_POLL_INTERVAL_MS` |
| **`run_single_writer` não muda** | o predicado *MODELED não sobrescreve OBSERVED* fica no use case (`ADR-002/D5`, `RF-6`); o `ack` acontece **após** `write_series_row` retornar — logo o sink **commita dentro de `write_series_row`**, por linha ou por lote fechado, nunca depois do `ack` (`CA-F2-3` morde exatamente isso) |
| **boot (fail-fast)** | como §3.1; sem `REDIS_*`/`POSTGRES_*` resolvíveis ⇒ `rc ≠ 0` ≤ 5 s nomeando a variável (`CA-F2-4`) |
| **tabela da série** | DDL de produção **`TBD` do `quant-architect`** em `gates/F2-series-ddl.md` (plano `02`, item 2.1) — a SPEC fixa os **requisitos**: hypertable por `bucket_end` (`ADR-002/D4`); chave de unicidade **declarada** (é a *chave* de `CA-F2-3`); `compaction_epoch`/`content_hash` conforme `ADR-002/D6` emenda; layout de partição de `T-07.6`/`T-07.8` respeitado; **`provenance` é coluna**, para `CA-E2E-2` |
| **idempotência** | reentrega da mesma mensagem (`read_pending` após crash entre commit e `ack`) **não** duplica: o sink trata a chave de unicidade como *upsert-noop* para `OBSERVED` idêntico — é o que faz `CA-F2-3` dar **100 e 0** |

### 3.5 O registro e a API leem o mesmo motor — `PostgresIngestRecordStore` (`sentimento` adaptador · `infra` composição, `F2`) — `ADR-031/D1`

Superfície idêntica à de `SqliteIngestRecordStore`; conexão injetada; `initialise()` idempotente (`md.ingest_run` 16 colunas, `md.ingest_gap` 8); seleção por `INGEST_RECORD_BACKEND` ∈ {`sqlite`,`postgres`} (default `sqlite`) em **três** composition roots: `src.main`, `single_writer_cli` (só se gravar gaps — `[Q10]`), `collectors_cli`. `/ready` mantém a forma de `SPEC-003 §3.4`; `path` = DSN **sem senha**. **Propriedade:** mesmo conjunto de runs ⇒ `IngestHealthReport.fingerprint()` **igual** nos dois motores. `POSTGRES_HOST`/`POSTGRES_PORT` novos (defaults `postgres`/`5432`), `POSTGRES_DB/USER/PASSWORD` já exigidos pelo compose.

### 3.6 Os dois alvos de compose, os Dockerfiles e o `.env` (`infra`, `F3`) — `ADR-032`

**Serviços de `deploy/compose.yml` após F3 (7):**

| serviço | imagem / build | `command:` | `ports:` deploy | `ports:` local (overlay) | `depends_on` | volume | `logging` |
|---|---|---|---|---|---|---|---|
| `postgres` | `timescale/timescaledb:2.17.2-pg15` (`P2`) | — | — | — | — | `postgres_data` | herda |
| `redis` | `redis:7-alpine` | `redis-server --appendonly yes --maxmemory ${REDIS_MAXMEMORY} --maxmemory-policy noeviction` | — | — | — | `redis_data` | `10m × 3` |
| `api` | `build: ../backend` | `python -m src.main` | **nenhuma** (`ADR-029/D5`) | `127.0.0.1:${APP_PORT}:${APP_PORT}` | `postgres: service_healthy` | — | já tem |
| `writer` | mesma imagem | `python -m src.modules.sentimento.infra.single_writer_cli` | — | — | `redis`, `postgres` (`service_healthy`) | — | `10m × 3` |
| `collector` | mesma imagem | `python -m src.modules.sentimento.infra.collectors_cli` | — | — | `redis`, `postgres` (`service_healthy`) | — | `10m × 3` |
| `web` | `build: ../frontend` | `npm start` | — | `127.0.0.1:3000:3000` | `api` | — | herda |
| `caddy` | `caddy:2-alpine` | — | `80`, `443` | **excluído** (`profiles: ["deploy-only"]` no overlay) | `api`, `web` | 2 existentes | herda |

**Comandos canônicos** (da raiz; `make compose-deploy`/`compose-local` só os embrulham): deploy `docker compose --env-file .env -f deploy/compose.yml …`; local `docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml …`.

**`.env.example` — fonte única de nomes (hoje 6 `[MEDIDO: git show HEAD:.env.example]`; passa a 6 + 13):** `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (**G9**, já exigidos), `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`, `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_STREAM=md.series.write`, `REDIS_STREAM_GROUP=single_writer`, `REDIS_STREAM_MAXLEN=100000`, `REDIS_MAXMEMORY=64mb`, `INGEST_RECORD_BACKEND=postgres` (comentário: `sqlite` para dev sem compose), `WRITER_BATCH_SIZE=100`, `WRITER_POLL_INTERVAL_MS=500`, `PREMIUM_INDEX_CYCLE_INTERVAL_S` (valor do `quant-architect`, `[Q2]`). Nenhum valor é credencial real; `PANEL_BASIC_AUTH_HASH` continua vazio.

**Dockerfiles:** `backend/Dockerfile` (uma imagem, `python:3.13-slim`, sem `ENTRYPOINT` lógico) + `backend/.dockerignore`; `frontend/Dockerfile` (`node:22-alpine`, `npm ci && npm run build`) + `frontend/.dockerignore`. **Nenhuma imagem contém `.env`** (`ADR-032/D2`).

### 3.6.1 Vínculo com o relatório de execução local (PR #166) — `[PREMISSA-OWNER: 2026-09-07]`

Owner, literal: *"creio q podemos lincar essa mesma necessidade/feature com esse novo report
https://github.com/StharleyMax/cripto-strategy/pull/166/"*. O relatório
(`docs/context/camada-de-leitura-do-painel/handoff/execucao-local-2026-09-07.md`, §1) mede quatro faltas
para rodar local: `frontend/.env.local` (o Next não lê o `.env` da raiz), `.env` da raiz, o store
`data/md/ingest_health.sqlite3` inexistente, e o cache `frontend/.next` desatualizado. **`F3` desta SPEC é
o dono das quatro**, e o alvo local (`ADR-032`) as fecha assim `[INFERRED: leitura do coordenador; o
`/architect` confirma ou corrige no `/tech-lead`]`:

| falta medida (PR #166 §1) | como `F3` fecha | DoD |
|---|---|---|
| `frontend/.env.local` ausente | o overlay local injeta `INGEST_HEALTH_API_BASE_URL` no serviço `web` por `environment:` a partir do `.env` único (`ADR-032`); **nenhum `.env.local` é necessário sob compose**. O caminho sem docker (`next dev` na mão) continua exigindo-o e fica documentado em `.env.example` como comentário, não como segundo arquivo de verdade | `D3.16` |
| `.env` da raiz ausente | `D3.10` já obriga `.env.example` a cobrir toda variável interpolada nos dois compose; a variável do Next entra nesse universo | `D3.10` |
| store SQLite inexistente | deixa de existir como pré-requisito: o registro vive em Postgres (`ADR-031`) e o `collector` real o alimenta; `backend/scripts/seed_ephemeral_ingest_store.py` fica só para `make e2e` da irmã | `D3.12` |
| cache `.next` desatualizado | o `frontend/Dockerfile` constrói de árvore limpa (`D3.2`); o dev sem docker continua com `rm -rf frontend/.next` — fora desta SPEC | `D3.2` |

**§2 do mesmo relatório — nenhuma página de gráfico importa `history-transport.ts`/`live-transport.ts`
— NÃO é desta feature:** é o componente `charts` da mãe (`ADR-005`, `ADR-003`), e entra como `[Q12]` em
§8 com dono owner (terceira filha ou reabertura da `camada-de-leitura-do-painel`).

### 3.7 Observabilidade mínima (`sentimento` eventos · `infra` medição)

Eventos de log **novos, em inglês** (`CLAUDE.md` linha 10), com `extra={}` em inglês: `collector_boot_refused{variable}`, `collector_session_closed{endpoint,n_published,verdict,run_id}`, `collector_cycle_completed{endpoint,n_published,verdict,run_id}`, `writer_boot_refused{variable}`, `writer_batch_acked{n_accepted,n_rejected}`, `writer_message_rejected{entry_id,reason}`. Os 4 eventos existentes em português **não** são renomeados (`NG-9`). Instrumento de vida: `/collector-status` (`PARADO` após `stale_after_s`, `ADR-030/D1`). Medições em `docs/context/captura-em-producao/medicoes/` com comando e `n`: `CA-F1-5` (vazão 24 h), `CA-F3-8` (RSS + tamanho de imagem).

---

## 4. Limites de camada

| camada | pode | não pode |
|---|---|---|
| `sentimento/domain` | **intocada** (`SeriesRow`, `IngestRun`, `Provenance`) | ganhar campo, import de I/O, `psycopg`/`sqlite3` (import-linter, `pyproject.toml:326-333`) |
| `sentimento/use_cases` | **intocada**: `run_single_writer`, `ingest_health_query`, `collect_premium_index_once`, `reconnect_and_key` | `psycopg`, `socket`, alteração do predicado de `D5` |
| `sentimento/infra` | `series_row_wire`, `collectors_cli`, `single_writer_cli`, `PostgresIngestRecordStore`, `PostgresSeriesSink`, `PostgresObservedLookup`, `MAXLEN` em `RedisStreamPublisher.publish` | um segundo `XADD`; abrir socket fora dos composition roots |
| `src/main` (`infra`) | escolher o store por `INGEST_RECORD_BACKEND`; abrir a conexão Postgres | mudar rotas, envelopes, `API_PREFIX` |
| `deploy/`, `backend/Dockerfile`, `frontend/Dockerfile`, `.env.example`, `Makefile` (`infra`) | os 7 serviços; 2 alvos; 2 Dockerfiles; alvos `compose-*` | segredo literal (`own.compose-hardcoded-secret`); serviço para coletor one-shot (`NG-6`); `ports:` em `api` no deploy |
| `web`, `frontend/src` | — | **qualquer linha** (`CA-E2E-3`) |

---

## 5. Comportamento de borda — a tabela que os DoDs executam

| # | situação | comportamento | quem prova |
|---|---|---|---|
| B1 | Redis no chão ao subir o coletor | `rc ≠ 0` ≤ 5 s, `collector_boot_refused{variable}` | `CA-F1-1` morde |
| B2 | Redis cai em regime | `XADD` falha ⇒ sessão fecha com `REJECTED`, run gravado, `rc ≠ 0`; `restart` relança | `CA-F1-3` variante |
| B3 | produtor morre após a 5ª de 10 mensagens | 5 no Stream, 0 perdidas; consumidor as lê | `CA-F1-3` |
| B4 | escritor morre entre `commit` e `ack` | `read_pending` reentrega; sink faz upsert-noop; **100 e 0** | `CA-F2-3` |
| B5 | escritor morre entre `read` e `commit` | linha não gravada, entrada na `PEL`; reentrega grava | `CA-F2-3` |
| B6 | `MODELED` chega depois de `OBSERVED` para a mesma chave | `REJECTED_MODELED_OVER_OBSERVED`, `ack`ada (decisão terminal), `OBSERVED` permanece | `CA-F2-2` |
| B7 | mensagem que não decodifica | fica na `PEL`, `writer_message_rejected`; **não** derruba o escritor; destino final `[Q10]`-adjacente | teste unitário do wire |
| B8 | fila cheia (`noeviction`) | `XADD` falha alto no coletor (B2); nada é descartado em silêncio | `CA-F3-9` |
| B9 | `INGEST_RECORD_BACKEND` inválido ou `postgres` inalcançável | `create_app`/CLI recusa subir, nomeia a variável | `CA-F2-4`, `/ready` |
| B10 | `api` em compose com `postgres` de pé, 0 runs | `/collector-status` `200`, `n_rows=0`; `/ready` `200` com `schema_present=true` | `CA-F3-4` |
| B11 | coletores parados por > `stale_after_s` | séries novas viram `PARADO`; `n_rows` **não** cresce | `CA-E2E-1` |
| B12 | `.env` ausente | `config` reprova por interpolação (`:?`) — desejado | `CA-F3-1` morde |
| B13 | cwd = `deploy/` sem `--env-file` | mesmo erro de B12; **nenhum** auto-merge de override (não existe `compose.override.yml`) | `ADR-032/F2` |
| B14 | `SIGTERM` no coletor | sessão fechada, run gravado, `rc=0` | teste de processo em F1 |

---

## 6. Fases — ordem obrigatória `F1 → F2 → F3` (`RN-1`)

| fase | entrega | componente alvo | fecha | entra quando |
|---|---|---|---|---|
| **F1** | `series_row_wire`, `MAXLEN` no bus, `collectors_cli` publicando e registrando, `Q3` assinado, vazão medida 24 h | `sentimento` | `US-1..3`, `RF-1..4`, `CA-F1-1..5` | sempre |
| **F2** | `single_writer_cli`, sink + lookup Postgres, DDL da série (gate), `PostgresIngestRecordStore`, composição por env em `src.main` | `sentimento` + `infra` | `US-4..7`, `RF-5..7`, `RF-10`, `CA-F2-1..5` | `CA-F1-*` verdes |
| **F3** | Dockerfiles, `.dockerignore`, `compose.yml` 7 serviços, `compose.local.yml`, `.env.example` +13, alvos `make`, medição de RSS/imagem, E2E | `infra` | `US-8..10`, `RF-8..9`, `RF-11`, `CA-F3-1..9`, `CA-E2E-1..3` | `CA-F2-*` verdes |

**F3 antes de F1/F2 é a "construção especulativa" que `ADR-027` recusa** — o `/tech-lead` reprova a ordem (`RN-1`).

---

## 7. Regras bloqueantes em vigor — endereçadas (`harness rules list --severity block` → **8** `[MEDIDO 2026-09-07]`)

`core.relative-import`, `core.silent-except`, `core.print-statement` — todo Python novo (§3.1–3.5) usa import absoluto, logger nomeado, e **nenhum `except` vazio**: B7 loga e deixa na `PEL`, B2 relança · `core.hardcoded-secret` + `own.compose-hardcoded-secret` — todo `compose*.yml`/Dockerfile/`.env.example` por `${VAR}`/placeholder; `CA-F3-6` roda `harness rules --mode file` sobre cada arquivo novo (`deploy/` está em `code_paths.include_prefixes`, `harness.toml:369`) · `web-fullstack.browser-imports-server`, `tenant-from-request` — **caem por vacuidade** (zero código de browser) · `web-fullstack.server-test-directory-present` — `backend/tests/` existe. **Nenhuma `[[rules.own]]` nova**: a fronteira `psycopg` só em `infra` já é portão por `import-linter`.

---

## 8. Perguntas em Aberto — com dono; nenhuma bloqueia `SPEC_DRAFT`

| id | pergunta | dono | quando | estado |
|---|---|---|---|---|
| `[Q1]` | vazão real do `!forceOrder@arr` | `quant-architect` | `CA-F1-5`, F1 | `[NÃO MEDIDO]` |
| `[Q2]` | cadência do ciclo `premiumIndex` (`PREMIUM_INDEX_CYCLE_INTERVAL_S`) | `quant-architect` | F1, constante | `[NÃO SEI]` |
| `[Q3]` | definição de run + literais `source`/`endpoint` (§3.3) | `quant-architect` | **antes do DoD de F1** (gate file) | provisório `I-3` |
| `[Q4]` | nomes de Stream/grupo/env | resolvido §3.2/§3.6 | — | fechado `[INFERRED]` |
| `[Q5]` | imagem do Postgres | `ADR-031/D2` | `approve spec` (`P2`) | default |
| `[Q6]` | liveness sem HTTP | `ADR-032/D5`; `infra-architect` no gate | F3 | default mínimo |
| `[Q7]` | forma dos alvos | `ADR-032/D1` | `approve spec` (`P3`) | default medido |
| `[Q8]` | `.env` único | `ADR-032/D3` | `approve spec` (`P4`) | default |
| `[Q9]` | operação do Redis dedicado na VPS | owner | após `M3` | fora |
| `[Q10]` | `md.ingest_gap` por reconexão; destino de mensagem envenenada (B7) | `quant-architect` | F2 | `[NÃO SEI]` |
| **`[Q11]` novo** | qual `source` literal os runs existentes usam (não há store em `0acf947`) | `quant-architect` (com o store do owner) | F1 | `[NÃO SEI]` |

---

| `[Q12]` | página de gráfico: PR #166 §2 mede que **nenhuma** rota em `frontend/src/app/` importa `history-transport.ts`/`live-transport.ts` — a UI de `charts` não existe. Terceira filha de `plataforma-dados` ou reabertura da `camada-de-leitura-do-painel`? | fora desta SPEC (`§1.3`) | **owner** (componente `charts`, `ADR-005`) |

## 9. Falsificador desta SPEC

Se, com `F1`+`F2`+`F3` fechadas por seus DoDs, **`CA-E2E-1` reprovar** — alvo local de pé por ≥ 1 sessão + 1 ciclo e `GET {API_PREFIX}/collector-status` devolver `n_rows < 3` — então esta SPEC especificou três peças que **não se ligam**, e o defeito está no desenho (§3.3 ou §3.5), não na implementação. O segundo falsificador é o de `ADR-031/F1`: `fingerprint()` diferente entre motores para os mesmos runs.

## 10. Ledger

`PRD_VALIDATED` → **`harness pipeline advance captura-em-producao SPEC_DRAFT`** após gravar este arquivo, as duas ADRs e o plano. **`SPEC_APPROVED` é do owner** (`approve spec`), lendo o cabeçalho `P1–P10`. Próximo passo após a aprovação: `/tech-lead` sobre [`docs/plans/SPEC-004-captura-em-producao/index.md`](../plans/SPEC-004-captura-em-producao/index.md).

**Ocorrido:** `approve spec` do owner em `2026-09-07T18:23:31Z` → `SPEC_APPROVED`; `P1–P10` nos defaults do cabeçalho (`harness pipeline show captura-em-producao`). O `/tech-lead` já correu sobre o plano acima e o ledger avançou até `BUILD_AUTHORIZED` (`harness pipeline state captura-em-producao`) — este parágrafo fica como registro histórico do procedimento, não como estado corrente.
