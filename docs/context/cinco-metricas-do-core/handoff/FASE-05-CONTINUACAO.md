# Handoff — continuação da fase `05` (liquidações), metade backend

> Escrito em 2026-09-12 pela worktree `agent-a51f816889224e772`.
> Entrada: `handoff/FASE-05-BACKEND.md`. Plano: `docs/plans/SPEC-007-cinco-metricas-do-core/05_liquidacoes.md`.
> Commits desta rodada: `90f18fa` (T-05.1/T-05.2/T-05.4) e o desta entrega.

## ⛔ LEIA ISTO PRIMEIRO — há um bloqueio que não é técnico e não é meu

`gates/ACHADO-CRITICO-CREDENCIAIS-VIVAS-EM-REPO-PUBLICO.md`

`.env.example` — versionado e **empurrado para um GitHub PÚBLICO** — carregava os **16 valores
vivos** do `.env` de produção, incluindo **`COINALYZE_API_KEY`** e **`POSTGRES_PASSWORD`**
(`sha256` idêntico, 16/16 `[MEDIDO 2026-09-12]`). Removido do `HEAD` no commit `90f18fa`.

**Remover do `HEAD` não desvaza.** O owner tem de **rotacionar a chave e a senha**. Enquanto
não rotacionar, **toda medição de cota desta fase está sendo feita com uma chave publicada** —
e um `429` inesperado pode ser terceiro usando a chave, não o nosso coletor. Isso contamina o
diagnóstico de `RS-3.1`/`RS-3.2`.

## Estado, task a task

| task | estado | onde |
|---|---|---|
| `T-05.1` denom | ✅ **FEITA** | `gates/falsificador-denom-liquidacao.md` |
| `T-05.4` chave | ✅ **FEITA** (e achou o vazamento) | `gates/T-05.4-chave-coinalyze-morde-e-cala.md` |
| `T-05.2` retenção | ✅ **FEITA** | `gates/retencao-liquidation-history.md` |
| `T-05.3` identidade | ✅ **FEITA** | `domain/liquidation_catalog.py` + `tests/sentimento/test_liquidation_catalog.py` |
| `T-05.5` coletor | ⛔ **NÃO COMEÇADA** | — |
| `T-05.6` motivo do `REJECTED` | ⛔ **NÃO COMEÇADA** | — |
| `T-05.7` liveness | ⛔ **NÃO COMEÇADA** | — |
| `T-05.8`+ | ⛔ fora do recorte, **não toque** | fase 04 em curso |

## O que a pré-vistoria de `md.ingest_run` achou, e ela muda o plano de `T-05.5`

```
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At \
  -c "select endpoint, verdict, count(*), sum(n_written) from md.ingest_run group by 1,2 order by 1,2;"
```

`[MEDIDO 2026-09-12, n=5.406 runs]` — **uma única `source`: `binance-futures`.**

| endpoint | verdict | runs | `n_written` |
|---|---|---|---|
| `/fapi/v1/klines` | ACCEPTED | 1.066 | 125.312 |
| `/fapi/v1/klines` | REJECTED | 1 | 0 |
| `/fapi/v1/premiumIndex` | ACCEPTED | 4.331 | 8.688 |
| `/fapi/v1/premiumIndex` | ACCEPTED_WITH_WARNING | 2 | 0 |
| `/futures/data/openInterestHist` | ACCEPTED | 1 | 8.064 |
| `…forceOrder` (stream) | REJECTED | **5** | 0 |

⇒ **ZERO endpoint da Coinalyze.** Confirma a lição da fase 03: *existe cliente ≠ existe
coletor*. `T-05.5` é integração do zero, como o plano já avisava.

E `md.series` não tem nenhuma linha de liquidação — **`DoD 1` continua em `0`**:
```
select source, count(*), count(distinct series_key_id) from md.series group by 1;
  /fapi/v1/klines|125316|4   /fapi/v1/premiumIndex|34904|8
  /futures/data/globalLongShortAccountRatio|1039|3   /futures/data/openInterestHist|8064|4
```

## ⛔ DOIS ACHADOS QUE `T-05.6` TEM DE RESOLVER ANTES DE ESCREVER CÓDIGO

### 1. `notes` NÃO EXISTE. Em lugar nenhum.

O `DoD 5` da fase pede *"`api_code` **e/ou** `notes` não-nulos"*. Mas:

```
select column_name from information_schema.columns
 where table_schema='md' and table_name='ingest_run';
 -> run_id, source, endpoint, window, n_expected, n_returned, n_written, verdict,
    api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms,
    started_at, ended_at, writer_accounted_at
```

```
grep -n 'notes' backend/src/modules/sentimento/domain/ingest_record.py \
               backend/src/modules/sentimento/infra/postgres_ingest_record_store.py
 -> rc=1, nenhuma linha
```

**Não há coluna `notes`, não há campo `notes` em `IngestRun`, não há escrita de `notes`.**
Metade do `DoD 5` é hoje insatisfazível por construção.

**O caminho já tem precedente no próprio arquivo, e ele é seguro:** `writer_accounted_at`
(`ADR-035/D2`) é um campo **TABLE-only**, fora de `INGEST_HEALTH_RUN_COLUMNS`. O comentário em
`ingest_record.py` (linhas ~120-133) explica que `_project_run_dict` percorre **aquela tupla**,
nunca `dataclasses.fields(IngestRun)` ⇒ **um campo novo não alcança a projeção e o `sha256` de
`ADR-008/DoD-2` não se move**. `notes` deve nascer do mesmo jeito.
⚠️ Confirme lendo o comentário; **não** acrescente `notes` a `INGEST_HEALTH_RUN_COLUMNS`.

