# ADR-044 — Um gráfico com panes nativos v5: a legenda lê o slot, não o `seriesData`, e a perna long desce por escala invertida, não por sinal

**Data:** 2026-09-23 · **Status:** proposta · **SPEC:** [`SPEC-009`](../specs/SPEC-009-paineis-de-fluxo.md) §3, §4, §7
**Componente alvo:** `web` · `charts` · **Fases:** `01` (D1–D3), `04` (D4)
**Julgamento delegado citado:** [`ARQ-1-julgamento-frontend-architect.md`](../context/paineis-de-fluxo/handoff/ARQ-1-julgamento-frontend-architect.md)
(`frontend-architect`, e um segundo `frontend-architect` independente chegou ao mesmo veredito, segundo o despacho do orquestrador `[DOC: mensagem do orquestrador, 2026-09-23]`) · [`LIQ-1-julgamento-quant-architect.md`](../context/paineis-de-fluxo/handoff/LIQ-1-julgamento-quant-architect.md) (`quant-architect`, só em D4)
**Amenda:** a postura de 6 `createChart` + `axis-sync` com fan-out de `SPEC-008` §6 (`D4`). **Não** amenda `ADR-003`, `ADR-026` nem `ADR-040`.

---

## Contexto

O `/symbol/[symbol]` tem hoje **seis** instâncias de `createChart`: um ponto de construção
(`SymbolClient.tsx:562`), montado por 5 funções de pane, sendo que `LiquidationPane` monta 2× (`:1155`,
`:1399`, `:1522`, `:1887`, `:2385`) `[MEDIDO 2026-09-23: grep -n 'createChart\|function .*Pane(' SymbolClient.tsx]`.
Há **11** `addSeries`, não 10 como diz o `PRD-009` M7 (`ARQ-1` C-1/C-2) `[MEDIDO 2026-09-23: grep -c 'addSeries(' → 11]`.
A `lightweight-charts` instalada é a **5.2.1** e expõe `addPane`, `addSeries(def, opts, paneIndex)`,
`IPaneApi.getHTMLElement`, `setStretchFactor` e `PriceScaleOptions.invertScale`
(`dist/typings.d.ts:1640, 1773-1792, 2019-2025, 3706-3726`) `[MEDIDO: ARQ-1 §1.1, leitura do pacote instalado]`.

## D1 — `S-1`: **um** `createChart`, panes nativos. `axis-sync` fica com `panelCount = 1`

**Decisão.** O gráfico do símbolo é **uma** instância de `createChart` com um pane por métrica, na ordem
do *pane registry* (`SPEC-009` §5). A store de `axis-sync` **não é apagada**: ela passa a rodar com
`panelCount = 1` (`axis-sync.ts:173-180` só rejeita `<= 0`). Com isso o `initialLogicalRange`, a guarda
`holdApplying` do `T-05-FIX` (`SymbolClient.tsx:583-587`) e o `onCandidateRange` que alimenta o pager da
história sob demanda (`axis-sync.ts:163-170, 219-222`) continuam funcionando. O que sai é o fan-out: os
seis índices `axis-sync.ts:40-46` e `PANEL_COUNT = 6`.

**O argumento que decide.** Com `S-2` não se consegue cumprir o `CA-1` do `PRD-009`: *"reverter para 6
`createChart` ⇒ reprova"* (`PRD-009:242`). Seis `createChart` **são** o `S-2`, então escolhê-lo exigiria
reescrever o critério de aceite. O fonte da biblioteca mostra ainda duas coisas: a linha vertical do
crosshair é pintada em todo pane (`DEV:667-668`), e por isso o `RF-3` sai por construção; e o
`seriesData` do evento percorre **todas** as séries do modelo (`DEV:11264-11274`) `[MEDIDO por leitura do fonte, ARQ-1 §1.1]`.

### Alternativas recusadas, com o custo

