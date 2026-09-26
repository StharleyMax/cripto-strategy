# Handoff `/architect` -> `frontend-architect` — `paineis-de-fluxo`, `Q-ARQ-1` e o contrato de pane

**Entrada:** `docs/specs/PRD-009-paineis-de-fluxo.md` (§1.2 M6/M7, §5 F1, §7 RF-1..RF-6/RF-10, §8 RN-2/RN-4, §9, §10 CA-1..CA-5/CA-10/CA-11, §13-B).
**Saída esperada:** o seu julgamento gravado em `docs/context/paineis-de-fluxo/handoff/ARQ-1-julgamento-frontend-architect.md`.
Devolva ao `/architect` no máximo 15 linhas + o caminho.

## As perguntas (julgamento seu, com arquivo:linha citado e rótulo de força em todo número)

1. **`Q-ARQ-1`** — `S-1` (um `createChart`, panes nativos v5 `addPane`/`paneIndex`, `lightweight-charts` 5.2.1 instalado)
   ou `S-2` (seis charts estilizados + crosshair sincronizado à mão)? Leia a API v5 **no pacote instalado**
   (`frontend/node_modules/lightweight-charts/dist/typings.d.ts`) — cite o símbolo, não a memória.
   Custo de cada uma medido, e o **falsificador** da escolha.
2. **Grades mistas numa escala de tempo só.** Preço/volume/CVD/liq/long-short são `1m` nativos; OI é `5m`
   (`SPEC-008` A-6). TFs servidos `5m·15m·1h·4h` (`ADR-040/D1`). Em `S-1`, a união de tempos da escala única
   gera algum artefato (candle de OI estreito, whitespace)? `RN-2`: bucket de OI ausente não pode virar candle.
3. **`RN-4` ausência != zero** (`absenceSeries`/`zeroSeries`, `SymbolClient.tsx:1819,1829`) e o `slot-coverage`
   de `SPEC-008` fase 05: cabem em pane nativo? Quando dois panes de liquidação viram **um** (F4), como a
   distinção sobrevive?
4. **Legenda por pane** (`RF-4`: segue crosshair; sem crosshair = último bucket fechado; `RF-5`: nome derivado
   do `SeriesKey`). Em `S-1`, `subscribeCrosshairMove` entrega `seriesData` de todos os panes?
5. **Contrato do "pane registry"** (`PRD-009` §9, TBD, dono você, sob `ADR-003`): forma (ordem, altura,
   série(s), legenda derivada) — **sem código**, só a forma do dado e a fronteira `charts`<->`web`.
6. **Contratos de DOM**: os 5 `*-pane-dom-contract.test.ts` e `axis-sync.ts` — o que morre, o que se re-ancora.
7. **`CA-11` latência**: como medir a baseline com `axis-latency-probe.ts` ANTES de F1 (comando + universo).
8. **Insumo para `Q-SEQ-1`** (decisão é do `/architect`): `ADR-043` (proposta, sem feature) Perna 2 reescreve
   `handleTimeframeSelect`/`TimeframeBar` wiring em `SymbolClient.tsx`; F1 reescreve a montagem dos charts.
   As regiões se sobrepõem? Quantas linhas do arquivo cada uma toca, medido por `grep -n`?

## Fronteiras

- `D-i`: interação/aparência é do `design_gate`, não sua. `D-g`: nada sintético no Postgres compartilhado.
- Read-only sobre código. Não escreva ADR — o `/architect` a escreve citando o seu julgamento.
- `[NÃO SEI]` explícito onde não souber. Morra cedo (R6): ~150 turnos no máximo.
