# PRD-009 — Painéis de fluxo: o gráfico do símbolo no layout Coinalyze/TradingView

> **Status em 2026-09-26: PARCIAL.** SPEC-009 prevalece: RN-5 → ADR-045/D1 (open = p(T0)); TFs = {1m,5m,15m,1h,4h}; RATIO usa last sob allowlist (ADR-040); latência 160/400 ms.
> Verdade corrente e contradições: [`docs/MAPA-DOCUMENTAL.md`](../MAPA-DOCUMENTAL.md) §3 #37,55.

**Feature:** `paineis-de-fluxo` · **sem mãe declarada** `[INFERRED: escolha do loop principal — DISCOVERY §0; o owner pode relacionar com `harness pipeline relate`]`
**Componente primário:** `web` · **toca:** `charts` (composição de pane) · `sentimento` **só** se `[Q-OI-1]` escolher `O-2`
**Estado do ledger ao escrever:** `INIT`, 2 eventos (`init` 20:16:32Z, `dispatch pm` 20:17:04Z)
`[MEDIDO 2026-09-23: harness pipeline show paineis-de-fluxo]`
**Entrada:** [`handoff/DISCOVERY.md`](../context/paineis-de-fluxo/handoff/DISCOVERY.md) +
imagem [`referencia/coinalyze-tradingview-2026-09-23.png`](../context/paineis-de-fluxo/handoff/referencia/coinalyze-tradingview-2026-09-23.png)

---

## 0. Como ler este documento

Toda afirmação quantitativa carrega o comando, o universo e o rótulo (`CLAUDE.md`). As medições de
§1.2 foram **re-rodadas por este `/pm`** em 2026-09-23 contra a stack local de pé (`deploy-*`,
`docker ps`). **Onde a medição corrigiu o DISCOVERY, a linha diz** — a correção é o achado (M2).

O `/pm` não decide o que pertence a ADR em vigor nem o que é escolha do owner: §13 traz os menus
com o custo de cada opção, e §14 classifica cada pergunta.

---

## 1. Contexto e problema

### 1.1 A fala do owner — literal, na grafia dele

`[PREMISSA-OWNER: 2026-09-23]`

> *"o OI n deveria ter uma estratégia parecda com o do coinalyzse. Tivemos uma discussão grande encima
> disso, a ideia é capturar onde ta entrando contratos. Aqui n me parece ter respeitado isso. então o OI é
> ujm views de confirmação, o preco pode estar caindo, porém se ta entrando OI, quer dizer que tem
> intencÁào n queda e vice versa"*

> *"Quero ter essa visão do volume, OI e liquidações. Inclusive o ajuste em como o gráfico é apresentado,
> pq hj ta uma presepada feia para caralho. então vamos manter essa forma de separação bem procima da
> coinalyze e tradingview."*

**Leitura do `/pm`** `[INFERRED: leitura de agente, não fala do owner]`: a primeira fala pede uma
**forma** (o OI tem de mostrar, bucket a bucket, se contrato *entrou* ou *saiu*), não uma **fonte**.
Ela **não pede literalmente** OI agregado entre corretoras — e isso importa porque o universo do OI
já foi **escolhido** pelo owner em 2026-09-19 (§3, `D-a`). Por isso a pergunta de universo sai em
§13-C como **confirmação**, e não como decisão nova embutida.

### 1.2 O que está medido — 9 fatos, o comando de cada um

