# W6-REVIEW-r3 — revalidação arquitetural da wave W6 (`03b`, `T-03.8`…`T-03.14`, mais os laudos da `T-03.7`)

**Feature:** `paineis-de-fluxo` · **Cabeça:** `6c4014b` (`wave/paineis-f03b`), diff `master...wave/paineis-f03b`
(merge-base `68e6d50`, **120** arquivos, **45** de código, **55** commits) · **Data:** 2026-09-28T13:30Z · **Revisor:** `/review`
(read-only no código; não roda `gate-record`) · **Anterior:** `gates/W6-REVIEW-r2.md` (`6b75640`, NON_COMPLIANT por `ADR-045/D2-bis`)
**Contra:** plano `03_oi_candle.md` §03b (3b.1–3b.5, DoD 1–7), `tasks.toml` `T-03.8`…`T-03.14`, `SPEC-009` §5 e §6.2–§6.7,
`ADR-044` (D2, D3′), `ADR-045` (D1, D2, **D2-bis**, D3), `ADR-034/D8`, `docs/arquitetura-do-codigo.md` §2, `CLAUDE.md`,
`handoff/REGRAS-DE-DESPACHO-WORKFLOW-2026-09-24.md` §4-§5.

## 0. Veredito: **COMPLIANT**

Nenhuma das **8** regras bloqueantes é violada, e o único BLOCKER do r2 (`ADR-045/D2-bis` na borda esquerda de uma janela
`1m`) está **fechado no código de produção**. Esta revisão provou isso por **mutação**, como pede REGRAS §4, e não
relendo o laudo do fix (§3). Continuam 1 WARNING herdado e a condição de merge `D-3`, que está fora do veredito (§4).

## 1. Denominador

| camada | comando | universo | resultado |
|---|---|---|---|
| regras bloqueantes | `harness rules list --severity block` | **8** (`core` ×4, `web-fullstack` ×3, `own` ×1) | 8 avaliadas pelo runner |
| por arquivo | `git diff --name-only master...HEAD \| grep -E '^(backend/src\|backend/tests\|frontend/src\|frontend/e2e\|deploy)/'` + `harness rules --mode file --path <f>` | **45** | **43** com rc=0. Os **2** com rc=2 são `[AVISO] core.module-docstring-single-line`, herdados (§3) `[MEDIDO]` |
| varredura | `harness rules --mode sweep` | árvore inteira | rc=0, **0 `[BLOQUEIO]`**, 77 `[AVISO]` (igual ao r1 e ao r2) `[MEDIDO]` |
| camadas (backend) | `cd backend && .venv/bin/lint-imports` | 7 contratos | **7 kept, 0 broken** `[MEDIDO]` |
| natureza | `bash backend/scripts/natureza.sh` | 140 arquivos de `domain`/`use_cases` | **0 leitura de relógio** `[MEDIDO]` |
| append-only | `git diff master...HEAD -- docs ':!docs/context/paineis-de-fluxo/gates' \| grep -cE '^-[^-]'`, e o mesmo em `gates` desde `1c95f62` | INDEX, handoffs, laudos | **0** e **0** linhas removidas `[MEDIDO]` |
| autoria | `git log --format='%an <%ae>\|%cn <%ce>' master..HEAD \| sort \| uniq -c` ; `… --format=%B … \| grep -ci co-authored-by` | 55 commits | 55 do owner, **0** trailers `[MEDIDO]` |
| delta desde o r2 | `git diff --stat 1c95f62..HEAD` | 12 arquivos | produção: **só** `domain/oi_candle_regimes.py` (+23/−) e `use_cases/series_history.py` (+103/−) (`20e01b4`). Testes: `test_oi_candle_regimes.py`, `test_oi_candles_route_invariants.py` (`20e01b4`, `c42c9dc`) e `e2e/38` (`a0734b9`). O resto é laudo e 1 linha de INDEX `[MEDIDO]` |

## 2. Camada declarada: o delta desde o r2

Os 16 pontos da tabela do r1 (`W6-REVIEW.md` §2) seguem valendo. A linha do `D2-bis`, que o r2 derrubou, volta a
**conforme**. O código de produção fora dos 2 arquivos do fix é o mesmo byte a byte do r2.

| ponto | onde | contra | leitura |
|---|---|---|---|
| **D2-bis na borda esquerda** | `series_history.py:555-570` (3ª leitura só em TF com os dois regimes) e `:579-633` (`_poll_anchors_left_of_window`) | `ADR-045` §D2-bis (`:52-55`), DoD `T-03.9` (`tasks.toml:641`), plano 3b.2 (`03_oi_candle.md:54`) | **conforme.** Esta é a 1ª correção que o r2 propôs: o polling é lido a partir do `T0` do 1º bucket do histórico, `[hist T0, poll T0)` na grade de 1 min. Nos TF `>= 5m` o intervalo é vazio, e lá não há leitura extra (`:614`) |
| esses pontos não viram candle | `oi_candle_regimes.py:109-111` (campo `anchor_only_instants_ms`), `:211-225` (entram só em `poll_instants`, nunca em `project_oi_candles`) | `ADR-045/D2-bis` (*"Nunca se mistura âncora de uma série com amostras da outra"*) | **conforme.** As âncoras decidem `D2-bis` e não viram corpo de candle |
| só o polling ancora | `oi_candle_regimes.py:198-202` (o slot do histórico com âncoras levanta `OiRegimeMismatchError`) | `ADR-045/D2-bis` | **conforme.** A invariante é imposta no domínio, e não só por convenção de chamador |
| direção de dependência | a 3ª leitura passa pela porta `SeriesWindowReader.read_window`, a mesma das outras duas | `docs/arquitetura-do-codigo.md` §2, `ADR-034/D8` | **conforme.** `lint-imports` 7/0 e 0 leitura de relógio (§1) |
| `knowledge_time` | `_point_readings_at` (`series_history.py:703-711`), extraído de `oi_point_readings` e usado pelos dois caminhos | `SPEC-009` §6 (as-of) | **conforme.** As âncoras de fora da janela passam pelo mesmo filtro. `c42c9dc` fixa isso (mutante N4 do `W6-QA-BACK-r3` §2) |
| idioma | docstrings e a mensagem de `OiRegimeMismatchError` novas | `CLAUDE.md`, tabela linhas 1/5 e §"Mensagem de exceção" | **conforme.** Tudo em inglês |

