# Fase `01` — A vela real: quatro leituras de um array que já é pago

> **Pixel:** `P1` — o painel de Preço desenha **corpo e pavio**
> **Componentes:** `sentimento` (identidade, mapeamento, backfill) · `web` (render, corte da degenerada)
> **Requisitos cobertos:** `RF-1` `RF-2` `RF-3` `RF-4` `RNF-3` `RNF-4` · `RN-1` `RN-2` `RN-7` · `[Q7]`/`G-5`
> **Decide:** `SPEC-008` `D1` (§3) · **não depende de nenhum julgamento delegado**

## Por que esta fase pode começar hoje

As duas outras fases de dado (`02`, `03`) estão bloqueadas por julgamento delegado. Esta não:
`D1` está decidida (`SPEC-008` §3), o padrão de implementação já existe em produção, e o dado já
chega. É também a única que ataca o que o owner anotou em vermelho.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 1.1 | Identidade das **4 séries** `OPEN`/`HIGH`/`LOW`/`CLOSE` (`interval="1m"`, `STOCK`, `OHLC_OVER_BUCKET`, `unit="USDT"`, `denom="quote"`) como entradas de catálogo, com **teste nomeado** em `verified_by` — a tabela normativa é `SPEC-008` §3.4 | `sentimento` | `RF-2` |
| 1.2 | O nome de `metric` passa por `FORBIDDEN_METRIC_NAMES` e pela convenção `<endpoint>_<field/reduction>` **antes** de qualquer linha ser escrita — renomear série depois é migração, não refactor | `sentimento` | `RF-2` |
| 1.3 | Os **4 acessores** que faltam em `binance_klines_client.py` (índices `[1..4]`), no mesmo padrão nomeado dos 4 que existem — **nunca literal de índice no chamador** | `sentimento` | `RF-1` |
| 1.4 | O laço de pares de `build_klines_to_rows` passa de **2 para 6** tuplas `(series_key_id, value_raw)`, com os 16 campos de proveniência escritos **uma vez** e `series_key_id()` computado **uma vez por página**, não por linha | `sentimento` | `RF-1`, `RNF-4` |
| 1.5 | `is_closed_bucket` continua cortando o bucket **em curso** — as 4 séries novas herdam o corte, e o teste que fixa o **SINAL** da comparação passa a cobri-las | `sentimento` | anti-lookahead |
| 1.6 | Backfill one-shot/cron até o teto de `D5` (90 dias), **nunca** serviço de vida longa (`ADR-027/D1`) | `sentimento` | `RNF-4`, `D5` |
| 1.7 | As 4 entradas registradas no `SeriesCatalog` **servido** por `/api/v1/series-catalog` | `sentimento` | `RF-2` |
| 1.8 | O painel de Preço lê as 4 séries e monta a vela — **ausência vira lacuna** (`WhitespaceItem`), nunca vela de altura zero nem `0` | `web` | `RF-3`, `RF-4`, `RN-1` |
| 1.9 | ⛔ **A vela degenerada SAI no mesmo commit** — `rawCandlesFromHistoryRows` (`view-model.ts:30-38`) deixa de montar `{open: close, high: close, low: close}`. Sem bandeira, sem convivência (`RN-2`, `SPEC-008` §3.5) | `web` | `RN-2` |
| 1.10 | **Veredito do `ux-ui-mastery`** sobre a vela e a lacuna — a autonomia do design é condicionada ao gate | `web` | `CLAUDE.md` §Design |
| 1.11 | e2e Playwright contra o **app real**, sem semear o Postgres compartilhado | `web` | `DoD-3`, `[P-seed]` |

## DoD verificável — comando e universo

1. **A série tem linhas.** `GET /api/v1/series-history` para cada uma das 4 chaves →
   `[.rows[] | select(.value != null)] | length` **≥ 500** por chave, `n = 4` chaves.
   **Hoje: `0`** — `data-fact="price_last_reading:absent"` com `price_slots:5760`
   `[MEDIDO 2026-09-19]`.

