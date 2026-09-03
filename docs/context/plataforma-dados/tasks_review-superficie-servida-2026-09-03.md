# Narrativa de review — as tasks da superfície servida, 2026-09-03

**Estado:** ⏳ **AGUARDANDO APROVAÇÃO DO OWNER.** Nenhuma task foi criada — nem em
`tasks.toml`, nem no Jira. Este arquivo é a narrativa e o racional; o dado de máquina
(`tasks.toml`) só nasce depois do aval.

**Escopo do ato:** decompor os itens `5.13`–`5.17` da fase `05`, o item `1.13` da fase `01`
(`A6`), e a antecipação da `T-09.4`/`CST-86` que já existe `todo`.

---

## 0 · Gate de entrada — o que eu medi antes de decompor

| o que | comando | resultado |
|---|---|---|
| estado do pipeline | `harness pipeline state plataforma-dados` | **`BUILD_AUTHORIZED`** `[MEDIDO 2026-09-03]` |
| plano existe | `ls docs/plans/SPEC-001-plataforma-dados/` | **10 arquivos** (`index.md` + 9 fases) `[MEDIDO]` |
| vocabulário fechado | `harness policy --key components` | **6**: `sentimento charts convergencia backtest web docs` `[MEDIDO]` |
| tracker | `harness policy --key tracker` | `kind = "jira"`, `project = CST`, `parent_kind = "Epic"`, `child_kind = "Tarefa"` `[MEDIDO]` |
| integração do tracker | `jira_get_issue CST-86` | **UP** — `CST-86` existe, tipo `Tarefa`, status *Tarefas pendentes*, labels `docs`/`fase-09`/`spec-001` `[MEDIDO]` |
| Epics de destino | `project = CST AND issuetype = Epic` | **7 de 7 presentes** — `CST-1` (F5a=fase `01`), `CST-3` (F1=fase `05`), `CST-7` (F5b=fase `09`) `[MEDIDO]` |
| baseline do validador | `harness tasks validate plataforma-dados` | **`OK — 85 task(s), 0 ERROR, 4 WARN`** `[MEDIDO]` |

**⚠️ O gate declarado do meu papel é `SPEC_APPROVED`, e o estado é `BUILD_AUTHORIZED`.** Isto
**não** é gate furado: `BUILD_AUTHORIZED` é posterior a `SPEC_APPROVED` no ledger, e acrescentar
task a uma feature já autorizada **não exige transição de estado**. Registro aqui porque um leitor
que compare o estado com o gate do meu papel encontraria uma divergência aparente, e divergência
aparente não explicada é a que faz o próximo leitor parar de olhar.

**As 4 `WARN` do baseline são pré-existentes e todas de `V-09`/`blocked_reason`** (`T-02.4b`,
`T-03.9`, `T-05.10`, `T-07.11`). **Consequência para esta quebra, e ela é dura:** `blocked_reason`
**não** está no enum de chaves conhecidas (`id, title, components, status, depends_on, refs, phase,
local_only, local_reason, tracker`) ⇒ **nenhuma task nova usa `blocked_reason`**, senão o arquivo
sai com 5 WARN e eu teria piorado uma métrica que já estava explicada.

**Propriedade que tem de sobreviver — zero deleção, e ela sobrevive porque eu não toco nos planos:**

```bash
git diff --numstat -- docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md \
  docs/adr/ADR-009-*.md docs/adr/ADR-005-*.md docs/decisoes-do-owner.md
# 171 0 · 119 0 · 198 0 · 278 0   [MEDIDO 2026-09-03]
```

**Nenhuma task `done` é reaberta por esta quebra.** Todas as 9 tasks abaixo são novas ou já `todo`.

---

## 1 · A ORDEM, e a medição que a torna obrigatória — eu achei um SEGUNDO sítio de `V-16`

O despacho cita `lib/policy.py:539-543` como o motivo de `T-09.4` vir primeiro. **Aquele sítio é
real mas guarda outra coisa:** ele reprova **chave de `agents.by_component`** fora do enum. O que
reprova **`components` de uma task** é um sítio diferente, com o **mesmo id de regra**:

```
scripts/tasks.sh:777-778  →  err("V-16", "componente fora do enum: %s (validos: %s)")
```

**E eu não o inferi da leitura — medi, com uma sonda fora do `tasks.toml` real:**

```bash
# sonda em /tmp (arquivo de tasks avulso; a identidade da feature e o campo `feature`, nao o diretorio)
harness tasks validate .../scratchpad/probe-infra.toml
# ERROR ... V-16 componente fora do enum: infra
#           (validos: sentimento, charts, convergencia, backtest, web, docs)
# FALHOU: ... — 2 ERROR, 2 WARN
```

`[MEDIDO 2026-09-03, n=1 task de sonda, `components = ["infra"]`]`

⇒ **é `ERROR`, não `WARN`, e o arquivo inteiro FALHA.** A ordem não é preferência nem cortesia
arquitetural: **uma task de `5.13` escrita antes de `infra` entrar no enum torna
`harness tasks validate plataforma-dados` vermelho para as 85 tasks existentes junto.** Os dois
sítios disparam em sequência — primeiro o do `tasks.toml` (minha superfície), depois o da política
(`agents.by_component.infra`).

**A ordem resultante, e cada aresta tem um motivo medido:**

```
T-09.4 (enum 6→7)  →  T-01.8 (o juiz de infra + A6)  →  T-01.9 (arquivo dourado)
                                   ↓
                   T-05.11 (scaffold + typecheck)  →  T-05.14 → T-05.15 → T-05.16
                   T-05.12 (a camada consumidora)  →  T-05.13 (contratos)
                                   ↓
                            T-05.14 depende das duas
```

1. **`T-09.4` primeiro** — `V-16` nos dois sítios, medido acima.
2. **`T-01.8` depois do enum** — `V-16`/`policy.py:539-543` reprova
   `[agents.by_component.infra]` enquanto `infra` não estiver em `components`.
