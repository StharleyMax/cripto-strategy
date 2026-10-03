# Fase `01` — O núcleo sai do arquivo

> **Tela:** idêntica (`CA-1`)
> **Componentes:** `web` · `docs` (o `frontend/README.md`, que a F0 não podia tocar)
> **Requisitos cobertos:** `RF-2` · `RN-6` · `RN-11` · `RN-12` · `CA-1` · `CA-8` · `CA-9`
> **Fronteira:** **movimento como está.** Nenhuma lógica muda. Começa só com a fase `05` de `paineis-de-fluxo` em `origin/master` (`SPEC-011 §9`)

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 1.0 | **Números de base** no commit-base (`SPEC-011 §8`): `L0`, `N_spec`, `N_fact`, `B0`. Gravados na PR | `web` | `G-I` |
| 1.1 | Host, registrar, `PaneLayer`, `pane-stack` para `app/symbol/chart/host/`; legenda para `chart/legend/`; marcas de ausência e cobertura para `chart/marks/`; `axis-sync*`, `supported-timeframes`, `timeframe-window` para `chart/axis/`; pager e clientes de história para `chart/history/` (árvore do estudo §4.1) | `web` | `RF-2` |
| 1.2 | `TimeframeBar`, `LiveRow` (+ `useLiveReadout`), `ChromeModeStamp` e o rodapé de atribuição para `app/symbol/chrome/` | `web` | `RF-2` |
| 1.3 | Os testes que leem o fonte de um bloco movido mudam de caminho **nesta** fatia e vão para a pasta do dono (`RN-12`; 10 deles são do núcleo `[DOC: estudo §6.2]`) | `web` | `RN-12` |
| 1.4 | `frontend/README.md`: a árvore nova e a regra de isolamento | `docs` | — |

## DoD verificável — comando e universo

1. **Condição de entrada:** `git merge-base --is-ancestor <head da wave mergeada> origin/master` e `T-05.1`, `T-05.4`, `T-05.5` com `status = "done"` no
   `tasks.toml` de `paineis-de-fluxo` em `origin/master`.
2. **Movimento** (`CA-8`, universo de `SPEC-011 §7.2`): o `diff` do multiconjunto fica **vazio**. **Morde:** qualquer linha de lógica alterada aparece no `diff`.
3. **Tela** (`CA-1`): `make e2e` inteiro (`N_spec` specs) verde, sem `M`/`D` em spec antiga. As que medem primeiro: `22`, `23`, `24`, `25`, `16` `[DOC: estudo §5]`.
4. **Fatos** (`CA-9`): o varredor da F0 dá `N_fact`. **Morde:** um `data-fact` perdido no movimento baixa a contagem.
5. **Isolamento:** `local/indicator-isolation` verde sobre a árvore nova (nenhum `chart/**` importa `indicators/**`).
6. `make verify` verde. PR registra `wc -l SymbolClient.tsx` e `B` (|ΔB| ≤ 1% esperado, `SPEC-011 §7.4`).
