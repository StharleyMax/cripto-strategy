# W5-QA-FIX: builder (wave `W5`, `paineis-de-fluxo` fase `04`)

**Entrada:** `handoff/W5-QA.md` (tentativa 1, PARCIAL, **sem veredito**; 3 candidatos não confirmados).
**Worktree:** `.claude/worktrees/wave-paineis-f04` (`wave/paineis-f04`, base `b465ae4`) · portas 8842/4342.

## O que foi medido de cada candidato

| cand. | medida | resultado |
|---|---|---|
| **W-b** (E, F viraram mutação nula no e2e) | `mut-e2e.sh` contra `e2e/24 -g "T-01.11-FIX"`, cada mutação revertida | **CONFIRMADO.** E (tirar `createPanesBeforeSeries(…)`) → `1 passed`; F (tirar `priceFormat: unlabeledTickPriceFormat(),`) → `1 passed`. O comentário do teste dizia *"Bites"* para as duas. |
| W-b, onde elas mordem de verdade | `node --conditions=react-server --test --test-reporter=tap` sob cada mutação | E → `not ok 4 - the host creates every pane…` (`pane-scale-isolation.test.ts`); F → `not ok 2 - MF-2: the host builds the liquidation bar series…` (`unlabeled-tick-format.test.ts`). Pino de fonte, não de pixel. |
| **W-c** (rótulo do crosshair no eixo com o ponteiro na metade de baixo) | teste novo `e2e/24` "RN-3": diff de pixel da célula do eixo, repouso × ponteiro | **REFUTADO no código atual:** OI (controle) 1407 px mudam; liquidação 0/0/0 em 0,25/0,75/0,9 da altura. Motivo lido na lib: escala overlay não tem eixo, e o `right` do pane está vazio (`CrosshairPriceAxisView`, `isEmpty()`, `lightweight-charts.development.mjs:1046`). |
| W-a (interruptores de ablação na URL) | `grep -rhno '"e2e[A-Z][A-Za-z]*"' frontend/src` | 5 interruptores, 3 já no `master`. Precedente existe ⇒ **WARNING, não corrigido aqui.** |

## O conserto

1. `frontend/e2e/24-single-chart-axis-and-legend.spec.ts`: o comentário do `T-01.11-FIX` deixa de afirmar que E e F
   mordem, e aponta os dois pinos unitários que mordem (com a medida acima).
2. Mesmo arquivo, **teste novo `RN-3`**: com o ponteiro nas metades de cima e de baixo do pane de liquidação, a
   célula do eixo de preço não muda; com o ponteiro no OI, muda (controle positivo). **Reprova sem a proteção:**
   mutação G (`LIQUIDATION_SCALE_IDS.up.bars = "right"`) → liquidação **987/987/987 px**, `RN-3` **✘**, e o
   `T-01.11-FIX` **✓** sob a mesma mutação (o eixo em repouso continua sem rótulo, porque os ticks ficam em branco).
   Ou seja, o teste novo pega o que o antigo não pegava.
3. `frontend/src/app/symbol/unlabeled-tick-format.ts`: só a docstring. O formato virou defesa em profundidade, e o
   texto diz isso agora.

Produção: **zero linha de código mudou** (só comentário). Nenhum defeito de produto foi confirmado na W5.

## Doc delta

- `docs/INDEX.md`: +1 linha (este laudo).
- STITCH_CONTEXT / DESIGN_SYSTEM: sem mudança, porque nada visual mudou.
- ADR: não é necessária, porque a mudança é de teste e de comentário.
