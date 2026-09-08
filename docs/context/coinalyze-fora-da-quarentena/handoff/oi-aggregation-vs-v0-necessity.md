# Handoff: fonte de OI (Coinalyze agregado × Binance único) + necessidade real para v0

## Contexto que o owner já decidiu (não reabrir)

- Coinalyze sai da quarentena (`[PREMISSA-OWNER: 2026-09-08]`: *"ta, podemos retirar da quarentena
  então"*) — `SPEC-005`/`ADR-033` (aceita, co-assinada por você) já cobrem F1 (probe em regime +
  persistência) e F2 (fórmula MODELED + promoção). Isso está fora de escopo desta discussão.
- `observer_region` = SP para VPS e local — resolvido, não é bloqueio de nada aqui.
- `ADR-027/D1`: só 3 processos always-on em produção (2 coletores Binance 24/7 + 1 escritor único);
  `coinalyze_one_shot_cli` e outras 13 CLIs diagnósticas rodam via cron/systemd timer, mesma imagem.

## O que ficou pendente e é o motivo deste handoff (F3 de `PRD-005`, condicional a `[Q4]`)

`coinalyze_one_shot_cli` busca OI/liquidação com `interval=daily` HARDCODED
(`backend/src/modules/sentimento/domain/coinalyze_daily_series.py:39,94`) — ou seja, a cadência de
invocação (cron a cada N horas) é IRRELEVANTE pra frescor: o dado que ele lê já é diário, não importa
quantas vezes por dia você rodar o binário. O owner apontou isso: *"a janela de rodar a cada 6h tenho
um dado muito defasado … quero acompanhar quase em tempo real … quando for fazer as estratégias, um
rompimento no SMC precisará da confirmação em CVD e OI"*. O gap real não é cadência — é que **não
existe hoje nenhum poller intraday de OI**, nem para Coinalyze nem para Binance.

CVD near-real-time já está resolvido, fora deste problema: `cvd_source_catalog.py` já cobre CVD via
`aggTrade`/`forceOrder` da Binance (worker contínuo, mesma classe dos 2 coletores 24/7 do `ADR-027`).
O CVD agregado-spot que aparece no Coinalyze (ver screenshot do owner) é uma superfície DIFERENTE e o
gap dela é pré-existente, independente da decisão de OI abaixo.

## A pergunta de fonte (o motivo de chamar você)

Long/short ratio: **NÃO é questão** — vem nativamente de 5 endpoints da própria Binance, já mapeados
em `backend/src/modules/sentimento/domain/availability_probe_set.py` (`BinanceFuturesDataEndpoint`) e
`endpoint_shift_table.py:42-44` (mesmo shift `+300_000ms` medido em 3 de 4). Coinalyze só reexibe isso.

OI é a questão real: Coinalyze agrega OI de MÚLTIPLAS exchanges (Binance+Bybit+OKX etc — ver
screenshot do owner: "Aggregated OI Delta Profile", "Aggregated OI STABLECOIN+COIN-margined"); o
`openInterestHist` nativo da Binance é single-exchange, não replica isso. Retenções medidas em
`docs/medicao-coinalyze.md`: OI 1min ~1,5 dias, OI 5min ~7 dias (Coinalyze); Binance não tem esse teto
de retenção mas também não agrega.

## O que precisamos de você — e não é só "qual fonte", é SE

1. Pra uma confirmação de rompimento SMC via convergência (o caso de uso que o owner descreveu), o OI
   agregado multi-exchange do Coinalyze tem valor real sobre o OI single-exchange (Binance) que os
   coletores atuais já teriam trivial acesso a estender? Ou o ruído de agregar exchanges de liquidez
   muito desigual (Binance domina volume) torna a diferença desprezível pro sinal que a estratégia usa?
2. **Questione a necessidade real, não só o mecanismo**: essa entrega (poller intraday de OI, seja
   Coinalyze seja Binance, e toda a infra de agregação multi-exchange que viria com Coinalyze) é
   necessária para o v0 desta feature (`coinalyze-fora-da-quarentena`, ainda em `SPEC_DRAFT`)? Ou o v0
   pode fechar só com F1+F2 (probe/persistência + fórmula MODELED, ambos usando o `coinalyze_one_shot_cli`
   diário que já existe) e F3 (poller intraday, decisão de fonte) fica deliberadamente para depois —
   sem que isso trave o `advance` desta feature nem crie dependência falsa entre convergência e OI
   intraday antes de existir a própria camada de convergência?
3. Se a resposta for "não é necessário agora": qual seria o gatilho concreto de reabertura (ex.: "só
   quando a camada de convergência/SMC existir e puder consumir OI") — igual ao padrão de outras
   exceções deste repositório (ver `CLAUDE.md` §linha 11, gatilho de reabertura com endereço).

## Onde registrar

Devolva no máximo 15 linhas (veredito + números com comando + caminho do relatório completo). Se
produzir análise longa, salve em `docs/context/coinalyze-fora-da-quarentena/gates/oi-source-v0-necessidade-quant-architect.md`
antes de responder.
