# Plano de execução — `SPEC-007` · Cinco métricas do CORE

> **SPEC:** [`SPEC-007`](../../specs/SPEC-007-cinco-metricas-do-core.md) (`DRAFT` — `SPEC_APPROVED` é gate do **owner**)
> **ADRs:** [`ADR-035`](../../adr/ADR-035-contabilidade-de-n-written-o-escritor-fecha-o-run-que-o-coletor-abriu.md) · [`ADR-036`](../../adr/ADR-036-fonte-por-metrica-do-core-a-origem-por-padrao-o-terceiro-so-onde-a-origem-e-vetada.md)
> **Vocabulário de componentes:** `harness policy --key components` (n=7). Toda fase declara o seu.

## A unidade de fase é a FATIA VERTICAL (`D1`, owner)

`coletor → escritor → md.series → /api/v1/series-history → painel com ponto visível`.
**Elo ausente ⇒ fase incompleta**, mesmo com os outros quatro verdes.

## O DoD-VERTICAL vale para as 5, sem exceção (`D2`, owner)

| id | item | como cala |
|---|---|---|
| `DoD-1` | dado no Postgres real | `count(*)` de `md.series` para a `series_key_id` da métrica **> 0** |
| `DoD-2` | a API serve | `GET /api/v1/series-history` → `n_points > 0` |
| `DoD-3` | **o ponto está na tela** | Playwright contra o **app real**: **`N ≥ 30` pontos distintos** no painel e **não** `SEM_PONTO` (`RN-S2`) |
| `DoD-4` | a contabilidade é verdadeira | `GET /api/v1/ingest-health` → run **fechado** da fonte com `n_written > 0` (`ADR-035`) |

**Emenda `RN-S1`:** para série de `5m` servida na grade de `1m` (fases `02` e `04`), `DoD-3` conta
**barras nativas distintas** — `pontos_no_DOM ÷ 5`, não linhas da escada (`SPEC-007` §1/`GA-2`).

**Reprova sempre:** `[P-seed]` violado · `DoD-3` contra mock · assert só de status HTTP · ausência
renderizada como zero (`RN-1`) · qualquer `[[rules.own]]`/alvo de `make`/allowlist **de idioma**
(`RN-4`).

## As cinco fases, na ordem e com o critério que a produziu (`[Q1]`, `SPEC-007` §3.1)

> ⛔ **A ordem foi REVISADA em 2026-09-10** (`SPEC-007`/`GA-7`): `02` e `03` trocaram depois que
> `ADR-036/D5` caiu por premissa falsa — o CVD **não** exige aggTrades nem terceiro, vem no índice
> `[9]` da mesma resposta de `/fapi/v1/klines` que a fase `01` já lê. Um dos argumentos que sustentava
> a ordem antiga (*"a `05` reusa o coletor Coinalyze da `03`"*) **deixou de existir**. A ordem antiga
> está retirada, não corrigida em silêncio.

| fase | arquivo | métrica | componentes | fonte (`ADR-036`) | painel | capacidade NOVA |
|---|---|---|---|---|---|---|
| `01` | [`01_volume.md`](01_volume.md) | volume | `sentimento` · `infra` · `web` | Binance `/fapi/v1/klines` | sub-eixo do `PricePane` (existe) | cliente `klines` + `ADR-035` |
| `02` | [`02_cvd.md`](02_cvd.md) | CVD | `sentimento` · `web` | Binance `/fapi/v1/klines`, índice `[9]` | `CvdPane` (existe) | **nenhuma** |
| `03` | [`03_open_interest.md`](03_open_interest.md) | open interest | `sentimento` · `web` | Binance `/futures/data/openInterestHist` | `OiPane` (existe) | cliente `/futures/data/` + 1ª série `5m` |
| `04` | [`04_long_short.md`](04_long_short.md) | long/short | `sentimento` · `web` | Binance `/futures/data/` | **novo** | 1º painel novo |
| `05` | [`05_liquidacoes.md`](05_liquidacoes.md) | liquidações | `sentimento` · `infra` · `web` | Coinalyze `liquidation-history` | **novo** | **única** integração de terceiro |

**Critério da ordem, em desempate lexicográfico:** (i) painel já existe ⇒ `DoD-3` não paga wiring novo;
(ii) identidade de série já existe ⇒ não paga negociação de nome; (iii) custo conhecido antes de custo
desconhecido, e **marginal antes de novo**; (iv) cota de terceiro consumida.

**A propriedade que a ordem tem:** cada fase introduz **exatamente uma** capacidade nova, e a `02`
não introduz nenhuma.

**O marco intermediário que vale declarar:** ao fim de `03`, `/symbol` fica **3/3 painéis com ponto**,
contra **0/3 hoje** `[MEDIDO 2026-09-10, PRD-007 §1.4]`.

## Dependências entre fases

```
01 (volume + cliente klines + ADR-035 + formatador)
 ├─→ 02 (CVD)   — precisa de 01: e SO dela. Mesma resposta, indice [9]. Zero rede nova
 └─→ 03 (OI)    — precisa de 01 so por ADR-035 (DoD-4); traz o cliente /futures/data/
      └─→ 04 (long/short) — precisa de 03: reusa aquele cliente; 1o painel novo
05 (liquidacoes) — NAO depende de nenhuma outra. Integracao de terceiro, do zero
```

⚠️ **`05` perdeu a dependência que a barateava.** Na versão anterior ela reusava o coletor Coinalyze
da fase de CVD; agora é integração completa. Ela continua em último por ser a única com terceiro e
porque `ADR-036/D4` lhe deu caminho de saída — **mas o `/tech-lead` deve dimensioná-la como
integração completa, não como "um endpoint a mais"**.

`ADR-035` é pago **uma vez, na fase `01`**, para todas — é a única concessão horizontal desta feature,
e `PRD-007` §8/`DEF-1` já a declarou.

## O que este plano NÃO faz

Não cria task (é `/tech-lead`), não cria unidade de valor no tracker, não aprova SPEC nem fase. Os
`NG-1..NG-10` de `PRD-007` §12 continuam fora, mais os três itens de `SPEC-007` §9.