3. **`T-01.8` antes de toda task de `web`** — sem `A6`, task nova de `web` nasce julgada pelo
   `ui-designer`, que é o defeito que `A6` existe para corrigir
   (`harness.toml:643-645`: `web.architect = ".claude/agents/ui-designer.md"` `[MEDIDO]`).
4. **`T-05.11` (o portão de tipo) antes de `T-05.14`/`T-05.15`** — esta é aresta **minha**, não do
   despacho, e o argumento está em §4.

---

## 2 · As 9 tasks propostas

| # | id | título (prefixo = `components`) | comp. | fase | `depends_on` | item / DoD |
|---|---|---|---|---|---|---|
| 1 | **`T-09.4`** *(já existe, `todo` — ANTECIPADA)* | `[docs] 09 · Decisao sobre o componente infra registrada — adotada ou recusada, com o motivo escrito` | `docs` | `09` | `T-01.4` ✅, `T-02.4a` ✅ | item `9.6` · `D9.6` · `ADR-009/D6.5` |
| 2 | **`T-01.8`** *(nova)* | `[docs] 01 · A6 — web ganha architect proprio e a dupla builder/qa portada; infra ganha juiz NOVO (infra-architect)` | `docs` | `01` | `T-01.3` ✅, `T-09.4` | `A6` · `ADR-009/D6.5` · `F-D6-6` |
| 3 | **`T-01.9`** *(nova)* | `[docs] 01 · A atribuicao de agents.by_component vira propriedade medida — arquivo dourado no make` | `docs` | `01` | `T-01.8` | item `1.13` · `D1.12` |
| 4 | **`T-05.11`** *(nova)* | `[docs][web] 05 · Scaffold Next real sob frontend/src/app, tsconfig e typecheck --strict dentro de make lint-frontend` | `docs`, `web` | `05` | `T-01.8` | item `5.16` · `D5.16` · `D5.16b` |
| 5 | **`T-05.12`** *(nova)* | `[docs][infra] 05 · A porta de leitura como PROCESSO: src/api + src/main + raiz de composicao, provada PELA REDE` | `docs`, `infra` | `05` | `T-09.4`, `T-01.8`, `T-05.9` ✅ | item `5.13` · `D5.13` · `D5.13b` · `D5.13c` |
| 6 | **`T-05.13`** *(nova)* | `[docs][infra] 05 · Os dois contratos de import-linter da camada consumidora, com os 2 violadores plantados` | `docs`, `infra` | `05` | `T-05.12`, `T-01.5` ✅ | item `5.13` · `D5.13d` · `ADR-009/D6.3` |
| 7 | **`T-05.14`** *(nova)* | `[web] 05 · O cliente liga na rota real: envelope de D6.1 e a paridade de DoD-2 comparando DUAS serializacoes` | `web` | `05` | `T-05.12`, `T-05.11` | item `5.14` · `D5.14` · `F-D6-1` · `F-D6-2` |
| 8 | **`T-05.15`** *(nova)* | `[web] 05 · O transporte por subprocesso sai do universo de producao — 209 de 500 linhas de ingest-health-query.ts` | `web` | `05` | `T-05.14` | item `5.15` · `D5.15` |
| 9 | **`T-05.16`** *(nova)* | `[web] 05 · A fronteira que mantem o falsificador de DoD-2 SINCRONO — importador de VALOR reprova` | `web` | `05` | `T-05.14`, `T-05.15` | item `5.17` · `D5.17` |

**8 tasks novas** ⇒ `tasks.toml` vai de **85 para 93**. Jira: chaves novas a partir de **`CST-100`**
(máximo hoje = `CST-99` `[MEDIDO 2026-09-03: project = CST ORDER BY created DESC`]).

---

## 3 · Cada task: escopo, DoD, comando, e o que a reprova

### `T-09.4` — ANTECIPADA, e a antecipação custa **zero edição**

**Não é task nova.** Existe, `status = "todo"`, `CST-86`, `components = ["docs"]`, `phase = "09"`.

**O que ela faz:** `harness policy --key components` de **6 para 7** com `infra`, e registra
`ADR-009/D5` como **ADOTADA** com o motivo escrito (`D9.6` exige *"nas duas direções possíveis"*).

**A medição que sustenta a opção (i) que o owner escolheu:**

```bash
grep -n -A6 '^id = "T-09.4"' docs/context/plataforma-dados/tasks.toml
# depends_on = ["T-01.4", "T-02.4a"]
grep -n 'id = "T-01.4"' -A 4 ...   # status = "done"
grep -n 'id = "T-02.4a"' -A 4 ...  # status = "done"
```

`[MEDIDO 2026-09-03]` ⇒ **`depends_on` está integralmente satisfeito hoje.** A antecipação é
executável **sem tocar em `depends_on`, sem editar o plano `09` e sem criar item**. O custo que o
owner aceitou (*"roda fora da ordem de fase — antecipação explícita, não acidente"*) é o único que
sobra, e ele é de **narrativa**, não de dependência.

**Meu único ato sobre ela, se aprovado:** acrescentar linhas em `refs` registrando (a) a
antecipação e sua data, (b) que ela é **pré-requisito de `V-16`** para `T-05.12`/`T-05.13`, e (c) o
comando da sonda de §1. `refs` é lista append; `status`, `title`, `components`, `phase` e `tracker`
**não são tocados**.

**⛔ O que esta task NÃO faz, e o item `9.6` não pede:** ela não declara o juiz. `F-D6-6` exige
`infra` **com `architect`** em `agents.by_component`, e isso é `T-01.8` — separado porque
`V-16`/`policy.py` reprova o juiz enquanto o enum não tiver mudado, e uma task não pode depender
de si mesma para validar.

---

### `T-01.8` — `A6` + o juiz de `infra`

**Escopo (3 superfícies, todas `nao-producao` — medido):**

```bash
harness code-paths classify .claude/agents/infra-architect.md  # nao-producao
harness code-paths classify Makefile                            # nao-producao
# include_prefixes = ['backend/src/', 'backend/tests/', 'frontend/src/']
```

