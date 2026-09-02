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
