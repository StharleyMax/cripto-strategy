# PRD-001 — Plataforma e dados

**Feature:** `plataforma-dados` · **Data:** 2026-08-25 · **Estado do pipeline ao escrever:** `INIT` → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `sentimento` (predominante, F0–F3) · `charts` (F1, F4) · `web` (F0?, F2, F3, F4 — ver §13.1) · `backtest` (só run registry e dimensão de ambiente, F4) · `docs` (ADRs, F1–F5)
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` está **vazio** ⇒ este PRD **nasce aqui**; não é referência nem extração de fonte externa.
**Insumos (lidos na ordem que a política manda):** [`docs/plataforma-superficies-e-faseamento.md`](../plataforma-superficies-e-faseamento.md) · [`docs/recorte-plataforma.md`](../recorte-plataforma.md) · [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md) · [`docs/avaliacao-discovery.md`](../avaliacao-discovery.md) · [`docs/proposta-discovery.md`](../proposta-discovery.md) · `harness.toml`
**Tracker:** `kind = jira`, projeto `CST`, board 36, `parent_kind = Epic`. **Nada foi criado, editado ou comentado no tracker por este documento** — unidade de valor no tracker é ato posterior à validação do arquiteto.

**Revisão R1 — 2026-08-25.** Este documento passou por **dois** validadores em paralelo: protocolo (`harness-plugin:architect`, `[READY FOR SPEC]`, 0 bloqueantes) e **domínio** (`quant-architect`, apontado pela política via `[agents.by_component]` para `sentimento`), que devolveu **`DOMÍNIO OK COM CORREÇÕES` com 6 itens de gate**. O orquestrador reconciliou: **o gate NÃO passou**, e essa foi a rodada de correção. O mapa completo `defeito → onde foi aplicado` está em **§0.1**; os identificadores estáveis e a colisão de namespace, em **§18**.

**Revisão R2 — 2026-08-25, e é a rodada que QUITA a dívida declarada em §0.2.** R1 fechou dizendo: *"peça uma R2 de PM antes da tech spec se a spec de F0 ou F2 depender de qualquer linha da tabela de §0.2"*. **Depende**, e chegou uma entrada nova do owner. R2 absorve **dois** insumos:

1. **[`docs/medicao-coinalyze.md`](../medicao-coinalyze.md)** — 11 endpoints da Coinalyze chamados com chave real, todos `200`. **Q4 está respondida de fato**, e o `[DOC-ONLY]` que atravessava este PRD está **substituído por medição**, não anotado como dívida.
2. **[`docs/direcionamento-operacional.md`](../direcionamento-operacional.md)** — **intenção declarada do owner em 2026-08-25**, portanto **premissa de projeto e não achado de medição**: não é HFT, prazos operacionais **15m / 1h / 4h**, decisão **no fechamento do bucket**, tese em três camadas (estrutura de preço com pivôs e Fibonacci · sentimento com OI e funding · order flow com CVD), backtest exigindo OHLCV+OI+Funding+CVD **alinhados no tempo**, e **autonomia delegada** ao time em três frentes (bruto vs agregado · motor de banco, com **Parquet/DuckDB** acrescentado · terceiros, com **Coinglass** acrescentado).

**Estado do ledger inalterado ao longo de R1 e R2: `PRD_DRAFT` antes, `PRD_DRAFT` depois** — nenhum `advance`, nenhum `approve`, nada criado, editado ou comentado no Jira. O mapa `mudança → onde foi aplicada` de R2 está em **§0.3**, e ele distingue o que mudou de **FASE** do que mudou de **citação** — porque foi essa distinção que exigiu uma rodada inteira.

---

## 0. Como ler este documento

Três coisas o distinguem de um PRD comum, e as três são consequência do discovery que o antecede:

1. **A unidade de valor é a fase, não a história.** São **seis unidades (F0–F5)**, cada uma com fronteira, critério de aceite conferível e non-goals próprios — porque foi isso que o owner pediu para esta rodada. **Não há histórias neste documento, de propósito**: elas saem do refinamento com o arquiteto. Cada F é candidata a um Epic em CST.
2. **Nenhum número sem procedência.** Todo numeral abaixo carrega de onde veio, e em que força de evidência: `[MEDIDO]` sobre dado real com comando publicado no documento de origem · `[DOC]` documentação pública citada · `[DOC-ONLY]` especificação contra doc de fornecedor **sem nenhuma chamada feita** · `[NÃO MEDIDO]` declarado como não medido, com o teste que fecha. **Onde o discovery não mediu, este PRD diz que não mediu.**
3. **`harness doctor` CONFORME não é citado como evidência de qualidade em lugar nenhum.** O pack `core` são 4 regras bloqueantes em vigor de higiene de Python (§14) e não enxerga `frontend/`.
4. **As revisões R1 e R2 são parte do documento, não errata anexa.** Onde um número mudou, ele mudou **no lugar** e carrega o comando que o produziu. Onde uma regra estava **invertida** — e uma estava, a de `ASOF` (§5.3) — o texto antigo aparece marcado como **derrubado**, porque apagá-lo em silêncio deixaria a próxima pessoa livre para replantar o defeito.
5. **Premissa do owner e achado de medição são rótulos diferentes, e R2 os separa.** `[MEDIDO]`/`[DOC]`/`[DOC-ONLY]`/`[NÃO MEDIDO]` classificam **evidência**. **`[PREMISSA-OWNER: data]`** classifica **intenção declarada** — ela não é falsificável por medição, e uma frase do owner a substitui. Confundir as duas é como o *"spike de OI > 5%"* entrou na proposta: uma escolha vestida de fato.

**✅ A afirmação *"toda a Coinalyze é `[DOC-ONLY]`, zero endpoints chamados, nenhuma API key existe"* estava FALSIFICADA em R1 e está CORRIGIDA EM R2 — ver §0.3.** Onde este PRD diz `[DOC-ONLY]` sobre a Coinalyze, o rótulo foi **substituído pela medição** (`[MEDIDO: medicao-coinalyze §x]`) ou pelo que **continua** não medido naquele ponto específico — porque, e isto importa, **a medição não mediu tudo**: a cauda do `bv`, o limite real de cota, a retenção de `funding-rate-history` e a permanência do `daily` continuam `[NÃO MEDIDO]` (§16).

---

## 0.1 Revisão R1 — mapa dos 18 defeitos corrigidos

**Origem:** validação de domínio (`quant-architect`) + validação de protocolo (`harness-plugin:architect`), 2026-08-25. **Seis eram de gate** (marcados **⛔**) e nenhum deles passava sem correção. **Dois existem porque a regra da casa — nenhum número sem procedência — foi violada por este próprio documento.**

| id | defeito | classe | onde foi corrigido |
|---|---|---|---|
| **D-00** | verificação urgente de *Liquidation Order Streams* **FEITA**: `!forceOrder@arr` existe ⇒ **nenhum** coletor de F0 depende de Q5 | desbloqueio | §4, §6/F0, §8 (Q5), §16 |
| **D-01** ⛔ | **a proibição de `ASOF` estava INVERTIDA**: `>=` é o operador SEGURO e estava proibido | **inversão de regra** | §5.3, §7.3 (anti-padrão 1), §6/F4 (CA-F4-24) |
| **D-02** ⛔ | predicado de quarentena não incluía `available_at`, a coluna de que R-1 depende | lacuna de mecanismo | §5.2, §6/F2 (CA-F2-2, CA-F2-13), §7.1 |
| **D-03** ⛔ | `bar_policy` era tipo **sem mecanismo**: R-1 não excluía o bucket em formação | lookahead residual | §5.1 (R-2), §5.5, §6/F1 (CA-F1-7), §6/F4 (CA-F4-19) |
| **D-04** ⛔ | `available_at` MODELED sem estatística declarada nem direção de arredondamento | carimbo otimista | §5.1 |
| **D-05** | F0 não capturava `available_at` OBSERVED de `/futures/data/*` — e no universo inteiro é **aritmeticamente impossível** | entregável faltando | §4, §6/F0 (entrega 8, CA-F0-9), §8 (Q1) |
| **D-06** ⛔ | `run_registry` sem `knowledge_time` **não reproduz** uma corrida num store bitemporal | irreprodutibilidade | §5.1, §6/F4 (CA-F4-25) |
| **D-07** | **CL-4 novo**: `bookTicker` saiu do dump em 2024-03 ⇒ **spread é capture-or-lose desde hoje** | fato capture-or-lose | §4 (CL-4), §8 (Q9, **Q17**), §17 (R9) |
| **D-08** ⛔ | `universe_source = s3_inferred` era admissível no caminho de decisão — survivorship pela porta de trás | survivorship | §5.5, §6/F0 (CA-F0-1), §6/F3 |
| **D-09** | a correção de survivorship na **borda de ingestão** desapareceu entre rodadas | regra perdida | §6/F3 (CA-F3-14) |
| **D-10** | PK de funding sem `source` (perdeu o eixo "de onde") | migração futura | §5.6, §6/F2 |
| **D-11** | G3 é maior e **mais barato de fechar**; `implied_avg_price` **é** o mark close | nome que ensina errado | §5.3, §5.5, §6/F2, §10 (G3) |
| **D-12** | custo da porta 1 superestimado por **540–2.412×** | número errado | §7.4, §8 (Q9) |
| **D-13** | não existe fato datado de taxa maker/taker | tabela faltando | §5.6, §6/F2 (CA-F2-14) |
| **D-14** | `min_obs` não atendido virava `expanding` em silêncio | vetor de overfit | §5.5, §6/F4 (CA-F4-26) |
| **D-15a–f** | **seis defeitos de citação numérica** deste PRD | procedência | §5.6, §6/F2, §6/F4, §11, §16 |
| **D-16** | `[INFERRED]` de Q6: *"custo de reversão: um filtro"* era **falso na perna de captura** | inferência mal custeada | §9, §8 (Q6) |
| **D-17** | Q14 tinha consequência de domínio não nomeada: **separador decimal em caminho de dado** | fixture não byte-estável | §9, §7.4 |
| **D-18** | `premiumIndex` é **segunda testemunha do universo**, grátis, e discorda hoje; `fundingInfo` traz 20 COIN-M | universo | §5.5, §5.6, §6/F0 |

**Correções vindas do validador de protocolo** (premissa de Q2, gate de F0 por coletor, G2 como pré-requisito de F0, G6 → `CA-F0-8`, `CA-F5-4` falsificável, colisão de `core.print-statement`, RTT/região, rastreabilidade): §6/F0, §6/F5, §8, §13, §14, §18.

**O que NÃO mudou, e é resultado, não omissão:** a **estrutura F0–F5** e as fronteiras de valor entre as fases sobreviveram inteiras — nenhuma fase nasceu, morreu ou trocou de lugar. Duas fronteiras **internas** se moveram (a parte gateante de F5 passa a preceder **F0**, não F1; `clock_skew` sai de F3 e nasce em F0), e F0 ganhou **duas entregas** sem mudar de propósito. **As seis unidades continuam candidatas a seis Epics em CST.**

---

## 0.2 A dívida declarada em R1 — **QUITADA em R2**

**R1 fechou com uma dívida nomeada, e não com uma correção.** `docs/medicao-coinalyze.md` apareceu em disco **depois** de R1 ser instruída e validada, e absorver uma quarta rodada de discovery que **nenhum dos dois validadores viu** produziria um PRD que ninguém validou. R1 registrou item por item o que estava falsificado e disse: *"peça uma R2 de PM antes da tech spec se a spec de F0 ou F2 depender de qualquer linha da tabela abaixo"*.

**Ela dependia. R2 é a quitação, e a tabela abaixo fica como registro do que foi corrigido — cada linha agora aponta ONDE a correção foi aplicada** (§0.3 traz o mapa completo, inclusive do segundo insumo, que R1 não conhecia). **Nada nesta tabela é dívida aberta.**

| onde neste PRD | o que está escrito | o que `medicao-coinalyze.md` mediu |
|---|---|---|
| **§0, §3, §16, §5.2, F2, Q4** | *"toda a Coinalyze é `[DOC-ONLY]`, zero endpoints chamados, não há API key"* | **11 chamadas, todas `200`, chave em `.env`.** **Q4 está, de fato, respondida** — e este PRD ainda a lista como pendente |
| **CL-1 (§4)** | liquidação é capture-or-lose **absoluto**: *"inexistente por fonte nenhuma, e nem pagando volta"* | **o AGREGADO DIÁRIO é recuperável 2 anos** (`/liquidation-history?interval=daily` → **730 dias**, 2024-08-26 →). **O que continua capture-or-lose é a liquidação INTRADAY** — o evento individual, o ms, a cascata de segundos, que é onde o gatilho da proposta vive. **`CL-1` muda de forma, NÃO de urgência**, e o coletor continua tendo de ligar hoje |
| **CL-2 (§4), `CA-F3-10`** | retenção *"~24 h a 1 min"*, rotulada `[DOC-ONLY]` | **o mecanismo não é tempo, é CONTAGEM DE PONTOS** ⇒ **série esparsa retém mais tempo de relógio**: OI a 1 min = 2.206 pontos = **~1,5 dia**; a 5 min = ~2.000 pontos = **7 dias**; liquidação a 1 min = 3.052 pontos = **~8 dias**. *"24 h de retenção a 1 min"* está **errado nas duas direções, dependendo da série** |
| **§1 (*"nenhuma fonte gratuita tem histórico intraday profundo de OI"*, já corrigida em R1)** | corrigida citando o dump S3 (2.183 dias) | **e a Coinalyze `daily` é mais profunda ainda: 2.409 dias de OI diário (6,6 anos).** Em intraday ela é rasa; **em `daily` é a fonte mais profunda que este projeto conhece** |
| **§5.5 `cvd_source`** | 4 valores, sem a Coinalyze | **`bv` É volume de compra agressora, provado contra o dump canônico**: erro mediano **0,0000 bp** contra a hipótese agressora vs **2.584,87 bp** contra a hipótese maker; 150/699 buckets **exatamente iguais**; `2·bv − v` bate o delta do dump a **2,6e-14 BTC** de mediana. **Mas a cauda não é zero** (p99 **29,34 bp**, máx **1.955,80 bp**, causa **não diagnosticada**) ⇒ é `cvd_source` legítima **com erro publicado por fonte**, **não substituto cego do `aggTrade`** |
| **anti-padrão 22 (§7.3)** | *"a Coinalyze não agrega"* | **CONFIRMADO e reforçado**: `/exchanges` = 28, `/future-markets` = 5.127, **todo mercado carrega `exchange` obrigatório**. Nada a corrigir — este era o item em que a rodada original acertou |
| **`CA-F3-9`, `avaliacao:A3`** | broker de cota com `Retry-After` | **a resposta `200` NÃO traz nenhum header de cota** — nem consumido, nem restante, nem janela ⇒ **o broker da Coinalyze é CEGO e tem de contar localmente e ser conservador**. Oposto da Binance (`X-MBX-USED-WEIGHT-*` em toda resposta) |
| **§5.2 `ts_convention`** | duas convenções previstas | **o OI da Coinalyze vem como OHLC do bucket (`{t,o,h,l,c}`), não como ponto na borda direita** ⇒ **duas semânticas diferentes para o mesmo nome**, e comparar *"o OI da Coinalyze"* com `sumOpenInterest` **sem escolher qual dos quatro campos compara coisas diferentes** |
| **P3 (§1), Q12** | `MATICUSDT` renomeado, sem continuidade na API | **terceira testemunha independente: `MATICUSDT` NÃO está na Coinalyze** (e `ICXUSDT`, que sai em 2026-08-26, **está**). **Ela não é rota de fuga para o survivorship** |

**A consequência de escopo que R1 previu, confirmada em R2:** dois desses itens **não eram citação, eram fase**. `CL-1` mudou de forma (**§4**), e `bv` como `cvd_source` medida mexeu em **F2 e na quarentena** (§5.5, §6/F2). **E R2 encontrou um terceiro que R1 não tinha nomeado: o OI como OHLC do bucket é mudança de TIPO** — `SeriesKey` não tem termo que distinga *qual dos quatro campos* é a série, e acrescentar termo a uma chave depois é migração de identidade (§5.2).

**O que R1 acertou e R2 confirma sem ressalva:** **nada disso reduz a urgência de F0.** O que é capture-or-lose continua sendo, a liquidação intraday continua não voltando, e o argumento — que era o defeito — está corrigido no lugar.

---

## 0.3 Revisão R2 — o mapa, separando **fase** de **citação**

**Duas colunas de origem, e elas têm rótulos diferentes de propósito:** `[MEDIDO]` para a Coinalyze (11 chamadas, comandos publicados em `medicao-coinalyze.md`) e **`[PREMISSA-OWNER: 2026-08-25]`** para o direcionamento operacional (intenção declarada, não falsificável por medição).

### 0.3.1 O que mudou de FASE — as sete que exigiram esta rodada

| id | mudança | origem | fase afetada | onde foi aplicado |
|---|---|---|---|---|
| **E-01** | **`CL-1` muda de forma:** o **agregado diário** de liquidação é recuperável **730 dias**; o que é capture-or-lose é a **liquidação intraday** (evento, ms, cascata de segundos — onde o gatilho da proposta vive). **A urgência de F0 não cai; o argumento muda** | `[MEDIDO]` | **F0** (justificativa) | §4/CL-1, §6/F0, §17/R10 |
| **E-02** | **F0 ganha um one-shot da Coinalyze `daily`** (OI **2.409 d**, liquidação **730 d**) e a **reconciliação diária** do stream capturado contra o agregado dela — que é a **primeira série de referência independente** para a incerteza `latest\|largest`. **F0 deixa de ter "não chama Coinalyze" como non-goal** | `[MEDIDO]` | **F0** (entrega nova) | §4/CL-1, §6/F0 (entrega 9, `CA-F0-13`, `CA-F0-14`), §12 |
| **E-03** | **`bv` é volume de compra agressora, provado** ⇒ `cvd_source` ganha um quinto valor **com erro publicado**. **E a quarentena NÃO se abre por isso**: dois dos três termos do predicado se resolvem, o terceiro (`available_at IS NULL`) **não** — a Coinalyze continua fisicamente isolada até haver medição de defasagem dela | `[MEDIDO]` | **F2** + quarentena | §5.2, §5.5, §6/F2 (`CA-F2-16`) |
| **E-04** | **OI da Coinalyze é OHLC do bucket, não ponto** ⇒ **mudança de TIPO**: `ts_convention` ganha `OHLC_OVER_BUCKET` e **`SeriesKey` ganha `reduction`**. Sem o termo na chave, duas séries diferentes têm a mesma identidade | `[MEDIDO]` | **F1/F2** (tipo) | §5.2, §6/F2 (`CA-F2-17`) |
| **E-05** | **`bar_policy = final_only` deixa de ser inferência do arquiteto e passa a ser premissa do owner.** R-2 fica sustentada por **declaração**, não por dedução | `[PREMISSA-OWNER]` | **F1** (força do argumento) | §5.1/R-2, §5.5, §6/F1 (`CA-F1-7`), §6/F4 (`CA-F4-19`) |
| **E-06** | **`bookTicker` sai do escopo desta fase e `Q17` é respondida** — mas **CL-4 não morre**: R2 mediu uma **terceira opção**, `/fapi/v1/depth?limit=5`, que é **~110× mais barata** que (a) e produz spread **medido** em vez de assumido, **e continua capture-or-lose** | `[PREMISSA-OWNER]` + **`[MEDIDO em R2]`** | **F0** (coletor contingente) | §4/CL-4, §8/Q17, §6/F0 (`CA-F0-12`), §17/R9 |
| **E-07** | **`aggTrade` cru deixa de ser requisito de CAPTURA desta fase — e a razão publicada estava errada.** Quem dispensa a captura é **o dump ser re-baixável desde 2019-12-31**, não o 98,44%. O 98,44% dispensa **computar** sobre tick; são dois argumentos para duas decisões, e conflacioná-los é defeito | `[PREMISSA-OWNER]` + `[MEDIDO]` | **F0/F3** (fila) + **Q9** | §7.4/D-12, §8/Q9, §0.3.3 |

### 0.3.2 O que mudou de CITAÇÃO — corrigido no lugar, com o comando

| # | o que estava escrito | o que é | onde |
|---|---|---|---|
| C-1 | `bookTicker` ao vivo = **1,76 TB/ano** para 20 símbolos | **340–420 GB/ano** — a estimativa antiga multiplicou o símbolo mais pesado por 20; medido por `HEAD` em 8 símbolos (2024-03-25) dá **260 GB/ano para os 8 maiores**. Errado por **4,8×**, e a favor do que este PRD estava recusando | §4/CL-4, §8/Q9, §8/Q17, §17/R9 |
| C-2 | retenção da Coinalyze *"1 min ≈ 24 h, 5 min ≈ 5,2 d"* | **o teto é de PONTOS, não de tempo** ⇒ OI a 1 min **~1,5 d**, a 5 min **~7,0 d**; e **série esparsa retém mais relógio** (liquidação a 1 min: **~8 d** com 3.052 pontos) | §4/CL-2, §6/F3 (`CA-F3-10`), §16 |
| C-3 | *"o valor da Coinalyze encolheu"* / *"histórico raso"* | **inverte por granularidade**: rasa em intraday, e em `daily` **a fonte mais profunda que este projeto conhece** (OI diário **2.409 d**, até 2020-01-21, contra 2.183 do dump S3 e 30 do REST) | §1, §4/CL-2, §6/F3 |
| C-4 | *"agregado multi-exchange"* da Coinalyze | **não existe**: 28 exchanges, 5.127 mercados, `exchange` obrigatório em cada. Sobra **N chamadas e uma agregação nossa** — muda o **orçamento de cota**, não a viabilidade. O anti-padrão 22 já estava certo | §7.3 (ap. 22), §6/F3 (`CA-F3-9`) |
| C-5 | broker de cota da Coinalyze *"com `Retry-After`"* | a resposta **`200` não traz nenhum header de cota** ⇒ **broker cego, conta localmente, é conservador**. **E R2 corrige a comparação de `medicao-coinalyze` §3.1:** o contraste com a Binance vale para `/fapi/v1/*`, **não** para `/futures/data/*`, que **também não traz `x-mbx-*`** — medido em R2. **Dois dos três canais são cegos**, e o cego que importa é o do screener | §6/F3 (`CA-F3-9`), §14, §18.2 |
| C-6 | *"nenhuma fonte gratuita tem histórico intraday profundo de OI"* (já derrubada em R1) | e mais: **`MATICUSDT` não está na Coinalyze** ⇒ terceira testemunha independente de que **ela não é rota de fuga para survivorship** | §1/P3, §8/Q12 |
| C-7 | `unit`/`denom` obrigatórios tratados como zelo | **requisito confirmado pelo catálogo do fornecedor**: `oi_lq_vol_denominated_in` varia — **744 `BASE_ASSET`, 20 `QUOTE_ASSET`** nos 764 perpétuos da Binance, que declaram `has_buy_sell_data` e `has_long_short_ratio_data` = `true` | §5.2, §6/F2 |
| C-8 | *"80% das barras de 1 min sem ponto de OI"* como problema central de tela | **artefato de escolher 1 min.** Pontos de OI por barra: 1m **0,2** · 5m **1,0** · 15m **3,0** · 1h **12,0** · 4h **48,0**. Nos prazos declarados **deixa de ser decisão central e volta a ser tratamento de exceção** — com a ressalva de precisão de §0.3.3/item 3 | §6/F4 (`CA-F4-4`), §7.2 |

### 0.3.3 As cinco correções em que este PM **discorda** do que lhe foi passado, com o argumento

**Aplicar por obediência o que se acha errado é exatamente como a inversão de `ASOF` entrou neste PRD** (§5.3). As cinco estão aplicadas no texto na forma que eu defendo, não na forma em que me chegaram.

1. **`CL-4` NÃO morre — encolhe ~110× e continua capture-or-lose. Existe uma opção (c), e eu a medi.** Me foi passado que *"`bookDepth` continua publicado e é re-baixável, logo nada se perde esperando"*. **A primeira metade é verdadeira e a conclusão não segue**, por dois motivos. **(i)** `bookDepth` **não tem bid/ask** (colunas `timestamp,percentage,depth,notional`) ⇒ ele serve **slippage por profundidade**, e **não** serve spread. Escolher (b) portanto não entrega spread medido — entrega spread **assumido**. **(ii) Medido em R2, e é a novidade:** `GET /fapi/v1/depth?symbol=BTCUSDT&limit=5` → **HTTP 200, 295 B, peso 2** (`x-mbx-used-weight-1m: 2`, observado subir de 0 para 2). ⇒ um snapshot de topo de livro a **1/min para 20 símbolos custa 40 de peso/min contra `REQUEST_WEIGHT 2400/min` = 1,67% do balde**, e **8,5 MB/dia de JSON bruto** (`295 × 20 × 1440`) ⇒ **~3,1 GB/ano antes de comprimir**, contra **340–420 GB/ano** de (a): **~110× mais barato**. **E não compete com o backfill de OI** — medido em R2: `/futures/data/openInterestHist` devolve **zero headers `x-mbx-*`**, `/fapi/v1/depth` devolve `x-mbx-used-weight-1m` ⇒ **baldes distintos, confirmado por observação**. **Ressalva que faço eu mesmo, e ela é real:** 1/min é **amostra**, não tick — a distribuição intra-minuto fica invisível, e o spread alarga exatamente no instante do movimento, que é quando o fill acontece. **(c) não é (a).** Mas é spread **medido com `n` e percentil publicados** em vez de constante, custa 1,67% de um balde com folga, **e a amostra no fechamento do bucket é o instante que o owner declarou como o de decisão**. **E o dia de hoje só existe se for capturado hoje** — logo CL-4 continua na tabela de §4, com o custo corrigido. ⇒ **Q17 tem três opções, não duas**, e (c) é a que eu recomendaria se me pedissem opinião — mas a escolha continua sendo do owner e **este PRD não escolhe**.
2. **`aggTrade` cru: concordo com a conclusão e discordo do argumento, e o argumento é o que fica no documento.** Me foi passado que o 98,44% de desempate SL-vs-TP por 1m dispensa o tick. **Ele dispensa COMPUTAR sobre tick; o que dispensa CAPTURAR tick é outra coisa: o dump `aggTrades` existe desde 2019-12-31 e é re-baixável** (§8/Q9 já dizia isso, e o argumento novo o atropelava). **A distinção não é retórica** — se o dump **não** fosse re-baixável, 98,44% **não bastaria**, porque **absorção está na tese do owner**: o direcionamento nomeia *"agressão e absorção via CVD"* e a `proposta-discovery` §Módulo C nomeia *"Divergência / Absorção de Volume (CVD)"*. **Absorção por bucket** (CVD sobe e preço não) se lê de kline; **absorção por tamanho de trade** exige tick. **A tese do owner nomeia a camada e não desambigua qual das duas** ⇒ escrever *"`aggTrade` deixa de ser requisito"* sem essa ressalva entrega à fase de estratégia uma camada que o owner pediu e um insumo que ela não tem. **Forma correta, e é a que fica: `aggTrade` cru sai do requisito de CAPTURA (porque é re-baixável) e permanece porta aberta com gatilho NOMEADO — e o gatilho é Q20.**
3. **"Nos prazos declarados toda barra tem OI" é falso a 5m, e a precisão importa porque 5m é a cadência de avaliação declarada.** `5m → 1,0 ponto por barra` é **média**, não garantia: com **3 buckets ausentes em 8.640 medidos**, algumas barras de 5m têm **zero**. A 15m (3,0/barra) um bucket nativo ausente deixa 2 — degrada para **cobertura parcial**, que é outra coisa que ausência. ⇒ **a política de renderização de ausência continua requisito de primeira classe a 5m** e vira tratamento de exceção **a partir de 15m**. O carimbo de idade continua obrigatório em **todos** os prazos, por razão independente do timeframe: a defasagem de publicação do OI (**99,6–200,8 s**).
4. **A retenção por contagem de pontos tem duas consequências operacionais que não estavam ditas, e uma delas é adversa.** **(i) Favorável:** a **janela de reparo** de um coletor parado é `pontos × intervalo`, logo **escolher a série de 5 min como trilho de resiliência multiplica o orçamento do SLO P1 por ~4,7** (~7,0 d contra ~1,5 d). Isso muda `CA-F3-10` de constante para **fórmula por série**. **(ii) Adversa, e é a que ninguém disse:** série **esparsa** retém mais relógio **porque só existe bucket onde houve evento** ⇒ **a janela de retenção da liquidação ENCOLHE exatamente durante uma cascata**, que é o único regime em que essa série importa. **Retenção e necessidade são anticorrelacionadas nessa série** — e isso é risco, não curiosidade (§17/R12).
5. **`medicao-coinalyze` §3.1 exagera o contraste com a Binance, e o exagero aponta para o lugar errado.** O texto diz que a ausência de header de cota é *"o oposto do que a Binance oferece (`X-MBX-USED-WEIGHT-*` em toda resposta)"*. **Medido em R2: `/futures/data/openInterestHist` devolve `200` com zero headers `x-mbx-*`** — só CloudFront e segurança. ⇒ **o balde onde o screener vive é tão cego quanto o da Coinalyze**, e isso é `avaliacao:A3`, reproduzido. **A conclusão de desenho fica mais forte, não mais fraca:** contagem local conservadora **não é adaptação a um fornecedor pior — é o caso geral**, e a rampa até o primeiro 429 (`CA-F0-4`) é a única forma de conhecer **dois** dos três baldes. *(Nota colateral do mesmo `curl`: a resposta veio com `x-amz-cf-pop: GRU1` — borda de São Paulo. O caminho de rede do observador é **visível na resposta**, o que é evidência direta a favor de `[GAP G7]`.)*

---

## 1. Contexto e problema

Não existe hoje uma camada de dados sobre a qual seja possível **afirmar que um número de mercado significa o que se pensa que significa**. Três medições sobre dado real dimensionam o problema (`recorte` §5):

| # | fato | força |
|---|---|---|
| P1 | O mesmo valor de OI aparece rotulado com **dois timestamps diferentes** em duas superfícies da mesma corretora. Errar o rótulo por **um** bucket **inverte o sinal do ΔOI de 15 min em 21,96% das janelas** (n=8.629); por dois buckets, **33,52%** (n=8.627) | `[MEDIDO]` |
| P2 | Uma coluna do dump canônico da Binance carrega, no rótulo `T`, o fluxo agressor de `[T, T+5min)`: `ln(sum_taker_long_short_vol_ratio)` × retorno log dá **r = +0,5458** com o bucket **futuro**, +0,0612 com o passado e −0,0060 com futuro+1 (n=864/862/862). Assinatura canônica de lookahead, dentro da fonte eleita como histórico profundo | `[MEDIDO]` |
| P3 | **21,6% do universo cripto-perpétuo com histórico não existe mais** no `exchangeInfo` de hoje (727 → 570 like-for-like), e são justamente os que morreram. `MATICUSDT` e `RNDRUSDT` **não foram deslistados, foram renomeados**, e a API não expõe a continuidade | `[MEDIDO]` |

**O agravante que reordena o cronograma — e a correção R1 que o delimita.** A frase original deste PRD dizia *"nenhuma fonte gratuita tem histórico intraday profundo de OI"*. **Ela é falsificada pela medição do próprio projeto** e está derrubada: o dump `data.binance.vision/futures/um/daily/metrics/` tem **2.183 zips por símbolo desde 2020-09-01, grade de 5 min, 570/570 símbolos cobertos** `[MEDIDO]` (`avaliacao` §Conferido-contra-doc, linha `data.binance.vision`). O que é raso é o **REST** (30 dias `[MEDIDO]`) e a **Coinalyze em INTRADAY** — e **R2 corrige as duas metades desta frase** (§0.3.2/C-2, C-3): a retenção não é janela de tempo, é **contagem de pontos** (OI a 1 min alcança **~1,5 dia**, a 5 min **~7,0 dias** `[MEDIDO]`), e **em `daily` a Coinalyze é a fonte MAIS PROFUNDA que este projeto conhece**: **2.409 dias** de OI diário, até **2020-01-21**, contra 2.183 do dump S3 e 30 do REST `[MEDIDO]`. **A afirmação "a Coinalyze é rasa" é verdadeira em intraday e falsa em `daily`**, e escrevê-la sem o qualificador de granularidade é o mesmo defeito de rótulo que P1 e P2 descrevem.

**O que sobrevive, e é o que sustenta F0:** o relógio de perda irreversível **não** é o OI histórico — é o conjunto **CL-1..CL-4** de §4 (liquidação, série efêmera da Coinalyze, `exchangeInfo` datado, **spread**) mais **`available_at` OBSERVED** e o **átomo de `interestRate` por símbolo**. Para esses, **cada dia não gravado é um dia perdido para sempre**. Para o OI do dump, **não**: ele é re-baixável, e por isso **F0 não pode chamar o backfill de `metrics` de capture-or-lose** (consequência aplicada em CA-F0-5).

Persistência própria continua sendo o primeiro entregável, e não porque o OI histórico não exista — **porque a irreprodutibilidade e o `available_at` não se recuperam depois**.

**Por que isso não é preciosismo:** este produto, na fase seguinte, dispara ordens com capital do owner. Uma estratégia construída sobre um número que ninguém consegue defender nasce indefensável.

---

## 2. Objetivo

Entregar a **camada de dados e a superfície de olhar** dessa camada: ingerir, declarar a semântica, armazenar de forma reprodutível, e permitir que o owner **olhe uma série contra o preço e afirme o que ela significa** — gravando essa afirmação.

**"Pronto" nesta fase é uma propriedade verificável, não uma sensação:** para todo numeral de mercado que a plataforma exibir ou entregar a um consumidor, é possível responder, **sem hover e sem abrir código**: qual série é, de que fonte, com que unidade e denominador, rotulada em que convenção temporal, quando o fato aconteceu, quando um consumidor ao vivo poderia sabê-lo, se é observado ou derivado, e o que falta na janela.

**Métrica de sucesso desta fase** (derivada dos entregáveis; **não** é medição de uso, que não existe): as condições de pronto de F0–F5 (§6) são todas conferíveis por comando; a fase é bem-sucedida quando **todas** passam **e** o corpus de fixtures desta rodada roda como regressão. Contagem que serve de índice: **§16 lista 54 medições** que devem virar teste — **34** na rodada original, **+6** acrescentadas ou reclassificadas em R1, **+9** da medição da Coinalyze, **+3** medidas por este PM em R2 (peso e tamanho de `/fapi/v1/depth`; ausência de headers `x-mbx-*` em `/futures/data/*`; `Content-Length` dos zips do dump que fecham a aritmética de disco de §7.4) e **+2** do direcionamento operacional que ainda não estavam na lista (o **98,44%** de desempate SL-vs-TP por 1m e a aritmética de **pontos de OI por barra**). **As outras quatro linhas de `direcionamento-operacional.md` §4 já estavam contadas** — não são medição nova, e uma delas (**340–420 GB/ano**) **corrige** um número que R1 publicava errado por 4,8×. A razão `testes existentes / medições publicadas` é a métrica de progresso honesta. Hoje ela é **0/54** — e o runner não existe (`[GAP G2]`, §10, **que R1 move para pré-requisito de F0**, não de F1).

---

## 3. Fronteira de escopo — declarada pelo owner

> "N é proposta sair com as regras das estratégias aqui, precisamos da plataforma e os dados, daí em seguida evoluímos com estratégias e convergência com análise de sentimento com a api da coinalyze + volume" — owner, 2026-08-24

**Fronteira dura.** Ela **reordena, não reduz**: dos achados sobreviventes da avaliação (**contagem publicada 89 por classe de verificação, 87 por veredito, 68 com rótulo estável — ver §18.3**), **68 são plataforma agora** e **21 são diferidos**, e diferido **não é descartado** — cada um dos 21 carrega uma porta que a plataforma **não pode fechar** (`recorte` §4, reproduzida em §7.4 e §12 deste PRD).

### Escopo de ENTRADA

Ingestão · semântica declarada · contrato temporal · armazenamento · universo point-in-time · reprodutibilidade · a superfície que permite olhar o dado.

**Fontes:** dumps `data.binance.vision` (`metrics`, `aggTrades`, `monthly/fundingRate`, `klines`) · REST Binance USDⓈ-M (`/fapi/v1/*`, `/futures/data/*`) · WebSocket Binance · **Coinalyze como capacidade da camada de dados** (schema que a acomoda sem migração, adaptador, broker de cota, quarentena até o teste de rótulo passar) — requisito de hoje por declaração do owner, **mesmo sem estratégia e mesmo sem key**.

### Escopo de SAÍDA (diferido, não descartado)

Limiar numérico de sinal · matriz de convergência · regra de entrada/SL/TP · métrica de performance · detectores SMC (swing, OB, FVG, BSL/SSL, BOS/CHoCH) · corpus de fixtures marcadas à mão · critério de match · protocolo de walk-forward · paper trading · execução ao vivo.

**A consequência prática que decide quase tudo:** onde a proposta original pediria *"escolha o limiar"*, esta fase entrega **a distribuição medida** e transforma o limiar em **parâmetro nomeado**. O caso literal: o *"spike de OI > 5% em 15m"* da proposta dispara **0 vezes em 8.631 janelas** de BTCUSDT (p99 = 0,7495%, máx **2,4017%**) e **27 vezes em 2.013 janelas** de COTIUSDT no campo notional `[MEDIDO]`. **Limiar absoluto é um filtro "não-BTC" disfarçado de sinal**, e o número sai do código.

---

## 4. Os fatos capture-or-lose — e por que existe uma fase F0

Eram três. **R1 acrescenta um quarto, medido, e ele é o mais caro dos quatro se a resposta do owner for "medir".** Estes não são nota de rodapé: **são a razão de F0 existir e de ela vir antes do contrato temporal**, invertendo a ordem técnica.

| # | fato | consequência se esperar | força |
|---|---|---|---|
| **CL-1** *(reformulado em R2 — muda de FORMA, não de urgência)* | **A liquidação INTRADAY da Binance é stream-only.** Não existe `liquidation*` em `data.binance.vision` (o diretório tem `aggTrades, bookDepth, bookTicker, indexPriceKlines, klines, markPriceKlines, metrics, premiumIndexKlines, trades`). Subamostrada por doc: *"For each symbol, only the latest one liquidation order within 1000ms will be pushed"*. O arquivo de captura local tem **0 bytes** hoje. **R2 acrescenta o outro lado, medido:** `/liquidation-history?interval=daily` da Coinalyze devolve **730 dias** (2024-08-26 →, campos `{t,l,s}`) | **A frase antiga — *"inexistente por fonte nenhuma, e nem pagando volta"* — está DERRUBADA na parte do agregado e SOBREVIVE inteira na parte que importa.** Precisamente: **capture-or-lose é a liquidação intraday** — o evento individual, o timestamp em ms, **a cascata de segundos, que é onde o gatilho "picos de liquidação" da proposta vive**; o **agregado diário por símbolo é recuperável 2 anos**. ⇒ **o coletor continua tendo de ligar hoje, e o que se ganha é uma LINHA DE BASE histórica que não existia e uma série de referência independente** (`CA-F0-14`). **Corolário permanente, inalterado: qualquer soma sobre esse stream é limite inferior, e a tela escreve isso ao lado do número** — e **agora esse limite inferior é QUANTIFICÁVEL**, comparando a soma diária capturada contra o agregado da Coinalyze | `[MEDIDO]` (ausência no dump, 0 bytes local, 730 dias na Coinalyze) + `[DOC]` (subamostragem) |
| **CL-2** *(medido em R2 — o mecanismo é outro)* | **Coinalyze apaga por CONTAGEM DE PONTOS, não por janela de tempo.** Medido: OI a **1 min = 2.206 pontos = ~1,5 dia**; a **5 min = ~2.000 pontos = ~7,0 dias**; OHLCV 1 min = 1.440 pontos = 1,0 dia; **liquidação a 1 min = 3.052 pontos = ~8 dias, porque a série é ESPARSA** (só existe bucket onde houve liquidação). A mesma query emitida em dois momentos **começa em pontos diferentes**. **`daily` NÃO é apagado por doc — e essa permanência é `[DOC-ONLY]`, medida uma vez e não confirmada** | ~1 dia de série de 1 min perdido por dia sem coletor, **e ~1,5 dia de folga total, não 24 h** — menos do que se supunha. **Irreprodutibilidade não é degradação, é ausência de sistema de registro** — daí a decisão de que a Coinalyze é FONTE e o armazenamento local é o sistema de registro desde o dia 1. **Duas consequências operacionais em R2** (§0.3.3/item 4): **(i)** a janela de reparo de um coletor parado é `pontos × intervalo` ⇒ trilhar a série de **5 min** multiplica o orçamento do SLO P1 por **~4,7**; **(ii) a retenção da série ESPARSA de liquidação encolhe exatamente durante uma cascata**, que é o único regime em que ela importa — **retenção e necessidade são anticorrelacionadas** (§17/R12) | `[MEDIDO]` — **e o rótulo antigo (`[DOC-ONLY]`, "pode ser teto de resposta") caiu: era teto de PONTOS, e o efeito é o descrito** |
| **CL-3** | **`exchangeInfo` datado tem zero dias capturados.** Custo de gravar: **1,18 MB/dia bruto, 54 KB gzip**. E `deliveryDate` já mostra `ICXUSDT`, `STORJUSDT`, `SCRTUSDT` **TRADING hoje com delisting em 2026-08-26** | `universe_at(ts)` fica preso em `s3_inferred` (sem `snapshot`); e `tick_size` / `price_precision` / `funding_interval` **com data de vigência** — base de **toda tolerância SMC futura, que é expressa em ticks** — não existem para nenhuma data passada. **25 `tickSize` distintos e `pricePrecision` de 1 a 8** nos 570 perpétuos: não é constante que se recupere depois | `[MEDIDO]` |

| **CL-4** *(novo em R1)* | **`bookTicker` saiu do dump em 2024-03 ⇒ spread — e portanto slippage — é capture-or-lose desde hoje.** Medido: `daily/bookTicker/BTCUSDT/` → **HTTP 200 em 2024-03-25, 404 em 2024-03-31** e em toda data posterior; `monthly/bookTicker/` → **200 em 2024-04, 404 em 2024-06** e depois. `bookDepth` **continua publicado** (200 em 2026-08-23, 561 KB, 34.560 linhas/dia, colunas `timestamp,percentage,depth,notional` — **não tem bid/ask**) | **Um backtest sem slippage é fantasia**, e o insumo de spread **para o período que este produto vai cobrir não existe em fonte nenhuma a partir de hoje.** O dump não devolve, o REST não tem histórico de topo de livro, e a Coinalyze não publica bid/ask | `[MEDIDO]` (probe HTTP nas duas datas de cada prefixo, `bookDepth` com colunas lidas do zip) |

**A escolha de CL-4 é do owner e não é técnica** — é decisão sobre disco e sobre honestidade do backtest. **R2 corrige o custo de (a) por 4,8× e acrescenta uma opção (c) medida. São TRÊS, não duas:**

- **(a) capturar `<symbol>@bookTicker` ao vivo desde o dia 1: `[NÚMERO CORRIGIDO EM R2]`.** O **1,76 TB/ano** que este PRD publicava em R1 **está DERRUBADO** — ele multiplicou o símbolo mais pesado por 20. Medido por `HEAD` em **8 símbolos na mesma data (2024-03-25)**, zipado: **0,713 GB/dia para os 8 maiores ⇒ 260 GB/ano**, e extrapolando a cauda **medida** em vez de assumida, **340–420 GB/ano para 20 símbolos** `[MEDIDO]`. **Ressalva de procedência que vai junto: são volumes de 2024-03**, a última data em que o dump existiu — é **proxy medido, não custo de hoje**, e captura ao vivo tem overhead próprio.
- **(b) modelar slippage de `bookDepth`** (grade de 1 min, níveis percentuais, `561 KB/dia/símbolo`) **mais premissa declarada de spread**, carimbada em **todo** resultado de backtest e **nunca dissolvida no número**. **Precisão que R2 obriga:** `bookDepth` **não tem bid/ask** ⇒ ele entrega **profundidade para slippage** e **não entrega spread**. Escolher (b) é escolher spread **assumido**, não spread medido a partir de `bookDepth`.
- **(c) *NOVA em R2, e é a opção que faltava:* amostrar topo de livro por REST a 1/min.** Medido nesta rodada: `GET /fapi/v1/depth?symbol=BTCUSDT&limit=5` → **HTTP 200, 295 B de corpo, peso 2** (`x-mbx-used-weight-1m` observado subir de 0 para 2). ⇒ **20 símbolos a 1/min = 40 de peso/min contra `REQUEST_WEIGHT 2400/min` = 1,67% do balde**, e **8,5 MB/dia de JSON bruto** (`295 B × 20 × 1440`) ⇒ **~3,1 GB/ano antes de comprimir**, contra 340–420 GB/ano de (a): **~110× mais barato** `[MEDIDO em R2]`. **E não compete com o backfill de OI:** medido em R2, `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m` ⇒ **baldes distintos, confirmado por observação**. **Ressalva que este PRD faz sobre a própria opção que propõe:** 1/min é **amostra**, não tick — a distribuição intra-minuto fica invisível, e o spread alarga exatamente no instante do movimento. **(c) não é (a)**; é spread **medido com `n` e percentil publicados** em vez de constante, no instante que o owner declarou como o de decisão (fechamento do bucket).

**Consequência que reformula Q9 (§8):** a pergunta de disco **não** é mais *"240 GB/ano de tick e 1,76 TB/ano de spread"*. Com o direcionamento operacional (§0.3) e a aritmética de §7.4, ela virou: **~87 GB UMA VEZ para o histórico inteiro em bucket** (todo o universo, toda a profundidade) **mais 0 a 340 GB/ano dependendo de qual das três opções de spread o owner escolher**. Isso é **Q17**, e este PRD **apresenta os três números e para**.

**O conflito que isso cria, dito sem maquiagem** (`faseamento` §4): a ordem técnica é `contrato temporal → semântica → aquisição → superfície`; a ordem de urgência é o inverso na ponta, porque o trabalho de custo de atraso irreversível estava dentro de **F3**, a terceira fase. **Resolução:** F0 existe e vem primeiro, com o argumento que a sustenta — **gravar payload bruto imutável com `received_at` não exige o contrato temporal correto. Reprocessar é barato (0,86 s/arquivo, n=11 `[MEDIDO]`); recapturar é impossível.**

**Correção R1 ao alcance dessa frase, e ela é importante:** *"recapturar é impossível"* vale para **CL-1..CL-4**, para o `available_at` **OBSERVED** e para o átomo de `interestRate` — **não** para o dump `metrics`, que é re-baixável (§1). E **F0 não preserva o `available_at` OBSERVED do universo**: preserva o de um **conjunto declarado**, porque no universo inteiro isso é **aritmeticamente impossível** (D-05, abaixo).

**D-05 · A defasagem de campo que F0 não estava capturando — e o orçamento que não fecha.** Os três coletores originais de F0 (`forceOrder`, snapshot, `premiumIndex`) **não produzem `available_at` OBSERVED para OI, para as três séries de posicionamento nem para o taker** — exatamente as séries que a plataforma existe para servir. O único instrumento era o **M-1**: 90 min, **uma vez**. Depois disso é MODELED até F3, e **latência de campo não é derivável retroativamente**.

E o orçamento **não fecha no universo inteiro**, com aritmética conferível: `/futures/data/*` tem balde **próprio** de **1000 req/5 min = 200 req/min** `[DOC]`. Um probe de **5 endpoints × S símbolos a cada 10 s** custa `5 × S × 6 = 30·S` chamadas/min ⇒ `200 / 30` ⇒ **cabem 6 símbolos**. A **30 s**: `30·S/3 = 10·S ≤ 200` ⇒ **20 símbolos**. A **60 s** a resolução do probe (60 s) é **mais grossa que a própria dispersão medida da defasagem** (99,6–200,8 s) — logo **não informa**, e um probe que não informa é custo de cota sem retorno.

**Resolução:** F0 ganha uma **quarta entrega** — probe de disponibilidade **contínuo**, com `availability_probe_set` **declarado** (símbolos, endpoints, período, resolução) desde o dia 1 — e a plataforma declara **por linha** que `available_at` é **OBSERVED no conjunto do probe** e **MODELED no resto**. Qual é o conjunto é decisão do owner (**Q19**, §8), porque decide quais séries têm defasagem real **para sempre**.

**Segundo conflito, menor e mais insidioso:** F0 não produz um único pixel e **pode durar semanas de relógio** (backfill ≈ 4,1 h + funding ≈ 14 h + acompanhamento). Daí a fatia de valor visível (S2-mínima) cair **junto com F1**, não depois de F3.

---

## 5. Tipos e contratos críticos

Definidos aqui porque o custo de descobri-los depois é migração de dado que não se recaptura. Nenhum é `TBD`; onde o **valor** ainda é decisão, o **tipo** já está fixado para que a decisão não seja migração.

### 5.1 Os três relógios — e qual decide

```
event_time        instante do fato de mercado (canônico)
available_at      o mais cedo em que um consumidor AO VIVO poderia saber
ingested_at       auditoria
availability_source ∈ { OBSERVED, MODELED }
src_label_raw     o rótulo cru da fonte, guardado ao lado — nunca renderizável em superfície
observer_id       identidade do host que carimbou available_at          (R1)
observer_region   região de rede do observador (ex.: sa-east-1)         (R1)
```

**Por que `observer_id` / `observer_region` são coluna e não nota** (dimensão perdida entre rodadas, com consequência de schema **em F0**): **`available_at` OBSERVED não é propriedade do mercado — é propriedade de `(mercado, local do observador, caminho de rede)`.** Os dumps vivem em `ap-northeast-1`; um host em São Paulo e um em Tóquio produzem `available_at` **sistematicamente diferentes**, e a tabela de defasagem **não é portável** se o host mudar. **É uma coluna hoje e é impossível retroativamente** — a mesma classe de dívida que `available_at` (CA-F0-10).

- **`event_time` canônico = FECHO da janela.** Para `daily/metrics`: `event_time = create_time + 300000`, aplicado **uma vez, às oito colunas**. Verificado em três frentes independentes: contra REST (`openInterestHist`) com conjuntos **288 vs 288** e **MAE = 0,000000**; contra verdade de campo recomputada dos `aggTrades` (**MAPE 0,3529 / 0,2046 / 0,4289 %** em shift 0 do rótulo cru, contra 44–70% nos lags vizinhos); e pelo preço implícito, que bate o close de `[t, t+5min)` com **0,002516%** contra 0,058% nos vizinhos `[MEDIDO]`.
- **R-1 e R-2 (regras duras) — e R-1 SOZINHA NÃO BASTA.** A formulação original (*"filtram por `available_at <= t_decisao`, nunca por `event_time`"*) tem dois defeitos: **admite o bucket em formação** (que tem `available_at ≈ agora` e é legitimamente observável, logo **passa** por R-1) e, lida literalmente, **proíbe o filtro que faltava**. A magnitude está em CA-F4-19 deste próprio documento: **aos 4 min de um bucket de 5 min o high definitivo já é conhecido em 77,4% dos buckets e 90,0% do range já aconteceu** `[MEDIDO]` — usado lá como argumento de UX, **virado ao contrário é a medida exata do lookahead**. R-1 passa a ser conjunção, e R-2 nasce:

```
R-1  toda leitura de decisão exige                available_at <= t_decisao
R-2  bar_policy = final_only exige TAMBÉM         bucket_end   <= t_decisao
     (e is_final = true quando a fonte o declara)
     bar_policy = intrabar só em simulação de EXECUÇÃO, nunca em avaliação de
     condição de ENTRADA — e a premissa vai no run_registry
```

**As duas são conjunção, não alternativa:** `available_at` responde *"um consumidor ao vivo poderia ter visto esta linha?"*; `bucket_end` responde *"o intervalo que esta linha descreve já terminou?"*. **São perguntas diferentes e um bucket parcial responde SIM à primeira e NÃO à segunda** — é aí que o lookahead entrava.

**R2 · E-05 — `final_only` deixa de ser inferência e passa a ser PREMISSA DO OWNER, e a diferença é de força de argumento, não de conteúdo.** R1 derivou `bar_policy = final_only` por dedução técnica (R-1 sozinha admitia o bucket em formação, logo faltava a conjunção). O owner declarou: *"a tomada de decisão ocorre no fechamento ou na consolidação de buckets de tempo (1m, 5m, 15m), sem dependência de execução no nível do micro-tick de ordem"* `[PREMISSA-OWNER: 2026-08-25]`. ⇒ **R-2 não é mais uma regra que o arquiteto pode discutir contra o custo de implementá-la — é o que o owner disse que o produto faz.** `intrabar` fica restrito a **renderização e simulação de execução**, e **nunca** a avaliação de condição de entrada.

**E R2 acrescenta a leitura que a premissa habilita, e ela é favorável:** os prazos declarados são **15m / 1h / 4h**, e a cadência de avaliação é **1m / 5m / 15m**. **Todos são múltiplos inteiros de 1 min** ⇒ a grade de 1 min é a grade canônica mais fina que qualquer consumidor de decisão precisa, e `bucket_end` é sempre uma borda dela. **Consequência de custo em §7.4: o histórico inteiro em bucket de 1 min é barato o bastante para tornar a pergunta de retenção quase vazia.**
- **`available_at` NÃO é derivável de fórmula.** A fórmula `create_time + native_period_s` está **QUEBRADA**: medido, REST OI/contas publicam **68–155 s** após o rótulo, REST taker **131–201 s** após o fechamento (n=2 transições, 1 símbolo, 1 janela de 10 min), e o dump S3 **~30,3 h** (mediana 30,29 h, faixa 30,11–31,59 h). O default de 5 min é **361× otimista** contra o único canal medido. `[MEDIDO com n=2]` — e **`lag_ms` real por endpoint é `[NÃO MEDIDO]`**, fecha com o teste M-1 (90 min de script, F0) **e passa a ser medido em regime pelo probe contínuo** (§4/D-05, CA-F0-9).
- **O carimbo MODELED é CONSERVADOR POR CONSTRUÇÃO, e a estatística é parte do tipo** (correção R1 · D-04). A rodada original fixou que **existe** tabela de defasagem e que **`p99` vai na tela com o `n`** — e **não** fixou qual estatística entra no **carimbo gravado** nem a direção de arredondamento. **Média ou mediana são otimistas em metade dos casos**, e **errar o rótulo por um bucket inverte o sinal do ΔOI de 15 min em 21,96% das janelas (n=8.629)** `[MEDIDO]`. A base empírica de hoje é **~13 minutos de relógio, um símbolo, um horário**, com dispersão de **55% sobre n=2** no OI: não é base para um estimador central.

```
available_at_MODELED = próximo ponto da grade nativa
                       >= ( bucket_end + p99_lag(endpoint) + margem )
```

**Arredondamento sempre PARA CIMA, até a próxima borda de grade** ⇒ **o erro é sempre pessimista** (a plataforma diz que soube mais tarde do que soube; nunca mais cedo). E a tabela de defasagem grava **`lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` como COLUNAS, não como rodapé** — porque rodapé não é lido por consumidor de máquina, e é consumidor de máquina que carimba.
- **`as_of` é bitemporal e explícito:** `as_of(serie, symbol, t, max_staleness_ms)` seleciona **`argmin(observed_at)`** entre as observações com `available_at ≤ t` — **a primeira, não a última nem a definitiva**. Store append-only, chave `(symbol, source, bucket_end, observed_at)`; PK unitemporal torna reconstrução point-in-time impossível e faz `is_final` decorativo.
- **E é exatamente essa escolha certa que cria `knowledge_time`** (correção R1 · D-06). Num store append-only bitemporal, **duas corridas com o mesmo hash de bundle e a mesma janela devolvem resultados diferentes**, porque **observações novas de buckets antigos chegam entre elas**. *"Janela de dado lida"* é janela de **`event_time`** — **não é estado do store**, e é o estado do store que muda. `knowledge_time` existia neste PRD **só na URL do gráfico** (F1) e **não** no registro de corrida.

```
knowledge_time  = o observed_at MÁXIMO admitido pela leitura
reproduzir(run) = (bundle_hash, window, knowledge_time)      ← os TRÊS, ou não reproduz
```

**`run_registry` grava `knowledge_time` e o hash de conteúdo das partições lidas** (CA-F4-25). Sem os dois, o registro de corrida descreve uma corrida que não volta.
- **`max_staleness` não é constante de tela.** Vive no bundle, **por série, com `verified_by`**, e o ADR declara explicitamente que **o default de tela não é o default de `as_of`** — a constante escolhida numa lente de UX vira, por gravidade, o default do acessor que o `backtest` usa.

### 5.2 Identidade de série

```
SeriesKey = (provider, venue, instrument_id, metric, cohort, interval,
             unit, denom, nature, ts_convention, reduction, label_shift,
             aggregation_scope, verified_by)                      # reduction: R2

nature        ∈ { STOCK, FLOW, RATIO, EVENT, TICK }
ts_convention ∈ { POINT_AT_BUCKET_END, AGGREGATE_OVER_BUCKET,
                  OHLC_OVER_BUCKET }                              # 3o valor: R2
reduction     ∈ { POINT, OPEN, HIGH, LOW, CLOSE, SUM, MEAN, LAST } # R2
```

- **`reduction` e `OHLC_OVER_BUCKET` nascem em R2 porque a alternativa era MIGRAÇÃO DE IDENTIDADE** (E-04). Medido: `/open-interest-history` da Coinalyze devolve **`{t, o, h, l, c}`** — **OHLC do bucket**, não ponto; a Binance entrega `sumOpenInterest` como **ponto na borda direita** (verificado: `sum_open_interest_value ÷ sum_open_interest` **É** o close do `markPriceKlines`, §5.3). ⇒ **duas semânticas diferentes para o mesmo nome `open_interest`**, e a `SeriesKey` de R1 **não tinha nenhum termo que as distinguisse**: `(provider, venue, instrument, metric='open_interest', interval='5m', …)` era **a mesma chave para quatro séries diferentes** da Coinalyze e para uma da Binance.
- **Por que isso é agora e não depois:** `SeriesKey` é **identidade**. Acrescentar termo a uma chave depois não é coluna nova — é **reidentificar toda linha já gravada**, exatamente a classe de custo que §5 existe para evitar. **Custo hoje: um campo. Custo depois: migração de identidade sobre o único dado que não se recaptura.**
- **A consequência de leitura, e ela é a que mais engana:** comparar *"o OI da Coinalyze"* com `sumOpenInterest` **sem escolher o campo compara coisas diferentes**. O único candidato com semântica próxima é **`c` (`reduction = CLOSE`)** — e mesmo ele **não é provadamente igual**, porque `c` é a última observação **dentro** do bucket e o da Binance é o valor **na borda**; coincidem só se a Coinalyze amostrar na borda, o que é **`[NÃO MEDIDO]`**. ⇒ o catálogo declara `reduction`, e a reconciliação cross-fonte **publica o erro por par `(reduction, endpoint)`**, nunca assume igualdade (`CA-F2-17`).

- **`nature` governa o operador, por tipo e não por convenção.** `delta()` sobre `nature = FLOW` é **rejeitado pelo tipo**. `RATIO` tem o operador de downsample determinado pelo **numerador**: razão de estoque aceita `last()`; **razão de fluxo só recomputa de `Σbuy/Σsell`**.
- **Por que isso não é academicismo:** somar 3 buckets de 5 min do `sum_taker_long_short_vol_ratio` dá **p50 = 3,1809** onde a razão verdadeira de 15 min é **~0,9707** — número 3,3× inflado com título honesto `[MEDIDO]`. E `p99|Δ15m|` do taker é **824,6%** contra **0,75%** do OI: **1.100×**, não diferença de grau.
- **São QUATRO séries de L/S, e uma é de outra natureza.** Autocorrelação lag-1: `count_long_short_ratio` **0,9999** · `count_toptrader_long_short_ratio` **0,9999** · `sum_toptrader_long_short_ratio` **0,9996** · `sum_taker_long_short_vol_ratio` **0,0955** (ruído branco entre buckets). Ortogonalidade do taker: `|r| < 0,10` em **12 de 12 pares**. **Proibida uma coluna genérica `ls_ratio`** `[MEDIDO]`.
- **Quarentena é predicado, não opinião — e o predicado tem TRÊS termos** (correção R1 · D-02):

```
QUARENTENA  ⇔  label_shift IS NULL  OR  unit IS NULL  OR  available_at IS NULL
```

O terceiro termo **faltava, e ele é a coluna de que R-1 depende**. O documento original resolvia isso na **tela** (`idade ?` quando `lag_ms` não foi medido — §7.1) e **deixava o armazenamento sem regra**: que valor vai para `available_at` de linha capturada **ao vivo** de endpoint **sem defasagem medida**? Se a resposta for `event_time` ou `event_time + interval`, **é o default 361× otimista gravado nas linhas do go-forward — as que não se recapturam.** Exibição corrigida com armazenamento envenenado é o pior dos dois mundos: o número está errado no disco e certo na tela.

**Regra de escrita, explícita:** endpoint **sem `lag_ms` medido** grava **`available_at = NULL`**, **`availability_source = MODELED`**, e a **série nasce isolada**. `count(gaveta)` de CA-F2-2 **recalcula sobre os três termos**.

Série **fisicamente isolada** de qualquer leitura de `backtest`. **Toda a Coinalyze nasce aqui — e R2 mostra POR QUAL DOS TRÊS TERMOS, o que é uma precisão que muda a decisão** (E-03):

| termo do predicado | estado da Coinalyze depois da medição | consequência |
|---|---|---|
| `unit IS NULL` | **RESOLVIDO.** O catálogo do fornecedor **declara** `oi_lq_vol_denominated_in` por mercado — **744 `BASE_ASSET` / 20 `QUOTE_ASSET`** nos 764 perpétuos da Binance `[MEDIDO]` | `unit`/`denom` deixam de ser incógnita e passam a ser **campo lido**, não inferido |
| `label_shift IS NULL` | **RESOLÚVEL, e para o `bv` já está resolvido** — `2·bv − v` bate o delta do dump canônico a **2,6e-14 BTC** de mediana, com **150/699 buckets exatamente iguais** `[MEDIDO]` | o teste de rótulo **é executável hoje**: o lado Binance está em disco e a key existe |
| **`available_at IS NULL`** | **NÃO RESOLVIDO, e é o que mantém a quarentena.** **Nenhuma medição de defasagem de publicação da Coinalyze foi feita** — a resposta `200` não traz nem header de cota, muito menos carimbo de disponibilidade | ⇒ **a Coinalyze continua fisicamente isolada de toda leitura de `backtest`, apesar de `bv` estar provado.** Sair da quarentena exige incluir endpoints dela no `availability_probe_set` (**Q19**, `CA-F0-9`) |

**Esta é a leitura correta do achado do `bv`, e ela é o oposto da leitura otimista:** provar que `bv` é a grandeza certa **abre o caminho** para a Coinalyze ser `cvd_source` legítima e **não a tira da quarentena**, porque o termo que falta é o terceiro. **Um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos.**

E o taker também nasce aqui: shift 0 verificado, **unidade não resolvida** — a evidência favorece quote em **601/864 buckets (69,6%)**, com erro absoluto mediano 1,7–2,9× menor, **e não fecha**.

### 5.3 Procedência e ausência

```
Procedencia = OBSERVADO | DERIVADO | MODELADO | HUMANO
Ausencia    = SEM_PONTO | NAO_LIDO | QUARENTENA | SEM_FONTE
```

- **`DERIVADO` não é `MODELADO`.** `price_mark_close = oi_value / oi_base` e `cvd_cum(anchor)` são funções determinísticas de observados; classificá-las como modeladas faz o painel principal de CVD nascer permanentemente tracejado, e **canal sempre ligado não carrega informação**. `DERIVADO` exibe a expressão e é traço sólido com marca vazada; `MODELADO` (agregado multi-venue, escada de funding) é tracejado.
- **`implied_avg_price` está RENOMEADO para `price_mark_close`, e o nome antigo está proibido** (correção R1 · D-11). Medido: **`sum_open_interest_value / sum_open_interest` É o `close` do `markPriceKlines` do mesmo bucket, exato a 8 casas decimais, 288/288 em dois dias de BTCUSDT** (alts 282–286/288, resíduo ≤ **4,34 bp** de precisão) `[MEDIDO]`. Logo **não é "preço médio implícito": é o mark close, sem perda** — e o nome antigo **ensina errado, com o catálogo de séries como veículo de propagação**. Três consequências, e as três são baratas:
  1. `price_mark_close`, `provenance = DERIVADO`, **e o catálogo declara que ele É uma das quatro séries de preço** — não um subproduto do painel de OI.
  2. **O dump `metrics` que a plataforma já ingere carrega mark price em grade de 5 min, 2.183 dias, 570/570 símbolos, de graça.** `[GAP G3]` fica **mais barato de fechar do que a rodada original supôs** (§10).
  3. **É fixture de tolerância ZERO** para o shift `+300000`, e **mais forte que a que este PRD usava**: o *"0,002516% contra o close de `[t, t+5min)`"* de §5.1 compara com a **série errada** (last price); **contra o mark close o erro é exatamente zero** (CA-F2-15).
  **Ressalva que vai no catálogo junto:** `markPriceKlines` tem **`count = 300` em todo bucket de 5 min** (1 Hz) contra média de **11.245 trades/bucket** no `klines` `[MEDIDO]` — o mark é série **amostrada**, e **seus extremos são subamostrados por construção**. Ele não substitui `klines` para high/low (ver `price_source` por uso, §5.5).
- **`provenance` governa o traço; `availability_source` governa apenas o playhead do replay** — e quando o carimbo é modelado o playhead **não é linha, é faixa**, larga exatamente a incerteza medida (68–201 s ⇒ 133 s), rotulada `fronteira estimada ±`.
- **Zero legítimo é uma marca desenhada na linha de base**, distinguível de ausência em 100 ms. Lacuna **nunca** é preenchida no armazenamento; `LOCF` com `max_staleness_ms` explícito **na leitura**.

#### A proibição de `ASOF` estava INVERTIDA — e o defeito era nosso, propagado por dois documentos

**Isto é uma correção de sinal, não de redação, e por isso o texto derrubado fica visível.** A rodada original escreveu, aqui e em `recorte` §2.1 linha 29: *"`interpolate`/`ASOF >=` proibidos por lint e por revisão"*. **Está errado, e o erro planta o defeito que a regra existia para impedir.**

Confirmado por leitura direta da fonte: `docs/avaliacao-discovery.md` **linhas 45 e 168** medem que o default de `ASOF JOIN ... USING` da ClickHouse é `table_1.asof_column >= table_2.asof_column`, chamam isso literalmente de **"direção segura"**, e advertem que proibi-lo **"bane construto seguro"**. `docs/recorte-plataforma.md` **linha 29** proibiu `ASOF >=` mesmo assim, e este PRD **herdou**. **O modo de falha é direto:** um implementador obediente, tentando "não usar `>=`", escreve `ON t1.ts <= t2.ts` — que casa a observação **POSTERIOR** — e **planta lookahead** com a bênção do documento.

```
PROIBIDO   ON t1.ts <  t2.ts   e   ON t1.ts <= t2.ts     ← casa observação POSTERIOR = lookahead
ADMISSÍVEL ON t1.ts >= t2.ts                             ← mais recente NO PASSADO. o único
```

**Idem para o emulado em Postgres/TimescaleDB** (nenhum dos dois tem `ASOF` nativo): a forma admissível é

```sql
LATERAL ( SELECT ... FROM t2 WHERE t2.ts <= t1.ts ORDER BY t2.ts DESC LIMIT 1 )
```

— e note que aqui o `<=` está **correto**, porque o predicado é sobre `t2` **contra** `t1` e a ordenação `DESC LIMIT 1` fecha o sentido. **É por isso que a regra não pode ser expressa como "o operador X é proibido": ela é sobre QUAL LADO do tempo o operador alcança.** Lint sobre o literal do operador é exatamente o que produziu esta inversão.

**E os dois `interpolate` são coisas diferentes, de fornecedores diferentes** — separá-los é parte da correção:

| construto | fornecedor | o que faz | veredito |
|---|---|---|---|
| `time_bucket_gapfill` + **`interpolate`** | TimescaleDB | interpola **linearmente entre o anterior E o posterior** | **PROIBIDO — lookahead por construção** |
| `time_bucket_gapfill` + `locf` | TimescaleDB | carrega a última observação | **admissível** com `max_staleness_ms` |
| **`INTERPOLATE`** de `WITH FILL` | ClickHouse | doc: *"if expr is not present will repeat previous value"* | **admissível — é LOCF, NÃO é lookahead** |

**Sem essa separação, o anti-padrão 1 (§7.3) rejeita o construto de um fornecedor por motivo errado dentro do ADR de motor (CA-F4-24)** — e o ADR de motor é onde a escolha entre os dois será feita.

### 5.4 As duas portas tipadas de leitura de superfície

```
<ValorDeMercado>  toda superfície lê numeral de mercado por aqui
<Anotacao>        provenance = HUMANO, autor, criada_em, + a chave completa de fixture
```

A porta única foi **derrubada**: uma anotação de OB/FVG/BSL **não é um valor de mercado** e não tem entrada legal sob a porta única — e ela é **a única peça de UI cuja ausência trava a fase seguinte inteira**. `<Anotacao>` liga obrigatoriamente a `(instrument_id, venue_symbol_as_of, interval, janela, grid_hash, knowledge_time, price_source, price_use, bar_policy, tick_size, price_precision, multiplier, cvd_anchor, universe_source)` + a URL. **R1 acrescentou `price_use` e `bar_policy` à chave:** `price_source` sozinho não diz **para que** aquela série foi escolhida (§5.5/D-11), e sem `bar_policy` a marcação não registra se foi feita sobre candle fechado ou em formação (§5.1/R-2) — **e uma marcação de sweep feita sobre bucket parcial não é a mesma marcação**. **Custo hoje: campos num JSON. Custo de esquecer: remarcar o corpus à mão.**

Correlato: **`pointer_mode ∈ {read, annotate}`** declarado desde já, com camada de overlay reservada acima do plot e abaixo do crosshair. `clique`/`Espaço` só significam "travar crosshair" em `read`. **Zero implementação, uma linha de arquitetura** — sem ela a ferramenta de marcação colide com um gesto já gasto.

### 5.5 Tipos-soma que existem para que a fase seguinte não seja migração

```
cvd_anchor    = DiaUTC | NBarras{n} | Instante{ts}          (discriminado; `swing` entra sem migração)
cvd_source    ∈ { aggtrade, kline_takerbuy, rest_taker_vol, metrics_ratio,
                  coinalyze_bv }                             (R2; erro medido por fonte, publicado)
ThresholdSpec = Absolute{pct, op}
              | Percentile{q, window, scope, min_obs, interpolation, op}
              | RobustZ{k, window, min_obs, op}
              + spec_version  +  Custom{expr} DESABILITADO por padrão
universe_source ∈ { snapshot, s3_inferred, premium_index_witness }   (R1: 3º valor + admissibilidade POR TIPO)
env             ∈ { mainnet, testnet, demo, replay }         (em toda linha de ordem/fill, desde a primeira)
bar_policy      ∈ { final_only, intrabar }                   (declarado pelo consumidor; MECANISMO em R-2, §5.1)
price_use       ∈ { structure_detection, liquidation_trigger, funding, execution, cost }   (R1)
price_source    ∈ { klines_last, mark_price, index_price, premium_index, price_mark_close } (R1)
```

- **`coinalyze_bv` é o quinto valor de `cvd_source`, e nasce com erro publicado, não com aprovação** (R2 · E-03). Medido contra o dump canônico de `aggTrades` de BTCUSDT de 2026-08-24 (**2.443.262 linhas**, `Decimal` sobre a string crua de `quantity`, **699 buckets em comum**): a hipótese *"`bv` = compra AGRESSORA"* dá erro mediano **0,0000 bp** (p99 **29,34 bp**, máx **1.955,80 bp**) contra **2.584,87 bp** da hipótese *"`bv` = compra do MAKER"* — **refutada por três ordens de grandeza** — e **150/699 buckets são exatamente iguais** `[MEDIDO]`. **Mas a cauda NÃO é zero e a causa NÃO foi diagnosticada** (candidata nomeada e **não medida**: a Binance declara que `aggTrade` **exclui** trades do fundo de seguro e de ADL, e não se sabe se a Coinalyze aplica o mesmo filtro). ⇒ é `cvd_source` **legítima com erro publicado por fonte**, **não substituto cego do `aggTrade`** — e o catálogo publica `(mediana, p99, máx, n_buckets, causa_da_cauda = NÃO DIAGNOSTICADA)`. **A precisão que decide o uso:** com p99 de 29,34 bp, ela serve **magnitude e sinal de fluxo**; **não** serve reconciliação de tolerância zero, que é o papel do `aggtrade` e do `kline_takerbuy` (§16, medição 3).
- **`cvd_delta` por bucket é FATO** (anchor-free, persistido). **`cvd_cum(anchor)` é VIEW com âncora obrigatória.** O ADR de "invariância por truncamento para toda feature normalizada, inclusive CVD acumulado" é **matematicamente impossível**: mesmo dia, mesmo dado, buckets de 1 min — âncora 00:00Z → **−1265,982 BTC**, 12:00Z → **+399,745**, 20:00Z → **+1598,508**. **O sinal inverte** `[MEDIDO, via `Decimal`]`.
- **A âncora "início do swing" está DERRUBADA** para esta fase: swing é o gargalo de 3 dos 4 detectores SMC e é explicitamente diferido; oferecê-la obrigaria esta fase a embarcar um detector de swing, que é parâmetro de estratégia.
- **`ThresholdSpec` sem default em nenhum eixo.** `field`, `H`, `mode`, `direction` e o operador são **todos obrigatórios** — default silencioso é exatamente como o `>5%` entrou na proposta. E o operador vale **20×**: em 1500 liquidações de BTCUSDT, `|r| > 0,0001` → 9 (0,60%) contra `|r| >= 0,0001` → 184 (12,27%), porque `0.0001` é átomo com **175 ocorrências (11,67%)** e **p90 = p99 = o mesmo número** `[MEDIDO]`.
- **`bar_policy` deixa de ser tipo decorativo** (correção R1 · D-03). Na rodada original `bar_policy` aparecia **uma única vez neste documento** — nesta lista — e **nenhum critério de aceite o exercitava**. O mecanismo é **R-2** (§5.1), e o teste é a extensão da fixture envenenada de CA-F1-7: **hoje aquele teste passa nos dois valores de `bar_policy`, o que significa que ele não testa nada sobre bucket parcial.**
- **`min_obs` NÃO ATENDIDO ⇒ AUSÊNCIA, nunca silenciosamente `expanding`** (correção R1 · D-14). O tipo existia em `Percentile` e `RobustZ` e **nenhum critério o exercitava** — e este é **o vetor de overfit deste projeto**, com caso concreto já medido no próprio repositório: `recorte` §2.2 QUEBRADO 1 registra `rolling(2016, min_periods=576)` **nunca preenchendo a janela nos alts** ⇒ **BTC rodou `rolling` e os alts rodaram `expanding`, e a conclusão publicada caiu por isso.** **Percentil sobre janela não preenchida não é o estatístico declarado** — é outro estimador com o mesmo rótulo, e a diferença aparece exatamente nos símbolos com menos histórico, que são os que mais se movem.

```
min_obs não atendido  ⇒  a célula devolve AUSÊNCIA ( — ),  NUNCA um número
toda saída de percentil/z carrega  n_obs efetivo POR PONTO
```

  E `min_obs` obriga telemetria: **dispersão cross-símbolo do z é item de aceite em F4** (CA-F4-26), porque dispersão anômala do z entre símbolos é a assinatura de janelas de tamanhos diferentes vestidas com o mesmo nome.
- **`universe_source` tem admissibilidade POR TIPO, e `s3_inferred` está fora do caminho de decisão** (correção R1 · D-08). `s3_inferred` **deduz a existência do símbolo da existência do arquivo de dump** — fato conhecível **~30,3 h depois** `[MEDIDO]`, **e que hoje só existe para símbolos cujos arquivos continuam publicados**. Numa varredura com `scope: CrossSection` isso seleciona **quem acabou tendo dado**: **survivorship e lookahead na mesma coluna**. A rodada original carimbava `universe_source` (mecanismo certo) **sem nenhum critério que o tornasse inadmissível** — carimbo sem predicado é rótulo, não regra.

```
caminho de DECISÃO  = { backtest, convergencia, scan com scope: CrossSection }
                      ⇒ aceita SOMENTE universe_source = snapshot
resultado transversal anterior à 1ª data de snapshot
                      ⇒ sai ROTULADO: "universo retrospectivo (s3_inferred)
                         — não é o universo conhecível em t"
```

  **Isto é o argumento mais forte que existe para CA-F0-1** (o snapshot diário datado): enquanto não houver série de snapshots, **todo resultado transversal do passado é retrospectivo por construção**, e o único jeito de sair dessa condição é começar a gravar hoje.
- **`price_source` é declarado POR USO, no `series_catalog`** (correção R1 · D-11, fecha metade de `[GAP G3]`). Existem **quatro** séries de preço no mesmo dump, e a escolha **não é global**:

| `price_use` | `price_source` | por quê |
|---|---|---|
| `structure_detection` | **last** (`klines`) | swing, BOS/CHoCH e sweep se desenham no preço negociado, e o mark é **amostrado a 1 Hz** — seus extremos são subamostrados por construção |
| `liquidation_trigger` | **mark** | liquidação acontece em mark price, não em last |
| `funding` | **mark** | o funding é calculado sobre mark |
| `execution` | **last** | o fill acontece no livro |
| `cost` | **mark** | marcação a mercado |

  **A magnitude, medida sobre os 288 buckets de 2026-08-23, `|mark − last|`:** high mediana **0,285 bp** / máx **5,842 bp**; low mediana **0,480 bp** / máx **14,430 bp**. Em ticks (`tickSize = 0.10`): high mediana **21,8 ticks**, máx **456**; low mediana **37,0**, máx **1.102,8** `[MEDIDO]`. **A consequência não é de precisão, é de estrutura:** o **bucket que contém o HIGH do dia é diferente nas duas séries** (last **78057,60** no bucket 20:05Z; mark **78017,83** no bucket 20:10Z), e a **ordenação de highs entre buckets vizinhos inverte em 2,09% dos pares, a de lows em 5,57%** `[MEDIDO]`. **Ordenação de high/low entre candles vizinhos é a primitiva de swing, BOS/CHoCH e sweep** ⇒ **escolher a série decide ONDE O SWING ESTÁ**, e a divergência mediana (22–37 ticks) é **maior que qualquer tolerância plausível de "igual"**. Some-se a isso a **invariante de candle fechado** (R-2) e F1 fica obrigada a **declarar qual série a S2-mínima usa e que toda marcação feita nela fica amarrada a essa escolha** (CA-F1-16).

### 5.6 Instrumento: nenhum atributo é escalar

**`symbol` não é o instrumento, e todo atributo de instrumento é função do tempo** — fatos datados (SCD-2), lidos *as-of* a decisão, nunca "o valor de hoje".

- **O intervalo de funding muda no tempo:** **9 de 50** símbolos mudaram entre 2025-06 e 2026-07 (**18%**); `1000XECUSDT` fez **8h → 1h → 4h dentro de julho/2026**, com a transição 8h→1h ocorrendo **1 hora** após um settlement e a 1h→4h produzindo delta de **3,0 h**. **Um gerador de cronograma sintético emitiria eventos que nunca existiram.** `interval_hours_declared` vem **por linha**, do próprio evento `[MEDIDO]`.
- **`funding_epoch` (moda dos deltas, `epoch_to`) é leitura de futuro** se algum consumidor de decisão tocar nela: a época só fecha quando termina. É tabela de análise; o caminho de decisão lê `interval_hours_declared` da própria linha.
- **`contract_multiplier` é tabela curada com `evidence_url`, nunca regex — e a citação original misturava DOIS universos** (correção R1 · D-15d). A frase antiga punha `^1000 = 17` e `^\d = 23` (universo de **877 símbolos / 698 `PERPETUAL`**) na mesma linha que `20`/`25`/`570` (universo de **570 perpétuos TRADING**). **Os dois estão certos; a frase não estava.** Reproduzido no snapshot desta rodada:

| universo | `^1000` | `^\d` | os `^\d` fora de `^1000` | falsos positivos | o correto é |
|---|---|---|---|---|---|
| **570** perp `TRADING` | **15** | **20** | `0G`, `1INCH`, `1MBABYDOGE`, `2Z`, `4` | **4** | **16** |
| **877** todos (= 698 `PERPETUAL`) | **17** | **23** | os cinco acima + `42` | **5** | **18** |

  Comando: `python3 -c "..."` sobre `data/snapshots/2026-08-25_exchangeInfo.json`, filtrando `contractType=='PERPETUAL' and status=='TRADING'` e aplicando `re.match` a `baseAsset`. **`42USDT` só aparece fora do `TRADING`** — é por isso que os falsos positivos caem de 5 para 4 no universo de 570. **A conclusão sobrevive inteira e é o que importa:** a regex **erra `1MBABYDOGEUSDT` por 10⁶** (ela casa `^1`, e o multiplicador é 10⁶, não 10³), e **a tabela tem de ser curada**. **Zero campo de multiplicador no `exchangeInfo`**, **25 `tickSize` distintos** e **`pricePrecision` de 1 a 8** nos 570 `[MEDIDO, snapshot de 2026-08-25]`.
- **`underlyingSubType` é persistido, não só `contractType`** (correção R1 · D-16). Medido no snapshot de 2026-08-25: `contractType` dá `{PERPETUAL: 698, TRADIFI_PERPETUAL: 175, CURRENT_QUARTER: 2, NEXT_QUARTER: 2}`, e dentro dos 175 `TRADIFI_PERPETUAL` `TRADING` o `underlyingSubType` distingue **`TradFi` 172 · `('TradFi','ETF')` 1 · `('Pre-IPO','TradFi')` 2**. **`contractType` sozinho não separa ETF e Pre-IPO de ação comum**, e são classes com regime de preço diferente. Custo de persistir: uma coluna que já vem no payload.
- **`fee_schedule` é fato datado, e hoje não existe nenhum** (correção R1 · D-13). Medido: **`exchangeInfo` NÃO TEM campo de taxa** — a única taxa no payload é `liquidationFee`. A taxa efetiva de maker/taker depende de **tier VIP, saldo em BNB e promoções**, e **muda no tempo**: é **a mesma classe do `contract_multiplier`**, que este PRD resolveu certo, e ficou sem tratamento. **Nenhum backtest é defensável sem ela** — custo de execução entra em todo resultado. Mecanismo idêntico, poucas linhas por ano, **sem tela**:

```
fee_schedule( venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url )
```
- **O átomo de funding é ESTRUTURAL e é POR SÍMBOLO** (correção R1 · D-15f, achado colateral de domínio). Medido: `interestRate` vale **`0.00010000` para 665 símbolos**, **`0` para 208** e **`0.00005` para 2**. Consequência de domínio: **a massa pontual que faz `p90 = p99` MUDA DE LUGAR por símbolo** ⇒ um `ThresholdSpec` de funding com número fixo está, **para 208 símbolos, do lado errado da massa**. Isso reforça CA-F4-7 (histograma, não só percentis) e **acrescenta requisito**: o histograma **marca a massa pontual em `interestRate(símbolo, data)`** — fato datado, **a capturar no snapshot de F0**.
- **`instrument_alias` é YAML versionado com `evidence_url` obrigatório** (~5 linhas/ano, **sem tela**). **Custo de esquecer: survivorship bias plantado na interface, herdado por todo backtest antes de rodar.**
- **`payload_hash` do JSON bruto NÃO detecta mudança:** duas chamadas de `exchangeInfo` separadas por **3 ms** têm **872/872 payloads brutos diferentes** (ordem de `filters` não determinística) e **20 símbolos diferentes no conteúdo canônico** (nós de backend discordando sobre `POSITION_RISK_CONTROL`). Hash sobre **projeção canônica dos campos armazenados** + confirmação em duas leituras `[MEDIDO]`.
- **`onboard_ts` nullable, com `onboard_ts_source`**, identidade por `first_seen_ts`, e `dataset_epoch(source)` na invariante — `NOT NULL` + `UNIQUE(venue, venue_symbol, onboard_ts)` impede cadastrar exatamente os 109 símbolos que a seção existe para salvar (`MATICUSDT` tem `onboardDate = None`).
- **A chave de funding leva `source`** (correção R1 · D-10). A rodada original separou `funding_settled` de `funding_estimado` — **o eixo "o quê"** — e **perdeu o eixo "de onde"** (`dump` vs `REST`). Como **a reconciliação entre fontes é CONSUMIDOR e nunca filtro na ingestão** (regra desta plataforma), **não guardar as duas versões destrói o insumo desse consumidor** — e acrescentar `source` depois é **migração de dado**, não coluna nova:

```
PK funding = ( instrument_id, settle_bucket, source, observed_at )
```

  Coerente com a chave genérica de §5.1 (`(symbol, source, bucket_end, observed_at)`), que **já tinha `source`** — a de funding era a exceção, e não havia razão para ser.
- **A captura de `fundingInfo` precisa de coluna `market`, ou 20 instrumentos de outro mercado entram na tabela por colisão de string** (correção R1 · D-18). Medido no snapshot de 2026-08-25: `fundingInfo` traz **765 entradas**, das quais **20 são COIN-M** (`BTCUSD_PERP`, `ETHUSD_PERP`, `SOLUSD_PERP`, …) e **não existem no `exchangeInfo` USDⓈ-M** — `BTCUSD_PERP` não é `BTCUSDT`, mas os dois chegam pela mesma captura e a única coisa que os distingue é a string do símbolo. Comando: comparar `{e['symbol'] for e in fundingInfo}` contra `{s['symbol'] for s in exchangeInfo['symbols']}` nos arquivos de `data/snapshots/`.

---

## 6. Unidades de valor — F0 a F5

Seis unidades. **Cada uma é candidata a um Epic em CST** (`parent_kind = Epic`), com fronteira, aceite conferível e non-goals próprios. Ordem de dependência real; **F0 e F1 não são paralelizáveis com nada**.

```
F0  captura irreversível ──────────► sem tela + registro cru (tabela feia, obrigatória)
F1  contrato temporal ─────────────► ★ S2-MÍNIMA — primeira fatia de VALOR VISÍVEL
F2  semântica declarada ───────────► S3 inspetor de série
F3  aquisição e persistência ──────► S1 console + S5 embutido
F4  superfície e reprodutibilidade ► S4 bancada + S2 completa (as-of + marcação)
F5  governança de fronteira ───────► sem tela
```

---

### F0 · Captura irreversível — sem tela, com registro cru

**Componente:** `sentimento` (+ ver §13.1 sobre o registro cru e `web`) · **Depende de:** nada técnico. Roda hoje, **sem chave**, sem rede além da Binance pública. **Pré-requisito de processo:** a parte gateante de F5 (§13.2) — **`[test_cmd]` e o primeiro teste**, porque **as condições de pronto de F0 já SÃO testes** (`[GAP G2]`).
**Por que primeiro:** §4. É a única fase cujo custo de atraso é **irreversível**.

**Gate de owner — declarado POR COLETOR, não por fase** (correção R1, validador de protocolo). A formulação antiga (*"sem Q2 respondida, F0 não pode nem começar"*) **bloqueia a captura mais barata e de prazo mais curto por uma decisão de que ela não precisa**:

| coletor / entrega | precisa de host 24/7 (Q2)? | precisa de Q1? | pode começar |
|---|---|---|---|
| **snapshot diário de `exchangeInfo` + `fundingInfo`** | **NÃO** — é um `GET` mais `gzip`, e **um `cron` diário num host que dorme perde no máximo o dia em que dormiu** | sim | **assim que Q1 for `sim`** |
| coletor `forceOrder` (WS) | **SIM** — stream-only; laptop que dorme perde exatamente o que dormiu, e o WS **desconecta a cada 24 h por doc** (reconexão é **rotina diária, não exceção**) | sim | com Q1 + Q2 |
| coletor `premiumIndex` (funding estimado) | **SIM** (polling contínuo) | sim | com Q1 + Q2 |
| **probe de disponibilidade contínuo** (R1) | **SIM** | sim + **Q19** (o conjunto) | com Q1 + Q2 + Q19 |
| **one-shot Coinalyze `daily`** (R2) | **NÃO** — 1.140 chamadas, **~28,5 min uma vez** | não — **Q4 já está respondida** | **agora.** É o único item de F0 que **não** espera nem Q1 nem Q2: a key existe, e o custo é meia hora de relógio |
| **coletor de spread a 1/min** (R2, **contingente a Q17 = (c)**) | **SIM** (polling contínuo) | sim + **Q17** | com Q1 + Q2 + Q17. **Peso 2/chamada, 1,67% do `REQUEST_WEIGHT` a 20 símbolos** `[MEDIDO em R2]` |
| ETL do dump S3 | não (fila retomável) | sim | **e não é capture-or-lose** — ver CA-F0-5 |

**E Q5 saiu do gate de F0 inteiramente** — ver a nota de fronteira no fim desta seção (D-00).

**Entrega:**
1. Coletor de `forceOrder` ligado (WS público, sem chave), gravando **cru** com `received_at` — **na variante de mercado inteiro `!forceOrder@arr`** (D-00), com **nome do stream e data do snapshot da doc gravados junto do payload**.
2. Snapshot **diário datado** de `exchangeInfo` + `fundingInfo`, com **coluna `market`** (D-18), **`underlyingSubType`** (D-16), **`interestRate` por símbolo** (D-15f) e o **conjunto de símbolos de `premiumIndex` como segunda testemunha do universo** (D-18).
3. Coletor de `premiumIndex` (funding **estimado** — **não tem endpoint de histórico em fonte nenhuma**).
4. **`availability_probe` contínuo (novo em R1 · D-05):** `availability_probe_set` **declarado** — símbolos, endpoints, período, resolução — rodando **desde o dia 1**, com a declaração explícita de que `available_at` é **OBSERVED no conjunto do probe** e **MODELED no resto**, **rotulado por linha**. O orçamento é o de §4/D-05 e **fecha em 6 símbolos a 10 s ou 20 símbolos a 30 s**, no balde próprio de `/futures/data/*` (**1000 req/5 min = 200/min**, `[DOC]` da página *Open Interest Statistics*).
5. Teste **M-1** de `lag_ms` **por endpoint**, rodado (≈90 min de script) — **e ele deixa de ser o único instrumento**, porque o probe o continua em regime.
6. Teste de **rampa até o primeiro 429** com recuo, para resolver a topologia do balde de rate limit.
7. ETL do S3 iniciado em **fila retomável**, com **profundidade declarada** (30 dias ou 2.183 — **Q18**, ver CA-F0-5).
8. `md.ingest_run` e `md.ingest_gap` **persistidos (nunca log)**, lidos por **uma consulta nomeada e compartilhada** — **a mesma que S1 usará em F3** — e exibidos num registro cru com `n_expected / n_returned / n_written`, `verdict`, `src_sha256`, `weight_used`, `api_code`, **`observer_id`**, **`observer_region`** e **`clock_skew_ms` por `ingest_run`**.
9. **One-shot da Coinalyze `daily`, novo em R2 (E-02) — e é a entrega que faz F0 deixar de ter *"não chama Coinalyze"* como non-goal.** Q4 está respondida (key existe, 11 chamadas `200`), e duas séries `daily` são profundas e **cobrem período que nenhuma outra fonte deste projeto cobre**: **OI diário 2.409 dias** (até **2020-01-21**, contra 2020-09-01 do dump S3 ⇒ **~224 dias que só ela tem**) e **liquidação diária 730 dias** (até 2024-08-26) `[MEDIDO]`. **Custo, aritmética conferível:** ~570 símbolos × 2 séries = **1.140 chamadas**, a 40/min = **~28,5 min de relógio, uma vez**. **Nasce em quarentena** pelo terceiro termo (§5.2) e **não é lida por `backtest`** — é captura, e captura é o que F0 faz. **Prioridade dentro de F0: baixa** (o `daily` **não** é apagado por doc), **mas a permanência é `[DOC-ONLY]`, medida uma vez** — logo é barato o suficiente para não valer o risco de descobrir que a doc estava errada.
10. **Reconciliação diária liquidação capturada × agregado Coinalyze (`CA-F0-14`), nova em R2** — 1 chamada/dia/símbolo, e é **a primeira série de referência independente** que este projeto tem para a incerteza `latest|largest` (§13.4, R10).

**Duas notas de implementação que R1 acrescenta porque são decisão, não detalhe:**

- **A consulta do registro é nomeada e compartilhada desde F0.** Se F0 escrever o seu próprio caminho de leitura, **F3 reimplementa o mesmo registro para S1 e o repositório passa a ter duas implementações da mesma verdade** — e elas divergem no primeiro `verdict` novo. **Uma consulta, dois consumidores (o registro de F0 e S1 em F3).**
- **`core.print-statement` colide com o registro de F0, e a colisão é medida.** Reproduzido nesta sessão: um `backend/src/cli/report.py` contendo `print(rows)` → `harness rules --mode file --path backend/src/cli/report.py` devolve `{"decision": "block", "reason": "[BLOQUEIO] [core.print-statement] ...:2: saida por impressao direta"}`. **Um relatório de CLI cuja saída É o produto viola a regra na implementação ingênua** — e §14 dizia que essa regra *"reforça CA-F0-6"* **sem notar isso**. A resolução é barata (**registrador nomeado escrevendo em `stdout`**, que é o que a própria mensagem da regra pede), **mas tem de ser DECIDIDA antes da primeira linha**, não descoberta no pre-push.

**Critérios de aceite (conferíveis, o owner roda):**

| id | critério | procedência do número |
|---|---|---|
| CA-F0-1 | `data(último snapshot de exchangeInfo) == hoje` por **7 dias consecutivos**. **R1 acrescenta o argumento que o sustenta, e é o mais forte que existe:** enquanto não houver série de snapshots, **`universe_at` só tem `s3_inferred`, que é inadmissível no caminho de decisão** (§5.5/D-08) ⇒ **todo resultado transversal do passado é retrospectivo por construção**, e o único jeito de sair dessa condição é **começar a gravar hoje**. **Dia 1 da série já existe:** `data/snapshots/2026-08-25_exchangeInfo.json` + `_fundingInfo.json`, `serverTime 2026-08-25T11:52:40Z`, **877 símbolos / 570 `PERPETUAL`+`TRADING`**, com `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` preservados (`deliveryDate = 2026-08-26T09:00:00Z`) — **captura MANUAL única do owner, NÃO o coletor de F0. Q1 continua aberta e este critério continua não atendido** | `faseamento` §F0 + `[MEDIDO]` |
| CA-F0-1b | **O snapshot grava as DUAS testemunhas do universo, e a divergência é dado, não erro** (R1 · D-18). `premiumIndex` é **segunda testemunha, é grátis e já está em F0** — e **discorda do `exchangeInfo` hoje**: medido, `exchangeInfo` **872** símbolos contra `premiumIndex` **875**, e os 3 extras são `EOSUSDT`, `FRONTUSDT` e **`MATICUSDT`** — **o caso-âncora de Q12**. **A mesma corretora publica dois universos no mesmo instante**, irmão exato do P1 de §1. ⇒ `universe_at` devolve a **união com a divergência marcada** (ou `universe_source = premium_index_witness` na linha divergente). **Custo: nenhuma chamada nova** — o coletor de `premiumIndex` já roda para o funding estimado | `[MEDIDO]` |
| CA-F0-2 | A linha do coletor de liquidação exibe literalmente `capturando há N dias · histórico anterior: inexistente por fonte nenhuma · subamostrado 1/símbolo/s por doc`, **acrescido de `regra de subamostragem: latest\|largest — não resolvida`** (R1). **Motivo:** a página USDⓈ-M diz `latest`, **a COIN-M e o changelog dizem `largest`** `[DOC, contraditória]`. **Se for `largest`, a série é distribuição de MÁXIMOS por segundo por símbolo, não de liquidações** — e **qualquer percentil de tamanho calculado sobre ela estima máximo de bloco**, que é outra grandeza com o mesmo nome. **Não-verificável hoje** ⇒ o registro cru grava **nome do stream + data do snapshot da doc** junto do payload, porque **é a única forma de pinar a semântica depois** | CL-1 (§4) + `[NÃO VERIFICÁVEL HOJE]` |
| CA-F0-3 | `lag_ms` sai de **n=2** e a tabela de defasagem tem **`p99` por endpoint com o `n` ao lado**, **mais as colunas `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window`** (R1 · D-04 — colunas, não rodapé). Enquanto M-1 não rodar, **toda idade exibida em painel ao vivo é constante adivinhada e a tela diz isso** — `idade ?`, nunca um número chamado de idade. **E R1 fecha o outro lado:** `idade ?` resolve **exibição** e não decide **armazenamento** ⇒ endpoint sem `lag_ms` medido grava **`available_at = NULL`** e a série **nasce em quarentena** (§5.2/D-02) | §5.1 `[NÃO MEDIDO]` |
| CA-F0-4 | O teste de rampa resolve a topologia do balde: hoje **2,85 min/varredura se por endpoint, 14,25 min se compartilhado**, **CONTESTADO e não testado**. É o parâmetro do qual a regra anti-lookahead do `scope: CrossSection` depende | `faseamento` §F0, §2.4 |
| CA-F0-5 | Fila de ETL retomável: matar o processo no meio e retomar **não duplica linha e não perde arquivo**. Custo declarado com medição: **0,86 s/arquivo (n=11)**; funding de 980 instrumentos ≈ **14 h**. **R1 corrige o escopo e a etiqueta:** o `30 dias` desta linha era **a janela do REST**, aplicada por inércia a um arquivo de **2.183 dias** — a profundidade do backfill do dump passa a ser **escolha explícita com os dois números lado a lado**: **570 × 30 dias ≈ 17.100 arquivos ≈ 4,1 h sequenciais** contra **570 × 2.183 ≈ 1,24 M arquivos ≈ 297 h sequenciais** (`0,86 s × n`, aritmética conferível). **É Q18.** E **F0 NÃO pode chamar este backfill de capture-or-lose**: o dump é re-baixável, portanto **o oposto de urgente** (§1) — a urgência de F0 está em CL-1..CL-4 e no probe, não aqui | `[MEDIDO]` |
| CA-F0-6 | `md.ingest_run` e `md.ingest_gap` sobrevivem a restart do processo (persistidos, não log), e a tabela crua os mostra sem estilo | `faseamento` §4 |
| CA-F0-7 | Snapshot com custo conferido. **Reconferido em R1 sobre o arquivo real:** `exchangeInfo` **1.084.766 B bruto / 45.565 B gzip**, `fundingInfo` **130.759 B / 9.063 B** ⇒ **1,16 MB/dia bruto, 54,6 KB/dia gzip** para os dois juntos (`ls -la data/snapshots/`) | `[MEDIDO]` |
| CA-F0-8 | **NTP e skew de relógio, promovidos de `[GAP G6]` para critério de F0** (R1, validador de protocolo — **estava endereçado a F3, e o ativo que ele protege NASCE em F0**). NTP declarado como **dependência de runtime de F0**; monitor comparando o relógio local com `/fapi/v1/time` e **alarmando acima de um limiar declarado**; e **`clock_skew_tolerance_ms` NÃO é medível antes de o coletor rodar** ⇒ F0 **persiste o skew observado por `ingest_run`** e a **tolerância se calibra depois** (em F3, CA-F3-13). Sem isso, um relógio errado envenena **silenciosamente** o único dado que não se recaptura | `[GAP G6]` → F0 |
| CA-F0-9 | **Probe de disponibilidade rodando, com `availability_probe_set` declarado** (R1 · D-05). O aceite tem três partes: (a) o conjunto está **escrito** (símbolos, endpoints, período, resolução) e **cabe no balde** — `5 × S × (60/período) ≤ 200 req/min`, com **6 símbolos a 10 s** ou **20 a 30 s**; (b) **toda linha carrega `availability_source`**, e a razão `OBSERVED / total` é **exibida, não estimada**; (c) **`período ≥ 60 s` é REPROVADO** — a 60 s a resolução é mais grossa que a dispersão medida da própria defasagem (**99,6–200,8 s**), logo o probe **custa cota e não informa** | `[DOC]` (balde) + `[MEDIDO]` (dispersão) |
| CA-F0-10 | **`observer_id` e `observer_region` gravados ao lado de todo `available_at`** (R1). `available_at` OBSERVED é propriedade de `(mercado, local do observador, caminho de rede)` — os dumps vivem em `ap-northeast-1`, e um host em São Paulo e um em Tóquio produzem carimbos **sistematicamente diferentes**. **É uma coluna hoje e é impossível retroativamente**; sem ela a tabela de defasagem **não é portável** se o host mudar | R1 |
| CA-F0-11 | **A série de snapshots detecta deriva de universo, e a deriva é o argumento de que ela precisa ser diária.** Medido: distribuição de `fundingIntervalHours` nos perpétuos `TRADING` é **`{4h: 433, 8h: 136, 1h: 1}`** no snapshot de **2026-08-25** contra **`{4h: 432, 8h: 136, 1h: 2}`** medido **três dias antes** — e `contractType TRADIFI_PERPETUAL` foi de **170 para 175** no mesmo intervalo. **O universo derivou em três dias**; um snapshot não datado teria apagado isso. Comando: `python3` sobre `data/snapshots/2026-08-25_*.json`, juntando `fundingInfo` a `exchangeInfo` por `symbol` | `[MEDIDO]` |
| CA-F0-12 | **A decisão de CL-4 (spread) está ESCRITA antes de o coletor de tick ligar** (R1 · D-07) — **e R2 reescreve as opções e o número** (E-06, §0.3.3/item 1). Não é "implementado" — é **decidido e registrado**, entre **três**: **(a)** `bookTicker` ao vivo — **340–420 GB/ano a 20 símbolos**, e o **1,76 TB/ano de R1 está DERRUBADO, errado por 4,8×**; **(b)** slippage de `bookDepth` (que **não tem bid/ask**) mais **premissa de spread declarada**; **(c)** *nova* — `GET /fapi/v1/depth?limit=5` a **1/min**, medido em R2: **peso 2/chamada**, 20 símbolos = **1,67% do `REQUEST_WEIGHT`**, **~3,1 GB/ano** de JSON bruto ⇒ **~110× mais barato que (a)** e produz spread **medido** em vez de assumido. **É Q17, e a escolha é do owner.** **A regra que vale sob QUALQUER das três, inalterada:** nenhum resultado de backtest pode omitir a premissa (ou a medição) de spread — **e ela nunca se dissolve no número**. **O que R2 NÃO retira:** o direcionamento operacional rebaixou a urgência de (a), **não** a de CL-4 — em (b) e em (c) **o spread de hoje só existe se for capturado ou declarado hoje** | `[MEDIDO]` (os três custos; (c) medido em R2 com `x-mbx-used-weight-1m`) |
| CA-F0-13 | **O one-shot da Coinalyze `daily` rodou e as duas séries estão em disco, em quarentena** (R2 · E-02). Aceite em três partes: **(a)** OI diário com **≥ 2.400 pontos** por símbolo de teste e **primeira data ≤ 2020-01-21**, provando que ela cobre o período **anterior ao início do dump S3** (2020-09-01); **(b)** liquidação diária com **≥ 700 pontos** e primeira data ≤ 2024-08-26; **(c)** **as duas nascem com `available_at = NULL`, `availability_source = MODELED` e `count(gaveta)` as conta** — porque o terceiro termo do predicado de quarentena **não** foi resolvido pela medição (§5.2). **Teste negativo obrigatório:** uma leitura de `backtest` sobre essas séries devolve **zero linhas** | `[MEDIDO]` (2.409 e 730 pontos) |
| CA-F0-14 | **A soma diária da liquidação capturada é reconciliada contra o agregado diário da Coinalyze, e a razão é PUBLICADA** (R2 · E-02). **Por que isso é critério e não curiosidade:** o corolário de CL-1 é *"qualquer soma sobre esse stream é limite inferior"*, e até R2 esse limite era **não quantificável** — o PRD dizia, em §13.4, que a incerteza `latest\|largest` *"não se resolve medindo hoje, porque não há série de referência independente"*. **Há: a série diária da Coinalyze é independente do nosso coletor.** Aceite: após **N dias** de coletor em regime, a tela publica `Σ(capturado_dia) / agregado_Coinalyze_dia` **por símbolo e por lado (`l`, `s`)**, com o `n` de dias. **⚠️ Ressalva que vai NA TELA junto do número, e sem ela o critério engana:** **não se sabe se a Coinalyze constrói o agregado dela a partir do MESMO stream subamostrado**. Se sim, a razão tende a **1** e **não prova nada**; se não, ela **mede a perda**. **As duas saídas são informativas sobre em qual caso estamos**, e o teste custa **1 chamada/dia/símbolo** — mas o número **nunca** é publicado como "perda medida" sem essa ressalva | `[MEDIDO]` (730 dias existem) + `[NÃO MEDIDO]` (a construção do agregado dela) |

**O que F0 NÃO faz:** **não aplica shift canônico ao gravar** (grava cru + `received_at`) · não normaliza · não plota · não decide universo · não escolhe motor de banco · **não lê Coinalyze em caminho de decisão** (a série dela nasce em quarentena pelo terceiro termo — §5.2).

**⚠️ Non-goal RETIRADO em R2:** *"não chama Coinalyze (Q4 é do owner)"* **caiu**. **Q4 está respondida** — a key existe, 11 endpoints foram chamados, todos `200` — e F0 ganhou a entrega 9 (one-shot `daily`) e a 10 (reconciliação). **O que sobrevive da intenção original daquele non-goal é a parte que importava:** a Coinalyze **entra como captura e não como fonte de decisão**, e o isolamento físico é o mecanismo, não a abstinência. **A linha do console continua mostrando o relógio de perda — corrigido: ~1,5 dia de folga a 1 min, não 24 h** (§4/CL-2).

**Nota de fronteira — RESOLVIDA em R1: Q5 não trava nada em F0** (D-00). A rodada original deixou isto como *"a primeira verificação que o arquiteto deve fazer"*. **A verificação foi FEITA, e o resultado desbloqueia F0:** existe **`!forceOrder@arr`** — *All Market Liquidation Order Streams*, **update speed 1000 ms** `[DOC]`. **O stream de mercado inteiro existe.**

Portanto, somando com o que já estava medido — o snapshot de `exchangeInfo` cobre o endpoint inteiro, e `premiumIndex` **sem `symbol` devolve 875 símbolos por peso 10** contra `REQUEST_WEIGHT 2400/min` `[MEDIDO]` — **nenhum dos coletores de F0 depende de Q5**, e **Q5 sai da coluna `trava o início de`** (§8). O único item de F0 que precisa escolher símbolos é o **probe de disponibilidade**, e essa escolha é **Q19**, não Q5: o probe cabe em 6 ou 20 símbolos por aritmética de cota, **não por decisão de universo**.

**A ressalva que fica registrada, e ela é de semântica, não de escopo:** a página USDⓈ-M diz que o stream empurra o **`latest`**; **a COIN-M e o changelog dizem `largest`** `[DOC, contraditória]`. **Se for `largest`, a série é distribuição de máximos por segundo por símbolo, não de liquidações**, e qualquer percentil de tamanho sobre ela estima **máximo de bloco**. **Não-verificável hoje** — daí CA-F0-2 e a obrigação de gravar **nome do stream + data do snapshot da doc** junto do payload.

---

### F1 · Contrato temporal e identidade do registro **+ a fatia de valor visível**

**Componentes:** `sentimento` (borda de ingestão) · `charts` (a fatia) · **`web`** · `docs` (ADR)
**Correção R1 (validador de protocolo): `web` entra na linha de componentes de F1.** A S2-mínima **é uma página Next.js**; §13.1 já raciocinava assim e F1 declarava só `charts`. **Componente omitido é componente sem dono de julgamento** (`[agents.by_component]` não tem entrada para `web` — CA-F5-1), e é onde o sistema de honestidade do dado vai morar.
**Depende de:** F0 para `available_at` **OBSERVED no conjunto do probe** (§4/D-05 — **não** no universo) e para `lag_ms`; **o contrato em si não depende de nada** — zero rede, zero API key, todos os fixtures em disco.

**Entrega (contrato) — as 13 peças:** shift `event_time = create_time + 300000` aplicado **uma vez** às oito colunas, com `src_label_raw` gravado · **ordenação obrigatória do arquivo inteiro antes de emitir evento** · unicidade por `agg_id` com verificação de contiguidade · `ingest_gap` persistido · acessor único `as_of(...)` filtrando por `available_at`, com `LOCF` e **sem** `interpolate` · as sete colunas de procedência em **toda** linha · `cvd_delta` fato / `cvd_cum(anchor)` view.

**Entrega (a fatia — e é a primeira coisa que o owner vê): S2-mínima.** 1 símbolo (BTCUSDT), 4 dias, painéis **Preço** (`price_source` declarado — ver `[GAP G3]`, §10) + **OI** (`metrics`, shift +300000) + **CVD delta e acumulado** (`cvd_source = aggTrade dump: 08-20, 08-21, 08-23`), com selo de procedência, lacuna visível, âncora explícita no título e `knowledge_time` na URL. Ela exercita o selo, a política de ausência, a âncora, o `as_of` e a grade compartilhada **de uma vez, sem rede e sem chave** — e **cada número medido no discovery já é fixture de regressão dela**.

**Critérios de aceite (o owner roda):**

| id | ação | saída esperada | força |
|---|---|---|---|
| CA-F1-1 | carregar `BTCUSDT-metrics-2026-08-18.csv` (md5 `b8ef79c353f2adce853c68084cc3b631`), verificar monotonia | monótono; **bypassando o sort → reprova**. Contexto: **13 de 30 dias fora de ordem, 0 até 2026-08-10 e 13/13 desde 2026-08-11**, deslocamento máximo de **275 posições em 288**, salto para trás de **1435 min** | `[MEDIDO]` |
| CA-F1-2 | carregar `2026-08-12` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`) e renderizar OI | **285 linhas · 1 linha em `ingest_gap` com `n_missing=3` · 1 vão de 20 min entre `event_time` 11:45Z e 12:05Z · zero pontos interpolados.** (A fixture "3 vãos" foi **derrubada**: os buckets crus 11:45/11:50/11:55 são contíguos ⇒ é **um** vão. O teste como estava escrito reprovaria implementação correta) | `[MEDIDO]` |
| CA-F1-3 | primeiro carimbo de idade de `met/2026-08-23.csv` | **`00:05:00Z`**, nunca `00:00:00Z`. Três dos quatro desenhos de UX imprimiram o rótulo cru — é o defeito que a fase existe para impedir, cometido dentro do mock da spec que o impede | `faseamento` §2.3 |
| CA-F1-4 | contiguidade dos `aggTrades` | **`0 saltos, 0 ts decrescente, 8.873.078 linhas`**; e o **buraco de 08-22 aparece como descontinuidade de `FLOW`, não costurado** (1.620.908 aggTrades ausentes entre `agg_id` 3420055157 e 3421676065) | `[MEDIDO]` |
| CA-F1-5 | deletar 1 linha do fixture de aggTrades | **reprova.** Invariante é `a[i+1] == a[i]+1`, **nunca** `first/last trade_id`: **11.327 descontinuidades de `f/l` (0,862%) contra 0 de `agg_id`** no mesmo arquivo | `[MEDIDO]` |
| CA-F1-6 | unicidade sob colisão de milissegundo | até **184 aggTrades no mesmo ms**, **25,6% dos ms com colisão** ⇒ unicidade por `agg_id`, nunca por tempo | `[MEDIDO]` |
| CA-F1-7 | fixture **envenenada**, agora com **DUAS classes de veneno** (R1 · D-03): **(a)** linhas com `event_time` passado e `available_at` futuro; **(b) NOVO: bucket parcial** | **(a)** resultado **bit-idêntico** ao dataset sem as linhas (R-1). **(b) bucket parcial** — `is_final = false`, `bucket_end > t`, **`available_at <= t`** ⇒ ele **passa por R-1** e só R-2 o exclui. Sob **`final_only`**, resultado **bit-idêntico** ao dataset sem a linha; sob **`intrabar`**, **tem de MUDAR**. **O teste como estava escrito passa nos dois casos** — isto é, não testava `bar_policy`. **`grep` não é aprovação** — R-1 e R-2 verificados por comportamento, porque `harness.toml` só cobre `backend/src/**/*.py`, exclui `**/migrations/**`, e SQL/view/ORM são invisíveis a ele | §14 + §5.1 |
| CA-F1-8 | `cvd_cum` **sem** âncora | **erro**. Com 00:00 / 12:00 / 20:00 em buckets de **1 min**, via `Decimal` → **−1265,982 / +399,745 / +1598,508 BTC**, e **o título muda nas três** | `[MEDIDO]` |
| CA-F1-9 | reproduzir CA-F1-8 pelo comando `awk` publicado no discovery | **o comando `awk` reprova uma implementação correta** (`OFMT=%.6g` devolve −1265.978 / +399.746 / +1598.508, erro de +4 mBTC). A aritmética canônica é **`Decimal` sobre a string crua de `q`, soma ordenada por `agg_id`, bucket por `transact_time // 60000`, sem serialização intermediária** | `faseamento` §2.2 |
| CA-F1-10 | crosshair em barra de 1 min **sem** ponto de OI | valor em tinta secundária + `de hh:mm:ssZ (−Xm)` + **linha-guia apontando para trás** até a marca real; **nunca** lido como leitura daquela barra | `faseamento` §F1 |
| CA-F1-11 | crosshair em bucket **ausente** de `cvd_delta` | **`—`**. Nunca o valor anterior — `locf()` sobre `nature=FLOW` é **erro de tipo** | §5.2 |
| CA-F1-12 | `COMO EM T` → navegar → voltar | `T` sobrevive aos três saltos. **Teste negativo obrigatório:** voltar para `AGORA` **não tem sintoma visível** | `faseamento` §F1 |
| CA-F1-13 | reconciliação dump × REST na mesma janela | **288/288 idênticos em `Decimal`; 0/288 idênticos como string** ⇒ banda de tolerância **zero**, calculada em `Decimal` sobre a string canônica; e **a cobertura da reconciliação — hoje 1 símbolo × 1 dia — vai na tela ao lado do trilho** | `[MEDIDO]` |
| CA-F1-14 | `pct_change(3) > 5%` lido na ordem do arquivo vs ordenado | **19 disparos contra 0.** Ordenação **não** é ETL | `[MEDIDO]` |
| CA-F1-15 | página pública renderizada | **atribuição do Lightweight Charts presente**: a notice do arquivo `NOTICE` + crédito à **TradingView** como criadora, com link para `tradingview.com`. Fecha `[GAP G4]`, que a rodada original deixou como *"CA-F1-15 a criar"* — **R1 cria** | `[MEDIDO no npm]` + `[DOC]` |
| CA-F1-16 | S2-mínima carregada | **o painel de Preço declara `price_source` e `price_use` na linha do painel**, e **toda marcação feita nela fica amarrada a essa escolha** na chave de `<Anotacao>` (§5.4). **Teste negativo:** marcar com `price_source = klines_last` e reabrir sob `mark_price` ⇒ **a marcação NÃO é reexibida como se fosse a mesma** (ou aparece rotulada `marcada sobre outra série de preço`). Motivo medido: o **bucket que contém o high do dia é diferente nas duas séries**, e a ordenação de highs vizinhos **inverte em 2,09%** dos pares (§5.5/D-11) — remarcar o corpus à mão é o custo que §5.4 existe para evitar | `[MEDIDO]` |

**O que F1 NÃO faz:** não define limiar · não calcula convergência · não chama Coinalyze · **não escolhe motor de banco** (o contrato é portável entre TimescaleDB e ClickHouse; **nenhum dos dois foi instalado nem medido — não há número e não se vai inventar um**) · não decide `field`, `H` nem `direction` · **não detecta SMC, zero algoritmo, zero limiar, zero "sinal"**.

**Nota:** a S2-mínima produz valor **de verificação** (o owner afirma que uma série significa o que ele pensa), **não valor operacional** — ela não mostra o mercado agora, o painel de OI vem do dump com ~30,3 h de idade, e cobre 4 dias com um buraco. **As duas coisas se chamam "primeira tela" e não são a mesma**; escolher entre elas é **Q10** (§8).

---

### F2 · Semântica declarada **+ S3 (inspetor de série)**

**Componentes:** `sentimento` · `web` (S3) · `docs` (ADR) · **Depende de:** F1 (contrato temporal).

**Entrega:** `series_catalog` como **contrato lido pelos testes** (§5.2) · tabela de shift **por endpoint** (`openInterestHist`, `topLongShortPositionRatio`, `topLongShortAccountRatio`, `globalLongShortAccountRatio` → dump = REST **−5 min**; **`takerlongshortRatio` → sem shift** — duas colunas da mesma linha do mesmo endpoint têm semânticas temporais diferentes porque uma é estoque e a outra é fluxo) · as **quatro** séries de L/S com colunas próprias · `funding_settled` e `funding_estimado` **separados**, com `interval_hours_declared` por linha · `capped` por linha · `unit` e `denom` **obrigatórios** · as duas colunas de OI (`base_contracts`, `notional_usd`) + **`price_mark_close`** (R1: renomeado de `implied_avg_price`, `provenance = DERIVADO`, **declarado como uma das quatro séries de preço**) + `price_effect` · **`price_source` por `price_use`** no catálogo (R1 · D-11) · **`fee_schedule(venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url)`** (R1 · D-13) · **PK de funding com `source`** (R1 · D-10) · `cvd_source` com **erro medido publicado por fonte** · **`buyVol`/`sellVol` persistidos do REST `takerlongshortRatio`** — acrescentado pela rodada de superfícies, **sem eles a perna de volume que o owner nomeou é permanentemente não-agregável acima de 5 min**.
**S3** renderiza isso: catálogo filtrável e **linhas cruas com `src_label_raw` ao lado de `event_time`** na mesma linha — é o que torna o shift `+300000` **auditável em vez de folclórico**.

**Critérios de aceite:**

| id | critério | força |
|---|---|---|
| CA-F2-1 | Toda série tem `label_shift` com `verified_by` apontando um teste que **mediu** o shift. Série com `label_shift IS NULL` fica **fisicamente isolada** — nenhuma leitura de `backtest` a enxerga | `recorte` §F2 |
| CA-F2-2 | Quarentena pelo predicado de **três** termos `label_shift IS NULL OR unit IS NULL OR available_at IS NULL` (R1 · D-02), com invariantes `count(gaveta) == count(catálogo WHERE <o predicado de 3 termos>)` — **recalculado sobre os três, não sobre `label_shift` sozinho** — e **`count(painéis sincronizados ∩ quarentena) == 0`** | `faseamento` §3.3 + R1 |
| CA-F2-13 | **Teste do terceiro termo, e ele não existia** (R1 · D-02): série com **`label_shift` e `unit` PREENCHIDOS** e **`available_at NULL`** ⇒ leitura de `backtest` devolve **zero linhas** e **a gaveta a conta**. Mais o lado da escrita: ingerir linha ao vivo de endpoint **sem `lag_ms` medido** ⇒ grava `available_at = NULL`, `availability_source = MODELED`, série **isolada**; **nunca** `event_time` nem `event_time + interval` | R1 |
| CA-F2-3 | Autocorrelação lag-1 reproduz **0,9999 / 0,9999 / 0,9996 nas três de posicionamento e 0,0955 no taker**, nos 4 símbolos | `[MEDIDO]` |
| CA-F2-4 | `delta()` sobre `nature = FLOW` **rejeitado pelo tipo**, não por convenção | §5.2 |
| CA-F2-5 | Pedir TF 15m na série taker **recusa**; **nunca** devolve 3,1809 | `[MEDIDO]` |
| CA-F2-6 | `settlement_slot`: **0 slots fora da grade em 16.979 liquidações**, resíduo em `[0, 20] ms`, **nunca negativo**. Divisor = `funding_interval_hours × 3600000` **da própria linha** — a fórmula anterior (diff entre liquidações) erra **11.658 de 16.919 = 68,9%**, ex.: `1000BONKUSDT` 2025-06-01 08:00:00.002 → slot 04:02:01.441, que não é ponto de grade nenhum. E `interval_ms_observed UInt32` **estoura acima de 49,7 dias** (51 diffs medidos acima do declarado, maior em 8.768 h) | `[MEDIDO]` |
| CA-F2-7 | Fixture `1000XECUSDT-fundingRate-2026-07.csv` (**321 linhas**) trava a transição 8h→1h→4h e o delta de **3,0 h**; **dupla ingestão → `count(*) = 321`** | `[MEDIDO]` |
| CA-F2-8 | `nextFundingTime % (h·3600000) == 0` em **570/570**; **BTCUSDT é 8h e liquida 00/08/16Z**. **A distribuição é fato DATADO, não constante** (R1): `{4h: 432, 8h: 136, 1h: 2}` = 75,79% no snapshot de **2026-08-22**, e **`{4h: 433, 8h: 136, 1h: 1}` = 75,96% no de 2026-08-25** (`data/snapshots/2026-08-25_*.json`, join por `symbol`) — **um símbolo migrou de 1h para 4h em três dias**. O critério passa a exigir a **data do snapshot ao lado do número**; sem ela é métrica transversal sem universo, que CA-F4-8 proíbe | `[MEDIDO, dois snapshots]` |
| CA-F2-9 | Reconciliação de CVD publicada **como dois números no catálogo, não como escolha**: kline `2·takerBuyBase − volume` vs `aggTrade` → **corr 1,000000, MAE 0,0443 BTC, drift 2,55 BTC em 3 dias**; ratio do dump → **corr 0,999948, MAE 1,0181, drift 123,88** | `[MEDIDO]` |
| CA-F2-10 | O lookahead do taker é **teste de regressão**: `r = +0,5458` com `[T, T+5min)` contra +0,0612 com o passado e −0,0060 com futuro+1. E `label_convention` **não pega** esse defeito, porque responde "`t` é abertura ou fechamento" e não "o valor descreve o intervalo antes ou depois de `t`" | `[MEDIDO]` |
| CA-F2-11 | `native_grid` é propriedade da `source`, **resolvida em runtime** — amarrar a 5 min fecha a porta da Coinalyze, que expõe `1min` | `recorte` §2.2 |
| CA-F2-12 | Campo **aditivo** desconhecido → **quarentena + alarme**; campo **ausente ou renomeado** → **reprova**. Motivo medido: a Binance **adicionou** `nq` ao `aggTrades` (REST tem `{a,p,q,nq,f,l,T,m}`, o dump tem 7 colunas) — sob a regra fail-closed original, **naquele dia toda a ingestão teria parado** | `[MEDIDO]` |
| CA-F2-14 | **`fee_schedule` existe e é datada** (R1 · D-13). Aceite: **nenhum resultado de backtest sem `(maker_bps, taker_bps, effective_from, evidence_url)` resolvidos as-of a janela**. Motivo medido: **`exchangeInfo` NÃO tem campo de taxa** — a única taxa no payload é `liquidationFee`; a efetiva depende de tier VIP, BNB e promoções, e **muda no tempo**. Mesma classe do `contract_multiplier`, que este PRD já resolveu certo | `[MEDIDO]` |
| CA-F2-15 | **Fixture de reconciliação EXATA, tolerância zero** (R1 · D-11): `metrics.sum_open_interest_value / metrics.sum_open_interest == markPriceKlines.close` do mesmo bucket, **exato a 8 casas, 288/288 em dois dias de BTCUSDT** (alts 282–286/288, resíduo ≤ **4,34 bp** de precisão). **É fixture MAIS FORTE que a que o PRD usava** para o shift `+300000`: o *"0,002516% contra o close de `[t, t+5min)`"* de §5.1 compara com o **last price** — a série errada — e **contra o mark close o erro é exatamente zero**. Aceite acrescido: o catálogo publica **`count = 300` em todo bucket de 5 min** do `markPriceKlines` (1 Hz) contra **11.245 trades/bucket** médios no `klines`, para que ninguém use o mark como fonte de high/low | `[MEDIDO]` |

| CA-F2-16 | **`cvd_source = coinalyze_bv` existe no catálogo COM o erro publicado, e o catálogo recusa publicá-la sem ele** (R2 · E-03). Aceite: a linha do catálogo carrega **`(mediana = 0,0000 bp, p99 = 29,34 bp, máx = 1.955,80 bp, n_buckets = 699, data_da_medição = 2026-08-24, causa_da_cauda = NÃO DIAGNOSTICADA)`**, e a hipótese refutada fica registrada (`bv` = compra do maker → **2.584,87 bp**, refutada por três ordens de grandeza). **Teste negativo, e é o que dá dente ao critério:** tentar registrar uma `cvd_source` **sem** `(mediana, p99, n)` ⇒ **reprova**. **Motivo:** *"`bv` serve"* e *"`bv` serve com p99 de 29 bp"* são afirmações diferentes, e a segunda é a única que permite escolher **por uso** — magnitude e sinal de fluxo, sim; reconciliação de tolerância zero, não | `[MEDIDO]` |
| CA-F2-17 | **`reduction` está na `SeriesKey` e a comparação cross-fonte de OI declara o campo** (R2 · E-04). Aceite em três partes: **(a)** o OI da Coinalyze entra como **quatro** linhas de catálogo (`reduction ∈ {OPEN, HIGH, LOW, CLOSE}`, `ts_convention = OHLC_OVER_BUCKET`) e o da Binance como **uma** (`reduction = POINT`, `ts_convention = POINT_AT_BUCKET_END`); **(b)** **teste negativo:** pedir *"o OI da Coinalyze"* **sem** `reduction` ⇒ **erro**, nunca um default silencioso — porque um default aqui escolhe **qual das quatro grandezas** o consumidor recebeu; **(c)** a reconciliação `Coinalyze.c × Binance.sumOpenInterest` no mesmo bucket **publica o erro** e **não afirma igualdade**: `c` é a última observação **dentro** do bucket, o da Binance é o valor **na borda**, e coincidirem exige que a Coinalyze amostre na borda — **`[NÃO MEDIDO]`** | `[MEDIDO]` (os campos `{t,o,h,l,c}`) + `[NÃO MEDIDO]` (a igualdade) |

**O que F2 NÃO faz:** não elege `field` canônico · não elege coorte de L/S · não define "extremo" de funding · **não normaliza automaticamente entre unidades** · **não tira a Coinalyze da quarentena** (R2: o terceiro termo do predicado depende de medição de defasagem, que é `CA-F0-9` + **Q19**, não F2).

---

### F3 · Aquisição e persistência **+ S1 console + S5 embutido**

**Componentes:** `sentimento` · `web` (S1) · consome-se em `backtest` · **Depende de:** F1, F2.

**Entrega:** paginador que **sempre** envia `startTime` **e** `endTime` · `-1130` classificado como **fim de histórico** (30 dias), não falha transitória · `md.ingest_run` completo · ETL do S3 com dedupe por hash de conteúdo (byte-estável verificado, inclusive nos 183 MB de `aggTrades`) · **Redis Streams + consumer group** para todo consumidor com estado · WS com **detecção de buraco por `agg_id`** e particionamento dimensionado contra vazão medida · broker de cota com `Retry-After`, jitter e circuit breaker · `universe_at(ts, filtro)` — **com `universe_source` inadmissível por tipo no caminho de decisão** (§5.5/D-08: `backtest`, `convergencia` e `scan` com `scope: CrossSection` aceitam **somente** `snapshot`; resultado anterior à 1ª data de snapshot sai **rotulado** `universo retrospectivo (s3_inferred) — não é o universo conhecível em t`) e devolvendo a **união das duas testemunhas** com a divergência marcada (D-18) · **S1 console** (`janela_de_perda`, fila de ETL, orçamento aritmético, GB/dia, dias de tick retidos) · **S5 embutido** (seletor por `universe_at`, badge de delisting lido de `deliveryDate`, `universe_source` carimbado em toda saída).

**Critérios de aceite:**

| id | critério | força |
|---|---|---|
| CA-F3-1 | `startTime` de 60 dias atrás → `verdict='REJECTED'`, `api_code=-1130`, **zero linhas gravadas**. **R1 acrescenta a fronteira, porque este critério estava sendo generalizado errado:** `REJECTED` é certo **aqui** (`-1130` é fim de histórico, resposta da API sobre a própria janela) e **não** se generaliza para "símbolo desconhecido" — ver CA-F3-14 | `[MEDIDO]` |
| CA-F3-14 | **Survivorship na BORDA DE INGESTÃO: a regra reapareceu, e ela é o oposto de fail-closed** (R1 · D-09 — regra perdida entre rodadas). `recorte` §2.1 QUEBRADO 7 já dizia: **cruzar `symbol` com o `exchangeInfo` de HOJE na borda e reprovar o lote planta survivorship** — **109 símbolos históricos são invisíveis hoje**. As duas ocorrências de "survivorship" no PRD original eram sobre **interface**; **a camada de ingestão perdeu a regra**, e quem lê CA-F3-1 generaliza fail-closed. ⇒ **símbolo ausente do `exchangeInfo` corrente → `verdict='ACCEPTED_WITH_WARNING'` + linha em `md.ingest_gap`; NUNCA `REJECTED`, NUNCA zero linhas gravadas.** Teste: ingerir dump de **`MATICUSDT`** (existe no S3, **não** existe no `exchangeInfo` de hoje) e conferir que **gravou, com aviso** | `recorte` §2.1 + `[MEDIDO]` |
| CA-F3-2 | Replay do caso `startTime` **sozinho** → **reprova, não grava**. Motivo: `openInterestHist` com `startTime` sozinho devolve **os buckets mais recentes, HTTP 200, sem aviso** — backfill ingênuo grava dado de **hoje** com timestamp de semanas atrás | `[MEDIDO]` |
| CA-F3-3 | Backfill de um dia em 5m → **288 pontos distintos**; de `2026-08-12` → **285 + gap registrado** | `[MEDIDO]` |
| CA-F3-4 | `universe_at('2025-08-01')` **inclui `ICXUSDT`** e **exclui `DOSUSDT`** (onboard 2026-08-11) | `[MEDIDO]` |
| CA-F3-5 | Listagem S3 pagina por `NextContinuationToken`, e o teste **falha se `IsTruncated=true` sem paginação**. Urgência aritmética: **980 prefixos contra `MaxKeys=1000` ⇒ folga de 20**, com **+28 símbolos em 30 dias e +136 em 90** | `[MEDIDO]` |
| CA-F3-6 | **Liveness do WS por contiguidade + heartbeat, NUNCA por taxa.** A média variou **3,66×** entre dois dias da mesma semana (55,6 vs 15,2 msg/s) e **o pico não escala com o volume** (3.468 msg/s em 08-20 contra 3.224 em 08-21, num dia com 43% menos trades), enquanto `agg_id` dá detector **exato** (0 saltos em 8.873.078 linhas) | `[MEDIDO]` |
| CA-F3-7 | Particionamento dimensionado contra a vazão medida de **um único símbolo**: p50 **21**, p95 **204**, p99 **483**, p99.9 **1.251**, max **3.224** msg/s | `[MEDIDO]` |
| CA-F3-8 | Consumidor com estado sobrevive a reinício sem perder mensagem: **Redis Pub/Sub é at-most-once por doc** (*"the message is forever lost"*) e **um acumulador de CVD não sobrevive a isso** | `[DOC]` |
| CA-F3-9 | Orçamento publicado como **aritmética conferível, recalculada quando o owner mexe no universo**: Binance `REQUEST_WEIGHT 2400/min`; `premiumIndex` sem `symbol` = **875 símbolos por peso 10** (batch existe para funding e **não existe** para OI, que é **1 símbolo/chamada**); Coinalyze **40 calls/min**, `527×6 = 79 min/passada`, ocupação `hot+warm+cold` = **80,8%** do `R_efetivo`. **E a incerteza da topologia do balde fica na tela** (2,85 vs 14,25 min/varredura, não testado). **R2 acrescenta três correções a este critério, e as três mudam o orçamento** (§0.3.2/C-4, C-5): **(a) o broker da Coinalyze é CEGO** — a resposta `200` **não traz nenhum header de cota**, nem consumido, nem restante, nem janela ⇒ **contagem local obrigatória e conservadora**, e a única forma de conhecer o limite real é bater nele; **(b) "agregado multi-exchange" NÃO EXISTE** (28 exchanges, 5.127 mercados, `exchange` obrigatório em cada) ⇒ todo agregado é **N chamadas mais uma agregação nossa**, e o orçamento de cota de qualquer painel multi-venue é **multiplicado por N**, não por 1; **(c) e o cego não é só a Coinalyze** — medido em R2, `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`** (só CloudFront e segurança), enquanto `/fapi/v1/depth` devolve `x-mbx-used-weight-1m`. ⇒ **dois dos três canais são cegos, e o cego que importa é o do screener.** Contagem local conservadora **não é adaptação a um fornecedor pior — é o caso geral**, e `CA-F0-4` (rampa até o primeiro 429) é a única forma de conhecer **dois** deles | `[MEDIDO]` + `[MEDIDO em R2]` (headers dos dois baldes) |
| CA-F3-10 | `janela_de_perda` por coletor, com **as classes distinguíveis e nunca desenhadas igual** — **e R2 substitui a constante por FÓRMULA, porque a constante estava errada nas duas direções** (§0.3.2/C-2, §0.3.3/item 4). **Coinalyze: `janela = pontos_de_retenção × intervalo`, POR SÉRIE**, medido: OI 1 min **2.206 pts = ~1,5 d** · OI 5 min **~2.000 pts = ~7,0 d** · OHLCV 1 min **1.440 pts = 1,0 d** · liquidação 1 min **3.052 pts = ~8 d** · **`daily` = sem apagamento por doc, `[DOC-ONLY]`**. ⇒ *"~24 h a 1 min"* está **derrubado**. · `/futures/data/*` **30 dias** · liquidação intraday por stream **imediata, sem backfill em fonte nenhuma**; **agregado diário recuperável 730 d na Coinalyze** (R2 · E-01) · dump S3 **`re-baixável (retenção do bucket não medida)`** — e **não** "infinito". **Duas consequências que o critério passa a exigir na tela: (i)** a janela de reparo do SLO P1 é **função da série trilhada** — trilhar 5 min em vez de 1 min multiplica o orçamento por **~4,7**, e essa escolha vai **escrita**; **(ii) a série de liquidação é ESPARSA**, logo sua janela **encolhe durante uma cascata**, que é o único regime em que ela importa ⇒ o painel escreve **`janela válida no regime atual, não garantida em cascata`**, nunca um número seco (§17/R12) | `faseamento` §S1 + `[MEDIDO em R2]` |
| CA-F3-11 | Reconexão de WS aparece em S1 como **normal, não como erro** (desconexão garantida a cada 24 h por doc) | `[DOC]` |
| CA-F3-12 | `ReplacingMergeTree(ingested_at)` **ou equivalente que deixe backfill MODELADO sobrescrever captura OBSERVADA está proibido** — destrói o `available_at` real, que é o único insumo de latência de campo, e apaga `qty_no_rpi` de linhas ao vivo **sempre na direção otimista**. `provenance` entra na chave de ordenação, ou a versão prioriza `OBSERVED` | `recorte` §2.1 |
| CA-F3-13 | `clock_skew_tolerance_ms` **medido** existe — e **R1 divide a responsabilidade**: a **dependência e a persistência do skew nascem em F0** (`CA-F0-8`), porque o ativo que elas protegem nasce lá; **F3 CALIBRA a tolerância** sobre a distribuição de skew por `ingest_run` que F0 acumulou. A invariante `available_at >= event_time` a 100% **derruba ingestão ao vivo por skew de NTP**, e **a tolerância não é medível antes de o coletor rodar** — foi por isso que exigi-la em F3 sem F0 persistir nada era impossível de atender | `recorte` §2.1 + R1 |

**O que F3 NÃO faz:** não escolhe corretora · não fixa `N` do universo nem `V` de venues antes de P0/P1 · não dispara ordem · **não decide se a Coinalyze pode estar em caminho síncrono de decisão** (isso é decisão de estratégia, e vetá-la por decreto nesta fase fecharia sem medição a única família de sinal que só ela fornece — liquidação agregada; o que a plataforma deve é **medir e publicar a distribuição de frescor da perna e expor `max_staleness_ms` como parâmetro**).

---

### F4 · Superfície e reprodutibilidade **+ S4 bancada + S2 completa**

**Componentes:** `charts` + `web` · `backtest` (run registry) · `docs` (ADR de motor) · **Depende de:** F1, F2, F3.

**Entrega:** **decisão de armazenamento (TimescaleDB vs ClickHouse vs Parquet/DuckDB — TRÊS candidatos em R2)** tomada com dataset e restrição de unicidade **ligada**, sobre volumetria medida · **grade canônica como uma única função compartilhada** entre gráfico e motor, versionada junto com o dado derivado · **S2 completa** (as-of com moldura impossível de não notar, marcação de fixture com **teclado obrigatório**, painéis restantes) · **S4 bancada** (`/screener/distribution|scan|firing_rate`, histograma, bordas de bin por `field`) · bundle de parâmetros **versionado e hasheável** (que é a URL, não um CRUD) · `run_registry` com hash do bundle, janela de dado lida, commit, data, **`knowledge_time`** e **hash de conteúdo das partições lidas** (R1 · D-06).

**Critérios de aceite:**

| id | critério | força |
|---|---|---|
| CA-F4-1 | `scan` com `Absolute{5.0}` sobre BTC/30d devolve **0 linhas** e `distribution` mostra **`max = 2,4017`**, conferido por **dois caminhos independentes** (view vs recontagem sobre a tabela crua), **não pela mesma tabela duas vezes** | `[MEDIDO]` |
| CA-F4-2 | Forçar `eval == calib` no `firing_rate` → a célula lê **`tautológico — janelas idênticas`**, nunca `1,04%`. Motivo: in-sample q=99 rende **1,042–1,045% em 23 dias** — constante que nunca avisa nada; **out-of-sample walk-forward** (calibra 7 d, avalia o dia seguinte, n=23) dá média **1,404%** e **máximo 12,847% = 12,8× o alvo**; com q=99,9, máximo **5,208% = 52×** | `[MEDIDO]` |
| CA-F4-3 | Carregar a tela **sem `ThresholdSpec` na URL** → **zero números derivados**. Nenhum eixo com default | §5.5 |
| CA-F4-4 | TF=60m no painel de OI → **719/720 fechos com ponto**, painel **habilitado**. Habilita quando `grade_painel >= grade_nativa` **e** `grade_painel mod grade_nativa == 0`; desabilita **apenas** em upsampling (1 min: **20,0%** de cobertura) ou grade não-múltipla. Cobertura medida: 1m **20,0%** · 5m **100%** · 15m **100%** · 60m **99,9%** · 240m **99,4%** · 1440m **100%** | `[MEDIDO]` |
| CA-F4-5 | `min(gap_px entre discos) > 0` numa janela de 24 h. `r` e a existência do trilho são função de `espaçamento_px = largura × grade_nativa / janela`, com **`2r + 2 <= espaçamento_px`**; o trilho **nunca** excede a grade nativa; acima de **~8,33 h** em 1200 px o painel **declara o downsample no título** em vez de desenhar 288 discos fundidos. Aritmética: 1200 px / 24 h ⇒ espaçamento **4,167 px**, disco r=4 com anel de 2 px = 12 px ⇒ **65% de sobreposição**, trilho de 10 min = 8,33 px = **2× o intervalo da grade** | `[MEDIDO]` |
| CA-F4-6 | Bordas de bin são atributo do `(field, nature)`, declaradas no bundle, **com bin de overflow contado**. Motivo: com as 11 bordas propostas (teto 50%), **951 de 2013 observações (47,2%)** do taker caem fora à direita, **máximo 2055,3%** | `[MEDIDO]` |
| CA-F4-7 | Histograma, **não só percentis**: na distribuição de funding **`p90 = p99 = o mesmo número`**, e trocar `>` por `>=` muda o disparo de **9/1500 para 184/1500 (20×)** | `[MEDIDO]` |
| CA-F4-8 | **Toda métrica transversal carrega `n` e o universo derivado do dado, nunca digitado.** O `72,2` publicado para funding de BTCUSDT **não reproduz sob nenhum universo declarado**: 69,47 (570 perp TRADING) / 70,97 (527 perp USDT) / 75,07 / 76,00 / 76,38 — **métrica sem universo, dentro do documento que a recusa** | `[MEDIDO]` |
| CA-F4-9 | Zero seleção é **informação**, sem nudge para baixar o limiar. **A tela não empurra o owner na direção de mais disparos num instrumento que gasta capital dele** | `faseamento` §2.4 |
| CA-F4-10 | Paleta completa (**4 papéis simultâneos**) passa `validate_palette.js` nos dois modos, com **`critical` fora do canal de cor**. Medido: azul `#2a78d6` ↔ laranja `#eb6834` **PASS** (protan ΔE **24,7** claro / **26,8** escuro); verde `#008300` ↔ vermelho `#e34948` **WARN** (**7,2 / 8,6**); e `#d03b3b ↔ #eb6834` **FAIL** em ΔE **10,8**, abaixo do piso 15. **Nesta plataforma, vermelho nunca significa "preço caiu" — significa "o dado quebrou"** | `[MEDIDO]` |
| CA-F4-11 | Funding renderiza como **marcador discreto em `T`**; se houver extensão horizontal, ela cobre **`[T − funding_interval_hours_da_própria_linha, T)`** rotulada **janela de acúmulo**. **Escada para frente DERRUBADA por medição:** a taxa **troca de sinal entre `T` e `T+1` em 3.047 de 16.919 transições = 18,01%** (pior: `1000SHIBUSDT` **36,8%**, `GLMUSDT` 36,7%; erro relativo mediano de `r(T)` como previsor de `r(T+1)`: **13,5%**) — a escada mostra a **cor errada** durante todo o intervalo que cobre. Escada **para trás** também proibida quando atribui a barras passadas um número que só existiu no settlement | `[MEDIDO]` |
| CA-F4-12 | **Countdown de funding com constante de 8 h é proibido — e o número estava errado por confundir duas contagens** (R1 · D-15c). **432 é a contagem de 4h** (correta em CA-F2-8, mesma linhagem). Símbolos em que **uma constante de 8h erra** = os de 4h **mais os de 1h** = **432 + 2 = 434 de 570 = 76,14%**. **E a taxa DEPENDE DO UNIVERSO**, o que CA-F4-8 do mesmo documento proíbe omitir: o TradFi tem distribuição **invertida** (`{8h: 158, 4h: 12}`), e no universo **combinado de 740** a constante erraria **446/740 = 60,3%**. ⇒ **escreva os dois**: `434/570 (76,14%) no universo cripto-perpétuo TRADING` e `446/740 (60,3%) no combinado com TradFi`. **E carregue a data do snapshot** — no de 2026-08-25 a contagem de 4h já é 433 (CA-F2-8) | `[MEDIDO]` |
| CA-F4-13 | **Nunca dois eixos Y no mesmo painel** (OI em `base_contracts` **ou** `notional_usd`, toggle, **nunca eixo duplo**): o alinhamento das escalas é arbitrário e **o gráfico inventa uma correlação que não está no dado** — `p99\|Δ15m\|` do taker é **824,6%** contra **0,75%** do OI | `[MEDIDO]` |
| CA-F4-14 | Contrato de fio içado: a célula carrega **`(valor \| ausência, event_time, available_at)`** + referência à coluna; `SeriesKey`, `source`, `unit`, `denom`, `provenance` são **coluna/painel**. Envelope completo por célula custa **519 B contra 54 B (9,6×)** ⇒ na tela de 570 × 6 células, **1.733 KB contra 180 KB**. **O invariante de tipo se preserva porque a célula continua sem construtor a partir de `number`** | `[MEDIDO]` |
| CA-F4-15 | Idade só na **borda direita do tempo**: se `viewport_fim < agora − cadência_nativa`, o chip de idade é substituído pelo rótulo absoluto da janela. **Um gráfico de 3 dias tem zero carimbos de idade, e isso está certo.** E `idade = tempo_de_referência − available_at` (em `COMO EM T`, é `T`), **nunca `now − available_at`** | `faseamento` §2.3 |
| CA-F4-16 | O limiar de atraso é **calculado e exibido com o `n` da defasagem, nunca digitado**, e vale a invariante de ordem **`limiar_atraso <= max_staleness`** — senão o painel **declara ausência antes de declarar atraso**. **R1 removeu a ilustração, porque ela citava a constante derrubada** (validador de protocolo): o exemplo antigo usava `max_staleness = 600 s`, que é **precisamente a constante que o faseamento §2.3 derrubou** (`max_staleness` vive no bundle, **por série, com `verified_by`** — §5.1). **Mesma classe de risco de citação que §11 diz ter consertado para o CVD, cometida três seções depois.** A invariante fica; a ilustração passa a ser **paramétrica**: para uma série com cadência `c` e `p99(defasagem)` medida, `limiar_atraso = 2c + p99` **tem de ser ≤ ao `max_staleness` daquela série no bundle**, e o teste **falha exibindo os dois números da série sob teste** — nunca uma constante global | `faseamento` §2.3 + R1 |
| CA-F4-17 | **S4 declara-se retrospectiva na própria tela** enquanto o teste de rampa (CA-F0-4) não resolver a topologia do balde. **`[NÃO SUSTENTADO hoje]` varredura transversal ao vivo:** `/futures/data/*` é 1 símbolo/chamada para OI, sem batch ⇒ 570 × 5 séries = **2,85 min/varredura se por endpoint, 14,25 min se compartilhado**, não testado. No pior caso a série de 5 min chega com 15 min de defasagem e o guard anti-lookahead escrito em `bucket_end` **vira lookahead real** em `scope: CrossSection` | `[NÃO MEDIDO]` |
| CA-F4-18 | Quando S4 ao vivo existir, o limiar de linha de varredura é **`lim_painel + duração_medida_da_varredura`**, com a duração no cabeçalho e a idade por linha **como desvio da varredura, não carimbo absoluto** — senão o alarme toca em **todas** as linhas (2,85+8,35 = **11,2 min**; 14,25+8,35 = **22,6 min**) e **deixa de ser alarme** | `[MEDIDO]` |
| CA-F4-19 | Bucket em formação renderiza com **`is_final = false`** e **não é escondido**: aos 4 min de um bucket de 5 min o high definitivo já é conhecido em **77,4%** dos buckets, o low em 78,8%, ambos em 56,6%, e **90,0% do range já aconteceu** — esconder isso é perda de informação na única superfície onde o owner marca sweep intrabar. E `h`/`l`/`c` do bucket corrente **nunca** são lidos como finais. **R1 acrescenta a leitura invertida da MESMA medição, e ela é o argumento de R-2** (§5.1/D-03): esses 77,4% e 90,0% são, **vistos do lado do motor, a magnitude exata do lookahead** que R-1 sozinha admitia. **Aqui o número justifica MOSTRAR; lá o mesmo número obriga a FILTRAR** — e é por isso que `bar_policy = intrabar` vale para **renderização e simulação de execução** e **nunca** para avaliação de condição de entrada | `[MEDIDO]` |
| CA-F4-20 | Precisão vem de `quantityPrecision`/`tickSize` **datados**, nunca da largura da string: `sumOpenInterest: "105832.81400000"` tem **8 casas de payload e 3 de conteúdo**; `quantityPrecision` BTCUSDT=3, COTIUSDT=0. E quantidade negociável **nunca é humanizada** (`1.314.556`, nunca `1,3 milhão`) | `[MEDIDO]` |
| CA-F4-21 | Unidade **nunca** rotulada `contratos base`: `baseAsset` traz `1000XEC`, `1MBABYDOGE`, **20 símbolos com prefixo numérico e zero campo de multiplicador**. Renderiza `denom` verbatim, ou `contratos (multiplicador não resolvido)` — **e S4 recusa comparação cross-símbolo naquela linha** | `[MEDIDO]` |
| CA-F4-22 | `/fapi/v1/openInterest` é **outra série** e não bate com a grade por construção; publica **só** contratos-base ⇒ em `notional_usd` o chip escreve **`indisponível`**, **nunca converte na borda de renderização**. E **nenhuma superfície chama endpoint de exchange direto** — tudo lê o store local, inclusive `OI (agora)`, que é série ingerida como qualquer outra (senão os quatro campos do selo ficam impreenchíveis) | `[MEDIDO]` |
| CA-F4-23 | Eixo X do Lightweight Charts: as coordenadas X dos pontos batem com os `event_time` originais **com tolerância de 0,5 px**, com **288 pontos e 1.440 candles no mesmo eixo em tempo de parede**. **`[NÃO MEDIDO]` — declarado no discovery como o maior risco técnico desta especificação** | `[NÃO MEDIDO]` |
| CA-F4-24 | Decisão de motor sai de um ADR com **dataset e unicidade ligada**, sobre volumetria medida (**1,31–4,80 M linhas/dia/par** de `aggTrade`; 288 linhas/dia/símbolo de `metrics`; **39,0 B/linha** zip). Restrições conhecidas por doc, **com a inversão de R1 já corrigida** (§5.3/D-01), porque **o ADR de motor é exatamente onde a proibição invertida fazia dano**: TimescaleDB `interpolate` interpola entre anterior **e posterior** (**lookahead por construção**) e `locf` é **seguro**; ClickHouse `INTERPOLATE` de `WITH FILL` *"will repeat previous value"* — **é LOCF e é seguro, não é lookahead**; `ASOF JOIN ... USING` tem default `t1.asof_column >= t2.asof_column`, que é a **direção segura** e **a única admissível** (o proibido é `<` / `<=`, que alcança observação posterior); ClickHouse dedupe **"only during a merge... at an unknown time"** — para soma acumulada, **unicidade eventual não serve**. **R2 acrescenta um TERCEIRO candidato, por declaração do owner, e ele muda a ordem de preferência sem decidir nada** (§0.3): **Parquet/DuckDB** `[PREMISSA-OWNER: 2026-08-25]`. **Por que ele se encaixa na tese declarada, e são quatro razões que vêm do próprio direcionamento:** o dado é **em bucket, não tick** (a decisão ocorre no fechamento) · é **append-only** · a leitura de backtest é **pesada e sequencial** · e o owner nomeou **custo de nuvem** como restrição, que em objeto frio é proporcional a bytes armazenados e não a servidor de pé. **E há uma razão técnica que vem deste PRD e não do owner:** o DuckDB tem **`ASOF JOIN` nativo**, o que importa por causa da correção **D-01** (§5.3) — o operador seguro é `>=`, mais recente **no passado**, e um motor que oferece a primitiva reduz a superfície onde a inversão pode voltar. **A aritmética de §7.4 favorece a mesma direção:** **~87 GB para o histórico inteiro em bucket, do universo inteiro, uma vez** — volume que **não exige** servidor de série temporal para ser lido sequencialmente. **⚠️ E R2 NÃO decide, exatamente como R1 não decidia: nenhum dos TRÊS foi instalado nem medido.** *"A ordem de preferência mudou com a tese"* é declaração de preferência, **não** resultado de medição, e o ADR continua exigindo **falsificador**. O falsificador que R2 nomeia para o candidato novo, porque é onde ele é mais frágil: **atualização de linha e unicidade**. Este contrato é **append-only e bitemporal** (§5.1), o que favorece Parquet; mas `CA-F3-12` proíbe que backfill MODELADO sobrescreva captura OBSERVADA, e **`CA-F4-25` exige recusar sob divergência de `knowledge_time`** — as duas exigem **ler o que já está lá**, e num store de arquivos isso é responsabilidade da aplicação, não do motor. **Quem propor Parquet/DuckDB tem de dizer onde vive essa lógica.** | `[DOC]` + `[NÃO MEDIDO]` + `[PREMISSA-OWNER]` (o 3º candidato) |

| CA-F4-25 | **`run_registry` reproduz de verdade, e sem `knowledge_time` não reproduzia** (R1 · D-06). Teste: **(1)** roda um `scan`; **(2)** ingere uma **observação atrasada de um bucket que está dentro da janela já avaliada** (caso real, não sintético: o store é append-only e bitemporal, e observações novas de buckets antigos chegam); **(3)** roda de novo **com o mesmo bundle e a mesma janela**. Aceite: **ou o resultado é idêntico, ou o sistema RECUSA apontando divergência de `knowledge_time`** — **nunca** devolve um número diferente em silêncio sob o mesmo `bundle_hash`. `reproduzir = (bundle_hash, window, knowledge_time)`, os três | R1 |
| CA-F4-26 | **`min_obs` não atendido devolve ausência, e a dispersão do z é telemetria obrigatória** (R1 · D-14). **(a)** célula com `n_obs < min_obs` lê **`—`**, **nunca** um número, e toda saída de percentil/z carrega **`n_obs` efetivo por ponto**. **(b)** a **dispersão cross-símbolo do z** é exibida como telemetria — porque dispersão anômala é a assinatura de **janelas de tamanhos diferentes com o mesmo rótulo**. Caso concreto que sustenta o critério (`recorte` §2.2 QUEBRADO 1): `rolling(2016, min_periods=576)` **nunca preencheu a janela nos alts** ⇒ **BTC rodou `rolling` e os alts rodaram `expanding`, e a conclusão publicada caiu por isso** | `[MEDIDO]` |

**O que F4 NÃO faz:** não desenha zona SMC · não implementa gerenciador de presets (**produto prematuro**; sobrevive o bundle hasheável, que é a URL) · não calcula métrica de performance · **não faz varredura ao vivo**.

---

### F5 · Governança de fronteira

**Componente:** `docs` (+ `harness.toml`) · **Depende de:** nada tecnicamente. **Ver §13.2: parte desta fase tem prazo ANTES de F0 — corrigido em R1, era "antes de F1" — e por isso não pode ficar por último inteira.**

**Entrega:** ponteiro de arquiteto para `charts` e `web` em `[agents.by_component]` · **decisão explícita sobre cobertura de `frontend/` antes do primeiro `.tsx`** (globs TS + pack que morda TypeScript, **ou** re-declarar a lacuna com a contagem de arquivos que ela deixa de fora) · ADRs `ADR-NNN` para cada decisão de §2 e §3 do `faseamento` · `env ∈ {mainnet, testnet, demo, replay}` em toda linha de ordem/fill, com chip no chrome desde a primeira tela que exibir fill · **`[test_cmd]` e o primeiro teste nascem juntos** (`[GAP G2]`, §10).

**Critérios de aceite:**

| id | critério | força |
|---|---|---|
| CA-F5-1 | `harness.toml` tem dono de julgamento para os **cinco** componentes de domínio. Hoje `[agents.by_component]` mapeia `sentimento`, `convergencia`, `backtest` e **não tem entrada para `charts` nem `web`** — conferível com `grep -n "by_component" -A2 harness.toml` | `[MEDIDO no próprio repositório]` |
| CA-F5-2 | Nenhum ADR de F1–F4 sem `ADR-NNN` | `recorte` §F5 |
| CA-F5-3 | Teste que **rejeita linha de ordem sem `env`** | `recorte` §F5 |
| CA-F5-4 | **REESCRITO em R1 — o critério original não era falsificável** (validador de protocolo). Como estava, *"re-declarar a lacuna com a contagem de arquivos"* era **desfecho aceito**, logo **o critério passava com o enforcement inalterado** — um critério que passa sem que nada mude não testa nada. O critério passa a ser: **`harness rules --mode file --path <caso violador>` DEVOLVE BLOQUEIO.** E o fecho da cobertura tem **DUAS partes obrigatórias, não uma**: (a) `code_paths.include_prefixes += "frontend/src/"` **e** globs TS/TSX; **e** (b) **um pack cujos `paths` casem o layout escolhido**. **Medido nesta sessão, e é o que mostra que uma parte sozinha não resolve:** escrevi `frontend/src/Probe.tsx` violando duas regras por construção (`const x: any`, `console.log`) e `harness rules --mode file --path frontend/src/Probe.tsx` devolveu **saída VAZIA, zero regras avaliadas** — porque as regras de `web-fullstack` têm **`scope = "code"`** e o classificador **não considera `frontend/` código**. **Adotar um pack sozinho não resolve nada.** Estado atual conferido: `include_prefixes=["backend/src/"]`, `include_globs=["*.py"]`, `packs=["core"]` ⇒ **`harness doctor` diz CONFORME sobre um universo que não contém um único `.tsx`** | `[MEDIDO no próprio repositório]` |
| CA-F5-5 | `[test_cmd]` declarado e o primeiro teste rodando — a razão `testes / medições publicadas` sai de **0/54** (§2 traz a composição). **R1 move o PRAZO: é pré-requisito de F0, não de F1** (validador de protocolo). Razão: **as condições de pronto de F0 já SÃO testes** — `CA-F0-5` é um teste (matar o processo e retomar), `CA-F0-3` e `CA-F0-4` são testes. Medido: `harness policy --key test_cmd` → **`{}`**. **Nota de enforcement disponível hoje, com a precisão que importa:** o pack `web-fullstack` traz `web-fullstack.server-test-directory-present` — `form = "path-presence"`, `severity = "block"`, `target = "backend/tests/**"`, `expect = "present"`, **sem chave `scope`** ⇒ **não passa pelo classificador de caminhos**. Lido em `~/.claude/plugins/cache/harness/harness-plugin/0.6.0/packs/web-fullstack/rules.toml`. **Ressalva de precisão que R1 registra:** ele declara **`modes = ["sweep"]`** ⇒ dispara em varredura de repositório, **não** por arquivo, **e só depois de o pack ser adotado** (`harness policy --key packs` → `["core"]` hoje) | `[GAP G2]` + `[MEDIDO]` |

**O que F5 NÃO faz:** execução ao vivo não é desta fase.

---

## 7. Regras de negócio transversais

Valem em **todas** as fases. Não são estilo: cada uma tem a medição que a produziu.

### 7.1 O selo — quatro campos, sempre nesta ordem, no mesmo card do numeral

**Regra dura: nenhum numeral de mercado renderiza sem selo, visível sem hover. Tooltip não conta.**

| campo | conteúdo |
|---|---|
| **série** | rótulo do `series_key` com qualificador e unidade lidos do catálogo: `OI · grade 5m · BTC · bn-dump`. **As strings `OI`, `funding`, `L/S`, `CVD` sozinhas não existem na UI** |
| **idade** | `tempo_de_referência − available_at`, só na borda direita do tempo; `OBSERVED` em tinta normal, `MODELED` em tinta fraca com `~`, e **`idade ?` quando `lag_ms` não foi medido para aquele endpoint**. **R1: `idade ?` resolve EXIBIÇÃO e não decide ARMAZENAMENTO** — a linha correspondente grava `available_at = NULL` e nasce em quarentena (§5.2/D-02). E quando o carimbo é MODELED ele é **conservador por construção**, arredondado para cima até a próxima borda de grade (§5.1/D-04) |
| **procedência** | `OBSERVADO` / `DERIVADO` (com a expressão) / `MODELADO` / `HUMANO`, + `source` e `label_shift` no rodapé do painel |
| **completude** | `285/288 · 1 lacuna` para série de grade; **`contiguidade (N saltos de agg_id)`** para série derivada de tick, que **não tem `n_expected`** — campo obrigatório que às vezes fica em branco vira campo ignorado |

**Içamento (o que impede o mosaico de timestamps em mutação):** **sessão** carrega fuso, `agora`, modo `AO VIVO`/`COMO EM T`, versão do bundle — 1× por tela. **Painel** carrega fonte, shift, procedência, universo e `n lido / n esperado` — 1× por painel, uma linha mono, **sempre visível, nunca em tooltip**. **Número** carrega só a idade.

### 7.2 Política de ausência — por `nature`, não por painel

| `nature` | ausência renderiza como | proibido |
|---|---|---|
| `STOCK` (OI) | ponto discreto na observação real + trilho de vigência **≤ grade nativa**, em tinta de chrome | interpolar; trilho maior que a grade |
| `FLOW` (`cvd_delta`, volume) | **vazio**; zero legítimo = marca na linha de base, ausência = ausência de marca | **`LOCF`, sempre** |
| `RATIO` de estoque (3 séries de posicionamento) | igual a `STOCK`; `last()` na borda é legítimo | `mean()` |
| `RATIO` de fluxo (taker) | painel **se desabilita** se as componentes não existirem | `sum()`, `last()` |
| `EVENT` (funding) | marcador discreto no instante da liquidação | escada para frente **e** para trás |
| quarentena | painel desabilitado **com o motivo escrito** | plotar |

### 7.3 Anti-padrões proibidos — os 25, com a razão

Reproduzidos por referência de `faseamento` §3.2; **cada um é um teste**. Os que mais custam se esquecidos, pela medição:

1. **Interpolar qualquer série** — o `interpolate` da **TimescaleDB** interpola entre o ponto anterior **e o posterior**: lookahead por construção. **R1 corrige o alcance deste anti-padrão, que estava largo demais e proibia construto seguro** (§5.3/D-01): ele **NÃO** alcança o `INTERPOLATE` de `WITH FILL` da **ClickHouse** (*"if expr is not present will repeat previous value"* — **é LOCF**), e a regra sobre `ASOF` **inverte-se**: o proibido é o operador que casa observação **POSTERIOR** (`<`, `<=`); **`>=` é o único admissível**. Um lint sobre o literal do operador **é o que produziu a inversão** — a regra é sobre **qual lado do tempo o operador alcança**, e isso não se lê em regex.
2. **"Ao vivo" / bolinha verde em série de polling** — num instante aleatório o ponto de OI mais recente tem **1,1 a 8,4 min**. O único rótulo honesto sobre o socket é **`WS conectado`** — fato sobre o socket, não afirmação sobre o dado.
6. **LED booleano "acendeu"** — filtro "não-BTC" disfarçado: **0 disparos em 30 d no BTC, 27 em 7 d no COTI**.
11. **Plotar na ordem do arquivo** — `pct_change(3) > 5%` fabrica **19 disparos onde existem zero**.
14. **Dropdown alimentado por `exchangeInfo` de hoje** — **21,6% do universo com histórico não existe mais**: survivorship bias na interface, herdado por todo backtest antes de rodar.
18. **Cor sozinha carregando estado** — e **ângulo de hachura não pode significar "OK" no plot e "lacuna" na faixa a 8 px de distância**: ausência = hachura, procedência modelada = pontilhado.
22. **Agregado multi-venue sem declarar a composição** — a Coinalyze **não agrega** (**zero ocorrências de `aggregat*` em duas capturas de doc**); todo agregado é **modelo nosso**, e somar `BTCUSDT_PERP.A` com `BTCUSD_PERP.0` é **ilegal dimensionalmente**.
23. **Deduplicar sinal na ingestão / gravar booleano pré-avaliado** — a contagem bruta some e **a fase seguinte fica sem denominador**.
25. **`grep` como aprovação** — `frontend/` tem zero cobertura; `live` casa `resolveLive`; build minificado e i18n derrotam o grep; e a regra é sobre **composição em runtime**, que grep não vê. **`grep` é triagem; aprovação é teste de comportamento.**

### 7.4 As portas que a plataforma é obrigada a deixar abertas

**Os 21 diferidos do `recorte` §4 continuam válidos e valem como requisito desta fase.** As mais caras, por ordem decrescente de custo de esquecer: **`aggTrade` CRU guardado, não só candle** (o REST só devolve 48 h) · **`available_at` medido e persistido por série** (latência não é estimável retroativamente) · **séries brutas e separadas, nenhum "índice de sentimento" composto como coluna primária** (a colinearidade **não é uniforme**: `r = +0,9964` entre duas das quatro séries e **−0,4005** entre outras duas, com troca de sinal por símbolo) · **eventos datados, nunca booleanos pré-avaliados** · **grade canônica exportável de forma determinística** · **nenhuma tabela de `swing_high`/`swing_low` materializada como se fosse fato** — o que a plataforma deve é **`tick_size` e `price_precision` por símbolo com data de vigência** · **fixture recortável e congelável byte-idêntica ao que o gráfico exibiu, INCLUINDO os buracos reais** · **política as-of por `nature`, não uniforme** · **`md.instrument` cross-venue** (Coinalyze tem namespace próprio `BTCUSDT_PERP.A`; **juntar `cz.open_interest` com `bn.open_interest` — o propósito literal do módulo `convergencia` — não tem chave hoje**).

Acrescentadas pela rodada de superfícies (`faseamento` §5): **`pointer_mode`** · **`<Anotacao>` como segunda porta tipada** · **`tick_size`/`price_precision` as-of a janela** · **multiplicador em tabela curada com `evidence_url`** · **`buyVol`/`sellVol` persistidos** · **`as_of` bitemporal** · **cadência do bucket parcial fixada em spec** (`(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` a `max(1 Hz, 1/TF)`, e **a resolução exibida da idade nunca é mais fina que `1/f`** — sem essa cláusula, "barra parcial a 40% de opacidade" é ambíguo entre 1 msg/s e 3.468 msg/s de pico) · **`env` com slot no chrome** · **`ThresholdSpec` com `spec_version` + `Custom{expr}` desabilitado**.

**Correção R1 · D-12 — o custo da porta 1 estava superestimado por 540–2.412×, e isso muda Q9.** A porta *"`aggTrade` CRU guardado, não só candle"* continua aberta, mas **o preço dela era outro**. Medido: `kline(2·taker_buy − volume)` contra o delta de `aggTrade` → **corr 1,000000, somas IDÊNTICAS, MAE 0,0443 BTC, drift máximo 2,55 BTC que reverte** (atribuição de borda de bucket, não erro acumulado). Tamanho, BTCUSDT, 1 dia, zip: `aggTrades` **33.119.895 B** · `klines 1m` **61.333 B** · `klines 5m` **13.733 B** ⇒ **540×** e **2.412×** `[MEDIDO]`.

⇒ **CVD POR BUCKET para todo o histórico custa ~0,2% do que este PRD orçava.** `aggTrade` cru continua **obrigatório**, mas **só para os usos INTRABAR que a porta 1 nomeia**: desempate SL-vs-TP na mesma barra · sweep intrabar · absorção por tamanho de trade · a variante sem RPI (`nq`). ⇒ **`cvd_source` recomendado POR USO no catálogo, com o erro medido ao lado**, e §7.4 declara **as duas granularidades com o custo de cada**.

**Correção R2 · E-07 — a porta 1 sai do requisito de CAPTURA, e o argumento publicado para isso estava ERRADO.** §0.3.3/item 2 traz a discordância inteira; o resumo é: **quem dispensa capturar tick é o dump ser re-baixável desde 2019-12-31**, não o desempate SL-vs-TP resolvido por 1m em 98,44%. **São dois argumentos para duas decisões diferentes** — o 98,44% dispensa **computar** sobre tick, a re-baixabilidade dispensa **armazenar** tick — **e conflacioná-los entrega à fase de estratégia uma camada que o owner nomeou (*"agressão e ABSORÇÃO via CVD"*) sem o insumo dela**, porque **absorção por tamanho de trade exige tick** e absorção por bucket não. ⇒ **a porta 1 continua aberta, com gatilho NOMEADO, e o gatilho é `Q20`**.

**E R2 fecha o orçamento de disco com aritmética própria, medida nesta rodada — é o número que o owner está pedindo quando diz "sem inflar custo de disco e processamento em nuvem".** `curl -sI` em `data.binance.vision`, arquivos de **2026-08-18**, `Content-Length` zipado:

| arquivo | 1 dia, 1 símbolo | universo × profundidade | total |
|---|---|---|---|
| `metrics` (OI, grade 5 min) | **11.531 B** | 570 × 2.183 dias | **~14,3 GB** |
| `klines 1m` BTCUSDT | **58.262 B** | 570 × 2.183 dias | **~72,5 GB** |
| `klines 5m` BTCUSDT | **13.277 B** | — | (16% de 1m) |
| `klines 1m` ADAUSDT (alt, para calibrar) | **46.746 B** | — | **BTC é teto, não média** |
| `aggTrades` BTCUSDT | **6.930.298 B** | — | **119× o `klines 1m` do mesmo dia** |

⇒ **o histórico inteiro em bucket — todo o universo, toda a profundidade medida, OI a 5 min mais preço/volume/taker a 1 min — cabe em ~87 GB, UMA VEZ.** Contra **340–420 GB/ano** de `bookTicker` para 20 símbolos e **~240 GB/ano** de tick para 20 símbolos.

**Três ressalvas de procedência, e nenhuma delas derruba a conclusão:** **(i)** os **2.183 dias** são a profundidade **medida do `metrics`** (desde 2020-09-01); a data inicial de `klines` é **`[NÃO MEDIDO]`** e foi usada a mesma profundidade para que os dois números sejam comparáveis. **(ii)** BTCUSDT é o **símbolo mais pesado** e foi usado no multiplicador ⇒ **87 GB é teto, não estimativa central** (ADAUSDT é 80% dele). **(iii)** o `aggTrades` de **2026-08-18** (6,93 MB) é muito menor que o de 2026-08-20/23 (33,1 MB) usado em D-12 — **a variação dia a dia de 3,7× que este PRD já mediu**, e é a razão de o número de tick ser dado como faixa e não como ponto.

**A consequência de escopo, dita sem rodeio: o custo de disco não é o que decide nada nesta fase.** O que decide é **relógio de ETL** — `0,86 s/arquivo × 1.244.310 arquivos ≈ 297 h sequenciais` **por série** (`metrics` **ou** `klines 1m`; as duas ⇒ **~594 h**), paralelizável numa fila retomável. ⇒ **`Q18` deixa de ser pergunta de disco e passa a ser pergunta de relógio e paralelismo**, e **`Q9`, como orçamento de disco de dado em bucket, está respondida por aritmética: guarde 1 min de tudo, custa ~72 GB uma vez** (§8).

**Correção R1 · D-17 — serialização de numeral é invariante de locale, e isto é caminho de dado, não estilo.** A porta 7 exige fixture *"byte-idêntica ao que o gráfico exibiu"*, e a aritmética canônica é **`Decimal` sobre a string crua** (CA-F1-9). **Se o locale entrar em export, payload, hash, CSV de reprodução ou `run_registry`, o fixture deixa de ser byte-estável entre `LANG=pt_BR.UTF-8` e `LANG=C`** — e a inferência de pt-BR (§9/Q14) não tinha nomeado essa consequência. Regra, uma linha, aplicada em §9:

```
numeral em QUALQUER caminho de dado (fixture, export, API, hash, run_registry)
  ⇒ ponto decimal, sem separador de milhar, invariante de locale
pt-BR aplica-se EXCLUSIVAMENTE a microcopy e rótulo de eixo
```

**Teste:** exportar o mesmo fixture com os dois `LANG` e comparar `sha256sum` — **iguais, ou reprova**.

**Regra que já dá para fixar sem nenhuma decisão pendente: o browser nunca recebe tick.** (4.802.005 aggTrades/dia num símbolo, pico medido de 3.468 msg/s.)

---

## 8. Classificação das decisões do owner — **16 → 19 em R1 → 20 em R2**

As 16 perguntas originais de [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md) **são o resultado da Discovery Interrogation** — três rodadas, 33 agentes. O trabalho aqui é **classificá-las** pelo gate deste PRD.

**⚠️ R2 consolidou o registro, e havia COLISÃO DE NUMERAÇÃO criada por edições paralelas.** R1 renumerou para 19 (Q17 spread · Q18 profundidade do backfill · Q19 conjunto do probe) **só neste PRD**; em paralelo o owner editou `docs/decisoes-do-owner.md` criando um **Q17 (CL-4/spread — o mesmo item, sem conflito de significado)** e referenciando **Q20 (Fibonacci)** em `direcionamento-operacional.md`. **R2 resolve fazendo de [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md) a FONTE ÚNICA da numeração e do estado**, com Q1–Q20 sem colisão, `Q17` unificado (era o mesmo item nas duas edições), e **estado explícito por pergunta**. Este PRD passa a **referenciar** esse registro, não a duplicá-lo. **Vocabulário de estado, e ele existe porque "respondida" e "aberta" não bastavam:**

| estado | significa |
|---|---|
| `ABERTA` | continua sendo decisão do owner, sem resposta |
| `RESPONDIDA` | fechada; nada resta |
| `RESPONDIDA COM RESÍDUO` | a pergunta original está fechada por medição ou declaração, **e resta uma decisão menor NOMEADA** |
| `MORTA` | deixou de ser pergunta, **com o motivo escrito** — nunca apagada em silêncio |
| `INFERÍVEL` | §9, com motivo e custo de reversão |

**R1 acrescentou TRÊS perguntas novas, e as três nasceram de fato medido, não de dúvida:**

| Q | pergunta | de onde veio | por que é do owner e não do time |
|---|---|---|---|
| **Q17** *(números e opções REESCRITOS em R2)* | **spread: medir ou assumir? TRÊS opções.** (a) `bookTicker` ao vivo — **340–420 GB/ano a 20 símbolos** (o **1,76 TB/ano de R1 está derrubado, errado por 4,8×**); (b) `bookDepth` + **premissa de spread declarada** (`bookDepth` **não tem bid/ask**); **(c) NOVA em R2:** `/fapi/v1/depth?limit=5` a **1/min** — **peso 2/chamada, 1,67% do balde, ~3,1 GB/ano, ~110× mais barato que (a)** | **D-07 / CL-4**: `bookTicker` **saiu do dump em 2024-03** (200 em 2024-03-25, **404** em 2024-03-31 e depois) ⇒ **spread é capture-or-lose desde hoje** — **e continua sendo em R2** (§0.3.3/item 1) | **É decisão do owner sobre honestidade do backtest.** **O direcionamento operacional (*"não é HFT, sem leitura de milissegundo no livro"*) RESPONDE a parte que era técnica**: (a) sai do escopo desta fase. **O resíduo é real e é dele: (b) ou (c)** — spread **assumido** contra spread **medido a 1/min por 1,67% de um balde com folga**. **Este PRD apresenta os três números e para** |
| **Q18** | **profundidade do backfill do dump `metrics`: 30 dias ou 2.183 dias?** | **§1**: a premissa *"nenhuma fonte gratuita tem histórico intraday profundo de OI"* era **falsa** — o dump tem 2.183 dias, 5 min, 570/570. O `30` de `CA-F0-5` era **a janela do REST**, aplicada por inércia | **17.100 arquivos ≈ 4,1 h** contra **1,24 M arquivos ≈ 297 h** sequenciais (`0,86 s/arquivo`). É host, é disco e é tempo de relógio do owner. **Não é urgente** (o dump é re-baixável), e por isso é escolha **explícita**, não default |
| **Q19** | **`availability_probe_set`: quais símbolos e endpoints ganham `available_at` OBSERVED?** | **D-05**: no universo inteiro é **aritmeticamente impossível** — balde próprio de **200 req/min** ⇒ **6 símbolos a 10 s** ou **20 a 30 s**; a 60 s **não informa** | **Decide quais séries têm defasagem real PARA SEMPRE.** Latência de campo **não é derivável retroativamente**; o que ficar fora do conjunto é **MODELED permanentemente para o período em que ficou fora** |

**Veredito do gate: NÃO BLOQUEADO — e R1 não muda isso.** Nenhuma das 19 impede que este PRD tenha fronteira de fase clara, regras bloqueantes endereçáveis, tipos críticos definidos e non-goals escritos. **Razão:** as respostas mudam **quando** o trabalho começa, **qual o tamanho do universo** e **quanto disco custa a honestidade** — não **qual é o requisito**. A estrutura F0–F5 sobrevive a qualquer resposta das 19, e cada pergunta tem a consequência escrita.

**R2 acrescenta UMA pergunta nova, e ela é a única das 20 que o time NÃO PODE inferir — porque decide o que a fase seguinte detecta:**

| Q | pergunta | de onde veio | por que é do owner e não do time |
|---|---|---|---|
| **Q20** | **A fase de estratégia detecta SMC, detecta pivôs + Fibonacci, ou os dois?** | **§0.3 / `direcionamento-operacional.md`**: a `proposta-discovery` §Módulo B nomeia **OB, FVG, BSL/SSL, BOS/CHoCH** (vocabulário SMC); a tese declarada pelo owner nomeia **pivôs de alta/baixa, retração/extensão de Fibonacci, e volume**. **SMC não é mencionada no direcionamento** | **É escolha de tese, não de engenharia.** Consequência em **três** lugares: **(a)** o que se detecta; **(b) o que o owner marca à mão** — marcar Order Block e marcar pivô/Fib são trabalhos distintos; **(c)** a estimativa da fase seguinte. **Este PRD NÃO infere** |

**Observação que vale sob QUALQUER resposta, e é a mais útil que R2 produz — mais útil que a resposta:** os dois vocabulários se apoiam no **mesmo primitivo**. **Pivô é uma definição de swing** · **âncora de Fibonacci é um par de swings** · **BOS/CHoCH é rompimento de swing** · **BSL/SSL é extremo de swing**. E **fixada a definição de swing, os níveis de Fibonacci são aritmética pura, sem parâmetro novo**. ⇒ isto confirma **por segundo caminho independente** o que a skill do repositório já dizia (*"definição de swing — TODA a detecção de estrutura depende desta escolha; é a primeira a fixar"*): **a definição de swing é o parâmetro de maior alavancagem do projeto inteiro.**

**E R2 tira dessa observação uma consequência OPERACIONAL que muda Q11 hoje, antes de Q20 ser respondida.** Me foi passado que *"o corpus não se reaproveita"* entre os dois vocabulários. **Isso é verdade para um corpus de Order Blocks e FALSO para um corpus de swings** — e a distinção é acionável: **um corpus de SWINGS MARCADOS é insumo dos dois vocabulários e é a única marcação que sobrevive a qualquer resposta de Q20.** ⇒ **duas consequências de requisito, as duas baratas e as duas de hoje:** **(i)** a primeira tranche de horas do owner em `Q11` deve ser **marcação de swing**, que é trabalho **independente da resposta** — e portanto não é desperdiçada em nenhum cenário; **(ii)** o primeiro primitivo de `<Anotacao>` (§5.4) é **`swing_point`**, não `zone` — zona é OB/FVG/Fib e depende de Q20; ponto de swing não. **Isso de-risca Q11 sem custar nada e sem antecipar a resposta de Q20.**

**Contagem em R2: 0 bloqueantes · 14 abertas ou com resíduo · 3 inferíveis · 1 respondida · 1 morta · 1 nova aberta = 20.** O detalhamento por estado é a fonte única em [`docs/decisoes-do-owner.md`](../decisoes-do-owner.md); a coluna que interessa ao arquiteto — **o que trava o início de qual fase** — continua abaixo.

**Mas algumas travam o INÍCIO de F0**, e isso é diferente de travar o PRD. Está na coluna `trava o início de`. **Duas correções de R1 nessa coluna:** **Q5 SAIU** (D-00 — `!forceOrder@arr` existe, nenhum coletor depende do universo) e **Q19 ENTROU** (só o probe, não os outros coletores). **E o gate de Q2 agora é POR COLETOR** (§6/F0): o snapshot diário **não precisa de host 24/7** — é um `GET` mais `gzip`.

| Q | assunto | classe | trava o início de | prazo derivado (não é compromisso do owner) | requisito que torna a resposta tardia barata |
|---|---|---|---|---|---|
| **Q1** | autoriza ligar os coletores hoje (**4 em R1**, com o probe) | **não-bloqueante** (é **autorização**, não incógnita — o desenho está completo, **e R1 o completou mais**: D-00 fechou a única verificação pendente de desenho de F0) | **F0**, **por coletor** | **hoje**. **R1 AUMENTA o custo de atraso além do que o PRD contabilizava:** além de ~1 dia/dia de série e da liquidação que **nem pagando volta**, perde-se **(a)** o `available_at` **OBSERVED das séries que a plataforma existe para servir** — latência de campo **não é derivável retroativamente** (D-05) — e **(b)**, se a resposta a **Q17** for (a), perde-se **spread**, que é capture-or-lose desde hoje (D-07/CL-4). **E perde-se o átomo de `interestRate` datado** (D-15f) | nenhum. **É o único item deste PRD cujo custo de atraso não tem mitigação técnica** |
| **Q2** | onde roda, quem acessa, orçamento de disco | **não-bloqueante**, com **premissa declarada e REESCRITA em R1** | **F0 parcialmente** — só os coletores contínuos; o **snapshot diário não precisa dela** (§6/F0, gate por coletor) | **hoje**, junto com Q1 | **premissa reescrita: "host alimentado e conectado 24/7, single-user, não exposto", e NENHUMA linha de auth escrita especulativamente.** A formulação antiga — *"localhost single-user"* — **falsificava-se duas linhas depois no próprio PRD** (*"um laptop que dorme perde exatamente o que dormiu"*): "localhost" não diz nada sobre alimentação nem uptime, que é **precisamente** o que F0 precisa. **As três propriedades são independentes** e a premissa nomeia as três. Se a resposta for "exposto", auth entra como **fase nova**, não como retrofit — em não-exposto tela de login é código morto com superfície de ataque, em exposto é estrutura |
| **Q3** | canal de alarme fora do browser | **não-bloqueante** | nada; **é o que impede Q1/Q4/Q5 de perderem em silêncio** | junto com F0 entrar em regime | S1 é **diagnóstico**, não alarme, e o PRD diz isso (`faseamento` §S1). O canal é integração pequena; **o detector já está fixado: contiguidade de `agg_id` + heartbeat, nunca taxa** (CA-F3-6) |
| **Q4** | ~~key Coinalyze esta semana~~ → **RESPONDIDA COM RESÍDUO em R2** | **RESPONDIDA** na forma original; **resíduo ABERTO** | nada. **E R2 acrescenta o oposto: Q4 respondida DESBLOQUEOU duas entregas em F0** (E-02, entregas 9 e 10) | o resíduo não tem relógio de dado no `daily` (não é apagado por doc); tem relógio no intraday | **A key existe, 11 endpoints foram chamados, todos `200`** ⇒ a pergunta original está fechada. **O resíduo NOMEADO, e é dele: manter o plano free, assinar o pago, ou descartar a Coinalyze do desenho?** O que o free entrega está **medido**: 40 chamadas/min · **zero telemetria de cota na resposta `200`** ⇒ broker cego · retenção intraday **rasa e por contagem de pontos** · `daily` **profundo (OI 2.409 d, liquidação 730 d)** · `bv` **provado como compra agressora, com cauda p99 29,34 bp não diagnosticada**. **E o requisito que torna o resíduo barato continua valendo: a Coinalyze nasce em quarentena pelo TERCEIRO termo do predicado** (`available_at IS NULL`), que a medição **não** resolveu ⇒ descartá-la depois **não é migração**, é apagar uma gaveta isolada |
| **Q5** | universo inicial (N e nomes, cadência) | **não-bloqueante** | **NADA — saiu do gate de F0 em R1 (D-00)** | antes de F0 entrar em regime | **`!forceOrder@arr` existe** (*All Market Liquidation Order Streams*, update speed 1000 ms `[DOC]`) ⇒ **os três coletores originais cobrem mercado inteiro** e **nenhum depende do universo declarado**. O `contractType`, o `underlyingSubType` (R1 · D-16), o `venue_symbol` e o universo derivado do dado são persistidos **por linha** ⇒ o universo é **filtro na leitura**. **E R1 fecha o furo que sobrava:** a frase antiga *"liquidação daquele símbolo é perdida para sempre"* **deixa de valer**, porque não há mais símbolo de fora na captura de liquidação. **O que ainda escolhe símbolos é o probe — e isso é Q19, não Q5** |
| **Q6** | TradFi entra | **inferível** — ver §9 | nada | confirmação de uma frase | `contractType` **e `underlyingSubType`** persistidos por linha ⇒ inverter a decisão é **trocar um filtro na LEITURA** — e **R1 corrige a frase, que era falsa na perna de CAPTURA** (D-16): filtro só serve para série **armazenada**; para captura, se o símbolo não foi capturado não há filtro que o traga. **Com D-00 resolvido o conserto é definitivo**, porque `!forceOrder@arr` desnuda **Q5 e Q6** de poder sobre a captura |
| **Q7** | Bybit entra nesta fase | **não-bloqueante** | nada em F0–F4 | antes da primeira linha de Bybit gravada | **`md.instrument` cross-venue e unidade normalizada na borda são requisito independentemente da resposta.** Se "não", `bybit-v5` continua valor de enum com **zero linhas**. Medido: Bybit publica `fundingInterval` em **minutos** (`{240:408, 480:383, 60:2}` em 793 LinearPerpetual) e **33 de 464** strings comuns divergem (**7,1%**) |
| **Q8** | fuso de exibição e fronteira do dia | **inferível** para F0–F2 — ver §9 | nada | **antes de F4** (marcação de fixture) | **armazenamento é sempre UTC, fixado independentemente da resposta.** Fixture marcada antes da resposta vira remarcação ⇒ o prazo é o da marcação, não o de hoje |
| **Q9** | retenção de tick (símbolos × dias × disco) — **REFORMULADA 2× em R1 e MORTA COMO PERGUNTA INDEPENDENTE em R2** | **MORTA na forma de orçamento de disco; sobrevive como CONSEQUÊNCIA de Q20** | nada — a fila de ETL passa a ser dimensionada por **relógio**, não por disco | — | **Por que morre, e é aritmética publicada (§7.4), não opinião:** o histórico inteiro **em bucket** — universo inteiro, profundidade medida, OI a 5 min mais `klines` a 1 min — cabe em **~87 GB UMA VEZ** (`metrics` 11.531 B/dia/símbolo + `klines 1m` 58.262 B/dia/símbolo × 570 × 2.183, `curl -sI` em 2026-08-18). **A resposta é "guarde 1 min de tudo"**, e ela custa menos que um terço de **um ano** dos 240 GB de tick que a pergunta orçava. **O que sobrevive, e é o único resíduo: `aggTrade` CRU.** E ele **não é decisão de disco** — é decisão de **escopo de detecção**: só é necessário se a fase seguinte introduzir **absorção por tamanho de trade**, sweep intrabar ou avaliação sub-minuto, **e é exatamente isso que `Q20` decide** (§0.3.3/item 2). ⇒ **Q9 deixa de ser pergunta ao owner e vira consequência de Q20.** **Correção de argumento que R2 registra:** quem dispensa **capturar** tick é o dump ser **re-baixável desde 2019-12-31**; o 98,44% de desempate SL-vs-TP por 1m dispensa **computar** sobre tick. **Dois argumentos, duas decisões** |
| **Q10** | ordem: monitorar / pesquisar / executar | **não-bloqueante** | decide qual superfície ganha teclado e densidade em F4 | antes de F4 | **F1 entrega "pesquisar" e é a única construível hoje** — as outras duas dependem de topologia do balde não testada e de regra de estratégia diferida. A ordem muda **prioridade**, não a fatia F1. **R2: o direcionamento operacional encolhe o obstáculo técnico de "monitorar" sem responder a pergunta.** *"Não é HFT, decisão no fechamento do bucket, prazos 15m/1h/4h"* `[PREMISSA-OWNER]` ⇒ **"monitorar" não precisa de transporte sub-minuto**, e a topologia do balde (2,85 vs 14,25 min/varredura) **deixa de ser impedimento para 1h e 4h** e continua sendo para 5m e 15m em varredura transversal. **O ranking continua sendo do owner**; o que mudou é que a resposta "monitorar primeiro" ficou **construível para os prazos longos** |
| **Q11** | owner marca o corpus? quantas horas/semana | **não-bloqueante** nesta fase (**trava a fase seguinte**) | nada em F0–F3; **define se o modo de marcação fica em F4** | antes de F4 | **`<Anotacao>` + `pointer_mode` são requisito de arquitetura hoje, com custo de campos num JSON.** Se a resposta for "não vou marcar", o **modo** sai de F4 e **a fase seguinte precisa de outro plano de verificação — que não existe hoje** |
| **Q12** | `MATIC→POL` / `RNDR→RENDER` são série contínua | **não-bloqueante** | nada | antes do primeiro backtest que atravesse a data | **o mecanismo (`instrument_alias` YAML com `evidence_url`) é requisito de qualquer jeito**; a resposta é o **conteúdo** de ~5 linhas/ano |
| **Q13** | cor do candle: convencional ou divergente | **não-bloqueante** | nada | antes de F1 renderizar preço | **requisito que a torna barata: cor é token nomeado por papel desde a primeira linha de CSS** ⇒ trocar o esquema é trocar 2 tokens. E o que **já está decidido independentemente da resposta**: **cor de status nunca é marca de gráfico** (`#d03b3b ↔ #eb6834` reprova em ΔE 10,8) |
| **Q14** | idioma da UI | **inferível** — ver §9 | nada | — | identificadores de série **não se traduzem** — **e R1 acrescenta a consequência de domínio que faltava** (D-17): **serialização de numeral em qualquer caminho de dado é invariante de locale** (ponto decimal, sem separador de milhar), porque senão o fixture *"byte-idêntico ao que o gráfico exibiu"* **deixa de ser byte-estável** entre `LANG=pt_BR.UTF-8` e `LANG=C`. pt-BR fica **exclusivamente** em microcopy e rótulo de eixo |
| **Q15** | ToS de Binance, Bybit, Coinalyze | **não-bloqueante** (**não trava nada tecnicamente**) | nada | **antes de a acumulação virar volume** | **`[MEDIDO]: nada — os ToS dos três não foram lidos por ninguém. Zero evidência.** Qualquer restrição incide **retroativamente** sobre exatamente o ativo que Q1/Q4/Q5 mandam acumular. O custo de descobrir tarde é **proporcional ao que Q1 já acumulou** |
| **Q16** | dono de julgamento de `charts`/`web` + regra em `frontend/` | **não-bloqueante**, com **prazo corrigido DUAS vezes** | a **revisão** da primeira linha de frontend | **R1: antes de F0** — porque a parte gateante de F5 inclui `[test_cmd]`, e **as condições de pronto de F0 já são testes**. O prazo do lado de `frontend/` continua sendo *antes do primeiro `.tsx`*, que é F1 (ou F0 sob §13.1) | nenhum. Descobrir depois de 3.000 linhas de Next.js **é o cenário caro**, e é onde **todo o sistema de honestidade do dado especificado nesta rodada vai morar**. **E R1 mediu que fechar a lacuna tem duas partes obrigatórias, não uma** — ver `CA-F5-4` |

| **Q17** *(nova em R1)* | **spread: medir (`bookTicker` ao vivo) ou assumir (`bookDepth` + premissa)?** | **não-bloqueante**, **capture-or-lose** | nada tecnicamente; **mas o dia 1 de captura de spread é hoje ou nunca para o período coberto** | **hoje**, junto com Q1 — `bookTicker` saiu do dump em **2024-03** e não volta | **a premissa de spread é carimbada em todo resultado de backtest e nunca dissolvida no número.** Isso torna a resposta tardia **honesta**, não barata: o resultado existe, rotulado, e o número não finge |
| **Q18** *(nova em R1)* | **profundidade do backfill do dump `metrics`: 30 d ou 2.183 d?** | **não-bloqueante** | nada — **é o oposto de urgente**, o dump é re-baixável | quando o disco e o host de Q2 forem conhecidos | **a fila é retomável e a profundidade é parâmetro dela** (`CA-F0-5`) ⇒ começar por 30 dias e estender depois **não é retrabalho**, é a mesma fila com outro limite. **4,1 h contra 297 h sequenciais** |
| **Q19** *(nova em R1, ampliada em R2)* | **`availability_probe_set`: quais símbolos e endpoints ganham `available_at` OBSERVED?** | **não-bloqueante** | **o probe de F0** (e só ele) | **hoje**, junto com Q1 — **latência de campo não é derivável retroativamente** | **`availability_source` é carimbado POR LINHA** ⇒ o que ficar fora nasce `MODELED` e **conservador por construção** (§5.1/D-04), não nasce errado em silêncio. **O que não se recupera é a medição do período em que o símbolo ficou fora.** **R2 amplia o conjunto candidato, e por uma razão de mecanismo:** os **endpoints da Coinalyze** têm de entrar no conjunto, porque **é o terceiro termo do predicado de quarentena (`available_at IS NULL`) que a mantém isolada** (§5.2/E-03) — provar que `bv` é a grandeza certa **não** a tira da gaveta; medir a defasagem dela é o que tira. **Restrição nova a declarar junto: o balde da Coinalyze é 40 chamadas/min E é CEGO** (zero header de cota no `200`) ⇒ o probe dela consome de um orçamento que não se pode auditar pela resposta |
| **Q20** *(nova em R2)* | **A fase de estratégia detecta SMC, detecta pivôs + Fibonacci, ou os dois?** | **não-bloqueante nesta fase** (**trava a estimativa da seguinte**) | **nada em F0–F4.** Decide **o primitivo de `<Anotacao>`** e, por consequência, **se `aggTrade` cru volta a ser requisito** (Q9) | **antes de F4** (o modo de marcação) e **antes de estimar a fase seguinte** | **Duas coisas ficam fixadas hoje, e as duas são independentes da resposta.** **(i) O primitivo compartilhado é o SWING** — pivô é definição de swing, âncora de Fibonacci é par de swings, BOS/CHoCH é rompimento de swing, BSL/SSL é extremo de swing; **fixada a definição de swing, os níveis de Fibonacci são aritmética pura, sem parâmetro novo**. ⇒ o primeiro primitivo de `<Anotacao>` é **`swing_point`**, e **a primeira tranche de horas de `Q11` é marcação de SWING — trabalho que sobrevive a qualquer resposta**. **(ii) A escolha da série de preço decide ONDE O SWING ESTÁ** (`price_use = structure_detection` → `klines_last`, §5.5/D-11: a ordenação de highs vizinhos **inverte em 2,09%** entre mark e last) ⇒ **`price_source` por uso é requisito sob as duas respostas**. **O que a resposta MUDA:** o vocabulário de zona (OB/FVG contra retração/extensão), **o corpus de zonas** — que **não** se reaproveita entre os dois — e se **absorção por tamanho de trade** entra, o que reabre `aggTrade` cru |

### O que NÃO é pergunta do owner — e não entra como item de PRD

Estas são **medição ou decisão do time**; colocá-las na lista do owner é passar para ele uma conta que é nossa (`decisoes-do-owner` §final): **`lag_ms` real por endpoint** (fecha com M-1, 90 min — CA-F0-3) · **topologia do balde** (rampa até o primeiro 429 — CA-F0-4, **não é diferível**) · **motor de armazenamento** (ADR de F4) · **transporte de leitura e `max_staleness_ms` por série** (ADR, achado A3) · **`field` canônico, limiar, matriz, detectores SMC** (diferidos por declaração do owner).

**Fora do julgamento do time, por declaração:** escolha de exchange/corretora como decisão financeira · tamanho de posição e gestão de risco · jurisdição e regulação · se `MATIC→POL` deve ser série contínua para efeito de capital · se pagar assinatura de histórico vale o preço.

---

## 9. `[INFERRED]` — três, com motivo e custo de reversão

Nenhuma destas é unknown crítico: **as três são derivadas de convenção já declarada no repositório ou nos documentos, e as três se revertem sem migração de dado.** Todo unknown crítico está em §8 como pergunta, não aqui.

**`[INFERRED: Q6 — universo é cripto-perpétuo; TradFi fica fora por default]`**
*Motivo:* **todo** percentil, distribuição e bloco de universo medido nas três rodadas usa cripto-perp como denominador (570 perp TRADING / 527 USDT; o like-for-like de 21,6% é explicitamente "só cripto-perp"). Inferir o contrário **invalidaria todas as fixtures publicadas**. Os **170 `TRADIFI_PERPETUAL`** têm distribuição de funding **invertida** (`{8h: 158, 4h: 12}`) e mudam todo percentil transversal — o mesmo BTCUSDT sai de **p69,47** para **p76,00** conforme o denominador.
*Custo de reversão:* **CORRIGIDO em R1 — a frase antiga (*"custo de reversão: um filtro"*) era FALSA na perna de captura.** Filtro reverte **série armazenada**; **não reverte captura**: o que não foi capturado não volta por filtro nenhum. **Com D-00 resolvido o conserto é definitivo:** `!forceOrder@arr` cobre mercado inteiro, logo **Q5 e Q6 perdem poder sobre a captura**, e **só então** a inferência passa a ser, de fato, um filtro de leitura. Persistidos por linha: `contractType`, **`underlyingSubType`** (que distingue `TradFi` 175, `Pre-IPO` 2, `ETF` 1 — `contractType` sozinho não), e o universo derivado do dado em todo número transversal (CA-F4-8). **Denominador afetado acrescentado em R1: `CA-F4-12`** — a taxa de erro do countdown de 8h é **434/570 (76,14%)** no universo cripto-perp e **446/740 (60,3%)** no combinado. Uma frase do owner encerra.

*Objeção que o validador de domínio levantou e DERRUBOU com medição — registrada aqui para não ser reaberta:* a hipótese era que TradFi perpétuo teria **calendário de sessão** (fecha fim de semana) e que isso exigiria política de ausência própria. **Não procede:** TradFi perpétuo na Binance negocia **24/7**, e em **2026-08-23 (domingo)** `TSLAUSDT` e `XAUUSDT` têm **288 buckets de `metrics`, 288 `klines`, ZERO buckets com volume 0, e OI mudando em 287/287** `[MEDIDO]`. **Não há consequência de calendário de sessão**; a política de ausência por `nature` (§7.2) basta. **Q6 não é unknown crítico disfarçado.**

**`[INFERRED: Q8 — exibição em UTC em F0–F2; armazenamento em UTC sempre]`**
*Motivo:* a grade do dump, os buckets e o funding são UTC por construção (`nextFundingTime % (h·3600000) == 0` em **570/570**), e "dia UTC" já é a âncora default escrita no título. **`America/Sao_Paulo` como default de exibição continua decisão aberta do owner** e não é inferida aqui.
*Custo de reversão:* **rótulo de eixo e chip de sessão**, enquanto não houver fixture marcada. O prazo real é **F4** (marcação), não hoje — e é por isso que a inferência é segura para F0–F2 e **não** para F4.

*O que o validador de domínio testou e não achou — registrado para não ser reaberto:* a hipótese perigosa era que **`cvd_anchor = DiaUTC` seguisse o fuso de EXIBIÇÃO** e, com isso, **invertesse o sinal do CVD** (a inversão existe e está medida: −1265,982 / +399,745 / +1598,508 conforme a âncora). **Ela não procede:** `DiaUTC` está travado **no nome do construtor do tipo-soma** (§5.5) — não é parâmetro de tela — e `nextFundingTime % (h·3600000) == 0` em **570/570**. **Nada a corrigir em Q8.**

**`[INFERRED: Q14 — microcopy em pt-BR, com identificadores de série não traduzidos]`**
*Motivo:* convenção declarada do repositório — `harness.toml`, os cinco documentos de discovery e a saída do próprio mecanismo são pt-BR, e o discovery registra que a microcopy foi escrita em pt-BR "por consistência, escolha default, não decisão".
*Custo de reversão:* i18n é retrofit conhecido; e `funding`, `open interest`/`OI`, `taker`, `aggTrade`, `CVD` **não se traduzem em nenhuma das duas respostas** — são identificadores de série.

*Consequência de domínio que R1 acrescenta, e que a inferência original NÃO nomeava* (D-17): **o separador decimal num caminho de dado.** A porta 7 exige fixture **byte-idêntica ao que o gráfico exibiu**, e a aritmética canônica é `Decimal` **sobre a string crua** (CA-F1-9). **Se locale entrar em export, payload, hash, CSV de reprodução ou `run_registry`, o fixture deixa de ser byte-estável** entre `LANG=pt_BR.UTF-8` e `LANG=C` — e um fixture que não é byte-estável **não é fixture**, é uma opinião com `sha256`.

**Requisito, uma linha, e vale em §9 e em §7.4: serialização de numeral em QUALQUER caminho de dado (fixture, export, API, hash, `run_registry`) é INVARIANTE DE LOCALE — ponto decimal, sem separador de milhar. pt-BR aplica-se exclusivamente a microcopy e rótulo de eixo.**
*Teste:* exportar o mesmo fixture com os dois `LANG` e comparar `sha256sum` — **iguais, ou reprova**.

---

## 10. GAPs nomeados por esta rodada — **6 na original, 8 em R1**

Varredura das dimensões da skill de `/pm` contra os três documentos. **`[COBERTO: fonte]`** quando o discovery já fecha; **`[GAP]`** quando **nenhuma das seis fases carrega o item como entregável**. **Nenhum destes é pergunta de owner** — entram aqui nomeados, para o arquiteto adjudicar. **R1 acrescentou `G7` e `G8`, e mudou o prazo de dois: `G2` passa a ser pré-requisito de F0, e `G6` virou `CA-F0-8`.**

| dimensão | veredito |
|---|---|
| volumetria e escala | **`[COBERTO]`** — exaustivo. 1,31–4,80 M linhas/dia/símbolo, p50/p95/p99/p99.9/max de msg/s, 980 prefixos S3, 240 GB/ano a 20 símbolos, 0,86 s/arquivo, 4,1 h e 14 h de fila |
| estados e casos de borda | **`[COBERTO]`** — fora de ordem (13/30), duplicado (`agg_id`, 184/ms), remoção (21,6% do universo, delisting em 2 dias), parcial (bucket em formação, 77,4%), vazio (0 seleção como informação), lacuna (285/288), renomeação (MATIC→POL) |
| requisitos não-funcionais (frescor) | **`[COBERTO com um `[NÃO MEDIDO]` declarado]`** — `available_at` medido com n=2, `lag_ms` real pendente de M-1, e a tela obrigada a dizer `idade ?` enquanto isso |
| escopo e non-goals | **`[COBERTO]`** — §3, §12 e um bloco "O que NÃO faz" por fase |
| contrato e dependências | **`[COBERTO]` com dois furos** → **G3**, **G4** |
| observabilidade | **`[COBERTO]` no dado** (`md.ingest_run`, `md.ingest_gap`, `janela_de_perda`, contiguidade) **e furado no processo** → **G1**, **G2** |
| stakeholders e consumidores | **`[GAP]`** → **G5** |
| integridade e durabilidade | **`[GAP]`** → **G1** |
| relógio do host | **`[GAP]`** → **G6**, promovido a `CA-F0-8` em R1 |
| **frescor, segunda leitura (R1)** | **`[GAP]`** → **D-05**: a dimensão estava marcada `[COBERTO]` porque **`lag_ms` era medível**; o que não estava coberto é que **F0 não capturava `available_at` OBSERVED em regime**, e no universo inteiro é **aritmeticamente impossível**. Fechado por `CA-F0-9` + **Q19** |
| **rede e localidade do observador (R1)** | **`[GAP]`** → **G7**. `available_at` é propriedade de `(mercado, observador, caminho de rede)`; a `avaliacao` §Anexo 10 nomeou "região/RTT" e **nenhuma fase absorveu** |
| **rastreabilidade entre rodadas (R1)** | **`[GAP]`** → **G8**. Nenhum ID estável por achado, colisão de namespace medida (`A3` em dois documentos), e o "89" que não reconcilia |
| **custo de execução (R1)** | **`[GAP]`** → **D-07 / Q17** (spread, capture-or-lose) e **D-13 / `CA-F2-14`** (`fee_schedule` datada). **Nenhum backtest é defensável sem os dois**, e a rodada original não carregava nem um |
| **identidade de série sob fonte com semântica OHLC (R2)** | **`[GAP]`, e era `[COBERTO]` por engano** → **E-04**. `SeriesKey` tinha `ts_convention` com **dois** valores e **nenhum termo de `reduction`** ⇒ as **quatro** séries de OI da Coinalyze e a **uma** da Binance colapsavam na **mesma identidade**. Fechado em §5.2 + `CA-F2-17`. **Classe do defeito: identidade insuficiente, e a correção depois é migração de identidade — não coluna nova** |
| **granularidade declarada pelo consumidor (R2)** | **era `[GAP]` implícito, fechado por PREMISSA** → o owner declarou **15m/1h/4h** de operação e **1m/5m/15m** de avaliação `[PREMISSA-OWNER]`. Antes disso, **toda decisão de grade neste PRD era escolha do time vestida de requisito** — inclusive o *"80% das barras de 1 min sem OI"* que reorganizou a rodada de UX. **Todos os prazos declarados são múltiplos inteiros de 1 min** ⇒ 1 min é a grade canônica suficiente, e §7.4 mostra que ela custa **~72 GB uma vez** para o universo e a profundidade inteiros |
| **escopo de detecção da fase seguinte (R2)** | **`[GAP]` que NÃO é do time** → **Q20**. `proposta-discovery` §Módulo B nomeia SMC; o direcionamento nomeia pivôs + Fibonacci + volume, e **não menciona SMC**. **Não é inferível** (§8/Q20) — e o que é fixável hoje sob qualquer resposta é o **primitivo `swing_point`** e a primeira tranche de `Q11` |
| **fonte de dados sem NENHUMA medição (R2)** | **`[GAP]`** → **`Coinglass`**. O direcionamento a nomeia como candidata a par da Coinalyze. **Zero medição: nem doc lida, nem endpoint chamado, nem key.** ⇒ **nenhum requisito deste PRD depende dela, e nenhum pode passar a depender antes de o mesmo protocolo rodar** (o que a Coinalyze acabou de mostrar: 11 chamadas derrubaram cinco afirmações que dois documentos repetiam). **É a lacuna mais barata de fechar de todas — e a única cujo custo de NÃO fechar é zero, porque nada depende dela hoje** |

### `[GAP G1]` — integridade de download e durabilidade do que não é re-baixável · **severidade: alta**

`md.ingest_run` guarda `src_sha256` e o ETL deduplica por hash de conteúdo, **mas nenhuma fase verifica o `.CHECKSUM` que a Binance publica ao lado de cada objeto**, e **nenhuma fase tem política de backup com teste de restauração**. **Download truncado é silencioso e produz série curta, não erro.** E o ativo que F0 existe para capturar — liquidação, funding estimado, `available_at` OBSERVED, snapshot datado — **não é re-derivável de dump nenhum**: perder o volume perde isso para sempre.
*Fecha com:* verificação de checksum obrigatória na ingestão (fixture: **corromper um byte e exigir rejeição**) + política de backup com **teste de restauração**, declarando **por tabela** o que é re-derivável dos dumps e o que não é. Origem: `avaliacao` §Anexo 7 — levantado lá e **não incorporado por nenhuma das fases**.

### `[GAP G2]` — não existe runner de teste, e toda condição de pronto é um teste · **severidade: alta**

`harness.toml` declara `[test_cmd]` **ausente de propósito** (não há suíte, runner nem `pyproject.toml`) e **não há CI**. Este PRD tem **~99 critérios de aceite conferíveis** (~80 na rodada original + 15 em R1 + **4 em R2**: `CA-F0-13`, `CA-F0-14`, `CA-F2-16`, `CA-F2-17`) e §16 lista **54 medições** que devem virar regressão (**40 em R1 + 14 em R2** — ver §2 para a composição, que distingue medição nova de medição corrigida). **Sem runner, as invariantes existem no documento e não no repositório** — e a mais barata delas (ordenar o CSV de `metrics`) é a que, se esquecida, **envenena o screener em silêncio** (19 disparos falsos contra 0 reais).
*Fecha com:* `[test_cmd]` e o primeiro teste nascendo **junto com F0 — corrigido em R1, era F1** (as condições de pronto de **F0** já são testes: `CA-F0-3`, `CA-F0-4` e `CA-F0-5` são todos testes); a métrica de progresso é `testes / medições publicadas` (hoje **0/54** — §2 traz a composição). **Nota:** `harness install-hooks` dá portão de **regras** no pre-push — isso **não** é portão de teste, e confundir os dois é o modo de falha que este GAP descreve. Origem: `avaliacao` §Anexo 9. **Estado conferido em R1:** `harness policy --key test_cmd` → **`{}`**.

### `[GAP G3]` — série canônica de preço **por uso** · **severidade: alta**

Existem **quatro** séries de preço no mesmo repositório de dumps — `klines`, `markPriceKlines`, `indexPriceKlines`, `premiumIndexKlines` — e no **mesmo bucket** (1787443200000) o last price abre em **77084.50** e o mark price em **77084.01** `[MEDIDO]`. **SMC se desenha em last price; liquidação e funding acontecem em mark price.** O `faseamento` exige que a escolha seja "declarada, não implícita", e F1 nomeia `price_source = REST klines 5m` para a S2-mínima — **mas nenhuma fase carrega a declaração por USO** (estrutura/detecção · execução · liquidação · custo) como requisito do `series_catalog`, e nenhuma fixa a invariante de candle fechado.
*Fecha com:* `price_source` **por uso** no catálogo (§5.5, tabela `price_use` → `price_source`), `open_time` como início do bucket declarado, e **teste que reprova leitura de candle com `close_time > t_decisão`** — que em R1 **é a invariante R-2** (§5.1), e portanto **deixa de ser item solto e passa a ser tipo**. Origem: `avaliacao` §Anexo 5. **Nenhuma das cinco lentes da avaliação auditou o candle.**

**R1 · D-11: G3 é MAIOR do que esta seção dizia, e MAIS BARATO de fechar.** Maior, porque a divergência não é de precisão: **o bucket que contém o high do dia é diferente nas duas séries** (last **78057,60** às 20:05Z, mark **78017,83** às 20:10Z), a **ordenação de highs entre buckets vizinhos inverte em 2,09%** dos pares e a de lows em **5,57%** — e **ordenação de high/low vizinho é a primitiva de swing, BOS/CHoCH e sweep** ⇒ **a escolha da série decide ONDE O SWING ESTÁ**. Mais barato, porque **`sum_open_interest_value / sum_open_interest` É o `markPriceKlines.close` do mesmo bucket, exato a 8 casas, 288/288** ⇒ **o dump `metrics` que a plataforma já ingere carrega mark price em grade de 5 min, 2.183 dias, 570/570, de graça**, e ainda entrega uma **fixture de tolerância zero** (CA-F2-15) mais forte que a que este PRD usava. **Efeito colateral obrigatório:** `implied_avg_price` está **renomeado para `price_mark_close`** — o nome antigo *"preço médio implícito"* **ensina errado, e o catálogo de séries é o veículo de propagação**.

### `[GAP G4]` — atribuição obrigatória do Lightweight Charts · **severidade: baixa, custo de esquecer alto**

`lightweight-charts@5.2.1` é Apache-2.0 **e a doc oficial diz que a licença *requires* especificar a TradingView como criadora do produto**, com a notice do arquivo `NOTICE` e o link para tradingview.com **numa página pública** `[MEDIDO no npm + DOC]`. **É obrigação de produto que nasce na primeira tela — F1** — e **nenhuma fase a carrega**.
*Fecha com:* item de aceite em F1 (`CA-F1-15` a criar). Nasce em `frontend/`, **a área sem regra** — o que a acopla a Q16 e a `[GAP G2]`. Origem: `avaliacao` §Anexo 11.

### `[GAP G5]` — stakeholders: operação de um só, com SLO P1 de 24 h · **severidade: média**

O discovery declara um único humano (o owner) e nomeia os consumidores de máquina (`backtest`, `convergencia` lendo `as_of`). **Q3 pergunta o canal do alarme; ninguém perguntou quem o recebe quando o owner está indisponível.** Um SLO **P1 com orçamento de 24 h** sobre um ativo **capture-or-lose**, operado por uma pessoa, sem segundo destinatário e sem runbook, **é risco de stakeholder, não de tecnologia**: o alarme dispara para uma pessoa que pode estar num voo, e a perda é permanente.
*Fecha com:* declaração de quem é notificado em segundo lugar (ou aceitação explícita e escrita do risco), e um runbook de uma página para "coletor parado" com o passo que reduz a perda. **Não é decisão de negócio grande; é uma linha que hoje não existe.**

### `[GAP G6]` — relógio do host e NTP como dependência de runtime · **severidade: alta**

**`available_at` OBSERVED é o ativo mais precioso desta fase, e é carimbado pelo relógio local.** O `recorte` já declarou a consequência (`IN-13`, `available_at >= event_time` a 100%, **derruba ingestão ao vivo por skew de NTP**, e "falta `clock_skew_tolerance_ms` medido") — **mas nomeou o sintoma sem que nenhuma fase carregue a dependência**. Um relógio errado no host **envenena silenciosamente** exatamente o dado que não se recaptura, e o pack `core` não tem nada a dizer sobre isso.
*Fecha com:* **`CA-F0-8` — R1 promoveu este GAP a critério de aceite de F0**, porque o ativo que ele protege **nasce em F0** (estava endereçado a F3, `CA-F3-13`). NTP como dependência de runtime de F0; monitor comparando o relógio local com `/fapi/v1/time` e **alarmando acima de um limiar declarado**; e a correção que torna o critério atendível: **`clock_skew_tolerance_ms` NÃO é medível antes de o coletor rodar** ⇒ **F0 persiste o skew por `ingest_run`** e **F3 calibra a tolerância** sobre a distribuição acumulada. Exigir o valor medido em F3 sem F0 persistir nada era **impossível de atender**. Referência de doc para a ordem de grandeza que importa: `recvWindow` "defaults to 5000" e a regra de aceite `if (timestamp < serverTime + 1000 && serverTime - timestamp <= recvWindow)` `[DOC]` — relevante para a fase de execução, mas **o skew que corrompe `available_at` é problema de hoje**. Origem: `recorte` §2.1 item 6 + `avaliacao` §Anexo 2, reunidos aqui como dependência de fase.

### `[GAP G7]` — RTT e região do observador como dimensão de schema · **severidade: alta, e a janela fecha em F0**

**Dimensão perdida entre rodadas** (validador de protocolo): `available_at` **OBSERVED não é propriedade do mercado — é propriedade de `(mercado, local do observador, caminho de rede)`.** Os dumps vivem em **`ap-northeast-1`**; um host em **São Paulo** e um em **Tóquio** produzem `available_at` **sistematicamente diferentes**, e a tabela de defasagem de `CA-F0-3` **não é portável se o host mudar** — o que é um cenário provável, dado que Q2 ainda não foi respondida. A `avaliacao` §Anexo 10 nomeou *"região/RTT"* como uma das duas palavras do §3 que ninguém preencheu, e **nenhuma fase absorveu**.
*Fecha com:* **`CA-F0-10`** — `observer_id` e `observer_region` como **colunas** ao lado de todo `available_at`, mais `clock_skew_ms` por `ingest_run` (`CA-F0-8`). **É uma coluna hoje e é impossível retroativamente**, exatamente como `available_at`.

### `[GAP G8]` — rastreabilidade: nenhum documento carrega ID por achado, e há colisão de namespace · **severidade: média, custo de esquecer alto**

Depois do re-particionamento em três rodadas, **nenhum documento carrega identificador estável por achado**, e existe **colisão de namespace medida**: `A3` em `docs/plataforma-superficies-e-faseamento.md` significa **"transporte de tempo real, não decidido"**, enquanto `A3` em `docs/avaliacao-discovery.md` significa **"ausência de telemetria de cota exatamente onde o screener vive"** — e **§8 deste PRD citava "achado A3" sem qualificar qual**. `C1`/`C3`/`C4` colidem do mesmo jeito. Além disso **o "89 achados" não reconcilia** (ver §18).
*Fecha com:* **§18** — esquema de ID estável com mapeamento para documento e seção de origem, namespace qualificado por documento, e a contagem auditada substituindo o "89".
*Ressalva de precisão que R1 registra e R2 fecha:* o validador de protocolo atribuiu a colisão a `insumo-para-ux.md`. **Esse arquivo não é documento deste repositório — é arquivo de scratchpad** (`plataforma-superficies-e-faseamento.md` l.434 o referencia sob `/tmp/.../scratchpad/`), **confirmado pelo owner em R2**. O documento que colide é **`docs/plataforma-superficies-e-faseamento.md`**. **A colisão é real; o arquivo apontado não era.** **Regra que fica: documento de scratchpad não é citável como fonte** — ele não sobrevive à sessão, e um PRD que o cita fica com uma referência que ninguém consegue abrir.

---

## 11. Registro da varredura — o que foi perguntado e o que ficou aberto

Para que a próxima pessoa não re-interrogue o owner do zero.

- **Discovery Interrogation: JÁ ACONTECEU.** Três rodadas, 33 agentes: `proposta-discovery` → `avaliacao-discovery` (**89 achados por classe de verificação; a contagem não reconcilia — §18.3**) → `recorte-plataforma` (68 plataforma / 21 diferidos, contrato de dados em 4 definições, todas `SOLIDA_COM_CORRECOES`) → `plataforma-superficies-e-faseamento` (4 desenhos de superfície + 4 validações adversariais, **todos `SUSTENTADO_COM_CORRECOES` — nenhum passou intacto**).
- **As 16 perguntas de `decisoes-do-owner.md` são o produto dessa etapa**, já consolidadas e deduplicadas (o mapa de deduplicação está no próprio documento, §final). **A rodada original não re-perguntou nada ao owner e não acrescentou pergunta nova.** **R1 acrescentou três — Q17, Q18, Q19 (§8) — e nenhuma delas nasceu de pergunta: as três nasceram de FATO MEDIDO** (`bookTicker` 404 no dump desde 2024-03; o dump `metrics` com 2.183 dias contra o `30` que era a janela do REST; e o balde de 200 req/min que torna o probe de universo inteiro aritmeticamente impossível). **Total: 19.**
- **A rodada original acrescentou 6 GAPs (§10)**, nenhum deles pergunta de owner: cinco são trabalho de time (G1, G2, G3, G4, G6) e um é declaração de risco de uma linha (G5). **R1 acrescentou dois: `G7` (RTT/região do observador — coluna de F0, impossível retroativamente) e `G8` (rastreabilidade e colisão de namespace, fechado por §18). Total: 8, e nenhum é pergunta de owner.** **Dois mudaram de prazo:** `G2` passa a ser pré-requisito de **F0** e `G6` virou **`CA-F0-8`**.
- **Nove desenhos foram derrubados por medição** e estão registrados como derrubados, não como acordo (`faseamento` §2 e §3.3): ponto+trilho na aritmética original · painel de OI desabilitado acima da grade nativa · `FLOW → sum()` no taker · fixture "3 vãos" · âncora "início do swing" · `max_staleness` justificado por erro de nível · `MODELADO` para valor derivado · porta única de leitura · toggle binário de colunas · varredura ao vivo · fixture de CVD via `awk` · fixture "4 séries em quarentena" · escada de funding para frente · "3 dias completos de `aggTrades`".
- **Duas contradições de citação foram detectadas e resolvidas na rodada original — e R1 achou que ESTA PRÓPRIA SEÇÃO cometia a segunda.** (a) os valores de CVD `−1265,978 / +399,746` que aparecem em `decisoes-do-owner` §Q8(b) são os do `awk`, **que reprova implementação correta**; os canônicos são os do `Decimal` — **−1265,982 / +399,745 / +1598,508** (CA-F1-8, CA-F1-9). **(b) está CORRIGIDA em R1 — ver o bloco abaixo.**

### Correção R1 · D-15a — os números de §11(b) eram do `awk`, dentro do parágrafo que declara o `awk` reprovado

**Isto é o defeito mais embaraçoso desta rodada e por isso fica escrito:** o parágrafo acima diz que o `awk` reprova implementação correta **e cita os números do `awk` na frase seguinte**. Canônicos, em `Decimal` sobre a string crua de `q`, soma ordenada por `agg_id`:

| grandeza | valor canônico (`Decimal`) | valor antigo (`awk`) |
|---|---|---|
| amplitude do CVD | **2864,490** | 2864,486 |
| range da curva, bucket 1 min | **6450,412** | 6450,409 |
| range da curva, bucket 5 min | **6174,218** | 6174,215 |
| range da curva, bucket 15 min | **5904,183** | 5904,180 |

**E o enunciado também estava errado, o que é pior que os dígitos.** As três âncoras (**−1265,982 / +399,745 / +1598,508**) são **INVARIANTES AO BUCKET** — 00:00, 12:00 e 20:00 são pontos das **três** grades, logo a soma até cada uma delas não depende do bucket. O qualificador *"em buckets de 1 min"* de `CA-F1-8` **sugere que dependem, e elas não dependem**. **O que depende do bucket** é o **range da curva** e o **p90 do delta** — e é só nesses que a citação precisa carregar o bucket.

### Correção R1 · D-15b — os múltiplos "×p90" não são citáveis sem o estimador

Este PRD publicava `104,0× / 25,0× / 10,3×` como se fossem propriedades do dado. **São propriedades do dado E do estimador de percentil:**

| estimador | 1 min | 5 min | 15 min |
|---|---|---|---|
| `numpy.percentile(\|Δ\|, 90)` | **104,0×** | **25,0×** | **10,3×** |
| `statistics.quantiles` | 103,6× | 24,2× | **9,0×** |
| `numpy.percentile(Δ, 90)` (com sinal) | 173,4× | 56,3× | 16,4× |

**No bucket de 15 min (n=96) a escolha move 9,0 → 10,3 — 14%.** E a ironia é estrutural: **§5.5 deste documento EXIGE `interpolation` explícito em `Percentile{...}` precisamente porque percentil sem estimador mente.** A regra valeu para o produto e **não valeu para a citação**.

⇒ **toda razão "×p90" passa a carregar `(estimador, sobre \|Δ\| ou Δ, n)`**, e **o teste de regressão de §16 tem de FIXAR o estimador** — senão ele falha por motivo errado, o que é a pior classe de teste vermelho.
- **Verificação pendente contra doc pública, nomeada:** a **direção do acúmulo do funding** (a taxa liquidada em `T` cobre o intervalo que termina em `T` ou o que começa nele) — seção *Funding Rate* / `Get Funding Rate History`, **não lida em nenhuma rodada**. O anti-padrão da escada para frente **não depende** dela: a medição de 18,01% torna qualquer projeção para frente uma afirmação sobre intervalo não observado.
- **Segunda verificação pendente — FECHADA em R1.** A doc de *Liquidation Order Streams* **foi lida**: existe **`!forceOrder@arr`** (*All Market Liquidation Order Streams*, update speed 1000 ms `[DOC]`) ⇒ **Q5 não trava nada em F0**. **Ressalva nova, de semântica e não de escopo:** a página USDⓈ-M diz `latest`, **a COIN-M e o changelog dizem `largest`** — e se for `largest` a série é **distribuição de máximos por segundo por símbolo**. **Não-verificável hoje**; entra em `CA-F0-2` e no `[NÃO MEDIDO]` de §16.

### Registro da rodada R2 — o que foi absorvido, o que foi perguntado, e o que ficou aberto

**R2 NÃO re-interrogou o owner.** Ela absorveu **dois insumos que chegaram prontos** e produziu **uma** pergunta nova. O registro existe para que a próxima pessoa saiba o que já foi decidido e o que não foi:

- **Insumo 1 — `docs/medicao-coinalyze.md`:** medição, 11 chamadas, comandos publicados. **Tratado como insumo de discovery de igual peso aos outros quatro**, exatamente como R1 recomendou. **Ele respondeu Q4 e derrubou cinco afirmações** que atravessavam três documentos (§0.3.2).
- **Insumo 2 — `docs/direcionamento-operacional.md`:** **`[PREMISSA-OWNER: 2026-08-25]`**, não medição. **Este PM introduziu o rótulo em R2 porque a distinção estava faltando** (§0, item 5): premissa do owner **não é falsificável por medição** e **uma frase dele a substitui**; achado de medição é o contrário. Misturar as duas classes num PRD é como o *"spike de OI > 5%"* entrou na proposta — uma escolha vestida de fato.
- **Uma pergunta nova: `Q20`** (SMC contra pivôs+Fibonacci). **Ela é a única das 20 que este PM se recusa a inferir**, e a recusa é deliberada: infira-se "os dois" e a estimativa da fase seguinte dobra; infira-se "só Fibonacci" e o corpus de OB nunca é marcado. **Não há custo de reversão baixo em nenhuma das direções**, que é o teste de §9 para decidir se algo pode ser `[INFERRED]`. **Ela reprova esse teste, logo é pergunta.**
- **Uma pergunta MORREU, e está declarada morta com o motivo, não apagada: `Q9`** como orçamento de disco. **Morta por aritmética publicada** (§7.4: ~87 GB uma vez para o histórico inteiro em bucket), **e o resíduo migrou** para dentro de `Q20` em vez de desaparecer.
- **Duas perguntas ficaram `RESPONDIDA COM RESÍDUO`, e o resíduo está nomeado nas duas:** `Q4` (plano free / pago / descartar) e `Q17` (a opção **(b)** ou a **(c)** de spread — porque *"não é HFT"* elimina **(a)**, e **não** decide entre assumir e medir a 1/min).
- **Cinco correções que me chegaram e com as quais eu DISCORDEI, com o argumento, estão em §0.3.3** — e as cinco estão aplicadas no texto **na forma que eu defendo**, não na forma em que chegaram. **A mais consequente é a primeira:** `CL-4` não morre, e existe uma opção (c) que eu medi nesta rodada.
- **O que R2 NÃO fez, de propósito:** não mexeu no ledger (`PRD_DRAFT` antes, `PRD_DRAFT` depois), não criou nem editou nada no Jira, **e não escreveu uma linha sobre Coinglass como requisito** — ela tem zero medição, e um requisito que depende de fonte não medida é exatamente o defeito que a medição da Coinalyze acabou de expor em três documentos.

### Registro da rodada de validação R1 — o que dois validadores perguntaram, e o que sobreviveu

**Esta rodada NÃO re-interrogou o owner** (as três perguntas novas — Q17, Q18, Q19 — nasceram de **fato medido**, não de pergunta feita). O que houve foi **validação paralela**, e o registro existe para que a próxima pessoa não reabra o que já foi testado:

- **Validador de protocolo** (`harness-plugin:architect`): `[READY FOR SPEC]`, **0 bloqueantes**, e **13 correções de forma e prazo** — todas aplicadas (§0.1).
- **Validador de domínio** (`quant-architect`, apontado pela política via `[agents.by_component]` para `sentimento`): **`DOMÍNIO OK COM CORREÇÕES`** com **6 itens de gate** (D-01, D-02, D-03, D-04, D-06, D-08) e **12 correções não-gateantes**. **O orquestrador reconciliou os dois vereditos como GATE NÃO PASSA**, e esta revisão é a resposta.
- **Três hipóteses foram testadas pelo validador de domínio e DERRUBADAS por medição** — ficam registradas como derrubadas, não como acordo: **(a)** que TradFi perpétuo tivesse calendário de sessão (não tem: `TSLAUSDT`/`XAUUSDT` com 288 buckets num domingo, OI mudando em 287/287); **(b)** que `cvd_anchor = DiaUTC` pudesse seguir o fuso de exibição e inverter o sinal do CVD (não pode: `DiaUTC` está travado no nome do construtor do tipo-soma); **(c)** que a classificação de **Q1 e Q2** como não-bloqueantes fosse frouxa (**sobreviveu**, e o validador de domínio reforçou: com D-00 resolvido o desenho de F0 está completo o suficiente para Q1 ser **pura autorização**).
- **Duas correções existem porque a regra da casa — nenhum número sem procedência — foi violada por este próprio documento:** D-15a (números do `awk` dentro do parágrafo que declara o `awk` reprovado) e D-15b (razões `×p90` sem estimador, na seção que exige estimador para o produto). **Seis defeitos de citação em total** (D-15a–f), **nenhum invalidando conclusão** e **todos ensinando o implementador a citar errado** — que é o dano real.

---

## 12. Non-goals

**Explícitos, e nenhum deles é "talvez depois nesta fase":**

**Por escopo declarado do owner:** limiar numérico de sinal · matriz de convergência · regra de entrada/SL/TP · métrica de performance (Win Rate, Profit Factor, Max Drawdown, Sharpe) · detectores SMC (swing, OB, FVG, BSL/SSL, BOS/CHoCH) · critério de match · protocolo de walk-forward · paper trading · **execução ao vivo e entrada de ordem**.

**Superfícies adiadas, com o motivo medido:** **painel de liquidação** (sem fonte histórica em fonte nenhuma — vira **linha de coletor em S1, e o coletor liga hoje**) · **watchlist multi-símbolo ao vivo** (transporte não decidido; 4.802.005 aggTrades/dia, pico 3.468 msg/s) · **gerenciador de presets/layouts** (produto prematuro; sobrevive o bundle hasheável, que é a URL) · **dashboard de métricas financeiras** (não existe estratégia, N mínimo nem universo — seria superfície exibindo número sem universo) · **tela de curadoria de alias** (é YAML, ~5 linhas/ano) · **varredura transversal ao vivo em S4** (topologia do balde não testada) · **login/autenticação: indefinido — não construir especulativamente** (depende de Q2; localhost torna a tela código morto com superfície de ataque, exposto torna estrutura — **não sei a resposta e não desenho as duas**).

**Registro de execuções como tela própria:** cortado **como tela**, **mantido como entregável** — nesta fase "execuções" são runs de ingestão e scans: `md.ingest_run` vira lista dentro de S1, `run_registry` vira bloco de procedência anexado a cada resultado de S4.

**Consequência de plataforma que fica, mesmo com execução fora de escopo:** `env ∈ {mainnet, testnet, demo, replay}` em **toda** linha de ordem/fill desde a primeira, com chip no chrome — senão existirá um período em que dado de demo e dado real são indistinguíveis no store.

**Acrescentado em R1, e a distinção é fina mas decide escopo: MODELO de slippage é non-goal; INSUMO de slippage não é.** Calcular slippage, escolher função de impacto ou calibrar custo de execução é fase seguinte. **Mas o insumo — spread — é capture-or-lose desde hoje** (CL-4/D-07), e **`fee_schedule` datada é fato que muda no tempo e não se reconstrói** (D-13). ⇒ **esta fase captura ou declara; não modela.** E `CA-F0-12` fixa a regra que vale sob qualquer resposta de Q17: **nenhum resultado de backtest pode omitir a premissa de spread**, e ela **nunca se dissolve no número**.

**Acrescentado em R2, e são três, com o motivo de cada:**

1. **Detectores de pivô e níveis de Fibonacci continuam NON-GOAL desta fase, exatamente como os detectores SMC.** O direcionamento operacional nomeou o vocabulário; **nomear o vocabulário não move a fronteira**. O que esta fase deve é o que já devia: **`price_source` por uso** (porque a escolha da série decide **onde o swing está** — 2,09% de inversão de ordenação), **`tick_size`/`price_precision` datados** (toda tolerância de estrutura é expressa em ticks) e **`<Anotacao>` com `swing_point` como primitivo**. **Zero algoritmo, zero limiar, zero "nível".**
2. **Coinglass é non-goal desta fase, e o motivo é de método, não de escopo.** Ela tem **zero medição** — nem doc lida, nem endpoint chamado. Escrever requisito contra ela hoje reproduziria o defeito que a Coinalyze acabou de expor: **cinco afirmações repetidas por três documentos, derrubadas por 11 chamadas**. ⇒ **o mesmo protocolo se aplica antes de qualquer requisito depender dela**, e a porta que fica aberta é a que já existia — `provider` é dimensão da `SeriesKey`, não constante.
3. **`Q20` NÃO é resolvida por este PRD, e isso é non-goal deliberado.** Ela decide o que a fase **seguinte** detecta; antecipá-la aqui seria escolher a tese do owner por ele. **O que esta fase entrega é o primitivo compartilhado (swing) e a série de preço declarada por uso** — os dois insumos de que os **dois** vocabulários dependem igualmente.

**Retirado do escopo desta fase em R2, por premissa do owner:** **captura de `bookTicker` ao vivo** (topo de livro tick a tick). *"Não é HFT, não há leitura de milissegundo no livro"* `[PREMISSA-OWNER]` ⇒ a opção (a) de `Q17` sai. **⚠️ E o que NÃO sai, contra o que me foi passado: `CL-4` continua na tabela de §4** — o spread de hoje só existe se for capturado ou declarado hoje, e R2 mediu uma opção **(c)** que custa **1,67% de um balde com folga** (§0.3.3/item 1). **Retirar `bookTicker` do escopo não é retirar spread do escopo.**

**Fora do julgamento deste PRD, por declaração:** escolha de exchange/corretora como decisão financeira · tamanho de posição e gestão de risco do capital do owner · jurisdição e regulação · **e, acrescentado em R2, qual tese de estrutura de preço o produto persegue (`Q20`) — é escolha do owner sobre o próprio método, não sobre engenharia**.

---

## 13. Correções de faseamento que esta rodada propõe

Não são reescrita do `faseamento`; são **três tensões que o PM encontrou ao transformar as fases em unidades de valor**, e as três são **decisão do arquiteto**.

### 13.1 O registro cru de F0 é uma superfície — e F0 declara componente `sentimento` só

O `faseamento` declara **`Componente: sentimento`** para F0, e no mesmo parágrafo descreve o registro como **"tabela crua, sem estilo, ordenável por clique"**. **"Ordenável por clique" é browser.** Se for browser, **`web` entra em F0** — e então o prazo de **Q16** (dono de julgamento de `web` + regra em `frontend/`) é **antes de F0**, não antes de F1 e muito menos em F5.
**Duas saídas, e a escolha é do arquiteto:** (a) o registro de F0 é **relatório de texto/CLI** sobre as tabelas persistidas — `web` fica fora de F0 e o prazo de Q16 volta para antes de F1; (b) o registro é browser — e então a decisão de cobertura de `frontend/` **entra em F0** como pré-requisito. **A opção (a) parece mais barata e não perde nada do que F0 precisa** (a fila de 14 h precisa de observabilidade, não de ordenação por clique), mas é julgamento de arquitetura e não medição.

**Duas coisas que R1 acrescenta e que a opção (a) NÃO resolve de graça:**

1. **`core.print-statement` colide com o registro de CLI, e a colisão é medida.** `harness rules --mode file --path backend/src/cli/report.py` (com `print(rows)`) → `{"decision": "block", ...core.print-statement...}`. **Um relatório de CLI cuja saída É o produto viola a regra na implementação ingênua**, e §14 dizia que essa regra *"reforça CA-F0-6"* sem notar isso. Resolução barata — **registrador nomeado escrevendo em `stdout`**, que é literalmente o que a mensagem da regra pede — **mas tem de ser DECIDIDA**, não descoberta no pre-push. **Isto empurra a escolha na direção de (a) e não a favor dela**: em (b) a regra não morde, porque `frontend/` não é código para o classificador (`CA-F5-4`).
2. **O registro de F0 lê das tabelas persistidas por uma CONSULTA NOMEADA E COMPARTILHADA — a mesma que S1 usará em F3.** Sem isso, **F3 reimplementa o mesmo registro** e o repositório passa a ter **duas implementações da mesma verdade**, que divergem no primeiro `verdict` novo. Vale nas duas saídas, (a) e (b).

**Nota factual de R1 sobre F1:** independentemente de (a) ou (b), **`web` entra na linha de componentes de F1** — a S2-mínima é página Next.js, §13.1 já raciocinava assim e F1 declarava só `charts`. Já corrigido em §6/F1.

### 13.2 F5 não pode ser inteira a última fase

Dois itens de F5 têm prazo **anterior** às fases que os precedem na numeração: **a decisão de cobertura de `frontend/` vence antes do primeiro `.tsx`** (F1, ou F0 sob 13.1), e **`[test_cmd]` vence junto com o primeiro teste** (F1) — porque **todas as condições de pronto de F0 e F1 são testes** (`[GAP G2]`). **Proposta, com o prazo CORRIGIDO em R1: F5 se divide** — a parte de governança que **gateia** (ponteiro de `charts`/`web`, decisão de `frontend/`, `[test_cmd]`) vira pré-requisito de **F0, não de F1**, e a parte de **consolidação** (ADRs numerados, teste de `env`) fica onde está. Isso mantém a numeração e conserta a ordem real.

**Por que F0 e não F1** (validador de protocolo): **as condições de pronto de F0 JÁ SÃO TESTES.** `CA-F0-5` é um teste (matar o processo no meio da fila e retomar sem duplicar linha nem perder arquivo), `CA-F0-3` e `CA-F0-4` são testes (M-1 e a rampa até o primeiro 429). **Sem `[test_cmd]`, F0 termina com sete afirmações e nenhuma delas conferível por comando** — que é exatamente o modo de falha de `[GAP G2]`, aplicado à fase cujo dado não se recaptura. Medido: `harness policy --key test_cmd` → **`{}`**.

**A parte de `frontend/` mantém o prazo "antes do primeiro `.tsx`"** — F1, ou F0 sob 13.1(b) — e **R1 mediu que fechá-la tem duas partes obrigatórias, não uma** (`CA-F5-4`): globs + prefixo **e** um pack cujos `paths` casem o layout. Um `.tsx` violador hoje devolve **saída vazia, zero regras avaliadas**.

### 13.3 Q13 e Q8 deixam de ser prazo se dois requisitos entrarem hoje

**Cor é token nomeado por papel desde a primeira linha de CSS** (trocar o esquema = trocar 2 tokens) e **timestamp é sempre UTC no store, com o fuso escrito ao lado de todo timestamp exibido**. Com os dois, Q13 e Q8 param de gatear F1 e passam a ser preferência trocável. **Este é o padrão que este PRD aplica em toda a coluna final de §8:** onde possível, converter uma pergunta pendente num requisito que torna a resposta tardia barata — e dizer, quando não é possível (Q1).

**R1 acrescenta um terceiro par ao mesmo padrão, e ele é de Q14:** **serialização de numeral invariante de locale** (ponto decimal, sem separador de milhar, em todo caminho de dado) tira de Q14 o poder de invalidar fixture — sem ela, o mesmo fixture exportado com `LANG=pt_BR.UTF-8` e com `LANG=C` tem `sha256` diferente, e a porta 7 exige byte-identidade. **Uma linha de requisito converte uma pergunta de idioma num não-problema.**

### 13.4 A semântica de `!forceOrder@arr` é `[NÃO VERIFICÁVEL HOJE]`, e isso é decisão de arquitetura de captura

**Novo em R1.** D-00 desbloqueou o **escopo** (mercado inteiro existe, Q5 não trava), **e abriu uma questão de semântica que nenhuma decisão de produto resolve:** a página USDⓈ-M diz que o stream empurra o **`latest`** dentro de cada janela de 1000 ms; **a COIN-M e o changelog dizem `largest`**. **Se for `largest`, a série é distribuição de MÁXIMOS por segundo por símbolo, não de liquidações** — e **qualquer percentil de tamanho calculado sobre ela estima máximo de bloco**, que é outra grandeza com o mesmo nome, exatamente a classe de defeito que P1 e P2 (§1) descrevem.

**Não se resolve lendo mais doc** (a doc é que se contradiz) **e não se resolve medindo hoje** (não há série de referência independente). **A decisão de arquitetura é o que fazer sob incerteza**, e a proposta deste PRD é: **gravar nome do stream + data do snapshot da doc junto do payload cru** — porque é **a única forma de pinar a semântica depois**, quando a doc for corrigida ou uma segunda fonte permitir a reconciliação. **É uma coluna hoje; é impossível retroativamente.**

---

### 13.5 A estrutura F0–F5 sobrevive a R2 — e existe UMA contingência que criaria um sétimo Epic

**Novo em R2, e é a pergunta que o owner está esperando, porque decide se são 6 Epics ou outro número.**

**Veredito: a estrutura F0–F5 e as fronteiras de valor entre as fases continuam INTACTAS. Seis unidades, seis Epics candidatos, na mesma ordem.** Nenhuma fase nasceu, morreu ou trocou de lugar em R2, e **nenhuma fronteira de valor se moveu**. O que mudou foi **dentro** das fases:

| fase | o que R2 mudou dentro dela | fronteira de valor mudou? |
|---|---|---|
| **F0** | **+2 entregas** (one-shot Coinalyze `daily`; reconciliação diária de liquidação) · **+2 critérios** (`CA-F0-13`, `CA-F0-14`) · **`CA-F0-12` reescrito** (3 opções de spread, número corrigido) · **1 non-goal retirado** (*"não chama Coinalyze"*) · **1 coletor contingente** se `Q17` = (c) | **NÃO.** O propósito é o mesmo: **capturar o que não se recaptura.** O one-shot da Coinalyze **cabe nesse propósito** — o `daily` é barato e a permanência dele é `[DOC-ONLY]` |
| **F1** | **`SeriesKey` ganha `reduction`, `ts_convention` ganha um 3º valor** (E-04) · **R-2 passa a ser premissa do owner e não dedução** (E-05) | **NÃO.** Continua sendo *"o contrato temporal + a primeira fatia visível"* |
| **F2** | **+2 critérios** (`CA-F2-16` `cvd_source` com erro publicado; `CA-F2-17` `reduction` na chave) · o catálogo ganha as linhas da Coinalyze **com a quarentena preservada pelo terceiro termo** | **NÃO.** Continua sendo *"semântica declarada"* |
| **F3** | `CA-F3-9` (broker **cego**, agregação **nossa**, dois baldes cegos) · `CA-F3-10` (constante → **fórmula `pontos × intervalo`**) | **NÃO.** Continua sendo *"aquisição e persistência"* |
| **F4** | ADR de motor ganha um **terceiro candidato** (Parquet/DuckDB) com falsificador nomeado | **NÃO.** Continua sendo *"superfície e reprodutibilidade"* |
| **F5** | nada | **NÃO** |

**O que poderia ter criado fase nova e não criou, item por item, porque a pergunta merece a verificação e não só a conclusão:** a mudança de forma de `CL-1` **altera o argumento de F0, não o propósito** · o `bv` provado **acrescenta linha de catálogo em F2, não fase** · a inversão de profundidade em `daily` **é backfill de fonte, e backfill de fonte é F3** (com o one-shot antecipado a F0 por ser barato) · o OI como OHLC **é termo de tipo em F1/F2** · Parquet/DuckDB **é candidato dentro de um ADR que já existia** · os prazos 15m/1h/4h **restringem escolhas dentro de F1 e F4**, não acrescentam entregável · `Q20` **decide a fase SEGUINTE**, e o que ela toca aqui é o primitivo de `<Anotacao>`, que já era requisito.

**⚠️ A UMA contingência que criaria um sétimo Epic, e ela ficou MAIS provável em R2, não menos.** O direcionamento operacional fala de **"custos de armazenamento e processamento em NUVEM"**, e `Q2` estava registrada com a premissa *"host alimentado e conectado 24/7, single-user, **não exposto**"*. **Nuvem e não-exposto são compatíveis** (uma VM sem porta pública é as duas coisas), **e a menção a nuvem torna "exposto" um cenário mais vivo do que era.** Se `Q2` = **exposto**, este PRD já declara a consequência: **auth/TLS/multi-sessão entra como FASE NOVA, não como retrofit** (§8/Q2, §12) — em não-exposto a tela de login é **código morto com superfície de ataque**; em exposto é **estrutura**. ⇒ **6 Epics hoje; 7 se `Q2` = exposto.** Este PRD **não** desenha as duas, por declaração.

**E duas consequências de nuvem que valem sob qualquer resposta de `Q2`, porque são de schema e a janela fecha em F0** (`[GAP G7]`, `CA-F0-10`): **(i)** `observer_id` e `observer_region` são **colunas** ao lado de todo `available_at` — os dumps vivem em `ap-northeast-1`, e um host em São Paulo e um em Tóquio produzem carimbos **sistematicamente diferentes**; **(ii) e R2 acrescenta o que a coluna sozinha não resolve: a TABELA DE DEFASAGEM é chaveada por `(endpoint, observer_region)`, não por `endpoint`.** `lag_stat`, `lag_n`, `lag_resolution_s` e `lag_window` (§5.1/D-04) descrevem **um observador**; mudar de região **invalida a calibração MODELED acumulada** para a região nova, e um carimbo MODELED calibrado na região errada é **otimista em silêncio** — a direção exata que §5.1 proíbe. *(Evidência colateral e concreta, medida em R2: o `curl` a `/futures/data/*` voltou com `x-amz-cf-pop: GRU1` — borda de São Paulo. **O caminho de rede do observador é visível na própria resposta.**)*

---

## 14. Regras bloqueantes em vigor, e endereçabilidade

Medido nesta sessão com `harness rules list --severity block`: **4 regras em vigor**, todas do pack `core`.

| regra | escopo | endereçável nesta fase? |
|---|---|---|
| `core.relative-import` (forbidden-regex, escopo **code**) | `backend/src/**/*.py` | **Sim.** Todo módulo de `sentimento` importa por caminho absoluto do pacote |
| `core.silent-except` (forbidden-regex, escopo **code**) | idem | **Sim, e é requisito de domínio, não só higiene:** exceção engolida na borda de ingestão produz `verdict` ausente e lacuna não registrada — **exatamente o modo de falha que `md.ingest_gap` existe para impedir** |
| `core.print-statement` (forbidden-regex, escopo **code**) | idem | **Sim, e reforça CA-F0-6** — `md.ingest_run` e `md.ingest_gap` são **persistidos, nunca log**, e `print` não é nem log. **Mas R1 mediu uma colisão que esta linha não notava:** o **registro cru de F0 na saída (a) de §13.1 é um relatório de CLI cuja saída É o produto**, e a implementação ingênua **viola a regra**. Reproduzido: `harness rules --mode file --path backend/src/cli/report.py` com `print(rows)` → `{"decision": "block", "reason": "[BLOQUEIO] [core.print-statement] backend/src/cli/report.py:2 ..."}`. **Resolução barata — registrador nomeado escrevendo em `stdout`, que é o que a própria mensagem da regra pede — mas tem de ser DECIDIDA** antes da primeira linha de F0, não descoberta no pre-push |
| `core.hardcoded-secret` (forbidden-regex-allowlist, escopo **production**) | idem | **Sim.** A única credencial desta fase é a key da Coinalyze (Q4), lida do ambiente |

**A lacuna, declarada, não maquiada e agora MEDIDA por comportamento** (R1): `include_prefixes = ["backend/src/"]` + `include_globs = ["*.py"]` + `packs = ["core"]` ⇒ **`frontend/` nasce com ZERO regra cobrindo, e parecendo coberto**, porque o `doctor` diz CONFORME sobre um universo que não o inclui. **É exatamente onde todo o sistema de honestidade do dado especificado nesta rodada vai morar** (S1–S4, o selo, a política de ausência, a paleta). É **Q16** + `CA-F5-4` + §13.2.

**A medição que fecha a discussão, e ela derruba a solução mais óbvia:** escrevi `frontend/src/Probe.tsx` violando duas regras **por construção** (`const x: any = 1;` e `console.log(x)`) e rodei `harness rules --mode file --path frontend/src/Probe.tsx` → **saída VAZIA, zero regras avaliadas.** Motivo: as regras de `web-fullstack` declaram **`scope = "code"`** e **o classificador não considera `frontend/` código**. ⇒ **adotar um pack sozinho não resolve nada**, e o fecho tem **duas partes obrigatórias** (`CA-F5-4`): `code_paths.include_prefixes += "frontend/src/"` **e** globs TS/TSX, **mais** um pack cujos `paths` casem o layout escolhido.

**A única regra disponível hoje que morde sem depender do classificador** é `web-fullstack.server-test-directory-present` — `form = "path-presence"`, `severity = "block"`, `target = "backend/tests/**"`, **sem chave `scope`** (lido em `~/.claude/plugins/cache/harness/harness-plugin/0.6.0/packs/web-fullstack/rules.toml`). **Ressalva de precisão:** ela declara **`modes = ["sweep"]`** ⇒ dispara em **varredura de repositório, não por arquivo**, e **só depois de o pack ser adotado** (`harness policy --key packs` → `["core"]`).

**Este PRD não cita `harness doctor` CONFORME como evidência de qualidade em nenhum lugar, por esse motivo.**

**E `grep` não é aprovação** (anti-padrão 25): R-1 se verifica por **fixture envenenada** com resultado bit-idêntico (CA-F1-7), porque SQL em `.sql`, view materializada e filtro montado por ORM são invisíveis ao escopo declarado — e `**/migrations/**` está explicitamente excluído.

---

## 15. Priorização

**Ordem de execução: F0 → F1 → (F2 ∥ parte de F3) → F3 → F4 → F5**, com as correções de §13.

| prioridade | unidade | razão da posição |
|---|---|---|
| **P0** | **F0** | **Único trabalho cujo custo de atraso é irreversível.** Roda hoje, sem chave, sem decisão de universo para 2 dos 3 coletores. Gate: Q1 + Q2 |
| **P0** | **A parte gateante de F5** (§13.2) | **R1 corrige o prazo: vence antes de F0, não antes de F1** — as condições de pronto de F0 **já são testes** (`CA-F0-3`, `CA-F0-4`, `CA-F0-5`), e `harness policy --key test_cmd` → `{}`. A parte de `frontend/` mantém o prazo *antes do primeiro `.tsx`*. Custo hoje: algumas linhas de `harness.toml` + `[test_cmd]`. Custo depois: 3.000 linhas de Next.js sem regra, e uma fase F0 inteira cujo aceite ninguém consegue rodar |
| **P1** | **F1** | Contrato temporal — decide se **todo** dado gravado a partir daqui nasce certo — **e** a primeira fatia de valor visível (S2-mínima), construível **hoje, offline, com o dado já em disco** |
| **P2** | **F2** | Semântica: sem ela, `field`, coorte e unidade ficam ambíguos e o taker fica não-agregável para sempre acima de 5 min |
| **P2** | **F3** | Aquisição em regime + S1 console + S5. Parte dela (paginador, `-1130`, paginação S3) é pré-requisito de qualquer backfill grande e pode subir |
| **P3** | **F4** | Superfície completa, bancada, decisão de motor. Depende das três anteriores |
| **P4** | **F5** (resto) | Consolidação de ADRs e teste de `env` |

**O que decide a prioridade entre F1 e F3 se o owner quiser "ver o mercado agora":** a S2-mínima entrega valor **de verificação**, não operacional. **A fatia que mostra o mercado ao vivo depende de F0 (`lag_ms` medido) + F3 (coleta ao vivo) e não existe antes disso.** É **Q10**, e este PRD não a decidiu pelo owner.

---

## 16. Procedência e força da evidência

**Medições que este PRD cita e que devem virar regressão — 40 em R1** (34 na rodada original + 6 acrescentadas), com a fonte de cada uma nos documentos de origem (`faseamento` §6.1 traz o comando de cada; `recorte` §6.1 traz a base física):

CVD por âncora e por bucket · cobertura de OI por TF · lacuna de 2026-08-12 · LOCF direcional em OI (21,96% / 33,52%) · erro de nível ao segurar OI · troca de sinal do funding entre liquidações (18,01%) · intervalo e átomo de funding · soma de 3 buckets do taker (3,1809) · taker fora da escala de bins (47,2%) · `firing_rate` in-sample vs OOS · percentil transversal de funding (nenhum dá 72,2) · reconciliação dump × REST (288/288 em `Decimal`, 0/288 como string) · ordem do arquivo (19 vs 0) · vazão de `aggTrade` · buraco local de 08-22 · bucket em formação (77,4% / 90,0%) · `exchangeInfo` (570, 25 `tickSize`, 20 `^\d`, zero multiplicador, delisting em 2026-08-26) · `/fapi/v1/openInterest` só base · precisão da fonte · aritmética de pixel · custo do envelope no fio (9,6×) · paleta (3 vereditos) · shift `+300000` (MAE 0,000000, 288/288) · lookahead do taker (`r = +0,5458`) · 13/30 dias fora de ordem · 8.873.078 linhas com 0 saltos de `agg_id` · autocorrelação 0,99+ vs ~0 · 21,6% do universo desaparecido · `1000XECUSDT` 8h→1h→4h · `p99|Δ15m|` taker vs OI (1.100×) · 55,1% da variação de `sum_open_interest_value` sendo preço · `sign(Δnotional) == sign(Δpreço)` em 100% dos buckets de sinal oposto · ETL 0,86 s/arquivo · `settlement_slot` (0 fora da grade em 16.979).

**As seis acrescentadas em R1, com o comando de cada:**

1. **`mark` × `last`, divergência estrutural** — `|mark − last|` nos 288 buckets de 2026-08-23: high mediana **0,285 bp** / máx 5,842; low mediana **0,480 bp** / máx **14,430**; em ticks (`tickSize=0.10`) high mediana **21,8** / máx 456, low **37,0** / máx 1.102,8. **O bucket do high do dia difere** (last 78057,60 às 20:05Z; mark 78017,83 às 20:10Z) e a **ordenação de highs vizinhos inverte em 2,09%**, a de lows em **5,57%**. *Fixture de `price_source` por uso (CA-F1-16).*
2. **`metrics ÷ metrics == markPriceKlines.close`** — exato a **8 casas, 288/288** em dois dias de BTCUSDT; alts **282–286/288** com resíduo ≤ **4,34 bp**. *Fixture de tolerância ZERO para o shift `+300000` (CA-F2-15) — mais forte que a de 0,002516%, que comparava com a série errada.*
3. **`kline(2·taker_buy − volume)` == delta de `aggTrade`** — corr **1,000000**, **somas idênticas**, MAE **0,0443 BTC**, drift máx **2,55 BTC que reverte**; tamanhos zip no mesmo dia: `aggTrades` **33.119.895 B**, `klines 1m` **61.333 B**, `klines 5m` **13.733 B** ⇒ **540×** e **2.412×**. *Fixture de `cvd_source` por uso e de reformulação de Q9 (D-12).*
4. **`bookTicker` saiu do dump** — `daily/bookTicker/BTCUSDT/`: **200 em 2024-03-25, 404 em 2024-03-31** e depois; `monthly/`: **200 em 2024-04, 404 em 2024-06**. `bookDepth` vivo (200 em 2026-08-23, 561 KB, 34.560 linhas/dia, `timestamp,percentage,depth,notional` — **sem bid/ask**). *Fixture de CL-4 / Q17.*
5. **`premiumIndex` discorda do `exchangeInfo`** — **872 contra 875**, e os 3 extras são `EOSUSDT`, `FRONTUSDT`, **`MATICUSDT`**. **`fundingInfo` traz 20 COIN-M** (`BTCUSD_PERP`, …) ausentes do `exchangeInfo` USDⓈ-M — reproduzido no snapshot de 2026-08-25 (**765 entradas**, 20 fora). *Fixture de `universe_at` com duas testemunhas (CA-F0-1b) e da coluna `market` (D-18).*
6. **Deriva de universo em três dias** — `fundingIntervalHours` nos perpétuos `TRADING`: **`{4h:432, 8h:136, 1h:2}`** em 2026-08-22 contra **`{4h:433, 8h:136, 1h:1}`** em 2026-08-25; `TRADIFI_PERPETUAL` de **170 para 175**. Comando: `python3` sobre `data/snapshots/2026-08-25_*.json`, join por `symbol`. *Fixture de CA-F0-11 e prova de que o snapshot precisa ser datado e diário.*

**Reclassificado em R1, e sai de `[NÃO MEDIDO]`:** **`premiumIndex.lastFundingRate` NÃO é a taxa liquidada — agora MEDIDO.** Snapshot em `time = 1787606060000` com `lastFundingRate = 0.00007078`, tirado **depois** do settlement `1787587200000`, cuja taxa foi `0.00010000`. **É a estimativa corrente do intervalo em curso.** O rótulo que este PRD já usava estava certo, e **agora está medido** — vira fixture. **Achado colateral do mesmo payload:** `interestRate` vale `0.00010000` para **665** símbolos, **`0` para 208** e `0.00005` para 2 ⇒ **a massa pontual que faz `p90 = p99` muda de lugar por símbolo** (§5.6/D-15f).

**E os dois estimadores que passam a ser parte da citação, não do dado** (D-15b): toda razão `×p90` carrega `(estimador, sobre |Δ| ou Δ, n)`, e **o teste de regressão fixa o estimador** — `numpy.percentile(|Δ|,90)` dá 104,0/25,0/10,3×, `statistics.quantiles` dá 103,6/24,2/**9,0**×, e com sinal dá 173,4/56,3/16,4×.

**Base física** (`recorte` §6.1): 30 arquivos diários de `BTCUSDT-metrics` (8.637 linhas, 2026-07-25..08-23) · 21 arquivos de alts (COTI/DOGE/SLX, 6.048 linhas) · **8.873.078 linhas de `aggTrades`** em 3 dias · 120 zips de `monthly/fundingRate` (60 símbolos, **16.979 liquidações**) · `ei.json`, `fi.json`, `oih.json`, `rest_oi.json`, `tp.json`, `pi.json`, `by.json` · listagem S3 completa (980 prefixos). **A maioria foi reproduzida dígito por dígito por um segundo agente adversarial que a recomputou de forma independente.**

**`[DOC]` — doc público citado, o owner confere na fonte:** Binance *Open Interest Statistics* (`timestamp` = "End time of the period") · *Aggregate Trade Streams* ("the insurance fund trades and ADL trades won't be aggregated" ⇒ **o CVD de `aggTrade` exclui por construção o fluxo forçado, exatamente o regime de cascata**) · *Liquidation Order Streams* ("only the latest one liquidation order within 1000ms will be pushed") · WS desconecta a cada 24 h · `REQUEST_WEIGHT 2400/min` · Redis Pub/Sub at-most-once · TimescaleDB `interpolate` interpola entre anterior e posterior · ClickHouse dedupe "only during a merge... at an unknown time" · Lightweight Charts Apache-2.0 com atribuição obrigatória.

**`[MEDIDO]` — a Coinalyze SAIU de `[DOC-ONLY]` em R2, e o bloco antigo está DERRUBADO.** O texto de R1 dizia *"toda a Coinalyze é `[DOC-ONLY]`. Zero endpoints chamados. Não há API key. A retenção de 24 h a 1 min é especificação contra documentação de fornecedor"*. **Está tudo falsificado:** `docs/medicao-coinalyze.md` fez **11 chamadas, todas `200`**, com chave real (plano free, `.env`, perms 600, no `.gitignore` desde o primeiro commit).

**As nove medições da Coinalyze que passam a ser regressão** (comandos em `medicao-coinalyze.md`, uma linha cada): `/exchanges` = **28** e `/future-markets` = **5.127**, `exchange` obrigatório em cada ⇒ **não há agregado** · retenção por **contagem de pontos** (OI 1 min **2.206**, 5 min **~2.000**, `daily` **2.409**; OHLCV 1 min **1.440**; liquidação 1 min **3.052**, `daily` **730**) · **OI `daily` até 2020-01-21** ⇒ mais fundo que o dump S3 · **liquidação `daily` 730 dias** ⇒ E-01 · **`bv` = compra agressora** (mediana **0,0000 bp**, 150/699 exatos; maker refutada a **2.584,87 bp**) · **zero header de cota no `200`** · **OI como `{t,o,h,l,c}`** ⇒ E-04 · `has_buy_sell_data` e `has_long_short_ratio_data` **`true` nos 764 perpétuos** com `oi_lq_vol_denominated_in` **744 `BASE` / 20 `QUOTE`** · **`MATICUSDT` ausente, `ICXUSDT` presente**.

**⚠️ E o que a medição NÃO mediu, porque um rótulo novo não é licença para generalizar** — estes continuam `[NÃO MEDIDO]` e estão na lista abaixo: a **causa da cauda do `bv`** (p99 **29,34 bp**, máx **1.955,80 bp**; candidata nomeada e não testada: o filtro de fundo de seguro/ADL que a Binance declara excluir do `aggTrade`) · o **limite real de cota** (11 chamadas, **nenhum `429` provocado**) · a retenção de **`funding-rate-history`** e **`long-short-ratio-history`** (endpoints existem, não chamados) · **se `daily` realmente nunca é apagado** (`[DOC-ONLY]`, medido **uma vez**) · **toda divergência numérica Coinalyze × Binance para OI no mesmo bucket** (E-04 explica por que a comparação exige escolher `reduction` primeiro) · e **a defasagem de publicação da Coinalyze**, que é o que a mantém em quarentena (§5.2). **A gaveta de quarentena continua dizendo `fonte não verificada`, nunca `ok`** — e agora por um motivo preciso e nomeado, em vez de por ausência de qualquer medição.

**`[NÃO MEDIDO]` — declarado, com o teste que fecha cada um:** `lag_ms` real por endpoint (M-1, **e o probe contínuo de F0 o continua em regime**) · topologia do balde de rate limit (rampa até o primeiro 429) · headers de peso em `/futures/data/*` (fecha com um `curl -sD -`) · `max_staleness` das 3 séries de posicionamento e de qualquer série Coinalyze · limiar de silêncio do WS para símbolo fino · custo de renderização de tabela com 20–36 sparklines · **Lightweight Charts com 288 pontos + 1.440 candles no mesmo eixo em tempo de parede — o maior risco técnico desta especificação** · throughput de TimescaleDB vs ClickHouse (**nenhum dos dois foi instalado; não há número e não se vai inventar um**) · retenção do bucket S3 · **os ToS dos três fornecedores** · a direção do acúmulo do funding.

**Saiu desta lista em R1:** a doc de *Liquidation Order Streams* quanto à assinatura de mercado inteiro (**lida: `!forceOrder@arr` existe**) e `premiumIndex.lastFundingRate` (**medido**).

**Entrou nesta lista em R1, e é de classe diferente — `[NÃO VERIFICÁVEL HOJE]`, não `[NÃO MEDIDO]`:** a **regra de subamostragem de `!forceOrder@arr`**, `latest` **ou** `largest`. **A doc do fornecedor se contradiz** (página USDⓈ-M diz `latest`; COIN-M e changelog dizem `largest`), **não há série de referência independente para medir**, e a consequência não é de precisão: **se for `largest`, todo percentil de tamanho sobre a série estima máximo de bloco.** Mitigação declarada: gravar **nome do stream + data do snapshot da doc** junto do payload cru (§13.4, `CA-F0-2`).

**Opinião de UX rotulada sem constrangimento** (`faseamento` §6.6): decisão de tela raramente é mensurável a priori. São julgamento, e o owner derruba com uma frase: que S2 domina o tempo do owner em regime permanente · que só S2 tem licença para ser densa e ter atalhos aprendidos · que a ordenação padrão de S4 é a watchlist declarada e não o percentil · que a coorte de L/S é seletor e nunca sobreposição · que o gerenciador de presets é produto prematuro · que **a ausência da afordância é a afirmação mais forte disponível** (S4 não tem nenhum botão com verbo por linha, e isso comunica "esta tela não age" melhor que qualquer texto).

---

## 17. Riscos

| # | risco | probabilidade / evidência | mitigação nesta fase |
|---|---|---|---|
| R1 | **F0 não começa** por falta de Q1+Q2, e a perda continua acumulando. **R1 aumenta a taxa:** além de ~1 dia/dia de série e da liquidação que nem pagando volta, perde-se `available_at` **OBSERVED** das séries que a plataforma existe para servir (não derivável retroativamente), o átomo de `interestRate` datado e — se a resposta a **Q17** for (a) — **spread** | **certa enquanto não houver resposta** | Nenhuma técnica. **É o único risco deste PRD sem mitigação de engenharia**, e por isso encabeça o handoff. **Mitigação PARCIAL nova (R1):** o **gate por coletor** (§6/F0) libera o snapshot diário sem esperar Q2 — é a captura mais barata e de prazo mais curto, e estava sendo bloqueada por uma decisão de que não precisa |
| R2 | **Q16 é respondida depois do primeiro `.tsx`** e o sistema de honestidade do dado nasce em área sem regra | alta — F5 é a última fase por numeração | §13.2: a parte gateante de F5 sobe para P0 |
| R3 | **`lag_ms` nunca é medido** e toda idade exibida é constante adivinhada | média — M-1 são 90 min de script e ainda não rodou | CA-F0-3 + a obrigação de exibir **`idade ?`**, que torna a dívida visível em vez de silenciosa |
| R4 | **Lightweight Charts não sustenta 288 pontos + 1.440 candles** no mesmo eixo em tempo de parede | **`[NÃO MEDIDO]`, declarado como o maior risco técnico** | CA-F4-23 mede antes de S2 completa; e a S2-mínima de F1 já exercita o eixo com carga menor |
| R5 | **Um relógio errado no host envenena `available_at`** silenciosamente | média, e o dano é **permanente** | `[GAP G6]` |
| R6 | **Download truncado grava série curta sem erro** | média, e o dano é permanente no que não é re-baixável | `[GAP G1]` |
| R7 | **A topologia do balde de rate limit vira lookahead real** em `scope: CrossSection` | **CONTESTADA e não testada** (2,85 vs 14,25 min) | CA-F0-4 (não diferível) + CA-F4-17 (S4 declara-se retrospectiva até então) |
| R8 | **Restrição de ToS incide retroativamente** sobre o ativo acumulado | desconhecida — **zero evidência, ninguém leu** | Q15. O custo é proporcional ao que Q1 já acumulou, o que **cria uma tensão real com R1** e o PRD não a esconde |
| **R9** *(novo em R1, reescrito em R2)* | **O backtest nasce sem insumo de spread**, e o período que este produto vai cobrir **não tem fonte de spread em fonte nenhuma a partir de hoje** | **certa para o passado** — medido: `bookTicker` **404 no dump desde 2024-03**; **e continua certa para o futuro** enquanto Q17 não for respondida. **R2 REDUZ a magnitude e NÃO elimina o risco** | **Q17, agora com TRÊS custos medidos lado a lado**: (a) **340–420 GB/ano** — não 1,76 TB · (b) **premissa declarada** · **(c) `/fapi/v1/depth` a 1/min: 1,67% do balde, ~3,1 GB/ano, spread MEDIDO** `[MEDIDO em R2]`. **Mitigação que vale sob as três: a premissa (ou a medição) de spread é carimbada em todo resultado de backtest e nunca dissolvida no número** (`CA-F0-12`). **Um backtest sem slippage é fantasia; um backtest com premissa rotulada é um resultado com escopo — e um com spread amostrado a 1/min é um resultado com barra de erro** |
| **R12** *(novo em R2)* | **A retenção da série de liquidação da Coinalyze ENCOLHE exatamente durante uma cascata** — ela é **esparsa**, e a janela é `pontos × intervalo` com pontos **só onde houve evento** ⇒ **retenção e necessidade são anticorrelacionadas** na única série cuja perda é irreversível | **estrutural, deduzida de medição** — 3.052 pontos = ~8 dias **no regime medido**; num regime de cascata os buckets se enchem e a janela colapsa. **A magnitude do colapso é `[NÃO MEDIDO]`** | **Não confiar na Coinalyze como rede de segurança do coletor de liquidação.** `CA-F3-10` passa a exigir que o painel escreva **`janela válida no regime atual, não garantida em cascata`** em vez de um número seco. **A mitigação real é a de sempre: o coletor próprio ligado (`Q1`)** — e este risco é **argumento adicional** para ele, não substituto |
| **R10** *(novo em R1)* | **A série de liquidação pode ser `largest`, não `latest`** — e então **todo percentil de tamanho sobre ela estima máximo de bloco**, não tamanho de liquidação | **`[NÃO VERIFICÁVEL HOJE]`** — a doc do fornecedor **se contradiz** entre a página USDⓈ-M, a COIN-M e o changelog | Gravar **nome do stream + data do snapshot da doc** junto do payload cru (§13.4, `CA-F0-2`) — **é a única forma de pinar a semântica depois**, e é uma coluna hoje contra impossível retroativamente. **Não adia a captura**: o payload cru é o mesmo nas duas semânticas; o que muda é como ele se lê |
| **R11** *(novo em R1)* | **`available_at` OBSERVED nasce não-portável** se o host mudar de região, porque o carimbo é propriedade de `(mercado, observador, caminho de rede)` | média — **Q2 ainda não foi respondida**, logo mudança de host é cenário aberto | **`CA-F0-10`**: `observer_id` e `observer_region` como colunas ao lado de todo `available_at`. **`[GAP G7]`** |

---

## 18. Identificadores estáveis, namespace e a contagem auditada

**Novo em R1, fecha `[GAP G8]`.** Depois de três rodadas de re-particionamento, **nenhum documento carregava identificador estável por achado** — e a consequência não é estética: **§8 deste PRD citava "achado A3" e o leitor não tinha como saber qual dos dois A3 era.**

### 18.1 O esquema

| prefixo | o que identifica | escopo | exemplo |
|---|---|---|---|
| `PRD-001.F<n>` | unidade de valor (fase) | este PRD | `PRD-001.F0` |
| `CA-F<n>-<k>` | critério de aceite | este PRD, **já estável e preservado** | `CA-F1-7` |
| `PRD-001.R-<n>` | regra dura | este PRD | `R-1`, `R-2` |
| `PRD-001.Q<n>` | decisão do owner | `decisoes-do-owner.md` + este PRD | `Q17` |
| `PRD-001.G<n>` | GAP nomeado por rodada de PM | este PRD | `G7`, `G8` |
| `PRD-001.D<n>` | **defeito corrigido em R1** | este PRD §0.1 | `D-01` |
| `PRD-001.E<n>` | **mudança de FASE absorvida em R2** | este PRD §0.3.1 | `E-04` |
| `PRD-001.C-<n>` | **correção de CITAÇÃO em R2** | este PRD §0.3.2 | `C-1` |
| `PRD-001.P<n>` | fato de contexto de §1 | este PRD | `P1` |
| `PRD-001.CL-<n>` | fato capture-or-lose | este PRD §4 | `CL-4` |

**Regra que fecha o furo:** **todo identificador herdado de documento de discovery é citado QUALIFICADO PELO DOCUMENTO**, na forma `<arquivo>:<id>`. Nunca `A3` sozinho.

### 18.2 A colisão medida, e a desambiguação

| id cru | em `avaliacao-discovery.md` | em `plataforma-superficies-e-faseamento.md` |
|---|---|---|
| `A3` | **ausência de telemetria de cota** exatamente onde o screener vive (`/futures/data/*` responde 200 **sem nenhum header `x-mbx-*`**) | **transporte de tempo real, não decidido** |
| `C1`–`C4` | achados do Módulo C (convergência) | decisões de tela em aberto (`C3` alvo de deploy, `C4` fuso de exibição) |
| `B6` | não existe | — |

**Correção pontual:** onde §8 deste PRD dizia *"transporte de leitura e `max_staleness_ms` por série (ADR, **achado A3**)"*, leia-se **`faseamento:A3`** — a decisão de transporte. O **`avaliacao:A3`** (telemetria de cota) é **outro item**, e ele **também é requisito**: `/futures/data/*` não expõe o numerador da razão peso-consumido/limite, e é por isso que `CA-F0-4` (rampa até o primeiro 429) é **a única forma de conhecer o balde**.
*Ressalva:* o validador de protocolo atribuiu a colisão a `insumo-para-ux.md`. **Esse arquivo não é documento deste repositório — é scratchpad** (confirmado pelo owner em R2); o documento que colide é `plataforma-superficies-e-faseamento.md`. **Documento de scratchpad não é citável como fonte.**

### 18.3 A contagem de achados: o "89" NÃO reconcilia, e aqui estão os três números com o comando de cada

Este PRD citava **"89 achados sobreviventes"** (§3 e §11) e o `recorte` partiu 89 em **68 plataforma / 21 diferidos**. **O 89 tem duas origens aritméticas no próprio documento de origem, e nenhuma delas casa com o inventário de rótulos:**

| contagem | valor | comando / origem |
|---|---|---|
| **por classe de verificação** | **89** | `49 conferíveis contra doc + 23 contra fixture + 16 contra backtest + 1 não-verificável` — `avaliacao` §Procedência |
| **por veredito do cético** | **87** | `52 REFORMULADO + 35 CONFIRMADO` — `avaliacao` §Procedência, **duas frases depois** |
| **por inventário de rótulos** | **68** | `grep -cE '^\| [0-9]+ \|'` = **26** numerados (bloqueiam código) + `grep -oE '\b[A-E][0-9]{1,2}\b' \| sort -u \| wc -l` = **31** letrados (A1–A6, B1–B5, C1–C5, D1–D4, E1–E11) + `grep -cE '^### [0-9]+\. '` = **11** itens de Anexo |

**Correção adotada: onde este PRD citava "89 achados", leia-se "os achados sobreviventes da avaliação, cuja contagem publicada é 89 por classe de verificação e 87 por veredito, contra 68 itens com rótulo estável no documento".** A **conclusão do recorte (68 plataforma / 21 diferidos) NÃO depende de qual total está certo** — ela particiona o conjunto que existe, e o conjunto é o mesmo.

⚠️ **Coincidência que precisa ser dita para não ser confundida:** o inventário de rótulos dá **68**, e o recorte de plataforma também dá **68**. **São conjuntos diferentes e o número igual é acidente.** Nenhuma inferência é válida entre os dois.

---

**Próximo passo:** `/architect` — Gap Analysis e peer review técnico **desta revisão R2**, depois tech spec, ADRs e plano fragmentado em fases. **Esta é a terceira e última emissão antes de escalar ao owner** (ciclo 3 de 3, handoff §8).

**O ledger continua em `PRD_DRAFT`, intocado por R1 e por R2** (nenhum `advance`, nenhum `approve`). **As unidades de valor no tracker — 6 Epics em CST, F0–F5, sem histórias — são ato posterior à validação do arquiteto e não foram criadas nem alteradas por este documento.** **A resposta à pergunta que o owner está esperando está em §13.5: continuam SEIS, com uma sétima contingente a `Q2` = "exposto".**

**A dívida de R1 está quitada e R2 não abre nenhuma nova.** O que fica aberto está nomeado: **20 perguntas de owner com estado explícito** na fonte única (`docs/decisoes-do-owner.md`), **8 GAPs** para o arquiteto adjudicar, **54 medições** sem runner que as rode (`[GAP G2]`, e é pré-requisito de F0), e **uma fonte com zero medição** (Coinglass) da qual **nenhum requisito depende, de propósito**.
