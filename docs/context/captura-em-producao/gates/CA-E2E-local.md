# `CA-E2E-local` — Ponta a ponta local (`captura-em-producao`, F3, `T-03.8`)

**Fecha:** `SPEC-004` §1.1 (cinco propriedades), §5 B10/B11, §9 (falsificador da SPEC), §3.6.1
(`D3.16`, `PR #166 §1`). **Plano:** `03_compose_em_dois_alvos.md` item `3.8`; DoD `D3.7`, `D3.12`,
`D3.13`, `D3.14`, `D3.16` (metade `curl`). **Cobre:** `US-10`, `CA-F3-4`, `CA-E2E-1..3`.
**Depende de (código, não gate):** `T-03.4` (`deploy/compose.yml`), `T-03.5`
(`deploy/compose.local.yml`, alvos `make`) — ambos mergeados em `master` antes desta task.

**Veredito resumido: PARCIAL, com 3 achados reais de "peças que não se ligam" — 2 corrigidos
nesta task (infra, sem tradeoff de desenho), 1 escalado (decisão do owner).** Nenhum deles foi
inventado: cada um tem log, comando e `rc` capturados abaixo, com o arquivo:linha exato.

---

## 0. Ambiente — adaptação necessária, declarada

Esta execução coincidiu com **outra worktree ativa no mesmo host Docker**
(`wf_a7375708-4bc-22`, mesmo daemon, mesmo nome de projeto `compose` padrão — `deploy`, derivado
do diretório do arquivo compose, igual em toda worktree). Rodar `$L up` sem cuidado teria
colidido com os containers/portas dela. Adaptação, sem alterar nenhum arquivo versionado:

- `docker compose … -p t038e2e` — nome de projeto isolado (em vez do default `deploy`).
- `.env` de teste com `APP_PORT=18000` (em vez de `8000`) — evita a porta já publicada pela
  outra worktree.
- Verificação via `docker exec <container> python3 -c '...'` (chamando o próprio processo na
  SUA própria loopback) onde o comando literal do DoD (`curl 127.0.0.1:$APP_PORT/...`) bateria
  numa porta de host não publicada por este motivo — ver §2 sobre POR QUÊ ela não é publicável
  de qualquer forma.

Todo container, imagem e volume desta sessão foi removido ao final (`docker compose … down -v`
+ `docker rmi`) — `docker ps -a`/`docker images`/`docker volume ls` sem `t038e2e` confirmado.

---

## 1. Achado 1 (CORRIGIDO) — `api` crash-loop: diretório do quarantine store ausente

**Sintoma medido `[MEDIDO 2026-09-08]`**, `docker logs t038e2e-api-1` (primeira tentativa, antes
do fix, `deploy/compose.yml` sem a mudança abaixo):

```
store_parent_missing
src.main.StoreParentDirectoryMissingError: series quarantine store parent directory does not exist: data/md
```

