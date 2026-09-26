# W2 — QA Gate da trilha `03a`, rodada 3 (revalidação de D-1), `paineis-de-fluxo`

- **Branch / HEAD auditado:** `wave/paineis-f03a` @ `bbcd9de`. A correção é `bbcd9de` (D-1, só comentário, 7+/3−
  em `collector_series_mapping.py`). Este laudo acrescenta 1 teste parametrizado (6 casos).
- **Rodadas anteriores:** `gates/W2-QA.md` (NEEDS_FIX, C-1), `gates/W2-QA-r2.md` (APPROVED). Depois da r2, o
  `gates/W2-CODE-REVIEW-r2.md` deu NEEDS_FIX por D-1 (`:27-45`). O critério de revalidação está em `:43-44`.
- **Referências:** `docs/plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03a,
  `handoff/Q-STAMP-1-quant-architect.md`, o DoD de T-03.1..T-03.6 e
  `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.
- **`gate-record` NÃO foi rodado.** A fase 03 divide o gate com a 03b, e quem grava é o orquestrador.

## QA Gate — Fase 03 (trilha 03a) [sentimento · infra]

- [OK] `core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`,
  `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`,
  `web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`: o portão `regras` do
  `make verify` deu **"0 bloqueio(s), 76 aviso(s)"**, o mesmo número da r1 e da r2 `[MEDIDO]`.
- [OK] **Os testes existem e passam.** `E2E_API_PORT=8873 E2E_NEXT_PORT=4373 make verify` sobre `bbcd9de` (log
  bruto: `/tmp/verify-wave-paineis-f03a-20260926T014526Z.log`) deu: lint-backend OK (484 arquivos),
  lint-frontend OK, test-frontend **930 pass**, test **2880 passed, 1 skipped, 3 deselected, 1 xfailed**,
  boundaries 7 kept / 0 broken, regras OK, política OK, **e2e 52 passed, 4 failed** `[MEDIDO]`. Com o teste
  novo aplicado, `make test` deu **2889 passed, 1 skipped, 1 xfailed**, rc=0 `[MEDIDO]`. A conta fecha: 2880 +
  3 que o `verify` desmarca + 6 casos novos. `bash backend/scripts/lint.sh` depois do teste novo: ruff, format e
  mypy OK em 484 arquivos.
- [OK] **Os 4 vermelhos de e2e são exatamente a baseline do `master` e não vêm desta wave**
  (`grep -a '✘' <log>`): `e2e/16:204` (`16-eixo-unico-pan-e-ablacao.spec.ts:204`), `e2e/18:107` e
  `e2e/18:153` (`18-tf-refetch-e-ablacao.spec.ts`), `e2e/20:383`
  (`20-teto-latencia-historia-sob-demanda.spec.ts`). **Nenhum vermelho fora desse conjunto.**
  `git diff --stat master...HEAD -- frontend` sai vazio, então não há pixel novo e a regra §4 de Playwright com
  ablação não se aplica.
- [OK] **Cobertura por camada** (`make test` com o teste novo, piso de `ADR-009/D1`): domain **99,7%** contra
  meta de 90%, use_cases **99,6%** contra 80%, infra **92,5%** contra 70%, total **96,30%** contra 70%
  `[MEDIDO]`.
- [OK] **DoD da fase, item a item.** D-1 está corrigido, e o comportamento que o comentário agora descreve
  ficou fixado por teste. O resto não mudou (detalhe abaixo).
- [anomalia] Nenhuma. `pgrep -af "make verify|pytest|playwright"` não mostrou outro processo antes do verify.
  Rodei os mutantes numa cópia isolada de `backend/` no scratchpad e confirmei que o import resolve para ela.
  Na cópia, 15 testes falham em qualquer estado, com ou sem mutante: eles chamam `git rev-parse` e a cópia não
  é repositório git. Por isso contei a morte dos mutantes pela diferença de conjuntos contra essa base, que
  está no fim do laudo.

Regras bloqueantes avaliadas: **8 de 8** listadas por `harness rules list --severity block`.

**Veredito: APPROVED** (vale só para a trilha 03a; o `gate-record` da fase 03 continua com o orquestrador)

## D-1: critério de texto (`W2-CODE-REVIEW-r2.md:43-44`)

- `grep -n 'not drawn before' backend/src/modules/sentimento/use_cases/collector_series_mapping.py` → **rc=1,
  sem ocorrência** `[MEDIDO]`.
- `collector_series_mapping.py:1185-1191` separa agora os dois casos. Sob `final_only`, R-2 impede a leitura da
  linha antes de `T`. Sob `intrabar`, `_r2_admits` devolve `True` e a linha entra a partir de `received_at`,
  o que o texto chama de observação genuína e não de look-ahead. Conferi contra o código:
  `domain/as_of_accessor.py:802-813` (`_r2_admits`) e `:581-630` (`_admits`: R-1 é
  `available_at <= knowledge_time`, e `observed_at <= knowledge_time` também entra).
- Procurei a mesma afirmação sem qualificador nos outros arquivos de `backend/src` que a wave altera, com
  `git diff master...HEAD --name-only -- backend/src | xargs grep -n 'before \`T\`'`. Das 4 ocorrências, 2
  são o próprio texto corrigido. As outras 2 (`open_interest_grid_stamp.py:37`, `collectors_cli.py:1790`)
  tratam do agendamento da chamada, não da leitura.

## D-1: a mutação (a §4 pede mutação, não relatório)

