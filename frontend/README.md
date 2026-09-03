# `frontend/` — a superfície de regra do navegador

Este diretório **ainda não é a aplicação**. A aplicação Next.js pertence ao componente
`web` e a outra task. O que existe hoje foi criado por **`T-01.2`** (`CST-9`) e tem uma
função só: **fazer `frontend/` deixar de ser área declaradamente não coberta.**

---

## 1. Por que o layout é `src/{app,features,components}` e não outra coisa

**É decisão de enforcement, não de estética** — `ADR-009/D3`.

O pack `web-fullstack` fixa o alvo das regras de navegador em **`frontend/src/**`**. Um
App Router em `frontend/app/` sairia inteiro do universo de regras **em silêncio**, e o
`harness doctor` continuaria dizendo CONFORME sobre um universo que não o inclui. O
diretório é parte do contrato.

## 2. As três partes que só valem juntas (`plano 01`, item `1.4`)

| parte | onde | valor |
|---|---|---|
| (a) prefixo | `harness.toml` → `code_paths.include_prefixes` | `+ "frontend/src/"` |
| (b) globs | `harness.toml` → `code_paths.include_globs` | `+ "*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.jsx", "*.mjs", "*.cjs"` |
| (c) pack | `harness.toml` → `[rules].packs` | `+ "web-fullstack"` |

**(a)+(b) sem (c) não fecha nada, e (c) sem (a)+(b) também não.** As regras do pack
declaram `scope = "code"`: sem o prefixo e os globs, o classificador não considera um
`.tsx` código, e nenhuma regra é avaliada.

O comando que separa as duas causas:

```
harness code-paths classify frontend/src/features/panel/Filter.tsx
# ANTES: nao-producao — nenhum include_prefixes casa ['backend/src/', 'backend/tests/']
# HOJE : producao — include_prefixes + include_globs casam e nada exclui
```

---

## 2-bis. A QUARTA SUPERFÍCIE — `.jsx`/`.js` — e por que ela foi FECHADA, não declarada

A entrega original de `T-01.2` levou `include_globs` a `["*.py", "*.ts", "*.tsx"]`. O
`/qa` mediu o buraco: **o MESMO violador passa só por trocar de extensão.**

`[MEDIDO 2026-08-28, ANTES da correção; três arquivos irmãos com o mesmo import de
`backend/src/`]`:

| arquivo | `code-paths classify` | `rules --mode file --surface ci` |
|---|---|---|
| `serie.tsx` | `producao` (rc=0) | **`[BLOQUEIO]`, rc=1**, 310 bytes |
| `serie.jsx` | `nao-producao: nenhum include_globs casa` (rc=1) | **rc=0, 0 byte** |
| `serie.js` | `nao-producao: nenhum include_globs casa` (rc=1) | **rc=0, 0 byte** |

E o ESLint tinha o buraco gêmeo: `files: ["**/*.ts", "**/*.tsx"]` mais a expansão padrão
de diretório fazia `eslint -f json src` listar **6 arquivos com `serie.jsx` AUSENTE**, e
`serie.js` presente com **`no-undef` apenas** — não `no-console`.

### A decisão: FECHAR, e o argumento que a separa das outras três notas

As três lacunas declaradas em `harness.toml` (`backend/scripts/`, `test_globs` de
frontend, `[test_cmd.web]`) recusam fechar por um motivo medido: **nenhuma regra alcança
o alvo**, ou o universo é zero. **Aqui é o oposto**: o alvo de
`web-fullstack.browser-imports-server` é `frontend/src/**`, **sem extensão nenhuma**
`[MEDIDO: packs/web-fullstack/rules.toml:16]`. O `[BLOQUEIO]` já existe e já alcança o
caminho — quem o retinha era exclusivamente a lista de globs. Declarar em vez de fechar
seria deixar um portão pronto desarmado por causa de um sufixo, e **Next.js emite `.js` e
`.jsx`**: as 16 tasks de `charts`/`web` herdariam o buraco.

**Custo medido, e ele é zero:** os únicos `.js`/`.mjs` fora de `node_modules` são
`scripts/validate_palette.js` e `frontend/eslint.config.mjs`, e **nenhum está sob
`include_prefixes`** — o predicado de prefixo os recusa antes de a lista de globs ser
consultada. `backend/` tem **0** `.js`; `frontend/src/` tinha **0** `.js*`.
`node_modules/` fica fora por razão independente: o caminhador do sweep o pula
`[MEDIDO: lib/rules.py:304]`. O risco nomeado no review — `.js` gerado de build sob
`frontend/src/` — não se materializa: o Next.js emite `.next/`, `next-env.d.ts` e
`next.config.js` na **raiz** do pacote, e o prefixo só alcança `src/`. Se um dia gerar
dentro de `src/`, a saída é `exclude_globs`, não amputar a extensão.

### A prova, nos DOIS portões, DEPOIS da correção

**Portão 1 — regras.** Sete arquivos irmãos, o mesmo import proibido, uma extensão cada
`[MEDIDO 2026-08-28]`:

```
harness code-paths classify frontend/src/features/panel/serie.<ext>
harness rules --mode file --path frontend/src/features/panel/serie.<ext> --surface ci
```

| ext | `classify` | `rules … --surface ci` |
|---|---|---|
| `.tsx` `.jsx` `.mts` `.cts` `.mjs` `.cjs` | `producao`, rc=0 | **`[BLOQUEIO]`, rc=1**, 310 bytes |
| `.js` | `producao`, rc=0 | **`[BLOQUEIO]`, rc=1**, 309 bytes |

**7 de 7 mordem.** Antes eram 1 de 7.

**Portão 2 — ESLint.** Mesmos sete arquivos em `src`, `eslint -f json src`:
**11 arquivos reportados** (eram 6), `rc=1`, e **`no-console` em todos os sete** — o
`.jsx`, que antes não era sequer lido, agora é. Um `.jsx` LIMPO
(`export function Painel() { return <div>ok</div>; }`) sai com **0 erro**: alargar `files`
não quebrou o parse de JSX.

**Nenhum dos sete ficou na árvore** — a razão é a da `§3`: com eles presentes,
`harness rules --mode sweep --surface git-hook` sai `rc=1`.

---

## 3. ⚠️ A RECEITA DE 4 LINHAS — o violador NÃO mora na árvore

`D1.3` exige um **BLOQUEIO devolvido**, e para isso é preciso um arquivo que viole. Ele
foi plantado, medido e **removido**, e a remoção é obrigatória e medida: com ele
presente, `harness rules --mode sweep --surface git-hook` sai **`rc=1`** e o `pre-push`
recusa o push. Deixá-lo na árvore trocaria um portão que funciona por um repositório que
não consegue empurrar.

Para reproduzir do zero, da raiz do repositório:

```bash
printf 'import { x } from "../../../../backend/src/modules/sentimento/domain/etl_backlog";\nexport function Serie() { console.log(x); return null; }\n' > frontend/src/features/panel/serie.tsx
harness rules --mode file --path frontend/src/features/panel/serie.tsx --surface ci   # espera BLOQUEIO, rc=1
harness rules --mode file --path frontend/src/features/panel/Filter.tsx  --surface ci   # espera SILÊNCIO, rc=0
rm frontend/src/features/panel/serie.tsx
```

**As duas linhas do meio são obrigatórias juntas** — é o item `1.8'` do plano, o *teste
dos dois lados*: "morde" sozinho não exclui um pack que reprove tudo, e "cala" sozinho é
indistinguível de pack desligado.

### O código de saída depende da SUPERFÍCIE, e isso não é detalhe

`[MEDIDO 2026-08-28]`, sobre o mesmo arquivo violador:

| invocação | superfície efetiva | saída | `rc` |
|---|---|---|---|
| `harness rules --mode file --path <v>` | `posttool` (default de `--mode file`) | `{"decision": "block", …}` | **2** |
| `… --surface ci` | `ci` | `[BLOQUEIO] …` legível | **1** |
| `… --surface git-hook` | `git-hook` | `[BLOQUEIO] …` legível | **1** |

Citar `exit=2` **sem** citar a superfície é meia medição: os dois valores são o mesmo
veredito lido por portões diferentes.

---

## 4. ESLint — o validador de TypeScript, e o que ele ainda NÃO é

`ADR-011/D4` trocou duas `[[rules.own]]` de regex por ESLint. **Não há nenhuma
`[[rules.own]]` de TypeScript neste repositório, e não deve haver.**

