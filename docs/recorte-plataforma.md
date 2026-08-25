# Recorte de Plataforma e Faseamento — `cripto-strategy`

**Data:** 2026-08-24 · **Fase:** PLATAFORMA E DADOS · **Destino:** `docs/recorte-plataforma.md` · **Pipeline:** INIT → entra por `/pm`

---

## 1. O escopo declarado, e o que ele muda

O owner declarou em 2026-08-24: *"N é proposta sair com as regras das estratégias aqui, precisamos da plataforma e os dados, daí em seguida evoluímos com estratégias e convergência com análise de sentimento com a api da coinalyze + volume"*. Isso é fronteira dura e ela reordena, não reduz, a avaliação anterior. Dos **89 achados sobreviventes**, **68 são plataforma agora** e **21 são diferidos** — e diferido **não é descartado**: cada um dos 21 carrega uma porta que a plataforma não pode fechar (§4), e é justamente por isso que eles aparecem neste documento com nome e consequência de schema. O corte não foi por módulo (A/B/C/D) e sim pela pergunta única *"fechar isto é condição para INGERIR, ARMAZENAR e OLHAR o dado?"*. A consequência prática que decide quase tudo: onde a fase anterior pediria *"escolha o limiar"*, esta fase entrega **a distribuição medida** e transforma o limiar em **parâmetro nomeado**. O caso literal: o *"spike de OI > 5% em 15m"* da proposta dispara **zero vezes** em 31 dias de BTCUSDT (p99 = 0,7495%, máximo 2,4017%, n=8631) e **27 vezes** em COTIUSDT no campo notional em 7 dias — a plataforma entrega os percentis por símbolo e por campo, e o número sai do código. Nada aqui foi validado por `harness doctor`: o pack `core` são 5 regras de higiene de Python e nenhuma delas sabe o que é rótulo de bucket.

Distribuição dos 68 por ordem de dependência real: **13** contrato temporal e identidade do registro · **22** semântica declarada de cada série · **22** aquisição e persistência · **8** superfície de olhar e reprodutibilidade · **3** governança de fronteira.

---

## 2. O contrato de dados

Quatro definições passaram por validação adversarial. **As quatro receberam veredito `SOLIDA_COM_CORRECOES`.** Abaixo, cada uma no estado em que o validador a deixou: o que virou acordo (com a correção aplicada), e o que ficou **QUEBRADO** — e quebrado aqui significa *não implementar como escrito*.

Convenção de rótulo usada em todo o documento: `$S` = `data/` (não versionado) — ⚠️ a estrutura foi reorganizada por fonte em 2026-08-25; os subcaminhos citados abaixo (`$S/met/`, `$S/cz/`, …) traduzem-se pelo mapa em [`data/MANIFEST.md`](../data/MANIFEST.md).

### 2.1 Contrato temporal de ingestão

**ACORDADO (corrigido pelo validador):**

- **`event_time` canônico = FECHO da janela.** Toda coluna do dump `futures/um/daily/metrics` é rotulada pelo **início** do bucket; a borda aplica `event_time = create_time + 300000` **uma vez, às oito colunas**. Medido em duas frentes independentes: contra o REST (`openInterestHist`), conjuntos de timestamp idênticos **288 vs 288** e **MAE = 0,000000** em `sumOpenInterest` e `sumOpenInterestValue`; e contra verdade de campo recomputada dos `aggTrades`, com o taker ratio casando em shift 0 do rótulo cru com **MAPE 0,3529% / 0,2046% / 0,4289%** (2026-08-20/21/23, 288 buckets cada), contra 44–70% nos lags vizinhos.
- **Três relógios, um só decide.** `event_time` (fato de mercado) · `available_at` (mais cedo em que um consumidor ao vivo poderia saber) · `ingested_at` (auditoria). **Regra R-1: `backtest` e `convergencia` filtram por `available_at <= t_decisao`, nunca por `event_time`.**
- **Ordenação é garantia por fonte, verificada, nunca assumida.** `daily/metrics` **não vem ordenado**: 13 de 30 dias fora de ordem, e a quebra não é intermitente — **0 dias até 2026-08-10 e 13/13 desde 2026-08-11**, com deslocamento máximo de **275 posições em 288** e salto para trás de **1435 min**. É propriedade do dia de publicação, não do par (08-18 → 49/49/52 inversões em COTI/DOGE/SLX). `daily/aggTrades` veio limpo em 3 dias: **0 saltos de `agg_trade_id`, 0 `transact_time` decrescente em 8.873.078 linhas**, com ids contíguos atravessando a borda de dia.
- **Unicidade por `agg_id`, não por tempo.** Até **184 aggTrades no mesmo milissegundo**; 25,6% dos ms com colisão. E o invariante de continuidade é `a[i+1] == a[i]+1`, nunca `first/last trade_id`: **11.327 descontinuidades de `f/l` (0,862%) contra 0 de `agg_id`** no mesmo arquivo.
- **Lacuna nunca é preenchida no armazenamento.** 3 buckets ausentes em 8.640 (0,035%), todos em 2026-08-12, arquivo com 285 linhas; alts 2016/2016 sem gap. `LOCF` com `max_staleness_ms` explícito na leitura; `interpolate`/`ASOF >=` proibidos por lint e por revisão.
- **`sum_open_interest_value` É `sum_open_interest × mark price`** — a afirmação original ("nunca uma derivada da outra") foi **refutada**: preço implícito bate o último trade do bucket com mediana de **0,25 bp** (contra 3,07 bp no VWAP e 5,84 bp no primeiro trade), e bate o close de `[t, t+5min)` com **0,002516%** contra 0,058% nos vizinhos. Isso confirma de terceira forma independente o shift `+300000` **e** classifica OI como ponto na borda direita, não média de janela. As duas colunas continuam sendo parâmetros distintos — por outro motivo, medido: **55,1% da variação da série em quote é preço, não OI**.
- **Funding: 4h é a maioria.** 570 perpétuos `TRADING` → **{4h: 432, 8h: 136, 1h: 2}** = **75,79% em 4h**. Restringindo a `quoteAsset=USDT` (527): **{4h: 415, 8h: 110, 1h: 2}**. Cobertura de `fundingInfo` é 570/570 nos negociáveis; os 128 ausentes são 127 `SETTLING` + `GAIBUSDT` (`PENDING_TRADING`). `nextFundingTime % (h·3600000) == 0` em **570/570**.
- **Paginação: `startTime` E `endTime`, sempre.** `openInterestHist` com `startTime` sozinho devolve **os buckets mais recentes, HTTP 200, sem aviso** — backfill ingênuo grava dado de hoje com timestamp de semanas atrás. `-1130` é FIM DE HISTÓRICO (30 dias), não falha transitória. `limit=501` devolveu 501 linhas contra doc de máximo 500.

**QUEBRADO — não implementar como escrito:**

