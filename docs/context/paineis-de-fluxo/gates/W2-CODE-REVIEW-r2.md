# W2 — code-review r2 (nível high) — `master...wave/paineis-f03a`

- **Data:** 2026-09-25 · **Worktree:** `.claude/worktrees/wave-paineis-f03a` · **HEAD revisado:** `32e2b27`
- **Universo:** `git diff --stat master...wave/paineis-f03a` → **54 arquivos, +6171/−41** `[MEDIDO]`.
  Em relação à r1 (`5f3a440`), entram `506cba4` (C-1/C-2/C-3) e `32e2b27` (E501), mais os laudos.
- **Método:** skill `code-review` em nível `high` (execução bifurcada, 10 achados brutos), e depois
  **cada achado re-verificado no código** por este portão. Revalidação da r1 **pela mutação**, não
  pelo relatório (§4 das regras de despacho).

## Veredito: **NEEDS_FIX**

As três correções da r1 entraram e a de C-1 foi provada pela mutação. Sobra **1 defeito confirmado**
(D-1). É da mesma classe que a r1 tratou como bloqueante em C-2/C-3: um comentário novo desta wave
promete uma garantia anti-lookahead que o código só entrega sob uma das duas políticas. O conserto é
uma frase. Nenhum achado novo de comportamento foi confirmado.

## Revalidação da r1

| # | prova | resultado |
|---|---|---|
| C-1 | mutação: em `binance_open_interest_client.py`, `except (OSError, http.client.HTTPException)` → `except OSError`, e depois `make test-fast K="binance_open_interest_client"` | **4 failed, 11 passed** (vermelho). Restaurado: **15 passed** `[MEDIDO]`. ⚠️ A contagem inclui `test_every_http_exception_family_member_is_a_transport_failure`, que está **não commitado** na worktree (QA r2 em curso, de outro agente). Este portão não o tocou. O teste commitado com `IncompleteRead` (`test_binance_open_interest_client.py:252`) também fica vermelho sob a mutação. |
| C-2 | `grep -n 'T, T + 20' backend/src/modules/sentimento/domain/open_interest_catalog.py` | **sem ocorrência**. A linha 193 agora diz `[T - 20 s, T]` `[MEDIDO]` |
| C-3 | `grep -n 'the same instant' backend/tests/sentimento/test_as_of_is_the_single_reader.py` | só aparece na **linha 412** (parágrafo do `as_of_batch`), fora do parágrafo do coletor de OI. As linhas 239-244 afirmam agora que as duas colunas **diferem** em `[0, 20 000]` ms `[MEDIDO]` |

## Confirmado (bloqueia)

### D-1 — o comentário do sétimo produtor diz que a linha "não é lida antes de `T`", e sob `intrabar` ela é
`backend/src/modules/sentimento/use_cases/collector_series_mapping.py:1183-1187` (linha nova desta wave)

- O texto: *"`as_of` admits a row on `bucket_end <= t` (R-2) as well as `available_at <= knowledge_time`
  (R-1), so the row is not drawn before `T`."*
- O código: `as_of_accessor.py:802-813`, `_r2_admits` devolve `True` **sem condição** sob
  `BarPolicy.INTRABAR`. R-2 só existe sob `final_only`, e `api/routes/series_history.py:64` aceita
  `intrabar` do chamador.
- Caminho: `available_at = received_at ≈ T − 4 s` (`:1220`). Uma leitura `intrabar` com
  `t ∈ [received_at, T)` devolve a linha de `bucket_end = T`, que tem `is_final=True`, antes de `T`.
- Não há vazamento de informação: o valor foi observado de fato em `received_at`. O defeito está na
  frase. Ela apresenta como garantia geral algo que só vale sob `final_only`, e quem confiar nela pode
  desenhar um consumidor `intrabar` supondo que o fechamento de `T` nunca aparece antes de `T`.
- **Correção:** restringir a frase a `final_only` e declarar o caso `intrabar`, por exemplo *"under
  `final_only`, R-2 keeps the row out before `T`; under `intrabar` R-2 does not apply and the row is
  admitted from `received_at`, which is a genuine observation, not look-ahead"*.
- **Revalidação:** `grep -n 'not drawn before' backend/src/modules/sentimento/use_cases/collector_series_mapping.py`
  tem de voltar vazio, ou cair numa frase que nomeie `final_only`.

## Advisórios (não bloqueiam)

| # | onde | achado | por que não bloqueia |
|---|---|---|---|
| A-1' | `collectors_cli.py:400-409` | a justificativa de `_OPEN_INTEREST_POLL_LEAD_S` (*"every `d` in `[2,3 s; 10,2 s]` admits 100%… 5,2 s on the stale side"*) está desatualizada frente à evidência commitada nesta mesma wave: `run-1/calls.jsonl` tem `lag_ms` 14 683 e `staleness_ms` 18 805 (LINKUSDT, `admitted`), ou seja, ~1,2 s de folga, e `open_interest_poll_capture_bench_cli.py:272-273` já diz que o bench mediu 14,7 s | a frase tem escopo (*"over the n = 4.546 measured lags"*) e o efeito possível é minuto **AUSENTE**, nunca look-ahead. É risco de `DoD-1` (≥ 95%). Recomenda-se atualizar a margem citada |
| A-2' | `collectors_cli.py:1828` | 4 chamadas sequenciais numa conexão com timeout de 20 s: um travamento empurra os símbolos seguintes para `OUT_OF_WINDOW` | o mesmo A-1 da r1 |
| A-3' | `collectors_cli.py:1841-1855` | `settle` dentro do `except _PUBLISH_FAILURE_EXCEPTIONS` (que inclui `ValueError`), e o caminho `REJECTED` descarta `weight_used`, `src_sha256` e as linhas `open_interest_poll_call` | o mesmo A-4 da r1. O processo sai com `exit 1` nos dois casos e o tipo da exceção vai para `notes`. `SymbolNotQuotedInUsdtError` é latente: `INITIAL_SYMBOLS` são todos USDT |
| A-4' | `collectors_cli.py:1827-1829` | um stop no meio do ciclo corta o laço e grava `n_calls = len(fetches)`, com veredito `ACCEPTED` e sem nota sobre os símbolos não chamados | só acontece no encerramento (SIGTERM). A perda do minuto é inerente à parada, e o que falta é o rastro. Diagnóstico |
| A-5' | `binance_open_interest_client.py:109` | 429/418 sem backoff nem `Retry-After` | o mesmo A-2 da r1: decisão transversal aos irmãos Binance |
| A-6' | `open_interest_poll_capture_bench_cli.py:228` | `minute_quotas` agrupa pelo minuto local de `sent_at`. Uma chamada que cruze a virada do contador da Binance infla o `header_span` | é ferramenta de bench, e o erro é **falso FAIL** (falha fechado), nunca falso PASS |
| A-7' | `open_interest_snapshot.py:186` | 3ª cópia do parse de `x-mbx-used-weight-1m` | o mesmo A-7 da r1 (reuso) |
| — | `scripts/oi-poll-capture-bench.sh` | a skill acusou comentários em português | **descartado:** todos os `scripts/*.sh` existentes comentam em português (`install-git-hooks.sh`, `install-claude-hooks.sh` e outros), e o `CLAUDE.md` declara que *"idioma de identificador é convenção, não portão"* |

Os A-3, A-5, A-6 e A-8 da r1 que a skill não repetiu continuam valendo como estavam.
