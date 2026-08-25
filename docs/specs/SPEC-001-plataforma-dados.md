# SPEC-001 — Plataforma e dados

**Feature:** `plataforma-dados` · **Status:** `DRAFT` · **Data:** 2026-08-25
**Estado do ledger ao escrever:** `PRD_VALIDATED` (`approve prd` em 2026-08-25T13:40:41Z) → esta SPEC leva a `SPEC_DRAFT`.
**`SPEC_APPROVED` exige `approve` do owner.** Esta SPEC **não se autoaprova** e não declara aprovação em nenhuma linha.

**Fonte de requisitos:** [`docs/specs/PRD-001-plataforma-dados.md`](PRD-001-plataforma-dados.md) (R2, 1250 linhas) · [`docs/context/plataforma-dados/handoff_to_architect.md`](../context/plataforma-dados/handoff_to_architect.md)
**Insumos posteriores ao PRD, absorvidos aqui:** [`docs/premissas-de-infra-e-stack.md`](../premissas-de-infra-e-stack.md) (fecha `Q2`, acrescenta 2 candidatos de motor) · [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md) (fonte única de numeração e estado) · [`docs/direcionamento-operacional.md`](../direcionamento-operacional.md) · [`docs/medicao-coinalyze.md`](../medicao-coinalyze.md) · [`docs/recorte-plataforma.md`](../recorte-plataforma.md) · [`docs/plataforma-superficies-e-faseamento.md`](../plataforma-superficies-e-faseamento.md) · [`data/MANIFEST.md`](../../data/MANIFEST.md)
**Tracker (lido, não escrito):** `CST`, board 36. **7 Epics já existem: `CST-1`..`CST-7`.** Nada foi criado, editado ou comentado por esta SPEC.

**Zero código.** Esta SPEC descreve contratos, formas de dado, limites de camada e comportamento de borda. Onde um nome de tipo aparece, ele é **nome de contrato**, não assinatura de função.

---

## 0. Como ler, e o que esta SPEC faz de diferente do PRD

O PRD estabeleceu **o que** a plataforma deve ser verdadeira sobre. Esta SPEC fixa **as identidades, as chaves e as fronteiras** para que a decisão pendente seja **parâmetro** e não reescrita. Três propriedades:

1. **A pré-condição bloqueante do gate do PRD está RESOLVIDA no contrato** (§1), com medição própria desta rodada e comando publicado. **Nenhum byte de série vai para disco antes de §1 estar implementado como identidade.**
2. **Onde a SPEC depende de decisão do owner, ela declara a dependência e desenha para que a resposta seja parâmetro.** As 14 perguntas abertas estão em §9 com o ponto exato de acoplamento. **Nenhuma foi decidida aqui.**
3. **Onde esta SPEC discorda do PRD ou do handoff, o argumento está escrito e o texto discordante está apontado** (§8). Aplicar por obediência o que se acha errado é como a inversão de `ASOF` (`D-01`) entrou no corpus.

**Invariante de citação que esta SPEC se impõe:** todo numeral abaixo carrega `[MEDIDO]` com o comando ou o documento de origem, `[DOC]`, `[PREMISSA-OWNER]`, `[NÃO MEDIDO]` ou `[NÃO VERIFICÁVEL HOJE]`. **`harness doctor` CONFORME não é citado como evidência em lugar nenhum** — o universo que ele cobre hoje é `backend/src/**/*.py`, que não existe.

---

## 1. ⛔ A pré-condição bloqueante: `quantity_field` é termo de IDENTIDADE

O gate do PRD foi aberto com a condição de que esta SPEC resolvesse `quantity_field ∈ {q, nq}` — o campo de quantidade do `aggTrade`, onde `nq` exclui ordens RPI. **Resolvido abaixo, e a resolução é de identidade, não de coluna.**

### 1.1 O que eu medi nesta rodada, com o comando

Reproduzido sobre os payloads em disco (`data/binance/rest/nq_*.json`, 1.000 trades por símbolo, janela ao vivo de 2026-08-25; tradução de caminho por `data/MANIFEST.md`):

| medição | resultado | `[força]` |
|---|---|---|
| campos do `aggTrades` **REST** | `['T','a','f','l','m','nq','p','q']` — **oito**, com `q` **e** `nq` | `[MEDIDO]` |
| colunas do `aggTrades` **dump S3** | `agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker` — **sete**, **sem `nq`** | `[MEDIDO]` |
| `q ≠ nq` | DOGEUSDT **16/1000**, déficit **80,56 bp**; BTCUSDT/ETHUSDT/SOLUSDT/XRPUSDT **0/1000**, 0,00 bp | `[MEDIDO]` |
| `nq > q` | **0 de 1000** ⇒ o déficit é **unidirecional** por construção observada | `[MEDIDO, novo nesta rodada]` |
| `nq == 0` com `q > 0` | **4 dos 16** ⇒ existe aggTrade **inteiramente RPI**, que contribui **zero** para um CVD em `nq` | `[MEDIDO, novo nesta rodada]` |
| tamanho dos trades divergentes | `q` mediano dos divergentes **63.776** contra **6.945** de todos ⇒ **9,2×**; faixa 60 → 506.299 | `[MEDIDO, novo nesta rodada]` |
| lado dos divergentes | **15 de 16 com `m = false`** (compra agressora) ⇒ o déficit **não se distribui pelos dois lados** | `[MEDIDO, novo nesta rodada]` |
| **efeito no CVD** | `cvd_delta(q) = 4.044.402` · `cvd_delta(nq) = 3.801.205` ⇒ diferença **243.197 = 6,01% de \|cvd_delta(q)\|**, contra déficit de volume total de **243.317** ⇒ **99,95% do déficit vai para o CVD** | `[MEDIDO, novo nesta rodada]` |

Comando de reprodução (os quatro últimos são novos e não existiam em nenhum documento):

```
python3 -c "
import json; from decimal import Decimal
d=json.load(open('data/binance/rest/nq_DOGEUSDT.json'))
cvd=lambda f: sum((-Decimal(t[f]) if t['m'] else Decimal(t[f])) for t in d)
print(sorted(d[0]), len([t for t in d if t['q']!=t['nq']]), cvd('q'), cvd('nq'))"
head -1 data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv
```

### 1.2 A decisão, e por que ela é de identidade

**`quantity_field ∈ {q, nq}` é termo da `SeriesKey`.** Não é coluna, não é flag de configuração, não é atributo do catálogo.

O argumento é a assimetria de fonte, e ela é estrutural e permanente:

```
dump S3 (único caminho de backfill profundo, 2019-12-31 →)   fornece  q        e NUNCA nq
WS/REST (único caminho ao vivo)                              fornece  q  e  nq
```

⇒ uma série que aceite as duas fontes sob a **mesma** identidade tem, por construção, um trecho histórico em `q` e um trecho ao vivo em `nq`. **`cvd_cum(anchor)` é soma acumulada** (§2.5): um déficit **unidirecional** (0/1000 violações de `nq ≤ q`) que cai **quase inteiro no CVD** (99,95%) **cresce sem limite dentro da janela da âncora**. Não é erro de precisão — é uma quebra de série no ponto de junção, com magnitude medida de **6,01% do delta por janela** no símbolo em que ela aparece.

**E a segunda consequência, que nenhum documento nomeou:** a divergência está concentrada nos trades **9,2× maiores que a mediana**. **Absorção por tamanho de trade** — a camada que o direcionamento do owner nomeia (*"agressão e absorção via CVD"*) — é lida exatamente da cauda da distribuição de tamanho. ⇒ **a escolha de `quantity_field` não muda um total; muda a cauda que a fase seguinte vai detectar.**

### 1.3 O que o contrato fixa

| regra | conteúdo |
|---|---|
| **QF-1** | `quantity_field` é termo da `SeriesKey`. Duas séries que difiram **só** nele são **séries diferentes**, com linhas de catálogo diferentes e `cvd_cum` diferentes |
| **QF-2** | **`quantity_field = q` é o valor canônico do caminho de DECISÃO** (`backtest`, `convergencia`, `scan` com `scope: CrossSection`). Motivo: é o único valor que **existe em toda a profundidade** e o único em que dump e ao vivo produzem a **mesma** grandeza. Não é preferência de domínio — é a condição para a série ser contínua |
| **QF-3** | `quantity_field = nq` é série **paralela, capture-or-lose, e existe só para `t ≥ primeira_captura_ao_vivo`**. O REST devolve **48 h** `[DOC]` e o dump **nunca** devolve `nq` ⇒ **todo dia não capturado é um dia sem `nq`, para sempre** |
| **QF-4** | **Proibido misturar.** Uma leitura que abranja `t < primeira_captura_ao_vivo` sob `quantity_field = nq` devolve **`Ausencia = SEM_FONTE`** naquele trecho — **nunca** cai para `q` em silêncio, **nunca** emenda |
| **QF-5** | `cvd_source` se desdobra: **`aggtrade_q`** e **`aggtrade_nq`** são valores distintos, cada um com `(mediana, p99, máx, n, data_da_medição)` publicados. `cvd_source` sem `quantity_field` resolvido é **erro**, não default |
| **QF-6** | O catálogo publica, por símbolo e por dia, a **taxa de divergência** `count(q ≠ nq)/n` e o **déficit em bp**. Sem isso, `nq` é um nome sem magnitude, e a decisão de usá-lo não é auditável |

### 1.4 O fato capture-or-lose novo, e ele exige nome

