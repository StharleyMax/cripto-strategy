# W-PBE-QA: QA da wave de backend da fase 10 (T-10.25, T-10.26, T-10.28)

| | |
|---|---|
| **feature / fase** | `estrutura-do-front` · `10` |
| **branch / HEAD** | `wave/piramide-be` · `e6e410dd` (base da wave `e177d51a`) |
| **agente** | `qa` (modo gate) |
| **data** | 2026-10-03 |
| **diff da wave** | `git diff --stat e177d51a..HEAD` mostra 11 arquivos: 8 em `backend/tests/` (um deles apagado) e 3 relatórios em `gates/`. **Nenhuma linha de `backend/src/` mudou** `[MEDIDO]` |

## Veredito

```
## QA Gate — Fase 10 [sentimento, infra, charts, backtest] — wave piramide-be
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request /
       web-fullstack.server-test-directory-present / own.compose-hardcoded-secret
       — `harness rules --mode file --path <f> --format ndjson` nos 7 arquivos de teste que existem: rc=0 nos 7;
         a seção `regras` do verify (/tmp/verify-wave-piramide-be-20261003T204243Z.log:2063-2218) tem 77 [AVISO],
         0 [BLOQUEIO] e nenhum aviso sobre os arquivos da wave
- [OK] Testes existem e passam — verify da wave (log:2026) `3664 passed, 1 skipped, 3 deselected, 1 xfailed`;
       e2e `127 passed`, 15 skipped (log, final da seção e2e); nos 7 arquivos tocados, `pytest -o addopts="" -q`: 165 passed
- [OK] Cobertura 96,92% contra o alvo de 70% (log:2025); por camada: domain 99,7/90, use_cases 99,8/80, infra 93,9/70 (log:2028-2030)
- [OK] DoD da fase, item a item (abaixo)
- [anomalia] nenhuma
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED
```

## 1. Mutações refeitas pelo QA

**Método:** worktree própria, `.claude/worktrees/qa-pbe-mut` via `scripts/wt.sh`, a partir de `e6e410dd`.
Ela isola a mutação de `src/` do code-review que corria ao mesmo tempo em `wave-piramide-be`, e foi removida no fim, limpa.

- Antes de cada rodada: `find . -name __pycache__ -prune -exec rm -rf {} +`.
- Comando: `.venv/bin/python -m pytest -o addopts="" -q -p no:cacheprovider -m "not process_real" <alvos>`.
- **antes** = os 8 arquivos de teste em `e177d51a`, via `git checkout e177d51a -- …`, inclusive o `_qa.py` apagado.
- **depois** = HEAD.
- Cada mutação é uma troca literal com contagem de agulha igual a 1. O fonte é restaurado com `git checkout HEAD` e `git status` fica limpo depois de cada lote.
- Universo sem mutação, `tests/sentimento tests/charts tests/backtest tests/api`: **antes 3555 passed, depois 3618 passed**. A diferença é +63 = +80 −8 −2 −1 (T-10.25) e −6 (T-10.28) `[MEDIDO]`.

| grupo | mutação (QA) | alvos | antes | depois | quem pega depois |
|---|---|---|---|---|---|
| G1 | `bundle_hash.py`: `sorted(payload)` vira `payload` | `tests/backtest` | 5 failed | **4 failed** | os 4 de `test_bundle_hash.py` (field_order, nested_dict, dicts_in_list, none_valued) |
| G2 | `series_row_wire.encode` sem a chave `"symbol"` (o builder tirou outra chave, `observer_region`) | `tests/sentimento -k wire` | 20 failed | **19 failed** | os mesmos menos o teste cortado, incluindo `test_encode_produces_exactly_the_16_named_string_keys` |
| G3 | `ServerTimeObservation.body_sha256` renomeado para `body_digest` (o builder renomeou outro campo, `weight_used`) | `-k "clock_skew or ntp_skew or server_time"` | erro de coleta em `test_persist_ntp_skew_run.py`, rc=2 | **o mesmo erro de coleta, rc=2** | sem esse arquivo: antes 15 failed, depois 13 (sai exatamente o par cortado; ficam `test_binance_server_time_probe.py` ×4, `test_clock_skew_tolerance_*`, `test_measure_clock_skew.py`). `mypy src tests` com a mutação: `Found 14 errors in 8 files` |
| G4 | `class InProgressBar(FinalBar)` | `tests/charts` | 3 failed | **2 failed** | o falsificador `hasattr` e `test_is_final_distinguishes_the_two_variants` |
| G4 | `InProgressBar` ganha `@property close` (mutação nova do QA) | `tests/charts` | 1 failed | **1 failed** | o falsificador `hasattr`, que ficou |
| G5 | `FieldIdentity`: `unit`/`denom` trocados de ordem, com a constante intacta | `tests/charts -k field_identity` | **7 passed (o defeito passava)** | **1 failed** | `test_field_identity_terms_match_the_dataclass_field_order` |
| G6 | `list_series_catalog` sem a linha `build_klines_volume_entry` (mutação nova do QA; o builder tirou takerbuy, L/S e o OI de polling) | `test_series_catalog_use_case.py` | 18 failed | **15 failed** | **o G6 fundido** e `klines_volume_is_registered` |
| G7 (perda?) | takerbuy registrado com `unit="USDT"`. O id servido diverge do id do coletor, que era o que o `no_longer_refuses_the_kline_takerbuy_id` antigo checava | `tests/sentimento -k "catalog or takerbuy or cvd"` | 7 failed | **6 failed** | `the_served_cvd_row_is_the_one_the_collector_writes_under`, `kline_takerbuy_is_registered`, `base_denominated_rows…` ×4. **A mordida não se perdeu** |
| G7 (cobertura nova) | `build_series_history_report` recusa todo id de `SOLUSDT` | catálogo + `tests/api` | **123 passed (passava)** | **20 failed** | os 20 casos `SOLUSDT-*` do G7 |
| G8 | a rota traduz `HistoryWindowBeyondCeilingError` em `200 {"rows": []}` | `tests/api` | 1 failed | **1 failed** | `test_a_window_starting_beyond_the_90_day_ceiling_is_refused_with_422` |

