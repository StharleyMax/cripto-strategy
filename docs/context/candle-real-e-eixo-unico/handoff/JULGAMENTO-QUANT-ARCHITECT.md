# `candle-real-e-eixo-unico` — julgamento de `quant-architect` sobre a reagregação por TF

> Gatilho: `ADR-034/D6` (`docs/adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md:109-137`)
> nomeou este trabalho como futuro, dono `quant-architect`, gatilho *"o dia em que um seletor de
> timeframe entrar no escopo de alguma feature"*. `[Q2]` do owner (`5m·15m·1h·4h`) é esse dia.
> Entradas: `DECISOES-DO-OWNER-2026-09-19.md`, `PRD-008` §8/`RN-3`, §10/`CA-8`, §14-B.
> O `/architect` já decidiu **B1 — reagregação na rota**; este documento não reabre B1, ele diz
> **qual função**, **sob qual política de cobertura** e **qual falsificador**.
>
> ⛔ **Nada aqui é código de produção e nada toca o ledger.** `harness doctor` verde não diz nada
> sobre o que está escrito abaixo — as 5 regras do pack `core` são higiene de Python.

---

## 0. Universo medido — o comando, a data, o `n`

```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog \
  | python3 -c "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) for x in json.load(sys.stdin)['entries']}))"
```
`[MEDIDO 2026-09-19, n=60 entradas de catálogo, 4 símbolos, 8 pares distintos]`

Todas as medições abaixo usam o backend vivo em `127.0.0.1:8000` e, onde há verdade externa, a
Binance Futures pública (`fapi.binance.com`). Janela padrão: **96 h terminando 2026-09-19 16:11 UTC**.

---

## 1. A função de cada um dos 8 pares — `reduce(nature, reduction)`

⚠️ **`STOCK` não é um só.** Colapsar `OPEN`/`HIGH`/`LOW`/`CLOSE` em *"último"* é o defeito que esta
seção existe para bloquear: as quatro reduções são **quatro séries diferentes** por `SPEC-001` §2.1
(`Reduction`, `series_key.py:118-130`), e `ADR-034/D6` só mediu o caso `FLOW`.

| # | `(nature, reduction)` | função sobre os fatos nativos do bucket | métricas vivas | por que, e o que morde se trocar |
|---|---|---|---|---|
| 1 | `(FLOW, SUM)` | **`Σ`** dos fatos presentes | `klines_volume`, `cvd_source`, `sum_liquidation` (9 entradas, nativo `1min`, `ts_convention=AGGREGATE_OVER_BUCKET`) | é a definição de fluxo. Trocar por *último* devolve o volume de **um** minuto rotulado como 4 h — o defeito literal de `ADR-034/D6` |
| 2 | `(STOCK, OPEN)` | **`first`** — o fato de menor `event_time` do bucket | `sum_open_interest` (4 símbolos, `OHLC_OVER_BUCKET`) | `open` do bucket grosso é o `open` do **primeiro** bucket nativo, nunca o `open` mínimo nem médio |
| 3 | `(STOCK, HIGH)` | **`max`** — e **da própria série `HIGH`** | `sum_open_interest` (4) | `max` tomado sobre a série `CLOSE` **subestima a máxima**. Medido, fixture §4: `max(high) − max(close) = 94,20 USDT` (**11,7 bp**) num bucket real |
| 4 | `(STOCK, LOW)` | **`min`** — e da própria série `LOW` | `sum_open_interest` (4) | idem, espelhado: `min(low) − min(close) = −21,30 USDT` no mesmo bucket |
| 5 | `(STOCK, CLOSE)` | **`last`** — maior `event_time` do bucket | `price_mark_close` (`POINT_AT_BUCKET_END`) **e** `sum_open_interest` (`OHLC_OVER_BUCKET`) | ⚠️ este par carrega **duas `ts_convention`** e mesmo assim **uma só função**: ambas querem a última leitura do bucket |
| 6 | `(STOCK, LAST)` | **`last`** | `klines_last` | idem 5 |
| 7 | `(STOCK, POINT)` | **`last`** | `sum_open_interest` (`POINT_AT_BUCKET_END`, 4) | é o nível ao fim do bucket. **`Σ` aqui devolve 48× o OI real num bucket de 4 h** — `RN-3` |
| 8 | `(RATIO, POINT)` | **`last`** — e **só sob a ressalva da §3** | `count_long_short_ratio` (1 entrada) | `Σ` de razão é o erro **medido em 3,3×** (`as_of_accessor.py:104-106`, citando `SPEC-001` §5.11: p50 `3,1809` contra `~0,9707` verdadeiro) |

