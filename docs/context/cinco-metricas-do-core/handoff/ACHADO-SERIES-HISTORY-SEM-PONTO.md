# ⛔ `GET /api/v1/series-history` devolve `SEM_PONTO` para TODA linha de `klines_volume`

`[MEDIDO 2026-09-11T11:58Z]` — achado por `T-01.7` (builder de front), **reproduzido e isolado pelo
orquestrador** contra o Postgres e a API de produção. **Não é defeito do front.**

## O sintoma: `200`, envelope certo, e zero ponto

    NOW=$(date +%s000); KID=ef3033e6ad5a487330c9e669dd1ed3105a7a40ba274b78302b4d3eb624244e42
    curl -s "http://127.0.0.1:8000/api/v1/series-history?series_key_id=$KID&symbol=BTCUSDT\
    &interval=1m&window_start_ms=$((NOW-10800000))&window_end_ms=$NOW\
    &knowledge_time_ms=$NOW&bar_policy=final_only"

→ **180 linhas, 0 com valor, 100% `absence: "SEM_PONTO"`.** O envelope `panel` resolve **certo**
(`source: binance`, `nature: FLOW`, `unit: BTC`) ⇒ **a busca no catálogo funciona; quem rejeita é a
leitura.**

## O dado EXISTE, e é o mesmo `series_key_id`

    SELECT event_time, available_at, value_raw, is_final, symbol FROM md.series
    WHERE series_key_id='ef3033e6…4e42' AND event_time IN (1789117740000,1789117800000,1789117860000);

| `event_time` | `available_at` | `value_raw` | `is_final` | `symbol` |
|---|---|---|---|---|
| 1789117740000 | 1789117750434 | **72.068** | `t` | BTCUSDT |
| 1789117800000 | 1789117812034 | **30.537** | `t` | BTCUSDT |
| 1789117860000 | 1789117873591 | **50.637** | `t` | BTCUSDT |

**10.706 linhas** para essa chave, e **nenhuma** coluna nula: `available_at`, `observed_at`,
`event_time`, `value_raw` e `is_final` estão **todos preenchidos em 10.706/10.706**.

⇒ **Não é `available_at` nulo, não é `is_final`, não é a grade** (ambos múltiplos de 60.000, e os
três `event_time` acima foram pedidos DENTRO da janela, com `knowledge_time_ms` muito depois de
`available_at`). **A rejeição está entre o `SELECT` e o envelope** — `as_of` / projeção.

## O que isto bloqueia

- **`DoD-2` da fatia `01`** (`series-history` com linhas) — o `rows = 10.081` medido antes era de
  **outra série**, não de `klines_volume`.
- **`T-01.9`** (e2e Playwright, `N ≥ 30` pontos distintos no DOM) — **não pode passar hoje**.
- ⇒ **`T-01.11` não pode fechar a fatia `01`.**

## Segundo defeito, independente, no mesmo caminho até a tela

A rota `/symbol` usa **janela FIXA `2026-08-20..24`** (`frontend/src/charts/s2-panels.ts`), e o dado
de `klines_volume` **só começa em 2026-09-04** `[MEDIDO: min(bucket_end)=1788486120000]`. Mesmo com o
defeito acima corrigido, a tela continuaria vazia. **São dois, não um.**

## Terceiro achado, menor

O catálogo servido tem **1** entrada de `klines_volume` (**BTCUSDT só**), enquanto `md.series` tem
linhas de **4** símbolos (BTCUSDT/ETHUSDT/LINKUSDT/SOLUSDT, 10.705 cada)
`[MEDIDO: /api/v1/series-catalog, n_entries=11]`.

**Dono: `sentimento`.** Não é escopo de `T-01.7`, que entregou verde o que lhe cabia.
