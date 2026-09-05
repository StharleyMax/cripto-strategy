# Fase `03` — Os recursos baratos entram pelo caminho decidido

**Componente alvo:** `sentimento` (use cases, forma dos envelopes) + `infra` (rotas, DI, 2ª env var de store) + `web` (parsers, formatador) · **SPEC:** `SPEC-003` §3.6–§3.7, §5 (B14–B16) · **PRD:** `US-9`..`US-12`; `RF-9`, `RF-11`; `RN-8`; `CA-F3-1`..`CA-F3-4`
**Entra se** o `approve spec` disser *"F1+F2+F3"* (M1). **Depende de:** `02` (prefixo; `create_app` que recusa — a regra vale para `QUARANTINE_STORE_PATH`) **e** da **[`ADR-030`](../../adr/ADR-030-agregado-por-serie-collector-status-formulas-sobre-runs-existentes.md) do `quant-architect` sobre o envelope agregado por série** (`[Q7]`, escrita em 2026-09-05, prazo era **2026-09-11** `[INFERRED I-9]`) — **`dispatch builder` desta fase é recusado sem ela referenciada aqui**. **Juízes:** `quant-architect` (forma dos envelopes e fórmulas), `infra-architect` (rotas/DI), `frontend-architect` (parsers).

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 3.1 | Use case `list_series_catalog()` concatenando as **7** constantes `SeriesCatalogEntry(` de `cvd_source_catalog`/`price_source_catalog`/`open_interest_catalog`; rota `GET {API_PREFIX}/series-catalog` com envelope `{"query":"series_catalog","n_entries":7,"entries":[…]}`; **0** SQL no handler; DI stub em `dependencies.py` | `US-9`, `RF-9` | `sentimento` (use case) + `infra` (rota) | não calcula `Completeness` (`4c`, `NG-3`) |
| 3.2 | `parseCatalogEnvelope` no front compondo `assertValidCatalogEntry` + `QuarantineTerms` + `Completeness: unmeasured`; S3 exibe as 7 linhas; estrito em campo ausente (`ADR-019/D2`) | `US-9` | `web` | não usa `FIXTURE_CATALOG_ROWS` |
| 3.3 | Porta `list_all()` no store de quarentena (`sqlite_series_quarantine_store.py`); `QUARANTINE_STORE_PATH` em `src.main` (ausente/pai inexistente ⇒ `create_app` recusa); rota `GET {API_PREFIX}/series-quarantine` com `rows` **sem `points_json`** | `US-11`, `RF-9` | `sentimento` (porta) + `infra` (rota, env) | não decide onde o store mora em prod (`[Q8]`, `ADR-002`) |
| 3.4 | Gaveta de quarentena lê a rota; `FIXTURE_DIVERGENCES` fora do grafo de produção | `US-11` | `web` | — |
| 3.5 | Use case de agregação por série sobre `IngestRecordSource.runs()` (porta existente, sem método novo); rota `GET {API_PREFIX}/collector-status` (`I-10`); envelope **separado** `{"query":"collector_status","n_rows":N,"rows":[CollectorRow…]}` — fórmulas de `status`/`uptimePercent`/`resilience`/`retention` **conforme `ADR-030` D1–D4** (`now` injetado; `liveness`/`age_s`/`window_hours` no fio) | `US-10`, `RF-9` | `sentimento` + `infra` | **não toca** as 15 colunas nem `to_envelope()` (`NG-9`) |
| 3.6 | Parser próprio do agregado no front; S1 passa a exibir o agregado (não o último run); parser reprova campo ausente | `US-10` | `web` | não recalcula `janela_de_perda` (`RN-4`) |
| 3.7 | Formatador único `Intl.NumberFormat("pt-BR")` na apresentação; **0** `toLocaleString` espalhado; fio com ponto decimal; cabeçalhos humanos (`Janela de perda`) sem tocar a coluna | `US-12`, `RF-11`, `RN-8` | `web` | não renomeia coluna de contrato (linha 11) |
| 3.8 | Testes: pytest por rota (de pé; 0 SQL no handler; `points_json` ausente; `create_app` recusa sem `QUARANTINE_STORE_PATH`); TS por parser (campo ausente ⇒ reprova); e2e `07` (locale) e S3/S1 com dado real; `F-D6-2` (`sha256` de `/ingest-health` **não muda** com as rotas novas) | `CA-F3-1..4` | todos | — |

