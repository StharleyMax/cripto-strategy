# W1 — code-review r2 (nível high) sobre `master...wave/paineis-f01`

Data: 2026-09-26. Alvo: `wave/paineis-f01` em `a4663b2`. Universo: `git diff --stat master...wave/paineis-f01`
→ **143 arquivos, +20.963 / −865**; produção `frontend/src` sem `*.test.ts`: **23 arquivos, +3.443 / −515** `[MEDIDO]`.

Substitui o `W1-CODE-REVIEW.md` (r1), que ficou incompleto porque o fork não concluiu. Desta vez o fork da skill
`code-review` (high, `@code-review-3`) **concluiu**. Ele devolveu 10 candidatos. Este agente verificou cada um contra
o código, rodando as funções reais quando dava. Também fez um passe próprio: o diff do W1-FIX `4a17e35`, o
`use-history-pager`, o efeito de página do host, o `pane-stack-layout` e o `pane-legend`.

## 0. Veredito: NEEDS_FIX

Há **2 achados de correção CONFIRMADOS**. Os dois foram reproduzidos com as funções de produção e batem com os
fatos do app real que já estão nos laudos.

## 1. CONFIRMED

### C-1: a legenda do volume lê `ausente` em todo TF ≠ `1m`, em repouso e sob o crosshair

- **Onde:** `frontend/src/app/symbol/SymbolClient.tsx:1781` (`<LegendValue seriesId="volume" slots={volume.slots}>`)
  e `frontend/src/app/symbol/panel-assembly.ts:204` (`nonNegativeFlowSlotsFromHistoryRows(rows.volume)`, **sem**
  `s2Window`).
- **Defeito:** os slots do volume são "um por linha do wire". Em `4h` isso dá 24 slots espaçados de 4 h. O
  `LegendValue` diz no próprio contrato que *"slot `i` IS logical index `i`"*, e o `resolveLegendReading` indexa
  com passo de `axisStepMs = 1 min` (`findSlotAt`). O crosshair lógico (`5520`) cai fora do array. Em repouso, o
  slot 23 é achado, mas `resolveFlowReading(slots, 60_000, bucket)` procura o índice `23·240` → `null` → `ausente`.
- **Reprodução com as funções reais** (`node --conditions=react-server scratchpad/volleg.mts`): 24 linhas de 4 h,
  **todas com valor**, dão `rest absent 23` e `crosshair absent null`. É o mesmo `slot 23` / `slot 383` que o
  `W1-QA-r2.md` §3 (BLOCKER-1) mediu no app real. O W1-FIX (`bucketMs`) não alcança esse caminho, porque o erro
  está no espaço de índice e não no encaixe na barra.
- **Conserto sugerido:** montar os slots do volume na grade canônica (`nonNegativeFlowSlotsFromHistoryRows(rows.volume,
  s2Window)`, como já fazem liquidação e long/short). Outra opção é entregar à legenda uma cópia na grade. Um
  unitário em TF `4h` morde: o valor servido tem de aparecer na legenda.

### C-2: a compressão da legenda quebra a separação geométrica barra × marcas da liquidação (`RN-4`)

- **Onde:** `SymbolClient.tsx:2645`. A escala das barras de liquidação é declarada
  `{ belowLegend: true, clearSeparator: false }`, e a escala das marcas é `{ belowLegend: false, clearSeparator: true }`.
  Veio do `e2596fb` (T-01.6).
- **Defeito:** a garantia escrita em `SymbolClient.tsx:1613-1622` é
  `1 − LIQUIDATION_BAR_SCALE_MARGINS.bottom (0,85) < LIQUIDATION_MARKS_SCALE_MARGINS.top (0,88)`: o piso da barra
  fica acima da faixa das marcas. Só que o `paneScaleMargins` comprime o `bottom` da barra para `0,15·(1−r)` e
  deixa o `top` das marcas em `0,88`. A desigualdade vale só enquanto `r < 0,2`.
- **Números** (`node scratchpad/liqm.mts`, com o `paneScaleMargins` real e a altura e a legenda **medidas** em
  `T-01.11-r2-facts.json`, pane de 108 px):
  - `long` (legenda até 54 px): piso da barra em **100,5 px**, faixa das marcas a partir de **95,0 px** → a
    desigualdade dá `false`.
  - `short` (legenda até 38 px): piso em **98,1 px** contra 95,0 px → `false`.

  A menor barra positiva desenhada termina dentro da faixa onde estão a marca de zero (18 u) e a de ausência (6 u).
  O *"impossível por construção"* virou *"depende da altura da legenda"*.
