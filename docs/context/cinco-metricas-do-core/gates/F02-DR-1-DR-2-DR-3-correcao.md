# Correção dos 3 bloqueantes do design-review — painel de CVD (PR #220)

**Feature:** `cinco-metricas-do-core` · **Componente:** `web` · **Base:** `74d59a4`
**Data:** 2026-09-12 · **Review que bloqueou:** [`design-review-painel-cvd.md`](design-review-painel-cvd.md)
(`NEEDS_FIX`, 59/100) · **QA:** [`F02-QA-integracao-cvd-e-portao-e2e.md`](F02-QA-integracao-cvd-e-portao-e2e.md)
(`APPROVED`)

⛔ **Figma não foi usado em passo nenhum.** Proibido neste repositório sem exceção.
⛔ **Escopo `frontend/` apenas** — `git diff --name-only` sobre `backend/` devolve **0 arquivos**
(PR #219 intocada). Nada semeado no Postgres compartilhado. Nenhuma escrita no ledger.

---

## O que o review pediu e o que foi entregue

| id | o que bloqueava | o que foi feito |
|---|---|---|
| `DR-1` | `createChart` sem `layout` ⇒ canvas `#FFFFFF` numa página `#131722`; delta do CVD a **1,22:1 na tela** e **14,72:1 no portão** | `layout`+`grid` a partir dos tokens **e três instrumentos novos** que tornam a divergência detectável |
| `DR-2` | delta e acumulado na MESMA escala default; `max\|cum\| ≥ max\|delta\|` por construção ⇒ uma das duas achatada | escala própria para o acumulado (`priceScaleId` + `scaleMargins`), no molde do sub-eixo de volume |
| `DR-3` | duas linhas distinguidas **só por cor** (WCAG 1.4.1); acumulado sem NENHUMA leitura numérica no DOM | legenda (marca + rótulo), `LineStyle.Dashed` no acumulado, e `Acumulado atual:` com o mesmo `ABSENCE_TOKEN` |

Pago de carona, porque é a mesma superfície de `DR-3`: **`DR-6`** — `aria-hidden="true"` no host do
`<canvas>`, com os readouts como alternativa textual declarada.

---

## `DR-1` — por que "passar `layout` e seguir" seria o mesmo defeito de novo

O review foi explícito: *"o portão tem de deixar de ser falsificável assim … enquanto forem duas
verdades separadas, o portão volta a mentir"*. E o repositório já tem o recibo: `D13` recusou
**por nome** a alternativa *"trocar `light`→`dark` nos 4 sítios"* porque **deixa a armadilha
armada** — e a armadilha tinha disparado, em produção, com os 6 portões verdes
(`color-tokens.ts:44-52`).

Então a correção tem **três instrumentos, e nenhum é substituto do outro**:

| # | instrumento | o que ele prova | o que ele NÃO vê |
|---|---|---|---|
| 1 | `frontend/src/charts/color-contrast.test.ts` (alterado) | a ARITMÉTICA: `kind: "surface"` deixou de aferir contra `SURFACE_BASE` e passa a aferir contra `chartSurfaceTheme().backgroundColor` — **o valor que `createChart` recebe** | se o call site não usar esse valor |
| 2 | `frontend/src/app/symbol/chart-construction.test.ts` (novo) | o que está ESCRITO: toda `createChart(` que MONTA um gráfico tira as opções de `chartConstructorOptions()`, **inclusive num arquivo que ainda não existe** | se a biblioteca ou o CSS pintarem por cima |
| 3 | `frontend/e2e/11-canvas-fundo.spec.ts` (novo) | o que foi PINTADO: lê os **pixels** do `<canvas>` real num browser real | nada — é o árbitro final |

**A cadeia que ficou impossível de quebrar em silêncio:**
`globals.css --color-surface-base` → `SURFACE_BASE` → `chartSurfaceTheme()` → `chartConstructorOptions()`
→ `createChart` → pixel do canvas, **com um teste em cada seta**.

### ⛔ O que NÃO virou allowlist, e por quê

`headless-chart.ts` e `s2-headless-run.ts` também chamam `createChart` — são as bancadas de
fidelidade de eixo, em `jsdom`. Elas vivem em `charts`, que `ADR-003`/`D5.12` proíbe de importar
`web`, então **estruturalmente não alcançam** `chartConstructorOptions`. O instrumento 2 **não as
pula por caminho**: ele parte o universo por uma **propriedade do código** e assere as duas metades —
(a) toda `createChart` em `app/`/`features/` usa o construtor nomeado; (b) toda `createChart`
**fora** dessa metade está num arquivo que realmente dá bootstrap de `jsdom`. A asserção (b) é o
**detector de erosão**: no dia em que alguém montar um gráfico de browser a partir de `charts/`,
esse call site não cai em nenhuma das duas metades e o portão o nomeia. Uma lista de caminhos seria
silenciosa exatamente aí — *"entrada de allowlist é indistinguível de bypass"* (`CLAUDE.md`).

### A linha de grade — declarada, não inventada e não escondida

O default da biblioteca é `#D6DCDE` (grade de tema CLARO). `CHART_GRID_LINE` é a **segunda citação**
de `--color-surface-stripe` (`globals.css:37`), com teste que lê o CSS como texto e reprova se as
duas divergirem — a mesma disciplina que `SURFACE_BASE` já carrega.
⛔ **Ela NÃO virou `ColorRole`**: `CONTRAST_BACKDROP` é `Record<ColorRole, …>` com piso `>= 3.0` em
todo membro, porque todo membro é **tinta de série**. Linha de grade é cromo, não dado; um piso de
3,0:1 faria a grade gritar por cima da série que ela existe para ajudar a ler. Entrar na união
forçaria ou um piso errado ou uma allowlist.

---

## Números — cada um com o comando e o universo

### Portões do repositório

| comando | resultado |
|---|---|
| `make verify` | **VERDE — 6 portões mediram e passaram**, `rc=0`. `lint-backend` 426 arquivos · `lint-frontend` (ESLint + `tsc --noEmit --strict`) · `test` **2213 passed, cobertura total 96,85%** · `boundaries` 7 mantidas / 0 quebradas · `regras` **0 bloqueio**, 69 avisos · `política` |
| `make e2e` | **rc=0 · 27 passed (34,8 s)** — era 26 specs, +1 (`11-canvas-fundo`) |
| `harness rules --mode sweep --changed-only` | **`rc=0`, saída vazia** — 0 achado sobre os 13 arquivos em stage |

### Suítes de front (`node --test`) — ⚠️ universo declarado

`grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push` → **0 linhas**
`[MEDIDO 2026-09-12]` ⇒ **a suíte do front continua fora de portão nenhum.** Os números abaixo foram
rodados à mão.

| suíte | antes (`74d59a4`) | agora |
|---|---|---|
| `npm --prefix frontend run test:charts` | 187 | **195 pass / 0 fail** (+8) |
| `npm --prefix frontend run test:app` | 168 | **179 pass / 0 fail** (+11) |
| `npm --prefix frontend run test:s3` | 111 | **111 pass / 0 fail** |
| `npm --prefix frontend run test:s1` | — | **97 pass / 8 fail — PRÉ-EXISTENTE E AMBIENTAL** |
| `npm --prefix frontend run lint` | limpo | **limpo** |
| `npm --prefix frontend run typecheck` | limpo | **limpo** |

⚠️ **As 8 falhas de `test:s1` não são desta correção e estão nomeadas em vez de escondidas:** as 8
estão todas em `src/features/s1-console/ingest-health-query-http.test.ts`, que sobe um servidor
Python e morre com `store_parent_missing` — `data/md` **não existe nesta máquina**
(`ls -d data/md` → inexistente, inclusive no checkout principal). Nenhum arquivo sob
`src/features/s1-console/` foi tocado (`git status --porcelain`), e o único arquivo compartilhado
que mudei (`charts/index.ts`) não é importado por ali (`grep -rln 'charts/index' frontend/src/features/s1-console/`
→ **0 arquivos**).

### As razões de contraste, refeitas contra o fundo que o chart aplica

`[MEDIDO 2026-09-12, n=6 papéis, fórmula de `charts/contrast.ts:25-42`]` — via
`npm --prefix frontend run test:charts`, teste *"the measured ratios are the ones D13 recorded"*:

| papel | contra o canvas **corrigido** (`#131722`) | contra o canvas de `74d59a4` (`#FFFFFF`) |
|---|---|---|
| `provenanceStrong` — **linha de delta do CVD** | **14,72** ✅ | **1,22** ⛔ |
| `provenanceWeak` — acumulado + histograma | 5,82 ✅ | 3,08 |
| `dataBrokenInk` | 9,68 ✅ | **1,85** ⛔ |
| `directionUpFill` | 5,01 ✅ | 3,57 |
| `directionDownFill` | 4,59 ✅ | 3,90 |
| `directionOn` (sobre os fills, não sobre o fundo) | 4,59 ✅ | 4,59 |

A coluna da direita **é um teste que roda**, não uma tabela de prosa: o controle negativo
`MORDE: a #FFFFFF canvas reproduces the DR-1 table…` replanta o default da biblioteca e exige que o
portão **reprove nomeando `provenanceStrong` e `dataBrokenInk`**.

E o texto de eixo: `#191919` (default da biblioteca) contra `#131722` mede **1,02:1**; com o
`textColor` do token, **5,82:1** — acima do piso 4,5:1 de WCAG 1.4.3. Asserido por aritmética, não
por comparação de hex.

---

## MORDE — as mutações rodadas, não descritas

| falsificador | mutação | resultado |
|---|---|---|
| `11-canvas-fundo.spec.ts` (browser real) | `layout`+`grid` removidos de `chartConstructorOptions` (= `74d59a4` literal) | **rc=1** · `Expected: "#131722" · Received: "#ffffff"` |
| `chart-construction.test.ts` | a chamada de `74d59a4`, copiada caractere por caractere | **rejeitada**, 1 violação |
| `chart-construction.test.ts` | chamada com opções inline **CORRETAS** (`color: "#131722"` na mão) | **rejeitada** — a regra é de procedência, não de matiz |
| `chart-construction.test.ts` | `createChart(container)` sem opções; e 2 violações no mesmo arquivo | **rejeitadas**, com número de linha |
| `color-contrast.test.ts` | canvas `#FFFFFF` | **reprova** nomeando `provenanceStrong` (1,22) e `dataBrokenInk` (1,85) |

E o **CALA** correspondente, porque um portão que grita sobre código correto é um portão que alguém
desliga: chamada multi-linha, `chartConstructorOptions` com parênteses aninhados nos argumentos e
spread por cima do construtor — **nenhuma dispara**. `cvd-pane-dom-contract.test.ts` mantém o seu
CALA (cor, `<h2>` e microcopy mudam sem tocar em asserção nenhuma), **re-ancorado** como a própria
mensagem dele manda, e agora ele também prova que mudar a redação da **legenda** não quebra contrato.

---

## `DR-2` — a separação é estrutural, não é forma

O próprio arquivo já tinha escrito o argumento 200 linhas acima, sobre o sub-eixo de volume
(`SymbolClient.tsx:244-246`): *"sharing price's scale would flatten one of the two series into
nothing"*. Aqui ele é mais forte: o acumulado **é a soma corrida dos próprios deltas plotados ao
lado**, ancorada em `window.startMs` (antes do primeiro ponto), então `max|cum| ≥ max|delta|` **por
construção**, com igualdade só no caso degenerado de um bucket.

- delta fica na escala direita default (é a série do readout e do `DoD-3`) com `CVD_DELTA_SCALE_MARGINS`;
- acumulado vai para `priceScaleId: "cvd_cumulative"` com `CVD_CUMULATIVE_SCALE_MARGINS`.

⛔ **As MARGENS são forma** (do `ui-designer`, com o veredito do `ux-ui-mastery`); **a separação
não é** — é aritmética de altura de painel.

---

## `DR-3` — três canais, para que nenhuma perda isolada apague a distinção

1. **cor** — `provenanceStrong` / `provenanceWeak` (como antes);
2. **traço** — `LineStyle.Solid` / `LineStyle.Dashed`, **dentro do canvas**, onde legenda nenhuma
   alcança: é aí que WCAG 1.4.1 morde para um dicromata ou num print monocromático;
3. **palavra** — legenda `▬ Delta (linha cheia)` / `▬ ▬ Acumulado (linha tracejada)`, com a marca
   `aria-hidden` (ela é a cópia redundante do que o texto ao lado já diz).

E o acumulado **ganhou número no DOM**: `Acumulado atual:` com `data-fact="cvd_cumulative_last_reading:<kind>"`,
resolvido por `resolveFlowReading` (nunca `resolveStockReading` — carregar o total anterior para a
frente seria LOCF sobre uma série cujas ausências são buracos reais de observação) e caindo no mesmo
`ABSENCE_TOKEN` dos outros quatro readouts.

**E o e2e não assere "existe um `<p>"`:** ele assere **acordo de tipo entre os dois readouts**.
`cvdCumulativeScaled` (`charts/s2-cvd.ts:176-193`) acumula só sobre bucket presente a partir de
`anchorMs`, e a âncora é `window.startMs` ⇒ o slot do acumulado é presente **se e somente se** o do
delta é. Um acumulado que diga um número onde o delta diz `SEM_PONTO` é uma soma inventada sobre um
bucket sem observação — o defeito de `RN-1` uma série ao lado.

Medido em `make e2e` (universo FRACO, sqlite, `/series-history` → 500):

```
E2E-FACT 10-cvd-dado-real cvd_cumulative_last_reading_kind="absent"
E2E-FACT 10-cvd-dado-real cvd_cumulative_last_reading_text="Acumulado atual: SEM_PONTO"
E2E-FACT 10-cvd-dado-real cvd_legend_text="▬ Delta (linha cheia)▬ ▬ Acumulado (linha tracejada)"
E2E-FACT 10-cvd-dado-real cvd_last_reading_text="Delta atual: SEM_PONTO"
```

---

## O fundo do canvas, medido em pixel num browser real

`make e2e` → `11-canvas-fundo`:

```
E2E-FACT 11-canvas-fundo canvases_measured=12
E2E-FACT 11-canvas-fundo canvas_modal_colors=[{"color":"#131722","share":1},{"color":"#131722","share":0.9286},
  {"color":"#131722","share":0.8571},{"color":"#131722","share":0.9898}, … 12 entradas, TODAS #131722]
```

**12 canvases, 12 com cor modal `#131722`**, fração entre **0,857 e 1,000** dos pixels amostrados
`[MEDIDO 2026-09-12, amostragem de 1 em 4 px nos dois eixos]`. A asserção é sobre a moda **e** sobre
a fração — só a moda ficaria verde num canvas majoritariamente de outra cor onde `#131722` ainda
fosse o valor mais comum entre os restantes.

---

## `N` no DOM, remedido — e o número **não é estável**, que é o achado

Comando: `backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_dom.py`
(klines REAIS da Binance → Postgres **descartável** criado e destruído pelo script → `src.main` →
`next build` + `next start` → Playwright sobre `e2e/10-cvd-dado-real.spec.ts`).
⛔ **Nunca o Postgres compartilhado** (`[P-seed]`) — o contêiner é criado e destruído na mesma
execução.

```
E2E-FACT 10-cvd-dado-real series_window_reader_present=true
E2E-FACT 10-cvd-dado-real cvd_series_history_status=200
E2E-FACT 10-cvd-dado-real cvd_series_history_rows=5760
E2E-FACT 10-cvd-dado-real cvd_api_rows_with_value=294
E2E-FACT 10-cvd-dado-real cvd_dom_present_points=294
E2E-FACT 10-cvd-dado-real cvd_readable_horizon_fact="cvd_readable_horizon:294/5760"
E2E-FACT 10-cvd-dado-real cvd_last_reading_text="Delta atual: 91.38"
E2E-FACT 10-cvd-dado-real cvd_cumulative_last_reading_kind="present"
E2E-FACT 10-cvd-dado-real cvd_cumulative_last_reading_text="Acumulado atual: -1255.946"
E2E-FACT 10-cvd-dado-real cvd_legend_text="▬ Delta (linha cheia)▬ ▬ Acumulado (linha tracejada)"
rc=0 · 2 passed
```

| execução | `cvd_dom_present_points` | `cvd_api_rows_with_value` |
|---|---|---|
| `T-02.5`/`T-02.6` (gate original) | 290 | 290 |
| QA da PR #220 | 293 | 293 |
| **esta, 2026-09-12** | **294** | **294** |

**`[MEDIDO 2026-09-12, n=1 execução, universo FORTE]`. O DOM e a API concordam EXATO nas três.**
A variação 290 → 293 → 294 **não é divergência** — é a cauda de publicação (`bucket_end + 58 s`,
`[MEDIDO 2026-09-10, T-01.3]`) sobre relógios diferentes: o script publica 300 barras por símbolo na
cadência ao vivo, e quantas caem dentro da janela derivada depende de onde o relógio estava quando a
janela foi cortada. **O que é invariante é a igualdade DOM == API**, e é ela que `DoD-3` pede.
**294 ≥ 30** ⇒ item 3 do `DoD-VERTICAL` pago, com folga de ~10×.

⛔ **E isto NÃO é a leitura de PRODUÇÃO**, que continua sendo de `T-02.7`.

**O ganho de `DR-3` aparece aqui, e é o que o review pediu literalmente** (*"a tela declara a âncora
e nunca diz o valor ancorado"*): `Acumulado atual: -1255.946` é um **número real, no DOM**, ao lado
de `Delta atual: 91.38` — e a asserção nova exige que os **dois readouts concordem no tipo**, então
um acumulado que dissesse número onde o delta diz `SEM_PONTO` reprovaria.

---

## Doc delta

- `docs/context/.../gates/design-review-painel-cvd.md`: **sem mudança** — é o laudo do revisor, não
  se reescreve; o reteste é ato dele.
- `docs/context/.../gates/F02-web-T-02.5-T-02.6.md`: **sem mudança** — registra `290` como
  `[MEDIDO 2026-09-12]` de uma execução que realmente devolveu `290`. Remedir depois não torna
  aquela medição falsa, e reescrevê-la apagaria a evidência de que o número **varia com a cauda de
  publicação**. O número novo vive aqui e no relatório de QA.
- `docs/INDEX.md`: **linha acrescentada** (append-only).
- `docs/product/DESIGN_SYSTEM.md`: **§1.10 acrescentada** — *"A SUPERFÍCIE DO `<canvas>` é um token,
  não um default"*. Era um buraco do documento, não uma nota desta PR: **todo** número de §1.2 é uma
  razão contra uma superfície, e até hoje o documento só dizia qual superfície a **página** pinta.
  A seção declara os 3 tokens do canvas (fundo, texto de eixo, linha de grade), com o comando e o
  `n` de cada número, e marca explicitamente que ela **não** fecha o `[NÃO MEDIDO]` de
  `forced-colors: active` da §8 — só constrói o gancho que aquela caixa diz ser necessário.
- ADR: **não necessária** — nada aqui decide fronteira nova. `ADR-003` (charts↔web), `ADR-010`
  (governança de cor) e `D13` (tema único) continuam valendo palavra por palavra; o que mudou é que
  o portão de `D13` passou a medir a superfície certa.

---

## O que NÃO foi feito, nomeado em vez de omitido

Do roteiro do review, ficaram **abertos e continuam abertos**:

- `DR-4` (`ResizeObserver`/`autoSize`), `DR-5` (formatador com unidade e agrupamento),
  `DR-7` (ligar `formatFlowValue` ao crosshair) — os três são **médio prazo** no próprio roteiro;
- `DR-8` (`role="status"` em `AbsenceNote`) — quick win **não pago**: o task desta rodada era os
  três bloqueantes, e `AbsenceNote` é compartilhado por 4 painéis, então mexer nele é mudança fora
  do painel de CVD;
- `DR-9` (papéis de identidade de série separados da rampa de procedência) e `DR-10` (alternativa
  textual por ponto) — **estratégicos**, dívida de design system.

⛔ **Nenhum deles bloqueia o reteste**, que o review definiu como `DR-1` + `DR-2` + `DR-3`.

**Microcopy nova** (`Acumulado atual:`, os dois rótulos da legenda) é **proposta ao `ui-designer`**,
não decisão de builder.
