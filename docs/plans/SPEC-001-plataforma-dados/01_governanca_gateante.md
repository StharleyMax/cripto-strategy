# Fase 01 — Governança gateante

> **⚠️ Reescrita em 2026-08-28 por correção de rumo do owner.** O mecanismo de validação escolhido nesta fase foi derrubado: `[[rules.own]]` de camada e de TypeScript saem, **`import-linter` e ESLint entram**, o gerenciador passa a **Poetry** atrás de um **`Makefile`**, e o Python volta a **3.13**. A decisão, com o que ela supersede e um falsificador por item, está em [`ADR-011`](../../adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md). Os itens afetados são `1.4(c)`, `1.6`, `1.8`, `1.9'`, `1.10`, `1.11`; os DoD, `D1.3`, `D1.3b`, `D1.5`, `D1.7a`–`D1.7e`, `D1.8`–`D1.10`. **`D1.4` não foi tocado.**

**Epic:** `CST-1` (F5a) · **Componente alvo: `docs`** (+ `harness.toml`; **`1.11` também é `sentimento`** — ver "Não faz") · **Gate:** nenhum · **Só `1.1` (o runner) fecha ANTES de `02`/`03`/`04`** — `1.2` e `1.3` fecham antes de `05`, por `D-1` (owner, 2026-08-28 — [registro](../../context/plataforma-dados/decisoes-de-execucao-2026-08-28.md) §2)

