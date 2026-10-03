# W-F1-QA — QA de front da fase `01` de `estrutura-do-front` (`T-01.1`…`T-01.4`)

> Agente `frontend-qa` · 2026-10-03 · worktree `wave-estrutura-f01`, branch `wave/estrutura-f01`, HEAD **`cc812713`**
> `$BASE` = `git merge-base HEAD origin/master` = **`64406ac5`** (= `origin/master`) `[MEDIDO]`
> Fontes: `docs/plans/SPEC-011-estrutura-do-front/01_nucleo_para_fora.md`, `SPEC-011 §7.2`, `tasks.toml` (`T-01.1`…`T-01.4`),
> `gates/F1-base.md`, `gates/T-01.{2,3,4}-build.md`.
> Scripts e logs desta QA: `scratchpad/qaf1/` da sessão do orquestrador (`ca8.sh`, `order.py`, `imports.py`, `widen.mjs`, `mut.py`).
> Não rodei `make verify` nem e2e (instrução do despacho). Durante a QA, havia uma suíte e2e de **outra** worktree (`ef-e2e`, `e2e/20`)
> rodando na máquina. Só rodei testes unitários do front, que são leves, e não reconstruí o bundle por causa dela.

## QA Gate (Front) — Fase 01: o núcleo sai do arquivo

- [OK] **DoD 1, condição de entrada.** A metade (a) dá `rc=0`. A metade (b), com `T-05.*` em `todo` no `tasks.toml` de `paineis-de-fluxo`, ficou declarada em `F1-base.md` §1. `harness pipeline state paineis-de-fluxo` = `DONE`, e por isso o `gate-enforce` passou a dar `rc=0` (`T-01.2-build.md`, cabeçalho) `[DOC]`
- [OK*] **DoD 2, movimento (`CA-8`).** Rodei a receita estrita sobre a árvore de produção inteira de `frontend/src`. O resultado é exatamente o resíduo declarado de 5 linhas. A receita literal da SPEC não dá vazio (§1). *Aceito com WARNING
- [OK] **DoD 3, tela.** Não há spec e2e em `M`/`D`. O `make verify` está verde em `d8555c15`: e2e 127 passed / 14 skipped em 42 specs (`[DOC: log 20261003T145651Z]`; cache `.git/verify-cache/74913e98…` = tree de `d8555c15` `[MEDIDO]`)
- [OK] **DoD 4, fatos (`CA-9`).** `N_fact` = 47 em `test:app`. A guarda morde nos dois sentidos, `46` e `48` (§3, E1/E2)
- [OK] **DoD 5, isolamento.** `npm --prefix frontend run lint` → `rc=0`. P2 morde em `chart/host/deep/` e em `chrome/deep/` (G1/G2)
- [OK] **DoD 6.** `wc -l SymbolClient.tsx` = **3.410** `[MEDIDO]`, contra `L0` = 4.742. `B` = 87.254 B (+0,10%) `[DOC: T-01.4-build §5, n=2]`. **Não remedi o `B`**
- [OK] Lógica fora do componente: a fase só move código, e a ordem se conserva (§1.2)
- [OK] Contrato na borda: as importações não foram religadas a outro módulo (§1.3). `page.tsx` só trocou caminhos de import
- [OK] Segredo no cliente: o sweep completo acha **0** achados nos arquivos da fase (§5)
- [OK] Acessibilidade: o `DR-6` foi para `chart/host/` e morde nas 3 metades (C1–C3)
- [OK] Os testes existem e passam, e cada um tem o par morde/cala: **14/14 mutações mordem** e **6/6 sondas legítimas calam** (§3)
- [N/A] Cobertura: a suíte do front não mede cobertura. Os 34 arquivos de teste do front rodam dentro de `make verify` (`test-frontend-*`)
- [OK] `harness rules --mode sweep --changed-only` → `rc=0` com saída vazia. O resultado é ambíguo, e eu o desfiz com o sweep completo (§5)
- [OK] `make verify` verde em `d8555c15` `[DOC]`. Entre `d8555c15` e `cc812713` só muda `T-01.4-build.md`
- [FAIL] **Doc delta.** `gates/T-01.2-build.md` **não tem linha** em `docs/INDEX.md`, embora o §8 dele afirme *"linha acrescentada"* (§6)
- [OK] Rótulos de força e números com comando, com duas ressalvas (§6)

