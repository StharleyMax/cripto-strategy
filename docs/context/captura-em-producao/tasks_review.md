# Narrativa de review de tasks — `captura-em-producao`

**Papel:** `/tech-lead` · **Data:** 2026-09-07 · **Feature:** `captura-em-producao` (**filha** de `plataforma-dados`, `relate` no ledger)
**Status desta narrativa: APROVADA POR PRÉ-AUTORIZAÇÃO DO OWNER** — modo `--create`. Declaração literal, `[PREMISSA-OWNER: 2026-09-07]`: *"ok, pode aprovar a spec e prd e seguir com o TL"*. A pré-autorização cobre **decompor e criar as tasks** (local e Jira); não cobre código, commit, implantação, nem qualquer ato na mãe (`P10`/`M1` fica como **proposta**, §7).
**Insumos lidos integralmente:** [`SPEC-004`](../../specs/SPEC-004-captura-em-producao.md) (230 linhas; cabeçalho `P1–P10`, §3.6.1, §8 `[Q12]` fora) · [`index.md`](../../plans/SPEC-004-captura-em-producao/index.md) + [`01`](../../plans/SPEC-004-captura-em-producao/01_coletor_publica_e_se_registra.md) · [`02`](../../plans/SPEC-004-captura-em-producao/02_escritor_em_producao_e_registro_unico.md) · [`03`](../../plans/SPEC-004-captura-em-producao/03_compose_em_dois_alvos.md) (inclui `D3.16`) · [`ADR-031`](../../adr/ADR-031-motor-do-registro-em-producao-postgres-por-adaptador-e-a-imagem-do-candidato-4.md) · [`ADR-032`](../../adr/ADR-032-dois-alvos-de-compose-um-arquivo-de-deploy-e-um-overlay-local-explicito.md) · [`handoff/PRD.md`](handoff/PRD.md) · [`gates/PRD-004-architect.md`](gates/PRD-004-architect.md) · `PRD-004` §6 (UVs), §7 (RF), §11 (CA), §12 (`I-3`), M1–M5 · mãe: `docs/context/plataforma-dados/tasks.toml:1204-1251` (`T-07.15/16/17`).
**Zero código. Zero commit.** Tasks **cardadas** no Jira nesta sessão (§5).

---

## 0. Gate de entrada — conferido, com o comando

| condição | comando | resultado |
|---|---|---|
| estado == `SPEC_APPROVED` | `harness pipeline state captura-em-producao` | **`SPEC_APPROVED`** `[MEDIDO 2026-09-07]` |
| o ledger é a identidade | `harness pipeline show captura-em-producao` | `approve spec` em `2026-09-07T18:23:31Z` com a leitura adotada (SPEC-004 integral, `P1–P10` nos defaults; `P7` com o `quant-architect` como pré-condição do DoD de F1); `advance SPEC_APPROVED` e `dispatch tech-lead` no mesmo segundo — **não repetido** `[MEDIDO]` |
| `index.md` do plano existe | `wc -l docs/plans/SPEC-004-captura-em-producao/*.md` | 4 arquivos (`index` 42 · `01` 35 · `02` 32 · `03` 41 linhas) `[MEDIDO]` |
| destino no tracker | `harness policy --key tracker` | `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}` `[MEDIDO]` |
| integração do tracker | `mcp__atlassian__jira_search` `project = CST AND (summary ~ "Captura em produção" OR labels = spec-004)` | **autenticado; 0 issues** — nada a duplicar `[MEDIDO 2026-09-07]` |
| vocabulário de componentes | `harness policy --key components` | `["sentimento","charts","convergencia","backtest","web","docs","infra"]` — **7** (`CLAUDE.md` lista 6; `[GAP G1]` da irmã, dono owner, **não** desta feature) `[MEDIDO]` |
| rev de ancoragem | `git rev-parse --short HEAD` | `b7f9fdb` (a SPEC mediu em `0acf947`; nenhum arquivo citado pela SPEC mudou entre os dois — `[NÃO MEDIDO]` por diff, assumido pela ausência de commit de `backend/` desde então) |

**O texto da `SPEC-004` (linha 3) e do `index.md` (linha 3) diz `SPEC_DRAFT`; o ledger diz `SPEC_APPROVED`.** O ledger manda. O resíduo textual, mais o `Status: proposta` das duas ADRs, vira task de `docs` (`T-01.9` para SPEC/plano/ADR-031; `T-03.6` para ADR-032, porque a co-assinatura do `infra-architect` é o gate de F3) — mesmo padrão da irmã (`T-01.10`).

---

## 1. A leitura de `P1–P10` que esta quebra obedece

O motivo do `approve spec` fixa **SPEC-004 integral, `P1–P10` nos defaults**. Efeito na quebra:

| decisão | efeito na task |
|---|---|
| `P1` Postgres por adaptador (`ADR-031/D1`) | `T-02.3` (adaptador + equivalência), `T-02.4` (composição única por `INGEST_RECORD_BACKEND`), `T-02.6` (`src.main`) |
| `P2` `timescale/timescaledb:2.17.2-pg15` | 1 linha em `T-03.4`; o Postgres efêmero de F2 (`T-02.2`, `T-02.7`, `T-02.8`) usa a **mesma** imagem — `ADR-031/F4` mede de graça |
| `P3` base + overlay explícito (`ADR-032/D1`) | `T-03.4` (base, 7 serviços) e `T-03.5` (overlay, 3 serviços) são tasks distintas: `D3.4` e `D3.5` medem coisas diferentes |
| `P4` `.env` único na raiz | `T-03.3` (`.env.example`) e `T-03.5` (`make compose-*` só concatenam `--env-file .env`) |
| `P5` `MAXLEN ~ 100000` + `maxmemory 64mb noeviction` | `T-01.3` (produtor) e `T-03.4` (Redis); `T-01.8` mede 24 h e pode mandar trocar os dois números (`ADR-032/F6`) |
| `P6` não implantar | nenhuma task de `up` fora da máquina local; `R-E` é cláusula de **toda** task de F3 |
| **`P7` definição de run — `quant-architect`** | **`T-01.1`** nasce como **primeira task de F1**, sem dependências, e é `depends_on` de `T-01.6` (mapeamento), `T-01.8` (medição cita os `endpoint`) e `T-03.3` (valor de `PREMIUM_INDEX_CYCLE_INTERVAL_S`, `[Q2]`). Fase `01` **não fecha** sem `gates/Q3-run-definition.md` (`D1.6`) |
| `P8` liveness mínima; `healthcheck` declarado, não implementado | `T-03.6` é o gate do `infra-architect` — ele decide se implementa; a task existe para que a decisão tenha artefato e data |
| `P9` gravação crua — `[NÃO SEI]` | decidida **dentro de `T-01.1`**; `T-01.6` só garante o invariante `n_returned` = publicados |
| `P10` destino de `T-07.15/16/17` | **não é desta feature** — proposta em §7, sem execução |

---

## 2. Princípios da quebra — e por que não copiei os itens do plano 1:1

1. **Uma task = uma unidade coesa com DoD próprio**, não um item do plano. Fundi onde dois itens só fecham juntos: `2.4` + `2.5` → `T-02.3` (o teste de equivalência **é** a prova de que o adaptador não inventa — separado, viraria "task de teste" onde a coluna "morde" se perde); `2.1` + `2.9` → `T-02.1` (mesmo autor, mesmo gate file, o plano já permite); `3.4` + `3.6` → `T-03.5` (o overlay e os alvos de `make` são "o alvo local existe e tem nome"); `1.9` (eventos de log) distribuído em `T-01.5` (`collector_boot_refused`) e `T-01.6` (`session_closed`/`cycle_completed`) — evento vive na task que o emite. Separei onde um item escondia duas unidades: `1.3` + `1.4` → `T-01.4` (adaptador de publicação, testável com `fakeredis`) e `T-01.5` (o processo: threads, boot, `SIGTERM`).
2. **Teste vive na task que ele mede**, salvo os **testes de processo real** (`T-01.7`, `T-02.7`), que atravessam dois processos e ficam **fora de `make verify`** até o owner decidir (`R-G`) — por isso são tasks próprias, com o falsificador que fecham nomeado (`ADR-027/F3`, `CA-F2-3`).
3. **`depends_on` só com aresta real** (arquivo, símbolo ou instrumento que a task de destino precisa que exista). A ordem `F1 → F2 → F3` (`RN-1`) é imposta pelo portão de fase do workflow, não por aresta fabricada. As arestas **entre fases** são de código: `T-02.4 → T-01.5` (retrofit do coletor para a composição única), `T-02.5 → T-01.2` (`decode`), `T-02.7 → T-01.4` (publica via a porta real, não fake), `T-02.8 → T-01.6` (o coletor precisa gravar runs), `T-03.3 → T-01.1` (valor de `[Q2]`).
4. **Os gates dos juízes são tasks, não chaves** (`T-01.1`, `T-02.1`, `T-03.6`) — `blocked_reason` **não é chave válida** (`V-09` a ignora; `harness status` mostra 5 avisos na mãe exatamente por isso). Uma pré-condição escrita em `depends_on` é greppável em `harness tasks json`; uma escrita em chave ignorada não é.
5. **Prefixo de título = lista `components`, na mesma ordem** (`[sentimento][docs]` ⇔ `["sentimento","docs"]`), enum fechado de `harness policy --key components`.
6. **Nenhuma task copia o DoD `import redis` de `T-07.15`** — ele mede zero por construção (`gates/PRD-004-architect.md` C1). O instrumento é `RedisStreamPublisher(` fora do bus (`D1.4`).
7. **Contagem que não bate, declarada:** `SPEC-004 §3.6` diz *"6 + 13"* variáveis em `.env.example`, mas **lista 15 nomes** `[MEDIDO 2026-09-07: contagem manual dos nomes em §3.6 → 15]`. `T-03.3` ancora no DoD executável (`D3.10`: toda `${VAR}` dos dois compose presente no exemplo), não na aritmética.

---

## 3. As tasks — fase `01` · O coletor publica e se registra (9)

