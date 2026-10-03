# W8-QA-FRONT — estado (PORTÃO R6, turno 150)

Relatório: `gates/W8-QA-FRONT.md` (veredito NEEDS_FIX só de portão).

Feito: 4 suítes node 1275/0; e2e 14/40/41/42 contra o app real 29 passed; 7 mutações (MA1-3, MB1, MB1′, MB2, MB3)
todas reprovam + braço CALA MB3 (VIEW_BARS=60 com helper: 13 passed); C-1 contra a API real do deploy (só GET)
discrimina; revisão spec a spec da migração da T-06.1; stub `longest` do e2e/40 aritmeticamente idêntico em 1h.

Falta: UM `make verify` verde sem concorrência. O #1 (`/tmp/verify-wave-paineis-f06-20261003T021459Z.log`) ficou
vermelho só em `e2e/20` (177 ms > 160) com 2 verifies de `t06-2` em paralelo; isolado sem carga 3× → 93–100 ms.
Comando: `VERIFY_FORCE=1 VERIFY_LOG_DIR=/tmp E2E_API_PORT=8861 E2E_NEXT_PORT=4361 make verify` na worktree
`.claude/worktrees/wave-paineis-f06`, `run_in_background`. Verde ⇒ trocar §Veredito do relatório para APPROVED e
acrescentar linha no `docs/INDEX.md`. Script de e2e por spec: scratchpad da sessão anterior (`run.sh`), receita = `make e2e`.
