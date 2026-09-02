# Medição — `T-03.8`: skew de relógio contra `/fapi/v1/time`, 5 corridas reais

`CA-F0-8`, `[GAP G6]`, plano `03` item 3.7, DoD `D3.10`. **A tolerância não é decidida aqui** —
`T-07.10` lê a distribuição acumulada e decide o limiar (`SPEC-001` §5.9).

## O que isto é, e o que não é

`D3.10` pede a distribuição acumulada de `clock_skew_ms` sobre **≥ 7 dias de runs** — isso é
`[NÃO MEDIDO]` por definição: nenhum coletor roda em produção ainda (`Q1`/`Q15` seguem
`[NÃO SEI]` para deploy contínuo, per `backend/scripts/test.sh`). O que esta pasta prova é que
**o mecanismo funciona de ponta a ponta**: mede o skew real contra o endpoint real, persiste em
`md.ingest_run` real, e a leitura que `T-07.10` vai fazer (`ingest_health_query`, a MESMA função
que `T-07.13` consome) já enxerga essas linhas hoje.

## Os comandos, literais

```bash
STORE=/tmp/.tmp_store.sqlite3
for i in 1 2 3 4 5; do
  PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.ntp_skew_probe_cli --store "$STORE"
  sleep 1
done
PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.ingest_health_cli "$STORE"
```

- [`00_probe_summaries.jsonl`](00_probe_summaries.jsonl) — o `stdout` de cada uma das 5
  chamadas ao probe, uma corrida por linha.
- [`01_ingest_health_query.jsonl`](01_ingest_health_query.jsonl) — a projeção canônica de
  `ingest_health_query` sobre o store das 5 corridas: `n_runs: 5`, `n_gaps: 0`, as 15 colunas
  de `ADR-008/D3`.

O arquivo `.sqlite3` que os dois comandos leram e escreveram **não é versionado** — é o mesmo
tipo de estado runtime que `data/` já exclui (`.gitignore`), reproduzível a partir dos dois
comandos acima em segundos.

## O número, com a força que ele tem

**`[MEDIDO 2026-09-01T23:05Z, n=5 corridas, universo: 1 host, 1 endpoint (`GET /fapi/v1/time`),
janela de ~7 s]`: `clock_skew_ms` variou entre `-73` e `-23`** (relógio local ~23–73 ms ATRÁS do
servidor da Binance) — 5 pontos, não uma distribuição. `weight_used` variou `1..5` na mesma
janela de 1 min, medido do header `x-mbx-used-weight-1m` a cada chamada, nunca hardcoded.
Nenhuma linha usa `ACCEPTED_WITH_WARNING`/`REJECTED`: as 5 leram `serverTime` de um `200` limpo.

**O que isto NÃO prova:** que o skew fica nessa faixa em produção, por dias, sob a carga real de
um coletor. Isso é exatamente o motivo de `D3.10` pedir `≥ 7 dias` e de a tolerância se calibrar
em `T-07.10` — 5 pontos de uma sessão de terminal são o suficiente para provar o MECANISMO,
nunca o REGIME.
