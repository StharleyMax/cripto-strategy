# Narrativa de review — fase `06`, as duas tasks de CÓDIGO de `D9` e `D12`

**Insumo vinculante:** [`handoff/DECISOES-OWNER.md`](handoff/DECISOES-OWNER.md) §D9 e §D12
(`[DECISÃO-OWNER: 2026-09-11, escolha entre alternativas apresentadas]`) ·
[`gates/EMENDAS-B1-B4-architect.md`](gates/EMENDAS-B1-B4-architect.md) (documento já emendado, zero
código) · `ADR-035` §D1 e §D3, **emendadas em 2026-09-11**.

**Escopo desta narrativa:** 2 tasks novas (`T-06.1`, `T-06.2`), 1 fase nova de plano, **1 aresta
acrescentada ao DAG existente** (`T-01.10`). Nenhuma task existente teve conteúdo reescrito.
**Nenhum gate de owner tocado** — `spec`, `build` e `advance DONE` intactos; nenhuma escrita no
ledger. O estado segue sendo `harness pipeline state cinco-metricas-do-core` → `BUILD_AUTHORIZED`,
não este texto.

---

## 1 · Onde elas moram — a pergunta que o despacho mandou justificar

### 1.1 Por que NÃO na fase `01`

`harness tasks resolve` é **tudo-ou-nada por fase** (`CA-4`). A recusa é real e está medida em
[`PENDENCIAS.md`](PENDENCIAS.md) §D1 `[MEDIDO 2026-09-11]`:

```
harness tasks resolve cinco-metricas-do-core 01 T-01.1=done … T-01.6=done
→ RECUSADO: tarefa(s) da fase 01 SEM desfecho declarado: T-01.7 … T-01.11 —
  faltando uma, NADA e escrito, nem as demais
```

⇒ pôr as duas na `01` faria **13** tasks precisarem de desfecho na mesma chamada. O custo não é
burocrático: amarraria o registro de duas correções de **instrumentação** ao veredito de **design**
(`T-01.8`) e ao **e2e de Playwright** (`T-01.9`). E o owner já disse a mesma coisa por outro
caminho — `D12`: *"⛔ Vai como TASK PRÓPRIA, não como resíduo da fatia `01`"*.

### 1.2 Por que uma fase NOVA, e por que ela se chama `06`

`06` **não é posição na fila** — é identidade de resolve. O mecanismo não me deixa escolher outro
nome: o validador exige `NN` de dois dígitos e `V-24` exige um `NN_*.md` no diretório do plano
`[MEDIDO 2026-09-11: scripts/tasks.sh:823 (PHASE_RE) e :897 (V-24)]`. `01b` é **inexprimível**; e um
sufixo tipo `01-correcao` colapsaria para a chave `01` na reconciliação de gates
(`lib/reconcile.py:24`, `PHASE_KEY_RE`), ou seja: voltaria a ser a fase `01` com outro nome.

Quem ordena a execução é o DAG, e ele põe a `06` **antes** da `02`: `T-01.10` passa a depender dela
(§3).

**Precedente do repositório, não invenção:** `SPEC-006`/`04_correcao_composicao.md` — fase de
fast-follow aberta **depois** de `F0`–`F3` mergeadas, com arquivo de plano próprio, para um bug
achado em uso ao vivo `[DOC: commit 31491dd, "abre fase 04 — /symbol nao serve dado real em
producao"]`.

### 1.3 ⚠️ O que esta fase VIOLA, declarado em vez de escondido

`D1` (owner) fixou **fase = fatia vertical até o pixel**, e esta fase **não tem pixel**. Ela não é
fatia vertical: é correção do que a fatia `01` **mede**. Estou declarando a exceção em vez de
fingir que `06` é uma sexta métrica. O precedente de `SPEC-006`/`04` é da mesma classe (correção,
não fatia) e foi aceito — mas **aceito para um bug achado ao vivo**, e quem decide se o precedente
se estende é o owner, não eu. **Se ele discordar, a alternativa é `1.4`.**

### 1.4 Alternativa recusada — duas fases de uma task cada (`06` e `07`)

