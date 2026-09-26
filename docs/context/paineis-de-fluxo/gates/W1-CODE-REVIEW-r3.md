# W1-CODE-REVIEW r3 — code-review high, `master...wave/paineis-f01`, depois do W1-FIX2

- **Alvo:** `master...wave/paineis-f01` em `790b2fb`. O delta desde o r2 (`58195bc..790b2fb`) tem 18 arquivos,
  +675/−19 `[MEDIDO: git diff --stat 58195bc..wave/paineis-f01 | tail -1]`.
- **Nível:** high. **Data:** 2026-09-26.

## 0. Veredito: APPROVED

Nenhum achado de correção confirmado. Os dois CONFIRMED do r2 (C-1 e C-2) estão fechados, e cada conserto foi
revalidado por **mutação**, não pelo relatório do builder (regra §4). O P-1 do r2 também foi tratado.

⚠️ **Limite declarado.** A skill `code-review` foi despachada em fork (`code-review-4`) sobre o diff inteiro e
**não devolveu resultado dentro desta execução**. O workflow exigiu a devolução antes disso. É o mesmo modo de
falha do r1 (`W1-CODE-REVIEW.md`). Por isso, a cobertura do diff inteiro vem do r2 (`W1-CODE-REVIEW-r2.md`, que
foi completo), e esta rodada cobre o delta do W1-FIX2 linha por linha. `[NÃO MEDIDO]`: um passe amplo novo
sobre os 154 arquivos.

## 1. Os achados do r2, revalidados

| r2 | conserto em `1ebee50` | mutação que desfaz o conserto | resultado |
|---|---|---|---|
| C-1: a legenda do volume lia os slots nativos do TF | `legendSlots` na grade canônica (`panel-assembly.ts:217`, `[symbol]/page.tsx:712`); `LegendValue` lê `volume.legendSlots` (`SymbolClient.tsx:1801`) | M2: tira o `s2Window` da montagem | **morde** (2 falhas) |
| | | M3: tira o `routeWindow.window` do SSR | **morde** (1) |
| | | M4: a legenda volta a ler `volume.slots` | **morde** (2) |
| C-2: o piso da barra de liquidação entrava na faixa das marcas | `keepFloor` em `PaneScaleRole` (`pane-stack-layout.ts:232`), declarado na escala das barras (`SymbolClient.tsx:2669`) | M1: tira o `keepFloor` do binding | **morde** (1) |
| | | M5: o `paneScaleMargins` ignora o `keepFloor` | **morde** (2) |

Base: **44 pass / 0 fail** nos 4 arquivos de teste. Mutações: **5 de 5 mordem** `[MEDIDO]`.

- **C-1, ao vivo:** o pager remonta com `assembleHistoryPage` a partir das linhas mescladas (`use-history-pager.ts:305`).
  O `legendSlots` sai do mesmo `s2Window` (`panel-assembly.ts:175`) que liquidação e long/short já usavam, então
  continua na grade depois de paginar. As barras, o `presentPoints`, o `firstPresentMs` e o `ReadableHorizon`
  continuam no vetor nativo, e nenhum pixel se move.
- **C-2, pós-compressão:** com `keepFloor`, o `bottom'` fica igual ao `bottom` base (0,15), e o piso fica em
  0,85 < 0,88 com qualquer legenda. Isso vale também no ramo de overflow (`reserve > MAX`), que já devolvia o
  `bottom` sem compressão. O binding passa direto para o `paneScaleMargins` (`SymbolClient.tsx:1213`). O
  `top + bottom` cresce com o `r`, mas o teto do `MAX_LEGEND_RESERVE_FRACTION` o mantém < 1.
- **P-1 (r2):** `blur` na `window` agora encerra o gesto (`SymbolClient.tsx:1149`), com remoção simétrica no
  cleanup. Um `blur` sem gesto em curso chama `onGestureChange(false)`, que não faz nada.

## 2. PLAUSIBLE herdados do r2 (não bloqueiam)

- **P-2** (dois "COMO EM T" depois do corte da borda direita) e **P-3** (`resolveLegendReading` lança exceção com
  natureza `EVENT`/`TICK`, sem `ErrorBoundary`) não mudaram no delta. Continuam sem reprodução.
- **Convenção:** as mensagens `new Error("…")` em português nos e2e 22/23/25 continuam lá. É convenção, não
  correção.

## 3. Comandos

```
git -C .claude/worktrees/wave-paineis-f01 diff --stat 58195bc..wave/paineis-f01 | tail -1
cd frontend && T="src/app/symbol/liquidation-geometry.test.ts src/app/symbol/panel-assembly.test.ts \
  src/app/symbol/volume-legend-grid-contract.test.ts src/charts/pane-stack-layout.test.ts"
node --conditions=react-server --test ${=T} | grep -aE ' (pass|fail) [0-9]+$'    # base: 44/0
# M1..M5: um sed por mutação (tirar keepFloor do binding; tirar s2Window; tirar routeWindow.window;
# slots={volume.slots}; bottom sempre comprimido), rodar ${=T}, git checkout do arquivo
```
