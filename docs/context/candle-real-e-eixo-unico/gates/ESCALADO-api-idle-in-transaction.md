# ESCALADO — a API mantém transação aberta indefinidamente (`deploy-api-1`)

**Status: REGISTRADO, não corrigido.** `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas
apresentadas]` — o owner escolheu *"Deixar como está por enquanto"* entre três opções com custo
declarado (pôr `idle_in_transaction_session_timeout` + abrir task · só abrir a task · registrar e
seguir). **Isto não é dívida esquecida — é dívida com data e decisão.**

Componente: `infra` / `api`. **Fora do escopo de `candle-real-e-eixo-unico`.**

## O que foi medido

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc \
  "select application_name, client_addr, (now()-xact_start)::text, (now()-state_change)::text,
          left(coalesce(query,''),60)
     from pg_stat_activity where state='idle in transaction'"
```

Duas sessões de `172.18.0.4` (= `deploy-api-1`, confirmado por
`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`):

| idade da transação | parada há | query |
|---|---|---|
| **2 dias 10:16:47** | 00:14:02 | `SELECT series_key_id, symbol, source, bucket_end, event_time` |
| 05:55:21 | 05:52:43 | `SELECT run_id, source, endpoint, "window", n_expected,` |

`[MEDIDO 2026-09-19 ~20:5x UTC, n=5 backends em `pg_stat_activity`]`

## O dano PROVADO — e ele custou tempo de produção real

Qualquer DDL fica atrás dessas transações. Durante `T-01.5`,
`compose_ingest_record_store(...).initialise()` rodou `ALTER TABLE md.ingest_run ADD COLUMN`
(`ACCESS EXCLUSIVE`), ficou na fila e **parou escritor e coletor por 2m54s**. Consertado na raiz
dentro da task: o one-shot de backfill **não chama `initialise()`**, por não ser dono do esquema.

⚠️ **A causa-raiz NÃO foi consertada.** O one-shot deixou de disparar o sintoma; a próxima migração
legítima o dispara de novo.

## O dano que eu quase afirmei e a medição NEGOU

Ia registrar que isto estava inchando o banco — o horizonte de vacuum está preso há **2d10h**, e
essa é a consequência de manual. **Medido, não é o caso hoje:**

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc \
  "select relname, n_dead_tup, coalesce(last_autovacuum::text,'NUNCA')
     from pg_stat_user_tables order by n_dead_tup desc limit 3"
# ingest_run|1181|2026-09-19 14:55:59  <= a MAIOR
```

`n_dead_tup = 1.181` na maior tabela `[MEDIDO 2026-09-19]`. A carga é **append-only** (série
temporal), então quase não gera tupla morta e o horizonte preso cobra pouco. **O risco é o DDL
futuro, não o bloat de hoje** — e registrar o risco errado teria mandado quem vier medir a coisa
errada.

## Efeito colateral do redeploy de 2026-09-19

O redeploy da API (autorizado pelo owner para destravar `DoD 1`/`DoD 3` da fase `01`) **derruba as
duas sessões**. ⚠️ Isso apaga o SINTOMA, não a CAUSA: o contador volta a subir a partir do próximo
request que abrir transação e não a fechar. Se uma medição futura mostrar `xact_start` recente,
**não conclua que foi corrigido** — compare contra esta data.

## O falsificador — como saber que isto virou não-problema

Rode a consulta do topo. Se, **após um período de operação normal comparável (≥ 2 dias)**, não
houver nenhuma sessão em `idle in transaction` com `xact_start` acima de alguns minutos, a causa
foi corrigida em algum lugar e este documento pode sair. **Enquanto houver, ele fica.**

---

## ⛔ 2026-09-20 — ISTO DEIXOU DE SER TEÓRICO: derrubou a coleta INTEIRA por 9 minutos

O falsificador acima pedia uma prova de dano além do `n_dead_tup`. Ela veio sozinha, e é pior do
que o bloat que eu tinha ido procurar.

**A cadeia, medida:**