Desacoplaria o resolve por completo: `D12` (urgente, bloqueia `T-01.10`) não ficaria refém de `D9`
(que exige **rebuild dos containers** para reverificar o `DoD-3`, hoje verde em produção). **Custo
que a recusa evita:** 2 arquivos de plano, **2 `gate-record`** e 2 ciclos de QA para **2 tasks** —
e `gate-record` é por fase, não por task, então duas fases de uma task deixam o dashboard mais
ruidoso sem ficar mais informativo. As duas tasks nascem juntas, saem do mesmo ADR, e pagam o
**mesmo** deploy.

> **Gatilho declarado de partição — com data, não com promessa:** se em **`2026-09-12T01:40:39Z`**
> (o instante em que o run de backfill sai da janela de 24 h, `[MEDIDO 2026-09-11, ended_at do
> run_id 932c37fc…]`) `T-06.2` estiver pronta e `T-06.1` ainda não tiver PR aberta, a fase se parte
> e `T-06.1` migra para `07`. Sem esse gatilho, "uma fase só" seria aposta, não decisão.

---

## 2 · `T-06.1` — `D9`, o handler de serviço, com a varredura AST INTACTA

### 2.1 O que existe hoje, medido — e é diferente do que a letra de `ADR-035/D3` pedia

`build_stdout_handler` **já** instala `ExtraRenderingFormatter` (`ingest_health_cli.py:136` →
`build_stream_handler`, `:127-131`). A separação projeção × serviço vive **no registro** (só imprime
`extra` quem passou `extra=`), não **no handler** — desvio que `T-01.5` declarou por escrito no
próprio módulo e que a emenda de `D9` agora fecha.

**O universo é 9 módulos: 8 importadores + o próprio**
`[MEDIDO 2026-09-11: grep -rl 'from src.modules.sentimento.infra.ingest_health_cli import'
backend/src --include='*.py' | wc -l → 8]`. Deles, **2 são serviço** (`single_writer_cli.py`,
`collectors_cli.py`) e **7 são projeção** (`ingest_health_cli`, `force_order_collector_cli`,
`force_order_collision_report_cli`, `aggtrade_nq_probe_cli`, `ntp_skew_probe_cli`,
`premium_index_probe_cli`, `clock_skew_tolerance_cli`).

### 2.2 ⛔ O achado que decide o DoD desta task — e sem ele a emenda nasce furada

A varredura AST descobre seu universo por **nome de builder importado**:

```python
# backend/tests/sentimento/test_ingest_health_extra_rendering.py:266
SHARED_HANDLER_BUILDERS = frozenset({"build_stdout_handler", "build_stream_handler"})
```

Se `build_service_stdout_handler` nascer **fora** desse conjunto, um módulo que importe **só** o
builder novo fica **fora do universo da guarda** — e o teste de universo, que é `==` justamente para
impedir um 10º módulo de nascer fora da pergunta, passaria verde sobre um universo encolhido. É
**exatamente** a erosão que a emenda de `ADR-035/D3` item 2 nomeia. ⇒ o nome novo **tem** de entrar
em `SHARED_HANDLER_BUILDERS`, e isso é `CA-F6-2`, não detalhe de implementação.

### 2.3 A pergunta de desenho que a task carrega, com critério — não com resposta minha

`build_stream_handler` é usado por **dois** chamadores com destinos opostos: `stdout` de projeção
(`:136`) e **`stderr` de diagnóstico** (`:177`, `_DIAGNOSTIC_FORMAT`). Tornar `build_stream_handler`
puro apaga `extra` **também do diagnóstico em `stderr`** — que não é projeção, não é hasheado, e é
lido por humano.

**Critério, e ele é a restrição não negociável de `D3`:** o eixo é **destino do `stdout`**. Nada que
alimente a projeção canônica pode renderizar `extra`; `stderr` não alimenta projeção nenhuma.
⇒ manter `extra` no diagnóstico é **permitido**; apagá-lo é **permitido**; o que reprova é
qualquer das duas escolhas ficar **implícita**. A task exige a escolha registrada no PR.

### 2.4 O que quebra e tem de ser reapontado (não é regressão, é consequência)

`_render` dos testes de rendering usa `build_stream_handler` (`:289`) para provar que `extra` sai
impresso. Com o builder puro, esses testes passam a exercitar o **builder de serviço** — senão
provam o oposto do que o nome deles diz.

