# SPEC-009 — Painéis de fluxo: um gráfico, panes nativos, e três métricas que passam a dizer a direção

**Feature:** `paineis-de-fluxo` · **Status:** `DRAFT`. `SPEC_APPROVED` é gate do **owner** (`harness pipeline approve paineis-de-fluxo spec`), e este documento **não** o declara.
**PRD:** [`PRD-009`](PRD-009-paineis-de-fluxo.md) · **ADRs:** [`ADR-044`](../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) (proposta) · [`ADR-045`](../adr/ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md) (proposta, **condicional** a `[Q-OI-1]`)
**Plano:** [`docs/plans/SPEC-009-paineis-de-fluxo/`](../plans/SPEC-009-paineis-de-fluxo/index.md)
**Julgamentos delegados:** [`ARQ-1-julgamento-frontend-architect.md`](../context/paineis-de-fluxo/handoff/ARQ-1-julgamento-frontend-architect.md) (`ARQ-1`) · [`LIQ-1-julgamento-quant-architect.md`](../context/paineis-de-fluxo/handoff/LIQ-1-julgamento-quant-architect.md) (`LIQ-1`)
**Ledger ao escrever:** `PRD_VALIDATED` (`approve prd` em 2026-09-23) `[MEDIDO: harness pipeline state paineis-de-fluxo]`
**Vocabulário:** `harness policy --key components` → `n=7` `[MEDIDO 2026-09-23]`. Toda fase e todo item declara o seu.

---

## 0. Como ler

Esta SPEC tem **zero código**: contratos, formas de dado, limites de camada e comportamento de borda.
Os números seguem a regra do `CLAUDE.md`. Onde um julgamento delegado decidiu, a linha cita o arquivo e a
seção. Onde o `/architect` decidiu entre dois julgamentos que discordavam, a linha diz **qual** ganhou e
**por quê**.

---

## 1. Veredito do Gap Analysis — `[READY FOR SPEC]`

**Nenhum bloqueante de PRD.** Os bloqueantes existem só no nível de fase: F1 (`Q-ARQ-1` e `Q-SEQ-1`,
ambos **fechados aqui**), F3 (`[Q-OI-1]`, do **owner**, sem resposta) e F4 (`Q-LIQ-1`, **fechado aqui**
como `[INFERRED]`, com veto do owner em aberto). Os achados abaixo corrigem o PRD sem reabrir o que o owner
decidiu, e cada um é **inferível**:

