# WI — desenho do `infra-architect`: a causa do idle-in-transaction da API e o timeout só dela

**Origem:** `D-2` de `handoff/DECISOES-DO-OWNER-2026-09-27.md` (worktree `wave-paineis-f03b`) —
*timeout no acesso da API + task para achar a causa* `[DECISÃO-OWNER: 2026-09-27, escolha entre
alternativas apresentadas]`. Laudo histórico: `docs/context/candle-real-e-eixo-unico/gates/ESCALADO-api-idle-in-transaction.md`.
**Autor:** `infra-architect` (dono da camada consumidora `src/api` + `src/main` e de `deploy/`).
**Escopo:** desenho. Nenhum código de produção foi editado. Árvore lida: `wave/api-idle-tx` em `68e6d50`.

## Veredito em 4 linhas

1. **A causa é uma só, e ela é de composição, não de rota:** a API abre **duas conexões `psycopg` de
   vida longa no boot**, com o `autocommit=False` padrão do psycopg 3, e **nenhum método de leitura
   chamado pela API faz `commit`/`rollback`**. O primeiro `SELECT` abre uma transação implícita que
   **nunca fecha**, e ela guarda `AccessShareLock` em tudo que tocou, até a API reiniciar.
2. **Conserto da causa:** as conexões **da API** nascem com `autocommit=True`, injetadas por
   `src.main` pelo parâmetro `connect=` que as duas funções de composição **já aceitam**. Writer e
   coletor não mudam.
3. **Timeout:** `PGOPTIONS="-c idle_in_transaction_session_timeout=30s"` em `services.api.environment`
   do `deploy/compose.yml`. Não mexe em role (as três aplicações usam **o mesmo role**, medido) nem no
   `.env` (compartilhado pelas três).
4. ⛔ **O timeout NÃO pode ir para produção sem o item 2.** Medido: quando ele dispara, a conexão
   morre (`broken=True`) e **nada a reabre**. Sozinho, ele troca *"ingestão parada em silêncio"* por
   *"`/series-history` com 500 até alguém reiniciar a API"*.

## 1. A causa, com arquivo:linha

### 1.1 Onde as conexões nascem (as duas, no boot, uma vez)

| conexão | quem abre | onde | autocommit |
|---|---|---|---|
| **A** — `ingest_store` (`/ready`, `/ingest-health`, `/collector-status`) | `create_app` → `compose_ingest_record_store(os.environ)` | `backend/src/main/__init__.py:237` → `ingest_record_store_composition.py:217` → `:203` `connect(conninfo)` | padrão = `False` |
| **B** — `window_reader` (`/series-history`: janela + extensão) | `create_app` → `compose_postgres_connection(os.environ)` | `backend/src/main/__init__.py:252-253` → `ingest_record_store_composition.py:203` | padrão = `False` |

O `connect` padrão é `psycopg.connect` puro (`ingest_record_store_composition.py:186`, `:224`), e o
`conninfo` (`:177-180`) não carrega `options` nem `autocommit`. Nenhum lugar de `src/main` ou
`src/api` chama `autocommit`, `commit`, `rollback` ou `close`
(`grep -rn "autocommit\|\.commit()\|\.rollback()\|\.close()" backend/src/main backend/src/api` → 0 linhas `[MEDIDO 2026-09-27]`).

### 1.2 Onde a transação abre e não fecha

**Query de 15 h — `SELECT 1 FROM information_schema.tables WHERE table_schema = …`** (conexão **A**):
- constante: `backend/src/modules/sentimento/infra/postgres_ingest_record_store.py:240-241`;
- executada em `describe_readiness()`, `:361-371` (`:367` e `:369`), **sem `commit`**;
- chamada por `GET /ready`: `backend/src/api/routes/ready.py:41` → `_PostgresReadiness.describe_readiness`, `backend/src/main/__init__.py:148-150`.
- A mesma conexão serve `runs()` (`:373-378`, via `use_cases/ingest_health.py:48` e
  `use_cases/collector_status.py:59`), `gaps()` (`:380-385`) e `writer_accounted_at()` (`:328-333`) —
  **todos sem `commit`**. Os métodos de escrita fazem `commit` (`:267`, `:294`, `:317`, `:351`), mas a
  API nunca os chama. A query exibida é **só a última**. O `AccessShareLock` em `md.ingest_run`, que
  segurou o `ALTER` de 2026-09-20, vem de um `runs()` anterior **na mesma transação**
  `[INFERRED: pg_stat_activity mostra a última query; o lock vale até o fim da transação]`.