**`CL-5` · `nq` é capture-or-lose desde hoje.** Os quatro `CL` do PRD §4 não o cobrem. O dump não tem o campo; o REST tem 48 h de janela; o passado anterior à primeira captura **não existe em fonte nenhuma**. **Isto é da mesma classe de `CL-1..CL-4` e o PRD não o listava** — porque `E-07` retirou `aggTrade` cru do requisito de captura **sem notar que `nq` sai junto**.

**E a resolução NÃO é capturar tick.** O que o `nq` precisa preservar é o **agregado por bucket**, não o tick:

```
por (símbolo, bucket de 1 min), persistido em F0, direto do stream:
  Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max
```

**Custo:** zero chamada nova (o payload já carrega os dois campos), e ordem de **10² B/bucket** contra **6,93–33,1 MB/dia/símbolo** de tick zipado `[MEDIDO, PRD §7.4]`. **Isto preserva `nq` para sempre em granularidade de bucket, que é a granularidade da decisão declarada pelo owner** (*"decisão no fechamento do bucket"* `[PREMISSA-OWNER]`), **sem reabrir a captura de tick que `E-07` fechou.**

**⚠️ `[NÃO MEDIDO]`, e é gate do item:** medi `nq` no **REST**. `medicao-coinalyze.md` §2.2 afirma que ele existe *"no REST e no WebSocket"* — **eu não medi o WS**. **Teste que fecha, e é de segundos:** assinar `<symbol>@aggTrade` e verificar a presença de `nq` no payload. **Se o WS não trouxer `nq`, o agregador de bucket passa a depender de REST com peso e janela de 48 h, e isso muda o desenho do coletor — não o contrato.** O contrato (`QF-1`..`QF-6`) sobrevive às duas respostas.

---

## 2. Contratos de identidade e de tempo

### 2.1 `SeriesKey` — a identidade completa

```
SeriesKey = ( provider, venue, instrument_id, metric, cohort, interval,
              unit, denom, nature, ts_convention, reduction, quantity_field,
              label_shift, aggregation_scope, verified_by )

nature         ∈ { STOCK, FLOW, RATIO, EVENT, TICK }
ts_convention  ∈ { POINT_AT_BUCKET_END, AGGREGATE_OVER_BUCKET, OHLC_OVER_BUCKET }
reduction      ∈ { POINT, OPEN, HIGH, LOW, CLOSE, SUM, MEAN, LAST }
quantity_field ∈ { q, nq, NA }        # NA para série que não deriva de aggTrade
```

**`quantity_field` entra aqui e não em coluna** por §1.2. **`NA` é valor explícito, não `NULL`** — `NULL` num termo de identidade produz duas linhas que não se distinguem e não se comparam.

**Consequência de leitura, herdada e reforçada:** pedir *"o OI da Coinalyze"* sem `reduction` é **erro**, nunca default (`CA-F2-17`). E `CST-4` traz medição que o PRD não tinha: **o `c` da Coinalyze casa o `sumOpenInterest` do mesmo `create_time` a 1,86 bp de mediana / 9,46 bp de p99 (n=1.706)** ⇒ **o `t` da Coinalyze é o INÍCIO do bucket**, e **`o(t) ≠ c(t−300)`** (6/2.141 iguais) ⇒ **quatro linhas de catálogo, não três**. Esta SPEC adota essa medição: o `label_shift` da Coinalyze é **`+interval`**, na mesma direção do dump `metrics`, e **não zero**.

### 2.2 Os três relógios e as duas colunas de observador

```
event_time           instante do fato de mercado (canônico = FECHO da janela)
available_at         o mais cedo em que um consumidor AO VIVO poderia saber
ingested_at          auditoria
observed_at          quando ESTA observação daquele bucket entrou no store
availability_source  ∈ { OBSERVED, MODELED }
src_label_raw         o rótulo cru da fonte, ao lado — nunca renderizável
observer_id           identidade do host que carimbou available_at
observer_region       região de rede do observador
```

**`event_time = create_time + 300000` para `daily/metrics`, aplicado UMA vez às oito colunas** `[MEDIDO: MAE 0,000000 contra `openInterestHist`, 288 vs 288]`.

**A tabela de defasagem é chaveada por `(endpoint, observer_region)`, não por `endpoint`.** Trocar de região **invalida a calibração MODELED acumulada** para a região nova, e carimbo MODELED mal calibrado é **otimista em silêncio** — a direção exata que o contrato proíbe. `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` são **colunas**, nunca rodapé.

**`observer_region` é `[NÃO MEDIDO]` e é coluna de F0.** A VPS existe (`Q2` respondida) e a região dela não foi medida. **Fecha com `curl -s ipinfo.io` dentro da VPS.** Até então a coluna existe e recebe o valor declarado `unknown` — **`unknown` é valor, não `NULL`**, porque `NULL` aqui faz a série cruzar a fronteira de quarentena pelo motivo errado.

### 2.3 R-1 e R-2 — conjunção, não alternativa

```
R-1  toda leitura de decisão exige                 available_at <= t_decisao
R-2  bar_policy = final_only exige TAMBÉM          bucket_end   <= t_decisao
     ( e is_final = true quando a fonte o declara )
     bar_policy = intrabar vale para RENDERIZAÇÃO e SIMULAÇÃO DE EXECUÇÃO,
     e NUNCA para avaliação de condição de ENTRADA
```

**Um bucket parcial responde SIM a R-1 e NÃO a R-2** — é aí que o lookahead entrava. Magnitude: aos 4 min de um bucket de 5 min, **77,4%** dos highs definitivos já são conhecidos e **90,0% do range já aconteceu** `[MEDIDO]`.

**R-2 tem duas pernas independentes, e esta SPEC as mantém separadas de propósito:** a premissa do owner (*"decisão no fechamento ou consolidação do bucket"* `[PREMISSA-OWNER: 2026-08-25]`) **e** o argumento de lookahead. **Se a premissa cair, a regra sobrevive** — uma regra que dependa de uma frase é uma regra com prazo.

### 2.4 `ASOF` — o operador seguro é `>=`, e a regra não é sobre o literal

```
PROIBIDO    ON t1.ts <  t2.ts    e    ON t1.ts <= t2.ts     -> alcança observação POSTERIOR
ADMISSÍVEL  ON t1.ts >= t2.ts                              -> mais recente NO PASSADO
```

**A regra é sobre QUAL LADO DO TEMPO o operador alcança, e isso não se lê em regex.** Lint sobre o literal do operador é **o que produziu a inversão `D-01`**, propagada por dois documentos. A forma emulada em Postgres/TimescaleDB é `LATERAL (SELECT … WHERE t2.ts <= t1.ts ORDER BY t2.ts DESC LIMIT 1)` — e aqui o `<=` está **correto**, porque o predicado é sobre `t2` contra `t1` e o `DESC LIMIT 1` fecha o sentido.

| construto | fornecedor | veredito |
|---|---|---|
| `time_bucket_gapfill` + `interpolate` | TimescaleDB | **PROIBIDO** — interpola entre anterior **e posterior**: lookahead por construção |
| `time_bucket_gapfill` + `locf` | TimescaleDB | **admissível** com `max_staleness_ms` |
| `WITH FILL … INTERPOLATE` | ClickHouse | **admissível** — é LOCF (`"if expr is not present will repeat previous value"` `[DOC]`) |
| `ASOF JOIN … USING` (default `>=`) | ClickHouse / DuckDB | **admissível — o único** |

**Verificação por comportamento, nunca por `grep`:** `harness.toml` cobre `backend/src/**/*.py` e exclui `**/migrations/**`; SQL em arquivo, view materializada e filtro montado por ORM são **invisíveis** ao classificador. **`grep` é triagem; aprovação é fixture envenenada** (§5.1).

### 2.5 `as_of` bitemporal, `knowledge_time` e o que reproduz

```
Store append-only.  Chave de observação:  ( symbol, source, bucket_end, observed_at )
as_of( serie, symbol, t, max_staleness_ms )
   = argmin( observed_at )  entre as observações com  available_at <= t
     -- a PRIMEIRA, nunca a última, nunca a definitiva

knowledge_time  = o observed_at MÁXIMO admitido pela leitura
reproduzir(run) = ( bundle_hash, window, knowledge_time )      <- os TRÊS
```

**PK unitemporal torna reconstrução point-in-time impossível e faz `is_final` decorativo.**

**Nota de arquitetura que esta SPEC acrescenta, e ela muda a avaliação do ADR de motor:** `as_of` é **redução por janela sobre duas dimensões de tempo** (`argmin(observed_at)` restrito a `available_at <= t`), **não** é um `ASOF JOIN` simples. ⇒ **"o motor X tem `ASOF JOIN` nativo" é verdadeiro e não compra o que esta plataforma precisa.** A primitiva nativa cobre o caso `LOCF` de série única; o acessor bitemporal é composição, e ela vive na camada de aplicação em **qualquer** dos cinco candidatos. Ver [`ADR-002`](../adr/ADR-002-motor-de-armazenamento.md).

### 2.6 `cvd_delta` é fato; `cvd_cum` é view com âncora obrigatória

`cvd_delta` por bucket é **anchor-free e persistido**. `cvd_cum(anchor)` é **view**, e `anchor` é obrigatório: medido, mesmo dia e mesmo dado, âncora 00:00Z → **−1265,982 BTC**, 12:00Z → **+399,745**, 20:00Z → **+1598,508** — **o sinal inverte** `[MEDIDO via `Decimal`]`. As três âncoras são **invariantes ao bucket** (00:00/12:00/20:00 são pontos das três grades); o que depende do bucket é o **range da curva** e o **p90 do delta**.

