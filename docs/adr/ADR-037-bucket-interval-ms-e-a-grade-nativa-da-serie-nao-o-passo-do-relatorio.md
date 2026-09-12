# ADR-037 — `bucket_interval_ms` é a grade NATIVA da série, não o passo do relatório: o bloqueio de `DoD-2` da fase `04` não é `Nature.RATIO`

**Data:** 2026-09-12 · **Status:** proposta · **SPEC:** [`SPEC-007`](../specs/SPEC-007-cinco-metricas-do-core.md)
**Fases:** `03` (open interest) e `04` (long/short ratio), com efeito em toda série de grade nativa > 1 min · **Componentes alvo:** `sentimento` (caminho de leitura), `charts` (o estado nomeado de upsampling)
**Origem:** [`handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md`](../context/cinco-metricas-do-core/handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md), escrito pelo builder da fase `04` **antes** do gate
**Relação com achados anteriores:** MESMA CLÁUSULA de [`ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`](../context/cinco-metricas-do-core/handoff/ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md) (`D4.11`), CAUSA DIFERENTE · **compõe** com `E1`/`D16`, não o duplica

---

## Contexto

A fase `04` fez `count_long_short_ratio` chegar a `md.series` (`DoD-1` e `DoD-4` verdes) e parou em
`DoD-2`: `/api/v1/series-history` devolve `HTTP 200` com **0 pontos**, e o painel fica vazio com
`rc=0` — o sinal indistinguível que `ADR-012` nomeia.

O builder atribuiu a causa a `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` e escalou **três**
saídas, todas mexendo em `Nature` ou no acessor. **A atribuição está errada, e a medição abaixo é o
que a derruba.** O `[NÃO SEI]` de `as_of_accessor.py:101-111` sobre `RATIO` é real e continua
aberto — ele só **não é** o que bloqueia esta fase.

### O predicado que de fato governa, transcrito do código

`as_of_accessor.py:328-334`, verbatim:

```python
age_ms = t - winner.row.bucket_end
if age_ms >= policy.bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[series.nature]:
    return _absent(Absence.NO_POINT, …)
```

Somado a `R-1` (`available_at <= t`), a janela em que um bucket de natureza **não carregável** é
legível é

> `[bucket_end + atraso_de_publicação, bucket_end + bucket_interval_ms)`

e ela é **não-vazia se e somente se `atraso < bucket_interval_ms`**.

⚠️ **Por isso o SQL do bloqueio mede a coisa errada.** `count(*) filter (where available_at <=
bucket_end)` testa `atraso <= 0`, que é estritamente mais forte. Aplicado a `klines_volume` — a
série que **renderiza** `176/181` `[DOC: ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md, 2026-09-11,
NÃO re-medido por mim]` — ele também devolveria ~0, porque o atraso mínimo ali é de
**12 ms** `[MEDIDO 2026-09-12, M1 abaixo]`. Um predicado que reprova a série que funciona não
explica a que não funciona.

### O defeito, em uma linha de código

`use_cases/series_history.py:179`:

```python
bucket_interval_ms=_GRID_STEP_MS,   # _GRID_STEP_MS = 60_000 (series_history.py:37)
```

`_GRID_STEP_MS` é o passo da **grade do RELATÓRIO**. O campo que o recebe declara, na própria
docstring (`as_of_accessor.py`), outra coisa: *"The native grid of this series, in milliseconds —
the width of one bucket. IT IS INJECTED AND NEVER PARSED FROM `SeriesKey.interval`."* Para toda
série cuja grade nativa é maior que 1 min, o valor injetado é **um quinto** da largura real, e
`D4.11` passa a perguntar *"já passou um bucket inteiro?"* contra uma largura que não é a do
bucket.

**O valor certo já está na mão da função e é descartado:** `entry` vem de `catalog.entry_for_id()`
seis linhas acima, e `SeriesCatalogEntry.native_grid` (`domain/series_catalog.py:116`) é servido
publicamente como `nativeGrid` em `/api/v1/series-catalog`.

---

## As medições

Todas de **2026-09-12**, contra a stack viva (`deploy-postgres-1`, `deploy-api-1`), só leitura.

### M1 · atraso de publicação por endpoint — `n = 212.692` linhas

