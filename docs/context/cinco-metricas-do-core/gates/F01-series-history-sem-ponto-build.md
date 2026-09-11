# `F01` · `series-history` devolvia `SEM_PONTO` em 100% das linhas — causa-raiz e correção

Resposta a [`handoff/ACHADO-SERIES-HISTORY-SEM-PONTO.md`](../handoff/ACHADO-SERIES-HISTORY-SEM-PONTO.md).
Componente `sentimento`. **É bug, não decisão de arquitetura** — o argumento está em §3.

---

## 1. A causa-raiz, em uma linha

**`backend/src/modules/sentimento/use_cases/series_history.py:151`** (antes da correção:
`t=grid_instant`) passava o **instante de grade** — que é uma **coordenada X** — como **`t`, o
instante de decisão** de `as_of()`. Os dois não são o mesmo número, e a diferença entre eles é
exatamente o **atraso de publicação**.

### O mecanismo, predicado a predicado

A barra que o gráfico desenha em `g` é o bucket que **fechou** em `g` — em toda linha armazenada
`bucket_end == event_time`, ambos múltiplos de `60000`:

```bash
docker exec -i deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  <<< "SELECT bucket_end, event_time, available_at - bucket_end AS lag, bucket_end % 60000
       FROM md.series WHERE series_key_id='ef3033e6…4e42' ORDER BY bucket_end DESC LIMIT 6;"
# 1789132080000|1789132080000|53677|0   (e mais 5, lag 47_183..53_677, align sempre 0)
```

`[MEDIDO 2026-09-11, n=6 linhas mais novas]`

Um bucket só fica **legível** um atraso de publicação **depois** de fechar — e isso não é achado
novo, está escrito em `as_of_accessor.py`, na docstring de `SeriesReadPolicy.bucket_interval_ms`:
*"a bucket becomes readable one lag AFTER it closes"*. Logo, em `t = g`:

| predicado | bucket que fecha em `g` | veredito |
|---|---|---|
| R-2 `bucket_end <= t` | `g <= g` | admite |
| R-1 `available_at <= t` | `g + ~50_000 <= g` | **REJEITA** |

⇒ `as_of(t=g)` **nunca** consegue devolver o bucket de `g`. O que ele devolve no lugar depende
**só da natureza**, e as duas respostas estão erradas:

- **`FLOW`** (`klines_volume`): sem carry-forward (`CARRY_FORWARD_BY_NATURE[FLOW] is False`), o
  bucket anterior já está em `age_ms = 60_000 >= bucket_interval_ms` ⇒ `SEM_PONTO`. **Toda linha,
  para sempre** — o sintoma que o achado reproduziu (`180` linhas, `0` valores, `100%`
  `SEM_PONTO`).
- **`STOCK`** (open interest, preço): com carry-forward, desenha o valor do bucket **anterior** em
  `g`. O gráfico fica **um minuto inteiro atrasado** e nada avisa. **É a metade silenciosa do
  mesmo defeito** — e é por isso que ele passou: as séries que tinham teste eram `STOCK`.

### Por que nenhum teste pegava

`test_series_history.py::test_reports_one_row_per_grid_instant_with_a_value_present` (a única
fixture com valor) carimbava `available_at == bucket_end` — **atraso de publicação zero**, a única
forma que R-1 não rejeita em `t = g`. A fixture não reproduzia nenhuma linha real. Nenhum teste
usava série `FLOW`.

---

## 2. A correção

`use_cases/series_history.py`, função nova `_read_instant(grid_instant, *, bar_policy)`:

- **`final_only` → `grid_instant + _GRID_STEP_MS - 1`.** `[g, g + passo)` **é** o intervalo em que o
  bucket que fechou em `g` é o mais recente já fechado; esta é a **última** instância dele — o único
  ponto do intervalo derivável **só da grade**, sem conhecer o atraso linha a linha. Quem torna o
  alcance seguro é **R-2**: buckets são carimbados na grade de `60000`, então o maior `bucket_end`
  admissível continua sendo `g`. **Um milissegundo a mais admitiria o bucket seguinte.**
- **`intrabar` → `grid_instant`, inalterado.** Sob `intrabar`, `_r2_admits` devolve `True` de saída:
  o teto que torna o alcance seguro **não existe**. Esticar até o fim da célula deixaria um
  **parcial** do bucket que fecha um passo depois vencer e ser rotulado com o instante anterior —
  dado de **depois** de `t` desenhado **em** `t`, a inversão que `SPEC-001` §2.4 existe para impedir.

**`as_of()` não foi tocado** — nem `domain/`, nem `infra/`, nem `INGEST_HEALTH_RUN_COLUMNS`, nem
`frontend/`. `git diff --stat`: 2 arquivos, `+291 −1`.

---

## 3. Por que é bug e não decisão de arquitetura (o teste que o escopo pedia)

