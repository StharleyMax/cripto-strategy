# Narrativa de review — fiação de produção do escritor único (`ADR-027`), 3 tasks novas em fase 07

**Autor:** `/tech-lead` · **Data:** 2026-09-04 · **Feature:** `plataforma-dados`
**Âncora de TODA medição desta narrativa:** `master@0d31b7d`, árvore de trabalho limpa.
**Estado:** aguardando aprovação humana. **Nada foi cardado, `tasks.toml` não foi tocado, o ledger não foi tocado.**

> Este arquivo **não substitui** [`tasks_review.md`](tasks_review.md) (720 linhas, aprovado
> `2026-08-25`) nem [`tasks_review-T-03.12.md`](tasks_review-T-03.12.md) — é a narrativa de **três**
> tasks acrescentadas depois, motivadas por [`ADR-027`](../../adr/ADR-027-topologia-de-processo-e-producao-real-do-escritor-unico.md)
> (aprovada pelo owner, `D1`/`D2`, 2026-09-04), a partir das candidatas que o `/architect` desenhou em
> [`handoff/tasks-candidatas-fiacao-producao.md`](handoff/tasks-candidatas-fiacao-producao.md).

---

## 0 · Gate de entrada

| exigência | medido | veredito |
|---|---|---|
| `harness pipeline state plataforma-dados` == `SPEC_APPROVED` | **`BUILD_AUTHORIZED`** `[MEDIDO 2026-09-04]` | **DIVERGE, mesmo motivo já registrado em `tasks_review-T-03.12.md` §0**: a feature já passou do gate de decomposição inicial (`SPEC_APPROVED` → `TASKS_APPROVED` em 2026-08-25 → `BUILD_AUTHORIZED` em 2026-08-28); aqui insere-se task numa quebra já aprovada, motivada por ADR nova que nomeia `/tech-lead`/`/architect` como donos da materialização (`ADR-027`, linha "Fase/Epic"). O estado é *posterior*, não anterior — não é gate pulado |
| `index.md` do plano existe | `docs/plans/SPEC-001-plataforma-dados/index.md` `[MEDIDO: find, existe]` | ok |
| destino no tracker identificado | `harness policy --key tracker` → `{kind=jira, project=CST, board_id=36, parent_kind=Epic, child_kind=Tarefa}` `[MEDIDO]` — Epic-pai desta fase já existe: `CST-5` (fase 07, sem Epic novo, ver §2) | ok |
| `tasks.toml` válido na base | `harness tasks validate plataforma-dados` → **94 task(s), 0 ERROR, 6 WARN** `[MEDIDO 2026-09-04]` (os 6 WARN são `V-09` pré-existentes sobre `blocked_reason`, chave não-declarada no contrato — nenhum deles nasce desta narrativa) | ok |
| escopo de caminhos já cobre os arquivos que estas tasks tocam | `harness pipeline scope plataforma-dados list` → inclui `backend/src` e `deploy` `[MEDIDO 2026-09-04]` | ok, **nada a declarar** — ver §6 |

---

## 1 · O que a ADR decide, e o que sobra para as tasks

`ADR-027/D1` fixa a topologia: **três processos de vida longa** — (a) coletores 24/7 (thread única,
síncrono), (b) escritor único, (c) API já existente. `D2` decide **Redis dedicado** a este projeto
(`redis:7-alpine` próprio, não compartilhado com `anything_monorepo`).

O que a ADR **explicitamente não fecha** (linha 96-102 da ADR): o schema de wire do Redis Stream —
fica "com quem construir o primeiro produtor". Isso é decisão de implementação, não requisito novo;
cabe dentro da task que liga o primeiro produtor, com teste de round-trip, exatamente como a ADR pede.

**Verifiquei por conta própria, antes de aceitar os DoDs candidatos como estão** (não apenas reproduzi
os números da ADR):

