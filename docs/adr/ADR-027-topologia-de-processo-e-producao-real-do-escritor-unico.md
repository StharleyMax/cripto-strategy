# ADR-027 — Topologia de processo e produção real do escritor único

**Data:** 2026-09-04 · **Status:** aprovado pelo owner (D1 e D2, 2026-09-04) · **SPEC:** [`SPEC-001`](../plans/SPEC-001-plataforma-dados) (nenhuma seção específica — ver "Por que não é emenda de outra ADR" abaixo)
**Fase/Epic:** amplia a fase `07` (`CST-5`) — proposta de plano em anexo; materialização é ato do `/tech-lead`
**Componente alvo:** `infra` (topologia, `deploy/compose.yml`, entrypoints) e `sentimento` (produtores reais dos coletores 24/7)
**Requisito de origem:** `CA-F3-8`, `CA-F3-12`, `CA-F4-25`, `ADR-002/D5`, `ADR-009/D6`, `[GAP G5]`
**Origem do achado:** investigação pedida pelo owner em 2026-09-04, registrada em
[`docs/context/plataforma-dados/handoff/proposta-topologia-ingest.md`](../context/plataforma-dados/handoff/proposta-topologia-ingest.md)
(dois subagentes: medição de código + avaliação de topologia do `infra-architect`)

## Contexto — a lógica está pronta e testada; a fiação de produção não existe

`ADR-002/D5` decidiu o **contrato**: coletores 24/7 produzem para uma fila durável; um escritor
único é o único processo que toca a série. `ADR-009/D6` decidiu a **fronteira** de quem consome
os bounded contexts (`src/api`/`src/jobs`, por injeção). **Nenhuma das duas decide processo,
container ou o ato de ligar um produtor real** — `ADR-009/D5` já nomeava isto, na própria tabela
que propôs o componente `infra`: *"a topologia do escritor único e da fila durável… é decisão de
infra com consequência de contrato"*, e a adoção de `infra` (`ADR-009/D6.5`, `T-09.4`, `done`)
**reforçou a proposta e não a decidiu**.

`T-07.4` e `T-07.5` (fase `07`, `done`, QA APPROVED) fecharam a **lógica** da fila e do escritor
único — corretas por tipo, testadas, 100% de cobertura nos três módulos novos. **O próprio
trabalho, em cinco pontos independentes e auto-declarados no código e no plano, nomeia que a
fiação de produção ficou de fora — por decisão consciente, não por esquecimento:**

| # | onde | o que diz, literal | `[força]` |
|---|---|---|---|
| 1 | `redis_series_write_queue.py:4-7` | *"no producer publishes onto this stream yet… The owner of the wire schema is whichever task wires the first producer onto this stream."* | `[MEDIDO 2026-09-04]` |
| 2 | `force_order_collector_cli.py:3-6` | *"never a continuous 24/7 process — running it for real is deferred to deploy… this module does not implement [the reconnect policy that would keep it alive]"* | `[MEDIDO 2026-09-04]` |
| 3 | `premium_index_probe_cli.py:3-6` | *"this CLI is one composition of it [`collect_premium_index.py`], not the only one a future deploy would use"*, *"not wired to any scheduler"* | `[MEDIDO 2026-09-04]` |
| 4 | `deploy/compose.yml:1-5` | *"it is not the production deployment… Building the deployment is work that has no phase yet (`plano 01`, item `1.14`)"* | `[MEDIDO 2026-09-04]` |
| 5 | `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md:186` | falsificador do item `1.14`: *"se, ao fim, `deploy/` contiver só o arquivo que o `cala` exige… O sinal a observar é `find deploy -type f \| wc -l` estagnado em 1 depois da fase que construir o deploy de verdade"* | `[DOC]` |

`git ls-tree` confirma o estado hoje: `deploy/compose.yml` é o único arquivo sob `deploy/`
(**1 arquivo**), e nenhum dos **14** CLIs de coleta importa `redis` `[MEDIDO 2026-09-04: find
deploy -type f | wc -l → 1; ls backend/src/modules/sentimento/infra/*_cli.py | wc -l → 14]`.

**Isto não é regressão nem trabalho malfeito.** A lógica dos dois lados (coletor e escritor)
está pronta, testada e citável linha a linha. O que falta é o processo de produção que os liga
— e essa é exatamente a peça que nenhuma ADR até aqui decidiu.

### Por que não é emenda de outra ADR

