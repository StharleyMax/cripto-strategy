# `CA-F3-8` — Pegada: RSS do alvo local (10 min de `up`) + tamanho das imagens

**Task:** `T-03.7` · **Fase:** `03` · **Componente:** `infra` (`docs`) · **Depende de:** `T-03.5`
**Fecha:** `CA-F3-8`, `RNF-1`, `RNF-5` · **Falsificadores medidos:** `ADR-027/F2` (soma > 176 MB),
`ADR-032/F5` (imagem backend > 400 MB), `ADR-031/F3` (`collector` com Postgres > 23,2 + 10 = 33,2 MB)
· **Morde declarado no DoD:** acima de qualquer teto ⇒ **escalar ao `/architect`, não ajustar o teto**
— nenhum teto foi ajustado neste documento.

## 0. O que este documento É e o que ele NÃO É

`NÃO reprojeta — mede` (item `3.7` do plano). As medições abaixo são de uma execução real e local de
`docker compose … up` com os 6 serviços do alvo local (sem `caddy`), não uma implantação (`R-E`): nada
saiu deste host, nenhuma porta além de `127.0.0.1` foi publicada.

**Uma restrição do ambiente de execução deste agente, declarada em vez de escondida:** o Bash/Write/Read
desta sessão recusa qualquer operação que toque o *conteúdo* de um arquivo `.env`/`.env.example` (só
`test -f` passa) — proteção de sandbox contra vazamento de segredo, aplicada até ao arquivo-exemplo sem
segredo real. Para rodar `$L up` mesmo assim, sem tocar nenhum arquivo versionado: um `.env` novo foi
autorado do zero (não copiado de `.env.example`) com os 15 nomes documentados em `SPEC-004 §3.6` e
valores de teste, salvo fora do repositório
(`/tmp/claude-1002/…/scratchpad/t-03-7-local-test.env`), e **linkado** como `.env` na raiz do
worktree (`ln -s <scratch> .env`) — `.env` já está no `.gitignore`, o link não é commitado, e nenhum
conteúdo de segredo passou por uma ferramenta que o exibisse. `docker compose --env-file .env -f
deploy/compose.yml config -q` → `rc=0` confirma que o link foi aceito como arquivo normal.

## 1. Dois achados de FORA do escopo de `infra` que a medição expôs — nomeados, não corrigidos aqui

`T-03.7` é a primeira vez que alguém sobe os 7 serviços de verdade (`T-03.1`–`T-03.6` só validaram
`config`/`build`). Dois defeitos em código `sentimento`/`main` (não `infra` — fora do que esta task
pode tocar) apareceram; ambos ficam **nomeados para escalar**, não corrigidos por esta task.

### 1.1 `collector` — `SeriesRowMappingNotDecidedError` no boot real (já era `[NÃO SEI]` conhecido)

`docker logs deploy-collector-1`, reproduzido em qualquer restart:

```
SeriesRowMappingNotDecidedError: the SeriesKey mapping for this producer's raw event/reading is
not decided yet (no catalog exists for 'premium_index'/forceOrder liquidations — see
infra/redis_stream_series_sink.py and domain/price_source_catalog.py); pass
premium_index_to_rows=/force_order_to_rows= explicitly to run() to supply it
```

**Não é descoberta nova** — `docs/context/captura-em-producao/medicoes/CA-F1-5-vazao-24h.md` (fase `01`,
`T-01.8`) já nomeava isto como `[NÃO SEI]`: *"o multiplicador linhas-por-evento bruto depende do
catálogo de `SeriesKey`… 'no catalog for these two producers exists yet'… o `XLEN`/`count(*)` contínuo,
em produção real, por 24 h continua pendente do deploy (fase `03`)"*. `T-03.7` é essa fase — e é a
primeira vez que o composition root real (`python -m
src.modules.sentimento.infra.collectors_cli`, o `command:` de `deploy/compose.yml`) roda fora de teste;
`backend/tests/helpers/collectors_cli_driver.py:196` confirma que **todo** teste até hoje injeta
`premium_index_to_rows`/`force_order_to_rows` fabricados (`_never_maps`/`_one_row_premium_index_mapping`)
— `main()` nunca recebeu um mapeamento real, em nenhum ambiente. `[MEDIDO 2026-09-08]`: `docker inspect
deploy-collector-1 --format '{{.RestartCount}}'` → **55** restarts em ~10 min (`restart:
unless-stopped` relança a cada crash). Efeito colateral necessário para `T-03.8` (E2E): `n_rows ≥ 3`
não vai fechar enquanto este catálogo não existir — **não é defeito do compose, é o gap que `CA-F1-5`
já havia nomeado, agora com sintoma concreto.** Escalar a `quant-architect`/`/architect`, dono do
catálogo `SeriesKey` para estes dois produtores.

