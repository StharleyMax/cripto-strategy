# Fase `09` — A seleção: o host monta o que o catálogo e a seleção ativam

> **Tela:** idêntica com a seleção padrão (os 5, `O-1`). Sem controle na tela (`NG-1`)
> **Componente:** `web`
> **Requisitos cobertos:** `RF-8` · `RF-9` · `RF-10` · `RN-1` · `RN-2` · `RN-3` · `RN-4` · `RN-10` · `RNF-5` · `CA-1` · `CA-5` · `CA-7` · `CA-11` · `CA-12` ·
> `CA-13` · `CA-15` · `Q-1` (`SPEC-011 §6.4`) · `Q-2` (`SPEC-011 §6.5`)
> **Fronteira:** **o pager busca o catálogo inteiro** (`SPEC-011 §6.5`). Nenhum corte de pedido aqui. Declara o diff

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 9.1 | `indicators/catalog.ts` (nascido na F3) fica completo: `INDICATOR_CATALOG` na ordem de `SPEC-011 §6.1`, a união `IndicatorKind` derivada dele; absorve `F1_PANE_ORDER` e as invariantes (i)–(v) de `pane-registry.ts` | `web` | `RF-8`, `RN-2` |
| 9.2 | `indicators/selection/`: reducer puro (`add`, `remove`, `reset`, e as recusas de `SPEC-011 §6.2`) e o provider | `web` | `RF-9`, `RN-3`, `RN-4` |
| 9.3 | `app/symbol/layout.tsx`, a primeira layout do segmento, monta o provider **acima** do `key` que remonta `SymbolClient` | `web` | `RF-9` |
| 9.4 | `SymbolClient.tsx` compõe chrome, host e `active.map(View)`. `<ChartHost key={paneSetSignature(active)}>` (`SPEC-011 §4.5`). O pager continua recebendo o **catálogo inteiro**, não o ativo (`SPEC-011 §6.5`) | `web` | `RF-10`, `CA-5` |
| 9.5 | O mount do host aplica `initialLogicalRange` só no primeiro mount de um `AxisSyncStore`, e `currentRange` em todo mount seguinte (`SPEC-011 §6.3`). `performance.mark` em volta do mount, em `data-host-mount-ms`; `data-pane0-series-count` na raiz do host | `web` | `RN-10`, `RNF-5` |
| 9.6 | `indicators/selection/e2e-handle.ts`: `window.__e2eIndicatorSelection`, só com `?e2eIndicatorSelection=1` (`SPEC-011 §6.4`) | `web` | `Q-1` |

## DoD verificável — comando e universo

1. **`CA-13`:** unitário do reducer: o estado inicial tem as 5 instâncias, na ordem do catálogo. As recusas de `SPEC-011 §6.2` devolvem a **mesma referência**.
   **Morde:** tirar um do *seed* ⇒ o unitário e o `e2e/23` reprovam.
2. **`CA-12`, spec nova com o handle:** arrastar a vista; `remove("oi")` ⇒ as raízes `[data-pane-legend]` vão de 5 para 4; `add("oi")` ⇒ voltam a 5, na ordem
   do `e2e/23`; `data-visible-logical-from`/`-to` a ±1 barra do valor antes de tirar. **Morde:** o mount aplicar sempre `initialLogicalRange` ⇒ a vista volta
   ao enquadramento inicial ⇒ reprova.
3. **`SPEC-011 §6.5`, na mesma spec:** com o OI fora, uma página de história faz **10** pedidos; religar o OI mostra pontos na janela carregada **sem pedido
   novo**. **Morde:** filtrar o pager pela seleção ⇒ o OI religado volta sem pontos ⇒ reprova.
4. **`CA-11` real:** 5 ciclos de `remove("volume")`/`add("volume")` ⇒ `data-pane0-series-count` no inicial.
5. **Handle** (`SPEC-011 §6.4`): sem o parâmetro, `window.__e2eIndicatorSelection === undefined`; `add("oi")` com o OI ativo devolve `false`.
6. **`CA-7`:** (a) unitário: um `IndicatorDefinition` sintético, num catálogo de teste, é montado e desmontado pelo host. (b) ensaio numa branch descartável:
   `indicators/probe/` + 1 linha em `catalog.ts` ⇒ `git diff --name-only` lista **só** esses dois caminhos, e `make lint-frontend` e `make test-frontend` ficam
   verdes. **Morde:** um `switch` sobre `kind` no host ⇒ (a) reprova; `IndicatorKind` em `contract.ts` ⇒ (b) lista `contract.ts` ⇒ reprova.
7. **`CA-5`:** `wc -l frontend/src/app/symbol/SymbolClient.tsx` ≤ **350**. **`CA-15`:** `B ≤ B0 × 1,04`. **`RNF-5`:** `data-host-mount-ms` publicado e o valor
   gravado na PR, sem limiar (`Q-5`).
8. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `22`, `23`, `24` e a spec nova.
9. `make verify` verde.