A correção só mexe em comentário, e comentário não se muta. O que dá para fixar é o **comportamento** que o
comentário afirma. Nenhum teste fazia isso para o produtor de OI por poll:
`grep -rln 'open_interest_poll' tests | xargs grep -ln 'INTRABAR\|intrabar'` não achava nada. Acrescentei então
`test_collect_open_interest_poll.py::test_a_poll_row_read_before_t_is_admitted_under_intrabar_only`. Ele monta
a linha com o próprio `build_open_interest_poll_to_rows`, a partir da captura real de BTCUSDT (`received_at` =
`T − 2 929 ms`), e a lê pelo leitor único `as_of`, com `RENDERING` e `knowledge_time = t`, em 6 instantes:

| caso | `t` | `bar_policy` | esperado |
|---|---|---|---|
| intrabar-before-received | `received_at − 1` | intrabar | ausência |
| intrabar-at-received | `received_at` | intrabar | `96012.544` |
| intrabar-just-before-t | `T − 1` | intrabar | `96012.544` |
| final-only-at-received | `received_at` | final_only | ausência |
| final-only-just-before-t | `T − 1` | final_only | ausência |
| final-only-at-t | `T` | final_only | `96012.544` |

Os mutantes rodaram na cópia isolada. A coluna "existentes" conta os testes com `-k '(as_of or open_interest)'`
que falham além da base de 15:

| mutante | o que muda | teste novo | existentes |
|---|---|---|---|
| M-R2-intrabar-applies | `_r2_admits` aplica R-2 também sob `intrabar` (o oposto do que o comentário diz) | **morto** (2 de 6 vermelhos) | 2 |
| M-R2-final-only-ignores-bucket-end | sob `final_only`, `_r2_admits` ignora `bucket_end <= t` | **morto** (2 de 6) | 3 |
| M-avail-is-T | o produtor grava `available_at = T` em vez de `received_at` | **morto** (2 de 6) | 1 |
| M-avail-early | o produtor grava `available_at = received_at − 60 s` | sobrevive: **equivalente para esta leitura**, porque `observed_at = received_at` continua barrando `t < received_at` | 1 (`test_the_row_is_the_polled_series_of_its_symbol_observed_final_and_exact`) |
| restaurado | o original | 6 passed | 0 |

**O que isto prova e o que não prova.** Os testes existentes já matavam os quatro mutantes, então o teste novo
não fecha nenhum buraco de detecção. O que ele acrescenta é a afirmação de D-1 fixada **no nível do sétimo
produtor**. Se alguém mudar o produtor ou o leitor e o comportamento se afastar do comentário, um teste com o
nome dessa afirmação fica vermelho, e não só um teste genérico do acessor.

## DoD, item a item

`git diff --stat 32e2b27..bbcd9de -- backend frontend deploy scripts compose.yml` mostra 1 arquivo de produção
(`collector_series_mapping.py`, só comentário) e o teste da r2. O código de T-03.1..T-03.6 é o mesmo que a r2
aprovou. As evidências da r1 e da r2 (23 mutantes de T-03.2..T-03.6 mortos, M-C1-revert, M-C1-narrow e
M-C1-nodrop mortos, bench `run-final`) continuam valendo, e o `make verify` desta rodada passa todas de novo.

| task | item | estado |
|---|---|---|
| T-03.1 | resposta LIDA, `time` como `event_time`, header de peso, transporte (C-1) | OK (inalterado desde a r2) |
| T-03.2 | janela `[T−20 s, T]` com teto, conforme `Q-STAMP-1` §4 | OK (inalterado) |
| T-03.3 | 4 entradas de catálogo servidas pela rota | OK (inalterado) |
| T-03.4 | laço de 60 s na grade, `T − 5 s`, watermark; mapeamento para `SeriesRow` | OK. O comentário do mapeamento (D-1) está corrigido e o comportamento fixado pelo teste novo |
| T-03.5 | compose e veredito do infra-architect | OK (inalterado, `gates/T-03.5-infra-architect.md`) |
| T-03.6 | bench na stack própria, borda 4/5 | OK (inalterado) |
| DoD-03a 1 e 3 | 24 h e disco | n/a: são de T-03.7 `[NÃO MEDIDO: exige 24 h em produção]` |
| DoD-03a 5 | `make verify` verde | verde, fora os 4 da baseline |

## Autoria (hook de commit)

`git log --format='%an <%ae> | %cn <%ce>' master..HEAD | sort | uniq -c` → 30 commits, todos
`Stharley Maxwell <stharleymax@gmail.com>`. `git log --format=%B master..HEAD | grep -ci co-authored` → 0.

## Advisórios herdados (não bloqueiam; o dono é o code-review)

Os A-1'..A-7' de `W2-CODE-REVIEW-r2.md:46-58` continuam abertos. O mais próximo de um DoD é o A-1'
(`collectors_cli.py:400-409`): a margem citada em `_OPEN_INTEREST_POLL_LEAD_S` está desatualizada frente ao
`lag_ms` 14 683 do bench. O efeito possível é minuto AUSENTE, nunca look-ahead, e esse risco é da `DoD-1`
(≥ 95%), que só T-03.7 mede.

## Teste acrescentado por este portão (commitado junto com este laudo)

- `backend/tests/sentimento/test_collect_open_interest_poll.py::test_a_poll_row_read_before_t_is_admitted_under_intrabar_only`
  (6 casos, verdes; matam M-R2-intrabar-applies, M-R2-final-only-ignores-bucket-end e M-avail-is-T)

## Base da contagem de mutantes

Cópia em `$SCRATCH/backend` (rsync sem `.venv`), rodada com `backend/.venv/bin/python -m pytest --no-cov`. Com o
original restaurado, os 15 vermelhos de base são todos
`subprocess.CalledProcessError: git rev-parse --path-format=absolute --git-common-dir`. Não vêm de código: a
cópia simplesmente não está dentro de um repositório git. Antes de cada rodada, o `__pycache__` da cópia foi
purgado.