**Veredito: NEEDS_FIX**, e só por doc. O código, a conservação e as guardas estão aprovados. A ação é uma linha no INDEX.

---

## 1. Conservação (`CA-8`)

### 1.1 A receita estrita sobre a árvore inteira, mais forte que a de cada builder

Os builders mediram com universos por task, de 1 a 18 arquivos. Eu medi com **todo** `.ts`/`.tsx` de produção sob `frontend/src`
(testes fora), em `$BASE` contra cada commit da fase. Com esse universo, uma mudança de lógica em **qualquer** arquivo do front aparece,
inclusive em `page.tsx`, que a `§7.2` deixa de fora.

`bash scratchpad/qaf1/ca8.sh` (`MODE=<sha>`). Universo: base **107 arquivos / 25.638 linhas**, `HEAD` **122 / 25.677**,
24.964 linhas normalizadas na base `[MEDIDO]`:

| commit | literal (estudo §5) | estrita (tira o `import` inteiro) | estrita sem indentação |
|---|---:|---:|---:|
| `45d9dcbb` (`T-01.2`) | 22 | **0** (`rc=0`) | 0 |
| `969914a8` (`T-01.3`) | 32 | **0** (`rc=0`) | 0 |
| `d8555c15` (`T-01.4`) | 52 | **17** | **5** |
| árvore em `cc812713` | 52 | 17 | 5 |

**O resíduo literal de 22 linhas da `T-01.2`** (52 no fim da fase): todas as **35** linhas que só a literal acusa casam
`^[<>]   (type )?Nome( as Nome)?,$`, e **0** não casam. São 29 `<` e 6 `>`, todas membros de import multilinha
(`comm -23` literal × estrita) `[MEDIDO]`. A receita do estudo §5 tira `import {` e `} from`, mas não os membros do meio. O defeito
é da receita, não da fatia. **Veredito: resíduo aceito.**

**As 5 linhas da casca do `AttributionFooter`:** a variante sem indentação deixa exatamente `function AttributionFooter() {`,
`return (`, `);`, `}` e `<AttributionFooter />`, todas `>`. As outras 12 da estrita são os 6 pares do `<footer>` reindentado
(6 → 4 colunas). O `chrome/AttributionFooter.tsx` não tem prop, estado nem expressão nova. O DOM que ele produz é o mesmo, porque o
componente não acrescenta wrapper. A montagem está guardada (D1 morde). **Veredito: resíduo aceito.** Só que a letra do DoD-2 da
`T-01.4` (*"diff VAZIO"*) **não** está cumprida, e a fase depende dessa aceitação, que fica registrada aqui como WARNING-1.

### 1.2 Ordem: o multiconjunto não enxerga reordenação, e eu medi a ordem à parte

A `§7.2` faz `sort`. Por isso uma troca de duas linhas dentro de um bloco movido passa calada, e eu provei isso:
**K2** troca `hideChartGraphicsFromAssistiveTech(container);` com a linha seguinte em `ChartHost.tsx`, e a estrita continua **17 / 5**,
sem mudar nada `[MEDIDO]`.

Complemento: `python3 scratchpad/qaf1/order.py` faz o `SequenceMatcher` do corpo de `SymbolClient.tsx` (base contra `HEAD`) e cobre
cada arquivo novo com faixas contíguas da base:
- `SymbolClient.tsx`: corpo 4.570 → 3.272 linhas. **Uma** única operação que não é deleção: o `replace` que põe `<AttributionFooter />` `[MEDIDO]`;
- os 15 arquivos novos estão cobertos 100% por faixas contíguas e **crescentes** da base, sem linha órfã. O número de faixas bate com
  o dos relatórios (`ChartHost.tsx` 5, `registrar.ts` 3, `pane-layer.tsx` 2, …). A exceção é `AttributionFooter.tsx`, com a linha
  `function AttributionFooter() {` sem par, que é o resíduo declarado;
- **morde:** com o K2 aplicado, `ChartHost.tsx` passa de 5 para **8 faixas, `ascending=False`** `[MEDIDO]`.

### 1.3 Imports: a receita estrita os apaga, e a religação foi medida à parte

