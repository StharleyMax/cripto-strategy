# Execução local hoje — o que falta para rodar de pé, e o gráfico não existe ainda

**Motivo do registro:** owner tentou rodar o front localmente e bateu em `Cannot find module
'@tailwindcss/postcss'` (cache do Next desatualizado) e depois em `INGEST_HEALTH_API_BASE_URL`
ausente. Ao responder, medi o estado real de "dá para rodar local com dado funcional?" e "dá para
abrir um gráfico?" — os dois achados abaixo, para não se perderem na conversa.

## 1. Setup local funcional — o que falta, hoje (2026-09-07)

Nenhum destes existe ainda neste checkout:

- `frontend/.env.local` — o Next roda a partir de `frontend/`, não lê o `.env` da raiz (esse só é
  lido por `make api`, via `source` manual no alvo do `Makefile`). Precisa:
  ```
  INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000
  ```
  (valor default documentado em `.env.example` da raiz, casa com `APP_PORT=8000`.)
- `.env` na raiz (copiar de `.env.example`) — sem ele `make api` cai nos defaults do `src.main`,
  o que já funciona, mas fica implícito.
- `data/md/ingest_health.sqlite3` — **não existe**. Sem ele a API sobe mas serve tudo vazio
  (`SourceState` = "sem fonte"). Seed local:
  ```
  python3 backend/scripts/seed_ephemeral_ingest_store.py data/md/ingest_health.sqlite3 1 0
  ```
  (`<caminho> [n_runs=1] [n_gaps=0]`.)
- Cache do Next (`frontend/.next`) fica desatualizado toda vez que `package.json`/`package-lock.json`
  muda por um PR mergeado sem que o dev server tenha sido reiniciado — sintoma:
  `Cannot find module '<pacote-novo>'` mesmo com o pacote instalado em `node_modules`. Fix:
  `rm -rf frontend/.next` + reiniciar `npm --prefix frontend run dev`.

Depois dos 3 arquivos acima: `make api` (terminal 1) + `npm --prefix frontend run dev` (terminal 2)
serve `/painel` com dado real de um store seedado (não fixture).

## 2. Não existe página de gráfico navegável nesta app, hoje

Perguntado diretamente pelo owner ("como abro um gráfico?"). Medido:

```
$ find frontend/src/app -maxdepth 2 -type d
frontend/src/app
frontend/src/app/painel          # única rota da app

$ grep -rln "history-transport\|live-transport" frontend/src --include='*.ts' --include='*.tsx'
frontend/src/features/s3-inspector/series-catalog-query.ts
frontend/src/features/s1-console/ingest-health-query.ts
frontend/src/features/s1-console/collector-status-query.ts
frontend/src/features/s1-console/domain.ts
frontend/src/app/history-transport.test.ts
frontend/src/app/live-transport.ts
frontend/src/app/live-transport.test.ts
```

`history-transport.ts` (`T-05.9`) e `live-transport.ts` (`T-08.11`) são a camada de transporte de
dado de **chart** (componente `charts` de `plataforma-dados`, `ADR-005/D1`) — implementam o
protocolo (HTTP endereçável por conteúdo pro histórico, SSE pro ao vivo), mas **só são importados
pelos próprios testes e pelas queries de S1/S3** (que os reusam por tipo, não para renderizar
gráfico). **Nenhuma página em `frontend/src/app/` importa esses módulos para desenhar um gráfico.**

Conclusão: a lógica de transporte de dado de chart existe e tem teste próprio, mas **não há UI
conectada** — nada para o owner abrir no browser hoje que mostre um gráfico. Isso é consistente
com o escopo de `camada-de-leitura-do-painel` (M1 = F1+F2+F3, seções S1/S3, nunca S2/charts) — a
UI de chart, se existir, é tarefa de `plataforma-dados` (fases `05`/`08`, componente `charts`) e eu
não achei evidência de que ela já tenha sido construída como página real (pode existir só como
harness de teste headless — `headless-chart.ts` foi citado num gate report anterior de `T-05.11` —
não teve tempo de confirmar; **fica como pergunta em aberto, não resposta**).

## O que isto NÃO é

Não é bloqueio de nenhuma task em andamento (`camada-de-leitura-do-painel` Fase 03 segue rodando
normalmente). É registro de estado para não se perder — e para quem for construir a UI de chart
saber que o transporte já está pronto e testado, só falta a página.
