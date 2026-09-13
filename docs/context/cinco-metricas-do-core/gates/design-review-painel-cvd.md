# Design Review — painel de CVD em `/symbol` (PR #220, `74d59a4`)

**Feature:** `cinco-metricas-do-core` · **Componente:** `web` · **Gate:** `ux-ui-mastery:design-review`
**Data:** 2026-09-12 · **Alvo:** `frontend/src/app/symbol/` em `74d59a4`
**Relatório do autor:** [`F02-integracao-cvd-e-conserto-do-portao-e2e.md`](F02-integracao-cvd-e-conserto-do-portao-e2e.md)

> **Autoridade deste documento:** `CLAUDE.md` §"Design — autonomia delegada, com gate de validação".
> Nenhuma decisão de design desta PR vale antes deste veredito. O owner intervém por exceção.
>
> ⛔ **Figma não foi usado, em nenhum passo.** Proibido neste repositório sem exceção; todo design é
> no Stitch. Esta revisão é inspeção de código + aritmética WCAG sobre a paleta declarada.

---

## Veredito: **NEEDS_FIX**

### Pontuação geral: **59/100**

O defeito que reprova **não é de gosto e não é de forma** — é que **o portão de contraste desta
feature afere contra um fundo que não é o fundo em que a série é pintada.** `D13` fixou o piso de
3,0:1 contra `SURFACE_BASE = #131722`; o `<canvas>` do `lightweight-charts` é criado **sem
`layout`**, e o default publicado da biblioteca é `#FFFFFF`. A linha de **delta** do CVD mede
**14,72:1 no portão e 1,22:1 na tela**.