```sql
select src_label_raw, count(distinct series_key_id) keys, count(*) linhas,
       min(available_at-bucket_end) lag_min_ms,
       percentile_disc(0.5) within group (order by available_at-bucket_end) lag_p50_ms,
       max(available_at-bucket_end) lag_max_ms
from md.series group by 1 order by 3 desc;
```

| `src_label_raw` | keys | linhas | lag mín | lag p50 | lag máx |
|---|---:|---:|---:|---:|---:|
| `/fapi/v1/klines` | 4 | 165.660 | **12 ms** | 294.132.400 | 604.749.985 |
| `/fapi/v1/premiumIndex` | 8 | 34.968 | **−100 ms** | 969 | 1.895 |
| `/futures/data/openInterestHist` | 4 | 8.064 | 34.532 | 302.140.922 | 604.539.911 |
| `/futures/data/globalLongShortAccountRatio` | 4 | 4.000 | **66.712 ms** | 75.067.074 | 150.067.417 |

### M2 · a grade nativa da série de `04` é de 5 min, e o atraso cabe dentro dela

Espaçamento entre `bucket_end` consecutivos, por símbolo: `p50 == max == 300.000 ms`
(`n = 1.000` linhas/símbolo, 4 símbolos). ⇒ **`66.712 ms < 300.000 ms`**: a janela de
legibilidade desta série é **não-vazia** e tem 233 s de largura. Ela só está vazia porque a
largura injetada é `60.000`.

### M3 · a matriz que separa as duas causas — rodando o `as_of` REAL, não uma reimplementação

Script em `/tmp/…/exp.py`: lê as linhas de `md.series` por `psql`, constrói `SeriesRow`/`Observation`
de verdade e chama `as_of(bar_policy=FINAL_ONLY, purpose=RENDERING)` sobre **61 instantes de grade
de 1 min**, com `t = grade + 59.999` (o mesmo `_read_instant` do relatório). O único termo que
muda entre colunas é `bucket_interval_ms`.

| série (BTCUSDT) | `bucket_interval_ms = 60.000` (hoje) | `= 300.000` (nativo) |
|---|---:|---:|
| `globalLongShortAccountRatio` · **RATIO** · `n = 1.000` | **0 / 61** | **4 / 61** |
| ↳ com `E1`/`D16` simulado (`available_at := bucket_end + 66.712`) | **0 / 61** | **48 / 61** |
| `openInterestHist` · **STOCK** · `n = 2.016` | 1 / 61 | 1 / 61 |
| ↳ com `E1`/`D16` simulado (`+ 34.532`) | 61 / 61 | 61 / 61 |

**A matriz prova quatro coisas de uma vez:**

1. **Não é `Nature.RATIO`.** A linha 2 vai de 0 a **48** com `CARRY_FORWARD_BY_NATURE[RATIO]`
   intocado em `False`. Nenhuma das três saídas escaladas é necessária.
2. **A largura errada é um VETO ABSOLUTO, não uma degradação.** A coluna `60.000` é `0` nas duas
   linhas de `RATIO` — inclusive com `E1` resolvido. Nenhuma outra correção a contorna.
3. **`E1`/`D16` é a restrição que AMARRA depois, e só depois.** Corrigir só a largura dá `4 / 61`;
   o resto do teto é backfill invisível, que o owner já decidiu em `D16`.
4. **`STOCK` mascarava o defeito.** A linha 3 é **invariante** sob a largura (1→1, 61→61): o
   `and not CARRY_FORWARD_BY_NATURE[...]` faz a cláusula inteira ser pulada. O defeito existe há
   tanto tempo quanto a função, e nunca podia aparecer.

### M4 · por que ninguém viu antes — o catálogo servido tem 44 entradas em exatamente 2 células

`GET /api/v1/series-catalog`, agrupado por `(nativeGrid, nature)`:

| entradas | `nativeGrid` | `nature` | carrega? |
|---:|---|---|---|
| 16 | `1min` | `FLOW` | **não** |
| 28 | `5min` | `STOCK` | **sim** |

**A célula `(grade > 1 min, natureza não carregável)` está VAZIA — 0 de 44.** Ou a largura errada
coincide com a certa (as 16), ou o carry-forward pula a cláusula (as 28). A série da fase `04` é a
**primeira** entrada fora dessas duas células, e é vetada em **100%** dos slots.

### M5 · o teto de `E1`, medido nesta base

