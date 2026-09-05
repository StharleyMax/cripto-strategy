# Fase `02` — A API é alcançável e honesta

**Componente alvo:** `infra` (o **valor** do `ETag` é `IngestHealthReport.fingerprint()`, `sentimento`, já existe em `ingest_record.py:177` — nenhum código de domínio novo) · **SPEC:** `SPEC-003` §3.4–§3.5, §5 (B10–B13) · **ADR:** `ADR-029` D1–D6 · **PRD:** `US-5`..`US-8`; `RF-6`..`RF-8`; `RNF-1`, `RNF-3`, `RNF-5`; `RN-6`, `RN-9`; `CA-F2-1`..`CA-F2-9`
**Entra se** o `approve spec` disser *"F1+F2"* ou *"F1+F2+F3"* (M1). **Depende de:** `01` em medição (`D1.3` é o instrumento que prova que o `ETag` é consumido). **Juiz:** `infra-architect` (`harness.toml:983`); co-assinatura de `ADR-029` recomendada no `approve spec`.

## Itens

| # | item | requisito | componente | o que NÃO faz |
|---|---|---|---|---|
| 2.1 | `create_app` **lança** se `Path(store_path).parent` não existe (mensagem em inglês nomeando o caminho); `python -m src.main` ⇒ `rc ≠ 0`. Verificação no composition root, não no store | `RF-7`, `ADR-029/D3` | `infra` | não muda `_fetch` do store nem o `200` vazio de `/ingest-health` |
| 2.2 | `GET {API_PREFIX}/ready` → `200`/`503` com `{"store":{"path","exists","schema_present"}}`; sem outro campo | `RF-7`, `ADR-029/D3` | `infra` | não é health de processo; não consulta Postgres |
| 2.3 | `ETag: "<fingerprint>"` no handler de `/ingest-health`; `If-None-Match` igual ⇒ `304` sem corpo; header fora da região hasheada | `RF-8`, `ADR-005/D6.3`, `ADR-029/D4` | `infra` (valor: `sentimento`, existente) | não acrescenta campo em `runs[]` (`NG-9`) |
| 2.4 | `API_PREFIX` lido uma vez em `src.main` (default `/api/v1`, M2); rotas montadas sob ele; `openapi.json` reflete | `US-8`, `ADR-029/D2` | `infra` | não decide o segmento definitivo (`[Q2]`, owner) |
| 2.5 | Server Component envia `If-None-Match` quando tem `etag`; `304` ⇒ reutiliza a projeção anterior **no processo Next** | `RF-8`, `US-6` | `web` | não cacheia no browser |
| 2.6 | `deploy/compose.yml`: serviços `api` (imagem de `ADR-027`, **sem `ports:`**, log com teto `10m × 3`), `web`, `caddy` (`caddy:2-alpine`; volumes `caddy_data`/`caddy_config`); toda credencial `${VAR}` | `RF-6`, `RNF-3`, `RNF-5`, `RN-6` | `infra` | **não sobe nada** (`RN-9`) |
| 2.7 | `deploy/Caddyfile`: site `{$PUBLIC_HOST}`; `{$API_PREFIX}/*` → `api:{$APP_PORT}`; resto → `web:3000`; `basic_auth` condicionado a `{$PANEL_BASIC_AUTH_HASH}` (M4, inerte sem valor); TLS parametrizado (`[Q10]`) | `RF-6`, `ADR-029/D1, D2, D6` | `infra` | não decide auth nem TLS (owner) |
| 2.8 | `.env.example` ganha `PUBLIC_HOST`, `PANEL_BASIC_AUTH_HASH` (vazia), `INGEST_HEALTH_API_BASE_URL` com a variante `http://api:${APP_PORT}` comentada | `RF-5` | `infra` | nenhum valor secreto |
| 2.9 | Testes: pytest em `backend/tests/api/` para boot (`rc ≠ 0`), `/ready` (3 estados), `ETag`/`304` e igualdade `ETag == fingerprint()`; teste TS de igualdade `etag == fingerprint(parseIngestHealthEnvelope(body))`; teste de que mudar `API_PREFIX` move `openapi.json` **e** o `Caddyfile` renderizado | `CA-F2-1..9` | `infra` + `web` | — |

## DoD — comando, universo, e a coluna "servidor ausente"

