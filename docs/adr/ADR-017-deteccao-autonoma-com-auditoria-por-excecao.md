# ADR-017 — Detecção de estrutura é **autônoma e paramétrica**; o humano **audita por exceção**; "dinheiro preso" é evento de `convergencia`, não zona de `charts`

**Status:** `RASCUNHO` (aprovar é gate do owner) · **Data:** 2026-09-02, revisado 2026-09-03 · **Componentes:** `charts`, `sentimento`,
`convergencia`, `backtest` · **Feature:** `plataforma-dados` (efeito na fase de estratégia)
**Autor:** `quant-architect` · **Rev de ancoragem:** medições de 2026-09-02 em `master@f1d3977`; as de 2026-09-03 em `master@6fbaf4c`
**Origem:** falas do owner em 2026-09-02 e 2026-09-03 (`[PREMISSA-OWNER]`, citações literais em
[`handoff/Q11-deteccao-autonoma.md`](../context/plataforma-dados/handoff/Q11-deteccao-autonoma.md) §1, §7 e §8), o veredito em
[`gates/Q11-deteccao-autonoma-quant-architect.md`](../context/plataforma-dados/gates/Q11-deteccao-autonoma-quant-architect.md) e a
validação v1 em [`gates/Q11-v1-validacao-quant-architect.md`](../context/plataforma-dados/gates/Q11-v1-validacao-quant-architect.md).

**Fecha:** a forma de `Q11` (*"pode aceitar o default"* — detecção autônoma, calibração humana pontual e opcional), `Q20`
(*"coexistem"* — SMC e pivôs+Fibonacci sobre o mesmo primitivo de swing), a fronteira de módulo de "zona de dinheiro preso", a
semântica de rompimento (`break_by = close` + evento `sweep`) e a divisão classe A / classe B da tabela paramétrica.
**Não fecha:** `N` em 5m/4h, o valor de `k`, a captura de livro (decisão do owner, custo em `gates/Q11-…-quant-architect.md` §6.4),
quanto de `aggTrades` baixar. **Não reabre** `ADR-007` (`price_source` por uso) nem `SPEC-001 §5.4` (`<Anotacao>` e sua chave) —
estende as duas.

---

## Contexto

O owner pediu que OB/CHoCH/BMS/"dinheiro preso" sejam detectados *"sem ação do homem"*. Q11 perguntava quantas horas o
owner marcaria um corpus à mão porque *"nenhum detector de estrutura é verificável sem esse corpus"*
(`decisoes-do-owner.md:394`). As duas frases falam de atos distintos — detectar e provar — e o spike
`docs/spike/smc-strategy.tradingview` mostra os dois lados ao mesmo tempo: detecção 100 % autônoma
(`ta.pivothigh`, L148) e zero prova (backtest sem custo, L17; volume sem efeito, L143).

Em 2026-09-03 o owner respondeu `[PREMISSA-OWNER: 2026-09-03]`:
> "q20; coexistem, q11: pode aceitar o default, mas te passo o json caso ele seja importante: {…} Rompimento por
> fechamento, .claude/agents/quant-architect.md deve saber responder isso tbm, ele tem q ser o especialista, Inclusive
> ele precisa validar nossas decisões. profundidade do histõrico pode seguie o recomendado."

E em 2026-09-02, sobre N: *"ok, 15 + 5 e 1h + 10 funcinou legal, podemos avançar colm eles no piloto"* `[PREMISSA-OWNER: 2026-09-02]`.

Fatos medidos que determinam a decisão (universo e comandos nos dois relatórios):

- swing fractal é **definição**, não observação: 15m/N=5 dá 88 swings em 8 dias; a política de empate sozinha move a
  contagem de 1m/N=5 em até +84 % (467 empates / 559 estritos) `[MEDIDO 2026-09-02]`;
- a série de preço decide o swing: Jaccard dos conjuntos de swing `klines_last × mark_price` em 5m fica entre **0,55 e
  0,94** conforme N e dia (n=2 dias) `[MEDIDO 2026-09-02]` — confirma `ADR-007/PS-3`;
- a semântica do rompimento decide a estrutura: em 15m/N=5, `wick → close` remove **8 de 37 eventos** e troca o rótulo de 2,
  e o conjunto de OB muda com Jaccard **0,67**; em 1h/N=10 nada muda em 8 dias (n=5) `[MEDIDO 2026-09-03, n=8 dias]`;
