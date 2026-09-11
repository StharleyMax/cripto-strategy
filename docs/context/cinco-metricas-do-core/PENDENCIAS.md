# Pendências em aberto — `cinco-metricas-do-core`

`[MEDIDO 2026-09-11]` Estado do ledger: **`BUILD_AUTHORIZED`**. Execução interrompida a pedido
do owner após a onda 3 da fatia `01`. PR **#211** aberta com 13 commits.

---

## A · Bloqueiam fechar a fatia `01`

### A1 · 5 das 11 tasks não foram feitas

| task | o que é | por que importa |
|---|---|---|
| **`T-01.7`** | sub-eixo de volume no `PricePane` | **é o `DoD-3`**: sem ela `/symbol` não mostra volume |
| `T-01.8` | gate de design (`ux-ui-mastery`) | condição da autonomia de design (`CLAUDE.md`) |
| `T-01.9` | e2e Playwright, assert `N ≥ 30` no DOM | prova o `DoD-3` por máquina |
| `T-01.10` | medição em produção, antes/depois | o gate formal do que `MEDICAO-PRODUCAO-F01.md` mediu informalmente |
| `T-01.11` | conjunção dos 4 DoD | fecha a fatia |

`T-01.7` estava em curso quando parou — worktree preservada em
`.claude/worktrees/agent-a4afa6e563b0072f8`, com **1 alteração não commitada** em
`frontend/src/app/symbol/view-model.ts`. Mal tinha começado.
`T-01.10` não chegou a modificar arquivo nenhum (`.claude/worktrees/agent-a16dfe3551e13ed14`).

### A2 · O `DoD-VERTICAL` está 3/4

`D2` do owner exige os quatro. Hoje a fatia `01` paga:

| item | estado |
|---|---|
| 1 · `count(*) > 0` em `md.series` | ✅ 26.253 linhas de `/fapi/v1/klines` |
| 2 · `series-history` com linhas | ✅ `rows = 10.081` (BTCUSDT) |
| 3 · **Playwright, ponto no DOM** | ⛔ **NÃO PAGO** — falta `T-01.7`/`T-01.9` |
| 4 · `n_written > 0` | ✅ 40.324 creditadas, `uptimePercent` 99,95% |

⇒ **O dado chegou ao banco e à API, não à tela.** Era exatamente o item que o owner impôs para
a fase não poder passar sem pixel.

---

## B · Decisões que exigem o `/architect` (nenhuma é minha)

### B1 · Desvio de `ADR-035/D3` — handler × registro
`DESVIO-T-01.5.md`. A ADR marca como **"não negociável"** que a troca é *"no handler do processo
de serviço … nunca no handler de projeção"*. Foi implementada no **registro**, com guarda AST
sobre 9 módulos. **Causa: o agrupamento do lote `1B` proibiu tocar `single_writer_cli.py`** —
artefato de agendamento, não descoberta de desenho. O arquivo **está livre agora**.
Saídas: (1) task de acompanhamento que instala o handler; (2) emendar `D3`. **Recomendação: (1)**.

### B2 · Mecanismo de `ADR-035/D2` falsificado com número
`T-01.4` mediu que *"chama `record_run`, o `ON CONFLICT` faz o resto"* **sobrescreve 16 campos**
(lote 100 × run 10.080). Resolveu com coluna `writer_accounted_at` **TABLE-only**, `sha256` de
`ADR-008/DoD-2` **intacto**. ⚠️ Isso contraria o `GA-4` do próprio arquiteto (*"sem schema novo"*).
**A decisão fica de pé; o texto do mecanismo precisa de emenda.**

### B3 · `SPEC-004` §3.1 diz "duas threads" — agora são três
`T-01.3` acrescentou o coletor de klines. Emenda de SPEC é ato do `/architect`.

### B4 · `premiumIndex` segue com `uptimePercent: 0,0%` — achado novo
`[MEDIDO 2026-09-11]` com **1.431 runs na janela**. O conserto de `n_written` é **por caminho**, e
só o de klines foi ligado. `[NÃO SEI]` se ligar o do `premiumIndex` é resíduo da fatia `01` ou
task própria. **Não estava em nenhum documento antes desta medição.**

---

## C · Gates e atos do owner