**A função é total sobre o universo de hoje, e isso é medição, não sorte** `[MEDIDO 2026-09-19]`: os
8 pares cobrem as 60 entradas, e a única colisão de `ts_convention` num mesmo par (linha 5) pede a
mesma função dos dois lados. ⇒ `(nature, reduction)` **basta hoje**; `ts_convention` **não** entra na
assinatura. `[INFERRED: a colisão da linha 5 concorda, então acrescentar o termo não muda resposta
nenhuma e só amplia a superfície de teste]`

⛔ **Corolário que o `/architect` tem de escrever no contrato:** um **9º par** que apareça no catálogo
tem de **quebrar o build**, nunca cair num `default`. `(FLOW, POINT)`, `(RATIO, SUM)` e `(EVENT, *)`
não existem hoje e **não têm resposta certa** — `match` exaustivo sem ramo `_`, ou dicionário com
`KeyError` deliberado.

### 1.1 Alinhamento do bucket — **o erro de fronteira, medido**

`event_time` de `md.series` **é `bucket_end`** — confirmado contra a Binance `[MEDIDO 2026-09-19]`:
o nosso valor em `event_time=12:01` bate com a kline de `open_time=12:00`.

⇒ o fato de `event_time = t` pertence ao bucket grosso que **TERMINA** em `ceil(t / B) * B`, **não**
a `floor(t / B)`. O `floor` ingênuo desloca **toda a série em uma barra nativa** e faz o `close` de
`4h` ser o fechamento de `15:59`, não o de `16:00`.

```
bucket real 2026-09-18 12:00→16:00, BTCUSDT, klines_volume
  ceil-align  (correto) : 91.354,502   (240 fatos)
  floor-align (errado)  : 91.247,964   (240 fatos)   Δ = 0,114 pp
```
`[MEDIDO 2026-09-19]` — Δ pequeno **e por isso perigoso**: não estoura nenhum teste de ordem de
grandeza, e desloca o eixo do gráfico em uma barra.

### 1.2 ⛔ O que a função de reagregação **não** conserta — achado fora do escopo, escalado

`klines_volume` armazenado, lido com `bar_policy=final_only`, é **sistematicamente subestimado**
contra a kline `1m` da própria Binance:

```bash
# por bucket de 4 h fechado, 240 minutos, BTCUSDT: compara md.series contra fapi.binance.com/fapi/v1/klines
```
| bucket (UTC) | n | minutos exatos | \|d\|>5% | **acima da verdade** | pior minuto | erro da soma |
|---|---|---|---|---|---|---|
| 2026-09-17 04:00 | 240 | 98 | 28 | **0** | −47,6% | **−2,450%** |
| 2026-09-18 04:00 | 240 | 71 | 30 | **0** | −69,6% | **−4,474%** |
| 2026-09-18 12:00 | 240 | 64 | 38 | **0** | −69,3% | **−2,212%** |
| 2026-09-19 04:00 | 240 | 77 | 34 | **0** | −47,6% | **−2,227%** |

`[MEDIDO 2026-09-19, n=4 buckets fechados × 240 minutos = 960 comparações]`

**`pos=0` nos quatro**: o erro é **estritamente unilateral**, nunca acima da verdade. Ruído de
arredondamento seria bilateral; unilateral com cauda de −69% é **assinatura de snapshot intrabarra
gravado como final**.

⚠️ **Consequência para a política da §2, e é a razão de ela não poder ser vendida como prova:**
**cobertura 100% NÃO implica soma certa.** Os quatro buckets acima têm 240/240 fatos presentes e
ainda assim erram −2,2% a −4,5%. Um selo de cobertura que o leitor interprete como *"este número
está certo"* é pior que selo nenhum.

**Isto é bug de ingestão, não de reagregação, e não é desta feature.** Escalado ao `/architect` /
dono de `ADR-034` como achado com número. **Enquanto não for resolvido, nenhum backtest deve usar
`klines_volume` como verdade de volume** — e essa frase é o tipo de conclusão que este papel existe
para escrever antes de o owner financiar a tese.

---

## 2. ⛔ A política de cobertura parcial — o que `ADR-034/D6` nomeou e nenhum documento especificou

### 2.1 O fato: a cobertura real, hoje

Por bucket **fechado**, contando **fatos NATIVOS distintos** (não linhas da grade servida):

