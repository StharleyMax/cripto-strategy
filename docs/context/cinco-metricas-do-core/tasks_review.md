# Narrativa de review das tasks — `cinco-metricas-do-core`

> **Feature:** `cinco-metricas-do-core` (filha de `plataforma-dados`)
> **SPEC:** [`SPEC-007`](../../specs/SPEC-007-cinco-metricas-do-core.md) · **Plano:** [`docs/plans/SPEC-007-cinco-metricas-do-core/`](../../plans/SPEC-007-cinco-metricas-do-core/index.md)
> **ADRs:** [`ADR-035`](../../adr/ADR-035-contabilidade-de-n-written-o-escritor-fecha-o-run-que-o-coletor-abriu.md) · [`ADR-036`](../../adr/ADR-036-fonte-por-metrica-do-core-a-origem-por-padrao-o-terceiro-so-onde-a-origem-e-vetada.md)
> **Decisões do owner consumidas sem reabrir:** `D1`..`D8` de [`handoff/DECISOES-OWNER.md`](handoff/DECISOES-OWNER.md)
> **Estado no ledger na abertura:** `SPEC_APPROVED` `[MEDIDO 2026-09-10: harness pipeline state cinco-metricas-do-core]`, `approve spec` do owner em `2026-09-10T21:21:12Z` `[MEDIDO: harness pipeline show cinco-metricas-do-core]`
> **Plano de paralelismo (`D8`):** [`PLANO-PARALELISMO.md`](PLANO-PARALELISMO.md) — artefato separado, porque é a entrada da execução, não do review

Este documento **argumenta**. O dado de máquina está em [`tasks.toml`](tasks.toml) e os dois **não se
sobrepõem**: aqui não há TOML, lá não há argumento.

---

## 0. Gate de entrada — os três itens, com o comando

| item | comando | resultado |
|---|---|---|
| estado é `SPEC_APPROVED` (o ledger, não o texto) | `harness pipeline state cinco-metricas-do-core` | `SPEC_APPROVED` `[MEDIDO 2026-09-10]` |
| `index.md` do plano existe | `ls docs/plans/SPEC-007-cinco-metricas-do-core/` | 6 arquivos: `index` + `01`..`05` `[MEDIDO 2026-09-10]` |
| destino no tracker identificado | `harness policy --key tracker` | `{kind=jira, project=CST, board_id=36, parent_kind=Epic, child_kind=Tarefa}` `[MEDIDO 2026-09-10]` |

O terceiro item está **identificado e não alcançável nesta sessão** — ver §6. Isso não trava o
pipeline, e a forma de registrar isso é o assunto daquela seção.

---

## 1. O número, e a trilha dele: **50 tasks em 5 fases**

| fase | fatia | tasks | componentes | por que este tamanho |
|---|---|---:|---|---|
| `01` | volume | **11** | `sentimento` · `infra` · `web` | paga `ADR-035` **uma vez para as cinco** (`PRD-007` §8/`DEF-1`) — é a única concessão horizontal |
| `02` | CVD | **8** | `sentimento` · `web` | nenhuma capacidade nova (`SPEC-007` §8.4): mesmo cliente, mesma resposta, índice `[9]` |
| `03` | open interest | **8** | `sentimento` · `web` | duas capacidades novas (cliente `/futures/data/` + 1ª série `5m`), zero wiring de tela |
| `04` | long/short | **9** | `sentimento` · `web` | 1º painel novo ⇒ `design_gate`; reusa o cliente da `03` |
| `05` | liquidações | **14** | `sentimento` · `infra` · `web` | **integração de terceiro do zero** — `RS-3.1..RS-3.7` inteiros, painel novo, cota, segredo |
| | **total** | **50** | | |

**A trilha do total, porque número sem trilha não se audita.** O plano tem **43 itens** numerados
(`1.1`..`1.12` com `1.4b` = 13 · `2.1`..`2.7` = 7 · `3.1`..`3.7` com `3.3b` = 8 · `4.1`..`4.7` = 7 ·
`5.1`..`5.9` com `5.3b`/`5.3c` = 11). **43 → 39 → 50**, e cada seta tem nome:

