# SPEC-007 — Cinco métricas do CORE: identidade de série, fonte por métrica, e o gate que mede escrita de verdade

> **Feature:** `cinco-metricas-do-core` (filha de `plataforma-dados`)
> **PRD:** [`PRD-007`](PRD-007-cinco-metricas-do-core.md) · **Status no ledger:** `SPEC_DRAFT`
> **Status desta SPEC:** nasce `DRAFT`. `SPEC_APPROVED` exige `harness pipeline approve … spec` do **owner** — nenhum texto neste documento aprova a si mesmo (`CLAUDE.md` §*"O ledger é a identidade do estado"*).
> **Componentes alvo:** `sentimento` · `web` · `infra` (`harness policy --key components`, n=7)
> **ADRs desta rodada:** [`ADR-035`](../adr/ADR-035-contabilidade-de-n-written-o-escritor-fecha-o-run-que-o-coletor-abriu.md) · [`ADR-036`](../adr/ADR-036-fonte-por-metrica-do-core-a-origem-por-padrao-o-terceiro-so-onde-a-origem-e-vetada.md)
> **Árvore de referência:** `0f4ee55` (`git rev-parse --short HEAD`, `[MEDIDO 2026-09-10]`)

## 0. Como ler

Todo número carrega o comando, o universo (`n`) e o rótulo de força (`CLAUDE.md`). Esta SPEC **não contém
código** — ela fixa contratos, formas de dado, limites de camada e comportamento de borda. As tasks são
do `/tech-lead`; o plano de fases está em [`docs/plans/SPEC-007-cinco-metricas-do-core/`](../plans/SPEC-007-cinco-metricas-do-core/index.md).

**O que esta SPEC consome sem reabrir:** `D1`, `D1.b`, `D2`, `D3`, `P-infra`, `P-seed`
(`docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md`), mais duas premissas do owner
registradas durante esta rodada:

- **`[PREMISSA-OWNER: 2026-09-10]`**, literal: *"no piloto estamos rodando 4 symbols, quando virar n vamos chegar a 10"* ⇒ `N_piloto = 4`, `N_alvo = 10`.
- **`[PREMISSA-OWNER: 2026-09-10]`**, literal: *"Nossa operações serão no time de 15min a 4h."* ⇒ o timeframe de operação é `15min .. 4h`.

---

## 1. O veredito do Gap Analysis, e os sete achados que ele produziu

**Veredito: `[READY FOR SPEC]`.** Nenhum gap bloqueante ⇒ nenhum `feedback_to_pm.md`. Os sete achados
abaixo **corrigem premissas do PRD-007, dos handoffs e — no caso de `GA-7` — desta própria SPEC** e são
a razão de várias respostas de §3 não serem as que o PRD antecipava. Cada um traz o comando que o
produziu.

### GA-1 · A fatia 1 **não** reusa contrato de série: não existe métrica de volume em catálogo nenhum

`INVENTARIO-POR-METRICA.md` conclui *"o contrato da série está escrito e o coletor não existe"*, citando
`build_klines_last_entry`. **O contrato escrito é de PREÇO, não de volume.**
`price_source_catalog.py:179-190` declara `metric="klines_last"` com `reduction=Reduction.LAST`,
`nature=Nature.STOCK`, `unit="USDT"`, `denom="quote"`, `quantity_field=QuantityField.NA` — e o próprio
docstring (`:166`) diz *"the last trade price of the 5-minute bucket"*.

Os nomes de métrica que existem no domínio são **4**, em **5 sítios**
`[MEDIDO 2026-09-10: grep -rn 'metric="' backend/src/modules/sentimento/domain/*.py, n=5]`:

| `metric` | módulo | interval |
|---|---|---|
| `sum_open_interest` | `open_interest_catalog.py:92,113` | `5m` |
| `klines_last` | `price_source_catalog.py:179` | `5m` |
| `price_mark_close` | `price_source_catalog.py:234` | `5m` |
| `cvd_source` | `cvd_source_catalog.py:198,228,261` | `1m` |

**Nenhum é volume, long/short ou liquidação.** ⇒ A fatia 1 **cria** uma identidade de série; ela não a
herda. O que `D1.b` decidiu e continua de pé é o **endpoint** (`/fapi/v1/klines`, REST, sem WebSocket) —
e essa parte é o que torna a fatia 1 a de menor risco, não a inexistente herança de contrato.

**Consequência de escopo:** **quatro** das cinco fatias criam entrada de catálogo nova — volume,
long/short, liquidações e, depois de `GA-7`, também o CVD (o `metric` `cvd_source` existe, mas a
entrada com `provider="binance"` não, §4.4). Só **M2** reusa uma entrada pronta. Isso reordena o custo
relativo das fatias e é entrada de `[Q1]`.

### GA-2 · `interval` está **dentro da identidade**, e duas séries existentes declaram `5m` numa API que só serve `1m`

`interval` é um dos termos de `SERIES_KEY_TERMS` (`series_key.py:44`, `:189`) e `series_key_id()` é o
`sha256` da projeção canônica (`series_key.py:226-234`) — *"two keys that differ in any one term get
different IDs"*. Ao mesmo tempo, `/api/v1/series-history` recusa qualquer `interval != "1m"`:
`series_history.py:51` (`Literal["1m"]`) e `use_cases/series_history.py:109` (`SUPPORTED_INTERVAL`,
`ADR-034/D6`).

**Isto não é contradição, e a SPEC precisa dizer por quê**, sob pena de a fase 1 "descobrir" isso no
meio da implementação: a rota **não reagrega** — ela caminha uma grade de 1 min e pergunta `as_of` a
cada instante (`use_cases/series_history.py:132-152`), com `policy.bucket_interval_ms = 60_000` e
`max_staleness_ms` vindo do catálogo. Uma série de `5m` com `max_staleness_ms = 600_000`
(`price_source_catalog.py:210`; `open_interest_catalog.py:72` = `2 × 300_000`) é servida como **função
escada: a mesma barra repetida 5×** na grade de 1 min.

⇒ **Regra normativa desta SPEC (`RN-S1`):** `DoD-3` de uma fatia cuja série é de `5m` **não** pode ser
satisfeito contando pontos repetidos como se fossem pontos distintos. Ver `§8.2`.

### GA-3 · `long/short ratio` **não é uma série** — o nome genérico é proibido na camada de identidade

`FORBIDDEN_METRIC_NAMES` (`series_key.py:67`) recusa `ls_ratio` dentro de `SeriesKey.__post_init__`, e o
motivo é citado verbatim (`:78-83`): *"it is a generic name standing in for FOUR series with different
autocorrelation (0,99+ for three of them, 0,0955 for the fourth) — use `count_long_short_ratio`,
`count_toptrader_long_short_ratio`, `sum_toptrader_long_short_ratio` or `sum_taker_long_short_vol_ratio`"*
`[DOC: SPEC-001 §3.1/§5.11, CA-F2-3]`.

`PRD-007` §1.2 trata **M3** como uma métrica. A camada de identidade **reprova** essa leitura em tempo
de construção. ⇒ a fatia de long/short tem de escolher **qual das quatro** (§4, `[Q2]`).

### GA-4 · `RF-4` não é "preencher um campo": quem constrói o `IngestRun` é o **coletor**, e ele não sabe o que o escritor persistiu

`IngestRun` é montado no fechamento do ciclo do coletor
(`use_cases/collector_run_mapping.py:87-103` forceOrder, `:117-137` premiumIndex), com `n_written=0`
literal em ambos (`:94`, `:131`). O escritor é **outro processo** (`infra/single_writer_cli.py`), que
consome da fila Redis. Nenhum dos dois vê o número do outro.

**Achado que barateia a solução:** `PostgresIngestRecordStore.record_run` **já é upsert por `run_id`**, e
`n_written` já está no `DO UPDATE SET` (`postgres_ingest_record_store.py:106-128`,
`ON CONFLICT (run_id) DO UPDATE SET … n_written = EXCLUDED.n_written`). ⇒ **fechar o run depois não
exige schema novo, método novo, nem tocar `INGEST_HEALTH_RUN_COLUMNS`.** O que falta é o `run_id`
viajar com o lote. Decidido em [`ADR-035`](../adr/ADR-035-contabilidade-de-n-written-o-escritor-fecha-o-run-que-o-coletor-abriu.md).