1. **`settlement_slot` está errado em 68,9% dos casos.** A fórmula prescrita (`floor(fundingTime / interval_ms_observed)`, com `interval_ms_observed` = diff entre liquidações) usa um divisor que **carrega o jitter** (14.400.002 ms em vez de 14.400.000). Medido sobre 16.919 liquidações de 60 símbolos: **11.658 slots errados**; exemplo `1000BONKUSDT` 2025-06-01 08:00:00.002 → slot 04:02:01.441, que não é ponto de grade nenhum. **O que falta:** trocar o divisor por `funding_interval_hours × 3600000` da própria linha, com a fonte sendo a coluna `funding_interval_hours` do dump `monthly/fundingRate` (verificado: `calc_time` casa exatamente com `fundingTime` do REST, 93/93 em BTC e 186/186 em LPT em 2026-07). Resíduo `t mod intervalo` medido em `[0, 20] ms`, nunca negativo, em 16.979 liquidações. E `interval_ms_observed UInt32` estoura acima de 49,7 dias (51 diffs medidos acima do declarado, maior em 8.768 h).
2. **A afirmação "o default de `lag_ms` só pode tornar o backtest pessimista" é FALSA.** Default = `interval_ms` = 5 min; o atraso real observado no único canal medido é **≥ 30 h** (carimbo interno dos 30 zips: mediana **30,29 h**, faixa 30,11–31,59 h após 00:00 UTC do dia coberto) — **361× de erro, na direção otimista**. **O que falta:** `lag_ms` medido por endpoint, ou quarentena. Primeira medição já existe (§2.3), com n=2.
3. **A verificação de R-1 por `grep` é fachada.** `harness.toml` só cobre `backend/src/**/*.py`, e exclui `**/migrations/**`; SQL em `.sql`, view materializada e filtro montado por ORM são invisíveis. **O que falta:** o teste tem que ser de comportamento — **fixture envenenada** (linhas com `event_time` passado e `available_at` futuro) exigindo resultado bit-idêntico ao dataset sem elas. `grep` fica como triagem, nunca como aprovação.
4. **`ReplacingMergeTree(ingested_at)` deixa backfill MODELADO sobrescrever captura OBSERVADA** — destruindo o `available_at` real (que é o único insumo de latência de campo) e apagando `qty_no_rpi` de linhas ao vivo, sempre na direção otimista. **O que falta:** `provenance` na chave de ordenação, ou versão que priorize `OBSERVED`.
5. **`IN-11` (campo desconhecido reprova o lote) é fail-closed contra mudança aditiva.** A Binance **adicionou** `nq` ao `aggTrades` (REST tem `{a,p,q,nq,f,l,T,m}`, o dump tem 7 colunas): sob IN-11, naquele dia toda a ingestão teria parado. **O que falta:** aditivo → quarentena + alarme; ausente/renomeado → reprova.
6. **`IN-13` (`available_at >= event_time`, 100%) derruba ingestão ao vivo por skew de NTP.** Falta `clock_skew_tolerance_ms` medido.
7. **Cruzar `symbol` com `exchangeInfo` de hoje na borda e reprovar o lote planta survivorship bias na ingestão** (109 símbolos históricos são invisíveis hoje). Até existir snapshot datado, é **aviso**, nunca `REJECTED`.
8. **A unidade do taker ratio não está declarada e `IN-06` não a fixa** (passa com base e com quote). A evidência favorece **quote**: fica mais perto do dump em **601/864 buckets (69,6%)**, com mediana do erro absoluto 1,7–2,9× menor. Portanto `md.series.unit` está vazia justamente na série que alimenta a perna de volume.

### 2.2 Screener de OI como mecanismo parametrizado

**ACORDADO:**

- **Persistir a métrica, nunca o booleano.** A tabela de fatos guarda `delta_pct` e o rank; "acendeu/apagou" é view calculada na leitura contra uma `ThresholdSpec` passada como argumento. É isso que permite trocar limiar sem reprocessar histórico.
- **`ThresholdSpec` como tipo-soma serializado dentro de cada evento:** `Absolute{pct, op}` · `Percentile{q, window, scope, min_obs, interpolation, op}` · `RobustZ{k, window, min_obs, op}`. **Nenhum eixo tem default** — `field`, `H`, `mode`, `direction` e o operador são todos obrigatórios. Default silencioso é como o `>5%` entrou na proposta.
- **A distribuição, medida, é o entregável** (`|ΔOI 15m|`, janela estrita, deslocamento por tempo):

| série | n | p50 | p90 | p99 | p99.9 | max | ≥5% |
|---|---|---|---|---|---|---|---|
| BTCUSDT 30d · base | 8631 | 0,0432 | 0,2115 | 0,7495 | 1,6303 | **2,4017** | **0** |
| BTCUSDT 30d · notional | 8631 | 0,0789 | 0,3281 | 0,9418 | 2,1080 | 3,6663 | **0** |
| BTCUSDT 7d (08-17..23) · base | 2013 | 0,0671 | 0,2910 | 1,1717 | 2,2903 | 2,4017 | 0 |
| COTIUSDT 7d · base | 2013 | 0,1546 | 0,5889 | 2,0378 | 5,0265 | 8,4870 | **3** |
| COTIUSDT 7d · notional | 2013 | 0,4063 | 1,4961 | **5,2388** | 10,6878 | 13,1944 | **27** |
| DOGEUSDT 7d · base / notional | 2013 | — | — | 1,4097 / 2,4971 | — | 4,9350 / 13,6910 | 0 / **8** |
| SLXUSDT 7d · base / notional | 2013 | — | — | 1,7365 / 2,3405 | — | 6,4310 / 14,3146 | **2** / **3** |

Nos **mesmos 7 dias**, p99 de COTI/BTC é **1,74× em base** e **4,33× em notional** — limiar global é sem sentido, e o mesmo número troca de significado entre as duas colunas do mesmo símbolo. Regra dos três para os zeros: `0/8631 → p ≤ 0,0348%/janela`. Horizonte e limiar são acoplados: p99 do BTC vai de 0,3623 (H=5min) a 3,3196 (H=240min).
- **Calibração é não-estacionária, e por isso vira telemetria.** p99 rolante de 7 dias no BTC varia **2,29×** (0,5124 → 1,1709). Out-of-sample honesto contra alvo de 1,00%: 0,89% / 0,95% / **2,58%**. A plataforma expõe `realized_firing_rate` ao lado da taxa alvo.
- **`field` sem default, porque as duas colunas discordam em SINAL** em 29,2%–33,7% dos buckets, e nos buckets de sinal oposto `sign(Δnotional) == sign(Δpreço)` em **100,0% dos casos nos 4 símbolos**. Nos alts, `sum_open_interest_value` correlaciona **mais com o preço (0,88–0,91)** do que com o OI em contratos (0,66–0,70).
- **Ordenação não é ETL:** lendo o CSV na ordem do arquivo, `pct_change(3)` fabrica **19 disparos de ">5%"** onde existem **zero**.
- **Funding: o operador vale 20×.** Em 1500 liquidações de BTCUSDT, `+0,0001` ocorre **175 vezes (11,67%)**: `|r| > 0,0001` → 9/1500 (0,60%); `|r| >= 0,0001` → 184/1500 (12,27%). E **p90 = p99 = o mesmo número** — percentil sozinho mente numa distribuição com átomo. Logo o endpoint de distribuição devolve **histograma**, e `Percentile` carrega `interpolation` e `op` explícitos.

**QUEBRADO:**

1. **A afirmação "z-robusto reduz a dispersão de 2,7× para 1,39×" está QUEBRADA em duas camadas.** O "2,7×" compara BTC/30d contra alts/7d (o número honesto, mesmos 7 dias, é 1,74×); e o `rolling(2016, min_periods=576)` **nunca preencheu a janela nos alts** — BTC rodou rolling verdadeiro, alts rodaram `expanding`. Com mesmos 7 dias e mesmo estimador: janela de 2 d → **1,94× (piorou)**; janela de 1 d → 1,66×. **O que falta:** trocar a conclusão. O achado que sobrevive é melhor — **o sinal do veredito depende de `RobustZ.window`**, logo a dispersão cross-símbolo do z é telemetria obrigatória, não uma promessa.
2. **"135 dos 875 símbolos não têm intervalo em `fundingInfo`" está REFUTADO.** No universo vivo (527 perp USDT TRADING) são **0**; os 135 são 127 `SETTLING` + 4 quarterly + 3 ausentes + 1 `PENDING`. A justificativa cai; **a regra de derivar o intervalo do dado sobrevive por outro motivo medido** — LPTUSDT trocou 4h↔8h e `1000XECUSDT` trocou 8h→1h→4h dentro de julho/2026.
3. **O ADR "invariância por truncamento para toda feature normalizada, inclusive CVD acumulado" é matematicamente impossível.** CVD depende da âncora: mesmo dia, mesmo dado, âncora 00:00Z → **−1265,982 BTC**, 12:00Z → **+399,745**, 20:00Z → **+1598,508**; amplitude de 5904,183 BTC = **10,3× o p90 do delta de um bucket**. O sinal inverte. **O que falta:** persistir `cvd_delta` por bucket (anchor-free, trivialmente invariante) e expor `cvd_cum(anchor)` como view com `anchor` obrigatório. ATR/EMA na mesma lista precisam de `burn_in` e `eps` — igualdade exata nunca vale para recursivo.
4. **A porta fechada mais cara: `field` é enum de 2 valores, e o mesmo arquivo/grade/ETL entrega mais 4 séries.** E o operador `delta()` assume que tudo é estoque — `sum_taker_long_short_vol_ratio` tem autocorrelação de **nível** de **0,0955** (ruído branco entre buckets) e `p99|Δ15m|` de **824,5975%** contra 0,7495% do OI: **1.100×**, não uma diferença de grau. **O que falta:** taxonomia `stock`/`flow`/`ratio` como atributo do `field`, com o operador escolhido pela taxonomia, e as 4 séries de L/S no schema desde já.
5. **`native_grid` amarrado a 5 min fecha a porta da fonte que o owner declarou** (Coinalyze expõe `1min`). Grade é propriedade da `source`, resolvida em runtime.
6. **O guard anti-lookahead está escrito em `bucket_end`, não em `available_at`** — e para `scope: CrossSection` isso é lookahead real, porque a varredura transversal leva 13,2 min a 40 chamadas/min. O teste de truncamento prescrito **passa** mesmo assim.
7. **PK `(symbol, source, bucket_end)` é unitemporal** e torna reconstrução point-in-time impossível: a segunda leitura do mesmo bucket sobrescreve a primeira, e `is_final` fica decorativo. **O que falta:** append-only, chave `(symbol, source, bucket_end, observed_at)`.
8. **O orçamento Coinalyze está subestimado ~6×:** a definição orçou 1 endpoint (527/40 = 13,2 min); são **6 endpoints históricos**, todos com "each symbol consume one API call" → 527 × 6 = **3.162 chamadas = 79 min por passada**.

