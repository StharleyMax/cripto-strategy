# `T-02-latencia-fix` — diagnóstico do teto de latência do eixo (`RNF-2`, follow-up de `T-02.7`)

> Fase `02` · componente `web` · segue `T-02.7` (`CST-214`), que mediu e MORDEU
> (`gates/T-02.7-builder.md`) sem consertar. Esta task investiga a causa raiz e **NÃO A ENCONTRA
> dentro de `web`** — o achado é negativo, medido, e é isso que este documento registra.

## Escopo e veredito, em uma frase

Duas hipóteses de causa raiz foram testadas por MUTAÇÃO REAL no código (não hipótese solta): (1)
"escrita síncrona por painel, falta de coalescing" e (2) "6 `IChartApi` reais custam mais que
16ms". **A primeira foi refutada por medição — implementá-la não muda o `p95` e ainda quebra
`DoD-4`.** A segunda continua em aberto e vira a pergunta que este documento escala ao owner.
**Nenhuma mudança de código sobrevive neste branch** (revertida, ver seção final) — a árvore
`wave/candle-f02` está idêntica a antes desta task, exceto por este gate doc.

## Hipótese 1 — coalescing das 5 escritas em `requestAnimationFrame`: IMPLEMENTADA, MEDIDA, REVERTIDA

### O que foi construído (e depois revertido)

`frontend/src/app/symbol/axis-write-scheduler.ts` (novo módulo, `createFrameCoalescedWriter`):
em vez de `RangeDispatcher`'s fan-out chamar `timeScale.setVisibleLogicalRange()` +
3 escritas de `dataset` SINCRONAMENTE nos 5 painéis não-origem — dentro do MESMO call stack do
handler `subscribeVisibleLogicalRangeChange` do painel de origem —, cada painel passou a
agendar a escrita real via `requestAnimationFrame`, coalescendo qualquer rajada de dispatches
antes desse frame disparar para o ÚLTIMO valor só. `axis-sync.ts`/`range-dispatch.ts` (a álgebra
pura, testada por `node --test`) não foram tocados — só a borda `web` (`SymbolClient.tsx`'s
`useLightweightChart`).

### Medição 1 — `p95` não muda, isolado, 3 rodadas — `[MEDIDO 2026-09-22]`

Comando: `frontend/node_modules/.bin/playwright test --config=frontend/playwright.config.ts
frontend/e2e/17-teto-latencia-eixo.spec.ts`, sozinho, sem outro processo de teste na máquina.

| condição | rodada | n amostras | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| baseline (sem fix) | 1 | 87 | 16,70 | 32,90 | 49,30 |
| com coalescing | 1 | 87 | 16,70 | 32,70 | 66,90 |
| com coalescing | 2 | 87 | 16,80 | 32,90 | 49,30 |
| com coalescing | 3 | 87 | 16,70 | 32,20 | 33,00 |

`p95` com o fix (32,2–32,9 ms) é estatisticamente indistinguível do baseline sem fix (32,8–33,0 ms
no gate de `T-02.7`). **O coalescing não moveu a agulha.**

### Medição 2 — diagnóstico mais forte: escritas nos 5 painéis DESLIGADAS por completo

Para isolar se o CUSTO DA ESCRITA (6 canvases repintando) é a causa, o corpo de
`createFrameCoalescedWriter`'s `apply` foi temporariamente esvaziado — nenhum
`setVisibleLogicalRange`, nenhuma escrita de `dataset`, nos 5 painéis não-origem. `onRangeApplied`
continuou disparando normalmente (ele vive em `axis-sync.ts`, no lado do DISPATCH, não da escrita).

```
E2E-FACT axis_latency_samples=87
E2E-FACT axis_latency_p50_ms=16.70
E2E-FACT axis_latency_p95_ms=32.90   ← IDÊNTICO ao caso com escrita normal
E2E-FACT axis_latency_max_ms=33.70
```

**Com ZERO escrita nos 5 painéis, `p95` continua em ~33 ms.** Isto refuta a hipótese "6 canvases
repintando por frame custam o excedente" — se fosse esse o custo, eliminá-lo por completo teria de
baixar o `p95` para perto do `p50` (16,7 ms), e não baixou nada.

### Medição 3 — a causa já existe ANTES de qualquer código de `web` rodar

Para achar onde o atraso realmente mora, foi adicionada instrumentação temporária dentro de
`handleRangeChange` do painel de ORIGEM (Preço) — um `performance.now()` empilhado no PRIMEIRO
`if` do handler, ANTES de `axisSync.notifyPanelRangeChanged` ser chamado (ou seja, antes de
QUALQUER dedupe, guarda de reentrância ou escrita deste app rodar):

```
E2E-FACT DIAG_raw_n=88
E2E-FACT DIAG_raw_p50=16.70
E2E-FACT DIAG_raw_p95=32.70   ← o MESMO número, medido no evento CRU da biblioteca
E2E-FACT DIAG_raw_max=2167.5
```

**O evento bruto que `lightweight-charts` dispara para o painel de origem já chega com o mesmo
`p95` de ~33 ms — antes de `RangeDispatcher`, `axis-sync.ts` ou qualquer escrita nos outros 5
painéis existirem no caminho.** Isto não é mais hipótese: é a mesma assinatura, medida no ponto
mais cedo possível do pipeline.

