# DISCOVERY — `paineis-de-fluxo` (2026-09-23)

Feature nova, **sem mãe declarada** (não é filha de `plataforma-dados`): pendurá-la lá bloquearia o
`advance DONE` da mãe, que só espera `candle-real-e-eixo-unico` e `coinalyze-fora-da-quarentena`.
`[INFERRED: escolha do loop principal; o owner pode relacionar com `harness pipeline relate`]`

## 1. A fala do owner — literal, na grafia dele

`[PREMISSA-OWNER: 2026-09-23]`

> *"o OI n deveria ter uma estratégia parecda com o do coinalyzse. Tivemos uma discussão grande encima
> disso, a ideia é capturar onde ta entrando contratos. Aqui n me parece ter respeitado isso. então o OI é
> ujm views de confirmação, o preco pode estar caindo, porém se ta entrando OI, quer dizer que tem
> intencÁào n queda e vice versa"*

> *"Quero ter essa visão do volume, OI e liquidações. Inclusive o ajuste em como o gráfico é apresentado,
> pq hj ta uma presepada feia para caralho. então vamos manter essa forma de separação bem procima da
> coinalyze e tradingview."*

Referência visual que o owner anexou: [`referencia/coinalyze-tradingview-2026-09-23.png`](referencia/coinalyze-tradingview-2026-09-23.png).
O que a imagem mostra, de cima para baixo, **num só gráfico com panes empilhados e um único eixo de tempo
no rodapé**: (1) preço em candle com **volume em barras no rodapé do mesmo pane, coloridas pela direção do
candle**, e volume profile à direita; (2) *Aggregated Liquidations*, **um pane, barras verdes para cima e
vermelhas para baixo**; (3) *Aggregated Open Interest* **em CANDLE colorido por direção** (verde = entrou
contrato, vermelho = saiu); (4) Long/Short Ratio Top Traders, linha; (5) Funding Rate, linha em degrau;
(6) Aggregated CVD Spot, linha. Cada pane tem **legenda no canto superior esquerdo com nome + último
valor**, crosshair vertical compartilhado entre todos, separadores finos, sem moldura.

## 2. O que existe hoje — inventário (subagente Explore, lido em `fbad424`)

`[DOC: citações abaixo]`

| pane | hoje | onde |
|---|---|---|
| estrutura | **6 `createChart` separados**, sincronizados por `axis-sync.ts:41-46`. lightweight-charts `^5.2.1` (`frontend/package.json:31`), **zero uso de `addPane`/`paneIndex`** | `frontend/src/app/symbol/SymbolClient.tsx:543,562` |
| preço | candle por direção | `SymbolClient.tsx:1171` |
| volume | histograma **cor única** (`provenanceWeak`), overlay em escala log no pane de preço | `SymbolClient.tsx:1197` |
| OI | **linha cor única**, Binance `sum_open_interest` fechamento (`Reduction.POINT`) | `SymbolClient.tsx:1416`, `view-model.ts:827-835` |
| CVD | duas linhas (delta + cumulativo) | `SymbolClient.tsx:1539,1545` |
| liquidações | **dois charts separados** (long, short), cor única `provenanceStrong` | `SymbolClient.tsx:1804,1887`, `view-model.ts:988-1011` |
| L/S ratio | linha | `SymbolClient.tsx:2408` |

**Dado já capturado e não desenhado:**
- **OI OHLC da Coinalyze em `5min`**: 4 séries OPEN/HIGH/LOW/CLOSE (`backend/src/modules/sentimento/domain/open_interest_catalog.py:68,98-160`). É exatamente o que o candle de OI da referência precisa. `[DOC]`
- **taker-buy volume** das klines entra só no CVD (`domain/kline_cvd.py:65`), então volume buy/sell é derivável
  (`sell = volume − takerBuy`) **sem captura nova**. `[DOC]`, mas não há série de buy/sell armazenada.
- Leitura HTTP: `GET /api/v1/series-catalog`, `/series-history`, `/series-live` (`backend/src/api/routes/`).

## 3. Perguntas em aberto para o PRD (dono indicado)

1. **OI agregado entre exchanges** (a referência diz *Aggregated … STABLECOIN+COIN-margined*) ou OI de uma
   exchange? Agregar custa cota Coinalyze (ver a memória de cota: 40 símbolo×endpoint/60s). **Owner.**
2. **Volume: cor pela direção do candle** (TradingView, zero dado novo) **ou split buy/sell** (derivável,
   série nova)? **pm propõe, com custo de cada uma.**
3. **Semântica de cor da liquidação**: na Coinalyze, verde é short liquidado e vermelho é long liquidado, e
   isso **precisa de fonte lida**, não de suposição. **quant-architect.**
4. **Resolução**: OI `5min` sobre grade de `1m` fica em degrau (fase 03, RN-S1). Um candle de OI em TF < 5m é
   honesto? **quant-architect + frontend-architect.**
5. **Marcador explícito de divergência** preço×OI: **fora de escopo** (`convergencia`, PRD-005 §18). O candle de
   OI colorido já entrega a leitura "entrou contrato" que o owner descreveu, e é o que a Coinalyze faz.
   `[INFERRED: leitura do loop principal, não fala do owner]`
6. **1 chart com panes nativos v5 × 6 charts**: decisão estrutural, **frontend-architect** (interage com a
   `ADR-043` e com o `time-axis-controller` da fase 02 de `candle-real-e-eixo-unico`).

## 4. Restrições que já valem

- **Fatia vertical / DoD-VERTICAL** (desde 2026-09-10): fase = 1 métrica até o pixel.
- QA de front com **Playwright contra o app real**, assert de dado no DOM **e** ablação (assert de DOM não prova pixel).
- Design: `ui-designer` no Stitch (projeto `9264019151773162472`, tela S2 `8174234965cd4ffbacfb7b2a0a61a427`,
  `docs/product/STITCH_CONTEXT.md`), com gate `ux-ui-mastery`. **Figma proibido.**
