# `ADR-036/D5` tem premissa falsa: CVD **não** exige aggTrades

`[MEDIDO 2026-09-10]` — apuração do loop principal, provocada pela pergunta do owner
*"binance serve recursos rest e ws, o que ele tem de rest não fecha algumas dessas lacunas
abertas?"*. **Entrada para o `/architect`. Não é decisão.**

## 1. A premissa que cai

`ADR-036/D5` decide **CVD pela Coinalyze** com esta justificativa:

> *"a única métrica cuja origem está vetada"* — porque CVD pela Binance exigiria **aggTrades**,
> vetado pela premissa de infra.

**Falso.** `/fapi/v1/klines` devolve, no índice **[9]** do array, `takerBuyBaseVol` — o volume
**comprador agressor** do bucket. Junto com `volume` no índice [5]:

    delta_cvd = 2 * takerBuyBaseVol - volume        (identica a `2*bv - v` da Coinalyze)

`[MEDIDO 2026-09-10, BTCUSDT 1m]` — `v=29,757` · `takerBuy=2,626` · `takerSell=27,131` ·
`delta=-24,505`.

⇒ **CVD sai do MESMO endpoint que o volume, sem aggTrades, sem terceiro.**

## 2. Cruzamento Coinalyze × Binance no mesmo bucket

`[MEDIDO 2026-09-10, BTCUSDT, janela 2 h, n=120 buckets de 1 min COMUNS às duas fontes]`

    cz: /v1/ohlcv-history  symbols=BTCUSDT_PERP.A&interval=1min
    bn: /fapi/v1/klines    symbol=BTCUSDT&interval=1m

divergência absoluta, em basis points:

| campo | mediana | p95 | p99 | máx | **zero exato** |
|---|---:|---:|---:|---:|---:|
| `volume` (`v` × `[5]`) | 0,00 | 2,27 | 389,63 | 566,00 | **104/120** |
| `takerBuy` (`bv` × `[9]`) | **0,00** | **0,00** | 1,00 | **38,52** | **116/120** |

**O `bv` da Coinalyze é o `takerBuyBaseVol` da Binance, exato em 116 de 120 buckets.**

⇒ Ir à Coinalyze buscar CVD é **acrescentar um salto, uma cota e uma dependência de terceiro
para receber de volta o dado da Binance**.

⚠️ **O que este número NÃO é:** não é prova de correção, é prova de **concordância**. E o
universo é pequeno — **1 símbolo, 2 h, n=120**. Não é o corpus que refuta a cauda de agosto
(§4 abaixo).

## 3. Comparação de fonte para volume + CVD

| | Coinalyze `ohlcv-history` | Binance `/fapi/v1/klines` |
|---|---|---|
| cota | 40 unidades/min (`símbolo×endpoint`) | **2.400 weight/min** por IP |
| custo de 1.500 velas de 1 min | 1 unidade | **weight 1** `[MEDIDO: 31→32→33]` |
| retenção a 1 min | **~1,5 dia** (teto por contagem de pontos) | **desde 2019-09-08** `[MEDIDO]` |
| volume + CVD na mesma resposta | sim | **sim** |
| dependência | terceiro | **origem** |

**Isto também fecha a lacuna de backfill profundo** que eu havia declarado sem fonte: `klines`
serve 4 h desde 2019-09-08 para BTCUSDT — ~7 anos, o que um backtest a `15min..4h` exige e a
Coinalyze **não** tem.

## 4. O que isto faz com `ADR-036/D6` (a cauda do `bv`)

`D6` escala a fidelidade do `bv` ao `quant-architect` na fase `03`. **Se o CVD vier do `klines`,
a pergunta deixa de estar no caminho crítico** — não se depende mais do `bv` para o CORE.

⚠️ **Isto NÃO refuta a medição de agosto** (`docs/medicao-coinalyze.md` §4: p99 29 bp,
máx 1.956 bp). Aquela compara Coinalyze contra o **dump canônico S3**; esta compara Coinalyze
contra o **REST da Binance** — corpora e referências diferentes, e a minha é de n=120 contra
1 símbolo. As duas podem estar certas. O que muda é a **relevância**: a cauda deixa de ser
risco do CORE e vira questão em aberto sobre a Coinalyze, a ser respondida quando/se ela for
usada para algo que importe.

## 5. O que NÃO muda

- **Liquidações continuam na Coinalyze** (`D4`/`D6` do owner). A Binance **não tem REST de
  liquidação** — só o WebSocket `forceOrder` `[MEDIDO: nenhum endpoint em `/futures/data/`]`.
  A decisão do owner permanece intacta e este achado não a toca.
- **Open interest e long/short continuam na Binance** (`D2`/`D3` do `ADR-036`), já eram origem.
  ⚠️ Medido hoje: `/futures/data/*` **corta em ~30 dias** — `startTime` de −60 d devolve
  **HTTP 400**. Profundidade boa para operar, **insuficiente para backtest longo** dessas duas.

## 6. Consequência para o plano de fases

A fatia `01` já constrói o cliente REST de `/fapi/v1/klines` (item 1.2 do plano: *"não existe
nenhum hoje"*) e cria a identidade `klines_volume` em `interval="1m"`. Como `takerBuyBaseVol`
vem **na mesma resposta**, a fatia `03` (CVD) passaria a ser: **reusar o cliente da `01`, ler
mais um campo, criar mais uma identidade de série.** Zero integração nova.

Hoje `03_cvd.md` cita Coinalyze **11 vezes** — é ele que precisa de reescrita, não a `01`.

**Quem decide é o `/architect`**, revisando `ADR-036/D5`. Duas coisas que ele tem de pesar e que
eu não vou decidir: (a) se manter a Coinalyze como **segunda testemunha** do CVD tem valor que
pague a integração, dado que 116/120 buckets batem exato; (b) se a divergência **de volume**
(máx 566 bp, maior que a de `takerBuy`) tem causa conhecida — eu **não** a diagnostiquei.
