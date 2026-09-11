# ADR-036 — Fonte por métrica do CORE: a origem por padrão, o terceiro só onde a origem é vetada, não existe, ou perde dado sem volta

**Data:** 2026-09-10 · **Status:** proposta · **SPEC:** [`SPEC-007`](../specs/SPEC-007-cinco-metricas-do-core.md)
**Fases:** `01`–`05` · **Componentes alvo:** `sentimento` (coletores e catálogo), `infra` (cota, segredo, pegada)
**Co-assinatura necessária:** `quant-architect` na fase `05`, **por fidelidade de `liquidation-history`** (`D6` revisada) — a única série de terceiro que sobra, e a única sem oráculo de comparação
**Revisão:** `D5` reescrita em 2026-09-10 (premissa falsa — ver o bloco de `D5`), com efeito em `D1`, `D2`, `D6`, no falsificador e no DoD
**Origem:** `PRD-007`/`[Q4]`; `docs/context/cinco-metricas-do-core/handoff/MEDICAO-COINALYZE-TEMPO-REAL.md`; `ACHADO-FORCEORDER.md`

## Contexto

As 5 métricas do CORE têm **0 linha** em `md.series` `[MEDIDO 2026-09-10, n=23.512 linhas, todas de
`premiumIndex`; DOC: DIAGNOSTICO.md]`. `[Q4]` pergunta a fonte de cada uma, e o custo de depender de
terceiro para o CORE. Três premissas do owner enquadram a resposta:

- `[PREMISSA-OWNER]` **VPS compartilhada, R2 free tier, só Postgres** ⇒ **veta gigas de aggTrades**.
- `[PREMISSA-OWNER: 2026-09-10]` *"no piloto estamos rodando 4 symbols, quando virar n vamos chegar a 10"*.
- `[PREMISSA-OWNER: 2026-09-10]` *"Nossa operações serão no time de 15min a 4h."*

E um contrato de cota **medido e fechado** (`SPEC-007` §6.1): `custo(requisição) = n_símbolos`,
**independente** de `interval`, de `from`/`to` e do número de buckets devolvidos; teto de **40 unidades
por 60 s**; nenhum sinal de cota em resposta `200`
`[MEDIDO 2026-09-10, 3 rodadas independentes: 40×1, 10×4, e 4 chamadas de 1.800 buckets cada]`.

---

## D1 · A regra: **a origem por padrão; o terceiro só onde a origem é vetada, não existe, ou perde dado de forma irrecuperável**

Três cláusulas, cada uma com pelo menos uma métrica que só ela cobre. A regra não é preferência por
Binance — é **minimizar a superfície de terceiro no CORE**, porque o CORE é o que o owner comprou e um
terceiro sem SLA, sem header de cota e com retenção rasa é risco que só se aceita quando é o único
caminho.

**Alternativa recusada: tudo pela Coinalyze.** É tentador — uma integração, quatro endpoints. Custo que
a recusou: leva **4 endpoints × N** para dentro de uma cota de terceiro e coloca **as 5 métricas do
CORE** atrás de um único ponto de falha externo. Com `D2`–`D5`, a exposição cai para **1 endpoint**, e
**quatro** das cinco métricas continuam de pé se a Coinalyze cair.

**Alternativa recusada: tudo pela Binance.** Recusada por **uma** métrica: a Binance **não tem REST de
liquidação** — só o WebSocket `forceOrder`, e nenhum endpoint em `/futures/data/`
`[MEDIDO 2026-09-10, DOC: ACHADO-KLINES-CVD.md §5]`.
⚠️ **A primeira versão desta ADR recusava esta alternativa pelo motivo errado** — dizia que o CVD
exigiria aggTrades. `D5` mostra que não exige. A alternativa continua recusada, mas por M4, não por M5,
e a diferença importa: ela reduz a exposição a terceiro de 2 métricas para 1.

## D2 · Volume (M1) e Open Interest (M2): **Binance, a origem**