| id | achado | classe | resolução |
|---|---|---|---|
| **A-1** ⭐ | *"Com `O-1`, F3 é só `web`"* (`PRD-009` §5/F3) é **falso**. `ADR-040/D1` põe a reagregação na rota, e `(STOCK, POINT)` reduz por `last` (`series_reduction.py:28, 170`). O browser recebe 1 ponto por bucket de TF e não tem como montar OHLC | `[INFERRED: leitura de ADR-040/D1 + código]`, confirmado por `LIQ-1` §Q4 | F3 sob `O-1`/`O-3` = `sentimento` + `web` (§6, `ADR-045`) |
| **A-2** ⭐ | `RN-5` (*"`open` do primeiro"*) contradiz `§13-A/O-1` (*"ponto anterior contíguo"*), e **as duas estão erradas**. Com `RN-5`, TF `5m` ⇒ `open == close` sempre ⇒ todo candle neutro. Com `O-1`, a condição *"`gap == 300000`"* descarta âncora válida | confirmado por `LIQ-1` §Q3, com fonte Coinalyze `candlestick_oi` | a definição de `ADR-045/D1` **substitui** as duas (§6.2) |
| **A-3** | O `G-3` do PRD (*"teto de latência sem número"*) está **desatualizado**. Os tetos vigentes são **160 ms** `p95`, `n ≥ 61` amostras, para o eixo (`[DECISÃO-OWNER: 2026-09-22, escolha entre alternativas apresentadas]`, recalibrado de 16 ms; `e2e/17-teto-latencia-eixo.spec.ts:128-134`), e **400 ms** `p95`, `n ≥ 10`, para a história sob demanda (`[DECISÃO-OWNER: 2026-09-19]`, `plans/SPEC-008/05` DoD 7) | `[MEDIDO: leitura dos dois arquivos]` | `CA-11` herda os dois números absolutos, e não só "≤ baseline" (§9) |
| **A-4** | Hoje são **6** charts, não 5: 5 funções de pane, com `LiquidationPane` montada 2× (`SymbolClient.tsx:1155, 1399, 1522, 1887, 2385`). Como o PRD mantém liquidação em dois panes na F1, **o `CA-1` da F1 conta 6 panes**; o 5 só vale a partir da F4 | `[MEDIDO: grep -n 'function .*Pane(']` | §9 |
| **A-5** | O `CA-9` (*"nenhum valor na tela == `long − short`"*) **reprova implementação correta** sempre que uma perna é `0`: com `short = 0`, `long − short == long`, e `long` está na tela legitimamente | `[INFERRED: aritmética]` | `CA-9′` (§9) |
| **A-6** | O `CA-2` não tem mutação possível sob panes nativos, porque a API não tem eixo de tempo por pane | `ARQ-1` §6 | vira estrutural, com a ablação do `CA-1` (§9) |
| **A-7** | TF servido é **cinco**, não quatro: `1m·5m·15m·1h·4h`, e **`1m` é o default** (`supported-timeframes.ts:67-78`). O OI nativo é `5m` ⇒ no TF default o OI ocupa 1 slot em 5 | `[MEDIDO: ARQ-1 C-1]` | §6.4 |
| **A-8** | `addSeries` são **11**, não 10 (`PRD-009` M7) | `[MEDIDO: grep -c → 11, ARQ-1 C-2]` | só correção de número |
| **A-9** | O "pavio real" de `O-2` também é amostrado, com cadência `[NÃO SEI]`: `o(t) == c(t−300)` em só **6 de 2.141** pares `[DOC: open_interest_catalog.py:16-17]`. E `O-2` **não passa** em `ADR-036/D2` como a ADR está escrita, a menos que ela seja emendada | `LIQ-1` §Q2 | o menu `§13-A` ganha as correções e a opção `O-4` (§6.1) |

**Ciclos com o `/pm`: 0.** Nenhum achado é bloqueante, e todos corrigem o PRD em vez de devolvê-lo.

---

## 2. O que esta SPEC fixa, e o que não reabre

**Fixa:** a estrutura (`D1`, `ADR-044`), a fonte da legenda (`D2`), o *pane registry* (`D3`), o volume
com direção (`D4`), o candle de OI **condicional** (`D5`, `ADR-045`), a liquidação num pane (`D6`), a
sequência contra a `ADR-043` (`D7`) e os tetos de latência (`D8`).

**Não reabre:** `D-a`..`D-j` do `PRD-009` §3. Em particular `D-a` (OI na origem, em contratos) é
`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`, e `[Q-OI-2]` segue com o owner.
Sem resposta, vale `D-a`.

---

## 3. `D1` — Estrutura: um `createChart`, panes nativos (`Q-ARQ-1` → `S-1`)

**Decisão** (`ADR-044/D1`, julgamento `ARQ-1` §1): **um** `createChart`, um pane por métrica, e a store
de `axis-sync` rodando com `panelCount = 1`. Dois `frontend-architect` independentes chegaram a `S-1`
`[DOC: mensagem do orquestrador, 2026-09-23]`.

**Precondição: o spike `T-01.0` roda antes de qualquer linha de produção.** Os falsificadores F-1..F-5 e
o controle negativo de F-1 estão em `ADR-044` §Falsificador. **Se qualquer um reprovar, `S-2` reabre** e
a fase `01` para, com o relatório do spike devolvido ao `/architect`.

**Limites de camada** (`ADR-003`/`FR-2`: *"`web` não calcula geometria"*):
- `charts` é dono de `kind`, das escalas nomeadas, dos adapters *lossless* e da geometria das bandas de marca;
- `web` é dono do registry (composição), da camada de DOM por pane e da ligação com o pager;
- a dívida de **14** constantes de geometria em `web` (`ADR-044` §Consequências) **não pode crescer**.

**Invariante da grade (`ADR-044/D2`):** toda série de todo pane chama `setData` exatamente com os `time`
da grade canônica do TF. O registry testa isso.

