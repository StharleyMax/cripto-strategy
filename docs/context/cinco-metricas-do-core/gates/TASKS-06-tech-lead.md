# Fase `06` quebrada em tasks — `/tech-lead`, 2026-09-11

**Insumo vinculante:** [`handoff/DECISOES-OWNER.md`](../handoff/DECISOES-OWNER.md) §D9 e §D12
`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]` ·
[`gates/EMENDAS-B1-B4-architect.md`](EMENDAS-B1-B4-architect.md) (documento, zero código) ·
`ADR-035` §D1 e §D3 **emendadas**.
**Narrativa e alternativas recusadas:** [`tasks_review_06.md`](../tasks_review_06.md).
**Escopo executado:** 2 tasks, 1 fase de plano, 1 aresta no DAG, 4 documentos. **Zero código de
produção. Nenhuma escrita no ledger** — estado segue `BUILD_AUTHORIZED`, e `spec`/`build`/
`advance DONE` (gates do **owner**) intactos.

## 1 · O que foi criado

| # | artefato | o que é |
|---|---|---|
| `T-06.1` | `tasks.toml` | `[infra]` — `build_service_stdout_handler` instalado pelos 2 processos de serviço; `build_stdout_handler`/`build_stream_handler` voltam a `logging.Formatter` puro; **a varredura AST fica** |
| `T-06.2` | `tasks.toml` | `[sentimento]` — `uptimePercent` = % dos runs **fechados** da janela com `n_written > 0`; `n_expected` intocado; denominador zero com forma declarada |
| fase `06` | [`plans/…/06_correcao_de_instrumentacao.md`](../../../plans/SPEC-007-cinco-metricas-do-core/06_correcao_de_instrumentacao.md) | exigida por `V-24` (`phase` sem `NN_*.md` no plano ⇒ ERROR) |
| narrativa | [`tasks_review_06.md`](../tasks_review_06.md) | aprovação humana; 3 pontos contestáveis nomeados |
| handoff | [`handoff/T-06.md`](../handoff/T-06.md) | lote, 3 reprovações, comando de medição, o que não fazer |
| pendência | [`PENDENCIAS.md`](../PENDENCIAS.md) §G1, §G2 | achado escalado + plano de paralelismo desatualizado |

`harness tasks validate cinco-metricas-do-core` → **`52 task(s), 0 ERROR, 0 WARN`**
`[MEDIDO 2026-09-11]` (era 50).
`harness pipeline scope … add backend/src/api/routes/collector_status.py
backend/tests/api/test_collector_status_route.py` → escopo vigente com **16** prefixos, sem
colisão reportada `[MEDIDO 2026-09-11]`.

## 2 · Onde elas moram, e por quê — a pergunta que o despacho mandou justificar

**Fase `06`, não `01`.** `harness tasks resolve` é **tudo-ou-nada por fase** (`CA-4`), com recusa
real medida em [`PENDENCIAS.md`](../PENDENCIAS.md) §D1: na `01` seriam **13** tasks precisando de
desfecho na mesma chamada, amarrando duas correções de instrumentação ao veredito de **design**
(`T-01.8`) e ao **e2e de Playwright** (`T-01.9`). E `D12` diz literalmente *"task própria, não
resíduo da fatia `01`"*.

**Por que `06` e não `01b`:** o validador exige `NN` de dois dígitos (`scripts/tasks.sh:823`) e
`V-24` exige `NN_*.md` no plano (`:897`); `01-correcao` **colapsaria** para a chave `01` na
reconciliação de gates (`lib/reconcile.py:24`, `PHASE_KEY_RE`). `06` é **identidade de resolve, não
posição na fila** — o DAG a põe **antes** da `02`.

**Uma fase com 2 tasks, não duas fases de 1** — e o custo tem gatilho declarado: se em
`2026-09-12T01:40:39Z` `T-06.2` estiver pronta e `T-06.1` não tiver PR, a fase se parte e `T-06.1`
migra para `07`.

⚠️ **Exceção a `D1` (owner), declarada:** esta fase **não é fatia vertical** — não tem pixel, ela
conserta o que a fatia `01` mede. Precedente da mesma classe: `SPEC-006`/`04_correcao_composicao.md`
`[DOC: commit 31491dd]`.

## 3 · Os dois achados que mudaram o DoD — nenhum estava nas emendas

1. **`T-06.1`:** a varredura AST descobre seu universo por **nome de builder importado** —
   `SHARED_HANDLER_BUILDERS = frozenset({"build_stdout_handler","build_stream_handler"})`
   (`test_ingest_health_extra_rendering.py:266`). Se `build_service_stdout_handler` nascer fora
   desse conjunto, um módulo que importe só ele fica **fora do universo da guarda**, e o teste de
   universo — que é `==` justamente para isso — passa **verde sobre universo encolhido**. É a erosão
   que a própria emenda item 2 nomeia. ⇒ virou `CA-F6-2`.
