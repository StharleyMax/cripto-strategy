# `ADR-037` `D1`–`D4` — relatório do builder

**Data:** 2026-09-12 · **Componente:** `sentimento` (com um ponto em `charts`, por injeção) ·
**Feature:** `cinco-metricas-do-core` · **Estado do ledger:** `BUILD_AUTHORIZED` (não toquei nele)
**ADR:** [`docs/adr/ADR-037-bucket-interval-ms-e-a-grade-nativa-da-serie-nao-o-passo-do-relatorio.md`](../../../adr/ADR-037-bucket-interval-ms-e-a-grade-nativa-da-serie-nao-o-passo-do-relatorio.md)

---

## 1 · Veredito: o ADR REPRODUZ, célula por célula. Nada nele foi contrariado

A instrução era explícita — *"se não reproduzir, o ADR está errado e você DIZ isso"*. Ele reproduz.

⚠️ **A reprodução foi feita ANTES de qualquer mudança de código**, contra a base viva
(`deploy-postgres-1`), só leitura, chamando o `as_of` REAL (não uma reimplementação), sobre **61
instantes de grade de 1 min**, com `t = grade + 59.999` — o mesmo `_read_instant` do relatório — e com
**`bucket_interval_ms` como ÚNICO termo variável entre as colunas**.

```bash
# universo das linhas: docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy \
#   -t -A -F'|' -c "select bucket_end, event_time, available_at, observed_at, value_raw
#                   from md.series where series_key_id='<id>' and symbol='BTCUSDT' order by bucket_end;"
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python <script de reprodução>
```

| série (BTCUSDT) | `n` de linhas | `= 60.000` (hoje) | `= 300.000` (nativo) | ADR/M3 |
|---|---:|---:|---:|---|
| `globalLongShortAccountRatio` · **RATIO** | 1.000 | **0 / 61** | **4 / 61** | ✅ igual |
| ↳ com `E1`/`D16` simulado (`+66.712`) | 1.000 | **0 / 61** | **48 / 61** | ✅ igual |
| `openInterestHist` · **STOCK** | 2.016 | **1 / 61** | **1 / 61** | ✅ igual |
| ↳ com `E1`/`D16` simulado (`+34.532`) | 2.016 | **61 / 61** | **61 / 61** | ✅ igual |

`[MEDIDO 2026-09-12, 8 de 8 células conferem]`

E **M1 também reproduz**, no mesmo dia, com a tabela um pouco maior (o coletor não parou):

```
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -c \
 "select src_label_raw, count(distinct series_key_id) keys, count(*) linhas,
         min(available_at-bucket_end) lag_min, max(available_at-bucket_end) lag_max
  from md.series group by 1 order by 3 desc;"
```

| `src_label_raw` | keys | linhas | lag mín | lag máx | ADR/M1 (lag mín) |
|---|---:|---:|---:|---:|---|
| `/fapi/v1/klines` | 4 | 165.712 | **12** | 604.749.985 | 12 ✅ |
| `/fapi/v1/premiumIndex` | 8 | 35.072 | **−100** | 2.123 | −100 ✅ |
| `/futures/data/openInterestHist` | 4 | 8.064 | **34.532** | 604.539.911 | 34.532 ✅ |
| `/futures/data/globalLongShortAccountRatio` | 4 | 4.000 | **66.712** | 150.067.417 | 66.712 ✅ |

⚠️ **Uma armadilha que custou duas tentativas e vale registrar:** a primeira rodada do script deu
`0/61` em TODAS as células — inclusive nas que deviam dar 1 e 61. A causa não era o defeito: `as_of`
casa observação por `series_key_id`, e o `SeriesKey` sintético do script produzia um `sha256`
diferente do que as linhas carregam, então o universo varrido era **vazio**. `0/61` sobre universo
vazio é exatamente o sinal indistinguível de `ADR-012`, e só não virou conclusão falsa porque o
**controle STOCK** — que tinha de dar 1, não 0 — denunciou. **O controle negativo pagou por si antes
mesmo de a mudança existir.**

---

## 2 · O que foi implementado

### `D1` — o defeito, em uma linha

`use_cases/series_history.py`: `bucket_interval_ms=_GRID_STEP_MS` → `bucket_interval_ms=entry.native_grid_ms`.
`_GRID_STEP_MS` continua sendo o passo do relatório e as duas grandezas deixam de compartilhar um nome.

Junto, uma correção da MESMA classe, declarada e não escondida: `lookback_ms` era
`max(_GRID_STEP_MS, staleness_ms)` e passou a `max(_GRID_STEP_MS, entry.native_grid_ms, staleness_ms)`
— a janela para trás tem de alcançar ao menos **um bucket nativo**, não um passo de relatório. É
**no-op sobre todo dado de hoje** (`max_staleness_ms ≥ grade nativa` em todas as entradas servidas),
e guarda contra a próxima entrada cuja folga seja mais apertada que a grade.

