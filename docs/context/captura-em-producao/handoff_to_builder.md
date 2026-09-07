# Handoff `/tech-lead` → `/build` — `captura-em-producao`

**Data:** 2026-09-07 · **Feature:** `captura-em-producao` (filha de `plataforma-dados`) · **Ledger esperado ao ler:** `TASKS_APPROVED` (`harness pipeline state captura-em-producao`) · **Próximo gate:** `advance BUILD_AUTHORIZED` — **owner**, não agente.
**Dado de máquina:** [`tasks.toml`](tasks.toml) (25 tasks: F1 9 · F2 8 · F3 8; `harness tasks validate` → ver saída registrada em `tasks_review.md` §0 e no retorno do `/tech-lead`) · **Narrativa:** [`tasks_review.md`](tasks_review.md) · **Plano:** [`docs/plans/SPEC-004-captura-em-producao/`](../../plans/SPEC-004-captura-em-producao/index.md) · **SPEC:** `SPEC-004` · **ADRs:** `ADR-031`, `ADR-032`.
**Jira (CST):** Epics `CST-140` (F1) · `CST-141` (F2) · `CST-142` (F3); Tarefas `CST-143..151` (T-01.x), `CST-152..159` (T-02.x), `CST-160..167` (T-03.x) — `tracker` inline em cada task; `harness tasks list captura-em-producao` → `uncarded=0`.

## 1. As quatro coisas que o `/build` encontra primeiro

1. **F1 não fecha sem `T-01.1`** (`gates/Q3-run-definition.md`, `quant-architect`, `P7`): é `depends_on` de `T-01.6`, `T-01.8` e `T-03.3`. Despache-a **primeiro**, em paralelo com `T-01.2`/`T-01.3`. Ela também decide `[Q2]` (cadência), `[Q11]` (literal `source`) e `P9` (gravação crua). Sem ela, `D1.6` reprova e a fase não fecha.
2. **F2 não fecha sem `T-02.1`** (`gates/F2-series-ddl.md` + `[Q10]`): `T-02.2` depende dela (a chave de unicidade é a *chave* de `CA-F2-3`). `T-02.3` (adaptador do registro) **não** depende — pode sair junto.
3. **Ordem `F1 → F2 → F3` é `RN-1`**: task de `03` `in_progress` com `01`/`02` abertas ⇒ o `/tech-lead` reprova (*"construção especulativa"*, `ADR-027`). Dentro de cada fase, `depends_on` manda; entre fases, o portão de QA.
4. **`P10`/`M1` (mãe) é do coordenador, não do builder:** `tasks_review.md` §7 propõe `harness tasks resolve plataforma-dados 07 T-07.15=blocked:"…" …` com o mapeamento task-a-task. **Não executado** nesta sessão — escopo de `plataforma-dados`.

## 2. Ordem de despacho sugerida

**F1:** `T-01.1`, `T-01.2`, `T-01.3` juntas → `T-01.4` → `T-01.5` → `T-01.6` (espera `T-01.1`) e `T-01.7` → `T-01.8` (24 h — cauda da fase; comece cedo) · `T-01.9` (docs) após `T-01.1`.
**F2:** `T-02.1`, `T-02.3` juntas → `T-02.2` e `T-02.4` → `T-02.5` e `T-02.6` → `T-02.7` e `T-02.8`.
**F3:** `T-03.1`, `T-03.2`, `T-03.3` juntas → `T-03.4` → `T-03.5` → `T-03.6` (gate), `T-03.7` (medição), `T-03.8` (E2E — a que prova a SPEC: `n_rows < 3` com tudo fechado é o falsificador de §9, **escalar**, não ajustar).

Roteamento por componente (`harness policy --key agents`): `sentimento` → `builder` do harness, juiz `quant-architect`; `infra` → juiz `infra-architect`; `docs` → `builder` genérico. **`web` não é tocado**: os únicos caminhos de `frontend/` no escopo são `frontend/Dockerfile` e `frontend/.dockerignore` (`T-03.2`).

## 3. Regras que valem em toda task (plano `index.md`, `R-A`..`R-I`)

DoD nomeia comando e universo · toda task de comportamento tem a coluna **"morde"** com veredito diferente · **um `XADD`, um `decode`** (`grep -rn 'xadd\|XADD' backend/src --include='*.py' | grep -v redis_stream_bus.py | wc -l` = 0 sempre) · `run_single_writer`, `domain/`, `frontend/src`, `collector_status.py` **intocados** (diff vazio) · **nenhuma implantação** — `build`/`up` locais são o teto · código, exceção, evento de log, chave de `extra` **novos em inglês**; `sentimento` e os 4 eventos PT ficam · **`psycopg` só em `infra`** (`lint-imports` é o portão) · verificação é `make verify` (saída em disco) + `lint-imports`; testes de processo real (`T-01.7`, `T-02.7`) **fora** de `verify` até o owner decidir · subagente devolve ponteiro (≤ 15 linhas), relatório em `gates/`, medições em `medicoes/` · nenhum número sem o comando.

## 4. Despacho (R2 do protocolo) — ≤ 20 linhas, citando caminhos

Para cada task: `id`, `title`, os `refs` da task (já carregam arquivo, DoD e o que **não** faz), o arquivo da fase do plano, e este handoff. Contexto longo em `docs/context/captura-em-producao/handoff/<TASK>.md` **antes** do despacho. `resolve` por fase: `harness tasks resolve captura-em-producao 01 <id>=done …` só com QA `APPROVED` no `gate-record`.

## 5. Escopo de caminhos declarado

`backend/` · `deploy/` · `Makefile` · `.env.example` · `frontend/Dockerfile` · `frontend/.dockerignore` · `docs/specs` · `docs/plans` · `docs/adr` · `docs/context/captura-em-producao` · `docs/INDEX.md`. **Fora:** `frontend/src`, `frontend/` largo, `docs/context/plataforma-dados`. Colisão com a mãe não prevista (mãe re-escopada para `docs/context/plataforma-dados`; irmã `DONE`) — o primeiro `require-code` confirma (`tasks_review.md` §6).

## 6. O que este handoff NÃO autoriza

Commit (owner) · `advance BUILD_AUTHORIZED` (owner) · criação de UV · qualquer ato na mãe (`P10`) · implantação · renome de `janela_de_perda`/eventos PT · mudança em `harness.toml`/`CLAUDE.md` · decisão de `[Q12]` (owner).
