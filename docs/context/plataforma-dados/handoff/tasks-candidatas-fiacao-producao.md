# Tasks candidatas — fiação de produção do escritor único (para o `/tech-lead` materializar)

Pré-condição: [`ADR-027`](ADR-027-rascunho.md) aprovada pelo owner — `D1` e `D2` (Redis dedicado)
decididos em 2026-09-04. Nenhuma destas foi escrita em `tasks.toml` ainda; despacho ao
`/tech-lead` pendente.

**Recomendação de posicionamento no plano:** amplia a fase `07` (`CST-5`, já em andamento, já
`sentimento`/`web`) em vez de abrir fase/Epic novo. Argumento: os itens `7.6`/`7.7` desta mesma
fase são exatamente "Redis Streams + consumer group" e "Escritor único" — as tasks abaixo são a
continuação direta desses dois itens, não um tema novo. Abrir Epic novo exigiria ato do `/pm` no
tracker (`CST-8`) sem que nenhum requisito novo o justifique — o próprio plano já registrou
`[DECISÃO-OWNER]` de manter "nenhum Epic novo" nesta rodada (`TASKS_APPROVED`, 2026-08-25). Isto
é recomendação do `/architect`; a palavra final de granularidade (nova fase `10` vs itens novos em
`07`) é do `/tech-lead`, que é quem materializa.

---

## T-A · Produtor real: os 2 coletores 24/7 publicam no Redis Stream

- **Título proposto:** `[sentimento] 07 · Coletores 24/7 (forceOrder, premiumIndex) publicam no Redis Stream via RedisStreamPublisher — schema de wire documentado`
- **Componente:** `sentimento`
- **Depende de:** `T-07.4` (`done`), `T-07.6` (particionamento, `done`) — conferir se o schema de partição de `T-07.6` já assume algum layout de campo
- **Requisitos:** `CA-F3-8`, `ADR-009/D2` (Streams, nunca Pub/Sub), continuação do achado 1 do Contexto de `ADR-027`
- **Escopo:** `capture_force_order_stream.py`/`reconnect_force_order_stream.py` e `collect_premium_index.py` passam a escrever no `RedisStreamPublisher` (via `SeriesWriteQueue`/porta equivalente do lado produtor) em vez de (ou além de) gravar cru local — decidir com o `quant-architect` se a gravação local crua desaparece ou vira redundância transitória até o escritor único confirmar `ack`. **Esta task é a dona do schema de wire** (mapeamento de campos de `SeriesRow` para `Mapping[str, str]`), que `redis_series_write_queue.py:4-7` deixou em aberto explicitamente para "quem ligar o primeiro coletor".
- **Não faz:** não decide a fila da API de leitura (`ADR-005`), não altera `run_single_writer`.
- **DoD candidato:**
  - `grep -rn 'import redis' backend/src/modules/sentimento/infra/{force_order_collector_cli,premium_index_probe_cli}.py` → ≥ 1 cada (hoje: 0);
  - teste de round-trip: `decode(encode(row)) == row` para `SeriesRow` com os 4 valores de `Provenance`;
  - teste de integração (não fake): matar o processo produtor a meio de uma sessão e confirmar, do lado do consumer group, que a mensagem em `PEL` é lida por `read_pending` depois do restart — este é o teste que falta para o falsificador `F3` de `ADR-027`.

## T-B · Entrypoint de produção do escritor único

- **Título proposto:** `[sentimento] 07 · Entrypoint de produção do escritor único (single_writer_cli) com sink real sobre TimescaleDB/postgres:15`
- **Componente:** `sentimento`
- **Depende de:** `T-07.5` (`done`), `ADR-002/D4` (finalista decidido — candidato 4, emenda 2026-09-04)
- **Requisitos:** `ADR-002/D5`, `CA-F3-12`, `CA-F4-25`
- **Escopo:** `single_writer_cli.py` (ou `__main__` equivalente) monta o `SeriesWriteQueue` real
  (consumindo de `T-A`), o sink real (agora que `ADR-002/D4` decidiu TimescaleDB sobre
  `postgres:15` — antes desta task não havia adapter concreto porque D4 estava pendente de spike;
  hoje está decidido), e chama `run_single_writer` em loop, com log estruturado de cada `ack`.
- **Não faz:** não decide layout de partição além do que `T-07.8`/`T-07.6` já fixaram.
- **DoD candidato:**
  - `find backend/src -iname 'single_writer_cli.py'` → existe;
  - `test_single_writer_call_sites.py` (guarda AST já existente) continua com exatamente 1 call
    site de produção — este entrypoint não pode criar um segundo;
  - teste de processo real (não só unitário): subir o entrypoint, publicar via `T-A` fake/real,
    matar o processo escritor, reiniciar, confirmar zero mensagem perdida e zero duplicata
    aplicada (o predicado `modeled_write_overwrites_observed` já é a garantia; o teste prova que
    o ENTRYPOINT não a contorna).

## T-C · `deploy/compose.yml` ganha `redis:7-alpine`

- **Título proposto:** `[infra] 07 · deploy/compose.yml ganha redis:7-alpine + serviço do escritor único — só depois de T-A/T-B, nunca antes`
- **Componente:** `infra`
- **Depende de:** `T-A`, `T-B`, `ADR-027/D1` e `D2` aprovadas — `D2` decidiu Redis **dedicado**, então este item sobe `redis:7-alpine` próprio, não aponta para o `anything_monorepo`
- **Requisitos:** `ADR-027/D1`, `D2`, `ADR-009/D5` (item `1.14`, "a fase que construir o deploy de verdade")
- **Escopo:** adicionar o serviço `redis:7-alpine` dedicado e o serviço do escritor único (`T-B`) ao compose; os 2
  coletores 24/7 (`T-A`) entram como um terceiro serviço ou processo supervisionado — decisão de
  detalhe do `/tech-lead`/`infra-architect` no momento de construir.
- **Não faz:** não sobe os one-shot/diários como serviço de compose (viram cron/systemd timer,
  fora deste item); não decide TLS/reverse proxy (fora do escopo desta ADR).
- **DoD candidato:**
  - `own.compose-hardcoded-secret` continua `rc=0` sobre o arquivo (nenhuma credencial literal);
  - `find deploy -type f | wc -l` > 1 pela primeira vez desde `T-01.14` — fecha o falsificador
    que `01_governanca_gateante.md:186` nomeou;
  - subir via `docker compose up` local e confirmar, com um produtor real de teste, uma
    mensagem chegando ao Postgres — fim a fim, não por partes.

## Nota sobre `T-09.5` (runbook) — correção ao handoff original

O handoff (`proposta-topologia-ingest.md` §3) lista *"possível desbloqueio de `T-09.5`"* entre as
tasks candidatas. **Isto não se sustenta ao medir a cadeia de dependência:** `T-09.5` depende de
`T-07.11`, que está `blocked` por `Q3` (canal de alarme fora do browser) — não por falta de
produtor real ou de entrypoint. `T-07.11` já registra, no próprio `tasks.toml`, que "o detector já
está fixado" e que só o **transporte do alarme** falta. Nenhuma das tasks `T-A`/`T-B`/`T-C` toca
`Q3`. **`T-09.5` continua `blocked` depois desta ADR**, e o desbloqueio dela é ato do owner sobre
`Q3`, tema que esta rodada não abre. Registrar isto explicitamente evita que o `/tech-lead` prometa
um desbloqueio que a dependência real não entrega.
