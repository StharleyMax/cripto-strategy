# Plataforma: superfícies e faseamento

**Data:** 2026-08-24 · **Fase:** PLATAFORMA E DADOS · **Destino:** `docs/plataforma-superficies-e-faseamento.md` · **Entra por:** `/pm`

Esta rodada decidiu **quais telas existem, o que cada uma faz, o que cada uma se proíbe de fazer, e em que ordem elas caem junto com as cinco fases de [`docs/recorte-plataforma.md`](recorte-plataforma.md)**. Quatro desenhos de superfície foram produzidos e os quatro passaram por validação adversarial contra o dado real em disco; **os quatro voltaram `SUSTENTADO_COM_CORRECOES`**, e as correções não são cosméticas — nove desenhos específicos foram derrubados por medição e aparecem aqui como derrubados, não como acordo. Esta rodada **deliberadamente não decidiu**: nenhuma regra de estratégia, nenhum limiar de sinal, nenhuma linha da matriz de convergência, nenhum detector SMC — fronteira declarada pelo owner em 2026-08-24 e respeitada em cada superfície abaixo; nem escolha de venue/corretora, tamanho de posição, gestão de risco ou jurisdição, que são decisão do owner; nem transporte de tempo real (A3), alvo de deploy (C3), fuso de exibição (C4), N da watchlist (C2) e entrada da Bybit (C6), que continuam em aberto e estão marcadas onde bloqueiam. E nada aqui foi validado por `harness doctor`: o pack `core` são 5 regras de higiene de Python, ele não enxerga `frontend/`, e dizer CONFORME sobre este documento não significaria nada.

---

## 1. O que a plataforma mostra

Cinco superfícies. Uma delas não estava em nenhuma proposta e é a de maior consequência (S1). Uma existe como dado e **não** como tela (S5). Seis candidatas foram cortadas, com o motivo.

### S1 · Console de coleta e retenção

> **Job:** responder, numa olhada, *o que está sendo gravado agora, o que já parou, e quanto disso é perda permanente*.

**Séries que consome:** `md.ingest_run`, `md.ingest_gap` (locais); último `available_at` por coletor; vazão do WS por `agg_id`; snapshot diário de `exchangeInfo`+`fundingInfo`; linha de estado do coletor de `forceOrder`; linha de estado da Coinalyze (hoje "sem fonte").

**O campo que manda:** `janela_de_perda` — quantos minutos faltam para o buraco atual sair da retenção da fonte e virar irrecuperável. Coinalyze a 1 min: 24 h. `/futures/data/*`: 30 dias. Liquidação por stream: **imediata, não existe backfill por fonte nenhuma**. Dump S3: `re-baixável (retenção do bucket não medida)` — **não** "infinito". Um atraso de ETL e um coletor de stream parado não são a mesma classe de evento e não podem ser desenhados igual.

**Também mostra:** a fila de backfill/ETL como trabalho de horas (570 × 30 dias ≈ 4,1 h sequenciais a 0,86 s/arquivo; funding de 980 instrumentos ≈ 14 h), com `n_expected/n_returned/n_written`, `verdict`, `src_sha256`, `weight_used` por arquivo; o orçamento de cota como aritmética conferível (Binance `REQUEST_WEIGHT 2400/min`; Coinalyze `hot+warm+cold = 80,8%` do `R_efetivo`), recalculado quando o owner mexe no universo, **com a incerteza da topologia do balde na tela** (2,85 min/varredura se por endpoint, 14,25 min se compartilhado, não testado); GB/dia e dias de tick retidos por símbolo.

**O que NÃO faz:** não é o canal de alarme. `Coletor Coinalyze parado` é P1 com orçamento de 24 h e **não pode depender de uma aba aberta** — tela fechada não avisa ninguém. O canal fica fora do browser; o console é onde se diagnostica depois de ser avisado. Não mostra preço, não configura estratégia, não julga qualidade semântica (isso é S3).

### S2 · Símbolo — gráfico multi-painel, replay as-of e marcação de fixture

> **Job:** olhar uma série contra o preço no tempo, conseguir afirmar o que ela significa, e deixar essa afirmação gravada como fixture.

**Séries:** preço (kline ou derivado de `aggTrade` — a escolha é declarada, não implícita); `cvd_delta` por bucket (fato) e `cvd_cum(anchor)` (view); OI grade 5 min (`base_contracts` **ou** `notional_usd`, toggle, nunca eixo duplo); as 3 séries de posicionamento; `sum_taker_long_short_vol_ratio` em painel próprio; funding liquidado como trilho de evento.

Três peças que estavam soltas nas propostas foram absorvidas aqui por motivo estrutural, não de conveniência: o **modo as-of/replay** (B10), a **ferramenta de marcação manual** (B11) e a **tabela crua da janela visível**. Marcar exige o mesmo viewport, a mesma grade canônica e o mesmo `knowledge_time` que ler; uma ferramenta de marcação separada reimplementaria a grade, e duas implementações da grade é o modo de falha em que a tela e o motor discordam sobre o que aconteceu.

**O que NÃO faz:** não detecta nada. Zero algoritmo de SMC, zero limiar, zero "sinal". A caixa que o owner desenha é **entrada** da fase seguinte, não saída desta. Não tem painel de liquidação (sem fonte). Não tem watchlist multi-símbolo ao vivo. Não dispara ordem.

### S3 · Inspetor de série — catálogo e linhas cruas

> **Job:** responder *o que este número é, e quais linhas exatas o produziram*.

**Nível catálogo:** `series_catalog` como tabela filtrável (`provider · venue · instrument_id · metric · cohort · interval · unit · denom · nature · ts_convention · label_shift · verified_by · aggregation_scope`). Série em quarentena aparece marcada, com o teste que a libera escrito.

**Nível linhas cruas:** `event_time · src_label_raw · available_at · availability_source · ingested_at · provenance · is_final · source · valor(es)`, mais as lacunas de `md.ingest_gap` da janela com `n_missing`. Ter `src_label_raw` **ao lado** de `event_time` na mesma linha é o que torna o shift `+300000` auditável em vez de folclórico.

**O que NÃO faz:** não reconcilia automaticamente e não corrige nada — divergência é exibida como divergência, porque fonte que corrige antes de gravar destrói a evidência de que havia o que corrigir. Não plota. Não edita.

### S4 · Bancada de distribuição (screener parametrizado, **retrospectivo**)

> **Job:** ver a distribuição medida de uma métrica por símbolo e por campo, e descobrir que taxa de disparo um limiar produziria — **antes** de escolher o limiar.

A proposta original pedia "screener de anomalias" com coluna booleana. O mandato desta fase inverte: a tela entrega **a distribuição**, o limiar vira parâmetro, e a linha da tabela **é** um histograma no eixo compartilhado, não um LED.

**Séries:** as 6 colunas numéricas de `daily/metrics` (não duas), funding liquidado, e — quando existir — `cvd_delta` agregado. Eixos sem default: `field`, `H`, `mode`, `direction`, `op`. Toda saída carrega o bloco de universo derivado do dado.

**O que NÃO faz:** não acende LED, não pontua, não ranqueia qualidade, não classifica símbolo como "quente", não sugere baixar o limiar quando a seleção é zero. E — o corte mais importante — **não é varredura ao vivo do universo**: sobre o dado local ela é retrospectiva, e ao vivo ela não é sustentável hoje (§3.4).

### S5 · Universo point-in-time — existe como dado, **não como tela**

`universe_at(ts, filtro)` atrás de todo seletor de símbolo, com `universe_source ∈ {snapshot, s3_inferred}` carimbado em toda saída; `instrument_alias` como YAML versionado com `evidence_url` obrigatório (`MATICUSDT→POLUSDT`, `RNDRUSDT→RENDERUSDT` foram renomeados, não deslistados, e a API não expõe a continuidade); badge de delisting no seletor, lido de `deliveryDate`. **Não nasce tela de curadoria** — são ~5 linhas por ano, editadas no editor de texto. Custo de fechar: pequeno. Custo de esquecer: survivorship bias plantado na interface, herdado por todo backtest antes de rodar.

### Cortadas, com o motivo

| superfície | veredito | motivo |
|---|---|---|
| Registro de execuções como tela própria | **cortada como tela, mantida como entregável** | nesta fase "execuções" são runs de ingestão e scans: `md.ingest_run` vira lista dentro de S1, `run_registry` vira bloco de procedência anexado a cada resultado de S4 |
| Painel de liquidação | **fora como painel** | sem dump histórico, subamostrado por doc (1/símbolo/s), Coinalyze sem chave. Painel nasceria vazio, e gráfico vazio é mentira por omissão. Vira **linha de coletor em S1 — e o coletor liga hoje** |
| Watchlist multi-símbolo com CVD ao vivo | **fora** | 4.802.005 aggTrades/dia num símbolo, pico medido de 3.468 msg/s. O transporte não foi decidido (A3). Regra que já dá para fixar: **o browser nunca recebe tick** |
| Gerenciador de presets/layouts | **fora** | produto prematuro. Sobrevive o bundle de parâmetros versionado e hasheável — que é a URL, não um CRUD |
| Dashboard de métricas financeiras | **fora** | não existe estratégia, não existe N mínimo, não existe universo. Seria superfície exibindo número sem universo |
| Entrada de ordem / execução | **fora** | escopo declarado do owner. Consequência de plataforma que **fica**: `env ∈ {mainnet, testnet, demo, replay}` em toda linha de ordem/fill desde a primeira, com chip no chrome |
| Login / autenticação | **indefinida — não construir especulativamente** | depende de C3. Localhost single-user torna a tela de login código morto com superfície de ataque; exposto torna auth estrutura. Não sei a resposta e não desenho as duas |

