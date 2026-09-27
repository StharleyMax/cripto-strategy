# W5-CODE-REVIEW — code-review high de `master...wave/paineis-f04`

- **Veredito: APPROVED** — 0 achado de correção CONFIRMADO.
- Universo: `git diff --stat master...wave/paineis-f04` = 66 arquivos, +10461/−1303 `[MEDIDO 2026-09-27]`;
  produção lida por inteiro: `charts/liquidation-pane-geometry.ts`, `app/symbol/liquidation-pane-form.ts`,
  `app/symbol/liquidation-legend-swatch.ts`, o diff de `SymbolClient.tsx` (977 linhas de diff), de
  `pane-registry.ts`, `pane-legend.ts`, `unlabeled-tick-format.ts`, `[symbol]/page.tsx`.
- ⚠️ Limite declarado: a skill `code-review` foi lançada em fork (`@code-review`) e **não devolveu antes do
  prazo do workflow**. Este laudo é a leitura direta do revisor sobre o diff de produção; os specs e2e
  (`e2e/31`–`35`, ~3.100 linhas) **não** foram lidos linha a linha `[NÃO MEDIDO]`.

## Medidas

| comando | resultado |
|---|---|
| `cd frontend && npx tsc --noEmit -p .` | `rc=0` `[MEDIDO]` |
| `node --conditions=react-server --test src/charts/liquidation-pane-geometry.test.ts` | 14 pass / 0 fail `[MEDIDO]` |

## Verificado sem defeito

1. Cadeia estrita da forma (`assertValidLiquidationPaneForm`) aceita `LIQUIDATION_PANE_FORM`
   (0 < 0,06 < 0,09 < 0,5 < 0,91 < 0,94 < 1); as duas pernas mapeiam pelo MESMO afim → zero comum.
2. `sharedMagnitudeAutoscale`: faixa alargada a slots inteiros, `from > to` devolve `null`; um só provider
   pendurado nas duas séries de barra (`autoscaleInfoProvider: () => live.autoscale()`), trocado a cada `apply`.
3. `liquidationPaneFeeds` recusa 2 pernas no mesmo lado, grades diferentes e valor `< 0`.
4. `layout` do host: o pane de liquidação está em `state.scales` com `[]`, então o laço genérico não
   sobrescreve as 4 escalas; `reservedTopPx` = topo da banda de marcas de cima = `dataTopPx`.
5. Hidratação do swap: `useSyncExternalStore` com snapshot de servidor = registry; `mount` lê o mesmo cache
   que o render do cliente, ordem do DOM e lado do pixel concordam.

## PLAUSIBLE (não bloqueia)

- **P-1 — refeed do layout pode rodar entre o commit de uma página nova e o efeito de página**
  (`SymbolClient.tsx:1261-1264`). Se a legenda mudar de altura no mesmo commit de uma página (ex.: aparece
  `AbsenceNote`/cobertura parcial), o `ResizeObserver` reaplica as 6 séries da liquidação com a grade NOVA
  enquanto o carrier ainda tem a antiga. Autocorrige no efeito de página (carrier primeiro, depois todos os
  panes), e prepend não move a vista na biblioteca `[INFERRED: rightOffset ancorado à direita]`. Sem
  reprodução; mesmo padrão já existente em `register` (`:1067`).
- **W-a (já listado em `handoff/W5-QA.md`)** — `?e2eSwapLiquidationSides=1` / `?e2eLiquidationLogScale=1`
  em produção; há precedente (`?e2eDenseSeries=1`). Não é correção.
