# `T-03.1` — Inventário de `infra` que cita open interest: o que é PROBE, o que é REUSÁVEL

> **Fase `03` · componente `sentimento` · feature `cinco-metricas-do-core`**
> Task de LEITURA, zero código de produção. O achado existe para que a fase `04` não o refaça.

## O universo, com o comando que o produziu

```bash
grep -rln 'open_interest\|openInterest' backend/src/modules/sentimento/
```

`[MEDIDO 2026-09-12: n=16 arquivos]` — e **a contagem é de CITAÇÃO, não de funcionalidade**, que é
exatamente o aviso que `INVENTARIO-POR-METRICA.md` carrega. Dos 16, **4 são `infra`**; os demais são
`domain` (identidade e paginação), `use_cases` (catálogo servido) e leitores de dump.

## Os 4 arquivos de `infra`, um a um

| arquivo | linhas | veredito | o que sobrevive |
|---|---|---|---|
| `infra/binance_oi_history_client.py` | 131 | **REUSÁVEL — é o cliente de produção** | tudo |
| `infra/quota_ramp_cli.py` | 253 | **PROBE** | só o caminho literal, como alvo de sonda |
| `infra/binance_server_time_probe.py` | 151 | **PROBE** | nada (a menção é prosa em docstring) |
| `infra/metrics_csv_reader.py` | 121 | **OUTRA FONTE** | nada para esta fase |

### `binance_oi_history_client.py` — **REUSÁVEL, e foi reusado sem uma linha de mudança**

⚠️ **Era o achado que mais importava, e ele CONTRARIA o que o plano supunha.** O plano `03` diz:
*"o que existe é um `probe` de `openInterestHist`, não coletor de produção"*. **Errado.** Este arquivo
é um cliente de produção completo, escrito por `T-07.1` para backfill:

- `BinanceOiHistoryClient.open_interest_history(symbol, period, window, limit)` — uma conexão por
  página, `http.client`, fábrica de conexão injetável (o mesmo formato que a suíte offline já finge
  para `BinanceKlinesClient`);
- assinatura que torna **inexprimível** a chamada perigosa que `D7.3` mediu: ela exige um
  `ClosedWindow`, cujos dois limites são campos obrigatórios — não há caminho de código aqui que
  mande `startTime` sem `endTime`;
- traduz o corpo em `OiHistoryPageResponse`, que é XOR por construção (código de erro **ou** pontos,
  nunca ambos, nunca nenhum).

