# ADR-029 — Topologia da camada de leitura: Caddy próprio em subdomínio existente, mesma origem por caminho, readiness que discrimina e falha no boot com store mal apontado

**Data:** 2026-09-04 · **Status:** proposto (nasce com `SPEC-003` em `SPEC_DRAFT`; `aceito` no `approve spec` do owner) · **SPEC:** [`SPEC-003`](../specs/SPEC-003-camada-de-leitura-do-painel.md) §3.4–§3.5 · **PRD:** [`PRD-003`](../specs/PRD-003-camada-de-leitura-do-painel.md) `RF-5`..`RF-8`, `RNF-3`, `RNF-5`, `RN-6`, `RN-9`, `CA-F1-12`, `CA-F2-1`..`CA-F2-9`
**Fase:** `F1` (alcançabilidade em dev) e `F2` (readiness, `ETag`, `deploy/`) do plano [`SPEC-003`](../plans/SPEC-003-camada-de-leitura-do-painel/index.md) · **Componente alvo:** `infra` (juiz: `infra-architect`, `harness.toml:983`)
**Proposta de origem, que esta ADR FORMALIZA:** `REVISAO-FB-infra-architect.md` §2 (store ausente/vazio, medido em 2 estados × 1 rota) e §3 (*"Proposta (candidata a ADR, não decisão minha ainda)"*). O que lá era candidato vira decisão aqui, **depois** da fala do owner que respondeu à pergunta que aquele relatório deixou para ele.
**Rev de ancoragem:** `master@c8e7193`.

## Contexto — front e API não se encontram, e a API não sabe dizer se está mal apontada

Medido nesta árvore (`SPEC-003` §0.1): `INGEST_HEALTH_API_BASE_URL` definida em **0** arquivo de configuração; `deploy/` tem **1** arquivo (`compose.yml`, só Postgres); `grep -c 'src.main' Makefile` → **0**; rotas HTTP do backend: **1** (`GET /ingest-health`); `CORSMiddleware`/`ETag`/`/ready`: **0** ocorrências reais (o grep case-insensitive devolve 9 linhas, **todas** `AggTradeBucketAggregate`/`BucketAggIdGap` casando `etAg` — falso positivo, `SPEC-003` §0.2). `create_app` (`backend/src/main/__init__.py:41-52`) constrói o store sobre **qualquer** caminho e a rota devolve `200 {"n_runs":0}` mesmo com o **diretório-pai inexistente** `[MEDIDO: FB-infra §2, n=2 estados]` — misconfiguração indistinguível de "coletor nunca rodou", a ambiguidade de `ADR-012` em HTTP.

**A fala do owner que esta ADR obedece** `[PREMISSA-OWNER: 2026-09-04]`:

> *"sobre o caddy, 1 n vamos subir agora mas precisa estar estruturado, 2 vai ser um subdomain do dns que já tenho para n ter mais custo enquanto valido. então vai ter o caddy ali sim"*

Leitura adotada `[INFERRED I-1 do PRD-003: "ali" = o `deploy/` deste projeto, respondendo ao menu "Caddy do vizinho × próprio" de FB-infra §3]`. Custo se a leitura estiver errada: `compose.yml` perde 1 serviço e o `Caddyfile` vira trecho para o repositório vizinho — ~1 arquivo.

## Decisão

### D1 · Caddy PRÓPRIO, em `deploy/` deste projeto, servindo UM subdomínio de DNS já existente — estruturado agora, NÃO implantado

`deploy/compose.yml` ganha os serviços `api`, `web` e `caddy` ao lado do `postgres` existente. `deploy/Caddyfile` versionado, com o host público por `${PUBLIC_HOST}`. **Nenhum comando de implantação é executado nesta feature** (`RN-9`, `NG-1`): `docker compose config -q` e `caddy validate` são o teto do que se roda. TLS: `[NÃO SEI]` se o DNS existente já tem certificado wildcard (`[Q10]`, owner) — o `Caddyfile` nasce com a diretiva de TLS **parametrizada** (ACME automático como default do Caddy; `tls internal` ou certificado fornecido por env), sem decidir por ele.

### D2 · Mesma origem por caminho; `API_PREFIX` é constante única; CORS não existe

Um único host público. O Caddy roteia `${API_PREFIX}/*` → `api:${APP_PORT}` e todo o resto → `web:3000`. `API_PREFIX` (default **`/api/v1`** `[INFERRED: menu M2(a) do PRD-003 — versiona desde o dia 1; custo de reversão: 1 linha em `src.main` + 1 em `.env.example`]`) é lido **uma vez**, no composition root (`src.main`), e o mesmo valor alimenta o `Caddyfile` por env — mudar o segmento muda `openapi.json` e o roteamento **juntos**. `CORSMiddleware` **não entra** (`NG-7`): sob mesma origem + leitura do lado do servidor (`ADR-028/D1`) o browser nunca chama a API; `allow_origins=["*"]` é **recusado** — trocaria uma decisão de topologia por um buraco permanente.

