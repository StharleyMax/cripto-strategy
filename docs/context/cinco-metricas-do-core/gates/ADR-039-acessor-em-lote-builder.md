# `ADR-039` — acessor em lote: relatório do builder

**Data:** 2026-09-16 · **Branch:** `fix/a11-varredura-unica-as-of` · **Componente:** `sentimento`
**Contrato:** [`docs/adr/ADR-039-acessor-em-lote-a-monotonicidade-da-admissao-e-a-chave-de-ativacao.md`](../../../adr/ADR-039-acessor-em-lote-a-monotonicidade-da-admissao-e-a-chave-de-ativacao.md)
**Medição de origem:** [`handoff/A11-LATENCIA-DE-SYMBOL.md`](../handoff/A11-LATENCIA-DE-SYMBOL.md)

---

## 1 · O ganho, medido — e o "< 1 s" do handoff era estimativa

`[MEDIDO 2026-09-16, `deploy-postgres-1` SOMENTE LEITURA (`SET default_transaction_read_only = on`),
nenhuma semeadura, nenhum restart de container]`

### 1.1 · O baseline pela rede, na URL exata do `handoff` §2

```bash
SID=94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9
B="http://localhost:8000/api/v1/series-history?series_key_id=$SID&symbol=BTCUSDT&interval=1m&knowledge_time_ms=1789572240000&bar_policy=final_only"
E=1789571940000; S=$((E-345540000))
curl -s -o /dev/null -w 'total=%{time_total}s size=%{size_download}B\n' "$B&window_start_ms=$S&window_end_ms=$E"
# ANTES span=5759min size=570607B total=14.180193s
```

O corpo bate **byte a byte** com o do handoff (`570.607 B`), então é a mesma resposta; o tempo
saiu **14,18 s** contra os **17,250 s** de lá — máquina menos carregada, mesma ordem de grandeza.

### 1.2 · O A/B no mesmo processo, sobre o mesmo Postgres real

⛔ **Por que não há `curl` "depois":** trocar o código que o `deploy-api-1` executa exige
`restart` do container, **explicitamente proibido nesta task**, e subir uma segunda API contra o
Postgres de produção abriria mais **2 conexões `idle in transaction`** (`B12`, `handoff` §6b) —
bloqueadores do `ALTER TABLE` do coletor. Então o "depois" foi medido **onde a mudança está**: um
processo local, lendo as **mesmas linhas reais** pelo `PostgresSeriesWindowReader`, comparando o
caminho NOVO (`build_series_history_report` inteiro, incluindo o `SELECT`) contra o caminho ANTIGO
(um `as_of` por instante de grade, sobre observações já carregadas — ou seja, **sem** o custo do
`SELECT`, o que favorece o antigo).

| janela | linhas | grades | **lote (s)** | **um-a-um (s)** | ganho |
|---|---|---|---|---|---|
| **5.759 min** | 10.069 | 5.760 | **0,228** | **23,662** | **103,8×** |
| 2.879 min | 4.024 | 2.880 | 0,104 | 5,609 | 53,8× |
| 1.439 min | 1.372 | 1.440 | 0,049 | 1,062 | 21,5× |
| 719 min | 403 | 720 | 0,016 | 0,151 | 9,6× |

⭐ **O falsificador do `handoff` §2 inverteu de sinal, e é isso que prova que a causa era o laço:**
antes, dobrar a janela multiplicava o tempo por **~5,5×** (superquadrático) enquanto o corpo dobrava.
Agora, de 719 → 5.759 min (**8×** de janela, **25×** de linhas) o tempo vai de 0,016 → 0,228 s —
**14,3×**, praticamente linear no produto `n log n + m`. O custo deixou de estar no cálculo por ponto.

