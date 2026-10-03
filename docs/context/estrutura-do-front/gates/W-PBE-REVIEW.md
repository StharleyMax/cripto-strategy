# W-PBE-REVIEW — revisão arquitetural da wave `wave/piramide-be` (T-10.25, T-10.26, T-10.28)

**Veredito: COMPLIANT** — 0 BLOCKER, 0 WARNING, 1 INFO.

- revisor: architecture-reviewer (read-only), 2026-10-03
- worktree: `.claude/worktrees/wave-piramide-be`, branch `wave/piramide-be`, HEAD `e6e410dd`
- universo: `git diff --name-status origin/master...HEAD` → **11 arquivos** (7 M + 1 D em `backend/tests/`, 3 A em `docs/context/estrutura-do-front/gates/`) `[MEDIDO]`
- contrato: `gates/TECH-LEAD-narrativa.md` §10 (§10.2, §10.3 item 5, §10.5) + `tasks.toml:1217-1294` (T-10.25, T-10.26, T-10.28)
- **não gravado no ledger, não commitado** (pedido do despacho)

## Denominador

| o quê | n | comando |
|---|---|---|
| regras bloqueantes em vigor | **8** | `harness rules list --severity block` |
| regras avaliadas | **8** (todas; o runner avalia o conjunto por arquivo) | `harness rules --mode file --surface ci --path <f> --format ndjson` |
| arquivos varridos | **10** de 11 (os 10 A/M; o `D` não tem conteúdo a varrer) | idem, um por arquivo |
| achados | **0** — `rc=0`, **0 linhas** nos 10 | idem |

## Controle positivo — o `rc=0` não é vazio

1. **Achado do controle:** rodar o runner sobre um caminho FORA do repositório devolve `rc=0` e
   `{"policy": "missing", ...}` — **vácuo, não verde**. Por isso o controle foi feito dentro de uma árvore com
   a política (`harness.toml` + `.harness/` copiados para o scratchpad, `git init`).
2. Nessa árvore, cada um dos **7 arquivos de backend alterados**, copiado byte a byte: **0 achados** (igual ao
   worktree). A mesma cópia com `print("ctl")` anexado: **1 achado `core.print-statement`, `rc=1`** — **7/7
   morderam**. Um arquivo sintético com import relativo + `except: pass` + `print` deu os 3 ids
   (`core.relative-import`, `core.silent-except`, `core.print-statement`) `[MEDIDO]`.

## `backend/src` não mudou

`git diff --name-only origin/master...HEAD -- backend/src | wc -l` → **0** `[MEDIDO]`. O diff de código é só
`backend/tests/`; nada em `frontend/`.

## Escopo por task (por commit, `git show --name-status`)

| task | commit(s) | arquivos | ESCOPO do `tasks.toml` | dentro? |
|---|---|---|---|---|
| T-10.26 | `ac7b0903` | `backend/tests/charts/test_field_identity.py` + `gates/T-10.26-build.md` | `:1246` | sim |
| T-10.25 | `5dc456f3`, `8452366b` | `backend/tests/api/test_series_history_route.py`, `backend/tests/sentimento/test_series_catalog_use_case.py` + `gates/T-10.25-build.md` | `:1227` | sim |
| T-10.28 | `a5db25a1`, `e6e410dd` | `test_bundle_hash.py` (M), `test_bundle_hash_determinism_qa.py` (D), `test_panel_bar_progress.py`, `test_clock_skew.py`, `test_series_row_wire_run_id_envelope.py` + `gates/T-10.28-build.md` | `:1287` | sim |

Os **8 caminhos de código** estão todos em `harness pipeline scope estrutura-do-front list` (21 entradas, os
caminhos exatos de §10.5) `[MEDIDO]`. Nenhum arquivo fora do ESCOPO de alguma task. A ordem de §10.3 item 5
(cortes depois das fusões) está respeitada: T-10.28 vem depois do merge de T-10.26 (`36631698`) e de T-10.25.

Conferência estrutural das DoDs (forma, não mordida — a mordida é do QA, nos `T-10.*-build.md`):
- G6: 3 testes de contagem → 1 (`test_the_served_catalog_has_twenty_rows_per_instrument_and_eighty_over_the_pilot`), com `SERVED_ROWS_PER_INSTRUMENT = 20`, `80`, chaves de topo do envelope e ids distintos × 4.
- G7: 4 `no_longer_refuses_*` → 1 parametrizado sobre `list_pilot_series_catalog().entries`.
- G8: sai `test_a_window_starting_exactly_at_the_90_day_ceiling_is_served_with_200`; fica o 422 (`test_series_history_route.py:518`); a fronteira segue em `test_series_history.py:559-567` com `MAX_HISTORY_MS`.
- G5: `tuple(f.name for f in dataclasses.fields(FieldIdentity)) == FIELD_IDENTITY_TERMS`.
- G1–G4: **6 testes saem** (1 QA bundle_hash, 1 envelope, 2 clock_skew, 2 panel_bar_progress); `test_falsifier_in_progress_bar_has_no_high_low_close_attribute` fica (`test_panel_bar_progress.py:19`).

## Idioma (CLAUDE.md, tabela de fronteira — convenção, não portão)

140 linhas acrescentadas em `backend/` lidas. Identificadores, nomes de teste, constantes (`SERVED_ROWS_PER_INSTRUMENT`,
`SERVED_ENTRIES`, `_served_entry_test_id`) e docstrings: **inglês** (linhas 2 e 5). Nenhum `raise`/mensagem nova.
`MORDE` em docstring é termo do projeto já presente em ≥ 10 arquivos de `backend/tests/api/` em `origin/master`
(`git grep -c MORDE origin/master -- backend/tests`) — não é divergência nova.

## Achados

- **[INFO]** Citação literal em português dentro de docstring inglesa — `backend/tests/backtest/test_bundle_hash.py:3-5` —
  CLAUDE.md, tabela, linhas 5 e 7. É a tabela de falsificadores do `ADR-021` citada *verbatim* e entre aspas,
  **movida** do arquivo apagado (que já a carregava em `origin/master`), e o próprio ESCOPO de T-10.28 (`tasks.toml:1287`)
  manda a citação para essa docstring. Linha 7 justifica não traduzir documento (âncora textual). **Não é violação**;
  nenhuma correção exigida. Registrado só para o próximo instrumento de idioma não o tratar como regressão.

## O que esta revisão NÃO mede

Mordida das mutações (REGRA-M), tempo (REGRA-T) e `make verify-scope` são do builder/QA e estão declarados nos
`T-10.2{5,6,8}-build.md`; não foram re-rodados aqui.
