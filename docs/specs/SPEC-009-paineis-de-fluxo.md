# SPEC-009 — Painéis de fluxo: um gráfico, panes nativos, e três métricas que passam a dizer a direção

**Feature:** `paineis-de-fluxo` · **Status:** `DRAFT`. `SPEC_APPROVED` é gate do **owner** (`harness pipeline approve paineis-de-fluxo spec`), e este documento **não** o declara.
**PRD:** [`PRD-009`](PRD-009-paineis-de-fluxo.md) · **ADRs:** [`ADR-044`](../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) (proposta) · [`ADR-045`](../adr/ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md) (proposta; a condição foi satisfeita em 2026-09-23, quando `[Q-OI-1]` = `O-4`, e ela passa a valer para os dois regimes)
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
ambos **fechados aqui**), F3 (`[Q-OI-1]`, **respondida pelo owner em 2026-09-23: `O-4`**, §6) e F4 (`Q-LIQ-1`, **escolhida pelo
owner em 2026-09-23: Coinalyze**, §7.1). Os achados abaixo corrigem o PRD sem reabrir o que o owner
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
com direção (`D4`), o candle de OI por polling da origem, com histórico derivado (`D5`, `ADR-045`), a liquidação num pane (`D6`), a
sequência contra a `ADR-043` (`D7`) e os tetos de latência (`D8`).

**Não reabre:** `D-a`..`D-j` do `PRD-009` §3. Em particular `D-a` (OI na origem, em contratos) é
`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`, e o owner o **manteve** em 2026-09-23 (`[Q-OI-2]` = `U-1`, `[DECISÃO-OWNER: 2026-09-23, escolha entre
alternativas apresentadas]`).

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
`paneIndex`**. **✅ `[Q-DG-1]` RESOLVIDA** `[DECISÃO do design_gate: ui-designer + ux-ui-mastery, APPROVED WITH CONDITIONS 7.3/10 — handoff/DESIGN-LAYOUT.md §6-§7, gates/DESIGN-LAYOUT-ux-critique-r2.md]`: a posição é a **camada sobreposta ancorada em
`IPaneApi.getHTMLElement()`**, no canto superior esquerdo, com `pointer-events: none` e `scaleMargins.top`
reservando a altura da legenda; o trilho lateral foi recusado. As alturas saem de `setStretchFactor` com os
pesos **34 · 11 · 15 · 9 · 9 · 9 · 9** e **piso de 72px** por pane de linha. `enableResize = false` na F1. O
separador é `#8b949e`, 1px, com **teste de override** (a biblioteca tem um único `separatorColor`,
`typings.d.ts:3234`). Os `data-testid` atuais (`price-pane`, `oi-pane`, …) **sobrevivem**, derivados de
`pane_id`, na raiz da camada. O `[NÃO SEI]` sobre `getHTMLElement()` ser não-nulo no tick de `addPane` é
respondido pelo spike (F-5).

⚠️ **Divergência de escopo entre os pesos e o PRD, que a F1 não resolve sozinha:** os 7 pesos nomeiam
*preço · liquidações · OI · L/S · **funding** · CVD delta · CVD acumulado*. **Funding é `NG-3`** (fora da
feature), e **dois panes de CVD** mudariam a forma do CVD, o que é `NG-5`. Na F1 valem os pesos **dos panes
que existem**, e a F1 **não cria** pane de funding nem parte o CVD. Os 6 panes da F1 (5 depois da F4)
recebem os pesos correspondentes, renormalizados. Se a intenção era outra, é o owner quem reabre `NG-3`/`NG-5`.

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
(iii) **emendada por `ADR-044/D3′`:** toda série `FLOW` com `kind = histogram` tem o par `absence_mark` + `zero_mark`, e toda série `FLOW` com `kind = line` é alimentada pelo adapter lossless (ausência = *whitespace*);
(iv) nenhum `label` é literal;
(v) todo `time` de todo `setData` pertence à grade canônica (`ADR-044/D2`).

