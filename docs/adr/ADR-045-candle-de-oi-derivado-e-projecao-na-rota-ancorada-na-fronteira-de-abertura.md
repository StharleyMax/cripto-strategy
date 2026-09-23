# ADR-045 — O candle de OI derivado é uma PROJEÇÃO na rota, ancorada na fronteira de abertura, e não um 9º par de redução

**Data:** 2026-09-23 · **Status:** proposta, **CONDICIONAL**: entra em vigor só se o owner escolher em
`[Q-OI-1]` uma opção que derive da Binance (`O-1` ou `O-3`, e a parte histórica de `O-4`; `SPEC-009` §6.1).
Com `O-2` puro ela **não se aplica**, porque aí a série `(STOCK, OPEN|HIGH|LOW|CLOSE)` da Coinalyze já
reagrega pela tabela de `ADR-040` (`ADR-040` M2).
**SPEC:** [`SPEC-009`](../specs/SPEC-009-paineis-de-fluxo.md) §6 · **Componente alvo:** `sentimento` (função de domínio + rota) · `web` (consumo)
**Fase:** `03` · **Amplia:** o domínio de `ADR-040/D2` (fechado em `(nature, reduction)`), sem mexer nos 8 pares
**Julgamento delegado citado:** [`LIQ-1-julgamento-quant-architect.md`](../context/paineis-de-fluxo/handoff/LIQ-1-julgamento-quant-architect.md) §Q3, §Q4, §Q5

---

## Contexto

O OI da origem (`D-a`, Binance USDT-M, contratos) é `(STOCK, POINT)` com `POINT_AT_BUCKET_END`, sobre uma
grade nativa de 5 min. O ponto `p(t)` é a leitura **no instante `t`**, sem deslocamento
(`collector_series_mapping.py:729-738`; Binance: `timestamp` = *"End time of the period"*)
`[DOC: LIQ-1 §2ª passagem]`. Sob `ADR-040/D1` a rota reagrega `(STOCK, POINT)` por `last`
(`series_reduction.py:28, 170`) ⇒ **o browser recebe 1 ponto por bucket de TF e não consegue montar
OHLC**. Por isso a afirmação do `PRD-009` de que *"com `O-1`, F3 é só `web`"* é **falsa** (`SPEC-009` A-1).

Há ainda o defeito do `RN-5` do `PRD-009`: *"OI toma `open` do primeiro"*. Em TF `5m`, `|S| = 1` ⇒
`open == close` sempre ⇒ **todo candle sai neutro**, e o pane fica cego justamente para *"se ta
entrando OI"* `[PREMISSA-OWNER: 2026-09-23]`. O `quant-architect` confirmou isso (`LIQ-1` §Q3).

## Decisão

**D1 — A definição.** Para o bucket `B = (T0, T1]`, com amostras `S = {p(t) : T0 < t ≤ T1}`
(fonte: Coinalyze `candlestick_oi`, `"o": "Open interest at the beginning of the interval"`
`[DOC: api.coinalyze.net/v1/doc/api-spec.json, LIQ-1 §Q3]`):

| campo | valor | condição |
|---|---|---|
| `close` | `p(T1)`; se não existir, a última amostra de `S` | — |
| `open` | `p(T0)`, a âncora de fronteira | **existe ponto em `T0`**, haja ou não buracos dentro de `B` |
| `open` | a primeira amostra de `S` | não existe `p(T0)` **e** `|S| ≥ 2` |
| **nenhum candle** | — | `S` vazio (`RN-2`), **ou** não existe `p(T0)` e `|S| = 1` (um doji ali seria zero fabricado a partir de ausência, a classe que `RN-4` proíbe) |
| `high` / `low` | `max` / `min` de `{open} ∪ S` | sempre, e é **cota inferior** da amplitude verdadeira (`RN-6`) |

Esta definição **substitui** a de `§13-A/O-1` do PRD. A condição de lá, *"`gap == 300000`"*, era estreita
demais: descartava uma âncora válida quando havia buraco em `T0 + 5 min`.

