# PRD-008 — Candle real e eixo único: a vela que nunca teve escritor, e os seis gráficos que não se falam

> **Status em 2026-09-26: PARCIAL.** SPEC-008 prevalece (CA-5a..d, CA-8′); OI OHLC Coinalyze tem 0 linhas em md.series (PRD-009 M2); latência: SPEC-009 (160/400 ms).
> Verdade corrente e contradições: [`docs/MAPA-DOCUMENTAL.md`](../MAPA-DOCUMENTAL.md) §3 #26,60.

**Feature:** `candle-real-e-eixo-unico` · **filha de** `plataforma-dados`
**Componente primário:** `web` · **toca:** `sentimento` (ingestão), `charts` (composição de painel)
**Estado do ledger ao escrever:** `INIT`, 3 eventos (`init`, `relate`, `dispatch pm`)
`[MEDIDO 2026-09-19: harness pipeline show candle-real-e-eixo-unico]`
**Entrada:** [`docs/context/candle-real-e-eixo-unico/handoff/DISCOVERY.md`](../context/candle-real-e-eixo-unico/handoff/DISCOVERY.md)

---

## 0. Como ler este documento

Toda afirmação quantitativa carrega **o comando que a produziu**, o universo (`n`) e um rótulo de
força (`CLAUDE.md`, *"Nenhum número sem o comando que o produziu"*). As medições de §1.2 foram
**re-rodadas por este `/pm`** em 2026-09-19 sobre a stack de produção de pé — não são cópia do
discovery. Onde a medição do `/pm` **corrigiu** a do discovery, isto está dito na própria linha,
porque a correção é o achado.

O `/pm` **não decide** nada que pertença a uma ADR em vigor. Onde a decisão é de outro dono, o
documento apresenta **alternativas com o custo de cada uma** (§14) e classifica a pergunta (§15).

---

## 1. Contexto e problema

### 1.1 A fala do owner — literal, na grafia dele

`[PREMISSA-OWNER: 2026-09-19]`

> *"O que temos rodando no /symbol esta totalmente em desacordo com nosso piloto. Nosso open
> interest parece em total desacordo com o que vemos na coinalyze. A ideia é conseguir ter algo
> mais próximo ali no coinalyze/trading view. Preciso dessas coisas bem estabelecidas, pq em tese
> esse symbol é a extensão do piloto, vai entrar muita coisa ali ainda, então o foco é garantir
> que conseguimos ter todos os dados e apresentar para daí começar a estruturar a tela. Mas vamos
> caminhar para algo próximo do coinalyze e tradingview, selecionar o que quero adicionar de
> informação/config dos tempos. Todos indicadores devem estar no tempo gráfico dos candles (a não
> ser que seja um indicador que queira ver outro tempo explicitamente - exceção), devem caminhar e
> respeitar a tela principal do candle, não faz sentido arrastar uma parte e tudo não andar
> junto."*

