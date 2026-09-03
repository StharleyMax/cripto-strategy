# Q11/Q20 — detecção "autônoma" de estrutura: veredito do `quant-architect`

**Data:** 2026-09-02 · **Autor:** `quant-architect` · **Rev de ancoragem:** `master@f1d3977` (árvore com
`docs/spike/` e `scripts/pilot-swing-marker/` ainda não versionados) · **Entrada:**
[`handoff/Q11-deteccao-autonoma.md`](../handoff/Q11-deteccao-autonoma.md) §1–§6 · **Saída paralela:**
[`ADR-017`](../../../adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md) (`RASCUNHO`; aprovar é gate do owner).

**Universo de toda medição deste relatório:** BTCUSDT perp Binance, `data/binance/klines/tf2/BTCUSDT-1m-2026-08-16..23.csv`
(8 dias, 11.520 barras de 1m, TFs maiores reamostrados delas), `data/binance/klines/g3/{klines,markPriceKlines}/BTCUSDT-5m-2026-08-23.csv`
+ `g3/mp_btc_0821/` (2 dias de mark 5m), `data/binance/metrics/btcusdt/*.csv` (30 dias, grade 5 min, 8.637 pontos).
Script: [`scripts/q11-swing-measure/measure_swings.py`](../../../../scripts/q11-swing-measure/measure_swings.py) (stdlib puro,
sem dependência; `python3 scripts/q11-swing-measure/measure_swings.py`; saída íntegra versionada ao lado em `measure_out.txt`). **8 dias não é backtest** — é o que existe;
todo número abaixo é de calibração/ilustração, nenhum é de desempenho.

**Fatos do Pine (`docs/spike/smc-strategy.tradingview`) conferidos linha a linha antes de citar** `[MEDIDO: cat -n]`:
`period = 20` (L93) · `PH = ta.pivothigh(high, period, period)` (L148) · `HighIndex := Sync - period` (L157) · BUY em
`ScrHigh > UpdatedHigh and phActive` (L167), com `phActive := false` logo em seguida (L169) — **cada pivô rompe UMA
vez** · `CandleType = 'Wicks' == 'Wicks'` (L94–96) ⇒ rompimento é por **pavio**, nunca por fechamento · `VolCal` devolve
`" "` nas três ramificações (L143) — **volume tem efeito zero** · `commission_value=0.00` (L17) · SL 1 % / TP 1,5 % (L26–28) ·
`default_qty_value = 100` (L14) · `enable_strategy_2 = false` (L243) · **não existe** estado de tendência, OB, FVG nem
liquidez no arquivo (nenhuma ocorrência de `choch`, `fvg`, `orderblock` — `grep -ic` → 0). O §3.1 do handoff está
correto em todos os pontos; acrescento a semântica *one-shot* (L169) e o *wick-break* (L96/L150), que mudam a definição
de BOS. Screenshot `smc-trading-view.png`: indicador *"Smart Money Concept (Expo) 10 1 1 2 20"* com CHoCH/BMS/HH/LH/HL/LL
e painel *Trend Negative · Upper 81500 · Lower 57758.6 · Mid 69629.3* `[MEDIDO: inspeção da imagem]`;
`smc-tradingview.png`: **5 entradas visíveis** (Long, Short, Long, Short, Long), Dez/25→Ago/26, não "~8 trades"
`[MEDIDO: inspeção da imagem; contagem de rótulos de entrada]`.

---

## §6.1 — A tese do §5, ponto a ponto

### 5.1 "A proposta confunde detecção com verificação" — **CONFIRMADO**

O Pine é um detector sem nenhuma entrada humana (L148–175). "Sem ação do homem" já é o caso em todo indicador SMC
publicado; o que nenhum deles carrega é **prova de que a marca está certa** — o único "teste" do arquivo é um backtest
sem custo (L17), que o §Backtest da skill descarta. **Mas a fala do owner carrega algo a mais que a tese não registra:**
ele propõe que a *evidência* venha do **dado** (volume, OI, livro), não do olho. Isso é falso para geometria de preço
(swing/OB/FVG — ver 5.2) e **parcialmente verdadeiro** para posicionamento (5.3). Separar os dois é o conteúdo da ADR-017.

**Como o owner confere sem confiar em mim:** abrir `docs/spike/smc-strategy.tradingview` nas linhas 143, 148, 167–169;
não há input humano em nenhum caminho de sinal; e `VolCal` devolve `" "` três vezes.

