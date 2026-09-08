# Plano de execução — `SPEC-005` · Coinalyze fora da quarentena

**SPEC:** [`SPEC-005`](../../specs/SPEC-005-coinalyze-fora-da-quarentena.md) (`SPEC_DRAFT` — estado corrente sempre por `harness pipeline state coinalyze-fora-da-quarentena`)
**ADR:** [`ADR-033`](../../adr/ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md) (proposta; co-assinatura `quant-architect`)
**PRD:** [`PRD-005`](../../specs/PRD-005-coinalyze-fora-da-quarentena.md) · **Feature:** `coinalyze-fora-da-quarentena` (filha de `plataforma-dados`, irmã de `captura-em-producao`) · **Rev de ancoragem:** `master@4605767` · **Data:** 2026-09-08
**Tracker:** MCP `atlassian` não autenticado nesta sessão. UVs candidatas em `PRD-005 §6`; materialização é ato do `/tech-lead` após `SPEC_APPROVED`.

---

## As fases, a ordem e o que cada uma fecha

| fase | entrega | componente alvo | requisitos | depende de |
|---|---|---|---|---|
| [`01`](01_probe_em_regime_e_persistencia.md) | **Probe com região conhecida + store que sobrevive** — `observer_region="sa-east-1"`, `LagSummaryStore` (2 adaptadores), mesclagem conservadora, rodadas até `REGIME_N_MIN=200` | `sentimento` (+ `infra` na composição) | `US-1`, `US-2`; `RF-1..3`; `RNF-1..3`; `CA-F1-1`, `CA-F1-2'`, `CA-F1-3..4` | nada |
| [`02`](02_formula_modeled_e_promocao.md) | **Fórmula MODELED e promoção real** — `domain/modeled_availability_write.py`, `build_available_at_present_by_key`, predicado de quarentena lendo o store | `sentimento` | `US-3..5`; `RF-4..8`; `RN-1..4`; `CA-F2-1..3`, `CA-F2-4'`, `CA-E2E-1..3` | `01` (`CA-F1-*` verdes) |
| `03` (condicional) | Cadência formal do `coinalyze_one_shot_cli` — só se `[Q4]` vier "sim" do owner | `sentimento`/`infra` | `US-6`; `RN-5` | owner responder `[Q4]`; **não planejada em detalhe até a resposta** |

**Por que a ordem não é cerimônia** (`PRD-005 §1.3`): (b) persistência precisa existir **antes** de rodar o probe por muito tempo — perder uma rodada longa sem gravar repete o desperdício que `Q19` já nomeou como capture-or-lose. (c) consome (b): a fórmula MODELED não tem o que ler sem o store.

---

## As regras que valem em TODAS as fases

**`R-A` · Todo DoD nomeia o comando e o universo.** "Testes passam" não é DoD.
**`R-B` · Todo DoD tem a coluna "morde"** — o que TEM de acontecer quando a pré-condição falta; mesmo veredito nos dois lados = o DoD não mede nada.
**`R-C` · `live_availability_write.py` continua só com o ramo não-medido** — `git diff --stat <base>..HEAD -- backend/src/modules/sentimento/domain/live_availability_write.py` vazio em toda fase (a fórmula MODELED mora em módulo novo, `SPEC-005 §3.3`).
**`R-D` · Nenhuma mudança em `/collector-status`, `/ingest-health`, `web`, `charts`, `convergencia`** — `git diff --stat <base>..HEAD -- backend/src/api/routes backend/src/modules/sentimento/domain/collector_status.py frontend/src` vazio (`CA-E2E-3`, `NG-4`/`NG-7` do PRD).
**`R-E` · O `availability_probe_cli` nunca vira serviço de vida longa** — `docker compose ps` (se aparecer) nunca mostra um serviço `probe`/`coinalyze` permanente sem decisão nova do owner (`ADR-027/D1`, `RN-5`).
**`R-F` · Idioma** — código, evento de log, chave de `extra`, mensagem de exceção **novos** em inglês; `sentimento` fica (`CLAUDE.md`).
**`R-G` · Verificação é `make verify`** (saída em disco) + `lint-imports` (o mesmo portão de `ADR-031/F5`, agora cobrindo o motor do store de defasagem).
**`R-H` · O subagente devolve ponteiro, não relatório** — relatórios em `docs/context/coinalyze-fora-da-quarentena/gates/`.
**`R-I` · Nenhum número sem o comando** — `REGIME_N_MIN`, `margin_ms`, `lag_n` de cada rodada carregam o comando que os produziu.

---

## O que este plano NÃO faz

Não implanta na VPS (`NG-5`); não expande `availability_probe_set` (`NG-2`); não muda o predicado de 3 termos (`NG-3`); não muda `/collector-status`/`/ingest-health` (`NG-4`); não toca `web`/`charts`/`convergencia` (`NG-7`); não decide `[Q4]`/F3 sem o owner (`NG-6`); não decide `M1` (destino de `T-03.9` na mãe) — isso é ato do `/tech-lead`.

## Juízes por fase (co-assinatura no gate)

`01`/`02`: **`quant-architect`** (dono de `sentimento`; co-assina `REGIME_N_MIN`, `margin_ms`, nome do membro de `AvailabilitySource`, `SPEC-005 §8`) · QA: `harness-plugin:qa` sobre cada fase com os DoDs abaixo · `/review` do builder para `R-F`/`R-C`.

**Pendência que bloqueia `SPEC_APPROVED`, não `SPEC_DRAFT`:** a co-assinatura do `quant-architect` sobre `ADR-033 D2`/`SPEC-005 §3.2-3.4` — mesmo padrão que `ADR-031` usou para `infra-architect`/`quant-architect`.
