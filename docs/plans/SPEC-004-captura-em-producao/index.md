# Plano de execução — `SPEC-004` · Captura em produção

**SPEC:** [`SPEC-004`](../../specs/SPEC-004-captura-em-producao.md) (**`SPEC_DRAFT`** — estado corrente sempre por `harness pipeline state captura-em-producao`; `approve spec` do owner fecha `P1–P10` do cabeçalho)
**ADRs:** [`ADR-031`](../../adr/ADR-031-motor-do-registro-em-producao-postgres-por-adaptador-e-a-imagem-do-candidato-4.md) (proposta; co-assinatura `quant-architect` + `infra-architect`) · [`ADR-032`](../../adr/ADR-032-dois-alvos-de-compose-um-arquivo-de-deploy-e-um-overlay-local-explicito.md) (proposta; co-assinatura `infra-architect`)
**PRD:** [`PRD-004`](../../specs/PRD-004-captura-em-producao.md) · **Feature:** `captura-em-producao` (filha de `plataforma-dados`) · **Rev de ancoragem:** `master@0acf947` · **Data:** 2026-09-07
**Tracker:** MCP `atlassian` autenticado (leitura); UVs candidatas em `PRD-004 §6` (Epic pai `CST-5` `[INFERRED I-4]`); materialização é ato do `/tech-lead` após `SPEC_APPROVED`. Destino de `T-07.15/16/17` da mãe: `P10` (`M1`).

---

## As três fases, a ordem e o que cada uma fecha

| fase | entrega | componente alvo | requisitos | depende de |
|---|---|---|---|---|
| [`01`](01_coletor_publica_e_se_registra.md) | **O coletor publica e se registra** — `series_row_wire`, `MAXLEN` no bus, `collectors_cli` (1 processo, 2 threads), `IngestRun` por sessão/ciclo, `Q3` assinado, vazão medida 24 h | `sentimento` | `US-1..3`; `RF-1..4`; `RN-2`, `RN-4`, `RN-8`; `CA-F1-1..5` | nada |
| [`02`](02_escritor_em_producao_e_registro_unico.md) | **O escritor vira processo e o registro vira um só** — `single_writer_cli`, `PostgresSeriesSink` + `PostgresObservedLookup`, DDL da série (gate), `PostgresIngestRecordStore`, `INGEST_RECORD_BACKEND` em `src.main` | `sentimento` (+ `infra` na composição) | `US-4..7`; `RF-5..7`, `RF-10`; `RN-3`, `RN-4`; `CA-F2-1..5` | `01` (`CA-F1-*` verdes) |
| [`03`](03_compose_em_dois_alvos.md) | **Sobe por compose em dois alvos** — Dockerfiles + `.dockerignore`, `compose.yml` 7 serviços, `compose.local.yml`, `.env.example` +13, `make compose-*`, medição de RSS/imagem, E2E | `infra` | `US-8..10`; `RF-8`, `RF-9`, `RF-11`, `RF-12`; `RN-5`, `RN-7`; `CA-F3-1..9`; `CA-E2E-1..3` | `02` (`CA-F2-*` verdes) |

**Por que a ordem não é cerimônia** (`PRD-004 §1.3`, `ADR-027` §Alternativas): compose antes de produtor e escritor reais é *"construção especulativa"* — Redis sem consumidor é container sem propósito verificável. `RN-1`: task de `03` `in_progress` com `01`/`02` abertas ⇒ o `/tech-lead` reprova.

---

## As regras que valem em TODAS as fases

**`R-A` · Todo DoD nomeia o comando e o universo.** *"Testes passam"* não é DoD.
**`R-B` · Todo DoD tem a coluna "morde"** — o que TEM de acontecer quando a pré-condição falta; mesmo veredito nos dois lados = o DoD não mede nada (`PRD-004 §10`).
**`R-C` · Um `XADD`, um `decode`** — `grep -rn 'xadd\|XADD' backend/src --include='*.py' | grep -v redis_stream_bus.py | wc -l` = **0** em toda fase (`RN-2`).
**`R-D` · `run_single_writer`, `domain/` e `web` intocados** — `git diff --stat <base>..HEAD -- backend/src/modules/sentimento/use_cases/run_single_writer.py backend/src/modules/sentimento/domain frontend/src backend/src/api/routes/collector_status.py` → **vazio** (`SPEC-004 §4`, `CA-E2E-3`).
**`R-E` · Nenhuma implantação** — `build`/`up` locais são o teto (`RN-7`, `P6`); `docker compose -f deploy/compose.yml ps` na VPS mostrando `collector` = escopo violado.
**`R-F` · Idioma** — código, evento de log, chave de `extra`, mensagem de exceção **novos** em inglês; `sentimento` e os 4 eventos PT ficam (`CLAUDE.md` tabela + §mensagem de exceção; `NG-9`).
**`R-G` · Verificação é `make verify`** (saída em disco) + `lint-imports` (o contrato *"motor não vaza de infra"* é o portão de `ADR-031/F5`); testes de processo real declarados por fase **fora** de `verify` até o owner decidir.
**`R-H` · O subagente devolve ponteiro, não relatório** (`docs/protocolo-de-despacho.md` R1–R7). Relatórios em `docs/context/captura-em-producao/gates/`; medições em `docs/context/captura-em-producao/medicoes/`.
**`R-I` · Nenhum número sem o comando** — todo valor de teto, RSS, vazão e contagem carrega comando, `n` e rótulo.

---

## O que este plano NÃO faz

Não implanta (`NG-1`); não cria coletor novo (`NG-2`); não toca `web`/SSE (`NG-3`); não faz backfill nem backup (`NG-4`/`NG-5`); não transforma one-shots em serviço (`NG-6`); não abre alarme externo (`NG-7`); não muda envelope de `/collector-status` nem as 15 colunas de `/ingest-health` (`NG-8`); não renomeia os 4 eventos PT nem `janela_de_perda` (`NG-9`); não migra a série para fora do candidato 4 (`NG-10`); não decide `M1` (destino das tasks da mãe — `/tech-lead` + owner).

## Juízes por fase (co-assinatura no gate)

`01`/`02`: `quant-architect` (dono de `sentimento`; assina `Q3`, DDL da série, `[Q10]`, `[Q11]`) · `02` composição e `03`: `infra-architect` (juiz de `infra`; `ADR-031/D2`, `ADR-032`) · QA: `harness-plugin:qa` sobre cada fase com os DoDs abaixo · `/review` do builder para `R-F`.
