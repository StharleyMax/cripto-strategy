# Fase `02` — O escritor vira processo de produção e o registro vira um só

**Componente alvo:** `sentimento` (entrypoint, sink, lookup, adaptador) · `infra` (composição em `src.main`) · **SPEC:** `SPEC-004` §3.4, §3.5, §3.7; §5 B4–B7, B9 · **ADR:** `ADR-031/D1` (Postgres por adaptador), `D2` (imagem — usada pelo Postgres de teste desta fase) · **PRD:** `US-4..7`; `RF-5..7`, `RF-10`; `RN-3`, `RN-4`; `CA-F2-1..5`
**Depende de:** `01` (`CA-F1-*` verdes). **Juízes:** `quant-architect` (DDL da série, `[Q10]`), `infra-architect` (composição, conexão). **Postgres de pé nesta fase** = container `timescale/timescaledb:2.17.2-pg15` efêmero (o mesmo padrão de `tests/backtest/test_postgres_run_registry_store.py:74-90`), **não** o compose (que é `03`).

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 2.1 | **Gate DDL**: `quant-architect` escreve `gates/F2-series-ddl.md` — nome da tabela da série, hypertable por `bucket_end`, **chave de unicidade declarada**, `provenance` como coluna, `compaction_epoch`/`content_hash` (`ADR-002/D6` emenda), layout de `T-07.6`/`T-07.8` | §3.4 | `sentimento` (`docs`) | não reabre `ADR-002/D4` |
| 2.2 | `infra/postgres_series_sink.py`: `PostgresSeriesSink` (porta `SeriesSink`) com **commit dentro de `write_series_row`** e upsert-noop para reentrega idêntica; `PostgresObservedLookup` (porta `ObservedLookup`); conexão injetada | `RF-6`, `CA-F2-2/3` | `sentimento` | não move o predicado de `D5` para o sink |
| 2.3 | `infra/single_writer_cli.py`: composição de §3.4; loop `run_single_writer(...)`; `WRITER_BATCH_SIZE`, `WRITER_POLL_INTERVAL_MS`; boot fail-fast; eventos `writer_boot_refused`, `writer_batch_acked`, `writer_message_rejected` | `RF-5`, `RF-7`, `US-4`, `US-6` | `sentimento` | não altera `run_single_writer`; não `ack`a antes do commit |
| 2.4 | `infra/postgres_ingest_record_store.py`: `PostgresIngestRecordStore` com a superfície de `SqliteIngestRecordStore` (6 métodos); `initialise()` idempotente (`md.ingest_run` 16 col., `md.ingest_gap` 8); RAW, sem coerção | `RF-10`, `RN-3` | `sentimento` | não muda `IngestRecordSource` nem `ingest_health_query` |
| 2.5 | Teste de equivalência: mesmos runs/gaps nos dois stores ⇒ `ingest_health_query(x).fingerprint()` igual (`ADR-031/F1`) | `RN-3` | `sentimento` (`tests/`) | — |
| 2.6 | `src.main`: `INGEST_RECORD_BACKEND` ∈ {`sqlite`,`postgres`} (default `sqlite`); valor inválido ou Postgres inalcançável ⇒ `create_app` recusa (inglês, nomeia a variável); `/ready` mantém a forma de `SPEC-003 §3.4`, `path` = DSN **sem senha** | `US-7`, `RN-4`, `ADR-029/D3` | `infra` | não muda rota, envelope, `API_PREFIX` |
| 2.7 | `collectors_cli` (de `01`) e `single_writer_cli` compõem o store por `INGEST_RECORD_BACKEND` do mesmo jeito (1 função de composição compartilhada em `infra`) | `RF-10`, `ADR-031/D3` | `sentimento` | não abre conexão em `use_cases` |
| 2.8 | Teste de processo real: subir escritor, publicar N=100 via `01`, `kill -9` a meio, reiniciar, contar | `US-5`, `CA-F2-3` | `sentimento` (`tests/`) | não usa fake do sink |
| 2.9 | `[Q10]`: `quant-architect` decide se o escritor grava `md.ingest_gap` e o destino de mensagem envenenada (B7) — registrado em `gates/F2-series-ddl.md` ou arquivo próprio | `[Q10]` | `sentimento` (`docs`) | não implementa alarme (`NG-7`) |

## DoD — comando, universo e a coluna "morde"

| DoD | comando (de pé ⇒ verde) | morde |
|---|---|---|
| **D2.1** entrypoint único | `find backend/src -iname 'single_writer_cli.py' \| wc -l` → **1**; `cd backend && .venv/bin/pytest tests/sentimento/test_single_writer_call_sites.py -q` → passa (**1** call site) | 2º call site plantado ⇒ o teste AST reprova |
| **D2.2** DDL assinado | `test -f docs/context/captura-em-producao/gates/F2-series-ddl.md && grep -cE 'unique\|UNIQUE\|chave' …` → **≥ 1** | ausente ⇒ **fase não fecha** (a chave de `D2.4` não existe) |
| **D2.3** predicado preservado | publicar 1 `OBSERVED` + 1 `MODELED` mesma chave; `psql -c "select provenance from <tabela> where <chave>"` → **`OBSERVED`** | entrypoint chamando o sink direto ⇒ `MODELED` |
| **D2.4** restart sem perda nem duplicata | N=100, `kill -9` a meio, reiniciar; `select count(*)` → **100**; `select count(*) from (select <chave> from <tabela> group by <chave> having count(*)>1) d` → **0** | `ack` antes do commit ⇒ `< 100`; sem upsert-noop ⇒ duplicatas `> 0` |
| **D2.5** fail-fast | `REDIS_HOST=nao-existe python -m src.modules.sentimento.infra.single_writer_cli` → `rc ≠ 0` em ≤ 5 s, saída contém `REDIS_HOST`; idem `POSTGRES_HOST` | retry infinito ⇒ `timeout 10` mata com `rc=124` — reprova |
| **D2.6** adaptador equivalente | `pytest tests/sentimento -k 'ingest_record_store and fingerprint' -q` → passa sobre **≥ 3 runs + ≥ 1 gap** | coerção plantada (`api_code` `None`→`0`) ⇒ fingerprints diferem |
| **D2.7** `src.main` escolhe por env | `INGEST_RECORD_BACKEND=postgres POSTGRES_HOST=<efêmero> … curl -s :$APP_PORT/ready \| jq '.store.schema_present'` → **true**; `jq -r .store.path \| grep -c "$POSTGRES_PASSWORD"` → **0** | `INGEST_RECORD_BACKEND=foo` ⇒ processo não sobe, saída contém `INGEST_RECORD_BACKEND` |
| **D2.8** dois processos, um registro | coletor (`01`) e API em `postgres` sobre o mesmo container efêmero; após 1 sessão + 1 ciclo `curl … /collector-status \| jq .n_rows` → **≥ 2** (`+1` com o probe NTP → ≥ 3 é `CA-E2E-1`, em `03`) | API em `sqlite` ⇒ `n_rows` 0 ou 1 |
| **D2.9** portões | `make verify` verde; `lint-imports` verde (`psycopg` só em `infra`); `R-D` diff vazio | `psycopg` em `use_cases` ⇒ reprova |
