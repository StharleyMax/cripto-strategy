# Gate `/architect` sobre `PRD-004` — Gap Analysis · `captura-em-producao`

**Veredito: `APPROVED` — `[READY FOR SPEC]`.** Nenhum gap bloqueante. Seis correções não-bloqueantes, absorvidas pela `SPEC-004` (nenhuma exige reescrever o PRD). **Rev de medição:** `master@0acf947` (mesma do PRD) · **Data:** 2026-09-07 · **Ledger antes:** `PRD_DRAFT` com `dispatch architect` registrado.

## 1. O que re-medi (n=11) e o veredito de cada número

| # | afirmação do PRD | comando | resultado | veredito |
|---|---|---|---|---|
| G1 | `build:` sem Dockerfile | `ls backend/Dockerfile frontend/Dockerfile` · `grep -n 'build:\|context:' deploy/compose.yml` | **ambos ausentes**; `build:` em `:46` (api) e `:63` (web) | **confirmado** `[MEDIDO 2026-09-07]` |
| l.4 | 4 serviços | `grep -nE '^\s{2}[a-z_-]+:$' deploy/compose.yml` | `postgres api web caddy` + 3 volumes | confirmado |
| l.7/G2 | coletores não gravam `IngestRun` | `grep -rnE 'IngestRun\|ingest_run'` nos 3 módulos | **0** | confirmado |
| l.8 | 1 implementação de `IngestRecordSource` | `grep -rn 'class .*RecordStore' backend/src` | 1 (`sqlite_ingest_record_store.py:155`) | confirmado |
| l.10 | `G-A` disparado | `grep -nE 'psycopg' backend/pyproject.toml` | `:64 psycopg[binary] (==3.3.5)` | confirmado |
| l.18 | 8 regras `block` | `harness rules list --severity block \| grep -c BLOQUEIO` | **8** | confirmado |
| RNF-2 | 0 `MAXLEN` | `grep -rn 'MAXLEN\|maxlen' backend/src \| wc -l` | 0 | confirmado |
| RN-2 | 0 `XADD` fora do bus | `grep -rn 'xadd\|XADD' backend/src --include='*.py' \| grep -v redis_stream_bus.py \| wc -l` | 0 | confirmado |
| l.14 | Docker 20.10.17 / compose v2.19.1 | `docker --version; docker compose version` | idem; daemon `24.0.4` alcançável | confirmado |
| RF-2 | `SeriesRow` tem **12** campos | `.venv/bin/python -c "…len(dataclasses.fields(SeriesRow))"` | **15** (`is_final`, `principal_id` e mais 1 além dos 12) | **corrigir** — C3 |
| RF-4 | `IngestRun` tem **15** campos | idem sobre `IngestRun` | **16** (os "15" são `INGEST_HEALTH_RUN_COLUMNS`, a projeção do relatório) | **corrigir** — C4 |

## 2. Gap Analysis — as quatro perguntas do fluxo

- **As regras se contradizem?** Não. `RN-1..RN-8` são mutuamente consistentes; `RN-3` delega o motor a este gate (feito em `ADR-031`); `RN-6`/`NG-8` e `CA-E2E-3` dizem a mesma coisa por dois instrumentos.
- **Os critérios são testáveis?** Sim — 22 CAs, cada um com comando e coluna "morde". Dois têm placeholder (`<alvo local>`, `<tabela série>`) que a SPEC fecha (`§3.6`, `§3.4`).
- **Os tipos estão definidos?** `IngestRun`/`IngestGap`/`SeriesRow`/`Provenance` existem em código; o wire e o DDL da série são `TBD` **com dono e fase** — aceitável para PRD, fechado em forma (não em código) pela SPEC.
- **Casos de borda?** Restart do escritor, morte do produtor, misconfig, fila cheia, duplicata, coletor parado: todos com comportamento definido. Lacuna: `ingest_gap` por reconexão (`[Q10]`) — fica com o `quant-architect`, não bloqueia.

## 3. Correções não-bloqueantes — a SPEC as absorve