```
select pid, pg_blocking_pids(pid), round(extract(epoch from now()-query_start)) espera_s, left(query,50)
  from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0;
-- 555930 | {550219} | 538 | ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS
```

1. O deploy do coletor (`ADR-041`, offset `20 s`) subiu às `23:51:26Z`.
2. No boot, o coletor roda `ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS writer_ac…`,
   que exige `ACCESS EXCLUSIVE`.
3. Duas sessões da **API** (`client_addr 172.18.0.4` = `deploy-api-1`, `backend_start 22:15:13Z`)
   estavam `idle in transaction` havia **~50 minutos**, segurando lock conflitante.
4. O `ALTER` entrou na fila e **nunca saiu**. O coletor nunca alcançou o laço de polling.

**O sintoma, e por que ele engana:** o container fica `Up`, `healthy`, com **0,08% de CPU e
`TIME 00:00:00`** — não parece travado, parece ocioso. E `docker logs` devolve **0 linhas**,
porque não há `PYTHONUNBUFFERED` no `deploy/compose.yml:228-231` e o stdout do Python fica retido
no buffer de 8 KB. **Um coletor morto e um coletor entre ciclos são indistinguíveis por fora.**

**O dano, medido no banco** (`select src_label_raw, (now-max(ingested_at)) from md.series group by 1`):
as **cinco** séries mudas por `435`–`549 s`. Não foi só klines — `ALTER` em fila bloqueia todo
mundo atrás dele. Universo de comparação: **zero gaps > 120 s nas 6 h anteriores**
`[MEDIDO 2026-09-20, n=6h de ingestão contínua]`, então 9 minutos não é variação, é parada.

**Como foi destravado:** `pg_terminate_backend` é ação de interferência e foi recusada; o caminho
usado foi reiniciar o **próprio serviço defeituoso** — `make compose-local ARGS="restart api"` —,
que fecha as conexões dele. Silêncio caiu de `519 s` para `72 s` no minuto seguinte.

## O que isto muda na severidade

Estava arquivado como **não-bloqueante** com o argumento de que o workload é append-only e
`n_dead_tup=1181` é desprezível. **O argumento continua certo e é irrelevante:** o dano real não é
bloat, é **fila de lock**. Qualquer migração de schema no boot de qualquer serviço fica refém de
uma transação ociosa da API, e o modo de falha é **silencioso e indistinguível de ocioso**.

**Dois consertos, e eles são independentes:**

| | conserto | por que sozinho não basta |
|---|---|---|
| 1 | a API não deve deixar transação aberta em leitura (causa-raiz) | não impede que OUTRO cliente repita |
| 2 | `lock_timeout` no `ALTER` de boot + `PYTHONUNBUFFERED=1` no compose | não conserta a API, mas troca **parada silenciosa** por **erro que se nomeia** |

⚠️ **O item 2 é o que eu teria querido ter hoje.** Passei ~9 minutos tratando "coletor ocioso"
como hipótese de offset — o ticker chegou a ser lido e inocentado (`next_grid_instant_s` dá sono
≤ 60 s) — porque nada no sistema dizia "estou esperando um lock". Um `lock_timeout` de 30 s teria
matado o boot com a mensagem certa na primeira vez.

---

## 2026-09-27: reincidência e conserto

**O dano.** A reincidência parou a ingestão inteira por **11h16min, de 00:22Z a 11:38Z** de
2026-09-27. O destrave foi `make compose-local ARGS="restart api"` às 11:38Z
`[DOC: wave/paineis-f03b@cbd4d16, docs/context/paineis-de-fluxo/handoff/DECISOES-DO-OWNER-2026-09-27.md:10,22-24]`.
Duas consequências de feature estão escritas lá: a cobertura da `T-03.7` (DoD-1) reprovou com 1.280
linhas por símbolo contra 1.368, e a janela de 24h recomeça em 11:39Z. O `T-04.6-builder` também
registrou o coletor de liquidação parado desde 00:20Z (linha de `docs/INDEX.md` de 2026-09-27T04:30Z).