**O "17,2 s → < 1 s" do `handoff` §6 CONFIRMA-SE, e com folga:** o trabalho Python que respondia as
5.760 grades caiu de **23,662 s** para **0,228 s** — e esse 0,228 s **já inclui** o `SELECT` de
9 ms. ⚠️ O que **não** foi medido é a resposta HTTP ponta a ponta com o código novo: falta a
serialização do envelope e o overhead de FastAPI. `[NÃO MEDIDO: exige restart de container]`

---

## 2 · `DoD-2` — veredito: **PASSA**, com uma limitação nomeada em `D3`

`backend/tests/sentimento/test_as_of_batch_differential.py`, **16 testes, todos verdes**:

```bash
find backend -name __pycache__ -type d -prune -exec rm -rf {} +
backend/.venv/bin/python -m pytest backend/tests/sentimento/test_as_of_batch_differential.py \
  backend/tests/sentimento/test_as_of_accessor.py \
  backend/tests/sentimento/test_as_of_is_the_single_reader.py \
  backend/tests/sentimento/test_series_history.py -q --no-cov -p no:cacheprovider
# 87 passed
```

### 2.1 · A fatia é REAL, e os dois defeitos foram contados nela

`data/postgres/md_series_slice_adr039.jsonl` — **571 linhas**, `md5 bb182d74556cb2fe6faa88dc645e5380`,
exportada com `BEGIN READ ONLY` (comando por extenso em `data/MANIFEST.md`). O diferencial roda
`as_of_batch(...)[i].projection() == as_of(t=tᵢ, …).projection()` para **as duas séries** × **os dois
`bar_policy`**, e a fatia carrega:

| defeito | na fatia | asserido por |
|---|---|---|
| `D2` — `available_at < bucket_end` | **1 linha, a PIOR das 748**: `−3.481.439 ms` (58 grades) | `test_the_real_slice_carries_the_d2_rows…` |
| `D3` — vencedor re-minimizado para trás | **23** buckets multi-linha | `test_the_real_slice_carries_the_d3_backwards_revision…` |

### 2.2 · ⛔ A limitação, nomeada em vez de escondida: `D3` **não é falsificável no dado de hoje**

**PRESENTE não é o mesmo que VISÍVEL.** Uma re-minimização só muda uma RESPOSTA se a linha revisada
ativar **enquanto o bucket dela ainda é o mais novo admitido**. Medido sobre a tabela inteira:

```sql
BEGIN READ ONLY;
WITH r AS (SELECT series_key_id, symbol, bucket_end, observed_at, source, ingested_at,
                  greatest(available_at, bucket_end) AS act FROM md.series),
     w AS (SELECT DISTINCT ON (series_key_id, symbol, bucket_end) …, act AS win_act
           FROM r ORDER BY …, observed_at, source, ingested_at),
     f AS (SELECT …, min(act) AS min_act, count(*) AS n FROM r GROUP BY 1,2,3),
     j AS (SELECT …, lead(f.min_act) OVER (PARTITION BY series_key_id, symbol
                                           ORDER BY bucket_end) AS next_min_act …)
SELECT count(*) FROM j
WHERE n > 1 AND win_act > min_act AND next_min_act IS NOT NULL AND win_act < next_min_act;
-- 0
```

**`0` de `5.624` buckets re-minimizados** (sobre `147.860` multi-linha) revisam antes de o bucket
seguinte assumir. A mediana da revisão nesta série é **105.634.113 ms ≈ 1,2 dia**, e o bucket seguinte
assume em **300.000 ms**. ⇒ nenhuma fatia real hoje pode carregar a forma.

**Consequência, e ela é deliberada:** o falsificador de `D3` roda sobre um **par sintético de duas
linhas, rotulado como tal** (`_revision_inside_its_own_ownership_window`), e o motivo mora num teste
que **mede o zero** (`test_no_backwards_revision_in_md_series_today_can_move_a_reading`) — que é
também o **gatilho**: no dia em que uma revisão cair dentro da janela de posse do próprio bucket, ele
reprova e alguém move o falsificador para linhas reais. Embarcar um falsificador que **não pode
disparar** seria o `rc=0` ambíguo de `ADR-012`, e deixaria `_absorb` degradar para "primeiro que
ativou vence" com a suíte verde.

