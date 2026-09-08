# SPEC-005 — Coinalyze fora da quarentena: probe em regime, store de defasagem, fórmula MODELED e promoção

**Feature:** `coinalyze-fora-da-quarentena` (filha de `plataforma-dados`, irmã de `captura-em-producao`) · **Data:** 2026-09-08
**PRD:** [`PRD-005`](PRD-005-coinalyze-fora-da-quarentena.md) · **ADR:** [`ADR-033`](../adr/ADR-033-store-de-defasagem-motor-compartilhado-e-mesclagem-conservadora.md) (aceita; co-assinatura `quant-architect` satisfeita 2026-09-08)
**Rev de ancoragem:** `master@4605767` (`git rev-parse --short HEAD`)
**Componentes:** `sentimento` (probe, fórmula MODELED, adaptador de promoção), `infra` (store novo, composição), `docs`.

---

## 0. Veredito do peer review do `PRD-005` — **[READY FOR SPEC]**

Gap Analysis feita sobre `PRD-005` + `handoff_to_architect.md`. **Nenhum achado bloqueante.** Achados:

1. **Tensão real entre `RF-3`/`CA-F1-4` (segunda rodada acrescenta amostra) e `RNF-1` (store não é uma linha por amostra bruta acumulada para sempre)** — o PRD nomeia as duas exigências sem dizer como conciliá-las: acrescentar amostra normalmente exige guardar as amostras brutas (para recalcular `p99` corretamente), e `RNF-1` proíbe exatamente isso. **Não é contradição lógica — é `TBD` de mecanismo de acréscimo, e é o §9 desta SPEC que fecha.** Resolvido por regra de mesclagem conservadora (`§4.2`), registrada em `ADR-033`.
2. **`[Q1]`, `[Q3]`, `[Q5]` decididos aqui** (grafia de `observer_region`, `margem`, forma do adaptador de leitura) — nenhum bloqueava `PRD_DRAFT`, mas todos bloqueavam código; decisões e evidência em `§3`.
3. **`[Q2]` decidido em `ADR-033`** — motor do store de defasagem, estendendo `ADR-031/D1` (mesmo padrão: adaptador único, `sqlite` dev-default / `postgres` prod, conexão injetada) em vez de abrir um terceiro motor.
4. **`[Q4]`/`M2` (F3) e `[M1]` (destino de `T-03.9`) continuam do owner/`tech-lead`** — não são `TBD` de arquitetura, são decisão de escopo/tracker; esta SPEC não os fecha (§8).

**Regras bloqueantes em vigor endereçadas** — `harness rules list --severity block` → **8** `[MEDIDO 2026-09-08]`: as mesmas de `PRD-004`/`SPEC-004`. Código novo (fórmula MODELED, adaptador de leitura, store) usa logger nomeado do módulo (`core.print-statement`), import absoluto (`core.relative-import`), nunca engole exceção em silêncio (`core.silent-except`), e credencial de Postgres (se aplicável) só via `${VAR}`/ambiente (`core.hardcoded-secret`). As duas `web-fullstack.*` não se aplicam — nenhum código de `web` nesta feature (`NG-7` do PRD).

---

## 1. Objetivo e fronteira

### 1.1 Objetivo, em propriedades verificáveis (herdadas de `PRD-005 §2`)

1. O probe (`availability_probe_cli`, já existente) roda **repetidamente** (cron/invocação manual — nunca vira serviço de vida longa, `ADR-027/D1`) contra `open_interest`/`liquidation` da Coinalyze, com `observer_region = "sa-east-1"` (§3.1), até `lag_n` acumulado no store cruzar o limiar de regime (§3.2) para cada `(endpoint, observer_region)`.
2. Cada rodada **mescla** no store, nunca sobrescreve (§4.2) — sobrevive ao fim do processo.
3. A fórmula MODELED (`SPEC-001 §5.2`) está implementada num módulo novo, testada, e é o único caminho que produz `available_at` não-nulo a partir de `lag_n > 0`.
4. Um adaptador de leitura, chamado sob demanda (§3.6), monta `available_at_present_by_key` a partir do store e alimenta `quarantine_terms.readable_by_backtest` sem intervenção manual.
5. **Falsificador de fase:** com os quatro itens acima, uma leitura real de `backtest` sobre `open_interest` Coinalyze devolve linhas não-vazias (`CA-E2E-1`), e um endpoint nunca medido continua devolvendo zero (`CA-E2E-2`).
6. `/collector-status` e `/ingest-health` intocados (`ADR-030/D5`, `ADR-008/D3`, herdado — `NG-4` do PRD).

