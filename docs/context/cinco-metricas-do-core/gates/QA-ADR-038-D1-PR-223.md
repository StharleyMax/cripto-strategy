# QA — PR #223 (`a5f0c64`), `ADR-038`/`D1`: carimbo `MODELED` do open interest

**Feature:** `cinco-metricas-do-core` · **Componente:** `sentimento` · **Fase:** `03` (o `DoD-3`
que `ADR-038` §1.1c/§7.4 nomeia) · **Data:** 2026-09-13 · **Base do merge:** `e4b91cb` ·
**`master` no gate:** `fc8e51c`

> **Veredito: `NEEDS_FIX`.** O **código está certo e medido** — o ganho do OI reproduz, a recusa do
> RATIO é honesta (e **maior** do que o construtor mediu), `F-2` prova que o `§7.1` não entrou, não
> há lookahead e `make verify` deu **VERDE nos 8 portões com a máquina ociosa**. O que reprova é o
> **artefato de gate**: ele declara como verdade duas coisas que a produção já tinha falsificado
> **20 minutos antes do commit**, e a PR **desliga o falsificador do próprio `D1`** sem dizer.

---

## 0 · A JANELA, declarada antes dos números — porque ela move os números

⚠️ **A população não só dobrou: NASCEU UM COLETOR AO VIVO de open interest e de long/short.**

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
 "select endpoint, count(*) n, min(started_at), max(started_at) from md.ingest_run group by 1;"
# /futures/data/openInterestHist            |34| 2026-09-12T13:30:32Z | 2026-09-13T00:14:09Z
# /futures/data/globalLongShortAccountRatio |34| 2026-09-12T14:06:06Z | 2026-09-13T00:13:54Z
```

`ADR-038` §1.1c mediu **`1` run** para cada um e concluiu *"não existe coletor de open interest"*;
hoje são **`34`**, com passada a cada ~5 min desde **`2026-09-12T23:45:29Z`**:

```bash
docker exec … -c "select to_char(to_timestamp(observed_at/1000) at time zone 'UTC','MM-DD HH24:MI:SS'),
  count(*), min(available_at-bucket_end) from md.series
  where src_label_raw='/futures/data/openInterestHist' and symbol='BTCUSDT' group by 1 order by 1 desc limit 7;"
