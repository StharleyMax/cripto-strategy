# ADR-032 — Dois alvos de compose: `deploy/compose.yml` (deploy, completo) + `deploy/compose.local.yml` (overlay explícito, sem `caddy`); Dockerfiles como entregável; um `.env` para os dois

**Data:** 2026-09-07 · **Status:** **aceita** — o owner deu `approve spec` em `captura-em-producao` (`2026-09-07T18:23:31Z`, `harness pipeline show captura-em-producao`) e a co-assinatura do `infra-architect` está satisfeita por `T-03.6` ([`gates/F3-infra-architect.md`](../context/captura-em-producao/gates/F3-infra-architect.md)) — o juiz de `infra` confirmou `D1`–`D4` como implementados por `T-03.1`–`T-03.5` sem desvio e decidiu `D5`/`[Q6]`/`P8` (liveness de `writer`/`collector`: mantém o mínimo já declarado, não implementa `healthcheck` por comando — motivo em `gates/F3-infra-architect.md` §3). **Flip formal de `Status` executado por `T-03.6`** (fase `03`, `docs`).
**Feature:** `captura-em-producao` · **Fecha:** `PRD-004` `[Q7]`/`NG-11` (forma dos dois alvos), `[Q8]` (`.env`), `[Q6]` (liveness — default mínimo), `[GAP G1]` (Dockerfiles), `[GAP G9]` (`.env.example` sem `POSTGRES_*`, `gates/PRD-004-architect.md` C2), `M4` (teto da fila, default) · **Herda sem reabrir:** `ADR-027/D1-D2`, `ADR-029/D1/D5`, `ADR-009/D2` · **Rev:** `master@0acf947`.
**Requisito não negociável:** `[PREMISSA-OWNER: 2026-09-07]` *"tem q ter os composer para build em deploy e local"*.

## Contexto — o que foi medido antes de escolher a forma

Ferramenta: Docker `20.10.17`, compose `v2.19.1`, daemon `24.0.4` `[MEDIDO 2026-09-07]`. Experimento em scratchpad com um compose de 3 serviços (`postgres` com `${POSTGRES_PASSWORD:?}`, `api`, `caddy` com `ports`) e um overlay de 2 linhas úteis `[MEDIDO 2026-09-07, gates/PRD-004-architect.md C6]`:

| # | comando | resultado |
|---|---|---|
| E1 | `docker compose -f deploy/compose.yml config --services` (sem `.env` no cwd) | **erro** de interpolação `POSTGRES_PASSWORD` — o `:?` morde, como desejado |
| E2 | `docker compose --env-file .env -f deploy/compose.yml config --services` (cwd = raiz) | `api caddy postgres`, `rc=0` — **o `.env` da raiz serve o compose de `deploy/`** |
| E3 | idem + `-f deploy/compose.local.yml`, overlay com `caddy: {profiles: ["deploy-only"]}` | `api postgres`, `rc=0` — **o overlay REMOVE `caddy` da topologia** sem tocar o arquivo base |
| E4 | idem, `config` completo | `api.ports` renderizado com `host_ip: 127.0.0.1`, `published: "8000"` |
| E5 | `compose.yml` com `include: [compose.yml]` | **0 serviços, `rc=0`** — `include:` (compose ≥ 2.20) é **ignorado em silêncio** no 2.19.1 |

Restrições herdadas: `deploy/compose.yml` é o alvo de deploy e deve ser **estendido, não recriado** (`PRD-004 RF-8`); `api` **nunca** publica porta no deploy (`ADR-029/D5`); `CA-F3-5` exige que `docker compose -f deploy/compose.yml config --services` devolva **exatamente 7** serviços sem flag adicional.

## Decisão

### D1 · Dois arquivos, um base e um overlay, **sempre explícitos** na linha de comando

- **Alvo deploy = `deploy/compose.yml` sozinho**, estendido com `redis`, `writer`, `collector` (7 serviços: `api caddy collector postgres redis web writer`), sem `profiles:` em nenhum serviço — o alvo de produção não pode depender de flag ou de `COMPOSE_PROFILES` para ser completo.
- **Alvo local = `deploy/compose.yml` + `deploy/compose.local.yml`**, nesta ordem. O overlay faz **só três coisas**: (i) `caddy: profiles: ["deploy-only"]` — exclusão medida em E3; (ii) `api: ports: ["127.0.0.1:${APP_PORT}:${APP_PORT}"]`; (iii) `web: ports: ["127.0.0.1:3000:3000"]`. Nada mais: **um serviço definido no overlay que não exista no base é violação** (duas verdades).
- **Invocação:** sempre com `--env-file .env` a partir da raiz (`D3`). Os dois alvos ganham alvos de `make` (`compose-deploy`, `compose-local`) que só concatenam as flags — a forma canônica fica escrita num lugar, e o DoD roda o comando cru, não o `make`.
- **Nome:** `compose.local.yml`, **não** `compose.override.yml` — o override é auto-mesclado quando o cwd é `deploy/`, e uma topologia que muda conforme o diretório de onde se invoca é a classe de quebra silenciosa que `CLAUDE.md` nomeia para `core.hooksPath`.

