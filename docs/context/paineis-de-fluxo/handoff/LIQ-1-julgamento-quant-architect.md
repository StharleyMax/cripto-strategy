# Julgamento `quant-architect` — `paineis-de-fluxo`, `Q-LIQ-1`

**Entrada:** `docs/context/paineis-de-fluxo/handoff/LIQ-1-quant-architect.md` (pergunta 1).
**Escopo:** as **5** perguntas do briefing. A 1ª passagem (mesmo dia) julgou só `Q-LIQ-1`; a 2ª
passagem **acrescenta §Q2–§Q5** e **corrige** a seção TradingView de `Q-LIQ-1` (achou fonte oficial
que a 1ª declarou inexistente — ver *"CORREÇÃO, 2ª passagem"*). O texto da 1ª fica, a correção é
acrescentada, não reescrita.
**Data:** 2026-09-23. Read-only: nenhum código, nenhuma ADR. `Q-OI-1`/`Q-OI-2` **não** são escolhidas
aqui — são do owner.

## Resumo dos 5 vereditos

| # | pergunta | veredito | força |
|---|---|---|---|
| Q1 | `Q-LIQ-1` | short liquidado **para cima / cor de alta**; long liquidado **para baixo / cor de baixa** — convenção **Coinalyze**. A TradingView **discorda** na página *Markets* (Long = verde, para cima) | `[DOC]` nas duas; a escolha pela Coinalyze é `[INFERRED: a referência do owner É Coinalyze]` |
| Q2 | `O-2` × `ADR-036/D2` | **não passa no teste como escrito** — a origem publica OI instantâneo; o que não existe é a história intra-5 min | `[INFERRED: leitura do texto de D1/D2]` |
| Q3 | `open` do candle de OI | o achado do `/architect` **se confirma**: `RN-5` está errada para `(STOCK, POINT)`. `open` = ponto **na fronteira de abertura** `T0` — e a condição certa é *"existe ponto em `T0`"*, não *"gap == 300000"* | `[DOC: Coinalyze api-spec "o = Open interest at the beginning of the interval"]` + aritmética |
| Q4 | onde a derivação mora | **projeção nova**, não 9º par de `REDUCTION_TABLE` e não 4 chamadas de `reduce_bucket`; na rota (`ADR-040/D1`) | `[INFERRED]` sobre `[DOC: series_reduction.py:46-52,132-138,175-195]` |
| Q5 | `Q-OI-3` | **sim, declarar** — sem pavio em `5m` é *não observado*, não *não se moveu* (classe ausência×zero, `RN-4`); o fato viaja **no contrato**, a forma é do `design_gate` | `[INFERRED]` |

---

## Veredito

**Short liquidado vai para CIMA, na cor de ALTA. Long liquidado vai para BAIXO, na cor de BAIXA,
desenhado como valor negativo em torno de uma base 0.** A cor é o **token de alta/baixa do tema**,
não um verde/vermelho literal — o que bate com `RNF-3` (uma gramática de cor só).

A `[INFERRED]` de `PRD-009` §14 (`:323`) estava **certa**. Agora ela tem fonte lida: pode subir de
`[INFERRED]` para `[DOC]` e virar critério de `RF-11`/`CA-9`.

---

## Fonte 1 — o próprio indicador da Coinalyze, no código que roda no chart dela `[DOC]`

