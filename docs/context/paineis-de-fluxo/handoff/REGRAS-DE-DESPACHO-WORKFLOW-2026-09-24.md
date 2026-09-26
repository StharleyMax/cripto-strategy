# Regras de despacho do workflow — 2026-09-24

Vale para todo subagente que o workflow de `paineis-de-fluxo` despachar (W1 = fase 01 + correção das
regressões da fase 05; W2 = `03a`, o coletor de OI). Decisões de origem: `handoff/DECISOES-DO-OWNER-2026-09-24.md`.

Caminhos absolutos:
- `MAIN`  = `/home/stharley/Documentos/projects/cripto-strategy` (checkout principal, `master`)
- `W1DIR` = `MAIN/.claude/worktrees/wave-paineis-f01` (branch `wave/paineis-f01`)
- `W2DIR` = `MAIN/.claude/worktrees/wave-paineis-f03a` (branch `wave/paineis-f03a`)

## 1. Builder numa worktree do projeto (revisado em 2026-09-26)

> **Mudou em 2026-09-26.** Antes, o builder nascia com `isolation: 'worktree'` a partir de `master` e fazia à mão o
> `git merge --ff-only` da wave e o `for … cp -al` das dependências. O guard de isolamento do Claude Code recusa
> essa forma de comando (*"too complex to verify"*), e ele não se desliga: foram **82 chamadas bloqueadas em 2
> sessões** `[MEDIDO 2026-09-26: sessões 6624939a e 1a15360e, erros "isolated in the worktree"]`. O orquestrador
> passa a criar a worktree, e o agente é despachado **sem** isolamento.

1. **Orquestrador:** `bash scripts/wt.sh new <task> <branch da wave>` (ex.: `bash scripts/wt.sh new t-01-12
   wave/paineis-f01`). A worktree já nasce da wave, com `frontend/node_modules`, `backend/.venv` e `data` por hard
   link (o Turbopack recusa symlink). O script imprime o caminho absoluto, que vai no prompt como `WTDIR`. Despache
   **sem** `isolation: 'worktree'`.
2. **Builder:** todo comando roda em `WTDIR`: `cd WTDIR && …` ou `git -C WTDIR …`. **Nunca** commite nem edite no
   `MAIN`. Sem o guard, essa trava passa a ser esta regra e a branch dedicada. O `pre-push` do harness continua
   sendo o portão.
3. e2e: use **as portas que o prompt deu**, com `E2E_API_PORT=… E2E_NEXT_PORT=… make verify`. A porta padrão 8811
   colide com as outras worktrees. **Rode o verify com `run_in_background` e espere a notificação.** Laço
   `until`/`tail -f` é proibido (R9). O verify pula sozinho quando o diff é só de docs e devolve do cache quando
   a mesma árvore limpa já mediu verde (`VERIFY_FORCE=1` mede de novo).
4. Insumos: a sua entrada em `harness tasks json paineis-de-fluxo` (filtre pelo id), o plano
   `docs/plans/SPEC-009-paineis-de-fluxo/0N_*.md`, as seções da SPEC-009 e das ADRs que a task cita em `refs`, e,
   na W1, `handoff/T-01.0-achados-para-a-F1.md`, `handoff/FIX-regressoes-fase05.md` e a ADR-044 D3′ (`1f5e448`).
5. No desenvolvimento, rode `make test-fast K=<filtro>`. O portão é `make verify`.
6. **Commite na sua branch antes de devolver.** O autor é o owner (o hook confere) e não há trailer
   `Co-Authored-By`. A mensagem é em português, no formato `feat(<componente>): T-NN.N — …`. Relatório e evidência
   vão para `docs/context/paineis-de-fluxo/gates/<TASK>-*.md`, também commitados.
7. **Não** altere `status` no `tasks.toml`. **Não** rode `gate-record`, `approve`, `advance` nem `resolve`: esses
   atos são do orquestrador.
8. Passando de ~150 turnos: escreva `handoff/<TASK>.md` com o estado, commite e devolva `PARTIAL`. Desde
   2026-09-26 o hook R6 avisa de verdade (antes ele nunca disparava).
9. **Remoção da worktree:** só pelo orquestrador, com `bash scripts/wt.sh rm <task>`. O script recusa se houver
   arquivo não commitado ou commit que nenhuma outra branch conhece.

## 2. e2e vermelho conhecido (baseline)

Até as tasks de correção entrarem, o `master` puro falha em `e2e/16:204`, `e2e/18:107`, `e2e/18:153` e
`e2e/20:383` (`gates/DIAG-e2e-master.md`). Um vermelho **dentro** desse conjunto não é culpa da sua task. Um
vermelho **fora** dele é. Diga qual é qual, com a linha do log.

## 3. Integração na wave (serializada pelo orquestrador)

No diretório da wave: `git merge --no-ff <branch> -m "merge(paineis-de-fluxo): <TASK> — <título>"`. Um conflito
de linha acrescentada (`docs/INDEX.md`, arquivos de `docs/context/`) se resolve mantendo as duas linhas. Qualquer
outro conflito: `git merge --abort` e devolva `CONFLICT`. Depois do merge, rode `make verify` com as portas do
prompt e classifique cada vermelho contra a lista de conhecidos que o prompt passar.

## 4. Portões de fim de wave

- QA de front é **Playwright contra o app real**, com assert de dado no DOM **e ablação**, porque assert de DOM
  não prova pixel. **Nunca semeie dado de teste no Postgres compartilhado.**
- Cada portão escreve o laudo em `gates/<WAVE>-<PORTÃO>.md` e commita **só esse arquivo** (mais os testes, no caso
  do QA). Se der `index.lock`, espere e tente de novo.
- Nenhum portão roda `harness gate-record`: quem grava é o orquestrador.
- Revalidação depois de uma correção: peça a **mutação**, não o relatório.

## 5. Devolução

No máximo 15 linhas: veredito, números com o comando que os produziu, e o caminho do relatório completo.
**Nunca cole o corpo do relatório.**
