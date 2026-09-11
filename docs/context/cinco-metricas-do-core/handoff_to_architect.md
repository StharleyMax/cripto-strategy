# Handoff `/pm` → `/architect` — `cinco-metricas-do-core` (2026-09-10)

**PRD:** [`docs/specs/PRD-007-cinco-metricas-do-core.md`](../../specs/PRD-007-cinco-metricas-do-core.md)
(árvore de referência `8dc8941`). **Estado no ledger:** `INIT`.

## Leia nesta ordem (são curtos)

1. [`handoff/DECISOES-OWNER.md`](handoff/DECISOES-OWNER.md) — `D1` (fatia vertical), `D2`
   (DoD-VERTICAL de 4 itens), `D3` (ledger). **Não reabrir.**
2. [`handoff/DIAGNOSTICO.md`](handoff/DIAGNOSTICO.md) — os números de 2026-09-10.
3. O PRD, começando por **§6** (o DoD-VERTICAL testável), **§8** (os 3 defeitos, dentro/fora com
   custo) e **§15** (as 7 perguntas que são suas).

## O que o PRD fecha

- O CORE é uma lista **fechada de 5 métricas** (§1.2); as 5 têm **0 linha** em `md.series`.
- **Uma fase = uma fatia vertical** de 5 elos (§4.1); **fatia 1 = volume (klines)**, decidida pelo owner.
- O **DoD-VERTICAL** está escrito como 4 comandos com coluna "morde" (§6) — vale para **toda** fase.
- Os 3 defeitos do diagnóstico têm decisão com custo (§8): `DEF-1` (`n_written`) **dentro, fatia 1**;
  `DEF-2` (forceOrder) **dentro, atado à fatia de liquidações**; `DEF-3` (log sem `extra={}`) **fora**,
  com uma exceção que virou `[Q5]`.
- **Nenhum gap bloqueante** ⇒ sem `feedback_to_pm.md`.

## O que é seu, e o PRD deliberadamente não decidiu

`[Q1]` ordem das fatias 2–5 · `[Q2]` `series_key` canônica e grade nativa das 5 ·
`[Q3]` se o diagnóstico do forceOrder é spike **antes** de `[Q1]` (custo da fatia de liquidações é
desconhecido hoje) · `[Q4]` fonte de CVD sob o veto a gigas de aggTrades · `[Q5]` semântica de
`n_written` · `[Q6]` volume em painel próprio ou sub-eixo do Preço (`frontend-architect` + design gate) ·
`[Q7]` dias de backfill para `DoD-3` sem violar a proibição de seedar o Postgres compartilhado.

## Armadilhas nomeadas

- `RF-4` preenche o **valor** de `n_written`; **não** toca nome nem ordem de `INGEST_HEALTH_RUN_COLUMNS`
  (`ADR-008/D3` — a ordem alimenta o `sha256` da projeção canônica).
- `DoD-3` roda contra o **app real**, com assert de dado no DOM, e **sem** seedar o Postgres
  compartilhado.
- `DEF-1` muda o **valor** de `uptimePercent` no `/collector-status` já servido (hoje `0.0` com o
  coletor `ATIVO` e 1.429 runs na janela) — declarar a mudança, não escondê-la.
