# Review arquitetural — FASE 02, `candle-real-e-eixo-unico`

**Worktree:** `wave-f02` (branch `wave/candle-f02`, HEAD `852cab7`, T-02.1 a T-02.8).
**Escopo:** `git diff --stat origin/master..HEAD` — 62 arquivos, 5378(+)/1302(-).
**Veredito: COMPLIANT.**

## Camada 1 — o que o runner mede

```
harness rules list --severity block          # 8 regras em vigor no repo
harness rules --mode sweep --changed-only    # rc=0, saída vazia
harness rules --mode file --path <arquivo>   # rodado individualmente nos 11 arquivos críticos
```
11 arquivos auditados individualmente (`time-axis-controller.ts`, `range-dispatch.ts`,
`timeframe-switch.ts`, `axis-sync.ts`, `axis-sync-provider.tsx`, `SymbolClient.tsx`,
`[symbol]/page.tsx`, `axis-latency-probe.ts`, `s2-panels.ts`, `charts/index.ts`,
`s2-absence-policy.ts`): **0 achado** em todos. Denominador: 8 regras bloqueantes declaradas,
todas avaliadas pelo sweep, 0 violação.

## Camada 2 — arquitetura declarada (`D-C3.1`–`D-C3.7`, JULGAMENTO-FRONTEND-ARCHITECT.md)

- **Pureza de `charts/time-axis-controller.ts`, `range-dispatch.ts`, `timeframe-switch.ts`**
  — `grep -n "^import"` confirma zero import de módulo externo em `time-axis-controller.ts`
  (import zero) e só imports internos de tipo em `range-dispatch.ts`/`timeframe-switch.ts`
  (`./time-axis-controller.ts`). `grep -rn "lightweight-charts\|IChartApi\|document\.\|window\.\|fetch("`
  só bate em comentário/docstring, nunca em código executável. `npm run test:charts` — 228/228
  passam, incluindo os testes-falsificador explícitos "PURITY (D-C3.1/D-C3.3 boundary): the
  module CODE (not its prose) names neither IChartApi, fetch, nor lightweight-charts" (scan por
  AST/regex sobre o texto do módulo, não sobre docstring).
- **Fronteira `charts`↔`web`** (`D-C3.1`) — `frontend/eslint.config.mjs` declara
  `no-restricted-imports`/`no-restricted-syntax` nos dois sentidos: `charts` nunca importa `web`
  (estático e dinâmico), `web` só cruza para `charts` via `charts/index.ts` (exceção estreita
  para `src/app/symbol/**`, negada para import profundo). `npm run lint` — limpo, 0 violação
  reportada pela própria regra que audita isto.
- **`IChartApi`/`lightweight-charts` só em `web`** — `grep -rn "IChartApi"` sob `frontend/src/charts/*.ts`
  só aparece em comentário; sob `frontend/src/app/symbol/` aparece em código real
  (`axis-sync.ts`, `SymbolClient.tsx`). Import de `"lightweight-charts"` confinado a
  `SymbolClient.tsx`/`chart-options.ts` (ambos `web`). Confirma `D-C3.1`.
- **Estado em instantes, não em range lógico bruto** (`D-C3.3`) — `axis-sync.ts` guarda
  `TimeRange`/`LogicalRange` convertidos por aritmética pura (`toLogicalRange`/`fromLogicalRange`
  em `time-axis-controller.ts`), testado por `CA-5d` (erro de 2,7h reconvertendo por tempo vs.
  325,3h reusando o índice lógico bruto). `npm run test:app` — 360/360 passam.
- **`page.tsx` da rota `T-02.5`** — `components = ["web"]` declarado em 3 pontos do arquivo
  (linhas 70, 574, 659, 707), nenhum import de `charts` fora do barrel `charts/index.ts`.
- **Merge manual `363270f` (ablação + latência no mesmo `createAxisSyncStore`)** — lido
  `axis-sync.ts:122-184` e `axis-sync-provider.tsx:47-53`: `createAxisSyncStore(axis,
  PANEL_COUNT, recordAxisRangeApplied)` é construído primeiro (com o hook de latência já
  vinculado), e só depois envolvido por `withAxisSyncAblation(real, ablated)`. Quando
  `ablated=true`, `withAxisSyncAblation` SUBSTITUI `notifyPanelRangeChanged` inteiro por um
  no-op — a chamada real (`dispatcher.onPanelRangeChanged` + o `if` que dispara
  `onRangeApplied`) nunca executa. Composição correta: ablação silencia o dispatch e, por
  consequência, nunca dispara `onRangeApplied`. Confirmado por leitura de código; nenhum teste
  automatizado dedicado a esta composição específica foi encontrado além da leitura estrutural.
- `npx tsc --noEmit --strict` (`npm run typecheck`) — limpo.

## Achados

Nenhum. 0 violação de regra bloqueante, 0 desvio da arquitetura declarada nas 7 dimensões
auditadas acima.

## Comandos executados (reprodutibilidade)

```
harness rules list --severity block
harness rules --mode sweep --changed-only
harness rules --mode file --path <arquivo>   # x11
git diff --stat origin/master..HEAD
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test:charts        # 228 pass
npm --prefix frontend run test:app           # 360 pass
```
