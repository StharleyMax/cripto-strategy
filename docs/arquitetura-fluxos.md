# Arquitetura em diagramas — os quatro fluxos

**Data:** 2026-08-25 · **Deriva de:** [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) (`DRAFT`) e [`ADR-001`..`ADR-009`](adr/)
**Estado do ledger:** `SPEC_DRAFT` — **o gate `spec` é do owner e não foi dado.**

> ## ⚠️ Leia isto antes dos diagramas
>
> **Nada aqui está implementado. Zero linha de código existe neste repositório.** O que os diagramas
> mostram é o **contrato especificado**, não um sistema em operação. Onde um caminho está **decidido**,
> o diagrama é sólido; onde está **deferido** ou é **non-goal desta fase**, o diagrama diz isso na
> própria caixa. **Diagrama que não distingue as duas coisas é o mesmo defeito que este projeto passou
> três rodadas corrigindo:** apresentar decisão onde há intenção.

| legenda | significado |
|---|---|
| linha cheia | caminho **decidido** em SPEC/ADR |
| linha tracejada | **deferido**, **aberto** ou **non-goal desta fase** |
| `⛔` | bloqueado por pergunta do owner em aberto |
| `[NÃO MEDIDO]` | número que falta para fechar a decisão |

---

## 0. Visão geral — e a fronteira que é a razão de a plataforma existir

**Nenhuma superfície chama endpoint de exchange direto.** Tudo lê o store local, **inclusive `OI (agora)`**,
que é série ingerida como qualquer outra — senão os quatro campos do selo ficam impreenchíveis
([`SPEC-001` §4.1](specs/SPEC-001-plataforma-dados.md)).

```mermaid
flowchart LR
  subgraph FONTES["Fontes de terceiro"]
    BD["data.binance.vision<br/>dumps diarios e mensais"]
    BR["Binance REST<br/>fapi + futures/data"]
    BW["Binance WebSocket<br/>forceOrder, aggTrade"]
    CZ["Coinalyze API v1<br/>EM QUARENTENA"]
  end

  subgraph BACK["backend/ · Python + FastAPI"]
    ING["bounded context: ingestion<br/>componente sentimento"]
    Q[("fila duravel")]
    W["ESCRITOR UNICO<br/>le-antes-de-escrever"]
    CAT["bounded context: catalog<br/>series_catalog"]
    REG["bounded context: registry<br/>ingest_run, ingest_gap, run_registry"]
    API["porta de leitura<br/>as_of + duas portas tipadas"]
  end

  subgraph STORE["Store PARTIDO · ADR-002 D1"]
    PG[("PostgreSQL 15 ja de pe<br/>catalogo, registro, instrumento SCD-2")]
    COL[("Store COLUNAR append-only<br/>serie de mercado<br/>FINALISTA PENDENTE DE SPIKE")]
  end

  subgraph FRONT["frontend/ · Next"]
    WEB["componente web<br/>rotas, sessao, bundle-URL"]
    CH["componente charts<br/>serie tipada para coordenada"]
  end

  BD --> ING
  BR --> ING
  BW --> ING
  CZ -.-> ING
  ING --> Q --> W
  W --> PG
  W --> COL
  CAT --- PG
  REG --- PG
  PG --> API
  COL --> API
  API --> WEB --> CH

  BT["componente backtest<br/>run_registry"]
  CV["componente convergencia<br/>DIFERIDO: enum com zero linha"]
  API --> BT
  API -.-> CV

  classDef deferido stroke-dasharray: 5 5
  class CV,CZ,COL deferido
```

**Duas coisas neste desenho são decisões, não desenho:**

- **O store é partido** ([`ADR-002`](adr/ADR-002-motor-de-armazenamento.md) D1), e isso fecha a alternativa
  *"um motor para tudo"* — que era a forma implícita em que a pergunta vinha sendo feita, e é falsa. Catálogo,
  registro e instrumento são **OLTP de verdade** (SCD-2, chave estrangeira, unicidade forte, leitura pontual) e
  vão para o `postgres:15` **que já está de pé** ⇒ zero container novo. A série é **OLAP puro** (append-only,
  varredura sequencial de backtest, agregação por bucket) e vai para store colunar.