Linhas com `available_at - bucket_end` entre 0 e 300.000 (ou seja, colhidas ao vivo):
`globalLongShortAccountRatio` → **no máximo 2 buckets por símbolo, vão de 5 min**;
`openInterestHist` → **1 por símbolo**. Todo o resto das 4.000 + 8.064 linhas é backfill, e
invisível ao `as_of` até `D16` existir em código.

### M6 · o mecanismo do estado nomeado existe e está inerte

`classify_grid_multiple` (`modules/charts/domain/panel_grid_enablement.py`, `ADR-026/D1`) tem
**0 chamadores em `backend/src`** (`grep -rn 'classify_grid_multiple' backend/src --include='*.py'`
menos a própria definição → `0`). É **testado** (10 ocorrências em
`backend/tests/charts/test_panel_grid_enablement.py`), mas nenhum caminho de produção o consulta —
mesma classe de mecanismo construído e inerte que `D16` registrou para `MODELED` (`0` de `117.740`).

---

## D1 · O bloqueio de `DoD-2` da fase `04` é um DEFEITO contra a `SPEC-007` já aprovada, não uma decisão em aberto

`SPEC-007` §8.2, `RN-S1`, verbatim: *"série de `5m` na grade de `1m`: para M2 e M3, `DoD-3` conta
**barras nativas distintas**, não linhas **da escada**. O comando do DoD nomeia o divisor:
`pontos_no_DOM / 5`."*

**A SPEC aprovada já declara que a escada existe** — que uma série de 5 min aparece repetida sobre
os slots de 1 min, ao ponto de instruir o DoD a dividir por 5. A escada é precisamente o que
`bucket_interval_ms = 300.000` produz (M3: 48/61 ≈ 4 de cada 5 slots) e precisamente o que
`bucket_interval_ms = 60.000` torna **impossível**. E `long_short_catalog.py:58`, escrito pelo
próprio builder da fase `04`, diz que a série *"pays `GA-2`'s staircase on the served"*.

⇒ Três declarações independentes — a docstring do campo, `SPEC-007`/`RN-S1` e o catálogo da própria
fase — pedem a grade nativa. `series_history.py:179` contradiz as três. **Isto é conserto de defeito
contra documento aprovado, e por isso é decisão de `/architect`, não do owner.**

**Decisão:** `bucket_interval_ms` passa a ser a grade **nativa da série**, resolvida a partir de
`SeriesCatalogEntry`. `_GRID_STEP_MS` continua sendo o passo do relatório e as duas grandezas deixam
de compartilhar um nome.

## D2 · As três saídas escaladas são RECUSADAS — todas as três, com o custo de cada uma

| # | saída escalada | por que é recusada | custo que ela cobrava |
|---|---|---|---|
| **A** | sexto membro em `Nature` (`RATIO_STOCK`/`RATIO_FLOW`) | **resolve a pergunta errada.** M3 mostra `DoD-2` verde com `RATIO` intocado. Emendaria `SPEC-001` §2.1 + `ADR-006` para não mover o número | **re-identifica** toda série `RATIO` (`nature` é 1 dos 15 termos do `sha256`, `series_key_id`), emenda de 2 documentos, união TS de `series-catalog.ts` |
| **B** | `CARRY_FORWARD_BY_NATURE[RATIO] = True` | **mascara o defeito em vez de corrigi-lo** — é exatamente o que `STOCK` já faz (M3, linha 3: invariante sob a largura). E liga `LOCF` também para `sum_taker_long_short_vol_ratio`, a razão de FLUXO, cuja inflação o comentário do módulo mede em **3,3×** | 1 linha; e a largura errada fica viva e invisível em todas as 28 entradas `STOCK` |
| **C** | `nature=STOCK` só para `count_long_short_ratio` | mesmo mascaramento de (B), mais contradizer a docstring de `Nature.RATIO` no arquivo que a define e apagar a distinção de `SPEC-001` §5.11 | **re-identifica** a série |

⛔ **E as três deixam `series_history.py:179` intacta** ⇒ a fase `03` (open interest, `5min`, e hoje
`STOCK`) e toda série futura de grade > 1 min herdam o mesmo veto, agora sem sintoma que o revele.

**Corolário que dissolve a pressão de prazo do escalonamento:** o bloqueio foi escalado como
*"janela barata AGORA, antes do merge, senão vira migração de identidade"*. Isso era verdade para
(A) e (C), que mexem em `nature`. **A decisão tomada aqui não toca nenhum termo de `SeriesKey`** ⇒
nenhum `series_key_id` se move, e **não há migração de identidade a evitar**. O que sobra de urgente
é só não mergear uma fase cujo `DoD-2` é estruturalmente inalcançável.

