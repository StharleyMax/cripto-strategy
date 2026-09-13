# `ADR-038`/`D1` em código — e o achado que **reduz `D1` de dois endpoints para um**

**Feature:** `cinco-metricas-do-core` · **Componente:** `sentimento` · **Data:** 2026-09-12
**Base:** `e4b91cb` (master) · **Escopo:** `D1` apenas. O **`§7.1` NÃO foi implementado** — ele
emenda `D16` e é ato do **owner**.

---

## 0 · Veredito em uma linha

`D1` está em código para **`/futures/data/openInterestHist`**, medido `1/61 → 61/61`. **Não está
para `/futures/data/globalLongShortAccountRatio`**, e a razão não é escopo: aplicá-lo lá é uma
**regressão medida**, `4/61 → 0/61`. O `§3` do `ADR-038` estende `D1` àquele endpoint com um
argumento que **não sobrevive à medição**, e a própria `§1.2` nunca mediu a decisão dela — a
linha `F` daquela tabela simula `+66.712` (o atraso **cru**), que **não é** o que o
arredondamento-para-cima emite.

---

## 1 · O que eu reproduzi ANTES de tocar em código (não herdei número)

Rodei `docs/context/cinco-metricas-do-core/gates/ADR-038-remedicao-e1.py` contra
`deploy-postgres-1` **somente leitura** — nenhum `insert`/`update`/`delete`, nada semeado.

⚠️ **Uma linha dele teve de ser ajustada para rodar, e isso está aqui em vez de escondido:** o
script traz um `sys.path.insert` com o caminho **absoluto** do checkout principal, então numa
worktree ele mede a árvore **errada** — exatamente o que eu não podia deixar acontecer, já que o
ponto era medir a linha-base **da minha base**. Apontei para `…/agent-<id>/backend` e rodei. Os
dois arnesses que EU escrevi (`§2.2`, `§3`) resolvem `backend/` a partir do próprio arquivo, para
que a próxima pessoa não tenha de descobrir isso de novo.

```bash
cd backend && PYTHONDONTWRITEBYTECODE=1 python3 <cópia com o sys.path apontando para esta árvore>
```

| controle / linha | esperado | medido |
|---|---:|---:|
| `C0` — universo **vazio** | `0/61` por construção | **`0/61`** ✅ |
| `C1` — `premiumIndex` ao vivo (`n = 4.749` linhas) | `~61/61` | **`61/61`** ✅ |
| `RATIO` grade `60k` (hoje) | `0/61` | **`0/61`** ✅ |
| `RATIO` grade `300k` (nativa) | `4/61` | **`4/61`** ✅ |
| `RATIO` grade `300k` + `E1` `+66.712` | `48/61` | **`48/61`** ✅ |
| `OI` grade `60k` | `1/61` | **`1/61`** ✅ |
| `OI` grade `300k` + `E1` `+34.532` | `61/61` | **`61/61`** ✅ |

`[MEDIDO 2026-09-12, universo literal de `ADR-037`/M3: 61 slots de 1 min, `t = slot + 59.999`,
`kt = agora`, BTCUSDT, `as_of` real, `bar_policy=FINAL_ONLY`, `purpose=RENDERING`; `n = 2.016`
linhas OI / `1.000` RATIO / `4.749` premiumIndex]`

⇒ **a matriz do `ADR-038` está reproduzida número a número.** Nada abaixo é herdado dela.

---

## 2 · 🔴 O ACHADO: `D1` é inválido para `globalLongShortAccountRatio`, e é aritmética

### 2.1 · O mecanismo

`as_of_accessor.py:328`:

```python
if age_ms >= policy.bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[series.nature]:
    return _absent(Absence.NO_POINT, ...)
```

com `age_ms = t - winner.row.bucket_end` (linha `326`) e
`CARRY_FORWARD_BY_NATURE = {STOCK: True, RATIO: False, ...}` (linhas `112-118`).

