# Q11 v1 — validação do `quant-architect`: `break_by`, tabela v1, profundidade de histórico, efeito em ADR-017

**Autor:** `quant-architect` · **Data:** 2026-09-03 · **Rev de ancoragem:** `master@6fbaf4c` · **Feature:** `plataforma-dados`
**Insumos lidos, nesta ordem:** [`handoff/Q11-deteccao-autonoma.md`](../handoff/Q11-deteccao-autonoma.md) §7–§8 ·
[`ADR-017`](../../../adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md) · [`gates/Q11-deteccao-autonoma-quant-architect.md`](Q11-deteccao-autonoma-quant-architect.md) §6.3 ·
[`fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json`](../fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json) ·
`scripts/pilot-swing-marker/build.mjs` (`fractal`, `atrSeries`, `deriveStructure`).

**Citação literal do owner que este relatório responde** `[PREMISSA-OWNER: 2026-09-03]`:
> "q20; coexistem, q11: pode aceitar o default, mas te passo o json caso ele seja importante: {…} Rompimento por
> fechamento, .claude/agents/quant-architect.md deve saber responder isso tbm, ele tem q ser o especialista, Inclusive
> ele precisa validar nossas decisões. profundidade do histõrico pode seguie o recomendado."

**Sobre o JSON do owner, antes de qualquer número:** 51 `accept` em 18 s (1h/N=2) e 15 `accept` em 7 s (OB 15m/N=5) são
passagem de tecla, não julgamento — `judgments_per_min ≈ 128–170`. **Nenhuma `precision` é derivada dele aqui.** O que ele
vale: (i) fixture de estrutura com proveniência completa (`detector_key`, `grid_hash`, `knowledge_time`, `confirmed_at`);
(ii) oráculo de **paridade** para qualquer reimplementação — e foi usado só para isso (§1.1).

**Instrumentos (código em inglês, stdlib, no repositório):**
`scripts/q11-swing-measure/break_by_measure.py` (porta em Python do `deriveStructure` do piloto, com `break_by ∈ {wick, close}`),
`scripts/q11-swing-measure/break_mutation.py`, `scripts/q11-swing-measure/vision_listing.py`.

```bash
python3 scripts/q11-swing-measure/break_by_measure.py     # §1 — contagens, paridade, wick × close
python3 scripts/q11-swing-measure/break_mutation.py       # §2 linha 3 e 5 — mutação
python3 scripts/q11-swing-measure/vision_listing.py "data/futures/um/monthly/klines/BTCUSDT/1m/" \
  "data/futures/um/daily/metrics/BTCUSDT/" "data/futures/um/monthly/aggTrades/BTCUSDT/"   # §3 — custo em disco
```

Universo de todo número de §1–§2: **BTCUSDT USDⓈ-M perp, `klines_last` (`data/binance/klines/tf2/BTCUSDT-1m-2026-08-{16..23}.csv`,
11.520 barras 1m, reamostradas por `floor(open_time/TF)` — a mesma reamostragem de `measure_swings.py` e do piloto), 8 dias,
2026-08-16..23** `[MEDIDO 2026-09-03]`. Oito dias é o que existe localmente; §3 diz quanto custa ter anos.

---

## §1 — `break_by`: pavio × fechamento

### 1.1 Paridade com o piloto (pré-condição para qualquer comparação)

A porta Python reproduz o piloto **exatamente** sob `wick`: 15m/N=5/k=1,5 → **37 eventos / 20 BMS / 17 CHoCH / 16 OB**;
1h/N=10/k=1 → **5 / 3 / 2 / 5**; 15m/N=10/k=1,5 → **22 / 11 / 11 / 14** — os três iguais ao `structure_summary` do JSON do
owner. Os **15 OBs que o owner aceitou são subconjunto dos 16 que a porta gera**; o 16º (o pendente) é `open_time=1787471100000`
`[MEDIDO: break_by_measure.py, linhas "pilot_json" e "OB parity"]`. Invariante de grade: `resample(1m, 15) == klines 15m nativos`
em OHLC para **768/768 barras, 0 divergências** `[MEDIDO: linha "grid_check"]`.

