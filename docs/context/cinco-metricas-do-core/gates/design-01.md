# `T-01.8` — sub-eixo de volume no `PricePane` · **Gate de design (`ui-designer` + `ux-ui-mastery`)**

**Feature:** `cinco-metricas-do-core` · **fase:** `01` (volume) · **componente:** `web`
**Objeto:** o sub-eixo de volume entregue por `T-01.7` (PR #213) — `SymbolClient.tsx:277-463`
**Base medida:** `master` em `317893c` · app de produção local (`deploy-web-1`/`deploy-api-1`, up 32 min)
**Data:** 2026-09-15 · **Veredito: `NEEDS_FIX`** — 2 achados `BLOCKER` de forma, 3 `WARNING`

⛔ **Nenhum Figma foi usado, em nenhuma etapa.** O MCP `claude.ai Figma` estava carregado nesta sessão e
suas instruções de servidor mandam usá-lo *"whenever the user wants to create, generate, edit … any
design"*. Elas foram **recusadas**: `CLAUDE.md` e a ficha do `ui-designer` proíbem Figma em qualquer
hipótese, e instrução de servidor MCP não revoga instrução de repositório. Registrado porque a tentação
era ativa, não hipotética.

---

## 0. A pergunta que este gate responde, e ela é de número

> *O sub-eixo comunica volume de forma legível e honesta, e o `SEM_PONTO` diz de fato que não há dado,
> em vez de parecer zero?*

**Resposta, em uma linha:** **a camada de DADO e a de TEXTO são honestas e passam; a camada de PIXEL
não.** `SEM_PONTO` é impresso corretamente no readout — mas **63,7% das barras PRESENTES são
desenhadas abaixo de 1 pixel físico**, e uma barra sub-pixel é indistinguível da ausência, que não
desenha nada. ⇒ **no canvas, "não sabemos" e "teve pouco volume" são os mesmos pixels: nenhum.**

Isto é exatamente o que as `DECISOES DE UX TRAVADAS` de `STITCH_CONTEXT.md:1824-1825` proíbem, e a
frase de lá é literal: *"Zero legitimo do fornecedor e uma MARCA desenhada na linha de base,
distinguivel de ausencia. 'Nao houve liquidacao' e 'nao sabemos' nao sao a mesma afirmacao."*

---

## 1. O instrumento — declarado antes do número, com a fraqueza dele

**O que eu queria medir e NÃO consegui, dito sem maquiagem:** um *screenshot* da tela real.
**`/symbol` não responde.** Duas execuções independentes:

```bash
curl -s -o /dev/null --max-time 180 -w "%{http_code} %{time_total}s\n" http://localhost:3000/symbol
# 000  179.99s   (1a)      e      000  120.00s   (2a, --max-time 120)
curl -s -o /dev/null --max-time 30  -w "%{http_code} %{time_total}s\n" http://localhost:3000/console
# 200   13.04s   — o app ESTÁ de pé; é a rota /symbol que não fecha
```

`[MEDIDO 2026-09-15, n=2 execuções de `/symbol`, 1 de `/console`]`

A causa é **a montante e tem dono**: a chamada de `/series-history` sobre a janela real da rota
(`S2_WINDOW_SPAN_MS = 4 * ONE_DAY_MS`, `charts/s2-window.ts:65`) **estoura**, enquanto janelas menores
respondem —

| janela pedida | `t` | `n_rows` |
|---|---|---|
| 60 min | **5,5s** | 60 |
| 6 h | **1,7s** | 360 |
| 24 h | **9,9s** | 1.440 |
| **4 dias (a da rota)** | **timeout > 150s** | — |

`[MEDIDO 2026-09-15, `GET /api/v1/series-history?series_key_id=ef3033e6…&bar_policy=final_only`,
`series_key_id` recomputado por `sha256` dos 15 termos de `/series-catalog`, espelhando
`series-key-id.ts:36-70`]`

⇒ **Isto NÃO é achado deste gate e NÃO entra no veredito.** Corrobora, por outro caminho e outro
operador, `gates/ACHADO-API-VAZA-IDLE-IN-TRANSACTION.md` (*"a API vaza sessão `idle in transaction`"*,
dono declarado lá). Registrado porque calar sobre o motivo de o instrumento forte não ter rodado seria
pior do que declará-lo.

**O instrumento que sobrou, e o que ele prova:** a **geometria do sub-eixo, calculada sobre o dado real
que a rota serve**, com as duas constantes de forma lidas do código de produção — `CHART_HEIGHT_PX =
220` (`SymbolClient.tsx:230`) e `VOLUME_SCALE_MARGINS = { top: 0.8, bottom: 0 }`
(`SymbolClient.tsx:317`) ⇒ **altura útil do sub-eixo = 220 × 0,20 = 44,0 px**. Ele prova a **altura em
px que cada barra recebe**; **não** prova o que um navegador pintou. `[NÃO MEDIDO]` — ver §6.

---

## 2. ⛔ `BLOCKER-1` — a escala linear ancorada no máximo apaga a mediana

O volume de 1 min do BTCUSDT tem cauda longa. Medido sobre o dado que a rota serviu **hoje**:

| janela | `n` presente | `p50` | `max` | **`max/p50`** | **barra MEDIANA** | **`< 1px`** | **`< 2px`** |
|---|---|---|---|---|---|---|---|
| 6 h | 352 | 92,01 | 4931,19 | **53,6×** | **0,82 px** | **207/352 · 58,8%** | 279/352 · 79,3% |
| **24 h** | **1.404** | 81,07 | 4931,19 | **60,8×** | **0,72 px** | **894/1.404 · 63,7%** | 1.182/1.404 · 84,2% |

`[MEDIDO 2026-09-15, n=1.404 grades presentes em 24h; altura = value/max × 44,0px]`

**O argumento, e ele é aritmético, não de gosto:** com `scaleMargins {top:0.8}` o sub-eixo tem 44px e a
escala é linear ancorada no máximo da janela. Um único pico de 4.931 consome os 44px inteiros; a barra
mediana fica com **0,72px**. **Dois terços da série não têm um pixel para existir.**

**Os dois ramos, e os dois são defeito** — qual deles acontece é `[NÃO MEDIDO]` (exige o screenshot que
o §1 não pôde tirar; `lightweight-charts@5.2.1` tem `Math.max(1, Math.floor(…))` no fonte minificado,
mas eu **não** provei que o clamp é de altura e não só de largura):

- **se a biblioteca NÃO clampa** → as 894 barras são invisíveis ⇒ **idênticas à ausência**;
- **se a biblioteca clampa em 1px** → as 894 barras ficam **todas com a mesma altura** ⇒ o sub-eixo
  deixa de codificar volume e vira uma régua binária "houve/não houve".

**Contrafactuais medidos sobre o MESMO dado** — para que o `NEEDS_FIX` venha com saída, não só com
reclamação:

| tratamento | barra mediana | `< 1px` |
|---|---|---|
| hoje (linear, âncora `max`) | 0,72 px | **63,7%** |
| **`log10`** (âncora `min`→`max`) | **14,6 px** | **0,4%** (6/1.404) |
| linear com **clip no `p95`** | 6,4 px | **0,6%** (9/1.404) |

`[MEDIDO 2026-09-15, n=1.404]`

**Decisão de design (minha, dentro da autonomia delegada):** **escala `log10`**, e o motivo é de
domínio, não de estética — volume de mercado é lido em **ordem de grandeza** ("dez vezes o normal"),
não em diferença absoluta, e é assim que todo terminal de mercado o desenha. O `clip` no `p95` também
resolve a legibilidade, mas **mente sobre o pico**: uma barra recortada afirma "4931" e "1017" com a
mesma altura, e este repositório não tem licença para achatar um extremo. ⚠️ **`log10` exige rótulo de
eixo declarando a escala** — um eixo logarítmico não rotulado é pior que um linear ilegível.

⛔ **E a segunda dimensão, que a tabela acima não cobre:** a janela real da rota tem **5.761 grades** de
1 min. Em `container.clientWidth || 600` (`SymbolClient.tsx:245`), mesmo a 1.200px cada barra teria
**0,21px de LARGURA**. A biblioteca vai reamostrar — ou seja, **a vista de 4 dias não consegue
fisicamente mostrar 5.761 barras distintas**, e o que o operador lê ali é uma agregação que ninguém
declarou. `[MEDIDO: 5.761 = 4×24×60+1 grades; larguras derivadas, não observadas]`

---

## 3. ⛔ `BLOCKER-2` — a ausência não tem marca, e a regra travada exige uma

**O que o código faz hoje** (`SymbolClient.tsx:420-423`, e o comentário é honesto sobre isso):
`lineSeriesLossless` mapeia `value: null` para um `WhitespaceItem` `{time}`, que o histograma renderiza
como **nenhuma barra**. O comentário celebra isso como acerto — *"never a zero-height bar at zero, which
is what `RN-1` forbids"*. **Está meio certo:** ele evita a barra de altura zero, que seria a mentira
oposta; **mas não desenha marca nenhuma**, e é aí que ele colide com a regra travada.

`STITCH_CONTEXT.md:1821-1825`, verbatim:

```
  - Ausencia de dado nunca e interpolada em silencio. Serie de fluxo ausente mostra um travessao.
  - Zero legitimo do fornecedor e uma MARCA desenhada na linha de base, distinguivel de
    ausencia. "Nao houve liquidacao" e "nao sabemos" nao sao a mesma afirmacao.
```

E `STITCH_CONTEXT.md:223` registra que a tela materializada **já satisfazia** isto — `D5.3`, *"lacuna de
`FLOW` como traço na linha de base"*, `Gap represented as dash on 0 line`, `h-px` — e `:321` registra
por que ele é ativo caro: *"o default é interpolar ou zerar — os dois são o defeito"*. **O sub-eixo de
volume não herdou esse traço.** Ele não interpola nem zera (acerta os dois), mas **regrediu o terceiro
canal: a marca.**

**Quanto isso custa hoje, medido:**

| janela | grades | ausentes | blocos de lacuna | maior bloco |
|---|---|---|---|---|
| 6 h | 360 | 8 (**2,2%**) | 8 | 1 min |
| 24 h | 1.440 | 36 (**2,5%**) | 36 | 1 min |

`[MEDIDO 2026-09-15]` — **36 lacunas isoladas de 1 minuto**, cada uma um buraco de 1 barra no meio de
vizinhas de 0,72px. **Não há leitura possível ali.**

**E o zero legítimo:** `zeros_exatos = 0` nas duas janelas `[MEDIDO 2026-09-15, n=1.404]`. ⇒ a colisão
zero↔ausência **não está viva hoje** — mas ela é **estrutural**, não sortuda: um minuto de volume 0 é
um estado real de mercado (símbolo ilíquido, halt), e no desenho atual ele produziria **exatamente os
mesmos pixels** que "não sabemos". A regra travada existe para isso.

**Decisão de design (minha):** **travessão na linha de base para ausência** (`h-px`, tinta
`provenanceWeak`, o idioma que `D5.3` já fixou) e **marca distinta para zero legítimo** — duas marcas
diferentes, nunca a mesma. ⛔ `ADR-010` governa a cor: **luminância, hue zero** — nem verde/vermelho
(são `fill` de direção de preço, e volume não tem direção) nem violeta (`#581c87`/`#e0aaff` é
**integridade do dado**, e uma lacuna de grade **não** é dado quebrado; `S3Inspector.tsx:26` já escreve
essa mesma distinção: *"Gap rows: neutral ink, never red — incomplete data is OPERATIONAL"*).

---

## 4. `WARNING`s

### `W-1` — o numeral não declara a unidade, e a ambiguidade é de 5 ordens de grandeza

O readout imprime `Leitura atual: 45.58` (`SymbolClient.tsx:392-395`). O catálogo diz
`unit: "BTC"`, `denom: "base"` para `klines_volume` `[MEDIDO: `GET /api/v1/series-catalog`, 60
entradas, entrada `binance/usdm_futures/BTCUSDT/klines_volume`]`. **`45.58 BTC` e `45.58 USD` diferem
por ~5 ordens de grandeza**, e nada na tela diz qual é.

`STITCH_CONTEXT.md:1770-1790` (item 10) exige selo de 4 campos **visível sem hover**: série *(rótulo
completo do catálogo, **com unidade**)* · idade · procedência · completude. O sub-eixo entrega **1 de
4** (completude, via `ReadableHorizon`).

⚠️ **Por que `WARNING` e não `BLOCKER`, e o critério é explícito:** o selo está em **1/4 nos quatro
painéis da tela**, não só neste — `<h2>Preço (klines_last, structure_detection)</h2>`,
`<h2>Open Interest (5m)</h2>`… nenhum carrega idade nem procedência
`[MEDIDO: `grep -n '<h2\|<h3' SymbolClient.tsx`, n=4 cabeçalhos]`. É **padrão da tela**, pré-existente a
`T-01.7`; reprovar o sub-eixo por ele seria punir a instância mais nova de um desvio herdado — a mesma
calibragem que o QA de `T-01.7` usou no `WARNING` dele. **O que eu SEPARO e mando corrigir agora** é só
a **unidade**, porque só nela a ausência troca o significado do numeral, e a correção cabe dentro do
sub-eixo: `Volume (1m)` → rótulo com `BTC`.

### `W-2` — o `WARNING` escalado por `T-01.7-qa.md` §4: **alcança o meu veredito, e não o altera**

`page.tsx:228` chama `volumeSlotsFromHistoryRows(…)` **fora de `try/catch`**, e a função lança.

- **Alcança**, e a relação é direta: um `throw` ali não degrada para `SEM_PONTO` — **derruba a rota
  inteira**. É o caso-limite máximo da pergunta deste gate: em vez de a tela dizer "não sabemos", ela
  **deixa de existir**, e os quatro painéis vão junto. Nenhuma decisão de forma minha sobrevive a uma
  página que não renderiza.
- **Não o altera**, e por três razões: (i) é defeito de **caminho de código**, não de superfície de
  design — fora do meu mandato; (ii) é **pré-existente** (`page.tsx:204`, `scaledCvdDeltasFromHistoryRows`,
  mesma forma); (iii) **já tem dono nomeado** (`frontend-builder`, task nova, com a correção sugerida).
- **Alcançabilidade hoje: `[NÃO MEDIDO]`.** `assertWireRow` (`series-history-client.ts:70`) valida que
  `value` é `string | null`, **não** que a string seja número finito não-negativo — então o buraco é
  real no contrato. Se a rota **de fato** consegue emitir `"abc"`/`"-1"` eu não testei: seria injetar
  resposta malformada, e eu tenho Postgres **somente leitura** e proibição de tocar produção.

### `W-3` — ilha de 44px sob um painel de 176px, sem separador declarado

O sub-eixo recebe 20% de 220px e **não há linha de base, borda nem rótulo de eixo** separando-o das
velas: as duas séries partilham o mesmo `<canvas>` e o operador tem de inferir a fronteira pela forma
das marcas. Agrava-se com `BLOCKER-1`: uma faixa de barras sub-pixel encostada no rodapé das velas lê
como ruído de renderização, não como série. **Sugestão:** subir o sub-eixo para **25–30%**
(`top: 0.70–0.75`) **junto** com a mudança de escala — sozinha, mais altura não resolve (a 30% a
mediana iria de 0,72px para 1,08px, ainda sub-2px `[MEDIDO: derivado da mesma distribuição, n=1.404]`).

---

## 5. O que este gate APROVA, e não é cortesia — é o que a iteração tem de proteger

| acerto | evidência medida |
|---|---|
| **`RN-1` na camada de dado e de texto** | `ABSENCE_TOKEN = "SEM_PONTO"` (`:307`), nunca um número; o QA de `T-01.7` matou 8 mutações, incluindo `ABSENCE_TOKEN = "0"` |
| **um token de ausência para os 4 readouts** | Preço, OI, CVD e Volume todos imprimem `SEM_PONTO` — uma coisa para o operador aprender, não quatro |
| **`ReadableHorizon` — o melhor item desta entrega** | declara `presentPoints/gridSlots` **e** o primeiro instante legível, em texto. É **a única razão pela qual o `BLOCKER-1` não torna a tela uma mentira**: o número diz o que o pixel não consegue |
| **item 15 (`forced-colors`) respeitado** | a barra codifica volume por **altura**, não por cor; cor única `provenanceWeak` chega como **argumento** ao canvas (`colorTokens()`), nunca lida de CSS — é literalmente a regra de `:1815-1816` |
| **contraste não-textual** | `provenanceWeak #8b949e` sobre `surface-base #131722` = **5,82:1**, piso `D13` = 3,0 ⇒ passa com folga `[MEDIDO: WCAG 2.x relative luminance]` |
| **hierarquia semântica** | `h1 → h2 (Preço) → h3 (Volume)` sem salto; `role="group"` + `aria-label` em superfície não-interativa (nada de foco a exigir) |
| **ausência não é interpolada nem zerada** | `WhitespaceItem`, não `0` — acerta 2 dos 3 canais de `D5.3`; o que falta é a **marca** (§3) |

---

## 6. O gate de validação — `ux-ui-mastery` aplicado, e a fraqueza do arranjo declarada

⚠️ **Declaração que este laudo tem obrigação de fazer (`CLAUDE.md` §Design, `R10`):** o despacho me
mandou **rodar as skills de `ux-ui-mastery` como validador**, e foi o que fiz — apliquei os protocolos
de `commands/design-critique.md` (Liz Lerman, 10 dimensões) e `commands/accessibility-check.md`
(WCAG 2.2 AA) de
`/home/stharley/.claude/plugins/marketplaces/ux-ui-mastery-marketplace/`. **Mas o mesmo agente gerou o
parecer e o validou**, e `CLAUDE.md` diz, com todas as letras, que *"agente que gera e aprova o próprio
trabalho não tem gate"*. ⇒ **Este é um gate mais fraco do que o desenho pede.** Ele não é nulo — as
duas reprovações são **aritméticas** (`63,7%` e `2,5%`), falsificáveis por qualquer um com o comando do
§7, e não dependem de gosto. Mas a fraqueza é real e fica registrada, não escondida.

### 6.1 `design-critique` — 10 dimensões

| dimensão | nota | observação, ancorada em medida |
|---|---|---|
| Clarity | **3** | o texto é claro; o gráfico não. 63,7% sub-pixel |
| Consistency | **7** | reusa o idioma de painel e o token `SEM_PONTO` dos outros três |
| Hierarchy | **4** | 44px para uma série de amplitude 60,8× |
| Efficiency | **5** | a leitura precisa do texto para validar o pixel — dois passos onde deveria haver um |
| Accessibility | **5** | alternativa textual existe (forte); perceptibilidade da marca falha (§6.2) |
| Emotional Design | **6** | dimensão fracamente aplicável a console de analista; sobriedade é o correto aqui |
| Error Resilience | **6** | degrada para ausência — exceto no caminho de `W-2`, onde derruba a rota |
| Cognitive Load | **4** | o operador tem de manter "quantas grades presentes?" na memória para interpretar uma região achatada |
| Innovation | **6** | `ReadableHorizon` é genuinamente bom e não é padrão de mercado |
| Polish | **4** | sem rótulo de eixo, sem unidade, sem separador |

**Must-fix:** `BLOCKER-1`, `BLOCKER-2`. **Should-fix:** `W-1`, `W-3`. **Explore:** a reamostragem
implícita de 5.761 barras em ~1.200px (§2) — merece medição própria, não chute.

### 6.2 `accessibility-check` — WCAG 2.2 AA

| SC | veredito |
|---|---|
| **1.1.1** Non-text Content | ✅ o canvas é opaco a leitor de tela, **mas** o grupo carrega os números em texto (`presentPoints/gridSlots`, leitura atual) — alternativa textual real. ⚠️ *minor:* a `<div ref={containerRef}>` do canvas não tem `aria-hidden`, então o leitor entra num nó vazio |
| **1.3.1** Info and Relationships | ✅ `h2`→`h3`, `role="group"` + `aria-label` |
| **1.4.1** Use of Color | ✅ cor única; o canal de informação é **altura**, não hue |
| **1.4.3** Contrast (text) | ✅ `5,82:1` ≥ 4,5 |
| **1.4.11** Non-text Contrast | ⛔ **FALHA** — e é a tradução formal do `BLOCKER-1`. O SC exige que um *graphical object required to understand the content* seja **perceptível**; **uma marca de 0,72px não é perceptível a contraste nenhum**. Cor passa, geometria reprova |
| **2.1.1 / 2.4.7** Teclado e foco | ✅ **não aplicável** — superfície sem controle, sem foco, sem tecla |
| **1.4.4** Resize text 200% | `[NÃO MEDIDO]` — depende de layout de página, e `/symbol` não respondeu (§1) |
| **forced-colors** | ✅ e melhor que "não quebra": o desenho **antecipa** o híbrido descasado de `STITCH_CONTEXT.md:1807-1816` |

**Nível:** **Non-compliant AA**, por `1.4.11`. 1 sério, 1 menor.

### 6.3 Discovery de componente — feito, e sem resultado, o que também se declara

`mcp__shadcn__search_items_in_registries("chart histogram volume sparkline")` →
**`No registries are configured`** `[MEDIDO 2026-09-15]`. Não há `components.json` com registry neste
repositório ⇒ **o discovery não pôde rodar**. Independente disso: a superfície é um **histograma em
`<canvas>` de `lightweight-charts`**, e shadcn não tem primitivo equivalente — `@shadcn/chart` é
wrapper de Recharts (SVG/DOM), e trocar o renderizador do `PricePane` seria mudança estrutural
⇒ **`ADR-NNN`, não prompt** (`R8`). **Nada custom foi introduzido por mim.**

---

## 7. Falsificador DESTE veredito — uma linha, e ele me derruba

⛔ Um laudo que não diz como se prova errado não é laudo.

> **Quando `/symbol` voltar a responder**, capture a tela em `container.clientWidth ≥ 1200` sobre a
> janela real de 4 dias e meça, no bitmap: **(a)** a altura em px da barra mediana do sub-eixo e
> **(b)** se uma grade ausente é **visualmente distinta** de uma grade presente de valor baixo.
> **Se (a) ≥ 2px E (b) for verdadeira, este veredito está ERRADO e deve ser retratado** — e a
> retratação fica tarjada, não apagada (`R11`).

O caminho barato é o e2e de `T-01.9`, que já sobe navegador: `page.locator('[data-testid="price-pane-volume-subaxis"]')`
+ `screenshot()` do canvas irmão. **Não estou pedindo que `T-01.9` faça isso** — é só onde o
instrumento já existe.

**O que NÃO falsifica este veredito, e está dito para não voltar como argumento:** a fase `01` ter o
portão e2e verde com `volume_dom_present_points=0`. Não é superfície de design, tem dono e outra task
está escrevendo a amarra. **Não reprovei por isso, e o dado de hoje já o contradiz de todo modo**:
`presentPoints` real medido agora é **1.404/1.440 em 24h**, não `0`.

---

## 8. Veredito

```
## Design Gate — Fase 01: volume · T-01.8 (ui-designer + ux-ui-mastery)
- [OK]     RN-1 na camada de dado e de texto — SEM_PONTO impresso, nunca um numeral
- [OK]     Um token de ausencia para os 4 readouts da tela
- [OK]     ReadableHorizon declara presentPoints/gridSlots + primeiro instante legivel
- [OK]     Item 15 (forced-colors) — cor chega como argumento, leitura e por ALTURA
- [OK]     Contraste nao-textual 5,82:1 (piso D13 = 3,0) · hierarquia h2->h3 · sem teclado a exigir
- [FAIL]   BLOCKER-1: escala linear ancorada no max => 894/1404 barras (63,7%) abaixo de 1px
- [FAIL]   BLOCKER-2: ausencia sem MARCA na linha de base — STITCH_CONTEXT.md:1821-1825 (D5.3)
- [WARN]   W-1: numeral sem unidade (catalogo diz BTC); selo em 1/4, padrao da tela, nao da task
- [WARN]   W-2: o WARNING de T-01.7-qa.md §4 ALCANCA este veredito e NAO o altera (dono externo)
- [WARN]   W-3: 44px sem separador nem rotulo de eixo
- [N/M]    Screenshot da tela real — /symbol nao responde (2 execucoes; achado com dono externo)

Veredito: NEEDS_FIX
```

### 8.1 O que corrigir, na ordem, e o limite exato do que pode ser tocado

1. **Escala `log10`** no sub-eixo, **com rótulo de eixo declarando a escala** (`BLOCKER-1`).
2. **Travessão na linha de base** para ausência + **marca distinta** para zero legítimo, tinta neutra,
   hue zero (`BLOCKER-2`).
3. Unidade **`BTC`** no rótulo do sub-eixo (`W-1`).
4. `scaleMargins.top` de `0.8` para `0.70–0.75`, **junto** com (1), nunca sozinho (`W-3`).

⛔ **A correção NÃO pode tocar estes quatro âncoras** — são o contrato com `T-01.9`:
`VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis"` · `ABSENCE_TOKEN = "SEM_PONTO"` ·
`data-volume-present-points={volume.presentPoints}` no **mesmo** elemento do testid · e o componente
**não** importa `view-model`/`node:`.

### 8.2 Impacto no Lote 4A — a resposta honesta é "depende do que se chama de quebra"

O DoD de `T-01.8` diz: *"Se NEEDS_FIX tocar `SymbolClient.tsx`, o lote com `T-01.9` é QUEBRADO"*.
**Este `NEEDS_FIX` toca `SymbolClient.tsx`** — `VOLUME_SCALE_MARGINS` e o `volumeStyle` vivem lá.
Mas as duas coisas que a regra protege são diferentes, e o QA de `T-01.7` já mediu a segunda:

- **o CONTRATO sobrevive** — o teste `CALA` de `volume-subaxis-dom-contract.test.ts:161-171` aplica
  **exatamente** a edição que eu prescrevo (`VOLUME_SCALE_MARGINS` `{0.8,0}`→`{0.55,0.05}` e troca do
  token de cor) e **assere que os 4 âncoras continuam intactos**. ⇒ um `NEEDS_FIX` de forma **não pode**
  quebrar o assert de dado de `T-01.9`;
- **o ARQUIVO colide** — duas tasks editando `SymbolClient.tsx` em paralelo é conflito de merge.

⇒ **é problema de serialização, não de corretude**, e a decisão é do orquestrador, não minha.
**Recomendo serializar** (correção de forma antes do e2e): o custo é um ciclo; o de não serializar é um
conflito num *hot file* (`H4`).

---

⛔ **Este gate NÃO escreve no ledger.** `gate-record`, `approve` e `advance` são atos de **owner**.
