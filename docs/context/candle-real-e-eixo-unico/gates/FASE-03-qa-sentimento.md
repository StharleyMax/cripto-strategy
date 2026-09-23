# QA — Fase `03` (o timeframe único), componente `sentimento`

> Escopo desta rodada: `T-03.1, T-03.2, T-03.4, T-03.5, T-03.6, T-03.7, T-03.8` (backend/sentimento)
> + `T-03.3` (interval). `T-03.9..T-03.12` (web/design) fora de escopo — ver
> `docs/context/candle-real-e-eixo-unico/handoff/FASE-03-qa.md`.

## Veredito: **NEEDS_FIX**

## O que foi confirmado correto (mentalidade destrutiva, não só leitura)

1. **Totalidade dos 8 pares** — `backend/tests/api/test_series_catalog_reduction_totality.py`
   (4 testes, `T-03.2`): prova de DENTRO (`REDUCTION_TABLE` tem exatamente 8 entradas,
   `T-03.1`) e de FORA (`/series-catalog` ao vivo serve exatamente esses 8, comando literal do
   DoD 4 reproduzido) + MORDE por injeção de um 9º par sintético `(EVENT, POINT)` via
   `dependency_overrides`, que levanta `UncoveredReductionPairError` nomeando o par exato.
   `4 passed`.
2. **`CA-8` e `CA-8′` coexistem, nenhum redundante/removido** — arquivos distintos
   (`test_series_reduction.py`::`test_ca8_stock_point_…`/`test_ca8_flow_sum_…`, `T-03.8`, na
   escala nativa real 12/60 fatos) e `test_series_reduction_ca8_prime.py` (`T-03.7`, 12 testes,
   4 camadas: guarda de não-degenerescência, fixture real da Binance pinada dígito a dígito,
   matriz 8×5, ablação 81/240 — `mean×240` nunca aparece). Falsificador de `CA-8′` confirmado
   por mutação real (`(STOCK,HIGH): _max → _min`, revertida) — MORDE.
3. **Cadeia `{present, expected}` (P-B) servida sempre em bucket reagregado** —
   `series_history_report.py:105-117`: `coverage` é `None` só no caso degenerado
   (`interval == native`, onde não há fração de cobertura, é o fato nativo puro) e o par de
   inteiros em todo outro caso — nunca bool, nunca percentual. `T-03.4`'s falsificador
   (`present` contando fatos nativos distintos via `set[int]` sobre `bucket_end`, não slots de
   grade carregados adiante) confirmado por mutação (reversão para contagem de slots
   → `5 != 1` no teste do dedup). `panel.coverage {earliest_bucket_ms, latest_bucket_ms,
   source_floor_ms}` (`T-03.6`, nível de painel, ortogonal ao par de linha) também presente e
   testado.
4. **Refusal do `interval`** — `test_an_interval_outside_the_supported_set_is_refused_with_422`
   (`backend/tests/api/test_series_history_route.py:267`), `n=3` (`1d`, `3m`, `30s`) → `422`.
5. `bash backend/scripts/lint.sh` (rodado pelos builders, re-confirmado por `harness rules
   --mode sweep --changed-only` → `rc=0`, sem achado sobre o arquivo novo desta rodada).

## O defeito — provado por teste, não por leitura

**`T-03.5`'s allowlist de `(RATIO, POINT)` nunca é chamada no caminho real de `/series-history`.**

`domain/series_reduction_gate.py` declara `reduce_bucket_for_series(key, values)` como
*"the ONE call site allowed to ask for `(RATIO, POINT)`"* — o portão que impede um `metric`
RATIO de fluxo (ex.: `sum_taker_long_short_vol_ratio`) de ser lido como `last()`, o que infla o
valor `3,3×` (`ADR-040/D4`, `[MEDIDO 2026-09-19]`: p50 `3,1809` vs `0,9707`).

Mas `use_cases/series_history.py` (a função `_reaggregated_row`, o ÚNICO ponto que chama
`reduce_bucket` quando `interval != "1m"`) importa e chama `reduce_bucket` **diretamente**
(`series_history.py:67,504`), passando só `(nature, reduction, present_values)` — nunca `key`
nem `key.metric`, nunca `reduce_bucket_for_series`. `entry.key` está disponível no escopo (é
usado 3 linhas abaixo para `panel_source=entry.key.provider`), mas não é repassado ao
reduzir. Confirmado por grep: `reduce_bucket_for_series` tem exatamente 1 definição e é
exercitada só por `test_series_reduction_gate.py` — zero chamador de produção.

Hoje o catálogo só cataloga `count_long_short_ratio` (o único elemento da allowlist) em
`(RATIO, POINT)` — `sum_taker_long_short_vol_ratio` ainda não tem entrada de catálogo
(`collector_series_mapping.py:938-940`) — então o gap não é observável em produção HOJE. Mas é
exatamente o cenário que o gate existe para impedir no dia em que essa (ou outra) métrica de
fluxo ganhar entrada de catálogo: nada no caminho de produção a bloquearia.