**Por que primeiro:** as condições de pronto de `02` e `03` **já são testes** (`CA-F0-3` é o M-1, `CA-F0-4` é a rampa até o primeiro 429, `CA-F0-5` é matar o processo e retomar). Medido: `harness policy --key test_cmd` → **`{}`**. **Sem runner, a fase cujo dado não se recaptura termina com sete afirmações e nenhuma conferível por comando.**

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 1.1 | `[test_cmd]` declarado **e o primeiro teste nascendo junto** — `pytest` com piso de cobertura **por camada**, na forma medida no vizinho | `[GAP G2]`, `CA-F5-5`, `ADR-009/D1` | `docs` |
| 1.2 | `[agents.by_component]` ganha entrada para **`charts`** e **`web`** | `CA-F5-1`, `Q16`, `ADR-003` | `docs` |
| 1.3 | Fronteira `charts` ⇄ `web` registrada como ADR e **traduzida em contrato `forbidden` de import por componente** | `ADR-003`, `ADR-009/D1` | `docs` |
| 1.4 | Cobertura de `frontend/` fechada, em **três partes que só valem juntas**: **(a)** `code_paths.include_prefixes += "frontend/src/"`; **(b)** globs TS/TSX em `include_globs`; **(c)** **o pack `web-fullstack` adotado — e NENHUMA `[[rules.own]]` de TypeScript** (as duas que `T-01.2` declarara caíram em `ADR-011/D4`). **(a)+(b) sem (c) não fecha nada**, e (c) sem (a)+(b) também não | `CA-F5-4`, `ADR-009/D3`, `ADR-011/D4` | `docs` |
| 1.5 | Layout fixado em `frontend/src/{app,features,components}` — **decisão de enforcement, não de estética** | `ADR-009/D3` | `docs` |
| 1.6 | **`.python-version` MANTIDO** na raiz (`3.13.13`) e **Python 3.13 declarado** em quatro superfícies: `requires-python`, `mypy python_version`, `ruff target-version` e o `PY_ALVO` do `bootstrap.sh`. **Inverte `ADR-009/D4`**, que mandava remover o arquivo e declarar 3.12 | `ADR-011/D5` (supersede `ADR-009/D4`) | `docs` |
| 1.7 | **Proposta** de componente `infra` levada ao owner, com o argumento e o falsificador. **Não decidida aqui** | `ADR-009/D5` | `docs` |
| 1.8 | Toda `[[rules.own]]` que esta fase declarar nasce **com corpus**. **É um CONDICIONAL, e o antecedente ficou FALSO:** com `ADR-011/D3` e `D4` a fase deixa de declarar regra própria ⇒ `1.8` **não obriga nada**. **Fica no plano**, porque volta a morder se alguma task desta fase declarar uma. **Vácuo não é cumprido** | `SPEC-001` §12 | `docs` |
| 1.8' | **O sucessor de `1.8`, para ferramenta externa — o TESTE DOS DOIS LADOS.** `harness corpus verify`/`mutate` só falam de regra do `harness`: **não alcançam `import-linter` nem ESLint**. Toda ferramenta adotada como portão nesta fase nasce com prova de que **MORDE** (violador plantado ⇒ `exit ≠ 0`, nomeando o contrato/regra) **e** de que **CALA** (o código legítimo de hoje ⇒ verde). **Uma sem a outra não conta:** "morde" sozinho não exclui ferramenta que reprova tudo; "cala" sozinho é indistinguível de ferramenta desligada | `SPEC-001` §12, `ADR-011` | `docs` |
| 1.9' | **Fronteira de módulo por `import-linter`, e o PORTÃO que a roda — duas metades, a segunda obrigatória.** **(a)** `[tool.importlinter]` em `backend/pyproject.toml` com `root_package = "src"`, um contrato `type = "layers"` (`infra > use_cases > domain`, `containers = ["src.modules.<ctx>"]`, `exhaustive = false`) e contratos `type = "forbidden"` por componente; alvo `make boundaries`. **(b)** `scripts/hooks/pre-push.pre-harness` versionado, rodando `make boundaries` — **a costura que o hook gerado já documenta e chama**, sem editá-lo e sem `core.hooksPath`. **Sem (b), (a) é ferramenta que ninguém roda** | `ADR-011/D3` (supersede o `1.9` antigo), `ADR-009/D1` peça 1, `ADR-003:61` | `docs` |
| 1.10 | **Poetry + `Makefile` na raiz como fachada única** — `setup`, ativação da venv, `lint`, `test`, `boundaries`, `build`. O `Makefile` **CHAMA** `backend/scripts/*.sh`, **não os absorve**; `backend/poetry.toml` versionado com `[virtualenvs] in-project = true` para que `backend/.venv` continue existindo onde os scripts o procuram | `ADR-011/D1`, `ADR-011/D2` | `docs` |
| 1.11 | **Docstrings em inglês, com correção retroativa das 18 de `backend/src`** — **convenção declarada, NÃO portão**. `README.md` da raiz atualizado com setup e ativação da venv **por comando `make`** | `ADR-011/D6` | `docs` + `sentimento` |
| 1.12 | **O portão de shell — `make lint-shell` por `bash -n`, pré-requisito de `make lint`.** Descoberta **por shebang, não por extensão**: o glob `*.sh` perderia `scripts/hooks/pre-push.pre-harness` e `scripts/hooks/commit-msg`, que são os dois que mais importam. `bash` ausente ⇒ **`rc=3`** (`ADR-011/D2`) | `ADR-012/D1`, `ADR-012/D3` | `docs` |
| 1.13 | **A atribuição de `Q16` vira propriedade medida** — asserção de arquivo-dourado sobre `harness policy --key agents.by_component`, no `make`. **Não é roteamento** (`ADR-012/D5a` recusa, e é do `harness-plugin`); é fazer com que **desfazer a decisão do owner custe editar duas superfícies** | `ADR-012/D5b`, `Q16`, `docs/gate-de-design.md` | `docs` |

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D1.1** | o runner existe e roda | `harness policy --key test_cmd` **deixa de devolver `{}`**, e o comando declarado **roda verde** | **≥ 1 teste**, e ele é um dos de `02`/`03` |
| **D1.2** | dono de julgamento existe para os dois | `harness policy --key agents.by_component` **contém `charts` e `web`** | **2 componentes** |
| **D1.3** | **cobertura de `frontend/` FECHADA, medida por bloqueio devolvido — e o violador não é mais de `[[rules.own]]`** | `harness rules --mode file --path frontend/src/<violador>.tsx` **devolve BLOQUEIO nomeando `web-fullstack.browser-imports-server`**, `exit=2`; **e** o mesmo comando sobre um `.tsx` legítimo devolve **silêncio, `exit=0`** (é `1.8'` aplicado ao pack) | **2 arquivos: 1 violador** (`import … from "…/backend/src/…"`) **e 1 legítimo**. `[MEDIDO 2026-08-28 em bancada, fixture fora do repositório: violador → `{"decision": "block"}` citando `browser-imports-server`, `exit=2`; legítimo → saída vazia, `exit=0`]` |
| **D1.4** | a lacuna medida **antes** não se repete | o **mesmo** comando de D1.3 devolvia **saída VAZIA, zero regras avaliadas** `[MEDIDO]`. **Passar exige que a saída mude** | idem. **Re-medido no repositório real em 2026-08-28, sem nada escrito nele:** `harness rules --mode file --path frontend/src/features/painel/serie.tsx` → **saída vazia, `exit=0`**. A baseline sobrevive à troca de mecanismo porque a causa é `code_paths`, não a regra |
| **D1.3b** | **a troca de regex por AST comprou o que `ADR-011/D4` diz que compra** — e isto é `[NÃO MEDIDO]` até `/build` medir | o ESLint **do projeto** (não o global) sobre os **3 arquivos de bancada**: acusa `tipos.ts`, **cala** em `config.ts` e em `Filtro.tsx` | **3 arquivos / 4 linhas / 2 violações reais / 2 usos legítimos.** O "antes" está medido e é o argumento inteiro: nenhuma das 2 variantes de regex acerta os 3 — `:\s*any\b` → **2 falsos negativos + 1 falso positivo**; `\bany\b` → **2 falsos positivos** `[MEDIDO 2026-08-28]`. **Reprova se o ESLint repetir qualquer um dos dois defeitos** |
| **D1.5** | ~~regra própria é enforcement medido~~ → **VÁCUO, e vácuo não é cumprido** | `harness corpus verify` / `harness corpus mutate` | **`0` regra.** Com `ADR-011/D3` e `D4`, a fase declara **zero `[[rules.own]]`** ⇒ não há o que rodar. **Não é "rodei o corpus e passou"** — mesmo registro que `T-01.1` já fez `[DOC: harness.toml]`. **A obrigação não evapora: ela migra para `D1.7e`, que é `1.8'`** |
| **D1.6** | ~~fronteira de componente **executável**~~ → **MIGROU para a fase `05` como `D5.12`** em 2026-08-29 pelo `/architect`. **Não é diferimento com prazo: é correção de endereço** — ver *"`D1.6` não era DoD desta fase"* abaixo | ~~o contrato `forbidden` de import **reprova** um import de `charts` para `web` e vice-versa~~ **A propriedade verificada é a MESMA e o universo é literal; o comando ficou ESTRITAMENTE mais forte** — ganhou a metade **`cala`** de `1.8'`, que `D1.6` não exigia `[/review 2026-08-29]` | ~~**2 imports proibidos, 1 em cada direção**~~ — o universo que ele exige **nasce em `05`**, e o dono executável é `T-05.1`/`CST-35` |
| **D1.7a** | **direção de camada FECHADA, medida por reprovação devolvida — agora por grafo, não por regex** | `make boundaries` (⇒ `poetry run lint-imports`) **sai `≠ 0`** nomeando o contrato `layers`, com os **dois** violadores plantados | **2 violadores**: `backend/src/modules/sentimento/domain/<x>.py` com `from src.modules.sentimento.use_cases…` e `backend/src/modules/sentimento/use_cases/<x>.py` com `from src.modules.sentimento.infra…` |
| **D1.7b** | a lacuna medida **antes** não se repete — **e a baseline mudou de forma, não de força** | o **mesmo** comando de D1.7a hoje **nem existe**: `lint-imports --version` → **`command not found`**; `grep -c importlinter backend/pyproject.toml` → **`0`**; `ls .importlinter backend/.importlinter` → **ausentes**; `ls Makefile` → **ausente** `[MEDIDO 2026-08-28]`. **Passar exige que a saída mude de "comando inexistente" para um veredito** | idem |
| **D1.7c** | **o portão que de fato reprova existe — e é ele que fecha, não o alvo de `make`** | com os 2 violadores em um branch, **`git push --dry-run` é RECUSADO**; sem eles, **aceito** | **o `pre-push`.** Hoje ele roda `require-push` + `rules --mode sweep` e **não roda `make`** `[MEDIDO 2026-08-28: cat .git/hooks/pre-push]`, e **não há CI** `[MEDIDO 2026-08-28: ls .github → inexistente]`. A costura é `scripts/hooks/pre-push.pre-harness`, que o hook gerado **já chama** e que `scripts/install-git-hooks.sh` **já instala** — **zero edição no hook gerado, zero `core.hooksPath`** (proibido pelo `CLAUDE.md`) |
| **D1.7d** | a ferramenta **não reprova o código legítimo de hoje** | `make boundaries` **verde** com os contratos declarados e **nenhum** violador plantado | **10 arquivos de produção** sob `backend/src`; o único import interno do repositório (`use_cases` → `domain`) **tem de continuar passando** `[MEDIDO 2026-08-28: grep -rnE '^[[:space:]]*(from\|import)[[:space:]]+src' backend/src --include='*.py' \| wc -l → 1]`. Universo total que o sweep enxerga: **13 `.py`** `[MEDIDO 2026-08-28: find backend/src backend/tests -name '*.py' -not -path '*/__pycache__/*' \| wc -l → 13. **Não** `find backend …`: devolve **888**, porque `backend/.venv` tem **875** `.py`]` |
| **D1.7e** | **`1.8'` aplicado — o teste dos DOIS LADOS, que substitui o corpus** | `D1.7a` (**morde**) **e** `D1.7d` (**cala**), os dois verdes na mesma passada, para **cada** contrato declarado | **cada contrato `layers` e cada contrato `forbidden`.** `harness corpus verify`/`mutate` **não alcançam `import-linter`** — por isso a prova é o par morde/cala, e **não** o corpus. **Reprova se só um lado for exibido:** contrato que reprova tudo passa em `D1.7a` e falha em `D1.7d`; contrato desligado passa em `D1.7d` e falha em `D1.7a` |
| **D1.8** | **as DUAS recusas duramente conquistadas sobreviveram à migração para Poetry** | `bash backend/scripts/test.sh --no-cov -k <1 teste>` → **`rc=3`** (relatório ausente) · `touch backend/src/modules/sentimento/domain/etl_backlog.py && bash backend/scripts/check-coverage-layers.sh` → **`rc=3`** (relatório velho, com o arquivo ofensor nomeado) | **2 recusas.** Os dois valores de "antes" estão publicados em `backend/README.md`: ambos **`rc=3`**. **`rc` diferente de 3 em qualquer uma reprova a fase** — é o falsificador de `ADR-011/D2`. **`rc=3` por "venv não existe" NÃO conta como aprovação**: é a falha que `backend/poetry.toml` com `in-project = true` existe para impedir |
| **D1.9** | **Python 3.13 declarado nas superfícies que declaram, e o `.python-version` FICA** — **comando REESCRITO em 2026-08-29 pelo `/architect`; a propriedade verificada é a MESMA** (ver *"o comando de `D1.9` contava a si mesmo"* abaixo) | `cat .python-version` → **`3.13.13`** · **(a)** `grep -nE '^(requires-python\|python_version\|target-version\|PY_ALVO)' backend/pyproject.toml backend/scripts/*.sh` **lista** as declarações · **(b)** a mesma lista passada por `grep -cvE '3\.13\|py313'` → **`0`** · `backend/.venv/bin/python -V` → **`Python 3.13.x`** | **(a) → 6 declarações** (3 `PY_ALVO` em `bootstrap.sh`/`lint.sh`/`boundaries.sh` + `requires-python`, `target-version`, `python_version`) **e (b) → `0` divergentes** `[MEDIDO 2026-08-29 na base `48d5500`]`. **O universo é DELIBERADAMENTE não fixo NO TETO, e tem PISO:** reprova se **`(b) ≠ 0`** *(alguma declaração fora de 3.13)* **ou se `(a) < 4`** *(o piso)*. Assim uma superfície nova que nasça em 3.13 **passa** — era o defeito do `N=4` antigo, que teria reprovado o `boundaries.sh`, nascido **correto** — e uma que nasça em 3.12 **reprova**. **⚠️ O piso é correção do `/review` em 2026-08-29, e sem ele o critério PASSAVA POR VACUIDADE:** com **zero** declarações, `(b) = 0` e o DoD fechava `[MEDIDO 2026-08-29: `grep -nE '^(…)' /dev/null | grep -cvE '3\.13|py313'` → **`0`**]`. O `N=4` antigo fechava essa porta e a forma nova a reabriu; o piso recupera-a **sem** voltar a reprovar superfície que nasce certa. A frase *"declarado nas superfícies que declaram"* é circular sozinha — é `(a) ≥ 4` que a ancora. O assert de `bootstrap.sh` continua conferindo a versão do venv e **saindo 3** se divergir |
| **D1.10** | **docstrings em inglês — e o repositório declara que NÃO as mede** | `ruff check --select D` **verde** (mede **presença e forma**, jamais idioma) **e** o `README.md` da raiz contendo, por escrito, que *"idioma de docstring é convenção, não portão"* | **18 docstrings** de `backend/src` `[MEDIDO 2026-08-28 por `ast`: 18, 100% em português]`. **Este DoD reprova se alguém declarar uma `[[rules.own]]` de idioma:** a de diacrítico devolve **0 achados sobre as 18** `[MEDIDO]`, e a de palavra-função ASCII pega **12 de 18** — **33% de falso negativo**. Portão cego reprova a fase |
| **D1.11** | **o portão de shell MORDE e CALA — `1.8'` aplicado, as duas metades na mesma passada** | **morde:** um `if` sem `fi` apensado a uma cópia de `scripts/hooks/pre-push.pre-harness` ⇒ `make lint-shell` **`≠ 0`** nomeando o arquivo e a linha · **cala:** a árvore limpa ⇒ **`rc=0`** · **e o que de fato fecha:** com a mutação na árvore, **`git push --dry-run` é RECUSADO** | **9 arquivos de shell** — 5 em `backend/scripts/`, 2 em `scripts/`, 2 em `scripts/hooks/` `[MEDIDO 2026-08-29: `bash -n` sobre os 9 → **9 de 9 em rc=0**, cada `rc` impresso; e a mutação sobre cópias de `boundaries.sh` e `pre-push.pre-harness` → **2 de 2 em rc=2**, nomeando a linha]`. **O "antes" é ZERO e não "bash -n": nenhum alvo de `make` e nenhum hook o invocam** `[MEDIDO 2026-08-29: `grep -rn 'bash -n'` na base `48d5500` → **3 ocorrências, 3 de 3 em PROSA**]`. **⚠️ Este DoD NÃO fecha semântica de guarda** — ver o limite em `ADR-012/D3` |
| **D1.12** | **a atribuição do owner deixa de ser desfazível em silêncio** | `make lint` **`≠ 0`** quando `harness policy --key agents.by_component` divergir do esperado declarado; **verde** sobre a política de hoje | **as 3 mutações que hoje passam em `rc=0`** `[DOC: docs/gate-de-design.md §"O que a mutação mostrou" — apagar `design_gate`, TROCAR `charts`↔`web`, esvaziar a secção; 5 mutações medidas em 2026-08-28 por `T-01.3`]`. **Reprova se a asserção só cobrir presença de chave:** é exatamente o defeito de `D1.2`, cujo comando é satisfeito por `{"charts": {}}`. **A saída é JSON de chaves ordenadas** `[MEDIDO 2026-08-29: `harness policy --key agents.by_component` → ordem `backtest, charts, convergencia, sentimento, web`]` |

