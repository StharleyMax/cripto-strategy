# Handoff — fix: paginação de histórico se auto-dispara sem gesto (achado de T-05.8/T-05.9)

Diagnóstico feito pelo `frontend-architect`, causa confirmada por leitura de código — esta
dispatch é o CONSERTO, não uma nova investigação.

## A causa, exata

1. `AxisSyncProvider`'s `useMemo([axis])` trata todo alargamento de eixo (toda página de
   história bem-sucedida) como mount novo: o dep `[..., axisSync]` de `useLightweightChart`
   (`frontend/src/app/symbol/SymbolClient.tsx:613`) desmonta e reconstrói os 6 `IChartApi`.
2. A aplicação de montagem de cada remonte —
   `timeScale.setVisibleLogicalRange(axisSync.initialLogicalRange)` (`SymbolClient.tsx:566`) —
   roda **fora** do guard de reentrância. `RangeDispatcher`
   (`frontend/src/app/symbol/range-dispatch.ts:110-145`) só embrulha em `guard.runApplying(...)`
   os writes que ELE MESMO emite via `registerPanel`; a chamada de montagem nunca passa por ali,
   e acontece antes de `subscribeVisibleLogicalRangeChange` (linha 592) ser religada.
3. `setVisibleLogicalRange` não aplica sincronamente (docstring própria, linhas 515-521) — o
   evento de mudança dispara depois, quando a subscrição já está viva, e cai em
   `notifyPanelRangeChanged` indistinguível de um arrasto real.
4. Isso alimenta `onCandidateRange` (`use-history-pager.ts:326-355`), que reavalia
   `historyRequest` contra o eixo recém-alargado — e como isso repete em TODO remonte (toda
   página), o ciclo se autossustenta até `historyRequest`'s próprio corte de piso
   (`axis.startMs <= floorMs`) devolver `null`. Bate exatamente com o sintoma medido: "para
   sozinho no floor declarado, sem gesto".

## O conserto (decisão do arquiteto, não reabra)

Estenda o guard de reentrância que `RangeDispatcher` já tem para cobrir também a aplicação
INICIAL de montagem, não só os writes do próprio dispatcher. Exponha em `axis-sync.ts` (ou onde
fizer sentido dado o encapsulamento atual do `guard`) um jeito de `useLightweightChart` chamar
`setVisibleLogicalRange(axisSync.initialLogicalRange)` (`SymbolClient.tsx:566`) **dentro de**
`guard.runApplying(...)` — mesma proteção que os writes cruzados já têm, agora uniforme para
qualquer "aplica", seja do dispatcher, seja de montagem.

**Não** faça o refactor maior (parar de remontar os 6 `IChartApi` a cada página) — isso é
follow-up de robustez/perf que o arquiteto explicitamente marcou como fora deste ciclo. O fix
mínimo (guard) já fecha o buraco sem tocar no contrato `D-C3.4`/`D-C3.5`.

## Como verificar que o fix funcionou

Os dois specs que mediram o sintoma já existem nesta branch — rode os dois de novo:
- `frontend/e2e/20-teto-latencia-historia-sob-demanda.spec.ts` — a asserção de composição (nenhum
  pan durante paginação estoura o teto de T-02.7) tem que passar a passar (medido antes: máximo
  1071,70ms, muito acima do teto).
- `frontend/e2e/21-arrasto-historia-parede-e-ablacao.spec.ts` — confirme que ainda passa (não
  deveria ter mudado de comportamento no cenário COM arrasto real).
- Reproduza o cenário de T-05.8's achado escalado (catálogo sintético com floor raso, esperar
  sem nenhuma interação de mouse) e confirme que ZERO páginas são pedidas sem gesto — antes: 6
  páginas automáticas, 4 requests cada, sem interação.

## Onde trabalhar

Worktree já criado, branch `task/candle-f05-t05-retrigger-fix` a partir de `wave/candle-f05`
(contém T-05.0 a T-05.9 mergeadas):
`/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f05-t05-retrigger-fix`

Componente: `web`. Gate: lint + typecheck + `test:app` + os dois specs e2e acima.

## Resultado (builder, 2026-09-23) — ADENDO, não reescreve o acima

**O conserto**, exatamente como pedido: `ReentrancyGuard` (`frontend/src/charts/range-dispatch.ts`)
ganhou `holdApplying(): () => void` — o gêmeo assíncrono de `runApplying`, que fica segurado até o
chamador liberar (em vez do `try/finally` síncrono de `runApplying`, que já libera antes do eco
adiado do `setVisibleLogicalRange` chegar — confirmado lendo `lightweight-charts.development.mjs`:
`setVisibleLogicalRange` só invalida e agenda via `window.requestAnimationFrame`; a notificação real
roda DENTRO desse RAF, nunca no mesmo tick). `AxisSyncStore` (`axis-sync.ts`) passou a expor
`guard: RangeDispatcher["guard"]` (tipo indexado, sem reexportar `ReentrancyGuard` pelo `charts/index.ts`
— `ADR-034/D8` continua intocado). `useLightweightChart` (`SymbolClient.tsx`) segura o guard na
"aplica" de montagem e libera no PRÓPRIO `requestAnimationFrame`, registrado logo depois do
`setVisibleLogicalRange` — como o RAF da biblioteca já foi agendado primeiro (dentro daquela
chamada), os dois disparam no MESMO frame, em ordem de registro: o eco chega guardado, nosso
release roda depois. Cleanup cancela o RAF pendente e libera (idempotente) para não travar o guard
num unmount que corre com o eco.

**Achado colateral, não desta task**: `20-teto-latencia-historia-sob-demanda.spec.ts` reprova ANTES
de medir qualquer coisa (`stub_drawn_candles="0"`, linha 323) — `[MEDIDO 2026-09-23, esta worktree]`
IDÊNTICO em `HEAD` (`a18b777`, sem o fix) e com o fix aplicado (`git stash`/`pop` comparando os
dois). Não é o achado que este fix ataca — é um precondition check que já falhava antes deste
ciclo. Fora de escopo (o handoff pede o guard, não conserta o stub); registrado aqui para quem
continuar não reabrir a mesma investigação.

**Verificação real (não só verde)**: `range-dispatch.test.ts` ganhou 3 casos novos, incluindo um
falsificador (`T-05-FIX falsifier: a candidate that arrives WHILE holdApplying is held is dropped`)
mutado manualmente (`holdApplying` forçado a `applying = false`) para confirmar que MORDE — sem o
hold real, o eco simulado grava `2` escritas em vez de `0`. Mutação revertida antes do commit.

## Ao terminar

Commit(s) na branch (não dê push, não abra PR). Emita o QA Gate Context Block e pare — não rode
`gate-record`, não aprove, não avance estado. Se passar de ~150 turnos, escreva o estado aqui
mesmo e devolva.