---

## 2. As quatro decisões de tela que o dado impõe

### 2.1 Ausência — como se desenha o que não existe

**Estado: SUSTENTADO, com duas correções aplicadas e duas versões derrubadas.**

A política é por `nature`, não por painel, e é decidida agora porque decidir depois é redesenhar:

| `nature` | ausência renderiza como | proibido |
|---|---|---|
| `STOCK` (OI) | ponto discreto na observação real + **trilho de vigência ≤ grade nativa**, em tinta de chrome | interpolar; trilho maior que a grade |
| `FLOW` (cvd_delta, volume) | **vazio**; zero legítimo = marca na linha de base, ausência = ausência de marca | `LOCF`, sempre |
| `RATIO` de estoque (3 séries de posicionamento) | igual a `STOCK`; `last()` na borda é legítimo | `mean()` |
| `RATIO` de fluxo (taker) | painel se desabilita se as componentes não existirem | `sum()`, `last()` |
| `EVENT` (funding) | marcador discreto no instante da liquidação | escada para frente **e** para trás |
| quarentena | painel desabilitado com o motivo escrito | plotar |

**Correção 1 — a primitiva "ponto + trilho" foi corrigida na aritmética de pixel.** A versão original justificava a rejeição de LOCF com aritmética de pixel e não a aplicava a si mesma. Medido em 1200 px / 24 h: espaçamento entre pontos de OI = **4,167 px**; disco r=4 com anel de 2 px = 12 px externos ⇒ **65% de sobreposição**; trilho de 10 min = 8,33 px = **2× o intervalo da grade**, ou seja, um hairline contínuo atravessando o painel — exatamente a linha contínua que a regra proíbe. **Versão corrigida:** `r` e a existência do trilho são função de `espaçamento_px = largura × grade_nativa / janela`, com `2r + 2 ≤ espaçamento_px`; abaixo disso o ponto vira tique de 1 px e o trilho é suprimido; o trilho nunca excede a grade nativa; acima de ~8,33 h de janela em 1200 px o painel declara o downsample no título em vez de desenhar 288 discos fundidos.

**Correção 2 — o painel de OI NÃO se desabilita acima da grade nativa.** A versão original desabilitava sempre que `grade_painel ≠ grade_nativa`. Medido sobre 30 dias:

```
TF     1m:  43196 fechos,   8637 com ponto EXATO (20.0%)
TF     5m:   8640 fechos,   8637 com ponto EXATO (100.0%)
TF    15m:   2880 fechos,   2879 com ponto EXATO (100.0%)
TF    60m:    720 fechos,    719 com ponto EXATO (99.9%)
TF   240m:    180 fechos,    179 com ponto EXATO (99.4%)
TF  1440m:     30 fechos,     30 com ponto EXATO (100.0%)
```

Em 15m/1h/4h/1d o fecho da barra **coincide com um `event_time` observado** em 99,4–100% dos casos: o painel não agrega nada, seleciona um ponto real. A regra como escrita apagaria o OI justamente nos timeframes em que a fase seguinte vai marcar OB/FVG/BOS à mão. **Versão corrigida:** habilita quando `grade_painel ≥ grade_nativa` **e** `grade_painel mod grade_nativa == 0`; desabilita apenas em upsampling (1 min: 20,0% de cobertura, ~80% das barras sem ponto — aí a alternativa a desabilitar é inventar) ou em grade não-múltipla.

**DERRUBADO — `nature = FLOW → sum()` aplicado ao taker ratio.** Somar três razões de 5 min produz `p50 = 3,1809` onde a razão verdadeira de 15 min é ~0,97: um número 3,3× inflado com título honesto. E a razão verdadeira **não é computável do dump** — `daily/metrics` tem 8 colunas e nenhuma é volume; o REST `takerlongshortRatio` tem `buyVol`/`sellVol`. Consequência de ingestão que decorre e **não está em F2/F3**: persistir `buyVol` e `sellVol`, senão a perna de volume que o owner declarou como direção é permanentemente não-agregável acima de 5 min.

**DERRUBADO — a fixture "3 vãos" de 2026-08-12.** Os 3 buckets ausentes são contíguos (rótulo cru 11:45/11:50/11:55 ⇒ `event_time` 11:50/11:55/12:00): é **1 vão de 20 min** entre `event_time` 11:45 e 12:05, e **1 linha em `md.ingest_gap` com `n_missing=3`**. O teste como estava escrito reprovaria uma implementação correta e aprovaria uma que desenha três buracos onde existe um.

### 2.2 Âncora do CVD — parâmetro de primeira classe

**Estado: SUSTENTADO. É a melhor decisão do conjunto. Três correções, e uma opção derrubada.**

O CVD acumulado depende da âncora e **o sinal inverte**: mesmo dia (2026-08-23), âncora 00:00 = **−1265,982 BTC**, 12:00 = **+399,745**, 20:00 = **+1598,508**. Uma âncora implícita ("início da viewport") faz o mesmo mercado parecer comprador ou vendedor conforme o scroll, e o owner vai validar SMC contra essa tela.

Decisões que ficam: `cvd_delta` por bucket é **fato** (anchor-free, persistido); `cvd_cum(anchor)` é **view** com âncora obrigatória; a âncora está escrita no título em toda renderização e em todo screenshot; ela **entra no hash do bundle**; pan e zoom **nunca** a movem; o desejo legítimo de re-zerar é atendido como **régua** (`Medir Δ`), não como redefinição silenciosa da série; `kind: viewport` continua disponível, com chip permanente e `reproducible: false` gravado.

**Correção 1 — nenhum desses números é citável sem o bucket.** A divergência entre documentos foi resolvida: os três estão certos e descrevem buckets diferentes.

| bucket | amplitude entre as 3 âncoras / range da curva | razão vs p90 do delta |
|---|---|---|
| 1 min | 2864,486 / **6450,409** | 46,2× / **104,0×** |
| 5 min | — / 6174,215 | 25,0× |
| 15 min | — / **5904,180** | **10,3×** |

Não há erro em documento nenhum; há rótulo faltando. Toda citação passa a carregar o bucket, e o teste de regressão diz qual bucket e qual dia.

**Correção 2 — a fixture só reproduz em `Decimal`.** O comando `awk` publicado como verificação devolve `−1265.978 / +399.746 / +1598.508` — erro de +4 mBTC, causado por `OFMT = %.6g` no round-trip por texto. Em `Decimal` sobre a string crua de `q`, os três valores batem exatamente. **A fixture é correta e o comando publicado para verificá-la reprova uma implementação correta** — caso puro de verificação de fachada. O procedimento canônico passa a declarar a aritmética: `Decimal` sobre a string, soma ordenada por `agg_id`, bucket por `transact_time // 60000`, sem serialização intermediária.

**DERRUBADO — a âncora "início do swing".** Swing é o gargalo de 3 dos 4 detectores SMC e é explicitamente diferido (`recorte §4`, porta 6). Oferecê-la obrigaria esta fase a embarcar um detector de swing, que é parâmetro de estratégia. **Âncoras desta fase:** `{dia UTC (default, escrito no título), N barras (resolvido para instante ao salvar), instante explícito}`. `cvd_anchor` é tipo-soma discriminado para que acrescentar `swing` depois não seja migração.

### 2.3 Idade e procedência — o selo

**Estado: SUSTENTADO no conceito, com cinco correções. Duas classificações foram derrubadas.**

**Regra dura:** nenhum numeral de mercado renderiza sem selo no mesmo card, visível sem hover. Tooltip não conta.

**Correção 1 — o carimbo é `event_time`, nunca `src_label_raw`.** Três dos quatro desenhos imprimiram `00:10:00Z` para o valor `105882.262`, que é o rótulo cru; o `event_time` canônico é `00:15:00Z`. É o defeito que a fase inteira existe para impedir, cometido dentro do mock da especificação que o impede, e ele desloca um passo de grade inteiro — os mesmos 5 min cujo erro **inverte o sinal do ΔOI de 15 min em 21,96% das janelas**. `src_label_raw` não é renderizável em superfície nenhuma; ele vive em S3, ao lado do `event_time`, como auditoria.

**Correção 2 — `idade = tempo_de_referência − available_at`, não `now − available_at`.** Com `knowledge_time` pegajoso, a definição original faz todo numeral de um replay de junho mostrar "há 2 meses", e o selo para de discriminar exatamente onde ele mais importa. Em `AGORA`, `tempo_de_referência = now`; em `COMO EM T`, é `T` — que é também a idade que o motor teria.

