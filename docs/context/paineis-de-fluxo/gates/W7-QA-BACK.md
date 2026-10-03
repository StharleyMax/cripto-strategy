# W7-QA-BACK — QA de backend da fase `05` de `paineis-de-fluxo` (componente `sentimento`)

Escopo: `T-05.2` (zero legítimo de liquidação no coletor) e `T-05.3` (backpressure no backfill de boot de
klines). Árvore: worktree `wave-paineis-f05`, branch `wave/paineis-f05` @ `db992c0` (contém `19bf1a9`,
`a6b6114`, `f4321d4`). Norma: `docs/plans/SPEC-009-paineis-de-fluxo/05_correcoes_de_uso.md` (DoD 2, 3, 5),
`handoff/T-05.2-desenho.md`, `gates/T-05.2-build.md`, `gates/T-05.3-build.md`,
`handoff/FIX-uso-2026-10-02.md`. Data: 2026-10-02. O QA **não tocou em código de produção**: só acrescentou
testes.

```
## QA Gate — Fase 05 [sentimento]
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request /
       web-fullstack.server-test-directory-present / own.compose-hardcoded-secret
       — `harness rules --mode file --path <f>` nos 16 arquivos de `git diff --name-only origin/master..HEAD
       -- backend deploy` + nos 3 testes do QA: 0 BLOQUEIO em todos. rc=2 em 3 arquivos de produção
       (liquidation_collection.py, collectors_cli.py, collect_liquidation_history.py) = AVISO
       `core.module-docstring-single-line` na linha 1, pré-existente e fora do diff.
- [OK] Testes existem e passam — `find backend -name __pycache__ -prune -exec rm -rf {} + && make test`
       ANTES dos testes do QA: 3474 passed, 1 skipped, 1 xfailed (231,3 s), rc=0.
       DEPOIS: 3479 passed, 1 skipped, 1 xfailed (244,7 s), rc=0.
- [OK] Cobertura 96,90% total contra alvo 70% (pyproject `fail_under`); por camada (ADR-009/D1):
       domain 99,7% (meta 90) · use_cases 99,8% (meta 80) · infra 93,9% (meta 70) — `make test`, rc=0.
- [OK] Mutações declaradas pelos builders: 14/14 reprovam (T-05.2 M1–M9, T-05.3 M1–M5).
- [OK] Mutações do QA: 12 aplicadas; 6 reprovaram de primeira; 6 sobreviveram. 5 das 6 eram LACUNA DE
       TESTE (a produção está certa), e o QA escreveu um teste para cada: as 5 agora reprovam. 1 é equivalente
       (QA52-4, justificada abaixo).
- [OK] DoD 2, em teste: zero de minuto consultado → `15/15` + ablação por `knowledge_time` → `0/15`.
- [PENDENTE] DoD 2 em dado real — depende do reparo pós-merge (não reiniciei container, por instrução).
- [PENDENTE] DoD 3 em dado real — idem.
- [PENDENTE] DoD 5 (`make verify`) — não rodado por instrução (front em paralelo, e2e mede latência).
       Os builders registraram verify VERDE em `7e24463` (T-05.2) e no ramo de T-05.3; aqui só rodou `make test`.
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED (código + testes). A fase NÃO fecha antes de os 3 PENDENTES serem medidos.
```

## 1. Mutações

Uma por vez, `__pycache__` purgado antes de cada uma, `timeout 300 make -s test-fast K=<filtro>`, e o arquivo
restaurado depois. Filtros: T-05.2 = `test_liquidation_collection or test_collect_liquidation_history or
test_collectors_cli_liquidation_thread or test_series_history_sparse_liquidation or liquidation` (207 testes);
T-05.3 = `klines or collectors_cli or grid_aligned or backpressure` (349 testes). No fim, `git status --short`
mostrou só os 3 arquivos de teste do QA `[MEDIDO 2026-10-02]`.

### Declaradas pelos builders: 14/14 reprovam

| mutação | falhas |
|---|---|
| B52-M1 `answered=True` | 1 (`…not_a_single_zero_is_written[empty-array]`) |
| B52-M2 sem intercalar | 6 |
| B52-M3 sem checar `zero_published` | 2 |
| B52-M4 `floor` no lugar de `ceil` | 1 |
| B52-M5 sem a guarda de retenção | 2 |
| B52-M6 range +1 e sem `is_settled_bucket` | 10 |
| B52-M7 `sorted` no lugar de `heapq.merge` | 1 |
| B52-M8 o lookback do 1º ciclo nunca volta ao default | 1 |
| B52-M9 lembrar o minuto que o ZL-2 segurou | 1 |
| B53-M1 sem `drain_gate.wait` | 2 |
| B53-M2 `_catch_up_cursor` sempre `None` | **3** (o relatório do build diz 4; continua reprovando) |
| B53-M3 `RedisCommandError` escapa do probe | 1 |
| B53-M4 grupo `"single_writer"` fixo | 1 |
| B53-M5 teto = `maxlen` | 3 |

