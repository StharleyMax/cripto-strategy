# W6-FIX: builder de correção dos portões r2 da W6 (`paineis-de-fluxo`, 03b)

- **Entrada:** `gates/W6-QA-BACK-r2.md` (D-1), `gates/W6-REVIEW-r2.md` (BLOCKER D2-bis), `gates/W6-CODE-REVIEW-r2.md` (C-1 = D-1)
  e `handoff/W6-QA-FRONT-r2.md` (E5, a lacuna de teste da ligação do pager). A worktree é `.claude/worktrees/wave-paineis-f03b`,
  na branch `wave/paineis-f03b`.
- **Fora do escopo** (não é código): T-03.7, que só tem veredito depois de 2026-09-28T11:39Z (D-3 do owner: o merge espera por ela);
  o WARNING herdado `core.module-docstring-single-line`, que é igual em `master` e fica para uma task própria;
  e E-7, que é operação (`wave-api-idle-tx`).

## 1. D-1 / C-1 / BLOCKER: `ADR-045/D2-bis` na borda esquerda de uma janela `1m`

**Causa:** em `_oi_candle_report`, cada regime lia o próprio universo a partir do `T0` do seu próprio primeiro bucket efetivo. Em TF `1m`,
o primeiro bucket de histórico, de 5 min, começa até 4 min antes do primeiro bucket de polling. Um `p_poll(T0)` nesse trecho
nunca chegava a `poll_instants`.

**Conserto:**
- **Use case:** `use_cases/series_history.py`, `_poll_anchors_left_of_window`. Lê o polling em `[T0 do histórico, T0 do polling)`
  com uma leitura própria, porque as `observations` da série pedida só alcançam o lookback dela. Essa leitura passa pelo mesmo
  `as_of_batch`, agora fatorado em `_point_readings_at`.
- **Domínio:** o resultado da leitura chega a `domain/oi_candle_regimes.py` como `OiRegimeReadings.anchor_only_instants_ms`. Esses
  instantes entram em `poll_instants` e decidem `D2-bis`, mas **nunca viram vela**, porque os buckets de polling deles terminam antes
  da janela. Se o slot de histórico carregar esses instantes, o domínio recusa com `OiRegimeMismatchError`.
- **Alcance:** o trecho só existe em TF `1m`. Para TF `>= 5m` ele fica vazio (as duas larguras são iguais), e a leitura extra não acontece.
- **Por que não "recusar o 1º bucket de histórico":** a outra saída que o QA propôs faria a resposta depender do início da página de
  outro jeito. Se o polling tem um buraco que cobre o bucket todo, o histórico tem de servir `(5, 10]` qualquer que seja o minuto
  inicial, e o teste de controle abaixo fixa exatamente isso.

**Testes** (`backend/tests/sentimento/`):
- `test_oi_candles_route_invariants.py`:
  - sai o `xfail(strict=True)`. O teste de D-1 agora roda pelos **dois ids** (`by_hist`, `by_poll`) e para **todo minuto inicial de
    4 a 9**;
  - entra o controle `test_in_1m_the_history_still_serves_a_bucket_no_polled_anchor_claims`;
  - o oráculo do invariante 2 passa a aplicar a regra da borda aos pontos armazenados. O oráculo antigo reproduzia o defeito.
- `test_oi_candle_regimes.py`: +2 testes. Um mostra que o instante só de âncora tira `(5, 10]` do histórico sem gerar vela. O outro
  mostra que o slot de histórico com âncora é recusado.

**Mutação** (`<scratchpad>/mut_d1.py`, não versionado): `pytest --no-cov -p no:cacheprovider` sobre os 3 arquivos focais, com
`__pycache__` purgado antes de cada rodada `[MEDIDO 2026-09-28]`.

