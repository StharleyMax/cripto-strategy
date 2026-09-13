# Wave 05 — integração de `ADR-037` (`D1`–`D4`) + fase `04` (long/short) sobre o master novo

**Data:** 2026-09-12 · **Componente:** `sentimento` (com um ponto em `charts`, por injeção) ·
**Feature:** `cinco-metricas-do-core` · **Base:** `1528e52` (`origin/master`, com a `#218` já mergeada)
**Branches integradas:** `worktree-agent-aef77cc79a15537c7` (`012cd5e`, `ADR-037` `D1`–`D4`) e
`task/cinco-metricas-do-core-f04-long-short` (`e10f1d2`, `T-04.1`–`T-04.4` e `T-04.8`)
**Ledger:** não tocado — nenhum `gate-record`, `approve` ou `advance`. Nenhum deploy.

---

## 1 · Veredito, em uma linha

⚠️ **A integração está VERDE e o `ADR-037` FUNCIONA — e `/api/v1/series-history` sobre uma janela
de AGORA continua devolvendo `n_points = 0` para as duas séries, por uma causa que NÃO é o
`ADR-037` e que está nomeada e medida na §5: os dois coletores `/futures/data/*` não estão em
produção.** O número de hoje é `0` porque o universo varrido está vazio, não porque a correção
falhou — e um `0` sobre universo vazio é exatamente o sinal indistinguível que `ADR-012` nomeia.

---

## 2 · O que a wave tinha de provar, medido sobre a base VIVA

O comando roda o caminho de leitura REAL do merge (o `build_series_history_report` desta árvore,
com o `PostgresSeriesWindowReader` e o adaptador de `classify_grid_multiple` que
`src.main.create_app` liga) contra `deploy-postgres-1`, **só leitura, sem deploy** — a árvore
mergeada não está no container, então medir o container mediria o código antigo.

⛔ **A janela é ANCORADA no `max(bucket_end)` de cada série, e isso é deliberado:** uma janela de
"últimos 180 min" tem **zero linha** para as duas séries (§5), e `0` sobre universo vazio não
distingue *"a correção falhou"* de *"não há o que ler"*. O único termo que varia entre as duas
colunas é `bucket_interval_ms`.

⛔ **E o `knowledge_time_ms` da tabela abaixo é `now` — NÃO o `max(bucket_end)` da âncora, e sem
isso a tabela não se reproduz.** Isto está escrito porque foi RE-MEDIDO, não lido do script: o
`probe_window.py` original não ficou em disco, e a coluna que o denuncia é a de controle, que só
devolve `1` sob `kt ≥ max(available_at)`. São dois eixos independentes, e confundi-los apaga
justamente a linha de controle: a janela diz *quais buckets entram*, o `knowledge_time` diz
*o que já era sabível*.
Cada linha de `md.series` fica legível só a partir do próprio `available_at`, que é posterior ao
`bucket_end` dela, então `kt = max(bucket_end)` esconde o último bucket de cada série.

```bash
cd backend && PYTHONDONTWRITEBYTECODE=1 ../backend/.venv/bin/python <probe_window.py>
# janela de 180 min terminando no ultimo bucket_end de cada serie, BTCUSDT, bar_policy=final_only
```

| série (BTCUSDT) | `n` de linhas | `native_grid_ms = 300_000` (o merge) | `= 60_000` (o defeito) |
|---|---:|---:|---:|
| `count_long_short_ratio` · **RATIO** · `5min` | 1.000 | **4** | **0** |
| `sum_open_interest` · POINT · binance · **STOCK** · `5min` | 2.016 | **1** | **1** |
| `sum_open_interest` · OPEN/HIGH/LOW/CLOSE · coinalyze | **0** | — | — |

`[MEDIDO 2026-09-12 contra deploy-postgres-1, universo: 1.000 + 2.016 linhas de `md.series`]`

**As três coisas que essa tabela prova, e são as três que `ADR-037` pediu:**

