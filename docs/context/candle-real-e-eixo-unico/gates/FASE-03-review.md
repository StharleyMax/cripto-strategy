# Review arquitetural — Fase `03` (o timeframe único), `candle-real-e-eixo-unico`

> Branch `wave/candle-f03`, HEAD `62be38b`, diff avaliado `f324b4c..HEAD` (12 tasks,
> T-03.1–T-03.12). Sem push, sem PR. Read-only — este relatório não avança estado nem
> aprova gate.

## Veredito: **COMPLIANT**

## Denominador

- **Regras bloqueantes em vigor:** 8 de 8, via `harness rules list --severity block`
  (core: `relative-import`, `silent-except`, `print-statement`, `hardcoded-secret`;
  web-fullstack: `browser-imports-server`, `tenant-from-request`,
  `server-test-directory-present`; own: `compose-hardcoded-secret`).
- **Arquivos varridos:** 48 de 48 do diff (`git diff f324b4c..HEAD --name-only`), um a um,
  com `harness rules --mode file --path <arquivo>` (o `--mode sweep --changed-only` não serviu
  aqui — mede árvore de trabalho não commitada, que estava limpa; por isso a varredura foi
  arquivo a arquivo contra o diff da fase, não contra o working tree).
- **Resultado da varredura:** 0 achado de severidade `block` em qualquer um dos 48 arquivos.
  8 arquivos de produção Python (`backend/src/.../series_history.py`,
  `series_reduction.py`, `series_reduction_gate.py`, `series_history_report.py`,
  `source_floor.py`, `postgres_series_window_reader.py`, `api/dependencies.py`,
  `api/routes/series_history.py`, `main/__init__.py`) disparam **`[AVISO]
  core.module-docstring-single-line`** (severidade `warn`, confirmado via `--format ndjson`
  → `"severity": "warn"`) — docstring de módulo multi-linha. **Não entra no veredito**
  (severidade abaixo de `block`) mas é citável: é o estilo já usado em toda a fase (docstring
  longa com citação de ADR), então não é um desvio desta fase especificamente — é o padrão do
  repositório todo, fora do escopo desta regra.
- **40 arquivos restantes** (testes Python, testes/produção TypeScript, `.md` de gate):
  `rc=0`, sem achado, confirmado individualmente.

## O achado da própria QA da fase — verificado, não apenas citado

A QA de `sentimento` (`FASE-03-qa-sentimento.md`) achou, por MORDE (teste novo que falha
contra o código real), que `use_cases/series_history.py:67` chamava
`domain.series_reduction.reduce_bucket` diretamente em vez de
`domain.series_reduction_gate.reduce_bucket_for_series` — o portão de `ADR-040/D4` (allowlist
de `metric` para `(RATIO, POINT)=last`, que existe para impedir uma métrica RATIO de fluxo de
ser lida como `last()` e inflar o valor `3,3×`) nunca rodava no caminho real de produção.

Esta review **reexecutou, de forma independente**, o teste que prova o fix:

```
.venv/bin/python -m pytest tests/sentimento/test_series_history_ratio_point_gate_wiring.py -q --no-cov
.                                                                        [100%]
1 passed
```

E leu `series_history.py:504` (`_reaggregated_row`) diretamente: a linha chama
`reduce_bucket_for_series(key, present_values)`, passando `entry.key` completo (não mais
`(nature, reduction)` soltos) — exatamente a correção que a QA pediu, aplicada no commit
`01ec055` (`fix(sentimento): T-03.5 — religa reduce_bucket_for_series em series_history.py`)
e mesclada em `da96317`. **O gap está fechado.**

## Arquitetura declarada — camadas (`domain`/`use_cases`/`infra`) e direção de dependência

Conferido por `grep -n "^from src\|^import src"` nos 8 arquivos de produção do diff:

- **`domain/*.py`** (`series_history_report.py`, `series_reduction.py`,
  `series_reduction_gate.py`, `source_floor.py`) importam **só outros módulos `domain`**
  (`as_of_accessor`, `series_key`, `long_short_ratio_series`, `cvd_source_catalog`,
  `klines_ohlc_catalog`, `klines_volume_catalog`). Nenhum importa `use_cases` nem `infra`.
- **`use_cases/series_history.py`** importa só `domain` (via `Protocol` `SeriesWindowReader`
  como porta) — nunca `infra` diretamente. Casa com o próprio docstring do módulo
  (`use_cases/series_history.py:1`: *"the use case behind `GET /series-history`"*).