| # | mutação | resultado |
|---|---|---|
| NULL | nenhuma | rc=0 |
| M1 | o use case não lê o trecho à esquerda (o conserto revertido) | **morto**: D-1 `by_hist` e `by_poll` falham, e também o invariante 2 com semente |
| M2 | o domínio ignora `anchor_only_instants_ms` | **morto**: 3 fails (D-1 ×2 e o teste de domínio) |
| M3 | o trecho começa um passo de polling depois | **morto**: D-1 ×2, o controle e o invariante 1 |
| M4 | a leitura do trecho com `lookback 0` | vivo, **equivalente**: só vira leitura o fato com `bucket_end == t`, e esse fato está dentro de `[t_0, t_n]` (o mesmo argumento do R01 do QA-BACK-r2) |
| RESTORED | a árvore depois da bancada | rc=0 |

## 2. E5: a ligação do pager para a página antiga de OI não tinha pino

**Teste novo** no GATE do `e2e/38`: *"E5: as velas de OI da página ANTIGA chegam à tela — o pager não as descarta"*.
- Ele abre `/symbol` em `5m` e leva a tela (`showRange`) para 60 baldes que ficam **todos antes** de `data-window-start-ms`. Com isso,
  o pager tem de buscar e juntar a página antiga.
- Depois julga a cor de cada vela fechada que o stub serve ali (`stubCandle`, a mesma verdade do stub) contra a tinta do canvas.
- Só código de teste. `frontend/src` de produção não mudou.

**Medições** (`<scratchpad>/e5.sh`: ambiente efêmero `e2e-env.sh up 1 8843 4343`, depois `playwright test e2e/38-oi-candle -g "E5"`):

| rodada | resultado |
|---|---|
| limpa | **1 passed**, `verdict_gate_e5_older_page` com `judged 80, defects 0` |
| mutante E5 (`use-history-pager.ts`: `mergeOlderOiCandles(EMPTY_OI_CANDLE_BUNDLE, currentRows.oiCandles)`) | **1 failed**, `80 defect(s)` (`older page served close−open up, canvas none`) |

Depois da rodada mutante, o arquivo foi restaurado: `git status` não lista `use-history-pager.ts`.

## 3. Portões

- `ruff check`, `ruff format --check` e `mypy` sobre os arquivos tocados deram rc=0. `bash backend/scripts/lint.sh` deu rc=0.
- `npx tsc --noEmit -p frontend` deu rc=0, e `npx eslint --no-warn-ignored e2e/38-…spec.ts` também.
- `harness rules --mode file --path <f>` nos arquivos alterados: **0 BLOQUEIO**. Aparece 1 AVISO herdado,
  `core.module-docstring-single-line` em `series_history.py:1`, igual em `master`.
- `make verify` em `a0734b9`: purga de `__pycache__`, depois `E2E_API_PORT=8843 E2E_NEXT_PORT=4343 make verify`. **VERDE, 8 portões**
  `[MEDIDO 2026-09-28T11:33Z]`. O log é `/tmp/verify-wave-paineis-f03b-20260928T113311Z.log`:
  - test-frontend: 1209 pass, 0 fail
  - test: 3412 passed, 96,42%
  - boundaries: 7 kept, 0 broken
  - regras: 0 bloqueio, 77 avisos
  - e2e: **98 passed**, o que inclui o E5 novo, e 0 vermelho. Nenhum dos conhecidos do REGRAS §2 aparece.

## 4. Doc delta

- A ADR-045 não muda: a regra continua a mesma, e o código passou a cumpri-la. O plano `03` também não muda.
- Mudaram as docstrings: `_oi_candle_report` agora cita a terceira leitura, `OiRegimeReadings` explica o campo novo, e o cabeçalho
  do teste de invariantes perdeu a menção ao xfail.
- ADR: não é necessária, porque não há decisão nova. O campo é o mecanismo de aplicar D2-bis que o próprio domínio já adotava
  (`[INFERRED]` de larguras desiguais, `oi_candle_regimes.py:43-45`, dono `[Q-DG-3]`).

## 5. Revalidação: peça a mutação

Com `_poll_anchors_left_of_window` devolvendo `frozenset()`, o teste de D-1 tem de falhar pelos dois ids. Com a linha 319 do pager
passando `EMPTY_OI_CANDLE_BUNDLE`, o E5 do `e2e/38` tem de falhar.