### `D3` — declarado em inteiro, nunca parseado

`SeriesCatalogEntry` ganha `native_grid_ms: int`, **sem default**, com guarda `> 0` no `__post_init__`,
na mesma postura do `native_grid is blank` que já existia. Os **7 construtores de produção** declaram
o par na mesma linha do rótulo. Nada parseia nada — `ADR-003`/FR-3 reserva o tradutor de rótulo de
grade ao `canonical-grid` de `charts`.

**O risco que essa forma cria está fechado por teste, não por confiança:**
`backend/tests/sentimento/test_native_grid_ms_pairs.py` enumera **toda entrada SERVIDA**
(`list_pilot_series_catalog` e `list_series_catalog`, não uma lista escrita à mão de construtores) e
exige que o par `(native_grid, native_grid_ms)` venha de **uma tabela declarada única**. Um construtor
novo entra no universo do teste **no dia em que é ligado ao catálogo servido**, sem nada para lembrar
de atualizar. Ele também exige que as **duas** células existam (`{60_000, 300_000}`) — um teste que só
visse linhas de `1min` passaria verde enquanto a classe inteira do defeito ficava sem medição.

### `D4` — o relatório sabe dizer `UPSAMPLING`

`classify_grid_multiple` (`ADR-026/D1`) ganha seu **primeiro chamador de produção** — `ADR-037`/M6
media **0**. O envelope de `/series-history` passa a carregar, no nível `panel`:

```json
"native_grid_ms": 300000,
"grid_multiple": {"enabled": false, "reason": "upsampling", "multiple": null}
```

⚠️ **A fronteira de contexto é real e foi respeitada, não contornada.**
`[tool.importlinter]` proíbe `src.modules.sentimento` → `src.modules.charts`. O veredito atravessa por
**porta injetada** (`GridMultipleClassifier`, no mesmo formato que `SeriesWindowReader` já usa para o
store), com o **adaptador na raiz de composição** (`src/main/__init__.py::_classify_panel_grid`) — a
única camada autorizada a ver os dois contextos. `PanelGridVerdict` é o **formato de retorno da porta**,
não um segundo classificador: **nenhum ramo** da regra de `ADR-026/D1` é reexpresso do lado de
`sentimento`.

---

## 3 · Comandos rodados, literais, com o universo

| comando | resultado | universo |
|---|---|---|
| `bash backend/scripts/lint.sh` | `All checks passed!` · `417 files already formatted` · `Success: no issues found` | 417 arquivos (`ruff check` + `ruff format --check` + `mypy --strict`) |
| `bash backend/scripts/boundaries.sh` | **7 kept, 0 broken** | 240 arquivos, 1.136 dependências |
| `harness rules --mode sweep --changed-only` | `rc=0`, **0 bloqueantes**, 5 `[AVISO]` | os 18 arquivos alterados |
| `bash backend/scripts/test.sh` | ver §4 | ver §4 |

**Os 5 `[AVISO]` são pré-existentes e não meus:** todos são
`core.module-docstring-single-line`, sobre a PRIMEIRA linha de docstrings de módulo que eu não
escrevi nem toquei. Universo da regra no repositório inteiro: **63 ocorrências**
(`harness rules --mode sweep | grep -c 'core.module-docstring-single-line'`) `[MEDIDO 2026-09-12]` —
os 5 aparecem só porque `--changed-only` lista os arquivos que encostei.

---

## 4 · O falsificador, versionado — e a mutação que reprova

`ADR-037` é explícito: *"um falsificador que mora em `/tmp` não é falsificador"*. Ele agora mora em
`backend/tests/`.

**`backend/tests/sentimento/test_series_history_native_grid.py`** — a matriz de M3 como tabela
parametrizada sobre o `as_of` real, com os **quatro números cravados** (0/4, 0/48, 1/1, 61/61). Os
fixtures não são formas inventadas: reproduzem em miniatura o padrão de publicação que M1/M2/M5
mediram (um lote ao vivo por símbolo, todo o resto backfill com `available_at` além da janela).

**`backend/tests/sentimento/test_series_history.py`** — a mesma decisão **uma camada acima**, através
de `build_series_history_report`, que é onde o defeito de fato morava:

| teste | largura injetada | pontos em 61 slots |
|---|---:|---:|
| `test_a_five_minute_non_carried_series_renders_through_the_real_use_case` | `300_000` (nativo) | **4** |
| `test_injecting_the_report_step_as_the_width_vetoes_every_slot` | `60_000` (o valor do defeito) | **0** |

**Isto é a mutação pedida, escrita como teste em vez de promessa:** `60_000` é exatamente o que
`series_history.py:179` injetava, e com ele a série é ilegível em **100%** dos slots. Trocar
`entry.native_grid_ms` de volta por `_GRID_STEP_MS` faz o primeiro reprovar. Um teste que passasse sob
as duas larguras não estaria medindo esta decisão — é a cegueira de universo que a wave `03` já pagou
duas vezes.