| alternativa | custo | por que cai |
|---|---|---|
| **`S-2`** — 6 charts estilizados, crosshair sincronizado à mão | seis escalas de preço de larguras diferentes e sem `minimumWidth` (`chart-options.ts:40-53`), ou seja, seis origens de x; um segundo despachante com guarda de reentrância; `setCrosshairPosition` exige preço, e num slot *whitespace* não há preço (94,7% dos slots de liquidação, `SymbolClient.tsx:1884`); o `RF-2` só se cumpre **escondendo** eixos | reescreve o `CA-1`, e o risco de desalinhamento continua existindo `[INFERRED: aritmética de layout, NÃO MEDIDO em pixel]` |
| **`S-1` sem store** — apagar `axis-sync` inteiro | perde a guarda de eco do `T-05-FIX` e a semente do pager, e reabre um defeito que já foi fechado com 3 rodadas de fix `[DOC: docs/INDEX.md, entrada de 2026-09-23 da fase 05]` | regressão em superfície aprovada |
| **dependência nova de gráfico** | fere o `RNF-1` | nada na 5.2.1 falta |

**O custo de `D1`, declarado:** reescrever ~**811** linhas de `SymbolClient.tsx` (hook `:510-640`, panes
`:1155-1940, 2385-2562`, montagem `:2904-2925`) `[MEDIDO: ARQ-1 §8]`. Cerca de **7 de 56** testes dos 5
`*-pane-dom-contract.test.ts` estão acoplados à construção e morrem, renascendo como invariantes do
registry `[MEDIDO por heurística: ARQ-1 §6]`. As bandas de marca presas a `CHART_HEIGHT_PX = 220`
(`:508, 868, 970`) passam a ser ancoradas em `IPaneApi.getHeight()`.

## D2 — A legenda lê `param.logical` contra os slots do view-model, **nunca** o `seriesData`

**Decisão.** O valor da legenda de cada pane (`RF-4`) é resolvido a partir de `param.logical` sobre os
slots da grade canônica, usando a mesma função de leitura por `nature` que o "Leitura atual" de cada pane
já usa (`resolveStockReading`, `charts/s2-absence-policy.ts`). Se `param.logical === undefined`, vale o
último bucket fechado.

**Por que não `seriesData`** `[MEDIDO por leitura do fonte: ARQ-1 §4]`:
(1) num slot *whitespace* a série some do `Map`, e "sem ponto" fica indistinguível de "série não montada";
(2) as séries de marca aparecem no `Map` com a **altura em px** como valor, e uma legenda sem filtro
mostraria `6` (`LIQUIDATION_ZERO_MARK_PX`, `:989`) como se fosse liquidação;
(3) o `seriesData` não conhece o *held* de `STOCK`.

**A invariante que D2 exige**, que é a mesma que torna `D1` seguro: **toda série de todo pane chama
`setData` exatamente com os `time` da grade canônica.** Um `time` fora da grade insere um índice lógico
novo em **todos** os panes (`ARQ-1` §2). Com `S-1` essa violação deixa de ser local, por isso ela passa
a ser invariante testada do registry.

## D3 — `RN-4` passa a ser propriedade do registry

Toda série `FLOW` do registry declara o par `absence_mark` + `zero_mark`. O teste do registry reprova
quando o par falta. Com isso a fusão da fase `04` não consegue "esquecer" a marca (`ARQ-1` §5, invariante iii).

### ⛔ Emenda D3′ (2026-09-23): a invariante (iii) é estreitada ao `kind`, e o CVD não ganha marca

**O defeito medido.** A (iii), como escrita acima, recusa o pane de CVD de hoje: duas linhas `FLOW` (delta
e acumulado), sem marcas. O teste da `T-01.2` mede **4 violações**, 2 séries × 2 marcas
(`frontend/src/app/symbol/pane-registry.test.ts:240-250`, em `7f524ad`) `[MEDIDO]`. As duas saídas eram
pôr marcas no CVD ou estreitar a (iii).

**Decisão: estreitar.** O par de marcas existe porque **uma barra de altura zero não se distingue de
barra nenhuma**, e o próprio registry escreve isso (`pane-registry.ts:73`: *"which a bar of height zero
cannot tell apart"*). Numa **linha** alimentada pelo adapter *lossless* (`lineSeriesLossless`,
`charts/index.ts:124`), o problema não existe: o bucket ausente é *whitespace* e **interrompe a linha**,
enquanto o zero legítimo é um ponto **no nível 0**. Os dois já são geometrias diferentes, sem marca.
Pôr marcas no CVD **mudaria a forma dele**, o que o `NG-5` proíbe.

