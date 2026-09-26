# W2 — QA Gate da trilha `03a`, rodada 2 (revalidação), `paineis-de-fluxo`

- **Branch / HEAD auditado:** `wave/paineis-f03a` @ `32e2b27`. As correções são `506cba4` (C-1, C-2, C-3) e
  `32e2b27` (E501). Este laudo acrescenta 1 teste parametrizado (3 casos).
- **Rodada anterior:** `gates/W2-QA.md` (NEEDS_FIX, C-1 provado por teste vermelho). Os critérios de
  revalidação vêm de `W2-QA.md:92-98` e `W2-CODE-REVIEW.md:78-86`.
- **Referências:** `docs/plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03a,
  `handoff/Q-STAMP-1-quant-architect.md`, o DoD de T-03.1..T-03.6 e `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md`
  §4-§5.
- **`gate-record` NÃO foi rodado.** A fase 03 divide o gate com a 03b, e quem grava é o orquestrador.

## QA Gate — Fase 03 (trilha 03a) [sentimento · infra]

- [OK] `core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`,
  `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`,
  `web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`: o portão `regras` do
  `make verify` deu **"0 bloqueio(s), 76 aviso(s)"**, o mesmo número da rodada 1 `[MEDIDO]`. O `except` novo em
  `binance_open_interest_client.py:98` devolve `TRANSPORT` com a falha nomeada, então não engole a exceção em
  silêncio.
- [OK] **Os testes existem e passam:** `E2E_API_PORT=8873 E2E_NEXT_PORT=4373 make verify` (log bruto:
  `/tmp/verify-wave-paineis-f03a-20260926T005419Z.log`) deu lint-backend OK (484 arquivos) · lint-frontend OK ·
  test-frontend **930 pass** · test **2880 passed** · boundaries 7 kept / 0 broken · regras OK · política OK ·
  **e2e 52 passed, 4 failed, 2 skipped** `[MEDIDO]`. A conta fecha: 2875 (rodada 1) + 2 testes da rodada 1 + 3
  casos novos. `bash backend/scripts/lint.sh` rodado de novo depois do teste novo → ruff/format/mypy OK em
  484 arquivos, rc=0.
- [OK] **Os 4 vermelhos de e2e são exatamente a baseline do `master`, e não são desta wave**
  (`grep -a '✘' <log>`): `e2e/16:204` (`16-eixo-unico-pan-e-ablacao.spec.ts:204`), `e2e/18:107` e `e2e/18:153`
  (`18-tf-refetch-e-ablacao.spec.ts`), `e2e/20:383` (`20-teto-latencia-historia-sob-demanda.spec.ts`).
  **Nenhum vermelho fora desse conjunto.** A wave não toca `frontend/` (`git diff --stat master...HEAD -- frontend`
  sai vazio). Por isso a regra §4 de Playwright com ablação não se aplica: não há pixel novo.
- [OK] **Cobertura por camada** (`ADR-009/D1`, log:2061-2065): domain **99,7%** contra a meta de 90% · use_cases
  **99,6%** contra 80% · infra **92,5%** contra 70% · total **96,29%** contra 70%. `binance_open_interest_client.py`
  fica em **100%** (47 statements, 6 branches), `open_interest_catalog.py` e `open_interest_grid_stamp.py` em
  100%, `collect_open_interest_poll.py` em 98% (a linha 261 é o `raise` defensivo, a mesma da rodada 1).
- [OK] **O DoD da fase, item a item:** C-1 está corrigido e o teste mata a mutação. C-2 e C-3 estão corrigidos.
  Os demais itens não mudaram (detalhe abaixo).
- [anomalia] Nenhuma. Antes de rodar, `pgrep -af "make verify|pytest|playwright"` não mostrou outro processo, então
  não houve a concorrência da rodada 1. A mutação rodou numa cópia isolada de `backend/` no scratchpad.

Regras bloqueantes avaliadas: **8 de 8** listadas por `harness rules list --severity block`.

**Veredito: APPROVED** (só para a trilha 03a; o `gate-record` da fase 03 continua com o orquestrador)

## Revalidação por mutação (a regra §4 pede a mutação, não o relatório)

Os mutantes rodaram sobre `binance_open_interest_client.py` numa cópia de `backend/`, com
`pytest --no-cov tests/sentimento/test_binance_open_interest_client.py` (15 testes). Antes da bateria, conferi que a
cópia é byte-idêntica à worktree (`diff -q`) e que o import resolve para ela.

| mutante | o que muda | resultado |
|---|---|---|
| M-C1-revert | `except OSError` (o código de antes da correção) | **morto**: 4 vermelhos, o `IncompleteRead` da rodada 1 e os 3 casos novos |
| M-C1-narrow | `except (OSError, http.client.IncompleteRead)` | **morto só pelo teste novo** (3 vermelhos). ⚠️ O teste da rodada 1 **deixava este mutante sobreviver** |
| M-C1-nodrop | tira o `self._drop()` do `except` de transporte | **morto**: 5 vermelhos |
| restaurado | o original | 15 passed |

**A lacuna que esta rodada fechou.** A correção cobre a família inteira (`HTTPException`), mas o único teste
provava só o `IncompleteRead`. Uma correção mais estreita também teria passado, e o docstring de `fetch`
(`:80-84`) promete mais três. O teste novo
`test_every_http_exception_family_member_is_a_transport_failure[cannot-send-request|bad-status-line|line-too-long]`
dispara cada exceção no estágio em que o `http.client` real a levanta (`request` ou `getresponse`). Ele afirma que o
resultado é `TRANSPORT`, que a conexão quebrada é fechada e que a chamada seguinte abre outra e lê. Hoje ele passa,
e mata o M-C1-narrow.

## Os critérios de texto de C-2 e C-3 (`W2-CODE-REVIEW.md:82-86`)

- C-2: `grep -n 'T, T + 20' backend/src/modules/sentimento/domain/open_interest_catalog.py` → **rc=1**. A linha 193
  agora diz `[T - 20 s, T]`.
- C-3: `grep -n 'the same instant' backend/tests/sentimento/test_as_of_is_the_single_reader.py` só encontra a
  **linha 412**, que é o parágrafo de `as_of_batch` (`ADR-039`) e não tem relação com o coletor de OI. O parágrafo do
  `_run_open_interest_poll_collector` (`:239-244`) agora diz que `event_time` difere de `bucket_end` em
  `[0, 20 000]` ms e que a watermark usa `bucket_end` por ser a chave de deduplicação `(symbol, T)`. É o texto que o
  code-review pediu.

## DoD, item a item (o que a rodada 1 aprovou foi reconferido pelo universo da mudança)

`git diff --stat 5f3a440..HEAD -- backend frontend deploy scripts compose.yml` mostra 5 arquivos: os 3 da correção e
os 2 testes da rodada 1. Não mudou nada em `collect_open_interest_poll.py`, `open_interest_grid_stamp.py`,
`collectors_cli.py`, no compose nem no bench. Por isso as evidências da rodada 1 para T-03.2..T-03.6 (bateria de 23
mutantes, 23 mortos, e o bench `run-final`) continuam valendo para o mesmo código, e o `make verify` desta rodada
as passa de novo.

| task | item | estado |
|---|---|---|
| T-03.1 | resposta LIDA, `time` como `event_time`, header de peso | OK (inalterado, 100% de cobertura) |
| T-03.1 | transporte robusto, **C-1** | **OK**: corrigido, e M-C1-revert, M-C1-narrow e M-C1-nodrop morrem |
| T-03.2 | janela `[T−20 s, T]` com teto, conforme `Q-STAMP-1` §4 | OK (código inalterado; o comentário do catálogo, C-2, agora concorda com ele) |
| T-03.3 | 4 entradas de catálogo servidas pela rota | OK (só o comentário mudou) |
| T-03.4 | laço de 60 s na grade, `T − 5 s`, watermark | OK (código inalterado; a justificativa do registro, C-3, foi corrigida) |
| T-03.5 | compose e veredito do infra-architect | OK (inalterado, `gates/T-03.5-infra-architect.md`) |
| T-03.6 | bench na stack própria, borda 4/5 | OK (inalterado; o teste da borda 4/5 da rodada 1 passa) |
| DoD-03a 1 e 3 | 24 h e disco | n/a: pertencem a T-03.7 `[NÃO MEDIDO: exige 24 h em produção]` |
| DoD-03a 5 | `make verify` verde | verde, fora os 4 da baseline |

## Autoria (hook de commit)

`git log --format='%an <%ae> | %cn <%ce>' master..HEAD | sort | uniq -c` → 25 commits, todos
`Stharley Maxwell <stharleymax@gmail.com>`. `grep -ci co-authored` sobre as mensagens → 0.

## Advisórios herdados (não bloqueiam; ficam com o dono do code-review)

`W2-CODE-REVIEW.md` A-1..A-8 seguem abertos como estavam. O follow-up de C-1 para `premium_index_http_client.py:79`
(o mesmo `except OSError`, que já existe no `master`) fica **fora do escopo da wave**, como o code-review registrou.

## Teste acrescentado por este portão (commitado junto com este laudo)

- `backend/tests/sentimento/test_binance_open_interest_client.py::test_every_http_exception_family_member_is_a_transport_failure`
  (3 casos, verdes; matam M-C1-narrow)
