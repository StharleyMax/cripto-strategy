# W2 — REVIEW arquitetural da wave `03a`, rodada 3 (depois da correção D-1)

**Universo:** `git diff master...wave/paineis-f03a`, com `master` = `ba21f07` e a wave em `6d7925d`. O último commit de
código é `bbcd9de`; `6d7925d` só acrescenta o laudo `W2-CODE-REVIEW-r3.md`. O que mudou desde a rodada 2 (`1c7ba85`) é
`git diff 1c7ba85..bbcd9de -- backend/`, 2 arquivos:
`use_cases/collector_series_mapping.py` (D-1, 1 bloco de comentário, +7/−3) e `tests/sentimento/test_binance_open_interest_client.py`
(QA r2, +70, só teste).
**Contra:** `SPEC-009` §6.1/§11, o plano `03_oi_candle.md` §`03a`, `ADR-045/D2`, a fronteira de idioma do `CLAUDE.md` e as
regras de despacho `REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## Veredito: **COMPLIANT** (0 BLOCKER · 1 WARNING, herdado · 3 INFO)

## Denominador

| medida | valor | comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras avaliadas | **8/8**: 7 por linha ou por allowlist sobre os arquivos, mais `server-test-directory-present`, que é de repositório (`backend/tests/` existe) | idem |
| arquivos varridos | **27**, ou seja, todo arquivo do diff fora de `docs/`, de **57** no total | `for f in $(git diff --name-only master...HEAD \| grep -vE '^docs/'); do harness rules --mode file --path "$f"; done` |
| achados bloqueantes | **0**: `rc=0` em 23 arquivos e `rc=2` em 4, todos só por `[AVISO]` | idem |
| contratos de camada | **7 kept, 0 broken** | `cd backend && .venv/bin/lint-imports` |
| lint nos 2 arquivos do delta | `All checks passed!` | `.venv/bin/ruff check` nos 2 arquivos |

`[MEDIDO 2026-09-25]` vale para todas as linhas acima.

Os 4 `rc=2` são os mesmos das rodadas 1 e 2: `[AVISO] core.module-docstring-single-line` na linha 1 de `collectors_cli.py`,
`collector_run_mapping.py`, `collector_series_mapping.py` e `series_catalog.py`. Essa linha 1 já existe em `master`.

## Revalidação por mutação (regras §4), não por relatório

| achado | prova | medido | status |
|---|---|---|---|
| D-1 (`W2-CODE-REVIEW-r2.md`) | critério do próprio laudo: `grep -n 'not drawn before' …/collector_series_mapping.py` tem de voltar vazio ou cair numa frase que nomeie `final_only` | `rc=1`, vazio. O bloco novo (`:1185-1191`) restringe R-2 a `final_only` e declara que, sob `intrabar`, a linha é admitida a partir de `received_at`. Conferi a afirmação no código: `domain/as_of_accessor.py:811-812` (`if bar_policy is BarPolicy.INTRABAR: return True`), e a rota aceita `intrabar` (`api/routes/series_history.py:64`) | corrigido, e a frase agora bate com o código |
| teste de família do QA r2 | em cópia descartável (`git archive HEAD backend` no scratchpad, venv da wave), trocar `except (OSError, http.client.HTTPException)` por `except (OSError, http.client.IncompleteRead)` (`binance_open_interest_client.py:98`) | mutante: **3 failed, 12 passed**, e as 3 falhas são exatamente os 3 casos de `test_every_http_exception_family_member_is_a_transport_failure`. Restaurado: **15 passed** | morde. A correção mais estreita, que o teste de C-1 deixava sobreviver, agora fica vermelha |

## O que só a arquitetura declarada diz (delta da rodada 3)

| item | declarado | no código | status |
|---|---|---|---|
| o comentário de anti-lookahead descreve o que o leitor único faz | `SPEC-001` §2.3 (R-2 só existe sob `final_only`, citado na docstring de `_r2_admits`) e `handoff/Q-STAMP-1-quant-architect.md` §5 (disponibilidade modelada em aberto) | `collector_series_mapping.py:1185-1193` separa as duas políticas e mantém `Q-STAMP-1` §5 como pergunta em aberto, sem decidi-la | conforme |
| camada | contrato `Camadas por contexto: infra > use_cases > domain` | o delta de produção é só comentário e não muda nenhum import | conforme (KEPT) |
| texto novo em inglês | `CLAUDE.md`, linhas 2 e 5 da tabela | comentário, docstrings, nomes de teste e ids de `parametrize` estão em inglês. Não há evento de log nem mensagem de exceção nova | conforme |

## Achados

**[WARNING-1, herdado das rodadas 1 e 2, ainda aberto]** A SPEC aprovada diz *"cujo `time` fique em `[T, T + 20 s]`"*
(`docs/specs/SPEC-009-paineis-de-fluxo.md:174`, §6.1), e o mesmo vale para §11 `[Q-STAMP-1]` e para o plano
`03_oi_candle.md`. O código implementa `[T − 20 s, T]`. Conferi que nenhuma branch tem a emenda: `git show <b>:docs/specs/SPEC-009-paineis-de-fluxo.md | grep -c 'T + 20'`
devolve **2** em `master`, em `wave/paineis-f01` e em `HEAD`, e o plano devolve **1** nas três. Não é BLOCKER porque o
dono de `[Q-STAMP-1]` (`quant-architect`) deu `NEEDS_FIX` por lookahead e o código seguiu a correção dele.
**Correção:** o orquestrador ou o `/architect` redige a emenda de §6.1, de §11, do plano 3a.2 e do título de `T-03.2`, e a
leva ao owner **por exceção**, antes do `advance` da fase.

**[INFO-1]** DoD-1 (`≥ 0,95 × 1.440` por símbolo em 24 h) e DoD-3 (disco) continuam fora desta wave: pertencem à `T-03.7`,
que não está no diff.

**[INFO-2]** O diff ainda não traz re-validação do `quant-architect` sobre a janela corrigida da `T-03.2`, que seria a
mutação `[T, T+20 s]` → vermelho. O delta desta rodada não mexe na janela, então o ponto é o mesmo das rodadas anteriores.

**[INFO-3, correção de denominador da rodada 2]** `W2-REVIEW-r2.md` diz *"28 arquivos … de 54"*. Refeito sobre
`master...1c7ba85` com `git diff --name-only | grep -vcE '^docs/'`, o resultado é **27** arquivos fora de `docs/`, que
também é o número desta rodada (o delta não acrescenta arquivo de código novo, só altera 2 existentes). O veredito da r2
não muda, porque nenhum arquivo deu `rc` bloqueante. O que estava errado era o número. Fica registrado aqui em vez de
reescrito lá, porque o registro é append-only.

## O que este laudo NÃO é

Não roda `make verify`. A mutação e o `ruff` acima cobrem só o delta. Também não é QA, não é julgamento quant e não grava
`gate-record`, que é ato do orquestrador (regras §4).
