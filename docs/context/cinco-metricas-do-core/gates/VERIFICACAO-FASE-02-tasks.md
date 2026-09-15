# Verificação de completude da fase `02` (CVD) — as 8 tasks, medidas em `master`

> **Auditoria read-only** pedida pelo owner em 2026-09-15 para decidir se o `gate-record` da fase
> pode ser gravado. **Nada foi escrito no ledger por esta auditoria**, nenhum código/teste tocado,
> Postgres somente leitura, sem deploy.
>
> ⛔ **O `tasks.toml` diz `status = "todo"` nas 8** (`tasks.toml:280,298,316,334,350,366,382,399`).
> Isto **não é evidência de nada** — o documento está desatualizado e a medição abaixo é por
> **código em `master`** e por **produção viva**, não por texto.

## 1. O denominador, antes do veredito

| o que | quanto | comando |
|---|---|---|
| árvore auditada | `master` em `d0cb997`, working tree **limpo** | `git status --porcelain` → 0 linhas |
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras bloqueantes violadas | **0**, em **7** arquivos da fatia | `harness rules --mode file --path <arquivo>` (7 chamadas) |
| avisos (não bloqueiam) | **2** × `core.module-docstring-single-line` | `series_catalog.py:1`, `collector_series_mapping.py:1` — pré-existentes, severidade `AVISO` |
| PRs candidatas | **3/3 `MERGED`** | `gh pr view 218/219/220` → `2026-09-12T18:04Z`, `20:32Z`, `22:02Z` |

## 2. A tabela — uma linha por task

| task | em `master`? | a prova |
|---|---|---|
| `T-02.1` falsificador de `reconstructed_from` **rodado** | ✅ | `scripts/cvd-klines-falsifier/falsify_reconstructed_from.py` (commit `b3febfb`) + laudo `gates/T-02.1-falsificador-reconstructed-from.md` — veredito `DIRECT_READ` ⇒ `reconstructed_from=None`. **A produção concorda**: o catálogo servido devolve `"reconstructedFrom": null` na entrada `cvd_source/binance/NA`. |
| `T-02.2` quarta entrada do `cvd_source_catalog` | ✅ | `backend/src/modules/sentimento/domain/cvd_source_catalog.py:304` `build_kline_takerbuy_entry` — a 4ª ao lado de `build_aggtrade_q_entry:197`, `build_aggtrade_nq_entry:232`, `build_coinalyze_bv_entry:264`. Invariante `takerBuy <= volume` testada em `backend/tests/sentimento/test_kline_cvd.py:77,88,97`; `verifiedBy="test_cvd_source_catalog.py"` na entrada servida. |
| `T-02.3` `delta_cvd = 2 × takerBuyBaseVol − volume` | ✅ | `backend/src/modules/sentimento/domain/kline_cvd.py:65` `kline_cvd_delta`, índice `[9]` em `infra/binance_klines_client.py:67` `TAKER_BUY_BASE_VOLUME_INDEX`. **Zero rede nova** provada por `backend/tests/sentimento/test_collector_klines_mapping.py:310` `test_one_closed_bar_publishes_both_the_volume_row_and_the_cvd_row` — **uma** resposta, **duas** identidades. |
| `T-02.4` entrada de CVD/binance no `SeriesCatalog` servido | ✅ | `backend/src/modules/sentimento/use_cases/series_catalog.py:288`, dentro da lista `entries`. **Servido em produção**: `GET /api/v1/series-catalog` → `n_entries=60` (15 × 4 símbolos), com `cvd_source|binance|NA|1m`, `series_key_id=18125f63…b2130`. |
| `T-02.5` `CvdPane` com dado e `SEM_PONTO` honesto | ✅ | `frontend/src/app/symbol/SymbolClient.tsx:685` `CvdPane`, alimentado por `page.tsx:355` (`CvdPaneData`); `data-testid="cvd-pane"` presente no DOM real; fatos `cvd_readable_horizon`, `cvd_last_reading`, `cvd_cumulative_anchor`, `cvd_legend:2` em `SymbolClient.tsx:640,668,760,771`. |
| `T-02.6` e2e Playwright contra o app real, `N ≥ 30` | ✅ | `frontend/e2e/10-cvd-dado-real.spec.ts` (404 linhas, commit `5fe218d`), `MINIMUM_DISTINCT_POINTS = 30` em `:69`, assert em `:378-381`; sem `skip`/`fixme`. Rodado no **universo FORTE** com `N=293 ≥ 30` e **controle negativo** (`TAIL_BARS 300→10` ⇒ `rc=1`, *"a tela declara 1"*) — `gates/F02-QA-integracao-cvd-e-portao-e2e.md:25,28-30`, veredito `APPROVED`. |
| `T-02.7` CVD em **produção**, `DoD-1` e `DoD-4` | ✅ **(código deployado + números medidos agora; gate nunca escrito — ver §4)** | `DoD-1`: `select count(*) … where series_key_id='18125f63…'` → **53.438** linhas `BTCUSDT`, `2026-09-05 23:43Z → 2026-09-15 21:38Z`. `DoD-2`: `GET /api/v1/series-history … bar_policy=final_only`, janela de 1 h → `HTTP 200`, **58 de 60** grades com valor, **58 distintas**. `DoD-4`: `md.ingest_run where endpoint ilike '%klines%'` → `ACCEPTED`, **4.449** runs, `n_written = 595.080`. E o binário deployado **é** o `master`: `sha256sum` idêntico em `cvd_source_catalog.py`, `kline_cvd.py` e `series_catalog.py` (`master` vs `/app` em `deploy-api-1`). |
| `T-02.8` fechamento vertical da fatia | ⚠️ **substância sim, artefato não** | Os itens que a task exige estão **verdes e medidos** (§3, incluindo o pixel), mas **não existe gate de fechamento escrito** — `ls gates/ \| grep T-02.8` → nenhum arquivo; `grep -rl 'T-02.8' docs/` só acha `tasks.toml`, `PLANO-PARALELISMO.md`, `tasks_review.md` e o gate do builder, que a lista como **não fechada** (`F02-cvd-builder.md:5,122`). |