**Aritmética canônica, e ela é parte do contrato:** `Decimal` sobre a **string crua** do campo de quantidade, soma **ordenada por `agg_id`**, bucket por `transact_time // 60000`, **sem serialização intermediária**. O comando `awk` publicado no discovery **reprova implementação correta** (`OFMT=%.6g` devolve −1265.978 / +399.746 / +1598.508, erro de +4 mBTC).

---

## 3. Formas de dado

Sem DDL, sem tipo de motor. Cada forma declara **chave**, **colunas obrigatórias** e **o que a torna inválida**.

### 3.1 As sete colunas de procedência — em TODA linha de série

```
event_time · available_at · availability_source · ingested_at · observed_at
provenance · src_label_raw
+  observer_id · observer_region        (ao lado de todo available_at)
+  is_final                            (quando a fonte o declara)
```

```
Procedencia = OBSERVADO | DERIVADO | MODELADO | HUMANO
Ausencia    = SEM_PONTO | NAO_LIDO | QUARENTENA | SEM_FONTE
```

**`DERIVADO` não é `MODELADO`.** `price_mark_close = oi_value / oi_base` e `cvd_cum(anchor)` são funções determinísticas de observados. Classificá-las como modeladas faz o painel principal nascer permanentemente tracejado, e **canal sempre ligado não carrega informação**.

**`implied_avg_price` está PROIBIDO como nome.** É `price_mark_close`, e é **uma das quatro séries de preço** — medido: `sum_open_interest_value / sum_open_interest` **É** o `close` do `markPriceKlines` do mesmo bucket, **exato a 8 casas, 288/288** em dois dias de BTCUSDT `[MEDIDO]`.

### 3.2 Série de mercado

| aspecto | contrato |
|---|---|
| chave | `( series_key_id, symbol, source, bucket_end, observed_at )` — **append-only** |
| inválida se | falta qualquer uma das sete colunas de procedência · `available_at < event_time` fora de `clock_skew_tolerance_ms` · `observed_at` ausente |
| lacuna | **nunca preenchida no armazenamento.** `LOCF` só na leitura, com `max_staleness_ms` explícito |
| `nature = FLOW` | `LOCF` é **erro de tipo**, não escolha de UX |

### 3.3 `series_catalog` — contrato LIDO PELOS TESTES

Uma linha por `SeriesKey`. Campos obrigatórios: os 15 termos da chave · `label_shift` com `verified_by` apontando **um teste que mediu o shift** · `unit` e `denom` **verbatim da fonte** · `price_use` quando aplicável · `max_staleness_ms` · erro publicado quando a série é reconstrução de outra fonte.

**Recusa de publicação (teste negativo obrigatório):** registrar `cvd_source` sem `(mediana, p99, n)` **reprova**. *"`bv` serve"* e *"`bv` serve com p99 de 29,34 bp"* são afirmações diferentes, e só a segunda permite escolher por uso.

**As QUATRO séries de L/S têm colunas próprias e `ls_ratio` genérico é PROIBIDO.** Autocorrelação lag-1: `count_long_short_ratio` **0,9999** · `count_toptrader_long_short_ratio` **0,9999** · `sum_toptrader_long_short_ratio` **0,9996** · `sum_taker_long_short_vol_ratio` **0,0955** `[MEDIDO]`. **`CST-4` registra que a doc do repositório dizia TRÊS e está errada** — esta SPEC adota quatro e o corpus de fixtures fixa a contagem.

### 3.4 Instrumento — SCD-2, nenhum atributo escalar

```
instrument            ( venue, venue_symbol, first_seen_ts, onboard_ts NULLABLE,
                        onboard_ts_source, contractType, underlyingSubType, market )
instrument_attr_dated ( instrument_id, attr, value, effective_from, evidence_url )
   -> tick_size · price_precision · quantity_precision · funding_interval_hours
      contract_multiplier · interestRate
fee_schedule          ( venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url )
instrument_alias      ( de, para, effective_from, evidence_url )       # YAML versionado
```

- **`onboard_ts` NULLABLE com `onboard_ts_source`**, identidade por `first_seen_ts`. `NOT NULL + UNIQUE(venue, venue_symbol, onboard_ts)` **impede cadastrar exatamente os 109 símbolos que a tabela existe para salvar** (`MATICUSDT` tem `onboardDate = None`) `[MEDIDO]`.
- **`market` é coluna obrigatória na captura de `fundingInfo`**: 765 entradas, **20 são COIN-M** (`BTCUSD_PERP`, …) e não existem no `exchangeInfo` USDⓈ-M `[MEDIDO]`. Sem a coluna, 20 instrumentos de outro mercado entram por colisão de string.
- **`underlyingSubType` é persistido, não só `contractType`**: `contractType` sozinho não separa `ETF` (1) e `Pre-IPO` (2) de `TradFi` (172) `[MEDIDO]`.
- **`contract_multiplier` é tabela curada com `evidence_url`, nunca regex.** A regex erra `1MBABYDOGEUSDT` por **10⁶** `[MEDIDO]`.
- **`payload_hash` do JSON bruto NÃO detecta mudança:** duas chamadas separadas por **3 ms** têm **872/872 payloads brutos diferentes** `[MEDIDO]`. Hash sobre **projeção canônica dos campos armazenados**, mais confirmação em duas leituras.
- **`funding_epoch` (moda dos deltas) é LEITURA DE FUTURO** se um consumidor de decisão a tocar. O caminho de decisão lê `interval_hours_declared` **da própria linha do evento**.

### 3.5 Registro de ingestão

```
md.ingest_run  ( run_id, source, endpoint, window, n_expected, n_returned, n_written,
                 verdict, api_code, src_sha256, weight_used,
                 observer_id, observer_region, clock_skew_ms, started_at, ended_at )
md.ingest_gap  ( source, symbol, series_key_id, from_ts, to_ts, n_missing, class, detected_at )
run_registry   ( run_id, bundle_hash, window, knowledge_time,
                 partitions_content_hash, commit, created_at,
                 intrabar_convention, intrabar_decided_count )
```

**PERSISTIDOS, nunca log.** `print` não é nem log — e `core.print-statement` **bloqueia a implementação ingênua do registro de CLI**, medido: `harness rules --mode file --path backend/src/cli/report.py` com `print(rows)` → `{"decision":"block", …}`. **Resolução decidida antes da primeira linha: registrador nomeado escrevendo em `stdout`** ([`ADR-008`](../adr/ADR-008-registro-cru-de-f0.md)).

**`run_registry` grava `intrabar_convention` E `intrabar_decided_count`** — acréscimo desta SPEC, herdado da ressalva do handoff §9/2: a convenção pessimista de desempate SL-vs-TP **enviesa para baixo**, e sem a contagem de trades que ela decidiu a influência dela é **embutida em vez de medível**. **1,56% é fração de BARRAS; a fração de TRADES é `[NÃO MEDIDO]`.**

### 3.6 As duas portas tipadas de leitura

```
<ValorDeMercado>  toda superfície lê numeral de mercado por aqui
                  célula = ( valor | ausência, event_time, available_at ) + ref. de coluna
                  SeriesKey · source · unit · denom · provenance são COLUNA/PAINEL, não célula
<Anotacao>        provenance = HUMANO, autor, criada_em, + chave completa de fixture
```

**`<Anotacao>` liga obrigatoriamente a:**
`( instrument_id, venue_symbol_as_of, interval, janela, grid_hash, knowledge_time, price_source, price_use, bar_policy, quantity_field, tick_size, price_precision, multiplier, cvd_anchor, universe_source )` **+ a URL**.

**`quantity_field` entra nesta chave por §1** — uma marcação feita sobre um CVD em `q` não é a mesma marcação sobre um CVD em `nq`, e a diferença medida é **6,01% do delta** no símbolo em que aparece.

**O primeiro primitivo de `<Anotacao>` é `swing_point`, não `zone`.** Argumento, sob **qualquer** resposta de `Q20`: pivô **é** uma definição de swing · âncora de Fibonacci **é** um par de swings · BOS/CHoCH **é** rompimento de swing · BSL/SSL **é** extremo de swing. Fixada a definição de swing, os níveis de Fibonacci são **aritmética pura, sem parâmetro novo**. ⇒ **um corpus de swings sobrevive a qualquer resposta; um corpus de zonas não.** Esta SPEC entrega **o primitivo e a chave**, e **zero algoritmo, zero limiar, zero "nível"**.

`pointer_mode ∈ { read, annotate }` declarado desde já, com camada de overlay reservada acima do plot e abaixo do crosshair. `clique`/`Espaço` só significam "travar crosshair" em `read`.

### 3.7 Tipos-soma

```
cvd_anchor      = DiaUTC | NBarras{n} | Instante{ts}        # discriminado; `swing` entra sem migração
cvd_source      ∈ { aggtrade_q, aggtrade_nq, kline_takerbuy,
                    rest_taker_vol, metrics_ratio, coinalyze_bv }
ThresholdSpec   = Absolute{pct, op}
                | Percentile{q, window, scope, min_obs, interpolation, op}
                | RobustZ{k, window, min_obs, op}
                + spec_version   +   Custom{expr} DESABILITADO por padrão
universe_source ∈ { snapshot, s3_inferred, premium_index_witness }
env             ∈ { mainnet, testnet, demo, replay }
bar_policy      ∈ { final_only, intrabar }
price_use       ∈ { structure_detection, liquidation_trigger, funding, execution, cost }
price_source    ∈ { klines_last, mark_price, index_price, premium_index, price_mark_close }
```

