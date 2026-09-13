# ADR-038 — O carimbo `MODELED` é a grade nativa (e não precisa de percentil), e `observed_at` é a segunda barreira que ninguém tinha medido

**Status:** `PROPOSTA` — **DRAFT**. Nasce DRAFT por construção: `SPEC_APPROVED`/`approve` é ato do
**owner**, e o `§7` deste documento tem uma pergunta que **emenda uma decisão do owner** (`D16`) e
que nenhum agente pode responder no lugar dele. Nada foi escrito no ledger por esta sessão.

**Feature:** `cinco-metricas-do-core` · **Componente:** `sentimento` · **Data:** 2026-09-12
**Origem:** `E1` de [`OPCOES-E1-E5.md`](../context/cinco-metricas-do-core/OPCOES-E1-E5.md), decidido
pelo owner como `D16` e **adiado por ele esperando remedição depois do conserto do escalonador**.
**Relação:** aplica `ADR-006`/`SPEC-001` §5.2 · **confirma** `ADR-037`/M3 número a número ·
⛔ **EMENDADO em 2026-09-12 pelo `§9`**, que refuta a última frase do `§3` por medição: `D1`
vale **só** para o OI, e o carimbo do RATIO **não é decidível hoje**. Leia o `§9` antes de
citar o `§3` ·
**corrige** um termo de `D16` · desbloqueia (ou não) o `DoD-3` da fase `03` / PR #222.

---

## 0 · ⛔ A premissa do despacho é FALSA, e é o primeiro fato deste documento

O despacho abriu com *"essa condição agora existe (`GridAlignedTicker` está no master, `f6add06`)"*.
**Não está.** Três comandos, todos `[MEDIDO 2026-09-12T22:5xZ]`:

```bash
git ls-tree -r master --name-only | grep -iE 'ticker|aligned'           # rc=1, NENHUMA linha
git show master:backend/src/modules/sentimento/infra/collectors_cli.py \
  | grep -n 'stop_event.wait(interval_s)'                              # 593:  e  1026:
docker exec deploy-collector-1 grep -n 'stop_event.wait(interval_s)|GridAlignedTicker' \
  /app/src/modules/sentimento/infra/collectors_cli.py                  # 593:  e  1026:  (sem ticker)
```

A linha `1026` é **exatamente** a linha que `OPCOES-D16` §F3 nomeou como causa. O conserto existe,
mas **não em `master` e não no contêiner que está rodando**: ele é o commit `418f47b`
(*"fix(sentimento): O4 — alinha o poll de klines a grade"*), vivo em
`origin/ciclo/d16-atraso-medido-e-alinhamento-de-grade`, **não mergeado**.
`git merge-base --is-ancestor 418f47b master` → **rc=1**. `f6add06` é o merge da PR #220 (painel de
CVD) e **não contém o arquivo**.

**E o defeito continua vivo, medido hoje, não herdado** — janela de regime estável **depois** do
buraco de coleta, `bucket_end >= 1789243200000` (2026-09-12T20:00Z), `n = 696`:

| | `p50` | `p97,5` | `p99` | `max` | `≥ 60.000 ms` |
|---|---:|---:|---:|---:|---:|
| klines, hoje | **30.772** | 59.921 | **61.071** | 62.465 | **16 / 696 = 2,30 %** |
| klines, 2026-09-11 `[DOC: OPCOES-D16 §F0]` | 30.979 | 59.972 | 60.936 | 87.855 | 105 / 4.289 = 2,45 % |

⇒ **regime idêntico.** A remedição que o owner esperava **não aconteceu**, porque o conserto não foi
mergeado. Qualquer `p99` de klines medido hoje continua sendo *"a fotografia de um defeito"*, na
frase que `OPCOES-D16` §2.3 usou para recusar fixar contrato sobre ele.

**A janela declarada, porque ela mede duas coisas se não for declarada:** a produção ficou parada
entre `2026-09-11T19:0xZ` e `2026-09-12T16:39Z` — visível em `count(*)` por hora de klines ao vivo,
que salta de `248` na hora `19` de 11/09 para `116` na hora `16` de 12/09, **20 horas sem nenhuma
linha**. A hora `16` de 12/09 tem `160/240` linhas com atraso `≥ 60 s` e `max = 2.414.710 ms`: é a
**recuperação** do coletor ao religar, não o regime. Por isso a tabela acima começa em `20:00Z`.

---

## 1 · O que eu remedi, com o comando, o `n` — e o controle que pegou o MEU erro antes de ele virar número