1. **`.claude/agents/infra-architect.md` — CRIAÇÃO, não porte.** Universo medido:
   `ls .claude/agents/` → **2** (`quant-architect.md`, `ui-designer.md`); no vizinho,
   `find anything_monorepo -path '*/agents/*.md' -not -path './node_modules/*'` → **12**
   (3 em `.claude/agents/`, 9 em `.github/agents/`), e **nenhum é de infra**
   `[MEDIDO 2026-09-03]`. Confirma a premissa do menu que o owner aceitou.
2. **`.claude/agents/frontend-builder.md` e `frontend-qa.md` — PORTE.** Fontes:
   `anything_monorepo/.github/agents/frontend_builder.agent.md` (**82 linhas**) e
   `frontend_qa.agent.md` (**92 linhas**) `[MEDIDO 2026-09-03]`.
3. **`harness.toml` — `[agents.by_component]`:**
   - `web`: `architect` deixa de ser `ui-designer.md` e passa ao arquiteto de front;
     `builder`/`qa` entram apontando para a dupla portada; **`design_gate` FICA** (o
     `ui-designer` mantém o gate — `[DECISÃO-OWNER: 2026-09-03]`).
   - `infra`: nasce com `architect = ".claude/agents/infra-architect.md"`.

**Viabilidade já medida, não presumida:** o conjunto de papéis é **ABERTO** —
`lib/policy.py:549-550` itera `for papel, valor in mapa.items()`, e a única exigência por papel é
`checa_ponteiro` (caminho relativo não vazio que **exista**; ponteiro que não resolve é **AVISO**,
`fatal=False`). ⇒ `web.builder` e `web.qa` são declaráveis **sem mudar o plugin**
`[DOC: harness.toml:594-599]`.

**DoD e o comando que o prova:**

| prova | comando | cala | morde |
|---|---|---|---|
| `F-D6-6` — rótulo com dono | `harness policy --key agents.by_component` | **`infra` presente COM `architect`**, e o caminho existe | `infra` no enum e ausente desta tabela ⇒ `ADR-003:11-13` com uma camada de silêncio a mais |
| `A6` aplicado | mesmo comando | `web.architect` **≠** `ui-designer.md`, `web.builder`/`web.qa` presentes, `web.design_gate` **presente** | `design_gate` perdido no mesmo ato em que `architect` muda |
| política íntegra | `harness validate --strict` | `rc=0` | ponteiro que não resolve, componente fora do enum |

**⚠️ O que esta task NÃO fecha, e não é omissão:** ela **não** congela nada. A atribuição continua
desfazível em silêncio — as 3 mutações que `docs/gate-de-design.md` mediu (apagar `design_gate`,
trocar `charts`↔`web`, esvaziar a seção) **passam em `rc=0`**. Congelar é `T-01.9`.

**⚠️ Limite herdado, declarado: `design_gate` é papel que o mecanismo NÃO ROTEIA** — só `builder` e
`qa` são consumidos `[DOC: ref de T-01.3, medido em 2026-08-28 sobre o plugin v0.13.0]`. `A6`
**muda** isso para `web`: com `builder`/`qa` declarados, os dois papéis novos passam a ser
efetivamente roteados. É o primeiro componente deste repositório em que isso vale.

---

### `T-01.9` — item `1.13`: a atribuição vira propriedade **medida**

**Escopo:** o alvo de `make` com a asserção de **arquivo dourado** sobre
`harness policy --key agents.by_component`, dentro de `make lint`.

**DoD `D1.12`, literal do plano:** `make lint` **`≠ 0`** quando a política divergir do esperado
declarado; **verde** sobre a política de hoje. **Morde:** as **3 mutações** que hoje passam em
`rc=0` `[DOC: docs/gate-de-design.md §"O que a mutação mostrou" — 5 mutações medidas em 2026-08-28
por T-01.3]`.

**⛔ Reprova se a asserção só cobrir presença de chave** — é o defeito de `D1.2`, cujo comando é
satisfeito por `{"charts": {}}`. A saída é **JSON de chaves ordenadas**, e agora com **6 chaves**
(`backtest, charts, convergencia, infra, sentimento, web`), não 5 — `docs` continua **ausente** de
`agents.by_component` `[MEDIDO 2026-09-03]`, e o dourado tem de congelar essa ausência também,
senão ele mede menos do que a política diz.

**Por que separada de `T-01.8`, e é divergência do esboço do despacho — ver §4/D-1.**

---

### `T-05.11` — item `5.16`: o scaffold e o portão de tipo

**⚠️ ACHADO MEDIDO QUE NENHUMA FONTE DECLARA, e ele decide ONDE o scaffold nasce:**

```bash
harness code-paths classify frontend/app/page.tsx
# nao-producao: nenhum include_prefixes casa ['backend/src/','backend/tests/','frontend/src/']
harness code-paths classify frontend/tsconfig.json
# nao-producao
```

`[MEDIDO 2026-09-03]` ⇒ **um app Next criado em `frontend/app/` (o default do Next 13+ sem `src/`)
nasce FORA de toda regra** — mesma classe de lacuna que o `deploy/`, e pior, porque `.tsx` de
produção que o `harness` chama `nao-producao` também escapa do pack `web-fullstack` e do ESLint que
`T-01.2` instalou. **A task nasce com a restrição:** o app vive em **`frontend/src/app/`**, que o
Next suporta e que **já existe** (`frontend/src/app/routes.ts`, `history-transport.ts`). Criar em
`frontend/app/` reprova a task, e reprova por **cobertura**, não por estilo.

**Escopo:** `frontend/src/app/` (o app real, importando `react`), `frontend/tsconfig.json`,
`frontend/package.json`, e o alvo `typecheck` (`tsc --noEmit --strict`) **dentro de
`make lint-frontend`**.

**DoD `D5.16`** — `1.8'` aplicado a `tsc`:
- **morde:** erro de tipo plantado ⇒ `make lint` **`≠ 0`** nomeando arquivo e linha, **e
  `git push --dry-run` RECUSADO** (padrão de `D1.7c`/`D1.11`).
- **cala:** árvore limpa ⇒ `rc=0`.
- **Universo:** **35 módulos / 5.741 linhas** + **3 `.tsx` / 409 linhas** `[MEDIDO 2026-09-03]`.
- **O "antes" é ZERO:** `ls frontend/tsconfig.json` → **inexistente**;
  `grep -cE 'typecheck|noEmit' frontend/package.json` → **`0`** `[MEDIDO 2026-09-03]`.
