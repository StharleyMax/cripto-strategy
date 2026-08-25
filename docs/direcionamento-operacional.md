# Direcionamento operacional do owner — e o que ele resolve

**Declarado em:** 2026-08-25 · **Status:** intenção do owner, é premissa de projeto e não achado de medição
**Efeito:** resolve 2 perguntas em aberto, rebaixa 1 fato capture-or-lose, dissolve o problema que
dominou a rodada de UX, e abre 1 ambiguidade nova que precisa de resposta.

---

## 1. O que o owner declarou

**Perfil e tese.** O foco **não** é alta frequência (HFT) nem leitura de milissegundo no livro, e sim
validação de confluências em **prazos operacionais estruturados: 15m, 1h, 4h**. A tese é confirmação
cruzada de três camadas:

1. **Estrutura de preço** — pivôs de alta/baixa, regiões de retração/extensão de **Fibonacci**, e volume negociado
2. **Sentimento e derivativos** — variação do **Open Interest** e **Funding Rate**
3. **Order flow** — agressão e absorção via **CVD**

**Requisitos de análise.** A tomada de decisão ocorre **no fechamento ou na consolidação de buckets
de tempo** (1m, 5m, 15m) — **sem dependência de execução no nível do micro-tick de ordem**. O backtest
exige histórico consistente de OHLCV, OI, Funding e CVD **alinhados no tempo**. A granularidade salva
deve sustentar a validação com fidelidade **sem inflar custo de disco e processamento em nuvem**.

**Autonomia delegada ao time técnico.** Estratégia de ingestão e retenção (bruto vs agregado por
1m/5m/15m, avaliando disco × precisão); arquitetura de banco (ClickHouse, TimescaleDB, **Parquet/DuckDB**);
e consumo de terceiros (auto-agregação via WS/REST vs agregadores externos — Coinalyze, **Coinglass** —
pesando resiliência, cota e custo).

*Leitura que adoto onde o texto admite duas: estrutura e sinal vivem em 15m/1h/4h; 1m/5m/15m é a
cadência de avaliação e de resolução intrabarra. Se a intenção for outra, isto muda o §3.2.*

---

## 2. O que isso RESOLVE

### 2.1 Q17 / CL-4 (spread) — rebaixado de capture-or-lose para premissa declarada

*"Não é HFT, não é leitura de milissegundo no livro"* responde a pergunta que eu tinha aberto como
capture-or-lose urgente. A opção (b) passa a ser a resposta natural: **modelar slippage de `bookDepth`
mais uma premissa de spread declarada e carimbada em todo backtest.**

E isto é a parte que alivia de verdade: **`bookDepth` continua publicado no dump e é re-baixável**
(561 KB/dia/símbolo, snapshot de 1 min × 24 níveis percentuais). Logo, ao escolher (b), **não se perde
nada esperando** — o que era o único motivo de CL-4 ser urgente. `bookTicker` (topo de livro, 404 no
dump desde 2024-04, 340–420 GB/ano para capturar 20 símbolos ao vivo) sai do escopo desta fase.

O que **permanece** como requisito: a premissa de spread precisa ser um parâmetro nomeado, versionado
e carimbado no resultado — nunca uma constante dissolvida no número. Um backtest sem custo continua
sendo fantasia; o que mudou é que o custo pode ser **declarado** em vez de **medido tick a tick**.

### 2.2 Q9 (retenção de tick) — encolhe de "quantos dias de tick" para "praticamente nenhum"

Três medições encadeadas, e a conclusão é forte:

**(a) CVD por bucket não precisa de tick.** `kline(2·taker_buy − volume)` reproduz o delta do `aggTrade`
com somas **idênticas** (corr 1,000000; MAE 0,0443 BTC; drift máx 2,55 BTC que reverte). Disco zipado
de 1 dia de BTCUSDT: `aggTrades` 33,1 MB · `klines 1m` **61,3 KB** · `klines 5m` **13,7 KB** — **540×** e
**2.412×** mais barato.

