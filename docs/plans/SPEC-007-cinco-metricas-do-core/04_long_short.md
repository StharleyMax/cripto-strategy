# Fase `04` — Long/short ratio: escolher qual das quatro, e o primeiro painel novo

> **Métrica:** M3 · **Fonte:** Binance `/futures/data/` (`ADR-036/D3`) · **Painel:** **novo**
> **Componentes:** `sentimento` · `web` · **Requisitos:** `RF-1` `RF-2` `RF-3` `RNF-2` `RNF-3`
> **Cota Coinalyze consumida: 0.** Capacidade nova que esta fase introduz: **o primeiro painel novo**.
> O cliente de `/futures/data/` vem da fase `03`.
> ⚠️ Profundidade herdada e declarada: `/futures/data/*` **corta em ~30 dias** `[MEDIDO 2026-09-10]` —
> boa para operar a `15min..4h`, insuficiente para backtest longo (`SPEC-007` §9.2).

## O achado que define esta fase: **M3 não é uma série, são quatro**

`FORBIDDEN_METRIC_NAMES` (`series_key.py:67`) **recusa `ls_ratio` dentro de `SeriesKey.__post_init__`**,
e o motivo é citado verbatim (`:78-83`): o nome genérico cobre `count_long_short_ratio`,
`count_toptrader_long_short_ratio`, `sum_toptrader_long_short_ratio` e `sum_taker_long_short_vol_ratio`,
com autocorrelação lag-1 de **0,99+ para três** e **0,0955 para a quarta**
`[DOC: series_key.py:60-62, SPEC-001 §3.1/§5.11, CA-F2-3]`. `PRD-007` §1.2 trata M3 como uma métrica; a
camada de identidade reprova essa leitura **em tempo de construção**.

**Escolha desta fase: `count_long_short_ratio`** — é o que a expressão do owner nomeia em uso comum, e o
que a Coinalyze espelha no campo `r`.

⚠️ **Uma série com autocorrelação 0,99+ desenha uma reta.** Falsificador: se o painel for uma linha
visualmente plana no timeframe de operação (`15min .. 4h`), a fase acrescenta
`sum_taker_long_short_vol_ratio` como segunda série do mesmo painel — reversível dentro da fase, porque
é outra entrada de catálogo e outra chamada, não outro cano.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 4.1 | Identidade `count_long_short_ratio` (`interval="5m"`, `RATIO`), com **teste nomeado** em `verified_by` | `sentimento` | `RF-2`, `SPEC-007` §4.2 |
| 4.2 | Coletor de `/futures/data/…` — **reusa o cliente que a fase `03` construiu**, não é integração nova; cadência em configuração; **testar** o `[INFERRED]` de que o teto de `5min` é da Binance (`MEDICAO` §2.2) | `sentimento` | `RF-1`, `ADR-036/D3` |
| 4.3 | `RATIO` de fluxo **não é agregável por soma** — `SPEC-001` §3.1 mediu 3,3× de inflação ao somar 3 buckets de 5 min. A recomposição, se houver, é `Σbuy/Σsell` | `sentimento` | `RN-1`, `SPEC-001` |
| 4.4 | Registro no catálogo servido | `sentimento` | `RF-2` |
| 4.5 | **Painel novo** em `/symbol`, com `SEM_PONTO` honesto | `web` | `RF-3`, `RN-1` |
| 4.6 | `ui-designer` desenha; **veredito do `ux-ui-mastery` antes de a fase fechar** | `web` | `CLAUDE.md` §Design |
| 4.7 | e2e Playwright contra o app real, **com o divisor de `RN-S1`** (série de `5m`) | `web` | `DoD-3` |

## DoD verificável

1. `count(*)` de `md.series` para `count_long_short_ratio` **> 0**. Hoje: `0` `[MEDIDO 2026-09-10]`.
2. `GET /api/v1/series-history` → `n_points > 0`.
3. Playwright: **`N ≥ 30` barras nativas distintas** (`pontos_no_DOM ÷ 5`, `RN-S1`), **não** `SEM_PONTO`.
4. Run fechado da fonte com `n_written > 0`.
5. **Veredito `APPROVED` do `ux-ui-mastery`** sobre o painel novo, registrado — silêncio do owner não é
   aprovação; aprovação é o veredito do validador.
6. O `[INFERRED]` do teto de `5min` **testado contra a Binance**, com o comando e o `n`.
7. `make verify` verde.

## Falsificador da fase

Se a Binance publicar long/short a `1min` — isto é, se o `[INFERRED]` de `MEDICAO` §2.2 for falso —
então `interval="5m"` na identidade está errado, e corrigi-lo **depois** re-identifica a série
(`series_key.py:226`). Por isso o item 4.2 testa **antes** de gravar.