### ⚠️ RECONCILIAÇÃO DE 2026-08-29, `/architect` — as seis dívidas que a fase 01 deixou

**Acrescentado depois de a fase `01` fechar (7 de 7 tasks; `f01·QA=APPROVED` e `f01·REVIEW=COMPLIANT` no ledger). Nenhuma linha acima foi apagada** — as que mudaram de valor estão **tarjadas**, e as medições que as sustentavam continuam legíveis. Cinco destas seis só podem ser resolvidas aqui, porque `docs/plans/**` e `docs/adr/**` são superfície do `/architect`.

#### `D1.6` não era DoD desta fase — e chamá-lo de "diferido" seria conservar o defeito com nome melhor

**A contradição, em uma linha:** o ledger diz que a fase `01` passou; o documento dizia que um DoD dela estava aberto. **Uma das duas superfícies estava errada, e não é o ledger** — `CLAUDE.md`: *"o ledger é a identidade do estado, não o texto do documento"*.

**As três saídas que estavam na mesa, e por que duas são piores:**

| saída | por que não |
|---|---|
| **manter `D1.6` na fase `01`, marcado "diferido com gatilho"** | põe a fase num estado que **nenhum evento futuro resolve**: o gatilho dispara em `05`, e ninguém reabre uma fase fechada para carimbar um DoD. Produz um documento permanentemente em desacordo com o ledger — a classe exata que o `CLAUDE.md` nomeia |
| **transformá-lo em DoD só de `T-05.1`** | `tasks.toml` é superfície do `/tech-lead`, e — mais forte — uma obrigação escrita **só** na task é invisível a quem não abre aquela task. É o argumento que `ADR-003:134-140` já usou para escrever o mesmo gatilho em **três** superfícies em vez de uma |
| ✅ **migrar o DoD para a fase `05` como `D5.12`** | é onde o universo nasce, é onde as duas metades de `1.8'` ficam disponíveis **na mesma passada**, e a **propriedade** verificada não muda — o universo migra literal e o comando fica **mais forte**, ganhando a metade `cala` `[/review 2026-08-29]` |

