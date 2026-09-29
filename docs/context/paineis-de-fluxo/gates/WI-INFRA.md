# WI-INFRA — veredito do `infra-architect` sobre a trilha WI (idle-in-transaction da API)

**Diff:** `master...wave/api-idle-tx`, código em `83e7a78` (a branch avançou para `c894848` com os laudos
WI-REVIEW e WI-CODE-REVIEW, só docs). **Contra:** `handoff/WI-desenho-infra-architect.md` e `D-2` de
`DECISOES-DO-OWNER-2026-09-27.md` `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`.
**Data:** 2026-09-27. Nenhum `gate-record` rodado.

## Veredito: APPROVED, com 2 condições de deploy (§4)

1. **Segue o desenho:** sim, nos 3 pontos (§1).
2. **O timeout não atinge coletor/writer:** sim, em código, no compose e no runtime de hoje (§2).
3. **O deploy é seguro:** sim, **se** a API subir primeiro e sozinha. Um `up -d --build` dos três de uma
   vez recria writer e coletor, e o `ALTER` de boot deles pode enfileirar atrás da API velha (§3).

## 1. Aderência ao desenho

| item do desenho | implementado | evidência |
|---|---|---|
| §2 `connect_autocommit` em `infra`, `psycopg.connect(conninfo, autocommit=True)` | sim | `ingest_record_store_composition.py:183-199` |
| §2 as 2 conexões de `create_app` injetadas | sim | `src/main/__init__.py:243` (conn A) e `:260` (conn B) |
| §2 o padrão das funções de composição continua `psycopg.connect` | sim | `:205`, `:243`. Guardado por `test_default_composition_stays_transactional_for_writer_and_collector` |
| §3.1 `PGOPTIONS` + `PGAPPNAME` só em `services.api.environment` | sim | `deploy/compose.yml`, bloco `api`. O comentário "*the ONE variable*" foi atualizado nos 2 lugares |
| §5.1 teste de estado, teste de dano (`ALTER` sob `lock_timeout`), guarda do padrão | sim | `tests/main/test_api_connections_hold_no_transaction.py` |
| §5.2 teste estático com caso rejeitado | sim | `tests/main/test_compose_api_idle_transaction_timeout.py:75,85,94` (writer, api sem timeout, forma lista no collector) |

**No caminho de leitura, nada depende de transação.** Quando a conexão vira `autocommit`, 3 construções
mudariam de comportamento: cursor nomeado (`DECLARE` exige bloco de transação), `.transaction()` e
`SET LOCAL`. O caminho de leitura não tem nenhuma delas:
`grep -rn "cursor(\s*name|withhold|\.transaction()|\.pipeline()|SET LOCAL|set_config("` sobre
`postgres_series_window_reader.py`, `postgres_ingest_record_store.py`, `src/main` e `src/api` devolve
**0 linhas** `[MEDIDO]`. A API não chama `initialise()`, então **ela não roda DDL no boot**:
`grep -rn "initialise()" backend/src` devolve 0 ocorrências em `src/main`/`src/api` `[MEDIDO, n=17 linhas]`.

### 1.1 Medições (as minhas, não as do builder)

`make test-fast K="hold_no_transaction or idle_transaction_timeout"` → **10 passed** `[MEDIDO]`.

**Ablação.** O `__pycache__` foi purgado antes de cada rodada, e a árvore estava limpa antes e depois
(`git diff --quiet`):

| mutação | resultado |
|---|---|
| tirar o `connect=` de `:243` (conn A) | `…boot_alter[md.ingest_run]` **FAILED** (`LockNotAvailable`). Na 1ª rodada, `…idle_in_transaction` também FAILED |
| tirar o `connect=` de `:260` (conn B) | `…idle_in_transaction` + `…boot_alter[md.series]` **FAILED**, 2 failed |

Cada call site morde a tabela que a sua conexão lê. É o desenho §5.1 exatamente.

