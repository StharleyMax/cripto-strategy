# Narrativa de review de tasks — `plataforma-dados`

**Papel:** `/tech-lead` · **Data:** 2026-08-25 · **Status: AGUARDANDO APROVAÇÃO DO OWNER**
**Estado do ledger na abertura desta sessão:** `SPEC_APPROVED`
**Nada foi criado, editado ou comentado no Jira por este documento.** O `harness.toml` não foi
tocado. O ledger não foi avançado. `docs/INDEX.md` recebe **uma linha nova** (append-only) e
nenhuma linha existente foi reescrita.

---

## 0. Gate de entrada — conferido, com o comando

| condição da skill | comando | resultado |
|---|---|---|
| estado == `SPEC_APPROVED` | `harness pipeline state plataforma-dados` | **`SPEC_APPROVED`** `[MEDIDO]` |
| o ledger, e não o texto, é a identidade | `harness pipeline show plataforma-dados` | `approve spec` em **`2026-08-25T18:44:21Z`**, `advance SPEC_APPROVED` em `18:44:22Z` `[MEDIDO]` |
| `index.md` do plano existe | `ls docs/plans/SPEC-001-plataforma-dados/index.md` | existe, **9 fases** `01`..`09` `[MEDIDO]` |
| destino no tracker identificado | `harness policy --key tracker` | `{"board_id":"36","child_kind":"Tarefa","kind":"jira","parent_kind":"Epic","project":"CST"}` `[MEDIDO]` |
| vocabulário fechado de componente | `harness policy --key components` | `["sentimento","charts","convergencia","backtest","web","docs"]` `[MEDIDO]` |
| runner de teste | `harness policy --key test_cmd` | **`{}`** `[MEDIDO]` — a lacuna que a fase `01` existe para fechar |

**A SPEC diz `DRAFT` no texto e o ledger diz `SPEC_APPROVED`.** O ledger manda (`CLAUDE.md`,
*"O ledger é a identidade do estado, não o texto do documento"*). O texto `DRAFT` dentro de
`docs/specs/SPEC-001-plataforma-dados.md` é resíduo do arquiteto e **não** é impedimento — mas
é uma divergência de leitura que vai custar tempo de alguém, e está listada em §7.

---

## 1. A ambiguidade `Tarefa` / `Task` — RESOLVIDA, com a evidência

O `harness.toml` deste repositório carrega a incerteza assim (linhas 88–92):

> ⚠️ **INCERTEZA HERDADA DO comparador-preco, ainda NÃO MEDIDA:** "Tarefa" é o `name` traduzido
> do tipo 10054, cujo `untranslated_name` é "Task". Qual literal a integração aceita em
> `jira_create_issue` só se mede criando uma issue real.

**A pergunta estava mal localizada, e é isso que a resolve.** A integração **não escolhe**: ela
repassa o literal verbatim. Três medições independentes, nenhuma delas escrevendo no tracker.

### 1.1 O que o projeto CST responde hoje

`jira_get_project_issue_types(CST)`, 2026-08-25 `[MEDIDO]`:

```
10052 Epic     (untranslated_name "Epic")     subtask=false
10053 Subtask  (untranslated_name "Subtask")  subtask=true
10054 Tarefa   (untranslated_name "Task")     subtask=false
10055 História (untranslated_name "Story")    subtask=false
10056 Feature  (untranslated_name "Feature")  subtask=false
10057 Bug      (untranslated_name "Bug")      subtask=false
```

Bate com o que a política registrou em 2026-08-22. **Nada derivou em três dias.**

### 1.2 O que o código da integração faz — e é decisivo

`mcp-atlassian`, `jira/issues.py`, na construção do payload de `create_issue`:

```python
actual_issue_id = None
if self._is_epic_issue_type(issue_type) and issue_type.lower() == "epic":
    actual_issue_id = self._find_epic_issue_type_id(project_key)      # resolve por ID
elif self._normalize_issue_type_name(issue_type) == "subtask":
    actual_issue_id = self._find_subtask_issue_type_id(project_key)   # resolve por ID
...
"issuetype": {"name": issue_type}
if actual_issue_id is None
else {"id": actual_issue_id, "name": issue_type},
```

**Para tudo que não é Epic nem Subtask, `actual_issue_id` permanece `None` e o literal vai cru
para `fields.issuetype.name`.** Nenhuma tradução, nenhuma busca, nenhum fallback.

Verificado nas **quatro** versões presentes no cache do `uv` — `0.21.1`, `0.22.1`, `0.23.0`,
`0.23.1` — com o mesmo trecho idêntico `[MEDIDO]`:

```
for v in ...; do grep -n '"issuetype": {"name": issue_type}' -A2 $v/jira/issues.py; done
# 0.21.1:629  0.22.1:664  0.23.0:664  0.23.1:664  — corpo idêntico nas quatro
```

⇒ **a resposta não depende de qual versão o `uv tool run` resolver.**

### 1.3 A prova de comportamento, que já existe e ninguém tinha olhado

O `harness.toml` afirmava que só criar uma issue real mediria isto. **Ela já foi criada — em
projeto irmão, no mesmo site, pela mesma integração.**

| evidência | valor | comando |
|---|---|---|
| política do vizinho | `child_kind = "Tarefa"` | `grep -n child_kind anything_monorepo/harness.toml` → linha **43** `[MEDIDO]` |
| issue real daquele projeto | `KAN-269`, `issue_type.name = "Tarefa"`, pai `KAN-267` (Epic), reporter `Stharley Maxwell`, criada **2026-07-27** | `jira_get_issue(KAN-269)` `[MEDIDO]` |
| universo | **15 de 15** issues KAN mais recentes que casam `[BACKEND]`/`[FRONTEND]` são do tipo `Tarefa` | `jira_search(project = KAN AND (summary ~ "BACKEND" OR summary ~ "FRONTEND"))`, `limit=15` `[MEDIDO]` |

Mesmo site (`conversationhub.atlassian.net`), mesmo servidor stdio, mesmo literal na política,
issues do tipo pretendido existindo. **⇒ `child_kind = "Tarefa"` está correto como escrito, e
agora é MEDIDO em vez de herdado.**

### 1.4 O resíduo, nomeado — e a rota que o elimina

**Resíduo real:** KAN e CST são projetos distintos com esquemas de tipo distintos (`Epic` é
`10001` lá, `10052` aqui). A localização do `name` é por conta, não por projeto, e as duas
reportam `Tarefa` — mas a criação em CST com esse literal é `[INFERRED: mesmo site, mesma
conta, mesmo literal, mesma integração]`, não `[MEDIDO]` em CST.

**A rota que remove o resíduo inteiro, sem sonda e sem lixo no board:** criar por **id**. Em
`issues.py`, `self._process_additional_fields(fields, kwargs_copy)` roda **depois** da
construção acima (linha `721` contra `664`), e para o campo `issuetype` o formatador cai no
ramo *"Default: return as-is"* — `schema.type == "issuetype"` não está em nenhum dos dois mapas
de handler (`fields.py`, `_format_field_value_for_write`) `[MEDIDO]`. ⇒ passar
`additional_fields = {"issuetype": {"id": "10054"}}` **sobrescreve** o dicionário por nome com
um por id.

**Recomendação:** materializar com `issue_type = "Tarefa"` **e** `additional_fields` fixando
`issuetype.id = "10054"`. A primeira satisfaz a política como escrita; a segunda torna a
criação independente de tradução. Se as duas discordarem, o id ganha — e id é identidade
estável, que é exatamente o motivo pelo qual a política registrou os ids ao lado dos nomes.

---

## 2. Convenção de título e de rótulo — o prefixo de trilha foi RECUSADO, com o argumento

A pergunta do briefing era: usar `[BACKEND]`/`[FRONTEND]` **se e somente se** o projeto CST
sustentar a convenção. **Medi. Não sustenta.**

| projeto | forma dos títulos | universo |
|---|---|---|
| **CST** | `F<n> · <título>` — `F5a · Governança gateante…`, `F0 · Captura irreversível…` | **7 de 7 Epics**; **0 de 7** com prefixo de trilha em colchete `[MEDIDO]` |
| **KAN** (`anything_monorepo`) | `[BACKEND]`/`[FRONTEND]` + rótulos minúsculos (`backend`, `frontend`, `spec-023`, `fase-1`) | **15 de 15** amostradas `[MEDIDO]` |

E há um segundo motivo, mais forte que o precedente: **`[BACKEND]`/`[FRONTEND]` seria um
segundo vocabulário, mais grosso, sobre um vocabulário fechado que já determina a trilha.**

```
sentimento · backtest  -> backend
charts     · web       -> frontend
docs                   -> nenhuma das duas
convergencia           -> backend (e tem ZERO tasks nesta feature — ver §4)
```

Dois vocabulários para o mesmo eixo derivam, e o validador do harness só confere um deles
(`components`, enum fechado). Adotar o prefixo de trilha criaria uma segunda verdade sobre a
mesma coisa — que é a classe de defeito que o `ADR-008`/DoD-3 desta própria SPEC existe para
impedir em outro lugar.

**Forma proposta:**

```
[<componente>] <fase> · <título>
```

Exemplos reais da decomposição:

```
[sentimento] 03 · Agregado de bucket q/nq do stream aggTrade  (CL-5, relógio)
[charts]     05 · Política de ausência por `nature` e carimbo de idade do FECHO
[docs]       01 · [test_cmd] declarado e o primeiro teste nascendo junto
```

O prefixo de componente satisfaz a regra da skill (casa o campo `components`, enum fechado); o
`<fase>` preserva a forma `F<n> · ` que os 7 Epics de CST já estabeleceram.

**Rótulos**, seguindo a convenção medida no vizinho:
`spec-001` · `fase-0N` · `<componente>` · `capture-or-lose` (só nas tasks de `02`/`03` cujo
custo é irreversível) · `bloqueada-qNN` (uma por pergunta que trava a task).

**Nota:** `jira_get_project_components(CST)` devolve **`[]`** `[MEDIDO]` — o projeto não tem
componentes nativos. O componente do harness **não** pode viajar no campo `components` do Jira
sem criá-los primeiro, o que é escrita. Por isso ele viaja no **título** e num **rótulo**.

---

## 3. Como cortei — as quatro regras

1. **Uma task = uma sessão de verificação encerrável.** Cada task tem entre 1 e 6 linhas de DoD
   do plano, e todas as linhas de uma task se conferem no mesmo movimento. Onde uma linha de DoD
   exigia comando e universo diferentes de suas vizinhas, ela virou task própria.
2. **UM componente por task, sempre — e onde o plano não conseguia declarar um, eu parti a
   task em duas.** Isto acontece uma vez, no item `2.5`, e está em §7/D-3.
3. **Nada de código de produção começa aqui.** O estado é `SPEC_APPROVED`, não
   `BUILD_AUTHORIZED`. Estas tasks são **descrição de trabalho**; o gate `build` é do owner e
   nenhuma delas o presume.
4. **Task bloqueada leva a marca com o número da pergunta, no título e no rótulo.** Task
   bloqueada sem marca é trabalho que ninguém pode começar e ninguém sabe por quê.

**Total: 82 tasks sobre 9 fases e 7 Epics.** Nenhum Epic novo. Nenhuma fronteira de valor
movida. Nenhuma unidade de valor criada.

---

## 4. Contagem — por Epic e por componente

### Por Epic

| Epic | fase | tasks | dos quais bloqueados |
|---|---|---|---|
| `CST-1` · F5a governança gateante | `01` | **4** | 2 (`Q16`) |
| `CST-2` · F0 captura irreversível | `02` + `03` | **17** | 9 (`Q1` ×8, `Q19` ×1) + 1 contingente (`Q17`) |
| `CST-3` · F1 contrato + fatia visível | `04` + `05` | **17** | 1 (`Q16`, o dono de `charts`) |
| `CST-4` · F2 semântica declarada | `06` | **10** | 0 |
| `CST-5` · F3 aquisição em regime | `07` | **14** | 1 (`Q3`) |
| `CST-6` · F4 superfície e reprodutibilidade | `08` | **14** | 2 (`Q11`, `Q10`) **+ 1 travado por número que falta** (`T-08.1`) |
| `CST-7` · F5b consolidação | `09` | **6** | 1 (`Q3`) |
| | | **82** | **16 + 1 contingente** |

### Por componente

| componente | tasks | onde |
|---|---|---|
| `sentimento` | **44** | `02` (4, **incluindo `T-02.4a`** — ver D-3) · `03` (12) · `04` (7) · `06` (9) · `07` (11) · `08` (1) |
| `charts` | **16** | `05` (7) · `08` (9) |
| `docs` | **12** | `01` (4) · `02` (1, `T-02.4b`) · `08` (1, o spike de motor) · `09` (6) |
| `web` | **9** | `05` (3) · `06` (1) · `07` (3) · `08` (2) |
| `backtest` | **1** | `08` (`run_registry`) |
| `convergencia` | **0** | — |

*4 + 44 + 16 + 12 + 9 + 1 + 0 — não: a soma por componente é `44 + 16 + 12 + 9 + 1 + 0 = 82`, e a
soma por Epic é `4 + 17 + 17 + 10 + 14 + 14 + 6 = 82`. **As duas fecham no mesmo número, e as duas
estão escritas para poderem ser conferidas** — este projeto já teve contagem de achados que não
reconciliava.*

