# `A11` — laudo de `infra` sobre a latência de `/symbol`: workers, memória, Granian

**Data:** 2026-09-16 · **Autor:** `infra-architect` · **Insumo:**
`docs/context/cinco-metricas-do-core/handoff/A11-LATENCIA-DE-SYMBOL.md` (§5 e §6)
**Escopo:** decisão, sem código. Postgres tocado **só com `SELECT`**; nenhum deploy, nenhum
`restart`, nenhum `up`. Todos os containers medidos são os que já estavam de pé
(`Up 32 minutes` / `Up 2 days` no início da medição).

---

## 0. Veredito em uma tabela

| # | pergunta | veredito |
|---|---|---|
| 1 | workers > 1 é seguro? | **Sim quanto a ESCRITA — não como o processo está hoje.** Dois bloqueios medidos, ambos consertáveis, nenhum deles o SQLite |
| 2 | quantos, com que memória | **2**, não 4. **+182 MiB por worker** medido, e o teto da VPS é `[NÃO MEDIDO]` |
| 3 | Granian | **Não.** O ganho que ele oferece é ≤ 0,05% da latência medida, e o preço é `DoD-D5.13` + 33 chamadas em 16 arquivos |
| 4 | muda se a opção 3 entrar? | **Muda de CLASSE.** Ordem correta: **3 → medir → `B12` → workers**, e workers vira condicional a um número |

---

## 1. Workers > 1 é seguro? — a escrita, item por item

### 1.1 A API não escreve. Medido, não suposto.

```bash
grep -rnE '\.(record|initialise|write|insert|upsert|save|open_run|close_run)\(' \
  backend/src/api/ backend/src/main/__init__.py        # -> 0 linhas, rc=1
```

`[MEDIDO 2026-09-16, n=0 sobre 8 rotas em backend/src/api/routes/]`. As 8 rotas
(`collector_status`, `ingest_health`, `ready`, `series_catalog`, `series_history`,
`series_live`, `series_quarantine`, `__init__`) não têm um único chamador de método de escrita.

⚠️ **`rc=1` com zero linhas é ambíguo** pelo mesmo motivo que `ADR-012` nomeia — pode ser
"não escreve" ou "meu padrão não alcança o nome do método". Por isso a contraprova, que é o
caso que a busca **aceita**: os mesmos nomes aparecem, e só aparecem, em CLI:

```bash
grep -rn '\.initialise()' backend/src --include='*.py'
# collectors_cli.py:2576, single_writer_cli.py:554, clock_skew_tolerance_cli.py:80,
# coinalyze_one_shot_cli.py:185, liquidation_reconciliation_cli.py:172, ntp_skew_probe_cli.py:182
```

`[MEDIDO 2026-09-16, n=6 chamadas, 6 arquivos, todos `*_cli.py`, nenhum sob `src/api` ou `src/main`]`.

### 1.2 A propriedade do escritor único fica intacta

A citação correta **não é `ADR-009/D2`/`D3`** (aquela ADR é *reuso da forma do `anything`*; seu
`D2` recusa conteúdo e seu `D3` decide layout de frontend). A propriedade mora em:

- **`ADR-002/D5`** — *"A lógica de ler-antes-de-escrever vive no ESCRITOR ÚNICO, não no motor"*;
- **`ADR-027/D1`**, linha (b) — o escritor único *"é o único processo que toca a série
  (`ADR-002/D5`)"* `[DOC: ADR-027:81]`.

O comentário de `deploy/compose.yml:124-125` cita `ADR-009/D2`/`D3` para essa propriedade; **a
citação está trocada**, o conteúdo está certo. Registro aqui porque o handoff a repetiu — não é
motivo para reprovar nada, é higiene de âncora.

⇒ **N réplicas de leitura não tocam essa propriedade.** O escritor continua sendo **um** processo
(`deploy-writer-1`, `command: python -m src.modules.sentimento.infra.single_writer_cli`), e nenhum
worker da API abre conexão de escrita — porque nenhum código da API escreve (§1.1).

