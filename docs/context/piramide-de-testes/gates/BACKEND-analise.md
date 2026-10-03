# Pirâmide de testes: análise do backend (`backend/tests`), 2026-10-03

**Só análise.** Nenhum teste foi editado, apagado ou commitado. As mutações rodaram numa **cópia** de
`backend/` em `$SP/mut/backend`, onde `$SP` é o scratchpad da sessão `a6300abb`. O worktree não foi
mutado. **Estado: PARCIAL.** O agente parou no teto de turnos (R6). Na seção 7 está o que falta.

## 0. Números de partida

| o quê | valor | comando / força |
|---|---|---|
| suíte inteira (1 execução) | **3601 passed, 1 skipped, 3 deselected, 1 xfailed, em 313 s** | `pytest -m "not process_real" --cov=src --cov-context=test --durations=0` `[MEDIDO]`. O `--cov-context` encarece a execução: o portão mediu 249 s no log do orquestrador |
| carga da máquina durante a medição | load average **8,65** | `uptime` `[MEDIDO]`. Havia outros agentes rodando ao mesmo tempo, então todo tempo absoluto abaixo tem ruído de ±30% `[INFERRED]` |
| soma das durações listadas | 281,1 s (call 225,2 · setup 27,1 · teardown 28,9) | `awk` sobre `--durations=0` `[MEDIDO]` |
| arquivos `test_*.py` | 254 (api 18 · backtest 7 · charts 17 · main 6 · sentimento 206) | `find backend/tests -name 'test_*.py'` `[MEDIDO]` |
| funções `def test_` | 2564. A parametrização leva o total a 3601 | `grep -cE '^\s*(async )?def test_'` `[MEDIDO]` |

## 1. A pirâmide do backend

| camada | arquivos | como medi |
|---|---|---|
| **integração com Postgres** (fixture `postgres_database*`, container TimescaleDB único por sessão) | **14** arquivos, cerca de 83 `def test_` no total desses arquivos | `grep -lE 'postgres_database\|postgres_server'` `[MEDIDO]` |
| **processo real** (subprocess/Popen, sinal, `docker run caddy`) | 33 | `grep -lE 'subprocess\|Popen'` `[MEDIDO]` |
| **HTTP sobre socket real** (`uvicorn.Server` em thread, `http.client`) | 20 | `grep -rln 'def _served\|uvicorn.Server'` `[MEDIDO]` |
| **contrato estrutural** (AST/`inspect.getsource`/varredura do fonte) | cerca de 14 | `grep -lE 'ast\.parse\|inspect\.getsource'`, filtrando à mão os que só leem JSON `[MEDIDO]` |
| **unitário** (domínio e use case com dublês em memória) | o restante, por volta de 170 arquivos | por diferença `[INFERRED]` |

**Veredito da forma:** a pirâmide do backend **está de pé**. Integração com Postgres responde por **14 de
254 arquivos**. Os testes de Postgres não aparecem entre os caros: o mais lento é
`test_postgres_series_window_reader_extent.py`, com 10,8 s, e mede *plano de consulta*, que nenhum unitário
alcança. **Não achei integração cara testando o que um unitário pegaria.** O custo do backend está
concentrado num único teste **unitário** (seção 2).

## 2. Os mais lentos (`--durations=0`, somados por arquivo)

| s | arquivo | veredito |
|---|---|---|
| **117,3** (42% dos 281 s listados) | `sentimento/test_oi_candles_route_invariants.py` (99 casos: 3 propriedades × 6 seeds × 5 TFs + 9 casos fixados) | **MANTÉM + ACELERA**, ver abaixo |
| 10,8 | `test_postgres_series_window_reader_extent.py` | MANTÉM. Compara o plano de consulta novo com o antigo no Postgres real |
| 7,3 | `test_postgres_ingest_record_store_credits_the_run.py` | MANTÉM |
| 7,1 | `test_collectors_cli_every_thread_death_exits.py` | MANTÉM. Prova com processo real que a morte de uma thread derruba o processo |
| 6,7 | `api/test_create_app_selects_ingest_record_backend.py` | MANTÉM |
| 6,1 | `test_dump_etl_queue_resumable.py` | MANTÉM. Mata o processo e retoma |
| ≤ 5,8 | o restante | não analisado item a item |