| # | achado | evidência | efeito |
|---|---|---|---|
| **C1** | `§1.2 l.1` (`import redis` → 0) **mede zero por construção, para sempre**: o código de produção fala RESP2 por socket cru (`infra/redis_resp_client.py`), e `redis` não é dependência | `backend/pyproject.toml:89-91` `[DOC]`; `grep -n '^redis\|"redis' backend/pyproject.toml` → só `fakeredis` (dev) | l.1 sai da SPEC como evidência; `CA-F1-1` (conta `RedisStreamPublisher(`) é o instrumento certo. **O DoD de `T-07.15` na mãe ("import redis nos dois CLIs") herda o mesmo defeito** — `/tech-lead` não deve copiá-lo (`M1`) |
| **C2** | **`[GAP G9]` novo:** `.env.example` (versionado, 6 vars: `APP_PORT API_PREFIX INGEST_HEALTH_STORE_PATH INGEST_HEALTH_API_BASE_URL PUBLIC_HOST PANEL_BASIC_AUTH_HASH`) **não declara** `POSTGRES_DB/USER/PASSWORD`, que `deploy/compose.yml` exige com `:?` | `git show HEAD:.env.example \| grep -c POSTGRES` → **0**; `grep -oE '\$\{[A-Z_]+' deploy/compose.yml \| sort -u` → 5, 3 delas `POSTGRES_*` `[MEDIDO 2026-09-07]` | `CA-F3-1` (*"`cp .env.example .env` && config -q"*) **reprova hoje** por motivo alheio à feature; `SPEC-004 §3.6` acrescenta as vars a `.env.example` (`RF-12` novo). Resolve `[GAP G8]` — a leitura veio por `git show`, não pelo path bloqueado |
| **C3** | `SeriesRow` = 15 campos, não 12 | §1 acima | `RF-2`/`CA-F1-2`: round-trip sobre **15 × 4** |
| **C4** | `IngestRun` = 16 campos, não 15 | §1 acima | `RF-4`: mapeamento de **16** campos; a linha 11 de `CLAUDE.md` (15 colunas) é a projeção, não o dataclass |
| **C5** | `§1.2 l.11` diz *"nenhuma imagem TimescaleDB"* — verdadeiro **para o compose**; `ADR-002:172` nomeia `timescale/timescaledb:2.17.2-pg15` como a imagem que o spike `T-08.1` mediu | `grep -noE 'timescale[a-zA-Z/:-]*[0-9.a-z-]*' docs/adr/ADR-002-*.md` → `:172` | `[Q5]` tem resposta medida — `ADR-031/D2` |
| **C6** | `compose.yml` com `include:` (candidato natural para `[Q7]`) é **ignorado em silêncio** pelo compose `v2.19.1`: `config --services` → **0 serviços, `rc=0`** | experimento em scratchpad, `[MEDIDO 2026-09-07]` (E5) — `include:` só existe a partir do 2.20 | `ADR-032` recusa `include:` com número; a forma escolhida foi medida (E2/E3/E4) |

## 4. Os pedidos do handoff e onde cada um foi atendido

| pedido | onde |
|---|---|
| Gap Analysis | este arquivo; `SPEC-004 §0` |
| `RN-3`/`M2` motor do registro | **`ADR-031/D1`** — Postgres por adaptador (default pela premissa *"só Postgres"*); SQLite em volume recusada com custo |
| `[Q5]` imagem | **`ADR-031/D2`** — `timescale/timescaledb:2.17.2-pg15` `[INFERRED]` |
| `[Q3]` definição de run | `[NÃO SEI]` — **dono `quant-architect`**, prazo: antes de `F1` fechar (`SPEC-004 §3.3`, plano `01` item 1.6); default provisório `I-3` do PRD |
| `[Q7]` forma dos dois alvos | **`ADR-032/D1`** — `deploy/compose.yml` (deploy, 7 serviços) + `deploy/compose.local.yml` (overlay explícito, `-f -f`), medido |
| Dockerfiles | `ADR-032/D2` + plano `03` |
| SPEC + plano F1→F3 | `docs/specs/SPEC-004-captura-em-producao.md` · `docs/plans/SPEC-004-captura-em-producao/` |

## 5. Ledger

`harness pipeline approve captura-em-producao prd "gap analysis ok: 11 numeros re-medidos, 0 bloqueantes, 6 correcoes nao-bloqueantes absorvidas pela SPEC-004 (gates/PRD-004-architect.md)"` → `advance PRD_VALIDATED` → (SPEC escrita) → `advance SPEC_DRAFT`. **`SPEC_APPROVED` é do owner**; as decisões que o `approve spec` toma estão no cabeçalho da `SPEC-004`.
