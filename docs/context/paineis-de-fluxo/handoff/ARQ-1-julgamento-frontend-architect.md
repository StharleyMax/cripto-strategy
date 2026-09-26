# Julgamento `frontend-architect` — `paineis-de-fluxo`, `Q-ARQ-1` e o contrato de pane

**Entrada:** [`ARQ-1-frontend-architect.md`](ARQ-1-frontend-architect.md) · `PRD-009` · código em `fbad424`.
**Modo:** read-only sobre código; nenhuma ADR escrita (o `/architect` escreve, citando este arquivo).
**Fora do meu julgamento, e marcado onde aparece:** forma/interação/altura/cor/separador = `design_gate`
(`D-i`); fidelidade de dado em `charts` (RN-2 do OI, `Q-LIQ-1`) = `quant-architect`.

---

## 0. Duas correções de premissa antes de qualquer resposta

| # | a premissa | o que medi | rótulo |
|---|---|---|---|
| C-1 | handoff Q2: *"TFs servidos `5m·15m·1h·4h`"* | **cinco** TFs, **`1m` incluso e é o DEFAULT**: `SUPPORTED_TIMEFRAMES` = `1m·5m·15m·1h·4h`, `DEFAULT_TIMEFRAME = "1m"` (`frontend/src/app/symbol/supported-timeframes.ts:67-78`) | `[MEDIDO 2026-09-23]` |
| C-2 | `PRD-009` M7: *"**10** `addSeries`"* | **11** — `grep -c 'addSeries(' frontend/src/app/symbol/SymbolClient.tsx` → `11` (`:1171,1197,1224,1230,1416,1539,1545,1804,1819,1829,2408`) | `[MEDIDO 2026-09-23]` |

C-1 muda a resposta de Q2 (§2): o artefato de grade mista **existe**, e existe **no TF default**.

E uma correção sobre o meu próprio prompt de papel (não do handoff): ele diz que a suíte do front não
está em portão nenhum. **Está** — `make verify` roda *"OS OITO PORTOES … (inclui as 4 suites node --test
do front e o e2e de pixel)"* (`Makefile:81-88`) `[MEDIDO 2026-09-23]`. Os contratos de DOM de §6 portanto
**reprovam `verify`** quando F1 os quebrar; isto é custo real de F1, não teórico.

---

## 1. `Q-ARQ-1` — **veredito: `S-1`** (um `createChart`, panes nativos v5)

### 1.1 A API lida no pacote instalado — símbolo, não memória

`lightweight-charts` **5.2.1** (`frontend/node_modules/lightweight-charts/package.json`) `[MEDIDO]`.
Tudo abaixo é de `frontend/node_modules/lightweight-charts/dist/typings.d.ts` (TD) e, onde o tipo não
basta, do fonte legível `dist/lightweight-charts.development.mjs` (DEV):

| necessidade de `PRD-009` | símbolo | onde |
|---|---|---|
| criar/ordenar panes | `IChartApi.addPane(preserveEmptyPane?)`, `panes()`, `removePane(i)`, `swapPanes(a,b)` | TD:1773-1792 |
| série no pane | `addSeries(definition, options?, paneIndex?)` | TD:1640 |
| altura relativa | `IPaneApi.setStretchFactor`, `setHeight`, `getHeight` | TD:2019-2025, 2107 |
| âncora de DOM por pane | `IPaneApi.getHTMLElement(): HTMLElement \| null` | TD:~2050 |
| escala de preço por pane (overlay de marcas) | `IChartApi.priceScale(priceScaleId, paneIndex?)`, `IPaneApi.priceScale(id)` | TD:1741, ~2070 |
| eixo simétrico sem negar valor (F4) | `PriceScaleOptions.invertScale`, `mode: PriceScaleMode.Logarithmic` | TD:3706-3726, enum TD:149-153 |
| redimensionar pane pelo operador | `LayoutPanesOptions.enableResize` (default `true`), `separatorColor` | TD:3222-3240 |
| legenda por crosshair | `subscribeCrosshairMove` → `MouseEventParams.{time, logical, paneIndex, seriesData}` | TD:1723, 3392-3429 |

**Três comportamentos que o tipo não prova e o fonte prova** `[MEDIDO por leitura do fonte, 2026-09-23]`:

1. **`seriesData` traz as séries de TODOS os panes.** `_getMouseEventParamsImpl` itera
   `this._model.serieses()` — o modelo inteiro, não o pane sob o cursor (DEV:11264-11274).
