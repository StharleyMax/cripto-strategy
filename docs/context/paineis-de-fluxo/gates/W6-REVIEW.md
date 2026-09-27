# W6-REVIEW — revisão arquitetural da wave W6 (`03b`, `T-03.8`…`T-03.14`, mais os laudos da `T-03.7`)

**Feature:** `paineis-de-fluxo` · **Base:** `ef2ff95` (`wave/paineis-f03b`), diff `master...wave/paineis-f03b`
(merge-base `68e6d50` = `master`, **107** arquivos, **44** de código) · **Data:** 2026-09-27 · **Revisor:** `/review`
(read-only; não roda `gate-record`)
**Contra:** plano `03_oi_candle.md` §03b (itens 3b.1–3b.5, DoD 1–7), refs de `T-03.8`…`T-03.14` em `tasks.toml`,
`SPEC-009` §5 e §6.2–§6.7, `ADR-044` (D2, D3′), `ADR-045` (D1, D2, D2-bis, D3, §Falsificador, §Fora),
`ADR-034/D8`, `docs/arquitetura-do-codigo.md` §2, `CLAUDE.md` e `handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## 0. Veredito: **COMPLIANT**

Nenhuma das 8 regras bloqueantes foi violada, os 7 contratos de camada do `import-linter` continuam de pé e o scanner
de natureza não acha relógio em `domain`/`use_cases`. A projeção está onde `ADR-045/D2` manda (`sentimento`, função pura,
servida pela rota), o browser não deriva candle (`SPEC-009` §6.4) e o pane lê a legenda pelo slot (`ADR-044/D2`).
**1 WARNING herdado** (anterior à wave), **0 achado novo**. **1 condição de merge** que não é regra: a `D-3` do owner (§4).

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only master...wave/paineis-f03b \| grep -E '^(backend/src\|backend/tests\|frontend/src\|frontend/e2e\|deploy)/'` + `harness rules --mode file --path <f>` | **44** arquivos | **42** rc=0; **2** rc=2, os dois `[AVISO] core.module-docstring-single-line` (§3) `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]` (72 docstring, 5 hardcoded-url); **2** em arquivo do diff, ambos herdados `[MEDIDO]` |
| camadas (backend) | `cd backend && .venv/bin/lint-imports` | 266 arquivos, 1.391 dependências | **7 kept, 0 broken** `[MEDIDO]` |
| natureza | `bash backend/scripts/natureza.sh` | 140 arquivos de `domain`/`use_cases` | **0 leitura de relógio** `[MEDIDO]` |
| fronteira `charts`↔`web` | `npx eslint --no-warn-ignored <26 arquivos de frontend/src e frontend/e2e do diff>` | 26 | **rc=0** `[MEDIDO]` |
| append-only | `git diff master...wave/paineis-f03b -- docs ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'` | INDEX, DESIGN_SYSTEM, handoffs | **0** linhas removidas; `docs/INDEX.md` +11/−0 `[MEDIDO]` |
| autoria | `git log --format='%an <%ae>\|%cn <%ce>' master..wave/paineis-f03b \| sort \| uniq -c` ; `grep -ci co-authored-by` | 38 commits | 38 do owner, **0** trailer `[MEDIDO]` |

## 2. Camada da arquitetura declarada — o que foi conferido, com a citação