⚠️ **Isto é uma leitura minha de `DoD-2`, não do texto dele.** `DoD-2` exige "≥1 dos 7.600 buckets de
`D3`" na fatia — e a fatia **tem 23**. O que o texto não previu é que a presença deles não move
nenhuma leitura. Quem discordar da leitura tem o número acima para decidir contra.

### 2.3 · As mutações que REPROVAM (verde não prova nada até uma mutação reprovar)

| mutação | onde | resultado |
|---|---|---|
| `_activation_instant` → `row.available_at` (a forma LOOKAHEAD de `D2`) | fatia REAL, série `funding_estimated` | **diverge** — teste passa |
| `_absorb` → `setdefault` ("primeiro que ativou vence", `D3`) | par sintético rotulado | **diverge no instante 2, e só nele** — teste passa |
| terceira pública `-> list[AsOfReading]` plantada em `as_of_accessor.py` | guarda de `DoD-1` | **VERMELHO**: `['as_of', 'planted_regression_reader'] != ['as_of']` |
| grade não-monotônica (`instants[10], instants[9]`) | `as_of_batch` | **`DecisionReadRefusedError`** |

O guarda de `DoD-1` (apertado em `b964a95`) **mordeu em mim antes de eu declarar**: ao acrescentar
`as_of_batch` sem tocar em registro nenhum, `test_exactly_one_public_callable…` e
`test_inside_those_modules…` reprovaram os dois.

---

## 3 · `D1`/`C1`–`C4` — como cada condição foi cumprida

| | como |
|---|---|
| `C1` | `as_of_batch` mora em `domain/as_of_accessor.py`, dentro da MESMA entrada de `DECLARED_TOUCHERS` |
| `C2` | `as_of` **intacta como definição**, não virou `as_of_batch(t)[0]`, e **a conjunção de admissão não foi reescrita**: `_admits` é o único lugar onde os cinco termos existem, e **as duas portas o chamam** |
| `C3` | o diferencial de §2, bit a bit, sobre fatia real |
| `C4` | `DECLARED_PRODUCERS = ["as_of", "as_of_batch"]`, a segunda com o argumento completo no formato das entradas de `DECLARED_TOUCHERS` |

### 3.1 · ⭐ A prova de `C2` que um AST consegue checar

`as_of_batch` **não aparece** em `DECLARED_TOUCHERS`, e **a ausência é a medição**: o scan procura
`ast.Attribute` sobre `observed_at`/`available_at`/`bucket_end`, e `as_of_batch` **não soletra
nenhuma das três**. Toda coluna que ela toca chega por `_admits`, `_activation_instant`, `_absorb` e
`_reading_for` — os mesmos helpers por onde `as_of` as toca. Uma porta em lote que tivesse
**reimplementado** a conjunção teria de nomear essas colunas, e nomeá-las a colocaria no registro.

### 3.2 · O que é genuinamente NOVO, e por que `as_of` **não** o chama

`_activation_instant` é a única coisa que `as_of_batch` acrescenta. Ela é **deliberadamente não
chamada por `as_of`**: compartilhá-la moveria os dois lados do diferencial juntos e o cegaria
justamente para o defeito que as 748 linhas existem para pegar. `as_of` segue soletrando
`available_at <= t` e `bucket_end <= t` literalmente.

---

## 4 · `D6` — pré-filtro: forma `2A`, dentro do acessor; `2B` **vetado**