- "dinheiro preso" **é computável do dado** (ΔOI as-of + range + rompimento), mas é **evento derivado com ≥ 3
  parâmetros**, e o limiar só pode ser percentil: ΔOI_4h ≥ 1 % ocorre 13,63 % do tempo em 30 dias (p90 = 1,35 %)
  `[MEDIDO 2026-09-02, n=8.589]`;
- o dump público `metrics` da Binance tem OI a 5 min **desde 2020-09-01, 2.192 dias sem buraco, 25,4 MB** — *"OI só 30 dias"*
  vale para o REST (`openInterestHist`: *"Only the data of the latest 1 month is available."* `[DOC]`), não para o dump
  `[MEDIDO 2026-09-03: listagem S3]`.

## Decisão

**D1 — Família inicial de swing: fractal N, em `klines_last`, por pavio, empate estrito, `ref_policy = latest_confirmed`.**
`N` é **por TF**. Em 15m e 1h, `N = 5` e `N = 10` por declaração do owner a olho (`[PREMISSA-OWNER: 2026-09-02]`, **não
medição**); em 5m e 4h, `5`/`10` são placeholders `[NÃO CALIBRADO]`. Nunca do spike (`N=20` em 1D = 20 dias de latência).
A referência ativa da máquina de estados é o **swing confirmado mais recente** do tipo, mesmo que seja LH/HL (paridade Pine
`UpdatedHigh`); a alternativa `highest_unbroken` é outra definição `[NÃO MEDIDO]`.
`swing_definition = {family, N, tie_policy, tol_ticks, price_source, ref_policy, tf_base, code_version}` é **chave de primeira
classe**, gravada em toda `<Anotacao>` e em todo candidato — trocar a definição rerroda a comparação, não apaga o julgamento humano.

**D2 — O detector propõe; o humano julga quando quiser.** `swing_point` (`T-08.10`) ganha `provenance ∈ {HUMANO, DETECTOR}` com
`detector_key = swing_definition + grid_hash + knowledge_time`, e um segundo registro `review_verdict ∈ {accept, reject,
add}` que **referencia o candidato**. `pointer_mode = annotate` ganha o sub-modo `review`. O humano só marca do zero via
`add` — e `add` é o **piso** do que o gerador perdeu. **Com Q11 = default, nenhum gate depende de o humano julgar.**

**D3 — Pilha de verificação. Obrigatórias antes de "pronto": 1, 2, 4, 5. Opcional e pontual: 3.**
1. **invariantes** — sem lookahead (`swing[i]` existe só a partir do fechamento de `i+N`; toda leitura de série não-preço
   satisfaz `publicado_em ≤ close_time` da barra de decisão, verificado sobre **todo** o replay), determinismo,
   invariância sob re-ingestão; **`resample(1m, TF) == klines nativos do TF`** em OHLC (0 divergências em 768 barras de 15m
   `[MEDIDO 2026-09-03]`); **nenhum evento `só-close`** (todo rompimento por fechamento é rompimento por pavio — teorema);
2. **mutação** — trocar `>`↔`>=` no empate do fractal e no FVG deve deixar a fixture vermelha (`avaliacao-discovery:46` item 14).
   **A fixture de mutação tem de ser escolhida onde a mutação morde:** em 1h/N=10 sobre 8 dias, `strict→inclusive` move 0 swings
   e `>`→`>=` no rompimento move 0 eventos em todas as 6 configurações `[MEDIDO 2026-09-03]` — em 15m/N=5 move 6 swings;
3. **calibração humana — pontual, opcional** (*"pode aceitar o default"*) — quando houver sessão, sobre candidatos de gerador
   **frouxo** (15m/N=2, 209 candidatos em 8 dias); reporta `precision` com `n`, `adds`, `judgments_per_min`, e **recall rotulado
   "relativo a N=2"**. Sessão com `judgments_per_min > 30` **não é calibração** e o relatório a rotula assim — o JSON de
   2026-09-03 (51 accepts em 18 s; 15 em 7 s) é o caso: vale como **oráculo de paridade** (D3.4), não de precisão;
4. **concordância cruzada** — (a) porta do Pine sobre os mesmos candles, **só** para pivô e BOS, **em modo `wick`**, `one_shot`;
   (b) qualquer reimplementação do detector deve reproduzir o `structure_summary` da fixture
   `swing-review-BTCUSDT-1b96c671-2026-09-03.json` (37/20/17/16 · 5/3/2/5 · 22/11/11/14) `[MEDIDO 2026-09-03: porta Python]`;