### 5.2 "Swing fractal não tem verdade externa; marcar à mão calibra N" — **CONFIRMADO, com uma correção**

Fractal N é uma **definição**; o teste unitário prova que o código implementa a definição; nenhum humano "verifica" uma
definição. Até aqui a tese está certa. **A correção:** a marcação do owner **não é redundante com o teste unitário** —
ela mede outra coisa: a **concordância entre a leitura estrutural dele e uma tupla `(definição, N, TF, política de
empate, price_source)`**. Se a concordância for baixa em todo N, a *família* fractal é que está errada para o olho que vai
operar — e nenhum teste unitário detecta isso. Logo: não é corpus, **é conjunto de calibração**, e ele é indispensável.

Números que dizem quão pequeno o conjunto é, e quantos parâmetros ele precisa fixar `[MEDIDO 2026-09-02, script §1]`:

| TF | barras (8 d) | N | swing highs | swing lows | empates em high | latência de confirmação |
|---|---|---|---|---|---|---|
| 1m | 11.520 | 5 | 559 | 571 | **467** | 5 min |
| 1m | 11.520 | 20 | 169 | 160 | 116 | 20 min |
| 15m | 768 | 2 | 103 | 106 | 10 | 30 min |
| 15m | 768 | 5 | **43** | **45** | 6 | **75 min** |
| 15m | 768 | 10 | 24 | 23 | 2 | 150 min |
| 1h | 192 | 5 | 11 | 11 | 0 | 5 h |
| 4h | 48 | 5 | 2 | 1 | 0 | 20 h |
| 4h | 48 | 20 | **0** | **0** | 0 | 80 h |

- **Política de empate é parâmetro, não detalhe:** em 1m/N=5 há 467 highs *iguais* ao vizinho contra 559 estritos —
  decidir `>` vs `>=` move a contagem em até **+84 %**. Em 15m/N=5 são 6/43 (14 %). Tolerância em ticks (`recorte` §6)
  entra aqui. A semântica exata de `ta.pivothigh` em empates **não foi verificada nesta sessão** (fetch da referência
  Pine falhou) — `[NÃO VERIFICADO]`, URL: `tradingview.com/pine-script-reference/v5/#fun_ta.pivothigh`.
- **Uma sessão de calibração em 15m/N=5 são 88 candidatos em 8 dias** — não são "horas por semana", é uma tarde, uma vez
  por tupla candidata. Em 4h, 8 dias dão 3 swings: **4h não é calibrável com o dado que existe**.
- **`price_source` decide onde o swing está** (confirma `ADR-007/PS-3` e `Q11(d)`), agora com o swing em si, não só com
  a ordenação de highs: Jaccard entre os conjuntos de timestamps de swing em `klines_last` × `mark_price`, 5m
  `[MEDIDO, script §2, n=2 dias]`: **0,644 (N=5, 08-23) · 0,839 (N=5, 08-21) · 0,550 (N=10, 08-23) · 0,938 (N=10, 08-21)**
  — entre 6 % e 45 % dos swings **não coincidem** entre as duas séries. Marcação sobre uma não vale para a outra.

**Como o owner confere:** `python3 scripts/q11-swing-measure/measure_swings.py | sed -n '/1\. fractal/,/1b\./p'`; e abrir o 15m dos 8 dias no
gráfico e contar a olho quantos dos 88 ele marcaria — esse número **é** a calibração.

### 5.3 "Zona de dinheiro preso é fato de dado; verificação vira backtest" — **CONFIRMADO EM PARTE, DERRUBADO EM PARTE**

**O que está certo:** OI, CVD (de `aggTrades.is_buyer_maker`, nunca de OHLCV) e liquidações são **medidas**, não leitura
de olho. Um evento definido sobre elas é reproduzível por qualquer um com o mesmo dado.

**O que derruba a formulação "fato de dado":**
1. **OI é agregado.** ΔOI > 0 dentro de um range diz que *posições foram abertas*; não diz **quem** está do lado errado.
   O lado preso é inferência: `sum_taker_long_short_vol_ratio` / CVD (quem agrediu) **+** direção do rompimento. A zona
   é um **evento derivado com ≥ 3 parâmetros** (janela `W`, limiar de ΔOI, limiar de compressão) — não um fato bruto.
