# ADR-028 — Leitura do `/painel` em Server Component, `server-only` no transporte, e o portão de `ADR-005/D6.4` medido pela propriedade (não pelo proxy)

**Data:** 2026-09-04 · **Status:** proposto (nasce com `SPEC-003` em `SPEC_DRAFT`; vira `aceito` no `approve spec` do owner) · **SPEC:** [`SPEC-003`](../specs/SPEC-003-camada-de-leitura-do-painel.md) §3.1–§3.3 · **PRD:** [`PRD-003`](../specs/PRD-003-camada-de-leitura-do-painel.md) `RN-1`, `RF-1`..`RF-4`, `CA-F1-1`..`CA-F1-9`
**Fase:** `F1` do plano [`SPEC-003`](../plans/SPEC-003-camada-de-leitura-do-painel/01_pagina_diz_a_verdade.md) · **Componente alvo:** `web` (o instrumento é do `web`; a propriedade que ele mede é do `sentimento`, dona `quant-architect` — por isso a co-assinatura ao fim)
**Decisão de origem, que esta ADR FORMALIZA e não reabre:** `REVISAO-FB-frontend-architect.md` §3 (2026-09-04, três alternativas com custo, falsificador em 3 casos). O `PRD-003` a adotou como `RF-1`; `RN-1` exige que ela nasça em ADR co-assinada.
**Rev de ancoragem de TODA medição:** `master@c8e7193`.

## Contexto — a fiação não existe porque nenhum ponto de chamada é legal hoje

Quatro fatos, todos re-medidos nesta árvore (`SPEC-003` §0.1):

1. `frontend/src/app/painel/page.tsx` é `"use client"` (`grep -c '"use client"' … → 1`) e importa **2** módulos `fixtures.ts` por valor (`:12,:15`). **Zero** import de `ingest-health-query.ts`.
2. `ADR-019/D4` manda a URL base viver em `INGEST_HEALTH_API_BASE_URL` (nunca `NEXT_PUBLIC_*`) e diz *"jamais `"use client"`"* — ou seja, o único lugar em que o transporte pode rodar é do lado do servidor do Next.
3. `ADR-005/D5` (`[DECISÃO-OWNER: 2026-09-03]`, `docs/decisoes-do-owner.md` §`A4`) recusa o Route Handler BFF: *"reabre a porta de segunda verdade… o schema passa a existir em dois lugares"*.
4. O portão ESLint `D5.17b` (`frontend/eslint.config.mjs:273-292`) reprova import de **valor** de `ingest-health-query.ts` em **qualquer** arquivo não-teste sob `src/**` — inclusive um Server Component. Probe medido: `✖ 1 problem` em arquivo **sem** `"use client"` `[MEDIDO: FB-frontend-architect §2.3]`.

(2) ∧ (3) ∧ (4) ⇒ **conjunto vazio de pontos legais de chamada.** O `/painel` roda sobre fixture não por escolha, mas porque a única fiação possível está proibida por um portão que mede o **proxy** (*"algum import de valor"*) e não a **propriedade** (*"o módulo entrou no caminho de render do browser"*, `ADR-005/D6.4`).

**A propriedade de `D6.4`, literal:** *"A canonicalização e o `fingerprint` são código de Python e de Node — NUNCA do caminho de render do browser"*, porque `createHash` é síncrono e `crypto.subtle.digest` é `Promise` — se `fingerprint` for para o browser, o falsificador de `ADR-008/DoD-2` vira assíncrono. **Um Server Component é Node.** Ele importar `fingerprint()` por valor **satisfaz** `D6.4`; o portão de hoje o reprova mesmo assim. O instrumento mede a coisa errada, e esta ADR o troca.

## Decisão

### D1 · A leitura acontece em um Server Component; o estado de UI vive em um Client Component separado

`frontend/src/app/painel/page.tsx` deixa de ser `"use client"` e vira **`async` Server Component**: chama `fetchIngestHealthProjectionViaHttp()` **uma vez por render** (`RF-1`), monta os view-models (objetos serializáveis — já são) e os entrega por props a `frontend/src/app/painel/PainelClient.tsx` (`"use client"`), que guarda os `useState` de hoje (`page.tsx:28-29`). O **mesmo** envelope alimenta S1 (`CollectorRow` mínimo) e S3 (`GapMarkerRow`) — `RF-3`.

