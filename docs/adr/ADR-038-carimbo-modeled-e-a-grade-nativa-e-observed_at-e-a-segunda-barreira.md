# ADR-038 — O carimbo `MODELED` é a grade nativa (e não precisa de percentil), e `observed_at` é a segunda barreira que ninguém tinha medido

**Status:** `PROPOSTA` — **DRAFT**. Nasce DRAFT por construção: `SPEC_APPROVED`/`approve` é ato do
**owner**, e o `§7` deste documento tem uma pergunta que **emenda uma decisão do owner** (`D16`) e
que nenhum agente pode responder no lugar dele. Nada foi escrito no ledger por esta sessão.

**Feature:** `cinco-metricas-do-core` · **Componente:** `sentimento` · **Data:** 2026-09-12
**Origem:** `E1` de [`OPCOES-E1-E5.md`](../context/cinco-metricas-do-core/OPCOES-E1-E5.md), decidido
pelo owner como `D16` e **adiado por ele esperando remedição depois do conserto do escalonador**.
**Relação:** aplica `ADR-006`/`SPEC-001` §5.2 · **confirma** `ADR-037`/M3 número a número ·
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

> ⚠️ **EMENDA `2026-09-13T00:39Z` — a medição acima CADUCOU, e a hora é o que separa as duas.** Ela é
> verdadeira **às `2026-09-12T~22:55Z`** e falsa desde **`23:41Z`**, quando o deploy de produção subiu
> e os dois endpoints passaram a coletar ao vivo: `1` run → **`34`** (`23:45:29Z`) → **`58`/`59`**
> (`00:39Z`). O comando e os números estão em `§7.3`. A frase *"não existe coletor de open interest"*
> **não deve mais ser citada como fato corrente** — nem aqui, nem em `§7.3`, nem no corpo da PR #222.
> A conclusão sobre a PR #222 (*"é tempo, não código"* era falso **naquela hora**) fica de pé como
> registro histórico; o que muda é que hoje **também** há coletor.

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

**`D1` vale para `/futures/data/openInterestHist` e para `/futures/data/globalLongShortAccountRatio`
(mesma grade nativa de `300.000 ms`, mesmo padrão de uma-passada-só: `1` run, `8` instantes de busca
para `4.000` linhas). Não vale para klines** — lá a grade é `60.000`, o `p99` medido hoje é `61.071`
e está **fora** da faixa; klines continua sendo `D16`/`O1`/`O4`, e o `§7.3` diz o que falta.

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
O coletor ao vivo de `/futures/data/openInterestHist` **existe desde `2026-09-12T23:41Z`** (`§7.3`,
emendado). Rode:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
 with polls as (
   select observed_at, min(observed_at-bucket_end) lag_ms
     from md.series
    where src_label_raw='/futures/data/openInterestHist'
      and observed_at-bucket_end between 0 and 900000
    group by observed_at)
 select count(*) n_polls,
        percentile_disc(0.99) within group (order by lag_ms) p99,
        min(lag_ms) lo, max(lag_ms) hi
   from polls;"
