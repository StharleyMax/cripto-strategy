# CODE-REVIEW — fase `01` de `cinco-metricas-do-core`, os 2 commits de CÓDIGO

**Veredito: `COMPLIANT`.** Nenhuma regra bloqueante violada.
**Gravidade encontrada: 1 `WARNING` (convenção de idioma) + 2 `INFO`. Zero `BLOCKER`.**

- **Universo:** `git diff 4cb94dd..14520a2 -- frontend/src frontend/e2e` → **7 arquivos, 1.205 linhas
  adicionadas, 5 removidas**. Os 2 commits de código são `388ec1a` (produção + 3 arquivos de teste) e
  `b6f407d` (`frontend/e2e/09-volume-dado-real.spec.ts`, novo). Os outros 3 commits do intervalo
  (`bddf814`, `cb714e0`, `4c1810e`, `14520a2`) tocam só `docs/` `[MEDIDO: git diff --stat]`.
- **Contexto de processo, registrado porque foi declarado:** estes 2 commits entraram direto na
  `master` local, sem PR e sem code-review, enquanto as PRs `#217`/`#222` do mesmo dia passaram pelos
  3 gates. Isto **não** muda o veredito técnico abaixo — mas é a razão de este relatório existir, e a
  assimetria fica escrita em vez de esquecida.

---

## 1. O DENOMINADOR — o que a máquina mediu, e o que ela declaradamente NÃO mediu

| | |
|---|---|
| regras bloqueantes em vigor | **8** `[MEDIDO: harness rules list --severity block → "total: 8 regra(s) em vigor"]` |
| regras avaliadas | **as 8**, sobre cada arquivo, via `harness rules --mode file --path <arquivo>` |
| arquivos varridos pelo runner | **6 de 7** — os 6 sob `frontend/src/` |
| violações bloqueantes | **0** — saída vazia, `rc=0`, nos 6 |
| varredura de controle | `harness rules --mode sweep --changed-only --format ndjson` → `rc=0`, **0 byte**; `harness rules --mode sweep --format ndjson | wc -l` → **73** linhas (todas `warn`, nenhuma `block`) |

### ⛔ O sétimo arquivo: `rc=0` que NÃO é aprovação, e eu não o contei como se fosse

`frontend/e2e/` **não está** em `[code_paths] include_prefixes`
(`["backend/src/", "backend/tests/", "frontend/src/", "deploy/"]`
`[MEDIDO: harness policy --key code_paths]`) ⇒ para
`frontend/e2e/09-volume-dado-real.spec.ts` o runner devolve `rc=0` **vazio porque não olhou**, não
porque aprovou. É o modo de falha que `ADR-012` nomeia: `rc=0` indistinguível entre *"nada errado"* e
*"o instrumento não alcança"*. **Auditei as 472 linhas à mão** — §4 abaixo. O próprio commit `b6f407d`
já declara essa lacuna na mensagem, em vez de se beneficiar dela.

### A outra camada, a que o runner não expressa

`harness policy --key glossary_doc` → **1 byte (só o newline), `rc=0`**; `grep -n 'glossary'
harness.toml` → **`rc=1`, nenhuma linha**. As duas medições juntas dizem *"nunca declarado"*, não
*"declarado e vazio"* — o gatilho de `ADR-013/D2e` continua **fechado**, e por isso **nenhum achado de
idioma aqui pode ser `BLOCKER`** (§5).

---

## 2. ⛔ A FRONTEIRA `charts`↔`web` (`ADR-003`) — NÃO foi furada, e o instrumento MORDE de verdade

O ponto de maior risco do `388ec1a`: o adaptador ganhou **3 símbolos novos** na categoria 3 do barril
(`positiveValueSeriesLossless`, `absenceMarkSeries`, `zeroMarkSeries`) **e um quarto par na categoria 1**
(`installGlobals`, `flushFrames`). Quatro medições, e nenhuma delas é leitura de comentário:

**(a) O lint da fronteira passa.** `npm --prefix frontend run lint` (`eslint src`) → **`rc=0`, zero
problema**.

**(b) E o `rc=0` NÃO é vacuoso — o falsificador da própria fronteira morde.**
`node --test frontend/src/charts/eslint-boundary.test.ts` → **`tests 5 · pass 5 · fail 0`**, incluindo:

- `ADR-034/D8 MORDE+MORDE+CALA: src/app/symbol/** may import only the charts barrel, and only there`
- `D5.12 MORDE+CALA: the charts<->web import boundary bites both directions and stays green on real code`
- e as 3 formas dinâmicas (`await import`, template literal puro, `require`).

