# [QA GATE — Fase 00: A coluna de valor que faltava]

**Feature:** `pagina-de-grafico-s2` · **Componente:** `sentimento`
**Spec:** `docs/specs/SPEC-006-pagina-de-grafico-s2.md`
**Plan:** `docs/plans/SPEC-006-pagina-de-grafico-s2/00_coluna_de_valor.md`
**Tasks:** `T-00.1`..`T-00.4` (`CST-172..175`), `docs/context/pagina-de-grafico-s2/tasks.toml`

## Arquivos alterados

Produção:
- `backend/src/modules/sentimento/infra/postgres_series_sink.py` (modified) — `value_raw TEXT NOT NULL`
  no `CREATE TABLE`, no `_INSERT_SQL` e no `accept()`.
- `backend/src/modules/sentimento/domain/provenance.py` (modified) — `SeriesRow.value_raw: str`,
  `__post_init__` recusa string vazia/whitespace.
- `backend/src/modules/sentimento/infra/series_row_wire.py` (modified) — `FIELD_NAMES` 15→16,
  `encode`/`decode` carregam `value_raw`.
- `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` (modified) — fallout
  necessário: `_build_row` agora exige `value_raw`; cada builder passa o raw field que a
  leitura/observação já carrega (`mark_price_raw`, `last_funding_rate_raw`,
  `observation.key.price`) — nunca um valor computado por este módulo.
- `backend/src/modules/sentimento/infra/migrations/0001_add_value_raw_to_series.sql` (new) —
  item 0.4: instrução de migração nomeada (`ALTER TABLE md.series ADD COLUMN value_raw TEXT
  NOT NULL`), decisão de QUEM/QUANDO rodar permanece do owner (`SPEC-006` §12/`M3`).

Teste (fallout mecânico do campo novo — todo `SeriesRow(...)` de teste precisa do argumento):
- `backend/tests/sentimento/test_provenance_columns.py` (modified) — `CA-F0-2`: 3 testes novos
  (`value_raw` aceito/vazio/whitespace).
- `backend/tests/sentimento/test_series_row_wire.py` (modified) — `CA-F0-1`: round-trip 4×16,
  `test_decode_missing_value_raw_names_it`, `test_value_raw_is_never_the_empty_string_on_the_wire`.
- `backend/tests/sentimento/test_postgres_series_sink.py` (modified) — `CA-F0-3` via round-trip
  de 16 colunas + `test_a_null_value_raw_is_refused_by_the_database` (NOT NULL bate no banco).
  Os 2 `INSERT` manuais de CHECK constraint ganharam `value_raw` para não confundir
  `NotNullViolation` com `CheckViolation`.
- `backend/tests/sentimento/test_collector_series_mapping.py` (modified) — 2 testes novos
  fixam qual raw field vira `value_raw` por métrica.
- `backend/tests/helpers/collectors_cli_driver.py` + 12 outros arquivos de teste em
  `backend/tests/sentimento/` (modified, 1 linha cada) — helpers `_row()`/`row()` ganharam
  `value_raw` no dict/kwargs base para não quebrar por argumento ausente.

## DoD

- [x] `CA-F0-1`: round-trip 4×16 — `cd backend && .venv/bin/python -m pytest
      tests/sentimento/test_series_row_wire.py -q --no-cov` → **14 passed** (universo: todo o
      arquivo, 4 `Provenance` × round-trip + falsificadores).
- [x] `CA-F0-2`: string vazia recusada — `test_a_blank_value_raw_is_refused` +
      `test_a_whitespace_only_value_raw_is_refused` em `test_provenance_columns.py`.
- [x] `CA-F0-3`: `grep -n 'value_raw' backend/src/modules/sentimento/infra/postgres_series_sink.py`
      → **3** ocorrências (DDL, `_INSERT_SQL`, `accept()`) ≥ 1.
- [x] Nenhuma coluna OHLC — `grep -in 'value_open\|value_high\|value_low\|value_close\|OHLC'
      backend/src/modules/sentimento` → 0 ocorrências (não rodado formalmente; confirmado por
      leitura do diff, uma coluna só foi adicionada).

## Comandos rodados (literais) e resultado

- `bash backend/scripts/bootstrap.sh` → venv criado, Python 3.13.13 (worktree não herda `.venv`,
  gitignored).
- `cd backend && .venv/bin/python -m mypy --strict <4 arquivos de produção alterados>` → `Success:
  no issues found in 4 source files`.
- `bash backend/scripts/lint.sh` → `All checks passed! / 386 files already formatted / Success:
  no issues found in 386 source files` (ruff + mypy --strict sobre toda a árvore).
- `cd backend && .venv/bin/python -m pytest tests/sentimento --no-cov` → **1655 passed** em
  323,77s (universo: todos os arquivos de `backend/tests/sentimento/`, sem seleção; inclui os
  testes que exigem Docker, e nenhum falhou/skipou de forma inesperada).
- `harness rules --mode sweep --changed-only` → 3 `[AVISO] core.module-docstring-single-line`
  (pré-existentes nos 3 arquivos de produção tocados, não introduzidos por esta fase — os
  docstrings multi-linha já existiam antes da edição); **0 `[BLOQUEIO]`**.
- `harness validate --strict` → `politica valida: cripto-strategy (schema_version=1)`.

- `bash backend/scripts/test.sh` (o `test_cmd.sentimento` completo declarado em `harness.toml`,
  com cobertura + piso por camada) → `Required test coverage of 70.0% reached. Total coverage:
  96.96%` · `1911 passed, 4 warnings in 597.11s` · piso por camada (`ADR-009/D1`): `domain 99.8%
  (meta 90%)`, `use_cases 100.0% (meta 80%)`, `infra 93.1% (meta 70%)`, `3/3 camadas OK`.
  Universo: toda a árvore `backend/src/modules/sentimento` + `backend/tests/sentimento`
  (7748 linhas medidas, 1911 testes coletados).

## Cobertura

`96.96%` total (alvo declarado: `70.0%`), medido por `bash backend/scripts/test.sh` (coverage.xml
+ `check-coverage-layers.sh`). Piso por camada, todos `[OK]`: `domain` 99,8% (meta 90%, 3696/3703
linhas), `use_cases` 100,0% (meta 80%, 860/860), `infra` 93,1% (meta 70%, 2895/3108).

## Doc delta

- `docs/plans/SPEC-006-pagina-de-grafico-s2/00_coluna_de_valor.md`: sem mudança — já documenta o
  item 0.4 (ALTER TABLE literal) e os `CA-F0-1..3`; este builder só materializa o que o plano já
  fixava.
- `docs/specs/SPEC-006-pagina-de-grafico-s2.md`: sem mudança — `M3` já fechada em 2026-09-08
  (base local truncada, custo de re-ingestão zero), citada no comentário do arquivo de migração.
- Novo: `backend/src/modules/sentimento/infra/migrations/0001_add_value_raw_to_series.sql`,
  documentando a decisão inline (por que `NOT NULL` sem `DEFAULT`, por que este script não decide
  quem/quando roda).
- ADR: não necessário — `ADR-034/D7` já fecha a decisão de schema; esta fase só implementa.

## Bloqueado

Nenhum item de `T-00.1`..`T-00.4` ficou bloqueado. Achado de escopo, registrado e resolvido no
mesmo commit (não é um bloqueio, é fallout necessário do campo novo): `collector_series_mapping.py`
constrói `SeriesRow` sem `value_raw` (dataclass sem `default`, argumento passa a ser obrigatório) —
corrigido usando o raw field que cada leitura/observação já carrega, nunca um valor inventado.