**Query de 21 h — `SELECT MIN(bucket_end), MAX(bucket_end) FROM md.series WHERE …`** (conexão **B**):
- constante: `backend/src/modules/sentimento/infra/postgres_series_window_reader.py:49-52`;
- executada em `read_bounds()`, `:163-165`; a leitura irmã `read_window()`, `:145-150`, também abre
  transação. O arquivo tem **0 ocorrências** de `commit|rollback`
  (`grep -c "commit\|rollback" …/postgres_series_window_reader.py` → `0` `[MEDIDO 2026-09-27]`).

### 1.3 Prova de que o mecanismo é esse: medido agora, na API de produção local

O processo roda **dentro** de `deploy-api-1`, com a mesma imagem, o mesmo env e a mesma
`compose_postgres_connection` da API (script em scratchpad, removido do container depois):

```text
docker exec -w /app -e PYTHONPATH=/app deploy-api-1 python /tmp/probe.py
autocommit_default False
status_before IDLE
status_after_select INTRANS      <- um SELECT basta para abrir a transação
show_timeout 0
```
`[MEDIDO 2026-09-27 ~12:05Z, n=1 conexão própria, fechada no fim]`

E **a API reiniciada às 11:38:36Z já está vazando de novo** (leitura, `pg_stat_activity` + `pg_locks`):

```text
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc \
  "select pid, client_addr, state, xact_start, (now()-xact_start)::text, left(query,40)
     from pg_stat_activity where client_addr='172.18.0.3'"
141545|172.18.0.3|idle||                                   <- conexão A, nenhum request ainda
141546|172.18.0.3|idle in transaction|2026-09-27 12:01:27Z|00:02:22|SELECT MIN(bucket_end), MAX(bucket_end)
# pg_locks do pid 141546: 48 relações, todas AccessShareLock, incluindo md.series e os chunks do hypertable
```
`[MEDIDO 2026-09-27 12:03:49Z, n=2 sessões da API]`. Isto é **o sintoma de 21 h nascendo**: bastou o
primeiro `/series-history` depois do restart.

⚠️ **O IP não identifica o serviço.** O laudo de 2026-09-19 dizia `172.18.0.4 = deploy-api-1`. Hoje
`172.18.0.4` é o **writer** e a API é `172.18.0.3`
(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'` nos 4 containers
`[MEDIDO 2026-09-27]`). Por isso o desenho pede `PGAPPNAME` (§3.3).

### 1.4 Por que o `autocommit` não muda o que a API responde

A sessão roda em `READ COMMITTED` (o padrão; nada o muda no `conninfo` nem na role:
`select setconfig from pg_db_role_setting` → 0 linhas `[MEDIDO 2026-09-27]`). Em `READ COMMITTED`,
**cada statement já tira o próprio snapshot**. A transação aberta não dá consistência nenhuma entre
`runs()` e `gaps()`, nem entre `read_window` e `read_bounds`. Ela só retém lock e o horizonte de
vacuum. Trocar para `autocommit=True` mantém os mesmos snapshots por statement e tira a retenção
`[DOC: semântica de READ COMMITTED do Postgres 15]`.

Ganho lateral `[INFERRED]`: hoje, um statement que falhe nessas conexões deixa a transação em
`INERROR`, e **todo request seguinte** daquela conexão falha com *"current transaction is aborted"*
até o restart. Com `autocommit`, a falha fica confinada àquele statement.

## 2. O conserto da causa (API-only)

**O que muda:**

- **`backend/src/modules/sentimento/infra/ingest_record_store_composition.py`** ganha uma função
  pública de conexão para leitor, por exemplo `connect_autocommit(conninfo: str) -> psycopg.Connection`,
  que chama `psycopg.connect(conninfo, autocommit=True)`. Ela fica em `infra` para o `psycopg` não
  sair de lá, mesmo sem o contrato `import-linter` proibir `src.main`
  (`backend/pyproject.toml:338-347` lista só `domain`/`use_cases` como fonte).
- **`backend/src/main/__init__.py:237`** passa a ser `compose_ingest_record_store(os.environ, connect=connect_autocommit)`.
- **`backend/src/main/__init__.py:252`** passa a ser `compose_postgres_connection(os.environ, connect=connect_autocommit)`.