Isto responde literalmente a pergunta *"`boundaries` mede isso de verdade?"*: **mede — mas não é o `make
boundaries`.** `make boundaries` roda `backend/scripts/boundaries.sh` (`import-linter`, **Python**), e
`ADR-003:75` já registra que ele **não alcança** `charts`/`web`, que são TypeScript. Quem mede esta
fronteira é `eslint` + o teste acima, e ambos estão vivos.

**(c) Todo cruzamento novo é pelo barril sancionado, dentro da rota sancionada.**
`frontend/src/app/symbol/SymbolClient.tsx:83` e `volume-subaxis-geometry.test.ts:41` importam de
`"../../charts/index.ts"` — exatamente a exceção estreita que `ADR-034/D8` carva (`files:
["src/app/symbol/**"]`, 3 negações só para `charts/index`). **Nenhum import profundo**; o caso
`morde-1` do falsificador prova que um `charts/s2-cvd` ali reprovaria.

**(d) Os 3 símbolos novos não alargam a porta.** Assinatura idêntica à de `lineSeriesLossless` já
exportada: `readonly ScalarSlot[] -> readonly (LineItem | WhitespaceItem)[]`. Nenhum decide altura, cor
ou escala — `markValue` é **argumento do chamador**.

**(e) O `installGlobals`/`flushFrames` no barril NÃO cria aresta de dependência nova — medido, não
presumido.** O barril **já** alcançava `jsdom` **antes** deste commit, pela exportação pré-existente de
`runHeadlessChart`: `git show 4cb94dd:frontend/src/charts/s2-headless-run.ts` → `:19 import { JSDOM }
from "jsdom"` e `:20 import { installGlobals, flushFrames, … } from "./headless-chart.ts"`. E o
`jsdom` **não vaza para o bundle**:

```
grep -rl "jsdom" frontend/.next --include="*.js"        # nenhum arquivo
grep -rl "headless-chart" frontend/.next --include="*.js"  # nenhum arquivo
```

O sourcemap do chunk SSR de `SymbolClient` lista **16 sources**, **7 delas de `charts/`**, e
`headless-chart.ts` **não está entre elas** `[MEDIDO 2026-09-15 sobre frontend/.next de 20:35, posterior
a 388ec1a de 20:13]`. Os únicos hits de `"jsdom"` em `.next` estão em `.js.map`, dentro de
`sourcesContent` de **comentários**.

> **Veredito da fronteira: `COMPLIANT`.** Geometria em `charts`, forma em `web`, cruzamento pelo barril,
> e o instrumento que cobra isso foi rodado e morde nos dois sentidos.

---

## 3. ⛔ O CONSERTO USA O *MODO* DA ESCALA, NÃO TRANSFORMA O DADO — confirmado

Esta era a condição de `NON_COMPLIANT` mais cara: se `log10(v)` tivesse entrado na série, a tela passaria
a exibir um número que **não é o volume**.

```
grep -n "Math.log\|log10(" frontend/src/app/symbol/SymbolClient.tsx frontend/src/charts/s2-lightweight-adapter.ts
```
→ **4 ocorrências, todas em COMENTÁRIO** (`adapter.ts:92`, `SymbolClient.tsx:344,549,557`). **Zero em
expressão executável.**

E o caminho do dado, lido inteiro:

- `SymbolClient.tsx:560` → `volumeSeries.setData(positiveValueSeriesLossless(volume.slots))`, e
  `s2-lightweight-adapter.ts` devolve **`{ time, value: slot.value }`** — o valor **cru**, sem operação
  aritmética nenhuma.
- A escala log vive **só** na geometria: `volumeSeries.priceScale().applyOptions({ …, mode:
  PriceScaleMode.Logarithmic })` (`:555`).
- `absenceMarkSeries`/`zeroMarkSeries` desenham numa **escala à parte**
  (`VOLUME_MARKS_PRICE_SCALE_ID`, faixa fixa via `autoscaleInfoProvider`), então a marca **não entra no
  autoscale do dado** nem se mistura com ele.
- `positiveValueSeriesLossless` **lança `RangeError` em valor negativo** em vez de o empurrar para um
  dos três baldes — recusa explícita, não invenção de significado.

> **`COMPLIANT`.** O número que a tela lê continua sendo o volume.

---

## 4. O `e2e` auditado À MÃO — porque o runner não o alcança

`frontend/e2e/09-volume-dado-real.spec.ts`, 472 linhas, 3 testes. O que verifiquei, lendo:

| propriedade | resultado |
|---|---|
| semeadura no Postgres compartilhado | **nenhuma** — zero `INSERT`, `psql` ou `docker` no arquivo. O único fixture é sintético e vive **em memória**, dentro do teste `MORDE do instrumento` |
| ramo por universo | lido da **própria API** (`GET /ready` → `store.path`), **não** de env var — o arquivo declara, corretamente, que env var ali seria *"allowlist disfarçada"* |
| o piso | `MINIMUM_DISTINCT_POINTS = 30`, com `MORDE` (grade de 5.761 linhas e **zero** valor reprova; borda em 29 reprova) e `CALA` (30 e 3.374 passam) — o par roda **nos dois universos** |
| falso-verde `Number(null) === 0` | fechado **antes** da comparação, por `requireDigits` (`not.toBeNull` + `/^\d+$/`) |
| invariante `DOM == API` | exata, sobre a **mesma janela que o servidor declara no `<main>`**, nunca sobre o relógio do processo de teste |
| `RN-1` | `expect(readoutText).not.toMatch(/\d/)` no ramo de ausência — nenhum `0` fabricado |

Nada aqui viola regra bloqueante nem norma citável. **`COMPLIANT`.**

---

## 5. `[WARNING]` Idioma — a única divergência real, e ela é convenção, não portão

**`[WARNING]` comentário e nome de teste em português nos arquivos de teste novos/alterados —
`frontend/src/app/symbol/volume-subaxis-geometry.test.ts` (arquivo inteiro, ex.: `:235`, `:252`,
`:270`, `:280`, `:303`) e `frontend/src/app/symbol/volume-subaxis-dom-contract.test.ts:175,189,211` —
`CLAUDE.md` §*"A tabela de fronteira"*, linha 2 (identificador de teste, inclusive o nome do teste →
inglês) e linha 5 (docstring/comentário → inglês).**

Medido sobre as linhas **adicionadas** por `388ec1a` (`git show 388ec1a -- <f> | grep "^+[^+]"`):

| arquivo | linhas com acento PT / linhas adicionadas |
|---|---|
| `volume-subaxis-geometry.test.ts` | **93 / 292** |
| `volume-subaxis-dom-contract.test.ts` | **27 / 73** |
| `s2-lightweight-adapter.test.ts` | **17 / 66** |
| `SymbolClient.tsx` | **59 / 145** |
| `charts/index.ts` | **10 / 23** |
| `charts/s2-lightweight-adapter.ts` | **4 / 88** |

**O achado mais acionável é o `volume-subaxis-dom-contract.test.ts`, e é uma divergência DENTRO do
mesmo arquivo**: os 7 testes pré-existentes estão em inglês (`"T-01.9 contract: the volume sub-axis
carries the STABLE testid, spelled exactly"`, `"CALA: a design_gate NEEDS_FIX about colour, height or
scale leaves the contract intact"`) e os **3 acrescentados por este commit** estão em português
(`"BLOCKER-1: a série de barras usa o mapeamento que uma escala log consegue posicionar"`). Duas línguas
no mesmo arquivo, introduzidas aqui.

**⚠️ O que este `WARNING` NÃO é, e a honestidade custa a força do achado:**

1. **Não pode ser `BLOCKER`, por construção.** `CLAUDE.md`: *"idioma de identificador é convenção, não
   portão"*, e ⛔ *"Nenhuma `[[rules.own]]` de idioma, nenhum alvo de `make` de idioma, nenhuma allowlist
   de idioma"* — declarar uma **REPROVA a fase** (`PRD-002`/`RN-4`).
2. **Não é classe nova neste repositório.** Baseline em `4cb94dd`, sobre os `*.test.ts` de
   `frontend/src/`: **12 arquivos com ≥ 5 linhas de português**, o maior sendo
   `features/s3-inspector/view-model.test.ts` com **31**
   `[MEDIDO: git ls-tree -r --name-only 4cb94dd -- frontend/src | grep "\.test\.ts"]`. O commit
   **continua** uma deriva existente; não a inventa.
3. **`s2-lightweight-adapter.ts` (produção) NÃO é violação.** Os 4 hits de português são **citação
   verbatim** de `STITCH_CONTEXT.md:1821-1825` dentro de docstring inglesa — citar uma fonte na grafia
   dela é o oposto de escrever em português.
4. **A microcopy em pt-BR está CERTA.** `VolumeScaleNote` e `VolumeMarksLegend`
   (`SymbolClient.tsx:446-490`) são string visível de UI — **linha 8** da tabela manda pt-BR.

**Correção concreta:** traduzir para inglês os nomes de teste e comentários adicionados em
`volume-subaxis-geometry.test.ts` e nos 3 testes novos de `volume-subaxis-dom-contract.test.ts` —
começando por este último, onde a mistura é **intra-arquivo** e portanto a mais barata de fechar e a mais
visível para o próximo leitor. Não bloqueia merge.

---

## 6. `[INFO]` × 2