**Por que isto é correção de endereço e não relaxamento:** o critério continua sendo *"o contrato reprova um import de `charts` para `web` e vice-versa"*, com o mesmo universo de 2 imports. O que estava errado era a **fase** em que ele foi escrito. `ADR-003:230-235` já nomeava os dois donos — `T-05.1` para o contrato executável e o `/architect` para *"a reconciliação do plano"*. **Esta é a segunda metade sendo paga.**

**A aresta `1.3 → 05` continua fazendo sentido, e ela já se descarregou.** `T-01.2` e `T-01.3` precedem `05` porque o relógio de retrabalho de `Q16` é *"antes do primeiro `.tsx`"* e o primeiro `.tsx` é `05` `[DOC: index.md §"Ordem e dependência real"; `D-1`, owner, 2026-08-28]`. As duas estão **fechadas** e entregaram o que `05` precisa: dono de julgamento para `charts` e `web`. **O que a aresta nunca prometeu foi o contrato executável** — ela é sobre **quem julga**, não sobre **o que reprova**. Confundir as duas foi como `D1.6` acabou nesta fase.

**Falsificador desta decisão, e ele é observável em `05`:** se, ao implementar `T-05.1`, o contrato `forbidden` **continuar** só declarável por caminho — isto é, se `ADR-003:46` continuar sendo violado para satisfazê-lo mesmo com universo cheio — então o problema **nunca foi de fase**, é de `ADR-003` ter especificado um teste que a linguagem não suporta (`ADR-003:75`, *"inexequível como escrita"*), e a decisão certa é **reescrever `FR-1`/`FR-2` com um instrumento que exista** — não mudar o DoD de casa outra vez.

#### O comando de `D1.9` contava a si mesmo — e não foi a `T-01.6` que o quebrou

O comando publicado era `grep -n 'requires-python\|python_version\|target-version\|PY_ALVO' backend/pyproject.toml backend/scripts/bootstrap.sh`, esperando **"4 ocorrências, todas 3.13"**. **Ele deixou de contar declarações e passou a contar menções — inclusive as suas próprias.** A história, medida commit a commit:

```
$ for c in ddccc76^ ddccc76 af02beb 48d5500; do ... grep -c <o padrao literal> ... ; done
ddccc76^  ->  4      # o valor que o DoD publica
ddccc76   -> 14      # T-01.4
af02beb   -> 14
48d5500   -> 22      # hoje
```

`[MEDIDO 2026-08-29: `git show <c>:<arquivo> | grep -c`, os dois arquivos somados, em linhas casadas]`

**Quem o tornou incontável foi `T-01.4`, não `T-01.6`.** Ao fazer as mensagens de recusa **citarem os nomes em prosa**, o padrão passou a casar a si mesmo: 4 → 14 num único commit. `T-01.6` e `T-01.5` só continuaram inflando. **A atribuição importa** porque a lição não é *"cuidado ao editar scripts"*, é **um padrão não-ancorado sobre um arquivo que fala sobre o próprio padrão não tem ponto fixo.**

