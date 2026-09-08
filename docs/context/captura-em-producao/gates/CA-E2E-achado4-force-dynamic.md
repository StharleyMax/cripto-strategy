# Correção do achado 4 de `CA-E2E-local` — `/painel` deixa de ser pré-renderizado em build

**Fecha:** [`CA-E2E-local.md`](CA-E2E-local.md) §4 (escalado ao `/architect`, componente `web`).
**Owner:** aprovou "seguir com a recomendação" (2026-09-08); mecanismo delegado ao `architect` de `web`.
**Arquivo tocado:** `frontend/src/app/painel/page.tsx` (único; escopo de `frontend/src` adicionado a
esta feature via `harness pipeline scope captura-em-producao add frontend/src`, antes vazio para
`frontend/src` — `T-03.8` estava proibida de tocar essa superfície, este gate é quem a herda).

## O defeito, recapitulado

`resolveCollectorStatusBaseUrl` (`collector-status-query.ts`) lança `TransportError` de forma
SÍNCRONA, antes de qualquer `fetch`, quando `INGEST_HEALTH_API_BASE_URL` está `undefined`. Como
essa variável só existe em `docker run` (`docker-compose environment:`), nunca em `docker build`
(`frontend/Dockerfile`), o Next nunca observa uma API dinâmica durante a passada estática de
`npm run build`, trata `/painel` como elegível para pré-renderização, e grava o HTML do estado de
erro (`missing_base_url`) em `.next/` com `Cache-Control: s-maxage=31536000` — nunca mais
re-executa, mesmo com a variável correta no container em produção.

## Mecanismo escolhido — `export const dynamic = "force-dynamic"`

Adicionado em `page.tsx`, ao lado de `export const metadata`. Explícito e sem depender de qual
branch um dado render segue (ao contrário de confiar só no `cache: "no-store"` dos `fetch`s, que
não ajuda quando o código lança ANTES de qualquer `fetch` rodar). Alternativa de leitura
client-side da URL **recusada**: exigiria `NEXT_PUBLIC_INGEST_HEALTH_API_BASE_URL`, que
`ADR-019/D4` já proíbe (aquela família é inlined no bundle do browser; o módulo tem de
permanecer server-only). Nenhuma outra linha mudou.

## Falsificador — build muda de classe, resposta HTTP muda de classe

**Build** (`npm run build`, dentro de `frontend/Dockerfile`), rota `/painel`:
- **antes** (`master`, sem o fix): `○ /painel` — `(Static) prerendered as static content`.
- **depois** `[MEDIDO 2026-09-08]`: `ƒ /painel` — `(Dynamic) server-rendered on demand`.

**Resposta HTTP**, container `web` real (imagem construída por `docker compose … build web`,
subida isolada — ver §Ambiente), `curl -D - http://127.0.0.1:18102/painel`:

```
HTTP/1.1 200 OK
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

Nem `x-nextjs-cache`, nem `x-nextjs-prerender` — os dois cabeçalhos que o achado 4 mediu como
presentes (`HIT`/`1`) desaparecem. Duas requisições sucessivas devolvem o mesmo `Cache-Control`
(sem cache de processo). O corpo carrega `data-fact="error_kind:connection_refused"` — **não**
`missing_base_url` — provando que a variável (`INGEST_HEALTH_API_BASE_URL=http://api:18100`,
injetada por `environment:`) foi lida NO MOMENTO da requisição (o `api` não estava de pé nesta
verificação — esperado, é o Achado 2 de `CA-E2E-local`, fora do escopo deste gate).

## Ambiente — adaptações declaradas, nenhum arquivo versionado alterado por elas

Mesmo padrão de `CA-E2E-local.md §0`: outra worktree deste host já ocupa a porta `3000` (processo
`next-server` de outra task, medido via `ss -tlnp`), então `deploy/compose.local.yml` (que fixa
`127.0.0.1:3000:3000`) colidiria. Como a versão de `docker compose` neste host (`v2.19.1`) faz
MERGE aditivo de listas (`ports`, `env_file`) entre arquivos `-f` — não suporta `!reset`/`!override`
— não dá para neutralizar aquele mapeamento com um `-f` adicional. Adaptação: subida com
`deploy/compose.yml` (base) + um overlay efêmero **fora do repo** (`/tmp/.../t0panel-web-local.yml`)
publicando `127.0.0.1:18102:3000` e replicando a MESMA variável de ambiente que
`compose.local.yml` injeta (`INGEST_HEALTH_API_BASE_URL: http://api:18100`) — mesma semântica do
alvo `local`, porta diferente só para não colidir. `--no-deps web`: só o serviço sob teste sobe
(nenhum Postgres/Redis real necessário para provar a propriedade deste achado). `.env` real do
repositório (não versionado, nunca lido de volta — este sandbox nega leitura de qualquer `.env*`,
mesmo sem segredo real, e `cp .env.example .env` também é negado; o arquivo foi **autorado do
zero** com placeholders de dev, mesma técnica da entrada `T-03.7` do `INDEX.md`) continha só
`POSTGRES_DB`/`_USER`/`_PASSWORD`, `REDIS_MAXMEMORY`, `APP_PORT`, `INGEST_RECORD_BACKEND`,
`POSTGRES_HOST`, `REDIS_HOST` — nenhuma credencial real. Removido ao final (`rm .env`).
`docker compose … down -v` + `docker rmi t0panel-web` — `docker ps -a`/`docker images`/
`docker volume ls` sem `t0panel` confirmado depois. Nenhuma implantação real (`R-E`).

## Portões

| comando | resultado |
|---|---|
| `npm run lint` (`frontend/`) | `[MEDIDO 2026-09-08]` limpo |
| `npm run typecheck` (`tsc --noEmit --strict`) | `[MEDIDO 2026-09-08]` limpo |
| `npm run test:charts`/`test:app`/`test:s1`/`test:s3` | `[MEDIDO 2026-09-08]` 2 falhas, **ambas pré-existentes e confirmadas idênticas com `git stash`** (sem o fix): `s2-panels.test.ts`/`s2-oi-loader.test.ts` por `data/binance/klines/...` ausente (dado bruto não versionado, `CLAUDE.md`) e `ingest-health-query-http.test.ts` por `backend/.venv` ausente neste host — nenhuma toca `painel/page.tsx` |
| `docker compose … build web` | `[MEDIDO 2026-09-08]` `rc=0`, rota `/painel` reportada `ƒ` (Dynamic) |
| `curl -D - http://127.0.0.1:18102/painel` ×2 | `[MEDIDO 2026-09-08]` sem `x-nextjs-cache`/`x-nextjs-prerender`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` nas duas |

## O que este gate NÃO decide

- Achado 2 (bind loopback de `__main__.py`) e o catálogo `SeriesKey` — continuam escalados a
  `/architect`/`quant-architect`, como `CA-E2E-local.md` já registrava.
- Não roda `make e2e`/Playwright completo — fora do DoD desta correção pontual.
