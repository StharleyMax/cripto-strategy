# W-P2 · W-1 — a mordida do badge de OI/long-short volta (frontend-builder, 2026-10-03)

Achado de origem: [`W-P2-QA.md`](W-P2-QA.md) §W-1. Depois da `T-10.11`, **OI-NOBADGE** (`SymbolClient.tsx:1755`) e
**LS-WRONGFEED** (`:3426`) ficavam verdes em `test:app` (726/0) e não eram alcançadas pelo e2e no verify.

## Veredito

**Fechado.** As duas mutações reprovam (rc=1), cada uma no seu arquivo, e R01–R03 continuam verdes nos três arquivos.

## O que mudou

| arquivo | mudança |
|---|---|
| `frontend/src/app/symbol/SymbolClient.tsx` | **só `export`** em `OiPane` e `LongShortPane`, pela decisão P1 de `T-10.11-padrao.md` §5. É a mesma classe do `export` de `PricePane`. Lógica intocada (`git diff` = 2 linhas, `function` → `export function`) |
| `frontend/src/app/symbol/wall-badge-pane-render.test.ts` (novo) | render de `OiPane` e `LongShortPane` pelo `component-render.ts`, com fixtures tipadas e sem `as`. Com `beyond-coverage`, o pane mostra **exatamente** `[<a chave dele>:beyond]`, comparado como lista e não como contagem. Com `not-loaded` e `absent`, a lista fica vazia, ancorada no `data-testid` do pane. O long/short **tem guard próprio** (`:3204`) e entrou junto |
| `frontend/src/app/symbol/wall-state-call-site.test.ts` (novo) | AST com `ts.createSourceFile`, sem regex. Acha o `<LongShortPane>`/`<OiPane>` único dentro de `function SymbolClient` e lê a expressão de `wallState`. Se for identificador, segue até o `const` que o declara, e exige `panelWallState(pager.window, pager.panelCoverage.<série>)` com `<série>` = `longShort` / `oi`. Também confere que `panelWallState` vem de `./slot-coverage.ts`, e não de uma cópia local. O controle negativo monta o mutante LS-WRONGFEED por **span de AST**, não por regex, e afirma que o predicado devolve o valor mutado `"oi"` |
| `frontend/src/app/symbol/beyond-coverage-badge-dom-contract.test.ts` | só o docstring: o "SEM PROVA AUTOMÁTICA" agora aponta para os dois arquivos novos |

**Por que AST e não render do `SymbolClient` (P3).** O render pediria três falsos que ninguém sondou: o contexto do App Router
(`useRouter`/`usePathname`, `SymbolClient.tsx:60,3371-3372`), o chart host com `lightweight-charts` num JSDOM sem
canvas (`chart/host/ChartHost.tsx`) e uma semente de `useHistoryPager` (`:3294`) cuja `panelCoverage` ponha **uma** série além
do piso e a outra não. Tudo isso para alcançar uma prop. A AST lê essa prop direto e, ao contrário dos regexes aposentados,
não depende da ordem das props, da quebra de linha nem do nome da variável local (R01–R03). `[INFERRED: custo do P3 não
medido, como em T-10.11-padrao.md §8; a escolha se apoia nas dependências contadas acima]`

## Matriz de mutação (cada arquivo rodado sozinho, `node --conditions=react-server --test src/app/symbol/<arquivo>`)

Script: aplica uma substituição exata em `SymbolClient.tsx` (com `assert` de 1 ocorrência), roda os 3 arquivos um por
vez e restaura o original num `finally`. Depois da última, `cmp` com a cópia de antes deu idêntico, e `git diff --stat` mostra
só as 2 linhas de `export` em `SymbolClient.tsx`.

