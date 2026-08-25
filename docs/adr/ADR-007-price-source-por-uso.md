# ADR-007 — `price_source` declarado POR USO

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §3.7
**Fase/Epic:** F2 (o catálogo) e F1 (a primeira declaração, na S2-mínima) · `CST-4`, `CST-3` · **Componente alvo:** `sentimento`
**Origem:** `[GAP G3]`

## Contexto

Existem **quatro** séries de preço no mesmo dump: `klines`, `markPriceKlines`, `indexPriceKlines`, `premiumIndexKlines` — e no **mesmo bucket** (1787443200000) o last price abre em **77084.50** e o mark price em **77084.01** `[MEDIDO]`.

**A divergência não é de precisão. É de estrutura**, e é isso que faz esta ADR existir:

| medição, 288 buckets de 2026-08-23, `\|mark − last\|` | valor |
|---|---|
| high, mediana / máx | **0,285 bp** / 5,842 bp |
| low, mediana / máx | **0,480 bp** / **14,430 bp** |
| em ticks (`tickSize = 0.10`): high mediana / máx | **21,8** / **456** |
| em ticks: low mediana / máx | **37,0** / **1.102,8** |
| **o bucket que contém o HIGH DO DIA** | **diferente nas duas séries**: last **78057,60** às 20:05Z; mark **78017,83** às 20:10Z |
| **ordenação de highs entre buckets vizinhos** | **inverte em 2,09%** dos pares |
| **ordenação de lows entre buckets vizinhos** | **inverte em 5,57%** dos pares |

**Ordenação de high/low entre candles vizinhos é a primitiva de swing, BOS/CHoCH e sweep** ⇒ **escolher a série decide ONDE O SWING ESTÁ**. E a divergência mediana (22–37 ticks) é **maior que qualquer tolerância plausível de "igual"**.

**E o mark é série AMOSTRADA:** `markPriceKlines` tem **`count = 300` em todo bucket de 5 min** (1 Hz) contra média de **11.245 trades/bucket** no `klines` `[MEDIDO]` ⇒ **seus extremos são subamostrados por construção**.

## Decisão

**`price_source` é declarado por `price_use` no `series_catalog`. Não existe série de preço canônica global.**

| `price_use` | `price_source` | por quê |
|---|---|---|
| `structure_detection` | **`klines_last`** | swing, BOS/CHoCH e sweep se desenham no **preço negociado**, e o mark é amostrado a 1 Hz — seus extremos são subamostrados por construção |
| `liquidation_trigger` | **`mark_price`** | liquidação acontece em **mark price**, não em last |
| `funding` | **`mark_price`** | o funding é calculado **sobre o mark** |
| `execution` | **`klines_last`** | o fill acontece **no livro** |
| `cost` | **`mark_price`** | marcação a mercado |

**Três regras de mecanismo:**

| # | regra |
|---|---|
| **PS-1** | Pedir preço **sem `price_use`** é **erro**, nunca default silencioso — um default aqui escolhe **qual grandeza** o consumidor recebeu, e a escolha muda **onde o swing está** |
| **PS-2** | **`price_mark_close` é uma das quatro séries de preço, declarada no catálogo** — não subproduto do painel de OI. O nome `implied_avg_price` está **PROIBIDO**: *"preço médio implícito"* **ensina errado**, e o catálogo de séries é o veículo de propagação |
| **PS-3** | Toda `<Anotacao>` carrega `price_source` **e** `price_use`. **Teste negativo:** marcar sob `klines_last` e reabrir sob `mark_price` ⇒ a marcação **não é reexibida como se fosse a mesma** (ou aparece rotulada `marcada sobre outra série de preço`) |

## O que torna este GAP mais barato de fechar do que parecia

**Medido: `sum_open_interest_value / sum_open_interest` É o `close` do `markPriceKlines` do mesmo bucket, exato a 8 casas, 288/288 em dois dias de BTCUSDT** (alts 282–286/288, resíduo ≤ **4,34 bp** de precisão) `[MEDIDO]`.

⇒ **o dump `metrics` que a plataforma já ingere carrega mark price em grade de 5 min, 2.183 dias, 570/570 símbolos, de graça** — e entrega, de brinde, uma **fixture de tolerância ZERO** para o shift `+300000` que é **mais forte** que a que o PRD usava: o *"0,002516% contra o close de `[t, t+5min)`"* compara com o **last price**, que é a série errada; **contra o mark close o erro é exatamente zero**.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **uma série canônica global de preço** | qualquer escolha única erra em pelo menos dois usos: `last` erra liquidação e funding (que acontecem em mark), `mark` erra estrutura (extremos subamostrados a 1 Hz) e execução (o fill é no livro) |
| **`mark` para tudo, porque é "mais estável"** | estabilidade aqui é **subamostragem**: 300 pontos/bucket contra 11.245 trades/bucket. Estabilidade obtida por não olhar não é estabilidade |
| **`last` para tudo, porque é "o preço real"** | liquidação e funding **não acontecem** em last. Um backtest que dispare stop em last onde a corretora liquida em mark modela um mercado que não existe |
| **tolerância de "igual" entre as duas** | a divergência mediana é **22–37 ticks**. Não há tolerância plausível que as una **e** preserve ordenação de vizinhos, que é a primitiva |
| **declarar `price_source` só no painel (UX)** | é onde o `faseamento` o deixava. Mas o consumidor que decide é o **motor**, e ele não lê painel: sem `price_use` no catálogo, a escolha volta a ser implícita no código |

## Falsificador

**Se, sobre ≥ 30 dias e ≥ 4 símbolos, a ordenação de highs e lows entre buckets vizinhos coincidir em 100% dos pares entre `klines_last` e `mark_price`, então a distinção por uso é custo sem retorno** e uma série canônica basta. Hoje ela **não** coincide: **2,09%** de inversão em highs e **5,57%** em lows, n = 288 buckets `[MEDIDO]`.

**Segundo falsificador, mais forte porque é de estrutura:** se o **bucket que contém o high do dia** for o mesmo nas duas séries em ≥ 30 dias consecutivos, o argumento de "decide onde o swing está" perde a base — hoje ele é **diferente** no dia medido.

## Consequência

- Sob **qualquer** resposta de `Q20` (SMC × pivôs+Fibonacci), `price_source` por uso é requisito — porque **os dois vocabulários se apoiam no mesmo primitivo (swing)** e o swing mora na ordenação de high/low vizinho.
- `tick_size` e `price_precision` **datados** (SCD-2) são requisito irmão: **toda tolerância de estrutura é expressa em ticks**, e há **25 `tickSize` distintos** e `pricePrecision` **de 1 a 8** nos 570 perpétuos `[MEDIDO]`.
- **Precisão vem de `quantityPrecision`/`tickSize` datados, nunca da largura da string:** `sumOpenInterest: "105832.81400000"` tem **8 casas de payload e 3 de conteúdo** `[MEDIDO]`.