**A (iii′), normativa:**
- **(iii-a)** toda série de dado `FLOW` com `kind = histogram` tem o par `absence_mark` + `zero_mark`
  para o **mesmo** `series_key_id` (é a (iii) original, restrita ao `kind` em que ela morde);
- **(iii-b)** toda série de dado `FLOW` com `kind = line` é alimentada **pelo adapter lossless**
  (ausência = *whitespace*, nunca `0`, nunca valor carregado). O registry declara isso no `slots_ref`, e
  quem reprova é o teste do adapter, porque o registry não enxerga o dado;
- `kind = candlestick` `FLOW` não existe hoje. Se aparecer, é **falha alta** até ser classificado (o mesmo
  princípio de `UncoveredReductionPairError`).

**O ajuste que a `T-01.5` precisa fazer** (em `pane-registry.ts` e `.test.ts`, onde a `T-01.2` deixou):
1. a (iii) só dispara quando `series.kind === "histogram"`;
2. o teste *"(iii) FAILS: today's CVD pane … is refused"* (`:240`) vira **PASSES** e continua medindo
   o mesmo registro, com as duas linhas `FLOW` e nenhuma marca, agora **aceitas**;
3. entra um teste **(iii-a) FAILS** que troca o `kind` do CVD para `histogram`, mantém as linhas sem marca
   e espera **4** violações. É ele que prova que o estreitamento não desligou a (iii);
4. os testes existentes de volume e de marca de outra série (`:208-238`) continuam reprovando como hoje.

**Falsificador de D3′.** Um bucket de CVD **presente e isolado** (os dois vizinhos ausentes) tem de
desenhar ≥ 1 pixel no canvas. Se desenhar zero pixel, a linha lossless **não** separa *"presente
isolado"* de *"ausente"*, a (iii-b) cai, e a correção (marcador de ponto, `pointMarkersVisible`, ou a
marca) volta ao `/architect` + `design_gate` `[NÃO SEI: comportamento da LineSeries v5 com ponto único
entre whitespaces; medir na T-01.5]`.

## D4 — Liquidação num pane: a perna long **desce por escala invertida**, o dado **nunca é negado**

**O conflito entre os dois julgamentos.** O `quant-architect` propõe desenhar a perna long como `−v`
(convenção do indicador da Coinalyze: `return[a,i?s:-1*s]`, `LIQ-1` Fonte 1). O `frontend-architect`
mediu que o pane de liquidação é **logarítmico** (`SymbolClient.tsx:1810-1813`). Log não representa
negativo, então ele propõe duas escalas sobrepostas, com `invertScale: true` na de baixo (`TD:3726`).

**Decisão: a de duas escalas.** A perna `cohort=short` fica numa escala da metade superior e a perna
`cohort=long` numa escala da metade inferior com `invertScale: true`. **Os dois valores entram no gráfico
como magnitudes `≥ 0`.**

**Por que esta, e não a negação:**
1. **Ela torna a regra 4 do `quant-architect` estrutural.** A regra diz *"nenhum valor derivado de
   `short + (−long)` pode chegar à tela"* (`LIQ-1` §Critério, item 4). Se nenhum número negativo existe
   no caminho do dado, a soma com sinal nem é expressável. Com negação, a regra vira disciplina; com
   escala invertida, vira propriedade. O `RN-3` sai ganhando.
2. **A escolha log × linear continua com o `design_gate`.** A negação obriga a escala linear, e isso
   decidiria por fora uma questão que é do gate (`CLAUDE.md` §Design). A escala invertida funciona nas
   duas.
3. **Cada perna mantém o próprio par de marcas** (`ARQ-1` §3.3). São 6 séries e 4 escalas no pane, e o
   argumento de hoje, *"a distinção entre coortes não depende de matiz (WCAG 1.4.1)"* (`:1881-1884`),
   passa a ser atendido pela posição.