- **43 → 39, fusão líquida de −4** (7 fusões, 1 cisão, 2 repartições). Fusões: `1.4b`→`T-01.2` (é
  propriedade do cliente, não trabalho separado) · `1.4`→`T-01.3` · `1.6`→`T-01.4` · `2.4`→`T-02.2` ·
  `3.3b`→`T-03.2` · `3.6`→`T-03.5` · `4.3`→`T-04.2`. Cisão: `4.2` vira `T-04.1` (medir o teto de
  `5min` **antes** de gravar) + `T-04.3` (o coletor). Repartições: `5.4` entre `T-05.5` (backend) e
  `T-05.9` (web); `5.8` entre `T-05.9` (painel) e `T-05.10` (gate de design).
- **39 → 50, +11 por trabalho que o plano exige e não numerou**: **5 tasks de `deploy`** e **5 de
  `fechamento vertical`** (uma de cada por fase), mais `T-05.8` (registro no catálogo servido das duas
  coortes — o plano numerou o registro nas fases `02`/`03`/`04` e esqueceu na `05`).

### 1.1 As 11 tasks que o plano não numerou, e por que elas existem

**`D2` (owner) exige `count(*) > 0` no Postgres REAL e `N ≥ 30` pontos no DOM do app REAL.** Nenhuma
das duas coisas acontece por um `pytest` verde. Alguém tem de **subir o coletor no
`deploy/compose.yml`** (serviço `collector`, `deploy/compose.yml:149` `[MEDIDO 2026-09-10]`), esperar a
grade encher, e **medir**. Isso é trabalho de `infra`, tem PR próprio, e some se ficar implícito.

⚠️ **É exatamente o elo que quebrou antes.** `pagina-de-grafico-s2` fase `02` passou com SQL + HTTP e o
dado não chegava na tela; quem achou foi a fase `04`, em uso ao vivo pelo owner
`[DOC: DECISOES-OWNER.md §D2]`. Colapsar "o código existe" com "o dado está na tela" é o defeito que
`D1`/`D2` existem para matar — então ele ganha **duas tasks por fase**, não zero.

**A separação entre `deploy` e `fechamento` é deliberada:** `deploy` é ato de código/config (subir o
serviço, medir `DoD-1` e `DoD-4`); `fechamento` é a **conjunção** dos 4 mais `make verify`, escrita no
gate. Fundi-los faria a medição parcial parecer fechamento — e um `DoD-3` que nunca rodou ficaria
invisível dentro de um PR que "passou".

---

## 2. Onde o paralelismo real está — e a justificativa **contra** a dependência que `D8` exige

`D8` manda justificar, não assumir. Fatia a fatia:

### 2.1 `02 ∥ 01` — **impossível, e não é questão de conveniência**

A fase `02` tem `DoD-7`: *"nenhuma chamada HTTP nova em relação à fase `01`"*. Uma fase cujo DoD é
**não ter rede própria** é, por construção, consumidora do artefato da outra: sem
`binance_klines_client` (`T-01.2`) não existe resposta da qual ler o índice `[9]`. Não é acoplamento
frouxo — é definição.

### 2.2 `04 ∥ 03` — **impossível, e o plano diz literalmente**

Item `4.2`: *"reusa o cliente que a fase `03` construiu, **não é integração nova**"*.

### 2.3 `03 ∥ 01` — **o DAG permite; eu recuso, e o motivo é colisão de arquivo, não o DAG**

O DAG só liga `03` a `01` por `ADR-035` (`DoD-4`). O cliente de `03` é novo. Então, formalmente,
`03` poderia começar assim que `T-01.4` fechasse.

**O que o DAG não vê:** `01` e `03` escrevem nos **mesmos três arquivos**:

| arquivo | quem toca | por quê |
|---|---|---|
| `backend/src/modules/sentimento/infra/collectors_cli.py` (**807 linhas** `[MEDIDO 2026-09-10: wc -l]`) | `01`, `03`, `04`, `05` | é onde vive **um `_run_*_collector` por fonte** (`_run_premium_index_collector:406`, `_run_force_order_collector:528`) mais o `run()` e o `main()` que os despacham |
| `backend/src/modules/sentimento/use_cases/series_catalog.py` | **as 5** | `list_series_catalog()` (`:94-113`) é **o** sítio de registro do catálogo **servido** — a lista literal de `entries` que `/api/v1/series-catalog` publica |
| `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` | **as 5** | `_build_row` + um `_<metrica>_key` por série |

Duas worktrees acrescentando cada uma um `_run_*_collector` e uma entrada na mesma lista de `entries`
colidem no despacho. **E colisão de despacho de coletor é a pior classe de quebra deste repositório:**
o merge resolve com aparência limpa e **um coletor deixa de ser chamado, em silêncio** — a mesma
família de `core.hooksPath` e do `rc=0` de `ADR-012`, onde o portão para de existir e nada avisa.

### 2.4 `05 ∥ qualquer coisa` — **é o ÚNICO candidato genuíno, e eu ainda recuso — com três motivos e uma saída declarada**

`05` não depende de `02`, `03` nem `04`. Depende só de `ADR-035` (`T-01.4`), para `DoD-4`. Esse é o
único ponto em que `D8` poderia render mais que 2 e o teto do owner não ser a restrição ativa.

**Recuso por três motivos, em ordem de força:**

1. **O ambiente de produção é UM.** `DoD-1`, `DoD-3` e `DoD-4` rodam contra **um** `deploy/compose.yml`,
   **um** serviço `collector` (`:149`) e **um** Postgres compartilhado. Duas fases fechando o vertical
   ao mesmo tempo são dois coletores no mesmo serviço e dois Playwright contra o mesmo `/symbol`.
   ⚠️ E a regra em vigor é literal: **nunca semear dado de teste no Postgres compartilhado** — um e2e
   que precisa escolher uma janela com dado real (`DoD-3` da `05`) não tolera outra fase escrevendo
   na mesma janela ao mesmo tempo.
2. **Colisão de arquivo, e ela é pior no front que no back.** `04` e `05` criam **painel novo** cada
   uma, e as duas editam `frontend/src/app/symbol/SymbolClient.tsx` (`:239-246`, a lista de painéis) e
   o tipo `S2Panels` em `view-model.ts`. Dois painéis novos em duas worktrees = conflito garantido no
   mesmo `record` de tipo.
3. **Colisão de COTA, que não é colisão de arquivo e por isso ninguém a vê no `git status`.** A cota
   medida da Coinalyze é **40 unidades por janela deslizante de 60 s** `[MEDIDO 2026-09-10, n=41
   requisições, SPEC-007 §6.1]`. Dois processos medindo contra a mesma chave se envenenam: o `429` de
   um vira ruído na medição do outro, e `DoD-6b` da fase `05` (*consumo ≤ 5% do teto*) mede duas
   coisas somadas achando que mede uma.

**A saída, e ela é honesta em vez de retórica:** o que de fato paraleliza na `05` **é a medição, não o
cano**. `T-05.1` (falsificador de `denom`), `T-05.2` (retenção real de `liquidation-history`) e
`T-05.13` (escalonamento ao `quant-architect`) não tocam arquivo compartilhado nenhum e não sobem nada
em produção. Elas estão listadas em `PLANO-PARALELISMO.md` §5 como **preenchimento oportunista** — com
a ressalva de cota do motivo 3, que vale para `T-05.1` e `T-05.2` entre si.

### 2.5 ⇒ A conclusão, em uma linha