### O gargalo: `test_oi_candles_route_invariants.py`

- **Por que nasceu:** o QA de backend `W6-QA-BACK-r2` (`37e12a95`, 2026-09-27) provou o defeito D-1
  (`D2-bis` violado na borda esquerda da janela de 1m), corrigido em `20e01b4a`. As três propriedades
  aleatórias são o oráculo que achou o defeito.
- **Tempo medido sozinho:** **28,8 s sem cobertura e 76,2 s com `--cov=src`**, que é o modo do portão.
  Comando: `pytest -o addopts="" -q [--cov=src --cov-report=] tests/sentimento/test_oi_candles_route_invariants.py`
  `[MEDIDO]`. Num portão de cerca de 249 s, isso é cerca de 30%.
- **Para onde vai o tempo:** um cProfile do caso `[4h-1]` deu 1,33 s no total, e **1,035 s está em
  `_oracle`, na linha 255**: `frozenset(t for t in poll if first_anchor(_hist_entry()) <= t < first_anchor(_poll_entry()))`.
  Essa linha reconstrói o catálogo (`open_interest_catalog_entries` → `build_series_catalog` →
  `series_key_id`) **3.453 vezes, uma por ponto de polling**. O resto do custo vem de `_data(seed)` e
  `_observations()`, que são refeitos a cada um dos 90 parâmetros, embora só existam 6 seeds `[MEDIDO]`.
- **Protótipo na cópia, com o arquivo do repositório intocado:** tirar o `first_anchor` de dentro do gerador
  e pôr `functools.cache` em `_hist_entry`/`_poll_entry` derrubou o tempo sem cobertura de 28,8 s para
  **19,7 s**. Memoizar também `_data(seed)` e `_observations` levou o tempo com `--cov` de cerca de 76–83 s
  para **25,9 s** `[MEDIDO, com ruído de carga]`. ⚠️ No protótipo, o cache de `_observations` usava
  `id(values)` como chave e produziu **1 vermelho falso** num caso fixado, por reuso de `id`. A versão real
  tem de usar `seed` como chave. **As asserções e o universo de seeds não mudam.**
- **O que se perde se sair:** o único oráculo que cobre os 5 TFs com dados aleatórios e janelas
  desalinhadas, ou seja, o que achou D-1. **Não cortar. Acelerar.**
- **Segundos removíveis:** cerca de **50 s do portão** `[MEDIDO no protótipo; INFERRED para a versão final]`.

## 3. Achados por grupo

Legenda: **CORTA** = sai sem perda. **FUNDE** = vira um teste só. **DESCE** = vai para uma camada mais
barata. **MANTÉM**.

