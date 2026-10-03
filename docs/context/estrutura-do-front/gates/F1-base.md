# F1-base — condição de entrada `G-2` e números de base da F1 (`T-01.1`)

> Feature `estrutura-do-front` · fase `01` · componente `web` · agente `frontend-builder` · 2026-10-03
> Ledger no início: `harness pipeline state estrutura-do-front` → `BUILD_AUTHORIZED` `[MEDIDO]`
> **Commit-base da F1:** `d54e59be` (`wave/estrutura-f00` com `origin/master` `358b1b55` fundido — PRs até `#241`, fases `05` e `06` de
> `paineis-de-fluxo`). `$BASE` = `git merge-base HEAD origin/master` = `358b1b55` · branch `task/T-01.1`
> Tracker: a task está **sem card** (`untracked_note` do `tasks.toml`).
> **Nenhum arquivo de `frontend/` mudou** nesta task: só este relatório e uma linha em `docs/INDEX.md`.

## 1. `G-2` — as duas metades, e elas divergem

| metade | comando | resultado |
|---|---|---|
| (a) wave mergeada | `git fetch origin && git merge-base --is-ancestor origin/wave/paineis-f05 origin/master` (head da wave = `a3c0c84b`, igual local e remoto) | **`rc=0`** `[MEDIDO]` |
| (b) tasks `done` no `origin/master` | `git show origin/master:docs/context/paineis-de-fluxo/tasks.toml \| grep -nA4 'id = "T-05\.[1-6]"' \| grep -E 'id =\|status ='` | **`T-05.1`…`T-05.6` todas `status = "todo"`** (linhas 740, 753, 767, 779, 792, 860) `[MEDIDO]` |
| ledger da outra feature | `harness status` (bloco `paineis-de-fluxo`) | `f05·QA=APPROVED`, `f05·REVIEW=COMPLIANT`, `f06·QA=APPROVED`, `f06·REVIEW=COMPLIANT`; estado `BUILD_AUTHORIZED`, aguardando o owner rodar `advance DONE` `[MEDIDO]` |

**A divergência, declarada e não resolvida.** A letra do `G-2` (`SPEC-011 §9`/`G-K`, `refs` da `T-01.1`) exige `T-05.1`, `T-05.4` e `T-05.5` com
`status = "done"` no `tasks.toml` de `paineis-de-fluxo` em `origin/master`. Isso **não** está satisfeito: o arquivo diz `todo`. O que **está**
satisfeito é o que a cláusula queria proteger — o código da fase `05` está em `origin/master` (metade a) e o ledger tem o gate da fase `05`
aprovado. O `tasks.toml` daquela feature ficou atrás do ledger dela `[INFERRED: o status das tasks não foi atualizado no fechamento das waves
W7/W8; ver MEMORY gate-record-e-por-fase-nao-por-task]`.

**Quem resolve não é esta task:** o arquivo é de `paineis-de-fluxo`, e a decisão de aceitar a metade (b) pelo ledger em vez do `tasks.toml` é do
orquestrador/owner. A ablação da `T-01.1` só manda **parar** se a metade (1) — a ancestralidade — der `rc=1`; ela deu `rc=0`, e por isso os
números abaixo foram medidos.

## 2. Os números de base, no commit-base `d54e59be`

Comandos rodados de dentro da worktree `ef-t01`, árvore limpa (`git status --short` vazio).

| nome | comando | valor | referência `eda7520` (`SPEC-011 §8`) | Δ |
|---|---|---|---|---|
| `L0` | `wc -l frontend/src/app/symbol/SymbolClient.tsx` | **4.742** `[MEDIDO]` | 4.490 | +252 (`git diff --stat eda7520 HEAD -- …SymbolClient.tsx`: +379/−127) |
| `N_spec` | `ls frontend/e2e/*.spec.ts \| wc -l` | **42** `[MEDIDO]` | 38 | +4: `39`, `40`, `41`, `42` (`git diff --name-status eda7520 HEAD -- 'frontend/e2e/*.spec.ts'`, todas `A`) |
| `N_fact` | `node --conditions=react-server --test src/app/symbol/data-fact-ascii-key-contract.test.ts` (em `frontend/`); o `assert.equal(expressions.length, 47)` passa | **47** `[MEDIDO: 6 pass / 0 fail]` | 47 | 0 |
| `B0` | `SPEC-011 §7.4`, em `frontend/`: `rm -rf .next && npx next build`; maior (`ls -S`) de `grep -l data-fact .next/static/chunks/*.js`; `gzip -c <chunk> \| wc -c` | **87.164 B** `[MEDIDO: n=2 builds, mesmos bytes]` | 84.577 B | +2.587 B (+3,06%) |