| DoD | comando (⇒ verde) | servidor ausente (⇒ o que TEM de acontecer) |
|---|---|---|
| **D2.1** misconfig não vira dado | `INGEST_HEALTH_STORE_PATH=<scratch>/nao-existe/ih.sqlite3 backend/.venv/bin/python -m src.main; echo $?` → **≠ 0**, stderr nomeia o caminho (hoje sobe e devolve `200 {"n_runs":0}` `[MEDIDO: FB-infra §2]`) | é a própria metade que morde |
| **D2.2** `/ready` discrimina | 3 execuções: arquivo ausente ⇒ `503` + `"exists":false`; 0 byte ⇒ `503` + `"schema_present":false`; store válido ⇒ `200` + `true,true` — `curl -s -w '%{http_code}' $API$PREFIX/ready` | `curl → 000`; teste pytest reprova por conexão recusada — **não** por `503` |
| **D2.3** `D6.1` intocado | `/ingest-health` sobre arquivo ausente / 0 byte ⇒ `200 {"n_runs":0,…}`; `cd frontend && node --conditions=react-server --test src/features/s1-console/ingest-health-query-http.test.ts` → **8/8** (universo: 8 `test(` hoje) | `D5.14(i)` já reprova sem servidor (`…-http.test.ts:495`) |
| **D2.4** `ETag` = fingerprint, dois lados | `curl -sD - -o /dev/null $API$PREFIX/ingest-health \| grep -ci '^etag:'` → **1**; pytest: header `==` `IngestHealthReport.fingerprint()`; TS: header `==` `fingerprint(parseIngestHealthEnvelope(body))`; **controle negativo:** store com 1 run a mais ⇒ `ETag` muda | `curl → 000`; ambos os testes reprovam por conexão |
| **D2.5** `304` | `curl -H "If-None-Match: <etag>" -o /dev/null -w '%{http_code}'` → **304** e corpo vazio; `ETag` errado ⇒ **200** | `000` |
| **D2.6** Next consome | com API de pé, 2º `GET /painel` ⇒ access log mostra `304` na 2ª linha `GET …/ingest-health`; `<main>` idêntico ao 1º (mesmo dado) | no chão ⇒ `error_kind:connection_refused`, **não** a projeção reutilizada — cache de processo nunca substitui erro de transporte |
| **D2.7** prefixo único | `grep -rn 'API_PREFIX' backend/src/main deploy/ .env.example \| wc -l` ≥ 3; teste: `API_PREFIX=/x` ⇒ `openapi.json` paths começam por `/x` **e** `Caddyfile` renderizado roteia `/x/*`; `curl $API/ingest-health` (sem prefixo) → **404** | n/a |
| **D2.8** estrutura, sem implantação | `grep -cE '^  (api\|web\|caddy):' deploy/compose.yml` → **3**; `docker compose -f deploy/compose.yml config -q` → `rc=0`; `grep -A12 '^  api:' deploy/compose.yml \| grep -c 'ports:'` → **0**; `caddy validate --config deploy/Caddyfile` → `rc=0` (via `docker run --rm -v … caddy:2-alpine caddy validate` se não houver binário); `grep -c 'reverse_proxy' deploy/Caddyfile` → **2** | **declarado:** não há "de pé" (`RN-9`). O inverso do escopo: `docker compose -f deploy/compose.yml ps` na VPS mostrando `caddy` ⇒ escopo violado |
| **D2.9** segredo nunca literal | `harness rules --mode file --path deploy/compose.yml` → vazio, `rc=0`; **morde:** compose com `POSTGRES_PASSWORD: literal` plantado ⇒ `harness rules` ≠ 0 nomeando `own.compose-hardcoded-secret` (`deploy/` em `include_prefixes`, `harness.toml:369`) | n/a |
| **D2.10** CORS não nasceu | `grep -rn 'CORSMiddleware' backend/src --include='*.py' \| wc -l` → **0** (case-sensitive — `[C1]`) | n/a |
| **D2.11** camadas | `make boundaries` verde (contrato `layers` `["main","api \| jobs","modules"]`); `grep -rn 'SELECT' backend/src/api \| wc -l` → **0** (`D5.13c`) | n/a |
| **D2.12** portões | `make verify` verde; `make test` inclui os novos pytest (universo: `grep -c 'def test_' backend/tests/api/*.py`, hoje 3) | n/a |

## Falsificador da fase

**Se `D2.4` passar comparando o `ETag` só com o `fingerprint()` de um lado, a fase repetiu a vacuidade que `ADR-005/D6` recusou** (*"DoD-2 comparando um número consigo mesmo"*) — os dois lados **e** o controle negativo são obrigatórios. Segundo: se `D2.1` subir com o pai inexistente, `ADR-029/D3` não existe.

## O que esta fase NÃO faz

Não implanta (`NG-1`) · não decide `API_PREFIX` definitivo, auth, TLS (`[Q2]`, `[Q3]`, `[Q10]`) · não cria rota de dado nova (é `03`) · não toca `_fetch` nem o envelope · não adiciona CORS · não pagina `/ingest-health` (`[Q5]`).
