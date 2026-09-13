# QA — PR #219 (`integracao-wave-05-adr037-f04`, `6ee33cc`)

**Data:** 2026-09-12 · **Componente:** `sentimento` · **Feature:** `cinco-metricas-do-core`
**Veredito: NEEDS_FIX** — a integração mede o que promete, e o portão que prova a rede de
segurança das threads passou a ser **incapaz de reprovar**. Só teste muda; nada de produção.
**Ledger:** não tocado além do `gate-record` deste veredito. Sem deploy.

---

## 1 · O que foi reproduzido e CONFIRMA o relatório da wave

### 1.1 · A matriz do `ADR-037` — reproduzida com o caminho de leitura real

Universo conferido ANTES de acreditar em qualquer contagem (`ADR-012`): as duas séries têm
linha, então nenhum `0` aqui é `0` de universo vazio.

```bash
cd <worktree 6ee33cc>/backend && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python probe_kt.py
# build_series_history_report REAL + PostgresSeriesWindowReader + _classify_panel_grid de src.main
# janela de 180 min ancorada em max(bucket_end), BTCUSDT, bar_policy=FINAL_ONLY
```

| série (BTCUSDT) | `n` linhas | `n` na janela | `native=300_000` | injetando `60_000` |
|---|---:|---:|---:|---:|
| `count_long_short_ratio` · RATIO · 5min | 1.000 | 71 | **4** | **0** |
| `sum_open_interest` · binance · STOCK · 5min | 2.016 | 36 | **1** | **1** |

`[MEDIDO 2026-09-12 contra deploy-postgres-1, n=1.000 + 2.016 linhas de md.series]`

⚠️ **O controle só é controle com `knowledge_time >= max(available_at)`.** Com
`knowledge_time = max(bucket_end)` a linha STOCK dá **`0 → 0`** — invariante, e **inútil como
controle**: um controle preso em zero não distingue "invariante" de "universo vazio", que é
exatamente a armadilha que o relatório da wave nomeia. Com `kt = max(available_at)` ou `kt = now`
ele dá **`1 → 1`**, não-nulo, e aí sim prova invariância. A tabela da §2 do relatório da wave está
CERTA; o que falta nela é dizer qual `knowledge_time` produz o `1`.

### 1.2 · União do catálogo — refeita por `git archive` + `series_key_id`

```bash
for sha in ff18811 1528e52 012cd5e e10f1d2 6ee33cc; do git archive $sha | tar -x -C tree_$sha
  (cd tree_$sha/backend && PYTHONDONTWRITEBYTECODE=1 python dump_catalog.py | sort > cat_$sha.txt); done
comm -23 cat_<pai>.txt cat_6ee33cc.txt   # LOST
comm -13 uniao.txt    cat_6ee33cc.txt    # EXTRA
```

`44 / 48 / 44 / 48` nos pais, **52** no merge. `LOST = []` contra os **quatro** pais,
`EXTRA = []`, e `uniao == merge` **byte a byte** (`diff` → idênticos).
`[MEDIDO 2026-09-12, n=52 series_key_id × 5 árvores]`

**As duas linhas rivais ficaram as duas** — 13 por instrumento, índice `11` =
`kline_takerbuy` (`T-02.4`) e índice `12` = `count_long_short_ratio` (`T-04.4`).
Célula `(5min, RATIO)` do `ADR-037`/M4: **4 de 52**, era `0 de 44`.

### 1.3 · `make verify` com a máquina ociosa — VERDE, não `INDETERMINADO`

```
=== verify · qa219 · 20260912T191416Z (UTC) ===
[OK] lint-backend rc=0 · [OK] lint-frontend rc=0 · [OK] test rc=0  2274 passed · 96.80%
[OK] boundaries rc=0 · [OK] regras rc=0  0 bloqueio(s) · [OK] política rc=0
veredito: VERDE — 6 portões mediram e passaram
```

`lint-frontend rc=3` era `node_modules` ausente na worktree (symlink para o checkout principal
resolve). **Zero toque em `frontend/`**: `git diff --name-only 1528e52...6ee33cc -- frontend/` → `0`.
Escopo: `36 backend · 1 deploy · 8 docs`. `docs/INDEX.md` append-only conferido contra os 4 pais
(linhas removidas: `0`, `0`, `0`, `0`).

### 1.4 · A thread nova NASCE sob `_supervised` — e isso é verdade

`collectors_cli.py:1905-1911`. Mutante (thread crua, como a branch de `04` a tinha) **morre**:

```
pytest tests/sentimento/test_collectors_cli_every_thread_death_exits.py  # com o param novo
mutante "long/short cru" -> FAILED[collector-long-short]  ·  árvore do merge -> 5 passed
```

---

## 2 · ⛔ DEFEITO — o falsificador da rede de segurança ficou CEGO, e a causa é esta PR

**Raiz única:** `run()` passou a ter CINCO threads, e
`backend/tests/helpers/collectors_cli_thread_kill_driver.py` **não foi tocado pela PR** — ele
continua com quatro nomes e **não injeta** `long_short_client_factory`.