**O que D4 herda do `quant-architect` sem mudar nada:** o lado e a cor por perna (short em cima com o
token de alta, long embaixo com o token de baixa; convenção Coinalyze, `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`, sendo a TradingView
Markets a recusada; `SPEC-009` §7.1)
e a legenda mostrando **as duas magnitudes, sem sinal de menos**, com numeral neutro e quadrado de 8px na forma e na cor da perna (`design_gate`, ver abaixo) (`LIQ-1` Fonte 2: o tooltip da própria
Coinalyze usa `Math.abs`).

**Alternativa recusada:** negação com escala linear única. Custo: tira o log do `design_gate` e torna o
`RN-3` dependente de disciplina. **Ela volta como plano B só se o falsificador F-6 abaixo reprovar.**

---

## Entrada de design da F1 — `[Q-DG-1]`, resolvida pelo `design_gate`

`[DECISÃO do design_gate: ui-designer + ux-ui-mastery, APPROVED WITH CONDITIONS 7.3/10 — docs/context/paineis-de-fluxo/handoff/DESIGN-LAYOUT.md §6-§7, gates/DESIGN-LAYOUT-ux-critique-r2.md]`: a camada de HTML fica **sobreposta a `IPaneApi.getHTMLElement()`** (trilho lateral recusado),
com `pointer-events: none`. As alturas usam `setStretchFactor` com os pesos **34/11/15/9/9/9/9** e piso de
**72px**. `enableResize = false`. O separador é `#8b949e`, 1px, **com teste de override**. Na legenda de
liquidação (`D4`), o numeral é **neutro**, precedido de um quadrado de 8px com a forma e a cor da perna.
⚠️ Os pesos nomeiam funding e dois panes de CVD, que são `NG-3`/`NG-5` do PRD. A F1 aplica só os pesos dos
panes que existem (`SPEC-009` §3).

## Falsificador

**F-1..F-5 rodam no spike `T-01.0`, antes de qualquer linha de produção da fase `01`**, e F-6 roda na
fase `04`. `S-1` cai e `S-2` reabre se **qualquer** um de F-1..F-5 reprovar (`ARQ-1` §1.4):

| # | medida | reprova se |
|---|---|---|
| F-1 | `p95` do intervalo entre aplicações de range (`e2e/17`, `panelCount=1`), `n ≥ 61` amostras | `> 160 ms` (teto vigente `[DECISÃO-OWNER: 2026-09-22, escolha entre alternativas apresentadas]`, `e2e/17-teto-latencia-eixo.spec.ts:128-134`) **ou** `n < 61` |
| F-2 | `setData` da história sob demanda (`e2e/20`) | `p95 > 400 ms` (`[DECISÃO-OWNER: 2026-09-19]`, plano `SPEC-008/05` DoD 7) |
| F-3 | x em pixel da linha vertical nos panes, lido do canvas | algum par difere em `> 1 px` |
| F-4 | `seriesData.size` num hover sobre índice com dado em todos os panes | `<` número de séries não-*whitespace* naquele índice |
| F-5 | slot de OI ausente e slot de liquidação `0` na mesma pilha | o ausente desenha barra ou candle, **ou** zero e ausência renderizam igual |
| F-6 | na fase `04`: a linha de base das duas escalas (topo da invertida e base da superior) | as duas bases diferem em `> 1 px` no canvas, **ou** algum valor `< 0` aparece em `setData` de liquidação |

⛔ **Controle negativo obrigatório para F-1.** Injetar um *busy-wait* de 20 ms no handler de range, por
query param de e2e (mesmo idioma de `e2eAxisSyncDisabled`, `axis-sync.ts:104`). **Se o `p95` não subir,
F-1 não é evidência nem a favor nem contra.** A gate `T-02-latencia-fix` já mediu que o probe carrega a
cadência de entrada do Chromium headless (`p95 ≈ 33 ms` com zero escrita) `[DOC: docs/context/candle-real-e-eixo-unico/gates/T-02-latencia-fix.md:29-84]`.
Nesse caso o spike tem de apresentar um segundo instrumento com poder demonstrado (duração de frame por
`requestAnimationFrame`, ou `PerformanceObserver` `longtask`, com `[NÃO SEI]` sobre qual deles tem poder,
`ARQ-1` §7). Se nenhum dos dois tiver, **`CA-11` é declarado `[NÃO MEDIDO]` e escalado**, e não sai verde.