**Posição do HTML de pane** (título, legenda, `BeyondCoverageBadge`/`PartialCoverageMark`/`AbsenceNote`
— 48 `data-fact=` e 9 `data-testid=` hoje, `[MEDIDO: ARQ-1 §3.2]`): há duas formas estruturais possíveis,
uma **camada sobreposta ancorada em `IPaneApi.getHTMLElement()`** e um **trilho lateral indexado por
`paneIndex`**. **Escolher entre elas, e decidir altura, `enableResize` e separador, é do `design_gate`**
(`ui-designer` + `ux-ui-mastery`, `CLAUDE.md` §Design). A SPEC fixa só duas coisas: os `data-testid`
atuais (`price-pane`, `oi-pane`, …) **sobrevivem**, derivados de `pane_id`; e o `[NÃO SEI]` sobre
`getHTMLElement()` ser não-nulo no mesmo tick de `addPane` é respondido pelo spike (F-5).

**Ciclo de vida:** F1 **mantém** o de hoje. Trocar o `axis` remonta o chart, agora um só. Trocar para
*"`setData` sem remontar"* **não** é escopo de F1; fica como herança possível para a `ADR-043` (§8).

---

## 4. `D2` — A legenda: `param.logical` contra os slots, nunca `seriesData`

`ADR-044/D2`. O `RF-4` fica assim: com crosshair, o valor do slot `param.logical`; sem crosshair, o
último bucket fechado. A leitura é por `nature`: `FLOW` = valor do bucket; `STOCK` = *held* pela função
existente; `RATIO` = valor do bucket. Slot ausente ⇒ a legenda diz **ausente**, nunca `0` (`RN-4`).
`RF-5`: o nome é derivado do `SeriesKey` pela mesma função de identidade que já nomeia os panes
(`identityTerms`, `SymbolClient.tsx:1986`), chamada **uma vez por pane, no registry**.

**Bucket em formação** (`ADR-026`): a legenda sem crosshair mostra o último bucket **fechado**, como o
`PRD-009` já inferiu (`RF-4`, `[INFERRED]`). Se o `design_gate` preferir o bucket em formação, a legenda
tem de marcá-lo como tal. A decisão é do gate; esta SPEC só proíbe mostrar o valor em formação sem marca.

---

## 5. `D3` — O *pane registry*: a forma do dado

Um array ordenado; a posição no array é o `paneIndex`, de cima para baixo. Forma segundo `ARQ-1` §5:

| campo | forma | dono do valor | dono da forma |
|---|---|---|---|
| `pane_id` | chave ASCII em inglês: `price`, `liquidation`, `oi`, `long_short`, `cvd` (F1: `liquidation_long`, `liquidation_short`, até a F4) — e a fonte única do `data-testid` | `web` | `web` |
| `stretch` | número relativo → `setStretchFactor` | `design_gate` | `charts` |
| `series[]` | por série: `role ∈ {primary, secondary, absence_mark, zero_mark}` · `series_key_id` (do catálogo, **nunca literal**) · `kind ∈ {candlestick, line, histogram}` · `scale_ref` (escala nomeada por `charts`) · `slots_ref` (campo do assembly do pager) | `web` compõe | `charts` |
| `legend` | `label_from = SeriesKey` · `reading_policy = nature` | derivado | `charts` (leitura) · `web` (DOM) |
| `status_ref` / `coverage_ref` | chave em `panelStatus` / `pager.panelCoverage` | derivado | `web` |

**Ordem dos panes** (`RF-1`, `I-1`): Preço+Volume · Liquidações · OI · Long/Short · CVD, como
`[INFERRED]` do PRD. **O valor final é do `design_gate`.**

**Invariantes, cada uma testada com um caso que reprova e um que passa:**
(i) todo `series_key_id` existe no catálogo servido;
(ii) todo pane tem ≥ 1 `primary`;
(iii) toda série `FLOW` tem o par `absence_mark` + `zero_mark` (`ADR-044/D3`);
(iv) nenhum `label` é literal;
(v) todo `time` de todo `setData` pertence à grade canônica (`ADR-044/D2`).

---

## 6. `D5` — O candle de OI: **CONDICIONAL a `[Q-OI-1]`**, e sem escolher pelo owner

### 6.1 O menu `§13-A`, com as correções dos julgamentos e a opção `O-4`

`[Q-OI-1]` é **do owner**, e esta SPEC **não escolhe**. O menu abaixo é o do `PRD-009` §13-A com duas
correções (A-2, A-9) e uma opção nova levantada pelo `quant-architect` (`LIQ-1` §Q2), apresentada **sem
recomendação**:

| opção | o que o owner vê | custo | fases |
|---|---|---|---|
| **O-1** — derivar da Binance (a origem de `D-a`) | candle em contratos, **corpo exato** `p(T1) − p(T0)` sempre que as duas fronteiras existem; pavio = extremo de amostras de 5 min, que é **cota inferior**; em `5m` **sem pavio** (`samples.expected == 1`) | zero cota, zero terceiro, `D-a`/`ADR-036` intactas, backtest vê a mesma série. Definição **corrigida** em `ADR-045/D1`, e **não** a do `§13-A` original. Após um buraco em `5m`: **nenhum candle** | `03` única (`sentimento` + `web`) |
| **O-2** — capturar o OHLC de OI da Coinalyze, mesmo universo | candle com pavio intra-5 min, **inclusive em `5m`** | coletor novo (M2), cota ≈ 4 u/ciclo `[INFERRED no PRD]`, quarentena (`PRD-005`), retenção de ~7 dias contra 90 dias servidos. ⚠️ **Duas correções:** o pavio **também é amostrado**, com cadência `[NÃO SEI]` (A-9); e ⛔ **não passa em `ADR-036/D2` como escrita**. O que a origem não publica é a **história** intra-5 min, não a grandeza, e aceitar `O-2` exige **emendar** `D2`, decisão do dono daquela ADR (`LIQ-1` §Q2, `[INFERRED]`) | `03a` (captura) + `03b` (pixel) |
| **O-3** — `O-1` agora, `O-2` quando `PRD-005` sair da quarentena | `O-1` hoje, pavio da Coinalyze depois | o custo de `O-1` agora, mais a emenda de `ADR-036/D2` **depois** | `03` agora |
| **O-4** ⭐ *(nova, `LIQ-1` §Q2)* — polling de `GET /fapi/v1/openInterest` (*"present open interest"*) **pela origem**, em cadência < 5 min | pavio **da origem**, com a cadência escolhida, **só daqui para frente**. Para trás, o candle é o de `O-1` | coletor novo em `sentimento`; **passa em `ADR-036/D1`/`D2` sem emenda**. Peso da chamada `[NÃO LIDO]`, contra teto de 2.400/min por IP `[DOC: ADR-036:152]`. Disco a 1 min: 4 símbolos × 1.440/dia × ~99 B/linha ≈ **570 KB/dia** `[INFERRED: aritmética sobre os 99,06 B/linha medidos em SPEC-008 §4]`, a declarar e medir antes de escrever (`RNF-4`, `D-j`). **Zero backfill**: o pavio real começa no dia da captura. Duas cadências no mesmo pane (5 min antes, a escolhida depois) ⇒ `samples` tem de dizer qual | `03a` (coletor) + `03b` (pixel), e **usa `ADR-045`** para a parte histórica |

**Recomendação do `/pm`:** `O-3` (`PRD-009` §13-A). **O `/architect` não soma recomendação.** O que o
owner escolhe é entre *"sem terceiro e sem pavio em 5m"* (`O-1`), *"pavio de terceiro com a ADR-036
emendada"* (`O-2`/`O-3`) e *"pavio da origem só daqui para frente"* (`O-4`).

### 6.2 A definição do candle derivado (vale para `O-1`, `O-3` e o histórico de `O-4`)

`ADR-045/D1`. A condição que licencia a âncora é **existir `p(T0)`**. Isso **substitui** o `RN-5` do PRD
para séries `(STOCK, POINT)`; para séries `(STOCK, OPEN|HIGH|LOW|CLOSE)` nativas (`O-2`), o `RN-5` vale
como escrito.

### 6.3 O contrato `OiCandle` (fecha o TBD do `PRD-009` §9)

| campo | tipo lógico | regra |
|---|---|---|
| `bucket_end_ms` | inteiro, ms | `T1`, na grade do TF efetivo |
| `open`, `high`, `low`, `close` | real, **contratos** (unidade do `SeriesKey`, `D-b`) | `low ≤ min(open, close) ≤ max(open, close) ≤ high` |
| `open_at_ms` | inteiro, ms | `== T0` ⇔ âncora de fronteira; `> T0` ⇔ primeira amostra |
| `close_at_ms` | inteiro, ms | `< T1` ⇔ buraco no fim |
| `samples` | `{present: int, expected: int}` | `expected = TF_efetivo / 5 min`; par de inteiros de `ADR-040/D3` |
| `closed` | booleano | `false` no bucket em progresso |
| `derived_from` | enum `binance_point_5m` · `coinalyze_ohlc_5m` · `binance_poll` (este último só com `O-4`) | fecha o `RN-6` |