1. **MORDE.** A série de `04` vai de `0` para `4` com `CARRY_FORWARD_BY_NATURE[Nature.RATIO]`
   **intocado em `False`** — `grep -n 'Nature.RATIO: ' backend/src/modules/sentimento/domain/as_of_accessor.py`
   → `115:    Nature.RATIO: False,`. As saídas (A)/(B)/(C) do `D2` continuam desnecessárias.
2. **CALA.** Injetar `60_000` de volta devolve **exatamente `0`**. A largura errada é veto
   absoluto, não degradação.
3. **Controle negativo — e o `1` dele tem um dono nomeado: `knowledge_time_ms ≥
   max(available_at)`.** A linha `STOCK` é **invariante** sob a largura (`1 → 1`): o
   `and not CARRY_FORWARD_BY_NATURE[...]` pula a cláusula inteira. A mudança **não** alcançou o
   caminho de carry-forward, que o `ADR-037` não autoriza tocar.

   ⚠️ **Com `kt = max(bucket_end)` este controle daria `0 → 0`, e um controle que dá zero nos
   dois lados não controla nada** — seria indistinguível de *"a série também morreu"*, que é
   exatamente a hipótese que ele existe para excluir. A razão é o atraso de publicação, e ele é
   medido: o último bucket do `STOCK` fecha em `1789219800000` e só fica sabível em
   `1789219834532` — **34,5 s depois**. Ancorar `kt` no `bucket_end` corta o único bucket que a
   janela tinha. A matriz completa, os três `kt` × as duas larguras:

   | série | `kt = max(bucket_end)` | `kt = max(available_at)` | `kt = now` |
   |---|---:|---:|---:|
   | `count_long_short_ratio` · RATIO | `4 → 0` | `4 → 0` | `4 → 0` |
   | `sum_open_interest` · STOCK | **`0 → 0`** | `1 → 1` | `1 → 1` |

   `[MEDIDO 2026-09-12 contra deploy-postgres-1, universo: 1.000 + 2.016 linhas de `md.series`]`

   A leitura do RATIO **não** depende do `kt` (`4 → 0` nos três), porque a janela de 180 min lhe
   dá muitos buckets já publicados; quem depende é o controle, que tem **um** bucket. Então o
   MORDE/CALA da tabela acima seria o mesmo com qualquer `kt` — **só a linha de controle é que
   precisava do `kt` certo para existir.**

### O falsificador de longo prazo de `ADR-037`/M4 — a célula que tinha de deixar de ser vazia

```bash
cd backend && ../backend/.venv/bin/python -c "
import sys, collections; sys.path.insert(0,'.')
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
c = collections.Counter((e.native_grid, e.key.nature.value) for e in list_pilot_series_catalog().entries)
[print(v,k) for k,v in sorted(c.items())]"
```

| entradas | `nativeGrid` | `nature` | |
|---:|---|---|---|
| 20 | `1min` | `FLOW` | era 16 |
| **4** | **`5min`** | **`RATIO`** | **era 0 de 44 — a célula que o `ADR-037`/M4 mediu VAZIA** |
| 28 | `5min` | `STOCK` | inalterado |

`[MEDIDO 2026-09-12, n=52 entradas servidas]` — a célula `(grade > 1 min, natureza não
carregável)` saiu de **0 de 44** para **4 de 52**. Se ela tivesse continuado vazia, a série não
teria chegado ao catálogo e qualquer verde seria por outro motivo.

---

## 3 · O catálogo, reconferido contra CADA árvore-pai — `LOST=[]` e `EXTRA=[]`

Catálogo que perde linha devolve `422 UnknownSeriesKeyIdError` e esvazia o painel com `rc=0`.
Então a contagem não é de confiança: cada árvore-pai foi extraída com `git archive`, o
`list_pilot_series_catalog()` dela foi rodado, e os conjuntos de `series_key_id` comparados.

