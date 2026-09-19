# `candle-real-e-eixo-unico` — handoff do `/pm` para o `/architect`

**PRD:** [`docs/specs/PRD-008-candle-real-e-eixo-unico.md`](../../specs/PRD-008-candle-real-e-eixo-unico.md)
**Estado do ledger:** `PRD_DRAFT` (avançado por este `/pm` em 2026-09-19)
**Componente primário:** `web` · **toca:** `sentimento`, `charts`
**Discovery de entrada:** [`handoff/DISCOVERY.md`](handoff/DISCOVERY.md) · prints em [`handoff/referencia/`](handoff/referencia/)

---

## 1. O que você precisa saber antes de abrir o PRD

O discovery entregou quatro medições. O `/pm` **re-rodou todas** e **duas mudaram de natureza**.
Estas duas correções são o que mais muda o seu trabalho:

### ⭐ Correção 1 — o preço não é "vela faltando", é **série sem escritor**

`build_klines_last_entry` tem **um** consumidor: `use_cases/series_catalog.py`, a rota do catálogo.
`collector_series_mapping.py` cita `klines_last` **uma vez, num comentário (linha 154)**, e não o
produz. `[MEDIDO 2026-09-19: grep -rn "build_klines_last_entry" backend/src --include='*.py';
grep -rn "price_source_catalog import" backend/src; grep -c "klines_last"
backend/src/modules/sentimento/use_cases/collector_series_mapping.py]`

⇒ o `CANDLE?` do owner não é o pavio faltando. É **o preço inteiro** que nunca foi escrito — daí
`data-fact="price_last_reading:absent"` com `price_slots:5760` e **sem** `price_readable_horizon`,
enquanto volume e CVD publicam `5412/5760`.

**E o front já desenha vela.** `SymbolClient.tsx:821-823` cria uma `CandlestickSeries` real;
`view-model.ts::rawCandlesFromHistoryRows` a alimenta com `{open: close, high: close, low: close,
close, volume: 0}` — **vela degenerada, documentada e deliberada** (`view-model.ts:30-38` cita
`SPEC-006 §5.2`/`I-1`). Não há geometria nova de `charts` a construir para F1; há um **contrato** a
trocar. Ver `RN-2` e `[Q7]`: a degenerada e a real **não podem coexistir**.

### ⭐ Correção 2 — a vela **não custa cota nova**, e o schema **já sabe carregar OHLC**

`binance_klines_client.py:49-53` declara `KLINE_FIELD_NAMES` com `open`/`high`/`low`/`close`, e os
índices nomeados são **4**: `OPEN_TIME`, `VOLUME`, `CLOSE_TIME`, `TAKER_BUY_BASE_VOLUME`. **Nenhum**
para `[1..4]`. `[MEDIDO 2026-09-19: grep -n "_INDEX: Final" …/binance_klines_client.py]` ⇒ o payload
que o coletor de `klines_volume` **já paga** carrega os quatro números; eles são descartados antes do
domínio.

E `sum_open_interest` da Coinalyze **já existe como 4 linhas** (`OPEN`/`HIGH`/`LOW`/`CLOSE`,
`tsConvention=OHLC_OVER_BUCKET`) sobre a mesma coluna `value_raw` `[MEDIDO 2026-09-19, n=4]`.
⇒ **`SPEC-006 §5.2`/`I-1` não precisa ser falsificada** para haver vela. É **alternativa**, não
decisão do `/pm` — §14-A do PRD traz A1/A2/A3 com o custo de cada uma.

---

## 2. As três decisões que são **suas**, e o PRD não tomou

| # | decisão | onde está o menu | por que não é do `/pm` |
|---|---|---|---|
| **A** | A forma da vela: 4 séries `Reduction` (A1) · colunas OHLC (A2) · tupla em `value_raw` (A3) | `PRD-008 §14-A` | é contrato de schema e de `SeriesKey`; A2 falsifica `SPEC-006/I-1` explicitamente |
| **B** | Onde mora a reagregação por TF: rota (B1) · browser (B2) · híbrido (B3) | `PRD-008 §14-B` | B1 **reabre `ADR-034/D6`** (`SUPPORTED_INTERVAL = "1m"`, `series_history.py:48,180-183` `[MEDIDO]`); a reabertura é ato daquela ADR |
| **C** | A interface do eixo mestre `charts`↔`web` (quem é dono do range, quem assina) | `PRD-008 §9/C-3` | **é do `frontend-architect`**, não sua — `ADR-003`/`ADR-034/D8`. Delegue |

⚠️ **O que NÃO é seu:** `[Q1]` (OI: origem vs. agregado) é do **owner, sob `ADR-036/D2`**. O PRD
apresenta três opções com custo (§14-C) e **não escolhe**. `[Q2]`/`[Q3]` (lista de TFs, profundidade
por TF) também são do owner — sem elas **F3 não tem critério de aceite**.

---

