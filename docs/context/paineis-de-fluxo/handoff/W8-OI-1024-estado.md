# W8 — estado do build do `B-1` (handoff R6)

Feito e commitado na worktree `w8-oi`: o fix (grupo `nowrap` + termo atômico), F-1/F-2/F-3 no `e2e/40`, `1m` no
`e2e/41`, §6.2/§6.3 do `DESIGN_SYSTEM.md`, relatório `gates/W8-OI-1024-build.md`, linha no `INDEX.md`.

Falta (o builder parou no turno 150, R6):
1. `e2e/41` com o `1m` novo **não foi rodado**. Rodar contra o app real (`next start` da worktree com
   `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`, `E2E_BASE_URL` e `E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1`).
   Se `1m` não der `clipped=left`, a premissa do QA (`W8-QA-FRONT.md` WARNING-1) estava errada: registrar, não afrouxar.
   ⚠️ O `.next` da worktree pode estar com o build de uma mutação: **rebuild antes** (`next build`).
2. `VERIFY_BASE=wave/paineis-f06 E2E_API_PORT=8871 E2E_NEXT_PORT=4371 make verify-scope` (run_in_background),
   conferindo `pgrep -af "playwright|verify.sh"` antes e que a porta 4371 está livre (`ss -ltnp | grep 4371`).
3. Gravar o resultado dos dois no §4 de `gates/W8-OI-1024-build.md` e commitar.
