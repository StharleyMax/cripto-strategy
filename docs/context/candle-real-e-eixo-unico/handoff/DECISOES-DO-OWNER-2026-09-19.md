# `candle-real-e-eixo-unico` — as respostas do owner às 4 perguntas do `/pm`

> Registradas pelo loop principal em 2026-09-19, **depois** do `PRD-008` e **antes** do
> `/architect`. Entrada de primeira classe da mesa de decisão dele, junto com
> [`DISCOVERY.md`](DISCOVERY.md) e o próprio `PRD-008`.
>
> ⚠️ **Os dois rótulos de owner não são o mesmo ato** (`CLAUDE.md`): `[PREMISSA-OWNER]` = ele
> *disse*, na grafia dele; `[DECISÃO-OWNER]` = ele *escolheu* entre opções redigidas por agente,
> com o custo de cada uma declarado. Onde um agente **aplicou** uma regra do owner a uma medição
> e tirou conclusão, a conclusão leva **rótulo próprio** — não vira fala dele.

---

## `[Q4]` Rota — RESPONDIDA, escolha direta

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **`/symbol/[symbol]`
nesta feature**, não em feature futura. O custo aceito, como estava escrito no menu: *"alarga
esta feature"*. O motivo dele, já dito no discovery: *"vai entrar muita coisa ali ainda"*.

Segmento em **inglês**, pela linha 12 da tabela de fronteira do `CLAUDE.md`
(`[PREMISSA-OWNER: 2026-09-08]` — *"rotas em ingles"*). O nome exato do segmento é decisão de
`/architect`/`frontend-architect`, não deste documento.

## `[Q2]` Timeframes — RESPONDIDA, com uma premissa do owner que foi PARCIALMENTE corrigida

`[PREMISSA-OWNER: 2026-09-19]`, literal:

> *"principais vão ser 5, 15, 1h e 4h. Mas penso que isso muda pouco a abordagem, pois é tudo
> deverivado do 1m, certo? como conversamos de ter somente uma fonta, então o Time line escolhido
> deveria ter impacto "irrelevante", não? Pois o calculo é o mesmo, na minha visão simplória sem
> ser o especialista"*

⇒ **A barra leva `5m · 15m · 1h · 4h`.**

**A premissa "uma fonte só, tudo derivado dela" está CERTA e é o desenho.** As duas correções, com
o comando `[MEDIDO 2026-09-19]`:

1. **hoje não é tudo 1m.** `curl .../series-catalog` (n=15 entradas BTCUSDT): preço
   (`klines_last`, `price_mark_close`), `sum_open_interest` e `count_long_short_ratio` nascem em
   **`5min`**; `klines_volume`, `cvd_source` e `sum_liquidation` em **`1min`**. O OI de 5min é
   **repetido 5×** para caber na grade de 1 min — `data-oi-wire-points="5760"` para
   `data-oi-native-bars="1152"`;
2. ⛔ **o cálculo NÃO é o mesmo — ele depende da natureza da série**, e o código já sabe disso
   (`domain/series_key.py:85` declara `Nature`; `domain/as_of_accessor.py:112` declara
   `CARRY_FORWARD_BY_NATURE`):

   | natureza | séries | como agrega |
   |---|---|---|
   | `FLOW` | `klines_volume`, `cvd_source`, `sum_liquidation` | **soma** |
   | `STOCK` | `sum_open_interest`, preço | **último / OHLC** — somar OI de 15 min daria **15× o OI real** |
   | `RATIO` | `count_long_short_ratio` | nem soma nem média ingênua: recomputa dos componentes, ou toma o último |

> **Por que isto é portão e não nota de rodapé:** uma soma aplicada a um `STOCK` **não quebra
> import, não reprova teste, e devolve um número plausível e errado**. É a mesma classe do
> `rc=0` ambíguo de `ADR-012`. O `/architect` tem de nomear a função de agregação **por natureza**
> e o falsificador tem de MORDER trocando uma pela outra.

Consequência de desenho, para a mesa do `/architect`: decidir **onde mora a reagregação** — na
rota (o que **reabre `ADR-034/D6`**, hoje `SUPPORTED_INTERVAL = "1m"`) ou no browser.

## `[Q3]` Janela — RESPONDIDA, e o owner ACRESCENTOU um requisito

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **N velas fixo por TF
(~500), como no TradingView**: a janela deriva do TF, não é mais 4 dias fixos para tudo.

`[PREMISSA-OWNER: 2026-09-19]`, literal, e é **requisito novo, não estava no `PRD-008`**:

> *"únco ponto é que a depender do zoom e movimentação da tela, tvz haja um espécie de navegação
> infinita, n sei como o TV e coinalyze resolvem isso. Então acho válido ser pensado essa navegação
> e zooms"*

⇒ **Carregamento de história sob demanda** (arrastar para trás busca mais barra) entra no escopo.