Isto é o modo de falha da seção de 2026-09-20, com duração 70× maior. A escolha de 2026-09-19
("deixar como está") está vencida: ela custou 9 minutos no dia 20 e 11h16min no dia 27.

**A decisão, D-2** `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`:
*"`idle_in_transaction_session_timeout` no acesso da API + task para achar a causa"*. As alternativas
recusadas foram "só o timeout" e "deixar como está". Isto não é fala do owner. É a opção que ele
escolheu num menu redigido por agente.

**A causa, achada** (`docs/context/paineis-de-fluxo/handoff/WI-desenho-infra-architect.md` §1). A API
abre duas conexões `psycopg` de vida longa em `create_app`. Elas usam o `autocommit=False` padrão do
psycopg 3, e nenhuma leitura faz `commit`. O primeiro `SELECT` abre uma transação que só fecha quando a
API reinicia, e ela guarda `AccessShareLock` em `md.series` e nos chunks. Medido às 12:03:49Z: a API
reiniciada às 11:38:36Z já tinha uma sessão `idle in transaction` com 48 relações travadas (§1.3).

**O conserto** (`83e7a78`) tem duas peças, e elas são as duas linhas da tabela acima:

1. **A causa:** as 2 conexões de `create_app` nascem com `connect=connect_autocommit`. Writer e coletor
   mantêm o padrão sem mudança.
2. **A rede de proteção, só na API:** `PGOPTIONS=-c idle_in_transaction_session_timeout=30s` e
   `PGAPPNAME=cripto-api` em `services.api.environment` do `deploy/compose.yml`. O role e o `.env` não
   mudam, porque são compartilhados pelas três aplicações. O timeout sozinho quebraria a API (500 até
   reiniciar, desenho §4), por isso as duas peças vão juntas.

**Os laudos** (os quatro em `docs/context/paineis-de-fluxo/gates/`):

| portão | veredito | o que mediu |
|---|---|---|
| [`WI-QA.md`](../../paineis-de-fluxo/gates/WI-QA.md) | **APPROVED** | vazamento reproduzido sem o conserto (*"2 of 2 idle in transaction"*, 3 failed). As mutações A, B e M4 a M8 mordem em cópia isolada. `make verify` verde: 2829 passed, cobertura 96,23%, e2e 87 |
| [`WI-REVIEW.md`](../../paineis-de-fluxo/gates/WI-REVIEW.md) | **COMPLIANT** | 0/8 regras bloqueantes em 8 arquivos, import-linter com 7 contratos kept. O timeout fica só na API |
| [`WI-CODE-REVIEW.md`](../../paineis-de-fluxo/gates/WI-CODE-REVIEW.md) | **APPROVED** | 0 achado de correção confirmado entre 9 candidatos. As mutações A/B nos 2 call sites de `create_app` reprovam com 2 failed cada |
| [`WI-INFRA.md`](../../paineis-de-fluxo/gates/WI-INFRA.md) | **APPROVED, 2 condições de deploy** | a API sobe primeiro e sozinha (`--no-deps api`). O portão do deploy é o §5.3 do desenho: `api 30s · writer 0 · collector 0`, `PGOPTIONS`/`PGAPPNAME` no `/proc/1/environ` e `2\|0` por `application_name='cripto-api'` (`0\|0` não conta como verde) |

**O que muda no falsificador acima.** A consulta passa a usar `application_name='cripto-api'`, não
o IP, porque o IP da API mudou de `172.18.0.4` para `172.18.0.3` entre 09-19 e 09-27 (desenho §1.3). O
critério de saída continua o mesmo: `2|0` em toda leitura por ≥ 2 dias de uso normal, e **0**
`IdleInTransactionSessionTimeout` no log da API (desenho §5.4). Um disparo do timeout não prova que ele
funciona. Prova que um caminho novo abriu transação, e essa é a regressão a caçar. **Este documento
fica até o falsificador passar.** A leitura do §5.3 depois do deploy vai no PR da trilha WI.