---

## 3 · `T-06.2` — `D12`, `uptimePercent` sobre runs FECHADOS

### 3.1 O defeito, na linha exata

```python
# backend/src/modules/sentimento/use_cases/collector_status.py:117-121
n_expected_in_window = sum(run.n_expected for run in runs_in_window)
n_written_in_window  = sum(run.n_written  for run in runs_in_window)
uptime_percent = round(100 * n_written_in_window / n_expected_in_window, 2) if … else None
```

Numerador em **linhas**, denominador em **símbolos** (`premiumIndex`: `n_expected = 900`) ou em
**barras relidas** (`klines`: `n_returned = 12`) ⇒ tetos estruturais de **0,89%** e **33,3%** para
coletores saudáveis `[DOC: ADR-035/D1 emenda 2026-09-11]`.

### 3.2 ⛔ O obstáculo estrutural, e é o risco real desta task

`writer_accounted_at` — o único observável de *"fechado"* — é **TABLE-only**
(`postgres_ingest_record_store.py:65,123`) e **não é campo de `IngestRun`**: a única leitura hoje é
`store.writer_accounted_at(run_id)`, **uma consulta por run** (`:290`). O use case, porém, se
orgulha por escrito de **não acrescentar método ao port** (`collector_status.py:1-9`), e lê runs por
`IngestRecordSource.runs()`.

⇒ a task **tem de decidir** por onde "fechado" entra, e o critério está escrito nela:
**(a)** campo novo em `IngestRun` (o split TABLE-only/QUERY-only já existe,
`domain/ingest_record.py:16-19`) — barato, **desde que** a projeção canônica não ganhe coluna;
**(b)** método novo no port — caro, e contradiz o parágrafo de abertura do use case;
**(c)** uma consulta por run — **recusada de saída**: `n = 2.006` runs na janela medidos
`[MEDIDO 2026-09-11T11:26Z]` ⇒ 2.006 idas ao banco por request.

⛔ **Falsificador de escopo, que ABORTA a task:** se o diff tocar `INGEST_HEALTH_RUN_COLUMNS` ou
fizer `writer_accounted_at` aparecer em `canonical_projection()`, o `sha256` de `ADR-008/DoD-2`
muda e **dois lados que comparam justamente para provar que são iguais** passam a divergir sem que
nada aponte a causa (`RS-2`, `NG-6`, `CLAUDE.md` linha 11). Já existe teste mordendo isso:
`test_postgres_ingest_record_store_credits_the_run.py:310-319`.

### 3.3 O `[NÃO MEDIDO]` da emenda, RESOLVIDO — e a resposta não precisa de campo novo

A pergunta do `/architect`: *"que forma `collector_status` dá ao denominador zero"* (`forceOrder`:
3 runs, 0 fechados).

**Medido, e muda a pergunta:** a forma **já existe** — `uptime_percent: float | None`
(`domain/collector_status.py:148`), hoje `None` quando `n_expected_in_window == 0`, e o front já
sabe renderizar (`view-model.ts:120`: `uptimeText = null`). O tipo do contrato **não muda**.

**O que estava de fato indefinido era a DESAMBIGUAÇÃO**, e é aí que o `ADR-012` morde: sob a fórmula
nova, `null` cobriria dois estados diferentes — *"nenhum run na janela"* (coletor mudo) e *"há runs,
nenhum fechado"* (escritor não credita). Um `null` mudo para os dois troca um `rc=0` ambíguo por
outro.

**Resposta desta task, e ela cabe dentro de `D7` à letra (*"sem campo novo e sem versão de rota"*):**

1. `uptimePercent = null` quando **não há run fechado** na janela. Forma intacta.
2. A distinção sai de campo que **já é servido**: `n_runs_in_window` = 0 ⇒ mudo; > 0 com
   `uptimePercent = null` ⇒ há runs e nenhum fechado. **Os dois casos já são distinguíveis hoje** —
   faltava dizer isso em algum lugar normativo.
