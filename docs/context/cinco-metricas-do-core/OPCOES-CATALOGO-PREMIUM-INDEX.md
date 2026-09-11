# Opções — admitir as 8 séries de `premiumIndex` no catálogo servido

**Pré-requisito BLOQUEANTE de `D15`** (marco zero: `TRUNCATE md.series` + reingestão). A amarração
está escrita no próprio `D15`: as 8 séries são **as únicas 100% legíveis da base** e são **exatamente
as órfãs** de
[`handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md`](handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md).
Limpar sem decidir isto destrói o único dado legível para recriá-lo igualmente ilegível.

**Dono da decisão: owner.** Este documento **não decide, não emenda ADR e não escreve código** —
levanta o menu, declara o custo de cada opção e diz o que cada escolha fecha de forma irreversível.
Mesmo modo de [`OPCOES-E1-E5.md`](OPCOES-E1-E5.md).

⚠️ **Leia `0.4` antes de qualquer outra seção.** A premissa de que "mudar qualquer um dos 4 campos
muda `series_key_id`" é **falsa para 3 dos 4**, e isso muda o preço de cada escolha abaixo.

---

## 0 · O que foi medido hoje, e com qual comando

Tudo abaixo é `[MEDIDO 2026-09-11]`. Postgres em **só leitura**; REST público da Binance, sem chave.

### 0.1 O universo em disco

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  -c "select source, count(*), count(distinct series_key_id) from md.series group by 1;"
```

| `source` | linhas | `series_key_id` distintos |
|---|---|---|
| `/fapi/v1/klines` | 125.236 | 4 |
| `/fapi/v1/premiumIndex` | **34.744** | **8** |

Mapeamento das 8, por faixa de `value_raw` (4 símbolos × 2 métricas):

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
select series_key_id, symbol, min(value_raw), max(value_raw), count(distinct value_raw)
from md.series where source='/fapi/v1/premiumIndex' group by 1,2 order by 2,1;"
```

`539495b4…` = `BTCUSDT`/`mark_price` — confirmado **por reconstrução**, não por inferência: rebuildar
a chave com `interval="60s"` e `verified_by="backend/tests/sentimento/test_collector_series_mapping.py"`
devolve exatamente esse `sha256` (comando em §0.4).

### 0.2 A grade NATIVA da origem — medida, não presumida

A pergunta *"qual é a grade nativa do `premiumIndex`?"* tem resposta, e ela **não vem do
`premiumIndex`**: vem dos dois endpoints gradeados que publicam as MESMAS quantidades em bucket,
cujo campo `[8]` é a **contagem de amostras agregadas no bucket**.

```bash
for S in BTCUSDT ETHUSDT SOLUSDT LINKUSDT; do
  curl -s "https://fapi.binance.com/fapi/v1/markPriceKlines?symbol=$S&interval=1m&limit=500" \
  | python3 -c "import json,sys,collections; d=json.load(sys.stdin)[:-1];
print(len(d), collections.Counter(r[8] for r in d).most_common(3))"
  curl -s "https://fapi.binance.com/fapi/v1/premiumIndexKlines?symbol=$S&interval=1m&limit=500" \
  | python3 -c "import json,sys,collections; d=json.load(sys.stdin)[:-1];
print(len(d), collections.Counter(r[8] for r in d).most_common(3))"
done
```

| série gradeada | amostras por bucket de 1 min | universo | ⇒ tick nativo |
|---|---|---|---|
| `markPriceKlines` | **60**, sem exceção | 499 buckets fechados × 4 símbolos = **1.996** | **1 s** |
| `premiumIndexKlines` | **12**, sem exceção | 1.996 | **5 s** |

**Zero exceção em 1.996 buckets, nos dois.** Isto é um falsificador barato: um único bucket com
contagem ≠ 60 derruba a linha de cima.

### 0.3 A cadência do `lastFundingRate` — e ela **não** é a do `markPrice`

Amostrador local a ~1,27 s de intervalo efetivo, `BTCUSDT`:

```bash
for i in $(seq 1 360); do L=$(date +%s%3N); \
  R=$(curl -s "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"); \
  echo "$L|$R"; sleep 0.9; done > pi_btc_360.jsonl
```

`[MEDIDO 2026-09-11, n=360 amostras, span 458,0 s]`:

| campo | mudanças em 359 transições | instante da mudança (`time % 60000`) |
|---|---|---|
| `markPrice` | **255** | qualquer |
| `indexPrice` | 276 | qualquer |
| `estimatedSettlePrice` | 325 | qualquer |
| `interestRate` | **0** | — |
| **`lastFundingRate`** | **6** | **1,0 · 1,0 · 1,0 · 1,0 · 1,0 · 2,0 s** |

