# Gate `quant-architect` — conserto do crash-loop real de `!forceOrder@arr`

**Assina:** `quant-architect`. **Data:** 2026-09-08. **Fecha:**
`docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md`. **Branch:**
`fix/forceorder-combined-stream`.

## 1. Decisão (1) — trocar a fonte: SIM, implementado

`collectors_cli.py`'s `_default_force_order_source` agora conecta em
`combined_stream_path(sorted(INITIAL_SYMBOLS), stream="forceOrder")` —
`/stream?streams=btcusdt@forceOrder/ethusdt@forceOrder/linkusdt@forceOrder/solusdt@forceOrder` —
em vez de `/ws/!forceOrder@arr`. Motivo, do handoff: `!forceOrder@arr` mediu **0 eventos em >300s
combinados**, incluindo um controle garantido de 1msg/s que também silenciou; um stream por
símbolo no MESMO host conectou e entregou de imediato. `sorted()` só fixa o path determinístico
para teste — não carrega significado de ordenação para um stream combinado.

**O que mudou de parser:** `force_order_natural_key.py::extract_force_order_natural_key` agora
aceita OS DOIS envelopes que carregam o mesmo objeto `o` — o cru (`{"e":...,"o":{...}}`) e o
combinado (`{"stream":...,"data":{"e":...,"o":{...}}}`) — via `payload.get("data", payload)`, a
MESMA regra que `probe_stream_quantity_fields._decode` já usa para `aggTrade`. `liquidation_reconciliation.py::parse_force_order_message`
**não foi tocado**: ele só lê arquivos JSONL gravados pela SONDA `T-03.2`
(`force_order_collector_cli.py`), que continua apontada para `/ws/!forceOrder@arr` cru — esse é o
endpoint que a sonda existe para medir, não o que o coletor VIVO usa.

## 2. Decisão (2) — timeout fatal: parcialmente, com uma parte DEFERIDA e nomeada

**Feito:** o timeout de leitura do coletor VIVO subiu de 10s (default de `connect_tls`, herdado
da sonda) para `_FORCE_ORDER_READ_TIMEOUT_S = 900.0`, ancorado no contrato documentado da própria
Binance: *"the websocket server will send a ping frame every 3 minutes... if the... server does
not receive a pong frame back... within a 10 minute period, the connection will be disconnected"*
(Binance Developer Docs, USDⓈ-M Futures WebSocket API General Info, lido 2026-09-08). 900s fica
folgado acima desses 10 minutos — um timeout só pode disparar depois que o próprio SLA da Binance
já foi violado, nunca por "nenhuma liquidação nos últimos segundos" num universo de 4 símbolos.

**NÃO feito, e é decisão deliberada, não esquecimento:** continuar tratando um timeout de leitura
como fatal (via `_PUBLISH_FAILURE_EXCEPTIONS`) para o coletor VIVO, em vez de reconectar como já
acontece para uma desconexão limpa (`StopIteration` → `reconnect_and_key`, Classe B/ADR-004).
Motivo: `perform_overlap_handoff` (B1) BLOQUEIA em `next(new_source.messages())` antes de fechar a
conexão antiga — desenhado para um produtor de alta frequência (`aggTrade`) onde a próxima
mensagem chega logo. Reusar essa mesma função para um timeout de `forceOrder` (produtor
ESPARSO mesmo com os 4 símbolos combinados) só empurraria a mesma falha um nível abaixo: a nova
conexão poderia estourar OUTRO timeout de 900s esperando a primeira mensagem, e essa exceção
propagaria pelo mesmo caminho fatal. Redesenhar B1 para um produtor esparso é decisão de
`ADR-004`, fora do escopo deste conserto. **Risco residual aceito:** acima de 900s de silêncio
real (violação do próprio SLA da Binance), a sessão fecha `REJECTED` e o container reinicia —
no MÁXIMO 1x/15min, não mais 1x/10-12s.

**Achado colateral, fora de escopo, nomeado para não se perder:** `rfc6455_client.py`'s
`iter_text_messages` NUNCA responde `pong` a um `ping` do servidor (só faz `continue`) —
comentário do próprio arquivo (`rfc6455_client.py:13`) já assume isso, correto para uma SONDA
curta, não necessariamente para um coletor de longa duração. Não é o que causou este crash-loop
(ciclo de 10-12s, não 10min) e uma desconexão de servidor por isso já é tratada como `StopIteration`
limpa (`OPCODE_CLOSE` → `return`). Fica registrado aqui para o dono decidir se half-duplex ping é
suficiente ou se o cliente precisa responder `pong`.

## 3. Testes reais, offline, provando o parsing do novo envelope

```
bash backend/scripts/test.sh -k "force_order or collectors_cli" --no-cov
```
→ **96 passed** (91 pré-existentes + 5 novos), 0 rede.

- `backend/tests/sentimento/test_force_order_natural_key_envelope.py` — unidade: mesma chave B2
  extraída do envelope cru E do combinado; ack de subscrição e lista JSON seguem recusando limpo.
- `backend/tests/sentimento/test_collectors_cli_real_series_mapping.py`
  (`test_a_liquidation_in_the_combined_stream_envelope_shape_also_publishes`) — fim a fim: o
  frame `BTCUSDT` envelopado publica em `md.series.write`, mesmo resultado do frame cru.
- `backend/tests/sentimento/test_collectors_cli_force_order_source.py` — pina o path
  (`/stream?streams=...@forceOrder`, `!forceOrder@arr` ausente) e o timeout (900.0) do source
  DEFAULT de `run()`, sem tocar rede.

`bash backend/scripts/test.sh` (suíte completa, com cobertura e piso por camada) rodando em
background nesta sessão — resultado será devolvido ao owner antes do merge.

## 4. Arquivos tocados

- `backend/src/modules/sentimento/domain/force_order_natural_key.py`
- `backend/src/modules/sentimento/infra/collectors_cli.py`
- `backend/tests/sentimento/test_collectors_cli_real_series_mapping.py` (+1 teste)
- `backend/tests/sentimento/test_collectors_cli_force_order_source.py` (novo)
- `backend/tests/sentimento/test_force_order_natural_key_envelope.py` (novo)