### 2. Hoje são **6 de 6** violando o `DoD 5`, não 2 de 2

```
select run_id, endpoint, verdict, coalesce(api_code::text,'NULL'), n_written, started_at
  from md.ingest_run where verdict='REJECTED' order by started_at;
```
`[MEDIDO 2026-09-12, n=6 runs REJECTED]` — **todos os 6 com `api_code` NULL** (5 de `forceOrder`,
1 de `/fapi/v1/klines` em 2026-09-11T01:40Z). O handoff de entrada dizia "2 de 2"; **subiu para
6 de 6** enquanto a fase era planejada. A dívida está **crescendo**, não parada.

## O que `T-05.5` TEM de fazer, e o que já está resolvido para ela

**Reuso obrigatório (`MEDIÇÃO §6`, e eu confirmei que os três existem e servem):**

| peça | arquivo | o que já resolve |
|---|---|---|
| cliente HTTP | `infra/coinalyze_history_client.py` | keep-alive, auth, `OSError`→`transport_error` |
| auth/conexão | `infra/https_quota_probe.py` | `authentication_headers`, `open_https_connection` |
| balde | `domain/quota_bucket.py` | `COINALYZE` é `BLIND` — contagem **local**, não há header |
| ritmo | `domain/local_quota_broker.py` | intervalo FIXO, sem rajada — é o `RS-3.6` |
| recuo | `domain/recoil_policy.py` | `Retry-After` com piso e teto, `unmet_seconds` |
| lacuna | `infra/postgres_ingest_record_store.py:208` | `record_gap` já existe — é o `RS-3.7` |
| símbolo | `domain/coinalyze_daily_series.py` | `to_coinalyze_symbol`, `ENDPOINT_PATH_BY_KIND` |

⛔ **`recoil_policy.py` traz um aviso escrito PARA VOCÊ**, no cabeçalho: capar o `sleep` é
seguro na rampa porque ela **para** no primeiro `429`; um **broker em regime retoma**, e
retomar em `seconds` quando `unmet_seconds > 0` bate no fornecedor antes da hora.
**`T-05.5` tem de repetir em `unmet_seconds`, não em `seconds`.** Está literal no arquivo.

**O que `T-05.1`/`T-05.3` já fixaram e `T-05.5` tem de obedecer:**

- o path **TEM** de levar `convert_to_usd=true`. `domain/liquidation_catalog.py` expõe
  `CONVERT_TO_USD_REQUIRED` justamente para que a requisição e a identidade não divirjam.
  **Escreva um teste que REPROVA o path sem o parâmetro** — sem ele, o padrão do fornecedor
  devolve BASE sob um rótulo que diz `quote`, e nada na resposta acusa.
- `interval=1min`, duas séries por instrumento (`cohort` `long`←`l`, `short`←`s`).
- `RS-3.4` (bucket em curso é parcial): **medido, e o `daily` prova** — às 14:14Z o bucket
  `t=2026-09-12T00:00:00Z` já vinha, com o dia ainda correndo. Não grave o mais novo como final.

**Cota, com os números medidos por mim hoje:** teto 40/60 s em janela **deslizante**; gastei
**7 chamadas** no total (2 em `T-05.1` + 5 em `T-05.2`), **sem nenhum `429`**. A cadência
adotada é **5 min** com `N=10` ⇒ 2 u/min = **5% do teto**. **Espalhe**: média não é pico.

## O que `T-05.7` ganhou de graça e não precisa remedir

**Só 20,2% dos buckets de 1 min têm liquidação** `[MEDIDO 2026-09-12, n=14.344 buckets
possíveis em 239,07 h, 2.900 preenchidos]`. É o número que **prova** que liveness por taxa não
funciona: 4 de cada 5 minutos saudáveis são indistinguíveis de cano morto. Use contiguidade e
heartbeat, como a task manda — agora com o número, não só com o argumento.

## Ordem sugerida para a próxima rodada

1. `T-05.6` **primeiro**, não depois. A task está com `depends_on = ["T-05.5"]`, mas o achado
   do `notes` é **estrutural** (campo novo em `IngestRun` + migração) e descobri-lo no meio de
   `T-05.5` obriga a refazer a escrita do run. ⚠️ **Isto contraria o `depends_on` do
   `tasks.toml` — não inverta por conta própria; leve ao orquestrador.**
2. `T-05.5` (a mais larga — handoff próprio em `handoff/T-05.5.md` se passar de ~150 turnos).
3. `T-05.7`.

## Falsificadores em aberto que eu deixo nomeados

- **`label_shift`**: decidi `+interval` com a evidência do `daily` (bucket em curso ⇒ `t` é
  início). É forte, mas foi medida em **1 símbolo, 1 instante**. Se `T-05.5` observar um `t` de
  `1min` que **não** case com início de bucket, a identidade muda — e mudar depois é migração.
- **Retenção**: medida em `BTCUSDT_PERP.A` apenas. `[NÃO MEDIDO]` para símbolo ilíquido.
- **`published_error`**: deixei `None` de propósito (`DoD 6c`, sem oráculo). A escalada ao
  `quant-architect` **não foi feita** — não é ato de builder.
