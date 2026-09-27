# W5-QA-r2 — QA de front da wave W5 (`paineis-de-fluxo`, fase `04`: liquidação num pane)

**Worktree:** `.claude/worktrees/wave-paineis-f04` · **branch:** `wave/paineis-f04` · **HEAD medido:** `96f5303`
(inclui o `W5-QA-FIX`) · **diff:** `master...wave/paineis-f04` (`master` = `613719a`) · **portas:** 8845/4345 ·
**data:** 2026-09-27, 05:32–06:30 UTC · **entrada:** `handoff/W5-QA.md` (tentativa 1, sem veredito) e
`gates/W5-QA-FIX-builder.md`.

## QA Gate (Front) — Fase 04: liquidação num pane

- [OK] DoD da fase, item a item, com o comando de cada um (§1)
- [OK] Lógica fora do componente: forma em `liquidation-pane-form.ts`, geometria em `charts/liquidation-pane-geometry.ts`, swatch em `liquidation-legend-swatch.ts`, cada um com teste unitário próprio
- [OK] Contrato tipado e validado na borda: `LiquidationPaneError` recusa valor `< 0` antes do `setData` (`liquidation-pane-geometry.ts:422-424`); `frontend/src` não ganhou `fetch(` nem URL (`git diff master...HEAD -- frontend/src | grep -E '^\+' | grep -cE 'fetch\(|https?://[a-z]'` → **0**)
- [OK] Sem segredo no cliente: as 9 linhas acrescentadas que casam `api.?key|secret|password|COINALYZE|Bearer|postgres://` são todas prosa sobre a fonte Coinalyze, nenhuma é credencial `[MEDIDO: grep sobre git diff master...HEAD -- frontend, n=9]`
- [OK] Acessibilidade: nenhum interativo novo. O quadrado da perna é decorativo, e o nome da perna está em texto. `forced-colors` coberto por `e2e/33` (C-7)
- [OK] Testes existem, passam e têm o par morde/cala: **12/12 mutações de produção reprovam**, e o controle nulo fica verde (§3)
- [OK] Cobertura: front **1139 pass / 0 fail** em 4 suítes. O front não tem medidor de cobertura em portão, e o plano 04 não declara alvo de cobertura `[NÃO MEDIDO]`. Back 96,23% (`make verify`)
- [OK*] `harness rules --mode sweep --changed-only`: `rc=0` **com saída vazia**, o que é ambíguo, e por isso foi desambiguado (§5). Instrumento: cego para TS nos 2 canários
- [OK] `make verify` verde (§2)
- [OK] Doc delta correto: `docs/INDEX.md` **+8/−0**, `SPEC-009` **+7/−0** (nota de `[Q-DG-2]`) (`git diff master...HEAD --numstat`). Sem referência velha a dois panes em `arquitetura-fluxos.md`/`STITCH_CONTEXT.md`/`DESIGN_SYSTEM.md` (`grep -nE 'liquidation_long|liquidation_short'` → 0)
- [OK] Rótulos de força e números com comando nos relatórios da wave. O `W5-QA-FIX-builder.md` diz *"refutado"* e *"confirmado"* com a medida ao lado. Refiz as duas medidas (§3, G/E/F)

**Veredito: APPROVED.** Não há BLOCKER. Há 5 WARNINGs (§6), e um deles é latência: dentro do teto, mas com deslocamento medido.

## 1. DoD do plano `04`, item a item

