# Fase `05` — Correções de uso: o eixo segue o timeframe e a cobertura para de mentir

> **Pixel:** em **cada um dos 5 TFs**, velas com corpo legível; o pane de liquidação mostra barras; o
> aviso de cobertura só aparece quando falta dado de verdade, e diz quanto.
> **Componentes:** `web` · `charts` · `sentimento`
> **Origem:** uso real do owner em 2026-10-02 — `docs/context/paineis-de-fluxo/handoff/FIX-uso-2026-10-02.md`
> (diagnóstico com as medições). Entra como fix desta feature `[PREMISSA-OWNER: 2026-10-02]`: *"entra
> como fix da feature atual"*.

## Itens

| # | item | componente | defeito |
|---|---|---|---|
| 5.1 | O passo do eixo mestre é o `stepMs` do TF escolhido; janela inicial, página e teto de acumulação contam em **barras**, não em minutos; a vista inicial enquadra um número de barras com corpo legível | `web` · `charts` | D-A |
| 5.2 | Série de EVENTO (liquidação): minuto sem linha dentro de janela que o coletor consultou com sucesso é **zero legítimo**; `coverage` passa a medir o que o coletor consultou, não as linhas devolvidas. ZL-2 continua valendo | `sentimento` | D-B |
| 5.3 | Buracos de klines: achar por que o reparo no boot não fecha os 11 buracos medidos, corrigir, e re-popular a stack local | `sentimento` | D-C |
| 5.4 | Aviso de cobertura com **magnitude** (quanto falta), sem o falso "0 de N"; altura do pane de liquidação legível — decidido por `ui-designer` com o gate `ux-ui-mastery` | `web` | D-C, D-D |
| 5.5 | Veredito do `ux-ui-mastery` sobre o screenshot real nos 5 TFs | `web` | — |

## DoD verificável — comando e universo

1. **Eixo por TF** (5.1). Playwright contra o app real, nos 5 TFs: o número de slots do eixo é igual ao
   número de buckets da janela daquele TF (sem slot vazio entre velas), e o `barSpacing` da vista inicial
   é `≥ 4 px`. **Ablação:** voltar o passo para 1 min reprova o assert em 1h e 4h.
2. **Liquidação** (5.2). Na janela de 4 dias de BTCUSDT, `present/expected` da liquidação não fica 100%
   parcial; bucket de 15m sem liquidação mostra `0`, não `ausente`. **Ablação:** sem a evidência do
   coletor, o minuto volta a ser ausência.
3. **Klines** (5.3). Depois do reparo, `count(distinct bucket_end)` da janela de 4 dias = número de
   minutos dela, nas 6 séries `/fapi/v1/klines` de BTCUSDT (hoje 5.696 de 5.760).
4. **Aviso** (5.4). O `data-fact` do aviso carrega a magnitude; com cobertura completa, o aviso não existe.
5. `make verify` verde, com `__pycache__` purgado antes.
6. Veredito do `ux-ui-mastery` sobre o screenshot real (5.5).