### Mutações do QA: 12 aplicadas

| id | mutação (produção) | 1ª rodada | com os testes do QA |
|---|---|---|---|
| QA52-1 | `answered=outcome.answered and bool(points)`: janela respondida e vazia não gera zero | **sobreviveu** | reprova: `test_a_quiet_answered_window_with_no_point_at_all_is_ten_zeros_per_side` |
| QA52-2 | `n_points_in_response=len(settled)`: a guarda conta só os pontos assentados | **sobreviveu** | reprova: `test_the_retention_guard_counts_the_whole_response_not_only_its_settled_points` |
| QA52-3 | sem a poda de `zero_published` | reprova (1) | — |
| QA52-4 | a poda ignora o símbolo | **sobreviveu** | equivalente (ver abaixo) |
| QA52-5 | **anti-lookahead**: `to_row((bucket_start+60)*1000, …)`, linha datada no `bucket_end` em vez do relógio | **sobreviveu** | reprova: `test_a_consulted_zero_is_known_only_from_the_instant_it_was_written` |
| QA52-6 | guarda de retenção estrita (`>`) | reprova (2) | — |
| QA52-7 | `run()` não repassa `first_cycle_lookback_s` à thread | **sobreviveu** | reprova: `test_run_hands_the_configured_first_cycle_lookback_to_the_liquidation_thread` |
| QA53-1 | o lag ignora o nome do grupo | reprova (2) | — |
| QA53-2 | gate estrito (`lag < max_lag`) | reprova (1) | — |
| QA53-3 | alcance do tail com off-by-one (`tail_limit` no lugar de `tail_limit-1`) | reprova (1) | — |
| QA53-4 | **o walk de catch-up publica sem esperar o escritor** (gate só com `backfill_from_ms`) | **sobreviveu** | reprova: `test_the_catch_up_walk_also_waits_for_the_writer` |
| QA53-5 | lag `None` lido como "pode publicar" | reprova (1) | — |

**Por que QA52-4 é equivalente** `[INFERRED: aritmética do ciclo]`. Os símbolos de um ciclo são espaçados
por `cycle_seconds / n`, ou seja 75 s com 4 símbolos e cadência de 300 s. O `floor` de um símbolo posterior
é no máximo `cycle_seconds` mais novo. A poda errada apagaria chaves de outro símbolo só no intervalo
`[floor_A, floor_B)`, e o ciclo seguinte desse outro símbolo já começa num `floor ≥ floor_A + 300 s`, acima
desse intervalo. Logo nada é regravado. No `_FakeClock` o relógio de época nem anda entre símbolos.

**Os 5 sobreviventes que não eram equivalentes eram lacuna de TESTE, não defeito de produção.** Os 5 testes
novos passam contra a produção sem nenhuma edição (`make -s test-fast K='quiet_answered_window or
retention_guard_counts or consulted_zero_is_known or first_cycle_lookback_to_the or catch_up_walk_also'` →
`5 passed`). Dois deles cobrem o que esta fase existe para fazer:

- **QA52-1.** Antes, nenhum teste exercia o caso dominante: o símbolo respondido com `history: []` e um lado
  que já se provou. O único teste com `history: []` roda com estado novo, onde o ZL-2 esconde tudo.
- **QA52-7.** Antes, nenhum teste passava por `run()`. Sem o repasse, o reparo do DoD 2 rodaria com 3 h,
  daria `rc=0` e deixaria os buracos. Seria uma quebra silenciosa.

## 2. As checagens pedidas

