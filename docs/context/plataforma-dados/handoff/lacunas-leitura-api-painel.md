# Handoff — lacunas de leitura: o que o `/painel` precisa e a API não expõe

Origem: pergunta do owner na sessão de 2026-09-04/05, depois de fechar `ADR-027` (o lado
**escrita** do pipeline: coletor → fila → escritor único). Este documento é o espelho do lado
**leitura**: o que a tela `/painel` (S1 Console + S3 Inspector) precisa buscar, e o que a API
(`backend/src/api`) hoje expõe pra alimentar isso. Não é task nem ADR — é o material bruto para
quem for decidir o próximo passo (provavelmente `frontend-architect` + `quant-architect`, na
forma que decidirem: uma task por recurso, ou um ADR único de "camada de leitura do painel").

## O que existe hoje, medido

```
wc -l backend/src/api/dependencies.py backend/src/api/routes/ingest_health.py
→ 32 linhas de dependencies.py — 1 função: get_ingest_record_source
→ 36 linhas de routes/ingest_health.py — 1 rota: GET /ingest-health
```

`backend/src/api/__init__.py` registra só esse um router. **A API real deste projeto tem
exatamente 1 endpoint e 1 dependência injetada.** `GET /ingest-health` devolve `IngestRun`/
`IngestGap` — o registro cru de F0 (`run_id`, `source`, `endpoint`, `window`, `n_expected/
returned/written`, `verdict`, `api_code`, `src_sha256`, `weight_used`, `observer_id/region` —
`domain/ingest_record.py:99-114`; gaps em `:121-132`). É um log técnico de auditoria de
ingestão, não um dashboard.

## O que `/painel` precisa, recurso por recurso — com o que já existe do lado backend

O `/painel` de hoje (`frontend/src/app/painel/page.tsx`) usa fixtures estáticas para tudo — isso
já era sabido. O que este handoff acrescenta é: **para cada tipo de dado que a tela espera,
quanto do backend já existe e quanto falta construir**, porque a resposta não é uniforme.

### 1 · `CollectorRow` (S1 — "Monitoramento de Coletores e Ingestão")

`frontend/src/features/s1-console/domain.ts:180-189`:
```ts
export interface CollectorRow {
  readonly series: string;
  readonly retention: RetentionWindow;      // janela_de_perda, por fórmula
  readonly resilience: ResilienceLabel;     // ~4.7x SLO
  readonly status: CollectorStatus;         // ATIVO | PARADO | ARQUIVO | PENDENTE
  readonly uptimePercent: number | null;
  readonly statusDetail: string | null;
}
```
**O que existe:** `IngestRun` carrega `verdict`/`weight_used`/`window` por execução, mas é
**um registro por corrida**, não um status agregado por série. Nenhum use case do backend
agrega runs em "status atual da série" — `grep -rn "def.*collector_status\|def.*aggregate.*run"
backend/src/modules/sentimento/use_cases` não encontra nada.
**O que falta:** um use case novo que leia N `IngestRun` de uma série e produza o agregado
(status, uptime%, resiliência) — a fórmula de `janela_de_perda` já existe do lado frontend
(`computeUniformWindowDays`, `domain.ts`), mas seria decisão de arquitetura se ela migra pro
backend (single source of truth) ou o frontend recebe os insumos brutos e calcula de novo
(duplicando a fórmula nos dois lados, risco que `ADR-005/D6.1` já nomeou para o envelope de
`ingest_health`).

### 2 · `StorageBudgetLine` (S1 — "Orçamento Armazenamento GB/dia")

`frontend/src/features/s1-console/domain.ts:205-218`. **Não existe NADA no backend.**
```
grep -rniE "storage.budget|orcamento" backend/src --include="*.py"
→ 1 ocorrência, e é comentário sobre orçamento de PARTIÇÃO (dimensionamento de fila), não
  disco/GB por fonte — stream_partitioning.py:13
```
Não há medição de bytes escritos por fonte em lugar nenhum do backend hoje. Precisaria de uma
fonte de verdade nova (tamanho de arquivo por `source` em `data/`, ou contagem a partir de
`n_written`/tamanho médio de linha) — este é o recurso com MENOS insumo existente dos quatro.

### 3 · `ReconnectionEvent` (S1 — "Reconexões e Rotina")

`frontend/src/features/s1-console/domain.ts:229-233`. **Lógica de domínio existe, log
persistido não.** `force_order_reconnection_overlap.py`, `reconnect_force_order_stream.py`
calculam sobreposição/colisão de reconexão em tempo real, mas não persistem um log de eventos
(`[10:42:01] WS reconnect ...`) que uma rota pudesse consultar depois.
```
grep -rn "reconnection\|reconexao" backend/src/modules/sentimento --include="*.py" | grep -v test
→ só os 4 arquivos de LÓGICA de reconexão do force_order, nenhum store de eventos
```
**O que falta:** decidir se o evento de reconexão vira uma linha persistida (tabela/arquivo
append-only) no momento em que acontece, ou se é derivado post-hoc de outra fonte (ex: gaps de
`md.ingest_gap` já contam algo parecido, mas não é a mesma semântica — gap é ausência de dado,
reconexão é evento de transporte).

### 4 · `CatalogRow` (S3 — catálogo de séries, Camada 1)