**Como o owner confere sem confiar em mim:** abre o próprio JSON, campo `sessions[*].structure_summary`, e compara com a coluna
`pilot_json` da saída do script. Se qualquer linha divergir, a porta está errada e §1.2 não vale.

### 1.2 Efeito medido de trocar `wick` por `close`

| TF/N | k | `wick`: ev/BMS/CHoCH/OB | `close`: ev/BMS/CHoCH/OB | só-wick | só-close | flips BMS↔CHoCH | atraso close−wick (barras) min/med/máx | OB mesmo candle / Jaccard |
|---|---|---|---|---|---|---|---|---|
| 15m/5 | 1,5 | 37/20/17/16 | **29/14/15/19** | **8** | **0** | 2 | 0 / 0 / 6 | 14 / **0,67** |
| 15m/5 | 1,0 | 37/20/17/22 | 29/14/15/23 | 8 | 0 | 2 | idem | — |
| 1h/10 | 1,0 | 5/3/2/5 | **5/3/2/5** | 0 | 0 | 0 | 0 / 0 / 1 | 5 / **1,00** |
| 1h/10 | 1,5 | 5/3/2/4 | 5/3/2/5 | 0 | 0 | 0 | idem | — |
| 15m/10 | 1,5 | 22/11/11/14 | 20/9/11/16 | 2 | 0 | 0 | 0 / 0 / 12 | 13 / 0,76 |

`[MEDIDO 2026-09-03: break_by_measure.py, n=8 dias]`. Leitura:

- **`só-close = 0` em todas as linhas é teorema, não coincidência** (`close ≤ high`): todo rompimento por fechamento é também
  rompimento por pavio na mesma barra ou antes. Vira **asserção de regressão**: implementação que produzir `só-close > 0` está errada.
- Em 15m/N=5 o fechamento **remove 8 de 37 eventos (−22 %)** — todos pavios que voltaram para dentro — e **muda o rótulo de 2 dos
  29 restantes** (BMS↔CHoCH), porque a sequência de estados muda. Em 1h/N=10, **nada muda** nos 8 dias (n=5 eventos; não
  generalizar).
- **OB sobe com `close` (16→19 em 15m/N=5)**, e isso é efeito da fórmula do impulso `|close[t] − open[OB]| ≥ k·ATR`: a barra `t`
  do fechamento tem deslocamento maior que a do pavio, logo mais candidatos passam em `k`. O conjunto de candles muda
  (Jaccard 0,67). **Trocar `break_by` troca a fixture de OB** — é parâmetro de classe A, não de operação.
- Em modo `close`, o piloto registra **29 barras de "sweep"** (pavio além do swing, fechamento dentro) em 15m/N=5; **14 delas** são
  seguidas por fechamento através do mesmo swing (o rompimento só atrasou, mediana 0 barras, máx. 6); as demais são o que o
  vocabulário SMC chama de *liquidity sweep* e que o modo `wick` **rotula como BOS**.

### 1.3 Decisão

**`break_by = close` é o default de classe A para BOS/BMS e CHoCH. O pavio que atravessa o swing e fecha dentro vira um
evento separado, `sweep`, também de classe A, que alimenta a linha BSL/SSL e o evento de "dinheiro preso".** Não é um switch entre
dois jeitos de fazer a mesma coisa: são **dois eventos distintos**, e o modo `wick` os funde por construção.

Fundamentos, cada um com o rótulo que merece:

1. **Semântica temporal `[INFERRED, verificável por leitura do código]`:** um rompimento por fechamento tem `knowledge_time =
   close_time[t]`, sem ambiguidade. Um rompimento por pavio acontece num instante desconhecido **dentro** da barra; o piloto carimba
   `confirmed_at = close_time[t]` nos dois casos (`build.mjs`, `deriveStructure`, campo `confirmed_at`), o que é correto em replay
   mas **não é reproduzível ao vivo**: um detector ao vivo dispararia intrabarra, sobre uma barra cujo fechamento ainda não existe,
   e o backtest não consegue simular esse instante sem `aggTrades`. Com `close`, detector ao vivo e replay veem o mesmo dado no
   mesmo instante — é a condição de `ADR-017/D3.1`.