**Correção 3 — a idade só existe na borda direita do tempo.** Se `viewport_fim < agora − cadência_nativa`, o painel está em vista histórica e o chip de idade é substituído pelo rótulo absoluto da janela. **Um gráfico de 3 dias tem zero carimbos de idade, e isso está certo.** É esse içamento que impede que 4 painéis com carimbo virem mosaico de timestamps em mutação permanente.

**Correção 4 — o içamento é também contrato de fio.** O envelope completo por célula custa **519 B contra 54 B** (9,6×): na tela de 570 × 6 células, 1.733 KB contra 180 KB. `SeriesKey`, `source`, `unit`, `denom`, `provenance` são coluna/painel; a célula carrega `(valor|ausência, event_time, available_at)` + referência à coluna. O invariante de tipo se preserva porque a célula continua sem construtor a partir de `number`.

**Correção 5 — o limiar é calculado, nunca digitado, e `limiar_atraso ≤ max_staleness`.** A fórmula `2 × cadência + p99(defasagem)` dá 801 s = 13m21, e a tabela dizia 15 min, e o exemplo dizia 14m22, e a fixture congelava "15 min" — três números para a mesma regra. Pior: com `max_staleness = 600 s`, entre 10 e 13,35 min o painel exibe `—` (sem dado) e **ainda não** exibe "atrasado" — declara ausência antes de declarar atraso. Fixado: fórmula na tela com o `n` da defasagem, e a invariante de ordem.

**DERRUBADO — `max_staleness(OI) = 600.000 ms` justificado por erro de nível.** O documento ancorava os 10 min em "p99 0,582% de erro de nível". O erro que importa é **direcional**: segurar OI por 1 bucket inverte o sinal do ΔOI de 15 min em **21,96%** das janelas; por 2 buckets, em **33,52%** (n=8627). O orçamento impresso estava 20× menor que o real. E há risco de contágio: `max_staleness` é argumento de `as_of(serie, symbol, t, max_staleness_ms)` (F1) — uma constante escolhida por argumento de nível numa lente de UX vira, por gravidade, o default do acessor que o `backtest` vai usar. **Fixado:** `max_staleness` sai da spec de tela e entra no bundle, por série, com `verified_by`; ADR explícito de que o default de tela não é o default de `as_of`.

**DERRUBADO — `MODELADO` aplicado a valor derivado.** `implied_avg_price = oi_value / oi_base` e `cvd_cum(anchor)` são funções determinísticas de observados; classificá-las como modeladas faz o painel principal de CVD nascer permanentemente tracejado, e um canal sempre ligado não carrega informação. **Versão corrigida:** `Procedencia = OBSERVADO | DERIVADO | MODELADO | HUMANO`. `DERIVADO` exibe a expressão no rodapé e é traço sólido com marca vazada; `MODELADO` (agregado multi-venue, escada de funding) é tracejado; `HUMANO` é a anotação do owner (§2.3 abaixo). Corolário que sobrevive intacto e é a melhor distinção da rodada: **`provenance` governa o traço; `availability_source` governa apenas o playhead do replay** — e quando o carimbo é modelado, o playhead **não é uma linha, é uma faixa**, larga exatamente a incerteza medida (68–201 s ⇒ 133 s), rotulada `fronteira estimada ±`.

**Correção estrutural — a segunda porta.** A regra "toda superfície lê por `<ValorDeMercado>`; não existe segunda porta" fecha a porta da ferramenta de marcação: uma anotação de OB/FVG/BSL **não é um valor de mercado** e não tem entrada legal sob a porta única — e ela é a única peça de UI cuja ausência trava a fase seguinte inteira. **Fixado:** segunda porta tipada `<Anotacao>`, com `provenance = HUMANO`, `autor`, `criada_em`, e ligação obrigatória a `(instrument_id, venue_symbol_as_of, interval, janela, grid_hash, knowledge_time, price_source, tick_size, price_precision, multiplier, cvd_anchor, universe_source)` + a URL. Custo hoje: campos num JSON. Custo de esquecer: remarcar o corpus à mão.

### 2.4 Distribuição em vez de limiar

**Estado: SUSTENTADO — é a forma literal do mandato desta fase. Seis correções; uma capacidade declarada NÃO SUSTENTADA hoje.**

A linha do screener **é** uma distribuição: histograma de 11 bins num eixo log compartilhado desenhado uma vez no topo, mais o tick da observação atual, mais o trilho de percentil, mais o Δ cru. Três leituras coordenadas — **forma** (onde o símbolo mora), **posição** (onde ele está hoje contra si mesmo), **magnitude** (quanto vale em %) — e nenhuma delas colapsada num booleano. O que isso evita está medido: `>5% em 15m` dispara **0 vezes em 8.631 janelas** de BTCUSDT e **27 vezes em 2.013** de COTIUSDT no notional. Limiar absoluto é um filtro "não-BTC" disfarçado de sinal.

Ficam: histograma (não só percentis — na distribuição de funding `p90 = p99 = o mesmo número`, e trocar `>` por `>=` muda o disparo de 9/1500 para 184/1500, **20×**); `realized_firing_rate` ao lado do alvo; eixos sem default; bloco de universo derivado do dado em toda saída; e o estado de zero seleção como **informação**, sem nudge para baixar o limiar — a tela não empurra o owner na direção de mais disparos num instrumento que gasta capital dele.

**Correção 1 — `realized_firing_rate` exige duas janelas disjuntas, obrigatórias.** In-sample, a telemetria é uma constante: q=99 rende **1,042–1,045%** em 23 dias — ela nunca avisa nada. Out-of-sample walk-forward (calibra 7 d, avalia o dia seguinte, n=23): média **1,404%**, máximo **12,847% = 12,8× o alvo**; com q=99,9, máximo **5,208% = 52×**. A UI **recusa** renderizar o número quando as janelas se sobrepõem, e escreve `tautológico — janelas idênticas`.

**Correção 2 — as bordas de bin são atributo do `field`, não globais.** Com as 11 bordas propostas (teto 50%), **951 de 2013 observações (47,2%)** de `sum_taker_long_short_vol_ratio` caem fora da escala à direita, máximo 2055,3%. Bordas fixas por `(field, nature)`, declaradas no bundle, com bin de overflow contado (`›626`).

**Correção 3 — todo percentil transversal carrega `n` e o universo.** O `72,2` publicado para funding de BTCUSDT não reproduz sob nenhum universo declarado: 69,47 (570 perp TRADING) / 70,97 (527 perp USDT) / 75,07 / 76,00 / 76,38. Métrica sem universo, dentro do documento que a recusa.

**Correção 4 — unidade de funding, 100×.** `fundingRate` é adimensional (átomo `0.0001` = 0,01% = 1 bp). A tabela exibia `+0,0100` rotulado `bp`. Unidade canônica no store é `rate`; a célula converte e o cabeçalho carrega a unidade.

**Correção 5 — o conjunto de colunas é derivado do `series_catalog`.** O toggle `OI ⇄ FUNDING` é um binário fechado sobre um arquivo que tem **6 colunas numéricas**, e deixa de fora as 4 séries de L/S e **todo volume/CVD, que é a direção que o owner nomeou**. É a forma de UI do `field`-enum-de-2 que o recorte chama de "a porta fechada mais cara".

**Correção 6 — paleta: `critical` sai do canal de cor.** O par de polaridade azul↔laranja passou o validador nos dois modos (`ΔE 24,7 / 26,8` sob protanopia, contra 7,2 do verde/vermelho convencional). Mas a paleta **da tela** (4 papéis simultâneos) reprova: `#d03b3b ↔ #eb6834` fica em `ΔE 10,8`, abaixo do piso de 15 do próprio validador. **Fixado:** cor de status nunca é marca de gráfico; `critical` vive como hachura + tag textual no chrome. Nesta plataforma, vermelho nunca significa "preço caiu" — significa "o dado quebrou".

**NÃO SUSTENTADO hoje — varredura transversal ao vivo.** `/futures/data/*` é 1 símbolo por chamada para OI, sem batch: 570 × 5 séries = **2,85 min/varredura se o balde for por endpoint, 14,25 min se for compartilhado**, e a topologia **não foi testada**. No pior caso a série de 5 min chega com 15 min de defasagem e o guard anti-lookahead escrito em `bucket_end` vira lookahead real em `scope: CrossSection`. **Enquanto o teste de rampa até o primeiro 429 não rodar, S4 é retrospectiva e a tela diz isso.** Vender a tela como radar de tempo real seria vender uma coisa que o dado não entrega.

**Conflito que decorre e que precisa ser resolvido antes de S4 ao vivo:** o limiar de ruptura de idade (15 min para OI) e a varredura de 570 símbolos se destroem mutuamente. A idade de uma linha na publicação é `duração_da_varredura + defasagem_nativa`: no cenário por endpoint, 2,85 + 8,35 = **11,2 min** (acima de "atenção"); no compartilhado, 14,25 + 8,35 = **22,6 min** (acima de ruptura — o valor seria apagado em quase toda linha, em toda varredura). Um alarme que toca em todas as linhas deixa de ser alarme. **Fixado:** o limiar de linha de varredura transversal é `lim_painel + duração_medida_da_varredura`, com a duração no cabeçalho (`varredura 23:34:00 → 23:47:12 · 570 símbolos · ordenação sobre janela móvel`) e a idade por linha como desvio da varredura, não carimbo absoluto.

