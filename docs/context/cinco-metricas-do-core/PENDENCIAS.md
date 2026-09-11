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

### C0 · ⚠️ Armadilha no merge da PR #211 — o `master` LOCAL está 13 commits à frente do remoto

    git rev-list --left-right --count master...origin/master   → 13   0   (ahead, behind)

**Isto NÃO é trabalho não-enviado.** Os 6 merges de task foram feitos no `master` local e a branch da
PR nasceu dali ⇒ `master` é **ancestral** da branch da PR:

    git merge-base --is-ancestor master task/cinco-metricas-do-core-f01-volume  → rc=0

⇒ **os 13 commits estão todos dentro da PR #211** (16 commits, `+11.124/-65`). `[MEDIDO 2026-09-11]`

⛔ **A armadilha:** ao mergear a PR por *squash*, `origin/master` ganha **um SHA novo** que não é
descendente do `master` local ⇒ o local **diverge** e um `git pull` seguinte tenta mesclar 13 commits
que já estão lá, em duplicata. **Depois de mergear a #211:**

    git checkout master && git fetch origin && git reset --hard origin/master

⛔ **E não faça `git push origin master`** — empurrar direto contorna a PR e o review.

## D · Contabilidade — o que é dívida e o que NÃO é

> ⛔ **Correção de 2026-09-11.** A primeira versão desta seção listava três itens como dívida do
> orquestrador. **Dois deles não são dívida — são o estado correto de uma fase incompleta**, e
> tentar "consertá-los" seria forçar o mecanismo a mentir.

### D1 · ❌ NÃO é dívida — as 50 tasks em `status = "todo"`

`harness tasks resolve` é **tudo-ou-nada por fase** (`CA-4`). Tentativa real:

    harness tasks resolve cinco-metricas-do-core 01 T-01.1=done … T-01.6=done
    → RECUSADO: tarefa(s) da fase 01 SEM desfecho declarado: T-01.7, T-01.8,
      T-01.9, T-01.10, T-01.11 — faltando uma, NADA e escrito, nem as demais

⇒ **Não há como registrar as 6 feitas enquanto 5 não tiverem desfecho.** O registro de que elas
existem são os `gates/T-01.*.md` e a PR #211. `[MEDIDO 2026-09-11]`

### D2 · ❌ NÃO é dívida — "sem veredito" em `harness status`

**Nenhum QA rodou sobre a fatia `01`**, então a ausência de `gate-record` é o estado verdadeiro.
⚠️ O que os builders entregaram é **QA Gate Context Block**, que é *insumo para o QA* — **não é
veredito de QA**. Confundir os dois faria a fase parecer validada sem nunca ter sido.

### D3 · ⏳ Devido só no fechamento — a linha em `docs/INDEX.md`

Os builders deixaram deliberadamente para o orquestrador: duas worktrees paralelas na cauda de um
arquivo append-only conflitam. **A fase não fechou**, então ainda não é devido.

### D4 · ✅ Limpeza real, segura, não feita

4 branches `worktree-agent-*` de **2026-09-02** (`plataforma-dados`: `T-05.8`, `T-05.9`,
`T-07.12`, `T-07.13`) aparecem com 1–3 commits fora do master. **Verifiquei: o conteúdo ESTÁ no
master** (mergeadas por squash, SHA diferente) ⇒ é resíduo, não trabalho perdido, e podem ser
apagadas. Há **8 worktrees vivas** ao todo.

### D5 · ✅ Limpeza real, não feita — container órfão

`t-01-1-series-window-reader-test-965ff045` (`timescale/timescaledb:2.17.2-pg15`), **up há 2
dias**, de uma task antiga. Consome recurso numa VPS que a premissa de infra declara escassa.
**Não removi por conta própria** — é o ambiente do owner.

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