O despacho mandou usar controle. Usei, e **o controle disparou na primeira rodada**: o arnês
devolveu `0/61` para `premiumIndex` ao vivo, cujo valor esperado é `61/61` (coletor alinhado à
grade, `p99 = 1.864 ms`). A causa era minha: eu montava `SeriesRow` com o `series_key_id` do banco e
chamava `as_of` com uma `SeriesKey` sintética, e o passo 2 de `as_of` (*"keep only rows of THIS
identity"*) descartava tudo. **Sem o controle, eu teria publicado `0/61` para todo mundo e chamado
isso de medição.** Corrigido o arnês, os dois controles passam:

| controle | valor esperado | medido |
|---|---|---:|
| `C0` — universo **vazio**, mesma chamada | `0/61` por construção | **0/61** |
| `C1` — `premiumIndex` ao vivo (coletor já alinhado) | `~61/61` | **61/61** |

**Script (só leitura, nenhum `insert`/`update`/`delete`, nada semeado):**
`/tmp/…/scratchpad/e1/remede.py` — lê `md.series` por `psql`, monta `SeriesRow`/`Observation`
**reais** e chama o `as_of` **real** (`bar_policy=FINAL_ONLY`, `purpose=RENDERING`).

### 1.1 · Os três fatos que o despacho mandou confirmar ou refutar

**(a) Atraso mínimo de `34,5 s` no OI — CONFIRMADO no valor, REFUTADO como estatística.**

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select symbol, count(*) n, min(available_at-bucket_end) mn, max(available_at-bucket_end) mx
    from md.series where src_label_raw='/futures/data/openInterestHist'
     and available_at-bucket_end <= 900000 group by 1 order by 1;"
# BTCUSDT|3|34532|634532   ETHUSDT|3|36743|636743   LINKUSDT|3|39303|639303   SOLUSDT|3|42343|642343
docker exec … -c "select count(distinct available_at), count(*) from md.series
                    where src_label_raw='/futures/data/openInterestHist'
                      and available_at-bucket_end <= 900000;"   # → 4 | 12
```

`34.532 ms` está lá. Mas os `12` registros "ao vivo" são **4 instantes de busca** — um por símbolo —
e os três atrasos de cada símbolo são `x`, `x+300.000`, `x+600.000`: é **uma passada só** lendo três
buckets consecutivos. ⇒ `34,5 s` é a **idade do bucket mais novo no instante de uma requisição**,
não uma distribuição de atraso. **`p99_lag('/futures/data/openInterestHist')` não é mensurável hoje,
em nenhum `n`.**

**(b) `0 de 8.064` — CONFIRMADO no literal, e a leitura útil é outra.**

`count(*) filter (where available_at < bucket_end)` sobre as `8.064` linhas → **`0`**, mas isso é
trivialmente verdadeiro (seria lookahead, e `SPEC-001` §3.2 já o proíbe). O número que **importa**:

```bash
docker exec … -c "select case when available_at-bucket_end > 900000 then 'backfill' else 'ao_vivo' end,
  count(*), min(available_at-bucket_end), max(available_at-bucket_end)
  from md.series where src_label_raw='/futures/data/openInterestHist' group by 1;"
# ao_vivo|12|34532|642343      backfill|8052|934532|604539911
```

**`8.052` de `8.064` (99,85 %)** carregam `available_at` = instante da nossa busca, com atraso de
até `604.539.911 ms ≈ 7,0 d`. **É `E1` inteiro, e ele é o bloqueio do `DoD-3` da PR #222.**

**(c) 🔴 A PR #222 afirma *"é tempo, não código"* — e isso é FALSO. Este é o maior achado deste
documento.**

O corpo da PR #222 diz, verbatim: *"`30 × 5 min = 150 min` de coletor em produção fecham o item —
**é tempo, não código**"*. **Não existe coletor de open interest.**

```bash
docker exec … -c "select endpoint, count(*) n, max(started_at) ultimo from md.ingest_run group by 1;"
# /fapi/v1/klines                            |1434| 2026-09-12T22:54:56Z
# /fapi/v1/premiumIndex                      |4706| 2026-09-12T22:54:46Z
# /futures/data/globalLongShortAccountRatio  |   1| 2026-09-12T14:06:06Z
# /futures/data/openInterestHist             |   1| 2026-09-12T13:30:32Z
grep -n 'def _run_.*collector' backend/src/modules/sentimento/infra/collectors_cli.py
# 506: _run_premium_index_collector   641: _run_force_order_collector   916: _run_klines_collector
```

**`1` run, uma vez, e nenhum laço no CLI.** As `8.064` linhas são uma passada única de
`binance_oi_history_client.py`. Esperar `150 min` produz **zero** linhas novas. ⇒ o `DoD-3` da fase
`03` **não** se fecha com tempo de relógio; ele se fecha com `E1` ou com um coletor que não existe.

### 1.2 · A matriz de `ADR-037`/M3 — reproduzida NÚMERO A NÚMERO, no mesmo universo

Universo **literal** de `M3`: `61` slots de **1 min**, `t = slot + 59.999`, `knowledge_time = agora`,
BTCUSDT, o `as_of` real.

| linha | `ADR-037`/M3 | **remedido hoje** |
|---|---:|---:|
| `globalLongShortAccountRatio` · RATIO · `bucket_interval_ms = 60.000` | `0 / 61` | **`0 / 61`** ✅ |
| ↳ `bucket_interval_ms = 300.000` (a grade nativa) | `4 / 61` | **`4 / 61`** ✅ |
| ↳ `300.000` **+ `E1` simulado** (`available_at := bucket_end + 66.712`) | `48 / 61` | **`48 / 61`** ✅ |
| `openInterestHist` · STOCK · `60.000` | `1 / 61` | **`1 / 61`** ✅ |
| ↳ `300.000` **+ `E1` simulado** (`+ 34.532`) | `61 / 61` | **`61 / 61`** ✅ |

**`ADR-037` está CONFIRMADA, e a estimativa `4/61 → 48/61` é exata.** `[MEDIDO 2026-09-12, n = 1.000
linhas RATIO / 2.016 OI, BTCUSDT; controles `C0`/`C1` acima]`. Nada nela foi herdado: reproduzi.

**E no passo que o painel realmente desenha** (`panels.oi.slots` é a grade de **5 min**, `61` slots),
o mesmo arnês devolve **`61/61` para OI e `61/61` para RATIO** com `E1` simulado, contra `1/61` e
`2/61` hoje ⇒ `DoD-3` (`N ≥ 30` barras nativas) **passa com `E1` e só com ele**.

---

## 2 · 🔴 O achado que `ADR-037` não podia ver: `available_at` sozinho não move o caminho de DECISÃO

`M3` rodou com `knowledge_time = agora` — a semântica do painel ao vivo. Rodei a mesma matriz com
`knowledge_time = t`, que é a semântica do **backtest** (`SPEC-001` §2.5: `reproduzir(run) =
(bundle_hash, window, knowledge_time)`), e o resultado **inverte**:

| braço (OI, STOCK, grade nativa `300.000`, `61` slots de 5 min) | `kt = agora` | **`kt = t`** |
|---|---:|---:|
| como está hoje | `1 / 61` | `1 / 61` |
| `E1` conforme `D16`: só `available_at := bucket_end + 300.000` | **`61 / 61`** | **`1 / 61`** |
| `E1` com `available_at` **e** `observed_at` reconstruídos | `61 / 61` | **`61 / 61`** |

**A causa é o terceiro filtro de `as_of`**, que a discussão de `E1` inteira nunca citou: o passo 3
da docstring é uma **conjunção** de `R-1` (`available_at <= t`), `R-2` (`bucket_end <= t`) **e o
horizonte de conhecimento** (`observed_at <= knowledge_time`). `D16` manda, verbatim, *"o instante da
busca continua em `ingested_at`/`observed_at`, que já o guardam"* ⇒ numa linha de backfill
`observed_at` continua sendo `2026-09-12T13:30Z`, e **ele barra a leitura exatamente como
`available_at` barrava**.

⇒ **`E1` como `D16` o escreveu compra o PIXEL e não compra o BACKTEST** — e o backtest era a metade
cara, a que `OPCOES-E1-E5` §E1 usou para recusar a opção 3 (*"não resolve `ADR-036`"*). O argumento
que elegeu a opção 2 vale, mas **só** se `observed_at` acompanhar. `[MEDIDO 2026-09-12]`

---

## 3 · `D1` — O carimbo `MODELED` é `bucket_end + 1 grade nativa`, e ele NÃO precisa de percentil

**Decisão (minha, de arquitetura — não emenda nada, não exige o owner):**

> Para `/futures/data/openInterestHist`, `available_at_MODELED = bucket_end + 300.000` (uma grade
> nativa). Isto **é** `SPEC-001` §5.2 aplicada ao pé da letra, **não** uma emenda a ela.

**O argumento, e ele dissolve a pré-condição em vez de negociá-la.** `SPEC-001` §5.2 é

```
available_at_MODELED = próximo ponto da grade nativa >= ( bucket_end + p99_lag(endpoint, observer_region) + margem )
```

com *"arredondamento sempre PARA CIMA"*. Para uma grade de `300.000 ms`, **todo** valor de
`p99_lag + margem` em `(0, 300.000]` produz **o mesmo** carimbo: `bucket_end + 300.000`. ⇒ o carimbo
é **invariante sobre toda a faixa plausível da grandeza que não conseguimos medir**. É o colapso que
`OPCOES-D16` §F1 nomeou para klines — onde ele jogava **contra** nós, porque a grade era `60.000` e
o `p99` observado (`60.936`) estava **fora** da faixa. Numa grade de `300.000` ele joga **a favor**:
a única observação que temos (`34.532 ms`) está `8,7×` dentro dela, e o **único** endpoint deste
repositório com coletor alinhado à grade e `n` alto — `premiumIndex`, `p99 = 1.772 ms`,
`n = 37.872` `[MEDIDO 2026-09-12]` — está `169×` dentro.

**A pré-condição de `D16` (*"atraso medido por endpoint"*) fica SATISFEITA no que ela protege e
HONESTA no que ela não alcança:** ela existe para impedir o default `event_time + interval`, que
`SPEC-001` §5.2 mediu **361× otimista**. Aqui não há default: há uma grandeza cujo valor exato é
**irrelevante para o resultado**, e isso é uma propriedade demonstrável, não uma dispensa.

**O que `D1` fecha e não volta atrás:** `md.series` passa a conter linhas cujo `available_at` é
**calculado** — a consequência que `D16` já declarou. A partir daí todo consumidor lê
`availability_source`, e todo relatório de backtest declara o modelo de atraso.

~~**`D1` vale para `/futures/data/openInterestHist` e para
`/futures/data/globalLongShortAccountRatio`** (mesma grade nativa de `300.000 ms`, mesmo padrão de
uma-passada-só).~~ ⛔ **ESTA FRASE ESTÁ ERRADA e foi REFUTADA POR MEDIÇÃO — ver `§9`.** Ela vale
**só** para `/futures/data/openInterestHist`. Para o RATIO, o carimbo que ela prescreve mede
`0/61`, e nenhum outro carimbo é decidível hoje: `§9`.

**Não vale para klines** — lá a grade é `60.000`, o `p99` medido hoje é `61.071` e está **fora** da
faixa; klines continua sendo `D16`/`O1`/`O4`, e o `§7.3` diz o que falta.

---

## 4 · Alternativas RECUSADAS, com o custo de cada uma

| # | alternativa | custo medido / declarado — por que foi recusada |
|---|---|---|
| **A1** | **Esperar a remedição, como o despacho supôs** | **impossível hoje:** o conserto não está em `master` nem no contêiner (`§0`), e o regime de hoje é o mesmo de 11/09 (`2,30 %` contra `2,45 %`, `n = 696`). E **não desbloquearia nada**: a remedição é do escalonador de **klines**; o `DoD-3` da PR #222 é de **OI**, endpoint que não tem coletor nenhum (`§1.1c`). Esperar custa calendário e compra **zero** |
| **A2** | **Medir `p99_lag` do OI de verdade primeiro** (subir coletor ao vivo de OI, esperar `n` suficiente) | é a opção **correta em tese** e **cara em calendário**, e `§3` mostra que ela **não muda o carimbo**: qualquer `p99` em `(0, 300.000]` dá `+300.000`. Custo real: 1 task nova em `sentimento` (o laço de OI não existe — `§1.1c`), 1 deploy, e ≥ 1 dia de coleta antes de `D15` poder rodar. Ela **não é recusada como trabalho** — é recusada como **pré-condição de `E1`**: é `§7.3`, não bloqueio |
| **A3** | **Baixar a estatística** (`p95`/`p97,5` em vez de `p99`), como `O2` de `OPCOES-D16` | emenda `SPEC-001` §5.2 em **dois eixos**, e o segundo é a garantia *"o erro é sempre pessimista … nunca mais cedo"*, comprada com número (`21,96 %` de inversão de sinal do ΔOI de 15 min, `n = 8.629` `[DOC: SPEC-001 §5.2]`). **E não compra nada aqui**: numa grade de `300.000` todo percentil dá o mesmo carimbo. Pagar uma emenda anti-lookahead por um resultado idêntico é pagar por nada |
| **A4** | **Ler history por `event-time`**, deixando `as_of` intacto (opção 3 de `OPCOES-E1-E5` §E1) | entrega o pixel e **não** entrega o backtest, e cria **dois leitores** para a mesma série — a classe *"duas superfícies, dois valores"* que `E4` existe para fechar. Custo: 1 leitor novo em `sentimento` + a regra escrita de quem pode chamá-lo. ⚠️ Hoje ela é **menos ruim do que parecia**, porque `§2` mostra que `D16` sozinho já entrega **só** o pixel — mas continua sendo duas superfícies |
| **A5** | **Não mexer** (opção 1 de `OPCOES-E1-E5` §E1) | a profundidade de `ADR-036/D5` (klines desde `2019-09-08`) fica **inalcançável sem que nada reprove** — o `rc=0` ambíguo de `ADR-012`. E `D17` acabou de decidir largura-antes-de-profundidade **contando com** `E1` uma vez só sobre as 5 métricas; recusar `E1` reabre `D17` |
| **A6** | **Afrouxar o `DoD-3` da PR #222** (contar só a janela ao vivo) | recria `C5` no dia em que ele foi consertado: o portão para de medir a propriedade e passa a medir a si mesmo. **Recusada sem custo compensatório** |
| **A7** | **`availability_model_id` na linha** (`O6` de `OPCOES-D16`) | **não recusada — adiada com dono.** É a única coisa que torna `D1` revisável sem arqueologia, mas mexe em `md.series` ⇒ toca `ADR-008` (projeção canônica / `sha256`). Dona é `ADR-008`, não esta ADR. `D15` (TRUNCATE) reduz o custo de não tê-la agora a **zero linhas a reescrever**; ela volta à mesa quando o primeiro remodelo acontecer |

---

## 5 · FALSIFICADORES

**`F-1` — o falsificador de `D1`, e ele é a observação que mostra que o carimbo era lookahead.**
Quando existir um coletor ao vivo de `/futures/data/openInterestHist` com `n ≥ 1.000` instantes de
busca distintos, rode:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c "
 select count(distinct available_at) n_polls,
        percentile_disc(0.99) within group (order by available_at-bucket_end) p99
   from md.series
  where src_label_raw='/futures/data/openInterestHist' and availability_source='OBSERVED'
    and available_at-bucket_end <= 900000;"
```

Se `p99 > 300.000` com `n_polls >= 1.000`, **`D1` estava errado**: o carimbo `+1 grade` afirmou
conhecimento que não tivemos, e toda linha `MODELED` de OI tem de ser recarimbada. Hoje o mesmo
comando devolve `n_polls = 4` — **e é por isso que `F-1` ainda não é computável, o que está dito
aqui em vez de escondido**. `[NÃO MEDIDO: p99 de OI]`

**`F-2` — o falsificador de `§2`, e ele é barato.** Depois de `E1` em código, rodar o arnês de
`§1.2` com `knowledge_time = t` sobre OI tem de devolver **`61/61`**. Se devolver `1/61`, então
`observed_at` ficou com o instante da busca e `E1` comprou só o pixel — exatamente o que `§2` mede
hoje, e o backtest continua com o teto que `ADR-036/D5` foi comprada para remover.

**`F-3` — o falsificador do `§0`, e ele é uma linha.** `grep -n 'stop_event.wait(interval_s)'` sobre
`collectors_cli.py` em `master` tem de continuar devolvendo `1026:` **enquanto** o `p99` de klines
da janela estável continuar acima de `60.000`. No dia em que as duas coisas deixarem de andar
juntas, uma das duas medições deste documento estava errada.

**`F-4` — o falsificador do `D15` continua o mesmo, e agora tem um número de partida remedido:** se
após `E1` + reingestão a fração legível **não** subir, a causa diagnosticada estava errada. Partida
medida hoje: OI `1/61`, RATIO `2/61` (slots de 5 min); alvo `61/61` nos dois.

---

## 6 · ⚠️ Isto NÃO é migração de `SeriesKey` — e o que é, está dito

Os **15** termos são `provider · venue · instrument_id · metric · cohort · interval · unit · denom ·
nature · ts_convention · reduction · quantity_field · label_shift · aggregation_scope · verified_by`
`[DOC: backend/src/modules/sentimento/domain/series_key.py:15-29]`. **Nenhum** deles é tocado:
`available_at`, `availability_source` e `observed_at` são colunas de **linha**, não termos de chave.
⇒ `series_key_id` não muda, o `sha256` da projeção canônica de `ADR-008` não muda, **é correção, não
migração de identidade de série.**

**O que MUDA de identidade, e por isso está escrito aqui e não numa nota de rodapé:** `observed_at`
é termo da **chave única física** de `md.series` — `UNIQUE (series_key_id, symbol, source,
bucket_end, observed_at)` `[MEDIDO: pg_indexes]`. A opção `§7.1/A` reescreve `observed_at` ⇒ muda a
**linha**, não a **série**. Sobre base já gravada isso seria migração de dado com risco de base
mista; **sob `D15` (TRUNCATE + reingestão) o custo é zero linhas**, que é precisamente o motivo pelo
qual `D15` e `D16` foram decididos juntos.

---

## 7 · O que EXIGE o owner — e vai como menu com custo, não como pergunta aberta

### 7.1 · A única pergunta que emenda uma decisão dele: o que `observed_at` carrega numa linha `MODELED`

`D16` diz, verbatim: *"o instante da busca continua em `ingested_at`/`observed_at`, que já o
guardam"*. `§2` mede que essa cláusula custa o backtest. As duas saídas:

| opção | o que faz | custo, medido |
|---|---|---|
| **A** — `observed_at = available_at` na linha `MODELED`; o instante da busca fica em **`ingested_at` sozinho** | o horizonte de conhecimento passa a concordar com o carimbo | **`61/61` em `kt = t`** ⇒ backtest ganha os 7 dias, que é o que `ADR-036/D5` foi comprada para dar. Custo: **emenda uma frase de `D16`** (por isso é do owner); `observed_at` é termo da chave única física (`§6`), o que sob `D15` custa **zero linhas**; e `argmin(observed_at)` de `D4.13` passa a empatar entre observações do mesmo bucket importado — desempate tem de ser escrito, não herdado |
| **B** — manter `D16` como está | zero emenda, zero caneta | **`1/61` em `kt = t`**: o backtest continua com o teto de hoje. `ADR-036/D5` (klines desde `2019-09-08`) permanece inalcançável **sem que nada reprove** — o `rc=0` ambíguo de `ADR-012`. O painel ao vivo, esse, funciona (`61/61`) |

**Recomendação do `/architect`, rotulada como opinião e não como decisão: `A`.** `B` paga o preço
inteiro de `E1` (carimbo calculado, todo consumidor obrigado a ler `availability_source`) e recebe
metade do benefício.

### 7.2 · Mergear `418f47b` (o `GridAlignedTicker`), sim ou não

Não é decisão minha e **não bloqueia `D1`**. Custo de **não** mergear, medido hoje: `2,30 %` dos
buckets de klines ao vivo chegam com atraso `≥ 1` grade (`16/696`), degradando a decisão ao vivo, não
só o backtest. Custo de mergear: um ciclo de QA + deploy, e **a janela de medição de klines volta a
zero** (`OPCOES-D16`/`O4`) — o `p99` de klines fica indisponível pelo tempo da nova coleta.

### 7.3 · Coletor ao vivo de open interest e de long/short — não existe, e `D17` conta com ele

`§1.1c`: `1` run para cada, nenhum laço no CLI. `D17` decidiu largura-antes-de-profundidade e seu
falsificador exige **5 famílias com linhas > 0** ao fim das fases `02`–`05`. Hoje são **4**
famílias, mas **duas delas não coletam** — têm um backfill parado. Isto é trabalho de fase, com
dono, e é também o que torna `F-1` computável um dia. **Não bloqueia `D1`; bloqueia `F-1`.**

### 7.4 · O que ISTO destrava, se `A` for escolhida

PR #222 entrega a tela correta e reprova `DoD-3` com `N = 2`. Com `D1` + `7.1/A` em código, o mesmo
universo mede **`61/61`** — `DoD-3` (`N ≥ 30`) passa **por dado real**, sem afrouxar o `expect` e sem
`make e2e` vermelho por motivo conhecido. **Enquanto isso não estiver em código, a PR #222 não deve
ser mergeada**, e a frase *"é tempo, não código"* no corpo dela precisa ser corrigida — ela está
factualmente errada (`§1.1c`).

---

## 8 · Rótulos de força deste documento

O `§9` é a **emenda de 2026-09-12** que refuta a última frase do `§3`: `§9.1`, `§9.2`, `§9.4` e
`§9.5` são `[MEDIDO 2026-09-12]` com o comando e o `n` ao lado, contra `deploy-postgres-1` **somente
leitura**; o mecanismo do `§9.2` é `[DOC: series_history.py:38,149,211,255]`; o `p99` do RATIO é
`[NÃO MEDIDO]` e `§9.4` mede **por que** ele não é mensurável em vez de herdar a conclusão do OI; a
recomendação de `§9.7/O-A` é **opinião de arquitetura**, rotulada como tal.

`§0`, `§1`, `§2` e as tabelas de `§3` são `[MEDIDO 2026-09-12]`, cada uma com o comando ao lado, `n`
declarado, contra `deploy-postgres-1` **somente leitura** — nenhum `insert`/`update`/`delete`,
nada semeado. A leitura de `SPEC-001` §5.2, de `ADR-036/D5`, de `ADR-037`/M3, de `D15`/`D16`/`D17` e
dos 15 termos de `SeriesKey` é `[DOC]` com linha citada. A recomendação de `§7.1` é **opinião de
arquitetura**, rotulada como tal. O `p99` real de `openInterestHist` é `[NÃO MEDIDO]` e `§3`
argumenta por que ele não muda o resultado — o argumento é verificável, não é dispensa.

---

## 9 · ⛔ EMENDA (2026-09-12, mesmo dia) — `D1` NÃO se estende ao RATIO, e o carimbo dele NÃO é decidível hoje

**O que emenda:** a última frase do `§3` deste documento, tachada acima. **O que NÃO emenda:** nada
do `§7.1` — aquela pergunta continua pendente do owner e esta emenda não a toca. **Quem escreve:**
o autor do `ADR-038`, sobre a refutação de
[`gates/ADR-038-D1-builder.md`](../context/cinco-metricas-do-core/gates/ADR-038-D1-builder.md) `§2`.
**Nada foi escrito no ledger, nenhum código de produção foi tocado por esta emenda.**

### 9.0 · A decisão, em três linhas

> 1. **`D1` vale para `/futures/data/openInterestHist` e para mais nada.** Para
>    `/futures/data/globalLongShortAccountRatio` ele é uma **regressão medida**, e a recusa que o
>    builder pôs em `GridInvariantEndpoint.__post_init__` está **certa e fica**.
> 2. **O RATIO NÃO recebe carimbo `MODELED` agora.** Continua `OBSERVED`. Não porque o carimbo seja
>    indesejável, mas porque **nenhum valor dele é defensável com o que hoje é mensurável** — e
>    isto é o oposto do que vale para o OI, pelo motivo do `§9.2`.
> 3. **`D1` deixa de ser uma lista de endpoints e passa a ser uma regra com pré-condição escrita**
>    (`§9.3`). A lista era o defeito: ela escondia que o argumento do `§3` depende de uma
>    propriedade que nem todo endpoint tem.

### 9.1 · ⚠️ Janela e universo, declarados antes dos números — porque a população se moveu DUAS vezes

A população de `md.series` **dobrou no meio da medição do builder** (`8.064 → 16.128` linhas de OI) e
**voltou a andar durante a minha** (`1.506 → 1.507` linhas de RATIO de BTCUSDT entre duas rodadas
minutos depois uma da outra). Por isso **todo número abaixo traz o universo junto**, e por isso a
conclusão se apoia na **varredura de offset** — que é aritmética e o builder já provou estável sobre
uma população dobrada — e **não** na linha-base, que se move.

**Universo desta emenda** `[MEDIDO 2026-09-12, `deploy-postgres-1`, somente leitura, nenhum
`insert`/`update`/`delete`, nada semeado]` — toda linha de `md.series`, sem filtro de tempo:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select src_label_raw, count(*) n, count(distinct available_at) n_polls,
         count(*) filter (where available_at-bucket_end <= 900000) n_aovivo,
         min(available_at-bucket_end), max(available_at-bucket_end)
    from md.series group by 1 order by 1;"
# /fapi/v1/klines                           |248168|6144|6625|12       |604749985
# /fapi/v1/premiumIndex                     | 38472|4809|38472|-100    |     2123
# /futures/data/globalLongShortAccountRatio |  6022|  34|  54|   21770 |150076685
# /futures/data/openInterestHist            | 16148|  60|  44|   29735 |604583112
```

### 9.2 · 🔴 O mecanismo — e o erro do `§1.2` é mais fundo do que "simulei o atraso cru"

O builder está certo no veredito e o diagnóstico dele (`as_of_accessor.py:328` veta
`age_ms >= bucket_interval_ms` para natureza sem carry-forward) é exato. **Mas a causa não para aí, e
o que falta é o que decide a saída.**

**O caminho de leitura de PRODUÇÃO não sonda na grade nativa. Ele sonda a cada `60.000 ms`**
`[DOC: backend/src/modules/sentimento/use_cases/series_history.py:38,149,255 + :211]`:

| linha | o que diz |
|---|---|
| `:38` | `_GRID_STEP_MS = 60_000` — o passo do relatório, **constante de módulo**, não por série |
| `:149` | `return grid_instant + _GRID_STEP_MS - 1` — o instante sondado é `grade + 59.999` |
| `:255` | `grid_instant += _GRID_STEP_MS` — 61 sondagens de 1 min |
| `:211` | `bucket_interval_ms=entry.native_grid_ms` — a **política** usa `300.000`, e o comentário ao lado explica por quê (`ADR-037/D1`) |

⇒ a janela de legibilidade `[bucket_end + Δ, bucket_end + 300.000)` **é amostrada em passos de
60.000**. A leitura não é uma função contínua de `Δ`: é uma **escada de degraus de `60.000 ms`**.
Medida por mim, na forma de produção (passo `60.000`, política `300.000`), não na forma de 5 min que
o `§1.2` usou:

```bash
# varredura propria (somente leitura), mesma construcao do builder, offsets que decidem:
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python \
  docs/context/cinco-metricas-do-core/gates/ADR-038-emenda-varredura-architect.py
# a linha-base do R1 (forma de producao, available_at REAL do banco):
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python \
  docs/context/cinco-metricas-do-core/gates/ADR-038-emenda-baseline-architect.py
```

| `offset Δ` | `openInterestHist` (`STOCK`) | **`globalLongShortAccountRatio` (`RATIO`)** |
|---:|---:|---:|
| `0` | `61/61` | `61/61` |
| `34.532` | `61/61` | `61/61` |
| **`59.999`** | `61/61` | **`61/61`** ← último ponto do primeiro degrau |
| **`60.000`** | `61/61` | **`48/61`** ← o degrau cai aqui, **não** em `300.000` |
| `76.685` · `119.999` | `61/61` | `48/61` |
| `120.000` · `179.999` | `61/61` | `36/61` |
| `180.000` | `61/61` | `24/61` |
| `299.999` | `61/61` | `12/61` |
| **`300.000`** (o que `D1` emite) | **`61/61`** | **`0/61`** |

`[MEDIDO 2026-09-12, 61 slots de 1 min, `t = slot + 59.999`, `kt = agora`, BTCUSDT, `as_of` real,
`bar_policy=FINAL_ONLY`, `purpose=RENDERING`; `n = 4.038` linhas OI / `1.506` RATIO; controles `C0`
universo vazio `0/61` e `C1` `premiumIndex` ao vivo `61/61`]`

⇒ **a invariância que o `§3` provou é real, mas a largura dela não é `300.000` — é `60.000`.** Para o
OI (carry-forward) ela cobre a faixa inteira e o `p99` não medido **não muda o resultado**. Para o
RATIO ela cobre **um degrau**, e o `p99` não medido **escolhe entre `48/61` e `0/61`**. É a MESMA
grandeza não medida com consequência oposta, e é exatamente por isso que `D1` não se transporta.

### 9.3 · `D1`, na forma corrigida — regra com pré-condição, não lista de endpoints

> **`D1'`** — `available_at_MODELED = bucket_end + 1 grade nativa` é decidível **sem** medir
> `p99_lag` **se e somente se** a leitura for invariante sobre toda a faixa plausível do atraso.
> Ela é invariante quando `CARRY_FORWARD_BY_NATURE[nature]` é `True` (a janela é
> `[bucket_end+Δ, bucket_end+staleness)`, e `staleness = 600.000` para o OI — medido: `61/61` de
> `Δ=0` a `Δ=300.000`, e `0/61` em `600.000`, que é a fronteira e mostra que o instrumento morde).
> Quando é `False`, a janela é `[bucket_end+Δ, bucket_end+grade_nativa)` amostrada em passos de
> `_GRID_STEP_MS`, ⇒ `D1` exige **`p99_lag + margem ≤ _GRID_STEP_MS − 1`** conhecido. **Não sabendo,
> não carimba.**

### 9.4 · `p99_lag` do RATIO é mensurável hoje? **NÃO — e eu medi, não herdei do OI**

`n_polls = 34` sobre `6.022` linhas, **todas de backfill** — nenhum coletor ao vivo nasceu (`§7.3`
segue de pé). Mas a resposta não é *"poucos polls"*: é que as três medições possíveis **divergem**.

**(i) Limite SUPERIOR por bucket** — o menor `available_at` já visto para cada bucket é um teto do
atraso dele. `n = 2.486` buckets, `52` com teto `≤ 900.000`: `min = 21.770`, **`p50 = 182.911`**,
`max = 677.419` — e `677.419 > 2 grades nativas`.

**(ii) Limite INFERIOR, e ele é uma PROVA, não uma estimativa.** `4` dos `34` polls encontraram o
bucket corrente **ausente**, e o mesmo bucket aparece na tabela depois — logo ele **não estava
publicado** naquele instante:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with polls as (select symbol, available_at, min(available_at-bucket_end) a from md.series
   where src_label_raw='/futures/data/globalLongShortAccountRatio' group by 1,2)
select symbol, a-300000 as idade_do_bucket_ausente, available_at
  from polls where a > 300000 order by 2 desc;"
# ETHUSDT|76685   BTCUSDT|76167   LINKUSDT|67417   ETHUSDT|67074      -> 4 de 34 polls
```

e os quatro **existem** depois (`exists(...)` → `t` nos quatro), vistos pela primeira vez em
`138.231`, `199.089`, `482.911` e `483.290` ms após o fechamento. ⇒ **o atraso do RATIO passa de
`67.074 ms` em `4/34 = 11,8 %` dos instantes de busca.**

**(iii) O controle que impede a leitura preguiçosa** — *"a requisição não alcança o bucket mais
novo"* seria a explicação alternativa, e ela está **refutada**: `3` dos `34` polls têm
`age_newest < 60.000` (o bucket corrente presente em menos de um minuto). A requisição alcança
quando o dado existe.

⇒ **VEREDITO: `p99_lag('/futures/data/globalLongShortAccountRatio')` NÃO é mensurável hoje, em
nenhum `n`** — pelo mesmo motivo estrutural do OI (`§1.1a`: instantes de busca, não distribuição de
atraso), e com um agravante próprio: o pouco que é mensurável prova que o atraso **atravessa o
degrau de `60.000`** e **nada** o limita abaixo de `300.000`. Todos os degraus da escada do `§9.2`
continuam vivos. `[MEDIDO 2026-09-12]` · `[NÃO MEDIDO: p99 do RATIO]`

### 9.5 · Alternativas RECUSADAS, cada uma com o custo medido

| # | saída | cobertura medida | por que foi recusada |
|---|---|---:|---|
| **R1** | **manter `OBSERVED`, sem carimbo** — a saída ESCOLHIDA | `20/61` hoje na forma de produção (OI: `30/61`); `7/61` na forma de 5 min, contra os `4/61` que o builder mediu ~2 h antes | **não é gratuita e o custo está aqui:** o backfill com até `150.076.685 ms ≈ 1,7 d` de atraso fica ilegível, e o número que o painel mostra **depende de quando a última passada de backfill rodou** — é instável por construção. Escolhida assim mesmo: é a única que não afirma conhecimento que não tivemos |
| **R2** | carimbar `bucket_end + 120.000` (o menor múltiplo de `_GRID_STEP_MS` acima do maior atraso **provado**, `76.685`) | `48/61`, **estável** | **De onde vem o número? De um `max` sobre `n = 34`** — e o `§9.4(i)` mede tetos de até `677.419 ms`. Nenhuma medição escolhe o degrau: `48/61`, `36/61`, `24/61` e `12/61` são todos compatíveis com os dados. Carimbar aqui é **apostar num degrau** e chamar a aposta de modelo. ⚠️ **E é aqui que a pergunta "por que percentil é diferente aqui" se responde: não é diferente — é PIOR.** No OI eu não recusei o percentil, eu **dissolvi** a pré-condição mostrando que o valor não muda o resultado. No RATIO ele muda o resultado por `4×`, então a dissolução não está disponível e a pré-condição de `D16` (*"atraso medido por endpoint"*) fica **de pé, intacta e binding**. Recusá-la aqui seria usar o argumento do OI onde a premissa dele é falsa |
| **R3** | carimbar `bucket_end + 59.999` (**o único offset que dá `61/61`**) | `61/61` | **lookahead MEDIDO, não suposto:** `§9.4(ii)` prova `4` buckets publicados depois de `67.074`–`76.685 ms`. O carimbo afirmaria conhecimento `≥ 7 ms` antes do dado existir, em `11,8 %` dos casos medidos. Viola a garantia de `SPEC-001` §5.2 (*"o erro é sempre pessimista … nunca mais cedo"*), que foi comprada com número (`21,96 %` de inversão de sinal, `n = 8.629`). **Recusada com número** |
| **R4** | `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = True` | `61/61` | reverte uma decisão que tem número **contra**: somar 3 buckets de 5 min de `sum_taker_long_short_vol_ratio` dá `p50 = 3,1809` onde o verdadeiro é `~0,9707` — **3,3× inflado sob um título honesto** `[DOC: as_of_accessor.py:105-118 citando SPEC-001 §5.11]`. A tabela é chaveada por `nature`, então a troca atinge **as 4 séries long/short juntas**, incluindo a de volume taker que produziu aquele número. E compraria `61/61` **desenhando o bucket anterior** — a classe *"a um minuto de atraso e nada diz"* que `series_history.py:130` nomeia. **Recusada** |
| **R5** | mudar a `nature` do endpoint (`RATIO → STOCK`, ou o 6º membro que `as_of_accessor.py:111` já nomeia como pergunta em aberto) | `61/61` | **⚠️ ISTO É MIGRAÇÃO, NÃO CORREÇÃO, E VAI NA CARA:** `nature` é **1 dos 15 termos de `SeriesKey`** `[DOC: series_key.py:15-29]` ⇒ `series_key_id` muda ⇒ o `sha256` da **projeção canônica de `ADR-008`** muda para toda série long/short. Sob `D15` (TRUNCATE + reingestão) o custo em **linhas** é zero; o custo em **identidade** não é, e todo documento que cita um `series_key_id` de long/short passa a citar um id morto. **Não é decisão minha — é do owner** (`§9.7/O-B`) |
| **R6** | o passo do relatório deixa de ser `_GRID_STEP_MS` fixo e passa a ser a grade nativa para série de grade larga | `61/61` a **qualquer** carimbo `≤ 299.999` (medido: `59.999`, `120.000`, `299.999` → `61/61`; `300.000` → `0/61`) | **é a única saída que ataca a causa** do `§9.2` em vez do sintoma — e **não é minha nem do owner**: o passo de `60.000` é `ADR-034/D6` (*"serves only"*, citado em `series_history.py:270`). Custo: a cadência do fio de `/series-history` passa a ser **por série**, e o painel desenha `12` pontos onde hoje desenha `61`. Vai para `ADR-034` como pergunta com dono, não é decidida aqui |
| **R7** | afrouxar o `DoD-3` para o RATIO | — | mesma recusa de `A6`: o portão pararia de medir a propriedade e passaria a medir a si mesmo |

### 9.6 · FALSIFICADORES desta emenda

**`F-5` — o falsificador da decisão, e ele é a observação que me mostra errado.** Quando existir
coletor ao vivo de `/futures/data/globalLongShortAccountRatio` com `n_polls ≥ 1.000` distintos e
`availability_source='OBSERVED'`:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c "
 select count(distinct available_at) n_polls,
        percentile_disc(0.99) within group (order by available_at-bucket_end) p99
   from md.series where src_label_raw='/futures/data/globalLongShortAccountRatio'
    and availability_source='OBSERVED' and available_at-bucket_end <= 900000;"
```

Se `p99 + margem <= 59.999` com `n_polls >= 1.000`, **esta emenda estava errada**: `D1'` autoriza o
carimbo, ele rende `61/61`, e o `§9.5/R3` deixa de ser lookahead. Se `p99 > 59.999`, a emenda está
certa **e o ganho nunca poderá vir do carimbo** — o teto honesto é o degrau em que `p99` cair, e o
`61/61` só existe por `R5` ou `R6`. Hoje o comando devolve `n_polls = 34` e **`F-5` não é
computável**, o que está dito aqui em vez de escondido. `[NÃO MEDIDO: p99 do RATIO]`

**`F-6` — o falsificador do MECANISMO, e ele é uma linha.** Toda esta emenda depende de o passo do
relatório ser uma constante de `60.000`:

```bash
grep -n '_GRID_STEP_MS = ' backend/src/modules/sentimento/use_cases/series_history.py   # 38:_GRID_STEP_MS = 60_000
```

No dia em que isso deixar de devolver `60_000` — ou em que o passo virar per-série (`R6`) — a escada
do `§9.2` muda de lugar e **`§9.3`/`D1'` tem de ser remedida antes de ser citada**. Uma emenda que
não diz o que a invalida é doutrina.

**`F-7` — o falsificador da recusa em código.** A recusa do builder em
`GridInvariantEndpoint.__post_init__` tem de continuar reprovando uma entrada cuja `Nature` não faz
carry-forward. Se um commit futuro a remover e a suíte continuar verde, o portão sumiu: são os testes
`test_a_nature_that_does_not_carry_forward_is_refused...` e
`test_this_endpoint_is_deliberately_outside_adr_038_d1...` que o `M3` do builder já provou que mordem.

### 9.7 · O que é MINHA decisão e o que EXIGE o owner

**Minha, e não pede caneta de ninguém:** `§9.0` inteiro — `D1` restrito ao OI, o RATIO sem carimbo,
`D1'` com pré-condição escrita, e as recusas `R2`/`R3`/`R4`/`R7` com o número de cada uma. A recusa
que o builder pôs no construtor **fica**, e `§3` deste documento está corrigido acima.

**Do owner — menu com custo, não pergunta aberta.** ⚠️ **Isto NÃO é o `§7.1`**, que continua pendente
e intocado por esta emenda.

| opção | o que decide | custo, medido |
|---|---|---|
| **`O-A`** — **recomendada pelo `/architect`** (opinião, não decisão) | esperar o coletor ao vivo de RATIO do `§7.3` — que **já é trabalho com dono** — e só então decidir o carimbo com `F-5` na mão | o RATIO renderiza de forma **instável** até lá (`20/61` hoje, `7/61` no passo de 5 min, e o número muda a cada passada de backfill). **Zero emenda, zero migração, zero caneta.** O atraso é de ~1 dia de coleta depois que o coletor subir |
| **`O-B`** | pagar a migração de `nature` agora (`R5`) | `61/61` estável hoje. Custo: `series_key_id` de **toda série long/short** muda ⇒ o `sha256` da projeção canônica de `ADR-008` muda; sob `D15` são **zero linhas** a reescrever, mas **todo id citado em documento morre**. E é `ADR-008` que decide se aceita, não esta ADR |
| **`O-C`** | mandar reabrir `ADR-034/D6` agora (`R6`) — o owner não decide o passo, decide se a pergunta abre já | `61/61` sem migração e sem carimbo. Custo: contrato de fio por série, e o painel desenha `12` pontos onde desenha `61` — é decisão de produto sobre a densidade do gráfico, por isso passa por ele antes de virar task |

**O que NÃO fazer enquanto ele não responde:** carimbar o RATIO com qualquer offset. `R2` parece
barato e é a única saída desta lista que **afirma um número que a medição não sustenta**.

---
