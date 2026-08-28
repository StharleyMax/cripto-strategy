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
| (b) globs | `harness.toml` → `code_paths.include_globs` | `+ "*.ts", "*.tsx"` |
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

## 6. Estado medido em 2026-08-28, com o comando de cada número

```
find frontend/src -type f                    ->  4 arquivo(s)
npm --prefix frontend run lint               ->  0 erro, 0 aviso, rc=0  (universo: 4 arquivos)
harness rules --mode sweep                   ->  1 AVISO, 0 BLOQUEIO, rc=0
harness rules --mode sweep --surface git-hook->  1 AVISO, 0 BLOQUEIO, rc=0
harness policy --key packs                   ->  ["core", "web-fullstack"]
harness rules list                           ->  10 regra(s) em vigor  (antes: 5)
```
