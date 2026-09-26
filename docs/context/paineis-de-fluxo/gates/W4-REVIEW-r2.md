# W4-REVIEW-r2 — review arquitetural da wave W4 (fase 02 + T-01.R1), revalidação depois do `W4-QA-fix`

**Feature:** `paineis-de-fluxo` · **Base:** `2b1b2f4` (`wave/paineis-f02`), diff `master...wave/paineis-f02`
(merge-base `5518e51`, 88 arquivos) · **Data:** 2026-09-26 · **Revisor:** `/review` (read-only; não roda `gate-record`)
**Contra:** o mesmo universo do r1 (`gates/W4-REVIEW.md` cabeçalho): plano `02_volume_com_direcao.md` (DoD 1–5), DoD de
`T-02.1`…`T-02.5`/`T-01.R1`, `SPEC-009`, `PRD-009`, `ADR-010/D-2`, `ADR-044`, `ADR-045`, `CLAUDE.md` e
`handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5. Mais o delta `c0d851b..2b1b2f4` (`W4-QA-fix`).

## 0. Veredito: **COMPLIANT**

Nenhuma regra bloqueante violada. Dos 6 achados do r1, **3 fecharam** (WARNING-2, WARNING-3, INFO-5) e **3 seguem abertos**
(WARNING-1, WARNING-4, INFO-6). Nenhum dos 3 é regra bloqueante.

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only master...HEAD \| grep -E '^(frontend/src\|frontend/e2e\|backend\|deploy)/'` + `harness rules --mode file --path <f>` | **27** arquivos | **27/27 rc=0, 0 achados** `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]`, **0** em arquivo do diff (`grep -F "<f>:"`) `[MEDIDO]` |
| unitárias da fase | `node --test src/charts/volume-direction.test.ts src/app/symbol/pane-legend.test.ts src/app/symbol/absence-readout-microcopy.test.ts` | 33 | **33 pass / 0 fail** `[MEDIDO]` |
| delta de código desde o r1 | `git diff --stat c0d851b..HEAD -- frontend/` | 1 arquivo | `SymbolClient.tsx` 3 linhas, só docstring (`:1728-1729`) `[MEDIDO]` |
| append-only dos docs | `git diff c0d851b..HEAD -- docs/ ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'` | MAPA, PRD-009, SPEC-009, plano 02, INDEX | **0** linhas removidas `[MEDIDO]` |

`make verify`: não rodado por este portão. Evidência do QA: `W4-QA-r2.md` §4, verde com `VERIFY_FORCE=1` `[DOC]`.

## 2. Revalidação pela mutação (REGRAS §4), não pelo relatório

O falsificador de `W4-QA-fix.md` §2, rodado **por mim** nas duas árvores (o pré-conserto extraído com
`git show c0d851b:<f>` para o scratchpad):

| árvore | resultado |
|---|---|
| `c0d851b` (antes do conserto) | **5 STALE**: `MAPA:68`, `PRD-009:194`, `PRD-009:282`, plano `02:12`, plano `02:20` `[MEDIDO]` |
| `HEAD` | **5 ok, 0 STALE** (as linhas andaram: PRD `:289`, plano `:26`) `[MEDIDO]` |

As citações das notas novas foram abertas: `T-02.2-design-gate.md` §4 (`:170`, "Decisão: B") e §8 ciclo 2 APPROVED
(`:438`); `DESIGN-LAYOUT-ux-critique-r1.md:38` (D3 ACEITO) e r2 `:117` (C-6: "o doji de volume é `#8b949e`");
`volume-direction.ts:50-56` (`volumeBarColor` → `dojiItemColors().color`); `SymbolClient.tsx:1939`
(`PriceScaleMode.Normal`). Todas resolvem `[MEDIDO]`.

## 3. Estado dos achados do r1

| r1 | estado | evidência |
|---|---|---|
| WARNING-1 (forma vazada da D3 trocada sem registro) | **ABERTO** | `handoff/DESIGN-LAYOUT.md:39` sem nota; `git log master..HEAD -- handoff/DESIGN-LAYOUT.md` vazio `[MEDIDO]` |
| WARNING-2 (doji = alta em plano/PRD/MAPA) | **FECHADO** | §2 |
| WARNING-3 (`Q-VOL-2`/`Q-DG-2` sem resposta anotada) | **FECHADO** | `PRD-009:352`, `SPEC-009:394` |
| WARNING-4 (docstring em PT) | **ABERTO** | `SymbolClient.tsx:1786` "As DUAS marcas da faixa de marcas…" |
| INFO-5 (`SEM_PONTO` obsoleto) | **FECHADO** | `SymbolClient.tsx:1728-1729` cita `ABSENCE_TOKEN` |
| INFO-6 (pareamento TF ≠ `1m` sem guarda e2e) | **ABERTO** | `W4-QA-r2.md:130` o herda como W-1 |

## 4. Achados que seguem (nenhum bloqueante)

1. **[WARNING-1, herdado]** A redundância de forma da D3 foi trocada por "a forma está na vela acima", e a troca não foi
   registrada. O `W4-DESIGN-REVIEW.md:74-75` sugere uma chave de cor na legenda, que cumpriria a WCAG 1.4.1 sem depender da
   vela (SF-15). — `frontend/src/app/symbol/SymbolClient.tsx:1977` — `handoff/DESIGN-LAYOUT.md:39` (D3) + `ADR-010` §D-2.
   **Correção:** nota datada abaixo da D3 (append), ou implementar a chave/SF-15.
2. **[WARNING-4, herdado]** Docstring reescrita na W4 continua em português. — `SymbolClient.tsx:1786` — `CLAUDE.md`
   §"A tabela de fronteira", linha 5 (convenção, não portão). **Correção:** traduzir na próxima edição do arquivo.
3. **[INFO-6, herdado]** Guarda de integração do pareamento por `time` em TF ≠ `1m` (`W4-QA.md` §8, ação 3).

## 5. O que este portão não mediu

A cor por pixel e a ablação no app real são do QA (`W4-QA-r2.md` §1-§3). O mérito estético de D3/SF-15 é do `ux-ui-mastery`.