| checagem | evidência |
|---|---|
| **ZL-2 intacto** | `git diff origin/master..HEAD --stat` não lista `liquidation_zero_legitimacy.py`. O zero sintético entra antes de `classify_side_points` (`collect_liquidation_history.py:301-312`). B52-M9 e o MORDE 3 reprovam e passam como esperado |
| **anti-lookahead (`available_at`)** | Produção: `collectors_cli.py:2564` `to_row(_epoch_ms(), …)` e `collector_series_mapping.py` `available_at=observed_at=received_at`. Teste novo: toda linha tem `available_at ≥ relógio antes do ciclo` e `bucket_end ≤ available_at`. QA52-5 reprova. Leitura: `test_the_same_zeros_are_invisible_to_a_knowledge_time_before_they_were_written` usa um `_FakeReader` que devolve TUDO, então o corte vem do `as_of` real |
| **guarda de retenção (1500)** | `liquidation_collection.py:313` `>=`. Bordas: B52-M5 e QA52-6 (`>`) reprovam. Na camada de use case: QA52-2 reprova com o teste novo |
| **catch-up do watermark** | `_catch_up_cursor` com `>=` e `tail_limit-1` (`collectors_cli.py:1254-1255`). B53-M2 e QA53-3 reprovam. O catch-up também passa pelo gate: QA53-4 reprova com o teste novo |
| **perda silenciosa por MAXLEN** | Controle `test_without_waiting_…` (24.060 de 36.060 aparadas) contra `…trims_nothing` (0). B53-M1 e B53-M5 reprovam. O probe lê `lag` de `XINFO GROUPS` (não o `XLEN`), o grupo pelo nome (QA53-1) e trata `lag=None` como espera (QA53-5). Sem `XDEL` em `backend/src` (`grep -rn '"XDEL"'` vazio), então o `lag` do Redis 7 não vira nulo por lápide |

## 3. Riscos residuais (não bloqueiam; ficam declarados)

1. **A re-população de 5 dias provavelmente ACIONA a guarda de retenção em BTCUSDT.** São ~1.276 pontos em
   4 dias (`FIX-uso` §D-B), o que dá ~1.595 em 5 `[INFERRED: proporção linear]`, ≥ 1.500. O efeito é
   conservador: só há zero a partir do ponto mais antigo devolvido, que fica entre ~4,7 e 5 dias atrás e por
   isso ainda cobre a janela de 4 dias do DoD. Mas a premissa do desenho §4 ("abaixo da guarda") não vale para
   5 dias.
2. **O primeiro ciclo de liquidação na re-população publica sem gate.** São até 7.200 minutos × 2 lados =
   14.400 linhas por símbolo, espaçadas 75 s. Pico estimado de lag: 20.000 (teto do klines) + 9.000 (página)
   + 14.400 + 8.064 (OI) ≈ 51.500, abaixo do `MAXLEN` de 100.000 `[INFERRED: aritmética; não medido]`.
   Depois do reparo, confira `redis-cli XINFO GROUPS md.series.write` → `lag` e `entries-read`.

## 4. PENDENTES — o orquestrador mede depois do merge e do reparo

Os comandos de reparo estão em `gates/T-05.2-build.md` §"Comando de reparo" e `gates/T-05.3-build.md` §5.

- **DoD 3** (as 6 séries `/fapi/v1/klines` de BTCUSDT, 4 dias, esperado `5760` cada, hoje 5.696):
  ```bash
  docker exec -i deploy-postgres-1 sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB' <<'SQL'
  with w as (select (extract(epoch from date_trunc('minute', now()))*1000)::bigint t1)
  select series_key_id, count(distinct bucket_end) n, 5760 expected from md.series, w
  where source='/fapi/v1/klines' and symbol='BTCUSDT' and bucket_end > w.t1 - 4*86400000
    and bucket_end <= w.t1 group by 1 order by 1;
  SQL
  ```
- **DoD 2 apertado** (desenho §4): `GET /series-history?series_key_id=<long|short BTCUSDT>&symbol=BTCUSDT&
  interval=15m&window_start_ms=…&window_end_ms=…&knowledge_time_ms=…`, com 4 dias. Os três critérios:
  - (a) os buckets fechados com `bucket_end ≤ T_deploy` e `present<expected` têm de ser 0;
  - (b) existe ≥ 1 bucket `value "0"` com `absence null`;
  - (c) ablação: com `knowledge_time_ms = T_deploy − 1`, 100% parcial.

  Depois, os falsificadores F-1 e F-2 (desenho §6).
- **DoD 5**: `make verify` com `__pycache__` purgado, depois que o front da fase estiver pronto.

## 5. Testes acrescentados pelo QA (só testes)

- `backend/tests/sentimento/test_collect_liquidation_history.py`: +2 (QA52-1, QA52-2)
- `backend/tests/sentimento/test_collectors_cli_liquidation_thread.py`: +2 (QA52-5, QA52-7)
- `backend/tests/sentimento/test_collectors_cli_klines_backfill_backpressure.py`: +1 (QA53-4)

Lint: `bash backend/scripts/lint.sh` → ruff `All checks passed!` · `495 files already formatted` · mypy
`Success: no issues found in 495 source files`.