**Nenhum pré-filtro foi acrescentado em `use_cases/series_history.py`**, e isso é `D6` cumprido, não
ignorado: `_activated_in_order` avalia `_admits` **uma vez por linha**, no instante de ativação da
própria linha — que é exatamente o ganho da forma `2A` (predicados constantes em `t` fora do laço),
realizado **dentro do acessor**, onde mora a guarda de solda. Repetir isso no caller compraria zero e
custaria o que importa: o use case passaria a tocar `observed_at`/`available_at` e viraria entrada
nova em `DECLARED_TOUCHERS`. `2B` (tirar `series_key_id`/`symbol` de dentro de `as_of`) não foi
tocado — segue vetado.

---

## 4b · O portão — `make verify`, sobre a árvore FINAL

```
=== verify · cripto-strategy · 20260916T172928Z (UTC) ===
[OK] lint-backend    rc=0  453 source files
[OK] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[OK] test-frontend   rc=0  668 pass, 0 fail em 4 suítes
[OK] test            rc=0  2498 passed · Total coverage: 96.67%
[OK] boundaries      rc=0  7 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK] política        rc=0
[OK] e2e             rc=0  36 passed (39.4s)
veredito: VERDE — 8 portões mediram e passaram
```

⚠️ **Esta é a TERCEIRA rodada, e as duas anteriores foram descartadas de propósito:** eu editei
docstring depois de cada uma começar, e portão que mediu árvore diferente da que vai para review
não é portão — é número que parece certo. Esta rodou sobre a árvore congelada
(`git status --short` conferido antes e depois, sem arquivo efêmero de `boundaries` sobrando).

`harness rules --mode sweep --changed-only` → **`rc=0`, 0 bloqueio**, 1 aviso
(`core.module-docstring-single-line` em `series_history.py:1`, **pré-existente** — a linha 1
daquele arquivo não foi tocada).

---

## 5 · Arquivos alterados

| arquivo | |
|---|---|
| `backend/src/modules/sentimento/domain/as_of_accessor.py` | modificado — `as_of_batch` + `_admits`, `_activation_instant`, `_activated_in_order`, `_absorb`, `_reading_for`, `_refuse_a_grid_that_goes_backwards` |
| `backend/src/modules/sentimento/use_cases/series_history.py` | modificado — laço `O(grade × linhas)` → uma chamada de lote |
| `backend/tests/sentimento/test_as_of_is_the_single_reader.py` | modificado — `DECLARED_PRODUCERS` + `DECLARED_TOUCHERS`, cada entrada com o motivo |
| `backend/tests/sentimento/test_as_of_batch_differential.py` | **novo** — `DoD-2` e os falsificadores |
| `data/MANIFEST.md` | modificado — catálogo da fatia real + comando de reprodução |
| `data/postgres/md_series_slice_adr039.jsonl` | **novo, gitignored** (`.gitignore:51`) — a fatia real |

---

## 6 · Achados colaterais, declarados

1. **⛔ `bash backend/scripts/lint.sh` já estava VERMELHO em `b964a95`** (`rc=1`, 3 achados `D205`/
   `D400`/`D401` no docstring de `_mentions_a_reading`, introduzido por aquele commit). Verificado com
   `git stash` + `lint.sh` sobre o `HEAD` limpo. **Corrigido aqui**, no mesmo arquivo que eu já
   editava — mas o fato de um commit ter entrado com o lint vermelho é do commit, não desta task.
2. **`as_of` fica sem chamador de produção.** `series_history.py` era o único, e agora chama o lote.
   Isso é `C2` funcionando (a definição existe para ser comparada, não para ser executada em
   produção), e é a mesma forma que `ADR-037`/M6 registrou para `classify_grid_multiple` — só que
   invertida. Está nomeado aqui para não ser descoberto como surpresa por um `/review` futuro.
3. **A série `funding_estimated` (`b3d96034…`) não está em catálogo nenhum** — `list_series_catalog()`
   tem 15 entradas e nenhuma é ela, embora a ingestão esteja escrevendo `md.series` para ela desde
   `1788893171000`. Não é escopo desta task; fica registrado.