### D3 · Misconfiguração NÃO vira dado: `create_app` recusa subir; `/ingest-health` mantém `200` vazio; `/ready` discrimina

Três estados, três comportamentos, **em camadas diferentes** — e nenhum deles toca o contrato `ADR-005/D6.1`:

| estado do `store_path` | onde se decide | comportamento |
|---|---|---|
| **diretório-pai não existe** | `create_app` (composição, `src.main`) | processo **não sobe**: `rc ≠ 0`, mensagem (em inglês, `CLAUDE.md` §mensagem de exceção) nomeando o caminho. Misconfiguração é erro de quem configurou, não "zero runs" |
| arquivo ausente · 0 byte · sem tabela | `_fetch` do store (já separa via `sqlite_master`) | `GET /ingest-health` **continua `200 {"n_runs":0,…}`** (contrato `D6.1` intocado; o cliente TS que valida o envelope não quebra) **e** `GET /ready` → `503 {"store":{"path":…,"exists":false|true,"schema_present":false}}` |
| store válido | — | `GET /ready` → `200 {"store":{"path":…,"exists":true,"schema_present":true}}` |
| corrompido | `DatabaseError` propaga | `500` — já é assim, não muda |

`/ready` **não** é `/health` de processo: ele responde sobre o **store**, que é a única dependência que a leitura tem. A forma do corpo é contrato (`SPEC-003` §3.4).

### D4 · `ETag` = `IngestHealthReport.fingerprint()`, fora da região hasheada; `304` a `If-None-Match` igual

O handler de `/ingest-health` emite `ETag: "<hex sha256>"` com o valor de `fingerprint()` (`ingest_record.py:177`, dono `quant-architect`) — **header**, nunca campo em `runs[]` (`ADR-005/D6.3`). `If-None-Match` igual ⇒ `304` sem corpo; diferente ou ausente ⇒ `200` + corpo. O Server Component (`ADR-028/D1`) envia `If-None-Match` quando tiver o valor; até o header existir, `cache: "no-store"` explícito (`RNF-1`). O valor do `ETag` tem de ser **igual** ao `fingerprint()` do TS sobre o corpo recebido — é a mesma comparação de dois lados de `ADR-008/DoD-2`, agora com o transporte no meio.

### D5 · A porta da API nunca é publicada; o Next a alcança pelo nome de serviço

`api` escuta em `127.0.0.1:${APP_PORT}` no processo (`__main__.py:27`, já é assim) e, em compose, **só na rede interna** — `ports:` **não existe** no serviço `api` (`RNF-5`). O `web` lê `INGEST_HEALTH_API_BASE_URL=http://api:${APP_PORT}` (compose) ou `http://127.0.0.1:${APP_PORT}` (dev, `.env.example`), **do lado do servidor** (`ADR-019/D4`). Dev sobe com `make api` + `npm --prefix frontend run dev` e as variáveis de `.env.example`.

### D6 · Exposição pública: estrutura RESERVADA, decisão do owner

Quando o subdomínio subir, o painel fica exposto (`RNF-6`; `5.11`/auth saiu de escopo por `[PREMISSA-OWNER: 2026-08-25]` *"vps n é problema agora, vai rodar muito local até lá"*). Esta ADR **não decide** o mecanismo (`[Q3]`, menu M4) — mas o `Caddyfile` nasce com um bloco de `basic_auth` **condicionado a env** (`${PANEL_BASIC_AUTH_HASH}`; ausente ⇒ bloco inerte), para que a opção M4(a) `[INFERRED: proposta do PRD]` custe **0 arquivo novo** se o owner a escolher e **0 código** se recusar. Reservar estrutura não é decidir; a decisão continua sendo dele.

## Alternativas recusadas — com o custo

| alternativa | custo / motivo | veredito |
|---|---|---|
| **Caddy do vizinho** (editar o ingress de outro projeto; 0 container novo) | a fala do owner (*"vai ter o caddy ali sim"*, após *"subdomain do dns que já tenho"*) responde ao menu pelo lado do próprio; e editar config de outro repositório coloca a implantação deste fora do controle deste ledger | **recusada** (`D1`) |
| **CORS** (`CORSMiddleware`, dois hosts) | **0** hoje; `allow_origins=["*"]` é buraco permanente; com leitura server-side o browser nunca chama a API — CORS resolveria um problema que `ADR-028` já eliminou | **recusada** (`D2`) |
| **`/ingest-health` → `404`/`503` para store vazio** | mistura "sem dado" com "sem serviço"; quebra o cliente TS que valida o envelope (8/8 testes de `T-05.14`) | **recusada** (`D3`) |
| **`200` vazio para tudo, como hoje** | misconfiguração indistinguível de "coletor nunca rodou" `[MEDIDO: FB-infra §2]` — é o `rc=0` ambíguo de `ADR-012` em HTTP | **recusada** (`D3`) |
| **Prefixo nenhum (rota na raiz)** | inviabiliza roteamento por caminho ⇒ obriga CORS ou dois hosts (menu M2(c)) | **recusada** (`D2`) |
| **`NEXT_PUBLIC_INGEST_HEALTH_API_BASE_URL`** | proibido por escrito, `ADR-019/D4` | **recusada** (`D5`) |
| **Nginx/Traefik em vez de Caddy** | `[NÃO MEDIDO]` — recusa por consistência: o vizinho já opera `caddy:2-alpine` com TLS e `${PUBLIC_HOST}` (`premissas-de-infra-e-stack.md:44,46`); um segundo proxy é um segundo vocabulário operacional na mesma VPS | **recusada** (`D1`) |
| **Implantar agora** | `[PREMISSA-OWNER: 2026-09-04]` *"n vamos subir agora"* | **fora** (`RN-9`) |