```

Se `p99 > 300.000` com `n_polls >= 1.000`, **`D1` estava errado**: o carimbo `+1 grade` afirmou
conhecimento que não tivemos, e toda linha `MODELED` de OI tem de ser recarimbada.

⛔ **`n_polls = 0` NÃO é "passou" — é `F-1` NÃO COMPUTÁVEL**, e quem roda tem de dizer qual dos dois
leu. Esta distinção é o `rc=0` ambíguo de `ADR-012`, e ela é a razão das DUAS emendas abaixo.

**Emenda 1 — o filtro era `availability_source='OBSERVED'`, e `D1` o teria matado.** Depois de `D1`
o único escritor de linha de OI carimba `MODELED` **sempre**, inclusive numa busca ao vivo de
`4,4 s`. Um `F-1` que filtra `OBSERVED` teria universo **congelado** no passivo legado e, depois do
`D15` (TRUNCATE + reingestão), **zero linhas** — o falsificador de `D1` desligado pelo próprio `D1`.
O atraso real **não se perde**: `observed_at` continua sendo o instante da busca, por decisão
explícita do mapper (`collector_series_mapping.py`, `build_open_interest_to_rows`), e é dele que
`F-1` passa a ler. `[MEDIDO 2026-09-13T00:35Z, prova em
docs/context/cinco-metricas-do-core/gates/QA-ADR-038-D1-F1-probe.py]`

**Emenda 2 — a agregação era POR LINHA, e isso inflava o `p99` em 8×.** Uma busca de `STOCK` escreve
**várias** linhas (carry-forward sobre os buckets que ela cobre), então `observed_at-bucket_end` por
linha mede a **idade do bucket carregado**, não o atraso da busca. Medido hoje sobre o mesmo
universo: por linha `p99 = 685.187 ms` (**acima** do limiar de `300.000`, um falso positivo à espera
de `n`), por busca `p99 = 85.187 ms`. Por isso o `group by observed_at` + `min(...)`.

**Partida medida, e com HORA porque a população se moveu 3× hoje:** `n_polls = 52`,
`p99 = 85.187 ms`, faixa `4.417`–`85.187 ms` — **todas as 52 dentro de `(0, 300.000]`**, ou seja a
banda que `D1` supõe agora tem evidência direta, e não só a observação única de `34.532 ms`.
`[MEDIDO 2026-09-13T00:36Z, n = 52 buscas, deploy-postgres-1 somente leitura]` ⇒ `F-1` **é
computável hoje** e **ainda não dispara** (`52 < 1.000`); o que falta é `n`, não instrumento.

✅ **E o universo CRESCE — que é a propriedade inteira desta emenda, e ela foi medida duas vezes.**
O mesmo comando, rodado verbatim deste documento: **`52` buscas às `00:36Z`** e **`60` às `00:49Z`**
— `+8` em `13 min`, a cadência de ~5 min do coletor. `p99` estável em `85.187 ms` nas duas.
`[MEDIDO 2026-09-13T00:36Z e 00:49Z, mesmo comando, deploy-postgres-1 somente leitura]`
⇒ o `n >= 1.000` que `F-1` exige é alcançável por **tempo de relógio**, e não por trabalho novo —
o oposto exato do universo congelado que a versão anterior de `F-1` teria deixado.

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

### 7.3 · ~~Coletor ao vivo de open interest e de long/short — não existe~~ — ✅ NASCEU em `2026-09-12T23:41Z`

⚠️ **EMENDA `2026-09-13T00:39Z`. A frase original desta seção — e a de `§1.1c`, que ela cita — foram
FALSIFICADAS PELA PRODUÇÃO, e o commit de `D1` (`00:05:14Z`) já era posterior ao fato.** Elas diziam
*"`1` run para cada, nenhum laço no CLI"* e *"não existe coletor ao vivo"*. O deploy de produção
subiu às `23:41Z` e as 5 métricas coletam ao vivo desde então:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select endpoint, count(*) n, min(started_at)::text, max(started_at)::text from md.ingest_run
   where endpoint in ('/futures/data/openInterestHist','/futures/data/globalLongShortAccountRatio')
   group by 1 order by 1;"
# /futures/data/globalLongShortAccountRatio|59|2026-09-12T14:06:06Z|2026-09-13T00:39:24Z
# /futures/data/openInterestHist           |58|2026-09-12T13:30:32Z|2026-09-13T00:38:44Z
```

`md.ingest_run` foi de **`1` run por endpoint** (o que `§1.1c` mediu) para **`34`** às `23:45:29Z`, e
para **`58`/`59`** às `00:39Z` — **três populações diferentes no mesmo dia**. ⇒ toda medição deste
documento tem de ser lida com a **HORA**, não só com a data; `[MEDIDO 2026-09-12]` sem hora é
ambíguo a partir de hoje.

⛔ **A correção FORTALECE `D1`, não o enfraquece** — e é importante que isto esteja escrito, porque a
premissa falsificada era a de que `p99_lag` é *"uma grandeza que não conseguimos medir"*. Conseguimos:
são **52 buscas ao vivo**, `4.417`–`85.187 ms`, **todas dentro de `(0, 300.000]`** — a banda em que
`§3` mostra que **qualquer** `p99` dá o mesmo carimbo `+300.000`. A decisão `D1` continua a mesma,
agora com evidência direta em vez de uma observação única de `34.532 ms`.
`[MEDIDO 2026-09-13T00:36Z–00:39Z, n = 52 buscas / 58 runs, deploy-postgres-1 somente leitura]`

**O que continua valendo desta seção:** `D17` exige **5 famílias com linhas > 0**, e `F-1` exige
`n_polls >= 1.000` — hoje `52`. **`F-1` é computável** (`§5`, emendado) e **ainda não dispara**: o que
falta é `n`, não instrumento. **Não bloqueia `D1`.**

### 7.4 · O que ISTO destrava, se `A` for escolhida

PR #222 entrega a tela correta e reprova `DoD-3` com `N = 2`. Com `D1` + `7.1/A` em código, o mesmo
universo mede **`61/61`** — `DoD-3` (`N ≥ 30`) passa **por dado real**, sem afrouxar o `expect` e sem
`make e2e` vermelho por motivo conhecido. **Enquanto isso não estiver em código, a PR #222 não deve
ser mergeada**, e a frase *"é tempo, não código"* no corpo dela precisa ser corrigida — ela está
factualmente errada (`§1.1c`).

---

## 8 · Rótulos de força deste documento

`§0`, `§1`, `§2` e as tabelas de `§3` são `[MEDIDO 2026-09-12]`, cada uma com o comando ao lado, `n`
declarado, contra `deploy-postgres-1` **somente leitura** — nenhum `insert`/`update`/`delete`,
nada semeado. A leitura de `SPEC-001` §5.2, de `ADR-036/D5`, de `ADR-037`/M3, de `D15`/`D16`/`D17` e
dos 15 termos de `SeriesKey` é `[DOC]` com linha citada. A recomendação de `§7.1` é **opinião de
arquitetura**, rotulada como tal. O `p99` real de `openInterestHist` é `[NÃO MEDIDO]` e `§3`
argumenta por que ele não muda o resultado — o argumento é verificável, não é dispensa.