```bash
make setup    # instala frontend/node_modules (e o venv do backend) — desde T-01.6
make lint     # lint do backend + `npm --prefix frontend run lint` — desde T-01.6
```

Os comandos diretos continuam valendo, e são os que as receitas abaixo citam:

```bash
npm --prefix frontend install          # uma vez
npm --prefix frontend run lint         # eslint src
```

**`make lint-frontend` RECUSA com `rc=3` se `frontend/node_modules/` não existir**, em vez de deixar
o `npm run lint` falhar por motivo que **não** é violação de regra. É a mesma semântica dos scripts
do backend: `rc=3` é *"não mediu"*, `rc=1` é *"mediu e reprovou"* — e ler um pelo outro é declarar
verde (ou vermelho) sobre universo errado.

**Use o ESLint DO PROJETO.** Existe um `eslint` global nesta máquina
(`/usr/bin/eslint`, **v6.4.0**) e ele **não vale**: é anterior ao flat config e não
conhece `typescript-eslint`. O do projeto é **v10.9.1**
`[MEDIDO 2026-08-28: ./node_modules/.bin/eslint --version]`.

### ⛔ Instalado NÃO é portão — e isto está escrito para não ser descoberto depois

Nenhum portão automático roda este ESLint hoje. `test_cmd` **não é lido por portão
nenhum** (quem o consome são os agentes `builder` e `qa`), não há CI, e o `pre-push`
gerado roda `require-push` + `rules --mode sweep` — **não roda `make`**. Ligar o ESLint a
algo que reprova é `ADR-011/D2` (o `Makefile`, `T-01.6`) mais `D3b`
(`scripts/hooks/pre-push.pre-harness`, `T-01.5`). **Nenhuma das duas é esta task**, e por
isso `[test_cmd.web]` **não** foi declarado: escrever a chave daria aparência de portão
sem criar um.

#### ✅ Atualização 2026-08-28 (`T-01.6`) — METADE andou, e a outra metade continua aberta

**O que mudou:** existe `Makefile`, e `make lint` roda o ESLint do projeto. A bancada de `D1.3b`
deixou de ser **receita** e voltou a **rodar sozinha** — plantar os dois violadores das `§3` e `§4`
e chamar **um** comando basta.

**Teste dos dois lados, pelo `make lint`** `[MEDIDO 2026-08-28]`:

| lado | árvore | `make lint` | `harness rules --mode sweep --surface git-hook` |
|---|---|---|---|
| **CALA** | de hoje, sem violador | **`rc=0`**, ESLint silencioso | **`rc=0`** |
| **MORDE** | `serie.tsx` (`§3`) + `tipos.ts` (`§4`) plantados | **`rc=2`** (o `make` sai 2; o `npm run lint` saiu 1), **3 errors**: `no-console` em `serie.tsx:2:27`, `@typescript-eslint/no-explicit-any` em `tipos.ts:1:38` e `2:33` | **`rc=1`**, `[BLOQUEIO] [web-fullstack.browser-imports-server] serie.tsx:1` |
| **limpeza** | violadores removidos | **`rc=0`** | **`rc=0`** |

**O que NÃO mudou, e é o que impede chamar isto de fechado:** `make lint` continua sendo comando de
**humano**. O `pre-push` gerado segue rodando `require-push` + `rules --mode sweep` e **não chama
`make`**. Quem liga os dois é **`scripts/hooks/pre-push.pre-harness`** — `ADR-011/D3b`, **`T-01.5`**,
que `T-01.6` está proibida de criar. **Até lá o ESLint é ferramenta que existe e que nenhum portão
automático roda**, e `[test_cmd.web]` continua **não** declarado pelo mesmo motivo de antes.

#### ✅ FECHADO em 2026-08-28 (`T-01.5`) — o ESLint passou a reprovar um `push`

**As linhas acima ficam**: elas descrevem o estado que era verdade quando foram medidas, e o
`append-only` deste repositório vale para a prosa também. O que mudou é a última frase delas.

`scripts/hooks/pre-push.pre-harness` existe, é versionado, e o `pre-push` **gerado** o chama e **soma
o veredito** (`|| FALHOU=1` no `exit $FALHOU`) — **sem uma linha editada no hook gerado e sem
`core.hooksPath`**, que o `CLAUDE.md` proíbe. Ele roda `make boundaries` **e** `make lint`.

**O falsificador foi medido com um `.tsx` da FAMÍLIA desta `§4`** — `any` + `console`, as duas
violações que só o ESLint vê — **e NÃO com o `serie.tsx` da `§3`**, e a distinção é obrigatória
`[ERRATUM 2026-08-29, achado do `/qa`]`: o `serie.tsx` da `§3` viola
`web-fullstack.browser-imports-server`, que é **regra em vigor**, e por isso **já é recusado hoje**
`[MEDIDO 2026-08-29: sweep --surface git-hook com ele na árvore → rc=1, `[BLOQUEIO] … serie.tsx:1`]`.
Usá-lo tornaria o falsificador **não-informativo** — o push cairia antes de o `make lint` falar.
`[MEDIDO 2026-08-28, bancada isolada:
clone do repositório em `/tmp`, `pre-push` gerado copiado, ledger de `.git/harness/` copiado
(`BUILD_AUTHORIZED`), remoto local `remoto.git`; **nada escrito no repositório real**]`:

| árvore | hook instalado | `git push --dry-run` |
|---|---|---|
| violador `.tsx` com `any` + `console` | **não** | **ACEITO**, `rc=0` |
| o mesmo violador | **sim** | **RECUSADO**, `rc=1`, e a saída nomeia as **2** violações: `no-explicit-any` em `2:32` e `no-console` em `3:3` |
| limpa | **sim** | **ACEITO**, `rc=0` |

**⚠️ E a medição derrubou o motivo que este README dava para o `.tsx` de `any`/`console` passar** —
**para esse, e não para o da `§3`.** A `§2` já registra
que `frontend/src/` **entrou** em `code_paths` com `T-01.2`; re-conferido agora
`[MEDIDO 2026-08-28: harness code-paths classify frontend/src/components/ui/violador_eslint.tsx →
"producao"]`. O que deixava o `.tsx` passar **não** era o recorte de caminho: é que **nenhuma regra em
vigor cobre `any`/`console`** desde que `ADR-011/D4` as trocou por ESLint
`[MEDIDO 2026-08-28: harness rules --mode file sobre ele → rc=0, saída vazia; sweep --surface
git-hook → rc=0]`. O buraco era **de regra**, não de caminho — e é exatamente o buraco que o ESLint
no `pre-push` fecha.

**`[test_cmd.web]` continua NÃO declarado, e agora por um motivo diferente do de antes.** O motivo
antigo ("o mecanismo que cobra não existe") caiu. O que sobra é o motivo original e menor:
`test_cmd` **não é lido por portão nenhum** — quem o consome são os agentes. Declará-lo é decisão de
quem possuir o componente `web`, com dono nomeado; `T-01.5` não a toma de passagem
`[NÃO MEDIDO: nenhuma medição desta task diz o que mudaria no comportamento de `/qa` para `web`]`.

### `D1.3b` — a medição que prova por que AST, e não regex

O argumento *"AST não tem os dois defeitos da regex"* era **mecanismo, não medição**.
Universo: **3 arquivos / 4 linhas de código / 2 violações reais / 2 usos legítimos**.

| arquivo | conteúdo | é violação? | `:\s*any\b` | `\bany\b` | **ESLint do projeto** |
|---|---|---|---|---|---|
| `tipos.ts` | `Record<string, any>` + `Map<string, any>` | **sim, 2** | silêncio — **2 FN** | BLOQUEIO | **2 erros** ✔ |
| `config.ts` | `{ retry: 3, any: true }` — chave de objeto | não | silêncio | **BLOQUEIO — FP** | **silêncio** ✔ |
| `Filter.tsx` | `<p>Filtro: any resultado serve</p>` — texto JSX | não | **BLOQUEIO — FP** | **BLOQUEIO — FP** | **silêncio** ✔ |

O ESLint acerta os três e **não repete nenhum dos dois defeitos**. `config.ts` e
`Filter.tsx` **ficam na árvore** — eles são o lado "cala" da prova, e é por isso que
parecem estranhos para arquivos de placeholder. **`tipos.ts` foi removido** pelo mesmo
motivo do violador da `§3`: ele reprovaria `npm run lint` para sempre.

Para reproduzir a linha que falta:

```bash
printf 'export type Payload = Record<string, any>;\nexport const cache: Map<string, any> = new Map();\n' > frontend/src/features/panel/tipos.ts
npm --prefix frontend run lint   # espera 2 erros @typescript-eslint/no-explicit-any, rc=1
rm frontend/src/features/panel/tipos.ts
```

O `no-console` (sucessor de `own.ts-browser-console`) é mordido pela receita da `§3`,
cuja segunda linha tem um `console.log`: **1 erro `no-console`**, `rc=1`
`[MEDIDO 2026-08-28]`.

**`files` deixou de ser `["**/*.ts", "**/*.tsx"]`** — a extensão não decide mais se o
arquivo é lido. O porquê, a medição do buraco e a prova nos dois portões estão na
`§2-bis`; os dois limites que este linter TEM (falso negativo de `no-console` em acesso
indireto; `any` implícito sem instrumento) estão na `§5-bis (iii)` e `(iv)`.

---

## 5. O AVISO que está aceso DE PROPÓSITO

```
[AVISO] [web-fullstack.browser-test-file-present] frontend/src/**/*.test.*:
        o codigo do navegador nao tem nenhum arquivo de teste
```

**Não apague plantando um `.test.tsx` vazio.** Isso produz exatamente o *"parecendo
coberto"* que `ADR-009/D3` recusa, e sem `[test_cmd.web]` nenhum portão o rodaria: o
aviso sumiria e nada teria sido testado. O aviso é a declaração honesta de que não há
suíte de frontend. **Ele morre quando a suíte nascer, e não antes.**

Consequência gêmea, declarada em `harness.toml`: `test_globs` ainda não reconhece
`*.test.tsx`, então o primeiro teste de frontend nascerá classificado como **produção**.
Universo hoje: **0 arquivo** — fechar agora seria declarar cobertura sobre universo
vazio. Dono: a task que trouxer a suíte.

---

## 5-bis. OS QUATRO ACHADOS DE FRONTEIRA DAS FERRAMENTAS — registrados, NÃO consertados

Levantados pelo `/qa` de `T-01.2` e re-medidos **depois** da correção da `§2-bis`. São
comportamento de ferramenta de terceiro (o pack `web-fullstack` e o ESLint), e
consertá-los não é ato desta task: seria `[[rules.own]]` (proibida por `ADR-011/D4`),
alterar um pack instalado, ou adotar ferramenta nova. **Estão aqui porque são o que as
tasks de `charts`/`web` vão encontrar primeiro.**

### (i) `browser-imports-server` morde DENTRO de comentário

A regra é `forbidden-regex` sobre o TEXTO da linha, não sobre a AST
`[MEDIDO: packs/web-fullstack/rules.toml:17, `regex = "from\\s+[\"'](\\.\\./)*backend/|require\\([\"'].*backend/"`]`.
Documentar a fronteira do `ADR-003` num bloco `/** */` de um `.tsx` **tranca o commit**:

```
/**
 * ADR-003 boundary. Never write, in browser code:
 *   import { etl } from "../../backend/src/modules/…/etl_backlog";
 */
```
`-> [BLOQUEIO] browser-imports-server … :3, rc=1` — e `sweep --surface git-hook` rc=1.

O gatilho é a CADEIA `from "…backend/"`, não a menção ao backend: um comentário em prosa
citando `backend/src/` **sem** a construção `from "…"` sai `rc=0`, 0 byte `[MEDIDO]`.
**Onde documentar sem trancar:** o `.md` — ele escapa por estar fora de `code_paths`
(`include_globs` não tem `*.md`).

### (ii) Três evasões do MESMO bloqueio

| construção | `rules --mode file --surface ci` |
|---|---|
| `import { x } from "../../../../backend/src/…"` | **`[BLOQUEIO]`, rc=1** |
| `const m = require("../../../backend/src/…")` | **`[BLOQUEIO]`, rc=1** |
| `await import("../../../backend/src/…")` | **rc=0, 0 byte** — sem `from`, sem `require(` |
| `import { cliente } from "@backend/client"` (alias de `tsconfig`) | **rc=0, 0 byte** — o `@` quebra `["'](\.\./)*backend/` |

`[MEDIDO 2026-08-28, 4 arquivos sob `frontend/src/__sonda__/`, removidos em seguida]`. A
regra cobre a forma estática comum e **não é uma barreira de fronteira completa**.

### (iii) `no-console` tem falso negativo em acesso indireto

`[MEDIDO 2026-08-28, dois arquivos irmãos]`:

| arquivo | conteúdo | ESLint |
|---|---|---|
| `console-direto.ts` | `console.log(m)` | **1 erro `no-console`** |
| `console-indireto.ts` | `globalThis.console.log(m)`, `window.console.warn(m)`, `const saida = console; saida.error(m)` | **0 erro** |

A regra casa o identificador `console` como objeto do `MemberExpression`; um alias ou um
acesso via `globalThis`/`window` não é esse nó.

**Nota `.js`, e ela MUDOU com a correção da `§2-bis`:** antes, `console.log` num `.js`
produzia **só** `no-undef`. Hoje produz **`no-undef` + `no-console`**, 2 erros
`[MEDIDO: `console-direto.js` → `['no-undef', 'no-console']`]` — o `no-console` chegou
porque `.js` entrou em `files`; o `no-undef` continua porque **nenhum
`languageOptions.globals` está declarado** e `console` não é global conhecida fora de
TypeScript. Em `.ts`/`.tsx` o `no-undef` não aparece (o `typescript-eslint` o desliga).
Declarar `globals.browser` é decisão de quem trouxer a aplicação Next.

### (iv) NÃO há `tsconfig.json` nem script de typecheck — `any` IMPLÍCITO não é pego

```
export function semTipo(v) { return v.x.y; }   // implicito.js -> 0 erro
export function comTipo(v: any) { return v; }  // explicito.ts -> 1 erro @typescript-eslint/no-explicit-any
```
`[MEDIDO 2026-08-28]`. `frontend/tsconfig.json` **não existe**, e a AST adotada por
`ADR-011/D4` **não é type-aware** (`tseslint.configs.recommended`, sem
`projectService`). `no-explicit-any` cobre o explícito — o que **basta para `D1.3b`**,
cuja bancada é de anotações explícitas — mas a metade implícita não tem instrumento.
**Adotar typecheck é ferramenta nova e não é decisão de builder**: fica registrado com
dono em aberto.

---

## 6. Estado medido em 2026-08-28, com o comando de cada número

**Re-medido em 2026-08-28 DEPOIS da correção do `NEEDS_FIX` (`§2-bis` e `§5-bis`), com a
árvore limpa de sondas.** Todo `rc` abaixo foi lido de `$?` na linha seguinte a uma
redireção para arquivo — **nunca depois de um cano**: `cmd | tail; echo $?` devolve o
status do `tail`, e esse artefato já produziu um falso achado retratado nesta feature.

```
find frontend/src -type f                    ->  4 arquivo(s)
npm --prefix frontend run lint               ->  rc=0   (eslint -f json src: 4 arquivos
                                                 lidos, 0 erro, 0 aviso)
harness rules --mode file --path \
  frontend/src/features/panel/Filter.tsx \
  --surface ci                               ->  rc=0, saída de 0 byte  (o lado "cala")
harness rules --mode sweep                   ->  1 AVISO, 0 BLOQUEIO, rc=0
harness rules --mode sweep --surface git-hook->  1 AVISO, 0 BLOQUEIO, rc=0
harness policy --key packs                   ->  ["core", "web-fullstack"]
harness policy --key code_paths              ->  include_globs com 9 padrões
                                                 (*.py + a família TS/JS de 8)
harness rules list                           ->  10 regra(s) em vigor  (antes: 5)
harness validate                             ->  rc=0, política válida
harness tasks validate plataforma-dados      ->  rc=0, 84 task(s), 0 ERROR, 0 WARN
harness pipeline state plataforma-dados      ->  BUILD_AUTHORIZED
```

O único AVISO é o da `§5`, aceso de propósito. O `sweep` sai `rc=0` porque **nenhuma
sonda ficou na árvore** — as receitas das `§2-bis`, `§3` e `§4` recriam cada uma delas do
zero.

> Este `README.md` cita a construção proibida da `§5-bis (i)` dentro de um bloco de
> código, e **isso não acende o portão**: `*.md` não está em `include_globs`, então o
> arquivo não é `code` e nenhuma regra o avalia. É o mesmo escape que a `§5-bis (i)`
> recomenda — e o `sweep` acima, `rc=0` com este texto já no disco, é a prova.

---

