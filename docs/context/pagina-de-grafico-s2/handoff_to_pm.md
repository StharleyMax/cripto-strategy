# Handoff — `pagina-de-grafico-s2`: decisão tomada, PRD para escrever

**Feature:** `pagina-de-grafico-s2` (filha de `plataforma-dados`, irmã de `captura-em-producao` e
`coinalyze-fora-da-quarentena`). Ledger: `init` + `relate parent plataforma-dados` já executados.

## O que já está decidido — não reabrir

Menu completo, evidência medida e trade-offs de cada caminho estão em
[`context/plataforma-dados/handoff/pagina-de-grafico-q12-2026-09-07.md`](../plataforma-dados/handoff/pagina-de-grafico-q12-2026-09-07.md)
(handoff original, PR #170, mergeado). Leia-o primeiro — este documento só registra as duas decisões
do owner sobre o menu A/B/C dele, não repete a medição.

1. **Caminho A** — terceira filha de `plataforma-dados`, `depends_on` `captura-em-producao` F2.
   `[DECISÃO-OWNER: 2026-09-08, escolha entre alternativas apresentadas]`. `captura-em-producao` está
   com as 3 fases QA APPROVED/REVIEW COMPLIANT (aguardando só `advance DONE` do owner) — a dependência
   de dado real gravado **já está satisfeita**, não é mais um bloqueio futuro.
2. **Rotas em inglês, com migração retroativa de `/painel`.** Literal: *"rotas em ingles, inclusive o
   que tiver de rotas em ptbr pode ser migrado para ingles"* `[PREMISSA-OWNER: 2026-09-08]`. Fecha a
   linha 12 da tabela de fronteira de idioma em `CLAUDE.md` (era `[NÃO SEI]`/`[Q2]`, ver a seção
   "✅ Linha 12 — RESPONDIDA em 2026-09-08" no mesmo arquivo). Isto é diferente do padrão da linha 10
   (evento de log, só prospectivo) — aqui o owner pediu migração retroativa explícita.

## O que este PRD precisa cobrir

- A rota nova da S2 (`5.1`/`8.6` de `SPEC-001`: 1 símbolo BTCUSDT, painéis Preço + OI + CVD) — nome
  exato do segmento em inglês é decisão do `/architect`/`frontend-architect`, não deste handoff.
- As duas rotas de backend que `ADR-005/D1` já exige e que não existem hoje: histórico HTTP endereçável
  por conteúdo + ao vivo por SSE (`grep -rlE '"/history|"/live|text/event-stream' backend/src/api` → 0
  arquivos, medido no handoff original).
- **Migração de `/painel` para inglês** — escopo novo desta rodada, não estava no handoff original.
  `frontend/src/app/painel/page.tsx` é a única rota hoje; qualquer plano de migração precisa nomear o
  custo de bookmark/link quebrado (já registrado em `CLAUDE.md` linha 12) e decidir se é PR única com a
  rota nova ou task separada.
- Fase `05`/`08` de `plataforma-dados` (itens `5.1`/`8.6`, Epics `CST-3`/`CST-6`) devem ser marcadas
  `superseded` por esta feature filha, mesmo padrão de `T-07.15/16/17` em `captura-em-producao`.

## Referências
`PR #170` (handoff original, mergeado) · `SPEC-004 §8 [Q12]` · `ADR-005` (D1 duas rotas, D5 porta é o
backend, D6 envelope) · `ADR-003` (fronteira `charts`↔`web`) · `ADR-020`/`ADR-026`/`ADR-010`/`ADR-025`
(render S2/S4) · `CLAUDE.md` linha 12 (idioma de rota, RESPONDIDA 2026-09-08) · `docs/product/STITCH_CONTEXT.md`
§4.1 (design S2 aprovado, Rev. B).
