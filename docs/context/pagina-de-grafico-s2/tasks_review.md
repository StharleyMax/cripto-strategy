# Narrativa de review de tasks — `pagina-de-grafico-s2`

**Papel:** `/tech-lead` · **Data:** 2026-09-08 · **Feature:** `pagina-de-grafico-s2` (**filha** de
`plataforma-dados`, `relate` no ledger)
**Status desta narrativa: APROVADA PELO OWNER em 2026-09-08 (via coordenador).** Decisão adicional
do owner registrada na aprovação: **1 PR por fase, não 1 PR por task** (4 PRs — F0/F1/F2/F3), mesmo
padrão de `captura-em-producao`; não muda `tasks.toml` (schema idêntico, `depends_on` continua por
task) — é orquestração de branch/PR do coordenador no dispatch dos builders. Tasks materializadas
no Jira nesta sessão (§8). Zero código, zero commit.
**Insumos lidos integralmente:** [`SPEC-006`](../../specs/SPEC-006-pagina-de-grafico-s2.md) (297
linhas) · [`index.md`](../../plans/SPEC-006-pagina-de-grafico-s2/index.md) +
[`00`](../../plans/SPEC-006-pagina-de-grafico-s2/00_coluna_de_valor.md) ·
[`01`](../../plans/SPEC-006-pagina-de-grafico-s2/01_rotas_de_serie.md) ·
[`02`](../../plans/SPEC-006-pagina-de-grafico-s2/02_pagina_symbol.md) ·
[`03`](../../plans/SPEC-006-pagina-de-grafico-s2/03_migracao_console.md) ·
[`ADR-034`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md) ·
`gates/PRD-006-architect.md`, `gates/F1-quant-architect.md`, `gates/F1-F2-frontend-architect.md` ·
mãe: `docs/context/plataforma-dados/tasks.toml:694-705,1353-1367` (`T-05.2`/`CST-36`,
`T-08.9`/`CST-77`).

---

## 0. Gate de entrada — conferido, com o comando

| condição | comando | resultado |
|---|---|---|
| estado == `SPEC_APPROVED` | `harness pipeline state pagina-de-grafico-s2` | **`SPEC_APPROVED`** `[MEDIDO 2026-09-08]` |
| `index.md` do plano existe | `ls docs/plans/SPEC-006-pagina-de-grafico-s2/` | 5 arquivos (`index`, `00`..`03`) `[MEDIDO]` |
| destino no tracker | `harness policy --key tracker` | `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}` `[MEDIDO]` |
| integração do tracker | `mcp__atlassian__jira_search` `project=CST AND (summary~"grafico S2" OR summary~"symbol" OR labels=spec-006)` | autenticado; **0 issues** — nada a duplicar `[MEDIDO 2026-09-08]` |
| vocabulário de componentes | `harness policy --key components` | `["sentimento","charts","convergencia","backtest","web","docs","infra"]` `[MEDIDO]` |
| rev de ancoragem | `git rev-parse --short HEAD` | `7a7b7ab` (SPEC ancorou em `adf6537`; sem commit de `backend/`/`frontend/src` entre os dois — `[NÃO MEDIDO]` por diff, assumido pela ausência de PR mesclado nesse intervalo) |
| mãe destravada para dado real | `harness pipeline state plataforma-dados` | `BUILD_AUTHORIZED` (não `DONE`; irrelevante para esta filha — `captura-em-producao` já está `8/8 done`) |
| regras bloqueantes vivas | `harness rules list --severity block` | **8**, nenhuma nova desta feature |

---

## 1. Prioridade explícita do owner — F0 isolada, primeiro

`F0` (coluna `value_raw`) não depende de nada e desbloqueia `deploy-collector-1` (de pé desde
`PR #203`, sem crash-loop) a gravar dado real de valor. As tasks de `F0` (`T-00.1`..`T-00.4`) têm
`depends_on = []` entre si só onde não há aresta de código real, e **nenhuma** aresta para `F1`/`F2`/
`F3` — a ordem `F0 → F1 → F2` e `F3` em paralelo (fechando por último) é portão de fase do workflow
(`RN-1` do plano), não aresta fabricada. Isto significa: `F0` pode ir a `/build` **isolada**, sem
esperar as outras fases estarem cardadas.

