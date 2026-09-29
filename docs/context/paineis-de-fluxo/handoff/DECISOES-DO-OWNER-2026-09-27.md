# Decisões do owner — 2026-09-27

Origem: `gates/T-03.7-t1.md` (veredito `COUNT_LOW_AND_DISK_HIGH`, commit `171254c`). Menus redigidos pelo
orquestrador, com o custo de cada opção declarado. As três linhas são **escolha entre alternativas
apresentadas**, e nenhuma delas é fala do owner.

| # | pergunta | escolha | alternativas recusadas | rótulo |
|---|---|---|---|---|
| D-1 | `[Q-CAD-1]` teto de disco do coletor de OI | **teto = 2× a estimativa CORRIGIDA de disco: ~5,7 MB/dia** (2 × 2,86, `SPEC-009` §6.1:170-171). Cadência de 60 s mantida | manter 1,14 MB/dia + task de compressão Timescale · manter 1,14 MB/dia + cadência de 5 min | `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]` |
| D-2 | idle-in-transaction da API (reincidiu: ingestão inteira parada por 11h16min, 00:22Z→11:38Z) | **`idle_in_transaction_session_timeout` no acesso da API + task para achar a causa** (a leitura que abre transação e não fecha) | só o timeout · deixar como está (a escolha de 2026-09-19) | `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]` |
| D-3 | ordem da 03b diante da nova janela de 24h da T-03.7 | **a 03b roda em paralelo com a janela nova; o merge da W6 só depois de a T-03.7 passar** | esperar as 24h (depends_on à risca) | `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]` |

## Por que o teto mudou de base, e a regra não

O teto de **1,14 MB/dia** era **2× ~570 KB/dia** (`plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md:36`). Os
570 KB/dia contavam **byte de fio**. A correção de `SPEC-009` §6.1 refez a conta para byte de disco e chegou a
**~2,86 MB/dia, ~1,04 GB/ano** para 4 símbolos a 60 s. A regra do **2×** é do owner e continua a mesma; só a
base foi trocada. Medido na T-03.7: **1,52 MB/dia de tupla**, ~2,85 com índice (estimativa), dentro do novo teto.

## O que isto NÃO decide

- A cobertura (DoD-1) **não** passou: foram 1.280 linhas por símbolo, contra 1.368. A causa é D-2, não o
  coletor. A T-03.7 volta a medir numa janela nova de 24h, **a partir de 2026-09-27T11:39Z**, o primeiro ponto
  depois do destrave (`make compose-local ARGS="restart api"`, 11:38Z).
- A folga de 5 s (`_OPEN_INTEREST_POLL_LEAD_S`) segue com o quant-architect. A cauda de atraso da T-03.7 teve
  máximo de 19,86 s, a 0,14 s da borda de 20 s.
- O disco do host da stack local está em **99%** (`df -h /`: 4,2 GB livres), e o `md.series` inteiro cresce
  **99 MB/dia**. Isso é outra pergunta, fora desta feature. O OI responde por ~1,5% desse crescimento.
