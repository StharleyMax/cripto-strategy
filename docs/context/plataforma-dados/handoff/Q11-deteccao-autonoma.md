# Handoff · Q11/Q20 — detecção de estrutura "autônoma" e o que sobra para o humano

Escrito pelo coordenador do loop em 2026-09-02, para despacho ao `quant-architect`. Contexto longo
fica aqui; o prompt de despacho só cita este caminho (`docs/protocolo-de-despacho.md` R2).

## 1. O que o owner pediu (citação literal, 2026-09-02)

> "A proposta é que nosso fluxo seja 'autonomo'. Defina as zonas de OB, chock, bms, zonas onde o
> dinheiro ta preso e afins e na minha concepção isso da para ser visto sem ação do homem, pois temos
> acesso a volume e afins, tvz pode ser interessante ter o order book dentro da zona do swing."

`[PREMISSA-OWNER: 2026-09-02]`. Pedido: "analise o que levantamos, analise a proposta e problema …
destravar esse tópico para poder dar sequência".

**Duas coisas que a fala carrega e que os documentos ainda não registram:**
- o vocabulário nomeado é **SMC** (OB, CHoCH, BMS/BOS) — isso é material para `Q20`, que está
  `ABERTA` porque `direcionamento-operacional` nomeava pivôs+Fibonacci e não mencionava SMC.
  **Não é resposta formal de `Q20`** até o owner confirmar; registrar como sinal, com a citação.
- "sem ação do homem" fala de **detecção**. `Q11` pergunta sobre **verificação** (corpus de
  fixtures marcado à mão). São dois atos distintos, e o handoff existe para separá-los.

## 2. Estado documental de Q11 e Q20 (`[DOC]`)

- `docs/decisoes-do-owner.md:390-400` — Q11 `ABERTA`: "nenhum detector de estrutura é verificável
  sem esse corpus"; primeira tranche = **marcação de swing**; primitivo de `<Anotacao>` =
  `swing_point`, não `zone`.
- `docs/decisoes-do-owner.md:537-546` e `docs/direcionamento-operacional.md:122-140` — Q20 `ABERTA`;
  "definição de swing é o parâmetro de maior alavancagem do projeto inteiro".
- `docs/avaliacao-discovery.md:46` (item 13) — três definições candidatas de swing: (a) fractal N,
  (b) zigzag X%, (c) N×ATR. Verificação proposta: fixture com N de trechos > 1, **precision**
  reportada, **recall rotulado como não mensurável**.
- `docs/recorte-plataforma.md:235` — "nenhuma tabela de swing_high/swing_low materializada como se
  fosse fato".
- Tasks travadas por Q11: `T-08.9` (marcação com teclado obrigatório, `blocked`); relacionadas
  `T-05.5`, `T-05.6` (`pointer_mode`), `T-08.10` (`swing_point`, zero algoritmo).
- `.claude/skills/quant-trading/SKILL.md` §Verificação: "Nada de estratégia é dado como pronto sem
  backtest com universo declarado … e sem teste de regressão contra fixtures de mercado com
  marcação fixada à mão."
- `.claude/agents/quant-architect.md` — forma de verificação preferida nº 1 é a fixture marcada à
  mão; nº 2 é backtest com universo; nº 3 é critério contra documento público.

## 3. O que a rodada de TradingView levantou (`[MEDIDO 2026-09-02]`, leitura direta dos 3 arquivos)

### 3.1 `docs/spike/smc-strategy.tradingview` — "Smart Money Concept - Uncle Sam" (Kostinay, Pine v5)

Deriva de *Smart Money Concepts [LuxAlgo]* e *Smart Money Breakouts [ChartPrime]* (cabeçalho).

