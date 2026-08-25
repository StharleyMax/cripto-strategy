# Fase 02 — Captura que não precisa de host 24/7

**Epic:** `CST-2` (F0, primeira metade) · **Componente alvo: `sentimento`** · **Gate: `Q1` apenas**
**Depende de:** `01` (runner)

**Por que existe separada de `03`:** **o gate de F0 é declarado POR COLETOR.** Os dois itens abaixo **não precisam de `Q2`** — o snapshot é um `GET` mais `gzip` (um `cron` num host que dorme perde no máximo o dia em que dormiu) e o one-shot da Coinalyze são **1.140 chamadas ≈ 28,5 min de relógio, uma vez**. Dizer *"sem `Q2`, F0 não começa"* **bloqueia a captura mais barata e de prazo mais curto por uma decisão de que ela não precisa**.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 2.1 | Snapshot **diário datado** de `exchangeInfo` + `fundingInfo`, com **`market`** (20 COIN-M chegam pela mesma captura), **`underlyingSubType`**, **`interestRate` por símbolo** e o conjunto de `premiumIndex` como **segunda testemunha** | `CA-F0-1`, `CA-F0-1b`, `CA-F0-7`, `CA-F0-11`, `SPEC-001` §3.4 | `sentimento` |
| 2.2 | Hash sobre **projeção canônica** dos campos armazenados + confirmação em **duas leituras** — `payload_hash` do JSON bruto **não** detecta mudança | `SPEC-001` §3.4 | `sentimento` |
| 2.3 | One-shot Coinalyze `daily`: OI (**≥ 2.400 pontos**, 1ª data **≤ 2020-01-21**) e liquidação (**≥ 700 pontos**, 1ª data ≤ 2024-08-26), **nascendo em quarentena** | `CA-F0-13`, `SPEC-001` §5.2 | `sentimento` |
| 2.4 | Broker de cota da Coinalyze **CEGO**: contagem **local**, conservadora — a resposta `200` **não traz nenhum header de cota** | `CA-F3-9`, `avaliacao:A3` | `sentimento` |
| 2.5 | Verificação de **`.CHECKSUM`** na ingestão + política de backup com **teste de restauração**, declarando **por tabela** o que é re-derivável dos dumps | `[GAP G1]` | `docs` **`[COMPONENTE-ALVO FORÇADO: candidato a `infra`]`** |
| 2.6 | `md.ingest_run` / `md.ingest_gap` **persistidos**, lidos pela **consulta nomeada** `ingest_health_query` | `CA-F0-6`, `ADR-008/D3` | `sentimento` |
| 2.7 | Registro cru como **relatório de CLI com registrador nomeado em `stdout`** — nunca `print` | `ADR-008/D1`, `ADR-008/D2` | `sentimento` |

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D2.1** | a série de snapshots existe e é diária | `data(último snapshot) == hoje` | **7 dias consecutivos** |
| **D2.2** | o snapshot detecta **deriva de universo** | join de `fundingInfo` a `exchangeInfo` por `symbol` em dois snapshots ⇒ a distribuição de `fundingIntervalHours` **difere** | **2 snapshots ≥ 3 dias apart.** Medido: `{4h:432, 8h:136, 1h:2}` em 08-22 contra `{4h:433, 8h:136, 1h:1}` em 08-25; `TRADIFI_PERPETUAL` de **170 → 175** |
| **D2.3** | as **duas testemunhas** do universo são gravadas e a divergência é **dado, não erro** | comparar `{s['symbol']}` de `exchangeInfo` com o de `premiumIndex` | **872 contra 875**, extras `EOSUSDT`, `FRONTUSDT`, **`MATICUSDT`** `[MEDIDO]` |
| **D2.4** | `market` impede colisão de string | comparar `{e['symbol']}` de `fundingInfo` contra `exchangeInfo` | **765 entradas, 20 COIN-M fora** `[MEDIDO]` |
| **D2.5** | hash não dispara falso positivo | duas chamadas de `exchangeInfo` separadas por **3 ms** ⇒ hash **igual** | **872 símbolos**; hoje **872/872 payloads brutos diferem** `[MEDIDO]` |
| **D2.6** | one-shot em disco, **em quarentena** | leitura de `backtest` sobre as duas séries devolve **ZERO linhas** | **2 séries** × ≥ 1 símbolo de teste |
| **D2.7** | custo do snapshot conferido | `ls -la data/snapshots/` | **1,16 MB/dia bruto, 54,6 KB gzip** `[MEDIDO]` |
| **D2.8** | `.CHECKSUM` reprova truncamento | **corromper um byte** e exigir rejeição | **1 arquivo**, e **1 caso de `200` com corpo truncado** (`monthly/bookTicker` 2024-04: **200 com 37,7 MB** contra 6,7 GB do mês anterior `[MEDIDO]`) |
| **D2.9** | registro sobrevive a restart | matar o processo e reler | `md.ingest_run` + `md.ingest_gap` **persistidos, não log** |

## Não faz

**Não aplica shift canônico ao gravar** (grava cru + `received_at`). Não normaliza, não plota, não decide universo, não escolhe motor, **não lê Coinalyze em caminho de decisão**.

## Falsificador da fase

Se `D2.6` devolver **qualquer** linha, o isolamento físico da quarentena não existe — e o predicado de três termos é rótulo, não regra.
