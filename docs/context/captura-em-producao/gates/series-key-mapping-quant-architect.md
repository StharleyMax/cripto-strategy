# Gate `quant-architect` — o mapeamento `SeriesKey` que faltava em `collectors_cli.main()`

**Assina:** `quant-architect`. **Data:** 2026-09-08. **Fecha:** o `[NÃO SEI]` de `T-01.4` sobre
`premium_index_to_rows`/`force_order_to_rows` (`infra/redis_stream_series_sink.py`,
`domain/price_source_catalog.py`) — o gap que produzia `SeriesRowMappingNotDecidedError` em TODO
ambiente real (`[MEDIDO 2026-09-08]`: 55 restarts/10min, `gates/CA-E2E-local.md` §5,
`medicoes/CA-F3-8-pegada.md` §1.1). **Não reabre** `Q3-run-definition.md` (run-shape) nem
`F2-series-ddl.md` (schema de `md.series`) — este gate só decide QUAIS `SeriesKey`(s) os dois
coletores já em produção publicam, dentro do que aquelas duas já fixaram.

**Achado disparador, ambos citados no pedido do owner:**
`docs/context/captura-em-producao/gates/CA-E2E-local.md` §5 e
`docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md` §1.1.

---

## 1. `[PREMISSA-OWNER: 2026-09-08]` — o universo de símbolos, com o typo corrigido

Citação literal do owner: *"uma das primeiras definições fizemos nessa applicação foi definir os
simbolos q iam rodar inicialmente. (BTCUSDT, SOLUSDT, EHTUSDT, LINKUSDT)"*.

`EHTUSDT` não existe. `[MEDIDO 2026-09-08]`:

```bash
curl -s https://fapi.binance.com/fapi/v1/exchangeInfo | python3 -c "
import sys, json
data = json.load(sys.stdin)
symbols = {s['symbol'] for s in data.get('symbols', [])}
for s in ['BTCUSDT','ETHUSDT','SOLUSDT','LINKUSDT','EHTUSDT']:
    print(s, s in symbols)"
```
```
BTCUSDT True
ETHUSDT True
SOLUSDT True
LINKUSDT True
EHTUSDT False
```

**Decisão: o universo é `{BTCUSDT, ETHUSDT, SOLUSDT, LINKUSDT}`** — troca de uma letra
(`EHT` → `ETH`), não uma reinterpretação da intenção do owner. `INITIAL_SYMBOLS` em
`backend/src/modules/sentimento/use_cases/collector_series_mapping.py` é a fonte única desse
conjunto; nenhum outro literal o repete.

---

## 2. Por que a decisão encolheu: `SeriesRow` não carrega valor numérico