**Prova (teste novo, MORDE confirmado, falha HOJE contra o código como está):**
`backend/tests/sentimento/test_series_history_ratio_point_gate_wiring.py::test_reaggregating_a_disallowed_ratio_point_metric_must_refuse_not_reduce`
— constrói uma `SeriesKey` `(RATIO, POINT)` com `metric="sum_taker_long_short_vol_ratio"`
(fora da allowlist), interval `1h` (reagregando, `group_size=60>1`), chama
`build_series_history_report` (o use case real) e espera `DisallowedRatioPointMetricError`.

```
.venv/bin/python -m pytest tests/sentimento/test_series_history_ratio_point_gate_wiring.py -q --no-cov
F
E   Failed: DID NOT RAISE DisallowedRatioPointMetricError
```

### Ação (para o builder de `T-03.5`/`T-03.3`, arquivo:linha)

`backend/src/modules/sentimento/use_cases/series_history.py:67` — trocar o import de
`reduce_bucket` por `reduce_bucket_for_series`
(`domain.series_reduction_gate.reduce_bucket_for_series`), e em `:504`
(`_reaggregated_row`) passar `entry.key` (ou repassar `key: SeriesKey` como novo parâmetro da
função) em vez de `(nature, reduction)` soltos, chamando
`reduce_bucket_for_series(key, present_values)`. Depois do fix, o teste desta rodada
(`test_series_history_ratio_point_gate_wiring.py`) deve passar sem alteração.

## Testes existem e passam — comando literal

```
.venv/bin/python -m pytest tests/sentimento --collect-only -q | awk -F': ' '{sum+=$2} END{print sum}'
# 2435 (universo: backend/tests/sentimento)

.venv/bin/python -m pytest tests/sentimento -q --no-cov -p no:cacheprovider
# 2434 passed, 1 failed (o teste novo desta rodada, prova do defeito), 1 skipped (pré-existente)
```

Todos os arquivos tocados pelo escopo (`test_series_catalog_reduction_totality.py`,
`test_series_reduction_ca8_prime.py`, `test_series_reduction.py`, `test_series_reduction_gate.py`,
`test_series_history.py`, `test_series_history_route.py`) — verdes isoladamente, confirmado por
rodada dedicada antes da rodada completa.

## Cobertura

Não re-medida nesta rodada (suíte completa demandaria `bash backend/scripts/test.sh`, ~560s,
redundante com a rodada de 2435 testes já executada `--no-cov`). Última medição válida, dos
builders desta mesma wave, citável: `[MEDIDO por T-03.4/T-03.7, 2026-09-22]` `domain 99,7%`
(meta 90%), `use_cases 99,6%` (meta 80%), `infra 92,4%` (meta 70%), total `96,32%`/`96,33%`
(piso 70%) — as 3 camadas `[OK]`. **O defeito achado nesta rodada não é visível pela
cobertura**: `reduce_bucket_for_series` já tinha 100% de cobertura de linha via seu próprio
arquivo de teste — o gap é de INTEGRAÇÃO (função testada, nunca chamada no caminho real), não
de linha não executada.

## DoD da fase — item a item (escopo desta rodada)

- [OK] DoD 1 (`CA-8′`, 4 camadas) — `T-03.7`, confirmado.
- [OK] DoD 2 (`STOCK` não soma) — `T-03.8`, confirmado.
- [OK] DoD 3 (`FLOW` soma) — `T-03.8`, confirmado.
- [OK] DoD 4 (8 pares cobertos, totalidade) — `T-03.2`, confirmado.
- [OK] DoD 5 (422 fora do conjunto) — `T-03.3`, confirmado.
- [NEEDS_FIX] Item `3.5` do plano (`(RATIO,POINT)=last` só sob allowlist) — a allowlist
  existe e está corretamente testada EM ISOLAMENTO, mas não está religada no caminho de
  produção que `T-03.3`/`T-03.4` religaram para os outros 7 pares. Falha silenciosa por
  construção no dia em que um metric de fluxo ganhar catálogo.
- DoD 6/7/8 (barra de TF, ablação `P3`, escada `GA-2`) — fora de escopo desta rodada (`web`).

## Regras bloqueantes avaliadas

`harness rules --mode sweep --changed-only` → `rc=0`, sem achado, sobre o único arquivo novo
desta rodada (`test_series_history_ratio_point_gate_wiring.py`). As 8 regras de
`harness rules list --severity block` não têm escopo de teste isolado adicional além do sweep
acima (7 de escopo `code`, 1 `production`) — nenhuma tocada por este arquivo (só teste, sem
import relativo, sem `except` silencioso, sem `print`, sem segredo).

Regras bloqueantes avaliadas: 8 de 8.

## Arquivo novo desta rodada

`backend/tests/sentimento/test_series_history_ratio_point_gate_wiring.py` — 1 teste, prova o
defeito acima. **Não é fixture de produção nem consertou nada** — `NEEDS_FIX` pede o reroteamento
em `series_history.py`, não escrito aqui (restrição do papel de QA).
