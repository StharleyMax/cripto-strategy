# W5-REVIEW-r2 — revalidação arquitetural da wave W5 (fase 04, liquidação num pane) após o W5-QA-FIX

**Feature:** `paineis-de-fluxo` · **Base:** `cd8969a` (`wave/paineis-f04`), diff `master...wave/paineis-f04`
(merge-base `613719a` = `master`, **71** arquivos) · **Data:** 2026-09-27 · **Revisor:** `/review` (read-only; não roda `gate-record`)
**Contra:** plano `04_liquidacao_num_pane.md` (DoD 1–7), refs de `T-04.0`…`T-04.7`, `SPEC-009` §5 e §7, `ADR-044` D3′/D4,
`ADR-045` (sem superfície tocada), `ADR-003` FR-1/FR-2, `CLAUDE.md` e `handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.
**Anterior:** `gates/W5-REVIEW.md` (em `a2d7c66`: COMPLIANT). Esta revisão cobre a wave inteira de novo pelo runner e
**a delta `a2d7c66..cd8969a` pela arquitetura**.

## 0. Veredito: **COMPLIANT**

Nenhuma das 8 regras bloqueantes foi violada, e nenhum limite de camada declarado foi cruzado. A delta do `W5-QA-FIX`
(`96f5303`) é **só teste e comentário**: nenhuma linha executável de `frontend/src` mudou. Os **3 WARNING** do r1 seguem
abertos, sem mudança, e nenhum achado é novo.

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only --diff-filter=d master...HEAD \| grep -E '^(frontend/src\|frontend/e2e\|backend\|deploy)/'` + `harness rules --mode file --path <f>` | **24** arquivos (+1 apagado, `liquidation-geometry.test.ts`) | **24/24 rc=0, 0 `[BLOQUEIO]`** `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]`, **0** em arquivo do diff (`grep -cF "<f>:"`) `[MEDIDO]` |
| delta desde o r1 | `git diff --stat a2d7c66..HEAD -- frontend/` | 2 arquivos | `e2e/24` (+1 teste `RN-3`, comentário corrigido); `unlabeled-tick-format.ts` (+7 linhas, **só docstring**) `[MEDIDO]` |
| unitárias | `npm run test:charts` ; `npm run test:app` (em `frontend/`, na cabeça da wave) | 337 + 586 | **337/0** e **586/0** (pass/fail) `[MEDIDO]` |
| append-only | `git diff master...HEAD -- docs ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'` | INDEX, SPEC-009, handoffs | **0** linhas removidas `[MEDIDO]` |

`make verify` e Playwright não foram rodados por este portão: são do QA. `W5-QA-r2.md:22` dá **APPROVED** com verify VERDE
e 12/12 mutações mordendo `[DOC]`.

## 2. Mutação (cópia de `frontend/` em scratchpad; a worktree não foi tocada)

O `W5-QA-FIX` trocou a afirmação *"Bites"* do `T-01.11-FIX` por *"o que rejeita a remoção é o pino de fonte da suíte
unitária"*. Conferi a afirmação nova em vez de relê-la:

| mutação | alvo | suíte | resultado |
|---|---|---|---|
| nenhuma (baseline) | — | `pane-scale-isolation.test.ts` + `unlabeled-tick-format.test.ts` | 6 pass / 0 fail |
| **E**: tirar `createPanesBeforeSeries(…)` | `SymbolClient.tsx:1100` | idem | **1 fail** (`not ok 4 - the host creates every pane…`) `[MEDIDO]` |
| **F**: tirar `priceFormat: unlabeledTickPriceFormat(),` | `SymbolClient.tsx:2928` | idem | **1 fail** (`not ok 6 - MF-2: the host builds the liquidation bar series…`) `[MEDIDO]` |

As 3 mutações do r1 (`ADR-044/D4` perna `down`, `C-3`, `CA-LIQ` `scale_ref`) continuam valendo sem nova rodada, porque
`git diff a2d7c66..HEAD -- frontend/src` não toca nenhum dos três alvos (só a docstring de `unlabeled-tick-format.ts`).
A mutação G do teste `RN-3` novo (`LIQUIDATION_SCALE_IDS.up.bars = "right"`) é Playwright e é do QA; não a repeti
`[NÃO MEDIDO por este portão; DOC: W5-QA-FIX-builder.md, 987/987/987 px]`.

## 3. A delta contra a arquitetura declarada

| contrato | onde está declarado | evidência | estado |
|---|---|---|---|
| nenhum valor com sinal no pane de liquidação, nem por rótulo de eixo | `SPEC-009` §7.2, `ADR-044/D4`, `RN-3` | o teste `RN-3` novo compara pixel da célula do eixo em repouso e sob ponteiro nas duas metades, com controle positivo no OI | conforme; é teste, não muda o contrato |
| `web` consome `charts` só pela superfície pública; `charts` não importa de `web` | `ADR-003` FR-1/FR-2 | a delta adiciona **0** import (`git diff a2d7c66..HEAD -- frontend/e2e/24… \| grep -cE '^\+.*import'`) | conforme |
| comentário e docstring em inglês | `CLAUDE.md` tabela de fronteira, linha 5 | as 31 linhas `+` de comentário da delta (`git diff a2d7c66..cd8969a -- frontend/ \| grep -cE '^\+\s*(//\|\*)'`) estão em inglês | conforme |
| a spec do teste lê o app, não semeia banco | `REGRAS-DE-DESPACHO` §4 | o teste só lê canvas e move o ponteiro (`page.evaluate`, `page.mouse.move`) | conforme |

O resto (§3 do r1: D4, D3′, §7.1, FR-1/FR-2, `pane_id`, `design_gate`, microcopy) continua como o r1 mediu, porque
nenhum desses alvos está na delta.

## 4. Achados (nenhum bloqueante; todos herdados do r1, nenhum novo)

1. **[WARNING, herdado de W5-REVIEW WARNING-1]** Comentário em português, em código e em e2e. — `frontend/src/charts/index.ts:250`
   (`// ── 10. o pane de liquidação fundido`), `frontend/e2e/32-liquidation-fused-pane-sides.spec.ts:1-29`,
   `frontend/e2e/13-liquidacoes-dado-real.spec.ts:507,830` — `CLAUDE.md` §"A tabela de fronteira", linha 5 (convenção,
   não portão). **Correção:** traduzir na próxima edição desses arquivos.
2. **[WARNING, herdado de W4-REVIEW-r2 WARNING-4]** Docstring em PT. — `frontend/src/app/symbol/SymbolClient.tsx:1865` — mesma linha 5.
3. **[WARNING, herdado de W4-REVIEW-r2 WARNING-1]** A troca da forma da D3 continua sem registro. —
   `handoff/DESIGN-LAYOUT.md:39`, que a wave não tocou (`git diff --stat master...HEAD -- …/DESIGN-LAYOUT.md` vazio) — `ADR-010` §D-2.

Os candidatos W-b e W-c do `handoff/W5-QA.md` ficaram resolvidos pelo QA-FIX: W-b porque o comentário foi corrigido e os pinos
unitários mordem (§2); W-c porque o teste `RN-3` o refuta no código atual `[DOC: W5-QA-FIX-builder.md]`. O W-a
(interruptor de ablação lido da URL) **não entra no veredito**: nenhum documento o proíbe, e o precedente está no `master`.
