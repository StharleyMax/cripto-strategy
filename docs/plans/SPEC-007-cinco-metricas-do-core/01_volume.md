# Fase `01` — Volume ponta a ponta, e a contabilidade que todas as outras precisam

> **Métrica:** M1 · **Fonte:** Binance `/fapi/v1/klines` (`D1.b`, owner) · **Painel:** sub-eixo do `PricePane`
> **Componentes:** `sentimento` (coletor, identidade, mapeamento) · `infra` (escritor, formatador) · `web` (sub-eixo)
> **Requisitos cobertos:** `RF-1` `RF-2` `RF-3` `RF-4` `RF-5` `RNF-1` `RNF-2` `RNF-3` · `DEF-1` · `[Q5]` `[Q6]` `[Q7]`

## Por que esta fase é maior que as outras, e é a única assim

Ela paga `ADR-035` (contabilidade de `n_written`) **uma vez, para as cinco**. Sem isso, `DoD-4` é
insatisfazível por construção e o gate de `D2` degrada para 3 itens em silêncio. É a única concessão
horizontal da feature, e `PRD-007` §8/`DEF-1` já a declarou e precificou.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 1.1 | Identidade `klines_volume` (`interval="1m"`, `FLOW`, `SUM`, `denom="base"`) como entrada de catálogo, com **teste nomeado** em `verified_by` | `sentimento` | `RF-2`, `SPEC-007` §4.1 |
| 1.2 | Cliente REST de `/fapi/v1/klines` — **não existe nenhum hoje** (`infra` de klines = **0** `[DOC: INVENTARIO-POR-METRICA.md]`) | `sentimento` | `RF-1` |
| 1.3 | Coletor: ciclo periódico + **backfill de 7 dias no boot** (7 chamadas × 1500 barras), publicando na fila | `sentimento` | `RF-1`, `[Q7]` |
| 1.4 | `RS-3.4`: o bucket **em curso** não é gravado como final (anti-lookahead) | `sentimento` | `RNF-3` |
| 1.4b | **O cliente NÃO descarta o array cru:** a fase `02` (CVD) lê o índice `[9]` (`takerBuyBaseVol`) da **mesma resposta** (`ADR-036/D5`, `SPEC-007`/`GA-7`). Um cliente que projete só o `[5]` obriga a `02` a refazer a chamada — e a `02` existe justamente por não precisar | `sentimento` | `ADR-036/D5` |
| 1.5 | `run_id` viaja com o lote; **o escritor fecha o run** pelo upsert existente | `sentimento` + `infra` | `RF-4`, `ADR-035/D2` |
| 1.6 | Distinguir run **aberto** de run que **escreveu zero** — sem isso trocamos um `rc=0` por outro | `infra` | `ADR-035/D2` |
| 1.7 | Formatador do processo de serviço passa a **imprimir `extra`**; `stdout` de CLI de projeção **não** é contaminado | `infra` | `ADR-035/D3` |
| 1.8 | Entrada registrada no `SeriesCatalog` **servido** por `/api/v1/series-catalog` | `sentimento` | `RF-2` |
| 1.9 | Sub-eixo de volume no `PricePane`, com `SEM_PONTO` na ausência | `web` | `RF-3`, `RN-1` |
| 1.10 | **Veredito do `ux-ui-mastery`** sobre o sub-eixo — a autonomia do design é condicionada ao gate | `web` | `CLAUDE.md` §Design |
| 1.11 | e2e Playwright contra o **app real**, sem semear o Postgres compartilhado | `web` | `DoD-3`, `[P-seed]` |
| 1.12 | Registrar `uptimePercent` do `premiumIndex` **antes e depois** | `infra` | `RS-1.a` |

## DoD verificável — comando e universo, nunca "os testes passam"

1. `docker exec deploy-api-1 …` → `count(*)` de `md.series` para a `series_key_id` de `klines_volume`
   **≥ 10.000** (7 dias de grade de 1 min = 10.080 barras por símbolo). **Hoje: `0`**
   `[MEDIDO 2026-09-10, n=23.512 linhas, nenhuma do CORE]`.
2. `GET /api/v1/series-history?series_key_id=<klines_volume>&interval=1m&…` → `n_points > 0`.
3. Playwright contra o app real: o sub-eixo de volume tem **`N ≥ 30`** pontos distintos no DOM e o
   painel **não** exibe `SEM_PONTO`.
4. `GET /api/v1/ingest-health` → **≥ 1 run fechado** de `/fapi/v1/klines` com `n_written > 0`, e
   `Σ n_written` dos runs fechados **igual** ao `count(*)` do item 1 no mesmo intervalo. **Hoje: 0 de
   2.910 runs têm `n_written > 0`** `[MEDIDO 2026-09-10]`.
5. `docker logs` do escritor → a linha `writer_batch_acked` **mostra** `n_accepted`/`n_rejected`.
6. `uptimePercent` do `premiumIndex` **deixa de ser `0.0`**, com o valor antes/depois no gate.
7. **A resposta crua de `klines` preserva os 12 campos do array** — teste que prova que o índice `[9]`
   sobrevive à camada de parsing. É o que impede a fase `02` de virar uma segunda chamada de rede.
8. `make verify` verde.

## O que esta fase NÃO faz

**Não entrega o CVD.** Ele vem no índice `[9]` da mesma resposta e é tentador juntar — mas `D1` (owner)
diz que uma fase é uma métrica, e o DoD-VERTICAL é por métrica (`SPEC-007` §8.4). O item `1.4b` existe
para que a fase `02` seja barata, **não** para que ela seja absorvida aqui.

Não renomeia os 4 eventos de log em português (`NG-5`) · não toca `INGEST_HEALTH_RUN_COLUMNS`
(`RS-2`, `NG-6`) · não muda a **forma** de nenhum contrato servido (`RF-5`) · não cria painel novo.

## Falsificador da fase

Um run **fechado** com `n_written = 0` enquanto `md.series` ganhou linhas daquele `series_key_id` na
mesma janela ⇒ o `run_id` não sobreviveu ao transporte e `ADR-035/D2` escolheu o caminho errado.
