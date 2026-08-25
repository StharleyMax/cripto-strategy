# Plano de execução — SPEC-001 `plataforma-dados`

**SPEC:** [`SPEC-001`](../../specs/SPEC-001-plataforma-dados.md) (`DRAFT`) · **Data:** 2026-08-25
**Epics existentes no tracker (lidos, não escritos):** `CST-1`..`CST-7`
**Componentes (vocabulário fechado):** `sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs`

## Regra deste plano

1. **Cada item referencia o requisito que cobre** (`CA-*`, `R-*`, `QF-*`, `ZL-*`, `[GAP G*]`, ADR) e **declara UM componente alvo**.
2. **Cada fase tem DoD que nomeia o COMANDO e o UNIVERSO.** *"Testes passam"* não é DoD.
3. **Fases pequenas.** Nenhuma fase abre e fecha em prazos opostos; cada uma tem DoD encerrável.
4. **Nenhuma fase escreve no tracker.** Materializar tasks é ato do `/tech-lead`.

## As nove fases

| # | fase | componente predominante | Epic | gate |
|---|---|---|---|---|
| [`01`](01_governanca_gateante.md) | Governança gateante — runner, dono de julgamento, cobertura de `frontend/` | `docs` | `CST-1` | nenhum |
| [`02`](02_captura_sem_gate_de_host.md) | Captura que **não** precisa de host 24/7 — snapshot datado + one-shot Coinalyze `daily` | `sentimento` | `CST-2` | `Q1` |
| [`03`](03_captura_continua.md) | Captura contínua — `forceOrder`, `premiumIndex`, probe, skew, **agregado `q`/`nq`** | `sentimento` | `CST-2` | `Q1` + `Q2` + `Q19` (+ `Q17` p/ spread) |
| [`04`](04_contrato_temporal.md) | Contrato temporal e identidade — **offline, sem rede, sem chave** | `sentimento` | `CST-3` | nenhum |
| [`05`](05_fatia_visivel.md) | S2-mínima + auth mínima — a primeira fatia de valor visível | `charts` / `web` | `CST-3` | `Q16` |
| [`06`](06_semantica_declarada.md) | `series_catalog` + quarentena + S3 | `sentimento` / `web` | `CST-4` | nenhum |
| [`07`](07_aquisicao_em_regime.md) | Aquisição em regime + S1 + `universe_at` | `sentimento` / `web` | `Q3`, `Q18` |
| [`08`](08_superficie_e_reprodutibilidade.md) | Motor, S4, S2 completa, `run_registry` | `charts` / `backtest` | `CST-6` | `Q10`, `Q11`, `Q13` |
| [`09`](09_consolidacao_de_fronteira.md) | ADRs numerados, `env`, consolidação | `docs` | `CST-7` | nenhum |

## Ordem e dependência real

```
01 (gateia tudo)
 └─> 02 ──┐                      02 e 03 são o MESMO Epic, separados pelo GATE
     03 ──┴─> 04 ──> 05
                 └──> 06 ──> 07 ──> 08 ──> 09
```

**`01` gateia `02`** e não o contrário: as condições de pronto de `02` e `03` **já são testes** (`CA-F0-3`, `CA-F0-4`, `CA-F0-5`) e `harness policy --key test_cmd` devolve **`{}`**. Sem runner, a fase cujo dado não se recaptura termina com afirmações não conferíveis.

**`04` não depende de rede.** Todos os fixtures estão em disco (`data/`, 850 MB, `data/MANIFEST.md`). Ela pode correr em paralelo com `03`.

## ⚠️ Divergência declarada em relação à fronteira dos Epics

**Nove fases sobre sete Epics. Nenhum Epic novo, nenhuma fronteira de valor movida.** Dois Epics são partidos, e o critério é **a fronteira do gate**, não o tamanho:

| Epic | fases | por que partido |
|---|---|---|
| `CST-2` (F0) | `02`, `03` | **o gate de F0 é declarado POR COLETOR.** O snapshot diário e o one-shot da Coinalyze **não precisam de `Q2`** (um `GET` mais `gzip`; 1.140 chamadas ≈ 28,5 min uma vez); os coletores contínuos precisam. Fatiar em outro lugar reintroduziria o gate de fase que R1 removeu de propósito |
| `CST-3` (F1) | `04`, `05` | `04` é **contrato sem rede e sem chave**; `05` é a primeira superfície servida de host exposto. **Duas classes de risco, dois DoD.** E `05` carrega auth, que hoje não tem Epic (SPEC §8.3) |

**E a reconciliação de contagem que o PRD não fez:** PRD §13.5 diz *"SEIS Epics, com um sétimo contingente a `Q2` = exposto"*. `Q2` foi respondida como **exposto com auth mínima**, e essa condição **não** se realiza. **O sétimo Epic existente é a PARTIÇÃO DE F5 em F5a/F5b**, exatamente como PRD §13.2 e §15 argumentaram — e §13.5 não a contou. **Quem ler §13.5 hoje conclui que o sétimo Epic é auth. Não é.**

## Falsificadores globais

Ver [`SPEC-001` §12](../../specs/SPEC-001-plataforma-dados.md). Resumo: **F-1** leitura de decisão com `available_at > t` ou `bucket_end > t` sob `final_only` · **F-2** duas séries com a mesma `SeriesKey` e `cvd_cum` divergente · **F-3** item de plano que não consiga declarar UM componente · **F-4** mesmo `bundle_hash` + `window` devolvendo número diferente **sem recusa**.

## O que este plano NÃO faz

Não cria, edita ou comenta nada no tracker. Não escreve código. Não decide nenhuma das 14 perguntas abertas do owner. Não marca a SPEC como aprovada.