---

## 2. Princípios da quebra

1. **Uma task = unidade coesa com DoD próprio.** `1.2`+`1.6` do plano (use-case + recusa de
   `AsOfReading` mal-formado) fundem em `T-01.2` — quem projeta o par discriminado é quem levanta a
   exceção tipada quando ele vem mal-formado (mesma disciplina de `SeriesRow` em `T-00.2`); separar
   viraria "task de validação" com DoD que a task vizinha já mede. `2.4`+`2.5` (página + ausência
   renderizada) fundem em `T-02.4` pelo mesmo motivo: ausência só é observável rodando a página com
   dado real de `01`.
2. **Teste vive na task que ele mede** (`R-H` da doutrina): endereçabilidade por conteúdo (`CA-F1-2`)
   é DoD de `T-01.3` (a própria rota), não task própria; os 3 casos do boundary ESLint (`CA-F2-4`)
   são `T-02.3`, separada de `T-02.2` (o bloco de config) porque o teste vive em `charts`
   (`eslint-boundary.test.ts`) e a config em `web` (`eslint.config.mjs`) — componentes diferentes,
   arquivos diferentes, autores plausivelmente diferentes.
3. **`depends_on` só com aresta real.** `T-01.3`→`T-01.2`→`T-01.1` (rota precisa do use-case, que
   precisa do leitor); `T-01.3`→`T-00.3` (a rota só serve `value_raw` decodificado pelo wire de `F0`)
   — a única aresta que atravessa fase, porque é código real, não cerimônia de fase. `T-01.4`
   (`/series-live`, SSE) **não** ganhou aresta para `T-01.1`/`T-01.2`: o envelope de bucket parcial é
   `ADR-005/D2` inalterado, lido do `cvd.py` já existente, não do leitor de janela novo — se essa
   leitura estiver errada, é achado de `/build`, não desta quebra.
4. **Prefixo de título = `components`, mesma ordem.**
5. **`M1` (destino de `T-05.2`/`T-08.9` na mãe) NÃO é task desta feature** — mesmo padrão de `P10`/
   `T-07.15/16/17` em `captura-em-producao`: fica como **proposta em `§5`**, execução é ato do
   coordenador de workflow sobre `docs/context/plataforma-dados/tasks.toml`, não deste `tasks.toml`.

---

## 3. As tasks — fase `00` · A coluna de valor que faltava (4)

