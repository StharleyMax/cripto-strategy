# W2 — REVIEW arquitetural da wave `03a` (coletor de OI por polling)

**Universo:** `git diff master...wave/paineis-f03a` — `master` = `ba21f07`, wave = `5f3a440` (T-03.1..T-03.6).
**Contra:** `SPEC-009` §6.1/§6.4/§6.7/§11, plano `03_oi_candle.md` §`03a`, `ADR-045` (D2 — trio da projeção),
`CLAUDE.md` (fronteira de idioma), regras de despacho `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## Veredito: **COMPLIANT** (0 BLOCKER · 1 WARNING · 2 INFO)

## Denominador

| medida | valor | comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras avaliadas | **8/8** (7 por linha/allowlist sobre os arquivos; `server-test-directory-present` é de repositório) | idem |
| arquivos varridos | **27** (todo arquivo fora de `docs/` no diff: 10 `backend/src`, 14 `backend/tests`, `backend/README.md`, `deploy/compose.yml`, `scripts/oi-poll-capture-bench.sh`) de **51** no diff | `for f in $(git diff --name-only master...HEAD \| grep -vE '^docs/'); do harness rules --mode file --path "$f"; done` |
| achados bloqueantes | **0** | idem — `rc=0` em 23, `rc=2` em 4 só por `[AVISO]` |
| contratos de camada | **7 kept, 0 broken** (264 arquivos, 1354 dependências) | `cd backend && .venv/bin/lint-imports` |

`[MEDIDO 2026-09-25]` em todas as linhas acima.

## O que a máquina mede

- **0 bloqueio.** Os 4 `rc=2` são `[AVISO] core.module-docstring-single-line` na linha 1 de `collectors_cli.py`,
  `collector_run_mapping.py`, `collector_series_mapping.py` e `series_catalog.py`. **Nenhum é da wave:** a linha 1
  de cada é idêntica em `master` (`git show master:<arq> | head -1`). Os 5 módulos novos de `backend/src` passam.
- **Direção de dependência:** `domain/open_interest_{snapshot,grid_stamp,catalog}.py` importam só `domain`;
  `use_cases/collect_open_interest_poll.py` importa `domain` + `use_cases`; `infra/*` importa as três. Confirmado
  pelo contrato `infra > use_cases > domain KEPT` e por `domain e use_cases nao falam com socket nem ssl KEPT`.

## O que só a arquitetura declarada diz

| item | declarado | no código | status |
|---|---|---|---|
| 3a.1 cliente, `time` → `event_time` | `SPEC-009` §6.1, plano 3a.1 | `infra/binance_open_interest_client.py` + `domain/open_interest_snapshot.py` | conforme |
| 3a.3 catálogo | plano 3a.3: `STOCK`, `POINT_AT_BUCKET_END`, `denom=base`, 4 símbolos; `ADR-045/D2`: trio `(STOCK, POINT, POINT_AT_BUCKET_END)` | `open_interest_catalog.py:224-246`: `Nature.STOCK`, `Reduction.POINT`, `TsConvention.POINT_AT_BUCKET_END`, `interval="1m"`, `native_grid_ms=60_000`, `unit=base_asset(symbol)` | conforme (o trio que a projeção da `03b` exige já nasce certo) |
| ausente não é carregado (`RN-2`) | `SPEC-009` §6.1 | `open_interest_grid_stamp.py` — minuto sem leitura admitida não entra em `admitted`, nunca é preenchido pelo vizinho | conforme |
| 3a.4 cadência como env, no idioma de `OPEN_INTEREST_CYCLE_INTERVAL_S` | `SPEC-009` §6.7, plano 3a.4 | `deploy/compose.yml` só comentário; valor em `../.env` via `env_file` (mesma forma do vizinho); veredito `infra-architect` APPROVED em `gates/T-03.5-infra-architect.md:3` | conforme |
| bench fora do Postgres compartilhado | plano DoD-4 (`D-g`) | `open_interest_poll_capture_bench_cli.py:109-134` recusa stack sem `BENCH_NAME_PREFIX`; `scripts/oi-poll-capture-bench.sh` sobe PG/Redis descartáveis | conforme |
| evento de log / mensagem de exceção em inglês | `CLAUDE.md` tabela linha 10 + prosa de 2026-09-02 | eventos novos `collector_cycle_completed`, `bench_usage`, `bench_refused`; chaves `endpoint`, `n_calls`, `n_admitted`, `n_published`, `variable` | conforme |

## Achados

**[WARNING-1] A janela do carimbo no código diverge do texto aprovado da SPEC, e a emenda está pendente** —
`backend/src/modules/sentimento/domain/open_interest_grid_stamp.py` (`admitted_grid_instant`, janela `[T − 20 s, T]`,
teto) — contra `SPEC-009` §6.1 (*"cujo `time` fique em `[T, T + 20 s]`"*), `SPEC-009` §11 linha `[Q-STAMP-1]`,
plano `03_oi_candle.md:23` (3a.2) e o título de `T-03.2` em `tasks.toml:477+`.
Não é BLOCKER: `[Q-STAMP-1]` é classe **inferível** com dono de validação **`quant-architect` (fase `03a`)**
(`SPEC-009` §11), e o `quant-architect` deu `NEEDS_FIX` por lookahead (`handoff/Q-STAMP-1-quant-architect.md` §1),
que o código seguiu (`gates/T-03.2-fix-1.md`). O código está do lado causal; **o texto é que ficou atrás**.
**Correção:** o orquestrador/`/architect` redige a emenda de §6.1 e §11, do plano 3a.2 e do título de `T-03.2`
(*"a leitura de maior `time` em `[T − 20 s, T]`"*) e a leva ao owner **por exceção**, como o próprio laudo manda
(`Q-STAMP-1-quant-architect.md:216-220`). Até lá, quem ler só a SPEC vai achar que o código está errado.

**[INFO-1]** DoD-1 (segunda metade, `≥ 0,95 × 1.440` por símbolo em 24 h) e DoD-3 (disco) da `03a` **não são
medíveis nesta wave**: dependem de 24 h em produção e são `T-03.7` (fora do diff). Não é violação; é para o
fechamento da fase não contar a `03a` como encerrada só com esta wave.

**[INFO-2]** Não há registro, no diff, de re-validação do `quant-architect` **sobre o código corrigido** de `T-03.2`
(`gates/T-03.2-fix-1.md:95` remete ao laudo original). Pela regra §4 (*"revalidação depois de uma correção: peça a
mutação, não o relatório"*), o orquestrador pode pedir ao `quant-architect` a mutação `[T, T+20 s]` → vermelho
antes do `gate-record`.

## O que este laudo NÃO é

Não roda `make verify` (evidência do builder em `gates/T-03.6-build.md:121-135`: verde fora da baseline e2e de 4),
não é QA nem julgamento quant, e não grava `gate-record` (ato do orquestrador, regras §4).