| # | grupo | n | veredito | evidência | por que nasceu | o que se perde se sair |
|---|---|---|---|---|---|---|
| G1 | `backtest/test_bundle_hash_determinism_qa.py::test_g3_…` | 1 | **CORTA**, e a citação do `ADR-021` G3 passa para a docstring do teste irmão | **Mutação provada na cópia.** M1 (`for key in payload`, sem ordenar) reprova esse teste e mais 4 de `test_bundle_hash.py`, entre eles `test_field_order_does_not_change_the_hash`, com a mesma entrada no outro sentido. M2 (dict aninhado sem canonicalizar) não o reprova, mas reprova 2 irmãos. **Nenhuma mutação o reprova sozinha.** A docstring dele ainda diz *"expected to FAIL against the current implementation"*, o que é **falso** desde a emenda | `45facbb3` (T-08.4): QA provou que o hash dependia da ordem dos campos | nada. A docstring de `test_bundle_hash.py:22` já conta a história e aponta para este arquivo, então o ponteiro sai junto |
| G2 | `sentimento/test_series_row_wire_run_id_envelope.py::test_encode_without_a_run_id_produces_exactly_the_sixteen_keys_it_always_did` | 1 | **CORTA** | A asserção (`set(encode(row()).keys()) == set(FIELD_NAMES)`) é **subconjunto literal** de `test_series_row_wire.py::test_encode_produces_exactly_the_16_named_string_keys`, que faz a mesma comparação e ainda checa `len == 16` e que todo valor é `str` `[INFERRED: leitura; mutação não rodada]` | ADR-035, quando o `run_id` entrou no envelope | nada |
| G3 | `sentimento/test_clock_skew.py::test_server_time_observation_is_a_plain_value` e `::…allows_an_absent_weight` | 2 | **CORTA** | `ServerTimeObservation` é `@dataclass(frozen=True)` **sem `__post_init__`** (`src/modules/sentimento/domain/clock_skew.py:19`). Os testes leem de volta o que o construtor recebeu, ou seja, testam o `dataclasses` | DTO do probe de NTP (D3.10/D3.12) | nada. Um campo renomeado já quebra o mypy e os chamadores |
| G4 | `charts/test_panel_bar_progress.py::test_final_bar_carries_high_low_close` e `::test_final_bar_and_in_progress_bar_are_distinct_types` | 2 | **CORTA** | O primeiro lê atributos de dataclass, ou seja, testa a biblioteca. O segundo afirma `isinstance` entre duas classes sem herança, o que é tautológico. A única mutação que o reprovaria (`InProgressBar(FinalBar)`) já reprova `test_falsifier_in_progress_bar_has_no_high_low_close_attribute` pelo `hasattr` `[INFERRED]`. Os 4 testes deste arquivo aparecem com **0 linha de produção executada** na medição de contexto (seção 4) | `f957c173` (T-08.12) | nada. **Fica** o `hasattr`, que é o falsificador do ADR-026 |
| G5 | `charts/test_field_identity.py::test_field_identity_terms_match_the_dataclass_field_order` | 1 | **FUNDE**, reescrito | A docstring diz *"same order the dataclass itself declares"*, mas a asserção compara a constante com um **literal** (`== ("metric","unit","denom")`) e nunca chama `dataclasses.fields(FieldIdentity)`. É tautológico em relação ao que promete, e executa 0 linha de produção. O padrão certo já existe em `test_threshold_spec.py:31` | `3d78a1cf` (T-08.6) | nada se for reescrito. Se for cortado, perde-se a amarra entre constante e dataclass, que hoje **não existe** |
| G6 | contagens do catálogo: `test_series_catalog_use_case.py::test_the_real_catalog_has_twenty_rows_not_seven`, `::test_the_envelope_serves_twenty_entries_without_changing_its_top_level_fields` e `::test_the_served_catalog_has_twenty_rows_per_pilot_instrument` | 3 → 1 | **FUNDE** | Os três fixam o mesmo número (`20`, ou `80 = 20×4`). As docstrings registram que **toda métrica nova obrigou a editar os três**: 10→11→12→13→15→19→20. Uma linha retirada do catálogo reprova os três de uma vez. O que é próprio de cada um (chaves de topo do envelope; ids distintos × 4 instrumentos) cabe num único teste `[INFERRED]` | T-01.6, T-02.4, T-04.4, T-05.8, SPEC-008 T-01.6 e SPEC-009 T-03.3, cada um subindo o número | nada. Uma pinagem do total basta |
| G7 | `test_series_catalog_use_case.py::test_series_history_no_longer_refuses_*`, as versões para `klines_volume`, `kline_takerbuy`, liquidação e `klines_ohlc` | 4 → 1 | **FUNDE** num teste parametrizado sobre **todo** id servido | Cada um repete "o id X está no catálogo e por isso `build_series_history_report` não recusa". O ramo de recusa está coberto por `test_an_unregistered_id_still_raises_…` e por `test_series_history.py::test_refuses_an_unknown_series_key_id`. Remover uma linha do catálogo reprova o par "is registered" e "no longer refuses" juntos `[INFERRED]` | o DoD de cada task que registrou uma métrica (SPEC-007 §4.5) | nada. **Ganha-se** cobertura das métricas futuras, que hoje dependem de alguém lembrar de escrever o 5º teste |
| G8 | `api/test_series_history_route.py`: `test_a_window_starting_beyond_the_90_day_ceiling_is_refused_with_422` + `…exactly_at_the_90_day_ceiling_is_served_with_200` | 2 → 1 | **DESCE** | O teto vive no use case (`HistoryWindowBeyondCeilingError`), e a rota só traduz a classe da exceção em 422 (`src/api/routes/series_history.py:103-109`). A fronteira de 90 dias já está fixada em `test_series_history.py:527/556`, usando `MAX_HISTORY_MS`. Na rota, cada caso **sobe um uvicorn por iteração**. Basta 1 teste por exceção→status, e o caso de 200 na fronteira não pega nada que o unitário não pegue `[INFERRED]` | T-05.4, plano 05 DoD 4 | nada, se ficar um 422 de teto na rota |
| G9 | `sentimento/test_qa_probe_survivors.py`, `test_dump_edge_survivors.py` e `test_liquidation_collector_gate_findings.py` | 10 | **MANTÉM** | Cada teste declara o mutante que mata e diz que ele sobreviveu à suíte de origem (`5672c47d`, `a4fd624b`, `f3744122`). Pelo critério do BRIEF, um teste que mata um sobrevivente não é duplicado. A única ressalva é de organização: estão fora da árvore espelho | bancadas de mutação do QA | cada mutante nomeado volta a sobreviver |
| G10 | guardas estruturais (AST/`getsource`): `charts/test_reading_honesty.py` (16), `test_as_of_is_the_single_reader.py`, `test_single_writer_call_sites.py`, `test_verified_edge_call_sites.py`, `test_collector_klines_mapping.py:683` e outros | cerca de 40 | **MANTÉM** | Fixam propriedades **sem sombra em tempo de execução**, como "escrito uma vez" ou "nenhum caso de uso chama outro", que nenhuma asserção comportamental alcança. Cada um vem com uma prova de que dispara (`…falsifier_catches_a_planted_…`). O BRIEF só chama grep de fonte de inútil quando há uma afirmação comportamental equivalente, e aqui não há | ADR-024, ADR-034 e outros | as regras de arquitetura passam a valer só pela prosa |
| G11 | `charts/*` (exceto `panel_grid_enablement`) e `backtest/*`: **24 arquivos, 183 `def test_`** | 183 | **MANTÉM**, com sinalização ao owner | Nenhum módulo de produção fora de `charts/` e `backtest/` importa esses pacotes. O único consumidor é `src/main/__init__.py:42`, que importa `panel_grid_enablement`. Os testes testam código **sem consumidor em produção**, e `panel_bar_progress`, `panel_single_axis` e `panel_disc_layout` são regras de render que **o front implementa por conta própria** em TS. Comando: `grep -rn 'modules\.charts\|modules\.backtest' backend/src` fora dos próprios pacotes `[MEDIDO]` | T-08.x (CST-72..80): motor de backtest e S4, construídos antes do consumidor | se o código ficar, nada. **Quem decide é o owner, sobre o código, não sobre os testes.** Esses arquivos inflam a cobertura de 96,92% com código que nada executa em produção |
| G12 | integração com Postgres (14 arquivos) | cerca de 83 | **MANTÉM** | Cada um prova SQL, plano, transação ou `idle-in-transaction`, coisas que dublê nenhum alcança (`test_api_connections_hold_no_transaction.py` nasceu do incidente da memória *idle-in-transaction trava o pipeline*) | incidentes reais | regressões de SQL e de transação |

