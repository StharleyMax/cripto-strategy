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
