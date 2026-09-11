# Plano de paralelismo — `cinco-metricas-do-core`

> **Origem:** `D8` (owner, `2026-09-10`) — citação literal: *"Faça o tl montar uma plano de
> paralelismo e exectamos a partir desse plano com no máximo 2 execuções simultaneas"*
> `[PREMISSA-OWNER: 2026-09-10]`
> **Teto: 2.** ⚠️ O teto anterior era **3** (2026-09-07). **Script ou plano que use lote de 3 está
> desatualizado a partir de 2026-09-10.**
> **Dado de máquina:** [`tasks.toml`](tasks.toml) · **Racional da quebra:** [`tasks_review.md`](tasks_review.md)

**Este arquivo é a entrada da execução.** O orquestrador **não improvisa o agrupamento na hora**
(`D8`, literal). Ele lê o lote, confere os caminhos, despacha.

---

## 0. Como ler um lote

```
Lote <fase><letra> · <T-xx.y> ∥ <T-xx.z>
  toca: <prefixos de caminho, um por task>
  colisão: NENHUMA | <arquivo> — <o que fazer>
```

**Antes de despachar um lote de 2, confira a linha `toca:`.** Se os dois conjuntos tiverem interseção
não-vazia, **o lote é quebrado em dois de 1** — mesmo que este arquivo diga que não colidem. A regra
em vigor é literal: *confira o diff, não o resumo*.

⚠️ **Colisão não é só de arquivo.** Este plano marca três classes:
`[ARQUIVO]` (duas worktrees no mesmo path) · `[COTA]` (dois processos contra a mesma janela de 40 u /
60 s da Coinalyze) · `[AMBIENTE]` (dois processos contra o mesmo `deploy/compose.yml`, o mesmo serviço
`collector` e o mesmo Postgres compartilhado).

---

## 1. Os quatro arquivos que decidem tudo — o mapa de colisão

Estes são os **hot files**: cada um é tocado por 3 ou mais fases. É por eles que a fatia não
paraleliza com a fatia (`tasks_review.md` §2).

| # | arquivo | fases | por quê |
|---|---|---|---|
| **H1** | `backend/src/modules/sentimento/infra/collectors_cli.py` (**807 linhas** `[MEDIDO 2026-09-10: wc -l]`) | `01` `03` `04` `05` | um `_run_*_collector` por fonte (`:406` premiumIndex, `:528` forceOrder) + o `run()`/`main()` que despacham |
| **H2** | `backend/src/modules/sentimento/use_cases/series_catalog.py` | **as 5** | `list_series_catalog()` (`:94-113`) é **o** sítio de registro do catálogo **servido** |
| **H3** | `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` | **as 5** | `_build_row` + um `_<metrica>_key` por série |
| **H4** | `frontend/src/app/symbol/SymbolClient.tsx` (`:239-246`) + `view-model.ts` (tipo `S2Panels`) | **as 5** | a lista de painéis e o tipo que os carrega |

**Regra derivada, e ela vale para todo lote deste arquivo:** **nunca** dois membros de um lote tocando
o mesmo `H`. Onde a onda liberaria isso, o lote é quebrado.

---

## 2. As ondas ENTRE fatias — e por que são cinco, não menos

```
01 ──┬─→ 02
     └─→ 03 ──→ 04
05 (só depende de T-01.4, por DoD-4)
```

| par | o DAG permite? | veredito | motivo dominante |
|---|---|---|---|
| `02 ∥ 01` | **não** | serial | `DoD-7` da `02` é *"nenhuma chamada HTTP nova"* — ela é consumidora do cliente da `01` por definição |
| `04 ∥ 03` | **não** | serial | item `4.2`: *"reusa o cliente que a fase `03` construiu"* |
| `03 ∥ 01` | **sim**, após `T-01.4` | **serial** | `[ARQUIVO]` H1 + H2 + H3. Colisão no despacho de coletor resolve com aparência limpa e **um coletor deixa de ser chamado, em silêncio** |
| `05 ∥ 02/03/04` | **sim**, após `T-01.4` | **serial** | `[AMBIENTE]` (motivo dominante) + `[ARQUIVO]` H1/H2/H3/H4 + `[COTA]` |