**O teto de `D8` (2) não é a restrição ativa entre fatias — a restrição ativa é o arquivo
compartilhado e o ambiente único.** Dentro de cada fatia, o teto de 2 **é** atingível e é atingido em
**17 dos 33 lotes** `[MEDIDO sobre o DAG de `depends_on` deste documento, n=50 tasks]`.

---

## 3. A forma que toda fatia tem — e por que ela é a mesma nas cinco

```
falsificador (quando há)  →  identidade  →  ┬→ coletor          ─┐
                                            └→ registro servido ─┤→ deploy ─→ e2e ─→ fechamento
                                                       └→ painel ┘         (design_gate em paralelo)
```

Quatro escolhas de decomposição, cada uma com o motivo:

**(a) O falsificador é TASK, e vem ANTES da identidade.** Três fatias têm um: `T-02.1`
(`reconstructed_from`), `T-04.1` (o teto de `5min` é da Binance?), `T-05.1` (`denom` de liquidação).
Motivo, e é o mesmo nos três: **`series_key_id()` é o `sha256` da projeção canônica dos 15 termos**
(`series_key.py:226-234`) — mudar um termo **depois** não corrige a série, **re-identifica** a série.
Corrigir depois é migração; medir antes custa um script. Por isso `T-02.2` depende de `T-02.1`, e não
o contrário.

**(b) Identidade e registro no catálogo servido são tasks DIFERENTES.** *"Reusar não é não fazer
nada"* (`SPEC-007` §4.5): uma entrada que existe em `domain/` mas não está na lista de
`list_series_catalog()` faz `/api/v1/series-history` devolver **`422 UnknownSeriesKeyIdError`**. São
arquivos diferentes, PRs diferentes, e — decisivo para `D8` — **paralelizáveis com o coletor**, que é
o par de maior ganho de todo o plano.

**(c) O painel depende do REGISTRO, não do coletor.** O front resolve a série pelo `series_key_id`
publicado em `/api/v1/series-catalog`; ele não sabe se há linha em `md.series` — a ausência é
`SEM_PONTO`, que é justamente o que ele tem de saber renderizar (`RN-1`). ⇒ **`web` e `sentimento`
correm em paralelo na mesma onda**, em worktrees que não se tocam (`frontend/src/` × `backend/src/`).
É o par mais limpo do plano e ele aparece em **todas as cinco fatias**.

**(d) O `design_gate` é task própria, nunca um checkbox dentro da task de painel.**
`CLAUDE.md` §*Design*: *"agente que gera e aprova o próprio trabalho não tem gate"*. `T-01.8`,
`T-04.6` e `T-05.10` existem para que o veredito do `ux-ui-mastery` tenha **PR próprio e resultado
registrado** — silêncio do owner não é aprovação.

⚠️ **A regra que torna (d) compatível com o teto de 2** — e é decisão desta quebra, não do plano:
**o e2e de `DoD-3` seleciona por `data-testid` estável, fixado pela task de painel.** Assim um
`NEEDS_FIX` do gate de design (cor, altura, escala) **não pode** quebrar o assert de `N ≥ 30`, e o
gate de design e o e2e podem correr no mesmo lote. Sem essa regra os dois seriam serialmente
dependentes e três lotes de 2 virariam seis lotes de 1.

---

## 4. As decisões de quebra que merecem discordância — 6, com o custo de cada uma

### 4.1 `ADR-035` é **uma** task de mecanismo (`T-01.4`), não uma por coletor

`T-01.4` faz o `run_id` viajar no envelope e o escritor fechar o run pelo upsert que **já existe**
(`postgres_ingest_record_store.py:106-128`, `ON CONFLICT (run_id) DO UPDATE SET … n_written =
EXCLUDED.n_written` `[DOC: SPEC-007/GA-4]`). **Ela é provável contra o `premiumIndex`, que já tem
1.429 runs na janela** `[MEDIDO 2026-09-10T20:10Z]` — ou seja, não precisa esperar o coletor de
klines existir. Por isso `T-01.4` está na **onda 1** e `T-01.3` depende dela, não o contrário.