```
$ find deploy -type f                                                          → deploy/compose.yml (1 arquivo)
$ grep -rn 'import redis' backend/src/modules/sentimento/infra/{force_order_collector_cli,premium_index_probe_cli}.py
                                                                                 → 0 ocorrências (confirma achado 1/ADR-027)
$ find backend/src -iname 'redis_series_write_queue.py'                        → existe
$ find backend/src -iname 'single_writer_cli.py'                               → NÃO existe (confirma que T-B é entrypoint novo)
$ find backend/tests -iname 'test_single_writer_call_sites.py'                 → existe (guarda AST que T-B tem que respeitar)
$ grep -rln 'def run_single_writer' backend/src                                → use_cases/run_single_writer.py (existe, done em T-07.5)
```
`[MEDIDO 2026-09-04, master@0d31b7d]` — bate com o que a ADR e o handoff afirmam. Não achei divergência.

⇒ **Três tasks, não uma.** O motivo é o mesmo tipo de argumento de `tasks_review-T-03.12.md §4` ("uma
task, não três") aplicado ao contrário aqui: T-A (produtor) e T-B (escritor) têm DoD, dependência e
componente-julgador **independentes** um do outro — T-A depende só de `T-07.4`/`T-07.6` (fila e
particionamento), T-B depende só de `T-07.5` (lógica do escritor) e de `ADR-002/D4` (finalista do motor,
fechado). Juntá-las numa task só esconderia que uma pode fechar sem a outra (o produtor pode publicar
antes do escritor de produção existir — o consumer group simplesmente acumula `PEL`). T-C (compose)
depende estruturalmente das duas e do componente `infra`, que tem julgador próprio
(`infra-architect`, `harness policy --key agents.by_component` → `{"infra": {"architect": ...}}`
`[MEDIDO]`) — misturar T-C com T-A/T-B poria trabalho de dois componentes sob um único veredito de
review, o mesmo problema que `ADR-003:11-13` já nomeia noutro contexto (task materializada abaixo em
`docs/context/plataforma-dados/tasks.toml:880`).

---

## 2 · Posicionamento: fase `07`, sem Epic novo — endosso o `/architect`, decisão é minha

O `/architect` recomendou ampliar a fase `07` (`CST-5`) em vez de abrir fase/Epic novo, citando que os
itens `7.6`/`7.7` do próprio plano ("Redis Streams + consumer group", "Escritor único") são a mesma
linha de trabalho, e que o owner já registrou `[DECISÃO-OWNER]` de "nenhum Epic novo" na rodada de
`TASKS_APPROVED` (2026-08-25). **Concordo e adoto** — não há requisito novo aqui que justificasse Epic
novo (nenhuma unidade de valor nova, ver `ADR-027` "Alternativas recusadas" → "Reabrir o PRD"), e as
três tasks são continuação direta de trabalho `done` da mesma fase. A palavra final de granularidade é
minha, por papel; a decisão que tomo é a mesma que a recomendação.

**IDs:** fase `07` vai de `T-07.1` a `T-07.14`, sem buracos `[MEDIDO: grep 'id = "T-07' → 14 ids
contíguos]`. As três novas nascem `T-07.15`, `T-07.16`, `T-07.17` — primeiros ids livres da fase, na
ordem de dependência (produtor → escritor → deploy).

| candidata do `/architect` | id materializado | componente |
|---|---|---|
| T-A | **`T-07.15`** | `sentimento` |
| T-B | **`T-07.16`** | `sentimento` |
| T-C | **`T-07.17`** | `infra` |

---

## 3 · As três tasks

### `T-07.15` — Produtor real: coletores 24/7 publicam no Redis Stream

- **Título:** `[sentimento] 07 · Coletores 24/7 (forceOrder, premiumIndex) publicam no Redis Stream via RedisStreamPublisher — schema de wire documentado`
- **Componente:** `sentimento`
- **Depende de:** `T-07.4` (done), `T-07.6` (done) — conferir se o schema de partição de `T-07.6` já assume layout de campo
- **Requisitos:** `CA-F3-8`, `ADR-009/D2` (Streams, nunca Pub/Sub), `ADR-027` achado 1
- **Escopo:** `force_order_collector_cli.py`/`reconnect_force_order_stream.py` e `collect_premium_index.py`
  passam a escrever via `RedisStreamPublisher`/`SeriesWriteQueue` (porta do lado produtor). Decisão em
  aberto dentro do escopo da própria task (não minha, não do `/architect` — do `quant-architect` no
  momento de construir): a gravação local crua desaparece ou vira redundância transitória até o `ack`
  do escritor único. **Esta task é a dona do schema de wire** — mapeamento de `SeriesRow` para
  `Mapping[str, str]`, hoje deliberadamente indefinido (`redis_series_write_queue.py:4-7`).
- **Não faz:** não decide a fila da API de leitura (`ADR-005`); não altera `run_single_writer`.
- **DoD:**
  1. `grep -rn 'import redis' backend/src/modules/sentimento/infra/{force_order_collector_cli,premium_index_probe_cli}.py` → ≥ 1 cada (hoje, confirmado nesta narrativa: **0**);
  2. teste de round-trip `decode(encode(row)) == row` para `SeriesRow`, cobrindo os 4 valores de `Provenance`;
  3. teste de integração real (não fake): matar o processo produtor a meio de uma sessão e confirmar, do lado do consumer group, que a mensagem em `PEL` é lida por `read_pending` após restart — fecha o falsificador `F3` de `ADR-027`.

### `T-07.16` — Entrypoint de produção do escritor único

- **Título:** `[sentimento] 07 · Entrypoint de produção do escritor único (single_writer_cli) com sink real sobre TimescaleDB/postgres:15`
- **Componente:** `sentimento`
- **Depende de:** `T-07.5` (done), `T-07.15`, `ADR-002/D4` (finalista TimescaleDB, decidido — `T-08.1` DONE, PR #123)
- **Requisitos:** `ADR-002/D5`, `CA-F3-12`, `CA-F4-25`
- **Escopo:** `single_writer_cli.py` monta o `SeriesWriteQueue` real (consumindo de `T-07.15`), o sink
  real sobre TimescaleDB (agora decidido por `ADR-002/D4`), chama `run_single_writer` em loop, log
  estruturado por `ack`.

  **Nota de dependência que acrescento e que o `/architect` não tinha listado:** `T-07.16` depende
  também de `T-07.15`, não só de `T-07.5` — o escritor de produção precisa de algo publicando na fila
  para o teste de processo real do item 3 do DoD fazer sentido. A candidata original do `/architect`
  não declarava essa aresta; acrescento porque sem ela `T-07.16` poderia nascer "pronta para começar"
  antes de o produtor existir, e o teste teria de usar fake — o que o DoD abaixo já proíbe.
- **Não faz:** não decide layout de partição além do que `T-07.6`/`T-07.8` já fixaram.
- **DoD:**
  1. `find backend/src -iname 'single_writer_cli.py'` → existe;
  2. `test_single_writer_call_sites.py` (guarda AST já existente, `backend/tests/sentimento/`) continua
     com exatamente 1 call site de produção;
  3. teste de processo real: subir o entrypoint, publicar via `T-07.15`, matar o processo escritor,
     reiniciar, confirmar zero mensagem perdida e zero duplicata aplicada — prova que o ENTRYPOINT não
     contorna o predicado `modeled_write_overwrites_observed`.

### `T-07.17` — `deploy/compose.yml` ganha `redis:7-alpine`

- **Título:** `[infra] 07 · deploy/compose.yml ganha redis:7-alpine dedicado + serviço do escritor único — só depois de T-07.15/T-07.16`
- **Componente:** `infra`
- **Depende de:** `T-07.15`, `T-07.16`, `ADR-027` `D1`+`D2` (já aprovadas)
- **Requisitos:** `ADR-027/D1`, `D2`, `ADR-009/D5` (item `1.14`)
- **Escopo:** serviço `redis:7-alpine` **dedicado** (D2 já decidiu — não aponta para o
  `anything_monorepo`) + serviço do escritor único (`T-07.16`); os coletores 24/7 (`T-07.15`) entram
  como terceiro serviço ou processo supervisionado — decisão de detalhe do `infra-architect` na
  construção.
- **Não faz:** não sobe os coletores one-shot/diários como serviço de compose (viram cron/systemd
  timer, fora deste item); não decide TLS/reverse proxy.
- **DoD:**
  1. `own.compose-hardcoded-secret` → `rc=0` sobre o arquivo (nenhuma credencial literal);
  2. `find deploy -type f | wc -l` > 1 pela primeira vez desde a fase que criou `deploy/compose.yml` —
     fecha o falsificador que `01_governanca_gateante.md:186` nomeou (hoje: **1**, confirmado nesta
     narrativa);
  3. `docker compose up` local + produtor real de teste → mensagem chegando ao Postgres, fim a fim, não
     por partes.

---

## 4 · Correção herdada do handoff — registrada para não se perder na materialização

O handoff original (`proposta-topologia-ingest.md §3`) listava *"possível desbloqueio de `T-09.5`"*
entre as candidatas. O próprio `tasks-candidatas-fiacao-producao.md` já corrige isso (§"Nota sobre
T-09.5"), e eu reproduzo a cadeia antes de aceitar a correção como válida:

```
$ grep -n 'id = "T-09.5"' -A6 docs/context/plataforma-dados/tasks.toml
status = "blocked"
blocked_reason = "aguarda T-07.11, que esta blocked"
depends_on = ["T-07.11"]

$ grep -n 'id = "T-07.11"' -A6 docs/context/plataforma-dados/tasks.toml
status = "blocked"
blocked_reason = "Q3 aberta (canal de alarme fora do browser)..."
```
`[MEDIDO 2026-09-04]` — confere. `T-09.5` depende de `T-07.11`, que está `blocked` por `Q3` (canal de
alarme), tema que nenhuma das três tasks acima toca. **`T-07.15`/`T-07.16`/`T-07.17` NÃO desbloqueiam
`T-09.5`.** Nenhuma refs das três tasks acima promete isso, e este parágrafo existe para que quem ler
o `tasks.toml` daqui a três meses não reconstrua essa expectativa a partir da proximidade das tasks na
mesma fase.

---

## 5 · `[NÃO SEI]` declarados

- **Se a gravação local crua do coletor desaparece ou vira redundância transitória (`T-07.15`).**
  Decisão de arquitetura de domínio, do `quant-architect`, não minha — deixei registrada como pergunta
  em aberto dentro do escopo da task, não como decisão tomada por mim.
- **Se os coletores 24/7 entram no compose como um serviço ou como processo supervisionado dentro do
  serviço do escritor (`T-07.17`).** Decisão de detalhe do `infra-architect` no momento de construir,
  como a própria candidata do `/architect` já declarava — não antecipo.
- **`backend/tests/sentimento` não aparece, por nome, em `harness pipeline scope plataforma-dados
  list`** (só `backend/src` e `deploy` aparecem) `[MEDIDO 2026-09-04, n=22 entradas]`. Isto é condição
  pré-existente — `T-07.4`/`T-07.5`/`T-07.6` (done) já escreveram sob essa mesma árvore de testes sem
  que isso tenha bloqueado nada. Não é destas três tasks, não vou declarar escopo novo para "corrigir"
  algo que não está quebrado, e registro em vez de silenciar.

## 6 · O que eu não fiz

Nenhum card no Jira (`CST` intocado) · ledger intocado (`BUILD_AUTHORIZED` antes e depois; nenhum
`approve`, `advance` ou `scope`) · `tasks.toml` **não editado** ainda · nenhum código de produção ·
`ADR-027` não editada · nenhuma linha existente de `docs/INDEX.md` reescrita · nenhum merge.

**Escopo de caminhos: nada a declarar.** `backend/src` e `deploy` já cobertos (§0); declarar de novo
seria reafirmar o que o ledger já tem, sem efeito.

**Próximo passo:** owner aprova esta narrativa → materializo `T-07.15`/`T-07.16`/`T-07.17` em
`docs/context/plataforma-dados/tasks.toml` com `tracker = { provider = "jira", project = "CST",
parent = "CST-5" }` (children novos, Epic-pai existente, coerente com o resto da fase `07`) →
`harness tasks validate plataforma-dados` → `handoff_to_builder.md` atualizado → linha nova (append) em
`docs/INDEX.md` → owner carda no Jira → `/build`.
