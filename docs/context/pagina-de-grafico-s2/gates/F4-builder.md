# Gate report — Fase 04: correção de composição (`T-04.1`..`T-04.3`)

**Componente:** `sentimento` (`T-04.1`, `T-04.2`) · `web` (`T-04.3`) · **Feature:** `pagina-de-grafico-s2`
**Plano:** `docs/plans/SPEC-006-pagina-de-grafico-s2/04_correcao_composicao.md`
**Handoff:** `docs/context/pagina-de-grafico-s2/handoff/T-04.md`
**Juiz consultado:** `quant-architect` (T-04.2, decisão de representação de `price_use` escalar)

## O que estava quebrado, medido ao vivo antes do fix

Contra a stack `docker compose` real (`deploy-web-1`/`deploy-api-1`/`deploy-postgres-1`/
`deploy-collector-1`), antes de qualquer edição:

```
curl -s -o /dev/null -w "%{http_code}" "localhost:8000/api/v1/series-history?series_key_id=<klines_last>&symbol=BTCUSDT&interval=1m&window_start_ms=1757339400000&window_end_ms=1757339460000&knowledge_time_ms=1757339520000&bar_policy=final_only"
# -> 500
curl -s localhost:8000/api/v1/series-catalog | jq '.entries[] | select(.key.metric=="klines_last") | .priceUse'
# -> null
```

## T-04.1 — `create_app` wire `PostgresSeriesWindowReader`

`backend/src/modules/sentimento/infra/ingest_record_store_composition.py`: extraído
`compose_postgres_connection(environ, *, connect=psycopg.connect)` de dentro de
`_compose_postgres_store` — o MESMO conninfo/contrato "uma tentativa, sem retry", reusável por
um segundo consumidor sem reabrir `PostgresIngestRecordStore._connection` (privada, de
propósito). `backend/src/main/__init__.py::create_app`: quando `INGEST_RECORD_BACKEND=postgres`
é de fato composto (`isinstance(ingest_store, PostgresIngestRecordStore)`), abre uma SEGUNDA
conexão dedicada e registra `app.dependency_overrides[get_series_window_reader_source]`. Backend
`sqlite` (default de dev/teste) fica INTOCADO — `md.series` não tem fallback sqlite, então o stub
`NotImplementedError` permanece o comportamento correto ali, sem regressão nos ~30 call-sites de
teste existentes que usam `create_app(store_path=...)`.

## T-04.2 — `price_use` no catálogo (decisão de `quant-architect`)

Consultado via Task tool antes de implementar. Decisão: manter `price_use` ESCALAR (não virar
`frozenset`/`tuple`) e atribuir um valor PRIMÁRIO por source — `klines_last` →
`"structure_detection"`, `price_mark_close` → `"liquidation_trigger"` — documentando a perda dos
demais usos como aceita, porque `entry.priceUse` é hoje METADADO (o `resolvePriceSource`
client-side mantém cópia estática própria de `PRICE_SOURCE_BY_USE`, nunca lê o catálogo para
rotear). Gatilho de reabertura documentado no código: o dia em que um consumidor passar a LER
`entry.priceUse` para decidir roteamento. Efeito colateral medido e não previsto no plano: como
`frontend/src/app/symbol/page.tsx` já filtra o catálogo por `entry.priceUse === S2_PRICE_USE`
("structure_detection"), o painel de Preço estava **permanentemente** `absent:not_in_catalog`
antes deste fix, independente do bug de `T-04.1` — os dois bugs eram compostos.

## T-04.3 — falsificador Playwright, `frontend/e2e/08-symbol-dado-real.spec.ts`

Rodado contra imagens construídas a partir desta árvore (`docker build` de `backend/` e
`frontend/`), em containers paralelos (`t04-api-validation`/`t04-web-validation`, removidos ao
final) na mesma rede `deploy_default` e apontados para o `deploy-postgres-1` REAL — não fixture.
O spec semeia (via `docker exec ... psql`) uma linha real em `md.series` por painel (Preço/OI),
no grid instant que `SymbolClient.tsx` efetivamente lê, e afirma valor numérico no DOM (não a
string `SEM_PONTO`/banner de ausência).

Adição mínima em `frontend/src/app/symbol/SymbolClient.tsx` (`PricePane`): um readout "Leitura
atual" para Preço, reaproveitando `resolveStockReading` (já usada por OI) sobre os closes da
grade — sem essa leitura não existe NENHUM texto numérico no DOM para o painel de Preço (só
canvas de `lightweight-charts`), e a fase inteira existe porque "200 sem checar o número" foi
exatamente o furo que deixou o bug de `01`/`02` passar.

