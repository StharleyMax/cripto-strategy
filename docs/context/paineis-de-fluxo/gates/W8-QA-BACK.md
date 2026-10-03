# W8-QA-BACK — QA de backend da wave W8 (fase 06: T-06.3, T-06.4)

QA (engenheiro de testes), 2026-10-02. Worktree `.claude/worktrees/wave-paineis-f06`, branch `wave/paineis-f06`
@ `5a7e436`. Norma: `plans/SPEC-009-paineis-de-fluxo/06_velocidade_do_ciclo.md` (6.3/6.4, DoD 3/4),
`handoff/T-06.3-desenho.md`, `handoff/T-06.4-prova.md`, `gates/T-06.3-build.md`, `gates/T-06.4-build.md`.
Só testes editados; nenhum arquivo de produção alterado (`git status --short` ao fim de cada mutação: só os 2
arquivos de teste abaixo). Postgres do Docker local **não** foi tocado; o `DELETE` **não** foi rodado.
`make verify` e e2e **não** rodados (por ordem do despacho).

```
## QA Gate — Fase 06 [sentimento + infra] — W8 (T-06.3, T-06.4)
- [OK]   core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
         web-fullstack.browser-imports-server / web-fullstack.tenant-from-request /
         web-fullstack.server-test-directory-present / own.compose-hardcoded-secret
         — `harness rules --mode sweep --format human` → rc=0, 0 linhas [BLOQUEIO], 78 [AVISO] (nenhum novo é bloqueio)
- [OK]   Suíte existente antes de qualquer teste novo — `make test` (pycache purgado) → 3543 passed, 1 skipped,
         1 xfailed, 249,7 s, rc=0
- [FAIL] Suíte com os testes novos — `make test` → 2 failed, 3547 passed, 1 skipped, 1 xfailed, rc=2
         (as 2 falhas SÃO os defeitos provados abaixo; os outros 4 testes novos passam)
- [OK]   Cobertura 97% total; por camada domain 99,7% / use_cases 99,8% / infra 93,9% contra alvo 90/80/70
         (ADR-009/D1) — `make test`, rodada 1. Arquivos da wave: repeated_fact.py 100%, write_series_row.py 100%,
         postgres_series_sink.py 100%, postgres_series_window_reader.py 95%, single_writer_cli.py 83%, __main__.py 94%
- [FAIL] DoD da fase, item a item — ver §3 (6.4: o script do destino das duplicatas viola a pré-condição F-A da prova)
- [anomalia] DoD 3 "DEPOIS" e DoD 4 "2 boots" dependem do deploy (orquestrador); DoD 5 é do gate da wave
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: NEEDS_FIX
Ações: 1. compact.sh: `cmd_delete` recusar sem `$out/envelopes-before.tsv` (como já recusa sem stats-before)
       2. compact.sh: ler a lista de chunks fora de process substitution, para `set -e` ver a falha do psql
```

---

## 1. Defeitos provados (cada um com teste que falha hoje)

Arquivo novo: `backend/tests/sentimento/test_md_series_compaction_delete_flow.py`. Roda o **subcomando
`delete` de verdade**, com um `docker` substituto no `PATH` que executa o `sh -c 'psql …'` que o script entrega
ao `docker exec` — `psql` real contra o TimescaleDB descartável da suíte, nunca o compartilhado.

### D-1 — o `DELETE` irreversível roda sem a linha de base do F-A

- **Norma:** `T-06.4-prova.md` §4, F-A: *"**Antes** do `DELETE`: sha256 de cada JSON"*; *"Qualquer diferença
  reprova o `DELETE`"*. O owner aceitou apagar **sem backup** (§3.3). O F-A "antes" só pode ser tirado antes.
- **O código:** `scripts/md-series-compaction/compact.sh:229` exige `stats-before.tsv` (F-B) e **não** exige
  `envelopes-before.tsv` (F-A). Pular o passo 3 do cabeçalho apaga as linhas e torna o `verify` impossível de
  passar para sempre (`compact.sh:285`: `F-A FAIL faltam …`), sem volta.
- **Prova:** `test_delete_without_the_f_a_baseline_never_reaches_the_database` — token dado, `stats-before`
  presente, `envelopes-before` ausente ⇒ espera rc=2 antes de qualquer `docker exec`. Hoje:
  `AssertionError: apagadas no total: 0 … assert 0 == 2` (o script segue até o `docker exec`).
- **Correção sugerida (1 linha):** `[[ -s "$out/envelopes-before.tsv" ]] || die "rode 'compact.sh envelopes $out before' antes do DELETE"`.

### D-2 — falha ao listar os chunks sai como "apagadas no total: 0", rc=0