### 1.3 O `SqliteSeriesQuarantineStore` — a armadilha óbvia, e ela NÃO morde

O caminho da API para esse store é `GET /series-quarantine` → `series_quarantine_query(source)` →
`list_all()` → `_fetch()`, e `_fetch` (`sqlite_series_quarantine_store.py:208-221`) executa
**dois `SELECT`** e nada mais. `record()` (`:133`, `INSERT OR REPLACE`) e `initialise()` (`:126`,
`CREATE TABLE`) **não têm chamador em `src/api` nem em `src/main`** (§1.1).

O único ato de escrita que sobra é implícito e é o `sqlite3.connect()` de `:218` **criando o
arquivo se ele não existir**. Ele não existe:

```bash
docker exec deploy-api-1 ls -l /app/data/md/      # -> "total 0"
```

`[MEDIDO 2026-09-16]` — o volume `api_data` está vazio: nenhuma requisição a `/series-quarantine`
desde o boot. Com N workers, N processos podem correr para criar o mesmo arquivo de 0 byte. É
**idempotente, sem DDL e sem `INSERT`**, e `_SELECT_TABLE_PRESENCE` (`:219`) devolve `None` →
lista vazia, exatamente como hoje com 1 processo.

> **N leitores de um SQLite sem nenhum escritor é seguro por construção** — o modo de falha do
> SQLite multiprocesso é o *lock* de escrita, e aqui não há escritor. **Não é bloqueio.**

⚠️ Achado lateral, fora do escopo desta decisão e registrado para não se perder: o volume
`api_data:/app/data/md` está declarado **só no serviço `api`** (`compose.yml:113-114`), e quem
escreve nesse store é `collectors_cli`/`*_one_shot_cli`, que rodam no container `collector`. Os
dois lados apontam para caminhos diferentes. Isso é verdade **hoje, com 1 worker**, e workers não
piora nem melhora.

### 1.4 ⛔ BLOQUEIO 1 — `workers>1` hoje NÃO sobe: ele mata o processo

```python
# uvicorn/main.py:603-607, lido dentro da imagem de produção
if config.reload or config.workers > 1:
    if not isinstance(app, str):
        logger.warning("You must pass the application as an import string to enable 'reload' or 'workers'.")
        sys.exit(STARTUP_FAILURE)
```

`[MEDIDO 2026-09-16: docker exec deploy-api-1 sed -n '596,612p' .../uvicorn/main.py]`, contra
`backend/src/main/__main__.py:40`, que passa o **objeto** `app`, não uma string.

**Isto não é degradação silenciosa — é `sys.exit`.** Somar `workers=N` ao `uvicorn.run` atual faz
`deploy-api-1` entrar em crash-loop com `restart: unless-stopped`. A correção é trocar o objeto
por `"src.main:app"` no `__main__.py`, e **é mudança de código, do `builder`** — não é ajuste de
`compose.yml`.

Consequência que essa string arrasta, e ela é a causa do BLOQUEIO 2: `src/main/__init__.py:328`
tem `app = create_app(...)` **em nível de módulo**, e o `uvicorn` **spawna**, não forka —

```bash
grep -n 'get_context\|Process(' .../uvicorn/_subprocess.py
# :18  spawn = multiprocessing.get_context("spawn")
# :51  return spawn.Process(target=subprocess_started, kwargs=kwargs)
```

`[MEDIDO 2026-09-16, uvicorn 0.52.4, Python 3.13.15]` ⇒ **cada worker reimporta o módulo e roda
`create_app()` inteiro de novo.**

### 1.5 ⛔ BLOQUEIO 2 — workers multiplicam por N um defeito de produção que está VIVO agora

`create_app` abre **duas** conexões Postgres por processo: `compose_ingest_record_store`
(`__init__.py:241`) e `compose_postgres_connection` para o `PostgresSeriesWindowReader`
(`__init__.py:251-252`, a segunda conexão dedicada que `T-04.1` pediu).

E as duas estão penduradas neste instante:

```sql
select pid, state, now()-backend_start as idade_conexao, now()-xact_start as idade_xact, left(query,40)
  from pg_stat_activity where datname is not null order by state;
```

