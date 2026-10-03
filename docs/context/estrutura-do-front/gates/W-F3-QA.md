# W-F3-QA: QA de front da fase 03 de `estrutura-do-front` (T-03.1, T-03.2, T-03.3)

> Worktree `wave-estrutura-f03`, branch `wave/estrutura-f03`, HEAD `91ed58f0`. Diff da fase:
> `git diff 18494508...HEAD`, cuja merge-base é `ff94cbb7` (= `1ce52ae7^`). São 3 commits e 29 arquivos (+2693/−334).
> Agente: `frontend-qa`. Data: 2026-10-03, 22:28Z a 22:35Z. Não gravei nada no ledger e não commitei.

## QA Gate (Front) — Fase 03: o dado por tabela e a caracterização SSR = pager

- [OK] **DoD T-03.1:** os 5 casos estão verdes, e 5 mutações minhas, que o builder não tinha rodado, reprovam cada uma o seu caso (§2.1).
- [OK] **DoD T-03.2:** o teste de valor substitui o de regex, e 3 mutações minhas reprovam (§2.2). A T-03.1 continua 5/0.
- [OK] **DoD T-03.3:** a e2e/43 dá **10** na árvore e **9 contra 10** com a mutação. O eslint (P2) reprova o pager que importa o catálogo, e o grafo do cliente reprova o reexport de `node:crypto` (§2.3).
- [OK] **Lógica fora do componente:** `SymbolClient.tsx` ficou com +8/−4 linhas, só para passar `INDICATOR_CATALOG` e ler por `tableSlotValue`. O plano mora em `chart/history/series-slots.ts`.
- [OK] **Contrato na borda:** `oi_candles` agora vem do único envelope que o traz. Mais de um envelope lança erro, e `series_history.py:474` confirma que o back devolve `None` para tudo que não é OI.
- [OK] **Sem segredo no cliente:** as regras deram 0 bloqueante (abaixo).
- [OK] **Acessibilidade:** a fase não traz superfície interativa nova.
- [OK] **Testes:** os 15 arquivos que a fase toca dão **155 pass, 0 fail**, rodados um por vez. Todos têm o par morde/cala.
- [OK] **Cobertura:** a política não declara alvo de cobertura para o front. `[NÃO MEDIDO]`: não existe instrumento de cobertura de front.
- [OK] **Regras:** `harness rules --mode file --path <f> --format ndjson` sobre os 24 arquivos A/M de `frontend/` deu **0 block e 3 warn** (`hardcoded-url` nos stubs de teste). ⚠️ O `--mode sweep --changed-only` deu `rc=0` com saída vazia sobre a árvore limpa, e isso não mede nada. Por isso rodei por arquivo.
- [PENDENTE] **`make verify`:** não rodou, por ordem do despacho, e é do orquestrador depois do merge do master. Rodei só `tsc --strict` (rc=0, 0 linhas) e `eslint src` + a spec 43 (rc=0).
- [FAIL] **Doc delta:** o `scope-map.tsv` deixa a e2e/43 fora do diff que mexe só no pager (F-1). As linhas novas do INDEX da T-03.1 e da T-03.2 têm horário no futuro (F-2).
- [OK] **Rótulos:** o B e o D_3 do builder foram reproduzidos exatamente (§3).

Achados:
1. **[WARNING, ação obrigatória] F-1, a e2e/43 precisa de linha no `scope-map.tsv`.** O builder diz que a linha `08+` já alcança a 43, e isso é falso para o arquivo que a 43 guarda. Para `use-history-pager.ts` vale a linha `frontend/e2e/scope-map.tsv:35` (`16-27 29 30 33-39 42`), que exclui a 43. Medi com `echo '// qa-probe' >> …/use-history-pager.ts; VERIFY_BASE=HEAD bash scripts/scope-resolve.sh`, que devolve 23 specs sem a 43. Com a mesma sonda em `series-slots.ts`, `panel-assembly.ts` e `catalog.ts`, a 43 entra (`[MEDIDO 2026-10-03, n=4 sondas, restauradas]`). No modo escopo, o que segura uma regressão do pager é só a metade unitária: `history-pager-requests.test.ts` dá 1/1 sob a mutação do §2.3.
2. **[WARNING] F-2, horário das linhas novas do INDEX.** As linhas da T-03.1 e da T-03.2 dizem `2026-10-03T23:30Z` e `2026-10-04T00:30Z`. Os commits são de 21:47Z e 22:01Z (`git log --format=%cI`), e às 22:35Z, quando escrevi, os dois horários ainda estavam no futuro. As linhas são novas e não estão no master, então corrigir agora **não** é reescrever uma linha existente.
3. **[WARNING] F-3, ponto cego do guarda `client-import-graph.test.ts`.** O teste filtra só `startsWith("node:")`. Acrescentei `import { createHash } from "crypto"` em `view-model.ts` e o resultado foi **2/0 verde, eslint rc=0** (restaurado). Quem pega esse caso hoje é só o grep de `createHash` no chunk, e esse grep não é portão.
4. **[INFO] F-4.** `frontend/src/app/symbol/slot-coverage.ts:87` ainda cita `EMPTY_PANEL_COVERAGE`, que virou `emptyPanelCoverage(plan)`.
5. **[INFO] F-5, worktree compartilhada.** O ` M` em `series-slots.ts` às 22:28Z que o `W-F3-REVIEW.md:7` registra foi a **minha** sonda de `scope-resolve` (uma linha `// qa-probe`), restaurada por `git checkout`. Todas as minhas mutações foram restauradas, e no fim o `git status` mostra só o `W-F3-REVIEW.md` (`??`).