- **Nenhum teste cobre o pós-compressão:** `liquidation-geometry.test.ts` verifica as constantes base, e
  `pane-stack-layout.test.ts` verifica o `paneScaleMargins` isolado.
- **Conserto sugerido:** duas saídas. (a) Comprimir a escala das marcas junto, ou derivar o `top` dela do `bottom`
  aplicado da barra. (b) Manter a barra com `bottom ≥ 1 − marks.top + ε` depois da compressão. Nos dois casos, um
  teste sobre a margem **aplicada** (lida de volta da lib) com legenda de 54 px em pane de 108 px.

## 2. PLAUSIBLE (não bloqueiam, sem reprodução)

- **P-1:** `SymbolClient.tsx:1132-1136`. O `holdRightEdgeCap(true)` sai no `pointerdown` e só é desfeito por
  `pointerup` ou `pointercancel` na `window`. Se nenhum dos dois chegar (troca de janela no meio do arrasto), o
  teto fica em `MAX_SAFE_INTEGER` e a janela cresce 500 slots por página, sem limite, até o próximo clique. Pode ser
  consertado ouvindo `blur` ou `lostpointercapture`.
- **P-2:** `SymbolClient.tsx:3771` contra `:3692`. O `ChromeModeStamp` usa `T = lastInstantMs(panels)`, que recua
  quando o corte da borda direita acontece (depois de ≥ 2 páginas, pela própria `D-C3.5`). O `LegendFrame.asOfMs`
  continua em `knowledgeTimeMs`, e aí a mesma tela declara dois "COMO EM T". Quem decide se o T deve acompanhar a
  janela é o dono de `D-C3.5`.
- **P-3:** `SymbolClient.tsx:906`. O `resolveLegendReading` roda no render com `readingPolicy` vinda do catálogo,
  e uma natureza `EVENT`/`TICK` lança exceção sem `ErrorBoundary`. Hoje isso não acontece: as 7 séries resolvidas
  no app real leem valor (`W1-QA-r2` §2, MF-B, 7 de 8 leituras com valor).
- **Convenção:** 7 mensagens de `new Error("…")` **novas em português** nos e2e 22, 23 e 25 (por exemplo,
  `e2e/22…:161` *"o host do gráfico não publica…"*). O `CLAUDE.md` diz, em *"Mensagem de exceção — RESPONDIDA em
  2026-09-02"*: *"Toda mensagem NOVA de `raise`/`Error`/`Exception` nasce em inglês"*. É convenção, não correção.

## 3. Descartados na verificação

- **Crosshair com índice lógico velho depois de uma página** (candidato do r1 e do fork): a lightweight-charts
  chama `_internal_recalculateAllPanes → _internal_updateCrosshair → crosshairMoved.fire` quando os dados mudam
  (`lightweight-charts.development.mjs:7155-7157`, `:7107-7113`, `:7087`). A lib republica o índice que está sob o
  pixel, e o store se atualiza.
- **A faixa recente do long/short não se remede no arrasto:** o master também media uma vez só, no
  `requestAnimationFrame` depois de montar (`master:SymbolClient.tsx:614-618`). Não é regressão da wave.
- **Duplicação** (`page.tsx:510` contra `timeframeStepMs`; `paneIndexOfId` contra `paneIndexOf`) e **código
  morto** (o writer do dispatcher com `panelCount = 1`, `mark-band-geometry.ts`, `validatePaneRegistry` sem
  chamador de produção): são limpeza, não correção. O registry que não é aplicado já é achado do `W1-REVIEW`.

## 4. Comandos

```
git -C .claude/worktrees/wave-paineis-f01 diff --stat master...wave/paineis-f01 | tail -1
git -C .claude/worktrees/wave-paineis-f01 diff --stat master...wave/paineis-f01 -- frontend/src ':!*.test.ts' | tail -1
node --conditions=react-server <scratchpad>/volleg.mts   # C-1: resolveLegendReading + nonNegativeFlowSlotsFromHistoryRows reais
node <scratchpad>/liqm.mts                               # C-2: paneScaleMargins real, H=108, legendBottom ∈ {54, 38}
grep -n 'updateCrosshair()' frontend/node_modules/lightweight-charts/dist/lightweight-charts.development.mjs
```
