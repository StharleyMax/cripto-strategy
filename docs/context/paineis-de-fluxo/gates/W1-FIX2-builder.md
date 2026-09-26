# W1-FIX2 — correção dos 4 portões r2 reprovados da wave W1

**Feature:** `paineis-de-fluxo` · **Branch:** `wave/paineis-f01` · **Código:** `1ebee50` · **Data:** 2026-09-26 ·
**Agente:** `frontend-builder` · **Entrada:** `gates/W1-QA-r2.md`, `W1-REVIEW-r2.md`, `W1-CODE-REVIEW-r2.md`,
`W1-DESIGN-REVIEW-r2.md`

```
[QA GATE — W1-FIX2: legenda do volume na grade, piso da liquidação, emenda de D-C3.5]
Feature: paineis-de-fluxo     Componente: web (+ charts/pane-stack-layout.ts)
```

## 1. O que cada achado pediu e o que foi feito

| achado | conserto | teste que reprova sem o conserto (mutação rodada) |
|---|---|---|
| **QA-r2 BLOCKER-1 = REVIEW-r2 BLOCKER-2 = CODE-REVIEW C-1 = DESIGN MF-B′** (volume `ausente` em TF ≠ `1m`) | Caminho 2 do REVIEW: `legendSlots` = as mesmas linhas **com a janela** (`nonNegativeFlowSlotsFromHistoryRows(rows, window)`), em `[symbol]/page.tsx` e em `panel-assembly.ts`. A `<LegendValue seriesId="volume">` lê `volume.legendSlots`. As barras seguem no vetor nativo, então pixel, `presentPoints`, `firstPresentMs` e `volume_readable_horizon` **não mudam por construção**. Isenção de `view-model.ts` revogada no texto, só para a legenda | `panel-assembly.test.ts`: janela de `4h` com as barras que o QA leu da API (`34200.456`, `14515.595`). Em repouso, lê `14515.595`. Sob o crosshair, 6 índices dentro de barras leem o valor da barra. **Mutação:** tirar `s2Window` de `legendSlots` → **1 fail** / 9. `volume-legend-grid-contract.test.ts` (varredura de fonte): tirar `routeWindow.window` do SSR → **1 fail** / 4. Apontar a legenda para `volume.slots` → **2 fail** / 4 |
| **CODE-REVIEW C-2** (piso da barra de liquidação na faixa das marcas depois da compressão) | Saída (b): `PaneScaleRole.keepFloor`. Com `belowLegend`, só o teto desce (`bottom' = bottom`). A binding da barra de liquidação o declara | `liquidation-geometry.test.ts`: a role é **lida do fonte de produção**, as margens de `paneScaleMargins` são aplicadas na lib real e **lidas de volta**, com legenda de 38/54/60/70/76 px em pane de 108 px → `1 − bottom < 0,88`. MORDE: sem `keepFloor`, 54 px cruza. **Mutações:** tirar `keepFloor` da binding → **1 fail** / 15. Desligar o ramo em `pane-stack-layout.ts` → **1 fail** / 15 (geometria) e **1 fail** / 16 (`pane-stack-layout.test.ts`) |
| **QA-r2 BLOCKER-2 = REVIEW-r2 WARNING-7** (teto de `D-C3.5` sem emenda) | Nota de CORREÇÃO em `docs/specs/SPEC-008-candle-real-e-eixo-unico.md` §`D-C3.5`: regra `max(5.000, seed + 1 página)` = 6.260, código, motivo (M-A), quem escolheu (`[INFERRED: escolha de agente]`), custo medido pelo QA e resíduo W-1 | doc, sem mutação |
| CODE-REVIEW P-1 (gesto preso sem `pointerup`) | `blur` da janela também encerra o gesto | **`[NÃO MEDIDO]`**: não há teste. Uma linha, simétrica às duas existentes |
| CODE-REVIEW, convenção | 7 mensagens de `Error` novas em português (e2e 22 ×5, 23 ×1, 25 ×1) traduzidas | — |
| QA-r2 W-5 | linhas de INDEX dos laudos W1 que faltavam | — |

⚠️ `liquidation-pane-dom-contract.test.ts` conta as chamadas do mapper em `page.tsx`: o número foi de **3 para 4** e o
comentário diz por quê. Um consumidor entrou na regra, e nenhuma segunda cópia dela foi escrita.

## 2. Comandos (literais) e resultado

- `npm --prefix frontend run -s lint` (ESLint + `tsc --noEmit --strict`) → rc=0. Antes, 1 erro de import profundo
  de `charts/legend-reading.ts` no teste, trocado pelo barrel (ADR-034/D8). Esse import também derrubava 5 testes
  de fronteira em `test:charts`
- `npm --prefix frontend run -s test:app` → **561/561** · `test:charts` → **314/314** (2 rodadas)
- `E2E_API_PORT=8831 E2E_NEXT_PORT=4331 make verify` → ver §4
- mutações: `sed` no arquivo, `node --conditions=react-server --test <arquivo>`, e reversão com `sed` inverso.
  `git status` ficou limpo antes do commit

## 3. O que NÃO foi feito

- **Validação no app real com dado real** (o falsificador do `W1-DESIGN-REVIEW-r2` §8 e do `W1-QA-r2` §8.1): **não
  rodei**. Não há Playwright MCP nesta instalação, e o `make verify` ocupava o `.next` da worktree. Esse falsificador
  é do QA e do design gate, e **a mutação que eles pedem é tirar a janela de `legendSlots`**.
- WARNING-4/5 (herdados), SF-8…SF-12 e E-2…E-5: dependem de decisão de escopo ou são condição do design gate.

## 4. `make verify`

`E2E_API_PORT=8831 E2E_NEXT_PORT=4331 make verify` sobre `1ebee50`: **VERDE, 8 portões**. Log em
`/tmp/verify-wave-paineis-f01-20260926T032055Z.log`. Front **1091** pass / 0 fail (4 suítes). Back **2728 passed**,
96,31%. `boundaries` 7 kept. `regras` **0 bloqueio**, 77 avisos (os mesmos do r2). e2e **68 passed / 2 skipped**
(os mesmos 2 skipped do r2, `e2e/15` CA-2/CA-4). Nenhum vermelho, nem dentro nem fora da lista de conhecidos.

Doc delta:
- `docs/specs/SPEC-008-candle-real-e-eixo-unico.md`: atualizado §`D-C3.5`. É a nota de CORREÇÃO do teto efetivo
- `frontend/src/app/symbol/view-model.ts` (docstring): isenção do volume revogada para a legenda
- `docs/product/STITCH_CONTEXT.md`: sem mudança. Nenhuma decisão visual nova: a legenda passa a mostrar o valor que
  o design gate já exigia, e o `keepFloor` preserva a geometria declarada
- `docs/INDEX.md`: +2 linhas (este laudo e os laudos W1 que faltavam)
- ADR: não é necessária. O conserto aplica a `ADR-044/D2` como está escrita