Veredito: **NEEDS_FIX**. É um ciclo curto e não toca produção.
Ações:
1. `frontend/e2e/scope-map.tsv`: acrescentar `43` às linhas 32–38 (o bloco de eixo e paginação; o mínimo é a linha 35, `use-history-pager.ts`), com a evidência `grep -l 'series-history' e2e/43*`. Editar o mapa leva o diff a COMPLETO, e o verify da wave já é completo.
2. `docs/INDEX.md`: corrigir o horário das 2 linhas novas (T-03.1 e T-03.2) para o horário real.
3. (Recomendado) `client-import-graph.test.ts`: trocar o filtro por `isBuiltin(specifier)` de `node:module`, com um caso MORDE de `"crypto"` sem prefixo.

---

## 1. Os testes que rodaram

```
# cwd frontend/, um arquivo por vez: node --conditions=react-server --test src/app/symbol/<f>.test.ts  [MEDIDO 2026-10-03]
ssr-pager-characterization 5/0 · indicators/catalog 10/0 · panel-assembly 15/0 · slot-coverage 21/0
chart/axis/timeframe-window 14/0 · volume-legend-grid-contract 4/0 · view-model 24/0 · chart/history/series-slots 6/0
history-pager-requests 2/0 · client-import-graph 2/0 · cvd-pane-dom-contract 11/0 · liquidation-pane-dom-contract 13/0
long-short-pane-dom-contract 11/0 · oi-pane-dom-contract 12/0 · indicator-isolation-rule 5/0
→ 15 arquivos, 155 pass, 0 fail (universo: os 14 *.test.ts que o diff cria ou altera + a regra de isolamento)
npx tsc -p tsconfig.json --noEmit --strict → rc=0, 0 linhas · npx eslint src e2e/43-…spec.ts → rc=0
```

**e2e**, um spec por vez, sob `flock …/scratchpad/e2e.lock`, com `E2E_API_PORT=8903` e `E2E_NEXT_PORT=4403`:

| spec | árvore | resultado | log |
|---|---|---|---|
| 43 | HEAD `91ed58f0` | **1 passed (21.1s), rc=0**. `requests_per_page` = 2 janelas × **10 pedidos / 10 ids distintos**, e `history_pages_drawn=2` | `scratchpad/qa-f3-e2e43-base.log` |
| 43 | mutação QA-T33a | **1 failed, rc=2**. *"a página … fez 9 pedidos"*, `Expected: 10 · Received: 9` | `scratchpad/qa-f3-e2e43-mut.log` |
| 21 | HEAD | **2 passed (6.8s), rc=0** | `scratchpad/qa-f3-e2e21.log` |

⚠️ O swap da máquina estava **4/4 GB** (`free -g`) durante as rodadas. Nenhuma delas mede latência.

## 2. Mutações refeitas por mim

Apliquei uma mutação por vez e restaurei cada uma com `git checkout -- <arquivo>`. No fim, `git status` mostra só o `W-F3-REVIEW.md` do revisor.

### 2.1 T-03.1: a caracterização SSR = pager

Nenhuma destas 5 mutações está na matriz do builder:

| id | onde | mutação | resultado |
|---|---|---|---|
| QA-M1 | `panel-assembly.ts` | `wirePoints` do OI sem o filtro `value !== null` | **4/1**, `CA-10 OI` |
| QA-M2 | `panel-assembly.ts` | `zeroPoints` da liquidação = `countPresentSlots` | **4/1**, `CA-10 liquidation` |
| QA-M3 | `panel-assembly.ts` | `ageMs` do L/S contra `windowEndMsExclusive` | **4/1**, `CA-10 long/short` |
| QA-S1 | `page.tsx` (SSR) | `cvdAnchorMs` + 1 min | **4/1**, `CA-10 CVD` |
| QA-S2 | `page.tsx` (SSR) | `partialCoverage` do CVD com a grade do OI | **4/1**, `CA-10 CVD` |