5. **backtest com custo, walk-forward** — mede o **valor** da zona; **não** mede a correção do detector e não substitui 1–4.
   Critério de corte em `gates/Q11-v1-validacao-quant-architect.md` §3.3: classe A congelada; rolante 6m/2m/2m; embargo =
   `expiry_bars·TF + N·TF` (≈ 9 dias em 1h); `n ≥ 30` por dobra; resultado por dobra; custo obrigatório.

**D4 — "Zona de dinheiro preso" é evento de `convergencia`.** Entradas: par de swings confirmados (`charts`) + ΔOI/CVD/
taker-L/S (`sentimento`) lidos as-of + **`sweep`** (D6) contra o lado + confirmação por ΔOI negativo/liquidações. Limiares são
**percentis de janela declarada**, recalculados, nunca constantes. `charts` **não** materializa essa zona
(`recorte-plataforma.md` §6 continua valendo: nenhuma tabela de swing como fato).

**D5 — Livro de ofertas: fora desta fase; se entrar, é coletor contingente.** Sem histórico em nenhuma fonte
(capture-or-lose). Custo REST declarado: peso 2/5/10/20 por `limit` 50/100/500/1000 sobre 2400/min `[DOC + MEDIDO]`.
Se o owner optar: WS partial depth, BTCUSDT só, `E`/`T` gravados, `capture_started_at` na proveniência, e **nenhum
detector lê o livro antes de ≥ 30 dias**.

**D6 — Rompimento é por fechamento; pavio que fecha dentro é `sweep`, evento distinto.** `break_by = close` para BOS/BMS e
CHoCH (classe A, default). `sweep` = `high[t] > ref ∧ close[t] ≤ ref` (simétrico para baixo), **não consome a referência**, e
alimenta BSL/SSL e D4. Fundamento: `knowledge_time` de um fechamento é `close_time[t]`, o de um pavio é um instante intrabarra
que replay e detector ao vivo **não veem igual** — condição de D3.1 `[INFERRED]`; e BOS (aceitação) e sweep (rejeição) são
construtos opostos que o modo `wick` funde `[OPINIÃO: convenção SMC, sem documento público]`. O owner pediu fechamento
(`[PREMISSA-OWNER: 2026-09-03]`), mas a decisão se apoia nos dois fundamentos, não na fala. **`wick` continua implementado**
atrás do mesmo flag, exclusivamente para D3.4(a). Efeito medido: tabela §1.2 de `gates/Q11-v1-validacao-quant-architect.md`.
**Não afirmo** que `close` rende mais — isso é D3.5 `[NÃO MEDIDO]`.

**D7 — Q20 = "coexistem": o swing confirmado é o primitivo compartilhado.** SMC (OB, FVG, BSL/SSL, BOS/CHoCH, sweep) e
pivôs+Fibonacci **consomem a mesma `swing_definition`** e nunca a redefinem. Níveis de Fibonacci são aritmética sobre pares
`(swing_low, swing_high)` **confirmados** (existem a partir do fechamento de `max(i_low, i_high) + N`) — sem parâmetro próprio
além do conjunto de razões, que é classe A. O corpus de **zonas** não se reaproveita entre os vocabulários; o de **swings** serve
aos dois. Um sinal de convergência entre os dois vocabulários é evento de `convergencia`, não de `charts`.

**D8 — Classe A × classe B.** **A** = tudo que muda o conjunto de candidatos ou o ciclo de vida deles (entra em `detector_key`;
trocar rerroda a fixture): `N`, `tie_policy`, `tol_ticks`, `price_source`, `ref_policy`, `tf_base` + reamostragem, `break_by`,
`one_shot`, `initial_state`, `k`, `atr_period/method`, `impulse = |close[t_break] − open[OB]|`, `zone`, `mitigation`,
`expiry_bars`, `ob_lookback_bars`, os de FVG/BSL/SSL/dinheiro preso, `code_version`. **B** = tudo que age sobre um conjunto
congelado (só PnL): stop, alvo, tamanho, TF operado, filtro de quais OBs entram, horário, `entry_mode`, `fill_assumption`,
taxas/funding/slippage. Teste: *"se eu trocar isto, a lista de candidatos da fixture muda?"* — sim → A. **Escolher entre dois
`detector_key` é parâmetro ajustado** e só se faz em treino (D3.5).

## Alternativas recusadas

- **Corpus de zonas marcado do zero** (forma original de Q11): mede o olho do owner contra o vazio; custo alto;
  não sobrevive a `Q20`; recall igualmente não mensurável. Recusado por D2/D3 — e agora também pelo owner (*"pode aceitar o default"*).
