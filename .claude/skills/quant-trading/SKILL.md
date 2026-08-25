---
name: quant-trading
description: Especialista em trading quantitativo para este projeto — vocabulário SMC/order flow com definição operacional, semântica das fontes de dados (Binance Futures, Bybit V5, Coinalyze), e o protocolo de verificação de estratégias. Use no refinamento do discovery, ao escrever ou revisar detecção SMC, cálculo de CVD, matriz de convergência ou backtest, e antes de estimar trabalho dos Módulos A–D.
---

# Trading Quantitativo & Sentimento — `cripto-strategy`

Este documento carrega **três coisas que mais nada carrega**: o vocabulário do domínio
com definição operacional (não a de influencer), a semântica das fontes de dados com
procedência, e o protocolo de verificação de estratégia. A proposta está em
[docs/proposta-discovery.md](../../../docs/proposta-discovery.md); os ponteiros de
governança, no `harness.toml` (V-16 → `quant-architect`).

---

## §Verificação — leia antes de tudo

Este produto dispara ordens com dinheiro real. Portanto:

> **Nada de estratégia é dado como pronto sem backtest com universo declarado
> (par, período, timeframe, taxas, slippage, N de trades) e sem teste de regressão
> contra fixtures de mercado com marcação fixada à mão.**

Métrica sem universo (win rate solto) é recusada no refinamento, não na revisão.

## §Vocabulário SMC — definição operacional, uma por conceito

Cada conceito abaixo só entra em código quando tiver definição PARAMETRIZADA (o
refinamento existe para fechar esses parâmetros — são requisito, não detalhe):

- **Order Block (OB)** — último candle contrário antes de movimento impulsivo que
  rompe estrutura. Parâmetros a fechar: o que conta como "impulsivo" (X% ou N×ATR),
  mitigação (toque no range? no corpo? em 50%?), expiração.
- **Fair Value Gap (FVG)** — gap entre a máxima do candle i-1 e a mínima do i+1 (bull)
  em sequência de 3. Parâmetros: tamanho mínimo, preenchimento parcial ou total.
- **BSL/SSL (liquidity)** — máximas/mínimas iguais (equal highs/lows) e extremos de
  swing. Parâmetro: tolerância de "igual" em ticks/percentual.
- **BOS / CHoCH** — rompimento de swing na direção da tendência (BOS) vs contra ela
  (CHoCH). Parâmetro: definição de swing (fractal de N candles? zigzag de X%?) — TODA
  a detecção de estrutura depende desta escolha; é a primeira a fixar.

## §Fontes de dados — semântica com procedência

- **CVD**: soma acumulada do delta de `aggTrade` (campo `m` na Binance: `true` = vender
  agressor). NUNCA de OHLCV. Reinício da acumulação (por sessão? contínuo com âncora?)
  é parâmetro de refinamento.
- **Open Interest**: Binance `GET /futures/data/openInterestHist` (períodos fixos,
  histórico limitado a 30 dias) vs Coinalyze (histórico maior, agregado multi-exchange,
  rate limit próprio). O spike de OI >5%/15m do screener (§Módulo A) precisa declarar a
  fonte — os números diferem entre elas.
- **Funding Rate**: janelas de 8h (Binance/Bybit padrão; alguns pares 4h ou 1h — medir
  por par, não assumir). "Extremo" do screener é percentil sobre janela declarada, não
  número mágico.
- **Long/Short Ratio**: Binance expõe TRÊS séries distintas (global accounts, top
  traders accounts, top traders positions). Qual delas a matriz usa é decisão de
  refinamento com consequência — elas divergem nos extremos, que é exatamente onde o
  sinal mora.
- **Rate limits**: entregável explícito do discovery (§3, análise de custo). Toda PoC
  de ingestão loga peso consumido vs limite; estimativa sem medição não fecha o
  entregável.

## §Matriz de convergência — a forma do requisito

Um sinal só é sinal com as três pernas (§Módulo C): (1) estrutura/nível SMC, (2)
divergência/absorção no CVD, (3) posicionamento (OI + L/S + Funding). No refinamento,
cada linha da tabela paramétrica nasce com: condição matemática, fonte de cada
variável, timeframe, e **como se testa fora da amostra**. Linha sem a quarta coluna é
palpite com cerimônia.

## §Backtest — o que invalida um resultado

Lookahead (candle não fechado, série com timestamp posterior à decisão),
desalinhamento temporal entre séries (trade em ms, OI em polling de minutos, funding
em 8h — alinhar por timestamp é O problema, §Módulo D), custos ausentes (maker/taker,
funding pago/recebido, slippage), e calibração e avaliação na mesma amostra. Qualquer
um dos quatro presente → resultado descartado, não "ajustado".

## §Roteamento

- Decisão estrutural de domínio, ADR, fronteiras de módulo → agente `quant-architect`
- Fluxo do harness (PRD, SPEC, fases, gates) → skills do plugin (`harness-plugin:pm`,
  `harness-plugin:architect`, …) — esta skill não as duplica
- UI do dashboard (Next.js, Lightweight Charts) → skills `ux-ui-mastery` + MCP `shadcn`;
  esta skill só carrega o REQUISITO de domínio (painéis sincronizados por timestamp,
  presets por estratégia)