Uma linha carimbada `available_at = bucket_end + G` só é admissível a partir de
`t >= bucket_end + G`. Logo `age_ms = t - bucket_end >= G` **em todo instante em que ela é
legível**. Para uma natureza que **não** faz carry-forward, o veto portanto dispara **sempre**.
**É identidade aritmética, não propriedade de um dataset.**

### 2.2 · A varredura que mostra o degrau — mesmas linhas, só o offset muda

```bash
cd docs/context/cinco-metricas-do-core/gates \
  && PYTHONDONTWRITEBYTECODE=1 ../../../../backend/.venv/bin/python ADR-038-D1-varredura-de-offset.py
```

| `offset_ms` | `openInterestHist` (`STOCK`) | `globalLongShortAccountRatio` (`RATIO`) |
|---:|---:|---:|
| `34.532` | `61/61` | `61/61` |
| `66.712` | `61/61` | **`48/61`** ← o valor que `ADR-038` §1.2 linha `F` reporta |
| `150.000` | `61/61` | `36/61` |
| `299.999` | `61/61` | `12/61` |
| **`300.000`** | **`61/61`** | **`0/61`** ← **o valor que `D1` realmente produz** |
| `600.000` | `0/61` | `0/61` |

`[MEDIDO 2026-09-12, 61 slots de 1 min, `kt = agora`, BTCUSDT, `as_of` real sobre as linhas
construídas pelos mappers reais; `n = 2.016` OI / `1.000` RATIO; controles `C0`/`C1` acima]`

> ⚠️ **A POPULAÇÃO MUDOU NO MEIO DESTA MEDIÇÃO, e isso é declarado porque é justamente o que
> `CLAUDE.md` manda declarar.** Entre a primeira rodada e a segunda, uma **nova passada de
> backfill** rodou em produção — `md.series` foi de **`8.064` para `16.128`** linhas de OI e de
> `4.000` para `6.000` de RATIO; `count(distinct available_at)` foi de `4` para **`40`** (OI) e de
> `8` para **`12`** (RATIO) `[MEDIDO 2026-09-12, `psql` agrupando por `src_label_raw`]`. Continua
> **tudo backfill**: nenhum coletor ao vivo nasceu (`ADR-038` §7.3 segue de pé).
>
> **A varredura foi refeita sobre a população NOVA, do caminho já commitado, e devolveu a tabela
> ACIMA célula a célula** — `n = 4.032` OI / `1.500` RATIO. ⇒ o achado **não é artefato do
> dataset**: ele é a identidade aritmética do `§2.1`, e dobrar o universo não a move. Reproduzir:
>
> ```bash
> cd docs/context/cinco-metricas-do-core/gates \
>   && PYTHONDONTWRITEBYTECODE=1 ../../../../backend/.venv/bin/python ADR-038-D1-varredura-de-offset.py
> ```

### 2.3 · A leitura, e ela é dupla

1. **Para `STOCK` o `D1` está CERTO e mais forte do que o `ADR-038` argumentou:** não só o
   **carimbo** é invariante sobre `(0, 300.000]` — a **leitura** também é, `61/61` em toda a
   faixa. A linha `600.000` (duas grades) quebra, confirmando que a fronteira da faixa é real e
   que o instrumento **morde**.
2. **Para `RATIO` a invariância do carimbo NÃO transfere para a leitura.** `61/61 → 48/61 →
   36/61 → 12/61 → 0/61` não é invariante por nada, e `D1` cai exatamente na descontinuidade.

⚠️ **O `§3` do `ADR-038` justifica a extensão ao RATIO por "mesma grade nativa de `300.000 ms`".
A grade é a mesma; a `Nature` não é, e é a `Nature` que decide.** `[DOC: long_short_catalog.py`
declara `Nature.RATIO`; `open_interest_catalog.py` declara `Nature.STOCK]`.

### 2.4 · O que eu fiz com isso

