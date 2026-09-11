# Achado — 8 das 12 séries de `md.series` não existem em catálogo nenhum

**Escopo:** o que este documento pede NÃO foi decidido pelo builder. É decisão de arquitetura
(quais identidades entram no catálogo servido), e ela tem dono: `/architect` / `quant-architect`
de `SPEC-007`, não o builder de backend.

**Aberto por:** correção dos achados A1/A2 de backend (`cinco-metricas-do-core`), 2026-09-11.

---

## O que foi medido

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  -c "select distinct series_key_id, symbol, source from md.series order by 2,3;"
```

`[MEDIDO 2026-09-11, n=12 linhas]` — 12 `series_key_id` distintos, 4 símbolos
(`BTCUSDT`, `ETHUSDT`, `LINKUSDT`, `SOLUSDT`), 2 endpoints:

| endpoint | séries distintas | resolvidas pelo catálogo servido ANTES | DEPOIS |
|---|---|---|---|
| `/fapi/v1/klines` | 4 (1 por símbolo) | **1** | **4** |
| `/fapi/v1/premiumIndex` | 8 (2 por símbolo) | **0** | **0** |
| **total** | **12** | **1** | **4** |

O comando que produziu a coluna "resolvidas" (rodado contra o catálogo servido, sem rede):

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
served = {e.key.series_key_id() for e in list_pilot_series_catalog().entries}
rows = [l.split('|') for l in open('<dump do psql acima>') if l.strip()]
print(len(rows), sum(1 for r in rows if r[0] in served))"
```

A coluna DEPOIS é o efeito de A2 (o catálogo passou a cobrir os 4 instrumentos do piloto).
**As 8 séries de `/fapi/v1/premiumIndex` continuam órfãs, e A2 não as alcança** — elas não são
um problema de universo de símbolos, são um problema de universo de MÉTRICAS.

## Por que as 8 continuam órfãs

O ESCRITOR constrói três `SeriesKey` que **nenhum módulo de catálogo publica**, em funções
module-private de `backend/src/modules/sentimento/use_cases/collector_series_mapping.py`:

| função | `metric` | escrito hoje em `md.series`? |
|---|---|---|
| `_mark_price_key` | `mark_price` | **sim** — 4 séries |
| `_funding_estimado_key` | `funding_estimado` | **sim** — 4 séries |
| `_liquidation_key` | `liquidation` | não (nenhuma linha hoje) |

O catálogo servido enumera 11 identidades por instrumento — `cvd_source` (3), `klines_last`,
`price_mark_close`, `sum_open_interest` (5) e `klines_volume` — e **nenhuma delas é
`mark_price` nem `funding_estimado`**. `price_mark_close` NÃO é a mesma série: é `interval=5m`,
`Reduction.LAST`/`OHLC`, contra o `POINT_AT_BUCKET_END` que o coletor grava; o docstring de
`_mark_price_key` diz isso na primeira linha ("never `price_mark_close`").

Efeito para quem usa: `/api/v1/series-history` responde **`422 UnknownSeriesKeyIdError`** para
`series_key_id` cujas linhas estão no banco. `docs/context/cinco-metricas-do-core/gates/T-01.3-build.md:149`
já tinha registrado o fato; ele nunca virou task.

## O que precisa ser decidido (e por que o builder não decidiu)

Registrar essas linhas no catálogo é **criar identidade publicada**, não configuração. Cada
linha exige um valor que ninguém pode inventar sem evidência:

1. **`native_grid` e `max_staleness_ms`** — `premiumIndex` é lido por polling; qual é a grade
   que a ORIGEM publica, e a partir de quantos ms a linha está velha? (`SPEC-001` §3.2.)
2. **`price_use`** — `mark_price` é fonte de preço. `ADR-007` tem uma tabela de decisão que
   atribui `price_use` a `price_source`, e `PRICE_SOURCE_BY_USE` hoje aponta três dos cinco
   usos para `mark_price`. Publicar uma linha `mark_price` sem resolver isso cria duas
   respostas para a mesma pergunta.
3. **`verified_by`** — é o 15º termo de `SeriesKey` e entra no `sha256` do `series_key_id`.
   O valor tem de ser o nome do teste que respalda a linha, e ele tem de ser **o mesmo** dos
   dois lados: hoje o escritor usa o `_VERIFIED_BY` dele. Escolher outro nome no catálogo
   produz um segundo `series_key_id` e as 8 séries continuam órfãs — com os dois lados
   parecendo saudáveis em isolamento.
4. **onde a identidade mora** — os três builders são module-private no use case do coletor.
   `klines_volume` tem módulo de domínio próprio (`domain/klines_volume_catalog.py`) e é isso
   que permite escritor e leitor citarem a MESMA construção. Repetir o padrão significa mover
   `mark_price`/`funding_estimado`/`liquidation` para `domain/`, o que é refactor do escritor.

Nada disso é "a lista de símbolos do piloto" (essa era A2, e foi corrigida). É qual é o
universo de MÉTRICAS do catálogo servido — pergunta de `SPEC-007`, cujas fases `04`
(long/short) e `05` (liquidações) já mexem exatamente nessa vizinhança.

## Falsificador desta página

Quando a decisão sair e for implementada, este comando tem de devolver **12 de 12**:

```bash
cd backend && .venv/bin/python -c "
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
print(len({e.key.series_key_id() for e in list_pilot_series_catalog().entries}))"
# e a interseção com o `select distinct series_key_id from md.series` acima = 12
```

Enquanto devolver 4, a página continua aberta.