## DoD — comando, universo, e a coluna "servidor ausente"

| DoD | comando (⇒ verde) | servidor ausente (⇒ o que TEM de acontecer) |
|---|---|---|
| **D3.0** pré-condição | `grep -n 'ADR-0[0-9][0-9]' docs/plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md` cita a ADR do agregado, e ela existe em `docs/adr/` com data ≤ 2026-09-11 | sem ela ⇒ `dispatch builder` **recusado** |
| **D3.1** catálogo = 7 | `curl -s $API$PREFIX/series-catalog \| python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["n_entries"],len(d["entries"]))'` → `7 7`; `= grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' \| grep -v test \| wc -l` (7); `grep -rn 'SELECT' backend/src/api \| wc -l` → **0**; e2e: S3 `catalog_rows = 7` | `curl → 000`; S3 exibe `error_kind:connection_refused`, `catalog_rows = 0`; **`FIXTURE_CATALOG_ROWS` visível ⇒ reprova** |
| **D3.2** quarentena sem `points_json` | `curl -s $API$PREFIX/series-quarantine \| python3 -c 'import json,sys;r=json.load(sys.stdin)["rows"];assert r==[] or "points_json" not in r[0]'`; `QUARANTINE_STORE_PATH=<x>/nao-existe/q.sqlite3 python -m src.main` → `rc ≠ 0` | `000`; gaveta mostra erro, **não** `FIXTURE_DIVERGENCES` (`grep -c FIXTURE_DIVERGENCES <main>` → 0 sempre) |
| **D3.3** agregado separado, `D6.1` intocado | `sha256` do corpo de `/ingest-health` **igual** antes e depois das rotas novas sobre o mesmo store (`F-D6-2`); `curl -s $API$PREFIX/collector-status \| python3 -c '…assert d["query"]=="collector_status"'`; parser TS reprova envelope com campo ausente (teste com 1 campo removido por vez, universo = nº de campos da ADR) | `000`; S1 mostra erro, **não** o último `CollectorRow` de cache nem fixture |
| **D3.4** locale único | e2e `07`: `comma_decimal_hits = 0` **ou** `dot_decimal_hits = 0` (hoje 2 e 13); `grep -rn toLocaleString frontend/src --include='*.tsx' \| grep -v test \| wc -l` → **0**; `curl … \| grep -cE '"[a-z_]+": *[0-9]+,[0-9]+'` (vírgula decimal no fio) → **0** | n/a (formatação) — mas só mede com dado real (`D1.3`), declarado |
| **D3.5** rótulo ≠ coluna | e2e: `<th>` contém `Janela de perda`, **não** `JANELA_DE_PERDA`; `grep -c '"janela_de_perda"' backend/src/modules/sentimento/domain/ingest_record.py` inalterado (a coluna não mudou) | n/a |
| **D3.6** fixture fora | `grep -rn 'fixtures.ts' frontend/src/app frontend/src/features --include='*.tsx' \| grep -v '\.test\.' \| wc -l` → **0** (erosão) | declarado |
| **D3.7** camadas e portões | `make boundaries` verde; `make verify` verde; `make test` inclui os pytest novos (universo: `grep -c 'def test_' backend/tests/api/*.py`); `make e2e` verde de pé | `make e2e` no chão ⇒ `D3.1`/`D3.2`/`D3.3` ✘ |

## Falsificador da fase

**Se o `sha256` de `/ingest-health` mudar com as rotas novas, a fase tocou o que `NG-9` proíbe** — `F-D6-2` é o controle. Segundo: se S1 ou S3 exibirem linha alguma com a API no chão, a fase reintroduziu a fixture como ponte (`RN-3`). Terceiro: se `D3.5` passar renomeando a coluna em vez do rótulo, `RN-8` foi violada e o `sha256` de todo relatório emitido moveu (`ADR-008/D3`).

## O que esta fase NÃO faz

Não entrega `2`, `3`, `4c`, `6` (`NG-3` — segunda feature filha, se o owner quiser) · não abre SSE (`NG-4`) · não decide store de quarentena em prod (`[Q8]`) · não decide as fórmulas do agregado (`ADR-030`) · não pagina (`[Q5]`) · não toca as 15 colunas · não implanta.