2. **Os limiares só podem ser percentis**, e 8 dias não os calibram `[MEDIDO, 30 dias, n=8.589 janelas de 4h]`:
   ΔOI_4h p50 = −0,04 % · **p90 = +1,35 %** · p95 = +2,14 % · p99 = +4,03 % · máx = +6,66 %. "ΔOI ≥ 1 % em 4h" acontece
   **13,63 %** do tempo — não é extremo. Com `ΔOI_4h ≥ +1 % ∧ range_4h ≤ 1 %` sobre os 8 dias: **5 buckets, 1 episódio**
   (08-18 18:15–18:35 UTC, ΔOI máx +2,12 %, range 64.429,5–65.057,9), **sem rompimento nas 4h seguintes**. n = 1 não
   sustenta nada — mostra só que o evento **é** computável com as-of correto e que a taxa-base é baixa.
3. **OB e FVG continuam geometria de preço.** OI/CVD não os *definem*; podem *qualificá-los* (OB com ΔOI+ e absorção
   no CVD é OB "com dinheiro dentro"). Isso é a **perna 3 da matriz do Módulo C**, não uma redefinição do Módulo B.
   Detecção de OB/FVG segue o regime de 5.2 (definição + teste + calibração); o **valor** do OB segue o backtest.
4. **Backtest não separa "detector errado" de "tese errada"** (o próprio §5.5(d) admite). Logo ele **não substitui**
   os oráculos estruturais — soma-se a eles.

**Alinhamento é fronteira, não ETL:** `metrics.create_time` **não tem close_time**; a leitura correta é *as-of*
(`snapshot.create_time ≤ bar.close_time`), como o script faz, e a invariante de `avaliacao-discovery` item 11 tem de
rodar sobre **todo** o replay. Cobertura no recorte: 2.304 pontos de OI para 2.304 buckets de 5m (0 buracos nos 8 dias);
8.637/8.640 nos 30 dias `[MEDIDO]`.

**Como o owner confere:** `python3 scripts/q11-swing-measure/measure_swings.py | sed -n '/3\. trapped/,$p'`, depois abrir 08-18 18:00–23:00 UTC
no 5m com OI sobreposto; e a distribuição de ΔOI_4h na seção 3b da mesma saída (`p90=1.350%`).

### 5.4 "Humano audita por exceção; isso resolve o recall" — **CONFIRMADO o modo; DERRUBADA a frase sobre recall**

*Review mode* (detector propõe, owner aceita/rejeita/acrescenta) é a arquitetura certa, e é o que a ADR-017 fixa. **Mas
"o detector gera os candidatos" não torna o recall mensurável** — torna-o **relativo ao gerador**, o que é circular: o
que nenhum candidato cobre continua invisível. O que recupera *parte* do recall é usar um gerador **mais frouxo** como
lista de candidatos, porque fractal é monotônico em N (todo swing N=5 é swing N=2): auditar os 209 candidatos de 15m/N=2
mede quantos dos 88 de N=5 o owner rejeita **e** quantos N=2 ele aceita que N=5 perdeu. O que sobra fora de N=2 fica
rotulado *não mensurável*, como `avaliacao-discovery:46` já dizia — a frase da tese só pode ser "recall **relativo a
N=2**", nunca "recall".

Número que mostra que a hierarquia de TF também é gerador de candidatos `[MEDIDO, script §1b]`: dos 88 swings de
15m/N=5, **94,3 %** têm um swing 1m/N=5 no mesmo bucket de 15 min; **88,6 %** com 1m/N=20 (329 candidatos, confirmados
em 20 min em vez de 75).

**Como o owner confere:** uma sessão de auditoria de 15m/8 dias com N=2 (209 candidatos): `precision = aceitos/(aceitos+rejeitados)`,
`adds` = piso do que N=2 perdeu. Os três números com `n` vão no relatório da sessão.

### 5.5 "Oráculos alternativos, em ordem de custo" — **CONFIRMADO, com duas correções**