**O que não muda, e é o que garante o "sem afetar o coletor/writer":** o **padrão** das duas funções
de composição continua `psycopg.connect` puro (`:186`, `:224`). Todos os outros chamadores continuam
sem `connect=`: `collectors_cli.py:2909`, `klines_backfill_cli.py:608`,
`open_interest_poll_capture_bench_cli.py:464/479`, e o `ntp_skew_probe_cli.py:129`, que já injeta o
próprio `connect`. O writer faz `commit` explícito e pode precisar de atomicidade entre statements,
então ele **não** pode herdar `autocommit` `[INFERRED: não auditei cada caminho do writer; por isso o
desenho não toca o padrão]`.

**Recusados:**
- **`commit`/`rollback` no fim de cada leitura do adapter.** `PostgresIngestRecordStore` é o mesmo
  adapter do writer e do coletor. Um `rollback()` numa leitura desfaz a transação de escrita em curso
  de quem chamou. O conserto tem de ficar na composição da API, não no adapter compartilhado.
- **Pool (`psycopg_pool`) ou conexão por request.** Resolvem também a reconexão (§4), mas trazem
  dependência nova ou mudam o formato do construtor dos adapters, que são compartilhados. Isso é maior
  do que `D-2` e fica como follow-up (§4).

**Pegada:** 0 MB de disco, nenhum processo novo, nenhum container novo. No Postgres, a mudança
**libera** 48 `AccessShareLock` retidos e o horizonte de vacuum preso.

## 3. O timeout (API-only)

### 3.1 Mecanismo: `PGOPTIONS` no `environment` do serviço `api`

```yaml
# deploy/compose.yml, services.api.environment (hoje só APP_HOST, :99-100)
PGOPTIONS: "-c idle_in_transaction_session_timeout=30s"
PGAPPNAME: "cripto-api"
```

O libpq lê `PGOPTIONS` como padrão para todo parâmetro que o `conninfo` não traz, e o `conninfo` da
API não traz `options` (`ingest_record_store_composition.py:177-180`). **Medido no container da API:**

```text
docker exec -w /app -e PYTHONPATH=/app -e PGOPTIONS='-c idle_in_transaction_session_timeout=1s' \
  deploy-api-1 python /tmp/probe.py
show_timeout 1s
second_select IdleInTransactionSessionTimeout terminating connection due to idle-in-transaction timeout
closed True broken True
```
`[MEDIDO 2026-09-27, n=1 conexão própria; timeout de 1 s só para caber na medição]`

| alternativa | por que perde |
|---|---|
| `ALTER ROLE cripto_strategy SET …` | **API, writer e coletor usam o mesmo role**: `docker exec deploy-api-1 env` → `POSTGRES_USER=cripto_strategy`, e os três carregam `env_file: ../.env` (`deploy/compose.yml:92-93`, `:135-136`, `:268`). Pegaria o writer e o coletor, que é exatamente o que `D-2` exclui. |
| role dedicado da API (`ALTER ROLE cripto_api SET …`) | É o desenho certo a longo prazo: mínimo privilégio, a API só lê. Custa DDL no Postgres de produção, um segredo novo no `.env` e uma troca de credencial. Isso é ato do owner, e maior que `D-2`. Registrado como follow-up. |
| `options=` no `conninfo` em código | Mesmo efeito, mas exige parâmetro novo no `_postgres_conninfo` compartilhado. O `PGOPTIONS` resolve com 1 linha de `deploy/`, sem código. |
| `PGOPTIONS` no `.env` | O `.env` é o `env_file` das três aplicações e pegaria o writer e o coletor. |

⚠️ **O modo de falha silenciosa deste mecanismo, declarado:** se alguém acrescentar `options=` ao
`conninfo`, o libpq para de ler `PGOPTIONS` **sem avisar**. O falsificador §5.3 existe para pegar isso.
Há também o comentário de `deploy/compose.yml:94-98`, que diz que `APP_HOST` é *"the ONE variable this
service pins"*. O builder tem de atualizar esse comentário.

### 3.2 Valor: `30s`

- Com o §2 no lugar, **nenhum caminho legítimo da API fica ocioso dentro de uma transação**: cada
  statement é a própria transação. O valor é só rede de proteção, e qualquer disparo dele é regressão.
  Ele não precisa de folga para carga legítima.