O painel da referência (`coinalyze-tradingview-2026-09-23.png`, legenda *"Aggregated Liquidations
COIN-margined Contracts"*) é um indicador customizado da Coinalyze, rodando dentro da biblioteca de
chart da TradingView. A definição dele está no bundle público:

- URL: `https://coinalyze.net/js-bundle/mainTop,symbolPage,highcharts.js?v=342`
- baixado em 2026-09-23, HTTP 200, 826.448 bytes, `sha256 96938b47979efbf68bdf9e8fc461fee723af735d5c4a2fa38d92fcd4bef57ac2`
- o objeto `name:"AggregatedLqUsdDenominated"`, no offset de caractere ~227019

Trechos literais desse objeto:

```
description:"Aggregated Liquidations COIN-margined Contracts"
plots:[{id:"shorts_liquidation",type:"line"},{id:"longs_liquidation",type:"line"}]
defaults:{styles:{shorts_liquidation:{plottype:5,color:h.ci.up_color,...},
                  longs_liquidation:{plottype:5,color:h.ci.down_color,...}}, ...
          inputs: {overlap_bars:!1, ...}}
styles:{shorts_liquidation:{title:"Shorts liquidation (Buy)",histogramBase:0},
        longs_liquidation:{title:"Longs liquidation (Sell)",histogramBase:0}}
...  c=r[p.symbolLQB], d=r[p.symbolLQS], a+=c?c.lq_volume:0, s+=d?d.lq_volume:0 ...
return[a,i?s:-1*s]        // i = input(0) = overlap_bars, false por padrão
```

Como ler:
- `shorts_liquidation` = soma de `LQB` (liquidação na **compra**) → **positivo** → `up_color`.
- `longs_liquidation` = soma de `LQS` (liquidação na **venda**) → **`-1*s`, negativo** → `down_color`.
- `histogramBase:0` → os dois são histogramas em torno do zero, **espelhados**.
- `overlap_bars` (padrão **desligado**) é a única opção que põe as duas pernas do lado positivo,
  sobrepostas. O padrão é espelhado.
- Os três indicadores irmãos (`AggregatedLqCoinDenominated`, `AggregatedLqCoinAndUsdDenominated`,
  `AggregatedLiquidations`) declaram os mesmos dois plots, na mesma ordem (offsets ~223512–231116).

Os tokens de cor, no mesmo bundle (`themesVariables`, offset ~148422):
`dark.ci: up_color "#2FA215", down_color "#e12c2c"` · `light.ci: "#3F9A82" / "#DF5757"` ·
`accessibility.ci: "#4F5DEF" / "#D55E00"`. **No tema de acessibilidade as pernas ficam azul e laranja.**
Ou seja, a convenção é *alta/baixa*, não *verde/vermelho*.

## Fonte 2 — o gráfico por exchange na página de liquidações da Coinalyze `[DOC]`, confirma a Fonte 1

`https://coinalyze.net/bitcoin/liquidations/` devolve 403 para `curl`/WebFetch (Cloudflare). Por isso a
leitura foi feita sobre a captura do Wayback Machine:
`https://web.archive.org/web/20251117032741id_/https://coinalyze.net/bitcoin/liquidations/`
(`sha256 4c4c46ff1f4e317902579ab1d1f997e86fd542156ca8f334c355c40442ea26ba`, linhas 1866-1879):

```
name: 'Shorts (Buy)',  color: '#3F9A82', data: ... item.lqb_per_exchange
name: 'Longs (Sell)',  color: '#DF5757', data: ... return -1*item.lqs_per_exchange
```

O tooltip dessa página mostra `Math.abs(point.y)` (linha 1784): o valor exibido é a **magnitude**, mesmo
com a perna long desenhada como negativa. Isso importa para a legenda de `RF-10`: ela deve mostrar as
duas magnitudes, sem sinal de menos.

## Fonte 3 — a semântica do dado na origem (API) `[DOC]`

`https://api.coinalyze.net/v1/doc/`, estado OpenAPI embutido na página (`__redoc_state`),
schema `liquidation_per_interval`:
`"l": "Longs liquidation volume"`, `"s": "Shorts liquidation volume"`, `"t": "The beginning of the interval"`.

## A nossa `cohort` — confere `[DOC]`

**`cohort=long` = posições long liquidadas.** A cadeia é:
- `backend/src/modules/sentimento/domain/liquidation_zero_legitimacy.py:63-67`:
  `LONG = "l"` — *"long positions liquidated in this bucket"*; `SHORT = "s"`.
- `backend/src/modules/sentimento/domain/liquidation_collection.py:57-64`:
  `LiquidationSide.LONG: LONG`, `LiquidationSide.SHORT: SHORT`. O pareamento é travado por
  `test_liquidation_collection.py::test_the_cohort_of_each_wire_letter`.
- Fonte 3: `l` = *"Longs liquidation volume"*.

⇒ **`cohort=long` → para baixo / cor de baixa; `cohort=short` → para cima / cor de alta.**

## Confronto com o mecanismo — as fontes não discordam

Uma posição long é liquidada quando o preço cai; o fechamento forçado dela é uma **venda**. A
Coinalyze escreve isso no próprio título, *"Longs liquidation (Sell)"* `[DOC, Fonte 1]`. A perna long
fica do lado da baixa em três leituras: o sinal (negativo), a cor (`down_color`) e o mecanismo. Na
referência, as barras para baixo coincidem com a vela de queda e as barras para cima com a rally
(co-ocorrência na imagem `[INFERRED]`). **Não há discordância a arbitrar.**

⚠️ A doc da Binance para `!forceOrder@arr` (`developers.binance.com/.../All-Market-Liquidation-Order-Streams`)
só diz `"S": Side, Example: SELL`. Ela **não** diz que `SELL` = long liquidado. Esse elo vem do
mecanismo e do rótulo da Coinalyze, **não** da Binance `[INFERRED: fechamento forçado de long é
venda]`. Isso só pesa se o pane passar a desenhar a perna `forceOrder`.

## TradingView — `[NÃO SEI]` se existe convenção oficial

Não achei indicador **nativo** de liquidação da TradingView, e não li nenhuma doc da TradingView que
fixe uma convenção. O que existe na referência é a biblioteca de chart da TradingView rodando o
indicador **da Coinalyze** (Fonte 1). O único script da TradingView lido é comunitário:
*"Liquidations Aggregated (Lite)"*, autor `mxdvt07`
(`https://www.tradingview.com/script/cwefCALw-Liquidations-Aggregated-Lite`). Ele descreve
*"teal bars (Buy Volume from Short Liquidations)"* e *"red bars (Sell Volume from Long Liquidations)"*
como *"mirrored column charts around a zero baseline"*. As cores concordam com a Coinalyze. Qual lado
é o de cima **não foi extraído** do resumo — `[NÃO SEI]`. É terceiro, e não vale como convenção da
TradingView.

---

### ⚠️ CORREÇÃO, 2ª passagem — a TradingView TEM convenção publicada, e ela é a OPOSTA

A frase acima *"não li nenhuma doc da TradingView que fixe uma convenção"* era verdade para a 1ª
passagem e deixou de ser. A TradingView publica um artigo oficial de ajuda:
`https://www.tradingview.com/support/solutions/43000762400-liquidations/` (título servido:
*"Liquidation data: what to watch and why it matters"*; `curl` HTTP 200, 561.568 bytes, `sha256
31a165ca…5601`). O **texto** dele só define as pernas — literal: *"A long liquidation means long
positions were forcibly closed. A short liquidation means short positions were forcibly closed."* — e
diz onde o indicador mora: *"Indicators dialog → Fundamentals → Derivatives → Liquidations"*. **Nenhuma
frase fixa cor nem lado** `[DOC]`.

Mas o artigo embute 3 imagens da própria TradingView, e uma delas **fixa a convenção com legenda**:

- `https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/43622770276/original/9-Vxi5Q9wDdDimOVQ26_XzhUE0aSGH8cYw.png`
  (`sha256 af17c668…4e35`) — BTCUSD, *"Liquidations — Track long and short liquidations across the
  market. Market snapshot"*, legenda **`● Long` verde, `● Short` vermelho**, com **as barras verdes
  acima do zero e as vermelhas abaixo** `[DOC: imagem oficial, lida]`.
- Sanidade da leitura contra eventos conhecidos, na mesma imagem: a maior barra **verde para cima** é
  a de **outubro/2025**, na queda de ~122k para ~105k (flush de longs), e a maior **vermelha para
  baixo** é **julho/2025**, na alta para ~120k (squeeze de shorts) `[INFERRED: co-ocorrência na imagem,
  n=2 eventos]` ⇒ na *Markets* da TradingView, **cor e lado seguem a COORTE** (long = verde = em cima).
- A outra imagem do mesmo artigo (`…/43622770278/…DOfbbhWY6lXkGYhwubLKxpEesZnI4RqSyw.png`, Supercharts,
  OKX `BTCUSDT.P` 1D) mostra o indicador espelhado (verde positivo / vermelho negativo) **sem rótulo de
  perna**; a co-ocorrência com as velas é ambígua entre os dois panes da própria imagem ⇒ **qual perna o
  indicador de Supercharts põe em cima: `[NÃO SEI]`**.

**Então as fontes DISCORDAM, e a frase *"Não há discordância a arbitrar"* acima está errada** — vale
para Coinalyze × mecanismo, não para Coinalyze × TradingView.

**Qual seguir, e por quê:** a **Coinalyze** (short ↑ alta, long ↓ baixa). Três razões, em ordem de força:
1. **A referência do owner É um chart da Coinalyze** — a legenda *"Aggregated Liquidations COIN-margined
   Contracts"* é o indicador `AggregatedLqUsdDenominated` da Fonte 1 `[DOC]`, e a fala dele pede
   *"bem proxima da coinalyze e tradingview"* `[PREMISSA-OWNER: 2026-09-23]`. Adotar a convenção da
   *Markets* da TradingView **inverteria a imagem que ele mandou**.
2. A convenção Coinalyze colore pelo **lado da ordem forçada** (*"Shorts liquidation (Buy)"* /
   *"Longs liquidation (Sell)"*), a mesma gramática da vela (alta = compra) — o que torna legível
   *"qual lado foi varrido naquele candle"* (F4) no mesmo token de cor do preço, e casa com `RNF-3`.
   A da TradingView colore pela **coorte**, que num pane embaixo do preço dá **verde na queda** `[INFERRED]`.
3. É a convenção com rótulo de perna **no código** (Fonte 1), e não só numa imagem.

⚠️ **Não-verificável daqui:** se a TradingView usa a convenção de coorte **também** no Supercharts →
`[NÃO SEI]`. Se o owner considerar a TradingView a referência principal, a pergunta volta para ele —
não é minha para desempatar contra a imagem que ele mesmo escolheu.

## Critério proposto para `RF-11` / `CA-9` (verificável sem confiar em mim)

1. A série `cohort=short` é plotada com valor `+v`, no token de **alta** do candle de preço.
2. A série `cohort=long` é plotada com valor `−v`, no token de **baixa**, com base do histograma em 0.
3. A legenda mostra **as duas magnitudes** (`|v|`), cada uma na cor da sua perna, e **nenhum** número
   `long − short` (`RN-3`). Mostrar a perna long com sinal negativo na legenda seria artefato de
   desenho, não dado.
4. Espelhar não é somar. O sinal negativo é só geometria de desenho: nenhum valor derivado de
   `short + (−long)` pode chegar à tela nem a um endpoint.

**Como o owner confere:**
- **No gráfico (fixture de mercado):** abra a Coinalyze num trecho de queda forte e veja que o tooltip
  da barra para baixo diz *"Longs liquidation (Sell)"*. Depois compare com o nosso pane no mesmo trecho.
- **Na fonte, sem confiar neste texto:**

```bash
curl -s -A 'Mozilla/5.0' 'https://coinalyze.net/js-bundle/mainTop,symbolPage,highcharts.js?v=342' \
 | python3 -c 'import sys;s=sys.stdin.read();i=s.find("name:\"AggregatedLqUsdDenominated\"");print(s[i:i+1850])' \
 | grep -oE 'shorts_liquidation:\{[^}]*\}|longs_liquidation:\{[^}]*\}|return\[a,i\?s:-1\*s\]'
```

  ⚠️ `?v=342` é a versão servida em 2026-09-23. Quando a Coinalyze trocar o bundle, o `sha256` acima
  deixa de bater e o critério precisa ser relido. A trava fica no **critério escrito**, não no arquivo
  de terceiro.

## O que eu NÃO julgo

- **A cor exata e o contraste** dos tokens de alta/baixa no nosso tema → `design_gate`
  (`ui-designer` + `ux-ui-mastery`).
- **Se o pane oferece `overlap_bars`** (as duas pernas do lado positivo) → decisão de UI, não de dado.
- ~~**Se TradingView tem convenção oficial própria** → `[NÃO SEI]`, nenhuma fonte oficial lida.~~
  **Corrigido na 2ª passagem:** tem, na página *Markets* (coorte), e é oposta — ver a CORREÇÃO acima.
  No **Supercharts** continua `[NÃO SEI]`.
- ~~**Perguntas 2-5 do briefing** → fora deste despacho.~~ Julgadas abaixo, na 2ª passagem.

---

# 2ª passagem — Q2 a Q5

Notação usada daqui para baixo (vale para as quatro perguntas):
- `p(t)` = leitura Binance `sumOpenInterest` (contratos) com `bucket_end = t`. **`t` é o instante
  medido, sem shift**: `collector_series_mapping.py:729-738` — *"the point labelled `T` is the reading
  at `T`, so `bucket_end = T`"* `[DOC]`, e a doc da Binance diz de `timestamp`: *"End time of the
  period"* `[DOC: developers.binance.com/…/Open-Interest-Statistics, lido via WebFetch — curl devolve
  202/0 bytes]`. Grade nativa 5 min (`open_interest_catalog.py:48-67`).
- Bucket de TF: `B = (T0, T1]`, `T1 = bucket_end_ms`, `T0 = T1 − TF`. Amostras do bucket:
  `S = { p(t) : T0 < t ≤ T1 }`, `|S|` esperado = `TF / 5 min` (1, 3, 12, 48).
- **Âncora** `A = p(T0)` — a leitura **na fronteira de abertura**. Ela pertence à grade nativa do
  bucket anterior (é o `close` dele), e **não** é lookahead: `T0 < T1`.

## Q2 — `O-2` × `ADR-036/D2`: *"OHLC de OI não existe na origem"* passa no teste?

**Veredito: não passa como escrito** `[INFERRED: leitura do quant-architect sobre o texto; o juiz da
ADR é o dono dela, não eu]`.

O teste, literal. `ADR-036/D1` (título, `ADR-036-…md:26`): *"a origem por padrão; o terceiro só onde a
origem é vetada, não existe, ou perde dado de forma irrecuperável"*. `D2` (`:47-50`), sobre **esta
mesma métrica**: *"a grade de **`5m`** … é o **teto da própria Binance** — a Coinalyze oferece `1min`,
mas **uma granularidade que a origem não publica é interpolação de terceiro, não medição**."*

Cláusula por cláusula:
1. **vetada** — não. Nada veta `openInterestHist`; ela é a série viva de F3 `[DOC: PRD-009 M3]`.
2. **não existe** — **falso no sentido que importa.** O que a origem não publica é a **história**
   intra-5 min. A **grandeza** ela publica: `GET /fapi/v1/openInterest` — *"Get present open interest of
   a specific symbol"*, resposta `{openInterest, symbol, time}` `[DOC: developers.binance.com/…/
   market-data/rest-api/Open-Interest, via snippet de busca; peso da chamada NÃO LIDO]`. Um pavio de OI
   **da origem** é construível prospectivamente, por polling; não existe para trás.
3. **perde dado sem volta** — verdade para o extremo intra-5 min, **mas igual para as duas fontes**:
   o que não for capturado hoje não volta, e a Coinalyze **também** apaga (retenção ~7 dias,
   `PRD-009 M9`; api-spec: *"We keep only between 1500 and 2000 datapoints for intraday"* `[DOC]`).
   A cláusula não discrimina a favor do terceiro.
4. E a frase de `D2` morde **direto**: o `h`/`l` da Coinalyze é informação numa granularidade (dentro
   do bucket de 5 min) que a origem histórica não publica — é o caso que `D2` chama de *"interpolação
   de terceiro, não medição"*. O contra-argumento honesto: `D2` foi escrita sobre **grade de tempo**
   (1 min × 5 min) e o pavio é **amplitude dentro do bucket** — eixo vizinho, não idêntico. Ler que
   `O-2` passa exige **emendar** `D2`, não interpretá-la.

**Dois fatos que pesam no menu e não estavam nele** (trade-off, não escolha — `Q-OI-1` é do owner):
- **O "pavio real" de `O-2` também é amostrado, e a cadência é `[NÃO SEI]`.** A api-spec diz só
  *"Highest open interest during the interval"*. A medição do repositório mostra que a Coinalyze
  **amostra**: `o(t) == c(t−300)` em **6 de 2.141** pares `[DOC: open_interest_catalog.py:16-17,
  SPEC-001 §2.1]` — o `open` dela é uma leitura *depois* da fronteira, não na fronteira. Logo
  *"pavio real intra-5 min"* (`PRD-009 §13-A`, linha `O-2`) é `[NÃO VERIFICADO]`: é extremo de amostra de
  cadência desconhecida, não de tick.
- **Existe uma via de pavio pela origem que o menu não lista:** polling de `/fapi/v1/openInterest`
  em cadência < 5 min. Custo: coletor novo, cota `[NÃO MEDIDO]`, disco (`RNF-4`), **zero** backfill.
  Passa em `D1`/`D2` sem emenda. Registro como opção para o `/architect` levar ao owner, sem recomendar.

**Como o owner confere sem confiar em mim:** ler `ADR-036-…md:26` e `:47-50` e perguntar se *"o OHLC
não existe"* é a mesma frase que *"a grandeza não existe"*. Se for, `O-2` passa; se não, não passa.

## Q3 — `RN-5` × `§13-A/O-1`: qual `open` é o certo

**O achado do `/architect` se confirma.** Para `(STOCK, POINT)` com `POINT_AT_BUCKET_END`,
`RN-5` (*"OI toma `open` do primeiro"*) em TF `5m` dá `|S| = 1` ⇒ `open = close` **sempre** ⇒ **todo
candle neutro**: o pane de F3 fica cego exatamente para *"se ta entrando OI"* `[PREMISSA-OWNER:
2026-09-23]`. Em TF maior o defeito continua, menor: o corpo mede `p(T1) − p(T0+5m)` e **perde os
primeiros 5 min** de todo bucket `[INFERRED: aritmética sobre a definição]`.

**A definição correta de *"entrou contrato no bucket"*** é `ΔOI(B) = OI(T1) − OI(T0)` — variação do
estoque entre as duas fronteiras. Fonte: a própria Coinalyze define o candle de OI assim, api-spec
`candlestick_oi`: `"o": "Open interest at the beginning of the interval"`, `"c": "Open interest at the
end of the interval"` `[DOC: https://api.coinalyze.net/v1/doc/api-spec.json, sha256 f33b5bd0…a443]`.
Para uma série de ponto na fronteira de fim, *"no começo do intervalo"* é `p(T0)`.

