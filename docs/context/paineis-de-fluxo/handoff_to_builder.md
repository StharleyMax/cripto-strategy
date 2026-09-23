# Handoff `/tech-lead` → `/build` — `paineis-de-fluxo`

**Data:** 2026-09-23 · **Feature:** `paineis-de-fluxo` · **Ledger esperado ao ler:** `TASKS_APPROVED` (`harness pipeline state paineis-de-fluxo`) · **Próximo gate:** `approve build` / `advance BUILD_AUTHORIZED`, que é do **owner** e não de agente.
**Dado de máquina:** [`tasks.toml`](tasks.toml) (39 tasks, `harness tasks validate paineis-de-fluxo` → `OK: 39 task(s), 0 ERROR, 0 WARN` `[MEDIDO 2026-09-23]`) · **Narrativa:** [`tasks_review.md`](tasks_review.md) · **Execução:** [`PLANO-DE-PARALELISMO.md`](PLANO-DE-PARALELISMO.md) (27 lotes, 6 waves) · **Plano:** [`docs/plans/SPEC-009-paineis-de-fluxo/`](../../plans/SPEC-009-paineis-de-fluxo/index.md) · **SPEC:** `SPEC-009` · **ADRs:** `ADR-044`, `ADR-045`.

## 1. O que o `/build` encontra primeiro

1. **⚠ COLISÃO DE ESCOPO com `candle-real-e-eixo-unico`.** Ela está `BUILD_AUTHORIZED` (5 fases `APPROVED`, esperando o owner rodar `advance DONE`) e reivindica `frontend/src/app/symbol`, `frontend/src/charts`, `frontend/e2e`, `backend/src/api/routes/series_catalog.py`, `backend/tests/{sentimento,api}`, `deploy/compose.yml` e `docs/INDEX.md`, os mesmos prefixos que esta feature declarou (`harness pipeline scope … list`, `[MEDIDO 2026-09-23]`). O portão de escrita bloqueia quando **mais de uma** feature `≥ BUILD_AUTHORIZED` reivindica o mesmo caminho. **A saída limpa é o owner fechar a `candle-real-e-eixo-unico` (`advance DONE`) antes de `approve build` desta.** A outra saída é um `override` de uma delas.
2. **`T-01.0` é o primeiro lote, sozinho.** É spike, **não mergeado**. Reprovou qualquer um de F-1..F-5 ou o controle negativo ⇒ **nada da F1 é despachado**, `S-2` reabre, e o relatório vai ao `/architect`.
3. **As pernas da `ADR-043` só entram depois de `DONE` desta feature** `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`. Enquanto isso, nenhuma outra branch edita `SymbolClient.tsx`.

## 2. Ordem

Siga `PLANO-DE-PARALELISMO.md` §3, lote a lote. Não improvise o agrupamento. As regras: ≤ 2 tasks por lote, no máximo **um editor de `SymbolClient.tsx`** por lote, e latência (`T-01.0`, `T-01.1`, `T-01.10`) em lote **solo**. `T-03.7` tem relógio: só roda ≥ 24 h depois do deploy da W2, e o `t0` de `pg_total_relation_size` é tirado **no** deploy.

Roteamento (`harness policy --key agents`): `web` → `frontend-builder`/`frontend-qa`, juiz `frontend-architect`, `design_gate`; `charts` → idem; `sentimento` → `builder`, juiz `quant-architect`; `infra` → juiz `infra-architect`.

## 3. Fase `03` = `03a` + `03b`

O validador recusa fase com letra (`V-11`), e por isso as 14 tasks são `phase = "03"`. Ao fechar a W2 (`03a`):
`harness tasks resolve paineis-de-fluxo 03 T-03.1=done … T-03.7=done T-03.8=blocked:"03b aguarda F4" … T-03.14=blocked:"03b aguarda F4"`.
`[NÃO MEDIDO: se o resolve aceita blocked → done depois]`. Confira antes de depender disso.

## 4. Regras que valem em toda task

DoD-VERTICAL: Playwright **contra o app real**, com assert de **dado no DOM** e **ablação**, e o veredito do `ux-ui-mastery` sobre o screenshot real · **nunca semear o Postgres compartilhado** (`T-03.6` roda na stack de e2e própria) · `make verify` com `__pycache__` purgado · código, evento de log, chave de `extra` e mensagem de exceção **novos em inglês** · `node_modules` na worktree por `cp -al`, nunca por symlink · subagente devolve ponteiro (≤ 15 linhas), com o relatório em `gates/`.

## 5. O que este handoff NÃO autoriza

Commit · `approve build` / `advance BUILD_AUTHORIZED` · `advance DONE` · mexer em `harness.toml`/`CLAUDE.md` · criar unidade de valor · começar qualquer perna da `ADR-043`.
