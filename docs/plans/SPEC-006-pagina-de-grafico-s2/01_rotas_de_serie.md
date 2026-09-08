# Fase 01 — As duas rotas de `ADR-005/D1`: `/series-history` e `/series-live`

**Componente:** `sentimento` (leitor de janela, use-case), `web` (contrato de rota) · **Depende
de:** `00` (`value_raw` existe) · **Bloqueia:** `02`
**Decisões que fecham:** [`ADR-034`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md)
`D1` (nomes), `D4` (`bar_policy`), `D5` (schema de linha), `D6` (só `interval=1m`), `D9` (dois
componentes novos, sem reuso puro)

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 1.1 | Leitor de janela novo (`infra`): `SELECT` sobre `md.series` por `(series_key_id, symbol)`, `bucket_end ∈ [window_start − lookback_ms, window_end]`; `lookback_ms ≥ max(bucket_interval_ms, asof_max_staleness_ms)` | `ADR-034/D9` | `sentimento` |
| 1.2 | Use-case novo (`use_cases`): para cada instante de grade na janela, chama `as_of(t=grade, purpose=RENDERING, bar_policy=<request>, knowledge_time=<request>, observations=<do leitor>)`, projeta pelo par discriminado de `D5` | `ADR-034/D9`, `D5` | `sentimento` |
| 1.3 | Rota `GET {API_PREFIX}/series-history`: query `series_key_id`, `symbol`, `interval` (só `"1m"`), `window_start_ms`, `window_end_ms`, `knowledge_time_ms`, `bar_policy` (obrigatório, `final_only`\|`intrabar`) | `ADR-034/D1`, `D4`, `D6`; `SPEC-006 §5.2` | `web` (contrato), consome `sentimento` |
| 1.4 | Rota `GET {API_PREFIX}/series-live` (SSE): `Content-Type: text/event-stream`, envelope `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` a `max(1 Hz, 1/TF)` | `ADR-005/D2`; `ADR-034/D1` | `web`, consome `sentimento` |
| 1.5 | `422` nomeado para `interval≠"1m"`, `bar_policy` ausente/fora do enum, `knowledge_time_ms` no futuro | `RN-8`; `ADR-034/D6` | `web` |
| 1.6 | `500` nomeado (nunca `200`) quando `AsOfReading` vier mal-formado (`value`+`absence` juntos ou nenhum) | `RN-9` | `sentimento`/`web` |

## DoD

| id | critério | comando | morde |
|---|---|---|---|
| CA-F1-1 | rota de histórico existe | `grep -rlE '"/series-history' backend/src/api` → ≥ 1 (hoje 0) | ausência ⇒ reprova |
| CA-F1-2 | endereçável por conteúdo | 2 chamadas, mesma chave completa → corpos byte-idênticos | corpo muda ⇒ reprova |
| CA-F1-3 | `interval≠1m` recusado | request com `interval=5m` → `422` | `200` com número ⇒ reprova `RN-8` |
| CA-F1-4 | SSE `Content-Type` correto | `curl -sD - <rota-sse> \| grep -i text/event-stream` → 1 linha | ausência ⇒ reprova |
| CA-F1-5 | par discriminado nunca mal-formado na resposta real | schema check sobre N linhas de janela real | `value`+`absence` juntos/nenhum ⇒ reprova |
| CA-F1-6 | nenhuma chamada de exchange direta | `grep -rn 'binance\|coinalyze' backend/src/api/routes/series_history.py backend/src/api/routes/series_live.py` além de label ⇒ 0 | chamada HTTP externa ⇒ reprova `RN-2` |
| CA-F1-7 | `value_raw` é a única fonte de número | `grep -rn 'MOCK\|FIXTURE' <rotas novas>` fora de teste ⇒ 0 | literal hardcoded ⇒ reprova `RN-7` |

## Non-goals desta fase

Não implementa reagregação de CVD para `interval`≠`1m` (`NG-9`) · não adiciona parâmetro
`bar_policy` a `/series-live` (`D4` — SSE não recebe) · não toca as 4 rotas herdadas
(`/collector-status` etc., `CA-E2E-2`).

## Falsificador da fase

Se `/series-history` responder `200` para `interval=5m` com um `cvd_delta` que não seja a soma
exata dos fatos de 1 min do bucket pedido, a fase implementou o que `D6` proíbe — subestimativa
silenciosa. Verificar sobre fixture com soma conhecida antes de aceitar como QA `APPROVED`.
