# Handoff — a página de gráfico não existe: `[Q12]` de `SPEC-004`, e de quem é a decisão

**Pedido do owner, literal `[PREMISSA-OWNER: 2026-09-07]`:** *"abrir uma nova para o handoff da questao do
grafico e q12"*. Origem: PR #166 §2 (`execucao-local-2026-09-07.md`), onde o owner perguntou *"como abro
um gráfico?"* e a resposta medida foi: não há.

Não é PRD nem ADR. É o material para o owner decidir **onde** a UI de gráfico nasce, com o custo de
cada caminho. **Nenhuma decisão é tomada aqui.**

## O que existe hoje, medido em `master@b7f9fdb`

| fato | comando | resultado |
|---|---|---|
| rotas Next | `find frontend/src/app -name page.tsx \| wc -l` | **1** — só `/painel` (S1 + S3) |
| módulos de `charts` com prefixo `s2-` | `ls frontend/src/charts \| grep -c '^s2-'` | **32** (geometria, as-of, anotação, política de ausência, eixo) |
| motor headless | `ls frontend/src/charts/headless-chart.ts s2-headless-run.ts` | existem — S2 roda **sem DOM**, para teste |
| página que importe `history-transport`/`live-transport` para desenhar | PR #166 §2, `grep -rln` | **0** — só testes e as queries de S1/S3 (reuso de tipo) |
| rotas HTTP do backend | `grep -rhoE '@router\.get\("[^"]+"' backend/src/api/routes` | "/ingest-health" "/series-catalog" "/ready" "/series-quarantine" "/collector-status"  |
| rota de histórico/ao vivo de série (`ADR-005/D1`) no backend | `grep -rlE '"/history\|"/live\|text/event-stream' backend/src/api` | **0 arquivos** — **não existe** |
| design da S2 | `docs/product/STITCH_CONTEXT.md:5` | **APROVADA**: `S2 Símbolo - Operacional Core Rev. B` (`8174…`), 0 reprovações |

**Leitura:** a S2 existe como **geometria testada** (`charts`), como **design aprovado** (Stitch) e como
**protocolo de transporte no cliente** (`history-transport.ts`, `live-transport.ts`). Faltam as **duas
pontas**: a rota Next que a monta e as rotas do backend que a alimentam (`ADR-005/D1`: histórico por HTTP
endereçável por conteúdo + ao vivo por SSE). É o mesmo defeito que a revisão de 2026-09-04 achou no
`/painel` — cliente pronto, servidor ausente — repetido no componente `charts`.

## Onde a S2 está prometida, e por quem

- `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` item **5.1** — *"S2-mínima: 1 símbolo (BTCUSDT), 4 dias, painéis Preço + OI + CVD"*, Epic `CST-3`, componente `charts`. Fase `05` tem QA `APPROVED` na mãe — **aprovada com a página ausente**, pelo mesmo mecanismo que `05_fatia_visivel.md:225` nomeia como defeito (*"fechar com o servidor ausente"*).
- `08_superficie_e_reprodutibilidade.md` item **8.6** — *"S2 completa"*, Epic `CST-6`, e as regras de render `D8.13`/`D8.14`/`D8.18` (`ADR-026`).
- `ADR-005` (transporte de leitura: D1 duas rotas, D5 porta é o backend, D6 envelope), `ADR-003` (fronteira `charts`↔`web`), `ADR-020` (motor⇄renderização de S4), `ADR-010` (cor por tipo de marca), `ADR-025` (grade canônica versionada).
- `SPEC-004` §8 `[Q12]`: *"Terceira filha de `plataforma-dados` ou reabertura da `camada-de-leitura-do-painel`? — dono owner"*.

## Dependência que não dá para pular

Um gráfico de OI/CVD sobre BTCUSDT precisa de **série gravada**. Hoje o único escritor real de
`md.ingest_run` é `persist_ntp_skew_run.py` (PR #159; `ADR-030` §contexto). **A S2 só mostra algo depois
que `captura-em-producao` F1/F2 estiverem gravando** — ou sobre fixture, que é exatamente o que a revisão
de 2026-09-04 condenou no `/painel`. Ordem honesta: `captura-em-producao` → rotas de leitura de série →
página S2.

## Menu para o owner — três caminhos, com custo

| # | caminho | o que entra | custo/risco | quem escreve |
|---|---|---|---|---|
| **A** | **Terceira filha** de `plataforma-dados` (ex.: `pagina-s2-simbolo`), ledger limpo, `depends_on` de `captura-em-producao` F2 | rotas backend de histórico + SSE (`ADR-005/D1`), rota Next `/simbolo/[symbol]` (ou o que a linha 12 de idioma decidir), montagem da S2 sobre `headless-chart`, e2e | mais um ledger (o padrão que funcionou duas vezes); a fase `05`/`08` da mãe fica com `5.1`/`8.6` **superseded**, como `T-07.15/16/17` | `/pm` → `/architect` (`frontend-architect` + `quant-architect` para semântica de série) |
| **B** | Reabrir `camada-de-leitura-do-painel` com uma **F4** | mesmo conteúdo de A, dentro de uma feature que está com 3/3 fases QA APPROVED e a caminho de `DONE` | mistura leitura de painel (S1/S3) com gráfico (S2/`charts`) — `ADR-003` separa os componentes de propósito; adia o `DONE` de uma feature pronta | `/architect` emenda SPEC-003 |
| **C** | Construir sob a mãe, `override` em `5.1`/`8.6` | idem, sem ledger novo | a mãe está rescopada para `docs/context/plataforma-dados` desde 2026-09-05 por decisão sua (*"atuar 100% na filha"*); cada task exige `override`; o histórico da mãe já tem 31 overrides | `/build` direto |

**O que este documento NÃO decide:** o caminho (A/B/C); o segmento de URL da rota (linha 12 da tabela de
idioma em `CLAUDE.md`, ainda `[NÃO SEI]`, dono owner); se S2-mínima entra antes ou depois de S2 completa;
se o histórico vem do Postgres de `captura-em-producao` ou de outro store. Recomendação do coordenador,
rotulada `[INFERRED]`: **A**, depois de `captura-em-producao` F2 — é o único caminho em que o primeiro
gráfico nasce sobre dado real.

## Referências
PR #166 · PR #159 · `SPEC-004` §8 `[Q12]` · `docs/context/plataforma-dados/gates/REVISAO-FB-frontend-architect.md` §2 ·
`docs/product/STITCH_CONTEXT.md` §4.1 · `frontend/src/charts/` · `frontend/src/app/{history,live}-transport.ts`.
