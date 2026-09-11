# Achado: por que o coletor de liquidação está morto — e por que ninguém soube

`[MEDIDO 2026-09-10]` — apuração feita no loop principal enquanto o `/pm` escrevia o PRD.
Entrada para o `/architect`. **Não é decisão** — é evidência.

## Não é o mapeamento de catálogo

A hipótese óbvia estava errada e vale registrar para ninguém repetir a busca.
`collectors_cli.py:_mapping_not_decided_yet` (linha ~365) levanta
`SeriesRowMappingNotDecidedError` quando `to_rows` não é injetado — mas `main()`
**injeta os dois** (`collectors_cli.py:797-801`):

    premium_index_to_rows=build_premium_index_to_rows(...)
    force_order_to_rows=build_force_order_to_rows()

Logo o cano de liquidação está montado. A falha é **anterior**, no socket.

## O que os números dizem

    /api/v1/ingest-health  →  runs com endpoint forceOrder: n=2

| campo | run 1 | run 2 |
|---|---|---|
| `verdict` | `REJECTED` | `REJECTED` |
| `api_code` | `None` | `None` |
| `n_expected` / `n_returned` / `n_written` | 0 / 0 / 0 | 0 / 0 / 0 |
| janela | `2026-09-08T20:31 → 22:01` (1h30) | `2026-09-08T22:08 → 2026-09-10T19:53` (**~46h**) |

Uma sessão de **46h** que fechou com `n_returned=0` sobre BTC/ETH/LINK/SOL USDT.
`[INFERRED: implausível como ausência real de liquidação nesses 4 pares em 46h — o mais
provável é socket conectado e mudo, ou nunca conectado]`. **Não medido:** se o socket
chegou a abrir. Quem resolve isso é o `/architect` decidindo a instrumentação.

## Por que ninguém soube — e este é o defeito de verdade

1. `verdict=REJECTED` com **`notes=None` e `api_code=None`**: o veredito não carrega motivo.
2. `docker logs deploy-collector-1 --since 2h | grep -v collector_cycle_completed` →
   **zero linhas**. A thread de forceOrder não emite nada, nem em falha.
3. O log que existe não tem `extra={}` — `collector_cycle_completed` e `writer_batch_acked`
   são strings nuas, sem contador (ver `DIAGNOSTICO.md`).

⇒ Um coletor do CORE ficou **46h em silêncio** e o único sinal era um `REJECTED` sem motivo,
numa tela que ninguém cruza com o relógio. É o modo de falha que `ADR-012` nomeia para o
`rc=0`: **sinal indistinguível entre "não houve evento" e "o instrumento não é capaz de
distinguir"**.

## Contexto que o código já sabia e que confirma o risco

`collectors_cli.py:167` registra o sintoma em prosa, de uma investigação anterior:

    collector_session_closed !forceOrder@arr: FRAME: timeout: The read operation timed out

e `collectors_cli.py:175-178` declara que **mesmo o stream combinado por símbolo é esparso o
bastante para bloquear uma leitura por minutos**. Existe teste dedicado
(`backend/tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py`), e ele passa
offline com fonte injetada — o que **não** cobre o socket real.

## O que isto significa para a fatia de liquidações

A fatia de liquidação **não pode** ter como DoD "apareceu ponto na tela em 1h": evento
esparso não distingue conserto de ausência. Ela precisa de um DoD que prove **liveness do
socket** (heartbeat/contiguidade), não taxa — que é exatamente o que `T-07.11` já descreve
(`[sentimento] 07 · Detector de liveness por contiguidade + heartbeat, nunca taxa`), hoje
`status = "blocked"` em `docs/context/plataforma-dados/tasks.toml:1161`.

**Recomendação ao `/architect`:** a fatia de liquidações herda `T-07.11` em vez de reinventá-la.