**Escopo, escolhido entre três alternativas com o custo de cada uma declarado:**
`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **"dados + eixo único"**.
SMC (BMS/CHoCH/OB) fica **FORA** (`NG-1`).

### 1.2 O que está medido — 11 fatos, o comando de cada um

Ambiente: stack de produção em Docker de pé, `/symbol` → `200`, `data-freshness-age-ms="240000"`
(teto 600.000).

| # | fato | comando | resultado | rótulo |
|---|---|---|---|---|
| **M1** | Não existe série OHLC de **preço** no catálogo | `curl -s http://127.0.0.1:8000/api/v1/series-catalog` | `n_entries=60`, **15** de `BTCUSDT`. Preço só como escalar: `klines_last` (`5m`, `USDT`, `STOCK`, **`LAST`**) e `price_mark_close` (`5m`, `USDT`, `STOCK`, **`CLOSE`**) | `[MEDIDO 2026-09-19, n=60 entradas / 15 BTCUSDT]` |
| **M2** | ⭐ **`klines_last` não tem escritor — é catálogo sem produtor** | `grep -rn "build_klines_last_entry" backend/src --include='*.py'` → 4 ocorrências, **nenhuma** em um coletor; `grep -rn "price_source_catalog import" backend/src` → **1 consumidor, `use_cases/series_catalog.py`** (a rota do catálogo); `grep -c "klines_last" backend/src/modules/sentimento/use_cases/collector_series_mapping.py` → **1, e é comentário (linha 154)** | a série de preço é **declarada e nunca escrita** | `[MEDIDO 2026-09-19]` ⚠️ **corrige o discovery §3.2**: não é "a vela nunca foi ingerida" — é que **o preço inteiro nunca foi ingerido**, vela ou escalar |
| **M3** | O efeito de M2 na tela | `curl -s http://127.0.0.1:3000/symbol \| grep -o 'data-fact="[^"]*"' \| sort -u` | `price_last_reading:absent` com `price_slots:5760`; e **não existe** `price_readable_horizon`, enquanto `volume`/`cvd` publicam `5412/5760` | `[MEDIDO 2026-09-19, n=39 data-fact distintos]` |
| **M4** | ⭐ **O front JÁ desenha vela — e alimenta com vela DEGENERADA** | `SymbolClient.tsx:821-823` (`chart.addSeries(CandlestickSeries, …)`, `candlestickSeriesLossless(panels.price.series.slots)`); `view-model.ts::rawCandlesFromHistoryRows` monta `{openTimeMs, open: close, high: close, low: close, close, volume: 0}` | o `CANDLE?` do owner **não é renderizador faltando**. São duas faltas empilhadas: (i) a série não tem escritor (M2); (ii) mesmo com escritor, a forma servida é **escalar**, e a vela sairia sem corpo nem pavio | `[MEDIDO 2026-09-19]` |
| **M5** | ⭐ **O `O`/`H`/`L` já chega no cliente e é descartado** | `grep -n "_INDEX: Final" backend/src/modules/sentimento/infra/binance_klines_client.py` | `KLINE_FIELD_NAMES` (`:49-53`) declara `open`/`high`/`low`/`close`, mas os índices nomeados são **4** — `OPEN_TIME`, `VOLUME`, `CLOSE_TIME`, `TAKER_BUY_BASE_VOLUME` — e os acessores são **4** (`open_time_ms`, `close_time_ms`, `volume`, `taker_buy_base_volume`). **Zero** para `[1..4]` | `[MEDIDO 2026-09-19]` ⇒ a vela real **não custa chamada nova nem cota nova**: o payload que M1-volume já paga carrega os quatro números |
| **M6** | ⭐ **O schema de uma coluna já carrega OHLC — e a prova está no OI** | mesmo `curl` de M1 | `sum_open_interest` da Coinalyze existe como **4 linhas** (`OPEN`/`HIGH`/`LOW`/`CLOSE`, `tsConvention=OHLC_OVER_BUCKET`) sobre a **mesma** coluna `value_raw` | `[MEDIDO 2026-09-19, n=4 linhas]` ⇒ `SPEC-006 §5.2`/`I-1` (*"uma coluna basta — sem OHLC"*) **não precisa ser falsificada** para existir vela: 4 `Reduction` são 4 `series_key_id`, não 4 colunas |
| **M7** | ⭐ **O alvo do print exige mudar TRÊS termos do `SeriesKey` ao mesmo tempo** | `curl` de M1 + agregação por `aggregationScope`/`denom` | **as 60 entradas** têm `aggregationScope="Symbol"`; **todo** OI é `unit=BTC, denom=base`; coorte é `all` sobre `usdm_futures`. O print é **nocional em USD**, **agregado multi-exchange**, coorte **STABLECOIN+COIN-margined** | `[MEDIDO 2026-09-19, n=60]` ⚠️ **precisa o discovery §3.1**: não é só "agregado" — são `denom`, `aggregationScope` **e** `cohort`, e `aggregationScope` agregado **não existe em nenhuma entrada hoje** |
| **M8** | Seis gráficos, zero sincronismo | `grep -c "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx` → **6**; `grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*'` → **0 linhas** | e o `0` vale para **todo** `frontend/src`, inclusive os módulos headless | `[MEDIDO 2026-09-19]` |
| **M9** | A rota serve **um único** `interval`, e a grade mente sobre a resolução | `grep -rn "SUPPORTED_INTERVAL" backend/src --include='*.py'` → `series_history.py:48` `= "1m"`, e `:180-183` **recusa** outro; página: `data-oi-native-bars="1152"` para `data-oi-wire-points="5760"` | cada barra nativa de `5min` repetida **5×** na grade de `1min` (`GA-2`) | `[MEDIDO 2026-09-19]` |
| **M10** | ⭐ **Uma chave de contrato legível por máquina é derivada de microcopy pt-BR** | `grep -rn 'live_\${\|\`live_' frontend/src --include='*.ts*'` → `SymbolClient.tsx:2192` `data-fact={\`live_${label}:…\`}` | a página publica `data-fact="live_preço:attempted"` — **com acento** — porque `label` é a string visível. Trocar o rótulo pt-BR **muda a chave que o QA asserta**, em silêncio | `[MEDIDO 2026-09-19]` |
| **M11** | Regras bloqueantes em vigor | `harness rules list --severity block` | **8** (`core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`) | `[MEDIDO 2026-09-19]` |

### 1.3 O diagnóstico — quatro lacunas, e elas não são do mesmo gênero

**(a) O preço não tem escritor** (M2). Isto é **ingestão**, não render. É a lacuna mais barata de
todas, porque M5 mede que o dado já chega: o coletor de `klines_volume` já paga a chamada
`/fapi/v1/klines` e joga fora os índices `[1..4]`.

**(b) A forma servida é escalar, a forma pedida é tupla** (M4/M6). É **contrato**, não ingestão.
`M6` mostra que existe um caminho que **não** mexe no schema (4 `Reduction`, como o OI já faz) e um
que mexe (colunas OHLC). **Quem escolhe é `/architect`** — §14 traz o custo dos dois.

**(c) Seis gráficos autônomos** (M8). É **estrutural sob `frontend/src/`** ⇒ dono do julgamento é o
`frontend-architect` (`ADR-003`/`ADR-034/D8`). Não é regulagem de opção.

**(d) Não há timeframe, e a grade de transporte não é a grade nativa** (M9). Isto é **fronteira
API↔browser**: decidir *onde* a reagregação acontece, e o que `FLOW` (somar) e `STOCK` (último, nunca
somar) fazem sob reagregação. `ADR-034/D6` fixou `SUPPORTED_INTERVAL = "1m"` — **reabrir aquela
decisão é ato daquela ADR**.

⚠️ **E há uma quinta, que é de outro dono inteiro:** o OI do print (M7) não é defeito nosso — é
**outra grandeza, outro universo, outra coorte**. Aproximar do Coinalyze ali **não é conserto, é
troca de fonte**, e colide de frente com `ADR-036/D2` (*Volume e Open Interest: Binance, a origem*).
Ver `[Q1]`.

