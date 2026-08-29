# QA retroativo — fases `01`, `02` e `03` de `codigo-em-ingles`, contra `master@75ff774`

**Papel:** `/qa` · **Data:** 2026-08-29 · **Worktree:** `/tmp/claude-1002/wt/gates` ·
**Branch:** `chore/gates-01-03-codigo-em-ingles` · **Rev sob teste:** `master@75ff774`
**Motivo:** as 3 fases estão mergeadas e as 7 tasks estão `done`, mas **nenhum veredito virou evento
no ledger** — `harness status codigo-em-ingles` dizia *"1 de 4 fases aprovadas"*. `CLAUDE.md`:
*"o ledger é a identidade do estado, não o texto do documento"*.

> **O que este relatório NÃO é:** ele **não julga se os relatórios antigos estavam certos**. Os dois
> `NEEDS_FIX` (`T-02.1-qa.md`, `T-03.1-qa.md`) foram emitidos **antes** do merge; as fases foram
> mergeadas **depois**; ninguém re-verificou. A pergunta aqui é uma só: **em `master` hoje, os DoD das
> três se sustentam?**

---

## Veredito

| fase | veredito | por quê, em uma linha |
|---|---|---|
| **01** (`T-01.1`/`T-01.2`/`T-01.3`) | **`APPROVED`** | 9 CAs medidos, 9 verdes; `harness.toml` intocado no range; 1 achado escalado que **nenhum CA mede** |
| **02** (`T-02.1`) | **`NEEDS_FIX`** | a árvore está certa; **dois itens de DoD do `tasks.toml` falham medidos**, e as erratas prescritas em 2026-08-29 **não entraram em `master`** |
| **03** (`T-03.1`) | **`APPROVED`** | 12 itens de DoD medidos, 12 verdes, incluindo os 4 casos da prova de dois lados **re-executados em `master`** |

**Regras bloqueantes: 7 de 7 avaliadas** nas três fases (`harness rules list --severity block` → 7).

---

## 0. A base comportamental — uma passada de `make verify` (R7), e a anomalia que ela produziu

```
$ make verify
[OK       ] lint-backend    rc=0  56 source files
[OK       ] lint-frontend   rc=0  ESLint do projeto sobre frontend/src
[OK       ] test            rc=0  386 passed · Total coverage: 99.24%
[OK       ] boundaries      rc=0  3 kept, 0 broken
[NÃO MEDIU] regras          rc=3  0 bloqueio(s), 0 aviso(s)
[NÃO MEDIU] política        rc=3
veredito: INDETERMINADO — algum portão RECUSOU medir (rc=3). Não é o mesmo que passar.
```

**⚠️ Os dois `rc=3` são anomalia, não `OK` e não `FAIL` — e foram DIAGNOSTICADOS, não arredondados.**
Causa citável, no log bruto `/tmp/verify-gates-20260829T212708Z.log:90-100`:

```
########## regras :: bash .harness/mechanism rules --mode sweep --surface git-hook ##########
harness: mecanismo NAO RESOLVIVEL para /tmp/claude-1002/wt/gates.
    1. $HARNESS_MECHANISM nao esta definido
```

`scripts/verify.sh` chama `.harness/mechanism`, que **não resolve neste worktree** — propriedade do
worktree, não do repositório. **Re-medido com o mecanismo apontado**, os dois fecham:

```
$ HARNESS_MECHANISM=…/harness-plugin/0.13.0/bin/harness  rules --mode sweep --surface git-hook
[AVISO] [web-fullstack.browser-test-file-present] …          >>> rc=0
$ … validate --strict   ->  politica valida: cripto-strategy (schema_version=1)   >>> rc=0
$ … rules --mode sweep  ->  rc=0 · 0 [BLOQUEIO] · 1 [AVISO]
```

⇒ **os seis portões fecham verdes**; nenhum `rc=3` sobrevive sem explicação.

**Cobertura contra alvo declarado** (`ADR-009/D1`), do mesmo log (`:60-63`):

```
[OK  ] domain     100.0% (meta 90%)  [728/728 linhas]
[OK  ] use_cases  100.0% (meta 80%)  [220/220 linhas]
[OK  ] infra       97.7% (meta 70%)  [588/602 linhas]
universo: 3 camada(s) medida(s) de 3 declarada(s)
```

