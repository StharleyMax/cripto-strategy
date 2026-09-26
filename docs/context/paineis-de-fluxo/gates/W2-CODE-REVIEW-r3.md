# W2 — code-review r3 (nível high) — `master...wave/paineis-f03a`

- **Data:** 2026-09-25 · **Worktree:** `.claude/worktrees/wave-paineis-f03a` · **HEAD revisado:** `bbcd9de`
- **Universo:** `git diff --stat master...wave/paineis-f03a` → **57 arquivos, +6476/−41** `[MEDIDO]`.
  Delta sobre a r2 (`32e2b27`): `git diff --stat 32e2b27..wave/paineis-f03a` → **5 arquivos**, dos quais
  código só `collector_series_mapping.py` (+7/−3, comentário) e `test_binance_open_interest_client.py`
  (+70, teste) `[MEDIDO]`.
- **Método:** skill `code-review` em nível `high` disparada (execução bifurcada `code-review-2`); o
  resultado dela **não chegou antes do fechamento deste portão**, então o veredito abaixo se apoia na
  re-verificação direta do delta no código, feita por este portão. A r2 revisou o resto do diff e não
  deixou outro achado confirmado além de D-1.

## Veredito: **APPROVED**

D-1 (único bloqueante da r2) foi corrigido com texto exato e verificável. O delta novo não introduz defeito.

## Revalidação da r2

| # | prova | resultado |
|---|---|---|
| D-1 | `grep -n 'not drawn before' backend/src/modules/sentimento/use_cases/collector_series_mapping.py` | **rc=1, sem ocorrência** `[MEDIDO]`. O novo texto (`:1185-1191`) restringe a garantia a `final_only` e declara que sob `intrabar` a linha é admitida a partir de `received_at` |
| D-1 (fidelidade) | `backend/src/modules/sentimento/domain/as_of_accessor.py:811-813` | `if bar_policy is BarPolicy.INTRABAR: return True`, senão `bucket_end <= t and is_final is not False` — o comentário novo descreve exatamente isto `[MEDIDO]` |

## Delta novo

- `test_every_http_exception_family_member_is_a_transport_failure` (QA r2): paramétrico em
  `CannotSendRequest`/`BadStatusLine`/`LineTooLong`, afirma `TRANSPORT`, conexão fechada e reconexão
  saudável. Correto; mata o conserto estreito `except (OSError, IncompleteRead)`.
- `make test-fast K="binance_open_interest_client or open_interest"` → **201 passed, 2684 deselected**
  `[MEDIDO]`. ⚠️ não é verde de portão (sem cobertura/piso); o portão é `make verify`, não rodado aqui.

## Advisórios

Os A-1'..A-7' da r2 continuam valendo como estavam (nenhum foi tocado pelo delta, nenhum é bloqueante).
