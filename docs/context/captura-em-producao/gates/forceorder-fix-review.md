# Gate `review` — auditoria arquitetural do conserto de crash-loop do `forceOrder` VIVO

**Assina:** revisor arquitetural (read-only). **Data:** 2026-09-08. **Branch:**
`fix/forceorder-combined-stream`, commit `8ad9f89`. **Fecha:**
`docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md`.

## Denominador

- Regras bloqueantes em vigor: **8** (`harness rules list --severity block`).
- Arquivos varridos: os **5** do diff (`git diff --stat origin/master...HEAD`) — 2 de produção,
  3 de teste — cada um checado com `harness rules --mode file --path <arquivo>`.
- Resultado mecânico: **0/8** regras bloqueantes violadas.

## Veredito

**COMPLIANT** — nenhuma regra bloqueante violada. 2 achados de arquitetura ficam registrados
como **WARNING** (julgamento sobre a arquitetura declarada, não regra mecânica), não derrubam o
veredito.

## Achados

**[WARNING-1] Transporte com escopo autodeclarado de sonda, reusado sem mudança para processo
24/7** — `backend/src/modules/sentimento/infra/binance_stream_probe.py:1` — o próprio módulo se
declara: *"Live WebSocket transport for the probe, with EVERY failure tagged by the stage it
hit."* `_default_force_order_source` (`collectors_cli.py:579-591`) importa `connect_tls` e
`WebSocketMessageSource` diretamente desse módulo, sem wrapper dedicado. O conserto muda o
timeout de leitura (10s→900s, `collectors_cli.py:183`) mas não move a fronteira: o transporte que
roda 24/7 continua sendo, textualmente, "o transporte da sonda". Agravante nomeado no próprio
gate do builder (`forceorder-fix-quant-architect.md:48-54`): `rfc6455_client.py:13` — o cliente
NUNCA responde `pong` a um `ping` do servidor, premissa correta para uma sonda curta, não
necessariamente para um coletor de longa duração — achado colateral, deixado para o dono decidir,
não corrigido. **Correção concreta:** extrair um `ForceOrderLiveTransport` (ou renomear/mover
`connect_tls`/`WebSocketMessageSource` para um módulo de infraestrutura sem "probe" no nome/escopo
declarado) que responda `pong`, e documentar ali — não em comentário de sonda — o contrato de
longa duração.

**[WARNING-2] `ADR-004`/Classe B1 (sobreposição obrigatória) não cobre o caminho de timeout** —
`backend/src/modules/sentimento/infra/collectors_cli.py:220-228` (`_PUBLISH_FAILURE_EXCEPTIONS`
inclui `StreamTransportError`) — um timeout de leitura (o que este fix torna raro, não
impossível) é tratado como FATAL, fechando a sessão inteira, e não como o "buraco" que
`ADR-004`/B1 manda reparar por sobreposição (`reconnect_and_key`, já usado para `StopIteration`
limpo em `collectors_cli.py:514-536`). O próprio gate do builder nomeia e defere isto
(`forceorder-fix-quant-architect.md` §2, linhas 35-46: *"Redesenhar B1 para um produtor esparso é
decisão de `ADR-004`, fora do escopo deste conserto"*) — decisão registrada em prosa, mas sem
emenda à `ADR-004` nem evento no ledger (`harness pipeline show captura-em-producao`) marcando o
adiamento como aceito pelo dono. É risco nomeado, não escondido, mas continua sendo o mesmo
agente que escreveu o código decidindo, sozinho, que a lacuna da própria ADR de gate F0 pode
esperar. **Correção concreta:** ou uma emenda curta a `ADR-004` reconhecendo a exceção do
caminho de timeout para Classe B, ou um evento de ledger explícito confirmando que o dono aceitou
o adiamento — não deixar só em markdown de gate.

## Comandos usados

```
harness rules list --severity block
harness rules --mode file --path backend/src/modules/sentimento/infra/collectors_cli.py
harness rules --mode file --path backend/src/modules/sentimento/domain/force_order_natural_key.py
harness rules --mode file --path backend/tests/sentimento/test_collectors_cli_force_order_source.py
harness rules --mode file --path backend/tests/sentimento/test_collectors_cli_real_series_mapping.py
harness rules --mode file --path backend/tests/sentimento/test_force_order_natural_key_envelope.py
git diff origin/master...HEAD -- backend/src/modules/sentimento/domain/force_order_natural_key.py
git show origin/master:backend/src/modules/sentimento/infra/collectors_cli.py | head -5   # confirma AVISO pré-existente, não introduzido por este diff
```

## Nota sobre o único achado mecânico visto

`core.module-docstring-single-line` (severidade AVISO, não uma das 8 BLOQUEIO) dispara em
`collectors_cli.py:1` — confirmado idêntico em `origin/master` (commit `8bc5369`), portanto
**pré-existente, não introduzido por este diff**. Não entra no veredito.
