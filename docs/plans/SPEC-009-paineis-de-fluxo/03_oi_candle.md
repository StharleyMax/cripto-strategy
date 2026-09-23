# Fase `03` — O OI em candle: verde se entrou contrato no bucket, vermelho se saiu

> **Pixel:** um candle de OI por bucket, em contratos, com corpo verde quando `close > open`, vermelho quando `close < open` e neutro quando são iguais
> **Componentes:** `sentimento` (projeção ou coletor) · `web`
> **Requisitos cobertos:** `RF-8` · `RF-9` · `RN-1` · `RN-2` · `RN-5` (corrigido) · `RN-6` · `RNF-4` · `CA-7` · `CA-8′`
> **Decide:** `SPEC-009` §6 · `ADR-045` (se `O-1`/`O-3`/`O-4`)
> ⛔ **BLOQUEADA por `[Q-OI-1]`, que é do owner e está sem resposta.** Esta fase **não escolhe**: ela está escrita condicionalmente, com um ramo por opção do menu (`SPEC-009` §6.1)

## Parte comum a todas as opções

| # | item | componente | requisito |
|---|---|---|---|
| 3.C1 | O pane `oi` passa de `line` para `candlestick` no registry, com o `OiCandle` (`SPEC-009` §6.3) como fonte | `web` | `RF-8` |
| 3.C2 | Legenda com **O·H·L·C** do bucket e o rótulo de `derived_from` (`RN-6`) | `web` | `RF-9`, `RN-6` |
| 3.C3 | Forma do OI no TF `1m` e em `5m` sem pavio (`[Q-DG-3]`), decidida por `design_gate` + `quant-architect` | `web` | `Q-OI-3` |

## Ramo `O-1` / `O-3` — fase **única**

| # | item | componente | requisito |
|---|---|---|---|
| 3.1 | Projeção `OiCandle` em `sentimento`, função pura com a chave no trio `(STOCK, POINT, POINT_AT_BUCKET_END)`: qualquer outro trio falha alto. Definição em `ADR-045/D1` | `sentimento` | `RN-2`, `RN-5` |
| 3.2 | A rota serve a projeção (`ADR-045/D2`). Mede o falsificador 3 de `ADR-045` (fração de corpos `0` em `5m` com âncora, `n ≥ 200`) **antes do pixel**. Se passar de 50%, **para e volta ao owner** com o número | `sentimento` | `ADR-045` §Falsificador |

## Ramo `O-2` — duas fases

- **`03a` (captura, `sentimento`):** coletor do OHLC de OI da Coinalyze até `md.series`, entrando sob o
  predicado de quarentena de `PRD-005`. Declara a pegada de disco **antes** de escrever (`RNF-4`).
  ⛔ **Pré-condição:** a emenda de `ADR-036/D2` aceita pelo dono dela (`[Q-ADR036]`).
- **`03b` (pixel, `web`):** a parte comum sobre `(STOCK, OPEN|HIGH|LOW|CLOSE)` nativos, reagregados pela
  tabela de `ADR-040`. `ADR-045` **não** se aplica aqui.

## Ramo `O-4` — duas fases

- **`03a` (coletor, `sentimento`):** polling de `/fapi/v1/openInterest`. Primeiro item: **ler o peso da
  chamada** (hoje `[NÃO LIDO]`) e medir a cota. Depois declarar e medir o disco (estimativa de
  ~570 KB/dia a 1 min, `[INFERRED]`).
- **`03b` (pixel):** o histórico sai de `ADR-045`; daqui para frente, o candle vem do polling. `samples`
  e `derived_from` dizem qual regime vale em cada bucket.

## DoD verificável — comando e universo

1. **Propriedades de `ADR-045`** (ramos `O-1`/`O-3`/`O-4`). Em `n ≥ 288` buckets `5m` reais de `BTCUSDT`:
   `close == last` servido hoje, e `open(Bₖ) == close(Bₖ₋₁)` sempre que `open_at_ms == T0`.
   **Uma divergência reprova.**
2. **Cor por contratos** (`CA-7`). Para `n ≥ 50` buckets, `cor(oi_i) == sinal(close_i − open_i)` com os
   valores da rota. **A janela tem de conter ao menos 1 bucket em que o sinal do preço e o do OI
   divergem**; se não tiver, é inconclusivo. **Morde:** colorir pelo preço.
3. **Buraco** (`CA-8′`). Numa janela com um dos buracos de M3 não aparece **nenhum** candle no intervalo,
   **nem** no primeiro bucket `5m` depois dele. **Morde:** costurar a âncora com o último ponto antes do buraco.
4. **Não-regressão** e `DoD-1`/`DoD-2`. Nos ramos `O-2`/`O-4`, `DoD-1` e `n_written` são **dado novo** e
   têm de ser `> 0`.
5. `make verify` verde. Veredito do `ux-ui-mastery`.
