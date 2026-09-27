# W5-REVIEW — review arquitetural da wave W5 (fase 04, liquidação num pane)

**Feature:** `paineis-de-fluxo` · **Base:** `a2d7c66` (`wave/paineis-f04`), diff `master...wave/paineis-f04`
(merge-base `613719a`, **66** arquivos) · **Data:** 2026-09-27 · **Revisor:** `/review` (read-only; não roda `gate-record`)
**Contra:** plano `04_liquidacao_num_pane.md` (itens 4.1–4.5, DoD 1–7), refs de `T-04.0`…`T-04.7` em
`harness tasks json paineis-de-fluxo` (o campo `dod` vem vazio; o DoD de cada task está em `refs`), `SPEC-009` §5 e §7,
`ADR-044` D3′/D4/F-6, `ADR-003` FR-1/FR-2, `ADR-045` (sem superfície tocada nesta wave), `CLAUDE.md` e
`handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## 0. Veredito: **COMPLIANT**

Nenhuma das 8 regras bloqueantes foi violada, e nenhum limite de camada declarado foi cruzado. Há **1 WARNING novo**
(idioma de comentário, que é convenção e não portão) e **2 WARNING herdados** da W4 que continuam abertos.

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only --diff-filter=d master...HEAD \| grep -E '^(frontend/src\|frontend/e2e\|backend\|deploy)/'` + `harness rules --mode file --path <f>` | **24** arquivos (+1 apagado, `liquidation-geometry.test.ts`) | **24/24 rc=0, 0 achados** `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]`, **0** em arquivo do diff (`grep -F "<f>:"`) `[MEDIDO]` |
| unitárias da fase | `node --test` em `liquidation-pane-geometry`, `liquidation-legend-swatch`, `liquidation-pane-form`, `liquidation-pane-dom-contract`, `pane-registry`, `unlabeled-tick-format` (`.test.ts`) | 72 | **72 pass / 0 fail** `[MEDIDO]` |
| append-only | `git diff master...HEAD -- docs ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'` | INDEX, SPEC-009, 3 handoffs | **0** linhas removidas `[MEDIDO]` |

`make verify` não foi rodado por este portão. A evidência está em `T-04.6-builder.md` §2.5 (rc=0, 8 portões) `[DOC]`, e o
verify da cabeça da wave é do `W5-QA`, que em `handoff/W5-QA.md` ainda aparece parcial.

## 2. Mutação rodada por mim (numa cópia em scratchpad, a worktree não foi tocada)

| mutação | alvo | suíte | resultado |
|---|---|---|---|
| nenhuma (baseline) | — | `liquidation-pane-geometry.test.ts` | 14 pass / 0 fail |
| negar a perna `down` no feed (`ADR-044/D4`, `RN-3`) | `liquidation-pane-geometry.ts:417` | idem | **7 fail** `[MEDIDO]` |
| máximo só da 1ª perna (`C-3`) | `:472` `present` → `present.slice(0, 1)` | idem | **2 fail** `[MEDIDO]` |
| trocar o `scale_ref` das duas pernas (`CA-LIQ`, `SPEC-009` §7.1) | `pane-registry.ts:133-136` | `pane-registry.test.ts` | **2 fail** (33 pass na árvore original) `[MEDIDO]` |

## 3. A arquitetura declarada, item por item

