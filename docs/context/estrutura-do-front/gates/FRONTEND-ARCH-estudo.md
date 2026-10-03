# Estudo `frontend-architect` — estrutura do front: indicador como módulo isolado, carregado pela seleção

**Entrada:** [`handoff/FRONTEND-ARCH-estudo.md`](../handoff/FRONTEND-ARCH-estudo.md) · **ADR escrita:**
[`ADR-050`](../../../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (proposta).
**Base medida:** `wave/paineis-f05` em `4b255da`, lida com `git archive wave/paineis-f05 frontend | tar -x` num diretório de rascunho.
**Nenhum arquivo daquela branch nem de `docs/indicadores-smc-refinamento` (`701cf86`) foi editado.** O que muda na `ADR-048` e na
`SPEC-010` aparece no §8 como **proposta de emenda**.
**Fora do meu julgamento, marcado onde aparece:** a aparência e a interação do seletor, e o limiar de "piscar" aceitável no remonte
(`ui-designer` + `ux-ui-mastery`). A reorganização interna de `src/charts/` é do `quant-architect` (`charts.architect`, `Q16`). O
conjunto ligado por padrão é do **owner** (§9, menu `O-1`).

---

## 0. Veredito

**A troca é viável sem mudar nada na tela, e mais da metade dela é mover código como está.** Hoje cada pane **já é quase um
módulo**: ele se declara ao host por `useHostedPane(paneId, binding)` e pinta a própria camada por `PaneLayer`. O que impede o
isolamento é **outra coisa**, e são quatro problemas medidos:

1. **Tudo mora num arquivo só.** `SymbolClient.tsx` tem 4.527 linhas, e **52 dos 118** commits de front desde 2026-09-01 mexeram
   nele (§1.4).
2. **O host fixa o conjunto de panes no mount.** O número de panes vem de `PANE_STACK`, o índice vem de `F1_PANE_ORDER`, e o
   registrar é um `Map` por `paneIndex`, sem `unmount` (§1.2).
3. **A derivação de dado por indicador está duplicada** entre o servidor (`[symbol]/page.tsx`) e o cliente (`panel-assembly.ts`):
   são 39 linhas de código idênticas depois de normalizar (§1.3).
4. **Nenhum portão impede um indicador de importar outro**, e **um diretório novo no topo de `src/` escapa da fronteira
   `ADR-003`**. As duas coisas foram medidas com sonda de ESLint (§4.3).

O acoplamento **real** entre indicadores é pequeno: **5 pares**, e só um deles não é trivial, o par preço ↔ volume (§1.1). Este estudo
propõe **12 fatias** (§5). A `F0` pode começar **já**, em paralelo com a fase `05`. A `F1` e as seguintes esperam a fase `05` de
`paineis-de-fluxo` chegar a `origin/master`. O front de `indicadores-smc` começa depois da `F9` e **não edita mais
`SymbolClient.tsx`** (§8).

> ⚠️ **Correção de premissa do meu prompt de sistema.** Ele diz que *"os 34 arquivos de teste do front não estão em portão nenhum"*.
> **Isso está velho.** O `make verify` roda `test-frontend` (as 4 suítes `node --test`) e o `e2e`
> `[MEDIDO: git show wave/paineis-f05:scripts/verify.sh | grep -n 'test-frontend\|e2e' → :17-24]`. A suíte do front **é** portão hoje.

---

## 1. `E-1` — Inventário de responsabilidades

### 1.1 `SymbolClient.tsx` (4.527 linhas na wave, 4.490 em `master`)

Método: o script abaixo acha cada declaração de topo, junta a ela o docstring imediatamente acima e soma as linhas até a próxima
declaração. A categoria vem do nome. O erro é de ± algumas linhas de comentário na borda entre dois blocos `[MEDIDO 2026-10-02]`.

| bloco | linhas | o que tem | dono depois |
|---|---:|---|---|
| cabeçalho + imports | 209 | docstring do arquivo e 29 declarações `import` | some (cada módulo importa o que usa) |
| **long/short** | 709 | `LongShortPane`, banda recente, rodapé de escala, selo de integridade, idade, cauda | `indicators/long-short/` |
| **liquidação** | 705 | `LiquidationPane` fundido, coortes, marcas, troca de lado e escala log de e2e | `indicators/liquidation/` |
| **host + registrar** | 659 | `SymbolChartHost`, `PANE_STACK`, `HostedPaneBinding`, `PaneRegistrar`, `useHostedPane`, `PaneLayer`, âncoras | `chart/host/` (núcleo) |
| **OI** | 649 | `OiPane`, legenda OHLC do OI, frescor, proveniência, rótulos de regime, ablações | `indicators/oi/` |
| chrome da página | 518 | `SymbolClient` (199), `SymbolClientProps`, `TimeframeBar`, `LiveRow` + `useLiveReadout`, `ChromeModeStamp` | `SymbolClient.tsx` + `chrome/` |
| **CVD** | 255 | `CvdPane`, legenda, horizonte legível | `indicators/cvd/` |
| **volume** | 243 | `VolumeSubAxis`, legenda de marcas, constantes da sub-escala | `indicators/volume/` |
| preço (vela) | 237 | `PricePane`, `PriceCandleFacts`, margens da vela | `chart/price/` (núcleo) |
| marcas de ausência/cobertura | 180 | `AbsenceNote`, `ABSENCE_TOKEN`, `PartialCoverageMark`, `BeyondCoverageBadge`, `formatUtcMinute` | `chart/marks/` (núcleo) |
| legenda / crosshair | 164 | `PaneLegend*`, `LegendValue`, `LegendFrame`, `identityTerms`, contexto do crosshair | `chart/legend/` (núcleo) |

**Os 5 indicadores somam 2.561 linhas (57%). O núcleo (host, preço, marcas, legenda) soma 1.240 (27%).**

**Quem depende de quem**, medido sobre o código **sem comentário**. Com comentário, os docstrings citam os panes vizinhos e o número
infla para 17 pares falsos:

- **todo pane → núcleo:** usa de 13 a 16 símbolos do núcleo (`useHostedPane`, `PaneLayer`, `PaneLegend*`, `LegendValue`,
  `useLegendFrame`, `AbsenceNote`, `ABSENCE_TOKEN`…). É a dependência certa, de indicador para núcleo.
- **indicador → indicador: 5 pares, e só 1 é acoplamento de verdade.**
  - `oi`, `liquidation` e `long_short` usam `VolumeSlot`. É um alias de tipo mal nomeado (`S2Panels["oi"]["slots"][number]`, o slot
    escalar genérico) e vai para o núcleo como `ScalarSlot`.
  - `long_short` usa `formatSpan`, que está no bloco do OI. É um formatador genérico e vai para o núcleo.
  - **`PricePane` usa 12 símbolos de volume.** A série de volume é montada **dentro do binding do pane de preço**, e as margens da
    vela (`PRICE_CANDLE_SCALE_MARGINS = { top: 0.2, bottom: 0.22 }`, `:1625`) reservam a faixa do volume. Este é o único acoplamento
    real, e quem o resolve é a `F8` (§5).

```bash
# o inventário (python3, sobre o arquivo extraído da wave) — 2 passos
git archive wave/paineis-f05 frontend | tar -x -C "$SCRATCH/w"
python3 inv.py "$SCRATCH/w/frontend/src/app/symbol/SymbolClient.tsx"   # inv.py no Apêndice A
# a dependência cruzada sem comentário: Apêndice A, segundo bloco → "pairs 5"
```

### 1.2 O host: o que trava a seleção

| fato | onde (wave `4b255da`) | efeito para "carregar o que está selecionado" |
|---|---|---|
| número de panes fixo no mount: `createPanesBeforeSeries(chart, PANE_STACK.stretchFactors.length)` | `SymbolClient.tsx`, efeito de mount de `SymbolChartHost` | ligar ou desligar um pane exige outro mount |
| `paneIndex` = posição em `F1_PANE_ORDER` (constante: `price, liquidation, oi, long_short, cvd`) | `paneIndexOfId`, `:772`; `pane-registry.ts:73` | o índice não acompanha um conjunto que muda |
| registrar `Map<paneIndex, binding>`, sem `unmount` (o cleanup só apaga a entrada do `Map`) | `register`, `:1066-1093` | desligar deixa série órfã (o fato 3 da `ADR-048` mede o mesmo) |
| o efeito de mount depende só de `[registrar]`, e uma nova semente remonta `SymbolClient` por `key` | `page.tsx:1017` `key={seedIdentityKey(…)}` | a seleção precisa viver **acima** desse `key` (`P-1`) |
| a biblioteca **suporta** pane dinâmico: `addPane`, `removePane(index)`, `swapPanes` | `lightweight-charts@5.2.1` `typings.d.ts:1773-1792` `[MEDIDO]` | o limite está no host, não na biblioteca |
| **o registro declarativo existe, mas só os testes o usam.** `PaneSpec`/`validatePaneRegistry`/`assertValidPaneRegistry` têm 0 chamadas de produção | `grep -rln 'validatePaneRegistry\|assertValidPaneRegistry' src` → só `pane-registry.ts` e o teste dele `[MEDIDO]` | o catálogo novo **absorve** `pane-registry.ts`: as invariantes (i)–(v) passam a valer sobre o catálogo ativo |

### 1.3 `view-model.ts` (1.306) e `[symbol]/page.tsx` (1.047)

**`view-model.ts`**, por faixa de linha `[MEDIDO: leitura das declarações, grep -nE '^export' view-model.ts]`:

| faixa | linhas | o que é | destino |
|---|---:|---|---|
| slots genéricos (parse de FLOW, contagens, estatística, `slotsFrom`, leitura) | 317 | núcleo | `chart/data/slots.ts` |
| OHLC (`KLINES_OHLC_*`, `assembleOhlcCandles`) | 189 | núcleo (vela) | `chart/price/` |
| proveniência + frescor | 159 | núcleo | `chart/data/` |
| cabeçalho/tipos | 149 | — | se divide |
| **OI** (`matchesBinanceOpenInterest`, proveniência OI, invariantes `ADR-036/D2`) | 161 | indicador | `indicators/oi/data.ts` |
| **CVD** (`matchesKlineTakerBuyCvd`, `parseSignedDecimalToScaled`, deltas) | 131 | indicador | `indicators/cvd/data.ts` |
| **long/short** (`matchesCountLongShortRatio`, `countNativeBarsByPublication`) | 75 | indicador | `indicators/long-short/data.ts` |
| cobertura parcial + `keyMatchesSymbol` | 67 | núcleo | `chart/data/` |
| **liquidação** (`matchesLiquidationCohort`) | 58 | indicador | `indicators/liquidation/data.ts` |

**`page.tsx` faz três coisas por indicador:** escolhe a série no catálogo, por um predicado `resolveCatalogEntry(…, matches…)`; dispara
o fetch, dentro de um `Promise.all` de **10** séries (4 de OHLC + volume + OI + CVD + 2 de liquidação + long/short); e **deriva** os
fatos do pane. O **pager do cliente refaz a mesma derivação** em `panel-assembly.ts::assembleHistoryPage`, a cada página:

```bash
# linhas de código (sem comentário, normalizadas: janela→W, rows→R, instante→T, len>25) presentes nos DOIS arquivos
comm -12 <(norm page.tsx) <(norm panel-assembly.ts) | wc -l     # → 39   (norm no Apêndice A)
```

Exemplo: o bloco da coorte de liquidação (`slots`, `presentPoints`, `zeroPoints`, `firstPresentMs`, `reading`, `partialCoverage`)
existe **duas vezes**, com o mesmo corpo. Uma mudança de semântica feita só num dos dois lados faz o SSR e a página 2 discordarem, e
nenhum teste compara os dois. **No desenho novo, o `derive` vira uma função pura por indicador**, chamada pelos dois lados.

### 1.4 Por que "multi task é quase impossível" — o número

```bash
git log --no-merges --since=2026-09-01 --format=%h master -- frontend/src | wc -l                                   # 118
git log --no-merges --since=2026-09-01 --format=%h master -- frontend/src/app/symbol/SymbolClient.tsx | wc -l       # 52
```

**44% dos commits de front** desde 2026-09-01 tocaram o mesmo arquivo, que nasceu em 2026-09-08 (`d3bd556`) `[MEDIDO]`. A `SPEC-010
§8.3` precisou da regra *"um editor de `SymbolClient.tsx` por vez"*, e essa regra já é a medida do problema.

---

## 2. `E-2` — O contrato de "indicador"

### 2.1 O que é núcleo e não é indicador

**Núcleo** (`app/symbol/chart/`): a **vela** e o pane 0, que leva a portadora da grade (`ADR-044/D2′(a)`); a `TimeAxis` e o
`AxisSync`; o pager; o host e o registrar; o crosshair e o `LegendFrame`; as marcas de ausência e cobertura; a barra de TF. **Não se
desliga**: sem vela não há grade, e sem grade nenhum indicador sabe onde está o slot `i` (`ADR-044/D2`).

**Indicador** é tudo o que o operador liga e desliga: volume, OI, CVD, liquidação, long/short, e mais tarde SMA, EMA e SMC. A SMC entra
como `category: "strategy"`, no mesmo contrato.

### 2.2 A interface (TypeScript, proposta; nomes finais na `F0`)

```ts
// app/symbol/indicators/contract.ts — imports only from chart/ (core) and the charts barrel.
export type IndicatorKind = "volume" | "oi" | "cvd" | "liquidation" | "long_short" | "sma" | "ema" | "smc";

/** WHERE it draws. A `pane` indicator owns one native pane (index derived from the ACTIVE ordered set);
 *  an `overlay` draws over the price pane (volume today; sma/ema/smc next) and may request a reserved band. */
export type Placement =
  | { readonly kind: "pane"; readonly paneId: string; readonly stretch: number }
  | { readonly kind: "overlay"; readonly on: "price"; readonly band?: OverlayBandRequest };

/** WHAT it needs. Series-history indicators are resolved and fetched by the core (SSR + pager);
 *  endpoint indicators (R-1/R-2) fetch on their own, outside the pager's Promise.all (ADR-048/D5). */
export type DataSource<Params, Data> =
  | {
      readonly from: "series-history";
      readonly series: readonly SeriesRequirement[];            // { slot: string; matches(key, symbol): boolean }
      readonly derive: (rows: SeriesRowsBySlot, ctx: DeriveContext, params: Params) => Data; // PURE — server AND pager
    }
  | {
      readonly from: "indicator-endpoint";
      readonly useData: (ctx: WindowContext, params: Params) => IndicatorDataState<Data>;
    };

export interface IndicatorDefinition<Params, Data> {
  readonly kind: IndicatorKind;
  readonly category: "indicator" | "strategy";
  readonly cardinality: "single" | "multi";                     // builtins + smc: single (RN-16); sma/ema: multi (RF-8)
  readonly defaultParams: Params;
  readonly parseParams: (raw: unknown) => Params | ParamsError;  // the reducer's second wall (SPEC-010 §6.1)
  readonly placement: Placement;
  readonly data: DataSource<Params, Data>;
  /** Renders its layer (own pane) or its legend row (overlay), and declares its series through
   *  `useIndicatorBinding(instanceKey, placement, binding)`. Absence = core `AbsenceNote`, never local copy. */
  readonly View: ComponentType<IndicatorViewProps<Params, Data>>;
}
```

**Os campos do enunciado `E-2`, um a um:**

| campo | onde está | observação |
|---|---|---|
| identidade | `kind`, e `instanceId` na instância (`SPEC-010 §6.1`) | os embutidos têm `params = {}` e `cardinality: "single"`, e o `instanceId` é o próprio `kind` |
| dado | `data` | `series-history`: o núcleo busca. `indicator-endpoint`: o módulo busca (`ADR-048/D5`) |
| onde desenha | `placement` | `pane` (OI, CVD, liquidação, long/short) · `overlay` no preço (volume, SMA, EMA, SMC) |
| legenda | `View`, usando os componentes `chart/legend/*` | o rótulo segue **derivado do catálogo** (`resolvePaneLegend`, invariante (iv)) |
| ausência | `View` + `chart/marks/*` | a política de ausência por `nature` continua do `quant-architect` e mora em `charts` |
| parâmetros | `defaultParams` + `parseParams` | a forma de `IndicatorInstance` é a da `SPEC-010 §6.1`, com `kind` estendido aos embutidos (§8) |

**A faixa reservada do overlay** (`OverlayBandRequest`) existe por causa do único acoplamento real (§1.1). Hoje a vela reserva 22% do
fundo para o volume **mesmo que o volume não exista**. No contrato, o overlay **pede** a faixa, o pane de preço soma os pedidos dos
overlays ativos, e a conta de margem é **geometria, portanto de `charts`** (`ADR-003/FR-2`, junto de `paneScaleMargins`). O efeito na
tela quando o volume está desligado (a vela desce ou não) é decisão do `ui-designer`.

### 2.3 O host: uma espécie de binding, não duas

A `ADR-048/D3` propõe uma **segunda** espécie de binding, a de *overlay*. Este estudo propõe **uma espécie só**, chaveada por string,
com `placement` e `unmount` obrigatório. Os panes fixos de hoje e as médias de amanhã passam pelo mesmo registrar:

```ts
// app/symbol/chart/host/registrar.ts
export interface IndicatorBinding<Handles> {
  readonly mount: (chart: IChartApi, paneIndex: number) => Handles;
  readonly apply: (handles: Handles) => readonly HostSeriesFeed[];   // host keeps the only setData loop (T-01.10)
  readonly unmount: (chart: IChartApi, handles: Handles) => void;    // MANDATORY: removeSeries / detachPrimitive
  readonly measure?: …; readonly scales?: …; readonly layout?: …;     // unchanged from HostedPaneBinding
}
// register(instanceKey, placement, bindingRef) — paneIndex = 0 for overlay:price, else 1 + position of
// placement.paneId among the ACTIVE pane indicators, in catalog order.
```

Custo da unificação: o `register` muda de chave (`number` → `string`), e o `mount` passa a calcular o índice. **Ganho:** o volume
vira o **primeiro overlay real** (na `F8`) e prova o caminho que a SMA vai usar, antes de a `indicadores-smc` precisar dele.

---

## 3. `E-3` — Carregamento por seleção

### 3.1 Catálogo → instâncias → host

```
indicators/catalog.ts            ← o ÚNICO arquivo que importa todas as pastas de indicador
  INDICATOR_CATALOG: readonly IndicatorDefinition[]   (a ordem do array = ordem dos panes, e substitui F1_PANE_ORDER)
indicators/selection/            ← reducer puro + contexto; montado por app/symbol/layout.tsx
  IndicatorInstance[]            (forma SPEC-010 §6.1, kind estendido)
SymbolClient.tsx
  active = catalog ∩ selection   → <ChartHost key={paneSetSignature(active)}> {active.map(i => <i.def.View …/>)}
```

### 3.2 Onde mora a seleção, sobrevivendo ao remonte (`P-1`)

**No mesmo *store* da `ADR-048/D1`**, montado por `app/symbol/layout.tsx`. Ele não é um *store* paralelo: a lista de instâncias passa a
conter também os embutidos. O layout de segmento **não remonta** com `?interval=`, com o símbolo nem com o `kt`: *"On navigation,
layouts preserve state, remain interactive, and do not rerender"* `[DOC: node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43, Next 16.3.4]`.

### 3.3 O que acontece quando a seleção muda

| mudança | mecanismo | por quê |
|---|---|---|
| **o conjunto de panes muda** (OI, CVD, liquidação ou long/short liga ou desliga) | **remonta só o host** (`key={paneSetSignature}` no `<ChartHost>`). O pager e o `AxisSyncProvider` ficam acima e sobrevivem | o mount é o caminho **mais testado** do host (e2e `22`–`25`). `removePane(i)` desloca o índice de todo pane abaixo, e o host teria de re-chavear bindings, âncoras de portal e o `ResizeObserver` com o gráfico vivo, que é o código mais frágil do arquivo (`gates/DIAG-e2e-master.md` §4) |
| **um overlay muda** (volume, SMA, EMA, SMC) | `mount`/`unmount` **no lugar**, sem remontar | o conjunto de panes não muda, nenhum índice se desloca, e é o caso que o F-3 da `ADR-048` já mede |

⚠️ **O remonte do host tem uma condição.** O mount de hoje aplica `store.initialLogicalRange` (o host, no efeito de mount). Num
remonte por seleção, isso **devolveria a vista ao enquadramento inicial**, e o operador perderia o arrasto. O mount tem de ler
`store.currentRange` quando ela existir (`axis-sync.ts:65-67` tem os dois campos). Isso é falsificador da `F9` (`ADR-050` F-4).
**O custo do remonte não está medido** `[NÃO MEDIDO: duração de createChart + setData das séries ativas]`. O instrumento é um
`performance.mark` em volta do mount, publicado em `data-*` como o `data-page-apply-ms`. **O limiar aceitável de piscar é do
`design_gate`, não meu.** Se ele recusar, o caminho é o pane no lugar (`addPane`/`removePane`), já confirmado na biblioteca (§1.2).

### 3.4 Lazy import por indicador: **não**, com número

```bash
cd "$SCRATCH/w/frontend" && npx next build                                  # rc=0, 17 s de relógio
# chunk de cliente da rota /symbol/[symbol] (o único que contém createChart e os testids dos panes):
stat -c%s .next/static/chunks/3w5hergg4s1o6.js; gzip -c … | wc -c           # 270.523 B · 85.169 B gzip
f=node_modules/lightweight-charts/dist/lightweight-charts.production.mjs
stat -c%s $f; gzip -c $f | wc -c                                            # 189.213 B · 60.617 B gzip
node min.mjs   # cada bloco do §1.1: tsc → terser (mangle) → gzip (Apêndice A)
```

| bloco | minificado | gzip |
|---|---:|---:|
| OI | 10.222 | 3.973 |
| liquidação | 9.199 | 3.562 |
| long/short | 8.379 | 3.097 |
| CVD | 3.354 | 1.302 |
| volume | 2.233 | 1.063 |
| **5 indicadores (soma das partes)** | **33.387** | **~13.000** |

O maior indicador é **~4,7% do chunk da rota** (3.973 de 85.169 B gzip). Os cinco juntos dão **~15%**, e a biblioteca de gráfico sozinha
dá **~71%** `[MEDIDO; o gzip por parte não é aditivo, então a soma é teto]`. Adiar o código de um indicador economiza até ~4 KB e
**custa três coisas**:

- **um pedido a mais**, com um quadro de atraso;
- **quebra a ordem de registro do host.** Hoje todo pane se registra **antes** do mount (o efeito de um filho roda antes do efeito do
  pai, como diz o docstring de `useHostedPane`). Um pane que chega tarde cai no caminho de chegada tardia, e esse caminho **não**
  recalcula o número de panes nem os `stretchFactors`;
- **arrisca o invariante "todo `data-fact` no primeiro HTML"** (o docstring do host, item 2), a menos que o carregamento seja com
  `ssr: true`.

**Gatilho para reabrir:** um indicador cujo módulo, sozinho, passe de **20 KB gzip** (uma dependência pesada nova), ou indicadores
desligados que somem **≥ 25%** do chunk da rota. A medida é a mesma receita de `next build` acima.

**Onde "carregar o que está selecionado" economiza de verdade: no fetch, não no bundle.** Hoje cada página de história faz **10
fetches** (`use-history-pager.ts:289-299`), e **6 deles são de indicador** (volume, OI, CVD, 2 de liquidação, long/short; os 4 de
OHLC são do núcleo) `[MEDIDO: leitura do Promise.all]`. Esse corte é a `F10`. Ela depende do *proxy* de mesma origem da `ADR-048/D8`,
porque um indicador ligado depois do SSR precisa buscar do navegador, e hoje isso **não funciona** fora da VPS (a `ADR-048/D8` mede
`http://api:8000` entregue ao navegador).

---

## 4. `E-4` — Árvore de pastas e fronteiras

### 4.1 A árvore-alvo

```
frontend/src/
├── app/symbol/
│   ├── layout.tsx                    F9 · IndicatorSelectionProvider, acima do key (ADR-048/D1)
│   ├── [symbol]/page.tsx             servidor: rota, catálogo; para cada indicador ativo → series + derive (SSR)
│   ├── SymbolClient.tsx              ≤ 350 linhas: compõe chrome + host + active.map(View)
│   ├── chrome/                       TimeframeBar, LiveRow (+ useLiveReadout), ChromeModeStamp, rodapé de atribuição
│   ├── chart/                        NÚCLEO — não é indicador e NÃO importa indicators/**
│   │   ├── host/                     ChartHost.tsx · registrar.ts (IndicatorBinding) · pane-layer.tsx · pane-stack.ts
│   │   ├── legend/                   PaneLegend.tsx · LegendValue.tsx · legend-frame.ts · pane-legend.ts
│   │   ├── marks/                    AbsenceNote.tsx · PartialCoverageMark.tsx · BeyondCoverageBadge.tsx · absence.ts
│   │   ├── price/                    PricePane.tsx · ohlc.ts (vela e pane 0; soma os pedidos de faixa dos overlays)
│   │   ├── axis/                     axis-sync*.ts · supported-timeframes.ts · timeframe-window.ts
│   │   ├── history/                  use-history-pager.ts · history-page-window.ts · request-window.ts · *-client.ts · panel-assembly.ts
│   │   └── data/                     slots.ts · provenance.ts · freshness.ts · coverage.ts (o genérico de view-model.ts)
│   └── indicators/
│       ├── contract.ts               IndicatorDefinition · IndicatorInstance · Placement · DataSource
│       ├── catalog.ts                ÚNICO agregador; a ordem = a ordem dos panes (substitui F1_PANE_ORDER + pane-registry.ts)
│       ├── selection/                reducer.ts (puro, testado sem DOM) · store.tsx · IndicatorSelector.tsx (F11)
│       ├── volume/                   definition.ts · data.ts · VolumeOverlay.tsx · *.test.ts
│       ├── oi/                       definition.ts · data.ts · OiPane.tsx · oi-candle-pane.ts · oi-regime-*.ts · *.test.ts
│       ├── cvd/                      definition.ts · data.ts · CvdPane.tsx · *.test.ts
│       ├── liquidation/              definition.ts · data.ts · LiquidationPane.tsx · liquidation-*.ts · *.test.ts
│       ├── long-short/               definition.ts · data.ts · LongShortPane.tsx · long-short-band.ts · ratio-format.ts · *.test.ts
│       └── (sma/ ema/ smc/)          indicadores-smc — pastas novas, 1 linha em catalog.ts cada
├── charts/                           geometria pura, sem React (ADR-003). Reorganizar por indicador: quant-architect
├── components/ui/                    primitivo de apresentação SEM domínio e SEM gráfico (o diálogo do seletor, se adotado)
└── features/                         módulo de domínio que NÃO toca charts (panel, s1-console, s3-inspector) — inalterado
```

**Por que `app/symbol/indicators/` e não `src/indicators/` nem `features/indicators/`** (medido no §4.3):
- `features/**` não pode importar `charts`, nem o barrel (`P-3`, `ADR-034/D8`).
- **`src/indicators/` fica fora de toda regra de fronteira.** Os blocos `web` do ESLint casam só `src/app/**` e `src/features/**`
  (`eslint.config.mjs:182`), então um indicador ali importaria o `charts` profundo **sem reprovação**. É a mesma classe de quebra do
  `frontend/app/` que o meu prompt de sistema registra.
- O Next não transforma `indicators/` em rota: *"a route is not publicly accessible until a page.js or route.js file is added"*
  `[DOC: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md:225]`. O prefixo `_` de pasta privada (`:259`) é
  dispensável aqui, e as 86 entradas de `app/symbol/` (em `master`, `ls | wc -l`) já ficam ao lado da rota sem ele.

**Idioma** (`CLAUDE.md`, linhas 3 e 4 da tabela): os diretórios e arquivos ficam em inglês, com `long-short/` em kebab-case. O
`paneId`/`kind` continua `long_short`, porque é chave de `data-testid` e de e2e. O rótulo visível fica em pt-BR, dentro do `View`.

### 4.2 Regras de dependência

| de \ para | `chart/**` | `chrome/**` | `indicators/contract.ts` | `indicators/<a>/**` (o próprio) | `indicators/<b>/**` (outro) | `catalog.ts`, `selection/**` | barrel de `charts` |
|---|---|---|---|---|---|---|---|
| `indicators/<a>/**` | ✅ | ❌ | ✅ | ✅ | **❌** | ❌ (evita ciclo) | ✅ (`ADR-034/D8`, herdado) |
| `chart/**`, `chrome/**` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `catalog.ts` | ✅ | — | ✅ | ✅ (todos) | ✅ (todos) | — | — |
| `SymbolClient.tsx`, `page.tsx`, `layout.tsx` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |

**Regra prática:** se dois indicadores precisam da mesma coisa, ela é **núcleo** (`chart/…`, com nome) ou é **geometria**
(`charts/`). **Não existe `indicators/_shared/`.** Uma pasta compartilhada sem dono vira o próximo `SymbolClient.tsx`.

### 4.3 O ESLint: o que já morde, o que não morde, e a regra nova

Três sondas, plantadas e apagadas numa cópia da wave `[MEDIDO 2026-10-02: npx eslint -f json <3 arquivos>, rc=1]`:

| sonda | resultado | leitura |
|---|---|---|
| `src/app/symbol/indicators/cvd/probe-deep.ts` importa `../../../../charts/s2-panels.ts` | **morde** (`no-restricted-imports`) | o subdiretório herda a exceção do barrel (`ADR-034/D8`) e a proibição do `charts` profundo |
| `src/app/symbol/indicators/oi/probe-cross.ts` importa `../cvd/probe-deep.ts` | **cala**, nenhuma regra | **nada impede um indicador de importar outro** |
| `src/indicators/probe.ts` importa `../charts/s2-panels.ts` | **cala**, nenhuma regra | **um diretório novo no topo de `src/` escapa da fronteira `ADR-003/FR-2`** |

**A regra nova é uma regra local, `local/indicator-isolation`, e não `no-restricted-imports`.** São dois motivos:
1. O `no-restricted-imports` casa a **string literal** do import (padrão gitignore), e não o caminho resolvido. `../cvd/x`,
   `../../indicators/cvd/x` e um alias futuro são três grafias do mesmo crime, e um padrão `../*/**` também casa `../../chart/…`.
2. **No flat config, o último bloco que casa arquivo e regra substitui as opções** (`eslint.config.mjs:242`, citando a `ADR-034/D8`).
   Um bloco novo de `no-restricted-imports` para `indicators/**` **apagaria em silêncio** os padrões do barrel naquela pasta.

A regra resolve o caminho de cada `import`, `export … from`, `import()` e `require` e aplica a tabela do §4.2. O precedente é
`local/use-client-fingerprint-boundary` (`eslint-rules/`). **Junto dela, entra um teste de cobertura:** todo diretório de topo de
`src/` tem de estar em `{app, charts, components, features}`. O teste morde ao plantar `src/indicators/x.ts`, e cala na árvore real.

---

## 5. `E-5` — Plano de migração em fatias

**A disciplina de toda fatia de movimento é mover como está.** O texto do código movido não muda: só entram `export`, as linhas de
`import` e o caminho que os testes leem. Assim, os testes que leem o fonte (§6) continuam casando, e o que mudou fica visível. **O
falsificador da disciplina é o invariante das linhas movidas**, rodado em cada PR:

```bash
# o multiconjunto de linhas de código (sem import/export) se conserva entre a base e a fatia
norm(){ grep -vhE '^\s*(import |\} from |export \{)' "$@" | sed -E 's/^export (default )?//' | sort; }
diff <(git show "$BASE":frontend/src/app/symbol/SymbolClient.tsx | norm -) <(norm frontend/src/app/symbol/SymbolClient.tsx <arquivos novos>)
# deve ficar vazio nas fatias de movimento (F1, F4–F7); F2/F3/F8–F11 declaram o diff
```

**O portão de toda fatia é o mesmo: `make verify`**, que inclui o `make e2e` inteiro (39 specs, 32 delas na rota `/symbol`, 82
`test(` nessas 32) `[MEDIDO: ls e2e/*.spec.ts; grep -c '^\s*test(' 08..39]`. A coluna "e2e que mais mede" diz qual spec cai primeiro se
a fatia errar. **Nenhuma fatia muda a tela enquanto a seleção padrão for "todos ligados"**, e o `e2e/23` prende a lista de camadas na
ordem atual.

| # | fatia | tamanho `[INFERRED: §1.1, por bloco]` | e2e que mais mede | depende de | paralelo com |
|---|---|---|---|---|---|
| **F0** | **trilhos:** `contract.ts` (tipos), `local/indicator-isolation` + sonda morde/cala, teste de diretório de topo, **alargar os 2 varredores** (§6.2) | ~350 novas, ~30 mudadas | — (lint e unitário) | nada | **com a fase `05`, já**: não toca arquivo da wave `[MEDIDO: git diff --stat master...wave/paineis-f05]` |
| **F1** | núcleo para fora: host, registrar, `PaneLayer`, legenda e marcas para `chart/`; `TimeframeBar`, `LiveRow` e `ChromeModeStamp` para `chrome/` | ~1.240 movidas, ≤ 60 mudadas | 22, 23, 24, 25, 16 | F0 **e fase `05` em `origin/master`** | nada (núcleo) |
| **F2** | registrar por chave + `unmount` obrigatório + índice derivado do conjunto ativo + `placement` (absorve a `ADR-048/D3`) | ~150–250 mudadas | 22, 23, 24, 31, 32 | F1 | nada |
| **F3** | dado por tabela: `page.tsx`, o pager e `panel-assembly.ts` iteram `series`+`derive` por indicador; chaves e linhas viram `Record` (os mesmos 10 fetches) | ~200–300 mudadas | 18, 20, 21, 22, 26, 39 | F2 | nada |
| **F4** | **CVD (piloto)**: pane, constantes, `data.ts` (de `view-model.ts`), `derive` (une `page.tsx` e `panel-assembly.ts`), `definition.ts` | ~255 + 131 movidas | 10, 23, 24, 35 | F3 | nada (valida o molde) |
| **F5** | OI, mais `oi-candle-pane.ts` e `oi-regime-*` | ~649 + 161 + 709 em arquivo | 12, 19, 36, 37, 38 | F4 | F6, F7, F8 (até 3) |
| **F6** | liquidação, mais `liquidation-pane-form.ts` e `liquidation-legend-swatch.ts` | ~705 + 58 + 137 em arquivo | 13, 31, 32, 33, 34, 35 | F4 | F5, F7, F8 |
| **F7** | long/short, mais `long-short-band.ts` e `ratio-format.ts` | ~709 + 75 + 206 em arquivo | 14, 21, 35 | F4 | F5, F6, F8 |
| **F8** | **volume vira overlay do preço** (sai do binding do `PricePane`) + `PricePane` vai para `chart/price/` + faixa reservada por pedido (geometria em `charts`) | ~243 + 237, e ~100 mudadas | 09, 15, 28, 29, 30, 08 | F4 | F5–F7. **É a única das quatro que edita o núcleo** |
| **F9** | seleção: `layout.tsx` + reducer + `catalog.ts`, com o render guiado pelo catálogo, remonte do host por conjunto de panes e **faixa preservada**. Padrão: todos ligados | ~300 novas | **spec nova**: desliga e religa OI (contagem de panes, lista de camadas, vista mantida); 22, 23, 24 | F5–F8 | nada |
| **F10** | fetch por seleção: o pager pede só as séries dos ativos, e o indicador religado busca a janela já carregada | ~150 mudadas | spec nova (pedidos por página = séries ativas; todos ligados = 10); 20, 22 | F9 **e `ADR-048/D8` (proxy)** | F11 |
| **F11** | seletor (tela A) com os embutidos | — | spec do seletor | F9 **+ `ui-designer` + `ux-ui-mastery`** | F10 · ver `O-2` |

**Ordem frente às duas outras frentes:**
- **`wave/paineis-f05`:** ela toca **47 arquivos do front** (+1.640/−287), entre eles `SymbolClient.tsx` (+62/−25), `page.tsx`
  (+29/−20), `use-history-pager.ts` (+31/−20) e `panel-assembly.ts` (+32/−11) `[MEDIDO: git diff --numstat master...wave/paineis-f05
  -- frontend]`. O `tasks.toml` da wave ainda marca as 5 tasks da fase como `todo`. **Só a F0 corre antes.** Da F1 em diante, a regra é a da
  `SPEC-010 §8.1`: fase `05` mergeada em `origin/master`.
- **`indicadores-smc`:** o front dela (seletor, SMA, EMA, SMC) começa **depois da F9**, quando o *store*, o catálogo e o caminho de
  overlay (provado pelo volume na F8) já existem. A parte `charts` dela (projeção, geometria, primitiva) e o backend **podem começar
  já**, como a `SPEC-010 §8.2` já diz.

**Paralelismo depois do núcleo:** F5, F6, F7 e F8 correm **no máximo 3 por vez** (o teto de orquestração reconfirmado em 2026-09-24).
O conflito que sobra entre elas é **uma linha cada em `catalog.ts`** e a remoção de blocos disjuntos de `SymbolClient.tsx`, que o
`git` funde sozinho.

**Estado final medível:** `SymbolClient.tsx` ≤ **350 linhas**, contra 4.527 hoje (`wc -l`). Nenhum `indicators/<a>/` importa
`indicators/<b>/`, e quem prova é a regra `local/indicator-isolation` no `make lint-frontend`. `catalog.ts` é o único importador das
pastas de indicador, e um `grep` prova.

---

## 6. `E-6` — O que acontece com os testes

### 6.1 O universo

```bash
cd frontend/src/app/symbol   # (wave)
ls *.test.ts | wc -l                                                          # 55 arquivos
grep -c '^\s*\(test\|it\)(' *.test.ts | awk -F: '{s+=$2} END {print s}'        # 533 casos
# os que leem o FONTE de SymbolClient.tsx em código (não só em comentário):
for f in $(grep -l 'SymbolClient.tsx' *.test.ts); do grep -vE '^\s*(\*|//|/\*\*)' $f | grep -q 'SymbolClient.tsx' && echo $f; done | wc -l   # 26
grep -l 'page.tsx' *.test.ts | wc -l                                          # 16 leem o fonte de page.tsx
```

O `test:app` roda `'src/app/**/*.test.ts'`, e **um teste numa subpasta roda** `[MEDIDO: sonda em indicators/cvd/nested-probe.test.ts
→ "tests 1, pass 1"]`. Mudar o teste de pasta não o tira do portão.

### 6.2 Quem quebra, e por quê

| classe | n | quebra por | o que a fatia faz |
|---|---:|---|---|
| **leem o fonte de `SymbolClient.tsx`**, por regex sobre o texto | **26 arquivos, 258 casos** | **caminho** (o `readFileSync` aponta para o arquivo velho) | muda o caminho para o arquivo novo **na mesma fatia que move o bloco**. Com movimento sem edição, a regex casa igual |
| … por dono: núcleo 10 · volume 5 · preço 3 · OI 3 · liquidação 2 · long/short 2 · CVD 1 | | | o teste muda para a pasta do dono (`indicators/oi/oi-pane-dom-contract.test.ts` lê `./OiPane.tsx`) |
| citam `SymbolClient.tsx` **só em comentário** | 5 | nada | nada |
| **leem o fonte de `page.tsx`** (ex.: `PAGE_OI_SELECTOR` casa `resolveCatalogEntry(catalog, routeSymbol, (entry) => matchesBinanceOpenInterest(entry.key))`) | 16 | **texto**: na F3/F4–F8, o predicado sai de `page.tsx` e vai para `definition.series` | a regex vira **teste de valor**: o `definition.series` do OI casa a chave do catálogo e recusa as vizinhas. Fica mais forte que a regex |
| **testes de módulo puro** (`panel-assembly`, `pane-registry`, `oi-candle-pane`, `request-window`…) | o resto dos 55 | **caminho** de import quando o módulo muda de pasta; **forma** em `panel-assembly.test` (F3: `Record` por slot) e em `pane-registry.test` (F9: ordem do catálogo) | repontar o import; reescrever só as asserções de forma, e declarar isso na PR |

**⛔ Os dois testes que perderiam o universo EM SILÊNCIO, e por isso são a F0, antes de qualquer movimento.** É a lição da memória
*"aperte o portão ANTES de escrever o que ele deveria pegar"*:

| teste | universo de hoje | o que o movimento faz | correção (F0) |
|---|---|---|---|
| `bucket-arithmetic-boundary.test.ts` | `readdirSync(SYMBOL_DIR)` **sem recursão** (`:40`) | um arquivo movido para `indicators/oi/` **sai do universo**, e o teste continua verde sem olhar para ele. Medido: a linha `Math.floor(ms / step) * step` plantada na raiz é acusada; plantada só em `indicators/oi/probe.ts`, o resultado é `pass 5, fail 0` `[MEDIDO 2026-10-02, cópia da wave]` | varrer `app/symbol/**` com recursão, e provar com uma sonda em subpasta que ele morde |
| `data-fact-ascii-key-contract.test.ts` | só `SymbolClient.tsx`, e prende **47** `data-fact` (`:99`) | a contagem cai a cada fatia. O teste fica vermelho, e "corrigir o número" seria silenciá-lo | ler a árvore `app/symbol/**` (sem teste) e manter **47** como total da rota. A contagem passa a provar que nenhum fato se perdeu na mudança |

O `chart-construction.test.ts` já varre `frontend/src` com recursão (`:60-73`, *"a pane added in a directory that does not exist yet
is exactly the case this file is for"*) e não precisa de mudança.

---

## 7. O que este estudo NÃO resolve

- **O custo do remonte do host** está `[NÃO MEDIDO]` (§3.3). Fica medido na F9, com instrumento já nomeado. O limiar é do
  `design_gate`.
- **A reorganização de `src/charts/`** (71 arquivos planos, prefixo `s2-`) é do `quant-architect`. O contrato aqui só exige que a
  geometria por indicador saia pelo barrel.
- **`LiveRow`** (preço, OI, CVD ao vivo) fica no `chrome/` como está. O SSE não tem produtor (`ADR-048/D6`), e torná-lo
  por indicador antes de existir dado seria desenhar no escuro.
- **A aparência do seletor e o "piscar" do remonte** são do `ui-designer` e do `ux-ui-mastery`.

---

## 8. Proposta de emenda à `ADR-048` e à `SPEC-010` (não editadas; o `/architect` de `indicadores-smc` consolida)

| onde | hoje | proposta | por quê |
|---|---|---|---|
| `ADR-048/D1` | *store* de instâncias SMA/EMA/SMC em `app/symbol/layout.tsx` | **mantém**, e a lista passa a conter também os embutidos (`kind` estendido) | um *store* só para tudo que o seletor liga e desliga |
| `ADR-048/D3` | "segunda espécie de binding", de overlay, em `chart-host-overlay.ts` | **uma espécie só** (`IndicatorBinding` com `placement` e `unmount` obrigatório), em `chart/host/registrar.ts`, entregue pela F2 | os panes fixos e as médias passam pelo mesmo caminho, e o volume o prova antes (F8) |
| `ADR-048`, Consequências | *"`SymbolClient.tsx` muda ~60–80 linhas na F1"* | **0 linha** em `SymbolClient.tsx`. Cada indicador novo é uma pasta mais 1 linha em `catalog.ts` | o arquivo deixa de ser o ponto de costura |
| `SPEC-010 §8.1` | front só depois da fase `05` mergeada | front só depois da **F9 de `estrutura-do-front`** mergeada (que já exige a fase `05`) | a F9 entrega o *store*, o catálogo e o overlay |
| `SPEC-010 §8.3` | *"um editor de `SymbolClient.tsx` por vez"* | *"um editor de `chart/**` (núcleo) por vez; pastas de indicador em paralelo, até 3"* | o gargalo muda de arquivo para camada |
| `SPEC-010 §8.4` | orçamento de ~60–80 linhas em `SymbolClient.tsx` | orçamento de **0** em `SymbolClient.tsx` e de **0** em `chart/**` depois da F1 de `indicadores-smc` | — |
| `SPEC-010 §6.1` | `kind ∈ {sma, ema, smc}` | `kind ∈ {volume, oi, cvd, liquidation, long_short, sma, ema, smc}`, com `params = {}` nos embutidos | ⚠️ **aberto, e não é meu**: se o **corpo hasheado** do `indicator_set` (`ADR-047`) inclui a visibilidade dos embutidos. Incluir muda o `setup_hash` de um conjunto ao desligar o OI. O dono é quem responde pela `ADR-047`, no gate da `SPEC-010` |

---

## 9. Decisões do owner (menu, com o custo de cada opção)

**`O-1` — o que vem ligado na primeira visita** (o handoff §5 marca como decisão do owner):

| opção | custo |
|---|---|
| **(a) os 5 ligados, como hoje** | nenhuma mudança de tela nem de e2e. Não economiza fetch por padrão: a F10 só economiza quando o operador desliga |
| (b) só preço e volume; o resto, o operador liga | a primeira carga cai de 10 para 5 fetches de história (4 de OHLC + volume) `[INFERRED: §3.4]`. As 32 specs de `/symbol` precisam ligar o pane que medem, e o `e2e/23` muda de lista. O operador perde a visão de conjunto ao abrir |
| (c) a última seleção, persistida | `localStorage` seria uma **terceira fonte de verdade** (a `ADR-048` já recusa); persistida no servidor, ela **é** o conjunto ativo da F3 de `indicadores-smc` (`R-7`) e espera essa fase |

Recomendação técnica: **(a) durante a migração, seja qual for a escolha final.** Ela é a condição de "tela idêntica" das F1–F9. Trocar
depois é mudar **uma constante** (o *seed* do reducer).

**`O-2` — onde o seletor nasce:**

| opção | custo |
|---|---|
| **(a) F11 desta feature, só com os embutidos** | precisa de `ui-designer` + gate sobre a tela A (desenhada para `indicadores-smc`, `UI-DESIGNER-proposta §3`). O owner ganha o seletor antes das médias |
| (b) F1 de `indicadores-smc`, junto da SMA | sem retrabalho de tela, porque ela já foi desenhada com SMA/EMA. Até lá, ligar e desligar os embutidos não tem UI, e a F9 só serve à arquitetura |

---

## Apêndice A — os comandos inteiros

```python
# inv.py — inventário por responsabilidade (§1.1). Uso: python3 inv.py <SymbolClient.tsx> [x]
import re,sys
src=open(sys.argv[1]).read().split('\n')
decl=re.compile(r'^(export )?(default )?(async )?(function|const|type|interface|class|let|enum) ([A-Za-z0-9_]+)')
starts=[]
for i,l in enumerate(src):
    m=decl.match(l)
    if m:
        j=i
        while j>0 and src[j-1].startswith(('/**',' *',' */','//')): j-=1
        starts.append((j,i,m.group(5)))
rules=[('indicator:long_short',r'LongShort|LONG_SHORT|nativeGridSuffix|RecentBand'),
 ('indicator:liquidation',r'Liquidation|LIQUIDATION|liquidation'),('indicator:cvd',r'Cvd|CVD'),
 ('indicator:oi',r'^isOi|^Oi|OI_|^mountedOi|^serverOi|OiPane|measuredLegendBottomPx|PlacedOiRegime|NO_PLACED_OI|formatSpan'),
 ('indicator:volume',r'Volume|VOLUME|ReadableHorizon$|ABSENCE_MARK|ZERO_MARK'),('core:price',r'Price|PRICE'),
 ('core:legend0',r'^PaneLegend|^PaneDetails'),
 ('core:host',r'PANE_|Pane[A-Z]|HostSeries|feedSeries|GRID_CARRIER|HostedPane|PaneLayout|AnyPaneBinding|PaneRegistrar|HostRegistrar|ChartHost|PaneAnchors|useChartHost|paneIndexOfId|useHostedPane|paneLayerAnchorOf|hideChartGraphics|legendBottomPx|PaneLayer|CHART_HOST|SymbolChartHost|CHART_HEIGHT'),
 ('core:legend',r'Legend|Crosshair|identityTerms|noCrosshair|NO_CROSSHAIR'),
 ('core:marks',r'Absence|ABSENCE|PartialCoverage|BeyondCoverage|formatUtcMinute|subscribeToNothing'),
 ('page:chrome',r'PAGE_GUTTER|ChromeModeStamp|useLiveReadout|LiveRow|TimeframeBar|lastInstantMs|SymbolClient')]
cat={}
for k,(s,d,name) in enumerate(starts):
    e=starts[k+1][0] if k+1<len(starts) else len(src)
    c=next((cn for cn,rx in rules if re.search(rx,name)),'indicator:volume' if name=='VolumeSlot' else 'other')
    cat[c]=cat.get(c,0)+(e-s)
    if len(sys.argv)>2: print(s+1,e,name,c)
print('header+imports',starts[0][0])
for c,v in sorted(cat.items(),key=lambda x:-x[1]): print(f'{v:5d} {c}')
# resultado na wave 4b255da: long_short 709 · liquidation 705 · host 659 · oi 649 · chrome 518 · cvd 255 ·
# volume 243 · price 237 · marks 180 · legend 124+40 · other 0 · header 209 · total 4528 (= wc -l + a linha final)
```

```python
# acoplamento cruzado SEM comentário (§1.1): parts.json = {categoria: texto} montado com as linhas do inv.py x
import json,re
p=json.load(open('parts.json'))
strip=lambda s: re.sub(r'//.*','',re.sub(r'/\*[\s\S]*?\*/','',s))
inds=[k for k in p if k.startswith('indicator:')]+['core:price']
names={k:set(re.findall(r'^(?:export )?(?:function|const|interface|type|let) ([A-Za-z0-9_]+)',p[k],re.M)) for k in inds}
for a in inds:
    for b in inds:
        if a!=b and (h:=sorted(x for x in names[b] if re.search(r'\b'+x+r'\b',strip(p[a])))): print(a,'->',b,h)
# → oi/liquidation/long_short -> volume ['VolumeSlot'] · long_short -> oi ['formatSpan'] · price -> volume (12 símbolos)
```

```js
// min.mjs — tamanho minificado/gzip por bloco (§3.4). Usa typescript + o terser que o Next embarca.
import fs from 'node:fs'; import zlib from 'node:zlib';
const root='./w/frontend/node_modules/';
const ts=(await import(root+'typescript/lib/typescript.js')).default;
const terser=await import(root+'next/dist/compiled/terser/bundle.min.js'); const minify=(terser.minify||terser.default.minify);
for (const [k,v] of Object.entries(JSON.parse(fs.readFileSync('parts.json','utf8')))) {
  const js=ts.transpileModule(v,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const r=await minify(js,{compress:false,mangle:true,module:true});
  console.log(Buffer.byteLength(r.code), zlib.gzipSync(r.code).length, k);
}
```

```bash
# duplicação page.tsx × panel-assembly.ts (§1.3)
norm(){ grep -vE '^\s*(//|\*|/\*\*)' "$1" | sed -E 's/^\s+//; s/routeWindow\.window/W/g; s/s2Window/W/g;
  s/rows_|rows\.[a-zA-Z]+|[a-zA-Z]+Result\.rows/R/g; s/lastAxisInstantMs|readingInstantMs/T/g' | awk 'length>25' | sort -u; }
comm -12 <(norm '[symbol]/page.tsx') <(norm panel-assembly.ts) | wc -l        # 39

# sondas de ESLint (§4.3), numa cópia da wave, apagadas depois
mkdir -p src/indicators src/app/symbol/indicators/{cvd,oi}
echo 'import { buildCvdPanel } from "../charts/s2-panels.ts"; export const x = buildCvdPanel;' > src/indicators/probe.ts
echo 'import { buildCvdPanel } from "../../../../charts/s2-panels.ts"; export const x = buildCvdPanel;' > src/app/symbol/indicators/cvd/probe-deep.ts
echo 'import { x } from "../cvd/probe-deep.ts"; export const y = x;' > src/app/symbol/indicators/oi/probe-cross.ts
npx eslint -f json src/indicators/probe.ts src/app/symbol/indicators/cvd/probe-deep.ts src/app/symbol/indicators/oi/probe-cross.ts
# → rc=1; probe-deep: no-restricted-imports; probe-cross: (nenhuma); src/indicators/probe: (nenhuma)
```