**Definição do candle derivado** (`O-1` corrigida):

| campo | definição | quando |
|---|---|---|
| `close` | `p(T1)` | se existe; senão a última de `S` (bucket fechado com buraco no fim — regime B de `ADR-040/D3`, frescor limitado por `maxStalenessMs = 2 × 5 min`, `open_interest_catalog.py:79`) |
| `open` | `A = p(T0)` | **se existe ponto em `T0`** — independentemente de buracos DENTRO de `B` |
| `open` | primeira de `S` | se `p(T0)` não existe **e** `|S| ≥ 2`; marcado (ver `open_at_ms` em Q4) |
| — (nenhum candle) | | se `S` vazio (`RN-2`), **ou** se `p(T0)` não existe e `|S| = 1` (ver abaixo) |
| `high` / `low` | `max` / `min` de `{open} ∪ S` | sempre; é **cota inferior** da amplitude verdadeira (`RN-6`) |

**Duas correções à redação de `O-1` (`§13-A`):**
1. A condição *"ponto imediatamente anterior **se contíguo** (`gap == 300000`)"* é **estreita demais**.
   O que licencia a âncora é **existir `p(T0)`**, não o primeiro ponto de `S` estar em `T0 + 5 min`.
   Para um `STOCK`, o corpo `p(T1) − p(T0)` é **exato** sempre que as duas fronteiras existem — buraco
   no meio do bucket só degrada o **pavio**, nunca o corpo. Com a redação de `O-1`, um buraco em
   `T0 + 5 min` joga fora uma âncora válida e reproduz o defeito de `RN-5`. `[INFERRED: propriedade de
   estoque — ΔOI entre dois instantes não depende do caminho]`.