Componente `sentimento`; `docs` em `T-01.1`, `T-01.8`, `T-01.9`. Requisitos: `US-1..3`, `RF-1..4`, `RN-2`, `RN-4`, `RN-8`, `CA-F1-1..5`; borda `B1–B3`, `B8`, `B14`. DoD por ID (`D1.x`) remete a `01_coletor_publica_e_se_registra.md` — **não transcrevo o comando**, cito onde está. Juiz: `quant-architect`.

| id | título | escopo (o que entra) | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-01.1` | `[sentimento][docs]` Gate `Q3` do `quant-architect` — definição de run | `gates/Q3-run-definition.md`: o que é um run para stream e ciclo; literais `source` (`[Q11]`, com o store do owner ou `[NÃO SEI]` declarado) e `endpoint` (proposta `!forceOrder@arr`, `/fapi/v1/premiumIndex`); `window`, `src_sha256`, `weight_used`, `clock_skew_ms`, `observer_*`; `n_expected` para stream; **`[Q2]`** valor de `PREMIUM_INDEX_CYCLE_INTERVAL_S`; **`P9`** gravação crua; co-assina `ADR-031` | `D1.6`: `test -f … && grep -c 'quant-architect' → ≥ 1`. Morde: ausente ⇒ **fase não fecha** | — | `P7`, `P9`, `[Q1]`–`[Q3]`, `[Q11]`, `ADR-031/D3`, `US-3` |
| `T-01.2` | `[sentimento]` `series_row_wire.py` — dono único do wire | `encode(SeriesRow) -> Mapping[str,str]` / `decode` dos **15** campos; chave = nome do campo; ints decimais, enums `.name`, bools `"0"/"1"`, sem `None`; exceção tipada em inglês para campo ausente/extra/inválido; teste parametrizado 4 `Provenance` × 15 | `D1.1` (`grep -rln 'def decode' …/infra \| wc -l → 1`), `D1.2` (`pytest -k 'wire and round_trip'`). Morde: mutante que troca 2 campos ou apaga `is_final` reprova nomeando o campo | — | `RF-2`, `RN-2`, `CA-F1-2` (C3), `§3.2` |
| `T-01.3` | `[sentimento]` `MAXLEN ~ REDIS_STREAM_MAXLEN` em `RedisStreamPublisher.publish` | parâmetro (construtor ou `publish`), default `100000`; `redis_stream_bus.py:58` continua o **único** `XADD`; teste com `fakeredis` afirma o argumento | `D1.3`: `grep -c MAXLEN redis_stream_bus.py → ≥ 1` (hoje 0); `XADD` fora do bus → 0. Morde: `MAXLEN` ausente ⇒ `RN-5` | — | `RNF-2`, `RN-5`, `P5`, `ADR-032/D4`, `CA-F3-9` (metade backend) |
| `T-01.4` | `[sentimento]` Porta de publicação dos dois coletores | adaptador em `infra` (`redis_stream_series_sink.py`, nome sugerido) que implementa `PremiumIndexSink.write` e o equivalente do `forceOrder`: `encode(row)` ⇒ `publish`; conexão injetada; falha de `XADD` **propaga** (nunca `except` vazio) | `D1.4` (metade): `grep -rn 'RedisStreamPublisher(' backend/src \| grep -v redis_stream_bus.py \| wc -l → ≥ 1` (hoje 0). Morde: `XADD` fora do bus ⇒ 1 | `T-01.2`, `T-01.3` | `RF-1`, `US-1`, `CA-F1-1`, `§3.1` publicação |
| `T-01.5` | `[sentimento]` `collectors_cli` — 1 processo, 2 threads, boot fail-fast, `SIGTERM` | `python -m src.modules.sentimento.infra.collectors_cli`; threads `forceOrder` (`reconnect_and_key`) e `premiumIndex` (`collect_premium_index_once` a cada `PREMIUM_INDEX_CYCLE_INTERVAL_S`); boot resolve `REDIS_*`, `INGEST_RECORD_BACKEND`, faz `PING` e `describe_readiness()`; `rc ≠ 0` ≤ 5 s nomeando a variável (`collector_boot_refused{variable}`); `XADD` falho ⇒ sessão `REJECTED`, `rc ≠ 0`; `SIGTERM` ⇒ `rc=0`; store `sqlite` nesta fase | `D1.4` (metade): `REDIS_HOST=nao-existe python -m … → rc ≠ 0` ≤ 5 s, saída contém `REDIS_HOST`; `D1.8`: `SIGTERM ⇒ rc=0` + 1 run com `ended_at` finito. Morde: sobe sem Redis ⇒ repetiu o defeito de hoje; `SIGKILL` ⇒ nenhum run (afirmado) | `T-01.4` | `RF-1`, `RN-4`, `US-1`, `B1`, `B2`, `B8`, `B14`, `ADR-027/D1` |
| `T-01.6` | `[sentimento]` Registro por sessão/ciclo — 16 campos de `IngestRun` conforme `Q3` | módulo de mapeamento (cita `gates/Q3-run-definition.md`); `record_run` no fechamento de sessão/ciclo pelo store configurado; `n_written = 0`; `n_returned` = publicados; `verdict ∈ KNOWN_VERDICTS`; `run_id` `uuid4`; eventos `collector_session_closed`/`collector_cycle_completed{endpoint,n_published,verdict,run_id}` | `D1.5`: `sqlite3 … "select source,endpoint,count(*) … group by 1,2" → ≥ 2 pares` além de `/fapi/v1/time`; `verdict` fora do conjunto → 0. Morde: antes de rodar ⇒ só `/fapi/v1/time` | `T-01.1`, `T-01.5` | `RF-4`, `US-3`, `CA-F1-4` (C4), `§3.3`, `ADR-031/D3` |
| `T-01.7` | `[sentimento]` Teste de integração com listener real — produtor morto a meio | publicar 10, `kill -9` após a 5ª, subir consumidor, `read_pending` → 5 na `PEL`, 0 perdidas; listener `fakeredis.TcpFakeServer` ou `redis:7-alpine`; **fora de `verify`** (`R-G`) | `D1.7`: `pytest -k 'producer_killed and pending'`. Morde: `XREAD` sem grupo ⇒ 0 na `PEL` | `T-01.4`, `T-01.5` | `RF-3`, `US-2`, `CA-F1-3`, `B3`, `ADR-027/F3` |
| `T-01.8` | `[sentimento][docs]` Medição de vazão por 24 h | `XLEN` e `count(*)` em `t` e `t+24h` → `medicoes/CA-F1-5-vazao-24h.md` com comando, `n` e rótulo; insumo de `P5`/`M4` | `D1.9`: `test -f … && grep -cE '\[MEDIDO' → ≥ 2`. Morde: enche `100 000` em < 1 h ⇒ `ADR-032/F6` dispara — escalar, não ajustar | `T-01.5`, `T-01.6` | `CA-F1-5`, `[Q1]`, `RNF-3`, `ADR-032/F6` |
| `T-01.9` | `[docs]` Resíduo textual pós-`approve` | `SPEC-004` l.3 e `index.md` l.3 passam a apontar o ledger (`SPEC_APPROVED` em `2026-09-07T18:23:31Z`, `P1–P10` nos defaults); `ADR-031` status `aceita` com a co-assinatura de `T-01.1`; linha append-only em `docs/INDEX.md` | `grep -c 'SPEC_DRAFT' <cabeçalhos> → 0` salvo citação histórica; `grep -c aceita ADR-031 → ≥ 1`. Morde: n/a — é docs | `T-01.1` | `CLAUDE.md` §ledger |

## 3b. Fase `02` · O escritor vira processo e o registro vira um só (8)

`sentimento` (sink, lookup, adaptador, CLI); `infra` em `T-02.6`/`T-02.8`; `docs` em `T-02.1`. Requisitos: `US-4..7`, `RF-5..7`, `RF-10`, `RN-3`, `RN-4`, `CA-F2-1..5`; borda `B4–B7`, `B9`. Postgres de pé = `timescale/timescaledb:2.17.2-pg15` **efêmero** (padrão `tests/backtest/test_postgres_run_registry_store.py:74-90`), **não** compose. Juízes: `quant-architect` (DDL, `[Q10]`), `infra-architect` (composição).

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-02.1` | `[sentimento][docs]` Gate DDL da série + `[Q10]` | `gates/F2-series-ddl.md`: nome da tabela, hypertable por `bucket_end`, **chave de unicidade declarada**, `provenance` como coluna, `compaction_epoch`/`content_hash` (`ADR-002/D6` emenda), layout de `T-07.6`/`T-07.8`; `[Q10]`: `md.ingest_gap` por reconexão e destino de mensagem envenenada (`B7`) | `D2.2`: `test -f … && grep -cE 'unique\|UNIQUE\|chave' → ≥ 1`. Morde: ausente ⇒ **fase não fecha** (a chave de `D2.4` não existe) | — | `§3.4` tabela, `[Q10]`, `ADR-002/D4,D6` |
| `T-02.2` | `[sentimento]` `PostgresSeriesSink` + `PostgresObservedLookup` | `infra/postgres_series_sink.py`: `SeriesSink` com **commit dentro de `write_series_row`** e upsert-noop para reentrega idêntica; `ObservedLookup`; conexão injetada; `psycopg` só em `infra` (`lint-imports`) | `D2.9` (`lint-imports`); teste: mesma linha `OBSERVED` 2× ⇒ 1 linha; commit visível por outra conexão antes do retorno. Morde: `psycopg` em `use_cases` ⇒ `lint-imports` reprova | `T-02.1` | `RF-6`, `CA-F2-2/3` (com `T-02.7`), `ADR-002/D5`, `ADR-031/F5` |
| `T-02.3` | `[sentimento]` `PostgresIngestRecordStore` + equivalência de `fingerprint()` | superfície de `SqliteIngestRecordStore` (6 métodos); `initialise()` idempotente (`md.ingest_run` 16 col., `md.ingest_gap` 8); RAW, sem coerção; teste: mesmos runs/gaps nos dois motores ⇒ `ingest_health_query(x).fingerprint()` igual | `D2.6`: `pytest -k 'ingest_record_store and fingerprint'` sobre ≥ 3 runs + ≥ 1 gap. Morde: coerção plantada (`api_code` `None→0`) ⇒ difere | — | `RF-10`, `RN-3`, `US-7`, `ADR-031/D1, F1` |
| `T-02.4` | `[sentimento]` Composição única do store por `INGEST_RECORD_BACKEND` | 1 função em `infra` (`sqlite`\|`postgres`, default `sqlite`; `POSTGRES_HOST`/`PORT` novos, defaults `postgres`/`5432`); `collectors_cli` (retrofit de `T-01.5`) e `single_writer_cli` a usam; valor inválido/Postgres inalcançável ⇒ recusa em inglês nomeando a variável; `postgres` + `INGEST_HEALTH_STORE_PATH` presente **não** é erro | `D2.5` (metade coletor): `INGEST_RECORD_BACKEND=foo ⇒ rc ≠ 0` nomeando a variável. Morde: retry infinito ⇒ `timeout 10` dá `124` | `T-02.3`, `T-01.5` | `RF-7`, `RF-10`, `RN-4`, `B9`, `ADR-031/D1, D3` |
| `T-02.5` | `[sentimento]` `single_writer_cli` — único call site de produção | `connect_resp2` → `RedisStreamConsumerGroup` → `ensure_group()` → `RedisSeriesWriteQueue(group, decode)` → `run_single_writer(queue, lookup, sink, batch_size=WRITER_BATCH_SIZE)`; fila vazia dorme `WRITER_POLL_INTERVAL_MS`; boot fail-fast; eventos `writer_boot_refused`, `writer_batch_acked`, `writer_message_rejected`; `B7`: mensagem inválida fica na `PEL`, processo segue; grava `ingest_gap` **só se** `[Q10]` disser | `D2.1`: `find … single_writer_cli.py \| wc -l → 1`; `test_single_writer_call_sites.py` → **1**; `D2.5`: `REDIS_HOST=nao-existe … ⇒ rc ≠ 0` ≤ 5 s, idem `POSTGRES_HOST`. Morde: 2º call site ⇒ o teste AST reprova | `T-02.2`, `T-02.4`, `T-01.2` | `RF-5`, `RF-7`, `US-4`, `US-6`, `CA-F2-1/4`, `B7`, `B9` |
| `T-02.6` | `[infra]` `src.main` escolhe o store por env; `/ready` com DSN sem senha | `src/main/__init__.py:144` usa a composição de `T-02.4`; `create_app` recusa inválido; `/ready` mantém `SPEC-003 §3.4`, `path` = `postgresql://<user>@<host>:<port>/<db>` | `D2.7`: `curl /ready \| jq .store.schema_present → true`; `jq -r .store.path \| grep -c "$POSTGRES_PASSWORD" → 0`. Morde: `INGEST_RECORD_BACKEND=foo` ⇒ não sobe, saída contém a variável | `T-02.4` | `US-7`, `RN-4`, `B9`, `B10`, `ADR-031/D1`, `ADR-029/D3` |
| `T-02.7` | `[sentimento]` Teste de processo real do escritor — restart sem perda nem duplicata; predicado preservado | subir `single_writer_cli`, publicar N=100 via `T-01.4`, `kill -9` a meio, reiniciar; e `OBSERVED` depois `MODELED` mesma chave; **fora de `verify`** (`R-G`) | `D2.4`: `count(*) → 100`, duplicatas → **0**; `D2.3`: `select provenance → OBSERVED`. Morde: `ack` antes do commit ⇒ < 100; sem upsert-noop ⇒ > 0; sink direto ⇒ `MODELED` | `T-02.5`, `T-01.4` | `US-5`, `CA-F2-2/3`, `B4–B6`, `ADR-002/D5` |
| `T-02.8` | `[sentimento][infra]` Prova de registro único — coletor e API sobre o mesmo Postgres efêmero | `collectors_cli` e `create_app` em `postgres` no mesmo container; 1 sessão + 1 ciclo; relatório `gates/D2.8-registro-unico.md` com comando e `n` | `D2.8`: `curl … /collector-status \| jq .n_rows → ≥ 2` (≥ 3 é `CA-E2E-1`, em `03`). Morde: API em `sqlite` ⇒ 0 ou 1 | `T-02.4`, `T-02.6`, `T-01.6` | `US-7`, `CA-F2-5` (precursor), `ADR-031/F2` |