Cada mutação derruba só o caso do seu indicador. O limite declarado pelo builder (§7) continua valendo: a semente do pager é **transcrita** (`pagerSeedOf`). Uma mutação em `SymbolClient.tsx::historyPagingSeed` não é vista aqui, e quem a vê é só o e2e.

### 2.2 T-03.2: o catálogo

| id | mutação em `catalog.ts` | catalog.test | T-03.1 |
|---|---|---|---|
| QA-C1 | o L/S perde `keyMatchesSymbol` | **9/1** (`RN-12 long_short`) | 5/0 |
| QA-C2 | o predicado do OI aceita também a chave do CVD | **8/2** (`RN-12 oi`, rota) | 0/5 (a rota fica ambígua) |
| QA-C3 | `derive.pager` do CVD perde `panels.cvd` | **9/1** (`derive`) | 5/0 |

### 2.3 T-03.3: tabela, P2 e `node:crypto`

| id | mutação | resultado |
|---|---|---|
| **QA-T33a** (DoD) | `use-history-pager.ts`: `historyFetchPlan(table).slice(0, -1)` (o plano sem `cvd/cvd`) | **e2e 43: 9 contra 10, rc=2**. `history-pager-requests` dá 1/1 (`series record: no value under cvd/cvd`) |
| **QA-T33b** (DoD) | `use-history-pager.ts` importa `INDICATOR_CATALOG` | `npx eslint`: **rc=1**, `ADR-050/D6 P2 … chart/** … may not import symbol/indicators/catalog.ts` |
| **QA-T33c** | `view-model.ts` volta a ter `export { computeSeriesKeyId } from "./series-key-id.ts"` | `client-import-graph` **1/1**: `node:crypto <- SymbolClient.tsx -> use-history-pager.ts -> panel-assembly.ts -> view-model.ts -> series-key-id.ts` |
| QA-T33c2 (sonda) | `view-model.ts` + `import { createHash } from "crypto"` (sem prefixo) | **2/0 verde, eslint rc=0** → F-3 |

Pus a mutação da tabela no **pager**, e não em `series-slots.ts` como o builder, de propósito. É o arquivo que o `scope-map` não liga à 43 (F-1), e a e2e reprovou mesmo assim, porque o `E2E_SPECS` foi explícito.

## 3. Os julgamentos pedidos

### `missingDays`/`coveredDays` (Q-8): campo morto, não é gatilho do portão da T-03.1

Medi com `grep -rnE 'missingDays|coveredDays|MissingDays|CoveredDays' frontend/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts'`. Só aparecem produtores (`page.tsx:674-677`, `panel-assembly.ts:232-235`, `view-model.ts:128-144`, `s2-cvd.ts`, `s2-oi-loader.ts`) e transportadores (`s2-panels.ts`). Não há leitor em `.tsx`, e o mesmo grep em `frontend/e2e` dá 0. `SymbolClient.tsx:3333` desenha `pager.assembly.panels`, então o valor SSR é descartado antes de qualquer pixel `[MEDIDO 2026-10-03]`.

**Leitura:** a diferença não muda comportamento visível, e por isso **não dispara** o "a fase PARA" da T-03.1. `[INFERRED: campo sem leitor em src nem em e2e ⇒ nenhuma tela muda]`. A exclusão (`DAY_LIST_KEYS`) é honesta: está declarada e é mordida pela ablação `A-DAYS` do builder.

**Recomendação para a F4 (CVD) e a F5 (OI):** **apagar** os campos nos dois produtores, em vez de escolher um lado. Apagar campo sem leitor não muda comportamento, enquanto escolher o valor do SSR seria adotar uma semântica que hoje nenhuma tela exerce. Se o owner quiser os dias na tela, aí é `Q-8` de verdade. A decisão é do orquestrador ou do owner, não minha.

### D_3: 35 → 35 é honesto, e é o **mesmo conjunto**, não só a mesma contagem

Rodei o comando do `FRONTEND-ARCH-estudo.md:579-582` (`scratchpad/qa-d3.sh`) por commit:

| rev | normalização do estudo | + `[a-zA-Z]+Rows` → `R` |
|---|---|---|
| `ff94cbb7` (base) | 39 | 35 |
| `1ce52ae7` | 39 | 35 |
| `3274594c` | 39 | 35 |
| `91ed58f0` (HEAD) | **31** | **35** |