## ⛔ Emenda F-7 (2026-09-23): o critério de "+1 quadro" da `T-01.10`

**O defeito medido.** O `p95` do probe de `e2e/17` **salta entre 2 e 3 quadros** (32,8–49,4 ms em 5
rodadas) **sem mudança de código** (`gates/T-01.1-baseline.md` §2, `n=87` por rodada) `[MEDIDO]`. Esse
probe não resolve 1 quadro. O instrumento **com poder** é o intervalo de `requestAnimationFrame` durante o
arrasto: `p95` de **16,7–16,8 ms em 10/10** arrastos, com stub e com dado real (§4, `n=101–197` quadros
por rodada) `[MEDIDO]`. O spike S-1 deu **33,2–33,3 em 3 de 7** rodadas (`T-01.0-spike-facts.jsonl`) `[MEDIDO]`.

**Critério, fixado ANTES de a `T-01.10` rodar:**

| | regra |
|---|---|
| instrumento de julgamento | `p95` do intervalo de rAF durante o arrasto, **dado real** (braço B de `T-01.1` §4), **5 rodadas isoladas**, `n ≥ 100` quadros por rodada |
| **"+1 quadro" numa rodada** | `p95_rAF ≥ 25,0 ms`, que é 1,5 quadro. O limiar fica no meio do degrau para não depender de 16,7 × 2 exato `[INFERRED: quantização em múltiplos de 16,7 medida nos dois instrumentos]` |
| **regressão** | "+1 quadro" em **≥ 2 das 5** rodadas. A baseline deu **0/10**. Uma rodada isolada é registrada, mas não reprova `[INFERRED: com 0/10 de base, 1/5 não se distingue de ruído; 2/5 (40%) está perto dos 3/7 (43%) do spike, que é justamente o efeito que se quer pegar]` |
| **conta como regressão?** | **SIM.** O `CA-11′` exige *"sem regredir sobre a baseline"*, e o rAF é o instrumento com poder. ⇒ a `T-01.10` **não sai verde** |
| o que acontece quando reprova | **não** é revert automático de S-1, porque 33 ms está abaixo do teto de 160 ms. A task volta com o número e ou a F1 otimiza até sumir, ou o **owner** aceita o quadro explicitamente (`[DECISÃO-OWNER]`). O `/architect` **não** absorve o custo por ele: o 16 ms (*"um quadro a 60 fps"*) era a escolha do owner em 2026-09-19, e o 160 ms foi recalibrado para o probe **sem poder**, não para o rAF |
| papel do probe de `e2e/17` | só o **teto absoluto** (`p95 ≤ 160 ms`, `n ≥ 61`) e uma banda: a mediana das 5 rodadas `≤ 49,4 ms`, que é o topo da faixa da baseline. **Não** é usado para julgar "+1 quadro" |
| controle negativo | o busy-wait de 20 ms tem de levar o `p95_rAF` a `≥ 33 ms` em 5/5 rodadas. Se não levar, o resultado é `[NÃO MEDIDO]` e escala (a regra de `ADR-044` §Falsificador) |
| fora desta emenda | `e2e/20`, que está vermelho em `master` e em diagnóstico pelo `frontend-qa` |

## Consequências

- `CA-2` deixa de ter mutação própria, porque a API não tem eixo de tempo por pane. Ele vira critério
  **estrutural** cuja ablação é a mesma do `CA-1` (`SPEC-009` §9).
- A ablação `e2eAxisSyncDisabled` do e2e `16` perde sentido. Quem a substitui é a mutação do `CA-1`.
- A mutação do `CA-3` passa a ser **filtrar a atualização da legenda por `param.paneIndex`** (`ARQ-1` §4).
- A dívida `FR-2` de `ADR-003` (**14** constantes de geometria em `web`,
  `grep -nE '^const [A-Z_]*(_PX|_SCALE_MARGINS|_LOG_BASE|_HEIGHT_PX)\s*=' SymbolClient.tsx | wc -l → 14`
  `[MEDIDO: ARQ-1 §5]`) **não pode crescer em F1**. As que F1 re-ancora (bandas de marca) migram para `charts`.