---

## 2. Objetivo

**Que `/symbol` mostre uma vela de verdade, que os seis painéis obedeçam a um único eixo de tempo, que
o timeframe seja escolhido uma vez e valha para todos, e que o número do OI e o rótulo do OI digam a
mesma coisa que a fonte declara.**

**Falsificador da feature — herdado do discovery §6, e os quatro são de PIXEL, com ablação:**

| # | o pixel | a baseline de hoje, medida |
|---|---|---|
| **P1** | o painel de Preço desenha **corpo e pavio** (`high > low` em pelo menos uma vela da janela), e `price_last_reading` deixa de ser `absent` | `price_last_reading:absent`, `price_slots:5760`, sem `price_readable_horizon` `[MEDIDO 2026-09-19]` |
| **P2** | arrastar/zoom no painel de Preço move os outros **cinco** no mesmo instante | `0` linhas de `subscribeVisibleLogicalRangeChange` em `frontend/src` `[MEDIDO 2026-09-19]` |
| **P3** | trocar o TF na barra reagrega **todos** os painéis para o mesmo TF | não há barra; `SUPPORTED_INTERVAL="1m"`; OI repete cada barra `5×` `[MEDIDO 2026-09-19]` |
| **P4** | o número do OI na tela e o **rótulo** dizem a mesma grandeza, universo e coorte que a fonte declara | painel diz "Open Interest (5m)" e mostra `108.135,34` — `contratos em BTC`, `Binance`, `USDT-M`; o rótulo não soletra nenhum dos três `[MEDIDO 2026-09-19]` |

⛔ **`Assert de DOM não prova pixel` já mordeu neste repositório.** Cada um dos quatro exige
**ablação**: remover a causa tem de apagar o pixel. Atributo presente com elemento fora da tela é
verde falso — é a lição registrada em `MEMORY.md`.

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo / onde | efeito aqui |
|---|---|---|---|
| **D-a** | `ADR-036/D2` — Volume e OI: **Binance, a origem**; terceiro só onde a origem é vetada, não existe, ou perde dado sem volta | `[DOC: ADR-036/D2]` | `[Q1]` **pergunta** ao owner se o caso do OI agregado satisfaz o "vetada/não existe"; **não decide**. A decisão é de `ADR-036` |
| **D-b** | `ADR-034/D6` — `SUPPORTED_INTERVAL = "1m"` na rota `series-history`; `ADR-034/D8` — o barril `charts`↔`web` | `[DOC]`, confirmado em `series_history.py:48,180-183` `[MEDIDO 2026-09-19]` | F3 **não** altera a rota por conta própria; `[Q2]`/§14-B levam a escolha a quem é dono |
| **D-c** | `ADR-003` — `web` não alarga a composição de painel de `charts` por conta própria | `[DOC]` | F2/F3 passam pelo `frontend-architect` antes de código |
| **D-d** | `SPEC-006 §5.2`/`I-1` — *"uma coluna (`value_raw`) basta — sem OHLC"*, com falsificador declarado (*"se falso, F0 refeita com colunas extras"*) | `[DOC: SPEC-006 §9]` | M6 mede que a vela **pode** existir **sem** falsificar `I-1`. Escolher entre os dois caminhos é de `/architect` (§14-A) |
| **D-e** | Linha 12 da tabela de fronteira do `CLAUDE.md` — rota nasce **em inglês** | `[PREMISSA-OWNER: 2026-09-08]` | se `[Q4]` criar rota por símbolo, o segmento é inglês. O **nome** é de `/architect`/`frontend-architect` |
| **D-f** | `[P-seed]` — proibido semear dado sintético no Postgres compartilhado | `[DOC: MEMORY.md]` | backfill lido da **origem** não é dado de teste; e nada de OHLC sintético no banco compartilhado |
| **D-g** | Sem mobile no piloto | `[PREMISSA-OWNER: 2026-09-11]` | a barra de TF e o eixo único são desenhados para desktop |
| **D-h** | Premissas de infra — VPS compartilhada, R2 free tier, só Postgres | `[PREMISSA-OWNER: 2026-08-25]` | qualquer série nova (OHLC de preço = até 4 séries novas × 4 símbolos) **declara pegada de disco** antes de escrever |
| **D-i** | `ADR-027/D1` — coletores one-shot/diários nunca viram container de vida longa | `[DOC]` | se a vela exigir backfill, ele é one-shot/cron, não serviço |
| **D-j** | O predicado de quarentena de 3 termos e a fórmula MODELED são de `PRD-005`/`SPEC-005` (`SPEC_APPROVED`, aguardando `/tech-lead`) | `[MEDIDO 2026-09-19: harness pipeline state coinalyze-fora-da-quarentena → SPEC_APPROVED]` | ⛔ **nada aqui toca o predicado, o probe ou a fórmula.** Ver §5 e `[Q1]` |

---

## 4. Escopo

### 4.1 Dentro

| # | entrega | componente | fase |
|---|---|---|---|
| E-1 | O preço passa a ter **escritor** (M2) e a forma servida passa a comportar OHLC (M4/M6) | `sentimento` | F1 |
| E-2 | O painel de Preço desenha corpo e pavio de vela real | `web`/`charts` | F1 |
| E-3 | Um **eixo de tempo mestre**: pan/zoom num painel move todos | `web`/`charts` | F2 |
| E-4 | **Barra de timeframe**, e todo painel reagrega para o TF escolhido | `sentimento`/`web` | F3 |
| E-5 | O rótulo do OI soletra **grandeza · universo · coorte**, qualquer que seja a fonte | `web` | F4 |
| E-6 | (condicional a `[Q1]`) trocar a fonte/forma do OI para o alvo do print | `sentimento` | F5, **condicional** |