## 3. Achados

- **O BLOCKER do r2 está fechado, e a prova é por mutação** `[MEDIDO 2026-09-28T13:3xZ]`. Usei um export limpo de `HEAD`
  (`git archive HEAD backend` → scratchpad, `__pycache__` ausente, `-p no:cacheprovider`), rodando
  `pytest tests/sentimento/test_oi_candles_route_invariants.py tests/sentimento/test_oi_candle_regimes.py`:
  - em `HEAD`: **397 passed**. Não resta nenhum `xfail` (`grep -n xfail` nos 2 arquivos: vazio). O `xfail(strict=True)` do r2 saiu;
  - mutante **M1**: `_poll_anchors_left_of_window` sempre devolve `frozenset()` (a rota volta ao r2) → **5 failed**, 392 passed;
  - mutante **M2**: o domínio ignora `anchor_only_instants_ms` (tira `| poll.anchor_only_instants_ms`) → **5 failed**, 392 passed.
  Os dois morrem nos 4 casos pinados da rota: `…left_of_the_window_still_owns_the_history_bucket[by_hist|by_poll]` e
  `…off_the_5_minute_grid_left_of_the_window_owns_the_bucket[by_hist|by_poll]`. O 5º muda com o mutante: M1 também cai em
  `test_the_route_reads_lose_no_reading_the_projection_would_use[0-1m]`, a invariante aleatória, e M2 em
  `test_oi_candle_regimes.py::test_in_1m_an_anchor_only_polled_instant_owns_the_history_bucket_without_a_candle`. A falha da
  rota é a mesma do r2: `Left contains one more item: ('binance_point_5m', 1789171500000)`.

- **[INCIDENTE DE MEDIÇÃO, não é achado]** Na worktree compartilhada, 2 rodadas deram **4 failed** (`-k left_of_the_window`) e
  **5 failed** (o arquivo inteiro), e ficaram verdes nas 5 rodadas seguintes. `stat` mostrou `series_history.py` reescrito às
  10:28:26 −0300, durante esta revisão, com md5 de novo igual ao de `HEAD` (`28f67c7e…`). O último commit que toca o arquivo é
  das 08:33. Outro agente estava mutando a mesma árvore. Por isso a medição que vale é a do export (acima), e não a da
  worktree. **Lição para o orquestrador:** um portão que muta código não pode dividir worktree com outro portão.

- **[WARNING] (herdado, fora da wave)** `core.module-docstring-single-line` em
  `backend/src/modules/sentimento/domain/series_history_report.py:1` e `backend/src/modules/sentimento/use_cases/series_history.py:1`.
  É o mesmo aviso do r1 e do r2: a 1ª linha é idêntica em `master`. **Correção:** fechar o `"""` na 1ª linha, numa task
  própria (há mais 70 na árvore).

## 4. Condição de merge (não é regra e não entra no veredito)

`handoff/DECISOES-DO-OWNER-2026-09-27.md` **D-3** `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`
diz que o merge da W6 só vem depois de a `T-03.7` passar. **Ela não passou.** O t2 da janela `[2026-09-27T11:39Z,
2026-09-28T11:39Z)` deu **FAIL** `COUNT_LOW`: 685–689 de 1.368 por símbolo (`W6-QA-BACK-r3.md` §4, `[DOC]`, medido lá às 11:51Z).
A causa é operacional, não de código desta wave: o coletor está parado desde 23:07Z pelo idle-in-transaction da API, e o
conserto `83e7a78` não foi implantado. **COMPLIANT aqui não libera o merge.** Quem destrava é uma nova janela de 24 h da
`T-03.7` com veredito PASS.

## 5. Fora do escopo

- `make verify` e a suíte inteira são do QA: `W6-QA-BACK-r3` dá 3419 passed e 96,43%, `W6-QA-FRONT-r3` dá e2e 98/0 `[DOC]`.
- O veredito do `ux-ui-mastery` (`gates/W6-DESIGN-REVIEW-r2.md`) não foi reavaliado.

## 6. Falsificador deste laudo

O COMPLIANT cai se, sobre um export limpo de `6c4014b`, qualquer um destes acontecer:
- M1 ou M2 (§3) sobreviver;
- `harness rules --mode sweep` mostrar `[BLOQUEIO]`;
- `lint-imports` mostrar um contrato quebrado.

Ele também cai se um commit posterior tocar `backend/src` ou `frontend/src` sem novo `/review`.