**Conclusão da Hipótese 1: REFUTADA.** A cadência de `subscribeVisibleLogicalRangeChange` do
painel de origem já carrega o `p95 ~33 ms` sozinha, com 1 painel, sem fan-out, sem escrita, sem
`RangeDispatcher`. `web`'s wiring (`T-02.2`–`T-02.4`) não adiciona esse custo — ele só o
propaga. Nenhuma reorganização de COMO `web` escreve nos outros 5 painéis pode consertar um
atraso que já existe antes da primeira escrita.

### Por que a Hipótese 1 foi revertida (não só "não ajudou" — regrediu)

Rodando `make verify` completo (`E2E_API_PORT=8831 E2E_NEXT_PORT=4331`) com o coalescing
aplicado, **`16-eixo-unico-pan-e-ablacao.spec.ts`'s `DoD-2/DoD-4` (antes verde) passou a
reprovar**: os 5 painéis não-origem terminaram um arrasto com contagens de escrita DIFERENTES
entre si (`oi-pane_write_count_delta=51` contra `cvd-pane`/`liquidation-*`/`long-short-pane` em
`52`), violando a invariante de LOCKSTEP que `DoD-4` exige ("os cinco painéis movem-se juntos,
nunca um mais que outro"). Causa: cada painel agenda seu PRÓPRIO `requestAnimationFrame`
independentemente — mesmo recebendo a MESMA sequência síncrona de dispatches, jitter de
agendamento do browser pode fazer um painel coalescer uma rajada que outro não coalesce,
quebrando a garantia "mesmo evento, mesmo resultado nos cinco" que `RangeDispatcher`'s própria
escrita síncrona (a versão original) dava de graça. **Um fix que não melhora o `p95` E quebra um
DoD que antes passava não é um fix — é regressão pura**, então foi revertido por completo:
`git diff` desta branch contra o estado anterior a esta task é vazio, exceto por este documento.

## Hipótese 2 — "16ms é o teto errado para esta arquitetura": NÃO decidida por este builder

O achado da Medição 3 é mais forte do que "6 `IChartApi` reais custam caro" — ele mostra que o
atraso mora no **painel de origem sozinho**, sem nenhum outro painel escrevendo nada. Isso desloca
a pergunta: não é (só) "6 gráficos sincronizados custam mais que 16ms", é "um ÚNICO
`lightweight-charts@5.2.1` reproduzindo um arrasto contínuo sobre 5.760 velas reais, dirigido por
`page.mouse.move(..., { steps: 90 })` via CDP em Chromium headless, já viola `p95 <= 16ms` por si
só" — e isso pode ser: (a) custo real da biblioteca com esse volume de dados; (b) artefato do
PACING de entrada sintética do Chromium headless via CDP (que o próprio `T-02.7` já documentou
interferir — a troca do laço manual de `mouse.move()` para `{ steps }` mudou o `p50` de ~33ms para
~16,7ms); ou (c) alguma combinação das duas, indistinguível sem instrumentar DENTRO do processo
do Chromium (fora do que este builder pode medir a partir do lado do teste).

**Não decido sozinho um teto diferente — isto é `[DECISÃO-OWNER]` por instrução explícita da
task.** O que registro para quem decidir: o mecanismo de sincronia entre painéis (`T-02.2`–`T-02.4`,
`RangeDispatcher`/`AxisSyncStore`) está **absolvido pela Medição 2/3** — não é ele quem viola o
teto. A pergunta que sobra é sobre o CUSTO DE UM ÚNICO GRÁFICO real sob arrasto sintético
via CDP, não sobre a arquitetura de 6 painéis que esta fase construiu.

## Estado final da árvore e portões

- `git status --short` nesta worktree: **vazio** (fix implementado, medido e revertido; nenhum
  arquivo de código muda). Único artefato novo é este gate doc.
- `npm --prefix frontend run test:app` (com o fix, antes de reverter): 366 pass, 0 fail — inclui os
  6 testes novos de `axis-write-scheduler.test.ts`, também removidos no revert.
- `E2E_API_PORT=8831 E2E_NEXT_PORT=4331 make verify`, ÁRVORE FINAL (revertida): 7/8 portões `OK`
  (`lint-backend`, `lint-frontend`, `test-frontend`, `test`, `boundaries`, `regras`, `política`);
  `e2e` `FALHA rc=1` — **o mesmo estado que `T-02.7` já deixou**: `43 passed, 1 failed` (apenas
  `17-teto-latencia-eixo.spec.ts`), `DoD-2/DoD-4` de `T-02.6` verde. Log bruto:
  `/tmp/verify-t02-latencia-fix-final-*.log` (não versionado).
- Com o fix ainda aplicado, o mesmo `make verify` deu **`43 passed (55.4s), 2 failed`** — a prova
  medida da regressão que motivou o revert (seção acima).

## Bloqueado / escalação

**Não fecho `RNF-2` — ele continua `NEEDS_FIX`, e a ação não é mais "reescrever `T-02.4`"**: a
Medição 3 absolve o `RangeDispatcher`/`AxisSyncStore` desta fase. O que falta é uma decisão do
owner sobre uma das duas alternativas (nenhuma das duas é deste builder decidir):

1. Aceitar um teto diferente de `16ms` para `RNF-2`, específico ao mecanismo medido (um
   `IChartApi` sob arrasto sintético via CDP em Chromium headless) — com o número a determinar por
   quem tiver autoridade sobre o DoD (`tasks.toml:349-352`, `[DECISAO-OWNER: 2026-09-19]` original).
2. Investigar o custo de biblioteca/CDP diretamente (profiling dentro do processo Chromium, fora
   do escopo de instrumentação que este builder tinha disponível) antes de aceitar que 16ms está
   errado — isto é trabalho novo, não uma extensão desta task.