### 4.2 O que esta feature assume da mãe e das irmãs — referência, não cópia

- **`plataforma-dados`** (`BUILD_AUTHORIZED`): `T-07.15`/`T-07.16`/`T-07.17` seguem em aberto no
  `tasks.toml` da mãe `[DOC: DISCOVERY §5]`. Esta feature **não** os fecha nem os move.
- **`coinalyze-fora-da-quarentena`** (`SPEC_APPROVED`): `PRD-005 NG-7` diz, literal, que nada de
  `web`/`charts`/`convergencia` muda lá ⇒ **não há sobreposição de código**. A sobreposição é de
  **fonte**: qualquer série Coinalyze nova que `[Q1]` crie nasce sujeita ao predicado de 3 termos
  daquela feature. Ver a assimetria em §8/`RN-6`.

---

## 5. User stories — com fronteira por fase (`DoD-VERTICAL`: fase = **uma métrica até o pixel**)

### F1 · A vela real — `sentimento` + `web`

> **Como** operador do `/symbol`, **quero** ver a vela de BTC/USDT com corpo e pavio, **para** ler
> máxima, mínima e fechamento do bucket como leio no TradingView — hoje o painel de Preço está vazio
> e anotei `CANDLE?` nele.

- **Fronteira:** ingestão + contrato + render **do preço, só**. Nenhum outro painel muda.
- **Cabe numa fase?** Sim — M5 mede que a fonte já chega; o trabalho é escrever o que se descarta.

### F2 · O eixo único — `web`/`charts`

> **Como** operador, **quero** arrastar o gráfico de preço e ver os cinco painéis andarem junto,
> **para** ler OI, CVD, long/short e liquidação **no mesmo instante** da vela que estou olhando.

- **Fronteira:** sincronismo de range. **Não** muda dado, **não** muda TF.
- **Falsificador:** `P2`, com ablação (remover a assinatura ⇒ os painéis param de andar).

### F3 · O timeframe único — `sentimento`/`web`

> **Como** operador, **quero** escolher o timeframe uma vez e ver **todos** os indicadores naquele
> timeframe, **para** que "arrastar uma parte e tudo andar junto" também valha na resolução.

- **Fronteira:** a lista de TFs vem de `[Q2]`. A reagregação respeita `Nature`: `FLOW` soma,
  `STOCK` toma o último do bucket, `RATIO` **não soma nunca** (`RN-3`).
- ⚠️ **Depende de `[Q2]` e `[Q3]`.** Sem a lista de TFs e a profundidade por TF, não há critério de
  aceite — é `[GAP]` bloqueante de fase, não do PRD.

### F4 · O OI honesto — `web`

> **Como** operador, **quero** que o painel de OI diga **o que ele está medindo**, **para** parar de
> comparar `108.135,34` com `27,656 B` como se fossem o mesmo número.

- **Fronteira:** **rótulo e unidade**, não fonte. Entrega valor **mesmo que `[Q1]` fique aberta** —
  e é justamente por isso que é fase própria: o rótulo honesto é o que impede a comparação errada.

### F5 · (condicional a `[Q1]`) O OI do alvo — `sentimento`

> **Como** owner, **quero** ver no `/symbol` o mesmo OI agregado em nocional USD que vejo no
> Coinalyze.

- ⛔ **Não entra em plano sem `[Q1]` respondida.** M7 mede que são três termos do `SeriesKey` de
  uma vez, e `ADR-036/D2` é a dona.

---

## 6. Unidades de valor candidatas — **não criadas**

`harness policy --key tracker` → `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}`
`[MEDIDO 2026-09-19]`.

⛔ **Nada foi criado no tracker.** A regra desta casa é: unidade de valor **só depois** do PRD
validado pelo `/architect`. Candidatas, para aquele momento: **F1**, **F2**, **F3**, **F4** (uma
Epic-filha ou 4 Tarefas, conforme o `/tech-lead`). **F5 não é candidata** enquanto `[Q1]` estiver
aberta.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | fase | verificável por |
|---|---|---|---|
| **RF-1** | Existe um produtor que escreve a série de preço de `BTCUSDT`, lendo `/fapi/v1/klines` | F1 | uma leitura de `/series-history` da chave de preço devolve linhas com `value !== null` |
| **RF-2** | O contrato servido ao painel de Preço carrega **quatro** números por bucket (`open`,`high`,`low`,`close`), distinguíveis entre si | F1 | ao menos uma barra da janela tem `high > low` |
| **RF-3** | O painel de Preço desenha corpo e pavio a partir de RF-2, sem inventar número | F1 | `P1` + ablação |
| **RF-4** | Ausência continua sendo ausência: bucket sem dado vira **lacuna**, nunca vela de altura zero nem `0` | F1 | herda `s2-lightweight-adapter.ts` (`WhitespaceItem`); teste de ablação |
| **RF-5** | Existe **um** eixo de tempo mestre; pan/zoom em qualquer painel propaga para todos | F2 | `P2` + ablação |
| **RF-6** | Há uma barra de timeframe com a lista de `[Q2]`; a escolha vale para **todos** os painéis | F3 | `P3` |
| **RF-7** | A reagregação por TF respeita `Nature` (`RN-3`) e é **uma** implementação, num lugar só | F3 | teste diferencial `FLOW` vs `STOCK` sobre a mesma janela |
| **RF-8** | O rótulo do painel de OI soletra **grandeza · universo · coorte**, lidos do `SeriesKey` servido — não escritos à mão | F4 | trocar a chave no catálogo muda o rótulo sem tocar no componente |
| **RF-9** | Nenhum painel exibe número cuja proveniência não seja rastreável à série que o originou | todas | herda `RN-7` de `SPEC-006` |