2. **Bucket logo depois de um buraco, em TF `5m`:** `p(T0)` ausente, `|S| = 1` ⇒ `open = close` por
   construção — um doji que **não** quer dizer *"OI não mudou"*, e sim *"a variação não foi observada"*.
   Desenhá-lo é **zero fabricado a partir de ausência**, a classe que `RN-4` proíbe. ⇒ **nenhum candle**
   (é o buraco de `RN-2` se estendendo ao delta). Em TF maior, sem âncora, o candle existe mas cobre só
   `(t_primeira, T1]`, e isso tem de viajar no dado. `[INFERRED + opinião sobre a regra; o COMO desenhar
   é do design_gate]`.

**`CA-8` continua certo** e é compatível: ele reprova costurar `open = último close antes do buraco`; a
âncora aqui é `p(T0)` **exatamente**, nunca o último ponto antes de um buraco.

**Como o owner confere (fixture):** num trecho de 1 h de BTCUSDT sem buraco, `open` de cada candle de
`5m` == `close` do candle anterior, e `close − open` ≠ 0 em quase todos; num trecho que contém um dos 5
buracos de `M3`, o primeiro bucket de `5m` depois do buraco **não aparece**. Os dois viram teste de
regressão com os pontos reais fixados uma vez `[NÃO MEDIDO: não rodei contra md.series — read-only]`.