`ADR-034/D9`, item 2, prescreve literalmente *"para cada instante de grade na janela, chama
`as_of(t=grade, purpose=RENDERING, …)`"*, e a implementação seguia a letra. **Mas a própria
`as_of_accessor.py` declara que a janela de legibilidade de um bucket é `[fechamento + atraso,
fechamento + intervalo)`** — não vazia, por construção. A grade amostrava **exatamente as duas
extremidades excluídas** (`g` e `g + 60_000`). Corrigir o instante de leitura **realiza** a
semântica que `as_of` já declara em vez de mudá-la; a `ADR-034/D9` não considerou o atraso de
publicação na borda da grade, e não há decisão nova sendo tomada aqui. O que **seria** decisão de
arquitetura está em §6, e **não foi decidido**.

---

## 4. VERMELHO antes de VERDE, e as três mutações

### Os testes reprovam **antes** da correção

```
make test-fast K=series_history        # com t=grid_instant, o código como estava
→ 3 failed, 19 passed, 1934 deselected
E  AssertionError: assert [None, None] == ['72.068', '30.537']   # FLOW  — o sintoma de produção
E  AssertionError: assert [None, '10'] == ['10', '20']           # STOCK — um bucket atrasado
E  AssertionError: assert [None]       == ['72.068']             # anti-lookahead
```

### Depois

```
make test-fast K=series_history  → 22 passed, 1934 deselected  (16,65s)
```

### Mutação — cada defeito plantado de volta, e quem o reprova

| # | mutante | reprova |
|---|---|---|
| 1 | `return grid_instant` (o defeito original) | **3 testes** — `…flow_series_with_publication_lag…`, `…stock…not_shifted_one_bucket_late`, `…never_served_at_it` |
| 2 | `grid_instant + _GRID_STEP_MS` (um passo longe demais) | **2 testes** — inclusive `…a_bucket_that_closes_after_the_grid_instant_is_never_served_at_it`, que serve `999` do bucket seguinte |
| 3 | ramo `intrabar` removido | **1 teste** — `…intrabar_reads_at_the_grid_instant_and_never_the_next_bucket_partial` serve o parcial `999` do bucket seguinte |

Nenhum mutante sobrevive. `[MEDIDO 2026-09-11, `make test-fast K=series_history`, universo 22
testes do arquivo]`

---

## 5. A prova contra o dado REAL — leitura, zero escrita

`md.series` **não foi semeado**. O script de verificação abre a conexão com `conn.read_only = True`,
monta o `SeriesCatalogEntry` a partir do JSON que a própria API serve (nada inventado, o
`series_key_id` recalculado bate com `ef3033e6…4e42`) e roda o use-case corrigido sobre as 181
últimas grades de `klines_volume`/BTCUSDT:

```
rows=181 with_value=176 sem_ponto=5
  event_time=1789121820000 value=45.698 available_at=1789121875672
  event_time=1789121880000 value=16.086 available_at=1789121937281
  event_time=1789121940000 value=54.215 available_at=1789121998850
```

**Antes: `0` de `180` com valor. Depois: `176` de `181`.** `[MEDIDO 2026-09-11]` — **`DoD-2` da
fatia `01` deixa de estar bloqueado por este defeito.**

---

## 6. ⚠️ O resíduo de 5/181, medido e **NÃO decidido por mim**

As 5 ausências que sobram **não são resto do bug** — são as 5 linhas cujo atraso de publicação
passou de **uma grade inteira**:

```sql
-- janela [1789121820000, 1789132620000], mesma do §5
SELECT count(*), count(*) FILTER (WHERE available_at-bucket_end >= 60000),
       min(available_at-bucket_end), max(available_at-bucket_end)
-- → 181 | 5 | 268 | 60936          [MEDIDO 2026-09-11]
```

`5` linhas com atraso `>= 60_000` ms (máx. `60_936`) e `5` linhas `SEM_PONTO`: **a correspondência é
exata**. Um bucket `FLOW` publicado depois de um passo inteiro já nasce, pela regra `D4.11`
(`age_ms >= bucket_interval_ms` e `FLOW` não carrega nada adiante), **velho no instante em que fica
legível** — e não há instante de leitura que o alcance sem admitir o bucket seguinte.

**Isso É decisão de arquitetura** (`ADR-006` / `SPEC-001` §5.11 / `D4.11`), **não é bug, e eu não a
tomei.** Está escrita como achado em
[`handoff/ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`](../handoff/ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md).
Teto de perda hoje: **2,8%** (5/181).

---

## 7. O que este gate **não** fecha

Os **dois outros defeitos** que o achado original nomeia continuam abertos e **não são deste
componente nem deste escopo**:

- janela FIXA `2026-08-20..24` em `frontend/src/charts/s2-panels.ts` (`web` — `frontend/` intocado
  por ordem explícita da task);
- catálogo servido tem **1** entrada de `klines_volume` (só BTCUSDT) contra **4** símbolos em
  `md.series`.