### 7.2 Não-funcionais

| id | requisito | número, quando há |
|---|---|---|
| **RNF-1** | Frescor: a página continua publicando `data-freshness-age-ms` e o teto continua **600.000 ms** `[MEDIDO 2026-09-19: 240000 no momento da medição]` | teto herdado |
| **RNF-2** | Latência de interação do eixo único: o pan tem de ser **perceptualmente instantâneo**. **`[NÃO MEDIDO]`** — não existe número declarado neste repositório para interação de gráfico. `[Q5]`, não-bloqueante, `/architect` propõe | — |
| **RNF-3** | Pegada de disco declarada antes de escrever série nova (`D-h`). Hoje: **60 entradas de catálogo, 4 símbolos** `[MEDIDO 2026-09-19]`. Uma vela por 4 `Reduction` × 4 símbolos = **até 16 séries novas** | teto a declarar na SPEC |
| **RNF-4** | Cota: **zero chamada nova à Binance para a vela** — M5 mede que o payload já é pago. Se `[Q3]` pedir profundidade maior que a janela atual de 4 dias, o backfill declara o custo | `[MEDIDO 2026-09-19]` |
| **RNF-5** | A suíte de front roda como portão (`make verify`), não `node --test` solto | `[DOC: CLAUDE.md]` |

---

## 8. Regras de negócio

| id | regra | origem |
|---|---|---|
| **RN-1** | *"Não sabemos"* e *"foi zero"* **nunca** são os mesmos pixels | `STITCH_CONTEXT.md:1821-1825`, já pago em `s2-lightweight-adapter.ts` |
| **RN-2** | Vela **degenerada** (`o=h=l=c`) é uma afirmação honesta enquanto a fonte for escalar — e deixa de ser aceitável assim que RF-2 entrar. **Ela não pode coexistir com a vela real na mesma série**, ou a tela passa a ter dois significados para o mesmo desenho | `view-model.ts:30-38` `[MEDIDO 2026-09-19]` |
| **RN-3** | Reagregar por TF: `FLOW` **soma**, `STOCK` toma o **último** do bucket (nunca soma), `RATIO` **nunca** soma nem faz média sem decisão explícita | `Nature` em `series_key.py`; `ADR-036/D3` já mede que `ls_ratio` genérico é recusado |
| **RN-4** | Repetir a barra nativa `5×` para caber numa grade de `1min` (`GA-2`) **é degradação visível**, não neutra: o gráfico mostra escada. Sob TF explícito, a escada vira mentira se não for declarada | M9 `[MEDIDO 2026-09-19]` |
| **RN-5** | Rótulo de painel é **derivado do `SeriesKey`**, nunca escrito à mão — senão a fonte muda e o rótulo mente | RF-8 |
| **RN-6** | ⚠️ **Assimetria painel↔backtest:** o predicado de quarentena governa `readable_by_backtest`; o **painel** lê Coinalyze hoje (`data-fact="liquidation_provenance:declared:coinalyze"` `[MEDIDO 2026-09-19]`). ⇒ uma série Coinalyze nova criada por `[Q1]` **apareceria na tela e continuaria invisível ao backtest** até `PRD-005` F1/F2 entregarem. Isso é **duas verdades sobre a mesma métrica** e tem de ser decidido, não descoberto | `PRD-005 §1.2`, `SPEC-001 §5.2` |
| **RN-7** | Todo número na tela traça até `value_raw` — nada fabricado | `SPEC-006`/`RN-7` |

---

## 9. Tipos e contratos críticos

| # | contrato | estado | dono |
|---|---|---|---|
| **C-1** | A chave da série de preço OHLC: `SeriesKey` com `reduction ∈ {OPEN,HIGH,LOW,CLOSE}` e `ts_convention = OHLC_OVER_BUCKET` (o molde existe — M6) **ou** um contrato novo de tupla | **`TBD`** — dono **`/architect`**, data: no Gap Analysis deste PRD. §14-A traz as duas com custo |
| **C-2** | O `interval` que a rota `series-history` aceita | hoje **`"1m"` fixo** (`series_history.py:48`) `[MEDIDO]`. Mudar é ato de `ADR-034/D6` | **`/architect`** + dono de `ADR-034` |
| **C-3** | A interface do eixo mestre entre `charts` e `web` (quem é dono do range, quem assina) | **`TBD`** — dono **`frontend-architect`**, data: Gap Analysis |
| **C-4** | O envelope do rótulo de proveniência (grandeza/universo/coorte) que RF-8 lê | **`TBD`** — dono `/architect`; ⚠️ M10 mede que hoje uma chave de contrato (`data-fact`) é **derivada de microcopy pt-BR** — o contrato novo **não** pode repetir isso |
| **C-5** | `/collector-status` e as 15 colunas de `/ingest-health` | **intocados** (`ADR-030/D5`, `ADR-008/D3`) | herdado |

---

## 10. Critérios de aceite — testáveis, com o comando e a coluna "morde"