- **A escrita é fan-in de escritor único** ([`SPEC-001` §4.2](specs/SPEC-001-plataforma-dados.md)), e isso é
  **contrato, não preferência**: duas invariantes exigem **ler antes de escrever**, e elas vivem na aplicação
  em **qualquer** dos cinco motores candidatos.

---

## 1. A estrutura de dados

### 1.1 A identidade — `SeriesKey`, 15 termos

Não existe "o OI". Existe uma série com identidade completa, e **pedir `OI` sem `reduction` é erro, nunca
default** — a Coinalyze devolve OI como **OHLC do bucket**, não como ponto, o que dá **quatro linhas de
catálogo, não três**.

```mermaid
flowchart TD
  SK["SeriesKey · 15 termos · IDENTIDADE"]
  SK --> A["provider · venue · instrument_id"]
  SK --> B["metric · cohort · interval"]
  SK --> C["unit · denom · verbatim da fonte"]
  SK --> D["nature: STOCK FLOW RATIO EVENT TICK"]
  SK --> E["ts_convention: POINT_AT_BUCKET_END<br/>AGGREGATE_OVER_BUCKET · OHLC_OVER_BUCKET"]
  SK --> F["reduction: POINT OPEN HIGH LOW CLOSE SUM MEAN LAST"]
  SK --> G["quantity_field: q / nq / NA"]
  SK --> H["label_shift · aggregation_scope · verified_by"]

  G --> G1["NA e valor EXPLICITO, nunca NULL<br/>NULL em termo de identidade produz<br/>duas linhas que nao se distinguem"]
  D --> D1["nature = FLOW  ⇒  LOCF e ERRO DE TIPO,<br/>nao escolha de UX"]
```

### 1.2 As sete colunas de procedência — em toda linha de série

Elas são o que separa esta plataforma de um dump de CSV. **Faltando qualquer uma, a linha é inválida.**

```mermaid
flowchart LR
  subgraph RELOGIOS["Os tres relogios · SPEC-001 §2.2"]
    ET["event_time<br/>instante do fato de mercado<br/>canonico = FECHO da janela"]
    AA["available_at<br/>o mais cedo em que um consumidor<br/>AO VIVO poderia saber"]
    IA["ingested_at<br/>auditoria"]
    OA["observed_at<br/>quando ESTA observacao entrou no store"]
  end

  subgraph OBS["O observador e propriedade do DADO"]
    OI2["observer_id"]
    OR["observer_region"]
  end

  subgraph PROC["Procedencia e ausencia"]
    P["provenance: OBSERVADO DERIVADO<br/>MODELADO HUMANO"]
    AU["Ausencia: SEM_PONTO NAO_LIDO<br/>QUARENTENA SEM_FONTE"]
    SR["src_label_raw · rotulo cru,<br/>NUNCA renderizavel"]
    AS["availability_source:<br/>OBSERVED ou MODELED"]
  end

  AA --- OI2
  AA --- OR
  OR --> LAG["tabela de defasagem e chaveada por<br/>endpoint + observer_region,<br/>NAO por endpoint"]
  LAG --> WARN["trocar de regiao INVALIDA a calibracao<br/>MODELED da regiao nova"]
```

**Por que `observer_region` é urgente e não cosmético:** os dumps vivem em `ap-northeast-1`. Um host em São
Paulo e um em Tóquio produzem `available_at` **sistematicamente diferentes**. É **coluna de F0, impossível
retroativamente** — e a região da VPS está `[NÃO MEDIDO]`.

### 1.3 As duas invariantes de armazenamento que quase tudo deriva

