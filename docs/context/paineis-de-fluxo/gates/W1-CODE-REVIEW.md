# W1 — code-review (nível high) sobre `master...wave/paineis-f01`

Data: 2026-09-25. Alvo: `wave/paineis-f01` em `c06d420`. Universo: `git diff --stat master...wave/paineis-f01`
→ **132 arquivos, +19.854 / −843** `[MEDIDO]`.

## 0. Veredito: NEEDS_FIX — portão INCOMPLETO, não reprovação por achado

A skill `code-review` (high) foi disparada como fork em background (`@code-review`, agente `6888d9`) e
**ainda estava rodando** quando o workflow exigiu a devolução. **Nenhum achado dela foi recebido nem verificado.**
Este laudo **não é** um APPROVED: aprovar um diff de ~20k linhas sem o resultado da revisão seria um portão que
não existe. O veredito NEEDS_FIX aqui significa **"re-rodar o portão até o fim"**, não "há defeito confirmado".

**Ação:** o orquestrador re-despacha o code-review (high) sobre o mesmo intervalo, com tempo para o fork
concluir, e este arquivo é substituído pelo laudo completo.

## 1. Passe independente e parcial deste agente (enquanto o fork rodava)

Lidos por diff: `sparse-series-feed.ts`, `host-series-feed.ts`, `seed-identity.ts`, `history-page-window.ts`
(`capWindowRightEdge`), `range-dispatch.ts` (`rebase`), `unlabeled-tick-format.ts`, `use-history-pager.ts`,
`[symbol]/page.tsx`, `axis-sync.ts`, `legend-reading.ts`, `pane-legend.ts`, `pane-scale-isolation.ts`,
`mark-band-geometry.ts`, e `SymbolClient.tsx:560-1310` (host único: mount, layout, efeito de página) e `:873-939`
(`LegendValue`). **Nenhum defeito de correção confirmado** nesse recorte.

Observação NÃO confirmada (candidata, severidade baixa, `[INFERRED: leitura de código, sem reprodução]`):
- `SymbolClient.tsx:1234-1297` + `pane-legend.ts::createCrosshairSlotStore` — o store guarda o índice LÓGICO do
  crosshair. Uma página que prepende N slots desloca todo índice lógico em +N, mas o snapshot do store só muda
  no próximo `crosshairMove`. Se o ponteiro estiver parado sobre o gráfico quando a página aplica, a legenda lê
  o slot `i` da grade NOVA (N slots mais antigo) até o ponteiro mexer. Falsificador: pausar o ponteiro sobre o
  Preço, disparar página por teclado/scroll sem mover o mouse, e comparar `data-legend-bucket-ms` com o bucket
  sob o crosshair.

**Não coberto por este passe:** as 6 bindings de pane em `SymbolClient.tsx` (`:1310-3400`), `pane-registry.ts`,
`pane-stack-layout.ts`, `axis-sync-provider.tsx`, `chart-options.ts`, e os 11 specs e2e novos/alterados.

## 2. Comandos

```
git -C .claude/worktrees/wave-paineis-f01 diff --stat master...wave/paineis-f01 | tail -1
git -C .claude/worktrees/wave-paineis-f01 diff master...wave/paineis-f01 -- <arquivos da §1>
```