Deltas entre as 6 mudanças de `lastFundingRate`: **120 · 60 · 121 · 59 · 60 s** — todos múltiplos de
60. **6 de 6 caem no segundo 1–2 do minuto.**
⇒ **`lastFundingRate` é recalculado na virada do minuto e publicado ~1–2 s depois. Grade nativa
de 1 min.** `markPrice` muda em 255 de 359 transições a ~1,27 s de amostragem (aliasing do
amostrador; a medição autoritativa do tick é a de §0.2, que é 1 s).

**E `time` NÃO é grade:** 360 amostras produziram **360 valores distintos** de `time`, e **121 de
360 não terminam em `000`**. `premiumIndex` é **snapshot calculado no instante do pedido**, não
bucket. Qualquer `native_grid` atribuído a ele é uma afirmação sobre a **quantidade** que ele
carrega, nunca sobre o endpoint.

### 0.4 ⛔ O que entra no `series_key_id`, e a premissa que isso derruba

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import *
def k(vb='t.py', interval='60s'):
    return SeriesKey(provider='binance',venue='usdm_futures',instrument_id='BTCUSDT',
      metric='mark_price',cohort='all',interval=interval,unit='USDT',denom='quote',
      nature=Nature.STOCK,ts_convention=TsConvention.POINT_AT_BUCKET_END,
      reduction=Reduction.POINT,quantity_field=QuantityField.NA,label_shift=0,
      aggregation_scope='Symbol',verified_by=vb)
a=SeriesCatalogEntry(key=k(),native_grid='1s', max_staleness_ms=120000,price_use=None)
b=SeriesCatalogEntry(key=k(),native_grid='60s',max_staleness_ms=999000,price_use='funding')
print('3 campos de catalogo diferem -> mesmo id?', a.key.series_key_id()==b.key.series_key_id())
print('verified_by difere -> mesmo id?', k(vb='x.py').series_key_id()==k(vb='y.py').series_key_id())
print('interval difere   -> mesmo id?', k(interval='1s').series_key_id()==k(interval='60s').series_key_id())
print(k(vb='backend/tests/sentimento/test_collector_series_mapping.py').series_key_id())"
```

Saída:

```
3 campos de catalogo diferem -> mesmo id? True
verified_by difere -> mesmo id? False
interval difere   -> mesmo id? False
539495b4a8382cb297b5be28de028dc2358897841f2d443de6eb59136225967c
```

| campo | está nos 15 termos? | mudar depois da reingestão |
|---|---|---|
| `native_grid` | **não** | muda metadado servido. **Reversível**, custo ~1 PR |
| `max_staleness_ms` | **não** | muda o alcance do `LOCF`. **Reversível**, custo ~1 PR |
| `price_use` | **não** | muda metadado servido. **Reversível**, custo ~1 PR |
| **`verified_by`** | **SIM** (15º termo, `series_key.py:226-234`) | **IRREVERSÍVEL**: novo `series_key_id`, rota volta `200` com 0 linhas |
| **`interval`** ⚠️ | **SIM** (6º termo) | **IRREVERSÍVEL**, e **ninguém o listou** — ver `F5` |

⇒ **A pergunta do despacho ("mudar qualquer um dos 4 muda `series_key_id`") vale para 1 dos 4.**
Três são baratos de revisar; o caro é `verified_by`, e o caro **que não estava no menu** é `interval`.
Isto não torna os três irrelevantes — `max_staleness_ms` governa decisão de capital (`ADR-006`) —
mas muda **onde** gastar o cuidado do owner hoje.

### 0.5 Um achado lateral, e ele é material para o marco zero

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
select min(available_at-bucket_end), percentile_disc(0.5) within group (order by available_at-bucket_end),
 percentile_disc(0.99) within group (order by available_at-bucket_end), max(available_at-bucket_end),
 count(*), count(*) filter (where available_at < bucket_end) from md.series
where source='/fapi/v1/premiumIndex';"
-- -100|968|1758|1895|34760|424
```

| `available_at - bucket_end` | valor |
|---|---|
| min | **−100 ms** |
| p50 | 968 ms |
| p99 | 1.758 ms |
| max | **1.895 ms** |
| `available_at < bucket_end` | **424 de 34.760 (1,22%)** |

⚠️ **O insumo do despacho ("atraso ao vivo `max 1 s`") está subdimensionado: o máximo é 1.895 ms,
quase 2×.** E há **424 linhas com atraso NEGATIVO** — `available_at` antes de `event_time`, que
`SPEC-001` §3.2 declara **linha inválida** fora de `clock_skew_tolerance_ms`. Elas existem porque a
checagem nunca roda: `grep -rn 'build_series_row' backend/src` devolve **0 chamador** fora de
`provenance.py` (`[MEDIDO 2026-09-11]`), e `build_series_row` é quem chama `reject_clock_skew`.
**Isto não é decisão deste menu** — é uma página própria — mas o owner precisa saber que a frase
"as 8 séries são 100% legíveis" mede uma coisa (`available_at − bucket_end ≤ 60 s`) e **não** mede a
validade de §3.2.

