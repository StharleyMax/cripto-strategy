# Fase `03` — O dado por tabela, e a caracterização SSR = pager

> **Tela:** idêntica (`CA-1`). **Os mesmos 10 pedidos** por página de história `[DOC: ADR-050/D5]`
> **Componente:** `web`
> **Requisitos cobertos:** `RF-4` · `RN-7` · `CA-1` · `CA-10` (caracterização, `G-C`, `G-D`)
> **Fronteira:** `[symbol]/page.tsx`, `chart/history/use-history-pager.ts` e `panel-assembly.ts` passam a iterar uma tabela de `series` + `derive` por indicador.
> **A derivação ainda não é unificada aqui**: cada indicador é unificado na fatia que o move (F4–F8). **Declara o diff**

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 3.1 | **Antes de qualquer outra linha:** teste de caracterização por indicador (os 5). A derivação de `page.tsx` e a de `panel-assembly.ts`, chamadas sobre as mesmas linhas, dão o mesmo resultado (`SPEC-011 §7.3`) | `web` | `CA-10`, `G-C` |
| 3.2 | **`app/symbol/indicators/catalog.ts` nasce aqui, como a tabela**: para cada indicador, as séries que ele pede (o predicado que hoje está em `page.tsx`) e a função que deriva, apontando para o código **onde ele está hoje**. F4–F8 trocam a entrada de cada um pelo `./<kind>/definition` | `web` | `RF-4`, `RF-8` |
| 3.2b | O pager e `panel-assembly.ts` (núcleo) recebem a tabela **por parâmetro**, de `SymbolClient.tsx`; `page.tsx` a lê do catálogo. **Nenhum arquivo de `chart/**` importa o catálogo** (P2, `SPEC-011 §3`) | `web` | `RF-4`, `G-R` |
| 3.3 | Chaves e linhas viram `Record` por slot. As asserções de forma de `panel-assembly.test.ts` mudam e a PR declara isso `[DOC: estudo §6.2]` | `web` | `RF-4` |
| 3.4 | Os testes que leem o fonte de `page.tsx` com regex de predicado viram teste de valor sobre a tabela: o predicado do OI casa a chave do catálogo e recusa as vizinhas | `web` | `RN-12` |

## DoD verificável — comando e universo

1. **Caracterização** (3.1): 5 casos, um por indicador, verdes **antes** de 3.2. **Se algum der diferente**, a fatia para: é defeito de hoje, e vai para o owner
   como mudança de comportamento (`SPEC-011 §12`, `Q-8`). **Morde:** trocar a janela de uma das duas derivações no teste ⇒ o caso reprova.
2. **Pedidos:** spec nova conta os pedidos de história por página com `page.on('request')` ⇒ **10**. **Morde:** a tabela esquecer uma série ⇒ 9 ⇒ reprova.
3. **Inversão:** `local/indicator-isolation` verde (P2): nenhum `chart/**` importa `indicators/catalog.ts`. **Morde:** o pager importar o catálogo ⇒ P2 reprova.
4. **`D_3`:** o grep de duplicação do estudo §1.3 registrado na PR (`SPEC-011 §8`).
5. **Tela** (`CA-1`): `make e2e` verde. As que medem primeiro: `18`, `20`, `21`, `22`, `26`, `39` `[DOC: estudo §5]`.
6. `make verify` verde. PR registra o diff, `wc -l SymbolClient.tsx` e `B`.