```mermaid
flowchart TD
  APP["Serie de mercado · APPEND-ONLY<br/>chave: series_key_id, symbol, source, bucket_end, observed_at"]
  APP --> I1["LACUNA NUNCA e preenchida no ARMAZENAMENTO"]
  I1 --> I2["LOCF existe SO na LEITURA,<br/>com max_staleness_ms explicito"]
  APP --> I3["o mesmo bucket pode ter N observacoes<br/>⇒ bitemporal por construcao"]
  I3 --> I4["as_of = argmin observed_at<br/>ENTRE as observacoes com available_at menor ou igual a t"]
  I4 --> I5["isto NAO e ASOF JOIN simples.<br/>e reducao bitemporal por janela · ADR-002 D7"]
  APP --> F1["cvd_delta por bucket e FATO · persistido"]
  F1 --> F2["cvd_cum e VIEW com ancora OBRIGATORIA<br/>mesmo dia, mesmo dado: -1265,982 / +399,745 / +1598,508 BTC<br/>O SINAL INVERTE"]
```

### 1.4 A quarentena — predicado de três termos, e ele não se abre com dois

```mermaid
flowchart LR
  IN["linha chegando do ingestor"] --> T{"label_shift IS NULL<br/>OR unit IS NULL<br/>OR available_at IS NULL ?"}
  T -->|"sim"| QR["GAVETA · serie nasce ISOLADA<br/>invariante: paineis sincronizados ∩ quarentena = 0"]
  T -->|"nao"| OK["catalogo publicado · pode sincronizar painel"]
  QR --> CZ2["Coinalyze: unit RESOLVIDO, label_shift RESOLVIDO,<br/>available_at NAO. Continua na gaveta.<br/>Sair exige Q19 ⛔"]
  NL["endpoint sem lag_ms medido<br/>grava available_at = NULL"] --> QR
  NL --> NEVER["NUNCA event_time, NUNCA event_time+interval<br/>esse default e 361x OTIMISTA<br/>nas linhas que nao se recapturam"]
```

---

## 2. Ingestão

### 2.1 O fluxo

```mermaid
flowchart TD
  subgraph COL["Coletores · componente sentimento"]
    direction LR
    C1["SNAPSHOT DATADO diario<br/>exchangeInfo + fundingInfo<br/>NAO precisa de host 24/7"]
    C2["ONE-SHOT Coinalyze daily<br/>1.140 chamadas ~ 28,5 min, uma vez<br/>NAO precisa de host 24/7"]
    C3["BACKFILL de dump<br/>metrics, klines, fundingRate, bookDepth"]
    C4["STREAM 24/7 ⛔<br/>forceOrder, agregado q/nq<br/>PRECISA de host 24/7"]
    C5["POLL 24/7 ⛔<br/>premiumIndex, probe de latencia"]
  end

  C1 --> FIL
  C2 --> FIL
  C3 --> FIL
  C4 --> FIL
  C5 --> FIL
  FIL[("FILA DURAVEL")] --> WR

  subgraph WR2["ESCRITOR UNICO · o unico que toca a serie"]
    WR["le-antes-de-escrever"]
    R1["CA-F3-12: backfill MODELADO<br/>NAO sobrescreve captura OBSERVADA"]
    R2["CA-F4-25: RECUSA sob divergencia<br/>de knowledge_time. Nunca numero<br/>diferente em silencio"]
    R3["ZL-2: zero-antes-do-primeiro-nao-zero<br/>daquele LADO vira SEM_FONTE,<br/>nunca zero legitimo"]
    R4["schema aditivo desconhecido:<br/>quarentena + alarme, NUNCA parar.<br/>caso real: a Binance ADICIONOU nq"]
    WR --- R1
    WR --- R2
    WR --- R3
    WR --- R4
  end

  WR --> PG[("PostgreSQL 15<br/>catalogo, registro, instrumento")]
  WR --> COLS[("store colunar<br/>serie append-only")]
  WR --> GAP["md.ingest_run + md.ingest_gap<br/>toda execucao registrada"]

  classDef bloq stroke-dasharray: 5 5
  class C4,C5 bloq
```

**O gate de F0 é declarado POR COLETOR, e é por isso que `CST-2` é partido em duas fases.** O snapshot diário
e o one-shot da Coinalyze **não precisam de `Q2`** — são um `GET` mais `gzip`. Os contínuos precisam.

