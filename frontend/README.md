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

## 13. `src/charts/s2-absence-policy.ts` — política de ausência por `nature` de `T-05.4` (2026-09-03)

`T-05.4` (`CST-38`, componente `charts`) escreve o item `5.5` do plano `05` (`SPEC-001` §5.11,
"Política de ausência por `nature`") mais os dois pedaços que o título da task nomeia
explicitamente: o carimbo de idade do FECHO (`D5.1`) e a linha-guia apontando para trás
(`D5.2`). Compõe sobre os painéis de `T-05.2` (`s2-panels.ts`, já em `master`) — não os
reimplementa: toma `OiPanel.slots`/`CvdPanel.deltaSlots` (`ScalarSlot[]`, de
`s2-scalar-grid.ts`) como entrada, igual a todo outro consumidor do diretório.

**Escopo, declarado no cabeçalho do próprio arquivo:** §5.11 lista 6 `nature`s; este módulo
resolve exatamente as 2 que têm painel real em `05_fatia_visivel.md` item `5.1` — `STOCK`
(OI) e `FLOW` (CVD delta) —, não as 6. `RATIO`/`EVENT`/quarentena não têm consumidor nesta
fase; escrevê-los agora seria política para um painel que não existe, o "amplia escopo" que
o protocolo de despacho proíbe.

### As três decisões de leitura que o SPEC não soletra em pseudocódigo

1. **`D5.1` — o rótulo impresso é sempre o FECHO (`bucketStart + timeframe`), nunca o
   bucket-start cru.** O falsificador do próprio plano é literal: o primeiro ponto de
   `met/2026-08-23.csv` (bucket-start `00:00:00`) tem que ler `00:05:00Z` na tela — "três dos
   quatro desenhos de UX imprimiram o rótulo cru", exatamente o defeito que a fase existe
   para impedir. `formatCloseStamp`/`closeTimeMs` são o único lugar onde essa conversão
   acontece; `formatHeldStockLabel` a consome, nunca a reimplementa.
2. **`D5.2` — `STOCK` mantém (`held`) o último valor real, mas o trilho NUNCA passa de UM
   bucket nativo.** OI publica 1 ponto a cada 5 min contra 1 candle de preço a cada 1 min
   (`SPEC-001` §5.12: "1m → 0,2" pontos por barra) — 4 de cada 5 barras de 1 min não têm
   ponto próprio de OI, e §5.11 manda ler isso como o valor mantido da última observação, em
   tinta secundária, NUNCA como ausência (`resolveStockReading`, ramo `held`). O mesmo §5.11
   proíbe "trilho maior que grade nativa": por isso a função olha para trás **exatamente um**
   bucket nativo, nunca mais — provado contra o gap real de dia inteiro (`2026-08-22`, zero
   arquivo `metrics`) em `s2-absence-policy.test.ts`: o primeiro bucket ausente do dia do
   buraco ainda resolve `held` (1 bucket nativo de distância do último ponto real, `08-21
   23:55`); o SEGUNDO já resolve `absent` — a prova de que o teto é honrado, não só afirmado
   em prosa.
3. **`D5.3` — `FLOW` nunca olha para um slot vizinho.** `LOCF` é proibido sem exceção para
   `FLOW` (§5.11); `resolveFlowReading` faz uma única leitura no próprio instante — presente
   (mesmo que um zero medido) ou ausente, nunca emprestado de outro bucket. Testado contra o
   mesmo dia real ausente (`2026-08-22`, zero arquivo `aggTrades`) sem precisar ler os
   milhões de linhas dos dias cobertos: a ausência de um dia inteiro no disco já é a prova, e
   `assembleCvdDeltas` já reporta isso (`s2-cvd.ts`) sem reimplementação.

**Geometria vs. texto — por que `guideLine`/`observedBucketStartMs` usam bucket-start
enquanto o rótulo impresso usa FECHO:** o ponto real de OI já é plotado no eixo X em
`slot.time` (bucket-start) por `lineSeriesLossless` (`s2-lightweight-adapter.ts`) — mudar
essa posição para o FECHO quebraria o alinhamento com a grade canônica que `D5.9` prova
bit-a-bit. A convenção do FECHO (`D5.1`) é só do TEXTO impresso; a geometria da linha-guia
(`{fromMs, toMs}`, ambos bucket-start) continua na mesma posição que o resto do gráfico já
usa.

### Comandos rodados, literais

```bash
cd frontend
npm run lint         # eslint src                        -> 0 erro, 0 aviso
npm run test:charts  # node --test 'src/charts/*.test.ts' -> 79 pass (10 novos), 0 fail
git add frontend/src/charts/s2-absence-policy.ts frontend/src/charts/s2-absence-policy.test.ts
harness rules --mode sweep --changed-only
  -> rc=0, 0 achado (nenhuma linha ndjson)
```

### Cobertura

