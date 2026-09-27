# WI — builder: a API deixa de segurar transação aberta, e o timeout chega só nela

**Origem:** `D-2` de `handoff/DECISOES-DO-OWNER-2026-09-27.md:10` (worktree `wave-paineis-f03b`):
*"`idle_in_transaction_session_timeout` no acesso da API + task para achar a causa"*
`[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`.
**Desenho implementado:** [`handoff/WI-desenho-infra-architect.md`](../handoff/WI-desenho-infra-architect.md) (§2, §3, §5.1, §5.2).
**Laudo histórico:** `docs/context/candle-real-e-eixo-unico/gates/ESCALADO-api-idle-in-transaction.md`.
**Branch:** `wave/api-idle-tx`, a partir de `06f66fa`. Componente: `infra`.

## Veredito

A causa foi consertada e o timeout está no lugar. As duas conexões de vida longa de `create_app` nascem
com `autocommit=True`, pelo `connect=connect_autocommit` injetado. O padrão das funções de composição
compartilhadas continua `psycopg.connect`, então writer e coletor não mudam. `PGOPTIONS` com
`idle_in_transaction_session_timeout=30s` e `PGAPPNAME=cripto-api` entram **só** em
`services.api.environment`. Pelo §4 do desenho, as duas metades vão na mesma PR e no mesmo deploy.
**O deploy não foi feito**: ele é um ato separado, e o portão dele é o §5.3.

## Arquivos

| arquivo | o que mudou |
|---|---|
| `backend/src/modules/sentimento/infra/ingest_record_store_composition.py` | nova `connect_autocommit(conninfo)` → `psycopg.connect(conninfo, autocommit=True)`. O padrão das duas funções de composição **não mudou** |
| `backend/src/main/__init__.py` | `compose_ingest_record_store(os.environ, connect=connect_autocommit)` (conexão A) e `compose_postgres_connection(os.environ, connect=connect_autocommit)` (conexão B) |
| `deploy/compose.yml` | `services.api.environment` ganha `PGOPTIONS` e `PGAPPNAME`. Os dois comentários que diziam que `APP_HOST` era *"the ONE variable"* fixada foram atualizados (§3.1 do desenho pedia isso) |
| `backend/tests/main/test_api_connections_hold_no_transaction.py` | novo: §5.1 (a), (b), (c), mais a guarda do `PGOPTIONS` × `options=` |
| `backend/tests/main/test_compose_api_idle_transaction_timeout.py` | novo: §5.2, estático, sem rede |

## Os testes, e o caso que cada um REJEITA

O Postgres é o container efêmero da sessão de teste (`tests/helpers/postgres.py`). O Postgres de produção
local **não foi tocado**, nem para leitura.

| teste | rejeita |
|---|---|
| `test_served_api_leaves_no_session_idle_in_transaction` | o `app` real composto (sem `dependency_overrides` feito à mão), servido por socket, depois de `GET` em `/ready`, `/ingest-health`, `/collector-status` e `/series-history` (todas com `200`). Reprova se houver sessão da app `idle in transaction` em `pg_stat_activity`. Afirma **≥ 2 sessões** no `datname`, porque `0` sobre universo vazio é o `rc=0` ambíguo |
| `test_served_api_does_not_block_a_boot_alter[md.series]` / `[md.ingest_run]` | o dano: `SET lock_timeout='2s'; ALTER TABLE … ADD COLUMN IF NOT EXISTS _wi_probe int` levanta `LockNotAvailable` |
| `test_default_composition_stays_transactional_for_writer_and_collector` | alguém "consertar" trocando o **padrão** das funções compartilhadas, o que passaria `autocommit` para writer e coletor |
| `test_pgoptions_reaches_a_composed_connection` | um `options=` futuro em `_postgres_conninfo`, que faria o libpq ignorar o `PGOPTIONS` do compose **em silêncio** (o modo de falha do §3.1 do desenho, agora pego em pytest e não só no §5.3) |
| `test_real_compose_pins_the_timeout_on_the_api_alone` + 3 `test_checker_*` + `test_env_example_never_carries_the_timeout` | `PGOPTIONS` faltando no `api`, `PGOPTIONS` em qualquer outro serviço (forma de mapa e de lista), e o timeout ou `PGOPTIONS` no `.env.example`. Os casos sintéticos provam que o checker morde |

## Mutações — cada proteção mostrada reprovando

