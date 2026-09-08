# Handoff PM → Architect — `pagina-de-grafico-s2`

**PRD:** [`docs/specs/PRD-006-pagina-de-grafico-s2.md`](../../specs/PRD-006-pagina-de-grafico-s2.md) · **Ledger:** `PRD_DRAFT` (advance em 2026-09-08; `harness pipeline show pagina-de-grafico-s2`) · **Feature filha de `plataforma-dados`, irmã de `captura-em-producao`/`coinalyze-fora-da-quarentena`** · **Rev de medição:** `master@025d1da` · **Owner não esteve disponível nesta sessão** — as duas decisões que importam (caminho A; rotas em inglês) já vieram prontas do `handoff_to_pm.md`, citadas com rótulo original.

## O que este PRD pede ao `/architect` — em ordem

1. **Gap Analysis do PRD** (peer review). 6 `[Q]` em §15, 6 `[GAP]` em §13, 3 `[INFERRED]` em §12.
2. **Fixar `[Q1]`/`[Q4]`**: nome e rota exata dos dois endpoints de backend que `ADR-005/D1` exige (histórico HTTP endereçável por conteúdo + SSE) — hoje **0** existem (`grep -rlE '"/history|"/live|text/event-stream' backend/src/api` → 0).
3. **Fixar `[Q1]`** (rota nova) e **`[Q2]`** (rota substituta de `/painel`) — `CLAUDE.md` linha 12 fechou o **idioma** (inglês), não a **palavra**; é decisão de `frontend-architect`.
4. **Decidir `[Q3]`**: forma do tratamento de bookmark antigo para `/painel` (`redirect` 308 vs `404` com link) — nenhum documento lido propõe.
5. **Fixar `[Q5]`**: enum de `bar_policy` aceito na requisição de histórico (`ADR-005/D4` já decide que é do consumidor, não fixa os valores) — dono `quant-architect`.
6. **Responder `[Q6]`**: a migração de `/painel` (F3) entra na mesma SPEC/plano desta feature ou vira task separada dentro dela?
7. **SPEC + plano em fases** F1 (as duas rotas de backend) → F2 (página Next que monta a S2-mínima sobre a geometria já testada em `charts`) → F3 (migração de `/painel`).

## O que NÃO reabrir (§3 do PRD, com rótulo)

Caminho A — terceira filha, não `F4` de `camada-de-leitura-do-painel`, não `override` na mãe (`[DECISÃO-OWNER 2026-09-08]`) · rotas nascem em inglês com migração retroativa de `/painel` (`[PREMISSA-OWNER 2026-09-08]`) · as duas rotas por classe de tempo e "nenhuma rota chama exchange direto" (`ADR-005/D1`) · porta de leitura é o backend, `Next` sem SQL/subprocess (`ADR-005/D5`) · envelope de resposta (`ADR-005/D6`) · fronteira `charts`↔`web` executável (`ADR-003`, `D5.12`) · envelopes de `/collector-status`/`/ingest-health`/`/series-catalog`/`/series-quarantine` (`ADR-030/D5`, `ADR-008/D3`).

## Onde o PRD diverge dos insumos — para você conferir, não aceitar

- **`[GAP G1]`:** as duas rotas de `ADR-005/D1` nunca foram construídas, apesar da ADR estar aprovada antes de `captura-em-producao` existir. Bloqueia F1 inteira.
- **§1.3:** `T-05.2`/`CST-36` (item `5.1`) e `T-08.9`/`CST-77` (item `8.6`) estão `done`, mas o DoD delas cobriu **geometria de `charts`**, nunca rota/página — leitura do PM, não do plano original; se você discordar, é achado a levantar no seu veredito.
- **`[GAP G4]`:** o eixo sob carga real (288 pontos + candles) nunca foi medido — só contra fixture no motor headless. Maior risco técnico já nomeado por `ADR-005`/`SPEC-001 §9.2`, não resolvido aqui.
- **Nenhuma task da mãe** nomeia a rota Next nem as rotas de backend — `/tech-lead` escreve DoD do zero para F1/F2.

## Menu do owner (§14) — não decidir por ele

`M1` destino de `T-05.2`/`T-08.9` na mãe (marcar `superseded` × deixar `done` sem `refs` cruzadas) · `M2` forma do tratamento de bookmark antigo — proposta `[INFERRED]` no PRD, mas é `frontend-architect` quem decide, owner só se quiser opinar.

## Regras bloqueantes endereçadas

`harness rules list --severity block` → 8 `[MEDIDO 2026-09-08]`. As que mordem: `web-fullstack.browser-imports-server`/`tenant-from-request` no código novo de F1/F2 (rota backend não vaza para browser, nenhum identificador de inquilino vem do request); `core.*` (import relativo, except silencioso, print, segredo) no Python novo das duas rotas. `own.compose-hardcoded-secret` cai por vacuidade — nenhum compose novo nesta feature.

## Tracker

Nada criado nesta sessão — unidades de valor são ato posterior ao seu `approve prd`. Candidatas em §6 do PRD.

## Critério de aceite do seu retorno

Veredito `APPROVED`/`NEEDS_FIX` em ≤ 15 linhas, relatório completo em `docs/context/pagina-de-grafico-s2/gates/PRD-006-architect.md`. Máximo 3 ciclos antes de escalar ao owner.
