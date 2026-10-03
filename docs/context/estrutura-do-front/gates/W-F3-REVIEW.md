# W-F3-REVIEW — revisão arquitetural da fase 03 de `estrutura-do-front` (T-03.1, T-03.2, T-03.3)

**Veredito: COMPLIANT** — 0 BLOCKER, 0 WARNING, 3 INFO (fora do veredito).

- Revisor: architecture-reviewer (read-only). Data: 2026-10-03.
- Árvore auditada: `91ed58f0` (HEAD de `wave/estrutura-f03`), extraída por `git archive 91ed58f0` para o scratchpad do revisor.
  Motivo: durante a revisão outro agente mexia na worktree compartilhada (`series-slots.ts` apareceu ` M` às 19:28:21 -03
  e voltou limpo segundos depois); medir sobre a árvore commitada isola o resultado disso.
- Diff da fase: `git diff 18494508...HEAD`. `18494508` é um merge de `wave/piramide-w2`, **não** ancestral de HEAD;
  o três-pontos resolve para o merge-base `ff94cbb7` (último commit da T-10.11), então o diff é exatamente os 3 commits
  da fase. Conferido: `git diff --stat ff94cbb7 HEAD` = mesmos 29 arquivos, +2693/−334 `[MEDIDO]`.

## Denominador

| camada | universo | comando | resultado |
|---|---|---|---|
| regras bloqueantes | 8 em vigor (`harness rules list --severity block`); **1 aplicável** a `frontend/src/**` TS (`web-fullstack.browser-imports-server`). As outras 7 têm `paths` só `**/*.py`, `backend/**` ou compose (`packs/*/rules.toml` do plugin 0.13.0) | — | 8 avaliadas por escopo, 1 exercida |
| runner por arquivo | 24 arquivos de `frontend/` alterados (23 em `frontend/src`, 1 em `frontend/e2e`, este fora de `code_paths`) | `harness rules --mode file --surface ci --path <f>` | **0 BLOQUEIO**, rc=0 nos 24; 3 `[AVISO] web-fullstack.hardcoded-url` (severidade warn) `[MEDIDO]` |
| controle positivo do runner | sonda `frontend/src/app/symbol/zz-probe.ts` com `import … from "../../../backend/src/api"` | idem | **rc=1**, `[BLOQUEIO] web-fullstack.browser-imports-server` `[MEDIDO]` |
| ESLint inteiro | `frontend/src` | `npx eslint src` | **rc=0, 0 linhas** `[MEDIDO]` |
| controle positivo de `local/indicator-isolation` | sonda `chart/history/zz-probe.ts` importando `../../indicators/catalog.ts` | `npx eslint <sonda>` | **1 error P2**, rc=1; sem a sonda, `chart/history/` rc=0 `[MEDIDO]` |
| grafo do cliente | fecho de import de VALOR a partir de `SymbolClient.tsx` (walker por regex em `.ts/.tsx`, `import type` ignorado) | script no scratchpad | **70 arquivos, 0 `node:*`**, 0 `series-key-id.ts`, 0 `page.tsx`. Na base `ff94cbb7` o mesmo fecho **alcançava** `series-key-id.ts` (`node:crypto`) via o reexport de `view-model.ts` — a fase removeu isso `[MEDIDO]` |

## Checagens

1. **Fronteira charts↔web (`ADR-034/D8`).** Nenhum import novo de `charts/` fora do barrel (`grep` nas linhas `+` → rc=1);
   0 arquivos alterados em `frontend/src/charts/` ou `backend/` `[MEDIDO]`.
2. **`chart/history/series-slots.ts` no lugar certo.** `SPEC-011 §3`: núcleo = `chart/**`; *"os tipos que o núcleo consome são do
   núcleo … o requisito de série em `chart/history/`"* e *"o pager … recebe[m] as definições como argumento"*. O arquivo importa só
   `./series-requirement.ts` (tipo), não nomeia indicador (0 literais `oi|cvd|liquidation|long_short|volume` em `series-slots.ts`
   e `use-history-pager.ts`), e `HistorySeriesTable` é a visão do núcleo sobre a tabela. `SymbolClient.tsx` (autorizado a importar
   o catálogo pela tabela de camadas do §3) passa `INDICATOR_CATALOG` por parâmetro. P2 verde e com mordida provada.
