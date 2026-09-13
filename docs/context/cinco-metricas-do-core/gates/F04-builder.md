# `F04` — long/short ratio · relatório do builder de `sentimento`

Feature `cinco-metricas-do-core`, fase `04`, componente `sentimento`.
Plano: [`docs/plans/SPEC-007-cinco-metricas-do-core/04_long_short.md`](../../../plans/SPEC-007-cinco-metricas-do-core/04_long_short.md).
Spec: [`docs/specs/SPEC-007-cinco-metricas-do-core.md`](../../../specs/SPEC-007-cinco-metricas-do-core.md).

**Veredito do builder: a LARGURA foi feita e PARA em `DoD-2`, por um `[NAO SEI]` que já tinha dono.**
O dado chega ao banco (`DoD-1`, `DoD-4` verdes, medidos em produção); a API responde `200` com
**zero valores** porque `as_of` não carrega séries `RATIO` — causa medida, não inferida, em
[`handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md`](../handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md).
`DoD-3` é `frontend/` e **não foi tocado** por instrução explícita:
[`handoff/T-04.5-HANDOFF-FRONT.md`](../handoff/T-04.5-HANDOFF-FRONT.md).

## 1. Tasks

| task | o que era | estado |
|---|---|---|
| `T-04.1` | testar contra a Binance o `[INFERRED]` do teto de `5min` **antes** de gravar a identidade | ✅ medido — ver §3 |
| `T-04.2` | identidade `count_long_short_ratio` (`RATIO`, `5m`) com teste nomeado; `RATIO` de fluxo não agregável por soma | ✅ |
| `T-04.3` | coletor reusando o cliente de `/futures/data/` | ✅ — **com um desvio declarado**, §6 |
| `T-04.4` | `count_long_short_ratio` no catálogo servido | ✅ — 11 → 12 linhas por instrumento |
| `T-04.8` | coletor em produção: medir `DoD-1` e `DoD-4` | ✅ — §4 |
| `T-04.5`/`T-04.6`/`T-04.7` | painel, design e e2e | ⛔ `frontend/` — **não tocado**, handoff escrito |
| `T-04.9` | fechamento vertical | ⛔ bloqueado por `DoD-2` e por `T-04.6`/`T-04.7` |

## 2. Arquivos

**Novos (produção):**
`backend/src/modules/sentimento/domain/long_short_catalog.py` ·
`backend/src/modules/sentimento/infra/binance_futures_data_client.py`

**Modificados (produção):**
`use_cases/collector_run_mapping.py` (4º builder de `IngestRun`) ·
`use_cases/collector_series_mapping.py` (4º produtor de `SeriesRow` + `is_settled_point`) ·
`use_cases/series_catalog.py` (12ª entrada) ·
`infra/collectors_cli.py` (4ª thread) · `deploy/compose.yml` (a variável de cadência)

**Novos (teste):** `test_long_short_catalog.py` · `test_collector_long_short_mapping.py` ·
`test_collectors_cli_long_short_collector.py` · `test_binance_futures_data_client.py`
**Modificados (teste):** `test_collector_run_mapping.py` · `test_series_catalog_use_case.py` ·
`test_series_catalog_route.py` · `test_collectors_cli_ingest_run_pairs.py` ·
`test_as_of_is_the_single_reader.py` · os dois `helpers/collectors_cli*_driver.py`

## 3. As três medições que fixam a identidade — e nenhuma foi copiada

