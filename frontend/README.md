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
harness code-paths classify frontend/src/features/painel/Filtro.tsx
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
harness code-paths classify frontend/src/features/painel/serie.<ext>
harness rules --mode file --path frontend/src/features/painel/serie.<ext> --surface ci
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
printf 'import { x } from "../../../../backend/src/modules/sentimento/domain/etl_backlog";\nexport function Serie() { console.log(x); return null; }\n' > frontend/src/features/painel/serie.tsx
harness rules --mode file --path frontend/src/features/painel/serie.tsx --surface ci   # espera BLOQUEIO, rc=1
harness rules --mode file --path frontend/src/features/painel/Filtro.tsx  --surface ci   # espera SILÊNCIO, rc=0
rm frontend/src/features/painel/serie.tsx
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
npm --prefix frontend install          # uma vez
npm --prefix frontend run lint         # eslint src
```

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

### `D1.3b` — a medição que prova por que AST, e não regex

O argumento *"AST não tem os dois defeitos da regex"* era **mecanismo, não medição**.
Universo: **3 arquivos / 4 linhas de código / 2 violações reais / 2 usos legítimos**.

| arquivo | conteúdo | é violação? | `:\s*any\b` | `\bany\b` | **ESLint do projeto** |
|---|---|---|---|---|---|
| `tipos.ts` | `Record<string, any>` + `Map<string, any>` | **sim, 2** | silêncio — **2 FN** | BLOQUEIO | **2 erros** ✔ |
| `config.ts` | `{ retry: 3, any: true }` — chave de objeto | não | silêncio | **BLOQUEIO — FP** | **silêncio** ✔ |
| `Filtro.tsx` | `<p>Filtro: any resultado serve</p>` — texto JSX | não | **BLOQUEIO — FP** | **BLOQUEIO — FP** | **silêncio** ✔ |

O ESLint acerta os três e **não repete nenhum dos dois defeitos**. `config.ts` e
`Filtro.tsx` **ficam na árvore** — eles são o lado "cala" da prova, e é por isso que
parecem estranhos para arquivos de placeholder. **`tipos.ts` foi removido** pelo mesmo
motivo do violador da `§3`: ele reprovaria `npm run lint` para sempre.

Para reproduzir a linha que falta:

```bash
printf 'export type Payload = Record<string, any>;\nexport const cache: Map<string, any> = new Map();\n' > frontend/src/features/painel/tipos.ts
npm --prefix frontend run lint   # espera 2 erros @typescript-eslint/no-explicit-any, rc=1
rm frontend/src/features/painel/tipos.ts
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
  frontend/src/features/painel/Filtro.tsx \
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