| mutação | `wall-badge-pane-render` | `wall-state-call-site` | `beyond-coverage-badge-dom-contract` |
|---|---|---|---|
| **OI-NOBADGE** (`:1755` → `{null}`) | **rc=1** (1 fail) | rc=0 | rc=0 |
| **LS-WRONGFEED** (`:3426` `wallState={oiWallState}`) | rc=0 | **rc=1** (1 fail) | rc=0 |
| LS-NOBADGE (`:3204` → `{null}`) | **rc=1** (1) | rc=0 | rc=0 |
| OI-GUARD-LOOSE (`=== "beyond-coverage"` → `!== "absent"`) | **rc=1** (1) | rc=0 | rc=0 |
| LS-WRONGKEY (`factKey="long_short_coverage"` → `"oi_coverage"`) | **rc=1** (1) | rc=0 | rc=0 |
| OI-WRONGFEED (`<OiPane … wallState={longShortWallState}>`) | rc=0 | **rc=1** (2: o teste do OI e o controle, que lê o mesmo call site) | rc=0 |
| **R01** (ordem das props de `<OiPane>`) | rc=0 | rc=0 | rc=0 |
| **R02** (renomear `oiWallState` → `openInterestWall`, 2 ocorrências) | rc=0 | rc=0 | rc=0 |
| **R03** (quebra de linha antes de `/>` no `<OiPane>`) | rc=0 | rc=0 | rc=0 |

`[MEDIDO 2026-10-03, n=1 por célula]`. Cada mutação é pega por **um** arquivo só. É a divisão esperada: o render prova o guard
e a AST prova a alimentação.

## QA Gate Context Block

```
[QA GATE — W-P2 W-1: mordida do badge de parede em OI e long/short]
Feature: estrutura-do-front     Componente: web
Arquivos alterados:
- frontend/src/app/symbol/SymbolClient.tsx (modified — só `export`, P1)
- frontend/src/app/symbol/wall-badge-pane-render.test.ts (new)
- frontend/src/app/symbol/wall-state-call-site.test.ts (new)
- frontend/src/app/symbol/beyond-coverage-badge-dom-contract.test.ts (modified — docstring)
DoD:
- [x] OI-NOBADGE rc=1 — matriz acima
- [x] LS-WRONGFEED rc=1 — matriz acima
- [x] R01–R03 verdes nos 3 arquivos — matriz acima
Comandos rodados (literais) e resultado:
- node --conditions=react-server --test src/app/symbol/wall-badge-pane-render.test.ts → rc=0, 6 pass / 0 fail, 1,40 s
- node --conditions=react-server --test src/app/symbol/wall-state-call-site.test.ts → rc=0, 4 pass / 0 fail, 0,65 s
- node --conditions=react-server --test src/app/symbol/beyond-coverage-badge-dom-contract.test.ts → rc=0, 4 pass / 0 fail, 1,11 s
- npm --prefix frontend run lint → rc=0 (universo: eslint src)
- npm --prefix frontend run typecheck (tsc --noEmit --strict) → rc=0
- harness rules --mode file --path <cada um dos 4 arquivos> --format ndjson → rc=0, 0 achados
Cobertura: não medida (fora do escopo; o pedido foi mordida por mutação)
Doc delta:
- docs/INDEX.md: linha acrescentada (artefato novo: este relatório)
- tasks.toml (refs de T-10.13/T-10.14): sem mudança — escrever no tracker não é ato de builder. O QA propôs (a)/(b) em W-P2-QA.md §W-1; o OI-NOBADGE e o equivalente do long/short agora já mordem aqui, então a T-10.13/T-10.14 herdam a prova em vez de criá-la
- ADR: não necessário — aplicação do padrão já decidido (T-10.11-padrao.md, P1)
Bloqueado: nada
Não rodado, por restrição do despacho: make verify / make test / e2e. A suíte `test:app` inteira não rodou; o W-2 (custo por
arquivo de render) ganha +1 arquivo de render de ~1,4 s isolado `[MEDIDO, n=1, sem carga controlada]`
Validação ao vivo (Playwright MCP): não roda nesta instalação, e a ausência fica registrada aqui
```
