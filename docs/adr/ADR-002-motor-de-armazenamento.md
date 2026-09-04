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