- **O código:** `compact.sh:244`, `done < <(sql_chunks | psql_ro)`. O status de uma process substitution não é
  visto por `set -e`: com `PG_CONTAINER` errado ou o container parado, o laço lê nada e o script imprime
  `apagadas no total: 0` com **rc=0** — indistinguível de "nada a apagar". É a classe de quebra silenciosa que o
  `CLAUDE.md` chama de pior (sinal que não separa "nada aconteceu" de "não conseguiu olhar").
- **Prova:** `test_a_chunk_listing_that_fails_is_not_reported_as_zero_rows_deleted` — todos os portões
  satisfeitos, `docker exec` falha (rc 99) ⇒ espera rc≠0. Hoje: rc=0.
- **Correção sugerida:** `chunks="$(sql_chunks | psql_ro)"` (o `set -e` pega) e o laço sobre `<<< "$chunks"`.
- Atenuante, declarado: o `verify` posterior acusaria `selected ≠ 0` em F-B.1. Não muda o veredito: o `delete`
  mente sobre o que fez.

## 2. Mutações

Runner: `/tmp/claude-1002/…/scratchpad/mut.py` (aplica, purga `__pycache__`, roda `make test-fast K=…`, restaura;
`git status` limpo de produção ao fim). Filtros: T-06.3 `K='extent or api_workers or compose or read_bounds or
window_reader'` (49 testes); T-06.4 `K='(repeated_fact or compaction or write_series_row or single_writer or
postgres_series_sink) and not f_a_baseline and not chunk_listing_that_fails'` (121 testes) — os 2 testes
vermelhos de §1 ficam fora para não matar mutação falsamente. Linha de base verde nos dois filtros.

**Resultado com a suíte final: 28/28 reprovam. Com a suíte do builder: 25/28** (as 3 sobreviventes são minhas,
e os 3 testes novos que as matam estão nos arquivos deste QA).

| id | mutação | resultado |
|---|---|---|
| M1 (declarada) | extent volta ao `MIN/MAX` antigo | KILLED (1 failed) |
| M2 (declarada) | mínimo da 1ª `source` | não rerodada; o caso que a mata (`test_two_sources_…`) está verde, e Q1 é a variante vizinha |
| M3 (declarada) | launcher ignora `API_WORKERS` | KILLED (3) |
| M4 (declarada) | `API_WORKERS` fora do compose | KILLED (4) |
| Q1 | `DISTINCT ON … ORDER BY source, bucket_end DESC` | KILLED (4) |
| Q2a | braço `MAX` sem `symbol = %s` | KILLED (1 com a suíte do builder; 2 com o teste novo) |
| **Q2b** | braço `DISTINCT ON` sem `symbol = %s` | **SOBREVIVEU** à suíte do builder (49 passed) → **KILLED** pelo teste novo `test_another_symbol_of_the_same_series_never_widens_either_end` |
| Q3 | `limit_max_requests_jitter = 0` | KILLED (1) |
| Q4 | `API_LIMIT_MAX_REQUESTS` ignorado | KILLED (1) |
| Q5 | `mem_limit` fora do compose | KILLED (4) |
| A1 (declarada) | `repeats_predecessor_fact` sempre `False` | KILLED (26) |
| A2 (declarada) | sem o termo `available_at` | KILLED (3) |
| Q8 | `available_at` estrito (`>=`): igual deixa de dominar | KILLED (1) |
| Q9 | sem a guarda `observed_at` do predecessor | KILLED (1) |
| Q18 | `FACT_COLUMNS` sem `observer_region` | KILLED (8) |
| A3 (declarada) | predecessor por `ORDER BY observed_at ASC` (forma "existe") | KILLED (1) |
| A4 (declarada) | sem o `commit` da leitura (idle in transaction) | KILLED (1) |
| Q7 | predecessor sem `bucket_end = %s` | KILLED (2) |
| Q6 | repetição checada ANTES de `D7.16` | KILLED (1) |
| Q10 | skip creditado em `n_written` | KILLED (2 + 1 error) |
| Q11 | skip não registra o run (run fica aberto) | KILLED (1) |
| Q12 | skip contado em `n_rejected` | KILLED (1) |
| A5 (declarada) | `flags.sql` sem `NOT bucket_inverted` | KILLED (3) |
| A6 (declarada) | `flags.sql` sem `lag(observer_id)` | KILLED (1) |
| Q13 | `lag(is_final) = is_final` (NULL nunca repete) | KILLED (3) |
| Q14 | `coalesce(…, true)` (todo bucket "invertido") | KILLED (4) |
| Q19 | `flags.sql` ignora o congelamento `ingested_at <= T_SNAP` | KILLED (3) |
| **Q15** | `compact.sh` sem a checagem de `COMPACT_CONFIRM` | **SOBREVIVEU** à suíte do builder (118 passed) → **KILLED** por `test_delete_without_the_confirmation_token_never_reaches_the_database` |
| **Q16** | `\else` faz `COMMIT` em vez de `ROLLBACK` | **SOBREVIVEU** à suíte do builder (118 passed) → **KILLED** por `test_a_chunk_whose_deleted_count_differs_from_the_selected_is_rolled_back` (trigger engole 1 `DELETE` ⇒ selecionadas ≠ apagadas) |

