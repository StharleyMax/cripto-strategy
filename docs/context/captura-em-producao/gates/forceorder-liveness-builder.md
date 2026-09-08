# [QA GATE — Fase única: `ADR-004` Emenda D5/D6 — pong real, morte por silêncio de QUALQUER frame, handoff B1 sem bloqueio]

**Feature:** `captura-em-producao`
**Componente:** `sentimento`
**Contexto:** trabalho retomado após queda do processo no meio da implementação — um builder
anterior já tinha editado os 5 arquivos de produção sem terminar (nenhum gate de builder existia
ainda) e sem rodar a suíte. O doc delta (`ADR-004` Emenda D5/D6 + `docs/INDEX.md`) já estava
commitado por outra sessão (`ae59d26`, antes desta retomada) — este gate cobre só o código.

## Arquivos alterados

- `backend/src/modules/sentimento/domain/force_order_reconnection_overlap.py` (modified — já
  estava pronto no working tree; revisado, sem mudança adicional)
- `backend/src/modules/sentimento/infra/rfc6455_client.py` (modified — já estava pronto; revisado)
- `backend/src/modules/sentimento/infra/binance_stream_probe.py` (modified — já estava pronto;
  revisado)
- `backend/src/modules/sentimento/use_cases/reconnect_force_order_stream.py` (modified — já
  estava pronto; revisado)
- `backend/src/modules/sentimento/infra/collectors_cli.py` (modified — **completado nesta
  sessão**: só o `import StreamIdleTimeoutError` estava lá; faltava toda a fiação — constantes
  `_FORCE_ORDER_RECV_GRANULARITY_S`/`_FORCE_ORDER_IDLE_TIMEOUT_S` substituindo o único
  `_FORCE_ORDER_READ_TIMEOUT_S=900.0`, `idle_timeout_s` passado a `WebSocketMessageSource`, e o
  `except (StopIteration, StreamIdleTimeoutError):` no loop de leitura — sem isso,
  `StreamIdleTimeoutError` (subclasse de `StreamTransportError`) caía em
  `_PUBLISH_FAILURE_EXCEPTIONS` e fechava `REJECTED`, exatamente o defeito que D5/D6 existe para
  eliminar)
- `backend/tests/sentimento/test_force_order_reconnection.py` (modified — reconciliado com D6:
  campo `new_first_message_at`→`new_source_ready_at`, `perform_overlap_handoff` retorna
  `ReconnectionHandoff` direto, `reconnect_and_key` não injeta mais a 1ª mensagem da nova conexão;
  +2 testes novos)
- `backend/tests/sentimento/test_aggtrade_nq_probe.py` (modified — `iter_text_messages` ganhou o
  parâmetro `send`; 6 call-sites quebrados corrigidos; +3 testes novos para D5)
- `backend/tests/sentimento/test_collectors_cli_force_order_source.py` (modified — `_Recording
  WebSocketMessageSource` ganhou `idle_timeout_s`; teste do timeout de 900s trocado por
  granularidade+idle separados)
- `backend/tests/sentimento/test_collectors_cli_endpoint_provenance_after_combined_stream_switch.py`
  (modified — fake aceita `idle_timeout_s`)
- `backend/tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py` (new — falsifier de
  integração: `StreamIdleTimeoutError` em `_run_force_order_collector` reconecta pela rota de
  `StopIteration`, nunca fecha `REJECTED`)

**Spec/ADR:** `docs/adr/ADR-004-reconexao-de-stream-sem-sequencia.md` §"Emenda D5/D6" (fonte de
verdade usada para reconciliar os testes, não os testes antigos).

## Diagnóstico: teste desatualizado vs. implementação desviada

A implementação (5 arquivos de produção) já estava CORRETA e alinhada com D5/D6 — pong real
mascarado, dois timeouts (`_read_exact`'s retry de granularidade + `StreamIdleTimeoutError`
acumulado), `ReconnectionHandoff.new_source_ready_at` provado só pelo handshake. As 6 falhas
originais eram **teste desatualizado**: `test_force_order_reconnection.py` ainda cravava o campo
antigo (`new_first_message_at`) e a semântica de bloqueio pré-D6 (`OverlapHandoffRecord`,
`first_new_message`). O que estava genuinamente FALTANDO era a fiação em `collectors_cli.py`
(constantes + `except`) — isso não é teste desatualizado, é implementação incompleta, corrigida
nesta sessão.

## DoD (falsificadores da própria Emenda D5/D6, ADR-004 §"Falsificador desta emenda")