### 1.2 Termos (na ausência de glossário — `harness policy --key glossary_doc` vazio)

- **em regime**: `lag_n` persistido, por `(endpoint, observer_region)`, `>= REGIME_N_MIN` (§3.2) — não é uma duração de relógio, é um limiar de contagem que a acumulação entre rodadas do probe atinge.
- **mesclagem conservadora**: a regra de acréscimo do store (§4.2/`ADR-033 D2`) que nunca deixa `p99` cair nem `lag_n` regredir entre duas leituras do mesmo `(endpoint, observer_region)`.
- **promoção**: o predicado de quarentena reavaliar uma série de `available_at IS NULL` para um valor — muda o **mapa** `available_at_present_by_key`, nunca o `SeriesKey` do catálogo.

### 1.3 Fora, por remissão

Non-goals de `PRD-005 §11` (`NG-1`–`NG-7`), intocados. Em particular: nenhum coletor de vida longa (`NG-1`), nenhuma expansão do `availability_probe_set` (`NG-2`), predicado de 3 termos intocado (`NG-3`), nenhuma implantação na VPS (`NG-5`).

---

## 2. Decisões normativas que esta SPEC usa (e não reabre)

| decisão | onde | efeito aqui |
|---|---|---|
| Predicado de quarentena de 3 termos | `SPEC-001 §5.2` | fórmula MODELED alimenta só o 3º termo |
| Coletores one-shot/diários e `*_probe_cli` nunca viram serviço 24/7 | `ADR-027/D1` | probe roda por invocação repetida (cron/manual), nunca `docker compose` de vida longa |
| Símbolos e endpoints do `availability_probe_set` | `PRD-005 D-c/D-d` | reusa, não expande |
| Motor de armazenamento (série, catálogo) | `ADR-002/D1` | store de defasagem é NOVO objeto, mesma família de decisão (`ADR-033` estende, não reabre) |
| Adaptador único por porta, motor por config, conexão injetada | `ADR-031/D1` | `ADR-033` clona exatamente esta forma para o store de defasagem |
| Região VPS = local = São Paulo | `[PREMISSA-OWNER: 2026-09-08]` | `observer_region` grava valor conhecido, nunca `UNKNOWN_OBSERVER_REGION`, a partir desta feature |

---

## 3. Contratos

### 3.1 `observer_region` — grafia (`[Q1]`, parte 1 — decisão `/architect`)

**`"sa-east-1"`.** Motivo: é um identificador **externo, já publicado** (código de região AWS para São Paulo) — não inventa vocabulário novo, é inequívoco, e casa com a sugestão já registrada em `tasks.toml:544`/`PRD-005 §1.3`. Não é decisão de infraestrutura (não implica AWS de fato) — é só a **string estável** que `PRD-005 RNF-3` exige. Grava-se em toda chamada de `availability_probe_cli --observer-region sa-east-1` a partir desta feature; `UNKNOWN_OBSERVER_REGION` deixa de ser usado para Coinalyze/Binance no probe (permanece como default do argumento CLI para quem não passar a flag, `infra/availability_probe_cli.py:154`, intocado).

### 3.2 Limiar de regime (`[Q1]`, parte 2 — decisão `/architect`, **co-assinatura `quant-architect` pendente**)

**`REGIME_N_MIN = 200`** por `(endpoint, observer_region)` — constante nomeada em `domain`, ao lado da fórmula MODELED (§3.3), não um número solto em `config`.

Por que threshold de contagem, não duração de relógio: `RF-3`/`CA-F1-4` já obrigam o store a **acrescentar** entre rodadas — "em regime" é portanto uma propriedade do **acumulado**, não de uma única execução longa. Duração fixa erraria em dois sentidos: cedo demais para liquidação (`n=7` em 9m20s ⇒ ~`n=45`/hora, `REGIME_N_MIN` em ~4h30 só se a taxa se mantiver) e tarde demais para OI (`n=36` em 9m20s ⇒ ~`n=230`/hora, cruza em ~1h). Um limiar por contagem deixa o operador rodar o probe em pedaços (cron diário, ou manual, sempre dentro de `ADR-027/D1`) até cada endpoint cruzar, sem recalcular durações.

