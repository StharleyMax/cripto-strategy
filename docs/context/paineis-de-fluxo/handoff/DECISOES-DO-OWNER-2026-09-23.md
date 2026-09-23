# Decisões do owner — `paineis-de-fluxo`, 2026-09-23

Todas são `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`: o owner escolheu entre
opções que um agente redigiu, com o custo de cada uma declarado no menu (`PRD-009` §13-A, emendado pela
`SPEC-009`). **Nenhuma delas é fala do owner** e, por isso, nenhuma é `[PREMISSA-OWNER]`.

| pergunta | escolha | alternativas recusadas | custo aceito, como estava no menu |
|---|---|---|---|
| `[Q-OI-1]` fonte do candle de OI | **O-4, polling de `/fapi/v1/openInterest` com intervalo < 5m, pela origem (Binance)** | O-1 derivar do `openInterestHist` 5m · O-2 capturar OHLC da Coinalyze · O-3 O-1 agora e O-2 depois | coletor novo; peso da chamada `[NÃO LIDO]`; ~570 KB/dia `[INFERRED]`; pavio real só a partir do dia em que o coletor ligar |
| `[Q-OI-2]` OI agregado entre exchanges | **U-1, só Binance** (mantém a decisão de 2026-09-19, OI em contratos) | U-2 agregar (25% do teto com 4 exchanges, 45% com 8, estoura 145% com 28) | custo zero |
| `[Q-LIQ-2]` convenção de lado da liquidação | **Coinalyze**: short liquidado para cima com o token de alta, long liquidado para baixo com o token de baixa | TradingView (long para cima, verde; artigo de ajuda 43000762400) | nenhum declarado |

## O que continua em aberto

- **`approve spec`**: gate do owner, **não** implicado por estas escolhas. A SPEC-009 precisa primeiro fixar o
  ramo de F3 em O-4, retirando as opções recusadas.
- Com O-2/O-3 recusadas, a emenda de `ADR-036/D2` que o menu previa **não é necessária**.
- **O que O-4 deixa sem resposta, para a SPEC:** qual é o candle de OI **antes** do dia em que o coletor liga.
  Ou é o histórico de O-1 (5m sem pavio, o "O-4-histórico" que a `ADR-045` cita), ou é ausência declarada.
  Dono: `/architect` + `quant-architect`.

## 2ª rodada de escolhas — mesmo dia, depois da emenda O-4 e do gate de design r2

Também `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`.

| pergunta | escolha | alternativa recusada |
|---|---|---|
| Funding rate como pane (`PRD-009` NG-3) | **fica para depois** — NG-3 mantido; funding vira feature própria, com captura e `ADR-036` | reabrir NG-3 e acrescentar uma fase |
| `[Q-CAD-1]` cadência do coletor de OI | **60 s** (0,17% do teto REQUEST_WEIGHT; ~208 MB/ano `[INFERRED]`) | intervalo maior (o TF 1m perde candle próprio de OI) |
| Design da F1, com o Stitch em timeout (4 chamadas seguidas) | **julgar o pixel real**: F1 construída a partir de `DESIGN-LAYOUT.md` §6 (r2 APPROVED WITH CONDITIONS, 7.3); o gate `ux-ui-mastery` julga o screenshot Playwright do app real com dado real, e essa é a "render medida" que a condição da r2 pede | esperar o Stitch antes da F1 |

Consequência para os pesos de pane (`DESIGN-LAYOUT` §6: 34/11/15/9/9/9/9): funding fica fora (NG-3) e o CVD
não muda de forma (NG-5), então na F1 valem só os panes que existem, com os pesos renormalizados — como a
SPEC-009 já registra.