| contrato | onde está declarado | evidência no código | estado |
|---|---|---|---|
| perna long desce por `invertScale`, e nenhum valor `< 0` entra em `setData` | `ADR-044/D4`, `SPEC-009` §7.2 | `LIQUIDATION_INVERTED_SIDE` (`liquidation-pane-geometry.ts:110`); `positiveValueSeriesLossless` + `countNegativeFeedValues` com `throw` (`:417-425`); o `SymbolClient` só alimenta por `liquidationPaneFeeds` (`SymbolClient.tsx:2979`) | conforme |
| 6 séries e 4 escalas, com o par ausência/zero de cada perna do seu lado | `ADR-044/D4` razão 3, `SPEC-009` §7.3 | `LIQUIDATION_SCALE_IDS` com 2×(bars, marks); 3 feeds por perna (`:416-420`); cadeia estrita de bandas (`:179-205`) | conforme |
| (iii′) toda `histogram` FLOW tem o par | `ADR-044/D3′` | 2 testes novos com FAILS (`pane-registry.test.ts`), o fixture usa `LIQUIDATION_LEG_SCALE_REF` de produção (`:186-191`) | conforme |
| short em cima no token de alta, long embaixo no de baixa, e reverter é trocar `scale_ref` | `SPEC-009` §7.1 `[DECISÃO-OWNER 2026-09-23]` | `LIQUIDATION_LEG_SCALE_REF` é o único lugar (`pane-registry.ts:133`); escalas nomeadas por lado e não por coorte; tinta e quadrado seguem o lado (`LIQUIDATION_BAR_COLOR_ROLE`, `LIQUIDATION_SWATCH_FORM_BY_SIDE`) | conforme |
| `charts` não importa de `web` nem faz I/O; `web` não calcula geometria | `ADR-003` FR-1/FR-2 | `grep` de import de `app/` em `src/charts` = 0 fora do teste de fronteira; o módulo não importa `lightweight-charts`; `web` só passa a forma (`liquidation-pane-form.ts`, valores do `design_gate`) e aplica margens que o `charts` calculou (`applyLiquidationScales`) | conforme |
| `web` consome `charts` pela superfície pública | `ADR-003` | os 4 imports novos vêm de `../../charts/index.ts`, e a seção 10 do `index.ts` reexporta o módulo | conforme |
| `pane_id` em inglês, `data-testid` derivado dele, 5 panes | `SPEC-009` §5, plano DoD 5 | `PaneId` = 5 chaves; a exceção `liquidation-cohort-*` saiu de `paneLayerTestId` | conforme |
| peso e forma decididos pelo `design_gate` | `SPEC-009` §5 (`stretch`), `[Q-DG-2]`, `CLAUDE.md` §Design | `T-04.4-design-gate.md` §9 APPROVED; nota append em `SPEC-009:400-405`; `T-04.7` APPROVED WITH CONDITIONS 65/100 | conforme |
| microcopy pt-BR, código e mensagens de exceção em inglês | `CLAUDE.md` tabela, linhas 1, 8 e §Mensagem de exceção | as mensagens novas de `throw`/`Error` em `src` e `e2e`: **0** em português (grep nas linhas `+`) `[MEDIDO]` | conforme |
| interruptores de ablação lidos da URL em produção | — (nenhum documento proíbe) | `SymbolClient.tsx:1724,1736`. O precedente está no `master` (`axis-sync.ts:120`, `host-series-feed.ts:32,40`) | não é achado |

DoD 1–6 do plano: `T-04.6-builder.md:24-31` os marca todos, com n real (CA-LIQ **32** buckets, CA-9′(c) **3**, DoD-2
**832/829**) e as três ablações reprovando `[DOC]`. Não repeti o Playwright. Esse é o portão do QA.

## 4. Achados (nenhum bloqueante)

1. **[WARNING-1, novo]** Comentário novo em português, em código e em e2e. — `frontend/src/charts/index.ts:250`
   (cabeçalho `// ── 10. o pane de liquidação fundido`, no estilo local das seções 1–9); `frontend/e2e/32-liquidation-fused-pane-sides.spec.ts:1-29`
   (docstring do arquivo); `frontend/e2e/13-liquidacoes-dado-real.spec.ts:507,830` (18 linhas `+` de comentário em PT nos
   e2e 13/23/24) — `CLAUDE.md` §"A tabela de fronteira", linha 5 (convenção, não portão). **Correção:** traduzir o
   cabeçalho e as docstrings novas na próxima edição. Os e2e 31, 33, 34 e 35 e os módulos novos de `src` já nasceram em inglês.
2. **[WARNING, herdado de W4-REVIEW-r2 WARNING-4]** Docstring em PT. — `SymbolClient.tsx:1865` (era `:1786`) — mesma linha 5.
3. **[WARNING, herdado de W4-REVIEW-r2 WARNING-1]** A troca da forma da D3 continua sem registro. —
   `handoff/DESIGN-LAYOUT.md:39`, que esta wave não tocou (`git log master..HEAD` vazio) — `ADR-010` §D-2.

Estes candidatos ficam **fora do veredito** porque não têm regra nem documento que os torne violação, e são do QA:
os itens W-b e W-c de `handoff/W5-QA.md:46-52` (mutação nula de E/F; rótulo do crosshair na metade de baixo, que tocaria
`RN-3` **se** aparecer). Este portão não os mediu `[NÃO MEDIDO]`.