`ADR-002` decide o **motor de armazenamento** (`D1`–`D7` + emendas); topologia de processo não é
motor. `ADR-009` decide **forma copiada do vizinho** e, na emenda `D6`, a **fronteira de camada
consumidora**; nenhuma das duas seções trata de container/processo/deploy — `D6.4` lista
explicitamente "topologia do escritor único" como o **item que a emenda NÃO decide**. Uma emenda
a qualquer uma das duas estaria decidindo algo que a ADR hospedeira nunca se propôs a decidir —
o precedente de emenda (`ADR-009/D6`) corrige uma **omissão dentro do escopo declarado** daquela
ADR (a forma copiada do vizinho tinha 4 peças e faltava a 5ª). Aqui não há omissão dentro de um
escopo — há um tema que **nenhuma ADR reivindicou**. Daí ADR nova.

### Avaliação de custo, já rodada pelo `infra-architect` — citada como insumo

Medição de RSS real (`resource.getrusage`, dentro do `.venv` deste projeto) e de containers
Docker (`redis:7-alpine` = 9,6 MiB RSS idle / 39,1 MB de imagem) `[DOC: handoff
proposta-topologia-ingest.md, medição do infra-architect, 2026-09-04 — não repetida por esta ADR]`:

| cenário | RSS |
|---|---|
| Python vazio | 10,8 MB |
| FastAPI + SQLite (`src.main`) | 40,8 MB |
| 1 CLI standalone | 23,2 MB |
| Redis client + escritor único | 14,9 MB |
| tudo junto (FastAPI + Redis + 14 CLIs importados) | 44,5 MB |

Achado do `infra-architect`: o custo de importar Python cresce pouco por módulo **dentro de um
processo**; o que multiplica é o **número de processos/containers** — cada um paga a base do
interpretador de novo, mais o teto de log do compose vizinho (`max-size: 10m × max-file: 3` ≈
30 MB/container) `[DOC: mesma origem]`.

## Decisão

### D1 · Três processos de vida longa; nada mais vira container permanente

**Decisão:** a topologia de produção declara **exatamente três processos de vida longa**:

| processo | conteúdo | por quê é "sempre vivo" |
|---|---|---|
| **(a) coletores 24/7** | `force_order_collector_cli` (stream) + `premium_index_probe_cli`/`collect_premium_index` (poll), no MESMO processo, por threads — o código de hoje é síncrono, sem `asyncio` | são os únicos com dado **capture-or-lose** (`CL-1`, liquidação intraday) |
| **(b) escritor único** | novo entrypoint de produção (`single_writer_cli.py` ou equivalente) chamando `run_single_writer` em loop | é o único processo que toca a série (`ADR-002/D5`) |
| **(c) API** | já existe (`src.main`) | serve leitura; um restart curto não perde captura |

**Hierarquia de criticidade, na mesma ordem:** coletores 24/7 > escritor único > API — os dois
primeiros perdem dado irrecuperável se caírem; a API não.

**Os coletores one-shot/diários (`C1`/`C2` no diagrama de `docs/arquitetura-fluxos.md`:
`daily_instrument_universe_snapshot_cli`, `coinalyze_one_shot_cli`) e os utilitários de
diagnóstico (`ingest_health_cli`, `quota_ramp_cli`, os `*_probe_cli`/`*_reconciliation_cli`
restantes) NUNCA viram container de vida longa** — viram invocação pontual via cron/systemd
timer, mesma imagem, comando diferente. Custo projetado, ordem de grandeza: **40–70 MB para os
3 processos de vida longa, contra 150–300+ MB se os 14 coletores virassem containers
permanentes** — mais até ~450 MB de teto de log contra 30–90 MB `[INFERRED, a partir da tabela
de RSS acima; não é medição de produção real, é extrapolação declarada como tal]`.

**O que esta decisão NÃO fecha:** o schema de campos do Redis Stream (a codificação de
`SeriesRow` em `Mapping[str, str]`) fica com quem construir o primeiro produtor —
`redis_series_write_queue.py:4-7` já nomeia isso, e esta ADR concorda que é decisão de
implementação (o *shape* do dado, `SeriesRow`, já está fixado em `domain/provenance.py`; o que
falta é só a codificação wire, não um contrato novo). A task correspondente deve documentar o
mapeamento de campos escolhido no módulo que o implementa, com teste de round-trip
(`encode(decode(x)) == x`).

