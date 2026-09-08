# Fase 03 — `/painel` migra para `/console`, com bookmark tratado

**Componente:** `web` · **Depende de:** independente de `01`/`02` — pode rodar em paralelo, fecha
por último (`I-3` do `PRD-006`, para não competir por revisão com a rota nova)
**Decisões que fecham:** [`ADR-034/D2`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md)
(nome), `D3` (redirect 308)

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 3.1 | `frontend/src/app/painel/` renomeia para `frontend/src/app/console/` (4-5 arquivos: `page.tsx`, `PainelClient.tsx`→`ConsoleClient.tsx`, `error.tsx`, `loading.tsx`, `source-state.ts`) | `ADR-034/D2` | `web` |
| 3.2 | `frontend/src/app/routes.ts`: `ROUTES.panel` (`"/painel"`) → `"/console"` — considerar renomear a chave (`panel`→`console`) para não deixar identificador em português órfão | `RF-5` | `web` |
| 3.3 | `frontend/src/app/not-found.tsx` e qualquer outro referente a `ROUTES.panel`/`"/painel"` atualizado | `RF-5` | `web` |
| 3.4 | `frontend/e2e/01-painel-carrega.spec.ts` migrado para a rota `/console` (considerar renomear o arquivo) | `RF-5` | `web` (teste) |
| 3.5 | `frontend/next.config.ts`: `redirects()` ganha `{ source: "/painel", destination: "/console", permanent: true }` | `ADR-034/D3`; `RF-6` | `web` |

## DoD

| id | critério | comando | morde |
|---|---|---|---|
| CA-F3-1 | zero segmento `/painel` no código-fonte | `git ls-tree -r --name-only HEAD \| grep -E '^(backend/src\|backend/tests\|frontend/src)/' \| awk -F/ '{for(i=1;i<NF;i++) print $i}' \| sort -u \| grep -vxE 'sentimento\|charts\|convergencia\|backtest\|web\|docs\|infra'` → sem `painel` (falsificador de `CLAUDE.md`) | `painel` presente ⇒ migração incompleta |
| CA-F3-2 | `ROUTES.panel`/chave aponta para `/console` | `grep -n 'panel:\|console:' frontend/src/app/routes.ts` → valor `"/console"` | valor antigo ⇒ reprova |
| CA-F3-3 | bookmark tratado | `curl -sD - <base>/painel` → `Location: /console`, status `308` | ausência de `Location`/status errado ⇒ reprova `RF-6` |
| CA-F3-4 | e2e aponta para a rota nova | `grep -rn '/painel' frontend/e2e` → 0 ocorrências vivas | ocorrência viva ⇒ reprova |

## Non-goals desta fase

Não muda o alvo lógico de `/` (continua redirecionando para o sucessor de `/painel`, agora
`/console`, não para `/symbol` — `NG-8` do PRD) · não renomeia nenhum outro diretório/identificador
fora de `/painel` (`NG-8` do PRD, gatilho desta rodada é só essa rota).

## Falsificador da fase

Se `curl <base>/painel` devolver `404` genérico em vez de `308`+`Location`, ou se devolver `200`
servindo conteúdo antigo (cache de build não invalidado), o bookmark quebrou exatamente do jeito
que `US-8` existe para proibir.