| pid | state | idade da conexão | idade da transação | query |
|---|---|---|---|---|
| 187453 | **idle in transaction** | 00:33:28 | **00:33:11** | `SELECT run_id, source, endpoint, "w…` |
| 187454 | **idle in transaction** | 00:33:28 | **00:33:08** | `SELECT series_key_id, symbol, source, bu…` |

`[MEDIDO 2026-09-16, SELECT em pg_stat_activity, n=7 sessões no banco; max_connections=100]`

**Isto reproduz `ACHADO-API-VAZA-IDLE-IN-TRANSACTION` (`B12`/`B13`) em produção, ao vivo, e
identifica as duas sessões pelo nome:** a segunda é literalmente o `_SELECT_WINDOW_SQL` de
`postgres_series_window_reader.py:37-44`, a primeira é o store de `ingest_run`. O documento do
achado as descrevia como *"duas sessões … ambas desde o próprio boot"* com rótulo `[DOC]`; este
laudo as promove a **`[MEDIDO]`** e mostra que são **exatamente as duas conexões que
`create_app` abre**.

⇒ **`workers=4` produz 8 sessões `idle in transaction` desde o boot**, cada uma segurando
`ACCESS SHARE` sobre `md.series` e `md.ingest_run`. O mecanismo que o achado documenta —
`ALTER TABLE` de boot do coletor pedindo `ACCESS EXCLUSIVE`, entrando na fila atrás delas e
congelando a tabela para leitura — passa a ter **4× mais bloqueadores**, e cada deploy do
coletor fica 4× mais provável de travar.

> **PORTÃO: `B12` é consertado ANTES de `workers>1`, não depois.** Subir workers sobre o
> vazamento é usar a réplica para multiplicar o defeito. O conserto é o que a própria hipótese do
> achado nomeia (`autocommit=True` no `psycopg3`, ou `commit`/`rollback` por requisição) e é
> trabalho de código, do `builder`.
>
> **Falsificador do conserto, e ele tem de rodar COM N workers de pé:**
> `select count(*) from pg_stat_activity where state='idle in transaction'` tem de devolver
> **0**, não `2N`. Hoje devolve **2** com 1 worker `[MEDIDO 2026-09-16]`.

### 1.6 O que workers NÃO ameaça, e vale dizer para fechar o universo

- **SSE / `/series-live`**: `get_series_live` (`series_live.py:40-55`) devolve `StreamingResponse`
  sobre um iterador **finito** — `grep` por `while`/`sleep` no arquivo devolve 0 linhas
  `[MEDIDO 2026-09-16]`. Não é stream de vida longa, não prende thread do threadpool, não
  interage com contagem de worker.
- **`ADR-027/D1`** (*"três processos de vida longa; nada mais vira container permanente"*): N
  workers **não adiciona container** — continua sendo o processo (c), um serviço `api`. A
  propriedade que `D1` protege é o número de **serviços**, não de PIDs.

---

## 2. Quantos workers, e com que memória — medido, não estimado

### 2.1 A pegada, com o comando

```bash
docker exec deploy-api-1 grep VmRSS /proc/1/status     # amostrado a cada 1 s, n=60 amostras
```

durante **uma** `GET /api/v1/series-history` de janela cheia (5.759 min, série
`ef3033e6…`/`BTCUSDT`, **50.666 linhas** na janela):

| | kB | MiB |
|---|---|---|
| base, processo ocioso | **186.024** | 181,7 |
| pico, 1 requisição em voo | **209.040** | 204,1 |
| **delta por requisição em voo** | **23.016** | **22,5** |

`[MEDIDO 2026-09-16, n=60 amostras de 1 s; a requisição fechou `http=200 size=510.348B
t=71,590s`]`

⚠️ Os **71,6 s** desta medição não contradizem os 17,25 s do handoff — são séries diferentes:
aquela tinha 10.047 linhas na janela, esta tem 50.666 `[MEDIDO 2026-09-16:
`SELECT … GROUP BY series_key_id` sobre `md.series`]`. É o mesmo `O(grade × linhas)`, com 5× mais
linhas. **Reforça a causa do handoff; não a substitui.**

