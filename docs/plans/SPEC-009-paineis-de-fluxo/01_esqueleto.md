# Fase `01` — O esqueleto: um gráfico, seis panes, um eixo, uma linha vertical, e a legenda que lê o slot

> **Pixel:** os 6 panes de hoje (preço+volume, liquidação long, liquidação short, OI, long/short, CVD) **dentro de um único** `.tv-lightweight-charts`, com a legenda de cada pane = o valor da API
> **Componentes:** `web` · `charts`
> **Requisitos cobertos:** `RF-1`..`RF-6` · `RN-4` · `RNF-1` · `RNF-2` · `CA-1′`..`CA-5`, `CA-11′`, `CA-12`
> **Decide:** `SPEC-009` §3–§5 · `ADR-044/D1–D3`
> **Fronteira:** **nenhuma forma de série muda.** O volume continua com cor única, o OI continua em linha e a liquidação continua em duas séries e dois panes

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| **1.0** | ⛔ **Spike `T-01.0`, que vem ANTES de qualquer linha de produção:** um `createChart` com os panes sobre dado **real** de `/series-history` (`BTCUSDT`, TF `1m`, ~5.760 slots), as 11 séries e as escalas de marca, rodando contra `next build`/`next start`. Roda os falsificadores **F-1..F-5** de `ADR-044` **e o controle negativo de F-1** (busy-wait de 20 ms). Responde também os `[NÃO SEI]` de `ARQ-1`: se `getHTMLElement()` volta não-nulo no tick de `addPane`, e se `setCrosshairPosition` pinta sobre *whitespace*. **Qualquer reprovação ⇒ a fase para e `S-2` reabre** com o relatório devolvido ao `/architect`. Código de spike **não é mergeado** em produção | `web` · `charts` | `ADR-044` §Falsificador |
| 1.1 | **Baseline antes de F1**, no `HEAD` de `master`: 5 rodadas isoladas de `e2e/17` e `e2e/20`, registrando `p50/p95/max` de cada (comando em `ARQ-1` §7). Na mesma passada, medir como o OI aparece hoje no TF `1m` (`data-fact` de `oi_slots` e `presentPoints` em `/symbol/BTCUSDT?interval=1m`) | `web` | `CA-11′`, `SPEC-009` §6.4 |
| 1.2 | O *pane registry* (`SPEC-009` §5), com as invariantes (i)–(v) e um teste para cada uma que tem caso que reprova e caso que passa | `web` | `RF-1`, `RF-5`, `RN-4` |
| 1.3 | Montagem única: `useLightweightChart` vira um host, cada `addSeries` ganha o `paneIndex`, e a store de `axis-sync` roda com `panelCount = 1`. Os seis índices fixos e `PANEL_COUNT = 6` saem. `RangeDispatcher` (`charts`) e os testes de álgebra **ficam** | `web` · `charts` | `RF-2`, `RF-3`, `RF-6` |
| 1.4 | As bandas de marca ancoradas em `IPaneApi.getHeight()`, com a geometria **em `charts`**. As 14 constantes de geometria em `web` **não podem crescer** | `charts` | `RN-4`, `ADR-003/FR-2` |
| 1.5 | A camada de DOM por pane (título, legenda, `BeyondCoverageBadge`/`PartialCoverageMark`/`AbsenceNote`) com a **entrada de design já resolvida** (`[Q-DG-1]`) `[DECISÃO do design_gate: ui-designer + ux-ui-mastery, APPROVED WITH CONDITIONS 7.3/10 — docs/context/paineis-de-fluxo/handoff/DESIGN-LAYOUT.md §6-§7, gates/DESIGN-LAYOUT-ux-critique-r2.md]`: **overlay em `IPaneApi.getHTMLElement()`**, `pointer-events: none`, `scaleMargins.top` reservando a legenda; `setStretchFactor` com pesos **34/11/15/9/9/9/9** e piso de **72px** (só os dos panes que existem: funding e CVD partido são `NG-3`/`NG-5`, `SPEC-009` §3); `enableResize = false`; separador `#8b949e` 1px **com teste de override**. Os `data-testid` atuais sobrevivem na raiz da camada | `web` · `charts` | `RF-4`, `CA-12` |
| 1.6 | Legenda a partir de `param.logical` × slots, com leitura por `nature`. Sem crosshair, mostra o último bucket fechado; slot ausente mostra **ausente** | `web` · `charts` | `RF-4`, `ADR-044/D2` |
| 1.7 | Re-ancorar os e2e `16`, `20` e `21` e os ~7 contratos de DOM que estão acoplados à construção (`ARQ-1` §6). O `e2e/11` fica intacto | `web` | — |
| 1.8 | Veredito do `ux-ui-mastery` sobre o **screenshot da implementação** (a especificação já foi aprovada com condições, r2 7.3; a condição C-0 é um render medido) | `web` | `CA-12`, `D-i` |

## DoD verificável — comando e universo

1. **Spike.** O relatório de `T-01.0` está em `docs/context/paineis-de-fluxo/gates/T-01.0-spike.md` com
   F-1..F-5 **e** o controle negativo. **Reprova** se faltar o controle negativo, ou se o busy-wait não
   mover o `p95` e não houver um segundo instrumento com poder demonstrado.
2. **Um gráfico** (`CA-1′`). Playwright contra o app real:
   `page.locator('.tv-lightweight-charts').count() == 1`, e os **6** panes com `N > 0` pontos.
   **Morde:** voltar a 6 `createChart`.
3. **Um eixo** (`CA-2′`). Assert de **pixel** mostrando que só o pane do rodapé tem rótulo de tempo.
   Tem a mesma ablação do item 2.
4. **Crosshair e legenda** (`CA-3′`, `CA-4`). Com hover em `x` no pane de preço, as 6 legendas são iguais
   aos valores do slot de `x` em `/series-history`, para `n ≥ 5` posições de `x`. Sem hover, as legendas
   são iguais ao último bucket fechado. **Morde:** filtrar a atualização por `param.paneIndex`, e também
   trocar o índice do último bucket por `−1`.
5. **Legenda derivada** (`CA-5`). Trocar a chave no catálogo de teste **muda** o nome. **Morde:** nome escrito à mão.
6. **Não-regressão de forma.** Os e2e `08`..`15` continuam verdes, porque nenhuma forma de série mudou.
7. **Latência** (`CA-11′`). `e2e/17`: `p95 ≤ 160 ms` com `n ≥ 61`. `e2e/20`: `p95 ≤ 400 ms` com `n ≥ 10`.
   Os dois sem regredir sobre a baseline do item 1.1. **Morde** com o controle negativo.
8. `make verify` verde, com `__pycache__` purgado. Veredito do `ux-ui-mastery` (`DoD-6`).