Volume é `[DECISÃO-OWNER: 2026-09-10]` (`D1.b`): `/fapi/v1/klines`, REST, sem WebSocket, sem agregação
de tick. OI é `/futures/data/openInterestHist`, e a grade de **`5m`** que o catálogo já declara
(`open_interest_catalog.py:53,67`) é o **teto da própria Binance** — a Coinalyze oferece `1min`, mas
uma granularidade que a origem não publica é interpolação de terceiro, não medição.

**Custo declarado — cota:** Binance `/futures/data/` tem limites próprios, **`[NÃO MEDIDO]` neste
repositório**. O teto de peso por IP do `fapi` é **2.400/min** e uma chamada de 1.500 velas de `klines`
custa **weight 1** `[MEDIDO 2026-09-10: sequência 31→32→33]` — ordens de grandeza acima do que `N = 10`
a cada 5 min consome. ⇒ **medir o limite real de `/futures/data/` é item das fases que o usam**, não
premissa.

⚠️ **Custo declarado — profundidade, e ele é novo:** `/futures/data/*` **corta em ~30 dias** —
`startTime` de −60 d devolve **HTTP 400** `[MEDIDO 2026-09-10, DOC: ACHADO-KLINES-CVD.md §5]`.
Profundidade **boa para operar** a `15min .. 4h`, **insuficiente para backtest longo** de M2 e M3.
Contraste medido: `klines` (M1/M5) serve desde **2019-09-08**. ⇒ **as cinco métricas do CORE não têm a
mesma profundidade de história**, e quando `backtest` abrir (`NG-8`) essa assimetria é entrada de
desenho, não descoberta. Registrado aqui para não virar surpresa naquele componente.

## D3 · Long/short (M3): **Binance, a origem — e o teto de `5min` não é da Coinalyze**

`MEDICAO` §2.2 mediu que `long-short-ratio-history` a `1min` devolve **vazio, não erro** (`n = 0`,
janela de 7 d), e a grade mais fina real é **`5min`** (`n = 2.006`, defasagem 134 s), com
`[INFERRED: o limite é da Binance]`. Ir à origem **testa** essa inferência em vez de herdá-la.