A estrita descarta a instrução de import inteira. Com isso, um nome importado de **outro** módulo passaria calado.
`python3 scratchpad/qaf1/imports.py` toma cada par (nome, módulo resolvido) importado em `HEAD`, mapeia o módulo pelos renames de
volta ao caminho da base e exige o mesmo par na base. Os módulos criados pela fase ficam fora, porque os nomes deles eram declarações
locais. Resultado: **826 pares, 566 distintos, 0 sem contrapartida** `[MEDIDO]`. **Morde:** trocar o caminho do import em
`chrome/LiveRow.tsx` para `live-transport-v2.ts` ⇒ 2 pares acusados `[MEDIDO, revertido]`.
Há 5 nomes exportados de dois módulos: `HostSeries`, `HostSeriesFeed`, `PaneLayoutReport`, `PaneScaleBinding` (`registrar.ts` e
`indicator-binding.ts`) e `CHART_HEIGHT_PX` (`pane-stack.ts` e `charts/headless-chart.ts`). São duplicatas **por desenho**:
`indicator-binding.ts` (F0) declara *"the host … switches to it in F2"*. Nenhum import foi religado entre eles (WARNING-4).
Ciclos de import em `app/symbol/` (Tarjan sobre imports relativos de produção): **0** `[MEDIDO]`.

## 2. Spec e2e e helper

`git diff --name-status origin/master..HEAD -- frontend/e2e/` → só `M scope-map.tsv` e `M view.ts` `[MEDIDO]`.
`view.ts` muda 1 linha, só o caminho de `supported-timeframes.ts`. **Nenhuma `*.spec.ts` em `M`/`D`.**
`scope-map.tsv`: as 2 linhas mortas foram reapontadas e entraram 2 prefixos novos (`chart/axis/axis-`, `chart/history/history-page-`).
Os prefixos antigos que ficaram (`src/app/symbol/axis-`, `history-page-`) ainda casam 3 e 2 arquivos vivos (`axis-latency-probe*`,
`axis-fidelity`, `history-page-latency-probe*`), e nenhuma linha aponta caminho morto `[MEDIDO: git ls-files por prefixo]`.
`bash scripts/scope-resolve.sh` → `rc=0`, `e2e=COMPLETO` (o próprio mapa mudou) `[MEDIDO]`. `chrome/**` e
`chart/{host,legend,marks}/**` não casam nenhum prefixo e caem na suíte inteira. É fail-closed, o lado seguro.

## 3. Mutações: as guardas que mudaram de lugar ou foram alargadas

Antes das mutações, rodei a suíte existente sobre `cc812713`: `test:app` **722/722**, `test:charts` **353/353**, `test:s1` **105/105**,
`test:s3` **111/111**, todos `rc=0`. `lint` `rc=0`. `typecheck` (`tsc --strict`) `rc=0` `[MEDIDO]`. Bate com a `T-01.4`.

`python3 scratchpad/qaf1/mut.py` roda só o arquivo de teste dono e reverte. `git status` ficou vazio depois de cada rodada `[MEDIDO]`.
Resultado bruto em `mut-results-1.json`.