2. **Separação de construtos `[OPINIÃO — convenção do vocabulário SMC, sem documento público que a fixe]`:** BOS = aceitação de
   preço além da estrutura; sweep = rejeição. O evento de "dinheiro preso" (`§6.3`, última linha) **precisa do sweep** como
   "rompimento contra o lado" seguido de reversão; se BOS já engoliu o sweep, o evento tem de reconstruí-lo. Duas classes de
   evento, dois nomes.
3. **O owner pediu fechamento** — *"Rompimento por fechamento"* `[PREMISSA-OWNER: 2026-09-03]`. Registro, mas a decisão não
   se apoia nisso: apoia-se em 1 e 2, e o owner pode discordar delas.

**O que NÃO afirmo:** que `close` dá PnL melhor que `wick`. Isso só o backtest com custo diz (`ADR-017/D3.5`) e **não é
julgamento de correção do detector** — é julgamento de tese. Rotulado `[NÃO MEDIDO]`.

**Paridade com o Pine (`ADR-017/D3.4`) fica em `wick`.** O spike usa `ScrHigh > UpdatedHigh` (`docs/spike/smc-strategy.tradingview:167`,
`ScrLow < UpdatedLow`:173), pavio. Por isso **`wick` continua implementado** atrás do mesmo flag: o teste de concordância cruzada
roda em `wick`; a produção roda em `close`. Um só código, dois modos, e a diferença entre eles é a tabela de §1.2.

**Como o owner confere:** (a) reroda o script e olha as colunas `só-wick`/`só-close`; (b) no piloto (`build.mjs`), o coordenador
expõe `break_by` como toggle — **não editei o piloto**; recomendo a edição — e o owner vê, nos 8 eventos removidos em 15m/N=5,
que são pavios que fecharam dentro; (c) a asserção `só-close = 0` entra como teste de regressão da porta do detector.

---

## §2 — Tabela v1 e divisão A/B, linha a linha

**Princípio da divisão, escrito para ser aplicado sem mim:** **classe A** = tudo que muda **o conjunto de candidatos ou o ciclo de
vida deles** (entra em `detector_key`; trocar rerroda a fixture). **Classe B** = tudo que age **sobre um conjunto de candidatos já
congelado** (só muda PnL). Teste: *"se eu trocar isto, a lista de candidatos da fixture muda?"* — sim → A.