## D3 · Como a grade nativa chega ao caminho de leitura: **declarada em inteiro, nunca parseada**

`SeriesCatalogEntry.native_grid` é `str` (`"5min"`, `"1min"`), na grafia da fonte. A docstring de
`bucket_interval_ms` proíbe por nome duas formas de obtê-lo: derivar de `SeriesKey.interval`
(*"NEVER PARSED FROM"*) e escrever um segundo tradutor de rótulo de grade (*"a second parser here
would be the second implementation that item exists to forbid"* — `buildCanonicalGrid`/`ADR-003`/FR-3).

**Decisão:** `SeriesCatalogEntry` ganha `native_grid_ms: int`, **declarado ao lado** do rótulo por
cada construtor de catálogo, com guarda `> 0` em `__post_init__` na mesma postura do
`native_grid is blank` que já existe ali. **Nada parseia nada**: quem já declara `native_grid="5min"`
declara `300_000` na mesma linha, e a única coisa nova é um inteiro que hoje não existe.

⚠️ **A divergência entre os dois campos é o risco desta forma, e ele é nomeado, não presumido:**
nada impede alguém declarar `("5min", 60_000)`. O que fecha é um teste que enumera **todas** as
entradas servidas e exige que o par venha de uma tabela declarada única — e essa tabela é
declaração, não parser: ela não decide *quais instantes existem numa janela*, que é o que
`ADR-003`/FR-3 reserva ao `canonical-grid`.

## D4 · O relatório tem de saber DIZER "upsampling" — hoje ele só sabe dizer `SEM_PONTO`

Mesmo com `D1` aplicada, `/series-history?interval=1m` sobre uma série de 5 min devolve uma
**escada**: 4 de cada 5 slots repetem a mesma observação (M3). `ADR-026/D1` já criou o vocabulário
exato para isso — `UPSAMPLING`, quando `panel_grid_ms < native_grid_ms` — e `CA-F4-4` já mediu o
caso (*"1m sobre grade de 5m: 20,0% de cobertura"*). O mecanismo existe e **não tem chamador** (M6).

**Decisão:** o relatório de `/series-history` passa a carregar o veredito de
`classify_grid_multiple(panel_grid_ms=_GRID_STEP_MS, native_grid_ms=entry.native_grid_ms)`, e
`classify_grid_multiple` ganha seu primeiro chamador de produção. Um slot repetido tem de ser
distinguível de um slot com bucket próprio **na resposta**, não só no olho de quem lê o gráfico —
sem isso `RN-S1` manda o DoD dividir por 5 um número que a API não qualifica, e o *"1 barra real e
5 linhas repetidas passa com N=5"* que a própria `RN-S1` teme volta pela porta dos fundos.

⚠️ **Tensão declarada entre dois documentos, e a leitura que adoto:** `ADR-026/D1` classifica 1m
sobre 5m como `UPSAMPLING` e **não habilitado**, enquanto `SPEC-007`/`RN-S1` instrui o DoD a contar
a escada dividindo por 5 — isto é, conta com ela chegando ao DOM. Leio as duas como superfícies
diferentes: `ADR-026/D1` governa **quais timeframes o seletor do painel oferece**, `RN-S1` governa
**como uma série de 5 min é desenhada na grade de relatório fixa de 1 min** (`ADR-034/D6` só serve
`interval=1m`). `[INFERRED: ADR-026 fala em "seletor de timeframe" no próprio D1; SPEC-007 é
posterior, é da feature, e instancia o DoD para este caso concreto]` — **se a leitura estiver
errada, quem a corrige é `ADR-026`, e a consequência é `DoD-2`/`DoD-3` das fases `03` e `04`
mudarem de forma, não de valor.**

## D5 · O que continua ABERTO e não é fechado aqui

1. **`Nature.RATIO` precisa de um sexto membro?** O `[NÃO SEI]` de `as_of_accessor.py:101-111`
   segue **intocado e com o mesmo dono**. Ele deixou de ser bloqueante (M3) e **não** deve ser
   decidido sob pressão de um `DoD` vermelho. Vai para `PENDENCIAS-PARA-AVALIAR-DEPOIS.md` por
   `D17`. A série de razão de FLUXO (`sum_taker_long_short_vol_ratio`) ainda não existe na base;
   quando existir, a pergunta volta com custo real.
2. **`ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE` continua aberto e é OUTRA coisa.** Lá o atraso
   (60.936 ms) excede uma largura nativa **correta** (60.000 ms) em 5 de 181 buckets — física da
   fonte, não fio trocado. `D1` **não** o resolve e não o piora. Mesma cláusula, causas disjuntas.
3. **`E1`/`D16`** já é decisão do owner e continua pendente de implementação; M3 e M5 dão o número
   do que ela vale aqui: `4 / 61` → `48 / 61`.

---

## O que precisa do OWNER, explicitamente

**Nada em `D1`–`D4`**: são correção contra `SPEC-007` aprovada e contra a docstring do próprio
campo. **Um item, e só um, é do owner:**

> ⛔ **`DoD-2` e `RN-S2` são aritmeticamente inalcançáveis para as fases `03` e `04` como estão
> escritos, e corrigir o DoD de uma SPEC aprovada exige `approve` do owner.**
> `RN-S2` pede **`N ≥ 30` pontos distintos**; `RN-S1` manda contar **barras nativas**. Para uma
> série de 5 min, 30 barras nativas são **150 minutos** de janela — e a janela do `DoD-2` como
> exercida é de 60 min (61 slots), teto de **12** barras nativas. Pior: M5 mede **2 buckets ao
> vivo, vão de 5 min** hoje; todo o resto é backfill invisível até `D16`.
> **A emenda que proponho, para o owner aprovar ou recusar:** o comando de `DoD-2`/`DoD-3` de série
> de grade `5m` nomeia janela **≥ 150 min** e conta `pontos_no_DOM / 5`; e enquanto `D16` não
> existir em código, o universo do DoD é **explicitamente o dado colhido ao vivo**, declarado no
> comando, nunca a contagem de `md.series`.

⚠️ Não escrevi `Status: APPROVED` em lugar nenhum e não toquei o ledger. `harness pipeline state
cinco-metricas-do-core` → `BUILD_AUTHORIZED`.

---

## Falsificador desta ADR

**Ele é a coluna que tem de MORRER na matriz de M3, medida do mesmo jeito, depois da correção.**

⛔ **A matriz de M3 foi produzida por um script ad-hoc, e um falsificador que mora em `/tmp` não é
falsificador.** A correção só está completa quando a matriz virar **teste versionado** em
`backend/tests/` — tabela de 2 larguras × 2 naturezas sobre `as_of`, com os quatro números de M3
cravados. Quem o escreve é `/builder`+`/qa`; esta ADR declara o que ele tem de medir, e os números
de M3 são a linha de base contra a qual ele nasce.

1. **MORDE:** com `bucket_interval_ms` vindo de `native_grid_ms`, `count(com_valor) > 0` sobre a
   série de `04` **sem** que `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` tenha mudado de `False`.
   `grep -n 'Nature.RATIO: ' backend/src/modules/sentimento/domain/as_of_accessor.py` tem de
   continuar devolvendo `False` — **se alguém precisar mexer nessa linha para o DoD passar, o
   diagnóstico desta ADR estava errado e (A)/(B)/(C) voltam à mesa.**
2. **CALA:** injetar `60_000` de volta devolve **exatamente `0 / 61`**. Um teste que passe com as
   duas larguras não está medindo esta decisão — é a cegueira de universo que a wave `03` já pagou
   duas vezes (`BLOCKER-3`).
3. **O controle negativo, que é o que impede o teste de mentir:** a mesma bateria sobre uma série
   `STOCK` tem de ser **invariante** sob a largura (M3: 1→1, 61→61). Se ela se mover, a mudança
   alcançou o caminho de carry-forward, que esta ADR não autoriza tocar.
4. **O falsificador de longo prazo, contra a erosão:** a célula
   `(nativeGrid > 1min, nature não carregável)` do catálogo servido era **0 de 44** (M4). Se ela
   voltar a ficar vazia depois da fase `04` mergeada, a série não chegou ao catálogo e o `DoD-2`
   está verde por outro motivo que não o desta decisão.

```bash
curl -s http://localhost:8000/api/v1/series-catalog \
 | python3 -c "import json,sys,collections;d=json.load(sys.stdin);c=collections.Counter((e['nativeGrid'],e['key']['nature']) for e in d['entries']);[print(v,k) for k,v in sorted(c.items())]"
```