| id | guarda (teste) | mutação | tipo | resultado |
|---|---|---|---|---|
| A1 | fronteira do cliente (`volume-subaxis-dom-contract`) | `chart/marks/deep/__qa__.ts` importa `node:fs` (2 níveis abaixo) | morde | `12/1` ✔ |
| A2 | idem | `chrome/deep/__qa__.tsx` importa `../../view-model.ts` | morde | `12/1` ✔ |
| A3 | idem | `chart/marks/__qa__.ts` importa `react` | cala | `13/0` ✔ |
| A4 | idem | `chart/marks/__qa__.test.ts` importa `node:fs` (arquivo de teste) | cala | `13/0` ✔ |
| B1 | sem `fetch` de `series-history` (`chrome/timeframe-bar-dom-contract`) | `chrome/deep/__qa__.ts` com ``fetch(`${base}/series-history`)`` | morde | `11/1` ✔ |
| B2 | idem | o mesmo `fetch` acrescentado a `SymbolClient.tsx` | morde | `11/1` ✔ |
| B3 | idem | o mesmo `fetch` em `chart/history/__qa__.ts` | cala (limite declarado: o pager existe para buscar) | `12/0` ✔ |
| C1 | `DR-6` (`chart/host/chart-host-dom-contract`) | `canvas.setAttribute("aria-hidden", "false")` | morde | `0/1` ✔ |
| C2 | idem | `aria-hidden="true"` na superfície, depois de `ref={registrar.surfaceRef}` | morde | `0/1` ✔ |
| C3 | idem | sai a chamada `hideChartGraphicsFromAssistiveTech(container);` | morde | `0/1` ✔ |
| D1 | `SF-1` (`pane-chrome-options`) | sai `<AttributionFooter />` de `SymbolClient.tsx` | morde | `3/1` ✔ |
| D2 | idem | `href` do rodapé vira literal | morde | `3/1` ✔ |
| E1 | `N_fact` (`data-fact-ascii-key-contract`) | sai o `data-fact` de `chart/marks/AbsenceNote.tsx` | morde | `5/1`, `46` ✔ |
| E2 | idem | `data-fact` novo em `chrome/deep/__qa__.tsx` | morde | `5/1`, `48` ✔ |
| H1 | idem | atributo extra ao lado do `data-fact`, sem fato novo | cala | `6/0` ✔ |
| F1 | `CA-3′` (`chart/legend/pane-legend`) | `.paneIndex` acrescentado em `chart/host/pane-layer.tsx` | morde | `24/1` ✔ |
| G1 | `local/indicator-isolation` P2 (`npx eslint <f>`) | `chart/host/deep/__qa__.ts` importa `indicators/contract.ts` | morde | `rc=1`, 1 achado ✔ |
| G2 | idem | `chrome/deep/__qa__.ts` importa `indicators/contract.ts` | morde | `rc=1`, 1 achado ✔ |
| G3 | idem | `app/symbol/__qa__.ts` importa `chart/host/registrar.ts` | cala | `rc=0` ✔ |
| G4 | idem | `chart/host/__qa__.ts` importa `chrome/page-gutter.ts` | cala (convenção, não portão, conforme o README §26) | `rc=0` ✔ |

**Placar das guardas: 14/14 mordem, 6/6 calam.** Contando os instrumentos de conservação, são mais 4 mutações:
K1 (`(currentIndex + 1)` → `+ 2` em `TimeframeBar.tsx`: estrita 17→19, sem indentação 5→7) morde. K2 (reordenação) **não**
morde no `CA-8`, mas morde no `order.py`. A religação de import em `LiveRow.tsx` morde no `imports.py`.

### 3.1 O que as listas `MOVED_OUT_FILES` deixam de fora: lacuna latente, sem violação escondida hoje

Os 10 testes de pane da raiz leem `SymbolClient.tsx` + `MOVED_OUT_FILES`, uma lista **explícita** com os 6 de legenda/marcas e os
5 de chrome. **`chart/host/**` não está nela**, e a lista não é recursiva. Uma asserção negativa (`doesNotMatch`) que, na base,
cobria o código do host deixou de cobri-lo.

Medi se isso esconde alguma violação hoje. `scratchpad/qaf1/widen.mjs` (preload `--import`) envolve `assert.doesNotMatch` e
reavalia cada regex contra **todo** arquivo de produção de `chart/**` e `chrome/**`. Rodei os 32 testes que leem `SymbolClient.tsx`:
**95 asserções negativas**. Entre as de fonte inteira (`actual` > 50 kB), nenhuma acusa um arquivo que saiu de `SymbolClient.tsx`.
Os acertos que aparecem são de 3 tipos, todos legítimos:
- `pane-legend.ts`, que já era arquivo separado na base;
- os self-tests `MORDE` do `TimeframeBar`, que reavaliam a fonte já mutada;
- recortes pequenos (corpo de função), que não dependem do universo.

`[MEDIDO]`. **Veredito: nenhuma regressão mascarada. A lacuna é latente** (WARNING-2).

## 4. Os desvios declarados