## 3. O que já está medido e você não precisa remedir

| fato | número | comando |
|---|---|---|
| catálogo | `n_entries=60`, **15** de BTCUSDT; **todas** com `aggregationScope="Symbol"`; todo OI `unit=BTC, denom=base` | `curl -s http://127.0.0.1:8000/api/v1/series-catalog` |
| preço no catálogo | só escalar: `klines_last` (`5m`,`LAST`) e `price_mark_close` (`5m`,`CLOSE`) — **zero** OHLC de preço | idem |
| gráficos | **6** independentes | `grep -c "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx` |
| sincronismo | **0 linhas** em todo `frontend/src` (inclusive headless) | `grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*'` |
| rota | `SUPPORTED_INTERVAL = "1m"`, e `:180-183` recusa outro | `grep -rn "SUPPORTED_INTERVAL" backend/src --include='*.py'` |
| escada de `GA-2` | `data-oi-wire-points="5760"` para `data-oi-native-bars="1152"` — **5×** | `curl -s http://127.0.0.1:3000/symbol \| grep -o 'data-oi-[a-z-]*="[^"]*"'` |
| regras bloqueantes | **8** | `harness rules list --severity block` |

**Achado lateral, para você decidir se vira dívida ou conserto** (`[Q6]`/`G-4`): `SymbolClient.tsx:2192`
monta `data-fact={\`live_${label}:…\`}` a partir do **rótulo visível** — a página publica
`data-fact="live_preço:attempted"`, **com acento**. Uma chave de contrato legível por máquina derivada
de microcopy pt-BR: trocar o rótulo muda a chave que o QA asserta, em silêncio. O contrato novo de
`C-4` (rótulo de proveniência do OI, `RF-8`) **não pode repetir isso**.

---

## 4. Fronteiras que o PRD declarou e pede que a SPEC honre

- **SMC está FORA** (`NG-1`) — `[DECISÃO-OWNER: 2026-09-19]`. VPVR (`NG-2`) e funding (`NG-3`) também.
- **`PRD-005`/`SPEC-005` (`SPEC_APPROVED`) não é tocada** (`NG-4`/`D-j`). `PRD-005 NG-7` já diz que
  nada de `web`/`charts` muda lá ⇒ **não há sobreposição de código**. A sobreposição é de **fonte**, e
  ela só aparece se `[Q1]` escolher C2 — aí vale `RN-6`: a série apareceria na tela e ficaria invisível
  ao `backtest` até `PRD-005` F1/F2 entregarem. **Duas verdades sobre a mesma métrica.**
- **Rota nova nasce em inglês** (linha 12 do `CLAUDE.md`, `[PREMISSA-OWNER: 2026-09-08]`). Se `[Q4]`
  criar `/symbol/[symbol]`, o **nome do segmento é seu** (ou do `frontend-architect`).
- **`[P-seed]`**: nada de OHLC sintético no Postgres compartilhado. Backfill lido da origem não é
  dado de teste.

---

## 5. O falsificador que a SPEC herda — e ele é de **pixel**

`P1` vela com corpo e pavio · `P2` pan no preço move os cinco · `P3` TF reagrega todos · `P4` o rótulo
do OI soletra grandeza·universo·coorte. **Baseline de cada um medida no PRD §2.**

⛔ `Assert de DOM não prova pixel` já mordeu neste repositório: `CA-4` e `CA-6` exigem **ablação**
(remover a causa tem de apagar o pixel), e `CA-6` exige **Playwright contra o app real**, com assert de
posição — nunca só status HTTP. `CA-5` morde nos **dois** sentidos: `0` assinaturas é o defeito de hoje,
e `6` assinaturas independentes é o mesmo defeito com outro nome.

---

## 6. Peer review que o `/pm` pede de você

1. **A2 falsifica `SPEC-006/I-1`** — se você escolher A2, diga-o explicitamente e escreva o plano de
   migração; `I-1` tem falsificador declarado (*"se falso, F0 refeita com colunas extras"*) e ele
   **dispara**, não passa em silêncio.
2. **B1 reabre `ADR-034/D6`** — se escolher B1, a SPEC tem de dizer que reabre, não presumir.
3. **`RN-3`** (reagregação: `FLOW` soma, `STOCK` último, `RATIO` nunca) precisa existir **num lugar só**
   (`RF-7`), com teste diferencial (`CA-8`). Duas implementações — uma em Python, outra em TS — é o
   modo de falha que B2 compra.
4. **`I-3`**: a vela vem de `klines`, não de `price_mark_close`. O motivo está medido em
   `price_source_catalog.py:166-170` (mark price subamostrado, `count=300`/bucket contra média de
   **11.245** trades/bucket, *"extremos subamostrados por construção"*) — se você discordar, o custo é
   **silencioso**: pavio encurtado que ninguém vê.
5. **F5 não entra em plano** enquanto `[Q1]` estiver aberta.