Os cenários pedidos no despacho já estavam no seed do builder e foram conferidos, não reinventados: `X,0,X`
(`5,0,5,5`), revisão (`1,1,2,2,1`), `available_at` descendo (bucket `oih` invertido), mesma `observed_at`
(reentrega, `test_a_redelivery_…`), `is_final` diferente (parametrize sobre `FACT_COLUMNS`), série vazia e de
um chunk no extent.

## 3. DoD da fase 06, itens desta wave

| item | veredito | evidência |
|---|---|---|
| 6.3 — `read_bounds` igual ao antigo | OK | 5 casos contra o oráculo literal (`test_postgres_series_window_reader_extent.py`), + o caso de 2 símbolos deste QA; EXPLAIN 946 → 1,08 ms `[DOC: gates/T-06.3-build.md]` |
| 6.3 — 2 workers, recicláveis, `mem_limit` | OK | `test_compose_api_workers.py`, `test_main_reads_api_workers_from_environment.py`; M3/M4/Q3/Q4/Q5 reprovam |
| DoD 3 — tela antes/depois, `n ≥ 5` | **anomalia** | ANTES medido `[DOC: T-06.3-build.md]`; DEPOIS é pós-deploy, do orquestrador. Desconhecido até medir |
| 6.4 — escritor descarta a repetição do predecessor imediato | OK | 3 termos da prova §1.2 cada um com mutação que reprova (A2/Q8, Q9, Q18/A6); forma "predecessor imediato" (A3) |
| 6.4 — `n_written` não conta o descarte; run de só repetições fecha em 0 | OK | Q10, Q11 reprovam |
| 6.4 — `as_of` invariante | OK no teste | `test_as_of_batch_answers_the_same_over_the_compacted_and_the_raw_store`, grade `as_of` no `DELETE` do teste |
| 6.4 — predicado SQL do script = o da prova §3.2 | OK | `diff` do bloco `lag … WINDOW b` entre `T-06.4-prova.md` e `flags.sql` → rc=0; o `WHERE repeats_predecessor AND NOT bucket_inverted` vira a coluna `selected` (`flags.sql:34`) |
| 6.4 — script exige `COMPACT_CONFIRM` | OK | `compact.sh:226`; agora com teste (Q15) |
| 6.4 — só comita chunk com selecionadas = apagadas | OK | `compact.sh:236-242`, exercido com `psql` real nos dois ramos (COMMIT 2 chunks; ROLLBACK rc=2, 0 linha a menos) |
| 6.4 — pré-condições do `DELETE` irreversível | **FAIL** | D-1 e D-2 (§1) |
| DoD 4 — linhas/min após 2 boots = antes | **anomalia** | proxy em Postgres real (`test_a_reboot_republishing_the_same_window_adds_no_row`); a medida viva é pós-deploy |
| DoD 5 — `make verify` verde no gate da wave | não avaliado | fora do escopo deste despacho |

## 4. Achados que não bloqueiam

- `backend/src/modules/sentimento/domain/repeated_fact.py:36` aponta para `scripts/md-series-compaction/selected.sql`,
  que não existe (`ls` → inexistente); o arquivo é `flags.sql`. Ponteiro morto em docstring de produção.
- `backend/src/main/__main__.py`: `API_LIMIT_MAX_REQUESTS=0` (ou negativo) passa a `uvicorn` sem validação,
  enquanto `API_WORKERS < 1` é recusado. `[NÃO MEDIDO]` o efeito (provável reciclagem imediata de todo worker);
  o compose fixa 2000, então é só configuração.
- `compact.sh` `cmd_snapshot` lê o `lag` do **primeiro** grupo de `XINFO GROUPS`; hoje há um grupo `[INFERRED]`.

## 5. Arquivos deste QA

- `backend/tests/sentimento/test_md_series_compaction_delete_flow.py` (novo, 6 testes: 4 verdes, 2 vermelhos = D-1, D-2)
- `backend/tests/sentimento/test_postgres_series_window_reader_extent.py` (+1 teste, mata Q2b)