O Next **não** define schema, **não** faz SQL, **não** re-emite JSON: `find frontend/src/app -name route.ts | wc -l` continua **0**. Isto é o que separa (A) de um BFF disfarçado: o Server Component consome o envelope de `ADR-005/D6.1` como qualquer cliente e produz HTML — o schema continua em **um** lugar (`to_envelope()` + `parseIngestHealthEnvelope`).

### D2 · O módulo de transporte declara `import "server-only"` — e ESTE é o portão de `D6.4`

`frontend/src/features/s1-console/ingest-health-query.ts` ganha, na primeira linha, `import "server-only"` (devDependency `server-only`, **0 hoje** — `frontend/package.json` não a lista `[MEDIDO 2026-09-04]`). Efeito: `next build` **reprova** quando o módulo entra no grafo de qualquer componente cliente — **transitivamente**, pelo grafo real de módulos, não por regex de arquivo. É exatamente *"caminho de render do browser"*: a propriedade de `D6.4`, medida onde ela vive (no grafo), pelo instrumento que constrói o bundle.

### D3 · O portão ESLint `D5.17b` é REESCRITO para morder só em arquivo `"use client"` — e passa a ser sinal rápido, não juiz

A **propriedade** que o novo portão ESLint mede: *import de VALOR de `ingest-health-query.ts` em arquivo cuja primeira instrução é a diretiva `"use client"` ⇒ reprova; o mesmo import em arquivo sem a diretiva ⇒ passa; `import type` passa em qualquer lugar.*

O **mecanismo** fica com quem implementa (`SPEC-003` §3.2 declara as duas formas admitidas): (i) regra local em `eslint.config.mjs` que inspeciona a diretiva do arquivo, ou (ii) convenção de nome `*.client.tsx` + `files` por glob. A propriedade é a mesma nas duas; o falsificador `F-028-3` abaixo vale para as duas. `[NÃO SEI]` de `FB-frontend-architect §3` (*"qual forma o sucessor de `T-05.16` escolhe"*) **fica resolvido como delegação declarada**, não como escolha minha — o ESLint é o sinal barato de `make lint-frontend`; **quem decide é `next build` com `server-only` (`D2`)**, porque só ele vê o grafo transitivo (um `"use client"` que importa `view-model.ts` que importa `fingerprint` por valor passa em qualquer regra por arquivo e reprova em `D2`).

### D4 · O erro de transporte é RENDERIZADO pelo Server Component a partir de um discriminante tipado; `error.tsx` é rede de última instância

O módulo de transporte expõe um erro com discriminante fechado — `kind ∈ {missing_base_url, connection_refused, non_2xx, malformed_envelope}` (forma em `SPEC-003` §3.2). O Server Component **captura** esse erro e renderiza o estado de erro correspondente (microcopy pt-BR pelo `design_gate`), com `data-fact="error_kind:<kind>"` para o e2e.

**Por que não simplesmente lançar e deixar `error.tsx` distinguir:** `error.tsx` é Client Component e, em build de produção, o Next **redige a mensagem** do erro lançado no servidor — o boundary recebe só `digest`, não `message` `[INFERRED: comportamento documentado do App Router para erros de servidor em produção; não medido nesta árvore porque não há `error.tsx` nem Server Component para medir]`. Três textos distintos via `error.tsx` passariam em `next dev` e **colapsariam num só em `next start`** — o `CA-F1-8` do `PRD-003` ficaria verde no ambiente errado. `error.tsx` **existe** (`CA-F1-9` vizinho, `RF-4`) e cobre o que escapar de `D4` com texto genérico; a distinção por causa é responsabilidade do Server Component.

### D5 · Fixture sai do grafo de produção; recurso sem fonte mostra estado "sem fonte"

