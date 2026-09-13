# Fase `03` — open interest · relatório do builder (`sentimento`)

> Feature `cinco-metricas-do-core` · componente `sentimento` · `D17` (LARGURA: fazer OI FLUIR)
> Tasks desta entrega: `T-03.1`, `T-03.2`, `T-03.3`, `T-03.4`, e a medição de produção que
> `T-03.7` existe para produzir. `T-03.5`/`T-03.6` são `web` — **parado e passado adiante**.

## 1. ONDE O CANO ESTAVA CORTADO — e eram DOIS cortes, não um

O diagnóstico que abriu a fase (`domain/open_interest_catalog.py` existe e `md.series` tem zero
linha de OI) estava certo no sintoma e incompleto na causa.

### Corte 1 — `sentimento`: **não existia coletor nenhum** (consertado nesta fase)

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
  -c "select endpoint, count(*) from md.ingest_run group by 1"
```

`[MEDIDO 2026-09-12, ANTES]` — **três** endpoints, e `openInterestHist` não era um deles:
`/fapi/v1/premiumIndex|4333` · `/fapi/v1/klines|1067` · `/stream?…forceOrder|5`. **Zero run.**
Não era um coletor quebrado: **não havia coletor**.

O que existia, e que a fase reusou **sem uma linha de mudança** (detalhe arquivo a arquivo em
[`inventario-oi-infra.md`](inventario-oi-infra.md), `T-03.1`):

- `infra/binance_oi_history_client.py` (131 linhas) — **cliente de produção completo**, não probe.
  ⚠️ O plano `03` dizia *"o que existe é um `probe`"*. **Errado**, e é o achado que mais economizou
  trabalho: a fase escreveu só a thread, o mapeamento e o `IngestRun`.
- `domain/oi_history_paginator.py` — `enumerate_history_pages` (enumeração **a priori**, aritmética
  pura, `CA-F3-2`) e `classify_page` (invariante `D7.4`). O coletor **honra o veredito dele** em vez
  de re-derivar um próprio.

### Corte 2 — `web`: o painel pede a série ERRADA (⛔ **NÃO consertado** — é `frontend/`)

`frontend/src/app/symbol/page.tsx:190` casa só por `metric === "sum_open_interest"` e usa
`Array.find`. O catálogo servido tem **CINCO** linhas dessa métrica por símbolo (`CA-F2-17`) e as
**quatro da Coinalyze vêm primeiro** `[MEDIDO 2026-09-12: GET /api/v1/series-catalog, índices 5..9
para BTCUSDT]`. ⇒ o painel pede `coinalyze/OPEN`, que **nunca teve coletor e tem zero linha**,
enquanto a linha da Binance (índice 9) tem 8.064. Rota responde `200` com tudo `SEM_PONTO` — o
`rc=0` que significa *"nada aqui"*, nunca um `422` que alguém veria.

Conserto (um predicado) e todo o resto do que falta em
[`handoff/T-03.5-T-03.6-FRONT.md`](../handoff/T-03.5-T-03.6-FRONT.md).

## 2. Os 4 itens do DoD-VERTICAL, com comando e número

### ✅ 1 · `md.series` > 0

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At \
  -c "select count(*) from md.series where src_label_raw='/futures/data/openInterestHist'"
# 8064          [MEDIDO 2026-09-12T13:31Z]   ANTES: 0
```

Por símbolo, `7 x 288 = 2.016` pontos = exatamente os 7 dias de backfill configurados:

| símbolo | linhas | janela de `bucket_end` |
|---|---:|---|
| BTCUSDT | 2.016 | 2026-09-05 13:35Z → 2026-09-12 13:30Z |
| ETHUSDT | 2.016 | idem |
| LINKUSDT | 2.016 | idem |
| SOLUSDT | 2.016 | idem |