```bash
git archive <sha> | tar -x -C <dir>              # por arvore: ff18811, 1528e52, 012cd5e, e10f1d2
(cd <dir>/backend && python <dump_catalog.py>)   # imprime series_key_id|instrumento|metric|...
comm -23 <pai>.txt <merge>.txt                   # LOST
comm -13 <uniao-dos-pais>.txt <merge>.txt        # EXTRA
```

| árvore | `n_entries` | delta sobre a base `ff18811` |
|---|---:|---|
| base `ff18811` | 44 | — |
| master `1528e52` | 48 | `+4` · `cvd_source`/`kline_takerbuy` (`T-02.4`), 1 por instrumento |
| `ADR-037` `012cd5e` | 44 | `+0` · o `ADR-037` não mexe no catálogo, só na largura injetada |
| fase `04` `e10f1d2` | 48 | `+4` · `count_long_short_ratio` (`T-04.4`), 1 por instrumento |
| **merge** | **52** | **= união exata dos três** |

```
LOST vs master   (1528e52) → []
LOST vs F04      (e10f1d2) → []
LOST vs ADR-037  (012cd5e) → []
EXTRA (no merge e em NENHUM pai) → []
uniao dos pais = 52 == merge = 52
```

`[MEDIDO 2026-09-12, n=52 entradas × 4 árvores-pai]`

---

## 4 · Os conflitos, e como cada um foi resolvido

**14 arquivos conflitaram, 38 blocos.** Todos por UNIÃO — as duas branches saíram do mesmo
`ff18811` e cada uma acrescentou um produtor, então descartar um lado é descartar uma série.

### 4.1 · O conflito que importava: as duas fases escreveram *"a contagem é 12"*

`use_cases/series_catalog.py` — a fase `02` (já no master) appendou `kline_takerbuy` como a 12ª
linha e a fase `04` appendou `count_long_short_ratio` como a 12ª linha. **São linhas diferentes na
mesma posição.** Resolvido mantendo as DUAS, na ordem em que as fases as adicionaram:
`klines_volume` no índice 10 (`T-01.6`), `kline_takerbuy` no 11 (`T-02.4`),
`count_long_short_ratio` no 12 (`T-04.4`). A contagem é **13 por instrumento, 52 servidas**, e
`n_entries` segue `len(entries)` — por isso nenhum literal de produção precisou mudar para o
número ficar certo. `RS-1` preservado: toda linha que já tinha índice ficou com ele.

### 4.2 · Dois conflitos SEMÂNTICOS, que o merge textual não acusa

`native_grid_ms` é campo **sem default** em `SeriesCatalogEntry` (`ADR-037/D3`), e o master trouxe
**três** construtores que o `ADR-037` nunca viu:

| construtor | origem | par declarado |
|---|---|---|
| `build_kline_takerbuy_entry` (`cvd_source_catalog.py`) | fase `02`, no master | `("1min", 60_000)` |
| `liquidation_catalog.py` | no master | `("1min", 60_000)` |
| `build_count_long_short_ratio_entry` (`long_short_catalog.py`) | fase `04` | `("5min", 300_000)` |

Os três passam a declarar o par na mesma linha do rótulo, **nunca parseado** — `ADR-003`/FR-3
reserva o tradutor de rótulo de grade ao `canonical-grid` de `charts`. Quem recusa um par
divergente é `backend/tests/sentimento/test_native_grid_ms_pairs.py`, que enumera **toda entrada
SERVIDA** contra uma tabela declarada única: um construtor novo entra no universo do teste no dia
em que é ligado ao catálogo, sem nada para lembrar de atualizar.

⛔ **`LONG_SHORT_NATIVE_GRID_MS = 300_000` é o ponto de encontro das duas branches**: é o valor que
o `ADR-037`/`D1` injeta como `bucket_interval_ms` e é o que leva a série de `04` de `0` para `4`.
Sem ele a fase `04` mergearia com `DoD-2` estruturalmente inalcançável.

### 4.3 · A thread nova entra SOB a rede de segurança, e isso não estava na branch