**Causa:** `backend/src/main/__init__.py:235-240` — `create_app` monta SEMPRE um
`SqliteSeriesQuarantineStore` em `QUARANTINE_STORE_PATH` (default
`data/md/series_quarantine.sqlite3`), **independente de `INGEST_RECORD_BACKEND`** (não há
variante `postgres` desse store). `backend/.dockerignore` (`T-03.1`) exclui `data/` da imagem
de propósito (`D3.6`'s falsificador precisa disso), e nada em `deploy/compose.yml` recriava o
diretório em tempo de execução — `api` reprovava o próprio boot antes de o uvicorn abrir um
socket, em TODA tentativa de `$D up`/`$L up`.

**Fix aplicado** — `deploy/compose.yml`, serviço `api`: um volume nomeado montado exatamente no
caminho que falta (`api_data:/app/data/md`), mesmo padrão que `postgres_data`/`redis_data` já
usam; dá ao Docker o diretório completo (ele cria a árvore do PONTO DE MONTAGEM, não precisa que
ela já exista na imagem) e, de brinde, a mesma persistência entre restarts que os outros dois
volumes já têm. Não é decisão de desenho — é o gap mecânico entre uma exclusão de
`.dockerignore` já decidida (`T-03.1`) e um caminho que o código sempre requer.

**Resultado após o fix `[MEDIDO 2026-09-08]`:**

```bash
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml -p t038e2e \
  up -d postgres redis api collector writer
docker exec t038e2e-api-1 python3 -c "
import urllib.request
print(urllib.request.urlopen('http://127.0.0.1:18000/api/v1/ready', timeout=3).read().decode())"
```
```
{"store":{"path":"postgresql://cripto_strategy@postgres:5432/cripto_strategy_dev","exists":true,"schema_present":true}}
```

`api` para de reiniciar, sobe limpo, e responde com `schema_present=true` — **D3.7 (metade
`/ready`) fecha**, dentro da namespace do próprio processo (ver Achado 2 sobre por que "dentro
da namespace" é a ressalva que sobra).

---

## 2. Achado 2 (ESCALADO — decisão do owner, não corrigido) — `api` bind loopback dentro do container

**Sintoma medido `[MEDIDO 2026-09-08]`:**

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18000/api/v1/collector-status   # do HOST
```
→ **`000`** (conexão recusada), mesmo com `deploy/compose.local.yml` publicando
`127.0.0.1:${APP_PORT}:${APP_PORT}`. O MESMO endpoint, chamado de **dentro** do container via
`docker exec t038e2e-api-1 python3 -c "urllib.request.urlopen('http://127.0.0.1:18000/...')"`
→ **`200`**, `schema_present: true` (Achado 1). A app funciona; o que não funciona é alcançá-la
de fora do seu próprio namespace de rede.

**Causa, arquivo:linha exato** — `backend/src/main/__main__.py:27`:

```python
uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("APP_PORT", "8000")))
```

Isto é `[DECISAO-OWNER: 2026-09-03]` (docstring da própria função, linha 21): *"Bind
loopback-only ... no public network exposure"*. A MESMA docstring já previa o que este `T-03.8`
mediu (linhas 24-25): *"This repository has no `deploy/` yet to impose loopback from outside
the process, so the bind itself is the only thing enforcing it today."* — ou seja, o próprio
owner, em 03/09, já registrou que o bind seria revisitado quando `deploy/` existisse. `deploy/`
existe agora (`T-03.4`), e ninguém revisitou.

**Por que isto quebra o modelo de `compose`:** dentro de um container, `127.0.0.1` é a
loopback **daquele** namespace de rede — inalcançável tanto pelo host via porta publicada
(`docker port-forward` conecta na interface de bridge do container, não na loopback dele)
quanto por OUTRO container via nome de serviço (`caddy`/`web` tentando `http://api:$APP_PORT`
bateriam na MESMA parede). O comentário de cabeçalho de `deploy/compose.yml:34-36` já assume o
oposto: *"`web` and `caddy` reach it only by service name on the compose network"* — as duas
peças (o bind de `__main__.py` e a topologia de `compose.yml`) foram escritas por ADRs
diferentes, em datas diferentes, e nunca reconciliadas.

**Por que NÃO foi corrigido aqui:** reverter/parametrizar uma decisão rotulada
`[DECISAO-OWNER]` é ato do owner ou de uma ADR que a emende — não de uma task de teste E2E de
`infra`. `backend/src/main/__main__.py` também não está nos "não faz" explícitos de `T-03.8`
("nenhuma linha em web"), mas está fora do que uma correção mecânica (como o Achado 1) pode
decidir sozinha: a superfície seria a MESMA função que a decisão de segurança nomeia, e o
tradeoff (bind mais aberto DENTRO do container, mitigado pelo fato de `deploy/compose.yml`
nunca publicar porta de `api` no alvo `deploy` e `compose.local.yml` restringir a publicação do
alvo `local` à loopback do HOST) é exatamente o tipo de decisão que `CLAUDE.md` reserva para o
owner/ADR.

**Isto é, literalmente, o falsificador que `SPEC-004 §9` já nomeava:** *"esta SPEC especificou
três peças que não se ligam, e o defeito está no desenho (§3.3 ou §3.5)"* — só que a peça que
não se liga não é `§3.3`/`§3.5` (run-shape), é a fronteira entre `ADR-029/D5` (bind) e
`ADR-032` (topologia de rede do compose). **Escalado ao `/architect` — decisão sugerida (não
tomada aqui): tornar o host do bind configurável por variável de ambiente** (ex.: `APP_HOST`,
default `127.0.0.1` — preserva `make api` inalterado), com `deploy/compose.yml` setando
`APP_HOST=0.0.0.0` só para os processos que rodam em container; a superfície pública real
continua protegida pelos DOIS mecanismos que já existem (nenhuma `ports:` em `api` no alvo
`deploy`; loopback do HOST no alvo `local`), então o "no public network exposure" do
`[DECISAO-OWNER: 2026-09-03]` não muda — só o que ele protege muda de "a única barreira" para
"uma de duas".

---

## 3. Achado 3 (CORRIGIDO) — `ntp_skew_probe_cli` era a 4ª raiz de composição que `ADR-031/D1` já temia