| desvio | julgamento | evidência |
|---|---|---|
| `CrosshairSlotContext` em `chart/host/registrar.ts` | **aceito.** Quem o provê é o host (`ChartHost.tsx:492`, `.Provider`). `LegendValue.tsx:3` e `SymbolClient.tsx:115` o consomem. Deixá-lo em `SymbolClient.tsx` criaria o ciclo host → `SymbolClient` → host | grep + Tarjan: 0 ciclos `[MEDIDO]` |
| `VolumeSlot` em `chart/legend/LegendValue.tsx` (adianta parte da `T-04.1`) | **aceito.** `LegendValue` o usa na assinatura, e `chart/legend/` é uma das duas pastas que a `T-04.1` permite. ⚠️ O `refs` da `T-04.1` ainda diz *"VolumeSlot (hoje SymbolClient.tsx:213)"*, e o DoD dela (`grep … sem definicao`) agora passa sem ninguém mover nada | `tasks.toml:312-313` (WARNING-3) |
| `absence.ts` não existe | **aceito.** O arquivo só aparece no estudo §4.1. A `SPEC-011` e o plano não o citam (`grep -n absence.ts` → 0). `ABSENCE_TOKEN` e `formatUtcMinute` ficaram em `AbsenceNote.tsx`, e `chrome/ChromeModeStamp.tsx` os importa de lá. `chrome` → `chart` é permitido | `[MEDIDO]` |
| `scope-map.tsv` reapontado | **aceito e necessário.** Sem isso, `scope-resolve.sh` RECUSA (`T-01.3` §5). Hoje `rc=0`, e nenhum prefixo aponta caminho morto | §2 |

## 5. Regras

`harness rules --mode sweep --changed-only` → `rc=0` com **saída vazia** `[MEDIDO]`. Esse par é ambíguo. Para desfazê-lo, rodei
`harness rules --mode sweep --format ndjson`: o instrumento emite achados, e as 6 linhas que citam `frontend/` estão em arquivos que a
fase **não** tocou (`history-transport.test.ts`, `threshold-spec-bundle.test.ts`, `live-transport.test.ts`,
`knowledge-time-bundle.test.ts`, `chart-options.ts:77`, todas `web-fullstack.hardcoded-url`, e uma docstring de backend) `[MEDIDO]`.
**0 achados nos arquivos da fase.**

## 6. Doc delta e rótulos

- **`docs/INDEX.md`:** são 3 linhas acrescentadas e 0 removidas (`git diff --numstat` `3 0`) `[MEDIDO]`. Há linha para `F1-base.md`,
  `T-01.3-build.md` e `T-01.4-build.md`. ⛔ **Não há linha para `gates/T-01.2-build.md`** (`grep -n 'estrutura-do-front' docs/INDEX.md |
  grep T-01` → nenhuma da `T-01.2`), e o §8 desse relatório afirma *"docs/INDEX.md: linha acrescentada para este relatório"*. O commit
  `4f202d8a`, que criou o relatório, só mexe em `T-01.2-build.md` e `handoff/T-01.2.md` (`git show --stat`) `[MEDIDO]`. **BLOCKER-1.**
- **Carimbo da linha da `T-01.3` no INDEX:** a linha diz `2026-10-03T16:30Z`, mas o commit `969914a8` é de `14:22Z`
  (`git log --format=%aI` → `11:22:07-03:00`) `[MEDIDO]`, e a linha da `T-01.4` (`14:55Z`) vem depois com hora anterior. O INDEX é
  append-only, então a correção é uma linha nova, não uma edição (WARNING-5).
- **`frontend/README.md` §26** (+93/−0): conferi o que ele afirma. A árvore bate com `find chart chrome indicators -type f`, e os 4
  diretórios de topo estão em `top-level-source-directories.test.ts`. `indicator-isolation-rule.test.ts` tem 5 `test(`, como o README
  diz. P1–P3 batem com o cabeçalho de `eslint-rules/indicator-isolation.mjs` `[MEDIDO]`. A "linha chrome" está declarada como
  convenção, e o G4 confirma que não é portão.
- **`SPEC-011 §7.2`:** a receita que a SPEC manda (*"o diff fica vazio em F1"*) dá **52** linhas na F1, e é cega à ordem (§1.1–1.2).
  As fases F4–F7 vão herdar a mesma receita (WARNING-1).
- **Comentários desatualizados** (declarados na `T-01.4` §1, deixados como estão por ser movimento): a docstring de `useLiveReadout`, o
  comentário de `e2e/08:87`, `scripts/scope-graph.mjs:8` e `ADR-043`. O último é registro histórico e não muda.