**`convergencia` = 0 não é omissão, é escopo.** `SPEC-001` §13 põe a matriz de convergência,
os detectores e a regra de entrada **fora** desta fase, por declaração do owner. Registro o zero
explicitamente para que ninguém o leia como lacuna: o componente existe no vocabulário porque a
proposta o nomeia (Módulo C), e a feature `plataforma-dados` **não o toca**.

**`backtest` = 1 merece a mesma nota.** A única task de `backtest` é o `run_registry` (`T-08.4`),
e ela existe porque reprodutibilidade é requisito da **plataforma**, não do motor de estratégia.

---

## 5. A decomposição

Legenda: **🔒 Qnn** = bloqueada pela pergunta nn · **⏱** = custo de atraso irreversível
(capture-or-lose) · **⚠️** = risco ou lacuna declarada dentro da própria task ·
**△** = precede o que o plano lhe atribui como sucessor (ver §7).

### `01` — Governança gateante · `CST-1` · gate declarado no plano: **nenhum**

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-01.1` | `docs` | `[test_cmd]` declarado e o primeiro teste nascendo junto — `pytest`, piso de cobertura **por camada**, na forma medida no vizinho | `[GAP G2]`, `CA-F5-5`, `ADR-009`/D1, plano 1.1+1.8 | **D1.1** `harness policy --key test_cmd` deixa de devolver `{}` e o comando declarado roda verde · ≥ 1 teste, **e ele é um dos de `02`/`03`**. **D1.5** toda `[[rules.own]]` desta task nasce com corpus: `harness corpus verify` **e** `harness corpus mutate` | — |
| `T-01.2` 🔒 `Q16` | `docs` | Cobertura de `frontend/` fechada: `include_prefixes += frontend/src/` **e** globs TS/TSX **e** pack cujos `paths` casem o layout `frontend/src/{app,features,components}` | `CA-F5-4`, `ADR-009`/D3, plano 1.4+1.5 | **D1.3** `harness rules --mode file --path frontend/src/<violador>.tsx` **devolve BLOQUEIO** · 1 arquivo violando ≥ 2 regras por construção (`const x: any`, `console.log`). **D1.4** o **mesmo** comando devolvia **saída VAZIA, zero regras avaliadas** `[MEDIDO]` ⇒ passar exige que a saída **mude** | `T-01.1` |
| `T-01.3` 🔒 `Q16` | `docs` | `[agents.by_component]` ganha `charts` e `web`; fronteira `charts` ⇄ `web` traduzida em contrato `forbidden` de import por componente | `CA-F5-1`, `ADR-003`, `ADR-009`/D1, plano 1.2+1.3 | **D1.2** `harness policy --key agents.by_component` contém `charts` **e** `web` · 2 componentes. **D1.6** o contrato `forbidden` **reprova** um import de `charts` para `web` e vice-versa · **2 imports proibidos, 1 em cada direção** | `T-01.1` |
| `T-01.4` | `docs` | `.python-version` (3.13.13) removido da raiz, Python **3.12** declarado; **proposta** do componente `infra` levada ao owner com argumento e falsificador — **não decidida aqui** | `ADR-009`/D4+D5, plano 1.6+1.7 | `ls .python-version` → ausente; a versão declarada casa `^3.12` do vizinho. A proposta de `infra` existe como documento **e** aparece em `09` para registro nas duas direções (`T-09.4`) | — |

### `02` — Captura sem gate de host · `CST-2` · gate: **`Q1`**

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-02.1` 🔒 `Q1` ⏱ | `sentimento` | Coletor de **snapshot diário datado** de `exchangeInfo` + `fundingInfo`, com `market`, `underlyingSubType`, `interestRate` por símbolo e o conjunto de `premiumIndex` como **segunda testemunha**; hash sobre **projeção canônica** confirmado em duas leituras | `CA-F0-1`, `CA-F0-1b`, `CA-F0-7`, `CA-F0-11`, `SPEC` §3.4, plano 2.1+2.2 | **D2.1** `data(último snapshot) == hoje` por **7 dias consecutivos**. **D2.2** distribuição de `fundingIntervalHours` **difere** entre 2 snapshots ≥ 3 d apart · `{4h:432,8h:136,1h:2}` em 08-22 contra `{4h:433,8h:136,1h:1}` em 08-25; `TRADIFI_PERPETUAL` 170→175 `[MEDIDO]`. **D2.3** `exchangeInfo` × `premiumIndex` → **872 contra 875**, extras `EOSUSDT`/`FRONTUSDT`/`MATICUSDT`, e a divergência é **dado, não erro** `[MEDIDO]`. **D2.4** `fundingInfo` × `exchangeInfo` → **765 entradas, 20 COIN-M fora** `[MEDIDO]`. **D2.5** duas chamadas separadas por 3 ms ⇒ hash **igual** sobre 872 símbolos, onde hoje **872/872 payloads brutos diferem** `[MEDIDO]`. **D2.7** `ls -la data/snapshots/` → **1,16 MB/dia bruto, 54,6 KB gzip** `[MEDIDO]` | `T-01.1` |
| `T-02.2` 🔒 `Q1` (resíduo `Q4`) | `sentimento` | One-shot Coinalyze `daily` — OI (**≥ 2.400 pontos**, 1ª data ≤ 2020-01-21) e liquidação (**≥ 700 pontos**, 1ª data ≤ 2024-08-26) — **nascendo em quarentena**; broker de cota **CEGO**, contagem local conservadora | `CA-F0-13`, `CA-F3-9`, `avaliacao:A3`, `SPEC` §5.2, plano 2.3+2.4 | **D2.6** leitura de `backtest` sobre as duas séries devolve **ZERO linhas** · 2 séries × ≥ 1 símbolo. O broker: a resposta `200` da Coinalyze **não traz nenhum header de cota** `[MEDIDO]` ⇒ contagem local, nunca leitura de header. Custo declarado: **1.140 chamadas ≈ 28,5 min, uma vez** | `T-01.1` |
| `T-02.3` | `sentimento` | `md.ingest_run` / `md.ingest_gap` **persistidos** (nunca log), lidos pela **consulta nomeada** `ingest_health_query`; registro cru como **relatório de CLI com registrador nomeado em `stdout`** — nunca `print` | `CA-F0-6`, `ADR-008`/D1+D2+D3, plano 2.6+2.7 | **D2.9** matar o processo e reler ⇒ `md.ingest_run` + `md.ingest_gap` **persistidos**. `print` direto **bloqueado pela regra em vigor** `[MEDIDO]` — o custo da alternativa correta é **uma linha de registrador**. A definição de `ingest_health_query` é **única**: `ADR-008`/DoD-1, com `[[rules.own]]` acompanhada de corpus | `T-01.1` |
| `T-02.4a` | `sentimento` | Verificação de **`.CHECKSUM` na borda de ingestão** — rejeita truncamento antes de qualquer linha entrar | `[GAP G1]`, `SPEC` §5.8, plano 2.5 (metade executável) | **D2.8** corromper **um byte** e exigir rejeição · 1 arquivo. E **1 caso de `200` com corpo TRUNCADO**: `monthly/bookTicker` 2024-04 devolve **200 com 37,7 MB** contra 6,7 GB do mês anterior `[MEDIDO]` ⇒ modo de falha **pior que 404**, porque não levanta exceção | `T-01.1` |
| `T-02.4b` | `docs` | Política de backup com **teste de restauração**, declarando **por tabela** o que é re-derivável dos dumps | `[GAP G1]`, plano 2.5 (metade documental) | uma restauração executada, com o tempo medido; a tabela de re-derivabilidade cobre **todas** as tabelas de série, e o que **não** é re-derivável está nomeado (liquidação intraday, `nq`, `available_at` OBSERVED, `observer_region`) | `T-02.1` |

### `03` — Captura contínua · `CST-2` · gate: **`Q1` + `Q2`(respondida) + `Q19`** (+ `Q17` só para o spread)

