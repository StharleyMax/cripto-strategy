# W2 — QA Gate da trilha `03a` (T-03.1..T-03.6), `paineis-de-fluxo`

- **Branch / HEAD auditado:** `wave/paineis-f03a` @ `60f7487` (código em `5f3a440`; os commits
  seguintes só acrescentam laudos de review).
- **Referências:** `docs/plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03a,
  `handoff/Q-STAMP-1-quant-architect.md`, as entradas T-03.1..T-03.6 de `harness tasks json paineis-de-fluxo`,
  `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.
- **`gate-record` NÃO rodado** (a fase 03 divide o gate com a 03b; quem grava é o orquestrador).

## QA Gate — Fase 03 (trilha 03a) [sentimento · infra]

- [OK] `core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`,
  `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`,
  `web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`: `harness rules --mode sweep`
  → **0 `[BLOQUEIO]`** (portão `regras` do `make verify`: "0 bloqueio(s), 76 aviso(s)"). Os 4 avisos
  `core.module-docstring-single-line` nos arquivos tocados (`collectors_cli.py`, `collector_run_mapping.py`,
  `collector_series_mapping.py`, `series_catalog.py`) já existiam no `master`: a linha 1 é idêntica
  (`diff <(git show master:F | head -1) <(head -1 F)`). A senha `bench-throwaway-${TAG}` em
  `scripts/oi-poll-capture-bench.sh:36` pertence a um container `--rm` efêmero, preso a `127.0.0.1`. Não é
  credencial de produção, e a regra não a acusa.
- [OK] **Os testes existem e passam no HEAD da wave:** `E2E_API_PORT=8871 E2E_NEXT_PORT=4371 make verify`
  (log: `/tmp/verify-wave-paineis-f03a-20260925T230112Z.log`) → lint-backend OK · lint-frontend OK ·
  test-frontend **930 pass** · test **2875 passed**, 1 skipped, 1 xfailed · boundaries 7 kept / 0 broken · regras OK ·
  política OK · **e2e 52 passed, 4 failed** `[MEDIDO]`.
- [OK] **Os 4 vermelhos de e2e são exatamente a baseline do master**, e não são desta wave: `e2e/16:204`
  (`16-eixo-unico-pan-e-ablacao.spec.ts:204`), `e2e/18:107`, `e2e/18:153`, `e2e/20:383`
  (`grep -a '✘' <log>`). **Nenhum vermelho fora do conjunto.** A wave não toca `frontend/`
  (`git diff --stat master...HEAD -- frontend` sai vazio). Por isso a regra §4 de QA de front (Playwright com
  ablação) **não se aplica**: não há pixel novo. O que chega ao front são 4 linhas a mais no catálogo, e os 52
  specs verdes as atravessam.
- [OK] **Cobertura por camada** (`ADR-009/D1`): domain **99,7%** contra a meta de 90% · use_cases **99,6%**
  contra 80% · infra **92,5%** contra 70% · total **96,29%** contra 70%. Nos módulos novos: `open_interest_grid_stamp` 100%,
  `open_interest_snapshot` 100%, `binance_open_interest_client` 100%, `open_interest_catalog` 100%,
  `collect_open_interest_poll` 98% (a linha 261 é o `raise` defensivo de `_next_admitted`),
  `open_interest_poll_capture_bench_cli` 93%. `collectors_cli.py` fica em 83%; do código novo, só
  1824/1830 (os `break` de `stop_event` no meio do ciclo) ficam sem cobertura.
- [FAIL] **O DoD, item a item. Há um defeito provado, C-1** (detalhe abaixo).
- [anomalia, explicada] **Um segundo `make verify` rodou na MESMA worktree ao mesmo tempo** (pid 705964, portas
  padrão 8811/4311, disparado por outro portão). Os dois dividiram `backend/coverage.xml` e `frontend/.next`.
  Por isso o backend levou 680 s em vez de ~40 s. Não houve efeito no veredito: os vermelhos de e2e são
  exatamente a baseline, e as duas execuções mediram a mesma árvore de `src`. Os números de cobertura por camada
  podem ter sido lidos do XML da outra execução, mas o conteúdo seria idêntico. **Recomendação ao orquestrador:**
  serializar os portões que rodam `make verify` na mesma worktree.

Regras bloqueantes avaliadas: **8 de 8** listadas por `harness rules list --severity block`.

**Veredito: NEEDS_FIX**

## DoD, item a item

