# `C-3` — a interface do eixo de tempo mestre `charts`↔`web`

**Dono:** `frontend-architect` (`PRD-008 §9/C-3`, `TBD` com dono e data). **Data:** 2026-09-19.
**Entradas lidas:** `PRD-008 §9/§10/§14-B`, `DECISOES-DO-OWNER-2026-09-19.md`, `DISCOVERY.md §3.3`,
`ADR-003` (`FR-1`/`FR-2`/`FR-3`), `ADR-034/D6`/`D8`.

> Toda afirmação quantitativa abaixo carrega o comando que a produziu, o universo (`n`) e o rótulo
> de força. As sondas headless rodaram contra a **biblioteca real** (`lightweight-charts@5.2.1` +
> `jsdom`, via o `installGlobals`/`flushFrames` que este repositório já usa em
> `frontend/src/charts/headless-chart.ts`) — não contra um modelo dela. Os scripts estão em
> `/tmp/claude-1002/.../scratchpad/loop-probe.mjs`, `loop-probe2.mjs`, `probe3.mjs`, `probe4.mjs`;
> são **sondas de medição descartáveis**, não código de produção, e por isso vivem fora da árvore.

---

## 0. Três correções de medição, antes de qualquer decisão

Projetar em cima de número errado é o defeito que esta casa mais paga. Três números que eu herdei
estavam imprecisos, e os três **mudam a resposta**.

### 0.1 `grep -c "useLightweightChart(" → 6` conta a DEFINIÇÃO, não seis gráficos

```bash
grep -n "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx
# 416: function useLightweightChart(   ← a DEFINICAO
# 820  (PricePane) · 1024 (OiPane) · 1137 (CvdPane) · 1394 (LiquidationCohortSurface) · 1995 (LongShortPane)
```

`[MEDIDO 2026-09-19, n=6 linhas: 1 definição + 5 sítios de chamada]`

São **5 sítios de chamada**, não 6. Mas o número **6 está certo em tempo de execução, por outro
motivo**: `LiquidationCohortSurface` é montado **duas vezes** dentro de `LiquidationPane`
(`SymbolClient.tsx:1503,1510` — `cohort="long"` e `cohort="short"`).

```bash
sed -n '1494,1516p' frontend/src/app/symbol/SymbolClient.tsx   # dois <LiquidationCohortSurface/>
```

⇒ **6 instâncias de `createChart` em tela** (Preço, OI, CVD, LiqLong, LiqShort, Long/short), a
partir de **5** sítios de chamada. `PRD-008/M8` chega ao número certo pelo caminho errado, e o
caminho errado importa porque `CA-5` é escrito **como contagem de `grep`** — ver §5.

### 0.2 ⭐ Os seis gráficos NÃO compartilham grade hoje — o índice lógico já é ambíguo

Esta é a correção que muda o desenho, e nenhum documento da feature a tem.

```bash
grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <captura de /symbol> | sort -u
# price_slots:5760 · cvd_slots:5760 · long_short_slots:5760 · oi_slots:1152
```

`[MEDIDO 2026-09-19, captura de http://127.0.0.1:3000/symbol, n=4 painéis que publicam `slots`]`

A causa está no código, não na rota: `buildOiPanel` constrói a grade canônica em
**`FIVE_MINUTES_MS`** (`frontend/src/charts/s2-panels.ts:135`), enquanto `buildPricePanel` usa
`ONE_MINUTE_MS` (`:125`). O fio entrega `data-oi-wire-points="5760"`; o painel **reduz para 1.152
slots** antes de `setData` (`SymbolClient.tsx:1027`, `lineSeriesLossless(panels.oi.slots)`).

⇒ **O índice lógico `i` é o minuto `i` no painel de Preço e o minuto `5i` no painel de OI.**
"Arrastar uma parte e tudo não andar junto" não é só falta de assinatura: **é falta de grade
comum.** Ligar `subscribeVisibleLogicalRangeChange` hoje, sem unificar a grade, produz seis
painéis que andam juntos **mostrando instantes diferentes** — um defeito pior que o atual, porque
parece consertado.

### 0.3 ⭐ A "parede assimétrica" do owner não é a da FONTE — é a do nosso armazém, e ela é um QUEIJO SUÍÇO

`PRD-008 [Q3]`/`ADR-036:58` dizem *"`/futures/data/*` corta em ~30 dias, `klines` serve desde
2019-09-08"*. Isso é a parede da **API**. O que a tela vai encontrar é a parede do **nosso
Postgres**, e eu a medi série a série — sonda de 1 h (60 grades de 1 min) a `D` dias atrás:

```bash
# id obtido por computeSeriesKeyId sobre /api/v1/series-catalog (n=15 entradas BTCUSDT)
curl -s "http://127.0.0.1:8000/api/v1/series-history?series_key_id=$ID&symbol=BTCUSDT&interval=1m\
&window_start_ms=$S&window_end_ms=$((S+3600000))&knowledge_time_ms=$NOW&bar_policy=final_only" \
  | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'];print(len([x for x in r if x['value'] is not None]))"
```

| série (BTCUSDT) | 2 d | 4 d | 6 d | 8 d | 11 d | 14 d | 20 d | 30 d |
|---|---|---|---|---|---|---|---|---|
| `klines_last` | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `price_mark_close` | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `klines_volume` | 60 | 59 | **0** | **59** | 0 | 0 | 0 | 0 |
| `sum_open_interest` (`POINT`) | 60 | 60 | 60 | 60 | **0** | 0 | 0 | 0 |
| `cvd_source` | 60 | 59 | **0** | 0 | 0 | 0 | 0 | 0 |
| `count_long_short_ratio` | 43 | 45 | **0** | 0 | 0 | 0 | 0 | 0 |
| `sum_liquidation` (`long`) | 3 | 3 | **0** | 0 | 0 | 0 | 0 | 0 |

`[MEDIDO 2026-09-19, n=7 séries × 8 profundidades = 56 sondas de 60 grades]`

Três leituras, e as três são de desenho:

1. **`klines_last` e `price_mark_close` dão `0` em todas as 8 profundidades** — confirma `M2` por
   um caminho independente (não por `grep` de escritor, por leitura da rota). O preço não tem dado
   em profundidade **nenhuma**, não só na janela de hoje.
2. **A cobertura NÃO é monotônica.** `klines_volume` tem `60` a 2 d, `0` a **6 d** e `59` a **8 d**.
   ⛔ **Não existe "a parede".** Existe um conjunto de intervalos com buracos. Uma UI que desenhe uma
   única fronteira "dados até aqui" **mente** — e um paginador que pare no primeiro `0` nunca
   descobre os 59 pontos que existem 2 dias mais fundo.
3. **A profundidade real é ~1 ordem de grandeza menor que a da fonte:** OI morre entre **8 e 11
   dias**; CVD, long/short e liquidação entre **4 e 6 dias**. Contra a decisão do owner de
   **~500 velas por TF** (`[DECISÃO-OWNER: 2026-09-19]`):

| TF | 500 velas = | OI (piso ~9,5 d) | CVD/LS/Liq (piso ~5 d) |
|---|---|---|---|
| `5m` | 41,7 h = 1,7 d | 100% | 100% |
| `15m` | 125 h = 5,2 d | 100% | **~96%** |
| `1h` | 500 h = 20,8 d | **~46%** | **~24%** |
| `4h` | 2.000 h = **83,3 d** | **~11%** | **~6%** |

`[INFERRED: aritmética sobre os pisos medidos acima; não é uma nova sonda]`

⇒ **A parede morde já em `1h`, na PRIMEIRA renderização** — não só ao arrastar, e não só em `4h`.
Em `4h`, ~89% do painel de OI e ~94% do de CVD nascem do lado vazio. Isto não é caso de borda da
navegação infinita; é o **estado normal** de dois dos quatro TFs que o owner escolheu.

---

## 1. Decisão 1 — quem é dono do range visível, e quem assina

### `D-C3.1` · O dono do range é um `TimeAxisController` **puro, em `charts`**; quem assina é **um** hook em `web`

