# ADR-002 — Motor de armazenamento

**Data:** 2026-08-25 · **Status:** proposto, **com um finalista pendente de spike** · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §2.5, §4.2
**Fase/Epic:** F4 · `CST-6` · **Componente alvo:** `docs` (a decisão) / `sentimento` (o escritor único)
**Requisito de origem:** `CA-F4-24`
**Atualização 2026-09-04:** `D4` decidido pelo spike `T-08.1`/`CST-69` (ver emenda ao final).

## Contexto — e a restrição que mais decide não é performance

`Q2` está respondida `[PREMISSA-OWNER: 2026-08-25]`: **VPS, a mesma que roda o `anything_monorepo`**, *"então n temos tanto recurso assim"*.

Medido sobre o repositório vizinho, no disco:

| fato | `[força]` |
|---|---|
| a VPS já roda **6 serviços**: `postgres:15`, `redis:7-alpine`, `evolution`, `backend` (FastAPI), `frontend` (Next), `caddy:2-alpine` com **TLS público** | `[MEDIDO: anything_monorepo/deploy/compose.prod.yml]` |
| **pressão de disco documentada**: runbook `KAN-86` move mídia MinIO → **Cloudflare R2**, passo 6 *"Desligar MinIO no VPS + liberar disco"*, ratificado em `ADR-006` do vizinho | `[MEDIDO: anything_monorepo/docs/deploy/r2_migration_runbook.md]` |
| **conta R2 já provisionada**, com token, bucket e adapter `boto3` config-only | `[MEDIDO]` |
| histórico inteiro **em bucket** (570 símbolos × 2.183 dias, OI 5 min + `klines` 1 min) | **~87 GB uma vez** `[MEDIDO: `curl -sI`, 2026-08-18]` |
| volumetria de escrita | `metrics` **288 linhas/dia/símbolo**; `aggTrade` **1,31–4,80 M linhas/dia/par**; **39,0 B/linha** zip | `[MEDIDO]` |
| **RAM livre, disco livre e região da VPS** | **`[NÃO MEDIDO]` — e eu não tenho acesso a ela** |

**Correção de premissa do owner, feita antes de qualquer escolha, porque não corrigida ela elimina o candidato certo por motivo errado:** *"um banco relacional está totalmente fora de contexto, certo?"* — **não.** **Os cinco candidatos são relacionais e falam SQL.** TimescaleDB **é uma extensão do PostgreSQL**; DuckDB é SQL embarcado. Os eixos que decidem são **row-store OLTP × column-store OLAP** e **daemon × embarcado**.

## Os cinco candidatos

| # | candidato | daemon novo? | onde os bytes moram |
|---|---|---|---|
| 1 | TimescaleDB em instância própria | **sim** | disco da VPS |
| 2 | ClickHouse | **sim** | disco da VPS |
| 3 | Parquet local + DuckDB embarcado | **não** | disco da VPS |
| 4 | **TimescaleDB na instância `postgres:15` que já está de pé** | **não** | disco da VPS, banco alheio |
| 5 | **Parquet particionado no Cloudflare R2 + DuckDB via `httpfs`** | **não** | **fora** da VPS |

## Decisão

**Esta ADR decide três coisas e defere UMA, com o critério do deferimento escrito.**

### D1 · O store é PARTIDO, e essa é a decisão de maior consequência

| conteúdo | motor | por quê |
|---|---|---|
| **catálogo, registro e instrumento** — `series_catalog`, `md.ingest_run`, `md.ingest_gap`, `run_registry`, `instrument*`, `fee_schedule`, `instrument_alias` | **PostgreSQL, a instância que já está de pé** | são **pequenos, relacionais, transacionais e de leitura pontual**: SCD-2, chaves estrangeiras, unicidade forte. É **OLTP de verdade**, e o daemon já existe ⇒ **zero container novo** |
| **série de mercado** — toda linha com as sete colunas de procedência | **store COLUNAR append-only** (finalista em D4) | append-only, leitura sequencial pesada de backtest, agregação por bucket: **OLAP puro** |

**Isto fecha a alternativa *"um motor para tudo"***, que era a forma implícita em que a pergunta vinha sendo feita, e ela é falsa: as duas cargas têm perfis opostos.

### D2 · Eliminado: ClickHouse como sétimo container