| série | par | TF=5m | TF=15m | TF=1h | **TF=4h** | pior bucket |
|---|---|---|---|---|---|---|
| `klines_volume` | `(FLOW,SUM)` | 93,0% | 90,7% | 84,7% | **78,3%** | **33,8%** |
| `sum_open_interest` | `(STOCK,POINT)` | 100,0% | 100,0% | 98,9% | **95,7%** | 97,9% |
| `count_long_short_ratio` | `(RATIO,POINT)` | 94,3% | 93,5% | 91,6% | **82,6%** | 33,3% |
| `sum_liquidation` | `(FLOW,SUM)` | **0,0%** | **0,0%** | **0,0%** | **0,0%** | 0,0% |

(a célula é *"% dos buckets fechados que estão 100% completos"*; `n` = 4.604 / 1.532 / 380 / 92
buckets fechados por série, 4 símbolos, 96 h) `[MEDIDO 2026-09-19]`

**Três fatos que decidem a política, e nenhum deles é opinião:**

1. **A completude PIORA monotonicamente com o TF.** `klines_volume`: 93,0% em `5m` → **78,3% em
   `4h`**. É aritmética de buraco: um bucket grosso contém mais minutos, logo mais chance de conter
   um furo. ⇒ **"recusar se não for 100%" apaga 21,7% das barras exatamente no TF que o owner pediu.**
2. **Percentual não é unidade transportável entre TFs.** *Um* minuto faltando = 80% de cobertura em
   `5m` e 99,6% em `4h`. Um limiar em % é quatro limiares diferentes disfarçados de um.
3. ⛔ **`sum_liquidation` reprova QUALQUER limiar, em TODO TF.** `[MEDIDO 2026-09-19: BTCUSDT, 96 h,
   n=5.761 linhas de grade — 301 com valor, 5.460 `SEM_PONTO`]`. A ausência é o estado **normal** de
   uma série dirigida a evento: minuto sem liquidação não publica ponto. **`SEM_PONTO` aqui significa
   zero; em `klines_volume` significa "não lemos"** — e **o `SeriesKey` não carrega esse termo**.
   `domain/liquidation_zero_legitimacy.py` (`ZL-1..ZL-3`) já resolveu a distinção *na ingestão*, e ela
   **não chega ao leitor**: a linha servida diz `SEM_PONTO` nos dois casos.

### 2.2 A decisão

> **P-B — SERVIR SEMPRE, COM MARCA DE COBERTURA EXPLÍCITA. NUNCA RECUSAR POR COBERTURA, NUNCA
> EXTRAPOLAR, E O LIMIAR NÃO EXISTE NA ROTA.**

Recusar está descartado por (1): mata 21,7% das barras de `4h` e 100% do painel de liquidação.
Limiar está descartado por (2) e (3): não há número que sirva aos quatro TFs e às quatro naturezas,
e todo limiar único que eu conseguiria propor seria calibrado na amostra de hoje — **curve fitting
com cerimônia**, que é a armadilha que este papel bloqueia.

**A forma da marca — um PAR DE INTEIROS, nunca um booleano e nunca um percentual:**

```
"coverage": { "present": 81, "expected": 240 }
```

Mesmo argumento de `ADR-034/D5`, que recusou `absence` booleano e fixou os 4 valores de `Absence`:
um bit colapsa distinções que custam dinheiro. Percentual calculado no servidor perde o denominador,
e **o denominador é a informação** — `81/240` e `1/3` não são a mesma afirmação sobre o mundo.

**O default por regime — e o corte NÃO é por `nature`, é por REGIME DE ERRO** `[INFERRED: aplicação
da direção do viés de cada redutor; a tabela da §1 é a evidência]`:

| regime | pares | erro sob cobertura parcial | default da rota |
|---|---|---|---|
| **A — somatório / extremo** (viés unilateral, sem cota) | 1 `(FLOW,SUM)`, 3 `(STOCK,HIGH)`, 4 `(STOCK,LOW)` | `Σ` **subestima**; `max` subestima; `min` superestima. Sem teto: o erro cresce com o buraco | serve o número parcial + `coverage`, e o **renderizador tem de marcar visualmente**. ⛔ **nunca reescalar** (`mean×240` não está em `value_raw` — viola `RN-7`) |
| **B — seleção de um fato** (erro limitado por frescor) | 2 `(STOCK,OPEN)`, 5 `(STOCK,CLOSE)`, 6 `(STOCK,LAST)`, 7 `(STOCK,POINT)`, 8 `(RATIO,POINT)` | o redutor escolhe **um** fato; a cobertura importa só pela **distância do fato à borda que ele diz representar** | **mecanismo que já existe**: o fato eleito tem de estar dentro de `maxStalenessMs` da borda; fora disso, `Absence`. `ADR-006` / `asof_max_staleness_ms`, sem peça nova |