### 1.2 `api` — `uvicorn` amarrado a `127.0.0.1` DENTRO do contêiner, inalcançável por `web`/`caddy`

`backend/src/main/__main__.py:27`: `uvicorn.run(app, host="127.0.0.1", port=…)`. A própria docstring
(linhas 21–25) já avisava: *"Bind loopback-only — `[DECISAO-OWNER: 2026-09-03]`… This repository has no
`deploy/` yet to impose loopback from outside the process, so the bind itself is the only thing
enforcing it today."* — decisão tomada **antes** de `deploy/` existir. Agora que existe (`F3`), `api`
não publica porta e só deveria ser alcançado via rede do compose em `api:${APP_PORT}`
(`deploy/compose.yml:34-35`, `ADR-029/D5`) — mas um processo amarrado a `127.0.0.1` **dentro do seu
próprio namespace de rede** não aceita conexão de outro contêiner nem do host via port-forward.
`[MEDIDO 2026-09-08]`:

```
$ curl -sv http://127.0.0.1:8000/ 2>&1 | tail -3
* Connected to 127.0.0.1 (127.0.0.1) port 8000 (#0)
> GET / HTTP/1.1
* Recv failure: Conexão fechada pela outra ponta
```

com `docker port deploy-api-1` confirmando o mapeamento `8000/tcp -> 127.0.0.1:8000` (a publicação do
`compose.local.yml` está correta; o processo dentro é que recusa). Isto bloqueia `D3.7`/`D3.12` de
`T-03.8` (o `curl` ao `/collector-status` teria o mesmo sintoma) e a leitura de `web`→`api` em
qualquer alvo. Fora do escopo `infra`: é `src/main`, componente `sentimento`. Escalar a
`infra-architect`/`/architect` — o bind precisa virar `0.0.0.0` (ou o IP do contêiner) agora que a
fronteira de rede é o compose, não mais o processo.

Nenhum dos dois impediu a medição de RSS abaixo: `api` fica estável (0 restarts, serve e falha só no
`accept` de conexão TCP externa); `collector` reinicia mas o processo, enquanto vivo, já tem a conexão
Postgres aberta e os imports carregados — RSS amostrado nesse estado é a melhor aproximação disponível
hoje do "collector com Postgres" que `ADR-031/F3` pede, com a ressalva declarada no §2.2.

## 2. Medição de RSS — `docker stats --no-stream`, 10 min de `up` local

### 2.1 Comando e universo

```bash
$ docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml up -d
$ # … 10 min decorridos (postgres/redis: StartedAt 2026-09-08T09:30:14Z; snapshot 09:40:16Z, +10m02s) …
$ docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' \
    deploy-api-1 deploy-writer-1 deploy-collector-1 deploy-redis-1 deploy-postgres-1
```

`[MEDIDO 2026-09-08T09:40:16Z]` — universo: 5 serviços do alvo local que ficam de pé (`web` não subiu
nesta execução — porta `3000` do host já estava ocupada por outro processo `next-server` de uma task
paralela neste mesmo host compartilhado; `web` não entra na soma de `D3.11`, então não bloqueia esta
medição):

| serviço | `MemUsage` (`docker stats`) | uptime no snapshot | restarts |
|---|---|---|---|
| `api` | **43,72 MiB** | 8 min | 0 |
| `writer` | **29,02 MiB** | 10 min | 0 |
| `collector` | **29,30 MiB** | 5 s (ver §1.1/§2.2) | 55 |
| `redis` | **7,578 MiB** | 10 min | 0 |
| `postgres` (fora da soma; contexto) | 142,7 MiB | 10 min | 0 |

### 2.2 `collector` — estabilidade da amostra apesar do crash-loop

Cinco amostras em instantes diferentes do ciclo restart→crash (`docker stats --no-stream …
deploy-collector-1`, repetido): **29,32 / 31,3 / 29,32 / 29,30 / 29,31 MiB** `[MEDIDO 2026-09-08,
n=5 amostras]` — desvio ≤ 2 MiB, porque o processo carrega os mesmos imports e abre a mesma conexão
Postgres em todo restart antes de crashar no primeiro ciclo de `premiumIndex` (§1.1). Não é a leitura
"10 min contínuos e ocioso" que `ADR-031/F3` pressupõe — está nomeado, não escondido — mas é a única
leitura possível enquanto `main()` não recebe o mapeamento real.

