# W5-QA: handoff (tentativa 1, saída pelo portão R6)

**Portão:** QA de front da wave W5 (`paineis-de-fluxo` fase `04`) · **Worktree:** `.claude/worktrees/wave-paineis-f04`
(`wave/paineis-f04`, HEAD `e8b9aca`) · **Portas:** 8845/4345 · **Data:** 2026-09-27 (UTC 05:00–05:40)
**Estado:** PARCIAL. O laudo `gates/W5-QA.md` **ainda não existe**. Nenhum veredito foi emitido.

## 1. O que já foi medido

### 1.1 `make verify` (rodada interrompida pela devolução, NÃO vale como portão)

Comando: purga de `__pycache__` e depois `VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify`, iniciado
às 05:03:37Z. Log bruto: `/tmp/verify-wave-paineis-f04-20260927T050337Z.log`. Até a devolução: `lint-backend`,
`lint-frontend` (ESLint + `tsc --strict`), `test-frontend` **1139 pass / 0 fail**, `test`, `boundaries` 7 kept,
`regras` **0 bloqueio / 77 avisos**, `política` OK. e2e: **81 de ~91 concluídos, 0 `✘`**
(`grep -c "✓\|✘"` → 81, `grep "✘"` → vazio). O processo morre quando este agente devolve, então **o próximo precisa
rodar de novo** (com `run_in_background`).

### 1.2 Latência, da rodada acima `[MEDIDO, n=1 rodada]`

| spec | W5 (esta rodada) | W1-QA-r3 | teto |
|---|---|---|---|
| `e2e/17` p95 / max, n=86 | **32,8 / 33,1 ms** | 32,7 / 37,6 | 160 |
| `e2e/20` página p95 (n=15) | **94,3 ms** | 83,7 | 400 |
| `e2e/20` intra-gesto p95 / max, `over_ceiling_n` | **49,1 / 84,0 ms**, n=321, **0** | 41,2 / 81,9, n=323, 0 | 160 |

Dentro dos tetos. A página (+10,6 ms) e o intra-gesto p95 (+7,9 ms) subiram contra a W1, mas `n=1` rodada em dias
diferentes; o W1-QA-r2 já tinha medido página p95 89,7/114,3. **Falta o A/B na mesma janela** (§2, item 2) para dizer
se é regressão ou ruído.

### 1.3 Leitura estática (feita)

- Plano 04 (DoD 1–7), `W1-QA-r3.md`, relatórios `T-04.0`..`T-04.6` e o `T-04.7-design-review.md` (APPROVED WITH
  CONDITIONS 65/100; ele declara que a **metade Stitch de `CA-12` não foi coberta**, e escala o **E-7: pipeline
  parado desde 2026-09-27 00:22Z**). Conferi com psql só leitura às 05:05Z: liquidação long/short `max(bucket_end)` =
  `00:20:00`, 145.289/145.286 linhas, igual ao `T-04.6` §2.3.
- Doc delta: `docs/INDEX.md` **+7/−0** e `SPEC-009` **+7/−0** (`git diff master...HEAD --numstat`): append-only ok.
  STITCH/DESIGN_SYSTEM sem mudança, com motivo no `T-04.4-builder.md` §Doc delta.
- `liquidation-geometry.test.ts` (735 linhas, onde viviam as mutações K1/K2 da W1) foi **apagado** em `c8a0e2b`
  (`T-04.2`), com motivo (geometria de dois panes que não existe mais) em `T-04.2-builder.md:96`. O `keepFloor` da
  liquidação saiu com ele; o zero fixo em 0,5 é o equivalente (`liquidation-pane-geometry.ts:44`).