- **`[NÃO MEDIDO]`: quantos dos 35 passam hoje em `--strict`.** **Medir é o primeiro ato da task**,
  e o número vai no gate. **⛔ Baixar o `strict` para o portão "fechar" REPROVA.**

**DoD `D5.16b`** — o app **RENDERIZA**, não só compila: os 3 `.tsx` importam `react`; hoje
`grep -rn 'from "react"' frontend/src | wc -l` → **`0`** `[MEDIDO 2026-09-03]`. **Reprova se o app
subir sem renderizar nenhum dos 3** — compilar sem renderizar é o mesmo vácuo do transporte sem
servidor.

**`components = ["docs", "web"]`** — precedente exato de `T-01.1`, que carrega `["docs",
"sentimento"]` *"porque a task também escreve `harness.toml` e `backend/README.md`, que são
superfície de `docs`"*. Aqui: `.tsx` de produção sob `frontend/src/` ⇒ **`web` obrigatório** pelo
gatilho armado em `harness.toml:631-633`; `tsconfig.json`/`package.json`/`Makefile` são
`nao-producao` ⇒ `docs`. **`V-26` exige o prefixo acompanhar:** `[docs][web]`.

---

### `T-05.12` — item `5.13`: a camada consumidora, provada **pela rede**

**Escopo — e os diretórios NASCEM nesta task:**

```bash
find backend/src -maxdepth 2 -type d   # hoje: so modules/ e modules/sentimento  [MEDIDO 2026-09-03]
harness code-paths classify backend/src/api/routes.py       # producao
harness code-paths classify backend/src/main/__init__.py    # producao
```

`backend/src/api/` (rotas) + o objeto de aplicação + a **raiz de composição**, servindo a rota de
histórico endereçável por conteúdo que `5.12` decidiu e **nunca teve servidor**. A camada consome
`use_cases` **por injeção**; nenhum contexto conhece seu consumidor; `src/jobs/` é a **mesma classe
de coisa** `[PREMISSA-OWNER: 2026-09-03]`.

**Corpo da resposta, fixado por `ADR-005/D6.1` — reprova por desvio:** envelope
`{ query, n_runs, n_gaps, runs[], gaps[] }`, **exatamente as 15 colunas de `ADR-008/D3`** por `run`,
as **8 de `md.ingest_gap`** por `gap`, nome de fio **`class`** e nunca `gap_class`. **Servir as 17
de `IngestRun`** (`ingest_record.py:100-117`) **reprova** — `started_at`/`ended_at` são colunas de
tabela, não de projeção.

**DoD `D5.13` — prova PELA REDE, nunca por subprocesso:**
- teste que **sobe o processo ASGI em loopback** e faz **`GET` real** por `http.client`; **mais**
  `find backend/src -maxdepth 1 -type d` para a localização.
- **morde:** com o processo **derrubado**, o teste reprova **por conexão recusada**, não por
  asserção de payload.
- **cala:** processo de pé ⇒ **`200`** + corpo endereçável por conteúdo, e **zero campo de nível de
  tick** (`agg_id`, preço por trade, quantidade por trade) — que é `D5.8` finalmente **com sujeito**.
- **Precedente medido, a técnica já existe aqui:**
  `grep -rln 'TcpFakeServer\|HTTPServer\|socketserver\|bind(' backend/tests` → **3 arquivos de
  114**; o cliente HTTP que este backend fala é `http.client` — **5 dos 49** módulos de `infra/` o
  importam, e **`httpx`/`requests` não são declarados** em `backend/pyproject.toml`
  `[MEDIDO 2026-09-03]`.