| task | DoD / MORDE | evidência | |
|---|---|---|---|
| T-03.1 | resposta LIDA da Binance, e `time` é o `event_time` | `REAL_BTC_BODY` capturado (`test_binance_open_interest_client.py:31`). Mutação M1 (`event_time` = instante do pedido) → **morta** por `test_the_real_answer_is_read_at_its_own_time_…` | OK |
| T-03.1 | lê `x-mbx-used-weight-1m` | testes de header, de caixa e de ausência | OK |
| T-03.1 | **transporte robusto** (implícito em "cliente") | **C-1: `IncompleteRead` escapa de `fetch`**. Teste novo **vermelho** (abaixo) | **FAIL** |
| T-03.2 | função pura, casos de borda, validação do quant-architect registrada | `[T−20 s, T]` com teto, fechada nas duas pontas, e a mais fresca vence, conforme `Q-STAMP-1` §4 itens 1-5. **M5′ (piso) → 15 testes vermelhos**, entre eles a propriedade anti-lookahead e a captura real (o laudo exige ≥ 3). **M6′ (a primeira vence) → 2 vermelhos**. M3/M4 (borda ±1 ms), carry-forward sem janela, desempate `>=` e guarda de `__post_init__` → **mortos** | OK |
| T-03.2 | MORDE: carry-forward | `M-carry-forward-no-window` → morto por `test_a_reading_taken_after_t_is_out_of_window_not_pulled_back_to_t` | OK |
| T-03.3 | 4 entradas `binance·open_interest·1m·POINT`, `STOCK`, `POINT_AT_BUCKET_END`, `unit`=ativo base, `denom=base`, servidas pela rota | `unit` fixado em "BTC" → morto (a rota serve as 4 com a chave completa); entrada retirada do catálogo → morta; `ts_convention` trocado → morto | OK |
| T-03.4 | laço de 60 s na grade, `T − 5 s`, carimbo pelo `time`, um run por ciclo, `n_written` pelo writer, eventos em inglês | M-lead-zero, M-lead-after-T, M-no-wait-loop, M-stamp-by-scheduler, M-row-event-time-is-grid, M-no-watermark, M-watermark-strict e M-cadence-accepts-any → **todas mortas**. Os eventos `open_interest_poll_call` e `collector_cycle_completed` e as chaves de `extra` estão em inglês | OK |
| T-03.5 | `docker compose config` válido e veredito do infra-architect | `gates/T-03.5-infra-architect.md:3` **APPROVED**. A variável fica documentada no mesmo idioma de `OPEN_INTEREST_CYCLE_INTERVAL_S` (comentário, sem bloco `environment:`, `compose.yml:159-161`) | OK |
| T-03.6 | stack PRÓPRIA; `md.series` de 0 para > 0 com `n_written > 0`; cota ≤ 4/min pelo header; minuto parado sem linha | `gates/T-03.6-evidence/run-final/bench.log`: containers `oi-capture-bench-*` efêmeros, baseline 0 → **28 linhas, n_written 28**, 7/símbolo; `max_calls_in_a_minute` 4, `max_header_span` 4; minutos ausentes esperados `[…800000, …860000]` sem linha; carry-forward plantado → **FAIL** (a mordida funciona); mutante sem espera → 32 chamadas/min → **FAIL**. O Postgres compartilhado não foi tocado (`D-g`) | OK |
| T-03.6 | a lógica do bench | **O mutante `QUOTA_CEILING_PER_MINUTE = 5` SOBREVIVEU** ao arquivo inteiro. Lacuna de teste, não de produção: **teste novo** `test_five_calls_in_one_minute_is_one_over_the_ceiling` fixa a borda 4/5 nos dois contadores. Passa hoje e mata o mutante | OK (lacuna fechada) |
| DoD-03a 1 (24 h, ≥ 0,95×1.440) e 3 (disco) | fora desta wave | pertencem a **T-03.7** (medição pós-deploy, `todo`) `[NÃO MEDIDO: exige 24 h em produção]` | n/a |
| DoD-03a 5 | `make verify` verde | verde, fora os 4 da baseline | OK |

Bateria de mutação: **23 mutantes, 23 mortos** depois do teste novo (antes, 22 de 23). Ela roda numa cópia isolada de
`backend/` no scratchpad (`mutate.py`), para não contaminar a worktree que outros portões usavam.

## O defeito provado — C-1 (`W2-CODE-REVIEW.md` C-1, agora com teste vermelho)

`backend/src/modules/sentimento/infra/binance_open_interest_client.py:94` captura só `OSError`.
`http.client.IncompleteRead`, `BadStatusLine`, `LineTooLong` e `CannotSendRequest` são `HTTPException`, e não
`OSError`. Eles escapam de `fetch`. Como não há `try` em volta de `client.fetch` em `collectors_cli.py:1832`, a
exceção escapa da thread, `_supervised` dispara `failure_event` e **as 7 threads do processo de coletores param**,
inclusive o `forceOrder`, que é captura-ou-perde.

**Teste:** `backend/tests/sentimento/test_binance_open_interest_client.py::test_a_body_truncated_mid_read_is_a_transport_failure_not_an_escaping_exception`

```
make test-fast K=test_binance_open_interest_client
→ E  http.client.IncompleteRead: IncompleteRead(14 bytes read, 57 more expected)
→ 1 failed, 11 passed
```

A mesma suíte, na cópia isolada, com `except (OSError, http.client.HTTPException)` → **12 passed**. O teste mede
exatamente a correção pedida: sai `TRANSPORT`, a conexão meio lida é fechada e a chamada seguinte abre uma nova.

Os textos C-2 (`open_interest_catalog.py:193` ainda diz `[T, T + 20 s]`) e C-3
(`test_as_of_is_the_single_reader.py:239`, "the same instant") ficam confirmados por `grep`. São defeitos de
documentação, com dono no code-review.

## Ações (NEEDS_FIX)

1. **C-1:** em `binance_open_interest_client.py:94`, capturar `(OSError, http.client.HTTPException)` → `TRANSPORT`,
   com `_drop()`. **Critério de revalidação: a mutação, não o relatório.** O teste acima tem de ficar verde, e tem
   de voltar a ficar vermelho quando se restaura `except OSError`.
2. C-2 e C-3: corrigir o texto (critério literal em `W2-CODE-REVIEW.md:81-86`).
3. Recomendação (não bloqueia): serializar os `make verify` na mesma worktree.

Testes acrescentados por este portão (os dois commitados junto com este laudo):
- `backend/tests/sentimento/test_open_interest_poll_capture_bench.py::test_five_calls_in_one_minute_is_one_over_the_ceiling` (verde; fecha a lacuna do mutante)
- `backend/tests/sentimento/test_binance_open_interest_client.py::test_a_body_truncated_mid_read_is_a_transport_failure_not_an_escaping_exception` (**vermelho até a correção de C-1**)