**Custo aceito:** `T-01.4` toca 5 arquivos (`series_row_wire`, `redis_series_write_queue`,
`single_writer_cli`, `collector_run_mapping`, `postgres_ingest_record_store`) e é a task mais larga do
plano. Alternativa recusada: fatiá-la em "envelope" + "escritor" — recusada porque as duas metades só
são falsificáveis juntas (`ADR-035`/falsificador: run fechado com `n_written=0` enquanto `md.series`
ganhou linha).

### 4.2 O formatador (`T-01.5`) **não** toca `single_writer_cli.py`

`GA-5` mediu que a causa é **uma linha**: `_STABLE_FORMAT = "%(message)s"` em
`ingest_health_cli.py:33`. `T-01.5` altera **esse arquivo e o teste que pina o formato**, e nada mais.
**Isso é restrição de escopo, não descrição** — é o que permite `T-01.4` e `T-01.5` correrem no mesmo
lote (`Lote 1B` da fase `01`) sem colidir em `single_writer_cli.py`.
⚠️ E `ADR-035/D3` exige a outra metade: **`stdout` de CLI de projeção não pode ser contaminado** —
trocar o formatador global quebraria a saída canônica que `ADR-008/DoD-2` compara por `sha256`.

### 4.3 A fase `03` começa **abrindo três arquivos** (`T-03.1`), e isso é task

O inventário conta **citação, não funcionalidade**, e ele mesmo pede que se abram os arquivos antes de
estimar `[DOC: INVENTARIO-POR-METRICA.md]`. Uma task de leitura que devolve *"isto é probe, aquilo é
reusável"* custa pouco e impede que `T-03.2` descubra no meio que
`infra/binance_oi_history_client.py` e `domain/oi_history_paginator.py` já resolvem metade.
**Custo:** uma task que não produz código de produção. **Alternativa recusada:** embutir a leitura em
`T-03.2` — recusada porque então o achado não tem onde ser registrado e a próxima fase o refaz.

### 4.4 `M3` = `count_long_short_ratio`, **uma** série, com falsificador de reta

`FORBIDDEN_METRIC_NAMES` (`series_key.py:67`) recusa `ls_ratio` em tempo de construção — `M3` são
**quatro** séries. A SPEC escolheu `count_long_short_ratio`.
**Custo declarado e não escondido:** três das quatro têm autocorrelação lag-1 de **0,99+**
`[DOC: series_key.py:60-62, CA-F2-3]`, e 0,99+ **desenha uma reta**. `T-04.9` carrega o falsificador:
se o painel for visualmente plano em `15min..4h`, a fatia acrescenta `sum_taker_long_short_vol_ratio`
(autocorrelação **0,0955**) como segunda série do mesmo painel — **reversível dentro da fase**, porque
é outra entrada de catálogo e outra chamada, não outro cano.

### 4.5 A fase `05` é dimensionada como **integração completa**, e é por isso que tem 14 tasks

O plano avisa em maiúsculas: *"esta fase ficou MAIS CARA, não mais barata"* — o coletor Coinalyze que
ela reusaria **deixou de existir** quando `GA-7` tirou o CVD da Coinalyze. `RS-3.1..RS-3.7` são
**sete** requisitos, cada um com teste, mais chave em `.env`, mais cota, mais painel novo, mais
liveness, mais retenção, mais escalonamento.

⚠️ **Quem ler `PRD-007`/`DEF-2` e não ler `D6` vai orçar trabalho que o owner cancelou:** **não há
task de conserto do `!forceOrder@arr` neste documento**, e a ausência é decisão, não esquecimento
(`D6`: a alternativa *"aceitar, mas exigir data para o forceOrder"* foi **recusada** pelo owner).
O coletor morto **permanece de pé gravando `REJECTED`**, com dono (`plataforma-dados`/`T-07.11`) e
gatilho (`ADR-036`) declarados fora desta feature.

### 4.6 `T-05.7` (liveness) **herda** `T-07.11` de `plataforma-dados` — e muda de alvo

