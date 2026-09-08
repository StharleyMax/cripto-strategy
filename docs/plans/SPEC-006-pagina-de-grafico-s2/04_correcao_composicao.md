# Fase 04 — fast-follow: `/symbol` não serve dado real em produção

**Componente:** `sentimento` (composition root + catálogo) · `web` (falsificador) · **Depende
de:** `01` (rotas mergeadas), `02` (página mergeada) · **Bloqueia:** `advance DONE` da feature
**Achado por:** owner, validando `/symbol` ao vivo em `localhost:3000` após F0-F3 mergeadas — não
um item planejado, um bug real encontrado em uso.
**Juiz adicional:** `quant-architect` (dono de `price_source_catalog.py`/`ADR-007`)

## Contexto — por que isto passou por QA/Review de `01` e `02`

`ADR-034/D9`, escrita ANTES desta fase existir, já nomeava o modo de falha: *"se `md.series`
continuar sem a coluna e F1 'funcionar' servindo só metadados sem ninguém notar, esta ADR falhou
silenciosamente"*. Foi exatamente isso: os testes de `01`/`02` fazem `app.dependency_overrides[...]
= <fake>` direto numa instância de teste — nunca importam `src.main.app`, o composition root real.
`GET /series-history` nunca foi chamado de verdade contra a app composta até o owner abrir a
página no navegador.

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 4.1 | `backend/src/main/__init__.py::create_app` importa `PostgresSeriesWindowReader` e registra `app.dependency_overrides[get_series_window_reader_source]`, mesmo padrão de conexão `psycopg` que `compose_ingest_record_store`/`_postgres_conninfo` já usa (`ingest_record_store_composition.py`), refusing-at-boot (`ADR-029/D3`) se a conexão falhar | `ADR-034/D9` item 1, `CST-190` | `sentimento` |
| 4.2 | `price_source_catalog.py` atribui `price_use` aos entries de `klines_last`/`price_mark_close` usando `PRICE_SOURCE_BY_USE` — decidir com `quant-architect` como representar um `price_source` que serve mais de um `price_use` sem quebrar `series_key_id` já em produção | `ADR-007`, `CST-191` | `sentimento` |
| 4.3 | `frontend/e2e/08-symbol-dado-real.spec.ts` (Playwright, roda contra `localhost:3000` real, backend+postgres reais) — abre `/symbol`, espera os 3 painéis, afirma que Preço e OI mostram valor numérico real (não a string de ausência), e que a resposta de rede de `/series-history` tem `rows.length > 0` para ao menos Preço | falsificador desta fase | `web` |

## Non-goals desta fase

Não conecta `get_live_bucket_source`/`/series-live` — decisão já registrada em `series_live.py`
("Wiring a real adapter into `src.main.create_app` is out of this phase's declared scope"), não é
esta fase que reabre isso. Não constrói coletor de OHLC em grade de 1 minuto para Preço/OI (hoje só
5m) — CVD é o único painel com grade nativa de 1m; os outros dois ficam em "ausência" até essa
lacuna de coleta ser endereçada em feature própria. Não implementa `cvd_delta` como metric de
catálogo (gap já documentado em `page.tsx`, painel de CVD).

## DoD

| id | critério | comando | morde |
|---|---|---|---|
| CA-F4-1 | `/series-history` responde de verdade contra a app composta | `curl` real (não mock) num `series_key_id` de `klines_last`/`sum_open_interest` do catálogo real → `200`, nunca `500`/`NotImplementedError` | `500` ⇒ reprova |
| CA-F4-2 | catálogo real expõe `priceUse` não-nulo para `klines_last` | `curl localhost:8000/api/v1/series-catalog \| jq '.entries[] \| select(.key.metric=="klines_last") \| .priceUse'` → `"structure_detection"` (ou o valor decidido em 4.2), nunca `null` | `null` ⇒ reprova |
| CA-F4-3 | Playwright prova DADO, não status — falsificador central desta fase | `npx playwright test 08-symbol-dado-real.spec.ts` contra app real rodando → assert de valor numérico no DOM do painel de Preço (e idealmente OI) | passar só por `200`/ausência de erro de rede, sem checar o número no DOM, é reprova — **é exatamente o furo que deixou este bug passar em `01`/`02`** |

## Falsificador da fase

Se QA desta fase aprovar sem ter rodado a suíte contra a app **real** (`docker compose`, não um
`TestClient`/fixture in-process) e sem um assert de **valor no DOM**, o mesmo modo de falha de
`ADR-034/D9` se repete — só que desta vez documentado e ainda assim ignorado.
