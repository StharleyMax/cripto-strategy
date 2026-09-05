# Handoff — revisão de arquitetura: comunicação front↔back e validação do `/painel` (2026-09-04)

**Pedido do owner (literal, `[PREMISSA-OWNER: 2026-09-04]`):**
> "Estamos com esse problema. De uma revisada na nossa arquitetura. Comunicação entre front back,
> use o playwrigth e valide o front. Aplicação cheia de furos de comunicação e experiencia."

"Esse problema" = [`lacunas-leitura-api-painel.md`](lacunas-leitura-api-painel.md) (mesma pasta,
não versionado): os 6 recursos que `/painel` exibe e o que a API expõe para cada um.

## Estado do pipeline (`harness status`, 2026-09-04T22:48Z)
`plataforma-dados` em `BUILD_AUTHORIZED`, 9/9 fases com QA `APPROVED`, aguardando owner
`advance DONE`. Este trabalho **não** é fase daquele plano — é revisão que alimenta uma decisão
nova (provável `/pm` de feature filha). Nenhum agente aprova/avança estado aqui.

## Fatos medidos no loop principal (comando → resultado)
| fato | comando | resultado |
|---|---|---|
| páginas Next | `find frontend/src/app -name page.tsx` | **1**: `app/painel/page.tsx` |
| rotas declaradas | `grep ROUTES frontend/src/app/routes.ts` | **1**: `panel: "/painel"` |
| chamadas `fetch(`/`EventSource(` em `frontend/src` | `grep -rnoE '(fetch\|EventSource)\(' … \| wc -l` | **0** (só `fetchImpl` injetável em `ingest-health-query.ts:469`) |
| quem importa `ingest-health-query.ts` | `grep -rln` | 10 arquivos, **nenhum é `page.tsx`** — `/painel` importa `FIXTURE_CATALOG_ROWS`/`FIXTURE_DIVERGENCES` (`page.tsx:15,37`) |
| componentes `"use client"` | `grep -rl` | **1** (o próprio `page.tsx`) |
| rotas HTTP do backend | `grep -rnE '@(router\|app)\.(get\|post)' backend/src` | **1**: `GET /ingest-health` |
| CORS/SSE no backend | `grep -rn CORSMiddleware backend/src` | **0** ocorrências |
| entrypoint API | `backend/src/main/__init__.py:60` | `uvicorn src.main:app`; store em `INGEST_HEALTH_STORE_PATH` (default `data/md/ingest_health.sqlite3`) |
| store SQLite local | `find . -name '*.sqlite*'` (fora node_modules/mypy) | **não existe** — a API sobe sobre banco vazio/inexistente |
| API no ar | `curl localhost:8000/ingest-health` | `000` (fora do ar) |
| front no ar | `curl localhost:3000/painel` | `200`, Next dev já rodando (processo do owner) |
| base URL no front | `ingest-health-query.ts:463-484` | `INGEST_HEALTH_API_BASE_URL`, server-side, **nunca `NEXT_PUBLIC_*`** |
| Playwright | `npx --no-install playwright --version` em `frontend/` | **não instalado** (browsers chromium-1208..1234 já em `~/.cache/ms-playwright`) |
| testes de front hoje | `frontend/package.json:13-16` | só `node --test` unitário; sem e2e |
| `T-05.11` (scaffold Next) | `tasks.toml:812-817` | `done` — Playwright citado na descrição de `frontend-qa` como "quando `T-05.11` entrar", mas a task **não** o instalou |

## Documentos de referência (ler, não transcrever)
- `docs/adr/ADR-005-transporte-de-leitura.md` — D1 (2 rotas por classe de tempo), D5 (a porta de leitura é o backend; Next não é segunda verdade), D6 (envelope JSON tipado, ETag).
- `docs/adr/ADR-003-fronteira-charts-web.md` — fronteira `charts`↔`web`.
- `docs/adr/ADR-019-cliente-http-de-ingest-health-e-paridade-de-fingerprint.md`.
- `docs/adr/ADR-027-…escritor-unico.md` — lado escrita, já decidido.
- `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` §"Itens NOVOS" (`D5.13`/`D5.14`) e o falsificador em `:225` ("fechar com o servidor ausente repete o defeito").
- `docs/specs/SPEC-001-plataforma-dados.md` §3.6 (portas de leitura), §4.3 (transporte), §3.8 (locale).
- `docs/product/STITCH_CONTEXT.md`, `docs/product/DESIGN_SYSTEM.md` — fonte de verdade de design.
- `frontend/src/app/{history-transport,live-transport}.ts` — transporte desenhado no cliente, sem servidor.

## O que cada revisor entrega (R1: ≤15 linhas de resposta + relatório em `gates/`)
- **frontend-architect** → `docs/context/plataforma-dados/gates/REVISAO-FB-frontend-architect.md`
- **infra-architect** → `docs/context/plataforma-dados/gates/REVISAO-FB-infra-architect.md`
- **frontend-qa (Playwright)** → `docs/context/plataforma-dados/gates/REVISAO-FB-playwright.md` + screenshots em `docs/context/plataforma-dados/gates/REVISAO-FB-shots/`
- gate de UX (`ux-ui-mastery`) roda no loop principal **depois**, sobre o relatório e os screenshots.

Regras: todo número com comando e `n`; `[NÃO SEI]` explícito; nenhum `approve`/`advance`;
nenhum código de produção alterado; `package.json` do front só ganha `@playwright/test` como
devDependency; nada de `Co-Authored-By`; sem commit (o owner commita).