---

## F0 · A PERGUNTA PRÉVIA — `funding_estimado` é derivado de `mark_price`?

> *"Se for derivado, admitir os dois como séries irmãs pode publicar a mesma informação duas vezes
> com identidades diferentes — e isso é o tipo de coisa que não volta atrás depois de gravada."*

### ⛔ Resposta: **NÃO. São campos independentes.** Três provas, cada uma suficiente sozinha.

**Prova 1 — independência estatística sobre a base inteira.** Junta as duas séries por
`(symbol, bucket_end)` (mesma resposta HTTP ⇒ mesmo instante) e compara os movimentos:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with m as (select symbol,bucket_end,value_raw::numeric v,
   lag(value_raw::numeric) over (partition by symbol order by bucket_end) pv
   from md.series where series_key_id in ('539495b4…','2876b82d…','d1699147…','075533b5…')),
 f as (select symbol,bucket_end,value_raw::numeric v,
   lag(value_raw::numeric) over (partition by symbol order by bucket_end) pv
   from md.series where series_key_id in ('b3d96034…','c722a0e1…','593ef0aa…','e123cb10…'))
select m.symbol, count(*),
 count(*) filter (where m.v<>m.pv and f.v=f.pv), count(*) filter (where m.v=m.pv and f.v<>f.pv),
 round(corr(m.v-m.pv, f.v-f.pv)::numeric,4)
