# Fase 06 — Semântica declarada + S3

**Epic:** `CST-4` (F2) · **Componentes alvo: `sentimento`** (catálogo) e **`web`** (S3) · **Gate: nenhum**
**Depende de:** `04`

**Valor:** sem ela, `field`, coorte e unidade ficam ambíguos e **o taker fica não-agregável para sempre acima de 5 min**.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 6.1 | `series_catalog` como **contrato lido pelos testes** | `SPEC-001` §3.3 | `sentimento` |
| 6.2 | Tabela de shift **por endpoint**: `openInterestHist`, `topLongShortPositionRatio`, `topLongShortAccountRatio`, `globalLongShortAccountRatio` → dump = REST **−5 min**; **`takerlongshortRatio` → SEM shift** | `CA-F2-1` | `sentimento` |
| 6.3 | As **QUATRO** séries de L/S com colunas próprias; **`ls_ratio` genérico PROIBIDO** | `CA-F2-3` | `sentimento` |
| 6.4 | `funding_settled` e `funding_estimado` **separados**, com `interval_hours_declared` **por linha**; PK com **`source`** | `CA-F2-7`, `SPEC-001` §3.4 | `sentimento` |
| 6.5 | `unit` e `denom` **obrigatórios**, verbatim da fonte | `CA-F2-2` | `sentimento` |
| 6.6 | **`price_mark_close`** declarado como uma das quatro séries de preço; **`implied_avg_price` PROIBIDO como nome** | `ADR-007`/PS-2 | `sentimento` |
| 6.7 | **`price_source` por `price_use`** no catálogo | `ADR-007` | `sentimento` |
| 6.8 | **`fee_schedule(venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url)`** | `CA-F2-14` | `sentimento` |
| 6.9 | `cvd_source` com **erro medido publicado por fonte**, incluindo `aggtrade_q`, `aggtrade_nq` e `coinalyze_bv` | `CA-F2-16`, `ADR-001`/5 | `sentimento` |
| 6.10 | **`buyVol`/`sellVol` persistidos** do REST `takerlongshortRatio` | `SPEC-001` §5.11 | `sentimento` |
| 6.11 | **`reduction` na `SeriesKey`**: OI da Coinalyze = **4 linhas** (`OPEN/HIGH/LOW/CLOSE`, `OHLC_OVER_BUCKET`); Binance = **1** (`POINT`, `POINT_AT_BUCKET_END`) | `CA-F2-17` | `sentimento` |
| 6.12 | **Quarentena pelo predicado de TRÊS termos**, com regra de escrita: endpoint sem `lag_ms` medido grava `available_at = NULL` | `CA-F2-2`, `CA-F2-13` | `sentimento` |
| 6.13 | **`ZL-1`..`ZL-3`: zero devolvido pelo fornecedor não é zero legítimo** | `SPEC-001` §5.3 | `sentimento` |
| 6.14 | Campo **aditivo** desconhecido → quarentena + alarme; **ausente/renomeado** → reprova | `CA-F2-12` | `sentimento` |
| 6.15 | `native_grid` é propriedade da `source`, **resolvida em runtime** | `CA-F2-11` | `sentimento` |
| 6.16 | **S3 · inspetor**: catálogo filtrável + linhas cruas com **`src_label_raw` AO LADO de `event_time` na mesma linha** | `SPEC-001` §6 | `web` |

## DoD — comando e universo