- **Rótulos:** os números dos relatórios têm comando e universo. Duas ressalvas, sem efeito no veredito:
  - `T-01.4-build.md` §2 chama de "universo" um conjunto de 1 arquivo de base, e o meu universo é a árvore inteira;
  - o `B` da fase não foi remedido por mim, e está rotulado `[DOC]` acima.

## Achados

1. **[BLOCKER] Falta a linha de `gates/T-01.2-build.md` em `docs/INDEX.md`, e o §8 do relatório afirma que ela existe.**
   Os pontos de referência são `docs/context/estrutura-do-front/gates/T-01.2-build.md:106` e `docs/INDEX.md` (nenhuma linha).
2. **[WARNING] A receita de `CA-8` em `SPEC-011 §7.2` / estudo §5 está errada em dois pontos.**
   - Ela não tira membro de import multilinha: dá 52 linhas na F1, quando deveria dar vazio.
   - Ela é cega a reordenação (K2).
   A fase só passa pela variante estrita, acrescida do `order.py`. A letra do DoD-2 da `T-01.4` (*"diff VAZIO"*) não se cumpre por
   5 linhas de casca, aceitas aqui. Até a F4, alguém precisa fixar a receita: o `/architect` ou um adendo ao plano.
3. **[WARNING] As listas `MOVED_OUT_FILES` são explícitas e não incluem `chart/host/**`.**
   Uma violação futura que caia no host, ou num arquivo novo de `chart/marks/`, escapa das asserções negativas dos 10 testes de pane.
   Hoje não há nada escondido (§3.1). Os testes que estão em `frontend/src/app/symbol/*-dom-contract.test.ts` vão para as pastas dos
   indicadores na F4–F7, e é nesse momento que o universo deve passar a ser recursivo.
4. **[WARNING] `T-04.1` desatualizada.** O `refs` (`tasks.toml:312-313`) ainda trata `VolumeSlot` como algo que está em
   `SymbolClient.tsx:213`, e o DoD dela passaria em vazio. O handoff da `T-04.1` precisa dizer que o tipo já está em
   `chart/legend/LegendValue.tsx` e que sobra o `formatSpan`.
5. **[WARNING] Os tipos do host estão duplicados entre `registrar.ts` e `indicator-binding.ts`.**
   São 4 tipos de mesmo nome nos dois arquivos, e a F2 é quem os unifica, como `indicator-binding.ts` declara. Até lá, um import pode
   apontar qualquer um dos dois sem que nada reprove.
6. **[WARNING] O carimbo da linha da `T-01.3` no INDEX está errado** (16:30Z contra o commit de 14:22Z). Corrige-se por linha
   acrescentada.

## Veredito: **NEEDS_FIX**, e só no documento

Ações:
1. Acrescentar ao fim de `docs/INDEX.md` a linha de `context/estrutura-do-front/gates/T-01.2-build.md` (`T-01.2`, `frontend-builder`,
   host e eixo para `chart/host/`/`chart/axis/`; CA-8 estrito `rc=0`, N_fact 47, B −0,05%). Pode trazer também a correção do carimbo
   da `T-01.3`. **Nenhuma linha existente é reescrita.**
2. (WARNING, até a F4) Registrar a receita estrita e o complemento de ordem como a receita de `CA-8`. Os scripts estão em
   `scratchpad/qaf1/`. O lugar é um adendo à `SPEC-011 §7.2` ou ao plano `04`, e isso é decisão do `/architect`.
3. (WARNING) Registrar no handoff da `T-04.1` que o `VolumeSlot` já está em `chart/legend/LegendValue.tsx`.

O código não precisa de correção. A conservação está provada na árvore inteira (estrita 0/0 em `T-01.2`/`T-01.3`; 5 linhas de casca
declaradas na `T-01.4`), a ordem se mantém, nenhum import foi religado e as guardas mordem 14/14 e calam 6/6. Depois da ação 1, a fase
está em condição de `APPROVED` sem nova rodada de testes, porque a mudança é só de doc. Este relatório (`W-F1-QA.md`) é indexado pelo
orquestrador no fechamento da wave, como foi feito com `W-F0-QA.md`.