**Leitura.** Nenhuma das 10 mutações perdeu a mordida. Em cada linha, o "depois" é o "antes" menos os testes cortados ou fundidos. Duas mutações que passavam verdes antes agora reprovam: G5, e G7 sobre `SOLUSDT`. As saídas brutas ficaram no scratchpad da sessão, em `qa/out-<rótulo>-<modo>.txt`.

## 2. DoD, item a item

| task | item | estado | evidência |
|---|---|---|---|
| T-10.25 | (1) um G6 pina 20 e 80 = 20×4, com as chaves de topo e ids distintos ×4 | OK | `test_series_catalog_use_case.py:127`; mutação G6 acima |
| T-10.25 | (2) G7 parametrizado sobre todo id servido | OK | `:560`, `SERVED_ENTRIES = list_pilot_series_catalog().entries`, o mesmo catálogo que `src/main/__init__.py:283` liga; 80 casos |
| T-10.25 | (3) fica um 422 de teto; o 200 da fronteira sai e continua fixado em `test_series_history.py:556` | OK | G8 acima; `grep -n` em `test_series_history.py:556,567` |
| T-10.26 | a constante é comparada com `dataclasses.fields(FieldIdentity)` | OK | `test_field_identity.py:23`; mutação G5 |
| T-10.28 | os 6 testes saem só com a mordida provada; o falsificador do ADR-026 fica | OK | antes 33 passed, depois 27 (`pytest -o addopts="" -q` nos 4/5 arquivos, 0,15 s contra 0,14 s); G1–G4 acima |
| T-10.28 | a citação de `ADR-021` G3 vai para a docstring de `test_bundle_hash.py` | OK | `test_bundle_hash.py:1-11` |

## 3. Os desvios declarados

1. **T-10.25: tirar uma linha do catálogo não reprova o G7.** **Não bloqueia.**
   - Um teste parametrizado sobre o catálogo servido perde o próprio caso quando a linha sai. A DoD pedia duas propriedades que se excluem, e o builder ficou com a que dá cobertura nova (G7-SOLUSDT: de 0 para 20 reprovações).
   - O que a mordida de remoção protege continua pego: G6 com `klines_volume`, aqui, e as 3 linhas que o builder testou, todas pegas pelo G6 fundido e pelos `*_is_registered_*`.
   - **Follow-up:** corrigir o texto da mordida em `tasks.toml` para "tirar uma linha ⇒ G6 reprova". Fica a cargo do orquestrador, pelo escritor único.
2. **T-10.28: `backend/src/modules/backtest/domain/bundle_hash.py:26` cita `test_bundle_hash_determinism_qa.py`, que foi apagado.** **Não bloqueia; vira follow-up.**
   - É comentário, não executa. A frase continua verdadeira como registro histórico, e o `ADR-021:189,212` cita o mesmo arquivo.
   - A wave só tinha `backend/tests` no escopo.
   - Mesmo assim é ponteiro morto em produção. **Follow-up:** a próxima task com `src/` no escopo acrescenta "(removido em T-10.28; G3 guardado por `test_bundle_hash.py::test_field_order_does_not_change_the_hash`)".
3. **Menor, não pedido mas registrado: REGRA-T da T-10.28.** O builder mediu o tempo com `make test-fast K=`. O QA mediu com o comando da spec: 0,15 s antes e 0,14 s depois, ganho de ~0, como previsto.

## 4. Observação de processo

- O worktree `wave-piramide-be` tinha `docs/context/estrutura-do-front/gates/W-PBE-REVIEW.md` não rastreado durante este QA. É de outro agente, e o QA não o tocou.
- Ficou a branch local `qa/pbe-mut`, apontando para `e6e410dd`. Ela não tem commit próprio, e o `git branch -D` foi negado pela permissão; pode ser apagada.
