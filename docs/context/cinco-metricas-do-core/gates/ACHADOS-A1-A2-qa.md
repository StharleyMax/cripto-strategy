# QA Gate — achados A1/A2 (`cinco-metricas-do-core`, componente `sentimento`)

**Commit:** `40a0858` · **Branch:** `worktree-agent-a4383d2eb0b1f55c9` · **Data:** 2026-09-11
**Papel:** QA · **Veredito: APPROVED**

⛔ Nenhum `gate-record`, `approve` ou `advance` executado. ⛔ `frontend/` intocado — `git diff
--name-only master..HEAD | grep -c '^frontend/'` -> **0**. ⛔ Postgres: SOMENTE LEITURA
(`select ... from md.series`, nenhum `insert`/`update`/`delete`).

## 1. Escopo, lido do diff (não do resumo)

`git diff --stat master..HEAD` -> **13 arquivos, +747/-121**: 5 de produção (`main/__init__.py`,
`domain/instrument.py` novo, `domain/open_interest_catalog.py`,
`use_cases/collector_series_mapping.py`, `use_cases/series_catalog.py`), 5 de teste, 3 de doc.
Nenhum arquivo fora de `backend/` e `docs/`.

## 2. O que eu tentei quebrar

### Q1 — `base_asset` é derivação ou tabela disfarçada? **Derivação, e recusa explícita.**

`[MEDIDO 2026-09-11, n=12 símbolos]` — `.venv/bin/python -c "from
src.modules.sentimento.domain.instrument import base_asset; ..."`:

| símbolo | resultado |
|---|---|
| `BTCUSDT` / `ETHUSDT` / `XUSDT` | `BTC` / `ETH` / `X` |
| `1000PEPEUSDT` | `1000PEPE` — **correto**, é o base asset real do par na Binance USDⓈ-M |
| `BTCUSDC`, `ETHBUSD`, `BTCUSDT_240329`, `btcusdt`, `USDT`, `""` | **`SymbolNotQuotedInUsdtError`** |

Zero silêncio: não há `except`, fallback nem `or "BTC"`. Os únicos casos que "passam sem ser
par real" são `USDTUSDT` -> `USDT` e `BTCUSDTUSDT` -> `BTCUSDT`, que não existem na venue.
**Mutação M3** (troquei a guarda por `if False` + fallback `"BTC"`): **4 failed / 66 passed** —
o silêncio é morto por teste, não por prosa.

### Q2 — a identidade `SeriesKey`/`sha256` mudou? **NÃO. Provado com os hashes dos dois lados.**

Extraí a árvore de `master` (`git archive master backend/src`) e rodei o MESMO interpretador
contra as duas versões:

```
master n=11  head n=11  ->  IDENTICO: mesma lista, mesma ORDEM
```

Primeiro id nos dois: `68fa6ff0fc1f42b9b17ad3b97c66c23a24bab8deee9c1417dd5d0b7c0403b630`.
O `klines_volume` de `BTCUSDT` continua `ef3033e6ad5a4873…4244e42`, que é **o id que a produção já
gravou** (confirmado por mim em `md.series`, não só pelo builder). A suíte prende esse hash
literalmente em `test_series_catalog_use_case.py:601-624`.

### Q3 — `open_interest_catalog.py` é carona? **Não: é o mesmo defeito, e ele MORDE.**

As duas funções de chave tomavam `instrument_id` livre e fixavam `unit="BTC"`. Era inócuo
enquanto só `BTCUSDT` era servido; com A2 vira linha **publicada** (5 das 11 entradas por
instrumento são `sum_open_interest`). **Mutação M5** (repor `unit="BTC"` lá): **4 failed / 66
passed**. Para `BTCUSDT` o valor derivado é byte-idêntico, então nenhum id se moveu (Q2).

### Q4 — as 33 entradas novas têm lastro? **A contagem do enunciado confere, com uma ressalva já declarada.**

`docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c "select
series_key_id, symbol, source, count(*) from md.series group by 1,2,3"` -> **12 séries
distintas, 4 símbolos, 2 endpoints** `[MEDIDO 2026-09-11, n=12]`. Cruzando com o catálogo:

| | resolve em `md.series` |
|---|---|
| catálogo de `master` (11 entradas) | **1 de 12** |
| catálogo de `HEAD` (44 entradas) | **4 de 12** |

Das 33 novas, **3 têm lastro hoje** (os `klines_volume` de ETH/LINK/SOL). As outras 30 são
entradas de catálogo de métricas que o coletor ainda não escreve — isso é o catálogo declarando
identidade, não inventar dado, e é o mesmo estado que `master` já tinha para `BTCUSDT` (11
entradas, 1 com linha). **As 8 séries de `/fapi/v1/premiumIndex` continuam órfãs** e A2 não as
alcança — está escrito em
`docs/context/cinco-metricas-do-core/handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md`, com
dono declarado (`/architect` de `SPEC-007`). Declarado, não silenciado ⇒ não reprova.

### Q5 — ordem preservada (`RS-1`)? **Sim, anexado.**

