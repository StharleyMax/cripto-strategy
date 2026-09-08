# Gate `quant-architect` — decisão de arquitetura sobre o crash-loop de ~900s remanescente

**Assina:** `quant-architect`. **Data:** 2026-09-08. **Fecha:**
`docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md` §2 ("NÃO feito, e é
decisão deliberada" + o achado colateral de `pong`) — pedido direto do owner, não é remendo de
timeout. **Decisão registrada em:**
[`docs/adr/ADR-004-reconexao-de-stream-sem-sequencia.md`](../../../adr/ADR-004-reconexao-de-stream-sem-sequencia.md)
§"Emenda D5/D6" (novo).

## 1. O que foi decidido, em uma frase por decisão

- **D5:** o cliente WebSocket passa a responder `pong` de verdade (payload ecoado, mascarado —
  Binance doc: *"you must send a pong with a copy of ping's payload"*), e a morte de conexão passa
  a ser julgada por **silêncio de QUALQUER frame** (não de mensagem de domínio) acumulado em
  ~300s — dois `settimeout()` com papéis diferentes (granularidade curta ~20s; veredito de morte
  ~300s), nunca um timeout único fazendo os dois trabalhos como hoje (`_FORCE_ORDER_READ_TIMEOUT_S
  = 900.0`).
- **D6:** `perform_overlap_handoff` (B1) para de bloquear em `next(new_source.messages())` — a
  prova de "nova conexão viva" muda de "recebeu uma mensagem de domínio" para "completou o
  handshake RFC 6455". Aplica-se às duas causas de reconexão (`StopIteration` de hoje E o novo
  timeout de ociosidade de D5), o que remove o travamento indefinido para um produtor esparso.
- Reclassificação: timeout de ociosidade numa conexão JÁ ABERTA passa a reconectar pela mesma rota
  não-fatal de `StopIteration`; falha ao ABRIR a conexão substituta continua fatal (`REJECTED`) —
  isso é incapacidade real de coletar, não política de timeout errada.

## 2. Por que não é "aumentar o timeout de novo" — o raciocínio central

`_FORCE_ORDER_READ_TIMEOUT_S=900s` era um único instrumento fazendo dois trabalhos que pedem
valores opostos: detectar morte rápido pede um número PEQUENO; tolerar um produtor esparso pede um
número GRANDE. A doc da Binance (`ping` a cada 3 min, `pong` obrigatório, 10 min de tolerância)
dá o instrumento que faltava para separar os dois: silêncio de QUALQUER frame > ~2× o ciclo de
`ping` já é evidência forte de morte, muito antes dos 900s — e responder `pong` de verdade remove a
autopunição (hoje o coletor nunca ecoa `pong`, e a própria Binance vai fechar a conexão sozinha,
mesmo saudável, algures entre 3 e 10 minutos — comentário do próprio `rfc6455_client.py:13`
assumia isso ser inofensivo para uma SONDA curta, premissa que não vale para um coletor de longa
duração).

## 3. Testes reais que provam isto sem confiar no arquiteto

Fixture offline (3 casos, zero rede) especificada em `ADR-004` §"Falsificador desta emenda":
(1) só `ping` chegando nunca dispara reconexão; (2) silêncio de QUALQUER frame > D5 dispara a MESMA
rota de `StopIteration`; (3) `new_source` cujo `.messages()` nunca produz nada não trava o handoff.
Falsificador de produção: soak 24h sem restart atribuível a `FRAME: timeout` (`docker inspect`
`RestartCount` + `docker logs | grep -c`), critério dado com o comando que o mede.

## 4. O que este gate NÃO faz

Não edita código — `rfc6455_client.py`, `binance_stream_probe.py`,
`reconnect_force_order_stream.py`, `force_order_reconnection_overlap.py`, `collectors_cli.py`
continuam como estavam. Implementação é de `infra-architect`/builder, com os valores de D5
confirmados por soak test antes de fixados (rotulados `[INFERRED]` em `ADR-004`, não `[MEDIDO]`).
Nenhuma task nova foi criada em `tasks.toml` — dono de abrir a task é `/tech-lead`/PM, fora do
escopo deste gate.