### 2.3 Modelagem de instrumento e semântica que varia por símbolo

**ACORDADO:**

- **`symbol` não é o instrumento, e nenhum atributo de instrumento é escalar — todo atributo é função do tempo.** Fatos datados (SCD-2), lidos *as-of* a decisão, nunca "o valor de hoje".
- **O intervalo de funding muda no tempo:** **9 de 50** símbolos mudaram entre 2025-06 e 2026-07 (**18%**), com a migração em curso para 4h (25→42 na amostra). `1000XECUSDT` fez **8h → 1h → 4h dentro de julho/2026**, com a transição 8h→1h ocorrendo **1 hora** após um settlement (não no próximo múltiplo de 8h) e a transição 1h→4h produzindo um delta de **3,0 h**. `LPTUSDT` tem 720 eventos a 1h em 2025-06 e 4h depois, com um settlement pulado em 2026-06-24. **Um gerador de cronograma sintético emitiria eventos que nunca existiram.** Custo de funding no backtest = `Σ funding_rate × notional` sobre eventos observados; o intervalo nunca entra na conta.
- **O intervalo diverge entre venues para a mesma string:** Bybit publica `fundingInterval` em **minutos** (`{240: 408, 480: 383, 60: 2}` em 793 LinearPerpetual) e **33 de 464** strings comuns divergem (7,1%). Unidade normalizada na borda, com fixture de payload.
- **`create_time` do dump é INÍCIO do bucket**, medido contra `aggTrade` com MAE 0,004183 / 0,001948 / 0,005843 na hipótese INÍCIO contra 0,56 / 0,44 / 0,61 na hipótese FIM — duas ordens de grandeza.
- **São QUATRO séries de L/S, e uma delas é de outra natureza.** `count_long_short_ratio` (contas globais), `count_toptrader_long_short_ratio` (contas top 20%), `sum_toptrader_long_short_ratio` (notional top 20%), `sum_taker_long_short_vol_ratio` (**fluxo agressor**). Autocorrelação lag-1: **0,9999 / 0,9999 / 0,9996 contra 0,0955** (e −0,0083, −0,0022, 0,0365 nos alts). Ortogonalidade do taker: **|r| < 0,10 em 12 de 12 pares** nos 4 símbolos; Spearman 0,0073/0,0097/−0,0228. E `r(global, top_position)` **troca de sinal por símbolo**: −0,40 BTC, **+0,31 COTI**, −0,51 DOGE, −0,15 SLX. Reamostrar `last()` + LOCF é correto para estoque e **inventa dado** para fluxo.
- **Survivorship na origem do universo:** 980 prefixos em `daily/metrics` contra 872 no `exchangeInfo` (744 TRADING, 127 SETTLING, 1 PENDING); **109 ausentes** = 38 datados + 41 BUSD + **30 perpétuos USDT que sumiram**. Like-for-like (só cripto-perp): **727 histórico → 570 hoje = 78,4%**, ou seja **21,6% perdidos** — o "58,2%" original estava inflado ~2× por denominador contaminado com TradFi e futuros datados. `MATICUSDT` e `RNDRUSDT` **não foram deslistados, foram renomeados** (`POLUSDT`, `RENDERUSDT`) e a API não expõe a continuidade: `instrument_alias` curado à mão, com `evidence` (URL do anúncio) obrigatório.
- **Delisting é anunciado dentro do `exchangeInfo` e quase ninguém olha:** `deliveryDate` é a sentinela `4133404800000` em 568/570; `ICXUSDT`, `STORJUSDT`, `SCRTUSDT` estão **TRADING hoje com delisting em 2 dias**.
- **Alinhamento REST medido série a série** (corrige a generalização "dump = REST com shift +1"): `openInterestHist`, `topLongShortPositionRatio`, `topLongShortAccountRatio`, `globalLongShortAccountRatio` → dump = REST **−5 min**; **`takerlongshortRatio` → sem shift**. Duas colunas da mesma linha do mesmo endpoint têm semânticas temporais diferentes porque uma é estoque e a outra é fluxo.

**QUEBRADO:**

1. **`payload_hash` do JSON bruto não detecta mudança:** duas chamadas de `exchangeInfo` separadas por **3 ms** têm **872/872 payloads brutos diferentes** (ordem de `filters` não determinística) e **20 símbolos diferentes no conteúdo canônico** (nós de backend discordando sobre `POSITION_RISK_CONTROL`). SCD-2 gravaria uma "mudança" a cada poll. **O que falta:** hash sobre projeção canônica dos campos armazenados + confirmação em duas leituras.
2. **`contract_multiplier` derivado por regex do prefixo erra `1MBABYDOGEUSDT` por 10⁶.** `^1000` = 17 símbolos (o número publicado); o correto é **18**; `^\d` = 23, com 5 falsos positivos (`0G`, `1INCH`, `2Z`, `4`, `42`). **O que falta:** tabela explícita `(venue_symbol → multiplier, evidence_url)` curada, com teste que falha se algum `baseAsset` casar `^\d` e não estiver na tabela.
3. **`available_at = create_time + native_period_s` está QUEBRADO.** Medido: REST OI/contas publicam **68–155 s** após o rótulo; REST taker **131–201 s** após o fechamento (n=2 transições por série, BTCUSDT, 2026-08-24 23:13–23:23 UTC); dump S3 **~30,3 h**. **O que falta:** duas colunas — `available_at` e `availability_source ∈ {OBSERVED, MODELED}` — com o valor MODELED vindo de tabela de defasagem medida por endpoint. Isto é a mesma quebra do item 2 de §2.1: é o defeito compartilhado das quatro definições.
4. **`instrument.onboard_ts NOT NULL` + `UNIQUE(venue, venue_symbol, onboard_ts)` impede cadastrar exatamente os 109 símbolos que a seção existe para salvar** (`MATICUSDT` → `onboardDate = None`). E a invariante "nenhuma linha com `bucket_ts < onboard_ts`" **colide com `instrument_alias`** e é generalizada de n=2: vale só para quem foi onboardado depois de **2021-12-01**, que é a época do dataset `metrics` (BTC onboard 2019-09-08, primeiro dump 2021-12-01). **O que falta:** `onboard_ts` nullable com `onboard_ts_source`, identidade por `first_seen_ts`, e `dataset_epoch(source)` na invariante.
5. **A proibição por `grep -rn "funding_interval_hours" backend/src/backtest/` contradiz a promessa da própria definição** de entregar normalização de funding entre símbolos à fase seguinte — e não pega `funding_epoch.interval_hours`, view SQL nem atributo de ORM.
6. **`funding_epoch` (moda dos deltas, `epoch_to`) é leitura de futuro** se algum consumidor de decisão tocar nela: a época só fecha quando termina. É tabela de análise; o caminho de decisão lê `interval_hours_declared` do próprio evento (point-in-time por construção) ou moda trailing.
7. **PK `(instrument_id, settle_bucket)` sem `source`** impede guardar a versão do dump e a do REST do mesmo settlement — some exatamente a divergência que se quer auditar.
8. **A verificação "980 vs 871" caduca dentro desta fase:** `s3met.xml` tem `MaxKeys=1000` com 980 prefixos e `IsTruncated=false`; medido **+28 símbolos em 30 dias, +136 em 90 dias**. Folga de 20. Precisa paginar por `NextContinuationToken`, e o teste falha se `IsTruncated=true` sem paginação.

### 2.4 Papel da Coinalyze e sistema de registro

**ACORDADO — e esta é a definição com o rótulo de evidência mais honesto do conjunto: zero endpoints da Coinalyze foram chamados, não há API key.**