`diff` entre os conjuntos de 35 linhas de `3274594c` e de HEAD dá **rc=0, idênticos**. A queda 39 → 31 é artefato da renomeação `rows.x` → `xRows`. A PR deve registrar os dois números, o 39 → 31 do estudo e o 35 → 35 da normalização ajustada, com essa explicação. Não se deve publicar o 31 como se fosse redução de duplicação.

### B: 87.947 → 88.743 B, dentro do teto, e todo o aumento vem da T-03.3

Medi com o instrumento do builder (`scratchpad/t033-measure.sh`: `next build` e gzip do maior chunk com `data-fact`), sobre `git archive <rev>`, sob o flock:

```
ff94cbb7 → 87.947 · 1ce52ae7 → 87.947 · 3274594c → 87.947 · 91ed58f0 → 88.743      [MEDIDO 2026-10-03, n=1 cada, rc=0]
createHash|node:crypto no chunk = 0 nos 4
```

- A T-03.1 e a T-03.2 dão **ΔB = 0**, agora medido (o builder tinha `[INFERRED]`). Os três primeiros commits geram o **mesmo chunk** (`25rvxd3lgj0rs.js`).
- A T-03.3 dá **ΔB = +796 B (+0,91%)**. A F3 não é fatia de movimento, então o sinal de 1% de `SPEC-011 §7.4` nem se aplica, e ela ficou abaixo dele mesmo assim.
- Contra o `B0` de `CA-15` (87.164, `F1-base.md:41`), o acumulado é +1.579 B (+1,81%). A folga até 90.651 é de **1.908 B** para F4–F9. É apertada se alguma fatia de movimento crescer.
- ⚠️ O `87.834` do `W-F2-QA.md:19` saiu de **outro** instrumento e não é comparável com estes números. Pelo instrumento daqui, o fim da F2 mede 87.947.

### A e2e/43 e o `scope-map.tsv`: **precisa de linha** (F-1)

Vale para os arquivos com linha própria, e o pager tem uma (`:35`). Os outros três arquivos de produção que mudam o plano (`series-slots.ts`, `panel-assembly.ts`, `catalog.ts`) não têm linha e caem em `@rota:symbol 08+`, que alcança a 43. O próprio comentário do bloco (`:31`, *"the shared time axis and history paging"*) descreve a 43.

## 4. Doc delta

- `docs/INDEX.md`: 3 linhas **acrescentadas**, nenhuma reescrita (`git diff ff94cbb7 HEAD -- docs/INDEX.md`, só `+`). O horário de 2 delas está errado (F-2).
- `series-key-id.ts`: o cabeçalho foi corrigido junto com a saída do reexport. Está certo.
- `scope-map.tsv`: o "sem mudança" foi justificado com uma premissa falsa (F-1).
- SPEC, ADR e `STITCH_CONTEXT`: sem mudança, o que está correto. `series-slots.ts` aplica `SPEC-011 §3` e `ADR-050/D5/D6`, e não há mudança visual.
- Não existe Playwright MCP nesta instalação, então não exigi prova ao vivo. O portão é a e2e versionada.

---

## Adendo do orquestrador (2026-10-03): os três achados, corrigidos e medidos (commit `ac501455`)

| achado | correção | prova `[MEDIDO, n=1]` |
|---|---|---|
| **F-1**: a e2e/43 estava fora do mapa | `43` entra nas linhas 32–38 de `frontend/e2e/scope-map.tsv`, as linhas do eixo e do pager | Somei um comentário de sonda a `use-history-pager.ts` e rodei `VERIFY_BASE=HEAD bash scripts/scope-resolve.sh`: deu `e2e=ESCOPO`, e `e2e/43` aparece **1×** em `e2e_specs`. Revertido, `git status` limpo. |
| **F-2**: horário no futuro no INDEX | As 3 linhas da F3 passam a ter o horário do commit, convertido para UTC: `1ce52ae7` 21:47Z, `3274594c` 22:01Z, `91ed58f0` 22:27Z | Nenhuma das 3 linhas está em `origin/master` (`git show origin/master:docs/INDEX.md \| grep -c …` → `0`), então a correção não reescreve linha publicada. |
| **F-3**: o grafo do cliente não via builtin sem prefixo | Agora o filtro usa `isBuiltin` de `node:module` em vez de `startsWith("node:")` | Com `import "crypto";` em `panel-assembly.ts`, o teste dá **rc=1** e nomeia `crypto <- SymbolClient.tsx -> use-history-pager.ts -> panel-assembly.ts`. Na árvore limpa dá **rc=0**. Restaurado, `cmp` rc=0. |

**Condição para o gate de QA:** com F-1, F-2 e F-3 fechados, o NEEDS_FIX vira APPROVED. Falta o `VERIFY_FORCE=1 make verify` da fase sobre a branch, já com o master mesclado, depois do merge da wave 2 da pirâmide.