## 3c. Fase `03` · Sobe por `compose` em dois alvos (8)

`infra`; `docs` em `T-03.6`/`T-03.7`. Requisitos: `US-8..10`, `RF-8`, `RF-9`, `RF-11`, `RF-12`, `RN-5`, `RN-7`, `CA-F3-1..9`, `CA-E2E-1..3`; borda `B10–B13`. Convenção do plano: `D` = `docker compose --env-file .env -f deploy/compose.yml`; `L` = `D -f deploy/compose.local.yml`. **Nenhuma implantação** (`R-E`, `P6`). Juiz: `infra-architect`.

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-03.1` | `[infra]` `backend/Dockerfile` + `.dockerignore` | `python:3.13-slim`, **uma** imagem, sem `ENTRYPOINT` lógico; ignora `.venv`, `tests/`, `data/`, `.env*`, `__pycache__` | `D3.2` (metade), `D3.6` (metade: imagem sem `.env*` → 0), `D3.8`; `ADR-032/F5`: ≤ 400 MB. Morde: `.dockerignore` sem `.env*` ⇒ ≥ 1 | — | `RF-8`, `G1`, `RNF-5`, `ADR-032/D2` |
| `T-03.2` | `[infra]` `frontend/Dockerfile` + `.dockerignore` | `node:22-alpine`, `npm ci && npm run build`; ignora `node_modules`, `.next`, `.env*`; constrói de árvore limpa (PR #166 §1, cache `.next`). **Os únicos caminhos de `frontend/` no escopo desta feature** | `D3.2` (metade), `D3.6` (metade). Morde: `mv frontend/Dockerfile /tmp && $D build` ⇒ reprova nomeando `web` | — | `RF-8`, `G1`, `§3.6.1` linha 4, `ADR-032/D2` |
| `T-03.3` | `[infra]` `.env.example` completo — os 15 nomes de `§3.6` (G9 incluído) | `POSTGRES_DB/USER/PASSWORD/HOST/PORT`, `REDIS_HOST/PORT/STREAM/STREAM_GROUP/STREAM_MAXLEN`, `REDIS_MAXMEMORY`, `INGEST_RECORD_BACKEND` (comentário: `sqlite` para dev sem compose), `WRITER_BATCH_SIZE`, `WRITER_POLL_INTERVAL_MS`, `PREMIUM_INDEX_CYCLE_INTERVAL_S` (valor de `T-01.1`); comentário por variável; nota sobre `frontend/.env.local` só para `next dev` sem docker (não é 2º arquivo de verdade) | `D3.10`: loop sobre `${VAR}` dos dois compose → nenhum `MISSING` (hoje 3 `POSTGRES_*`); `harness rules --mode file --path .env.example` → vazio. Morde: remover 1 linha ⇒ `MISSING` | `T-01.1` | `RF-12`, `G9`, `ADR-032/D3`, `§3.6.1` linhas 1–2 |
| `T-03.4` | `[infra]` `deploy/compose.yml` estendido para os 7 serviços | `postgres.image` → `timescale/timescaledb:2.17.2-pg15`; `redis:7-alpine` (`--appendonly yes --maxmemory ${REDIS_MAXMEMORY} --maxmemory-policy noeviction`, `healthcheck redis-cli ping`, `redis_data`, `logging 10m×3`); `writer` e `collector` (mesma imagem, `command:` de `§3.6`, `env_file ../.env`, `depends_on service_healthy`, `logging`); `api.depends_on` `service_healthy`; cabeçalho atualizado; **sem** `ports:` em `api`, **sem** `profiles:` no base | `D3.1`, `D3.2`, `D3.4` (`api caddy collector postgres redis web writer`), `D3.8`, `D3.9`. Morde: sem `.env` ⇒ erro de interpolação (`B12`, desejado); one-shot ⇒ 8; `profiles:` ⇒ 6 | `T-03.1`, `T-03.2`, `T-03.3` | `RF-8`, `RNF-4`, `RN-5`, `US-8`, `CA-F3-1/2/5/6/7/9`, `ADR-032/D1, D4, D5`, `ADR-031/D2`, `ADR-029/D5` |
| `T-03.5` | `[infra]` `deploy/compose.local.yml` + `make compose-deploy`/`compose-local` | overlay com **exatamente 3** serviços: `caddy: profiles: ["deploy-only"]`, `api.ports 127.0.0.1:${APP_PORT}:${APP_PORT}`, `web.ports 127.0.0.1:3000:3000` + `INGEST_HEALTH_API_BASE_URL` no `web` (`D3.16`; se o `infra-architect` preferir no base via `environment:`, `D3.5` vale igual); alvos de `make` só concatenam `--env-file .env -f …` e aceitam `ARGS`; **não** entram em `verify` | `D3.3` (`api collector postgres redis web writer`, 6; `host_ip: 127.0.0.1` → 2), `D3.5` (`grep -cE '^  [a-z_-]+:$' → 3`), `D3.16` (metade `config`). Morde: `$D config --services` sozinho contém `caddy` — os alvos **têm de diferir**; 4º serviço ⇒ `ADR-032/F3` | `T-03.4` | `RF-9`, `US-9`, `CA-F3-3`, `ADR-032/D1, D3, F2, F3`, `§3.6.1` linha 1 |
| `T-03.6` | `[infra][docs]` Gate do `infra-architect` sobre F3 — co-assinatura e `P8` | `gates/F3-infra-architect.md`: co-assina `ADR-032` (status → `aceita`) e `ADR-031/D2`; decide `[Q6]`/`P8` — implementa `healthcheck` por comando em `writer`/`collector` (1 bloco por serviço) **ou** deixa declarado em `ADR-032/D5` com motivo | `test -f … && grep -c 'infra-architect' → ≥ 1`; se implementou: `$D config \| grep -c healthcheck → ≥ 4`. Morde: n/a — é decisão com artefato | `T-03.4`, `T-03.5` | `P8`, `[Q6]`, `ADR-032/D5, F7` |
| `T-03.7` | `[infra][docs]` Medição de pegada — RSS e imagens | `docker stats --no-stream` após 10 min de `up` local + `docker image ls` → `medicoes/CA-F3-8-pegada.md`; soma RSS `api+writer+collector+redis` ≤ **176 MB**; imagem backend ≤ **400 MB**; `collector` com Postgres ≤ **+10 MB** sobre 23,2 MB (`ADR-031/F3`) | `D3.11`: `grep -cE '\[MEDIDO' → ≥ 2`. Morde: acima ⇒ falsificador dispara — **escalar ao `/architect`**, não ajustar o teto | `T-03.5` | `CA-F3-8`, `RNF-1`, `RNF-5`, `ADR-027/F2`, `ADR-031/F3`, `ADR-032/F5` |
| `T-03.8` | `[infra]` Ponta a ponta local — a SPEC se liga | `$L up` ≥ 1 sessão + 1 ciclo; `/collector-status` `200`, `n_rows ≥ 3`, séries com os 2 `endpoint` de `Q3`; `/ready` `schema_present=true`; `OBSERVED` cresce em Postgres; `stop collector writer` ⇒ `n_rows` igual e `PARADO` após `stale_after_s`; `/painel` renderiza **sem** `frontend/.env.local`; diff de contrato vazio; relatório `gates/CA-E2E-local.md` | `D3.7`, `D3.12`, `D3.13`, `D3.14`, `D3.16` (metade `curl`). Morde: `n_rows < 3` com F1+F2+F3 fechadas ⇒ **falsificador da SPEC (§9)** — defeito de desenho (§3.3/§3.5), escalar | `T-03.5` | `US-10`, `CA-F3-4`, `CA-E2E-1..3`, `B10`, `B11`, `§9` |

`RF-11` (one-shots **não** viram serviço) é cláusula negativa de `T-03.4` (`D3.4` = exatamente 7) — não precisa de task própria.

---

## 4. Grafo de dependências — só arestas reais

```
F1  T-01.1 (Q3) ──────────────┬──▶ T-01.6 ──┬──▶ T-01.8
    T-01.2 (wire) ─┐          │             │
    T-01.3 (MAXLEN)┴▶ T-01.4 ─┴──▶ T-01.5 ──┴──▶ T-01.7        T-01.1 ──▶ T-01.9