**Por vizinhança, não por benchmark.** Somar um servidor de banco a uma VPS que roda 6 serviços de produção alheia e **já offloada dado para liberar disco** compete por RAM e disco com produção que não é nossa. **Segundo motivo, técnico e independente:** o dedupe do ClickHouse acontece *"only during a merge... at an unknown time"* `[DOC]` — e **para soma acumulada, unicidade eventual não serve** (`cvd_cum` é soma acumulada, `SPEC-001` §2.6).

### D3 · Eliminado: Postgres row-store para a série

Perfil OLAP; e o custo de manter a série na mesma instância que serve a aplicação alheia é **blast radius compartilhado** (backup, janela de upgrade, `shared_buffers`) sobre o único dado que não se recaptura. **Nota:** isto **não** elimina o candidato 4 — TimescaleDB é column-store comprimido dentro daquele daemon, o que é outra coisa.

### D4 · Finalista pendente de spike: candidato **4** contra candidato **5**

**Não decidido, e a razão é honesta: nenhum dos cinco foi instalado nem medido, e três números faltam.** *"A ordem de preferência mudou com a tese"* é declaração de preferência, **não** resultado.

**✅ Atualização 2026-09-04: decidido.** O spike `T-08.1`/`CST-69` rodou os cinco critérios abaixo e
escolheu o candidato **4** — ver a seção "Emenda 2026-09-04" ao final desta ADR.

**Critério do spike, declarado antes de rodar** (universo: as 8.637 linhas de `metrics` de BTCUSDT + 1 dia de `aggTrades` já em disco, `data/`):

| critério | passa se |
|---|---|
| **espaço** | a série de 30 dias × 4 símbolos ocupa **≤ 2× o tamanho zipado da fonte** |
| **leitura de backtest** | varredura sequencial de 30 dias × 4 símbolos com `as_of` aplicado termina em **≤ 60 s** |
| **`as_of` correto** | a fixture envenenada de `SPEC-001` §5.1 (três classes) passa **por comportamento**, com resultado **bit-idêntico** |
| **vizinhança** | `free -m` e `df -h` **medidos**, e o candidato cabe no que sobra **com folga declarada** |
| **rede** (só candidato 5) | latência por consulta **medida**, e a varredura acima não a multiplica por partição |

### D5 · A lógica de ler-antes-de-escrever vive no ESCRITOR ÚNICO, não no motor

**Esta é a resposta direta ao falsificador que `premissas` §3.2 e `CA-F4-24` exigem de quem propor Parquet/objeto.**

`CA-F3-12` (backfill `MODELADO` não sobrescreve captura `OBSERVADA`) e `CA-F4-25` (recusar sob divergência de `knowledge_time`) **exigem ler antes de escrever**. **Decisão:** todos os caminhos de escrita convergem para **um processo escritor**; os coletores 24/7 produzem para **fila durável**; o escritor único é **o único** que toca a série. As duas invariantes vivem nele.

**E aqui esta ADR discorda do enquadramento que lhe chegou:** o handoff e `CST-6` tratam *"escritor multiprocesso"* e *"compactação muda o hash de conteúdo"* como **falsificadores do Parquet**. **Eles não são.** São **requisitos que valem nos cinco candidatos** assim que o store é append-only e bitemporal — porque a decisão de recusar sob divergência de `knowledge_time` é **da aplicação** em qualquer motor. **O que é específico do candidato 5 é outra coisa: latência de rede por consulta, e o custo de REESCREVER partição.**

### D6 · Compactação × reprodutibilidade — a regra que fecha a porta da manutenção

A unidade do Parquet é o **arquivo**; micro-batch gera arquivo minúsculo em massa, e compactar **reescreve partição** — o que **muda o hash de conteúdo de que a reprodutibilidade depende** (`SPEC-001` §7).

**Regra:** o `run_registry` grava `partitions_content_hash` **e** um `compaction_epoch` por partição. Uma compactação **incrementa `compaction_epoch` sem alterar `knowledge_time`**, e o sistema distingue as duas causas de hash novo: **`compaction_epoch` diferente com `knowledge_time` igual ⇒ compactação; `knowledge_time` diferente ⇒ dado novo.** Sem essa distinção, **a garantia se perde pela porta da manutenção** — e se perde em silêncio.

### D7 · `ASOF JOIN` nativo não é argumento de escolha