(a) invariantes — **primeiro e mais barato**, e um deles vale gravar como portão de teste: *swing confirmado em `t`
só usa barras `≤ t`; pivô com índice `i` só existe a partir de `i+N`*. Acrescento **(a′) mutação da fixture**
(`avaliacao-discovery:46` item 14): trocar `>` por `>=` no empate e exigir vermelho — sem isso a fixture não prova nada.
(b) concordância cruzada com Pine — **só alcança pivô e BOS por pavio one-shot**: o Kostinay não tem CHoCH/OB/FVG (grep → 0),
e a porta só é válida depois de fixar a semântica de empate de `ta.pivothigh` `[NÃO VERIFICADO]`. (c) sintéticos —
bons para lookahead/empate/determinismo, **nunca** para "a definição está certa". (d) backtest com custo, walk-forward —
mede *valor*, não *correção*; costs: taxa do tier do owner `[NÃO MEDIDO]`, funding pago/recebido (série em
`data/binance/fundingrate/`), slippage assumido e declarado.

---

## §6.2 — Qual definição de swing entra primeiro

**(a) fractal N, em `klines_last`, por pavio (`high`/`low`), empate estrito (`>`/`<`) como default a calibrar.**
Não é opinião solta — três razões conferíveis:

| critério | (a) fractal N | (b) zigzag X % | (c) N×ATR |
|---|---|---|---|
| latência de confirmação | **limitada: N barras** (tabela acima) | **ilimitada**: confirma só quando a reversão ≥ X % ocorrer; repinta até lá | N barras + warmup do ATR |
| parâmetros | 1 (N) + política de empate | 1 (X) mas móvel com a volatilidade | 2 (N, período ATR) + `price_source` do ATR |
| verdade de referência | nenhuma (definição) | nenhuma | nenhuma |
| oráculo cruzado disponível | `ta.pivothigh` (Pine), porta trivial | nenhum canônico | nenhum |

**N é por TF, sim** — N conta barras; a latência em minutos é `N × TF` (75 min em 15m/N=5; 5 h em 1h/N=5; 20 h em
4h/N=5). O `N=20` do Pine em 1D são **20 dias** de atraso: os defaults do spike **não se transferem** para 15m/1h/4h.
Candidatos para a calibração: `N ∈ {3, 5, 10}` em 15m e 1h; 4h fica **fora da calibração** até haver ≥ 90 dias (8 dias
= 3 swings).

**Custo de trocar depois:** `avaliacao-discovery:46` item 13 está certo — refaz a árvore de estrutura inteira. O que a
ADR-017 faz para baratear é tornar `swing_definition = {family, params, tie_policy, price_source, code_version}` **chave de
primeira classe** da `<Anotacao>`: a marcação humana (aceite/rejeição) fica ligada ao candidato que julgou e **não é
perdida** quando a definição muda — só a comparação é rerodada.

**Falsificadores:** (i) se na sessão de calibração a precisão do owner for < 70 % para **todos** os N∈{3,5,10} em 15m
(piso proposto; o valor é opinião, o critério não), a família fractal cai e (b) entra para a mesma sessão; (ii) se sobre
≥ 30 dias o Jaccard mark×last em 5m/N=5 for ≥ 0,95, a exigência de `price_source` na marcação vira custo sem retorno —
hoje 0,64–0,84 (n=2 dias).

---

## §6.3 — Definições operacionais e paramétricas (a tabela do Módulo C começa aqui)

Fonte de cada variável: `klines_last` = `tf2` (`open,high,low,close,volume`, `close_time`) · `aggTrades` =
`price,quantity,transact_time,is_buyer_maker` · `metrics` = `create_time,sum_open_interest,sum_taker_long_short_vol_ratio,count_long_short_ratio,*toptrader*` ·
`coinalyze` = `liquidation-history` 1 min. Toda leitura de série não-preço é **as-of ≤ `close_time` da barra de decisão**.