---

## 6. `D5` — O candle de OI: **`O-4`**, polling pela origem, e o histórico derivado antes do coletor ligar

> ✅ **`[Q-OI-1]` RESPONDIDA: `O-4`**, `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`
> ([`DECISOES-DO-OWNER-2026-09-23.md`](../context/paineis-de-fluxo/handoff/DECISOES-DO-OWNER-2026-09-23.md)).
> **Recusadas pelo owner, no mesmo ato:** `O-1` (derivar só do `openInterestHist`), `O-2` (OHLC da
> Coinalyze) e `O-3` (`O-1` agora, `O-2` depois). O menu com o custo de cada uma continua legível no
> `git show 0b99a1d:docs/specs/SPEC-009-paineis-de-fluxo.md` (§6.1) e no `PRD-009` §13-A. **Como `O-2` e
> `O-3` caíram, a emenda de `ADR-036/D2` não é necessária.** `O-4` passa em `ADR-036/D1`/`D2` sem emenda,
> porque é a origem.
> ✅ **`[Q-OI-2]` RESPONDIDA: `U-1`**, só Binance e em contratos, mantendo `D-a`. Mesmo rótulo, mesmo arquivo.

### 6.1 O coletor: o custo lido, o custo medido e a cadência fixada

| fato | valor | fonte |
|---|---|---|
| endpoint | `GET /fapi/v1/openInterest?symbol=…`, *"Get present open interest of a specific symbol"*; resposta `{openInterest, symbol, time}` | `[DOC: developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest, lido 2026-09-23]` |
| peso | **IP Weight: 1** por chamada | o mesmo `[DOC]`. `[MEDIDO 2026-09-23: header x-mbx-used-weight-1m sobe 16→17→18→19 em 4 chamadas seguidas]` |
| teto | `REQUEST_WEIGHT` = **2.400 / 1 min** por IP | `[MEDIDO 2026-09-23: GET /fapi/v1/exchangeInfo → rateLimits]` |
| frescor do valor servido | em 30 chamadas espaçadas ~3,4 s, vieram **27** `time` distintos. O atraso de `time` em relação ao pedido foi **mín 0,5 s · mediana 4,4 s · máx 7,6 s** | `[MEDIDO 2026-09-23, n=30, BTCUSDT]` |

**Cadência fixada: 1 chamada por símbolo por minuto, alinhada à grade de 1 min.** `[INFERRED: escolha do
/architect entre as cadências abaixo; o owner escolheu O-4 com "intervalo < 5m", não um número]`

| cadência | peso/min (4 símbolos) | % do teto | linhas/dia | disco/dia | disco/ano |
|---|---|---|---|---|---|
| **60 s** ⭐ | **4** | **0,17%** | **5.760** | **~570 KB** | **~208 MB** |
| 30 s | 8 | 0,33% | 11.520 | ~1,1 MB | ~416 MB |
| 15 s | 16 | 0,67% | 23.040 | ~2,3 MB | ~830 MB |

Peso e teto são `[MEDIDO]`/`[DOC]`. O disco é `[INFERRED: aritmética sobre os 99,06 B/linha medidos em SPEC-008 §4]`.

**Por que 60 s:** (1) **a grade de 1 min é a do TF default** (`supported-timeframes.ts:67-78`,
`DEFAULT_TIMEFRAME = "1m"`). Com ela, o OI passa a ter **um candle por slot em `1m`** (corpo exato
`p(T1) − p(T0)`, ainda sem pavio), e o artefato 1-em-5 de A-7 **desaparece** para frente. Com 30 s ou
15 s, o ganho seria só no pavio, pagando 2× ou 4× o disco. (2) Em `5m` o pavio sai de **5** amostras, em
`15m` de 15, em `1h` de 60. (3) A premissa de infra (*"poucos recursos"*, `D-j`) põe 830 MB/ano fora do
aceitável sem decisão do owner. **O valor de 208 MB/ano é declarado aqui para o owner vetar se quiser.**

