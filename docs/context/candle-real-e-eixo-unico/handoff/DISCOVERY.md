# `candle-real-e-eixo-unico` — discovery medido, entrada do `/pm`

> Escrito pelo loop principal em 2026-09-19, ANTES do despacho do `pm` (R2 do
> [`protocolo-de-despacho.md`](../../../protocolo-de-despacho.md): contexto longo vai para o
> handoff, o prompt de despacho cita o caminho).
>
> **Feature filha de `plataforma-dados`.** Componente primário `web`; toca `sentimento`
> (ingestão) e `charts` (composição de painel).

---

## 1. A fala do owner — literal, na grafia dele

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

**Escopo, escolhido pelo owner entre três alternativas apresentadas com o custo de cada uma:**
`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **"dados + eixo único"**:
ingerir o que falta para a tela existir (série OHLC de candle; decidir o alvo do OI) **e** unificar
os painéis num eixo de tempo só, com TF dos indicadores = TF do candle e seletor de TF. **SMC
(BMS/CHoCH/OB) fica FORA desta feature** — é o "daí começar a estruturar a tela" da fala acima.

As duas recusadas, para o `/pm` não as reabrir sem motivo novo: *(a)* só front (eixo + TF, sem
tocar ingestão) — entrega rápido e a tela continua não se parecendo com o alvo; *(b)* tudo isso
**mais** paridade com o piloto (fractal N, k-ATR, camadas, BMS/CHoCH/OB) — contraria o próprio
faseamento que o owner declarou.

## 2. As três referências visuais que o owner anexou

| arquivo | o que é |
|---|---|
| [`referencia/alvo-coinalyze-tradingview.png`](referencia/alvo-coinalyze-tradingview.png) | **O ALVO.** TradingView/Coinalyze, BTC/USDT Perp 1h Binance. Candles + VPVR, e 5 sub-painéis: Aggregated Liquidations (COIN-margined), Aggregated Open Interest (STABLECOIN+COIN-margined, **27.656B**), Long/Short Positions Ratio Top Traders (2.033), Funding Rate (0.0100), Aggregated CVD Spot (−15.108K). **Todos no mesmo eixo de tempo do candle.** |
| [`referencia/piloto-q11-marcador.png`](referencia/piloto-q11-marcador.png) | **O PILOTO** (`scripts/pilot-swing-marker/out/marcador.html`, **não versionado**, build 2026-09-02, dados 2026-08-16→2026-08-23). Barra de config: `TF 5m·15m·1h·4h` · `N 2·3·5·10·20` · `k-ATR 0.5·1·1.5·2` · `camada swings/order blocks`. Linha de proveniência legível: *"fractal · N=10 · 1h · empate estrito · pavio · klines_last · latência 600 min · rompimento por FECHAMENTO · OB k=1×ATR14 · 192 barras de 1h · ✓ calibrado (owner 2026-09-02, a olho)"*. |
| [`referencia/symbol-hoje-anotado-pelo-owner.png`](referencia/symbol-hoje-anotado-pelo-owner.png) | **O QUE TEMOS**, com as anotações do owner: `CANDLE?` em vermelho sobre o painel de Preço vazio, e um círculo vermelho sobre o Open Interest. |

## 3. As quatro medições — o comando, o universo, o rótulo

Ambiente: stack de produção de pé em Docker (`deploy-web-1` :3000, `deploy-api-1` :8000,
`deploy-collector-1`, `deploy-writer-1`, `deploy-postgres-1`, `deploy-redis-1`),
`/symbol` → `200`, dado fresco (`data-freshness-age-ms="240000"`, teto 600.000).

### 3.1 O OI não está errado — mede OUTRA GRANDEZA, sobre OUTRO UNIVERSO, em OUTRA UNIDADE

```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog   # n_entries=60; 15 delas BTCUSDT
```

| | `/symbol` hoje | o alvo do print |
|---|---|---|
| grandeza | contratos em **BTC** (`unit=BTC`, `denom=base`) | **nocional em USD** (27,656 B) |
| universo | **Binance só**, USDT-margined | **agregado** multi-exchange |
| coorte | USDT-margined | **STABLECOIN + COIN-margined** |

`[MEDIDO 2026-09-19, n=15 entradas de BTCUSDT no catálogo]`. O seletor é literal em
`frontend/src/app/symbol/view-model.ts:527-531`: `OPEN_INTEREST_PROVIDER = "binance"`, com o
comentário *"The ORIGIN, not the third party — `ADR-036/D2`"*, e `OPEN_INTEREST_REDUCTION =
"POINT"`.

Ordem de grandeza: 108.135,34 BTC × ~81,5k USD ≈ **8,8 B USD** contra **27,656 B**, razão ~3,1×
`[INFERRED: o preço 81.546,80 saiu do print do owner, não da nossa API — a nossa está SEM_PONTO,
ver §3.2]`.

> ⛔ **Isto é o achado que muda a natureza do trabalho:** aproximar do Coinalyze **não é consertar
> bug**, é **trocar de grandeza e de universo**, e colide de frente com `ADR-036/D2` ("a origem por
> padrão; o terceiro só onde a origem é vetada, não existe, ou perde dado sem volta"). O `/pm` tem
> de apresentar isso como alternativas com custo (cota da Coinalyze, exposição a terceiro,
> recuperabilidade), **não** como conserto. Quem decide agregação vs. origem é `ADR-036`.

**Pergunta lateral, já respondida e contraintuitiva:** o catálogo **tem** OHLC de OI (4 linhas
Coinalyze: `OPEN`/`HIGH`/`LOW`/`CLOSE`) e o painel **descarta as quatro** de propósito
(`T-03.5`/`ADR-036/D2`). Ou seja, o dado que falta no preço **sobra** no OI.

### 3.2 O `CANDLE?` tem resposta seca: NÃO EXISTE SÉRIE OHLC DE PREÇO NO CATÁLOGO

As 15 entradas de BTCUSDT trazem preço só como **escalar**:

| métrica | interval | unit | nature | reduction | grid nativo | provider |
|---|---|---|---|---|---|---|
| `klines_last` | `5m` | USDT | STOCK | **LAST** | 5min | binance |
| `price_mark_close` | `5m` | USDT | STOCK | **CLOSE** | 5min | binance |

`[MEDIDO 2026-09-19, mesmo comando de §3.1]`. **A vela não some no render — ela nunca foi
ingerida.** E a leitura atual do preço está ausente: `data-fact="price_last_reading:absent"`
(SEM_PONTO) com `data-fact="price_slots:5760"`, enquanto volume e CVD têm `5411` pontos presentes
`[MEDIDO 2026-09-19: curl da página + grep dos data-fact]`.

⚠️ Isto é a confirmação de `GA-1` (`docs/INDEX.md:255`): `build_klines_last_entry` é a série de
**PREÇO** com `reduction=LAST` — um escalar por bucket, não uma tupla OHLC.

### 3.3 "Arrastar uma parte e tudo não andar junto" é ESTRUTURAL

```bash
grep -c "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx          # 6
grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*' \
  | grep -v headless | grep -v s2-headless                                       # 0 linhas
