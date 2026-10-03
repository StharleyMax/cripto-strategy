# Fase `04` — O CVD como piloto do molde

> **Tela:** idêntica (`CA-1`)
> **Componente:** `web`
> **Requisitos cobertos:** `RF-4` · `RF-5` · `RN-6` · `RN-7` · `RN-12` · `CA-1` · `CA-2` · `CA-8` · `CA-9` · `CA-10`
> **Fronteira:** movimento como está, mais a unificação **declarada** do `derive` do CVD. É a fatia que fixa o molde que F5–F8 repetem

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 4.1 | `app/symbol/indicators/cvd/`: o pane e as constantes (de `SymbolClient.tsx`), `data.ts` (o trecho do CVD de `view-model.ts`), o `derive` (a cópia de `panel-assembly.ts`), e os testes do CVD | `web` | `RF-5` |
| 4.2 | `definition.ts` do CVD: `kind: "cvd"`, `category: "indicator"`, `cardinality: "single"`, `placement: pane`, `data: series-history` | `web` | `RF-5` |
| 4.3 | A cópia do `derive` do CVD em `page.tsx` sai. A entrada do CVD em `catalog.ts` passa a importar `./cvd/definition` (1 linha), e `page.tsx` e o pager chamam o `derive` da pasta pela tabela | `web` | `RN-7`, `CA-10` |
| 4.4 | Os testes que leem o fonte do pane do CVD (1 `[DOC: estudo §6.2]`) passam a ler o arquivo novo, na pasta | `web` | `RN-12` |

## DoD verificável — comando e universo

1. **Movimento** (`CA-8`, universo de `SPEC-011 §7.2`: `definition.ts` fora, `page.tsx` fora): `diff` vazio. **Morde:** uma linha de lógica alterada aparece.
2. **`derive` único** (`CA-10`): unitário, o mesmo resultado chamado como SSR e como pager. O grep global **não sobe** frente à F3. **Morde:** reintroduzir a
   derivação em `page.tsx` ⇒ o grep sobe ⇒ reprova.
3. **Isolamento** (`CA-2`): a sonda P1 de `SPEC-011 §5.3`, plantada em `indicators/cvd/`, reprova.
4. **Fatos** (`CA-9`): `N_fact`. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `10`, `23`, `24`, `35`.
5. `make verify` verde. PR registra `wc -l SymbolClient.tsx` e `B`.