Componente `sentimento`. Requisitos: `ADR-034/D7`; `CA-F0-1..3`. Juiz: `quant-architect`. Epic
proposto: **1 novo** (F0).

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-00.1` | `[sentimento]` `value_raw TEXT NOT NULL` no `CREATE TABLE` de `postgres_series_sink.py` | coluna nova no DDL; nenhuma coluna OHLC (recusado explicitamente) | `CA-F0-3`: `grep -n 'value_raw' .../postgres_series_sink.py` → ≥ 1. Morde: ausência ⇒ reprova | — | `ADR-034/D7` |
| `T-00.2` | `[sentimento]` `SeriesRow.value_raw: str` em `provenance.py`, `__post_init__` recusa string vazia | mesma disciplina das outras colunas de texto obrigatórias | `CA-F0-2`: `SeriesRow(..., value_raw="")` → `InvalidSeriesRowError`. Morde: aceitar silenciosamente ⇒ reprova | — | `ADR-034/D7` |
| `T-00.3` | `[sentimento]` `series_row_wire.py`: `FIELD_NAMES` ganha `value_raw`; round-trip 4×16 | teste estendido (era 4×15) | `CA-F0-1`: `encode`→`decode`→comparação campo a campo, 16 campos. Morde: remover `value_raw` do `decode` ⇒ vermelho | `T-00.2` | `ADR-034/D7` |
| `T-00.4` | `[sentimento][docs]` Migração de schema — script/instrução `ALTER TABLE md.series ADD COLUMN value_raw TEXT` para ambiente onde a tabela já exista | nomeia o script; **não decide** QUEM roda em produção nem QUANDO (`M3`, já respondida: base local truncada, custo zero) — registra a resposta e o comando de truncamento como precedente | `test -f <script/instrução>` + `grep -n 'ALTER TABLE' <arquivo>` → ≥ 1. Morde: ausência ⇒ ambiente com tabela pré-existente não tem caminho documentado | `T-00.1` | `SPEC-006 §5.1`, `M3` |

**Falsificador da fase** (herdado do plano): se `01` conseguir servir um valor sem que ele tenha
vindo de `value_raw`, `00` não cumpriu o papel de única fonte de número — pega em `T-01.3`/`RN-7`,
mas o defeito nasceria aqui se `00` for feita pela metade.

---

## 4. Fase `01` · As duas rotas de `ADR-005/D1` (5)

Componentes `sentimento` (`T-01.1`,`T-01.2`), `web` (`T-01.3`,`T-01.4`,`T-01.5`). Requisitos:
`US-1..3`, `RF-1..3`, `RN-7..9`; `CA-F1-1..7`. Depende de `00` (aresta real só em
`T-01.3`→`T-00.3`). Juiz: `quant-architect` (schema/leitura), `frontend-architect` (contrato de
rota).

**`T-01.5` nasceu de um achado do coordenador, pós-aprovação da narrativa, ANTES da
materialização:** `frontend/src/app/history-transport.ts`/`live-transport.ts` (escritos em
`T-05.9`, antes de `ADR-034` fixar o wire real) codificam o request em camelCase/ISO-8601
(`seriesKeyId`, `from`/`to`, `knowledgeTime`, `barPolicy`) — diverge de `SPEC-006 §5.2`/
`ADR-034/D1` (`series_key_id`, `window_start_ms`/`window_end_ms` epoch-ms, `knowledge_time_ms`,
`bar_policy`). Fonte de verdade é a SPEC/ADR (mais nova; epoch-ms bate com as colunas `bigint`
reais de `md.series`) — os módulos de transporte é que ficaram desatualizados, o próprio
docstring deles admite ("sem assumir um schema... que nenhuma ADR fixou ainda"). O envelope de
resposta SSE de `live-transport.ts` já bate 100% com `ADR-005/D2` (já existia quando o módulo foi
escrito); só o request de abertura diverge, mesmo motivo do history. `T-02.4` (página `/symbol`,
já depende de `T-01.3`/`T-01.4`) herda a correção de graça pela ordem de fase — nenhuma aresta
nova nela.

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-01.1` | `[sentimento]` Leitor de janela (`infra`, novo) | `SELECT` sobre `md.series` por `(series_key_id, symbol)`, `bucket_end ∈ [window_start−lookback_ms, window_end]`; `lookback_ms ≥ max(bucket_interval_ms, asof_max_staleness_ms)` | teste: janela real devolve só os buckets no intervalo, nenhum vazamento antes de `window_start−lookback_ms`. Morde: `lookback_ms` fixo/ignorado ⇒ `as_of` de `01.2` fica sem dado | — | `ADR-034/D9` |
| `T-01.2` | `[sentimento]` Use-case de leitura — `as_of()` por grade, par discriminado, recusa mal-formado | para cada instante de grade, chama `as_of(t, purpose=RENDERING, bar_policy, knowledge_time, observations)`; projeta `(value, absence)`; levanta exceção tipada se `AsOfReading` vier com os dois nulos ou os dois não-nulos | `CA-F1-5` (metade): teste unitário com `AsOfReading` mal-formado ⇒ exceção, nunca devolve linha. Morde: engolir e devolver `None`/zero ⇒ reprova `RN-9` | `T-01.1` | `ADR-034/D5`,`D9` |
| `T-01.3` | `[web]` `GET {API_PREFIX}/series-history` | query `series_key_id`,`symbol`,`interval`(só`"1m"`),`window_start_ms`,`window_end_ms`,`knowledge_time_ms`,`bar_policy`(obrigatório); `422` nomeado (`interval≠1m`, `bar_policy` ausente/fora do enum, `knowledge_time_ms` futuro); `500` quando `T-01.2` levantar a exceção de malformação; envelope de 3 níveis (`SPEC-006 §5.2`) | `CA-F1-1` (`grep -rlE '"/series-history' backend/src/api`→≥1) · `CA-F1-2` (2 chamadas mesma chave→byte-idênticas) · `CA-F1-3` (`interval=5m`→`422`) · `CA-F1-5` (metade: schema check da resposta real) · `CA-F1-6` (`grep -rn 'binance\|coinalyze'`→0) · `CA-F1-7`/`RN-7` (`grep -rn 'MOCK\|FIXTURE'` fora de teste→0). Morde: qualquer um dos 6 falhando | `T-01.2`, `T-00.3` | `ADR-034/D1`,`D4`,`D6`; `SPEC-006 §5.2` |
| `T-01.4` | `[web]` `GET {API_PREFIX}/series-live` (SSE) | `Content-Type: text/event-stream`; envelope `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)` a `max(1Hz,1/TF)`, `ADR-005/D2` inalterado; sem `bar_policy` | `CA-F1-4` (`curl -sD - <rota>\|grep -i text/event-stream`→1 linha) · `CA-F1-6` (mesma checagem de chamada direta a exchange, aplicada a este arquivo). Morde: ausência de `Content-Type` ou chamada direta a exchange ⇒ reprova | — | `ADR-005/D2`; `ADR-034/D1`,`D4` |
| `T-01.5` | `[web]` Corrige `history-transport.ts`/`live-transport.ts` para os nomes/tipos de `SPEC-006 §5.2` | `encodeHistoryRequest`/`decodeHistoryRequest`/`historyRequestUrl` e `OPEN_REQUEST_PARAM_ORDER` de `live-transport.ts`: `seriesKeyId`→`series_key_id`, `from`/`to` ISO→`window_start_ms`/`window_end_ms` epoch-ms, `knowledgeTime`→`knowledge_time_ms` epoch-ms, `barPolicy`→`bar_policy`; `history-transport.test.ts`/`live-transport.test.ts` atualizados no mesmo commit | teste: request codificado bate byte-a-byte com os nomes de query de `T-01.3`/`T-01.4`. Morde: request antigo (camelCase/ISO) ⇒ `422` da rota real (`CA-F1-3`-like) | — | `SPEC-006 §5.2`; `ADR-034/D1` |

