# ADR-031 — Motor do registro `md.ingest_run`/`md.ingest_gap` em produção: Postgres por adaptador, escrito por quem observa; e a imagem que carrega o candidato 4

**Data:** 2026-09-07 · **Status:** **aceita** — o owner deu `approve spec` em `captura-em-producao` (`2026-09-07T18:23:31Z`, `harness pipeline show captura-em-producao`) e a co-assinatura do `quant-architect` está satisfeita — [`gates/Q3-run-definition.md`](../context/captura-em-producao/gates/Q3-run-definition.md) (§7) decide o que `D3` grava. **Flip formal de `Status` executado por `T-01.9`** (fase `01`, `docs`), conforme este parágrafo previa. **Co-assinatura do `infra-architect`** (a imagem e o serviço `postgres` são `infra`) segue com `T-03.6` — gate de `F3` que decide `[Q6]`/`P8`; não bloqueia esta transição porque `D1`/`D3` (motor e escritor) são do `quant-architect`, e `D2` (imagem) já está ancorada em `ADR-002/D4`.
**Feature:** `captura-em-producao` (filha de `plataforma-dados`) · **Fecha:** `PRD-004` `RN-3`/`M2`/`[GAP G4]` (motor do registro) e `[Q5]`/`[GAP G3]` (imagem) · **Emenda de:** `ADR-014/D1` (SQLite provisório em F0 — os gatilhos `G-A` e `G-B` de `D1e` disparados) e `ADR-002/D1` (aplicação, não reabertura) · **Rev de ancoragem:** `master@0acf947`.
**Componentes:** `sentimento` (adaptador, composição dos CLIs) · `infra` (composição em `src.main`, imagem do serviço `postgres`).

## Contexto — a dívida órfã encontrou o seu foro

`ADR-002/D1` decide que catálogo e registro (`md.ingest_run`, `md.ingest_gap`) vivem em **PostgreSQL**; `ADR-014/D1` manteve **SQLite** em F0 com três gatilhos de reabertura (`D1e`) e chamou a divergência de *"dívida órfã sem foro"* (`D1f`). Em `0acf947` `[MEDIDO 2026-09-07, gates/PRD-004-architect.md §1]`:

- **`G-A` disparou:** `grep -nE 'psycopg' backend/pyproject.toml` → `:64 psycopg[binary] (==3.3.5)` (entrou por `T-08.4`, `ADR-021`) — o custo do adaptador caiu a ~zero, e *"manter SQLite passa a ser escolha, e escolha precisa de argumento novo"* (`ADR-014/D1e`, literal).
- **`G-B` dispara com esta feature:** o coletor (grava runs) e a API (lê runs) passam a ser **dois containers**. `ADR-014/FA-7` já dizia: *"SQLite sobrevive a escritor único e não a dois"* — e o probe NTP (`ntp_skew_probe_cli.py:120`) **já** grava o mesmo registro por um terceiro processo.
- **A API em compose lê um SQLite efêmero e vazio:** `api` não monta volume (`grep -n volumes deploy/compose.yml` sob `api:` → nada), e `src.main:144` constrói `SqliteIngestRecordStore(INGEST_HEALTH_STORE_PATH)` — a **única** implementação de `IngestRecordSource` (`grep -rn 'class .*RecordStore' backend/src` → 1).
- **Só há uma imagem de Postgres medida para o candidato 4:** `ADR-002` (emenda `D4`, 2026-09-04) decidiu *"TimescaleDB em `postgres:15`"* e mediu contra `timescale/timescaledb:2.17.2-pg15` (`ADR-002:172`); `deploy/compose.yml:28` declara `postgres:16-alpine`, **sem extensão**, escrito antes de `D4` (`T-02.6`).
- **Premissa de recurso:** *"banco: só o Postgres"* `[PREMISSA-OWNER, reafirmada 2026-09-03; .claude/agents/infra-architect.md §premissas]` — nenhum motor novo entra.

## Decisão

### D1 · O registro em produção é **Postgres**, alcançado por **um adaptador** que implementa a mesma porta que o SQLite implementa hoje