`T-07.11` está `blocked` em `docs/context/plataforma-dados/tasks.toml:1161`. Esta feature **não a
desbloqueia** (outra feature, outro ledger): `T-05.7` implementa o detector **por contiguidade e
heartbeat, nunca taxa**, medindo a **fonte primária REST**, que é alvo diferente do socket. A relação
está em `refs`, não em `depends_on` — **o grafo do validador é intra-feature** (`V-13`), e uma aresta
para fora reprovaria.

---

## 5. O que esta quebra NÃO cria — e cada ausência tem motivo escrito

| não existe | por quê |
|---|---|
| task de conserto do `!forceOrder@arr` | `D6` (owner) **recusou** exigir data. Dono: `plataforma-dados`/`T-07.11` |
| task de renomear os 4 eventos de log em português | `NG-5` · `CLAUDE.md` linha 10 é **prospectiva**: o passivo fica, o crescimento para |
| task tocando `INGEST_HEALTH_RUN_COLUMNS` | `RS-2` · `NG-6` · `CLAUDE.md` linha 11 — a ordem da tupla alimenta o `sha256` de `ADR-008/DoD-2` |
| task de versionar `/api/v1/collector-status` | `D7` (owner): `n_written` muda de **valor**, não de forma. *"Trocar mentira por verdade não é quebra de contrato"* |
| task de `[[rules.own]]`/alvo de `make`/allowlist **de idioma** | `RN-4` · `ADR-011/D1.10` — declarar uma **REPROVA a fase** |
| task de história profunda / backfill de meses | `NG-8`. `SPEC-007` §9.2: dono é o `/architect` do `backtest`, gatilho é a abertura do componente |
| task de segunda testemunha do CVD na Coinalyze | `ADR-036/D5.a` **recusada**: 116/120 exatos ⇒ não é testemunha independente |
| unidade de valor no tracker | não é papel do `/tech-lead` |

---

## 6. Tracker — o destino existe, a integração não alcança, e a marcação diz **qual dos dois**

`harness policy --key tracker` devolve `{"kind": "jira", "project": "CST", "board_id": "36",
"parent_kind": "Epic", "child_kind": "Tarefa"}` `[MEDIDO 2026-09-10]`. **Não é `kind = none`** — o
destino está declarado.

**O que falhou:** o servidor MCP `claude.ai Atlassian` exige OAuth e **esta sessão é não-interativa**
`[MEDIDO 2026-09-10: o runtime declara os servidores que exigem autenticação, e `atlassian` está entre
eles]`. Nenhuma `Tarefa` foi criada em `CST`.

**A marcação escolhida, e o vocabulário importa mais que a escolha:** as 50 tasks nascem
`local_only = true` com `local_reason` **datado e com motivo**. Não é o marcador de *"esqueci"*.

⛔ **Por que não deixar sem marcação (que é o marcador de "esqueceu de sincronizar")**: porque não
esquecemos — sabemos exatamente que não estão cardadas e por quê. Um marcador que colapse *"decidi"*
com *"esqueci"* faz o segundo **nunca chamar atenção**, e o fallback é precisamente o lugar onde essa
distinção decide se alguém volta a olhar. Aqui a decisão é **deliberada e reversível**: quando houver
sessão interativa com o Jira autenticado, cada task troca `local_only`/`local_reason` por
`tracker = { provider = "jira", id = "CST-nnn", url = "…" }` — o validador **proíbe** os dois juntos
(`V-20`), então a troca não pode ficar pela metade em silêncio.

**Instrução de cadastro manual** (uma `Tarefa` por task, `Epic` pai a criar em `CST`, board `36`):
o título e o corpo saem de `harness tasks json cinco-metricas-do-core`, e o `id` volta para o campo
`tracker` **na mesma edição** que remove `local_only`/`local_reason`.

---

## 7. Rastreabilidade — nenhum item do plano fica sem task