| termo | valor | como foi medido |
|---|---|---|
| `interval` / grade nativa | `5m` / `5min` | `curl "…/globalLongShortAccountRatio?symbol=BTCUSDT&period=1m&limit=30"` devolve **`[]`** (lista vazia, `HTTP 200`); `period=5m` devolve **30 pontos**. O teto de `5min` é DA ORIGEM `[MEDIDO 2026-09-12]` — era `[INFERRED]` e `T-04.1` existia para não gravar um `[INFERRED]` dentro de um `sha256` |
| `label_shift` | **`0`** | a origem publica o ponto **9,6 s / 70,8 s DEPOIS** do instante que ele carimba (`n=2` fronteiras de bucket, poll de 10 s), **nunca os ~300 s** que um rótulo de bucket-START implicaria ⇒ o carimbo já é o FIM da janela. O open interest carrega `+interval` pelo motivo OPOSTO (o `t` da Coinalyze é bucket-START); copiar aquele número teria aplicado a medição de uma fonte a outra |
| `max_staleness_ms` | **`600_000`** = `2 x` **`300_000`** | ⚠️ medido por **INTER-CHEGADA**, não por atraso de publicação — o erro cometido no `premiumIndex` (`OPCOES-CATALOGO-PREMIUM-INDEX.md` §F2). `select` dos gaps consecutivos de `bucket_end` por símbolo em `md.series`: **`min = max = avg = 300.000 ms` exatos, `n = 499` gaps**. Atraso de publicação (9,6 s / 70,8 s) **não** entra nesta conta |

`series_key_id` de `BTCUSDT`: `279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e`.

## 4. Os 4 itens do `DoD-VERTICAL` (`D2`) — comando e número

**1. `md.series` `> 0`** ✅ — contra o Postgres de produção, dado **real**, nenhuma linha sintética:

```sql
select src_label_raw, count(distinct series_key_id), count(*) from md.series
 where src_label_raw = '/futures/data/globalLongShortAccountRatio' group by 1;
-- /futures/data/globalLongShortAccountRatio | 4 | 2100      (era 0 antes da fase)
```

**4. `n_written` do run `> 0`** ✅:

```sql
select run_id, n_returned, n_written, verdict, writer_accounted_at from md.ingest_run
 where observer_id = 'longshort-collector' order by started_at desc limit 1;
-- c37bbb59-… | 2000 | 2000 | ACCEPTED | <carimbado pelo escritor>
```

O `n_written` foi aberto em `0` pelo coletor e **fechado pelo escritor único** (`ADR-035`/`D2`) —
não é o coletor contando o próprio trabalho.

**2. `/api/v1/series-history` com `n_points > 0`** ⛔ **NÃO FECHOU, e a causa é nomeada:**

```
GET /api/v1/series-history?series_key_id=279d3172…&symbol=BTCUSDT&interval=1m
    &window_start_ms=…&window_end_ms=…&knowledge_time_ms=…&bar_policy=final_only
-> HTTP 200 · 60 linhas · 0 com valor · 60 SEM_PONTO
```

`CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` (`as_of_accessor.py:112-118`) ⇒ sem `LOCF`, e a
regra anti-lookahead `R-1` exige `available_at <= t`. As duas juntas são **mutuamente exclusivas
para esta fonte**: **0 de 2.100** linhas têm `available_at <= bucket_end`, atraso **mínimo 66 s**.
Falsificador de que a causa é o `nature` e não o resto da fase: a série de open interest
(`94c3d3dd…`, `nature=STOCK`, **mesma** grade de `5min`, **mesmo** `max_staleness_ms`, **mesma**
família de endpoint) responde **10 de 60** slots com valor, na mesma API e no mesmo instante.
Muda **um** termo e o resultado vai de 10 para 0. As três saídas, com custo e com quem decide
(`/architect`), estão no documento de bloqueio. ⏱️ **A janela barata é antes do merge.**

**3. Playwright contra o app real** ⛔ **NÃO INICIADO — é `frontend/`**, e a instrução foi parar
antes. Nada sob `frontend/` foi tocado: `git diff --stat -- frontend/` → **0 arquivos**. O que
falta está em `handoff/T-04.5-HANDOFF-FRONT.md`, inclusive o divisor de `RN-S1` (**`5`**, porque a
série é de `5m` servida numa grade de `1m`) e o aviso de que o `DoD-3` **não passa** antes de o
bloqueio acima ser decidido.

## 5. Portão e mutação

```
bash scripts/verify.sh
[OK] lint-backend · [OK] lint-frontend · [OK] test · [OK] boundaries · [OK] regras · [OK] política
```

**Mutação — 7 mutantes, 7 mortos** (`bash scripts/test-fast.sh -k <filtro>` sobre a árvore mutada):