Sem piso declarado para `charts` (`harness policy --key test_cmd` só cobre `sentimento`,
mesmo silêncio já registrado em `§8`/`§9`/`§10`/`§12` para `web`). Medição qualitativa: 10
testes novos cobrem as 6 funções exportadas (`resolveStockReading`, `resolveFlowReading`,
`closeTimeMs`, `formatCloseStamp`, `formatHeldStockLabel`, `formatFlowValue`), os 3 ramos de
`StockReading` (`exact`/`held`/`absent`) inclusive o teto de UM bucket do trilho de
vigência, os 2 ramos de `FlowReading` (`present`/`absent`, incluindo zero medido ≠ ausência),
e os 2 erros de chamador (grade vazia; consulta `FLOW` desalinhada) — 4 dos 10 testes contra
o fixture REAL (`data/binance/metrics/BTCUSDT-metrics-2026-08-{22,23}.csv` via
`buildOiPanel`/`assembleCvdDeltas`, nenhum synthetic point onde um gap de verdade já existe).

### Doc delta

Este `README.md` — **atualizado**, `§13` nova (append-only). `docs/specs/SPEC-001-plataforma-
dados.md` §5.11 — **sem mudança**: a tabela já fixa a política; esta task a implementa, não a
emenda. `docs/adr/ADR-003-fronteira-charts-web.md` — **sem mudança**: nenhuma superfície nova
cruza a fronteira `charts`⇄`web` (módulo puro, mesma disciplina FR-1 de todo o diretório).

## 14. `src/charts/s2-price-source.ts` + `s2-annotation-price-binding.ts` — `price_source`/`price_use` do painel de Preço, `T-05.5` (2026-09-03)

`T-05.5` (`CST-39`, componente `charts`) escreve o item `5.7` do plano `05` e `D5.5`:
"o painel de Preço declara `price_source` E `price_use` na linha do painel; a marcação fica
amarrada à série de preço" (`ADR-007`/`PS-1`, `PS-3`). Composto sobre `T-05.2` (`s2-panels.ts`,
já em `master`) e sobre `T-05.4`'s `s2-annotation-identity.ts` (`D5.10`) — nenhum dos dois foi
reimplementado, ambos foram importados/estendidos.

### O que cada arquivo novo fecha

- **`s2-price-source.ts`** — transcrição independente de `ADR-007`'s decision table na CAMADA
  DE CONCEITO (`klines_last`/`mark_price`, pré-substituição), o mesmo movimento que
  `canonical-grid.ts` já faz para a grade: não importa `backend/.../price_source_catalog.py`
  (linguagem diferente) nem `frontend/src/features/s3-inspector/series-catalog.ts` (`web`; a
  fronteira `D5.12` proíbe `charts`→`web` nos dois sentidos, `eslint-boundary.test.ts`).
  `resolvePriceSource(priceUse: PriceUse | null)` recusa `null` (`MissingPriceUseError`) e
  qualquer valor fora do conjunto fechado (`InvalidPriceUseError`) — `PS-1` como mecanismo, não
  convenção: nenhuma assinatura permite ao chamador esquecer o argumento e receber um default.
- **`s2-panels.ts`** (modificado) — `buildPricePanel` passa a exigir `priceUse: PriceUse` e
  devolve `PricePanel { priceSource, priceUse, series }` em vez de um `ChartSeries` nu;
  `S2Panels.price` e `S2RawInputs.priceUse` seguem o mesmo formato. `S2_PRICE_USE =
  "structure_detection"` é a constante, documentada e exportada, que o painel S2-mínima usa —
  visual/estrutura, não liquidação/funding/custo — e `ADR-007` resolve isso para
  `price_source = klines_last`.
- **`s2-annotation-price-binding.ts`** — `createPriceBoundAnnotation` COMPÕE
  `createAnnotationIdentity` (`D5.10`, não tocado) com `resolvePriceSource`, produzindo
  `PriceBoundAnnotation { principalId, createdAtMs, priceSource, priceUse }`.
  `describeAnnotationOnReopen(annotation, currentPriceSource)` é o falsificador de `D5.5`
  executável: devolve `{isSamePriceSeries, label}`, com `label = "marcada sobre outra série de
  preço"` (`PRICE_SERIES_MISMATCH_LABEL`, o texto exato que `ADR-007`/`PS-3` nomeia) sempre que
  `isSamePriceSeries` é `false`.

### O teste negativo obrigatório (`D5.5`), literal

`s2-annotation-price-binding.test.ts`: marca sob `structure_detection`
(⇒ `price_source = klines_last`), reabre com `currentPriceSource = resolvePriceSource(
"liquidation_trigger")` (⇒ `"mark_price"`) — `isSamePriceSeries === false` e
`label === "marcada sobre outra série de preço"`. Controle positivo irmão (mesma fonte na
reabertura ⇒ `label === null`) garante que o teste negativo não passaria por um comparador que
sempre devolve `false`.

### Comandos rodados, literais

```bash
npm --prefix frontend install     # node_modules é gitignored, ausente em worktree novo
npm --prefix frontend run lint    # eslint src -> 0 erro, 0 aviso
npm --prefix frontend run test:charts
  # node --test 'src/charts/*.test.ts' -> 78 pass (8 novos: 3 s2-price-source.test.ts +
  # 5 s2-annotation-price-binding.test.ts), 0 fail
  # (requer data/binance/{klines,metrics,aggtrades}/ presente no worktree — ausente por
  # padrão em worktree novo, data/ é gitignored; copiado do checkout principal só para
  # rodar esta suíte, nunca versionado)
harness rules --mode sweep --changed-only
  -> 0 achado, rc=0
```