| id | critério | comando | morde quando |
|---|---|---|---|
| **CA-1** | A série de preço tem linhas | `curl -s '<rota>/series-history?...' \| jq '[.rows[] \| select(.value != null)] \| length'` | `0` — hoje é exatamente esse o caso (M3) |
| **CA-2** | A vela tem faixa | sobre a mesma resposta: existe ao menos um bucket com `high > low` | toda barra com `high == low` ⇒ ainda é a vela degenerada de M4 |
| **CA-3** | `price_last_reading` deixa de ser `absent` | `curl -s http://127.0.0.1:3000/symbol \| grep -o 'data-fact="price_last_reading:[^"]*"'` | `:absent` |
| **CA-4** | **Ablação de P1:** removido o produtor de preço, o corpo/pavio **some** da tela | teste de front com fixture vazia + captura | o pixel sobrevive à ablação ⇒ estava desenhando outra coisa |
| **CA-5** | O eixo mestre existe e é **um** | `grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*' \| wc -l` | `0` (hoje) — e **também** morde se der `6`: seis assinaturas independentes é o mesmo problema com outro nome |
| **CA-6** | **Ablação de P2:** pan no preço move os cinco; desligada a assinatura, param | Playwright contra o app real, assert de posição, não de status HTTP | o assert passa sem o app real ⇒ não prova pixel |
| **CA-7** | Trocar TF reagrega **todos** | Playwright: clicar `4h`, ler a contagem de barras de **cada** painel | um painel mantém a contagem anterior ⇒ não seguiu o mestre |
| **CA-8** | `STOCK` não soma sob reagregação | teste diferencial: OI reagregado a `1h` == último do bucket, e **≠** soma dos 12 de `5min` | igual à soma ⇒ `RN-3` violada |
| **CA-9** | O rótulo do OI soletra os três termos | `curl -s http://127.0.0.1:3000/symbol \| grep -o 'data-fact="oi_provenance:[^"]*"'` | ausente, ou não contém grandeza+universo+coorte |
| **CA-10** | O rótulo é **derivado**, não escrito | trocar a chave da série no catálogo de teste e reler o rótulo | o rótulo não muda ⇒ está hard-coded (`RN-5`) |
| **CA-11** | Nenhuma regra bloqueante nova é violada | `make verify` | qualquer das **8** de M11 |
| **CA-12** | O `__pycache__` não está medindo por nós | purgar antes de acreditar em verde/vermelho | `[DOC: MEMORY.md]` |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | **SMC: BMS/CHoCH/order blocks, fractal `N`, `k-ATR`, camadas** | `[DECISÃO-OWNER: 2026-09-19]` — é o *"daí começar a estruturar a tela"* da fala. Paridade com o piloto foi a alternativa **(b)**, recusada |
| **NG-2** | VPVR / perfil de volume por faixa de preço (está no print do alvo) | não foi pedido; é geometria nova em `charts`, e `ADR-003` diz que `web` não alarga a composição por conta própria |
| **NG-3** | Funding rate como painel (o print tem, nós não temos série) | métrica nova ⇒ é `ADR-036`/`cinco-metricas-do-core`, não esta feature |
| **NG-4** | Mudar o predicado de quarentena, o probe ou a fórmula MODELED | é `PRD-005`/`SPEC-005`, em `SPEC_APPROVED`. Mexer aqui cria duas verdades (`D-j`) |
| **NG-5** | Mudar `/collector-status` ou as 15 colunas de `/ingest-health` | `ADR-030/D5`, `ADR-008/D3` |
| **NG-6** | Mobile / responsividade | `[PREMISSA-OWNER: 2026-09-11]` |
| **NG-7** | Renomear os 4 eventos de log em português existentes | linha 10 da tabela de fronteira é **prospectiva**; renomear quebra consulta em silêncio |
| **NG-8** | Fechar `T-07.15`/`T-07.16`/`T-07.17` da mãe | são da mãe; `[M1]` para o owner |
| **NG-9** | Implantar na VPS | herda `ADR-029/D1` |

---

## 12. `[INFERRED]` — com motivo e custo de reversão

| id | inferência | motivo | custo se errada |
|---|---|---|---|
| **I-1** | *"algo mais próximo do coinalyze/tradingview"* significa **paridade de leitura** (vela, eixo, TF, rótulo honesto), **não** paridade de features (VPVR, desenho, alertas) | a própria fala separa *"garantir que conseguimos ter todos os dados e apresentar"* de *"daí começar a estruturar a tela"* | se errada, `NG-2`/`NG-3` reabrem e a feature cresce; nenhum trabalho de F1–F4 é jogado fora |
| **I-2** | *"todos indicadores no tempo gráfico dos candles"* = **um** TF ativo por vez, com exceção **explícita** por indicador (a fala nomeia a exceção) | literal na fala | se errada, F3 precisa de TF por painel — muda o desenho da barra, não a reagregação |
| **I-3** | A vela de F1 vem de **`klines`** (a mesma fonte de M1-volume), não de `price_mark_close` | `price_source_catalog.py:166-170` mede que o mark price é subamostrado (`count=300`/bucket contra média de **11.245** trades/bucket) e *"os extremos são subamostrados por construção"* — exatamente máxima e mínima | se errada, a vela sai com pavio encurtado e ninguém vê; o custo é **silencioso**, por isso está escrito |
| **I-4** | A janela atual de **4 dias** derivada do relógio não sobrevive a `4h` (seriam **24** velas; o print do alvo mostra ~18 dias em `1h`) | aritmética sobre `request-window.ts::resolveRouteWindow` | se errada, `[Q3]` some; se certa, F3 sem `[Q3]` entrega uma barra de TF que mostra tela vazia em `4h` |