⚠️ **A parede, e ela é assimétrica entre painéis** `[DOC: PRD-008, medição do `/pm`]`: `klines`
tem preço desde **2019-09-08**, mas `/futures/data/*` (OI e long/short) corta em **~30 dias**.
Arrastando para trás em `4h`, **a vela continua e o OI acaba**. A tela tem de **dizer** isso — um
painel que só esvazia é indistinguível de defeito, que é o modo de falha que esta casa persegue.

## `[Q1]` Open Interest — a REGRA é do owner; a RESOLUÇÃO é derivada, e leva rótulo próprio

### O que o owner disse, literal

`[PREMISSA-OWNER: 2026-09-19]`:

> *"Temos que entender o custo, pq n sei se o coinalyze expoe tudo em uma rota só, se tiver como
> capturar tudo em uma única rota, vamos pegar global, agora se precisa passar a corretora, acho q
> n vale isso agora, porém podemos estruturar para deixar extensível, daí a corretora passa a ser
> params e nossa estrutura de dados passa a salvar tbm a corretora. Se quiser algum dia agregar
> outra corretora seria somente ajustar os params e agregações"*

E, sobre a leitura da métrica `[PREMISSA-OWNER: 2026-09-19]`:

> *"O open interest deveria me dizer se ta entrando contrato ou n, certo? então minha leitura de
> 28b n é se de usd e sim de contratos, então se mercado caiu e open interest subiu quer dizer q
> tem interesse nessa queda e ta entrando contrato, se subiu e contratos diminuiram, tende a ter
> menos interessado na alta ou tendo liquidações. Ta errado essa leitura?"*

### A medição que a regra dele exige

**Não existe rota global na Coinalyze** `[DOC: docs/medicao-coinalyze.md:208-217]`. Os 12
endpoints são todos escopados por símbolo, e o namespace **carrega a corretora**:
`<SÍMBOLO>_PERP.<CÓDIGO>` — Binance `A`, Bybit `6`, OKX `3`, BitMEX `0`, Deribit `2`,
Hyperliquid `H`, dYdX `8`, Gate.io `Y`, *"e outras 20"*. Agregar = **passar N símbolos e somar
por nossa conta**.

Custo, derivado do peso linear medido (`custo(requisição) = n_símbolos`, teto **40 unidades/60 s**)
a `N_alvo = 10` símbolos e cadência de 5 min `[INFERRED: aritmética sobre o peso medido, não uma
nova medição contra a API]`:

| cenário | u/ciclo | u/min | % do teto |
|---|---|---|---|
| **hoje** (2 endpoints) | 20 | 4 | **10%** |
| OI global, 4 exchanges | 50 | 10 | 25% |
| OI global, 8 exchanges | 90 | 18 | 45% |
| OI global, 28 exchanges | 290 | 58 | **145% — estoura** |

### A resolução — derivada da regra dele, com rótulo próprio

`[INFERRED: aplicação literal da regra do owner ("se precisa passar a corretora, acho q n vale
isso agora") ao fato medido de que a Coinalyze não tem rota global]`:

⇒ **O OI fica na ORIGEM: Binance USDT-M, em CONTRATOS (`unit=BTC`, `denom=base`), com o rótulo na
tela dizendo exatamente isso.** `ADR-036/D2` **não é reaberta**. Nenhuma exposição nova a terceiro,
e a série que a tela mostra é a MESMA que o backtest enxerga (`RN-6` não dispara).

> ⚠️ **Isto é conclusão de agente, não fala do owner.** Se ele quiser o agregado mesmo sabendo que
> custa N chamadas por corretora, a resolução cai e vale a escolha dele.

### A unidade — e por que ela NÃO é mais uma pergunta em aberto

**A leitura do owner está correta** e é leitura padrão de order flow: OI é contrato em aberto;
preço cai + OI sobe = dinheiro novo entrando vendido (convicção na queda); preço sobe + OI cai =
posição sendo fechada ou liquidada (alta sem gente nova).

O que não se sustentava era a premissa sobre o número do print `[INFERRED: aritmética abaixo; o
rótulo "STABLECOIN+COIN-margined **Contracts**" nomeia QUAIS contratos entram, não a unidade do
eixo]`:

```
27,656 B ÷ 81.546,80 = 339.143 BTC   ·   o nosso: 108.135 BTC   →   razão 3,14×
se 27,656 B fosse CONTAGEM de contratos, a razão seria 255.754× — absurdo
```

⇒ o painel do print está em **nocional USD**. E **nocional = contratos × preço**, então para a
leitura que o owner descreveu ele **mente**: o OI em USD sobe sozinho quando o preço sobe, sem um
único contrato novo — e o caso exato que ele citou (*"mercado caiu e open interest subiu"*) é o que
o nocional mais apaga, porque o preço caindo puxa o nocional para baixo enquanto contratos entram.

