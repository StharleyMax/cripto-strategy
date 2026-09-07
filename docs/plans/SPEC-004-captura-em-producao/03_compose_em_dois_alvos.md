# Fase `03` — Sobe por `compose` em dois alvos

**Componente alvo:** `infra` · **SPEC:** `SPEC-004` §3.6, §3.7; §5 B10–B13 · **ADR:** `ADR-032` (D1–D5), `ADR-031/D2` (imagem) · **PRD:** `US-8..10`; `RF-8`, `RF-9`, `RF-11`, `RF-12` (`.env.example`, G9); `RN-5`, `RN-7`; `CA-F3-1..9`; `CA-E2E-1..3`
**Depende de:** `02` (`CA-F2-*` verdes) — `RN-1`. **Juiz:** `infra-architect` (co-assina `ADR-032`; decide se implementa o `healthcheck` de `D5`). **Nenhuma implantação** (`R-E`).

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 3.1 | `backend/Dockerfile` (`python:3.13-slim`, uma imagem, sem `ENTRYPOINT` lógico) + `backend/.dockerignore` (`.venv`, `tests/`, `data/`, `.env*`, `__pycache__`) | `RF-8`, `G1`, `ADR-032/D2` | `infra` | não cria 3 imagens; não copia `.env` |
| 3.2 | `frontend/Dockerfile` (`node:22-alpine`, `npm ci && npm run build`) + `frontend/.dockerignore` (`node_modules`, `.next`, `.env*`) | `RF-8`, `G1` | `infra` | não altera `frontend/src` (`R-D`) |
| 3.3 | `deploy/compose.yml` estendido: `postgres.image` → `timescale/timescaledb:2.17.2-pg15`; `redis` (`ADR-032/D4`, `healthcheck redis-cli ping`, volume `redis_data`, `logging`); `writer` e `collector` (mesma imagem, `command:` de §3.6, `env_file ../.env`, `depends_on service_healthy`, `logging 10m×3`); `api.depends_on` com `condition: service_healthy`; comentário de cabeçalho atualizado | `RF-8`, `RNF-4`, `RN-5`, `CA-F3-5/7/9` | `infra` | não adiciona `ports:` a `api`; não adiciona serviço one-shot (`NG-6`); não adiciona `profiles:` ao base |
| 3.4 | `deploy/compose.local.yml`: exatamente 3 serviços — `caddy: profiles: ["deploy-only"]`, `api.ports 127.0.0.1:${APP_PORT}:${APP_PORT}`, `web.ports 127.0.0.1:3000:3000` | `RF-9`, `CA-F3-3`, `ADR-032/D1` | `infra` | não define serviço ausente do base; não se chama `compose.override.yml` |
| 3.5 | `.env.example` +13 variáveis (§3.6), placeholders de dev, comentário por variável; `POSTGRES_DB/USER/PASSWORD` incluídos (**G9**) | `RF-12`, `ADR-032/D3` | `infra` | nenhum valor real |
| 3.6 | `Makefile`: `compose-deploy` e `compose-local` (só concatenam `--env-file .env -f …`; aceitam `ARGS`) | §3.6 | `infra` | não entram em `verify` |
| 3.7 | Medição: `docker stats --no-stream` após 10 min de `up` local + `docker image ls` das 2 imagens → `medicoes/CA-F3-8-pegada.md` | `CA-F3-8`, `RNF-1`, `RNF-5`, `ADR-031/F3`, `ADR-032/F5` | `infra` (`docs`) | não reprojeta — mede |
| 3.8 | Ponta a ponta local: `up` ≥ 1 sessão + 1 ciclo; `collector-status`; `stop collector writer`; `PARADO` após `stale_after_s` | `CA-E2E-1..3` | `infra` | nenhuma linha em `web` |
| 3.9 | `healthcheck` por comando para `writer`/`collector` — **só se o `infra-architect` decidir no gate** (`P8`); senão fica declarado em `ADR-032/D5` | `[Q6]` | `infra` | não inventa endpoint HTTP nos processos |

## DoD — comando, universo e a coluna "morde"

Convenção: comandos **da raiz**; `D` = `docker compose --env-file .env -f deploy/compose.yml`; `L` = `D -f deploy/compose.local.yml`; `.env` = `cp .env.example .env` com valores de teste.

