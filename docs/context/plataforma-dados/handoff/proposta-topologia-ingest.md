# Handoff — formalizar a costura coletor→fila→escritor único e a topologia de deploy

Origem: investigação pedida pelo owner na sessão de 2026-09-04, não uma task existente. Este
documento é o contexto completo para quem for decidir se isto vira ADR/task nova ou se anexa a
uma task existente — não é para ser colado de volta no chat.

## O achado (medido, dois subagentes, comandos reproduzíveis)

`docs/arquitetura-fluxos.md` documenta: Coletores → FILA DURÁVEL (Redis Streams + consumer
group) → ESCRITOR ÚNICO → Postgres/store colunar → `md.ingest_run`/`md.ingest_gap`.

**Nada disso está ligado em produção hoje**, apesar de as peças existirem e passarem em teste:

1. `redis_stream_bus.py`/`redis_series_write_queue.py` existem — `RedisStreamPublisher` tem
   **zero chamador de produção**; o próprio docstring do módulo admite isso por escrito
   (`redis_series_write_queue.py:4`).
2. `run_single_writer.py` (o "escritor único", `T-07.5`, **já marcada `done`** no
   `tasks.toml`) nunca é chamado fora de `backend/tests/sentimento/test_run_single_writer.py`.
   Não existe `single_writer_cli.py` nem qualquer `__main__` para ele.
   `dump_etl_cli.py:81` já comentava "seu escritor de produção chega com T-03.8" — nunca chegou.
3. Os ~15 CLIs de coleta (`backend/src/modules/sentimento/infra/*_cli.py`) escrevem cada um
   direto em disco local (SQLite, JSONL, gzip) — nenhum importa `redis`.
4. `md_ingest_run`/`md_ingest_gap` existem, mas em **SQLite**
   (`sqlite_ingest_record_store.py`), com o próprio arquivo (linhas 26-30) admitindo a
   divergência: *"THE ENGINE IS SQLite AND ADR-002/D1 SAYS PostgreSQL — the divergence goes IN
   WRITING"*. O único Postgres real do repo é `backtest.run_registry` — componente diferente.
5. `deploy/compose.yml` só declara `postgres:16-alpine`. Zero Redis, zero worker, zero API.

Conclusão: `T-07.4`/`T-07.5` fecharam a **lógica** (fila e escritor único, testados e corretos
por tipo), mas nenhuma task fechou a **fiação** (produtor real publicando, entrypoint do
escritor, deploy). Isso é lacuna real de escopo, não regressão nem trabalho malfeito.

## A avaliação de topologia (infra-architect, já rodada — usar como insumo, não repetir)

Medição de RSS real (`resource.getrusage`, dentro do `.venv` deste projeto) e de containers
Docker (`redis:7-alpine` = 9,6 MiB RSS idle / 39,1 MB de imagem):

| cenário | RSS |
|---|---|
| Python vazio | 10,8 MB |
| FastAPI + SQLite (`src.main`) | 40,8 MB |
| 1 CLI standalone | 23,2 MB |
| Redis client + escritor único | 14,9 MB |
| tudo junto (FastAPI + Redis + 14 CLIs importados) | 44,5 MB |

Achado: o custo de importar Python cresce pouco por módulo dentro de UM processo; o que
multiplica é o NÚMERO DE PROCESSOS/CONTAINERS (cada um paga a base do interpretador de novo,
mais o teto de log do compose vizinho, `max-size: 10m × max-file: 3` ≈ 30 MB/container).

**Recomendação do infra-architect** (não é decisão fechada — precisa virar ADR):
- `C1`/`C2` (snapshot diário, Coinalyze one-shot) e `C4`/`C5` (force_order stream, premiumIndex
  poll) são classes de risco operacional diferentes (`docs/arquitetura-fluxos.md:197-201` já
  rotula isso: "NAO precisa de host 24/7" vs "PRECISA de host 24/7").
- Topologia proposta: **3 processos de vida longa** — (a) os dois coletores 24/7 juntos, por
  threads (o código de hoje é síncrono, sem `asyncio`); (b) o escritor único, com entrypoint
  a construir; (c) a API (já existe). **Os one-shot/diários nunca viram container de vida
  longa** — viram invocação pontual via cron/systemd timer, mesma imagem, comando diferente.
  Precedente literal: `anything_monorepo/backend/src/jobs/__init__.py:1-5`.
- Custo projetado (ordem de grandeza, `[INFERRED]` a partir da tabela acima): 40-70 MB pros 3
  processos de vida longa, contra 150-300+ MB se os ~15 coletores virassem containers
  permanentes — mais até 450 MB de teto de log contra 30-90 MB.
- Hierarquia de criticidade "sempre vivo": os 2 coletores 24/7 > escritor único > API (a API
  serve leitura; um restart curto nela não perde captura; os coletores 24/7 perdem dado
  irrecuperável se caírem).
- Redis dedicado a este projeto ou compartilhado com o `redis:7-alpine` do `anything_monorepo`
  vizinho: **`[NÃO SEI — decisão do owner]`**, mesma classe de custo que `ADR-002/D5` já nomeou
  para o Postgres compartilhado.

**Nenhuma ADR decide topologia de processo/container hoje.** `ADR-002/D5` decide o CONTRATO
(fila + escritor único), `ADR-009/D6` decide a FRONTEIRA (`src/api`/`src/jobs` por injeção) —
nenhuma das duas decide se cada job é container próprio, thread ou processo supervisionado.
Essa é exatamente a lacuna a fechar.

## O que se pede a quem ler isto

1. Decidir se isto é ADR nova (`ADR-027`, próximo número livre em `docs/adr/`) mais task(s)
   anexadas ao plano existente (`SPEC-001-plataforma-dados`, provavelmente fase 07 ou uma nova
   fase de consolidação), ou se precisa passar por PRD antes — dado que amplia o escopo de
   `T-07.4`/`T-07.5` (já `done`) sem reabri-las.
2. Se for ADR nova: os dois achados centrais acima (fila/escritor não ligados; custo medido de
   processo vs container) são o material bruto — já há medição suficiente para D1/D2 de uma
   ADR, falta só a decisão formal e o falsificador.
3. Tasks candidatas a nascer daqui (nomes provisórios, não IDs oficiais):
   - produtor real: os coletores 24/7 (e talvez os one-shot) passam a publicar no Redis Stream
     em vez de escrever direto em arquivo/SQLite;
   - entrypoint do escritor único (`single_writer_cli.py` ou equivalente);
   - `deploy/compose.yml` ganha `redis:7-alpine` SÓ quando houver produtor real (hoje seria
     container sem consumidor);
   - runbook operacional (`T-09.5`, já `blocked`, pode ser desbloqueada por isto).
4. Gates do owner (`CLAUDE.md`): `spec`, `build` e `advance DONE` não podem ser feitos por
   agente — este handoff é para preparar a narrativa de revisão, não para pular esse gate.

## Referências

`docs/arquitetura-fluxos.md`, `docs/adr/ADR-002-motor-de-armazenamento.md`,
`docs/adr/ADR-009-reuso-da-forma-do-anything.md`, `docs/premissas-de-infra-e-stack.md`,
`docs/context/plataforma-dados/tasks.toml` (`T-07.4`, `T-07.5`, `T-09.5`),
`backend/src/modules/sentimento/infra/redis_stream_bus.py`,
`backend/src/modules/sentimento/infra/redis_series_write_queue.py`,
`backend/src/modules/sentimento/use_cases/run_single_writer.py`,
`backend/src/main/__init__.py`, `deploy/compose.yml`.
