# W8 — medições pós-deploy (fase 06 DoD 3/4; fase 05 DoD 2/3) e limpeza das duplicatas

Deploy local de `master @ 358b1b5` (PR #241) às 2026-10-03T11:36:52Z (`make compose-local ARGS="up -d --build"`).
Todas as medidas são do orquestrador, contra o Docker local (não é produção).

## Fase 06 · DoD 3 — tempo da tela (T-06.3)

Mesmo script e mesmas janelas fixas do ANTES (`gates/T-06.3-build.md` §DoD 3):
`python3 scripts/screen-latency-probe.py --layer {api|page} --interval {1m|1h} --runs N`.
ANTES `[MEDIDO 2026-10-02 23:01–23:04 UTC, load1 1,78→3,00]`; DEPOIS `[MEDIDO 2026-10-03 11:38–11:39 UTC, load1 2,66–2,94]`.

| camada | TF | ANTES mediana (n) | DEPOIS mediana (n) | DEPOIS min–max |
|---|---|---|---|---|
| API, 10 GETs em paralelo | 1m | 5,195 s (7) | **2,555 s** (7) | 2,020–2,845 |
| API, 10 GETs em paralelo | 1h | 7,210 s (7) | **3,328 s** (7) | 2,990–4,035 |
| página SSR | 1m | 6,285 s (5) | **2,626 s** (5) | 2,376–2,897 |
| página SSR | 1h | 7,431 s (5) | **3,749 s** (5) | 3,422–8,335 |

Falsificadores de memória: `oom=false`, `restarts=0`, `grep -c died` = 0, 1 pai + 2 workers (`Started server process [8]`/`[9]`), `docker stats` 450,6 MiB / 1,5 GiB.

## Fase 06 · DoD 4 — sem regravação depois de 2 boots (T-06.4)

Consulta: linhas com `ingested_at ≥ boot` em `bucket_end < boot − 10 min` cujo `(series_key_id, bucket_end)` já tinha linha antes do boot (scratchpad `dod4.sql`).

| boot | linhas desde o boot | em minuto já gravado | dessas, com valor novo |
|---|---|---|---|
| 1º (deploy, 11:36:52Z) | 401 | 11 (klines) | 11 |
| 2º (`docker restart`, 11:45:56Z) | 348 | **0** | — |

As 11 do 1º boot são velas finais de 2026-10-02 23:02/23:06/23:14 com `value_raw` diferente do anterior — o intervalo em que a stack foi reiniciada para o ANTES da T-06.3; revisão de fato, que o escritor guarda por desenho. Antes da T-06.4 o boot relia 7 dias e regravava todo minuto.

## Limpeza das duplicatas (T-06.4, `scripts/md-series-compaction/compact.sh`)

Procedimento do cabeçalho do script, pipeline parado (collector e writer parados, `lag=0 pending=0`), `T_SNAP=1791028455189` (2026-10-03T11:54:15Z). `[DECISÃO-OWNER: 2026-10-02]` local, sem backup, só duplicata provada.

| série | antes | apagadas | depois |
|---|---|---|---|
| `/fapi/v1/klines` | 9.615.210 | 6.037.680 | 3.577.530 |
| `/v1/liquidation-history` | 1.229.333 | 1.185.843 | 43.490 |
| `/futures/data/openInterestHist` | 231.472 | 76.027 | 155.445 |
| `/futures/data/globalLongShortAccountRatio` | 90.932 | 66.406 | 24.526 |
| `/fapi/v1/premiumIndex` | 223.184 | 0 | 223.184 |
| `/fapi/v1/openInterest` | 35.677 | 0 | 35.677 |

**Total apagado: 7.365.956** (todo chunk COMMIT com selecionadas = apagadas). `verify` rc=0: F-B.1 OK nas 6 fontes; F-B fingerprint dos 4.059.852 sobreviventes idêntico; q1 31.100 = 31.100; F-1 0 = 0; **F-A 100/100 envelopes iguais**, `latest_bucket_ms` nunca recuou. `VACUUM (ANALYZE, PARALLEL 0)` OK (o paralelo falhou por `/dev/shm` de 64 MB do contêiner).
⚠️ O disco do host está a 97% (7 GB livres de 233 GB) `[MEDIDO: df -h /]`; `md.series` ocupa 5,2 GB (16 partições) — o espaço das linhas apagadas é reutilizável pelo Postgres mas não volta ao disco sem `VACUUM FULL`.

## Fase 05 · DoD 3 — klines (T-05.3)

One-shot de 14 dias (`make compose-local ARGS="run --rm --no-deps -e KLINES_BACKFILL_ONE_SHOT_DAYS=14 collector python -m src.modules.sentimento.infra.klines_backfill_cli"`): `backfill_completed days=14 n_rows=483918 verdict=ACCEPTED`.
`count(distinct bucket_end)` em 4 dias, 6 séries `/fapi/v1/klines` BTCUSDT: **5.760/5.760 nas 6** `[MEDIDO 2026-10-03T12:27:58Z]` (era 5.696).

## Fase 05 · DoD 2 — liquidação (T-05.2)

Um ciclo com `LIQUIDATION_FIRST_CYCLE_LOOKBACK_S=432000` num coletor avulso (`make compose-local ARGS="run -d --no-deps --name liq-lookback-5d -e … collector"`, com o coletor normal parado; `.env` não tocado): `n_answered=4 n_unanswered=0 n_returned=4637 n_published=57515 verdict=ACCEPTED`.
4 dias, 2 séries de liquidação BTCUSDT: **5.756/5.760** `[MEDIDO 2026-10-03T12:41:38Z]` (era 1.276) — faltam só os 4 minutos da ponta (12:38–12:41), ainda não consultados.

### Reparo de 8 dias da liquidação — pedido pelo veredito da `T-05.5` (B-1)

O veredito `gates/T-05.5-DESIGN-VERDICT.md` achou buraco real em 26–28/09 (106/158/700 minutos): as janelas de 1h/4h cobrem **7 d**, e a medida de 5.756/5.760 acima cobria só **4 d** — erro de universo do orquestrador, achado pelo gate.
Um ciclo com `LIQUIDATION_FIRST_CYCLE_LOOKBACK_S=691200` (8 d), mesmo procedimento do coletor avulso: `n_answered=4 n_unanswered=0 n_returned=7322 n_published=92029 verdict=ACCEPTED`.
Minutos por dia da série `23e43323…` (BTCUSDT) `[MEDIDO 2026-10-03T13:00Z]`: 25/09 657 (início da janela de 8 d) · **26/09 a 02/10: 1.440 em cada dia** · 03/10 780 (dia corrente).
⚠️ O reparo grava `available_at` de agora: a tela, que fixa `T` na última fronteira fechada (`as_of`), só o enxerga depois que `T` passar do reparo — 14:00Z em 1h, 16:00Z em 4h. O gate da `T-05.5` (B-2) é refeito depois de 16:00Z.