E o *split* de memória, que é o que decide se workers compartilham páginas:

```bash
docker exec deploy-api-1 cat /proc/1/smaps_rollup
# Pss: 185.313 kB | Private_Dirty: 176.572 kB | Shared_Clean: 16.136 kB
```

`[MEDIDO 2026-09-16]` — **176,6 MB são privados e sujos**. Como o `uvicorn` **spawna** (§1.4), não
há COW nenhum; e mesmo se forkasse, o máximo compartilhável seria os 16,1 MB de `Shared_Clean`.

### 2.2 A aritmética, e ela é minha obrigação declarar

| topologia | base residente | pico com todos ocupados | delta sobre hoje |
|---|---|---|---|
| **1 worker (hoje)** | 182 MiB | 204 MiB | — |
| **2 workers** | 364 MiB | **409 MiB** | **+205 MiB** |
| 4 workers | 728 MiB | **818 MiB** | +614 MiB |

**Onde isso mora:** RAM da VPS compartilhada. **Não** toca disco (nenhum volume novo), **não**
toca R2, **não** toca Postgres além das conexões de §1.5.

### 2.3 A recomendação: **2**, e o motivo do 2 não é gosto

**Não recomendo 4, e a razão é que eu não sei se cabe.** `docs/premissas-de-infra-e-stack.md`
§4.1 nomeia exatamente esta lacuna: *"Os recursos reais da VPS"* — `free -m` e `df -h` são
`[NÃO MEDIDO]` até hoje. O host onde medi tem 15,5 GiB e 8 cores, **e não é a VPS**; a VPS roda os
6 serviços do `anything_monorepo` mais os nossos 6 containers.

⇒ **2 workers custam +205 MiB de pico, um número que eu sei declarar, e cortam a cauda pela
metade.** Ir a 4 exige, antes, **um comando na VPS**: `free -m`. Se `disponível` ≥ 2 GiB depois de
tudo de pé, 4 é defensável; abaixo disso, não proponha.

### 2.4 O que tem de vir junto, e sem isto eu não assino workers

`docker inspect deploy-api-1` devolve **`NanoCpus=0 Memory=0 CpuQuota=0`** `[MEDIDO 2026-09-16]` —
**o `api` não tem teto de CPU nem de memória.** Com 1 worker isso é quase inofensivo: o GIL é o
teto de fato. Com N workers **o teto some**, e N processos CPU-bound numa VPS compartilhada
competem com o co-inquilino que já offloadou mídia para o R2 para liberar recurso.

⇒ **Workers e limite entram no mesmo `compose.yml`, na mesma mudança:** `mem_limit` e `cpus`
dimensionados pela tabela de §2.2 (para 2 workers: memória ~640 MiB, CPU ~2). Workers sem teto é
trocar um serviço lento por seis serviços lentos.

---

## 3. Granian — recusado, e o preço da recusa é pequeno porque o ganho é

### 3.1 Disco NÃO é o argumento

```bash
python3 -m pip download granian --no-deps -d ./gran
# granian-2.8.3-cp312-...-manylinux2014_x86_64.whl  =  5.042.926 B  (4,9 MiB)
```

`[MEDIDO 2026-09-16, wheel baixado no scratchpad e descartado]`. Contra os **30 MB** que
`T-05.12-infra-architect.md` §2 mediu para `fastapi + uvicorn`, Granian é **barato**. Quem
recusar Granian por pegada está recusando pelo motivo errado.

### 3.2 O argumento é o ganho, e o handoff já o limitou

O handoff mede **9 ms de Postgres para 17.250 ms de resposta ⇒ 99,95% do tempo é Python da
aplicação** (linhas 3 e 4 da tabela §1). Granian substitui a camada HTTP/ASGI — os **0,05%**. E os
workers de Granian continuam sendo **processos Python com GIL próprio**: para *este* gargalo,
Granian entrega exatamente o que `uvicorn --workers N` entrega, N processos, e nada além.