## 7. `src/charts/` — o spike de `D8.19`, e por que ele mora aqui (`T-08.2`, 2026-08-29)

O §1 explica o layout `src/{app,features,components}`. `T-08.2` acrescentou um **quarto**
diretório, `src/charts/`, e ele **não** é uma quinta camada: é o **componente fechado**
`charts` de `harness policy --key components`, casando por igualdade de string — o mesmo
teste que o falsificador de erosão do `CLAUDE.md` aplica.

**Dois comandos, e os dois medem coisas diferentes:**

```bash
npm --prefix frontend run spike:axis    # a medição de D8.19: um comando, um número
npm --prefix frontend run test:charts   # 9 testes de unidade da própria medição
```

**Códigos de saída de `spike:axis`**, com a semântica que os scripts do backend já usam:
`0` mediu e o eixo aguenta · `1` mediu e não aguenta (**resultado**, não defeito) · `3`
RECUSOU medir.

### O resultado, com o comando que o produziu

`[MEDIDO 2026-08-29, `npm --prefix frontend run spike:axis`, n=1.728 itens]` — **pior caso
`2,27e-13 px` com a grade de 1 m completa** (tolerância `D8.19` = 0,5 px) e **`36,390 px`
com a cobertura de 20,0% que o plano 08 `D8.11` mediu no dado real**. O eixo do Lightweight
Charts é **ordinal**, não temporal: sobre grade uniforme as duas leituras coincidem; com
buracos, não. Relatório completo, incluindo o falso verde que a primeira versão da medição
produziu: `docs/context/plataforma-dados/gates/T-08.2-builder.md`.

### ⚠️ O que aqui NÃO é portão, e isto continua a lista do §5

`harness policy --key test_cmd` declara **um** componente — `sentimento`. **Não há
`test_cmd.charts`**, e `make verify` roda `eslint src` (que lê estes arquivos) mas **não**
roda `test:charts`. Os 9 testes passam e **nada reprova se alguém os quebrar**. Declarar
`test_cmd.charts` é ato do **owner** sobre política. Pelo mesmo motivo **não há medição de
cobertura no `frontend`**: instrumento sem portão foi o que `ADR-011/D1.10` mandou não criar.

### `jsdom` como devDependency — o que o stub pode e o que ele não pode

O spike roda um gráfico **de verdade** sem navegador. O contexto 2D é um stub que não
desenha nada, e isso é sólido **para `D8.19` e só para ele**: `timeToCoordinate` é
respondida pelo **modelo** da escala de tempo (índice, `barSpacing`, `rightOffset`, largura
da pane), calculado antes de qualquer chamada de pintura e sem nunca reler do canvas.
Qualquer medição que dependa de **pixels pintados** — cor, sobreposição de discos (`D8.12`),
texto do eixo — **não** pode usar este stub.

---

## 8. `src/app/knowledge-time-bundle.ts` — o contrato de URL de `T-05.8` (2026-09-02)

`T-05.8` (`CST-42`, componente `web`) escreve o que `item 5.6` do plano `05` e `DoD D5.4`
pedem: `knowledge_time` na URL, o bundle de parâmetros **é** a URL (nenhuma tabela/CRUD de
preset), e `COMO EM T` sobrevive à navegação até o operador voltar explicitamente para
`AO VIVO`. É contrato de **estado/roteamento**, não de pixel — o `ui-designer` verificou
que a `S2` canônica já materializa o sintoma visível de `D2` estruturalmente (par
fill+borda migrando entre os dois `<span>` do chrome), e isso está fora do mandato dele
(`docs/context/plataforma-dados/gates/T-05.8-design.md`).

```bash
npm --prefix frontend run test:app   # 13 testes, node --test 'src/app/*.test.ts'
```

`Bundle` é um discriminated union (`LiveBundle | AsOfBundle`): `knowledgeTime` é campo
OBRIGATÓRIO em `AsOfBundle` e **inexistente** por tipo em `LiveBundle` — voltar para
`AO VIVO` (`returnToLive`) não tem como carregar `knowledge_time` escondido, porque o
tipo de retorno não tem onde guardá-lo. `decodeBundle` reforça isso na leitura: uma URL
com `mode=live` e o parâmetro `t` ainda presente é **recusada** (não descartada em
silêncio) — é exatamente o retrocesso sem sintoma que `D5.4` proíbe como teste negativo
obrigatório, virado impossível de representar em vez de apenas testado.

### O AVISO da `§5` já não se aplica — medido ANTES desta task, não por ela

`[MEDIDO 2026-09-02, `git stash -u` + `harness rules --mode sweep --format ndjson`,
árvore em `07193e6`, ANTES de qualquer arquivo de `T-05.8`]` — saída **vazia**, `rc=0`.
O `[AVISO] web-fullstack.browser-test-file-present` que a `§5` documentou como "aceso de
propósito" já **não** aparece nessa árvore: `T-08.2` (`src/charts/*.test.ts`) já havia
nascido antes de `T-05.8` e já satisfazia a regra. **Este achado não é desta task** — está
registrado aqui porque `T-05.8` é quem primeiro precisou reler a `§5` para não repetir o
erro que ela proíbe ("plantar um `.test.tsx` vazio").

### O que `T-05.8` de fato mudou no sweep

`[MEDIDO 2026-09-02, `harness rules --mode sweep --format ndjson`, árvore com os dois
arquivos desta task]` — **1 achado, severidade `warn`, 0 `block`**:

```
web-fullstack.hardcoded-url  frontend/src/app/knowledge-time-bundle.test.ts:22
  "endereco absoluto fixo no codigo do navegador: leia-o da configuracao de ambiente"
```

É o literal `https://painel.local/simbolo` usado como `base` sintético para montar
`URL` nos testes — nenhum host é contatado. **Não foi suprimido nem escondido**: é
severidade `warn` (fora do conjunto de `harness rules list --severity block`, 7 regras),
e nenhuma allowlist foi declarada para calá-lo — o mesmo motivo que a `§5-bis` já dá para
não consertar comportamento de ferramenta de terceiro por conta própria. Dono: quem
trouxer a aplicação Next real e decidir de onde vem a base de URL em teste.

**`[test_cmd.web]` continua NÃO declarado** — mesmo motivo já registrado nas `§4`/`§7`:
`test_cmd` não é lido por portão nenhum. O script `npm --prefix frontend run test:app`
existe pelo mesmo motivo que `test:charts` existe: é o comando que o `builder`/`qa` rodam
hoje, não uma declaração de política.

---

## 9. `src/app/history-transport.ts` — o lado `web` de `ADR-005/D1` (`T-05.9`, 2026-09-02)

`T-05.9` (`CST-43`, componente `web`) escreve o que o item `5.12` do plano `05` e o `DoD D5.8`
pedem: **transporte HTTP endereçável por conteúdo para o histórico, e nenhum tick chega ao
browser**. `ADR-005/D1` já decide a FORMA (chave de seis termos, resposta imutável por
`knowledge_time`) — este módulo fecha o lado `web` desse contrato, mesmo padrão de `T-05.8`
(`§8`): módulo TypeScript puro, sem tela, sem chamada de rede real em teste.

```bash
npm --prefix frontend run test:app   # 37 testes, node --test 'src/app/*.test.ts' (23 novos)
```

### Achado ANTES de escrever qualquer linha — a fronteira que a task mandou verificar

`docs/context/plataforma-dados/handoff/T-05.9.md` proíbe criar ou editar `backend/`, e manda
**parar e devolver achado** se fechar `D5.8` de verdade exigisse um endpoint/servidor novo.
Medido: `grep -rln 'fastapi\|flask\|uvicorn\|starlette' backend/ --include='*.py' --include='*.toml'`
→ **0 ocorrência**; `find backend -iname '*server*' -o -iname '*api*' -o -iname '*route*'` → só
`binance_server_time_probe.py` (sonda de relógio, não servidor). **Não há nenhum framework HTTP
no backend, logo nenhuma rota real existe para consumir** `[MEDIDO 2026-09-02]`. Isto NÃO virou
"pare e implemente backend": o que `ADR-005/D1` fixa é um CONTRATO (a forma da chave, a
imutabilidade, `bar_policy` nunca default), e `backend/src/modules/sentimento/domain/
as_of_accessor.py` já materializa o vocabulário desse contrato do lado do domínio (`BarPolicy`,
linhas 54-70; `bar_policy` "declared by the CONSUMER, never defaulted", linha 55-60). Fechar o
lado `web` é consumir ESSE contrato — request key + os dois portões do falsificador da ADR —
sem depender de um servidor rodando, o mesmo raciocínio que `T-05.8` já registrou para
`knowledge_time`/`Bundle` (`§8` acima). Nenhum arquivo de `backend/` foi tocado.

