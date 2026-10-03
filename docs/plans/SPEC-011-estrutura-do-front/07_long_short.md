# Fase `07` — O long/short na pasta dele

> **Tela:** idêntica (`CA-1`)
> **Componente:** `web`
> **Requisitos cobertos:** `RF-4` · `RF-5` · `RN-5` · `RN-6` · `RN-7` · `RN-12` · `CA-1` · `CA-2` · `CA-8` · `CA-9` · `CA-10`
> **Fronteira:** o molde da F4, aplicado ao long/short. Paralela a `05`, `06` e `08`, no máximo 3 por vez. **A pasta é `long-short/`, e o `kind` é `long_short`**
> (chave de `data-testid`, `[DOC: estudo §4.1]`)

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 7.1 | `app/symbol/indicators/long-short/`: o pane, `long-short-band.ts`, `ratio-format.ts`, `data.ts`, o `derive`, os testes | `web` | `RF-5` |
| 7.2 | `formatSpan` (o long/short o importa do OI hoje `[DOC: estudo §1.1]`) **não** é importado da pasta do OI: é genérico, e sobe para `chart/legend/` **na fatia que chegar primeiro** entre F5 e F7. A outra só reaponta o import | `web` | `RN-5` |
| 7.3 | `definition.ts` do long/short (`kind: "long_short"`, `single`, `pane`, `series-history`) | `web` | `RF-5` |
| 7.4 | A cópia do `derive` em `page.tsx` sai; a entrada em `catalog.ts` passa a importar `./long-short/definition`; os 2 testes que leem o fonte do pane passam a ler o arquivo novo | `web` | `RN-7`, `RN-12` |

## DoD verificável — comando e universo

1. `CA-8` com `diff` vazio (a subida de `formatSpan` é movimento: a linha só muda de arquivo) · `CA-10` · `CA-2` com a sonda em `indicators/long-short/` ·
   `CA-9` = `N_fact`.
2. **Nenhum import entre indicadores:** `local/indicator-isolation` verde com `long-short/` e `oi/` presentes. **Morde:** importar `formatSpan` de `../oi/` ⇒ P1
   reprova.
3. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `14`, `21`, `35`.
4. `make verify` verde. PR registra `wc -l SymbolClient.tsx` e `B`.