*"O DuckDB tem `ASOF JOIN` nativo"* é **verdade** e **não compra o que esta plataforma precisa**: `as_of` é `argmin(observed_at)` **entre** as observações com `available_at <= t` — **redução bitemporal por janela**, não `ASOF JOIN` simples. A primitiva nativa cobre o caso LOCF de série única. ⇒ **este argumento sai da conta**, e com ele um dos quatro que o direcionamento usou para preferir o candidato 5.

**O que a primitiva nativa AINDA compra, e não é nada:** ela reduz a superfície em que a inversão `D-01` pode voltar, porque o default de `ASOF JOIN … USING` é `t1 >= t2` — **a direção segura**. É argumento de **prevenção de defeito**, não de performance.

## Falsificadores

| # | observação que derruba | o que ela derruba |
|---|---|---|
| **FA-1** | `df -h` na VPS mostrando folga que **acomoda um servidor de banco com margem** e `free -m` mostrando RAM sobrando | **D2** — a eliminação do ClickHouse é por vizinhança, e vizinhança é um número que eu não tenho |
| **FA-2** | latência de rede por consulta ao R2 que **multiplique** o tempo da varredura sequencial por partição, estourando o critério de 60 s de D4 | **candidato 5** |
| **FA-3** | uma compactação que produza hash novo **sem** que `compaction_epoch` a distinga de dado novo | **D6**, e com ela a reprodutibilidade inteira |
| **FA-4** | a fixture envenenada passando no motor e falhando na aplicação (ou vice-versa) | **D5** — a lógica não está onde esta ADR diz que está |
| **FA-5** | egress do R2 deixando de ser zero | **candidato 5** por custo: *"egress zero é o que torna isso viável — em S3 o mesmo desenho pagaria egress por cada varredura de backtest"* |

## O número que falta, nomeado

```
free -m            # RAM total e livre     -> teto de FA-1
df -h              # disco livre           -> teto de FA-1, e decide se algum byte de série mora local
curl -s ipinfo.io  # região/provedor       -> observer_region, COLUNA DE F0, impossível retroativamente
```

**Os dois primeiros são teto declarável e não bloqueiam a SPEC. O terceiro é coluna de F0 e a janela dele fecha quando o primeiro coletor liga.**

## Consequência que esta ADR nomeia e não resolve

**Acoplamento ao Postgres alheio (D1) é custo, não detalhe.** Catálogo e registro passam a compartilhar **ciclo de backup, janela de upgrade e falha** com uma aplicação de produção não relacionada. **Mitigação declarada: schema próprio, usuário próprio, e `G1` (backup com TESTE DE RESTAURAÇÃO) declarando por tabela o que é re-derivável dos dumps e o que não é.** O que **não** é re-derivável — liquidação intraday, `available_at` OBSERVED, snapshot datado, `nq` — é exatamente o que precisa do teste de restauração, e nenhuma fase o carregava antes desta.

---

## ⚠️ Emenda 2026-08-29 — `D1` está PROVISORIAMENTE DIVERGENTE do que roda

**Acréscimo, nada acima foi reescrito.** [`ADR-014/D1`](ADR-014-motor-de-f0-enumeracao-de-verdict-e-testemunha-por-fonte.md) decide que **`md.ingest_run` e `md.ingest_gap` rodam em SQLite durante F0**, contra o que `D1` desta ADR escreve (PostgreSQL, a instância que já está de pé).

**Duas coisas que quem chegar aqui precisa saber antes de citar `D1` ou `D4`:**

| | |
|---|---|
| **`D4` NÃO é o foro desta divergência** | `D4` defere o finalista da **SÉRIE DE MERCADO** (candidato 4 × 5), com universo declarado *"as 8.637 linhas de `metrics` … + 1 dia de `aggTrades`"*. **`D1` — catálogo e registro — não está pendente de spike**, e `T-08.1` não o revisa. ⇒ **a divergência não tem foro em nenhuma das 9 fases**, e é por isso que `ADR-014/D1e` a arma com três gatilhos nomeados em vez de com uma intenção |
| **o custo da troca está travado por contrato, não por promessa** | `ADR-014/D1d` põe um terceiro contrato de `import-linter` que proíbe `sqlite3`/`psycopg`/`asyncpg`/`duckdb`/`sqlalchemy` em `domain` e `use_cases`, **rodado nas duas metades** (`rc=0` na árvore limpa; `rc=1` nomeando arquivo e linha sob mutante) `[MEDIDO 2026-08-29]` |