**⇒ As fatias correm em série: `01 → 02 → 03 → 04 → 05`.** O teto de `D8` **não é a restrição ativa
entre fatias** — a restrição ativa é o arquivo compartilhado e o ambiente único. O argumento completo
está em `tasks_review.md` §2, incluindo o custo de calendário que essa recusa cobra.

---

## 3. Fase `01` — volume · 11 tasks · **6 lotes** · 5 ondas

### Onda 1 — 4 tasks independentes, dois lotes

```
Lote 1A · T-01.1 ∥ T-01.2
  T-01.1 toca: backend/src/modules/sentimento/domain/klines_volume_catalog.py (novo)
               backend/tests/sentimento/test_klines_volume_catalog.py (novo)
  T-01.2 toca: backend/src/modules/sentimento/infra/binance_klines_client.py (novo)
               backend/tests/sentimento/test_binance_klines_client.py (novo)
  colisão: NENHUMA — dois arquivos novos, camadas diferentes (domain × infra)

Lote 1B · T-01.4 ∥ T-01.5
  T-01.4 toca: infra/series_row_wire.py · infra/redis_series_write_queue.py
               infra/single_writer_cli.py · use_cases/collector_run_mapping.py
               infra/postgres_ingest_record_store.py · backend/tests/sentimento/**
  T-01.5 toca: infra/ingest_health_cli.py (_STABLE_FORMAT:33) + o teste que pina o formato
  colisão: [ARQUIVO] RISCO EM `single_writer_cli.py` — ele instala `build_stdout_handler`
           de `ingest_health_cli.py`. ⛔ T-01.5 NÃO edita `single_writer_cli.py`: o escopo
           dela é a constante do formatador e o teste. É restrição de escopo, não descrição
           (tasks_review.md §4.2). Se o builder de T-01.5 precisar tocá-lo, ABORTA o lote.
```

### Onda 2

```
Lote 2A · T-01.3 ∥ T-01.6
  T-01.3 toca: H1 collectors_cli.py · H3 collector_series_mapping.py
               use_cases/collector_run_mapping.py · deploy/compose.yml (vars de cadência)
  T-01.6 toca: H2 use_cases/series_catalog.py + teste
  colisão: NENHUMA — H1/H3 × H2 são disjuntos
```

### Onda 3

```
Lote 3A · T-01.7 ∥ T-01.10
  T-01.7  toca: frontend/src/app/symbol/{SymbolClient.tsx,view-model.ts,view-model.test.ts,
                panel-status.ts,series-history-client.ts}   (H4)
  T-01.10 toca: deploy/compose.yml · docs/context/cinco-metricas-do-core/gates/
  colisão: [ARQUIVO] RISCO EM `deploy/compose.yml` se T-01.3 tiver deixado var pendente —
           confira `git diff deploy/compose.yml` da onda 2 antes de despachar.
           [AMBIENTE] T-01.10 é a ÚNICA task desta onda que fala com produção.
```

### Onda 4

```
Lote 4A · T-01.8 ∥ T-01.9
  T-01.8 toca: docs/product/** · docs/context/cinco-metricas-do-core/gates/design-01.md
  T-01.9 toca: frontend/e2e/09-volume-dado-real.spec.ts (novo) · frontend/e2e/helpers.ts
  colisão: NENHUMA **enquanto o veredito do gate for APPROVED sem mudança de código**.
           ⚠️ Se o ux-ui-mastery emitir NEEDS_FIX que toque SymbolClient.tsx, T-01.8 passa a
           tocar H4 e o lote É QUEBRADO: T-01.8 primeiro, T-01.9 depois.
           A regra que torna isso raro: o e2e seleciona por `data-testid` estável fixado em
           T-01.7 — cor, altura e escala não podem quebrar o assert de N ≥ 30
           (tasks_review.md §3(d) e §8.3, decisão do /tech-lead, contestável).
```

### Onda 5

```
Lote 5A · T-01.11   (concorrência 1 — é a conjunção dos 4 DoD; não há o que paralelizar)
  toca: docs/context/cinco-metricas-do-core/gates/
```

---

## 4. Fases `02`, `03` e `04`