```bash
grep -n 'THREAD_NAMES =' backend/tests/helpers/collectors_cli_thread_kill_driver.py
# 50:THREAD_NAMES = (FORCE_ORDER, PREMIUM_INDEX, KLINES, OPEN_INTEREST)   <- 4 de 5
git diff --name-only 1528e52...6ee33cc | grep -c thread_kill_driver   # 0
```

### 2.1 · `[FAIL]` A thread nova nunca é morta pelo teste que existe para matar threads

O teste chama-se `test_each_collector_thread_death_exits_the_process` e é parametrizado por
`THREAD_NAMES`. Sob o filtro do portão ele coleta **4**, não 5:

```bash
pytest tests/sentimento/test_collectors_cli_every_thread_death_exits.py -m "not process_real" --collect-only -q
# tests/sentimento/test_collectors_cli_every_thread_death_exits.py: 4
```

A supervisão que a §4.3 do relatório da wave apresenta como a decisão de julgamento da
integração é a **única** das cinco que nenhum teste exerce.

### 2.2 · `[FAIL]` ZERO REDE violada: `make test` resolve `fapi.binance.com`

Sem injeção, `build_long_short_client = long_short_client_factory or BinanceFuturesDataClient`
(`collectors_cli.py:1797`) entrega o cliente **real**, e a thread o chama de dentro da suíte:

```bash
# audit hook em sys.addaudithook acusa (e impede) getaddrinfo nao-loopback
PYTHONDONTWRITEBYTECODE=1 python netaudit.py rec.sqlite3 collector-klines
# merge 6ee33cc -> [REDE-ACUSADA] getaddrinfo('fapi.binance.com') a partir da suite offline
# master 1528e52 -> 0 acusacoes
```

Quatro subprocessos por rodada de `make test`, contra a regra "ZERO REDE" de
`backend/scripts/test.sh` que o próprio docstring do driver cita. `[MEDIDO 2026-09-12, n=2 árvores]`

### 2.3 · `[FAIL]` E o efeito grave: os 4 params passam sobre mutante, numa queda de rede ordinária

O runner de long/short trata falha listada com `exit_code[0] = 1; failure_event.set()`
(`collectors_cli.py:1627-1628`). Logo, com Binance inalcançável, a thread **não injetada** faz o
processo sair não-zero **sozinha** — e `assert process.returncode != 0` fica satisfeito por uma
thread que não é a do teste.

Experimento, mutante = `collector-klines` **sem** `_supervised`, driver ORIGINAL intocado, DNS
não-loopback falhando (`socket.gaierror`, condição corriqueira):

| árvore | saída do processo | o teste... |
|---|---|---|
| **merge `6ee33cc`** | `Exception in thread collector-klines` + **`rc=1`** | **PASSA sobre o mutante** ⛔ |
| controle master `1528e52` | `Exception in thread collector-klines` + **`rc=0`** | reprova o mutante ✅ |
| merge + correção de teste abaixo | **`rc=0`** | reprova o mutante ✅ |

`[MEDIDO 2026-09-12, n=3 árvores, mesma mutação e mesmo driver]` — o portão que a `#218` criou
para fechar a falha de **18h45** deixa de discriminar para **as cinco** threads, não só a nova.

---

## 3 · A correção (SÓ TESTE) — escrita, medida e anexada

`docs/context/cinco-metricas-do-core/gates/QA-WAVE-05-fix-thread-kill-driver.patch`
(`1 file changed, 29 insertions(+), 2 deletions(-)`, só
`backend/tests/helpers/collectors_cli_thread_kill_driver.py`): acrescenta
`LONG_SHORT` a `THREAD_NAMES`, um `_DyingLongShortClient`, e injeta
`_EmptyFuturesDataClient`/`long_short_to_rows`/`long_short_symbols` — o mesmo fake offline que
`collectors_cli_driver.py` já tem. Com ele: **5 passed**, **0 acusação de rede**, o mutante de
`klines` volta a morrer (`rc=0`), e o portão inteiro segue verde —

```
=== verify · qa219 · 20260912T193303Z (UTC) ===  (com a correcao de teste aplicada)
[OK] lint-backend rc=0 · [OK] lint-frontend rc=0 · [OK] test rc=0  2275 passed · 96.80%
[OK] boundaries rc=0 · [OK] regras rc=0 · [OK] política rc=0   veredito: VERDE
```

`2274 -> 2275`: o teste que faltava é exatamente **um**.

**Não é a única correção possível** — quem constrói decide; o que não pode ficar é o driver com
quatro nomes e o quinto cliente em default de rede.

## 4 · Fora de escopo deste veredito (o relatório da wave já os nomeia, e continuam válidos)

`n_points = 0` numa janela de agora é coletor fora de produção, não leitura (`1 run` cada, último
às 13:30/14:06); `DoD-2`/`RN-S2` aritmeticamente inalcançáveis pedem emenda do **owner**;
`E1`/`D16` pendente; `sum_open_interest` de `coinalyze` com zero linha. Nada disso é bloqueio
desta PR.