**Como foi gerado, e por que NÃO é seed sintético:** uma passada única do coletor real
(`_run_open_interest_collector`), contra a Binance real, publicando no **mesmo** Redis stream que o
`deploy-writer-1` de produção já drena, com o run gravado no **mesmo** store de ingest. Container
efêmero `--rm` na rede `deploy_default`, montando `backend/src` do worktree; **nenhum serviço de
produção foi reconstruído ou reiniciado por isso**.

### ✅ 2 · `/api/v1/series-history` com `n_points > 0` — **2, e o motivo de não ser 30 tem dono**

```bash
GET /api/v1/series-history?series_key_id=94c3d3dd5f45abcb…&symbol=BTCUSDT&interval=1m
    &window_start_ms=…&window_end_ms=…&knowledge_time_ms=…&bar_policy=final_only
# rows=180 · com `value` nao-nulo: 2 · SEM_PONTO: 178
# panel: {"source":"binance","nature":"STOCK","unit":"BTC"}
```

**`n_points > 0` ⇒ o item FECHA.** Mas 2 de 180, e a causa é `E1`, medida sobre estas linhas:

```sql
select count(*) filter (where available_at <= bucket_end), count(*),
       min(available_at - bucket_end), max(available_at - bucket_end)
from md.series where src_label_raw='/futures/data/openInterestHist';
-- 0 | 8064 | 34532 | 604539911
```

**Zero das 8.064 tem `available_at <= bucket_end`** — o backfill carimba `available_at = agora`,
então o lag vai de **34,5 s** (barra mais nova) a **7 dias** (mais antiga), e `as_of` só admite a
linha em instantes de grade `t >= available_at`.

⛔ **`E1` é caminho crítico de `D15`/`D16`, a rodar UMA vez sobre as 5 métricas depois da largura
(`D17`)** — seção `E` de `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`. **Não foi consertado aqui, por
decisão escrita, e o prompt desta fase proíbe explicitamente aprofundar `available_at`/`as_of`.**
O que faz `N ≥ 30` fechar sem tocar em `E1` é **tempo de coletor contínuo**: cada ciclo de 60 s
grava a barra nova com lag ~35 s, visível no instante de grade seguinte ⇒ `30 × 5 min = 150 min`.

### ⛔ 3 · Playwright `N ≥ 30` barras nativas — **BLOQUEADO, e está passado adiante**

É `frontend/`. Parado antes, conforme instruído. Bloqueado por **dois** motivos independentes,
ambos nomeados em [`handoff/T-03.5-T-03.6-FRONT.md`](../handoff/T-03.5-T-03.6-FRONT.md): o corte 2
(§1 acima, conserto de uma linha) e o `E1` (tempo de coletor, não código).

### ✅ 4 · run com `n_written > 0`

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c \
  "select run_id,verdict,n_returned,n_written,weight_used,writer_accounted_at
   from md.ingest_run where endpoint='/futures/data/openInterestHist'"