Números do regime B, do próprio catálogo `[MEDIDO 2026-09-19]`: `maxStalenessMs` = **600.000** para
as séries `5min` (preço, OI, L/S) e **120.000** para as `1min` (CVD, volume, liquidação).

**A magnitude que a marca torna visível — um caso real, não hipotético** `[MEDIDO 2026-09-19,
BTCUSDT, `klines_volume`, bucket fechado 2026-09-16 00:00→04:00 UTC]`:

```
presentes 81/240 · Σ(presentes) = 4.246,891 BTC
se os 159 minutos ausentes tivessem a média dos presentes: 12.583,381 BTC
⇒ o número servido SUBESTIMA em ~66,2% — e hoje a tela não diz nada
```
⛔ O `12.583,381` **é ilustração da magnitude, não candidato a ser servido**. Servi-lo seria fabricar.

### 2.3 O que esta política deixa EM ABERTO, com dono — porque esconder seria pior

⛔ **`SEM_PONTO` é ambíguo entre *"a fonte publicou nada porque nada aconteceu"* (liquidação: zero
legítimo) e *"não lemos"* (volume: buraco).** Hoje o `SeriesKey` **não tem termo** que os separe, e o
leitor **não consegue** decidir. Consequência direta e mensurável: para `sum_liquidation`, o
`coverage` da §2.2 vale **`301/5761`** e é **semanticamente inútil** — o denominador certo seria
*"minutos em que o socket esteve conectado"*, que não é observável na linha servida.

- **Trilha mínima:** um termo no catálogo — `absence_means_zero: bool` — ou uma lista de métricas
  dirigidas a evento, declarada e auditável. **Dono: `/architect`, sob `ADR-034`.**
- **Enquanto não existir:** `sum_liquidation` **serve `Σ` sem `coverage`**, com a marca dizendo
  *"série dirigida a evento — ausência é zero"*. `[NÃO VERIFICÁVEL hoje por medição:]` a afirmação
  *"o socket esteve conectado"* não tem instrumento neste repositório. **Rotulado, não escondido.**

### 2.4 Anti-lookahead — a fronteira que a reagregação NÃO pode atravessar

`[INFERRED: aplicação de `ADR-034/D6` + `bar_policy` à grade grossa]`, e é a parte do desenho cujo
erro custa capital:

1. uma barra grossa carimbada em `T` só pode conter fatos com `event_time ≤ T` **e**
   `available_at ≤ knowledge_time` — a segunda condição é a que o alinhamento por `ceil` da §1.1
   **não** garante sozinha;
2. sob `bar_policy=final_only`, uma barra grossa **só existe depois de `T`**. Servir a barra de `4h`
   às 14:00 com 120 dos 240 minutos é **lookahead ao contrário**: ela será reescrita às 16:00, e um
   backtest que a leia às 14:00 lê um número que ninguém teve;
3. ⇒ o **bucket em aberto** é caso **distinto** de bucket fechado com furo. A rota tem de distinguir
   `open` de `partial`; a §2.2 governa só o segundo. Colapsar os dois é o mesmo `rc=0` ambíguo de
   `ADR-012`: um sinal indistinguível entre *"ainda não fechou"* e *"fechou faltando"*.

---

## 3. `(RATIO, POINT)` — o que resta, e o custo

**O fato medido:** `count_long_short_ratio` **não tem séries-componente no catálogo**
`[MEDIDO 2026-09-19, n=60 entradas; 7 métricas distintas — `cvd_source`, `klines_last`,
`klines_volume`, `count_long_short_ratio`, `price_mark_close`, `sum_liquidation`,
`sum_open_interest` — nenhuma é contagem long/short separada]`.
⇒ *"recomputa dos componentes"* (`RN-3`, tabela de `[Q2]`) é **impossível hoje**.

**E não adianta ingeri-los — medi o fio** `[MEDIDO 2026-09-19]`:

```bash
curl -s "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=2"
# {"longAccount":"0.4870","longShortRatio":"0.9493","shortAccount":"0.5130","timestamp":1789833900000}
```