| # | item | comando | resultado |
|---|---|---|---|
| 1 | **F-6** (bases ≤ 1 px, nenhum `< 0` em `setData`) | `e2e/35` "real data" no app real (§4) | bases nas linhas **147/148**, distância **1 css px**: passa, mas encostado no limite. `noNegativeFed`: **0** negativos em 12 chamadas / 6 séries `[MEDIDO]` |
| 2 | **CA-LIQ**, lado e cor, `n ≥ 20` | idem | `bucketsWithPositive` = **33** (short 24, long 12), 0 defeito. **Ablação** (`scale_ref` trocado) no dado real: **61 defeitos**, reprova. Mutações Q3/Q4 reprovam (§3) |
| 3 | **CA-9′** (a)(b)(c) | idem | (a) 0 negativo. (b)+(c): **135** buckets julgados, **3** com as duas pernas `> 0` e distintas (então (c) é **conclusivo**, `n=3`), 0 defeito. Ablações soma/diferença/negação reprovam no gate e no real (`negatives` **832** no real) |
| 4 | **CA-10′** por perna | idem | short: ausente **102** (`3w0s`) × zero **9** (`0w7s`). Long: ausente **102** × zero **21**. Renderizam diferente, e a ablação que funde os dois reprova |
| 5 | **Pane único, 5 panes com N>0** (`CA-1′`) | `real_ca1` | `charts=1`, `oldLiquidationPanes=0`, pontos: preço 3825 · liquidação 781 · OI 3795 · L/S 5420 · CVD 3812 |
| 6 | **Não-regressão DoD-1/DoD-2** | `e2e/13` no app real | status **200** nas duas coortes, long **783** linhas com valor em 5760 slots (**418** não-zero), DOM == API (783/365). Verde |
| 7 | `make verify` + `ux-ui-mastery` | §2 · `gates/T-04.7-design-review.md`, `gates/W5-DESIGN-REVIEW.md` | verify VERDE. Design **APPROVED WITH CONDITIONS 65/100** `[DOC]` |

## 2. `make verify`

Comandos: purga de `__pycache__`, depois `VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify` →
`rc=0`, log `/tmp/verify-wave-paineis-f04-20260927T053232Z.log`. **VERDE, 8 portões:** lint-backend (474 arquivos) ·
lint-frontend (ESLint + `tsc --noEmit --strict`) · test-frontend **1139 pass / 0 fail** · test **2816 passed**, 96,23% ·
boundaries 7 kept · regras 0 bloqueio / 77 avisos · política OK · e2e **87 passed / 5 skipped / 0 `✘`**
(`grep -c '✘'` → 0). Os skips são `e2e/15` CA-2/CA-4 (W-4 herdado), `e2e/30:434` e os 2 "real data" do `e2e/35`
(universo fraco, sem leitor de `md.series`). Os dois do `e2e/35` rodaram no app real, em §4. Nenhum vermelho, nem da
lista conhecida (`16:204`, `18:107`, `18:153`, `20:383`).

## 3. Mutações (cada uma revertida; `git status --short` → vazio depois de cada uma)

Unitárias: `node --conditions=react-server --test <arquivo>`. e2e: `mut-e2e.sh` (`scripts/e2e-env.sh up 1 8845 4345`,
universo fraco, `next build` a cada mutação).

| # | mutação | reprova | cala |
|---|---|---|---|
| Q1 | `LIQUIDATION_INVERTED_SIDE` `down: true → false` (`liquidation-pane-geometry.ts:110`) | geometry **4 fail** / 14 | 10 |
| Q2 | `C-3`: máximo só da 1ª perna (`present.slice(0, 1)`, `:472`) | geometry **2 fail** / 14 | 12 |
| Z | zero fixo `0.5 → 0.6` (`liquidation-pane-form.ts:42`) | form **2 fail** / 3 | 1 |
| Q3 | pernas trocadas no `data=` da legenda (`SymbolClient.tsx:3035`) | `e2e/35:1024` **1 failed** (`legend: defects`) | 6 passed (`e2e/32` inclusive) |
| Q4 | `down: "directionDownFill" → "directionUpFill"` (`:1788`) | `e2e/32:290`, `e2e/32:316`, `e2e/35:1024` (**3 failed**) | 4 passed |
| G | barra de cima no `right` (`LIQUIDATION_SCALE_IDS.up.bars = "right"`) | `e2e/24:703` RN-3 **1 failed** (*"o eixo rotulou o preço sob o ponteiro"*) | `e2e/24:616` T-01.11-FIX **passa**: é exatamente a lacuna que o RN-3 novo fecha |
| E | sem `createPanesBeforeSeries(…)` (`:1100`) | `pane-scale-isolation.test.ts` **1 fail** / 4 | 3 |
| F | sem `priceFormat: unlabeledTickPriceFormat()` (`:2928`) | `unlabeled-tick-format.test.ts` **1 fail** / 2 | 1 |
| K2 | `pane-stack-layout.ts:232` sempre `base.bottom * (1 - reserve)` (W1) | `pane-stack-layout` + geometry **1 fail** / 30 | 29 |
| V1 | `legendSlots` sem `s2Window` (`panel-assembly.ts:217`) (W1) | **2 fail** / 13 | 11 |
| D | `index === originIndex && false` (`range-dispatch.ts:194`) (W1) | `e2e/16:149` **1 failed** | 1 passed |
| C2 | `axis` nas deps do efeito de montagem (`SymbolClient.tsx:1230`) (W1) | `e2e/20:728`, `e2e/22:202` (**2 failed**) | — |
| NULL | controle: substituição idêntica, mesmo roteiro | — | `e2e/35`+`32`+`24`: **13 passed / 2 skipped** |