`frontend/src/features/s3-inspector/domain.ts:45-50`, compõe três fontes:
```ts
export interface CatalogRow {
  readonly entry: SeriesCatalogEntry;   // metadados por SeriesKey
  readonly provenance: Provenance;
  readonly completeness: Completeness;  // grid: present/expected/gaps · tick: contiguous/jumps
  readonly quarantine: QuarantineTerms;
}
```
- `SeriesCatalogEntry` — o backend TEM o contrato (`domain/series_catalog.py`, `T-06.1`, `done`)
  e as linhas de produção já foram populadas por `T-06.2`..`T-06.9` (todas `done`) — mas
  **nenhuma rota lê esse catálogo**. `series_catalog.py:1` é só o TIPO; onde as linhas reais
  vivem (arquivo, memória, banco) precisa ser conferido antes de expor — pode já existir um
  store que só falta uma rota, ou pode ser só o contrato sem persistência real ainda.
- `Completeness` — **não existe cálculo nenhum hoje.** Precisaria de uma consulta que compare
  pontos esperados vs presentes por série (para `grid`) ou contiguidade/saltos (para `tick`).
- `QuarantineTerms` — **isto já existe de verdade em produção**: `sqlite_series_quarantine_store.py`
  é escrito hoje por `coinalyze_one_shot_cli.py` (`SqliteSeriesQuarantineStore.record()`,
  confirmado em investigação anterior desta sessão). É o recurso mais barato de expor dos
  quatro — só falta uma rota `GET` sobre uma tabela que já tem dado real.

### 5 · `GapMarkerRow` (S3 — marcador de lacuna na Camada 2)

`frontend/src/features/s3-inspector/domain.ts:64-72`. **Este já tem o caminho mais curto de
todos:** existe um cliente TS real, `frontend/src/features/s1-console/ingest-health-query.ts`,
que busca `/ingest-health` (o único endpoint que já existe) e projeta `IngestHealthGapRow` —
exatamente o shape que `GapMarkerRow` espera (`domain.ts:64-66`: *"wraps `IngestHealthGapRow`…
the SAME 8-column shape `ingest-health-query.ts` already ports"*). **Não falta endpoint nem
tipo — falta só ligar `/painel` a esse cliente em vez de `FIXTURE_GAP_ROWS`.**

### 6 · `RawDataRow` (S3 — dado cru da Camada 2, ao abrir uma série)

`frontend/src/features/s3-inspector/domain.ts:56-62`. Precisaria de leitura de linha de série
no nível de evento (`event_time`, `src_label_raw`, `values` por coluna) — isto é o maior dos
seis: é essencialmente o transporte de leitura de série completo que `ADR-005` já desenha para
`charts` (histórico/ao vivo), mas para o caso de auditoria (qualquer coluna, não só a numérica
de gráfico). Pode ser candidato a REUSAR o transporte de `ADR-005` em vez de inventar um
terceiro, mas isso é decisão de arquitetura, não fato medido.

## Síntese — nem todo recurso custa o mesmo

| # | recurso | tela | o que já existe | o que falta |
|---|---|---|---|---|
| 1 | `CollectorRow` | S1 | `IngestRun` por corrida | use case de agregação por série |
| 2 | `StorageBudgetLine` | S1 | nada | medição de bytes/dia por fonte, do zero |
| 3 | `ReconnectionEvent` | S1 | lógica de overlap/colisão | log persistido de eventos |
| 4 | `CatalogRow` | S3 | contrato + linhas de catálogo (`T-06.1`-`T-06.9`, `done`); quarentena JÁ tem dado real em SQLite | cálculo de completeness; rota sobre catálogo; rota sobre quarentena (a mais barata) |
| 5 | `GapMarkerRow` | S3 | endpoint + cliente TS já existem, ponta a ponta | só ligar `/painel` ao cliente — **zero backend novo** |
| 6 | `RawDataRow` | S3 | nada dedicado (pode reusar o desenho de `ADR-005`) | o maior escopo dos seis |

**Ordem de custo, do mais barato ao mais caro, pelo que já existe:** `5` (só fiação) → `4`-quarentena
(só rota) → `1` (agregação sobre dado que já existe) → `4`-completeness/`3` (cálculo/log novos,
mas domínio adjacente já mapeado) → `2` (do zero) → `6` (maior escopo, decisão de reuso de
transporte).

## O que este handoff NÃO decide

- Se cada recurso vira uma rota própria (`GET /collector-status`, `GET /storage-budget`, ...)
  ou se alguns se combinam num envelope maior — mesma pergunta que `ADR-005/D6.1` já resolveu
  para `ingest_health` (um envelope, uma projeção), mas aqui são domínios de dado diferentes,
  não óbvio que a mesma resposta sirva.
- Se a fórmula de `janela_de_perda`/resiliência mora no backend (fonte única) ou no frontend
  (recebe insumo bruto) — mencionado no item 1, é decisão de arquitetura.
- Se isto é uma ADR nova, uma task por recurso, ou uma única fase — segue o mesmo processo que
  fechou `ADR-027`: `/architect` decide o formato, `/tech-lead` materializa.
- Prioridade entre os seis — a tabela de custo acima é informação para quem priorizar, não uma
  recomendação de ordem.

## Referências

`frontend/src/app/painel/page.tsx`, `frontend/src/features/s1-console/domain.ts`,
`frontend/src/features/s1-console/ingest-health-query.ts`,
`frontend/src/features/s3-inspector/domain.ts`, `frontend/src/features/s3-inspector/fixtures.ts`,
`backend/src/api/__init__.py`, `backend/src/api/routes/ingest_health.py`,
`backend/src/api/dependencies.py`, `backend/src/modules/sentimento/domain/ingest_record.py`,
`backend/src/modules/sentimento/domain/series_catalog.py`,
`backend/src/modules/sentimento/infra/sqlite_series_quarantine_store.py`,
`backend/src/modules/sentimento/domain/force_order_reconnection_overlap.py`,
`docs/adr/ADR-005-transporte-de-leitura.md`, `docs/adr/ADR-027-topologia-de-processo-e-producao-real-do-escritor-unico.md`.