**Carimbo** (`[INFERRED]`, dono de validação: `quant-architect` na fase `03a`): a leitura do minuto `T` é
a primeira chamada feita em `T` ou depois dele cujo `time` fique em `[T, T + 20 s]`. Leitura fora dessa
janela **não** entra como ponto de `T`: `T` fica **ausente** (`RN-2`), nunca carregando o valor anterior.
O `time` da resposta é o `event_time`. O atraso máximo medido foi de 7,6 s, então 20 s dá cerca de 2,6× de
margem, e o `DoD` da fase `03a` mede a fração de minutos admitidos.

### 6.2 O candle ANTES do dia em que o coletor liga: **histórico derivado (`ADR-045`), e não ausência**

**Decisão:** para os buckets anteriores ao início da captura, o candle de OI é o **derivado do
`openInterestHist` 5 min** pela projeção de `ADR-045` (a "parte histórica de `O-4`" que o menu já
descrevia). A alternativa era **ausência declarada**, e ela é **recusada**.

**Por quê:**
1. **O dado existe e é da mesma origem.** O corpo `p(T1) − p(T0)` é **exato** sempre que as duas
   fronteiras existem (`LIQ-1` §Q3), e é justamente o que responde *"se ta entrando OI"*
   `[PREMISSA-OWNER: 2026-09-23]`. Declarar ausência onde a origem publicou o valor é o erro inverso do
   `RN-4`: diz *"não observado"* sobre algo que foi observado.
2. **Com ausência, o pane de OI nasceria vazio** para toda a história servida, até o coletor acumular.
   A parede de `/futures/data/*` é ~30 dias (`[DOC: plans/SPEC-008/05:55]`), então haveria cerca de um mês
   de OI já pago sem desenho.
3. **Custo zero de mecanismo:** a projeção de `ADR-045` é definida sobre o trio
   `(STOCK, POINT, POINT_AT_BUCKET_END)`, e **as duas séries são desse trio**, só com grades nativas
   diferentes (5 min e 1 min). **Uma função, dois regimes.**

**O custo, declarado:** o pane mostra dois regimes. Antes da captura o pavio é de amostras de 5 min, e
em `1m` aparece 1 slot em 5. Depois da captura o pavio é de amostras de 1 min, e aparece um candle por
slot. Cada candle carrega **`derived_from`** e **`samples`**, que dizem em qual regime ele está (`RN-6`).
**Se** a fronteira entre os regimes recebe marca visual, decide o `design_gate` (`[Q-DG-3]`).

**Rótulo de procedência: `DERIVADO`, nos dois regimes, com a expressão** (`RN-6`). Antes da captura:
*"DERIVADO (OHLC de amostras 5m · ADR-045)"*; depois: *"DERIVADO (OHLC de amostras 1m · ADR-045)"*. Nunca
`OBSERVADO`: `open` e `close` são pontos observados, mas `high` e `low` são extremos de amostras discretas, ou
seja, cota inferior da amplitude (`ADR-045/D1`) `[DECISÃO do design_gate: ui-designer + ux-ui-mastery, APPROVED WITH CONDITIONS 7.3/10 — handoff/DESIGN-LAYOUT.md §6-§7, gates/DESIGN-LAYOUT-ux-critique-r2.md]`. A liquidação reagregada por soma continua
`OBSERVADO`, porque a soma preserva a medida do fornecedor. A string é derivada de `derived_from`, nunca
escrita à mão (`RF-5`).

**Regra de fonte por bucket** `[INFERRED: um candle com open de uma fonte e close de outra teria um corpo
que é diferença ENTRE fontes, e não variação de contratos — fere RN-1]`: **um candle, uma série.** O
bucket do TF usa a série de polling **se** ela tem ponto em `T0`, e a série `openInterestHist` caso
contrário. **Nunca se mistura** amostra de uma série com âncora da outra.

