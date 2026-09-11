# Gate — achados A1/A2 de backend (`cinco-metricas-do-core`, componente `sentimento`)

**Data:** 2026-09-11 · **Papel:** builder (backend) · **Componente:** `sentimento` (mais a linha
de composição em `src/main`) · **Fora de fase:** são dois achados escalados e nunca corrigidos,
não itens de `01`–`06`. Precedente de forma: `SPEC-006`/`04_correcao_composicao.md`.

⛔ **Nenhum `approve`, `advance` ou `gate-record` foi executado.** ⛔ **`frontend/` intocado** —
`git status --porcelain` não lista um único arquivo sob `frontend/`.

---

## A1 — `_BASE_ASSET_UNIT: Final[str] = "BTC"` era um literal onde o domínio exige derivação

**O defeito.** `use_cases/series_catalog.py` declarava a constante e a passava para
`build_cvd_source_catalog_entries` e `build_klines_volume_entry` **para qualquer
`instrument_id`**. Os dois construtores exigem `unit` do chamador exatamente para que ele nunca
seja fixo — e dizem isso no próprio código:

- `domain/cvd_source_catalog.py:190` — *"`unit` is REQUIRED, never defaulted to `"BTC"`: the
  summed quantity is in the instrument's OWN base asset"*;
- `domain/klines_volume_catalog.py` — *"the base asset of `ETHUSDT` is `ETH`, and a hardcoded
  `"BTC"` would silently mislabel every non-`BTC` instrument"*.

O módulo reintroduzia o literal **uma camada acima deles**. E `unit` é o 7º termo de `SeriesKey`,
cujo `sha256` dos 15 termos É o `series_key_id` (`series_key.py:226-234`) ⇒ não era rótulo
errado, era **série diferente**, sob um id que ninguém escreve.

**Irmão do mesmo defeito, encontrado ao corrigir:** `domain/open_interest_catalog.py` fixava
`unit="BTC"` nas duas funções de chave, com `instrument_id` livre. Estava invisível enquanto o
catálogo só era chamado para `BTCUSDT`; com A2 (4 instrumentos) ele passaria a **publicar** OI de
ETH rotulado `BTC`. Corrigido junto, e declarado aqui em vez de silenciado.

**A correção.** A leitura do ativo-base virou `backend/src/modules/sentimento/domain/instrument.py`
(`base_asset`, `SymbolNotQuotedInUsdtError`). Ela **já existia** — como `klines_base_asset`, em
`use_cases/collector_series_mapping.py`, ou seja no lado ESCRITOR — e `domain/` não pode importar
`use_cases` (`[tool.importlinter]`, contrato `layers`), então o catálogo de OI estruturalmente não
conseguia reusá-la. Movida para o domínio, os três chamadores (escritor, catálogo servido, catálogo
de OI) fazem **a mesma leitura**, que é o que faz os dois lados caírem no mesmo `series_key_id`.

`base_asset("BTCUSDT") == "BTC"`, então **nenhum `series_key_id` existente se moveu** — provado
contra o id que a produção já gravou (abaixo).

## A2 — o catálogo servia 1 símbolo; o coletor escreve 4

**A medição, primeiro.** `[MEDIDO 2026-09-11, contra o stack `deploy-*`, SOMENTE LEITURA]`:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  -c "select count(distinct series_key_id) from md.series;"          # -> 12
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At \
  -c "select count(distinct symbol) from md.series;"                 # -> 4
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  -c "select distinct series_key_id, symbol, source from md.series order by 2,3;"  # -> 12 linhas
```

⚠️ **O "4" do enunciado do achado é de SÍMBOLOS, não de séries.** `md.series` tem **12**
`series_key_id` distintos sobre **4** símbolos (`BTCUSDT`, `ETHUSDT`, `LINKUSDT`, `SOLUSDT`) e
**2** endpoints: `/fapi/v1/klines` (4 séries, 1 por símbolo) e `/fapi/v1/premiumIndex` (8 séries,
2 por símbolo). O catálogo servido enumerava **11** entradas, todas de `BTCUSDT`.

**Quantas dessas 12 o catálogo servido resolvia** (comando sem rede, sobre o dump acima):

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
served = {e.key.series_key_id() for e in list_pilot_series_catalog().entries}
rows = [l.split('|') for l in open('<dump>') if l.strip()]
print(len(rows), sum(1 for r in rows if r[0] in served))"
```

| | antes | depois |
|---|---|---|
| `series_key_id` distintos em `md.series` (`n=12`) | 12 | 12 |
| resolvidos pelo catálogo servido | **1** | **4** |
| entradas servidas por `GET /api/v1/series-catalog` | 11 | **44** (`11 × 4`) |