**Por que 200, não outro número:** duas ordens de grandeza acima do `n=36`/`n=7` já nomeados como amostra única insuficiente (`PRD-005 §1.3`), e alcançável em menos de um dia de invocações repetidas nas duas taxas medidas acima — sem exigir orçamento novo (reusa `AvailabilityProbeSet`, `RNF-2`). **Falsificador desta escolha:** se, medida a variância de `p99` entre duas janelas independentes de `n=200` do mesmo endpoint, a diferença for grande o bastante para mudar se uma leitura de `backtest` vê 0 ou >0 linhas, `REGIME_N_MIN` sobe — é parâmetro nomeado, revisável, não um portão fechado.

`CA-F1-2` do PRD ("probe roda por duração declarada") é **substituído** por `CA-F1-2'` (§7): "linha do store, por `(endpoint, observer_region)`, com `lag_n >= REGIME_N_MIN`".

### 3.3 A fórmula MODELED — módulo novo `domain/modeled_availability_write.py`

Ao lado de `live_availability_write.py` (que **só** cobre o ramo não-medido, por design — `T-06.6`), nunca dentro dele. Assinatura, para co-assinatura do `quant-architect`:

```
def resolve_measured_endpoint_availability(
    *, lag_summary: LagSummaryRow, native_grid: NativeGrid, bucket_end_ms: int, margin_ms: int,
) -> tuple[int, AvailabilitySource]:
```

- Pré-condição (violação = bug do chamador, mesmo padrão de `MeasuredLagCannotUseUnmeasuredPathError`): `lag_summary.lag_n > 0`. Chamar com `lag_n == 0`/`None` é o ramo do módulo antigo — `CA-F2-3` prova que ele continua recusando.
- Corpo: `próximo ponto de native_grid >= bucket_end_ms + lag_summary.lag_p99_ms + margin_ms`, sempre arredondado **para cima** (`RN-3` — nunca média/mediana).
- Retorno: `(available_at_ms, AvailabilitySource.MODELED)` — **ajustado pela co-assinatura `quant-architect`** (`ADR-033 §Co-assinatura/C3`): `SPEC-001 §2.2` fixa `availability_source ∈ {OBSERVED, MODELED}`, conjunto fechado de dois valores que esta SPEC não reabre (`§2`), e `SPEC-001 §5.2` (linhas 402-407) já nomeia esta exata fórmula ("próximo ponto da grade nativa >= bucket_end + p99_lag + margem") de "carimbo MODELED" — o mesmo termo que `domain/live_availability_write.py:35` usa para descrever este ramo ("the MODELED formula rounded to the native grid"), escrito antes desta feature. Não nasce terceiro membro do enum.
- Nunca devolve `bucket_end_ms` nem `bucket_end_ms + interval` (`RN-1`, `CA-F2-2`).

### 3.4 `margem` (`[Q3]` — decisão `/architect`)

**`margin_ms = 2 * (lag_summary.lag_resolution_s * 1000)`** — nunca constante global em milissegundos fixos.

Motivo, por precedente já escrito **neste mesmo repositório para o mesmo tipo de problema**: `PRD-001 CA-F4-16` decidiu, para o limiar de atraso do painel ao vivo, `limiar_atraso = 2c + p99` (`c` = cadência da série) **em vez de** uma constante — citado: *"o exemplo antigo usava `max_staleness = 600 s`... a invariante fica; a ilustração passa a ser paramétrica"*. `margem` aqui resolve o mesmo problema (um buffer de segurança sobre um percentil medido) com o mesmo instrumento: proporcional à cadência de amostragem do próprio probe (`lag_resolution_s`, já uma coluna de `LagSummaryRow`, zero estado novo), multiplicador `2` reusado do mesmo lugar. Continua **pessimista por construção** (soma, nunca subtrai) — coerente com `RN-3`.

**Falsificador:** se `margem` fixo em ms for exigido por alguma razão de domínio que `quant-architect` souber e este documento não capturou, é achado a levantar na co-assinatura — não é decisão fechada contra revisão, é decisão com fonte, como o resto desta SPEC exige.