### O que o módulo garante, e como cada parte fecha o `DoD D5.8`

1. **Chave endereçável por conteúdo** (`HistoryRequestKey`, seis termos de `ADR-005/D1`) —
   `encodeHistoryRequest`/`decodeHistoryRequest`/`historyRequestUrl`, mesmo padrão de
   `encodeBundle`/`decodeBundle`.
2. **"O cache É o `knowledge_time`"** — `contentAddress` é determinístico e discrimina por
   QUALQUER termo da chave (testado: mudar só `knowledgeTime`, ou só `barPolicy`, muda o
   endereço). `HistoryResponseCache` opera sobre esse endereço e **recusa** (lança) se a MESMA
   chave receber um payload byte-a-byte diferente — a imutabilidade de `D1` como invariante
   verificável, não como comentário.
3. **`bar_policy` nunca é default (`D4`)** — `decodeHistoryRequest` RECUSA um parâmetro
   ausente ou fora do conjunto fechado `{final_only, intrabar}`; nenhuma função do módulo tem
   valor default para este campo.
4. **Zero campo de nível de tick** — `assertNoTickLevelFields` percorre qualquer payload JSON
   decodificado em qualquer profundidade e lança ao encontrar `agg_id`, `agg_trade_id`,
   `price`, `quantity`, `first_trade_id`, `last_trade_id`, `transact_time` ou
   `is_buyer_maker` — o conjunto transcrito do falsificador da ADR **e** do cabeçalho real de
   `data/binance/aggtrades/*.csv` (`agg_trade_id,price,quantity,first_trade_id,last_trade_id,
   transact_time,is_buyer_maker` `[MEDIDO 2026-09-02, head -2]`).
5. **Taxa ≤ `max(1 Hz, 1/TF)`** — `assertBucketSpacingWithinInterval` recusa qualquer par de
   buckets consecutivos mais próximos que o intervalo pedido: um espaçamento mais fino É a
   definição de tick chegando disfarçado de bucket extra.

Deliberadamente **agnóstico do schema completo** de içamento de `D3` (sessão/painel/célula):
nenhuma ADR fixou ainda essa forma para a resposta histórica, e esse payload é de `charts`
(item 5.4 do plano `05`), fora deste componente. Os dois portões acima (4 e 5) protegem
QUALQUER payload que uma rota futura venha a servir, não um schema assumido.

### Falsificadores rodados — não só "os testes passam"

Cada um dos dois portões tem teste de MUTAÇÃO: um payload/série que passa limpo é alterado
plantando exatamente o defeito que a ADR proíbe, e o mesmo teste prova que a alteração agora
reprova (`assertNoTickLevelFields`: ganhar `is_buyer_maker` faz um envelope legítimo reprovar;
`assertBucketSpacingWithinInterval`: ganhar um ponto a 500ms do vizinho faz uma série de 1 min
limpa reprovar). `decodeHistoryRequest` tem o mesmo tratamento para `D4`: remover `barPolicy`
da URL faz o round-trip que passava reprovar, nomeando `ADR-005/D4` na mensagem.

### Comandos rodados, literais

```bash
cd frontend && npm ci --prefer-offline --no-audit --no-fund   # node_modules ausente na worktree
npm run test:app     # node --test 'src/app/*.test.ts'  -> 37 pass (23 novos), 0 fail
npm run lint         # eslint src                        -> 0 erro, 0 aviso
npm run test:charts  # regressão dos módulos existentes  -> 13 pass, 0 fail (pré-existente)
make lint-frontend   # rc=0
git add frontend/src/app/history-transport.ts frontend/src/app/history-transport.test.ts
harness rules --mode sweep --changed-only --format ndjson
  -> 1 achado: web-fullstack.hardcoded-url (warn), frontend/src/app/history-transport.test.ts:21
  -> 0 achado de severidade block, rc=0
```

**`web-fullstack.hardcoded-url` é o mesmo achado que `T-05.8` já teve** (`§8` acima): o literal
`https://painel.local/historico` usado como `base` sintético para montar `URL` nos testes —
nenhum host é contatado. Severidade `warn`, fora do conjunto de `harness rules list --severity
block` (7 regras). Sem `--changed-only`, o sweep também mostra o achado pré-existente de
`T-05.8` (`knowledge-time-bundle.test.ts:22`, mesma regra) — ambos já registrados, nenhum novo
de fundo.

### Cobertura

Sem piso declarado para `web` (mesmo motivo da `§8`: `harness policy --key test_cmd` só cobre
`sentimento`). Medição qualitativa: os 23 testes novos cobrem 100% das funções exportadas
(`assertValidHistoryRequestKey`, `encodeHistoryRequest`, `decodeHistoryRequest`,
`historyRequestUrl`, `contentAddress`, `HistoryResponseCache`, `assertNoTickLevelFields`,
`assertBucketSpacingWithinInterval`), incluindo os dois falsificadores da ADR (com caso de
mutação para cada um) e as duas recusas de `D4` (parâmetro ausente, valor fora do conjunto).

### Doc delta

Este `README.md` — **atualizado**, `§9` nova (append-only, nenhuma linha existente reescrita).
`docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` — **sem mudança**: é o documento
normativo do DoD, e a task o satisfaz, não o edita.

---

## 10. `src/features/s1-console/` — tradução da `S1` aprovada (`T-07.12`, 2026-09-02)

`T-07.12` (`CST-66`, componente `web`) escreve o que o item `7.13` do plano `07` e os `DoD
D7.12`-`D7.15` pedem: `janela_de_perda` como **fórmula por série** (nunca uma constante), o
multiplicador de resiliência declarado (`~4,7x`), retenção **anticorrelacionada** com a
necessidade escrita por extenso (não um número seco), e reconexão como **rotina**. A tela
canônica é `S1 Console — Diagnóstico Operacional (Rev. B)`,
`screens/c0fc0210272f42a1ae29b6364e68d2e4`, aprovada com condição pelo gate independente
`ux-ui-mastery` e com a condição fechada
(`docs/context/plataforma-dados/gates/T-07.12-design.md` + `T-07.12-ux-critique.md`,
`docs/product/STITCH_CONTEXT.md` §4.2).

### Por que não existe uma página React — mesmo raciocínio da `§1` e de `src/app/routes.ts`

Este pacote **não é** a aplicação Next.js (`§1`; `harness code-paths classify` confirma
`frontend/src/**` como `producao` de qualquer forma, mas não há `react` em
`package-lock.json` — `[MEDIDO 2026-09-02: grep -c '"react"' frontend/package-lock.json` →
**0**`]`, nem `tsconfig.json`). `S1Console.tsx` é TSX válido, lintado como qualquer outro
arquivo do pacote (`npm run lint` o lê e aprova), no MESMO nível que
`src/features/panel/Filter.tsx` já ocupava: um componente típico, correto por tipo, que
espera a aplicação real para ser montado — não uma página rodando. O que carrega o DoD é a
camada de domínio abaixo dele, que **é** testada.

```bash
npm --prefix frontend run test:s1   # 26 testes, node --test 'src/features/s1-console/*.test.ts'
npm --prefix frontend run lint      # eslint src -> 0 erro, 0 aviso
```

### A tradução, em quatro arquivos

1. **`domain.ts`** — tipos e fórmulas puras. `RetentionWindow` é um discriminated union de
   6 variantes (`computed_uniform`, `measured_sparse`, `doc_only`, `declared_constant`,
   `unmeasured`, `not_applicable`) porque o `D7.12` observa 6 formas distintas de saber a
   janela, não uma fórmula universal. `computeUniformWindowDays` fecha o caso determinístico
   (`pontos × intervalo`); o caso esparso (`D7.14`, liquidação) **não** passa por essa
   função — `domain.test.ts` prova por que: rodar a fórmula uniforme sobre `3.052 pts × 1m`
   dá ≈2,1 dias, não os 8 dias medidos, porque a série não tem cadência uniforme. `D17`
   (severidade nunca por cor) é código, não só documentação: existe UMA constante de classe
   de badge (`NEUTRAL_STATUS_BADGE_CLASS`) e `orderRowsBySeverity` é quem move o coletor
   parado para o topo por POSIÇÃO.
