# `estrutura-do-front` — handoff do `/pm` para o `/architect`

**PRD:** [`docs/specs/PRD-011-estrutura-do-front.md`](../../specs/PRD-011-estrutura-do-front.md) · **estado ao entregar:** `PRD_DRAFT`
**Entrada:** [`handoff/FRONTEND-ARCH-estudo.md`](handoff/FRONTEND-ARCH-estudo.md) · [`handoff/DECISOES-OWNER.md`](handoff/DECISOES-OWNER.md) ·
[`gates/FRONTEND-ARCH-estudo.md`](gates/FRONTEND-ARCH-estudo.md) · [`ADR-050`](../../adr/ADR-050-indicador-como-modulo-isolado-nucleo-do-grafico-e-catalogo-por-selecao.md) (**proposta**)

## 1. O que muda frente ao estudo

Nada no desenho. O PRD toma a `ADR-050` como está e a transforma em 11 stories (uma por fatia, F0–F10) e 15 critérios com a coluna
"morde". A F11 do estudo saiu do escopo por `O-2` (PRD §11, NG-1 e NG-10).

## 2. O que o PRD deixou para você

| id | pergunta | classe | PRD |
|---|---|---|---|
| `Q-1` | como o CA-12 e o CA-14 mudam a seleção sem UI: *handle* de teste no build de e2e, ou só unitário e o e2e vai para a F1 de `indicadores-smc` | bloqueante de F9 (critério) | §14 |
| `Q-2` | a F10 depende da `ADR-048/D8`; espera ou passa para `indicadores-smc` | bloqueante de F10 | §14 |
| `I-2` | o teto de 350 linhas é duro (CA-5) | inferível | §12 |
| `I-3` | tolerância de ±2% no bundle (RNF-3, CA-15) | inferível, sem precedente | §12 |

## 3. O que não é seu

`Q-4` (aceitar a `ADR-050`) é do **owner** e bloqueia o gate `spec`. `Q-3` e `Q-7` são do `/architect` de `indicadores-smc`.
`Q-5` e `Q-6` são do `ui-designer` + `ux-ui-mastery`, e não pesam enquanto não houver seletor.

## 4. Sequência

Só a F0 corre antes da fase `05` de `paineis-de-fluxo` chegar a `origin/master` (PRD RN-11, G-2).