**E `5min` não é concessão sob o timeframe declarado:** são **3 pontos por candle de 15 min** e **48
por candle de 4 h`**. `SPEC-007` §8.5 escreve `5min` no DoD daquela fatia sem tratá-lo como perda.

⚠️ **M3 não é uma série.** `FORBIDDEN_METRIC_NAMES` (`series_key.py:67`) recusa `ls_ratio` porque o nome
genérico cobre **quatro** séries com autocorrelação diferente — **0,99+ para três, 0,0955 para a
quarta** `[DOC: series_key.py:60-62, CA-F2-3]`. A escolha e seu falsificador estão em `SPEC-007` §4.2.

## D4 · Liquidações (M4): **Coinalyze `liquidation-history` como fonte PRIMÁRIA**; o `!forceOrder@arr` sai do caminho crítico

Esta é a decisão que **diverge de `PRD-007`/`DEF-2`**, que colocava o conserto do socket *dentro* da
fatia. O argumento que a inverteu **não é cota** — é **recuperabilidade**, e ela decorre do contrato de
cota medido:

> Como o custo de uma requisição **independe da janela pedida**, um coletor REST que ficou 3 h fora
> recupera tudo em **UMA requisição por símbolo-endpoint**. O `!forceOrder@arr` ficou **~46 h** mudo e,
> sendo WebSocket, **aquele dado está perdido para sempre** `[DOC: ACHADO-FORCEORDER.md, n=2 runs,
> janela 2026-09-08T22:08 → 2026-09-10T19:53]`.

⇒ **Fonte REST de janela grátis transforma queda de coletor em atraso recuperável; WebSocket a
transforma em buraco permanente.** Para o CORE — o que o owner olha na tela — a primeira propriedade
vale mais que a segunda perde.

**O que se perde, declarado:** granularidade de evento individual. Sob
`[PREMISSA-OWNER]` *"15min a 4h"*, liquidação agregada em bucket de 1 min está **15 níveis abaixo** da
menor unidade de decisão — mesmo argumento de `D5`. E a recuperação **para na retenção da origem**:
horas e poucos dias, **não** semanas (`SPEC-007` §9.2).

**O que acontece com o `!forceOrder@arr`:** **nada, nesta feature.** Ele continua como está, gravando
`REJECTED`. **Dono:** `plataforma-dados`, via `T-07.11`
(`docs/context/plataforma-dados/tasks.toml:1161`, hoje `blocked`). **Gatilho de reabertura, literal:**
quando alguma consumidora exigir liquidação **por evento** em vez de por bucket — o que, sob o
timeframe declarado, é `backtest`/`convergencia` (`NG-8`), não esta feature.

**Alternativas recusadas:**

| alternativa | custo que a recusou |
|---|---|
| **consertar o socket dentro da fatia** (o que o PRD decidiu) | custo **desconhecido** — pode ser 1 h ou uma fonte indisponível (`PRD-007` §8/`DEF-2`). Põe a entrega da métrica atrás de um diagnóstico sem teto, que é o risco que `[Q3]` levantou |
| **Coinalyze só como testemunha, socket primário** | mantém a entrega atrás do conserto; a testemunha vira ferramenta de diagnóstico e não caminho de entrega. Metade do benefício, todo o risco |
| **desligar o `!forceOrder@arr` agora** | é ato de operação sobre um coletor de outra feature, sem gate desta. Fora de escopo — e um coletor parado que **ninguém decidiu parar** é pior que um parado com dono declarado |

⚠️ **Custo aceito e visível:** um coletor morto permanece de pé consumindo conexão, com veredito
`REJECTED` no painel, sem data de conserto **dentro desta feature**. Isso é dívida com dono e gatilho —
não dívida silenciosa.

## D5 · CVD (M5): **Binance `/fapi/v1/klines`, `delta = 2·takerBuyBaseVol − volume`** — mesma resposta que o volume

> ⛔ **`D5` foi REVISADA em 2026-09-10, no mesmo dia em que nasceu, porque a versão anterior tinha
> premissa FALSA.** Ela decidia CVD pela Coinalyze afirmando ser *"a única métrica cuja origem está
> vetada"*, porque CVD pela Binance exigiria **aggTrades**. **Não exige.** A versão anterior está
> retirada, não corrigida em silêncio — ela é o exemplo do que `D1` proíbe, escrito pela mesma ADR que
> escreveu `D1`.

`/fapi/v1/klines` devolve **`takerBuyBaseVol` no índice `[9]`** do array, ao lado de `volume` no `[5]`:

```
delta_cvd = takerBuy − (volume − takerBuy) = 2 · takerBuyBaseVol − volume
```

`[MEDIDO 2026-09-10, BTCUSDT 1m]` — `v = 29,757` · `takerBuy = 2,626` · `takerSell = 27,131` ·
`delta = −24,505` `[DOC: ACHADO-KLINES-CVD.md §1]`.

**É a mesma aritmética que `2·bv − v`, e a medição mostra que é o mesmo número.** Cruzamento
Coinalyze × Binance no mesmo bucket `[MEDIDO 2026-09-10, BTCUSDT, 2 h, n=120 buckets de 1 min comuns]`:

| campo | mediana | p95 | p99 | máx | **zero exato** |
|---|---:|---:|---:|---:|---:|
| `volume` (`v` × `[5]`) | 0,00 bp | 2,27 bp | 389,63 bp | 566,00 bp | 104/120 |
| `takerBuy` (`bv` × `[9]`) | **0,00 bp** | **0,00 bp** | 1,00 bp | **38,52 bp** | **116/120** |

⇒ **O `bv` da Coinalyze é o `takerBuyBaseVol` da Binance.** Buscá-lo na Coinalyze é acrescentar **um
salto, uma cota e um terceiro para receber de volta o dado da origem** — exatamente o que `D1` proíbe.

**Consequências, e são quatro:**

1. **`[P-infra]` deixa de morder o CVD por completo.** Não é que aggTrades foi contornado por um
   terceiro: é que **nunca foi necessário**. `RNF-1` fica satisfeito na origem — 1 linha por bucket por
   símbolo.
2. **M1 e M5 saem da MESMA resposta.** A fase que constrói o cliente de `klines` entrega volume; a
   seguinte lê **mais um índice do mesmo array**. Zero integração nova (`SPEC-007` §3.1, reordenada).
3. **A lacuna de história profunda fecha para preço/volume/CVD.** `klines` serve BTCUSDT desde
   **2019-09-08**, com **weight 1** por 1.500 velas contra teto de **2.400/min** por IP
   `[MEDIDO 2026-09-10: sequência de weight 31→32→33]`. `SPEC-007` §9.2 declarava essa fonte como
   **não nomeada**; para estas três séries, agora está nomeada.
4. **A exposição a terceiro no CORE cai para UMA métrica** (M4), e isso tem um custo novo que `D6`
   registra.

**O CVD de bucket de 1 min continua servindo, e quem decide continua sendo o timeframe:** 15 buckets
por candle de 15 min, 240 por candle de 4 h. **Sem escalonamento por granularidade.**

### D5.a · Manter a Coinalyze como **segunda testemunha** do CVD: **recusado**

**O argumento que recusa:** uma testemunha que concorda **exatamente em 116 de 120 buckets** não é
independente — ela não acrescenta informação sobre correção, só sobre concordância. Pagar uma
integração, uma cota e um terceiro por um número que já se tem é o custo sem o benefício.

**Falsificador de `D5.a`:** se a divergência de `takerBuy` sair da cauda medida (máx 38,52 bp,
p95 = 0) em produção sobre um universo maior — `n ≥ 1.000` buckets, `≥ 4` símbolos — a independência
volta a valer alguma coisa e `D5.a` deve ser reaberta. **`D5.a` só está certa enquanto as duas fontes
forem indistinguíveis.**

## D6 · O que resta da questão de fidelidade da Coinalyze — e o oráculo que `D5` acaba de remover

**A cauda do `bv` sai do caminho crítico.** `docs/medicao-coinalyze.md` §4 (p99 = 29 bp,
máx = 1.956 bp, contra o **dump canônico S3**) e a medição de `ACHADO-KLINES-CVD.md` (contra o **REST
da Binance**, n=120, 1 símbolo, 2 h) são **corpora e referências diferentes** — a segunda **não refuta**
a primeira, e nenhuma das duas é grande. O que muda não é a verdade delas: é a **relevância**. Com o
CVD vindo da origem, ninguém depende do `bv` para o CORE.

⚠️ **Mas `D5` cria um custo que a versão anterior não tinha, e ele é o oposto do que parece:** enquanto
o CVD vinha da Coinalyze, o volume da Binance servia de **oráculo grátis** sobre ela, no mesmo bucket.
Tirando o CVD, **a única superfície Coinalyze restante é M4 (liquidações) — e ela não tem oráculo
nenhum**, porque a Binance **não tem REST de liquidação** e o `!forceOrder@arr`, que seria a única
fonte de comparação, é justamente o que `D4` tirou do caminho crítico.

⇒ **`D6` (revisada): a fase `05` escala ao `quant-architect` a fidelidade de `liquidation-history`, não
a do `bv`.** É a superfície que sobrou sem testemunha, e o `!forceOrder@arr` — mesmo morto — é a única
comparação possível. **`RS-5`** (rótulo de reconstrução com `published_error`) continua valendo para
qualquer série da Coinalyze que chegue à tela.

**Questão em aberto, declarada e não diagnosticada:** a divergência de **volume** (`v` × `[5]`:
máx 566 bp, 104/120 exatos) é **maior** que a de `takerBuy` (máx 38,52 bp, 116/120) — o que é
estranho, já que um bucket que concorda num campo deveria concordar no outro. **`[NÃO SEI]` a causa.**
Deixa de ser risco do CORE (não usamos mais nem `v` nem `bv` da Coinalyze) e vira sinal de que o
alinhamento de bucket da Coinalyze merece diagnóstico **antes** de M4 depender dela — o que é
literalmente o escalonamento de `D6` acima.

---

## O que esta ADR faz com a exposição a terceiro

| | antes (hipótese "tudo Coinalyze") | `D1`–`D5` na 1ª versão | **`D5` revisada** |
|---|---|---|---|
| endpoints de terceiro | 4 | 2 | **1** |
| métricas do CORE atrás de terceiro | 5 de 5 | 2 de 5 | **1 de 5** (M4) |
| cota a `N = 10`, cadência 5 min | 8 u/min (20%) | 4 u/min (10%) | **2 u/min (5%)** |
| métricas que sobrevivem à queda da Coinalyze | 0 | 3 | **4** |
| séries de terceiro **com oráculo** de comparação | — | 1 de 2 (CVD × volume Binance) | **0 de 1** ⇒ `D6` |

`[MEDIDO 2026-09-10 para o teto e a linearidade; a projeção por cenário é aritmética sobre esses números]`

## Falsificador desta ADR

**A observação que mostra que `D1` estava errada:** **se as 4 métricas de origem Binance (M1, M2, M3,
M5) acumularem mais incidentes de coleta do que a única de origem Coinalyze (M4)** ao longo de uma
janela de 30 dias, a premissa *"a origem é mais confiável"* está falsificada e `D1` deve ser reaberta
em favor da integração única.

**Como medir, e o universo:** `GET /api/v1/collector-status`, contando runs com veredito `REJECTED` por
`source`, sobre 30 dias, `n ≥ 5` séries. **Hoje o número não existe** — há 2 séries de coletor
declaradas e nenhuma do CORE `[MEDIDO 2026-09-10, n=2]`.

**⚠️ O falsificador que esta ADR já pagou uma vez, e a lição fica escrita:** a primeira versão de `D5`
afirmou *"a origem está vetada"* **sem ter lido o payload da origem** — bastavam os índices `[5]` e
`[9]` de `/fapi/v1/klines`. O erro sobreviveu à redação de `D1`, que é a regra que ele viola. ⇒
**nenhuma decisão de fonte desta ADR vale sem o payload da origem lido e citado por índice/campo.**
Isso é DoD, item 6.

**Falsificador de `D4`, separado e mais barato:** se a retenção da Coinalyze para
`liquidation-history` for **menor** do que o tempo médio de detecção de um coletor caído, a
recuperabilidade que justificou `D4` é teórica. ⇒ a fase `05` mede as duas coisas: retenção real do
endpoint, e o tempo entre a queda e o alarme de `T-07.11`.

## DoD desta ADR

1. Cada uma das 5 métricas tem **exatamente uma** fonte primária declarada em catálogo, e o
   `series_key.provider` da entrada **bate** com a fonte desta ADR — teste que compara as duas listas,
   universo `n = 5`.
2. O contador de cota do coletor Coinalyze **recusa** ultrapassar 40 unidades/60 s, provado por teste
   com fonte injetada; e as requisições de um ciclo são **espalhadas**, não em rajada
   (`SPEC-007`/`RS-3.6`). Universo: fase `05`, o único consumidor Coinalyze.
3. Fase de CVD: `delta_cvd = 2·takerBuyBaseVol − volume` calculado sobre os índices `[9]` e `[5]` da
   **mesma resposta** que serviu M1, com a sanidade `takerBuy ≤ volume` como invariante testada.
4. Fase `05`: retenção real de `liquidation-history` medida, com o comando e o `n`; e a fidelidade
   escalada ao `quant-architect` (`D6`), por ser a única série de terceiro **sem oráculo**.
5. Profundidade declarada por métrica no gate da fase que a entrega — `klines` desde 2019-09-08,
   `/futures/data/*` ~30 dias `[MEDIDO 2026-09-10]`, Coinalyze ~1,5 dia a 1 min.
6. **Toda decisão de fonte cita o payload da origem por índice/campo, medido.** É o item que a primeira
   versão de `D5` teria reprovado.
7. `make verify` verde em cada fase.