### Cobertura

Sem piso declarado para `charts` (`harness policy --key test_cmd` só cobre `sentimento`).
Medição qualitativa: as duas funções novas (`resolvePriceSource`,
`describeAnnotationOnReopen`) e o construtor novo (`createPriceBoundAnnotation`) têm teste
para cada ramo de decisão — as 5 entradas de `PRICE_USES`, os dois casos de recusa de `PS-1`
(`null` e valor inválido), o falsificador `D5.5` e seu controle positivo, e a propagação da
recusa de `D5.10` (`principalId` vazio) através do novo construtor.

### Doc delta

Este `README.md` — **atualizado**, `§14` nova (append-only). `docs/adr/ADR-007-price-source-por-uso.md`
— **sem mudança**: `PS-1`/`PS-3` já fixam a decisão; esta task consome (lado `charts`), não
emenda. `frontend/src/charts/s2-annotation-identity.ts` — **sem mudança**: `D5.10`'s próprio
construtor e recusa continuam intocados, reusados por composição.

## 15. `src/charts/s2-pointer-mode.ts` — `pointer_mode ∈ {read, annotate}` declarado (`T-05.6`, 2026-09-03)

`T-05.6` (`CST-40`, componente `charts`, plano `05_fatia_visivel.md` item `5.8`, `SPEC-001:284`):
`pointer_mode` declarado com a camada de overlay reservada acima do plot e abaixo do crosshair,
e o clique/Espaço travando o crosshair só em `read`. O título da task nomeia o objetivo: **"torna
`Q11` decisão de horas, não de arquitetura"** — `Q11` (owner marca o corpus) continua **ABERTA**;
o que este módulo entrega é a forma que sobrevive a qualquer resposta dela, para que respondê-la
mais tarde custe preencher o comportamento de `annotate`, não desenhar a arquitetura de novo.

**Escopo, e por que ele para exatamente aqui:** `s2-annotation-identity.ts` (`T-05.2`, `D5.10`) já
citava esta task pelo número como a dona de `pointer_mode` e a deixava fora do próprio escopo.
Simetricamente, `swing_point` (`SPEC-001` §3.6, "o primeiro primitivo de `<Anotacao>`") é `T-08.7`,
não esta. `s2-pointer-mode.ts` declara **o quê** acontece quando um evento de ponteiro chega em
cada modo — não desenha nada, não implementa marcação, não toca o DOM (`ADR-003` FR-1: zero
`fetch`, zero listener, zero `node:fs`; toda entrada é argumento).

**O que o módulo declara, e como cada peça fecha a frase de `SPEC-001:284`:**
- `PointerMode = "read" | "annotate"` + `POINTER_MODES` (runtime) + `assertPointerMode` — recusa
  qualquer valor fora do conjunto (mesmo padrão de recusa de `MissingPrincipalIdError` em
  `s2-annotation-identity.ts`: um `pointer_mode` inválido cruzando a borda do event handler não
  vira `"read"` por default silencioso).
- `ChartLayer = "plot" | "overlay" | "crosshair"` + `LAYER_ORDER` (ordenado, baixo→alto) +
  `assertOverlayIsSandwiched` — checa "overlay acima do plot e abaixo do crosshair" **por
  posição**, não por nome, para que uma 4ª camada futura ou uma reordenação acidental trisque o
  invariante em vez de desenhar marcação sob os candles em silêncio.
- `resolvePointerAction(mode, input)` — a frase "clique/Espaço só significam travar crosshair em
  `read`" tornada executável: em `read` devolve `{ kind: "lock_crosshair" }`; em `annotate` **nunca**
  devolve isso — devolve `{ kind: "annotate_reserved", mode: "annotate" }`, o placeholder explícito
  que `T-08.7`/`Q11` preenchem depois.
- `PointerInputKind = "click" | "space"` + `assertPointerInputKind` — mesma disciplina de recusa,
  simétrica à de `mode`.

### Falsificadores rodados — não só "os testes passam"

Cada proteção tem o caso que ela rejeita, no mesmo arquivo de teste:
- `assertPointerMode`/`assertPointerInputKind` recusam valor fora do conjunto declarado (inclusive
  variação de maiúscula: `"Read"` ≠ `"read"`).
- `assertOverlayIsSandwiched` recusa `overlay` abaixo de `plot`, `overlay` acima de `crosshair`, e
  um conjunto de camadas incompleto — três `RangeError` distintos, um por violação.
- `resolvePointerAction("annotate", …)` é comparado por `notDeepEqual` contra `{ kind:
  "lock_crosshair" }` — a garantia não é só "devolve outra coisa", é "nunca é igual à ação de
  `read"`.
- `resolvePointerAction` recusa um `mode`/`input` que contornou o tipo estático via `as unknown as`
  (o caso de um valor vindo de fora da árvore TypeScript, ex. `JSON.parse` de um evento).