3. O **motivo** vai em `statusDetail`, campo **existente** que hoje é sempre `None`
   (`domain/collector_status.py:149`) e que o front **já** valida como `nullable-string`
   (`collector-status-query.ts:170`) e **já renderiza** (`view-model.ts:119` → `detailText`).
   ⇒ chega na tela do operador **sem uma linha de `frontend/`**.

⚠️ **Isto é decisão minha, e é contestável:** o tipo de `status_detail` deixa de ser o literal `None`
e passa a `str | None`. Não é campo novo (`D7` recusou **duplicar a métrica** — `uptimePercentReal`
ao lado do antigo —, não recusou usar um campo que já está no envelope), mas é mudança de tipo.
**Alternativa recusada:** tipo-soma tipo `Liveness`/`Retention`
(`UptimeMeasured` | `UptimeNotMeasurable`), que é a forma que o próprio domínio já usa para
"não medido" — custo: muda a **forma** de `uptimePercent`, e é `D7` inteiro que cai.
O texto em `statusDetail` é **microcopy de operador ⇒ pt-BR** (`SPEC-001` §3.8, `CLAUDE.md` linha 8).

### 3.4 ⚠️ Achado escalado — uma SEGUNDA superfície calcula `uptimePercent`, e ela não pode ser consertada

```ts
// frontend/src/features/s1-console/ingest-health-query.ts:709
uptimePercent: run.n_expected > 0 ? (run.n_written / run.n_expected) * 100 : null,
```

O console S1, quando lê `/ingest-health` (as 15 colunas), **recalcula a fórmula antiga no browser**.
E ele é **estruturalmente incapaz** de aplicar a nova: `writer_accounted_at` é TABLE-only e nunca
entra na projeção — por decisão que **não é desta feature** (`ADR-008/D3`).

⇒ depois desta fase, a mesma métrica terá **dois valores** conforme a rota que a serviu. **Não é
escopo de `T-06.2`** (seria `web`, colidiria com hot files da fatia `01`, e a decisão é de quem
governa `ADR-008`), mas ficar calado seria deixar nascer exatamente o sinal ambíguo que esta fase
existe para matar. **Registrado em `PENDENCIAS.md` e no handoff, endereçado a `/architect`.**

---

## 4 · A aresta que eu acrescentei ao DAG existente — e por que ela é o custo mais alto desta quebra

**`T-01.10` passa a ter `depends_on = ["T-01.3","T-01.4","T-01.5","T-06.1","T-06.2"]`.**

É a **única** alteração em task já aprovada, e é intencional: `T-01.10` é o **único ponto da fatia
`01` onde se paga produção** (subir o coletor, esperar a grade encher, medir), e ela carrega
`RS-1.a` — *exibir `uptimePercent` do `premiumIndex` ANTES e DEPOIS*.

- **Sem a aresta de `T-06.2`:** o "DEPOIS" de `RS-1.a` seria **`0,36`** — número que a emenda ao
  `DoD-2` de `ADR-035` declara *"literalmente satisfeito e substantivamente não"*. O gate fecharia
  sobre a mentira, e `T-01.11` (item 6: *"uptimePercent deixa de ser 0.0"*) fecharia a fatia em cima
  dela `[DOC: tasks.toml:262]`.
- **Sem a aresta de `T-06.1`:** a troca de handler **exige reconstruir os containers** para
  reverificar o `DoD-3` (`ADR-035/D3`, emenda, "custo aceito"). Medir produção antes da troca obriga
  a **medir duas vezes** — e é a parte cara.

**Alternativa recusada:** não mexer no DAG e escrever "bloqueia `T-01.10`" só em prosa. Custo que a
recusa evita: `CLAUDE.md` já mediu que **prosa sem portão tem 0% de adesão** (`agents/qa.md`), e o
único portão de ordem que existe aqui é `depends_on`.

**Custo aceito, declarado:** o [`PLANO-PARALELISMO.md`](PLANO-PARALELISMO.md) (30 ondas, 33 lotes)
foi construído sobre o DAG antigo e **fica desatualizado na onda de `T-01.10`**. Ele não é
executado por máquina, mas é o que a execução segue — **`T-06.1`/`T-06.2` formam um lote de 2**
(teto de `D8`), e ambas são backend, sem colisão de arquivo entre si.

---