⚠️ **Consequência para `O-1` × `O-2`:** as duas séries concordam no `close` (1,86 bp mediana,
`open_interest_catalog.py:15-16` `[DOC]`), mas **não no `open`** (6/2.141). Os corpos vão diferir por
construção; se um dia as duas estiverem na tela, não é bug.

## Q4 — onde a derivação mora, e a forma de `OiCandle`

**Veredito: é uma PROJEÇÃO nova sobre a série existente — nem 9º par de `REDUCTION_TABLE`, nem 4
leituras de `reduce_bucket`.** Mora na rota (`ADR-040/D1`: *"uma implementação, num lugar só"*,
`RF-7`), como função pura de domínio em `sentimento`.

Por que **não** 4 chamadas de `reduce_bucket` sobre a série `POINT`:
- `reduce_bucket(STOCK, OPEN, S)` = primeira de `S` (`series_reduction.py:132-138`) — **é exatamente o
  defeito de `RN-5`** (Q3).
- `reduce_bucket(STOCK, HIGH, S)` sobre leituras `POINT` viola o contrato escrito do próprio módulo:
  *"`(STOCK, HIGH) = max` … correct only when `values` holds THAT reduction's own column"*
  (`series_reduction.py:46-52`). E pedir `reduction=OPEN` a uma série cuja identidade é
  `reduction=POINT` é mentir o termo de identidade — a classe que `ADR-040/D2` existe para nomear.