| # | linha da v1 (§8) | veredito | correção / evidência |
|---|---|---|---|
| 1 | N 15m/1h = 5/10, A, `[PREMISSA-OWNER: 2026-09-02]` a olho | **VÁLIDA** | Classe certa. A força é fala literal ("15 + 5 e 1h + 10 funcinou legal"), não medição — e a tabela já diz isso. |
| 2 | N 5m/4h = 5/10, A, `[NÃO CALIBRADO]` | **VÁLIDA como placeholder; INVERIFICÁVEL em 8 dias** | 4h/N=10 confirma 40 h depois; em 8 dias cabem ≤ 4 swings. Só com o histórico de §3 dá para medir contagens por TF/N antes de o owner olhar. Não calibro N — é o olho dele. |
| 3 | pavio no extremo, empate estrito, `tol_ticks=0`, `klines_last`, A | **VÁLIDA, com achado sobre a mutação** | `strict→inclusive` move 15m/N=5 de 88→94 swings (+6) e **1h/N=10 de 11→11 (0)** `[MEDIDO: break_mutation.py]`. A mutação de `ADR-017/D3.2` **não fica vermelha em 1h nesta grade** — a fixture de D3.2 tem de ser 15m ou trazer empate sintético. |
| 4 | `break_by` — decisão do arquiteto | **DECIDIDA: `close` (A) + evento `sweep` (A, linha nova)** | §1.3. Efeito medido em §1.2. `wick` permanece implementado só para paridade Pine. |
| 5 | `one_shot`, `initial_state=undefined`, A | **VÁLIDA, com uma linha faltando** | A mutação `>`→`>=` no rompimento **não muda nenhum evento** em 6 configurações (`symmetric_diff=0`) `[MEDIDO: break_mutation.py]` — preços de BTC com 1 decimal raramente empatam; a mutação de D3.2 sobre o rompimento **não é falsificador vivo** nesta grade. **Falta a linha `ref_policy = latest_confirmed`**: o piloto substitui a referência pelo swing confirmado mais recente (paridade Pine `UpdatedHigh`), mesmo que seja um LH abaixo do anterior. A alternativa `highest_unbroken` produz outra grade `[NÃO MEDIDO]`. É A e tem de estar no `detector_key`. |
| 6 | `k = 1,5` ×ATR14 sma, A, "owner usou; 15/16 não rejeitados em 7 s" | **CLASSE VÁLIDA; FORÇA ERRADA** | 7 s não é evidência; rótulo correto é `[NÃO CALIBRADO — default herdado da fixture]`. Sensibilidade: `k` 1,5→1,0 em 15m/N=5 dá 16→22 OB (`wick`) e 19→23 (`close`) `[MEDIDO]`. Falta nomear a fórmula do impulso na chave: `impulse = |close[t_break] − open[OB]|` — trocá-la troca a fixture. |
| 7 | zona `[low,high]`, mitiga no toque, expira 200 barras, lookback 30, A | **VÁLIDA; duas dívidas** | (i) 200 barras em 1h = 8,3 dias > grade de 8 dias: **nenhum OB de 1h pode expirar na fixture atual** — a regra de expiração está **não testada** em 1h `[INFERRED da aritmética]`. (ii) Sem candle oposto em 30 barras, o evento **não gera OB e nada registra** — a divisão entre "sem candle oposto" e "não impulsivo" `[NÃO MEDIDO]`; a porta do detector deve emitir motivo de descarte. |
| 8 | FVG, BSL/SSL, dinheiro preso — A, ausentes | **VÁLIDA; BSL/SSL ganha gatilho** | O evento `sweep` (§1.3) é o gatilho natural de BSL/SSL (equal highs + sweep). "Dinheiro preso" (`F4`) deixa de ser "não calibrável no horizonte": §3 mostra OI a 5 min desde **2020-09-01**. |
| 9 | stop, alvo, tamanho, TF operado, quais OBs entram, horário — B | **VÁLIDA, com uma ressalva e três linhas faltando** | "Quais OBs entram" é B **só se for filtro sobre o conjunto congelado**; se mexer em `k`/`mitigation`/`expiry`, é outro `detector_key` (A). Faltam em B: `entry_mode` (limite na borda × mercado no reteste), `fill_assumption` (com 1m: preenche se `low ≤ preço` — o 98,44 % de resolução do `MANIFEST`), **taxas maker/taker + funding + slippage** — sem elas §3.3 não fecha, e as do tier do owner são `[NÃO MEDIDO]`. |
| — | linhas A ausentes | **ACRESCENTAR** | `tf_base = 1m` + reamostragem `floor(open_time/TF)` + `grid_hash` (invariante medida: 0 divergências vs 15m nativo, n=768); `code_version` (já no JSON); `ref_policy` (linha 5); `impulse` (linha 6); `sweep` (linha 4). |

---

## §3 — Profundidade de histórico, custo em disco, critério de corte

### 3.1 O que existe no dump público (`data.binance.vision`), medido na listagem S3

| série | granularidade | cobertura | arquivos | bytes zip | zip/ano |
|---|---|---|---|---|---|
| `klines` BTCUSDT 1m (mensal) | 1 min | **2020-01 → 2026-08** | 80 (80 meses, sem buraco) | **150,0 MB** | ~22 MB |
| `klines` BTCUSDT 15m (mensal) | 15 min | idem | 80 | 11,4 MB | ~1,7 MB |
| `klines` BTCUSDT 1h (mensal) | 1 h | idem | 80 | 3,0 MB | ~0,45 MB |
| `metrics` BTCUSDT (diário) — **OI, L/S, taker L/S** | 5 min | **2020-09-01 → 2026-09-01** | **2.192 = todos os dias** (122+365+365+365+366+365+244) | **25,4 MB** | ~4,2 MB |
| `aggTrades` BTCUSDT (mensal) — fonte do CVD | tick | 2020-01 → 2026-08 | 80 (+1 `part-*` de 417 MB) | **44,4 GB** | 5,4–10,3 GB |