| DoD | comando (⇒ verde) | morde |
|---|---|---|
| **D3.1** deploy valida | `$D config -q` → `rc=0` | sem `--env-file`/`.env` ⇒ erro de interpolação `POSTGRES_PASSWORD` (B12) — **desejado** |
| **D3.2** deploy constrói | `$D build` → `rc=0`; `ls backend/Dockerfile frontend/Dockerfile \| wc -l` → **2** (hoje 0) | `mv backend/Dockerfile /tmp && $D build` ⇒ reprova nomeando `api` |
| **D3.3** local valida e constrói sem `caddy` | `$L config --services \| sort \| tr '\n' ' '` → `api collector postgres redis web writer` (**6**, sem `caddy`); `$L build` → `rc=0`; `$L config \| grep -c 'host_ip: 127.0.0.1'` → **2** | `$D config --services` sozinho ⇒ contém `caddy` — os alvos **têm de diferir** |
| **D3.4** deploy tem exatamente os 7 | `$D config --services \| sort \| tr '\n' ' '` → `api caddy collector postgres redis web writer` | serviço one-shot ⇒ 8 (`NG-6`); `profiles:` no base ⇒ 6 |
| **D3.5** overlay é magro | `grep -cE '^  [a-z_-]+:$' deploy/compose.local.yml` → **3**; cada um existe no base | 4º serviço ⇒ `ADR-032/F3` |
| **D3.6** imagem sem segredo | `docker run --rm $($D config --images \| grep -m1 backend) sh -c 'find / -name ".env*" -not -path "*/node_modules/*" 2>/dev/null \| wc -l'` → **0**; idem frontend | `.dockerignore` sem `.env*` ⇒ ≥ 1 |
| **D3.7** local sobe e responde | `$L up -d && sleep 20 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT$API_PREFIX/collector-status` → **200**; `curl -s …/ready \| jq .store.schema_present` → **true** | `$L down` ⇒ `000` |
| **D3.8** zero segredo literal | `for f in deploy/compose.yml deploy/compose.local.yml backend/Dockerfile frontend/Dockerfile; do harness rules --mode file --path $f; done` → saída vazia, `rc=0` | senha literal plantada ⇒ `own.compose-hardcoded-secret` |
| **D3.9** teto de log e de fila | `$D config \| grep -c 'max-size'` → **≥ 4**; `$D config \| grep -cE 'appendonly\|maxmemory'` → **≥ 2**; `grep -c MAXLEN backend/src/modules/sentimento/infra/redis_stream_bus.py` → **≥ 1** | serviço sem `logging` ⇒ 3; `redis` sem `command` ⇒ 0 |
| **D3.10** `.env.example` completo | `for v in $(grep -oE '\$\{[A-Z_]+' deploy/compose.yml deploy/compose.local.yml \| tr -d '${' \| sort -u); do grep -q "^$v=" .env.example \|\| echo MISSING $v; done` → **nada** (hoje: 3 `POSTGRES_*` faltam) | remover 1 linha do exemplo ⇒ `MISSING` |
| **D3.11** pegada medida | `test -f docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md && grep -cE '\[MEDIDO' …` → **≥ 2**; soma de RSS dos 4 (api, writer, collector, redis) **≤ 176 MB** (2 × 88, `ADR-027/F2`); imagem backend **≤ 400 MB** (`ADR-032/F5`) | acima ⇒ falsificador dispara, escalar ao `/architect` |
| **D3.12** E2E — `/collector-status` mostra linhas reais | após ≥ 1 sessão + 1 ciclo: `curl -s …/collector-status \| jq '.n_rows'` → **≥ 3**; `jq '[.rows[].series]'` contém os 2 `endpoint` de `Q3`; `$L stop collector writer` + repetir ⇒ `n_rows` **igual**; após `stale_after_s` ⇒ `status` das 2 séries = **`PARADO`** | `api` em `sqlite` efêmero ⇒ 0 ou 1 |
| **D3.13** E2E — dado observado | `$L exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -tAc "select count(*) from <tabela> where provenance='OBSERVED'"` → **> 0** e cresce entre 2 leituras com coletor de pé | coletor parado ⇒ não cresce |
| **D3.14** E2E — contrato intocado | `git diff --stat <base>..HEAD -- backend/src/api/routes/collector_status.py backend/src/modules/sentimento/domain/collector_status.py frontend/src` → **vazio** | qualquer linha ⇒ `NG-8` |
| **D3.15** portões | `make verify` verde; `R-E`: nenhum comando de `up` fora da máquina local | — |
| **D3.16** local funcional sem `.env.local` (PR #166 §1) | `$L config \| grep -c 'INGEST_HEALTH_API_BASE_URL'` → **≥ 1** no serviço `web`; `ls frontend/.env.local 2>/dev/null \| wc -l` → **0** durante `D3.7`; `curl -s http://127.0.0.1:$APP_PORT/painel \| grep -c 'n_rows\|ATIVO\|PARADO'` → **≥ 1** | `web` sem a variável ⇒ `/painel` renderiza o estado "API não configurada" de `SPEC-003 §3.3` e o `grep` dá **0** |