**A forma nova ancora no início da linha, e por isso conta declaração:** `grep -nE '^(requires-python|python_version|target-version|PY_ALVO)'` → **6 linhas**, todas visíveis na saída, **0 divergentes** `[MEDIDO 2026-08-29, os dois comandos rodados; a lista impressa e a contagem de divergentes impressa — nenhuma das duas inferida de saída vazia]`.

**E o universo deixou de ser um número fixo, de propósito.** O DoD antigo dizia *"4 ocorrências"* e por isso **envelhecia a cada superfície nova**: `boundaries.sh` nasceu em `T-01.5` com um `PY_ALVO` **correto** e teria reprovado um DoD que exige exatamente 4. O critério novo é `(b) = 0` — **nenhuma declaração divergente** — e ele é estável sob crescimento: superfície nova em 3.13 passa, superfície nova em 3.12 reprova. **A propriedade que o DoD sempre quis verificar é essa; o número 4 era um proxy que se descolou dela.**

#### `scripts/**` e `*.sh` — decidido em [`ADR-012`](../../adr/ADR-012-o-portao-de-shell-e-o-make-nao-o-code-paths.md), e a formulação corrente estava incompleta

A dívida chegou como *"acrescentar `*.sh` a `include_globs`?"*. **A pergunta é o defeito** — ela pressupõe que o `harness` é o lugar. `ADR-012/D4` fixa a regra que faltava: **o alcance de `harness rules` é o arquivo-fonte sob `code_paths`; o que precisa morder e não é isso mora no `make`.** Daí saem os itens `1.12` e `1.13` e os DoD `D1.11` e `D1.12`.

**O que acrescento ao que o `/review` já tinha medido, e é o argumento que fecha:** o glob `*.sh` **não alcança os dois arquivos que mais importam** — `scripts/hooks/pre-push.pre-harness` e `scripts/hooks/commit-msg` **não têm extensão** `[MEDIDO 2026-08-29: `ls scripts/hooks/` → os dois nomes, sem sufixo]`. O segundo é o portão que o `CLAUDE.md` declara em voz alta. Fechar a lacuna por extensão a fecharia **exatamente onde ela não dói**.

**E `bash -n` não estava em operação, ao contrário do que a frase corrente sugeria.** *"Governados por `bash -n` e por mais ninguém"* descreve um verificador que **não existe**: as 3 ocorrências no repositório estão **todas em prosa** `[MEDIDO 2026-08-29 na base `48d5500`]`. O que há é o parse incidental da execução — e ele **executa efeitos colaterais até o ponto do erro** `[MEDIDO 2026-08-29: sonda com erro na última linha → `bash sonda.sh` imprime a primeira linha **antes** de recusar; `bash -n` recusa sem executar nada]`. Num arquivo que decide se um push passa, descobrir o defeito executando é a ordem errada.

#### O precedente de fronteira da `T-01.7` aterrissa no [`index.md`](index.md), não aqui

**Decisão de endereço, com o argumento:** a razão do `/review` — *"quando fronteira de escopo escrita em `tasks.toml` colide com decisão de arquitetura registrada em ADR, a ADR ganha"* — **não é sobre docstrings nem sobre a fase `01`.** É uma regra de precedência entre duas superfícies, aplicável a **qualquer** task de **qualquer** fase. Escrevê-la aqui a esconderia de oito fases; escrevê-la só em `tasks.toml` a esconderia de quem não abre `T-01.7`. **Ela é a `Regra 5` do plano.** A metade que **não** é minha — a redação da fronteira na próxima task deste tipo — está nomeada lá, com o texto pronto para o `/tech-lead` copiar.

#### ⏸ O que fica PARA O OWNER, e as duas perguntas estão formuladas para serem respondíveis

**(1) A feature órfã `docstrings-em-ingles`.** Estado medido: `INIT`, **um único evento** (`override — "execução sem risco"`, 2026-08-28T19:45:52Z), **sem escopo declarado** `[MEDIDO 2026-08-29: `harness pipeline show docstrings-em-ingles`]`.

> **Pergunta: encerro `docstrings-em-ingles`, ou ela recebe trabalho novo?**
>
> **Minha recomendação: ENCERRAR.** O argumento: **o trabalho dela já foi feito e cardado noutro lugar.** `T-01.7`/`CST-91` fechou em 2026-08-29 com `/qa APPROVED` e `/review COMPLIANT`, entregou **55 docstrings em inglês** (contra as 18 declaradas) e — o que mais importa — fez o portão **medir** o que antes não media (`"D"` entrou no `select` do `ruff`). A feature órfã não tem escopo, não tem PRD, não tem task, e **não colide com nada hoje** (a resolução do portão de escrita só considera features `>= BUILD_AUTHORIZED`). **O custo de mantê-la não é técnico, é de ambiguidade:** duas casas para o mesmo trabalho é a classe em que uma das duas nunca é resolvida — e ela já sobreviveu a um ciclo inteiro sem que ninguém soubesse o que fazer com ela. **Falsificador da minha recomendação:** se o owner a criou para trabalho de docstring **fora** de `backend/` — o `frontend/`, por exemplo, que não tem docstring nenhuma medida —, então ela tem escopo real, e o certo é **declará-lo**, não encerrá-la. **Eu não sei qual dos dois é o caso: o único evento no ledger não diz, e não há PRD.** `[NÃO SEI]`
>
> **`/architect` não encerra feature** — `advance DONE` é gate do owner.

**(2) Rotear o despacho por `design_gate` — e a pergunta não é para este repositório.** Medido: **`design_gate` não aparece uma única vez no `harness-plugin` v0.13.0** `[MEDIDO 2026-08-29: `grep -rn 'design_gate' <plugin>` → rc=1, zero ocorrência]`, e os únicos consumidores da chave de política são `commands/build.md:36` e `commands/qa.md:19`, **agindo exclusivamente sobre `builder` e `qa`**.