**Falsificador da fase** (herdado): `200` para `interval=5m` com número que não é soma exata dos
fatos de 1 min é subestimativa silenciosa — `D6` proíbe.

---

## 5. Fase `02` · A página `/symbol` (4)

Componentes `charts` (`T-02.1`,`T-02.3`), `web` (`T-02.2`,`T-02.4`). Requisitos: `US-4..6`; `RF-4`;
`RN-3`; `CA-F2-1..5`. Depende de `01`. Juízes: `frontend-architect` (fronteira `charts`↔`web`) +
`ux-ui-mastery` (gate de design — tela já aprovada no Stitch, `S2 Rev. B`; esta fase monta, não
desenha).

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-02.1` | `[charts]` `frontend/src/charts/index.ts` — barrel único | execução headless S2, composição de painéis, adaptador lightweight, tokens de cor, tipos de política de ausência; nenhuma função nova de geometria, só reexportação | suporta `CA-F2-1` (medido em `T-02.4`). Morde: exportar algo que não existia antes ⇒ vazou geometria nova, fora do escopo | — | `ADR-034/D8` |
| `T-02.2` | `[web]` Bloco de ESLint em `eslint.config.mjs` escopado a `src/app/symbol/**` | `files:["src/app/symbol/**/*.{ts,tsx,mts,cts}"]` DEPOIS do bloco `web`; `no-restricted-imports` com as 3 negações; os 3 seletores de `no-restricted-syntax` | suporta `CA-F2-4` (medido em `T-02.3`). Morde: bloco antes do bloco `web` ⇒ ordem de precedência do ESLint erra | — | `ADR-034/D8` |
| `T-02.3` | `[charts]` `eslint-boundary.test.ts` — 3 casos novos | morde-1 (import profundo dentro de `symbol`), morde-2 (vazamento para `console`), cala (barrel dentro de `symbol`) | `CA-F2-4`: os 3 casos rodados juntos, veredito esperado em cada um. Morde: qualquer um dos 3 com veredito trocado ⇒ reprova | `T-02.1`, `T-02.2` | `ADR-034/D8` |
| `T-02.4` | `[web]` `frontend/src/app/symbol/page.tsx` (Server Component) | monta BTCUSDT, Preço+OI+CVD (delta e acumulado), 4 dias, consumindo `history-transport.ts`/`live-transport.ts` já existentes; ausência de OI/CVD renderizada como ausência, não `0` | `CA-F2-1` (só barrel, 0 import profundo) · `CA-F2-2` (`history-transport`/`live-transport` presentes) · `CA-F2-3` (resposta real com `absence:"SEM_PONTO"` → estado de ausência) · `CA-F2-5` (eixo com janela de 4 dias real, tolerância ≤0,5px). Morde: qualquer um dos 4 | `T-02.1`, `T-01.3`, `T-01.4` | `RF-4`,`US-4..6` |