2. **`fixtures.ts`** — dado sintético, com a proveniência de cada número comentada linha a
   linha. Ver a seção GAP abaixo.
3. **`view-model.ts`** — formata para texto de tela. Deliberadamente separado do domínio: os
   números ficam planos (`number`, ponto decimal) até aqui, porque
   `docs/context/plataforma-dados/handoff_to_architect.md` `Q14` fixa que formatação de
   locale é invariante de CAMINHO DE DADO — pt-BR só é legítimo em microcopy (`CLAUDE.md`,
   linha 8 da tabela de fronteira), e este módulo é exatamente essa fronteira.
4. **`S1Console.tsx`** — a tradução estrutural do HTML/Tailwind aprovado (mesmas classes,
   mesma hierarquia — conferido por leitura lado a lado do HTML baixado da tela canônica),
   tipada contra `S1ViewModel`.

### ⚠️ GAP registrado — dado é fixture, não `ingest_health_query`

`S1` é especificada para ler pela consulta nomeada `ingest_health_query` (`ADR-008/D3`,
`DoD D7.17`) — e ligar essa consulta de verdade é **`T-07.13`**, task SEPARADA
(`depends_on = ["T-02.3", "T-07.12"]`, `docs/context/plataforma-dados/tasks.toml:954-962`).
Nada em `fixtures.ts` vem de banco. Dois números merecem nota explícita:

- **`OI · grade 5m`**: o plano publica `"~2.000 pts × 5m ≈ 7,0 dias"` — os dois já
  arredondados. O fixture usa `2016` pontos (não `2000`): é o menor valor "redondo" que (a)
  ainda lê como `~2.000` e (b) faz `computeUniformWindowDays` bater EXATAMENTE em `7,0`
  (`2016 × 5 / 1440 = 7`), para que o texto renderizado seja saída de uma fórmula de
  verdade, não uma string ao lado de um ponto-de-partida que não a produz. A tela mostrará
  `"2.016 pts"`, não `"~2.000 pts"` — divergência da microcopy literal aprovada, deliberada
  e registrada aqui, não escondida.
- **`ORÇAMENTO ARMAZENAMENTO (GB/DIA)`** e **`FILA ETL`**: os valores (`1.2`, `0.4`, `1.6
  GB`, `14.204`) são os literais da tela canônica aprovada, reproduzidos como fixture —
  `totalStorageBudgetGbPerDay` os SOMA (não copia um total solto), e
  `view-model.test.ts` prova que a soma bate com `"1.6 GB"`.

### Achado registrado, não corrigido: a tela aprovada mistura separador decimal

`[MEDIDO 2026-09-02, grep no HTML baixado de `screens/c0fc0210272f42a1ae29b6364e68d2e4`]` —
a coluna `JANELA_DE_PERDA` usa vírgula (`"1,5 dia"`, `"7,0 dias"`) e as colunas de uptime% e
GB/dia usam ponto (`"99.8%"`, `"1.2"`, `"1.6 GB"`) na MESMA tela aprovada. `view-model.ts`
reproduz essa mistura fielmente (`formatPtBrDecimal` para janela, `formatDotDecimal` — não
exportada — para os demais) em vez de normalizar por conta própria: consertar é decisão de
design system, fora do `DoD D7.12`-`D7.15` desta task. Registrado com o comando que o mede,
não escondido atrás de uma escolha silenciosa de formatação.

### Cobertura

Sem piso declarado para `web` (mesmo motivo das `§8`/`§9`). Medição qualitativa: 26 testes
cobrem 100% das funções exportadas de `domain.ts` e `view-model.ts`, incluindo os dois
falsificadores centrais do DoD (`D7.14`: a fórmula uniforme NÃO reproduz a janela esparsa;
`D17`: as 4 badges de status compartilham uma única classe, e só a linha `PARADO` carrega
glifo) e a montagem completa (`buildS1ViewModel`) sobre os fixtures canônicos.

### Comandos rodados, literais

```bash
npm --prefix frontend run test:s1                          # 26 pass, 0 fail
npm --prefix frontend run lint                              # 0 erro, 0 aviso
npm --prefix frontend run test:app                          # 42 pass, 0 fail (regressão)
npm --prefix frontend run test:charts                       # 13 pass, 0 fail (regressão)
make lint-frontend                                           # rc=0
git add frontend/package.json frontend/src/features/s1-console/
harness rules --mode sweep --changed-only --format ndjson   # saída vazia, rc=0
harness rules --mode sweep --format ndjson
  -> 2 achados pré-existentes (warn, web-fullstack.hardcoded-url, T-05.8/T-05.9), 0 novo
harness code-paths classify frontend/src/features/s1-console/domain.ts       # producao
harness code-paths classify frontend/src/features/s1-console/S1Console.tsx   # producao
```

**`make boundaries` não rodou** (`rc=3`, "RECUSA: backend/.venv nao existe") — é o portão de
`backend/`, fora da fronteira desta task (`⛔ nao criar nem editar nada em backend/`, ver o
despacho); nada em `frontend/` depende dele.

### Doc delta

Este `README.md` — **atualizado**, `§10` nova (append-only). `docs/plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md`
— **sem mudança**: documento normativo do DoD, a task o satisfaz, não o edita.
`docs/product/STITCH_CONTEXT.md` — **sem mudança**: é o `ui-designer` quem propõe edição ali
(`R6`), não o builder.

---

## 11. `src/app/live-transport.ts` — o lado AO VIVO de `ADR-005/D1` (`T-08.11`, 2026-09-02)

`T-08.11` (`CST-79`, componente `web`) escreve o item `8.8` do plano `08`: "Transporte ao vivo
por SSE com envelope de bucket". Irmão de `§9` (`history-transport.ts`, `T-05.9`) — mesma ADR,
borda oposta do tempo: `D1` fixa SSE unidirecional para `AO VIVO` ("não precisamos de canal do
browser para o servidor"), `D2` fixa o envelope `(bucket_open_ts, cvd_delta_parcial, last_price,
n_trades, seq)` a `max(1 Hz, 1/TF)`, e `D4` fixa que `bar_policy` é declarado pelo consumidor na
requisição de abertura do fluxo — nunca default `intrabar`.

```bash
npm --prefix frontend run test:app   # 69 testes, node --test 'src/app/*.test.ts' (28 novos)
```

### Gate de design (já concluído antes desta implementação)

`docs/context/plataforma-dados/gates/T-08.11-design.md`: **"SEM DECISÃO DE UI/UX NOVA. Contrato
já coberto, nenhuma ação no Stitch necessária."** Mesmo veredito de `§9` para o lado histórico —
`T-08.11` entrega o dado (`is_final`, `seq`, `bucket_open_ts`); quem lê e desenha é `T-08.12`
(`charts`).

### Fronteira: mesma verificada por `§9`, refeita para o SSE

Backend segue sem framework HTTP (`[MEDIDO]` por `T-05.9`, zero `fastapi`/`flask`/`uvicorn`),
logo não há endpoint SSE real para conectar hoje, e criar um está fora de uma task `web`. Este
módulo fecha só o CONTRATO: a requisição que abre o fluxo (`bar_policy` obrigatório), a forma do
envelope que uma mensagem carrega, e os dois portões que tornam o falsificador de `ADR-005`
executável sobre qualquer payload/sequência que um fluxo real venha a produzir. Nenhum
`EventSource` é instanciado — mesma fronteira que `§9` traçou para `fetch`.

### O que o módulo garante, e como cada parte fecha o requisito

1. **`LiveStreamOpenRequest`** (`seriesKeyId`, `symbol`, `interval`, `barPolicy`) —
   `encodeLiveStreamOpenRequest`/`decodeLiveStreamOpenRequest`/`liveStreamUrl`, mesmo padrão de
   `encodeHistoryRequest`. Sem `knowledgeTime`: a borda viva não tem instante fixo para travar
   cache, seu horizonte é "agora".
2. **`bar_policy` nunca é default (`D4`)** — `decodeLiveStreamOpenRequest` RECUSA um parâmetro
   ausente ou fora de `{final_only, intrabar}`; nenhuma função do módulo assume um valor.
3. **`is_final` explícito por TIPO, não só por checagem** — `InProgressBucketEnvelope.is_final`
   é tipado como o literal `false` (não `boolean`), então nenhum bucket em formação pode ser
   construído sem o campo. `decodeBucketEnvelope` reforça isso em runtime: `is_final` ausente,
   `null`, ou de tipo errado é RECUSADO, nunca inferido.
4. **Zero campo de nível de tick** — reusa `assertNoTickLevelFields` de `history-transport.ts`
   (mesmo falsificador, mesma ADR, uma implementação só) sobre o payload BRUTO antes de
   `decodeBucketEnvelope` estreitar para os campos conhecidos — narrowing sem essa ordem
   deixaria um campo de tick aninhado (ex.: `{ trade: { price: "…" } }`) passar em silêncio,
   achado durante a própria escrita do teste (`decodeBucketEnvelope REFUSES a nested tick-level
   field`, corrigido antes de fechar a task).
5. **Taxa ≤ `max(1 Hz, 1/TF)` por série** — `LiveEnvelopeRateGuard` delega para
   `assertBucketSpacingWithinInterval` (mesma função de `§9`, reusada) a cada chegada, em vez de
   reimplementar o limiar para o caso "uma mensagem por vez" do SSE.
6. **`seq` monotônico por fluxo, lacuna sem inferir do relógio (`D2`)** — `LiveSeqGapTracker`
   reporta lacuna (não lança) quando `seq` pula para a frente — evento de transporte recuperável
   — e lança quando `seq` deixa de crescer, porque isso é o próprio invariante quebrando, não uma
   lacuna. Nenhum teste do detector de lacuna usa relógio de parede — só a sequência de `seq`.

### Falsificadores rodados — não só "os testes passam"

Cada portão tem teste de MUTAÇÃO: `assertValidBucketEnvelope` reprova um envelope limpo assim
que ganha `quantity`; `LiveSeqGapTracker` reprova uma sequência saudável assim que um `seq` é
pulado; `LiveEnvelopeRateGuard` reprova um fluxo saudável no instante em que uma chegada é rápida
demais. `decodeLiveStreamOpenRequest` tem o mesmo tratamento de `D4` que `decodeHistoryRequest`
(`§9`): remover `barPolicy` da URL faz o round-trip que passava reprovar.

### Comandos rodados, literais

```bash
cd frontend
npm run test:app     # node --test 'src/app/*.test.ts'  -> 69 pass (28 novos), 0 fail
npm run lint         # eslint src                        -> 0 erro, 0 aviso
git add frontend/src/app/live-transport.ts frontend/src/app/live-transport.test.ts
harness rules --mode sweep --changed-only
  -> 1 achado: web-fullstack.hardcoded-url (AVISO), frontend/src/app/live-transport.test.ts:23
  -> 0 achado de severidade block