## 4. Varredura de contexto de cobertura (onde procurar, não veredito)

`--cov-context=test` rodou **na cópia** sobre `tests/charts`, `tests/backtest` e 127 arquivos de
`sentimento` dos clusters de domínio e use case (a lista está em `$SP/ctxfiles.txt`). Resultado: **1735
funções coletadas, das quais 195 executam 0 linha de `src/`** `[MEDIDO]`. A lista está em `$SP/zero.txt`.

⚠️ **Anomalia, que não é veredito:** na cópia, **65 testes falharam e 5 deram erro** porque não há `.git`
ali. `test_as_of_batch_differential.py`, por exemplo, chama `git rev-parse`. Eles aparecem como "0 linha"
**por falha de ambiente**. Além disso, "0 linha" é o **comportamento correto** dos guardas estruturais (G10)
e dos testes de tabela de dados (`test_publication_lag_table.py` com 16, `test_instrument_universe_snapshot.py`
com 13, `test_endpoint_shift_table.py` com 5), que leem JSON versionado. Os maiores grupos são
reading_honesty 16, publication_lag 16, universe_snapshot 13 e long_short_ratio_series 9. **A lista não foi
classificada item a item.** Dela, só G3, G4 e G5 foram confirmados por leitura.

## 5. Totais

| veredito | grupos | testes | segundos removíveis no portão |
|---|---|---|---|
| CORTA | 4 (G1–G4) | **6** | cerca de 0 |
| FUNDE | 3 (G5–G7) | 8 → 3 (−5) | cerca de 0 |
| DESCE | 1 (G8) | 2 → 1 (−1) | menos de 1 s, sem medição isolada `[NÃO MEDIDO]` |
| MANTÉM + ACELERA | 1 (`oi_candles_route_invariants`) | 0 | **cerca de 50 s** `[MEDIDO no protótipo]` |
| MANTÉM | 4 (G9–G12) | todo o resto analisado | 0 |