**`[INFO]` O barril de `charts` exporta um shim de `jsdom` (devDependency) e a limpeza do bundle depende
de tree-shaking — `frontend/src/charts/index.ts:51` — `ADR-034/D8` (categoria 1 do barril).** Hoje está
**limpo e medido** (§2e: zero `jsdom` nos chunks `.js`), e a aresta `barril → jsdom` **já existia** via
`runHeadlessChart`, então este commit não a criou. O que ele faz é **alargar a superfície que depende
dessa limpeza continuar acontecendo**, sem que nada no repositório a cobre. O próprio
`09-volume-dado-real.spec.ts:77-80` registra o custo já pago por essa aresta: importar `view-model.ts`
num spec de Playwright puxa `charts/index.ts -> jsdom`, *"que morre sob o carregador de módulos do
Playwright e leva a COLEÇÃO inteira para `Total: 0 tests`"*. **Sugestão (não bloqueia):** um assert de
uma linha — `grep -rl "jsdom" frontend/.next --include="*.js"` tem de devolver vazio — transforma
"tree-shaking funcionou" de premissa em medição.

**`[INFO]` O `testid` do sub-eixo é soletrado à mão no `e2e` em vez de importado —
`frontend/e2e/09-volume-dado-real.spec.ts:85`.** Duplicação deliberada, com o motivo escrito (`:77-83`) e
com testemunha cruzada em `volume-subaxis-dom-contract.test.ts`, que assere a mesma string do outro lado.
Aceito como está; registrado para que o próximo leitor saiba que **são duas cópias**, e que quem mudar o
`data-testid` tem de mudar as duas.

---

## 7. O resto do checklist

| item | resultado |
|---|---|
| `docs/INDEX.md` **append-only** | **`COMPLIANT`** — `b6f407d` e `388ec1a` acrescentam **1 linha cada**, `0` linha removida ou reescrita `[MEDIDO: git show <c> -- docs/INDEX.md | grep -E "^[+-]" | grep -v "^[+-][+-][+-]"]` |
| autoria (`CLAUDE.md` §*"Commits"*) | **`COMPLIANT`** — autor **e** committer `Stharley Maxwell <stharleymax@gmail.com>` nos dois; `grep -ic "co-authored-by"` sobre as duas mensagens → **0** |
| o instrumento novo existe e é EXERCITADO | **sim** — `npm --prefix frontend run test:app` → **`tests 212 · pass 212 · fail 0`**, e os 6 testes de pixel aparecem nomeados na saída (`"BLOCKER-1: nenhuma barra presente cai abaixo de 1 pixel"` — `238,4 ms`, `"BLOCKER-2: ausência, zero legítimo e a menor barra presente ocupam pixels DIFERENTES"` — `72,3 ms`). Não é teste que existe sem rodar |
| o instrumento falha ALTO se a âncora mudar | **sim** — `productionNumber()` (`geometry.test.ts:48-52`) faz `assert.ok(match !== null, …)` em vez de defaultar; um `default` ali seria *"a medição trocando de objeto em silêncio"*, e o arquivo diz isso |
| escopo | **`COMPLIANT`** — `git diff --stat` confere com o declarado; nenhum arquivo fora de `frontend/src` + `frontend/e2e` + `docs/` |

---

## Veredito

# `COMPLIANT`

**0 de 8 regras bloqueantes violadas**, avaliadas sobre **6 de 7** arquivos pelo runner
(`harness rules --mode file --path <arquivo>`, 6× `rc=0` vazio) e sobre o **sétimo à mão**, porque
`frontend/e2e/` está fora de `[code_paths] include_prefixes` e o `rc=0` de lá não é aprovação.

A fronteira `ADR-003` `charts`↔`web` **não foi furada**, e isso foi medido pelo instrumento que a cobra
(`eslint` + `eslint-boundary.test.ts`, **5/5**, MORDE nos dois sentidos), não inferido de comentário. O
conserto do `BLOCKER-1` usa o **modo** da escala e o dado chega **intacto** à série — `log10` não existe
em nenhuma expressão executável.

Fica **1 `WARNING`** (idioma nos testes novos, com a mistura intra-arquivo em
`volume-subaxis-dom-contract.test.ts` como o ponto mais acionável) — e ele **não pode ser `BLOCKER`**,
porque `CLAUDE.md` declara idioma de identificador como **convenção sem portão** e proíbe construir um.
E **2 `INFO`**, ambos sobre fragilidade futura, nenhum sobre defeito presente.

**Nada aqui justifica segurar o `push` para o `origin`.** O que justificaria um relatório à parte — e não
é achado de código — é a assimetria de processo declarada na abertura: 2 commits de código na `master`
sem PR, enquanto `#217`/`#222` do mesmo dia pagaram os 3 gates.