**Não existe linha com `open_at_ms == close_at_ms`** (`ADR-045/D1`). A unidade e o nome vêm do `SeriesKey`
servido (`RF-5`), sem campo novo. **Onde é montado:** na rota, em `sentimento` (`ADR-045/D2`). O browser
**não** deriva.

### 6.4 TF `1m` (o default) e o OI

O OI nativo é `5m` e não existe candle mais fino. Com `interval=1m`, a rota serve os candles `5m`
declarando `bucket_interval_ms = 300000`, que é a grade nativa da série (`ADR-037`). Na tela isso é 1 slot
em cada 5 (`ARQ-1` §2). **A forma visual** (1-em-5, esconder o pane ou avisar) é do `design_gate` +
`quant-architect`, junto com o `Q-OI-3`. O `[NÃO SEI]` sobre como o OI aparece hoje em `1m` é medido no
item `1.1` do plano.

### 6.5 `Q-OI-3` — o fato viaja no contrato

`samples.expected == 1` já diz *"sem informação de pavio nesta resolução"* (`LIQ-1` §Q5). Tratar a falta
de pavio como *"OI não oscilou"* é a troca ausência×zero do `RN-4`. **Se isso vira aviso, rótulo ou
tooltip, decide o `design_gate`.**

---

## 7. `D6` — Liquidação num pane (F4)

### 7.1 `Q-LIQ-1` — qual perna vai para cima: **Coinalyze**, `[INFERRED]`, e o owner pode vetar

**As fontes discordam** (`LIQ-1` §Correção, 2ª passagem):
- **Coinalyze** (o indicador `AggregatedLqUsdDenominated`, no bundle servido, `sha256 96938b47…7ac2`):
  `shorts_liquidation` positivo com `up_color`, `longs_liquidation` negativo com `down_color`
  (`return[a,i?s:-1*s]`). Ela rotula pelo **lado da ordem forçada**: *"Shorts liquidation (Buy)"* /
  *"Longs liquidation (Sell)"* `[DOC]`.
- **TradingView Markets** (ajuda oficial `43000762400`, imagem `43622770276`): **Long verde em cima,
  Short vermelho embaixo**, ou seja, rotula pela **coorte** `[DOC]`. No Supercharts: `[NÃO SEI]`.

**Escolha: Coinalyze. Short liquidado vai para CIMA com o token de ALTA; long liquidado vai para BAIXO
com o token de BAIXA.** `[INFERRED: a referência que o owner enviou (coinalyze-tradingview-2026-09-23.png)
é o indicador DA Coinalyze rodando dentro da biblioteca de chart da TradingView — a legenda "Aggregated
Liquidations COIN-margined Contracts" é o `AggregatedLqUsdDenominated` (LIQ-1 Fonte 1); adotar a convenção
Markets inverteria a imagem que ele mesmo mandou]`. A regra também casa com o `RNF-3`: alta = compra,
mesma gramática da vela.