- **Coinalyze é FONTE; o sistema de registro é o armazenamento local, desde o dia 1.** O argumento sobrevive a todos os ataques: a doc declara apagamento diário com janela retida oscilando entre 1500 e 2000 pontos, logo a mesma query emitida em dois momentos **começa em pontos diferentes** — irreprodutibilidade não é degradação, é ausência de sistema de registro.
- **O SLO que decorre é o número operacional mais importante:** se o coletor parar por mais que a janela retida, aquele histórico não volta em nenhum tier, por nenhum preço. A `1min` são **24 h**; a `5min`, **5,2 d**. "Coletor Coinalyze parado" é P1 com orçamento de 24 h — alerta de perda permanente de ativo, não de infraestrutura.
- **O custo de guardar não é argumento:** 40 slots símbolo-série a 1 min = 5,94 MB/dia ≈ 2,17 GB/ano, contra **33,1 MB/dia de um único símbolo de `aggTrades` zipado** — a perna de CVD, já obrigatória, é 5,6× mais cara que todo o registro Coinalyze.
- **A Coinalyze não agrega:** `grep -oi "aggregat[a-z]*"` em `cz.html` e `coinalyze.txt` → **zero ocorrências**; nenhum dos 12 endpoints agrega. Qualquer visão multi-exchange é **derivada por nós**, custa `V×` chamadas, e a composição fica versionada como artefato nosso — o que resolve de graça a "estabilidade retroativa do agregado" que a avaliação deixou aberta.
- **Não é screener:** 570 símbolos × 4 séries = 2.280 chamadas = **57 min por varredura** a 40/min. Com o conjunto core de 4 séries e venue única, cabem **37 instrumentos** num ciclo de 5 min; com agregado de 5 venues, **7**.
- **A distribuição em vez do veredito (§4.1 da definição) é o melhor mecanismo do conjunto** e deve ser preservado: a reconciliação entre fontes é um **consumidor**, nunca um filtro no caminho de ingestão. Fonte que "corrige" antes de gravar destrói a evidência de que havia o que corrigir.

**QUEBRADO:**

1. **A "correção à `SKILL.md`" proposta era um TERCEIRO ERRO.** A definição escreveu "Coinalyze vence de 30min para cima, ponto de virada em 28,8 min" comparando contra a superfície **mais fraca** da Binance (REST, 30 d) — enquanto ela mesma elege o dump S3 como fonte de histórico profundo. O dump tem **2.183 dias, grade 5 min, cobertura 570/570 perp-TRADING**. Em `1hour`, **a Binance ganha por 34,9×**. **O enunciado correto:** *a Coinalyze só oferece histórico que a Binance não oferece em dois casos — granularidade abaixo de 5 min, e venues não-Binance. Para qualquer perpétuo da Binance a partir de 5 min, o dump S3 vence.* Isso **fortalece** a decisão §2.4: se ela não é fonte de história para nada da Binance, "não é sistema de registro" fica ainda mais fácil.
2. **O veto "qualquer regra futura que exija Coinalyze síncrona é rejeitada" fecha, por decreto e sem medição, a única família de sinal que a própria definição diz que só a Coinalyze fornece** — liquidação agregada (verificado: `data/futures/um/daily/` tem `aggTrades, bookDepth, bookTicker, indexPriceKlines, klines, markPriceKlines, metrics, premiumIndexKlines, trades` e **nenhum `liquidation*`**). Isso é decisão de estratégia embutida em definição de plataforma. **O que falta:** medir e publicar a distribuição de frescor da perna, e expor `max_staleness_ms` como parâmetro.
3. **A ocupação de cota está contra o denominador errado:** `hot+warm+cold = 34.920 chamadas/dia`; contra os 43.200/dia do próprio `R_efetivo` de 30/min isso é **80,8%**, não 57%. A reserva de 25% está sendo contada duas vezes, e a folga real para `heal` é 8.280 chamadas/dia, não 25.000. Some-se: os 3 endpoints `current` não estão orçados (se entrarem na `hot`, K=7 e o teto cai de 37 para **21** instrumentos), e `warm` como rajada de 400 chamadas no topo da hora ocupa 100% do balde por 13,3 min enquanto `hot` tem deadline de 5 min.
4. **"O custo independe da largura de `from`/`to`" está rotulado `(doc)` e a doc não diz isso** — é inferência por ausência, e a estratégia auto-curativa inteira depende dela. Nenhum dos testes P0–P13 a confirma. Hipótese concorrente não testada: "1500–2000 datapoints" pode ser **teto de resposta**, não só de retenção — se for, o backfill `daily` desde 2017 não cabe numa chamada.
5. **`17,7 B/linha` não reproduz.** Para 5 colunas numéricas independentes (o rótulo escrito), gzip -9 sobre 8.637 linhas reais dá **25,8 B/linha**; 17,7 só sai de `{t,o,h,l,c}` de série única, onde as colunas são auto-correlacionadas. A tese de custo sobrevive intacta; o número precisa ser trocado.
6. **`/ohlcv-history` NÃO tem `convert_to_usd`** (só `/open-interest`, `/open-interest-history` e `/liquidation-history` têm). Logo `v` e `bv` — a perna de volume que o owner nomeou — vêm fixos no que `oi_lq_vol_denominated_in` disser. Somar `BTCUSDT_PERP.A` com `BTCUSD_PERP.0` é ilegal dimensionalmente, e converter exige série de preço no mesmo bucket, ou seja **mais um alinhamento temporal dentro do agregado**.
7. **Os testes mais fortes do protocolo (P6/P8/P9) carregam um prazo falso** ("rodar em 5 dias ou 2026-08-23 é apagado") — e por isso já venceram. A contraparte Binance não precisa ser o arquivo em disco: **570/570 perp-TRADING têm dump `metrics`**, e `aggTrades/BTCUSDT` existe desde 2019-12-31. Os testes rodam contra qualquer dia ainda dentro da retenção, baixando ~11 KB e ~33 MB na hora.
8. **P3 (provocar 429 deliberadamente) está ordenado antes de P0/P1** e a doc da Coinalyze não declara escalação para ban. Rodar P0/P1 primeiro — são baratos e fixam `V` e `K`.

### 2.5 O lookahead que atravessa as quatro definições

Um único achado quebra o mecanismo central de duas delas e merece destaque próprio, porque está **no dump canônico da Binance**, que é a fonte de histórico profundo eleita:

```
ln(sum_taker_long_short_vol_ratio rotulado em T)  ×  retorno log do bucket:
  [T, T+5min)        n=864   r = +0,5458      <-- O FUTURO
  [T-5min, T)        n=862   r = +0,0612
  [T+5min, T+10min)  n=862   r = -0,0060
```

`r = +0,55` com exatamente um bucket futuro e ~0 com passado e com futuro+1: assinatura canônica de lookahead. Uma perna de fluxo lida no próprio `create_time` entrega correlação de +0,55 com o retorno dos próximos 5 minutos e vale **zero** ao vivo. E `label_convention` **não pega**, porque responde "`t` é abertura ou fechamento" e não "o valor descreve o intervalo antes ou depois de `t`". A defesa é a coluna `available_at` medida (§2.1 item 2, §2.3 item 3), com a constante já fixada e conferível: **para toda linha do dump `metrics` rotulada `T`, `available_at = T + 300 s`**, e para o caminho de backfill, `T + ~30,3 h`.

Custo a jusante de errar o rótulo por um bucket, medido em 8.629 janelas: **inversão do sinal do ΔOI de 15 min em 21,96% dos casos**, com erro induzido de p99 = 0,5062% contra sinal real de p99 = 0,7459%. Não é "divergência de 0,039%" — é destruição de 22% da informação direcional da perna de posicionamento.

---

## 3. Ordem de entrega

Cinco fases, na ordem de dependência real. A ordem **não** é A→B→C→D: o contrato temporal do Módulo C subiu para a primeira posição porque é o que decide se o dado gravado nasce certo.

### F1 — Contrato temporal e identidade do registro · 13 achados

**Componente:** `sentimento` (borda de ingestão) · ADR em `docs`
**Executável na segunda-feira de manhã: sim.** Zero dependência de rede, de API key e de decisão do owner — todos os fixtures estão em `$S`.