`PILOT_INSTRUMENT_IDS == ('BTCUSDT','ETHUSDT','LINKUSDT','SOLUSDT')`; as 44 entradas têm **44 ids
distintos**; `ids[:11] == ` a lista de `master` **inclusive na ordem**; e **nenhum** id de `master`
aparece fora do prefixo. **Mutação M4** (`tuple(sorted(INITIAL_SYMBOLS, reverse=True))`, tirando
`BTCUSDT` da cabeça): **3 failed / 67 passed**.

## 3. Mutação — confirmo o builder, com o comando

Universo: 6 arquivos de teste (`test_series_catalog_use_case.py`, `test_instrument.py`,
`test_series_catalog_route.py`, `test_klines_volume_writer_and_catalog_agree.py`,
`test_collector_klines_mapping.py`, `test_open_interest_catalog.py`),
`pytest --no-cov -p no:randomly` — **BASE: 70 passed**. Toda mutação foi revertida com
`git checkout --` no mesmo comando (`git status --porcelain backend/src backend/tests` -> 0).

| mutação | resultado |
|---|---|
| M1 `unit=base_asset(instrument_id)` -> `"BTC"` em `series_catalog.py` | **7 failed / 63 passed** — bate com o "7 failed" do builder |
| M2 `create_app` volta a `list_series_catalog()` | **3 failed / 67 passed** — bate com o "3 failed" do builder |
| M3 `base_asset` para de recusar | **4 failed / 66 passed** |
| M4 `PILOT_INSTRUMENT_IDS` reordenado | **3 failed / 67 passed** |
| M5 `open_interest_catalog` volta a `unit="BTC"` | **4 failed / 66 passed** |

**5 de 5 mutações mortas.** Verde aqui não é verde por ausência de teste.

## 4. Portões

- `bash backend/scripts/test.sh` -> **2134 passed, 0 failed, 542,95s**; cobertura **96,98%**
  contra piso declarado de **70%**; por camada `domain 99,8%` (meta 90), `use_cases 100,0%`
  (meta 80), `infra 93,5%` (meta 70) — **3 de 3 camadas medidas**.
- `bash backend/scripts/lint.sh` -> **rc=0**, 415 arquivos, `ruff` + `mypy --strict` limpos.
- `harness rules --mode sweep` -> **rc=0, 0 `[BLOQUEIO]`**; e 0 bloqueios casando com qualquer
  `.py` do diff. **8 de 8** regras bloqueantes de `harness rules list --severity block`
  avaliadas pelo sweep (os avisos de `module-docstring-single-line` e `hardcoded-url` são
  severidade AVISO e pré-existentes ao commit).
- `harness validate --strict` -> **rc=0**, política válida.
- `boundaries` (import-linter) -> **7 kept, 0 broken** — `domain/instrument.py` não quebra o
  contrato `layers`, que era a razão de ele nascer em `domain/` e não em `use_cases/`.

## 5. A ressalva do `make verify` — procede, e estava INCOMPLETA

`bash scripts/verify.sh` -> `veredito: INDETERMINADO`. Mas os portões que recusaram medir são
**três**, não um:

```
[NÃO MEDIU] lint-frontend   rc=3  frontend/node_modules ausente
[NÃO MEDIU] regras          rc=3  0 bloqueio(s), 0 aviso(s)
[NÃO MEDIU] política        rc=3
```

`regras` e `política` recusaram porque o `verify.sh` os invoca por `bash .harness/mechanism`, e
**o mecanismo não é resolvível a partir de uma worktree** (`harness: mecanismo NAO RESOLVIVEL
para .../worktrees/agent-a4383d2eb0b1f55c9`, log linha 295). O `0 bloqueio(s)` que aparece ao
lado do `rc=3` é exatamente o sinal ambíguo de `ADR-012`: indistinguível entre "nada violou" e "o
instrumento não rodou". **Resolvi a ambiguidade rodando o CLI direto** (§4): `rc=0` nos dois.

`lint-frontend` continua **anomalia**, e ela é contida, não ignorada: o diff sob `frontend/` é
**vazio** (0 arquivos), então não há mudança deste commit que o ESLint pudesse reprovar.

`2131 passed, 3 deselected` no `verify` contra `2134 passed` na minha rodada **não é divergência**:
o `verify` roda `test.sh -m "not process_real"`; eu rodei sem o filtro e os 3 `process_real`
passaram.

## 6. Efeito no consumidor (não estava no enunciado, verifiquei mesmo assim)

O envelope foi de 11 para 44 entradas. `frontend/src/app/symbol/view-model.ts:264-267` já filtra
por `key.instrumentId === symbol` ("the ONE filter every panel selector"), e
`series-catalog-query.ts:251` só exige `n_entries === entries.length` (44 == 44). Nenhum literal
`11` no frontend. O catálogo maior **é** o que aquele filtro precisava: `/symbol/ETHUSDT` deixa de
ficar sem nenhuma entrada.

## 7. Observação (não bloqueante, para o próximo ciclo)

A suíte prende hash de produção só para os **4** `klines_volume`
(`_PRODUCTION_KLINES_VOLUME_IDS`). Das 11 linhas de `BTCUSDT`, as outras **10** (3 CVD, 2 de
preço, 5 de open interest) eu verifiquei iguais a `master` **fora da suíte**, pelo `git archive`.
Um teste que prenda as 11 contra um snapshot tornaria essa checagem repetível sem worktree.

**Veredito: APPROVED.**