| # | critério | ação | universo esperado |
|---|---|---|---|
| **D6.1** | quarentena é **predicado**, com invariantes | `count(gaveta) == count(catálogo WHERE label_shift IS NULL OR unit IS NULL OR available_at IS NULL)` **e** `count(painéis sincronizados ∩ quarentena) == 0` | **todo o catálogo** |
| **D6.2** | **o TERCEIRO termo isola sozinho** | série com `label_shift` **e** `unit` PREENCHIDOS e `available_at` **NULL** ⇒ leitura de `backtest` devolve **ZERO linhas**, e a gaveta a conta | **≥ 1 série** (as da Coinalyze) |
| **D6.3** | a regra de **escrita** não envenena o disco | ingerir linha ao vivo de endpoint **sem `lag_ms` medido** | grava `available_at = NULL`, `MODELED`, série **isolada**. **Nunca `event_time`, nunca `event_time + interval`** — o default **361× otimista** |
| **D6.4** | as quatro séries de L/S são distintas | autocorrelação lag-1 | **0,9999 / 0,9999 / 0,9996** nas três de posicionamento e **0,0955** no taker, nos **4 símbolos**. Ortogonalidade do taker: **\|r\| < 0,10 em 12 de 12 pares** |
| **D6.5** | `delta()` sobre `FLOW` é **erro de tipo** | pedir `delta()` no taker | **rejeitado pelo tipo**, não por convenção |
| **D6.6** | razão de fluxo **não soma** | pedir TF 15m na série taker | **recusa**; **nunca** devolve **3,1809** (a razão verdadeira de 15 min é **~0,9707**) |
| **D6.7** | `reduction` é obrigatório | pedir *"o OI da Coinalyze"* **sem** `reduction` | **erro**, nunca default silencioso |
| **D6.8** | a comparação cross-fonte **publica o erro**, não afirma igualdade | `Coinalyze.c × Binance.sumOpenInterest` no mesmo `create_time` | **1,86 bp de mediana / 9,46 bp de p99, n=1.706** `[MEDIDO, CST-4]` ⇒ o `t` da Coinalyze é o **INÍCIO** do bucket. E `o(t) ≠ c(t−300)` (**6/2.141** iguais) ⇒ **4 linhas de catálogo, não 3** |
| **D6.9** | `cvd_source` não se registra sem erro | tentar registrar `cvd_source` **sem** `(mediana, p99, n)` | **reprova.** `coinalyze_bv`: `(0,0000 bp · p99 29,34 · máx 1.955,80 · n=699 · 2026-08-24 · causa_da_cauda = NÃO DIAGNOSTICADA)`; hipótese maker **refutada a 2.584,87 bp** |
| **D6.10** | **zero do fornecedor não é zero legítimo** | ingerir `/liquidation-history?interval=1min` | **361 buckets com `s = 0` literal** onde o `daily` reporta **289,65 / 154,53 / 4.547,61 BTC** ⇒ o ingestor converte **zero-antes-do-primeiro-não-zero-DAQUELE-LADO** em **`SEM_FONTE`** |
| **D6.11** | `settlement_slot` correto | divisor = `funding_interval_hours × 3600000` **da própria linha** | **0 slots fora da grade em 16.979 liquidações**, resíduo em `[0, 20] ms`, **nunca negativo**. A fórmula antiga erra **11.658 de 16.919 = 68,9%** |
| **D6.12** | dupla ingestão não duplica | fixture `1000XECUSDT-fundingRate-2026-07.csv` | **321 linhas**, e **dupla ingestão → `count(*) = 321`**; trava a transição **8h→1h→4h** e o delta de **3,0 h** |
| **D6.13** | `fee_schedule` datada existe | resolver as-of a janela | **nenhum resultado de backtest sem `(maker_bps, taker_bps, effective_from, evidence_url)`**. `exchangeInfo` **NÃO tem** campo de taxa — a única é `liquidationFee` |
| **D6.14** | campo aditivo não para a ingestão | acrescentar campo desconhecido ao fixture | **quarentena + alarme**, nunca parada. Caso real: a Binance **adicionou `nq`** ao `aggTrades` |
| **D6.15** | S3 torna o shift **auditável** | abrir linhas cruas | `src_label_raw` **na mesma linha** que `event_time`, mais as lacunas de `md.ingest_gap` com `n_missing` |
| **D6.16** | distribuição de funding é **fato datado** | `nextFundingTime % (h·3600000) == 0` | **570/570**, com **a data do snapshot ao lado do número** — `{4h:433, 8h:136, 1h:1}` em 2026-08-25 |

## Não faz

Não elege `field` canônico, não elege coorte, não define "extremo" de funding, **não normaliza automaticamente entre unidades**, **não tira a Coinalyze da quarentena** (o terceiro termo depende de `Q19`), não plota, **não reconcilia automaticamente** — divergência é exibida como divergência, porque fonte que corrige antes de gravar **destrói a evidência de que havia o que corrigir**.

## Falsificador da fase

Se `D6.2` devolver **qualquer** linha, o predicado de três termos **se abre quando dois passam** — e um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos.