3. **`frontend/package.json` intocado** — e `package-lock.json` também: `git diff --numstat` vazio `[MEDIDO]`.
4. **Escopo por task** (`git show --name-status`):
   - T-03.1: só `ssr-pager-characterization.test.ts` (A) + build report + INDEX. Remoção 0. Conforme a DoD.
   - T-03.2: `indicators/catalog.ts` (A), `catalog.test.ts` (A), `page.tsx` (M) e os 4 `*-pane-dom-contract.test.ts` (M) — estes
     são o item 3.4 (regex de predicado → teste de valor), conferido no diff do OI e do CVD. Conforme.
   - T-03.3: pager, `panel-assembly.ts`, `SymbolClient.tsx`, `series-slots.ts` (A), e2e/43 (**A**) e os arquivos-satélite
     (`slot-coverage.ts`, `view-model.ts`, `series-key-id.ts` só cabeçalho, 6 testes ajustados). Todos declarados um a um na tabela
     de numstat de `gates/T-03.3-build.md` §5, incluindo a mudança de forma de `panel-assembly.test.ts` (13 → 15) exigida pelo
     plano 3.3. A edição em `ssr-pager-characterization.test.ts` é +1 argumento (a tabela) e o import reapontado para
     `series-key-id.ts` — não altera o que a caracterização compara.
5. **Idioma (tabela do `CLAUDE.md`).** Linhas `+` de `frontend/src`: 0 ocorrência de marcador português em identificador,
   comentário, nome de teste ou mensagem de erro `[MEDIDO: grep de acentos/palavras PT nas linhas +]`. e2e/43: nome de arquivo,
   identificadores e comentários em inglês. Ver INFO-2.
6. **`docs/INDEX.md` append-only:** `@@ -453,0 +454,3 @@` — 3 linhas acrescentadas ao fim, 0 removidas `[MEDIDO]`.
7. Commits: autor e committer `Stharley Maxwell <stharleymax@gmail.com>`, 0 `Co-Authored-By` nos 3 `[MEDIDO]`.

## Achados (nenhum entra no veredito)

- **[INFO-1]** `web-fullstack.hardcoded-url` (warn) em `history-pager-requests.test.ts:37`, `indicators/catalog.test.ts:46`,
  `ssr-pager-characterization.test.ts:52`: URLs de stub com TLD `.invalid` em teste. Mesmo padrão já existe em ≥5 testes da base
  (`git grep -c 'http://' ff94cbb7 -- 'src/**/*.test.ts'`). Severidade warn; sem correção exigida.
- **[INFO-2]** `frontend/e2e/43-history-requests-per-page.spec.ts:233,236,252,311,315,320,324` — título do `test()` e mensagens de
  `expect` em português. `frontend/e2e/` não está nas superfícies enumeradas da tabela (linha 1 cobre `frontend/src`, linha 2
  `backend/tests`) nem em `code_paths`, e idioma é "convenção, não portão" (`CLAUDE.md` §Idioma). Precedente: 33 de 42 specs
  existentes têm título em PT (66/114 testes) `[MEDIDO: grep de test( nos specs ≠ 43]`. Sugestão para a fase 10 (pirâmide):
  decidir a superfície e2e de uma vez, em vez de spec a spec.
- **[INFO-3]** Os carimbos das 3 linhas novas do `docs/INDEX.md` não batem com os commits: T-03.1 `23:30Z` (commit 21:47Z),
  T-03.2 `2026-10-04T00:30Z` (commit 22:01Z — **no futuro** no momento da revisão, ~22:28Z), T-03.3 `22:30Z` (commit 22:27Z)
  `[MEDIDO: git log --date=iso-strict]`. Nenhuma regra cobre o carimbo; registro append-only não permite reescrever — se for
  corrigir, é com linha nova de errata.

## Não avaliado

- `make verify` / e2e / pytest: papel do QA, não desta revisão. Não rodei nada que dispute a máquina com um verify.
- `jsdom` aparece no fecho de valor do cliente via `charts/index.ts` (`headless-chart.ts`, `s2-headless-run.ts`) — **idêntico na
  base**, não introduzido pela fase; fora de escopo.