**DoD `D5.13b` — pin exato:** `grep -nE '^dependencies' -A4 backend/pyproject.toml`. Hoje **1
entrada** (`pyyaml (==6.0.3)`); FastAPI + servidor ASGI são as entradas **2 e 3**, **com `==`**.
**Faixa (`^`, `>=`) REPROVA**, pela doutrina escrita no próprio arquivo (*"reprodutibilidade sobre
conveniência"*). A dependência é premissa do owner, não escolha de agente: *"Já havia sido pontuado
antes que o back subiria um servidor com fastapi"* `[PREMISSA-OWNER: 2026-09-03]`.

**DoD `D5.13c` — RESTRIÇÃO DURA, e é a que eu vigiaria primeiro:**
- `grep -n 'ingest_health_query' <handler>` ⇒ **≥ 1** chamada a `ingest_health_query(source)`
- `grep -niE 'SELECT|FROM |psycopg|sqlite3' <handler>` ⇒ **`0`** linha de SQL no handler
- Ponto único medido: `backend/src/modules/sentimento/use_cases/ingest_health.py:32`, e
  `grep -c 'SELECT' ingest_health.py` → **`0`** `[MEDIDO 2026-09-03]`.
- **`[NÃO SEI]`** se a regra própria + corpus de `ADR-008/DoD-1` **alcançam** um *route handler*
  Python. **Dona: `ADR-008/D4`, não esta task.** E a lacuna é medida: `harness rules list` → **10
  regras, 5 `core` + 5 `web-fullstack`, ZERO própria**, e as **4** ocorrências de `[[rules.own]]`
  em `harness.toml` estão **todas em comentário** `[MEDIDO 2026-09-03]` ⇒ **este DoD prova por
  SÍTIO DE CHAMADA, não por regra.**

**`components = ["docs", "infra"]`** — `infra` pelos módulos de produção sob `backend/src/api/` e
`backend/src/main/`; `docs` por `backend/pyproject.toml`. Prefixo `[docs][infra]`.

---

### `T-05.13` — item `5.13`, metade `D5.13d`: os **dois** contratos de `import-linter`

**Escopo:** `[tool.importlinter]` em `backend/pyproject.toml` ganha os contratos de
`ADR-009/D6.3`, e `make boundaries` os roda:

- **(3) `layers`** — `layers = ["main", "api | jobs", "modules"]`, `containers = ["src"]`
- **(4) `forbidden`** — `source_modules = ["src.api", "src.jobs"]`,
  `forbidden_modules = ["src.modules.sentimento.infra"]`

**Sintaxe conferida na ferramenta, não na doc:** `_INDEPENDENT_LAYER_DELIMITER = "|"`
`[MEDIDO 2026-09-03: backend/.venv/.../importlinter/contracts/layers.py:20-21, import-linter 2.14]`
⇒ `api` e `jobs` **não se importam entre si**.

**DoD `D5.13d` — o par morde/cala de `1.8'`, com 2 violadores, 1 por contrato:**
- **morde:** um `from src.api…` **dentro** de `backend/src/modules/sentimento/` (contrato 3) e um
  `from src.modules.sentimento.infra…` **dentro** de `backend/src/api/` (contrato 4) ⇒
  `make boundaries` **`≠ 0` NOMEANDO o contrato**.
- **cala:** sem os violadores ⇒ **verde**, com a camada real de `T-05.12` na árvore.
- **Universo de hoje é ZERO e por isso mede EROSÃO, não conquista:**
  `grep -rnE 'from (src\.)?(api|jobs)' backend/src/modules --include='*.py' | wc -l` → **`0`**
  `[MEDIDO 2026-09-03]`.

**⚠️ E aqui este plano vai ALÉM do vizinho, de propósito:**
`grep -cE 'src\.api|src\.jobs' anything_monorepo/backend/pyproject.toml` → **`0` de 13** contratos
`[MEDIDO 2026-09-03]` — o vizinho **pratica e não declara**; o `jobs/` dele importa `infra` **2× de
4**. Lá é convenção; aqui passa a ser **portão**.

**⛔ O sinal de erosão que reprova esta task:** **recortar `src.jobs` do contrato (4)** para fechar
o DoD. É exatamente `ADR-009/F-D6-3`, e o desfecho certo é **criar a raiz de composição**, não
estreitar o contrato.

**`components = ["docs", "infra"]`, e isto DIVERGE do precedente `T-01.5` — de propósito.**
`T-01.5` (a task-irmã de `import-linter` da fase `01`) declarou `["docs"]` sozinho, com a
justificativa *"os violadores são EFÊMEROS e não sobrevivem à task"*. **A justificativa continua
verdadeira e eu não a contesto** — o que mudou é que em 2026-08-28 **não existia juiz para a
fronteira que o contrato desenha**, e depois de `T-01.8` existe. Declarar só `docs` poria o contrato
da camada `infra` para ser julgado por um componente que **não tem `architect`**
(`docs` está ausente de `agents.by_component` `[MEDIDO]`) — que é `ADR-003:11-13` outra vez.
**Se o owner preferir o precedente estrito, é trocar por `["docs"]` e o prefixo do título junto**
(`V-26` reprova se só um dos dois mudar).

---

### `T-05.14` — item `5.14`: o cliente liga na rota real

**O vácuo que ela fecha, declarado pelo próprio código:**
`frontend/src/app/history-transport.ts:20-33` diz *"NÃO cria servidor/endpoint algum … sem assumir
um schema de resposta que nenhuma ADR fixou ainda"*. **`ADR-005/D6.0`/`D6.1` fixaram**, e é por isso
que a task existe agora e não antes.

**Escopo:** `history-transport.ts` + o consumidor de projeção decodificam o envelope de `D6.1`
contra a rota de `T-05.12`. **`SectionMarker` + `isHeaderLine` + `parseCanonicalProjection`
(`:266-312`, 47 linhas) MORREM** — mantê-los vivos depois de `D6.1` é manter **dois formatos para
um contrato**. **204 de 251 linhas reféns (81,3%) VIVEM**
`[MEDIDO 2026-09-03 pelo quant-architect: 92-265 (174) + 471-500 (30); a região refém é 221+30=251]`.

**DoD `D5.14` — e é aqui que `ADR-008/DoD-2` deixa de comparar um número consigo mesmo:**
- **cala:** envelope real ⇒ view-model montado e `fingerprint` do TS **igual** ao de
  `IngestHealthReport.fingerprint()` sobre o **mesmo fixture congelado**.
- **morde (i):** servidor ausente ⇒ **reprova**. É o defeito exato com que `T-05.9` fechou.
- **morde (ii), controle NEGATIVO obrigatório de `F-D6-1`:** **reordenar as 15 colunas na rota
  MOVE o `sha256`** e reprova. Igual nos dois lados é `DoD-2` **vacuoso de novo**.
- **morde (iii), `F-D6-2`:** campo novo **dentro de `runs[]` MOVE** o `sha256`; campo novo **no
  envelope NÃO move**. **Comportamento igual nos dois prova que a região hasheada não está
  definida e `D6.3` está violada.**
- **Endereço não é literal:** `harness rules --mode file --path frontend/src/app/history-transport.ts`
  **não** acusa `web-fullstack.hardcoded-url` `[DOC: harness rules list, n=10]` ⇒ a base da URL vem
  de **configuração de ambiente**.

**Por que ela é a task mais valiosa desta quebra:** ela é o **primeiro** momento em que `DoD-2`
compara **duas serializações independentes**. `D6.2` explica por que isso funciona: os dois lados
**re-projetam** as linhas sobre a tupla do contrato antes de hashear
(`_project_run`/`_project_gap`, `ingest_record.py:181-200`; `projectRun`/`projectGap`,
`ingest-health-query.ts:200-234`) ⇒ um serializador HTTP, um proxy ou um framework que re-emita o
JSON **não move a impressão digital**.

---

### `T-05.15` — item `5.15`: o subprocesso sai do universo de produção

**A morte é FORÇADA, não escolhida:** `spawnSync` não existe em browser em nenhuma variante.
**209 de 500 linhas (41,8%)** saem de `frontend/src/features/s1-console/ingest-health-query.ts` —
`:313-470` + os 4 imports `node:` de `:74-77` (**162**), mais as **47** de `:266-312` que `D6.1`
acrescentou.

**DoD `D5.15`:** `grep -rln 'from "node:' frontend/src --include='*.ts' | grep -v '\.test\.'` ⇒
**`rc=1`, zero arquivos.** Hoje **2 de 35** módulos não-teste, e o segundo
(`app/threshold-spec-bundle.ts`) **não tem subprocesso nenhum** — é `createHash`
`[MEDIDO 2026-09-03]`. **Esse segundo NÃO é desta task** e não pode ser arrastado para dentro dela.

**⛔ E o arquivo não vira teste por decreto:**
`harness code-paths classify frontend/src/features/s1-console/ingest-health-query.ts` continua
**`producao`** (casa `include_prefixes` + `include_globs`, não casa `test_globs`). **O item diz qual
dos dois destinos** — teste de contrato ou morte — e a task executa o que o item diz, não o que for
mais fácil.

**⚠️ O que este DoD NÃO fecha, e não é omissão minha:** *onde* vive a testemunha cruzada
Python×TS. Hoje **1 de 10 ports** a tem, e `grep -rln frontend backend/tests` → **`rc=1`, zero**
`[MEDIDO 2026-09-03, fato 7]`. **É `A1`, dono `quant-architect`.**

---

### `T-05.16` — item `5.17`: a fronteira que mantém o falsificador **síncrono**

**`ADR-005/D6.4` removeu o gatilho em vez de pagar o custo.** O achado que nenhum documento
registrava antes de 2026-09-03: `createHash("sha256")` de `node:crypto` é **SÍNCRONO**
(`ingest-health-query.ts:73,262-264`); `crypto.subtle.digest` é **ASSÍNCRONO** ⇒ no browser
`fingerprint` viraria `Promise<string>`, e com ele `canonicalProjection`, os `fetch*` e a cadeia até
`buildS1ViewModelFromIngestHealthProjection` (`:488`) e `S1Console.tsx`. **Não é troca de import —
é mudança de forma no instrumento que prova a ADR.**

**DoD `D5.17`, duas metades:**
- **(a)** a paridade de `F-D6-1` roda em **Python × Node**, **fora** do caminho de render.
- **(b)** o portão de importação:
  `grep -rn 'from "\(\.\./s1-console/\|\./\)ingest-health-query\.ts"' frontend/src --include='*.ts'
  --include='*.tsx' | grep -v '\.test\.'` cruzado com `import type`.
  - **morde:** um importador **DE VALOR** (não `import type`) plantado do bundle de browser para
    dentro do módulo de canonicalização ⇒ o portão **reprova nomeando o arquivo**.
  - **cala:** a árvore de hoje ⇒ **3 de 3 `import type`, zero aresta de runtime**
    `[MEDIDO 2026-09-03 em 8c002e4, n=3: s3-inspector/{fixtures,domain,view-model}.ts; S1Console.tsx
    importa só S1ViewModel]`.
- ⇒ **`fingerprint(): string` PERMANECE síncrona**, e o `fingerprint` viaja no **`ETag`** (`D6.3`)
  **sem o cliente confiar nele** — *"servidor manda o `fingerprint` e o cliente confia"* é
  alternativa **RECUSADA** em `D6` por comparar um número consigo mesmo.

**⚠️ Duas coisas que esta task NÃO decide, e por isso ela é separada de `T-05.15`:**
1. **`[NÃO SEI]` a metade de PRODUTO, e ela é do OWNER:** *o operador VÊ o selo de integridade na
   tela?* Se **sim**, `crypto.subtle` é inevitável e **este DoD muda de forma**. O despacho
   registra que hoje o `fingerprint` **não é exibido** ⇒ `D5.17` fica **síncrono**; isso foi
   resolvido pela emenda `D6.3`/`D6.4`, **não por decisão minha**. **Se o owner mudar de ideia, é
   esta task que muda — e nenhuma outra.** É exatamente por isso que ela não está soldada à
   `T-05.15`: soldada, a resposta do owner bloquearia em silêncio a remoção das 209 linhas.
2. **O INSTRUMENTO do portão:** `no-restricted-imports` casa **CAMINHO**, e `ADR-003:46` recusa
   amarrar componente a caminho. **Este item HERDA a pergunta de `D5.12`, não a redecide.** E
   `frontend/src/app/threshold-spec-bundle.ts:36,371` (o 2º `createHash` do front) tem **outra
   dona** — bundle-URL de `SPEC-001` §7: declarado, não decidido.

---

## 4 · As DUAS divergências da minha quebra em relação ao esboço do despacho

O despacho esboça **(a)** `5.13`–`5.17`, **(b)** *"a task do item `1.13`"* (singular) e **(c)**
`T-09.4`. Minha quebra produz **9** unidades de trabalho, não 7. As duas divergências, com o custo
de cada lado, para o owner escolher:

### `D-1` · O despacho pede **uma** task para (b); eu proponho **duas** (`T-01.8` + `T-01.9`)

**O que motiva:** o item `1.13` do plano diz literalmente *"a atribuição de `Q16` vira propriedade
medida — asserção de arquivo-dourado sobre `harness policy --key agents.by_component`, no `make`"*.
Isso é o **congelamento**. `A6` é a **atribuição** que será congelada. São dois atos, e o segundo só
tem objeto depois do primeiro.

- **Uma task só (o esboço):** um builder escreveria **3 arquivos de agente** (1 criado do zero, 2
  portados de 174 linhas), rearranjaria o julgamento de **2 componentes** e construiria um portão de
  `make` com **3 mutações**. Custo: passa fácil dos ~150 turnos que a doutrina de contexto nomeia, e
  o custo é **quadrático** nos turnos. Ganho: um ato de owner cobre os dois.
- **Duas tasks (minha proposta):** o dourado nasce **uma vez**, sobre a atribuição final, e
  `T-01.9` pode correr **em paralelo** com as tasks de `web` (nada em `05` depende dela). Custo:
  uma task a mais no `tasks.toml` e no Jira.

**Recomendo duas.** Mas é escolha do owner, e se ele preferir uma, o merge é trivial: `T-01.9` some
e seu DoD (`D1.12`) entra em `refs` de `T-01.8`.

### `D-2` · Eu parti o item `5.13` em **duas** tasks (`T-05.12` + `T-05.13`)

**O que motiva:** o item `5.13` carrega **4 DoDs**, e `D5.13d` é de natureza diferente dos outros
três — é o **portão de fronteira**, não a camada. **Precedente medido neste repositório:** a fase
`01` fez exatamente esse corte — `T-01.1` levou o layout de módulo, e `T-01.5` levou o contrato
`layers` + o `pre-push` que o roda, como task separada. `D5.13d` é o irmão de `D1.7a` uma camada
acima.

- **Uma task só:** o contrato e a camada nascem no mesmo commit, e o *cala* é medido com a camada
  real na árvore sem coordenação entre tasks.
- **Duas (minha proposta):** `T-05.13` **depende** de `T-05.12`, então o *cala* continua sendo
  medido com a camada real na árvore; e o violador plantado do contrato (4) precisa de
  `backend/src/api/` existindo, que é justamente a saída de `T-05.12`.

**Recomendo duas**, pelo tamanho de `T-05.12` (rota + objeto de aplicação + raiz de composição +
2 pins exatos + teste de rede em loopback) e pelo precedente de `T-01.5`.

### `D-3` · Aresta que eu acrescentei e o despacho não pede: `T-05.11` **antes** de `T-05.14`/`T-05.15`

O portão de tipo nasce **antes** de `T-05.15` apagar **209 linhas** de um módulo de 500. Invertido,
as duas tasks de transporte seriam escritas **sem** `tsc --noEmit --strict` no `make`, e o portão
chegaria depois para julgar código que ninguém compilou com ele. Custo de aceitar: `T-05.11` deixa
de poder correr por último, e o `[NÃO MEDIDO]` (*quantos dos 35 módulos passam hoje em `--strict`*)
tem de ser medido **antes** do transporte, não depois. **É o mesmo argumento de `D1.7c`: portão que
chega depois do código é portão que negocia com o que já está escrito.**

---

## 5 · O que eu NÃO fiz, e cada linha é deliberada

| não fiz | por quê |
|---|---|
| **não criei task no `tasks.toml` nem no Jira** | é o pedido do ato: aval do owner primeiro |
| **não reabri nada em `done`** | `git diff --numstat` dos 4 documentos: `171 0` · `119 0` · `198 0` · `278 0` — **zero deleção** `[MEDIDO]`. `T-09.4` é `todo`, não `done` |
| **não criei item de plano** | ato do `/architect`. Os itens `5.13`–`5.17`, `1.13` e `9.6` **já existem** |
| **não decidi `A1`–`A3`** (paridade dos 9 ports Python→TS) | dono `quant-architect`; gatilho de `ADR-003/D2` já disparou. `T-05.15` **herda** o `[NÃO SEI]`, não o fecha |
| **não decidi a partição de `sentimento`** | ⛔ owner, assessorado pelo `quant-architect`, que está escrevendo `gates/estudo-particao-sentimento-2026-09-03.md`. **Não toquei o arquivo** e nenhuma task acima depende dele |
| **não inventei a rota de `deploy/`** | lacuna declarada e **sem item**: `code_paths.include_prefixes` tem **3** entradas e `ls -d deploy` → **inexistente** `[MEDIDO]`. Rótulo não é cobertura — ver §6 |
| **não corrigi o enunciado de `D5.8`** | ⛔ owner: enunciado de DoD já `done`. `D5.13` dá o **sujeito** ao predicado negativo de `D5.8` sem reescrever uma palavra dele |
| **não reabri `5.11`/`T-05.10`** | continua **REBAIXADO**/`blocked`. A rota **não é exposta à rede pública** (loopback; o proxy é a borda, como em `anything/deploy/compose.prod.yml:162-163` → `127.0.0.1:8000:8000`) `[DECISÃO-OWNER: 2026-09-03]` |
| **não reescrevi `tasks_review.md`** | é artefato **aprovado pelo owner**. Esta narrativa é arquivo novo, datado — precedente: `tasks_review-T-03.12.md` |
| **não rodei `gate-record`, `approve` nem `advance`** | fora do meu papel e fora do pedido |

---

## 6 · ⚠️ O falsificador que a MINHA quebra DISPARA — e eu não posso consertá-lo

**`ADR-009/F-D6-5` mede a LARGURA do rótulo:** *ao fim da fase `05`, contar as coisas distintas que
declaram `infra`* — o critério é **≥ 2 naturezas distintas** (a camada consumidora **e** ao menos
uma de `deploy/`/backup/topologia). *"Se `infra` só rotular a camada de API e nada mais, a opção `B`
(`api`) era o nome certo, e o rótulo largo comprou apenas ambiguidade de juiz."*

**Na minha quebra, `infra` é declarado por exatamente 2 tasks — `T-05.12` e `T-05.13` — e as duas
são a MESMA natureza: a camada consumidora.** ⇒ **`F-D6-5` disparará ao fim da fase `05`.**

**Não é defeito da quebra: é a lacuna do `deploy/` aparecendo onde ela dói.** O único conserto é um
**item de fase** para `deploy/`, do mesmo jeito que `T-01.2` fez por `frontend/src/` — e **criar
item de plano é ato do `/architect`, não meu.** Registro aqui, com o número, para que o disparo
seja **previsto** em vez de descoberto: um falsificador que dispara e é lido como *"já estava
assim"* para de medir, e esse é o modo de falha que `ADR-012` nomeia para o `rc=0`.

**Pedido ao owner, e é a única coisa que eu peço fora do aval:** encaminhar ao `/architect` o item
de fase para `deploy/`. **Não bloqueia nada** desta quebra.

---

## 7 · ⚠️ Lacuna de escopo de escrita — MEDIDA, e ela bloqueia 2 das 9 tasks

```bash
harness pipeline require-code .claude/agents/infra-architect.md
# [pipeline] nenhuma feature autorizada reivindica o path '.claude/agents/infra-architect.md'
harness pipeline require-code docs/INDEX.md          # idem
harness pipeline require-code docs/gate-de-design.md # idem
harness pipeline require-code docs/decisoes-do-owner.md # idem
```

`[MEDIDO 2026-09-03]`. `harness pipeline scope plataforma-dados list` devolve **19 prefixos**, e
**`.claude/agents` não é um deles** ⇒ **`T-01.8` e `T-01.9` não conseguem escrever os arquivos de
agente**, e o portão recusa **antes** do primeiro byte.

Os caminhos de produção estão cobertos — `backend/src/api/routes.py`,
`backend/src/main/__init__.py`, `frontend/tsconfig.json` e `frontend/src/app/…` todos devolvem
*"código permitido — feature 'plataforma-dados' (scope)"* `[MEDIDO]`.

**O ato que falta, e é o único comando de `harness` que esta quebra exige — só depois do aval:**

```bash
harness pipeline scope plataforma-dados add .claude/agents
harness pipeline scope plataforma-dados add docs/INDEX.md   # a linha de registro append-only
```

**Não rodei nenhum dos dois.** `scope add` altera o portão de escrita da feature, e fazê-lo antes da
aprovação da narrativa seria materializar metade da decisão pela porta dos fundos.

---

## 8 · Jira — destino identificado, integração **UP**, sem `local_only`

| o que | valor | medição |
|---|---|---|
| tracker | `kind = "jira"`, `project = CST`, `board_id = 36` | `harness policy --key tracker` |
| tipos | `parent_kind = "Epic"`, `child_kind = "Tarefa"` | `harness.toml:59-84`; `CST-86` **é** `Tarefa` `[MEDIDO]` |
| Epic da fase `05` | **`CST-3`** — *F1 · Contrato temporal + a primeira fatia de valor visível* | `[MEDIDO]` |
| Epic da fase `01` | **`CST-1`** — *F5a · Governança gateante* | `[MEDIDO]` |
| Epic da fase `09` | **`CST-7`** — *F5b · Consolidação de fronteira* | `[MEDIDO]` |
| chaves novas | a partir de **`CST-100`** (máx. hoje `CST-99`) | `[MEDIDO]` |
| labels | `<componente>` + `fase-XX` + `spec-001` | convenção lida em `CST-86`: `docs`, `fase-09`, `spec-001` `[MEDIDO]` |

**A integração está de pé** ⇒ **`local_only` NÃO se aplica a nenhuma destas tasks.** Registro o
vocabulário para que ele não seja usado por engano depois: **cardou ⇒ `tracker` preenchido**;
**owner decidiu não cardar ⇒ `local_only = true` + `local_reason` com data e motivo**; **esqueci de
sincronizar ⇒ SEM marcação, e eu digo isso no handoff.** Um marcador que colapse *"decidi"* e
*"esqueci"* faz o segundo nunca chamar atenção — e o fallback é o pior lugar possível para um
marcador ambíguo.

**⚠️ O Jira converte markdown para ADF e DEGRADA** — cabeçalho e negrito viram texto plano, e par de
`_` no mesmo identificador vira itálico. **As descrições vão em texto plano.** `CST-86` já tem
`summary` e labels corretos; a antecipação entra nele **por comentário**, não por reescrita de
`summary`.

**Já espelhado hoje, por comentário, e eu não repito:** `CST-3` (reabertura + `A4`) e `CST-1`
(`A6`).

---

## 9 · Os 3 modos de falha que eu vigiaria nesta fase

Herdados do plano `05` §*"como esta fase falha"*, e eu os repito porque a quebra os distribuiu entre
tasks e ninguém mais vê o conjunto:

1. **`D5.13` ou `D5.14` fechando com o processo servidor AUSENTE da passada.** Foi assim que
   `T-05.9` e `T-08.11` fecharam `done` (as duas com **metade cliente só**), e `D5.8` mede uma
   propriedade **negativa** que é verdadeira sobre payload que ninguém serve. **Se o teste novo
   passar com o servidor no chão, a task nova repetiu o defeito que ela existe para consertar.**
2. **`D5.14` fechando sem o controle NEGATIVO de `F-D6-1`/`F-D6-2`.** Reordenar as 15 colunas, ou
   acrescentar campo dentro de `runs[]`, **tem de mover** o `sha256`. Igual nos dois lados é `DoD-2`
   comparando **um número consigo mesmo**. **Irmão disto no lado servidor:** handler com SQL próprio
   ⇒ `D5.13c` reprova e `ADR-008/DoD-1` ganha a segunda definição que ela existe para proibir.
3. **`D5.16` fechando com `strict` afrouxado ou com `typecheck` fora de `make lint`.** Portão que
   ninguém roda é o achado de `D1.7c`; portão cego é o de `D1.10`. **Um `tsconfig.json` com
   `strict: false` passa nos dois e não mede nada.**

E um quarto, que é meu e nasce da ordem: **`T-05.13` fechando por recorte do contrato (4).**
Tirar `src.jobs` de `source_modules` faz `make boundaries` ficar verde e **desliga metade do que o
contrato existe para medir** — `ADR-009/F-D6-3` nomeia isso, e o desfecho certo é a raiz de
composição.

---

## 10 · O que eu peço ao owner

1. **Aprovar (ou emendar) as 9 tasks de §2** — ordem, escopo, DoD e dependências.
2. **Decidir `D-1`, `D-2` e `D-3` de §4** — as duas divisões e a aresta que eu acrescentei. Se ele
   discordar de qualquer uma, o merge é mecânico e eu o faço antes de materializar.
3. **Autorizar os 2 `harness pipeline scope … add` de §7** — sem eles, `T-01.8`/`T-01.9` não
   escrevem.
4. **Ciência de §6** — `F-D6-5` disparará ao fim da fase `05` por falta de item para `deploy/`, e o
   conserto é ato do `/architect`.

**Depois do aval, e só depois:** `tasks.toml` (85 → 93, validado por
`harness tasks validate plataforma-dados`), as 8 issues no Jira sob `CST-3`/`CST-1`, o comentário de
antecipação em `CST-86`, o `handoff_to_builder.md` e a linha append-only em `docs/INDEX.md`.

**Próximo passo depois disso:** `/build` — e a primeira task da fila é **`T-09.4`**, porque sem ela
o validador reprova as outras.