#### ⛔ Emenda `2026-09-11` (`D10`/`B2`) — **a economia declarada acima NÃO se realizou**, e os dois números que a falsificaram

`[DECISÃO-OWNER: 2026-09-11, escolha entre 3 alternativas apresentadas]` — opção 1. Menu em
[`OPCOES-B1-B4.md`](../context/cinco-metricas-do-core/OPCOES-B1-B4.md) §B2; escolha em
[`DECISOES-OWNER.md`](../context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md) §D10. **Zero código.**

| o que `GA-4` afirmou | veredito | o que a fatia `01` entregou |
|---|---|---|
| *"não exige schema novo"* | ❌ **caiu** | coluna nova `writer_accounted_at`, **TABLE-only** |
| *"não exige método novo"* | ❌ **caiu** | método novo na porta: `credit_written` |
| *"não exige tocar `INGEST_HEALTH_RUN_COLUMNS`"* | ✅ **de pé** | intocada ⇒ `sha256` da projeção canônica (`ADR-008/DoD-2`) byte-idêntico, nenhuma rota muda de forma |

**Os dois números que falsificaram o mecanismo** (detalhe, comandos e universo na emenda de `ADR-035/D2`):

1. o `ON CONFLICT (run_id) DO UPDATE SET` de `_UPSERT_RUN` sobrescreve **15** das **16** colunas de
   `IngestRun` — todas menos a chave do conflito
   `[MEDIDO 2026-09-11: `sed -n '/^_UPSERT_RUN = /,/^"""$/p' postgres_ingest_record_store.py | grep -c '= EXCLUDED\.'` → 15; AST sobre o dataclass → 16]`.
   Entre as 15 estão `window`, `src_sha256`, `weight_used` e `observer_id` — os 4 que um escritor não pode
   inventar ⇒ o `DoD-4` de `ADR-035` é **insatisfazível por aquela porta**;
2. o crédito precisa ser **aditivo**: `WRITER_BATCH_SIZE` default **100** (`single_writer_cli.py:141`)
   contra o run de backfill medido com `n_returned = 40.320` (10.080 por símbolo × 4 símbolos)
   `[MEDIDO 2026-09-11T11:26Z em `md.ingest_run`, `run_id 932c37fc…`]` ⇒ **≥ 404 lotes por run**, e
   `SET n_written = EXCLUDED.n_written` guardaria só o último.

**Por que a leitura falhou, em uma frase:** `GA-4` leu *"`record_run` já é upsert"* como *"já é a porta do
escritor"* — e não é: o upsert é **de registro inteiro e substitutivo**; o escritor precisa de **parcial e
aditivo**. **A decisão de `ADR-035/D2` continua de pé e provada em produção** (571/572 runs de klines e
582 de premiumIndex fechados na janela de 24 h `[MEDIDO 2026-09-11T11:26Z, n=2.006 runs]`); o que caiu foi
o mecanismo escrito. Coluna TABLE-only **não é precedente novo** —
`backend/src/modules/sentimento/domain/ingest_record.py:16-19` já documenta o mesmo split.

### GA-5 · ⛔ `DEF-3` está **misdiagnosticado**: o `extra={}` existe; o que o descarta é o **formatador**

`PRD-007` §8/`DEF-3` e `DIAGNOSTICO.md` §*"Log sem número"* afirmam que `writer_batch_acked` e
`collector_cycle_completed` são emitidos **sem** `extra={}`. **No código em `0f4ee55`, os dois têm
`extra={}` com contador:**

- `single_writer_cli.py:357-360` → `logger.info("writer_batch_acked", extra={"n_accepted": …, "n_rejected": …})`
- `collectors_cli.py:477-480` → `logger.info("collector_cycle_completed", extra={"endpoint": …, "n_published": …})`

`[MEDIDO 2026-09-10: grep -rn 'writer_batch_acked\|collector_cycle_completed' backend/src --include='*.py' -A 3]`

**As duas observações se reconciliam sem nenhuma delas estar errada, e a causa é uma linha:**
`_STABLE_FORMAT: Final[str] = "%(message)s"` (`ingest_health_cli.py:33`), usado por
`build_stdout_handler` (`:56-58`) que `single_writer_cli.main` instala. Um formatador de `%(message)s`
**anexa `extra` ao `LogRecord` e nunca o imprime**. ⇒ `docker logs` mostra a string nua, e o contador
existe, invisível.