**Entrega:** carregador de `daily/metrics` e `daily/aggTrades` com (a) shift canônico `event_time = create_time + 300000` aplicado uma vez às oito colunas, gravando `src_label_raw`; (b) ordenação obrigatória do arquivo inteiro antes de emitir evento; (c) unicidade por `agg_id` com verificação de contiguidade; (d) tabela `ingest_gap` persistida (nunca log); (e) acessor único `as_of(serie, symbol, t, max_staleness_ms)` filtrando por `available_at`, com `LOCF` e sem `interpolate`; (f) as colunas `(event_time, available_at, availability_source, ingested_at, provenance, src_label_raw, source)` em toda linha; (g) `cvd_delta` por bucket como fato, `cvd_cum(anchor)` como view.

**Condição de pronto (o owner roda, não confia em mim):**

| Comando | Saída esperada |
|---|---|
| Carregar `BTCUSDT-metrics-2026-08-18.csv` (md5 `b8ef79c353f2adce853c68084cc3b631`) e verificar monotonia na saída | monótono; bypassando o sort → **reprova** |
| Carregar `2026-08-12` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`) | **285 linhas + 1 linha em `ingest_gap` com `n_missing=3`** |
| Contiguidade nos 3 dias de `aggTrades` | `0 saltos, 0 ts decrescente, 8.873.078 linhas`; e `last_id(D)+1 == first_id(D+1)` |
| Deletar 1 linha do fixture de aggTrades | **reprova** |
| Recomputar taker ratio dos aggTrades por bucket vs `sum_taker_long_short_vol_ratio` | MAPE **0,3529 / 0,2046 / 0,4289 %** em shift 0 do rótulo cru |
| Comparar dump `+300000` vs `rest_oi.json` (md5 `a3a941904ab9bbe27024929d157ca6d1`) | conjuntos **idênticos, 288 vs 288, MAE 0,0** |
| Fixture envenenada (linhas com `event_time` passado e `available_at` futuro) | resultado **bit-idêntico** ao dataset sem elas |
| `cvd_cum` sem `anchor` | erro; com âncora 00:00/12:00/20:00 → **−1265,982 / +399,745 / +1598,508 BTC** |

**O que F1 NÃO faz:** não define limiar, não calcula convergência, não chama Coinalyze, não escolhe motor de banco (o contrato temporal é portável entre TimescaleDB e ClickHouse; nenhum dos dois foi instalado nem medido), não decide `field` nem `H` nem `direction`.

### F2 — Semântica declarada de cada série · 22 achados

**Componente:** `sentimento` · ADR em `docs`

**Entrega:** catálogo `series_catalog` como contrato lido pelos testes, com `series_key = (provider, venue, instrument_id, metric, cohort, interval, unit, nature, ts_convention, label_shift, aggregation_scope)`; `nature ∈ {STOCK, FLOW, RATIO, EVENT, TICK}` e `ts_convention ∈ {POINT_AT_BUCKET_END, AGGREGATE_OVER_BUCKET}`; tabela de shift **por endpoint** (`openInterestHist`/`topLongShortPositionRatio`/`topLongShortAccountRatio`/`globalLongShortAccountRatio` → −5 min do rótulo REST para o rótulo de dump; `takerlongshortRatio` → 0); as **quatro** séries de L/S com colunas próprias e **proibição de uma coluna genérica `ls_ratio`**; `funding_settled` e `funding_estimado` em séries distintas, com `interval_hours_declared` por linha vindo do dump `monthly/fundingRate`; `capped` booleano por linha; as duas colunas de OI (`base_contracts`, `notional_usd`) mais `implied_avg_price` e `price_effect`; `unit` e `denom` obrigatórios; `cvd_source ∈ {aggtrade, kline_takerbuy, rest_taker_vol, metrics_ratio}` com erro medido publicado por fonte.

**Condição de pronto:**

- Toda série no catálogo tem `label_shift` com `verified_by` apontando um teste que **mediu** o shift; série com `label_shift IS NULL` fica **fisicamente isolada** (nenhuma leitura de `backtest` a enxerga). Coinalyze inteira nasce nesse estado.
- Autocorrelação lag-1 reproduz **0,99+ nas três séries de posicionamento e ~0 no taker** nos 4 símbolos; `delta()` aplicado a `nature=FLOW` **é rejeitado pelo tipo**, não por convenção.
- `settlement_slot` verificado sobre `frm/*.zip`: **0 slots fora da grade em 16.979 liquidações**, resíduo em `[0,20] ms`, nunca negativo. Fixture `1000XECUSDT-fundingRate-2026-07.csv` (321 linhas) trava a transição 8h→1h→4h e o delta de 3,0 h; dupla ingestão → `count(*) = 321`.
- Reconciliação de CVD sobre a mesma hora: kline `2·takerBuyBase − volume` bate `aggTrade` com **corr 1,000000, MAE 0,0443 BTC, drift 2,55 BTC em 3 dias**; ratio do dump com **corr 0,999948, MAE 1,0181, drift 123,88**. Os dois números vão para o catálogo, não para uma escolha.

**O que F2 NÃO faz:** não elege `field` canônico, não elege coorte de L/S, não define "extremo" de funding, não normaliza automaticamente entre unidades.

### F3 — Aquisição e persistência · 22 achados

**Componente:** `sentimento` (ingestão, universo) · consome-se em `backtest`

**Entrega:** paginador que **sempre** envia `startTime` e `endTime`, com `n_expected` e rejeição de qualquer rótulo fora da janela; `-1130` classificado como fim de histórico; `md.ingest_run` com `src_sha256`, `n_expected/n_returned/n_written`, `verdict` e `weight_used`; ETL do S3 (`metrics`, `aggTrades`, `monthly/fundingRate`) com dedupe por hash de conteúdo (verificado byte-estável, inclusive os 183 MB de `aggTrades`); transporte com **Redis Streams + consumer group** para todo consumidor com estado (Pub/Sub é at-most-once por doc e um acumulador de CVD não sobrevive a isso); WebSocket com detecção de buraco por `agg_id` e particionamento de símbolos dimensionado contra vazão medida (**p50 21, p95 204, p99 483, p99.9 1.251, max 3.224 msg/s** num único símbolo); orçamento de rate limit por contador local com `Retry-After`, jitter e circuit breaker; **snapshot diário datado de `exchangeInfo` + `fundingInfo` começando no dia 1** (1,18 MB/dia bruto, 54 KB gzip); `universe_at(ts, filtro)` com `universe_source ∈ {snapshot, s3_inferred}`; broker único de cota Coinalyze contando símbolo-chamadas, com filas `hot`/`warm`/`cold`/`heal`.

**Condição de pronto:**

- Pedir `startTime` de 60 dias atrás → `verdict='REJECTED'`, `api_code=-1130`, **zero linhas gravadas**. Replay do caso `startTime` sozinho (`oi20.json`) → **reprova**, não grava.
- Backfill de um dia em 5m → **288 pontos distintos**; de 2026-08-12 → 285 + gap registrado.
- `universe_at('2025-08-01')` inclui `ICXUSDT` e exclui `DOSUSDT` (onboard 2026-08-11); listagem S3 pagina por `NextContinuationToken` e o teste falha se `IsTruncated=true` sem paginação.
- Orçamento publicado como aritmética conferível, não como suposição: Binance `REQUEST_WEIGHT 2400/min`, `premiumIndex` sem `symbol` = 875 símbolos por peso 10 (batch existe para funding e **não existe** para OI, que é 1 símbolo/chamada); Coinalyze 40 calls/min por key, 527×6 = **79 min/passada**, ocupação `hot+warm+cold` = **80,8%** do `R_efetivo`.
- Custo de ETL declarado com medição: **0,86 s/arquivo** (n=11) → 570 símbolos × 30 dias ≈ 4,1 h sequenciais; funding de 980 instrumentos × ~60 meses ≈ 14 h.

**O que F3 NÃO faz:** não escolhe corretora (decisão financeira do owner), não fixa `N` do universo nem `V` de venues antes de P0/P1, não dispara ordem, não decide se a Coinalyze pode estar em caminho síncrono de decisão.

### F4 — Superfície de olhar e reprodutibilidade · 8 achados

**Componente:** `charts` + `web` (renderização e painéis) · `backtest` (run registry) · decisão de motor em ADR próprio

**Entrega:** decisão de armazenamento (TimescaleDB vs ClickHouse) tomada com dataset e restrição de unicidade **ligada**, sobre volumetria medida (1,31–4,80 M linhas/dia/par de `aggTrade`; 288 linhas/dia/símbolo de `metrics`; 39,0 B/linha zip); grade canônica como **uma única função compartilhada** entre gráfico e qualquer motor, versionada junto com o dado derivado; painéis com rótulo visível de qual série está na tela (funding liquidada vs estimada vs predita; campo do bucket `o|h|l|c` quando a fonte é OHLC); `tf_minimo_com_painel_oi` como capacidade declarada por fonte, com o painel **se desabilitando** em vez de interpolar; endpoints `/screener/distribution`, `/screener/scan`, `/screener/firing_rate`; bundle de parâmetros **versionado e hasheável**; `run_registry` com hash do bundle, janela de dado lida, commit e data.

**Condição de pronto:**

- `scan` com `Absolute{5.0}` sobre BTC/30d devolve **0 linhas** e `distribution` mostra `max = 2,4017` — e a conferência é feita por **dois caminhos independentes** (view vs recontagem sobre a tabela crua), não pela mesma tabela duas vezes.
- Detecção é dado do backend com seus timestamps; `frontend/` é declarado sem cobertura de regra no `harness.toml`, logo lógica de domínio lá é onde nenhuma regra morde — verificação é um `grep` que o owner roda.
- Toda métrica exibida vem com o **bloco de universo derivado do dado** (par, período, TF, N de símbolos, N ativos no fim do período, taxa datada, latência medida, N de trades), nunca digitado.

**O que F4 NÃO faz:** não desenha zona SMC (detectores são diferidos), não implementa "Gerenciador de Presets" (produto prematuro; o schema hasheável é que entra), não calcula métrica de performance.

### F5 — Governança de fronteira · 3 achados

**Componente:** `docs` (+ `harness.toml`)

**Entrega:** ponteiro de arquiteto para `charts` no `harness.toml` (hoje `by_component` tem `sentimento`, `convergencia` e `backtest` e **nenhum `charts`** — conferível com `grep -n "by_component" -A2 harness.toml`, arquivo do próprio repositório); ADRs numerados `ADR-NNN` para cada decisão de §2; dimensão `env ∈ {mainnet, testnet, demo, replay}` em **toda** linha de ordem/fill desde a primeira, para que dado de execução nunca se confunda com dado de mercado.

**Condição de pronto:** `harness.toml` tem dono para os quatro componentes de domínio; nenhum ADR de F1–F4 sem `ADR-NNN`; teste que rejeita linha de ordem sem `env`.

**O que F5 NÃO faz:** execução ao vivo não é desta fase, por decisão de escopo do owner. (Rótulo: a crítica original de que "§Módulo D empacota cinco produtos" é **julgamento de escopo, não medição** — não-verificável.)

---

## 4. As portas que ficam abertas

Os 21 diferidos existem para que a fase de estratégia não vire retrabalho. Cada um exige algo da plataforma **hoje**, em ordem decrescente de custo de esquecer:

1. **`aggTrade` CRU guardado, não só candle.** É a porta mais cara. Sem ela, o modo de avaliação por tick, o desempate SL-vs-TP dentro da mesma barra, a reconstrução de sweep intrabar e a perna de CVD ficam impossíveis depois — e o REST só devolve **48 h**. Custo medido: 1.314.556 a 4.802.005 linhas/dia/símbolo (87–319 MB CSV, 33–57 MB zip), variação de 3,7× entre dois dias da mesma semana. `dias_de_retenção_de_tick × símbolos` é o parâmetro que dimensiona tudo.
2. **`available_at` medido e persistido, por série.** Latência de dado não é estimável retroativamente. Se não for gravada durante a ingestão, a janela de coincidência da matriz e o embargo do walk-forward são chute com aparência de rigor.
3. **Séries brutas e separadas; nenhum "índice de sentimento" composto como coluna primária.** Se o composto existir, é view derivada e reversível — a colinearidade **não é uniforme** (r = +0,9964 entre duas das quatro séries, −0,4005 entre outras duas, e troca de sinal por símbolo), o que torna a fusão precoce destrutiva e a ablação impossível.
4. **Eventos datados, nunca booleanos pré-avaliados nem "estado atual" sobrescrito.** Gravar `oi_alto = true` em vez do valor e seu timestamp impede calcular qualquer janela `W` depois. Corolário: **nunca deduplicar sinal na ingestão** — a contagem bruta some e o intervalo de confiança da fase seguinte fica sem denominador.
5. **Grade canônica exportável de forma determinística** (mesmo intervalo, mesma regra, mesmo hash), para que qualquer detector futuro leia exatamente a série que o gráfico mostrou.
6. **Nenhuma tabela de `swing_high`/`swing_low` materializada como se fosse fato.** A definição de swing é o gargalo de 3 dos 4 detectores e é diferida. O que a plataforma deve é **tick size e price precision por símbolo, com data de vigência** — toda tolerância de "igual" futura é expressa em ticks, e tick size muda no tempo.
7. **Fixture recortável e congelável byte-idêntica ao que o gráfico exibiu, INCLUINDO os buracos reais** (medi um dia com 285 de 288 pontos). Fixture "limpa" por gapfill não serve como referência de marcação.
8. **`high`/`low` íntegros no TF de operação**, senão nenhum label (R alcançado, MFE/MAE em H barras) é calculável depois — e essa perda não é reversível.
9. **Snapshot imutável e endereçável do dataset (hash das partições usadas)**, senão as 7 linhas do grid de ablação `2³−1` não são comparáveis entre si e o go/no-go do produto fica sem base.
10. **Run registry desde a primeira execução**, com hash do bundle e janela de dado lida — sem isso a trava de sobreposição calibração/avaliação não tem sobre o que operar, e a distinção vira memória humana.
11. **Toda série derivada carrega no metadado a janela de dado que a produziu**, senão o embargo do walk-forward não é calculável.
12. **Cadência nativa como metadado, e proibição de upsampling implícito.** Reamostrar OI de 5 min para 1 min sem marcar `locf` apaga exatamente a informação que decide se a perna 3 é gate de regime ou confirmação datada.
13. **`fundingTime` reais por símbolo com o intervalo vigente por linha**, senão a estratificação por "tempo até a liquidação" erra o bucket em todo o histórico anterior a qualquer troca de regime.
14. **Ordem total determinística: `(timestamp, tipo_de_evento, sequência_da_fonte)` desde a ingestão.** Para `aggTrade` a sequência existe e é confiável (0 descontinuidades em 8,87 M linhas); se `agg_id` não for persistido, o desempate não é reconstituível.
15. **Microestrutura guardada no período que o backtest for cobrir**, sem a qual slippage não é modelável.
16. **`env` em toda linha de ordem/fill desde o dia 1**, senão existirá um período em que dado de demo e dado real são indistinguíveis no store.
17. **O bloco de universo derivável do dado, exposto como consulta** — senão o dashboard futuro preenche à mão, e à mão ele mente.
18. **A `ThresholdSpec` precisa de escape hatch** (`spec_version` + `Custom{expr}` desabilitado por padrão), senão "o limiar é parâmetro" vale só para os três formatos que esta fase adivinhou.
19. **Política as-of por `nature`, não uniforme.** LOCF para estoque; para fluxo (volume, liquidação, taker), bucket ausente é zero ou desconhecido, **nunca** o valor anterior — e a direção declarada pelo owner é exatamente fluxo.
20. **`md.instrument`: identidade de instrumento cross-venue.** Coinalyze tem namespace próprio (`BTCUSDT_PERP.A`), Bybit tem outro; juntar `cz.open_interest` com `bn.open_interest` — o propósito literal do módulo `convergencia` — não tem chave hoje.
21. **`bar_policy ∈ {final_only, intrabar}` declarado pelo consumidor**, e separação entre leitura-de-decisão (bucket fechado, obrigatório) e simulação-de-execução (caminho intrabar permitido, premissa declarada) — senão o motor de backtest trava ou a regra é ignorada.

---

## 5. O que o `/pm` recebe

### Problema

Não existe hoje uma camada de dados sobre a qual seja possível afirmar que um número de mercado significa o que se pensa que significa. As três medições que dimensionam o problema, todas sobre dado real: (a) o mesmo valor de OI aparece rotulado com **dois timestamps diferentes** em duas superfícies da mesma corretora, e um bucket de rótulo errado **inverte o sinal do ΔOI de 15 min em 22% das janelas**; (b) uma coluna do dump canônico da Binance carrega, no rótulo `T`, o fluxo agressor de `[T, T+5min)` — **r = +0,5458 com o retorno futuro**, r ≈ 0 com o passado; (c) **21,6% do universo cripto-perpétuo com histórico não existe mais** no `exchangeInfo` de hoje, e são justamente os que morreram. Sem contrato temporal, catálogo semântico e universo point-in-time, qualquer estratégia construída em cima nasce sobre um número que ninguém consegue defender — e este produto dispara ordens com capital do owner.

Agrava: **nenhuma fonte gratuita tem histórico intraday profundo de OI** (REST = 30 dias; Coinalyze = 5,2–6,9 dias a 5 min, por retenção declarada). Cada dia não gravado é um dia perdido para sempre. Isso inverte a ordem do cronograma original: persistência própria deixa de ser o terceiro entregável e passa a ser o primeiro — que é exatamente o que o owner pediu.

### Escopo de ENTRADA

Ingestão, semântica declarada, contrato temporal, armazenamento, universo point-in-time, reprodutibilidade e a superfície que permite olhar o dado. Fontes: dumps `data.binance.vision` (`metrics`, `aggTrades`, `monthly/fundingRate`, `klines`), REST Binance USDⓈ-M (`/fapi/v1/*`, `/futures/data/*`), WebSocket Binance, e **Coinalyze como capacidade da camada de dados** (schema longo que a acomoda sem migração, adaptador, broker de cota, quarentena até os testes de rótulo passarem) — requisito de hoje por declaração do owner, mesmo sem estratégia e mesmo sem key. Componentes: `sentimento`, `charts`, `web`, `docs`; `backtest` só na parte de run registry e dimensão de ambiente.

### Escopo de SAÍDA (diferido, não descartado)

Limiar numérico de sinal, matriz de convergência, regra de entrada/SL/TP, métrica de performance, detectores SMC (swing, OB, FVG, BSL/SSL, BOS/CHoCH), corpus de fixtures marcadas à mão, critério de match, protocolo de walk-forward, paper trading e execução ao vivo. Cada um dos 21 aparece em §4 como porta que a plataforma não pode fechar.

### Perguntas que só o owner responde

1. **Obter API key da Coinalyze é ação de qual semana?** Cada dia sem key é um dia de série de 1 min perdido para sempre (retenção declarada de 24 h nessa granularidade). Isso é o único item desta fase com relógio de expiração diário.
2. **Universo: quantos símbolos, em qual cadência, com quais séries?** A plataforma entrega a aritmética (570 perpétuos; Binance sem batch para OI; Coinalyze 40 calls/min → 37 instrumentos a 5 min com 4 séries, ou 7 com agregado de 5 venues; 79 min para uma passada de 527×6). O corte é decisão de produto.
3. **Retenção de `aggTrade` cru: quantos símbolos × quantos dias?** É o parâmetro que dimensiona o custo (33–57 MB zip/dia/símbolo) e é a porta que, se fechada, bloqueia modo tick e CVD histórico sem re-ingestão.
4. **`contractType`: TradFi entra?** Há **170 `TRADIFI_PERPETUAL`** (equities, commodities) no mesmo endpoint, com distribuição de funding invertida (`{8h: 158, 4h: 12}`). Sem critério explícito, o screener varre uma classe de ativo que o owner não sabe que entrou.
5. **`MATIC→POL` e `RNDR→RENDER` devem ser série contínua?** A API não expõe a continuidade; exige curadoria manual com evidência. É decisão de significado econômico, não técnica.
6. **Pagar fornecedor de histórico intraday, acumular do zero, ou aceitar horizonte curto?** Determina quando a fase de estratégia pode sequer começar a validar. Decisão financeira.
7. **Bybit entra como fonte de dado nesta fase?** Se sim, a convenção de OI (um lado vs dois lados) e a unidade de `fundingInterval` (minutos) precisam ser normalizadas antes da primeira linha gravada. **Se a Bybit deve ou não ser a corretora é decisão financeira do owner e eu não a julgo.**
8. **Termos de uso e redistribuição** de Binance, Bybit e Coinalyze — **não li os ToS de nenhum dos três**.

---

## 6. Evidência e sua força

### 6.1 MEDIDO sobre dado real (força máxima)

Todos os números deste documento marcados como medição vêm de arquivos em `$S` e foram, na maioria, **reproduzidos por um segundo agente adversarial** que os recomputou de forma independente. Base física: 30 arquivos diários de `BTCUSDT-metrics` (8.637 linhas, 2026-07-25..08-23) · 21 arquivos de alts (COTI/DOGE/SLX, 6.048 linhas) · **8.873.078 linhas de `aggTrades`** em 3 dias completos · 120 zips de `monthly/fundingRate` (60 símbolos, 16.979 liquidações) · `ei.json`/`ei2.json`, `fi.json`/`fi2.json`, `oih.json`, `rest_oi.json`, `tp.json`, `pi.json`, `by.json`, listagem S3 completa (980 prefixos).

Reproduções que conferiram **dígito por dígito** em validação independente: 432/570 = 75,79%; shift `+300000` com MAE 0,000000 e 288/288; MAPE do taker 0,3529/0,2046/0,4289; 13/30 dias fora de ordem com o corte em 2026-08-11 e as 13 contagens de inversão; 8.637/8.640 com o gap único em 2026-08-12; 2.756.517/4.802.005/1.314.556 linhas e 0 saltos de `agg_id`; 184 trades no mesmo ms; 980 prefixos / 109 ausentes / GAIBUSDT; jitter ≤ 20 ms sempre não-negativo; `1000XECUSDT` 8h→1h→4h; autocorrelação 0,99+ vs ~0; ortogonalidade |r|<0,10 em 12/12; todos os md5 de fixture.

**Medições feitas SÓ na validação adversarial** (portanto sem segunda reprodução, mas com comando publicado): decomposição `Δnotional = Δbase + Δpreço` com 100% de concordância de sinal nos buckets opostos · unidade quote favorecida em 601/864 buckets · `sum_open_interest_value = OI × mark` a 0,25 bp · CVD por kline com corr 1,000000 e drift 2,55 BTC · lookahead do taker com r = +0,5458 · inversão de sinal em 21,96% sob rótulo deslocado · `settlement_slot` errado em 68,9% · `payload_hash` com 872/872 falsos positivos · `1MBABYDOGEUSDT` · dispersão do z invertendo com a janela · 0 símbolos vivos sem `fundingInfo`.

### 6.2 DOC PÚBLICO, com citação (força média — o owner confere na fonte)

- Binance USDⓈ-M · *Open Interest Statistics*: `timestamp` = **"End time of the period"**.
- Binance · *Aggregate Trade Streams*: **"the insurance fund trades and ADL trades won't be aggregated"** — o CVD de `aggTrade` exclui por construção o fluxo forçado, exatamente o regime de cascata.
- Binance · *Liquidation Order Streams*: **"For each symbol, only the latest one liquidation order within 1000ms will be pushed as the snapshot"** — a magnitude não é computável do stream; qualquer soma sobre ele é limite inferior.
- Binance · WebSocket: desconexão garantida a cada 24 h ⇒ reconexão é rotina diária, não exceção.
- Binance · limite global `REQUEST_WEIGHT 2400/min` (lido do `exchangeInfo` baixado).
- Redis · Pub/Sub é at-most-once: **"the message is forever lost"**.
- TimescaleDB · `time_bucket_gapfill` + `interpolate` interpola **linearmente entre o ponto anterior e o posterior** — lookahead por construção. `locf` é seguro.
- ClickHouse · **"Uniqueness of rows is determined by the ORDER BY table section, not PRIMARY KEY"** e **"Data deduplication occurs only during a merge... at an unknown time"** — para soma acumulada, unicidade eventual não serve.
- Coinalyze · `coinalyze.txt` l.39 (**"40 API calls per minute per API Key"**), l.43 (**"maximum 20 symbols, each symbol consume one API call"**), l.218 (namespace `BTCUSDT_PERP.A`), l.399-406 (**"We keep only between 1500 and 2000 datapoints for intraday timeframe/granularity (1 minute till 12 hours), the old data is deleted each day. For daily timeframe/granularity we do not delete the old data"**).

**Rótulo honesto sobre a última:** é um **intervalo declarado pelo fornecedor**, não um número medido. A aritmética derivada (5,2–6,9 d a 5 min; 62,5–83,3 d a 1 h) herda essa imprecisão.

### 6.3 DOC-ONLY, sem nenhuma chamada — toda a Coinalyze

**Zero endpoints da Coinalyze foram chamados. Não há API key no repositório.** Tudo em §2.4 vem de duas capturas de documentação (`coinalyze.txt`, `cz.html`) e de aritmética sobre o texto. Especificamente **não medido e não afirmável**: semântica de `bv` (é lado agressor? a doc não diz — **`bv` não substitui `aggTrade` para CVD sem prova**), semântica de `r` no L/S (população não declarada), convenção do `t` dos buckets (abertura ou fechamento), retenção efetiva, comportamento sob 429, se "1500–2000" é retenção ou teto de resposta, custo real vs largura de janela, e composição do agregado.

**Consequência estrutural, e ela é a força desta rodada:** nenhuma decisão irreversível de plataforma depende da Coinalyze. O schema longo a acomoda sem migração; a quarentena por `label_shift IS NULL` a isola fisicamente; se os testes derrubarem a doc, muda o orçamento, não o schema. E o lado Binance do teste decisivo (`bv` vs taker buy volume) **já está calculado e em disco** — a fixture existe, falta a chave.

### 6.4 CONTESTADO — medições em conflito, não resolvidas

**Headers de peso em `/futures/data/*`.** Uma medição relata `h_oi.txt` (`openInterestHist`, 1 símbolo) com `x-mbx-used-weight-1m: 1`; outra relata que a família responde 200 **sem nenhum header `x-mbx-*`**, e que a única captura de header disponível para essa família é um **400 servido pelo CloudFront** (que não prova nada sobre o 200). Não resolvi. Fecha com um comando: `curl -sD - "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&startTime=...&endTime=...&limit=1" -o /dev/null | grep -i x-mbx`. Enquanto não fechar, o orçamento é contabilizado localmente — que é o desenho correto de qualquer forma.

**Topologia do balde de rate limit** (por endpoint vs compartilhado) decide se a varredura de 5 séries × 570 símbolos custa **2,85 min** (cabe, 43% de folga) ou **14,25 min** (não cabe: série de 5 min entregue com 15 min de defasagem). Não testado. O teste correto é rampa **até o primeiro 429** e recuo — 429 é o aviso, 418 vem de reincidir após ele. **Isto não é diferível:** a resposta muda `lag_ms` da perna de posicionamento ao vivo de segundos para ~15 min, e é o parâmetro do qual a regra anti-lookahead depende.

### 6.5 NÃO MEDIDO — declarado, com o teste que fecha cada um

`lag_ms` real por endpoint (só n=2 transições, um símbolo, uma janela de 10 min) · latência de rede até `fstream.binance.com` · ambiguidade de `premiumIndex.lastFundingRate` (liquidada ou estimativa corrente) · timezone documentado de `create_time` (UTC está **inferido** do casamento 288/288, e a inferência é forte, mas não é doc) · causa da lacuna de 2026-08-12 (janela ainda dentro dos 30 dias do REST; **expira em 2026-09-11**, e a resposta decide se o backfill primário é REST ou dump) · causa do resíduo de 0,2–0,4% no taker ratio (a hipótese ADL/insurance foi **contradita em sinal**: a série taker tem *menos* volume que o `aggTrade`, não mais) · rate limit real do `data.binance.vision` (medi latência 0,86 s, não teto) · estabilidade das 20 divergências de `POSITION_RISK_CONTROL` entre nós · proximidade do universo inferido do S3 contra `exchangeInfo` histórico real (não existe snapshot para comparar) · estabilidade do `delta()` com OI perto de zero (os 4 símbolos têm OI mínimo de 39M a 3,1B — um `min_notional_floor` é plausível e **não medido**) · estrutura de tier de liquidez (4 símbolos não sustentam a hipótese "limiar por tier": *"limiar global é sem sentido"* está medido, *"limiar por tier resolve"* não).

**Throughput de TimescaleDB vs ClickHouse: nenhum dos dois foi instalado. Não tenho número e não vou inventar um.** O que a medição fecha é o *dataset* do benchmark e a restrição de unicidade que ele tem que rodar ligada. A escolha do motor é ADR separado; o contrato temporal desta fase é portável entre os dois.

### 6.6 OPINIÃO, rotulada

Que `base_contracts` é a coluna "certa" para posicionamento (o que é **medido** é que ela discorda de `notional_usd` em ~30% dos buckets e que a série em quote correlaciona 0,88–0,91 com preço nos alts) · que o "Gerenciador de Presets" é produto prematuro · que "§Módulo D empacota cinco produtos" (julgamento de escopo, sem medição que resolva a discordância).

### 6.7 O que eu declaro que não julgo

Escolha de exchange/corretora como decisão financeira · tamanho de posição e gestão de risco do capital do owner · jurisdição e regulação · se `MATIC→POL` deve ser série contínua para efeito de capital · se pagar assinatura de fornecedor de dados vale o preço. Apresento trade-offs medidos e paro.

### 6.8 Correções à `.claude/skills/quant-trading/SKILL.md` (ação decorrente, com medição)

| linha | texto atual | correção medida |
|---|---|---|
| l.51 | "janelas de 8h (padrão); alguns pares 4h ou 1h" | **4h é a maioria**: 432/570 perpétuos TRADING (75,79%); 415/527 no recorte USDT (78,7%). E **muda no tempo**: 9/50 símbolos mudaram em 13 meses; `1000XECUSDT` fez 8h→1h→4h dentro de um mês |
| l.54 | "Binance expõe TRÊS séries de L/S" | São **QUATRO**. A omitida (`sum_taker_long_short_vol_ratio`) é a única de **fluxo** (autocorr lag-1 ≈ 0 contra 0,99+ nas outras) e é ortogonal às três (\|r\| < 0,10 em 12/12 pares) |
| l.47-48 | "Coinalyze (histórico maior…)" | **Falso para qualquer perpétuo da Binance a partir de 5 min**: dump S3 = 2.183 dias, grade 5 min, cobertura 570/570, contra 5,2–6,9 d (5min) e 62,5–83,3 d (1h) da Coinalyze. Em `1hour` a Binance ganha por **34,9×**. A Coinalyze é exclusiva em **dois** casos: granularidade `1min`, e venues não-Binance. *(Cuidado: "Coinalyze retém menos" sem qualificar troca um erro por outro.)* |
| **novo** | — | `create_time` do dump `metrics` é **início** do bucket para as oito colunas (MAE 0,0019–0,0058 contra `aggTrade` na hipótese INÍCIO vs 0,44–0,61 na hipótese FIM); o arquivo **não vem ordenado** (13/30 dias, desloc. máx 275/288); e `sum_taker_long_short_vol_ratio` lido no próprio `create_time` é **lookahead de r = +0,5458** contra o retorno dos 5 min seguintes |

---

**Arquivos deste recorte:** este documento é destinado a `/home/stharley/Documentos/projects/cripto-strategy/docs/recorte-plataforma.md`. Insumos: `/home/stharley/Documentos/projects/cripto-strategy/docs/proposta-discovery.md`, `/home/stharley/Documentos/projects/cripto-strategy/docs/avaliacao-discovery.md`, `/home/stharley/Documentos/projects/cripto-strategy/.claude/skills/quant-trading/SKILL.md`, `/home/stharley/Documentos/projects/cripto-strategy/harness.toml`. Toda evidência empírica está em `data//` — nada foi escrito nem editado no repositório.

---

## Procedência desta rodada

Rodada de 11 agentes (`quant-architect`), 2026-08-24, sobre o escopo "plataforma e dados
primeiro" declarado pelo owner no mesmo dia:

- **1 reclassificador** — cortou os 89 achados de [avaliacao-discovery.md](avaliacao-discovery.md)
  pela pergunta única "fechar isto é condição para ingerir, armazenar e olhar o dado?":
  **68 plataforma agora · 21 diferidos**.
- **4 definidores** — contrato temporal · screener parametrizado · semântica por símbolo ·
  Coinalyze e sistema de registro.
- **4 validadores adversariais**, um por definição, com ordem de atacar usando o dado real
  baixado (31 dias de `metrics` BTCUSDT, alts, 3 dias completos de `aggTrades`) e um vetor
  de ataque específico deste escopo: *"esta definição fecha uma porta que a fase de
  estratégia ainda vai precisar?"*. As **quatro** voltaram `SOLIDA_COM_CORRECOES` — nenhuma
  passou intacta, e os itens marcados QUEBRADO no §2 são exatamente o que o ataque derrubou.
- **2 de fechamento** — este documento e o insumo da próxima rodada (UX/UI).

Força da evidência, dita separada porque não é uniforme: o contrato temporal, o screener e
a semântica por símbolo foram **medidos sobre dado real**, com o comando junto de cada
número. A definição de Coinalyze é **doc-only**: nenhuma chamada foi feita, ninguém tem API
key, e o protocolo de medição que ela traz existe para ser executado quando a key existir.