| aspecto | o que o código faz | linha-âncora |
|---|---|---|
| definição de swing | `ta.pivothigh(high, period, period)` / `ta.pivotlow`, `period = 20` | `PH = ta.pivothigh(high, period, period)` |
| latência de confirmação | o pivô só existe **20 barras depois** do extremo (`HighIndex := Sync - period`) | idem |
| sinal | BUY quando `high > UpdatedHigh` (rompe o último pivô alto confirmado); SELL simétrico. É **BOS puro** — não distingue CHoCH, não desenha OB, FVG nem liquidez | `if ScrHigh > UpdatedHigh and phActive` |
| volume | `VolCal` calcula razão verde/vermelha, mas `Out = GreenRatio > 55 ? " " : RedRatio > 55 ? " " : " "` — **as três ramificações devolvem `" "`**. Volume tem **efeito zero** no sinal e no rótulo | função `VolCal` |
| custos | `commission_value=0.00` — backtest **sem taxa**, sem funding, sem slippage | cabeçalho `strategy(...)` |
| saída | SL 1% / TP 1,5% fixos em percentual; `default_qty_value = 100` (% do equity); `pyramiding = 1` | inputs |
| filtro | MA(200) opcional, desligado por padrão | `enable_strategy_2 = false` |

**Leitura:** o script é um detector **totalmente autônomo** — prova que "detecção sem humano" já é o
caso, e sempre foi. O que ele **não** prova é que a detecção está certa: nenhum teste, nenhuma
fixture, e o único backtest embutido viola o §Backtest da skill (custo ausente).

### 3.2 Screenshots (`smc-tradingview.png`, `smc-trading-view.png`)

BTCUSDT.P 1D, Binance. A segunda mostra o indicador *"Smart Money Concept (Expo) 10 1 1 2 20"* com
rótulos CHoCH / BMS / HH / LH / HL / LL, painel "Trend: Negative, Upper Range 81500, Lower Range
57758.6, Mid 69629.3". **É o alvo visual que o owner tem em mente** — vocabulário SMC completo, e
não pivôs+Fib. A primeira mostra a strategy do §3.1 com ~8 trades em 9 meses de 1D.

### 3.3 `scripts/pilot-swing-marker/build.mjs` — piloto de marcação (descartável)

- BTCUSDT 1m, 3 dias (2026-08-21..23) de `data/binance/klines/tf2/`, Lightweight Charts 5.2.1.
- Marca por **clique de mouse** (a SPEC exige **teclado obrigatório**, `T-08.9`); output JSON
  `{time, type: high|low, price}` — **sem `price_source`, sem proveniência, sem chave de fixture**
  (`SPEC-001 §5.4 <Anotacao>` exige as três).
- Serve para medir **quanto custa uma hora de marcação** — nunca foi rodado com owner ainda
  (nenhum `swing-marks.json` no repo `[MEDIDO: find . -name 'swing-marks*' → vazio]`).

## 4. Dado disponível hoje para "zonas onde o dinheiro está preso" e "order book na zona"

`[DOC: data/MANIFEST.md]`:

| série | o que há | serve para |
|---|---|---|
| `aggTrades` BTCUSDT | 4 dias completos (08-20, 21, 23, 24), com lado agressor | CVD real, absorção por bucket; **absorção por tamanho de trade** exige tick (Q9 `MORTA`, resíduo em Q20) |
| `metrics` 5 min | 30 dias BTCUSDT (OI, 4 séries de L/S), alts 7 dias | ΔOI dentro do range, "dinheiro preso" = OI sobe no range e o range rompe contra |
| `klines` 1m/15m | 8 dias BTCUSDT; 4 séries de preço no mesmo dia (`g3`) | estrutura; `price_source` por uso (`ADR-007`) |
| Coinalyze | `liquidation-history` 1 min/daily, OI history | cluster de liquidação = onde o dinheiro **já foi** solto; 40 req/min, balde cego |
| **order book** | **nada histórico.** `bookTicker` saiu do dump em 2024-03 (Q17); `depth` só via REST ao vivo, com peso | "order book dentro da zona" é **capture-or-lose**: só existe se começarmos a capturar, e só vale a partir daí |

## 5. A tese que o coordenador leva ao arquiteto (para ele derrubar ou confirmar)

1. **A proposta confunde detecção com verificação.** Detecção **sempre foi** autônoma (o Pine é a
   prova). Q11 nunca perguntou "quem detecta"; perguntou "quem prova que o detector detectou certo".
2. **Para swing por definição fractal, não existe verdade externa** — o detector *é* a definição.
   Marcar swing à mão mede a **concordância entre o olho do owner e um N**, isto é, **calibra N**;
   não verifica nada que o teste unitário determinístico não verifique. ⇒ a tranche de "marcação de
   swing" pode encolher para um **conjunto de calibração pequeno**, não um corpus.