2. **A vela tem faixa** (`CA-2`). Sobre uma janela de **`n = 500`** buckets: **≥ 1** bucket com
   `high > low`. **Morde quando toda barra tem `high == low`** — isso é a degenerada de novo, com
   dado real por trás.
   ⛔ **E morde também se `open == close` em 500 de 500**: seria o colapso dos quatro `STOCK` num
   só, o defeito que `ADR-040/D2` nomeia.

3. **A leitura deixa de ser ausente** (`CA-3`).
   `curl -s http://127.0.0.1:3000/symbol | grep -o 'data-fact="price_last_reading:[^"]*"'` →
   **não** `:absent`. **Hoje: `:absent`** `[MEDIDO 2026-09-19]`.

4. ⛔ **Ablação de `P1`** (`CA-4`). Removido o produtor de preço, **o corpo e o pavio somem da
   tela** — captura antes/depois, assert de posição. Pixel que sobrevive à ablação estava
   desenhando outra coisa (a degenerada, ou o `close` sozinho).

5. **Zero chamada nova à Binance** (`RNF-4`). Diff de chamadas de rede da fase = **0** — o array de
   12 campos já é pago. **Morde** se aparecer uma segunda requisição a `/fapi/v1/klines`.

6. **Pegada de disco declarada** (`RNF-3`, `D-h`). `pg_total_relation_size('md.series')` **antes e
   depois** do backfill, e a contagem de linhas das 4 chaves. Previsão a bater:
   **≈ 2,07 M linhas** no teto de 90 dias com 4 símbolos
   `[INFERRED: aritmética, `SPEC-008` §3.6 — o byte/linha é `[NÃO MEDIDO]`, e esta é a medição que o fecha]`.

7. **A degenerada não existe mais.** `grep -n "high: close\|low: close" frontend/src` → **0 linhas**.
   **Morde** com qualquer ocorrência viva.

8. `make verify` verde, `__pycache__` purgado antes de acreditar (`CA-12`).

9. ⛔ **DoD NOVO, que o `quant-architect` obrigou (`SPEC-008`/`A-8`, `[M-9]`): a vela armazenada é
   comparada contra a KLINE DA PRÓPRIA BINANCE, não contra si mesma.**
   O irmão desta série no mesmo coletor, `klines_volume`, **subestima sistematicamente** a origem:
   **−2,450% / −4,474% / −2,212% / −2,227%**, pior minuto **−69,6%**, e **`pos=0` nos quatro**
   (nunca acima da verdade) `[MEDIDO 2026-09-19, n=4 buckets × 240 min = 960 comparações]`.
   Viés unilateral é **assinatura de snapshot intrabarra gravado como `final_only`**, não ruído.

   **Universo do assert, colhido da origem (auto-verificável pelo owner no gráfico da Binance):**
   BTCUSDT, bucket fechado **2026-09-18 12:00→16:00 UTC**, 240/240 minutos —
   `first(open)` = **78.031,00** · `max(high)` = **81.156,80** · `min(low)` = **77.923,50** ·
   `last(close)` = **80.688,70**.

   **Morde** se `OPEN`/`HIGH`/`LOW`/`CLOSE` armazenados divergirem da kline `4h` da Binance além da
   tolerância declarada, **e morde em particular com viés unilateral** (`pos=0` em `n` buckets) —
   isso seria a vela **herdando** `[M-9]`.
   ⚠️ Este DoD **não conserta** `[M-9]` (a causa raiz é de `/architect`/`ADR-034`); ele **impede que
   a feature o propague em silêncio para o preço**, que é a diferença entre dívida declarada e
   defeito novo.

10. **O bucket é o que TERMINA em `ceil(t/B)*B`.** `event_time` **é** `bucket_end` (confirmado
    contra a `fapi`) ⇒ `floor` ingênuo desloca a série em **uma barra nativa**. Δ medido de
    **0,114 pp** — *pequeno demais para estourar um teste de ordem de grandeza*, e por isso o
    assert é de **igualdade de bucket**, não de magnitude.