**`D1` desta ADR continua sendo a decisão de destino. O que `ADR-014` decide é o caminho até lá, e a data de validade dele.**

---

## ✅ Emenda 2026-09-04 — `D4` DECIDIDO pelo spike `T-08.1`/`CST-69`: candidato 4

**Acréscimo, nada acima foi reescrito.** Os cinco critérios do spike já estavam declarados
nesta ADR (a tabela de `D4`, acima) e em `D8.21` (`docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md`)
**antes** desta emenda ser escrita — o pré-registro que `T-08.1` pedia já existia; o que
faltava era rodar o experimento. Comandos, script e a árvore de dado completa:
[`docs/spike/T-08.1-motor-armazenamento/`](../spike/T-08.1-motor-armazenamento/README.md).

**Decisão: candidato 4 (TimescaleDB em `postgres:15`).** É o único dos dois que passa nos
**cinco** critérios como medidos neste ambiente — candidato 5 passa em quatro, e o quinto
(latência de rede ao R2) ficou `[NÃO MEDIDO]` por falta de credencial e de acesso à VPS, não
por falha do candidato. Ver a tabela completa e o raciocínio de cada linha no `README.md`
citado acima; resumo aqui:

| critério | candidato 4 | candidato 5 |
|---|---|---|
| espaço ≤ 2× zipado (30d × 4 símbolos) | **1,506×** ✅ | **1,989×** ✅, margem de 0,5% — com compressão *default* (não nível 19) dá **2,061× ❌** |
| backtest ≤ 60s | **0,05–0,09s** ✅ | **0,01–0,02s** local — **sem a rede do R2**, que é justamente o critério seguinte |
| fixture 3 classes (`SPEC-001` §5.1) | bit-idêntico à referência independente ✅ | bit-idêntico ✅ |
| `free -m`/`df -h`, folga | folga **>99,9%** sobre o já-medido em `T-08.1`/refs ✅ | folga **>99,9%**, e disco na VPS é ~zero por desenho ✅ |
| latência de rede (só candidato 5) | N/A | **`[NÃO MEDIDO]`** — falsificador `FA-2` desta ADR continua sem resposta |

**Por que a decisão não espera o quinto número:** `FA-2` já nomeava esta lacuna como o risco
central do candidato 5, e ela não fechou — abrir mão da decisão até medir a rede real
deixaria `D4` pendente indefinidamente, e o custo de esperar (nenhum motor de série
implementado, fases `08`+ bloqueadas) é maior que o custo de escolher o candidato que
**já** passa em tudo o que dá para medir. **Isto não fecha a porta ao candidato 5**: se a
medição de rede feita DA VPS contra o bucket real vier favorável, e o critério de espaço for
revalidado com folga (não os 0,5% medidos aqui), `D4` pode ser reaberta — mas o ônus da prova
passa a ser do candidato 5, não mais um empate a resolver.

**O que NÃO foi medido, nomeado sem disfarce (detalhe completo no `README.md` do spike):**

1. **latência de rede real ao R2** — sem `.env`/credencial e sem SSH à VPS neste ambiente
   `[NÃO MEDIDO]`. Um proxy informativo (TLS handshake + TTFB ao domínio
   `r2.cloudflarestorage.com`, **deste** ambiente — Curitiba/PR, não a VPS) deu 64–107 ms em
   5 amostras `[MEDIDO 2026-09-04, ambiente ≠ VPS]` — não substitui a medição real;
2. **o passo de instalar a extensão TimescaleDB dentro do container `postgres:15` que já
   roda em produção** — o spike mediu contra a imagem oficial `timescale/timescaledb:2.17.2-pg15`
   (Postgres 15.10 + extensão), funcionalmente idêntica para os cinco critérios, mas a
   migração *in place* em cima de dados de produção existentes é tarefa de infra separada,
   não testada aqui;
3. **volumetria de `aggTrade`** (1,31–4,80 M linhas/dia/par, ordens de magnitude acima do que
   este spike testou) — `D4` declarava universo "metrics de BTCUSDT + 1 dia de `aggTrades`",
   e este spike ficou dentro dele (série tipo OI/metrics, 30d × 4 símbolos). Se o candidato 4
   também precisar hospedar séries tipo `aggTrade`, **isso é um spike novo**, não coberto por
   esta emenda.