| # | fato | comando · universo | rótulo |
|---|---|---|---|
| M1 | O catálogo servido tem **76** entradas sobre **4** símbolos (`BTCUSDT`·`ETHUSDT`·`LINKUSDT`·`SOLUSDT`) | `curl -s localhost:8000/api/v1/series-catalog` → `n_entries`, `n=76` | `[MEDIDO 2026-09-23]` |
| M2 | ⚠️ **Correção do DISCOVERY §2.** As 4 séries OI OHLC da Coinalyze (`coinalyze·sum_open_interest·5m·OPEN/HIGH/LOW/CLOSE`) **existem no catálogo (16 entradas = 4×4) e têm ZERO linha em `md.series`, em todos os símbolos, desde sempre.** O DISCOVERY dizia *"dado já capturado"*; é **catálogo declarado, não dado** | `select source,symbol,count(*) from md.series where source ilike '%open-interest%' or source ilike '%openinterest%' group by 1,2` → só `/futures/data/openInterestHist` (Binance) aparece; `n=4` símbolos | `[MEDIDO 2026-09-23]` |
| M3 | O OI da Binance (`/futures/data/openInterestHist`, `5m`, `Reduction.POINT`) tem **1.730 buckets distintos de 2.016 esperados** em 7 dias (**85,8%**), em **5 buracos**, o maior de **1.095 min** (~18 h). Nas últimas 24 h: **234** buckets | `with b as (select distinct bucket_end … symbol='BTCUSDT' and bucket_end > now−7d) select count(*), (max−min)/300000+1, sum(gap>300000), max(gap)/60000 …` | `[MEDIDO 2026-09-23, BTCUSDT]` |
| M4 | Liquidação: **2** séries por símbolo (`coinalyze·sum_liquidation·1m·SUM`, `cohort=long`/`short`), dado desde **2026-09-12 21:45** | `select source,count(*),count(distinct series_key_id),min,max … group by source`, `BTCUSDT` | `[MEDIDO 2026-09-23]` |
| M5 | Volume e delta já são séries separadas: `binance·klines_volume·1m·SUM` e `binance·cvd_source·1m·SUM` (`kline_cvd_delta = 2·takerBuy − volume`, `domain/kline_cvd.py:66`) ⇒ **compra = (V+Δ)/2, venda = (V−Δ)/2 derivam na leitura, sem série nova** | catálogo de M1 filtrado por `metric` + leitura do arquivo | `[MEDIDO]` + `[DOC]` |
| M6 | `lightweight-charts` instalado é **5.2.1**, e há **zero** uso de `addPane`/`paneIndex` | `grep '"version"' frontend/node_modules/lightweight-charts/package.json`; `grep -n 'addPane\|paneIndex' frontend/src/app/symbol/SymbolClient.tsx` → nenhuma linha | `[MEDIDO 2026-09-23]` |
| M7 | `SymbolClient.tsx` tem **2.936** linhas; um único ponto de `createChart` (`:562`) instanciado por pane, e **10** `addSeries` | `wc -l`; `grep -n 'createChart\|addSeries(' …` | `[MEDIDO 2026-09-23]` |
| M8 | Hoje: volume em **cor única** (`:1197`), OI em **linha cor única** (`:1416`), liquidações em **dois gráficos** (`:1804`, `:1887`) | `[DOC: DISCOVERY §2, lido em fbad424]` | `[DOC]` |
| M9 | Teto de história servida: `MAX_HISTORY_DAYS = 90` (`domain/history_ceiling.py:67`); retenção Coinalyze OI `5min` **~7,0 dias** | `grep -rn 'MAX_HISTORY_DAYS\s*[:=]' backend/src`; `[DOC: docs/medicao-coinalyze.md:39]` | `[MEDIDO]` + `[DOC]` |

### 1.3 O diagnóstico — três lacunas de gênero diferente

1. **Estrutura** (`web`/`charts`): seis canvases que se sincronizam (`axis-sync.ts`) não são *um*
   gráfico com panes — há seis eixos de tempo, seis crosshairs e moldura entre eles. É a
   *"presepada"* da fala.
2. **Forma de três métricas** (`web`): volume sem direção, OI sem direção, liquidação partida em dois.
3. **Forma do OI exige dado que a origem não tem** (`sentimento`?): um candle de OI precisa de
   `open`/`high`/`low` por bucket. A Binance publica **um ponto** por 5 min (M3); a Coinalyze
   publicaria OHLC, mas **nada foi capturado** (M2). ⇒ §13-A é a pergunta de maior alavancagem.

---

## 2. Objetivo

O `/symbol/[symbol]` vira **um gráfico com panes empilhados sobre um único eixo de tempo**, como a
referência: (1) preço em candle com volume colorido pela direção no rodapé do mesmo pane; (2) OI em
candle colorido por direção — verde = entrou contrato, vermelho = saiu; (3) liquidações long/short
num pane só, em lados opostos do zero; (4) CVD e long/short **migram** para a pilha sem mudar de
forma; (5) cada pane com legenda **nome + valor** no canto superior esquerdo e crosshair vertical
compartilhado.