| ato | onde | observação |
|---|---|---|
| revisar/mergear **PR #211** | GitHub | 13 commits, `make verify` verde |
| `advance pagina-de-grafico-s2 DONE` | ledger | 5/5 fases `QA=APPROVED`; **bloqueia fechar `plataforma-dados`** |
| `coinalyze-fora-da-quarentena` | ledger | **congelada** em `SPEC_DRAFT` por `D3` — não aprovar até o CORE existir |
| `advance cinco-metricas-do-core DONE` | ledger | só depois das 5 fatias |

---

## D · Dívida de contabilidade (do orquestrador, não dos builders)

1. **50 de 50 tasks ainda `status = "todo"`** em `tasks.toml` — **6 estão feitas**
   (`T-01.1`..`T-01.6`). O `harness resolve` é **atômico por fase**: exige listar toda task da
   fase numa chamada, não só as que faltam.
2. **Nenhum `gate-record`** para a fatia `01` — `harness status` diz *"sem veredito"*. Nenhum QA
   rodou ainda sobre a fatia; os builders entregaram QA Gate Context Block, que **não é** veredito
   de QA.
3. **`docs/INDEX.md` sem a linha da fatia `01`.** Os builders deixaram deliberadamente para o
   orquestrador — duas worktrees paralelas na cauda de um arquivo append-only conflitam.
4. **8 worktrees vivas**; 4 branches `worktree-agent-*` de **2026-09-02** (feature
   `plataforma-dados`, tasks `T-05.8`/`T-05.9`/`T-07.12`/`T-07.13`) aparecem com commits fora do
   master. ✅ **Não é trabalho perdido** — verifiquei que o conteúdo **está no master** (mergeadas
   por squash, SHA diferente). São resíduo e podem ser apagadas.
5. **Container órfão** `t-01-1-series-window-reader-test-965ff045` (`timescaledb`), **up 2 dias**,
   de uma task antiga. Consome recurso numa VPS que a premissa de infra diz ser escassa.

---

## E · Operacional

1. **`.env.example` não cita as 2 variáveis novas de cadência** (`KLINES_CYCLE_INTERVAL_S` e
   `PREMIUM_INDEX_CYCLE_INTERVAL_S`). Permissão a `.env*` foi **negada** na sessão da `T-01.3` e na
   do orquestrador. Há default em código ⇒ **nada quebra**, mas o arquivo que o operador copia
   está incompleto.
2. **50 tasks `local_only = true`** — nenhuma cardada no Jira (board `CST` identificado; o MCP
   `atlassian` exige OAuth e a sessão é não-interativa). **Deliberado, não esquecido.**

---

## F · Perguntas técnicas sem resposta — nenhuma bloqueia, todas cobram depois

1. **A cauda do `bv`** (`docs/medicao-coinalyze.md` §4: p99 29 bp, **máx 1.956 bp**, contra o dump
   S3) segue **não diagnosticada**. Saiu do caminho crítico do CVD (que virou Binance), mas
   `ADR-036/D6` a reaponta para `liquidation-history` na fase `05` — a única série de terceiro que
   ficou **sem oráculo**, porque a Binance não tem REST de liquidação.
2. **O `volume` diverge MAIS que o `takerBuy`** entre Coinalyze e Binance (máx 566 bp com 104/120
   exatos, contra 38,52 bp com 116/120). É estranho — um bucket que concorda num campo deveria
   concordar no outro. `[NÃO SEI]` a causa; hipótese de alinhamento de bucket **não testada**.
3. **`Retry-After` da Coinalyze**: `T-03.7` concluiu `POLICY_NO_RETRY_AFTER` (não viu o header);
   medi **três** vezes (49,1 s · 56,8 s · 59,0 s). Recuo fixo de 60 s desperdiça ~18% da janela.
4. **Backfill profundo para backtest a 15min–4h**: `klines` serve desde **2019-09-08**, mas
   `/futures/data/*` (OI e long/short) **corta em ~30 dias** e a Coinalyze a 1min tem ~1,5 dia.
   ⇒ **um backtest sobre as 5 métricas juntas fica limitado pela mais rasa.** Sem fonte declarada.
5. **`!forceOrder@arr` segue morto**, ~46 h de silêncio medidas, **sem data de conserto** — custo
   que o owner aceitou explicitamente em `D6`.
6. **Falsificador de `ADR-036/D4`**, a pagar na fase `05`: se a retenção da Coinalyze para
   liquidação for menor que a janela típica de indisponibilidade, a recuperabilidade que
   justificou tirar o `forceOrder` do caminho crítico é **teórica**.