Por que **não** um 9º par na tabela:
- A assinatura da tabela é *fatos do próprio bucket → 1 float* (`series_reduction.py:175-185`). O
  `open` correto precisa de **um fato de fora do bucket** (`p(T0)`) e a saída carrega **instantes e
  cobertura**, não um float. Forçar isso na tabela quebra o contrato dela para todos os 8 pares.

**A forma que eu recomendo** `[INFERRED — sem código; nome de campo é do /architect]`:
- chave da projeção: o **trio** `(nature=STOCK, reduction=POINT, ts_convention=POINT_AT_BUCKET_END)`;
  **qualquer outro trio falha alto** (mesmo princípio de `UncoveredReductionPairError`). Aqui
  `ts_convention` **entra** na chave, ao contrário de `series_reduction.py:32-36`, porque a semântica
  da âncora depende dela: `p(T0)` só é *"OI no começo do bucket"* se o ponto é carimbado no fim.
- `OiCandle { bucket_end_ms, open, high, low, close, open_at_ms, close_at_ms, samples: {present,
  expected}, closed, derived_from }`, com:
  - `open_at_ms == T0` ⇔ âncora de fronteira; `open_at_ms > T0` ⇔ âncora na primeira amostra (Q3);
  - `close_at_ms < T1` ⇔ buraco no fim; `samples` é o par de inteiros de `ADR-040/D3` (**nunca
    percentual, nunca bool**), `expected = TF / 5 min`;
  - `closed=false` para o bucket em progresso (`close` = última amostra, não final);
  - invariante: `low ≤ min(open, close) ≤ max(open, close) ≤ high`; nenhuma linha com
    `open_at_ms == close_at_ms` (Q3).
  - unidade e nome vêm do `SeriesKey` servido (`RF-5`), não de campo novo. `derived_from` como está.