### D2 · Redis dedicado a este projeto — `[DECISÃO-OWNER: 2026-09-04, escolha entre alternativas apresentadas]`

O `/architect` apresentou duas opções, com o custo de cada uma declarado:

| opção | custo | o que ela compra |
|---|---|---|
| **A — Redis dedicado a este projeto** (`redis:7-alpine` próprio em `deploy/compose.yml`) | +1 container: ~9,6 MB RSS idle + até 30 MB de teto de log | isolamento total: uma falha, upgrade ou política de eviction do Redis do `anything_monorepo` nunca afeta a fila durável de dado capture-or-lose |
| **B — Redis compartilhado com o `redis:7-alpine` do `anything_monorepo`** | zero container novo, zero RSS adicional | acopla ciclo de vida (restart, versão, política de memória/eviction) da fila durável a uma aplicação de produção alheia — mesma classe de custo que `ADR-002/D1` aceitou para Postgres, mas lá o dado era catálogo/registro (recriável); aqui a fila carrega, ainda que por poucos segundos, dado capture-or-lose em trânsito |

**Decisão: opção A, Redis dedicado.** O owner escolheu a recomendação do `/architect` — a
diferença de custo com B é da ordem de 9,6 MB, desprezível frente ao teto de disco/RAM que
motivou o compartilhamento do Postgres (~87 GB de histórico), e o Redis aqui carrega, mesmo que
brevemente, dado capture-or-lose em trânsito. `T-C` (compose ganha `redis:7-alpine`) já pode
nascer sem depender de uma leitura de `free -m`/`df -h` da VPS.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **Cada um dos 14 CLIs vira container de vida longa** | 150–300+ MB de RSS projetado (`[INFERRED]`) contra 40–70 MB da topologia escolhida, sem nenhum dos 14 precisar de disponibilidade contínua exceto 2 deles |
| **Resolver a fiação dentro do escopo de `T-07.4`/`T-07.5`, reabrindo-as** | as duas fecharam com DoD cumprido e conscientemente delimitado (ver Contexto, achados 1–3); reabrir uma task `done` para um escopo que ela mesma se recusou a assumir é reescrever história, não corrigir defeito |
| **Reabrir o PRD** | nenhuma das linhas abaixo introduz requisito novo — `CA-F3-8`/`CA-F3-12`/`CA-F4-25`/`ADR-002/D5` já obrigam o comportamento em produção; falta completar a implementação, que é ato de `/architect` + `/tech-lead`, não de `/pm` |
| **Construir o `deploy/compose.yml` completo agora, sem produtor real** | é exatamente a "construção especulativa" que `PRD-001 §12` recusa por padrão em todo este projeto (ver o próprio comentário do arquivo) — Redis sem consumidor é container sem propósito verificável |

## Falsificadores

| # | observação que derruba | o que ela derruba |
|---|---|---|
| **F1** | os dois coletores 24/7 rodando por threads no mesmo processo produzem contenção medida — um bloqueia o outro (latência ou perda de mensagem no stream que hoje não existe quando rodam isolados) | **D1** — a decisão de agrupá-los num processo só |
| **F2** | RSS medido em produção real, com os 3 processos de vida longa de pé por ≥ 24 h, excede **2×** a projeção de 40–70 MB sem explicação nova | **D1** — o dimensionamento, não a forma |
| **F3** | um teste de restart do escritor único **em produção**, com um produtor real publicando, perder mensagem | **`ADR-002/D5`** por trás desta ADR — a garantia que a lógica prova em teste não se sustenta com produtor real |
| **F4** | o Redis compartilhado (opção B de `D2`, se escolhida) sofrer um restart do `anything_monorepo` que derrube o consumer group deste projeto | a escolha de compartilhar, não a ADR — mas é o cenário que a opção A existe para evitar |

## O que esta ADR NÃO decide

- O schema de wire do Redis Stream (fica com a task que constrói o primeiro produtor — ver `D1`).
- Backup com teste de restauração (`[GAP G1]`, já tem dono: `T-02.4b`, `blocked` por `Q1`).
- O canal de alarme externo (`Q3`, ainda aberta — `T-07.11` já tem o detector pronto, só falta o
  transporte). **Esta ADR não desbloqueia `T-07.11` nem `T-09.5`** — ver
  [`tasks-candidatas-fiacao-producao.md`](../context/plataforma-dados/handoff/tasks-candidatas-fiacao-producao.md)
  para a correção desse ponto em relação ao handoff original.
