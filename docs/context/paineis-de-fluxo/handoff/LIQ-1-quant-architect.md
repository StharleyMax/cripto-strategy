# Handoff `/architect` -> `quant-architect` — `paineis-de-fluxo`, `Q-LIQ-1`, `O-2 x ADR-036/D2` e o candle derivado

**Entrada:** `docs/specs/PRD-009-paineis-de-fluxo.md` (§1.2 M2-M5/M9, §8 RN-1/RN-2/RN-5/RN-6, §13-A, §14).
Referência visual: `docs/context/paineis-de-fluxo/handoff/referencia/coinalyze-tradingview-2026-09-23.png`.
**Saída esperada:** julgamento gravado em `docs/context/paineis-de-fluxo/handoff/LIQ-1-julgamento-quant-architect.md`.
Devolva ao `/architect` no máximo 15 linhas + o caminho.

## As perguntas (fonte LIDA e citada — URL/arquivo:linha; rótulo de força em todo número)

1. **`Q-LIQ-1`** — no pane único de liquidação, qual perna vai para CIMA e qual cor recebe? Leia a convenção
   da Coinalyze (doc/FAQ/página do indicador) e a da TradingView, e confronte com o mecanismo (long é
   liquidado em queda). Se as fontes discordarem, diga qual e por quê. Sem fonte lida => `[NÃO SEI]`,
   não inferência. Confira também a semântica da nossa `cohort=long|short` em
   `backend/src/modules/sentimento/domain/liquidation_catalog.py` (long = posição long liquidada?).
2. **`O-2` x `ADR-036/D2`** — *"OHLC de OI não existe na origem (Binance publica 1 ponto / 5 min)"* satisfaz
   o teste do terceiro? Julgamento seu, com a frase de `D2` citada. Não é escolha de opção — isso é do owner.
3. **Achado do `/architect`, para você confirmar ou derrubar:** `RN-5` diz *"OI toma `open` do primeiro"*;
   `§13-A/O-1` diz *"`open` = ponto imediatamente anterior se contíguo"*. Para série `(STOCK, POINT)`
   com `POINT_AT_BUCKET_END` (`series_reduction.py:28`), `RN-5` em TF `5m` dá `open == close` sempre
   (1 amostra) => todo candle neutro. Qual definição é a correta para *"entrou contrato no bucket"*? Defina
   `open/high/low/close` do candle derivado, e o comportamento no bucket após buraco (`RN-2`, M3).
4. **Onde a derivação mora.** `ADR-040/D1` põe a reagregação na rota, função pura de `(nature, reduction)`
   (`series_reduction.py:165-175`). Derivar OHLC de `(STOCK, POINT)` é um par/projeção novo no domínio da
   função, ou cabe como 4 leituras sobre a série existente? Julgue a forma do contrato `OiCandle` (§9) —
   sem código.
5. **`Q-OI-3`** — TF `5m` com O-1 (sem pavio): aviso ou não? Só o lado de fidelidade do dado; UI é do `design_gate`.

## Fronteiras

- `D-a` (Binance, contratos) é decisão do owner; não a reabra. `[Q-OI-1]`/`[Q-OI-2]` são do owner.
- Read-only. Não escreva ADR. `[NÃO SEI]` explícito. Morra cedo (R6): ~150 turnos no máximo.