> **Trocar de servidor para ganhar 0,05% de 17 s é comprar risco com moeda de precisão.**

### 3.3 O preço: `DoD-D5.13` e o universo exato dos testes

```bash
grep -rn 'uvicorn.Server\|uvicorn.Config' backend/tests/ | wc -l   # 33
grep -rln 'uvicorn' backend/tests/ | wc -l                          # 16
```

`[MEDIDO 2026-09-16: 33 chamadas em 16 arquivos]` — não os "~8" que o handoff estimou; são
**16 arquivos**, entre eles `test_ingest_health_route_over_the_network.py`,
`test_series_quarantine_route_over_the_network.py`, `test_series_history_route.py`,
`test_series_live_route.py` e `test_collector_status_dual_process_postgres.py`.

A propriedade que eles compram está escrita no docstring do próprio entrypoint
(`backend/src/main/__main__.py:1-9`): *"This module is the OTHER caller of the same
`uvicorn.Server`/`uvicorn.run`, so the process started by a human and the process started by the
test share one server implementation."* `DoD-D5.13` exige provar a rota **pela rede sem
subprocess**, e é isso que `uvicorn.Server` numa `threading.Thread` permite.

### 3.4 "Granian em produção e uvicorn em teste, sem duas verdades?" — **não, e a resposta é honesta**

Não existe forma **barata**. Existe **uma** forma correta, e ela é emenda de ADR, não flag:

1. os 16 arquivos passam a provar **a rota**, e deixam de provar **o servidor** — a frase do
   docstring acima deixa de ser verdadeira e tem de ser reescrita, não apagada;
2. entra **um** teste de paridade de produção que sobe o comando real (`granian …`) **como
   subprocess** contra a imagem do compose — que é exatamente o que `D5.13` proibiu.

⇒ **São duas verdades, sim; a única escolha é se elas ficam declaradas ou escondidas.** Enquanto o
ganho medido for 0,05%, pagar isso é negativo.

### 3.5 ⚠️ A premissa do owner, tratada como ela merece

`[PREMISSA-OWNER, 2026-09-16]` — *"no inicio do discovery foi passado a granier justamente por ele
permitir ter esses works e gerenciar o awsgi de forma interessante"*.

**A metade "ter esses works" está certa e o owner está certo em cobrá-la** — a API roda com
1 PID e 8 cores parados, e isso é um erro real. **O que a medição mostra é que o remédio para essa
metade não exige Granian:** `uvicorn --workers N` dá os mesmos N processos, com o
`__main__.py` que já existe, sem tocar em 16 arquivos de teste.

**Gatilho de reabertura, nomeado:** depois que a opção 3 derrubar o custo por requisição para
< 1 s, meça a fração da p95 gasta na camada HTTP. **Se passar de 5%**, Granian volta à mesa com
número — e aí a conversa sobre `D5.13` vale a pena. Hoje ela é 0,05%.

---

## 4. Workers ainda valem se a opção 3 entrar? — **muda de classe, e a ordem importa**

### 4.1 A aritmética dos dois cenários

| cenário | 1 requisição | 4 concorrentes, 1 worker | 4 concorrentes, 2 workers |
|---|---|---|---|
| **hoje** | 17,2 s `[DOC: handoff §1]` | **124,2 s** `[DOC: handoff §1 linha 6]` | ~62 s `[INFERRED: paralelismo de 2 sobre a serialização medida]` |
| **com a opção 3** | < 1 s `[DOC: handoff §6, estimativa do autor]` | ~4 s `[INFERRED: GIL serializa 4×1 s]` | ~2 s `[INFERRED]` |

**O ganho absoluto de workers cai de ~62 s para ~2 s.** É a mesma razão de 2×; é outra ordem de
grandeza de dor.

### 4.2 O veredito, e ele É condicional — declaro isso em vez de esconder