**Por que isto é configuração e não arquitetura** (o critério que o enunciado impôs): o universo
já estava declarado **duas vezes** — pelo owner (`SPEC-007` §0.1, literal: *"no piloto estamos
rodando 4 symbols, quando virar n vamos chegar a 10"* `[PREMISSA-OWNER: 2026-09-10]`) e, em
código, por `INITIAL_SYMBOLS` (`collector_series_mapping.py`), que é a lista que o COLETOR usa. O
leitor passou a **reusar a lista do escritor** em vez de declarar uma segunda que pudesse divergir:
`PILOT_INSTRUMENT_IDS = (_INSTRUMENT_ID, *sorted(INITIAL_SYMBOLS - {_INSTRUMENT_ID}))`.

**`RS-1` (ordem é FORMA) respeitado:** `BTCUSDT` continua primeiro, as 11 linhas dele mantêm os
índices que já tinham, os 33 novos são **anexados**. Asseverado por teste.

**O que NÃO foi decidido aqui, e por quê.** As **8 séries de `/fapi/v1/premiumIndex` continuam
órfãs** depois de A2 — não é universo de símbolos, é universo de **métricas**: o escritor constrói
`mark_price`, `funding_estimado` (e `liquidation`) em funções *module-private* do use case do
coletor, e **nenhum módulo de catálogo publica essas identidades**. Registrá-las exige decidir
`native_grid`, `max_staleness_ms`, `price_use` (`mark_price` é fonte de preço — `ADR-007`) e
`verified_by`, que entra no `sha256`. Isso é decisão de arquitetura, com dono, e está escrito em
[`handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md`](../handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md),
com falsificador próprio. **Não foi decidido pelo builder.**

---

## Arquivos alterados

| arquivo | |
|---|---|
| `backend/src/modules/sentimento/domain/instrument.py` | **novo** — `base_asset` + `SymbolNotQuotedInUsdtError` |
| `backend/src/modules/sentimento/domain/open_interest_catalog.py` | modificado — `unit` derivado, não `"BTC"` |
| `backend/src/modules/sentimento/use_cases/series_catalog.py` | modificado — A1 (derivação) + A2 (`PILOT_INSTRUMENT_IDS`, `list_pilot_series_catalog`) |
| `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` | modificado — `klines_base_asset` movido para `domain/` |
| `backend/src/main/__init__.py` | modificado — `create_app` liga `list_pilot_series_catalog()` |
| `backend/tests/sentimento/test_instrument.py` | **novo** — os 3 testes da leitura, movidos para a camada `domain` |
| `backend/tests/sentimento/test_series_catalog_use_case.py` | modificado — A1 e A2 |
| `backend/tests/api/test_series_catalog_route.py` | modificado — o envelope servido, no socket real |
| `backend/tests/api/test_klines_volume_writer_and_catalog_agree.py` | modificado — acordo escritor↔catálogo agora sobre os 4 símbolos |
| `backend/tests/sentimento/test_collector_klines_mapping.py` | modificado — imports, após a mudança de camada |

## Verde não prova nada até uma mutação reprovar

**Mutação A1** — repor o literal (`unit=base_asset(instrument_id)` → `unit="BTC"`), 3 sítios:

```
make test-fast K='series_catalog or instrument or writer_and_catalog'
-> 7 failed, 148 passed, 1979 deselected   [MEDIDO 2026-09-11]
```

reprovando por nome: `test_base_denominated_rows_carry_the_instruments_own_base_asset[ETHUSDT-ETH]`,
`[SOLUSDT-SOL]`, `[LINKUSDT-LINK]`, `test_the_served_catalog_resolves_every_klines_volume_id_on_disk`,
o teste de rota e os dois de acordo escritor↔catálogo. `BTCUSDT` **passa** na mutação — que é
exatamente por que a asserção é parametrizada sobre o universo do piloto e não escrita só contra
`BTCUSDT`.

**Mutação A2** — `create_app` voltar a `list_series_catalog()`:

```
make test-fast K='series_catalog or writer_and_catalog'
-> 3 failed, 63 passed, 2068 deselected     [MEDIDO 2026-09-11]
```

reprovando `test_the_id_the_collector_writes_is_the_id_the_catalog_route_publishes` (1 linha servida
contra 4 símbolos escritos — a forma exata do bug em produção), o irmão de `unit` e o teste de rota.

Código real, as duas mutações revertidas:

```
make test-fast K='series_catalog or instrument or writer_and_catalog or klines_mapping'
-> 167 passed, 1967 deselected in 9.18s     [MEDIDO 2026-09-11]
```

## Portões

```
bash backend/scripts/lint.sh
-> All checks passed! · 413 files already formatted · Success: no issues found in 413 source files

HARNESS_MECHANISM=<plugin>/bin/harness bash .harness/mechanism rules --mode sweep --changed-only
-> rc=0 · 0 [BLOQUEIO] · 3 [AVISO] core.module-docstring-single-line
   (os 3 avisos são PRÉ-EXISTENTES: os docstrings multi-linha de `src/main/__init__.py`,
    `collector_series_mapping.py` e `series_catalog.py` já eram assim antes deste diff)

HARNESS_MECHANISM=<plugin>/bin/harness make verify
-> === verify . agent-a4383d2eb0b1f55c9 . 20260911T172704Z (UTC) ===
   [OK       ] lint-backend    rc=0  415 source files
   [NAO MEDIU] lint-frontend   rc=3  frontend/node_modules ausente
   [OK       ] test            rc=0  2131 passed . Total coverage: 96.97%
   [OK       ] boundaries      rc=0  7 kept, 0 broken
   [OK       ] regras          rc=0  0 bloqueio(s), 67 aviso(s)
   [OK       ] politica        rc=0
   [----     ] diff            8 files changed, 340 insertions(+), 121 deletions(-)
   veredito: INDETERMINADO - algum portao RECUSOU medir (rc=3). Nao e o mesmo que passar.
```

⚠️ **`lint-frontend` devolve `rc=3` (NÃO MEDIU) nesta worktree** — `frontend/node_modules` ausente.
Não foi instalado de propósito: há builder ativo em `frontend/` e a instrução desta task proíbe
tocar lá. O diff sob `frontend/` é **vazio**, então o portão que não mediu não tem o que medir
deste trabalho. Isso é declarado, não escondido: `rc=3` não é verde.

⚠️ **`backend/.venv` desta worktree é um symlink para o venv do checkout principal** (ele é
gitignored via `.git/info/exclude`, não entra em commit). `make setup` precisa de rede; o symlink
mantém o interpretador declarado (`3.13.13`, `ADR-011/D5`), que é o que `boundaries.sh` exige.

**Leitura honesta do veredito:** **5 dos 6 portoes mediram e passaram**; o sexto
(`lint-frontend`) **recusou medir**, e por isso o veredito agregado e `INDETERMINADO` e nao
`VERDE`. `INDETERMINADO` nao e verde — esta escrito assim de proposito. O que ele nao mediu:
`frontend/src`, cujo diff neste trabalho e **vazio** (`git status --porcelain` nao lista nada sob
`frontend/`).

Os **67 avisos** de `regras` sao da varredura COMPLETA do repositorio, nao deste diff: sobre os
arquivos alterados (`--mode sweep --changed-only`) sao **3**, todos
`core.module-docstring-single-line`, e **todos pre-existentes** — os tres modulos ja tinham
docstring multi-linha antes deste diff. **0 bloqueio** nas duas varreduras.

Cobertura: **96,97%** total, medida por `bash backend/scripts/test.sh` com o piso POR CAMADA
(`check-coverage-layers.sh`) na mesma chamada — `rc=0` nas duas metades. Universo: **2.131**
testes coletados e passados (era 2.130 antes deste diff; o saldo e +4 testes novos de A1/A2
mais os 3 de `base_asset` que mudaram de arquivo, menos os que foram unificados por
parametrizacao no teste de acordo escritor<->catalogo).

## Doc delta

- `docs/context/cinco-metricas-do-core/handoff/ACHADO-CATALOGO-SEM-MARK-PRICE-E-FUNDING.md` —
  **criado**: a parte de A2 que é decisão de arquitetura e que o builder **não** decidiu.
- `docs/INDEX.md` — **linha acrescentada** (append-only, nenhuma linha reescrita).
- ADR — **não necessária**: nenhuma decisão nova foi tomada. A1 aplica uma regra que
  `cvd_source_catalog.py`/`klines_volume_catalog.py` já escreveram em código; A2 aplica um universo
  que `SPEC-007` §0.1 e `INITIAL_SYMBOLS` já declaravam. A decisão que **faltaria** ADR é a das 8
  séries órfãs — e ela está no handoff, aberta, com dono.
- `SPEC-007` / planos — **sem mudança**: estes dois achados não estão em nenhuma das 6 fases, e
  abrir fase é ato de tech-lead/owner, não do builder.
