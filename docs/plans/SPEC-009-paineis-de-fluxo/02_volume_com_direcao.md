# Fase `02` — O volume com direção: a barra toma a cor da vela

> **Pixel:** a barra de volume `i`, no rodapé do pane de preço, aparece no token de **alta** quando `close_i ≥ open_i` e no de **baixa** caso contrário
> **Componentes:** `charts` (função de cor, com os tokens em `charts/color-tokens.ts`) · `web` (ligação)
> **Requisitos cobertos:** `RF-7` · `RNF-3` · `CA-6` · `[Q-VOL-1]` (V-1)
> **Fronteira:** **zero dado novo.** Volume e vela já são servidos (`PRD-009` M5)

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 2.1 | Função pura (vela → cor da barra), usando **os mesmos dois tokens** da vela de preço (uma gramática de cor só). Doji fica com a cor de alta `[INFERRED: I-3]` | `charts` | `RF-7`, `RNF-3` |
| 2.2 | O slot de volume sem vela no mesmo índice (vela ausente) **não** recebe cor de direção: fica com a marca de ausência de hoje | `charts` | `RN-4` |
| 2.3 | Escala log × linear no rodapé (`[Q-VOL-2]`/`[Q-DG-2]`), decidida pelo `design_gate` | `web` | `CA-12` |
| 2.4 | Ligação no registry: a série `secondary` do pane `price` passa a usar a função de 2.1 | `web` | — |

> ⚠️ **CORREÇÃO 2026-09-26 ao item 2.1** (`W4-QA` BLOCKER-1, ver `docs/context/paineis-de-fluxo/handoff/T-02.1-doji-julgamento.md`):
> o doji **não** fica com a cor de alta. A barra fica **sem direção**, com `dojiItemColors().color` (a mesma cor da
> vela doji), pela `ADR-010/D-2`, que precede o `[INFERRED: I-3]`. Código: `frontend/src/charts/volume-direction.ts`
> (`volumeBarColor`). O item 2.3 foi decidido pelo `design_gate` de `T-02.2`: linear, base 0
> (`gates/T-02.2-design-gate.md` §4). As linhas da tabela ficam como estavam.

## DoD verificável — comando e universo

1. **Teste unitário da função.** `node --test` sobre a função de 2.1, com 4 casos: alta, baixa, doji e
   vela ausente. **Morde:** inverter o comparador (`≥` → `<`) reprova 3 dos 4.
   > ⚠️ **CORREÇÃO 2026-09-26** (`W4-QA` §2 DoD 1, ver `docs/context/paineis-de-fluxo/handoff/T-02.1-doji-julgamento.md`):
   > com o doji fora do comparador, inverter o comparador reprova **2 dos 4** (alta e baixa). O doji tem mutante
   > próprio (remover o ramo `close === open` reprova o caso 3), e o caso ausente também (ausente → tinta de alta
   > reprova o caso 4). Medido pelo `W4-QA` §4 (M1, M2, M4).
2. **Pixel** (`CA-6`). Playwright contra o app real, `BTCUSDT` no TF default, para `n ≥ 50` barras: a cor
   lida do canvas na coluna da barra `i` tem de ser igual à direção da vela `i` calculada com os valores
   de `/series-history`. **A janela precisa ter ao menos uma vela de alta e uma de baixa**; se não tiver,
   o resultado é inconclusivo, e não verde.
3. ⛔ **Ablação.** Inverter o comparador ⇒ o item 2 reprova.
4. **Não-regressão.** `DoD-1`/`DoD-2` continuam `> 0` para `binance·klines_volume·1m·SUM`.
5. `make verify` verde. Veredito do `ux-ui-mastery`.