2. **`T-06.2`:** `writer_accounted_at` é **TABLE-only** (`postgres_ingest_record_store.py:65,123`),
   **não é campo de `IngestRun`**, e a única leitura hoje é `store.writer_accounted_at(run_id)` —
   **uma consulta por run** (`:290`), contra `n = 2.006` runs na janela. O use case lê por
   `IngestRecordSource.runs()` e se orgulha **por escrito** de não acrescentar método ao port
   (`collector_status.py:1-9`). A task carrega as 3 opções e o critério; a (c) está recusada de
   saída.

## 4 · O `[NÃO MEDIDO]` da emenda, resolvido — e sem campo novo

**Pergunta do `/architect`:** que forma dar ao denominador zero (`forceOrder`: 3 runs, 0 fechados).

**Medido:** a forma **já existe** — `uptime_percent: float | None` (`domain/collector_status.py:148`),
hoje `None` quando `n_expected == 0`, e o front já renderiza (`view-model.ts:120`). **O tipo do
contrato não muda** ⇒ `D7` (*"muda de valor, não de forma"*) preservado.

**O que estava de fato indefinido era a DESAMBIGUAÇÃO:** sob a fórmula nova, `null` cobriria *"nenhum
run na janela"* (mudo) **e** *"há runs, nenhum fechado"* (escritor não credita) — um `null` mudo para
os dois troca um `rc=0` ambíguo por outro. **Resposta:** `n_runs_in_window` (**já servido**) separa
os dois, e o **motivo** vai em `statusDetail` — campo **existente**, hoje sempre `None`, que o front
**já** valida como `nullable-string` (`collector-status-query.ts:170`) e **já renderiza**
(`view-model.ts:119` → `detailText`) ⇒ chega na tela **sem uma linha de `frontend/`**.

⚠️ **Contestável, e é meu, não do owner:** `status_detail` deixa de ser o literal `None` e passa a
`str | None`. Não é campo novo (`D7` recusou **duplicar a métrica**), mas é mudança de tipo.
Alternativa recusada: tipo-soma como `Liveness`/`Retention` — mudaria a **forma**, e `D7` inteiro
cairia.

## 5 · Colisão com as 5 tasks abertas da fatia `01`

`T-01.7`, `T-01.8`, `T-01.9` — **nenhuma**: as duas novas são **backend puro**, e `T-06.2` chega na
tela por um campo que o front já lê.
`T-01.10` e `T-01.11` — **sim, e é dependência, não conflito**: `T-01.10` é a **única** task da
fatia que paga produção e carrega `RS-1.a` (`uptimePercent` antes/depois); `T-01.11` conjuga o item
6 (*"deixa de ser 0.0"*), leitura literal que a emenda ao `DoD-2` **reprova** (hoje vale `0,36` e
continua mentindo sobre coletor saudável).

⇒ **aresta acrescentada:** `T-01.10.depends_on += ["T-06.1","T-06.2"]`. Única alteração em task já
aprovada, com o motivo escrito no próprio `refs`. Sem ela: `RS-1.a` registraria `0,36` como
"depois", e a troca de handler obrigaria a **medir produção duas vezes**.

## 6 · Tracker — deliberado, não esquecido

`harness policy --key tracker` → `{kind=jira, project=CST, board_id=36}` `[MEDIDO 2026-09-11]`.
**Não é `kind = none`.** O que falha é o **alcance**: MCP `atlassian` exige OAuth e a sessão é
não-interativa. ⇒ as 2 nascem `local_only = true` com `local_reason` **datado**; o cadastro manual
está em `tasks_review_06.md` §6, e `V-20` proíbe `local_only` junto de `tracker`, então a troca não
fica pela metade em silêncio.

## 7 · Desvio de processo, declarado

Fluxo canônico: narrativa → **aprovação humana** → materializar. Esta sessão materializou na mesma
passagem, por ordem direta do despacho. Sustenta: o **conteúdo** já é decisão do owner (`D9`/`D12`);
falta aprovar a **forma**, e os 3 pontos contestáveis estão nomeados em `tasks_review_06.md` §1.3,
§3.3 e §4. **Reverter é apagar 2 blocos do `tasks.toml`, 1 arquivo de plano, 1 aresta e estes
documentos** — nada foi ao ledger.

## 8 · Falsificador deste gate

Se `harness tasks validate cinco-metricas-do-core` não devolver `52 task(s), 0 ERROR, 0 WARN`, ou se
`T-06.1` mergear sem `build_service_stdout_handler` dentro de `SHARED_HANDLER_BUILDERS`, este
relatório está errado e a fase nasceu com a guarda já erodida.