- O dano que ele limita é o `ALTER` de boot na fila, que para escritor e coletor
  (`ESCALADO-…md:76-99`). Com 30 s, um vazamento futuro segura o `ALTER` por **no máximo ~30 s**. A
  referência é a grade de coleta de 60 s, e o writer drena de fila durável, então ~30 s de parada não
  perde bucket `[INFERRED: fila Redis durável, ADR-009/D2; não medi a drenagem depois de 30 s de lock]`.
- Não fui abaixo de 30 s porque não medi quanto tempo um request longo de `/series-history` passa
  entre dois statements da mesma conexão compartilhada, e isso só importaria se o §2 falhasse
  `[NÃO MEDIDO]`.

### 3.3 `PGAPPNAME=cripto-api`

Custo zero. Dá à consulta de `pg_stat_activity` uma chave estável (`application_name`) no lugar do IP,
que mudou entre 09-19 e 09-27 (§1.3). É também o que torna os falsificadores do §5 não ambíguos.

## 4. ⛔ A ordem importa: o timeout sozinho quebra a API

Com o código de hoje, se o timeout for para produção **antes** do §2:

1. o primeiro `/series-history` abre transação na conexão **B**;
2. 30 s depois do último statement, sem novo request, o Postgres termina a sessão;
3. `psycopg` marca a conexão `closed=True, broken=True` (medido no §3.1). **Nenhum código reabre a
   conexão**: ela é criada uma vez em `create_app` (`src/main/__init__.py:252`);
4. todo `/series-history` seguinte devolve 500 **até o restart**. O serviço não tem `healthcheck:`
   (`deploy/compose.yml:87-122`), e o `restart: unless-stopped` não pega processo vivo que só responde
   erro.

⇒ **O §2 e o §3 entram na mesma PR, e o deploy é um só.** Com o §2, o timeout só dispara numa
regressão. Aí o dano fica **na API** (visível, com nome no log: `IdleInTransactionSessionTimeout`), e
não na ingestão inteira em silêncio. Essa troca é a que `D-2` compra.

**Dívida que já existia e que este desenho não fecha, declarada:** a mesma ausência de reconexão já
derruba a API hoje em qualquer restart do Postgres. Follow-up sugerido, com dono `infra`: reconexão
nas conexões da API (pool `min_size=1` com `check`, ou reabrir em `broken`). **Pegada estimada:**
~0 MB de disco e 1 dependência (`psycopg[pool]`) `[NÃO MEDIDO]`. Fica fora de `D-2`.

## 5. Como provar os dois — cada prova mostra o caso que ela REJEITA

### 5.1 Teste que reproduz o vazamento e reprova antes do conserto (pytest, Postgres efêmero)

Arquivo proposto: `backend/tests/main/test_api_connections_hold_no_transaction.py`, reaproveitando
`_postgres_env` / `_served` de `backend/tests/main/test_create_app_wires_series_window_reader.py:80-135`
e o fixture `postgres_database_factory` (`backend/tests/conftest.py:58`). O container é o da sessão
de teste, **nunca o Postgres compartilhado**.

- **(a) Observável de produção.** `create_app()` com `INGEST_RECORD_BACKEND=postgres`, servido. Faça
  `GET /ready`, `GET /ingest-health`, `GET /collector-status` e `GET /series-history` (este toca
  `read_window` e `read_bounds`). Numa conexão admin separada, rode
  `SELECT count(*) FROM pg_stat_activity WHERE datname = <db do teste> AND state LIKE 'idle in transaction%'`
  e afirme `== 0`. **Afirme também que há ≥ 2 sessões da app nesse `datname`**, porque `0` sobre um
  universo vazio é o `rc=0` ambíguo.
- **(b) O dano, não só o estado.** Na conexão admin, rode
  `SET lock_timeout = '2s'; ALTER TABLE md.series ADD COLUMN IF NOT EXISTS _wi_probe int` e o mesmo em
  `md.ingest_run`. Os dois têm de **passar**. Antes do conserto, reprovam com `LockNotAvailable`.
- **(c) Guarda do "não afeta o writer".** `compose_postgres_connection(env)` e
  `compose_ingest_record_store(env)` **sem** `connect=` devolvem conexão com `autocommit is False`. Se
  alguém mudar o padrão, o teste reprova.
- **Ablação obrigatória, registrada no laudo do QA:** tirar o `connect=connect_autocommit` de
  `src/main/__init__.py:237` faz (a) e (b) reprovarem; tirar o de `:252` faz reprovar pelo menos a
  parte do `md.series`. Um teste que passe dos dois lados não mede nada.
