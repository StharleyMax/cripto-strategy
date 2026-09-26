# W2 — REVIEW arquitetural da wave `03a`, rodada 2 (depois das correções C-1/C-2/C-3)

**Universo:** `git diff master...wave/paineis-f03a`: `master` = `ba21f07`, wave = `32e2b27`. O que é novo desde a
rodada 1 (`W2-REVIEW.md`, feita em `5f3a440`) é `git diff e9e7fe2..32e2b27 -- backend/`: 5 arquivos, sendo 2 de
`backend/src` (`binance_open_interest_client.py` e `open_interest_catalog.py`) e 3 de `backend/tests`.
**Contra:** `SPEC-009` §6.1/§11, plano `03_oi_candle.md` §`03a`, `ADR-045/D2`, `CLAUDE.md` (fronteira de idioma) e as
regras de despacho `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## Veredito: **COMPLIANT** (0 BLOCKER · 1 WARNING, herdado da rodada 1 · 2 INFO)

## Denominador

| medida | valor | comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras avaliadas | **8/8**: 7 por linha ou allowlist sobre os arquivos, e `server-test-directory-present`, que é de repositório (`backend/tests/` existe) | idem |
| arquivos varridos | **28**, ou seja, todo arquivo do diff fora de `docs/`, de **54** no total | `for f in $(git diff --name-only master...HEAD \| grep -vE '^docs/'); do harness rules --mode file --path "$f"; done` |
| achados bloqueantes | **0**: `rc=0` em 24 arquivos e `rc=2` em 4, só por `[AVISO]` | idem |
| contratos de camada | **7 kept, 0 broken** | `cd backend && .venv/bin/lint-imports` |

`[MEDIDO 2026-09-25]` vale para todas as linhas acima.

Os 4 `rc=2` são os mesmos da rodada 1: `[AVISO] core.module-docstring-single-line` na linha 1 de `collectors_cli.py`,
`collector_run_mapping.py`, `collector_series_mapping.py` e `series_catalog.py`. Essa linha 1 já existe em `master`, então os
avisos não vêm da wave.

## Revalidação por mutação (regras §4), não por relatório

| achado | critério de `W2-CODE-REVIEW.md:80-86` | medido | status |
|---|---|---|---|
| C-1 | o teste com `IncompleteRead` fica **vermelho** quando se volta para `except OSError` | O teste roda numa cópia descartável (`git archive HEAD backend` no scratchpad, venv da wave). Com o código da wave, `-k truncated` deu **1 passed**. Com o mutante `except OSError as failure:` aplicado em `binance_open_interest_client.py:98`, deu **FAILED** `test_a_body_truncated_mid_read_is_a_transport_failure_not_an_escaping_exception` (`IncompleteRead` na linha 253). A mutação foi feita fora da árvore do repositório | **morde** |
| C-2 | `grep -n 'T, T + 20' backend/src/modules/sentimento/domain/open_interest_catalog.py` devolve `rc=1` | `rc=1` | corrigido |
| C-3 | `grep -n 'the same instant' …/test_as_of_is_the_single_reader.py` não cai mais no parágrafo do coletor de OI | Resta 1 ocorrência, na linha 412, no parágrafo de `as_of_batch`. É preexistente: está em `master:393` | corrigido |

## O que só a arquitetura declarada diz (delta da rodada 2)

| item | declarado | no código | status |
|---|---|---|---|
| a falha de transporte vira um desfecho fechado e não escapa da thread | `SPEC-009` §6.1 (cliente 3a.1) e `T-03.1` (o coletor lê um vocabulário único de desfechos) | `infra/binance_open_interest_client.py:98` captura `(OSError, http.client.HTTPException)`, derruba a conexão e devolve `TRANSPORT`. `http.client` fica em `infra`, e o contrato `domain e use_cases nao falam com socket nem ssl` segue **KEPT** | conforme |
| comentário de anti-lookahead no sentido causal | `handoff/Q-STAMP-1-quant-architect.md` §1 | `open_interest_catalog.py:193` agora diz `[T - 20 s, T]`. `open_interest_grid_stamp.py:7` cita `[T, T + 20 s]` **de propósito**, como a versão reprovada | conforme |
| texto novo em inglês | `CLAUDE.md` tabela, linha 5 | comentários e docstrings novos em inglês. Não há evento de log nem mensagem de exceção nova | conforme |

## Achados

**[WARNING-1, herdado da rodada 1 e ainda aberto]** O texto aprovado da SPEC diz *"cujo `time` fique em `[T, T + 20 s]`"*
(`docs/specs/SPEC-009-paineis-de-fluxo.md:174`, §6.1), e o mesmo aparece em `:378` (§11 `[Q-STAMP-1]`) e em
`docs/plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md:23`. O código implementa `[T − 20 s, T]`
(`open_interest_grid_stamp.py`). Conferido em `master` e em `wave/paineis-f01`: nenhuma das duas tem a emenda
(`git show <branch>:docs/specs/SPEC-009-paineis-de-fluxo.md | grep -n 'T + 20'`).
Não é BLOCKER porque `[Q-STAMP-1]` é inferível, com dono `quant-architect` (fase `03a`, §11). Esse dono deu `NEEDS_FIX` por
lookahead, e o código seguiu a correção. **Correção:** o orquestrador ou o `/architect` redige a emenda de §6.1, de §11,
do plano 3a.2 e do título de `T-03.2`, e a leva ao owner **por exceção**, antes do `advance` da fase.

**[INFO-1]** DoD-1 (`≥ 0,95 × 1.440` por símbolo em 24 h) e DoD-3 (disco) seguem fora do alcance desta wave: são da `T-03.7`,
que não está no diff.

**[INFO-2]** Ainda não há, no diff, re-validação do `quant-architect` sobre a janela corrigida da `T-03.2`, feita pela
mutação `[T, T+20 s]` → vermelho. A rodada 2 não mexe na janela (C-2 é só comentário), então o ponto continua o mesmo da
rodada 1.

## O que este laudo NÃO é

Ele não roda `make verify` (as correções vêm com a evidência dos commits `506cba4` e `32e2b27`), não é QA nem julgamento
quant, e não grava `gate-record`, que é ato do orquestrador (regras §4).
