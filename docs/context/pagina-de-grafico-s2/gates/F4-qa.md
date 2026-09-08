# QA Gate — Fase 04 (correção de composição) — RECONSTRUÍDO

**⚠️ Este arquivo é uma reconstrução, não o relatório original.** O relatório completo que a QA
escreveu no worktree foi perdido: o coordenador removeu o worktree antes de confirmar que o
arquivo (e a resolução de `tasks.toml`) tinham sido commitados. O ledger (`gates.jsonl`, fonte de
verdade real) está intacto e é a base desta reconstrução.

**Veredito: APPROVED**

```
{"ts": "2026-09-08T21:59:05Z", "phase": "04", "gate": "QA", "verdict": "APPROVED",
 "commit": "1e108d6f5df89b45362f77f9b207060918ad8391",
 "notes": "CA-F4-1/2/3 reproduzidos independentemente contra Postgres real (deploy-postgres-1) via
 containers t04qa-api/web buildados desta árvore -- deploy-api-1/web-1 persistentes estavam
 desatualizados (pré-fix, commit 31491dd, não 1e108d6) e serviram de testemunha pré-fix
 (500/null/1 failed, batendo com o builder). Playwright 2 passed pós-fix com valor numérico
 literal no DOM. Suite: 1949 passed 1 failed (pré-existente, confirmado via worktree no
 commit-pai 31491dd), cobertura 96.99%. Lint limpo, 0/8 regras bloqueantes. Fase 02 tinha QA
 APPROVED sem tasks fechadas (T-02.1..4 todo) -- fechado com evidência já no ledger antes de
 gravar este veredito."}
```

Tasks `T-02.1..T-02.4` e `T-04.1..T-04.3` resolvidas `done` posteriormente (nesta reconstrução),
citando os commits corretos do ledger.

**Nota do coordenador, pós-merge:** os containers `deploy-api-1`/`deploy-web-1`/`deploy-collector-1`
que a QA usou eram imagens buildadas à parte (`t04qa-*`), não os containers persistentes que o
owner estava olhando no navegador — o rebuild+recreate desses containers foi feito separadamente
após o merge (ver `docs/INDEX.md`). A QA seedou dados sintéticos (`65432.5`/`543210.75`) direto em
`deploy-postgres-1` (o Postgres real e compartilhado) para o falsificador Playwright — esses
valores ficaram visíveis na página real do owner até serem limpos (ver `docs/INDEX.md`,
entrada de limpeza de dado de teste).

Ver [[qa-frontend-exige-playwright-contra-app-real]] para o contexto completo do achado que
originou esta fase.