### 2.2 O que a ingestão tem de decidir em cada linha, e onde ela erra em silêncio se não decidir

```mermaid
flowchart TD
  A["chegou um numero da fonte"] --> B{"o endpoint tem lag_ms MEDIDO?"}
  B -->|"sim"| C["available_at = OBSERVED<br/>carimbado com observer_id + observer_region"]
  B -->|"nao"| D["available_at = NULL · MODELED · QUARENTENA"]
  C --> E{"o rotulo da fonte e inicio ou fim do bucket?"}
  E --> F["label_shift com verified_by<br/>apontando UM TESTE que MEDIU o shift"]
  F --> G["errar o rotulo por UM bucket inverte<br/>o sinal do delta-OI de 15 min<br/>em 21,96% das janelas · n=8.629"]
  D --> H["carimbo MODELED arredonda SEMPRE PARA CIMA<br/>⇒ o erro e sempre PESSIMISTA.<br/>media ou mediana sao otimistas em metade dos casos"]
```

### 2.3 ⛔ O fato capture-or-lose que esta rodada descobriu: `CL-5`

```mermaid
flowchart LR
  N["campo nq do aggTrade<br/>quantidade EXCLUINDO ordens RPI"]
  N --> D1["dump data.binance.vision<br/>7 colunas. nq NAO e uma delas.<br/>MEDIDO"]
  N --> D2["REST fapi/v1/aggTrades<br/>T-48h: 200 com nq<br/>T-49h: 400 -4166<br/>'Search window is restricted<br/>to recent 2 days only'<br/>MEDIDO"]
  D1 --> L["nq existe numa janela<br/>DESLIZANTE DE 48 HORAS<br/>e em nenhum historico"]
  D2 --> L
  L --> W["cada dia sem captura e um dia<br/>de nq que nao volta de fonte nenhuma"]
  W --> IMP["deficit q-nq cai 99,95% no CVD<br/>e NAO se cancela entre os lados.<br/>6,01% de abs(cvd_delta) no dia medido.<br/>cvd_cum e soma acumulada ⇒ cresce sem limite"]
  IMP --> FIX["resolucao que NAO reabre captura de tick:<br/>agregado por bucket de 1 min,<br/>ordem de 10^2 B/bucket, ZERO chamada nova"]
```

---

## 3. Análise de estratégia e convergência

> ### ⚠️ Isto é **non-goal declarado desta fase**, e o diagrama existe para mostrar **a porta**, não o mecanismo
>
> O componente `convergencia` existe no vocabulário fechado com **zero linha**. São non-goals explícitos:
> limiar numérico de sinal · matriz de convergência · regra de entrada/SL/TP · métrica de performance ·
> **detectores SMC** (OB, FVG, BSL/SSL, BOS/CHoCH) · **detectores de pivô e níveis de Fibonacci** · critério
> de match · walk-forward · paper trading · execução ao vivo.
>
> **Nomear o vocabulário não move a fronteira.** `Q20` — SMC × pivôs+Fibonacci × os dois — está **aberta**, e
> ela decide o que a fase **seguinte** detecta.

### 3.1 O que esta fase entrega para que a próxima não seja migração