## 3. `DoD-VERTICAL` — a métrica **até o pixel**, medida no app real

A exigência que decide a fase não é backend; é ponto na tela. Medido em `http://127.0.0.1:3000/symbol`
(`deploy-web-1`), lendo o HTML servido:

```
data-testid="cvd-pane"                      → presente
cvd_readable_horizon:2817/5760              → 2.817 grades de 1 min COM valor  (DoD-3 pede >= 30)
cvd_last_reading:present                    → "Delta atual: 90.722"
cvd_cumulative_last_reading:present         → "Acumulado atual: -8395.724"
cvd_cumulative_anchor:1789153500000         → "Acumulado ancorado em 2026-09-11 19:05 UTC"
cvd_legend:2                                → "Delta" + "Acumulado" (DR-3/WCAG 1.4.1)
```

`[MEDIDO 2026-09-15T21:4xZ, `curl` de `/symbol`, n=1 render]`. **O `CvdPane` mostra número real, não
`SEM_PONTO`.** A única ocorrência de `SEM_PONTO` na página é do painel de **Preço** (`klines_last`),
que é de outra fatia — não do CVD.

⚠️ **Ressalva declarada, não escondida:** o render de `/symbol` levou **> 4 min** neste `curl` — o
mesmo sintoma que `gates/T-03.5-T-03.6-qa-remedicao.md` §A6 já registrou (`63,6–125,8 s`, `n=3`) e que
`7425cfe` tratou subindo o teto do Playwright para `400_000 ms`. É lentidão de render, **não** ausência
de dado: os fatos acima vieram do HTML que ele devolveu.

## 4. O que falta, e é **um** item — o artefato de `T-02.8`

**Nenhuma das 8 tasks está sem código em `master`.** O que não existe é o **documento de fechamento
vertical** de `T-02.8`: a conjunção dos 8 itens do `DoD` da fase, com comando e universo por item,
mais `make verify` verde datado. Os dois gates que existem declaram explicitamente que a fase seguia
aberta no momento em que foram escritos:

- `F02-cvd-builder.md:5` — *"Tasks NÃO fechadas, e nomeadas: `T-02.5`/`T-02.6`, `T-02.7`, `T-02.8`"*;
- `F02-web-T-02.5-T-02.6.md:19,211` — *"a leitura de PRODUÇÃO … é de `T-02.7`, que ainda não rodou"*.

Os dois envelheceram: `T-02.5`/`T-02.6` fecharam em `gates/F02-QA-integracao-cvd-e-portao-e2e.md`
(`APPROVED`), e os números de produção de `T-02.7` estão medidos em §2/§3 **deste** documento.

`make verify` **[NÃO MEDIDO por esta auditoria]** — é read-only e a suíte inteira é portão, não laço
de auditoria (`CLAUDE.md`/`R8`). O último verde registrado no intervalo é de `2026-09-15T20:12Z`
(`docs/INDEX.md`, `VERDE — 8 portões`, `e2e 30 passed`).

## 5. Veredito de completude

**A fatia `02` (CVD) está COMPLETA em `master` e VIVA em produção, ponta a ponta até o pixel.**
8 de 8 tasks com código em `master`; 7 de 8 com gate escrito; **1 de 8 (`T-02.8`) sem o artefato de
fechamento**, embora a substância que ele atestaria esteja medida aqui.

Decisão do owner, e é dele: gravar o `gate-record` da fase **agora**, tratando este documento como o
fechamento de `T-02.8`, **ou** exigir antes o gate de `T-02.8` com `make verify` datado. O que **não**
pode é tratar `status = "todo"` no `tasks.toml` como evidência contrária — ele está desatualizado, e
esta auditoria mediu o contrário em 3 superfícies independentes (código, banco, DOM).

⛔ **Esta auditoria não gravou `gate-record`, não aprovou gate e não avançou estado.**
