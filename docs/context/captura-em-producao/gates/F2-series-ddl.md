# Gate `quant-architect` sobre a DDL de `md.series` + `[Q10]` (`captura-em-producao`, `F2`)

**Assina:** `quant-architect`. **Data:** 2026-09-08. **Fecha:** `SPEC-004` §3.4 ("tabela da série:
`TBD` do `quant-architect` em `gates/F2-series-ddl.md`"), `plano 02` itens `2.1` + `2.9`, `T-02.1`
(`docs/context/captura-em-producao/tasks.toml:207-223`). **Pré-condição de fechamento de `F2`**
(`D2.2`: sem este arquivo com uma chave de unicidade declarada, `D2.4` — restart sem perda nem
duplicata — não tem chave para medir contra).

**Não reabre** `ADR-002/D4` (finalista de motor, já decidido: TimescaleDB em `postgres:15`/`pg15`).
**Não implementa alarme** (`NG-7`) — este arquivo decide contrato e regra de negócio, não observa
disparo de página. **Não redecide** o layout de partição de conexão WebSocket que `T-07.6`
(`stream_partitioning.py`/`stream_partition_plan.py`) e `T-07.8` (`universe_at(ts, filtro)`) da mãe
já fixaram (§6 abaixo) — esse layout é ortogonal a este e permanece intocado.

---

## 1. Nome da tabela

```
md.series
```

Mesmo schema catalográfico de `md.ingest_run`, `md.ingest_gap` (`ADR-014/D1a`, hoje SQLite por
divergência declarada) e `md.partition_registry` (`ADR-002/D6c`) — `md` é o namespace que este
módulo (`sentimento`) já usa para dado de proveniência e registro. `series` porque a tabela guarda
exatamente as linhas que `write_series_row` (`use_cases/write_series_row.py`) decide aceitar: um
`SeriesRow` por linha, nunca um agregado.

## 2. DDL — verificada contra TimescaleDB real, não apenas lida

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE SCHEMA IF NOT EXISTS md;

CREATE TABLE IF NOT EXISTS md.series (
    series_key_id       TEXT   NOT NULL,
    symbol              TEXT   NOT NULL,
    source              TEXT   NOT NULL,
    bucket_end          BIGINT NOT NULL,
    event_time          BIGINT NOT NULL,
    available_at        BIGINT NOT NULL,
    availability_source TEXT   NOT NULL CHECK (availability_source IN ('OBSERVED', 'MODELED')),
    ingested_at         BIGINT NOT NULL,
    observed_at         BIGINT NOT NULL,
    provenance          TEXT   NOT NULL
                         CHECK (provenance IN ('OBSERVADO', 'DERIVADO', 'MODELADO', 'HUMANO')),
    src_label_raw       TEXT   NOT NULL,
    observer_id         TEXT   NOT NULL,
    observer_region     TEXT   NOT NULL,
    is_final            BOOLEAN,
    principal_id        TEXT,
    CHECK (provenance <> 'HUMANO' OR (principal_id IS NOT NULL AND btrim(principal_id) <> '')),
    PRIMARY KEY (series_key_id, symbol, source, bucket_end, observed_at)
);

SELECT create_hypertable(
    'md.series', 'bucket_end',
    chunk_time_interval => 604800000,  -- 7 dias em ms — ver §5 pela justificativa e o risco nomeado
    if_not_exists => TRUE
);
```

As 15 colunas são as 15 de `SeriesRow` (`domain/provenance.py:164-178`), **sem adição nem omissão** —
`event_time`/`available_at`/`ingested_at`/`observed_at`/`bucket_end` ficam `BIGINT` (epoch ms), nunca
`TIMESTAMPTZ`: o próprio domínio já decidiu isso e nomeou o motivo
(`provenance.py:9-19`, *"the layer may not ask what time it is… `int` is totally ordered, `min` over
it is exact, and there is no parse, no locale and no timezone in the path"*) — converter para
`TIMESTAMPTZ` na borda de persistência reabriria exatamente o problema que o domínio fechou, calado.
`availability_source` guarda os valores EM INGLÊS do enum (`AvailabilitySource.OBSERVED.value ==
"OBSERVED"`); `provenance` guarda os valores EM PORTUGUÊS do enum (`Provenance.OBSERVED.value ==
"OBSERVADO"`) — os dois `CHECK` transcrevem os conjuntos fechados de `domain/provenance.py:73-94` e
`:120-136` **exatamente como o domínio os define**, não como uma tradução nova.

**Verificação real, não apenas leitura do SQL** — `[MEDIDO 2026-09-08]`, comando:

```bash
docker run -d --rm --name t021-verify -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
    -p 55432:5432 timescale/timescaledb:2.17.2-pg15
# aguardar pg_isready, depois:
docker exec -i t021-verify psql -U postgres -d test < t021_ddl.sql
```

Resultado: `CREATE EXTENSION` (já presente na imagem) · `CREATE SCHEMA` · `CREATE TABLE` ·
`create_hypertable` devolve `(1,md,series,t)` — hypertable criada com 1 dimensão sobre `bucket_end`
· duas inserções **idênticas** na chave (`series_key_id, symbol, source, bucket_end, observed_at`)
com `ON CONFLICT … DO NOTHING` deixam **1** linha (`n_rows = 1`) — a mesma propriedade que `D2.4`
(`T-02.2`) vai medir com o processo real (`kill -9` a meio) · uma tentativa de `provenance = 'HUMANO'`
com `principal_id = NULL` dispara `check_violation`, confirmado por um bloco `DO $$ … EXCEPTION WHEN
check_violation`. O script completo (`t021_ddl.sql`) é reproduzível a partir do SQL acima; não é
versionado neste commit por ser script de verificação pontual, não artefato de produto — o SQL da
tabela em si (este §2) **é** o artefato, e quem implementar `T-02.2` cola daqui.

## 3. Chave de unicidade declarada

```
PRIMARY KEY (series_key_id, symbol, source, bucket_end, observed_at)
```

Transcrita de `domain/provenance.py:147-151` (docstring de `SeriesRow`): *"KEY (`SPEC-001` §3.2):
`(series_key_id, symbol, source, bucket_end, observed_at)`, and the table is APPEND-ONLY"*. TimescaleDB
exige que toda chave de unicidade sobre uma hypertable inclua a coluna de particionamento
(`bucket_end`) — já é o caso aqui, sem alteração da chave do domínio.

**Esta é a chave que `T-02.2`/`D2.4` usa para o upsert-noop** (`ON CONFLICT (…) DO NOTHING` ou
equivalente) — reentrega da mesma mensagem via `read_pending` após `kill -9` produz **o mesmo
`observed_at`** (o valor está NO payload redelivered, não é gerado de novo pelo sink), logo cai na
mesma chave e não duplica. Isto é o que a verificação de §2 já confirmou fora do contexto do sink real.

## 4. `provenance` como coluna

Já no `CREATE TABLE` de §2 — `provenance TEXT NOT NULL CHECK (...)`. Não há decisão adicional aqui:
`CA-E2E-2` (que `SPEC-004` §3.4 cita) só precisa que a coluna exista e carregue o valor do enum, o
que a DDL acima faz.

## 5. `compaction_epoch` / `content_hash` (`ADR-002/D6` emenda) — NÃO são colunas de `md.series`

**Decisão, e ela é a leitura literal de `ADR-002/D6c`, não uma criada aqui:** as duas colunas vivem
em `md.partition_registry`, uma tabela **separada**, dona também de `sentimento`, já com domínio
implementado (`domain/partition_registry.py`) e adaptador SQLite
(`infra/sqlite_partition_registry_store.py:91-98`):

```sql
-- ja existe hoje (SQLite); a versao Postgres NAO e desta task (ver "o que fica para outra task")
md.partition_registry ( series_key_id, symbol, source, partition_key,
                         compaction_epoch, content_hash, row_count,
                         last_compacted_at, last_written_at, updated_at )
```

`compaction_epoch` e `content_hash` descrevem a **partição de reprodutibilidade**
(`(series_key_id, symbol, source, partition_key)`, `ADR-002/D6b`) — uma unidade DECLARADA na
aplicação, deliberadamente **desacoplada** de `chunk_time_interval` (o parâmetro físico de §2/§5.1
abaixo). Colar as duas colunas em `md.series` misturaria a unidade de reprodutibilidade (mês UTC,
por exemplo) com a unidade de armazenamento físico (o chunk), que é exatamente o acoplamento que
`ADR-002/D6b` recusa por nome: *"se 'partição' == 'chunk físico', a próxima vez que alguém retunar
`chunk_time_interval` … redefine em silêncio o que 'partição' significa para todo `run_registry` já
emitido"*. `md.series` não carrega as duas colunas; `md.partition_registry` sim, e permanece a fonte
única delas.

**O que falta, nomeado, não escondido:** um adaptador Postgres para `md.partition_registry`
(`postgres_partition_registry_store.py`) não existe em nenhuma task de `captura-em-producao`
`[MEDIDO: grep -c partition_registry docs/context/captura-em-producao/tasks.toml → 0]`. Isto não
bloqueia `F2` — nenhum requisito de `SPEC-004`/`PRD-004` lê `md.partition_registry` em produção
ainda, e construí-lo sem consumidor seria a "construção especulativa" que `ADR-027` recusa (mesmo
argumento de `Q3-run-definition.md` §5 para `P9`). **Gatilho de reabertura:** o dia em que uma task
(desta feature ou de outra) precisar CALCULAR ou LER `compaction_epoch`/`content_hash` de dados
gravados por `PostgresSeriesSink` — nesse momento alguém escreve o adaptador Postgres análogo ao
SQLite existente, reusando o mesmo `domain/partition_registry.py` sem alteração de contrato.

### 5.1. `chunk_time_interval` — dimensionamento, com o risco de reusar o número do spike nomeado

**Decisão: `604800000` ms = 7 dias**, não os 45 dias que `ADR-002/D4` (emenda 2026-09-04) mediu.
**Motivo de não reusar o número do spike:** aquele valor foi calibrado sobre um dataset de **~35 mil
linhas em 31 dias** (BTCUSDT `metrics` + 1 dia de `aggTrades`, `T-08.1`). A vazão real medida por
`T-01.8`/`CA-F1-5` para **esta** série (`medicoes/CA-F1-5-vazao-24h.md`) é **~1 296 000 linhas/dia**
só de `premiumIndex` (900 símbolos × 1440 ciclos/dia, `[MEDIDO 2026-09-08T01:35:21Z]`) — quase **duas
ordens de grandeza acima** do volume total que o spike testou. Um chunk de 45 dias sobre este volume
teria da ordem de `1,3M × 45 ≈ 58,5M` linhas antes da primeira compressão — nenhuma medição desta
árvore cobre `compress_chunk` nessa ordem de grandeza, e ela é precisamente o cenário que `ADR-002/D4`
(emenda, ponto 3) nomeou como fora do que o spike testou: *"se o candidato 4 também precisar hospedar
séries [de volume maior], isso é um spike novo, não coberto por esta emenda"*.

`604800000` (7 dias) é um **ponto de partida `[OPINIÃO/INFERRED: quant-architect, 2026-09-08]`**,
não uma medição: reduz o chunk não comprimido para a ordem de `1,3M × 7 ≈ 9,1M` linhas, mais perto
(embora ainda acima) da ordem de grandeza que o spike validou, sem multiplicar por 45 um volume que
o spike nunca viu. **`ADR-002/D6b` já declara que isto é parâmetro de operação, não característica
do motor** — retunar depois não invalida nenhum `run_registry` já emitido, porque a unidade de
reprodutibilidade é `partition_key` (§5), não o chunk.

**Gatilho de reabertura, nomeado:** rodar o equivalente de `T-08.1` (critério de espaço ≤ 2× zipado,
critério de leitura ≤ 60s) contra um volume real ou sintético da ordem de `10⁶`–`10⁷` linhas/dia antes
de fixar este número para produção — isto não é bloqueante de `F2` (nenhuma task desta feature grava
volume real ainda; o Postgres de `F2` é efêmero, de teste) mas é bloqueante recomendado antes de `F3`
subir o compose com dado de produção real, porque é aí que o volume citado aqui passa a se acumular
de verdade.

## 6. Layout de partição de `T-07.6`/`T-07.8` da mãe — respeitado por não ser tocado

**Estes dois não são sobre armazenamento.** `T-07.6` (`domain/stream_partitioning.py` +
`infra/stream_partition_plan.py`, `gates/T-07.6-builder.md`) decide quantas conexões WebSocket
abrir e como distribuir símbolos entre elas, dimensionado contra a vazão medida por símbolo
(`D7.11`: p50 21 · p95 204 · p99 483 · p99.9 1.251 · máx 3.224 msg/s). `T-07.8`
(`use_cases/universe_at` ou equivalente) decide qual `universe_source` é admissível por tipo no
caminho de decisão do universo de símbolos. Nenhum dos dois nomeia uma partição de tabela SQL — a
frase "layout de partição" nos dois títulos é sobre **conexão/símbolo**, não sobre **chunk/tabela**.

Esta gate (`T-02.1`) é `docs`-only: zero linha tocada em `stream_partitioning.py`,
`stream_partition_plan.py`, ou no código de universo. O layout que `T-07.6`/`T-07.8` fixaram continua
exatamente como está — "respeitado" aqui significa "não redecidido, não sobreposto por um segundo
conceito de partição com o mesmo nome", que é a mesma cautela que a nota de `T-07.16`
(mãe, superseded) já registrava: *"NAO decide layout de particao alem do que T-07.6/T-07.8 ja
fixaram"*.

---

## 7. `[Q10]` — `md.ingest_gap` por reconexão, e o destino final de mensagem envenenada (`B7`)

### 7.1. O escritor grava `md.ingest_gap` por reconexão? **Decisão: NÃO, não em `F2`.**

**Razões:**

1. **Reconexão é evento do lado do coletor, não do escritor.** `reconnect_and_key`/
   `perform_overlap_handoff` (`use_cases/reconnect_force_order_stream.py:46-72`) vivem em `F1`
   (fechada, mergeada). O escritor único (`single_writer_cli`, `F2`) só lê o Stream — ele nunca
   vê uma sessão WebSocket fechar ou reabrir; só vê `SeriesRow`s chegando. Fazer o escritor
   "detectar reconexão" exigiria contexto que ele estruturalmente não tem (cadência esperada por
   `series_key_id`, calendário de sessões) e reabriria `F1` pela porta de trás — que este gate
   está explicitamente proibido de fazer.
2. **Zero call site de produção hoje.** `[MEDIDO: grep -rn 'record_gap(' backend/src → 0
   ocorrências fora de teste]` — nem o coletor (`F1`, fechado) nem nenhuma task de `F2` grava
   `IngestGap` em produção. O port `IngestRecordSource.gaps()` é **leitura**, consumido por
   `/ingest-health`; a escrita (`record_gap`) tem método no store mas nenhum produtor.
3. **Sem consumidor identificado além do já existente `/ingest-health`**, que hoje lê uma lista
   vazia (nenhum gap jamais escrito) — isto não é regressão desta task, é o estado que `F1`
   deixou, e escrever um gap novo de "reconexão" sem um requisito de `PRD-004`/`SPEC-004` que o
   peça é a "construção especulativa" que `ADR-027` recusa (mesmo argumento de `Q3-run-definition.md`
   §5 para `P9`).

**O que isto NÃO significa:** não significa que reconexões nunca produzem lacuna na série — apenas
que **detectar e classificar essa lacuna não é trabalho do escritor único em `F2`**. Se um consumidor
de `/ingest-health` precisar dessa visibilidade, o lugar natural é o **coletor**, no fechamento da
sessão que `SPEC-004` §3.1 já grava (`IngestRun` por sessão) — comparando `window` de duas sessões
consecutivas da mesma `series_key_id`/`symbol` já dá o intervalo sem gravação de `IngestGap` nenhuma
adicional.

**Gatilho de reabertura, nomeado:** o dia em que o owner (ou uma leitura de `/ingest-health` em
produção real) precisar de uma linha explícita de "gap por reconexão" — nesse momento a decisão volta
a esta mesa, com o consumidor real como argumento novo, e o candidato natural a implementá-la é uma
task de `F1` revisitado ou uma nova fase, não um retrofit do escritor.

### 7.2. Destino final de mensagem envenenada (`B7`)? **Decisão: fica na `PEL`, indefinidamente, sem segunda estrutura.**

`SPEC-004` §5, `B7` já fixa o comportamento imediato: mensagem que não decodifica **não** derruba o
escritor, **não** é `ack`ada, e o evento `writer_message_rejected{entry_id, reason}` é logado. O que
faltava era o destino **final** — o que acontece depois disso, quando ninguém intervém.

**Decisão, com o mesmo raciocínio de `P9`** (`Q3-run-definition.md` §5 — nenhuma cópia crua adicional
sem consumidor identificado): **não existe um segundo Stream de "dead-letter"**. A entrada envenenada
permanece:

1. **Pendente na `PEL`** (`XPENDING` a mostra) — recuperável via `XRANGE`/`XCLAIM` para investigação
   manual, usando o `entry_id` que `writer_message_rejected` já loga. Isto é o mesmo argumento que
   `P9` usou: "o próprio Stream já é a evidência crua para triagem" — criar um segundo canal para o
   mesmo payload que já está retido na `PEL` duplicaria estado sem necessidade.
2. **Até um de dois fins, nenhum deles automático:** (a) um operador investiga o `entry_id` via
   `XRANGE`, decide o que fazer, e faz `XACK`/`XCLAIM` manual — isto é intervenção humana, fora do
   escopo de código desta feature (`NG-7` recusa alarme automático; isto vale igualmente para
   remediação automática); ou (b) o `REDIS_STREAM_MAXLEN ~ 100000` (`P5`) recicla a entrada por
   idade/posição antes de qualquer intervenção — o mesmo risco que `B8` já nomeia para qualquer
   entrada do Stream, sem tratamento especial para a envenenada. **Isto é uma perda silenciosa
   possível, e está nomeada, não escondida:** se `MAXLEN` reciclar uma entrada envenenada antes de
   alguém investigar, a evidência crua se perde — exatamente o "gatilho de reabertura de `P9`" que
   `Q3-run-definition.md` §5 já havia nomeado (*"se uma investigação de produção precisar de
   evidência crua que já saiu da `PEL`… reabrir `P9`"*). Este gate **reafirma** aquele gatilho em vez
   de duplicá-lo com um nome novo.
3. **Nenhum alarme automático** (`NG-7`, reafirmado): `writer_batch_acked{n_accepted, n_rejected}`
   já dá o sinal agregado por lote (`SPEC-004` §3.7); qualquer `n_rejected > 0` sustentado é
   observável em log/métrica externa — decidir COMO alarmar sobre isso é fora desta task e desta
   SPEC (`NG-7`).

**Por que não um dead-letter stream:** um segundo `XADD` fora de `RedisStreamPublisher.publish`
violaria `RN-2`/`CA-F1-1` diretamente (*"nenhum outro `XADD`"*) se o próprio escritor tentasse
recriar a mensagem num Stream novo — e mesmo que a regra fosse lida como aplicável só ao produtor,
não ao consumidor, criar uma segunda estrutura durável sem que nenhum requisito de `SPEC-004`/
`PRD-004` a leia é o mesmo argumento de `ADR-027` já usado em `P9` e em §7.1: sem consumidor, é
construção especulativa.

---

## 8. Como o owner confere

1. **A DDL roda de verdade** — o comando de §2 é reproduzível: subir o container efêmero, colar o
   SQL, ler a saída. Não é opinião sobre sintaxe, é execução contra a imagem real
   (`timescale/timescaledb:2.17.2-pg15`) que `ADR-031/D2` já fixou para `F2`.
2. **A chave de unicidade é a citação literal** de `domain/provenance.py:147-151` — grepável, sem
   parafrase.
3. **`§5`/`§7` são decisão de arquitetura, rotuladas como tal** (`[OPINIÃO/INFERRED: quant-architect,
   2026-09-08]` onde não há medição possível ainda) — não como fato medido. O `chunk_time_interval`
   de 7 dias em particular carrega o próprio risco de estar errado, com o gatilho de remedição
   nomeado (§5.1), em vez de apresentado como número fechado.
4. **O falsificador de `§7.2`** é executável quando `F3` subir: publicar uma mensagem que não
   decodifica, confirmar que ela aparece em `XPENDING`, e confirmar que nenhuma segunda estrutura
   Redis (`KEYS '*dead*'`, `KEYS '*poison*'`) foi criada pelo `single_writer_cli`.

## 9. O que fica para outra task, deliberadamente

- Implementação de `PostgresSeriesSink`/`PostgresObservedLookup` sobre esta DDL — `T-02.2`.
- Adaptador Postgres para `md.partition_registry` (§5) — sem dono nesta feature; gatilho de
  reabertura nomeado.
- Remedição de `chunk_time_interval` contra volume real de produção (§5.1) — recomendado antes de
  `F3`, sem task própria ainda.
- Escrita de `md.ingest_gap` por reconexão, se um consumidor real vier a pedi-la (§7.1) — `F1`
  revisitado ou fase nova, não `F2`.