**Não implementei `D1` para o RATIO** — implementar seria enviar uma regressão medida (`4/61` no
universo de 1 min; `2/61` na grade de 5 min que o painel desenha, `[DOC: ADR-038 §1.2]`) para
`0/61`. A recusa está **no construtor**, não num comentário:
`GridInvariantEndpoint.__post_init__` reprova uma entrada cuja `Nature` não faz carry-forward,
com a aritmética escrita na mensagem. ⇒ um commit futuro de *"vamos terminar o `D1`"* **reprova
um teste** em vez de esvaziar o painel com `rc=0`.

**A decisão volta para o autor do `ADR-038`.** Eu não emendo ADR de outro agente. As saídas que
enxergo, sem escolher nenhuma: (a) carimbo `bucket_end + p99 + margem` **sem** arredondar para a
grade, para o RATIO; (b) reabrir `D4.11`/`CARRY_FORWARD_BY_NATURE[RATIO]`; (c) declarar o RATIO
fora de `D1`.

---

## 3 · O que ENTROU em código, e a medição contra o mapper REAL

Não é simulação de shift: o arnês lê os buckets reais do store, passa pelos **mappers de
produção** (`build_open_interest_to_rows` / `build_long_short_to_rows`) e chama o `as_of` real.

```bash
cd docs/context/cinco-metricas-do-core/gates \
  && PYTHONDONTWRITEBYTECODE=1 ../../../../backend/.venv/bin/python ADR-038-D1-pos-implementacao.py
```

Rodado DUAS vezes, antes e depois da nova passada de backfill do `§2.2` — as duas saídas, para
que a mudança de população fique visível em vez de escolhida:

```
                                          população A (n=2.016)   população B (n=4.032)
OI  available_at-bucket_end distinct             [300000]                [300000]
OI  availability_source                          ['MODELED']             ['MODELED']
OI  observed_at == received_at para todas        True                    True
RATIO availability_source                        ['OBSERVED']            ['OBSERVED']   (inalterado)

C0 universo vazio                                0/61 (esperado 0)       0/61
C1 premiumIndex ao vivo                          61/61 (esperado ~61)    61/61  (n=4.760 / 4.782)

kt = agora, 61 slots de 1 min:   OI            61/61                   61/61   (ADR-038 previu 61/61)
kt = agora, 61 slots de 5 min:   OI            61/61                   61/61
F-2  kt = t (backtest):          OI             1/61                    0/61   <-- §7.1 NÃO foi enviado
F-2  kt = t, slots de 5 min:     OI             1/61                    1/61
```

O `F-2` de 1 min caiu de `1/61` para `0/61` entre as duas porque o bucket mais novo andou; o que
`F-2` exige é que **continue baixo**, e continua nas quatro células.

### 3.1 · Falsificador `F-2` — PASSOU, e é o que prova que eu **não** fiz o `§7.1`

`ADR-038` §5/`F-2`: depois do `D1`, o arnês com `kt = t` sobre OI **tem de continuar baixo**;
`61/61` ali só o `§7.1` compra. **Medido: `0/61`–`1/61`** nas duas populações e nas duas grades.
⇒ `observed_at` continua sendo o instante da busca, `D16` intacto, `§7.1` pendente com o owner. ✅

### 3.2 · ⚠️ Caveat de medição, declarado em vez de escondido

No `ADR-038-D1-pos-implementacao.py` **todas** as linhas de um endpoint passam pelo mapper com **um** `received_at` (o
`max(observed_at)` do store), enquanto no store real o RATIO tem **8 instantes de busca**
distintos. Por isso o braço RATIO **daquele** arnês não é a linha-base fiel de hoje — a
linha-base autoritativa do RATIO é a do `remede.py` lendo o banco direto (**`4/61`** em 1 min,
**`2/61`** em 5 min, `§1`). Isso **não** afeta a conclusão do `§2`: a varredura usa a **mesma**
construção para **todos** os offsets, então a comparação entre offsets é internamente válida — e
é ela que carrega o achado.

---

## 4 · Mutações — verde não prova nada até uma mutação reprovar

