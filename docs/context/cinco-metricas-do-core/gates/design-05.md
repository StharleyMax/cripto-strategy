# `T-05.10` — `design_gate` do painel de liquidações (`DoD-7` da fase `05`)

**Data:** 2026-09-16 · **Cabeça julgada:** `2239ec4` · **Artefato:** `LiquidationPane` em
`frontend/src/app/symbol/SymbolClient.tsx` (+ `page.tsx`, `view-model.ts`, `panel-status.ts`),
entregue por `T-05.9`.

**Validador:** `ux-ui-mastery` 3.0.0 — protocolos `/design-critique` (Liz Lerman + 10 dimensões) e
`/accessibility-check` (WCAG 2.2 AA), lidos de
`~/.claude/plugins/cache/ux-ui-mastery-marketplace/ux-ui-mastery/3.0.0/commands/`.
**Fonte de verdade de design:** `docs/product/STITCH_CONTEXT.md` (§5 `ADR-010`, §4.1 `S2`).
**Refs da task:** `RF-3` · `RN-1` · `RS-5` · `SPEC-007 §8.7` · `docs/plans/SPEC-007-cinco-metricas-do-core/05_liquidacoes.md` linhas 46/47/51.

⛔ **Nenhuma ferramenta de Figma foi usada** — elas estão presentes neste ambiente e são proibidas
pelo owner em qualquer hipótese. O design deste repositório é no Stitch.

---

## VEREDITO: **NEEDS_FIX**

| | |
|---|---|
| **bloqueante, no escopo de `T-05.9`** | **1** — `M-1`, a falsificação do núcleo da task |
| **escalado, fora do escopo de `T-05.9`** | **1** — `M-2`, transversal aos 4 painéis e anterior a esta fase |
| **should-fix** | **2** (`S-3`, `S-4`) |
| **minor** | **1** (`m-5`) |
| **eixos aprovados sem ressalva** | **4** — duas coortes · `RS-5` · `SEM_PONTO` · `log10` rotulado |

**O painel, como está, não mente com o dado que desenha hoje.** O que reprova é a **garantia
publicada sobre ele** — que é mais forte do que a geometria entrega — e um teste que se apresenta
como contra-exemplo e **não pode falhar**. Uma garantia falsa é pior que uma garantia estreita: o
próximo leitor confia nela e remove a margem que a sustenta.

---

## 0. Os 7 números declarados pelo builder: **TODOS CONFIRMADOS, nenhum refutado**

Reproduzidos contra a biblioteca real (`lightweight-charts`, `priceToCoordinate`), com o mesmo
universo sintético de `liquidation-geometry.test.ts` e as constantes lidas da fonte de produção:

```
LOG    {"n":129,"median":90.93,"min":7.29,"subPixel":0,"absencePx":5.01,"zeroPx":15.03,"folgaPx":13.77}
LINEAR {"n":129,"median":0.43,"subPixel":75}
```

| declarado | medido | veredito |
|---|---|---|
| mediana `90,93px` | `90,93` | ✅ |
| menor barra `7,29px` | `7,29` | ✅ |
| `0/129` sub-pixel | `0/129` | ✅ |
| ausência `5,01` < zero `15,03` | `5,01` / `15,03` (razão `3,00×`) | ✅ |
| folga `13,77px` | `13,77` | ✅ |
| controle linear: mediana `0,43px` | `0,43` | ✅ |
| controle linear: `75/129` sub-pixel | `75/129` | ✅ |

**Comando** (sonda temporária, criada e removida nesta sessão — o corpo está no §6 para reprodução):

```bash
cd frontend && node --conditions=react-server --test 'src/app/symbol/zzfalsify.test.ts'
```

**E a suíte de aplicação está verde na cabeça julgada:**

```bash
cd frontend && npm run test:app
# ℹ tests 247  ℹ pass 247  ℹ fail 0  ℹ duration_ms 3046.5
```

