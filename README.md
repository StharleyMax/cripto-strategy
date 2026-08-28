# cripto-strategy

Plataforma pessoal de análise quantitativa de cripto-derivativos: **estrutura de preço**, **sentimento**
(Open Interest, Funding, Long/Short) e **order flow** (CVD), em prazos operacionais de **15m / 1h / 4h**,
com decisão **no fechamento do bucket**.

> ## ⚠️ Estado real: nenhuma linha de código existe
>
> Este repositório está na **fase de plataforma e dados**, e ainda **antes do build**. O que existe é
> especificação com evidência medida. O pipeline (`harness`) está em **`SPEC_DRAFT`**, e o gate `spec` é do
> owner. Rode `harness status plataforma-dados` para o estado corrente — **o ledger é a verdade, não este
> arquivo**.

## Comece por aqui

| se você quer | leia |
|---|---|
| **entender como os fluxos funcionam, em diagramas** | **[`docs/arquitetura-fluxos.md`](docs/arquitetura-fluxos.md)** ← ingestão · estrutura de dados · gráfico · estratégia · alertas |
| o contrato técnico completo | [`docs/specs/SPEC-001-plataforma-dados.md`](docs/specs/SPEC-001-plataforma-dados.md) (`DRAFT`) |
| as decisões de arquitetura, cada uma com falsificador | [`docs/adr/`](docs/adr/) — `ADR-001`..`ADR-009` |
| o que vai ser construído, em ordem | [`docs/plans/SPEC-001-plataforma-dados/index.md`](docs/plans/SPEC-001-plataforma-dados/index.md) |
| os requisitos e o porquê de cada um | [`docs/specs/PRD-001-plataforma-dados.md`](docs/specs/PRD-001-plataforma-dados.md) |
| **o que ainda depende de decisão do owner** | [`docs/decisoes-do-owner.md`](docs/decisoes-do-owner.md) — 20 perguntas, com estado |
| onde roda, e com que stack | [`docs/premissas-de-infra-e-stack.md`](docs/premissas-de-infra-e-stack.md) |
| tudo que já foi produzido, em ordem cronológica | [`docs/INDEX.md`](docs/INDEX.md) (append-only) |

## A regra que organiza este repositório

**Nenhum número sem o comando que o produziu.** Toda afirmação quantitativa nos documentos carrega o
comando, o universo (`n`) e um rótulo de força: `[MEDIDO]` · `[DOC]` · `[NÃO MEDIDO]` ·
`[PREMISSA-OWNER]` · `[INFERRED: motivo]`. Isso não é estilo — três defeitos reais deste projeto foram
encontrados exatamente por essa disciplina, incluindo uma **regra anti-lookahead que estava invertida** e
propagada por dois documentos.

Consequência prática: **os dados brutos de medição não são versionados**. Vivem em `data/` (~850 MB,
gitignored), catalogados em [`data/MANIFEST.md`](data/MANIFEST.md), que traduz os caminhos citados nos
documentos para onde o arquivo realmente está. O repositório guarda **as conclusões e os comandos**.

## O que a plataforma existe para impedir

Três modos de falha, e cada um deles é um contrato:

1. **Lookahead.** Todo dado é bitemporal — `(event_time, available_at, ingested_at, observed_at)`. Uma
   leitura de decisão em `t` só vê observações com `available_at ≤ t` **e** `bucket_end ≤ t`.
2. **Número sem procedência.** Nenhum numeral de mercado renderiza sem selo de quatro campos — série,
   idade, procedência, completude — **visível sem hover**.
3. **Lacuna preenchida em silêncio.** Lacuna nunca é preenchida no armazenamento; `LOCF` existe só na
   leitura, com `max_staleness_ms` explícito. Para série de `nature = FLOW`, `LOCF` é **erro de tipo**.

## Stack (declarada, não construída)

Monorepo `backend/` + `frontend/` · backend **Python 3.13 + FastAPI** ([`ADR-011/D5`](docs/adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md), que supersede o 3.12 de `ADR-009/D4`), modular por bounded context com
contratos de import executáveis · frontend **Next** · store **partido**: catálogo e registro em
PostgreSQL, série de mercado em store colunar append-only (finalista pendente de spike,
[`ADR-002`](docs/adr/ADR-002-motor-de-armazenamento.md)).

## Non-goals desta fase

Detectores de estrutura (SMC, pivôs, Fibonacci) · limiar de sinal · matriz de convergência · regra de
entrada/SL/TP · métricas de performance · walk-forward · paper trading · **execução de ordem**. Ver
[`PRD-001` §12](docs/specs/PRD-001-plataforma-dados.md). Esta fase entrega **o dado e o primitivo** de que
qualquer dessas escolhas depende.