```

**`web-fullstack.hardcoded-url` é o mesmo achado já registrado em `§9`/`§8`**: o literal
`https://painel.local/ao-vivo` usado como `base` sintético para montar `URL` em teste — nenhum
host é contatado. Severidade `warn` (`harness rules list --severity warn`), fora das 7 regras de
`--severity block`; o próprio `history-transport.test.ts:21` dispara o mesmo aviso na mesma
linha de padrão, confirmado por sweep isolado sobre esse arquivo.

## 12. `src/app/threshold-spec-bundle.ts` — o bundle de `ThresholdSpec` de `T-08.5` (2026-09-02)

`T-08.5` (`CST-73`, componente `web`, `depends_on = ["T-05.8"]`) escreve o item `8.4` do plano
`08`: "Bundle de parâmetros versionado e hasheável — que É a URL, não um CRUD" (`SPEC-001` §7).
O tipo-soma vem de `SPEC-001` §3.7 (linhas 292-303): `ThresholdSpec = Absolute{pct, op} |
Percentile{q, window, scope, min_obs, interpolation, op} | RobustZ{k, window, min_obs, op} +
spec_version + Custom{expr}` — `Custom` **desabilitado por padrão**. Mesma família de contrato
de `§8` (`knowledge-time-bundle.ts`, `T-05.8`): bundle versionado/hasheável, zero default, teste
negativo obrigatório (`D8.3`).

```bash
npm --prefix frontend run test:app   # 96 testes, node --test 'src/app/*.test.ts' (28 novos)
```

### Gate de design (já concluído antes desta implementação)

`docs/context/plataforma-dados/gates/T-08.5-design.md`: **"SEM DECISÃO DE UI/UX POSSÍVEL. `S4`
não existe no Stitch nem em `STITCH_CONTEXT.md`. Nenhuma ação no Stitch — nem geração, nem
edição."** Diferente de `§8`/`§9`/`§11` (que verificaram convergência contra telas já
canônicas), aqui não há tela candidata: `S4`, a única tela que consumiria este bundle, é
`T-08.6` (`depends_on = ["T-08.2", "T-08.5"]`), ainda não iniciada. Este módulo entrega só o
contrato de dado.

### Decisões de forma que o SPEC não fecha sozinho, e por que cada uma foi tomada assim

1. **`op` fecha em `">" | ">=" | "<" | "<="`.** `SPEC-001:303` só mede `>` e `>=` (a diferença de
   20×: `9/1500` contra `184/1500`), mas um limiar compara nos dois sentidos por natureza — os
   quatro símbolos são o vocabulário matemático padrão do qual os dois exemplos do próprio SPEC
   já são membros, não vocabulário de domínio inventado.
2. **`interpolation` fecha em `"linear" | "lower" | "higher" | "nearest" | "midpoint"`** — os
   próprios valores do parâmetro `interpolation` de `numpy.percentile`, escolhidos porque
   `SPEC-001:305` discute `numpy.percentile` na MESMA cláusula que nomeia este campo, e porque o
   teste de regressão do próprio SPEC (`PRD-001:983`) fixa o estimador "porque percentil sem
   estimador mente". `[INFERRED]`, documentado como tal no código.
3. **`scope` fica como `string` não-vazia, NÃO um enum fechado.** `grep -rn "scope"
   docs/specs docs/adr` só exibe UM valor em toda a árvore (`CrossSection`,
   `ADR-001-quantity-field-na-identidade.md:27`) e nunca documenta um segundo. Fechar o enum
   aqui inventaria vocabulário de domínio que esta task não possui — o que `D8.3`/`SPEC-001:303`
   exigem ("sem default em nenhum eixo") é presença, que o tipo já obriga sem precisar de um
   segundo membro inventado.
4. **`Custom{expr}` existe como tipo documentado (`CustomSpec`) mas fica FORA da união
   `ThresholdSpec`** — nenhuma função do módulo aceita, produz ou decodifica um `CustomSpec`.
   `decodeThresholdSpec` recusa `variant=custom` citando a cláusula do SPEC pelo nome, em vez de
   cair num "variante desconhecida" genérico — quem reabilitar `Custom` no futuro precisa mudar
   este módulo de propósito, não por acidente de um `switch` mais largo.
5. **`spec_version` versiona o bundle e trava em `CURRENT_THRESHOLD_SPEC_VERSION = 1`.**
   `decodeBundle` recusa qualquer outra versão em vez de tentar adivinhar um mapeamento de campo
   — adivinhar seria exatamente o default silencioso que `D8.3` proíbe.
6. **`bundleHash`** — a metade "hasheável" de `SPEC-001:568` — usa `createHash("sha256")` de
   `node:crypto` sobre a query string canônica de `encodeBundle` (mesmo padrão já em uso em
   `src/features/s1-console/ingest-health-query.ts:73`), não `JSON.stringify`: o hash é função
   pura dos mesmos bytes que apareceriam num link compartilhado.

### O teste negativo obrigatório (`D8.3`)

"Carregar a tela sem `ThresholdSpec` na URL → ZERO números derivados." `decodeBundle`/
`decodeThresholdSpec` sobre `new URLSearchParams()` (vazio) RECUSA nomeando o primeiro campo
ausente (`specVersion`, depois `variant`) — nunca completa com um valor assumido. O mesmo vale
por eixo: `op` ausente em qualquer uma das três variantes, `minObs` ausente em
`Percentile`/`RobustZ`, `variant=custom`, `specVersion` desconhecido — todos RECUSADOS, cada um
com teste próprio.

### Comandos rodados, literais

```bash
cd frontend
npm run test:app     # node --test 'src/app/*.test.ts'  -> 96 pass (28 novos), 0 fail
npm run lint         # eslint src                        -> 0 erro, 0 aviso
git add frontend/src/app/threshold-spec-bundle.ts frontend/src/app/threshold-spec-bundle.test.ts
harness rules --mode sweep --changed-only
  -> 1 achado: web-fullstack.hardcoded-url (AVISO), frontend/src/app/threshold-spec-bundle.test.ts:22
  -> 0 achado de severidade block, rc=0
```