```

`SymbolClient.tsx:433` chama `createChart` dentro de `useLightweightChart`, invocado **6×** — são
**seis gráficos independentes**, cada um com `chart.timeScale().fitContent()` próprio
(`:435`). **Nada assina mudança de range de ninguém** `[MEDIDO 2026-09-19]`. Os 6 painéis:
Preço (+ Volume como sub-eixo), Open Interest, CVD, Long/short, Liquidações.

⇒ O requisito do owner ("devem caminhar e respeitar a tela principal do candle") **não é
regulagem de opção** — é passar de N gráficos autônomos para um eixo de tempo mestre. Decisão
estrutural sob `frontend/src/` ⇒ **dono do julgamento é o `frontend-architect`**, e a fronteira
`charts`↔`web` está em `ADR-003`/`ADR-034/D8`.

### 3.4 Não existe seletor de TF nem de símbolo, e as grades nativas são MISTAS

`/symbol` é rota **fixa em BTCUSDT**, janela de 4 dias derivada do relógio da requisição
(`request-window.ts::resolveRouteWindow`) — sem TF, sem símbolo. O piloto tem
`TF 5m·15m·1h·4h` + `N` + `k-ATR` + camada.

| grade nativa | séries |
|---|---|
| **5min** | `klines_last`, `price_mark_close`, `sum_open_interest`, `count_long_short_ratio` |
| **1min** | `klines_volume`, `cvd_source`, `sum_liquidation` |

E tudo é servido numa grade de 1 min: o OI publica `data-oi-wire-points="5760"` para
`data-oi-native-bars="1152"` — **cada barra nativa repetida 5×** `[MEDIDO 2026-09-19, grep dos
data-* na página]`. Isto é `GA-2` (`docs/INDEX.md:255`): a rota não reagrega, caminha a grade de
1 min chamando `as_of` com `max_staleness_ms`.

⇒ "todos indicadores no tempo gráfico dos candles" exige decidir **onde** a reagregação acontece
(API ou browser) e o que fazer com `FLOW` vs `STOCK` (somar volume ≠ repetir OI). `ADR-034/D6`
declara `SUPPORTED_INTERVAL` de `1m` na rota `series-history`.

## 4. O que já está escrito e o `/pm` NÃO deve reabrir

- **`ADR-036/D2`** — origem por padrão, terceiro só onde a origem é vetada. Dona da pergunta do OI
  agregado. Reabrir é ato daquela ADR.
- **`ADR-034/D6`/`D8`** — `SUPPORTED_INTERVAL = 1m` na rota, e o barril `charts`↔`web`.
- **`ADR-003`** — `web` não alarga a composição de painel de `charts` por conta própria.
- **Linha 12 da tabela de fronteira do `CLAUDE.md`** — rota nova nasce **em inglês**
  (`[PREMISSA-OWNER: 2026-09-08]`), e `/painel` migra. Se esta feature criar rota por símbolo
  (`/symbol/[symbol]`), o nome do segmento é decisão de `/architect`/`frontend-architect`.
- **`[P-seed]`** — proibido semear dado sintético no Postgres compartilhado; backfill lido da
  origem **não** é dado de teste.
- **Sem mobile no piloto** `[PREMISSA-OWNER: 2026-09-11]`.

## 5. Interações com o que está aberto no pipeline

- **`coinalyze-fora-da-quarentena`** — filha de `plataforma-dados`, em `SPEC_APPROVED` aguardando
  `/tech-lead`. **É a mesma fonte** que a pergunta do OI agregado puxa. O `/pm` tem de ler a SPEC
  dela antes de propor qualquer coisa que dependa da Coinalyze, sob pena de duas verdades.
- **`plataforma-dados` fase `07`** — QA `APPROVED` com `T-07.15`/`T-07.16`/`T-07.17` em aberto no
  `tasks.toml`; o dashboard já acusa a contradição.
- `harness doctor` → **CONFORME (12 checagens)**, v0.13.0 fixada `[MEDIDO 2026-09-19]`.

## 6. O falsificador desta feature, para o `/pm` herdar

O `DoD-VERTICAL` desta casa diz que fase = uma métrica até o pixel. Aqui o pixel tem nome:

1. **candle**: o painel de Preço desenha corpo e pavio de vela, e `price_last_reading` deixa de ser
   `absent` — hoje `SEM_PONTO` com `price_slots:5760`;
2. **eixo**: arrastar/zoom no painel de Preço move os outros cinco no mesmo instante — hoje
   `0 linhas` de `subscribeVisibleLogicalRangeChange`;
3. **timeframe**: trocar o TF na barra reagrega **todos** os painéis para o mesmo TF — hoje não há
   barra, e o OI repete cada barra 5×;
4. **OI**: o número na tela e o rótulo dizem a mesma coisa que a fonte declara (grandeza, universo,
   coorte), qualquer que seja a decisão de `ADR-036`.

⚠️ Os quatro são de **pixel**, e `Assert de DOM não prova pixel` já mordeu aqui: exigir ablação, não
só atributo presente.