- [x] PING respondido com PONG real, mascarado, mesmo payload; nenhuma reconexão disparada só por
      isso — `test_a_ping_receives_a_masked_pong_echoing_the_same_payload`
      (`backend/tests/sentimento/test_aggtrade_nq_probe.py`)
- [x] Silêncio de QUALQUER frame acumulado ≥ D5 dispara a MESMA rota de `StopIteration`, não
      `_PUBLISH_FAILURE_EXCEPTIONS` — nível `WebSocketMessageSource`:
      `test_a_single_recv_timeout_is_not_a_verdict_it_keeps_retrying_below_idle_threshold` +
      `test_idle_silence_past_d5_raises_a_distinct_type_from_the_generic_frame_failure`; nível
      integração `_run_force_order_collector`:
      `test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected`
      (`test_collectors_cli_idle_timeout_reconnect.py`) — **falsificador verificado manualmente**:
      revertendo `except (StopIteration, StreamIdleTimeoutError):` para `except StopIteration:`
      só, o teste FALHA (`assert 1 == 2`, log mostra `verdict=REJECTED`); restaurado antes de
      fechar o gate.
- [x] `new_source` cujo `.messages()` nunca produziria nada não trava o handoff —
      `test_perform_overlap_handoff_never_touches_a_new_source_that_would_block_forever`
      (`_NeverYieldsSource.messages()` levanta `AssertionError` se chamado — nunca é)

## Comandos rodados (literais) e resultado

- `bash backend/scripts/test.sh -k "force_order or collectors_cli or rfc6455 or reconnect or aggtrade_nq or idle_timeout" --no-cov`
  → `168 passed, 1741 deselected in 12.61s` [MEDIDO]
- `bash backend/scripts/test.sh` (suíte completa, com cobertura)
  → `1909 passed, 4 warnings in 535.03s (0:08:55)`; `Required test coverage of 70.0% reached. Total coverage: 96.90%` [MEDIDO]
  → piso por camada (ADR-009/D1): domain 99.8% (3693/3700), use_cases 100.0% (855/855), infra
    93.1% (2927/3143) — 3/3 camadas medidas, todas `[OK]` [MEDIDO]
- `harness rules --mode sweep --changed-only`
  → 1 achado: `[AVISO] core.module-docstring-single-line` em `collectors_cli.py:1` — **pré-
    existente** (linha 1 do arquivo não tocada nesta sessão nem na anterior; confirmado via
    `git show HEAD:...collectors_cli.py | sed -n '1,3p'`), severidade AVISO (não bloqueante;
    `harness rules list --severity block` não lista essa regra) [MEDIDO]

## Cobertura dos arquivos tocados (do relatório da suíte completa)

- `force_order_reconnection_overlap.py`: 100% (10 stmts)
- `reconnect_force_order_stream.py`: 100% (35 stmts)
- `rfc6455_client.py`: 92% (96 stmts, 6 miss: 160-165 = ramos de comprimento 16/64-bit de
  `build_pong_frame`, não exercitados por payloads curtos; 192 = `OPCODE_PONG` recebido sem
  resposta, nunca testado — cliente não envia PING não solicitado)
- `binance_stream_probe.py`: 86% (121 stmts, 18 miss: 89-102 = `connect_tls` real, TLS ao vivo,
  fora do universo "zero rede"; 213-216 = ramo não exercitado de `_send_frame`)
- `collectors_cli.py`: 76% (257 stmts) — não regrediu pela mudança desta sessão; gaps pré-
  existentes (composição `run()`, `main`) fora do escopo desta emenda

Alvo declarado: piso por camada (`ADR-009/D1`), não 100% por arquivo — todos os 3/3 pisos `[OK]`.

## Doc delta

- `ADR-004`: **sem mudança nesta sessão** — a seção "Emenda D5/D6" já estava commitada
  (`ae59d26`, antes desta retomada) e é a fonte de verdade usada para reconciliar os testes.
- `docs/INDEX.md`: **sem mudança nesta sessão** — já commitado em `ae59d26`.
- ADR novo: não necessário — esta sessão implementa uma emenda já decidida, não decide nada novo.

## Bloqueado

Nenhum. Suíte completa verde, piso de cobertura por camada OK em 3/3, sweep de regras sem achado
bloqueante, os 3 falsificadores da própria emenda provados (inclusive o de idle-timeout, verificado
por mutação manual). Não houve commit, por instrução explícita do disparo.