Isto é, **letra por letra, o modo de falha que `color-tokens.ts:50` já registra** ("where the OI
line was drawn `#131722` on a `#131722` surface: `1,00:1`, invisible") — reintroduzido pelo lado
oposto. O portão continua verde. É `rc=0` que não distingue *"nada erodiu"* de *"o instrumento
mede a referência errada"*, exatamente o que `ADR-012` nomeia.

**O que NÃO reprovou, e está declarado para não ser reaberto:**

- **Mobile Experience — FORA DE ESCOPO**, não pontuado e **excluído da média**. `D14`
  `[PREMISSA-OWNER: 2026-09-11]`: *"sem mobile no piloto"*. Nenhum achado deste relatório é sobre
  toque, viewport estreito ou alvo de 44px.
- **`directionOn` (`#131722`, 1,00:1 contra a superfície) NÃO é defeito.** Ele é aferido sobre os
  **fills** das velas (`directionUpFill` 5,01 / `directionDownFill` 4,59), não sobre o fundo —
  `CONTRAST_BACKDROP` o marca com `kind` próprio justamente por isso. Medir contra a referência
  errada já produziu um defeito falso aqui; não se repete.
- **O vão de ~95% NÃO é defeito — é a parte mais bem resolvida da tela.** Ver §Forças.

---

## Pontuação por domínio

| Domínio | Nota | Resumo em uma linha |
|---|---|---|
| Heuristic Compliance | **6**/10 | Status do sistema exemplar; reconhecimento-sobre-memória falha: duas linhas sem legenda |
| Research Foundation | **9**/10 | Cada decisão da tela carrega medição, `[MEDIDO]` e ADR — inclusive a que motivou o horizonte |
| Mobile Experience | **N/A** | Fora de escopo por `D14`; não pontuado, não entra na média |
| Desktop Experience | **4**/10 | Altura fixa 220px, sem resize, sem teclado, sem tooltip, float cru sem unidade |
| Visual Design | **3**/10 | Canvas branco em página escura; a série principal a 1,22:1 |
| Accessibility | **4**/10 | Semântica de DOM boa; canvas sem nome acessível, série só por cor, 1.4.11 violado na tela |
| Interaction Design | **5**/10 | `fitContent()` correto; crosshair default, `formatFlowValue` existe e não é ligado |
| Future-Readiness | **6**/10 | Andaime SSE presente e honesto sobre estar desligado |
| System Architecture | **7**/10 | Tokens, barrel, fronteira RSC e testid-vs-forma exemplares — e o chart não consome os tokens |
| Ethics & Content | **9**/10 | `SEM_PONTO` nunca zero, vão não encolhido, âncora nomeada, "ao vivo" não finge |

**Média sobre os 9 domínios em escopo:** `(6+9+4+3+4+5+6+7+9)/9 = 5,89` ⇒ **59/100**.

### Radar (para visualização)

```
Heuristic 6 · Research 9 · Desktop 4 · Visual 3 · A11y 4
Interaction 5 · Future 6 · Architecture 7 · Ethics 9      (Mobile: excluído — D14)
```

---

## Os 3 achados mais graves

### 🔴 `DR-1` (BLOQUEANTE) — o `<canvas>` é branco; o portão de contraste afere contra outro fundo

**`frontend/src/app/symbol/SymbolClient.tsx:178-182`**

```ts
const chart = createChart(container, {
  width: container.clientWidth || 600,
  height: 220,
  timeScale: { timeVisible: true, secondsVisible: false },
});
```

Nenhum `layout`. Nenhum `applyOptions`. O `git grep` sobre `frontend/src/app/symbol` e
`s2-lightweight-adapter.ts` devolve **3 ocorrências de `applyOptions`/`priceScaleId`, todas do
sub-eixo de volume, nenhuma de `layout`/`background`/`textColor`**:

```bash
git grep -n 'applyOptions|layout:|background|textColor' 74d59a4 -- frontend/src/app/symbol frontend/src/charts/s2-lightweight-adapter.ts
# 3 linhas, todas VOLUME_PRICE_SCALE_ID / VOLUME_SCALE_MARGINS
```

O default da biblioteca instalada (`lightweight-charts ^5.2.1`), lido do bundle de produção:

```bash
grep -ooE 'background:\{type:"?[a-zA-Z]+"?,color:"#[0-9a-fA-F]{3,6}"\}' \
  frontend/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs | head -1
# background:{type:"solid",color:"#FFFFFF"}
grep -ooE 'textColor:"#[0-9a-fA-F]{3,6}"' ... | head -1
# textColor:"#191919"
```

A página é `--color-surface-base: #131722` (`frontend/src/app/globals.css:35`, `body` em `:144`).
**Três retângulos brancos numa página escura** — violação direta de `D13` ("tema único e escuro").

**E o efeito no portão, que é o que faz disto bloqueante.** `CONTRAST_BACKDROP`
(`frontend/src/charts/color-tokens.ts:159-165`) declara `provenanceStrong` e `provenanceWeak` como
`{ kind: "surface", minRatio: 3.0 }` — piso de WCAG 1.4.11 **contra `SURFACE_BASE`**. Mas a tinta
é pintada sobre `#FFFFFF`:

```bash
node c.mjs   # fórmula de contrast.ts:25-42, verbatim
```

| papel | contra `#131722` (o que o portão afere) | contra `#FFFFFF` (o fundo REAL do canvas) |
|---|---|---|
| `provenanceStrong` — **linha de delta do CVD** | 14,72 | **1,22** ⛔ |
| `provenanceWeak` — linha de acumulado + histograma de volume | 5,82 | 3,08 (passa raspando) |
| `dataBrokenInk` | 9,68 | **1,85** ⛔ |
| `directionUpFill` | 5,01 | 3,57 |
| `directionDownFill` | 4,59 | 3,90 |

`[MEDIDO 2026-09-12, n=5 papéis de cor, fórmula de `frontend/src/charts/contrast.ts:25-42`]`

**A série principal deste painel — o delta do CVD — está a 1,22:1. Ela é, na prática, invisível.**
As velas sobrevivem (3,57/3,90 ainda passam de 3,0); o CVD não. E o texto de eixo da biblioteca
(`#191919`) contra a página escura mede **1,02:1** — a ruptura fica visível na moldura do canvas.

**Correção:** `createChart` recebe `layout: { background: { color: colorTokens()... }, textColor: ... }`
e `grid` derivados dos tokens. **O teste que impede a reincidência não é de cor — é de referência:**
o portão de contraste tem de aferir contra a cor que o chart realmente aplica, não contra uma
constante que ninguém garante que o chart usa. Enquanto forem duas verdades separadas, o portão
volta a mentir.

---

### 🔴 `DR-2` (BLOQUEANTE) — delta e acumulado compartilham a MESMA escala de preço

**`frontend/src/app/symbol/SymbolClient.tsx:444-447`**

```ts
const deltaSeries = chart.addSeries(LineSeries, { color: tokens.provenanceStrong });
deltaSeries.setData(lineSeriesLossless(panels.cvd.deltaSlots) as never);
const cumulativeSeries = chart.addSeries(LineSeries, { color: tokens.provenanceWeak });
cumulativeSeries.setData(lineSeriesLossless(panels.cvd.cumulativeSlots) as never);
```

Nenhuma das duas declara `priceScaleId` ⇒ ambas caem na escala direita default.

**O próprio arquivo já argumentou o contrário, 200 linhas acima** — `SymbolClient.tsx:244-246`,
sobre o sub-eixo de volume:

> *"`priceScaleId` is a scale of its OWN, separate from price's — that part IS structural …, since
> sharing price's scale would flatten one of the two series into nothing."*

O princípio foi aplicado ao volume e **não** ao CVD, no mesmo commit. E aqui ele é mais forte, não
mais fraco: o acumulado **é a soma corrida dos próprios deltas plotados ao lado** —
`cvdCumulativeScaled` acumula de `anchorMs` sobre todo bucket presente
(`frontend/src/charts/s2-cvd.ts:176-193`), e a âncora é `request.windowStartMs`
(`frontend/e2e/10-cvd-dado-real.spec.ts:308`), isto é, **antes dos 290 pontos**. Logo
`max|cum| ≥ max|delta|` **por construção**, com igualdade só no caso degenerado de um único bucket
presente. O eixo fica rotulado em unidades de acumulado, e a amplitude legível do delta é no máximo
`max|delta| / max|cum|` da altura do painel.

`[INFERRED: a desigualdade é aritmética da soma corrida, não medição — a razão numérica em dado real
fica [NÃO MEDIDO]: a API de leitura não está de pé nesta sessão e o gate não sobe ambiente.]`

**Correção:** escala própria para o acumulado (`priceScaleId: "cvd_cum"`, `scaleMargins` como o
volume já faz em `:349`), **ou** a decisão explícita de separar em dois painéis. O que não é
aceitável é a escala compartilhada **por omissão** — não houve decisão aqui, houve default.

---

### 🟠 `DR-3` (BLOQUEANTE) — duas linhas distinguidas só por cor, sem legenda; e o acumulado não tem leitura nenhuma

**`frontend/src/app/symbol/SymbolClient.tsx:444-447` (encode) · `:463` (título) · `:465-467` (readout)**

O único lugar que nomeia as duas séries é o `<h2>`: `"CVD (delta e acumulado)"`. Não há legenda, não
há chave de cor, não há `lastValueVisible`/`priceLineVisible` diferenciados. **Qual linha é qual só
pode ser descoberto por tentativa** — falha de H6 (reconhecimento sobre memória) e de **WCAG 1.4.1
(Use of Color)**: a cor é o único portador da informação.

Agravado por `DR-1`: com o delta a 1,22:1 sobre branco, o operador não vê **duas** linhas — vê uma.

**E o acumulado não tem leitura numérica em lugar nenhum.** O painel desenha duas séries e lê
exatamente uma:

```tsx
const deltaReading = resolveFlowReading(panels.cvd.deltaSlots, ...);   // :449
<p data-fact={`cvd_last_reading:${deltaReading.kind}`}>Delta atual: {readingText}</p>  // :465-467
```

Preço, OI e Volume cada um imprime a sua "Leitura atual". O acumulado do CVD — a curva cuja âncora a
tela faz questão de declarar em `:473-475`, justamente porque *"three anchors over the same deltas
invert the sign of the total"* — **não tem número no DOM.** A tela cuida do rigor da âncora e depois
não diz qual valor ela ancorou. Isto também deixa `DoD-3` mais fraco do que precisa: há uma série
renderizada sem nenhum falsificador de DOM sobre o seu valor.

**Correção:** legenda com a marca de cor **e** o rótulo textual por série; `Acumulado atual: <n>`
ao lado de `Delta atual:`, com o mesmo `ABSENCE_TOKEN` — a razão de `:228-237` (um token, quatro
readouts) vale igual para o quinto.

---

## Achados restantes

| id | sev | arquivo:linha | achado |
|---|---|---|---|
| `DR-4` | 🟠 | `SymbolClient.tsx:179-184` | `width: container.clientWidth \|\| 600` lido **uma vez, no mount**, e o efeito só depende de `[containerRef]`. Sem `ResizeObserver` e sem `autoSize`. Redimensionar a janela num app de desktop deixa o chart com a largura antiga — e o `\|\| 600` significa que um mount antes do layout congela 600px para sempre. |
| `DR-5` | 🟠 | `SymbolClient.tsx:297, 359-362, 390-391, 455` | **`String(value)` cru, sem unidade e sem agrupamento.** `unscale` devolve `number` a partir de `QUANTITY_SCALE = 100_000_000n` (`s2-cvd.ts:47,194`) ⇒ até 8 decimais. O operador lê `-1234.56789012` sem saber se é BTC, contrato ou USD. Nenhum readout da tela carrega unidade. Em ferramenta de trading isto é leitura, não estética. |
| `DR-6` | 🟠 | `SymbolClient.tsx:368, 395, 464` | O `<div>` que hospeda o canvas não tem `role`, nome acessível nem `aria-hidden`. Leitor de tela encontra um nó vazio. Os readouts compensam **o último instante**, não a série. Mínimo: `aria-hidden="true"` no container + o texto já existente como alternativa declarada. |
| `DR-7` | 🟡 | `SymbolClient.tsx:178-184` | Sem `crosshair`/tooltip configurado. `formatFlowValue` (`D5.3`) existe em `charts` como a redação de crosshair e **não é ligada em lugar nenhum desta tela** — o operador passa o mouse e recebe a formatação default da biblioteca, que não conhece `SEM_PONTO`. Num painel com ~95% de vão, o hover é o gesto principal. |
| `DR-8` | 🟡 | `SymbolClient.tsx:146` | `role="status"` num `<p>` renderizado pelo servidor e nunca atualizado. Live region é para **mudança**; em conteúdo estático o anúncio depende do timing de hidratação. `AbsenceNote` deveria ser prosa comum. |
| `DR-9` | 🟡 | `color-tokens.ts:32` vs `SymbolClient.tsx:343, 444, 446` | `provenanceStrong`/`provenanceWeak` são a **rampa de procedência** (`ADR-010/D-4`) e estão sendo usadas como **identidade de série**: delta, acumulado, histograma de volume, linha de OI e todo texto secundário saem dos mesmos dois papéis. O sistema de tokens não tem papel de identidade de série — e por isso "cor fraca" passou a significar quatro coisas. É dívida de design system, não bug. |
| `DR-10` | 🟢 | `SymbolClient.tsx:463` | Microcopy: `"CVD (delta e acumulado)"` no `<h2>` e `"Delta atual:"` no readout enquanto os outros três painéis dizem `"Leitura atual:"`. Aceitável **depois** de `DR-3` (com dois readouts a distinção passa a ser necessária); hoje só destoa. |

---

## Top 3 forças — e elas não são pequenas

1. **A ausência é tratada como TIPO, não como zero, e a tela inteira é coerente nisso.**
   `lineSeriesLossless` mapeia slot ausente para `WhitespaceItem` (nada desenhado, nunca um `0`);
   `ABSENCE_TOKEN = "SEM_PONTO"` é um token só para os quatro readouts (`:224-238`); `AbsenceNote`
   diz em pt-BR *"Nenhum número é mostrado no lugar (nunca um zero fabricado)"*. O comentário de
   `:450-453` argumenta corretamente que um `0` ali seria **uma afirmação sobre o mercado feita a
   partir de ignorância**. Isto é `RN-1` implementado, não citado.

2. **O horizonte legível é DECLARADO sem encolher o vão — e a recusa em encolher está escrita.**
   `CvdReadableHorizon` (`:416-430`) imprime *"Dado legível desde `<instante>` — 290/5760 grades de
   1 min na janela"*, e `:90-92` / `:111` registram, com ⛔ explícito, que **o span não é encurtado
   para caber no dado**: *"a window that shrinks to hide its own hole is worse than one that names
   it"*. Esta é a decisão mais difícil da tela e ela foi tomada do lado certo. **Não mexer.**

3. **A âncora do acumulado é nomeada na tela** (`:469-475`), porque três âncoras sobre os mesmos
   deltas invertem o sinal do total (`D4.7`). Uma curva acumulada sem âncora declarada é um gráfico
   que não pode ser lido, e quase todo produto do ramo omite isso. Menção honrosa à separação
   **testid é contrato / forma é do design gate** (`:209-222`), que é o que torna este review capaz
   de pedir mudança de forma sem quebrar o falsificador de ninguém.

---

## Roteiro de correção

### Quick wins (< 1 dia) — **os dois primeiros destravam o veredito**

1. **`DR-1`** — `layout: { background, textColor }` + `grid` a partir de `colorTokens()` no
   `createChart`. **E o portão passa a aferir contra a cor que o chart aplica**, não contra
   `SURFACE_BASE` por suposição. Sem esta segunda metade o defeito volta sem aviso.
2. **`DR-2`** — `priceScaleId` próprio para o acumulado, com `scaleMargins`, no molde de `:344-349`.
3. **`DR-3`** — legenda por série (marca + rótulo, não só cor) e `Acumulado atual:` com `ABSENCE_TOKEN`.
4. **`DR-8`** — remover `role="status"` de `AbsenceNote`.
5. **`DR-6`** — `aria-hidden="true"` no container do canvas.

### Médio (1-5 dias)

6. **`DR-5`** — um formatador de número único em `charts`: unidade, agrupamento, casas decimais por
   natureza de série. Um lugar, quatro readouts, mesma disciplina de `ABSENCE_TOKEN`.
7. **`DR-4`** — `ResizeObserver` (ou `autoSize`) no `useLightweightChart`.
8. **`DR-7`** — ligar `formatFlowValue` ao crosshair; com ~95% de vão, o hover tem de saber dizer
   `SEM_PONTO`.

### Estratégico (1+ semana)

9. **`DR-9`** — papéis de **identidade de série** no design system, separados da rampa de
   procedência. Hoje os dois eixos semânticos compartilham dois tokens.
10. **Alternativa textual de série**, não só do último instante — tabela navegável por teclado sob
    cada painel. Fecha `DR-6` de verdade e dá ao `<canvas>` um equivalente real.

---

## Reteste

O `NEEDS_FIX` se levanta com `DR-1`, `DR-2` e `DR-3` corrigidos. `DR-1` exige **evidência medida**,
não afirmação: a razão de contraste de cada papel de série **contra a cor que o chart efetivamente
aplica**, com o comando que a produziu — mesma tabela de cinco linhas acima, refeita.


---
---

# REVALIDAÇÃO — PR #220 em `c7e17fc` (2026-09-12)

> ⛔ **Apêndice.** Nada acima foi reescrito. O veredito de `74d59a4` (**NEEDS_FIX, 59/100**) continua
> válido *para aquele commit* e é o termo de comparação desta seção.

**Alvo:** `frontend/src/app/symbol/` + `frontend/src/charts/` em `c7e17fc` · **Gate:**
`ux-ui-mastery:design-review` · **Relatório do autor:** [`F02-DR-1-DR-2-DR-3-correcao.md`](F02-DR-1-DR-2-DR-3-correcao.md)

⛔ **Figma não foi usado, em nenhum passo** (proibido neste repositório, sem exceção).
⛔ **Nenhum código de produção foi alterado por esta revisão.** Toda medição rodou num *worktree*
descartável em `c7e17fc`, restaurado ao final (`git status --porcelain` ⇒ vazio).

## Veredito: **APPROVED**

### Pontuação geral: **71/100** (era 59/100)

Os **três bloqueantes estão pagos**, e a condição de reteste que este documento fixou —
*"`DR-1` exige evidência medida … a razão de contraste de cada papel de série **contra a cor que o
chart efetivamente aplica**"* — foi satisfeita **e falsificada por mim**, não aceita pela palavra.

⚠️ **Mas uma afirmação do autor é falsa como está escrita, e isso vira `DR-11`** (novo, não
bloqueante). Ver §"O que eu NÃO aceitei pela palavra".

---

## O que eu NÃO aceitei pela palavra — os três MORDE, rodados por mim

Universo: `c7e17fc` num worktree próprio, `node_modules` hardlinkado, `backend/.venv` do repo.

### MORDE A — remover o `layout` de `chartConstructorOptions()`

```bash
# mutação: apaga o bloco `layout: { background: …, textColor: … }` de chart-options.ts
node --test src/charts/color-contrast.test.ts                          # ℹ pass 16 · fail 0   ⇒ NÃO MORDE
node --conditions=react-server --test src/app/symbol/chart-construction.test.ts  # ℹ pass 6 · fail 1 ⇒ rc=1
```

`[MEDIDO 2026-09-12, n=1 mutante]` — **quem reprovou foi `chart-construction.test.ts`, e por
`assert.match` de regex sobre o TEXTO-FONTE de `chart-options.ts`.** A mensagem é
`The input did not match the regular expression /background: \{ type: ColorType\.Solid, color: theme\.backgroundColor \}/`;
**não** existe `Received: "#ffffff"` em lugar nenhum dela.

⇒ **A afirmação do autor de que `color-contrast.test.ts` afere "contra o valor que `createChart`
recebe" é falsa.** Ele afere contra `chartSurfaceTheme().backgroundColor` — **um elo acima** de
`createChart`. O `i.e.` em `chart-theme.ts:25-27` e em `color-contrast.test.ts` é uma **inferência**,
não uma medição, e o mutante A a derruba. Isto é `DR-11`.

### MORDE B — o sítio plantado que usa a porta que o próprio portão sanciona

`chart-construction.test.ts` declara legítimo, no seu teste `CALA`, o spread
`createChart(container, { ...chartConstructorOptions(600, 220), autoSize: true });`. Plantei em
`frontend/src/app/symbol/probe-pane.tsx`:

```tsx
createChart(container, {
  ...chartConstructorOptions(600, 220),
  layout: { background: { type: "solid", color: "#FFFFFF" }, textColor: "#191919" },
});
```

```
color-contrast.test.ts        ℹ pass 16 · fail 0
chart-construction.test.ts    ℹ pass  7 · fail 0
```

`[MEDIDO 2026-09-12, n=1 sítio plantado]` — **o defeito `DR-1` inteiro, reintroduzido, com os DOIS
portões de fonte verdes.** (Arquivo removido em seguida.) Isto também é `DR-11`, e agrava-o: a forma
`spread` é **exatamente a forma que o conserto de `DR-4` (`autoSize`) tende a usar**.

### MORDE C — o pixel, que é o instrumento que realmente carrega a carga

```bash
make e2e   # recorte: playwright test 11-canvas-fundo, E2E_API_UP=1
```

| | `canvases_measured` | cor modal | fração | `rc` |
|---|---|---|---|---|
| `c7e17fc` íntegro | **12** | `#131722` em **12/12** | **0,857 – 1,000** | **0** |
| mutante (sem `layout`) | **12** | `#ffffff` em **12/12** | 0,855 – 1,000 | **1** |

`[MEDIDO 2026-09-12, n=12 canvases, 2 rodadas]` — e a reprovação do mutante é, **literalmente**,
`Expected: "#131722"` · `Received: "#ffffff"`. **Reproduz o número que o autor declarou em
`DESIGN_SYSTEM.md` §1.10, independentemente.** É este spec — não o `color-contrast` — o instrumento
que produz aquela mensagem.

⚠️ **E ele está FORA de `make verify`** (`Makefile:86`, por desenho: *"+~35 s por verify"*). Ou seja:
o único instrumento que fecha o vão do MORDE B **não roda nos seis portões**; roda no gate de e2e.

### Regressão? Não.

```bash
npm --prefix frontend run test:charts   # c7e17fc: pass 171 · fail 16   |  74d59a4: pass 167 · fail 16
npm --prefix frontend run test:app      # c7e17fc: pass 160 · fail  1
```

`[MEDIDO 2026-09-12]` — as **16+1 falhas são as MESMAS em `74d59a4`** (`canonical-grid-sha256-proof`,
`s2-axis-integration`, `universe-at`). **Pré-existentes, não desta PR.** Declarado para não ser
confundido com o veredito.

---

## Os três bloqueantes, um a um

### ✅ `DR-1` — PAGO, e pago melhor do que eu pedi

A tela está certa (MORDE C, 12/12 em `#131722`) **e** o defeito é detectável. O que o autor
construiu não é "passar `layout`": é `chartSurfaceTheme()` (`charts`, dado puro, `charts` segue com
**zero** imports de `lightweight-charts`) → `chartConstructorOptions()` (`web`, onde a biblioteca já
está) → `createChart`, com teste de deriva do `--color-surface-stripe` lido do `globals.css` **como
texto**. O controle negativo em `color-contrast.test.ts` replanta `#FFFFFF` e **reproduz a minha
tabela de cinco linhas, razão por razão** — `directionUpFill 3,57 · directionDownFill 3,90 ·
dataBrokenInk 1,85 · provenanceStrong 1,22 · provenanceWeak 3,08` — e nomeia os dois papéis abaixo
do piso. Texto de eixo: **5,82:1** (`provenanceWeak` sobre `#131722`), acima dos 4,5:1 de WCAG 1.4.3,
asserido por aritmética e não por hex.

**A linha de delta do CVD mede agora 14,72:1 contra a cor que o `<canvas>` é efetivamente limpo** —
que é, palavra por palavra, o que a §Reteste exigia.

### ✅ `DR-2` — PAGO

`priceScaleId: CVD_CUMULATIVE_PRICE_SCALE_ID` + `scaleMargins` próprios, empilhados
(`delta {top .05, bottom .55}` / `acumulado {top .55, bottom .05}`), no mesmo idioma do sub-eixo de
volume. O achatamento por `max|cum| ≥ max|delta|` acabou. Guardado dos dois lados
(`cvd-pane-dom-contract.test.ts`), inclusive contra o `priceScaleId: ""` — *"a default right scale
spelled differently"*.

### ✅ `DR-3` — PAGO, e a afirmação do autor sobre o e2e é VERDADEIRA

Verifiquei a asserção, não a descrição. `e2e/10-cvd-dado-real.spec.ts:334`:

```ts
expect(cumulativeKind).toBe(deltaKind);
if (cumulativeKind === "absent") { expect(cumulativeText).toContain("SEM_PONTO");
                                   expect(cumulativeText).not.toMatch(/\d/); }
else                             { expect(cumulativeText).not.toContain("SEM_PONTO");
                                   expect(cumulativeText).toMatch(/\d/); }
```

**É acordo de TIPO entre os dois readouts, nos dois sentidos — não `toHaveCount(1)`.** O argumento
que o justifica também está certo: `cvdCumulativeScaled` acumula **só sobre bucket presente** a
partir de `anchorMs = window.startMs`, logo o slot do acumulado é presente **sse** o do delta é.
Um número no acumulado onde o delta diz `SEM_PONTO` seria `RN-1` quebrado uma série ao lado.
Spec rodado por mim: **2 passed**.

Três canais carregam a distinção (cor · `LineStyle.Solid`/`Dashed` · legenda em palavras) ⇒
**WCAG 1.4.1 satisfeito**. `aria-hidden` na *swatch* está correto: ela é a cópia redundante.

**`DR-10` fica RESOLVIDO por tabela**: `"Delta atual:"` / `"Acumulado atual:"` deixou de destoar no
instante em que passaram a ser dois — foi exatamente a condição que o relatório anterior escreveu.

---

## Achados médios e estratégicos: algum virou bloqueante? **Nenhum.**

| # | antes | agora | veredito |
|---|---|---|---|
| `DR-4` resize | 🟠 | não pago; `CHART_HEIGHT_PX` nomeado, `ResizeObserver`/`autoSize` ausentes | **roadmap** |
| `DR-5` número cru sem unidade | 🟠 | **agravado**: agora são **DOIS** readouts `String(value)` sem unidade, e o do acumulado tem magnitude maior | **roadmap, no topo da fila** |
| `DR-6` canvas sem nome | 🟠 | **parcialmente pago**: `aria-hidden` só no `CvdPane`; `PricePane:407` e `OiPane:434` seguem nós sem nome | **roadmap** — o padrão existe e não foi aplicado nos outros dois |
| `DR-7` crosshair | 🟡 | não pago; **mais necessário agora** (ver `DR-12`) | **roadmap, sobe de prioridade** |
| `DR-8` `role="status"` estático | 🟡 | não pago (`SymbolClient.tsx:158`) | **roadmap** |
| `DR-9` rampa de procedência como identidade | 🟡 | **incrementado**: `provenanceWeak` agora é também o texto de eixo/crosshair — um 5º significado de "cor fraca" | **roadmap** |
| `DR-10` microcopy | 🟢 | **RESOLVIDO** por `DR-3` | ✅ |

**Ruling do gate sobre a forma que o autor submeteu** (`chart-theme.ts:51-55` pede veredito sobre
*"whether axis text is the weak or the strong end of the procedência ramp"*): **aceito
`provenanceWeak` para texto de eixo** — 5,82:1 limpa 1.4.3 e a grade a `#222634` não grita sobre a
série. Mas isso **incrementa `DR-9`**: o design system precisa de um papel de **cromo** distinto da
rampa de procedência, e `DR-9` passa a ter duas razões em vez de uma.

### Dois achados NOVOS

**🟠 `DR-11` (novo) — o elo `chartSurfaceTheme() → createChart` é fechado por REGEX, e a porta do
`spread` fica aberta.** Provado duas vezes (MORDE A e MORDE B). O conserto é barato e converte a
garantia sintática na medição que o docstring já afirma ter:

```ts
// em vez de assert.match(source, /color: theme\.backgroundColor/):
const built = chartConstructorOptions(1, 1);
assert.equal(built.layout.background.color, chartSurfaceTheme().backgroundColor);
assert.equal(built.layout.textColor, chartSurfaceTheme().textColor);
```

…mais rejeitar, em `bareCreateChartCalls`, um `spread` de `chartConstructorOptions` seguido de chave
`layout`. Com isso o MORDE A passa a reprovar **com o valor**, e não com um texto-fonte.
⛔ **Não é bloqueante** porque não move a barra que este documento já fixou para o reteste: a tela
está certa, medida em pixel, e o mutante direto reprova. Mas a afirmação do autor sobre
`color-contrast.test.ts` **precisa ser corrigida no docstring** — instrumento que declara medir X e
mede Y é a classe de defeito que gerou `DR-1`.

**🟡 `DR-12` (novo) — o acumulado ficou sem NENHUMA referência numérica no canvas.** A escala própria
é *overlay* (não renderizada) e a série leva `lastValueVisible: false` + `priceLineVisible: false` ⇒
o único acesso ao valor é o readout `Acumulado atual:`, que é justamente o `String(value)` sem
unidade de `DR-5`. **É o preço correto a pagar** por `DR-2` — a forma do acumulado é o sinal, e a
âncora é arbitrária por `D4.7` — mas o remédio real é `DR-7` (crosshair com `formatFlowValue`) + `DR-5`.

---

## Pontuação por domínio

| Domínio | Antes | Agora | Resumo em uma linha |
|---|---|---|---|
| Heuristic Compliance | 6 | **8**/10 | Legenda nomeia as duas linhas; reconhecimento-sobre-memória pago. Falta hover (`DR-7`) |
| Research Foundation | 9 | **8**/10 | Medição exemplar — **menos** o `i.e.` falso sobre o que `color-contrast` afere (`DR-11`) |
| Mobile Experience | N/A | **N/A** | Fora de escopo por `D14` `[PREMISSA-OWNER: 2026-09-11]`; não pontuado, fora da média |
| Desktop Experience | 4 | **5**/10 | Legenda e 2º readout somam; 220px fixo, sem resize, sem tooltip, float cru, acumulado sem eixo |
| Visual Design | 3 | **8**/10 | Canvas `#131722` **medido em pixel**; grade tokenizada; eixo 5,82:1; achatamento removido |
| Accessibility | 4 | **7**/10 | 1.4.11 na superfície real e 1.4.1 por traço+legenda; resíduos `DR-6` parcial e `DR-8` |
| Interaction Design | 5 | **5**/10 | Nada mudou no crosshair, e `DR-12` o torna mais necessário |
| Future-Readiness | 6 | **6**/10 | Inalterado |
| System Architecture | 7 | **8**/10 | Ponto único de construção, `charts` sem a biblioteca, teste de deriva contra o CSS; porta do `spread` em aberto |
| Ethics & Content | 9 | **9**/10 | Acumulado herda a política de ausência por TIPO; vão não encolhido; zero nunca fabricado |

**Média sobre os 9 domínios em escopo:** `(8+8+5+8+7+5+6+8+9)/9 = 7,11` ⇒ **71/100**.

```
Heuristic 8 · Research 8 · Desktop 5 · Visual 8 · A11y 7
Interaction 5 · Future 6 · Architecture 8 · Ethics 9      (Mobile: excluído — D14)
```

---

## Contexto vinculante, reafirmado para não ser reaberto

- **Ausência é `SEM_PONTO` e nunca zero** — `FLOW` ⇒ erro de TIPO. Honrado no acumulado também.
- **O vão de ~95% é declarado sem encolher e NÃO é defeito** — segue a parte mais bem resolvida da tela.
- **`D14`: sem mobile no piloto.** Nada aqui pontua toque, viewport estreito ou alvo de 44px.
- **`directionOn` (1,00:1 contra a superfície) NÃO é defeito** — aferido sobre os fills (5,01/4,59).
- ⛔ **Figma: não usado.**

## Roteiro que fica

1. `DR-11` — a asserção de runtime + fechar a porta do `spread`; **e corrigir o docstring**. (< 1 dia)
2. `DR-5` + `DR-7` + `DR-12` — formatador único com unidade, ligado ao crosshair. (1–5 dias)
3. `DR-6` nos outros dois painéis · `DR-8` · `DR-4`. (1–5 dias)
4. `DR-9` — papel de **cromo** e papel de **identidade de série**, separados da rampa. (estratégico)
5. `DR-10`(antigo estratégico) — alternativa textual por ponto, tabela navegável por teclado.

