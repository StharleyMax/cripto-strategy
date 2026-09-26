# Fase `03` — O OI em candle: verde se entrou contrato no bucket, vermelho se saiu (`O-4`, polling pela origem)

> **Pixel:** um candle de OI por bucket, em contratos, com corpo verde quando `close > open`, vermelho quando `close < open` e neutro quando são iguais. Antes do coletor ligar, o candle vem do histórico derivado; depois, do polling de 1 min
> **Componentes:** `sentimento` · `infra` · `web`
> **Requisitos cobertos:** `RF-8` · `RF-9` · `RN-1` · `RN-2` · `RN-5` (corrigido) · `RN-6` · `RNF-4` · `CA-7` · `CA-8′`
> **Decide:** `SPEC-009` §6 · `ADR-045` (D1, D2, D2-bis, D3)
> ✅ **`[Q-OI-1]` = `O-4`**, `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]` ([`DECISOES-DO-OWNER-2026-09-23.md`](../../context/paineis-de-fluxo/handoff/DECISOES-DO-OWNER-2026-09-23.md))

> **Ramos recusados pelo owner em 2026-09-23 e retirados deste plano:** `O-1` (fase única, derivada só do
> `openInterestHist`), `O-2` (`03a` captura do OHLC da Coinalyze + `03b`, com emenda de `ADR-036/D2`) e
> `O-3` (`O-1` agora, `O-2` depois). O texto de cada um continua em `git show 0b99a1d:docs/plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md`.
> O histórico derivado de `O-1` **sobrevive só como regime anterior à captura** (`SPEC-009` §6.2); não é
> o ramo `O-1`.

## `03a` — O coletor: de `/fapi/v1/openInterest` até `md.series`

Componentes: `sentimento` · `infra`. **Não toca `SymbolClient.tsx`**, então pode andar em paralelo com
`02`/`04`, respeitando o teto de 2.

| # | item | componente | requisito |
|---|---|---|---|
| 3a.1 | Cliente de `GET /fapi/v1/openInterest` (IP Weight 1, `[DOC]`+`[MEDIDO]`, `SPEC-009` §6.1), com o `time` da resposta sendo o `event_time` | `sentimento` | `RN-1` |
| 3a.2 | Carimbo na grade de 1 min com a janela de admissão `[T, T + 20 s]` (`[Q-STAMP-1]`, validada pelo `quant-architect`). Fora da janela, o minuto fica **ausente**, nunca carregando o valor anterior | `sentimento` | `RN-2` |
| 3a.3 | Catálogo: 4 entradas `binance·open_interest·1m·POINT` (`STOCK`, `POINT_AT_BUCKET_END`, `unit=BTC`, `denom=base`), uma por símbolo. Série **com** escritor desde o primeiro dia (a lição de `PRD-009` G-1) | `sentimento` | `D-a`, `D-b` |
| 3a.4 | Cadência de 60 s como variável de ambiente no serviço `collectors` de `deploy/compose.yml`, no mesmo idioma de `OPEN_INTEREST_CYCLE_INTERVAL_S` (`:187`). O julgamento é do `infra-architect` (job agendado e pegada) | `infra` | `RNF-4`, `D-j` |
| 3a.5 | Pegada de disco **medida** depois de 24 h ligada, comparada com a estimativa de ~570 KB/dia | `infra` | `RNF-4` |

**DoD de `03a`:**
1. **Dado novo** (`DoD-1`). `select count(*) from md.series` sobre as 4 `series_key_id` novas passa de
   `0` para `> 0`, com `n_written > 0` (`DoD-4` de `SPEC-008`). Depois de 24 h, a contagem por símbolo tem
   de ficar `≥ 0,95 × 1.440`. Abaixo disso, a janela de 20 s ou a cadência estão erradas, e o número vai
   ao `quant-architect`.
2. **Cota.** Header `x-mbx-used-weight-1m` observado no coletor: a parcela dele fica `≤ 4/min`.
   **Morde:** um laço sem espera faz a parcela passar de 4.
3. **Disco.** `pg_total_relation_size` antes e depois de 24 h, com o delta declarado no gate. Se passar
   de **2×** a estimativa (1,14 MB/dia), volta ao owner (`[Q-CAD-1]`).
4. **Ausente não é carregado.** Num minuto com o coletor parado de propósito na **stack de e2e própria**
   (nunca no Postgres compartilhado, `D-g`), **não existe linha** para aquele `T`.
5. `make verify` verde.

## `03b` — A projeção e o pixel

Componentes: `sentimento` (projeção + rota) · `web` (pane). **O pixel vem depois da `04`**, porque há um
editor de `SymbolClient.tsx` por vez.

| # | item | componente | requisito |
|---|---|---|---|
| 3b.1 | Projeção `OiCandle` (`ADR-045/D1`) em `sentimento`, função pura, com chave no trio `(STOCK, POINT, POINT_AT_BUCKET_END)`; qualquer outro trio falha alto. A grade nativa `g` vem do `SeriesKey` | `sentimento` | `RN-2`, `RN-5` |
| 3b.2 | **Um candle, uma série** (`ADR-045/D2-bis`): o polling se tem ponto em `T0`, o `openInterestHist` se não tem. A rota serve `OiCandle` com `derived_from` e `samples` | `sentimento` | `RN-6` |
| 3b.3 | Mede os falsificadores 3 e 4 de `ADR-045` **antes do pixel**. Se reprovarem, **para** e volta ao `/architect`/owner com o número | `sentimento` | `ADR-045` §Falsificador |
| 3b.4 | O pane `oi` passa de `line` para `candlestick` no registry, com legenda **O·H·L·C** e `derived_from` | `web` | `RF-8`, `RF-9`, `RN-6` |
| 3b.5 | A forma do trecho anterior à captura em `1m`, a falta de pavio em `5m` e a marca de fronteira entre os regimes (`[Q-DG-3]`), decididas por `design_gate` + `quant-architect` | `web` | `Q-OI-3` |

**DoD de `03b`:**
1. **Propriedades de `ADR-045`.** Em `n ≥ 288` buckets reais de `BTCUSDT`, **em cada regime**:
   `close == last` servido hoje para a mesma série, e `open(Bₖ) == close(Bₖ₋₁)` sempre que
   `open_at_ms == T0`. **Uma divergência reprova.**
2. **Mesma grandeza** (falsificador 4). Mediana de `|poll(T) − hist(T)| / hist(T)` `≤ 10 bp`, `n ≥ 288`.
3. **Cor por contratos** (`CA-7`). Para `n ≥ 50` buckets **em cada regime**,
   `cor(oi_i) == sinal(close_i − open_i)` com os valores da rota. **A janela tem de conter ao menos 1
   bucket em que o sinal do preço e o do OI divergem**; sem isso, é inconclusivo. **Morde:** colorir pelo preço.
4. **Buraco** (`CA-8′`). Numa janela com um dos buracos de M3, no regime histórico, não aparece nenhum
   candle no intervalo nem no primeiro bucket depois dele. **Morde:** costurar a âncora com o último ponto
   antes do buraco.
5. **Um candle, uma série.** No bucket em que a captura começa, `derived_from` é **um** valor só, e
   `open_at_ms`/`close_at_ms` pertencem à mesma série. **Morde:** montar âncora do histórico com amostras do polling.
6. **Pixel.** Playwright contra o app real (`DoD-3`), com ablação (`DoD-4`): ao trocar a fonte do pane
   de volta para `line`, o candle some.
7. `make verify` verde. Veredito do `ux-ui-mastery`.