`[MEDIDO 2026-09-03: vision_listing.py; expansão zip→CSV medida localmente em 1m: 60.262 → 162.412 bytes/dia, ×2,7]`.

**Correção a um número que circula nos documentos:** *"OI só 30 dias"* vale para o **REST** — `GET /futures/data/openInterestHist`:
*"Only the data of the latest 1 month is available."*, `limit` máx. 500, *"IP rate limit 1000 requests/5min"*
`[DOC: developers.binance.com › USDⓈ-M › Market Data › Open Interest Statistics]`. O **dump `metrics`** carrega
`sum_open_interest`, `sum_open_interest_value`, `count/sum_toptrader_long_short_ratio`, `count_long_short_ratio`,
`sum_taker_long_short_vol_ratio` a **5 min desde 2020-09-01** `[MEDIDO: cabeçalho de 3 arquivos baixados]`. Duas ressalvas medidas:
**2020-09-01 tem 576 linhas (2×288 — duplicatas; deduplicar por `create_time`)**; 2022-06-15 e 2024-03-10 têm 288 `[MEDIDO n=3 dias]`.
E uma não medida: `create_time` é o instante da amostra, **não** o de publicação — a invariante `publicado_em ≤ close_time`
(`ADR-017/D3.1`) exige um atraso de publicação declarado, que só se mede ao vivo comparando o `timestamp` do REST com o instante de
recebimento `[NÃO MEDIDO]`. Até medir, o replay deve assumir atraso ≥ 1 intervalo (5 min) — conservador por construção.

### 3.2 Recomendação ("o recomendado", que o owner delegou)

| o quê | profundidade | custo | por quê |
|---|---|---|---|
| `klines` 1m + 15m + 1h BTCUSDT | **completa, 2020-01 →** | **164 MB zip / ~440 MB CSV** | Custo trivial (o `aggtrades` local já ocupa 831 MB). 1m é necessário para o caminho de fill/stop; 15m/1h nativos servem de checagem da reamostragem (invariante §1.1). |
| `metrics` BTCUSDT | **completa, 2020-09 →** | **25 MB zip** | Torna `F4` de `ADR-017` testável (era "n=1 episódio em 8 dias"); 6 anos de ΔOI para percentis por regime. |
| `aggTrades` BTCUSDT | **não completa agora**: 2025-01 → (≈ 11,5 GB) | ≈ 11,5 GB zip | CVD só é insumo do `side_source`; para o histórico longo usa-se `side_source = taker_ls` do `metrics` (já é parâmetro da tabela). Estender é decisão do owner com o custo acima. |
| **mínimo utilizável** | 2023-01 → (44 meses) | ~81 MB zip 1m + 15 MB metrics | Se o owner recusar o completo. Abaixo disso não há dobras suficientes (§3.3). |

**Cobertura de regime não é premissa — é medição a fazer** depois do download: drawdown máximo e amplitude anual por ano, sobre os
klines baixados. Não afirmo o que 2023–2026 contêm; o script que medir dirá.

### 3.3 Critério de corte treino/teste para walk-forward de estrutura

1. **Classe A congela antes do backtest.** Nenhum parâmetro de A é ajustado a preço. Se o backtest quiser comparar `k ∈ {1; 1,5}` ou
   `N ∈ {5; 10}`, cada combinação é um `detector_key` distinto e **a escolha entre eles é parâmetro ajustado** — feita só em treino.
2. **Walk-forward rolante (não ancorado): treino 6 meses, teste 2 meses, passo 2 meses.** Com dados desde 2023-01 dá ~19 dobras;
   desde 2020-01, ~37.
3. **Embargo entre fim do treino e início do teste = maior horizonte de qualquer construto = `expiry_bars·TF + N·TF`**: em 1h,
   200 h + 10 h = **210 h ≈ 9 dias**; em 15m, ~53 h. Sem embargo, um OB aberto no treino é mitigado no teste e a informação vaza.