from m join f on m.symbol=f.symbol and m.bucket_end=f.bucket_end
where m.pv is not null and f.pv is not null group by 1 order by 1;"
```

`[MEDIDO 2026-09-11, n=4.343 pares por símbolo]`:

| símbolo | mark moveu / funding parado | funding moveu / mark parado | `corr` dos deltas |
|---|---|---|---|
| `BTCUSDT` | **1.371** | 4 | **0,0423** |
| `ETHUSDT` | **1.319** | 8 | **0,0502** |
| `LINKUSDT` | **1.259** | 36 | **0,0390** |
| `SOLUSDT` | **1.263** | 56 | **0,0423** |

Correlação dos incrementos ~**0,04**. E as **duas** colunas do meio são não-vazias: existe caso em
que cada um se move sozinho ⇒ **nenhum dos dois é função do outro**. Se fossem a mesma informação,
`corr` seria 1 e uma das colunas seria 0.

**Prova 2 — grades nativas diferentes (§0.2/§0.3).** `mark_price` tick nativo **1 s**;
`funding_estimado` recalculado **na virada do minuto**. Duas quantidades com cadências de origem
diferentes por fator 60 **não podem** ser a mesma informação sob nomes diferentes, e
**não podem compartilhar `native_grid` nem `max_staleness_ms`**.

**Prova 3 — a fórmula não fecha, e o `mark` não é insumo dela.** Snapshot de `BTCUSDT`
(`[MEDIDO 2026-09-11]`): `markPrice=77183.10`, `indexPrice=77217.14`, `lastFundingRate=0.00001001`.
O prêmio ingênuo `(mark−index)/index = −4,41e−4` não é o `lastFundingRate = +1,00e−5`, nem em sinal.
O funding da Binance é `avg(premium index sobre a janela) + clamp(interest − premium, ±0,05%)`, e o
*premium index* é construído sobre **impact bid/ask vs index price** (grade de 5 s, §0.2) — o mark
não entra.

### Corolário obrigatório: `funding_estimado` **é estimativa corrente, não taxa liquidada**

```bash
curl -s "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=4"
curl -s "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"
```

Último funding **liquidado** (`fundingTime=1789142400000`): **0,00003593**. `lastFundingRate` ao vivo
no mesmo dia: **0,00000982**, e ele se move continuamente (2.397–2.746 valores distintos em ~3 dias
de amostragem a 60 s, §0.1). Se fosse a taxa liquidada, teria **9 valores em 3 dias**
(`fundingIntervalHours = 8` para os 4 símbolos, via `/fapi/v1/fundingInfo`).

⚠️ **A doc da Binance diz `lastFundingRate`: "This is the Latest funding rate"** `[DOC: Binance
USDⓈ-M Futures, REST `GET /fapi/v1/premiumIndex`, seção *Mark Price*, tabela de resposta]` — leitura
natural que **a medição contradiz**. O nome `funding_estimado` (`FundingSource.ESTIMATED`) que o
escritor já usa está **correto**; o nome da Binance é que engana. Isto é exatamente o motivo de
`verified_by` existir.

⇒ **Admitir as duas como séries irmãs NÃO publica a mesma informação duas vezes.** A pergunta prévia
está respondida e **não bloqueia** `D15`. O que ela muda: as duas linhas **não** podem ser geradas
por um builder parametrizado que compartilhe `native_grid`/`max_staleness_ms` — são catálogos com
parâmetros distintos.

---

## F1 · `native_grid` — o que se declara quando a origem é snapshot

O validador (`series_catalog.py:__post_init__`) só recusa **branco**; o contrato semântico vem de
`CA-F2-11` (*"resolvido da fonte em toda linha"*). O precedente vivo é literal-de-tempo:
`"1min"` (`cvd_source`, `klines_volume`) e `"5min"` (`price_*`, `open_interest`).

### As opções

| # | opção | `mark_price` | `funding_estimado` | custo |
|---|---|---|---|---|
| 1 | **grade da ORIGEM, medida** | `"1s"` | `"1min"` | honesto sobre a fonte; **primeira linha do catálogo em que `native_grid ≠ interval`** — o leitor passa a ter de saber que `1s` nativo servido a `60s` é **subamostragem 1:60** |
| 2 | **cadência do NOSSO polling** | `"60s"` | `"60s"` | `native_grid == interval` como em toda outra linha; **mente sobre a origem** — declara grade onde a origem tem tick de 1 s, e apaga do catálogo o fato de que 59 de 60 ticks foram descartados |
| 3 | **literal que nega a grade** | `"snapshot"` | `"snapshot"` | verdadeiro sobre o ENDPOINT (§0.3); **inútil para o leitor** — não diz nada sobre alcance de `LOCF`, e quebra o vocabulário literal-de-tempo das 11 linhas existentes |
| 4 | **trocar a FONTE**: `markPriceKlines`/`premiumIndexKlines` 1m | `"1min"` gradeado de verdade | `"1min"` | resolve a subamostragem na raiz e ganha OHLC; **é feature nova** (novo coletor, novo endpoint, novo `interval`, `Reduction` diferente) e **as 34.744 linhas em disco não são dessa fonte** — sai do escopo de `D15` e vira `SPEC-007` fase própria |

### Recomendação: **1** — e ela só é barata porque `native_grid` **não** está no hash (§0.4)

`[RECOMENDAÇÃO DE AGENTE, não decisão]`. Motivo: é o único valor que um terceiro pode **conferir
contra a fonte** — o comando de §0.2 devolve `60` e `12`, e quem discordar roda o comando. A opção 2
é a única que produz um catálogo em que **nada** registra que a série é subamostrada, e essa é
precisamente a informação que `ADR-007` usa para recusar `mark_price` em `structure_detection`
(*"extremos subamostrados por construção"*) — apagá-la do catálogo desarma o argumento do ADR.

⚠️ **O que a opção 1 obriga, e é o preço real dela:** `native_grid=1s` com `interval=60s` torna
**explícita e servida** a afirmação *"esta série vê 1 de cada 60 ticks do mark price"*. Todo consumo
em `backtest` que dependa de caminho (stop, liquidação, marcação intrabar) tem de tratá-la como
**amostra esparsa**, nunca como o mark price. Essa obrigação **já existe hoje** — a opção 1 só a
torna legível.

### O que a escolha fecha de forma irreversível

**Nada.** `native_grid` não entra no `series_key_id` (§0.4). Reversível por PR.

---

## F2 · `max_staleness_ms` — medido, e o insumo do despacho é o errado

⛔ **O atraso de publicação NÃO é a medida certa.** `ADR-006`/`SPEC-001` §3.2 definem
`max_staleness_ms` como *"por quanto tempo o `backtest` pode usar este número como se fosse o valor
corrente"* — isto é **até quando chega a PRÓXIMA observação**, não **quanto demorou a chegar esta**.
O insumo do despacho (`max 1 s`, e na verdade **1.895 ms**, §0.5) mede a segunda coisa.

A medida certa é a distribuição de **intervalo entre chegadas**, por série:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with p as (select symbol, available_at,
  lag(available_at) over (partition by series_key_id order by available_at) prev
  from md.series where source='/fapi/v1/premiumIndex')
select symbol, count(*),
 percentile_disc(0.5)   within group (order by available_at-prev),
 percentile_disc(0.95)  within group (order by available_at-prev),
 percentile_disc(0.99)  within group (order by available_at-prev),
 percentile_disc(0.999) within group (order by available_at-prev),
 max(available_at-prev) from p where prev is not null group by 1 order by 1;"
```

`[MEDIDO 2026-09-11, n=8.686 por símbolo; idêntico nos 4]`:

| p50 | p95 | p99 | p99,9 | max |
|---|---|---|---|---|
| **60.357 ms** | 60.830 ms | 61.138 ms | 67.798 ms | **141.118 ms** |