### D2 · Dockerfiles são entregável desta feature, e a imagem do backend é **uma**

- `backend/Dockerfile`: base `python:3.13-slim` `[INFERRED: pyproject requires-python ">=3.13,<3.14"]`, instala o projeto a partir de `pyproject.toml` (com lock quando houver), **sem `ENTRYPOINT` com lógica** — `api`, `writer` e `collector` são a **mesma imagem com `command:` diferente** (`ADR-027/D1`, literal: *"mesma imagem, comando diferente"*). `backend/.dockerignore` exclui `.venv`, `tests/`, `data/`, `.env*`, `__pycache__`.
- `frontend/Dockerfile`: base `node:22-alpine` `[INFERRED: Next 16 exige Node ≥ 20.9; 22 é a LTS corrente]`, `npm ci` + `npm run build`, `command: npm start` (o que o compose já declara). `frontend/.dockerignore` exclui `node_modules`, `.next`, `.env*`.
- **Propriedade, não estilo:** nenhuma imagem contém `.env` (`docker run --rm <img> sh -c 'ls -a /app | grep -c "^\.env"'` → 0). Segredo entra **só** por `env_file`/`environment` em tempo de execução.
- `frontend/` já tem `web` com `build: context: ../frontend` desde `T-02.6` — o Dockerfile fecha o `[GAP G1]` que existia antes desta feature; `docker compose build` nunca havia sido executado (`config -q` era o teto, `ADR-029/D1`).

### D3 · Um `.env` na raiz, para os dois alvos; `.env.example` é a fonte única de nomes

`--env-file .env` (E2). **Não há `.env.local`**: a diferença entre os alvos é topológica (portas, `caddy`), não de valores — o mesmo `POSTGRES_PASSWORD` de teste serve os dois. `.env.example` ganha o que hoje falta e o compose já exige: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (`[GAP G9]`: `git show HEAD:.env.example | grep -c POSTGRES` → **0** contra 3 `${POSTGRES_*:?}` no compose `[MEDIDO 2026-09-07]`), mais as variáveis novas desta feature (`SPEC-004 §3.6`). Valores do exemplo são placeholders de desenvolvimento, nunca credencial real.

### D4 · `redis` nasce com teto — `M4(a)` como default `[INFERRED]`

`redis:7-alpine`, `command` com `--appendonly yes --maxmemory ${REDIS_MAXMEMORY:-64mb} --maxmemory-policy noeviction`, volume `redis_data`, `healthcheck` por `redis-cli ping`, **sem `ports:`** em nenhum alvo (só `collector` e `writer` falam com ele, pelo nome de serviço). `noeviction` é deliberado: fila cheia faz o `XADD` **falhar alto** no coletor em vez de descartar dado capture-or-lose em silêncio. O teto de entradas do Stream fica no produtor (`XADD MAXLEN ~ ${REDIS_STREAM_MAXLEN:-100000}`, `SPEC-004 §3.2`). `CA-F1-5` mede por 24 h e pode trocar os dois números — **custo de reverter: 2 valores em `.env.example`**.

### D5 · Liveness de `writer`/`collector` (`[Q6]`) — o mínimo que já mede, sem `healthcheck` inventado

`restart: unless-stopped` + **fail-fast no boot** (`PRD-004 RN-4`, `ADR-029/D3`) + `depends_on` com `condition: service_healthy` para `postgres` (já tem `healthcheck`) e `redis` (`D4`). O instrumento de vida é o que **já existe**: `/collector-status` marca a série `PARADO` após `stale_after_s` (`ADR-030/D1`). Um `healthcheck` por comando para processos sem HTTP fica **declarado e não implementado** — `infra-architect` decide no gate se o quer, e o custo é 1 bloco por serviço.

**Decisão final (`infra-architect`, `T-03.6`, [`gates/F3-infra-architect.md`](../context/captura-em-producao/gates/F3-infra-architect.md) §3): NÃO implementar.** O default acima fica como está — `deploy/compose.yml` não ganha `healthcheck:` em `writer`/`collector`. Motivo, resumido (a versão completa está no gate):

