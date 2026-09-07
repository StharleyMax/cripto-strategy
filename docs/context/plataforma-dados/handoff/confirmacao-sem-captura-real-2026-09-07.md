# Confirmação — nenhum coletor está capturando dado real hoje (2026-09-07)

**Motivo do registro:** o owner perguntou, ao acompanhar o build de `camada-de-leitura-do-painel`,
se já dá para "rodar o back e deixar ele capturando dados reais". Resposta medida abaixo — nada
disto é achado novo, é **confirmação ao vivo** do que `proposta-topologia-ingest.md` e
`tasks-candidatas-fiacao-producao.md` já haviam levantado, re-verificado nesta data porque `ADR-027`
e as tasks `T-07.15/16/17` foram criadas (PR #135, 2026-09-04) depois daqueles documentos.

## O que existe

- `camada-de-leitura-do-painel` (esta sessão) construiu só o **lado de leitura**: API que lê um
  store SQLite já existente (`GET /ingest-health`, `/ready`, `/series-catalog`,
  `/series-quarantine`, `/collector-status`) + o painel Next que consome essa API. `make api` sobe
  esse processo (`backend/src/main`), não um coletor.
- Há **CLIs individuais** de coleta em `backend/src/modules/sentimento/infra/` (`force_order_collector_cli.py`,
  `premium_index_probe_cli.py`, `coinalyze_history_client.py`, `binance_oi_history_client.py`,
  `daily_instrument_universe_snapshot_cli.py`, etc.) — invocáveis um a um, não um daemon.
- A fila durável (Redis Streams, `T-07.4`) e o escritor único (`T-07.5`) estão `done` **como
  lógica**, mas nunca foram ligados a um produtor real nem a um entrypoint de produção.

## O que falta, medido agora

```
$ grep -rn 'import redis' backend/src/modules/sentimento/infra/force_order_collector_cli.py \
                          backend/src/modules/sentimento/infra/premium_index_probe_cli.py
(0 ocorrências — os dois coletores 24/7 candidatos ainda gravam local, não publicam no Stream)

$ find backend/src -iname 'single_writer_cli.py'
(vazio — nenhum entrypoint de produção do escritor único existe)
```

`ADR-027` (aprovada pelo owner em 2026-09-04, D1/D2 decididos) e as tasks `T-07.15` (produtor real,
`CST-110`), `T-07.16` (entrypoint do escritor, `CST-111`), `T-07.17` (`deploy/compose.yml` ganha
`redis:7-alpine`, `CST-109` — corrigido em 2026-09-07: `CST-112` é o Epic F1 da `camada-de-leitura-do-painel`; o `tasks.toml` da mãe aponta `CST-109`) já existem em `tasks.toml` — **materializadas, não construídas**. O
dashboard (`harness status plataforma-dados`) já lista as 3 como as únicas tasks reais em aberto da
mãe, exigindo `override` para não bloquear a filha (decisão do owner em 2026-09-05, "atuar 100% na
filha agora").

## Conclusão

**Não há captura de dado real rodando hoje**, nem como processo persistente nem como pipeline
ligado ponta a ponta. O caminho para ligar é exatamente `T-07.15 → T-07.16 → T-07.17`, nessa ordem
(compose só depois dos dois primeiros, nunca antes — `tasks-candidatas-fiacao-producao.md`). Nenhuma
decisão nova aqui; é o estado real do repositório na data acima, re-confirmado porque o owner
perguntou diretamente.
