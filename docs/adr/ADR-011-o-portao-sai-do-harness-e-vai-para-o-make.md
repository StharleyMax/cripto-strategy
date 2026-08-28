# ADR-011 — O portão de fronteira sai do `harness` e vai para o `make`

**Data:** 2026-08-28 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.1, §12
**Fase/Epic:** F5a · `CST-1` · **Componente alvo:** `docs`
**Origem:** correção de rumo declarada pelo owner em 2026-08-28, depois de revisar o que a fase `01` construiu

**Supersede:**

| o que cai | onde estava | decisão nova |
|---|---|---|
| `venv` + `uv pip` + `requirements-dev.txt` | decisão tática de `T-01.1`, [`backend/README.md`](../../backend/README.md) §"Decisões táticas" | **D1** — Poetry |
| — (não havia fachada de comandos) | — | **D2** — `Makefile` na raiz, que **chama** os `.sh` |
| duas `[[rules.own]]` de camada (`own.layer-domain-up-import`, `own.layer-use-cases-imports-infra`) | [plano `01`](../plans/SPEC-001-plataforma-dados/01_governanca_gateante.md) item **1.9**, DoD `D1.7a`–`D1.7e` | **D3** — `import-linter` |
| duas `[[rules.own]]` de TypeScript (`ts-explicit-any`, `ts-browser-console`) | declaradas por `T-01.2` (revertidas do disco; nunca commitadas — `git log --all -p -- harness.toml \| grep ts-explicit-any` → **0 linhas** `[MEDIDO 2026-08-28]`) | **D4** — ESLint |
| **`ADR-009/D4`** — Python 3.12 e remoção do `.python-version` | [`ADR-009`](ADR-009-reuso-da-forma-do-anything.md) §D4 | **D5** — Python 3.13, arquivo **mantido** |
| — (docstrings sem idioma declarado) | — | **D6** — inglês, **convenção declarada**, não portão |

---

## Contexto

### As declarações do owner, literais

> *"Validacoes de modulos gostaria de fazer usando a lib do pylint importer igual fiz no repo anything. Muitas das validacoes podem rodar ali."* `[PREMISSA-OWNER: 2026-08-28]`

> *"Aplicacao deve rodar com poetry, ter Makefile para simplicar as chamadas, builds e afins."* `[PREMISSA-OWNER: 2026-08-28]`

> *"essa questao do python, pode regredir, quero que tenha o python version no 3.13 e atualizar o readme com o setup e ativacao da venv via comando MAKE para simplificar"* `[PREMISSA-OWNER: 2026-08-28]`

> *"vale adicionar docstrings em ingles, corrigindo ja o retroativo"* `[PREMISSA-OWNER: 2026-08-28]`

E sobre o `corpus/` que a fase construiu:

> *"n entendi pq ele criou essa pasta corpus, pq os arquivos enumerados, n entendi muito da ideia e estou achando que ele se perdeu."* `[PREMISSA-OWNER: 2026-08-28]`

### O que eu errei, e o erro não foi a medição

O item `1.9` do plano recusou `import-linter` com um argumento que **continua verdadeiro**:

> *"`test_cmd` **não é lido por nenhum portão**: quem o consome são os agentes `builder` e `qa`"*
> `[MEDIDO 2026-08-28: grep -rn 'test_cmd' lib/ bin/ hooks/ agents/ no plugin v0.13.0 → só `lib/policy.py` (leitura da chave) e os dois `agents/*.md`]`

**Re-conferido hoje: nada nessa medição mudou.** O que eu não sabia é que ela responde à pergunta errada. Eu perguntei *"onde o `harness` lê uma ferramenta de linha de comando?"* e concluí, corretamente, *"em lugar nenhum que reprove"*. A pergunta que importava é *"o que o owner usa como portão?"*, e a resposta está no disco do vizinho, medida:

| evidência | comando | resultado |
|---|---|---|
| o vizinho tem CI | `ls anything_monorepo/.github/workflows` | **`ci.yml`, `deploy.yml`** `[MEDIDO 2026-08-28]` |
| o CI instala `make` | `grep -n "make " .github/workflows/ci.yml` | linha **86**, `apt-get install … make` `[MEDIDO 2026-08-28]` |
| `make gate` → `ci-gate.sh` → `lint-backend` → `lint-imports` | `sed -n '1,40p' scripts/ci-gate.sh` + o alvo `lint-backend` do `Makefile` | cadeia confirmada `[MEDIDO 2026-08-28]` |

⇒ **lá, `import-linter` é portão porque o CI roda `make`.** A minha recusa mediu a ausência de um caminho (`harness` → `test_cmd` → reprovação) e leu isso como ausência de **todo** caminho. **Registro antigo intacto, conclusão trocada.**

### E a consequência que o rumo novo traz junto, e que não pode passar em silêncio

**Este repositório não tem CI.** `[MEDIDO 2026-08-28: `ls .github` → *"Arquivo ou diretório inexistente"*]`. O único portão automático é `.git/hooks/pre-push`, e ele roda **`require-push` + `rules --mode sweep`** — **não roda `make`** `[MEDIDO 2026-08-28: `cat .git/hooks/pre-push`]`.

⇒ **Adotar `import-linter` atrás de `make boundaries` sem ligar `make` a um portão automático troca "regra declarada que não existe" por "ferramenta que existe e ninguém roda".** É movimento lateral com aparência de progresso, e é a classe de defeito que este repositório catalogou **seis vezes só hoje**: portão que devolve verde por não ter olhado. **Por isso `D3` tem duas metades, e a segunda é obrigatória.**

---

## Decisão

### D1 · Poetry, superseding a escolha `venv` + `uv` de `T-01.1`

`T-01.1` registrou a escolha **com falsificador**, e é o falsificador que fecha o caso:

> *"`venv` + `uv pip` + `requirements-dev.txt` fixado, e **não Poetry** — `ADR-009/D1` enumera as 4 peças copiadas do vizinho e **Poetry não é uma delas**."*
> **Falsificador registrado:** *"se uma dependência de runtime entrar e a resolução transitiva derivar entre clones, o lock passa a valer e a escolha vira ADR."*
> `[DOC: backend/README.md, §"Decisões táticas desta task, e o que as derruba"]`

**O falsificador foi realizado — por caminho diferente do previsto, e vale dizer qual.** Ele previa que a *pressão técnica* (resolução transitiva derivando) forçaria o lock. O que chegou primeiro foi a **declaração do owner**, que é fonte de decisão superior a inferência de arquiteto sobre "quais peças do vizinho copiar". A escolha original era defensável e está sendo derrubada por autoridade, não por erro de raciocínio — e registrar isso importa para que a próxima decisão tática não seja tomada com medo.

**Decidido: Poetry.** `[MEDIDO 2026-08-28: `poetry --version` → `Poetry (version 2.4.1)`]`.

**Consequência de migração que NÃO é opcional, e que quase se perde:** os scripts resolvem o interpretador como **`$BACKEND/.venv/bin/python`**, literal — e o caminho está **espalhado por quatro arquivos**, não centralizado `[MEDIDO 2026-08-28: `PY="$BACKEND/.venv/bin/python"` → **3 ocorrências**, em `lint.sh`, `test.sh` e `check-coverage-layers.sh`; mais `VENV="$BACKEND/.venv"` → **1 ocorrência**, em `bootstrap.sh`. Total **4**]`. Poetry só põe o venv em `backend/.venv` se `virtualenvs.in-project` for verdadeiro, e **nesta máquina ele é verdadeiro por configuração de USUÁRIO, não do repositório** `[MEDIDO 2026-08-28: `cd /tmp && poetry config virtualenvs.in-project` → `true`, com `virtualenvs.path = "{cache-dir}/virtualenvs"` — a leitura veio de `/tmp`, logo é config global, não local]`.

⇒ **Num clone limpo em máquina com o default de fábrica, o venv nasce em `~/.cache/pypoetry/virtualenvs/…` e as três recusas `rc=3` de "venv não existe" passam a disparar SEMPRE.** O conserto é **`backend/poetry.toml`** versionado com `[virtualenvs] in-project = true` — config **local do repositório**, que viaja no clone. Sem esse arquivo a migração parece funcionar nesta máquina e quebra na próxima.

**Falsificador de D1:** se, com Poetry instalado e `backend/poetry.toml` versionado, `poetry install` produzir um ambiente em que `backend/.venv/bin/python` **não** exista, então a forma escolhida não preserva o contrato dos scripts e `D2` precisa reescrever a resolução de interpretador em vez de herdá-la.

---

### D2 · `Makefile` na raiz — e ele **CHAMA** os `.sh`, não os absorve

**Decidido: fachada, não reimplementação.** O `Makefile` é a superfície única (`setup`, ativação da venv, `lint`, `test`, `boundaries`, `build`); os quatro scripts de `backend/scripts/` **continuam existindo e continuam sendo a implementação**. Só `bootstrap.sh` muda de **conteúdo** (venv+uv → `poetry install`; alvo 3.12 → 3.13), não de **papel**.

**Três argumentos, e os três são medidos.**

**(1) O vizinho — a forma que o owner mandou copiar — também não absorve.** `[MEDIDO 2026-08-28: o alvo `test-backend-cov` do `anything_monorepo/Makefile` roda `bash scripts/check-coverage-layers.sh`; `bootstrap`, `gate`, `hard-rules`, `artifacts`, `status`, `phase-gate`, `jira-sync`, `scaffold`, `hooks-install` são todos `@bash scripts/<x>.sh`]`. Absorver seria copiar a forma errada de um repositório que escolheu a certa.

**(2) O próprio vizinho MEDIU o falso-verde que a absorção produz.** O alvo `lint-frontend` dele carrega este aviso, literal:

> *"NOTE (KAN-172): `set -e` é OBRIGATÓRIO. Sem ele, o `;` entre os comandos faz o recipe retornar o exit code do ÚLTIMO comando (`echo OK` = 0), mascarando falha de eslint/tsc → falso-verde local (o gate mente). Não remova o `set -e`."*
> `[DOC: anything_monorepo/Makefile, alvo `lint-frontend`]`

Uma receita de Make é uma sequência de linhas encadeadas por `;`, cada uma num subshell. **É exatamente o construto que já produziu falso-verde no repositório de referência**, e é para dentro dele que a absorção mandaria as recusas. Este repositório catalogou seis defeitos dessa classe hoje; escolher deliberadamente o construto que a produz seria o sétimo.

**(3) As duas recusas não são linhas, são semântica de código de saída.** `check-coverage-layers.sh` distingue **`rc=3` (não mediu)** de **`rc=1` (mediu e reprovou)**, e a segunda recusa é um `find … -newer` cujo resultado alimenta uma condição, seguido de um parser XML embutido de ~30 linhas. Traduzir isso para receita é **reescrever**, e reescrever é onde as duas se perdem.

#### Como as duas recusas sobrevivem, item por item

| recusa | onde ela mora **depois** | o que a preserva |
|---|---|---|
| **relatório AUSENTE → `rc=3`** | inalterada, em `check-coverage-layers.sh` | o `Makefile` chama `backend/scripts/test.sh`, que chama o piso. Nenhuma linha da recusa é tocada |
| **relatório VELHO → `rc=3`**, medido por frescor contra o `.py` mais novo de `src/` | inalterada, em `check-coverage-layers.sh` | idem. O `rm -f coverage.xml` de `test.sh` (a metade que protege quem entra por `test.sh`) também fica |

**A metade que o `Makefile` acrescenta, e que é obrigação nova:** o alvo `test` **não pode** encadear `pytest` e o piso com `;`. Ou chama `bash backend/scripts/test.sh` (que já os encadeia sob `set -euo pipefail`), ou, se algum dia chamar os dois direto, a receita abre com `set -e`. **A ADR decide a primeira forma.**

**Falsificador de D2:** rode, depois da migração, `bash backend/scripts/test.sh --no-cov -k <um teste>` e `touch backend/src/modules/sentimento/domain/etl_backlog.py && bash backend/scripts/check-coverage-layers.sh`. **Se qualquer um dos dois devolver `rc` diferente de 3, uma das recusas se perdeu na tradução** — e `D2` está errada. Os dois valores de "antes" estão medidos e publicados em `backend/README.md`: ambos **`rc=3`**.

---

### D3 · `import-linter` para fronteira de módulo — e a segunda metade é obrigatória

**D3a — o instrumento.** A direção de camada (`domain < use_cases < infra`, por módulo) e a fronteira entre componentes passam a ser contratos de **`import-linter`** em `[tool.importlinter]` no `backend/pyproject.toml`, com `root_package = "src"`, um contrato `type = "layers"` com `containers = ["src.modules.<ctx>", …]` e `exhaustive = false`, e contratos `type = "forbidden"` por componente. **É a forma do vizinho, lida no disco** `[MEDIDO 2026-08-28: `backend/pyproject.toml` do `anything_monorepo` — **1** contrato `layers` com **11** containers e **12** contratos `forbidden`. **A assimetria 11×12 é informativa e não erro de leitura:** `src.modules.compliance` tem contrato `forbidden` e **não** está entre os `containers` do `layers` — é exatamente o que `exhaustive = false` permite, e é o motivo de copiá-lo]`.

**Por que ele é melhor que as duas `[[rules.own]]` que eu escrevi hoje, e o motivo NÃO é "regex é feia":** `import-linter` lê o **grafo de imports** via `grimp`, não texto. As duas `[[rules.own]]` do item `1.9` casavam `from src.modules.<ctx>.<camada>` por regex e, por isso, dependiam de um argumento em duas pernas — *"`core.relative-import` proíbe todo import relativo, logo a forma absoluta é a única legal"* — que é verdadeiro e **frágil**: ele vale enquanto ninguém desligar `core.relative-import`, e não vale para `import src.modules.x.infra as y`, para re-export via `__init__.py`, nem para import dentro de função. O grafo vê os três.

**Registro honesto do limite, herdado do item `1.9` e ainda válido:** `import-linter` **também é estático** e também não vê `importlib.import_module("src.modules.<ctx>.infra")`. A troca não fecha esse buraco; ela fecha os três acima.

**D3b — o portão. Sem esta metade, `D3a` é regressão.** Medido acima: não há CI, e o `pre-push` não roda `make`. Portanto `D3` só está satisfeita quando `make boundaries` for alcançável por um portão que reprova sozinho. **A costura existe e é documentada pelo próprio hook gerado**, que não pode ser editado:

```
ANTERIOR="$(git rev-parse --git-path hooks/pre-push.pre-harness 2>/dev/null || true)"
if [ -n "$ANTERIOR" ] && [ -x "$ANTERIOR" ]; then
    printf '%s\n' "$ENTRADA" | "$ANTERIOR" "$@" || FALHOU=1
fi
```
`[MEDIDO 2026-08-28: `.git/hooks/pre-push`, e o `exit $FALHOU` no fim soma o veredito]`

⇒ **`scripts/hooks/pre-push.pre-harness`**, versionado, rodando `make boundaries` (e `make lint`). Ele é instalado pelo `scripts/install-git-hooks.sh` que já existe — que copia tudo de `scripts/hooks/` por basename e **pula o que for hook gerado pelo harness** `[MEDIDO 2026-08-28: `sed -n '1,25p' scripts/install-git-hooks.sh`; o alvo `pre-push.pre-harness` não existe hoje: `ls .git/hooks/` → só `commit-msg` e `pre-push`]`. **Zero edição no hook gerado, zero `core.hooksPath`** — que o `CLAUDE.md` proíbe.

**Um `.github/workflows/ci.yml` rodando `make gate` é desejável e NÃO substitui a costura acima:** o `remote` é `git@github.com:StharleyMax/cripto-strategy.git` `[MEDIDO 2026-08-28: `git remote -v`]`, então CI é possível; mas CI reprova **depois** do push, e o `pre-push` reprova **antes**. A decisão exige o `pre-push`; o CI fica **PROPOSTO**, dono a definir.

**Falsificador de D3:** plante os dois violadores (um `domain/` importando `use_cases`, um `use_cases/` importando `infra`) e rode `git push --dry-run`. **Se o push não for recusado, `D3b` não existe** — e a fronteira está pior do que estava sob as duas `[[rules.own]]`, que ao menos o `rules --mode sweep` do `pre-push` avaliava.

---

### D4 · ESLint para TypeScript, superseding as duas `[[rules.own]]` de `T-01.2`

As duas regras reimplementam `@typescript-eslint/no-explicit-any` e `no-console`.

**A evidência não é estética, e eu a re-medi em bancada em vez de repassá-la.** O relato do `/qa` de hoje diz que a regex não pegava `Record<string, any>` nem `Map<string, any>` e produzia dois falsos positivos. Montei um fixture com as duas variantes de regex que se pode escrever para `any` numa linha, sobre **3 arquivos / 4 linhas de código / 2 violações reais / 2 usos legítimos**:

```
harness --root <fx> rules --mode file --path frontend/src/features/painel/<arquivo>
```

| arquivo | conteúdo | é violação? | `:\s*any\b` (ESTREITA) | `\bany\b` (LARGA) |
|---|---|---|---|---|
| `tipos.ts` | `Record<string, any>` e `Map<string, any>` | **sim, 2** | **silêncio — 2 falsos negativos** | BLOQUEIO (2 ocorrências) |
| `config.ts` | `{ retry: 3, any: true }` — `any` é **chave de objeto** | não | silêncio (correto) | **BLOQUEIO — falso positivo** |
| `Filtro.tsx` | `<p>Filtro: any resultado serve</p>` — **texto JSX** | não | **BLOQUEIO — falso positivo** | **BLOQUEIO — falso positivo** |

`[MEDIDO 2026-08-28: fixture em diretório temporário fora do repositório, `harness` v0.13.0; `exit=2` nos três arquivos, `sweep exit=1`]`

**O que esta tabela prova, e é mais do que "a regex erra":** os dois defeitos **não estão em lados opostos de um limiar que se possa ajustar**. Apertar a regex para matar o falso positivo de `config.ts` cria dois falsos negativos em `tipos.ts` — que é **a forma mais comum de `any` em TS real**. Afrouxar para pegar `tipos.ts` traz o falso positivo de volta. **E o texto JSX de `Filtro.tsx` reprova as DUAS variantes** — não há posição no eixo em que ele não erre. Não existe regex de linha, sobre este universo de quatro linhas, que seja simultaneamente completa e correta. **Ferramenta de AST não tem essa forma de defeito porque distingue `TSAnyKeyword` de um `Identifier` e de um `JSXText`** — são nós diferentes da árvore, não coincidências de texto.

**Limite honesto, e ele vira DoD:** que o ESLint acerte os quatro casos é **`[NÃO MEDIDO]` neste disco**. Existe um `eslint` global (`/usr/bin/eslint`, **v6.4.0** `[MEDIDO 2026-08-28: `eslint --version`]`), mas ele é antigo, não é o do projeto, e o projeto ainda não tem `frontend/`. **Instalar dependência não é ato de arquiteto.** ⇒ a afirmação *"AST não tem esses dois defeitos"* é **mecanismo, não medição**, e `/build` tem de medi-la sobre **os mesmos 3 arquivos** — é o `D1.3b` novo.

**Falsificador de D4:** rode o ESLint do projeto sobre os três arquivos da tabela. **Se ele acusar `config.ts` ou `Filtro.tsx`, ou deixar `tipos.ts` passar, a troca não comprou o que esta decisão diz que compra** — e as duas `[[rules.own]]` voltam a ser a opção menos ruim.

---

### D5 · Python **3.13**, superseding `ADR-009/D4` — e o arquivo **fica**

**A declaração do owner é literal e não deixa margem:**

> *"essa questao do python, pode regredir, quero que tenha o python version no 3.13"* `[PREMISSA-OWNER: 2026-08-28]`

**`ADR-009/D4` está SUPERSEDIDA nas duas metades:** ela decidia **3.12** e mandava **remover** o `.python-version`. Passa a valer **3.13**, e o `.python-version` **fica** — hoje em disco com `3.13.13` `[MEDIDO 2026-08-28: `cat .python-version`]`, e disponível no interpretador (`pyenv versions` lista **3.13.13** e **3.13.1** `[MEDIDO 2026-08-28]`).

#### E uma afirmação de `ADR-009/D4` estava errada de fato — registrada aqui, não corrigida lá

`D4` escreveu, sobre o `.python-version`: *"não commitado"*. **Estava rastreado.**

```
git log --oneline -- .python-version   →  086a8af   (1 commit, 2026-08-25)
git ls-files | grep python-version     →  .python-version
```
`[MEDIDO 2026-08-28]`

E `086a8af` é **`docs: SPEC-001 DRAFT, 9 ADRs, plano F0-F5 e os quatro fluxos em diagrama`** — **o mesmo commit que introduziu a `ADR-009`**. A ADR afirmou que o arquivo não estava versionado no ato em que ela própria o versionou. **O erro não muda o veredito novo** (o owner decidiu manter o arquivo de qualquer modo); está aqui porque `D4` usou *"não commitado"* como parte do argumento para removê-lo, e um argumento com premissa falsa não deve sobreviver em silêncio à decisão que ele sustentava. **`ADR-009` não foi editada** — ADR é registro histórico, e corrigir o passado apaga a lição.

#### As três consequências, nomeadas

| superfície | de | para |
|---|---|---|
| `.python-version` | removido por `T-01.4` | **mantido**, `3.13.13` |
| `mypy python_version` | ausente em `backend/pyproject.toml` `[MEDIDO 2026-08-28: `[tool.mypy]` tem só `strict` e `ignore_missing_imports`]` | **`"3.13"`**, declarado |
| `requires-python` | ausente — o arquivo declara, em comentário, que **não** declara versão de propósito | **`>=3.13,<3.14`** em `[project]` (Poetry 2.4.1 é PEP 621) |
| assert de `bootstrap.sh` | `PY_ALVO="3.12"` | **`PY_ALVO="3.13"`**, e a mensagem de recusa passa a citar `ADR-011/D5` |
| `ruff target-version` | ausente | **`py313`** — hoje o `ruff` infere do `requires-python`, que não existia |

#### O destino de `T-01.4`: ela **muda de conteúdo**, não morre

`T-01.4` é hoje *"`.python-version` removido, Python 3.12 declarado; proposta do componente `infra` levada ao owner"* — **duas metades independentes** (`plano 01 itens 1.6+1.7`, `ADR-009/D4` + `ADR-009/D5`).

- **A metade `D4` inverte de sinal:** de *"remover o arquivo e declarar 3.12"* para *"manter o arquivo e declarar **3.13** nas quatro superfícies acima"*. Continua havendo trabalho, e é trabalho **maior** que o anterior.
- **A metade `D5` (proposta do componente `infra` ao owner) está intacta** — `ADR-011` não a toca.

⇒ **`T-01.4` MUDA DE CONTEÚDO. Matá-la mataria junto a proposta do componente `infra`, que nada nesta correção de rumo derruba.** Redação para `/tech-lead` em §"Para o `/tech-lead`".

**Falsificador de D5:** se, com 3.13 declarado nas quatro superfícies, alguma dependência do backend não tiver wheel para 3.13 e forçar compilação a partir de fonte no `bootstrap`, o custo da versão nova aparece onde `ADR-009/D4` temia — e a decisão vira negociação de qual dependência sai, não reversão do pin. **Hoje o universo é pequeno e o risco é baixo: 5 dependências de desenvolvimento, zero de runtime** `[MEDIDO 2026-08-28: `backend/requirements-dev.txt` → `coverage`, `mypy`, `pytest`, `pytest-cov`, `ruff`]`.

---

### D6 · Docstrings em inglês — **convenção declarada, NÃO portão.** E aqui está o número que prova por quê

> *"vale adicionar docstrings em ingles, corrigindo ja o retroativo"* `[PREMISSA-OWNER: 2026-08-28]`

**O universo retroativo, medido por `ast` e não por `grep`:** **18 docstrings** em **10 arquivos `.py`** de `backend/src`, sob 4 módulos de `sentimento`. **As 18 estão em português** — lidas uma a uma. `[MEDIDO 2026-08-28: script `ast` percorrendo módulo + classe + função em `backend/src/**/*.py`]`

