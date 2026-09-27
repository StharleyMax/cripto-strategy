# W5-CODE-REVIEW-r2 — code-review high de `master...wave/paineis-f04`, depois do `W5-QA-FIX`

- **Veredito: APPROVED** — 0 achado de correção CONFIRMADO.
- HEAD revisado: `cd8969a` (wave `paineis-f04`). Universo: `git diff --shortstat master...HEAD` = 72 arquivos,
  +11005/−1304; produção (`frontend/src`) = 16 arquivos, +2398/−1263 `[MEDIDO 2026-09-27]`.
- **O que mudou em produção desde o r1 (`1035d30`):** `git diff --stat 1035d30..HEAD -- frontend/src` = 1 arquivo,
  +7 linhas, **só comentário** (`unlabeled-tick-format.ts`, W-b). O resto do delta é `e2e/24` (teste RN-3 novo) e
  laudos `[MEDIDO]`.
- Fonte dos candidatos: a skill `code-review` (fork `@code-review`, `agent-a96b2d0ec21f5fb89`), que **devolveu**
  nesta rodada: 9 candidatos de recall, **sem passe de verificação** (ela própria declara). A lista crua ficou em
  `scratchpad/code-review-2-findings.json` da sessão. O fork do r1 (`agent-a33406d7c880e11b9`) também devolveu,
  com 10 candidatos, que o laudo r1 não viu. Os dois conjuntos foram verificados aqui, contra o código e a biblioteca.

## Medidas

| comando | resultado |
|---|---|
| `cd frontend && npx tsc --noEmit -p .` | `rc=0` `[MEDIDO]` |
| `node --conditions=react-server --test` sobre `charts/liquidation-pane-geometry`, `liquidation-pane-form`, `liquidation-legend-swatch`, `pane-registry`, `unlabeled-tick-format`, `liquidation-pane-dom-contract` (`.test.ts`) | 72 pass / 0 fail `[MEDIDO]` |

## Verificação dos candidatos (nenhum sobreviveu como correção)

| # | candidato | veredito | por quê |
|---|---|---|---|
| 1 | refeed do `layout` (`SymbolClient.tsx:1261-1264`) roda sem `holdApplying` entre o commit de uma página e o efeito de página | **PLAUSIBLE** (é o P-1 do r1) | Janela real: ResizeObserver antes do efeito passivo. Mas o aviso de faixa do `lightweight-charts` chega no quadro SEGUINTE (`T-05-FIX`), quando o efeito de página já segura o guard e realimentou o carrier primeiro. Sem reprodução `[INFERRED]` |
| 2 | fallback `collapsed` da faixa de marcas (`:2794`) deixaria a ausência "invisível" (< 1 px) | **refutado** | `PaneRendererHistogram` (`lightweight-charts.development.mjs:14944-14963`) desenha no mínimo `tickWidth` (1 px de device) a partir da base, nos dois ramos (normal e invertido). A ausência sai com 1 px e o zero com a faixa inteira: a distinção por altura sobrevive. Falta de fato `collapsed` publicado: observabilidade, não correção |
| 3 | `rangeMax` na comparação dispara refeed a cada variação sub-pixel da legenda | eficiência | não é correção |
| 4 | altitude: fixar os valores das marcas e deixar só o autoscale seguir a faixa | simplificação | não é correção (removeria o candidato 1 pela raiz, vale para a próxima fase) |
| 5 | `throw` de invariante no `mount` apaga o gráfico inteiro | **inalcançável hoje** | `PANE_STACK` é constante, o registry é fixo e as duas pernas saem da mesma grade. O caminho de valor `< 0` já lançava antes da fase (`positiveValueSeriesLossless`) |
| 6 | glifo de barra da legenda completa só com a tinta de cima | cosmético | `LiquidationMarksLegend` é `sr-only` e o glifo é `aria-hidden` |
| 7-9 | `live.layout` morto, `liquidationMarksScaleOf` só com uso em teste, varredura linear no autoscale | limpeza e eficiência | não são correção |
| r1-fork | MF-1/MF-2 de `e2e/24` cegos, `unlabeledTickPriceFormat` inerte em escala overlay | **fechado pelo `W5-QA-FIX`** | declarado no código como defesa em profundidade. O teste RN-3 novo morde a mutação `up.bars = "right"` `[DOC: W5-QA-FIX-builder.md]` |
| r1-fork | `data-liquidation-sides` com 2 escritores (JSX e `liquidationLayoutFacts`) | PLAUSIBLE | as duas fontes leem o mesmo cache por `search`, e hoje não divergem |
| r1-fork | comentário novo em português em `charts/index.ts` (`// ── 10. o pane de liquidação fundido`, `plano 04 itens`) | convenção (tabela linha 5) | não é correção. Segue o padrão das seções irmãs do mesmo arquivo |

## PLAUSIBLE que ficam (não bloqueiam)

- **P-1** (candidato 1). A saída estrutural é o candidato 4: os valores de marca ficam constantes, só o autoscale
  acompanha a faixa, e acaba o segundo caminho de `setData`.
- **W-a** (herdado): `?e2eSwapLiquidationSides=1` e `?e2eLiquidationLogScale=1` chegam à produção. Há precedente
  (`?e2eDenseSeries=1`).
