# Review arquitetural — Fase `04` (`O OI honesto`) — candle-real-e-eixo-unico

**Veredito: COMPLIANT**

Worktree: `/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f04`, branch
`wave/candle-f04`, HEAD `3c97207`. Base de comparação: `10aeac4` (merge da fase `03`, `master`).

## Denominador

- **Regras bloqueantes em vigor:** `harness rules list --severity block` → **8** (`core.relative-import`,
  `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, `web-fullstack.browser-imports-server`,
  `web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`,
  `own.compose-hardcoded-secret`).
- **Arquivos varridos:** `git diff --stat 10aeac4..3c97207 -- frontend/src frontend/e2e` → **8 arquivos de
  código** (`SymbolClient.tsx`, `[symbol]/page.tsx`, `data-fact-ascii-key-contract.test.ts`,
  `oi-pane-dom-contract.test.ts`, `oi-series-selector.test.ts`, `panel-status.ts`,
  `price-pane-dom-contract.test.ts`, `view-model.ts`) + **2 specs e2e** (`12-oi-dado-real.spec.ts`,
  `19-oi-provenance-ablacao-e-ascii.spec.ts`) = **10 arquivos**. Comando: `git diff --name-only 10aeac4..3c97207 | grep -v '^docs/'`.
- **Avaliação mecânica:** `harness rules --mode file --path <arquivo> --format ndjson` rodado individualmente
  sobre os 10 arquivos → **0 violações** em todos (saída vazia, `rc=0` cada um). `backend/src`/`backend/tests`
  não tocados nesta fase (fase é puramente `web`, confirmado por `git diff --stat`).
- **`make verify`:** não re-executei a suíte inteira — o diff entre o HEAD QA'd (`78ff707`) e o HEAD atual
  (`3c97207`) é **só** o relatório de QA (`git diff --stat 78ff707..3c97207` → 1 arquivo, `docs/.../FASE-04-qa-web.md`,
  +103/-0). Zero código mudou depois do `make verify` verde (8/8 portões) que a QA documentou em
  `/tmp/verify-candle-f04-20260923T121747Z.log` e `/tmp/f04_verify.out`. Não há "mudança de produção não
  revalidada" (`docs/context/.../revalidar-gate-apos-mudanca-de-producao.md` não se aplica aqui).

## O que a fase entrega (itens 4.1–4.6 do plano)

1. **`CA-9`** — `deriveOiProvenanceLabel` (`view-model.ts:887-898`) deriva `{grandeza, universo, coorte}`
   do `SeriesKey` resolvido (`Pick<SeriesKey, "unit"|"denom"|"provider"|"venue"|"cohort">`), nunca string
   escrita à mão; `SymbolClient.tsx` (`OiProvenance`, linhas ~1295-1310) só interpola o objeto recebido via
   prop. `page.tsx:714-717` chama a função do lado servidor e passa o resultado por props.
2. **`C-4`/`ADR-036/D2`** — `OPEN_INTEREST_ADR_036_D2_INVARIANTS` (`view-model.ts:912-917`) fixa
   `provider=binance`, `unit=BTC`, `denom=base`, `aggregationScope=Symbol`; `openInterestAdr036D2Violations`
   é comparação pura, nunca fallback/conversão. Confirmei o texto de `ADR-036/D2` (`docs/adr/ADR-036*.md:45`,
   *"Volume (M1) e Open Interest (M2): Binance, a origem"*) — a invariante pinada bate com a decisão viva.
3. **`T-04.3`/`CST-230` (chave de máquina deixa de nascer da microcopy)** — `LiveRow` agora recebe `factKey`
   (ASCII, `"price"`/`"oi"`/`"cvd"`) separado de `label` (pt-BR, `"preço"`/`"oi"`/`"cvd"`); o `data-fact`
   passa a ser `` `live_${factKey}:...` `` em vez de `` `live_${label}:...` ``. O defeito original
   (`data-fact="live_preço:attempted"`, com acento) está corrigido — confirmado por
   `data-fact-ascii-key-contract.test.ts`, que varre as **43+** expressões `data-fact` do arquivo, não só
   `LiveRow` (item 4.4 do plano, "os demais painéis herdam a fábrica de chave").
4. **Boundary RSC (`web-fullstack.browser-imports-server`)** — `SymbolClient.tsx` (`"use client"`) importa
   `OiProvenanceLabel` só como `import type { ... } from "./panel-status.ts"` (confirmado lendo o import no
   topo do arquivo); `panel-status.ts` não tem nenhum `import` (é o contrato de dados puro, sem
   `node:crypto`). A função `deriveOiProvenanceLabel` (que alcança `series-key-id.ts`/`node:crypto` via
   `view-model.ts`) só é chamada em `page.tsx` (Server Component). Fronteira respeitada por construção — o
   mesmo padrão já usado por `FreshnessVerdict`/`SeriesProvenance`/`SeriesValueStats`.
5. **`CA-10` (ablação de derivação)** — coberta por `oi-pane-dom-contract.test.ts` (unit) e
   `19-oi-provenance-ablacao-e-ascii.spec.ts` (e2e Playwright contra app real, com stub HTTP sintético do
   catálogo de teste, `[P-seed]` respeitado). QA relatou mutação própria (hard-coding o rótulo → 3 testes
   caem) confirmando que o falsificador morde de fato.
6. **Pixel na tela** — `19-oi-provenance-ablacao-e-ascii.spec.ts` usa `toBeVisible()` +
   `boundingBox()` com assert de posição/dimensão, não só presença de atributo (evita o "assert de DOM não
   prova pixel" já documentado como lição desta feature).

## Achado — não bloqueante, WARNING, para registro

**Identificadores `grandeza`/`universo`/`coorte` em português, em código de produção `frontend/src`, fora da
exceção de vocabulário de componentes.**

- `frontend/src/app/symbol/panel-status.ts:233-237` — `interface OiProvenanceLabel { readonly grandeza: string;
  readonly universo: string; readonly coorte: string }` — três identificadores de campo TypeScript em PT,
  em caminho que **não** é `backend/src/modules/sentimento/`/`backend/tests/sentimento/` (a única exceção
  declarada, linha 9 da tabela de fronteira do `CLAUDE.md`). Pela linha 1 dessa mesma tabela, identificador
  de produção em `frontend/src` nasce em inglês (`[PREMISSA-OWNER: 2026-08-29]`, *"var, tudo"*).
- O mesmo padrão se repete na string do `data-fact` (`SymbolClient.tsx`, `OiProvenance`):
  `` `oi_provenance:grandeza=${...};universo=${...};coorte=${...}` `` — os termos PT viram sub-chaves de um
  valor de atributo pensado para ser grepado por máquina (o mesmo tipo de superfície que `T-04.3`, na mesma
  fase, corrigiu para ASCII/estável e separado da microcopy).
- **Por que não entra no veredito:** (a) `CLAUDE.md` declara explicitamente que idioma de identificador é
  **"convenção, não portão"** — nenhuma `[[rules.own]]` de idioma existe, `harness rules list` confirma que
  não há regra bloqueante para isso; (b) o próprio `SPEC-008` §8 (`docs/specs/SPEC-008-candle-real-e-eixo-unico.md:682`)
  e o plano da fase (`docs/plans/SPEC-008-candle-real-e-eixo-unico/04_oi_honesto.md`, DoD 1) escrevem o
  falsificador `CA-9` exigindo literalmente que o `data-fact` contenha `grandeza`+`universo`+`coorte` — a
  SPEC aprovada é a autoridade que este review valida contra, não opinião, e a task `T-04.1`
  (`tasks.toml:577`) transcreve o mesmo comando literal. A implementação seguiu a SPEC aprovada à risca.
  Os valores de `grandeza`/`coorte` (`"contracts (BTC)"`, `"all"`) e `universo`
  (`"binance/usdm_futures"`) continuam em inglês — só os NOMES dos três campos/sub-chaves são PT.
- **Correção concreta, se o owner decidir fechar a lacuna:** renomear os três campos/sub-chaves para
  `magnitude`/`universe`/`cohort` (mantendo os VALORES como estão) resolveria a tensão sem tocar DoD/CA-9,
  que mede o CONTEÚDO (três termos presentes), não os nomes das chaves — mas isso reabriria uma pergunta de
  `SPEC-008` que hoje está escrita em PT, então é decisão de dono da SPEC, não desta review.

## O que NÃO foi encontrado

- Nenhum import relativo, `except` silencioso, `print`, segredo hardcoded, ou leitura de tenant do request
  nos arquivos tocados.
- Nenhuma violação de `ADR-036/D2` — a invariante do provedor/unidade/denominação/escopo permanece pinada e
  testada (`oi-series-selector.test.ts:262-300`).
- Nenhum cruzamento indevido da fronteira RSC (`web-fullstack.browser-imports-server`).
- `tasks.toml` mostra `status = "todo"` para T-04.1..T-04.6 (linhas 570,585,601,616,629,645) — isso é
  esperado nesta etapa: QA já registrou "aguardando `harness tasks resolve` pós-veredito"; não é uma
  divergência de escopo, é o próximo passo do orquestrador (`harness tasks resolve`), fora do escopo desta
  review read-only.

## Gates já registrados, cruzados

- QA: `docs/context/candle-real-e-eixo-unico/gates/FASE-04-qa-web.md` — APPROVED, evidência por item do DoD,
  com 2 mutações próprias documentadas (ablação + reintrodução do bug ASCII original) confirmando que os
  falsificadores mordem.
- Design: `docs/context/candle-real-e-eixo-unico/gates/T-04.6-ux-ui-mastery.md` — APPROVED, score 88/100,
  revisão ao vivo contra `/symbol/BTCUSDT`, 1 achado não-bloqueante (peso visual uniforme, herdado de fases
  anteriores, não é regressão desta task).

## Comando de registro

```
harness gate-record candle-real-e-eixo-unico 04 REVIEW COMPLIANT "10 arquivos varridos (harness rules --mode file, 0 violações); ADR-036/D2 e boundary RSC intactos; 1 achado WARNING não-bloqueante (grandeza/universo/coorte em PT, mandatado pelo DoD literal de SPEC-008 §8/CA-9, convenção não portão)"
```