⇒ **contratos (BTC) é a unidade certa para o uso declarado; USD seria ativamente enganoso.**

### A extensibilidade que ele pediu JÁ EXISTE no schema — não é trabalho novo

*"a corretora passa a ser params e nossa estrutura de dados passa a salvar tbm a corretora"* — o
`SeriesKey` **já modela os três eixos**: `provider`, `venue` e `aggregation_scope`
(`domain/series_key.py:52,197`). Hoje as **60** entradas do catálogo têm
`aggregationScope="Symbol"` `[MEDIDO 2026-09-19: curl .../series-catalog, n=60]`.

⇒ agregar corretora um dia = **linhas novas com `aggregation_scope` diferente**, sem migração de
schema e sem tocar `INGEST_HEALTH_RUN_COLUMNS`. O `/architect` deve **declarar isto explicitamente**
no desenho, para que a extensão não seja redescoberta como trabalho.

---

## Resumo para a mesa do `/architect`

| # | resolvido | rótulo |
|---|---|---|
| rota | `/symbol/[symbol]` nesta feature, segmento em inglês | `[DECISÃO-OWNER]` |
| TFs | `5m · 15m · 1h · 4h` | `[PREMISSA-OWNER]` |
| agregação | **por natureza** (`FLOW`=soma · `STOCK`=último/OHLC · `RATIO`=recomputa) — correção de premissa | `[MEDIDO]` |
| janela | ~500 velas por TF + **história sob demanda** ao arrastar | `[DECISÃO-OWNER]` + `[PREMISSA-OWNER]` |
| OI universo | **Binance só** — a regra é do owner, a resolução é derivada e vetável | `[PREMISSA-OWNER]` + `[INFERRED]` |
| OI unidade | **contratos (BTC)**, rótulo honesto na tela | `[INFERRED: o uso que o owner declarou]` |
| extensão | `aggregation_scope` já existe; declarar, não construir | `[MEDIDO]` |

**Em aberto para o `/architect` decidir:** onde mora a reagregação (rota vs browser, e o que isso
faz com `ADR-034/D6`); a forma da vela (o `/pm` mediu que `klines` já traz o/h/l/c e o cliente só
indexa 4 campos ⇒ **sem cota nova**); e o eixo de tempo mestre, que é do `frontend-architect`.

---

# Segunda rodada — as 3 perguntas do `/architect`, respondidas em 2026-09-19

## `[M-2]` O veto do OI NÃO foi exercido — e o rótulo SOBE

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **"Mantém — origem,
Binance, contratos"**, com o custo da alternativa declarado no menu (agregado: 18 u/min a 8
exchanges = 45% do teto, retenção ~7 dias no `5min`, `RN-6` visível na tela e invisível ao
backtest até `PRD-005`).

⚠️ **Isto muda a força da resolução do `[Q1]`, e a mudança é o ponto.** Na primeira rodada a
resolução era `[INFERRED: aplicação da regra do owner ao fato medido]` — conclusão de agente,
vetável. **Agora é escolha do owner sobre um menu com custo declarado.** A fase de OI agregado
fica **fora do plano** por decisão, não por dedução.

## `[M-1]` `components` — a política é a verdade, o `CLAUDE.md` envelheceu

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **são 7**, com `infra`;
o `CLAUDE.md` é que estava desatualizado. Alterado em duas superfícies (seção do vocabulário e
linha 9 da tabela de fronteira); `harness.toml` **não** foi tocado.

**A exclusão do falsificador de idioma NÃO ganhou `infra`**, e o motivo está escrito no próprio
`CLAUDE.md`: o `infra` que aparece como segmento de diretório é **camada** (irmão de `domain` e
`use_cases`), não o componente — que mapeia para `deploy/`, fora do universo do instrumento.
`[MEDIDO 2026-09-19: falsificador com e sem `infra` na exclusão → mesma lista, 23 contra 22
segmentos, zero em português nos dois]`.

ℹ️ **Achado lateral, NÃO corrigido aqui:** a prosa do falsificador diz *"Hoje: 14 segmentos, e
exatamente 1 em português — `painel`"* `[MEDIDO 2026-08-29 em 77cf178]`. Hoje são **23 segmentos
e ZERO em português** — `painel` virou `panel`, ou seja **a predição daquela frase se cumpriu**
(*"depois dela, 13 e zero"*). O número de segmentos cresceu porque a árvore cresceu. Não reescrevi
a linha: ela é `[MEDIDO]` com data e commit, e era verdadeira naquela árvore. Fica como dívida de
atualização com dono.

## `[M-5]` Teto de latência de interação — RESPONDIDO, deixa de ser `[NÃO MEDIDO]`

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **padrão de mercado:**

