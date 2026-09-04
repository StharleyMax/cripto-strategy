# ADR-018 — Scaffold Next real sob `frontend/src/app/`, `tsconfig.json` estrito e `tsc --noEmit --strict` dentro de `make lint-frontend`

**Status:** `RASCUNHO` (aprovar é gate do owner) · **Data:** 2026-09-04 · **Componente:** `web` ·
**Feature:** `plataforma-dados` (`T-05.11`, `CST-102`) · **Autor:** `architect` (`web`, sucessor de `ui-designer` desde `A6`)
**Rev de ancoragem:** medições em `master@758e2ef` (worktree `/tmp/claude-1002/wt/T-05.11`, branch `tasks/T-05.11-scaffold-next`)

**Fecha:** versão de Next/React fixada, layout de arquivo do App Router, forma de `tsconfig.json`, o
cabeamento de `tsc` em `make lint-frontend`, e o mecanismo de prova de `D5.16b` ("renderiza, não só
compila"). **Não fecha:** o transporte real (HTTP endereçável por conteúdo / SSE — `T-05.12`+),
Tailwind/CSS pipeline, Vitest/Testing Library/Playwright (task explicitamente NÃO os traz — só "abre
caminho").

---

## Contexto

`ADR-009/D3` já fixou `frontend/src/{app,features,components}` como layout de enforcement — este ADR
**não reabre isso**, só o preenche pela primeira vez com um app Next de verdade. `frontend/src/app/
routes.ts:11-13` já declarava que os *pages* Next não são desta task anterior — são desta.

**Antes desta task (medido em `master@758e2ef`):** `frontend/package.json` não tem `next`, `react` nem
`react-dom` em nenhuma lista de dependência; `ls frontend/tsconfig.json` → inexistente;
`grep -rn 'from "react"' frontend/src | wc -l` → `0`; os 3 `.tsx` de produção
(`features/panel/Filter.tsx`, `features/s1-console/S1Console.tsx`, `features/s3-inspector/
S3Inspector.tsx`) já são presentacionais, tipados, lint-limpos, e já têm view-model + fixture prontos
(`buildS1ViewModel`, `buildS3ViewModel`) de `T-07.12`/`T-06.10` — não sobrou domínio para portar, só
transporte visual.

## Decisão

### D1 · Versão — `next@16.3.4` / `react@19.2.8` / `react-dom@19.2.8`, faixa `^`

`[MEDIDO 2026-09-04]`: `curl -s https://registry.npmjs.org/next/latest` → `16.3.4`, `engines.node
>= 20.9.0` (satisfeito por `node --version` → `v24.10.0` neste host). Faixa `^` — mesmo estilo já
usado por `typescript`/`eslint`/`typescript-eslint` em `frontend/package.json` — com
`package-lock.json` commitado carregando a reprodutibilidade (o equivalente npm do `==` que
`backend/pyproject.toml` usa; não importo a doutrina do backend porque o frontend já tem a própria).
Dev deps novas: `@types/node@^24.13.3` (pareado à major do `node` instalado, não à `latest` `26.x` —
menor risco de API ausente em runtime), `@types/react@^19.2.18`, `@types/react-dom@^19.2.7`,
`@types/jsdom@^30.0.0` (ver D5).

### D2 · Layout de arquivo

```
frontend/
  next.config.ts          # novo — minimo, SEM ignoreBuildErrors/ignoreDuringBuilds
  tsconfig.json            # novo — D3
  next-env.d.ts             # novo — gerado por `next dev`/`next build`, COMMITADO (default do
                             #        create-next-app; ver falsificador D2 — seguro mesmo sem `.next/`)
  src/
    app/
      layout.tsx             # novo — Server Component, só `<html lang="pt-BR"><body>`
      painel/
        page.tsx               # novo — Client Component, a rota `/painel` (valor JÁ fixado por
                                 #        `CA-F3-8`/`SPEC-002`; o segmento de diretório TEM de ser
                                 #        literalmente `painel`, não `panel` — é o valor da URL, não
                                 #        o identificador da chave)
      routes.ts               # existente, intocado
      history-transport.ts    # existente, intocado (transporte real é T-05.12+)
      ...
```

`painel/page.tsx` é a única peça de composição de produto desta task, e ela compõe os **3 `.tsx` que
já existem**, sem inventar dado novo: `Filter` (sem props), `S1Console` (via `buildS1ViewModel` +
`COLLECTOR_ROWS`/`ETL_QUEUE_DEPTH_PENDING`/`STORAGE_BUDGET_LINES`/`RECONNECTION_EVENTS` de
`s1-console/fixtures.ts` — o mesmo fixture que `T-07.12` já publicou), `S3Inspector` (via
`buildS3ViewModel` + `FIXTURE_CATALOG_ROWS`/`FIXTURE_DIVERGENCES` de `s3-inspector/fixtures.ts`, com
`filterText`/`onFilterTextChange`/`onOpenSeries` amarrados a `useState` local — **nenhum `console.*`**,
por causa de `no-console: error` já pinado em `eslint.config.mjs`). **Nenhum painel de gráfico (`S2`,
`charts/`) é montado aqui** — a fronteira ESLint de `D5.12` (`eslint.config.mjs:73-227`) hoje proíbe
`web → charts` nas duas direções, "simétrica e total... nada legitimamente precisa cruzar a fronteira
hoje" (comentário do próprio arquivo); abrir uma exceção é decisão de `T-05.2+`, não desta task.

Conteúdo de referência de `painel/page.tsx` (o `frontend-builder` pode usar quase verbatim — validado
rodando de verdade, ver `gates/T-05.11-architect.md` §4):

```tsx
"use client";

import { useState } from "react";

import { Filter } from "../../features/panel/Filter.tsx";
import { S1Console } from "../../features/s1-console/S1Console.tsx";
import {
  COLLECTOR_ROWS,
  ETL_QUEUE_DEPTH_PENDING,
  RECONNECTION_EVENTS,
  STORAGE_BUDGET_LINES,
} from "../../features/s1-console/fixtures.ts";
import { buildS1ViewModel } from "../../features/s1-console/view-model.ts";
import { S3Inspector } from "../../features/s3-inspector/S3Inspector.tsx";
import { FIXTURE_CATALOG_ROWS, FIXTURE_DIVERGENCES } from "../../features/s3-inspector/fixtures.ts";
import { EMPTY_CATALOG_FILTER, buildS3ViewModel } from "../../features/s3-inspector/view-model.ts";

export default function PainelPage() {
  const [filterText, setFilterText] = useState("");
  const [openedSeriesId, setOpenedSeriesId] = useState<string | null>(null);

  const s1ViewModel = buildS1ViewModel(
    COLLECTOR_ROWS,
    ETL_QUEUE_DEPTH_PENDING,
    STORAGE_BUDGET_LINES,
    RECONNECTION_EVENTS,
  );
  const s3ViewModel = buildS3ViewModel(FIXTURE_CATALOG_ROWS, EMPTY_CATALOG_FILTER, null, [], FIXTURE_DIVERGENCES);

  return (
    <main>
      <Filter />
      <S1Console viewModel={s1ViewModel} />
      <S3Inspector
        viewModel={s3ViewModel}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onOpenSeries={setOpenedSeriesId}
      />
    </main>
  );
}
```

`openedSeriesId` fica sem consumidor visível de propósito (gaveta de quarentena real é escopo de tela
que o `design_gate` ainda não fechou para esta composição — `T-06.10-design.md` §6, `PENDING`); o
`frontend-builder` decide se usa (`eslint`'s `no-unused-vars` vai cobrar uma das duas: consumir ou
remover — não deixe morto).

**Falsificador de D2:** se `harness code-paths classify frontend/src/app/painel/page.tsx` devolver
`nao-producao`, o layout errou — precedente `ADR-009/D3`, mesmo comando.

### D3 · `tsconfig.json` — o conteúdo exato, e cada linha tem uma razão medida

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- **`allowImportingTsExtensions: true`** — não é gosto, é necessidade medida: os 41 módulos de
  produção e os 34 de teste deste repositório importam uns aos outros com extensão `.ts` explícita
  (`import { x } from "./y.ts"`), porque `node --test 'src/**/*.test.ts'` roda os `.ts` **direto**,
  sem bundler (Node 24 faz type-stripping nativo). Sem a flag: `tsc --noEmit --strict` reprova **34
  arquivos** só com `TS5097` (*"An import path can only end with a '.ts' extension..."*) antes de
  chegar a qualquer erro de tipo real `[MEDIDO 2026-09-04]`. A flag exige `noEmit`/
  `emitDeclarationOnly` — já temos `noEmit: true`, e é o mesmo par que o Next usa internamente.
- **`target: "ES2022"`** (Next gera `"ES2017"` por padrão) — `src/charts/s2-cvd.ts` e
  `s2-cvd.test.ts` usam literais `BigInt` (`0n`); com `ES2017` isso é `TS2737`, **13 ocorrências
  medidas** `[MEDIDO 2026-09-04]`. `ES2022` os resolve sem tocar o código.
- **`jsx: "react-jsx"`**, não `"preserve"` — **medido ao vivo, não suposto**: `next build` (Next
  `16.3.4`) **reescreve** um `tsconfig.json` com `jsx: "preserve"` na primeira execução, imprimindo
  *"The following mandatory changes were made... jsx was set to react-jsx"*. Nasce já correto para
  não deixar o primeiro `next build` do `frontend-builder` divergir silenciosamente do que está
  commitado.
- **`skipLibCheck: true`** — default recomendado do Next, e também é o que torna `next-env.d.ts`
  seguro de committar **antes** de `.next/` existir: esse arquivo tem `import "./.next/types/
  routes.d.ts"` e `import "./.next/types/root-params.d.ts"`, caminhos que só existem depois do
  primeiro `next dev`/`next build`. **Medido nos dois sentidos:** com `.next/` ausente,
  `tsc --noEmit --strict` **não acusa** módulo ausente nem com `skipLibCheck: true` nem com
  `skipLibCheck: false` `[MEDIDO 2026-09-04, rm -rf .next && tsc -p tsconfig.json --noEmit --strict
  2>&1 | grep -i 'next-env|Cannot find module' → 0 linhas, nos dois valores da flag]` — TS não
  resolve o side-effect import de um `.d.ts` referenciado por outro `.d.ts` como erro de projeto.
  Documentado aqui para que ninguém "console" essa flag pensando que ela é o que salva o clone
  limpo — não é; é uma propriedade do próprio TS que eu confirmei, não assumi.
- **`include` com as DUAS pastas `.next/`** (`types` e `dev/types`) — o Next as adiciona sozinho na
  primeira execução (`next build` acrescentou `.next/dev/types/**/*.ts`); estão aqui para o
  `tsconfig.json` commitado já bater byte a byte com o que o Next produziria, e ninguém veja isso
  como "o `frontend-builder` mudou minha config".
- **Escopo do `include`**: `src/**/*.ts(x)` — **todo** o código de `frontend/src`, produção E teste.
  Não há recorte por diretório: o universo do portão é o universo do repositório, mesma decisão que
  `D5.16` do plano já fixa ("universo: 35 módulos / 5.741 linhas + 3 `.tsx` / 409 linhas").

**Falsificador de D3:** plantar `const x: string = 1;` em qualquer `.ts` sob `src/` e rodar
`npm --prefix frontend run typecheck` tem de nomear o arquivo e a linha, `rc≠0`; removido, `rc=0`.

### D4 · `package.json` e `Makefile` — o cabeamento, sem tocar o ESLint

```jsonc
// frontend/package.json — scripts (diff)
"scripts": {
  "lint": "eslint src",              // INALTERADO — ADR-011/D4 continua dono só disto
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc -p tsconfig.json --noEmit --strict",
  "spike:axis": "...", "test:*": "..."  // inalterados
}
```

```make
# Makefile — alvo lint-frontend (diff: +1 linha)
lint-frontend:
	@test -d frontend/node_modules || { ...; exit 3; }
	npm --prefix frontend run lint
	npm --prefix frontend run typecheck
```

Duas linhas independentes — a regra de escrita do próprio `Makefile` ("a última palavra da linha
decide o `rc`... prefira uma linha, um comando") já dá o comportamento certo sem `&&`/`;`: `make`
aborta na primeira que falhar. **Por que não meter os dois num script `lint` só** (`eslint src && tsc
...`): manteria `npm run lint` fazendo duas coisas com um nome que já é ambíguo o bastante — e
`ADR-011/D4` documenta `lint` como "ESLint do PROJETO", não "ESLint + tipo". Separar os alvos é o que
deixa `D5.16`'s falsificador (`make lint` nomeando arquivo e linha) apontar sem ambiguidade para qual
dos dois instrumentos mordeu.

### D5 · Dívida de baseline que **esta task tem de pagar**, não herdar

Rodei `tsc --noEmit --strict` sobre a árvore real com o `tsconfig.json` de D3, e o "antes" **não é
zero até nesses dois arquivos** `[MEDIDO 2026-09-04, 80 arquivos no projeto, 7 erros / 2 arquivos]`:

| arquivo | erro | causa |
|---|---|---|
| `src/charts/headless-chart.ts:125` | `TS2540` `devicePixelRatio` é read-only | atribuição direta `window.devicePixelRatio = 1` num `Window` tipado contra `lib.dom`; o mesmo arquivo já usa o padrão de correção 2 linhas acima para `ResizeObserver`/`matchMedia`: `(window as unknown as Record<string, unknown>).devicePixelRatio = 1` |
| `src/charts/headless-chart.ts:248-249` | `TS2345` | `CandlePoint[]`/`LinePoint[]` (`time: number`) não é atribuível a `CandlestickData<Time>[]`/`LineData<Time>[]` da `lightweight-charts` — `Time` é tipo com marca (branded), não `number` puro |
| `src/charts/s2-axis-integration.test.ts:139-142` | `TS2322` | mesmo choque de `Time` alimentando um helper genérico `Record<string, unknown>[]` |

Foi só depois de instalar `@types/jsdom@^30.0.0` (antes: `TS7016`, `jsdom` sem declaração, **em 2
arquivos** — `headless-chart.ts` e `s2-headless-run.ts`) que esses 7 sobraram como o piso real.
**Nenhum dos 3 arquivos com erro é tocado pelo scaffold** — são 100% pré-existentes, de `charts/`, e
`D5.16` exige árvore limpa para fechar (`rc=0`); um portão que nasce vermelho é pior que nenhum
portão. Corrigi-los é conserto de tipo mecânico (cast/branding), não julgamento de domínio — não
preciso do `quant-architect` para isso, mas registro aqui para que o `frontend-builder` não precise
redescobrir via busca.

**Falsificador de D5:** `npm --prefix frontend run typecheck` sobre a árvore, **sem** os 3 arquivos
tocados, tem de dar `rc=0`. Se sobrar erro fora desses 3, o inventário acima está incompleto.

## `D5.16b` — o mecanismo de prova, e por que ele NÃO é um portão de `make` ainda

Task refs: `T-05.11` "abre caminho para Vitest + Testing Library + Playwright" — não os traz. Sem
eles, a prova de "renderiza, não só compila" é **manual, documentada com output real**, mesmo
precedente de `T-07.14`'s `tsc --noEmit --strict` "à mão, uma vez" (`docs/INDEX.md:127`). **Isto é
uma lacuna declarada, não escondida**: `D5.16b` não tem portão de CI nesta task.

Rodado ao vivo (`gates/T-05.11-architect.md` §4 tem o log completo):

1. `npm --prefix frontend run build` → `next build`, **sem** `ignoreBuildErrors` — compila
   `/painel` como página estática.
2. `npm --prefix frontend run start -- -p 4319` (loopback) + `curl -s http://127.0.0.1:4319/painel`
   → grep de 3 marcadores, um literal por componente: `"Filtro: any resultado serve"` (`Filter.tsx`),
   `"Monitoramento de Coletores e Ingestão"` (`S1Console.tsx`), `"Catálogo de Séries"`
   (`S3Inspector.tsx`) → **os 3 presentes, contagem 1 cada** `[MEDIDO 2026-09-04]`.
3. **MORDE (i), o par exato que `D5.16b` pede** — comentei a montagem de `<S3Inspector .../>` na
   página: `next build` continua **verde** (`rc=0`, "Compiled successfully"), mas o `curl` +
   grep do mesmo marcador cai para **0** `[MEDIDO 2026-09-04]`. **Isto é a prova de que compilar ≠
   renderizar** — exatamente o vácuo que o DoD nomeia.
4. **MORDE (ii)**, precedente de `D5.13`: matar o processo `next start` → `curl --max-time 2`
   devolve `rc=7` ("Failed to connect"), não um corpo vazio — o mesmo padrão de "conexão recusada,
   não asserção de payload" que `D5.13` usa para a porta FastAPI.

## Falsificador geral do ADR

Se, depois de aplicar D1–D5, `npm --prefix frontend run typecheck` não reprovar sobre um erro de tipo
plantado em `frontend/src/app/painel/page.tsx` **e** `git push --dry-run` não for recusado com o hook
instalado, este ADR está errado sobre onde o portão mede. Se `harness code-paths classify
frontend/app/page.tsx` (a forma recusada) devolver `producao`, a restrição dura de `ADR-009/D3` mudou
e este ADR precisa ser revisto.

## Alternativas recusadas

| alternativa | por quê não |
|---|---|
| `frontend/app/` (raiz, sem `src/`) | `ADR-009/D3` já recusou — sai do universo de `code_paths`/ESLint em silêncio |
| `moduleResolution: "nodenext"` em vez de `"bundler"` + `allowImportingTsExtensions` | `nodenext` exige import de **saída emitida** (`.js`), não do `.ts` fonte — quebraria a convenção viva de `node --test 'src/**/*.test.ts'` importar `.ts` direto, ou exigiria reescrever ~80 imports |
| baixar `target` para manter compat e trocar `0n` por `BigInt(0)` em `s2-cvd.ts` | toca um módulo `charts` fora do escopo desta task por um motivo estético (a flag resolve sem tocar código) |
| wire `typecheck` dentro do próprio script `lint` (`eslint src && tsc ...`) | ambiguidade de nome — ver D4 |
| montar um painel `S2` (chart) nesta task para "aproveitar" a rota | fura a fronteira ESLint `D5.12`, que hoje proíbe `web → charts` nas duas direções; abrir a exceção é `T-05.2+`, não decisão desta task |
