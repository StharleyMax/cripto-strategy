# Fatia 01 em produção — o antes e o depois

`[MEDIDO 2026-09-11T02:2xZ]` Medição feita pelo **orquestrador**, não pela `T-01.10` — ela foi
interrompida a pedido do owner logo após começar. A stack subiu o código mergeado da fatia 01
e passou a coletar; estes são os números que a `T-01.10` existiria para produzir.

⚠️ **Isto NÃO substitui a `T-01.10`.** Falta o relatório formal, o par antes/depois controlado e
o gate. Serve como evidência do estado, não como a task cumprida.

## 1. `md.series` — a primeira linha de métrica do CORE que este projeto já teve

    docker exec deploy-api-1 python -c "… select source, count(*) from md.series group by 1"

| source | linhas | antes (2026-09-10) |
|---|---:|---:|
| `/fapi/v1/klines` | **26.253** | **0** |
| `/fapi/v1/premiumIndex` | 26.216 | 23.512 |

Por símbolo, em `/fapi/v1/klines`:

| símbolo | linhas | janela |
|---|---:|---|
| BTCUSDT | 10.079 | **7,00 dias** |
| ETHUSDT | 10.079 | 7,00 dias |
| LINKUSDT | 10.079 | 7,00 dias |
| SOLUSDT | 1.197 | 0,83 dia (ainda preenchendo) |

O backfill de 7 dias de `T-01.3` entregou exatamente 7,00 dias nos três primeiros.

## 2. A rota serve o dado

    GET /api/v1/series-history?series_key_id=ef3033e6…&symbol=BTCUSDT&interval=1m
        &window_start_ms=…&window_end_ms=…&knowledge_time_ms=…&bar_policy=final_only
    → HTTP 200 · rows = 10.081 · panel.nature = FLOW · panel.unit = BTC

⚠️ Duas armadilhas de leitura que custaram tempo e valem para quem for medir depois:
- a rota devolve **`rows`**, não `points` nem `bars`. Procurar a chave errada dá `0` e parece
  ausência de dado;
- `bar_policy` aceita **`final_only`** ou **`intrabar`**. `CLOSED_ONLY` devolve **422**.

## 3. `n_written` — o furo de contabilidade fechou, e só para o caminho novo

    GET /api/v1/collector-status   ·   GET /api/v1/ingest-health

| endpoint | status | `uptimePercent` | runs na janela |
|---|---|---:|---:|
| `/fapi/v1/klines` | ATIVO | **99,95%** | 4 |
| `/fapi/v1/premiumIndex` | ATIVO | **0,0%** | 1.431 |
| `/stream?…forceOrder` | PARADO | — | 3 |

Runs de klines: **4**, sendo **3 com `n_written > 0`**, somando **40.324** linhas creditadas.

**Contraste com o baseline:** em 2026-09-10 eram `n_written = 0` em **100% dos 2.910 runs**
enquanto `md.series` tinha 23.512 linhas. O caminho novo credita; `ADR-035/D2` funciona em
produção, não só em teste.

⚠️ **`premiumIndex` continua em `0,0%` com 1.431 runs.** O conserto é **por caminho**, e só o
de klines foi ligado. `[NÃO SEI]` se ligar o do `premiumIndex` é trabalho residual da fatia 01 ou
tarefa própria — **é pergunta para o `/architect`**, junto dos outros desvios.

⚠️ `forceOrder` segue `PARADO`, como esperado: `D6` do owner o tirou do caminho crítico.

## 4. O que isto NÃO prova

**`DoD-3` (assert de dado no DOM via Playwright) NÃO foi pago.** `T-01.7` — o sub-eixo de volume
no `PricePane` — foi interrompida antes de terminar. ⇒ **`/symbol` continua sem mostrar volume.**

Dos 4 itens do DoD-VERTICAL, a fatia 01 paga hoje **1, 2 e 4**. O item **3 falta**, e ele é
justamente o que o owner impôs em `D2` para a fase não poder passar sem pixel.

⇒ **A fatia 01 NÃO está fechada.** Faltam `T-01.7`, `T-01.8`, `T-01.9`, `T-01.10`, `T-01.11`.
