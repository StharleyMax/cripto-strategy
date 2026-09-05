# Handoff `/tech-lead` → `/build` — `camada-de-leitura-do-painel`

**Data:** 2026-09-05 · **Feature:** `camada-de-leitura-do-painel` (filha de `plataforma-dados`) · **Ledger esperado ao ler:** `TASKS_APPROVED` (`harness pipeline state camada-de-leitura-do-painel`) · **Próximo gate:** `advance BUILD_AUTHORIZED` — **owner**, não agente.
**Dado de máquina:** [`tasks.toml`](tasks.toml) (25 tasks, `harness tasks validate` → `0 ERROR, 0 WARN` `[MEDIDO 2026-09-05]`) · **Narrativa:** [`tasks_review.md`](tasks_review.md) · **Plano:** [`docs/plans/SPEC-003-camada-de-leitura-do-painel/`](../../plans/SPEC-003-camada-de-leitura-do-painel/index.md) · **SPEC:** `SPEC-003` · **ADRs:** `ADR-028`, `ADR-029`.

## 1. As três coisas que o `/build` encontra primeiro

1. **⚠ COLISÃO DE ESCOPO prevista com a mãe — decisão do owner antes do primeiro `require-code`.** `plataforma-dados` (`BUILD_AUTHORIZED`) reivindica `frontend`, `backend/src`, `deploy`, `Makefile`, `docs/specs`, `docs/plans`, `docs/adr`, `docs/INDEX.md`; esta filha declarou os mesmos prefixos (+ `backend/tests`, `.env.example`, `docs/product`, `docs/context/camada-de-leitura-do-painel`). O portão de escrita bloqueia quando **>1 feature ≥ `BUILD_AUTHORIZED`** reivindica o path (`scripts/pipeline.sh:42-43,1049`), salvo override de **uma** delas. Saídas: `harness pipeline override camada-de-leitura-do-painel "<motivo>"` (padrão já usado 31× na mãe) **ou** re-scope da mãe. `tasks_review.md` §6.
2. **⚠ ÂMBAR — 25 tasks `uncarded`, sem `local_only`, de propósito.** MCP `atlassian` não autenticado; REST anônima `401` `[MEDIDO]`. Não é decisão do owner (ele disse *"criar as taks"*), logo não é `local_only`. Cadastrar quando houver sessão autenticada: 25 `Tarefa` em `CST`, pai candidato `CST-5` (ou Epic próprio — owner), título = `title`, e preencher `tracker = {…}` inline. Eixo: `harness tasks list camada-de-leitura-do-painel` → `uncarded=25`. `tasks_review.md` §5.
3. **`F3` não recebe `dispatch builder` sem `T-03.1`** (ADR do `quant-architect` sobre o agregado por série, `[Q7]`, prazo **2026-09-11**). Está em `depends_on` de `T-03.2`/`T-03.4`/`T-03.6`; prazo vencido sem ADR é sinal para o owner, não silêncio.

## 2. Ordem de despacho sugerida (fase `01`)

Sem dependência, podem sair juntas: `T-01.1` (transporte), `T-01.3` (gate de design), `T-01.7` (`.env.example` + `make api`), `T-01.10` (`docs`). Caminho crítico: `T-01.1 → T-01.2 → T-01.4 → T-01.6 → T-01.9`. `T-01.4` **espera `T-01.3`** — ninguém inventa microcopy. `T-01.9` (e2e) é a última e é a que prova a fase: **mesmo veredito de pé e no chão ⇒ a fase não fecha.**

Roteamento por componente (`harness policy --key agents`): `web` → `frontend-builder`/`frontend-qa`, juiz `frontend-architect`, `design_gate`; `infra` → juiz `infra-architect`; `sentimento` → juiz `quant-architect`; `docs` → `builder` genérico.

## 3. Regras que valem em toda task (do plano `index.md`, `R-A`..`R-H`)

DoD nomeia comando e universo · toda task de comportamento tem a coluna **"servidor ausente" com veredito diferente** · `find frontend/src/app -name route.ts | wc -l` = 0 sempre · **nenhuma implantação** (`docker compose config -q` e `caddy validate` são o teto) · forma/microcopy pelo gate `ux-ui-mastery` · código, exceção, evento de log **novos em inglês**; UI pt-BR; `janela_de_perda` intocada · verificação é `make verify` (+ `make e2e` / `test:s1` fora de `verify` até M5) · subagente devolve ponteiro (≤ 15 linhas), relatório em `gates/`.

## 4. Despacho (R2 do protocolo) — ≤ 20 linhas, citando caminhos

Para cada task: `id`, `title`, os `refs` da task (já carregam arquivo, DoD e o que **não** faz), o arquivo da fase do plano, e este handoff. Contexto longo em `docs/context/camada-de-leitura-do-painel/handoff/<TASK>.md` **antes** do despacho. `resolve` por fase: `harness tasks resolve camada-de-leitura-do-painel 01 <id>=done …` só com QA `APPROVED` no `gate-record`.

## 5. O que este handoff NÃO autoriza

Commit (owner) · `advance BUILD_AUTHORIZED` (owner) · criação de UV · renome de `/painel`, `janela_de_perda`, eventos de log · mudança em `harness.toml`/`CLAUDE.md` (`[GAP G1]`) · implantação.
