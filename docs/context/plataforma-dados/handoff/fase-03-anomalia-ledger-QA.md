# Handoff — anomalia de ledger na fase 03, achada ao registrar QA de `T-05.8`

**Escrito pelo `/workflow` em 2026-09-02.** Não é task própria — é sinalização para quem
estiver na trilha `sentimento`/fase `03` (as 15 worktrees ativas hoje). **Nada foi alterado em
`tasks.toml` nem em qualquer arquivo de fase 03** — fora do escopo desta sessão (trilha `web`).

## O que travou

`harness gate-record plataforma-dados 05 QA APPROVED "..."` (para `T-05.8`) devolveu **`exit
4`**. O bloqueio não é de `T-05.8` — é que a fase `03` já tem QA `APPROVED` registrado no
ledger, mas 12 tasks daquela fase (`T-03.1` … `T-03.12`) seguem `status = "todo"` no
`tasks.toml`. `harness status plataforma-dados` já apontava isso como `⚠ Atenção` antes desta
sessão começar:

> fase(s) com QA APPROVED e tarefa(s) em aberto no tasks.toml — o doc contradiz o veredito: 03
> (T-03.1, T-03.2, T-03.3, T-03.4, T-03.5, T-03.6, T-03.7, T-03.8, T-03.9, T-03.10, T-03.11,
> T-03.12)

## Por que isto importa para quem grava um veredito de QA em QUALQUER fase

`gate-record` parece validar o ledger inteiro antes de aceitar um novo veredito, não só a fase
que está sendo gravada — a fase `03`, alheia à trilha `web`, bloqueou o registro de `T-05.8`
(fase `05`). Se isto se confirma, **toda fase futura fica bloqueada até a fase 03 fechar**, não
só a fase 03 em si. Vale confirmar isso com `/tech-lead` ou owner — não confirmei com um
segundo experimento porque isso exigiria mexer no ledger, fora do meu escopo.

## Ações possíveis — nenhuma delas é minha

1. `harness tasks resolve plataforma-dados 03 T-03.X=<status correto>` para cada uma das 12,
   uma vez que o trabalho real da fase 03 feche (as worktrees ativas sugerem que está em
   andamento agora).
2. `harness pipeline override plataforma-dados "<motivo auditado>"` — escape do owner, não de
   agente.

## Origem

Achado pelo `/qa` despachado para `T-05.8`, relatório completo em
`.claude/worktrees/agent-a15716f53e550998b/docs/context/plataforma-dados/gates/T-05.8-qa.md`
(worktree isolada, não mergeada). Veredito técnico de `T-05.8`: `APPROVED`, comprovado por
mutação — o bloqueio é só de registro no ledger.