**O que isto muda, e é material:** o custo de `DEF-3` tabelado no PRD (*"fase horizontal sem ponto na
tela"*) está precificado contra o trabalho errado. O trabalho real é **trocar o formatador**, não
instrumentar 2 eventos. A decisão de escopo continua sendo do owner/`/tech-lead`; esta SPEC apenas
recusa carregar adiante um número que mediu falso. Ver `[Q5]` (§3.5) e `ADR-035/D3`.

### GA-6 · O contador que `RF-4` pede **já é calculado** — no escritor, e é descartado

`single_writer_cli.py:355-356` computa `n_accepted = sum(1 for outcome in outcomes if outcome is
WriteOutcome.ACCEPTED)` a cada lote. É exatamente *"linhas efetivamente persistidas"*. Hoje ele vive
~4 linhas e morre num `extra` que o formatador não imprime (`GA-5`). `RF-4` é, portanto, **um problema
de roteamento de um número existente**, não de medição nova.

### GA-7 · ⛔ Achado tardio, e ele derrubou uma decisão desta própria SPEC: **CVD não exige aggTrades**

Acrescentado em 2026-09-10, **depois** de `ADR-036` ter sido escrita, a partir de
[`ACHADO-KLINES-CVD.md`](../context/cinco-metricas-do-core/handoff/ACHADO-KLINES-CVD.md).

`/fapi/v1/klines` devolve **`takerBuyBaseVol` no índice `[9]`**, ao lado de `volume` no `[5]` ⇒
`delta_cvd = 2 · takerBuyBaseVol − volume`, **idêntica** a `2·bv − v`
`[MEDIDO 2026-09-10, BTCUSDT 1m: v=29,757 · takerBuy=2,626 · delta=−24,505]`. E o cruzamento mostra que
é o mesmo número: `takerBuy` × `bv` bate **exato em 116 de 120** buckets, p95 = 0,00 bp, máx 38,52 bp
`[MEDIDO 2026-09-10, BTCUSDT, 2 h, n=120 buckets comuns]`.

⇒ A justificativa original de `ADR-036/D5` (*"a única métrica cuja origem está vetada"*) era **falsa**.
`D5` foi reescrita, e com ela a ordem das fatias (§3.1), o orçamento de cota (§6.3) e a lacuna de
história profunda (§9.2).

**O que este achado diz sobre o método, e é a parte que fica:** a premissa falsa sobreviveu à redação
de `ADR-036/D1` — a regra que ela viola — porque ninguém tinha **lido o payload da origem**. Bastavam
dois índices de um array. `ADR-036`/DoD-6 passa a exigir que toda decisão de fonte cite o payload por
índice/campo, medido.

⚠️ **O que o número NÃO é:** é prova de **concordância**, não de correção, sobre **1 símbolo, 2 h,
n=120**. Ele **não refuta** a cauda de agosto (`docs/medicao-coinalyze.md` §4: p99 29 bp, máx
1.956 bp), que compara contra o **dump canônico S3** — outro corpus, outra referência. As duas podem
estar certas.

---

## 2. O que esta SPEC fixa

1. A **identidade de série** de cada uma das 5 métricas (§4) — `[Q2]`.
2. A **fonte** de cada métrica e o custo declarado de depender de terceiro (`ADR-036`) — `[Q4]`.
3. O **contrato de cota** que todo coletor de terceiro obedece (§6) — entrada de `[Q1]`.
4. A **semântica e o mecanismo de `n_written`** (`ADR-035`) — `[Q5]`.
5. O **DoD-VERTICAL instanciado** por fatia, incluindo o que muda quando a série é de `5m` (§8).
6. A **ordem das fatias 2–5** e o critério que a produz (§3.1) — `[Q1]`.

**O que ela NÃO fixa:** os `NG-1..NG-10` de `PRD-007` §12 continuam fora, e a §9 desta SPEC nomeia
três coisas a mais que ficam fora com dono.

---

## 3. As sete perguntas em aberto, respondidas

### 3.1 `[Q1]` — Ordem das fatias 2–5, e o critério

**Critério, em ordem lexicográfica de desempate:** (i) **painel já existe** na rota `/symbol` ⇒ `DoD-3`
não paga wiring novo (é o elo que quebrou em `pagina-de-grafico-s2` fase 02); (ii) **identidade de série
já existe** no catálogo (`GA-1`) ⇒ não paga negociação de nome nem `verified_by` novo; (iii) **custo
conhecido** ⇒ fatia de custo desconhecido nunca vem antes de fatia de custo conhecido; (iv) **cota de
terceiro consumida**.

> ⛔ **Esta ordem foi REVISADA em 2026-09-10**, depois que `ADR-036/D5` caiu por premissa falsa
> (`GA-7`). A versão anterior era `volume → OI → CVD → long/short → liquidações`, e um dos argumentos
> que a sustentava — *"a fase `05` reusa o coletor Coinalyze construído na `03`"* — **deixou de
> existir** quando o CVD saiu da Coinalyze. Aplicar o mesmo critério aos números novos troca `02` com
> `03`. A ordem antiga está retirada, não corrigida em silêncio.

| ordem | fatia | painel existe? | identidade existe? | capacidade NOVA que a fase introduz | cota Coinalyze |
|---|---|---|---|---|---|
| **01** | **volume** (`D1.b`, owner) | sim — sub-eixo de `PricePane` (§3.6) | **não** (`GA-1`) | cliente REST de `/fapi/v1/klines` + `ADR-035` | 0 |
| **02** | **CVD** | **sim** (`CvdPane`) | **sim** (`cvd_source`) | **nenhuma** — mesmo cliente, mesma resposta, índice `[9]` | 0 |
| **03** | **open interest** | **sim** (`OiPane`) | **sim** (`sum_open_interest`) | cliente de `/futures/data/` + 1ª série de `5m` (`RN-S1`) | 0 |
| **04** | **long/short ratio** | não — painel novo | não (`GA-3`: escolher 1 de 4) | 1º painel novo | 0 |
| **05** | **liquidações** | não — painel novo | não | **única** integração de terceiro | `N` u/ciclo |

**A propriedade que a ordem nova tem e a antiga não tinha: cada fase introduz exatamente UMA
capacidade nova**, e a `02` não introduz nenhuma — é a fatia de custo marginal, e ela prova que uma
segunda identidade pode pegar carona num coletor existente, que é a capacidade de que `04` depende.

**Por que `02` é CVD:** porque, depois de `ADR-036/D5`, ele é **de graça**. `takerBuyBaseVol` vem no
índice `[9]` da **mesma resposta** de `/fapi/v1/klines` cujo índice `[5]` a fase `01` já lê para o
volume. A fatia é *"reusar o cliente da `01`, ler mais um campo, criar mais uma identidade"* — nenhuma
integração nova, nenhum terceiro, nenhuma cota. Pelo critério (iii), custo marginal vem antes de custo
novo.

**Por que `03` é open interest:** é a primeira fase que introduz o cliente de `/futures/data/` **e** a
primeira série de `5m` na grade de `1m` (`GA-2`, `RN-S1`) — duas capacidades novas, mas ambas com
painel e identidade já existentes, então nenhuma delas paga wiring de tela.

**Por que long/short é `04`:** é o único que não tem nem painel nem identidade e ainda precisa do
`design_gate`; e ele **reusa** o cliente de `/futures/data/` que a `03` construiu. Colocá-lo antes de
`02`/`03` atrasaria as métricas que completam os 3 painéis que **já estão na tela dizendo
`SEM_PONTO`** — e o objetivo declarado do owner é a tela deixar de mentir por omissão.
**Ao fim de `03`, `/symbol` fica 3/3 painéis com ponto, contra 0/3 hoje**
`[MEDIDO 2026-09-10, PRD-007 §1.4]`.

**Por que liquidações é `05`:** é a **única** integração de terceiro que resta (`ADR-036/D5` revisada
tirou o CVD da Coinalyze), e `ADR-036/D4` a promove a fonte primária de M4, o que retira o diagnóstico
do `!forceOrder@arr` do caminho crítico. `DEF-2` deixa de ser risco de sequenciamento: `DoD-1` da fase
`05` é satisfazível **mesmo que o socket nunca seja consertado**.

⚠️ **O argumento que esta fase PERDEU, e é honesto dizer:** na versão anterior, a `05` reusava o
coletor Coinalyze construído na `03`. Com o CVD saindo da Coinalyze, **a `05` volta a ser uma
integração nova, do zero** — ela ficou mais cara, não mais barata. Continua em último porque é a
única com terceiro e porque `ADR-036/D4` já lhe deu caminho de saída; mas o `/tech-lead` deve
dimensioná-la como integração completa, não como "um endpoint a mais".

⚠️ **Esta ordem não é neutra em relação a `DEF-2`, e o custo é declarado:** liquidações em último
significa que o coletor morto fica morto por mais quatro fases. `PRD-007`/`DEF-2` já aceitou o
princípio; o que esta SPEC acrescenta é o prazo e um caminho que não depende do conserto.

### 3.2 `[Q2]` — Nome canônico e grade nativa: ver §4 (tabela normativa)

### 3.3 `[Q3]` — O diagnóstico do forceOrder deve ser um spike antes de `[Q1]`? **NÃO.**

E o motivo não é *"é barato"* — é que **a ordenação de §3.1 remove a dependência**. `[Q3]` pressupõe que
a ordenação precisa do custo da fatia de liquidações. Com liquidações em **último** e com uma fonte
alternativa declarada (`ADR-036/D4`), o custo desconhecido deixa de ser entrada da ordenação: ele é
**contido** dentro da última fatia, com caminho de saída próprio.
⚠️ **A resposta continua NÃO, mas o argumento enfraqueceu:** na versão anterior a fonte alternativa já
estaria **de pé desde `03`**; depois de `GA-7` ela é construída na própria `05`. O que sustenta o NÃO
agora é só a posição (nada depende da `05`) e o caminho de saída — não mais a infraestrutura pronta.

**O que muda em relação ao que `ACHADO-FORCEORDER.md` recomendou:** aquele documento recomenda que a
fatia de liquidações **herde `T-07.11`** (detector de liveness por contiguidade + heartbeat, hoje
`status = "blocked"` em `docs/context/plataforma-dados/tasks.toml:1161`). Esta SPEC **mantém** a
recomendação e a torna requisito da fase `05` (§8.6) — mas o alvo dela muda: `T-07.11` passa a medir a
**fonte primária REST**, e não o socket que `ADR-036/D4` tirou do caminho crítico.

⚠️ **Custo aceito, declarado:** o coletor forceOrder segue gravando `REJECTED` sem motivo, e agora sem
data de conserto dentro desta feature (`ADR-036/D4` nomeia dono e gatilho). `PRD-007`/`DEF-2` decidiu
consertá-lo dentro da fatia; **esta SPEC diverge disso** e a divergência está na ADR, com o custo.

### 3.4 `[Q4]` — Coinalyze × Binance por métrica: decidido em `ADR-036`

Resumo executável (o argumento medido está na ADR):

| métrica | fonte decidida | por quê | cota Coinalyze |
|---|---|---|---|
| **volume** | **Binance** `/fapi/v1/klines` | `D1.b` (owner). É a origem | 0 |
| **open interest** | **Binance** `/futures/data/openInterestHist` | origem; a grade `5m` do catálogo (`GA-2`) é o teto da própria Binance | 0 |
| **long/short** | **Binance** `/futures/data/…` | origem — e o handoff já `[INFERRED]` que o teto de `5min` da Coinalyze **é** o da Binance (`MEDICAO` §2.2) | 0 |
| **liquidações** | **Coinalyze** `liquidation-history` (**primária**); `!forceOrder@arr` permanece como está, **fora do caminho crítico** | a Binance **não tem REST de histórico** de liquidação ⇒ com WebSocket, queda de coletor é **buraco permanente**; com REST de janela grátis, é **atraso recuperável**. Ver abaixo | `N` u/ciclo |
| **CVD** | **Binance** `/fapi/v1/klines`, `delta = 2·takerBuyBaseVol − volume` | **mesma resposta** que o volume: índice `[9]` ao lado do `[5]`. `[P-infra]` **nunca** o vetou — a premissa contrária era falsa (`GA-7`) | 0 |

**A regra, em uma linha (`ADR-036/D1`): a origem por padrão; o terceiro só onde a origem é vetada, não
existe, ou perde dado de forma irrecuperável.** Depois de `GA-7`, isso deixa a exposição a terceiro em
**1 endpoint e 1 métrica** — **2 u/min a `N = 10` na cadência adotada, 5% do teto medido** (§6.3), e
**4 das 5 métricas continuam de pé se a Coinalyze cair**.

**A terceira cláusula da regra é nova nesta rodada e ela decide M4** — e o argumento **não é sobre
cota**: como o custo de uma requisição independe da janela pedida (§6.1), um coletor REST que ficou
3 h fora **recupera tudo em UMA requisição por símbolo-endpoint**. Contraste medido: o
`!forceOrder@arr` ficou **~46 h** mudo e, sendo WebSocket, aquele dado está **perdido para sempre**
`[DOC: ACHADO-FORCEORDER.md]`. ⇒ fonte REST de janela grátis transforma **queda de coletor em atraso
recuperável** em vez de buraco permanente. **Limite declarado:** a recuperação para na retenção da
origem — horas e poucos dias, **não** semanas (§9.2).

**E a granularidade de evento não é perdida onde importa:** a `15min .. 4h`, liquidação agregada em
bucket de 1 min é o mesmo argumento que já vale para o CVD. Tick de liquidação individual está abaixo
da unidade de decisão da operação declarada.

**O CVD de bucket de 1 min SERVE — e o que decide é o timeframe, não a fonte.**
`[PREMISSA-OWNER: 2026-09-10]` *"Nossa operações serão no time de 15min a 4h."* Um candle de 15 min
contém **15** buckets de 1 min; um de 4 h contém **240**. A micro-estrutura intra-minuto que o CVD de
bucket perde está abaixo da menor unidade de decisão da operação. ⇒ **não** há escalonamento ao
`quant-architect` por granularidade. Isso valia quando a fonte era a Coinalyze e continua valendo
agora que é a Binance: o que muda é **de onde vem**, não **o que é**.

**Manter a Coinalyze como segunda testemunha do CVD: recusado** (`ADR-036/D5.a`). Uma testemunha que
concorda **exato em 116 de 120** buckets não é independente — não informa sobre correção, só sobre
concordância. **Falsificador:** se a divergência de `takerBuy` sair da cauda medida sobre `n ≥ 1.000`
buckets e `≥ 4` símbolos, a independência volta a valer e `D5.a` reabre.

⚠️ **O escalonamento por FIDELIDADE mudou de alvo** (§9.1). Enquanto o CVD vinha da Coinalyze, o volume
da Binance era **oráculo grátis** sobre ela no mesmo bucket. Tirando o CVD, **a única superfície
Coinalyze que resta é M4 — e ela não tem oráculo nenhum**: a Binance não tem REST de liquidação, e o
`!forceOrder@arr`, que seria a única comparação, é o que `ADR-036/D4` tirou do caminho crítico. ⇒ o
escalonamento vai para a **fase `05`**, sobre `liquidation-history`, e não mais para a fase de CVD
sobre o `bv`. `RS-5` (rótulo de reconstrução com `published_error`) continua valendo para qualquer
série Coinalyze que chegue à tela.

### 3.5 `[Q5]` — Semântica de `n_written`, e o `extra={}`

**`n_written` = linhas efetivamente PERSISTIDAS pelo escritor.** Não é "itens publicados pelo coletor".

**O argumento é de falsificabilidade, não de gosto:** `n_returned` **já** carrega "publicados"
(`collector_run_mapping.py:91-93` faz `n_expected = n_returned = n_published`). Definir `n_written` como
a mesma coisa tornaria `DoD-4` **tautológico** — ele passaria com `md.series` vazia, que é precisamente
o estado de hoje (`n_returned` somando **2.616.300** com **0** linhas do CORE em `md.series`
`[DOC: DIAGNOSTICO.md]`). Um gate que passa no estado que ele existe para reprovar não é gate.

**Mecanismo:** `ADR-035` — o `run_id` viaja com o lote e o **escritor fecha o run que o coletor abriu**,
pelo upsert que já existe (`GA-4`).

**Sobre o `extra={}`:** a pergunta do PRD (*"emitir o contador em `extra={}` custa ~1 linha"*) está
respondida por `GA-5`/`GA-6`: **o `extra={}` já existe e o contador já é calculado**; o que os apaga é
`_STABLE_FORMAT = "%(message)s"`. A decisão está em `ADR-035/D3`: **dentro da fatia 1, e o item é o
formatador**, não instrumentação. Custo: uma constante e o teste que pina o formato. Isso **não**
reabre `NG-3` (programa de observabilidade por log) nem `NG-5` (renomear os 4 eventos PT) — os eventos
e chaves **novos** nascem em inglês, prospectivamente (`CLAUDE.md`, linha 10 da tabela de fronteira).

### 3.6 `[Q6]` — Volume ganha painel próprio ou entra no painel *Preço*? **Sub-eixo do `PricePane`.**

**Decisão desta SPEC, sujeita ao `design_gate`.** Motivos: (i) `INF-2` do PRD mantém `DoD-3` sobre a
rota `/symbol` existente, e um painel novo multiplicaria o wiring que a fase 04 de `pagina-de-grafico-s2`
mostrou frágil; (ii) volume sob o eixo de preço é a convenção universal de gráfico de mercado e não
custa decisão de layout nova; (iii) `PricePane` já existe (`SymbolClient.tsx`, 3 painéis
`[DOC: PRD-007 §1.4]`) e é o eixo em que os outros dois se penduram.

⚠️ **`CLAUDE.md` §*"Design — autonomia delegada, com gate de validação"*: nenhuma decisão de design vale
antes de o `ux-ui-mastery` concordar.** A decisão acima é do `/architect` sobre **estrutura**; a forma
(altura do sub-eixo, escala, cor, comportamento em `SEM_PONTO`) é do `ui-designer` **com veredito do
gate**. Idem para os **dois painéis novos** das fatias `04` e `05`. Isso é DoD de fase (§8.5, §8.6).

### 3.7 `[Q7]` — Quantos dias de backfill a fatia 1 precisa, sem violar `[P-seed]`

**A resposta que dissolve a pergunta: backfill lido da origem NÃO é dado de teste.** `[P-seed]` proíbe
**semear** dado sintético no Postgres compartilhado. Uma leitura histórica de `/fapi/v1/klines` é dado
real de produção, escrito pelo caminho de produção. ⇒ `DoD-3` obtém ponto legítimo **sem** tocar em
`[P-seed]`, e a armadilha que `PRD-007` §6 nomeia deixa de ter tentação.

**O número, ancorado no timeframe do owner (`15min .. 4h`):**

- `/fapi/v1/klines` devolve no máximo **1500 barras por chamada** `[DOC: documentação pública da Binance; NÃO MEDIDO neste repositório]`.
- **7 dias** de grade de 1 min = `7 × 1440` = **10.080 barras** = **7 chamadas**. Isso dá **672** candles de 15 min e **42** candles de 4 h — o suficiente para a menor e a maior unidade de operação declarada terem forma na tela.
- **Decisão: `backfill_dias = 7` para a fatia 1**, uma vez, no boot do coletor. `[INFERRED: 7 dias é o menor inteiro que dá ≥ 40 candles na MAIOR unidade de operação declarada (4h); com 1 dia seriam 6 candles de 4h, que não é gráfico]`.
- **Falsificador:** se o owner abrir `/symbol` no timeframe de 4 h e disser que a série é curta demais para decidir, `backfill_dias` sobe — e o custo de subir é **linear e barato** (uma chamada a mais por 1500 barras, contra um teto de peso de IP que esta feature não chega perto de tocar, §6.2).

**Limiar de `DoD-3`, e ele é normativo (`RN-S2`):** o assert é **`N ≥ 30` pontos distintos** no painel,
não `N > 0`. Um ponto único não distingue *"o cano funcionou"* de *"caiu um ponto por acaso"*, e o
`D2` do owner existe para acabar com sinal indistinguível. Para série de `5m` servida na grade de
1 min (`GA-2`), *distintos* significa **valores distintos por instante de barra nativa**, não linhas
repetidas pela escada (§8.2).

---

## 4. Identidade de série por métrica — a tabela normativa (`[Q2]`)

`SeriesKey` tem **15 termos** e `series_key_id()` é o `sha256` da projeção canônica: **dois `SeriesKey`
que diferem em qualquer termo — inclusive `verified_by` — são séries diferentes**
(`series_key.py:226-234`). Portanto **toda linha nova desta tabela exige um teste nomeado**, e o nome
desse teste entra na identidade. Isso é DoD, não observação.

| # | métrica | `metric` | `provider` | `interval` / `native_grid` | `nature` | `reduction` | `denom` | estado | força |
|---|---|---|---|---|---|---|---|---|---|
| M1 | volume | **`klines_volume`** | `binance` | `1m` / `1min` | `FLOW` | `SUM` | `base` | **criar** | decisão desta SPEC |
| M2 | open interest | `sum_open_interest` | `binance` | `5m` / `5min` | `STOCK` | (o do catálogo) | (o do catálogo) | **reusar** | `[DOC: open_interest_catalog.py:53-72,110-115]` |
| M3 | long/short | **`count_long_short_ratio`** | `binance` | `5m` / `5min` | `RATIO` | (a definir na fase 04) | — | **criar** | decisão desta SPEC, nome vindo de `SPEC-001 §3.1` |
| M4 | liquidações | **`sum_liquidation`**, `cohort ∈ {long, short}` | `coinalyze` | `1m` / `1min` | `FLOW` | `SUM` | `quote` | **criar** | decisão desta SPEC (`ADR-036/D4`) |
| M5 | CVD | `cvd_source` | **`binance`** | `1m` / `1min` | `FLOW` | `SUM` | `base` | **entrada nova, `metric` existente** | `ADR-036/D5` revisada (`GA-7`) |

### 4.1 M1 — por que `klines_volume` e não `sum_traded_volume`

`sum_…` neste repositório é a **transcrição de um nome de campo da Binance** (`sumOpenInterest`,
`sumTakerLongShortVolRatio`, nos endpoints `/futures/data/`). `/fapi/v1/klines` **não tem** campo com
esse prefixo; usá-lo inventaria uma proveniência. `klines_volume` segue a forma do irmão que já vive no
mesmo módulo (`klines_last` = `<endpoint>_<campo/redução>`), não colide com `FORBIDDEN_METRIC_NAMES`, e
deixa o `denom` (`base` vs `quote`) para o termo que existe **exatamente** para isso.

**Alternativa recusada:** reusar `klines_last` com outro `quantity_field`. Recusada porque
`quantity_field` é *"which `aggTrade` quantity the series is built from"* (`series_key.py:138`) e
`klines` não deriva de `aggTrade` — o valor correto ali é `NA` para as duas séries, então o termo não as
distingue. Distinguir por `metric` é a leitura que o próprio módulo já faz.

**`interval="1m"`, e a razão é dupla:** (i) é a grade que `/api/v1/series-history` serve nativamente
(`ADR-034/D6`), então M1 não paga a escada de `GA-2`; (ii) a 1 min o front pode compor qualquer unidade
de `15min .. 4h`, enquanto o inverso é impossível. **Custo declarado:** M1 fica com grade **diferente**
do seu vizinho de painel `klines_last` (`5m`) — os dois convivem porque a rota já serve tudo na grade de
1 min, mas isso significa que **preço é escada e volume não** no mesmo painel, e o `design_gate` tem de
ver isso antes de a fase 01 fechar (§8.2).

### 4.2 M3 — qual das quatro, e o custo de escolher

**`count_long_short_ratio`** (razão de contas long/short globais) — é o que a expressão *"long short
ration"* nomeia em uso comum, e é a que a Coinalyze espelha no campo `r` (`MEDICAO` §2).

⚠️ **Custo medido e declarado:** três das quatro séries têm autocorrelação lag-1 de **0,99+**, e só
`sum_taker_long_short_vol_ratio` tem **0,0955** `[DOC: series_key.py:60-62, CA-F2-3]`. Uma série com
autocorrelação 0,99+ **desenha uma reta**. ⇒ **falsificador da escolha:** se, na fase `04`, o painel de
`count_long_short_ratio` for uma linha visualmente plana no timeframe de operação, a fatia acrescenta
`sum_taker_long_short_vol_ratio` como segunda série do mesmo painel. É reversível dentro da fase: é
outra entrada de catálogo e outra chamada, não outro cano.

### 4.3 M4 — `cohort` carrega o lado, e o que ainda não está medido

`cohort` já é termo de identidade (`cohort="all"` nas séries existentes). Liquidação tem **duas pernas**
e as duas fontes as separam: `liquidation-history` devolve `l` e `s` (`MEDICAO` §2) e `!forceOrder@arr`
traz o lado na ordem. ⇒ **duas linhas de catálogo por instrumento**, `cohort="long"` e `cohort="short"`.
Somá-las numa só apagaria o sinal que a métrica existe para dar.

`[INFERRED: denom="quote" (nocional em USD) — é o que "l"/"s" da Coinalyze publicam, e é a unidade em
que as duas fontes podem ser comparadas; a perna da Binance traz preço e quantidade, então o nocional é
derivável, o inverso não é]`. **Não medido:** a unidade exata de `l`/`s`. **Falsificador barato, e ele
tem de rodar ANTES de a identidade ser gravada:** a fase `05` compara uma janela das duas fontes; se as
ordens de grandeza não baterem, `denom` muda — e mudar **depois** re-identifica a série
(`series_key.py:226`), o que é migração, não correção.

### 4.4 M5 — o `metric` existe, a entrada não: `cvd_source` com `provider="binance"`

`cvd_source_catalog.py` é literalmente um **catálogo de FONTES de CVD**: hoje tem
`build_aggtrade_q_entry` (`provider="binance"`, `quantity_field=Q`), `build_aggtrade_nq_entry`
(`NQ`) e `build_coinalyze_bv_entry` (`provider="coinalyze"`, `NA`)
`[MEDIDO 2026-09-10: cvd_source_catalog.py:181,214,244]`. **Nenhuma delas é a de `klines`.** ⇒ M5
acrescenta uma **quarta fonte** ao catálogo que já existe para isso: `metric=CVD_SOURCE_METRIC`,
`provider="binance"`, `interval="1m"`, `quantity_field=NA` (não deriva de `aggTrade`).

⚠️ **Decisão de fase, com falsificador — `reconstructed_from`:** `build_coinalyze_bv_entry` declara
`reconstructed_from="aggtrade_q"`, e `SeriesCatalogEntry.__post_init__` então **exige**
`published_error` (`D6.9`). A entrada de `klines` vem da **origem**, no bucket que a origem publica —
não é reconstrução de `aggtrade_q`, é outra granularidade da mesma verdade.
`[INFERRED: reconstructed_from=None para a entrada de klines, porque o campo nomeia a série que foi
RECONSTRUÍDA, e nada aqui foi reconstruído — o dado é lido]`.
**Falsificador, e ele é barato:** comparar `2·takerBuy − volume` do `klines` contra `cvd_delta` do
`aggtrade_q` sobre uma janela com os dois presentes. Se divergirem além do que a agregação de bucket
explica, então a entrada **é** reconstrução e precisa de `published_error` como as outras — e gravar a
identidade sem ele **depois** é migração, não correção (`series_key.py:226`).

### 4.5 O que reusar significa, exatamente

Para **M2** (`sum_open_interest`) a entrada de catálogo já existe em código. **Reusar não é "não fazer
nada":** a entrada tem de estar **registrada no `SeriesCatalog` servido** por `/api/v1/series-catalog`
para `/api/v1/series-history` a encontrar (`series_history.py` → `catalog.entry_for_id`, `422`
`UnknownSeriesKeyIdError` se não estiver). Isso é `RF-2` do PRD e é elo da fatia, não pressuposto.

---

## 5. Limites de camada — o que cada elo pode e não pode fazer

Vale para **todas** as fatias. Nenhum item aqui é novo: é a arquitetura já em vigor, escrita para que
uma fase não a atravesse por conveniência.

| elo | pode | **não pode** |
|---|---|---|
| **coletor** (`infra/`) | falar HTTP/WS com a fonte, publicar na fila, abrir e fechar o `IngestRun` | escrever em `md.series` (`RN-6`: escritor único); decidir identidade de série (isso é `domain/`) |
| **`domain/`** | declarar `SeriesKey`/`SeriesCatalogEntry`, converter payload → linha | tocar relógio, socket ou I/O (`backend/pyproject.toml`, contrato "Natureza"; `series_history.py:38-44` cita a restrição) |
| **`use_cases/`** | orquestrar domínio e portas | idem `domain` quanto a relógio/I/O |
| **escritor** (`single_writer_cli.py`) | persistir o lote, contar o que persistiu, **fechar o run** (`ADR-035`) | inventar `IngestRun` que nenhum coletor abriu |
| **API** (`src/api/routes/`) | traduzir recusa tipada em `422`/`500`, ler relógio | conter SQL ou lógica de `as_of` (`series_history.py:1-13`) |
| **`web`** | consumir o contrato publicado | importar do servidor (`web-fullstack.browser-imports-server`, BLOQUEIO) |

**`RS-1` (forma de contrato congelada):** nenhuma das 6 rotas servidas muda de **forma**
(`PRD-007`/`RF-5`). `n_written` muda de **valor**, e o efeito colateral é declarado: `uptime_percent`
de `/collector-status` (`collector_status.py:119-121`, `100 × Σn_written / Σn_expected`) sai de
**`0.0` estrutural** para o valor real. Hoje o `premiumIndex` reporta `uptimePercent 0.0` com
**1.429 runs** na janela e veredito `ACCEPTED` `[MEDIDO 2026-09-10T20:10Z, DOC: PRD-007 §8/DEF-1]`.
⇒ **`RS-1.a`: a fase 01 tem de exibir o valor de `uptimePercent` antes e depois**, porque um número que
sai de 0 para 97 sem aviso parece regressão para quem só vê o painel.

> ⚠️ **Emenda `2026-09-11` (`D12`/`B4`) — a previsão deste parágrafo foi falsificada, e `RS-1.a` não
> muda.** O `uptimePercent` do `premiumIndex` **não** saiu de `0.0` para *"o valor real"*: saiu para
> **`0,36`** `[MEDIDO 2026-09-11T11:26Z, n=1.431 runs na janela de 24 h]`, com **582/582** runs fechados
> tendo escrito linha. A causa é que **numerador e denominador estão em unidades diferentes** —
> `n_expected` é `n_symbols` (900), `n_written` é linha (8). ⇒ a **fórmula** de `uptimePercent` passa a
> ser *% dos runs FECHADOS da janela com `n_written > 0`*, emendada em `ADR-035/D1` (`2026-09-11`), e
> `n_expected` **não muda**. `RS-1.a` continua valendo **sob a fórmula nova**: é ela que a fase exibe
> antes e depois. **Esta SPEC não decide isso** — quem decide é `ADR-035/D1`; aqui é **remissão**, para
> não criar duas verdades sobre a mesma superfície.

**`RS-2` (identidade congelada):** `INGEST_HEALTH_RUN_COLUMNS` — 15 colunas, ordem alimenta o `sha256`
da projeção canônica (`ADR-008/D3`, `ADR-008/DoD-2`) — **não** é tocada. Preencher campo é permitido;
renomear ou reordenar não é esta feature (`NG-6`, `CLAUDE.md` linha 11).

---

## 6. Contrato de cota — normativo para todo coletor de terceiro

### 6.1 O que está medido, e é invariante do desenho

```
custo(requisição) = n_símbolos                      [MEDIDO 2026-09-10, MEDICAO §4.1/§4.2.1]
  — INDEPENDENTE de `interval`, de `from`/`to` e do nº de buckets devolvidos
                                                    [MEDIDO 2026-09-10, MEDICAO §4.2.3-§4.2.5]
teto    = 40 unidades por janela de 60 s            [MEDIDO 2026-09-10, n=41 requisições]
peso    = LINEAR no número de símbolos              [MEDIDO: 40×1 e 10×4 convergem no mesmo teto]
janela  = deslizante; Retry-After observado: 49,1 s · 56,8 s · 59,0 s
sinal   = NENHUM em resposta 200 — sem header de cota; só o próprio 429
```

**A medição que fecha o contrato** `[MEDIDO 2026-09-10, 3ª rodada: 10 símbolos/chamada, janela de 3 h]`:
4 chamadas devolvendo **1.800 buckets cada** (7.200 no total) gastaram **exatamente as mesmas 40
unidades** que 4 chamadas de janela de 5 min — `429` na 5ª, `Retry-After: 56.752`.

⇒ **A cadência de polling paga; a granularidade e a janela são de graça.** `interval=1min` puxado a
cada 5 min devolve os 5 buckets de uma vez, com resolução **idêntica** ao polling de 1 min, por **1/5**
do custo. Isto **supera** o teto de `N ≤ 12` de `MEDICAO` §4.2 — aquele número era artefato de assumir
cadência de 1 min, e a própria seção está marcada como superada na origem.

### 6.2 Requisitos que decorrem, e eles são requisito, não observação

| id | requisito | por quê |
|---|---|---|
| **`RS-3.1`** | O coletor mantém **contador de cota próprio**, no lado dele | a origem não publica cota em `200` (§6.1). Reusar `QuotaBucket`/`QuotaProbe` (`infra/https_quota_probe.py`), não reinventar |
| **`RS-3.2`** | Recuo obedece o **`Retry-After` da resposta**, com piso; **proibido** recuo fixo cego | um recuo fixo de 60 s quando a origem diz 49 s desperdiça ~18% da janela `[MEDIDO: MEDICAO §3]` |
| **`RS-3.3`** | Retentativa é **por (símbolo × endpoint) que falhou**, **nunca do ciclo inteiro** | um ciclo completo custa `N × endpoints` unidades; retentá-lo inteiro dentro da mesma janela estoura a cota por construção |
| **`RS-3.4`** | O bucket **mais novo é PARCIAL** e não pode ser gravado como final | defasagem de 58 s ⇒ o ponto mais novo é o minuto em curso; medido `v = 4,413` contra 10–44 nos vizinhos `[MEDIDO: MEDICAO §5]`. Gravá-lo subestima o volume e **viola a regra anti-lookahead**. Marcar `is_final=false` ou descartar — interage com `T-03.9` (`observer_id`/`available_at`) |
| **`RS-3.5`** | A **cadência de polling é parâmetro de configuração**, não constante em código | é a única variável que paga cota (§6.1/§6.3); gravá-la em código transforma um ajuste de configuração em release |
| **`RS-3.6`** | As requisições de um ciclo são **espalhadas ao longo da cadência**, nunca disparadas em rajada | **média não é pico.** A janela é deslizante de 60 s: um ciclo `N=10` × 4 endpoints disparado de uma vez são **40 unidades instantâneas** — a janela inteira ocupada, e a próxima retentativa toma `429` mesmo com o orçamento médio em 20% |

### 6.3 Orçamento de cota — **FECHADO** `[MEDIDO 2026-09-10]`

Custo médio = `n_endpoints · N ÷ cadência_min`. Depois de `GA-7`, `ADR-036` deixa **1 único endpoint**
na Coinalyze — `liquidation-history`, para M4:

| cadência | `N = 4` (piloto) | `N = 10` (alvo) | `N` máximo a 80% do teto |
|---|---:|---:|---:|
| 1 min | 4 u/min (10%) | 10 u/min (25%) | 32 |
| 2 min | 2 u/min (5%) | 5 u/min (12,5%) | 64 |
| **5 min** (adotada) | **0,8 u/min (2%)** | **2 u/min (5%)** | **160** |

**Cadência adotada: 5 min**, e o que a justifica é o timeframe do owner — a `15min .. 4h`, 5 min dá
**3 atualizações por candle de 15 min** e 48 por candle de 4 h, com resolução de 1 min preservada
(a janela é grátis). O consumo a `N = 10` fica em **5% do teto medido**.

⚠️ **A folga não é convite.** `RS-3.6` (espalhar, não disparar em rajada) continua valendo: a janela é
deslizante de 60 s, e o teto instantâneo não muda porque a média caiu. **Depois desta medição a
restrição não é o teto — é a rajada e a recuperação de lacuna**, que pode pedir muitas requisições de
uma vez.

**Cota da Binance, para as outras 4 métricas:** teto de **2.400 weight/min** por IP, e uma chamada de
1.500 velas de `klines` custa **weight 1** `[MEDIDO 2026-09-10: sequência 31→32→33]`. `N = 10` a cada
5 min não chega perto. O limite de `/futures/data/` (M2, M3) continua **`[NÃO MEDIDO]`** e é item da
fase `03`.

---

## 7. Comportamento de borda — por classe, com o veredito exigido

`PRD-007` §16 marcou *"fora de ordem / duplicado / parcial por métrica"* como `[GAP]` do `/architect`.
Fechado aqui, por classe de fonte em vez de por métrica — o comportamento depende do transporte, não do
significado.

| borda | fonte REST paginada (M1, M2, M3, M5, testemunha de M4) | fonte WebSocket de evento (M4 vivo) |
|---|---|---|
| **bucket parcial** | `RS-3.4`: descartar ou `is_final=false`. Nunca gravar como final | não se aplica — o evento é pontual |
| **duplicado** | idempotente pela identidade: mesma `(series_key_id, symbol, event_time)` ⇒ upsert, nunca segunda linha | mesmo tratamento; reconexão de socket **re-entrega** |
| **fora de ordem** | a grade é do provedor; ordenar na leitura, nunca confiar na ordem do payload | evento pode chegar fora de ordem após reconexão |
| **lacuna** | registrar `IngestGap` (`record_gap` já existe, `postgres_ingest_record_store.py:208`), nunca interpolar | lacuna de socket é **indistinguível de silêncio real** ⇒ é exatamente por isso que M4 tem testemunha (`ADR-036/D4`) |
| **ausência** | `RN-1`: `SEM_PONTO`. **Ausência nunca é zero** — e para `FLOW` isso é erro de tipo, não de UX (`series_key.py`: *"LOCF over it is a type error, never UX"*) | idem |
| **`REJECTED`** | `RF-6`: `api_code` e/ou `notes` **não-nulos**, sempre. Um veredito sem motivo é o `rc=0` de `ADR-012` | idem — é o defeito `DEF-2` |

**`RS-4`:** `core.silent-except` (BLOQUEIO) é a regra que mais morde nesta feature: o caminho de erro do
coletor **produziu** `DEF-2`. Todo `except` no caminho de coleta ou relança com contexto, ou registra
motivo em `notes`/`api_code`. Nenhum passa mudo.

**`RS-5`:** toda série de **terceiro ou de reconstrução** que chega à tela é rotulada como tal, com o
`published_error` que o catálogo já obriga a existir quando `reconstructed_from` está preenchido
(`cvd_source_catalog.py:271-277`). Depois de `GA-7` isso alcança **M4** (única série de terceiro), e
alcança **M5** só se o falsificador de §4.4 mostrar que a entrada de `klines` é reconstrução. O
operador não pode ler dado de terceiro sem saber que é de terceiro.

---

## 8. O DoD-VERTICAL instanciado

### 8.1 O que vale para as 5, sem exceção (`D2`, owner — não reaberto)

`DoD-1` (linha em `md.series`) · `DoD-2` (`/api/v1/series-history` com `n_points > 0`) · `DoD-3`
(Playwright contra o app real: pontos no DOM e **não** `SEM_PONTO`) · `DoD-4` (`n_written > 0` no run).
**Conjunção. Qualquer item em 0 reprova** (`RN-3`).

### 8.2 As duas emendas que o Gap Analysis obriga

- **`RN-S1` (de `GA-2`) — série de `5m` na grade de `1m`:** para M2 e M3, `DoD-3` conta **barras nativas
  distintas**, não linhas da escada. O comando do DoD **nomeia o divisor**: `pontos_no_DOM / 5` para
  série de `5m`. Sem isso, um painel com 1 barra real e 5 linhas repetidas "passa" com `N=5`.
- **`RN-S2` (de `[Q7]`) — o limiar é `N ≥ 30` pontos distintos**, não `N > 0`. `N > 0` não distingue cano
  funcionando de ponto por acaso.

### 8.3 Fase `01` · volume — itens além do DoD comum

`RF-4`/`ADR-035` (o escritor fecha o run) · `ADR-035/D3` (formatador que imprime `extra`) ·
`RS-1.a` (`uptimePercent` antes/depois) · backfill de **7 dias** (`[Q7]`) · identidade `klines_volume`
com teste nomeado em `verified_by` (§4) · `design_gate` sobre o sub-eixo de volume (`[Q6]`).

### 8.4 Fase `02` · CVD — itens além do DoD comum

**Nenhuma capacidade nova**: reusa o cliente de `/fapi/v1/klines` da fase `01` e lê o índice `[9]` da
**mesma resposta** que já dá o `[5]`. Itens próprios: quarta entrada do `cvd_source_catalog` com
`provider="binance"` e teste nomeado em `verified_by` (§4.4) · a decisão de `reconstructed_from` **com
o falsificador rodado antes de gravar a identidade** (§4.4) · invariante `takerBuy ≤ volume` testada.

⚠️ **A armadilha desta fase é o que ela NÃO deve fazer:** por ser marginal, é tentador entregá-la
dentro da `01`. **`D1` (owner) diz que uma fase é uma métrica** — e o DoD-VERTICAL é por métrica. Duas
métricas numa fase reintroduz exatamente o acoplamento que a feature existe para desfazer.

### 8.5 Fase `03` · open interest — itens além do DoD comum

Primeira série de `5m` na grade de `1m` ⇒ **`RN-S1` com o divisor nomeado no comando** (§8.2) ·
primeiro cliente de `/futures/data/` ⇒ **medir o limite real**, hoje `[NÃO MEDIDO]` (§6.3) · declarar a
profundidade: `/futures/data/*` **corta em ~30 dias** (`startTime` de −60 d → **HTTP 400**)
`[MEDIDO 2026-09-10]`.

### 8.6 Fase `04` · long/short — itens além do DoD comum

Painel **novo** ⇒ `ui-designer` + veredito do `ux-ui-mastery` **antes** de a fase fechar
(`CLAUDE.md` §Design) · reusa o cliente de `/futures/data/` da fase `03` · `RN-S1` (série de `5m`) · o
falsificador de §4.2 (autocorrelação 0,99+) · testar o `[INFERRED]` de que o teto de `5min` é da
Binance, **antes** de gravar a identidade.

### 8.7 Fase `05` · liquidações — itens além do DoD comum

**A única integração de terceiro da feature, e ela é do zero** — `GA-7` tirou o CVD da Coinalyze, então
esta fase **não** herda coletor nenhum. Paga `RS-3.1..RS-3.7` inteiros: contador de cota próprio
(`RS-3.1`), recuo por `Retry-After` (`RS-3.2`), retentativa por símbolo-endpoint (`RS-3.3`), bucket
parcial não-final (`RS-3.4`), cadência em configuração (`RS-3.5`), requisições espalhadas (`RS-3.6`),
símbolo pedido e não devolvido vira `IngestGap` (`RS-3.7`) — tudo provado por teste.

Mais: painel **novo** (mesmo gate de design) · duas coortes (`long`/`short`, §4.3) e o falsificador de
`denom` rodado **antes** de gravar a identidade · `RS-5` (rótulo de reconstrução + `published_error`) ·
**liveness por contiguidade e heartbeat, nunca taxa** — herda `T-07.11`
(`docs/context/plataforma-dados/tasks.toml:1161`, hoje `blocked`), conforme `ACHADO-FORCEORDER.md`,
agora medindo a **fonte primária REST** · `RF-6` (motivo do `REJECTED`) aplicado ao coletor que roda ·
**escalonamento ao `quant-architect` por fidelidade** (§9.1) — é a única série de terceiro **sem
oráculo**.

⚠️ **O que esta fase NÃO faz, e é mudança em relação a `PRD-007`/`DEF-2`:** ela **não** conserta o
`!forceOrder@arr`. `ADR-036/D4` o tira do caminho crítico; ele continua exatamente como está — gravando
`REJECTED` — e sai do escopo desta feature com dono e gatilho declarados na ADR. **O custo aceito:** um
coletor morto permanece de pé, consumindo conexão, até alguém o desligar ou consertar. **O que se ganha:**
a métrica M4 chega na tela sem depender de um diagnóstico de custo desconhecido, que é a razão de
`DEF-2` ter sido classificado como risco de sequenciamento.

### 8.7 O que reprova qualquer fase, sempre

`[P-seed]` violado (dado sintético no Postgres compartilhado) · `DoD-3` contra mock em vez do app real ·
assert só de status HTTP sem dado no DOM · qualquer `[[rules.own]]`, alvo de `make` ou allowlist **de
idioma** (`RN-4`, `ADR-011/D1.10`) · ausência renderizada como zero (`RN-1`).

---

## 9. O que esta SPEC NÃO decide — com dono e gatilho

### 9.1 Fidelidade da Coinalyze — **escala ao `quant-architect` na fase `05`**, e o alvo mudou

> ⚠️ **Revisado por `GA-7`.** A versão anterior escalava a fidelidade do **`bv`** na fase de CVD. Com o
> CVD vindo da origem, ninguém depende mais do `bv` — mas a mudança **piora** a posição de M4, e é isso
> que fica registrado.

**O que se perdeu:** enquanto o CVD vinha da Coinalyze, o volume da Binance servia de **oráculo grátis**
sobre ela, no mesmo bucket, continuamente. Tirando o CVD, **a única superfície Coinalyze é M4 — e ela
não tem oráculo**: a Binance não tem REST de liquidação, e o `!forceOrder@arr` é justamente o que
`ADR-036/D4` tirou do caminho crítico. ⇒ o escalonamento vai para a **fase `05`**, sobre
`liquidation-history`.

**Duas questões abertas que ele recebe, ambas não diagnosticadas:**

1. A cauda contra o dump canônico — p99 = 29 bp, máx = 1.956 bp `[DOC: docs/medicao-coinalyze.md §4]`.
2. **Achado novo e estranho:** o cruzamento de 2026-09-10 mostra que `volume` (`v` × `[5]`) diverge
   **mais** que `takerBuy` (`bv` × `[9]`) — máx 566 bp e 104/120 exatos, contra máx 38,52 bp e 116/120
   `[MEDIDO 2026-09-10, n=120, 1 símbolo]`. Um bucket que concorda num campo deveria concordar no
   outro. **`[NÃO SEI]` a causa** — a hipótese barata é alinhamento de bucket, e ela **não** foi
   testada. Deixa de ser risco do CORE (não usamos nem `v` nem `bv`) e vira sinal de que o alinhamento
   da Coinalyze merece diagnóstico **antes** de M4 depender dela.

**Não bloqueia** a fase: `RS-5` obriga o rótulo na tela. O escalonamento decide se o erro publicado
precisa ser atualizado, e se `liquidation-history` herda a mesma suspeita de alinhamento.

### 9.2 História profunda — **fechada para 3 séries, aberta para 2, e a assimetria é o achado**

`GA-7` fechou o que esta seção declarava sem fonte. As profundidades **não são iguais**, e isso é
entrada de desenho para o `backtest`, não descoberta:

| série | fonte | profundidade | força |
|---|---|---|---|
| preço, **volume (M1)**, **CVD (M5)** | Binance `/fapi/v1/klines` | **desde 2019-09-08** (~7 anos), weight 1 por 1.500 velas | `[MEDIDO 2026-09-10]` |
| **OI (M2)**, **long/short (M3)** | Binance `/futures/data/*` | **~30 dias** — `startTime` de −60 d devolve **HTTP 400** | `[MEDIDO 2026-09-10]` |
| **liquidações (M4)** | Coinalyze `liquidation-history` | ~1,5 dia a `1min`, ~7 dias a `5min` (teto por contagem de pontos, ~2.000) | `[DOC: MEDICAO §5, docs/medicao-coinalyze.md §1.2/§1.3]` |

⇒ **Um backtest a `15min .. 4h` sobre as 5 métricas juntas está limitado pela mais rasa — hoje ~1,5
dia.** Fora desta feature por `NG-8`, e registrado aqui exatamente para não virar descoberta na
abertura daquele componente. **Dono:** `/architect` do `backtest`. **Gatilho:** abertura do componente.

### 9.3 O orçamento de cota está **fechado** (§6.3) — o que fica aberto é o **teto de símbolos por chamada**

`MEDICAO` §3.1 registra que uma chamada de **20 símbolos devolveu 19** (o ausente, `MATICUSDT`, é
símbolo deslistado — terceira testemunha do mesmo fato) e uma de **40 devolveu 38**. ⇒ **o número de
séries devolvidas pode ser menor que o de símbolos pedidos, silenciosamente.** `RS-3.7`: o coletor
**compara o conjunto pedido com o devolvido** e registra a diferença como `IngestGap`, nunca a ignora —
senão um símbolo some do painel sem que nada acuse. Isso é DoD da fase `05` — a única com terceiro.

### 9.4 `glossary_doc` continua vazio

`harness policy --key glossary_doc` → **1 byte**; `grep -n 'glossary' harness.toml` → `rc=1`
`[MEDIDO 2026-09-10]`. Dívida com dono (`ADR-013/D4`), **não reaberta** — e o `rc=0` com saída vazia
continua ambíguo entre *"declarado e vazio"* e *"nunca declarado"*: só o `grep` separa os dois.

---

## 10. Rastreabilidade — requisito do PRD → onde esta SPEC o fecha

| requisito | fechado em | componente |
|---|---|---|
| `RF-1` (coletor por métrica) | §4 (identidade), §5 (camada), `ADR-036` (fonte) | `sentimento` |
| `RF-2` (`series_key` no catálogo servido) | §4.4 | `sentimento` |
| `RF-3` (painel com `SEM_PONTO`) | §3.6, §7 (`RN-1`), §8.5/§8.6 | `web` |
| `RF-4` (`n_written` verdadeiro) | §3.5, `ADR-035`, `GA-4`/`GA-6` | `sentimento` + `infra` |
| `RF-5` (forma de contrato congelada) | §5 (`RS-1`, `RS-1.a`, `RS-2`) | todos |
| `RF-6` (motivo do `REJECTED`) | §7 (`RS-4`), §8.6 | `sentimento` |
| `RNF-1` (pegada de disco) | `ADR-036/D5` revisada — 1 linha por bucket por símbolo, **lida da origem**; aggTrades nunca foi necessário (`GA-7`) | `infra` |
| `RNF-2` (frescor) | §7, reusa `liveness.stale_after_s` já servido | `web` |
| `RNF-3` (rate limit) | §6 inteiro | `sentimento` |
| `RNF-4` (segredo em `.env`) | `RS-3.1`, na fase `05` — a key da Coinalyze só como `$COINALYZE_API_KEY` | `infra` |
| `DEF-1` | `ADR-035` | `sentimento` |
| `DEF-2` | §3.3, §8.6, `ADR-036/D4` — **e a decisão diverge do PRD**: a fatia entrega M4 sem consertar o socket | `sentimento` |
| `DEF-3` | **redefinido por `GA-5`** — `ADR-035/D3` | `sentimento` |

---

## 11. Próximo passo

`SPEC_APPROVED` é gate do **owner**. Depois dele, `/tech-lead` quebra o plano de
[`docs/plans/SPEC-007-cinco-metricas-do-core/`](../plans/SPEC-007-cinco-metricas-do-core/index.md) em
tasks. Esta SPEC não cria task, não cria unidade de valor no tracker e não se aprova.
