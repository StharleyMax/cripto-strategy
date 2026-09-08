# Fase 02 — Fórmula MODELED e promoção real

**Componente:** `sentimento` · **Depende de:** `01` (`CA-F1-*` verdes, ou fixture equivalente de `LagSummaryRow` com `lag_n >= 200` para os testes que não dependem de rodada real) · **SPEC:** [`SPEC-005 §3.3-3.4, §3.6, §5, §7`](../../specs/SPEC-005-coinalyze-fora-da-quarentena.md)

## O que entra

1. `domain/modeled_availability_write.py` — módulo novo, **ao lado** de `live_availability_write.py`, nunca dentro: `resolve_measured_endpoint_availability(*, lag_summary, native_grid, bucket_end_ms, margin_ms) -> tuple[int, AvailabilitySource]`.
2. `margin_ms = 2 * lag_summary.lag_resolution_s * 1000` — calculado a partir da própria linha do store, não constante global.
3. `build_available_at_present_by_key(catalog, lag_summary_store) -> Mapping[str, bool]` em `use_cases` — lê `read_all()`, marca `True` só quando `lag_n >= REGIME_N_MIN` (não basta `lag_n > 0`).
4. Fiação: `quarantine_terms.readable_by_backtest` passa a receber o mapa de (3) por um caminho de produção, no ponto que hoje monta o mapa manualmente em teste.

## DoD — verificável, com comando e universo

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| `D2.1` (`CA-F2-1`) | Fórmula MODELED implementada e testada | `pytest backend/tests/sentimento -k 'modeled_available_at or measured_branch' -q` → passa | mutante que troca `>=` por `>` ou remove arredondamento para cima ⇒ reprova |
| `D2.2` (`CA-F2-2`) | Fórmula nunca devolve `event_time`/`event_time+interval` | teste parametrizado, mesma forma de `test_the_output_is_never_event_time_nor_event_time_plus_interval`, agora sobre o ramo medido | valor igual a qualquer um dos dois ⇒ reprova |
| `D2.3` (`CA-F2-3`) | `lag_n == 0`/`None` continua no ramo antigo | `MeasuredLagCannotUseUnmeasuredPathError` continua disparando para `lag_n > 0` chamado em `live_availability_write.py` | regressão que deixa o módulo antigo aceitar `lag_n > 0` sem erro ⇒ reprova |
| `D2.4` (`CA-F2-4`) | `available_at_present_by_key` de produção, não só teste | `grep -rn 'available_at_present_by_key' backend/src/modules/sentimento/use_cases` → **≥ 1** (hoje 0) | ausência ⇒ reprova, mapa continua só manual |
| `D2.5` (`CA-F2-4'`) | Abaixo do limiar de regime, não promove | teste planta `lag_n` entre 1 e 199 na mesma chave → `build_available_at_present_by_key(...)[key] is False` | `lag_n=50` promovendo ⇒ reprova, limiar de regime ignorado |
| `D2.6` (`CA-E2E-1`) | `backtest` lê `open_interest` Coinalyze real, não-vazio | leitura real sobre `open_interest_catalog_entries().entry_for(coinalyze_open_interest_key(Reduction.CLOSE))` com `lag_n >= 200` persistido → linhas **> 0** (hoje: 0, `D6.2`) | sem o store/fórmula ⇒ continua 0 — regressão de `D6.2`, agora esperando o oposto |
| `D2.7` (`CA-E2E-2`) | Série nunca medida continua quarentenada | mesma leitura sobre endpoint Coinalyze sem amostra no store → 0 linhas | qualquer valor > 0 ⇒ `RN-4` violado |
| `D2.8` (`CA-E2E-3`) | Nenhum contrato de leitura mudou | `git diff --stat <base>..HEAD -- backend/src/api/routes backend/src/modules/sentimento/domain/collector_status.py frontend/src` → vazio | qualquer linha ⇒ fora de escopo |
| `D2.9` (`R-C` do índice) | `live_availability_write.py` intocado | `git diff --stat <base>..HEAD -- backend/src/modules/sentimento/domain/live_availability_write.py` → vazio | qualquer linha ⇒ a fórmula MODELED vazou para o módulo errado |

## Verificação

`make verify` + os comandos acima. Relatório em `docs/context/coinalyze-fora-da-quarentena/gates/T-02-builder.md` (ou task-id equivalente).

## Nota para o `/tech-lead`

`D2.6` (`CA-E2E-1`) exige `lag_n >= 200` real ou uma fixture que simule uma `LagSummaryRow` já mesclada até o limiar — se a fase `01` em produção ainda não tiver cruzado `REGIME_N_MIN` quando `02` começar a ser construída, o `/tech-lead` decide se a task de `02` usa fixture (código pronto, `CA-E2E-1` roda de verdade quando `01` cruzar o limiar em produção) ou se `02` espera `01` terminar de rodar em regime antes de abrir. Nenhuma das duas opções muda o contrato desta fase.