- **Hoje, sem a 3:** workers seriam *conserto de indisponibilidade* — `GET /symbol` estourou
  **3 de 3** vezes em 300 s com `ttfb=0` e **0 byte** `[DOC: handoff §1 linha 1]`. Mas mesmo aqui
  **workers não podem ser o conserto principal**: eles escalam a vazão **linearmente** (2 workers,
  2× de painéis), enquanto a opção 3 corta o custo em **~70×**. Dois usuários com a página aberta
  derrotam qualquer contagem de worker que caiba nesta VPS.
- **Depois da 3:** workers viram *margem de cauda*, não conserto. E aí eles **competem por RAM**
  com 6 serviços numa VPS cujo `free -m` ninguém mediu (§2.3).

> **Recomendação de ordem, e ela é a entrega deste laudo:**
>
> **(1) opção 3 primeiro** — não custa nada de infra: nenhum container, nenhum MB, nenhuma
> conexão nova. **(2) medir de novo** 4 concorrentes com 1 worker. **(3) `B12`** (§1.5), que é
> defeito vivo e vale por si, com ou sem workers. **(4) workers = 2**, e só se a medição de (2)
> ainda passar de **3 s** de p95 — junto com `mem_limit`/`cpus` (§2.4) e a string de import
> (§1.4).
>
> **Se a medição de (2) der < 3 s, minha recomendação é NÃO subir workers** e ficar em 1. Gastar
> +205 MiB de uma VPS sob pressão para tirar 2 s de uma cauda de 4 s é complexidade sem retorno —
> e é exatamente o que a pergunta 4 perguntou.

### 4.3 Onde isto é registrado

**Nenhuma ADR nova.** Workers não criam serviço, não criam volume e não reabrem motor de
armazenamento — é realização operacional do processo (c) que `ADR-027/D1` já decidiu. O que muda e
**precisa** ficar escrito é a contagem de conexões Postgres por processo (§1.5): **emenda a
`ADR-027`** (`D1b`), no formato que `D1a` já abriu, se e quando workers subirem.

A recusa de Granian **não** precisa de ADR nova: ela **confirma** o registro existente
(`docs/context/plataforma-dados/gates/T-05.12-infra-architect.md:19-30`) e acrescenta o número que
faltava (0,05%, §3.2) e o gatilho de reabertura (§3.5).

---

## 5. Falsificadores desta decisão

| # | se … | então … |
|---|---|---|
| **F1** | com `workers=N` de pé, `select count(*) from pg_stat_activity where state='idle in transaction'` devolver `2N` em vez de `0` | o portão de §1.5 foi ignorado: workers multiplicaram `B12`. **Rollback para 1 worker.** |
| **F2** | `free -m` na VPS mostrar `disponível` < 512 MiB com tudo de pé | 2 workers não cabem; §2.3 estava otimista e a recomendação cai para 1 |
| **F3** | depois da opção 3, a camada HTTP passar de **5%** da p95 | a recusa de Granian (§3) expirou e a pergunta volta, com número |
| **F4** | depois da opção 3, 4 concorrentes com **1 worker** fecharem em < 3 s **e** workers subirem mesmo assim | §4.2 foi desobedecido: complexidade sem retorno, paga em RAM compartilhada |
| **F5** | `docker exec deploy-api-1 ls -l /app/data/md/` passar a mostrar `series_quarantine.sqlite3` com tamanho > 0 **e** `api` com N > 1 | apareceu um escritor no lado da API que §1.3 não previu — a análise do SQLite tem de ser refeita |

## 6. O que este laudo NÃO decide

- **O algoritmo** (opção 3, a varredura única) — é do `quant-architect`. Eu só digo em que **ordem**
  ele entra em relação ao meu item.
- **O conserto de `B12`** — eu declaro que é **portão** para workers e mostro as duas sessões pelo
  `pid`; a forma do conserto (`autocommit` × transação explícita) é código, do `builder`.
- **Cache de resposta (opção 4)** — não foi perguntado, e é decisão de contrato de leitura
  (`ADR-005`), não minha.
- **Gastar dinheiro do owner** (VPS maior) — ato do owner. Eu entreguei a pegada em MB; o `free -m`
  da VPS continua `[NÃO MEDIDO]` e é o próximo comando de quem quiser passar de 2 workers.