> **Pergunta: levar ao `harness-plugin` um roteamento por papel arbitrário (`design_gate`, `architect`), ou a doutrina declarada basta?**
>
> **Minha recomendação: a doutrina basta AQUI, e o roteamento é proposta ao `harness-plugin`.** Duas razões. **(i) Fronteira de repositório:** os comandos vivem no plugin instalado, fora deste repo; editá-los daqui produziria mudança não-versionada e perdida no próximo upgrade — a mesma fronteira que este plano já respeitou ao recusar consertar o pack `hexagonal-layers` de dentro daqui (ver o ⚠️ *"`D1.7` não passa com o pack `hexagonal-layers`"*, e **a âncora é o texto, não o número da linha** — a inserção desta seção moveu o alvo, que era `01:60` na base `48d5500`). **(ii) `architect` tem a MESMA propriedade** e está declarado para `sentimento`/`convergencia`/`backtest` desde antes desta feature — logo não é fraqueza que `T-01.3` introduziu, e tratá-la como dívida da fase `01` atribuiria a `charts`/`web` um defeito que o repositório sempre teve.
>
> **O que eu NÃO deixo passar como "a doutrina basta":** que a **atribuição** do owner seja desfazível em silêncio. Isso é deste repositório, é barato, e vira `1.13`/`D1.12` — `ADR-012/D5b`.

---

### ⚠️ CORREÇÃO DE RUMO DO OWNER, 2026-08-28 — o escopo dos três ⚠️ abaixo

**Acrescentado pelo `/architect` depois de o owner derrubar o mecanismo de validação escolhido nesta fase. Nenhuma linha abaixo foi apagada** — elas carregam medições que **continuam verdadeiras** e que é preciso poder reler. O que mudou foi a **conclusão** que elas sustentavam, e a decisão nova está em [`ADR-011`](../../adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md).

| ⚠️ abaixo | ainda vale? | o que mudou |
|---|---|---|
| *"`D1.7` não passa com o pack `hexagonal-layers`"* — os **três defeitos** do pack | **VALE INTEIRO.** Nada nele foi remedido | só a **última frase** cai: *"e por isso `1.9` declara regra própria"*. O `1.9'` novo declara **`import-linter`**, não `[[rules.own]]`. Consertar o pack continua sendo mudança em outro repositório |
| *"`ADR-003:61` — `grep` não é aprovação — é atendido"* | **as duas medições valem; o argumento ficou DESNECESSÁRIO** | ele existia para defender uma regex. `import-linter` lê o **grafo de imports** via `grimp` — não é `grep`, e a objeção não se aplica. **E a razão (1) era mais frágil do que parecia:** ela dependia de `core.relative-import` continuar ligada, e não cobria `import src.modules.x.infra as y`, re-export por `__init__.py`, nem import dentro de função. **O grafo vê os três** (`ADR-011/D3`) |
| *"`D1.3` é o critério que o `CA-F5-4` original não tinha"* | **VALE INTEIRO, e é o critério mais importante da fase** | só o **violador** muda: de `const x: any` + `console.log` (as `[[rules.own]]` mortas) para um violador de `web-fullstack.browser-imports-server`. **`D1.4` não foi tocado** — a baseline "saída vazia" foi **re-medida hoje no repositório real** e continua valendo, porque a causa é `code_paths`, não a regra |

**O que a correção NÃO derruba, e não pode cair por arrasto:** `code_paths` **continua** precisando conhecer `frontend/` (`1.4`, independente de quem valida TS); o layout `frontend/src/{app,features,components}` **fica** (`1.5`, `ADR-009/D3`); o **piso de cobertura por camada** e as **duas recusas** de `check-coverage-layers.sh` **ficam** (`D1.8`); e `1.2`/`1.3` (`agents.by_component` para `charts` e `web`) **não têm relação nenhuma com isto**.

---

**⚠️ D1.7 não passa com o pack `hexagonal-layers`, e isto foi medido — não presumido.** O pack **não está adotado** (`harness policy --key packs` → `["core"]`; `harness rules list` → **5 regras**, nenhuma de camada). E adotá-lo **não fecharia** `D1.7`, por três defeitos independentes, lidos em `packs/hexagonal-layers/rules.toml` do plugin **v0.13.0** instalado: (i) as **2** regras declaram `path_regex = ['/domain/']` ⇒ **não existe regra alguma para `use_cases` → `infra`**, que é metade de `D1.7a`; (ii) `domain-up-import` compila `from\s+{root_package}\.({upper_layers})` com `root_package = "src"`, e o layout modular põe **dois segmentos** entre a raiz e a camada `[MEDIDO 2026-08-28: a regex compilada, aplicada a `from src.modules.sentimento.infra…` → NÃO CASA; a `from src.use_cases.foo…` → casa]`; (iii) `upper_layers` traz `infrastructure`, e este repositório usa `infra`. **Consertar o pack é mudança no `harness-plugin` — outro repositório** — e por isso `1.9` declara regra própria: `[[rules.own]]` é o lugar onde vocabulário interno (`modules/<ctx>/`, `infra`) pode ser nomeado sem levá-lo para dentro de um pack compartilhado.

**⚠️ `ADR-003:61` — *"`grep` não é aprovação"* — é atendido, não contornado.** Duas razões, e as duas são medidas. **(1) A forma sintática é obrigatória, não provável:** `core.relative-import` (`BLOQUEIO`, `scope = "code"`, regex `^\s*from\s+\.+`) já proíbe **todo** import relativo no repositório ⇒ o import absoluto é a **única** forma legal, e é exatamente a forma que as duas regras casam. Não é uma amostra da superfície: é a superfície. **(2) A aprovação não vem da regex, vem da igualdade de veredito contra uma segunda implementação:** `--reference` é **obrigatório** em `harness corpus mutate` (sem ele o comando RECUSA), e `1.9` exige que esse classificador de referência seja **independente — parse de `import`/`from` por `ast`, não uma cópia da regex.** Referência que repete a regex torna a igualdade tautológica e **não** satisfaz `D1.7e`.

**⚠️ D1.3 é o critério que o `CA-F5-4` original não tinha.** Como estava escrito, *"re-declarar a lacuna com a contagem de arquivos"* era **desfecho aceito** ⇒ **o critério passava com o enforcement inalterado**. Um critério que passa sem que nada mude não testa nada.

## Não faz

Não escreve código de produção. **Não consolida ADR** (é `09`). Não decide arquitetura de dado. **Não altera o vocabulário fechado de componentes** — `1.7` é proposta ao owner.

### ⚠️ Segunda exceção, e ela nasce declarada em vez de descoberta: `1.11` edita arquivo de produção

**Acrescentado em 2026-08-28 com `ADR-011/D6`.** A correção retroativa das **18 docstrings** ocorre dentro de **10 arquivos que `harness code-paths classify` chama `producao`**, todos sob `backend/src/modules/sentimento/`. É edição de **texto**, não de comportamento — mas o classificador não conhece essa distinção, e o portão de escrita e o `require-push` reivindicarão os arquivos do mesmo jeito.