| # | mutação | reprovou? | quem pegou |
|---|---|---|---|
| `M1` | `ceil` → `floor` em `modeled_available_at` (a direção do arredondamento é a regra anti-lookahead) | ✅ **2 testes** | `test_the_stamp_is_invariant_over_the_whole_lag_band...`, `test_rounding_is_always_up...` |
| `M2` | carimbo do OI revertido para `available_at=received_at` / `OBSERVED` | ✅ **3 testes** | `test_the_provenance_columns_separate_the_two_clocks`, `test_a_backfill_row_is_not_stamped_with_the_instant_our_request_ran`, `test_the_modeled_stamp_does_not_move_when_the_collector_is_early_or_late` |
| `M3` | guarda de carry-forward desligada (`if False:`) — i.e. "vamos terminar o `D1`" | ✅ **2 testes** | `test_a_nature_that_does_not_carry_forward_is_refused...`, `test_this_endpoint_is_deliberately_outside_adr_038_d1...` |
| `M4` | klines declarado como entrada `(60_000, 61_071)` | ✅ recusa no construtor | `test_klines_cannot_even_be_written_down_as_a_grid_invariant_endpoint` |

`M4` é exercitado **dentro** do teste (o teste constrói a entrada de klines e exige a exceção),
por isso não precisa de patch temporário. Os patches de `M1`–`M3` foram revertidos; a árvore
final é a que `make verify` mediu.

---

## 4.5 · `make verify` — as rodadas, incluindo a que NÃO mediu

⚠️ **A máquina NÃO estava ociosa**, contra a pré-condição do despacho: `load average 6,36` com
**6 processos `pytest`** simultâneos de outras worktrees `[MEDIDO 2026-09-12, `uptime` +
`pgrep -c -f pytest`]`. A suíte levou **823 s** onde o registro histórico dela é ~37,5 s. Isso
muda **tempo**, não veredito — mas muda o veredito quando vira **colisão de porta**, que foi o
que aconteceu.

| rodada | resultado |
|---|---|
| `20260912T232002Z` | **`INDETERMINADO`** — `lint-backend rc=1` (uma quebra de linha que o `ruff format` desfaz) e `test rc=1` (`test_as_of_is_the_single_reader`, que eu **devia** ter quebrado — ver abaixo). `lint-frontend`/`test-frontend`/`e2e` **`rc=3`** por `frontend/node_modules` ausente |
| `20260912T233408Z` | **`INDETERMINADO`** — **7 de 8 portões OK** (`lint-backend` 447 arquivos · `lint-frontend` OK · `test-frontend` **592 pass, 0 fail** · `test` **2.382 passed, cobertura 96,60%** · `boundaries` **7 kept, 0 broken** · `regras` **0 bloqueio, 72 avisos** · `política` OK), e `e2e` **`rc=3`**: `RECUSA: porta 8811 (API) ja tem algo escutando` — **e2e de outro agente na mesma máquina**, não defeito meu |
| `20260912T234934Z` | ✅ **`VERDE — 8 portões mediram e passaram`**, com `E2E_API_PORT=8871 E2E_NEXT_PORT=4371`: `lint-backend` **447 arquivos** · `lint-frontend` OK · `test-frontend` **592 pass, 0 fail** (4 suítes) · `test` **2.382 passed, 1 skipped, cobertura 96,60%** (piso 70,0%) · `boundaries` **7 kept, 0 broken** · `regras` **0 bloqueio, 72 avisos** · `política` OK · `e2e` **27 passed (34,3 s)** |

```bash
PYTHONDONTWRITEBYTECODE=1 E2E_API_PORT=8871 E2E_NEXT_PORT=4371 make verify
# veredito: VERDE — 8 portões mediram e passaram
```

E sobre **o que eu mudei**, não sobre o repositório inteiro:

```bash
harness rules --mode sweep --changed-only
# 1 aviso (core.module-docstring-single-line, docstring de `collector_series_mapping.py`
#   que já era multi-linha antes desta mudança), 0 bloqueio
```

⏱️ A suíte levou **736,93 s** nesta rodada e **823,03 s** na anterior, contra as ~37,5 s que o
registro histórico dela traz — **contenção, não regressão**: `8` processos `pytest` simultâneos
de outras worktrees no momento da medição.