⛔ **Nenhum unknown crítico virou `[INFERRED]` silencioso.** Os quatro de maior peso estão em §15 como
pergunta ao owner, não como inferência.

---

## 13. GAPs nomeados por esta rodada

| id | gap | classe |
|---|---|---|
| **G-1** | O OI do alvo exige `denom`+`aggregationScope`+`cohort` mudados juntos, e `aggregationScope` agregado **não existe** em nenhuma das 60 entradas (M7) | **bloqueante de F5** → `[Q1]` |
| **G-2** | Não há lista declarada de timeframes nem profundidade por TF | **bloqueante de F3** → `[Q2]`/`[Q3]` |
| **G-3** | Não há número declarado de latência de interação de gráfico (RNF-2) | não-bloqueante → `[Q5]` |
| **G-4** | `data-fact` deriva chave de máquina de microcopy pt-BR (M10) — **defeito latente de contrato**, achado nesta rodada | não-bloqueante → `[Q6]` |
| **G-5** | A vela degenerada e a vela real não podem coexistir na mesma série (`RN-2`), e não há plano de corte | inferível → `/architect` decide no Gap Analysis |
| **G-6** | `RN-6`: série Coinalyze nova ficaria visível na tela e invisível ao backtest | **bloqueante de F5**, junto com `[Q1]` |

---

## 14. Menu para o owner e para o `/architect` — escolhas com o custo de cada uma

### A. A forma da vela — **decisão do `/architect`**

| opção | como | custo |
|---|---|---|
| **A1 — 4 séries `Reduction`** (`OPEN`/`HIGH`/`LOW`/`CLOSE`) | o molde já existe e está em produção no OI (M6) | 4× linhas escritas por bucket; o painel faz 4 leituras e junta; `SPEC-006/I-1` **sobrevive** |
| **A2 — colunas OHLC na tabela** | uma linha por bucket, 4 colunas | **falsifica `SPEC-006/I-1`** explicitamente (*"se falso, F0 refeita com colunas extras"*); migração de schema em produção; 1 leitura por painel |
| **A3 — série única com payload de tupla** | uma coluna, valor estruturado | quebra a premissa de `value_raw` como decimal-texto (`SPEC-001 §2.6`); **não recomendada pelo `/pm`**, listada para ser recusada com motivo |

### B. Onde mora a reagregação por TF — **decisão do `/architect` + dono de `ADR-034`**

| opção | custo |
|---|---|
| **B1 — na rota** (`SUPPORTED_INTERVAL` aceita mais que `1m`) | reabre `ADR-034/D6`; menos bytes na rede; a reagregação fica num lugar só, testável em Python |
| **B2 — no browser** | não toca `ADR-034/D6`; o wire continua `1m` (5.760 pontos por painel hoje — M9); CPU no cliente e `RN-3` reimplementada em TS |
| **B3 — grade nativa servida, reagregação na rota sob demanda** | híbrido; mais superfície de contrato |

### C. O OI — **decisão do owner, sob `ADR-036`** (ver `[Q1]`)

| opção | o que o owner vê | custo |
|---|---|---|
| **C1 — fica na origem, conserta o rótulo** (= F4 sozinha) | `108.135,34 BTC · Binance USDT-M` — e o rótulo diz isso | **zero** exposição nova; a tela **continua diferente** do Coinalyze, mas deixa de ser comparável por engano. Honra `ADR-036/D2` sem reabri-la |
| **C2 — série Coinalyze agregada em nocional USD** | ~`27,6 B USD` | exposição a terceiro em métrica de CORE (o que `ADR-036` foi escrita para evitar); cota da Coinalyze; **`RN-6`**: visível na tela, invisível ao backtest até `PRD-005` entregar; recuperabilidade limitada (OI `5min` retém **~7,0 dias** `[DOC: docs/medicao-coinalyze.md:39-54]`) |
| **C3 — os dois, lado a lado, rotulados** | origem **e** agregado | dobra a leitura e o custo de C2; e cria a pergunta "qual é o certo?" na tela |

---

## 15. Perguntas em Aberto — classificadas, com quem decide