### Fase `02` — CVD · 8 tasks · **6 lotes** · 6 ondas

```
Lote 2-1A · T-02.1                       (concorrência 1)
  toca: scripts de medição efêmeros + gates/falsificador-cvd-reconstructed-from.md
  ⛔ ANTES da identidade: series_key_id é sha256 dos 15 termos (series_key.py:226-234);
     mudar reconstructed_from depois RE-IDENTIFICA a série. Serial por obrigação, não por teto.

Lote 2-2A · T-02.2                       (concorrência 1)
  toca: domain/cvd_source_catalog.py + backend/tests/sentimento/test_cvd_source_catalog.py

Lote 2-3A · T-02.3 ∥ T-02.4
  T-02.3 toca: domain/cvd.py · H3 collector_series_mapping.py · H1 collectors_cli.py (leitura do [9])
  T-02.4 toca: H2 use_cases/series_catalog.py
  colisão: NENHUMA

Lote 2-4A · T-02.5 ∥ T-02.7
  T-02.5 toca: H4 frontend/src/app/symbol/**
  T-02.7 toca: deploy/compose.yml · gates/          [AMBIENTE]
  colisão: NENHUMA (backend/deploy × frontend)

Lote 2-5A · T-02.6                       (concorrência 1 — e2e precisa do dado que 2-4A produziu)
  toca: frontend/e2e/10-cvd-dado-real.spec.ts (novo)

Lote 2-6A · T-02.8                       (concorrência 1)
  toca: gates/
```

### Fase `03` — open interest · 8 tasks · **6 lotes** · 6 ondas

```
Lote 3-1A · T-03.1 ∥ T-03.4
  T-03.1 toca: gates/inventario-oi-infra.md   (LEITURA dos 3 arquivos; zero código de produção)
  T-03.4 toca: H2 use_cases/series_catalog.py
  colisão: NENHUMA — T-03.1 lê `infra/binance_oi_history_client.py`,
           `domain/oi_history_paginator.py` e `infra/coinalyze_one_shot_cli.py`; não escreve neles

Lote 3-2A · T-03.2 ∥ T-03.5
  T-03.2 toca: infra/binance_futures_data_client.py (novo ou extensão de binance_oi_history_client.py)
               gates/limite-futures-data.md
  T-03.5 toca: H4 frontend/src/app/symbol/**
  colisão: NENHUMA (backend × frontend) — este é o par mais limpo da fase

Lote 3-3A · T-03.3                       (concorrência 1)
  toca: H1 collectors_cli.py · H3 collector_series_mapping.py · deploy/compose.yml

Lote 3-4A · T-03.7                       (concorrência 1)  [AMBIENTE]
  toca: deploy/compose.yml · gates/

Lote 3-5A · T-03.6                       (concorrência 1)
  toca: frontend/e2e/11-oi-dado-real.spec.ts (novo)
  ⚠️ RN-S1: o comando NOMEIA o divisor — `pontos_no_DOM ÷ 5`. Série de 5m na grade de 1m

Lote 3-6A · T-03.8                       (concorrência 1)
  toca: gates/
```

### Fase `04` — long/short · 9 tasks · **6 lotes** · 6 ondas

```
Lote 4-1A · T-04.1                       (concorrência 1)
  toca: gates/teto-5min-long-short.md
  ⛔ ANTES da identidade (falsificador de SPEC-007 §8.6)

Lote 4-2A · T-04.2                       (concorrência 1)
  toca: domain/long_short_ratio_series.py (existe) + teste nomeado em verified_by

Lote 4-3A · T-04.3 ∥ T-04.4
  T-04.3 toca: H1 collectors_cli.py · H3 collector_series_mapping.py
  T-04.4 toca: H2 use_cases/series_catalog.py
  colisão: NENHUMA

Lote 4-4A · T-04.5 ∥ T-04.8
  T-04.5 toca: H4 frontend/src/app/symbol/**  (PAINEL NOVO — muda a lista de :239-246 e S2Panels)
  T-04.8 toca: deploy/compose.yml · gates/    [AMBIENTE]
  colisão: NENHUMA
  ⚠️ ESTE é o lote que torna `04 ∥ 05` impossível: T-05.9 também cria painel novo no MESMO
     record de tipo. Duas worktrees, um `S2Panels` — conflito garantido.

Lote 4-5A · T-04.6 ∥ T-04.7
  T-04.6 toca: docs/product/** · gates/design-04.md
  T-04.7 toca: frontend/e2e/12-long-short-dado-real.spec.ts (novo)
  colisão: mesma ressalva do Lote 1A da fase 01 — NEEDS_FIX que toque H4 quebra o lote

Lote 4-6A · T-04.9                       (concorrência 1)
  toca: gates/
  ⚠️ carrega o falsificador da reta: autocorrelação 0,99+ desenha uma linha plana. Se o painel
     for visualmente plano em 15min..4h, ACRESCENTA `sum_taker_long_short_vol_ratio`
     (autocorrelação 0,0955) como 2ª série do mesmo painel — reversível DENTRO da fase
```