```mermaid
flowchart TD
  subgraph HOJE["ENTREGA DESTA FASE · os insumos de que os DOIS vocabularios dependem igualmente"]
    SW["primitivo swing_point<br/>em Anotacao"]
    PS["price_source POR USO<br/>ADR-007"]
    TK["tick_size e price_precision DATADOS"]
    TH["ThresholdSpec como TIPO-SOMA<br/>sem default em nenhum eixo"]
    AS2["porta as_of · reducao bitemporal"]
    GR["grade canonica: UMA funcao compartilhada<br/>entre grafico e motor"]
  end

  SW --> ARG["pivo E uma definicao de swing<br/>ancora de Fibonacci E um par de swings<br/>BOS/CHoCH E rompimento de swing<br/>BSL/SSL E extremo de swing"]
  ARG --> CONC["⇒ um corpus de SWINGS sobrevive a<br/>qualquer resposta de Q20.<br/>um corpus de ZONAS nao."]

  PS --> WHY["a escolha da serie DECIDE ONDE O SWING ESTA:<br/>ordenacao de highs entre buckets vizinhos<br/>INVERTE em 2,09% dos pares mark vs last,<br/>a de lows em 5,57%, e o bucket que contem<br/>o high do dia E DIFERENTE nas duas"]

  subgraph AMANHA["FASE SEGUINTE · non-goal aqui"]
    DET["detectores de estrutura ⛔ Q20"]
    MX["matriz de convergencia das tres camadas"]
    BTE["motor de backtest + metricas"]
  end

  SW -.-> DET
  PS -.-> DET
  TH -.-> MX
  AS2 -.-> BTE
  GR -.-> BTE

  classDef fut stroke-dasharray: 5 5
  class DET,MX,BTE fut
```

### 3.2 A tese em três camadas, e o que dela já tem dado contratado

A tese declarada pelo owner ([`direcionamento-operacional.md`](direcionamento-operacional.md)) é confirmação
cruzada de três camadas, em **15m / 1h / 4h**, com decisão **no fechamento do bucket**.

```mermaid
flowchart LR
  subgraph L1["1 · Estrutura de preco"]
    P1["klines OHLCV · 4 series de preco<br/>DADO CONTRATADO"]
    P2["pivos, Fibonacci, volume<br/>DETECCAO: fase seguinte ⛔"]
  end
  subgraph L2["2 · Sentimento e derivativos"]
    S1["OI grade 5m · 4 series de L/S<br/>funding: EVENTO raro, 3-6 pontos/dia<br/>DADO CONTRATADO"]
    S2["variacao de OI + funding como SINAL<br/>fase seguinte ⛔"]
  end
  subgraph L3["3 · Order flow"]
    O1["cvd_delta por bucket, FATO persistido<br/>kline 2*taker_buy - volume reproduz<br/>o delta do aggTrade: corr 1,000000<br/>DADO CONTRATADO"]
    O2["agressao e absorcao como SINAL<br/>fase seguinte ⛔"]
  end
  P1 --> P2
  S1 --> S2
  O1 --> O2
  P2 -.-> CONV["matriz de convergencia<br/>componente convergencia<br/>ZERO LINHA HOJE"]
  S2 -.-> CONV
  O2 -.-> CONV

  classDef fut stroke-dasharray: 5 5
  class P2,S2,O2,CONV fut
```

**Detalhe medido que muda o desenho:** o funding é **evento raro** (3–6 pontos/dia) e exige **trilho de
evento**, não série contínua. E a cobertura de OI por barra é **1,0 em 5m · 3,0 em 15m · 12,0 em 1h · 48,0 em
4h** — nos prazos declarados, toda barra tem OI, o que dissolveu o problema que dominou a rodada de UX.

---

## 4. Fluxo para exibir o gráfico — consultas e telas

### 4.1 As cinco superfícies

| superfície | job | fase | componente |
|---|---|---|---|
| **S1** console de coleta e retenção | *o que está sendo gravado, o que parou, quanto disso é perda permanente* | F3 | `web` |
| **S2** símbolo — multi-painel, replay as-of, marcação | *olhar uma série contra o preço e afirmar o que ela significa* | mínima em F1, completa em F4 | `charts` + `web` |
| **S3** inspetor de série | *o que este número é, e quais linhas exatas o produziram* | F2 | `web` |
| **S4** bancada de distribuição | *que taxa de disparo um limiar produziria — antes de escolher o limiar* | F4 | `charts` + `web` |
| **S5** universo point-in-time | **não é tela**: `universe_at(ts, filtro)` atrás de todo seletor | F3 | `sentimento` |

### 4.2 As duas rotas de transporte — por classe de tempo