# d34bd238-…|ACCEPTED|8064|8064|-1|2026-09-12T13:30:55.673Z
```

`n_written = 8.064 > 0`, fechado pelo escritor único (`ADR-035/D2`). `weight_used = -1` é
`WEIGHT_NOT_READABLE` — ver `DoD-5`.

## 3. `DoD-5` — o limite real de `/futures/data/`: **NÃO foi atingido**, e o número é um PISO

```bash
python3 oi_probe.py rate   # 60 chamadas consecutivas, sem pausa
```

`[MEDIDO 2026-09-12: n=60 chamadas em 22,5 s = 2,67 req/s → 60× HTTP 200, ZERO 429/418, ZERO
header casando `weight`/`used`]`.

⚠️ **A afirmação honesta é "o limite está ACIMA de 2,67 req/s", não "o limite é X".** A sonda não
disparou; medir o teto exige atingi-lo, e atingi-lo custa ban de IP. O que a medição decide:

1. **`weight_used` de um run de OI é `WEIGHT_NOT_READABLE`**, nunca `k * n_calls`. Um peso derivado
   seria número sem comando atrás. Falsificador vivo:
   `test_the_open_interest_weight_is_the_sentinel_and_never_a_derived_number`.
2. **Cadência de produção fica 40× abaixo da taxa sondada que não disparou:** `4 símbolos / 60 s =
   0,067 req/s` contra `2,67 req/s`.
3. **Janela grande é de graça; cadência é que paga** — daí `_open_interest_tail_span_ms` derivar do
   `interval_s` configurado (`RS-3.5`) e ser largo por decisão.

## 4. `DoD-6` — profundidade de `/futures/data/*`: **~30 dias**, com o comando que devolve o 400

| `startTime` | resposta `[MEDIDO 2026-09-12, n=4 janelas]` |
|---|---|
| `now - 25d` | `HTTP 200`, 12 pontos |
| `now - 30d` | `HTTP 200`, 12 pontos |
| `now - 35d` | `HTTP 400` `{"msg":"parameter 'startTime' is invalid.","code":-1130}` |
| `now - 60d` | `HTTP 400`, idem |

⛔ **`-1130` já era `END_OF_HISTORY_API_CODE` em `domain/oi_history_paginator.py:33`** — a medição
de hoje casa com a constante que já estava lá, declarada por `SPEC-001` §5.7 como FIM DE HISTÓRIA
e nunca falha transitória.

**A assimetria que isto declara:** klines desde 2019 (~7 anos) · `/futures/data/` ~30 dias ·
Coinalyze ~1,5 dia a 1min. **Backtest sobre as 5 métricas juntas está limitado pela MAIS RASA**
(`SPEC-007` §9.2). Boa para operar a `15min..4h` (`D5`), **insuficiente para backtest longo**. Fora
desta feature por `NG-8`; registrado para não virar descoberta por acidente.

## 5. A decisão de contrato que a medição forçou: `bucket_end = timestamp`, sem shift

`binance_open_interest_key` declara `ts_convention = POINT_AT_BUCKET_END` e `label_shift = 300_000`.
Havia **duas leituras possíveis** do que isso vira na fita, e elas diferem em 5 minutos. A medição
decidiu:

```
[MEDIDO 2026-09-12, polling de 10 s]
  ponto rotulado timestamp=1789218300000 APARECEU em now=1789218306231
  ⇒ lag de publicação = 6.231 ms  (SEIS segundos DEPOIS do próprio rótulo)
  valor 103843.21800000 ESTÁVEL por 240 s, até o próximo ponto
```

Um agregado sobre `[T, T+300.000)` **não pode existir 6 s dentro dele** ⇒ `T` é o **instante da
leitura**, não o início de um bucket agregado, e o ponto **já nasce final**. Logo `bucket_end = T`
e `is_final = True`. Carimbar `T + 300_000` publicaria uma linha para um instante **5 minutos à
frente** do único que a fonte mediu.

⚠️ **O termo de identidade `label_shift = 300_000` NÃO foi reaberto** — reabrir RE-IDENTIFICA a
série (`series_key_id` novo ⇒ migração, não conserto). Registrado como `B11` em
`PENDENCIAS-PARA-AVALIAR-DEPOIS.md`; dono é `ADR-036`/`SPEC-001` §2.1.

## 6. Mutantes — verde não prova nada até uma mutação reprovar

| # | mutação | testes que REPROVARAM |
|---|---|---:|
| M1 | `is_settled_open_interest_point`: `<=` → `>=` (o SINAL do corte anti-lookahead) | **6** |
| M2 | `open_interest_bucket_end`: `return raw` → `return raw + OPEN_INTEREST_BUCKET_WIDTH_MS` | **7** |
| M3 | `build_open_interest_run`: `WEIGHT_NOT_READABLE` → `KLINES_WEIGHT_PER_CALL * n_calls` | **2** |

```bash
make test-fast K="open_interest"   # com cada mutante aplicado, um de cada vez
```

M1 mata o defeito que `CLAUDE.md` registra como já tendo acontecido neste projeto (regra
anti-lookahead **invertida**, propagada por dois documentos). M2 mata a leitura errada do §5. M3
mata o peso sem comando atrás.

## 7. Portão

```bash
make verify
```

**Veredito agregado: `INDETERMINADO`** — e isto **não é "passou"**. A execução medida é
`=== verify · agent-a02a90124b12e6b19 · 20260912T133551Z (UTC) ===`, log bruto em
`/tmp/verify-agent-a02a90124b12e6b19-20260912T133551Z.log` (176K), diff de
`15 files changed, 1729 insertions(+), 15 deletions(-)`.

| portão | rc | número |
|---|---:|---|
| `lint-backend` | 0 | **417** arquivos; ruff `All checks passed`, mypy `Success: no issues found in 417 source files` |
| `lint-frontend` | **3** | **NÃO MEDIU** — `frontend/node_modules` ausente neste worktree (não instalado de propósito: há builder ativo em `frontend/`), e o diff sob `frontend/` é **vazio** |
| `test` | **1** | **2156 passed, 3 deselected, 1 error** em 887,86 s · `Required test coverage of 70.0% reached. Total coverage: 97.10%` |
| `boundaries` | 0 | **7 kept, 0 broken** (o contrato `layers` continua: `use_cases` não importa `infra`) |
| `regras` | 0 | **0 bloqueio(s)**, 67 aviso(s) sobre a árvore inteira; `harness rules --mode sweep --changed-only` → **0 bloqueio**, 3 avisos, os três `core.module-docstring-single-line` **pré-existentes** nos arquivos tocados |
| `política` | 0 | — |

⚠️ **O `error` do portão `test` é AMBIENTAL, e a afirmação leva o comando que a sustenta — não é
"deve ser flake".** Não houve *failed*: houve **1 erro de SETUP**, e é de container efêmero de
Postgres, em `tests/main/test_create_app_wires_series_window_reader.py::test_postgres_backend_wires_a_real_reader_and_series_history_answers_200`:

```
psycopg.OperationalError: connection failed: connection to server at "127.0.0.1",
port 36164 failed: FATAL:  the database system is starting up
TimeoutError: postgres did not become ready within 30.0s
```

O falsificador é o **mesmo arquivo rodado sozinho**, na mesma árvore, logo depois:

```bash
cd backend && .venv/bin/python -m pytest tests/main/test_create_app_wires_series_window_reader.py \
  -p no:randomly --no-cov -q          # → rc=0, 2 passed (n=2)
```

⇒ **`rc=0` isolado, `rc=1` sob carga.** A suíte levou **887,86 s** (contra ~37,5 s de referência
em `CLAUDE.md`/R8) porque a máquina roda **outros builders em paralelo** neste momento, e o teto de
`30,0 s` para o Postgres subir não sobreviveu à contenção. ⛔ **Nenhum arquivo tocado por esta fase
está nesse teste** — `git diff --name-only` não lista `tests/main/` nem `main/`. Ainda assim o
portão **não fechou verde**, e quem reler isto deve rerodar `make verify` numa máquina ociosa antes
de tratar o `test` como OK: esta seção declara `rc=1`, não `rc=0`.

## 8. O que esta fase NÃO fez, nomeado

- **Não tocou `frontend/`** (instrução explícita). `T-03.5`/`T-03.6` no handoff.
- **Não consertou `E1`** (`available_at`/`as_of`) — proibido pelo prompt, e é `D15`/`D16`.
- **Não reabriu** `label_shift` (`B11`), **não corrigiu** a prosa obsoleta de
  `binance_server_time_probe.py:89` (`B10`), **não consertou** a conexão psycopg de vida longa da
  API (`B12`) — os três em `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`.
- **Não mediu o teto de taxa** de `/futures/data/` — `[NÃO MEDIDO]`, e o motivo é o custo de
  atingi-lo (§3).