⚠️ **Contaminação declarada.** A 1ª rodada da mutação de `:243` acusou `md.series`, e não `md.ingest_run`.
A worktree estava sendo mutada **ao mesmo tempo** pelo WI-CODE-REVIEW (`c894848`: *"mutações A/B nos 2 call
sites"*). Repeti a rodada isolada e ela deu o resultado acima. **Três portões mutando a mesma worktree em
paralelo produzem medição cruzada.** O orquestrador deveria serializar ablação por worktree.

**Sonda de locks.** Arquivo temporário, apagado e nunca commitado. Usei `monkeypatch` de
`src.main.connect_autocommit → psycopg.connect`, no Postgres efêmero da suíte:
- **master:** as 2 sessões ficam `idle in transaction`. A conn A retém `AccessShareLock` em
  `ingest_run`, `ingest_run_pkey`, `ingest_gap`, `ingest_gap_pkey`, `information_schema.tables`/`schemata`.
  A conn B retém em `series`, `series_pkey`, `series_bucket_end_idx`.
- **fixed:** as 2 sessões ficam `idle`, com **0** locks de relação.

`[MEDIDO, n=2 sessões por variante]`

## 2. O timeout não alcança writer nem coletor

- **Código.** O writer abre a própria conexão (`single_writer_cli.py:293`, `psycopg.connect`) e o coletor
  usa o padrão (`collectors_cli.py:2909`). Nenhum dos dois ganhou `connect=`.
- **Compose.** `PGOPTIONS` existe só em `services.api.environment`. O `.env`, que é o `env_file` dos três,
  não foi tocado.
- **Runtime de hoje, antes do deploy.** `docker exec deploy-{api,writer,collector}-1 printenv PGOPTIONS`
  devolve vazio nos 3 `[MEDIDO 2026-09-27]`. Então o `.env` real **não** carrega `PGOPTIONS`, e a variável
  só chega aonde o compose a põe. O teste estático cobre `.env.example`, não o `.env` real (gitignored).
  Essa lacuna fecha pelo comando 1 do §5.3 do desenho depois do deploy.
- **O backfill profundo roda pelo serviço `collector`** (`deploy/compose.yml:303`,
  `compose run --rm --no-deps collector …klines_backfill_cli`), então também não herda o timeout.
  **Resíduo `[INFERRED]`:** qualquer CLI de escrita rodado com `compose run api …` herdaria os 30 s. Hoje
  nenhum documento faz isso. `grep` por `compose … run/exec … api` e `docker exec deploy-api-1 … _cli` em
  `docs deploy Makefile scripts` devolve **0 linhas** `[MEDIDO]`.
- **O timeout não mata sessão `idle` fora de transação.** Só mata `idle in transaction`. Com `autocommit`,
  a API não entra nesse estado (sonda "fixed" acima), então o timeout só dispara numa regressão, como o
  desenho §3.2 diz.

## 3. Deploy: migração de boot e restart

**O estado de produção agora.** `pg_stat_activity` mostra a sessão `172.18.0.3` (API)
`idle in transaction` há **29 min**, em `SELECT MIN(bucket_end)…` (conn B), e a outra sessão da API `idle`
`[MEDIDO 2026-09-27]`. O vazamento está vivo e reproduz o desenho §1.3.

**Por que a ordem importa.** `api`, `writer` e `collector` têm `build:` próprio, com o mesmo contexto
`../backend`. São 3 imagens: `deploy-api`, `deploy-writer`, `deploy-collector`, **233 MB cada**
`[MEDIDO: docker image ls]`. Como `backend/src` mudou, um `docker compose up -d --build` recria **os três**.
No boot, writer e coletor rodam `initialise()` (`single_writer_cli.py:554`, `collectors_cli.py:2918`),
que inclui `ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS …` (`postgres_ingest_record_store.py:151,158`).
Esse `ALTER` pede `AccessExclusiveLock` mesmo quando a coluna já existe, e **nenhum** caminho de `src` define
`lock_timeout` (`grep -rn "lock_timeout" backend/src` → 0 `[MEDIDO]`). Se a API **velha** estiver com a
conn A em transação nesse instante, é exatamente o incidente de 2026-09-20. A recriação em paralelo não
garante que a API velha morra antes `[INFERRED: sem depends_on entre os três]`.

**Restart da API.** Parar a API velha encerra as 2 sessões e solta os locks. A API nova nasce com
`autocommit`. Com `PGOPTIONS`, o `ALTER` de outro cliente espera no máximo a duração de 1 statement da API.
A dívida de reconexão (desenho §4) continua: um restart do Postgres ou um disparo do timeout deixa a API
em 500 até o restart, e não há `healthcheck:`. Isso já existia, não piora, e é follow-up.

## 4. Condições de deploy (o que torna o "sim" do §3 verdadeiro)

1. **A API primeiro, e sozinha:**
   `docker compose -f deploy/compose.yml up -d --build --no-deps api`.
   Writer e coletor **não precisam** ser recriados: o comportamento deles é idêntico, porque o padrão de
   `connect` não mudou. Se forem recriados, que seja **depois** de o passo 2 dar verde.
2. **O portão do deploy é o §5.3 do desenho**, com os 3 comandos:
   - `show idle_in_transaction_session_timeout` deve dar `api 30s · writer 0 · collector 0`;
   - `/proc/1/environ` da API deve conter `PGOPTIONS`/`PGAPPNAME`;
   - `application_name='cripto-api'` deve dar `2|0`. **`0|0` não é verde.**

   Depois disso, o falsificador §5.4 roda por ≥ 2 dias.

**Pegada.** 0 MB persistente, 0 processo e 0 container novos. O rebuild só da API invalida o
`COPY . .` (3,18 MB) **e** o `poetry install` que vem depois dele (43,3 MB)
`[MEDIDO: docker history deploy-api]`. Isso dá ≈ **47 MB** de camada nova no disco da VPS, que hoje está
a **99%, com 3,7 GB livres** `[MEDIDO: df -h /]`. A imagem velha vira dangling: já são 60 imagens dangling
`[MEDIDO: docker image ls -f dangling=true -q | wc -l]`. `docker image prune -f` depois do deploy devolve
esse espaço. Quanto ele devolve eu **não medi** `[NÃO MEDIDO]`. Recriar os três sem necessidade
multiplicaria a camada nova, até ≈ 140 MB `[INFERRED: sem cache compartilhado entre os 3 builds]`.

## 5. Fora de escopo, e continua recomendado

- `lock_timeout` no `ALTER` de boot do writer/coletor (desenho §6). É a metade que protege contra
  **qualquer** cliente, e não só a API. Dono: `infra`, e `D-2` não a comprou.
- Reconexão da API e role dedicado (desenho §3.1/§4).
- Mudar a ordem do `Dockerfile` (`poetry install` antes de `COPY . .`) derrubaria o custo de cada rebuild
  de ≈ 47 MB para ≈ 3 MB. É barato para uma VPS a 99%. Follow-up `infra`, e não é desta trilha.

## Falsificador deste laudo

Se, depois do deploy feito conforme o §4, o comando 3 do §5.3 der qualquer valor diferente de `2|0`, ou o
comando 1 mostrar `30s` no writer ou no coletor, este APPROVED estava errado. No primeiro caso, o mecanismo
não pegou. No segundo, o timeout vazou para quem `D-2` exclui.