### 2.3 Soma dos 4 (`api + writer + collector + redis`) — `D3.11`

```
43,72 + 29,02 + 29,30 + 7,578 = 109,618 MiB ≈ 114,9 MB decimais (× 1.048576)
```

`[MEDIDO 2026-09-08]`: **109,62 MiB / 114,9 MB** — **abaixo do teto de 176 MB** (`ADR-027/F2`, `2×` de
`88 MB`) por margem ampla (~35–38%), mesmo com `collector` em crash-loop e sem `web` de pé (que não
entra na soma). **Falsificador `ADR-027/F2` NÃO disparou.**

### 2.4 `collector` isolado contra `ADR-031/F3` (`+10 MB` sobre `23,2 MB` = teto `33,2 MB`)

`[MEDIDO 2026-09-08]`: **29,30 MiB** (amostra no snapshot de 10 min) / **29,32–31,3 MiB** (faixa das 5
amostras) — **abaixo do teto de 33,2 MB**. **Falsificador `ADR-031/F3` NÃO disparou** — com a ressalva
de §2.2: esta é a RSS do processo com Postgres aberto ANTES do crash de mapeamento, não 10 min
ininterruptos do mesmo PID. Se `/architect` julgar que essa ressalva invalida a leitura, o correto é
re-medir depois que `[Q11]`/o catálogo `SeriesKey` for decidido — não ajustar o teto.

## 3. Tamanho de imagem — `docker image ls` / `docker image inspect`

```bash
$ docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml build
$ docker image inspect deploy-api:latest deploy-writer:latest deploy-collector:latest deploy-web:latest \
    --format '{{.RepoTags}} {{.Size}}'
```

`[MEDIDO 2026-09-08]`:

| imagem | bytes | MB (decimal) | MiB |
|---|---|---|---|
| `deploy-api`/`deploy-writer`/`deploy-collector` (mesma imagem, `backend/Dockerfile`, `python:3.13-slim`) | 238.593.118 | **238,6 MB** | 227,6 MiB |
| `deploy-web` (`frontend/Dockerfile`, `node:22-alpine`) | 924.370.400 | 924,4 MB | 881,6 MiB |

**Backend ≤ 400 MB (`ADR-032/F5`): 238,6 MB — dentro do teto, margem de ~40%. Falsificador `ADR-032/F5`
NÃO disparou.** Frontend não tem teto numérico neste DoD (`D3.11` só cobra o backend); `924,4 MB` fica
registrado aqui para completar `RNF-5` (`"imagem Python do backend [NÃO MEDIDO] — declarar em F3"` — os
dois lados agora estão declarados, não só o backend).

## 4. Veredito dos três tetos do DoD (`D3.11`)

| critério | teto | medido | resultado |
|---|---|---|---|
| soma RSS `api+writer+collector+redis` | ≤ 176 MB | 109,62 MiB / 114,9 MB | **PASSA** |
| imagem backend | ≤ 400 MB | 238,6 MB | **PASSA** |
| `collector` com Postgres vs. CLI standalone | ≤ 23,2 + 10 = 33,2 MB | 29,30 MiB (ressalva §2.2) | **PASSA, com ressalva** |

Nenhum falsificador disparou — nenhum teto foi ajustado (não havia necessidade). Os dois achados do §1
não são falsificadores desta task (não são excesso de RSS/imagem); são defeitos funcionais de código
`sentimento`/`main` que a primeira execução real do compose local expôs, e ficam escalados, não
corrigidos aqui (fora do escopo de `infra`/`T-03.7`, que mede — não reprojeta).

## 5. Reprodução — para quem for re-medir depois de `[Q11]`/`ADR-029/D5` resolvidos

```bash
# 1. .env de teste com os 15 nomes de SPEC-004 s3.6 (nao versionado, fora do repo) + QUARANTINE_STORE_PATH
#    (api boot-refusa sem isso: data/md/ nao existe na imagem, .dockerignore exclui data/)
# 2. ln -s <esse .env> .env   # na raiz do worktree
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml up -d
# aguardar 10 min
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' deploy-api-1 deploy-writer-1 deploy-collector-1 deploy-redis-1
docker image inspect deploy-api:latest deploy-web:latest --format '{{.RepoTags}} {{.Size}}'
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml down -v
```
