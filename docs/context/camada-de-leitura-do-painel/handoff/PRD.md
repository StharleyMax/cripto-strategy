# Handoff → PM — `camada-de-leitura-do-painel` (filha de `plataforma-dados`)

**Autorização do owner, literal `[PREMISSA-OWNER: 2026-09-04]`:** *"ok, pode seguir com pm e arquiteto"*,
em resposta à revisão que propôs esta feature. Antes disso, o problema, literal: *"Estamos com esse
problema. De uma revisada na nossa arquitetura. Comunicação entre front back, use o playwrigth e valide o
front. Aplicação cheia de furos de comunicação e experiencia."*

Ledger: `harness pipeline state camada-de-leitura-do-painel` → `INIT`, `dispatch pm` registrado,
`relate parent plataforma-dados` registrado. Próximo PRD livre: **`PRD-003`** (`ls docs/specs/`).

## O problema, em uma linha
`/painel` (única rota do Next) renderiza fixtures compiladas; **0 de 16 requisições** vão a uma API
`[MEDIDO: e2e spec 02]`; a API tem **1 rota** sem CORS/ETag/readiness e devolve `200` vazio sobre store
ausente; a fiação está **bloqueada pelo portão ESLint `D5.17b`** e delegada por `ADR-019/D4` a um Server
Component que não existe; **0 CSS** chega ao browser; 2 de 3 controles são inertes.

## Insumos — leia nesta ordem, não transcreva
1. `docs/context/plataforma-dados/handoff/lacunas-leitura-api-painel.md` — os 6 recursos e o custo de cada um.
2. `docs/context/plataforma-dados/handoff/revisao-comunicacao-front-back-2026-09-04.md` — fatos medidos.
3. `docs/context/plataforma-dados/gates/REVISAO-FB-frontend-architect.md` — §2 (por que fixtures), §3 (decisão: Server Component + `server-only`), §4 (contratos TS), §5 (estados ausentes).
4. `docs/context/plataforma-dados/gates/REVISAO-FB-infra-architect.md` — §1 (ordem de custo corrigida), §2 (store ausente), §3 (topologia: mesma origem por caminho, sem CORS), §4 (catálogo/quarentena).
5. `docs/context/plataforma-dados/gates/REVISAO-FB-playwright.md` §4 — 17 achados com evidência; `REVISAO-FB-ux-gate.md` — 18 achados por heurística, recomendações 1–7.
6. Normativos já decididos que este PRD **não reabre**: `ADR-005` (D1, D5, D6), `ADR-019` (D4), `ADR-003`, `ADR-027`, `SPEC-001` §3.6/§3.8/§4.3, `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` (`D5.13`/`D5.14`, falsificador `:225`).
7. `docs/product/STITCH_CONTEXT.md`, `docs/product/DESIGN_SYSTEM.md` — design aprovado que hoje não chega ao browser.

## Decisões do owner já tomadas (citar com rótulo, não reabrir)
- BFF recusado `[DECISÃO-OWNER 2026-09-03]` (ver `REVISAO-FB-frontend-architect.md` §3).
- Premissas de infra: VPS compartilhada, só Postgres em prod, R2 free tier (`.claude/agents/infra-architect.md` §premissas).
- Rota `/painel` (linha 12 da tabela de idioma em `CLAUDE.md`): **não decidida**, dono owner — registrar como pergunta em aberto, não decidir.
- **Ingress / Caddy — respondido pelo owner em 2026-09-04, literal `[PREMISSA-OWNER: 2026-09-04]`:**
  *"sobre o caddy, 1 n vamos subir agora mas precisa estar estruturado, 2 vai ser um subdomain do dns que já
  tenho para n ter mais custo enquanto valido. então vai ter o caddy ali sim"*. Leitura adotada
  `[INFERRED: "ali" = o `deploy/` deste projeto, respondendo ao menu "Caddy do vizinho × próprio" de
  `REVISAO-FB-infra-architect.md` §3]`: Caddy **próprio**, em `deploy/`, servindo um **subdomínio de DNS já
  existente**, mesma origem por caminho (`/api/*` → uvicorn), **estruturado nesta feature e NÃO implantado
  agora**. Custo adicional de infra: zero enquanto valida. Não reabrir; o PRD trata como requisito de
  estrutura (compose + Caddyfile + variáveis), com implantação como non-goal.
- **Feature filha de `plataforma-dados`: confirmado pelo owner** `[PREMISSA-OWNER: 2026-09-04]`: *"pode ir como
  filha, é melhor para organizar"*. `harness pipeline relate … list` já mostra o elo.

## O que o PRD tem de responder
- Escopo: os 6 recursos entram todos, ou o PRD prioriza pela tabela de custo (5 → 4-catálogo → 1 → …)? Proponha e rotule `[INFERRED]`; a escolha final é do owner via menu.
- Estados de sistema como requisito (loading/erro/vazio/API fora do ar) e critério de aceite **executável por Playwright** (`frontend/e2e/` já existe: `npm --prefix frontend run test:e2e`).
- Critério de aceite que **reprove com o servidor ausente** — o falsificador de `05_fatia_visivel.md:225` vale para toda story.
- Non-goals explícitos: escrita (ADR-027), novos coletores, redesign visual além de fazer o design aprovado chegar ao browser.
- Tracker: `harness policy --key tracker` é Jira/CST, mas o MCP Atlassian **não está autenticado nesta sessão** → nada no tracker; marque `local_only` com esse motivo, como `PRD-002` fez.

## Regras de entrega
Saídas em `docs/specs/PRD-003-camada-de-leitura-do-painel.md` e `docs/context/camada-de-leitura-do-painel/handoff_to_architect.md`; linha **append-only** em `docs/INDEX.md`; `harness pipeline advance camada-de-leitura-do-painel PRD_DRAFT` após criar o PRD. Todo número com comando e `n`; `[NÃO SEI]` explícito; sem commit; sem `Co-Authored-By`. R1–R7 de `docs/protocolo-de-despacho.md`: resposta final ≤15 linhas.