A fronteira não é gosto: `ADR-003/FR-2` diz que **`web` não calcula geometria** (*"nenhuma escala,
nenhuma decisão de onde desenhar"*) e `FR-1` diz que **`charts` não faz I/O** (*"zero `fetch`"*).
Range visível é geometria; buscar história é I/O. O corte cai exatamente entre os dois.

| camada | o que é dela | por quê |
|---|---|---|
| **`charts`** (puro, sem `IChartApi`, sem `fetch`, sem React) | o **estado de registro** do eixo; a álgebra de range; a conversão `instante ↔ índice de slot` sobre a grade canônica; o predicado de borda; o descritor `HistoryRequest` como **valor** | `FR-2` + `FR-3` (*"a grade canônica é UMA função, dona de `charts`"*) |
| **`web`** (`src/app/symbol/`, React) | criar/registrar os 6 `IChartApi`; `subscribe`; despachar o evento ao controller; aplicar o resultado de volta; **executar** o `fetch` que o descritor pede | `FR-1` proíbe `charts` de fazer isso |

**Forma mínima da interface (contrato, não implementação):**

```
// charts — puro
interface TimeAxis { readonly startMs: number; readonly stepMs: number; readonly slotCount: number }
interface TimeRange { readonly fromMs: number; readonly toMs: number }   // ⚠ INSTANTES, nao indices
toLogicalRange(range: TimeRange, axis: TimeAxis): { from: number; to: number }
fromLogicalRange(logical: { from: number; to: number }, axis: TimeAxis): TimeRange
reduceRangeEvent(state, event) -> { next: TimeRange; changed: boolean }   // dedupe + epsilon aqui
historyRequest(range: TimeRange, axis: TimeAxis, coverage) -> HistoryRequest | null
```

**Nenhuma dessas assinaturas menciona `IChartApi`.** É o que torna o controller testável em
`node --test` puro (a suíte que `make verify` já roda — ver §6), sem `jsdom`.

### O laço de realimentação: medido, e ele **não** estoura pelo motivo que se supõe

Sonda 1 e 2, contra a biblioteca real, `N=6` gráficos, 5.760 barras cada:

```
(1) self-echo de setVisibleLogicalRange: 1 notificacao
(A) set que MUDA o range: 1 notif · set IDENTICO logo depois: +0 notif
(2) malha ingenua N=6 (grades IGUAIS): 6 notificacoes, 30 escritas, profundidade max 1, breaker=false
(3) controller unico  N=6 (grades IGUAIS): 6 notificacoes,  5 escritas, convergiu=true
```

`[MEDIDO 2026-09-19: node loop-probe.mjs, lightweight-charts 5.2.1 + jsdom]`

Duas propriedades da biblioteca, medidas e não presumidas:

- a notificação **não é síncrona** dentro de `setVisibleLogicalRange` (profundidade máxima de
  recursão observada: **1**, não 6ⁿ). Ela é entregue no ciclo de desenho dirigido por `rAF` — a
  mesma propriedade que `headless-chart.ts:211-215` já documenta para `fitContent`;
- um `set` para um range **idêntico** não re-dispara (**+0** notificação).

⇒ **A malha ingênua de 6×5 não trava — ela converge, com 30 escritas em vez de 5.** Um teste que
só procure "travou?" dá **verde falso**. O `6×` de escritas é desperdício, não defeito.

### ⛔ O que MORDE de verdade: grades diferentes

Sonda 2, o par **morde/cala**, mesmo controller, mesma guarda, só mudando se os 6 painéis estão
sobre a **mesma** grade de 5.760 slots (whitespace incluso) ou podados ao próprio comprimento:

```
CALA  (6 paineis lossless, 5760 slots cada):       notif=6 writes=5  mesmo_instante_na_borda=true   desalinhamento=0 min
MORDE (6 paineis podados, 5760/1152/5412/300/300/1152): notif=9 writes=15 mesmo_instante_na_borda=false  desalinhamento=5460 min
```

`[MEDIDO 2026-09-19: node loop-probe2.mjs, n=6 gráficos, 2 configurações]`

**5.460 minutos = 91 horas de desalinhamento**, com os seis painéis "sincronizados". E as escritas
**triplicam** (5 → 15), porque cada painel **clampa** o range ao próprio comprimento e devolve um
range diferente, que re-dispara o ciclo: **é aí que o laço de realimentação nasce**, não no echo.

E `§0.2` mede que a configuração MORDE **é a configuração de hoje** (`oi_slots:1152` contra
`price_slots:5760`).

### ⇒ `D-C3.2` · A INVARIANTE, e ela é a proteção de verdade

> **Todo painel recebe `setData` sobre EXATAMENTE o mesmo array de slots da grade canônica —
> mesmo `startMs`, mesmo `stepMs`, mesmo `slotCount` — com `WhitespaceItem` onde não há dado.**
> A grade é a **união**, nunca a interseção, e nunca o nativo de cada série.

Com ela: índice lógico ≡ índice de slot ≡ mesmo instante em todos os painéis, **por construção**.
Sem ela, nenhuma guarda de reentrância salva — a sonda mede 91 h de erro **com** a guarda ligada.

A invariante é barata: `lineSeriesLossless`/`candlestickSeriesLossless`/`positiveValueSeriesLossless`
já entregam um item por slot (`s2-lightweight-adapter.ts:1-30`, e `s2-axis-integration.test.ts` já
prova que o whitespace sobrevive ao `setData`). O que muda é **um argumento**: `buildOiPanel` deixa
de construir a grade em `FIVE_MINUTES_MS` e passa a recebê-la, como todos os outros.

⚠️ **`OiPanel.timeframeMs` não some** — `resolveStockReading` o usa para decidir `held` vs `absent`
(`SymbolClient.tsx:1029`). Ele passa a significar **grade nativa da série** (5 min), distinta da
**grade do eixo** (o TF escolhido). Colapsar os dois num campo só é como o `GA-2` nasceu.

### A guarda de reentrância — necessária, mas **não é ela** que resolve

Com `D-C3.2` valendo, a guarda (`applying` + igualdade por epsilon, medida em `loop-probe.mjs (3)`:
6 notificações → **5** escritas, convergiu) deixa de ser o mecanismo e passa a ser o cinto de
segurança para as duas janelas em que os comprimentos **mudam legitimamente**:

1. **prepend de história** (`setData` com mais slots ⇒ clamp temporário durante o remonte);
2. **troca de TF** (`slotCount` muda de 5.760 para 500).

Nas duas, a ordem é: **suspender** (desligar o despacho) → `setData` em **todos** os 6 → recalcular
o range lógico a partir do range de **tempo** → aplicar → **religar**. Um único ponto de suspensão,
em `web`, porque é quem sabe quando o dado chegou.

---

## 2. Decisão 2 — o eixo mestre sob TF variável: `logical` ou `time`?

### `D-C3.3` · Estado de registro em **TEMPO**; `logicalRange` é só formato de fio, convertido por aritmética pura em `charts`

Os dois são necessários, mas **não** no mesmo papel. Sonda 4: um range escolhido em `1m` sobre
83,3 dias, carregado num gráfico de `4h` pelos dois caminhos.

```
(D) alvo (1m):                     [2024-01-23T08:53:20Z .. 2024-01-23T17:13:20Z] = 8,3 h
(D) range LOGICO cru em 4h ->      [2024-02-05T22:13:20Z .. 2024-02-06T02:13:20Z]  erro = 325,3 h
(D) range de TEMPO reconvertido -> [2024-01-23T06:13:20Z .. 2024-01-23T18:13:20Z]  erro =   2,7 h
(E) setVisibleLogicalRange fracionario -> {"from":10.369999999999997,"to":60.81}
```

`[MEDIDO 2026-09-19: node probe4.mjs, n=2 caminhos sobre a mesma janela]`

- **`325,3 h` = 13,6 dias de salto** se o range lógico for carregado cru na nova grade. É o defeito
  óbvio: o índice `100.000` é o minuto 100.000 em `1m` e a **vela 100.000 de 4 h** em `4h`.
- **`2,7 h` < 1 bucket de `4h` (4,0 h)** pelo caminho do tempo. O resíduo é o encaixe da biblioteca
  na borda do bucket, não erro nosso — e é o mínimo teórico: um range de 8,3 h **não é
  representável** numa grade de 4 h com erro menor que meio bucket.
- **(E)** a biblioteca aceita índice lógico **fracionário** e o devolve verbatim (`10.37` → `10.369…`,
  `60.81` → `60.81`). ⇒ a conversão `(instante − grade.start) / stepMs` **não precisa arredondar**, e
  portanto não acumula erro ao alternar TFs.

⇒ **`setVisibleRange` (o caminho de tempo da própria biblioteca) NÃO é usado.** Ele resolve
instante→índice por busca na **série**, que tem comprimento e cobertura diferentes por painel — é o
mesmo caminho que produziu os 91 h de `§1`. Nós convertemos com a **nossa** grade, que é a mesma
para os seis, e só então chamamos `setVisibleLogicalRange`. Isto é `FR-2` cumprida ao pé da letra: a
aritmética de coordenada mora em `charts`.

**Regra de ancoragem na troca de TF** (é decisão, não detalhe): preserva-se o **instante da borda
DIREITA** e o **número de velas** (~500), não o `spanMs`. Trocar `1m`→`4h` preservando o span daria
500 velas de `4h` mostrando 8,3 h — 498 delas vazias. É o que o owner descreveu como *"N velas fixo
por TF, como no TradingView"* `[DECISÃO-OWNER: 2026-09-19]`.

---

## 3. Decisão 3 — história sob demanda, e como a tela DIZ a parede

### `D-C3.4` · A borda é detectada em `charts`, por **aritmética sobre a grade** — nunca por `barsInLogicalRange`

O idioma que a documentação da biblioteca ensina para scroll infinito é
`series.barsInLogicalRange(range).barsBefore`. **Ele está errado para nós**, e eu medi por quê:

```
(B) na borda esquerda, range={"from":0,"to":500} -> barsInLogicalRange={"barsBefore":-4608,"barsAfter":5259}
(B) longe da borda                               -> barsBefore=392
```

`[MEDIDO 2026-09-19: node probe3.mjs, série de 5.760 slots com 1.152 pontos e 4.608 whitespace à esquerda]`

`barsBefore` conta **barras com dado**, não slots. Com whitespace à frente — que é **exatamente** o
que a invariante `D-C3.2` cria, e exatamente o que a parede de `§0.3` cria — ele vem **negativo
(−4.608)**. Um detector `barsBefore < N` fica **permanentemente disparado** no painel que já bateu na
parede ⇒ **laço infinito de paginação pedindo dado que não existe.**

⇒ O predicado é `visibleRange.fromMs − axis.startMs < PAGE_TRIGGER_MS`, sobre a **grade**, uma vez
por página — não por painel. Função pura, em `charts`, sem chamar a biblioteca.

### `D-C3.5` · Quem pagina é `web`, **serial, uma requisição em voo por grade**, e o gatilho é a grade, não o painel

```
charts.historyRequest(range, axis, coverage) -> { fromMs, toMs, intervalMs } | null
```

`web` recebe o descritor, busca **as 7 séries** da nova fatia, reconstrói a grade canônica sobre a
janela alargada, e faz `setData` nos **seis** painéis (suspenso/religado, `§1`). O range de **tempo**
sobrevive ao remonte; o lógico é reconvertido (`D-C3.3`).

**O custo do remonte é medido, e é o teto desta decisão:**

```
(C) setData de   5.760 pontos x6 paineis:  48,2 ms
(C) setData de  21.600 pontos x6 paineis: 125,1 ms
(C) setData de 129.600 pontos x6 paineis: 752,6 ms
```

`[MEDIDO 2026-09-19: node probe3.mjs, jsdom — teto superior; o browser real é mais rápido, mas a
ORDEM DE GRANDEZA e a linearidade são a informação]`

⇒ A biblioteca **não tem `prepend`**: toda página custa um `setData` do array inteiro. Isto é
**linear no total acumulado**, então a paginação é **quadrática no número de páginas**. Com ~500
velas por página e teto de ~10 páginas (5.000 slots), o remonte fica em **~50 ms** — imperceptível.
Com a grade de `1m` de hoje (5.760 slots) e história de 90 dias (129.600 slots), **752 ms por
página**. ⇒ **Há um teto de slots acumulados por grade, e ele é decisão consciente, não descoberta.**
Proposta: **teto de 5.000 slots por grade**, descartando a ponta direita — nunca crescimento
ilimitado. Isto também é a resposta de `RNF-2`/`[Q5]` pelo lado do front.

### `D-C3.6` · ⛔ Três estados distinguíveis, nunca dois — e a parede é um CONJUNTO, não uma linha

`RN-1` já diz que *"não sabemos"* e *"foi zero"* nunca são os mesmos pixels. `§0.3` mede que
**"não sabemos" se parte em três**, e colapsá-los é o defeito que o owner nomeou (*"painel vazio
indistinguível de defeito"*):

| estado | o que significa | pixel |
|---|---|---|
| **`absent`** | pedimos, a fonte respondeu, o bucket não tinha ponto | whitespace (já é o de hoje, `RF-4`) |
| **`not-loaded`** | o slot existe na grade mas está fora da janela que já buscamos | ⚠️ **hoje não existe** — hachura/esmaecido, e **nunca** o mesmo pixel de `absent` |
| **`beyond-coverage`** | a série declara que não tem dado ali | borda declarada + microcopy pt-BR, **e para de pedir** |

**A parede é um conjunto de intervalos, não um instante.** `klines_volume` tem `0` a 6 d e `59` a 8 d
(`§0.3`) — um "dados até aqui" único é falso, e um paginador que trate `0 linhas ⇒ parede` para no
buraco de 6 d e nunca acha os 8 d. Inferir cobertura da contagem de linhas **não funciona**, e o
número acima é a prova.

### ⇒ `D-C3.7` · Dependência dura: o envelope de `/series-history` precisa declarar COBERTURA

O envelope de hoje **não tem esse campo** — e aqui está ele, inteiro:

```bash
curl -s '.../series-history?...' | python3 -c "import sys,json;d=json.load(sys.stdin);print({k:v for k,v in d.items() if k!='rows'})"
# {"session":…, "panel":{"series_key_id","source","nature","unit","native_grid_ms","grid_multiple"},
#  "knowledge_time":…, "bar_policy":"final_only"}
```

`[MEDIDO 2026-09-19, n=1 envelope, 5.760 rows, 570.607 B]`

⇒ `panel` carrega `source`/`nature`/`unit` (bom: `RF-8` e `RN-3` já têm fonte de verdade no fio) mas
**nada sobre o menor/maior bucket persistido**. Sem isso, `beyond-coverage` é indistinguível de
`absent` **por construção**, e `D-C3.6` não é implementável.

**Pedido formal ao `/architect` (é dele, `C-2`/`C-4` — eu não decido a rota):** `panel` ganha
`coverage: { earliest_bucket_ms, latest_bucket_ms, source_floor_ms }`. `source_floor_ms` é a parede
da **API** (`~30 d` para `/futures/data/*`, `2019-09-08` para `klines`); os outros dois são o nosso
armazém. São grandezas diferentes e o operador precisa saber qual bateu — *"a Binance não tem"* e
*"nós não coletamos"* são consertos diferentes.

⚠️ **E o rótulo NÃO pode derivar de microcopy pt-BR** — `PRD-008/M10` mede que
`data-fact="live_preço:attempted"` já nasce de uma `label` visível (`SymbolClient.tsx:2192`).
A chave de máquina desta feature é `data-fact="<panel>_coverage:<earliest_ms>:<wall_kind>"`, com
`<panel>` e `<wall_kind>` em **inglês** (`CLAUDE.md`, linhas 1 e 8 da tabela de fronteira: o
identificador em inglês, a string visível em pt-BR, no mesmo `.tsx`).

**Falsificador de `D-C3.6`/`D-C3.7`, com ablação** — arrastar para trás além da cobertura do OI:
(a) a parede aparece no painel de OI; (b) o **contador de requisições de história para aquela série
para de subir** (Playwright + intercept de rede, `n` fixo por ≥3 arrastes); (c) o painel de **Preço
continua carregando**. Remover a declaração de cobertura tem de apagar (a) **e** fazer (b) crescer
sem limite. Sem o item (b) o teste não distingue "parede desenhada" de "parede desenhada e pedindo
para sempre" — que é o `rc=0` ambíguo de `ADR-012` na forma de rede.

---

## 4. Decisão 4 — meu voto em `PRD-008 §14-B`, com custo

### **B1 (na rota), com escopo estreito.** `[voto do frontend-architect; a decisão é do `/architect` + dono de `ADR-034`]`

**O número que decide — bytes no fio, medido, não estimado:**

```bash
curl -s -o /dev/null -w "%{size_download}\n" '.../series-history?…&interval=1m&<janela de 4 dias>'
# 570607   (n_rows=5760)  ⇒  99,06 B/linha
```

`[MEDIDO 2026-09-19, n=1 resposta, série `sum_open_interest`/`POINT`, BTCUSDT]`

Aplicado à decisão do owner de **~500 velas por TF**:

| TF | B1 (rota agrega) | B2 (browser agrega — fio continua `1m`) | razão |
|---|---|---|---|
| `5m` | 500 linhas ≈ **50 kB**/série | 2.500 linhas ≈ 248 kB | 5× |
| `1h` | 500 linhas ≈ **50 kB**/série | 30.000 linhas ≈ 2,97 MB | 60× |
| `4h` | 500 linhas ≈ **50 kB**/série | **120.000 linhas ≈ 11,9 MB**/série | **240×** |

`[INFERRED: 99,06 B/linha medido × contagem de linhas; não é uma nova requisição]`

Com **7 séries** na tela, `4h` em B2 = **~83 MB por troca de TF**, sobre a premissa de infra do
owner (*VPS compartilhada*, `[PREMISSA-OWNER: 2026-08-25]`). E `(C)` mede que só o `setData` desses
129.600 pontos × 6 painéis custa **752,6 ms** de thread principal, **antes** de qualquer agregação.

**Os três custos não-monetários, que pesam mais que os bytes:**

1. **`RF-7` exige "uma implementação, num lugar só".** B2 obriga a reimplementar `RN-3`
   (`FLOW` soma · `STOCK` último · `RATIO` nem soma nem média) em TypeScript, ao lado da que já
   existe em Python (`CARRY_FORWARD_BY_NATURE`, `as_of_accessor.py:112`). Isso **cria uma segunda
   instância de `A1`** — a pergunta aberta *"como a paridade é provada sem `import` cross-language"*
   — numa feature que não a está pagando. O owner já foi avisado, na grafia do documento de decisões,
   que *"uma soma aplicada a um `STOCK` não quebra import, não reprova teste, e devolve um número
   plausível e errado"*.
2. **`CA-8` só é testável barato em B1.** *"OI reagregado a `1h` == último do bucket, e **≠** soma
   dos 12 de `5min`"* é um teste diferencial de função pura. Em Python ele roda em `make test`, com
   piso de cobertura por camada. Em TS ele roda numa suíte que só agora entrou em portão (§6).
3. **B1 é o único que escala com `D-C3.5`.** A paginação é quadrática no total acumulado
   (a biblioteca não tem `prepend`); B2 acumula **120× mais slots por página** em `4h`.

**O custo honesto de B1, e ele é real:** reabre `ADR-034/D6` (`SUPPORTED_INTERVAL = "1m"`,
`series_history.py:48`, recusa explícita em `:180-183`). ⛔ **Isto é ato daquela ADR, não desta
feature** (`PRD-008/D-b`). Sem essa reabertura, **F3 não existe em forma nenhuma** — B2 também
precisaria dela? Não: B2 é o caminho que *evita* tocá-la, e é precisamente por isso que ele está no
menu. Meu voto é que **240× de fio e uma segunda implementação de `RN-3` são um preço alto demais
para não abrir uma ADR**, e o custo de B1 é um ato de governança de **um** documento, pago uma vez.

**Por que não B3 (híbrido):** ele só ganha sentido se a **borda direita ao vivo** (SSE, `ADR-005/D1`,
envelope de bucket) precisar de grade nativa enquanto o histórico vem agregado. Esse é um problema
real — a vela de `4h` **em formação** (`PRD-008 §16` já o nomeia como `[GAP]`) — mas ele se resolve
com `bar_policy=intrabar` **dentro de B1**, no mesmo `interval`, sem uma segunda superfície de
contrato. ⇒ **B3 recusado por superfície, não por custo:** *"mais superfície de contrato"* é o que o
próprio `PRD-008 §14-B` lista como custo dele, e nenhuma medição minha o justifica.

**⚠️ B1 não conserta `§0.3`.** Reagregar `1m`→`4h` sobre um armazém que tem 5 dias de CVD devolve
**500 velas das quais ~470 são vazias**, mais rápido e com menos bytes. A escolha de B1 é de
**onde mora a reagregação**; **quanto** há para reagregar é ortogonal, e é backfill (`PRD-008/D-i`:
one-shot/cron, nunca serviço). Os dois têm de andar juntos ou `F3` entrega uma barra de TF que
mostra tela vazia em metade dos botões.

---

## 5. ⛔ `CA-5` como está escrito não morde nem cala — proposta de substituição

```
CA-5: grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*' | wc -l
      morde em 0 (hoje) e tambem em 6
```

Duas falhas, e as duas são estruturais:

1. **O desenho de `D-C3.1` produz contagem `1`** (uma chamada dentro da função de registro, num
   laço sobre os 6 painéis) — passaria. **Mas a malha ingênua também é escrita assim**: o meu
   `loop-probe.mjs (2)`, que é a malha 6×5 e mede 30 escritas, tem **exatamente 1** ocorrência
   textual. ⇒ o `grep` **não distingue o certo do errado**.
2. **A contagem `6` nem sequer é a hipótese certa de defeito** — `§0.2` mede que o defeito real de
   hoje é **grade divergente** (`oi_slots:1152` vs `price_slots:5760`), que nenhum `grep` por nome de
   função alcança.

**Substituição proposta ao `/architect`** (mantendo o `grep` como higiene, não como aceite):

| id | critério | comando | morde quando |
|---|---|---|---|
| `CA-5a` | **uma** grade: todo painel publica o mesmo `slots` | `grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <página> \| cut -d: -f2 \| sort -u \| wc -l` | `≠ 1` — **hoje dá `2`** (`5760` e `1152`) |
| `CA-5b` | **o par morde/cala do eixo** (é `loop-probe2.mjs`, promovido a teste) | headless, 6 gráficos: CALA (grades iguais) `desalinhamento = 0 min`; MORDE (grades podadas) `desalinhamento > 0` | o caso MORDE **passa** ⇒ o teste não mede alinhamento, mede que "algo se moveu" |
| `CA-5c` | o remonte não amplifica | contador de `setVisibleLogicalRange` por **um** pan | `> 5` para `N=6` (a malha ingênua dá **30**) |
| `CA-5d` | TF preserva o instante | trocar `1m`→`4h` com o range fixo: erro de borda `< 1 bucket do TF novo` | `325,3 h` (o caminho do range lógico cru) |

Os quatro números de referência são os de `loop-probe2.mjs`/`probe4.mjs` desta rodada; nenhum deles
é obtenível por `grep`.

---

## 6. Correção sobre o estado do portão do front — e ela **melhora** o meu próprio briefing

Meu briefing de agente diz *"os 34 arquivos de teste do front não estão em portão nenhum"*
`[MEDIDO 2026-09-03]`. **Isso deixou de ser verdade:**

```bash
grep -n "node --test\|suites node --test\|tsc --noEmit" Makefile frontend/package.json | head
# Makefile:83 '… (inclui as 4 suites node --test do front e o e2e de pixel)'
# Makefile:73 'make lint-frontend  ESLint do PROJETO (ADR-011/D4) + tsc --noEmit --strict (ADR-018)'
# frontend/package.json:12  "typecheck": "tsc -p tsconfig.json --noEmit --strict"
# frontend/package.json:14  "test:charts": "node --test 'src/charts/*.test.ts'"
```

`[MEDIDO 2026-09-19]` ⇒ `T-05.11` entregou: `tsconfig.json` existe, `tsc --noEmit --strict` está em
`make lint-frontend`, e as 4 suítes `node --test` estão em `make test`. **Consequência para `C-3`:**
o `TimeAxisController` puro de `D-C3.1` nasce **coberto por portão** — e é mais um argumento para
tirar a álgebra de range de dentro do componente React, onde nenhuma suíte a alcança.

---

## 7. Resumo normativo — as sete decisões

| id | decisão | falsificador |
|---|---|---|
| `D-C3.1` | range visível é de um `TimeAxisController` **puro em `charts`** (sem `IChartApi`, sem `fetch`); `web` assina, despacha e aplica | `ADR-003/FR-1`+`FR-2`; o controller compila e é testado **sem** `jsdom` |
| `D-C3.2` | ⭐ **invariante:** todo painel sobre **exatamente** a mesma grade canônica, lossless com whitespace | `CA-5a` (hoje dá `2`) + `CA-5b` (MORDE = 5.460 min) |
| `D-C3.3` | estado de registro em **instantes**; `logicalRange` só no fio, convertido por aritmética pura sobre a grade | `CA-5d`: erro `2,7 h` (< 1 bucket) vs `325,3 h` |
| `D-C3.4` | borda detectada por aritmética sobre a **grade**, nunca por `barsInLogicalRange` | `barsBefore = −4.608` com whitespace à frente |
| `D-C3.5` | `web` pagina, **serial**, com **teto de ~5.000 slots** por grade | `752,6 ms` a 129.600 pontos × 6 |
| `D-C3.6` | **três** estados: `absent` · `not-loaded` · `beyond-coverage`; a parede é um **conjunto**, não uma linha | `klines_volume`: `0` a 6 d e `59` a 8 d |
| `D-C3.7` | **dependência dura:** `panel` de `/series-history` ganha `coverage` — senão `D-C3.6` é inimplementável | o envelope de hoje não tem o campo |

**Voto em `§14-B`: `B1`** — 240× de fio em `4h`, `RF-7` cumprida num lugar só, `CA-8` testável em
Python. Custo aceito e declarado: **reabre `ADR-034/D6`**, ato daquela ADR.

## 8. O que eu NÃO decidi, e de quem é

- **Forma/cor da parede, hachura de `not-loaded`, microcopy, a barra de TF** — `design_gate`
  (`ux-ui-mastery`, `ui-designer`). Eu decidi que os **três estados são distinguíveis** e que os
  **fatos são legíveis por máquina**; **qual pixel** não é meu.
- **`§14-A` (forma da vela), `C-1`, `C-4`, o `coverage` no envelope, `SUPPORTED_INTERVAL`** — `/architect`
  (+ dono de `ADR-034`). `D-C3.7` é **pedido**, não decisão minha.
- **`Nature`/`LOCF`/âncora de `cvd_cum` sob reagregação** — `quant-architect`.
- **Backfill que enche o armazém de `§0.3`** — `sentimento`/`/architect`. ⚠️ Eu meço que **sem ele,
  `F3` entrega dois TFs de quatro mostrando tela quase vazia**; o que fazer com isso é decisão de
  escopo, do `/architect` com o owner.
- **Nome do segmento de rota** (`/symbol/[symbol]`) — `/architect` (`D-e`; inglês, linha 12).
- **Nada foi escrito no ledger, nenhum código de produção foi tocado.**
