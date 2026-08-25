# Medição da API Coinalyze — o que era doc-only agora está medido

**Data:** 2026-08-25 · **Chave:** temporária, fornecida pelo owner, plano free (40 chamadas/min por key)
**Chamadas gastas nesta rodada:** 11 · **Onde a chave vive:** `.env` (perms 600, no `.gitignore` desde o primeiro commit; nunca em documento, nunca em commit)

Até hoje, **tudo** o que os três documentos de discovery diziam sobre a Coinalyze era leitura de
documentação: nenhum endpoint havia sido chamado. Esta rodada fecha isso. Cada número abaixo
vem com o comando, e onde a medição **derruba** o que estava escrito, está dito.

---

## 1. O que foi derrubado

### 1.1 "Agregado multi-exchange" — **não existe**

`.claude/skills/quant-trading/SKILL.md` l.47-48 e a `avaliacao-discovery.md` tratam a Coinalyze
como fonte de OI **agregado** entre exchanges. Medido: `/exchanges` devolve **28** exchanges e
`/future-markets` devolve **5.127** mercados, e **todo mercado carrega um campo `exchange`
obrigatório** apontando para uma única delas. Não há símbolo agregado, e a palavra `aggregated`
não aparece na doc.

```bash
curl -sS -H "api_key: $COINALYZE_API_KEY" https://api.coinalyze.net/v1/exchanges
curl -sS -H "api_key: $COINALYZE_API_KEY" https://api.coinalyze.net/v1/future-markets
# 28 exchanges (Binance = 'A') · 5.127 mercados · 764 perpétuos na Binance
```

Consequência: qualquer requisito que dependia de "OI agregado de N venues" tem de ser reescrito
como **N chamadas e uma agregação nossa** — o que muda o orçamento de cota, não a viabilidade.

### 1.2 "Histórico maior" — **a afirmação inverte por granularidade**

A skill diz que a Coinalyze tem histórico maior; a `avaliacao` corrigiu para "menor em intraday".
As duas estão parcialmente certas, e nenhuma disse a coisa completa. Medido:

| série | granularidade | pontos | alcance real |
|---|---|---|---|
| Open Interest | `1min` | 2.206 | **~1,5 dia** (2026-08-23 23:34 →) |
| Open Interest | `5min` | 2.016–2.142 | **~7,0 dias** (2026-08-18 →) |
| Open Interest | `daily` | **2.409** | **6,6 anos** — 2020-01-21 → 2026-08-25 |
| OHLCV | `1min` | 1.440 | 1,0 dia |
| Liquidação | `1min` | 3.052 | ~8 dias (série **esparsa**, ver §2.1) |
| Liquidação | `daily` | **730** | **2,0 anos** — 2024-08-26 → |

Ou seja: **em intraday ela é rasa; em `daily` ela é a fonte mais profunda que este projeto
conhece.** 2.409 dias de OI diário é mais fundo que o dump S3 `daily/metrics` (2.183 dias), e
muito mais que o REST da Binance (30 dias).

### 1.3 O mecanismo de retenção não é tempo — é **contagem de pontos**

A doc diz "1500 a 2000 datapoints para intraday". A medição mostra que o teto é de **pontos**, não
de janela: 2.206 pontos a 1 min ⇒ 1,5 dia; os mesmos ~2.000 pontos a 5 min ⇒ 7 dias. A
consequência não-óbvia, e ela importa: **série esparsa retém mais tempo de relógio.** A série de
liquidação a 1 min alcança ~8 dias com 3.052 pontos porque só existem buckets em que houve
liquidação. Um requisito escrito como "24 h de retenção a 1 min" está errado nas duas direções,
dependendo da série.

### 1.4 `MATICUSDT` não está na Coinalyze

Terceira testemunha independente sobre a questão do universo: a Coinalyze **não** serve símbolo
renomeado/deslistado. `ICXUSDT` (que sai da Binance às 09:00Z de 2026-08-26) **está** lá;
`MATICUSDT` não. Ela não é rota de fuga para o survivorship.

---

## 2. O que foi ganho

### 2.1 ⭐ Liquidação diária é recuperável 2 anos para trás — **CL-1 muda de forma**

Este é o achado de maior consequência da rodada. Os três documentos anteriores afirmam que
liquidação é capture-or-lose **absoluto**: stream-only na Binance, sem dump S3, sem backfill por
fonte nenhuma. Medido: `/liquidation-history` com `interval=daily` devolve **730 dias**, de
2024-08-26 a hoje, com campos `{t, l, s}` (long e short liquidados).

```bash
NOW=$(date -u +%s)
curl -sS -H "api_key: $COINALYZE_API_KEY" \
 "https://api.coinalyze.net/v1/liquidation-history?symbols=BTCUSDT_PERP.A&interval=daily&from=$((NOW-63072000))&to=$NOW"
# n=730 · 2024-08-26 → 2026-08-25
```