**Falsificador de §6.2** (item `3.4` do plano): nos instantes de 5 min em que **as duas** séries têm
ponto, `n ≥ 288` (24 h × 4 símbolos, depois da captura ligar), a mediana de `|poll(T) − hist(T)| / hist(T)`
tem de ficar **≤ 10 bp**. Se passar disso, as duas não medem a mesma grandeza, os dois regimes não são
comparáveis, e a decisão volta ao `/architect` com o número. `[NÃO MEDIDO: o limiar de 10 bp é
INFERRED, cerca de 5× os 1,86 bp de mediana medidos entre Binance e Coinalyze em
open_interest_catalog.py:15-16]`

### 6.3 A definição do candle (os dois regimes)

`ADR-045/D1`, com a grade nativa `g` da série escolhida pela regra de §6.2 (`g = 5 min` no histórico,
`g = 1 min` no polling). A âncora é **existir `p(T0)`**. Isso **substitui** o `RN-5` do PRD para séries
`(STOCK, POINT)`.

### 6.4 O contrato `OiCandle` (fecha o TBD do `PRD-009` §9)

| campo | tipo lógico | regra |
|---|---|---|
| `bucket_end_ms` | inteiro, ms | `T1`, na grade do TF efetivo |
| `open`, `high`, `low`, `close` | real, **contratos** (unidade do `SeriesKey`, `D-b`) | `low ≤ min(open, close) ≤ max(open, close) ≤ high` |
| `open_at_ms` | inteiro, ms | `== T0` ⇔ âncora de fronteira; `> T0` ⇔ primeira amostra |
| `close_at_ms` | inteiro, ms | `< T1` ⇔ buraco no fim |
| `samples` | `{present: int, expected: int}` | `expected = TF_efetivo / g`; par de inteiros de `ADR-040/D3` |
| `closed` | booleano | `false` no bucket em progresso |
| `derived_from` | enum `binance_poll_1m` · `binance_point_5m` | fecha o `RN-6`. `coinalyze_ohlc_5m` **sai** junto com o `O-2` recusado |

**Não existe linha com `open_at_ms == close_at_ms`.** A unidade e o nome vêm do `SeriesKey` servido
(`RF-5`). **Onde é montado:** na rota, em `sentimento` (`ADR-045/D2`). O browser **não** deriva.

### 6.5 TF `1m` (o default)

Depois da captura: um candle por slot, sem pavio (`samples.expected == 1`). Antes da captura: o OI de 5 min
em 1 slot de cada 5, declarando `bucket_interval_ms = 300000` (`ADR-037`). A forma visual do trecho
anterior à captura é do `design_gate` + `quant-architect` (`[Q-DG-3]`).

### 6.6 `Q-OI-3` — o fato viaja no contrato

`samples.expected == 1` diz *"sem informação de pavio nesta resolução"* (`LIQ-1` §Q5). **Se isso vira
aviso, rótulo ou tooltip, decide o `design_gate`.**

### 6.7 Componentes que a F3 toca

| componente | o quê |
|---|---|
| `sentimento` | cliente de `/fapi/v1/openInterest`, coletor, entrada de catálogo (4 séries `binance·open_interest·1m·POINT`, uma por símbolo), projeção `OiCandle` e a rota |
| `infra` | o coletor roda no serviço `collectors` de `deploy/compose.yml` (`:150-231`, `collectors_cli.py`). A cadência entra como variável de ambiente, no mesmo idioma de `OPEN_INTEREST_CYCLE_INTERVAL_S` (`deploy/compose.yml:187`), e é o `infra-architect` quem julga o job agendado e a pegada de disco |
| `web` | o pane `oi` passa a `candlestick`, com legenda O·H·L·C e `derived_from` |

---

## 7. `D6` — Liquidação num pane (F4)

### 7.1 `Q-LIQ-1` — qual perna vai para cima: **Coinalyze**, por decisão do owner