- **`infra/postgres_series_window_reader.py`** importa só `domain` (tipos de retorno da
  porta: `Observation`, `AvailabilitySource`, `Provenance`, `SeriesRow`) — a implementação
  concreta, sem vazar para trás.
- **`api/dependencies.py`** e **`api/routes/series_history.py`** (camada de borda) importam
  `domain` + `use_cases`, nunca `infra` diretamente — a instanciação concreta do adaptador
  Postgres só aparece em `backend/src/main/__init__.py`, cujo próprio docstring se
  autodescreve: *"the composition root — the ONLY layer that wires a concrete adapter"*.
  Confirmado: é o único dos 8 arquivos que importa de `infra`.

**Nenhuma violação de direção de dependência encontrada.** A extensão de `T-03.6`
(`SeriesStoreBoundsReader`, novo port em `use_cases/series_history.py`, wireado em
`api/dependencies.py` e `api/routes/series_history.py`) segue o mesmo padrão dos ports
já existentes (`SeriesWindowReader`, `GridMultipleClassifier`) — porta declarada em
`use_cases`, adaptador wireado em `main`.

## ADR-040 — conformidade da implementação com as decisões D1–D4

- **D1** (reagregação mora na rota; `SUPPORTED_INTERVAL` vira conjunto de 5): confirmado —
  `series_history.py:75` declara `SUPPORTED_INTERVALS = frozenset({"1m","5m","15m","1h","4h"})`;
  a rota (`api/routes/series_history.py`) já restringe via `Literal["1m","5m","15m","1h","4h"]`
  antes do use case rodar (segunda linha de defesa, como o próprio ADR pede).
- **D2** (função pura de `(nature, reduction)`, nunca tabela por métrica): `reduce_bucket`
  permanece a única função consultada por `nature`/`reduction`; `reduce_bucket_for_series` é
  um wrapper de refusal, não uma segunda tabela — confirmado por leitura do próprio
  docstring do módulo, que declara explicitamente "does not build a second reduction table".
- **D3** (`{present, expected}` sempre inteiros, nunca bool/percentual): confirmado em
  `_reaggregated_row` — `BucketCoverage(present=len(present_native_facts),
  expected=len(native_readings))`, já validado por teste (QA `T-03.4`).
- **D4** (allowlist de `metric`, nunca de `nature`): confirmado — `series_reduction_gate.py`
  gateia por `key.metric not in RATIO_POINT_METRIC_ALLOWLIST`, allowlist de 1 elemento
  (`COUNT_LONG_SHORT_RATIO`, importado, nunca respelado) — e agora **está religada** no
  caminho real, o que era exatamente o gap achado pela QA.

## Fronteira browser/server e idioma de identificador

- `harness rules --mode file` sobre os arquivos `frontend/src/**` tocados (`SymbolClient.tsx`,
  `[symbol]/page.tsx`, `request-window.ts`, `series-history-client.ts`,
  `supported-timeframes.ts`, `view-model.ts`) → `rc=0`, sem achado de
  `web-fullstack.browser-imports-server`. `supported-timeframes.ts` lê o `.py` do backend como
  **texto puro** (nunca importa/roda Python) — não configura import cross-layer.
- Varredura de identificadores novos no diff (`def`/`const`/`class`/`function` em
  `backend/src`+`frontend/src`) contra caracteres/padrões em português, excluindo os caminhos
  já enumerados como exceção (`sentimento`, `painel`, `janela_de_perda`): **0 achado**.
  (Convenção, não portão — `CLAUDE.md` §"Idioma de identificador" — citado só como reforço,
  não como violação.)

## Achados

Nenhum achado de severidade `BLOCKER` ou `WARNING` novo desta fase. O único achado real da
fase (allowlist RATIO/POINT não religada) foi de **outro papel** (QA, não review) e já está
**fechado e reverificado de forma independente** por este review, com teste passando contra
o código real.

## Comando que produziu o denominador

```
harness rules list --severity block                          # 8 regras
git diff f324b4c..HEAD --name-only | wc -l                    # 48 arquivos
# loop de 48 chamadas: harness rules --mode file --path <arquivo>
.venv/bin/python -m pytest tests/sentimento/test_series_history_ratio_point_gate_wiring.py -q --no-cov
# 1 passed — reconfirmação independente do fix
```
