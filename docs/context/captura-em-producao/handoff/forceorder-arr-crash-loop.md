# Handoff — `collector` em crash-loop real: `!forceOrder@arr` nunca entrega dado a este observador

**Achado pelo owner rodando `docker compose` local, 2026-09-08.** Já estava nomeado (não corrigido)
em `docs/INDEX.md` na entrada `2026-09-08T13:40Z` de `captura-em-producao` ("achado separado, dono é
`infra-architect`/`quant-architect` numa task futura") — esta é essa task.

## O sintoma, medido ao vivo

```
docker logs deploy-collector-1 --tail 60
```
→ ciclo de `collector_session_closed !forceOrder@arr: FRAME: timeout: The read operation timed out`
repetindo a cada ~10-12s; `docker inspect` do owner mediu **53 restarts em 11 minutos**.

## A causa mecânica, com arquivo:linha

`backend/src/modules/sentimento/infra/binance_stream_probe.py:138-140` (`_read_exact`) captura
`TimeoutError` do socket (que `connect_tls` configura com `settimeout(timeout)`, default
`timeout: float = 10.0`, `binance_stream_probe.py:59`) e SEMPRE a relança como
`StreamTransportError(ProbeStage.FRAME, ...)`. `backend/src/modules/sentimento/infra/collectors_cli.py:197-203`
inclui `StreamTransportError` em `_PUBLISH_FAILURE_EXCEPTIONS` — qualquer uma delas fecha a sessão
`REJECTED`, seta `exit_code[0] = 1` e `failure_event`, `run()` para as duas threads, `main()` devolve
`rc=1`, o container morre, `restart: unless-stopped` sobe de novo. `collectors_cli.py:574-580` usa
esse transporte, via `connect_tls(BINANCE_FUTURES_STREAM_HOST)` **sem override de `timeout`**, para
o coletor VIVO — a mesma classe que `T-03.6`/`T-03.2` desenharam para uma SONDA CURTA, onde "nada
chegou em 10s" É o resultado que se quer medir, não uma falha de transporte a esconder.

## Não é só "timeout curto para stream esparso" — re-medido agora

`docs/medicao-conectividade-forceorder.md` (`T-03.2`, 2026-09-01) já tinha isto como
`[NÃO MEDIDO]`, nomeado e nunca fechado: **85s combinados de `!forceOrder@arr`, 0 eventos** — e um
CONTROLE que empurra garantido a cada 1s para TODOS os símbolos (`!markPrice@arr@1s`) também
entregou **0 mensagens em 5s**. Streams **por símbolo**, MESMO host, mesma sessão, entregaram dado
imediatamente (`btcusdt@bookTicker` 142.895 bytes, `btcusdt@depth5` 7.500 bytes em ~5s).

Re-medido agora, nesta sessão, com o mesmo `force_order_collector_cli.py`:

```
.venv/bin/python -m src.modules.sentimento.infra.force_order_collector_cli \
    --seconds 130 --max-messages 5 \
    --evidence /tmp/force_order_130s.jsonl --summary /tmp/force_order_130s.json
```
→ `connected: true`, `messages_captured: 0`, `observed_seconds: 216.991` (reconectou internamente
após timeouts de 10s várias vezes até totalizar isso), `window_end: INTERRUPTED`,
`interrupted_at_stage: FRAME`. **Nenhum arquivo de evidência foi criado — zero mensagens para
gravar.** Combinado com `T-03.2`: **>300s de silêncio total em streams `@arr`**, incluindo um
controle que NUNCA deveria silenciar.

**Leitura, `[INFERRED]`:** o padrão (silêncio total em `@arr`, dado imediato em stream por símbolo,
mesmo host/sessão) é mais consistente com "este observador/caminho de rede não recebe streams de
ARRAY de mercado inteiro" do que com "liquidações são raras" — um controle de 1 msg/s garantida
também silenciou. **Verificado agora**: o endpoint combinado por símbolo do MESMO stream conecta
limpo:

```
path = combined_stream_path(['BTCUSDT'], stream='forceOrder')  # -> /stream?streams=btcusdt@forceOrder
WebSocketMessageSource('fstream.binance.com', path, ...).open()  # CONNECTED
```

## O que este handoff NÃO decide

- Se a correção é **trocar a fonte** (`!forceOrder@arr` → `<symbol>@forceOrder` combinado, mesmo
  padrão de `combined_stream_path` que `aggTrade` já usa) para os 4 símbolos do universo
  (`BTCUSDT`/`ETHUSDT`/`SOLUSDT`/`LINKUSDT`) — nota: o endpoint combinado (`/stream?streams=...`)
  envelopa o payload em `{"stream": "...", "data": {...}}`, diferente do endpoint cru
  (`/ws/!forceOrder@arr`) que `force_order_natural_key.py` foi escrito para parsear — troca de fonte
  provavelmente exige ajuste no parser do envelope, não só na URL.
- Se, além ou em vez disso, um timeout de leitura **não deveria ser fatal por si só** para o
  coletor VIVO (distinto da sonda) — reconectar em vez de `REJECTED`, já que `StopIteration` (uma
  desconexão limpa) já tem esse tratamento via `reconnect_and_key`/`ADR-004` Classe B.
- Valor certo de timeout, se a fonte muda mas o problema de latência ainda existir.

**Dono:** `quant-architect` (fonte/semântica do stream) — decisão de arquitetura de dado, mesmo
padrão que motivou o dispatch de hoje sobre Coinalyze. `infra-architect`/builder implementam depois
da decisão.