2. **…mas por busca EXATA de índice.** `s.bars().search(index)` com o default
   `MismatchDirection.None` (DEV:2973) ⇒ num slot *whitespace* a série **some do `Map`**; e as séries de
   marca (`absenceSeries`/`zeroSeries`) **aparecem** nele com o valor = altura nominal em px. Consequência
   em §4.
3. **A linha vertical do crosshair é desenhada em todo pane; a horizontal só no pane sob o cursor.**
   `vertLine.visible = visible && source.vertLineVisible()` (sem argumento de pane) contra
   `horzLine.visible = … horzLineVisible(this._pane)` (DEV:667-668). `RF-3` sai **por construção**.

E um quarto sobre o DOM, que decide como `CA-1` se mede: o root é **um** `div.tv-lightweight-charts`
com uma `<table>` (DEV:10697-10703), cada pane é um `<tr>` (DEV:8605/9592/10293) e **cada pane tem os
seus próprios `<canvas>`** (DEV:8937). ⇒ `CA-1` escrito como *"`count(canvas-root) == 1`"* só é
correto se "root" = `.tv-lightweight-charts`; **`count(canvas) == 1` seria falso sob `S-1`**.

### 1.2 O argumento que decide, e ele não é de gosto

**`S-2` é a ablação de `CA-1`.** `PRD-009 §10`, CA-1: *"Os 5 panes estão num único gráfico … reverter
para 6 `createChart` ⇒ reprova"*. `S-2` **são** seis `createChart`. Escolher `S-2` exige reescrever o
critério de aceite do próprio PRD — e isso é ato do owner/`/pm`, não meu. `[DOC: PRD-009:242]`

Além disso, `S-2` herda dois defeitos estruturais que `S-1` não tem:

| defeito sob `S-2` | evidência | rótulo |
|---|---|---|
| **seis larguras de escala de preço ⇒ seis origens de x.** Cada chart dimensiona a própria escala direita pelo rótulo mais largo (preço `~65.432,1` × razão `~1,23`), e `chartConstructorOptions` **não fixa `minimumWidth`** (`chart-options.ts:40-53`; a opção existe, TD:3798). O mesmo instante cai em pixels x diferentes em cada chart — um crosshair "sincronizado à mão" seria desenhado **desalinhado** | leitura de `chart-options.ts` + TD | `[INFERRED: aritmética de layout; NÃO MEDIDO em pixel]` |
| **crosshair compartilhado = segundo dispatcher com guarda de reentrância.** `setCrosshairPosition(price, time, series)` (TD:~1807) exige uma série e um preço por chart; num slot whitespace (RN-4, 94,7% dos slots de liquidação — `SymbolClient.tsx:1884`) não há preço a passar | TD + docstring | `[NÃO SEI: se `setCrosshairPosition` desenha a vertical quando a série alvo é whitespace naquele `time`]` |
| **`RF-2` só por esconder.** Seis `timeScale` continuam existindo; *"um eixo"* vira convenção de opção (`timeScale.visible:false` em 5), não estrutura | — | `[INFERRED]` |

### 1.3 Custo medido de cada opção

**`S-1` — o que reescreve** (linhas medidas por `grep -n`/`awk` em `SymbolClient.tsx`, `fbad424`) `[MEDIDO]`:

| região | linhas | o que acontece |
|---|---|---|
| `useLightweightChart` (docstring+corpo) | `:510-640` (131) | vira **uma** montagem; o `build` por pane passa a receber `paneIndex` |
| 6 call sites do hook | `:1169, 1414, 1532, 1796, 2403` (5 funções, `LiquidationCohortSurface` monta 2×) | cada `chart.addSeries(…)` ganha o 3º argumento; **11** chamadas |
| componentes de pane | `PricePane :1155-1276` (122) · `OiPane :1399-1469` (71) · `CvdPane :1522-1633` (112) · `LiquidationCohortSurface+LiquidationPane :1776-1940` (165) · `LongShortPane :2385-2562` (178) | o JSX por pane perde o `<div ref={containerRef}>` próprio; título/leituras/badges migram para uma camada ancorada no pane (§3.3) |
| montagem no topo | `:2904-2925` (22) | `AxisSyncProvider` + 5 componentes → 1 host + registry |
| bandas de marca presas a `CHART_HEIGHT_PX` | `:508, 868, 970` | `VOLUME_MARKS_BAND_PX`/`LIQUIDATION_MARKS_BAND_PX` = `220 × (1 − margem)`; sob stretch factor/resize a altura do pane não é 220 ⇒ re-ancorar em `IPaneApi.getHeight()` ou fixar altura (resize é `design_gate`) |
| e2e acoplados ao chart-por-pane | `16-eixo-unico-pan-e-ablacao` (15 refs a `data-visible-logical-*`/`axis-sync-write-count`), `20-…` (5), `21-…` (2), `13-liquidacoes` (hospedeiro de canvas por coorte, `:532,692-697`) | re-ancorar (§6) |

