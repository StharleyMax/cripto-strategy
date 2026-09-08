# QA Gate — Fase 02 (página `/symbol`) — RECONSTRUÍDO

**⚠️ Este arquivo é uma reconstrução, não o relatório original.** O relatório completo que a QA
escreveu no worktree foi perdido: o coordenador removeu o worktree antes de confirmar que o
arquivo (e a resolução de `tasks.toml`) tinham sido commitados. O ledger (`gates.jsonl`, fonte de
verdade real) está intacto e é a base desta reconstrução.

**Veredito: APPROVED**

```
{"ts": "2026-09-08T20:21:50Z", "phase": "02", "gate": "QA", "verdict": "APPROVED",
 "commit": "d3bd556726bdda5d3f89e839adeba9191b4180fc",
 "notes": "CA-F2-1..5 reproduzidos independentemente (todos pass); lint/typecheck rc=0; test:app
 112/111 (1 falha pré-existente por dado gitignored); test:charts 158 testes, 141-142/16-17
 conforme corrida (flakiness em D5.12 herdada, já registrada); zero regressão nova confirmada via
 git-worktree em 140fcd4 vs d3bd556 (16 falhas idênticas em ambos, causa: data/binance ausente);
 next build rc=0 sem jsdom no bundle (sideEffects:false); 8/8 regras bloqueantes OK; verify.sh
 INDETERMINADO por ambiente (backend/.venv ausente), não FAIL."}
```

Tasks `T-02.1..T-02.4` resolvidas `done` posteriormente (nesta reconstrução), citando o commit
correto do ledger acima.

Ver [[qa-frontend-exige-playwright-contra-app-real]] e a entrada de `docs/INDEX.md` sobre este
processo de reconstrução para o contexto completo — incluindo o achado de F4 de que esta fase
tinha QA APPROVED real, mas a página não servia dado nenhum em produção (causa raiz não era desta
fase, era `src/main` nunca ter conectado o leitor de janela — corrigido em F4).