**Falsificador da fase** (herdado): `symbol` passando no ESLint com `charts/s2-cvd` importado
direto é `ADR-034/D8` violada mesmo com `CA-F2-1` "verde" se o teste morde-1 não rodar de verdade.

---

## 6. Fase `03` · `/painel` → `/console` (5)

Componente `web`. Requisitos: `US-7..8`; `RF-5..6`; `CA-F3-1..4`. **Independente de `01`/`02`, mas
fecha por último** (`I-3` do PRD — não competir por revisão com a rota nova). Juiz:
`frontend-architect`.

| id | título | escopo | DoD (⇒ verde · morde) | deps | cobre |
|---|---|---|---|---|---|
| `T-03.1` | `[web]` `frontend/src/app/painel/` → `frontend/src/app/console/` | renomeia `page.tsx`, `PainelClient.tsx`→`ConsoleClient.tsx`, `error.tsx`, `loading.tsx`, `source-state.ts` | build passa com o diretório novo; `ls frontend/src/app/painel` → inexistente. Morde: diretório antigo sobrevivendo ⇒ duplicidade de rota | — | `ADR-034/D2` |
| `T-03.2` | `[web]` `routes.ts`: `ROUTES.panel`(`"/painel"`)→`"/console"` | considerar renomear a chave `panel`→`console` (identificador PT órfão) | `CA-F3-2`: `grep -n 'panel:\|console:' routes.ts` → valor `"/console"`. Morde: valor antigo ⇒ reprova | `T-03.1` | `RF-5` |
| `T-03.3` | `[web]` `not-found.tsx` e demais referentes a `ROUTES.panel`/`"/painel"` | busca e atualiza todo referente fora de `routes.ts` e do diretório já renomeado | `grep -rn '"/painel"' frontend/src --include='*.ts*'` → 0 fora de comentário histórico. Morde: referente vivo ⇒ 404 em produção | `T-03.2` | `RF-5` |
| `T-03.4` | `[web]` `frontend/e2e/01-painel-carrega.spec.ts` → rota `/console` (renomear arquivo) | e2e aponta para `/console`; roda o falsificador agregado de `CLAUDE.md` como fechamento da fase | `CA-F3-1` (`git ls-tree` + `awk` + `grep -vxE` → sem `painel`) · `CA-F3-4` (`grep -rn '/painel' frontend/e2e` → 0). Morde: qualquer um dos 2 | `T-03.1`, `T-03.2`, `T-03.3` | `RF-5`; `CLAUDE.md` linha 12 |
| `T-03.5` | `[web]` `next.config.ts`: `redirects()` ganha `{source:"/painel",destination:"/console",permanent:true}` | array `redirects()` já existente | `CA-F3-3`: `curl -sD - <base>/painel` → `Location: /console`, `308`. Morde: `404` ou `200` com conteúdo antigo (cache) ⇒ reprova `US-8` | `T-03.1` | `ADR-034/D3`; `RF-6` |