**`S-1` — o que sai:** o fan-out de `axis-sync` (`registerPanel`, os 6 índices `axis-sync.ts:40-46`) e
o sincronismo de crosshair que `S-2` teria de escrever. **O que NÃO sai** — e é o achado desta leitura:
`createAxisSyncStore(axis, panelCount, onRangeApplied, options)` com **`panelCount = 1`** continua
válido (`axis-sync.ts:173-180`; só rejeita `panelCount <= 0`) e **mantém** as três coisas que F1 não pode
perder: o `initialLogicalRange` (substituto do `fitContent()`), a guarda `holdApplying` do `T-05-FIX`
contra o eco de montagem (`SymbolClient.tsx:583-587`) e o `onCandidateRange` que alimenta o pager da
história sob demanda (`axis-sync.ts:163-170, 219-222`). `RF-6` (pan/zoom + história) **sobrevive sem
reescrita do pager**. `[MEDIDO por leitura]`

**`S-2` — o custo que o PRD subdeclara:** *"menor diff agora"* é verdade para as linhas; é falso para o
risco — crosshair manual (novo dispatcher + guarda), `minimumWidth` fixado nas 6 escalas, e reescrever
`CA-1`. `[INFERRED]`

### 1.4 O falsificador de `S-1` — **roda ANTES de F1 escrever produção** (spike de F1, `T-01.0`)

Um spike que monta **um** `createChart` com os 5 panes sobre dado **real** de `/series-history`
(`BTCUSDT`, TF `1m` = default, ~5.760 slots — `axis-sync-alignment.test.ts:176`), com as 11 séries e as
escalas de marca, contra `next build`/`next start` (`make e2e`). **`S-1` cai — e `S-2` reabre — se
QUALQUER um destes reprovar:**

| # | medida | reprova se | por que morde |
|---|---|---|---|
| F-1 | `p95` do intervalo entre aplicações de range (probe de §7, `panelCount=1`) | **> 160 ms** (teto vigente, `e2e/17-teto-latencia-eixo.spec.ts:134`) **ou** `n < 61` | 5 panes num canvas-table repintam juntos no mesmo frame; se o custo de pintura por frame for o gargalo, é aqui que aparece |
| F-2 | `setData` da história sob demanda (spec `20`) | **> 400 ms** (teto `T-05.9`) | `S-1` remonta/repinta 1 chart com 11+ séries por página em vez de 6 menores |
| F-3 | x em pixel da linha vertical nos 5 panes, lido do canvas | qualquer par difere em **> 1 px** | refuta DEV:667-668 no browser real |
| F-4 | `seriesData.size` num hover sobre um índice com dado em todos os panes | `< nº de séries não-whitespace naquele índice` | refuta DEV:11264-11274 |
| F-5 | slot de OI ausente + slot de liquidação `0` no mesmo pane-stack | ausente desenha candle/barra **ou** zero e ausência renderizam igual | RN-2/RN-4 sob pane nativo (§3) |

**Controle negativo obrigatório** (sem ele o verde não vale — o modo de falha de `ADR-012`): repetir F-1
com um *busy-wait* de 20 ms injetado no handler de range por query param de e2e (mesmo idioma de
`e2eAxisSyncDisabled`, `axis-sync.ts:104`). Se o `p95` **não subir**, o instrumento não tem poder sobre
o custo de pintura e F-1 não é evidência nem a favor nem contra — ver §7.

---

## 2. Grades mistas numa escala de tempo só (Q2)

**A escala única NÃO cria artefato novo — ele já existe hoje e é o mesmo nas duas opções.** Desde
`T-02.1`/`D-C3.2`, os seis painéis já desenham **sobre a mesma grade canônica do TF, com whitespace**
(`charts/time-axis-controller.ts:37-48`: *"the same `slotCount` … across all six panels (lossless with
whitespace, never a per-panel native length)"*), com prova em `axis-sync-alignment.test.ts:176` (5.760
slots cada). A união de tempos que `S-1` faz é, portanto, **a própria grade** — **desde que toda série
de todo pane chame `setData` com exatamente os `time` da grade**. Uma série com um `time` fora da grade
**insere um índice lógico novo em todos os panes** e desloca tudo — essa é a invariante que F1 tem de
provar (hoje ela é provada por pane; sob `S-1` a violação deixa de ser local).

