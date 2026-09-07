# Fase `01` — O coletor publica e se registra

**Componente alvo:** `sentimento` · **SPEC:** `SPEC-004` §3.1, §3.2, §3.3, §3.7; §5 B1–B3, B8, B14 · **ADR:** `ADR-031/D3` (quem grava o run), `ADR-032/D4` (teto do Stream no produtor) · **PRD:** `US-1..3`; `RF-1..4`; `RN-2`, `RN-4`, `RN-8`; `CA-F1-1..5`
**Depende de:** nada. **Juiz:** `quant-architect` (assina `Q3`, `Q2`, `Q11`, `P9` em `gates/`). **Pré-condição de fechamento:** `docs/context/captura-em-producao/gates/Q3-run-definition.md` existe e está assinado (item 1.6).

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 1.1 | `infra/series_row_wire.py`: `encode`/`decode` dos **15** campos de `SeriesRow`, enums por `.name`, ints decimais, bools `"0"/"1"`; exceção tipada (inglês) para campo ausente/extra/inválido | `RF-2`, `RN-2` | `sentimento` | não muda `SeriesRow`; não toca `domain/` |
| 1.2 | `RedisStreamPublisher.publish` ganha `MAXLEN ~ N` (parâmetro do construtor ou de `publish`); continua o **único** `XADD` | `RNF-2`, `P5` | `sentimento` | não muda `RedisStreamConsumerGroup`; não adiciona trim por `MINID` |
| 1.3 | `infra/collectors_cli.py`: 1 processo, 2 threads (`forceOrder` via `reconnect_and_key`; `premiumIndex` via `collect_premium_index_once` a cada `PREMIUM_INDEX_CYCLE_INTERVAL_S`); boot fail-fast (§3.1); `SIGTERM` fecha sessão e sai `rc=0` | `RF-1`, `RN-4`, `US-1` | `sentimento` | não altera os CLIs de probe existentes além de reaproveitar suas funções; não abre Postgres fora do composition root |
| 1.4 | Porta de publicação nos dois coletores: cada evento/leitura ⇒ `encode(row)` ⇒ `publish` — através de um `Sink` que os use cases já injetam (`PremiumIndexSink.write`; o equivalente do `forceOrder`) | `RF-1`, `CA-F1-1` | `sentimento` | não muda a assinatura das portas existentes |
| 1.5 | Registro por sessão/ciclo: `IngestRun` (16 campos, mapeamento de §3.3) via `record_run` do store configurado (`SqliteIngestRecordStore` nesta fase; `PostgresIngestRecordStore` entra em `02`); `n_written = 0`; `verdict ∈ KNOWN_VERDICTS` | `RF-4`, `US-3` | `sentimento` | não inventa `source`: usa o literal de `Q11` |
| 1.6 | **Gate `Q3`**: `quant-architect` escreve `gates/Q3-run-definition.md` — o que é um run para stream e ciclo, `endpoint` literais, `window`, `src_sha256`, `weight_used`, `clock_skew_ms`; e decide `P9` (gravação crua) e `Q2` (cadência) | `[Q3]`, `[Q2]`, `P9` | `sentimento` (`docs`) | não reabre `ADR-030` |
| 1.7 | Teste de integração com listener real (`fakeredis.TcpFakeServer` ou `redis:7-alpine`): publicar 10, `kill -9` produtor após a 5ª, subir consumidor, `read_pending` → 5 | `RF-3`, `CA-F1-3` | `sentimento` (`tests/`) | não usa `XREAD` sem grupo |
| 1.8 | Medição de vazão por 24 h: `XLEN` e `count(*)` em `t` e `t+24h` → `medicoes/CA-F1-5-vazao-24h.md` com comando e `n` | `CA-F1-5`, `[Q1]` | `sentimento` (`docs`) | não dimensiona `M4` — só mede |
| 1.9 | Eventos de log novos em inglês (§3.7): `collector_boot_refused`, `collector_session_closed`, `collector_cycle_completed` | `RN-8`, `R-F` | `sentimento` | não renomeia os 4 eventos PT |

## DoD — comando, universo e a coluna "morde"

Convenção: **Redis de pé** = `fakeredis.TcpFakeServer` (unit/integração) ou `redis:7-alpine` local; **store** = `INGEST_HEALTH_STORE_PATH` SQLite nesta fase.

| DoD | comando (de pé ⇒ verde) | morde (⇒ o que TEM de acontecer) |
|---|---|---|
| **D1.1** wire existe e é único | `test -f backend/src/modules/sentimento/infra/series_row_wire.py`; `grep -rln 'def decode' backend/src/modules/sentimento/infra \| wc -l` → **1** | 2º `decode` plantado ⇒ contagem 2 |
| **D1.2** round-trip | `cd backend && .venv/bin/pytest tests/sentimento -k 'wire and round_trip' -q` → passa sobre **4 `Provenance` × 15 campos** (parametrizado, `n ≥ 4`) | mutante que troca a ordem de 2 campos ou apaga `is_final` ⇒ reprova nomeando o campo |
| **D1.3** um `XADD` com teto | `grep -rn 'xadd\|XADD' backend/src --include='*.py' \| grep -v redis_stream_bus.py \| wc -l` → **0**; `grep -c 'MAXLEN' backend/src/modules/sentimento/infra/redis_stream_bus.py` → **≥ 1** (hoje 0) | `XADD` fora do bus ⇒ 1; `MAXLEN` ausente ⇒ `RN-5` |
| **D1.4** coletores publicam via o bus | `grep -rn 'RedisStreamPublisher(' backend/src --include='*.py' \| grep -v redis_stream_bus.py \| wc -l` → **≥ 1** (hoje 0) | `REDIS_HOST=nao-existe python -m src.modules.sentimento.infra.collectors_cli` ⇒ `rc ≠ 0` em ≤ 5 s, saída contém `REDIS_HOST` — se subir, repetiu o defeito de hoje |
| **D1.5** sessão/ciclo vira run | 1 sessão curta + 1 ciclo; `sqlite3 $INGEST_HEALTH_STORE_PATH "select source,endpoint,count(*) from ingest_run group by 1,2"` → **≥ 2 pares** além de `/fapi/v1/time`; `select count(*) from ingest_run where verdict not in ('ACCEPTED','ACCEPTED_WITH_WARNING','REJECTED')` → **0** | mesma consulta antes de rodar ⇒ só `/fapi/v1/time` |
| **D1.6** `Q3` assinado | `test -f docs/context/captura-em-producao/gates/Q3-run-definition.md && grep -c 'quant-architect' …` → **≥ 1**; o mapeamento de 1.5 cita o arquivo | ausente ⇒ **fase não fecha** |
| **D1.7** mensagem sobrevive ao produtor | `pytest tests/sentimento -k 'producer_killed and pending' -q` → **5 em `PEL`, 0 perdidas** | `XREAD` sem grupo ⇒ 0 em `PEL` |
| **D1.8** parada limpa | teste de processo: `SIGTERM` ⇒ `rc=0` e 1 run novo com `ended_at` finito | `SIGKILL` ⇒ nenhum run novo (é o comportamento esperado, e o teste o afirma) |
| **D1.9** vazão medida | `test -f docs/context/captura-em-producao/medicoes/CA-F1-5-vazao-24h.md && grep -cE '\[MEDIDO' …` → **≥ 2** | ausente ⇒ `F3` não dimensiona `P5` |
| **D1.10** portões | `make verify` verde (saída em disco); `cd backend && .venv/bin/lint-imports` verde; `/review` para `R-F` | `psycopg`/`socket` em `use_cases` ⇒ `lint-imports` reprova |