**Contra o fecho da W1 (`W1-QA-r3.md` §5):** V1, K2, D e C2 continuam mordendo. E e F **não mordem mais no e2e**
(W-b, confirmado pelo `W5-QA-FIX` e refeito aqui), mas mordem no pino unitário. K1 (`keepFloor` da barra) sumiu junto
com a geometria de dois panes, e o equivalente é o zero fixo, que Z protege. B/B2 não foram refeitas, porque o
código de `key`/TF não mudou nesta wave. `e2e/18` e `e2e/26` ficaram verdes no gate e no real.

## 4. App real, dado real (proxy só-leitura)

`real.sh up`: proxy GET/HEAD `:8845 → 127.0.0.1:8000`, que devolve 405 no resto, mais `next build` e `next start :4345`
na worktree. Depois: `E2E_BASE_URL=http://127.0.0.1:4345 E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1
playwright test 35-liquidation 13-liquidacoes 16- 22- 26- 27-` → **17 passed, 0 skipped** (5,5 min). Os números de §1
vêm daí. Ao fechar: `proxy_get_requests_total=963 refused=0`. **Nenhum INSERT, nenhum seed.** O `psql` rodou com
`default_transaction_read_only=on`, só para ler `max(bucket_end)`.

Pixel (`probe.mjs`, 1280×1200, DPR 1): com o ponteiro a 0,3 / 0,75 / 0,9 da altura do pane, **a célula do eixo à
direita fica vazia** (li `hover-lower.png`). Sem rótulo de USD negativo, então W-c está refutado também no dado real.
Com `?e2eSwapLiquidationSides=1`, a tela de produção desenha long em cima em verde e short embaixo em vermelho, e a
legenda troca junto (li `probe-r2-swap/rest.png`). Isso é W-a.

**E-7 continua:** todo `md.series` recente para em **2026-09-27 00:22:00Z** (BTC/ETH/SOL/LINK), e às 06:04Z a leitura
atual é *"ausente"* (`e2e/13`: `liquidation_last_reading:long:absent`). É operação do pipeline, não defeito da wave. A
janela histórica (5760 slots) basta para todos os critérios.

## 5. Regras bloqueantes: desambiguação do `rc=0` vazio

`harness rules --mode sweep --changed-only` → `rc=0`, sem saída. A árvore estava limpa, então essa chamada não tinha
nada para medir. Por arquivo, `harness rules --mode file --path <f> --format ndjson` sobre os **24** arquivos
A/M de `frontend/src`+`frontend/e2e` → 0 bloqueio. **Canários:** `from .x import y` + `print()` em `backend/src` →
`{"decision": "block", … core.relative-import}`, e ali o instrumento morde. Em `frontend/src/qa-canary.ts`, `import …
from "../b"` e uma string `postgres://user:pass@…` → **silêncio**. ⇒ No TS, o `0 bloqueio` **não prova nada** para
relative-import e hardcoded-secret. O segredo foi coberto à parte, pelo grep do checklist. Canários apagados, e
`git status --short` ficou vazio. Não bloqueia (o instrumento é da política, não da wave). Está em W-5.

## 6. Latência (janela exclusiva) e WARNINGs

A/B na mesma janela, com nada rodando junto: cópia fiel do `master` `613719a` (256/256 arquivos de `frontend/src`,
`frontend/e2e`, `scripts` com o mesmo md5) contra a wave, `lat-ab.sh` (`e2e/17` + `e2e/20`, `--repeat-each=3`,
2 rodadas por árvore, **n=6 por braço**). Teste de permutação exato, unicaudal:

| métrica | master (mediana / max) | wave (mediana / max) | p | teto |
|---|---|---|---|---|
| `e2e/17` p95 | 25,5 / 32,9 | 29,0 / 33,0 | 0,35 | 160 |
| `e2e/20` página p95 | 84,3 / 96,3 | **93,5 / 108,3** | **0,032** | 400 |
| `e2e/20` intra-gesto p95 | 44,0 / 50,4 | 44,2 / 52,2 | — | 160 |
| `e2e/20` intra-gesto max | 84,0 / 98,0 | **97,8 / 113,3** | **0,021** | 160 |
| `over_ceiling_n` | 0 ×6 | 0 ×6 | — | 0 |

O `make verify` da wave está em linha: `e2e/17` p95 **32,9** / max 40,4 · página p95 **94,8** · intra p95 **49,3** /
max **97,2**, n=316, over 0. O `master` desta janela bate com a W1 (página 83,7, intra max 81,9 no `W1-QA-r3`).

- **W-1 LATÊNCIA (novo):** todos os tetos se mantêm, e o `e2e/17` não se moveu. A paginação e o pior intervalo
  intra-gesto, porém, subiram **~+9 ms** e **~+14 ms** na mediana, com p ≈ 0,02–0,03 em n=6. Corrigindo para as 3
  métricas testadas, isso deixa de ser significativo `[INFERRED: Bonferroni ×3 → 0,06–0,10]`. A causa provável é o
  custo por página das 4 escalas e 4 séries da liquidação fundida `[INFERRED: não atribuí]`. **Falsificador:** se o
  próximo A/B repetir mediana de página ≥ +9 ms, é regressão, e ela vai para o `frontend-builder` com perfil.
- **W-2 (W-a, herdado de precedente):** `?e2eSwapLiquidationSides=1` e `?e2eLiquidationLogScale=1`
  (`SymbolClient.tsx:1711-1736`) invertem ou deformam a convenção **na tela de produção**, sem aviso visível. Existe
  precedente no `master` (`e2eDenseSeries`, `e2eAxisSyncDisabled`, `e2ePageApplyBusyMs`), e o builder recusou
  corrigir por isso. Para desligá-los em build de produção, seria preciso um padrão novo, com ADR.
- **W-3 (W-b, fechado com ressalva):** E e F só têm pino de fonte (unitário), não de pixel. O efeito que eles evitam
  ficou inalcançável pelo produto desde que as barras foram para escalas nomeadas. O `RN-3` (`e2e/24:703`) cobre o
  defeito real (G).
- **W-4 (F-6 no limite):** a distância das bases é **1 css px**, igual ao teto `≤ 1`, no dado real (DPR 1). Um
  arredondamento a mais reprova. Vale só como observação, porque o critério é `≤`.
- **W-5 (instrumento):** as regras bloqueantes não mordem em TS nos canários de relative-import e de segredo (§5).
  O "0 bloqueio" do front vale menos do que parece.
- Herdados e não reabertos: E-7 (pipeline parado), a metade Stitch de `CA-12` não coberta (`T-04.7`), SF-15..18 e
  OBS-W5-1 do design, `e2e/15` CA-2/CA-4 SKIPPED, e mojibake nos títulos do `e2e/13` (270 → 265 ocorrências de
  `Ã`, preexistente).

## 7. Comandos e artefatos

Scripts: `scratchpad/w5/{proxy.mjs,real.sh,probe.mjs,mutate.py,mut-e2e.sh,lat-ab.sh}` da sessão `854f12b5`. Logs:
`lat-{master,wave}-r{1,2}.log`, `mut-{Q3,Q4,G,D,C2,NULL}.log`, `real-r2.log`, `probe-r2/`, `probe-r2-swap/`. O
verify está em `/tmp/verify-wave-paineis-f04-20260927T053232Z.log`. Este QA não criou teste novo: o `RN-3` do
`W5-QA-FIX` já fecha a lacuna W-c, e a mutação G o confirma. O código de produção não foi tocado. `gate-record` não
foi rodado.
