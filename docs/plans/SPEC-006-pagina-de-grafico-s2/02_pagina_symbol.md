# Fase 02 — A página `/symbol`: barrel, exceção ESLint escopada, montagem da S2-mínima

**Componente:** `web` (página), `charts` (barrel novo, nenhuma geometria nova) · **Depende de:**
`01` (as duas rotas respondendo) · **Bloqueia:** nada (paralelo a `03`, mas `03` fecha por último)
**Decisão que fecha:** [`ADR-034/D8`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md)
**Juiz adicional:** `ux-ui-mastery` (gate de design — a tela já é a aprovada no Stitch, `S2 Rev. B`,
`STITCH_CONTEXT.md:5`; esta fase não desenha, monta o que já foi aprovado)

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 2.1 | `frontend/src/charts/index.ts` — barrel único: execução headless S2, composição de painéis, adaptador lightweight, tokens de cor, tipos de política de ausência. Nenhuma função nova de geometria — só reexportação | `ADR-034/D8` | `charts` |
| 2.2 | Bloco de ESLint novo em `frontend/eslint.config.mjs`, `files: ["src/app/symbol/**/*.{ts,tsx,mts,cts}"]`, DEPOIS do bloco `web` existente; `no-restricted-imports.patterns[].group` com as 3 negações (`!**/charts/index`, `.ts`, `.tsx`); os 3 seletores de `no-restricted-syntax` com o regex negativo | `ADR-034/D8` | `web` (config) |
| 2.3 | `frontend/src/charts/eslint-boundary.test.ts` estendido com os 3 casos (morde-1 import profundo dentro de `symbol`; morde-2 vazamento para `console`; cala barrel dentro de `symbol`) | `ADR-034/D8` | `charts` (teste) |
| 2.4 | `frontend/src/app/symbol/page.tsx` (Server Component, `ADR-005/D5`) — monta BTCUSDT, Preço+OI+CVD (delta e acumulado), 4 dias, consumindo `history-transport.ts`/`live-transport.ts` já existentes | `RF-4`; `US-4` | `web` |
| 2.5 | Ausência de OI/CVD renderizada como ausência (herda `D5.2`/`D5.3` do motor `charts`, agora exercitado com dado real de `01`) | `US-5`; `CA-F2-3` | `web` |

## DoD

| id | critério | comando | morde |
|---|---|---|---|
| CA-F2-1 | página importa só o barrel | `grep -n 'from.*charts/index' frontend/src/app/symbol/page.tsx` → ≥ 1; `grep -n 'from.*charts/s2-' frontend/src/app/symbol/page.tsx` → 0 | import profundo ⇒ reprova |
| CA-F2-2 | consome os transports existentes | `grep -n 'history-transport\|live-transport' frontend/src/app/symbol/page.tsx` → ≥ 1 cada | fetch direto/hardcoded ⇒ reprova |
| CA-F2-3 | ausência lida como ausência | render com resposta real de `01` contendo `absence:"SEM_PONTO"` → painel mostra estado de ausência, não `0` | `0` renderizado ⇒ reprova |
| CA-F2-4 | boundary ESLint — 3 casos juntos | tabela de `ADR-034/D8` rodada em `eslint-boundary.test.ts` | qualquer um dos 3 diferente do esperado ⇒ reprova |
| CA-F2-5 | eixo aguenta a carga real (`RNF-2`, herdado, `[GAP G4]`) | coordenadas X vs `event_time` reais, janela de 4 dias | tolerância > 0,5 px ⇒ reprova, escalado como risco técnico maior |

## Non-goals desta fase

Não constrói geometria nova em `charts` (os 32 módulos `s2-*` já existem) · não afrouxa o bloco
`web` original do ESLint para além de `src/app/symbol/**` · não implementa timeframe selector.

## Falsificador da fase

Se a página `symbol` passar no `eslint` importando `charts/s2-cvd` diretamente (import profundo),
a exceção vazou além do barrel — `ADR-034/D8` está violada mesmo com `CA-F2-1` "aparentemente"
verde se o teste morde-1 não rodar de verdade.