| id | pergunta | classe | dono |
|---|---|---|---|
| **[Q1]** | **O OI fica na origem (Binance, contratos em BTC) com rótulo honesto, ou troca para agregado multi-exchange em nocional USD como no print?** M7 mede que são **três** termos do `SeriesKey` de uma vez, e `ADR-036/D2` diz *"a origem por padrão; o terceiro só onde a origem é vetada, não existe, ou perde dado sem volta"* — a pergunta real é **se este caso satisfaz esse teste**. §14-C tem as três opções com custo | **BLOQUEANTE** (só de F5; F1–F4 andam sem ela) | **owner**, sob `ADR-036` |
| **[Q2]** | **Qual é a lista de timeframes da barra?** O piloto tem `5m·15m·1h·4h`; o print do alvo está em `1h`. A lista decide §14-B (rota vs. browser) e é entrada de CA-7 | **BLOQUEANTE de F3** | **owner** |
| **[Q3]** | **Quantas velas o owner quer ver em cada TF?** Hoje a janela é **4 dias fixos** derivada do relógio — em `4h` isso é **24 velas**, contra ~18 dias de `1h` no print (`I-4`). ⚠️ E `ADR-036/D2` mediu que `/futures/data/*` **corta em ~30 dias** (`startTime` de −60 d → **HTTP 400**) enquanto `klines` serve desde **2019-09-08**: em TF longo, **a vela terá história e o OI/long-short não** — a assimetria aparece na tela | **BLOQUEANTE de F3** | **owner** |
| **[Q4]** | **A rota vira por símbolo (`/symbol/[symbol]`) agora, ou continua fixa em `BTCUSDT`?** O catálogo já serve **4 símbolos** (`BTCUSDT`/`ETHUSDT`/`LINKUSDT`/`SOLUSDT`) `[MEDIDO 2026-09-19]`, e o owner disse *"vai entrar muita coisa ali ainda"*. **Barata agora, monotonicamente mais cara depois** — é o mesmo argumento que a linha 12 do `CLAUDE.md` já usou para rota | **NÃO-BLOQUEANTE**, mas com custo crescente | **owner** (o **nome** do segmento é de `/architect`, em inglês — `D-e`) |
| **[Q5]** | Qual é o teto de latência de interação do eixo único (RNF-2)? Não existe número declarado neste repositório | **NÃO-BLOQUEANTE** | `/architect` propõe, owner ratifica |
| **[Q6]** | `data-fact` deriva chave de máquina de microcopy pt-BR (M10, `live_preço`). Consertar agora, junto com C-4, ou abrir dívida com dono? | **NÃO-BLOQUEANTE** | `/architect` |
| **[Q7]** | A vela degenerada some no mesmo commit em que a real entra, ou convivem atrás de uma bandeira? (`RN-2`/`G-5`) | **INFERÍVEL** — o `/pm` recomenda **sumir junto** (duas verdades na mesma tela é o defeito que este repositório mais paga) | `/architect` |
| **[Q8]** | O volume continua em `log10` (base 1) quando o TF mudar, ou a escala é redecidida por TF? | **INFERÍVEL** — continua, até prova em contrário | `/architect`/`design_gate` |

---

## 16. Registro da varredura de discovery — o que foi perguntado e o que ficou aberto

| dimensão | estado |
|---|---|
| **stakeholders e consumidores** | `[COBERTO: §1.1 + DISCOVERY §2]` — consumidor é o **owner**, operando. `/symbol` é *"a extensão do piloto"*. Nenhum consumidor de máquina fora do repositório. |
| **volumetria e escala** | `[COBERTO: M1/M9 — 60 entradas, 4 símbolos, 5.760 slots por painel, 1.152 barras nativas de OI]` · `[GAP: profundidade por TF → [Q3]]` |
| **requisitos não-funcionais (latência, frescor)** | frescor `[COBERTO: RNF-1, teto 600.000 ms]` · latência de interação `[GAP: RNF-2/[Q5] — NÃO MEDIDO, sem número declarado]` |
| **estados e casos de borda** | `[COBERTO: RN-1 (ausência ≠ zero), RF-4, RN-4 (escada de `GA-2`), RN-2 (vela degenerada)]` · `[GAP: bucket parcial/em progresso sob TF longo — a vela de `4h` em formação. Herdado de `collector_series_mapping.py` "anti-lookahead cut"; o `/architect` tem de dizer se a vela em progresso aparece]` |
| **contrato e dependências** | `[COBERTO: §9 C-1..C-5; ADR-003/ADR-034/ADR-036; PRD-005 NG-7 mede que não há sobreposição de código com a irmã]` · `[GAP: RN-6, a assimetria painel↔backtest → [Q1]/G-6]` |
| **métricas e observabilidade** | `[COBERTO: os `data-fact` são a instrumentação que já existe — 39 distintos]` · `[GAP: M10, a chave deriva de microcopy → [Q6]]` |
| **escopo e non-goals** | `[COBERTO: §11, 9 non-goals; e as duas alternativas recusadas pelo owner estão nomeadas em §1.1 para não serem reabertas]` |

---

## 17. Gate de handoff — a checklist, conferida

- [x] **cada story tem fronteira clara e cabe numa fase** — F1..F4 são cada uma **um pixel** do
      falsificador (`P1`..`P4`), no espírito do `DoD-VERTICAL`. **F5 é explicitamente condicional** e
      não entra em plano sem `[Q1]`.
- [x] **as regras bloqueantes em vigor são endereçáveis** — `harness rules list --severity block` →
      **8** `[MEDIDO 2026-09-19]`; todas de escopo `code`/`production`, e esta feature escreve código
      em `backend/src` e `frontend/src`. Nenhuma é inendereçável; `CA-11` as cobre via `make verify`.
- [x] **tipos e contratos críticos definidos, ou `TBD` com dono e data** — §9: `C-1`, `C-3`, `C-4` são
      `TBD` com dono nomeado (`/architect`, `frontend-architect`) e data (**o Gap Analysis deste
      PRD**). `C-2` e `C-5` são herdados e não abrem.
- [x] **non-goals escritos** — §11, nove, cada um com motivo.

**Classificação dos gaps (§13):** bloqueantes → `G-1`, `G-2`, `G-6`, **e os três param apenas F3/F5**,
não o PRD ⇒ **não há `feedback_to_pm.md`**, o handoff segue. Não-bloqueantes → `G-3`, `G-4`, em §15.
Inferível → `G-5`, com recomendação escrita em `[Q7]`.

**Próximo passo:** `/architect` — Gap Analysis deste PRD, com §14 (A/B) como a mesa de decisão dele, e
§15 `[Q1]`/`[Q2]`/`[Q3]`/`[Q4]` levadas ao **owner** pelo loop principal.