**Falsificador da fase** (herdado): `curl <base>/painel` devolvendo `404` genérico ou `200` com
conteúdo antigo é o bookmark quebrando exatamente do jeito que `US-8` proíbe.

---

## 7. `M1` — destino de `T-05.2`/`T-08.9` na mãe (proposta, NÃO executada aqui)

`T-05.2`/`CST-36` (item `5.1`, S2-mínima com fixture) e `T-08.9`/`CST-77` (item `8.6`, moldura de
as-of) estão `status="done"` em `docs/context/plataforma-dados/tasks.toml:697,1357` — cumpriram o
DoD de geometria com fixture, nenhuma cobriu rota real ou página. `SPEC-006 §12/M1` já fixa o
default: **`superseded`, `refs` para as tasks desta filha.**

**Proposta, mesmo mecanismo de `T-07.15/16/17` em `captura-em-producao`
(`docs/INDEX.md:2026-09-07T19:50Z`):** após `TASKS_APPROVED` desta filha, o coordenador de workflow
edita `plataforma-dados/tasks.toml`:

```
T-05.2 (CST-36): status = "blocked"  # resolve: superseded por pagina-de-grafico-s2 T-02.4 (CST-???)
T-08.9 (CST-77): status = "blocked"  # resolve: superseded por pagina-de-grafico-s2 T-02.4 (CST-???)
```

com `CST-???` preenchido só depois de `T-02.4` ser cardada (número real, não estimado). **Não
executado nesta narrativa** — é ato do coordenador, não do `/tech-lead` desta feature (a mãe não é
o escopo de escrita desta filha).

---

## 8. Contagem por fase

| fase | tasks | componente(s) | Epic Jira |
|---|---|---|---|
| `00` | 4 (`T-00.1`..`T-00.4`) | `sentimento` | `CST-168` |
| `01` | 5 (`T-01.1`..`T-01.5`) | `sentimento`, `web` | `CST-169` |
| `02` | 4 (`T-02.1`..`T-02.4`) | `charts`, `web` | `CST-170` |
| `03` | 5 (`T-03.1`..`T-03.5`) | `web` | `CST-171` |
| **total** | **18** | — | **4 Epics novos** (`CST-168..171`), **18 Tarefas** (`CST-172..189`) |

`T-01.5` foi acrescentada DEPOIS da aprovação da narrativa, por achado do coordenador de que
`history-transport.ts`/`live-transport.ts` (já existentes, `T-05.9`) divergem do contrato que
`SPEC-006 §5.2` fixa — ver `§4` acima. Cardada junto com as demais nesta materialização.

Tracker: `jira`, projeto `CST`, board `36`. Nenhuma `local_only` proposta — feature inteira cardável
(0 issues pré-existentes conflitantes, `§0`).

---

## 9. Gate de handoff

- [x] cada task tem DoD verificável com comando e universo, remetendo ao `CA-*` da `SPEC-006 §8`
- [x] `depends_on` só com aresta real (código), fase-a-fase por portão de workflow (`RN-1`)
- [x] prefixo de título = `components`, enum de `harness policy --key components`
- [x] `M1` registrado como proposta, não executado (não é escopo desta filha)
- [x] `F0` isolável — nenhuma task de `F0` depende de `F1`/`F2`/`F3`

**Próximo passo:** `docs/context/pagina-de-grafico-s2/tasks.toml` (18 tasks, 4 Epics `CST-168..171`)
+ `handoff_to_builder.md` materializados nesta sessão; `harness tasks validate
pagina-de-grafico-s2`; `harness pipeline scope pagina-de-grafico-s2 add
backend/src/modules/sentimento backend/tests/sentimento frontend/src/app/symbol
frontend/src/app/console frontend/src/app/painel frontend/src/charts frontend/e2e
frontend/eslint.config.mjs frontend/next.config.ts frontend/src/app/routes.ts docs/specs
docs/plans/SPEC-006-pagina-de-grafico-s2 docs/adr docs/context/pagina-de-grafico-s2
docs/INDEX.md`; então `advance pagina-de-grafico-s2 TASKS_APPROVED`.
