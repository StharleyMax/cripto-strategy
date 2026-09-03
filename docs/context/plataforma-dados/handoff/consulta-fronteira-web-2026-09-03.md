# Consulta ao arquiteto — fronteira `web` × `sentimento`: quando o Next entra e o front extrapolou?

**Origem:** pergunta do owner em 2026-09-03. **Ato pedido:** parecer arquitetural, não código.

## A pergunta do owner, literal

> *"varias das tarefas do front esta usando somente o módulo de teste, em que momento vai ser
> integrado com o next e o isolamento das responsabilidades ta sendo respeitado ou o front ta
> extrapolando, uma vez que ainda n tem as rotas do back"*

`[PREMISSA-OWNER: 2026-09-03]`

## Os fatos medidos (não reabra, use)

Todos `[MEDIDO 2026-09-03, árvore de trabalho em `8c002e4`]`:

1. **Não existe app Next.js.** `grep -n '"react"' frontend/package.json` → `rc=1`, zero linhas.
   `ls frontend/tsconfig.json` → inexistente. `frontend/package.json` não tem `next` nem `react`
   em `dependencies`/`devDependencies` (`n=6` devDeps: eslint stack, jsdom, lightweight-charts,
   typescript). Nenhum script `dev`/`build`; só `lint` e 4 alvos `node --test`.
2. **Não existe camada HTTP no backend.**
   `grep -rn 'fastapi\|FastAPI\|APIRouter\|flask' backend/ --include='*.py' --include='*.toml' -l`
   → `rc=1`, zero arquivos. `backend/src/modules/sentimento/{domain,use_cases,infra}` — sem `api`.
3. **9 tasks de componente `web` estão `done`:** `T-05.8`, `T-05.9`, `T-06.10`, `T-07.12`,
   `T-07.13`, `T-07.14`, `T-08.5`, `T-08.11` (+`T-05.10` `blocked`) —
   `grep -n 'components = \["web"\]' -B2 docs/context/plataforma-dados/tasks.toml`.
4. **Nenhuma fase do plano cria o scaffold do app nem a rota HTTP.**
   `grep -rniE 'scaffold|create-next|app router|API HTTP' docs/plans/SPEC-001-plataforma-dados/*.md`
   → só ocorrências de `endpoint` de FONTE EXTERNA (Binance), nenhuma de rota própria. A fase `09`
   é componente `docs` e declara em "Não faz": *"não escreve código de produção"*.
5. **10 de 35 módulos TS não-teste citam um arquivo `.py` como origem do que reimplementam**
   (`grep -rlnE '\b[a-z_]+\.py\b' frontend/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
   → 10; universo 35). Casos nomeados nos próprios cabeçalhos: `app/universe-at.ts` porta
   `domain/universe_at.py`; `features/s3-inspector/{series-catalog,quarantine}.ts` portam
   `series_key.py`/`series_catalog.py`/`quarantine_terms.py`; `charts/s2-cvd.ts` espelha `cvd.py`;
   `features/s1-console/ingest-health-query.ts` declara ser *"a byte-for-byte mirror of
   `ingest_record.py`'s `_project_run`/`_project_gap`/`canonical_json.py`"*.
6. **O caminho de dado de `T-07.13` é `child_process` síncrono contra o CLI do backend.**
   `frontend/src/features/s1-console/ingest-health-query.ts:1-16` declara literal: *"invoking
   `ingest_health_cli.py` as a READ-ONLY SUBPROCESS against a local SQLite fixture … Production
   wiring of a real, async, server-side route is future work, out of `D7.17`'s scope."*
7. **`S3Inspector.tsx` e `S1Console.tsx` não importam `react`** — `gates/T-06.10-review.md:22`:
   *"não importa `react` … não há `tsconfig.json`/renderização em nenhum dos 4 testes"*. A
   fronteira é chamada "presentational lint-only" e está nomeada nos arquivos.
8. **A lacuna foi nomeada task a task, nunca escalada.** `gates/T-05.8-builder.md:20`,
   `gates/T-07.13-builder.md:23`, `gates/T-07.14-builder.md:130`, `gates/T-06.10-qa.md:120`,
   `handoff/T-06.10.md:28` (*"não é dívida silenciosa se for nomeada"*). `Q16` em
   `PRD-001:839` fixou o prazo *"antes do primeiro `.tsx`"* — e o primeiro `.tsx` já existe.

## O que se pede de parecer (3 perguntas, nesta ordem)

**P1 — Isolamento:** os itens 5 e 6 são a fronteira correta ou o `web` absorveu domínio que é do
`sentimento`? Especificamente: *espelho byte-a-byte de `ingest_record.py` em TS* é o falsificador
que `ADR-008/D3` (*"UMA consulta nomeada, DOIS consumidores"*) exige, ou é exatamente a segunda
implementação que aquela ADR proíbe? As duas leituras estão escritas no mesmo arquivo.

**P2 — Momento do Next:** em que fase/task nascem (a) o scaffold do app e (b) a rota HTTP que
substitui o `child_process` do item 6? Hoje nenhuma das 9 fases os prevê (item 4). Se a resposta
for "fase nova" ou "SPEC nova", diga qual, e se isso é ato de `/tech-lead` ou de owner.

**P3 — O que fica inválido:** quanto do TS medido no item 5 morre ou precisa reescrita quando (b)
existir? Um número, com o comando. E se a resposta for "nada morre", diga por que o
`child_process` sobrevive num browser — ou declare que aquele módulo é de teste, não de produção.

## Restrições do parecer

- **Read-only.** Não edite `tasks.toml`, ledger, Jira, nem código. Nenhum `gate-record`/`approve`.
- Cada afirmação quantitativa com comando e `n` (`CLAUDE.md` §*"Nenhum número sem o comando"*).
- Onde não houver base para julgar, `[NÃO SEI]` explícito — e diga de quem é a decisão (owner?
  `ADR-008/D3`? `/tech-lead`?).
- Relatório completo em `docs/context/plataforma-dados/gates/consulta-fronteira-web-2026-09-03.md`.
  Devolva **no máximo 15 linhas** (R1 do protocolo de despacho).