- ⚠️ **Fronteira para `backtest`/`convergencia`:** `bucket_end_ms` **não** é o instante de
  disponibilidade — o ponto `T` é publicado ~1 min depois (`collector_series_mapping.py:735`). Quem
  decidir sobre `OiCandle` tem de usar a disponibilidade modelada (`modeled_availability.py`), não
  `bucket_end_ms`; senão é lookahead de ~1 min em cada decisão. O pane não decide nada; o registro é
  para quando um consumidor que decide aparecer.
- **Se isto precisa de ADR** — provavelmente sim, porque estende o domínio que `ADR-040/D2` declarou
  fechado em `(nature, reduction)` `[INFERRED]`. Decisão do `/architect`.

**Como o owner confere:** (a) propriedade — para todo bucket fechado com `p(T1)` presente,
`OiCandle.close` == o valor que `/series-history` já serve hoje para a mesma série no mesmo TF
(`(STOCK, POINT) = last`); (b) propriedade — `open(Bₖ) == close(Bₖ₋₁)` sempre que `open_at_ms == T0`.
As duas são testáveis sem confiar em quem escreveu a função.

## Q5 — `Q-OI-3`: TF `5m` com `O-1` (sem pavio) — avisar?

**Lado da fidelidade: sim, o fato tem de ser declarado** `[INFERRED]`.
- Em `5m`, com âncora, o **corpo é exato** (`p(T1) − p(T0)`, dois pontos da origem). O que falta é o
  pavio — e *"sem pavio"* aqui quer dizer **caminho não observado**, não **OI parado**. Um candle sem
  pavio lido como *"não oscilou"* é a mesma troca ausência×zero de `RN-4`.
