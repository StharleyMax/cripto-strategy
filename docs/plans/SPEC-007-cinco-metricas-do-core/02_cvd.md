# Fase `02` — CVD: mais um índice da mesma resposta

> **Métrica:** M5 · **Fonte:** Binance `/fapi/v1/klines`, `delta = 2·takerBuyBaseVol − volume` (`ADR-036/D5` revisada) · **Painel:** `CvdPane` (existe)
> **Componentes:** `sentimento` · `web` · **Requisitos:** `RF-1` `RF-2` `RF-3` `RNF-1` · `RS-5`
> **Cota de terceiro: ZERO.** Cota Binance: nenhuma chamada nova — é o mesmo array da fase `01`.
> **Marco:** ao fim de `03`, `/symbol` fica **3/3 painéis com ponto**, contra **0/3 hoje**
> `[MEDIDO 2026-09-10, PRD-007 §1.4]`.

## ⛔ Esta fase substitui a versão que decidia CVD pela Coinalyze

A versão anterior (`03_cvd.md`, retirada) construía o primeiro consumidor Coinalyze de produção, com
contador de cota, recuo por `Retry-After` e rótulo de reconstrução. **A premissa que a sustentava era
falsa** (`SPEC-007`/`GA-7`, `ACHADO-KLINES-CVD.md`): `/fapi/v1/klines` devolve `takerBuyBaseVol` no
índice **`[9]`**, ao lado de `volume` no **`[5]`**, e

```
delta_cvd = 2 · takerBuyBaseVol − volume        (idêntica a 2·bv − v)
```

`[MEDIDO 2026-09-10, BTCUSDT 1m: v=29,757 · takerBuy=2,626 · delta=−24,505]`. O cruzamento contra a
Coinalyze bate **exato em 116 de 120** buckets (p95 = 0,00 bp, máx 38,52 bp)
`[MEDIDO 2026-09-10, n=120 buckets de 1 min comuns, BTCUSDT, 2 h]` — o `bv` da Coinalyze **é** o
`takerBuyBaseVol` da Binance. Todo o trabalho de integração desta fase **evaporou**; ele reaparece,
inteiro e do zero, na fase `05`, que é a única que ainda precisa da Coinalyze.

## Itens — e são poucos, de propósito

| # | item | componente | requisito |
|---|---|---|---|
| 2.1 | Ler o índice `[9]` (`takerBuyBaseVol`) da **mesma resposta** que a fase `01` já busca — nenhuma chamada nova | `sentimento` | `RF-1` |
| 2.2 | Quarta entrada do `cvd_source_catalog` (`metric=CVD_SOURCE_METRIC`, `provider="binance"`, `interval="1m"`, `quantity_field=NA`), com **teste nomeado** em `verified_by` | `sentimento` | `RF-2`, `SPEC-007` §4.4 |
| 2.3 | **Decidir `reconstructed_from` com o falsificador rodado ANTES de gravar a identidade:** comparar `2·takerBuy − volume` contra `cvd_delta` do `aggtrade_q` numa janela com os dois. Se divergirem além do que a agregação de bucket explica, a entrada **é** reconstrução e exige `published_error` (`D6.9`) | `sentimento` | `SPEC-007` §4.4 |
| 2.4 | Invariante `takerBuy ≤ volume` testada (a análoga `bv ≤ v` deu 30/30 na Coinalyze) | `sentimento` | — |
| 2.5 | Registro no catálogo servido por `/api/v1/series-catalog` | `sentimento` | `RF-2` |
| 2.6 | `CvdPane` recebe dado; `SEM_PONTO` honesto na ausência — e para `FLOW` renderizar ausência como zero é **erro de tipo**, não de UX | `web` | `RF-3`, `RN-1` |
| 2.7 | e2e Playwright contra o app real | `web` | `DoD-3` |

## ⚠️ A armadilha desta fase é o que ela NÃO deve fazer

Por ser marginal, é tentador entregá-la **dentro** da fase `01` — é o mesmo endpoint, a mesma resposta,
o mesmo coletor. **`D1` (owner) diz que uma fase é uma métrica**, e o DoD-VERTICAL é por métrica. Duas
métricas numa fase reintroduz exatamente o acoplamento que a feature existe para desfazer, e apaga a
evidência de que uma segunda identidade **consegue** pegar carona num coletor existente — que é a
capacidade de que a fase `04` depende.

## DoD verificável

1. `count(*)` de `md.series` para a `series_key_id` de `cvd_source`/`binance` **> 0**. Hoje: `0`
   `[MEDIDO 2026-09-10, n=23.512 linhas, nenhuma do CORE]`.
2. `GET /api/v1/series-history` → `n_points > 0`.
3. Playwright: `CvdPane` com **`N ≥ 30`** pontos distintos, **não** `SEM_PONTO`.
4. Run fechado da fonte com `n_written > 0` (possível desde `01`, `ADR-035`).
5. `takerBuy ≤ volume` verdadeiro em **100%** da janela de backfill — universo declarado no gate.
6. O falsificador de `reconstructed_from` (item 2.3) **rodado**, com `n` e resultado no gate, **antes**
   de a identidade ser gravada — mudá-la depois **re-identifica a série** (`series_key.py:226`).
7. **Nenhuma chamada HTTP nova** em relação à fase `01`: o diff de rede é zero, e o teste que prova
   isso é o que impede a fase de virar uma segunda integração por descuido.
8. `make verify` verde.

## Falsificador da fase

Se `2·takerBuy − volume` divergir do `cvd_delta` de `aggtrade_q` além do que a agregação de bucket
explica, então a série **é** uma reconstrução e nasceu sem `published_error` — e `SPEC-007` §4.4
escolheu errado. É por isso que o item 2.3 roda **antes** de gravar, não depois.