**O artefato, com C-1 aplicada:** a largura de barra da `lightweight-charts` é **por índice lógico, não
por duração**. Com OI nativo `5m`:

| TF | amostras de OI por bucket do TF | forma do candle de OI (F3) |
|---|---|---|
| **`1m` (default)** | **1 a cada 5 slots** | candle de **1 slot** de largura representando 5 min, com **4 whitespaces** entre candles — é o "candle estreito + whitespace" que a pergunta suspeitava |
| `5m` · `15m` · `1h` · `4h` | 1 · 3 · 12 · 48 | um candle por slot, sem artefato |

`[INFERRED: aritmética sobre `stepMs` de `supported-timeframes.ts:67-73` e OI 5m de SPEC-008 A-6]`
`[NÃO SEI: se o OI em TF 1m hoje ocupa 1-em-5 slots ou vem preenchido; medir `data-fact` de `oi_slots` e `presentPoints` em `/symbol/BTCUSDT?interval=1m` antes de F3]`.
**Quem decide o que o TF `1m` mostra para o OI (1-em-5, esconder o pane, ou avisar) é `design_gate` +
`quant-architect`** — é vizinha de `Q-OI-3`. Não é pergunta de `S-1`×`S-2`.

**RN-2 (buraco não vira candle):** sob `S-1` é satisfeita pelo mesmo mecanismo de hoje —
`candlestickSeriesLossless` devolve `{time}` para slot sem candle (`charts/s2-lightweight-adapter.ts:105`,
`view-model.ts:272`: *"all four absent ⇒ … `WhitespaceItem` ⇒ a gap on screen"*). O risco de RN-2 não
é o pane, é a **montagem do OHLC** (a regra do `open` contíguo de `O-1`, `PRD-009:293`) — dono
`quant-architect`/`charts`, não este julgamento.

---

## 3. `RN-4` e `slot-coverage` em pane nativo (Q3)

### 3.1 As marcas de ausência/zero cabem — com uma re-ancoragem

Hoje cada pane desenha ausência e zero como **duas séries de histograma numa escala de preço própria**
(`volume_marks`, `liquidation_marks`) com faixa fixa via `autoscaleInfoProvider` e `scaleMargins`
(`SymbolClient.tsx:867-883, 1812-1833`). Sob `S-1` a mesma construção existe **por pane**:
`addSeries(…, { priceScaleId: "liquidation_marks" }, paneIndex)` — o `priceScaleId` é resolvido dentro
do pane (TD:1741 `priceScale(id, paneIndex?)`). **O que quebra:** a altura da faixa é derivada de
`CHART_HEIGHT_PX = 220` (`:508, 868, 970`) e as ordenações estritas *ausência < zero < menor barra*
foram medidas contra esse 220 (`:869-872`, `[MEDIDO 2026-09-15: 1,70 px < 5,10 px < 10,39 px]`).
Sob stretch factor, a altura do pane é outra, e com `enableResize` default `true` (TD:3228) **o operador
a muda arrastando** ⇒ `volume-subaxis-geometry.test.ts` e `liquidation-geometry.test.ts` têm de medir
contra `IPaneApi.getHeight()`, ou o resize tem de ser desligado (decisão de `design_gate`).

### 3.2 `slot-coverage` não é canvas — é DOM, e aí mora o custo real de `S-1`

`panelWallState` (`slot-coverage.ts:96`) alimenta `BeyondCoverageBadge`/`PartialCoverageMark`/
`AbsenceNote` — **elementos de DOM** ao lado de cada canvas, não pintura. Hoje: **48** `data-fact=` e
**9** `data-testid=` em `SymbolClient.tsx` `[MEDIDO: grep -c]`. Sob `S-1` eles não podem mais viver
"entre os canvases", porque não há canvas por pane para ficar entre. Duas formas estruturais (a
escolha visual entre elas é `design_gate`):

- **camada sobreposta ancorada no pane:** portal/posicionamento absoluto sobre `IPaneApi.getHTMLElement()`
  (o `<tr>` do pane), reposicionada quando a altura muda;
- **trilho lateral/legenda:** os textos saem do pane e vão para uma coluna indexada pelo `paneIndex`.

`[NÃO SEI: se `getHTMLElement()` devolve não-null já no mesmo tick de `addPane` ou só após o primeiro paint — o tipo diz *"null if pane wasn't created yet"* (TD:~2050); o spike F-5 tem de ler isso]`.

