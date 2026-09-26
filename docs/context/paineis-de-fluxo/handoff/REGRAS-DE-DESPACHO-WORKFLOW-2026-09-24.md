# Regras de despacho do workflow — 2026-09-24

Vale para todo subagente que o workflow de `paineis-de-fluxo` despachar (W1 = fase 01 + correção das
regressões da fase 05; W2 = `03a`, o coletor de OI). Decisões de origem: `handoff/DECISOES-DO-OWNER-2026-09-24.md`.

Caminhos absolutos:
- `MAIN`  = `/home/stharley/Documentos/projects/cripto-strategy` (checkout principal, `master`)
- `W1DIR` = `MAIN/.claude/worktrees/wave-paineis-f01` (branch `wave/paineis-f01`)
- `W2DIR` = `MAIN/.claude/worktrees/wave-paineis-f03a` (branch `wave/paineis-f03a`)

## 1. Builder numa worktree isolada

1. Primeiro passo: `git merge --ff-only <branch da wave>` (`wave/paineis-f01` ou `wave/paineis-f03a`). O
   `git reset --hard` é negado pela permissão.
2. Dependências por hard link, **nunca symlink** (o Turbopack recusa symlink):
   `for p in frontend/node_modules backend/.venv data; do [ -e $p ] || cp -al MAIN/$p $p; done`
3. e2e: use **as portas que o prompt deu**, com `E2E_API_PORT=… E2E_NEXT_PORT=… make verify`. A porta padrão 8811
   colide com as outras worktrees.
4. Insumos: a sua entrada em `harness tasks json paineis-de-fluxo` (filtre pelo id), o plano
   `docs/plans/SPEC-009-paineis-de-fluxo/0N_*.md`, as seções da SPEC-009 e das ADRs que a task cita em `refs`, e,
   na W1, `handoff/T-01.0-achados-para-a-F1.md`, `handoff/FIX-regressoes-fase05.md` e a ADR-044 D3′ (`1f5e448`).
5. No desenvolvimento, rode `make test-fast K=<filtro>`. O portão é `make verify`.
6. **Commite na sua branch antes de devolver.** O autor é o owner (o hook confere) e não há trailer
   `Co-Authored-By`. A mensagem é em português, no formato `feat(<componente>): T-NN.N — …`. Relatório e evidência
   vão para `docs/context/paineis-de-fluxo/gates/<TASK>-*.md`, também commitados.
7. **Não** altere `status` no `tasks.toml`. **Não** rode `gate-record`, `approve`, `advance` nem `resolve`: esses
   atos são do orquestrador.
8. Passando de ~150 turnos: escreva `handoff/<TASK>.md` com o estado, commite e devolva `PARTIAL`.

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