**D2 — O lugar.** Uma **projeção nova** em `sentimento`: função pura de domínio, servida pela rota
`/series-history`, ao lado da reagregação de `ADR-040/D1`. A chave da projeção é o **trio**
`(STOCK, POINT, POINT_AT_BUCKET_END)`, e qualquer outro trio **falha alto** (mesmo princípio de
`UncoveredReductionPairError`).

**D3 — A forma do dado** (sem código; os nomes fixados em `SPEC-009` §6.3):
`bucket_end_ms, open, high, low, close, open_at_ms, close_at_ms, samples{present, expected}, closed, derived_from`.
`samples` segue o par de inteiros de `ADR-040/D3` (nunca percentual, nunca booleano), e
`expected = TF / 5 min` ⇒ `expected == 1` diz, **no contrato**, que não há pavio nesta resolução (`Q-OI-3`).

## Alternativas recusadas, com o custo

| alternativa | custo | por que cai |
|---|---|---|
| **4 chamadas de `reduce_bucket`** sobre a série `POINT` | zero código novo de domínio | `reduce_bucket(STOCK, OPEN, S)` devolve a primeira de `S`, **que é o defeito do `RN-5`**. Pedir `HIGH` a leituras `POINT` fere o contrato do próprio módulo (*"correct only when `values` holds THAT reduction's own column"*, `series_reduction.py:46-52`) e mente sobre o termo de identidade |
| **9º par na `REDUCTION_TABLE`** | uma linha na tabela | a assinatura da tabela é *fatos do bucket → 1 float* (`series_reduction.py:175-185`). O `open` precisa de um fato **de fora** do bucket, `p(T0)`, e a saída carrega instantes e cobertura. Encaixar isso quebra o contrato dos 8 pares |
| **derivar no browser** a partir de pontos `5m` | nenhuma mudança no backend | fere `ADR-040/D1` (*"uma implementação, num lugar só"*). Transporte de 48× em `4h` (1 bucket passa a exigir 48 pontos) `[INFERRED: aritmética TF/5min]` |
| **materializar 4 séries OHLC em `md.series`** | leitura trivial | escritor novo, disco novo (`D-j`), e uma segunda verdade sobre o mesmo estoque, que é justamente o padrão *catálogo com série sem escritor* de `PRD-009` G-1, só que ao contrário |

## Falsificador

1. **Propriedade de fechamento.** Em todo bucket fechado que tenha `p(T1)`, `OiCandle.close` tem de ser
   igual ao valor que `/series-history` já serve para `(STOCK, POINT) = last` no mesmo TF.
   Universo: `n ≥ 288` buckets `5m` reais de `BTCUSDT` (24 h). **Uma divergência derruba a projeção.**
2. **Propriedade de âncora.** `open(Bₖ) == close(Bₖ₋₁)` sempre que `open_at_ms == T0`, no mesmo universo.
   Uma divergência mostra que a âncora está lendo o ponto errado.
3. **Poder da decisão (o que a derruba no mérito).** Se nos buckets `5m` com âncora e sem buraco
   (`n ≥ 200`) o corpo `close − open` for `0` em **mais de 50%**, então o OI da origem é quase constante
   na grade de 5 min, o candle derivado não entrega a leitura *"entrou/saiu contrato"*, e a escolha
   `O-1` precisa voltar ao owner com esse número. `[NÃO MEDIDO: é o item 3.2 do plano 03]`

## Fora desta ADR

- **Disponibilidade.** `bucket_end_ms` **não** é o instante em que o dado fica disponível: o ponto `T` é
  publicado cerca de 1 min depois (`collector_series_mapping.py:735`). Um consumidor que **decida** com
  base no `OiCandle` (`backtest`/`convergencia`) tem de usar `modeled_availability.py`. O pane não decide
  nada `[DOC: LIQ-1 §Q4]`.
- **Com `O-2`/`O-4`**, os corpos de `O-1` e da Coinalyze diferem por construção: concordam no `close`
  (1,86 bp mediana) e não no `open` (6/2.141) `[DOC: open_interest_catalog.py:15-17]`. Se as duas
  aparecerem na tela, isso não é bug.
