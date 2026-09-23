# Handoff — QA da fase 03 (O timeframe único)

12 tasks (T-03.1–T-03.12) implementadas em ondas paralelas (teto 2), cada uma em worktree/
branch própria, consolidadas por fast-forward/merge em `wave/candle-f03`
(`/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f03`, HEAD `24c485a`).
Sem push, sem PR ainda — isto é pré-requisito do PR, não o PR.

## Plano e DoD da fase

`docs/plans/SPEC-008-candle-real-e-eixo-unico/03_timeframe.md` — os 8 DoD normativos da fase.
Tasks: `docs/context/candle-real-e-eixo-unico/tasks.toml`, `phase = "03"`.

## Relatórios de builder por task (leia, não recolete o trabalho)

`docs/context/candle-real-e-eixo-unico/gates/T-03.{3,4,6,7,8,9,10,11}-builder.md` +
`T-03.12-ux-ui-mastery.md` (veredito do design gate: **APPROVED**, 7,5/10, 1 quick-win
não-bloqueante registrado, 1 item de dívida de cobertura de teste registrado — ambos citados
no próprio relatório). T-03.1/T-03.2/T-03.5 não geraram arquivo de gate próprio — resumo no
commit message de cada (`git log --oneline wave/candle-f03`).

## Verificação já feita pelo orquestrador (não repita às cegas, mas confirme)

Após CADA merge de onda: `bash backend/scripts/test.sh` (suíte inteira) +
`npm run typecheck && npm run lint && npm run test:app && npm run test:charts` — todas verdes.
Ao final: `make e2e` (suíte completa, 18 specs) → **49 passed, 2 skipped** (skips pré-existentes,
não desta fase). Um defeito real foi achado e corrigido nesta verificação final: o stub de
`frontend/e2e/17-teto-latencia-eixo.spec.ts` não incluía o campo `coverage` que T-03.12 tornou
obrigatório no parser (`series-history-client.ts::assertWireCoverage`) — commit `24c485a`.

## Seu trabalho

Não repita o que já rodou verde — desconfie e teste o que os builders podem ter deixado cego
(mentalidade destrutiva). Preste atenção especial em:
- A cadeia de decisões adiadas e retomadas entre tasks: T-03.9/T-03.10 deliberadamente NÃO
  ligaram TF→refetch (esperando T-03.6); T-03.11 ligou. Teste a cadeia inteira, não só a ponta.
- O falsificador CA-8 (T-03.8) morde só 1/20 trocas — T-03.7 (CA-8′) é quem cobre as outras 19;
  confirme que os dois realmente coexistem e nenhum foi silenciosamente redundante/removido.
- A marca de cobertura parcial (T-03.12) é nova E não tem contrato de DOM próprio (achado do
  design gate) — considere fechar esse gap se o tempo permitir, ou registre como ação.

Emita **APPROVED** ou **NEEDS_FIX** (ações concretas, arquivo:linha). Se `NEEDS_FIX`, registre
as ações no relatório; o orquestrador redespacha o builder responsável.

## Onde escrever

Relatório completo em `docs/context/candle-real-e-eixo-unico/gates/FASE-03-qa.md`, commitado
na wave (`wave/candle-f03`, sem push/PR). Devolva no máximo 15 linhas: veredito, achados
principais, caminho do relatório.
