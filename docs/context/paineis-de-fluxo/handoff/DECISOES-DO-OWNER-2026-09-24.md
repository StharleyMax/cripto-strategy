# Decisões do owner — 2026-09-24

Retomada de `paineis-de-fluxo` a partir de `ESTADO-2026-09-23.md` (branch `wave/paineis-f01`, `9cb05a9`).

## D-1 · Onde entra a correção das 3 regressões da fase 05 de `candle-real-e-eixo-unico`

`[DECISÃO-OWNER: 2026-09-24, escolha entre alternativas apresentadas]` — **opção 1: uma fase de correção dentro
de `paineis-de-fluxo`, antes do lote 4.** Literal da escolha: *"blz, pode seguir com a recomendação 1"*.

O menu que o agente apresentou, com o custo de cada opção:

1. **Fase de correção dentro de `paineis-de-fluxo`, antes do lote 4.** Mais curta, e mexe no mesmo
   `SymbolClient.tsx` que a `T-01.5` edita. Custo: o escopo da feature passa a incluir correção de produção, e o
   plano precisa de emenda.
2. **Feature de correção nova, filha de `plataforma-dados`.** Rastro limpo, com gate próprio. Custo: passa de novo
   por PRD, SPEC e pelos gates de owner `spec` e `build`, e o lote 4 fica parado nesse meio-tempo.

As regressões são as três de `gates/DIAG-e2e-master.md` §2–§4 (e2e `18`, `16` e `20`). O desenho de cada conserto e
a emenda do plano ficam com o `frontend-architect`, e o código com o `frontend-builder` (DIAG §5).

## D-2 · Paralelismo e fecho de fase

`[PREMISSA-OWNER: 2026-09-24]`, literal:

> *"executando as atividades em parelelo com até 3 tasks ao mesmo tempo com o workflow orquestrando tudo. final de
> fase com QA e REview, tudo passando merge"*

Efeito sobre `PLANO-DE-PARALELISMO.md`:
- **R-A** passa de 2 para **≤ 3 tasks simultâneas**. As regras **R-D** (no máximo um editor de `SymbolClient.tsx`
  por lote) e **R-E** (medição de latência roda em lote solo) continuam valendo.
- Fecho de wave: QA + review aprovados ⇒ PR + merge sem esperar o owner. É a mesma regra de 2026-09-11
  (`pr-por-wave`), agora confirmada para esta feature.
