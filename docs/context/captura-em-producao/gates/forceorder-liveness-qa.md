# Gate `QA` — falsificador de ADR-004 Emenda D5/D6 (liveness do `forceOrder` VIVO)

**Assina:** QA. **Data:** 2026-09-08. **Fecha:**
`docs/context/captura-em-producao/gates/forceorder-liveness-builder.md`. **Decisão-fonte:**
`docs/adr/ADR-004-reconexao-de-stream-sem-sequencia.md` §"Emenda D5/D6" §"Falsificador desta
emenda". **Commit:** nenhum — working tree, mais 1 arquivo de teste que este gate acrescentou.

## Metodologia

Mentalidade destrutiva: para cada um dos 3 casos do falsificador, achei o teste que alega cobri-lo,
li o código de produção que ele exercita, e tentei mutar a produção para provar que o teste morde.
Toda mutação foi revertida antes de fechar o gate (`git diff --stat` idêntico ao ponto de partida
mais o teste novo).

## Falsificador, caso a caso

**Caso 1 — só `ping` chegando nunca dispara reconexão.**
`test_a_ping_receives_a_masked_pong_echoing_the_same_payload`
(`backend/tests/sentimento/test_aggtrade_nq_probe.py:407`) prova a MASCARA/payload do `pong`, mas
chama `iter_text_messages` direto sobre um `_reader` sem relógio — não existe ali NEM em nenhum
outro teste da suíte (antes deste gate) nenhuma prova de que "market quiet" (só `ping`, por tempo
simulado > D5) deixa de disparar `StreamIdleTimeoutError`. **GAP real** — a metade que prova o
mecanismo central de D5 (silêncio de QUALQUER frame ≠ silêncio de mensagem de domínio) estava sem
teste. **Escrevi** `test_pings_across_time_past_d5_are_answered_and_never_declared_dead`
(`test_aggtrade_nq_probe.py:668-753`, com a fixture `_RepeatedPingsChannel`), dirigindo
`WebSocketMessageSource` com relógio injetado (~10s simulados, 2× `idle_timeout_s=5.0`, nenhum gap
individual cruza o limiar). **Mutação:** removi
`self._last_activity_at = self._now()` do ramo de sucesso de `_read_exact`
(`binance_stream_probe.py:207-208`) — o teste novo falhou (`StreamIdleTimeoutError: ... 7.0s >= 5.0s`
`[MEDIDO 2026-09-08]`); revertido, suíte volta a verde.

**Caso 2 — silêncio de QUALQUER frame > D5 dispara a MESMA rota de `StopIteration`.**
Bem coberto em dois níveis: `test_idle_silence_past_d5_raises_a_distinct_type_from_the_generic_frame_failure`
(`test_aggtrade_nq_probe.py:668`, relógio injetado, nunca `sleep`) prova o tipo distinto na
camada `WebSocketMessageSource`; e
`test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected`
(`backend/tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py:136`, arquivo **novo,
não listado no gate do builder** — ver "Achado colateral" abaixo) dirige
`_run_force_order_collector` de ponta a ponta com fakes, e assert `exit_code == [0]`,
`failure_event` nunca setado, `verdict == "ACCEPTED"` — exatamente o que a tabela de
reclassificação da emenda exige. Li o próprio comentário do teste: ele nomeia a mutação que
pegaria (reverter `except (StopIteration, StreamIdleTimeoutError):` para só `StopIteration`) e eu
a apliquei mentalmente contra o `except` em `collectors_cli.py:562` — o tipo cai em
`_PUBLISH_FAILURE_EXCEPTIONS`, que ainda lista `StreamTransportError` (pai de
`StreamIdleTimeoutError`), então o teste morderia. **Sem gap.**

**Caso 3 — `new_source.messages()` nunca produzindo nada não trava o handoff.**
`test_perform_overlap_handoff_never_touches_a_new_source_that_would_block_forever`
(`backend/tests/sentimento/test_force_order_reconnection.py:337`) usa `_NeverYieldsSource`, cujo
`.messages()` levanta `AssertionError` se chamado — prova direta de que
`perform_overlap_handoff` (`reconnect_force_order_stream.py:66`) não lê o novo source, só chama
`.open()`. Direto, sem mock que desvie do caminho real. **Sem gap.**

## Comandos rodados (eu mesmo, não o builder)

- `bash backend/scripts/test.sh -k "force_order or collectors_cli or rfc6455 or reconnect" --no-cov`
  → **102 passed, 1808 deselected** `[MEDIDO 2026-09-08]` (builder reportou 101 — a diferença é o
  arquivo novo não listado; ver achado abaixo).
- `bash backend/scripts/test.sh` (suíte completa, sem filtro) → **1910 passed, 4 warnings, 486.67s**,
  `rc=0` `[MEDIDO 2026-09-08]`. Cobertura total **96.90%** (piso 70%). Por camada (`ADR-009/D1`):
  domain 99.8%/90%, use_cases 100%/80%, infra 93.1%/70% — as 3 acima do piso. 1910 = 1908 (builder)
  + 1 (teste do arquivo novo não contado) + 1 (o teste que escrevi neste gate).
- `bash backend/scripts/lint.sh` → `All checks passed!` / `Success: no issues found in 387 source
  files`.
- Grep manual (não regra `[[rules.own]]`, checagem pontual) sobre os 10 arquivos tocados: zero
  `print(`, zero `except: pass`, zero import relativo, zero segredo literal.

## Achado colateral, não bloqueante — inventário do gate do builder está incompleto

`backend/tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py` é arquivo **novo e
não-rastreado** (`git status --porcelain -u`), com o teste mais direto do Caso 2. O gate do
builder (`forceorder-liveness-builder.md`, "9 arquivos... 4 de teste") não o lista — são **10
arquivos**, 5 de teste. Isso explica o "101 passed" do builder vs "102 passed" medido aqui. Não é
defeito de cobertura (o teste existe e é bom) — é imprecisão de inventário no relatório do
builder. Não bloqueia este gate, mas quem confiar no "9 arquivos"/"101 passed" sem rodar o comando
teria uma imagem incompleta.

## Achado colateral, não bloqueante — o filtro `-k` da tarefa não alcança o arquivo mais relevante

`-k "force_order or collectors_cli or rfc6455 or reconnect"` **não casa com nenhum teste de
`test_aggtrade_nq_probe.py`** (`--collect-only` sobre esse arquivo isolado: `no tests collected (65
deselected)` `[MEDIDO 2026-09-08]`) — nem por nome de arquivo, nem por nome de teste. É exatamente
o arquivo que carrega os testes de nível `WebSocketMessageSource`/`rfc6455` mais próximos dos
Casos 1 e 2 (ping/pong, relógio injetado). O número "101/102 passed" desse filtro nunca provou D5
sozinho — quem prova é a suíte completa. Registro para não virar hábito de citar o filtro como se
fosse suficiente para este ADR.

## Regras bloqueantes avaliadas: 8 de 8 (`harness rules list --severity block`)

Nenhuma das 8 regras (`core.relative-import`, `core.silent-except`, `core.print-statement`,
`core.hardcoded-secret`, `web-fullstack.*` — N/A a Python de backend —,
`own.compose-hardcoded-secret`) encontrou violação nos 10 arquivos tocados; nenhuma é
específica desta ADR.

## Veredito

Todos os 3 casos do falsificador têm agora teste real, direto, não-tautológico (2 já existiam
sólidos; 1 tinha gap e foi fechado neste gate, só em arquivo de teste). Produção não foi alterada
— a mutação usada para provar o teste novo foi revertida. `APPROVED`.
