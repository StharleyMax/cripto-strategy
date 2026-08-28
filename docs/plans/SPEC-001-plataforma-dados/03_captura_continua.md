# Fase 03 — Captura contínua

**Epic:** `CST-2` (F0, segunda metade) · **Componente alvo: `sentimento`** · **Gate: `Q1` + `Q2` + `Q19`** (+ **`Q17`** só para o coletor de spread)
**Depende de:** **`T-01.1`** (o runner), não da fase `01` inteira — `D-1` (owner, 2026-08-28 — [registro](../../context/plataforma-dados/decisoes-de-execucao-2026-08-28.md) §2). **Independe de `02`** — as duas metades correm em paralelo.

**Por que é a fase de maior custo de atraso do projeto:** é a única cujo custo é **irreversível**. `CL-1` (liquidação intraday) · `CL-2` (série efêmera) · `CL-3` (`exchangeInfo` datado) · `CL-4` (spread) · **`CL-5` (`nq`), novo nesta SPEC** · `available_at` OBSERVED · o átomo de `interestRate`.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 3.1 | Coletor `!forceOrder@arr` (mercado inteiro), gravando **cru** com `received_at` + **nome do stream e data do snapshot da doc** | `CA-F0-2`, `SPEC-001` §5.10 | `sentimento` |
| 3.2 | **Política de reconexão POR CLASSE de stream** — Classe B com sobreposição obrigatória, chave natural declarada, **taxa de colisão publicada** e **direção do viés escrita** | `ADR-004` (**gate**) | `sentimento` |
| 3.3 | Coletor `premiumIndex` (funding **estimado** — sem endpoint de histórico em fonte nenhuma) | `CA-F0-1b` | `sentimento` |
| 3.4 | **`availability_probe` contínuo**, com `availability_probe_set` **declarado** (símbolos, endpoints, período, resolução) | `CA-F0-9`, `Q19` | `sentimento` |
| 3.5 | **Agregado de bucket `q`/`nq` do stream `aggTrade`** — `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max`. **Não é captura de tick** | **`ADR-001`/6**, `SPEC-001` §1.4 (`CL-5`) | `sentimento` |
| 3.6 | **Medir se o WS `<symbol>@aggTrade` carrega `nq`** — hoje `[NÃO MEDIDO]`; medi no REST | `ADR-001` (dependência) | `sentimento` |
| 3.7 | NTP como dependência de runtime; monitor contra `/fapi/v1/time`; **skew persistido por `ingest_run`** (a tolerância se calibra em `07`) | `CA-F0-8`, `[GAP G6]` | `sentimento` |
| 3.8 | `observer_id` e `observer_region` **ao lado de todo `available_at`**; tabela de defasagem chaveada por **`(endpoint, observer_region)`** | `CA-F0-10`, `[GAP G7]` | `sentimento` |
| 3.9 | Teste **M-1** de `lag_ms` por endpoint (≈90 min de script) — e o probe o **continua em regime** | `CA-F0-3` | `sentimento` |
| 3.10 | **Rampa até o primeiro 429** com recuo — a única forma de conhecer **dois** dos três baldes | `CA-F0-4` | `sentimento` |
| 3.11 | Fila de ETL do dump **retomável**, com profundidade **declarada** (`Q18`) | `CA-F0-5` | `sentimento` |
| 3.12 | Reconciliação diária liquidação capturada × agregado Coinalyze, **com a ressalva na tela** | `CA-F0-14` | `sentimento` |
| 3.13 | **Contingente a `Q17` = (c):** coletor de spread `GET /fapi/v1/depth?limit=5` a 1/min | `CA-F0-12`, `SPEC-001` §8.1 | `sentimento` |
| 3.14 | `curl -sI` **mensal** em prefixo antigo **e** recente, para `aggTrades` **e** `bookDepth` | `SPEC-001` §5.8 | `sentimento` |

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D3.1** | fila retomável não duplica nem perde | **matar o processo no meio** e retomar | **≥ 100 arquivos**; custo declarado **0,86 s/arquivo (n=11)** `[MEDIDO]` |
| **D3.2** | `lag_ms` sai de `n=2` | tabela de defasagem com **`p99` por `(endpoint, observer_region)`** e o **`n` ao lado**, mais `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` **como colunas** | **≥ 5 endpoints**; hoje `n=2`, 1 símbolo, janela de 10 min, dispersão de **55%** |
| **D3.3** | o probe **cabe no balde** e **informa** | `5 × S × (60/período) ≤ 200 req/min`; **`período ≥ 60 s` REPROVA** | **6 símbolos a 10 s** ou **20 a 30 s**. A 60 s a resolução é mais grossa que a dispersão medida (**99,6–200,8 s**) |
| **D3.4** | a razão `OBSERVED/total` é **exibida, não estimada** | contagem por linha | **todas as linhas da janela** |
| **D3.5** | detector de buraco é **contiguidade**, nunca taxa | deletar 1 linha do fixture ⇒ **reprova**; invariante `a[i+1] == a[i]+1` | **8.873.078 linhas, 0 saltos de `agg_id`** contra **11.327 descontinuidades de `f/l` (0,862%)** `[MEDIDO]` |
| **D3.6** | **a taxa de colisão da chave natural de liquidação é PUBLICADA** | contagem por símbolo e por dia, com a **direção do viés** escrita (colisão não resolvida ⇒ **subcontagem**) | **≥ 30 dias**, **≥ 20 símbolos** |
| **D3.7** | **`nq` preservado por bucket, e a divergência publicada** | `count(q≠nq)/n` e déficit em bp por símbolo e por dia | **≥ 7 dias × conjunto declarado.** Base: DOGEUSDT **16/1000, 80,56 bp**; BTC/ETH/SOL/XRP **0/1000** `[MEDIDO]` |
| **D3.8** | **`q` e `nq` não se emendam** | leitura sob `quantity_field = nq` de janela anterior à 1ª captura ⇒ **`SEM_FONTE`**, nunca valor | **1 janela que atravesse a borda** |
| **D3.9** | `nq` no WS: **medido, não suposto** | assinar `<symbol>@aggTrade` e inspecionar o payload | **1 símbolo, 1 mensagem** |
| **D3.10** | skew persistido por `ingest_run` | ler a distribuição acumulada | **≥ 7 dias de runs** |
| **D3.11** | topologia do balde **resolvida** | rampa até o primeiro **429** com recuo | **2 baldes**: `/fapi/v1/*` e `/futures/data/*`. Hoje **2,85 vs 14,25 min/varredura, CONTESTADO e não testado** |
| **D3.12** | dois dos três baldes são **cegos**, e isso está no desenho | `curl -sD -` em `/futures/data/openInterestHist` e em `/fapi/v1/depth` | **zero headers `x-mbx-*`** no primeiro; `x-mbx-used-weight-1m` no segundo `[MEDIDO]` |
| **D3.13** | spread (se `Q17` = c) cabe com folga | `x-mbx-used-weight-1m` observado | **20 símbolos × 1/min = 40 de peso contra 2400 = 1,67%**; **295 B/chamada, peso 2** `[MEDIDO]` |

## Não faz

Não aplica shift ao gravar. Não normaliza. Não plota. **Não captura tick** — `3.5` é agregado por bucket. Não calibra `clock_skew_tolerance_ms` (é `07`).

## Falsificador da fase

Se `D3.7` mostrar `count(q ≠ nq) == 0` em **todos** os símbolos ao longo de ≥ 7 dias **e** `cvd_delta(q) == cvd_delta(nq)` em todos os buckets, `ADR-001` é custo sem retorno e `quantity_field` volta a ser coluna informativa.

Se `D3.9` mostrar que **o WS não traz `nq`**, o item `3.5` muda de desenho (passa a depender de REST, peso e janela de 48 h) — **o contrato `QF-1..QF-6` sobrevive**.