---

## 1. `M-1` — **BLOQUEANTE.** *"disjuntas por construção, para NENHUM valor"* é **FALSO**

### O que o código afirma

`SymbolClient.tsx:483-486`:

> *"Aqui as duas faixas são DISJUNTAS por margem de escala … **Nenhuma barra, de nenhum valor,
> alcança a faixa das marcas** — a colisão deixa de depender do dado."*

`liquidation-geometry.test.ts:20-24`:

> *"no bar of **ANY** value reaches the marks band. The universe below deliberately contains a value
> far below anything ever observed on this series, precisely so the claim is tested and not assumed."*

### O que a biblioteca responde

A barra é um histograma com `base: LIQUIDATION_LOG_BASE = 1` numa escala `Logarithmic`. Um valor
**abaixo da base** desenha **para BAIXO** a partir da linha de base. `y` cresce para baixo;
`barBaselineY = 162,20` · `zeroMarkTopY = 175,97` · `absenceMarkTopY = 185,99` · piso do painel `191`:

| valor (USD) | `y` do topo da barra | altura | alcança a faixa das marcas? |
|---|---|---|---|
| `2` (o "contra-exemplo" do teste) | `154,91` | `+7,29` | não |
| `1` (= a base) | `162,20` | `0,00` | não — **é a fronteira** |
| `0,9` | `163,31` | `−1,11` | não |
| `0,5` | `169,49` | `−7,29` | não |
| **`0,27`** | `175,96` | `−13,76` | **não — último valor que escapa** |
| **`0,26`** | `176,36` | `−14,16` | **SIM — entra na faixa do zero** |
| `0,1` | `186,40` | `−24,20` | **SIM — passa do topo da marca de ausência (`185,99`)** |
| `0,01` | `210,51` | `−48,31` | **SIM — abaixo do piso do painel (`191`)** |