### 3.3 F4 — dois panes de liquidação viram um: a distinção sobrevive, mas não do jeito que o PRD supõe

A barra de liquidação é **logarítmica** (`PriceScaleMode.Logarithmic`, `SymbolClient.tsx:1810-1813`).
**Log não representa valor negativo** ⇒ *"uma série acima de zero, outra abaixo"* (`RF-10`) **não se
faz negando a perna long** sem abrir mão da escala log. A construção nativa que preserva as duas
coisas: **duas escalas sobrepostas no mesmo pane**, cada perna na sua, a de baixo com `invertScale: true`
(TD:3726) e as `scaleMargins` partindo o pane em metade superior/inferior. Cada perna **mantém o seu
próprio par de marcas** (`absenceMarkSeries`/`zeroMarkSeries` por coorte), agora do seu lado do zero ⇒
por pane: 2 barras + 4 marcas = **6 séries**, **4 escalas**. A distinção ausência×zero sobrevive porque
continua sendo **série própria por perna** (dois `series_key_id`, `RN-3` intacta); o argumento que hoje
justifica dois charts — *"a distinção entre coortes não depende de matiz (WCAG 1.4.1) e as marcas de
uma perna não se sobrepõem às da outra"* (`:1881-1884`) — passa a ser pago por **posição** (cima/baixo),
não por chart. `[INFERRED: leitura da API; NÃO MEDIDO — é o item F-5 do spike]`.
**Log × linear no pane fundido, e o tamanho das duas metades, são `design_gate`.**

---

## 4. Legenda por pane (Q4)

**Sim, `subscribeCrosshairMove` entrega `seriesData` de todos os panes** (§1.1-1). **E ela NÃO deve ser
a fonte do valor da legenda**, por dois motivos medidos:

1. **Whitespace some do `Map`** (§1.1-2): ausência vira "chave faltando", e o `Map` não distingue
   *"sem ponto"* de *"série não montada"*.
2. **As séries de marca estão no `Map` com a altura em px como valor** — uma legenda lida de `seriesData`
   sem filtro mostraria `6` (px de `LIQUIDATION_ZERO_MARK_PX`, `:989`) como se fosse liquidação.
3. (STOCK) No TF `1m`, o OI tem 4 slots em 5 sem ponto; a leitura honesta é **"held"**, que já existe
   como função pura (`resolveStockReading`, `charts/s2-absence-policy.ts`, usada em `:1136-1145`).
   `seriesData` não sabe nada de "held".

⇒ **A legenda lê `param.logical` e resolve contra os slots do view-model** (a mesma grade — índice
lógico `i` = slot `i`, pela invariante de §2), com a mesma função de leitura por `nature` que o
"Leitura atual" de cada pane já usa. `param.logical === undefined` (cursor fora) ⇒ cai no `reading` já
computado = último bucket fechado (`RF-4`). `seriesData` fica só para o que ele é bom: saber **se** o
crosshair está sobre dado. **A mutação que `CA-3` precisa sob `S-1`** não é *"desligar o compartilhamento"*
(o compartilhamento é estrutural, não desligável): é **filtrar a atualização da legenda por
`param.paneIndex`** — os outros 4 panes congelam no último valor e `CA-3` reprova.

**`RF-5` (nome derivado do `SeriesKey`)** não muda com `S-1`: é a mesma função de identidade que já
nomeia os panes (`identityTerms`, `:1986`; herança de `SPEC-008 §8.2`). O que muda é **onde ela é
chamada** — no registry (§5), uma vez por pane, e não em cada `<h3>` à mão.

---

## 5. Contrato do *pane registry* — a forma, sem código (Q5)

**Fronteira sob `ADR-003`** — `FR-2`: *"`web` não calcula geometria. Nenhum `px`, nenhuma escala"*
(`docs/adr/ADR-003-fronteira-charts-web.md:37`).

⚠️ **Achado, não resolvido aqui:** `SymbolClient.tsx` (web) **já carrega 14 constantes de geometria**
— `*_PX`, `*_SCALE_MARGINS`, `*_LOG_BASE`, `CHART_HEIGHT_PX` (`:508, 818, 852, 868, 873, 874, 900, 901,
967, 969, 970, 983, 988, 989`) `[MEDIDO: grep -nE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*=' | wc -l → 14]`.
É dívida de `FR-2` anterior a esta feature. O registry é o momento em que ela fica **visível**: se o
registry nascer em `web` com esses números dentro, a dívida vira contrato. Recomendação: o registry em
`web` **referencia** geometria por nome; os números vivem em `charts`. Quem decide se F1 paga a
migração ou só não a aumenta é o `/architect` (custo: F1 mexe em `charts`, e `ADR-003` diz que `web`
não alarga `charts` sozinho).

