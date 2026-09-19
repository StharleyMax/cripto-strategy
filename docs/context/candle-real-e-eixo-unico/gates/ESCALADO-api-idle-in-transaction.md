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