A fase `04` saiu de um master **anterior** ao `9761c81` (*"a rede de seguranca e ARMADA antes de
ser REPORTADA"*, a `#218`), então ela liga a thread de long/short com
`threading.Thread(target=_run_long_short_collector, ...)` **cru**. Mergear assim reabriria, **só
para essa thread**, a classe de falha de **18 h 45 min** que a `#218` fechou para as outras
quatro — thread morta de uma exceção não listada, `run()` ainda dormindo, `docker inspect`
reportando `running=true`. A thread passa a nascer sob `_supervised(...)`, como as outras quatro.

⛔ **CORREÇÃO PÓS-QA — o portão que prova o parágrafo acima estava CEGO no merge, e a cegueira
vinha da thread nova.** `tests/helpers/collectors_cli_thread_kill_driver.py` — o irmão do
`collectors_cli_driver.py` citado em §4.4, e o arquivo que a linha daquela tabela NÃO cobre —
listava **4 de 5** threads em `THREAD_NAMES` e, pior, não injetava `long_short_client_factory`.
Sem injeção, `run()` cai em `build_long_short_client = long_short_client_factory or
BinanceFuturesDataClient`: **o cliente REAL da Binance, dentro da suíte**.

O efeito não é "um teste a menos" — é o portão dos 18 h 45 min **deixando de discriminar para as
cinco threads**. Offline, o cliente real morre, a thread de long/short é supervisionada, e o
processo sai não-zero **sozinho**; a asserção `returncode != 0` então passa qualquer que seja o
estado do `_supervised` das outras. Medido com um mutante — `_supervised` removido **só** do
sítio de `collector-klines` em `collectors_cli.run()`:

| | `getaddrinfo('fapi.binance.com')` | mutante `collector-klines` sem `_supervised` |
|---|---:|---|
| merge (`6ee33cc`) | **1** | `rc=1` ⇒ o teste **PASSA** — mutante sobrevive, portão cego |
| com a correção | **0** | `rc=124` (processo VIVO aos 40 s) ⇒ o teste **REPROVA** |

`[MEDIDO 2026-09-12 em 6ee33cc; universo: 1 processo do driver, `collector-klines`, DNS de
`binance.com` contado e bloqueado por um `sitecustomize` de sonda]`

⚠️ **E o pior da cegueira é que ela era INTERMITENTE.** Com a rede REALMENTE disponível o mesmo
mutante em `6ee33cc` REPROVA (`rc=124`): a Binance responde, a thread de long/short não morre, e
o `collector-klines` sem `_supervised` volta a ser a única causa possível de saída. Ou seja, no
merge o veredito deste portão dependia de a Binance estar alcançável **na hora em que a suíte
rodou** — verde e vermelho pela rede, não pelo código. Depois da correção o driver não resolve
nome nenhum (`getaddrinfo = 0`), e as duas execuções — com e sem rede — dão o MESMO resultado.

A correção é **só-de-teste** (`+29/−2`): `LONG_SHORT` entra em `THREAD_NAMES` (o teste passa de
4 para **5** casos), `_DyingLongShortClient` é o alvo do mutante, e `_EmptyFuturesDataClient` —
o fake que §4.4 já dava por ligado — passa a ser injetado nos outros quatro casos. **Nenhuma
linha de produção mudou**, e é esse o ponto: o defeito era o portão não medir, não o código
medido estar errado. Sem a correção, a frase *"a suíte continua ZERO REDE"* em §4.4 valia para
`collectors_cli_driver.py` e **não** para o irmão dele.

### 4.4 · Os demais, um por um

| arquivo | resolução |
|---|---|
| `infra/collectors_cli.py` (26 blocos) | ⛔ **união bloco a bloco produziria código errado** — os dois lados são coletores irmãos e o texto COMUM entre os blocos pertence às duas funções. Refeito: versão do master + as adições da fase `04` aplicadas como unidades inteiras. O processo passa de **QUATRO para CINCO threads**, dito no cabeçalho |
| `use_cases/collector_run_mapping.py` (7) | `build_open_interest_run` e `build_long_short_run` coexistem; o parágrafo sobre `/futures/data/` não publicar `x-mbx-*` passa a servir às DUAS, medido uma vez |
| `use_cases/collector_series_mapping.py` (2) | união de imports, ordem alfabética |
| `use_cases/series_catalog.py` (2) | §4.1 |
| `deploy/compose.yml` (2) | CINCO threads, SEIS variáveis de cadência, as duas listas mantidas |
| `docs/INDEX.md` (2) | registro append-only: 11 linhas do master + 1 do `ADR-037` + 1 da fase `04`, **nenhuma reescrita** |
| `tests/api/test_series_catalog_route.py` | `n_entries` 48 → 52; `index % 13`; L/S no fim |
| `tests/helpers/collectors_cli_driver.py` | os DOIS fakes offline, as DUAS cadências, as DUAS fábricas — a suíte continua ZERO REDE |
| `tests/sentimento/test_as_of_is_the_single_reader.py` | `_publish_klines_page`, `_publish_open_interest_page` **e** `_collect_long_short_for_symbol` na mesma entrada, os TRÊS como contabilidade de produtor |
| `tests/sentimento/test_collector_run_mapping.py`, `test_collectors_cli_ingest_run_pairs.py` | união de imports; CINCO produtores |
| `tests/sentimento/test_series_catalog_use_case.py` (3) | o helper `_classify_panel_grid` do `ADR-037` + as contagens 13/52 |

---

## 5 · ⛔ O QUE NÃO FECHOU, nomeado em vez de silenciado

**`/api/v1/series-history` sobre uma janela de AGORA devolve `n_points = 0` para
`sum_open_interest` e para `count_long_short_ratio`. A causa NÃO é o `ADR-037`.**

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -c \
 "select src_label_raw, ((extract(epoch from now())*1000)::bigint - max(bucket_end))/60000
    as minutos_desde_o_ultimo_bucket,
    count(*) filter (where bucket_end > (extract(epoch from now())*1000)::bigint - 10800000)
    as linhas_nas_ultimas_180min
  from md.series group by 1 order by 2;"
```

| `src_label_raw` | min desde o último bucket | linhas nas últimas 180 min |
|---|---:|---:|
| `/fapi/v1/premiumIndex` | 0 | 1.056 |
| `/fapi/v1/klines` | 1 | 716 |
| `/futures/data/globalLongShortAccountRatio` | **282** | **0** |
| `/futures/data/openInterestHist` | **322** | **0** |

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -c \
 "select observer_id, count(*), max(started_at) from md.ingest_run group by 1 order by 3 desc;"
```

| `observer_id` | runs | último |
|---|---:|---|
| `premiumindex-collector` | 4.465 | 2026-09-12T18:51:56Z |
| `klines-collector` | 1.196 | 2026-09-12T18:51:19Z |
| `longshort-collector` | **1** | 2026-09-12T14:06:06Z |
| `openinterest-collector` | **1** | 2026-09-12T13:30:32Z |

`[MEDIDO 2026-09-12 contra deploy-postgres-1]`

**Um run cada, desde sempre** — o passe de boot que cada builder rodou à mão. `deploy-collector-1`
está de pé há 5 h com uma imagem que **não tem nenhuma das duas threads**: elas nascem neste merge
e este merge não foi deployado (⛔ sem deploy, por instrução). Então, numa janela de agora, o
universo varrido dessas duas séries é **vazio**, e `0` ali mede o coletor, não a leitura.

**O que fecha isto é o deploy desta branch**, que liga as cinco threads. Não é conserto de código
— não há defeito remanescente que eu tenha encontrado no caminho de leitura.

### E mais três coisas que não fecham, e não são desta wave

1. ⛔ **`sum_open_interest` de `coinalyze` (OPEN/HIGH/LOW/CLOSE) tem ZERO linha em `md.series`**,
   `[MEDIDO 2026-09-12]`. Quatro das cinco linhas de OI servidas no catálogo por instrumento nunca
   receberam dado. Só a linha `POINT`/`binance` (2.016 linhas) tem o que ler. **Isto é anterior a
   esta wave e não foi tocado aqui.**
2. ⛔ **`DoD-2`/`RN-S2` continuam aritmeticamente inalcançáveis como escritos**, e a emenda é do
   **owner** (`ADR-037`, seção "O que precisa do OWNER"): `RN-S2` pede `N ≥ 30` pontos distintos;
   para uma série de 5 min são **150 min** de janela, e a janela do `DoD-2` como exercida é de
   60 min. Pior: mesmo com 180 min, só **4** buckets são legíveis, porque o resto é backfill com
   `available_at` fora da janela de legibilidade.
3. ⛔ **`E1`/`D16` continua pendente de implementação** — é ela que leva `4` a `48` em 61 slots
   (`ADR-037`/M3). Sem ela, uma série de 5 min mostra 4 pontos numa hora: **correto, e ainda assim
   pouco**.
4. **`Nature.RATIO` precisa de um sexto membro?** O `[NÃO SEI]` de `as_of_accessor.py:101-111`
   segue intocado, com o mesmo dono, e **deixou de ser bloqueante** — que é o que a §2 prova.

---

## 6 · Portão

```
make verify
=== verify · agent-abe3290d531ec250f · 20260912T184107Z (UTC) ===
[OK       ] lint-backend    rc=0  434 source files
[OK       ] lint-frontend   rc=0  ESLint + tsc --noEmit --strict do projeto sobre frontend/src
[OK       ] test            rc=0  2274 passed · Total coverage: 96.80%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 69 aviso(s)
[OK       ] política        rc=0
veredito: VERDE — 6 portões mediram e passaram
```

⚠️ **A primeira rodada deu `INDETERMINADO`, e isso está registrado em vez de apagado:**
`lint-frontend` devolveu `rc=3` — `frontend/node_modules` ausente nesta worktree — e
`INDETERMINADO` **não é verde**. Resolvido apontando `frontend/node_modules` para o do checkout
principal (symlink, gitignored). ⛔ **Zero toque em `frontend/`**: `git diff --stat -- frontend/`
→ nenhum arquivo.

`PYTHONDONTWRITEBYTECODE=1` e purga de `__pycache__` antes de cada rodada — a disciplina que o
gate da fase `04` §5 mediu como necessária (um `.pyc` de fonte mutado reprovou 11 testes com o
código correto no disco).

**Duas falhas foram achadas e consertadas antes do verde**, e as duas eram literais de contagem
que a união do catálogo moveu: `test_get_series_catalog_serves_the_whole_pilot_universe…`
(`48 → 52`) e `test_a_non_reconstructed_entry_projects_a_null_published_error` (`11 → 12` de 13).
Nenhuma das duas era defeito de produção — eram testes medindo a contagem certa do lado errado do
merge.

**Escopo, conferido pelo diff e não pelo resumo:** `23 files changed, 2301 insertions(+),
56 deletions(-)`, tudo sob `backend/`, `deploy/` e `docs/`.

---

## 7 · Doc delta

| documento | ato | motivo |
|---|---|---|
| `docs/adr/ADR-037-…md` | **entra pelo merge**, byte-idêntico | zero edição minha |
| `docs/INDEX.md` | **+1 linha, append-only** | as 13 linhas dos três pais preservadas, nenhuma reescrita |
| este arquivo | **novo** | o relatório da wave |
| `CLAUDE.md` (raiz) | **sem mudança** | lido; nada aqui toca as 12 linhas da tabela de fronteira nem o vocabulário de componentes. Os identificadores novos (`LONG_SHORT_NATIVE_GRID_MS`, `NATIVE_GRID_MS`, `_EmptyFuturesDataClient`) nascem **em inglês**, linha 1 da tabela; nenhuma mensagem de exceção nova |
| ADR nova | **não necessária** | `ADR-037` já É a decisão e esta wave a integra. A única escolha de julgamento — pôr a thread nova sob `_supervised` — é aplicação de `9761c81`, não decisão nova |