**Decidido: é convenção documentada, e o repositório declara que NÃO a mede.** Não porque medir seja caro, mas porque as duas formas de medir que existem **falham de maneiras que eu medi**:

| tentativa de portão | o que ela devolveria hoje, sobre **18 docstrings em português** | veredito |
|---|---|---|
| proibir **diacríticos** (`ã`, `ç`, `õ`, `é`…) — o único teste de idioma **determinístico** que existe, já que nenhuma palavra inglesa os carrega | **0 achados de 18** `[MEDIDO 2026-08-28]` — porque este código escreve português **sem acento** (`nao`, `atomico`, `duravel`, `construcao`) | **verde absoluto sobre 100% de violação.** É literalmente o portão que devolve verde por não ter olhado |
| lista fechada de palavras-função portuguesas em ASCII (`nao`, `sao`, `que`, `para`, `com`, `uma`, `ordem`, `chave`…) | **12 de 18** `[MEDIDO 2026-08-28]` — **6 falsos negativos, 33%** | recall de 67% num portão de **bloqueio** é ruído com severidade |
| detector probabilístico de idioma (`langdetect` e afins) | `[NÃO MEDIDO]` — dependência nova, veredito probabilístico | portão que pode errar sozinho é pior que convenção honesta, na doutrina deste repositório |