**As fontes discordam** (`LIQ-1` §Correção, 2ª passagem):
- **Coinalyze** (o indicador `AggregatedLqUsdDenominated`, no bundle servido, `sha256 96938b47…7ac2`):
  `shorts_liquidation` positivo com `up_color`, `longs_liquidation` negativo com `down_color`
  (`return[a,i?s:-1*s]`). Ela rotula pelo **lado da ordem forçada**: *"Shorts liquidation (Buy)"* /
  *"Longs liquidation (Sell)"* `[DOC]`.
- **TradingView Markets** (ajuda oficial `43000762400`, imagem `43622770276`): **Long verde em cima,
  Short vermelho embaixo**, ou seja, rotula pela **coorte** `[DOC]`. No Supercharts: `[NÃO SEI]`.

**Escolha: Coinalyze. Short liquidado vai para CIMA com o token de ALTA; long liquidado vai para BAIXO
com o token de BAIXA.** `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`
(`[Q-LIQ-2]`; recusada: TradingView Markets; `DECISOES-DO-OWNER-2026-09-23.md`). O argumento que levou
a opção ao menu, e que o owner confirmou, era `[INFERRED: a referência que o owner enviou (coinalyze-tradingview-2026-09-23.png)
é o indicador DA Coinalyze rodando dentro da biblioteca de chart da TradingView — a legenda "Aggregated
Liquidations COIN-margined Contracts" é o `AggregatedLqUsdDenominated` (LIQ-1 Fonte 1); adotar a convenção
Markets inverteria a imagem que ele mesmo mandou]`. A regra também casa com o `RNF-3`: alta = compra,
mesma gramática da vela.

A mudança, se um dia for revertida, é **uma troca de lado no registry** (a inversão de `scale_ref` nas duas
pernas), sem mudança de contrato.

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

A legenda mostra as **duas magnitudes**, **sem sinal de menos** (a Coinalyze também usa `Math.abs`,
`LIQ-1` Fonte 2), e nenhum terceiro número. ⛔ **Emenda de 2026-09-23 pelo `design_gate`:** o numeral sai em
**tinta neutra**, precedido de um **quadrado de 8px que repete a forma e a cor da perna** (short = vazado no
token de alta, long = cheio no token de baixa). O quadrado é preenchimento e pode usar o matiz; **o número
não**. A redação anterior, *"cada uma na cor da sua perna"*, violava a regra de que nenhum numeral é tingido
por direção (`STITCH_CONTEXT.md` D14 `:1101`) `[DECISÃO do design_gate: ui-designer + ux-ui-mastery, APPROVED WITH CONDITIONS 7.3/10 — handoff/DESIGN-LAYOUT.md §6-§7, gates/DESIGN-LAYOUT-ux-critique-r2.md]`.

**Ausência é estado POR BUCKET DO TF e POR PERNA** (`RN-4`). Em cada bucket, cada perna está num de três
estados, desenhado do **seu** lado do zero: **barra** (soma > 0), **zero** (houve minutos observados e todos
valem 0) ou **ausente** (nenhum minuto observado). São 6 séries e 4 escalas no pane (`ARQ-1` §3.3). O
**bucket misto**, com alguns minutos observados e outros não, **não é um quarto estado**: ele é servido com o
valor sobre os minutos observados e o par `(present, expected)`, pela regra `P-B` de `ADR-040/D3` (*"servir
sempre, com o par de inteiros"*). Como marcá-lo na tela é do `design_gate`.

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
`02`, `04`), o `count` em `md.series` e o `n_written` são **não-regressão**: continuam `> 0`. A `03a`
**cria** dado (4 séries de polling), e ali os dois itens têm de sair de `0` para `> 0`. Os comandos e universos estão nos arquivos de fase.