| mutação | resultado |
|---|---|
| `is_settled_point`: `<=` vira `>=` (o **sinal** anti-lookahead) | **6 failed**, 7 passed |
| `LONG_SHORT_MAX_STALENESS_MS` `600.000` vira `300.000` (= a própria grade) | **2 failed**, 6 passed |
| `LONG_SHORT_LABEL_SHIFT_MS` `0` vira `+interval` (copiado do open interest) | **2 failed**, 61 passed |
| `LONG_SHORT_INTERVAL` `5m` vira `1m` (a grade que a origem devolve vazia) | **4 failed**, 59 passed |
| `verified_by` renomeado (re-identifica a série) | **1 failed**, 126 passed |
| passe de boot pede `3` pontos em vez do teto do endpoint | **2 failed**, 9 passed |
| `weight_used` deixa de ser `WEIGHT_NOT_READABLE` e vira `1` | **2 failed**, 88 passed |
| **controle — árvore limpa, sem mutante** | **63 passed**, 0 failed |

⚠️ **Achado de método, e ele contaminou uma rodada inteira deste gate:** restaurar o arquivo do
`.bak` deixa para trás um `__pycache__/*.pyc` compilado do fonte **MUTADO** e ainda considerado
válido — medido em 2026-09-12: `dis.dis(is_settled_point)` mostrava `COMPARE_OP >=` enquanto o
arquivo em disco lia `<=`, e um `make verify` inteiro reprovou **11 testes** por isso, com o código
correto no disco. ⇒ o roteiro de mutação passou a exportar `PYTHONDONTWRITEBYTECODE=1` e a **purgar
`__pycache__` antes e depois de cada mutante**, e a rodada acima é a que já usa essa disciplina.
Sem isso, "mutante morto" e "mutante sobrevivente" viram medidas de cache, não de teste.

## 6. O desvio declarado de `T-04.3`, e por que ele não é integração nova

A task manda **reusar o cliente de `/futures/data/` da fase `03`**. Esse cliente **não existe** na
base desta fase: `ff18811` não o tem, e ele não aparece em nenhuma das 8 worktrees irmãs
`[MEDIDO 2026-09-12]`. O que foi escrito é um cliente **genérico** de `/futures/data/*` (o endpoint
é **parâmetro**, não constante), reusando a máquina de socket já existente
(`ConnectionFactory`/`HttpConnection`/`open_https_connection` de `https_quota_probe`) exatamente
como `premium_index_http_client.py` faz (`ADR-011/D3a`) — ⇒ a fase `03` o adota sem reescrever
nada. O desvio está escrito no docstring do módulo, não só aqui.

## 7. Registro de reader único

`_collect_long_short_for_symbol` entrou em `DECLARED_TOUCHERS` de
`test_as_of_is_the_single_reader.py`, na **mesma categoria** de `_publish_klines_page`
(contabilidade de produtor): sem instante de decisão `t`, sem consultar uma segunda linha, e
devolve totais, nunca um valor. ⛔ A alternativa de avançar a marca-d'água por `row.event_time` —
o **mesmo** instante, e fora de `READ_PATH_COLUMNS` — foi recusada de propósito: manteria o arquivo
fora do registro por sinônimo, que é bypass do portão, não conformidade com ele.

## 8. O que ficou bloqueado — nomeado, não silenciado

1. **`DoD-2`** — `nature = RATIO` não carrega. Decisão do `/architect`, três saídas com custo em
   `handoff/BLOQUEIO-F04-RATIO-NAO-CARREGA.md`. **Nada foi "consertado" trocando `nature` para
   `STOCK`**: seria uma linha, faria o `DoD-2` passar hoje, contradiria a docstring do próprio
   enum e **re-identificaria a série**.
2. **`DoD-3`** — `frontend/`, fora do escopo desta invocação por instrução.
3. Defeitos de produção achados **fora** da fase (coletor calado ~18 h; sessões
   `idle in transaction` da API) foram registrados em `PENDENCIAS-PARA-AVALIAR-DEPOIS.md` §F e
   **não** foram perseguidos — `D15` trunca e reingere a base de qualquer forma.