**⇒ Resposta explícita, porque a pergunta foi feita explicitamente: NÃO é mensurável por comando.** *"Este docstring está em inglês"* não tem verificador determinístico disponível, e **fingir que tem é o defeito que esta ADR passou o dia inteiro recusando em outras quatro decisões.**

**O que É mensurável, e o que cada comando de fato mede — sem empréstimo de confiança:**

| comando | o que ele mede **de verdade** | o que ele **não** mede |
|---|---|---|
| `ruff check --select D` (pydocstyle) | **presença** e **forma**: docstring existe em módulo/classe/função pública, resumo numa linha, pontuação, modo imperativo (`D401`) | **idioma. Nenhuma regra `D` é sensível a idioma** |
| `core.module-docstring-single-line` (já em vigor, `AVISO`) | a docstring de módulo abre e fecha na linha 1 | idem |

**A correção retroativa das 18 é trabalho declarado e verificável por revisão humana — não por portão.** `/build` a executa; o `/review` a confere lendo. **O que `/build` NÃO deve fazer é declarar uma `[[rules.own]]` de diacrítico e chamá-la de enforcement:** ela devolveria `0 achados` sobre as 18 de hoje e sobre qualquer português futuro escrito no mesmo estilo sem acento do resto de `backend/src` `[MEDIDO 2026-08-28: `grep -rlP '[ãçõ]' --include='*.py' backend/src` → **0 arquivos**]`.