- **Backtest como único oráculo** (leitura forte da fala do owner): não separa detector errado de tese errada.
  Recusado por D3.5.
- **Zigzag X % como família inicial**: latência de confirmação ilimitada e repintura até a reversão. Fica como
  **fallback** do falsificador F1 (dormente).
- **Livro como requisito agora**: hipótese do owner (*"tvz"*), custo não trivial, variável errada para "preso"
  (intenção cancelável vs compromisso). Recusado por D5, reabrível pelo owner.
- **`break_by` como switch de operação (classe B)**: troca o conjunto de OB (Jaccard 0,67 em 15m/N=5) — é definição. Recusado por D6/D8.
- **`break_by = wick` como default (paridade Pine)**: funde BOS e sweep e tem `knowledge_time` intrabarra. Recusado por D6; mantido só para D3.4(a).

## Falsificadores

- **F1 (D1) — DORMENTE:** dependia de sessão de calibração; se houver uma com `judgments_per_min ≤ 30` e `precision < 70 %` para
  **todos** os `N ∈ {3,5,10}` em 15m, a família fractal cai e zigzag entra. Sem sessão, não dispara nem prova nada.
- **F2 (D1/ADR-007):** se sobre ≥ 30 dias o Jaccard `klines_last × mark_price` em 5m/N=5 for ≥ 0,95, `price_source`
  na marcação é custo sem retorno. Hoje 0,64–0,84 (n=2 dias).
- **F3 (D2) — DORMENTE:** se `adds` ≥ 30 % dos aceitos em 15m/N=2, o gerador frouxo não é frouxo o bastante. Mesma condição de F1.
- **F4 (D4):** se, sobre o dump `metrics` completo (2020-09 →) alinhado a preço 5m, o evento com `q=90` tiver `n < 30` **por ano**,
  o construto não é calibrável e sai da matriz. (Antes: "≥ 30 dias" — o horizonte era o do REST, não o do dado disponível.)
- **F5 (D3.1):** uma única violação de `publicado_em ≤ close_time` no replay descarta o resultado inteiro, não o ajusta.
- **F6 (D6/D3.4b):** se a porta do detector produzir **qualquer** evento `só-close`, ou divergir do `structure_summary` da fixture
  de 2026-09-03 em modo `wick`, a implementação está errada — não a definição.
- **F7 (D3.2):** se nenhuma fixture escolhida ficar vermelha sob `strict→inclusive` **e** sob `>`→`>=` no rompimento, a pilha de
  mutação está morta e "pronto" não pode ser declarado. Hoje: 1h/N=10 morta nas duas; 15m/N=5 viva só na primeira `[MEDIDO 2026-09-03]`.

## Consequências

- `T-08.10`: campos `provenance`, `detector_key`, `review_verdict`; `structure_definition` com `break_by`, `ref_policy`, `impulse`.
  `T-05.6`: sub-modo `review`. `T-08.9`: bloqueio deixa de ser "sessão de calibração" — passa a ser D3.1/2/4/5 verdes.
  **`tasks.toml` intocado por esta ADR** — edição é do fluxo.
- Q11 e Q20 **respondidas** pelo owner em 2026-09-03; a forma de cada resposta está em D3.3 e D7.
- **Histórico recomendado** (`gates/Q11-v1-validacao-quant-architect.md` §3.2): `klines` 1m+15m+1h BTCUSDT completos desde
  2020-01 (**164 MB zip**), `metrics` completo desde 2020-09 (**25 MB zip**); `aggTrades` só a partir de 2025-01 (≈ 11,5 GB) até o
  owner decidir mais. Mínimo utilizável: 2023-01. Cobertura de regime **a medir após baixar**, não a presumir.
- Piloto (`scripts/pilot-swing-marker/build.mjs`): recomenda-se expor `break_by` como toggle e emitir o motivo de descarte de OB
  (sem candle oposto × não impulsivo). Não editado por esta ADR.
- Dívida nomeada: semântica de empate de `ta.pivothigh` e do WS partial depth `[NÃO VERIFICADO]`; taxas do tier do owner
  `[NÃO MEDIDO]`; **atraso de publicação do `metrics`** (`create_time` é amostra, não publicação) `[NÃO MEDIDO]` — até medir, replay
  assume ≥ 1 intervalo de 5 min; **duplicatas no dump `metrics`** (2020-09-01: 576 linhas = 2×288) — deduplicar por `create_time`;
  4h não observável em 8 dias; `expiry_bars=200` em 1h (8,3 dias) **não testado** na grade atual.
