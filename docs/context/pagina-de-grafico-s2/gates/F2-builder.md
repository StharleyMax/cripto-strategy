# [QA GATE — Fase 02: A página `/symbol` (ADR-034/D8)]

**Feature:** `pagina-de-grafico-s2` · **Componente:** `charts` (`T-02.1`/`T-02.3`) / `web`
(`T-02.2`/`T-02.4`)
**Spec:** `docs/specs/SPEC-006-pagina-de-grafico-s2.md`
**Plan:** `docs/plans/SPEC-006-pagina-de-grafico-s2/02_pagina_symbol.md`
**Tasks:** `T-02.1`..`T-02.4` (`CST-180..183`), `docs/context/pagina-de-grafico-s2/tasks.toml`

## Arquivos alterados

Produção:
- `frontend/src/charts/index.ts` (new) — `T-02.1`, o barrel único sancionado por `ADR-034/D8`:
  reexporta só as 5 categorias (execução headless S2, composição de painéis, adaptador
  lightweight, tokens de cor, tipos de política de ausência), zero função nova de geometria.
  Deliberadamente NÃO reexporta `naiveDropGapsLine` (o adaptador ingênuo que fabricaria `0`).
- `frontend/eslint.config.mjs` (modified) — `T-02.2`, novo bloco `files:
  ["src/app/symbol/**/*.{ts,tsx,mts,cts}"]` logo APÓS o bloco geral `web` (ordem importa em
  flat config): `no-restricted-imports` com 3 negações (`!**/charts/index[.ts|.tsx]`) e
  `no-restricted-syntax` com 3 seletores espelhando a mesma negação por regex (`import()`
  dinâmico, template literal sem interpolação, `require`).
- `frontend/src/app/symbol/series-history-client.ts` (new) — `T-02.4`, `import "server-only"`,
  parseia/valida o envelope de `/series-history` (inclui o XOR `CA-F1-5`), lança `TransportError`
  com os 4 `kind`s padrão.
- `frontend/src/app/symbol/view-model.ts` (new) — `T-02.4`, mapeamento puro: candle degenerado
  (O=H=L=C) para o preço escalar, filtro de ausência por linha, CVD delta assinado
  (`parseSignedDecimalToScaled`), `computeSeriesKeyId` (recomputa o sha256 de 15 termos que o
  catálogo não expõe), `keyMatchesSymbol`, `daysWithPresence`.
- `frontend/src/app/symbol/panel-status.ts` (new) — `PanelStatus` (`ok` | `absent` com 5 razões).
- `frontend/src/app/symbol/page.tsx` (new) — `T-02.4`, Server Component (`export const dynamic =
  "force-dynamic"`), zero SQL/subprocess: monta BTCUSDT, 3 painéis (Preço, OI, CVD delta+
  acumulado), 4 dias, catálogo → `series_key_id` → `/series-history` por painel, degrada para
  ausência independentemente por painel em qualquer falha (não cadastrado ou qualquer
  `TransportErrorKind`). Importa só `../../charts/index.ts`.
- `frontend/src/app/symbol/SymbolClient.tsx` (new) — `"use client"`, monta os 3 gráficos
  `lightweight-charts` via `candlestickSeriesLossless`/`lineSeriesLossless`, leitura atual via
  `resolveStockReading`/`resolveFlowReading`, seção "Ao vivo" com `EventSource` (mostra "ao vivo
  indisponível" — `/series-live` não tem produtor real ainda, `gates/F1-builder.md` Bloqueado
  item 3).
- `frontend/package.json` (modified) — `test:app` glob `'src/app/*.test.ts'` →
  `'src/app/**/*.test.ts'` (recursivo, necessário para `src/app/symbol/*.test.ts`);
  `"sideEffects": false` adicionado (corrige `next build`/Turbopack incluindo `jsdom` — que
  `s2-headless-run.ts` importa — no bundle do browser via o barrel; achado nesta fase, fora dos
  6 portões oficiais do `make verify`, corrigido mesmo assim por não deixar dívida silenciosa).

Teste:
- `frontend/src/charts/eslint-boundary.test.ts` (modified) — `T-02.3`, 3 casos novos num único
  `test()`: morde-1 (import profundo dentro de `symbol/`), morde-2 (barrel plantado em
  `console/`, prova contenção de escopo), cala (barrel dentro de `symbol/`).
- `frontend/src/app/symbol/series-history-client.test.ts` (new) — 8 testes (CALA parse, MORDE
  corpo não-objeto, MORDE `CA-F1-5` (ambos não-nulos / ambos nulos), MORDE 4
  `TransportErrorKind`s, CALA round-trip via `fetchImpl` mockado).
- `frontend/src/app/symbol/view-model.test.ts` (new) — 5 testes, incluindo o falsificador
  `CA-F2-3` fim-a-fim (preço/OI/CVD) e um controle negativo MORDE que mostra a forma exata do
  defeito que o mapeador real não produz.
- `frontend/src/app/symbol/axis-fidelity.test.ts` (new) — o falsificador `CA-F2-5`: 5.760
  candles sintéticos de cobertura total sobre a janela real de 4 dias/1 minuto, tolerância
  0,5px, via `runHeadlessChart` real do barrel.

## DoD (`02_pagina_symbol.md`)