| construto | definição operacional | parâmetros | fonte | componente | como se testa fora da amostra |
|---|---|---|---|---|---|
| **swing_high / swing_low** | `high[i] > high[j]` ∀ `j ∈ [i−N, i+N] \ {i}` (low simétrico); **existe a partir do fechamento de `i+N`** | `N` por TF, `tie_policy ∈ {strict, inclusive}`, `tol_ticks` | `klines_last` | `charts` | propriedade sem lookahead + mutação de `>`↔`>=` + calibração humana em período não usado para escolher N |
| **BOS (BMS)** | na barra `t`, `high[t] > último swing_high confirmado` na direção do estado de tendência; **one-shot** por swing (Pine L169) ou reentrante — parâmetro; por pavio (Pine) ou por `close` — parâmetro | `break_by ∈ {wick, close}`, `one_shot` | `klines_last` | `charts` | porta do Pine sobre os mesmos candles (`wick`, `one_shot`) deve dar **igualdade de conjunto** de barras de sinal; divergência é bug de implementação |
| **CHoCH** | primeiro BOS **contra** o estado de tendência; estado = direção do último BOS (máquina de 2 estados + `indefinido` até o 1º BOS) | os de BOS + `initial_state` | `klines_last` | `charts` | sintético com sequência HH-HL-HH-**LL** deve produzir exatamente 1 CHoCH na barra que rompe o último HL; mutação do estado inicial deve mudar a saída |
| **Order Block** | último candle de cor oposta antes do deslocamento que gerou um BOS/CHoCH; **impulsivo** ⇔ `|close_break − open_OB| ≥ k × ATR(14)` no TF; zona = `[low, high]` do candle (ou `[open, close]` — parâmetro) | `k`, `zone ∈ {wick, body}`, `mitigation ∈ {touch, 50%, body}`, `expiry_bars` | `klines_last` | `charts` | calibração humana por aceite/rejeição sobre candidatos; walk-forward: `k`, `mitigation` escolhidos em 07-25..08-15 e avaliados em 08-16..23 (único recorte com OI) |
| **FVG** | bull: `low[i+1] > high[i−1]`, gap = `low[i+1] − high[i−1] ≥ min_gap`; existe no fechamento de `i+1` | `min_gap` em ticks **ou** fração de ATR, `fill ∈ {partial, full}` | `klines_last` | `charts` | mutação de `>`↔`>=`; contagem sintética; calibração humana |
| **BSL/SSL** | ≥ 2 swing_highs com `|h_a − h_b| ≤ tol_ticks` (equal highs), ou o extremo do último swing | `tol_ticks`, `min_count` | `klines_last` + `tick_size` datado | `charts` | mutação de `tol_ticks`; calibração humana |
| **zona de dinheiro preso** | range = `[swing_low, swing_high]` do último par confirmado; **acúmulo**: `ΔOI(range) ≥ P_q` da distribuição de ΔOI na mesma janela sobre 30 dias; **lado**: sinal do CVD (ou `taker L/S`) dentro do range; **evento**: rompimento contra o lado; **confirmação**: `ΔOI ≤ −x` e/ou liquidações Coinalyze ≥ `P_q` nas `W` barras seguintes | `q` (percentil, ex.: 90 ⇒ 1,35 % em 4h hoje), `W`, `x`, `side_source ∈ {cvd, taker_ls}` | `klines_last` + `metrics` + `aggTrades` + `coinalyze` | **`convergencia`** (consome `charts` e `sentimento`) | event study: retorno e ΔOI a `H` barras após o evento, `n` declarado, custos incluídos; e a invariante as-of sobre todo o replay |

**Fronteira de módulo que decorre:** geometria de preço em `charts`; séries de posicionamento em `sentimento`;
**"dinheiro preso" é evento de `convergencia`**, não zona de `charts` — ele não existe sem OI. Vocabulário de mapeamento
para o owner: **BMS ≡ BOS** (o termo do indicador Expo); "chock" = CHoCH.

---

## §6.4 — Order book dentro da zona: requisito agora ou não

**Fato:** não há profundidade histórica em nenhuma fonte do projeto (`bookTicker` saiu do dump em 2024-03, Q17). É
**capture-or-lose**: só existe a partir do dia em que a captura começar, e nenhum detector pode depender dela antes de
haver dias suficientes.

**Custo REST, `GET /fapi/v1/depth`** `[DOC: developers.binance.com › USDⓈ-M Futures › Market Data › Order Book, lido 2026-09-02]`:
peso **2** para `limit ∈ {5,10,20,50}`, **5** para 100, **10** para 500 (default), **20** para 1000; resposta traz `E`
(message output time) e `T` (transaction time) — os dois são o alinhamento. Orçamento: `REQUEST_WEIGHT 2400/min` por IP
`[MEDIDO: data/binance/rest/ei.json → rateLimits[0]]`. Um poll por segundo, um símbolo: `limit=50` → 120/min (5 % do
orçamento); `limit=100` → 300/min (12,5 %); `limit=500` → 600/min (25 %). O caminho barato é o WebSocket de *partial
book depth* (`<symbol>@depth<levels>@<speed>`), sem peso REST — **semântica não refetchada nesta sessão**
`[NÃO VERIFICADO: developers.binance.com › Websocket Market Streams › Partial Book Depth Streams]`. Volume estimado
`[INFERRED: 20 níveis × 2 lados × ~20 B × 4 Hz]` ≈ 3,2 KB/s ≈ **~280 MB/dia/símbolo** cru, antes de compressão.