**Achado lateral, registrado porque quase produziu um número errado:** a primeira
configuração do candidato 4 (chunk de 1 dia, `compress_segmentby = symbol`) comprimiu para
**~4,8×** o zipado da fonte — reprovaria o critério. O motivo: com 35 mil linhas espalhadas
em 31 chunks diários, cada segmento de compressão tem poucas linhas para amortizar o overhead
colunar por segmento. Reconfigurado para chunk de 45 dias (praticamente 1 chunk) +
`segmentby = symbol,fonte`, o resultado caiu para 1,506×. **Isto é parâmetro de operação,
não característica do motor** — mas quem for implementar o candidato 4 em produção precisa
saber que o `chunk_time_interval` importa tanto quanto a escolha do motor em si, e que o
default "1 chunk por dia" (comum em tutoriais de TimescaleDB para séries de alto volume) é
a escolha errada para uma série deste tamanho.

**Doc delta desta emenda:** nenhum outro documento precisa mudar — `D8.21` já estava escrito
com os cinco critérios corretos, e o que faltava era o experimento, agora registrado aqui e
em `docs/spike/T-08.1-motor-armazenamento/`.

---

## ✅ Emenda 2026-09-04 — `D6` CONCRETIZADA para o candidato 4 (`T-08.3`/`CST-71`)