- Em todo TF o pavio de `O-1` é **cota inferior** da amplitude (amostras de 5 min); `5m` é só o caso
  degenerado em que a cota colapsa no corpo. Então a declaração não é exceção de `5m` — é a `RN-6`
  que já existe, e em `5m` ela diz *"sem informação de pavio"*.
- **O fato viaja no contrato**, não numa string de UI: `samples.expected == 1` já diz *"pavio
  inexistente nesta resolução"* (Q4). **Se** é aviso, rótulo, tooltip ou nada visível além da legenda
  de `RN-6` → `design_gate` (`ui-designer` + `ux-ui-mastery`), não eu.

## O que esta 2ª passagem NÃO julga

- `Q-OI-1` (O-1/O-2/O-3) e `Q-OI-2` (universo) → **owner**. A via *polling da origem* em Q2 é trade-off
  registrado, não recomendação.
- Peso/limite de `/fapi/v1/openInterest` → `[NÃO LIDO]`; é item da fase que o usar, como `ADR-036/D2`
  já diz dos limites de `/futures/data/`.
- A cadência de amostragem da Coinalyze para OI → `[NÃO SEI]`, nenhuma fonte a declara.
- Nome de campo, rota e parâmetro de `OiCandle` → `/architect` (+ `frontend-architect` no consumo).

**Fontes da 2ª passagem, para reabrir:** TradingView `…/43000762400-liquidations/` (+ imagem
`43622770276`); Coinalyze `https://api.coinalyze.net/v1/doc/api-spec.json`; Binance
`…/rest-api/Open-Interest` e `…/Open-Interest-Statistics`; repositório: `ADR-036-…md:26,45-50`,
`ADR-040-…md:86-121`, `series_reduction.py:28-52,132-195`, `open_interest_catalog.py:12-17,48-79`,
`collector_series_mapping.py:729-746`, `liquidation_collection.py:57-65`, `PRD-009` §8/§9/§13-A/§14.