`PostgresIngestRecordStore` nasce em `backend/src/modules/sentimento/infra/` com **a mesma superfície** de `SqliteIngestRecordStore` (`sqlite_ingest_record_store.py:176-271`): `initialise()`, `record_run(IngestRun)`, `record_gap(IngestGap)`, `describe_readiness() -> (bool, bool)`, `runs()`, `gaps()`. A porta de leitura continua sendo `IngestRecordSource` (`use_cases/ingest_health.py:24` — `runs()`/`gaps()`), **intocada**; `ingest_health_query`, `collector_status` e as 4 fórmulas de `ADR-030` não sabem qual motor as alimenta.

- **Conexão injetada, nunca aberta pelo adaptador** — mesma forma de `PostgresRunRegistryStore.__init__(connection)` (`backtest/infra/postgres_run_registry_store.py:104-114`, `ADR-021`). Quem abre é o composition root (`src.main`, `single_writer_cli`, `collectors_cli`).
- **Escolha do motor por configuração explícita, não por adivinhação:** `INGEST_RECORD_BACKEND` ∈ {`sqlite`, `postgres`}, default **`sqlite`** — dev e a suíte de testes **não mudam**; os dois alvos de compose fixam `postgres`. Valor fora do conjunto ⇒ `create_app`/CLI **recusa subir** com mensagem em inglês nomeando a variável (`ADR-029/D3`, `PRD-004 RN-4`).
- **Schema:** `initialise()` é idempotente (`CREATE SCHEMA IF NOT EXISTS md` + `CREATE TABLE IF NOT EXISTS md.ingest_run` com **16 colunas**, uma por campo do dataclass `IngestRun` `[MEDIDO 2026-09-07: dataclasses.fields → 16]`, PK `run_id`; `md.ingest_gap` com **8**). Os valores são gravados **RAW, exatamente como observados** — mesma doutrina do docstring de `IngestRun`; nenhuma coerção no adaptador.
- **Propriedade de equivalência (o teste que prova que o adaptador não inventa):** para o mesmo conjunto de `IngestRun`/`IngestGap` gravado nos dois stores, `ingest_health_query(postgres).fingerprint() == ingest_health_query(sqlite).fingerprint()` — o `sha256` de `ADR-008/DoD-2` é o juiz, e ele **não muda** com o motor.
- **`/ready` mantém a forma de `SPEC-003 §3.4`:** `{"store":{"path":…,"exists":…,"schema_present":…}}`; com Postgres, `path` é a DSN **sem senha** (`postgresql://<user>@<host>:<port>/<db>`), `exists` = conexão aceita, `schema_present` = as duas tabelas existem. **Segredo nunca aparece no corpo** (`core.hardcoded-secret` não alcança respostas HTTP — a garantia aqui é de desenho, e o DoD a mede).

### D2 · A imagem do serviço `postgres`, nos dois alvos, é `timescale/timescaledb:2.17.2-pg15` — `[INFERRED]`, pendente de `approve spec`

É a **única** imagem contra a qual os cinco critérios de `ADR-002/D4` foram medidos (`ADR-002:172`); `postgres:16-alpine` (hoje) não carrega a extensão que o sink da série exige em F2, e `postgres:15` puro também não. **Custo de reverter:** 1 linha em `deploy/compose.yml` + recriar o volume `postgres_data` — **zero hoje** (nada implantado, volume vazio; `NG-1`), **não-zero após `M3`** (diretório de dados pg16 ≠ pg15).

O que **não** decide: se a VPS usará o `postgres` do compose ou a *"instância que já está de pé"* de `ADR-002/D1` `[NÃO SEI]` — isso é implantação (`M3`, owner); se for a instância compartilhada, instalar a extensão nela é a *"tarefa de infra separada"* que a emenda `D4` já nomeia (item 2).

### D3 · Quem grava `md.ingest_run` é **quem observa** — o processo coletor, direto no registro, não via Stream