---

## 3. O sistema de honestidade do dado

### 3.1 O padrão transversal

Quatro campos, sempre nesta ordem, no mesmo card do numeral:

| campo | conteúdo |
|---|---|
| **série** | rótulo do `series_key` com qualificador e unidade lidos do catálogo: `OI · grade 5m · BTC · bn-dump`. As strings `OI`, `funding`, `L/S`, `CVD` sozinhas não existem na UI |
| **idade** | `tempo_de_referência − available_at`, só na borda direita do tempo; `OBSERVED` em tinta normal, `MODELED` em tinta fraca com `~`, e **`idade ?` quando `lag_ms` não foi medido para aquele endpoint** — não é permitido exibir um número e chamá-lo de idade |
| **procedência** | `OBSERVADO` / `DERIVADO` (com a expressão) / `MODELADO` / `HUMANO`, mais `source` e `label_shift` no rodapé do painel |
| **completude** | `285/288 · 1 lacuna` para série de grade; **`contiguidade (N saltos de agg_id)`** para série derivada de tick, que não tem `n_expected` — campo obrigatório que às vezes fica em branco vira campo ignorado |

Regras de içamento (o que impede o mosaico): **sessão** carrega fuso, `agora`, modo `AO VIVO`/`COMO EM T`, versão do bundle — 1× por tela. **Painel** carrega fonte, shift, procedência, universo e `n lido / n esperado` — 1× por painel, uma linha mono, sempre visível, nunca em tooltip. **Número** carrega só a idade.

Estados de ausência, três palavras e três desenhos, nunca sinônimos: `SEM_PONTO` (não existe na fonte) · `NAO_LIDO` (backfill pendente) · `QUARENTENA` (`label_shift IS NULL OR unit IS NULL`) · `SEM_FONTE` (declarado, com o relógio de perda) — e **zero legítimo é uma marca desenhada na linha de base**, distinguível de ausência em 100 ms.

Quarentena vive em **área separada**: gaveta colapsada, eixo próprio, cinza neutro, sem sincronia de crosshair, com o teste de liberação escrito. Nem escondida (esconder faz esquecer o coletor cujo SLO é P1 com orçamento de 24 h) nem marcada no lugar (pôr no eixo compartilhado é asserir a convenção de rótulo que ninguém mediu). Toda a Coinalyze nasce aqui.

Divergência tem **dois casos com a mesma palavra**, e só um admite delta: *mesma grandeza, dois observadores* (dump × REST — medido: **288/288 idênticos em `Decimal`, 0/288 idênticos como string**; logo a banda é zero-tolerância, calculada em `Decimal` sobre a string canônica, e a cobertura da reconciliação — hoje **1 símbolo × 1 dia** — vai na tela ao lado do trilho); e *grandezas diferentes com o mesmo nome* (`OI (agora)` × `OI (grade 5m)`), onde **calcular um delta é fabricar um erro** e o que a tela faz é carregar o escopo no nome.

### 3.2 Anti-padrões proibidos, com a razão de cada um

| # | proibido | razão |
|---|---|---|
| 1 | Interpolar qualquer série | interpolar OI inventa dado; interpolar funding inventa uma taxa que só existiu no instante da liquidação. `time_bucket_gapfill + interpolate` interpola entre o ponto anterior **e o posterior** — lookahead por construção |
| 2 | "Ao vivo" / bolinha verde em série de polling | num instante aleatório o ponto de OI mais recente tem **1,1 a 8,4 min**. O único rótulo honesto sobre o socket é `WS conectado` — fato sobre o socket, não afirmação sobre o dado |
| 3 | `LOCF` em `nature = FLOW` | bucket ausente de fluxo é zero ou desconhecido, nunca o valor anterior — e a perna que o owner declarou (volume, taker, liquidação) é toda fluxo. Rejeição por tipo, não por convenção |
| 4 | `sum()` ou `last()` em `RATIO` de fluxo | somar 3 razões de 5 min dá 3,18 onde a verdade é ~0,97 |
| 5 | Dois eixos Y no mesmo painel | o alinhamento das escalas é arbitrário: o gráfico inventa uma correlação que não está no dado. `p99\|Δ15m\|` do taker é 824,6% contra 0,75% do OI — 1.100× |
| 6 | LED booleano "acendeu" | filtro "não-BTC" disfarçado: 0 disparos em 30 d no BTC, 27 em 7 d no COTI |
| 7 | Countdown de funding com constante de 8 h | errado em 432 de 570 perpétuos (75,8%), e o intervalo muda no tempo (`1000XECUSDT` fez 8h→1h→4h em julho/2026) |
| 8 | Um número chamado "o OI" | `/fapi/v1/openInterest` é outra série e não bate com a grade por construção — e **só publica contratos-base**: em `notional_usd` o chip escreve `indisponível`, nunca converte na borda de renderização |
| 9 | Escada de funding **para frente** | derrubado por medição, ver 3.3 |
| 10 | Escada de funding **para trás** | atribui a barras passadas um número que só existiu no settlement — lookahead desenhado na tela |
| 11 | Plotar na ordem do arquivo | `daily/metrics` não vem ordenado (13/30 dias). Lido na ordem do arquivo, `pct_change(3)` fabrica **19 disparos de ">5%"** onde existem zero |
| 12 | Auto-scale contando a lacuna como dado | a lacuna desaparece exatamente na escala |
| 13 | Ler `h`/`l`/`c` do bucket corrente como se fossem finais | só existem no fechamento — **mas o bucket em formação renderiza com `is_final = false`**, porque aos 4 min o high definitivo já é conhecido em 77,4% dos buckets e 90,0% do range já aconteceu: esconder isso é perda de informação na única superfície onde o owner marca sweep intrabar |
| 14 | Dropdown alimentado por `exchangeInfo` de hoje | **21,6% do universo cripto-perpétuo com histórico não existe mais** — survivorship bias na interface, herdado por todo backtest antes de rodar |
| 15 | Precisão além da fonte | 8 casas onde a fonte tem 3. Precisão vem de `quantityPrecision`/`tickSize` **datados**, nunca da largura da string (`105832.81400000` tem 8 casas de payload e 3 de conteúdo) |
| 16 | Rotular unidade como `contratos base` | `baseAsset` traz `1000XEC`, `1MBABYDOGE`; **20 símbolos com prefixo numérico e nenhum campo de multiplicador no `exchangeInfo`**. Renderiza `denom` verbatim, ou `contratos (multiplicador não resolvido)` e S4 recusa comparação cross-símbolo naquela linha |
| 17 | Humanizar quantidade negociável | `1.314.556`, nunca `1,3 milhão` — humanizar é para prosa, não para instrumento de decisão |
| 18 | Cor sozinha carregando estado | idade, procedência, lacuna e quarentena têm cada um um canal textual ou de forma além da cor. E **ângulo de hachura** não pode significar "OK" no plot e "lacuna" na faixa a 8 px de distância: ausência = hachura, procedência modelada = pontilhado |
| 19 | Tooltip como único caminho para um valor | tooltips acrescentam, nunca guardam a porta. Foco de teclado mostra o mesmo que hover |
| 20 | Esqueleto piscando em refetch | destrói continuidade; refetch mantém o render anterior a opacidade reduzida com a idade visível |
| 21 | Série em quarentena em painel sincronizado | pôr no eixo é asserir a convenção de rótulo que ninguém mediu |
| 22 | Agregado multi-venue sem declarar a composição | a Coinalyze **não agrega** (zero ocorrências de `aggregat*` em duas capturas de doc); todo agregado é modelo nosso, e somar `BTCUSDT_PERP.A` com `BTCUSD_PERP.0` é ilegal dimensionalmente |
| 23 | Deduplicar sinal na ingestão / gravar booleano pré-avaliado | a contagem bruta some e a fase seguinte fica sem denominador |
| 24 | Superfície chamando endpoint de exchange direto | produz numeral sem `available_at`, sem `provenance`, sem `ingest_run` — os quatro campos do selo ficam impreenchíveis. **Nenhuma superfície chama exchange; tudo lê o store local**, inclusive `OI (agora)`, que é série ingerida como qualquer outra |
| 25 | `grep` como aprovação | `frontend/` tem zero cobertura no `harness.toml`; `live` casa `resolveLive`; build minificado e i18n derrotam o grep; e a regra é sobre composição em runtime, que grep não vê. `grep` fica como triagem; aprovação é teste de comportamento |

### 3.3 O que foi derrubado e não é acordo