**É a fase de maior custo de atraso do projeto inteiro.** `CL-1` liquidação intraday · `CL-2`
série efêmera · `CL-3` `exchangeInfo` datado · `CL-4` spread · **`CL-5` `nq`** · `available_at`
OBSERVED · o átomo de `interestRate`.

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-03.1` △ | `sentimento` | **Medir se o WS `<symbol>@aggTrade` carrega `nq`** — hoje `[NÃO MEDIDO]`; a medição existente é do REST | `ADR-001` (dependência), plano 3.6 | **D3.9** assinar `<symbol>@aggTrade` e inspecionar o payload · **1 símbolo, 1 mensagem**. **Gate: NENHUM.** Não captura nada, não consome cota material, não depende de `Q1`, `Q2` ou `Q19`. **Se o WS não trouxer `nq`, `T-03.4` muda de desenho** (passa a depender de REST, peso e janela de 48 h) — e o contrato `QF-1..QF-6` sobrevive | `T-01.1` |
| `T-03.2` 🔒 `Q1` ⏱ | `sentimento` | Coletor `!forceOrder@arr` (mercado inteiro), gravando **cru** com `received_at` + nome do stream + data do snapshot da doc + o rótulo **`semântica de subamostragem NÃO RESOLVIDA (latest\|largest)` na própria saída**, não só no payload | `CA-F0-2`, `SPEC` §5.10 + §8.5/5, plano 3.1 | grava cru, zero normalização. O rótulo sai **na saída de máquina** — rótulo em coluna de payload não chega ao consumidor que calcula percentil, e é consumidor de máquina que calcula percentil. Doc contraditória: página USDT-M diz `latest`, COIN-M diz `largest` `[DOC]`, divergência **não resolvida** | `T-01.1` |
| `T-03.3` 🔒 `Q1` ⏱ | `sentimento` | **Política de reconexão POR CLASSE de stream** (`ADR-004`): Classe B com sobreposição obrigatória, chave natural declarada, **taxa de colisão publicada** e **direção do viés escrita** | `ADR-004` (**gate de F0**), plano 3.2 | **D3.6** contagem de colisão por símbolo e por dia · **≥ 30 dias, ≥ 20 símbolos**, com a direção do viés escrita (colisão não resolvida ⇒ **subcontagem**). Alternativas fechadas no ADR: reconexão sem sobreposição produz buraco **irreversível** a cada 24 h; dedupe por hash do payload **subcontaria eventos reais sem registrar que subcontou** | `T-03.2` |
| `T-03.4` 🔒 `Q1` ⏱⚠️ | `sentimento` | **Agregado de bucket `q`/`nq` do stream `aggTrade`** — `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max`. **Não é captura de tick** | `ADR-001`/6, `SPEC` §1.4 (`CL-5`), plano 3.5 | **D3.5** detector de buraco é **contiguidade**, nunca taxa: deletar 1 linha do fixture ⇒ reprova; invariante `a[i+1] == a[i]+1` · **8.873.078 linhas, 0 saltos de `agg_id`** contra **11.327 descontinuidades de `f/l` (0,862%)** `[MEDIDO]`. **D3.7** `count(q≠nq)/n` e déficit em bp por símbolo e por dia · **≥ 7 dias × conjunto declarado**; base DOGEUSDT **16/1000, 80,56 bp**, BTC/ETH/SOL/XRP **0/1000** `[MEDIDO]`. **D3.8** leitura sob `quantity_field = nq` de janela anterior à 1ª captura ⇒ **`SEM_FONTE`**, nunca valor · 1 janela que atravesse a borda. **⏱ A task de maior prioridade de relógio do projeto:** `nq` existe numa janela deslizante de **48 h** (`GET /fapi/v1/aggTrades` em T-48h → **200 com `nq`**; em T-49h → **400 `-4166` "Search window is restricted to recent 2 days only"** `[MEDIDO]`) **e em nenhum histórico** (o dump tem **7 colunas** e `nq` não é uma delas `[MEDIDO]`). Custo do agregado: **ordem de 10² B/bucket, zero chamada nova** | `T-03.1` |
| `T-03.5` 🔒 `Q1` ⏱ | `sentimento` | Coletor `premiumIndex` — funding **estimado**, que **não tem endpoint de histórico em fonte nenhuma** | `CA-F0-1b`, plano 3.3 | a série existe a partir do dia em que o coletor liga e **não antes**; batch confirmado: `premiumIndex` sem `symbol` = **875 símbolos por peso 10** contra `REQUEST_WEIGHT 2400/min` `[MEDIDO]` | `T-01.1` |
| `T-03.6` 🔒 `Q19` ⏱ | `sentimento` | **`availability_probe` contínuo** com `availability_probe_set` **declarado** (símbolos, endpoints, período, resolução); e o **M-1** de `lag_ms` por endpoint (≈ 90 min de script) que o probe continua em regime | `CA-F0-9`, `CA-F0-3`, `Q19`, plano 3.4+3.9 | **D3.3** `5 × S × (60/período) ≤ 200 req/min`, e **`período ≥ 60 s` REPROVA** · **6 símbolos a 10 s** ou **20 a 30 s**; a 60 s a resolução é mais grossa que a dispersão medida (**99,6–200,8 s**). **D3.2** tabela de defasagem com **`p99` por `(endpoint, observer_region)`** e o **`n` ao lado**, mais `lag_stat`, `lag_n`, `lag_resolution_s`, `lag_window` **como colunas** · **≥ 5 endpoints**; hoje `n=2`, 1 símbolo, janela de 10 min, dispersão de **55%** `[MEDIDO]`. **D3.4** a razão `OBSERVED/total` é **exibida, não estimada** · todas as linhas da janela. **Restrição do conjunto candidato:** os endpoints da Coinalyze **têm de entrar** — é o terceiro termo da quarentena (`available_at IS NULL`) que mantém a Coinalyze isolada, e medir a defasagem dela é o único jeito de sair | `T-01.1` |
| `T-03.7` △ | `sentimento` | **Rampa até o primeiro 429** com recuo — a única forma de conhecer **dois** dos três baldes; e o registro de que **dois dos três são cegos** | `CA-F0-4`, plano 3.10 | **D3.11** rampa até o primeiro **429** com recuo · **2 baldes**: `/fapi/v1/*` e `/futures/data/*`. Hoje **2,85 vs 14,25 min/varredura, CONTESTADO e não testado**. **D3.12** `curl -sD -` em `/futures/data/openInterestHist` → **zero headers `x-mbx-*`**; em `/fapi/v1/depth` → `x-mbx-used-weight-1m` `[MEDIDO]`. **Gate: nenhum** — não captura dado. `SPEC` §9.2 declara esta medição **não diferível**: decide se S4 ao vivo existe e se o guard de `scope: CrossSection` vale | `T-01.1` |
| `T-03.8` 🔒 `Q1` | `sentimento` | NTP como dependência de runtime; monitor contra `/fapi/v1/time`; **skew persistido por `ingest_run`** (a tolerância se **calibra** em `07`, não aqui) | `CA-F0-8`, `[GAP G6]`, plano 3.7 | **D3.10** ler a distribuição acumulada · **≥ 7 dias de runs**. A tolerância **não é medível antes de o coletor rodar** — por isso `07` calibra e `03` só acumula | `T-01.1` |
| `T-03.9` 🔒 `Q1` ⚠️ | `sentimento` | `observer_id` e `observer_region` **ao lado de todo `available_at`**; tabela de defasagem chaveada por **`(endpoint, observer_region)`** | `CA-F0-10`, `[GAP G7]`, plano 3.8 | **⚠️ BLOQUEADA POR NÚMERO QUE FALTA, não por pergunta do owner.** A **região da VPS** é `[NÃO MEDIDO]`, obtém-se com **`curl -s ipinfo.io` de dentro da VPS**, e é **`observer_region`, coluna de F0, impossível retroativamente** (`SPEC` §9.2). `available_at` OBSERVED é propriedade de `(mercado, local do observador, caminho de rede)`. **Gravar F0 sem a região é gravar F0 errado, e não há correção posterior** | `T-03.2` |
| `T-03.10` | `sentimento` | Fila de ETL do dump **retomável**, com profundidade **declarada como parâmetro**; e `curl -sI` **mensal** em prefixo antigo **e** recente, para `aggTrades` **e** `bookDepth` | `CA-F0-5`, `SPEC` §5.8, plano 3.11+3.14 | **D3.1** **matar o processo no meio** e retomar sem duplicar nem perder · **≥ 100 arquivos**; custo declarado **0,86 s/arquivo (n=11)** `[MEDIDO]`. **`Q18` NÃO bloqueia** — ver §7/D-5: a profundidade é parâmetro da fila e o default é **30 dias**. O `curl -sI`: `bookDepth` **não tem prefixo `monthly`** ⇒ um ETL que assuma mensal **quebra** `[MEDIDO]` | `T-01.1` |
| `T-03.11` 🔒 `Q1` | `sentimento` | Reconciliação **diária** liquidação capturada × agregado Coinalyze, **com a ressalva na tela** | `CA-F0-14`, plano 3.12 | `Σ(liquidação capturada no dia)` contra o agregado `daily`; **1 chamada/dia/símbolo**. **Ressalva obrigatória, e ela é o ponto:** não se sabe se a Coinalyze constrói o agregado a partir do **mesmo** stream subamostrado — se sim, a razão tende a 1 e **não prova nada**; se não, mede a perda. As duas saídas informam em qual caso estamos, e a tela **diz qual** | `T-02.2`, `T-03.2` |
| `T-03.12` 🔒 `Q17` = (c) ⏱ | `sentimento` | **Contingente:** coletor de spread `GET /fapi/v1/depth?limit=5` a **1/min** | `CA-F0-12`, `SPEC` §8.1, plano 3.13 | **D3.13** `x-mbx-used-weight-1m` observado · **20 símbolos × 1/min = 40 de peso contra 2400 = 1,67%**; **295 B/chamada, peso 2** `[MEDIDO]`; ~3,1 GB/ano. **Esta task existe apenas se `Q17` = (c).** Se `Q17` = (b), ela **não é criada** e o spread vira **premissa nomeada, versionada e carimbada no resultado** — nunca constante dissolvida no número. `CL-4` não morre em nenhum dos dois casos: encolhe ~110× | `T-01.1` |

### `04` — Contrato temporal e identidade · `CST-3` · gate: **nenhum** · **zero rede, zero API key**

Todos os fixtures estão em `data/` (850 MB, `data/MANIFEST.md`). **Corre em paralelo com `03`.**

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-04.1` | `sentimento` | Shift canônico `event_time = create_time + 300000` aplicado **UMA vez às oito colunas**, gravando `src_label_raw` ao lado; **ordenação obrigatória do arquivo inteiro antes de emitir evento**; `md.ingest_gap` persistido | `SPEC` §2.2, `CA-F1-1`, `CA-F1-14`, `CA-F1-2`, plano 4.1+4.2+4.4 | **D4.1** carregar `BTCUSDT-metrics-2026-08-18.csv` (md5 `b8ef79c353f2adce853c68084cc3b631`), verificar monotonia; **bypassando o sort → REPROVA** · **13 de 30 dias fora de ordem**, 0 até 08-10 e **13/13** desde 08-11; deslocamento máx **275 posições em 288**, salto para trás de **1435 min** `[MEDIDO]`. **D4.2** carregar `2026-08-12` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`) → **285 linhas · 1 linha em `ingest_gap` com `n_missing=3` · 1 vão de 20 min · ZERO pontos interpolados**. **D4.3** primeiro carimbo de `met/2026-08-23.csv` → **`00:05:00Z`**, nunca `00:00:00Z`. **D4.10** o shift é validado por **regressão**, não por igualdade: `r = +0,5458` de `ln(taker_ratio)` com o retorno em `[T, T+5min)` contra **+0,0612** com o passado e **−0,0060** com futuro+1 (n=864/862/862) `[MEDIDO]` | `T-01.1` |
| `T-04.2` | `sentimento` | `SeriesKey` **completa** (15 termos, com `quantity_field` **e** `reduction`) + as **sete colunas de procedência em TODA linha** | `ADR-001`, `CA-F2-17`, `SPEC` §2.1+§3.1, plano 4.7+4.9 | **Falsificador global F-2:** duas séries com a **mesma** `SeriesKey` cujos `cvd_cum` divirjam ⇒ a chave está incompleta, e `SPEC` §1 é a prova de que ela **já estava** uma vez. **D4.9** reconciliação de tolerância **ZERO**: `metrics.sum_open_interest_value / metrics.sum_open_interest == markPriceKlines.close` do mesmo bucket → **exato a 8 casas, 288/288** em 2 dias de BTCUSDT; alts **282–286/288**, resíduo ≤ **4,34 bp** `[MEDIDO]` | `T-01.1` |
| `T-04.3` | `sentimento` | Unicidade por **`agg_id`** com verificação de contiguidade — **nunca** por tempo, **nunca** `first/last trade_id` | `CA-F1-5`, `CA-F1-6`, plano 4.3 | **D4.4** `0 saltos, 0 ts decrescente, 8.873.078 linhas`; o buraco de 08-22 aparece como **descontinuidade de `FLOW`, não costurada** (1.620.908 ausentes entre `agg_id` 3420055157 e 3421676065) `[MEDIDO]`. **D4.5** até **184 aggTrades no mesmo ms**, **25,6% dos ms com colisão** ⇒ unicidade por `agg_id` `[MEDIDO]` | `T-04.1` |
| `T-04.4` | `sentimento` | Acessor único `as_of(serie, symbol, t, asof_max_staleness_ms)` = **`argmin(observed_at)`** entre `available_at <= t`, com `LOCF` e **sem `interpolate`**; **R-1 ∧ R-2** com `bar_policy` declarado pelo consumidor; `knowledge_time` no caminho de leitura | `SPEC` §2.3+§2.5, `ADR-006`, `CA-F4-25`, plano 4.5+4.6+4.10 | **Falsificador global F-1.** **D4.6 fixture envenenada, TRÊS classes:** (a) `available_at` futuro ⇒ **bit-idêntico** ao dataset sem as linhas · (b) **bucket parcial** (`available_at <= t`, `bucket_end > t`) ⇒ sob `final_only` **bit-idêntico**, sob `intrabar` **TEM DE MUDAR** · (c) mesmo bucket em `q` e `nq` ⇒ leitura sob `nq` fora da janela ao vivo devolve **`SEM_FONTE`**. **A classe (b) existe porque o teste, como o PRD o escrevia, passava nos DOIS valores de `bar_policy`.** **D4.11** crosshair em bucket ausente de `cvd_delta` → **`—`**, nunca o valor anterior (`LOCF` sobre `FLOW` é **erro de tipo**). **D4.13** duas observações do mesmo bucket com `observed_at` diferentes ⇒ `as_of` devolve **`argmin`**, nunca a última. **D4.14** definir `render_max_staleness_ms` e omitir `asof_max_staleness_ms` ⇒ **a leitura de decisão REPROVA** (`ADR-006`/D3). **E o operador seguro é `>=`, não `<=`** — a regra é expressa por **qual lado do tempo o operador alcança**, nunca por literal proibido, porque lint sobre literal foi o que produziu a inversão | `T-04.2` |
| `T-04.5` | `sentimento` | `cvd_delta` por bucket como **fato**; `cvd_cum(anchor)` como **view com âncora obrigatória**; aritmética canônica em `Decimal` | `CA-F1-8`, `SPEC` §2.6, plano 4.8 | **D4.7** `cvd_cum` **sem** âncora ⇒ **erro**; âncoras 00:00/12:00/20:00 ⇒ **−1265,982 / +399,745 / +1598,508 BTC**, e **o título muda nas três** `[MEDIDO]`. **D4.8** `Decimal` sobre a string crua de `q`, soma ordenada por `agg_id`, bucket por `transact_time // 60000` · **o comando `awk` publicado REPROVA implementação correta** (`OFMT=%.6g` → erro de +4 mBTC) `[MEDIDO]` | `T-04.2` |
| `T-04.6` | `sentimento` | Serialização de numeral **invariante de locale** em todo caminho de dado | `SPEC` §3.8, plano 4.12 | **D4.12** exportar com `LANG=pt_BR.UTF-8` e `LANG=C` e comparar `sha256sum` · **iguais, ou reprova**. Isto é o que **tira de `Q14` (idioma) o poder de invalidar fixture** | `T-04.1` |
| `T-04.7` | `sentimento` | **`principal_id` como dimensão** em toda linha de ato humano — nunca constante implícita, nunca `NULL` | `SPEC` §4.4, `Q2` (respondida), plano 4.11 | verificado em `05` por **D5.10**: inserir `<Anotacao>` ⇒ `principal_id` **preenchido**. **Termo de chave, e termo de chave depois é migração** — por isso é `04` e não `05`. **`ADR-009`/D2 recusa `organization_id`**: chave com termo constante é chave que ensina errado | `T-04.2` |

### `05` — S2-mínima + auth mínima · `CST-3` · gate: **`Q16`** · **zero rede de mercado, zero API key**

**Honestidade sobre que valor é este:** a S2-mínima entrega valor **de verificação** — o owner
olha uma série contra o preço e afirma que ela significa o que ele pensa. **Não** entrega valor
operacional: não mostra o mercado agora (o painel de OI vem do dump com ~30,3 h de idade e cobre
4 dias **com um buraco**). As duas coisas se chamam "primeira tela" e não são a mesma.

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-05.1` 🔒 `Q16` | `charts` | **Grade canônica como UMA função, dona de `charts`** — o motor de backtest a **importa**, nunca a reimplementa | `ADR-003`/FR-3, plano 5.2 | **D5.9** comparar a saída da grade usada pelo gráfico com a usada pelo acessor · `sha256` da projeção canônica **igual** sobre **4 dias × 1 símbolo × 3 TFs**. Bloqueada por `Q16` porque **`charts` não tem dono de julgamento** e é esta task que torna `charts` componente e não pasta | `T-01.3`, `T-04.4` |
| `T-05.2` ⚠️ | `charts` | S2-mínima: 1 símbolo (BTCUSDT), 4 dias, painéis **Preço** + **OI** + **CVD delta e acumulado** | `CA-F1-16`, plano 5.1 | **D5.11** coordenadas X contra os `event_time` originais, tolerância **0,5 px**, com **carga menor**. **⚠️ `[NÃO MEDIDO]` — `SPEC` §9.2 declara o eixo do Lightweight Charts o MAIOR RISCO TÉCNICO desta especificação.** Ver §7/D-2: proponho que a medição de **carga cheia** (`T-08.2`) rode **antes** desta task, não depois | `T-05.1` |
| `T-05.3` | `charts` | O **selo** de quatro campos, **visível sem hover** — tooltip não conta; **içamento em três níveis** (sessão / painel / número) | `SPEC` §6.1, `CA-F4-14`, `ADR-005`/D3, plano 5.3+5.4 | o selo é lido **sem interação**. O içamento é o mecanismo de custo e é **contratual**: **519 B → 54 B, 9,6×** medido (1.733 KB contra 180 KB numa tela) `[MEDIDO]`. Envelope repetido por célula faz o mesmo `SeriesKey` ser afirmado **3.420 vezes por tela**, o que não é informação | `T-05.2` |
| `T-05.4` | `charts` | Política de ausência **por `nature`**; carimbo de idade **do FECHO**; linha-guia apontando **para trás** até a marca real | `SPEC` §5.11, plano 5.5 | **D5.1** crosshair no primeiro ponto de `met/2026-08-23.csv` → **`00:05:00Z`**. **Três dos quatro desenhos de UX imprimiram o rótulo cru** — é o defeito que a fase existe para impedir. **D5.2** crosshair em barra de 1 min **sem** ponto de OI → valor em tinta secundária + `de hh:mm:ssZ (−Xm)` + **linha-guia para trás**. **D5.3** crosshair em bucket ausente de `cvd_delta` → **`—`**. A cobertura de OI: 1m **20,0%** · 5m **100%** · 15m **100%** — e *"a 5m toda barra tem OI"* é **média, não garantia**: com 3 buckets ausentes em 8.640 medidos, algumas barras de 5m têm **zero** `[MEDIDO]` | `T-05.2` |
| `T-05.5` | `charts` | O painel de Preço declara **`price_source` E `price_use`** na linha do painel; marcação **amarrada** à série de preço | `ADR-007`/PS-1+PS-3, plano 5.7 | **D5.5** marcar sob `price_source = klines_last` e reabrir sob `mark_price` ⇒ a marcação **NÃO é reexibida como se fosse a mesma** (ou vem rotulada `marcada sobre outra série de preço`). Razão medida: a ordenação de highs vizinhos **inverte em 2,09%** e de lows em **5,57%** entre mark e last; o bucket que contém o high do dia é **diferente nas duas séries** (last 78057,60 às 20:05Z; mark 78017,83 às 20:10Z) `[MEDIDO]` ⇒ **a série escolhida decide ONDE O SWING ESTÁ** | `T-05.2` |
| `T-05.6` | `charts` | `pointer_mode ∈ {read, annotate}` declarado, com overlay reservado **acima do plot e abaixo do crosshair** | `SPEC` §3.6, plano 5.8 | o modo é **declarado**, não inferido do gesto. `<Anotacao>` + `pointer_mode` são requisito **hoje**, custo de campos num JSON — e é o que torna `Q11` uma decisão de **quantas horas**, não de arquitetura | `T-05.2` |
| `T-05.7` | `charts` | Cor como **token nomeado por papel**; **`critical` fora do canal de cor** | `CA-F4-10`, `SPEC` §6.2, plano 5.9 | **D5.6** `node scripts/validate_palette.js` · **4 papéis, 2 modos, TRÊS dicromacias**. ⚠️ **CORRIGIDO em 2026-08-25 sob [`ADR-010`](../../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) (aceita pelo owner) — esta célula é correção de CITAÇÃO numa narrativa JÁ APROVADA, e a premissa do `E-4` da ADR (*"absorve a correção antes de ser aprovada"*) caiu porque a aprovação veio primeiro.** O que entra no DoD é **só a invariante aritmética**, e o par que a prova mudou: **`#f23645 ↔ #eb6834` é FAIL em 5,3 (deutan)** contra piso 15 `[MEDIDO: 361 medições, exit 0]` ⇒ **não existe vermelho que conviva com um laranja de baixa**, logo **`critical` fora do canal de cor é consequência, não preferência**. Os números anteriores (**10,8**) **não reproduzem sob nenhum estimador declarado**. **A escolha entre convencional e divergente NÃO entra no DoD** — era `Q13`, **agora RESPONDIDA** (convenção ocidental), e trocar custa **4 valores de hue + 361 medições**, não 2 tokens. Ver §7/D-4 | `T-05.2` |
| `T-05.8` | `web` | `knowledge_time` **na URL**; o bundle **É** a URL, não um CRUD; `COMO EM T` sobrevive à navegação | `SPEC` §7, plano 5.6 | **D5.4** `COMO EM T` → navegar → voltar: `T` sobrevive aos **três** saltos. **Teste negativo obrigatório:** voltar para `AGORA` **não tem sintoma visível** ⇒ **reprova** | `T-04.4` |
| `T-05.9` | `web` | Transporte: **HTTP endereçável por conteúdo** para o histórico. **Nenhum tick chega ao browser** | `ADR-005`/D1, plano 5.12 | **D5.8** contar mensagens e inspecionar payload · taxa **≤ `max(1 Hz, 1/TF)`** por série e **zero campo de nível de tick** (`agg_id`, preço por trade, quantidade por trade). Razão: **3.468 msg/s de pico** num símbolo `[MEDIDO]`, e a tese declarada **não usa micro-tick** ⇒ o custo compraria capacidade que o produto não exerce | `T-04.4` |
| `T-05.10` | `web` | **Auth mínima, single-user, extensível** — primeira superfície servida de host exposto; e a **atribuição obrigatória** do Lightweight Charts | `SPEC` §8.3, `Q2`, `CA-F1-15`, `[GAP G4]`, plano 5.11+5.10 | **D5.7** inspecionar a página pública → notice do `NOTICE` + **TradingView** creditada com link. A auth: **não bloqueada** — `Q2` está `RESPONDIDA` (*"menor escopo possível de auth, considerando um único user… extensível sem grandes complicações"* `[PREMISSA-OWNER: 2026-08-25]`). **Esta é a task que `SPEC` §8.3 aponta como a que nenhum dos 7 Epics carregava** ⇒ ela acrescenta item a `CST-3`, **não cria Epic**. Se o owner disser que as rotas não serão publicadas, **esta task sai e `T-04.7` fica** | `T-05.8` |

### `06` — `series_catalog` + quarentena + S3 · `CST-4` · gate: **nenhum**

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-06.1` | `sentimento` | `series_catalog` como **contrato lido pelos testes**; `unit` e `denom` **obrigatórios, verbatim da fonte**; `native_grid` como propriedade da `source`, resolvida em runtime | `SPEC` §3.3, `CA-F2-2`, `CA-F2-11`, plano 6.1+6.5+6.15 | o teste **lê o catálogo**; catálogo e teste não podem divergir sem reprovar | `T-04.2` |
| `T-06.2` | `sentimento` | Tabela de shift **por endpoint**: `openInterestHist`, `topLongShortPositionRatio`, `topLongShortAccountRatio`, `globalLongShortAccountRatio` → dump = REST **−5 min**; **`takerlongshortRatio` → SEM shift** | `CA-F2-1`, plano 6.2 | conjuntos de timestamp idênticos **288 vs 288** e **MAE = 0,000000** contra `openInterestHist` `[MEDIDO]`. O `takerlongshortRatio` é a exceção e ela é **por endpoint**, nunca global | `T-06.1` |
| `T-06.3` | `sentimento` | As **QUATRO** séries de L/S com colunas próprias; **`ls_ratio` genérico PROIBIDO**; `buyVol`/`sellVol` persistidos do REST | `CA-F2-3`, `SPEC` §5.11, plano 6.3+6.10 | **D6.4** autocorrelação lag-1 · **0,9999 / 0,9999 / 0,9996** nas três de posicionamento e **0,0955** no taker, nos **4 símbolos**; ortogonalidade do taker **\|r\| < 0,10 em 12 de 12 pares** `[MEDIDO]`. **D6.5** pedir `delta()` no taker ⇒ **rejeitado pelo tipo**, não por convenção. **D6.6** pedir TF 15m na série taker ⇒ **recusa**; **nunca** devolve **3,1809** (a razão verdadeira de 15 min é **~0,9707**) `[MEDIDO]`. **A doc do repositório dizia TRÊS séries — está errada** | `T-06.1` |
| `T-06.4` | `sentimento` | `funding_settled` **≠** `funding_estimado`, séries distintas, com `interval_hours_declared` **por linha**; PK com **`source`** | `CA-F2-7`, `SPEC` §3.4, plano 6.4 | **D6.11** divisor = `funding_interval_hours × 3600000` **da própria linha** ⇒ **0 slots fora da grade em 16.979 liquidações**, resíduo em `[0,20] ms`, **nunca negativo**; a fórmula antiga erra **11.658 de 16.919 = 68,9%** `[MEDIDO]`. **D6.12** fixture `1000XECUSDT-fundingRate-2026-07.csv` → **321 linhas**, e dupla ingestão → **`count(*) = 321`**; trava a transição **8h→1h→4h** e o delta de **3,0 h**. **D6.16** `nextFundingTime % (h·3600000) == 0` → **570/570**, **com a data do snapshot ao lado do número** — `{4h:433, 8h:136, 1h:1}` em 2026-08-25. **4h é a regra (433 de 570), não 8h** | `T-06.1` |
| `T-06.5` | `sentimento` | **`reduction` na `SeriesKey`**: OI da Coinalyze = **4 linhas** (`OPEN/HIGH/LOW/CLOSE`, `OHLC_OVER_BUCKET`); Binance = **1** (`POINT`, `POINT_AT_BUCKET_END`) | `CA-F2-17`, plano 6.11 | **D6.7** pedir *"o OI da Coinalyze"* **sem** `reduction` ⇒ **erro**, nunca default silencioso. **D6.8** o `c` da Coinalyze casa o `sumOpenInterest` do mesmo `create_time` a **1,86 bp de mediana / 9,46 bp de p99, n=1.706** `[MEDIDO]` ⇒ o `t` dela é o **INÍCIO** do bucket; e `o(t) ≠ c(t−300)` (**6/2.141** iguais) ⇒ **4 linhas de catálogo, não 3**. **Sem este termo eram quatro séries com a mesma identidade** | `T-06.1` |
| `T-06.6` | `sentimento` | **Quarentena pelo predicado de TRÊS termos**, com a regra de **escrita**: endpoint sem `lag_ms` medido grava `available_at = NULL` + `MODELED`, e a série **nasce isolada** | `CA-F2-2`, `CA-F2-13`, `SPEC` §5.2, plano 6.12 | **D6.1** `count(gaveta) == count(catálogo WHERE label_shift IS NULL OR unit IS NULL OR available_at IS NULL)` **e** `count(painéis sincronizados ∩ quarentena) == 0` · todo o catálogo. **D6.2 — o falsificador da fase:** série com `label_shift` **e** `unit` PREENCHIDOS e `available_at` **NULL** ⇒ leitura de `backtest` devolve **ZERO linhas**, e a gaveta a conta · **≥ 1 série** (as da Coinalyze). **Se D6.2 devolver QUALQUER linha, um mecanismo de três termos que se abre quando dois passam não é um mecanismo de três termos.** **D6.3** ingerir linha ao vivo de endpoint sem `lag_ms` ⇒ grava `NULL`+`MODELED`; **nunca `event_time`, nunca `event_time + interval`** — o default é **361× otimista** `[MEDIDO]`. **A medição da Coinalyze resolveu `unit` e `label_shift` e NÃO resolveu `available_at`** ⇒ a quarentena **não se abre** aqui; abre com `Q19` | `T-06.1` |
| `T-06.7` | `sentimento` | **`ZL-1..ZL-3`: zero devolvido pelo fornecedor não é zero legítimo** — o ingestor converte zero-antes-do-primeiro-não-zero-**daquele-lado** em **`SEM_FONTE`** | `SPEC` §5.3, plano 6.13 | **D6.10** ingerir `/liquidation-history?interval=1min` ⇒ **361 buckets com `s = 0` literal** onde o `daily` reporta **289,65 / 154,53 / 4.547,61 BTC** `[MEDIDO]`. O teto de retenção é **POR LADO** e o merge preenche o lado faltante com **zero, não nulo**: **ausência devolvida como zero legítimo pelo fornecedor**. `CA-F3-10` tem de dizer que `pontos × intervalo` é **por lado** em série de evento. **Primeiro caso deste projeto em que a quarentena impediu número falso de chegar a decisão** | `T-06.6` |
| `T-06.8` | `sentimento` | Campo **aditivo** desconhecido → **quarentena + alarme**; campo **ausente/renomeado** → **reprova** | `CA-F2-12`, `SPEC` §5.5, plano 6.14 | **D6.14** acrescentar campo desconhecido ao fixture ⇒ **quarentena + alarme, nunca parada**. **Caso real: a Binance ADICIONOU `nq` ao `aggTrades`** — é exatamente esta classe de mudança, e é a que gerou `CL-5` | `T-06.6` |
| `T-06.9` | `sentimento` | As **quatro séries de preço** com `price_mark_close` declarado e **`implied_avg_price` PROIBIDO como nome**; `price_source` por `price_use` no catálogo; `fee_schedule` datada; `cvd_source` com **erro medido publicado por fonte** | `ADR-007`/PS-1+PS-2, `CA-F2-14`, `CA-F2-16`, `ADR-001`/5, plano 6.6+6.7+6.8+6.9 | **D6.9** tentar registrar `cvd_source` **sem** `(mediana, p99, n)` ⇒ **reprova**. `coinalyze_bv`: `(0,0000 bp · p99 29,34 · máx 1.955,80 · n=699 · 2026-08-24 · causa_da_cauda = NÃO DIAGNOSTICADA)`; hipótese maker **refutada a 2.584,87 bp** `[MEDIDO]`. **D6.13** resolver `fee_schedule` as-of a janela ⇒ **nenhum resultado de backtest sem `(maker_bps, taker_bps, effective_from, evidence_url)`**; `exchangeInfo` **NÃO tem** campo de taxa — a única é `liquidationFee` `[MEDIDO]`. `implied_avg_price` está proibido porque *"preço médio implícito"* **ensina errado**, e o catálogo é o veículo de propagação | `T-06.1` |
| `T-06.10` | `web` | **S3 · inspetor de série**: catálogo filtrável + linhas cruas com **`src_label_raw` AO LADO de `event_time` na mesma linha** | `SPEC` §6, plano 6.16 | **D6.15** abrir linhas cruas ⇒ `src_label_raw` **na mesma linha** que `event_time`, mais as lacunas de `md.ingest_gap` com `n_missing`. Responde *"o que este número é, e quais linhas exatas o produziram"*. **Não reconcilia automaticamente** — divergência é exibida **como divergência**, porque fonte que corrige antes de gravar **destrói a evidência de que havia o que corrigir** | `T-06.1`, `T-05.8` |

### `07` — Aquisição em regime + S1 + `universe_at` · `CST-5` · gate: **`Q3`** (`Q18` **não** — ver §7/D-5)

**Parte desta fase pode SUBIR de prioridade:** `T-07.1` é pré-requisito de **qualquer** backfill
grande, inclusive o de `03` (`T-03.10`).

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-07.1` △ | `sentimento` | **Paginador correto**: janela `[startTime, endTime]` **fechada e enumerada A PRIORI** — nunca por cursor; `-1130` como **fim de histórico**; listagem S3 por `NextContinuationToken` | `CA-F3-2`, `CA-F3-1`, `CA-F3-5`, `SPEC` §5.7, plano 7.1+7.2+7.4 | **D7.1** `startTime` de 60 dias atrás ⇒ `verdict='REJECTED'`, `api_code=-1130`, **zero linhas gravadas**. **D7.3** replay do caso `startTime` **sozinho** ⇒ **reprova, não grava** — medido: devolve **a cauda de hoje, HTTP 200, sem aviso**, comportamento **NÃO DOCUMENTADO** `[MEDIDO]`, então um loop `cursor += janela` nunca avança e grava dado de hoje com timestamp de semanas atrás. **D7.4** invariante permanente: **nenhum timestamp gravado fora da janela requisitada**. **D7.5** `limit=501` devolveu **501 linhas** contra doc de máx 500 ⇒ o teste usa o **observado** `[MEDIDO]`. **D7.8** falha se `IsTruncated=true` sem paginação · **980 prefixos contra `MaxKeys=1000` ⇒ folga de 20**, com **+28 símbolos em 30 d e +136 em 90 d** `[MEDIDO]`. **△ Deve preceder `T-03.10`** — ver §7/D-7 | `T-01.1` |
| `T-07.2` | `sentimento` | **Survivorship na borda de ingestão**: símbolo ausente do `exchangeInfo` corrente → `ACCEPTED_WITH_WARNING` + `md.ingest_gap`. **NUNCA `REJECTED`** | `CA-F3-14`, `SPEC` §5.6, plano 7.3 | **D7.2** ingerir dump de **`MATICUSDT`** (existe no S3, **não** existe no `exchangeInfo` de hoje) ⇒ **GRAVOU, com aviso**. **109 símbolos históricos são invisíveis hoje** `[MEDIDO]`; **21,6%** do universo cripto-perp com histórico não existe mais (727 → 570). **D7.6** backfill de um dia a 5m ⇒ **288 pontos distintos**; `2026-08-12` → **285 + gap registrado** | `T-07.1` |
| `T-07.3` | `sentimento` | ETL com dedupe por **hash de conteúdo** (byte-estável verificado) | `CA-F3-*`, plano 7.5 | dedupe por conteúdo, nunca por nome de arquivo nem por timestamp de download | `T-07.1` |
| `T-07.4` | `sentimento` | **Redis Streams + consumer group** para todo consumidor com estado — **nunca Pub/Sub** | `CA-F3-8`, `ADR-009`/D2, plano 7.6 | **D7.10** reiniciar o acumulador de CVD ⇒ **nenhuma mensagem perdida**. Razão: Redis Pub/Sub é **at-most-once por doc** (*"the message is forever lost"* `[DOC]`) e **um acumulador de soma acumulada não sobrevive a isso** | `T-01.1` |
| `T-07.5` | `sentimento` | **Escritor único** consumindo a fila; **backfill MODELADO não sobrescreve captura OBSERVADA** | `ADR-002`/D5, `CA-F3-12`, `CA-F4-25`, plano 7.7 | **D7.16** tentar sobrescrever ⇒ **proibido**. `ReplacingMergeTree(ingested_at)` ou equivalente **destrói o `available_at` real e apaga a variante `nq` de linhas ao vivo, sempre na direção otimista**. A lógica de ler-antes-de-escrever vive **no escritor único da aplicação**, não no motor — e isso vale nos **cinco** candidatos de `ADR-002` | `T-07.4` |
| `T-07.6` | `sentimento` | Particionamento dimensionado contra a **vazão medida** | `CA-F3-7`, plano 7.8 | **D7.11** vazão de **um único** símbolo · p50 **21** · p95 **204** · p99 **483** · p99.9 **1.251** · máx **3.224** msg/s `[MEDIDO]` | `T-07.5` |
| `T-07.7` | `sentimento` | Broker de cota com **jitter e circuit breaker**, contagem **local** — dois dos três baldes são **cegos** | `CA-F3-9`, plano 7.9 | contagem local conservadora **não é adaptação a um fornecedor pior — é o caso geral**: `/futures/data/openInterestHist` devolve `200` com **zero headers `x-mbx-*`**, exatamente como a Coinalyze `[MEDIDO]`, e `avaliacao:A3` foi **reproduzido** | `T-03.7` |
| `T-07.8` | `sentimento` | `universe_at(ts, filtro)` com **`universe_source` inadmissível POR TIPO** no caminho de decisão, devolvendo a **união das duas testemunhas** com a divergência marcada | `CA-F3-4`, `SPEC` §3.7, plano 7.10 | **D7.7** `universe_at('2025-08-01')` ⇒ **inclui `ICXUSDT`** e **exclui `DOSUSDT`** (onboard 2026-08-11) `[MEDIDO]`. `s3_inferred` é **inadmissível por tipo**, não por convenção — sem isso, todo resultado transversal do passado é retrospectivo por construção | `T-02.1`, `T-07.2` |
| `T-07.9` | `sentimento` | `instrument_alias` como **YAML versionado com `evidence_url` obrigatório** — **sem tela** | `Q12`, plano 7.11 | o **mecanismo** não é bloqueado; **o CONTEÚDO é `Q12`** e são **~5 linhas por ano**. `MATICUSDT→POLUSDT` e `RNDRUSDT→RENDERUSDT` **não foram deslistados, foram renomeados**, e a API **não expõe a continuidade** `[MEDIDO]`. Terceira testemunha: **`MATICUSDT` não está na Coinalyze** e `ICXUSDT` está ⇒ **nenhuma fonte deste projeto é rota de fuga para o survivorship** | `T-07.8` |
| `T-07.10` | `sentimento` | **`clock_skew_tolerance_ms` CALIBRADO** sobre a distribuição que `03` acumulou | `CA-F3-13`, plano 7.12 | **D7.18** ler a distribuição de `clock_skew_ms` por `ingest_run` · **≥ 7 dias de runs**. Calibrado, **não adivinhado** — e por isso depende de `T-03.8` ter rodado 7 dias | `T-03.8` |
| `T-07.11` 🔒 `Q3` | `sentimento` | Detector de liveness por **contiguidade + heartbeat, nunca taxa**; e o **canal de alarme fora do browser** | `[GAP G5]`, `Q3`, plano — DoD `D7.9` | **D7.9** matar o stream ⇒ detectado por `agg_id` + heartbeat. **O detector NÃO está bloqueado e já está fixado**: a média variou **3,66×** entre dois dias (55,6 vs 15,2 msg/s) e **o pico não escala com o volume** (3.468 msg/s num dia com 43% menos trades) `[MEDIDO]` ⇒ **alarme por taxa é impossível**. **🔒 O que `Q3` bloqueia é só o TRANSPORTE da notificação** — push, e-mail, Telegram, e para qual endereço. Sem canal externo, `Q1`, `Q4` e `Q19` **morrem em silêncio** e a perda é permanente | `T-03.4` |
| `T-07.12` | `web` | **S1 console**: `janela_de_perda` como **FÓRMULA por série**, fila de ETL, orçamento aritmético, GB/dia; reconexão como **rotina**; retenção anticorrelacionada **escrita** | `SPEC` §6, plano 7.13 | **D7.12** `janela_de_perda` é **fórmula, não constante**: Coinalyze `pontos × intervalo` — OI 1 min **2.206 pts ≈ 1,5 d** · OI 5 min **~2.000 ≈ 7,0 d** · liquidação 1 min **3.052 ≈ 8 d** · `daily` **sem apagamento `[DOC-ONLY]`** · `/futures/data/*` **30 d** · liquidação intraday por stream **imediata** · dump S3 **`re-baixável (retenção NÃO MEDIDA)`**, nunca "infinito". **D7.13** a escolha do trilho vai **escrita**: trilhar 5 min em vez de 1 min multiplica o orçamento do SLO P1 por **~4,7**. **D7.14** a série de liquidação escreve **`janela válida no regime atual, não garantida em cascata`** — nunca um número seco: a série é **esparsa**, logo a janela **encolhe durante uma cascata**, o único regime em que ela importa. **D7.15** desconexão de 24 h aparece como **rotina, não erro**. **S1 NÃO é o canal de alarme** — tela fechada não avisa ninguém | `T-02.3`, `T-05.8` |
| `T-07.13` | `web` | S1 lê pela **consulta nomeada `ingest_health_query`** — a **mesma** de `02` | `ADR-008`/D3+DoD-3, plano 7.14 | **D7.17 — o falsificador da fase.** `sha256` da projeção canônica da saída do CLI **igual** à que alimenta S1, **e um `verdict` INÉDITO** ⇒ **os dois consumidores mudam juntos ou os dois reprovam** · **≥ 1 run de cada `verdict`, mais 1 valor inédito**. **Se um passar e o outro não, existem duas implementações da mesma verdade** — e é o único teste que expõe duplicação silenciosa | `T-02.3`, `T-07.12` |
| `T-07.14` | `web` | **S5 embutido** (não é tela): seletor por `universe_at`, badge de delisting de `deliveryDate`, `universe_source` **carimbado em toda saída** | `SPEC` §6, plano 7.15 | o seletor de símbolo **não existe** fora de `universe_at`. Caso-âncora preservado: `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` com `deliveryDate = 2026-08-26T09:00:00Z` `[MEDIDO]` | `T-07.8` |

### `08` — Motor, S4, S2 completa, `run_registry` · `CST-6` · gate: **`Q10`, `Q11`, `Q13`**

**Mandato, literal: entregue a distribuição; o limiar é parâmetro.** A proposta original pedia
screener com coluna booleana; a tela **inverte** isso, e a razão está medida: *"spike de OI > 5%
em 15m"* dispara **ZERO vezes em 8.631 janelas de BTCUSDT** (p99 = 0,7495%, máx 2,4017%) e **27
vezes em 2.013 janelas de COTIUSDT** no campo notional `[MEDIDO]`. **Limiar absoluto é um filtro
"não-BTC" disfarçado de sinal.**

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-08.1` ⚠️ | `docs` | **Spike do motor de armazenamento**, com os **5 critérios declarados ANTES** de rodar | `ADR-002`/D4, `CA-F4-24`, plano 8.1 | **D8.21** os cinco: **espaço ≤ 2× o zipado da fonte** (30 d × 4 símbolos) · **varredura de 30 d × 4 símbolos com `as_of` ≤ 60 s** · **fixture envenenada (3 classes) passa por comportamento, bit-idêntico** · **vizinhança: `free -m` e `df -h` MEDIDOS e o candidato cabe com folga declarada** · **latência de rede medida** (candidato 5). **⚠️ BLOQUEADA POR TRÊS NÚMEROS QUE FALTAM, e a task tem de nomeá-los:** `free -m` (`[NÃO MEDIDO]`) · `df -h` (`[NÃO MEDIDO]`) · **a região da VPS** (`curl -s ipinfo.io`, `[NÃO MEDIDO]`). **A região não é só critério de spike — é `observer_region`, coluna de F0, impossível retroativamente** ⇒ é a mesma lacuna de `T-03.9`, e ela vence **antes** de `08`. Finalistas: **(4) TimescaleDB na instância `postgres:15` já de pé** × **(5) Parquet no R2 já provisionado + DuckDB `httpfs`**. ClickHouse **eliminado** como 7º container | `T-01.1` |
| `T-08.2` ⚠️△ | `charts` | **Spike do eixo do Lightweight Charts com CARGA CHEIA** | `SPEC` §9.2, plano — DoD `D8.19` | **D8.19** coordenadas X contra `event_time` · **288 pontos + 1.440 candles no mesmo eixo, tolerância 0,5 px**. **⚠️ `[NÃO MEDIDO]` — declarado o MAIOR RISCO TÉCNICO desta especificação.** **△ Proponho que rode ANTES de `T-05.2`, não depois** — custa uma página estática com 1.728 pontos sintéticos, zero rede, zero API key, zero dependência das outras fases, e **16 tasks de `charts` são construídas sobre a premissa que ela testa**. Ver §7/D-2 | `T-01.1` |
| `T-08.3` | `sentimento` | Regra de **compactação × `knowledge_time`**: `compaction_epoch` por partição | `ADR-002`/D6, plano 8.2 | **D8.10** compactar uma partição ⇒ `compaction_epoch` **incrementa**, `knowledge_time` **inalterado**, e o sistema **distingue as duas causas de hash novo**. Sem isso, **a garantia de reprodutibilidade se perde pela porta da manutenção, em silêncio** | `T-07.5`, `T-08.1` |
| `T-08.4` | `backtest` | `run_registry` com `bundle_hash`, `window`, **`knowledge_time`**, hash de conteúdo das partições, **`intrabar_convention` E `intrabar_decided_count`** | `CA-F4-25`, `SPEC` §3.5, plano 8.3 | **Falsificador global F-4.** **D8.9** (1) roda `scan`; (2) ingere **observação atrasada de bucket DENTRO da janela já avaliada**; (3) roda de novo com **o mesmo** bundle e janela ⇒ **idêntico, OU o sistema RECUSA apontando divergência de `knowledge_time`**. Nunca número diferente em silêncio sob o mesmo `bundle_hash`. **`intrabar_decided_count` existe porque a convenção pessimista não é neutra**: assumir o stop primeiro enviesa **para baixo**, e numa estratégia de borda fina **1,56% de barras sistematicamente pessimistas pode virar lucro marginal em prejuízo, sem como saber se o culpado é a estratégia ou a convenção** ⇒ a influência tem de ser **medível em vez de embutida** | `T-04.4`, `T-08.1` |
| `T-08.5` | `web` | Bundle de parâmetros **versionado e hasheável — que É a URL, não um CRUD**; **nenhum eixo tem default** | `SPEC` §7, plano 8.4 | **D8.3** carregar a tela **sem `ThresholdSpec` na URL** ⇒ **ZERO números derivados**. `field`, `H`, `mode`, `direction`, `op` são **explícitos**. **Não implementa gerenciador de presets** — produto prematuro; sobrevive o bundle hasheável | `T-05.8` |
| `T-08.6` 🔒 `Q10` | `charts` | **S4 bancada**: `distribution` / `scan` / `firing_rate`, histograma, **bordas de bin por `(field, nature)`** com **bin de overflow contado** | `SPEC` §6, plano 8.5 | **D8.1** `scan` com `Absolute{5.0}` sobre BTC/30d ⇒ **0 linhas**, e `distribution` mostra **`max = 2,4017`**, conferido por **DOIS caminhos independentes** (view vs recontagem sobre a tabela crua), **não pela mesma tabela duas vezes**. **D8.6** 11 bordas propostas (teto 50%) no taker ⇒ **951 de 2013 (47,2%)** caem fora à direita, **máx 2055,3%** `[MEDIDO]` ⇒ bordas são atributo do `(field, nature)`. **D8.7** distribuição de funding: **`p90 = p99` = o mesmo número**, e `>` vs `>=` muda o disparo de **9/1500 para 184/1500 (20×)**; o histograma **marca a massa pontual** em `interestRate` — `0.0001` em **665** símbolos, **`0` em 208**, `0.00005` em 2 `[MEDIDO]`. **🔒 `Q10` decide qual superfície ganha teclado, densidade e atalhos aprendidos** (as outras são otimizadas para reconhecimento, não recall) | `T-08.2`, `T-08.5` |
| `T-08.7` | `charts` | **Anti-overfit**: `min_obs` devolve **ausência**; `n_obs` efetivo **POR PONTO**; dispersão do z como **telemetria obrigatória**; métrica transversal carrega **`n` e o universo derivado do dado** | `SPEC` §6, plano 8.5 (metade estatística) | **D8.4** célula com `n_obs < min_obs` ⇒ **`—`**, nunca um número. **É o vetor de overfit deste projeto, e há caso concreto:** `rolling(2016, min_periods=576)` **nunca preencheu a janela nos alts** — BTC rodou rolling verdadeiro, os alts rodaram **expanding**, e **a conclusão publicada caiu por isso** `[MEDIDO]`. **D8.5** dispersão cross-símbolo · **≥ 4 símbolos**; dispersão anômala é a assinatura de **janelas de tamanhos diferentes com o mesmo rótulo**. **D8.8** funding de BTCUSDT: o `72,2` publicado **não reproduz sob nenhum universo** — 69,47 / 70,97 / 75,07 / 76,00 / 76,38 `[MEDIDO]` | `T-08.6` |
| `T-08.8` | `charts` | `firing_rate` in-sample **declarado tautológico na própria célula**; OOS walk-forward | `SPEC` §6, plano 8.5 (metade de honestidade) | **D8.2** forçar `eval == calib` ⇒ a célula lê **`tautológico — janelas idênticas`**, nunca `1,04%`. OOS walk-forward (calibra 7 d, avalia o seguinte, n=23): média **1,404%**, **máx 12,847% = 12,8× o alvo**; com q=99,9, **52×** `[MEDIDO]` | `T-08.6` |
| `T-08.9` 🔒 `Q11` | `charts` | **S2 completa**: as-of com **moldura impossível de não notar**, **marcação de fixture com teclado obrigatório**, painéis restantes | `SPEC` §6, plano 8.6 | **🔒 `Q11` decide se o MODO de marcação fica nesta fase.** Se a resposta for *"não vou marcar"*, **o modo sai do escopo e a fase seguinte precisa de outro plano de verificação — que não existe hoje**. Teclado é obrigatório porque é trabalho de sessão longa e repetitiva. **E a primeira tranche de horas do owner deve ser marcação de SWING** — o único trabalho de marcação que sobrevive a **qualquer** resposta de `Q20`, logo não é desperdiçado em nenhum cenário. É serial com `Q8` (fixture marcada antes do fuso é fixture remarcada) e com `price_source` (a ordenação de highs vizinhos **inverte em 2,09%**) | `T-05.2`, `T-08.5` |
| `T-08.10` | `charts` | Primitivo **`swing_point`** em `<Anotacao>` — **zero algoritmo, zero limiar, zero "nível"** | `SPEC` §3.6, `Q20`, plano 8.7 | **`Q20` NÃO bloqueia esta task, e isso é o achado que a torna barata.** Os dois vocabulários se apoiam no **mesmo primitivo**: pivô = definição de swing · âncora de Fibonacci = par de swings · BOS/CHoCH = rompimento de swing · BSL/SSL = extremo de swing. **Fixada a definição de swing, os níveis de Fibonacci são aritmética pura, sem parâmetro novo.** ⇒ `swing_point` é o primitivo sob **qualquer** resposta; `zone` (OB/FVG/Fib) **depende** de `Q20` e **não** entra aqui | `T-05.6` |
| `T-08.11` | `web` | Transporte ao vivo por **SSE com envelope de bucket** | `ADR-005`/D1+D2, plano 8.8 | envelope de **bucket**, nunca tick. SSE e não WS bidirecional: **não há mensagem do browser para o servidor nesta fase** — as superfícies são de leitura e marcação, e marcação é HTTP com corpo; canal bidirecional é superfície de ataque sem consumidor. E **não polling**: a cadência honesta é a do **fechamento do bucket**, que o servidor conhece e o cliente não | `T-05.9` |
| `T-08.12` | `charts` | Regras de **renderização de painel**: habilitação por múltiplo da grade, colisão de discos com downsample declarado, `is_final = false` **visível**, **nunca dois eixos Y no mesmo painel** | `SPEC` §6, plano 8.5/8.9 | **D8.11** TF=60m no painel de OI ⇒ **719/720 fechos com ponto**, painel **habilitado**; cobertura 1m **20,0%** · 5m/15m **100%** · 60m **99,9%** · 240m **99,4%** · 1440m **100%** `[MEDIDO]`. **D8.12** janela de 24 h ⇒ `min(gap_px) > 0` com **`2r + 2 <= espaçamento_px`**; acima de **~8,33 h em 1200 px** o painel **declara o downsample no título** — aritmética: 1200 px / 24 h = **4,167 px**, disco r=4 com anel de 2 px = 12 px ⇒ **65% de sobreposição**. **D8.13** `is_final = false` **visível**: aos 4 min de um bucket de 5 min o high definitivo é conhecido em **77,4%**, low **78,8%**, ambos **56,6%**, e **90,0% do range já aconteceu** ⇒ `h`/`l`/`c` do bucket corrente **NUNCA** são lidos como finais. **D8.14** OI em `base_contracts` **ou** `notional_usd`, toggle — **nunca eixo duplo**: `p99\|Δ15m\|` do taker é **824,6%** contra **0,75%** do OI ⇒ o gráfico **inventaria uma correlação que não está no dado** | `T-08.2`, `T-08.6` |
| `T-08.13` | `charts` | **Honestidade de leitura**: idade só na borda direita, invariante de ordem **por série**, `denom` **verbatim**, **zero seleção é informação**, S4 **declara-se retrospectiva** | `SPEC` §6, `ADR-006`/D4, plano 8.5 | **D8.15** `viewport_fim < agora − cadência_nativa` ⇒ chip de idade **substituído** pelo rótulo absoluto da janela. **D8.16** `limiar_atraso <= asof_max_staleness_ms` ⇒ o teste **falha exibindo os dois números DA SÉRIE SOB TESTE** — nunca uma constante global. **D8.18** `baseAsset` com prefixo numérico ⇒ `denom` **verbatim**, ou `contratos (multiplicador não resolvido)`, **e S4 recusa comparação cross-símbolo naquela linha**. **D8.20** `scan` com 0 linhas ⇒ **nenhum nudge para baixar o limiar** — a tela não empurra o owner na direção de mais disparos num instrumento que gasta capital dele. **D8.17** escrito na própria tela: `[NÃO SUSTENTADO hoje]` varredura transversal ao vivo — 570 × 5 séries = **2,85 min/varredura se por endpoint, 14,25 se compartilhado** | `T-08.6`, `T-03.7` |
| `T-08.14` | `charts` | **Grade canônica versionada junto com o dado derivado** | `ADR-003`/FR-3, plano 8.9 | a versão da grade viaja com o dado que ela produziu; mudar a grade **não** reinterpreta silenciosamente dado antigo | `T-05.1`, `T-08.4` |

### `09` — Consolidação de fronteira · `CST-7` · gate: **nenhum** (exceto `T-09.5`)

| id | componente | título | cobre | DoD (comando · universo) | dep |
|---|---|---|---|---|---|
| `T-09.1` | `docs` | Os **nove ADRs** desta rodada numerados, referenciados pelas fases, **cada um com falsificador**; varredura de `04`–`08` por decisão de fronteira sem ADR | `CA-F5-2`, plano 9.1+9.2 | **D9.1** varrer `docs/plans/SPEC-001-plataforma-dados/*.md` por `ADR-` e conferir contra `ls docs/adr/` · **9 ADRs, zero referência órfã**. **D9.2** `grep -c "^## Falsificador" docs/adr/*.md` · **≥ 1 por arquivo** — **ADR sem falsificador é justificativa, não decisão registrada** | `T-08.14` |
| `T-09.2` | `docs` | `env ∈ {mainnet, testnet, demo, replay}` em **toda** linha de ordem/fill, com chip no chrome desde a primeira tela que exibir fill | `CA-F5-3`, plano 9.3 | **D9.3** teste que **rejeita linha de ordem/fill sem `env`** · **≥ 1 caso negativo** | `T-04.2` |
| `T-09.3` | `docs` | Registro consolidado de `ADR-004` (a **decisão** é gate de `03`; o **registro** é aqui) + registro do **finalista do motor** com os números que o spike de `08` produziu | `ADR-004`, `ADR-002`/D4, plano 9.4+9.5 | **D9.4** ler `ADR-002` atualizado · **`free -m`, `df -h`, região, e os 5 critérios do spike — todos com valor**. Registrado **com números medidos, não com preferência** | `T-03.3`, `T-08.1` |
| `T-09.4` | `docs` | Decisão sobre o componente `infra` **registrada — adotada ou recusada, com o motivo escrito** | `ADR-009`/D5, plano 9.6 | **D9.6** adotado **ou** recusado, **com o motivo** — **nunca ausente**. Alterar vocabulário fechado em política versionada é **ato do owner**; a task registra a decisão dele nas duas direções possíveis | `T-01.4`, `T-02.4a` |
| `T-09.5` 🔒 `Q3` | `docs` | Runbook de **uma página** para *"coletor parado"*, e a declaração de **quem é notificado em segundo lugar** | `[GAP G5]`, plano 9.7 | **D9.5** ler o runbook · **1 página**, com o passo que **reduz a perda**, e **o segundo destinatário nomeado** — **ou a aceitação explícita e escrita do risco**. Operação de um só com SLO P1 de **24 h** | `T-07.11` |
| `T-09.6` | `docs` | `docs/INDEX.md` atualizado, **append-only** | — | acrescenta linha; **não reescreve linha existente** | `T-09.1` |

---

## 6. O que está bloqueado, e por qual pergunta

### Hard block — a task não pode começar

| pergunta | estado na fonte única | tasks travadas | por que a espera custa |
|---|---|---|---|
| **`Q1`** autoriza ligar os coletores hoje | `ABERTA` · relógio **SIM, capture-or-lose** | `T-02.1`, `T-02.2`, `T-03.2`, `T-03.3`, `T-03.4`, `T-03.5`, `T-03.8`, `T-03.11` — **8 tasks** | **É o único item do registro cujo custo de atraso não tem mitigação de engenharia.** ~1 dia perdido por dia. E `CL-5` (`nq`) **aumentou** esse custo depois da SPEC: `nq` vive numa janela de **48 h** e em nenhum histórico ⇒ a cada dia sem `T-03.4`, um dia de `nq` deixa de existir para sempre |
| **`Q19`** `availability_probe_set` | `ABERTA` · relógio **SIM** | `T-03.6` — **1 task** | **decide quais séries têm defasagem real PARA SEMPRE.** Latência de campo não é derivável retroativamente, e o que ficar fora é **MODELED permanentemente para o período em que ficou fora**. É também **o terceiro termo que mantém a Coinalyze em quarentena** (`T-06.6`/D6.2) |
| **`Q16`** dono de `charts`/`web` + regra em `frontend/` | `ABERTA` · relógio **NÃO (de dado)** | `T-01.2`, `T-01.3`, `T-05.1` — **3 tasks** | relógio de **retrabalho**: antes do primeiro `.tsx`. Descobrir depois de 3.000 linhas de Next.js é o cenário caro. **E ver §7/D-1: como o plano está escrito, esta pergunta sem relógio senta a montante da única fase com relógio irreversível** |
| **`Q3`** canal de alarme fora do browser | `ABERTA` · relógio **SIM (condicional)** | `T-07.11` (metade do transporte), `T-09.5` — **2 tasks** | não perde dado por si; **é o que impede os outros de perderem.** Sem canal externo, `Q1`, `Q4` e `Q19` **morrem em silêncio** e a perda é permanente. Tela fechada não avisa ninguém |
| **`Q11`** owner marca o corpus, quantas horas | `ABERTA` · relógio **NÃO** | `T-08.9` — **1 task** | se a resposta for *"não vou marcar"*, **a fase seguinte perde o único plano de verificação que tem** e não existe outro hoje. Serial com `Q8` e com `price_source` |
| **`Q10`** ordem monitorar/pesquisar/executar | `ABERTA` · relógio **NÃO** | `T-08.6` — **1 task** (bloqueio parcial: decide teclado e densidade, não a existência) | **F1 entrega "pesquisar" e é a única construível hoje.** *"Monitorar"* ficou construível para 1h e 4h depois do direcionamento operacional, mesmo com a topologia do balde sem teste |

**Total hard-blocked: 16 tasks de 82 (19,5%).** Contagem: 8 + 1 + 3 + 2 + 1 + 1.

### Contingente — a task só existe se a resposta for uma das opções

| pergunta | task | condição |
|---|---|---|
| **`Q17`** spread: medir ou assumir | `T-03.12` | **existe se e somente se `Q17` = (c)** (`depth?limit=5` a 1/min). Se `Q17` = (b), a task **não é criada** e o spread vira premissa nomeada, versionada e carimbada. **`CL-4` não morre em nenhum dos dois casos** — encolhe ~110× |

### Bloqueio parcial — o mecanismo anda, o conteúdo espera

| pergunta | task | o que anda / o que espera |
|---|---|---|
| **`Q12`** alias `MATIC→POL`, `RNDR→RENDER` | `T-07.9` | **anda:** o YAML versionado com `evidence_url` obrigatório · **espera:** as ~5 linhas/ano de conteúdo. É decisão de **significado econômico**, não técnica |
| **`Q4`** Coinalyze (resíduo: free / pago / descartar) | `T-02.2` | **anda:** o one-shot `daily` e a quarentena · **espera:** só o plano. Resíduo **sem relógio** no `daily` |
| **`Q13`** cor do candle | `T-05.7` | **RESPONDIDA em 2026-08-25** (convenção ocidental; [`ADR-010`](../../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md)). **Andava tudo** e continua: o token por papel e a invariante de contraste são mecanismo. Custo de trocar corrigido: **4 valores de hue + 361 medições**, não 2 tokens. Ver §7/D-4 |

### NÃO bloqueiam nada, e é deliberado

| pergunta | por que não bloqueia |
|---|---|
| **`Q18`** profundidade do backfill | **é parâmetro da fila retomável, não gate.** `4,1 h` (30 d) contra `297 h` (2.183 d) sequenciais; começar por 30 e estender **não é retrabalho**. Ver §7/D-5 |
| **`Q20`** SMC × pivôs+Fibonacci | **nada em F0–F4.** Decide o vocabulário de **zona** da fase **seguinte**. `T-08.10` entrega `swing_point`, que sobrevive a qualquer resposta |
| **`Q5`** universo · **`Q6`** TradFi · **`Q8`** fuso · **`Q14`** idioma | universo é **filtro na leitura**, não na captura (`!forceOrder@arr` cobre mercado inteiro). `Q6` e `Q8` e `Q14` são `INFERÍVEL` com `[INFERRED]` registrado, e as três revertem **sem migração de dado**. `T-04.6` (numeral invariante de locale) é o que **tira de `Q14` o poder de invalidar fixture** |
| **`Q7`** Bybit | se *"não"*, `bybit-v5` é enum com **zero linhas**. `md.instrument` cross-venue e unidade normalizada na borda são requisito **de qualquer jeito** — e agora com **três** namespaces em jogo (Binance, Bybit, Coinalyze `BTCUSDT_PERP.A`) |
| **`Q2`** onde roda / quem acessa | **`RESPONDIDA`.** `T-05.10` (auth mínima) e `T-04.7` (`principal_id`) estão **liberadas** |

### ⚠️ E uma que não bloqueia task nenhuma — e é exatamente por isso que eu a levanto

**`Q15` (ToS de Binance, Bybit e Coinalyze) · `ABERTA` · `[MEDIDO]: nada` — ninguém leu os três
ToS, zero evidência.** Nenhuma das 82 tasks está tecnicamente travada por ela. **A restrição
incide RETROATIVAMENTE sobre exatamente o que `Q1` manda acumular.**

⇒ **Aprovar `Q1` sem `Q15` acumula, com pressa deliberada e irreversível, dado cujos termos de
redistribuição nenhuma pessoa deste projeto leu.** A `SPEC` §9 chama isso de *"tensão real com
`Q1`"* e não a esconde; eu não tenho como resolvê-la e não vou fingir que a decomposição a
dissolve. **É a única linha deste documento em que a recomendação técnica é "aprove `Q1` hoje" e
a recomendação de risco é "leia `Q15` antes".**

### E três bloqueios que NÃO são pergunta do owner — são número que falta

| task | número | como obter | consequência de não ter |
|---|---|---|---|
| `T-03.9` | **região da VPS** | `curl -s ipinfo.io` de dentro da VPS | **`observer_region` é coluna de F0, impossível retroativamente.** Gravar F0 sem ela é gravar F0 errado, sem correção posterior |
| `T-08.1` | **RAM livre** | `free -m` de dentro da VPS | separa *"cabe um daemon"* de *"não cabe"* — teto no falsificador de `ADR-002` |
| `T-08.1` | **disco livre** | `df -h` de dentro da VPS | decide se **qualquer byte de série** pode morar local. A VPS roda **6 serviços** e está **sob pressão de disco documentada** (`KAN-86`, passo *"liberar disco"*) |

**Os três se obtêm com três comandos numa sessão de SSH.** A região é a que tem relógio: ela
vence junto com `Q1`, não com `08`.

---

## 7. Onde eu discordo — da SPEC, do plano, ou deste briefing

Aplicar por obediência o que se acha errado é como a inversão de `ASOF` entrou no PRD. **Oito,
com o argumento. Nenhuma aplicada unilateralmente.**

### D-1 · A fase `01` declara *"Gate: nenhum"* e três dos seus oito itens SÃO `Q16` — e isso põe a pergunta sem relógio a montante da fase com o pior relógio

**Onde:** `01_governanca_gateante.md`, cabeçalho (*"Gate: nenhum"*) contra os itens `1.2`, `1.3`,
`1.4`, cuja coluna `requisito` cita `Q16` explicitamente.

**O argumento.** `Q16` oferece ao owner **duas** respostas: fechar a lacuna, **ou** *"re-declarar
a lacuna explicitamente"*. E `D1.3`/`D1.4` foram escritos — corretamente, e o plano diz que foi
de propósito — para que **re-declarar a lacuna REPROVE**:

> ⚠️ *"`D1.3` é o critério que o `CA-F5-4` original não tinha. Como estava escrito,
> re-declarar a lacuna com a contagem de arquivos era desfecho aceito ⇒ o critério passava com o
> enforcement inalterado."*

⇒ **`01` não fecha sem `Q16` respondida na direção que fecha.** *"Gate: nenhum"* é subestimação,
não erro de fato — mas a consequência é estrutural: o grafo do plano é `01 ─> 02` **e**
`01 ─> 03`, e `03` é a única fase cujo custo de atraso é irreversível. **Uma pergunta que a
própria fonte única marca `RELÓGIO: NÃO` fica sentada a montante de `CL-1`..`CL-5`.**

**O que eu proponho, e é edge de dependência, não fronteira de Epic.** As quatro tasks
continuam em `CST-1`. Muda o que precede o quê:

```
como o plano está:   01 (inteira, com Q16) ──> 02 ──┐
                                             03 ──┴──> 04 ──> 05

como eu proponho:    T-01.1 (runner, gate NENHUM) ──> 02, 03, 04
                     T-01.2 + T-01.3 (Q16) ─────────> 05   (antes do primeiro .tsx)
                     T-01.4 ──────────────────────── independente
```

**A justificativa está no próprio `D1.1`:** *"≥ 1 teste, **e ele é um dos de `02`/`03`**"*. O que
`02` e `03` precisam de `01` é o **runner** — e o runner não depende de `Q16`. O que depende de
`Q16` é cobertura de `frontend/` e dono de `charts`/`web`, e o relógio de **retrabalho** de `Q16`
está declarado como *"antes do primeiro `.tsx`"*, que é `05`, não `02`.

**Não realinhei nada.** Isto é proposta; o grafo publicado continua sendo o do `index.md` até o
owner decidir.

### D-2 · O maior risco técnico da SPEC está agendado DEPOIS das duas fases que o assumem

**Onde:** `D8.19` (eixo do Lightweight Charts, **288 pontos + 1.440 candles, tolerância 0,5 px**)
vive na fase `08`. `D5.11` mede o mesmo eixo com **carga menor** na fase `05`. E `SPEC` §9.2
classifica esse número como *"o maior risco técnico desta especificação"*, `[NÃO MEDIDO]`.

**O argumento.** `05` e `08` somam **16 tasks de `charts`** construídas sobre a premissa de que o
eixo aguenta a carga. A medição de carga cheia custa **uma página estática com 1.728 pontos
sintéticos**: zero rede, zero API key, zero dado real, zero dependência de qualquer outra fase.

**Agendar o falsificador de um componente depois do componente não é preferência de ordem — é
defeito de plano.** É exatamente o argumento que a fase `01` usa para si mesma (*"sem runner, a
fase cujo dado não se recaptura termina com afirmação não conferível"*), aplicado ao mesmo tipo de
lacuna: **sem a medição do eixo, as duas fases de `charts` terminam construídas sobre premissa.**

**O que eu proponho:** `T-08.2` executa **antes de `T-05.2`**. Se o owner quiser que a
contabilidade acompanhe a ordem, `T-08.2` migra de `CST-6` para `CST-1` pelo mesmo critério que
pôs o runner lá — **e isso muda a atribuição de um Epic, então é decisão dele, não minha.** Deixei
a task em `CST-6` e marquei `△`.

### D-3 · O item `2.5` carrega `[COMPONENTE-ALVO FORÇADO]` — e isso é o falsificador `F-3` disparando, anotado pelo próprio plano

**Onde:** `02_captura_sem_gate_de_host.md`, item `2.5`:
`docs` **`[COMPONENTE-ALVO FORÇADO: candidato a infra]`**.

E `SPEC` §12, falsificador **F-3**: *"um item de plano que não consiga declarar UM componente do
vocabulário fechado"* derruba §4.1 e `ADR-003`.

**O argumento.** O plano **anotou o sintoma e não tratou como falsificação.** Ou `F-3` disparou —
e então `ADR-003` tem um problema — ou o item é dois itens colados. **É a segunda.** `2.5` mistura
duas coisas de natureza diferente:

- **verificação de `.CHECKSUM` na borda de ingestão** é **código executável no caminho de
  escrita**. Isso não é `docs` sob nenhuma leitura de `ADR-003`;
- **política de backup com teste de restauração** é documento e procedimento. Isso é `docs`.

⇒ **parti em `T-02.4a` (`sentimento`) e `T-02.4b` (`docs`), e cada uma declara UM componente
honestamente.** A anotação `[COMPONENTE-ALVO FORÇADO]` **desaparece sem tocar o vocabulário
fechado e sem esperar a decisão de `infra`**.

**O que isso preserva:** `F-3` volta a ser um falsificador que nunca disparou, em vez de um que
disparou e foi anotado. E `T-09.4` continua registrando a decisão de `infra` nas duas direções —
o argumento pró-`infra` **não** dependia deste item.

### D-4 · `DESIGN_SYSTEM.md` decidiu `Q13`, e `Q13` continua `ABERTA` na fonte única

**Onde:** `docs/product/DESIGN_SYSTEM.md` (2026-08-25) fixa o par de direção
`#2a78d6 ↔ #eb6834` com medição — protan ΔE **24,7** / deutan **26,8** **PASS**, contra **7,2** /
**8,6** **WARN** do verde/vermelho clássico. `docs/decisoes-do-owner.md`, que se declara **fonte
única de numeração e de estado**, lista `Q13` como **`ABERTA`**.

**Dois documentos discordam sobre se uma decisão do owner já foi tomada.** E `docs/product/` é
declarado *"design vivo, não artefato numerado"* — fonte **volátil**, pelo próprio `INDEX.md`.

**O argumento, e ele separa o que é medição do que é preferência.** A aritmética de contraste
**não** é preferência e **sobrevive a qualquer resposta de `Q13`**: `#d03b3b ↔ #eb6834` é **FAIL**
em ΔE **10,8** contra piso **15** ⇒ se a vela de baixa fosse laranja **e** o crítico vermelho, os
dois seriam indistinguíveis para protanope, logo **`critical` fora do canal de cor é
consequência**. Isso entra no DoD de `T-05.7`.

**A escolha entre convencional e divergente é do owner e NÃO entra em DoD nenhum.** Congelar num
DoD o que uma fonte volátil decidiu sobre uma pergunta aberta faria a task reprovar quando o
design mudar — e o design **está mudando agora**.

⇒ **`T-05.7` não está bloqueada**, seu DoD cita **só** a invariante, e eu peço ao owner que
**reconcilie o estado de `Q13` na fonte única** — ou marcando `RESPONDIDA` (e então o
`DESIGN_SYSTEM` a respondeu), ou marcando que o `DESIGN_SYSTEM` antecipou uma decisão que ainda é
dele. Hoje as duas leituras são defensáveis, e isso é o problema.

### D-5 · `Q18` está listada como gate de `07`, e a fonte única a dissolve explicitamente

**Onde:** `index.md`, fase `07`, coluna `gate`: `Q3, Q18`. E `07_aquisicao_em_regime.md`:
*"Gate: `Q3`, `Q18`"*.

**Contra `decisoes-do-owner.md`, `Q18`(d), literal:**

> **(d) RELÓGIO: NÃO.** *Requisito que torna a resposta tardia barata: a fila é retomável e a
> profundidade é PARÂMETRO dela* ⇒ começar por 30 dias e estender depois **não é retrabalho**, é a
> mesma fila com outro limite.

⇒ **`Q18` não é gate. É um default.** Listá-la como gate cria um bloqueio que o documento de
origem existe para dissolver, e bloqueio falso custa a mesma coisa que bloqueio verdadeiro:
alguém para de trabalhar.

**Como decompus:** `T-03.10` e `T-07.1` **não** carregam marca de bloqueio; nascem com
`profundidade = 30 dias` como **default declarado** e o parâmetro documentado. `Q18` sai da lista
de bloqueios e vira nota de configuração.

### D-6 · O `index.md` tem um defeito de tabela na linha `07` — a célula do Epic não existe

**Medido.** A tabela *"As nove fases"* tem **5 colunas** (`#`, `fase`, `componente predominante`,
`Epic`, `gate`). As linhas `01`–`06` e `08`–`09` têm 5 células. A linha `07` tem **4**:

```
| [`07`](07_aquisicao_em_regime.md) | Aquisição em regime + S1 + `universe_at` | `sentimento` / `web` | `Q3`, `Q18` |
```

⇒ **`Q3, Q18` está renderizando na coluna `Epic`, e `CST-5` não aparece na tabela.** O valor
correto está dentro de `07_aquisicao_em_regime.md` (*"Epic: `CST-5` (F3)"*), então **nada se
perdeu** — mas quem ler só o índice conclui que a fase `07` não tem Epic. Correção: uma célula.
**Não a apliquei** — o plano é artefato do arquiteto e eu não reescrevo o documento dele; está
aqui para ser corrigido por quem o assina.

### D-7 · `03` afirma *"Independe de `02`"*, e uma das suas tasks depende de `02`

**Onde:** `03_captura_continua.md`: *"**Independe de `02`** — as duas metades correm em
paralelo"*. E o item `3.12` é *"Reconciliação diária liquidação capturada × **agregado
Coinalyze**"* (`CA-F0-14`) — o agregado Coinalyze é entregue pelo item `2.3`, na fase `02`.

**A afirmação é verdadeira para 11 das 12 tasks e falsa para uma.** Não contesto a frase no nível
de fase; **declarei a dependência no nível de task**: `T-03.11` depende de `T-02.2`. É pequeno e é
o tipo de coisa que, não escrita, faz alguém pegar `T-03.11` primeiro e travar.

**Do mesmo tipo, na direção oposta:** `T-07.1` (paginador correto) é declarado pelo próprio plano
como *"pré-requisito de **qualquer** backfill grande, **inclusive o de `03`**"* — ou seja, uma
task de `07` precede uma task de `03` (`T-03.10`). Marquei `△` nas duas e escrevi a aresta.

### D-8 · Sobre este briefing: concordo com *"`01` gateia `02`"* e a formulação está incompleta

O briefing diz: *"A fase `01` gateia a `02`, e não o contrário"*. **Concordo com a direção.** A
formulação incompleta é *"a `02`"*: o grafo do plano é `01 ─> 02` **e** `01 ─> 03`, e o
`03_captura_continua.md` declara *"Depende de: `01` (runner)"*.

**Por que a diferença importa:** `02` é o snapshot diário e o one-shot — perder um dia custa um
dia de universo, e o dia 1 já existe como captura manual. **`03` é onde vivem `CL-1`..`CL-5`.**
Dizer *"`01` gateia `02`"* subdimensiona o custo, porque a fase caríssima é a outra. É exatamente
o que a proposta de **D-1** ataca: fazer só `T-01.1` preceder `03`.

E sobre *"Não crie task de código de produção que o pipeline ainda não autoriza"* — **concordo
integralmente e cumpri.** As 82 tasks são **descrição** de trabalho. Nenhuma foi iniciada, nenhum
arquivo de `backend/` ou `frontend/` existe, e `harness pipeline state` continua
`SPEC_APPROVED`. O gate `build` é do owner.

### E onde eu NÃO discordo, apesar do convite

**A divergência 9 fases / 7 Epics está certa, e o argumento do `index.md` se sustenta nos dois
cortes.**

- **`CST-2` partido em `02`/`03` pela fronteira do gate por coletor.** Verifiquei o fato que
  carrega o argumento: o snapshot é `GET` + `gzip` (**1,16 MB/dia bruto, 54,6 KB gzip**
  `[MEDIDO]`) e o one-shot são **1.140 chamadas ≈ 28,5 min, uma vez** — nenhum dos dois precisa de
  host 24/7, logo nenhum precisa de `Q2`. Fatiar em outro lugar reintroduziria o gate de fase que
  R1 removeu de propósito. **Concordo, e a decomposição preserva o corte:** `02` tem 5 tasks com
  gate `Q1` só; `03` tem 12 com `Q1` + `Q19`.
- **`CST-3` partido em `04`/`05` por contrato offline × primeira superfície exposta.** `04` roda
  com **zero rede e zero API key** sobre 850 MB em `data/`; `05` é uma página Next servida da VPS
  com Caddy/TLS público. **Duas classes de risco, dois DoD.** Concordo — e a decomposição mostra
  por que o corte é útil: as 7 tasks de `04` não têm bloqueio nenhum, as de `05` carregam `Q16` e
  auth.
- **E a reconciliação de `SPEC` §8.2 está certa: o sétimo Epic é a partição de F5, não auth.**
  Confirmei contra o tracker: `CST-1` é `F5a · Governança gateante` e `CST-7` é `F5b ·
  Consolidação de fronteira` `[MEDIDO]`. Auth entra como **`T-05.10` dentro de `CST-3`**,
  exatamente como `SPEC` §8.3 manda, **e não como Epic**.

---

## 8. O que vem depois da aprovação — mecânico, e nesta ordem

1. **Materializar as 82 tasks** em `CST` como filhas dos Epics `CST-1`..`CST-7`.
   `parent_kind = Epic` (já existentes, **nenhum criado**) · `child_kind = "Tarefa"`, com
   `additional_fields.issuetype.id = "10054"` pela razão de §1.4 · título na forma
   `[<componente>] <fase> · <título>` · rótulos `spec-001`, `fase-0N`, `<componente>`,
   `capture-or-lose` e `bloqueada-qNN`.
   **`T-03.12` só é criada se `Q17` = (c).**
2. **Gerar `docs/context/plataforma-dados/tasks.toml`** — o dado de máquina. Schema conferido no
   plugin (`tasks.toml` de referência, `harness-plugin` 0.12.0):
   ```toml
   schema_version = "1"
   feature = "plataforma-dados"          # a chave é ESTE campo, não o nome do diretório
   spec   = "docs/specs/SPEC-001-plataforma-dados.md"
   plan   = "docs/plans/SPEC-001-plataforma-dados"
   review = "docs/context/plataforma-dados/tasks_review.md"

   [[tasks]]
   id = "T-03.4"
   title = "[sentimento] 03 · Agregado de bucket q/nq do stream aggTrade (CL-5)"
   components = ["sentimento"]           # LISTA, e o prefixo do título acompanha
   status = "todo"
   phase = "03"
   depends_on = ["T-03.1"]               # o grafo é LOCAL ao arquivo
   refs = ["ADR-001/6", "SPEC-001 §1.4", "plano fase 03 item 3.5"]
   tracker = { provider = "jira", id = "CST-NN" }   # INLINE — sub-tabela engoliria as chaves seguintes
   ```
   **Cardou ⇒ `tracker` preenchido. O owner decidir não cardar ⇒ `local_only = true` +
   `local_reason` com data e motivo. Esquecer de sincronizar ⇒ SEM marcação, e dito no handoff.**
   As três são estados diferentes e não vão colapsar neste arquivo.
3. **Emitir `docs/context/plataforma-dados/handoff_to_builder.md`.**
4. **Acrescentar UMA linha a `docs/INDEX.md`** — append-only, sem reescrever linha existente.
5. **Auto-cobrança:** `harness tasks validate plataforma-dados`. Hoje devolve
   *"nenhum `tasks.toml` declara a feature"* `[MEDIDO]`, que é o esperado antes do passo 2. O gate
   `advance plataforma-dados TASKS_APPROVED` **exige** esse arquivo válido.
6. **Declarar o escopo de caminhos** — é o que o portão de escrita usa para decidir 1 / 0 /
   colisão. Proposto, **não executado** (é ato pós-aprovação):
   ```
   harness pipeline scope plataforma-dados add backend/src/ frontend/src/ \
       docs/specs/ docs/plans/ docs/adr/ docs/context/plataforma-dados/ \
       data/MANIFEST.md harness.toml
   ```
   **`harness.toml` está na lista de propósito:** `T-01.1`..`T-01.4` o editam, e escopo que não
   inclui o arquivo que a fase `01` inteira modifica é escopo que não protege nada. **`data/` fora
   da lista** — é gitignored, 850 MB, dado de terceiro re-obtenível.

---

## 9. Nada foi tocado

| superfície | antes | depois |
|---|---|---|
| ledger | `SPEC_APPROVED` | **`SPEC_APPROVED`** — nenhum `advance`, nenhum `approve` |
| Jira `CST` | 7 issues (`CST-1`..`CST-7`, todas `Epic`) | **7 issues.** Nada criado, editado ou comentado. Todas as chamadas foram de leitura |
| `harness.toml` | — | **intocado.** Vocabulário fechado inalterado; alterá-lo é ato do owner |
| `docs/INDEX.md` | 37 linhas | **+1 linha, append-only.** Nenhuma linha existente reescrita |
| escopo de caminhos | não declarado | **não declarado** — proposto em §8.6, executado pós-aprovação |
| código de produção | não existe | **não existe.** `SPEC_APPROVED` ≠ `BUILD_AUTHORIZED` |

**Arquivos lidos nesta sessão:** `harness.toml` · `CLAUDE.md` ·
`docs/specs/SPEC-001-plataforma-dados.md` · `docs/plans/SPEC-001-plataforma-dados/` (`index.md` +
`01`..`09`) · `docs/adr/ADR-001..009` ·
`docs/context/plataforma-dados/handoff_to_architect.md` (§9, §10) · `docs/decisoes-do-owner.md` ·
`docs/premissas-de-infra-e-stack.md` · `docs/INDEX.md` ·
`comparador-preco/harness.toml` · `anything_monorepo/harness.toml` ·
`mcp_atlassian/jira/issues.py` e `jira/fields.py` (4 versões).
**Chamadas de tracker, todas de leitura:** `jira_get_project_issue_types(CST)` ·
`jira_search(project = CST)` · `jira_get_create_fields(CST, 10054)` ·
`jira_get_project_components(CST)` · `jira_search(project = KAN, …)` · `jira_get_issue(KAN-269)`.

**`harness doctor` CONFORME não é evidência de nada acima.**