F2  T-02.1 (DDL) ──▶ T-02.2 ─────────┐
    T-02.3 ──▶ T-02.4 (←T-01.5) ──┬──┴▶ T-02.5 (←T-01.2) ──▶ T-02.7 (←T-01.4)
                                  └──▶ T-02.6 ──▶ T-02.8 (←T-01.6, ←T-02.4)
F3  T-03.1 ─┐
    T-03.2 ─┼──▶ T-03.4 ──▶ T-03.5 ──┬──▶ T-03.6
    T-03.3 ─┘ (←T-01.1)              ├──▶ T-03.7
                                     └──▶ T-03.8
```

Sem dependência, podem sair juntas: F1 `T-01.1`, `T-01.2`, `T-01.3` · F2 `T-02.1`, `T-02.3` · F3 `T-03.1`, `T-03.2` (`T-03.3` espera só `T-01.1`, já fechada quando F3 abre). Caminho crítico: `T-01.2 → T-01.4 → T-01.5 → T-01.6 → T-01.8` (a medição de 24 h é a cauda de F1); `T-02.1 → T-02.2 → T-02.5 → T-02.7`; `T-03.{1,2,3} → T-03.4 → T-03.5 → T-03.8`.

---

## 5. Tracker — cardadas nesta sessão, com o vocabulário certo

`tracker.kind = jira` (`CST`, board `36`, Epic → `Tarefa`). MCP `atlassian` **autenticado** `[MEDIDO 2026-09-07: jira_search rc ok, 0 issues para "Captura em produção"/spec-004]`. Convenção herdada da irmã (`CST-112`/`CST-115` lidas por `jira_get_issue`): Epic `Captura em produção · F<n> · <nome da fase>` com labels `captura-em-producao`, `fase-0N`, `spec-004`; `Tarefa` `T-NN.k · <title>` com `parent` = Epic da fase e labels `fase-0N`, `spec-004`, + componentes; descrição com plano, `depends_on` e `refs`.

**Epic pai `CST-5` (UV do PRD §6, `[INFERRED I-4]`) foi recusado em favor de Epics próprios da filha** — mesma decisão da irmã (`CST-112..114`): o Epic é a unidade de fase do `/build`, e `CST-5` já é pai de `CST-109/110/111` da mãe, que esta feature **supersede** (§7); misturar os dois no mesmo Epic apagaria a fronteira que `P10` pede para manter visível.

**Criadas nesta sessão `[MEDIDO 2026-09-07, 28 chamadas `jira_create_issue`, 28 `Issue created successfully`; 1 rejeição por resumo > 255 caracteres, corrigida]`:** Epics **`CST-140`** (F1) · **`CST-141`** (F2) · **`CST-142`** (F3); Tarefas **`CST-143..151`** (`T-01.1..9`), **`CST-152..159`** (`T-02.1..8`), **`CST-160..167`** (`T-03.1..8`) — `tracker = { provider = "jira", id, url }` inline em cada task do `tasks.toml`. Eixo: `harness tasks list captura-em-producao` → `uncarded=0`. **Nenhuma task `local_only`** — não houve decisão de não cardar.

Efeito colateral do limite do Jira: seis títulos (`T-02.5`, `T-03.4`–`T-03.8`) foram **encurtados** antes de criar; o `title` do `tasks.toml` é a forma encurtada, idêntica ao `summary` do Jira menos o prefixo `T-NN.k · `. As tabelas de §3 descrevem o escopo por extenso — o título é o rótulo, o `refs` é o contrato.

---

## 6. Escopo de caminhos — o que o portão de escrita usa

`harness pipeline scope captura-em-producao add backend/ deploy/ Makefile .env.example frontend/Dockerfile frontend/.dockerignore docs/specs docs/plans docs/adr docs/context/captura-em-producao docs/INDEX.md`

- **`frontend/Dockerfile` e `frontend/.dockerignore` são exatos, não `frontend/`** — a SPEC os exige (`§3.6`, plano `3.2`) e proíbe qualquer linha em `frontend/src` (`CA-E2E-3`, `R-D`). Prefixo largo licenciaria o que a SPEC proíbe.
- **`docs/context/plataforma-dados` fica fora**: `P10` é escopo da mãe; o coordenador aplica (§7).
- **Colisão com a mãe/irmã — hoje não prevista, mas conferida:** `harness pipeline scope plataforma-dados list` → só `docs/context/plataforma-dados` (re-escopada); irmã `camada-de-leitura-do-painel` em `DONE` `[MEDIDO 2026-09-07]`. Se o portão contar `DONE` como reivindicante de `backend/src`/`deploy`/`Makefile`/`.env.example`/`docs/*` — `[NÃO SEI]`; o primeiro `require-code` desta feature responde, e a saída é `override` de **uma** delas (padrão já usado 31× na mãe).

---

## 7. `P10`/`M1` — destino de `T-07.15/16/17` da mãe: **PROPOSTA, sem execução**

Default `(a)` do PRD (`superseded`, refs para a filha). Mapeamento task-a-task, herdando o que cada uma da mãe prometia:

| mãe | Jira | o que prometia | quem fecha na filha |
|---|---|---|---|
| `T-07.15` | `CST-110` | wire `SeriesRow ↔ Mapping`, coletores publicam via `RedisStreamPublisher`, teste de produtor morto | `T-01.2` (wire), `T-01.4` (publicação), `T-01.5` (processo), `T-01.7` (produtor morto). ⚠ DoD `import redis` **não** herdado (C1) |
| `T-07.16` | `CST-111` | `single_writer_cli` com sink real, 1 call site, restart sem perda/duplicata | `T-02.2` (sink), `T-02.5` (CLI), `T-02.7` (restart) |
| `T-07.17` | `CST-109` | `compose.yml` com `redis:7-alpine` + serviço do escritor, `own.compose-hardcoded-secret` `rc=0`, fim a fim local | `T-03.4` (7 serviços), `T-03.5` (alvo local), `T-03.8` (fim a fim) |

Comando para o coordenador (escopo da mãe — **não executado aqui**; `resolve` só aceita `done`/`blocked`, logo `superseded` é `blocked` com motivo):

```bash
harness tasks resolve plataforma-dados 07 \
  T-07.15=blocked:"superseded por captura-em-producao T-01.2/T-01.4/T-01.5/T-01.7 (SPEC-004 F1); DoD 'import redis' media zero por construcao (gates/PRD-004-architect.md C1)" \
  T-07.16=blocked:"superseded por captura-em-producao T-02.2/T-02.5/T-02.7 (SPEC-004 F2)" \
  T-07.17=blocked:"superseded por captura-em-producao T-03.4/T-03.5/T-03.8 (SPEC-004 F3)"
```

Jira, também para o coordenador: comentário em `CST-110`/`CST-111`/`CST-109` apontando os Epics da filha e transição para *Concluído/Cancelado* (menu `M1(a)`). ⚠ `harness status` acusa hoje *"fase(s) com QA APPROVED e tarefa(s) em aberto: 07 (T-07.15, T-07.16, T-07.17)"* — se `blocked` ainda contar como "em aberto" para essa anomalia `[NÃO SEI]`, a resposta é do owner (`M1(b)` mover / fechar como `done` com motivo), não deste `/tech-lead`.

---

## 8. Decisões do `/tech-lead` que o owner pode reverter — cada uma custa uma linha

| decisão | custo de reverter |
|---|---|
| Epics próprios da filha em vez de `CST-5` | mover 3 Epics no Jira |
| `1.9` (eventos) fundido em `T-01.5`/`T-01.6` | 1 task a mais |
| `2.4`+`2.5`, `2.1`+`2.9`, `3.4`+`3.6` fundidos | 1 task a mais cada |
| testes de processo (`T-01.7`, `T-02.7`) fora de `verify` | 1 linha em `scripts/verify.sh` — ato do owner (`R-G`) |
| `T-02.8` como task própria (D2.8) e não DoD de `T-02.6` | apagar 1 task |
| `frontend/Dockerfile` exato no scope | `scope add frontend/` — mas reabre `CA-E2E-3` |

## 9. O que esta narrativa NÃO faz

Não cria unidade de valor · não escreve código · não toca a mãe (`P10` é proposta) · não implanta · não decide `[Q12]` (owner) · não renomeia `janela_de_perda` nem os 4 eventos PT · não altera `harness.toml`/`CLAUDE.md`.