**E os dois números saem sobre os MESMOS dados, com
`CARRY_FORWARD_BY_NATURE[Nature.RATIO]` intocado em `False`** — pinado em
`test_ratio_carry_forward_is_still_false`, e não deixado a um `grep` que ninguém roda. Se alguém
precisar virar essa linha para um DoD passar, **o diagnóstico do ADR estava errado e as saídas
(A)/(B)/(C) voltam à mesa.**

### O controle negativo — e por que ele não é o SQL do bloqueio

⛔ O SQL do handoff (`count(*) filter (where available_at <= bucket_end)`) **não foi usado**, e o
motivo está medido: ele testa `atraso <= 0`, e o `lag` mínimo de `/fapi/v1/klines` é **12 ms**
`[MEDIDO 2026-09-12, n=165.712 linhas]` ⇒ ele reprovaria `klines_volume`, **que renderiza**. Predicado
que reprova a série que funciona não explica a que não funciona.

O controle usado é outro, e são dois:

1. **STOCK é INVARIANTE sob a largura** (1→1 e 61→61), porque `and not CARRY_FORWARD_BY_NATURE[...]`
   pula a cláusula inteira. `test_the_stock_row_is_invariant_under_the_width` é a asserção separada
   que morde se a mudança alcançar o caminho de carry-forward — que este ADR **não** autoriza tocar.
2. **`klines_volume` (`1min`/`FLOW`) tem `native_grid_ms == _GRID_STEP_MS`.** Para as **16** entradas
   dessa célula (`ADR-037`/M4) a mudança troca a **procedência** do argumento, não o valor — e a metade
   comportamental do controle é o teste que já existia,
   `test_a_flow_series_with_publication_lag_serves_a_value_at_every_grid_instant`, que continua verde.

---

## 5 · Escopo — conferido pelo diff, não pelo resumo

```
git diff --stat  →  18 arquivos, +535 −17, TODOS sob backend/
```

⛔ **Zero toque** em `frontend/`, em `infra/collectors_cli.py`, em `use_cases/series_catalog.py` e em
`use_cases/collector_series_mapping.py` — os três que a wave de integração paralela está mexendo.
**Nenhuma branch da fase `04` foi integrada e nenhum deploy foi feito.**

`harness pipeline scope cinco-metricas-do-core add` foi usado para 4 caminhos que `D4` torna
inevitáveis (`api/dependencies.py`, `api/routes/series_history.py`, o teste de rota, e o próprio
`ADR-037`): o mecanismo declarado para uma feature em `BUILD_AUTHORIZED`, **não** `override`, **não**
bypass.

---

## 6 · O que NÃO foi feito, nomeado em vez de silenciado

1. ⛔ **A emenda de `DoD-2`/`RN-S2` é do OWNER e continua pendente.** `RN-S2` pede `N ≥ 30` pontos
   distintos; para uma série de 5 min isso são **150 min** de janela, e o `DoD-2` como exercido tem
   60 min (teto de 12 barras nativas). `D1` não conserta aritmética de DoD, e corrigir o DoD de uma
   SPEC aprovada exige `approve` do owner.
2. ⛔ **`E1`/`D16` continua pendente de implementação** — é ela que leva `4/61` a `48/61`. Sem ela, uma
   série de 5 min mostra 4 pontos numa hora, o que é **correto** e ainda assim pouco.
3. **`Nature.RATIO` precisa de um sexto membro?** O `[NÃO SEI]` de `as_of_accessor.py:101-111` segue
   intocado, com o mesmo dono, e **deixou de ser bloqueante** — que é justamente o que a matriz prova.
4. **Os 4 eventos de log e as 4 chaves em português** não foram renomeados (`SPEC-002` §6.3), e nada
   aqui os toca.
5. **Não rodei `gate-record`, `approve` nem `advance`**, e não escrevi `Status: APPROVED` em lugar
   nenhum.

---

## 7 · Doc delta

| documento | ato | motivo |
|---|---|---|
| `docs/adr/ADR-037-…md` | **copiado** para este worktree | ainda não estava no `master`; conteúdo **byte-idêntico** ao original, zero edição minha |
| `docs/INDEX.md` | **+1 linha, append-only** | `git diff --stat` → `1 insertion(+)`, `0 deletions` |
| `CLAUDE.md` (raiz) | **sem mudança** | lido; nada em `D1`–`D4` toca as 12 linhas da tabela de fronteira, o vocabulário de componentes ou a disciplina de medição. Os identificadores novos (`native_grid_ms`, `PanelGridVerdict`, `GridMultipleClassifier`, `_classify_panel_grid`) nascem **em inglês**, linha 1 da tabela; a única mensagem de exceção nova (`native_grid_ms is not a positive width`) nasce **em inglês**, como a prosa de 2026-09-02 exige |
| ADR nova | **não necessária** | `ADR-037` já É a decisão; esta task a aplica. Nada aqui decide o que ela deixou aberto |