3. **Para zonas (OB/FVG/BMS), a verdade externa também não existe no gráfico — mas pode existir no
   dado.** "Dinheiro preso" é **mensurável**: ΔOI positivo dentro do range + rompimento contra +
   liquidações/CVD no rompimento. Aqui o ponto do owner é mais forte: a zona vira **fato de dado**,
   não leitura de olho, e a verificação vira backtest com universo, não fixture marcada.
4. **O que resta para o humano é auditoria por exceção, não marcação do zero.** Detector propõe,
   owner aceita/rejeita no gráfico (`pointer_mode = annotate` vira **review mode**). Isso responde a
   Q11 como "horas de auditoria", não "horas de marcação", e resolve o problema de recall que
   `avaliacao-discovery:46` declarava não mensurável (o detector gera os candidatos).
5. **Oráculos alternativos ao humano, em ordem de custo:** (a) invariantes/propriedades — sem
   lookahead (decisão em `t` usa só barras ≤ `t`; pivô confirmado só em `t+N`), determinismo,
   invariância sob re-ingestão; (b) concordância cruzada com implementação de referência (porta do
   LuxAlgo/Kostinay rodada sobre os mesmos candles — pega bug de implementação, não erro de
   definição); (c) candles sintéticos com estrutura construída; (d) backtest com custo, fora da
   amostra (o único que mede se a zona **vale** algo, mas não separa "detector errado" de "tese
   errada").

## 6. O que o arquiteto precisa devolver

1. Veredito sobre a tese do §5, ponto a ponto, com **como o owner confere sem confiar** em cada um.
2. Qual **definição de swing** entra primeiro (a/b/c de `avaliacao-discovery:46`), com o custo de
   trocar depois e o **falsificador**. O Pine usa fractal N=20 em 1D; nossa operação é 15m/1h/4h
   `[PREMISSA-OWNER, direcionamento-operacional]` — N é por TF?
3. Definição **operacional e paramétrica** de OB, FVG, BOS/CHoCH e "zona de dinheiro preso" —
   cada uma com fonte de cada variável (`klines_last`, `aggTrades`, `metrics`, Coinalyze) e a
   quarta coluna da skill: **como se testa fora da amostra**.
4. Se **order book dentro da zona** entra como requisito de captura agora (capture-or-lose) ou fica
   fora, com o custo em peso de `/fapi/v1/depth` declarado.
5. Reformulação de **Q11** (horas de auditoria × horas de marcação) e o que da fala do owner
   **pode** e o que **não pode** ser registrado como resposta de **Q20**.
6. O que você **não consegue julgar** — rotulado, não omitido.

Relatório completo em `docs/context/plataforma-dados/gates/Q11-deteccao-autonoma-quant-architect.md`.
Se houver decisão de arquitetura, rascunhe `docs/adr/ADR-017-*.md` (não aprove — gate é do owner).
Devolva ao loop **no máximo 15 linhas**: veredito, números com comando, caminho do relatório.

## 7. Estado após a primeira sessão do owner (2026-09-02, coordenador do loop)

**Calibração de swing declarada pelo owner, citação literal:** *"ok, 15 + 5 e 1h + 10 funcinou legal, podemos
avançar colm eles no piloto"* `[PREMISSA-OWNER: 2026-09-02]`. Leitura adotada: **15m → N=5** e **1h → N=10**,
fractal por pavio, empate estrito, `klines_last`. **Método: a olho, dentro do piloto.** O JSON de vereditos
(precision com `n`, acréscimos) **não foi exportado** — a calibração está registrada como declaração, não como
medição `[NÃO MEDIDO]`. 5m e 4h seguem **não calibrados** e o piloto diz isso no cabeçalho.

**Sinal do owner sobre a fala anterior (mesma data):** ao ver um topo mais baixo marcado como `H`, perguntou por
BMS/CHoCH e por OB não mapeados. Interpretação: o alvo dele é o vocabulário SMC completo (reforça o sinal para `Q20`,
ainda sem resposta formal). O critério que ele aplicou ao rejeitar o `H` é de **magnitude**, que o fractal N=2 não
tem e N=5 aproxima.

**O piloto avançou um elo** (`scripts/pilot-swing-marker/build.mjs`, schema `q11-swing-review/2`, offline):
- swing calibrado por TF como default; rótulos HH/HL/LH/LL derivados do conjunto **revisado** (não rejeitados + acréscimos);
- BMS/CHoCH pela máquina de 2 estados de §6.3 (pavio, one-shot, paridade Pine), só sobre swing **confirmado** (`ref_i + N ≤ t`);
- **OB como candidato julgável**: último candle oposto antes do deslocamento, impulsivo se `≥ k×ATR(14)`, zona `[low, high]`,
  mitiga no toque, expira em 200 barras; `k ∈ {0,5; 1; 1,5; 2}`, default 1.

`[MEDIDO 2026-09-02, harness Node sobre o HTML gerado, BTCUSDT 8 dias]`: 15m/N=5 → 88 swings, 20 BMS, 17 CHoCH,
22 OB (k=1) / 16 OB (k=1,5); 1h/N=10 → 11 swings, 5 OB. Invariantes: 0 evento rompe swing antes da confirmação;
0 OB posterior ao rompimento que o gerou; primeiro evento sempre BMS (estado indefinido).

**Próximo passo que depende do owner:** julgar OBs em 15m/N=5 e exportar o JSON — é a "calibração humana por
aceite/rejeição sobre candidatos" que a linha OB de §6.3 pede, e o primeiro número de `k` que não é palpite.

## 8. Respostas do owner em 2026-09-03 e o que falta o `quant-architect` decidir

**Citação literal do owner (2026-09-03), na grafia dele:**
> "q20; coexistem, q11: pode aceitar o default, mas te passo o json caso ele seja importante: {…} Rompimento por
> fechamento, .claude/agents/quant-architect.md deve saber responder isso tbm, ele tem q ser o especialista, Inclusive
> ele precisa validar nossas decisões. profundidade do histõrico pode seguie o recomendado."

`[PREMISSA-OWNER: 2026-09-03]`. Leituras adotadas pelo coordenador (rótulo próprio, não fala do owner):
- **Q20 → RESPONDIDA: "coexistem"** — a fase de estratégia detecta **SMC e pivôs+Fibonacci**. Consequência já conhecida
  (`PRD-001 §8/Q20`): o primitivo compartilhado é o swing; os níveis de Fibonacci são aritmética sobre pares de swings; o
  corpus de **zonas** não se reaproveita entre os dois vocabulários, mas agora o de swings serve aos dois.
- **Q11 → RESPONDIDA: "pode aceitar o default"** — o owner **não** se compromete com horas de marcação nem de auditoria
  recorrente. A pilha de verificação de `ADR-017/D3` fica em invariantes + mutação + concordância cruzada + backtest;
  a calibração humana (D3.3) passa a ser **pontual e opcional**, e o que ela produziu está no JSON abaixo.
- **Rompimento por pavio × fechamento → DELEGADO ao `quant-architect`**, que também deve **validar** a tabela v1 (§7 e
  abaixo) e a divisão classe A/classe B.
- **Profundidade do histórico → "o recomendado"** — o `quant-architect` recomenda, com custo em disco declarado.

**JSON exportado pelo owner:** [`../fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json`](../fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json)
(schema `q11-swing-review/2`, grade `1b96c671…`, `code_version 44ac181+build.1d7fa5a1075a`). O que ele contém, e como ler:

| sessão | candidatos | vereditos | duração | leitura |
|---|---|---|---|---|
| 1h / N=2 (pré-calibração) | 51 swings | **51 accept, 0 reject** | 18 s (`21:02:09`→`21:02:27`) | ~170/min: passagem de tecla, **não** julgamento. Precision 100 % **não é calibração** `[NÃO CALIBRADO: sessão de 18 s]` |
| 15m / N=5 (calibrado) | 88 swings · 16 OB (k=1,5) | swings 0 · **OB 15 accept, 0 reject, 1 pendente** | 7 s | idem: `judgments_per_min ≈ 128`. Registra que o owner **viu e não recusou** os 15 OBs; não mede a definição |
| 1h / N=10 (calibrado) | 11 swings · 5 OB (k=1) | nenhum | — | só a estrutura derivada: 3 BMS, 2 CHoCH |
| 15m / N=10 (não calibrado) | 47 swings · 14 OB (k=1,5) | nenhum | — | 11 BMS, 11 CHoCH |

O valor do arquivo não é a precision. É (i) a **primeira fixture de estrutura com proveniência completa** (definição,
grade, `knowledge_time`, `confirmed_at` por candidato) — serve de fixture de regressão para a porta do detector; e
(ii) o registro de que **k=1,5 em 15m/N=5 produz 16 OBs em 8 dias que o owner não rejeitou**.

**Tabela v1 proposta (congelar como default; classe A = definição, identidade da fixture; classe B = operação, o que o
backtest ajusta com walk-forward):**

| parâmetro | classe | v1 | força |
|---|---|---|---|
| N em 15m / 1h | A | 5 / 10 | `[PREMISSA-OWNER: 2026-09-02]`, a olho |
| N em 5m / 4h | A | 5 / 10 | `[NÃO CALIBRADO]` |
| extremo por pavio, empate estrito, `tol_ticks=0`, `klines_last` | A | fixos | `ADR-017/D1`, `ADR-007` |
| `break_by` | A | **pavio (piloto) — owner pede fechamento; DECISÃO DO ARQUITETO** | — |
| `one_shot`, `initial_state=undefined` | A | fixos | paridade Pine `[INFERRED]` |
| `k` do impulso (×ATR14 sma) | A | 1,5 | owner usou; 15/16 não rejeitados em 7 s |
| zona `[low,high]`, mitiga no toque, expira 200 barras, lookback 30 | A | fixos | escolha do piloto `[INFERRED]` |
| FVG (`min_gap`, `fill`), BSL/SSL (`tol_ticks`, `min_count`), dinheiro preso (`q`,`W`,`x`) | A | **ausentes** | fora do piloto |
| stop, alvo, tamanho, TF operado, quais OBs entram, horário | B | — | backtest com walk-forward, Módulo D |

**O que o `quant-architect` devolve:** (1) `break_by` pavio × fechamento, com o modo de o owner conferir e o efeito
medido na contagem de BMS/CHoCH/OB sobre a grade (o piloto expõe ambos se ele mandar); (2) validação ou correção da
tabela v1 e da divisão A/B; (3) profundidade de histórico recomendada para walk-forward de estrutura (klines, dump
disponível) e o limite de 30 dias de OI para "dinheiro preso", com custo em disco; (4) o que muda em `ADR-017` com
Q11 = "default" e Q20 = "coexistem" (rascunho, não aprovação); (5) o que ele não julga.

## 9. Decisão do coordenador — como seguir (2026-09-03)

Registrado a pedido do owner (*"commit e registre sua decisão, como seguir"*). Ordem, com o dono de cada passo:

1. **Congelar v1 como default** (tabela de §8 com as correções do arquiteto em `gates/Q11-v1-validacao-quant-architect.md` §2):
   classe A é identidade de fixture e só muda por versão nova da definição; classe B é o que o backtest ajusta, com walk-forward.
   `break_by = close` + `sweep` (ADR-017/D6). **Dono: time.** Feito neste commit para o piloto; entra em código de produção via `T-08.10`/`T-08.9`.
2. **ADR-017 sai de RASCUNHO só por aprovação do owner.** Gate `owner`, não de agente. **Dono: owner.**
3. **Tasks destravadas:** `T-08.9` (`blocked` → `todo`). `T-05.6` (`pointer_mode`) ganha o sub-modo `review`; `T-08.10`
   (`swing_point`) ganha `provenance ∈ {HUMANO, DETECTOR}` + `review_verdict` (ADR-017/D2). Ajuste de escopo dessas duas é
   ato do `/tech-lead` na fase 08, não deste commit. **Dono: /tech-lead → /build.**
4. **Baixar o histórico recomendado** (§3 do relatório do arquiteto), **na variante de menor pegada**: klines 1m/15m/1h
   BTCUSDT desde 2020-01 (164 MB zip) e `metrics` 5 min desde 2020-09 (25 MB) — zipados, em **R2** (free tier já
   provisionado, `premissas-de-infra-e-stack.md` §2.2), catalogados em `data/MANIFEST.md`, não versionados e **fora do disco
   da VPS**. **Dono: time.** `aggTrades` em volume **NÃO entra** — ver §10; `side_source = taker_ls` do `metrics` é o
   parâmetro já previsto na tabela §6.3 para o histórico longo.
5. **Fixture de regressão do detector:** a porta Python `scripts/q11-swing-measure/break_by_measure.py` reproduz o piloto
   (37/20/17/16 · 5/3/2/5 · 22/11/11/14); quando `T-08.10` implementar o detector em produção, o teste de igualdade de conjunto
   é contra esse par (piloto ⇄ porta) e contra o JSON do owner. **Dono: /build + /qa.**
6. **Backtest (Módulo D)** só depois de 1–5, com custos, walk-forward 6m/2m/2m e embargo `expiry·TF + N·TF`. **Dono: quant-architect (ADR) → /build.**

**O que este commit NÃO faz:** não aprova ADR, não avança estado no ledger, não altera Jira além do que o owner mandou
(desbloqueio), não versiona `out/marcador.html` nem `data/`.

## 10. Correção do coordenador (2026-09-03) — premissas de infra que eu deixei de aplicar

**Citação literal do owner:** *"lembre-se das premissas que estabelecomos no começo. Temos pouco recurso, sistema ira rodar em
vps compartilhada. Estamos usando s3 free tier do cloudflare e por hora temos apenas o postgres na aplicação. Devemos usar ele
como banco colunar muito provavelmente, se for a melhor opção. então ter gigas e giags e aggtrades n é muito bom e discutimos
muito sobre isso já em sessões anteriores"* `[PREMISSA-OWNER: 2026-09-03]`.

**O erro, nomeado:** no §9 item 4 e na mensagem ao owner eu apresentei *"quanto de `aggTrades` baixar (≈11,5 GB desde
2025-01)"* como decisão aberta do owner. Isso **reabriu `Q9`**, que está `MORTA` desde R2 por aritmética de disco
(`decisoes-do-owner.md:359`), e ignorou `premissas-de-infra-e-stack.md` §3.2 (VPS compartilhada, 6 serviços, disco sob pressão,
R2 já provisionado) e `ADR-002` (motor de armazenamento; Postgres row-store eliminado para a série, D3; Timescale-na-instância
e Parquet/R2+DuckDB entre os candidatos). O relatório do arquiteto **já trazia** a saída de menor pegada — linha
*"mínimo utilizável 2023-01→: ~81 MB zip 1m + 15 MB metrics"* e `side_source = taker_ls` — e eu escolhi destacar a variante
cara. O relatório do arquiteto (`gates/Q11-v1-validacao-quant-architect.md` §3) **não foi editado**; esta seção o corrige por
cima, para não reescrever documento de terceiro.