⇒ **A garantia não é *"para qualquer valor"*. É *"para todo valor `≥ base = 1 USD`"`** — e isso é
uma **premissa sobre o DADO**, não uma propriedade da geometria. É exatamente a classe de afirmação
que o próprio arquivo acusa a fase `01` de ter feito (*"true for that data, not guaranteed for all
data"*), só que mais estreita.

### E o limiar **anda com o dado** — que é a parte que fecha a falsificação

Com o universo real (`max 2.880.132,45`) o limiar é `≈ 0,27 USD`. Comprimindo a faixa dinâmica da
janela para `max = 1.000 USD`, ele **sobe**:

```
RANGE {"max":1000,"micro":0.5,"microY":177.71,"zeroMarkTopY":175.97,"touches":true}
RANGE {"max":1000,"micro":0.7,"microY":170.18,"zeroMarkTopY":175.97,"touches":false}
```

⇒ entre `0,5` e `0,7 USD` para uma janela de menor amplitude, contra `≈0,27` para a janela medida.
**O ponto de colisão é função da janela visível** — a dependência do dado que a seção se propôs a
eliminar sobrevive, deslocada da faixa para o limiar.

### O teste não pode falhar neste eixo

`MICRO_LIQUIDATION_USD = 2` e `LIQUIDATION_LOG_BASE = 1`. **Todo valor `> 1` está do lado seguro por
construção**, logo o assert *"the BANDS are disjoint … including one far below anything observed"*
é verdadeiro independentemente da configuração que ele diz medir. O único `MORDE` real do arquivo é
a mutação da margem (`marksMarginTop`), que mede outra coisa. Um contra-exemplo que não pode
refutar não é contra-exemplo — é decoração, e é a **mesma classe de falso-verde** que
`gates/design-01.md` encontrou e que este arquivo cita como sua razão de existir.

### Por que não é acadêmico — e aqui o repositório já mediu o gatilho

`backend/src/modules/sentimento/domain/liquidation_catalog.py:34-38`:

> *"the provider's DEFAULT (`convert_to_usd=false`) returns BASE … `[MEDIDO 2026-09-12: **BTC
> 0.003** vs DOGE 947120 sem o parametro]`"*

Se `CONVERT_TO_USD_REQUIRED` deixar de chegar à requisição, os valores chegam em **unidade base**,
na ordem de `0,003` — e **toda** barra passa a ser desenhada para baixo, atravessando a faixa
inteira das marcas. Uma regressão de unidade deixa de ser um número errado (visível) e vira uma
**liquidação real pintada exatamente onde mora o "zero legítimo"** — a mentira que este painel
inteiro existe para impedir, causada pelo modo de falha que o próprio catálogo já mediu.

### Remédio — no idioma que o repositório já escolheu

`positiveValueSeriesLossless` **já recusa** um valor negativo com `RangeError` *"em vez de
escondê-lo num dos três baldes"* (`s2-lightweight-adapter.test.ts:81`). Um valor em `(0, base)` é a
**mesma classe**: não tem posição honesta nesta escala, e hoje é escondido no balde das **marcas**
pela geometria. Em ordem de preferência:

1. **Recusar** — estender o `RangeError` a `0 < v < base`. Fecha a garantia de verdade, e o custo é
   que uma unidade errada passa a reprovar em vez de desenhar.
2. **Quarto balde** — marca própria para "abaixo da âncora da escala", com palavra na legenda.
3. **Mínimo aceitável, se 1 e 2 forem adiados:** corrigir a prosa das duas fontes para a forma
   verdadeira (*"para todo valor ≥ `base`"*), **tarjando** a afirmação anterior (`R11`), e
   acrescentar `0,26` ao universo do teste para que o assert passe a poder falhar.

---

## 2. `M-2` — **ESCALADO** (não bloqueia `T-05.9`): a janela declarada **não é a janela desenhada**

`fitContent()` não consegue caber `5.761` grades: `minBarSpacing` da biblioteca é `0,5px` e satura.
`getVisibleLogicalRange()` depois do `fitContent`, com as opções de produção (`chartConstructorOptions`):

| largura do painel | grades visíveis | % da janela de 4 dias |
|---|---|---|
| `600` (o fallback `clientWidth \|\| 600` do próprio componente) | `1.075` de `5.761` | **18,7%** |
| `1200` | `2.275` | **39,5%** |
| `1800` | `3.475` | **60,3%** |
| `2560` | `4.995` | **86,7%** |

O recorte é ancorado à **direita** (`to = 5760`) — a escolha certa — mas a esquerda sai do canvas
**em silêncio**.

**Por que isto é pior NESTE painel que em qualquer outro da tela, e é o que o torna um achado de
design e não de performance:** `LiquidationReadableHorizon` imprime, em palavras,
`"Dado legível desde <t₀> — 191/5761 grades de 1 min observadas"`. A `600–1200px`, **`t₀` não está
no canvas**. E para uma série `96,7%` ausente, *fora-da-janela* e *ausente* renderizam **idêntico**:
nada. ⇒ a colisão que toda a arquitetura do painel mata no eixo **vertical** (`ausência ↔ zero`)
reaparece no eixo **temporal** (`fora-da-janela ↔ ausência`), onde nada a guarda. No painel de
preço uma borda truncada é auto-evidente; aqui é indistinguível do estado dominante.

**Por que não bloqueia `T-05.9`:** a janela é de `request-window.ts::resolveRouteWindow` e é
compartilhada pelos **4 painéis** (`page.tsx:16`, *"TRAILING 4-day window"*) — o defeito é anterior
a esta fase e transversal. `T-05.9` o herda, não o introduz.

⚠️ `[MEDIDO 2026-09-16 em jsdom com o shim do próprio repositório, n=4 larguras]` — a aritmética de
`minBarSpacing`/`getVisibleLogicalRange` é da biblioteca e não depende de layout real, **mas não
confirmei em browser**. **Falsificador barato e já disponível:** o Playwright de `T-05.11` roda
contra o app real — ler `getVisibleLogicalRange()` lá resolve em uma linha.

---

## 3. `S-3` — **SHOULD-FIX.** Hierarquia plana: o aviso de `RS-5` no tom mais fraco do painel

`sed -n '1046,1332p' … | grep -c`: **7** nós de texto em `text-sm text-provenance-weak` contra **2**
em `text-on-surface` (os dois títulos). Ficam no mesmo peso: o rodapé da escala `log10`, a legenda,
o horizonte legível, a leitura atual, a nota de ausência — **e o aviso de terceiro de `RS-5`**, que
`SPEC-007 §7` define como o que o operador **não pode** deixar de ver.

**Não é legibilidade** — `#8b949e` sobre `#131722` mede **5,82:1**, passa AA para texto normal:

```bash
# razões calculadas sobre frontend/src/charts/color-tokens.ts:117-118 e globals.css:35
provenanceWeak  #8b949e vs #131722 = 5,82    provenanceStrong #e6e9ef vs #131722 = 14,72
weak vs strong = 2,53
```

É **hierarquia**. E `ADR-010` deixa a **luminância como único canal de ênfase** (`§5.4`: três hues,
nenhum disponível para isto) — há um degrau de **2,53** entre `provenanceWeak` e `provenanceStrong`
que o painel não gasta. **Recomendação:** a linha de `RS-5` em `provenanceStrong`; rodapé de escala,
legenda e horizonte permanecem `provenanceWeak`. Custo: zero token novo, zero hue novo.

## 4. `S-4` — **SHOULD-FIX, com dono anterior.** O `⚠️` é hue fora da paleta **e** severidade em cor

`SymbolClient.tsx:1093`. Fonte de emoji colorida **ignora o `color` do CSS** ⇒ o
`className="text-provenance-weak"` não tinge o glifo: ele renderiza como triângulo amarelo/laranja.
São **duas** regras do `STITCH_CONTEXT.md` §5 ao mesmo tempo — item 4 (*"só três hues existem na
interface: verde-teal, vermelho, violeta"*) e item 6 (*"alerta e severidade ficam FORA do canal de
cor … a regra é genérica"*, `CA-F4-10`).

**Não foi introduzido por `T-05.9`:** precedente vivo em `SymbolClient.tsx:797` (`T-03.5`, o aviso
de dado velho). ⇒ **relato, não bloqueio**; o remédio pertence ao precedente, não a esta task. A
substituição natural é a mesma que a `S1` canônica já usa e que o gate dela aprovou: **palavra +
posição**, sem glifo colorido.
`[NÃO MEDIDO: o mecanismo (fonte de emoji ignora `color`) é documentado, mas não rendericei o glifo
para medir o hue na máquina do owner.]`

## 5. `m-5` — **MINOR.** `role="status"` em conteúdo estático

`LiquidationProvenance` (`:1084`) e `AbsenceNote` (`:263`) marcam `role="status"` — região viva
(`aria-live="polite"`). Os dois existem no **primeiro paint** e nunca mutam; região viva presente no
carregamento **não é anunciada** por leitor de tela. O papel não compra nada e adiciona uma região
viva espúria. `AbsenceNote` é anterior a esta task. Trocar por `<p>` simples.

---

## 6. Os quatro eixos **APROVADOS SEM RESSALVA**

### 6.1 As duas coortes são distinguíveis — e **sem gastar hue nenhum**

Dois `<div role="group">` com `aria-label` próprio, dois `<h3>` **em palavras**
(*"Liquidação de posições compradas (long)"* / *"…vendidas (short)"*), dois gráficos separados,
dois `PanelStatus` que degradam sozinhos (`panel-status.ts:155-168`). A distinção **não depende de
cor em nenhum ponto** ⇒ WCAG 1.4.1 satisfeito por construção, não por verificação. E a recusa de
somá-las honra o argumento literal do catálogo (*"a long liquidation is forced selling and a short
liquidation is forced buying"*) em vez de apagá-lo. A escolha de **não** usar verde/vermelho aqui
está certa e o código escreve o motivo: `long`/`short` são **coortes**, não direção de vela —
pintá-las com o par de direção convidaria a ler a coorte como direção do mercado, que é o item 1 do
§5 do `STITCH_CONTEXT.md`.

### 6.2 `RS-5` — pago como **TIPO**, e isso é mais forte do que `RS-5` pede

`SeriesProvenance` (`panel-status.ts:133-141`) tem três membros e **só** `declared` carrega
`provider`/`reconstructedFrom`/`publishedError`. *"Série de terceiro sem rótulo"* **não é um estado
que esta árvore de componentes consiga expressar** — não é uma regra a lembrar. E o
`published_error === null` é **dito em voz alta com o motivo** em vez de omitido (*"não há segunda
fonte para medir a fidelidade contra, e publicar um número que ninguém mediu seria pior"*), o que
impede o operador de ler ausência de erro como ausência de dúvida. `unresolved` não colapsa em
`origin` — *"não identificamos a série"* e *"é dado de primeira mão"* são afirmações opostas e só
uma é tranquilizadora.

### 6.3 `SEM_PONTO` diz ausência, e não se parece com zero

Um token, **cinco** leituras (preço, OI, volume, CVD, liquidação) — `ABSENCE_TOKEN` em
`SymbolClient.tsx:370`. Ausência nunca renderiza `0`. E os **três** estados viajam em **palavras**
na legenda (`LiquidationMarksLegend`), com o glifo `aria-hidden` porque é a cópia redundante ⇒ a
distinção sobrevive a escala de cinza **e** a leitor de tela, que é o teste que o §5 item 2 do
`STITCH_CONTEXT.md` cobra de toda distinção desta interface. A tinta da legenda sai do **mesmo**
`colorTokens()` das séries, então uma legenda que minta sobre a cor da marca não é expressável.

### 6.4 A escala `log10` é **rotulada**

`LiquidationScaleNote` imprime a base e diz que um degrau é uma ordem de grandeza. Fecha, em texto
no DOM (alcançável por leitor de tela e asserível), o achado literal da fase `01` — *"um eixo
logarítmico não rotulado é pior que um linear ilegível"*.

---

## 7. `/design-critique` — as 10 dimensões

| dimensão | nota | observação |
|---|---|---|
| Clarity | 8 | três estados nomeados em palavras; a escala é declarada. Perde por `M-2`: a janela dita não é a desenhada |
| Consistency | 8 | reusa o idioma de `VolumeSubAxis`/`CvdPane` token a token; perde pelo `⚠️` (`S-4`) |
| Hierarchy | 5 | `7/9` nós no mesmo tom; o aviso de `RS-5` pesa igual a um rodapé (`S-3`) |
| Efficiency | 8 | tudo visível sem hover, nenhum clique para chegar ao fato |
| Accessibility | 8 | AA no contraste (`5,82`), 1.4.1 sem cor, legenda em palavras; `m-5` e `S-4` descontam |
| Emotional Design | 7 | sóbrio e correto para o domínio; o `⚠️` é o único ruído afetivo |
| Error Resilience | 6 | excelente contra o dado ausente; **frágil contra a unidade errada** (`M-1`) |
| Cognitive Load | 6 | cinco parágrafos de prosa em tom único antes do primeiro gráfico |
| Innovation | 9 | separar a colisão em **séries** em vez de num `if` de cor é a decisão certa e rara |
| Polish | 7 | números reproduzem ao centésimo; a garantia publicada é que não se sustenta |

**Média: 7,2/10.**

---

## 8. Reprodução — a sonda usada no §0 e no §1

Criada em `frontend/src/app/symbol/zzfalsify.test.ts` e **removida** ao fim da medição (a suíte na
cabeça julgada não a contém). Ela replica `measureCohortSurface` de `liquidation-geometry.test.ts`
com **uma** mudança: o valor micro vira parâmetro, e `maxValue` do universo também. Para reproduzir,
copie `liquidation-geometry.test.ts`, troque

```ts
const MICRO_LIQUIDATION_USD = 2;
```

por um parâmetro, e imprima `barSeries.priceToCoordinate(micro)` contra
`zero.priceToCoordinate(LIQUIDATION_ZERO_MARK_PX)` para `micro ∈ {2, 1, 0.9, 0.5, 0.27, 0.26, 0.1, 0.01}`.
Para o §2, depois de `chart.timeScale().fitContent()` e `flushFrames`, leia
`chart.timeScale().getVisibleLogicalRange()` para `width ∈ {600, 1200, 1800, 2560}` com `5.761` grades.

---

## 9. O que `T-05.9` precisa fazer para este gate virar APROVADO

1. **`M-1`** — fechar a garantia (recusar `0 < v < base`, ou quarto balde) **ou** corrigir a prosa
   das duas fontes para a forma verdadeira **com tarja** (`R11`) e acrescentar `0,26` ao universo do
   teste, para que o assert de disjunção passe a poder falhar.

Só isto bloqueia. `M-2` sai para uma task própria (transversal aos 4 painéis); `S-3`, `S-4` e `m-5`
são recomendações, e `S-4`/`m-5` têm dono anterior a esta fase.

⚠️ **Lentidão de `/symbol` (245 s com 6 séries) NÃO foi considerada** — dono externo declarado,
`ACHADO-API-VAZA-IDLE-IN-TRANSACTION`.

⛔ **Nada foi escrito no Postgres. Nenhum deploy. `gate-record` NÃO foi gravado** — é ato do owner.

---

# APÊNDICE A — READJUDICAÇÃO de `T-05.10` sobre `affc254` (2026-09-16)

**Cabeça:** `affc254` (`fix(cinco-metricas-do-core): T-05.9/M-1 …`) · **Apêndice append-only:** o
veredito `NEEDS_FIX` do corpo acima fica **intacto**, era correto para `2239ec4`, e o que muda é o
estado, não o julgamento anterior (`R11`). Validador `ux-ui-mastery` 3.0.0. **Nenhum Figma.**

## A.0 VEREDITO: **APROVADO**

`M-1` **FECHADO**, e por um argumento **mais forte** que as três opções que o §1.5 do corpo ofereceu.
`S-3` e `m-5` fechados e verificados. Seguem abertos, como combinado e **fora do escopo desta task**:
`M-2` (escalado, transversal aos 4 painéis) e `S-4` (dono anterior, `SymbolClient.tsx:797`).

## A.1 A garantia nova, medida por mim — e ela é incondicional no DADO

A linha de base **não** é piso; o **piso** é. A série de barras está sozinha numa escala
**autoescalada** ⇒ o menor valor **visível** cai, por definição, em `y = H·(1 − bottom)`, e a faixa
das marcas só começa em `H·top`. O separador é `0,85 < 0,88`, **desigualdade entre duas constantes de
produção**. Medido com `priceToCoordinate` contra a biblioteca real, micro **dentro** do recorte:

| micro (USD) | menor barra **desenhada** | linha de base | veredito |
|---|---|---|---|
| `2` | `154,91` | `162,20` | acima da base, nada desce |
| `0,26` | **`162,20`** | `149,24` | piso |
| `0,1` | **`162,20`** | `141,31` | piso |
| `0,01` | **`162,20`** | `125,51` | piso |
| `0,003` (o default do fornecedor) | **`162,20`** | `118,76` | piso |
| **`1e-9`** — 6 ordens abaixo do contra-exemplo deles | **`162,20`** | **`102,96`** | **piso** |

`barBandFloorY = 162,35` (`paneFloorY 191 × 0,85`) · `marksBandTopY = 168,08` · `zeroMarkTopY = 175,97`
⇒ **folga de `5,88px` até a faixa** e `13,77px` até o topo da marca de zero. **O piso é invariante no
valor em 7 ordens de grandeza; quem anda é a linha de base.** Estendi o universo deles em dois eixos
e nenhum quebrou: **largura `600`** (o próprio fallback `clientWidth || 600` do componente) devolve
`162,20` idêntico, e **dois sub-base visíveis de magnitudes diferentes** (`0,003` + `0,1`) também —
o menor cai no piso e o outro fica acima dele.

```bash
# sonda temporária (criada, medida e removida; árvore limpa), replicando a config de produção
# lida da fonte, com o micro DENTRO do recorte de fitContent:
cd frontend && node --conditions=react-server --test 'src/app/symbol/zzr.test.ts'
```

## A.2 ⛔ TARJA — o meu `0,26 → 176,36` do `M-1` era **EXTRAPOLAÇÃO**, e a correção é deles

`MICRO_AT_ORDINAL = 95` punha o contra-exemplo na grade `2850`, **fora** do recorte `[3485, 5760]`
que o `fitContent` deixa visível. `priceToCoordinate` responde para um bucket que **não é pintado**.
Com o micro **dentro** do recorte o mesmo `0,26` devolve `162,20` — o piso. ⇒ **a tabela do §1.2 do
corpo mede coordenadas de barras que não existem na tela.**

**O que NÃO muda, e é por isso que o `M-1` era um achado e não um engano:** o diagnóstico estava
certo — *"a linha de base não é piso, e valor abaixo da base desenha para baixo"* é verdadeiro, e é
exatamente o que a linha de base andando de `162,20` para `102,96` demonstra. Errada era a
**magnitude**, medida sobre uma barra não pintada. A afirmação falsa que o `M-1` derrubou
(*"nenhuma barra, de nenhum valor"*, justificada **pela linha de base**) era falsa pelo motivo que o
`M-1` deu.

**E a pergunta que eu me fiz antes de aceitar a atenuação — a garantia está escorada no `M-2`?**
**Não.** O invariante é sobre o conjunto **visível**, e o autoescale recomputa a cada recorte ⇒
consertar o `M-2` (fazer as `5.761` grades caberem) **mantém** a garantia verdadeira, porque todo
bar que entra no recorte entra também no autoescale. `M-1` não é sustentado por um defeito aberto.

## A.3 As duas não-coberturas declaradas: bastam?

**(a) Não é incondicional na CONFIGURAÇÃO — BASTA, com uma ressalva registrada.** Fixar o autoescale
devolve a colisão: medi `y = 221,47` com `autoscaleInfoProvider` na série de barras, **abaixo do piso
do painel (`191`)** — o número deles reproduz ao centésimo. A guarda de fonte
(`productionBarScaleIsAutoscaled`) é **ancorada em dois blocos nomeados** (`barStyle` e o
`barSeries.priceScale().applyOptions`), cada um com `assert.ok` que **falha em vez de defaultar** se
a âncora mover — é exatamente o conserto do modo de falha de regex não-ancorada que o próprio builder
achou em `volume-subaxis-dom-contract.test.ts`. ⚠️ **Resíduo, não bloqueante:** há uma **terceira**
superfície que a guarda não lê — `chartConstructorOptions` (`rightPriceScale.autoScale`), que governa
a escala default que a série de barras usa. Hoje o buraco é teórico (`grep -n 'autoScale\|rightPriceScale'
frontend/src/app/symbol/chart-options.ts` → **0 linhas**), e a casa natural dele é
`chart-construction.test.ts` (`DR-1`), que já policia os `createChart`. Registro, não cobro.

**(b) Barra fora do recorte não é desenhada — BASTA**, pelo argumento de A.2: nada é pintado lá, e
quando entra, entra no autoescale. A atribuição ao `M-2` está correta.

## A.4 As três mutações, replantadas por mim numa CÓPIA da árvore

Cópia em scratchpad com `node_modules` por symlink (o `frontend/e2e/` do agente de `T-05.11` **não
foi tocado**); linha de base da cópia **13/13 pass**; cada mutação revertida e `diff -q` conferido.

| mutação | testes vermelhos |
|---|---|
| contra-exemplo de volta para `2` | **3** — o guarda do universo **e OS DOIS MORDE** (`dropping the bars' bottom margin…`, `pinning the bar scale's autoscale…`) |
| `autoscaleInfoProvider` na série de barras em **produção** | **1** — `production leaves the bar scale AUTOSCALED` |
| margem inferior `0,15 → 0,10` | **3** — `the BANDS are disjoint by SCALE MARGIN`, `the bar band's FLOOR…`, `the same holds when the WHOLE series arrives in base units` |

✅ **A alegação central CONFIRMADA: repor `2` derruba os dois `MORDE`** ⇒ prova direta de que o
contra-exemplo antigo **não podia reprovar**, que é o vício que o §1.4 do corpo nomeou.
✅ **E a mutação da margem é bem escolhida**, como o commit declara: com `bottom = 0,10` o piso vai a
`191 × 0,90 = 171,9`, **ainda acima** do topo da marca de zero (`175,97`) ⇒ um assert escrito contra a
**marca** sobreviveria a ela. O assert é contra a **faixa**, e por isso morde.

## A.5 `S-3` e `m-5` — fechados e verificados

- **`S-3`:** a linha de `RS-5` subiu para `text-provenance-strong` — `#e6e9ef × #131722` = **`14,72:1`**
  contra os `5,82:1` de antes. Gasta o degrau de `2,53` que eu apontei, **sem token novo e sem hue
  novo** (`ADR-010` §5.4: luminância é o único canal). Rodapé de escala, legenda e horizonte
  permanecem `provenance-weak` ⇒ a hierarquia que faltava existe.
- **`m-5`:** `grep -c 'role="status"' frontend/src/app/symbol/SymbolClient.tsx` → as **2** ocorrências
  restantes são **comentários** que registram a remoção (`:263`, `:1123`). **Zero região viva espúria.**

## A.6 Suíte na cabeça readjudicada

```bash
cd frontend && npm run test:app     # ℹ tests 252  ℹ pass 252  ℹ fail 0   (era 247)
```

⚠️ **Uma divergência de `0,88px` num número publicado, e ela não muda argumento nenhum:** o commit e o
comentário de produção declaram a faixa das marcas em `168,96`; eu meço **`168,08`**
(`paneFloorY 191 × 0,88`). Registro porque *"número publicado que não reproduz"* é defeito conhecido
deste repositório mesmo quando é inócuo — e aqui é inócuo: a folga sobra por `5,88px` de qualquer forma.

## A.7 O que segue aberto depois deste APROVADO

| item | estado | dono |
|---|---|---|
| `M-2` — janela declarada ≠ janela desenhada (`18,7%` a `600px`) | **aberto, escalado** | task própria, transversal aos 4 painéis |
| `S-4` — o `⚠️` é 4º hue + severidade em cor | **aberto** | precedente `SymbolClient.tsx:797` (`T-03.5`) |
| resíduo de A.3(a) — `chartConstructorOptions` fora da guarda | **registrado, não cobrado** | `chart-construction.test.ts` (`DR-1`) |

⛔ Postgres **somente leitura**, **sem deploy**, sonda e cópia removidas, `frontend/e2e/` intocado,
**nenhum Figma**, **`gate-record` NÃO gravado** — é ato do owner.
