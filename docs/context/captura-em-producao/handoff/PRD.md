# Handoff → PM — `captura-em-producao` (filha de `plataforma-dados`, ledger novo)

**Autorização do owner, literal `[PREMISSA-OWNER: 2026-09-07]`:**
> "ta, podemos puxar essa de captura em produção em um ladger novo e limpo, como sugeriu. Único ponto é q
> tem q ter os composer para build em deploy e local."

Leitura adotada pelo coordenador `[INFERRED]`: (1) feature filha própria, em vez de `override` na mãe;
(2) **requisito não negociável**: a topologia de captura tem de subir por `compose` **em dois alvos —
`deploy/` (VPS) e local (máquina do dev)** — com build das imagens, não só `docs`. "Build" aqui é
`docker compose build`/`up` funcionando nos dois; a distinção deploy × local é de perfil/override
(`compose.override.yml`, profiles ou arquivo por ambiente — decisão do `/architect`, não do PM).

Ledger: `harness pipeline state captura-em-producao` → `INIT`; `dispatch pm` e `relate parent
plataforma-dados` registrados. Próximo PRD livre: **`PRD-004`** (`ls docs/specs/` → 3 PRDs).

## O problema, medido (PR #159, `docs/confirmacao-sem-captura-real-2026-09-07`, ainda não mergeada)
Nenhum coletor captura dado real hoje: `grep -rn 'import redis'` nos CLIs de coletor → 0; `find backend/src
-iname single_writer_cli.py` → vazio. A fila (`T-07.4`) e o escritor único (`T-07.5`) estão `done` como
LÓGICA testada, sem fiação de produção. A camada de leitura (`SPEC-003`, 3 fases QA APPROVED) mostra
hoje 1 linha em `/collector-status`, vinda do único escritor real de `md.ingest_run`.

## O que já está decidido e este PRD herda, sem reabrir
- `ADR-027` (aprovada pelo owner em 2026-09-04): **D1** três processos de vida longa (coletor, escritor
  único, API — "nada mais vira container permanente"); **D2** Redis dedicado ao projeto
  `[DECISÃO-OWNER: 2026-09-04]`. Ler §"O que esta ADR NÃO decide" (linha 137) — é o espaço do PRD.
- `ADR-009/D2` Streams, nunca Pub/Sub. `ADR-002` motor de armazenamento (TimescaleDB/postgres:15).
- `ADR-029` topologia da leitura: `deploy/compose.yml` já tem `postgres`, `api`, `web`, `caddy`
  (`grep -nE '^\s{2}[a-z_-]+:$' deploy/compose.yml`) — a captura **entra ao lado**, não recria.
- Premissas de recurso (`.claude/agents/infra-architect.md` §premissas): VPS compartilhada, só Postgres,
  R2 free tier; nunca propor gigas de aggTrades.

## O que migra da mãe (referência, não cópia)
`docs/context/plataforma-dados/tasks.toml` `T-07.15` (`CST-110`, produtor real via `RedisStreamPublisher`),
`T-07.16` (`CST-111`, `single_writer_cli` com sink real), `T-07.17` (`CST-109`, `compose.yml` ganha
`redis:7-alpine` + serviço do escritor). Narrativa: `tasks_review-T-07.15-a-17-fiacao-producao.md`.
Handoffs: `proposta-topologia-ingest.md`, `tasks-candidatas-fiacao-producao.md`. ⚠ A PR #159 cita
`CST-112` para `T-07.17`; **está errado** — `CST-112` é o Epic F1 da `camada-de-leitura-do-painel`; o
`tasks.toml` da mãe aponta `CST-109`. O PRD deve propor o destino das 3 tasks da mãe (fechar como
`superseded` com ref para a filha, ou mover) — menu para o owner.

## O que o PRD tem de responder
- Stories por processo de `ADR-027/D1`: coletores 24/7 publicam → escritor único consome e grava →
  observabilidade mínima (o `/collector-status` que já existe passa a mostrar linhas reais — este é o
  critério de aceite ponta a ponta mais barato).
- **Compose em dois alvos** com critério executável: `docker compose -f … config` e `build` passam em
  ambos; local sobe sem Caddy/TLS; deploy é o `deploy/compose.yml` existente estendido.
- Retenção/pegada de disco de Redis e das tabelas por fonte (o `infra-architect` já mediu ~41 MB RSS para a
  API; Redis e escritor precisam de número). Rótulo em todo número.
- Non-goals: novos coletores além de forceOrder/premiumIndex; SSE; backfill histórico; implantação real na
  VPS (estruturado, não implantado — mesma cláusula de `ADR-029`, salvo o owner dizer o contrário).
- Perguntas em aberto com dono; menu para o owner onde houver escolha, com custo.
- Tracker Jira/CST: o MCP `atlassian` local **está autenticado** (`mcp__atlassian__jira_*`); o PM NÃO carda
  (é do `/tech-lead`), mas não escreva "não autenticado".

## Regras de entrega
`docs/specs/PRD-004-captura-em-producao.md` (formato de `PRD-003`), `docs/context/captura-em-producao/
handoff_to_architect.md`, linha append-only em `docs/INDEX.md`, `harness pipeline advance
captura-em-producao PRD_DRAFT`. Todo número com comando e `n`; `[NÃO SEI]` explícito; owner indisponível
nesta sessão — sem perguntas bloqueantes; sem commit; sem `Co-Authored-By`. R1–R7 de
`docs/protocolo-de-despacho.md`: resposta final ≤15 linhas.
