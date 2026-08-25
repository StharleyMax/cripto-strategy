# 📋 PLANO DE DISCOVERY - PLATAFORMA DE TRADING QUANTITATIVO & SENTIMENTO

## 1. OBJETIVO DO DISCOVERY
Validar a viabilidade técnica, arquitetura de dados, componentes visuais e modelo matemático de convergência para uma plataforma autônoma/semi-autônoma de trading baseada em SMC/Price Action + Sentimento (OI, Funding Rate, L/S Ratio) + Order Flow (CVD).

---

## 2. MÓDULOS DE AVALIAÇÃO & REQUISITOS TÉCNICOS

### [Módulo A] Extração de Sentimento & Screener
• Mapeamento e testes de resiliência/limits das APIs (Coinalyze API v1, Binance Futures REST/WS, Bybit V5).
• Arquitetura de pipeline de dados desacoplada (Redis Pub/Sub / Event-Driven) para ingestão contínua.
• Motor de triagem (Screener): Filtros de volatilidade e identificação de anomalias (Spikes de OI > 5% em 15m, Funding Rate em extremos, picos de liquidação).
• Cálculo em memória de CVD (Cumulative Volume Delta) via WebSocket de `aggTrade`.

### [Módulo B] Engine de Gráficos & Marcações SMC
• Prova de Conceito com TradingView Lightweight Charts (múltiplos painéis sincronizados: Preço + CVD + OI + Funding Rate).
• Algoritmos para detecção visual e programática de elementos de SMC:
  - Order Blocks (OB)
  - Fair Value Gaps (FVG)
  - Buy/Sell Side Liquidity (BSL/SSL)
  - Break of Structure / Change of Character (BOS/CHoCH)
• Gerenciador de Presets/Templates de layouts por estratégia.

### [Módulo C] Matriz de Convergência & Regras de Gatilho
• Definição da lógica de confirmação cruzada:
  1. Estrutura / Nível Crítico de Preço (SMC)
  2. Divergência / Absorção de Volume (CVD)
  3. Pressão de Mercado & Posicionamento (OI + Long/Short Ratio + Funding Rate)
• Tabela paramétrica de regras matemáticas para validação de sinais e disparo de ordens.

### [Módulo D] Backtesting, Sandbox & Execução
• Modelagem de banco de dados Time-Series (TimescaleDB / ClickHouse) para historização alinhada por timestamp.
• Motor de Backtest Event-Driven com simulação de Slippage, Taxas (Maker/Taker) e Latência.
• Integração com Paper Trading / Testnet (Binance Futures & Bybit) usando biblioteca CCXT ou SDKs oficiais.
• Dashboard de métricas financeiras (Win Rate, Profit Factor, Max Drawdown, Sharpe Ratio, Expectativa Matemática).

---

## 3. ENTREGÁVEIS & PRÓXIMOS PASSOS DA FASE DE DISCOVERY
- [ ] PoC de Ingestão: Script unificando WebSocket de Trades (CVD) + Polling REST (OI/Funding).
- [ ] PoC de Frontend: Dashboard Web com Lightweight Charts renderizando indicadores em sub-gráficos sincronizados.
- [ ] DDL de Banco de Dados: Schemas otimizados para armazenamento de dados temporais de mercado e sentimento.
- [ ] Matriz Matemáticas de Estratégias: Documento formalizando as regras de entrada, Stop Loss e Take Profit.
- [ ] Análise de Custo & Infraestrutura: Limites de rate limit, estimativa de custos de servidores (VPS) e contingência.