---

## 5. Fase `05` — liquidações · 14 tasks · **9 lotes** · 7 ondas

⚠️ **A fase mais cara, e a única com `[COTA]`.** Integração de terceiro **do zero**: o coletor
Coinalyze que ela reusaria deixou de existir quando `GA-7` tirou o CVD da Coinalyze.

```
Lote 5-1A · T-05.1 ∥ T-05.4
  T-05.1 toca: script de medição efêmero · gates/falsificador-denom-liquidacao.md
               → fala com a Coinalyze  [COTA]
  T-05.4 toca: .env.example · deploy/compose.yml · docs (portão de grep) — ZERO rede
  colisão: NENHUMA. O par é deliberado: um consome cota, o outro não toca a rede

Lote 5-1B · T-05.2                       (concorrência 1)
  toca: script de medição efêmero · gates/retencao-liquidation-history.md
  ⛔ [COTA] SOZINHA, e o motivo é o instrumento: o teto é 40 u por janela DESLIZANTE de 60 s
     [MEDIDO 2026-09-10, n=41 requisições]. Dois medidores na mesma chave se envenenam — o 429
     de um vira ruído na medição do outro. NÃO é colisão de arquivo, e por isso não aparece
     no `git status`: é a classe que este plano existe para nomear

Lote 5-2A · T-05.3                       (concorrência 1)
  toca: domain/liquidation_catalog.py (novo) + teste nomeado em verified_by
  ⛔ depois de T-05.1 (denom fixado ANTES de gravar a identidade)

Lote 5-3A · T-05.5 ∥ T-05.8
  T-05.5 toca: H1 collectors_cli.py · H3 collector_series_mapping.py
               infra/coinalyze_history_client.py · infra/https_quota_probe.py
               domain/quota_bucket.py · domain/local_quota_broker.py
  T-05.8 toca: H2 use_cases/series_catalog.py + contrato de série esparsa (teste)
  colisão: NENHUMA — mas T-05.5 é a task mais larga do plano (RS-3.1..RS-3.7, sete requisitos
           com teste cada). Se ela passar de ~150 turnos, HANDOFF antes de devolver

Lote 5-4A · T-05.6 ∥ T-05.9
  T-05.6 toca: H1 collectors_cli.py (caminho de erro) · use_cases/collector_run_mapping.py
  T-05.9 toca: H4 frontend/src/app/symbol/**  (PAINEL NOVO + rótulo RS-5 + published_error)
  colisão: NENHUMA (backend × frontend)

Lote 5-4B · T-05.7                       (concorrência 1)
  toca: domain/liquidation_liveness.py (novo) · use_cases/** · testes
  ⚠️ herda T-07.11 de `plataforma-dados` (blocked, tasks.toml:1161) POR `refs`, nunca por
     `depends_on` — o grafo do validador é intra-feature (V-13). Liveness por CONTIGUIDADE e
     HEARTBEAT, nunca taxa: evento esparso não distingue conserto de ausência

Lote 5-5A · T-05.10 ∥ T-05.12
  T-05.10 toca: docs/product/** · gates/design-05.md
  T-05.12 toca: deploy/compose.yml · gates/   [AMBIENTE] [COTA — mede consumo ≤ 5% do teto]
  colisão: mesma ressalva de NEEDS_FIX sobre H4

Lote 5-6A · T-05.11 ∥ T-05.13
  T-05.11 toca: frontend/e2e/13-liquidacoes-dado-real.spec.ts (novo)
                ⚠️ série ESPARSA: o e2e escolhe uma janela em que HOUVE liquidação
  T-05.13 toca: docs/context/cinco-metricas-do-core/handoff/escalonamento-quant-architect.md
  colisão: NENHUMA

Lote 5-7A · T-05.14                      (concorrência 1)
  toca: gates/
```