**O que faltava não era o cliente — era o COLETOR que o chama.** A fase `03` escreveu só isso:
a thread, o mapeamento para `SeriesRow` e o `IngestRun`. `T-04.3` ("reusa o cliente que a fase 03
construiu, NÃO É INTEGRAÇÃO NOVA") continua válida, com uma correção de história: o cliente é da
fase `07` de outra feature, e a `03` provou que ele serve a um coletor contínuo, não só a backfill.

**Par de `domain` que veio junto, e é onde a regra vive:** `domain/oi_history_paginator.py` (182
linhas) — `enumerate_history_pages` (enumeração A PRIORI, aritmética pura, `CA-F3-2`) e
`classify_page` (o invariante `D7.4`: ponto fora da janela pedida REJEITA a página inteira, mesmo em
`HTTP 200`). O coletor da fase `03` **honra o veredito dele em vez de re-derivar um próprio**.

### `quota_ramp_cli.py` — **PROBE**, e o que sobrevive é uma string

Linha 99: `"binance-futures-data": "/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1"`.
É a requisição mais barata que ainda cai na família certa, usada como **alvo de sonda de cota** — não
coleta nada e não grava `SeriesRow`. Sobrevive como evidência de que `/futures/data/` é uma família de
cota SEPARADA de `/fapi/v1/` (`_PROBE_PATHS` lista as duas como baldes distintos), que é justamente o
que a medição de `T-03.2` confirmou por outro caminho (nenhum header `x-mbx-*` nesta família).

### `binance_server_time_probe.py` — **PROBE**, menção é prosa

Linha 89 cita `/futures/data/openInterestHist` só para dizer que os headers `x-mbx-*` são lidos ao
vivo. Nada a reusar. ⚠️ **E a prosa está desatualizada:** `[MEDIDO 2026-09-12]` esta família **não
devolve header `x-mbx-*` nenhum** — ver `T-03.2` abaixo. Registrado em
`PENDENCIAS-PARA-AVALIAR-DEPOIS.md`, não corrigido aqui (fora do escopo da fase).

### `metrics_csv_reader.py` — **outra fonte, outro grão**

Lê `sum_open_interest`/`sum_open_interest_value` do dump `daily/metrics` (CSV), não do REST. É a
fonte de `price_mark_close` (`price_source_catalog.py`), série de `SeriesKey` diferente por
`reduction`/`interval`. **Nada desta fase toca nela.**

## `T-03.2` — o limite real e a profundidade, com comando e `n`

### Profundidade: `~30 dias`, e o corte é `HTTP 400 / code -1130`

```bash
# -25d e -30d -> HTTP 200 com 12 pontos; -35d e -60d -> HTTP 400
python3 oi_probe.py depth
```

`[MEDIDO 2026-09-12, n=4 janelas]`:

| `startTime` | resposta |
|---|---|
| `now - 25d` | `HTTP 200`, `n=12` pontos |
| `now - 30d` | `HTTP 200`, `n=12` pontos |
| `now - 35d` | `HTTP 400` `{"msg":"parameter 'startTime' is invalid.","code":-1130}` |
| `now - 60d` | `HTTP 400` `{"msg":"parameter 'startTime' is invalid.","code":-1130}` |

⛔ **`-1130` já é `END_OF_HISTORY_API_CODE` em `domain/oi_history_paginator.py:33`**, declarado por
`SPEC-001` §5.7 como FIM DE HISTÓRIA e nunca falha transitória a retentar. A medição de hoje é a
primeira que o observa **nesta feature**, e ela casa com a constante que já estava lá.

**A assimetria que isto declara, e é por isso que é item de DoD e não nota de rodapé:** klines desde
2019 (~7 anos) · `/futures/data/` ~30 dias · Coinalyze ~1,5 dia a 1min. **Um backtest sobre as cinco
métricas juntas está limitado pela MAIS RASA** (`SPEC-007` §9.2). Boa para operar a `15min..4h`
(`D5`), **insuficiente para backtest longo**. Fora desta feature por `NG-8`; registrado aqui para não
virar descoberta por acidente.

### Limite de taxa: **NÃO FOI ATINGIDO**, e o número é um PISO, não um teto

```bash
python3 oi_probe.py rate    # 60 chamadas consecutivas, sem pausa
```

`[MEDIDO 2026-09-12: n=60 chamadas em 22,5 s = 2,67 req/s -> 60x HTTP 200, ZERO 429/418,
ZERO header casando `weight`/`used`]`.

⚠️ **A afirmação honesta é "o limite está ACIMA de 2,67 req/s", não "o limite é X".** A sonda não
disparou; um teto só seria medido por uma sonda que o atinge, e atingi-lo custa um ban de IP em
produção. O que a medição decide de concreto:

1. **`weight_used` de um run de open interest é `WEIGHT_NOT_READABLE`** — o sentinela que já
   significa *"o provedor respondeu sem header legível numa chamada que este coletor não tinha outro
   jeito de precificar"*. **Não** `1 * n_calls`: isso seria peso sem comando por trás. Falsificador
   vivo: `test_the_open_interest_weight_is_the_sentinel_and_never_a_derived_number`.
2. **A cadência de produção fica 40x abaixo da taxa sondada que não disparou:** 4 símbolos / 60 s =
   `0,067 req/s` contra `2,67 req/s`.
3. **Janela grande é de graça, cadência é que paga:** uma página de 500 pontos custa a mesma chamada
   que uma de 12. Por isso o tail do ciclo periódico é largo por decisão (`_open_interest_tail_span_ms`
   = cadência + 2 buckets nativos) e a cadência é a única variável de configuração que gasta algo.

## O que esta task NÃO fez, e está nomeado

- **Não mediu o teto de taxa** (ver acima) — `[NÃO MEDIDO]`, e o motivo é o custo de atingi-lo.
- **Não corrigiu** a prosa desatualizada de `binance_server_time_probe.py:89`.
- **Não reabriu** `label_shift=300_000` na identidade de `sum_open_interest`. Ver
  `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`.