4. **`n ≥ 30` trades fechados por dobra de teste, senão a dobra funde com a vizinha.** Taxas medidas em 8 dias: 1h/N=10 → 5 OB/8 d
   ≈ **228/ano** (~38 por dobra de 2 meses, apertado); 15m/N=5/`close`/k=1,5 → 19 OB/8 d ≈ **870/ano** `[MEDIDO §1.2, extrapolação
   linear rotulada INFERRED]`.
5. **Estabilidade antes de média:** o resultado é **por dobra**, nunca só agregado. Se o `detector_key` vencedor mudar em ≥ 50 % das
   dobras, o parâmetro não é estável e o backtest **recusa** escolher — isso é o critério contra o overfit da matriz.
6. **Custo obrigatório em toda dobra:** taxa taker/maker, funding pago/recebido nas janelas de 8 h atravessadas, slippage declarado.
   Sem os três, o número não entra em documento.

---

## §4 — O que muda em `ADR-017` (editado; status continua `RASCUNHO`)

Edições feitas em [`ADR-017`](../../../adr/ADR-017-deteccao-autonoma-com-auditoria-por-excecao.md) `[DOC]`:

- **Cabeçalho:** `Q20` sai de "não fecha" e entra em "fecha" (*"coexistem"*); os valores de N em 15m/1h entram como fala do owner.
- **D1:** ganha `ref_policy = latest_confirmed` e a nota de que N=5/10 em 15m/1h é declaração a olho, não medição.
- **D3.3:** calibração humana passa de **obrigatória** a **pontual e opcional** (*"pode aceitar o default"*); a pilha obrigatória
  fica D3.1, D3.2, D3.4, D3.5 — e a fixture do JSON do owner entra como **oráculo de paridade**, não de precisão.
- **D6 (novo):** `break_by = close` + evento `sweep`, com a tabela de §1.2 como efeito medido; `wick` só para paridade Pine.
- **D7 (novo):** Q20 = coexistem → o swing confirmado é o **primitivo compartilhado**; níveis de Fibonacci são aritmética sobre
  pares `(swing_low, swing_high)` confirmados, com a mesma `swing_definition`; o corpus de zonas **não** se reaproveita entre os
  vocabulários; os dois vocabulários **nunca** definem swing de forma diferente.
- **D8 (novo):** classes A/B com o princípio de §2 e a lista de linhas A ausentes.
- **Falsificadores:** `F1` e `F3` dependiam da sessão de calibração que o owner dispensou — **ficam dormentes** (reativam se
  houver sessão) e são substituídos por `F6` (paridade: `só-close = 0` e igualdade com o `structure_summary` do JSON) e `F7`
  (mutação viva: a fixture de D3.2 tem de ficar vermelha — hoje não fica em 1h). `F4` é reescrito: o horizonte passa de "≥ 30
  dias" para o dump `metrics` completo.
- **Consequências:** correção de "OI existe por 30 dias" → REST 30 dias, dump desde 2020-09-01; dívida nova: atraso de
  publicação do `metrics` `[NÃO MEDIDO]`.

---

## §5 — O que não julgo (rotulado)

1. **Se `close` dá resultado melhor que `wick`** — só backtest com custo; e isso mede tese, não detector. `[NÃO MEDIDO]`
2. **N para 5m e 4h** — é o olho do owner; em 8 dias 4h nem é observável. `[NÃO CALIBRADO]`
3. **O valor de `k`** — 1,5 é default da fixture, não calibração. `[NÃO CALIBRADO]`
4. **Se o olho do owner concorda com os 88 swings / 16 OBs** — 7 s e 18 s não medem isso. `[NÃO MEDIDO]`
5. **Cobertura de regime do dump 2020–2026** — medir após baixar; não afirmo o que os anos contêm. `[NÃO MEDIDO]`
6. **Atraso de publicação do `metrics`** e **semântica de empate de `ta.pivothigh`** — `[NÃO VERIFICADO]`.
7. **Taxas/slippage do tier do owner** — `[NÃO MEDIDO]`; sem elas §3.3 item 6 não fecha.
8. **Se SMC tem valor preditivo**, **quanto de `aggTrades` baixar** (11,5 GB é dinheiro/tempo do owner), **tamanho de posição,
   corretora, jurisdição** — decisão do owner; apresentei custo e parei.