## 5 · O que colide com `T-01.7`–`T-01.11` — arquivo a arquivo

| task aberta | arquivos dela | colide? | por quê |
|---|---|---|---|
| `T-01.7` | `frontend/src/app/symbol/*` (hot file **H4**) | **não** | as duas novas são **backend puro**. `T-06.2` chega na tela por `statusDetail`, que o front **já** lê — zero linha de `frontend/` |
| `T-01.8` | `docs/…/gates/design-01.md` (veredito do `ux-ui-mastery`) | **não** | nenhum toque em UI; nada para o design gate julgar |
| `T-01.9` | `frontend/e2e/09-volume-dado-real.spec.ts` | **não** | arquivo novo, e o alvo é o sub-eixo de volume em `/symbol`, não o console S1 |
| `T-01.10` | produção (`deploy/compose.yml:149`), medição | **⛔ SIM — e é dependência, não conflito** | mede `uptimePercent` (`RS-1.a`) e `docker logs` do `writer_batch_acked` (`DoD-5`): as duas coisas que esta fase muda. Resolvido pela aresta do §4 |
| `T-01.11` | gate de fechamento, conjunção dos 8 itens | **⛔ SIM, por TEXTO** | o item 6 diz *"uptimePercent deixa de ser 0.0"* — leitura literal que a emenda ao `DoD-2` **reprova**. Não reescrevi a task; a emenda de `ADR-035` é normativa e `T-01.11` depende de `T-01.10`, que agora depende de `T-06.2` ⇒ o número que ela vai conjugar já é o da fórmula nova |

**Colisão de código entre `T-06.1` e `T-06.2`: nenhuma.** `T-06.1` mexe em
`infra/ingest_health_cli.py` + `infra/single_writer_cli.py` + `infra/collectors_cli.py`;
`T-06.2` em `use_cases/collector_status.py` + `domain/collector_status.py` + a leitura de
`writer_accounted_at`. ⇒ o lote de 2 é legítimo.

⚠️ **`T-06.1` toca `single_writer_cli.py` e `collectors_cli.py`** — os arquivos que o lote `1B`
proibia `T-01.5` de tocar. A proibição **caiu**: `single_writer_cli.py` está livre desde `696707c`
`[DOC: ADR-035/D3 emenda, medido]`, e `T-01.3`/`T-01.4` já estão mergeadas.

---

## 6 · Tracker — DELIBERADO, não esquecido

`harness policy --key tracker` → `{kind=jira, project=CST, board_id=36}` `[MEDIDO 2026-09-11]`.
**Não é `kind = none`:** o destino existe e está identificado. O que falha é o **alcance** — o
servidor MCP `atlassian` exige OAuth e esta sessão é não-interativa (a mesma causa das 50 tasks
anteriores).

⇒ `T-06.1` e `T-06.2` nascem `local_only = true` com `local_reason` **datado**. Cadastro manual:
criar 2 `Tarefa` em `CST` (board 36) com o título verbatim do `tasks.toml`, e na **mesma edição**
trocar `local_only`/`local_reason` por `tracker = { provider = "jira", id = "CST-nnn", url = "…" }`
— o validador **proíbe os dois juntos** (`V-20`), então a troca não fica pela metade em silêncio.

---

## 7 · Desvio de processo, declarado em vez de silenciado

O fluxo canônico do `/tech-lead` é **narrativa → aprovação humana → materializar**. Esta sessão
**materializou na mesma passagem**, por ordem direta do despacho (*"Crie as tasks… DEVOLVA os ids
criados"*). O que sustenta a materialização é que o **conteúdo** das duas já é decisão do owner
(`D9`/`D12`, 2026-09-11) — o que ainda **não** foi aprovado é a **forma** que esta narrativa propõe,
e ela tem três pontos contestáveis, todos nomeados: **§1.3** (fase que não é fatia vertical),
**§3.3** (`statusDetail` passa a `str | None`) e **§4** (aresta nova em `T-01.10`).

**Nada disso foi ao ledger:** nenhum `approve`, nenhum `advance`, nenhum `gate-record`. Reverter é
apagar 2 blocos de `tasks.toml`, 1 arquivo de plano, 1 aresta e estes documentos.
