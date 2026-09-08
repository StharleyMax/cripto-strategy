# Handoff `/tech-lead` → `/build` — `pagina-de-grafico-s2`

**Data:** 2026-09-08 · **Feature:** `pagina-de-grafico-s2` (filha de `plataforma-dados`) · **Ledger
esperado ao ler:** `TASKS_APPROVED` (`harness pipeline state pagina-de-grafico-s2`) · **Próximo
gate:** `advance BUILD_AUTHORIZED` — **owner**, não agente.
**Dado de máquina:** [`tasks.toml`](tasks.toml) (18 tasks: F0 4 · F1 5 · F2 4 · F3 5;
`harness tasks validate pagina-de-grafico-s2` → `OK … 18 task(s), 0 ERROR, 0 WARN`) ·
**Narrativa:** [`tasks_review.md`](tasks_review.md) · **Plano:**
[`docs/plans/SPEC-006-pagina-de-grafico-s2/`](../../plans/SPEC-006-pagina-de-grafico-s2/index.md) ·
**SPEC:** `SPEC-006` · **ADR:** `ADR-034`.
**Jira (CST):** Epics `CST-168` (F0) · `CST-169` (F1) · `CST-170` (F2) · `CST-171` (F3); Tarefas
`CST-172..175` (T-00.x), `CST-176..179`+`CST-189` (T-01.x), `CST-180..183` (T-02.x), `CST-184..188`
(T-03.x) — `tracker` inline em cada task; `harness tasks list pagina-de-grafico-s2` →
`total=18 linked=18 local=0 uncarded=0`.
**Orquestração de PR (decisão do owner na aprovação):** **1 PR por fase**, não por task — 4 PRs
(F0/F1/F2/F3), mesmo padrão de `captura-em-producao`. Não muda este `tasks.toml`; é o coordenador
quem organiza branch/PR no dispatch dos builders.

## 1. As coisas que o `/build` encontra primeiro

1. **F0 é prioridade explícita do owner e é ISOLÁVEL.** Nenhuma task de F0 (`T-00.1`..`T-00.4`)
   depende de F1/F2/F3 — pode ir a `/build` sozinha, sem esperar as outras fases, e destrava
   `deploy-collector-1` (de pé desde `PR #203`) a gravar `value_raw` real. Ordem interna:
   `T-00.1`/`T-00.2` juntas → `T-00.3` (depende de `T-00.2`) → `T-00.4` (depende de `T-00.1`).
2. **`T-01.3` (rota `/series-history`) tem aresta cross-fase real:** `depends_on = ["T-01.2",
   "T-00.3"]` — só serve `value_raw` decodificado pelo wire de `F0`. F1 não pode ir a `/build`
   antes de `T-00.3` estar `done`.
3. **`T-01.5` nasceu de um achado do coordenador, pós-aprovação da narrativa** (não estava na
   quebra original): `frontend/src/app/history-transport.ts`/`live-transport.ts` (`T-05.9`,
   anteriores a `ADR-034`) codificam o request em camelCase/ISO-8601, divergindo de `SPEC-006
   §5.2`/`ADR-034/D1` (snake_case, epoch-ms). Corrige os dois módulos + `history-transport.test.ts`/
   `live-transport.test.ts` no mesmo commit. **`T-02.4` (página `/symbol`) herda a correção de
   graça pela ordem de fase — não tem aresta nova para `T-01.5`, mas não pode ir a `/build` antes
   de `01` fechar** (isso já vale por `RN-1`/portão de fase).
4. **Ordem `F0 → F1 → F2` é `RN-1`; `F3` é independente e fecha por último** (`I-3` do PRD, para
   não competir por revisão com a rota nova) — mas **pode começar em paralelo com F0/F1/F2**.
5. **`M1` (mãe `plataforma-dados`) é do coordenador, não do builder:** `tasks_review.md` §7 propõe
   marcar `T-05.2`/`CST-36` e `T-08.9`/`CST-77` como `blocked`/`superseded` referenciando `T-02.4`/
   `CST-183`. **Não executado** nesta sessão — escopo da mãe, não desta filha.