| itens do plano | tasks |
|---|---|
| `1.1` `1.2`+`1.4b` `1.3`+`1.4` `1.5`+`1.6` `1.7` `1.8` `1.9` `1.10` `1.11` `1.12` | `T-01.1` `T-01.2` `T-01.3` `T-01.4` `T-01.5` `T-01.6` `T-01.7` `T-01.8` `T-01.9` `T-01.10` |
| `2.1` `2.2`+`2.4` `2.3` `2.5` `2.6` `2.7` | `T-02.3` `T-02.2` `T-02.1` `T-02.4` `T-02.5` `T-02.6` |
| `3.1` `3.2` `3.3`+`3.3b` `3.4` `3.5`+`3.6` `3.7` | `T-03.1` `T-03.3` `T-03.2` `T-03.4` `T-03.5` `T-03.6` |
| `4.1`+`4.3` `4.2` `4.4` `4.5` `4.6` `4.7` | `T-04.2` `T-04.1`+`T-04.3` `T-04.4` `T-04.5` `T-04.6` `T-04.7` |
| `5.1` `5.2` `5.3` `5.3b` `5.3c`+`5.4` `5.5` `5.6` `5.7` `5.8` `5.9` | `T-05.1` `T-05.3` `T-05.5` `T-05.4` `T-05.9`(+`T-05.5` backend) `T-05.7` `T-05.6` `T-05.2` `T-05.9`+`T-05.10` `T-05.11` |
| `DoD` verificável de cada fase (deploy + conjunção) | `T-01.10`/`T-01.11` `T-02.7`/`T-02.8` `T-03.7`/`T-03.8` `T-04.8`/`T-04.9` `T-05.12`/`T-05.14` |
| `RS-5` (rótulo de terceiro) · `ADR-036/D6` (fidelidade) · registro servido de M4 | `T-05.9` · `T-05.13` · `T-05.8` |

**Requisitos:** `RF-1` (5 coletores) · `RF-2` (5 identidades + 5 registros) · `RF-3` (3 painéis
existentes + 2 novos) · `RF-4` (`T-01.4`+`T-01.5`) · `RF-5` (nenhuma task muda forma de contrato) ·
`RF-6` (`T-05.6`) · `RNF-1` (`T-01.3` grava 1 linha por bucket) · `RNF-2` (`T-03.5`) · `RNF-3`
(`T-03.2`, `T-04.1`, `T-05.5`) · `RNF-4` (`T-05.4`).

---

## 8. O que eu peço que seja contestado

1. **50 tasks é granular demais?** A referência interna é `plataforma-dados`: **84 tasks / 9 fases**
   `[MEDIDO 2026-08-28]` ≈ 9,3 por fase; aqui são 10,0. Se o owner preferir PRs maiores, os candidatos
   a fusão são as duplas `deploy`+`fechamento` (−5 tasks) — **e o custo é o §1.1**: medição parcial
   volta a poder passar por fechamento.
2. **A recusa de rodar `05` em paralelo com `02`/`03`/`04` (§2.4).** É a única decisão desta quebra que
   custa tempo de calendário de verdade. Se o owner aceitar o risco, o caminho existe: worktree
   separada para `05` **atrasando as tasks de `web` e de `deploy` dela** para depois de `04` fechar.
   Eu não recomendo, e o motivo mais forte é o **(1)** — ambiente único e Postgres compartilhado —, não
   o **(2)**.
3. **A regra do `data-testid` (§3, ⚠️).** Ela é decisão minha, não do plano nem da SPEC. Se o
   `ui-designer`/`frontend-architect` discordarem, três lotes de 2 viram seis lotes de 1 e o plano de
   paralelismo perde ~9% do ganho.

---

## 9. Próximo passo

Aprovação desta narrativa ⇒ `harness pipeline approve cinco-metricas-do-core tasks` ⇒
`TASKS_APPROVED` ⇒ `/build` (⛔ `approve build` é gate do **owner**, não de agente).