**O que isto entrega ao uso declarado:** ler, no mesmo instante vertical, *preço caiu + candle de OI
verde* = contrato entrando na queda — a leitura de confirmação que o owner descreveu, **sem** que o
sistema a rotule (o marcador é `convergencia`, NG-1).

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo / onde | efeito aqui |
|---|---|---|---|
| **D-a** | **OI na origem: Binance USDT-M, em contratos (`unit=BTC`, `denom=base`)**; `F5` de `PRD-008` fora do plano | `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — `SPEC-008 §8.1`, `DECISOES-DO-OWNER-2026-09-19.md §M-2` | só o owner reverte. §13-C pergunta se a fala nova reverte — **não presume** |
| **D-b** | Unidade do OI = contratos, não USD (nocional apaga o caso *"mercado caiu e OI subiu"*) | `[DOC: SPEC-008 §8.1]` | o candle de OI é em contratos; legenda soletra a unidade |
| **D-c** | `ADR-036/D2` — terceiro só onde a origem é vetada, não existe, ou perde dado sem volta | `[DOC]` | `O-2` (§13-A) só passa se o dono de `ADR-036` julgar que *"OHLC de OI não existe na origem"* satisfaz o teste |
| **D-d** | Liquidação tem **duas pernas, nunca somadas** (`liquidation_catalog.py:1-11`) | `[DOC]` | o pane único desenha **duas** séries; líquido é proibido (`RN-3`) |
| **D-e** | TFs `5m·15m·1h·4h`; reagregação por `Nature` (`FLOW` soma · `STOCK` último/OHLC · `RATIO` recomputa) — `ADR-040` | `[PREMISSA-OWNER: 2026-09-19]` + `[DOC]` | o candle de OI é reagregação `STOCK` OHLC por TF |
| **D-f** | Rota `/symbol/[symbol]`, inglês; navegação client-driven de `ADR-043` (**proposta**, 2026-09-23) | `[DECISÃO-OWNER: 2026-09-19]` + `[DOC]` | F1 reescreve o mesmo arquivo que `ADR-043` toca ⇒ dependência de sequência (§4.2) |
| **D-g** | Proibido semear dado sintético no Postgres compartilhado | `[DOC: MEMORY.md]` | Playwright lê dado real |
| **D-h** | Sem mobile no piloto | `[PREMISSA-OWNER: 2026-09-11]` | desktop |
| **D-i** | Design: `ui-designer` no Stitch + gate `ux-ui-mastery`; **Figma proibido** | `CLAUDE.md` §Design | toda fase com pixel novo passa pelo gate |
| **D-j** | Premissas de infra: VPS compartilhada, só Postgres | `[PREMISSA-OWNER: 2026-08-25]` | `O-2` declara pegada de disco antes de escrever |

---

## 4. Escopo

### 4.1 Dentro

| # | entrega | componente | fase |
|---|---|---|---|
| E-1 | Um gráfico, panes empilhados, **um** eixo de tempo no rodapé, crosshair compartilhado, legenda nome+valor por pane — **formas atuais preservadas** | `web`/`charts` | F1 |
| E-2 | Volume em barras no rodapé do pane de preço, **cor pela direção do candle** | `web` | F2 |
| E-3 | OI em **candle por direção**, em contratos, na origem de `D-a` | `web` (+ `sentimento` se `O-2`) | F3 |
| E-4 | Liquidações **long e short num pane só**, lados opostos do zero, legenda com os dois valores | `web` | F4 |

### 4.2 O que esta feature assume das irmãs — referência, não cópia

- **`candle-real-e-eixo-unico`** (`BUILD_AUTHORIZED`, 5 fases QA=APPROVED, aguarda `advance DONE` do
  owner) `[MEDIDO: harness status]`: a vela real, o TF e a história sob demanda **são dela**. Esta
  feature **reusa** o pager e o `slot-coverage`; não os redesenha.
- **`ADR-043`** (proposta) reescreve a navegação no mesmo `SymbolClient.tsx`. ⚠️ **Duas features
  editando o arquivo de 2.936 linhas ao mesmo tempo** é conflito garantido: o `/architect` sequencia
  (F1 depois das pernas de `ADR-043`, ou o contrário), e declara qual.
- **`coinalyze-fora-da-quarentena`** (`SPEC_APPROVED`): se `O-2` for escolhida, a série nasce sob o
  predicado de 3 termos daquela feature — **visível na tela, invisível ao backtest até ela entregar**.

---

## 5. User stories — fronteira por fase (`DoD-VERTICAL`: toda fase termina em pixel verificável)

### F1 · O esqueleto — `web`/`charts`

> **Como** operador do `/symbol`, **quero** ver preço, OI, CVD, long/short e liquidação **num só
> gráfico** com um eixo de tempo no rodapé e uma linha vertical que corta todos os panes, **para**
> ler todas as métricas no mesmo instante sem seis gráficos soltos.

- **Fronteira:** estrutura + legenda. **Nenhuma** forma de série muda (volume segue cor única, OI
  segue linha, liquidação segue em duas séries — agora dois panes da mesma pilha).
- **Por que o layout é fase própria, e não diluído nas outras** `[INFERRED: custo de reversão]`:
  migrar um pane por fase deixaria **dois layouts na tela ao mesmo tempo** (pilha nova + canvases
  velhos) por três fases — duas verdades na mesma tela, o defeito que este repositório mais paga.
- **Pixel:** os 5 panes com `N>0` pontos no DOM **dentro de um único gráfico**, e a legenda de cada
  pane = último valor de `/series-history` do mesmo `series_key_id`.

### F2 · O volume com direção — `web`

> **Como** operador, **quero** as barras de volume verdes quando o candle fechou acima da abertura e
> vermelhas quando fechou abaixo, **para** ver onde o volume empurrou o preço.

- **Fronteira:** função de cor do histograma; **zero** dado novo (M5). A escala (`log10` hoje —
  `PRD-008 [Q8]`) é de `design_gate`; a referência usa linear no rodapé (§14 `[Q-VOL-2]`).

### F3 · O OI que diz se contrato entrou — `web` (+ `sentimento` se `O-2`)

> **Como** operador, **quero** o OI em candle verde quando o bucket terminou com mais contratos do
> que começou e vermelho quando terminou com menos, **para** confirmar (ou negar) o movimento do
> preço: preço caindo com OI verde é gente nova entrando vendida.

- **Fronteira:** depende de `[Q-OI-1]` (§13-A). Com `O-1`, é só `web`; com `O-2`, ganha coletor e
  série em `sentimento` e **deixa de caber numa fase** — vira `F3a` (captura até `md.series`) +
  `F3b` (pixel) `[INFERRED: tamanho medido em M2 — nada existe além do catálogo]`.

### F4 · As liquidações num pane — `web`

> **Como** operador, **quero** as liquidações de short para cima em verde e as de long para baixo em
> vermelho **no mesmo pane**, **para** ver num olhar qual lado foi varrido naquele candle.

- **Fronteira:** duas séries, um pane, eixo simétrico em torno de zero; a distinção
  *ausência × zero* que os dois panes atuais já carregam (`absenceSeries`/`zeroSeries`,
  `SymbolClient.tsx:1819,1829`) **sobrevive** à fusão.

---

## 6. Unidades de valor candidatas — **não criadas**

`harness policy --key tracker` → `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}`.
Candidatas: **1 Epic** (`paineis-de-fluxo`) com **4** unidades F1–F4 (5 se `O-2` partir F3). Criadas
**só depois** de `approve prd` no ledger — regra do papel.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | fase |
|---|---|---|
| RF-1 | O `/symbol/[symbol]` renderiza **um** gráfico com panes empilhados, na ordem de cima para baixo: Preço+Volume · Liquidações · OI · Long/Short · CVD `[INFERRED: ordem da referência, sem Funding (NG-3); ordem final é do design_gate]` | F1 |
| RF-2 | Existe **um** eixo de tempo visível, no rodapé; nenhum pane intermediário desenha rótulos de tempo | F1 |
| RF-3 | Crosshair vertical **compartilhado**: posicionar o cursor num pane desenha a linha na mesma coordenada de tempo em todos | F1 |
| RF-4 | Cada pane tem legenda no canto superior esquerdo com **nome da métrica + valor**. Valor = o do bucket sob o crosshair; sem crosshair, o **último bucket fechado** `[INFERRED: comportamento TradingView/Coinalyze]` | F1 |
| RF-5 | O nome na legenda é **derivado** do `SeriesKey` servido (grandeza · universo · unidade), herdando `SPEC-008 §8.2`/`RN-5` — nunca string à mão | F1 |
| RF-6 | Pan/zoom num pane move todos (herda `PRD-008` F2); a história sob demanda (`PRD-008` F5/fase `05`) continua funcionando | F1 |
| RF-7 | Barra de volume `i` tem a cor de alta se `close_i ≥ open_i` do candle de preço `i`, e a de baixa caso contrário `[INFERRED: doji = alta, convenção TradingView]` | F2 |
| RF-8 | O OI é desenhado em **candle**; corpo verde se `oi_close > oi_open`, vermelho se `<`; `=` é neutro `[INFERRED]` | F3 |
| RF-9 | A legenda do OI mostra **O·H·L·C** do bucket (como a referência: 4 valores) | F3 |
| RF-10 | Liquidações: uma série acima de zero, outra abaixo, **no mesmo pane**; a legenda mostra os **dois** valores, cada um na cor da sua perna | F4 |
| RF-11 | Qual perna vai para cima/verde é a da **referência lida**, não suposta (`[Q-LIQ-1]`) | F4 |

### 7.2 Não-funcionais

| id | requisito | fonte |
|---|---|---|
| RNF-1 | Nenhuma dependência nova de gráfico: panes nativos da `lightweight-charts` 5.x já instalada (M6) **ou** a composição que o `frontend-architect` escolher (§13-B) | `[INFERRED]` |
| RNF-2 | Latência de pan/zoom **não piora** em relação à medida pelo `axis-latency-probe` da fase `02` de `candle-real-e-eixo-unico` | `[DOC: frontend/src/app/symbol/axis-latency-probe.ts]`; o teto numérico é `PRD-008 [Q5]`, ainda sem número |
| RNF-3 | Tema e contraste pelos tokens existentes; as cores de alta/baixa do volume, do OI e da liquidação são **as mesmas duas** do candle de preço (uma gramática de cor, não três) `[INFERRED]` | `design_gate` |
| RNF-4 | `O-2` declara pegada de disco (4 séries × 4 símbolos × 288/dia) antes de escrever | `D-j` |

---

## 8. Regras de negócio

| id | regra |
|---|---|
| **RN-1** | A cor do OI mede **variação de contratos dentro do bucket**, nunca variação de preço nem de nocional (`D-b`) |
| **RN-2** | **Buraco não vira candle.** Um bucket de OI sem ponto é *ausente* — nem candle, nem candle "costurado" do último ponto antes do buraco até o primeiro depois. M3 mede que buraco é o caso comum (5 em 7 dias), não o de borda |
| **RN-3** | **Liquidação nunca é somada nem líquida** (`D-d`): o pane desenha as duas pernas; nenhum número `long − short` aparece na tela |
| **RN-4** | *Ausência* e *zero* continuam distinguíveis em todo pane (herança das fases de liquidação/`T-07.11`); fundir dois panes não pode apagar essa distinção |
| **RN-5** | Reagregação por TF segue `Nature` (`D-e`): volume/liquidação somam; OI toma `open` do primeiro, `close` do último, `high`/`low` extremos do bucket |
| **RN-6** | Com `O-1`, o candle de OI é **derivado na leitura** e rotulado como tal na legenda/tooltip (o pavio vem de amostras de 5 min, não de tick); com `O-2`, rotulado com o provedor (`coinalyze`) e o estado de quarentena |
| **RN-7** | O sistema **não rotula** divergência/confirmação preço×OI; só desenha. O marcador é `convergencia` (NG-1) |

---

## 9. Tipos e contratos críticos

| contrato | estado |
|---|---|
| `OiCandle { bucket_end_ms, open, high, low, close, derived_from: "binance_point_5m" \| "coinalyze_ohlc_5m" }` | **TBD** — forma depende de `[Q-OI-1]`; dono: `/architect` + `quant-architect`, na SPEC |
| Onde o OHLC de OI é montado (rota `series-history` com `Reduction` OHLC já expressável em `SeriesKey` × browser) | **TBD** — dono: `/architect`, sob `ADR-040` |
| Pane registry (ordem, altura, legenda derivada do `SeriesKey`) | **TBD** — dono: `frontend-architect`, sob `ADR-003` (web não alarga `charts` sozinho) |
| Volume com direção: cor calculada no cliente a partir do candle já servido | **definido** — zero contrato novo (M5) |
| Liquidação: 2 `series_key_id` existentes, `cohort ∈ {long, short}` | **definido** — `LIQUIDATION_COHORTS`, `view-model.ts:995` |

---

## 10. Critérios de aceite — testáveis, com a coluna "morde"

Toda fase paga os 4 itens do `DoD-VERTICAL` (count em `md.series` > 0 · `n_points > 0` na rota ·
Playwright contra o app real com `N>0` no DOM **e** ablação · `n_written > 0`). Onde a fase não cria
dado (F1, F2, F4, F3/`O-1`), itens 1 e 4 são **não-regressão**: continuam `> 0`.

| id | critério | como mede | morde (a ablação que tem de reprovar) |
|---|---|---|---|
| CA-1 | Os 5 panes estão **num único** gráfico | Playwright: `count(canvas-root do gráfico) == 1` e 5 panes com `N>0` pontos | reverter para 6 `createChart` ⇒ reprova |
| CA-2 | Um único eixo de tempo visível | screenshot + assert de que só o pane de rodapé tem rótulo de tempo; **pixel**, não só DOM (`MEMORY: assert de DOM não prova pixel`) | reativar o eixo num pane intermediário ⇒ reprova |
| CA-3 | Crosshair compartilhado | Playwright: `hover` no pane de preço em `x`; ler a legenda dos 5 panes = valores do bucket de `x` na API | desligar o compartilhamento ⇒ legendas dos outros panes ficam no último valor ⇒ reprova |
| CA-4 | Legenda = valor da API | para cada pane, legenda sem hover == último bucket fechado de `/series-history` | trocar o índice do último bucket por `−1` ⇒ reprova |
| CA-5 | Legenda derivada do `SeriesKey` | trocar a chave no catálogo de teste muda o nome da legenda (herança `CA-10` de `PRD-008`) | nome escrito à mão ⇒ não muda ⇒ reprova |
| CA-6 | Volume com direção | para `n ≥ 50` barras, `cor(vol_i) == direção(candle_i)` | inverter o comparador ⇒ reprova |
| CA-7 | OI em candle, cor por contratos | para `n ≥ 50` buckets, `cor(oi_i) == sinal(close_i − open_i)` com os valores da rota | colorir pelo preço em vez do OI ⇒ reprova em algum bucket em que os sinais divergem (o teste **exige** ao menos 1 tal bucket na janela, ou é inconclusivo, não verde) |
| CA-8 | Buraco não vira candle (RN-2) | janela que contém um dos buracos de M3: `0` candle desenhado no intervalo | costurar `open = último close antes do buraco` ⇒ reprova |
| CA-9 | Liquidação num pane, sem líquido | 1 pane, 2 séries, sinais opostos; nenhum valor na tela == `long − short` | somar as pernas ⇒ reprova |
| CA-10 | Ausência ≠ zero sobrevive à fusão | bucket sem linha e bucket com `0` renderizam diferente no pane único | fundir os dois estados ⇒ reprova |
| CA-11 | Não-regressão de latência | `axis-latency-probe` ≤ baseline medido antes de F1 | — (medir a baseline é tarefa de F1) |
| CA-12 | Design | veredito do `ux-ui-mastery` sobre a tela do Stitch **e** sobre o screenshot da implementação | — |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | **Marcador explícito de divergência/confirmação preço×OI** | componente `convergencia` (`PRD-005 §18`, DISCOVERY §3.5). O candle colorido já entrega a leitura; o sistema não a rotula (RN-7) |
| **NG-2** | Volume profile / VPVR à direita (está na referência) | não pedido; geometria nova em `charts` (`PRD-008 NG-2`) |
| **NG-3** | Funding rate como pane (está na referência) | métrica nova ⇒ `ADR-036`; `PRD-008 NG-3` |
| **NG-4** | CVD **spot** e L/S **top traders** (a referência tem; nós temos CVD futures e L/S global accounts) | troca de fonte/métrica, não de forma. F1 só migra os panes existentes |
| **NG-5** | Mudar a forma do CVD ou do long/short | não pedido; entram na pilha como estão |
| **NG-6** | Consertar os buracos do OI da Binance (M3) | é ingestão (`sentimento`/`infra`); aqui só se **desenha honesto** (RN-2). Vai para §12 como GAP com dono |
| **NG-7** | OI agregado multi-exchange | fora **por `D-a`**, salvo se o owner reverter em §13-C |
| **NG-8** | Mobile | `D-h` |
| **NG-9** | Mudar predicado de quarentena/probe/fórmula MODELED | `PRD-005`/`SPEC-005` |

---

## 12. `[INFERRED]` e GAPs nomeados

| id | item | classe | dono |
|---|---|---|---|
| I-1 | Ordem dos panes = referência sem Funding (RF-1) | inferível; reversão barata | `design_gate` |
| I-2 | Legenda segue crosshair (RF-4) | inferível | `design_gate` |
| I-3 | Doji → cor de alta (RF-7); OI `=` → neutro (RF-8) | inferível | `design_gate` |
| I-4 | Layout em fase própria, antes das formas (F1) | inferível; custo de reversão = 3 fases com 2 layouts | `/architect` |
| G-1 | **M2: a Coinalyze OI OHLC está no catálogo e nunca foi escrita.** Catálogo que declara série sem escritor é o padrão que `cinco-metricas-do-core` nasceu para matar (23.512 linhas, 0 do CORE) | **não-bloqueante** deste PRD; decide `[Q-OI-1]` | `quant-architect` |
| G-2 | **M3: OI Binance com 14,2% de buckets ausentes em 7 d, buraco de ~18 h.** O candle de OI vai **mostrar** isso | **não-bloqueante**; ingestão | `infra-architect`/`quant-architect` — fora deste escopo (NG-6) |
| G-3 | Teto de latência (RNF-2) sem número no repositório (`PRD-008 [Q5]` segue aberta) | não-bloqueante | `/architect` propõe, owner ratifica |

---

## 13. Menus — escolhas com o custo de cada uma

### A. De onde vem o OHLC do candle de OI — **decisão do owner** (`[Q-OI-1]`), com julgamento do `quant-architect` sobre `ADR-036/D2`

| opção | o que o owner vê | custo |
|---|---|---|
| **O-1 — derivar da Binance (origem de `D-a`)** | candle em contratos: `close` = último ponto 5 min do bucket do TF; `open` = o ponto **imediatamente anterior** se ele for contíguo (`gap == 300000 ms`), senão o primeiro ponto do próprio bucket; `high`/`low` = extremos de `open` e das amostras. Em TF `15m` são 3 amostras; `1h`, 12; `4h`, 48 | **zero** cota, **zero** terceiro, `D-a`/`ADR-036` intactas, backtest vê a mesma série. ⚠️ **Em TF `5m` o candle tem corpo mas não tem pavio** (1 amostra por bucket), e **no bucket logo depois de um buraco** (M3: 5 em 7 dias) o corpo começa na primeira amostra, não no fechamento anterior — é o preço de RN-2. Pavio = extremo de amostra de 5 min, não de tick (RN-6) |
| **O-2 — capturar a OI OHLC da Coinalyze para o mesmo universo (Binance, `BTCUSDT_PERP.A`, contratos)** | candle com pavio real intra-5min, inclusive em `5m` | coletor novo (M2: nada existe além do catálogo) ⇒ F3 vira **2 fases**. Cota: `+1` endpoint × 4 símbolos = **4 u/ciclo de 5 min ≈ 0,8 u/min ≈ 2% do teto de 40 u/min** `[INFERRED: aritmética sobre o peso linear medido, custo = n_símbolos; não medido contra a API]`. Terceiro em métrica de CORE: só passa se o dono de `ADR-036` aceitar *"OHLC não existe na origem"* como o teste de `D2`. Quarentena: visível na tela, **invisível ao backtest** até `PRD-005` entregar. Retenção **~7 dias** (M9) contra **90 dias** de história servida ⇒ ao arrastar para trás, o candle de OI **acaba** em ~7 dias + o que acumular desde a captura. Duas séries de OI na base cujo `close` pode discordar |
| **O-3 — O-1 agora, O-2 quando `PRD-005` sair da quarentena** | O-1 hoje; pavio real depois | custo de O-1 agora; decide O-2 com a quarentena resolvida, sem série invisível ao backtest. Custo: em `5m` o candle fica sem pavio até lá |

**Recomendação do `/pm`** `[INFERRED: menor exposição com o uso declarado atendido]`: **O-3**. O uso
declarado (*"se ta entrando OI"*) é atendido pelo **sinal** `close − open`, que O-1 entrega em todo TF
sem terceiro; o que O-2 acrescenta é o pavio. **A escolha é do owner.**

> ⚠️ **Emenda do `/architect` (2026-09-23), acrescentada sem reescrever o que está acima.** O menu
> completo e corrigido está em [`SPEC-009` §6.1](SPEC-009-paineis-de-fluxo.md). Ele traz três coisas:
> (1) a definição de `open` de `O-1` foi corrigida (âncora = existir `p(T0)`, `ADR-045/D1`) e substitui o
> `RN-5` para `(STOCK, POINT)`; (2) `O-2` tem pavio **amostrado** com cadência `[NÃO SEI]` e **não passa**
> em `ADR-036/D2` sem emenda; (3) há uma opção nova, **`O-4`**: polling de `/fapi/v1/openInterest` pela
> origem, com pavio só daqui para frente. Ela vem do `quant-architect`, sem recomendação.

### B. Estrutura — **decisão do `frontend-architect`** (`[Q-ARQ-1]`)

| opção | custo |
|---|---|
| **S-1 — um `createChart`, panes nativos v5** (`addPane` / `paneIndex`) | eixo e crosshair únicos **por construção** — `axis-sync.ts` sai (menos código); zero dependência (M6). Custo: reescrever a montagem de `SymbolClient.tsx` (2.936 linhas, M7) e re-ancorar os contratos de DOM por pane (**5** `*-pane-dom-contract.test.ts` — `ls frontend/src/app/symbol/ | grep -c pane-dom-contract.test.ts`); o `slot-coverage`/absence por pane precisa caber em pane nativo |
| **S-2 — seis charts estilizados como pilha** (sem moldura, eixo só no último, crosshair sincronizado à mão) | menor diff agora; mantém `axis-sync` e os testes. Custo: crosshair compartilhado é código novo e frágil; seis eixos continuam existindo e só ficam escondidos — a sincronia segue sendo o risco que a fase `02` de `candle-real` teve de provar com ablação |

### C. Universo do OI — **confirmação do owner** (`[Q-OI-2]`), porque `D-a` é escolha dele

| opção | custo |
|---|---|
| **U-1 — mantém `D-a`: Binance, contratos** | zero. A tela segue diferente da Coinalyze **no número absoluto** (≈108 k BTC contra ≈27,6 B USD, `SPEC-008 §8.1`), mas igual **na leitura** que a fala pede (entrou/saiu) |
| **U-2 — reverte `D-a`: agregado multi-exchange** | a medição de 2026-09-19: sem rota global na Coinalyze; a 10 símbolos, **25%** do teto a 4 exchanges, **45%** a 8, **145% — estoura** a 28 `[DOC: DECISOES-DO-OWNER-2026-09-19 §Q1]`; terceiro em CORE; quarentena; retenção ~7 d. E somar corretoras em **contratos** exige normalizar cada uma para a unidade base (`D-b`) — trabalho de `sentimento` que nenhuma fase deste PRD comporta |

---

## 14. Perguntas em Aberto — classificadas

| id | pergunta | classe | dono |
|---|---|---|---|
| **[Q-OI-1]** | O-1, O-2 ou O-3 (§13-A)? | **BLOQUEANTE de F3** (F1, F2, F4 andam sem ela) | **owner**; `quant-architect` julga O-2 contra `ADR-036/D2` |
| **[Q-OI-2]** | A fala de 2026-09-23 reverte o OI na origem (`D-a`)? U-1 ou U-2 (§13-C) | **NÃO-BLOQUEANTE** — sem resposta, vale `D-a` (é decisão vigente, não lacuna) | **owner** |
| **[Q-LIQ-1]** | Qual perna vai para cima/verde? A referência mostra barras **vermelhas para baixo** coincidindo com o candle de queda à direita e **verdes para cima** com o candle de alta ⇒ vermelho-baixo = **long liquidado**, verde-cima = **short liquidado** `[INFERRED: co-ocorrência na imagem + mecanismo — long é liquidado quando o preço cai]`. Precisa de fonte lida da convenção Coinalyze antes de virar critério | **BLOQUEANTE de F4** (só do CA) | `quant-architect` |
| **[Q-ARQ-1]** | S-1 ou S-2 (§13-B)? | **BLOQUEANTE de F1** | `frontend-architect` |
| **[Q-SEQ-1]** | F1 antes ou depois das pernas de `ADR-043` no mesmo arquivo? | **BLOQUEANTE de F1** (conflito de edição) | `/architect` |
| **[Q-VOL-1]** | Volume com cor pela direção (V-1, zero dado, é o que a referência faz) ou split compra/venda empilhado (V-2, derivável de M5, mas repete a informação do pane de CVD)? | **INFERÍVEL** — o `/pm` recomenda **V-1** `[INFERRED: é a referência pedida e não duplica o CVD]` | `/architect`/`design_gate`; owner veta se quiser |
| **[Q-VOL-2]** | Volume segue em `log10` ou passa a linear no rodapé como a referência? | **INFERÍVEL** (`PRD-008 [Q8]`) | `design_gate` |
| **[Q-OI-3]** | Em TF `5m` com O-1 (corpo sem pavio), o pane de OI mostra assim mesmo, ou avisa que o pavio não existe nessa resolução? | **NÃO-BLOQUEANTE**, decide junto com Q-OI-1 | `design_gate` + `quant-architect` |

---

## 15. Registro da varredura de discovery

| dimensão | estado | onde |
|---|---|---|
| stakeholders e consumidores | `[COBERTO: owner, uso solo de leitura; DISCOVERY §1]` | §1.1 |
| volumetria e escala | `[COBERTO: M1–M4, 4 símbolos, 76 séries]`; O-2 declara disco (RNF-4) | §1.2 |
| não-funcionais (latência, frescor) | `[GAP: teto de latência sem número — G-3]`; frescor herdado de `PRD-008` | §7.2 |
| estados e bordas (fora de ordem, duplicado, remoção, parcial, vazio) | `[COBERTO: buraco (RN-2, medido M3), ausência×zero (RN-4), doji/OI igual (I-3), TF 5m sem pavio (Q-OI-3)]`; duplicado por `observed_at` é da leitura já existente `[DOC: PK de md.series]` | §8, §14 |
| contrato e dependências | `[GAP: OiCandle TBD com dono]`; dependência de `ADR-043` (Q-SEQ-1) | §9, §4.2 |
| métricas e observabilidade | `[COBERTO: DoD-VERTICAL + CA com ablação]` | §10 |
| escopo e non-goals | `[COBERTO]` | §11 |

**Perguntas levadas ao owner nesta rodada:** nenhuma diretamente — o `/pm` roda sem canal com o
owner; **[Q-OI-1]** e **[Q-OI-2]** saem como menu para o loop principal levar. Nada crítico virou
`[INFERRED]` silencioso: o que é do owner está em §13 com custo.

---

## 16. Gate de handoff — conferido

- [x] cada story tem fronteira e cabe numa fase — **exceto F3 sob O-2**, que o PRD já parte em F3a/F3b
- [x] regras bloqueantes endereçáveis — 8 regras `block` (`harness rules list --severity block`), nenhuma conflita com o escopo (front sem import de servidor = `web-fullstack.browser-imports-server`, já a prática)
- [x] tipos críticos definidos ou `TBD` com dono (§9)
- [x] non-goals escritos (§11)

**Gaps bloqueantes do PRD:** nenhum. Bloqueantes **de fase**: F1 (`Q-ARQ-1`, `Q-SEQ-1`), F3
(`Q-OI-1`), F4 (`Q-LIQ-1`, só do critério).

**Próximo passo:** `/architect` (Gap Analysis) — handoff em
[`docs/context/paineis-de-fluxo/handoff_to_architect.md`](../context/paineis-de-fluxo/handoff_to_architect.md).