- **`ThresholdSpec` sem default em nenhum eixo.** O operador vale **20×**: `|r| > 0,0001` → 9/1500 contra `|r| >= 0,0001` → 184/1500, porque `0.0001` é átomo com **175 ocorrências** e **p90 = p99** `[MEDIDO]`.
- **`min_obs` não atendido ⇒ AUSÊNCIA (`—`), nunca `expanding` em silêncio.** Toda saída de percentil/z carrega **`n_obs` efetivo por ponto**. Caso concreto: `rolling(2016, min_periods=576)` **nunca preencheu a janela nos alts** ⇒ BTC rodou `rolling` e os alts rodaram `expanding`, e a conclusão publicada caiu por isso.
- **Toda razão `×p90` carrega `(estimador, sobre |Δ| ou Δ, n)`** e o teste de regressão **FIXA o estimador**: `numpy.percentile(|Δ|,90)` → 104,0/25,0/**10,3**× · `statistics.quantiles` → 103,6/24,2/**9,0**× `[MEDIDO]`. Sem isso o teste falha por motivo errado, que é a pior classe de teste vermelho.
- **`universe_source = s3_inferred` é INADMISSÍVEL no caminho de decisão.** Ele deduz existência do símbolo da existência do arquivo — fato conhecível **~30,3 h depois** e só para símbolos cujos arquivos **continuam publicados**: survivorship e lookahead na mesma coluna.
- **`price_source` por `price_use`**, e a escolha **decide onde o swing está**: a ordenação de highs entre buckets vizinhos **inverte em 2,09%** dos pares entre mark e last, a de lows em **5,57%**, e o bucket que contém o high do dia **é diferente** nas duas séries `[MEDIDO]`. Tabela em [`ADR-007`](../adr/ADR-007-price-source-por-uso.md).

### 3.8 Serialização de numeral — invariante de locale

```
numeral em QUALQUER caminho de dado (fixture, export, API, hash, run_registry)
  => ponto decimal, sem separador de milhar, INVARIANTE DE LOCALE
pt-BR aplica-se EXCLUSIVAMENTE a microcopy e rótulo de eixo
```

**Teste:** exportar o mesmo fixture com `LANG=pt_BR.UTF-8` e `LANG=C` e comparar `sha256sum` — **iguais, ou reprova**. Um fixture que não é byte-estável **não é fixture; é uma opinião com `sha256`**.

---

## 4. Limites de camada

### 4.1 Monorepo e bounded contexts

Stack declarada pelo owner `[PREMISSA-OWNER: 2026-08-25]`: monorepo `backend/` + `frontend/`; backend **Python + FastAPI, modular por bounded context**; frontend **Next, "mesma linha modular do anything"**.

**A forma é reusada; o conteúdo não.** Decidido em [`ADR-009`](../adr/ADR-009-reuso-da-forma-do-anything.md), com a lista explícita do que **não** se aplica — a começar por **`organization_id`**, que num sistema single-user é dimensão fantasma que contamina toda chave.

**Mapeamento fechado componente → bounded context:**

| componente (vocabulário fechado) | bounded context | escreve | lê |
|---|---|---|---|
| `sentimento` | `ingestion`, `catalog`, `registry` | série, catálogo, `ingest_run/gap`, snapshot | — |
| `charts` | `chart_grid` (grade canônica, eixo, overlay) | — | `<ValorDeMercado>`, `<Anotacao>` |
| `convergencia` | — (**diferido**; enum com zero linha) | — | `as_of` |
| `backtest` | `run_registry` | `run_registry` | `as_of` — **e só** |
| `web` | `app`, `features/*` | `<Anotacao>` | as duas portas tipadas |
| `docs` | política, ADR, plano | — | — |

**Fronteira dura, e ela é a razão de a plataforma existir:** **nenhuma superfície chama endpoint de exchange direto.** Tudo lê o store local, **inclusive `OI (agora)`**, que é série ingerida como qualquer outra — senão os quatro campos do selo ficam impreenchíveis.

**Mecanismo de fronteira: contratos executáveis de import**, um por componente, na forma medida no `anything_monorepo` (`import-linter`: contrato `layers` por módulo + contrato `forbidden` *"business logic imports no other module"*) `[MEDIDO: anything_monorepo/backend/pyproject.toml]`. **É a versão executável de "componente alvo declarado"**, e é o que torna `[agents.by_component]` verificável em vez de decorativo.

### 4.2 A escrita é fan-in de escritor ÚNICO

**Decisão, e ela é restrição sobre a topologia de coletores de F0, não detalhe de ADR:** todos os caminhos de escrita convergem para **um processo escritor**. Os coletores 24/7 de F0 **produzem para uma fila durável**; o escritor único consome e é **o único** que toca o store.

**Por que é contrato e não preferência:** duas invariantes exigem **ler antes de escrever** —

- **`CA-F3-12`** · backfill `MODELADO` **não pode** sobrescrever captura `OBSERVADA` (destrói o `available_at` real, que é o único insumo de latência de campo, **e apaga a variante `nq` de linhas ao vivo sempre na direção otimista**);
- **`CA-F4-25`** · o sistema **RECUSA** sob divergência de `knowledge_time`, nunca devolve número diferente em silêncio sob o mesmo `bundle_hash`.

⇒ **essa lógica vive no escritor único, na camada de aplicação, e NÃO no motor.** Esta é a resposta direta ao falsificador que `premissas` §3.2 e `CA-F4-24` exigem de quem propor Parquet/objeto: **onde vive a lógica de unicidade.** Vive aqui, e vive aqui **em todos os cinco candidatos** — o que muda entre eles é o custo, não o dono.

### 4.3 Transporte de leitura

**Regra já fixa: o browser NUNCA recebe tick** (4.802.005 aggTrades/dia num símbolo, pico medido **3.468 msg/s**). Decidido em [`ADR-005`](../adr/ADR-005-transporte-de-leitura.md); o contrato do bucket parcial é

```
( bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq )   a   max(1 Hz, 1/TF)
e a resolução EXIBIDA da idade nunca é mais fina que 1/f
```

Sem a última cláusula, *"barra parcial a 40% de opacidade"* é ambíguo entre 1 msg/s e 3.468 msg/s de pico.

### 4.4 Identidade como dimensão

`Q2` está respondida: **VPS exposta, auth mínima, single-user, obrigatoriamente extensível** `[PREMISSA-OWNER: 2026-08-25]`.

**Requisito, e é falsificável:** identidade é **dimensão desde a primeira linha** — nunca constante implícita, nunca `NULL`. Mesmo princípio já aplicado a `env`, `provider` e `observer_region`. **`principal_id` é coluna em toda linha que registre ato humano** (`<Anotacao>`, `run_registry`, edição de bundle). Hoje há **um** valor; ter um valor não é ter zero dimensões.

**⚠️ Lacuna que esta SPEC nomeia:** o non-goal *"login/autenticação: indefinido — não construir especulativamente"* (PRD §12) **está morto** — `Q2` o matou — **e nenhum dos 7 Epics carrega auth.** Ver §8.3.

---

## 5. Comportamento de borda

### 5.1 Fixture envenenada — o mecanismo de verificação de R-1 e R-2

Duas classes de veneno no **mesmo** fixture:

| classe | linha | aceite |
|---|---|---|
| (a) | `event_time` passado, `available_at` **futuro** | resultado **bit-idêntico** ao dataset sem as linhas (R-1) |
| (b) | **bucket parcial**: `is_final = false`, `bucket_end > t`, **`available_at <= t`** | sob `final_only`, **bit-idêntico** ao dataset sem a linha; sob `intrabar`, **tem de MUDAR** |
| (c) **nova nesta SPEC** | mesmo bucket presente em `quantity_field = q` (dump) **e** `nq` (ao vivo) | leitura sob `nq` de janela que precede a primeira captura ao vivo devolve **`SEM_FONTE`**; **nunca** emenda com `q` (§1.3/QF-4) |

**A classe (b) existe porque o teste, como o PRD o escrevia, passava nos dois valores de `bar_policy`** — isto é, não testava `bar_policy`.

### 5.2 Quarentena — predicado de TRÊS termos

```
QUARENTENA  <=>  label_shift IS NULL  OR  unit IS NULL  OR  available_at IS NULL
```

**Regra de escrita:** endpoint **sem `lag_ms` medido** grava **`available_at = NULL`**, `availability_source = MODELED`, e a série **nasce isolada**. **Nunca `event_time`, nunca `event_time + interval`** — esse é o default **361× otimista** gravado nas linhas do go-forward, as que não se recapturam.

**Invariantes:** `count(gaveta) == count(catálogo WHERE <predicado de 3 termos>)` **e** `count(painéis sincronizados ∩ quarentena) == 0`.

**A Coinalyze continua isolada, e agora pelo termo nomeado.** A medição resolveu `unit` (o catálogo do fornecedor **declara** `oi_lq_vol_denominated_in`: **744 `BASE_ASSET` / 20 `QUOTE_ASSET`**) e `label_shift` (`2·bv − v` bate o delta do dump a **2,6e-14 BTC** de mediana, **150/699 buckets exatos**). **Não resolveu `available_at IS NULL`.** ⇒ **um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos.** Sair da gaveta exige incluir os endpoints dela no `availability_probe_set` (**`Q19`**).

**Carimbo MODELED, conservador por construção:**

```
available_at_MODELED = próximo ponto da grade nativa
                       >= ( bucket_end + p99_lag(endpoint, observer_region) + margem )
```

**Arredondamento sempre PARA CIMA** ⇒ o erro é sempre pessimista: a plataforma diz que soube **mais tarde** do que soube, nunca mais cedo. Média ou mediana são **otimistas em metade dos casos**, e errar o rótulo por um bucket **inverte o sinal do ΔOI de 15 min em 21,96% das janelas (n=8.629)** `[MEDIDO]`.

### 5.3 Ausência devolvida como ZERO pelo fornecedor — regra nova

**Medida e registrada em `CST-4`, e não estava no PRD:** `/liquidation-history?interval=1min` da Coinalyze devolve **361 buckets com `s = 0` literal** onde o `daily` reporta **289,65 / 154,53 / 4.547,61 BTC**. O teto de retenção é **por LADO**, e o merge preenche o lado faltante com **zero, não nulo** — **ausência devolvida como zero legítimo, pelo fornecedor**.

**Contrato:**

| regra | conteúdo |
|---|---|
| **ZL-1** | Em série de **evento**, `pontos × intervalo` é **por LADO**, não por série. `CA-F3-10` recalcula assim |
| **ZL-2** | O ingestor converte **zero-antes-do-primeiro-não-zero-daquele-lado** em **`Ausencia = SEM_FONTE`**, nunca em zero legítimo |
| **ZL-3** | **Zero legítimo é marca desenhada na linha de base**, distinguível de ausência em 100 ms. Essa distinção é o que `ZL-2` protege — sem ela a tela mostra "não houve liquidação" onde o correto é "não sabemos" |

**Este é o primeiro caso registrado neste projeto em que a quarentena impediu um número falso de chegar a uma decisão.** Fica como fixture.

### 5.4 Reconexão de stream — regra POR CLASSE, não uma para as duas

O WS desconecta **a cada 24 h por doc** ⇒ reconexão é **rotina diária, não exceção**. E as duas classes de stream **não têm o mesmo instrumento**:

| stream | identificador de sequência | dump repõe? | consequência |
|---|---|---|---|
| `<symbol>@aggTrade` | **`agg_id`**, contíguo (`a[i+1] == a[i]+1`; **0 saltos em 8.873.078 linhas**) | **sim** | buraco é **detectável e reparável** |
| **`!forceOrder@arr`** | **NENHUM** | **não** | sobreposição **duplica**; buraco **não volta** |

**Uma regra só para as duas é um defeito.** Decidido em [`ADR-004`](../adr/ADR-004-reconexao-de-stream-sem-sequencia.md), que é **gate de F0** — a decisão precede a primeira linha do coletor, e o registro consolidado dela é `CST-7`.

### 5.5 Mudança de schema da fonte

```
campo ADITIVO desconhecido   ->  quarentena + alarme        (NUNCA parar a ingestão)
campo AUSENTE ou RENOMEADO   ->  reprova
```

**Motivo medido, e é o caso deste projeto:** a Binance **adicionou `nq`** ao `aggTrades`. Sob a regra fail-closed original, **naquele dia toda a ingestão teria parado** — e o campo acrescentado é justamente o de §1.

### 5.6 Survivorship na BORDA DE INGESTÃO — o oposto de fail-closed

```
símbolo ausente do exchangeInfo CORRENTE
   ->  verdict = 'ACCEPTED_WITH_WARNING'  +  linha em md.ingest_gap
   ->  NUNCA 'REJECTED', NUNCA zero linhas gravadas
```

**109 símbolos históricos são invisíveis hoje.** Teste: ingerir o dump de **`MATICUSDT`** (existe no S3, **não** existe no `exchangeInfo` de hoje) e conferir que **gravou, com aviso**.

**E a fronteira que não se generaliza:** `-1130` → `REJECTED` é **certo** (é resposta da API sobre a própria janela: fim de histórico), e **não** se estende a "símbolo desconhecido". Quem lê `CA-F3-1` sem `CA-F3-14` generaliza fail-closed e planta survivorship.

### 5.7 Paginação — janela fechada e enumerada a priori

```
SEMPRE  [startTime, endTime]  fechado, enumerado ANTES do loop.  NUNCA cursor.
Invariante permanente:  nenhum timestamp gravado fora da janela requisitada.
```

**Medido, e o comportamento é NÃO DOCUMENTADO:** `openInterestHist` com `startTime` **sozinho** devolve **a cauda de hoje, HTTP 200, sem aviso** ⇒ um loop `cursor += janela` **nunca avança** e grava dado de **hoje** com timestamp de semanas atrás. `limit=501` devolveu **501 linhas** contra doc de máximo 500 `[MEDIDO]` — o limite declarado não é o limite observado, e o teste usa o observado.

### 5.8 "Re-baixável" falha em silêncio — e há precedente medido

| observação | `[força]` |
|---|---|
| `monthly/bookTicker` **2024-03 → 200, 6,7 GB**; **2024-04 → 200 mas só 37,7 MB (mês TRUNCADO)**; **2025-01 → 404** | `[MEDIDO, CST-5]` |
| `daily/bookTicker/BTCUSDT` → 200 em 2024-03-25, **404 em 2024-03-31** e depois | `[MEDIDO]` |
| **`bookDepth` não tem prefixo `monthly`** — um ETL que assuma mensal **quebra** | `[MEDIDO, CST-5]` |

**Contrato:** o dump é **`re-baixável (retenção do bucket NÃO MEDIDA)`**, **nunca "infinito"**. **Mitigação obrigatória e ridiculamente barata: `curl -sI` mensal em prefixo antigo E recente, para `aggTrades` e `bookDepth`** — descobre a perda em **um mês** em vez de em dois anos. **O 200 com corpo truncado é o modo de falha pior que o 404**, porque não levanta exceção: daí `G1` (verificação de `.CHECKSUM`) ser obrigatória na ingestão, com fixture que **corrompe um byte e exige rejeição**.

### 5.9 Relógio do host

NTP é **dependência de runtime de F0**. Monitor comparando o relógio local com `/fapi/v1/time`, alarmando acima de limiar declarado. **`clock_skew_tolerance_ms` NÃO é medível antes de o coletor rodar** ⇒ **F0 persiste o skew observado por `ingest_run`; F3 CALIBRA a tolerância** sobre a distribuição acumulada. A invariante `available_at >= event_time` a 100% **derruba ingestão ao vivo por skew de NTP** se aplicada sem tolerância.

### 5.10 Semântica não verificável — `latest | largest`

A página USDⓈ-M diz que `!forceOrder@arr` empurra o **`latest`** de cada janela de 1000 ms; **a COIN-M e o changelog dizem `largest`** `[DOC, contraditória]`. **Se for `largest`, a série é distribuição de MÁXIMOS por segundo por símbolo, não de liquidações** — e todo percentil de tamanho sobre ela estima **máximo de bloco**, outra grandeza com o mesmo nome.

**Não se resolve lendo mais doc** (a doc é que se contradiz) **nem medindo hoje**. **Decisão de arquitetura sob incerteza, e ela é uma coluna:** gravar **nome do stream + data do snapshot da doc** junto do payload cru. É a única forma de pinar a semântica depois, **e não adia a captura** — o payload cru é o mesmo nas duas semânticas; muda **como ele se lê**.

**A reconciliação contra o agregado diário da Coinalyze é a primeira série de referência independente**, e a ressalva vai **na tela junto do número**: **não se sabe se a Coinalyze constrói o agregado dela a partir do mesmo stream subamostrado**. Se sim, a razão tende a **1** e não prova nada; se não, ela **mede a perda**. **As duas saídas informam sobre em qual caso estamos** — e o número **nunca** é publicado como "perda medida" sem essa ressalva.

### 5.11 Política de ausência por `nature`

| `nature` | ausência renderiza como | proibido |
|---|---|---|
| `STOCK` (OI) | ponto discreto na observação real + trilho de vigência **≤ grade nativa** | interpolar; trilho maior que a grade |
| `FLOW` (`cvd_delta`, volume) | **vazio**; zero legítimo = marca na linha de base | **`LOCF`, sempre** |
| `RATIO` de estoque | igual a `STOCK`; `last()` na borda é legítimo | `mean()` |
| `RATIO` de fluxo (taker) | painel **se desabilita** se as componentes não existirem | `sum()`, `last()` |
| `EVENT` (funding, liquidação) | marcador discreto no instante | escada para frente **e** para trás |
| quarentena | painel desabilitado **com o motivo escrito** | plotar |

**`RATIO` de fluxo:** somar 3 buckets de 5 min do `sum_taker_long_short_vol_ratio` dá **p50 = 3,1809** onde a razão verdadeira de 15 min é **~0,9707** `[MEDIDO]` — 3,3× inflado com título honesto. Razão de fluxo **só recomputa de `Σbuy/Σsell`**; daí `buyVol`/`sellVol` do REST `takerlongshortRatio` serem **persistidos obrigatoriamente** — sem eles a perna de volume é **permanentemente não-agregável acima de 5 min**.

**Escada de funding para frente está DERRUBADA por medição:** a taxa **troca de sinal entre `T` e `T+1` em 3.047 de 16.919 transições = 18,01%** (pior: `1000SHIBUSDT` 36,8%) `[MEDIDO]`. Se houver extensão horizontal, ela cobre **`[T − funding_interval_hours_da_própria_linha, T)`**, rotulada **janela de acúmulo**.

### 5.12 A cobertura de OI por barra, com a precisão que 5m exige

Pontos de OI por barra: 1m **0,2** · 5m **1,0** · 15m **3,0** · 1h **12,0** · 4h **48,0** `[MEDIDO]`.

**`5m → 1,0` é MÉDIA, não garantia:** com **3 buckets ausentes em 8.640 medidos**, algumas barras de 5m têm **zero**. A 15m um bucket nativo ausente deixa 2 ⇒ degrada para **cobertura parcial**, que é outra coisa que ausência. ⇒ **a política de renderização de ausência continua requisito de primeira classe a 5m** e vira tratamento de exceção **a partir de 15m**. **O carimbo de idade é obrigatório em TODOS os prazos**, por razão independente do timeframe: a defasagem de publicação do OI (**99,6–200,8 s**).

Habilitação de painel: `grade_painel >= grade_nativa` **e** `grade_painel mod grade_nativa == 0`. Desabilita **apenas** em upsampling ou grade não-múltipla.

---

## 6. Superfícies e o contrato de leitura

Cinco superfícies (`S1`..`S5`), quatro com tela e uma que é **dado, não tela**. **Nenhuma delas chama exchange direto.**

| superfície | job | fase | componente |
|---|---|---|---|
| **S1** console de coleta e retenção | *o que está sendo gravado, o que parou, quanto disso é perda permanente* | F3 | `web` |
| **S2** símbolo — multi-painel, replay as-of, marcação | *olhar uma série contra o preço e afirmar o que ela significa* | mínima em F1, completa em F4 | `charts` + `web` |
| **S3** inspetor de série | *o que este número é, e quais linhas exatas o produziram* | F2 | `web` |
| **S4** bancada de distribuição | *que taxa de disparo um limiar produziria — antes de escolher o limiar* | F4 | `charts` + `web` |
| **S5** universo point-in-time | **não é tela**: `universe_at(ts, filtro)` atrás de todo seletor | F3 | `sentimento` |

### 6.1 O selo — quatro campos, sem hover

**Nenhum numeral de mercado renderiza sem selo, visível sem hover. Tooltip não conta.**

| campo | conteúdo |
|---|---|
| **série** | rótulo do `series_key` com qualificador e unidade **lidos do catálogo**: `OI · grade 5m · BTC · bn-dump`. **As strings `OI`, `funding`, `L/S`, `CVD` sozinhas não existem na UI** |
| **idade** | `tempo_de_referência − available_at`, **só na borda direita do tempo**; `OBSERVED` em tinta normal, `MODELED` em tinta fraca com `~`, e **`idade ?` quando `lag_ms` não foi medido**. `idade ?` resolve **exibição** e **não decide armazenamento** (§5.2) |
| **procedência** | `OBSERVADO` / `DERIVADO` (com a expressão) / `MODELADO` / `HUMANO` |
| **completude** | `285/288 · 1 lacuna` para série de grade; **`contiguidade (N saltos de agg_id)`** para série de tick, que **não tem `n_expected`** |

**Içamento:** **sessão** carrega fuso, `agora`, modo, versão do bundle (1× por tela) · **painel** carrega fonte, shift, procedência, universo e `n lido / n esperado` (1× por painel, **sempre visível, nunca em tooltip**) · **número** carrega só a idade. Envelope completo por célula custa **519 B contra 54 B (9,6×)** ⇒ na tela de 570×6, **1.733 KB contra 180 KB** `[MEDIDO]`.

`idade = tempo_de_referência − available_at` (em `COMO EM T`, é `T`), **nunca `now − available_at`**. **Um gráfico de 3 dias tem zero carimbos de idade, e isso está certo.**

### 6.2 Governança de cor por tipo de marca

> **⚠️ REVOGADO e SUPERSEDIDO por [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md)** (aceita pelo owner em 2026-08-25). O texto anterior desta seção decretava *"nesta plataforma, vermelho significa o dado quebrou"* e publicava ΔE de **24,7/26,8 · 7,2/8,6 · 10,8** que **não reproduzem sob nenhum estimador declarado**. Isto é correção de **citação** sob a ADR, não mudança de decisão desta SPEC. **A regra `CA-F4-10` — `critical` fora do canal de cor — continua em vigor e ganhou três argumentos independentes novos.**

**Direção de preço segue a convenção ocidental** (verde alta / vermelho baixa) e vive **só em `fill`**, nunca em glifo. **Integridade do dado é violeta, e o hue é o TERCEIRO canal** — glifo e palavra carregam a afirmação. **Ação e procedência não consomem hue** (luminância). **Severidade operacional é papel distinto de integridade** e não tem token de cor.

Medido `[MEDIDO: scripts/validate_palette.js, 361 medições, exit 0, Brettel 1997 + CIEDE2000, veredito por min(protan, deutan, tritan)]`: `#089981 ↔ #f23645` **PASS** min3 **18,0** · `#008300 ↔ #e34948` **WARN** **12,2** · `#f23645 ↔ #eb6834` **FAIL** **5,3** — e **é este último par que prova que `critical` não cabe no canal de cor**. Redundância de **forma** é obrigatória: nenhum par de hue sobrevive à escala de cinza (razão de luminância 1,09–1,38).

⇒ `Q13` continua não gateando, mas **trocar o esquema custa 4 valores de hue + 361 medições**, não 2 tokens.

### 6.3 Zero seleção é informação

**A tela não empurra o owner na direção de mais disparos num instrumento que gasta capital dele.** Nenhum nudge para baixar o limiar. **A ausência da afordância é a afirmação mais forte disponível.**

### 6.4 Atribuição obrigatória

`lightweight-charts` é Apache-2.0 **e a doc exige creditar a TradingView como criadora numa página pública**, com a notice do arquivo `NOTICE` e link para `tradingview.com` `[MEDIDO no npm + DOC]`. **É obrigação de produto que nasce na primeira tela (F1).**

---

## 7. Reprodutibilidade

```
reproduzir(run) = ( bundle_hash, window, knowledge_time )
```

**Teste, e ele usa caso real e não sintético:** (1) roda um `scan`; (2) ingere **observação atrasada de um bucket que está dentro da janela já avaliada** — o store é append-only e bitemporal, e isso acontece; (3) roda de novo com o **mesmo** bundle e a **mesma** janela. **Aceite: ou o resultado é idêntico, ou o sistema RECUSA apontando divergência de `knowledge_time`. Nunca um número diferente em silêncio sob o mesmo `bundle_hash`.**

**O bundle de parâmetros é versionado e hasheável, e ele É a URL — não um CRUD.** Gerenciador de presets é **produto prematuro** e non-goal.

**Fixture recortável e congelável byte-idêntica ao que o gráfico exibiu, INCLUINDO os buracos reais.** Com §3.8 (invariância de locale), isso é verificável por `sha256sum`.

**A grade canônica é UMA função compartilhada** entre gráfico e motor, versionada junto com o dado derivado. **Duas implementações da grade é o modo de falha em que a tela e o motor discordam sobre o que aconteceu.**

---

## 8. Correções que esta SPEC faz — com o argumento, não só a conclusão

### 8.1 Defeito de citação: `Q17` apresentada como binária

**PRD §8, linha de `Q17` (tabela `trava o início de`), diz:** *"spread: medir (`bookTicker` ao vivo) ou assumir (`bookDepth` + premissa)?"*. **Está errado, e o próprio PRD sabe** — §4/CL-4, §0.3.3/1 e a tabela de R1 dizem **três**. A linha de §8 é a que um leitor apressado cita.

**Forma correta, e é a que vale onde esta SPEC referencia `Q17`:**

| opção | custo | veredito |
|---|---|---|
| **(a)** `bookTicker` ao vivo | **340–420 GB/ano** a 20 símbolos (o `1,76 TB/ano` está **derrubado, errado por 4,8×**) | **fora do escopo desta fase** por premissa (*"não é HFT"*) |
| **(b)** `bookDepth` + premissa declarada | `bookDepth` **não tem bid/ask** ⇒ entrega **profundidade para slippage**, **não** spread ⇒ spread **assumido** | resíduo do owner |
| **(c)** `GET /fapi/v1/depth?limit=5` a 1/min | **200, 295 B, peso 2**; 20 símbolos = **40 de peso/min contra `REQUEST_WEIGHT 2400/min` = 1,67%**; **~3,1 GB/ano** ⇒ **~110× mais barato que (a)** | resíduo do owner |

**`CL-4` não morre: encolhe ~110× e continua capture-or-lose.** **(c) não é (a)** — 1/min é **amostra**, não tick, e o spread alarga exatamente no instante do fill. Mas é spread **medido, com `n` e percentil publicados**, no instante que o owner declarou como o de decisão. **E não compete com o backfill de OI:** `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m` ⇒ **baldes distintos, confirmado por observação**.

**Regra que vale sob QUALQUER das três, e é dura:** a premissa **ou** a medição de spread é **parâmetro nomeado, versionado e carimbado no resultado — nunca constante dissolvida no número**.

### 8.2 A contagem de Epics: são 7, e o sétimo NÃO é auth

**PRD §13.5 diz "SEIS Epics, com um sétimo contingente a `Q2` = exposto".** `Q2` foi respondida como **exposto**, e `premissas` §3.3 + `decisoes` §Q2 concluem, corretamente, que **auth mínima com extensibilidade NÃO realiza a condição** ⇒ o sétimo contingente **não** se materializou. **E o tracker tem sete Epics.**

**A reconciliação, lida do tracker:**

| Epic | fase | por que existe |
|---|---|---|
| `CST-1` | **F5a** | a parte **gateante** de F5, que vence **antes de F0** |
| `CST-2` | F0 | captura irreversível |
| `CST-3` | F1 | contrato temporal + fatia visível |
| `CST-4` | F2 | semântica declarada |
| `CST-5` | F3 | aquisição em regime |
| `CST-6` | F4 | superfície e reprodutibilidade |
| `CST-7` | **F5b** | consolidação, que só fecha **depois de F4** |

**O sétimo Epic é a PARTIÇÃO DE F5, exatamente como o PRD §13.2 e §15 argumentaram** (`P0 · a parte gateante de F5` e `P4 · F5 (resto)` em linhas separadas) — **e §13.5 não a contou.** ⇒ **quem ler §13.5 hoje conclui que o sétimo Epic é auth. Não é.** A partição é correta e esta SPEC a adota: F5a e F5b têm o **mesmo componente** e **prazos opostos**, e um Epic único atravessaria o projeto sem DoD encerrável.

### 8.3 Auth é requisito e nenhum Epic a carrega

`Q2` matou o non-goal *"login/autenticação: indefinido — não construir especulativamente"*. **Nenhum dos 7 Epics tem auth na entrega.**

**Onde esta SPEC a coloca, e o argumento:** a **dimensão de identidade** (`principal_id` em toda linha de ato humano, §4.4) é **contrato de F1** — é termo de chave, e termo de chave depois é migração. O **mecanismo mínimo de auth** é item de **F1, na fase da fatia visível**, porque **o momento em que uma página é servida de um host exposto é o momento em que ela precisa de auth** — e a S2-mínima é uma página Next servida da VPS com Caddy/TLS público `[MEDIDO: anything_monorepo/deploy/compose.prod.yml]`.

**Isto acrescenta itens a `CST-3`, não um Epic novo** — coerente com a conclusão de `premissas` §3.3. **Se o owner disser que as rotas deste projeto não serão publicadas, o item sai e a dimensão de identidade fica** — que é exatamente o desenho "resposta é parâmetro, não reescrita".

### 8.4 `E-07` retirou `aggTrade` cru da captura e levou `nq` junto sem notar

Ver §1.4. **A conclusão de `E-07` sobrevive** (não capturar tick: o dump é re-baixável desde 2019-12-31) **e a consequência não declarada é real**: o dump **não tem `nq`**, logo `nq` é `CL-5`. **A resolução não reabre a captura de tick** — é agregado por bucket, custo de ordem 10² B/bucket e zero chamada nova.

### 8.5 Onde eu discordo do handoff

1. **A5 · "Parquet/DuckDB é o candidato mais alinhado" — concordo com a direção e recuso a inferência de que ela decide.** O handoff e `CST-6` nomeiam bem os falsificadores. Acrescento **o que os enfraquece como argumento pró-Parquet**: os dois (escritor único; compactação × hash de conteúdo) **não são falsificadores do Parquet — são requisitos que valem nos cinco candidatos** assim que o store é append-only e bitemporal. O que **é** específico do Parquet/objeto é **latência de rede por consulta** e **o custo de reescrever partição**. Ver [`ADR-002`](../adr/ADR-002-motor-de-armazenamento.md).
2. **"DuckDB tem `ASOF JOIN` nativo" não é argumento de escolha** — `as_of` desta plataforma é `argmin(observed_at)` sob `available_at <= t`, **redução bitemporal por janela**, não `ASOF JOIN`. `CST-6` já registra a nuance; esta SPEC a promove a §2.5, porque ela **remove** um dos quatro argumentos que o direcionamento usou.
3. **A1 · registro cru de F0: concordo com CLI (a), e o argumento do PM está incompleto.** *"A fila de 14 h precisa de observabilidade, não de ordenação por clique"* é verdade e não é o que decide. **O que decide é que (b) coloca `web` no caminho crítico de F0 e move o prazo de `Q16` para antes de F0** — e o gate de F0 é **por coletor**, com o snapshot podendo começar **hoje**. Escolher (b) reintroduz um gate de fase que R1 removeu de propósito. Ver [`ADR-008`](../adr/ADR-008-registro-cru-de-f0.md).
4. **`Q9` declarada MORTA: aceito a morte e recuso o enunciado da sepultura.** *"Guarde 1 min de tudo, custa ~72 GB uma vez"* é aritmética correta **sobre o disco**, e o disco **não é a restrição medida** — a restrição é **vizinhança**: a VPS roda 6 serviços e está sob pressão de disco documentada, com um runbook cujo passo 6 é *"liberar disco"* `[MEDIDO]`. ⇒ **`Q9` morre como pergunta de volume e renasce como restrição de LOCAL**, que é `ADR-002`, e o número que falta é `df -h`.
5. **A4 · `latest | largest`: concordo com gravar nome do stream + data do snapshot da doc, e acrescento o que falta.** A mitigação preserva a **capacidade de reinterpretar** e **não impede que um percentil errado seja publicado no intervalo**. ⇒ acrescento requisito: **toda estatística de tamanho sobre a série de liquidação intraday carrega o rótulo `semântica de subamostragem NÃO RESOLVIDA (latest|largest)` na própria saída**, não só no payload. Rótulo em coluna de payload não chega ao consumidor de máquina; e é consumidor de máquina que calcula percentil.

---

## 9. Perguntas em Aberto e o ponto exato de acoplamento

**Fonte única de numeração e estado: [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md).** Esta SPEC **não renumera e não responde nenhuma**. Para cada uma, **onde ela toca o desenho** e **por que a resposta é parâmetro**.

| Q | estado | onde toca esta SPEC | por que a resposta tardia é barata (ou não) |
|---|---|---|---|
| **Q1** autorização de ligar coletores | `ABERTA` | nada no contrato; **tudo no relógio** | **não é barata. É o único item sem mitigação de engenharia** — e §1.4 (`CL-5`) **aumenta** o custo de atraso, que agora inclui `nq` |
| **Q3** canal de alarme | `ABERTA` | S1 é **diagnóstico**, não alarme | detector já fixado: **contiguidade de `agg_id` + heartbeat, nunca taxa** (a vazão do mesmo símbolo variou **3,66×** entre dois dias) |
| **Q5** universo inicial | `ABERTA` | **nada em F0** (`!forceOrder@arr` cobre mercado inteiro) | universo é **filtro na LEITURA**; `contractType`, `underlyingSubType`, `venue_symbol` persistidos por linha |
| **Q6** TradFi | `INFERÍVEL` | `[INFERRED: cripto-perp; TradFi fora por default]` | filtro de leitura, **agora que `!forceOrder@arr` desnuda Q5/Q6 de poder sobre a captura**. Objeção de calendário de sessão **derrubada por medição** (TSLA/XAU, domingo, 288 buckets, OI mudando em 287/287) — **não reabrir** |
| **Q7** Bybit | `ABERTA` | `md.instrument` cross-venue e unidade normalizada na borda são requisito **de qualquer jeito** | se "não", `bybit-v5` é enum com **zero linhas**. Bybit publica `fundingInterval` em **minutos** e **33/464** strings comuns divergem |
| **Q8** fuso | `INFERÍVEL` (F0–F2) | `[INFERRED: UTC em F0–F2; armazenamento UTC sempre]` | prazo real é **F4** (marcação). `cvd_anchor = DiaUTC` está travado **no nome do construtor**, não é parâmetro de tela — **não reabrir** |
| **Q10** ordem dos produtos | `ABERTA` | decide qual superfície ganha teclado e densidade em F4 | **F1 entrega "pesquisar" e é a única construível hoje** |
| **Q11** owner marca o corpus | `ABERTA` | decide se o **modo** de marcação fica em F4 | `<Anotacao>` + `pointer_mode` são requisito **hoje**, custo de campos num JSON. **A primeira tranche é marcação de SWING**, que sobrevive a qualquer resposta de `Q20` |
| **Q12** alias | `ABERTA` | `instrument_alias` é mecanismo **de qualquer jeito** | a resposta é o **conteúdo** de ~5 linhas/ano |
| **Q13** cor do candle | **`RESPONDIDA`** 2026-08-25 (convenção ocidental; ver [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md)) | §6.2 | token por papel ⇒ trocar = **4 valores de hue + 361 medições** |
| **Q14** idioma | `INFERÍVEL` | `[INFERRED: pt-BR em microcopy; identificadores não traduzidos]` | **§3.8 tira de Q14 o poder de invalidar fixture** |
| **Q15** ToS | `ABERTA` | nada tecnicamente | `[MEDIDO]: nada` — **ninguém leu os três ToS. Zero evidência.** Restrição incide **retroativamente** sobre o que `Q1` manda acumular ⇒ **tensão real com Q1**, e esta SPEC não a esconde |
| **Q16** dono de `charts`/`web` | `ABERTA` | [`ADR-003`](../adr/ADR-003-fronteira-charts-web.md) desenha a fronteira; **o ponteiro em `[agents.by_component]` é edição de política** | `harness policy --key agents.by_component` → hoje só `sentimento`, `convergencia`, `backtest` |
| **Q17** spread | `RESPONDIDA COM RESÍDUO` | coletor **contingente** de F0; `<Anotacao>`/`run_registry` carregam a premissa | **§8.1**: resíduo é **(b) ou (c)**. A regra vale sob as três |
| **Q18** profundidade do backfill | `ABERTA` | parâmetro da fila retomável | **4,1 h contra 297 h** sequenciais; começar por 30 d e estender **não é retrabalho** |
| **Q19** `availability_probe_set` | `ABERTA` | **o probe de F0, e só ele** | **aritmeticamente restrito**: 6 símbolos a 10 s ou 20 a 30 s; **a 60 s não informa**. **Decide quais séries têm defasagem real PARA SEMPRE** — e é o que tira a Coinalyze da quarentena |
| **Q20** SMC × pivôs+Fibonacci | `ABERTA` | **nada em F0–F4**; decide o **vocabulário de zona** da fase seguinte | fixado hoje sob qualquer resposta: **`swing_point`** como primitivo · `price_source` por uso · `tick_size`/`price_precision` datados |

### 9.1 Suposições registradas — as três `[INFERRED]` do PRD, mantidas

Mantidas com o motivo e o custo de reversão do PRD §9, **sem acréscimo e sem reabertura**: `Q6` (cripto-perp), `Q8` (UTC em F0–F2), `Q14` (pt-BR em microcopy). **Nenhuma delas é unknown crítico** e as três revertem sem migração de dado.

### 9.2 Os números que faltam, nomeados

| falta | como obter | o que decide |
|---|---|---|
| **RAM livre da VPS** | `free -m` dentro da VPS | separa "cabe um daemon" de "não cabe" — teto no falsificador de [`ADR-002`](../adr/ADR-002-motor-de-armazenamento.md) |
| **disco livre da VPS** | `df -h` dentro da VPS | decide se **qualquer byte de série** pode morar local |
| **região da VPS** | `curl -s ipinfo.io` dentro da VPS | **`observer_region`, coluna de F0, impossível retroativamente** |
| **`nq` no WS `<symbol>@aggTrade`** | assinar e inspecionar o payload | desenho do agregador de bucket de §1.4 (não o contrato) |
| **`lag_ms` por endpoint** | M-1 (≈90 min) + probe contínuo | tira séries da quarentena; **`available_at` MODELED é 361× otimista sem ele** |
| **topologia do balde** | rampa até o primeiro 429 | **não é diferível**: decide se S4 ao vivo existe e se o guard de `scope: CrossSection` vale |
| **eixo do Lightweight Charts** | 288 pontos + 1.440 candles, tolerância 0,5 px | **declarado o maior risco técnico desta especificação** |
| **retenção do bucket S3** | `curl -sI` mensal (§5.8) | transforma "re-baixável" de premissa em fato datado |

---

## 10. ADRs emitidos — o que cada um fecha

| ADR | decisão | fecha a alternativa |
|---|---|---|
| [`ADR-001`](../adr/ADR-001-quantity-field-na-identidade.md) | `quantity_field` na `SeriesKey`; `q` canônico no caminho de decisão; `nq` série paralela capture-or-lose | *"um campo de quantidade do `aggTrade`"* |
| [`ADR-002`](../adr/ADR-002-motor-de-armazenamento.md) | catálogo/registro no Postgres existente; série em store colunar; **escolha entre os dois finalistas por spike com critério declarado** | ClickHouse como 7º container; Postgres row-store para a série |
| [`ADR-003`](../adr/ADR-003-fronteira-charts-web.md) | fronteira `charts` ⇄ `web` por **contrato de dado**, não por caminho | *"frontend é tudo `web`"* / *"gráfico é tudo `charts`"* |
| [`ADR-004`](../adr/ADR-004-reconexao-de-stream-sem-sequencia.md) | política de reconexão **por classe de stream**; sobreposição deliberada + dedupe por chave natural, com viés declarado | uma regra única para as duas classes |
| [`ADR-005`](../adr/ADR-005-transporte-de-leitura.md) | transporte por **envelope de bucket**, nunca tick; SSE para o vivo, HTTP para o histórico | WS de tick ao browser; polling do gráfico |
| [`ADR-006`](../adr/ADR-006-max-staleness-por-serie.md) | dois defaults **com nomes diferentes**, por série, no bundle; o acessor **nunca** cai no default de tela | uma constante de `max_staleness` |
| [`ADR-007`](../adr/ADR-007-price-source-por-uso.md) | `price_source` declarado **por `price_use`** no catálogo | uma série de preço canônica global |
| [`ADR-008`](../adr/ADR-008-registro-cru-de-f0.md) | registro de F0 é **relatório de CLI** com registrador nomeado; **consulta nomeada compartilhada** com S1 | registro em browser; duas implementações da mesma verdade |
| [`ADR-009`](../adr/ADR-009-reuso-da-forma-do-anything.md) | reusar **forma**, recusar **conteúdo**; layout `frontend/src/**`; componente `infra` **proposto, não decidido** | *"seguir o anything"* sem lista do que não se aplica |

---

## 11. Rastreabilidade — requisito → fase → Epic

| requisito | onde nesta SPEC | fase do plano | Epic |
|---|---|---|---|
| `[test_cmd]` + primeiro teste; dono de `charts`/`web`; cobertura de `frontend/` | §4.1, `ADR-003`, `ADR-009` | `01` | `CST-1` |
| Snapshot datado; one-shot Coinalyze `daily` | §3.4, §5.3 | `02` | `CST-2` |
| `forceOrder`; `premiumIndex`; probe; skew; `ingest_run/gap`; **agregado `q`/`nq`** | §1.4, §3.5, §5.4, §5.9 | `03` | `CST-2` |
| Shift canônico; R-1/R-2; `as_of`; `knowledge_time`; `SeriesKey` completa; identidade | §1, §2, §4.4 | `04` | `CST-3` |
| S2-mínima; selo; ausência; âncora; atribuição; auth mínima | §3.6, §6 | `05` | `CST-3` |
| `series_catalog`; 4 séries de L/S; `fee_schedule`; quarentena; zero-por-lado; S3 | §3.3, §5.2, §5.3 | `06` | `CST-4` |
| Paginação por janela; `-1130`; survivorship na borda; `universe_at`; S1; `janela_de_perda` | §5.5–§5.8 | `07` | `CST-5` |
| Motor; grade compartilhada; S4; S2 completa; `run_registry` | §7, `ADR-002` | `08` | `CST-6` |
| ADRs numerados; `env`; consolidação | §10 | `09` | `CST-7` |

**Divergência declarada, não silenciosa:** o plano tem **9 fases** sobre **7 Epics**. Dois Epics são partidos em duas fases cada, e o critério é **a fronteira do gate**, não o tamanho:
- **`CST-2` (F0) → fases `02` e `03`**, porque **o gate de F0 é declarado POR COLETOR**: o snapshot diário e o one-shot da Coinalyze **não precisam de `Q2`** (um `GET` mais `gzip`; 1.140 chamadas em ~28,5 min uma vez), e os coletores contínuos precisam. Fatiar em outro lugar reintroduziria o gate de fase que R1 removeu de propósito.
- **`CST-3` (F1) → fases `04` e `05`**, porque a fase `04` é **contrato sem rede e sem chave** (todos os fixtures em disco) e a `05` é a primeira superfície servida de um host exposto — **duas classes de risco e dois DoD diferentes**.

**Nenhum Epic novo, nenhuma fronteira de valor movida.**

---

## 12. DoD e falsificadores globais

**Cada fase do plano tem DoD que nomeia o comando e o universo.** *"Testes passam"* não é DoD.

**Os quatro falsificadores globais desta SPEC — se qualquer um aparecer, a SPEC está errada:**

| # | observação que derruba | o que ela derrubaria |
|---|---|---|
| **F-1** | uma leitura de decisão que devolva linha com `available_at > t_decisao` **ou** `bucket_end > t_decisao` sob `final_only` | §2.3 inteira — o mecanismo anti-lookahead |
| **F-2** | duas séries com a **mesma** `SeriesKey` cujos `cvd_cum` divirjam | §2.1 — a `SeriesKey` está incompleta, e §1 mostrou que ela estava |
| **F-3** | um item de plano que **não consiga declarar UM** componente do vocabulário fechado | §4.1 e `ADR-003` — a fronteira não é decidível, logo `[agents.by_component]` é decorativo |
| **F-4** | o mesmo `bundle_hash` + `window` devolvendo número diferente **sem recusa** | §7 — `knowledge_time` não está no caminho de leitura |

**DoD da própria SPEC** — três comandos, e os três falham hoje de propósito:

```
harness policy --key test_cmd                     # hoje {} -> tem de deixar de ser
harness policy --key agents.by_component          # hoje sem charts e sem web
harness rules --mode file --path <violador .tsx>  # hoje saída VAZIA, zero regras avaliadas
```

**Enforcement medido, não declarado.** As regras próprias que esta fase vier a declarar (`[[rules.own]]`) exigem corpus: `harness corpus verify --corpus <dir> --reference <cmd>` (igualdade de veredito) e `harness corpus mutate --corpus <dir> --reference <cmd>` (o corpus **defende** cada regra?). **Declarar regra sem corpus troca enforcement medido por enforcement declarado**, e esta SPEC não autoriza isso.

---

## 13. O que esta SPEC NÃO decide

**Por escopo declarado do owner:** limiar numérico · matriz de convergência · regra de entrada/SL/TP · métrica de performance · **detectores** (SMC **e** pivôs/Fibonacci — nomear o vocabulário não move a fronteira) · critério de match · walk-forward · paper trading · execução ao vivo.

**Por ser decisão do owner, e a dependência está declarada em §9:** as 14 perguntas abertas. **Em particular `Q20`**, que decide a fase **seguinte** — o que esta fase deve é o primitivo `swing_point` e `price_source` por uso.

**Por falta de número, com o número nomeado em §9.2:** o **finalista** do motor de armazenamento (`ADR-002` fecha os eliminados e declara o critério do spike) · o `availability_probe_set` (é `Q19`) · a região do observador.

**Por método:** **Coinglass**. Zero medição — nem doc lida, nem endpoint chamado. **Nenhum requisito desta SPEC depende dela, de propósito**, e nenhum pode passar a depender antes de o mesmo protocolo rodar. O que a Coinalyze demonstrou é o motivo: **11 chamadas derrubaram cinco afirmações que três documentos repetiam.**

**E o que fica registrado como fora de qualquer julgamento técnico:** escolha de corretora como decisão financeira · tamanho de posição e gestão de risco · jurisdição · se pagar assinatura de histórico vale o preço · qual tese de estrutura de preço o produto persegue.

---

**Status: `DRAFT`.** O gate `spec` é do **owner**. Esta SPEC não se aprova, não avança o ledger além de `SPEC_DRAFT`, e não cria, edita ou comenta nada no tracker.