**A escada de funding "para a frente" está DERRUBADA.** Dois desenhos a prescreviam como o jeito honesto. Medido sobre as 16.919 transições consecutivas dos 120 zips de `monthly/fundingRate` (60 símbolos): **3.047 = 18,01% das vezes a taxa troca de sinal entre `T` e `T+1`** — ou seja, a escada mostra a cor errada (pagando vs recebendo) durante todo o intervalo que cobre; em `1000SHIBUSDT` isso acontece em **36,8%**, mais de 1 em 3. Erro relativo mediano de `r(T)` como previsor de `r(T+1)`: 13,5%. É valor modelado renderizado como observado. **Fixado:** marcador discreto em `T`, sempre; se houver extensão horizontal, ela cobre `[T − funding_interval_hours_da_própria_linha, T)` rotulada como **janela de acúmulo** (o `available_at = T` já garante que não há lookahead em desenhar para trás). **A metade que falta:** a direção do acúmulo se confere na doc pública da Binance (seção de cálculo do funding rate / `Get Funding Rate History`) e **essa doc não foi lida nesta rodada** — verificação pendente contra fonte pública. A medição de 18,01% independe da direção: qualquer projeção para frente afirma um intervalo não observado.

**"3 dias completos de `aggTrades` em disco" está DERRUBADO.** São **08-20, 08-21 e 08-23**; falta 08-22 inteiro (buraco de 1.620.908 aggTrades entre `agg_id` 3420055157 e 3421676065). Consequência para a fatia mínima: um CVD acumulado ancorado no início da janela **pula um dia inteiro de fluxo em silêncio** — exatamente o modo de falha que a política de ausência de `FLOW` existe para impedir; e o painel Preço (REST 5 min, 4 dias contínuos) e o painel CVD (3 dias com buraco) têm coberturas diferentes no mesmo viewport, caso que nenhum desenho nomeava. **Isto vira a melhor fixture disponível hoje**, e estava sendo desperdiçado como "3 dias completos".

**Outras versões derrubadas, já tratadas acima:** ponto+trilho na aritmética original (2.1) · painel de OI desabilitado acima da grade nativa (2.1) · `FLOW → sum()` no taker (2.1) · fixture "3 vãos" (2.1) · âncora "início do swing" (2.2) · `max_staleness` justificado por erro de nível (2.3) · `MODELADO` para valor derivado (2.3) · porta única de leitura (2.3) · toggle binário de colunas (2.4) · varredura ao vivo (2.4) · fixture de CVD via `awk` (2.2) · fixture "4 séries em quarentena", que congelava uma escolha de catálogo e vira invariante (`count(gaveta) == count(catálogo WHERE label_shift IS NULL)` e `count(painéis sincronizados ∩ quarentena) == 0`).

---

## 4. Ordem de entrega consolidada

As cinco fases de `docs/recorte-plataforma.md` são ordem de **correção** (o que decide se o dado gravado nasce certo). As superfícies são ordem de **valor**. Integrar as duas produziu **um conflito real**, que está exposto abaixo em vez de dissolvido numa média — e produziu **uma fase nova (F0)**, que é a consequência de levar a sério a tese "cada dia não gravado é um dia perdido para sempre".

### O conflito, dito antes das fases

A ordem técnica é `contrato temporal → semântica → aquisição → superfície`. A ordem de urgência é o inverso na ponta: **o trabalho cujo custo de atraso é irreversível (ligar coletores de stream, snapshot diário de `exchangeInfo`, medir `lag_ms`) está dentro de F3, a terceira fase.** Liquidação da Binance não tem dump; Coinalyze a 1 min retém 24 h; `exchangeInfo` datado é o único dado da plataforma que não é re-baixável e ainda não começou. Cada dia em F1 é um dia perdido desses ativos.

E há um segundo conflito, menor e mais insidioso: **F0 não produz um único pixel e pode durar semanas de relógio** (backfill 4,1 h + funding 14 h + acompanhamento), enquanto o console que mostraria esse trabalho (S1) está em F3.

**Resolução, e ela não é uma média:**

- **F0 existe e vem primeiro**, com o argumento que a sustenta: gravar payload bruto imutável com `received_at` **não exige** o contrato temporal correto. Reprocessar é barato (0,86 s/arquivo); recapturar é impossível. O que F0 preserva e que nenhuma fase posterior pode recuperar é o `available_at` OBSERVED, que é o único insumo de latência de campo.
- **S1 é cortada em duas.** O **registro** (tabela crua de `md.ingest_run` e `md.ingest_gap`, sem estilo, ordenável por clique) entra em F0, porque uma fila de trabalho de 14 h sem observabilidade é o modo de falha declarado. O **console** (com `janela_de_perda`, orçamento de cota recalculado, disco projetado) entra em F3.
- **A primeira fatia de valor visível não espera F3.** Ela cai **junto com F1**, imediatamente depois de F0, e está nomeada abaixo.

### F0 — Captura irreversível · sem tela, com registro cru

**Componente:** `sentimento` · **Depende de:** nada. Roda hoje, sem chave, sem rede além da Binance pública.

**Entrega:** coletor de `forceOrder` ligado (WS público, sem chave) gravando cru com `received_at`; snapshot diário datado de `exchangeInfo` + `fundingInfo` (1,18 MB bruto / 54 KB gzip); teste **M-1** de `lag_ms` por endpoint rodado (90 min de script); ETL do S3 iniciado em fila retomável; `md.ingest_run` e `md.ingest_gap` persistidos (nunca log) e exibidos numa tabela crua.

**Condição de pronto, conferível:** `data(último snapshot de exchangeInfo) == hoje` por 7 dias consecutivos · a linha do coletor de liquidação mostra `capturando há N dias · histórico anterior: inexistente por fonte nenhuma · subamostrado 1/símbolo/s por doc` · `lag_ms` sai de `n=2` e a tabela de defasagem tem `p99` por endpoint com o `n` ao lado · o teste de rampa até o primeiro 429 resolve a topologia do balde (2,85 vs 14,25 min), que é o parâmetro do qual a regra anti-lookahead do `scope: CrossSection` depende.

**O que NÃO faz:** não aplica shift canônico ao gravar (grava cru + `received_at`), não normaliza, não plota, não decide universo (C2 continua do owner), não chama Coinalyze (C1 continua do owner — e a linha do console mostra o relógio de perda de ~1 dia de série de 1 min por dia sem coletor).

### F1 — Contrato temporal e identidade do registro **+ a fatia de valor visível**

**Componentes:** `sentimento` (borda de ingestão) · `charts` (a fatia) · ADR em `docs`

**Entrega (contrato):** as 13 peças do recorte §F1 — shift `event_time = create_time + 300000` aplicado uma vez às oito colunas com `src_label_raw` gravado; ordenação obrigatória antes de emitir evento; unicidade por `agg_id`; `ingest_gap` persistido; acessor único `as_of(serie, symbol, t, max_staleness_ms)` filtrando por `available_at`, com `LOCF` e sem `interpolate`; as sete colunas de procedência em toda linha; `cvd_delta` como fato e `cvd_cum(anchor)` como view.

**Entrega (a fatia, e é a primeira coisa que o owner vê):** **S2-mínima — 1 símbolo (BTCUSDT), 4 dias, painéis Preço (`price_source = REST klines 5m`) + OI (`metrics`, shift +300000) + CVD delta e acumulado (`cvd_source = aggTrade dump: 08-20, 08-21, 08-23`)**, com selo de procedência, lacuna visível, âncora explícita no título e `knowledge_time` na URL. Ela exercita o selo, a política de ausência, a âncora, o as-of e a grade compartilhada de uma vez, **sem rede e sem chave**, e cada número medido nesta rodada já é fixture de regressão dela.

**Condição de pronto (o owner roda):**