---

## 6. O teto real que o DAG permite — com o comando que produziu o número

| | valor |
|---|---:|
| tasks | **50** |
| ondas do DAG (soma das 5 fatias) | **30** |
| lotes (teto 2 aplicado) | **33** |
| lotes com **2** tasks | **17** (51,5%) |
| lotes com **1** task | **16** |
| **teto de concorrência que a EXECUÇÃO usa** | **2** (`D8`, owner) |
| **teto que o DAG LIBERARIA se não houvesse `D8`** | **4** — na onda 1 da fase `01` |
| execuções sequenciais evitadas | 50 → 33 = **−34%** de passos |

⚠️ **O DAG libera mais de 2 em três ondas, e `D8` é o que corta** — é exatamente o caso que a decisão
do owner antecipa (*"Vale mesmo quando o DAG liberar mais de 2 tasks na mesma onda"*):

| onda | tasks liberadas | teto do DAG | lotes sob `D8` |
|---|---|---:|---:|
| fase `01`, onda 1 | `T-01.1` `T-01.2` `T-01.4` `T-01.5` | **4** | 2 (`1A` + `1B`) |
| fase `05`, onda 1 | `T-05.1` `T-05.2` `T-05.4` | **3** | 2 (`5-1A` + `5-1B`) |
| fase `05`, onda 4 | `T-05.6` `T-05.7` `T-05.9` | **3** | 2 (`5-4A` + `5-4B`) |

Nas outras **27** ondas o DAG libera 2 ou 1, e `D8` não é a restrição ativa — o `depends_on` já é.

**Ondas por fatia:** `01` → 5 · `02` → 6 · `03` → 6 · `04` → 6 · `05` → 7.

`[MEDIDO 2026-09-10 sobre o grafo de `depends_on` de `docs/context/cinco-metricas-do-core/tasks.toml`,
n=50 tasks, arestas intra-fatia com as dependências de fatia anterior tratadas como satisfeitas;
`harness tasks validate cinco-metricas-do-core` → `50 task(s), 0 ERROR, 0 WARN`, e o grafo sai por
`harness tasks json cinco-metricas-do-core`]`

**Onde os 16 lotes de 1 estão, e por que não é desperdício:**

| motivo | lotes | é reduzível? |
|---|---:|---|
| **falsificador antes da identidade** (`series_key_id` é `sha256` dos 15 termos) | 3 | **não** — corrigir depois é migração, não correção |
| **fechamento vertical** (a conjunção dos 4 DoD) | 5 | **não** — é um veredito, não trabalho divisível |
| **deploy sozinho** (nada mais pronto na onda) | 2 | talvez, se o lote anterior adiantar a task de `web` |
| **e2e sozinho** (precisa do dado que o deploy acabou de produzir) | 3 | **não** — `[AMBIENTE]` |
| **cadeia linear** (identidade → coletor, `[COTA]`) | 3 | **não** |

---

## 7. Antes de despachar — o checklist de 4 linhas

1. `harness pipeline state cinco-metricas-do-core` — o ledger é a identidade do estado, não o texto.
2. Conferir a linha `toca:` das duas tasks do lote. Interseção não-vazia ⇒ **quebra o lote**.
3. `[AMBIENTE]`: **no máximo UMA task por lote fala com produção.** Duas nunca.
4. Ao terminar: **confirmar o commit na worktree (`git log`/`git status`) ANTES de removê-la** — três
   relatórios de QA já foram perdidos por pular esse passo.

## 8. O que este plano NÃO decide

Não aprova task, não cria unidade de valor, não autoriza `build` (gate do **owner**) e não escolhe o
agente de cada task — isso é `harness policy --key agents.by_component` e é do orquestrador.