`longAccount` e `shortAccount` são **frações que somam 1**, não contagens de contas. Somar frações
por 12 buckets não dá a razão da hora — dá `média(long)/média(short)`, que é **outro estimador**.

⇒ a conclusão é mais forte que *"faltam dados"*: **para uma razão-de-estoque não existe "agregado
sobre o bucket"; existe só "qual instante do bucket você reporta".** A quantidade *"razão long/short
das 4 h"* **não é uma grandeza** — contas não são aditivas no tempo.

| opção | o que custa | veredito |
|---|---|---|
| **R1 — recomputar dos componentes** | ingerir `longAccount`/`shortAccount` = **2 séries novas × 4 símbolos = 8 entradas**, **zero requisição nova** (mesma resposta já paga). Mas entrega `média/média`, **não** a razão da janela | **recusada** — paga disco e catálogo para responder outra pergunta |
| **R2 — `last` do bucket** | descarta 11 de 12 fatos nativos em `1h`. O rótulo **não pode** dizer *"razão de 4 h"*; tem de dizer **"razão no fechamento do bucket"** | ✅ **recomendada** |
| **R3 — recusar `RATIO` fora do nativo (`5m`)** | o painel L/S **apaga** em `15m`/`1h`/`4h` — 3 dos 4 TFs que `[Q2]` pediu | recusada: custo alto, e R2 é sólida para este `RATIO` |
| **R4 — OHLC da razão** (4 reduções novas) | **16 entradas novas**, zero cota nova; responde *"a razão oscilou quanto dentro da hora?"* | ⏸ fora do escopo desta feature; **nomeada**, não construída |

⛔ **A ressalva que impede R2 de virar regra geral, e ela já está escrita em produção:**
`as_of_accessor.py:99-110` registra que `SPEC-001` §5.11 parte razões em **duas** — *"RATIO de
estoque"* (onde `last` é legítimo) e *"RATIO de fluxo"* (onde não é, com o erro **medido em 3,3×**)
— e que **`SeriesKey.nature` tem UM só membro `RATIO`**, então a chave **não consegue dizer qual**.
`count_long_short_ratio` é de estoque; `sum_taker_long_short_vol_ratio` (previsto, ainda não no
catálogo) é de fluxo, e `last` nele responde a janela errada.

⇒ **`(RATIO, POINT)` = `last`, habilitado por ALLOWLIST NOMEADA de métrica, não por natureza.**
Hoje a allowlist tem **1 elemento**: `count_long_short_ratio`. Qualquer outra `RATIO` **recusa** até
alguém escrever por quê. Recusar é a direção segura: subservir devolve ausência visível, superservir
devolve número plausível e errado, e só um dos dois custa capital.
**Dono da pergunta *"`nature` precisa de um 6º membro?"*: `/architect`** — já nomeado em
`as_of_accessor.py:109-110`, continua em aberto, **não é desta feature**.

---

## 4. O falsificador — `CA-8`, e por que o texto de hoje **não basta**

`PRD-008` §10, `CA-8` hoje: *"OI reagregado a `1h` == último do bucket, e ≠ soma dos 12 de `5min`"*.

⛔ **Ele morde UMA troca de 20.** Com 5 funções distintas (`Σ`, `first`, `max`, `min`, `last`) sobre
8 pares, há **20 trocas possíveis** entre funções diferentes. `CA-8` cobre `last↔Σ` e **passa verde**
se alguém trocar `OPEN` por `CLOSE`, `HIGH` por `CLOSE`, ou `HIGH` por `LOW`.

⛔ **E a armadilha é real, não hipotética:** `PRD-008`/`RN-2` mede que a vela viva **é degenerada**
(`o=h=l=c`, `view-model.ts:30-38`). Sobre uma fixture degenerada as **5 funções coincidem** e o teste
passa sob **qualquer** permutação. Um falsificador assim não mede nada — é o `rc=0` de `ADR-012`
outra vez.

### 4.1 `CA-8′` — a substituição proposta, em três camadas

**Camada 1 — guarda de não-degenerescência (roda PRIMEIRO, ou as outras não valem nada).**
Sobre a fixture: `first`, `max`, `min`, `last` têm de dar **4 valores dois a dois distintos**. Se a
fixture degenerar, o teste **falha aqui** e diz por quê.

**Camada 2 — fixture de mercado REAL, marcada à mão uma vez, virando regressão.**
`BTCUSDT`, `1m` → `4h`, bucket **fechado** `2026-09-18 12:00→16:00 UTC`, **240 de 240** minutos
presentes, colhida de `fapi.binance.com/fapi/v1/klines` `[MEDIDO 2026-09-19]`:

| função | valor esperado | e o que ela mata |
|---|---|---|
| `Σ(volume)` | **93.465,237** | `last` daria `98,074` (1 minuto) |
| `first(open)` | **78.031,00** | |
| `max(high)` | **81.156,80** | `max(close)` daria `81.062,60` — **−94,20 (−11,7 bp)** |
| `min(low)` | **77.923,50** | `min(close)` daria `77.944,80` — **+21,30 (+2,7 bp)** |
| `last(close)` | **80.688,70** | `first(close)` daria `77.984,40` — **−2.704,30 (−3,35%)** |

O owner confere isto **no gráfico** (`BTCUSDT`, `4h`, vela de 18/09 12:00 UTC), não no código — que é
a forma de verificação nº 1 desta casa. A vela `4h` publicada pela Binance para esse bucket é
`o=78031,00 h=81156,80 l=77923,50 c=80688,70`, **idêntica** às linhas 2–5 acima: a fixture é
**auto-verificável contra a fonte**, não contra a nossa implementação.

**Camada 3 — a matriz completa: `5×5`, exaustiva, e é ela que fecha o buraco de `CA-8`.**
Para cada `(nature, reduction)` dos 8 pares, aplicar **as 5 funções** à fixture e exigir que **só a
declarada na §1** case com o esperado, e que **as outras 4 difiram**. `20` trocas, `20` asserções.
Uma tabela paramétrica (`parametrize`) sobre os 8 pares × 5 funções; **sem ramo `default`**.

**Camada 4 — cobertura parcial, ablação.** Remover 159 dos 240 minutos da mesma fixture (reproduzindo
o bucket real de 2026-09-16 00:00, 81/240) e exigir:
`coverage == {present: 81, expected: 240}`; o `Σ` servido **≠** o `Σ` completo; e **nenhum número
igual a `mean×240`** aparece na resposta — ou seja, a extrapolação proibida seria pega se alguém a
implementasse.

### 4.2 O que este falsificador **não** prova — e está rotulado

⛔ Ele prova que **a função certa foi aplicada à série certa**. Ele **não** prova que o dado de
entrada está certo: a §1.2 mede que `klines_volume` armazenado erra **−2,2% a −4,5%** contra a
Binance com 240/240 de cobertura. Uma fixture montada a partir de `md.series` **herdaria o erro e
passaria verde**. ⇒ **a fixture tem de ser colhida da Binance, não do nosso banco** — e essa frase é
uma condição de validade do teste, não uma preferência.

---

## 5. Placar de rótulos — o que é medido, o que é inferido, o que não é verificável

| afirmação | rótulo |
|---|---|
| 8 pares, 60 entradas, 4 símbolos | `[MEDIDO 2026-09-19: curl series-catalog]` |
| cobertura por TF (93,0% → 78,3%); `n` de buckets fechados | `[MEDIDO 2026-09-19: series-history 1m, 96 h, 4 símbolos]` |
| `event_time == bucket_end`; `ceil` vs `floor` = 0,114 pp | `[MEDIDO 2026-09-19 contra fapi klines 1m]` |
| `klines_volume` subestima −2,2% a −4,5%, `pos=0` em 4 buckets | `[MEDIDO 2026-09-19, n=960 comparações]` |
| fixture `2026-09-18 12:00→16:00` e os 5 valores esperados | `[MEDIDO 2026-09-19 contra fapi klines 1m e 4h]` |
| `longAccount`/`shortAccount` são frações, não contagens | `[DOC: fapi.binance.com/futures/data/globalLongShortAccountRatio, resposta colada na §3]` |
| razão de fluxo somada infla 3,3× | `[DOC: as_of_accessor.py:104-106 citando SPEC-001 §5.11]` |
| o corte de regime A/B por direção do viés | `[INFERRED: direção do erro de cada redutor sob subconjunto]` |
| `(nature, reduction)` basta e `ts_convention` não entra | `[INFERRED: a única colisão pede a mesma função]` |
| *"o socket de liquidação esteve conectado"* | ⛔ `[NÃO VERIFICÁVEL: não há instrumento neste repositório]` |

## 6. O que eu **não** julgo

Escolha de corretora como decisão financeira, tamanho de posição, gestão de risco do capital do
owner e jurisdição. `[Q1]` (universo do OI) permanece **do owner**; a §3 não a toca.