| comando / ação | saída esperada |
|---|---|
| carregar `2026-08-18` (md5 `b8ef79c353f2adce853c68084cc3b631`), verificar monotonia | monótono; bypassando o sort → **reprova** |
| carregar `2026-08-12` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`) e renderizar OI | **285 linhas; 1 linha em `ingest_gap` com `n_missing=3`; 1 vão de 20 min entre `event_time` 11:45Z e 12:05Z; zero pontos interpolados** |
| primeiro carimbo de idade de `met/2026-08-23.csv` | `00:05:00Z` (nunca `00:00:00Z`) |
| contiguidade dos `aggTrades` | `0 saltos, 0 ts decrescente, 8.873.078 linhas`; e o **buraco de 08-22 aparece como descontinuidade de `FLOW`, não costurado** |
| fixture envenenada (`event_time` passado, `available_at` futuro) | resultado **bit-idêntico** ao dataset sem elas |
| CVD sem âncora | erro. Com 00:00/12:00/20:00 em buckets de 1 min, via `Decimal` → **−1265,982 / +399,745 / +1598,508 BTC**, e o **título muda nas três** |
| crosshair em barra de 1 min sem ponto de OI | valor em tinta secundária + `de hh:mm:ssZ (−Xm)` + **linha-guia apontando para trás** até a marca real; nunca lido como leitura daquela barra |
| crosshair em bucket ausente de `cvd_delta` | `—`. **Nunca** o valor anterior — `locf()` sobre `nature=FLOW` é erro de tipo |
| `COMO EM T` → navegar → voltar | `T` sobrevive aos três saltos (teste negativo: voltar para `AGORA` não tem sintoma visível) |

**O que F1 NÃO faz:** não define limiar, não calcula convergência, não chama Coinalyze, não escolhe motor de banco (o contrato é portável entre TimescaleDB e ClickHouse; **nenhum dos dois foi instalado nem medido**), não decide `field` nem `H` nem `direction`, não detecta SMC.

### F2 — Semântica declarada **+ S3 (inspetor de série)**

**Componentes:** `sentimento` · `web` (S3) · ADR em `docs`

**Entrega:** `series_catalog` como contrato lido pelos testes, com `nature ∈ {STOCK, FLOW, RATIO, EVENT, TICK}` — e **`RATIO` com operador de downsample determinado pelo numerador** (razão de estoque aceita `last()`; razão de fluxo só recomputa de `Σbuy/Σsell`); tabela de shift por endpoint; as **quatro** séries de L/S com colunas próprias e proibição de `ls_ratio` genérico; `funding_settled` e `funding_estimado` separados, com `interval_hours_declared` por linha; `capped` por linha; `unit` e `denom` obrigatórios; `cvd_source` com erro medido publicado por fonte. **Acrescentado por esta rodada:** persistir `buyVol`/`sellVol` do REST `takerlongshortRatio`, sem os quais a perna de volume é permanentemente não-agregável acima de 5 min. **S3** renderiza tudo isso — catálogo filtrável e linhas cruas com `src_label_raw` ao lado de `event_time`.

**Condição de pronto:** toda série tem `label_shift` com `verified_by` apontando um teste que **mediu** o shift; quarentena com predicado `label_shift IS NULL OR unit IS NULL` (o taker tem shift 0 verificado e unidade **não resolvida** — evidência favorece quote em 601/864 buckets = 69,6%, não fecha); autocorrelação lag-1 reproduz **0,99+ nas três de posicionamento e ~0 no taker**; `delta()` sobre `nature=FLOW` **rejeitado pelo tipo**; `settlement_slot` com **0 slots fora da grade em 16.979 liquidações**, resíduo em `[0,20] ms`; pedir TF 15m na série taker **recusa**, nunca devolve 3,18.

**O que F2 NÃO faz:** não elege `field` canônico, não elege coorte de L/S, não define "extremo" de funding, não normaliza automaticamente entre unidades.

### F3 — Aquisição e persistência **+ S1 console + S5 embutido**

**Componentes:** `sentimento` · `web` (S1) · consome-se em `backtest`

**Entrega:** paginador que sempre envia `startTime` **e** `endTime` (com `startTime` sozinho, `openInterestHist` devolve os buckets **mais recentes**, HTTP 200, sem aviso — backfill ingênuo grava dado de hoje com timestamp de semanas atrás); `-1130` como fim de histórico; Redis **Streams + consumer group** para todo consumidor com estado (Pub/Sub é at-most-once por doc, e um acumulador de CVD não sobrevive a isso); WS com detecção de buraco por `agg_id`; broker de cota; `universe_at(ts, filtro)`; **S1 console** com `janela_de_perda`, fila de ETL e orçamento aritmético; **S5 embutido** (seletor por `universe_at`, badge de delisting, `universe_source` carimbado).

**Condição de pronto:** `startTime` de 60 dias atrás → `verdict='REJECTED'`, `api_code=-1130`, zero linhas · backfill de um dia → 288 pontos distintos; de 2026-08-12 → 285 + gap · `universe_at('2025-08-01')` inclui `ICXUSDT` e exclui `DOSUSDT`; listagem S3 pagina por `NextContinuationToken` e o teste falha se `IsTruncated=true` sem paginação (980 prefixos contra `MaxKeys=1000`: folga de 20, +28 símbolos em 30 dias) · **liveness do WS por contiguidade + heartbeat, nunca por taxa** — a média variou 3,66× entre dois dias da mesma semana (55,6 vs 15,2 msg/s) e o pico não escala com o volume (3.468 msg/s em 08-20 contra 3.224 em 08-21, num dia com 43% menos trades), enquanto `agg_id` dá detector exato (0 saltos em 8.873.078 linhas).

**O que F3 NÃO faz:** não escolhe corretora, não fixa `N` do universo nem `V` de venues antes de P0/P1, não dispara ordem, não decide se a Coinalyze pode estar em caminho síncrono de decisão.

### F4 — Superfície e reprodutibilidade **+ S4 bancada + S2 completa**

**Componentes:** `charts` + `web` · `backtest` (run registry) · ADR de motor

**Entrega:** decisão de armazenamento (TimescaleDB vs ClickHouse) com dataset e unicidade **ligada**, sobre volumetria medida; grade canônica como **uma única função compartilhada** entre gráfico e motor, versionada junto com o dado derivado; **S2 completa** (as-of com moldura impossível de não notar, marcação de fixture com teclado obrigatório, painéis restantes); **S4 bancada** com `/screener/distribution|scan|firing_rate`, histograma, `realized_firing_rate` com janelas disjuntas obrigatórias, bordas de bin por `field`; bundle de parâmetros versionado e hasheável; `run_registry` com hash do bundle, janela de dado lida, commit e data.

**Condição de pronto:** `scan` com `Absolute{5.0}` sobre BTC/30 d devolve **0 linhas** e `distribution` mostra `max = 2,4017`, conferido por **dois caminhos independentes** (view vs recontagem sobre a tabela crua) · forçar `eval == calib` no `firing_rate` → a célula lê `tautológico`, nunca `1,04%` · carregar a tela sem `ThresholdSpec` na URL → **zero números derivados** (nenhum eixo com default) · TF=60m no painel de OI → **719/720 fechos com ponto**, painel habilitado · `min(gap_px entre discos)` > 0 numa janela de 24 h · a paleta completa (4 papéis) passa `validate_palette.js`, com `critical` fora do canal de cor · toda métrica exibida vem com o bloco de universo **derivado do dado**, nunca digitado.

**O que F4 NÃO faz:** não desenha zona SMC, não implementa gerenciador de presets, não calcula métrica de performance, não faz varredura ao vivo (§2.4).

### F5 — Governança de fronteira

**Componente:** `docs` (+ `harness.toml`)

**Entrega:** ponteiro de arquiteto para `charts` e `web` no `harness.toml` (hoje `by_component` tem `sentimento`, `convergencia` e `backtest` e **nenhum dos dois** — conferível com `grep -n "by_component" -A2 harness.toml`); decisão explícita sobre cobertura de `frontend/` **antes do primeiro `.tsx`** (globs TS + pack que morda TypeScript, ou re-declarar a lacuna com a contagem de arquivos que ela deixa de fora); ADRs `ADR-NNN` para cada decisão de §2 e §3 deste documento; `env ∈ {mainnet, testnet, demo, replay}` em toda linha de ordem/fill, com chip no chrome desde a primeira tela que exibir fill.

**Condição de pronto:** `harness.toml` tem dono para os cinco componentes de domínio; nenhum ADR sem `ADR-NNN`; teste que rejeita linha de ordem sem `env`.

**O que F5 NÃO faz:** execução ao vivo não é desta fase.

### Resumo da sequência, e onde o valor aparece

```
F0  captura irreversível ──────────► sem tela + registro cru (tabela feia, obrigatória)
F1  contrato temporal ─────────────► ★ S2-MÍNIMA — primeira fatia de VALOR VISÍVEL
F2  semântica declarada ───────────► S3 inspetor
F3  aquisição e persistência ──────► S1 console + S5 embutido
F4  superfície e reprodutibilidade ► S4 bancada + S2 completa (as-of + marcação)
F5  governança ────────────────────► sem tela
```

**A primeira fatia que produz valor visível é a S2-mínima, e ela cai junto com F1** — não depois de F3, e não depois que "a plataforma estiver pronta". Ela é construível hoje, offline, com o dado já em disco.

**O conflito residual, dito sem maquiagem:** a S2-mínima produz valor **de verificação** (o owner consegue olhar uma série contra o preço e afirmar que ela significa o que ele pensa), não valor **operacional** — ela não mostra o mercado agora, o painel de OI vem do dump com ~30,3 h de idade, e ela cobre 4 dias com um buraco. Se o que o owner quer primeiro é olhar o mercado ao vivo, a fatia que entrega isso depende de F0 (`lag_ms` medido) + F3 (coleta ao vivo) e **não existe antes disso**. As duas coisas se chamam "primeira tela" e não são a mesma; escolher entre elas é decisão do owner (é a pergunta C5 do recorte, ainda aberta), e eu não a tomei por ele.

---

## 5. O que fica de fora desta fase

**Superfícies adiadas:** painel de liquidação (sem fonte histórica em fonte nenhuma) · watchlist multi-símbolo ao vivo (transporte não decidido, A3) · gerenciador de presets · dashboard de métricas financeiras · entrada de ordem · login (indefinido até C3) · tela de curadoria de alias (é YAML) · varredura transversal ao vivo em S4 (topologia do balde não testada).

**Fora por escopo declarado do owner:** limiar numérico de sinal, matriz de convergência, regra de entrada/SL/TP, métrica de performance, detectores SMC (swing, OB, FVG, BSL/SSL, BOS/CHoCH), critério de match, protocolo de walk-forward, paper trading, execução ao vivo.

**Portas que ficam abertas — o que esta fase é obrigada a fazer hoje para que a fase seguinte não seja retrabalho** (as 21 do recorte §4 continuam válidas; estas são as que **esta rodada de superfícies** acrescentou ou tornou mais específicas):

1. **`pointer_mode ∈ {read, annotate}`** declarado desde já, com camada de overlay reservada acima do plot e abaixo do crosshair, e hit-testing por retângulo. `clique`/`Espaço` só significam "travar crosshair" em `read`. Zero implementação, uma linha de arquitetura — e sem ela a ferramenta de marcação colide com o gesto já gasto.
2. **`<Anotacao>` como segunda porta tipada**, com `provenance = HUMANO` e a chave completa de fixture (§2.3). Custo hoje: campos num JSON. Custo de esquecer: remarcar o corpus à mão.
3. **`tick_size` e `price_precision` as-of a janela** governando formatação e snap vertical: **25 `tickSize` distintos** e `pricePrecision` de 1 a 8 nos 570 perpétuos. Toda tolerância SMC futura é expressa em ticks; fixture com preço absoluto e casas fixas nasce fora da grade de preço.
4. **Multiplicador de contrato em tabela curada com `evidence_url`** — 20 símbolos com `baseAsset` começando em dígito e **nenhum campo de multiplicador no `exchangeInfo`**; regex do prefixo erra `1MBABYDOGE` por 10⁶.
5. **`buyVol`/`sellVol` persistidos** do REST `takerlongshortRatio` (§2.1).
6. **`as_of` bitemporal explícito**: com store append-only (`(symbol, source, bucket_end, observed_at)`), filtrar por `available_at` sozinho não escolhe entre N observações do mesmo bucket. `as_of(t)` seleciona `argmin(observed_at)` entre as que têm `available_at ≤ t` — **a primeira**, não a última nem a definitiva — e a faixa de qualidade marca que houve revisão depois (a revisão não é mostrada; a existência dela é).
7. **Cadência do bucket parcial fixada em spec**: o browser recebe `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` a `max(1 Hz, 1/TF)`, e o carimbo diz a cadência. A resolução exibida da idade nunca é mais fina que `1/f`. Sem essa cláusula, "barra parcial a 40% de opacidade" é ambíguo entre 1 msg/s e 3.468 msg/s de pico.
8. **`env` com slot no chrome** desde a primeira tela que exibir fill.
9. **`ThresholdSpec` com `spec_version` + `Custom{expr}` desabilitado por padrão**, senão "o limiar é parâmetro" vale só para os três formatos que esta fase adivinhou.

---

## 6. Evidência e sua força

### 6.1 MEDIDO sobre dado real nesta rodada, com o comando (força máxima)

Ambiente: `$S = data/` (não versionado). ⚠️ A estrutura foi reorganizada por fonte em 2026-08-25; os subcaminhos citados abaixo (`$S/met/`, `$S/cz/`, …) traduzem-se pelo mapa em [`data/MANIFEST.md`](../data/MANIFEST.md).

| medição | valor | comando |
|---|---|---|
| CVD por âncora e por bucket | 1 min: −1265,982/+399,745/+1598,508, amplitude entre as três 2864,486 = 46,2× p90, range da curva 6450,409 = 104,0× · 5 min: 6174,215 = 25,0× · 15 min: **5904,180 = 10,3×** | `awk -F, 'NR>1{q=$3+0;b=int($6/60000);if($7=="true")d[b]-=q;else d[b]+=q}...' BTCUSDT-aggTrades-2026-08-23.csv` + `numpy`; **os 3 decimais só reproduzem em `Decimal`** (`awk` tem `OFMT=%.6g`) |
| cobertura de OI por TF | 1m 20,0% · 5m 100% · 15m 100% · 60m 99,9% · 240m 99,4% · 1440m 100% | varredura de `met/*.csv` com `event_time = create_time + 5min` contra a grade de cada TF |
| lacuna de 2026-08-12 | 285 linhas; buckets crus 11:45/11:50/11:55 contíguos ⇒ **1 vão de 20 min** entre `event_time` 11:45 e 12:05 | `csv.DictReader` sobre `met/2026-08-12.csv`, diff de 300 s |
| LOCF direcional em OI | 1 bucket → inversão do sinal do ΔOI15m em **21,96%** (n=8629) · 2 buckets → **33,52%** (n=8627) | `met/*.csv` ordenado, H=15 min, LOCF de k buckets |
| erro de nível ao segurar OI | 5 min: p50 0,0172% p99 0,3623% max 2,0187% · 10 min: p50 0,0311% p99 0,5614% max 2,2756% (n=6621) | idem |
| funding troca de sinal entre liquidações | **3047/16919 = 18,01%**; pior `1000SHIBUSDT` 36,8%, `GLMUSDT` 36,7%; erro relativo mediano 13,5% | 120 zips `frm/*.zip`, agrupado por símbolo, ordenado por `calc_time` |
| funding: intervalo e átomo | 432/570 = 4h (75,79%); **BTCUSDT é 8h e liquida 00/08/16Z**; átomo `0.0001` = 175/1500 (11,67%); `>` 9 vs `>=` 184 (**20×**) | `fi.json`; `fr_BTCUSDT.jsonl` |
| taker: soma de 3 buckets | p50 **3,1809** contra razão real ~0,9707; `daily/metrics` tem 8 colunas e **nenhuma de volume**; REST tem `buyVol`/`sellVol` | `met/2026-08-23.csv`; `head -1`; `r_takerlongshortRatio.json` |
| taker fora da escala de bins | **951/2013 = 47,2%** acima de 50%, max 2055,3% | histograma de `\|Δ15m\|` nas 11 bordas propostas |
| `firing_rate` in-sample vs OOS | q=99: IN 1,042–1,045% (n=23 dias) · OOS média 1,404%, **max 12,847%** · q=99,9: OOS **max 5,208%** | walk-forward calibra 7 d / avalia dia seguinte sobre `met/*.csv` |
| percentil transversal de funding | 69,47 / 70,97 / 75,07 / 76,00 / 76,38 conforme o universo — **nenhum dá 72,2** | `pi.json` × `ei.json` |
| reconciliação dump × REST | **288/288 idênticos em `Decimal`; 0/288 idênticos como string** | `rest_oi.json` × `met/*.csv` com shift +300000 |
| ordem do arquivo | `pct_change(3) > 5%` na ordem do arquivo: **19**; ordenado: **0** | 30 arquivos `met/*.csv` |
| vazão de `aggTrade` | 08-21: 4.802.005, 55,6 msg/s, pico 3.224 · 08-23: 1.314.556, 15,2 msg/s, pico 2.861 · **08-20: 2.756.517, 31,9 msg/s, pico 3.468** | `awk -F, 'NR>1{c[int($6/1000)]++;n++}...'` |
| buraco local de `aggTrades` | 08-20 e 08-21 contíguos; **08-22 inteiro ausente** (1.620.908 aggTrades entre 3420055157 e 3421676065) | `sed -n 2p` / `tail -1` nos três CSVs |
| bucket em formação | aos 4 min de um bucket de 5 min: high final já conhecido em **77,4%**, low em 78,8%, ambos 56,6%; **90,0% do range já realizado** | `awk` sobre `BTCUSDT-aggTrades-2026-08-23.csv`, 288 buckets |
| `exchangeInfo` | 570 perp TRADING · **25 `tickSize` distintos** · `pricePrecision` 1..8 · **20 símbolos com `baseAsset` `^\d`** · **zero campo de multiplicador** · `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` TRADING com delisting em 2026-08-26 | `json` sobre `ei.json` |
| `/fapi/v1/openInterest` | publica **só** `openInterest` em contratos-base; não há coluna de notional | `cat oi_one.json` |
| precisão da fonte | `sumOpenInterest: "105832.81400000"` (8 casas de payload, 3 de conteúdo); `quantityPrecision` BTCUSDT=3, COTIUSDT=0 | `rest_oi.json`, `ei.json` |
| aritmética de pixel | 1200 px / 24 h: espaçamento de OI 4,167 px; disco 12 px ⇒ **65% de sobreposição**; trilho de 10 min = 2× o intervalo; janela máxima para pontos discretos = **8,33 h**; candle 1m = 0,833 px | função pura de `largura`, `n`, `d` |
| custo do envelope no fio | 519 B/célula vs 54 B = **9,6×**; 570×6 → 1.733 KB vs 180 KB | serialização dos campos declarados |
| paleta | azul↔laranja **PASS** (protan ΔE 24,7 claro / 26,8 escuro) · verde↔vermelho **WARN** (7,2) · paleta de 4 papéis **FAIL**: `critical ↔ laranja` ΔE 10,8 < piso 15 | `dataviz/scripts/validate_palette.js`, `--pairs all`, nos dois modos |

### 6.2 HERDADO e reproduzido em validação independente (força máxima, comando em `docs/recorte-plataforma.md` §6.1)

Shift `+300000` com MAE 0,000000 e 288/288 · lookahead do taker `r = +0,5458` com o retorno dos 5 min seguintes · 13/30 dias fora de ordem com corte em 2026-08-11 · 8.873.078 linhas de `aggTrades` com 0 saltos de `agg_id` · autocorrelação 0,99+ nas três séries de posicionamento contra ~0 no taker e `|r| < 0,10` em 12/12 pares · **21,6%** do universo cripto-perpétuo desaparecido · `1000XECUSDT` 8h→1h→4h em julho/2026 · `p99|Δ15m|` do taker 824,6% contra 0,75% do OI · 55,1% da variação de `sum_open_interest_value` sendo preço · `sign(Δnotional) == sign(Δpreço)` em 100% dos buckets de sinal oposto · ETL 0,86 s/arquivo · `hot+warm+cold = 80,8%` do `R_efetivo` da Coinalyze.

### 6.3 DOC PÚBLICO, com citação (força média — o owner confere na fonte)

Binance *Open Interest Statistics*: `timestamp` = "End time of the period" · *Aggregate Trade Streams*: "the insurance fund trades and ADL trades won't be aggregated" — o CVD de `aggTrade` exclui por construção o fluxo forçado, exatamente o regime de cascata · *Liquidation Order Streams*: "For each symbol, only the latest one liquidation order within 1000ms will be pushed" — **qualquer soma sobre esse stream é limite inferior**, e a tela escreve isso ao lado do número · WS: desconexão garantida a cada 24 h ⇒ reconexão é rotina, e S1 mostra reconexão como normal, não como erro · `REQUEST_WEIGHT 2400/min` · Redis Pub/Sub é at-most-once ("the message is forever lost") ⇒ Streams + consumer group · TimescaleDB `interpolate` interpola entre anterior **e posterior** (lookahead por construção); `locf` é seguro · ClickHouse: dedupe "only during a merge... at an unknown time" — para soma acumulada, unicidade eventual não serve · Coinalyze `coinalyze.txt` l.39/l.43/l.218/l.399-406.

**Verificação pendente contra doc pública, nomeada:** a direção do acúmulo do funding (a taxa liquidada em `T` cobre o intervalo que termina em `T` ou o que começa nele) — seção *Funding Rate* / `Get Funding Rate History`. **Não foi lida nesta rodada.** O item 9 dos anti-padrões (§3.2) não depende dela: a medição de 18,01% torna qualquer projeção para frente uma afirmação sobre intervalo não observado, independentemente da direção.

### 6.4 DOC-ONLY, sem nenhuma chamada — toda a Coinalyze

**Zero endpoints chamados. Não há API key.** Toda a linha de coletor Coinalyze em S1, a coluna de liquidação, a retenção de 24 h a 1 min e a `janela_de_perda` correspondente são **especificação contra documentação de fornecedor**. `janela_de_perda` herda o tratamento de tinta fraca: `~24 h (doc, não medido)` — porque "1500–2000 datapoints" pode ser **teto de resposta**, não retenção, e nenhum teste confirma. A gaveta de quarentena diz `fonte não verificada`, nunca `ok`.

### 6.5 NÃO MEDIDO — declarado, com o teste que fecha cada um

`lag_ms` real por endpoint (n=2 transições, 1 símbolo, janela de 10 min) — **enquanto M-1 não rodar, toda idade exibida em painel ao vivo é constante adivinhada, e a tela diz isso; prevê-lo não é medi-lo** · topologia do balde de rate limit (2,85 vs 14,25 min — decide se S4 ao vivo existe e se o guard anti-lookahead vale) · headers de peso em `/futures/data/*` (CONTESTADO, fecha com um `curl -sD -`) · `max_staleness` das 3 séries de posicionamento e de qualquer série Coinalyze (só OI foi medido) · limiar de silêncio do WS para símbolo fino (55,6 msg/s é BTC; um alt fica minutos sem trade legitimamente) · custo de renderização de tabela com 20–36 sparklines (a aritmética de §S4 é de altura de viewport, **não benchmark**) · TradingView Lightweight Charts com eixo X em tempo de parede e 288 pontos + 1.440 candles no mesmo eixo — **é o maior risco técnico desta especificação e não foi medido**; o teste é conferir se as coordenadas X dos pontos batem com os `event_time` originais, com tolerância de 0,5 px · throughput de TimescaleDB vs ClickHouse — **nenhum dos dois foi instalado; não tenho número e não vou inventar um**.

### 6.6 OPINIÃO DE UX, sem medição — rotulada sem constrangimento

Decisão de tela raramente é mensurável a priori. Estas são julgamento, e o owner as derruba com uma frase se discordar:

- **Que S2 domina o tempo do owner em regime permanente.** É inferência a partir dos entregáveis da fase (o corpus de fixtures é o único artefato que só um humano produz), não observação dele operando. Se na prática ele viver em S4, a hierarquia inverte e S4 precisa de teclado. Mede-se com log de navegação depois da primeira semana de uso real.
- **Que só S2 tem licença para ser densa e ter atalhos aprendidos**, e que S1/S3/S4 são otimizadas para reconhecimento na primeira leitura depois de duas semanas fora.
- **Que a ordenação padrão de S4 deve ser a watchlist declarada, não o percentil** — ordenar por percentil coloca no topo "o mais anômalo agora", o que é ranking de sinal com outro nome. A defesa medida (percentil é a única escala comparável) justifica **oferecer** a ordenação, não torná-la default. Não tenho medição de que isso induza viés de decisão no owner.
- **Que a coorte de L/S é seletor, nunca sobreposição** — apoiado no fato medido de que `r(global, top_position)` troca de sinal por símbolo (−0,40 BTC, +0,31 COTI), mas a conclusão de tela é minha.
- **Que armazenar sempre em UTC e exibir com o fuso escrito ao lado de todo timestamp é o desenho certo.** Qual fuso exibir por padrão é decisão do owner (C4), e trocá-la depois reescreve todo teste de fixture.
- **Que o gerenciador de presets é produto prematuro** e que o bundle hasheável na URL o substitui.
- **Que a ausência da afordância é a afirmação mais forte disponível** — S4 não tem nenhum botão com verbo por linha, e isso comunica "esta tela não age" melhor que qualquer texto. Sem medição.

### 6.7 O que eu declaro que não julgo

Escolha de exchange/corretora como decisão financeira · tamanho de posição e gestão de risco do capital do owner · jurisdição e regulação · se `MATIC→POL` deve ser série contínua para efeito de capital · se pagar assinatura de histórico intraday vale o preço · a ordem entre monitorar/pesquisar/executar (C5) · alvo de deploy (C3) · N e nomes da watchlist (C2) · entrada da Bybit (C6) · obtenção da chave Coinalyze (C1, e é o único item desta fase com relógio de expiração diário). Apresento trade-offs medidos e paro.

---

**Arquivos deste documento:** destino `/home/stharley/Documentos/projects/cripto-strategy/docs/plataforma-superficies-e-faseamento.md`. Insumos: `/home/stharley/Documentos/projects/cripto-strategy/docs/recorte-plataforma.md`, `/home/stharley/Documentos/projects/cripto-strategy/docs/avaliacao-discovery.md`, `/home/stharley/Documentos/projects/cripto-strategy/docs/proposta-discovery.md`, `/home/stharley/Documentos/projects/cripto-strategy/harness.toml`, e o insumo de UX em `data//insumo-para-ux.md`. Toda evidência empírica está em `data//`.

**Procedência desta rodada:** 4 desenhos de superfície (superfícies-e-jobs · painel multi-série · screener-distribuição · honestidade-do-dado) e 4 validações adversariais, uma por desenho, com ordem de atacar usando o dado real e o vetor específico *"esta tela mostra um número que a fonte não tem naquela cadência, naquele instante ou naquela unidade?"*. **Os quatro voltaram `SUSTENTADO_COM_CORRECOES`** — nenhum passou intacto, e os itens marcados como derrubados em §2 e §3.3 são exatamente o que o ataque derrubou. Nada foi escrito nem editado no repositório durante o desenho ou a validação.

---

## Procedência desta rodada

Rodada de 10 agentes, 2026-08-24, terceira e última da sequência de discovery:

- **4 lentes de UX/UI** (`general-purpose`, carregando as skills `ux-ui-mastery` e `dataviz`) —
  superfícies e jobs · painel multi-série · screener como distribuição · honestidade do dado.
  Cada uma recebeu como restrição de entrada os descasamentos dado↔tela já medidos.
- **4 validações adversariais** (`quant-architect`), uma por desenho, com um vetor que não
  existia nas rodadas anteriores: *"onde esta tela MENTE sobre o dado?"* — e ordem explícita
  de dizer quando o desenho está certo, em vez de inventar objeção. As quatro voltaram
  `SUSTENTADO_COM_CORRECOES`.
- **2 de fechamento** — este documento e [decisoes-do-owner.md](decisoes-do-owner.md).

Antecedentes: [proposta-discovery.md](proposta-discovery.md) →
[avaliacao-discovery.md](avaliacao-discovery.md) (89 achados) →
[recorte-plataforma.md](recorte-plataforma.md) (68 plataforma / 21 diferidos, contrato de
dados) → este documento.

Força da evidência, dita separada: os fatos de dado são **medidos sobre dado real** com o
comando junto. As decisões de tela são, em boa parte, **opinião de UX rotulada** — decisão de
interface raramente é mensurável a priori, e o documento diz onde é o caso. Toda a Coinalyze
continua **doc-only**: nenhuma chamada foi feita.