**(b) A resolução intrabarra que o backtest precisa é entregue por 1m.** O único uso real de tick numa
estratégia de bucket é o desempate SL-vs-TP dentro da barra: se a barra de 15m tocou o stop e o alvo,
qual veio primeiro? Medido em **768 barras de 15m ao longo de 8 dias** (BTCUSDT, 2026-08-16 a 08-23):

| | |
|---|---|
| barras cujo high e low caem em **barras de 1m diferentes** (ordem resolvida sem tick) | **756/768 = 98,44%** |
| resíduo que ainda exigiria tick | **12/768 = 1,56%** |

**(c) Logo o resíduo é 1,56%, e ele tem tratamento sem tick:** convenção pessimista declarada (assume-se
o stop primeiro) no run registry. É a escolha conservadora, é auditável, e custa zero de disco.

**Conclusão para o desenho:** `aggTrade` cru **deixa de ser requisito** desta fase para a tese
declarada. Ele volta a ser necessário só se a fase de estratégia introduzir absorção por tamanho de
trade, sweep intrabarra ou avaliação sub-minuto — e é essa a porta a deixar aberta, não o disco.

### 2.3 D-03 (`bar_policy`) — a resolução do bloqueante agora é declarada pelo owner

O validador de domínio bloqueou o gate porque o candle não fechado entra por baixo da regra
anti-lookahead: o bucket em formação tem `available_at ≈ agora`, logo R-1 o admite, e faltava a
conjunção `bucket_end <= t_decisao`. O owner acaba de declarar que **a decisão ocorre no fechamento
do bucket**. Portanto `bar_policy = final_only` para avaliação de condição de entrada não é mais
inferência do arquiteto — é premissa do owner, e `intrabar` fica restrito a simulação de execução.

### 2.4 O problema que dominou a rodada de UX **dissolve** a partir de 5m

O achado que reorganizou o desenho de tela foi: *"num gráfico de 1 min, ~80% das barras não têm ponto
de OI"*. Isso era artefato de escolher 1m. Na grade nativa de 5 min do sentimento:

| barra | pontos de OI por barra |
|---|---|
| 1m | 0,2 — **1 em 5 barras tem OI** |
| 5m | **1,0** |
| **15m** | **3,0** |
| **1h** | **12,0** |
| **4h** | **48,0** |

Nos prazos que o owner declarou, **toda barra tem OI**, e a partir de 15m tem vários. A política de
renderização de ausência continua sendo requisito (lacuna real existe: 3 buckets em 8.640 medidos),
mas ela deixa de ser a decisão central da tela e volta a ser tratamento de exceção. O carimbo de
idade continua obrigatório por outra razão, que não mudou: a **defasagem de publicação** do OI
(medido: 99,6–200,8 s), que é independente do timeframe.

Funding continua sendo evento raro (3–6 pontos/dia) e continua exigindo desenho de trilho de evento,
não de série contínua.

### 2.5 A arquitetura de armazenamento ganha um candidato que se encaixa melhor

O discovery tinha enquadrado a decisão como TimescaleDB × ClickHouse. O owner acrescentou
**Parquet/DuckDB**, e sob a tese declarada ele é o candidato mais alinhado: dado **em bucket** (não
tick), **append-only**, leitura pesada e sequencial para backtest, sem servidor para operar, e custo
de nuvem proporcional a objeto em storage frio. O contrato bitemporal `(event_time, available_at)` é
portável para ele, e o DuckDB tem `ASOF JOIN` nativo — o que importa por causa da correção D-01
(o operador seguro é `>=`, mais recente no passado).

Não estou decidindo: nenhum dos três foi instalado nem medido, e a decisão é ADR com falsificador.
Estou registrando que a ordem de preferência mudou com a tese.

---

## 3. O que isso ABRE — e precisa de resposta

### 3.1 ⚠️ Fibonacci e pivôs entram; SMC não é mencionada. As duas coexistem ou uma substitui a outra?

A proposta original (§Módulo B) nomeia **OB, FVG, BSL/SSL, BOS/CHoCH** — vocabulário SMC. A tese agora
declarada nomeia **pivôs de alta/baixa, retração/extensão de Fibonacci, e volume**. São vocabulários
diferentes, e a diferença tem consequência concreta em três lugares:

- **o que se detecta** (e portanto o que a fase de estratégia constrói);
- **o que se marca à mão** no corpus de fixtures — marcar Order Blocks e marcar pivôs/Fib são
  trabalhos distintos, e o corpus não é reaproveitável de um para o outro;
- **quanto trabalho a fase seguinte tem** — a estimativa muda.

**A pergunta é sua, e é Q20:** a fase de estratégia detecta SMC, detecta pivôs+Fibonacci, ou os dois?

**Observação que vale independentemente da resposta, e é a mais útil deste documento:** os dois
vocabulários se apoiam no **mesmo** primitivo. Pivô é uma definição de swing. Âncora de Fibonacci é um
par de swings. BOS/CHoCH é rompimento de swing. BSL/SSL é extremo de swing. **Fixar a definição de
swing determina quase tudo o mais** — e, fixada ela, os níveis de Fibonacci são aritmética pura, sem
parâmetro novo. Isso confirma, agora por dois caminhos independentes, o que a skill do repositório já
dizia: *"definição de swing — TODA a detecção de estrutura depende desta escolha; é a primeira a
fixar"*. É o parâmetro de maior alavancagem do projeto inteiro.

### 3.2 "Nuvem" torna concreta uma decisão que estava abstrata

O texto fala de *"custos de armazenamento e processamento em nuvem"*, o que aponta para nuvem e não
para localhost — e Q2 estava registrada com a premissa "host single-user, não exposto". Duas
consequências medidas que passam a valer:

- **`available_at` OBSERVED não é propriedade do mercado — é propriedade de (mercado, local do
  observador, caminho de rede).** Os dumps vivem em `ap-northeast-1`. Um host em São Paulo e um em
  Tóquio produzem `available_at` sistematicamente diferentes. A escolha de região deixa de ser
  detalhe de infra e passa a ser parâmetro do dado, e a **região do observador tem de ser coluna
  persistida** — é uma coluna hoje, impossível retroativamente.
- **Nuvem exposta muda a decisão de auth/TLS** de "código morto" para "estrutura", que é o que Q2
  registra como consequência de falsificação.

### 3.3 Coinglass não foi medido

A Coinalyze está medida ([medicao-coinalyze.md](medicao-coinalyze.md), 11 chamadas). **Coinglass é
menção nova e tem zero medição** — nem doc lida, nem endpoint chamado. Se ela é candidata real, o
mesmo protocolo se aplica antes de qualquer requisito depender dela.

---

## 4. Procedência das medições deste documento

Todas sobre dado real, com o comando ao lado, hoje:

| afirmação | comando | n |
|---|---|---|
| pontos de OI por barra | aritmética da grade de 5 min | — |
| high/low de 15m em barras de 1m distintas: 98,44% | `klines` 1m e 15m de `data.binance.vision`, 2026-08-16..23, comparação por bucket com `Decimal` | 768 barras / 8 dias |
| disco `aggTrades` × `klines 1m` × `klines 5m` | `ls -la` dos zips de 2026-08-20/23 | 3 arquivos |
| CVD por bucket via kline reproduz o do `aggTrade` | recomputação com `Decimal` sobre a string crua | 864 buckets / 3 dias |
| `bookDepth` re-baixável, `bookTicker` 404 desde 2024-04 | `curl -sI` em 5 datas diárias e 5 mensais | 10 requisições |
| custo de `bookTicker` 340–420 GB/ano para 20 símbolos | `curl -sI` (Content-Length) em 8 símbolos, 2024-03-25 | 16 requisições |

**Ressalva única e ela vale para as duas linhas de medição intrabarra:** um símbolo (BTCUSDT), 8 dias,
regime de mercado único. O 98,44% é forte para BTC nessa janela; um alt ilíquido tem menos trades por
minuto e o número tende a cair. Medir em um alt antes de fechar a decisão de disco é barato — 61 KB
por dia por símbolo — e está nomeado como pendência, não estimado.