Detalhe do `B0`: Next.js 16.3.4 (Turbopack), os dois builds `rc=0`; chunk `0701racybo1qk.js`, 276.771 B crus; 3 chunks contêm `data-fact`.

⚠️ **O `B0` que vale é este, não o de `eda7520`.** O teto de `CA-15` é `B ≤ 87.164 × 1,04 = 90.651 B` ao fim da F8 e da F9, e o sinal de
movimento das fatias F1, F4–F7 é `|ΔB| ≤ 1%` ⇒ `|ΔB| ≤ 871 B` sobre **87.164**. O salto de +3,06% entre `eda7520` e aqui é código das fases
`05`/`06` de `paineis-de-fluxo`, não desta feature.

## 3. `make e2e` no commit-base

`make e2e E2E_API_PORT=8857 E2E_NEXT_PORT=4357` (portas próprias, para não colidir com outra worktree — MEMORY `make-verify-paralelo-colide-porta-e2e`) →
**`rc=0`: 141 testes em 42 specs, 127 passed, 14 skipped, 0 failed, 9,8 min** `[MEDIDO]`. Este é o universo de `DoD-2`/`CA-1` das fases seguintes.
`git diff --numstat d54e59be..HEAD -- frontend/` vazio depois do commit desta task (só `docs/` muda). Os 10 arquivos de `frontend/` em `358b1b55..d54e59be` são da F0 (`wave/estrutura-f00`), nenhum em `frontend/e2e/`.

## 4. O portão de escrita em `frontend/src/app/symbol` — medido, sem override

O hook `PreToolUse` do plugin (`hooks/hooks.json` → `harness gate-enforce`) foi chamado **à mão** com o payload de um `Edit`, sem escrever nada:
`printf '{"tool_name":"Edit","tool_input":{"file_path":"<worktree>/<caminho>"}}' | harness gate-enforce`.

| caminho | `rc` | decisão |
|---|---|---|
| `frontend/src/app/symbol/SymbolClient.tsx` | 1 | `deny` |
| `frontend/src/app/symbol/chart/host/__probe__.ts` (inexistente, alvo da `T-01.2`) | 1 | `deny` |
| `frontend/src/app/symbol/indicators/catalog.ts` | 1 | `deny` |
| `frontend/src/charts/index.ts` | 1 | `deny` |
| `frontend/eslint-rules/indicator-isolation.js` (controle: só `estrutura-do-front` reivindica) | 0 | permite |
| `docs/context/estrutura-do-front/gates/F1-base.md` (controle: não-produção) | 0 | permite |

Motivo devolvido: *"codigo de producao (…) nao e reivindicado por exatamente uma feature autorizada (ou ha colisao de escopo)"*. A colisão,
por `harness pipeline scope <feature> list`: **`paineis-de-fluxo`** (`BUILD_AUTHORIZED`) reivindica `frontend/src/app/symbol`,
`frontend/src/charts` e `frontend/e2e`; **`estrutura-do-front`** (`BUILD_AUTHORIZED`) reivindica os mesmos três e ainda
`frontend/src/app/symbol/{indicators,chart,chrome}`. O prefixo mais longo **não** desempata (`…/indicators/catalog.ts` também é `deny`).

**Consequência para a `T-01.2`:** com o ledger de hoje, ela **não consegue escrever** em `frontend/src/app/symbol/**`. Destravam: o owner
fechar `paineis-de-fluxo` (`advance DONE`, que tira a feature de `BUILD_AUTHORIZED`), ou um `pipeline scope … remove`, ou um override
escopado. **Nenhum override foi gravado por esta task.**

## 5. Doc delta

- `docs/INDEX.md`: linha acrescentada para este relatório.
- `SPEC-011 §8` e o plano `01`: **sem mudança** — guardam a referência de `eda7520` rotulada como tal; o valor do commit-base vive aqui, como
  o `refs` da `T-01.1` manda ("Grava em `docs/context/estrutura-do-front/gates/F1-base.md` com o sha").
- ADR: não necessário — medição, nenhuma decisão.