**A lição de `T-01.1` (item C do `/review`) é aplicada ANTES e não depois:** a task de `1.11` declara **`components = ["docs", "sentimento"]`** desde o nascimento, porque `sentimento` tem dono de julgamento (`quant-architect`) e `docs` **não tem** `[MEDIDO 2026-08-28: harness policy --key agents.by_component → backtest, convergencia, sentimento; `docs` ausente]`. `ADR-003:11-13`: *"componente omitido é componente sem dono de julgamento"*. **Em `T-01.1` isso foi corrigido depois do fato; aqui é pré-condição.**

**Fronteira do que `1.11` pode tocar:** **apenas o conteúdo de docstring**. Nenhuma assinatura, nenhum nome, nenhum comportamento. O falsificador é barato e obrigatório: **a suíte tem de continuar verde com os mesmos números de cobertura por camada** — se algum número mudar, a edição não foi só de docstring.

### ⚠️ Exceção explícita à primeira frase: `1.1` escreve, sim, código de produção — e é `D1.1` que o obriga

**Acrescentado em 2026-08-28 pelo `/review` (`NON_COMPLIANT`, item C). A frase acima NÃO foi apagada** — ela continua valendo para `1.2`–`1.8`. O que ela não pode fazer é valer para `1.1`, porque **contradiz o `D1.1` da tabela de DoD**, e a contradição é defeito do plano, não indisciplina de quem o executou:

| | |
|---|---|
| **o que `D1.1` exige** | universo **`≥ 1 teste`, e ele é um dos de `02`/`03`** |
| **qual teste é esse** | `CA-F0-5` — *matar o processo e retomar* |
| **por que a proibição não pode valer aqui** | **não existe teste de matar o processo e retomar sem o código que se mata.** O critério nomeia um teste de comportamento de produção; satisfazê-lo sem produção é impossível |
| **o que de fato nasceu** | **10 arquivos** que `harness code-paths classify` chama `producao`, todos sob `backend/src/modules/sentimento/` `[MEDIDO 2026-08-28: 10 de 10]` |
| **a consequência de governança, e o motivo de isto estar escrito** | a task declarava `components = ["docs"]`, e `docs` **não tem dono** em `agents.by_component` `[MEDIDO 2026-08-28: harness policy --key agents.by_component → backtest, convergencia, sentimento; docs ausente]` ⇒ as invariantes de `domain` nasceram **sem o arquiteto no circuito de julgamento**. Corrigido para `["docs", "sentimento"]` em `tasks.toml`. `ADR-003:11-13`: *"componente omitido é componente sem dono de julgamento"* |

**Para a próxima task não herdar uma proibição que o próprio DoD contradiz:** o escopo de produção liberado aqui é **exatamente** o mínimo que `D1.1` exige — o módulo que o teste de `02`/`03` exercita — e **nada além**. Produção fora disso continua proibida nesta fase, e o componente que ela tocar tem de estar declarado em `components` **antes de o arquivo existir**, não depois.

### ⚠️ Por que `1.9` só existe agora: a peça 1 caiu **entre** os itens

**Acrescentado em 2026-08-28 pelo `/architect`, a partir do blocker remanescente do `/review` (`NON_COMPLIANT` da `T-01.1`). É defeito de PLANO, não de código** — e nenhuma linha acima foi apagada.

`ADR-009/D1` enumera **quatro** peças copiadas do vizinho. A **peça 1** é `src/modules/<ctx>/{domain,use_cases,infra}` **+ contrato `layers`**, e a ADR diz por que ela é peça: *"mantém a regra de dependência **executável**"*. O plano deu dono às outras três — `1.1` levou o layout de módulo e o piso de cobertura por camada, `1.3` levou o contrato **`forbidden`**, `1.4`/`1.5` levaram o layout do frontend. **Ninguém levou o `layers`.**

