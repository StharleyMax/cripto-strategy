# Fase `01` — A página diz a verdade

**Componente alvo:** `web` (itens `1.7`/`1.8` de alcançabilidade: `infra`) · **SPEC:** `SPEC-003` §3.1–§3.3, §5 (B1–B9) · **ADR:** `ADR-028` D1–D5 · **PRD:** `US-1`..`US-4`; `RF-1`..`RF-5`, `RF-10`, `RF-12`; `RN-2`..`RN-5`, `RN-7`; `CA-F1-1`..`CA-F1-16`
**Entra sempre** (M1). **Depende de:** nada. **Juízes:** `frontend-architect` (estrutura sob `frontend/src/`), `ui-designer` + `ux-ui-mastery` (forma dos estados e do estilo), `frontend-qa` (e2e), `quant-architect` (só se `D6.4` for tocada além do que `ADR-028` já co-assinou).

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 1.1 | `page.tsx` vira Server Component `async`; `PainelClient.tsx` (`"use client"`) recebe `{s1, s3, sourceState}` por props; `openedSeriesId` e o botão `abrir` **saem** (M3 default) | `RF-1`, `RF-3`, `RF-10` | `web` | não cria `route.ts`; não recalcula `janela_de_perda` |
| 1.2 | `import "server-only"` na primeira linha do módulo de transporte; devDependency `server-only`; erro tipado `TransportErrorKind` (mensagens em inglês); `cache: "no-store"` explícito; `etag` no resultado (`null` até `F2`) | `RF-1`, `RF-4` | `web` | não envia `If-None-Match` (é `F2`) |
| 1.3 | Portão ESLint `D5.17b` reescrito por diretiva (`ADR-028/D3`, forma (i) ou (ii)); `fingerprint-sync-boundary.test.ts` **reescrito** (`F-028-8`); `test:s1`/`test:app` com `--conditions=react-server` (`F-028-7`) | `RN-1` (instrumento) | `web` | não apaga o teste de fronteira; não muda o texto de `D6.4` |
| 1.4 | Estados: `loading.tsx`, `error.tsx` (genérico), `not-found.tsx`; `SourceState` renderizado pelo servidor com `data-fact` de §3.3; ramo vazio em S1/S3; marcador "sem fonte" nos 5 blocos; `fixtures.ts` fora do grafo de produção | `RF-2`, `RF-4` | `web` | não inventa microcopy — forma e texto vêm do gate (`R-E`) |
| 1.5 | Estilo: `layout.tsx` importa stylesheet global; pipeline conforme decisão do `frontend-architect` (`I-8`: Tailwind com os tokens do `DESIGN_SYSTEM.md`); fonte de ícone carregada | `RF-12` | `web` | não redesenha (`NG-5`); não redefine tokens |
| 1.6 | Higiene: `Filter.tsx` de bancada fora da rota; `metadata.title`; 1 `h1`; `/` → `3xx /painel`; filtro do catálogo filtra; rótulo `Janela de perda` (linha 8) sem tocar a coluna (linha 11) | `RF-10`, `CA-F1-14` | `web` | não renomeia `/painel` (`[Q1]`) |
| 1.7 | `.env.example` (raiz) com `APP_PORT`, `API_PREFIX`, `INGEST_HEALTH_STORE_PATH`, `INGEST_HEALTH_API_BASE_URL`; `frontend/README.md` ≤ 10 linhas de "como subir" | `RF-5` | `infra` | não implanta; nenhum valor secreto |
| 1.8 | `make api` (uvicorn com **access log ligado**) e `make e2e` (API de teste sobre store efêmero com ≥ 1 run + `next start` + `playwright test`, derruba tudo) — **fora** de `verify` (M5) | `RF-5`, `CA-F1-13` | `infra` | não altera `scripts/verify.sh` |
| 1.9 | Suíte e2e reescrita para a arquitetura: `02:9` deixa de perguntar "o browser chamou a API?" (que reprovaria a implementação correta — `PRD-003` §1.4) e passa a medir log de acesso da API + `data-fact`; specs 01–07 alinhados a §5; `facts.jsonl` por spec; `[Q11]` (15 × 16) explicado | `US-4`, `RN-7` | `web` | não entra em `verify` |

## DoD — comando, universo, e a coluna "servidor ausente"

Convenção: **de pé** = `make api` sobre store de teste com `R ≥ 1` runs e `G ≥ 0` gaps, `N` = pares `(source,endpoint)` distintos; **no chão** = API morta (`curl → 000`); **NEXT** = `next start` (nunca `next dev` para os DoD de erro — `ADR-028/D4`).

