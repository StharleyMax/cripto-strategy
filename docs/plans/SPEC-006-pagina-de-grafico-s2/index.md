# Plano de execução — `SPEC-006` · Página de gráfico S2

**SPEC:** [`SPEC-006`](../../specs/SPEC-006-pagina-de-grafico-s2.md) (`SPEC_DRAFT`; `SPEC_APPROVED`
exige `approve spec` do owner — estado corrente sempre por `harness pipeline state
pagina-de-grafico-s2`) · **ADR:** [`ADR-034`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md)
**PRD:** [`PRD-006`](../../specs/PRD-006-pagina-de-grafico-s2.md) · **Feature:** `pagina-de-grafico-s2`
(filha de `plataforma-dados`) · **Rev de ancoragem:** `master@adf6537` · **Data:** 2026-09-08
**Tracker:** unidades de valor candidatas em `PRD-006 §6`; materialização é ato do `/tech-lead`
após `SPEC_APPROVED`.

---

## As quatro fases, a ordem, e por que F0 existe

`F0` não estava no PRD — nasceu do dispatch a `quant-architect` durante a escrita da SPEC: `md.series`
não tem coluna de valor (`ADR-034/D7`). Sem ela, `F1` não tem o que servir além de metadados de
procedência. A ordem **F0 → F1 → F2**, com **F3 em paralelo, fechando por último**, é dependência
real medida, não cerimônia (mesmo princípio de `SPEC-004 §"Por que a ordem não é cerimônia"`).

| fase | entrega | componente | requisitos | depende de |
|---|---|---|---|---|
| [`00`](00_coluna_de_valor.md) | `value_raw` em `md.series`/`SeriesRow`/`series_row_wire.py` | `sentimento` | `ADR-034/D7`; `CA-F0-1..2` | nada |
| [`01`](01_rotas_de_serie.md) | leitor de janela + use-case de leitura; `/series-history`; `/series-live` | `sentimento`, `web` | `US-1..3`; `RF-1..3`, `RN-7..9`; `CA-F1-1..6` | `00` |
| [`02`](02_pagina_symbol.md) | barrel `charts/index.ts`; exceção ESLint escopada; página `/symbol` | `web`, `charts` | `US-4..6`; `RF-4`; `RN-3`; `CA-F2-1..4` | `01` |
| [`03`](03_migracao_console.md) | `/painel` → `/console`; `ROUTES.panel`; redirect 308; e2e | `web` | `US-7..8`; `RF-5..6`; `CA-F3-1..3` | independente de `01`/`02`; fecha por último |

---

## Regras que valem em TODAS as fases

**`R-A`** Todo DoD nomeia comando e universo — "testes passam" não é DoD.
**`R-B`** Todo DoD tem a coluna "morde" — mesmo veredito nos dois lados = DoD vacuoso.
**`R-C`** `value_raw` é a única fonte de número em `/series-history` — `grep -rn 'MOCK\|FIXTURE'
backend/src/api/routes/series_history.py` fora de teste = **0** em toda fase depois de `01` (`RN-7`).
**`R-D`** `interval` ≠ `1m` nunca é aproximado, sempre recusado (`RN-8`/`ADR-034/D6`).
**`R-E`** Página `/symbol` importa só `frontend/src/charts/index.ts` — nenhum import profundo de
`charts` (`ADR-034/D8`; falsificador de 3 casos em `02`).
**`R-F`** Idioma — código/evento de log/exceção novos em inglês (`CLAUDE.md`); `sentimento`/`charts`/
`web` ficam.
**`R-G`** Verificação é `make verify`; testes de rota/E2E declarados por fase.
**`R-H`** O subagente devolve ponteiro, não relatório — relatórios em
`docs/context/pagina-de-grafico-s2/gates/`.
**`R-I`** Nenhum número sem o comando que o produziu.

---

## O que este plano NÃO faz

Não decide reagregação de CVD para `interval`≠`1m` (`NG-9`, `ADR-034/D6`) · não implanta na VPS ·
não constrói geometria nova de `charts` (os 32 módulos `s2-*` já existem) · não muda envelope de
`/collector-status`/`/ingest-health`/`/series-catalog`/`/series-quarantine` · não decide o custo de
re-ingestão de dado de produção já gravado sem `value_raw` (`M3`, owner) · não move o destino
lógico de `/` (continua `/console`, não `/symbol`, `NG-8` do PRD).

## Juízes por fase

`00`/`01`: `quant-architect` (dono de `sentimento`; assina o schema e o ponto de leitura) · `02`:
`frontend-architect` (fronteira `charts`↔`web`, `ADR-003`) + `ux-ui-mastery` como gate de UI (design
já aprovado no Stitch, `S2 Rev. B`) · `03`: `frontend-architect`. QA: `harness-plugin:qa`/`frontend-qa`
sobre cada fase com os DoDs de `SPEC-006 §8`.