| | |
|---|---|
| **o que existe hoje no disco** | `backend/src/` tem **exatamente 1 import interno** — `use_cases/drain_etl_backlog.py:8` → `domain` `[MEDIDO 2026-08-28: grep -rnE '^[[:space:]]*(from\|import)[[:space:]]+src' backend/src --include='*.py' → 1 ocorrência]`. `domain` importa **0**, `infra` importa **0**, e `use_cases` toca `infra` só por `Protocol`. **É hexagonal de livro** |
| **o que mede isso** | **nada.** `harness rules list` → **5 regras**, nenhuma sobre camada `[MEDIDO 2026-08-28]` |
| **por que não é acadêmico** | `ADR-009/D1` declara que esta é a forma que **as ~80 tasks restantes vão copiar**. A direção sobrevive hoje por disciplina de uma pessoa numa sessão, e cada commit sem enforcement aumenta o custo de instalá-lo |
| **por que `[test_cmd].lint` sozinho não resolve** | `test_cmd` **não é lido por nenhum portão**: quem o consome são os agentes `builder` e `qa` `[MEDIDO 2026-08-28: grep -rn 'test_cmd' lib/ bin/ hooks/ agents/ no plugin v0.13.0 → só `lib/policy.py` (leitura da chave) e os dois `agents/*.md`]`. O `pre-push` deste repositório roda `require-push` **e `rules --mode sweep`** — e **não** roda `lint` `[MEDIDO 2026-08-28: cat .git/hooks/pre-push]`. Uma ferramenta só no `lint.sh` fica **fora do portão que de fato reprova**, e invisível a `harness rules list` |

**Onde o corpus mora, e por que importa para o DoD:** em **`corpus/`, na raiz** — fora de `code_paths` `[MEDIDO 2026-08-28: harness code-paths classify corpus/cases/… → "nao-producao: nenhum include_prefixes casa"]`. Os casos do corpus **são violadores por construção**; se nascerem sob `backend/src/` ou `backend/tests/`, eles próprios reprovam `D1.7d` e o sweep do `pre-push`.

## Falsificador da fase

Se, com `1.4` aplicado nas **duas** partes, D1.3 continuar devolvendo saída vazia, o fecho de `CA-F5-4` precisa de uma **terceira** parte que ninguém identificou — e `ADR-009/D3` está errado.

**Falsificador de `1.9'`, e ele é UM comando — o mais importante desta fase.** Ponha, num branch, os **dois** violadores de camada **e** o `.tsx` violador, e rode **`git push --dry-run`**. **Se o push for ACEITO, a fase trocou quatro portões declarados por quatro ferramentas que ninguém roda** — e o rumo novo é pior que o antigo, apesar de cada instrumento ser individualmente melhor. ~~**O "antes" é conhecido e assimétrico, que é o que torna o teste informativo:** hoje o push é **recusado** para o `.py` violador (o `rules --mode sweep` do `pre-push` o pega) e **aceito** para o `.tsx` (fora de `code_paths`).~~ **Depois, os dois têm de ser recusados.**

> ### 🔴 ERRATUM 2026-08-29, `/architect` — o "antes" tarjado acima estava errado nas DUAS metades, e elas estavam INVERTIDAS
>
> **Nada foi apagado.** A frase tarjada continua legível porque é ela que quem já leu este plano tem na memória, e porque a direção do erro é a informação. **A conclusão do falsificador não muda** — *"depois, os dois têm de ser recusados"* segue de pé. O que muda é **de onde se parte**, e partir do lugar errado tornaria o teste não-informativo: quem esperasse o `.py` ser recusado leria a aceitação dele como regressão de `1.9'`, quando ela é o estado que sempre existiu.
>
> **Origem:** o `/build` de `T-01.5` declarou a metade `.py` (`docs/INDEX.md:63`), e a metade `.tsx` foi corrigida no mesmo registro. **Re-medido do zero nesta árvore, violador a violador, com cada `rc` impresso e nenhum inferido de saída vazia** `[MEDIDO 2026-08-29, worktree `chore/architect-dividas-fase-01` sobre `48d5500`, violadores efêmeros removidos no mesmo comando]`:
>
> | violador | o plano dizia | **medido** | comando |
> |---|---|---|---|
> | `.py` de camada — `domain/__sonda_camada__.py` com `from src.modules.sentimento.use_cases…` | **recusado** | **ACEITO** — `rc=0`, saída de 0 byte, e o sweep inteiro `rc=0` (só o `[AVISO] browser-test-file-present`, que já é o estado limpo) | `harness rules --mode file --path <ele> --surface ci` → `rc=0` · `harness rules --mode sweep --surface git-hook` → `rc=0` |
> | `.tsx` **que o plano nomeia** — o de `D1.3`, `frontend/src/features/painel/serie.tsx` | **aceito** | **RECUSADO** — `rc=1`, `[BLOQUEIO] [web-fullstack.browser-imports-server] … serie.tsx:1`, com a linha do import citada | `harness rules --mode sweep --surface git-hook` → `rc=1` |
>
> **Por que cada metade errou, e as causas são independentes:**
>
> - **O `.py`:** o plano supunha que o sweep pegasse violação de **camada**. Ele nunca pegou. As duas `[[rules.own]]` de camada foram derrubadas por `ADR-011/D3` **antes de existirem** — `git log --all -p -- harness.toml | grep -c 'layer-domain-up-import'` → **`0`** `[MEDIDO 2026-08-29. **Com controle positivo, porque zero-sobre-vazio é a armadilha desta trilha:** o MESMO comando com `include_prefixes` → **41**, o que prova que o método enxerga o histórico deste arquivo; e com `ts-explicit-any` → **0**, reproduzindo a medição que `ADR-011:14` fez para as duas regras de TypeScript]`. **Não há regressão: nunca houve o portão.** Quem pega o `.py` de camada é `make boundaries`, que é a metade **(a)** de `1.9'`, e ele só chega ao push pela metade **(b)** — que é exatamente o que este falsificador existe para verificar.
> - **O `.tsx`:** o plano o supunha fora de `code_paths`. **Está dentro desde `T-01.2`** (`include_prefixes += frontend/src/`, `include_globs += *.tsx` — item `1.4`, partes (a) e (b)), e `web-fullstack.browser-imports-server` o alcança. O que passava em silêncio era **outro** `.tsx`, o de `any`/`console` — e não por caminho, mas por **ausência de regra**, que é o que `ADR-011/D4` mandou o ESLint cobrir.
>
> **⚠️ E há uma armadilha de leitura que este erratum tem de fechar, porque ela é a nona instância da família em forma nova.** O `rc=0` do `.py` acima e o `rc=0` que `backend/scripts/boundaries.sh` recebe de `harness rules --mode file` **têm a mesma aparência e significados opostos.** Só `code-paths classify` os separa `[MEDIDO 2026-08-29]`:
>
> ```
> classify  domain/__sonda_camada__.py      -> producao … casam e nada exclui        rc=0   ⇒ AVALIADO, e limpo
> classify  backend/scripts/boundaries.sh   -> nao-producao: nenhum include_prefixes  rc=1   ⇒ NUNCA AVALIADO
> ```
>
> **Citar o `rc=0` de `harness rules --mode file` sem o `classify` ao lado é meia medição.** A regra que sai disto está em [`ADR-012/D4`](../../adr/ADR-012-o-portao-de-shell-e-o-make-nao-o-code-paths.md).

**Segundo falsificador, contra a escolha do mecanismo — e ele SOBREVIVEU à troca, com o alvo trocado.** Se aparecer um import que viole a direção de camada e **não** seja pego pelos contratos — um `importlib.import_module("src.modules.<ctx>.infra…")`, um alias construído em tempo de execução — então a análise estática é insuficiente. **Registro honesto do limite, e ele é o mesmo de antes: `import-linter` TAMBÉM é estático e também não vê esse caso.** A troca de `[[rules.own]]` por grafo fecha três buracos que a regex tinha (`import … as`, re-export por `__init__.py`, import dentro de função) e **não** fecha este. O falsificador não aponta para um conserto pronto; aponta para *"o mecanismo escolhido tem um buraco conhecido e este é o formato dele"*.

**Terceiro falsificador, contra `1.11` (docstrings):** se aparecer um verificador **determinístico** — não probabilístico — que classifique as **18** docstrings de hoje como não-inglês **e** não produza falso positivo sobre um docstring inglês legítimo com termo técnico em português, então a convenção pode virar portão e `ADR-011/D6` está errada. **A barra é as duas metades**, e é o mesmo par morde/cala de `1.8'`.
