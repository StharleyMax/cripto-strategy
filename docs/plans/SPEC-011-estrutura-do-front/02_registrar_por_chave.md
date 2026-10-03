# Fase `02` — O registrar por chave, com `unmount` e `refeed`

> **Tela:** idêntica (`CA-1`)
> **Componente:** `web`
> **Requisitos cobertos:** `RF-3` · `CA-1` · `CA-11` · `G-E` (`refeed`, emenda `E-1`)
> **Fronteira:** só `chart/host/`. **Declara o diff** (não é fatia de movimento). Os 5 panes passam a registrar pela chave nova, com o mesmo resultado

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 2.1 | Registrar chaveado por `instanceKey` (string), substituindo o `Map<paneIndex>`; registrar uma chave repetida desmonta a anterior (`SPEC-011 §4.2`) | `web` | `RF-3` |
| 2.2 | `paneIndex` derivado no mount: 0 para `overlay`, `1 +` a posição entre os panes ativos na ordem de `F1_PANE_ORDER` (o catálogo só chega na F9) | `web` | `RF-3` |
| 2.3 | `unmount(chart, handles)` obrigatório no tipo, chamado pelo host ao desregistrar e ao desmontar | `web` | `RF-3`, `CA-11` |
| 2.4 | `refeed(instanceKey)` exposto pelo host: roda `apply` daquela chave fora de página, pelo mesmo laço de `setData` | `web` | `G-E` |

## DoD verificável — comando e universo

1. **`CA-11`, unitário com gráfico real sob `jsdom`** (o padrão de `price-candle.test.ts`): um overlay **sintético** declarado no teste, 5 ciclos de
   registrar/desregistrar ⇒ `chart.panes()[0].getSeries().length` igual ao inicial. **Morde:** um `unmount` vazio ⇒ a contagem sobe 5 ⇒ reprova.
2. **Índice derivado:** unitário com 4 panes sintéticos e um deles fora do conjunto ⇒ os índices são `1, 2, 3` na ordem dada. **Morde:** índice por posição de
   registro ⇒ a ordem invertida do registro inverte os índices ⇒ reprova.
3. **`refeed`:** unitário com um indicador sintético de `indicator-endpoint`: `refeed(key)` leva a série dele ao `setData` do host uma vez, e não toca as
   outras. **Morde:** `refeed` que reaplica todos ⇒ as outras séries recebem `setData` ⇒ reprova.
4. **Tela** (`CA-1`): `make e2e` verde, sem `M`/`D` em spec antiga. As que medem primeiro: `22`, `23`, `24`, `31`, `32` `[DOC: estudo §5]`.
5. `make verify` verde. PR registra o diff, `wc -l SymbolClient.tsx` e `B`.