**Recomendação (trade-offs medidos; a decisão é do owner):** **não** entra como requisito desta fase. (i) o owner disse
*"tvz pode ser interessante"* — é hipótese, não requisito; (ii) livro mostra **intenção cancelável** (ordens limitadas),
OI mostra **compromisso** — para "dinheiro preso" o OI é a variável certa e já existe por 30 dias; (iii) se entrar, entra
como **coletor contingente**, mesmo regime do spread (`SPEC-001 §8.1`/Q17): BTCUSDT só, WS partial 20 níveis, gravando `E`
e `T`, com `capture_started_at` na proveniência, e **nenhum detector lê o livro antes de ≥ 30 dias capturados**. Opinião
rotulada: livro na zona é a **última** perna a acrescentar, depois de OI/CVD/liquidações terem sido medidas em backtest.

---

## §6.5 — Q11 reformulada; o que da fala vai e não vai para Q20

**Q11, nova forma (proposta ao owner):**
> *"Uma sessão inicial de CALIBRAÇÃO (15m, 8 dias, 209 candidatos N=2 / 88 N=5, teclado, aceitar/rejeitar/acrescentar)
> e, depois, quantas horas por semana de AUDITORIA POR EXCEÇÃO sobre candidatos que o detector propõe?"*

O que muda: `pointer_mode = annotate` ganha um sub-modo **review**; a resposta "não vou marcar" deixa de derrubar o
plano de verificação inteiro (sobram os oráculos (a)/(a′)/(b)/(c) de 5.5), mas **derruba a calibração** — sem ela, N é
palpite e a definição fica rotulada `[NÃO CALIBRADO]`. **Custo de uma hora de marcação continua `[NÃO MEDIDO]`**: o piloto
`scripts/pilot-swing-marker/build.mjs` nunca rodou com o owner (`find . -name 'swing-marks*'` → vazio) e não atende
`T-08.9` (mouse, sem `price_source`/proveniência/chave).

**Q20 — o que PODE ser registrado (como sinal, com a citação):** o vocabulário-alvo do owner é **SMC** — "OB, chock, bms"
`[PREMISSA-OWNER: 2026-09-02]` — e o alvo visual é o indicador Expo (CHoCH/BMS/HH/LH/HL/LL). **O que NÃO pode:** que
pivôs+Fibonacci saíram (a fala não os nega; a tese de 08-25 os afirmava); que a resposta é "SMC" e não "os dois";
e **"dinheiro preso" não é SMC** — é construto de posicionamento (OI/CVD), pertence ao Módulo C/`convergencia`, e entrar
com ele em Q20 misturaria as duas perguntas. Q20 continua `ABERTA` até o owner dizer "SMC", "os dois" ou outra coisa.

**Tasks afetadas (sem tocar `tasks.toml`):** `T-08.10` (`swing_point`) ganha os campos de proveniência de detector e
`review_verdict` (ADR-017/D2); `T-08.9` continua `blocked` por Q11, mas o bloqueio passa a ser "horas de auditoria";
`T-05.6` (`pointer_mode`) precisa do sub-modo `review`.

---

## §6.6 — O que não consigo julgar (rotulado)

1. **Se o olho do owner concorda com algum N** — só a sessão de calibração diz; `[NÃO MEDIDO]`.
2. **Semântica de empate de `ta.pivothigh`** e **semântica do WS partial depth** — `[NÃO VERIFICADO]` (fetch falhou).
3. **Taxas/slippage do tier do owner** — `[NÃO MEDIDO]`; sem elas nenhum backtest fecha.
4. **Se "dinheiro preso" tem valor preditivo** — n = 1 episódio em 8 dias; precisa de ≥ 30 dias de preço 5m
   alinhado ao OI (o OI existe por 30 dias; o preço 1m só por 8) — `[NÃO MEDIDO]`.
5. **Se vale capturar o livro** — decisão financeira/de tempo do owner; apresentei o custo e parei.
6. **Comportamento em 1D dos screenshots** — não há 1D local; não reproduzível.
7. **Tamanho de posição, risco, corretora, jurisdição** — fora do meu mandato por carta do agente.