```mermaid
flowchart TD
  U["owner abre uma tela"] --> WEBR["componente web · rota + bundle<br/>o bundle E a URL, versionado e hasheavel"]
  WEBR --> M{"a janela pedida inclui<br/>a borda direita do tempo?"}

  M -->|"nao · viewport fechado, COMO EM T, replay"| H["HTTP · resposta ENDERECAVEL POR CONTEUDO<br/>chave: series_key_id, symbol, interval,<br/>janela, knowledge_time, bar_policy"]
  H --> HC["imutavel por construcao:<br/>knowledge_time fixo ⇒ cacheavel para sempre.<br/>o cache E o knowledge_time"]

  M -->|"sim · AO VIVO"| S["SSE · um fluxo por sessao<br/>ENVELOPE DE BUCKET"]
  S --> SC["bucket_open_ts, cvd_delta_parcial,<br/>last_price, n_trades, seq<br/>a max(1 Hz, 1/TF)"]
  SC --> SC2["e a resolucao EXIBIDA da idade<br/>nunca e mais fina que 1/f"]

  HC --> PORT
  SC2 --> PORT
  PORT["duas PORTAS TIPADAS de leitura"]
  PORT --> VM["ValorDeMercado<br/>celula = valor ou ausencia, event_time, available_at<br/>+ referencia de coluna"]
  PORT --> AN["Anotacao<br/>provenance = HUMANO + chave completa de fixture"]
  VM --> CHR["componente charts · serie tipada → COORDENADA"]
  AN --> CHR
  CHR --> TELA["pixels"]

  NEVER["O BROWSER NUNCA RECEBE TICK<br/>4.802.005 aggTrades/dia num simbolo<br/>pico medido 3.468 msg/s"]
  NEVER -.->|"regra fixa · ADR-005"| S
```

### 4.3 O içamento — por que o envelope não vai na célula

**Medido: envelope completo por célula custa 519 B contra 54 B (9,6×)** ⇒ na tela de 570×6, **1.733 KB contra
180 KB**. E o envelope repetido por célula é a forma de o mesmo `SeriesKey` ser afirmado **3.420 vezes por
tela**, o que não é informação.

```mermaid
flowchart TD
  SE["SESSAO · 1x por tela"] --> SE1["fuso, agora, modo AO VIVO / COMO EM T,<br/>versao do bundle, env, principal_id"]
  PA["PAINEL · 1x por painel"] --> PA1["SeriesKey, source, unit, denom, provenance,<br/>label_shift, universo, n lido / n esperado<br/>SEMPRE VISIVEL, NUNCA em tooltip"]
  CE["CELULA · por ponto"] --> CE1["valor ou ausencia, event_time, available_at<br/>+ referencia a coluna. So a IDADE."]
  CE1 --> INV["o invariante de tipo se preserva porque<br/>a celula continua SEM CONSTRUTOR a partir de number"]
```

### 4.4 O selo — quatro campos, sem hover

**Nenhum numeral de mercado renderiza sem selo, visível sem hover. Tooltip não conta.**

```mermaid
flowchart LR
  SELO["SELO · 4 campos"] --> S1B["SERIE · rotulo lido do CATALOGO<br/>'OI · grade 5m · BTC · bn-dump'<br/>as strings OI, funding, L/S, CVD<br/>SOZINHAS NAO EXISTEM NA UI"]
  SELO --> S2B["IDADE · tempo_de_referencia - available_at<br/>SO na borda direita do tempo.<br/>OBSERVED tinta normal · MODELED tinta fraca com ~<br/>'idade ?' quando lag_ms nao foi medido"]
  SELO --> S3B["PROCEDENCIA · OBSERVADO / DERIVADO com a expressao /<br/>MODELADO / HUMANO"]
  SELO --> S4B["COMPLETUDE · '285/288 · 1 lacuna' para serie de grade<br/>'contiguidade (N saltos de agg_id)' para serie de tick,<br/>que NAO TEM n_expected"]
  S2B --> Z["um grafico de 3 dias tem ZERO carimbos<br/>de idade, e isso esta CERTO"]
```