## 2. Ordem de despacho sugerida

**F0** (isolada, despachar já): `T-00.1`, `T-00.2` juntas → `T-00.3` → `T-00.4`.
**F1** (só após `T-00.3` `done`): `T-01.1` → `T-01.2` → `T-01.3` (espera `T-01.2` **e** `T-00.3`);
`T-01.4` e `T-01.5` correm em paralelo com o resto de F1 (sem aresta).
**F2** (só após F1 fechar): `T-02.1`, `T-02.2` juntas → `T-02.3` (espera as duas) e `T-02.4` (espera
`T-02.1`, `T-01.3`, `T-01.4`).
**F3** (paralelo a F0/F1/F2, fecha por último): `T-03.1` → `T-03.2` → `T-03.3` → `T-03.4`; `T-03.5`
corre em paralelo assim que `T-03.1` fechar.

Roteamento por componente (`harness policy --key agents`): `sentimento` → `builder` do harness,
juiz `quant-architect`; `web`/`charts` → `frontend-builder`, juiz `frontend-architect` (+
`ux-ui-mastery` como gate de design em F2, tela já aprovada no Stitch `S2 Rev. B`).

## 3. Regras que valem em toda task (plano `index.md`, `R-A`..`R-I`)

DoD nomeia comando e universo · toda task de comportamento tem a coluna **"morde"** · `value_raw`
é a ÚNICA fonte de número em `/series-history` (`RN-7`, `grep -rn 'MOCK\|FIXTURE'
backend/src/api/routes/series_history.py` fora de teste = 0) · `interval≠1m` nunca aproximado,
sempre `422` (`RN-8`) · página `/symbol` importa só `charts/index.ts`, zero import profundo
(`ADR-034/D8`) · código/exceção/evento de log/chave `extra` **novos em inglês**; `sentimento`,
`charts`, `web` ficam · verificação é `make verify` · subagente devolve ponteiro (≤15 linhas),
relatório em `gates/` · nenhum número sem o comando.

## 4. Despacho (R2 do protocolo) — ≤20 linhas, citando caminhos

Para cada task: `id`, `title`, os `refs` (já carregam ADR/DoD/plano), o arquivo da fase do plano, e
este handoff. Contexto longo em `docs/context/pagina-de-grafico-s2/handoff/<TASK>.md` **antes** do
despacho. `resolve` por fase: `harness tasks resolve pagina-de-grafico-s2 <NN> <id>=done …` só com
QA `APPROVED` no `gate-record`.

## 5. Escopo de caminhos declarado

`backend/src/modules/sentimento` · `backend/tests/sentimento` · `frontend/src/app/symbol` ·
`frontend/src/app/console` · `frontend/src/app/painel` (some ao final de F3) ·
`frontend/src/charts` · `frontend/e2e` · `frontend/eslint.config.mjs` · `frontend/next.config.ts` ·
`frontend/src/app/routes.ts` · `frontend/src/app/history-transport.ts` ·
`frontend/src/app/live-transport.ts` · `docs/specs` · `docs/plans/SPEC-006-pagina-de-grafico-s2` ·
`docs/adr` · `docs/context/pagina-de-grafico-s2` · `docs/INDEX.md`. **Fora:**
`docs/context/plataforma-dados` (mãe, escopo do coordenador para `M1`), `backend/src/api/routes/`
das 4 rotas herdadas (`/collector-status`, `/ingest-health`, `/series-catalog`,
`/series-quarantine` — `CA-E2E-2`, diff vazio esperado).

## 6. O que este handoff NÃO autoriza

Commit (owner) · `advance BUILD_AUTHORIZED` (owner) · qualquer ato na mãe (`M1`) · implantação na
VPS · reagregação de CVD para `interval≠1m` (`NG-9`) · mudança no alvo lógico de `/` (continua
`/console`, não `/symbol`, `NG-8` do PRD) · mudança em `harness.toml`/`CLAUDE.md`.
