# QA Gate — Fase 00 (coluna de valor) — RECONSTRUÍDO

**⚠️ Este arquivo é uma reconstrução, não o relatório original.** O relatório completo que a QA
escreveu foi perdido: o coordenador removeu o worktree do builder antes de confirmar que o arquivo
tinha sido commitado. O ledger (`gates.jsonl`, fonte de verdade real) está intacto e é a base desta
reconstrução — nada aqui é inventado, é o que o ledger já registrava.

**Veredito: APPROVED** (2 entradas no ledger — a segunda é correção de proveniência, mesmo veredito)

```
{"ts": "2026-09-08T17:29:40Z", "phase": "00", "gate": "QA", "verdict": "APPROVED",
 "notes": "1911 passed, 96.96% cobertura, pisos domain 99.8%/use_cases 100%/infra 93.1% OK",
 "commit": "85e785839819f9588a49d42d6ac7be25e4b1c3f0"}
{"ts": "2026-09-08T17:30:12Z", "phase": "00", "gate": "QA", "verdict": "APPROVED",
 "notes": "Correção de proveniência: reexecutado a partir do worktree do builder para citar o
 commit real. 1911 passed, 96.96% cobertura, pisos domain 99.8%/use_cases 100%/infra 93.1% OK",
 "commit": "d8139ebfad8e2388bfd8b4c36fb9d520b78c457e"}
```

Tasks `T-00.1..T-00.4` resolvidas `done` em `tasks.toml`, citando o commit `85e78583...` (a
primeira entrada) — blemish conhecido e aceito nesta sessão: o `commit` correto do código de F0 é
`d8139eb...` (segunda entrada), mas `harness tasks resolve` recusa reescrever uma linha já
resolvida, e editar a referência manualmente violaria a disciplina de evidência copiada do ledger,
nunca digitada (`R-14`). Ambas as entradas do ledger existem como trilha de auditoria honesta.

Ver [[qa-frontend-exige-playwright-contra-app-real]] e a entrada de `docs/INDEX.md` sobre este
processo de reconstrução para o contexto completo.