**Removíveis: cerca de 12 casos de teste, que somam quase 0 s. O ganho de tempo do backend está num único
arquivo, por cerca de 50 s, e não sai cortando teste: sai consertando a fixture.** A conclusão para o pedido
do owner é que o backend tem pouca gordura em contagem de testes, e o gargalo dele é esse único arquivo.

## 6. Prova por mutação feita

Só o G1 foi provado por mutação na cópia, com `$SP/run.sh tests/backtest/test_bundle_hash.py tests/backtest/test_bundle_hash_determinism_qa.py`:
- M1 (`sorted(payload)` → `payload`): **5 failed**, sendo 4 de `test_bundle_hash.py` e o teste de QA;
- M2 (não canonicalizar dict aninhado): **2 failed**, ambos de `test_bundle_hash.py`, e o teste de QA verde.

Os grupos G2–G8 estão `[INFERRED: leitura]`, com o argumento de subconjunto escrito acima, e **ainda não
foram provados por mutação**.

## 7. O que falta (handoff)

1. Provar G2, G6, G7 e G8 por mutação na cópia: `$SP/mut/backend`, rodando `$SP/run.sh <testes>`, que limpa
   o `__pycache__` antes. Para os testes que dependem de git, a cópia precisa de um `.git`, e o caminho é
   `git worktree add` numa pasta de rascunho.
2. Classificar as 195 funções de "0 linha" de `$SP/zero.txt`, tirando as que falharam por ambiente.
3. Não analisados: os 33 arquivos de processo real e os 20 de socket real, para saber se a mesma regra está
   provada por subprocess e por unitário. Ver também o custo de subir um uvicorn por requisição nos testes
   de rota.
4. Pares candidatos ainda não lidos: `test_series_history_oi_candles.py::test_requesting_the_polled_series_id_gives_the_same_candles`
   contra `test_oi_candles_route_invariants.py::test_either_requested_id_serves_the_same_candles`, já que o
   segundo cobre o primeiro com dados aleatórios em todos os TFs; e `test_history_ceiling.py::test_the_ceiling_is_ninety_days`
   contra a fronteira de 90 dias da rota (G8).

`$SP` = `/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/a6300abb-51da-44af-9f16-e5a540b2363f/scratchpad`.
O log bruto da suíte inteira está em `$SP/be-full.log`. As durações por teste estão em `$SP/bytest.txt` e as
por arquivo em `$SP/byfile.txt`.

⚠️ **Fora do meu escopo, mas visto:** `git status` do worktree mostra `M frontend/src/app/symbol/axis-latency-probe.ts`.
**Não fui eu**, porque não toquei no front. Provavelmente é o agente de front rodando em paralelo.