**A forma** (dado, não tipo TS; ordem do array = `paneIndex` = ordem de cima para baixo):

| campo | o que é | dono do VALOR | dono da FORMA |
|---|---|---|---|
| `pane_id` | chave estável em inglês (`price`, `liquidation`, `oi`, `long_short`, `cvd`) — e a fonte única de `data-testid` (preserva `price-pane`, `oi-pane`, … que os e2e já usam) | `web` | `web` |
| `order` | implícito na posição | `design_gate` (`RF-1`, `I-1`) | `web` |
| `stretch` | altura relativa → `setStretchFactor` | `design_gate` | `charts` (é geometria) |
| `series[]` | por série: `role` ∈ {`primary`, `secondary`, `absence_mark`, `zero_mark`}, `series_key_id` (do catálogo, nunca literal), `kind` ∈ {`candlestick`,`line`,`histogram`}, `scale_ref` (nome de uma escala declarada por `charts`), `slots_ref` (qual campo do assembly do pager alimenta) | `web` compõe | `charts` define `kind`/escalas/adapters lossless |
| `legend` | `label_from` = `SeriesKey` (derivado, `RF-5`); `reading_policy` = a `nature` (`FLOW`/`STOCK`/`RATIO`) que escolhe a função de leitura | derivado | `charts` (leitura por nature) · `web` (render DOM) |
| `status_ref` / `coverage_ref` | chave em `panelStatus` e `pager.panelCoverage` | derivado | `web` |

**Invariantes do registry** (o que o teste dele tem de afirmar, e cada uma tem par morde/cala):
(i) todo `series_key_id` existe no catálogo servido; (ii) todo pane tem ≥ 1 `primary`; (iii) toda série
`FLOW` tem o par `absence_mark`+`zero_mark` (RN-4 vira **propriedade do registry**, não disciplina por
pane — é o que faz F4 não poder "esquecer" a marca na fusão); (iv) nenhum `label` é string literal.

---

## 6. Contratos de DOM — o que morre, o que se re-ancora (Q6)

**Os 5 `*-pane-dom-contract.test.ts` são contratos por TEXTO-FONTE**: todos fazem
`readFileSync("SymbolClient.tsx")` e/ou `"[symbol]/page.tsx"` e casam regex (ex.:
`cvd-pane-dom-contract.test.ts:36-43,64`) `[MEDIDO]`. **56 testes** (`grep -c '^test('`: cvd 12 ·
liquidation 12 · long-short 11 · oi 12 · price 9).

| classe | n | destino |
|---|---|---|
| acoplados à construção do chart (`addSeries`, `containerRef`, `priceScale`, `scaleMargins`, `setData`) — ex.: `cvd:266` casa `ref={containerRef}\s*\n\s*aria-hidden="true"`; `long-short:304-305` casa o texto literal de `chart.addSeries(LineSeries, style)` | **~7** | **morrem** e renascem como invariantes do registry (§5 i-iv) |
| `testid`/`data-fact` declarados e renderizados | a maioria do resto | **sobrevivem se** `pane_id` → `testid` for preservado e o wrapper renderizar (§3.2) |
| sobre `page.tsx` (resolução de `SeriesKey`, fetch separado por redução — `price:57-105`) | ≥ 4 | **intocados**: F1 não mexe no Server Component |