```bash
-- quantas chegadas passam de cada limiar candidato
… select count(*) filter (where available_at-prev > 120000), count(*) filter (where available_at-prev > 65000), count(*) from p …
-- 8 | 40 | 34744
```

⇒ **8 de 34.744 chegadas (0,023%) passam de 120 s; 40 (0,115%) passam de 65 s.**

### As opções

| # | valor | `mark_price` | `funding_estimado` | o que acontece na cauda |
|---|---|---|---|---|
| a | **2 × grade nativa** (o precedente literal das 11 linhas) | `2.000` | `120.000` | `mark_price` fica **inutilizável**: a própria cadência de polling (60 s) excede o limite ⇒ toda leitura reprova por `stale`. **Precedente aplicado fora do caso que o gerou** |
| b | **2 × `interval`** (cadência de polling) | `120.000` | `120.000` | cobre p99,9 (67,8 s); **8 chegadas de 34.744 caem para fora** e viram lacuna — que é o comportamento correto de `SPEC-001` §3.2, não um defeito |
| c | **p99,9 medido, arredondado** | `70.000` | `70.000` | mais apertado que (b); 40 chegadas viram lacuna. Mais honesto com o dado, **menos tolerante a um restart de coletor** |
| d | **max medido** (`141.118` → `150.000`) | `150.000` | `150.000` | **0 lacuna** — e é exatamente o defeito que `ADR-006` nomeia: dimensionar pelo pior caso observado transforma toda lacuna futura em número |
| e | **assimétrico por série** | `120.000` | `180.000` | reconhece que perder 1 minuto de funding (grade 1 min) é diferente de perder 1 amostra de mark. Custo: dois números para justificar, e o de funding **não** tem medição própria que o sustente hoje |

### Recomendação: **b** — `120.000` para as duas

`[RECOMENDAÇÃO DE AGENTE, não decisão]`. Motivos, em ordem:

1. **É o único valor com precedente de razão idêntica em todas as 11 linhas existentes**
   (`klines_volume_catalog.py:84-88`: *"one missed bar is tolerated as latency, two are a gap"*).
   Aqui a "barra" é o ciclo de polling, e 2 × 60 s = 120.000.
2. **Ele deixa lacuna, e a lacuna é o produto.** 8 de 34.744 (0,023%) passam a render como
   ausência. `SPEC-001` §3.2: *"lacuna nunca preenchida no armazenamento"*. Um valor que zera a
   contagem de lacunas (opção d) está escondendo as 8 paradas reais do coletor.
3. **Recusa (a) explicitamente:** o precedente `2 × native_grid` foi escrito quando
   `native_grid == interval`. Com `native_grid=1s` e polling de 60 s eles divergem, e aplicar a
   fórmula literal produz `2.000 ms` — um número que reprova **toda** leitura. Isto é a primeira
   vez que a fórmula sai do domínio em que foi construída, e é por isso que ela precisa ser
   **reafirmada sobre `interval`**, não copiada.