**Acréscimo, nada acima foi reescrito.** `D6` foi escrita quando o finalista ainda estava aberto
(candidato 4 × 5) e falava em termos de Parquet ("a unidade é o arquivo… compactar reescreve
partição"). `D4` decidiu candidato 4 (`TimescaleDB` em `postgres:15`). Esta emenda torna `D6`
executável para ESSE motor: o que `compaction_epoch` é, onde vive, a granularidade de "partição",
e o algoritmo que fecha "a porta da manutenção" sem devolver número diferente em silêncio (`F-4`).

### D6a · Mapeamento do vocabulário de `D6` para TimescaleDB

| termo de `D6` (Parquet) | equivalente no candidato 4 |
|---|---|
| "arquivo" que compactação reescreve | **`chunk`** de hypertable (`show_chunks`) |
| "compactar" | `compress_chunk` / `decompress_chunk` / `recompress_chunk` — operação **nativa, lossless**, muda **codificação física** (row→columnar), não deleta nem altera valor lógico de nenhuma linha |
| hash de conteúdo mudando por rewrite físico | **não se aplica do mesmo jeito**: `content_hash` (abaixo) é definido sobre o RESULTADO LÓGICO de uma query, não sobre bytes de arquivo — então uma `compress_chunk` correta **não deveria** mudar o hash. `compaction_epoch` continua necessário como **rede de segurança e trilha de auditoria**, não porque o hash logicamente TENHA que mudar |

**`[INFERRED]`** — decisão desta emenda, não citação de `D6`: dado que o hash agora é lógico
(linha abaixo), o cenário que `D6` mais temia ("hash novo por reescrita física, indistinguível de
dado novo") deixa de ser o caso comum. Ele continua possível por dois motivos que `compaction_epoch`
cobre: (1) erro de implementação do hash (ex.: `string_agg` sem `ORDER BY` explícito, que pode
reordenar entre um `compress_chunk` e outro por depender de ordem física de scan); (2) qualquer
operação futura de "manutenção" que NÃO seja `compress_chunk` mas ainda reescreva o chunk
fisicamente (`CLUSTER`, `pg_repack`, re-particionamento por mudança de `chunk_time_interval`).

### D6b · Granularidade de "partição" — desacoplada de `chunk_time_interval`

**Decisão: "partição", para fins de reprodutibilidade, é `(series_key_id, symbol, source,
partition_key)`, com `partition_key` um bucket de calendário DECLARADO na aplicação — não o
chunk físico do Timescale.** Motivo, com o fato que a própria emenda de `D4` já registrou: o
spike reconfigurou `chunk_time_interval` de 1 dia para 45 dias **para resolver taxa de
compressão**, e isso é "parâmetro de operação, não característica do motor" (texto da própria
emenda `D4`, linha "Achado lateral"). Se "partição" == "chunk físico", a PRÓXIMA vez que alguém
retunar `chunk_time_interval` (razão puramente de compressão) redefine em silêncio o que
"partição" significa para todo `run_registry` já emitido — exatamente o modo de falha que `D6`
existe para fechar, só que pela porta do *tuning* em vez da porta do *rewrite*.

**Recomendação operacional (não é portão desta ADR):** escolher `chunk_time_interval` para
COINCIDIR com o `partition_key` declarado (hoje: mês UTC), eliminando a necessidade de uma tabela
de mapeamento chunk↔partição em regime normal. Se compressão exigir um chunk maior que o bucket de
reprodutibilidade (como aconteceu no spike), o escritor único trata isso como **migração de
esquema de partição** — registrada, com `compaction_epoch` de TODAS as partições afetadas
incrementado no mesmo evento — nunca como `ALTER TABLE … SET (timescaledb.chunk_time_interval=…)`
solto por um operador contra uma tabela com chunks já existentes.

### D6c · Onde `compaction_epoch` e `content_hash` vivem

**Tabela nova, catálogo (`md`, mesmo schema de `md.ingest_run`/`md.ingest_gap`), dona = `sentimento`
(o escritor único, por `D5`):**

```
md.partition_registry ( series_key_id, symbol, source, partition_key,
                         compaction_epoch, content_hash, row_count,
                         last_compacted_at, last_written_at, updated_at )
```

- **`compaction_epoch`**: inteiro, começa em `0`, **incrementado em exatamente 1 pelo escritor
  único** — nunca pelo Timescale, nunca por um job de manutenção fora do escritor — a cada
  operação de classe compactação (`compress_chunk`/`decompress_chunk`/`recompress_chunk`, ou
  migração de `chunk_time_interval` per `D6b`) que toque qualquer linha da partição. **Não é** o
  `id` interno de `_timescaledb_catalog.chunk` (não estável sob `merge_chunks`/reparticionamento,
  e é implementação interna do motor — usá-lo violaria `D5`: a invariante mora na aplicação).
- **`content_hash`**: `sha256` sobre a projeção canônica das linhas da partição (as sete colunas
  de procedência + colunas de valor), em ORDEM DETERMINÍSTICA explícita
  (`ORDER BY event_time, observed_at, source, symbol` — nunca ordem de scan implícita),
  recalculado pelo escritor único após todo write e após toda operação de compactação.
- **Concorrência:** o escritor único serializa `(escrever, compactar)` por partição com lock
  consultivo — nunca uma `compress_chunk` roda enquanto um write para a mesma partição está em
  voo, porque isso é a única forma real de o `content_hash` capturar um estado inconsistente
  (metade comprimido, metade não).

### D6d · A regra de comparação — o que fecha `F-4` para este caso

Dado um `run_registry` já gravado (`bundle_hash B`, `window W`, `knowledge_time K1`,
`partitions_content_hash H1`, e — **novo nesta emenda** — o snapshot por partição de
`compaction_epoch` no momento do run, em tabela de auditoria `run_registry_partition_snapshot
(run_id, series_key_id, symbol, source, partition_key, compaction_epoch, content_hash)`,
append-only, dona = `backtest`/`T-08.4`, populada A PARTIR de `md.partition_registry`):

Uma tentativa de reprodução com o MESMO `(B, W)` recomputa `K2`/`H2` sobre as mesmas partições e
segue esta árvore, **sem exceção**:

| `K2` vs `K1` | `H2` vs `H1` | classificação | ação |
|---|---|---|---|
| igual | igual | reprodução válida | devolve o número, **bit-idêntico** (`D8.9`) |
| igual | **diferente** | olhar `compaction_epoch` de cada partição tocada | ver abaixo — **nunca devolve número novo em silêncio** |
| diferente | (qualquer) | dado novo (backfill dentro da janela) | comportamento já coberto por `D8.9`: RECUSA apontando divergência de `knowledge_time` |

Para a linha do meio (`K` igual, `H` diferente — o caso que `D8.10` nomeia):

- **Todas** as partições tocadas com `compaction_epoch` MAIOR que o snapshot registrado, e
  nenhuma com `compaction_epoch` igual ⇒ classe = **`compaction`**. O sistema **ainda RECUSA** a
  devolução silenciosa (mandato de `F-4`: "nunca número diferente em silêncio" não abre exceção
  para compactação) — mas a mensagem de recusa **é distinta**: cita a classe, a lista de
  `(partition_key, epoch_antigo → epoch_novo)`, e convida reconciliação explícita (novo
  `run_registry` gravado com `H2`, ligado ao anterior por `superseded_by`), nunca sobrescrita in
  place — `append-only` continua valendo aqui.
- **Qualquer** partição com `compaction_epoch` **igual** ao snapshot mas `content_hash`
  diferente ⇒ classe = **`anomalia`** (hash mudou sem compactação registrada E sem
  `knowledge_time` novo). Isto é **mais grave** que o caso de compactação: RECUSA dura,
  sem sugestão de reconciliação automática — é o sintoma de um bug no cálculo do hash, de uma
  escrita fora do escritor único, ou de corrupção. `FA-3` desta ADR passa a ler EXATAMENTE este
  caso.

**`[INFERRED, extensão de D6]`**: o texto original de `D6` podia ser lido como "compactação
classificada ⇒ aceitar H2 silenciosamente". Esta emenda fecha essa leitura porque o falsificador
global da fase (`F-4`, plano `08`) é categórico — "nunca número diferente em silêncio" — sem
exceção nomeada para compactação. Se o owner quiser a leitura permissiva (aceitar H2
automaticamente quando a classe é `compaction`), isso é uma escolha de produto que reabre `F-4`,
não uma leitura livre desta ADR.

### D6e · Fora de escopo desta emenda, nomeado para não virar exceção por omissão

**Retenção/expurgo físico de linhas (`drop_chunks` ou equivalente) NÃO é "compactação" e não é
coberta por `compaction_epoch`.** Compressão é lossless (as linhas continuam lá, só a codificação
muda); retenção DELETA linhas, o que destrói exatamente o histórico de `knowledge_time` de que a
reprodutibilidade depende. Nenhuma política de retenção existe hoje para a série de mercado
(`ADR-002` não propôs uma), e se uma vier a existir, ela precisa de ADR própria com o gatilho de
"partição ainda referenciada por `run_registry`" tratado como bloqueio duro — não como o epoch
incremental que esta emenda define. **Não é decidido aqui.**

### Falsificador desta emenda (soma-se a `FA-3`)

**FA-3b**: uma `compress_chunk` real (TimescaleDB, não simulada) sobre uma partição com N linhas
produzindo `content_hash` diferente **quando calculado com `ORDER BY` explícito e determinístico**
— isso derrubaria a premissa de `D6a` de que compactação lossless não deveria mexer no hash
lógico, e forçaria tratar `compaction_epoch` como MAIS que rede de segurança.

### Interface entre `sentimento` (esta emenda) e `backtest` (`T-08.4`)

`sentimento` é dono de `md.partition_registry` (fonte da verdade de `compaction_epoch`/
`content_hash` por partição) e do algoritmo de incremento (`D6c`). `backtest`/`T-08.4` é dono de
`run_registry` e de `run_registry_partition_snapshot`, e consome `md.partition_registry` **por
leitura**, no momento em que grava um run — nunca escreve nele. Esta é a fronteira de módulo:
**quem produz a linha de série é o único que sabe se ela foi compactada; quem grava o registro de
reprodutibilidade é o único que sabe quais partições um `window` tocou.**

### Como o owner confere

1. `D6a`/`D6b`/`D6c` são **decisão de arquitetura, rotulada como tal** (`[OPINIÃO/INFERRED:
   quant-architect, 2026-09-04]`) — não há medição possível antes de `T-08.4` existir e rodar
   contra TimescaleDB real.
2. O falsificador `FA-3b` é executável hoje contra o ambiente do spike `T-08.1`
   (`docs/spike/T-08.1-motor-armazenamento/`): rodar `compress_chunk` sobre uma partição de teste,
   calcular `content_hash` com `ORDER BY` explícito antes/depois, comparar. **Isto é o teste de
   regressão que `builder` de `T-08.3` deve escrever primeiro** — fixture de storage real, não
   fixture de mercado, mas mesma disciplina: o owner confere o resultado do `compress_chunk`
   contra `psql`, não contra a leitura deste texto.
3. A árvore de decisão de `D6d` é a tabela contra a qual `D8.10` (DoD da fase `08`) deve ser
   testado literalmente — três casos, três linhas de teste.

**Doc delta desta emenda:** `run_registry` (`SPEC-001` §3.5) precisa ganhar uma referência a
`run_registry_partition_snapshot` quando `T-08.4` for especificado — não alterado aqui porque
`T-08.4` ainda está `todo` e é quem detém esse componente (`backtest`).