**É dedutível, então não bloqueia.** Mas a fala do owner cita **as duas** referências (*"bem proxima da
coinalyze e tradingview"* `[PREMISSA-OWNER: 2026-09-23]`), e elas discordam. Por isso fica registrada como
**`[Q-LIQ-2]`, pergunta não-bloqueante ao owner, com default = Coinalyze** (§11). Se o owner vetar, a
mudança é **uma troca de lado no registry**: a mesma inversão de `scale_ref` nas duas pernas, sem mudança
de contrato.

**Semântica do dado, conferida:** `cohort=long` = posições long liquidadas (`LONG = "l"`,
`liquidation_zero_legitimacy.py:63-67`; `liquidation_collection.py:57-64`, travado por
`test_the_cohort_of_each_wire_letter`; Coinalyze `"l": "Longs liquidation volume"`) `[DOC: LIQ-1]`.

### 7.2 A geometria: escala invertida, nunca sinal (o conflito entre os dois julgamentos, decidido)

**Decisão: duas escalas sobrepostas no pane, e a de baixo com `invertScale: true`. Os dois valores entram
como magnitudes `≥ 0`** (`ADR-044/D4`). A negação do `quant-architect` é **recusada como mecanismo e mantida
como semântica**: o que ela queria (long embaixo, magnitude na legenda, nenhum valor com sinal na tela)
sai estrutural, já que nenhum número negativo existe no caminho. Log × linear continua com o
`design_gate`. **Plano B**, só se `ADR-044/F-6` reprovar: negação com escala linear única.

### 7.3 Legenda e `RN-3`/`RN-4`

A legenda mostra as **duas magnitudes**, cada uma na cor da sua perna, **sem sinal de menos** (a Coinalyze
também usa `Math.abs`, `LIQ-1` Fonte 2), e nenhum terceiro número. Cada perna mantém o **próprio** par
ausência/zero do seu lado do zero: 6 séries e 4 escalas no pane (`ARQ-1` §3.3).

---

## 8. `D7` — `Q-SEQ-1`: **F1 antes das pernas da `ADR-043`, em série**

**Decisão:** a fase `01` desta feature vem **antes** da Perna 2 **e** da Perna 1 da `ADR-043`. Enquanto
qualquer fase desta feature estiver em construção, **nenhuma outra branch edita `SymbolClient.tsx`**:
um editor por vez, em série, nunca em paralelo.

**Por quê** (`ARQ-1` §8, `[MEDIDO]` por `grep -n`):
1. **Tamanho.** F1 toca ~**811** linhas e a Perna 2 toca **157**, mais 30 prováveis. Rebasear a menor sobre
   a maior é mais barato.
2. **Sobreposição.** Zero linha em comum, mas `:2903` (Perna 2) e `:2904` (F1) são vizinhas no mesmo
   `return`. O acoplamento **semântico** é alto: a Perna 2 troca **quem** dispara a mudança de `axis`, e
   F1 troca **o que** remonta quando ela acontece.
3. **Estado da `ADR-043`.** Ela é `proposta`, **sem feature**, e a Perna 1 está *"pendente de decisão do
   owner"* (`ADR-043:136`). Esperar por ela travaria F1 por uma decisão de backlog que não é de F1.
   `[MEDIDO: git worktree list → só master; nenhuma branch da ADR-043]`.

**Falsificador de `D7`:** se, quando a `ADR-043` for agendada, o rebase de qualquer perna sobre F1 custar
mais que ~157+30 linhas de conflito (`git diff --stat` do rebase), a sequência estava errada, porque F1
deveria ter esperado.

---

## 9. `DoD-VERTICAL` instanciado e os critérios corrigidos

Toda fase paga os itens do `DoD-VERTICAL` (`MEMORY: fatia vertical`). Nas fases que não criam dado (`01`,
`02`, `04` e a `03` sob `O-1`), o `count` em `md.series` e o `n_written` são **não-regressão**: continuam
`> 0`. Os comandos e universos estão nos arquivos de fase.

| id | critério corrigido | morde |
|---|---|---|
| `CA-1′` | `count(.tv-lightweight-charts)` no `/symbol` `== 1` (**não** `count(canvas)`, porque cada pane tem os próprios canvases, `ARQ-1` §1.1); panes com `N>0` pontos = **6** na F1, **5** a partir da F4 | voltar a 6 `createChart` |
| `CA-2′` | estrutural: só o pane do rodapé tem rótulo de tempo, com assert de **pixel** | a mesma ablação de `CA-1′` (A-6) |
| `CA-3′` | hover no pane de preço em `x` ⇒ a legenda de todos os panes = valores do slot de `x` na API | **filtrar a atualização da legenda por `param.paneIndex`** (`ADR-044` §Consequências) |
| `CA-7` | como no PRD, **com** a cláusula de inconclusivo; sob `O-1`, `cor(oi_i) == sinal(close_i − open_i)` com os valores de `OiCandle` | colorir pelo preço |
| `CA-8′` | janela com buraco de M3 ⇒ `0` candle no intervalo **e** `0` candle no primeiro bucket `5m` depois do buraco (`ADR-045/D1`). Janela sem buraco ⇒ **inconclusivo** | costurar a âncora com o último ponto antes do buraco |
| `CA-9′` | (a) nenhum valor `< 0` em `setData` de liquidação; (b) a legenda mostra **exatamente 2** números, cada um `==` a sua perna na API; (c) em buckets com **as duas pernas `> 0` e distintas**, nenhum número da tela `== |long − short|`. Sem tal bucket na janela ⇒ inconclusivo (A-5) | somar ou subtrair as pernas |
| `CA-10′` | ausente ≠ zero no pane fundido, **por perna**; sem os dois estados na janela ⇒ inconclusivo | fundir os estados |
| `CA-11′` | eixo `p95 ≤ 160 ms` (`n ≥ 61`) **e** história `p95 ≤ 400 ms` (`n ≥ 10`), sem regredir sobre a baseline medida em `1.1`, **e** controle negativo que move o `p95` (`ADR-044` §Falsificador) | busy-wait de 20 ms. Se ele não mover o `p95`, é `[NÃO MEDIDO]` e escala, e não sai verde |
| `CA-LIQ` | short `+v` em cima, com token de alta; long embaixo, com token de baixa, lido do **pixel** (y da barra contra a linha de zero) | trocar o `scale_ref` das pernas |

`CA-4`, `CA-5`, `CA-6` e `CA-12` ficam como no PRD.

---

## 10. `D8` — Latência

Os tetos são os de A-3, `[DECISÃO-OWNER]` com datas. **Esta SPEC não propõe número novo.** O `G-3` do
PRD está fechado por decisões anteriores, e o `PRD-008 [Q5]` foi respondido para o eixo em 2026-09-19 e
recalibrado em 2026-09-22.

---

## 11. Perguntas em Aberto

| id | pergunta | classe | dono | default sem resposta |
|---|---|---|---|---|
| `[Q-OI-1]` | `O-1`/`O-2`/`O-3`/`O-4` (§6.1) | **bloqueante da F3** | **owner** | nenhum; a F3 não começa |
| `[Q-OI-2]` | U-1/U-2 (`PRD-009` §13-C) | não-bloqueante | **owner** | `D-a` (U-1) |
| `[Q-LIQ-2]` | convenção Coinalyze (escolhida) ou TradingView Markets (§7.1)? | não-bloqueante | **owner** (veto) | Coinalyze |
| `[Q-ADR036]` | se `O-2`/`O-3` for escolhida: emendar `ADR-036/D2` | condicional | dono da `ADR-036` + owner | — |
| `[Q-DG-1]` | posição do HTML de pane, altura, `enableResize`, separador (§3) | inferível | `design_gate` | — |
| `[Q-DG-2]` | log × linear da liquidação e do volume (`Q-VOL-2`) | inferível | `design_gate` | o de hoje |
| `[Q-DG-3]` | forma do OI em TF `1m` e sem pavio em `5m` (§6.4, §6.5) | inferível | `design_gate` + `quant-architect` | — |
| `[Q-VOL-1]` | V-1 (cor pela direção) | **resolvida** `[INFERRED: é a referência e não duplica o CVD]` | owner veta | V-1 |
| `[I-5]` | ciclo de vida *"`setData` sem remontar"* | fora da F1 | `ADR-043` | remonta |

---

## 12. Rastreabilidade — requisito → onde fecha

| requisito | fecha em | fase |
|---|---|---|
| `RF-1`, `RF-2`, `RF-3`, `RF-6`, `RNF-1` | §3 / `ADR-044/D1` | `01` |
| `RF-4`, `RF-5` | §4 / `ADR-044/D2` | `01` |
| `RN-4` | §5 (iii) / `ADR-044/D3` | `01`, `04` |
| `RF-7`, `RNF-3`, `CA-6` | plano `02` | `02` |
| `RF-8`, `RF-9`, `RN-1`, `RN-2`, `RN-5`, `RN-6`, `RNF-4` | §6 / `ADR-045` | `03` |
| `RF-10`, `RF-11`, `RN-3` | §7 / `ADR-044/D4` | `04` |
| `RNF-2`, `CA-11` | §10 | `01` (baseline) e todas |
| `RN-7`, `NG-*` | fora | — |

## 13. Próximo passo

`advance SPEC_DRAFT` → **owner** revisa e roda `approve spec`. Depois vem o `/tech-lead`. A F3 só é
quebrada em tasks depois de `[Q-OI-1]`.