`domain/provenance.py`'s `SeriesRow` tem 15 colunas e NENHUMA é um valor — confirmado contra o
DDL que este próprio `quant-architect` assinou em `F2-series-ddl.md` §2
(`infra/postgres_series_sink.py`'s `SCHEMA_SQL`, transcrito de lá): `md.series` guarda
identidade (`series_key_id`), proveniência e tempo, nunca um preço ou uma taxa. Logo esta decisão
é sobre QUAIS `SeriesKey`(s) existem e QUANDO foram observadas — nunca sobre "qual número
publicar". Os bytes crus continuam exatamente onde já estavam
(`force_order_raw_recorder.py`, `infra/premium_index_jsonl_sink.py`), intocados.

---

## 3. As três séries cobertas, cada uma com precedente citado — nem quatro, nem zero

| produtor | `metric` | precedente |
|---|---|---|
| `premiumIndex` | `mark_price` | novo; distinto de `price_mark_close` (`price_source_catalog.py`) por `interval`/`reduction` — aquele é reconstrução de 5 min a partir do dump `metrics`, este é a leitura viva do poll |
| `premiumIndex` | `FundingSource.ESTIMATED.value` = `"funding_estimado"` | **reuso**, não string nova — `domain/funding_settlement.py` já nomeava `premiumIndex.lastFundingRate` como o produtor futuro desta série exata ("this module's shape does not foreclose it") |
| `!forceOrder@arr` | `liquidation` | novo, `Nature.EVENT`; carrega só "houve uma liquidação deste símbolo neste instante" — `SeriesRow` não tem onde guardar `price`/`orig_qty`, então esta série não inventa um valor para eles |

**Deliberadamente FORA do catálogo, `[NÃO SEI]` nomeado, não escondido:** `estimatedSettlePrice` e
`interestRate` (campos que `premiumIndex` publica mas nenhum consumidor lê hoje) — mesma razão
que `price_source_catalog.py` já usa para `index_price`: "cataloguing a series nobody reads yet
would be a row with no evidence behind it".

---

## 4. O que este gate NÃO fecha — nomeado, não escondido

`domain/provenance.reject_clock_skew`/`build_series_row` nunca são chamados sobre as linhas que
este módulo constrói — `[MEDIDO 2026-09-08]`: `grep -rn 'reject_clock_skew\|build_series_row'
backend/src` não tem ocorrência fora de `provenance.py` (nenhum OUTRO produtor deste pacote os
chama hoje também). `event_time`/`bucket_end` usam o relógio da FONTE
(`reading.source_time`/`observation.key.trade_time`); `available_at`/`ingested_at`/`observed_at`
usam o relógio DESTE coletor (`received_at`) — os dois nunca são colapsados em um só, mas a
verificação de skew entre eles fica para o dia em que um chamador a instalar.

---

## 5. Como o owner confere isto sem confiar em mim

1. **Fixture de mercado real, não fabricada** — `backend/tests/sentimento/
   test_collector_series_mapping.py` cita, no próprio docstring, os dois `curl` reais
   (`premiumIndex?symbol=BTCUSDT`, `?symbol=LINKUSDT`) e o `exchangeInfo` que decidiu o typo,
   com resultado colado.
2. **Composição real, não `to_rows` fabricado** — `backend/tests/sentimento/
   test_collectors_cli_real_series_mapping.py` chama `_run_premium_index_collector`/
   `_run_force_order_collector` com `build_premium_index_to_rows`/`build_force_order_to_rows`
   DE VERDADE (nunca o duplo fabricado que todo outro teste deste pacote usa), publica contra um
   `fakeredis` real e lê de volta via `XREADGROUP`.
3. **`main()` realmente injeta a decisão** —
   `backend/tests/sentimento/test_collectors_cli_boot.py::test_main_wires_the_real_series_mapping`
   monkeypatcha `run()` para CAPTURAR os `kwargs` e depois CHAMA os dois callables recebidos —
   não checa "não é `None`" (que `_mapping_not_decided_yet` também satisfaria), checa que eles
   produzem linhas reais para um símbolo do universo e nenhuma para um símbolo fora dele.
4. **E2E real via `docker compose`** — comando e resultado no corpo do commit e no `docs/INDEX.md`
   (linha desta task): `docker logs t0series-collector-1 | grep -c SeriesRowMappingNotDecidedError`
   → **0** ao longo de `RestartCount=11`; `select symbol, count(*) from md.series group by 1` →
   exatamente os 4 símbolos do universo, crescendo em lockstep, nenhum outro símbolo — a
   composição real publica, de verdade, exatamente o que este gate decidiu.

---

## 6. Achado separado, medido durante o E2E, NÃO desta task — escalado, não corrigido

`RestartCount` do `collector` **continuou subindo** durante o E2E (11 em ~2 min) — mas por uma
causa **diferente e pré-existente**, nunca por `SeriesRowMappingNotDecidedError` (§5.4 confirma
zero ocorrências). `[MEDIDO 2026-09-08]`, `docker logs t0series-collector-1`:

```
collector_session_closed !forceOrder@arr: FRAME: timeout: The read operation timed out
...
src.modules.sentimento.use_cases.probe_stream_quantity_fields.StreamTransportError: FRAME:
timeout: The read operation timed out
```

**Causa, arquivo:linha exato** — `backend/src/modules/sentimento/infra/binance_stream_probe.py:66`:
`connect_tls(host, port=443, timeout=10.0)` aplica os `10.0` segundos como `settimeout` do
socket TLS inteiro (`secure.settimeout(timeout)`), não só do handshake — toda leitura
subsequente do `!forceOrder@arr` (uma conexão de LONGA duração, "capture-or-lose") herda o mesmo
teto. Uma janela sem nenhuma liquidação de mercado inteiro por mais de 10 s fecha a sessão como
`REJECTED`, o que (`run()`, `failure_event`) derruba a OUTRA thread também e reinicia o processo
inteiro (`restart: unless-stopped`). `premiumIndex` nunca para de funcionar através dos
restarts — `collector_cycle_completed`/`verdict=ACCEPTED` aparece entre cada uma das 11
reinicializações, e os 44 registros por símbolo em `md.series` confirmam que o mapeamento desta
gate sobrevive ao ciclo de restart sem perda nem duplicata visível.

**Por que NÃO foi corrigido aqui:** é uma decisão de protocolo/rede (`infra`, `binance_stream_probe.py`),
não uma decisão de catálogo `SeriesKey` — fora do que este gate decide. Não há como saber, sem
medir vazão real por mais tempo, se `10 s` é curto demais para o tráfego real de
`!forceOrder@arr` ou se esta janela específica coincidiu com um mercado excepcionalmente calmo —
`medicoes/CA-F1-5-vazao-24h.md` (fase `01`) é a medição de vazão que existe, mas não teria
capturado isto porque não observou o timeout de leitura do socket, só a contagem de mensagens.
**Escalado a `infra-architect`/`quant-architect`, task futura:** medir a distribuição real de
gaps entre mensagens de `!forceOrder@arr` (não só a vazão média) e decidir se `timeout` precisa
subir, se precisa de um `ping`/keepalive de protocolo, ou se o `restart: unless-stopped` já é a
resposta aceitável (o coletor nunca perde dados — `ADR-004` já cobre reconexão dentro de uma
sessão; isto é reconexão ENTRE processos, um nível acima).

---

## 7. Gatilho de reabertura

Se o owner declarar um QUINTO símbolo (ou remover um dos quatro), `INITIAL_SYMBOLS` muda em
UM lugar (`collector_series_mapping.py`) — nenhum outro arquivo repete a lista. Se um consumidor
real precisar de `index_price`/`estimatedSettlePrice`/`interestRate`, a função que os cataloga é
uma adição a este módulo, não um redesenho (mesmo padrão que `price_source_catalog.py` já
declara para si mesmo).