### Comandos rodados, literais

```bash
npm --prefix frontend install    # node_modules não versionado, worktree novo
npm --prefix frontend run lint   # eslint src -> 0 erro, 0 aviso
npm --prefix frontend run test:charts
  # node --test 'src/charts/*.test.ts' -> universo total 75 testes, 64 pass / 11 fail
  # (re-executado isolado: `node --test 'src/charts/s2-pointer-mode.test.ts'` -> 14/14 pass,
  # 0 fail — as 11 falhas do universo total são as ÚNICAS falhas e são PRE-EXISTENTES de
  # `T-05.2`, não relacionadas a este módulo: 2 suites inteiras (canonical-grid-sha256-proof.test.ts,
  # s2-axis-integration.test.ts) + 9 casos em s2-cvd.test.ts/s2-klines-loader.test.ts/
  # s2-oi-loader.test.ts/s2-panels.test.ts — todas ENOENT/asserção sobre `data/binance/**`,
  # que não existe neste worktree (dado bruto não é versionado, `.gitignore:51`).
  # Confirmado: `ls data` -> "Arquivo ou diretório inexistente".
git add frontend/src/charts/s2-pointer-mode.ts frontend/src/charts/s2-pointer-mode.test.ts
harness rules --mode sweep --changed-only   # rc=0, nenhuma saída — 0 achado
```

### Cobertura

Sem piso declarado para `charts` (mesmo motivo de `§8`–`§12`: `harness policy --key test_cmd` só
cobre `sentimento`). Medição qualitativa: 14 testes cobrem 100% das funções/constantes exportadas
(`POINTER_MODES`, `POINTER_INPUT_KINDS`, `LAYER_ORDER`, `assertPointerMode`,
`assertPointerInputKind`, `assertOverlayIsSandwiched`, `resolvePointerAction`), com um caso positivo
e ao menos um MORDE por proteção.

### Doc delta

Este `README.md` — **atualizado**, `§15` nova (append-only). `docs/specs/SPEC-001-plataforma-dados.md`
— **sem mudança**: `§3.6` já fixa a frase que este módulo torna executável; esta task consome, não
emenda a SPEC. Gate de design — **não aplicável**: este item não introduz elemento visual novo (zero
DOM, zero componente React) — é geometria/estado puro de `charts`, mesma classe de `s2-panels.ts`/
`s2-lightweight-adapter.ts`, que também não passaram por gate de design.

## 16. `src/charts/color-tokens.ts` — cor como token nomeado por papel (`T-05.7`, 2026-09-03)

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
npm install                                    # node_modules não versionado, worktree novo
npm run test:charts   # node --test 'src/charts/*.test.ts' -> 76 pass, 0 fail
npm run lint          # eslint src                          -> 0 erro, 0 aviso
cd ..
node scripts/validate_palette.js
  -> exit 0, "medicoes executadas nesta rodada: 361"
git add frontend/src/charts/color-tokens.ts frontend/src/charts/color-tokens.test.ts \
        frontend/src/charts/s2-headless-run.ts frontend/src/charts/s2-axis-integration.test.ts
```

### Cobertura

**⚠️ Correção do `/build`, ciclo de reinvocação (2026-09-03), sobre a linha acima:** a primeira
redação desta seção dizia **"76 pass (10 novos)"**, e o parêntese não tinha o comando que o
produziu — o próprio defeito que esta casa nomeia ("nenhum número sem o comando"). Medido
depois, isolando o commit: worktree no PAI de `a10aa71` (`6ecb9ae`) + `npm run test:charts` →
**69 pass**; neste branch, mesmo comando → **76 pass**. `76 − 69 = 7`, não `10`
`[MEDIDO 2026-09-03: git worktree add --detach /tmp/t057-parent 6ecb9ae && npm --prefix
frontend run test:charts]`. Os **7** batem exato com `color-tokens.test.ts` rodado isolado
(`node --test src/charts/color-tokens.test.ts` → **7 pass**: 5 `test(...)` estáticos + 2
gerados pelo laço `for (const mode of ["light", "dark"])`). O `10` da redação original não
tinha universo nem comando — era estimativa não etiquetada, escrita como medição.

### Cobertura

Sem piso declarado para `charts` (mesmo motivo de `§8`/`§9`/`§10`/`§12`: `harness policy --key
test_cmd` só cobre `sentimento`). Medição: **7 testes novos** (`color-tokens.test.ts`, medido
acima) cobrem as 3 funções/constantes exportadas (`colorTokens`, `candlestickSeriesColors`,
`assertNoForbiddenColorRoles`) nos 2 modos, o cross-check hex a hex contra
`validate_palette.js`, e o caso negativo da guarda — mais 1 assert novo (não um teste novo) em
`s2-axis-integration.test.ts` fechando o round-trip real com a biblioteca.

### Doc delta

Este `README.md` — **atualizado**, `§16` nova (append-only). `docs/specs/SPEC-001-plataforma-dados.md`
§6.2 e `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` `D5.6` — **sem mudança**: já
carregam a correção de citação de `ADR-010` (commit `452e1f8`, anterior a esta task); esta task
consome os números publicados ali, não os emenda. `docs/context/plataforma-dados/tasks_review.md:307`
— **sem mudança**: é artefato aprovado pelo owner e a própria task (`T-05.7`'s `refs` em
`tasks.toml`) registra que corrigi-lo sem o gate dele é o defeito que `ADR-010` §5 existe para
evitar — meu escopo é `charts`, não `docs`. `scripts/validate_palette.js` — **sem mudança**: é
`docs`-owned (`ADR-010` header, "Componente alvo: `docs`"); esta task lê o texto dele
(`color-tokens.test.ts`) e nunca o edita.

## 17. `src/charts/s2-swing-point.ts` — `swing_point`, o primeiro primitivo de `<Anotacao>` (`T-08.10`, 2026-09-03)

`T-08.10` (`CST-78`, componente `charts`, plano `08_superficie_e_reprodutibilidade.md` item
`8.7`, `SPEC-001` §3.6): "`swing_point` em `<Anotacao>` — zero algoritmo, zero limiar, zero
'nível'". `SPEC-001:282`, literal: "O primeiro primitivo de `<Anotacao>` é `swing_point`, não
`zone`… pivô É uma definição de swing · âncora de Fibonacci É um par de swings · BOS/CHoCH É
rompimento de swing · BSL/SSL É extremo de swing… um corpus de swings sobrevive a qualquer
resposta [de `Q20`]; um corpus de zonas não." `Q20` (`SMC` × pivôs+Fibonacci) segue **ABERTA** e
está deliberadamente fora do escopo desta task — o argumento da SPEC é exatamente que ambos os
vocabulários se apoiam neste MESMO primitivo, então construí-lo aqui não presume a resposta.

**Composto, não reimplementado** — mesma disciplina de `§14`/`§15`: `createSwingPoint` chama
`createPriceBoundAnnotation` (`T-05.5`, `s2-annotation-price-binding.ts`) verbatim, que por sua
vez já compõe `createAnnotationIdentity` (`T-05.2`, `D5.10`). Nenhum dos dois foi tocado.

**O que o módulo entrega, e como cada peça fecha "zero algoritmo, zero limiar, zero nível":**
- `SwingKind = "high" | "low"` + `SWING_KINDS` (runtime) + `assertSwingKind` — recusa qualquer
  valor fora do par, mesmo padrão de `assertPointerMode` (`§15`): um `kind` inválido nunca vira
  `"high"` por default silencioso.
- `SwingPoint extends PriceBoundAnnotation` acrescenta exatamente 3 campos: `kind`,
  `eventTimeMs` (mesmo conceito de `event_time` que `CellEnvelope`, `s2-badge.ts`, já usa para
  uma célula de `<ValorDeMercado>` — um swing marca uma BARRA, não uma coordenada de clique
  crua) e `price` (lido verbatim do que o humano marcou — nunca computado, nunca ajustado a um
  "nível"). `primitive: "swing_point"` é discriminante literal, preparando (sem construir) uma
  futura união `AnnotationPrimitive = SwingPoint | Zone`.
- `createSwingPoint` recusa independentemente: `kind` fora do conjunto
  (`InvalidSwingKindError`), `eventTimeMs` não finito ou negativo (`NonFiniteSwingEventTimeError`
  — um swing não pousa em timestamp fabricado) e `price` não finito ou `<= 0`
  (`NonFiniteSwingPriceError` — preço cripto nunca é zero/negativo).
- **Zero algoritmo**: nenhuma comparação entre barras vizinhas, nenhuma janela de lookback —
  a função registra um ponto já identificado (por humano; um `DETECTOR`, se algum dia existir,
  é decisão de outra ADR, ver abaixo), nunca decide "isto é um swing".
- **Zero limiar**: nenhum `ThresholdSpec` (`SPEC-001` §3.7), nenhum tamanho mínimo de movimento.
- **Zero "nível"**: nenhuma razão de Fibonacci, nenhuma zona (OB/FVG), nenhum
  `structure_definition` — exatamente o que a plan `08`'s seção "Não faz" nomeia ("não desenha
  zona SMC, não detecta estrutura").

### ⚠️ Conflito registrado com `ADR-017` (RASCUNHO, não aprovado) — resolvido a favor do escopo desta task

`docs/adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md` (`Status: RASCUNHO — "aprovar
é gate do owner"`, sem evento `approve` no ledger; o próprio commit que o introduziu se
autodescreve como "(rascunho)") nomeia esta task, por número, em sua seção "Consequências":
"`T-08.10`: campos `provenance`, `detector_key`, `review_verdict`; `structure_definition` com
`break_by`, `ref_policy`, `impulse`." Esses campos **não foram construídos aqui.** Os `refs`
desta task (`tasks.toml:1096`) citam `SPEC-001` §3.6 + plano item `8.7` + `Q20` — nenhum cita
`ADR-017`. Construir os campos de um rascunho não ratificado seria exatamente o "amplie escopo"
que este protocolo proíbe, e arriscaria divergir do que o owner de fato aprovar depois.
`provenance = HUMANO` (a única linha que `SPEC-001` §3.6 já fixa, incondicional) já é coberto
pela `AnnotationIdentity` que `createPriceBoundAnnotation` compõe — nada foi perdido do baseline
aprovado. Se `ADR-017` for aprovado, seus campos são ADITIVOS a `SwingPoint`, não uma reescrita —
mas essa decisão não é minha para tomar nesta task.

### Falsificador rodado, não só "os testes passam"

Cada recusa tem o caso que ela rejeita, no mesmo arquivo de teste (`kind` inválido, `eventTimeMs`
`NaN`/negativo, `price` `Infinity`/zero/negativo — 6 casos de `MORDE`). Um falsificador
estrutural adicional (`falsifier: SwingPoint carries ONLY the declared fields`) lista os 8 campos
esperados e falha se qualquer campo fora dessa lista aparecer no objeto devolvido — um futuro
`minMovePct`/`fibLevel` contrabandeado tropeça nele em vez de passar em silêncio.

### Comandos rodados, literais

```bash
cp -r ../cripto-strategy/frontend/node_modules frontend/node_modules  # gitignored, ausente em worktree novo
npm --prefix frontend run lint   # eslint src -> 0 erro, 0 aviso
npm --prefix frontend run test:charts
  # node --test 'src/charts/*.test.ts' -> universo total 147 testes, 114 pass / 33 fail
  # (re-executado isolado: `node --test src/charts/s2-swing-point.test.ts` de dentro de
  # frontend/ -> 12/12 pass, 0 fail — as 33 falhas do universo total são PRE-EXISTENTES,
  # não relacionadas a este módulo: canonical-grid-sha256-proof.test.ts, s2-axis-integration.test.ts,
  # s2-cvd.test.ts, s2-klines-loader.test.ts, s2-oi-loader.test.ts, s2-panels.test.ts — todas
  # ENOENT/asserção sobre `data/binance/**`, ausente neste worktree (dado bruto não é
  # versionado). Confirmado: `ls data` -> "Arquivo ou diretório inexistente".
git add frontend/src/charts/s2-swing-point.ts frontend/src/charts/s2-swing-point.test.ts
harness rules --mode sweep --changed-only   # rc=0, nenhuma saída — 0 achado
```

### Cobertura

Sem piso declarado para `charts` (mesmo motivo de `§8`–`§16`: `harness policy --key test_cmd` só
cobre `sentimento`). Medição qualitativa: 12 testes cobrem 100% das funções/constantes
exportadas (`SWING_KINDS`, `assertSwingKind`, `createSwingPoint`), com um caso positivo por
`kind`, um `MORDE` por recusa (6), a propagação das duas recusas já existentes em
`s2-annotation-price-binding.ts`/`s2-annotation-identity.ts` através da composição, e o
falsificador estrutural de campo fechado.

### Doc delta

Este `README.md` — **atualizado**, `§17` nova (append-only). `docs/specs/SPEC-001-plataforma-dados.md`
— **sem mudança**: `§3.6` já fixa a frase que este módulo torna executável; esta task consome,
não emenda a SPEC. `docs/adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md` — **sem
mudança**: é `RASCUNHO`, gate do owner; o conflito está registrado na seção acima, não resolvido
por mim. `docs/INDEX.md` — **sem mudança, motivo explícito**: o padrão medido deste arquivo
(`grep -oE` sobre os papéis, 73 linhas `/build` isoladas vs. entradas combinadas `/build`+`/qa`)
é UMA linha por task escrita DEPOIS do ciclo completo build+QA+review (ex.: `T-05.6` linha 148,
`T-05.1` linha 134 — que registra correção de uma auto-atribuição prematura do builder). Escrever
a linha agora, antes do QA rodar, repetiria o defeito que aquela correção documenta. Gate de
design — **não aplicável**: zero DOM, zero componente React, mesma classe de `§15`.

## 18. `src/charts/s2-asof-frame.ts` + `s2-review-mode.ts` — `S2` completa: moldura de `as-of` e marcação com teclado obrigatório (`T-08.9`, 2026-09-03)

`T-08.9` (`CST-77`, componente `charts`, plano `08_superficie_e_reprodutibilidade.md` item
`8.6`, `SPEC-001` §6): "**S2 completa**: `as-of` com **moldura impossível de não notar**,
**marcação de fixture com teclado obrigatório**, painéis restantes." Dois módulos, um por
metade do título; "painéis restantes" **não** foi implementado aqui — ver "Bloqueado" abaixo.

`ADR-017` é `RASCUNHO` (sem `approve` no ledger); esta task consome **só** o que os `refs`
citam literalmente: `Q11` (RESPONDIDA, "pode aceitar o default"), `Q20` (RESPONDIDA,
"coexistem"), `D2`, `D3`. Nenhum outro campo/decisão de `ADR-017` foi construído — mesma
disciplina que `§17` já registrou para `T-08.10`.

### `s2-asof-frame.ts` — a moldura

`SessionEnvelope.mode` (`s2-badge.ts`, `§?` não numerada mas já existente desde `T-05.3`) é
reaproveitado verbatim — `AO_VIVO` produz `{ active: false }`. `COMO_EM_T` produz uma moldura
com DOIS canais redundantes (`ADR-010`/`D-2`: "o hue é acelerador, não portador" — o mesmo
argumento aplicado a um terceiro tipo de marca, não preço nem procedência): `widthPx` = 4×
`AMBIENT_BORDER_WIDTH_PX` (o `1px` que `STITCH_CONTEXT.md:225` documenta como a borda ambiente
do sistema — "bordas 1px, zero sombra") e `label`, que carrega `"COMO EM T"` mais o
`knowledgeTime` verbatim. **Nenhum `ColorRole` novo foi adicionado a `color-tokens.ts`** —
`ADR-010`/`D-4` ("ação e procedência não consomem hue") é o argumento citado para não abrir o
union fechado por uma cor que descreve "como você está olhando a tela", não um valor de dado.

`assertFrameIsNoticeable` é o falsificador da própria frase do título: aceita uma moldura
inativa trivialmente, mas recusa uma moldura ativa cuja largura não passe de 1px (indistinguível
do chrome ambiente) ou cujo rótulo não contenha `"COMO EM T"` — os dois casos que
`s2-asof-frame.test.ts` planta e mostra sendo rejeitados.

`buildAsOfFrame` também recusa o sentido inverso: `AO_VIVO` com um rótulo sobrevivente
(`AsOfLabelLeakedUnderLiveError`) — o mesmo `D5.4`/`D2` ("voltar para AGORA tem sintoma
visível") que `knowledge-time-bundle.ts`'s `decodeBundle`/`returnToLive` já aplicam ao bundle,
aqui aplicado à moldura.

### `s2-review-mode.ts` — a marcação com teclado obrigatório

`D2`, verbatim: "`pointer_mode = annotate` ganha o sub-modo `review`… `review_verdict ∈
{accept, reject, add}`." `Q20`: "a tela de review nasce com swing E zona (OB) como
candidatos." O módulo julga um `ReviewCandidate` (`candidateId` + `kind ∈ {swing, zone}`,
opaco — nunca lê o payload) contra um `ReviewInput`, cujo **único** formato declarado carrega
`source: "keyboard"` — não existe variante `"mouse"`/`"click"` para construir, e
`assertKeyboardSourced` recusa em runtime qualquer valor que tenha escapado do tipo, mesma
disciplina de `assertPointerMode`/`assertPointerInputKind` (`§15`).

Teclas: `a`/`r` (aceitar/rejeitar o candidato corrente, qualquer `kind` — a resposta
"coexistem" de `Q20` é honrada deixando `zone` julgado pelas mesmas duas teclas que `swing`) e
`h`/`l` (adicionar um swing do zero, alto/baixo) — as quatro teclas do **piloto de referência**
`scripts/pilot-swing-marker/build.mjs` (nomeado por `Q20`), reaproveitadas verbatim para que a
memória muscular do owner atravesse. As demais teclas do piloto (`x`/`u`/`f`/`g`/`v`/`s`/
navegação) são estado de UI de sessão (limpar/desfazer/filtro/navegar), não um
`review_verdict`, e ficam fora deste módulo (`ADR-003` FR-1: `charts` não faz I/O, não tem
DOM, não tem histórico de sessão) — decisão do que mantém, não do que falta.

`add` é só-swing: `zone` (OB) não tem forma decidida por nenhum documento ratificado, mesmo
motivo que `T-08.10` já registrou para não construir `Zone`.

### Falsificador rodado, não só "os testes passam"

`s2-review-mode.test.ts`: `MouseSourcedReviewInputError` provado ANTES de ler a tecla (um
input `{source:"mouse", key:"a"}` smuggled é recusado sem chegar ao `switch`);
`NoCurrentCandidateError` para `a`/`r` sem candidato; `UnboundReviewKeyError` para uma tecla
fora das quatro (inclusive `"u"`, do piloto, deliberadamente fora de escopo); sensibilidade a
maiúscula (`"A"` ≠ `"a"`). `s2-asof-frame.test.ts`: os dois casos de `assertFrameIsNoticeable`
acima, mais o vazamento de rótulo sob `AO_VIVO`.

### Comandos rodados, literais

```bash
npm --prefix frontend ci        # node_modules ausente no worktree novo (gitignored)
npm --prefix frontend run lint  # eslint src -> 0 erro, 0 aviso (universo: toda a árvore frontend/src)
npm --prefix frontend run test:charts
  # node --test 'src/charts/*.test.ts' -> 156 testes, 140 pass / 16 fail
  # baseline SEM os 2 módulos novos (arquivos movidos para fora de src/charts/ e restaurados
  # depois), mesmo comando: 130 testes, 114 pass / 16 fail — as 16 falhas são IDÊNTICAS e
  # PRE-EXISTENTES nos dois universos (canonical-grid-sha256-proof.test.ts,
  # s2-axis-integration.test.ts, s2-cvd.test.ts, s2-oi-loader.test.ts, s2-panels.test.ts —
  # todas ENOENT/asserção sobre `data/binance/**`, ausente neste worktree: `ls data` ->
  # "Arquivo ou diretório inexistente", dado bruto não é versionado)
node --test src/charts/s2-asof-frame.test.ts src/charts/s2-review-mode.test.ts
  # isolado: 26/26 pass, 0 fail
node --test src/charts/eslint-boundary.test.ts
  # D5.12 MORDE+CALA (4 formas: estático, dynamic import, template literal, require) -> 4/4 pass
  # com os 2 módulos novos presentes na árvore — a fronteira charts<->web continua íntegra
git add frontend/src/charts/s2-asof-frame.ts frontend/src/charts/s2-asof-frame.test.ts \
        frontend/src/charts/s2-review-mode.ts frontend/src/charts/s2-review-mode.test.ts
harness rules --mode sweep --changed-only   # rc=0, nenhuma saída — 0 achado de nenhuma severidade
```

Rodada 2 (após a correção do `NaN`, comandos re-rodados no mesmo worktree):

```bash
node --test frontend/src/charts/s2-asof-frame.test.ts
  # 11/11 pass, 0 fail — inclui o teste plantado pelo QA (linhas 87-90), agora verde
npm --prefix frontend run test:charts
  # 157 testes, 141 pass, 16 fail — as mesmas 16 pré-existentes de sempre (data/binance/**
  # ausente); +1 pass em relação à rodada 1 (156/140/16) é exatamente o teste do QA virando verde
npm --prefix frontend run lint   # eslint src -> rc=0, 0 erro/aviso
harness rules --mode sweep --changed-only   # rc=0, nenhuma saída
```

### Cobertura

Sem piso declarado para `charts` (mesmo motivo de `§8`–`§17`). Medição qualitativa: 26 testes
cobrem 100% das funções/constantes exportadas dos 2 módulos — `buildAsOfFrame` (2 casos
positivos × 2 modos + 3 `MORDE`), `assertFrameIsNoticeable` (2 `CALA` + 2 `MORDE`),
`assertReviewCandidateKind` (2 positivos + 2 `MORDE`), `assertKeyboardSourced` (1 `CALA` + 2
`MORDE`), `resolveReviewKey` (7 casos positivos incluindo o `zone` de `Q20`, 4 `MORDE`).

### Bloqueado

**"Painéis restantes"** (a terceira cláusula do título do item `8.6`) não foi implementado
nesta task. Nenhum `ref` desta task (`tasks.toml:1080-1086`) nomeia QUAIS painéis nem cita um
`DoD` específico para essa cláusula — a tabela de `DoD` do plano `08` (`D8.11`–`D8.20`, regras
de renderização de painel) está explicitamente sob `T-08.12`/`T-08.13` nos `refs` dessas duas
tasks, não sob `T-08.9`. Implementar "painéis restantes" aqui seria adivinhar escopo que a
task não declara — exatamente o "amplie escopo" que este protocolo proíbe.

### Rodada 2 — correção do achado QA (`NaN` em `widthPx`)

`docs/context/plataforma-dados/gates/T-08.9-qa.md` (`NEEDS_FIX`): `assertFrameIsNoticeable`
(`s2-asof-frame.ts:137`, antes da correção) comparava `frame.widthPx < AMBIENT_BORDER_WIDTH_PX
* AS_OF_FRAME_MIN_MULTIPLIER` sem checar finitude — `NaN < 4` é `false` em JS por coerção, então
`widthPx: NaN` (e igualmente `undefined`, ou uma string não numérica) escapava da checagem e
`assertFrameIsNoticeable` aceitava silenciosamente uma moldura sem largura válida, o oposto de
"impossível de não notar". Corrigido acrescentando `!Number.isFinite(frame.widthPx)` à guarda
(`s2-asof-frame.ts:137-141`) — nenhum outro campo numérico do módulo tinha a mesma classe de
lacuna (`widthPx` é o único número comparado por `<`; `label` é checado por `.includes`, que não
sofre coerção numérica). O teste plantado pelo QA
(`s2-asof-frame.test.ts:87-90`, "MORDE (achado QA, nao corrigido): ... rejects a NaN widthPx")
não foi alterado — passa (verde) contra o código corrigido, ver comandos abaixo.

### Doc delta

Este `README.md` — **atualizado**, `§18` nova (append-only). `docs/specs/SPEC-001-plataforma-dados.md`
— **sem mudança**: `§6` já descreve `S2` como "multi-painel, replay as-of, marcação"; esta task
torna a frase executável, não emenda a SPEC. `docs/adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md`
— **sem mudança**: `D-4` é citado, não estendido (nenhum `ColorRole` novo). `docs/adr/
ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md` — **sem mudança**: `RASCUNHO`, gate do
owner; `D2`/`D3`/`Q11`/`Q20` são consumidos, não ratificados por este commit. `docs/INDEX.md` —
**sem mudança, mesmo motivo registrado em `§17`**: uma linha por task é escrita depois do ciclo
build+QA+review completo, não antes do QA rodar. Gate de design — **não aplicável**: zero DOM,
zero componente React, mesma classe de `§15`/`§17`.