**Falsificador de D6:** se aparecer um verificador determinístico de idioma — não probabilístico — que classifique as 18 docstrings de hoje como não-inglês **e** não produza falso positivo sobre um docstring inglês legítimo com termo técnico português (`funding`, `basis`, um nome de exchange), então a convenção pode virar portão, e esta decisão cai. **A barra é as duas metades: pegar o que é, e calar sobre o que não é.**

---

## O que cai junto, e precisa estar escrito

### `corpus/` — descartado

`corpus/frontend-ts/`, `corpus/layers/`, `corpus/fronteira-charts-web/` foram revertidos. `[MEDIDO 2026-08-28: `ls corpus` → *"Arquivo ou diretório inexistente"*]`. Eles existiam para satisfazer o item `1.8` sobre as quatro `[[rules.own]]` que `D3` e `D4` acabam de eliminar. **Sem regra própria, não há o que o corpus defenda.**

### O item `1.8` fica **VÁCUO** — e "vácuo" não é "cumprido"

> `1.8` — *"Toda `[[rules.own]]` que esta fase declarar nasce **com corpus**"* (`SPEC-001` §12)

**O item NÃO é apagado.** Ele é um condicional, e continua em vigor: **se** qualquer task da fase `01` declarar uma `[[rules.own]]`, ela nasce com corpus. O que muda é o antecedente: **com `D3` e `D4`, a fase `01` planeja declarar zero `[[rules.own]]`** ⇒ `1.8` **não obriga nada**, e `D1.5` é satisfeito **vacuamente, com universo `0` regra**.

