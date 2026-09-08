# Handoff /architect → frontend-architect — `pagina-de-grafico-s2`, F2 + nomes de rota

**Contexto:** PRD-006 aprovado (Gap Analysis em `docs/context/pagina-de-grafico-s2/gates/PRD-006-architect.md`).
F1 constrói 2 rotas de backend (`ADR-005/D1`); F2 é a página Next que monta a S2 (32 módulos
`s2-*` já testados em `frontend/src/charts/`) sobre `history-transport.ts`/`live-transport.ts`.
Rotas nascem em inglês (`[PREMISSA-OWNER 2026-09-08]`, fecha `CLAUDE.md` linha 12).

## Decida (3 perguntas nomeadas no PRD, `[Q1]`/`[Q2]`/`[Q3]`)

1. **Nome do segmento de rota novo** (S2) — candidatos: `chart`, `symbol`, `market`. Custo de cada um.
2. **Nome do segmento que substitui `/painel`** — hoje serve S1(console)+S3(inspector). Candidatos:
   `dashboard`, `console`, `panel`, `overview`. Custo de cada um.
3. **Forma do tratamento de bookmark antigo para `/painel`**: `redirect` 308 permanente vs `404` com
   link. Ambas descritas em `PRD-006.md` §14 `M2`.

## Achado NOVO desta rodada — ESLint boundary de `ADR-003/D5.12` bloqueia F2 HOJE, e ninguém tinha medido isso ainda

`frontend/eslint.config.mjs:182-198` proíbe **toda** importação `web → charts`, com a mensagem
literal *"no sanctioned crossing point exists yet (T-05.2+ is out of scope for T-05.1)"*. `T-05.2`
fechou (`CST-36`, PR #102) sem carvar a exceção que o próprio comentário de `ADR-003:90-94` já
antecipava (*"THAT task is where a narrower exception... is added"*). Medido agora:
`grep -rn 'from.*charts' frontend/src/app frontend/src/features` → **0** ocorrências fora de teste.
⇒ **F2 vai reprovar `eslint` no primeiro `import` de `charts` na página nova**, a menos que você
decida o formato da exceção estreita (por `files:` da nova rota, não um afrouxamento geral) no
mesmo `eslint.config.mjs`. Isto é decisão sua, dona da fronteira `charts`↔`web`.

## Onde ler

- `docs/specs/PRD-006-pagina-de-grafico-s2.md` §5 (F2, US-4/5/6), §9, §11 NG-1
- `docs/adr/ADR-003-fronteira-charts-web.md:74-95` (separação de dono de julgamento) e `:280-334`
  (D1, o mecanismo `no-restricted-imports.patterns`)
- `frontend/eslint.config.mjs:53-232` (os dois blocos de `no-restricted-imports`/`no-restricted-syntax`)
- `frontend/src/app/routes.ts`, `frontend/src/app/painel/*.tsx`, `frontend/e2e/01-painel-carrega.spec.ts`

## Devolva

Nomes escolhidos (Q1/Q2), forma do bookmark (Q3), e a forma da exceção ESLint que você decidir —
em ≤ 15 linhas, relatório completo em `docs/context/pagina-de-grafico-s2/gates/F1-F2-frontend-architect.md`.