Comando de cada rodada: `make test-fast K="test_compose_api_idle or test_api_connections_hold"`
(universo: **10 testes**), com `__pycache__` purgado antes. O arquivo foi restaurado depois de cada
rodada, e a última rodada abaixo foi feita já na árvore restaurada `[MEDIDO 2026-09-27]`.

| mutação | resultado |
|---|---|
| nenhuma (o conserto no lugar) | `10 passed` |
| **A**: tirar `connect=connect_autocommit` da conexão A (`compose_ingest_record_store`) | `2 failed`: `…idle_in_transaction` (*"1 of 2 app sessions left idle in transaction"*) e `…boot_alter[md.ingest_run]` |
| **B**: tirar `connect=connect_autocommit` da conexão B (`compose_postgres_connection`) | `2 failed`: `…idle_in_transaction` (*"1 of 2"*) e `…boot_alter[md.series]` |
| **A+B**, que é o código de antes do conserto | `3 failed`: *"2 of 2 app sessions left idle in transaction"*, `boot_alter[md.series]` e `boot_alter[md.ingest_run]`. **Reproduz o vazamento** |
| **M4**: o padrão de `compose_postgres_connection` vira `connect_autocommit` | `1 failed`: `…stays_transactional_for_writer_and_collector` |
| **M5**: `options=-cstatement_timeout=0` acrescentado ao `_postgres_conninfo` | `1 failed`: `…pgoptions_reaches_a_composed_connection` |
| **M6**: tirar a linha `PGOPTIONS` do `api` no `compose.yml` | `4 failed` (`test_real_compose…` e os 3 `test_checker_*`, que partem do compose real) |
| **M7**: `PGOPTIONS` acrescentado ao `writer` | `3 failed` (`test_real_compose…` + 2 `test_checker_*`) |

Cada mutação da causa reprova **exatamente** a tabela que a conexão mutada lê: A pega `md.ingest_run`,
B pega `md.series`. Isso confirma o mapeamento do §1.1 do desenho, não só o sintoma `[MEDIDO]`.

## Portões

- `cd backend && .venv/bin/ruff check src tests/main && .venv/bin/ruff format --check src tests/main && .venv/bin/mypy --strict src tests/main`
  → `All checks passed!` · `223 files already formatted` · `Success: no issues found in 223 source files` `[MEDIDO]`.
- `harness rules --mode sweep --changed-only` (5 arquivos em stage) → **0 `[BLOQUEIO]`** e 2 `[AVISO]`
  `core.module-docstring-single-line`, ambos na linha 1 de arquivos que já existiam
  (`src/main/__init__.py`, `ingest_record_store_composition.py`). Os dois são anteriores a este diff `[MEDIDO]`.
- `E2E_API_PORT=8844 E2E_NEXT_PORT=4344 make verify` → **rc=0, VERDE: os 8 portões mediram e passaram**
  `[MEDIDO 2026-09-27T12:15:59Z, árvore com o diff de código em stage]`. `lint-backend` 476 arquivos ·
  `lint-frontend` ok · `test-frontend` 1139 pass / 0 fail · `test` **2826 passed**, cobertura total
  **96,23%** · `boundaries` 7 kept / 0 broken · `regras` 0 bloqueio / 77 aviso · `política` ok · `e2e`
  **87 passed**. Nenhum vermelho, nem dentro da baseline do §2 das regras de despacho. Log:
  `/tmp/verify-wave-api-idle-tx-20260927T121559Z.log`.

## O que fica fora desta task, declarado

- **Deploy e §5.3 (leitura em runtime).** Não houve deploy. Depois dele, o portão é o §5.3 do desenho:
  `api 30s · writer 0 · collector 0`, o `environ` do PID 1 e `2|0` por `application_name='cripto-api'`.
  `0|0` **não** é verde. O falsificador de ≥ 2 dias do §5.4 começa a contar no deploy `[NÃO MEDIDO]`.
- **Reconexão das conexões da API** (§4 do desenho): é dívida que já existia. Com a causa consertada, o
  timeout só dispara numa regressão, mas quando dispara a conexão fica `broken` e nada a reabre. Follow-up
  com dono `infra`.
- **Role dedicado da API, `lock_timeout` no `ALTER` de boot e `default_transaction_read_only`** (§6):
  nenhum foi adotado. `default_transaction_read_only` não foi testado contra a suíte, e o desenho só o
  autoriza quando a suíte passa com ele `[NÃO MEDIDO]`.
- Os 30 s não foram medidos contra requests longos de `/series-history`. Com o conserto, nenhum caminho
  fica ocioso dentro de uma transação, então o valor não depende disso `[INFERRED: §3.2 do desenho]`.