**Isto é escrito e não subentendido**, e há precedente exato no mesmo repositório: `T-01.1` declarou zero regras próprias e o `harness.toml` registra, literal, *"`D1.5` é satisfeito VACUAMENTE… Não é a mesma coisa que 'rodei o corpus e passou': não havia o que rodar"* `[DOC: harness.toml]`.

### A obrigação que `1.8` carregava NÃO pode evaporar com ele

`1.8` não existia por amor a corpus; existia para que **enforcement fosse medido e não declarado** (`SPEC-001` §12: *"Declarar regra sem corpus troca enforcement medido por enforcement declarado, e esta SPEC não autoriza isso"*). `harness corpus verify` / `mutate` só sabem falar de regras do `harness` — **eles não alcançam `import-linter` nem ESLint.** Mover o enforcement para fora da máquina de regras **remove os dois gates de qualidade de gate** e, sem substituto, essa é a maior perda desta correção de rumo.

⇒ **`1.8` ganha um sucessor com a mesma substância, aplicável a ferramenta externa** — o **teste dos dois lados**, que é o que `corpus verify` (igualdade de veredito) e `corpus mutate` (o corpus defende a regra?) juntos significam:

> **Toda ferramenta externa adotada como portão nesta fase nasce com prova de que MORDE e prova de que CALA:** um violador plantado que a faz reprovar (`exit ≠ 0`, nomeando o contrato ou a regra), **e** o código legítimo de hoje passando verde. **Uma sem a outra não conta.** "Morde" sozinho não exclui uma ferramenta que reprova tudo; "cala" sozinho é indistinguível de ferramenta desligada.

