# Fase `08` — O volume vira overlay do preço, e a faixa vira pedido

> **Tela:** idêntica (`CA-1`). Com o volume ligado, a faixa pedida é a mesma reserva de hoje
> **Componentes:** `web` (overlay, `chart/price/`) · `charts` (a conta da margem com pedidos, `ADR-003/FR-2`)
> **Requisitos cobertos:** `RF-5` · `RF-12` · `CA-1` · `CA-10` (global = 0) · `CA-11` · `CA-15`
> **Fronteira:** **não é fatia de movimento**: é a única de F5–F8 que edita o núcleo (`chart/**`). Declara o diff. Paralela a `05`–`07`, no máximo 3 por vez,
> e **um editor de `chart/**` por vez**. Toca o barrel `charts/index.ts`, que o item `1.6` de `indicadores-smc` também toca (1 linha, `SPEC-011 §9`)

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 8.1 | `charts/pane-stack-layout.ts`: a margem de escala do pane 0 passa a receber a soma dos pedidos de faixa (`SPEC-011 §4.3`); exportada pelo barrel | `charts` | `RF-12` |
| 8.2 | `PricePane` e `ohlc.ts` para `chart/price/`; o pane 0 soma os pedidos dos overlays ativos e não calcula margem | `web` | `RF-12` |
| 8.3 | `app/symbol/indicators/volume/`: `VolumeOverlay.tsx`, `data.ts`, o `derive`, `definition.ts` (`kind: "volume"`, `single`, `placement: overlay` com o pedido de faixa de hoje) e os testes do volume (5 leem o fonte `[DOC: estudo §6.2]`) | `web` | `RF-5` |
| 8.4 | O volume sai do binding do `PricePane` e entra pelo registrar como overlay; a entrada em `catalog.ts` passa a importar `./volume/definition`. `VolumeSlot` deixa de ser importado pelos outros indicadores: é tipo genérico e mora no núcleo | `web` | `RF-12`, `RN-5` |

## DoD verificável — comando e universo

1. **Geometria:** unitário em `charts`: a soma vazia dá a margem de um pane sem reserva; o pedido do volume dá exatamente a margem de hoje. **Morde:** somar em
   vez de usar o pedido ⇒ a margem muda ⇒ reprova.
2. **`CA-11` com o volume:** o unitário da F2, agora com o `VolumeOverlay`: 5 ciclos deixam `panes()[0].getSeries().length` no inicial.
3. **`CA-10` global = 0:** o grep do estudo §1.3 dá **0** linha comum entre `page.tsx` e `panel-assembly.ts`.
4. **`CA-15`:** `B ≤ B0 × 1,04` (`SPEC-011 §7.4`).
5. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `09`, `15`, `28`, `29`, `30`, `08` `[DOC: estudo §5]`.
6. `make verify` verde. PR registra o diff, `wc -l SymbolClient.tsx` e `B`.