- Candidatos a achado, **ainda não confirmados por medida**:
  - **W-a:** dois novos interruptores de ablação lidos da URL no código de produção
    (`?e2eSwapLiquidationSides=1`, `?e2eLiquidationLogScale=1`, `SymbolClient.tsx:1724,1736`). Há precedente no
    `master` (`?e2eDenseSeries=1`, ablação de `axis-sync`), então **não** é padrão novo. Mas o de troca de lado faz
    a tela de produção desenhar a convenção INVERTIDA (short embaixo em vermelho) sem aviso visível. WARNING.
  - **W-b:** as proteções da W1 `E` (`createPanesBeforeSeries`) e `F` (`unlabeledTickPriceFormat` na barra) podem
    ter virado **mutação nula**: as barras agora ficam em escalas nomeadas (`liquidation_up`/`_down`), que não fazem
    merge no template `right` nem desenham eixo. Rodar E e F contra `e2e/24:597` (§2, item 3).
  - **W-c:** ninguém mediu o **rótulo do crosshair no eixo de preço** com o ponteiro na metade de BAIXO do pane. Se
    ele aparecer, a escala de cima rotularia USD negativo (`unlabeled-tick-format.ts:19-27` só zera os ticks, e o
    `formatter` do crosshair continua `toFixed(2)`). Isso violaria `RN-3`/`CA-9′`. Rodar o `probe.mjs` e **olhar os
    PNGs** `hover-lower*.png`.

## 2. O que falta, em ordem

Scripts prontos no scratchpad desta sessão (legíveis por `/tmp`), em
`/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad/w5/`:
`proxy.mjs` (só GET/HEAD `:8845 → :8000`, 405 no resto), `real.sh up|down` (proxy + `next build` + `next start :4345`),
`probe.mjs <out> <base> [query]`, `mutate.py`, `mut-e2e.sh <tag> <file> <old> <new> <filtros>` (universo fraco,
`git checkout -- frontend/src` no fim), `lat-ab.sh` (A/B `e2e/17`+`e2e/20` ×3, master contra wave, 2 rodadas).
Uma cópia do `master` `613719a` com `node_modules`/`.venv` por hard link está em `…/w5/master`.

1. `make verify` completo de novo (§1.1). Classificar vermelho contra `16:204`, `18:107`, `18:153`, `20:383`.
2. `lat-ab.sh` na janela exclusiva, depois do verify, sem nada rodando junto.
3. Mutações (cada uma revertida, `git status --short` vazio depois):
   - unit, `node --conditions=react-server --test src/charts/liquidation-pane-geometry.test.ts`:
     Q1 `{ up: false, down: true }` → `{ up: false, down: false }` (`liquidation-pane-geometry.ts:110`);
     Q2 `for (const entries of present) {` → `for (const entries of present.slice(0, 1)) {` (`:472`, `C-3`).
   - e2e (`mut-e2e.sh`): Q3 `data={liquidation[cohort]}` → `data={liquidation[cohort === "short" ? "long" : "short"]}`
     (`SymbolClient.tsx:3035`) contra `35-liquidation -g design`; Q4 `down: "directionDownFill",` →
     `down: "directionUpFill",` (`:1788`) contra `35-liquidation -g design` e `32-liquidation`; E (remover a chamada
     `createPanesBeforeSeries(chart, PANE_STACK.stretchFactors.length);`, `:1100`) e F (`priceFormat:
     unlabeledTickPriceFormat(),` removido, `:2928`) contra `24-single-chart`.
4. App real: `real.sh up`; `E2E_BASE_URL=http://127.0.0.1:4345 E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1
   playwright test 35-liquidation 13-liquidacoes 16- 22- 26- 27-` (dado real, com as ablações do `e2e/35`); depois
   `node probe.mjs <out> http://127.0.0.1:4345` e o mesmo com `?e2eSwapLiquidationSides=1`; ler os PNGs; `real.sh down`
   e registrar `proxy_get_requests_total` e `refused`.
5. Escrever `gates/W5-QA.md` no formato do `frontend-qa` e commitar **só ele** (e testes, se houver). Não rodar
   `gate-record`. Este handoff pode ser apagado ou mantido; o laudo é o que conta.