- [x] `CA-F2-1` barrel único, zero geometria nova —
      `grep -c "^export" frontend/src/charts/index.ts` → 10 statements de export (todos
      `export {...} from`/`export type {...} from`, nenhum `function`/`const` de geometria
      declarado no arquivo — confirmado por `grep -n "^export\|^function\|^const" ...` sem
      nenhuma linha `function`/`const` fora de `export`)
- [x] `CA-F2-2` fronteira executável, só o barrel —
      `cd frontend && npx eslint src` → rc=0 (0 erros) sobre as regras novas
- [x] `CA-F2-3` ausência nunca vira `0` (preço/OI/CVD, fim-a-fim) —
      `cd frontend && node --conditions=react-server --test 'src/app/symbol/view-model.test.ts'`
      → 5/5 pass
- [x] `CA-F2-4` MORDE+MORDE+CALA da exceção de fronteira —
      `cd frontend && node --test 'src/charts/eslint-boundary.test.ts'` → 1/1 pass (nome:
      "ADR-034/D8 MORDE+MORDE+CALA…")
- [x] `CA-F2-5` eixo aguenta a janela real, tolerância 0,5px —
      `cd frontend && node --conditions=react-server --test 'src/app/symbol/axis-fidelity.test.ts'`
      → 1/1 pass

## Comandos rodados (literais) e resultado

- `cd frontend && npm run lint` → `eslint src`, rc=0 (universo: todo `frontend/src`)
- `cd frontend && npm run typecheck` → `tsc -p tsconfig.json --noEmit --strict`, rc=0
- `cd frontend && npm run test:app` → 112 testes, **111 pass, 1 fail** — a falha é
  `src/app/universe-at.test.ts` (`T-07.14`, pré-existente, arquivo não tocado nesta fase),
  ausência de `data/snapshots/2026-08-25_exchangeInfo.json` (dado bruto gitignored,
  `CLAUDE.md`/"Dado bruto não é versionado", ausente neste worktree)
- `cd frontend && npm run test:charts` → 158 testes, **142 pass, 16 fail** — todas as 16
  falhas são pré-existentes por ausência de
  `data/binance/klines/tf2/BTCUSDT-1m-2026-0{8-20..23}.csv` (mesmo motivo acima), confirmado por
  `git stash` + rerun no mesmo worktree ANTES desta mudança: baseline 157 testes/137 pass/20
  fail, mesmo conjunto de arquivos-causa (`data/binance/*`); nenhuma falha nova introduzida —
  `diff` das listas de nomes de teste falhos antes/depois mostra só ruído de timing (ms) e 4
  testes de `D5.12` que eram flakeantes na baseline (~4s cada, `eslint` via child process) e
  passaram em ambas as chamadas subsequentes
- `cd frontend && rm -rf .next && npx next build` → build de produção **compila e gera as 3
  rotas** (`/`, `/console`, `/symbol`) sem erro — sanity check além dos 6 portões oficiais
  (`Makefile` não declara alvo de build de frontend), motivado por ter achado e corrigido o
  defeito do `jsdom`/Turbopack citado acima
- `harness rules --mode sweep --changed-only` → rc=0, saída vazia (0 bloqueio, 0 aviso)
- `bash scripts/verify.sh` (`make verify`) → **INDETERMINADO por portões que RECUSAM medir**,
  não por reprovação: `lint-backend`/`test`/`boundaries` recusam (`backend/.venv` ausente,
  precisa `make setup`/rede — ambiente deste worktree, não este diff, que não toca
  `backend/`); `regras`/`validate` recusam via o wrapper `.harness/mechanism` ("mecanismo NAO
  RESOLVIVEL" para este worktree — o binário `harness` direto FUNCIONA, como mostra a linha
  acima); `lint-frontend`/`lint-frontend-typecheck` (os 2 portões que tocam este diff) → rc=0.
  Log completo: `/tmp/verify-agent-abeaef9d8718ee4d3-20260908T195256Z.log`

## Cobertura

Sem instrumento de cobertura de linha configurado para `node --test` neste projeto (mesmo padrão
das fases anteriores desta feature — `F0-builder.md`/`F1-builder.md` não reportam cobertura de
linha; o piso declarado é comportamental: cada `CA-F2-*` tem falsificador próprio, listado no DoD
acima).

## Doc delta

- `docs/INDEX.md`: **atualizado** — nova linha (append-only) registrando esta fase.
- ADR: **não necessário** — `T-02.1`..`T-02.4` executam decisões já fixadas em `ADR-034/D8`;
  nenhuma decisão nova de arquitetura foi tomada aqui (a correção `sideEffects: false` é
  configuração de build, não decisão arquitetural, e está documentada acima/no diff).

## Bloqueado

Nenhum item bloqueante do escopo desta fase. Achados fora do escopo, nomeados para não ficarem
silenciosos:
- `backend/.venv` ausente neste worktree impede rodar `lint-backend`/`test`/`boundaries` via
  `make verify` — ambiente, não este diff (que não toca `backend/src` nem `backend/tests`).
- `.harness/mechanism` não resolve o plugin para este worktree (`regras`/`validate` recusam via
  `make verify`); contornado rodando `harness rules --mode sweep --changed-only` diretamente
  (binário no PATH), que devolveu rc=0 sem achados.
- `GET /series-live` continua sem produtor real (herdado de `F1-builder.md`, item já registrado
  lá) — `SymbolClient.tsx` mostra "ao vivo indisponível" para as 3 séries, honesto com o estado
  real do sistema, não um bloqueio desta fase.
