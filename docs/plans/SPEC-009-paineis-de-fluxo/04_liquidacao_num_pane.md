# Fase `04` — As liquidações num pane: short liquidado em cima, long liquidado embaixo

> **Pixel:** **um** pane com as duas pernas. `cohort=short` fica acima da linha de zero, no token de **alta**; `cohort=long` fica abaixo, no token de **baixa**. A legenda mostra as duas magnitudes
> **Componentes:** `web` · `charts`
> **Requisitos cobertos:** `RF-10` · `RF-11` · `RN-3` · `RN-4` · `CA-9′` · `CA-10′` · `CA-LIQ`
> **Decide:** `SPEC-009` §7 · `ADR-044/D4`
> **Convenção:** Coinalyze, registrada como `[INFERRED]`, com `[Q-LIQ-2]` aberta ao owner como veto não-bloqueante

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 4.1 | Os panes `liquidation_long` e `liquidation_short` do registry viram um só, `liquidation`: 2 barras, 4 marcas e 4 escalas. A escala da perna long usa `invertScale: true`. **Nenhum valor negativo** entra em `setData` | `charts` · `web` | `RF-10`, `RN-3`, `ADR-044/D4` |
| 4.2 | Cada perna mantém o **próprio** par ausência/zero, do seu lado do zero. A invariante (iii) do registry cobre isso | `charts` | `RN-4` |
| 4.3 | Legenda com **2 magnitudes**, sem sinal de menos, cada uma na cor da sua perna, e nenhum terceiro número | `web` | `RF-10`, `RN-3` |
| 4.4 | Log × linear e o tamanho das duas metades (`[Q-DG-2]`), decididos pelo `design_gate` | `web` | `CA-12` |
| 4.5 | Re-ancorar o `e2e/13` (hoje há um hospedeiro de canvas por coorte, `:532, 692-697`) no pane fundido | `web` | — |

## DoD verificável — comando e universo

1. **Falsificador F-6** (`ADR-044`). A linha de base das duas escalas coincide em `≤ 1 px` no canvas, e
   nenhum valor `< 0` aparece em `setData` de liquidação. **Se reprovar**, entra o plano B (negação +
   escala linear), com o relatório devolvido ao `/architect`.
2. **Lado e cor** (`CA-LIQ`). Playwright contra o app real, para `n ≥ 20` buckets com perna `> 0`: o y do
   topo da barra `short` fica **acima** da linha de zero e o y da barra `long` fica **abaixo**, e a cor
   lida é o token de alta ou de baixa correspondente. **Morde:** trocar o `scale_ref` das duas pernas.
3. **Sem líquido** (`CA-9′`). (a) Nenhum `setData` de liquidação tem valor `< 0`. (b) A legenda tem
   **exatamente 2** números, e cada um é igual à sua perna na API. (c) Nos buckets com **as duas pernas
   `> 0` e distintas** (se não houver nenhum na janela, é inconclusivo), nenhum número na tela é igual a
   `|long − short|`. **Morde:** somar ou subtrair as pernas.
4. **Ausente ≠ zero por perna** (`CA-10′`). Um bucket sem linha e um bucket com `0` renderizam diferente
   no pane fundido, em cada perna. Se os dois estados não estiverem na janela, é inconclusivo. **Morde:**
   fundir os estados.
5. **Pane único.** Os panes com `N > 0` passam a ser **5** (`CA-1′`).
6. **Não-regressão.** `DoD-1`/`DoD-2` continuam `> 0` para `coinalyze·sum_liquidation·1m·SUM` nas duas coortes.
7. `make verify` verde. Veredito do `ux-ui-mastery`.