**O que vale a partir daqui, e é compatível com as premissas:**

| item | pegada | onde mora | decisão |
|---|---|---|---|
| klines 1m/15m/1h BTCUSDT 2020-01→ | 164 MB zip | R2 (free tier 10 GB) | **entra** — estrutura e walk-forward |
| `metrics` 5 min BTCUSDT 2020-09→ (OI, L/S, taker L/S) | 25 MB | R2 | **entra** — "dinheiro preso" e `side_source = taker_ls` |
| `aggTrades` histórico (44 GB; 11,5 GB desde 2025-01) | GB | — | **NÃO entra.** `Q9` `MORTA`; CVD por tick só sobre os 4 dias já em disco (831 MB, `data/MANIFEST.md`) e, se um dia for requisito, captura ao vivo em janela curta com orçamento declarado — nunca backfill em massa |
| motor de consulta sobre esses arquivos | 0 daemon novo | Postgres existente **ou** DuckDB embarcado lendo R2 | **é a `ADR-002`**, não este handoff; nenhuma recomendação aqui pode pressupor um serviço a mais na VPS |

**Falsificador desta correção:** se alguma linha da tabela paramétrica (§6.3 do relatório) passar a exigir `aggTrades`
histórico para ser testável fora da amostra, a linha é que muda de fonte (`taker_ls`, `metrics`) ou sai do v1 — o volume não
sobe para acomodá-la.