`[MEDIDO por heurística: awk sobre blocos `test(` procurando `addSeries|containerRef|useLightweightChart|priceScale|scaleMargins|PANEL_INDEX|setData|*Series|chart\.` → 3+2+2+0+0 = 7; a triagem teste-a-teste é trabalho de F1, não deste julgamento]`.

**`axis-sync.ts`:** não morre (§1.3). Morrem os 6 índices fixos (`:40-46`) e `PANEL_COUNT = 6`; a
store sobrevive com `panelCount = 1`. `axis-sync.test.ts` (292 linhas) e `range-dispatch.test.ts` (285,
em `charts`) continuam válidos como testes da álgebra — **não apagar em F1**: `RangeDispatcher` é de
`charts`, e apagá-lo é decisão de `charts`. `axis-sync-alignment.test.ts:176` (*"all six panels on the
SAME canonical grid"*) muda de sujeito: a mesma grade para **todas as séries do chart**.

**e2e que re-ancoram:** `16-eixo-unico-pan-e-ablacao` — a ablação `e2eAxisSyncDisabled` **perde
sentido** sob `S-1` (não há como dessincronizar panes de um chart só); a mutação que a substitui é a de
`CA-1` (voltar a 6 `createChart`). `13-liquidacoes` lê um hospedeiro de canvas **por coorte**
(`:532, 692-697`) — re-ancora no pane fundido depois de F4. `11-canvas-fundo` (varre **todo** `<canvas>`)
**sobrevive intacto**. **E `CA-2`** (*"reativar o eixo num pane intermediário ⇒ reprova"*) **não tem
mutação possível sob `S-1`** — a API não tem eixo de tempo por pane. Critério que não pode reprovar não
morde; sob `S-1`, `CA-2` é **estrutural** e a sua ablação é a mesma de `CA-1`. Isto volta ao `/architect`.

---

## 7. `CA-11` — a baseline de latência, e o defeito do instrumento (Q7)

**O instrumento:** `window.__axisLatencyProbe.samplesMs`, gravado por `recordAxisRangeApplied`
(`axis-latency-probe.ts:67-80`), chamado de `onRangeApplied` — que dispara quando
`dispatcher.state` muda (`axis-sync.ts:218-222`). Lido por `e2e/17-teto-latencia-eixo.spec.ts`: `p95` do
intervalo entre aplicações consecutivas, `n ≥ 61` amostras, teto **160 ms** (`:134-137`).

**A baseline já existe, com n e comando** (`docs/context/candle-real-e-eixo-unico/gates/T-02-latencia-fix.md:29-40`):
`p50 16,70 · p95 32,90 · max 49,30 ms`, `n = 87` amostras, 1 rodada sem fix `[MEDIDO 2026-09-22]`.

**E o achado que decide como usá-la:** a mesma gate mediu que **com zero escrita nos 5 painéis o `p95`
continua ~33 ms**, e que o evento **cru** da biblioteca no painel de origem já carrega `p95 = 32,70`
(`DIAG_raw_n=88`, `:62-84`). ⇒ **o probe mede a cadência de entrada do Chromium headless via CDP, não o
custo de pintar 6 charts.** Ele não tem poder demonstrado sobre a variável que `S-1` muda. É o
modo de falha de `ADR-012`: `CA-11` passaria igual com `S-1` bom e com `S-1` ruim.

**O que sobrevive sob `S-1`:** com a store em `panelCount = 1` (§1.3) o probe **continua disparando**
no mesmo ponto — `onRangeApplied` depende de mudança de estado, não de haver outro painel. A medida é,
portanto, comparável antes/depois. **O que falta é poder.**

**A baseline a medir ANTES de F1** (comando e universo):

```bash
# no HEAD de master, antes de qualquer commit de F1; stack de e2e própria (store efêmero — D-g)
for i in 1 2 3 4 5; do
  bash -c 'STATE_DIR="$(bash scripts/e2e-env.sh up 1 8811 4311)"; \
    E2E_BASE_URL="$(cat "$STATE_DIR/base_url")" E2E_API_LOG_PATH="$STATE_DIR/api.log" \
    E2E_SENTIMENTO_API_BASE_URL="$(cat "$STATE_DIR/api_base_url")" \
    frontend/node_modules/.bin/playwright test --config=frontend/playwright.config.ts \
      frontend/e2e/17-teto-latencia-eixo.spec.ts frontend/e2e/20-teto-latencia-historia-sob-demanda.spec.ts; \
    bash scripts/e2e-env.sh down "$STATE_DIR"' 2>&1 | grep 'E2E-FACT' ; done
```

Universo: **5 rodadas isoladas × ~87 amostras** (spec 17, `N_STEPS = 90`, `:139`) + spec 20 (`setData`
por página, teto 400 ms), sem outro processo de teste na máquina (a mesma condição de `T-02-latencia-fix`
Medição 1). Registrar `p50/p95/max` por rodada. `[NÃO MEDIDO: não rodei — read-only]`.
Os três argumentos de `up` são obrigatórios (`scripts/e2e-env.sh:69`, `${1:?api_up}`…) e os valores acima são os defaults do Makefile (`Makefile:56-58`: `E2E_API_UP=1`, `E2E_API_PORT=8811`, `E2E_NEXT_PORT=4311`) `[MEDIDO]`.

**E o controle negativo que dá poder ao instrumento** (condição para `CA-11` morder): o busy-wait de
20 ms de §1.4 **tem de mover o `p95`**. Se não mover, `CA-11` precisa de um segundo instrumento que
meça pintura (duração de frame via `requestAnimationFrame` durante o arrasto, ou `PerformanceObserver`
`longtask`) — `[NÃO SEI: qual dos dois tem poder no Chromium headless deste repo; não medido]`.
**O teto numérico** continua `PRD-008 [Q5]`/`G-3` — `/architect` propõe, owner ratifica.

---

## 8. Insumo para `Q-SEQ-1` (a decisão é do `/architect`) (Q8)

**Regiões, medidas por `grep -n` em `SymbolClient.tsx` (`fbad424`)** `[MEDIDO]`:

| | região | linhas |
|---|---|---|
| **Perna 2 de `ADR-043`** (o que a ADR declara reescrever) | `TimeframeBar` `:2626-2766` (141, com docstring) · `handleTimeframeSelect` `:2877-2890` (14) · `<TimeframeBar …/>` `:2903` (1) · `import { usePathname, useRouter }` `:60` (1) | **157** |
| Perna 2 — provável, não declarado pela ADR | `historyPagingSeed` `:2790-2819` (30): `interval: selectedTimeframe` vem de prop; se o TF vira estado de cliente, a semente do pager muda | +30 `[INFERRED]` |
| **F1** | hook `:510-640` (131) · panes `:1155-1276, 1399-1469, 1522-1633, 1776-1940, 2385-2562` (648) · montagem `:2904-2925` (22) · imports `:98-107` (10) | **~811** |

**Sobreposição de linha: zero.** **Adjacência: sim** — `:2903` (Perna 2) e `:2904` (F1) são linhas
vizinhas do mesmo `return`, e o merge de três vias do git trata hunks que se tocam como conflito
`[INFERRED: comportamento do merge do git, não reproduzido aqui]`.

**Sobreposição semântica: alta, e é ela que importa.** Hoje a troca de TF faz `router.push` → RSC →
props novas → `axis` novo → `AxisSyncProvider` cria store nova → **`useLightweightChart` remonta os 6
charts** (deps `[containerRef, panelIndex, axisSync]`, `:640`). A Perna 2 troca **quem dispara** a troca
de `axis`; F1 troca **o que remonta** quando o `axis` muda (1 chart com 5 panes, e talvez `setData` em vez
de remontar). As duas reescrevem os dois lados do mesmo contrato de ciclo de vida.

**Leitura minha, para o `/architect` pesar** `[INFERRED]`: **F1 antes da Perna 2.** (a) F1 é ~5× maior
(~811 × 157 linhas); rebasear a menor sobre a maior é mais barato. (b) A própria `ADR-043` põe a Perna 2
**depois** da Perna 1 (`ADR-043:76, 95-100`) e a Perna 1 está **pendente de decisão do owner**
(`ADR-043:136`) — esperar por ela bloquearia F1 por uma decisão que não é de F1. (c) Se F1 fixar o
ciclo de vida *"axis novo ⇒ `setData` no chart existente, sem remontar"*, a Perna 2 herda o contrato
pronto em vez de reescrever sobre o de 6 charts. ⚠️ A Perna 1 (seletor de símbolo) **também** troca o
`axis` — o mesmo argumento vale para ela.

---

## Resumo em uma tabela

| Q | resposta | força |
|---|---|---|
| Q-ARQ-1 | **`S-1`**; `S-2` é a ablação do próprio `CA-1` | `[MEDIDO]` API + `[DOC]` PRD |
| Q2 | artefato **existe só no TF `1m` (default)** e é igual em S-1/S-2; RN-2 já satisfeita por whitespace | `[INFERRED]` + `[NÃO SEI]` estado atual do OI em 1m |
| Q3 | marcas cabem (escala por pane); faixa presa a 220 px re-ancora; F4 = 2 escalas sobrepostas + `invertScale`, não negação (log) | `[MEDIDO]` API · `[NÃO MEDIDO]` pixel |
| Q4 | `seriesData` é global mas **não** é fonte de valor; legenda = `param.logical` × slots | `[MEDIDO]` fonte da lib |
| Q5 | registry: forma em §5; 14 constantes de geometria já em `web` (dívida `FR-2`) | `[MEDIDO]` |
| Q6 | 56 testes; ~7 morrem; `axis-sync` sobrevive com `panelCount=1`; `CA-2` perde a mutação | `[MEDIDO]` heurística |
| Q7 | baseline existe (`p95 32,9`, `n=87`), mas o probe **não tem poder demonstrado** sobre pintura | `[DOC]` gate anterior |
| Q8 | zero linha em comum, adjacência em `:2903/2904`, acoplamento semântico no remonte por `axis` | `[MEDIDO]` |