| DoD | comando (de pé ⇒ verde) | servidor ausente (⇒ o que TEM de acontecer) |
|---|---|---|
| **D1.1** estrutura | `grep -c '"use client"' frontend/src/app/painel/page.tsx` → **0**; `grep -c '"use client"' frontend/src/app/painel/PainelClient.tsx` → **1**; `find frontend/src/app -name route.ts \| wc -l` → **0**; `test -f frontend/src/app/painel/{loading,error}.tsx frontend/src/app/not-found.tsx` | n/a (estrutural) — `D1.3` cobre o comportamento |
| **D1.2** portão `D6.4` | `grep -c 'import "server-only"' frontend/src/features/s1-console/ingest-health-query.ts` → **1**; **morde:** probe `"use client"` efêmero com import de valor ⇒ `npm --prefix frontend run build` reprova nomeando `server-only`; **morde transitivo** (`F-028-1''`): probe `"use client"` → `.ts` sem diretiva → `fingerprint` ⇒ `build` reprova e `eslint` passa; **cala:** o mesmo import em `page.tsx` ⇒ `build` verde; ESLint (`F-028-3`): probe sem diretiva ⇒ `0 problems` (hoje `1 error`), com diretiva ⇒ `1 error`; `npm --prefix frontend run test:s1` verde (`F-028-7`, universo: `ls frontend/src/features/s1-console/*.test.ts \| wc -l` arquivos, hoje inclui `ingest-health-query-http.test.ts` 8/8); `git log --diff-filter=D -- frontend/src/features/s1-console/fingerprint-sync-boundary.test.ts` **vazio** (`F-028-8`) | n/a (build/lint) |
| **D1.3** a página lê a API | `curl -s localhost:3000/painel >/dev/null` ⇒ `grep -c 'GET .*/ingest-health' <access log>` **+1**; e2e `01`: `rows:<N>` com `N` = pares distintos do store; `ui_state:ok` | **0 `<tr>` de coletor**; `error_kind:connection_refused`; access log **não** incrementa; e2e `01`/`02` **reprovam**. Linha renderizada com API `000` ⇒ `:225` repetido |
| **D1.4** conteúdo varia | e2e `02`: `sha256(<main>)` de pé ≠ no chão; bytes ≠ (hoje `1318 = 1318`, `dc30fd31…`) | é a própria metade que morde |
| **D1.5** três causas sob `next start` | e2e contra `next start`: (a) env unset ⇒ `error_kind:missing_base_url`; (b) porta sem listener ⇒ `connection_refused`; (c) stub `500` ⇒ `non_2xx` + `status:500`; três `fact` **distintos** (`F-028-6`) | (b) **é** o servidor ausente; com API de pé, nenhum `error_kind` renderiza — se renderizar, reprova |
| **D1.6** loading e vazio | stub com `sleep 2` ⇒ `ui_state:loading` antes de `ui_state:ok`; store **0 runs** ⇒ `ui_state:empty`, 0 `<tr>`, 0 `error_kind` | no chão ⇒ `loading` dá lugar a `error_kind:connection_refused`, nunca a `ok`/`empty` — `empty` e `error` têm `fact` distinto |
| **D1.7** fixture fora, sem fonte | `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' \| grep -v '\.test\.' \| wc -l` → **0** (hoje 2); e2e: 5 blocos com `source:none`; `grep -c '1.6 GB\|99.8%' <main>` → **0**; `grep -rn 'NEXT_PUBLIC_INGEST' frontend/src \| wc -l` → **0**; `grep -rc INGEST_HEALTH_API_BASE_URL frontend/.next/static \| grep -v ':0' \| wc -l` → **0** após `build` | idem no chão — **declarado**: este DoD mede ausência de fixture, não comunicação (`R-B`) |
| **D1.8** CSS chega | e2e `01`: `stylesheets_applied ≥ 1` da app (href ∉ `__nextjs`); `glyph_font_families` ∌ `Times New Roman`; ícones **não** renderizam o nome do glifo; `find frontend -name '*.css' -not -path '*/node_modules/*' -not -path '*/.next/*' \| wc -l` ≥ 1 (hoje 0); veredito do gate `ux-ui-mastery` em `gates/F1-design.md` **concorda** | n/a — declarado |
| **D1.9** higiene e controles | `grep -rn 'features/panel/Filter' frontend/src/app \| wc -l` → **0**; e2e `01`: `document.title ≠ ""`, `h1_count = 1`; e2e `03`: `GET /` → `3xx` para `/painel`; `/nao-existe` ⇒ `not-found` pt-BR com link; e2e `04`: `catalog_rows_after_nonmatching_filter = 0`, casante ⇒ `1 ≤ n ≤ before`; `grep -c 'abrir' <main>` → **0** (M3) | e2e `04` não roda sem catálogo (pré-condição `D1.3`) — declarado |
| **D1.10** dev sobe por comando | `grep -c 'INGEST_HEALTH_API_BASE_URL\|APP_PORT\|API_PREFIX\|INGEST_HEALTH_STORE_PATH' .env.example` → **4**; `make -n api` imprime `python -m src.main`; `make -n e2e` imprime `playwright test` | `make api` com `INGEST_HEALTH_STORE_PATH` apontando a diretório inexistente: em `F1` **ainda sobe** (o boot que recusa é `F2`) — **declarado como lacuna que `F2` fecha** |
| **D1.11** a suíte discrimina | `make e2e` com API de pé ⇒ **todos** os specs de `F1` ✓ (universo: `grep -o 'test(' frontend/e2e/*.spec.ts \| wc -l`, hoje 15; `[Q11]` resolvido no relatório) | `make e2e` com API no chão ⇒ `D1.3`/`D1.4`/`D1.6` ✘ **e** `D1.5(b)` ✓ — veredito **diferente** do "de pé". Igual ⇒ a suíte não mede |
| **D1.12** portões do repositório | `make verify` verde (6 portões; saída em disco); `make lint-frontend` verde | n/a |

## Falsificador da fase

**Se `D1.3`, `D1.4` e `D1.11` derem o mesmo veredito com a API de pé e no chão, a fase repetiu `05_fatia_visivel.md:225`** — e não fecha. Segundo: se `D1.5` passar em `next dev` e não for re-executado em `next start`, a distinção de causa pode estar em `error.tsx` e a redação de produção a engoliu (`ADR-028/D4`, `[C3]`).

## O que esta fase NÃO faz

Não emite `ETag` nem envia `If-None-Match` · não muda a API (nem `/ready`, nem boot) · não cria rota nova · não implanta · não coloca e2e em `verify` · não decide microcopy fora do gate · não renomeia `/painel` · não toca `janela_de_perda` como coluna.
