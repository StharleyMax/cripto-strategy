# [QA GATE — Fase 01: As duas rotas de ADR-005/D1]

**Feature:** `pagina-de-grafico-s2` · **Componente:** `sentimento` (leitor de janela, use-case) /
`web` (contrato de rota)
**Spec:** `docs/specs/SPEC-006-pagina-de-grafico-s2.md` §5.2/§5.3
**Plan:** `docs/plans/SPEC-006-pagina-de-grafico-s2/01_rotas_de_serie.md`
**Tasks:** `T-01.1`..`T-01.5` (`CST-176..179`, `CST-189` para `T-01.5`),
`docs/context/pagina-de-grafico-s2/tasks.toml`

## Arquivos alterados

Produção:
- `backend/src/modules/sentimento/infra/postgres_series_window_reader.py` (new) — `T-01.1`:
  leitor de janela sobre `md.series`, `lookback_ms >= max(bucket_interval_ms,
  asof_max_staleness_ms)`.
- `backend/src/modules/sentimento/use_cases/series_history.py` (new) — `T-01.2`: chama
  `as_of()` por instante de grade, projeta `(value, absence)` via `AsOfReading.projection()`.
- `backend/src/modules/sentimento/domain/series_history_report.py` (new) — `SeriesHistoryReport`/
  `SeriesHistoryRow`, envelope de 3 níveis `SPEC-006 §5.2`.
- `backend/src/modules/sentimento/domain/series_catalog.py` (modified) — `entry_for_id()`:
  resolve `series_key_id` (hash sha256 de mão única) de volta ao `SeriesKey`.
- `backend/src/api/routes/series_history.py` (new) — `T-01.3`: `GET /series-history`, `422`/`500`
  nomeados.
- `backend/src/modules/sentimento/domain/live_bucket_envelope.py` (new) — `LiveBucketEnvelope`,
  `ADR-005/D2`.
- `backend/src/modules/sentimento/use_cases/series_live.py` (new) — `LiveBucketSource` Protocol.
- `backend/src/api/routes/series_live.py` (new) — `T-01.4`: `GET /series-live` (SSE), sem
  `bar_policy` (`ADR-034`/`NG-9` da fase).
- `backend/src/api/dependencies.py`, `backend/src/api/__init__.py` (modified) — stubs de DI +
  registro dos 2 routers novos.
- `frontend/src/app/history-transport.ts` (modified) — `T-01.5`: `HistoryRequestKey` de
  `camelCase`/ISO-8601 para os nomes REAIS de `T-01.3` (`snake_case`, epoch-ms,
  `window_start_ms`/`window_end_ms` em vez de `window: {from, to}`).
- `frontend/src/app/live-transport.ts` (modified) — `T-01.5`: `LiveStreamOpenRequest` para
  `series_key_id`/`symbol`/`interval` `snake_case`, `bar_policy` REMOVIDO (rota real nunca o
  aceita).

Teste:
- `backend/tests/sentimento/test_postgres_series_window_reader.py` (new) — 5 testes, TimescaleDB
  efêmero real via Docker.
- `backend/tests/sentimento/test_series_history.py` (new) — 10 testes (unit, `_FakeReader`).
- `backend/tests/api/test_series_history_route.py` (new) — 8 testes, socket loopback real.
- `backend/tests/api/test_series_live_route.py` (new) — 3 testes, socket loopback real
  (`CA-F1-4`).
- `backend/tests/sentimento/test_series_catalog.py` (modified) — 2 testes de `entry_for_id`.
- `backend/tests/sentimento/test_as_of_is_the_single_reader.py` (modified) — `DECLARED_TOUCHERS`
  +1 (`series_history_report.to_wire`), `DECLARED_IMPORTERS` novo (T-01.2 é o 1º consumidor real
  de `as_of_accessor`, o que a suite antes só previa).
- `backend/tests/api/test_api_prefix.py` (modified) — os 2 conjuntos fechados de rota
  (`/api/v1/*`, `/x/*`) ganham `series-history`/`series-live` — quebravam sem isto (`CA-F1-1`
  literalmente adiciona rota nova).
- `frontend/src/app/history-transport.test.ts`, `frontend/src/app/live-transport.test.ts`
  (modified) — mesmos nomes/tipos reais.

## DoD (`01_rotas_de_serie.md`)

- [x] `CA-F1-1` rota existe — `grep -rlE '"/series-history' backend/src/api` → 1 arquivo
- [x] `CA-F1-2` endereçável por conteúdo — `test_two_identical_requests_produce_byte_identical_bodies`
      (2 chamadas reais, mesma chave, corpos iguais **exceto** `session.server_now_ms`, ver
      Bloqueado)
- [x] `CA-F1-3` `interval=5m` → `422` — `test_interval_other_than_1m_is_refused_with_422`
- [x] `CA-F1-4` SSE `Content-Type` — `test_series_live_responds_with_the_sse_content_type`
      (loopback real; `curl` equivalente não rodado, ver Bloqueado)
- [x] `CA-F1-5` par nunca mal-formado — asserção `(value is None) != (absence is None)` sobre
      linha real em `test_get_series_history_serves_the_3_level_envelope`
- [x] `CA-F1-6` zero exchange direta nas rotas novas — `grep -rn 'binance\|coinalyze'
      backend/src/api/routes/series_history.py backend/src/api/routes/series_live.py` → 0