### 4.5 A fronteira `charts` ⇄ `web` — decidível por inspeção

```mermaid
flowchart LR
  subgraph WEBC["componente web"]
    W1["rotas · sessao e identidade"]
    W2["bundle ↔ URL"]
    W3["selecao de simbolo, janela, TF"]
    W4["chrome: selo de sessao, chip de env, pointer_mode"]
  end
  subgraph CHC["componente charts"]
    K1["grade canonica COMPARTILHADA"]
    K2["tempo→x e valor→y · escalas"]
    K3["politica de ausencia por nature"]
    K4["trilho de vigencia · overlay de anotacao"]
  end
  WEBC -->|"entrega serie TIPADA como ARGUMENTO"| CHC
  CHC -->|"devolve COORDENADA"| WEBC

  FR1["FR-1 · charts NAO faz I/O<br/>zero fetch, zero rota, zero localStorage<br/>⇒ testavel sem servidor e sem rede"]
  FR2["FR-2 · web NAO calcula geometria<br/>nenhum px, nenhuma escala<br/>⇒ impede a SEGUNDA implementacao da grade,<br/>que e o modo de falha em que a tela<br/>e o motor discordam do que aconteceu"]
```

### 4.6 Reprodutibilidade — o que garante que a tela e o motor contem a mesma história

```mermaid
flowchart TD
  R["reproduzir(run) = bundle_hash + window + knowledge_time"]
  R --> T1["1. roda um scan"]
  T1 --> T2["2. ingere observacao ATRASADA de um bucket<br/>DENTRO da janela ja avaliada<br/>o store e append-only e bitemporal: isso ACONTECE"]
  T2 --> T3["3. roda de novo com o MESMO bundle e a MESMA janela"]
  T3 --> AC{"aceite"}
  AC -->|"ok"| A1["resultado IDENTICO"]
  AC -->|"ok"| A2["ou o sistema RECUSA apontando<br/>divergencia de knowledge_time"]
  AC -->|"FALHA"| A3["numero diferente EM SILENCIO<br/>sob o mesmo bundle_hash"]
```

---

## 5. Alertas

> ### ⚠️ **Não existe canal de alerta, e isso é uma pergunta aberta do owner — `Q3`.**
>
> O owner disse que a ausência de alertas não é impeditivo. Concordo que não gateia a fase — **mas há um
> detalhe que muda a conclusão**, e ele já está registrado na SPEC: *"coletor parado"* é **P1 com orçamento de
> 24 h**, e o dado que ele deixa de capturar é da classe que **não se recaptura**. Um alerta que depende de uma
> aba aberta não é alerta: **tela fechada não avisa ninguém.**

### 5.1 O que existe hoje, e o que é o buraco

```mermaid
flowchart TD
  subgraph EXISTE["ESPECIFICADO"]
    D1B["S1 console de coleta · F3<br/>DIAGNOSTICO, nao alarme.<br/>'onde se diagnostica DEPOIS de ser avisado'"]
    D2B["quarentena + alarme INTERNO<br/>em campo aditivo desconhecido<br/>nunca parar a ingestao"]
    D3B["md.ingest_gap · toda lacuna registrada<br/>com a classe de ausencia"]
    D4B["DETECTOR ja fixado:<br/>contiguidade de agg_id + heartbeat<br/>NUNCA taxa"]
  end

  subgraph BURACO["⛔ NAO EXISTE · Q3 ABERTA"]
    N1["canal FORA do browser<br/>e-mail? telegram? webhook? systemd?"]
    N2["politica de escalonamento e de silenciamento"]
    N3["quem e acordado, e em quanto tempo"]
  end

  D4B --> WHY["por que NAO taxa: a vazao do MESMO simbolo<br/>variou 3,66x entre dois dias medidos.<br/>alarme por taxa dispara em dia calmo<br/>e cala em coletor morto"]
  D1B -.->|"nao substitui"| N1
  P1L["SLO: 'coletor parado' e P1,<br/>orcamento de 24 h"] --> N1

  classDef falta stroke-dasharray: 5 5
  class N1,N2,N3 falta
```