`fixtures.ts` de `s1-console` e `s3-inspector` **não** são importados por valor em `frontend/src/app/**` nem em `frontend/src/features/**/*.tsx` de produção (`RF-2`, `RN-3`). `StorageBudgetLine`, `ReconnectionEvent`, `ETL_QUEUE_DEPTH_PENDING`, `Completeness`, `RawDataRow` exibem **estado "sem fonte"** — nunca dado inventado. Fixture continua existindo para teste (`*.test.ts`) — o portão exclui teste, como o de hoje.

## Alternativas recusadas — com o custo que estava no menu

| alternativa | custo medido / motivo | veredito |
|---|---|---|
| **(B) Route Handler BFF** (`src/app/api/**/route.ts`) | recusada pelo **owner** `[DECISÃO-OWNER: 2026-09-03]` — *"reabre a porta de segunda verdade… o schema passa a existir em dois lugares"*; mesmo pass-through cria 2ª URL pública para o mesmo dado; `A4` só admite *"sessão/auth"* | **recusada** (não é desta ADR reabrir) |
| **(C) `fetch` direto do browser** | exige `NEXT_PUBLIC_*` (proibido, `ADR-019/D4`), `CORSMiddleware` (**0** hoje; `allow_origins=["*"]` recusado por `FB-infra §3`), e `fingerprint` via `crypto.subtle` ⇒ assíncrono ⇒ **viola `D6.4`** e reescreve o instrumento de `ADR-008/DoD-2` | **recusada** |
| **(D) manter `D5.17b` como está e fiar via `import type` + `fetch` inline no Server Component** | duplica `parseIngestHealthEnvelope`/`fingerprint` fora do módulo — é a "segunda definição" que `ADR-008/DoD-1` proíbe; e o probe de hoje reprova o import de valor que qualquer fiação honesta precisa `[MEDIDO: FB-frontend §2.3]` | **recusada** |
| **(E) `error.tsx` como único mecanismo de erro, distinguindo por `message`** | verde em `next dev`, colapsa em `next start` (redação de mensagem em produção) — `CA-F1-8` passaria no ambiente errado | **recusada** (`D4`) |
| **(A) Server Component + `server-only` + ESLint por diretiva** | 2 arquivos novos (`PainelClient.tsx`, `loading.tsx`/`error.tsx`), 1 devDependency, 1 regra ESLint reescrita, 0 rota nova, 0 schema no Next | **escolhida** |

## Falsificadores — a observação que mostraria que a decisão estava errada