**Contexto:** `D2.8` (fase `02`, já fechada) mediu `n_rows=2` e anotou explicitamente: *"`+1`
com o probe NTP → `≥ 3` é `CA-E2E-1`, em `03`"* — ou seja, o terceiro `(source, endpoint)` que
`D3.12` exige viria de `backend/src/modules/sentimento/infra/ntp_skew_probe_cli.py`
(`persist_ntp_skew_run.py`: `source="binance-futures"`, `endpoint="/fapi/v1/time"`, distinto
dos dois do coletor). `ADR-031` (linha 12) já dizia — como fato, não como aspiração — que este
probe *"**já** grava o mesmo registro por um terceiro processo"*.

**Medido `[MEDIDO 2026-09-08]`, ANTES do fix:** `ntp_skew_probe_cli.py:main()` compunha
`SqliteIngestRecordStore(Path(args.store))` **incondicionalmente** — sem olhar
`INGEST_RECORD_BACKEND`. É a 4ª raiz de composição que o próprio módulo compartilhado já
nomeava como risco (`ingest_record_store_composition.py:5-7`: *"a fourth composition root
reading `INGEST_RECORD_BACKEND` slightly differently is exactly how three call sites agreeing
today stop agreeing tomorrow, silently"*). Rodar o probe contra o alvo `postgres` de `deploy/`
escrevia num arquivo SQLite que a API (composta via `INGEST_RECORD_BACKEND=postgres`) nunca lê —
"já grava o mesmo registro" era falso na prática, e ninguém tinha medido isso até agora.

**Fix aplicado** — `backend/src/modules/sentimento/infra/ntp_skew_probe_cli.py`: nova função
`_compose_store(args, environ, *, connect=psycopg.connect)`, que lê `INGEST_RECORD_BACKEND` e
delega a `compose_ingest_record_store` (a MESMA função que `collectors_cli`/`single_writer_cli`/
`src.main` já usam) quando o valor é `postgres`; mantém o comportamento ORIGINAL (`--store`,
inalterado) quando é `sqlite`/ausente — nenhum teste existente mudou de comportamento.
`--store` continua obrigatório no parser (o teste `test_build_parser_requires_a_store_path`
segue verde, sem alteração): seu papel muda de "escolhe o motor" para "nomeia o destino
sqlite quando o motor É sqlite", e o motor passa a ser sempre `INGEST_RECORD_BACKEND`, como em
todo outro composition root do pacote (`ADR-031/D1`).

**Testes novos** (`backend/tests/sentimento/test_ntp_skew_probe_cli.py`), mesmo padrão de fake
`connect` que `test_ingest_record_store_composition.py` já usa (nenhuma rede real):

- `test_compose_store_defaults_to_sqlite_at_the_store_flag_path`
- `test_compose_store_honours_explicit_sqlite_backend_too`
- `test_compose_store_picks_postgres_and_ignores_the_store_flag`

```bash
bash backend/scripts/test.sh -k ntp_skew --no-cov
```
```
.............                                                            [100%]
13 passed, 1865 deselected in 5.91s
```
(13 = 10 testes pré-existentes do arquivo + 3 novos; `--no-cov` só para isolar o universo do
piso de cobertura, que é medido à parte em §5.)

**Resultado real, ponta a ponta, contra o alvo `postgres` isolado (`t038e2e`) `[MEDIDO
2026-09-08]`:**

```bash
# baseline, só coletor+api de pé:
docker exec t038e2e-api-1 python3 -c "...urlopen('.../collector-status')..."   # n_rows: 2

# o probe, um-shot, MESMA imagem, apontado para o postgres do compose:
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.local.yml -p t038e2e \
  run --rm -T --no-deps -e INGEST_RECORD_BACKEND=postgres api \
  python -m src.modules.sentimento.infra.ntp_skew_probe_cli --store /tmp/unused.sqlite3
```
```
{"clock_skew_ms": -7, "ended_at": "2026-09-08T10:05:02.116Z", "http_status": 200,
 "local_time_after_ms": 1788861902116, "local_time_before_ms": 1788861901777,
 "round_trip_ms": 339, "run_id": "ntp-skew-dc6165f6-0981-4c9c-8417-6576398095d8",
 "server_time_ms": 1788861901953, "started_at": "2026-09-08T10:05:01.777Z", "weight_used": 1}
```
```bash
docker exec t038e2e-api-1 python3 -c "...urlopen('.../collector-status')..."   # n_rows: 3
# series: ['binance-futures · !forceOrder@arr', 'binance-futures · /fapi/v1/premiumIndex',
#          'binance-futures · /fapi/v1/time']
```

**`D3.12`'s parte "`n_rows ≥ 3` com os 2 `endpoint` de `Q3` presentes" — FECHA, medido, com o
comando literal.** As duas ressalvas que seguem em §4 são sobre as OUTRAS metades de `D3.12`/
`D3.13` (verdicts `ACCEPTED` e `OBSERVED` crescendo) — não sobre a contagem em si.

---

## 4. O que continua bloqueado — Achado independente, NÃO desta task (catálogo `SeriesKey`)

`D3.12` (verdict `ACCEPTED`/liveness `ATIVO`) e `D3.13` (`OBSERVED` > 0 e crescendo) continuam
vermelhos, por uma causa **anterior e separada** dos 3 achados acima, já `[NÃO SEI]` desde
`T-01.4` (fase `01`, fechada): `collectors_cli.py`'s `main()` nunca recebe
`premium_index_to_rows`/`force_order_to_rows` (o catálogo `SeriesKey` que decide qual série uma
leitura crua vira) — `_mapping_not_decided_yet` é o único default, e ele SEMPRE levanta
`SeriesRowMappingNotDecidedError` na primeira leitura não-vazia.

**Medido `[MEDIDO 2026-09-08]`, `docker logs t038e2e-collector-1`:**

```
SeriesRowMappingNotDecidedError: the SeriesKey mapping for this producer's raw event/reading
is not decided yet (no catalog exists for 'premium_index'/forceOrder liquidations — see
infra/redis_stream_series_sink.py and domain/price_source_catalog.py); pass
premium_index_to_rows=/force_order_to_rows= explicitly to run() to supply it
```

`select count(*) from md.series where provenance='OBSERVED'` → **`0`** (confirmado depois do
probe NTP também — o probe grava `md.ingest_run`, nunca `md.series`).

**Isto NÃO é corrigível por `T-03.8`:** `T-01.4`'s próprio docstring já recusou tomar essa
decisão (*"this task's dependencies do not resolve [it]... no catalog exists for these two
producers yet"*) — é trabalho de catálogo/domínio (`quant-architect`), não de infra. Fica
escalado, junto com o Achado 2, ao `/architect`.

---

## 5. Portões

| comando | resultado |
|---|---|
| `git diff --stat 41693d3..HEAD -- backend/src/api/routes/collector_status.py backend/src/modules/sentimento/domain/collector_status.py frontend/src` | `[MEDIDO 2026-09-08]` **vazio** — `D3.14` fecha |
| `harness rules --mode sweep --changed-only` | `[MEDIDO 2026-09-08]` saída vazia, `rc=0` — nenhum achado bloqueante |
| `harness rules --mode file --path deploy/compose.yml` | `[MEDIDO 2026-09-08]` saída vazia, `rc=0` — `D3.8` (zero segredo literal) continua fechado |
| `docker compose --env-file .env -f deploy/compose.yml config --services \| sort \| tr '\n' ' '` | `[MEDIDO 2026-09-08]` `api caddy collector postgres redis web writer` (7) — `D3.4` intocado pelo volume novo |
| `docker compose … -f deploy/compose.local.yml config --services` | `[MEDIDO 2026-09-08]` `api collector postgres redis web writer` (6, sem `caddy`) — `D3.3` intocado |
| `grep -cE '^  [a-z_-]+:$' deploy/compose.local.yml` | `[MEDIDO 2026-09-08]` `3` — `D3.5` intocado |
| `bash backend/scripts/lint.sh` | `[MEDIDO 2026-09-08]` `ruff check`/`ruff format --check`/`mypy --strict` verdes sobre 380 arquivos (379 + `ntp_skew_probe_cli.py` modificado) |
| `bash backend/scripts/test.sh` (`= harness policy --key test_cmd → sentimento.test`) | ver o QA Gate Context Block desta task para o resultado literal (suíte inteira + piso por camada) |

---

## 6. O que esta task NÃO decide

- Não resolve o catálogo `SeriesKey` (`premium_index_to_rows`/`force_order_to_rows`) — `[NÃO
  SEI]` de `T-01.4`, dono é `quant-architect`.
- Não altera `backend/src/main/__main__.py` — `[DECISAO-OWNER: 2026-09-03]`, reabertura é do
  owner ou de uma ADR (`ADR-029`).
- Não decide `T-03.9` (`healthcheck` por comando) — gate do `infra-architect`, `T-03.6`.
- Não toca `web`/`frontend/src` (nenhuma linha) — confirmado em §5.
- Não implanta nada real (`R-E`) — todos os containers foram efêmeros, isolados por
  `-p t038e2e`, e removidos ao final (§0).
