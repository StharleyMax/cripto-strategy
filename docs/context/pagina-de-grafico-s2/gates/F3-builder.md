# `F3` (`T-03.1`..`T-03.5`, `CST-184..188`) — relatório de `/build`

**Branch:** `task/pagina-de-grafico-s2-f3-migracao-console` · **Commit:** `31e0f38` · **Worktree:**
`/home/stharley/Documentos/projects/cripto-strategy/.claude/worktrees/agent-add08c4254de50083`

## Escopo

`frontend/src/app/painel/` → `console/` (`page.tsx`, `PainelClient.tsx`→`ConsoleClient.tsx`,
`error.tsx`, `loading.tsx`, `source-state.ts`); `ROUTES.panel`(`"/painel"`)→`ROUTES.console`
(`"/console"`); `not-found.tsx` + comentários vivos em `s1-console/{ingest-health,collector-status}-query.ts`
corrigidos; `frontend/e2e/01-painel-carrega.spec.ts`→`01-console-carrega.spec.ts` +
`03-rotas.spec.ts`/`05-a11y.spec.ts`/`helpers.ts` migrados; `frontend/next.config.ts` ganha
`{source:"/painel",destination:"/console",permanent:true}`, e o `/`→destino existente corrigido
de `"/painel"` para `"/console"` (sem isso, `/` faria um redirect encadeado por cima do novo).
UI copy visível (título da aba, `h1`, textos de erro) e o nome do diretório
`frontend/src/features/panel/` (inglês, não relacionado) **não foram tocados** — fora do
universo desta fase (`CLAUDE.md` linha 8 tabela de fronteira; `NG-8` do PRD).

## DoD (`CA-F3-1..4`, `docs/plans/SPEC-006.../03_migracao_console.md`)

| id | comando | resultado |
|---|---|---|
| `CA-F3-1` (agregado `CLAUDE.md`) | `git ls-tree -r --name-only HEAD \| grep -E '^(backend/src\|backend/tests\|frontend/src)/' \| awk -F/ '{for(i=1;i<NF;i++) print $i}' \| sort -u \| grep -vxE 'sentimento\|charts\|convergencia\|backtest\|web\|docs\|infra' \| grep -i painel` | **0 linhas** (rc=1) — nenhum segmento `painel` |
| `CA-F3-2` | `grep -n 'panel:\|console:' frontend/src/app/routes.ts` | `console: "/console"` |
| `CA-F3-3` | `curl -sD - http://127.0.0.1:4173/painel` (build de produção + `next start` local) | `HTTP/1.1 308 Permanent Redirect` + `location: /console` |
| `CA-F3-4` | `grep -rn '/painel' frontend/e2e` | **0 linhas** (rc=1) |

Extra medido no mesmo `curl`: `GET /` → `307` + `location: /console` (hop único, sem
redirect encadeado — o destino do `/` existente foi corrigido de `/painel` para `/console`).

## Comandos rodados e universo

- `npm --prefix frontend run build` (`INGEST_HEALTH_API_BASE_URL` dummy) → `rc=0`, rota
  `/console` listada, nenhuma `/painel`.
- `bash scripts/verify.sh` → `lint-backend rc=0` (386 arquivos-fonte) · `lint-frontend rc=0`
  (ESLint + `tsc --noEmit --strict`) · `test rc=0` (1901 passed, cobertura 96,95% — suíte
  backend, não tocada por esta fase) · `boundaries rc=0` (7 kept, 0 broken). `regras`/`validate`
  saíram `NÃO MEDIU rc=3` — **não é reprovação**: o wrapper `.harness/mechanism` deste worktree
  isolado não resolve o plugin (ambiente, não código). Substituído por chamada direta:
  - `harness rules --mode sweep --changed-only` → `rc=0`, 0 achados.
  - `harness validate --strict` → `rc=0`, "política válida".
- `git diff --cached --stat` → 15 arquivos, 88 inserções / 47 deleções (5 renomeações puras +
  10 modificações).

## Cobertura

Não medida por linha nova (mudança é rename + string literal, sem lógica nova); o piso por
camada do backend (não tocado) segue em 96,95% (`bash scripts/verify.sh`, acima). Nenhuma
função de produção nova foi escrita nesta fase — apenas identificadores e uma entrada de
`redirects()`.

## Doc delta

- **`CLAUDE.md`**: sem mudança — a decisão (linha 12, "rotas em inglês, retroativo") e a tabela
  já existiam no repositório antes desta fase (`[PREMISSA-OWNER: 2026-09-08]`); esta fase apenas
  a EXECUTA em código. Motivo explícito: o plano `03` não pede edição de `CLAUDE.md`.
- **`frontend/README.md`**: sem mudança — nenhum item do DoD desta fase referencia o README, e o
  histórico de bancada que ele carrega (`§1604-1699`) descreve um experimento já fechado sobre
  `painel/page.tsx`; reescrevê-lo seria apagar uma âncora histórica, não uma correção.
- **ADR**: não necessário — `ADR-034/D2`/`D3` (nome `console`, redirect `308`) já foi escrito
  pelo `frontend-architect` antes desta fase; esta fase só implementa a decisão já tomada.

## Bloqueado

Nenhum item bloqueado. As 5 tasks (`T-03.1`..`T-03.5`) fecham neste único commit, por pedido do
owner (1 PR por fase).