**A correção precisa, sem exagerar para nenhum lado:** o que é capture-or-lose é a liquidação
**intraday** — o evento individual, o timestamp em ms, a cascata de segundos. O **agregado
diário** por símbolo é recuperável até 2 anos. Isso não dispensa ligar o coletor (o gatilho
"picos de liquidação" da proposta vive na escala de minutos, não de dias), mas retira a
liquidação da categoria "nada volta, nunca" e dá uma linha de base histórica que não tínhamos.

### 2.2 ⭐ `bv` **é** volume de compra agressora — provado contra o dump canônico

O discovery marcou isto como aberto: *"`bv` da Coinalyze — é lado agressor? o doc não diz, e não
substitui `aggTrade` sem prova"*. A prova foi feita. Baixei o dump completo de `aggTrades` de
BTCUSDT de 2026-08-24 (2.443.262 linhas), recomputei o volume de compra agressora por bucket de
1 min (`is_buyer_maker == false`) com `Decimal` sobre a string crua de `quantity`, e comparei com
o `bv` da Coinalyze nos **699 buckets em comum**:

| hipótese | erro mediano | p99 | máx |
|---|---|---|---|
| **A · `bv` = compra AGRESSORA** | **0,0000 bp** | 29,34 bp | 1.955,80 bp |
| B · `bv` = compra do MAKER | 2.584,87 bp | 8.216,66 bp | 8.663,74 bp |

**150 de 699 buckets têm `bv` exatamente igual** à compra agressora recomputada. A hipótese B está
refutada por três ordens de grandeza. O delta de CVD reconstruído (`2·bv − v`) bate o do dump com
diferença mediana de `2,6e-14` BTC — igualdade exata a menos de ruído de ponto flutuante — com
p99 de 1,50 BTC e máx de 36,93 BTC.

**Leitura honesta:** `bv` é a grandeza certa e a mediana é exata, mas **a cauda não é zero**. Não é
substituto cego do `aggTrade`; é uma `cvd_source` legítima **com erro publicado por fonte**, que é
exatamente a forma que o PRD já exige.

### ⚠️ Correção de 2026-08-25 — a causa que eu publiquei está REFUTADA

Esta seção afirmava que a causa provável da cauda era *"a Binance exclui trades do fundo de seguro e
de ADL do `aggTrade`, e não se sabe se a Coinalyze usa o mesmo filtro"*. **Isso está refutado por
medição**, e a refutação é limpa: os **contadores casam exatamente**.

| medição sobre os mesmos 699 buckets | resultado |
|---|---|
| `tx` da Coinalyze == nº de aggTrades do dump | **699/699 exato** |
| `btx` == nº de aggTrades com `is_buyer_maker=false` | **699/699 exato** |
| autocorrelação lag-1 da diferença assinada de `v` | **−0,0031** |
| soma cumulativa da diferença | min −70,84 · máx 0,00 · final **−70,84 BTC** — monótona, nunca reverte |
| buckets com \|diff\| > 1 BTC | **12, todos negativos** |
| maior aggTrade do bucket: com déficit × sem déficit | mediana **16,22 × 6,08 BTC** |
| dia inteiro | dump 142.538,583 · cz 142.467,746 ⇒ **−4,97 bp, uma direção só** |

Um filtro diferente de fundo de seguro/ADL mudaria a **contagem de trades** — e a contagem casa em
699/699 nos dois contadores. Também não é borda de bucket (autocorrelação ≈ 0) nem classificação
agressor/maker (o déficit é unilateral e `v − bv` casa exato). O que é: **déficit por trade, sempre
para baixo, concentrado nos minutos que contêm aggTrade grande.**

**Candidata correta, e o mecanismo está medido:** o campo **`nq`** — quantidade **excluindo ordens
RPI** — que existe no REST e no WebSocket e **não existe no dump S3**. Medido hoje em janela ao vivo
de 1.000 trades por símbolo:

| símbolo | trades com `q ≠ nq` | déficit de volume |
|---|---|---|
| **DOGEUSDT** | **16/1000 (1,6%)** | **80,56 bp** |
| ETHUSDT · SOLUSDT · XRPUSDT · BTCUSDT | 0/1000 | 0,00 bp |

```bash
curl -sS "https://fapi.binance.com/fapi/v1/aggTrades?symbol=DOGEUSDT&limit=1000"   # campos: T a f l m nq p q
```

**O que isso estabelece e o que não estabelece.** Estabelece que `nq` é real, que `nq ≤ q`, e que a
divergência **varia por símbolo** e é esparsa. **Não** estabelece que `nq` explique a cauda do `bv`
em BTCUSDT: nesta janela o BTC não divergiu nem uma vez, enquanto o déficit medido contra a
Coinalyze é de um dia inteiro concentrado em 12 buckets. A hipótese é **plausível e não provada** —
o teste que a fecha é somar `nq` contra `q` nos mesmos buckets do dia em que o déficit foi medido,
e o REST só devolve 48 h de histórico, então esse teste precisa de captura ao vivo.