| id | critério corrigido | morde |
|---|---|---|
| `CA-1′` | `count(.tv-lightweight-charts)` no `/symbol` `== 1` (**não** `count(canvas)`, porque cada pane tem os próprios canvases, `ARQ-1` §1.1); panes com `N>0` pontos = **6** na F1, **5** a partir da F4 | voltar a 6 `createChart` |
| `CA-2′` | estrutural: só o pane do rodapé tem rótulo de tempo, com assert de **pixel** | a mesma ablação de `CA-1′` (A-6) |
| `CA-3′` | hover no pane de preço em `x` ⇒ a legenda de todos os panes = valores do slot de `x` na API | **filtrar a atualização da legenda por `param.paneIndex`** (`ADR-044` §Consequências) |
| `CA-7` | como no PRD, **com** a cláusula de inconclusivo: `cor(oi_i) == sinal(close_i − open_i)` com os valores de `OiCandle`, **nos dois regimes** (§6.2) | colorir pelo preço |
| `CA-8′` | janela com buraco de M3 ⇒ `0` candle no intervalo **e** `0` candle no primeiro bucket `5m` depois do buraco (`ADR-045/D1`). Janela sem buraco ⇒ **inconclusivo** | costurar a âncora com o último ponto antes do buraco |
| `CA-9′` | (a) nenhum valor `< 0` em `setData` de liquidação; (b) a legenda mostra **exatamente 2** números, cada um `==` a sua perna na API; (c) em buckets com **as duas pernas `> 0` e distintas**, nenhum número da tela `== |long − short|`. Sem tal bucket na janela ⇒ inconclusivo (A-5) | somar ou subtrair as pernas |
| `CA-10′` | ausente ≠ zero no pane fundido, **por perna**; sem os dois estados na janela ⇒ inconclusivo | fundir os estados |
| `CA-11′` | eixo `p95 ≤ 160 ms` (`n ≥ 61`) **e** história `p95 ≤ 400 ms` (`n ≥ 10`), sem regredir sobre a baseline medida em `1.1`, **e** controle negativo que move o `p95` (`ADR-044` §Falsificador). A regressão tem critério em `ADR-044/F-7`: "+1 quadro" no `p95` de rAF em ≥ 2 de 5 rodadas, e reprova | busy-wait de 20 ms. Se ele não mover o `p95`, é `[NÃO MEDIDO]` e escala, e não sai verde |
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
| ~~`[Q-OI-1]`~~ | ✅ `O-4` | respondida | owner, `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]` | — |
| ~~`[Q-OI-2]`~~ | ✅ `U-1` | respondida | owner, mesmo rótulo | — |
| ~~`[Q-LIQ-2]`~~ | ✅ Coinalyze | respondida | owner, mesmo rótulo | — |
| ~~`[Q-ADR036]`~~ | a emenda de `ADR-036/D2` **não é necessária**: `O-2`/`O-3` foram recusadas | extinta | — | — |
| `[Q-CAD-1]` | a cadência de 60 s e os ~208 MB/ano (§6.1) | não-bloqueante | owner (veto) | 60 s |
| `[Q-STAMP-1]` | a janela de admissão `[T, T + 20 s]` do carimbo (§6.1) | inferível | `quant-architect` (fase `03a`) | 20 s |
| ~~`[Q-DG-1]`~~ | ✅ resolvida pelo `design_gate` (§3) | respondida | `design_gate` | — |
| `[Q-DG-2]` | log × linear da liquidação e do volume (`Q-VOL-2`) | inferível | `design_gate` | o de hoje |
| `[Q-DG-3]` | forma do OI em TF `1m` antes da captura, sem pavio em `5m`, e marca de fronteira entre os regimes (§6.2, §6.5) | inferível | `design_gate` + `quant-architect` | — |
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

Estado: `SPEC_DRAFT`. O **owner** revisa e roda `approve spec`, e depois vem o `/tech-lead`. A F3 é quebrada
em `03a` (coletor, `sentimento` + `infra`) e `03b` (projeção e pixel, `sentimento` + `web`).