**`web-fullstack.hardcoded-url` é o mesmo achado já registrado em `§8`/`§9`/`§11`**: o literal
`https://painel.local/simbolo` usado como `base` sintético para montar `URL` em teste — nenhum
host é contatado. Severidade `warn`, fora das 7 regras de `--severity block`.

### Cobertura

Sem piso declarado para `web` (mesmo motivo de `§8`/`§9`/`§10`: `harness policy --key test_cmd`
só cobre `sentimento`). Medição qualitativa: 28 testes cobrem 100% das funções e classes
exportadas (`assertValidLiveStreamOpenRequest`, `encode`/`decodeLiveStreamOpenRequest`,
`liveStreamUrl`, `assertValidBucketEnvelope`, `decodeBucketEnvelope`, `LiveSeqGapTracker`,
`LiveEnvelopeRateGuard`), incluindo os três falsificadores centrais do requisito (zero
tick-level field, `seq` monotônico com lacuna detectável, taxa ≤ `max(1 Hz, 1/TF)`).

### Doc delta

Este `README.md` — **atualizado**, `§11` nova (append-only). `docs/adr/ADR-005-transporte-de-leitura.md`
— **sem mudança**: `D1`/`D2`/`D4` já fixam a decisão; esta task consome, não emenda.
`docs/context/plataforma-dados/gates/T-08.11-design.md` — **sem mudança**: gate de design já
concluído antes desta implementação, veredito não revisitado (nenhum elemento visual novo
apareceu, falsificador do próprio gate não disparou).

## 13. `src/charts/color-tokens.ts` — cor como token nomeado por papel (`T-05.7`, 2026-09-03)

`T-05.7` (`CST-41`, componente `charts`, `depends_on = ["T-05.2"]`) escreve o item `5.9` do plano
`05`: "Cor como token nomeado por papel; `critical` fora do canal de cor" (`CA-F4-10`,
`SPEC-001` §6.2, supersedido por [`ADR-010`](../docs/adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md)).
`ADR-010` é `docs`-owned e já fixa a aritmética (`scripts/validate_palette.js`, 361 medições,
`exit 0`); esta task é a metade `charts` — consumir essas mesmas cores como tokens tipados por
papel em vez de hex soltos, e compor sobre `T-05.2` (que já existia e usava `{}`, isto é, as
cores DEFAULT da biblioteca — `#26a69a`/`#ef5350` — não os tons exatos da TradingView que
`ADR-010/D-1` fixa: `#089981`/`#f23645`).

### O que o módulo entrega, e o que deliberadamente NÃO entrega

`color-tokens.ts` expõe 6 papéis (`directionUpFill`, `directionDownFill`, `directionOn`,
`dataBrokenInk`, `provenanceStrong`, `provenanceWeak`) × 2 modos — o subconjunto das `PAPEIS` de
`ADR-010` que `charts` de fato desenha (candle, ink de canvas). `acao-fill`/`acao-on`/`foco`
(chrome de `<button>`/anel de foco) ficam DE FORA por desenho: são DOM, e `ADR-003` FR-1 +
o boundary `charts`⇄`web` (`eslint.config.mjs`, `D5.12`) dizem que isso é `web`, não `charts` —
trazer esses papéis para cá seria escopo que nem `CA-F4-10` nem o item `5.9` pedem.

`candlestickSeriesColors(mode)` deriva as 6 chaves de `CandlestickStyleOptions` que
`lightweight-charts` consome (`upColor`/`downColor`/`borderUpColor`/`borderDownColor`/
`wickUpColor`/`wickDownColor`) de EXATAMENTE 2 tokens — `ADR-010/D-1`'s próprio tipo `FILL`
lista "corpo/pavio de vela" como a mesma marca, então wick e borda reusam o hue da direção em
vez de inventar uma terceira cor. `D-2` (corpo vazado/cheio/cruz) e `forced-colors`/
`prefers-contrast` continuam dívida declarada do próprio `ADR-010` — fora do escopo desta task.

### `critical` fora do canal de cor — a guarda, e ela é mostrada REJEITANDO algo

`ColorRole` é uma união fechada SEM `"critical"`/`"severidade"` (`ADR-010/D-5`: severidade
operacional — "coletor PAROU", `S1`, fase `07` — não é este papel e não tem token de cor,
nunca). A ausência é dupla: estática (o union não tem o membro; `colorTokens(mode).critical` é
erro de compilação) e em runtime (`assertNoForbiddenColorRoles` +
`FORBIDDEN_COLOR_ROLE_SUBSTRINGS`, testado contra um violador real construído no teste — não
só contra dado que já passa).

### Composição sobre `T-05.2` — nunca reimplementação

`s2-headless-run.ts` (`T-05.2`) ganhou um campo opcional `style` em `HeadlessSeriesSpec` (default
`{}`, todo call site anterior a `T-05.7` continua idêntico) e `appliedCandlestickColors` no
resultado, lido de `series.options()` da biblioteca REAL — não do objeto que passamos, a mesma
disciplina que `dataLength` já usa no mesmo arquivo. `s2-axis-integration.test.ts` (`T-05.2`)
passou a estilizar a série de preço com `candlestickSeriesColors("dark")` e a comparar o
resultado LIDO DE VOLTA contra o token — prova de que a cor nomeada chega a um render real da
biblioteca, não só a um teste unitário do módulo novo.

### Cross-check contra `scripts/validate_palette.js` — duas citações, uma aritmética

`color-tokens.test.ts` NÃO reimplementa CIEDE2000 nem reexecuta o script (que imprime ~150
linhas e define `process.exitCode` como efeito colateral — carregar isso dentro de um teste
seria um defeito de outra classe). Em vez disso lê `scripts/validate_palette.js` como TEXTO,
extrai a tabela `PAPEIS` por regex e compara, hex a hex, contra os 6 papéis deste módulo, nos 2
modos — mesma disciplina de "duas implementações, uma prova" que
`canonical-grid-sha256-proof.test.ts` já usa para a grade, aqui aplicada a uma paleta.

### Falsificador rodado, não só "os testes passam"

`the negative control: a role named like operational severity is REJECTED` alimenta
`assertNoForbiddenColorRoles` com `criticalFill`/`severityFill`/`severidadeFill`/`CriticalFill`
(caixa alta incluída) e afirma que cada um LANÇA — a guarda é exercitada rejeitando, não só
tipando limpo.

### Comandos rodados, literais

```bash
cd frontend
npm install                                    # node_modules não versionado, worktree novo
npm run test:charts   # node --test 'src/charts/*.test.ts' -> 76 pass (10 novos), 0 fail
npm run lint          # eslint src                          -> 0 erro, 0 aviso
cd ..
node scripts/validate_palette.js
  -> exit 0, "medicoes executadas nesta rodada: 361"
git add frontend/src/charts/color-tokens.ts frontend/src/charts/color-tokens.test.ts \
        frontend/src/charts/s2-headless-run.ts frontend/src/charts/s2-axis-integration.test.ts
harness rules --mode sweep --changed-only
  -> 0 achado, rc=0
```

### Cobertura

Sem piso declarado para `charts` (mesmo motivo de `§8`/`§9`/`§10`/`§12`: `harness policy --key
test_cmd` só cobre `sentimento`). Medição qualitativa: 10 testes novos cobrem as 3 funções/
constantes exportadas (`colorTokens`, `candlestickSeriesColors`, `assertNoForbiddenColorRoles`)
nos 2 modos, o cross-check hex a hex contra `validate_palette.js`, e o caso negativo da guarda —
mais 1 assert novo em `s2-axis-integration.test.ts` fechando o round-trip real com a biblioteca.

### Doc delta

Este `README.md` — **atualizado**, `§13` nova (append-only). `docs/specs/SPEC-001-plataforma-dados.md`
§6.2 e `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` `D5.6` — **sem mudança**: já
carregam a correção de citação de `ADR-010` (commit `452e1f8`, anterior a esta task); esta task
consome os números publicados ali, não os emenda. `docs/context/plataforma-dados/tasks_review.md:307`
— **sem mudança**: é artefato aprovado pelo owner e a própria task (`T-05.7`'s `refs` em
`tasks.toml`) registra que corrigi-lo sem o gate dele é o defeito que `ADR-010` §5 existe para
evitar — meu escopo é `charts`, não `docs`. `scripts/validate_palette.js` — **sem mudança**: é
`docs`-owned (`ADR-010` header, "Componente alvo: `docs`"); esta task lê o texto dele
(`color-tokens.test.ts`) e nunca o edita.