⛔ **`rc=3` não é verde e eu não o arredondo.** `INDETERMINADO` por porta ocupada é exatamente o
sinal ambíguo que `ADR-012` nomeia: não distingue *"o e2e passou"* de *"o e2e nunca rodou"*. Por
isso a rodada foi **refeita medindo**, com porta própria, em vez de ser declarada equivalente.

### 4.5.1 · ⚠️ O portão que mordeu EM MIM, e a correção não foi afrouxá-lo

`test_as_of_is_the_single_reader.py` reprovou na primeira rodada. Ele varre `backend/src` e
**pina por IGUALDADE** o conjunto de módulos que citam `as_of_accessor` — e
`domain/modeled_availability.py` importa `CARRY_FORWARD_BY_NATURE` dele. **Ele estava certo e eu
era o quinto importador.**

Duas correções, e a distinção entre elas é o ponto:

1. **`domain/modeled_availability.py` foi DECLARADO** em `DECLARED_IMPORTERS`, com o motivo
   escrito: importa **uma constante**, nunca chama `as_of()`, nunca vê uma `Observation`. ⛔ E
   **importar é o certo, não uma concessão** — redeclarar a tabela de carry-forward do lado do
   escritor seriam **duas verdades sobre um fato**, divergindo em silêncio: o escritor seguiria
   carimbando linhas que o leitor já teria começado a vetar, e os dois arquivos continuariam
   corretos lidos sozinhos. É a classe exata de defeito que este `D1` acabou de achar no RATIO.
2. **`use_cases/collector_series_mapping.py` NÃO foi declarado** — ele só *mencionava* o nome
   numa docstring, e o scan é textual. Entrar numa lista chamada `IMPORTERS` por causa de prosa
   **degradaria a precisão do instrumento**; a prosa foi reescrita.

---

## 5 · Arquivos

| arquivo | |
|---|---|
| `backend/src/modules/sentimento/domain/modeled_availability.py` | **new** — a fórmula de `SPEC-001` §5.2 arredondada para cima, a tabela de endpoints, e as **duas** recusas no construtor |
| `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` | **modified** — `build_open_interest_to_rows` carimba `MODELED`; `build_long_short_to_rows` **não** muda, e a docstring diz por quê com o número |
| `backend/tests/sentimento/test_modeled_availability.py` | **new** — falsificadores da invariância, das duas recusas e da direção do arredondamento |
| `backend/tests/sentimento/test_collector_open_interest_mapping.py` | **modified** — o caso de backfill de 7 d |
| `backend/tests/sentimento/test_collector_long_short_mapping.py` | **modified** — pina a recusa dos **dois** lados (mapper e domínio) |

---

## 6 · O que este documento NÃO fez

- ⛔ **`§7.1` não implementado** — emenda `D16`, é do owner. `F-2` prova que não foi (`§3.1`).
- ⛔ **Sem deploy**, sem escrita no Postgres, sem `gate-record`/`approve`/`advance`.
- ⛔ **`use_cases/series_catalog.py` não foi tocado** (`T-05.8` está nele).
- ⛔ **klines intocado** — `OPCOES-D16`/`O1`/`O4` continuam donos.
- ⛔ **O `ADR-038` não foi editado por mim.** O achado do `§2` **contradiz o `§3` daquele
  documento** e quem o corrige é o autor dele.

## 7 · Rótulos de força

`§1`, `§2.2`, `§3` e `§4` são `[MEDIDO 2026-09-12]`, cada um com o comando e o `n`, contra
`deploy-postgres-1` **somente leitura**. O mecanismo do `§2.1` é `[DOC:
as_of_accessor.py:112-118,326-329]` — leitura de código com linha citada, não medição. O `p99`
real de `openInterestHist` continua `[NÃO MEDIDO]` (`ADR-038` §7.3: não existe coletor ao vivo), e
a varredura do `§2.2` é o que mostra que, para `STOCK`, o valor dele não muda o resultado.
As três saídas do `§2.4` são **opções enumeradas, não escolha** — a escolha é do autor do `ADR-038`.