- ⚠️ **Limpeza:** as conexões da app precisam fechar antes do `drop_created()`. Hoje uma transação
  aberta prende o `DROP DATABASE`, e esse é o mesmo bug aparecendo na limpeza do teste.

### 5.2 Teste estático do compose (pytest, sem rede)

Há precedente: `backend/tests/api/test_main_reads_app_host_from_environment.py` já lê `compose.yml`.
Carregue `deploy/compose.yml` e afirme duas coisas:
- `services.api.environment.PGOPTIONS` contém `idle_in_transaction_session_timeout=30s`;
- **`writer` e `collector` NÃO têm `PGOPTIONS`**, e `idle_in_transaction_session_timeout` não aparece no
  `.env.example`.

O caso rejeitado vai no próprio teste: um YAML sintético com `PGOPTIONS` no `writer` tem de reprovar.

### 5.3 Leitura em runtime depois do deploy (portão do deploy, não pytest)

```bash
# 1. a API vê o timeout; o writer e o coletor NÃO (este é o caso rejeitado)
for s in api writer collector; do
  docker exec -w /app -e PYTHONPATH=/app deploy-$s-1 python -c \
   "import os; from src.modules.sentimento.infra.ingest_record_store_composition import compose_postgres_connection as c; \
    k=c(os.environ); print('$s', k.execute('show idle_in_transaction_session_timeout').fetchone()[0]); k.close()"
done
# esperado: api 30s · writer 0 · collector 0

# 2. o processo servidor (não só um exec novo) carrega a variável
docker exec deploy-api-1 sh -c "tr '\0' '\n' < /proc/1/environ | grep -E '^PG(OPTIONS|APPNAME)='"

# 3. o laudo, por application_name e não por IP, com o universo junto
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc \
 "select count(*) filter (where true), count(*) filter (where state like 'idle in transaction%')
    from pg_stat_activity where application_name='cripto-api'"
# esperado: '2|0' (duas sessões da API existem, nenhuma em transação). '0|0' NÃO é verde: a chave não pegou.
```

**Ressalva:** o comando 1 abre uma conexão **nova** no container, com o mesmo env. Ele prova o env
que o libpq herda, não a sessão que já existe. O comando 2 cobre essa lacuna pelo `environ` do PID 1
`[INFERRED: libpq lê PGOPTIONS do ambiente do processo que conecta]`.

### 5.4 O falsificador que fecha o laudo `ESCALADO`

É o do próprio laudo (`ESCALADO-…md:63-67`), agora com chave estável: rodar o comando 3 do §5.3 por
**≥ 2 dias** de operação normal com o painel em uso deve dar `2|0` em toda leitura, e o log da API
deve ter **0** `IdleInTransactionSessionTimeout`. Um disparo do timeout depois do conserto não quer
dizer que o timeout funcionou: quer dizer que **um caminho novo abriu transação**, e essa é a
regressão a caçar.

## 6. O que este desenho não decide

- **`lock_timeout` no `ALTER` de boot + `PYTHONUNBUFFERED=1`** (conserto 2 do laudo, `:112-122`): é a
  outra metade, do lado do **coletor/writer**, e `D-2` não a comprou. Continua recomendada, porque
  troca *parada silenciosa* por *erro com nome* contra **qualquer** cliente, não só a API.
- **`default_transaction_read_only=on` no `PGOPTIONS` da API:** é uma guarda barata, já que
  `create_app` não chama nenhum método de escrita. Fica fora de `D-2`, e o builder só deve adotá-la se
  a suíte de API passar com ela.
- **Role dedicado da API e reconexão:** follow-ups do §3.1 e do §4.
- **Disco a 99%** (`DECISOES-DO-OWNER-2026-09-27.md:27-28`): este desenho não ocupa disco.

## 7. Falsificador deste desenho

Se, com §2 e §3 no ar, o comando 3 do §5.3 mostrar uma sessão `cripto-api` em `idle in transaction`
por mais de 30 s, então o mecanismo do §3.1 não pegou: foi sobrescrito por `options=` ou o env não
chegou ao processo. Se mostrar `idle in transaction` por menos de 30 s de forma recorrente, então há um
caminho da API que abre transação sem o `connect_autocommit`, e o §1 não é a causa inteira.
