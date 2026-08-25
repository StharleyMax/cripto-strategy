# Fase 04 — Contrato temporal e identidade do registro

**Epic:** `CST-3` (F1, primeira metade) · **Componente alvo: `sentimento`** · **Gate: nenhum**
**Depende de:** `01`. **Zero rede, zero API key** — todos os fixtures estão em `data/` (850 MB, `data/MANIFEST.md`).

**Por que existe separada de `05`:** esta fase decide se **todo** dado gravado a partir daqui nasce certo, e ela é verificável **offline**. `05` é a primeira superfície servida de um host exposto. **Duas classes de risco, dois DoD.**

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 4.1 | `event_time = create_time + 300000` aplicado **UMA vez às oito colunas**, com `src_label_raw` gravado ao lado | `SPEC-001` §2.2 | `sentimento` |
| 4.2 | **Ordenação obrigatória do arquivo inteiro antes de emitir evento** | `CA-F1-1`, `CA-F1-14` | `sentimento` |
| 4.3 | Unicidade por **`agg_id`** com verificação de contiguidade — **nunca** por tempo, **nunca** `first/last trade_id` | `CA-F1-5`, `CA-F1-6` | `sentimento` |
| 4.4 | `md.ingest_gap` persistido | `CA-F1-2` | `sentimento` |
| 4.5 | Acessor único `as_of(serie, symbol, t, asof_max_staleness_ms)` = **`argmin(observed_at)`** entre `available_at <= t`, com `LOCF` e **sem `interpolate`** | `SPEC-001` §2.5, `ADR-006` | `sentimento` |
| 4.6 | **R-1 e R-2 como conjunção**, com `bar_policy` declarado pelo consumidor | `SPEC-001` §2.3 | `sentimento` |
| 4.7 | `SeriesKey` **completa, com `quantity_field` e `reduction`** | `ADR-001`, `CA-F2-17` | `sentimento` |
| 4.8 | `cvd_delta` **fato**; `cvd_cum(anchor)` **view com âncora obrigatória** | `CA-F1-8`, `SPEC-001` §2.6 | `sentimento` |
| 4.9 | As sete colunas de procedência em **TODA** linha | `SPEC-001` §3.1 | `sentimento` |
| 4.10 | `knowledge_time` no caminho de leitura | `CA-F4-25` | `sentimento` |
| 4.11 | **`principal_id` como dimensão** em toda linha de ato humano — nunca constante implícita, nunca `NULL` | `SPEC-001` §4.4, `Q2` | `sentimento` |
| 4.12 | Serialização de numeral **invariante de locale** em todo caminho de dado | `SPEC-001` §3.8 | `sentimento` |

## DoD — comando e universo

| # | critério | comando / ação | universo esperado |
|---|---|---|---|
| **D4.1** | ordenação é ETL | carregar `BTCUSDT-metrics-2026-08-18.csv` (md5 `b8ef79c353f2adce853c68084cc3b631`), verificar monotonia; **bypassando o sort → REPROVA** | **13 de 30 dias fora de ordem**, 0 até 08-10 e **13/13** desde 08-11; deslocamento máx **275 posições em 288**, salto para trás de **1435 min** |
| **D4.2** | lacuna não é preenchida | carregar `2026-08-12` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`) | **285 linhas · 1 linha em `ingest_gap` com `n_missing=3` · 1 vão de 20 min · ZERO pontos interpolados** |
| **D4.3** | o carimbo de idade é do FECHO | primeiro carimbo de `met/2026-08-23.csv` | **`00:05:00Z`**, nunca `00:00:00Z` |
| **D4.4** | contiguidade de tick | verificar `aggTrades` | **`0 saltos, 0 ts decrescente, 8.873.078 linhas`**; o buraco de 08-22 aparece como **descontinuidade de `FLOW`, não costurada** (1.620.908 ausentes entre `agg_id` 3420055157 e 3421676065) |
| **D4.5** | unicidade sob colisão de ms | — | até **184 aggTrades no mesmo ms**, **25,6% dos ms com colisão** ⇒ unicidade por `agg_id` |
| **D4.6** | **fixture envenenada, TRÊS classes** | (a) `available_at` futuro ⇒ **bit-idêntico** ao dataset sem as linhas · (b) **bucket parcial** (`available_at <= t`, `bucket_end > t`) ⇒ sob `final_only` **bit-idêntico**, sob `intrabar` **TEM DE MUDAR** · (c) mesmo bucket em `q` e `nq` ⇒ leitura sob `nq` fora da janela ao vivo devolve **`SEM_FONTE`** | **1 fixture, 3 classes.** A classe (b) existe porque o teste, como o PRD o escrevia, **passava nos dois valores de `bar_policy`** |
| **D4.7** | âncora obrigatória | `cvd_cum` **sem** âncora ⇒ **erro** | 00:00/12:00/20:00 ⇒ **−1265,982 / +399,745 / +1598,508 BTC**, e **o título muda nas três** |
| **D4.8** | aritmética canônica | `Decimal` sobre a string crua de `q`, soma ordenada por `agg_id`, bucket por `transact_time // 60000` | **o comando `awk` publicado REPROVA implementação correta** (`OFMT=%.6g` → erro de +4 mBTC) |
| **D4.9** | reconciliação de tolerância ZERO | `metrics.sum_open_interest_value / metrics.sum_open_interest == markPriceKlines.close` do mesmo bucket | **exato a 8 casas, 288/288** em 2 dias de BTCUSDT; alts **282–286/288**, resíduo ≤ **4,34 bp** |
| **D4.10** | lookahead do taker é **regressão** | correlação de `ln(taker_ratio)` com o retorno log | **`r = +0,5458`** com `[T, T+5min)` contra **+0,0612** com o passado e **−0,0060** com futuro+1 (n=864/862/862) |
| **D4.11** | `LOCF` sobre `FLOW` é **erro de tipo** | crosshair em bucket ausente de `cvd_delta` | **`—`**, nunca o valor anterior |
| **D4.12** | fixture é **byte-estável** | exportar com `LANG=pt_BR.UTF-8` e `LANG=C` e comparar `sha256sum` | **iguais, ou reprova** |
| **D4.13** | `as_of` é a PRIMEIRA observação | duas observações do mesmo bucket com `observed_at` diferentes | `as_of` devolve **`argmin(observed_at)`**, nunca a última |
| **D4.14** | o acessor **não herda** default de tela | definir `render_max_staleness_ms` e omitir `asof_max_staleness_ms` | **a leitura de decisão REPROVA** (`ADR-006/D3`) |

## Não faz

Não define limiar, não calcula convergência, não chama Coinalyze, **não escolhe motor** (o contrato é portável entre os cinco candidatos), **não detecta estrutura** — zero algoritmo, zero limiar, zero "sinal".

## Falsificador da fase

**F-2 global:** duas séries com a **mesma** `SeriesKey` cujos `cvd_cum` divirjam. Se aparecer, a `SeriesKey` está incompleta — e §1 da SPEC é a prova de que ela já estava uma vez.