## Falsificadores

| # | propriedade | comando | hoje (`c8e7193`) | depois — e o que reprova |
|---|---|---|---|---|
| **F-029-1** | `D3` — misconfig não sobe | `INGEST_HEALTH_STORE_PATH=<scratch>/nao-existe/ih.sqlite3 .venv/bin/python -m src.main; echo $?` | sobe; `curl /ingest-health → 200 {"n_runs":0}` `[MEDIDO: FB-infra §2]` | **`rc ≠ 0`**, stderr nomeia o caminho. Se subir, `D3` não existe |
| **F-029-2** | `D3` — `/ready` discrimina 3 estados | arquivo ausente / 0 byte / store válido ⇒ `curl -s -o /dev/null -w '%{http_code}' $API/ready` | `404` (rota inexistente) `[MEDIDO: FB-infra §2]` | **`503` / `503` / `200`**, corpos com `exists`/`schema_present` distintos. Dois estados com mesma resposta ⇒ não discrimina |
| **F-029-3** | `D3` — `D6.1` intocado | `cd frontend && node --test src/features/s1-console/ingest-health-query-http.test.ts` | **8/8** `[MEDIDO: FB-frontend §1]` | **8/8** ainda; `/ingest-health` sobre arquivo ausente continua `200 {"n_runs":0}` |
| **F-029-4** | `D4` — `ETag` = fingerprint, dois lados | `curl -sD - -o /dev/null $API/ingest-health \| grep -ci etag`; valor `==` `IngestHealthReport.fingerprint()` (teste Python) **e** `==` `fingerprint(parseIngestHealthEnvelope(body))` (teste TS) | **0** header | **1** header; igualdade nos dois lados; `If-None-Match` igual ⇒ **`304`**, errado ⇒ **`200`**. Igualdade só de um lado é `DoD-2` comparando um número consigo mesmo |
| **F-029-5** | `D1`/`D5` — estrutura, sem implantação | `grep -cE '^  (api\|web\|caddy):' deploy/compose.yml`; `docker compose -f deploy/compose.yml config -q`; `grep -A12 '^  api:' deploy/compose.yml \| grep -c 'ports:'`; `caddy validate --config deploy/Caddyfile` | **0** serviços; n/a | **3**; `rc=0`; **0**; `rc=0`. E o inverso do escopo: `docker compose -f deploy/compose.yml ps` **na VPS** mostrando `caddy` ⇒ `RN-9` violada |
| **F-029-6** | `D1` — segredo nunca literal | `harness rules --mode file --path deploy/compose.yml` (cala) · compose com `POSTGRES_PASSWORD: literal` plantado (morde) | cala hoje (`D1.14`) | **vazio, `rc=0`** · **`≠ 0`** nomeando `own.compose-hardcoded-secret`. `deploy/` está em `code_paths.include_prefixes` (`harness.toml:369`), logo a regra o alcança |
| **F-029-7** | `D2` — prefixo é UMA constante | mudar o default de `API_PREFIX` ⇒ `openapi.json` paths **e** `Caddyfile` renderizado mudam juntos (teste) | n/a | mudam juntos. Um mudar sem o outro ⇒ duas constantes |
| **F-029-8** | `D2` — CORS não existe | `grep -rn 'CORSMiddleware' backend/src --include='*.py' \| wc -l` | **0** | **0**. ≥ 1 ⇒ alguém reabriu o que `ADR-028` fechou |

## O que esta ADR NÃO decide

- **`API_PREFIX` definitivo** — `[Q2]`, owner (M2); o default `/api/v1` é `[INFERRED]` com custo de reversão de 2 linhas.
- **Mecanismo de auth pública** — `[Q3]`, owner (M4); `D6` só reserva estrutura.
- **TLS do subdomínio** — `[Q10]`, owner.
- **Teto/paginação de `/ingest-health`** — `[Q5]`, `quant-architect` + owner; volumetria em produção `[NÃO SEI]`.
- **Onde mora o store de quarentena em produção** (SQLite × Postgres) — `[Q8]`, `ADR-002`.
- **Implantar** — `NG-1`.

**Co-assinatura recomendada:** `infra-architect` (juiz de `infra`), no `approve spec` — a proposta é dele (`FB-infra §2-3`); esta ADR a fixa depois da fala do owner. Não é gate de `RN-1` (aquele é do `quant-architect`, `ADR-028`).