**Falsificador provado a morder** — mesmo spec, contra os containers ORIGINAIS (pré-fix,
`deploy-api-1`/`deploy-web-1` antigos):
```
E2E_BASE_URL=http://localhost:3000 E2E_SENTIMENTO_API_BASE_URL=http://localhost:8000/api/v1 \
  npx playwright test e2e/08-symbol-dado-real.spec.ts --reporter=list
# -> 1 failed: "no BTCUSDT catalog entry matched the predicate — catalog drifted?"
#    (entry.priceUse é null no catálogo antigo — T-04.2 ainda não aplicado)
```

## Comandos rodados (literais) e resultado

- `bash backend/scripts/test.sh` → `1 failed, 1949 passed` (universo: 1950 testes coletados).
  **A falha é PRÉ-EXISTENTE e fora de escopo**:
  `tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py::test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected`
  falha com `TypeError: SeriesRow.__init__() missing 1 required positional argument: 'value_raw'`
  em código (`domain/provenance.py`, `use_cases/reconnect_force_order_stream.py`,
  `infra/collectors_cli.py`, `infra/rfc6455_client.py`,
  `domain/force_order_reconnection_overlap.py`) que **não faz parte do diff desta fase** — já
  estava modificado/não-commitado no `git status` no início desta invocação (feature
  `captura-em-producao`, fora do escopo `pagina-de-grafico-s2`/fase `04`). Reproduzido 3× em
  isolamento, determinístico, não-flaky. `check-coverage-layers.sh` (piso por camada) não chegou
  a rodar por causa do `set -euo pipefail` do script sobre o `1 failed` — cobertura total
  reportada pelo pytest antes do abort: **96.99%** (universo: 7934 statements).
- `bash backend/scripts/lint.sh` (após o fix) → `All checks passed! / Success: no issues found in 401 source files`.
- `harness rules --mode sweep --changed-only` → **0 `[BLOQUEIO]`**, 3 `[AVISO]` (`core.module-docstring-single-line`
  em `dependencies.py`/`main/__init__.py`/`ingest_record_store_composition.py` — docstring de
  módulo multi-linha PRÉ-EXISTENTE, não introduzida por este diff).
- `.venv/bin/python -m pytest tests/main/ tests/sentimento/test_price_source_catalog.py tests/sentimento/test_series_catalog_use_case.py tests/api/test_create_app_selects_ingest_record_backend.py tests/api/test_series_history_route.py tests/sentimento/test_postgres_series_window_reader.py -q --no-cov`
  → `45 passed` (universo: 45 testes, inclui o novo MORDE real-Postgres
  `test_postgres_backend_wires_a_real_reader_and_series_history_answers_200`).
- `npx tsc -p tsconfig.json --noEmit --strict` → limpo (0 erros).
- `npx eslint src` → limpo (0 findings).
- `node --conditions=react-server --test 'src/app/**/*.test.ts'` → `130 passed` (universo: 130).
- `npx playwright test e2e/08-symbol-dado-real.spec.ts --reporter=list` contra stack real
  (pós-fix) → `2 passed` (universo: 2 testes; ver fatos abaixo).
- Mesmo comando contra a stack ORIGINAL pré-fix → `1 failed` (falsificador confirmado, ver acima).
- `curl` real pós-fix, `series-catalog`: `klines_last -> "structure_detection"`,
  `price_mark_close -> "liquidation_trigger"` (nunca `null`).
- `curl` real pós-fix, `series-history` para `klines_last` (`31c0a9a6...`) e `sum_open_interest`
  (`58bd4fe9...`, `4aaefc45...`): `200` em ambos, nunca `500`.

## Cobertura

Suíte `sentimento`: **96.99%** total (`bash backend/scripts/test.sh`, universo 7934 statements) —
piso por camada não avaliado nesta rodada por causa da falha pré-existente citada acima (o script
aborta antes de chamar `check-coverage-layers.sh`); os arquivos desta fase
(`price_source_catalog.py`, `ingest_record_store_composition.py`, `main/__init__.py`) aparecem a
**100%** no relatório do pytest.

## Doc delta

- `docs/INDEX.md`: nova linha acrescentada (append-only) para este gate.
- `backend/src/api/dependencies.py`: docstring de `get_series_window_reader_source` atualizada
  para refletir que `src.main` agora wire o adaptador condicionalmente (era "later task").
- ADR: não necessário — `T-04.1`/`T-04.2` executam decisões já registradas em `ADR-034/D9` e
  `ADR-007`; a única decisão nova (representação de `price_use`, `T-04.2`) foi tomada pelo
  `quant-architect` e documentada como comentário no próprio código
  (`price_source_catalog.py`), não como ADR — decisão de implementação dentro de um contrato já
  fixado, não uma nova arquitetura.

## Bloqueado

Nada bloqueado nos itens desta fase. Fora de escopo, nomeado para não ficar silencioso: a falha
pré-existente em `test_collectors_cli_idle_timeout_reconnect.py` (arquivos de
`force_order`/`collectors_cli`/`rfc6455_client` já modificados e não-commitados antes desta
invocação, feature `captura-em-producao`) — não foi tocada, não é desta fase.