**Acima do alvo nas três camadas medidas, 3 de 3 declaradas.**

**Ranges de fase**, para todo critério de `diff` (`git merge-base` de cada PR = **`c7df90c`** nas três):

| fase | merge | branch tip | range medido |
|---|---|---|---|
| 01 | `3efec39` (PR #31) | `5c8886c` | `c7df90c..5c8886c` |
| 02 | `9775c7e` (PR #30) | `2cd4ddd` | `c7df90c..2cd4ddd` |
| 03 | `3c7b698` (PR #27) | `5c03f98` | `c7df90c..5c03f98` |

---

## 1. Fase `01` — **`APPROVED`**

| CA | comando | esperado | medido em `75ff774` | |
|---|---|---|---|---|
| `CA-F1-1` | `grep -cE '^\| [0-9]+ \|' CLAUDE.md` | 12 | **12** | OK |
| `CA-F1-2` | `grep -cF '<exceção literal>' CLAUDE.md` | 1, `rc=0` | **1**, `rc=0` | OK |
| `CA-F1-3` | `grep -c 'glossary_doc' CLAUDE.md` | ≥1 | **2** | OK |
| `CA-F1-4` (a) | `grep -cE '^\s*\[\[rules\.own\]\]' harness.toml` | 0 | **0** — as 4 ocorrências da string estão **dentro de comentário** (`:386`, `:455`, `:461`, `:463`), e `:455` é literalmente *"SEM `[[rules.core.disabled]]` e sem `[[rules.own]]`"* | OK |
| `CA-F1-4` (b) | `git diff --name-only c7df90c..5c8886c -- harness.toml` | vazio | **vazio** | OK |
| `CA-F1-4` (c) | `harness rules list --severity block \| grep -c '^\[BLOQUEIO\]'` | 7 | **7** | OK |
| `CA-F1-5` metade 1 | `grep -c 'CLAUDE.md' README.md` | ≥1 | **7** | OK |
| `CA-F1-5` **metade 2** | `grep -cF '<exceção literal>' README.md` | **0** | **0** | OK |
| `CA-F1-7` | `git diff --numstat c7df90c..5c8886c -- docs/INDEX.md` | `N  0` | **`1  0`** — append-only respeitado | OK |
| `CA-F1-8` | `git diff --name-only c7df90c..5c8886c -- backend frontend` | vazio | **vazio** | OK |
| `CA-F1-9` | `make verify` | `rc=0`, sem `rc=3` | **6 portões verdes** (§0) | OK |
| `T-01.3` (a) | `git show --name-only --format= 0053c3b` | exatamente 2 | **2** — `docs/plans/…/index.md` + `docs/specs/SPEC-002-…md` | OK |
| `T-01.3` (b) | `sed -n '3p' docs/specs/SPEC-002-codigo-em-ingles.md` | ledger, não `DRAFT` | **`**Status:** \`SPEC_APPROVED\` — e é \`SPEC_APPROVED\` porque o ledger diz…`** | OK |
| `T-01.3` (c) | `git diff --name-only c7df90c..5c8886c -- docs/adr` | vazio | **vazio** | OK |

**Os 7 arquivos do range são todos `docs`** — `CLAUDE.md`, `README.md`, `docs/INDEX.md`, os 2 relatórios
de portão, o `index.md` do plano e a `SPEC-002`. **Zero linha de código**, o que é o falsificador barato
de uma fase `[docs]`.

### 1.1 Achado escalado, e ele **NÃO reprova** — o `13` da constituição é falso hoje

`CLAUDE.md` §*Idioma de identificador* publica: *"**Hoje: 14 segmentos, e exatamente 1 em português —
`painel`**, que a fase `03` renomeia; depois dela, **13 e zero**"*. **A fase `03` aconteceu. Medido:**

```
$ git ls-tree -r --name-only HEAD | grep -E '^(backend/src|backend/tests|frontend/src)/' \
  | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u \
  | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs' | wc -l
14
```

`[MEDIDO 2026-08-29 em 75ff774, n=14 segmentos]` — o conjunto é
`app backend components domain features frontend helpers infra modules panel src tests ui use_cases`.
**São `14 e zero`, não `13 e zero`:** `painel` não **sai** do conjunto, ele vira `panel`, que é inglês e
**continua no conjunto**. A metade que importa (`zero` em português) está certa.

**Por que isto não reprova a fase `01`:** **nenhum CA de `T-01.1`–`T-01.3` mede esse número**, e
`CA-F1-1` exige a tabela e a seção **integrais** — o `13` é herdado de `SPEC-002` §4.3 e
`docs/plans/SPEC-002-codigo-em-ingles/{01_convencao_escrita.md, 03_retroativo_frontend.md:47}`, que o
builder era **obrigado** a reproduzir. **Dono da errata: `/architect`.** É o **mesmo achado** que
`T-03.1-qa.md` §11 ação 3 escalou em 2026-08-29 e que **continua não aplicado em `master`** — verificado:
`03_retroativo_frontend.md:47` ainda diz *"`CA-F1-6` devolve **13 segmentos, zero português**"*.

---

## 2. Fase `03` — **`APPROVED`**

| # | critério (`tasks.toml`/`T-03.1`) | medido em `75ff774` | |
|---|---|---|---|
| `CA-F3-1` | `find frontend/src -type f` | **4**: `app/routes.ts`, `components/ui/format-percentage.ts`, `features/panel/config.ts`, `features/panel/Filter.tsx` — nome-base inglês, **zero segmento português** | OK |
| `CA-F3-2` (1) | `grep -c -F 'Filtro: any resultado serve' …/panel/Filter.tsx` | **1** (`:10`) — a evidência protegida **sobreviveu** | OK |
| `CA-F3-2` (2) | `grep -c -F 'any: true' …/panel/config.ts` | **1** (`:8`) — a outra metade da bancada `D1.3b`, **viva** | OK |
| `CA-F3-3` | os **4 casos** de `ADR-011/D4`, **re-executados por mim em `master`** | §2.1 — **os 4 reproduzem** | OK |
| `CA-F3-4` | `git grep -n -F '<token>'` no escopo enumerado, 4 tokens | `Filtro.tsx` **0** · `formatar-percentual.ts` **0** · `painel/` **1** · `rotas.ts` **1** | OK — §2.2 |
| `CA-F3-5` | `grep -c 'Filtro' harness.toml` **e** a sonda re-medida | **0**; `classify frontend/src/__sonda__/Filter.test.tsx` → `producao`, **`rc=0`** | OK |
| `CA-F3-6` lado 1 | `test -f` nos 4 caminhos NOVOS | **`rc=0` ×4** | OK |
| `CA-F3-6` **lado 2** | `test -f` nos 4 caminhos ANTIGOS | **`rc=1` ×4** — o lado que pega o rename para o lugar errado | OK |
| `CA-F3-6` lado 3 | `harness code-paths classify` nos 4 novos | **`producao` ×4**, `rc=0` | OK |
| `CA-F3-7` | `git diff --numstat c7df90c..5c03f98 -- docs/INDEX.md docs/adr docs/plans docs/proposta-discovery.md docs/specs/PRD-001-plataforma-dados.md` | **vazio** — nenhuma HISTÓRICA tocada | OK |
| `CA-F3-8` | `grep -n -F '"/painel"' frontend/src/app/routes.ts` | **1 linha**, `rc=0` — `routes.ts:15` → `panel: "/painel",`, **mista de propósito** (`[Q2]` é do owner) | OK |
| `CA-F3-9` | `make verify` | 6 portões verdes, **nenhum `rc=3`** não explicado (§0) | OK |
| `CA-F1-4` | nenhuma regra nasce | `git diff c7df90c..5c03f98 -- harness.toml \| grep -cF '[[rules.own]]'` → **0** | OK |
| `CA-F1-6` | *"`{sentimento, painel}` (2) → `{sentimento}` (1), e `sentimento` casa por igualdade de string com `components`"* | **`{sentimento}`, tamanho 1** — **CALA** | OK |
| `RN-3` | continente renomeia, conteúdo citado não | `frontend/README.md:250` → `grep -c 'Filter.tsx'` = **1** **e** `grep -cF 'Filtro: any resultado serve'` = **1**, **na mesma linha** | OK |
| `NÃO FAZ` | sem `Filter.test.tsx`, sem fechar o `[AVISO]` | `find frontend -name '*.test.*' -not -path '*/node_modules/*' \| wc -l` → **0**; `sweep` → **1 `[AVISO]`**, **0 `[BLOQUEIO]`** | OK |

O `git diff --name-status -M c7df90c..5c03f98 -- frontend/src` mostra os **4 renames** (`R086`, `R065`,
`R094`, `R086`) e **nada além**.

### 2.1 Os 4 casos da prova de dois lados — **re-executados em `master`, não citados do relatório antigo**

```
1/4 MORDE  printf … > frontend/src/features/panel/tipos.ts ; npm --prefix frontend run lint
           -> rc=1 · 2 erros `no-explicit-any` · em `features/panel/tipos.ts`
2/4 CALA   rm …/panel/tipos.ts ; npm --prefix frontend run lint                        -> rc=0
3/4 MORDE  printf … > …/panel/serie.tsx ; harness rules --mode file --path … --surface ci
           -> rc=1 · 1 [BLOQUEIO] `web-fullstack.browser-imports-server`
4/4 CALA   test -f …/panel/Filter.tsx (rc=0) · classify (rc=0) · rules --mode file (rc=0, 0 byte)
sweep      harness rules --mode sweep -> rc=0 · 0 [BLOQUEIO] · 1 [AVISO]
```

**Os dois lados que mordem, mordem DENTRO de `features/panel/`** — o diretório novo. `git status
--porcelain` **vazio** depois (só o symlink de `frontend/node_modules`, removido antes do `git add`).

### 2.2 Os dois resíduos de `CA-F3-4` — **1 linha, e ela é HISTÓRICA por construção**

`painel/` = 1 e `rotas.ts` = 1 resolvem para **a mesma linha**:
`docs/context/plataforma-dados/tasks.toml:606`. Ela é a **nota de âncora morta escrita pelo `/review` da
própria `T-03.1`**, que **cita os nomes antigos de propósito** para registrar que `ADR-003:234` passou a
apontar para caminho inexistente — e carrega o falsificador junto (*"`test -f frontend/src/app/routes.ts`
tem de devolver `rc=0` ANTES de qualquer medição de `cala`"*). É **menção-de-token como objeto de
discussão**, não âncora que resolve caminho ⇒ **HISTÓRICA** por `ADR-015/D3`. Reescrevê-la destruiria a
evidência que ela existe para preservar.

---

## 3. Fase `02` — **`NEEDS_FIX`**. A árvore está certa; **dois itens de DoD falham medidos**

**O que está certo, e é a maior parte:**

| CA | medido em `75ff774` | |
|---|---|---|
| `CA-F2-1` | `git diff --name-status -M c7df90c..2cd4ddd -- backend/tests` → **`R067`** e **`R063`**, e **nada além** | OK |
| `CA-F2-3` (número) | `make verify` → `386 passed`, `99.24%`, 3/3 camadas acima da meta | §3.3 |
| `CA-F2-4` (CALA) | `git grep -c -F '<token>' -- harness.toml README.md backend/README.md frontend/README.md backend/src backend/tests frontend/src` → **0** e **0** | OK |
| `CA-F2-5` | `test -d backend/tests/sentimento` → **`rc=0`** **E** `test -d backend/tests/sentiment` → **`rc=1`** | OK |
| `CA-F2-6` | `git diff -U0 c7df90c..2cd4ddd -- backend/src` → **1 arquivo, 2 linhas**, e as 2 são **a docstring** de `jsonl_checkpoint.py` | OK |
| `CA-F2-7` | `git diff --numstat c7df90c..2cd4ddd -- docs/INDEX.md docs/adr docs/plans docs/specs` → **vazio** | OK |
| `CA-F2-8` | `lint-backend` `rc=0`, 56 source files | OK |
| `CA-F2-9` (intenção) | os **4 eventos em português** `INTACTOS`: `grep -rqF` → `rc=0` para `etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada` | OK |
| `D1.10` | `git diff --name-only c7df90c..2cd4ddd -- harness.toml` → **vazio** | OK |
| 7 regras | `harness rules --mode sweep` → `rc=0`, **0 `[BLOQUEIO]`**, 1 `[AVISO]` pré-existente | OK |

### 3.1 ⛔ `FAIL-1` · `CA-F2-2` metade (b): o DoD exige `15` e **`55`**; a árvore devolve `15` e **`54`**

```python
$ backend/.venv/bin/python  # names = {Name(Store)} ∪ {arg} ∪ {FunctionDef,AsyncFunctionDef,ClassDef}
file1 (test_infrastructure_durability.py)  ligados_distintos=15   test_*=2
file2 (test_resumable_etl_backlog.py)      ligados_distintos=54   test_*=12
```

`[MEDIDO 2026-08-29 em 75ff774, n=2 arquivos]`. O `tasks.toml` — **o dado de máquina, não só o plano** —
escreve: *"`CA-F2-2` TEM DUAS METADES E AS DUAS IMPORTAM: `em_PT=0` nos dois arquivos **E**
`ligados_distintos` continua **15 e 55**"*. **É `54`.** E o `02_retroativo_backend_tests.md:39` repete o
`55`, **verificado hoje em `master`** — a errata prescrita em 2026-08-29 **não entrou**.

**A causa não é código apagado** — `T-02.1-qa.md` §3 provou por diferença de conjuntos (`previsto −
DEPOIS = []`, `DEPOIS − previsto = []`, nos dois arquivos) que o mapa normativo de `SPEC-002` §3.1
**não é injetivo**: `processo` (variável local do `Popen`) e `process` (método) são **dois** nomes no
ANTES e **um** no DEPOIS. **`55 − 1 = 54`.** ⇒ o `55` é **insatisfazível sem contrariar a SPEC**.

E a metade (a) tem o mesmo defeito: o script de `PRD-002` §6 classifica com `x in PT or
x.startswith("test_")`, então `em_PT` **verbatim** devolve **`2` e `12`** — que é exatamente o **número
de funções de teste** de cada arquivo. Como escrita, a metade (a) **só seria satisfeita por um arquivo
sem nenhuma função de teste**.

### 3.2 ⛔ `FAIL-2` · o **falsificador declarado da fase** reprova **0 de 3**, e eu o reproduzi

`tasks.toml`/`T-02.1` e `02_retroativo_backend_tests.md:52`: *"**Apague uma docstring, um `noqa` ou uma
asserção junto com a renomeação. `CA-F2-3` TEM DE REPROVAR.**"* Bancada `n=3`, cada mutação verificada
por `git diff` antes de medir, árvore restaurada e **`git status --porcelain` vazio** depois:

| # | mutação (no arquivo **renomeado**) | `bash backend/scripts/test.sh` | `bash backend/scripts/lint.sh` | **`CA-F2-3` reprova?** |
|---|---|---|---|---|
| **M1** | apagar **uma asserção** — `test_resumable_etl_backlog.py:51`, `assert leftovers == [], …` | **`rc=0`** · `386 passed` · `TOTAL 1550 14 286 0 99%` — **idêntico à base** | `rc=1` (`F841`, `leftovers` vira variável morta) | **NÃO** |
| **M2** | apagar **uma docstring** — `:244` | **`rc=0`** · `386 passed` · `TOTAL` **idêntico** | `rc=1` (`D103`) | **NÃO** |
| **M3** | apagar o **`# noqa: S603`** — `:171` | **`rc=0`** · `386 passed` · `TOTAL` **idêntico** | **`rc=0`** | **NÃO — e M3 escapa dos DOIS portões** |

**`CA-F2-3` — o critério que o plano batiza de *"o que impede a renomeação de virar reescrita"* — não
reprova em nenhum dos três casos que ele próprio nomeia.** M1 e M2 são pegos por **`CA-F2-8`** (`lint`),
que é outro critério; **M3 não é pego por nada**.

**A causa é estrutural e citável, e é a mesma que `T-02.1-qa.md` §6 nomeou:**

```
$ sed -n '41p' backend/scripts/test.sh
"$PY" -m pytest --cov=src --cov-report=xml:coverage.xml --cov-report=term-missing "$@"
```

**O universo de cobertura é `backend/src` e só ele.** Um arquivo de `backend/tests` contribui **zero**
statement para o `1550` ⇒ **toda mutação dentro do corpo de um teste é invisível ao número que o DoD
manda observar, por construção** — e é exatamente a superfície que esta fase reescreveu.

> **Verde não prova nada até uma mutação reprovar.** Aqui rodei as três mutações que o próprio DoD
> nomeia, e o critério ficou verde nas três. Isto não é opinião sobre o relatório antigo: é medição
> nova, em `master@75ff774`, com o comando ao lado.

### 3.3 Achados que **NÃO** reprovam a fase `02` — porque são atribuíveis a OUTRAS features

**(a) A linha de base congelada mudou, e não foi esta fase.** `CA-F2-3` fixa *"`107 passed` · `370`
statements · `54` branches · `124/52/194` · `100%` — qualquer divergência reprova, **inclusive para
mais**"*. Hoje `master` mede **`386 passed` · `1550` · `286` · `99,24%`**. **Um DoD que congela a
linha de base é medível só DENTRO do range da própria fase**, e ali ele fecha: o range
`c7df90c..2cd4ddd` toca **2 arquivos de teste (renomes `R067`/`R063`)** e **2 linhas de docstring** em
`backend/src`. **Zero statement de produção alterado.** O crescimento vem de `T-03.7`, `T-03.11`,
`T-04.2` e afins, de `plataforma-dados`, mergeadas **depois** da fase `02`.

**(b) `CA-F2-9` mede `9` eventos; hoje são `10` — e o 10º é de outra feature.** Por `ast`
(`logger.<info|warning|debug|error>(<literal str>)` em `backend/src`):

```
total de chamadas logger.*                : 13
que NOMEIAM evento (1º argumento literal) : 10        (eram 9 quando T-02.1 foi medida)
```

O evento novo é **`backend/src/modules/sentimento/use_cases/probe_bucket_coupling.py:75`**, e
`git blame` o atribui a **`207c8179` — `feat(T-03.7): a topologia do balde sai de CONTESTADO…`**, de
`plataforma-dados`. **Os 4 eventos em português da fase `02` continuam intactos** ⇒ `CA-F2-9` cumprido
no que é dele.

> **⚠️ Mas o 10º é `logger.debug("leitura do contador de %s falhou: %s", …)` — string em PORTUGUÊS**,
> e essa é **exatamente** a superfície que a **linha 10** da tabela de fronteira do `CLAUDE.md` governa
> (*"nome de EVENTO DE LOG (a string em `logger.info("…")`) … **inglês, PROSPECTIVAMENTE** — todo evento
> e toda chave **novos** nascem em inglês"*), com a nota de que *"hoje são **4 em português de 9
> eventos**, e o número **não pode subir**"*. **Ele subiu, e não foi por esta feature.**
> Ressalva honesta: é discutível se `"leitura do contador de %s falhou: %s"` é *nome de evento* ou
> *mensagem* — mas o instrumento (`ast` sobre o 1º argumento literal) **não distingue os dois**, e a
> lacuna de *mensagem de exceção* que o próprio `CLAUDE.md` declara como `⏸ NÃO DECIDIDO` é a mesma
> classe de ambiguidade. **Dono: `/architect` + o dono de `plataforma-dados`. Não é achado da fase `02`
> e não entra no veredito dela.**

### 3.4 O que falta para a fase `02` virar `APPROVED` — **nenhuma ação toca código**

Dono das ações 1–3: **quem pode editar `SPEC-002` / `PRD-002` / o plano `02` e o `tasks.toml`** — não o
builder e não eu (`/qa` não edita `tasks.toml` à mão; o escritor único é `harness tasks resolve`).

1. **Errata do `55` → `54`** em `tasks.toml` (bloco `T-02.1`), `02_retroativo_backend_tests.md:39` e
   `PRD-002` §6/`CA-U2-2`, **nomeando a não-injetividade** `{processo, process} → process`.
2. **Errata do script de `CA-F2-2` metade (a)**: remover `or x.startswith("test_")` e medir contra a
   **lista fechada dos 40** de `SPEC-002` §3.1 (26 não-`test_` + 14 `test_` antigos). Como está, a
   metade (a) só é satisfazível apagando a suíte.
3. **Substituir o falsificador da fase — é o item mais grave.** Os 3 casos nomeados reprovam **0 de 3**
   (§3.2, re-medido hoje). Duas saídas, com o custo de cada uma:
   - **`CA-F2-3'`** — igualdade de fluxo de tokens módulo o mapa fechado, construída e demonstrada em
     `T-02.1-qa.md` §6.1 (**3 de 3 mordem**). Fecha os três casos, inclusive M3;
   - **`--cov=tests/sentimento`** em `backend/scripts/test.sh:41`, publicando o número no DoD. Mais
     barata, fecha **M1 e M2**, **não fecha M3** — comentário não é statement.
4. *(herdada, e vale para as três fases)* **`master` → `origin/master`** nos comandos de `diff` dos DoDs:
   rodados ao pé da letra com o ref local desatualizado, `CA-F2-7` e `CA-F1-7` reprovam **por engano**.

---

## 4. Regras bloqueantes — **7 de 7**, iguais nas três fases

`harness rules list --severity block` → **7**. Avaliadas por varredura de árvore, não por inspeção de
diff:

| # | regra | veredito | evidência |
|---|---|---|---|
| 1 | `core.relative-import` | **OK** | `harness rules --mode sweep` → `rc=0`, **0 `[BLOQUEIO]`** |
| 2 | `core.silent-except` | **OK** | idem |
| 3 | `core.print-statement` | **OK** | idem — e o `ast` de §3.3 mostra **13 chamadas de `logger` nomeado**, nenhum `print` |
| 4 | `core.hardcoded-secret` | **OK** | idem (escopo `production`) |
| 5 | `web-fullstack.browser-imports-server` | **OK, medida nos DOIS lados** | CALA: `rules --mode file --path …/panel/Filter.tsx --surface ci` → `rc=0`, **0 byte**. MORDE: caso 3/4 → **`rc=1`**, `[BLOQUEIO]` em `…/panel/serie.tsx` |
| 6 | `web-fullstack.tenant-from-request` | **OK** | idem sweep |
| 7 | `web-fullstack.server-test-directory-present` | **OK** | `test -d backend/tests` → `rc=0`; a suíte roda com **386** testes |

O único `[AVISO]` é `web-fullstack.browser-test-file-present`, **pré-existente e congelado na linha de
base**, dívida declarada de outra trilha (`NÃO FAZ` de `T-03.1`).

---

## 5. Anomalias — resposta desconhecida não é `OK` e não é `FAIL`

1. **Os dois `rc=3` de `make verify`** (`regras`, `política`) — **diagnosticados e re-medidos** em §0:
   `scripts/verify.sh` invoca `.harness/mechanism`, não resolvível **neste worktree**; com
   `$HARNESS_MECHANISM` apontado, ambos fecham `rc=0`. **Deixou de ser desconhecido.**
2. **`M1`, primeira tentativa, DESCARTADA e refeita.** O `sed '52d'` apagou `for key in keys:` —
   **erro de sintaxe**, não "asserção apagada": `test` `rc=2`, `lint` `rc=1`. Um `rc≠0` obtido assim
   é **indistinguível** de um falsificador que morde, e teria virado um "M1 reprova" falso.
   **Refeito em `:51`, com o `git diff -U0` da linha conferido antes de medir.** Registro porque
   descartar em silêncio é o defeito que este relatório cobra dos outros.
3. **`shellcheck` continua ausente** (`command -v shellcheck` → `rc=1`). Não é portão declarado
   (`harness policy --key test_cmd` declara só `sentimento`); não reprova, fica escrito.

**Higiene da bancada:** as 4 mutações de `backend/tests` e os 2 violadores plantados em `frontend/src`
foram revertidos por `git checkout --` / `rm`; `git status --porcelain` **vazio** ao fim (salvo o
symlink de `frontend/node_modules`, removido antes do `git add`). **Nenhum código de produção tocado.**

---

## 6. Veredito formal

```
## QA Gate — Fase 01 [docs] · codigo-em-ingles @ master 75ff774
- [OK] 7 de 7 regras bloqueantes — harness rules --mode sweep -> rc=0, 0 [BLOQUEIO], 1 [AVISO]
- [OK] ADR-011/D1.10 — grep -cE '^\s*\[\[rules\.own\]\]' harness.toml -> 0; diff do range -> vazio
- [OK] Testes existem e passam — make verify -> 6 portoes verdes, 386 passed
- [OK] Cobertura domain 100% / use_cases 100% / infra 97,7% contra meta 90/80/70 — 3 de 3 acima
- [OK] DoD — CA-F1-1=12 · F1-2=1 · F1-3=2 · F1-4 (3 lados) · F1-5 (7 e 0) · F1-7=`1 0` · F1-8 vazio
       · F1-9 rc=0 · T-01.3: 2 arquivos, SPEC_APPROVED conferido no ledger, docs/adr vazio
- [anomalia] os 2 rc=3 de make verify: `.harness/mechanism` nao resolve neste worktree — RE-MEDIDO
             com $HARNESS_MECHANISM, ambos rc=0
Regras bloqueantes avaliadas: 7 de 7
Veredito: APPROVED
Escalado (nao reprova): CLAUDE.md diz "depois dela, 13 e zero"; medido 14 e zero. Dono /architect.
```

```
## QA Gate — Fase 03 [docs][web] · codigo-em-ingles @ master 75ff774
- [OK] 7 de 7 regras bloqueantes — sweep rc=0, 0 [BLOQUEIO], 1 [AVISO] pre-existente
- [OK] Testes existem e passam — make verify -> 6 portoes verdes, 386 passed, lint-frontend rc=0
- [OK] Cobertura domain 100% / use_cases 100% / infra 97,7% contra meta 90/80/70
- [OK] DoD — CA-F3-1=4 · F3-2 (1 e 1) · F3-3 os 4 casos RE-EXECUTADOS (rc=1/0/1/0) · F3-4 (0,0,1,1)
       · F3-5 (0 e sonda producao rc=0) · F3-6 tres lados (rc=0 x4, rc=1 x4, producao x4)
       · F3-7 vazio · F3-8=1 · F3-9 rc=0 · CA-F1-4=0 · CA-F1-6 {sentimento} tamanho 1 CALA
       · RN-3 (1 e 1 na mesma linha) · NAO FAZ (0 test files, 1 [AVISO])
- [anomalia] mesma dos 2 rc=3, ja resolvida
Regras bloqueantes avaliadas: 7 de 7
Veredito: APPROVED
Escalado (nao reprova): o `13` de 03_retroativo_frontend.md:47 -> medido 14. Dono /architect.
```

```
## QA Gate — Fase 02 [docs][sentimento] · codigo-em-ingles @ master 75ff774
- [OK] 7 de 7 regras bloqueantes — sweep rc=0, 0 [BLOQUEIO]
- [OK] Testes existem e passam — make verify -> 6 portoes verdes, 386 passed
- [OK] Cobertura domain 100% / use_cases 100% / infra 97,7% contra meta 90/80/70
- [OK] CA-F2-1 (R067+R063, nada alem) · F2-4 CALA 0/0 · F2-5 dois lados (rc=0 e rc=1)
       · F2-6 (1 arquivo, 2 linhas de docstring) · F2-7 vazio · F2-8 rc=0 · D1.10 vazio
- [OK] CA-F2-9 no que e dele: os 4 eventos PT intactos (grep -rqF rc=0 x4)
- [FAIL] CA-F2-2 metade (b) — o DoD do tasks.toml exige `ligados_distintos` 15 e 55;
         `ast` mede 15 e 54. O mapa normativo de SPEC-002 §3.1 nao e injetivo
         ({processo, process} -> process) => 55 e insatisfazivel sem contrariar a SPEC
- [FAIL] Falsificador declarado da fase — "apague docstring / noqa / assercao => CA-F2-3 TEM DE
         REPROVAR": bancada n=3 em master, CA-F2-3 reprova 0 de 3. M3 (noqa) escapa de test E lint.
         Causa: backend/scripts/test.sh:41 tem --cov=src, logo backend/tests contribui 0 statement
- [anomalia] M1, 1a tentativa: sed apagou `for key in keys:` (erro de sintaxe), DESCARTADA e refeita
Regras bloqueantes avaliadas: 7 de 7
Veredito: NEEDS_FIX
Acoes (nenhuma toca codigo): 1. errata 55->54 com a nao-injetividade nomeada.
  2. errata do script de CA-F2-2 (a): remover `or x.startswith("test_")`, medir contra a lista
     fechada dos 40. 3. substituir o falsificador: CA-F2-3' (3 de 3) ou --cov=tests/sentimento
     (fecha M1/M2, nao M3). 4. `master` -> `origin/master` nos comandos de diff dos DoDs.
```