**O que já está decidido e é a parte difícil:** o **detector**. Alarme por taxa é a armadilha óbvia e está
proibida com número — a vazão do mesmo símbolo variou **3,66×** entre dois dias, então um limiar de taxa
dispara em dia calmo e **cala em coletor morto**. O que sobra é **contiguidade de `agg_id` + heartbeat**, que
detecta parada real sem falso positivo de mercado quieto.

**O que falta é só o transporte da notificação** — e é isso que `Q3` pergunta.

---

## 6. Onde cada fluxo está bloqueado

| fluxo | estado | bloqueio |
|---|---|---|
| **Ingestão** — snapshot datado, one-shot Coinalyze, backfill de dump | especificado, **sem bloqueio de owner** | `Q1` para ligar |
| **Ingestão** — coletores contínuos (`forceOrder`, agregado `q`/`nq`, probe) | especificado | ⛔ `Q1` + `Q2` + `Q19`, e **`Q17`** para spread |
| **Estrutura de dados** — contrato temporal e identidade | especificado, **offline, sem rede, sem chave** | nenhum |
| **Gráfico** — S2-mínima | especificado | ⛔ `Q16` |
| **Gráfico** — S1, S3, S4, S2 completa | especificado | ⛔ `Q3`, `Q10`, `Q11`, `Q13`, `Q18` |
| **Motor de armazenamento** — finalista | **deferido a spike, com 5 critérios declarados antes** | `free -m` · `df -h` · região `[NÃO MEDIDO]` |
| **Estratégia e convergência** | **non-goal desta fase** | ⛔ `Q20` decide a fase seguinte |
| **Alertas** | **não existe** — detector fixado, transporte não | ⛔ `Q3` |

---

## 7. Procedência

Todo diagrama acima deriva de documento deste repositório, não de desenho novo:

| diagrama | fonte |
|---|---|
| §0 visão geral, §1.1–1.4 estrutura de dados | [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §2, §3, §4.1, §4.2, §5.2, §5.3 |
| §2 ingestão | [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §1.4, §4.2, §5.3, §5.6 · [`ADR-008`](adr/ADR-008-registro-cru-de-f0.md) · plano [`02`](plans/SPEC-001-plataforma-dados/02_captura_sem_gate_de_host.md), [`03`](plans/SPEC-001-plataforma-dados/03_captura_continua.md) |
| §2.3 `CL-5` (a janela de 48 h) | [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §1.4 · **e re-medido em 2026-08-25** (ver abaixo) |
| §3 estratégia e convergência | [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §3.6, §3.7, §4.1 · [`PRD-001`](specs/PRD-001-plataforma-dados.md) §12 · [`direcionamento-operacional`](direcionamento-operacional.md) |
| §4 gráfico | [`ADR-003`](adr/ADR-003-fronteira-charts-web.md) · [`ADR-005`](adr/ADR-005-transporte-de-leitura.md) · [`ADR-006`](adr/ADR-006-max-staleness-por-serie.md) · [`ADR-007`](adr/ADR-007-price-source-por-uso.md) · [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §6, §7 |
| §5 alertas | [`SPEC-001`](specs/SPEC-001-plataforma-dados.md) §9 (`Q3`) · plano [`07`](plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md) |
| §0/§1 store partido | [`ADR-002`](adr/ADR-002-motor-de-armazenamento.md) D1–D7 · [`premissas-de-infra-e-stack`](premissas-de-infra-e-stack.md) |

**Verificação independente da janela de 48 h de `nq`, feita para este documento:**

```
$ head -1 data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv
agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker   # 7 colunas, sem nq

$ curl "…/fapi/v1/aggTrades?symbol=BTCUSDT&limit=5&startTime=<T-48h>&endTime=<+5min>"
200 · campo "nq" presente
$ curl "…&startTime=<T-49h>…"
400 · {"code":-4166,"msg":"Search window is restricted to recent 2 days only."}
```