**A consequência que vale independentemente do diagnóstico**, e é ela que virou item bloqueante de
SPEC: **`q` e `nq` são duas grandezas distintas com o mesmo nome-significado**, o dump (único caminho
de backfill profundo) só tem `q`, e o WS/REST (único caminho ao vivo) tem os dois. Sem um termo de
identidade que os separe, **live e backtest calculam CVD de campos diferentes sob o mesmo nome** — e
como `cvd_cum` é soma acumulada, um déficit unidirecional cresce sem limite dentro da janela da
âncora. Correção: `quantity_field ∈ {q, nq}` na `SeriesKey`, ou `cvd_source` desdobrado em
`aggtrade_q` / `aggtrade_nq`.

### 2.3 `has_buy_sell_data` e `has_long_short_ratio_data` = `true` nos 764 perpétuos da Binance

Não é preciso descobrir por tentativa quais símbolos têm fluxo agressor: o catálogo declara. Campo
`oi_lq_vol_denominated_in` varia — **744 `BASE_ASSET`, 20 `QUOTE_ASSET`** — o que confirma como
requisito, e não como zelo, as colunas `unit`/`denom` obrigatórias por linha.

---

## 3. Dois defeitos de plataforma que a medição revelou

### 3.1 Não existe telemetria de cota

A doc diz que o `429` traz um header com quantos segundos esperar. Medido: **a resposta `200` não
traz nenhum header de cota** — nem consumido, nem restante, nem janela. Portanto o orçamento de
40/min tem de ser **contado localmente pelo cliente**, e a única forma de descobrir o limite real
é bater nele. Isso é o oposto do que a Binance oferece (`X-MBX-USED-WEIGHT-*` em toda resposta) e
é um requisito de desenho: o broker de cota da Coinalyze é cego e precisa ser conservador.

### 3.2 Open Interest vem como **OHLC do bucket**, não como ponto

Campos de `/open-interest-history`: `{t, o, h, l, c}`. A Binance entrega `sumOpenInterest` como
**ponto na borda direita** do bucket (medido na rodada anterior: `sum_open_interest_value ÷
sum_open_interest` é exatamente o close do `markPriceKlines`). São duas semânticas diferentes para
o mesmo nome. Comparar `sumOpenInterest` da Binance com "o OI da Coinalyze" sem escolher qual dos
quatro campos compara **coisas diferentes** — e o `series_catalog` precisa carregar
`ts_convention` para as duas, com `nature` distinto.

---

## 4. O que continua NÃO medido

- **A divergência de cauda do `bv`** (p99 29 bp, máx 1.956 bp): causa não diagnosticada.
- **Se a composição do agregado é estável retroativamente** quando exchanges entram/saem — não há
  agregado, então a pergunta muda de forma, mas a versão que sobra (a lista de 28 exchanges muda
  no tempo?) não foi medida.
- **O limite real de cota** — não provoquei `429` de propósito. 11 chamadas gastas, todas `200`.
- **Retenção de `funding-rate-history` e `long-short-ratio-history`** — endpoints existem, não
  foram chamados nesta rodada.
- **Se `daily` realmente nunca é apagado**, como a doc afirma. Medi 2.409 dias hoje; a afirmação
  de permanência só se verifica medindo de novo em outra data.
- **Toda a divergência numérica Coinalyze vs Binance para OI no mesmo bucket** — não comparei, e
  §3.2 explica por que a comparação exige decidir primeiro qual campo contra qual.

---

## 5. Endpoints, para referência

`https://api.coinalyze.net/v1` · autenticação por header **ou** query param `api_key`

`/exchanges` · `/future-markets` · `/spot-markets` · `/open-interest` · `/open-interest-history` ·
`/funding-rate` · `/funding-rate-history` · `/predicted-funding-rate` ·
`/predicted-funding-rate-history` · `/liquidation-history` · `/long-short-ratio-history` ·
`/ohlcv-history`

Intervalos aceitos (a API os enumera na mensagem de erro, que é a forma mais confiável de os
conhecer): `1min, 5min, 15min, 30min, 1hour, 2hour, 4hour, 6hour, 12hour, daily`.

Namespace de símbolo: `<SÍMBOLO_NA_EXCHANGE>_PERP.<CÓDIGO>` — ex. `BTCUSDT_PERP.A` para Binance.
Códigos medidos: Binance `A` · Bybit `6` · OKX `3` · BitMEX `0` · Deribit `2` · Hyperliquid `H` ·
dYdX `8` · Gate.io `Y` · e outras 20.