| # | propriedade | comando | hoje (`c8e7193`) | depois de F1 — e o que reprova |
|---|---|---|---|---|
| **F-028-1** | `D2` **morde** | arquivo `"use client"` **efêmero** importando `fetchIngestHealthProjectionViaHttp` por valor; `npm --prefix frontend run build` | n/a (módulo sem `server-only`) | `next build` **reprova nomeando `server-only`**. Se passar, `D2` não mede nada |
| **F-028-1'** | `D2` **cala** | o mesmo import em `page.tsx` (server); `npm --prefix frontend run build` | n/a | **verde**. Se reprovar, o portão trocou proxy por outro proxy |
| **F-028-2** | `D1` — a página lê a API | API de pé sobre store com ≥ 1 run: `curl -s localhost:3000/painel >/dev/null` ⇒ `grep -c 'GET /ingest-health' <uvicorn access log>` **incrementa em 1**; `<main>` tem `N` `<tr>` de coletor, `N` = nº de `(source,endpoint)` distintos do store | 0 requisições (`FB-playwright §4 #1`, n=16) | API no chão (`curl → 000`) ⇒ **0 `<tr>` de coletor** e `data-fact="error_kind:connection_refused"`. **Se renderizar linha com API `000`, repetiu `05_fatia_visivel.md:225`** |
| **F-028-3** | `D3` — ESLint por diretiva | probe efêmero **sem** `"use client"` sob `src/app/` com import de valor ⇒ `npx --no-install eslint <probe>`; probe **com** `"use client"` ⇒ idem | `1 error` no probe sem diretiva `[MEDIDO: FB-frontend §2.3]` | sem diretiva ⇒ **`0 problems`**; com diretiva ⇒ **`1 error`** nomeando `ADR-005/D6.4`. Um dos dois errado ⇒ a reescrita falhou |
| **F-028-4** | `D6.4` continua síncrona (a propriedade, não o instrumento) | `grep -rn 'crypto.subtle' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| wc -l`; `grep -n 'export function fingerprint(' frontend/src/features/s1-console/ingest-health-query.ts` | **0**; `:305`, retorna `string` | **0** e `string`. Um `Promise<string>` aqui é a decisão errada por definição |
| **F-028-5** | `D5` — erosão de fixture | `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **2** (`page.tsx:12,15`) | **0**. Volta a ≥ 1 ⇒ fixture virou ponte |
| **F-028-6** | `D4` — três causas distintas **em produção** | e2e contra `next start` (não `next dev`): (a) env unset, (b) porta sem listener, (c) stub `500` ⇒ três `error_kind` distintos | n/a | os três distintos **sob `next start`**. Iguais ⇒ `D4` foi implementada via `error.tsx` e a redação de produção a engoliu |

## O que esta ADR NÃO decide

- **Se o operador vê o `fingerprint` na tela** (`ADR-005/D6.4 [NÃO SEI]`, `PRD-003 [Q9]`) — dono **owner**. Se a resposta for "sim", `crypto.subtle` volta e `D6.4` reabre; esta ADR não antecipa.
- **Forma e microcopy** dos estados (loading / erro × 3 / vazio / sem fonte) — `ui-designer` com gate `ux-ui-mastery` (`CLAUDE.md` §Design). Esta ADR fixa **que** existem e **como o e2e os distingue** (`data-fact`), não como se parecem.
- **Causa raiz do 0 CSS** e o mecanismo de pipeline de estilo — `frontend-architect`, `SPEC-003` §3.3 e `[GAP G2]`.
- **Topologia, readiness, `ETag`, Caddy** — [`ADR-029`](ADR-029-topologia-da-camada-de-leitura-caddy-proprio-mesma-origem-por-caminho-e-readiness-que-discrimina.md).
- **Nome da rota `/painel`** — `[Q1]`, owner.

## Co-assinatura do `quant-architect` — dono da propriedade `ADR-005/D6.4`

> `RN-1` do `PRD-003`: *"o instrumento muda, a propriedade não"* — a co-assinatura atesta que `D2`/`D3` medem a propriedade de `D6.4` e que `D1` não a viola. Seção preenchida pelo `quant-architect`, não pelo `/architect`.

**Veredito: CO-ASSINA** · 2026-09-04 · `quant-architect`, dono de `ADR-005/D6.4` · rev medida `c8e7193`.

**Motivo (≤ 10 linhas):**
1. `D2` mede a propriedade, o portão atual mede um proxy — e o proxy está **obsoleto**: desde `T-05.15`, `fingerprint()` hasheia via `sha256.ts` (SHA-256 puro-JS, síncrono **nos dois runtimes**; `ingest-health-query.ts:121`), e `node:crypto` saiu do módulo (`grep -rn 'from "node:' frontend/src … | wc -l → 1`, só `threshold-spec-bundle.ts` `[MEDIDO 2026-09-04]`). Logo um import de valor num Client Component hoje **funcionaria em silêncio** — nada o forçaria a `crypto.subtle`. A ameaça que o texto de `D6.4` nomeia (falsificador de `DoD-2` virar `Promise`) já não é o que segura a fronteira; **só o grafo de módulos segura**, e `server-only` é o único instrumento que o lê.
2. A **propriedade fica, re-ancorada** (o texto de `D6.4` não muda; o *porquê* ganha duas pernas que não dependem de sync/async): (a) `ingest-health-query.ts:480` lê `process.env.INGEST_HEALTH_API_BASE_URL`, que `ADR-019/D4` proíbe de chegar ao browser; (b) `ADR-008/DoD-1` — canonicalização em **um** ponto de chamada. Um Client Component importando o módulo violaria as duas mesmo com hash síncrono.
3. `D1` **não viola `D6.4`**: Server Component é Node, `fingerprint()` continua `string` (`:305`), o único ponto de chamada continua o próprio módulo, e a base URL não sai do processo. O que atravessa a fronteira RSC são props serializáveis — **valor**, não código; se o valor `fingerprint` deve aparecer na tela é `[Q9]`, do owner, e esta co-assinatura não o antecipa.
4. `D3` como **sinal** e `D2` como **juiz** é a hierarquia correta — mas a ADR a **afirma** sem falsificador do caso transitivo que a justifica (`F-028-1''` abaixo).
5. **Custo não declarado em `D2`, medido:** `server-only@0.0.1` resolve `exports["."].default → index.js`, que **lança na importação** `[DOC: unpkg.com/server-only/package.json + index.js]`; `test:s1` roda `node --test` sem condição (`package.json:15`). Mimic do pacote sob `node --test`: **sem** `--conditions=react-server` ⇒ `rc=1, pass 0, fail 1`, mensagem *"This module cannot be imported from a Client Component module"*; **com** ⇒ `rc=0, pass 1` `[MEDIDO 2026-09-04, Node v24.10.0, n=1 arquivo]`. Sem a condição, `D2` derruba `ingest-health-query-http.test.ts` e `ingest-health-query.test.ts` — **o instrumento de `ADR-008/DoD-2` (F-D6-1 morde/cala) morre antes de afirmar qualquer coisa**. Não recuso por isto porque é mecânica, não propriedade; mas vira falsificador obrigatório (`F-028-7`).
6. `fingerprint-sync-boundary.test.ts` (instrumento vivo de `D5.17b`) planta probes **sem** `"use client"` e exige `rc != 0` (`:99,:104`). Sob `D3` esses probes viram CALA ⇒ o teste **reprova a própria reescrita**. A ADR não o nomeia; `F-028-8` o obriga a ser reescrito, não apagado.

**Falsificadores — re-medidos e acrescentados:**

| # | ação | comando / observação |
|---|---|---|
| `F-028-4` | **REBASELINE** — o comando como está dá **2**, não 0: `ingest-health-query.ts:110` e `sha256.ts:7`, ambos **comentário** `[MEDIDO 2026-09-04 em c8e7193]`. Filtrando comentário: **0**. Comando corrigido: `grep -rn 'crypto.subtle' frontend/src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| grep -vE ':[0-9]+:\s*(\*\|//)' \| wc -l → 0`. Segunda metade confirmada: `:305` retorna `string`. Fica como sentinela **fraca** — mede o instrumento antigo, não a propriedade (item 1) | rebaseline, mantido |
| `F-028-5` | **confirmado**: `2` (`page.tsx:12,15`) `[MEDIDO 2026-09-04 em c8e7193]` | mantido |
| **`F-028-1''`** (novo) | `D2` morde **transitivamente** — probe `"use client"` efêmero que importa `view-model.ts` (ou outro `.ts` sem diretiva) que importa `fingerprint` por valor ⇒ `npm --prefix frontend run build` **reprova nomeando `server-only`**, enquanto `npx --no-install eslint <probe>` (D3) **passa**. É a observação que prova a hierarquia de `D3`. Se `next build` passar, `D2` não é juiz e `D3` não tem quem o corrija | acrescentado |
| **`F-028-7`** (novo) | `D2` **não mata o instrumento de `DoD-2`** — `npm --prefix frontend run test:s1` verde após `D2`; exige `node --conditions=react-server --test` (ou equivalente) no script. Vermelho com *"This module cannot be imported from a Client Component module"* ⇒ `F-D6-1` de `ADR-008/DoD-2` deixou de medir. Baseline do mimic acima | acrescentado |
| **`F-028-8`** (novo) | `fingerprint-sync-boundary.test.ts` é **reescrito**, não apagado: MORDE (i)/(ii) passam a carregar `"use client"` na primeira linha; entra um **CONTROL sem diretiva com import de valor** que deve ficar limpo (é o `page.tsx` server de `D1`); o CONTROL `import type` continua. `git log --diff-filter=D -- frontend/src/features/s1-console/fingerprint-sync-boundary.test.ts` não vazio ⇒ o portão foi removido em vez de trocado | acrescentado |

**O que continua fora desta co-assinatura:** `[Q9]` (operador vê o selo?) — owner; forma (i)/(ii) do mecanismo de `D3` — implementador, desde que `F-028-3`, `F-028-1''` e `F-028-8` reprovem igual nas duas.