| decisão | onde no código | resultado |
|---|---|---|
| `ADR-045/D1` (close = `p(T1)` ou última de `S`; open = `p(T0)` exato, senão primeira de `S` com `\|S\|≥2`; sem candle com `S` vazio ou `\|S\|=1` sem âncora; H/L sobre `{open}∪S`) | `backend/src/modules/sentimento/domain/oi_candle.py` (`project_oi_candles`, `_project_bucket`, lookup exato por `dict` em `T0`) | conforme |
| `ADR-045/D2` (trio `(STOCK, POINT, POINT_AT_BUCKET_END)`, outro trio falha alto) | `oi_candle.py` `OI_CANDLE_TRIO`, `UncoveredOiCandleTrioError`; `oi_candle_source_or_none` só para a pergunta "este painel é OI?" da rota | conforme |
| `g` do `SeriesKey`, nunca por parse (`ADR-037/D3`) | `oi_candle.py`: `g = entry.native_grid_ms`; o chamador não passa `g` | conforme |
| `ADR-045/D2-bis` (um candle, uma série) | `domain/oi_candle_regimes.py`: projeta cada série separada e escolhe por `p_poll(T0)`; nenhum caminho segura leituras das duas séries na mesma lista | conforme. A extensão para larguras desiguais (TF `1m`) está rotulada `[INFERRED]` no próprio módulo, com dono citado (`[Q-DG-3]`) |
| `ADR-045/D3` + `SPEC-009` §6.4 (10 campos, `samples` como par de inteiros, `derived_from` fechado em 2 valores) | `OiCandle.to_wire`, `OiCandleSource`; espelho em `frontend/src/app/symbol/series-history-envelope.ts:81-107` | conforme. `sources[].bucket_interval_ms` é a declaração que `SPEC-009` §6.5 pede, e fica fora da linha do candle |
| rota serve ao lado de `rows`, sem mexer no `last` de `ADR-040/D1` | `use_cases/series_history.py` `_oi_candle_report`; `domain/series_history_report.py` (`oi_candles` explícito `null` fora de OI) | conforme |
| camadas `infra > use_cases > domain` (`arquitetura-do-codigo.md` §2) | bancada dos falsificadores: `domain/oi_candle_falsifiers.py` puro, `use_cases/measure_oi_candle_falsifiers.py` chama a função da rota, `infra/oi_candle_falsifier_cli.py` + `infra/csv_series_window_reader.py` | conforme (`lint-imports` 7/0). Leitor único do `as_of`: 2 importadores de tipo declarados em `test_as_of_is_the_single_reader.py:493-500`, com o motivo |
| `ADR-045` §Alternativas ("derivar no browser" recusado) + `SPEC-009` §6.4 ("o browser não deriva") | `frontend/src/app/symbol/oi-candle-pane.ts`: só posiciona na grade o que a rota serviu (`:157-160` copia `open/high/low/close` do fio) | conforme |
| `SPEC-009` §5 (registry: `kind` do pane `oi` = `candlestick`) + plano DoD-6 (ablação volta a `line`) | `pane-registry.ts` `F1_PANE_DATA_KIND.oi`, `oiPaneSeriesKind(lineAblation)`; `SymbolClient.tsx` monta o kind lido do registry | conforme. A flag `?e2eOiLine=1` segue o precedente de `e2eSwapLiquidationSides`/`e2eDenseSeries`, já em `master` |
| `SPEC-009` §5 inv. (iv) + `RF-5` (rótulo derivado, nunca literal) | `oi-candle-pane.ts:242` monta `DERIVADO (OHLC de amostras <termo> · ADR-045)` a partir de `native_grid_ms` da fonte do candle | conforme |
| `ADR-044/D2` (legenda lê o slot por `param.logical`, nunca `seriesData`) | `SymbolClient.tsx` `OiCandleLegend` via `resolveLegendReading`; `grep -n seriesData` nos arquivos novos: 0 | conforme |
| `ADR-044` (um `createChart`, panes nativos) | a série entra por `chart.addSeries(CandlestickSeries, style, paneIndex)` dentro de `useHostedPane("oi")`; nenhum `createChart` novo no diff | conforme |
| `ADR-034/D8` (web importa `charts` só pelo barrel) | `oi-candle-pane.ts:32`, `oi-regime-primitive.ts:36`, `SymbolClient.tsx:121`: todos de `../../charts/index.ts`; ESLint rc=0 | conforme. Os `e2e/36-38` importam `../src/charts/color-tokens.ts` direto, como `e2e/11,15,23,24,28-34` já faziam em `master` |
| token novo de cor (`charts` dono da cor, `ADR-003`) | `frontend/src/charts/color-tokens.ts` `OI_REGIME_BAND_SURFACE`, com a linha em `docs/product/DESIGN_SYSTEM.md` e o contraste medido contra as duas superfícies em `color-contrast.test.ts` | conforme |
| `ADR-045` §Falsificador 3–4 antes do pixel (plano 3b.3) | `gates/T-03.10-builder.md` (4 falsificadores `held`, `n≥288`) e `gates/W6-QA-BACK.md` (reproduzidos em export novo) | a ordem foi seguida: o pixel (`T-03.11`+) depende de `T-03.10` no DAG. O julgamento do número é do QA, não desta revisão |
| dado bruto fora do repositório (`CLAUDE.md` §Dado bruto) | os `*-facts.json(l)` de `gates/` são agregados de medição (`n`, percentis, contagens), não linhas de `md.series`; o CSV exportado não foi versionado (`T-03.10-builder.md` §2) | conforme. Os hex de 64 caracteres em `T-03.12-*.py.txt` são `series_key_id`, não segredo |

## 3. Achados

- **[WARNING] (herdado, fora da wave)** docstring de módulo que não fecha na primeira linha, em
  `backend/src/modules/sentimento/domain/series_history_report.py:1` e `backend/src/modules/sentimento/use_cases/series_history.py:1`,
  regra **`core.module-docstring-single-line`** (severidade aviso, fora das 8 bloqueantes). A 1ª linha é **idêntica em `master`**
  (`git show master:<f> | head -2`), então a wave só tocou arquivos que já avisavam. **Correção:** fechar o `"""` na 1ª linha
  e passar o resto para comentário `#` (a forma que os 4 módulos novos da wave já usam), numa task própria, porque há mais 70
  ocorrências na árvore.

Nenhum BLOCKER. Nenhum achado novo de arquitetura.

## 4. Condição de merge (não é regra, não entra no veredito)

`handoff/DECISOES-DO-OWNER-2026-09-27.md` **D-3** `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`:
*"a 03b roda em paralelo com a janela nova; o merge da W6 só depois de a T-03.7 passar"*. `gates/T-03.7-t1.md` deu
`COUNT_LOW_AND_DISK_HIGH`; a nova janela de 24 h começou em 2026-09-27T11:39Z e **não tem veredito ainda** (`W6-QA-BACK.md`).
Por isso `T-03.8` (`depends_on = ['T-04.7', 'T-03.7']`) foi construída antes de a dependência fechar, e isso é coberto pela D-3.
**Este COMPLIANT não libera o merge por si só.** Cabe ao orquestrador conferir o laudo da nova janela da `T-03.7` antes.

## 5. Fora do escopo desta revisão

- `make verify` e mutação são do QA. `handoff/W6-QA-FRONT.md` registra verify vermelho contaminado por instrumento
  (`e2e/38:1061`) e o mutante U2 sobrevivente. Esta revisão não julga isso e não substitui aquele portão.
- O veredito do `ux-ui-mastery` (DoD-7, `T-03.14`) está em `gates/T-03.14-design-review-r2.md` e não foi reavaliado aqui.

## 6. Falsificador deste laudo

Se `harness rules --mode sweep` na cabeça da wave mostrar um `[BLOQUEIO]`, se `lint-imports` devolver um contrato
quebrado, ou se `grep -nE 'open|high|low|close' frontend/src/app/symbol/oi-candle-pane.ts` mostrar um valor calculado
a partir de `rows` em vez de copiado do fio, este COMPLIANT cai.