| interação | teto |
|---|---|
| arrastar / zoom no eixo | **16 ms** (um quadro, 60 fps) |
| carregar história nova sob demanda | **400 ms** até aparecer |

⇒ O DoD da fase do eixo (`02_eixo_unico`) e o da fase `05_historia_sob_demanda` passam a ter
critério verificável por Playwright. **Sem isto o DoD não era verificável**, que é o motivo de a
pergunta ter sido feita.

---

# Terceira rodada — o aviso de indisponibilidade, 2026-09-19

> ⚠️ **Esta decisão chegou DEPOIS de `SPEC_APPROVED`** (ledger: `approve spec` 17:00:57).
> O `/tech-lead` tem de julgar se ela cabe como detalhe de task dentro das fases já aprovadas
> ou se exige emenda da SPEC — **não presuma que cabe**.

## A pergunta do owner, literal

`[PREMISSA-OWNER: 2026-09-19]`:

> *"sobre o TF, OI por exemplo, se ele n tem 1min, não vamos exibir esse indicador no TF onde ele
> n ta disponível, daí ele pode ficar com uma toggle de exclamação avisando que ta indisponível
> naquele TF. tirando o OI, tem outros nesse mesmo escopo?"*

## A resposta medida: por GRADE NATIVA, ninguém — com os TFs escolhidos

Só existem **duas** grades nativas em todo o catálogo
`[MEDIDO 2026-09-19: curl .../series-catalog, n=60 entradas, 4 símbolos]`:

| grade | séries |
|---|---|
| `1min` | `klines_volume` · `cvd_source` · `sum_liquidation` |
| `5min` | `sum_open_interest` (5 reduções) · `klines_last` · `price_mark_close` · `count_long_short_ratio` |

A grade mais grossa é **`5min`**; o TF mais fino escolhido é **`5m`**. Agregar para cima é sempre
possível ⇒ **nenhuma série fica indisponível em `5m`/`15m`/`1h`/`4h`**. O mecanismo nasce correto e
**sem nunca disparar**.

⇒ **O gatilho dele é o dia em que `1m` entrar na barra** — e aí pega **três** métricas de uma vez,
não só o OI: `sum_open_interest`, preço (`klines_last`, `price_mark_close`) e
`count_long_short_ratio`, todas nascidas em `5min`.

## O "indisponível" que EXISTE hoje é história, não TF

Cobertura na janela corrente de 4 dias (5.760 slots de 1 min)
`[MEDIDO 2026-09-19: data-* da página renderizada]`:

| painel | cobertura | nota |
|---|---|---|
| Open Interest | `1152/1152` | 100% |
| Volume | `5411/5760` | 93,9% |
| CVD | `5411/5760` | 93,9% |
| Long/short | `1086` barras nativas / `3826` pontos de fio | — |
| **Liquidações** | **`294/5760` = 5,1%** | e **~metade é zero do fornecedor** (148 e 130 nas duas coortes) |

Em `4h` × 500 velas a janela vira ~83 dias contra retenção de 4–11 dias ⇒ o `/architect` mediu
~11% do OI e ~6% do CVD com ponto na primeira renderização.

## A decisão do owner, e a leitura que o loop principal adotou

`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — **"Uma só:
'indisponível'"**, contra a recomendação de distinguir três causas. O custo estava escrito no
menu: *"em `4h` quase todo painel mostra a mesma exclamação, e ela deixa de dizer qualquer coisa"*.

⚠️ **Fato que só apareceu DEPOIS da escolha, e que muda o custo dela:** a distinção já existe e
está no ar, em dois níveis —

1. **por ponto**: `SymbolClient.tsx:774,780,1325` — *"Sem dado — traço baixo e apagado (não
   sabemos)"* contra *"Zero do fornecedor — traço alto e claro (sabemos: foi zero)"*;
2. **por painel, já com motivo nomeado**: `ABSENCE_REASON_LABEL` (`SymbolClient.tsx:347-357`)
   carrega **6 motivos** — `not_in_catalog`, `ambiguous_in_catalog`, `missing_base_url`,
   `connection_refused`, `non_2xx`, `malformed_envelope`. O segundo existe porque o painel de OI
   passou **uma fase inteira** apontado para série vazia, escolhendo por posição.

`[INFERRED: leitura adotada pelo loop principal, comunicada ao owner e NÃO contestada por ele até
o momento desta escrita]` — **LEITURA A**:

> O aviso **novo** (indisponibilidade por TF / por falta de história) é **um estado só**, como o
> owner escolheu. As marcas por ponto e os 6 motivos que **já existem ficam intactos**. Nada é
> removido.

**A leitura B — colapsar também o que já existe — NÃO foi adotada.** Ela seria remoção deliberada
de comportamento em produção, construído contra um defeito real, e exigiria dizê-lo com todas as
letras. Se o owner quis a B, ele diz e a A cai.
