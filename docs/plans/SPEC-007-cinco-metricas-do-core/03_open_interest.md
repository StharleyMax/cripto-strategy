# Fase `03` — Open interest: o cliente de `/futures/data/` e a primeira série de `5m`

> **Métrica:** M2 · **Fonte:** Binance `/futures/data/openInterestHist` (`ADR-036/D2`) · **Painel:** `OiPane` (existe)
> **Componentes:** `sentimento` · `web` · **Requisitos:** `RF-1` `RF-2` `RF-3` `RNF-2` `RNF-3`
> **Cota Coinalyze consumida: 0.** Esta fase introduz **duas** capacidades novas — o cliente de
> `/futures/data/` e a primeira série de `5m` na grade de `1m` (`RN-S1`) — mas nenhuma delas paga
> wiring de tela, porque painel e identidade já existem.
>
> ⚠️ **Era a fase `02` na primeira versão do plano.** Trocou com o CVD depois que `SPEC-007`/`GA-7`
> tornou aquela fatia marginal (mesma resposta da `01`). O critério não mudou; os números que ele
> consome mudaram.

## O que ela herda e o que ela cria

**Herda:** a identidade `sum_open_interest` já existe em `open_interest_catalog.py:92,113`, com
`interval="5m"`, `native_grid="5min"`, `max_staleness_ms = 2 × 300_000`
`[MEDIDO 2026-09-10: open_interest_catalog.py:53-72]`, e já há entrada para os providers `binance` e
`coinalyze`. **Herdar não é "não fazer nada"**: a entrada tem de estar registrada no `SeriesCatalog`
**servido**, senão `/api/v1/series-history` devolve `422 UnknownSeriesKeyIdError`.

**Cria:** o coletor. `infra` de open interest tem 3 arquivos que **citam** o termo, e o que existe é um
`probe` de `openInterestHist`, não coletor de produção
`[DOC: INVENTARIO-POR-METRICA.md, com o aviso de que a contagem é de citação, não de funcionalidade]`.
⚠️ **Abrir os 3 arquivos antes de estimar** — a própria tabela do inventário pede isso.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 3.1 | Abrir os 3 arquivos de `infra` que citam open interest e declarar o que é probe e o que é reusável | `sentimento` | — |
| 3.2 | Coletor de `/futures/data/openInterestHist`, cadência em **configuração** | `sentimento` | `RF-1`, `RS-3.5` |
| 3.3 | **Medir o limite real de `/futures/data/`** — hoje é `[NÃO MEDIDO]` neste repositório (`ADR-036/D2`) | `sentimento` | `RNF-3` |
| 3.3b | **Declarar a profundidade:** `/futures/data/*` **corta em ~30 dias** — `startTime` de −60 d devolve **HTTP 400** `[MEDIDO 2026-09-10]`. Boa para operar a `15min..4h`, **insuficiente para backtest longo** (`SPEC-007` §9.2) | `sentimento` | `ADR-036/D2` |
| 3.4 | `sum_open_interest` registrada no catálogo servido, providers coerentes com `ADR-036` | `sentimento` | `RF-2` |
| 3.5 | `OiPane` recebe dado; `SEM_PONTO` continua honesto na ausência | `web` | `RF-3`, `RN-1` |
| 3.6 | `RNF-2`: o painel não exibe dado mais velho que a periodicidade sem dizer que é velho — reusa `liveness.stale_after_s` já servido | `web` | `RNF-2` |
| 3.7 | e2e Playwright contra o app real, **com o divisor de `RN-S1`** | `web` | `DoD-3` |

## DoD verificável

1. `count(*)` de `md.series` para `sum_open_interest` **> 0**. Hoje: `0` `[MEDIDO 2026-09-10]`.
2. `GET /api/v1/series-history` → `n_points > 0`.
3. Playwright: **`N ≥ 30` barras nativas distintas** — e o comando **nomeia o divisor**:
   `pontos_no_DOM ÷ 5`, porque a série é de `5m` servida numa grade de `1m` (`RN-S1`,
   `SPEC-007`/`GA-2`). Sem o divisor, 1 barra real e 5 linhas repetidas "passariam" com `N = 5`.
4. `GET /api/v1/ingest-health` → run fechado da fonte com `n_written > 0` (já possível desde `01`).
5. Limite de `/futures/data/` medido, com comando e `n`, registrado no gate.
6. Profundidade de `/futures/data/*` declarada no gate (~30 dias, com o comando que devolve o `400`) —
   é o que impede o `backtest` de descobrir a assimetria de profundidade por acidente.
7. `make verify` verde.

## Falsificador da fase

Se `DoD-3` contar **150** pontos onde `DoD-1` tem **30** linhas, e ninguém notar, então `RN-S1` não foi
aplicado e a fase mediu a escada em vez do dado. O divisor no comando é o que impede isso.