1. Nenhum serviço tem `depends_on: … condition: service_healthy` sobre `writer`/`collector` — o único efeito observável de adicionar o bloco seria cosmético em `docker ps`/`docker inspect`, porque este é `docker compose` puro (v2.19.1), não Swarm/Kubernetes: um container `unhealthy` não é reiniciado nem removido do tráfego sozinho.
2. O único comando executável sem tocar código (`pgrep -f <module>`, já que os dois processos não falam HTTP) prova só que o processo-mestre não morreu — exatamente o que `restart: unless-stopped` mais boot fail-fast já tornam visível via o estado do container (`Restarting`/`Exited`). Não prova que a thread de trabalho não travou (Redis bloqueado, `XREADGROUP` pendurado) — um `healthcheck` que reporta `healthy` nesse cenário é o mesmo "sinal indistinguível" que este `CLAUDE.md` nomeia para `rc=0` ambíguo: falsa confiança pior do que a ausência do sinal.
3. Um `healthcheck` que de fato medisse atraso (consultar `/collector-status`, o único lugar que já calcula `stale_after_s`) exigiria `curl` na imagem `python:3.13-slim` (`backend/Dockerfile`, fora do escopo declarado desta task) e uma atribuição por série que um container sozinho não tem (a `verdict` agregada mistura sinais de `writer` e `collector`) — custo novo sem consumidor (mesmo argumento de "construção especulativa" que `ADR-027` já recusa em `P9`/`[Q10]`, `gates/F2-series-ddl.md` §7).

**Gatilho de reabertura, nomeado:** se `writer`/`collector` ganharem um heartbeat de processo (arquivo ou chave Redis tocada a cada ciclo, como instrumento novo de uma task futura), o `healthcheck` de compose passa a ter algo real para checar — revisitar `D5` nesse momento, não antes.

## Alternativas recusadas — com o custo

| alternativa | custo | por que perde |
|---|---|---|
| **`profiles:` no arquivo base** (`caddy` sob `profiles: ["deploy"]`, um arquivo só) | `docker compose -f deploy/compose.yml config --services` devolve **6** sem `--profile deploy` — `CA-F3-5` reprova; `COMPOSE_PROFILES` no ambiente muda a topologia sem diff | o alvo de produção passa a depender de flag para ser completo |
| **`compose.override.yml`** (auto-merge) | zero flags **se** o cwd for `deploy/`; topologia diferente conforme o diretório | quebra silenciosa por cwd — mesma classe que `core.hooksPath` |
| **Dois arquivos completos** (`compose.yml` + `compose.local.yml` autossuficiente) | 6 serviços duplicados; todo ajuste em um é dívida no outro | duas verdades sobre a mesma topologia |
| **`compose.base.yml` + `compose.deploy.yml` + `compose.local.yml`** (3 arquivos) | `deploy/compose.yml` deixaria de ser o alvo de deploy sozinho — viola `RF-8` e reescreve os comandos de `CA-F3-1/2/5` | recria em vez de estender |
| **`include:`** | **ignorado em silêncio no 2.19.1** (E5: 0 serviços, `rc=0`) | `rc=0` sem serviço é o pior sinal possível (`ADR-012`) |
| **Um Dockerfile por processo** | 3 builds, 3 imagens, 3 × tamanho | contraria `ADR-027/D1` literal |
| **`postgres` publicado em `127.0.0.1:5432` no overlay local** | conveniência de `psql` do host | os DoDs medem por `docker compose exec postgres psql` — porta publicada não é necessária; menos superfície |

## Falsificadores

| # | observação que derruba | o que derruba |
|---|---|---|
| **F1** | `docker compose --env-file .env -f deploy/compose.yml config --services \| sort` ≠ `api caddy collector postgres redis web writer` | **D1** — o alvo de deploy não é completo sozinho |
| **F2** | o alvo local (`-f -f`) renderiza `caddy`, ou deixa de renderizar `api.ports` com `host_ip: 127.0.0.1` | **D1** — o overlay não faz o que E3/E4 mediram (versão de compose diferente é a causa provável) |
| **F3** | `grep -c '^  [a-z_-]*:$' deploy/compose.local.yml` > 3, ou um serviço do overlay ausente do base | **D1** — o overlay virou segunda verdade |
| **F4** | alguma imagem construída contém `.env` | **D2** — `.dockerignore` falhou; segredo dentro da imagem |
| **F5** | `docker compose build` do backend produz imagem **> 400 MB** ou o build precisa de `tests/`/`data/` | **D2** — a imagem única carrega o que não deveria; medir em `CA-F3-8` junto ao RSS |
| **F6** | `CA-F1-5` mede vazão que enche `100 000` entradas em **< 1 h** de escritor fora | **D4** — o teto default protege menos de 1 hora; trocar os dois números |
| **F7** | `writer`/`collector` ficam `Up` sem gravar por > `stale_after_s` e `/collector-status` **não** vira `PARADO` | **D5** — o instrumento existente não basta; implementar o `healthcheck` declarado |

## Consequências

- `deploy/compose.yml` passa de 4 para 7 serviços e de 3 para 4 volumes (`redis_data`); o comentário de cabeçalho do arquivo deve ser atualizado (fala em "read layer" e "not a deployment" — a segunda parte continua verdadeira: `RN-7`).
- `CA-F3-1` do PRD passa a rodar: `cp .env.example .env && docker compose --env-file .env -f deploy/compose.yml config -q` — com `--env-file`, que o PRD omitia (E1 mostra que sem ele reprova mesmo com `.env` na raiz).
- Nenhuma implantação (`NG-1`, `RN-7`); `build` e `up` locais são o teto, salvo `M3(b)` do owner.
