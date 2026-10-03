# Fase `06` — A liquidação na pasta dela

> **Tela:** idêntica (`CA-1`)
> **Componente:** `web`
> **Requisitos cobertos:** `RF-4` · `RF-5` · `RN-6` · `RN-7` · `RN-12` · `CA-1` · `CA-2` · `CA-8` · `CA-9` · `CA-10`
> **Fronteira:** o molde da F4, aplicado à liquidação. Paralela a `05`, `07` e `08`, no máximo 3 por vez

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 6.1 | `app/symbol/indicators/liquidation/`: o pane, `liquidation-pane-form.ts`, `liquidation-legend-swatch.ts`, `data.ts`, o `derive` (as 2 séries, long e short), os testes | `web` | `RF-5` |
| 6.2 | `definition.ts` da liquidação (`kind: "liquidation"`, `single`, `pane`, `series-history` com 2 séries) | `web` | `RF-5` |
| 6.3 | A cópia do `derive` da liquidação em `page.tsx` sai; a entrada em `catalog.ts` passa a importar `./liquidation/definition` | `web` | `RN-7` |
| 6.4 | Os 2 testes que leem o fonte do pane `[DOC: estudo §6.2]` passam a ler o arquivo novo | `web` | `RN-12` |

## DoD verificável — comando e universo

1. `CA-8` com `diff` vazio · `CA-10` · `CA-2` com a sonda em `indicators/liquidation/` · `CA-9` = `N_fact`.
2. **As ablações da liquidação continuam vivas:** `?e2eSwapLiquidationSides=1` e `?e2eLiquidationLogScale=1` mudam o que as specs `31`–`34` medem. **Morde:** a
   leitura se perder no movimento ⇒ o braço de ablação desenha o normal ⇒ a spec reprova.
3. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `13`, `31`, `32`, `33`, `34`, `35`.
4. `make verify` verde. PR registra `wc -l SymbolClient.tsx` e `B`.