### 3.5 O store de defasagem — `LagSummaryStore` (porta em `domain`/`use_cases`, adaptadores em `infra`) — `ADR-033`

Ver `ADR-033` para a decisão completa (motor, schema, regra de mesclagem). Resumo do contrato que este PRD consome:

- Porta: `record_batch(rows: Sequence[LagSummaryRow]) -> None` (grava/mescla) e `read(endpoint: str, observer_region: str) -> LagSummaryRow | None` (leitura de uma chave) + `read_all() -> Sequence[LagSummaryRow]` (para o adaptador de §3.6).
- `record_batch` **mescla**, nunca sobrescreve — regra em `ADR-033 D2`.
- Dois adaptadores: `SqliteLagSummaryStore` (dev/teste, default) e `PostgresLagSummaryStore` (prod), mesma porta, conexão injetada pelo composition root (`ADR-031/D1`, mesma forma). Seleção pela **mesma** variável `INGEST_RECORD_BACKEND` já introduzida por `ADR-031` — não é uma segunda variável para a mesma decisão de motor de registro.

### 3.6 O adaptador de leitura — `available_at_present_by_key` de produção (`[Q5]` — decisão `/architect`)

**Sob demanda, não job/cache.** Uma função em `use_cases` (ex.: `build_available_at_present_by_key(catalog, lag_summary_store) -> Mapping[str, bool]`) que:

1. Lê `lag_summary_store.read_all()`.
2. Para cada `SeriesCatalogEntry` cujo `SeriesKey` mapeia para um `(endpoint, observer_region)` do store, marca `True` sse a linha correspondente tem `lag_n >= REGIME_N_MIN` (§3.2) — **não** basta `lag_n > 0`: abaixo do limiar de regime, a fórmula MODELED não deveria ter sido chamada por §3.3, então o mapa também não promove.
3. Chamada por quem já monta o predicado de leitura de `backtest` hoje (mesmo ponto de entrada que hoje passa o mapa manualmente em teste) — nenhuma rota nova, nenhum endpoint novo.

Por que sob demanda: a tabela é pequena (2 endpoints × 1 região hoje, `NG-2` não expande), a leitura de `backtest` já paga o custo de ler o catálogo inteiro, e não há job/scheduler nesta feature além do próprio probe (`ADR-027/D1` não muda) — introduzir um cache seria estado adicional sem medição de necessidade. Se a leitura em produção medir custo real, é `[GAP]` a levantar depois, não hoje.

---

## 4. Limites de camada

- Fórmula MODELED (§3.3) e o cálculo de `margem` (§3.4): **`domain`** puro — sem I/O, sem relógio (`ADR-016`, `natureza.sh` continua em `0` leitura de relógio).
- `LagSummaryStore`, os dois adaptadores: **`infra`** — mesma fronteira de `PostgresIngestRecordStore`/`SqliteIngestRecordStore`.
- `build_available_at_present_by_key`: **`use_cases`** — orquestra domain (predicado) + porta (leitura), não decide fórmula nem schema.
- **Nada disto toca `web`/`charts`/`convergencia`** (`NG-7`) — o efeito é o predicado de quarentena mudar de valor para `backtest` ler.

---

## 5. Comportamento de borda

| caso | comportamento | onde é testado |
|---|---|---|
| Endpoint nunca medido (`lag_summary is None`) | ramo não-medido (`live_availability_write.py`), intocado | `CA-E2E-2` |
| Endpoint medido mas `lag_n < REGIME_N_MIN` | **continua** no ramo não-medido — `available_at_present_by_key` marca `False` mesmo com `lag_n > 0` | novo teste, `CA-F2-4'` (§7) |
| Endpoint medido, `lag_n >= REGIME_N_MIN` | ramo MODELED (§3.3), `available_at_present_by_key` marca `True` | `CA-E2E-1` |
| Segunda rodada do probe reduz `lag_p99_ms` observado (variância de amostra pequena) | mesclagem conservadora (`ADR-033 D2`) mantém o `p99` mais alto já visto — nunca promove com um número mais otimista que uma rodada anterior já revogou | `ADR-033`, teste de mesclagem |
| Processo do probe morre no meio de uma rodada | herdado de `T-03.6` — o que já foi coletado antes da queda é gravável em `record_batch` se o CLI já tiver fechado o lote; nenhuma mudança de contrato aqui | fora do escopo desta SPEC, comportamento já existente |
| `lag_summary.lag_p99_ms is None` chamado na fórmula MODELED | pré-condição violada (`lag_n == 0 <=> lag_p99_ms is None`, já garantido por `LagSummaryRow.__post_init__`) — chamador não deveria ter chegado aqui | `CA-F2-3` |