`ADR-002/D5` promete escritor único **para a série** (*"o único processo que toca a série"*, `ADR-027/D1`); o registro é OLTP e **já** tem vários escritores por desenho (`ingest_health_cli`, `clock_skew_tolerance_cli`, `ntp_skew_probe_cli`). O coletor registra a **sessão/ciclo** através do mesmo adaptador de `D1`, no fechamento dela. A definição de *"um run"* para stream contínuo é `[Q3]`, do `quant-architect` (`SPEC-004 §3.3`).

## Alternativas recusadas — com o custo

| alternativa | custo medido ou declarado | por que perde |
|---|---|---|
| **`M2(b)` — SQLite em volume compartilhado entre `collector`, `api` (e os probes)** | 0 código; **1 host só** por construção; SQLite sobre volume Docker com ≥ 2 escritores em containers distintos depende de `fcntl` atravessar o driver do volume — não medido aqui, e `ADR-014/FA-7` já derruba *"dois escritores"* por argumento; deixa `G-A`/`G-B` disparados sem resposta (a dívida continua órfã) | contraria `ADR-002/D1` sem argumento novo, que é exatamente o que `D1e` exige |
| **Registro de run viaja pelo Stream e o escritor único o persiste** | +1 tipo de mensagem no wire (o wire de `SeriesRow` ainda nem existe); frescor do painel passa a depender do dreno da fila; o escritor da série vira também escritor do registro — alargamento de `ADR-002/D5` | acopla observabilidade ao caminho de dado; `D3` mantém o registro onde ele já está |
| **A API expõe `POST` para o coletor registrar runs** | rota de escrita numa API só-leitura (`ADR-005`, `ADR-029`); autenticação inexistente (`ADR-029/D6` em aberto) | cria superfície de escrita que ninguém pediu |
| **Manter `postgres:16-alpine` e instalar a extensão no Dockerfile/entrypoint** | não medido pelo spike (`ADR-002` emenda `D4`, item 2: *"migração in place… não testada"*); versão maior diferente da medida | troca medição por esperança |
| **Motor novo para o registro (SQLite server, DuckDB, etc.)** | viola `[PREMISSA-OWNER]` *"só o Postgres"* | fora por premissa |

## Falsificadores

| # | observação que derruba | o que derruba |
|---|---|---|
| **F1** | o teste de equivalência de `D1` reprova: mesmo conjunto de runs, `fingerprint()` diferente entre os dois stores | **D1** — o adaptador altera o dado (coerção, ordem, `NULL`) |
| **F2** | alvo local de pé, `CA-F1-4` verde (runs gravados), e `GET /collector-status` `n_rows` **não** cresce | **D1**/composição — API e coletor não leem o mesmo registro |
| **F3** | `docker stats` do `collector` com a conexão Postgres aberta excede **+10 MB RSS** sobre o CLI standalone (23,2 MB, `ADR-027:59-65`) | **D3** — o custo de o coletor falar Postgres não era desprezível; reabre "via Stream" |
| **F4** | `timescale/timescaledb:2.17.2-pg15` reprova qualquer dos cinco critérios de `ADR-002/D4` ao rodar o spike de novo em compose | **D2** — a imagem medida não é a imagem que roda |
| **F5** | `lint-imports` (contrato *"o motor não vaza para fora de infra"*, `pyproject.toml:326-333`) reprova após a fase | **D1** — o adaptador vazou `psycopg` para `use_cases`/`domain`; não é opção, é portão |

## Consequências

- `ADR-014/D1` **fecha para produção**: SQLite continua em dev/teste por `INGEST_RECORD_BACKEND=sqlite` (default); nenhuma fixture muda. `D1e`/`D1f` deixam de ser dívida.
- `INGEST_HEALTH_STORE_PATH` continua válido para `sqlite`; em `postgres` é ignorado — e a SPEC exige que a combinação `postgres` + `INGEST_HEALTH_STORE_PATH` presente **não** seja erro (variável herdada do `.env.example` de `SPEC-003`).
- Nenhuma `[[rules.own]]` nova: a fronteira que importa (psycopg só em `infra`) **já é portão** por `import-linter`, e este repositório não declara regra sem corpus (`CLAUDE.md`).
- O falsificador `F3` é a única medição nova que esta ADR pede; ela cabe em `CA-F3-8` (`docker stats` após 10 min).