É o item **`1.8'`** no plano reescrito.

---

## Alternativas recusadas

| alternativa | por que não |
|---|---|
| **manter as 4 `[[rules.own]]` e adotar as ferramentas em paralelo** | dois portões para a mesma invariante divergem, e o dia em que discordarem ninguém saberá qual está certo. Pior: a regex tem falso positivo medido (`Filtro.tsx`), então o par reprovaria código legítimo que a ferramenta boa aprova |
| **`import-linter` só no `lint.sh`, sem tocar no `pre-push`** | é literalmente o defeito que o item `1.9` nomeou e recusou: *"uma ferramenta só no `lint.sh` fica fora do portão que de fato reprova"*. O argumento continua correto — o que mudou foi que agora existe outro portão a construir (`D3b`), não que o buraco tenha sumido |
| **absorver os `.sh` em receitas de Make** | o repositório de referência **mediu** o falso-verde desse construto (`KAN-172`), e as duas recusas `rc=3` são o ativo mais caro desta trilha. `D2`, argumento (2) |
| **consertar o pack `hexagonal-layers`** | continua sendo mudança em **outro repositório** (`harness-plugin`), e continua tendo os **três defeitos independentes** medidos no item `1.9` (regra só para `/domain/`; `root_package` de um segmento contra layout de dois; `infrastructure` × `infra`). Nada disso mudou |
| **remover `T-01.4`** | mataria junto a proposta do componente `infra` (`ADR-009/D5`), que esta correção de rumo não toca. `D5` |
| **declarar `[[rules.own]]` de diacrítico para docstrings** | **0 achados sobre 18 docstrings em português** `[MEDIDO]`. É a definição de portão cego |
| **corrigir `ADR-009/D4` no lugar** | ADR é registro histórico. A premissa falsa (*"não commitado"*) é a lição; apagá-la é perder o motivo de conferir premissa antes de decidir |

## Falsificador da ADR inteira

**Se, com `D1`–`D5` implementadas, `git push` de um branch contendo os dois violadores de camada e o `.tsx` violador for ACEITO, então esta ADR trocou quatro portões declarados por quatro ferramentas que ninguém roda** — e o rumo novo é pior que o antigo, apesar de cada instrumento individual ser melhor. **É um único comando, e ele já tem resultado conhecido de "antes":** hoje o push é recusado para o `.py` violador (o `rules --mode sweep` do `pre-push` o pega) e **aceito** para o `.tsx` (fora de `code_paths`). **Depois, os dois têm de ser recusados.**