⚠️ **A ressalva que o owner precisa ver: `SeriesCatalogEntry` tem UM campo escalar
`max_staleness_ms`, e `ADR-006`/`D1` exige DOIS com nomes diferentes** (`asof_max_staleness_ms` para
decisão de capital, `render_max_staleness_ms` para tela). Hoje `series_history.py:177-178` alimenta
**os dois com o mesmo escalar**. Isto significa que **o valor escolhido aqui vira, hoje, o limite de
decisão de capital E o limite de pixel ao mesmo tempo** — `ADR-006`/`D3` (*"o acessor NUNCA cai no
valor de tela"*) está, nesta superfície, **não implementado**. Não é decisão deste menu; é o
falsificador da própria `ADR-006`, e ele está disparado. Página própria.

### O que a escolha fecha de forma irreversível

**Nada no hash** (§0.4). Mas fecha algo **de comportamento**: qualquer número que `backtest`
produzir antes de uma revisão terá usado este limite, e resultado de backtest **não** é recomputado
retroativamente por mudança de catálogo. ⇒ reversível no código, **não** nos relatórios já emitidos.

---

## F3 · `price_use` — e a armadilha das "duas respostas para a mesma pergunta"

O estado de hoje, verificável em `domain/price_source_catalog.py:99-120`:

```
_PRICE_SOURCE_BY_USE_RAW = {structure_detection: klines_last, liquidation_trigger: mark_price,
                            funding: mark_price, execution: klines_last, cost: mark_price}
_CONCEPT_TO_CATALOGED_SOURCE = {"mark_price": "price_mark_close"}
```

⇒ `resolve_price_source("funding")` devolve hoje **`"price_mark_close"`** — a reconstrução de 5 min
`sum_open_interest_value / sum_open_interest`, **não** a leitura ao vivo. `ADR-007` atribui
**três** usos ao conceito `mark_price`; o catálogo serve os três por `price_mark_close`, cuja linha
publica `price_use="liquidation_trigger"` como uso PRIMÁRIO (o campo é escalar).

**A armadilha é literal:** se a linha nova declarar um `price_use` que `PRICE_SOURCE_BY_USE` já
resolve para `price_mark_close`, um consumidor que leia `entry.priceUse` acha uma resposta e um
consumidor que chame `resolve_price_source()` acha outra. É o defeito que o achado nomeia.

### As opções

| # | opção | efeito | custo |
|---|---|---|---|
| A | **`price_use=None`** nas 8 linhas | `PRICE_SOURCE_BY_USE` **intocado**; nenhuma segunda resposta; a série é publicada como **observação de procedência**, não como fonte de preço de uso declarado | um leitor pode ler `null` como *"esqueceram"*. Mitigável só por docstring — e `price_use` é `Optional` **por design** (`series_catalog.py:104-113`: *"quando aplicável"*) |
| B | **`price_use="funding"`** + repontar `_CONCEPT_TO_CATALOGED_SOURCE` para a série nova no uso `funding` | semanticamente o mais forte: funding **é** calculado sobre o mark, e esta linha é o mark ao vivo, **no mesmo instante** do `funding_estimado` irmão | **emenda `ADR-007`** (fora do meu mandato) e muda o `price_source` que o `backtest` usa para custo de funding — de uma reconstrução de 5 min para uma amostra de 60 s. **Precisa de medição de erro entre as duas antes**, que ninguém fez |
| C | **`price_use="liquidation_trigger"`** | colide de frente com `price_mark_close`, que publica exatamente esse uso | **duas linhas reivindicando o mesmo uso primário** — é o defeito, não a correção. ⛔ Recusada |
| D | **`price_use="cost"`** | é o terceiro uso do conceito `mark_price` e **nenhuma linha o publica como primário** hoje | mesma colisão de (B) com `resolve_price_source("cost") == "price_mark_close"`, sem a justificativa semântica de (B) |
| E | **alargar `price_use` para coleção** e resolver as 3-para-1 de uma vez | fecha a dívida que `price_source_catalog.py:192-206` já declara ("re-open this the day a consumer starts READING `entry.priceUse`") | muda a forma de fio (`series_catalog.py:273`) e o tipo do frontend. **Refactor de contrato durante o marco zero** — o pior momento |

### Recomendação: **A** (`price_use=None`), com **B** registrada como o alvo e o que falta medir

`[RECOMENDAÇÃO DE AGENTE, não decisão]`. Motivos:

1. **É a opção que não cria a segunda resposta.** Toda outra (B/C/D) cria, ou exige emendar
   `ADR-007` no mesmo commit em que a base é truncada.
2. **`price_use` não está no hash (§0.4)** ⇒ escolher `None` hoje e `"funding"` depois custa 1 PR e
   **zero linha reingerida**. Escolher `"funding"` hoje e errar custa uma emenda de ADR para
   desfazer. **A assimetria de custo é toda a favor de `None`.**
3. **O que falta para B é uma medição que não existe:** o erro entre `mark_price` ao vivo (amostrado
   a 60 s) e `price_mark_close` (reconstrução de 5 min) no mesmo bucket. `SPEC-001` §3.3 exige
   `(mediana, p99, n)` para publicar reconstrução — e trocar a fonte de um `price_use` sem esse
   número é a mesma classe de afirmação que a SPEC recusa.
4. ⚠️ **O argumento de subamostragem é contra B, e é forte:** `ADR-007` justifica `mark_price` para
   `liquidation_trigger`/`funding`/`cost` com o mark **contínuo**. A série que estamos admitindo vê
   **1 de 60 ticks** (§0.2/§F1). Para `funding` — que é a média do prêmio sobre 8 h — a
   subamostragem provavelmente importa pouco; para `cost`/`liquidation_trigger`, **importa muito**.
   "Provavelmente importa pouco" é opinião, e está **rotulada como opinião** — não entra sem
   medição.

**Como o owner confere sem confiar em mim:** rode
`resolve_price_source("funding")` hoje; ele devolve `"price_mark_close"`. Depois de admitir as 8
linhas com `price_use=None`, ele devolve **a mesma coisa**. Se mudar, a opção A não foi implementada.

### O que a escolha fecha de forma irreversível

**Nada no hash.** Mas **B fecha algo que não volta**: repontar o `price_source` de `funding` muda
todo relatório de backtest emitido a partir dali, e `ADR-007`/`PS-3` exige que uma anotação feita
sob uma fonte **não seja reexibida como se fosse a mesma** sob outra. Reabrir depois exige plano de
migração de anotação, não só um PR.

---

## F4 · `verified_by` — o único dos 4 que é irreversível

15º termo, dentro do `sha256` (§0.4, e `series_key.py:226-234` diz isso em voz alta). **Três
convenções vivas e incompatíveis no mesmo repositório hoje** `[MEDIDO 2026-09-11]`:

```bash
grep -rn 'verified_by="\|_VERIFIED_BY' backend/src | grep -v 'verified_by=verified_by'
```

| convenção | onde | exemplo |
|---|---|---|
| **nome de arquivo nu** | `series_catalog.py:142,143,154` — **3 de 5 famílias** | `test_klines_volume_catalog.py` |
| `arquivo::nome_do_teste` | `open_interest_catalog.py:75-78` | `test_open_interest_catalog.py::test_the_catalog_has_five_rows_…` |
| **caminho completo do repo** | `collector_series_mapping.py:133` — **o escritor das 8 órfãs** | `backend/tests/sentimento/test_collector_series_mapping.py` |

⛔ **O valor que já está gravado nas 34.744 linhas é o terceiro.** Confirmado por reconstrução em
§0.4: só ele reproduz `539495b4…`.

### As opções

| # | opção | custo |
|---|---|---|
| i | **catálogo adota o valor do escritor** (caminho completo) | **zero risco de órfã**; consolida no repositório a convenção **minoritária (1 de 5)**, e é a mais frágil das três — mover `backend/tests/sentimento/` re-identifica 8 séries |
| ii | **escritor E catálogo migram para nome nu** (`test_collector_series_mapping.py`) | alinha com **3 das 5 famílias**; o caminho deixa de ser parte da identidade ⇒ mover o diretório de teste **não** re-identifica. **Só é grátis porque `D15` trunca** — sem o marco zero seriam 34.744 linhas órfãs |
| iii | **`arquivo::teste`**, a convenção do `open_interest` | é a mais **específica** — nomeia o teste, não o arquivo, que é o que `SPEC-001` §3.3 pede (*"`verified_by` apontando um teste que mediu o shift"*); renomear o teste re-identifica a série |
| iv | **teste NOVO e dedicado**, ex. `test_premium_index_catalog.py` | acompanha mover a identidade para `domain/` (item 4 do achado); **nome de um arquivo que ainda não existe** ⇒ o valor é uma promessa até o teste ser escrito |

### Recomendação: **ii** — nome nu, `test_collector_series_mapping.py`

`[RECOMENDAÇÃO DE AGENTE, não decisão]`. Motivos:

1. **`D15` é a única janela em que (ii) é grátis.** Depois da reingestão, migrar de (i) para (ii)
   custa outra limpeza. **Este é o item do menu cujo custo realmente explode com o tempo** — não os
   três de §0.4.
2. **É a convenção majoritária** (3 de 5) e a que o `T-01.6` já citou como regra
   (*"o nome do teste que `T-01.1` criou, não um nome inventado"*).
3. **Recusa (iv)**: `verified_by` tem de nomear um teste **que existe**.
   `backend/tests/sentimento/test_collector_series_mapping.py` existe hoje (`ls` confirma);
   `test_premium_index_catalog.py` não. Identidade servida não se apoia em promessa.
4. **Recusa (iii) apesar de ser a mais correta pela letra da SPEC**: ela coloca o **nome de uma
   função de teste** dentro de um `sha256` servido. Renomear um teste — refactor rotineiro, que
   nenhum portão reprova — re-identifica 8 séries em silêncio. O ganho de especificidade não paga
   essa superfície de quebra. *(Isto é julgamento meu, `[RECOMENDAÇÃO DE AGENTE]`; o owner pode
   legitimamente preferir a letra da SPEC.)*

### ⛔ O que a escolha fecha de forma irreversível

**Tudo.** Escolhido e reingerido, mudar `verified_by` gera outro `series_key_id`, o catálogo e o
disco divergem, e **`/api/v1/series-history` volta `200` com 0 linhas** — os dois lados parecendo
saudáveis em isolamento, que é o pior formato desta falha. **Este é o único campo do menu em que
"decidir depois" não é uma opção.**

### Falsificador, e ele é o do próprio achado

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
print(len({e.key.series_key_id() for e in list_pilot_series_catalog().entries}))"
# e a interseção com `select distinct series_key_id from md.series` tem de ser 12 (hoje: 4)
```

---

## F5 · ⚠️ O 5º campo, que ninguém listou e é irreversível: `interval`

`interval` é o **6º dos 15 termos** e hoje vale `f"{int(interval_s)}s"`, fechado sobre
`config.premium_index_cycle_interval_s` (`collector_series_mapping.py:253-262`), cujo default é
`60.0` (`collectors_cli.py:186`) e que é **lido de variável de ambiente**
(`collectors_cli.py:407-411`).

⛔ **Consequência, e ela não é hipotética:** trocar `PREMIUM_INDEX_CYCLE_INTERVAL_S` de `60` para
qualquer outro valor — ato de **operação**, não de código, sem PR, sem revisão — muda `interval`,
muda o `series_key_id`, e **as 8 séries ficam órfãs de novo, exatamente pelo mesmo mecanismo que
`D15` está pagando para consertar**. A variável de ambiente é hoje **entrada de identidade servida**.

| # | opção | custo |
|---|---|---|
| 1 | **manter** `interval` derivado da cadência de polling | zero trabalho; a armadilha acima continua armada, e a próxima vez que ela disparar o preço é outro marco zero |
| 2 | **congelar** `interval="60s"` como literal no domínio, e fazer o coletor **reprovar no boot** se a cadência configurada divergir | a identidade para de depender de env var; a divergência vira **falha ruidosa no boot** em vez de órfã silenciosa. Custo: ~1 guarda no `main`, e perde-se a liberdade de mudar a cadência sem tocar código — **que é o ponto** |
| 3 | **tirar a cadência da identidade**: `interval="tick"` (ou `"snapshot"`) | a identidade passa a descrever a QUANTIDADE, não a nossa operação; mudar a cadência deixa de re-identificar. Custo: `interval` deixa de ser literal-de-tempo, divergindo das 11 linhas; e perde-se a rastreabilidade de sob qual cadência a linha foi colhida (que `native_grid` **não** recupera) |

**Recomendação: 2** `[RECOMENDAÇÃO DE AGENTE, não decisão]` — é a única que mantém o `interval` atual
(⇒ os `series_key_id` de §0.1 continuam válidos, zero churn) **e** fecha a porta da env var. A (3) é
arquiteturalmente mais limpa e eu a preferiria numa base nova; ela muda os 8 `series_key_id`, e
**`D15` é a janela em que isso é grátis** — se o owner quiser (3), é agora ou nunca.

**Como conferir:** `PREMIUM_INDEX_CYCLE_INTERVAL_S=30` no boot do coletor. Hoje: sobe, grava, e as
linhas novas não casam com nenhuma linha antiga. Com (2): reprova no boot com mensagem nomeando a
divergência.

---

## Interações — o que se resolve na mesma passada, e o que NÃO

| par | mesma passada? |
|---|---|
| `F0` × tudo | `F0` é **pré-condição respondida**: NÃO derivado ⇒ as 8 linhas ficam 8, não 4 |
| `F1` × `F2` | **sim** — a recomendação de `F2` (b) existe **porque** `F1` (1) faz `native_grid ≠ interval` |
| `F4` × `D15` | **um ato só.** `F4` é o único campo cuja janela é o `TRUNCATE` |
| `F5` × `D15` | **um ato só se a escolha for (3)**; se for (2), pode vir depois |
| `F3` × `ADR-007` | **NÃO.** A recomendação (A) foi escolhida justamente para **não** exigir emenda de ADR agora |
| `F2` × `ADR-006`/`D3` | **NÃO.** O campo duplo (`asof_`/`render_`) é dívida própria, com falsificador **já disparado** (§F2) |
| `§0.5` (424 linhas de skew negativo) | **NÃO.** Página própria; muda o que "100% legível" significa, não o que se grava |

## O que este documento NÃO faz

- **Não decide.** Cinco menus, cinco recomendações rotuladas `[RECOMENDAÇÃO DE AGENTE]`. Gate: owner.
- **Não emenda `ADR-007` nem `ADR-006`.** `F3`/A foi escolhida para evitar a primeira; a segunda é
  nomeada como falsificador disparado, não resolvida.
- **Não escreve código** e **não tocou `frontend/`**. Postgres foi lido, nunca escrito.
- **Não decide a métrica `liquidation`** (3º builder órfão, `collector_series_mapping.py:194-208`).
  Ela tem **0 linha** em `md.series` hoje ⇒ `D15` não a força. Fases `04`/`05` de `SPEC-007`.
- **Não decide onde a identidade mora** (item 4 do achado: mover os builders de `use_cases/` para
  `domain/`). É **refactor do escritor**, e só `F4` o toca de raspão — a recomendação (ii) nomeia um
  teste que existe **hoje**, então o refactor pode vir depois sem re-identificar nada.
- **Não julga** escolha de corretora, tamanho de posição ou jurisdição. Fora do meu mandato.

## Falsificador desta página

O mesmo do achado que a originou, e ele é binário:

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
print(len({e.key.series_key_id() for e in list_pilot_series_catalog().entries}))"
```

Hoje **4**. Depois da decisão implementada + reingestão, tem de ser **12**, e a interseção com
`select distinct series_key_id from md.series` tem de ser **12**. Enquanto for menos, esta página
continua aberta — e se for 12 no catálogo mas menos na interseção, **`F4` ou `F5` foram decididos
errado**, que é exatamente a falha que este documento existe para evitar.