---

## 6. Fases — ordem obrigatória `F1 → F2 → (F3 condicional)` (herda `PRD-005 §1.3`)

| fase | entrega | componente | depende de |
|---|---|---|---|
| **F1** | `observer_region="sa-east-1"` no probe; `LagSummaryStore` (2 adaptadores) + mesclagem conservadora; primeiras rodadas até `REGIME_N_MIN` | `sentimento` (+ `infra` na composição) | nada |
| **F2** | fórmula MODELED (`domain/modeled_availability_write.py`); `build_available_at_present_by_key`; predicado de quarentena promovendo de verdade | `sentimento` | `F1` (`lag_n >= REGIME_N_MIN` real ou fixture equivalente para os testes) |
| ~~**F3**~~ (condicional a `[Q4]` do owner) | ~~cadência formal (`cron`/`systemd timer`) do `coinalyze_one_shot_cli` de captura de dado~~ — **postergada 2026-09-08** (`PRD-005 §18`): sem `convergencia` no código hoje, F3 não tem consumidor; não materializada em task nesta rodada | `sentimento`/`infra` | resolvida — postergada |

---

## 7. Critérios de aceite — atualizados sobre `PRD-005 §10`

Todos os `CA-F1-*`/`CA-F2-*`/`CA-E2E-*` do PRD valem **exceto**:

- **`CA-F1-2'`** substitui `CA-F1-2`: `grep`/leitura do store por `(endpoint, observer_region)` → `lag_n >= 200` para `open_interest` **e** `liquidation` — não mede duração de relógio.
- **`CA-F2-4'`** acrescenta a `CA-F2-4`: teste que planta `lag_n` entre `1` e `199` e prova que `available_at_present_by_key` continua `False` para aquela chave (o limiar de regime, não só `lag_n > 0`, decide a promoção).

---

## 8. Perguntas em Aberto — o que esta SPEC NÃO fecha

| id | pergunta | dono | bloqueia |
|---|---|---|---|
| ~~co-assinatura~~ | ~~`REGIME_N_MIN=200`, `margin_ms = 2×lag_resolution_s`, nome do membro de `AvailabilitySource` (§3.3)~~ — **satisfeita 2026-09-08**, `ADR-033 §Co-assinatura`: `REGIME_N_MIN` e `margem` confirmados; `AvailabilitySource` ajustado de `OBSERVED` para `MODELED` (§3.3 já refletido) | `quant-architect` | resolvida |
| ~~`[Q4]`~~ | ~~`coinalyze_one_shot_cli` precisa de agendamento formal? (decide se F3 existe)~~ — **postergada 2026-09-08**, `PRD-005 §18` | owner | resolvida — não bloqueia F1/F2 |
| `M1` | destino de `T-03.9` (mover para esta filha × fechar `superseded` na mãe) | `/tech-lead` | não bloqueia arquitetura |

---

## 9. Falsificador desta SPEC

Se, depois de F1+F2 implementadas, uma leitura real de `backtest` sobre `open_interest` Coinalyze continuar devolvendo zero linhas com `lag_n >= 200` persistido e legível — a SPEC errou em algum contrato de §3 (fórmula, adaptador, ou predicado), não é falha de dado.

Falsificador da regra de mesclagem (`ADR-033 D2`, citado aqui porque `RF-3`/`RNF-1` são desta SPEC): se duas rodadas do mesmo `(endpoint, observer_region)` produzirem um `p99` armazenado **menor** que o de uma rodada anterior, a mesclagem quebrou a doutrina "erro sempre pessimista" (`SPEC-001 §5.2`) que este PRD herda.

---

## 10. Ledger

`harness pipeline advance coinalyze-fora-da-quarentena SPEC_DRAFT` — executado após gravar este arquivo e o ADR. `SPEC_APPROVED` é gate do owner (`approve spec`) — não executado aqui.