# 09-13 00:10:04|1|4417   00:05:58|1|58692   00:00:51|1|51585   23:55:44|1|44348
# 23:50:36|1|36924        23:45:29|1|29735   23:41:17|516|77646  <- a ultima passada de backfill
```

**Minha janela de medição: `2026-09-13T00:19Z`–`00:21Z`** (`JANELA-INICIO`/`JANELA-FIM` impressos
pelo próprio arnês). Dentro dela `md.series` foi de **`16.152` para `16.160`** linhas de OI e de
**`6.022` para `6.031`** de RATIO — ⇒ **os números abaixo não somam duas populações**: cada linha da
tabela é uma varredura única sobre o **mesmo** conjunto carregado uma vez, e o universo (`n`) está
em cada uma. `[MEDIDO 2026-09-13T00:19Z–00:21Z, n = 4.040 linhas OI / 1.508 RATIO / 4.821
premiumIndex, BTCUSDT]`

---

## 1 · Os controles — e o meu arnês ERROU primeiro, que é para o que eles servem

Primeira rodada: **`C1 = 0/61`**, contra `61/61` esperado. Não era defeito da PR: eu passei a chave
do OI para observações carimbadas com o `series_key_id` do `premiumIndex`, e o `as_of` casa
observação por identidade. **É exatamente o falso `0/61` que o despacho avisou.** Corrigido
(relabel explícito e comentado), o controle passou.

| controle | esperado | medido |
|---|---:|---:|
| `C0` universo **vazio** | `0/61` por construção | **`0/61`** ✅ |
| `C1` `premiumIndex` ao vivo, grade `60k` (`n = 4.821`) | `61/61` | **`61/61`** ✅ |

⛔ **Identidade COMPUTADA, nunca literal:** o arnês deriva `series_key_id` de
`binance_open_interest_key()` / `count_long_short_ratio_key()` e **recusa rodar** se o store não
devolver linha para ela (os arnesses do `ADR-038` e da PR trazem os 64 hex chumbados).

Arnês: `docs/context/cinco-metricas-do-core/gates/QA-ADR-038-D1-arnes.py`
(`PYTHONDONTWRITEBYTECODE=1 BACKEND_DIR=<worktree>/backend .venv/bin/python …`).

---

## 2 · O ganho do OI — REPRODUZ na direção e no destino; a PARTIDA mudou

`61` slots de 1 min, `t = slot + 59.999`, `kt = agora`, `bar_policy=FINAL_ONLY`,
`purpose=RENDERING`, grade `300k`, `stale 600k`, `as_of` real, linhas reais do store:

| braço | construtor (23:20–00:05Z) | **QA (00:19–00:21Z)** |
|---|---:|---:|
| OI hoje (`available_at` do store) | `1/61` | **`40/61`** |
| OI com o carimbo `D1` **desta PR** | `61/61` | **`61/61`** ✅ |
| na grade de **5 min** que o painel desenha | `1/61 → 61/61` | **`9/61 → 61/61`** ✅ |

**O `61/61` reproduz; o `1/61` não** — e a causa é a do `§0`: entre a medição dele e a minha o
coletor ao vivo passou a escrever linhas com atraso de `4,4 s`–`85,2 s`, e cada uma delas cobre
`10 min` de slots por carry-forward de `STOCK`. ⇒ **o ganho é real e continua sendo o maior
possível (`61/61`), mas a frase "`1/61 → 61/61`" já não descreve a produção de hoje**; hoje é
`40/61 → 61/61` (1 min) e `9/61 → 61/61` (5 min).

O carimbo emitido pelo mapper real, sobre as `4.040` linhas: **um único offset, `300.000`**,
`availability_source` **só `MODELED`**, `observed_at` **idêntico ao do store em 100% das linhas**.

---

## 3 · A recusa do RATIO é HONESTA — e a regressão é MAIOR do que ele mediu

Mesmas linhas, só o offset do carimbo muda (`n = 1.508` RATIO / `4.040` OI, `kt = agora`):

| `offset_ms` | `openInterestHist` (`STOCK`) | `globalLongShortAccountRatio` (`RATIO`) |
|---:|---:|---:|
| `34.532` | `61/61` | `61/61` |
| `66.712` | `61/61` | **`48/61`** (o valor que `ADR-038` §1.2 reporta) |
| `150.000` | `61/61` | `36/61` |
| `299.999` | `61/61` | `12/61` |
| **`300.000`** (o que `D1` emite) | **`61/61`** | **`0/61`** |
| `600.000` | `0/61` | `0/61` |

**Célula a célula igual à tabela do construtor**, sobre uma população 50% maior ⇒ o achado é a
identidade aritmética de `as_of_accessor.py:326-329` (`age_ms >= bucket_interval_ms` e
`CARRY_FORWARD_BY_NATURE[RATIO] is False`), não artefato de dataset.

E a linha-base do RATIO subiu junto com a do OI: hoje **`24/61`** (grade `300k`) e **`8/61`** na
grade de 5 min do painel, contra `4/61`/`2/61` que ele mediu. ⇒ aplicar `D1` ao RATIO custaria
**`24 → 0`**, não `4 → 0`. **A recusa não deixou `4/61` na mesa por engano: ela evitou perder
`24/61`.**

---

## 4 · `F-2` — o `§7.1` NÃO entrou, e o arnês MORDE (mas a banda `0–1/61` caducou)

| braço (`kt = t`, semântica de backtest) | medido |
|---|---:|
| OI com o carimbo `D1` desta PR, slots de 1 min | **`40/61`** |
| idem, slots de 5 min | **`9/61`** |
| **contraprova**: o mesmo arnês **com** o `§7.1` (`observed_at := available_at`) | **`61/61`** |

⚠️ **`40/61` não é `61/61`, e a diferença é o ponto.** O despacho pedia `0/61`–`1/61`; a banda foi
derivada de uma população **sem nenhuma linha ao vivo**. Com o coletor do `§0`, `observed_at` de uma
linha nova é `~40 s` depois do bucket e **está legitimamente dentro do horizonte `kt = t`** — não é
`§7.1`, é observação real. As três provas de que o `§7.1` não entrou:

1. o resultado **não** é `61/61`, e a contraprova mostra que o arnês **reportaria** `61/61` se ele
   tivesse entrado (o instrumento morde);
2. `observed_at == observed_at do store` em **100%** das `4.040` linhas (`§2`);
3. o código: `collector_series_mapping.py` mantém `ingested_at=received_at` e
   `observed_at=received_at`, e o teste
   `test_a_backfill_row_is_not_stamped_with_the_instant_our_request_ran` o pina.

---

## 5 · Lookahead — nenhuma linha fica legível antes de o dado existir

| propriedade | medido |
|---|---|
| `min(available_at - bucket_end)` sobre o que o mapper emite | **`300.000`** (= 1 grade nativa) |
| todo carimbo múltiplo de `300.000` | **`True`** |
| linhas do store com `available_at < bucket_end` | **`0` de `16.160`** |
| atraso **real** das `40` buscas ao vivo (`available_at-bucket_end <= 300.000`) | **`4.417`–`85.187 ms`** |

⇒ o carimbo (`+300.000`) é **mais tarde** do que o instante em que o dado existiu em **todas** as
`40` observações vivas que hoje temos ⇒ **pessimista, nunca otimista** — a direção que `SPEC-001`
§5.2 exige. A mutação `ceil → floor` reprova 2 testes (`§7`).

**`F-1` continua `[NÃO MEDIDO]`**: a consulta literal de `ADR-038` §5 devolve `n_polls = 40`, longe
do `n >= 1.000` que ela mesma exige. **E o `§6` abaixo é sobre isso.**

---

## 6 · 🔴 OS DOIS ACHADOS QUE REPROVAM — nenhum deles é o código

### 6.1 · A PR desliga o falsificador do próprio `D1`, sem declarar

`ADR-038` §5 designa **`F-1`** como *o* falsificador de `D1`, e ele filtra
`availability_source = 'OBSERVED'`. Depois desta PR, o **único** escritor de linha de open interest
(`collectors_cli.py:2257` → `build_open_interest_to_rows`) carimba **`MODELED` sempre**, inclusive
numa busca ao vivo de `4,4 s` — e isso é **deliberado e testado**
(`test_the_modeled_stamp_does_not_move_when_the_collector_is_early_or_late`).

⇒ **o universo de `F-1` não pode mais crescer**, e depois do `D15` (TRUNCATE + reingestão) ele
devolve **`rc=0` com zero linhas**: o sinal ambíguo que `ADR-012` nomeia e que o `CLAUDE.md`
classifica como a pior quebra. Prova, rodada e reprovada:

```bash
# docs/context/cinco-metricas-do-core/gates/QA-ADR-038-D1-F1-probe.py
# AssertionError: lag 4417 ms was OBSERVED in production, but the writer stamps MODELED
```

O atraso **não** se perde (`observed_at` guarda o instante da busca), então o conserto é barato —
`F-1` passa a ler `observed_at - bucket_end`. **Mas quem reescreve `F-1` é o autor do `ADR-038`**, e
a PR tinha de **declarar** a consequência em vez de deixá-la calada.

### 6.2 · O relatório afirma como verdade o que a produção já tinha falsificado

`ADR-038-D1-builder.md` §2.2, verbatim: *"Continua **tudo backfill**: nenhum coletor ao vivo nasceu
(`ADR-038` §7.3 segue de pé)"*, e §7: *"o `p99` real de `openInterestHist` continua `[NÃO MEDIDO]`
(`ADR-038` §7.3: **não existe coletor ao vivo**)"*.

**Os dois coletores nasceram às `23:45:29Z`/`23:41Z`; o commit é `00:05:14Z`** — a frase já era falsa
quando foi escrita, e ela é a **premissa** de `D1` (*"uma grandeza que não conseguimos medir"*) e de
`§7.3`/`§7.4` do ADR. O ADR, que esta PR também carrega, propaga a mesma frase.

⚠️ **A correção NÃO é enfraquecer `D1` — é o contrário:** as `40` buscas ao vivo medem `4,4`–`85,2 s`,
**todas dentro de `(0, 300.000]`**, ou seja a banda que `D1` supõe agora tem **evidência direta**, e
não só a única observação de `34.532 ms`. O defeito é a **afirmação**, não a decisão.

---

## 7 · Mutações — verde não prova nada até uma reprovar (rodadas por MIM, em sandbox, revertidas)

Base: `41 passed` em `test_modeled_availability.py` + os dois de mapper.

| # | mutação | reprovou? | quem pegou |
|---|---|---|---|
| `M1` | `ceil → floor` em `modeled_available_at` | ✅ **2** | `…stamp_is_invariant_over_the_whole_lag_band…`, `…rounding_is_always_up…` |
| `M2` | carimbo do OI revertido para `received_at`/`OBSERVED` | ✅ **3** | `…provenance_columns_separate_the_two_clocks`, `…backfill_row_is_not_stamped…`, `…stamp_does_not_move_when_the_collector_is_early_or_late` |
| `M3` | guarda de carry-forward desligada (`if False:`) | ✅ **2** | `…nature_that_does_not_carry_forward_is_refused…`, `…deliberately_outside_adr_038_d1…` |

`sha256sum` dos dois arquivos de produção **idêntico antes e depois**; `git status --porcelain`
**vazio** na worktree. ⛔ Nenhuma linha de produção foi alterada por este gate.

---

## 8 · `make verify` — VERDE nos 8 portões, MÁQUINA OCIOSA, rodada por mim

```bash
PYTHONDONTWRITEBYTECODE=1 E2E_API_PORT=8893 E2E_NEXT_PORT=4393 make verify   # rc=0
```

`load average 1,16` e **zero** processo `pytest`/`vitest`/`playwright` de terceiros no início
(`uptime` + `ps -eo etimes,pcpu,args`). Resultado (`20260913T000920Z`):

`lint-backend` **447 arquivos** · `lint-frontend` OK · `test-frontend` **592 pass, 0 fail** ·
`test` **2.382 passed, cobertura 96,60 %** (piso 70,0 %) · `boundaries` **7 kept, 0 broken** ·
`regras` **0 bloqueio, 72 avisos** · `política` OK · `e2e` **27 passed (36,2 s)** ⇒
**`veredito: VERDE — 8 portões mediram e passaram`**. ⛔ Nenhum `INDETERMINADO`, nenhum `rc=3`.

**As 8 regras bloqueantes** de `harness rules list --severity block` (`core.relative-import`,
`core.silent-except`, `core.print-statement`, `core.hardcoded-secret`,
`web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`,
`web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`) são **as mesmas** que
o portão `regras` varre — `0 bloqueio` acima é o veredito delas sobre a árvore da PR.

---

## 9 · Duplicata e `docs/INDEX.md` — **não duplica, não reescreve**

```bash
git rev-parse master:<ADR-038>            == git rev-parse a5f0c64:<ADR-038>            # 44195b49… IDENTICO
git rev-parse master:<ADR-038-remedicao>  == git rev-parse a5f0c64:<ADR-038-remedicao>  # c833d122… IDENTICO
git merge-tree --write-tree master a5f0c64   # CONFLICT (content) SÓ em docs/INDEX.md
git diff e4b91cb master  -- docs/INDEX.md    # +1 linha, -0 linha, hunk @@ -282,3 +282,4 @@
git diff e4b91cb a5f0c64 -- docs/INDEX.md    # +1 linha, -0 linha, hunk @@ -282,3 +282,4 @@
```

⇒ **blob idêntico** nos dois arquivos "duplicados": o merge não cria segunda cópia nem reescreve
nada. O **único** conflito é `add/add` no fim do `INDEX.md` — **os dois lados só APENDAM, nenhum
lado apaga linha existente** ⇒ **append-only preservado**, e a resolução é **manter as duas linhas**
(três, contando a deste gate). Qualquer resolução que descarte uma delas viola `CLAUDE.md`.

---

## 10 · Ações para sair do `NEEDS_FIX` (nenhuma toca lógica de produção)

1. **Declarar, no relatório e na docstring do mapper, que a PR congela o universo de `F-1`**
   (`ADR-038` §5) — e devolver ao autor do `ADR-038`, junto com a decisão do RATIO que já voltou, a
   reescrita de `F-1` para `observed_at - bucket_end`. Prova em
   `gates/QA-ADR-038-D1-F1-probe.py`.
2. **Corrigir as duas frases falsificadas** (`§2.2` e `§7` do relatório): existe coletor ao vivo de
   OI **e** de long/short desde `2026-09-12T23:41Z`/`23:45:29Z`, `md.ingest_run` **1 → 34**. Dizer
   que isso **fortalece** `D1` (`40` buscas, `4,4`–`85,2 s`, todas dentro de `(0, 300.000]`) e que
   `ADR-038` §1.1c/§7.3 precisam de emenda do autor.
3. **Requalificar `1/61 → 61/61` com a hora**, não só a data: `[MEDIDO 2026-09-12T23:xxZ, n=8.064]`
   era verdade e deixou de ser em `< 1 h`. Hoje é `40/61 → 61/61` (1 min) e `9/61 → 61/61` (5 min)
   `[MEDIDO 2026-09-13T00:19Z, n=4.040]`. Vale para o corpo da PR, para a mensagem de commit, para a
   linha do `INDEX.md` e para a docstring de `build_open_interest_to_rows`.

⚠️ **O que NÃO está sendo pedido:** mudar o carimbo, aplicar `D1` ao RATIO, implementar o `§7.1` ou
tocar em klines. `D1` para `STOCK` está **certo, medido e com mutação que morde**.

## 11 · Rótulos de força

`§0`–`§5`, `§7`, `§8` e `§9` são `[MEDIDO 2026-09-13T00:09Z–00:35Z]`, cada um com o comando e o `n`,
contra `deploy-postgres-1` **somente leitura** (zero `insert`/`update`/`delete`/`truncate`, nada
semeado) e contra a worktree da PR. `§6.1` é `[MEDIDO]` no teste que reprova + `[DOC:
ADR-038 §5]`. Nenhuma alteração de código de produção; `advance`/`approve` não foram tocados.

---
---

# ↺ REVALIDAÇÃO — PR #223 em `2f1fd0c` (o veredito acima, de `a5f0c64`, fica intacto)

**Data:** 2026-09-13 · **Janela: `01:19:21Z`–`01:35:08Z`** (hora declarada porque ela move os
números — produção subiu `23:41:13Z` e as 5 métricas coletam ao vivo desde então; toda estatística
abaixo é de **UMA** população, a de depois do corte). **`master` no gate:** `169442c` ·
**worktree medida:** `agent-aa184f6702223255e` @ `2f1fd0c`, `git status --porcelain` **vazio**.

> **Veredito da revalidação: `NEEDS_FIX`.** As **duas ações que eu tinha pedido foram feitas e eu as
> verifiquei uma a uma** — `F-1` voltou a ser computável **e o universo dele CRESCE** (medido por mim
> duas vezes), e a premissa falsificada foi corrigida no sentido que **fortalece** `D1`. O código
> continua certo, `make verify` deu **VERDE nos 8 portões com a máquina ociosa**, e as mutações
> mordem. O que reprova é **um achado NOVO, introduzido por este próprio commit de correção**:
> **`F-2`, o falsificador de `§2`, perdeu o poder de discriminar sobre o store real**, e a docstring
> de produção afirma como regra de inferência uma frase que eu **falsifiquei medindo**.

## R1 · O `[FAIL]` principal — `F-1` está consertado, e eu confirmei a propriedade que importa

**O conserto é no falsificador, não no carimbo — e isto eu provei, não aceitei:** rodei a **minha**
probe original (o blob de `master`, `34c0363`) contra `2f1fd0c` e ela **continua reprovando**:

```bash
cd backend && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest <probe original de master> -q --no-cov
# 1 failed  —  AssertionError: lag 4417 ms was OBSERVED in production, but the writer stamps MODELED
cd backend && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest ../docs/.../QA-ADR-038-D1-F1-probe.py -q --no-cov
# 3 passed in 0.07s
```

⇒ o carimbo **não se mexeu** (era o risco: consertar o falsificador movendo o que ele mede). O
`1 failed → 3 passed` que o autor declara **reproduz**, e o `1 failed` sobrevive como controle
negativo executável dentro do novo arquivo.

**✅ O universo CRESCE — medido por MIM, duas vezes, com o comando literal de `ADR-038` §5:**

| hora (UTC) | `n_polls` | `p99` | faixa | quem mediu |
|---|---:|---:|---|---|
| `00:36Z` | `52` | `85.187 ms` | `4.417`–`85.187` | autor `[DOC]` |
| `00:49Z` | `60` | `85.187 ms` | — | autor `[DOC]` |
| **`01:19:41Z`** | **`84`** | **`123.542 ms`** | `4.417`–`123.542` | **QA `[MEDIDO]`** |
| **`01:34:40Z`** | **`96`** | **`123.542 ms`** | `4.417`–`123.542` | **QA `[MEDIDO]`** |

`+12 buscas em 15 min` dentro da minha própria janela ⇒ **o conserto não é cosmético**: o `n ≥ 1.000`
que `F-1` exige chega por tempo de relógio. **Todas as 96 dentro de `(0, 300.000]`** ⇒ a banda de
`D1` tem evidência direta. ⚠️ **Mas o `p99` subiu `85.187 → 123.542 ms` em 1 h** (`+45%`): não
falsifica nada hoje (`123.542 ≪ 300.000`, e `96 ≪ 1.000`), e **é justamente por isso que `F-1`
precisava voltar a ser computável.** Fica registrado como número a reler, não como veredito.

**A emenda 2 (por busca, não por linha) confere, e o número dela é o meu:**

```bash
# por LINHA (a agregação antiga):  p99 = 682.770 ms  — ACIMA do limiar de 300.000 ⇒ falso positivo
# por BUSCA (`group by observed_at`, `min(...)`):  p99 = 123.542 ms
```

⇒ `682.770 > 300.000` confirma célula a célula a tese do autor (ele mediu `685.187` às `00:36Z`; a
população andou). **Uma busca de `STOCK` escreve mesmo várias linhas**: `84` buscas produzem `100`
linhas dentro da faixa de `900 s` `[MEDIDO 2026-09-13T01:19Z]`.

## R2 · A premissa corrigida — confere, com hora

`md.ingest_run` **`98`/`98`** às `01:19:43Z` (era `1`/`1` em `§1.1c`, `34` às `23:45Z`, `58`/`59` às
`00:39Z`) ⇒ **quatro** populações no mesmo dia. As correções de `§1.1c`, `§5`, `§7.3` do ADR e de
`§2.2`/`§7` do relatório do construtor estão no diff e dizem o que eu pedi que dissessem, **com
hora**. `docs/INDEX.md` é **append-only** verificado: `git diff e4b91cb 2f1fd0c -- docs/INDEX.md`
→ **+2 linhas, −0**.

## R3 · 🔴 O ACHADO NOVO — `F-2` deixou de discriminar, e a docstring afirma o contrário

**A frase, escrita NESTE commit de correção** (`collector_series_mapping.py:726-729`):

> *"the BACKTEST horizon (`knowledge_time = t`) still reads `1/61` … and a `61/61` at
> `knowledge_time = t` today would mean someone shipped §7.1 without the owner."*

**Falsifiquei as duas metades, medindo.** Meu arnês (`QA-ADR-038-D1-arnes.py`, linhas **reais** do
store, `observed_at` **real** de cada busca), `2026-09-13T01:21:41Z`:

```
F2 OI com carimbo D1, 1min                     -> 61/61     (a docstring diz "1/61")
F2 CONTRAPROVA: se o §7.1 tivesse entrado      -> 61/61     (indistinguivel)
```

⛔ **E o `§7.1` NÃO entrou** — quatro provas independentes: (1) `observed_at == observed_at` do store
em **100%** das `4.052` linhas; (2) minha probe original **ainda reprova** (`R1`); (3) mutação `M4`
(`observed_at := carimbo`, que É o `§7.1`) **reprova 4 testes**; (4) o controle de população abaixo.

**A causa é COBERTURA, não `§7.1` — e o controle isola as duas** (`gates/QA-ADR-038-F2-populacao-controle.py`, mesmo store, mesmo
`as_of`, só o recorte de `observed_at` muda):

| população | `kt=agora` 1 min | `F-2` (`kt=t`) 1 min | contraprova `§7.1` |
|---|---:|---:|---:|
| **só backfill** (a de `23:41Z`, `n=4.036`) | `20/61` → **`61/61`** | **`20/61`** | `61/61` ✅ discrimina |
| **hoje** (com coletor ao vivo, `n=4.052`) | `61/61` → `61/61` | **`61/61`** | `61/61` ❌ **não discrimina** |

⇒ com coleta ao vivo contínua, uma linha de `STOCK` buscada `~60 s` depois do bucket **é legítimamente
conhecível em `kt=t`**, e o carry-forward cobre todos os slots. **`F-2` satura, e um falsificador
saturado acusa inocente.**

**Por que o instrumento do autor devolve `1/61` e o meu `61/61` — e ele é o problema, não a
discrepância:** `ADR-038-D1-pos-implementacao.py:37` colapsa **todo** `observed_at` num único
instante (`received_at = max(observed_at)`, comentado como *"the single backfill pass instant"*).
Isso mede um store **sintético** — *"como se tudo tivesse vindo de UMA passada de backfill"* — que
**é exatamente a produção que deixou de existir às `23:45:29Z`**. Sobre ele `1/61` é verdade **por
construção**. `ADR-038` §5/`F-2` manda rodar *"o arnês de `§1.2`"*, que lê o **store real** — e lá o
resultado é `61/61`.

⚠️ **Esta é a MESMA classe do achado `§6.1` da rodada anterior**, agora em `F-2`: o falsificador de
uma decisão deixado sem poder de disparo, sem que nada avise. E é **pior** que número caducado: um
número caduco carrega a hora e o leitor o desconta; uma **regra de inferência** sem universo
declarado **não expira** — ela dispara para sempre, e o que ela dispara é a acusação de que alguém
enviou o `§7.1` sem o owner.

⚠️ **Consequência decisória, e é ela que tira isto de cosmético:** a docstring e o corpo da PR dizem
ao **owner** — que tem o `§7.1` na mesa — que *"o backtest continua com o teto"*. Sobre dado **ao
vivo** ele **não** continua: `kt=t` já lê `61/61` **sem** o `§7.1`. O teto era artefato do backfill.
Quem decide o `§7.1` merece esse número antes de decidir.

## R4 · Sem lookahead — confirmado sobre a população nova

| propriedade | medido |
|---|---|
| linhas de **OI** com `available_at < bucket_end` | **`0` de `16.216`** (era `0` de `16.160`) |
| offsets distintos emitidos pelo carimbo | **`[300000]`**, todos múltiplos de `300.000` |
| `availability_source` distintos | **`['MODELED']`** |
| menor atraso real de busca | `4.417 ms` ⇒ carimbo `+300.000` é **pessimista**, nunca otimista |

ℹ️ **Fora do escopo desta PR, mas medido e declarado em vez de calado:** varrendo `md.series`
**inteira** (`312.753` linhas) aparecem **`466`** linhas com `available_at < bucket_end`, **todas em
`/fapi/v1/premiumIndex`** (pior caso `−100 ms`); `klines`, `RATIO`, `liquidation-history` e `OI` têm
**`0`**. Não é regressão desta PR (`premiumIndex` não é tocado por `D1`) — é achado para o dono do
`ADR-038`/`SPEC-001` §5.2. `[MEDIDO 2026-09-13T01:23:14Z]`

## R5 · Mutações — o instrumento NOVO morde (rodadas por mim, revertidas)

| # | mutação em produção | reprovou? | quem pegou |
|---|---|---|---|
| `M4` | `observed_at := carimbo` (**é o `§7.1`**) | ✅ **4** | probe `…f_1_stays_computable`, `…provenance_columns_separate_the_two_clocks`, `…backfill_row_is_not_stamped…`, `test_observed_at_keeps_the_fetch_instant…` |
| `M5` | `observed_at := received_at + 400_000` (fora da banda) | ✅ **6** | as 4 acima **+** os dois testes de banda (`…measured_lags_are_inside_the_band…`, `…measured_fetch_lags_all_sit_inside…`) |

⚠️ **Nota de qualidade, não bloqueante:** sob `M4` os **dois testes de banda calam** (o carimbo dá
`300.000`, que satisfaz `<= 300_000`). Eles só mordem sob `M5`. São registro de premissa, não
detector — quem carrega o invariante é `…keeps_the_fetch_instant…`, e esse morde.

⛔ `sha256` de `collector_series_mapping.py` **idêntico** antes/depois
(`a2f81851ea51d040…`); `git status --porcelain` **vazio**. Nenhuma linha de produção alterada.

## R6 · `make verify` — VERDE nos 8 portões, máquina OCIOSA

```bash
PYTHONDONTWRITEBYTECODE=1 E2E_API_PORT=8894 E2E_NEXT_PORT=4394 make verify   # rc=0, 01:23:29Z–01:34:25Z
```

`load average 1,42` e **zero** `pytest`/`vitest`/`playwright` de terceiros no início. ⚠️
`frontend/node_modules` **conferido como diretório real** (`drwxr-xr-x 141`, não symlink) — o modo de
falha avisado no despacho **não** ocorreu, e a prova é que `test-frontend` e `e2e` **mediram**:

`lint-backend` **447 arquivos** · `lint-frontend` OK · `test-frontend` **592 pass, 0 fail** ·
`test` **2.384 passed, cobertura 96,60 %** (piso `70,0 %`) · `boundaries` **7 kept, 0 broken** ·
`regras` **0 bloqueio, 72 avisos** · `política` OK · `e2e` **27 passed (34,3 s)** ⇒
**`veredito: VERDE — 8 portões mediram e passaram`**. ⛔ Nenhum `INDETERMINADO`, nenhum `rc=3`.

As **8 regras bloqueantes** de `harness rules list --severity block` são as mesmas que o portão
`regras` varre; `0 bloqueio` é o veredito delas sobre a árvore de `2f1fd0c`.

## R7 · Ação para sair do `NEEDS_FIX` — UMA, e não toca lógica de produção

1. **Declarar o universo de `F-2` e corrigir a frase que ele sustenta**, em três lugares que hoje
   dizem a mesma coisa falsa: `collector_series_mapping.py:726-729` (docstring), corpo da PR #223
   (*"com `kt = t` o OI lê `0/61`–`1/61`, nunca `61/61`"*) e a moldura de `ADR-038` §2/§7.1.
   O texto tem de dizer **sobre qual população** o `1/61` vale: `1/61` é o que
   `ADR-038-D1-pos-implementacao.py` mede **colapsando todo `observed_at` num único instante de
   backfill** (`:37`); sobre o **store real**, desde `2026-09-12T23:45:29Z`, `F-2` lê **`61/61` sem o
   `§7.1`** `[MEDIDO 2026-09-13T01:21:41Z, n=4.052 linhas OI]`, com o controle de população que
   separa cobertura de `§7.1` (**só-backfill: `20/61` vs contraprova `61/61`**). E dizer a
   consequência para quem decide: **o teto do backtest era artefato do backfill**.
2. *(devolver ao autor do `ADR-038`, não bloqueia esta PR)* — `F-2` precisa de universo ou de
   critério novo, pela mesma razão que `F-1` precisou: um falsificador que não distingue não é
   falsificador. Sugestão medida, não imposta: restringir o universo aos slots **anteriores** ao
   nascimento do coletor, ou comparar `D1` contra a contraprova `§7.1` em vez de contra um limiar.

⚠️ **O que NÃO está sendo pedido, de novo:** mudar o carimbo, aplicar `D1` ao RATIO, implementar o
`§7.1`, tocar klines ou mexer em produção. **`D1` para `STOCK` está certo, medido, e as mutações
mordem.** O achado é de **instrumento e de frase**, e é o terceiro falsificador desta ADR a precisar
de reparo — o que é, em si, o sinal mais útil desta revalidação.

## R8 · Rótulos de força

`R1`–`R6` são `[MEDIDO 2026-09-13T01:19:21Z–01:35:08Z]`, cada um com o comando e o `n`, contra
`deploy-postgres-1` **somente leitura** (zero `insert`/`update`/`delete`/`truncate`, nada semeado) e
contra a worktree `2f1fd0c`. `R3` é `[MEDIDO]` no arnês + `[DOC: ADR-038-D1-pos-implementacao.py:37]`
para a leitura de código. **Sem deploy.** `PYTHONDONTWRITEBYTECODE=1` em toda invocação e
`__pycache__` purgado antes de medir. Nenhum `advance`, nenhum `approve`. **Nenhuma anomalia**: toda
checagem produziu veredito.