- [x] `CA-F1-7` zero `MOCK`/`FIXTURE` fora de teste — `grep -rn 'MOCK\|FIXTURE'` sobre os 7
      módulos novos de produção → 0

## Comandos rodados (literais) e resultado

- `cd backend && .venv/bin/python -m pytest tests/api/test_series_history_route.py -q` →
  `8 passed` (universo: 8 testes)
- `cd backend && .venv/bin/python -m pytest tests/api/test_series_live_route.py -q` →
  `3 passed` (universo: 3 testes)
- `cd backend && .venv/bin/python -m pytest tests/sentimento/test_series_history.py -q` →
  `10 passed`
- `cd backend && .venv/bin/python -m pytest tests/sentimento/test_postgres_series_window_reader.py -q`
  → `5 passed` (Docker real, `timescale/timescaledb:2.17.2-pg15`)
- `cd backend && .venv/bin/python -m pytest tests/sentimento/test_as_of_is_the_single_reader.py -q`
  → `5 passed`
- `cd backend && bash scripts/lint.sh` → `All checks passed!` / `398 files already formatted` /
  `Success: no issues found in 398 source files` (ruff + ruff format + mypy --strict)
- `cd backend && .venv/bin/lint-imports` → `Contracts: 7 kept, 0 broken`
- `bash scripts/verify.sh` (full run, sem timeout artificial) → `test rc=1`: **1939 passed, 1
  failed, 3 deselected**, `Total coverage: 96.92%` (piso 70% ok); a 1 falha é
  `test_collectors_cli_idle_timeout_reconnect.py::test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected`
  — **pré-existente**, confirmada via `git stash` + rerun no topo do branch
  (`5cdf730`, antes de qualquer diff desta fase): mesmo `TypeError: SeriesRow.__init__() missing
  1 required positional argument: 'value_raw'`. Fora de `backend/tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py`
  e `src/modules/sentimento/infra/collectors_cli.py`, nenhum dos quais está no diff desta fase
  (`git diff --stat HEAD -- <os 2 arquivos>` → vazio). Gap de F0 (`value_raw`) não fechado nesse
  fixture — fora do escopo de `T-01.1..T-01.5`.
- `harness rules --mode sweep --changed-only` → `4 AVISO, 0 BLOQUEIO` (2 preexistentes em
  `dependencies.py`/`api/__init__.py`, docstring multi-linha; 2 novos em
  `history-transport.test.ts:21`/`live-transport.test.ts:23`, `TEST_BASE_URL` fixo — já existia
  antes de `T-01.5`, não introduzido por esta correção)
- `npm --prefix frontend run test:app` → `116 passed, 0 failed` (universo: 116 testes,
  `src/app/*.test.ts`)
- `npm --prefix frontend run lint` → limpo (ESLint do projeto)
- `npm --prefix frontend run typecheck` → limpo (`tsc --noEmit --strict`)

Cobertura: **96.92%** total (`scripts/verify.sh`, piso declarado 70% em `src/api`, 80%
`use_cases`, 90% `domain`) — nenhuma camada tocada por esta fase ficou abaixo do piso (ver
`check-coverage-layers.sh` embutido em `test.sh`, `rc=0`).

## Doc delta

- SPEC/ADR/plano: **sem mudança** — a fase implementa exatamente `ADR-034`/`SPEC-006 §5.2/§5.3`
  já aprovados, nenhuma decisão nova tomada.
- ADR: não necessário — nenhuma decisão fora do que `ADR-034` já fixou.

## Bloqueado / gaps declarados (nenhum bloqueia o DoD acima, todos nomeados)

1. **`CA-F1-2` e `session.server_now_ms`**: o teste de content-address exclui
   `session.server_now_ms` antes de comparar bytes, porque esse campo é relógio de parede e
   varia por chamada real — nenhuma ADR/SPEC declara este campo isento de "byte-idêntico".
   `[INFERRED: ADR-005/D3 separa session (mutável) de panel/rows (imutável); tratar
   server_now_ms como isento é a leitura consistente com essa separação, não uma comparação
   byte-a-byte literal do corpo inteiro]`.
2. **`CA-F1-4` via loopback real, não `curl`**: o DoD cita `curl -sD -`; o teste usa
   `http.client` sobre socket real (mesmo idioma de `test_series_catalog_route.py`) — mede o
   mesmo `Content-Type`, mas não é o comando literal do plano.
3. **`GET /series-live` sem produtor real**: `LiveBucketSource`/`SeriesWindowReader` são
   Protocols com stub em `dependencies.py` (`NotImplementedError`), nunca ligados em
   `src.main.create_app()` — ligar um adaptador real de Postgres/stream forçaria toda rota
   testada hoje com SQLite a abrir conexão Postgres. Decisão desta fase: não amplia escopo para
   isso; fica para task futura de composição.
4. **1 teste pré-existente falhando**, não corrigido (fora do escopo `T-01.1..T-01.5`) — ver
   comando `bash scripts/verify.sh` acima.
5. **`regras`/`política` (`.harness/mechanism`) recusam medir (`rc=3`)** dentro de
   `scripts/verify.sh` neste worktree especificamente — "mecanismo NAO RESOLVIVEL" (registro do
   plugin não reconhece este `worktree path`). O `harness` CLI direto resolve normalmente (usado
   acima, `harness rules --mode sweep --changed-only` → 0 bloqueio) — gap de registro do
   worktree, não do diff desta fase.
