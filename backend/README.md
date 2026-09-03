# `backend/` — o runner declarado e a primeira árvore de código

Nascido em **2026-08-28** pela task **`T-01.1`** (`CST-8`, fase `01`, item `1.1`, DoD `D1.1`).
Antes desta task o repositório tinha **zero código** e `harness policy --key test_cmd` devolvia
**`{}`** `[MEDIDO 2026-08-28]`.

## Os comandos — e desde 2026-08-28 eles têm uma fachada

**Eram três; são quatro desde `T-01.5`**, e o quarto é o único que não pergunta se o código está bem
escrito, e sim se ele está **no lugar certo**:

```bash
make setup       # cria backend/.venv com POETRY + instala frontend/node_modules — ÚNICO passo com rede
make test        # [test_cmd.sentimento] test  — suíte + piso por camada
make lint        # [test_cmd.sentimento] lint (backend) + ESLint do projeto (frontend)
make boundaries  # fronteira de módulo por grafo de imports (ADR-011/D3a, T-01.5)
```

**`make boundaries` e `make lint` são os dois que o `pre-push` roda sozinho** desde que
`scripts/hooks/pre-push.pre-harness` existe (`ADR-011/D3b`) — ver a seção *"A fronteira de módulo, e
o portão que a roda"*.

O `Makefile` da raiz (`ADR-011/D2`, `T-01.6`) é a **fachada**: ele **chama** os scripts abaixo, que
continuam sendo a **implementação**. Os comandos diretos continuam válidos e são os que este
documento cita nas medições:

```bash
bash backend/scripts/bootstrap.sh    # o que `make setup` chama
bash backend/scripts/test.sh         # o que `make test` chama
bash backend/scripts/lint.sh         # o que `make lint-backend` chama
bash backend/scripts/boundaries.sh   # o que `make boundaries` chama (T-01.5)
```

**Por que as medições citam o script e não o `make`:** quando uma receita falha, o `make` sai com
**2**, qualquer que seja o `rc` do comando. As recusas deste repositório distinguem **`rc=3`** ("não
mediu") de **`rc=1`** ("mediu e reprovou"), e essa distinção só é visível na chamada direta
`[MEDIDO 2026-08-28: `make boundaries` → `make: *** [Makefile:135: boundaries] Erro 3`, e o `make`
sai **2**; `bash backend/scripts/test.sh --no-cov -k <1 teste>` → **3**]`. Para portão ("passou ou
não"), `make` basta.

**RE-MEDIDO em 2026-08-28 depois de `T-01.5`, e o número não mudou — mudou de onde ele vem.** A
recusa `rc=3` do alvo `boundaries` era a guarda de `[tool.importlinter]` ausente, escrita na receita;
agora ela mora em `backend/scripts/boundaries.sh`, junto com mais duas (venv ausente, versão do
interpretador ≠ `PY_ALVO`). Com o venv ausente: `make: *** [Makefile:144: boundaries] Erro 3` e o
`make` sai **2**, enquanto `bash backend/scripts/boundaries.sh` sai **3**
`[MEDIDO 2026-08-28 em clone isolado, com `backend/.venv` movido para fora]`. A linha citada mudou de
`135` para `144` porque a receita encolheu para uma linha.

`test.sh`, `lint.sh` e `boundaries.sh` **RECUSAM com saída 3** se `backend/.venv` não existir, em vez de cair para o
`python3` do `PATH`. O motivo é medido neste disco: `python3` resolve hoje para
`…/harness-panel/.venv/bin/python3` (3.12.8) por vazamento de `PATH`, e o `pyenv` deste repositório
resolveria **3.13.13** pelo `.python-version` da raiz. **Dois ambientes, o mesmo comando** — e um
portão que roda em ambiente não declarado mede outra coisa.

### As outras duas recusas, acrescentadas em 2026-08-28 pelo `/review`

| recusa | o que ela impede | prova de que morde |
|---|---|---|
| **`test.sh` apaga `coverage.xml` antes do pytest**, e `check-coverage-layers.sh` exige o XML **mais novo que o `.py` mais novo de `src/`** | o portão anunciar cobertura lida de **relatório velho**. `test.sh` repassa `"$@"`, logo aceita `--no-cov`/`-k`: sem invalidar o relatório, `--no-cov` não escrevia XML nenhum e o piso media o da **rodada anterior** | `[MEDIDO 2026-08-28: bash backend/scripts/test.sh --no-cov -k test_pendente_preserva_a_ordem_declarada → **rc=3**, `RECUSA: … coverage.xml ausente`. **Antes** do conserto, o **mesmo comando** → `1 passed, 13 deselected` + três `[OK]` 100% + **rc=0**, com o XML **byte-idêntico** (md5 `73dbab8d…`) ao de **3 h antes**]` |
| **`bootstrap.sh` confere a versão efetiva do venv** e sai 3 se não for **3.13** (`ADR-011/D5`) | o venv nascer com a **versão errada em silêncio**. Antes ele escolhia interpretador **por nome** e só **imprimia** a versão — informava, não recusava | **O assert, os dois lados, com o alvo de hoje** `[MEDIDO 2026-08-28 por `T-01.4`]`: **MORDE** — a expressão exata do assert com `PY_ALVO=3.13` contra o venv 3.12.8 que estava no disco → **rc=1**; **CALA** — a mesma expressão contra um 3.13 real → **rc=0**. **Controle, que prova que o par não é vácuo:** com o `PY_ALVO` **antigo** (3.12) os dois lados **invertem** (3.12.8 → rc=0, 3.13.12 → rc=1). Caminho feliz do script inteiro → **rc=0**, `ambiente pronto: Python 3.13.12 … (alvo ADR-011/D5: 3.13, CONFERIDO)` |

**Por que a cobertura precisou das duas metades:** o `rm -f` protege quem entra por `test.sh`; a
checagem de frescor protege a chamada **direta** de `check-coverage-layers.sh` e o caso de um `.py`
editado **depois** da última suíte verde. `[MEDIDO 2026-08-28: touch em
`src/modules/sentimento/domain/etl_backlog.py` + chamada direta do piso → **rc=3**, com o arquivo
ofensor nomeado na saída]`.

**E o nome do binário não é a versão** — este disco prova: `command -v python3.12` →
`…/harness-panel/.venv/bin/python3.12` `[MEDIDO 2026-08-28]`, **o venv de outro projeto**. O
`.python-version` = 3.13.13 da raiz **fica onde está, e agora por decisão e não por adiamento**
(`ADR-011/D5` — ver o ERRATUM abaixo). O assert acima **não** é substituto dele: é a recusa que
garante que o que o arquivo declara seja o que o venv de fato é.

### ⚠️ ERRATUM 2026-08-28 — o alvo era 3.12, e inverteu para 3.13

**Nada acima foi apagado; a linha da tabela teve o CLAIM atualizado e a medição REFEITA**, porque a
medição antiga media o alvo antigo e repeti-la seria citar um número que nenhum comando de hoje
devolve.

`ADR-009/D4` decidia **Python 3.12** e mandava **remover** o `.python-version` = 3.13.13 da raiz.
O owner derrubou as duas metades:

> *"essa questao do python, pode regredir, quero que tenha o python version no 3.13"*
> `[PREMISSA-OWNER: 2026-08-28, citação literal]`

`ADR-011/D5` registra a supersessão. O arquivo **fica** e o alvo é **3.13**.

**Uma afirmação de `ADR-009/D4` estava errada de fato, e ela não é corrigida na ADR de origem**
(ADR é registro histórico): `D4` escreveu que o `.python-version` *"não estava commitado"*. **Estava
rastreado** — `git log --oneline -- .python-version` → **1 commit, `086a8af`**, que é **o mesmo
commit que introduziu a `ADR-009`** `[MEDIDO 2026-08-28]`.

**Três coisas medidas na migração do venv 3.12 → 3.13, que valem mais que a decisão:**

1. **Nenhuma das 5 dependências fixadas precisou compilar do fonte em 3.13** — o falsificador de
   `ADR-011/D5` **não disparou**. `coverage 7.15.4` e `mypy 2.3.1` trocam wheel `cp312` por `cp313`;
   `pytest`, `pytest-cov` (`py3-none-any`) e `ruff` (`py3-none-manylinux…`) são os mesmos arquivos.
   `[MEDIDO 2026-08-28: `Tag:` do `WHEEL` de cada `.dist-info` instalado; **239 `.so`** com ABI
   `cpython-313` no venv novo, contra **239** com `cpython-312` no antigo — mesma contagem]`
2. **`bootstrap.sh` NÃO é idempotente**, e isto é defeito, não escolha: com `backend/.venv` já no
   disco ele sai **rc=2**, `A virtual environment already exists … Use --clear to replace it`, sem
   tocar no venv. Para migrar foi preciso mover o venv antigo para fora antes de rodar.
   `[MEDIDO 2026-08-28]`. **`T-01.4` não conserta isto**: `ADR-011/D1` põe `poetry install` no lugar
   de `uv venv` e quem reescreve este script é **`T-01.6`** — consertar aqui seria arrumar uma linha
   que some na semana que vem, e calar sobre ela seria pior.
3. **`uv` não honra o nome do interpretador que recebe.** Num `PATH` construído para que `python3`
   fosse 3.12.8 e `python3.13` não existisse, `uv venv --python python3` criou um venv
   **3.13.12** assim mesmo `[MEDIDO 2026-08-28]`. É a lição de *"nome não é versão"* numa segunda
   forma — nem o nome **passado à ferramenta** determina a versão —, e é o argumento mais forte a
   favor do assert: ele confere o que **nasceu**, não o que foi **pedido**.

**Divergência de patch, nomeada:** o `.python-version` declara **3.13.13** (pyenv) e o venv nasceu
**3.13.12**, de um CPython gerido pelo próprio `uv`
(`home = ~/.local/share/uv/python/cpython-3.13-linux-x86_64-gnu/bin` `[MEDIDO 2026-08-28:
`backend/.venv/pyvenv.cfg`]`). O assert compara **major.minor** e por isso aceita. Fechar o patch é
decisão de `T-01.6`, que escolhe o gerenciador — não desta task.

### ✅ FECHAMENTO 2026-08-28 por `T-01.6` — as três pendências acima, cada uma com o comando

**Nada do ERRATUM foi apagado.** As três pendências que `T-01.4` deixou nomeadas (`2` idempotência,
`3` interpretador não honrado, e a divergência de patch) foram para o disco de `T-01.6`, que é quem
trocou `uv venv` por `poetry install` — e **as três fecharam, mas não pelo motivo que se supunha**.

| pendência | como estava | como está, e o comando |
|---|---|---|
| **divergência de patch** (`.python-version` = 3.13.13, venv nascia 3.13.12) | `uv python find` preferia o CPython dele (`~/.local/share/uv/python/cpython-3.13-…`) | **FECHADA. O venv nasce 3.13.13** `[MEDIDO 2026-08-28: `bash backend/scripts/bootstrap.sh` → `backend/.venv/pyvenv.cfg` com `home = ~/.pyenv/versions/3.13.13/bin`, `version = 3.13.13` — **igual** ao `.python-version` da raiz]` |
| **`bootstrap.sh` não era idempotente** (`rc=2` com venv em disco, `uv venv` exigia `--clear`) | defeito, e `T-01.4` declarou que não era dela consertar | **FECHADA por natureza do `poetry install`** `[MEDIDO 2026-08-28: duas execuções seguidas de `bash backend/scripts/bootstrap.sh` sobre o venv já em disco → **`rc=0` nas duas**, `No dependencies to install or update`, `ambiente pronto: Python 3.13.13 … CONFERIDO`]` |
| **`uv` não honrava o interpretador que recebia** (num `PATH` com `python3` = 3.12.8 e sem `python3.13`, criava um venv **3.13.12** assim mesmo) | a pergunta que `T-01.4` mandou `T-01.6` responder sobre o Poetry | **O Poetry NÃO tem esse comportamento — e recusa ANTES de criar** `[MEDIDO 2026-08-28 por `T-01.6`, bancada isolada, `PATH` construído com `python3` = 3.12.8 REAL e `python3.13` inexistente: `The specified Python version (3.12.8) is not supported by the project (>=3.13,<3.14)`, **`backend/.venv` não chegou a nascer**, `bootstrap.sh` → **`rc=3`**]` |

**Quem faz o serviço na terceira linha é o `requires-python` que `T-01.6` acabou de declarar** — a
superfície 4 de 4 de `ADR-011/D5`, a metade que faltava de `D1.9`. Ele deixou de ser declaração de
alvo e virou recusa executável na criação do ambiente.

#### ⚠️ E o conserto de uma linha que o `/review` prescreveu NÃO era suficiente — medido

O `/review` de `T-01.4` prescreveu passar `"$(command -v -- "$candidato")"`, o **caminho absoluto**,
em vez do nome. **`T-01.6` mediu e o caminho absoluto também não é versão:** `command -v python3.13`
devolve `~/.pyenv/shims/python3.13`, que é um **despachante**, não um interpretador — ele resolve a
versão contra o `.python-version` do diretório **de onde é invocado**.

`[MEDIDO 2026-08-28: numa réplica do `backend/` fora da árvore (logo sem o `.python-version` da
raiz), `poetry env use ~/.pyenv/shims/python3.13` falhou com `pyenv: python3.13: command not found` /
`Could not find the python executable`]`.

⇒ É a lição de *"nome não é versão"* numa **terceira** forma, depois de (1) o nome do binário e (2) o
nome passado à ferramenta. O `bootstrap.sh` de hoje não para no `command -v`: ele pergunta ao
próprio candidato onde ele mora (`sys.executable`), o que resolve o shim até o binário real
`[MEDIDO 2026-08-28: `python3.13 -c 'import sys; print(sys.executable)'` →
`~/.pyenv/versions/3.13.13/bin/python3.13`]`, e **recusa um candidato que nem executa** em vez de
passá-lo adiante.

**O assert de `PY_ALVO` continua sendo a única coisa que confere o que NASCEU**, e agora ele vive em
**dois** lugares. Os dois lados, os dois arquivos, **4 medições**
`[MEDIDO 2026-08-28: mutação de `PY_ALVO` sobre o venv real 3.13.13]`:

| script | `PY_ALVO=3.12` (mutado) | `PY_ALVO=3.13` (real) |
|---|---|---|
| `scripts/bootstrap.sh` | **`rc=3`**, `RECUSA: o venv nasceu em Python 3.13.13, e ADR-011/D5 declara Python 3.12.` | **`rc=0`** |
| `scripts/lint.sh` | **`rc=3`**, `RECUSA: o venv em …/.venv e Python 3.13.13, e ADR-011/D5 declara Python 3.12.` | **`rc=0`** |

### 🔒 `backend/poetry.toml` — o arquivo sem o qual a migração quebra no próximo clone

`ADR-011/D1`. Os quatro scripts resolvem `backend/.venv` **literal**, e o Poetry só põe o venv ali se
`virtualenvs.in-project` for verdadeiro — que **nesta máquina é config de USUÁRIO, não do
repositório**. `backend/poetry.toml`, versionado, fixa isso para o clone.

**Teste dos dois lados (item `1.8'` do plano `01`), em réplica isolada com config de usuário
VIRGEM** (`POETRY_CONFIG_DIR` e `POETRY_CACHE_DIR` apontados para diretórios novos, logo
`virtualenvs.in-project` no default de fábrica) `[MEDIDO 2026-08-28]`:

| lado | `poetry config virtualenvs.in-project` | onde o venv nasceu | `bootstrap.sh` | `lint.sh` |
|---|---|---|---|---|
| **SEM `backend/poetry.toml`** | **`null`** (fábrica) | `<cache>/virtualenvs/cripto-strategy-backend-…-py3.13` | **`rc=3`**, `RECUSA: 'poetry env use' nao criou …/backend/.venv/bin/python` — **o falsificador de `ADR-011/D1`, escrito como recusa** | **`rc=3`**, venv não existe |
| **COM `backend/poetry.toml`** | **`true`** | **`backend/.venv`**, Python **3.13.13** | **`rc=0`**, `ambiente pronto … CONFERIDO` | **`rc=0`** |

**Uma sem a outra não contaria:** o lado "morde" sozinho não distinguiria este arquivo de um
`poetry.toml` que quebrasse tudo; o lado "cala" sozinho seria indistinguível de o arquivo não fazer
nada — porque **nesta máquina a config de usuário já dá `true`**, e foi exatamente para escapar
desse falso positivo que a medição foi feita em réplica com config virgem.

**Uma armadilha nomeada, achada nessa mesma bancada:** rodar o lado SEM e depois o lado COM **no
mesmo cache** dá `rc=3` nas duas vezes. O Poetry registra o env corrente por projeto no
`envs.toml` do cache e `env use` o **reaproveita** em vez de criar em `backend/.venv`
`[MEDIDO 2026-08-28: `<cache>/virtualenvs/envs.toml` → `[cripto-strategy-backend-LNkTWgt4]`,
`patch = "3.13.13"`]`.

#### ⚠️ CORREÇÃO 2026-08-28 (`/qa` → `NEEDS_FIX`) — a receita de recuperação publicada aqui NÃO funcionava

**O que esta seção dizia, e estava errado:** *"precisa de `poetry -C backend env remove --all` antes
— e a recusa do `bootstrap.sh` diz isso na saída"*. A **armadilha** estava medida; o **remédio**
não, e saiu publicado sob o mesmo selo `[MEDIDO … em réplica isolada]` da frase ao lado. **O `/qa`
executou a receita — que é o passo que faltou — e ela é um no-op.**

**Causa:** com `in-project = true` em vigor, `env remove --all` **só enumera o `.venv` do
projeto**, e o env que gruda é justamente o do **cache**, que ele não vê. Ele esvazia o `envs.toml`
e deixa o env de pé: `poetry env list` continua listando-o como `(Activated)` depois do `remove`.

**As três receitas, com controle invertido em cada uma** — `bootstrap.sh` rodado **depois** de cada
uma, a partir do mesmo estado grudado `[MEDIDO 2026-08-28 pelo `/qa`, reproduzido por `T-01.6`,
n=3 receitas + 1 controle sem receita]`:

| receita | saída dela | `bootstrap.sh` depois | `backend/.venv` nasce? |
|---|---|---|---|
| *(nenhuma — controle)* | — | **`rc=3`** | **não** |
| `poetry -C <backend> env remove --all` **(a que estava publicada)** | **nada impresso**, `rc=0`; `env list` ainda mostra `(Activated)` | **`rc=3`**, `Using virtualenv: <cache>/virtualenvs/…` | **não** |
| `POETRY_VIRTUALENVS_IN_PROJECT=false poetry -C <backend> env remove --all` | `Deleted virtualenv: …-py3.13`, `env list` vazio | **`rc=0`**, `ambiente pronto: Python 3.13.13 … CONFERIDO` | **sim** |
| `rm -rf <cache>/virtualenvs/<nome>` | — | **`rc=0`** | **sim** |

⇒ **A receita correta carrega a variável de ambiente NA LINHA**, não numa nota de rodapé — é ela que
faz o serviço:

```bash
POETRY_VIRTUALENVS_IN_PROJECT=false poetry -C backend env remove --all && make setup
```

**E ela foi executada VERBATIM antes de ser publicada**, extraída da saída do próprio `bootstrap.sh`
em vez de redigitada `[MEDIDO 2026-08-28: réplica completa (Makefile + `frontend/`), estado grudado
reproduzido, a linha extraída da recusa por `grep -oE` e passada a `eval` → `Deleted virtualenv` +
`Creating virtualenv … backend/.venv` + `ambiente pronto: Python 3.13.13 … CONFERIDO` +
`added 88 packages`, **`rc=0`**; e o controle invertido depois: `bootstrap.sh` de novo **`rc=0`**,
`lint.sh` **`rc=0`**]`.

**A lição, e ela é a razão de este parágrafo existir em vez de a linha ser só trocada:** é **a mesma
classe de defeito que esta task cobrou do `/review`** na dívida 1 de 4 — *"o conserto prescrito não
bastava"* —, agora do outro lado do balcão. **Medir a armadilha não é medir o remédio**, e o cenário
em que alguém lê essa linha é exatamente o clone limpo que esta task inteira existe para proteger.
Pior: a recusa antiga imprimia a receita quebrada **de novo** depois de ela falhar, o que põe quem
seguiu a instrução num laço.

### 🧱 O achado mais grave do `/review`, e o que `T-01.6` decidiu — **as duas metades**

**O achado:** *nenhum portão chamava `bootstrap.sh`*. Não há CI (`ls .github` → inexistente), o
`pre-push` gerado roda `require-push` + `rules --mode sweep` e **não chama `make`**, e as três
menções a `bootstrap.sh` em `lint.sh`, `test.sh` e `check-coverage-layers.sh` eram **texto de
mensagem de erro**, não chamada. Logo o único assert da versão **efetiva** do interpretador não era
executado por ninguém — e `mypy python_version` / `ruff target-version` declaram **alvo**: um venv
3.12 passaria o lint igual.

**A decisão de `T-01.6`, e por que não é uma só:**

| metade | onde | o que ela fecha, e o que ela NÃO fecha |
|---|---|---|
| **(a)** `make setup` chama `bash backend/scripts/bootstrap.sh` | `Makefile`, alvo `setup` | dá ao script um chamador nomeado e uma superfície única. **Não fecha o achado:** `make setup` é comando de **humano**, e quem não o rodar segue com o venv errado e sem ninguém conferindo |
| **(b)** a asserção da versão **efetiva** entra em `backend/scripts/lint.sh` | `lint.sh`, `rc=3` citando `ADR-011/D5` | **esta é a que fecha.** `make lint` é o que `scripts/hooks/pre-push.pre-harness` (`ADR-011/D3b`, **`T-01.5`**) vai rodar no `pre-push` — a assertion passa a ser alcançável por um portão que reprova sozinho |

**Escolher só (a) deixaria o achado aberto com aparência de fechado**, que é a classe de defeito que
este repositório passou o dia catalogando. **Registro honesto do que ainda falta:** enquanto
`T-01.5` não escrever `scripts/hooks/pre-push.pre-harness`, **(b) é uma recusa que existe e que
nenhum portão automático dispara** — ela só roda quando alguém chama `make lint` ou `lint.sh`. O
achado está **com dono e com mecanismo**, não **fechado por portão**.

**Duplicação deliberada e nomeada:** a expressão do assert está em `bootstrap.sh` **e** em `lint.sh`,
idêntica. Centralizá-la exigiria um quinto script, e `ADR-011/D2` não autoriza `T-01.6` a criar um.
Se `PY_ALVO` mudar, mudam os dois — e o comando do DoD `D1.9`
(`grep -n 'PY_ALVO' backend/scripts/*.sh`) os encontra **juntos**, que é o motivo de a duplicação ser
tolerável aqui e não em geral.

### 📎 2026-08-28/29 por `T-01.7` — docstrings em inglês, `"D"` no `select`, e o `...` de `Protocol` que a cobertura NÃO conta

As docstrings deste backend estão em **inglês** (`ADR-011/D6`, `plano 01` item `1.11`). Comentários `#`,
mensagens de erro e nomes de teste **continuam em português** — a convenção alcança a docstring, e só
ela. **Idioma de docstring é convenção, não portão** — e a metade que É mensurável **agora está no
portão**, o que até 2026-08-29 não era verdade.

**`"D"` entrou em `[tool.ruff.lint] select` por `T-01.7`.** Antes disso `select` não o tinha e
`lint.sh:51` roda `ruff check src tests` **sem** `--select D` ⇒ **as 55 docstrings podiam ser apagadas e
`lint.sh` e `make lint` continuavam verdes**, e os 3 `noqa: D102` abaixo eram **inertes**
`[MEDIDO 2026-08-29, em cópia restaurada e conferida por sha256: com a docstring de
`JsonlCheckpoint.done()` apagada, `ruff check src tests` → **rc=0** "All checks passed!", enquanto
`ruff check --select D src tests` → **rc=1** `D102`]`. `ADR-011:268` já tinha recusado a forma mais
fraca — *"ferramenta só no `lint.sh` fica fora do portão que de fato reprova"* —, e esta estava fora
**até do `lint.sh`**.

**Depois, o portão real morde** `[MEDIDO 2026-08-29, n=4, via `bash backend/scripts/lint.sh`]`:

| mutação | `bash backend/scripts/lint.sh` |
|---|---|
| apagar a docstring de `JsonlCheckpoint.done()` | **`rc=1`** · `D102 Missing docstring in public method` |
| tirar o ponto final do resumo de `record()` | **`rc=1`** · `D400` **e** `D415` (a mesma linha acende as duas) |
| remover **1** dos 3 `noqa: D102` | **`rc=1`** · `D102` — os `noqa` **suprimem achado real**, não são enfeite |
| traduzir `done()` de volta ao **português**, forma intacta | **`rc=0`** · "All checks passed!" |

A última linha é a prova, no portão de verdade, de que **`D` é cego a idioma** — e é por isso que o
idioma continua sendo **convenção conferida por leitura humana**, e não regra automática (`D1.10`
**reprova** quem declarar uma). Escopo e os 8 achados pré-existentes de `scripts/verify_screen.py`, que
nenhum portão linta: `README.md` da raiz, §"Idioma de docstring é convenção, não portão".

**O achado desta task, e ele é sobre o piso de cobertura, não sobre idioma.** Documentar um método de
`Protocol` obriga a trocar o corpo `...` pela docstring — e **o `...` de uma linha é excluído da
cobertura pelo regex PADRÃO do `coverage.py`**, não por escolha deste repositório
`[MEDIDO 2026-08-28: CoverageConfig().exclude_list tem 3 padrões, e o segundo casa "def …: ..." numa
linha só]`. A troca foi **feita e medida antes de ser desfeita**:

| forma dos 3 stubs de `Protocol` | `use_cases` | TOTAL | `cd backend && ruff check --select D src tests` |
|---|---|---|---|
| `def process(...) -> None: ...` (hoje, com `noqa` nomeado) | **16/16 linhas** | **107** statements | verde |
| `def process(...) -> None:` + docstring | **19/19 linhas** | **110** statements | verde |

`[MEDIDO 2026-08-28: bash backend/scripts/test.sh nas duas formas → 14 passed, 100%, rc=0 nas duas]`

**A segunda forma não é errada — ela mede MAIS.** Foi desfeita porque o falsificador declarado de
`T-01.7` é *"a suíte continua verde com os mesmos números"*, e **um falsificador que se explica em vez
de passar já foi derrotado**. Os três `noqa: D102` vivem em
`src/modules/sentimento/use_cases/drain_etl_backlog.py`, cada um ao lado do stub, com o motivo escrito
acima deles; o contrato de cada porta está na docstring da **classe**. **Quem der corpo real a esses
stubs tira o `noqa` junto com o `...`** — e aí os 3 statements entram na medição de vez.
## 🧱 A fronteira de módulo, e o portão que a roda — `T-01.5` (`ADR-011/D3`)

`make boundaries` → `backend/scripts/boundaries.sh` → `import-linter` sobre o **grafo** de imports.
Os contratos vivem em `[tool.importlinter]` do `backend/pyproject.toml`; o portão que os roda
**sozinho** é `scripts/hooks/pre-push.pre-harness`. **As duas metades são obrigatórias:** contrato sem
portão é ferramenta que existe e ninguém roda.

**São `2` contratos**, e cada um foi provado **dos dois lados** (`1.8'`, `D1.7e`) — morde *e* cala:

| contrato | morde (`D1.7a`) | cala (`D1.7d`) |
|---|---|---|
| `Camadas por contexto: infra > use_cases > domain` | com os **2** violadores de camada: `BROKEN`, nomeando as **2** linhas ofensoras. O contrato **2** fica `KEPT` na mesma passada — logo ele não é "contrato que reprova tudo" `[MEDIDO 2026-08-28: make boundaries → "1 kept, 1 broken", rc(make)=2, rc(boundaries.sh)=1]` | `KEPT` `[MEDIDO 2026-08-28: make boundaries → "Analyzed 10 files, 1 dependencies", "2 kept, 0 broken", rc=0]` |
| `Fronteira de contexto: sentimento nao importa outro contexto` | com o contexto `charts` **efêmero** e um import de `sentimento` para ele: `BROKEN`, nomeando a linha. O contrato **1** fica `KEPT` na mesma passada `[MEDIDO 2026-08-28: make boundaries → "Analyzed 14 files, 2 dependencies", "1 kept, 1 broken"; **fixture de 4 arquivos**, e o número só reproduz com ele: `charts/__init__.py`, `charts/domain/__init__.py`, `charts/domain/serie.py` e `sentimento/use_cases/violador_de_contexto.py` ⇒ 10 + 4 = 14. Com fixture de 3 arquivos sai 13, e o veredito cruzado (BROKEN/KEPT) é o mesmo — re-conferido 2026-08-29]` | `KEPT` — **e este lado é VÁCUO hoje**, ver o parágrafo abaixo |

**⚠️ O lado "cala" do contrato 2 é vácuo, e dizer isso é o que o separa de propaganda.** Os três
módulos proibidos (`charts`, `convergencia`, `backtest`) **não existem no disco**, e o `import-linter`
**não recusa** contrato que nomeie módulo inexistente — ele devolve `KEPT`
`[MEDIDO 2026-08-28: contrato idêntico, repositório como está → "fronteira sentimento x charts KEPT", rc=0]`.
O que **não** é vácuo é o lado "morde": plantando o contexto vizinho junto com o violador, ele reprova.
O contrato está **dormente e ARMADO**, não desligado — e a diferença entre os dois só se conhece
medindo. **Quem criar o segundo contexto acrescenta o contrato `forbidden` dele**; nada neste
repositório obriga isso hoje, e por isso está escrito aqui como **dívida nomeada, não portão**.

**⚠️ CORREÇÃO DE GENERALIDADE `[/review 2026-08-29]`, e ela importa porque a redação anterior
ensinava uma impossibilidade que não existe:** *"o `import-linter` não recusa contrato que nomeie
módulo inexistente"* é verdade **só do tipo `forbidden`**. O tipo `layers` **sabe recusar**
`[MEDIDO 2026-08-29: `containers = ["src.modules.sentimentoo"]` → **rc=1**, *"module does not
exist"*; `root_package = "srcX"` → **rc=1**, *"Could not find package"* — e, com a guarda 4 deste
ciclo, os dois viram **rc=3**, porque declaração quebrada é *não mediu*, não *mediu e reprovou*]`.
⇒ **o `layers` sabe; o `forbidden` não** — e é só sobre o `forbidden` que o vácuo acima vale.

**Conserto barato disponível, registrado como OPÇÃO NOMEADA e não feito aqui:** cruzar
`forbidden_modules` com o **vocabulário fechado** (`harness policy --key components`) dentro do
mesmo `$PY` de `boundaries.sh` — um typo em `charts` viraria recusa **sem precisar que o módulo
exista**. Não é obrigação desta task (`ADR-011/D3a` não a pede), e fazer política de componente
dentro de um script de portão é decisão de quem possui o vocabulário `[NÃO MEDIDO: nenhum
experimento deste ciclo mediu o custo ou os falsos positivos desse cruzamento]`.

### As quatro mutações que o `/qa` acrescentou, re-rodadas aqui — verde não prova nada até algo reprovar

O `/qa` de 2026-08-29 estendeu esta bancada em três pontos e achou um defeito de código num quarto.
**As quatro foram re-executadas nesta árvore**, e não repassadas:

| mutação | o que ela responde | resultado `[MEDIDO 2026-08-29]` |
|---|---|---|
| plantar os **três** contextos proibidos (`charts` + `convergencia` + `backtest`) e importar os três | a bancada original exercitou **só `charts`**: as outras duas grafias de `forbidden_modules` podiam estar mortas | `BROKEN` nomeando as **3** separadamente (`… is not allowed to import src.modules.backtest` / `… charts` / `… convergencia`), `Analyzed 20 files, 4 dependencies`, rc(make)=2 |
| inverter a ordem do contrato 1 para `["domain", "use_cases", "infra"]`, **sobre a árvore limpa** | o "cala" do contrato 1 lê o código de hoje, ou passa por não ter olhado? | `BROKEN` sobre o **único** import interno do repositório (`use_cases → domain`), `Analyzed 10 files, 1 dependencies`. Revertida a ordem: `2 kept, 0 broken`, rc=0. **O "cala" olha** |
| renomear a secção para `[tool.importlinterXX]` | a guarda de `[tool.importlinter]` ausente distingue *"não mediu"* de *"mediu e reprovou"*? | **ACHADO REAL, e era defeito de código.** Com a guarda antiga (`'^\[tool\.importlinter'`, **sem** o `\]`) ela **escapava por prefixo**: passava, o `lint-imports` morria com `'root_package'` e saía **rc=1** — *não mediu* vestido de *mediu e reprovou*, pela fresta que o comentário logo acima existe para fechar. Conserto de **2 caracteres** (`\]`), com controle invertido: guarda antiga + mutação → **rc=1**; guarda nova + a **mesma** mutação → **rc=3**; guarda nova + árvore boa → **rc=0**. **⚠️ E o conserto fechava SÓ ESTA ROTA:** o `/review` de 2026-08-29 mediu **quatro outras** que continuavam abertas — ver a seção seguinte, que é onde a guarda deixou de medir texto |
| custo do portão | um portão caro é um portão que alguém desliga | `make boundaries` + `make lint`, a quente, **1,06 · 1,08 · 1,06 s** (n=3). O `/qa` mediu o `pre-push` inteiro: **1,2–1,7 s** quente e **3,8 s** com caches limpos `[MEDIDO pelo /qa 2026-08-29, não re-rodado aqui]` |

### 🔴 A NONA instância da família, e ela estava DENTRO do portão — `/review` 2026-08-29

O `/review` reprovou `T-01.5` por **um** blocker, e ele dói mais do que o tamanho do conserto sugere:
`boundaries.sh` media **a secção** e falava em nome dos **contratos**. A guarda perguntava *"o
cabeçalho `[tool.importlinter]` existe?"* e a mensagem dela afirmava *"não há **contrato** a
avaliar"* e *"portão sem contrato não é portão verde: é portão que não olhou"*. **Ela nunca olhou
contrato nenhum** — e isso reintroduz, **no gate**, exatamente o defeito *regex-de-linha × estrutura*
que `ADR-011/D3a` usa como argumento para derrubar as duas `[[rules.own]]`, num arquivo cujo
cabeçalho tem 40 linhas explicando por que `grimp` lê o **grafo** em vez de ler texto.

**A premissa que autorizava a guarda fraca era falsa, e estava publicada sem comando e sem rótulo:**
o comentário dizia que *"`lint-imports` sem contrato nenhum sai `rc=1` com 'no contracts'"*. **Não
reproduz** — sai **`rc=0`** com **`Contracts: 0 kept, 0 broken.`** `[MEDIDO 2026-08-29]`. Um número
sem comando envelheceu **para dentro** de um portão e sustentou a fresta por dois ciclos.

**O conserto mede o que a ferramenta FEZ, não o que o arquivo DIZ:** a linha de veredito que o
próprio `import-linter` imprime. Sem linha de veredito ⇒ não julgou ⇒ **`rc=3`**. `0 kept, 0 broken`
⇒ julgou o vazio ⇒ **`rc=3`**. Qualquer outro veredito ⇒ o `rc` da ferramenta passa **inteiro**.

**A bancada: 10 passadas, cada mutação revertida e a árvore limpa reconferida entre elas**
`[MEDIDO 2026-08-29]`. As linhas em **negrito** são as que a guarda anterior deixava passar:

| passada | guarda ANTES (`\]` do ciclo 2) | guarda DEPOIS |
|---|---|---|
| árvore limpa | `rc=0`, `2 kept, 0 broken` | `rc=0` — **controle: o portão continua deixando passar** |
| **os 2 blocos `[[…contracts]]` removidos** | **`rc=0`**, `0 kept, 0 broken` | **`rc=3`** |
| **typo na tabela: `[[tool.importlinter.contract]]`** | **`rc=0`**, `0 kept, 0 broken` | **`rc=3`** |
| **`backend/.importlinter` existe (precedência)** | **`rc=0`**, `0 kept, 0 broken` | **`rc=3`** |
| **`backend/setup.cfg` com `[importlinter]`** | **`rc=0`**, `0 kept, 0 broken` | **`rc=3`** |
| `[tool.importlinterXX]` (a rota do ciclo 2) | `rc=3` | `rc=3`, e a mensagem agora **nomeia a secção** |
| `root_package = "srcX"` | `rc=1` | `rc=3` — declaração quebrada é *não mediu* |
| `containers = ["src.modules.sentimentoo"]` | `rc=1` | `rc=3` — idem |
| **violação de camada REAL** | `rc=1` | **`rc=1`** — **o controle que mais importa: violação real NÃO virou "não mediu"** |
| árvore limpa, ao final | `rc=0` | `rc=0` |

**As duas rotas de arquivo são a versão pior do mesmo defeito: a guarda lê UM arquivo e a ferramenta
lê OUTRO.** Nenhuma regex sobre `pyproject.toml` fecha isso, porque o problema não está lá dentro —
é a razão de a guarda nova não olhar arquivo nenhum.

**E o conserto do conserto, medido na mesma bancada:** a primeira versão da guarda 4 ficou
**inalcançável**. `grep` sem casar sai `1`, `set -o pipefail` propaga, `set -e` mata o script ali — e
`root_package`/`containers` inexistentes saíam `rc=1` *fingindo ser a ferramenta*. O `|| true` no fim
do pipeline é o que os leva a `rc=3` `[MEDIDO 2026-08-29: sem ele, rotas 6 e 7 → rc=1; com ele →
rc=3]`. **Foi a bancada que pegou, não a leitura** — é a mesma família, uma camada abaixo.

**A guarda da secção FICA**, agora dizendo o que mede: ela é a única que consegue **nomear** a secção
errada. Sem ela, `[tool.importlinterXX]` cairia na guarda 4 com mensagem genérica.

### O controle que separa "quem pegou" de "alguém pegou"

Os `2` violadores de camada usam o símbolo que importam, de propósito: com import ocioso o `ruff`
reprovaria por `F401` e seria impossível dizer **qual** portão pegou a violação. Com eles na árvore,
`make lint` sai **`rc=0`** sobre **15** arquivos `[MEDIDO 2026-08-28: make lint → "All checks passed!",
"15 files already formatted", "Success: no issues found in 15 source files", rc=0]` — logo quem os
recusa é **só** `make boundaries`.

### O falsificador de `D1.7c`, medido dos dois lados — e o "antes" do plano estava ERRADO

Bancada isolada: clone do repositório em `/tmp`, com o `pre-push` **gerado** copiado, o ledger de
`.git/harness/` copiado (estado `BUILD_AUTHORIZED`, o mesmo do repositório real) e um `remoto.git`
local. **Nada foi escrito no repositório real, e os hooks compartilhados não foram tocados.**

| # | árvore | `pre-push.pre-harness` | `git push --dry-run` |
|---|---|---|---|
| **a** | limpa | **não** instalado | **ACEITO**, `rc=0` |
| **b** | + violador `.tsx` (`any` + `console`) | **não** instalado | **ACEITO**, `rc=0` |
| **c** | + os **2** violadores de camada `.py` | **não** instalado | **ACEITO**, `rc=0` |
| **d** | os **3** violadores | **instalado** | **RECUSADO**, `rc=1` — a saída nomeia o contrato `layers` e as **2** linhas, e o ESLint nomeia as **2** violações do `.tsx` |
| **e** | limpa | **instalado** | **ACEITO**, `rc=0` |
| **f** | limpa, **sem `make setup`** | **instalado** | **RECUSADO**, `rc=1`, por `rc=3` de "venv ausente" nos dois alvos — *não mediu* também recusa |

`[MEDIDO 2026-08-28, seis passadas de `git push --dry-run` na bancada isolada]`

**A correção que a medição impôs, e ela derruba uma frase do plano `01` (item `1.9'`) e da própria
`T-01.5`:** o "antes" descrito lá é *"hoje o push é recusado para o `.py` (o `rules --mode sweep` o
pega) e aceito para o `.tsx` (fora de `code_paths`)"*. **As duas metades estão erradas hoje**, e as
duas foram medidas:

- o `.py` violador de camada **não** é pego por regra nenhuma — as duas `[[rules.own]]` de camada
  foram derrubadas por `ADR-011/D3` e nunca chegaram a existir
  `[MEDIDO 2026-08-28: harness rules --mode file --path backend/src/modules/sentimento/domain/violador_de_camada.py → rc=0, saída vazia; harness rules --mode sweep --surface git-hook → rc=0, só o AVISO de browser-test-file-present]`;
- o `.tsx` **está** dentro de `code_paths` desde `T-01.2`
  `[MEDIDO 2026-08-28: harness code-paths classify frontend/src/components/ui/violador_eslint.tsx → "producao: include_prefixes + include_globs casam e nada exclui"]` — o que o deixa passar não é o
  recorte de caminho, é que **nenhuma regra em vigor cobre `any`/`console`** desde que `ADR-011/D4` as
  trocou por ESLint `[MEDIDO 2026-08-28: harness rules --mode file sobre ele → rc=0]`.

⇒ **ERRATUM 2026-08-29, por `NEEDS_FIX` do `/qa`, e o defeito é meu:** a frase que estava aqui dizia
que o "antes" era *"simétrico: os dois eram ACEITOS"*. **Ela só é verdadeira sob substituição do
artefato, e a substituição não estava declarada** — que é exatamente a armadilha "ferramenta
respondendo pergunta ligeiramente diferente da que se quis fazer", desta vez cometida por mim.

**O `.tsx` que o PLANO nomeia não é o `.tsx` que esta bancada usou.** O do plano é o de `D1.3` — o
`import … from "…/backend/src/…"`, que `web-fullstack.browser-imports-server` cobre. O desta bancada
é um `any` + `console`, que **nenhuma regra em vigor** cobre.

⇒ O "antes" real é **assimétrico com as metades INVERTIDAS em relação ao plano**: o `.py` é **ACEITO**
`[MEDIDO 2026-08-29: harness rules --mode file sobre o violador de camada → rc=0, saída vazia;
harness rules --mode sweep --surface git-hook → rc=0]` e o `.tsx` **que o plano nomeia** é
**RECUSADO** `[MEDIDO 2026-08-29: com `frontend/src/features/panel/serie.tsx` (a receita de `§3` do
`frontend/README.md`) na árvore, `harness rules --mode sweep --surface git-hook` → rc=1,
`[BLOQUEIO] [web-fullstack.browser-imports-server] frontend/src/features/panel/serie.tsx:1`]`. A
bancada usou um `.tsx` de `any` + `console` — **sobre ELE, e só sobre ele**, o "antes" é ACEITO
`[MEDIDO 2026-08-29: o mesmo sweep, com o `any`+`console` no lugar → rc=0]`.

**A troca foi metodologicamente melhor, e é por isso que ela fica** — mas declarada: o `.tsx` do plano
já é recusado hoje, então ele tornaria o falsificador **não-informativo** (o push cairia antes de o
`make lint` falar). O desfecho de `D3b` não muda: as duas metades do plano continuam erradas, e o
buraco que o ESLint no `pre-push` fecha continua existindo — ele é **de regra** (`any`/`console` sem
dono desde que `ADR-011/D4` trocou as duas `[[rules.own]]` por ESLint), **não de caminho**.

### A 5ª via de resolução de interpretador, fechada — e a receita publicada não executava

O `/review` de 2026-08-28 mediu que `Makefile:136` (`cd backend && poetry run lint-imports`) era a
**única** execução de backend fora de `backend/.venv/bin/python`, e portanto sem a recusa `rc=3` e sem
o assert de versão. Ela era **latente** (a guarda de `[tool.importlinter]` ausente recusava antes) e
`T-01.5` a tornaria **alcançável**. Ela foi fechada **no mesmo ato** em que deixou de ser latente:
o alvo passou a ser `bash backend/scripts/boundaries.sh`, que herda a recusa dos outros scripts.

**As duas formas que o `/review` prescreveu, conferidas antes de escolher:**

| forma prescrita | veredito medido |
|---|---|
| `backend/.venv/bin/python -m importlinter` | **NÃO EXECUTA.** O pacote não tem `__main__.py` `[MEDIDO 2026-08-28: → "No module named importlinter.__main__; 'importlinter' is a package and cannot be directly executed"]`. Publicar a receita sem rodá-la teria posto no repositório um comando que não roda |
| herdar a recusa dos scripts | **ESCOLHIDA.** `boundaries.sh` carrega as mesmas 3 recusas `rc=3` (venv ausente · versão ≠ `PY_ALVO` · `[tool.importlinter]` ausente) e chama `"$PY" "$BACKEND/.venv/bin/lint-imports"` — interpretador e script **nomeados**, os dois dentro do venv já conferido |

**Por que `poetry run` não serve — e a evidência que estava aqui foi TROCADA pela pior, que é a
verdadeira** `[ERRATUM 2026-08-29, achado do `/qa`]`. A versão anterior citava um caminho que **não é
o que o comando devolve de dentro de `backend/`**, e citar saída que o leitor não reproduz é o defeito
que este repositório caça. Re-medido em bancada própria — venv **3.13.13 real** criado com Poetry,
**sem** `import-linter` — e o comportamento depende do `.python-version` do diretório, o que torna o
problema **pior**, não menor:

| contexto | `poetry run lint-imports --version` | leitura |
|---|---|---|
| diretório **com** `.python-version = 3.13.13` (é o caso de `backend/`) | **rc=127**, `pyenv: lint-imports: command not found` | falha barulhenta — a menos ruim |
| diretório **sem** `.python-version` | **rc=0**, **`import-linter 2.13`** | **ferramenta de outra versão, sob interpretador que o repositório não declarou, saindo VERDE** |
| `PYENV_VERSION=3.12.8 poetry run lint-imports --version` | **rc=0**, **`import-linter 2.13`**, resolvido em `/home/stharley/.pyenv/versions/3.12.8/bin/lint-imports` | **o cenário perigoso, explícito: 3.12.8 é exatamente o interpretador que `ADR-011/D5` recusa** |

`[MEDIDO 2026-08-29, bancada isolada em `/tmp`; e no `backend/` REAL, cujo venv TEM a ferramenta,
`poetry run which lint-imports` → `…/backend/.venv/bin/lint-imports` e `--version` → `import-linter
2.14`, rc=0 — ou seja: **`poetry run` acerta quando o ambiente já está certo, e é justamente quando
ele está errado que ele mente**]`

⇒ um portão não pode depender de "o ambiente já estar certo": é para isso que ele existe. `boundaries.sh`
nomeia o interpretador **e** o script, os dois dentro do venv que ele acabou de conferir.

**Consequência para `D1.9`:** `grep -n 'PY_ALVO' backend/scripts/*.sh` agora encontra **3** arquivos
(`bootstrap.sh`, `lint.sh`, `boundaries.sh`) e não 2. A duplicação continua deliberada e nomeada, pela
mesma razão que `lint.sh` já registra.

### Um defeito do instalador, medido e consertado no mesmo ato

`scripts/install-git-hooks.sh` **morria numa worktree** — o layout que este repositório usa para rodar
tasks em paralelo — porque `$ROOT/.git` ali é um **arquivo**
`[MEDIDO 2026-08-28: rodado de `/tmp/claude-1002/wt/T-01.5` → "install: não foi possível obter estado
de '.../.git/hooks/commit-msg': Não é um diretório", rc=1, zero arquivo instalado]`. Quem acabara de
escrever `scripts/hooks/pre-push.pre-harness` não conseguia instalá-lo de onde o escreveu. O destino
passou a ser `git rev-parse --path-format=absolute --git-path hooks`, que responde *"onde o git
procura hook?"* e devolve o diretório **comum**
`[MEDIDO 2026-08-28: da raiz principal e da worktree, os dois devolvem o mesmo caminho; sem
`--path-format=absolute` a raiz principal devolve o RELATIVO `.git/hooks`]`. Conferido na bancada:
instalação **a partir de uma worktree** do clone põe os 2 hooks no `.git/hooks` comum e **não**
sobrescreve o `pre-push` gerado `[MEDIDO 2026-08-28: rc=0; `grep -c harness-githook .git/hooks/pre-push` → 1]`.

**Corolário que vale dizer em voz alta: hook é COMPARTILHADO entre worktrees.** Instalar de uma
worktree instala para **todas**, inclusive as das outras tasks em andamento. É por isso que esta task
**não** instalou o hook no repositório real — a instalação é ato de quem tiver a árvore inteira, não
de uma task rodando em paralelo com outras duas.

### ⚠️ HAND-OFF OBRIGATÓRIO — o portão está versionado e **NÃO instalado**

`T-01.5` **não instalou** o hook, e isso foi decisão medida, não esquecimento: `.git/hooks` é o
diretório **COMUM** de todas as worktrees `[MEDIDO 2026-08-28: `git rev-parse --path-format=absolute
--git-path hooks` devolve o mesmo caminho da raiz principal e de uma worktree]`, e instalá-lo com
outras tasks rodando em paralelo ligaria o portão nas árvores **delas**, que não têm `make setup`.

**Estado no disco do dono, hoje:** `ls .git/hooks` → só `commit-msg` e `pre-push`. **`harness doctor`
diz `CONFORME` e não menciona a ausência** — ele confere os hooks que o *plugin* declara, e este não é
um deles. Logo **nada avisa** que o portão está desligado.

⇒ **depois do merge, uma vez, da raiz do repositório:**

```bash
bash scripts/install-git-hooks.sh   # idempotente; instala commit-msg e pre-push.pre-harness
ls .git/hooks                       # espera: commit-msg, pre-push, pre-push.pre-harness
make setup                          # sem ele, o pre-push RECUSA com rc=3 ("não mediu")
```

**Hooks são COMPARTILHADOS entre worktrees:** instalar de uma instala para **todas**. É por isso que a
instalação é ato de quem tiver a árvore inteira, e não de uma task rodando em paralelo com outras duas.
**Sem esta linha, `D1.7c` fecha no papel e fica desligado no disco.**

### O que este portão NÃO fecha, e não é rodapé

| buraco | por quê |
|---|---|
| `importlib.import_module("src.modules.<ctx>.infra")` e alias construído em runtime | `import-linter` **também** é estático. A troca fecha os **três** buracos da regex (`import … as`, re-export por `__init__.py`, import dentro de função) e **não** fecha este `[DOC: ADR-011/D3a]` |
| `make test` | o hook roda `boundaries` e `lint`, **não** `test` — é o que `ADR-011/D3b` decide, e ampliar isso é decisão do `/architect`, não desta task `[NÃO MEDIDO: nenhum número deste README fala do custo de rodar a suíte no `pre-push`]` |
| relatório parcial do `make lint` | `lint-backend` e `lint-frontend` são pré-requisitos de `lint`, e o `make` aborta no primeiro que falhar: se o backend reprovar, o relatório do frontend não sai **naquela** passada. É relatório parcial, nunca falso-verde — o `rc` chega inteiro |
| um segundo contexto nascer sem contrato `forbidden` próprio | nada obriga. Dívida nomeada acima |
| **o que está sendo EMPURRADO, quando ele difere da árvore de trabalho** | os dois alvos avaliam a **árvore de trabalho**, não o intervalo de commits — **igual ao `rules --mode sweep` do hook gerado**, logo **não é regressão** e sim a mesma semântica dos portões que já existiam `[/review 2026-08-29, aceito como honesto]`. Mas `git push origin outro-branch:master` mediria **a árvore errada**: a que está no disco, não a que sobe. Fechar exigiria ler as refs de `"$ENTRADA"` — o hook já as consome e as guarda por isso — e é decisão do `/architect`, não desta task |
| os dois `.sh` que **são** o portão | `scripts/**` e `*.sh` estão **fora** de `code_paths`, então `harness rules --mode file` sobre eles devolve `rc=0` **por não terem sido avaliados**, e não por estarem limpos; `shellcheck` não existe nesta máquina `[MEDIDO 2026-08-29: `command -v shellcheck` → ausente]`. Hoje eles são governados por `bash -n` e por mais ninguém. Dívida de **política**, com dono no `/architect` — e o `/review` mediu que acrescentar `*.sh` ao glob **não compraria cobertura**: falta também o prefixo, e **zero regra de shell existe** nos packs instalados |

## O que existe, e por quê

> ### 🗺️ O mapa desta árvore, em diagramas — [`docs/arquitetura-do-codigo.md`](../docs/arquitetura-do-codigo.md)
>
> Esta seção enumera **caminhos**; o mapa enumera **fluxos**. Lá estão os containers, os componentes
> por camada, e **quatro diagramas de sequência** — o ingest verificado pela borda de checksum, a
> drenagem retomável de ETL, a consulta do registro F0 e a leitura `as_of`. Mais o **esquema real do
> SQLite** coluna a coluna, os 15 termos da `SeriesKey`, as 7 colunas de procedência, e o inventário
> do que **ainda não existe** — banco de séries, API HTTP e aplicação de front, os três com a medição
> ao lado em vez da afirmação.
>
> Ele **deriva da árvore**, não da SPEC. O par dele é [`docs/arquitetura-fluxos.md`](../docs/arquitetura-fluxos.md),
> que deriva de `SPEC-001` e mostra o desenho: **quando divergirem, aquele é intenção e este é fato.**
>
> ⚠️ **Duas coisas que a tabela abaixo não diz e o mapa diz:** `record.sqlite3` **não é o banco de
> mercado** — é o registro da ingestão, e o dado de mercado vive como arquivo em `data/` com
> `.CHECKSUM` ao lado; e **não existe endpoint HTTP nenhum**, medido por
> `grep -rniE 'fastapi|flask|uvicorn|aiohttp|@router|http.server' backend/src` → `rc=1`. A superfície
> executável são **três CLIs**, e a saída de produto delas é `stdout`.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/etl_backlog.py` | `domain` | a janela **fechada e enumerada a priori** (`SPEC-001` §5.7) e o cálculo do pendente. Zero IO |
| `src/modules/sentimento/use_cases/drain_etl_backlog.py` | `use_cases` | a drenagem retomável e as duas **portas** (`ItemWorker`, `Checkpoint`) |
| `src/modules/sentimento/infra/jsonl_checkpoint.py` | `infra` | checkpoint durável em JSONL append-only, `fsync` por linha, cauda truncada descartada |
| `src/modules/sentimento/infra/file_etl_worker.py` | `infra` | publica por **rename atômico** ⇒ reprocessar é inócuo |
| `tests/sentimento/test_resumable_etl_backlog.py` | — | **`CA-F0-5` / `D3.1`**: 120 arquivos, `SIGKILL` de verdade no meio, retomada |
| `tests/sentimento/test_infrastructure_durability.py` | — | a durabilidade **observada**: `os.fsync` espiado por `monkeypatch`, conteúdo já no arquivo e `rename` ainda não feito **no instante da chamada** |
| `tests/helpers/drain_driver.py` | — | o subprocesso que o teste mata. Sem ele "matar o processo" seria simulação |

O layout `modules/<contexto>/{domain,use_cases,infra}` é a peça 1 de **`ADR-009/D1`**. O piso de
cobertura **por camada** (`domain 90 · use_cases 80 · infra 70`, herdados do vizinho) é a peça 3, e
`scripts/check-coverage-layers.sh` a executa. **Medido, e é o argumento inteiro da peça 3:** com os 4
testes de domínio puro desselecionados, o piso **global** de 70% passa em **95,20%** enquanto o piso
**por camada** reprova `domain` em **88,0% (22/25 linhas)**.

### 📎 2026-08-29 por `T-04.2` — a identidade de série e as sete colunas de procedência

Dois módulos novos em `domain`, e a razão de os dois nascerem juntos é que um sem o outro não
fecha nada: `series_key.py` diz **qual série é**, `provenance.py` diz **de onde cada linha dela
veio**. `SPEC-001` §2.1 e §3.1, plano `04` itens **4.7** e **4.9**.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/series_key.py` | `domain` | os **15 termos** de `SPEC-001` §2.1, os quatro conjuntos fechados (`Nature`, `TsConvention`, `Reduction`, `QuantityField`) e `series_key_id()` = `sha256` da projeção canônica |
| `src/modules/sentimento/domain/provenance.py` | `domain` | as **sete colunas** de `SPEC-001` §3.1 + o par `observer_id`/`observer_region` + `is_final`; `Provenance`, `Absence`, `AvailabilitySource`; e as duas recusas que `§3.2` exige |
| `tests/sentimento/test_series_identity.py` | — | **31 testes**. `F-2`, `CA-F2-17` e o teste que percorre os 15 termos um a um |
| `tests/sentimento/test_provenance_columns.py` | — | **24 testes**. `D4.9`, a fronteira de `clock_skew` e o que `T-04.4` vai ler |

**Nenhum termo da chave tem default, e isso é o portão de `CA-F2-17`.** Pedir *"o OI da
Coinalyze"* sem `reduction` tem de ser **erro**, e um default é exatamente como isso deixa de ser
verdade — as quatro leituras OHLC do mesmo bucket voltariam a colapsar numa identidade só. O teste
não confia nesta frase: ele lê `dataclasses.fields` e reprova se alguém acrescentar um default.

**`D4.9` foi REPRODUZIDO nesta task, não copiado** — reconciliação de tolerância **ZERO** a 8
casas decimais, pareando `metrics.create_time` com `markPriceKlines.open_time`:

```bash
# n = 5 dias-símbolo, 1.440 buckets pareados; tradução de caminho por data/MANIFEST.md
# BTCUSDT 2026-08-21  288/288 · BTCUSDT 2026-08-23  288/288  (pior resíduo 0,0000 bp)
# COTIUSDT 282/288 (4,3407 bp) · DOGEUSDT 286/288 (1,0847 bp) · SLXUSDT 286/288 (1,9716 bp)
# script literal em docs/context/plataforma-dados/gates/T-04.2-builder.md
```

`[MEDIDO 2026-08-29]`, e bate com o que o plano `04` publica (**288/288** no BTC, alts
**282–286/288**, resíduo ≤ **4,34 bp**). É essa medição que dá a `price_mark_close` o direito à
palavra *determinístico*, e por isso `reject_modeled_for_deterministic_metric` **recusa** carimbá-la
`MODELADO`: um canal sempre tracejado não carrega informação (`SPEC-001` §3.1).

**Tempo entra como valor injetado, e o contrato `Natureza` é o motivo.** `domain` e `use_cases` não
importam `time` nem `datetime` (`backend/pyproject.toml`), então os cinco instantes da linha são
`int` de milissegundos de época. O `int` também é o que faz `T-04.4` funcionar: `argmin(observed_at)`
sobre inteiro é exato, total e sem parse — um instante formatado faria o `argmin` depender de toda
fonte grafar com a mesma largura, o que é certo até a primeira que não grafa, e daí errado calado.

**Verde não prova nada até uma mutação reprovar.** Bancada de **10 mutantes + 1 controle**:
**10 mortos, 0 sobreviventes**; o controle (comentário inócuo) ficou verde. A guarda `AMBIGUO`
mordeu de verdade — o `M3` na primeira passada casou a âncora **2×** e foi **recusado em vez de
contado como morte**. Script e saída literais no relatório de gate.

### 📎 2026-08-29 por `T-04.4` — o acessor **único** `as_of()`, e a largura do bucket que é injetada

Um módulo novo em `domain` e o par de testes que o prende. `SPEC-001` §2.3 e §2.5, `ADR-006`,
`CA-F4-25`, plano `04` itens **4.5** + **4.6** + **4.10**.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/as_of_accessor.py` | `domain` | `as_of()` = `argmin(observed_at)` com **LOCF** e **sem interpolate**; `R-1`, `R-2` e o horizonte `knowledge_time`; `BarPolicy`, `ReadPurpose`, `SeriesReadPolicy`, `AsOfReading` |
| `tests/sentimento/test_as_of_accessor.py` | — | **48 testes**. A fixture envenenada de `§5.1` nas três classes de `D4.6`, `D4.11`, `D4.13`, `D4.14` e `F-1` |
| `tests/sentimento/test_as_of_is_the_single_reader.py` | — | **5 testes**. A metade *"acessor ÚNICO"*: varredura `ast` sobre `backend/src` que **pina o conjunto medido** de quem toca uma coluna de leitura |

**A largura de um bucket é INJETADA e nunca derivada de `SeriesKey.interval`, e a razão é o lag
de publicação.** A regra *"`LOCF` sobre `FLOW` é erro de tipo"* (`SPEC-001` §3.2/§5.11, `D4.11`)
diz que um valor de fluxo deixa de ser a resposta quando **uma janela inteira** passou — e
*"uma janela inteira"* não sai de `bucket_end` e `t` sozinhos. **Escrever a guarda como
`age_ms > 0` tornaria toda série de fluxo permanentemente ilegível**: um bucket só fica legível
**um lag DEPOIS** de fechar, então no primeiro instante em que um `cvd_delta` pode ser lido a
idade dele já é estritamente positiva. O painel inteiro mostraria `"—"` para sempre, e pareceria
dado faltando em vez de defeito. Por isso `SeriesReadPolicy.bucket_interval_ms` é campo
**obrigatório e sem default**, e a grade canônica que traduz `"5m"` em milissegundos continua
sendo **uma função, dona de `charts`** (`T-05.1`, `ADR-003`/FR-3) — um segundo parser aqui seria
a segunda implementação que aquele item existe para proibir.

**Verde não prova nada até uma mutação reprovar** — e aqui a bancada mediu **exatamente isso**.
Bancada de **22 mutantes: 22 mortos, 0 sobreviventes**, com **atribuição de matadores por
mutante** (não só o placar — foi ela que expôs o defeito abaixo). Contra a fixture **como
encontrada** (`n=42`), porém:

```bash
# .venv/bin/python /tmp/claude-1002/mut/asfound.py   (script literal no relatório de gate)
# M1 age_ms > 0                        -> KILLED    (3 matadores)
# M2 derivado de SeriesKey.interval    -> SURVIVED  (0 matadores)
# M3 >= vira >                         -> SURVIVED  (0 matadores)
```

`[MEDIDO 2026-08-29, n=42 testes da fixture como encontrada]`. O módulo já estava correto; a
**fixture estava meio-feita**, que é o desfecho pior que suíte vermelha. `bucket_interval_ms` só
aparecia como `300_000` ao lado de um `interval = "5m"` que vale `300_000` — logo *injetado* e
*derivado* concordavam em todos os testes e o mutante `M2` era **equivalente**. Os **6 testes
novos** fazem os dois números **DISCORDAREM nas duas direções** (grade declarada mais larga que
`"5m"` e mais estreita que `"15m"`), que é a única forma de distinguir um do outro.

**A varredura de acessor único MORDE, e isso foi medido plantando violador** — `ADR-012` nomeia a
armadilha de `rc=0` sobre universo vazio, e a metade *"ninguém mais importa"* é **vacuosa hoje**
porque ainda não há consumidor. Então o que carrega o peso é o outro lado: **4 violadores
plantados, 4 pegos**, cada um por um teste diferente, e a árvore volta verde ao desplantar.

### 📎 2026-09-01 por `T-04.1` — o shift canônico `event_time`, a ordenação obrigatória e a lacuna nunca preenchida

Um módulo novo em `domain`, um em `infra`, e o par que o CSV cru de `daily/metrics` vira
`event_time`/`src_label_raw`/gap. `SPEC-001` §2.2, `CA-F1-1`, `CA-F1-14`, `CA-F1-2`, plano `04`
itens **4.1** + **4.2** + **4.4**.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/metrics_shift.py` | `domain` | `LABEL_SHIFT_MS = 300_000`; `RawMetricsRow`/`LabeledMetricsRow`; `label_and_sort_metrics_rows` — **único** ponto de saída, sem parâmetro para pular o `sorted(...)`; `MetricsGap`/`detect_gaps`, que não tem campo para um valor interpolado |
| `src/modules/sentimento/infra/metrics_csv_reader.py` | `infra` | `parse_create_time_ms`/`format_event_time_iso` (os dois únicos pontos que tocam `datetime`); `read_raw_metrics_rows` devolve em **ordem do arquivo**, de propósito; `build_ingest_gap` liga `MetricsGap` ao `IngestGap` já existente (`domain/ingest_record.py`, `T-02.3`) |
| `tests/sentimento/test_metrics_shift.py` | — | **17 testes** sintéticos: o mutante "bypass do sort" reprova, `MetricsGap` não tem onde guardar valor interpolado |
| `tests/sentimento/test_metrics_event_time_fixtures.py` | — | `D4.1`/`D4.2`/`D4.3` sobre os fixtures reais pinados por `md5` |
| `tests/sentimento/test_taker_lookahead_regression.py` | — | `D4.10`, reproduzido sobre fixtures deste repositório |
| `tests/sentimento/test_metrics_csv_reader.py` | — | a borda de parsing, isolada do resto |
| `tests/helpers/data_fixtures.py` | — | acha `data/` por `git rev-parse --git-common-dir` — portátil entre worktrees, já que `data/` é gitignored e não existe em `git worktree add` |

**A ordenação é obrigatória por FORMA, não por convenção escrita.** `label_metrics_row` está
exposto (o teste de bypass precisa dele), mas `label_and_sort_metrics_rows` é o único ponto que
uma chamada de produção usaria, e ele não tem parâmetro `skip_sort`. `[MEDIDO 2026-09-01]`: o
mutante literal — trocar `tuple(sorted(labeled, key=...))` por `tuple(labeled)` — foi aplicado,
rodado, e **derrubou 2 testes nomeando o índice exato da discordância** (um sintético, um sobre
`data/binance/metrics/btcusdt/2026-08-18.csv`); revertido antes do commit.

**`D4.1` bate exato no número que o plano publica.** `data/binance/metrics/btcusdt/2026-08-18.csv`
(md5 `b8ef79c353f2adce853c68084cc3b631`): 288 linhas, deslocamento posicional máximo **275 de
288** `[MEDIDO 2026-09-01: posição na ordem do arquivo menos posição na ordem por `create_time`,
máximo do valor absoluto]` — o mesmo número que `CA-F1-1` cita. O salto-para-trás que o plano
cita como 1435 min mediu, nesta reprodução, **1415 min**; a diferença não foi investigada (não é
DoD desta task) e o número não entrou como asserção — só o deslocamento posicional, que bateu.

**`D4.2` é o gap real, e ele já era o fixture que outros dois arquivos de teste citavam sem
prová-lo.** `data/binance/metrics/btcusdt/2026-08-12.csv` (md5 `bf1ddd8ba4248f975e92daae23ee3dc3`):
285 linhas, **um** gap de `n_missing=3` entre `event_time` `2026-08-12T11:45:00Z` e
`2026-08-12T12:05:00Z`. Essas strings já existiam como fixture à mão em
`test_ingest_health_query.py::_gap` e `test_ingest_health_contract_guards.py::_gap` desde antes
desta task — `test_metrics_event_time_fixtures.py` é o que transforma essa coincidência em
medição: o gap é persistido pelo mesmo `SqliteIngestRecordStore` que o `ingest_health` lê, round-trip
completo, e a contagem de linhas (285) não muda ao persistir o gap — nenhum ponto é inventado.

**`D4.3` precisa da ordenação para existir.** A primeira linha em ORDEM DE ARQUIVO de
`2026-08-23.csv` tem `create_time` `00:10:00` — o dia é ele mesmo um dos 13 fora de ordem.
Só depois de `label_and_sort_metrics_rows` o verdadeiro primeiro bucket (`00:00:00`) aparece, e
o shift o leva a `event_time` `2026-08-23T00:05:00Z` — nunca `00:00:00Z`.

**`D4.10` é um NÃO-CONSERTO, testado como regressão.** `shift_to_event_time` soma o mesmo
`LABEL_SHIFT_MS` às oito colunas, **incluindo** `sum_taker_long_short_vol_ratio` — que
`PRD-001` P2 já media carregando o fluxo do bucket **seguinte** ao rótulo (`r = +0,5458` contra
o retorno futuro). Esta task **não corrige essa coluna**: a defesa anti-lookahead correta é
`available_at` (item 4.6, task futura), e um shift por coluna aqui seria um segundo desvio
silencioso. `[MEDIDO 2026-09-01, reproduzido sobre os fixtures DESTE repositório — `n=863/862/863`,
não o `864/862/862` do `PRD-001`, porque o corpus em disco é outro]`: `r_futuro = +0,5169`
contra `r_passado = +0,0646` e `r_futuro+1 = -0,0209` — mesma assinatura, 3 dias
(2026-08-21/22/23), preço de `klines` 1m reamostrado a 5m (21/22) + `klines` 5m nativo (23). Se
uma mudança futura corrigir a coluna com um shift próprio, `r_futuro` cai para perto de zero e
este teste reprova.

**Os seis portões, no worktree `/tmp/claude-1002/wt/T-04.1`:** `lint.sh` (`ruff check` + `ruff
format --check` + `mypy --strict`) limpo; `boundaries.sh` — os 3 contratos de import (incluindo
`Natureza`, que este módulo respeita: `domain` só recebe `int`/`Decimal`/`str` injetados,
`datetime` mora inteiro em `infra`) — `3 kept, 0 broken`; `test.sh` — **470 passed**, cobertura
`domain 100% (877/877)` · `use_cases 100% (220/220)` · `infra 97,8% (614/628)`, todas acima do
piso; `harness rules --mode sweep` (árvore completa) — **0 achado**.

### 📎 2026-09-01 por `T-04.7` — `principal_id` como dimensão, e não constante implícita

Nenhum módulo novo — `provenance.py` (`T-04.2`) já continha a lacuna nomeada por escrito: o
docstring de `Provenance.HUMAN` dizia *"this module does not stand in for it"*, apontando
exatamente para este item. `SPEC-001` §4.4, plano `04` item **4.11**; `ADR-009/D2` recusa
`organization_id`. Sem `D4.x` citado nas refs desta task — o falsificador formal mora em `D5.10`
(fase `05`), porque `sentimento` **constrói** a dimensão e `05` é quem a **usa** com ator humano
autenticado.

**O que muda:** `SeriesRow` ganha o campo `principal_id: str | None`, com `default=None` — o
`None` não é "constante implícita", é o valor de uma linha que **não é** ato humano
(`provenance` ∈ `{OBSERVADO, DERIVADO, MODELADO}`). `__post_init__` recusa qualquer linha
`HUMANO` cujo `principal_id` esteja ausente ou em branco, com `InvalidSeriesRowError`
apontando a coluna — a mesma forma que já recusava `series_key_id`/`symbol`/`source` em
branco. `provenance_projection()` passa a incluir `principal_id` (projeta `None` quando não se
aplica), pela mesma razão que já projeta `is_final`: um consumidor lê a dimensão por ali, não
por um segundo caminho.

**Fora de escopo, e por quê:** `<Anotacao>` e `run_registry` (`SPEC-001` §4.4) também carregam
`principal_id`, mas pertencem a `web`/`backtest` — fora da fronteira de componente desta task
(`sentimento`). Nenhum `organization_id` foi introduzido; `ADR-009/D2` já mediu que uma coluna
constante em toda chave "ensina errado".

**O falsificador, executável:**

```bash
bash backend/scripts/test.sh -k test_provenance_columns
# 6 funcoes novas (8 testes, uma parametrizada em 3 provenancias): linha HUMANO sem
# principal_id -> InvalidSeriesRowError (o caso que REJEITA); linha HUMANO com principal_id em
# branco -> idem; linha HUMANO com principal_id -> aceita e projeta; as três outras
# provenâncias -> principal_id continua None, sem exigência; omitir o argumento nunca cai num
# default silencioso.
```

`[MEDIDO 2026-09-01: bash backend/scripts/test.sh -> 452 passed (era 444 em 840c500, mesmo
comando), domain 100,0%, use_cases 100,0%, infra 97,7% — universo completo do componente
`sentimento`]`.

### 📎 2026-09-01 por `T-04.5` — `cvd_delta` como fato, `cvd_cum(anchor)` como view, e a aritmética que o `awk` publicado erra

Um módulo novo em `domain`. `SPEC-001` §2.6, `CA-F1-8`, plano `04` item **4.8**, `DoD` **D4.7**/**D4.8**.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/cvd.py` | `domain` | `cvd_delta_by_bucket()` — o fato, anchor-free, `Decimal` sobre a string crua, soma ordenada por `agg_id`, bucket `transact_time // 60000`; `cvd_cum()` — a view, `anchor_ms` sem default |
| `tests/sentimento/test_cvd.py` | — | **16 testes**. Convenção de sinal, grade de bucket, `MissingCvdAnchorError`/`TypeError` sem âncora, e os três totais-âncora **contra o dado real** |
| `tests/helpers/data_fixtures.py` | — | `repo_data_root()`/`require_fixture()` — copiado **verbatim** de `tasks/T-04.1-shift-canonico-event-time` (mesmo utilitário, mesma necessidade: `git rev-parse --git-common-dir` para achar `data/` a partir de qualquer worktree). Path idêntico de propósito, para o merge das duas branches não colidir |

**Fato e view são DUAS funções, nunca uma com argumento default.** `cvd_delta_by_bucket()` não
sabe o que "o CVD" significa até uma âncora escolher onde a contagem começa — e três âncoras
sobre o MESMO `cvd_delta` invertem o sinal do total (`D4.7`). Um default silencioso repetiria a
classe de defeito que `SeriesKey` (`T-04.2`) já recusa para `reduction`/`quantity_field`:
`cvd_cum()` chamado sem `anchor_ms` é `TypeError` (parâmetro obrigatório, sem default) e, para
quem repassar `None` de uma borda externa, `MissingCvdAnchorError` — a mesma dupla camada que
`SeriesReadPolicy`/`as_of()` já usa para `asof_max_staleness_ms`.

**Os três totais são medidos sobre o dado real, não sintético** — a única forma de reproduzir
literalmente `−1265,982 / +399,745 / +1598,508 BTC` é processar o dia inteiro de
`BTCUSDT-aggTrades-2026-08-23.csv` (md5 `a68d9dbdfde1d7c0d25e78eae4d798bb`, 1.314.556 linhas,
1.440 buckets de 1 min), porque nenhuma fixture pequena escrita à mão bate esses dígitos por
acaso:

```bash
bash backend/scripts/test.sh -k test_cvd
# 16 passed
```

**O falsificador de `D4.8`, rodado, não só citado:** o mesmo arquivo somado por `float` em vez
de `Decimal` produz `-1265.9819999977815` para a âncora `00:00` — diverge do publicado na 10ª
casa, o bastante para reprovar uma comparação exata contra `Decimal("-1265.982")`
`[MEDIDO 2026-09-01]`. É o mesmo defeito de classe que o `awk` publicado no discovery tinha
(`OFMT=%.6g`, erro de +4 mBTC): `test_d4_8_float_arithmetic_over_the_same_fixture_diverges_from_the_golden_total`
prova a divergência em vez de presumir que `Decimal` "deveria" bastar.

**O que este teste NÃO prova, e está dito em vez de implícito:** "soma ordenada por `agg_id`"
(`D4.8`, literal) não é observável no VALOR do resultado — adição de `Decimal` exata é
comutativa e associativa na escala de quantidade de BTC (sem estouro dos 28 dígitos de
precisão do contexto padrão), então embaralhar a ordem de entrada não muda o total, com ou sem
o `sorted(key=agg_id)` na implementação. `test_result_is_order_independent_...` documenta essa
propriedade em vez de fingir que ela é um mutante morto: a ordenação está implementada porque o
contrato a nomeia como parte da aritmética (auditabilidade), não porque algum caso testável aqui
mude de sinal ou de dígito sem ela.

### 📎 2026-09-01 por `T-04.3` — unicidade por `agg_id` com verificação de contiguidade, nunca por tempo

Um módulo novo em `domain`, um em `infra`, sobre o dado que `T-04.1` deixou de fora por natureza
(`aggTrades` é `Nature.TICK`, não `daily/metrics`). `CA-F1-5`, `CA-F1-6`, plano `04` item **4.3**,
DoD **D4.4** (contiguidade) e **D4.5** (unicidade sob colisão de ms).

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/aggtrade_contiguity.py` | `domain` | `AggTradeTick` (só `agg_id`+`transact_time_ms` — sem campo para `trade_id`, guarda estrutural de "nunca por trade_id"); `require_unique_agg_ids`/`DuplicateAggIdError`; `AggIdGap`/`detect_agg_id_gaps` (buraco contado, nunca costurado); `count_decreasing_timestamps`; `MillisecondCollisionStats`/`measure_millisecond_collisions` |
| `src/modules/sentimento/infra/aggtrade_csv_reader.py` | `infra` | `read_aggtrade_ticks`/`read_aggtrade_ticks_from_many` — lê só as 2 colunas que este item precisa, em ordem de arquivo, concatenando dias na ordem que o chamador declarar |
| `tests/sentimento/test_aggtrade_contiguity.py` | — | **18 testes** sintéticos, incluindo o falsificador "chave por tempo colapsa 2 de 3 trades legítimos" e a convenção `n_missing = to - from` pinada num par pequeno antes do fixture real |
| `tests/sentimento/test_aggtrade_contiguity_fixtures.py` | — | **9 testes**: `D4.4`/`D4.5` sobre os fixtures reais pinados por `md5` |
| `tests/sentimento/test_aggtrade_csv_reader.py` | — | **4 testes**: a borda de parsing (header, ordem, concatenação), isolada do resto |

**Por que `agg_id` e não os outros dois candidatos, com número.** `D4.5`, medido em
`BTCUSDT-aggTrades-2026-08-20.csv` (md5 `fa779db5ece6ad82b1b633649118113d`, 2.756.517 linhas):
**959.949** milissegundos distintos, **245.890** com mais de um trade (**25,6%**), até **184**
trades no mesmo ms — tempo não distingue o dado. Uma chave por `trade_id` teria que desfazer o
enrolamento do `aggTrade` (a largura do intervalo `first_trade_id..last_trade_id` varia por
linha) para comparar duas linhas — `agg_id` já é a chave que a própria Binance atribui, sem
segunda derivação para manter sincronizada. `AggTradeTick` não carrega `first_trade_id`/
`last_trade_id`: não há valor deste tipo com que montar a chave proibida.

**O falsificador concreto de "nunca por tempo".** `test_d4_5_a_time_keyed_scheme_would_
silently_drop_1_796_568_real_trades` roda, sobre o mesmo arquivo, um dedup ingênuo por
`transact_time_ms` (não é código de produção) e mede a perda: **2.756.517 → 959.949**
sobreviventes, **1.796.568** trades reais descartados em silêncio. `require_unique_agg_ids`
sobre o mesmo arquivo **não levanta** — `test_d4_5_agg_id_stays_unique_on_the_very_file_that_
collides_on_time`.

**`D4.4` bate exato no número que o plano publica, inclusive o off-by-one.** Concatenando
`2026-08-{20,21,23}.csv` (as três únicas datas capturadas — `2026-08-22` nunca existiu,
`data/MANIFEST.md`) na ordem do calendário: **8.873.078** linhas, **0** timestamp decrescente,
e **exatamente um** salto de `agg_id`: `3420055157 → 3421676065`. `n_missing` aqui é `to - from`
= **1.620.908** — **não** `to - from - 1` (`1.620.907`, a contagem de inteiros estritamente
entre os dois), porque é esse o número que o plano cita literalmente. A convenção está pinada
antes num par pequeno (`test_detect_agg_id_gaps_n_missing_is_the_width_not_the_strict_between_
count`) para não ser inventada só no fixture grande. `[MEDIDO 2026-09-01]`: mutante `n_missing =
delta - 1` aplicado, rodado, **derrubou os 2 testes que citam o número** (o pequeno e o do
fixture real, `1620907 == 1620908` falhando); revertido antes do commit — `diff` byte-idêntico
ao original conferido.

**O buraco é reportado, nunca costurado — por FORMA.** `AggIdGap` tem exatamente três campos
(`from_agg_id`, `to_agg_id`, `n_missing`): não há onde anexar um tick fabricado para o
`2026-08-22` ausente, e `read_aggtrade_ticks_from_many` não inventa linha nenhuma ao concatenar.

**Os seis portões, neste worktree:** `lint.sh` limpo; `boundaries.sh` — `2 kept, 1 broken`, e o
`broken` é **só** `dump_window.py`/`retention_probe.py` (dívida pré-existente de `T-03.10`,
alheia a esta task — confirmado antes e depois da mudança, mesmos dois arquivos); `test.sh` —
todos passando, cobertura `domain 100% (1057/1057)` · `use_cases 100% (220/220)` ·
`infra 98,3% (832/846)`, todas acima do piso [MEDIDO 2026-09-01: `pytest --collect-only -q`
soma **591** testes na suíte inteira]; `harness rules --mode sweep` (árvore completa
E `--changed-only`) — **0 achado** (o único aviso do primeiro sweep, `core.module-docstring-
single-line`, foi corrigido movendo a prosa estendida de docstring para comentário `#`, forma
que `binance_aggtrade_payload.py` já usa).

## Decisões táticas desta task, e o que as derruba

| decisão | por quê | falsificador |
|---|---|---|
| ~~**`venv` + `uv pip` + `requirements-dev.txt` fixado**, e **não Poetry**~~ **⚠️ SUPERSEDIDA em 2026-08-28 por `ADR-011/D1`** | ~~`ADR-009/D1` enumera as 4 peças copiadas do vizinho e **Poetry não é uma delas**. `uv 0.10.12` já está no disco e resolve sem decidir formato de lock~~ | **o falsificador FOI REALIZADO — por caminho diferente do previsto.** Ele previa pressão técnica (resolução transitiva derivando); o que chegou primeiro foi a declaração do owner: *"Aplicacao deve rodar com poetry, ter Makefile para simplicar as chamadas, builds e afins"* `[PREMISSA-OWNER: 2026-08-28]`. A escolha era defensável e caiu por **autoridade, não por erro de raciocínio** — e isso fica escrito para que a próxima decisão tática não seja tomada com medo |
| **Poetry 2.4.1 (PEP 621), com `poetry.lock` VERSIONADO** — e `requirements-dev.txt` REMOVIDO | `ADR-011/D1`, por declaração do owner. As 5 dependências viraram `[tool.poetry.group.dev.dependencies]` com **pin exato**, e o lock passa a garantir a mesma resolução transitiva em clone limpo — que era exatamente o que o falsificador da linha acima previa. **Duas listas para o mesmo ambiente divergem**, então o `requirements-dev.txt` não sobreviveu ao lado do `pyproject.toml` | se `poetry install` deixar de produzir `backend/.venv/bin/python`, a forma não preserva o contrato dos scripts e `ADR-011/D2` precisa reescrever a resolução de interpretador. **`bootstrap.sh` já checa isso e recusa com `rc=3`** `[MEDIDO 2026-08-28: sem `backend/poetry.toml`, a recusa DISPARA]` |
| **`package-mode = false`** no `pyproject.toml`, e o alvo `make build` **RECUSA com `rc=3`** | não há artefato distribuível hoje: **zero** dependência de runtime, `src/` não é pacote publicável, e `frontend/package.json` declara **um** script — `lint`, não `build` `[MEDIDO 2026-08-28]`. Um `build:` vazio devolvendo **0** faria alguém ler *"build passou"* de um alvo que não construiu nada | a primeira task que trouxer artefato preenche a receita e remove a recusa |
| **`backend/tests/`**, não `backend/src/tests/` | é a forma do vizinho, e é o alvo literal de `web-fullstack.server-test-directory-present` (`target = "backend/tests/**"`) — `T-01.2` pode adotar o pack sem mover arquivo | se o pack for adotado com outro alvo, a razão cai |
| **`backend/tests/` entra em `code_paths.include_prefixes`** | sem o prefixo a suíte fica **fora do universo de regras**. Medido: violador com 2 regras quebradas devolve **saída vazia, zero regras avaliadas** sem o prefixo, e **BLOQUEIO nas 2** com ele | se alguma regra `core` de escopo `code` acusar uso legítimo em teste, o prefixo cobra `[[rules.core.disabled]]` com motivo |
| **nenhuma `[[rules.own]]`** | item `1.8` manda que toda regra própria nasça com corpus; esta task não declarou nenhuma ⇒ **`D1.5` é vacuamente satisfeito**, com universo **0 regra** | a primeira regra própria (contrato `forbidden` de `T-01.3`) nasce com `harness corpus verify` **e** `mutate` |

## Zero rede, zero chave

**⚠️ Correção de um número medido que estava errado.** Uma versão anterior desta seção afirmava
**`0 ocorrência`** para o grep abaixo, e a correção seguinte disse **`1`**. ~~**São `2`**~~ **eram `2`
À ÉPOCA, e o bloco de código logo abaixo já lista `3` linhas** — a contagem em vigor é **`3` (em `2`
arquivos, `0` fora de comentário)**, e ela está três parágrafos abaixo, em *"Hoje são 3"*. **A tarja é
de 2026-08-29 (`/qa`), e a frase fica**: o defeito que ela documenta não é o número, é o presente do
indicativo — e ele envelheceu de novo, em silêncio, exatamente como ela avisa. E a
segunda nasceu *dentro* da própria iteração que corrigiu a primeira, o que é a lição:
número medido envelhece com a edição seguinte. Corrigi **o número, não o comando** — o comando
está certo, o universo está certo, e as duas ocorrências são nomeadas, não escondidas:

```bash
cd backend && grep -rnE 'http|socket|requests|urllib|websocket|Binance|Bybit|Coinalyze|api[_-]?key|API_KEY' \
  src/ tests/ scripts/ pyproject.toml poetry.toml
# scripts/test.sh:8:# ZERO REDE: nenhum teste desta suite chama Binance, Bybit ou Coinalyze. ...
# scripts/test.sh:11:# com `socket` amputado por um `sitecustomize.py`, que alcanca tambem o ...
# scripts/bootstrap.sh:98:# "Zero rede, zero chave", varre `scripts/` com um padrao que casa `http` ...
```

**⚠️ O COMANDO MUDOU EM 2026-08-28 (`T-01.6`), e o número mudou com ele.** `requirements-dev.txt`
**deixou de existir** — as 5 dependências migraram para `[tool.poetry.group.dev.dependencies]` do
`pyproject.toml` (`ADR-011/D1`) — e `poetry.toml` entrou no lugar dele na varredura. **`poetry.lock`
ficou de FORA, e a exclusão é declarada com o número:** ele é gerado por máquina e teria **1
ocorrência** `[MEDIDO 2026-08-28: `poetry.lock:545` → `dev = [..., "requests", ...]`, a lista de
`extras` opcionais do `pytest` — metadado de pacote, não dependência instalada]`. Incluí-lo somaria
ruído de metadado a um portão que existe para achar chamada de rede.

**⚠️ PARÁGRAFO DA PASSADA DE `T-01.4`. A CONTAGEM ESTÁ SUPERSEDIDA; a lição, não** — e é por ela
que ele fica. ~~Re-medido em 2026-08-28 DEPOIS de escrever **esta** passada~~ **Re-medido à época,
depois DAQUELA passada** (`/review`: itens B/D/E/F/G/H/I mexeram em `scripts/test.sh`,
`scripts/check-coverage-layers.sh`, `scripts/bootstrap.sh` e neste `README.md`) — ~~**continua 2**~~
**eram 2 À ÉPOCA**, e o universo **continua 19**. **Hoje são 3** — o bloco abaixo é a medição em
vigor, e o universo de 19 sobreviveu à troca de `requirements-dev.txt` por `poetry.toml`
`[MEDIDO 2026-08-28, re-rodado por `T-01.6` e conferido pelo `/review`]`.

**E o parágrafo ter ficado dois ciclos lendo-se em presente É a própria lição acontecendo**, agora
sobre a frase que a enuncia: *o texto que descreve a medição vive dentro do universo medido*, então
escrever "Coinalyze" num comentário de `src/`, `tests/` ou `scripts/` cria uma ocorrência nova — e
**um número em presente envelhece em silêncio enquanto a prosa ao redor continua verdadeira**.
**Este número só vale re-rodado depois da última edição** — não antes.

**[RE-RODADO 2026-08-29 por `T-01.5`, e o universo mudou POR CAUSA DELA]: 3 ocorrências**,
**as três prosa de comentário**, universo **20 arquivos** — os **18** `.py`/`.sh` sob `src/`, `tests/` e
`scripts/`, mais `pyproject.toml` e `poetry.toml`. **O 18º é `scripts/boundaries.sh`, que esta task
criou** `[MEDIDO 2026-08-29: `find src tests scripts -type f \( -name '*.py' -o -name '*.sh' \)
-not -path '*__pycache__*' | wc -l` → **18**; o mesmo universo em `origin/master` → **17**]`. É o
parágrafo acima acontecendo pela terceira vez, agora comigo: a task **editou o diretório varrido** e
publicou o número **19** sem re-rodar — foi o `/qa` que pegou. **As 3 ocorrências não mudaram**
(`boundaries.sh` contribui **0**), e fora de comentário continua **0**
`[MEDIDO 2026-08-29: o grep completo → 3 linhas; com o filtro de comentário → 0]`. O texto anterior
dizia *"universo 19 … os 17"* `[MEDIDO 2026-08-28 por `T-01.6`]` e estava certo à época. As duas antigas continuam em `scripts/test.sh:8`
e `:11`; **a terceira nasceu nesta passada**, em `scripts/bootstrap.sh:98`, e é a lição do parágrafo
acima acontecendo de novo — é o comentário que explica **por que** este README varre `scripts/` com
um padrão que casa `http`. Nenhuma é chamada de rede.
Excluindo linhas de comentário, **[MEDIDO 2026-08-28]: 0 ocorrência**:

```bash
cd backend && grep -rnE '<mesmo padrão>' src/ tests/ scripts/ pyproject.toml poetry.toml \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#'
# (vazio)
```

**E o "0 fora de comentário" custou uma decisão, que fica escrita para não parecer sorte:** a
primeira redação da recusa de `poetry` ausente em `bootstrap.sh` trazia a URL da documentação do
Poetry dentro de um `echo` — que **não** é linha de comentário — e o número saltava de 0 para **1**
`[MEDIDO 2026-08-28]`. A URL foi retirada da mensagem (o texto continua nomeando o projeto) em vez
de o número ser explicado: **endereço de documentação em prosa gasta o sinal de um portão que existe
para achar chamada de rede.** A alternativa — manter a URL e afrouxar o padrão — seria consertar o
instrumento para caber no resultado.

**A linha removida está publicada abaixo para que a afirmação seja FALSIFICÁVEL por terceiro** — sem
ela, este parágrafo mede um rascunho que não existe mais em disco e ninguém pode conferir:

```bash
# a linha que estava em backend/scripts/bootstrap.sh e foi retirada:
    echo "        Instale-o (https://python-poetry.org/docs/#installation) e rode de novo." >&2
```

Reponha-a no lugar da linha `Instale-o conforme a documentacao oficial do Poetry (python-poetry.org).`
e re-rode o grep sem comentários: ele passa a devolver **1**, e é `bootstrap.sh` que aparece.

**Universo declarado com precisão:** este `README.md` **não** está na varredura, de propósito — ele
cita os três nomes de exchange nesta mesma seção, e incluí-lo faria o portão medir a si mesmo.

### E a evidência que vale mais que o grep: zero rede em RUNTIME

Grep é evidência **textual** — prova que ninguém escreveu a palavra, não que ninguém abriu soquete.
A prova de comportamento é rodar a suíte com `socket` amputado, e ela também alcança o **subprocesso
do driver** (que recebe `PYTHONPATH=<backend>`, o mesmo diretório do `sitecustomize.py`):

> ### ⛔ A RECEITA ABAIXO NÃO FUNCIONA MAIS. NÃO A RODE — pule para a corrigida.
>
> Ela **quebrou em 2026-08-29**, quando `T-03.7` trouxe o primeiro módulo que importa
> `http.client`: trocar a **classe** `socket.socket` por uma função mata `import ssl`
> (`class SSLSocket(socket)`) e o resultado é `TypeError` **na coleta, com ZERO teste rodado**
> — que um operador lê como *"a suíte usa rede"* quando o que houve foi **o instrumento se
> quebrar antes de medir**. **A tarja está aqui, no lugar onde a receita é lida**, e não só no
> aviso que começa 25 linhas abaixo — que é onde ela estava, e é a mesma classe de defeito que
> este documento inteiro persegue: o aviso que chega depois do dano
> `[achado do /review 2026-08-29, INFO]`.
>
> **A receita que funciona amputa a CONEXÃO e está mais abaixo, na seção de `T-03.7`.**
> O bloco fica onde está — apagá-lo removeria o registro de que a prova de 2026-08-28 foi
> tirada com ele.

```bash
# ⛔ QUEBRADA desde 2026-08-29 (T-03.7). Ver a tarja acima e a receita corrigida abaixo.
cat > backend/sitecustomize.py <<'EOF'
import socket
def _proibido(*a, **k): raise RuntimeError("REDE PROIBIDA: a suite tentou abrir soquete")
socket.socket = _proibido; socket.create_connection = _proibido; socket.getaddrinfo = _proibido
EOF
PYTHONPATH="$PWD/backend" bash backend/scripts/test.sh; rm backend/sitecustomize.py
```

`[MEDIDO 2026-08-28: **14 passed, rc=0**, universo 14 testes]`. E o **instrumento foi auditado antes
de valer como prova** — um guarda que não morde daria verde por não estar instalado.
**[MEDIDO 2026-08-28]**, duas checagens do instrumento: `socket.getaddrinfo('example.com', 80)` no
processo pai → `RuntimeError: REDE PROIBIDA`; e um subprocesso com `PYTHONPATH` reescrito para o
mesmo diretório → `rc=1`, a mesma `RuntimeError`.
O `sitecustomize.py` **não ficou na árvore** — é instrumento de medição, não código do produto.

### ⚠️ `T-03.7` (2026-08-29) mudou esta seção INTEIRA — e mudou o **instrumento**, não só o número

`T-03.7` (a rampa até o primeiro `429`) trouxe **o primeiro módulo de `src/` que abre soquete**:
[`src/modules/sentimento/infra/https_quota_probe.py`](src/modules/sentimento/infra/https_quota_probe.py).
Três afirmações desta seção envelheceram no mesmo ato, e as três estão corrigidas abaixo **com o
comando que as re-mediu**. Nenhuma foi apagada: o texto acima continua verdadeiro **à época**.

**(a) O grep publicado deixou de discriminar.** ~~3 ocorrências, universo 20~~ →
**`[MEDIDO 2026-08-29: 113 ocorrências, universo 52`** (50 `.py`/`.sh` sob `src/`, `tests/`,
`scripts/` mais `pyproject.toml` e `poetry.toml`)**`]`**. O salto **não** é rede: o padrão casa
`requests`, e `T-03.7` introduziu os identificadores `blind_requests`, `max_requests` e
`requests_done`. Classificando por **token** em vez de por linha
`[MEDIDO 2026-08-29: `tokenize` sobre os 45 `.py` de `src/` e `tests/`]`: **6 em comentário, 30 em
docstring, 72 em código — e dos 72, apenas 4 são de rede**, todos em `https_quota_probe.py`
(`import http.client`, `http.client.HTTPSConnection`, e o nome `open_https_connection` duas vezes).
**Um portão que casa `max_requests` procurando chamada de rede parou de medir o que afirma medir.**

A medição que **substitui** o grep, porque discrimina o que aquele deixou de discriminar:

```bash
cd backend && grep -rlE '^(import|from) (http|socket|urllib|ssl|websocket)' src/
# src/modules/sentimento/infra/https_quota_probe.py
```

`[MEDIDO 2026-08-29: **1 arquivo**, universo 21 `.py` sob `src/`]`. **Um módulo, e ele é `infra`.**
A conexão real nasce em **uma linha só** (`open_https_connection`), marcada `# pragma: no cover`, e
alcançável apenas por `infra/quota_ramp_cli.py` — que **nenhum portão chama**.

**(b) A receita de amputação publicada acima QUEBROU, e quebra pelo motivo errado.** `socket.socket =
_proibido` troca a **classe** por uma função, e `ssl` a herda (`class SSLSocket(socket)`). Enquanto
nada importava `http.client`, ninguém notava; agora
`[MEDIDO 2026-08-29: `TypeError: function() argument 'code' must be code, not str` **na coleta**,
`1 error`, **zero teste rodado**]`. Um operador leria "a suíte reprova com o soquete amputado" como
"a suíte usa rede" — e a conclusão certa é **"o instrumento se quebrou antes de medir"**.

**A correção é amputar a CONEXÃO, não a classe:**

```bash
cat > backend/sitecustomize.py <<'EOF'
import socket
def _proibido(*a, **k): raise RuntimeError("REDE PROIBIDA: a suite tentou abrir soquete")
socket.socket.connect = _proibido
socket.socket.connect_ex = _proibido
socket.create_connection = _proibido
socket.getaddrinfo = _proibido
EOF
PYTHONPATH="$PWD/backend" bash backend/scripts/test.sh; rm backend/sitecustomize.py
```

**(c) E o instrumento corrigido foi auditado dos dois lados, na mesma passada**, porque guarda que
não morde daria verde por não estar instalado:

| lado | comando | resultado |
|---|---|---|
| **morde** | `http.client.HTTPSConnection('fapi.binance.com').request('GET', '/fapi/v1/time')` no interpretador amputado | `RuntimeError: REDE PROIBIDA` `[MEDIDO 2026-08-29]` |
| **cala** | a suíte inteira no **mesmo** interpretador amputado | **187 passed** `[MEDIDO 2026-08-29]` |

**O módulo que abre soquete existe em `src/` e a suíte continua sem tocar a rede.** É o que a
injeção da fábrica de conexão compra: o `HttpsQuotaProbe` dos testes recebe uma `FakeConnection`, e
a fábrica real (`open_https_connection`) só é construída pela raiz de composição do CLI.

**A medição AO VIVO de `T-03.7` NÃO roda na suíte e nunca vai rodar.** Ela está registrada em
[`docs/context/plataforma-dados/medicao-balde-de-cota-2026-08-29.md`](../docs/context/plataforma-dados/medicao-balde-de-cota-2026-08-29.md),
com momento, IP e endpoint ao lado de cada número.

`Q1` (ligar coletores) e `Q15` (ToS) continuam **ABERTAS**, e coletor não roda em portão.

## Uma cegueira do portão, medida aqui e que vale saber

`harness rules --mode sweep --changed-only` é `git diff --name-only HEAD`
(`lib/runner.py:88`) ⇒ **não enxerga arquivo novo ainda não rastreado**. Nesta task, em que
**todo** `backend/` é arquivo novo, ele varre **0 arquivo** e devolve verde sem ter medido nada
`[MEDIDO 2026-08-28: violador com 2 regras quebradas plantado em backend/src/ → --changed-only
devolve VAZIO; o mesmo violador no sweep completo devolve 2 BLOQUEIOS]`. **Num commit inicial, a
evidência é o sweep completo, nunca o `--changed-only`.**

## 100% de cobertura e 0% de verificação — o defeito que este módulo quase estabeleceu como forma

`ADR-009/D1` faz deste o **primeiro** módulo do repositório, isto é, a forma que os próximos copiam.
E a primeira versão dele tinha um buraco que a cobertura **não podia** enxergar:

| | |
|---|---|
| **o que estava verde** | `flush()` + `os.fsync()` nos dois módulos de `infra` — **4 statements, 100% de cobertura** |
| **o falsificador** | apague os 4 statements e rode a suíte |
| **o que acontecia** | `[MEDIDO 2026-08-28: **12 passed, rc=0**, cobertura segue **100%**]` — **a suíte não notava** |
| **o que acontece agora** | `[MEDIDO 2026-08-28: **2 failed, 12 passed**]`, e os dois que reprovam são exatamente os dois de `test_infrastructure_durability.py` |

**A lição, que é o motivo de estar escrita aqui e não num commit:** cobertura mede que a linha
**executou**, nunca que alguém **observou o efeito dela**. Quatro linhas podem estar 100% cobertas e
ter zero asserções sobre o que fazem. A técnica que fecha o buraco está no docstring do arquivo de
teste: espiar `os.fsync` por `monkeypatch` e conferir, **no instante da chamada**, que o conteúdo já
está no arquivo (mata a remoção do `flush`) e que o `rename` ainda não ocorreu (mata a inversão da
ordem). **Verde não prova nada até uma mutação reprovar.**

### E a fronteira do que a durabilidade aqui significa

O docstring de `JsonlCheckpoint` afirmava *"sem `fsync`, o `SIGKILL` apaga"*. **Era falso**, e foi
trocado. Depois do `close()` do `with`, os bytes estão no **page cache do kernel**; `SIGKILL` mata o
processo e o kernel sobrevive — o teste de `D3.1` **passaria sem `fsync` nenhum**. O que o `fsync`
compra é sobreviver a **queda de energia / pânico de kernel**, e isso é **`[NÃO MEDIDO]`**: nenhum
teste desta suíte corta energia, derruba o kernel ou inspeciona o dispositivo de bloco.

## Dívida nomeada, e a fase que a possui

Encontrada durante `T-01.1`, **deliberadamente não consertada aqui** — cada linha aponta o dono.
Está escrita também no código, junto do defeito, para não virar defeito redescoberto.

| o que | medida | onde no código | dono |
|---|---|---|---|
| `entries()` classifica erro de forma **incompleta**: `{"chave": …}` → `KeyError` · `5` → `TypeError` · `["a.csv"]` → `TypeError` — nenhum vira `CorruptedCheckpointError`, contra o próprio docstring. E **`{"key": null}` não levanta nada**: devolve `('None',)` porque `str(payload["key"])` coage, e uma chave chamada `None` seria marcada concluída **em silêncio**, derrotando "não perde" por coerção | **[MEDIDO 2026-08-28]**, universo **4 payloads** rodados contra o módulo | `infra/jsonl_checkpoint.py`, docstring de `entries()` | **`T-03.10`** — só um escritor **externo** produz esses payloads, e é a **fila** de `T-03.10` que expõe o arquivo a um **escritor de fora** |
| `EtlBacklog.__post_init__` usa `self.keys.count(key)` **dentro** da comprehension ⇒ **O(n²)** | **[MEDIDO 2026-08-28]** por `timeit`, 3 repetições por `n`: n=120 → **0,26 ms** · n=1.200 → **22,90 ms** · n=12.000 → **2.345,81 ms**; 100× no `n` custa ~9.000× no tempo | `domain/etl_backlog.py`, comentário em `__post_init__` | **`T-03.10`** — irrelevante em 120; a profundidade **parametrizada** que `T-03.10` declara no título (`Q18`, default 30 d) pode não ser |
| A **janela de risco real** de "não duplica" — item publicado mas **não** registrado, depois reprocessado — **não é garantida** pelo teste de `D3.1`: o relógio é dominado pelo `sleep` dentro de `transform`, logo **antes** do `os.replace`, e o teste **não afirma onde a morte caiu**. Hoje a propriedade é **reivindicada** por um teste e **provada** por outro (o de idempotência) | **[MEDIDO]** por leitura das asserções — nenhuma delas fala da janela | `tests/sentimento/test_resumable_etl_backlog.py`, docstring do teste de `D3.1` | **`T-03.10`** (fase `03`) |
| **Escala**: `D3.1` declara **0,86 s/arquivo (n=11)** `[DOC: tasks_review.md:274]` sobre dump real; o teste usa arquivos de **8 a 10 bytes (média 9,08 B, n=120)** `[MEDIDO 2026-08-28]` com atraso **artificial** de 0,02 s. **Invariante igual, escala diferente** — nada aqui mede custo por arquivo `[NÃO MEDIDO]` | idem | idem | **`T-03.10`** (fase `03`) |

E uma correção de nome, esta **feita** aqui: `test_publicacao_e_atomica_e_nao_deixa_parcial` **não
testava atomicidade** — não há interrupção nenhuma no corpo dele, só idempotência no caminho feliz.
Renomeado para `test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial`. No mesmo
movimento, `_conferir_saida_integra` era **cego a resíduo**: `glob("*.out")` **não casa**
`k.csv.out.partial`. A asserção que faltava foi acrescentada (o resíduo já era zero na medição —
era **asserção faltando**, não defeito).

## Achados do `/review` de 2026-08-28 REGISTRADOS e deliberadamente não consertados

Quatro achados desta auditoria não são desta task — três por serem dívida de fase futura, **um por
ser defeito de PLANO, que builder não conserta**. Cada um vem com o comando que o mediu e com o
falsificador que o derruba.

### `A` · a peça 1 de `ADR-009/D1` — o contrato `layers` — **não existe, e não tem dono**

`ADR-009/D1` enumera quatro peças copiadas do vizinho. A peça 3 (piso por camada) está no disco; a
**peça 1**, o contrato de **direção de import** entre `domain`/`use_cases`/`infra`, **não**. E o
plano da fase `01` **não deu dono a ela**: o item `1.3` dá dono ao contrato `forbidden` de
`charts` ⇄ `web`, e **ninguém** ao `layers`.

| | |
|---|---|
| **o que existe hoje** | a direção está **correta**, mas **por disciplina, não por enforcement** |
| **medida** | `[MEDIDO 2026-08-28: grep -rnE '^\s*(from\|import)\s+' backend/src --include='*.py'` sobre os **10** arquivos de produção → **1 único import interno** em todo `backend/src/`, `use_cases → domain` (`drain_etl_backlog.py:8`); **`domain` importa zero** módulo interno; `import-linter` **não está** em `pyproject.toml`]`. **Re-conferido 2026-08-28 por `T-01.6`**, depois de `requirements-dev.txt` deixar de existir: `grep -n importlinter backend/pyproject.toml` → **0 linha**, e `make boundaries` **RECUSA com `rc=3`** nomeando `T-01.5` como dona dos contratos, em vez de devolver verde sobre universo vazio |
| **por que não é consertado aqui** | **é defeito de plano e exige `/architect`.** Inventar a regra, instalar `import-linter` ou escrever `[[rules.own]]` seria criar enforcement sem dono declarado — e `1.8` manda que toda regra própria nasça **com corpus** |
| **o que o `/architect` precisa nomear** | quem possui a peça 1, em que fase, e com que instrumento |
| **falsificador** | se `harness rules list` passar a listar uma regra que reprove `domain → infra`, ou se um `.importlinter` aparecer com contrato `layers`, este parágrafo caiu |

**Um import certo em dez arquivos não é prova de que a direção se sustenta em cem.** Hoje ela vale
porque o módulo é pequeno e uma pessoa o escreveu inteiro num dia.

#### ✅ FECHADO em 2026-08-28 por `T-01.5` — **pelo próprio falsificador que o parágrafo publicou**

O parágrafo acima dizia: *"se um `.importlinter` aparecer com contrato `layers`, este parágrafo caiu"*.
Ele caiu — **e as linhas acima não foram reescritas**, porque o registro é append-only e o que elas
afirmam **era verdade quando foi medido**. O que mudou:

| então | agora |
|---|---|
| `grep -n importlinter backend/pyproject.toml` → **0** linha | `[tool.importlinter]` com **2** contratos `[MEDIDO 2026-08-28: make boundaries → "Contracts: 2 kept, 0 broken", rc=0]` |
| `make boundaries` **RECUSA `rc=3`** nomeando `T-01.5` | `make boundaries` **avalia**, e a recusa `rc=3` mudou de arquivo para `backend/scripts/boundaries.sh` |
| a direção valia *"por disciplina, não por enforcement"* | vale por portão: `scripts/hooks/pre-push.pre-harness` recusa o push `[MEDIDO 2026-08-28: 6 passadas de `git push --dry-run` em bancada isolada — ver a seção "A fronteira de módulo" acima]` |
| o instrumento não tinha dono | `ADR-011/D3` (o `/architect` nomeou), `T-01.5` executou |

**O que NÃO fechou junto, e é a metade do achado que sobrevive:** a peça 1 cobre `sentimento`, o
único contexto que existe. **Nada obriga o segundo contexto a nascer com contrato.** A frase *"um
import certo em dez arquivos não é prova"* continua valendo — o que mudou é que agora há quem meça.

### `G` · `check-coverage-layers.sh` é **cego a arquivo de produção que não case nenhuma camada**

O piso casa camada por **fragmento de caminho** (`/domain/`, `/use_cases/`, `/infra/`). Arquivo de
produção que não case **nenhum** dos três **não entra em balde nenhum, não é mencionado, e não
reprova nada**.

| | |
|---|---|
| **medida** | `[MEDIDO 2026-08-28]` com XML **sintético**: um `src/api/routes/painel.py` com **0 de 6 linhas cobertas**, ao lado de um arquivo 2/2 em cada camada → saída **três `[OK]` 100%**, `universo: 3 camada(s) medida(s) de 3 declaradas`, **rc=0**, e a string `painel` aparece **0 vezes** na saída |
| **inócuo hoje** | os **10** arquivos de produção do disco casam os três fragmentos, `4 de 4` sob `modules/sentimento/` |
| **quando morde** | quando o **layout de app do vizinho** chegar: `api/`, `routes/`, `schemas/`, `cli/`, `config/` — **cinco diretórios fora do piso, em silêncio** |
| **e um segundo modo, pior porque é silencioso e plausível** | o casamento é por **substring**, então `src/infra/**` (um `infra` de **aplicação**) seria **FUNDIDO** no mesmo balde que `modules/<ctx>/infra/` (o `infra` de **módulo**) — dois conceitos diferentes somados num percentual só, e a meta mais frouxa das três (70) aplicada aos dois |
| **falsificador** | acrescente ao XML sintético um arquivo de produção fora dos três fragmentos e rode o piso: enquanto ele devolver `rc=0` sem nomear o arquivo, a cegueira existe. O conserto é o piso **enumerar** o que mediu e **recusar** o que sobrou |
| **dono** | **não atribuído aqui.** É `/architect` quem decide se a peça 3 cobra exaustividade — o mesmo julgamento que a peça 1 (`A`) espera |

### `H` · **não existe raiz de composição** — todo o fio de ligação vive em `backend/tests/`

`EtlBacklog` + `FileEtlWorker` + `JsonlCheckpoint` + `drain` só aparecem **juntos** dentro da suíte.

| | |
|---|---|
| **medida** | `[MEDIDO 2026-08-28: dos **13** `.py` versionados sob `backend/`, exatamente **2** citam ≥ 3 das 4 peças — `tests/helpers/drain_driver.py` (**4 de 4**) e `tests/sentimento/test_resumable_etl_backlog.py` (**4 de 4**). Em `backend/src/`, **nenhum** módulo fora de `infra/` conhece as duas implementações]` |
| **por que importa** | quem monta o objeto **decide a direção das dependências**. Hoje quem monta é o teste, e teste pode depender de tudo |
| **o risco concreto** | o **primeiro chamador de produção** — **`T-03.10`** — vai ter de **inventar onde isso mora**, e os dois candidatos naturais **invertem a direção**: em `use_cases`, a camada de caso de uso passa a conhecer `infra`; em `infra`, a borda passa a orquestrar o caso de uso |
| **dono** | **`T-03.10`** — é ela que traz o primeiro chamador de produção, e portanto a primeira que **não pode** adiar a decisão |
| **falsificador** | se `T-03.10` puder ligar as quatro peças sem nenhum módulo novo e sem `use_cases` ou `infra` importar para o lado errado, o achado era falso alarme |
| **✅ VEREDITO 2026-08-29 (`T-03.10`)** | **FECHADO, e o achado NÃO era falso alarme — mas ele errou metade do risco.** O falsificador tem duas metades e elas deram respostas opostas: **(1) um módulo novo FOI necessário** — `infra/dump_etl_cli.py` —, logo o achado procede; **(2) a direção NÃO se inverteu.** O achado dizia que os dois candidatos *"invertem a direção"*, e isso é verdade para `use_cases` e **falso para `infra`**: `[tool.importlinter]` declara `layers = ["infra", "use_cases", "domain"]` com **a primeira como a mais alta**, então `infra` importando `use_cases` e `domain` corre **a favor** do contrato. Medido: `bash backend/scripts/boundaries.sh` → **`2 kept, 0 broken`**, `Analyzed 22 files, 20 dependencies` (linha de base antes desta task: **17 files, 7 dependencies**, `2 kept`). E o precedente já estava na árvore: `infra/ingest_health_cli.py`, que este README já chama de raiz de composição |

### `I` · `web-fullstack.tenant-from-request` passará a avaliar **a suíte inteira** quando `T-01.2` adotar o pack

A decisão de pôr `backend/tests/` em `code_paths.include_prefixes` — tomada nesta task, e com bom
motivo medido — tem um **custo** que ela não nomeou.

| | |
|---|---|
| **a regra** | `id = "web-fullstack.tenant-from-request"`, `severity = "block"`, `scope = "code"`, `paths = ["backend/**/*.py"]`, `form = "forbidden-regex"` `[MEDIDO 2026-08-28: packs/web-fullstack/rules.toml:21-27]` |
| **o mecanismo** | `paths` é `backend/**/*.py` e o escopo é `code`, **não `production`** ⇒ com `backend/tests/` classificado como **código**, a regra avalia **cada arquivo de teste**, não só `src/` |
| **probabilidade** | **baixa** — `ADR-009/D2` recusa multi-tenancy, então `tenant_id`/`company_id` não deveriam aparecer nem em produção nem em fixture |
| **por que registrar mesmo assim** | é **custo de uma decisão já tomada**, e a decisão o omitiu. O `scope = "code"` de outras regras do mesmo pack tem a mesma propriedade — a lista de quais só se mede na adoção |
| **dono** | **`T-01.2`**, a task que adota o pack. O que ela deve fazer é **medir antes**: `harness rules --mode sweep` com o pack ligado, e comparar o universo avaliado |
| **falsificador** | se, com o pack adotado, o sweep completo devolver o mesmo número de achados de hoje (**0**), o custo era teórico e esta linha vira nota histórica |

---

## 🛡️ A borda de ingestão verifica o `.CHECKSUM` — `T-02.4a` (`GAP G1`, `SPEC-001` §5.8, `D2.8`)

**O defeito que esta guarda existe para pegar não levanta exceção.** `monthly/bookTicker` de
2024-04 respondeu **200 com 37,7 MB** contra **6,7 GB** do mês anterior `[MEDIDO, SPEC-001
§5.8]`. Um ETL que trate `status == 200` como testemunha de integridade grava uma **série
curta** e chama isso de sucesso — modo de falha **pior que o 404**, porque o 404 pelo menos
falha em voz alta.

| peça | camada | o que ela faz |
|---|---|---|
| `domain/checksum_manifest.py` | `domain` | lê a linha `sha256sum` do sidecar e compara o par (digest, nome). Zero I/O |
| `use_cases/ingest_verified_payload.py` | `use_cases` | **a ordem**: `checksum_text` → `parse` → `digest` → `verify` → **só então** `lines()` |
| `infra/checksummed_file_payload.py` | `infra` | o arquivo + `<nome>.CHECKSUM` ao lado; digest em blocos de 1 MiB, `lines()` preguiçoso |

### Por que DUAS passadas sobre o arquivo, e não uma

A task diz **"antes de qualquer linha entrar"**, e essa palavra elimina o desenho mais barato.
Um digest de arquivo inteiro só existe **depois do último byte** ⇒ hashear durante o streaming
e levantar no fim é uma guarda que **reporta o truncamento depois de a série curta já estar
escrita**. Isso é o defeito, não o conserto. A alternativa (bufferizar tudo) não sobrevive a
6,7 GB. Ler duas vezes custa **uma varredura sequencial extra** e mantém a garantia.

**E a ordem não é prosa: ela é asserção.** `CallOrderSpy` registra a sequência de chamadas, e o
teste exige que `lines()` **nem sequer seja chamado** quando o digest não bate — afirmação mais
forte que *"o sink ficou vazio"*, e que continua valendo se alguém tornar o iterador ansioso.

### Falha fechada, e as três formas são a mesma família

Sidecar **ausente**, sidecar **malformado** e digest **divergente** terminam com **zero linha
entregue**, todos sob `ChecksumRejectedError`. *"Não conseguimos conferir"* e *"conferimos e
está íntegro"* são estados diferentes, e deixar o primeiro passar com o nome do segundo é
exatamente como um mês truncado entra sem ninguém ver.

### A bancada de mutação — `n=22`, e ela é **obrigatoriamente** com bytecode desligado

`[MEDIDO 2026-08-29, ciclo 2, diretório de trabalho PRIVADO, `backend/.venv/bin/python`;
universo = os **46 casos coletados** (30 funções, o resto é parametrização) de
`tests/sentimento/test_checksum_at_the_ingestion_edge.py` na árvore de `13b960e`, onde a
bancada rodou — `pytest <arquivo> --collect-only -q` → `46`, `grep -c "^def test_"` → `30`
(**60 passed** na suíte inteira); cada mutação aplicada isolada, revertida, e os 3 módulos
reconferidos por `sha256sum` ao fim; controle `rc=0` nos dois extremos]`:

**`n=22` ⇒ 21 mordem, 1 sobrevive.**

> **Errata 2026-08-29 (coordenador do loop, não o `/build`):** este parágrafo publicava
> *"os **41 casos**"*. O `41` é o total da suíte **inteira** no ciclo 1 (`49161c9`:
> `27+2+12`) — número certo de outra medição, colado no rótulo errado, e a mesma frase
> acertava o `60 passed` ao lado, o que mostra que era troca de etiqueta e não erro de
> contagem. Achado pelo `/review` na re-auditoria do delta (`WARNING D1`) e medido aqui:
> `pytest … --collect-only -q` → **46** em `13b960e`, **49** na árvore de `dab5bd3`.
> Vale registrar o que estava em jogo: era a **declaração de universo da evidência
> central do delta** — a bancada que substituiu o desenho recusado.

| # | mutação | veredito | reprova |
|---|---|---|---|
| `M1` | `verify` movido para **depois** do loop | **MORDE** | 5 |
| `M2` | checagem de **assunto** removida de `verify()` | **MORDE** | 3 |
| `M3` | sidecar ausente deixa de reprovar (*fail-open*) | **MORDE** | 3 |
| `M4` | `digest()` lê só o **primeiro bloco** | **MORDE** | 2 |
| `M5` | `fullmatch` → `search` | **MORDE** | 17 |
| `M6` | sidecar por `with_suffix` em vez de `with_name` | **MORDE** | 14 |
| `M7` | divergência de digest deixa de reprovar | **MORDE** | 3 |
| `M8` | `parse` aceita a **primeira** de várias entradas | **MORDE** | 1 |
| `M9` | `stream = payload.lines()` **içado para antes** do `verify` | **MORDE** | 2 |
| `M10` | `verify` confere **digest antes de assunto** | **MORDE** | 1 |
| `M11`–`M14` | cada uma das **4 recusas** sai de `ChecksumRejectedError` | **MORDE** | 1–2 cada |
| `M15` | `logger.warning` do sidecar ausente removido | **MORDE** | 1 |
| `M16` | `logger.info` da ingestão aceita removido | **MORDE** | 1 |
| `M17` | `checksum_suffix` ignorado (costura morta) | **MORDE** | 1 |
| `M18` | `lines()` **ansioso** | **MORDE** | 1 |
| `M19` | `digest()` com `read_bytes()` | **MORDE** | 1 |
| `M20` | regex `{64}` → `{32,128}` | **SOBREVIVE** | — |
| `M21` | guarda de `UnicodeDecodeError` **removida** (o defeito `QA-1` de volta) | **MORDE** | 1 |
| `M22` | assunto vazio deixa de reprovar em `__post_init__` | **MORDE** | 1 |

**`M20` é o sobrevivente CORRETO, e sobrevivente correto não é buraco:** `__post_init__` já
recusa qualquer digest que não tenha 64 hex, então afrouxar o quantificador do regex **não muda
comportamento observável** — é redundância real. `M9` é do `/review`, e é a refatoração inocente
mais provável: içar o iterador derrota *"o sink ficou vazio"* e **não** derrota o `CallOrderSpy`,
que observa a **chamada**.

`M11`–`M14` e `M15`–`M17` existem porque o `/qa` mediu que **7 de 16** mutações sobreviviam à
bancada original: cada sobrevivente era **uma frase de docstring que nenhuma asserção cobrava** —
inclusive a própria advertência da classe base sobre *"catch three and forget the fourth"*.

#### 🔴 BYTECODE DESLIGADO É OBRIGAÇÃO DA BANCADA, NÃO RECOMENDAÇÃO

`python -B` + `PYTHONDONTWRITEBYTECODE=1` + `__pycache__` **apagado a cada rodada**. Sem os
três, a bancada mede o código **errado** e devolve verde.

**O mecanismo:** o CPython valida o `.pyc` por **`mtime` da fonte em segundos + tamanho da
fonte**. Uma mutação que preserve os dois, aplicada dentro do mesmo segundo, **reusa o bytecode
velho** — e a suíte roda contra o código **não mutado**.

**A demonstração, com uma mutação de tamanho invariante POR CONSTRUÇÃO** — `!=` → `==` em
`verify`, **um caractere por outro**, que **inverte o veredito de integridade inteiro**
`[MEDIDO 2026-08-29, n=1, `mtime` restaurado com `os.utime`]`:

```
arquivo: checksum_manifest.py   tamanho=6662 -> 6662 (igual)   mtime restaurado
  RUN A (.pyc vivo, sem -B)                        -> rc=0,  0 reprovam   ⇠ VERDE sobre código MUTADO
  RUN B (-B + PYTHONDONTWRITEBYTECODE + cache off) -> rc=1, 11 reprovam
```

**⚠️ ERRATA À PRIMEIRA REDAÇÃO DESTA SECÇÃO, e ela é da mesma família que a secção denuncia.**
A versão de `2026-08-29T11:44Z` creditava a invariância de tamanho a uma medição — *"os dois
blocos têm **227 bytes** exatos"*. **O termo estava errado, uma camada acima do `^`/`.match()`:**
`M1` é **permutação das mesmas linhas**, logo o tamanho é invariante **por construção** e a
igualdade dos dois blocos **não é a evidência** — é consequência. Pior, o número **não é
estável**: depende de onde a linha em branco cai dentro do recorte, e com o recorte da bancada
de hoje os blocos medem **179 e 178** bytes `[MEDIDO 2026-08-29, ciclo 2]`, enquanto o `/review`
mediu **80 e 98** num terceiro recorte. **Três recortes, três pares de números, e nenhum deles é
o argumento.** O argumento é: *toda* mutação que preserve tamanho é invisível com `.pyc` quente —
e as que preservam tamanho **não são raras** (`!=`→`==`, `<`→`>`, permutação de linhas).


### ⚠️ A divergência de vocabulário de observabilidade — declarada com PRECISÃO, na segunda tentativa

A regra de idioma de 2026-08-29 (*"todo código gerado é em inglês"* `[PREMISSA-OWNER]`) tem uma
consequência que **não** é só nome de identificador, e a primeira redação desta task a declarou
**menor do que ela é**: dizer *"mensagens de exceção e nome de evento de log"* **omitia a metade
mais cara**.

**As CHAVES DE `extra=` também viraram inglês** — e chave de campo é **o que uma consulta de log
filtra**, logo é a metade que dói unificar. Enumerado do **AST**, não por grep
`[MEDIDO 2026-08-29, universo = 13 `.py` sob `backend/src/`, 6 chamadas de `logger.*`]`:

| módulo | evento | chaves de `extra=` | |
|---|---|---|---|
| `infra/file_etl_worker.py` | `etl_item_publicado` | `etl_key`, `destino` | pré-existente |
| `infra/jsonl_checkpoint.py` | `checkpoint_cauda_truncada` | `bytes_descartados` | pré-existente |
| `use_cases/drain_etl_backlog.py` | `etl_drenagem_concluida` | `processados`, `janela` | pré-existente |
| `use_cases/drain_etl_backlog.py` | `etl_item_concluido` | `etl_key` | pré-existente |
| **`infra/checksummed_file_payload.py`** | **`checksum_sidecar_absent`** | **`subject`** | **novo, inglês** |
| **`use_cases/ingest_verified_payload.py`** | **`ingestion_verified`** | **`subject`, `sha256`, `lines`** | **novo, inglês** |

**4 chamadas em português contra 2 em inglês; 6 chaves de campo contra 4.** **Nada existente foi
renomeado.** A divergência é **decisão de leitura do agente**, não citação do owner — a regra
enumera *identificador, docstring, comentário, nome de teste* e **não** decide mensagem, evento
nem chave de campo. Quem for unificar precisa saber que ela nasceu aqui, e que **cegueira
documentada com precisão errada é pior que não documentada**.

### O que esta task NÃO fecha, e não é rodapé

- **Não há chamador de produção.** `ingest_verified` é a borda; **quem a chama ainda não
  existe**, e isso é o achado `H` deste mesmo README (*"não existe raiz de composição"*) —
  dono declarado **`T-03.10`**. Esta task **não** inventou raiz de composição.
  **✅ FECHADO 2026-08-29 por `T-03.10`:** o chamador é `infra/dump_ingest_worker.py`, e a raiz
  de composição é `infra/dump_etl_cli.py`.
- **`LineSink` não tem implementação de produção.** O único sink hoje é o de teste. Quem
  trouxer o primeiro destino real o traz.
  **✅ FECHADO 2026-08-29 por `T-03.10`:** `BinaryFileLineSink`, em `infra/dump_ingest_worker.py`.
- **Nada de `data/`.** Os testes fabricam o próprio arquivo e o próprio `.CHECKSUM`, e
  corrompem o byte deles mesmos. `data/` é dado de terceiro e continua fora do portão.
- **A metade documental do item `2.5` do plano é `T-02.4b`** (`docs`): política de backup com
  teste de restauração. **Não é desta task**, pela partição `D-3` do `tasks_review.md` §7.
- **`curl -sI` mensal** em prefixo antigo e recente (`SPEC-001` §5.8) é mitigação **de retenção
  do bucket**, não de integridade de corpo. Não entrou aqui — e **tem dono**: **`T-03.10`**
  (**✅ FECHADO 2026-08-29:** `domain/retention_probe.py` enumera e classifica; a rede fica com o
  cron e entra por `infra/head_probe_log.py`)
  (`tasks_review.md`, linha da task; plano `3.14`; `D7.19`). A redação de `2026-08-29T11:44Z`
  dizia *"não tem dono nesta task"*, o que se lia como *"não tem dono"* — e o mesmo bullet
  acima já nomeia `T-03.10` para a raiz de composição.

- **Recusas fora da família são DECISÃO, e estão nomeadas.** `ChecksumRejectedError` cobre todo
  veredito de **integridade** — sidecar ausente, malformado (**bytes não-UTF-8 inclusive**),
  digest divergente, assunto divergente. **`OSError` e subclasses propagam CRUAS**:
  `FileNotFoundError` (payload sumido com sidecar presente), `PermissionError`,
  `IsADirectoryError`, erro de leitura no dispositivo. Não é sobra: são falhas **do chamador ou
  da máquina**, não vereditos sobre a integridade de um objeto, e embrulhá-las diria *"este
  arquivo está corrompido"* onde a verdade é *"o caminho que você passou não existe"*.
  Consequência explícita: um lote escrito como `except ChecksumRejectedError: skip_one_file()`
  **pula objeto corrompido e MORRE em caminho sumido** — que é o comportamento correto, porque
  payload que desapareceu no meio da corrida significa que a visão de mundo do chamador está
  errada. `test_a_payload_file_that_vanished_delivers_nothing` fixa isso.
  **E a assimetria está escrita no `Raises:`:** a garantia de **zero linha** é da família de
  integridade; `OSError` **na abertura** deixa o sink vazio, `OSError` **no meio do stream**
  não deixa — e afirmar o contrário seria a mesma classe de defeito que esta task existe para
  nomear.

- **A garantia de ordem tem escopo de UMA função, e a alternativa foi RECUSADA com argumento.**
  A asserção do `CallOrderSpy` observa `ingest_verified` e mais nada: nem o sistema de tipos nem
  o `import-linter` impedem um **segundo** use case, escrito depois, de chamar `payload.lines()`
  antes de verificar. O desenho que "fecharia" — `verify` devolvendo um `VerifiedPayload` que é
  a única coisa a expor `lines()` — **não foi implementado, e a recusa é sobre o mérito**: em
  Python **não há mecanismo** que impeça quem já segura o objeto de origem de chamar
  `source.lines()` nele; o token **moveria o caminho feliz sem fechar o buraco**, produzindo um
  portão que **parece** estrutural e não é — exatamente a família que este repositório caça. E
  fixaria a forma de uma porta **antes de existir o primeiro chamador de produção**, que é
  decidir por premissa. **Dono da lacuna: `T-03.10`** (o mesmo do achado `H`).
  **Gatilho de reabertura, observável e medido dos dois lados** — contagem de **call sites** lida
  do **AST**, não regex sobre texto:

  ```
  cd backend && .venv/bin/python -c '
  import ast, pathlib
  n=[f"{f}:{o.lineno}" for f in pathlib.Path("src").rglob("*.py")
     for o in ast.walk(ast.parse(f.read_text()))
     if isinstance(o,ast.Call) and isinstance(o.func,ast.Attribute)
     and o.func.attr=="lines" and not o.args]
  print(len(n),n); raise SystemExit(0 if len(n)<=1 else 1)'
  ```

  `[MEDIDO 2026-08-29: árvore como está → **1**, `rc=0` `[CALA]`; com um segundo chamador
  plantado → **2**, `rc=1` `[MORDE]`]`. No dia em que a contagem chegar a 2, a garantia parou
  de cobrir o código.

  **✅ 2026-08-29, `T-03.10` — o gatilho SAIU DO COMENTÁRIO E VIROU TESTE, e tinha dois pontos
  cegos.** `tests/sentimento/test_verified_edge_call_sites.py` agora o **roda** em
  `bash backend/scripts/test.sh` (*"ferramenta que ninguém roda não é portão"* — `ADR-011:268`).
  E o scanner do comentário só via `ast.Call` sobre `ast.Attribute`; medi as duas evasões, cada
  uma sozinha numa árvore isolada `[MEDIDO 2026-08-29, `python -B` + `PYTHONDONTWRITEBYTECODE=1`,
  `__pycache__` apagado]`: `pull = payload.lines` + `pull()` → **0 `[CEGO]`** e
  `getattr(payload, "lines")()` → **0 `[CEGO]`**, contra `payload.lines()` → **1**. São as
  **mesmas duas** que `[tool.importlinter]` já nomeia por escrito como limite herdado. O scanner
  novo vê as três, e **é falsificado pela própria suíte** (as três formas entram como texto e
  têm de ser vistas). O que continua invisível e está escrito: `getattr(payload, nome)()` com
  `nome` calculado em runtime. **A contagem em produção continua `1`** — `T-03.10` trouxe o
  primeiro chamador de produção e **não** acrescentou call site: ele entrega um sink a
  `ingest_verified` e nunca toca em `payload.lines`.

- **A falha fechada está CONTIDA hoje, e isso é achado documental, não arquitetural.**
  `grep -rn "ingest_verified\|ChecksummedFilePayload\|VerifiablePayload\|LineSink" backend/src
  backend/tests`, descontando os próprios arquivos, → **`rc=1`, zero referência** `[MEDIDO pelo
  /review 2026-08-29]`: não há raiz de composição nem despachante, logo nada está sendo roteado
  para cá por engano. **A política de recusa por sidecar ausente vale para fontes que publicam
  `.CHECKSUM`** — os dumps do bucket. **`T-02.1` (snapshot `exchangeInfo`/`fundingInfo`) e
  `T-02.2` (one-shot Coinalyze) são respostas REST, NÃO publicam `.CHECKSUM`, e NÃO devem ser
  roteadas por aqui**: aplicá-las a esta borda como está recusaria 100% do tráfego legítimo.

## 📒 O registro de ingestão de F0 — `T-02.3` (`CST-14`, `ADR-008` D1+D2+D3, plano 02 itens 2.6+2.7)

`md.ingest_run` e `md.ingest_gap` passam a existir **persistidos**, e a leitura deles é **uma
única** função nomeada — `ingest_health_query` — porque `ADR-008/D3` decide que o registro cru
de F0 (CLI) e o console S1 de F3 (`T-07.13`) são **dois consumidores da mesma verdade**.

### As quatro peças, e a camada de cada uma

| peça | camada | o que ela é |
|---|---|---|
| `domain/ingest_record.py` | `domain` | `IngestRun`/`IngestGap` (as colunas de `SPEC-001` §3.5), o conjunto fechado de `verdict`, e a **projeção canônica** que vira `sha256` |
| `use_cases/ingest_health.py` | `use_cases` | **`ingest_health_query`** — a definição única — mais o `Protocol` de leitura. Nenhum consumidor conhece o motor |
| `infra/sqlite_ingest_record_store.py` | `infra` | o adaptador durável: uma conexão por chamada, `commit` por linha |
| `infra/ingest_health_cli.py` | `infra` | o relatório: **registrador nomeado escrevendo `stdout`**, `ADR-008/D2` |

### ⚠️ O motor é SQLite e `ADR-002/D1` diz PostgreSQL — a divergência é declarada, não escondida

`ADR-002/D1` põe estas duas tabelas no PostgreSQL "que já está de pé". Ela é de **F4**, está
`proposto`, e o finalista de motor está **pendente de spike** (`D4`). Hoje o `backend` declara
`dependencies = []` e a suíte é offline por construção — não há driver, não há daemon, e o
plano `02` existe separado do `03` justamente porque **F0 não depende de host**.

O que esta task escolheu é o **adaptador**, não a decisão. **A decisão de motor continua sendo
de `ADR-002`**, e a pergunta está aberta e endereçada ao `quant-architect`.

#### ⚠️ ERRATUM 2026-08-29 (`/review`) — "o custo da troca é **um arquivo**" estava ERRADO

Era número publicado **sem o comando que o produziu**, no mesmo documento que faz disso um
portão. O comando devolve **dois**:

```
$ grep -rln "sqlite3\|SqliteIngestRecordStore" backend/src/
backend/src/modules/sentimento/infra/ingest_health_cli.py
backend/src/modules/sentimento/infra/sqlite_ingest_record_store.py
```
`[MEDIDO 2026-08-29: **2 arquivos** em `backend/src/`, mais **5** em `backend/tests/`]`

O segundo é o **CLI**, que nomeia o store concreto porque é a **raiz de composição** — compor é
exatamente o trabalho dele, então isso não é acoplamento indevido. O número é que estava errado.

**E o agravante é o que de fato decide se a troca é barata**, porque ele não aparece em
contagem nenhuma: **só o caminho de LEITURA tem porta.** `IngestRecordSource`
(`use_cases/ingest_health.py`) é `Protocol` e tem **3 implementadores** — o store, mais dois de
teste que não são o store `[MEDIDO 2026-08-29: `grep -rln "def runs(self)" backend/src backend/tests`]`.
**`initialise` / `record_run` / `record_gap` não têm porta alguma:** um segundo motor teria de
ser introduzido contra a classe concreta.

| | |
|---|---|
| **por que fica assim hoje** | não existe escritor de produção — porta sem implementador é cerimônia, e o repositório já recusa "enforcement declarado, não medido" pelo mesmo motivo |
| **dono de fechar** | **`T-03.8`**, a primeira task que persiste por `ingest_run` em produção (skew por execução). É ela que traz o escritor real, e portanto a primeira que **não pode** adiar |
| **falsificador** | se `T-03.8` conseguir escrever sem introduzir porta e sem `use_cases` conhecer `sqlite3`, a assimetria era teórica |

### A bancada de mutação — verde não prova nada até algo reprovar

Seis mutantes, cada um revertido e o arquivo reconferido por `sha256` antes do seguinte
`[MEDIDO 2026-08-29, `n=6`, com `PYTHONDONTWRITEBYTECODE=1` e `__pycache__` apagado entre
mutantes — ver o achado logo abaixo, que é o motivo dessas duas precauções]`:

**A COLUNA "quem morde" CARREGA O COMANDO LITERAL, e ela não carregava até o `/review` de
2026-08-29 cobrar.** O cabeçalho trazia o rótulo e a linha `A` trazia o comando; as outras
cinco diziam "2 testes falham" sem dizer **quem** os rodou, que é meia medição.

| # | mutante | quem morde (comando literal) | resultado |
|---|---|---|---|
| **A** | `print(...)` na raiz de composição do CLI | `harness rules --mode sweep` | **rc=1**, 1 achado `[BLOQUEIO] [core.print-statement]`. Árvore boa: **rc=0** |
| **B** | o driver troca o store durável por memória | `bash backend/scripts/test.sh` | **rc=1**, 2 testes reprovados |
| **C** | `ORDER BY started_at, run_id` → `ORDER BY run_id DESC` | `bash backend/scripts/test.sh` | **rc=1**, 3 testes reprovados |
| **D** | duas das 15 colunas trocam de ordem no `domain` | `bash backend/scripts/test.sh` | **rc=1**, 2 testes reprovados — e ver abaixo: na 1ª passada **SOBREVIVEU** |
| **E** | a consulta **esconde** o `verdict` inédito em vez de reprovar | `bash backend/scripts/test.sh` | **rc=1**, 2 testes reprovados |
| **F** | `record_run` deixa de dar `COMMIT` | `bash backend/scripts/test.sh` | **rc=1**, 9 testes reprovados |
| **G** | `ORDER BY started_at, run_id` perde o desempate | `bash backend/scripts/test.sh` | **rc=1**, 1 teste reprovado |
| **H** | o `ORDER BY` de `md_ingest_gap` perde o desempate | `bash backend/scripts/test.sh` | **rc=1**, 1 teste reprovado |
| **I** | `mkdir(parents=True)` → `mkdir(...)` | `bash backend/scripts/test.sh` | **rc=1**, 1 teste reprovado |
| **J** | `logger.propagate = False` → `True` | `bash backend/scripts/test.sh` | **rc=1**, 1 teste reprovado — e ver abaixo: **SOBREVIVEU** à 1ª passada pós-conserto |
| **K** | `VERDICTS_SPELLED_IN_THE_SPEC` perde `REJECTED` | `bash backend/scripts/test.sh` | **rc=1**, 4 testes reprovados |
| **L** | a guarda de `_fetch` volta a ser só `path.exists()` | `bash backend/scripts/test.sh` | **rc=1**, 2 testes reprovados |

**A BANCADA RECUSA MUTANTE QUE NÃO APLICOU, e isso não é detalhe de implementação.** Quando um
conserto de idioma moveu duas linhas, a âncora do mutante `E` deixou de casar e a bancada
imprimiu **`INERTE`** em vez de contar um resultado: um mutante que não chegou ao disco não é
"morto" nem "sobreviveu" — é **não medido**, e é a mesma distinção `rc=3` que os scripts deste
repositório fazem. Uma bancada que casasse silenciosamente devolveria "12 mortos" tendo aplicado
11. A âncora foi corrigida e `E` re-rodado: `rc=1`, 2 testes reprovados.

**Procedência do universo, porque ele não é todo meu:** `A`–`F` são os 6 que `T-02.3` rodou na
entrega. `G`–`K` são os **5 que o `/qa` levantou e que SOBREVIVIAM** — todos sobre linhas com
**100% de cobertura**, que é a demonstração de que cobertura não é medida de verificação. `L` é
o mutante do defeito que esta rodada consertou. **Universo desta passada: 12 mutantes, 12
mortos**, restauração conferida por `sha256` dos 25 fontes **e** por importação efetiva.

#### 🔴 O mutante `D` sobreviveu na primeira passada, e o defeito era do TESTE

A primeira versão do teste de colunas comparava a projeção com **a própria constante de que a
projeção deriva** (`INGEST_HEALTH_RUN_COLUMNS`). Reordenar a constante movia **os dois lados
da igualdade juntos**: `[MEDIDO 2026-08-29: mutante D contra o teste antigo → **17 passed**,
rc=0]`. É a família que este repositório caça — **um controle que devolve o mesmo número dos
dois lados não está medindo** — desta vez dentro do teste que existia para medir o contrato.

O conserto é uma **transcrição independente**, copiada à mão de `ADR-008/D3` e de `SPEC-001`
§3.5, que existe para **não ser** a constante do `domain`. Com ela, o mesmo mutante mata dois
testes. Quem for editar as duas listas até baterem está desfazendo o conserto: o caminho certo
é reabrir a ADR.

#### 🔴 O mutante `J` sobreviveu ao PRÓPRIO CONSERTO, e o defeito era meu de novo

Rodada de correção. O conserto do defeito 2 do `/qa` manda o diagnóstico desta aplicação para
`stderr`; com isso, **`logger.propagate = False` deixou de proteger o que protegia**. Os
registros do CLI passam a subir para o registrador `src`, cujo handler está em `stderr` — então
`stdout` continua exatamente certo e **toda a suíte passa, inclusive os testes que o `/qa`
escreveu para essa linha** `[MEDIDO 2026-08-29, bancada privada: mutante J → `bash
backend/scripts/test.sh` **rc=0, 55 passed, SOBREVIVEU**]`.

O que ele quebra é outra coisa, e ninguém olhava: **as 5 linhas do produto saem REPETIDAS em
`stderr`**, com prefixo `INFO src.modules…`. Um operador que escreve `cmd >record.jsonl 2>&1`
— o reflexo de quem põe isso em `cron` — passa a ter cada linha duas vezes no arquivo, que não
é JSON Lines válido nem é a projeção que `ADR-008/DoD-2` compara.

**Linha coberta que nenhum mutante alcança é linha que ninguém está medindo.** O conserto é o
teste `test_the_product_never_leaks_onto_the_diagnostic_stream`, que afirma a divisão nos DOIS
sentidos: `stdout` é a projeção **e** `stderr` não contém nenhuma linha dela.

#### 🔴 E um terceiro achado, uma camada abaixo: o `.pyc` obsoleto falsifica a própria bancada

Restaurar o arquivo mutado e conferir o `sha256` **não basta**. A invalidação de bytecode do
CPython compara `(mtime em segundos, tamanho)`; um mutante que só **troca linhas de lugar**
tem **o mesmo tamanho**, e se mutar/rodar/restaurar couber no **mesmo segundo**, o `.pyc`
continua sendo considerado válido — o interpretador lê o **mutante** enquanto o disco já tem o
original. Foi medido aqui: `sha256` do fonte **idêntico ao original** e
`INGEST_HEALTH_RUN_COLUMNS[0]` importado devolvendo **`'source'`** (o valor do mutante) em vez
de `'run_id'` `[MEDIDO 2026-08-29]`.

O portão não mente — `bash backend/scripts/test.sh` reprovava de verdade. **Quem mentia era a
bancada de mutação**, que poderia ter registrado "mutante morto" para um mutante que o
interpretador nunca deixou de executar, ou o contrário. A bancada acima foi **inteiramente
re-rodada** com `PYTHONDONTWRITEBYTECODE=1` e `__pycache__` apagado entre mutantes.

### O que esta task NÃO fechou, nomeado

| item | por quê |
|---|---|
| **`ADR-008/DoD-1` na forma `[[rules.own]]` + corpus** | ver o **gatilho de reabertura** logo abaixo, que é a parte que faltava |
| **o lado TypeScript da unicidade** | o varredor é AST de Python e cobre `backend/src/`. O segundo consumidor nasce em **`T-07.13`**, e é lá que a varredura do outro lado tem dono |
| **a 5ª forma de definição — a construída em runtime** | `setattr`, import hook, registro dinâmico. Está **fora do alcance de qualquer AST** e fica `[NÃO MEDIDO]`. As formas `def`/`class` e a de **atribuição** estão cobertas, cada uma com controle dos dois lados |
| **`ADR-008/DoD-2` e `DoD-3` inteiros** | as duas metades de F0 estão feitas (a projeção com `sha256`, e o `verdict` inédito reprovando). A **comparação entre os dois consumidores** só é executável quando o segundo existir — `T-07.13`, `D7.17` |
| **`janela_de_perda`** | a coluna existe na projeção e vale `null`. Ela é **fórmula por série** (`D7.12`) e o dono é `T-07.12`. Um número seco aqui é exatamente o que `D7.14` proíbe |

#### 🔓 O gatilho de reabertura de `DoD-1` — e ele é comando, não memória

O `/review` de 2026-08-29 **julgou a recusa e deu razão a ela por escrito**: `harness.toml:463`
fixa *"toda `[[rules.own]]` que esta fase declarar nasce com corpus"* e `:475` diz *"Declará-la
aqui seria escrever enforcement sem o corpus que o mede"*. Declarar a regra sem corpus violaria
o documento, e o vácuo não ficou aberto — a unicidade é medida por **duas varreduras AST com
controle dos dois lados** (`def`/`class`, e **atribuição**, esta última escrita pelo `/qa`).

**Onde a recusa ficava abaixo do precedente:** `ADR-012/D2:100` não guardou uma dívida na
cabeça de ninguém — escreveu um gatilho que **um comando resolve** (*"no dia em que
`command -v shellcheck` devolver um caminho, esta decisão vence"*). Esta não tinha. Agora tem:

```
$ test -d corpus && echo "DoD-1 VOLTA À MESA" || echo "corpus ainda não existe"
corpus ainda não existe
```
`[MEDIDO 2026-08-29: `ls -d corpus` → inexistente na raiz do repositório]`

**No dia em que esse comando imprimir `DoD-1 VOLTA À MESA`**, a recusa vence e `DoD-1` volta na
forma que a ADR pede: `[[rules.own]]` de `forbidden-regex` contra uma segunda definição,
**nascendo com os casos `conforming/` e `violating/`** no corpus que passou a existir, mais
`harness corpus verify` e `harness corpus mutate`.

⚠️ **E a dívida ainda não é grepável a partir de quem a herda:** os `refs` de `T-07.13` em
`docs/context/plataforma-dados/tasks.toml:907` **não citam `ADR-008/DoD-1` nem `DoD-2`**. Isso é
**ato do `/tech-lead`**, não de builder — esta task não edita `tasks.toml` — e está encaminhado.
Enquanto não for feito, este parágrafo é o único fio, e ele é mais fraco que um `ref`.

### Uma pergunta de domínio que NÃO foi decidida aqui

O conjunto fechado de `verdict` tem **dois** valores escritos na `SPEC-001`
(`ACCEPTED_WITH_WARNING`, `REJECTED`) e o terceiro — `ACCEPTED` — é
`[INFERRED: §5.6 trata `ACCEPTED_WITH_WARNING` como a variante COM AVISO de um aceite, logo um
aceite sem aviso é pressuposto; ele nunca aparece literal em documento nenhum]`. Sem ele uma
execução limpa não teria `verdict`. **Quem é dono da enumeração é o `quant-architect`**, e a
pergunta está aberta.

**E a inferência agora está CONTIDA, o que na entrega ela não estava.** O `/review` achou que a
disciplina de transcrição independente tinha sido aplicada às *colunas* e **não ao enum** —
exatamente onde mora o `[INFERRED]`. `test_every_known_verdict_passes_the_shared_query` era
parametrizado por `sorted(KNOWN_VERDICTS)`, a mesma constante que a consulta usa para decidir:
encolher a enumeração encolhia a parametrização e o teste seguia verde **com menos casos**
`[MEDIDO 2026-08-29: mutante K → `bash backend/scripts/test.sh` rc=0, SOBREVIVEU]`. E
`VERDICTS_SPELLED_IN_THE_SPEC` tinha **0 referências** fora da linha que a define: a constante
existia e nada a cobrava.

A contenção são duas linhas, e a segunda é a que importa:

```python
assert VERDICTS_SPELLED_IN_THE_SPEC == ("ACCEPTED_WITH_WARNING", "REJECTED")
assert KNOWN_VERDICTS - set(VERDICTS_SPELLED_IN_THE_SPEC) == {"ACCEPTED"}
```

A primeira fixa o que o documento **escreve**. A segunda diz que a entrega excede o documento em
**exatamente um** membro, e o nomeia — então **no dia em que um quarto valor entrar por
inferência, ela reprova**. Não responde à pergunta; impede que ela seja respondida por omissão.

### 🔧 Rodada de correção 2026-08-29 (`/qa` → `NEEDS_FIX`, `/review` → `COMPLIANT` com 5 avisos)

| defeito | o que era | o conserto |
|---|---|---|
| **`D2.9` media a morte só onde ela é inofensiva** | o teste só matava depois de 10 linhas legíveis, com o schema já commitado. **Antes disso** o `SIGKILL` deixa um arquivo que **existe e tem 0 B**, e a guarda perguntava `path.exists()` → `OperationalError: no such table` `[MEDIDO pelo /qa: 6 de 40 mortes entre 1 ms e 60 ms]`. Contradizia a docstring do próprio módulo | a guarda passa a perguntar a `sqlite_master`. **Arquivo vazio e arquivo ausente são o mesmo caso semântico** e os dois lêem como registro vazio. **Sem `except`:** corrupção continua estourando sozinha `[MEDIDO, n=2 estados: 0 B → `None`; corrompido → `DatabaseError: database disk image is malformed`]` |
| **o relatório deixava de ser a projeção em processo hospedeiro** | `propagate = False` protegia o registrador do CLI **e só ele**. Com `logging.basicConfig(stream=sys.stdout, level=INFO)` — o que um wrapper de `cron` faz — a 1ª linha do `stdout` virava `ingest_health_query_lida` | **duas metades.** (1) os diagnósticos das camadas caem para **`DEBUG`**, que é o nível cujo contrato é "desligado até alguém pedir" — conserta qualquer host em INFO, inclusive os que nunca rodam este CLI; (2) `main` manda o diagnóstico da aplicação para **`stderr`**, o que vale **em qualquer nível**, porque muda o destino e não o volume |
| **o `D2.9` não cobria a janela pré-`COMMIT`** | a que o `< 10` excluía por construção | teste com `SIGKILL` **real** logo após o `Popen`, e a asserção é **invariante e não resultado de corrida**: não levanta, e o que volta é um **prefixo válido** — vale para os 4 estados possíveis, em vez de falhar 85% das vezes |

**Idioma** — o `/review` mediu **82 de 100 linhas de comentário em português** nos 10 arquivos do
diff, e a regra do owner (*"Assim como docstring, todo código gerado é em inglês"*) precedeu o
commit. Traduzidos: comentários, docstrings, o identificador `inedito` → `unheard_of`, e os
nomes de evento de log (`ingest_health_query_lida` → `ingest_health_query_read`,
`..._persistido` → `..._persisted`). **Preservados por decisão, não por esquecimento:** os
rótulos `[MEDIDO]`/`[NÃO MEDIDO]`/`[INFERRED]`, as **citações literais marcadas** de ADR e de
mensagem de regra, os nomes de coluna de contrato **`janela_de_perda`** e **`window`** (vêm de
`ADR-008/D3`; renomear quebra o consumidor de `T-07.13`), e a microcopy de operador
`uso: ingest_health_cli <caminho-do-store>` — `SPEC-001` §3.8 reserva pt-BR **exclusivamente**
para microcopy. Os 2 arquivos de teste do `/qa` e os 14 `test_*` pré-existentes **não** foram
tocados: são de outro dono.

### 📎 2026-09-01 por `T-04.6` — a serialização de numeral vira UM helper, e um segundo caminho de dado ganha o mesmo teste

`CST-33`, `SPEC-001` §3.8, plano `04` item **4.12**, DoD **D4.12**. `series_key.py` e este
módulo (`ingest_record.py`) carregavam **duas cópias byte-idênticas** do mesmo serializador
JSON canônico — mesmo corpo, mesma docstring, dois lugares para divergir. A duplicação já
estava nomeada como dívida no próprio comentário de `series_key.py`: *"Unifying them is
`T-04.6`'s job … and doing it here would edit a module this task has no business touching"*.

**A unificação:** [`domain/canonical_json.py`](src/modules/sentimento/domain/canonical_json.py)
(novo, **4 linhas de código, 100% de cobertura**) — uma função só, `canonical_json()`, que os
dois módulos passam a chamar. `series_key.py` mantém `_canonical_json` como um `def` fino que
delega (não um `import ... as`), porque `mypy --strict`/`no_implicit_reexport` recusa uma
importação renomeada como export implícito, e `test_series_identity.py` importa esse nome
diretamente — sem isso o lint reprovava com `does not explicitly export attribute
"_canonical_json"` `[MEDIDO 2026-09-01]`.

**O que D4.12 já tinha e o que faltava.** O teste de `SPEC-001` §3.8 (`LANG=pt_BR.UTF-8` vs
`LANG=C`, `sha256` comparado) já existia aqui desde `T-02.3`, mas a própria docstring dele
confessava a lacuna: *"every column of the record today is int, str or null, and none of
those has ever been locale-sensitive in JSON. The day a FLOAT column enters the projection,
this test … will still pass, and it will be proving less"*. Nenhum `float` chegou a este
módulo, mas um chega em produção em `infra/quota_ramp_cli.py::emit()`
(`recoil_seconds`, `weight_per_blind_request`, …). Novo teste,
[`test_quota_ramp_locale_invariance.py`](../tests/sentimento/test_quota_ramp_locale_invariance.py),
roda o mesmo protocolo sobre um payload com `float` de verdade, chamando o `emit()` de
produção via um driver de subprocesso
([`quota_ramp_emit_driver.py`](../tests/helpers/quota_ramp_emit_driver.py)) — sem tocar
`quota_ramp_cli.py`, que é de outra task (`T-03.7`), e sem rede: `main()` daquele CLI
pede um `HttpsQuotaProbe` real, então o driver chama `emit()` direto.

**O teste tem dentes, medido e não afirmado.** Um mutante temporário (nunca commitado) trocou
o `float` do payload por `locale.format_string("%f", …, grouping=True)` dentro do driver:
sob `LANG=pt_BR.UTF-8` o teste **reprovou** (hash diferente), sob `LANG=C` continuou verde
`[MEDIDO 2026-09-01, n=1 mutante plantado e revertido, driver restaurado byte a byte]`.

`make verify`/`bash backend/scripts/test.sh`: **562 passed** (era **560**, `+2`) · cobertura
**99,43%**, domain/use_cases **100%**, infra **98,3%** (idêntico ao antes — o módulo novo tem
4 linhas e 0 ramificação). `lint.sh`: limpo. `boundaries.sh`: **2 kept, 1 broken**, estado
pré-existente do `master` (`dump_window.py`/`retention_probe.py`, `T-03.12` em review — não
tocado por esta task). `harness rules --mode sweep --changed-only`: **0 achados**.

`tasks.toml`, ledger e Jira **intocados**; nenhum `gate-record`, `approve` ou `advance`.

---

### 📎 2026-09-02 por `T-03.8` — NTP vira dependência de runtime MEDIDA, e o skew nasce persistido em `md.ingest_run` de verdade

`CST-24`, `CA-F0-8`, `[GAP G6]`, plano `03` item **3.7**, DoD **D3.10**. `SPEC-001` §5.9: NTP é
dependência de runtime de F0; monitorar o relógio local contra `/fapi/v1/time` e **persistir o
skew observado por `ingest_run`** — a tolerância NÃO se calibra aqui, `T-07.10` (fase futura) lê
a distribuição acumulada e decide o limiar. Escopo desta task: **código + probe curto**, não
deploy contínuo (`Q1`/`Q15` seguem fora do portão, `backend/scripts/test.sh` "ZERO REDE").

**`ADR-016` (relógio é capacidade) governou o desenho.** `domain/clock_skew.py`
(`ClockSkewSample`, `ServerTimeObservation`) faz só a subtração — nenhuma leitura de relógio,
nenhum socket. `use_cases/measure_clock_skew.py` é o ÚNICO ponto onde as duas capacidades se
encontram: brackets um `WallClock.now_ms()` antes e depois de um `ServerTimeSource.observe()`,
e o skew lê o relógio local no **meio-termo** do bracket — a melhor estimativa sem medir
latência de um sentido só, que este projeto não tem como medir (`/fapi/v1/time` só devolve o
relógio do servidor). `use_cases/persist_ntp_skew_run.py` monta o `IngestRun` e **recusa
persistir `weight_used` fabricado** quando o provedor não manda `x-mbx-used-weight-1m` — `D3.12`
(`T-03.7`) já mediu uma família da Binance que omite todo `x-mbx-*`, e um número inventado seria
pior que nenhuma linha.

**Os adaptadores reais:** `infra/binance_server_time_probe.py` (mesmo desenho de
`https_quota_probe.py` — `http.client` injetável, offline por padrão nos testes) e
`infra/system_wall_clock.py` (`time.time()`, wall clock e não `monotonic()`, porque o que
importa aqui é comparar contra uma autoridade externa). **O probe curto:**
`infra/ntp_skew_probe_cli.py`, `--store <sqlite>` obrigatório — uma medição que ninguém persiste
não é o que `D3.10` pede.

**`T-03.8` é a primeira task a escrever em produção através de `SqliteIngestRecordStore`**
(o comentário do próprio módulo, de `T-01.1`, já nomeava esta task como a dona dessa dívida).
5 corridas reais contra `fapi.binance.com` — `[MEDIDO 2026-09-01T23:05Z]`: `clock_skew_ms` entre
`-73` e `-23` (relógio local atrás do servidor), `weight_used` **lido do header a cada chamada**
(`1..5`, nunca hardcoded), todas `ACCEPTED`, `http_status=200`. `ingest_health_query` — a MESMA
função que `T-07.13` vai consumir — já lê essas 5 linhas de volta hoje: `n_runs: 5, n_gaps: 0`.
Evidência em
[`docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/`](../docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/README.md).
**O que isto NÃO prova:** a distribuição de `D3.10` pede `>= 7 dias de runs` em produção — 5
pontos de terminal provam o MECANISMO, nunca o REGIME.

**`make natureza`** (`ADR-016`, o portão que barra leitura de relógio em `domain`/`use_cases`):
`0 leitura(s)` sobre um universo de **30 arquivos** de `domain/`+`use_cases/` `[MEDIDO]`.
**`boundaries.sh`: 3 kept, 0 broken** (os 3 contratos, incluindo o de `ADR-016`). `lint.sh`:
limpo (`ruff` + `mypy --strict`). `harness rules --mode sweep --changed-only`: **0 achados**,
rodado com os arquivos `git add`-ados (`T-03.10` já registrou que o sweep é cego a arquivo não
rastreado). `bash backend/scripts/test.sh`: **649 passed** (era **617**, `+32`)
`[MEDIDO 2026-09-01]` · cobertura **99,13%**, `domain` **100,0% (1133/1133)**, `use_cases`
**100,0% (253/253)**, `infra` **97,6% (922/945)** — a única linha não coberta de produto é
`infra/ntp_skew_probe_cli.py::main()` (composição real, o mesmo padrão descoberto de
`quota_ramp_cli.py::main()`), e o restante do déficit de `infra` é código pré-existente de
outras tasks.

`tasks.toml`, `tasks_review.md` e o plano `03` **intocados por esta task**: os três já
descreviam corretamente o DoD antes de eu começar — nenhuma linha precisava mudar para que o
critério ficasse verdadeiro. `janela_de_perda` continua `null` (fora de escopo, `T-07.12`).
Ledger e Jira **intocados**; nenhum `gate-record`, `approve` ou `advance`.

---

## 📦 A fila de ETL do dump, retomável e com profundidade como parâmetro — `T-03.10` (`CST-26`, `CA-F0-5`, `SPEC-001` §5.8, plano `03` itens 3.11+3.14, DoD `D3.1`)

**Nenhum segundo mecanismo de retomada nasceu aqui.** `EtlBacklog` + `drain` + `JsonlCheckpoint`
já provavam *"não duplica, não perde"* sob `SIGKILL` real; esta task aponta esse mecanismo para
uma **janela do dump enumerada a priori a partir de uma PROFUNDIDADE**. Duas respostas para
*"o que ainda falta"* seria uma a mais, e no dia em que discordassem nenhuma valeria.

### As peças, e a camada de cada uma

| peça | camada | o que ela é |
|---|---|---|
| `domain/dump_window.py` | `domain` | a janela **fechada e enumerada a priori** — `DumpDataset`, `DumpPartition`, `enumerate_window`, e `backlog_of`, que devolve o `EtlBacklog` que o `drain` já consome |
| `domain/retention_probe.py` | `domain` | o `curl -sI` de §5.8: **enumera o que sondar** e **classifica o que voltou**. Zero rede |
| `infra/head_probe_log.py` | `infra` | a costura entre o `curl` (cron) e a classificação offline: parser de `curl -sI` + leitor do JSONL |
| `infra/dump_ingest_worker.py` | `infra` | o **primeiro chamador de produção** de `ingest_verified` e o **primeiro `LineSink` de produção** |
| `infra/dump_etl_cli.py` | `infra` | **a raiz de composição** — o achado `H` |

### `Q18` não é gate, é default — e a afirmação do owner virou teste

> **(d) RELÓGIO: NÃO.** *…a fila é retomável e a profundidade é PARÂMETRO dela* ⇒ começar por 30
> dias e estender depois **não é retrabalho**, é a mesma fila com outro limite.
> `[PREMISSA-OWNER: citação literal, via `tasks_review.md` §7/D-5]`

Isso só é verdade se aprofundar **preservar** as chaves já drenadas — senão o checkpoint fica
cheio de chaves fora da janela e `EtlBacklog.pending` levanta `CheckpointOutsideWindowError`.
`test_extending_the_depth_drains_only_what_the_deeper_window_added` fixa isso: 10 → 20 dias
drena **exatamente os 10 novos**, e os conjuntos são disjuntos.

### Os DOIS portões, e por que o segundo **nunca recusa**

`ADR-014/D3b` (status **proposto**) decide a forma, e ela é a resposta ao achado mais importante
do dia: **`SPEC-001` §5.8 infere que `.CHECKSUM` é obrigatório a partir de um caso que o
`.CHECKSUM` NÃO PEGA.**

| portão | quando | testemunha | veredito |
|---|---|---|---|
| **P1** | antes da 1ª linha | classe **T** — `.CHECKSUM` | **recusa**, zero linhas escritas |
| **P2** | no nível da **janela** | classe **O** — o último período antes de um `404` | **avisa e registra, NUNCA recusa** |

O objeto de `monthly/bookTicker` 2024-04 passa por **cinco** portões — `200`, `content-length`,
`sha256sum -c` → **SUCESSO**, `unzip -t` → **No errors detected**, e a invariante de janela de
§5.7 — cobrindo **0,942 %** do mês que o nome dele declara `[MEDIDO, `ADR-014`, n = 1 objeto de
37.761.761 B]`. **Só a cobertura da janela morde, e ela não é nenhum dos cinco.**

**P2 não recusa porque as 6,781 h de abril são dado REAL.** Recusá-las plantaria a generalização
de fail-closed que `SPEC-001` §5.6 existe para impedir. *O objetivo é impedir o SILÊNCIO, não a
escrita.* — `test_a_suspect_period_is_ingested_with_a_warning_and_is_never_refused`.

### `bookDepth` não tem prefixo `monthly`, e a palavra "mensal" é a armadilha

§5.8, terceira linha `[MEDIDO, CST-5]`: *"um ETL que assuma mensal **quebra**"*. O item 3.14 diz
*"`curl -sI` **mensal**"* — e essa palavra é a **cadência da sonda**, não a **granularidade do
objeto**. `aggTrades` é sondado `monthly`, `bookDepth` `daily`; pedir `monthly` para `bookDepth`
**recusa na construção**, em vez de gerar um `404` que se leria como *"o balde apagou"*.

### O que o vocabulário desta task deliberadamente NÃO reusa

Os achados de retenção **não são `verdict`**. `verdict` é o conjunto fechado de `md.ingest_run`,
a SPEC é dona (`ADR-014/D2a`), e **`ADR-014` está `proposto`** — escrever `ACCEPTED_WITH_WARNING`
aqui seria adotar enumeração não ratificada e pôr um segundo escritor num vocabulário que esta
task não possui.

### A bancada de mutação — `n=12`, e ela sabe dizer INERTE e AMBÍGUO

Cada mutante com a **âncora conferida antes** (0 ocorrências ⇒ `INERTE`, >1 ⇒ `AMBÍGUO`),
revertido e o arquivo **reconferido por `sha256`** antes do seguinte, com `python -B` +
`PYTHONDONTWRITEBYTECODE=1` e `__pycache__` **apagado antes de cada rodada**
`[MEDIDO 2026-08-29; quem morde: `.venv/bin/python -B -m pytest -x -q`]`:

| # | mutante | resultado |
|---|---|---|
| 1 | `bookDepth` passa a aceitar o prefixo `monthly` | **rc=1** |
| 2 | a janela passa a ser enumerada do mais NOVO para o mais velho | **rc=1** |
| 3 | a profundidade perde um dia (off-by-one na janela fechada) | **rc=1** |
| 4 | a regra do vizinho some: `404` seguinte deixa de tornar o período suspeito (`A7`) | **rc=1** |
| 5 | `bookDepth` passa a ser sondado como `monthly` | **rc=1** |
| 6 | o `.partial` deixa de ser removido quando a borda recusa | **rc=1** |
| 7 | o período suspeito passa a ser **RECUSADO** em vez de avisado (`ADR-014/D3b`) | **rc=1** |
| 8 | o checkpoint volta a coagir a chave com `str()` (a dívida do `{"key": null}`) | **rc=1** |
| 9 | a detecção de chave repetida exige 3 e não 2 ocorrências | **rc=1** |
| 10 | os achados de retenção passam a ser gravados **depois** da drenagem | **rc=1** |
| 11 | o parser de `HEAD` passa a ler o **primeiro** status em vez do último | **rc=1** |
| 12 | períodos `ABSENT` deixam de sair da janela de trabalho | **rc=1** |

**`n=12` mutantes · 12 morderam · 0 sobreviveram · 0 inertes · 0 ambíguos.**

### ⚠️ Uma DÍVIDA JÁ DOCUMENTADA do portão de regras, e a forma nova que esta task acrescenta

**`harness rules --mode sweep --changed-only` é CEGO a arquivo NÃO RASTREADO.** Medido plantando
`print(...)` — que viola `core.print-statement`, severidade `block` — e variando **só** o estado
do arquivo no git `[MEDIDO 2026-08-29, n=3 estados, mutante revertido e conferido por `sha256`]`:

| estado do arquivo | comando | resultado |
|---|---|---|
| **não rastreado**, com o `print` | `harness rules --mode sweep --changed-only` | **0 achados, `rc=0`** — **`[CEGO]`** |
| **não rastreado**, com o `print` | `harness rules --mode sweep` (completo) | **1 achado, `rc=1`** — `[MORDE]` |
| **staged** (`git add`), com o mesmo `print` | `harness rules --mode sweep --changed-only` | **`rc=1`**, nomeia `dump_etl_cli.py:165` — `[MORDE]` |

**⚠️ ENQUADRAMENTO CORRIGIDO NO CICLO 2 — isto NÃO é achado novo.** A cegueira já está escrita
neste repositório, em `harness.toml:470-472`: *"NÃO cito `--changed-only`: ele é
`git diff --name-only HEAD` (`lib/runner.py:88`) e portanto CEGO a arquivo novo não rastreado"*.
Apresentá-la como descoberta foi erro meu de leitura. **O que esta task acrescenta é uma FORMA
NOVA da mesma dívida** — não "arquivo novo numa task cujo universo é todo novo", mas **arquivo
não rastreado convivendo com arquivos rastreados**, em que o portão devolve `rc=0` tendo varrido
os rastreados e ignorado os novos, o que **parece** medição.

**Consequência para o procedimento de qualquer builder:** uma task que **cria arquivos** e roda
`--changed-only` antes de `git add` recebe **verde falso**. Não é hipótese — foi exatamente o que
esta task recebeu na primeira execução do portão, e só apareceu porque a bancada de mutação foi
rodada **contra o próprio portão**. O `rc=0` reportado no gate desta task é o de **depois** do
`git add`, com os 15 arquivos no universo. **Não consertei o `harness`** — é ferramenta de
plugin, fora desta árvore e fora do escopo desta task; fica registrado com o comando que o
reproduz.

### O que esta task NÃO fecha, nomeado

- **Não baixa nada.** O espelho do balde em `<workdir>/mirror/` é alimentado por quem busca;
  **`T-07.1`** é dona do paginador correto e da listagem S3 por `NextContinuationToken`.
- **Não escreve `md.ingest_run` / `md.ingest_gap`.** A casa durável de um achado de classe O
  **é** `md.ingest_gap`; o escritor de produção chega com **`T-03.8`**. Até lá o achado é durável
  em `findings.jsonl` — segundo-melhor **escrito como tal**, não apresentado como o desenho.
- **Não lê o conteúdo do objeto.** Cobertura medida contra os *timestamps* de dentro do CSV exige
  unzip + parse, e é outra task. Na resolução de `HEAD`, a testemunha de classe O é a regra do
  vizinho — e é só isso que está implementado. **O `n_missing` real continua `[NÃO MEDIDO]`.**
- **A razão de tamanho é ALARME e não `n_missing`** — `177,8x` contra déficit real de `106,2x`
  `[MEDIDO, `ADR-014/D3d`]`. `size_ratio_alarm` devolve um `float` e se chama `alarm` por isso.
- **Não decidiu a testemunha das fontes que não são o dump.** `ADR-014/D3` decide por fonte e uma
  linha dela é **`[NÃO SEI]`** (`!forceOrder@arr`, sem testemunha de integridade hoje). O registro
  geral por fonte nasce quando `ADR-014` for aceita.
  **⚠️ ERRATUM 2026-08-29 (ciclo 2) — a redação anterior desta linha era FALSA na metade que ela
  usava como argumento.** Ela dizia que o roteamento é *"estrutural e restrito ao dump: ela só
  aceita um `DumpDataset`"* e que *"não há linha de política que alguém possa apagar"*. O `/qa`
  refutou por medição: `DumpIngestWorker.process(self, key: str)` recebe **`str`**, e uma fonte
  REST plantada nessa borda passa por **`ruff`, `mypy --strict` e `import-linter`** sem que
  nenhum portão estático morda `[MEDIDO 2026-08-29]`. O que sobrevive: **pela `run()` não há
  caminho** — `dataset_by_name` só resolve `{aggTrades, bookDepth}`. **A barreira real É uma
  linha** — `DATASETS_BY_NAME` — **e ela não tinha teste**: acrescentar `"exchangeInfo"` deixava
  a suíte inteira verde (mutante `M08`). Coberta agora por
  `test_the_dataset_vocabulary_is_exactly_the_two_the_dump_publishes`.

## 📡 O coletor `premiumIndex` — funding estimado, sem histórico em fonte nenhuma — `T-03.5` (`CST-21`, `CA-F0-1b`, plano `03` item 3.3)

**A ausência de parâmetro é a garantia.** `GET /fapi/v1/premiumIndex` não tem `startTime`,
`endTime` nem `limit` documentados — não existe, em fonte nenhuma, um jeito de pedir o funding
estimado de um dia em que ninguém estava ouvindo. `domain/premium_index_batch.py` reflete isso
ao pé da letra: `PREMIUM_INDEX_ENDPOINT` é uma string sem `?`, e nenhuma função deste módulo
aceita um argumento de tempo para construir uma. A série nasce no primeiro `poll` e nunca antes
— não é uma regra que um `if` aplica, é uma requisição que não pode ser escrita.

### As peças, e a camada de cada uma

| peça | camada | o que ela é |
|---|---|---|
| `domain/premium_index_batch.py` | `domain` | `PremiumIndexReading` (campos numéricos crus, nunca `float`); `parse_premium_index_batch` — valida a forma, recusa `symbol` repetido (chave natural do batch); `PREMIUM_INDEX_BATCH_WEIGHT_DECLARED = 10`, reproduzido pelo probe abaixo |
| `use_cases/collect_premium_index.py` | `use_cases` | `collect_premium_index_once` — um ciclo fetch→parse→persiste, nunca parcial; `PremiumIndexCycleStage` separa `TRANSPORT`/`DECODE`/`PAYLOAD`/`WRITTEN`; `received_at` é **injetado**, nunca lido de `time`/`datetime` aqui |
| `infra/premium_index_http_client.py` | `infra` | reusa `ConnectionFactory`/`flatten_headers`/`open_https_connection` de `https_quota_probe.py` em vez de redeclarar o mesmo Protocol de socket; a única diferença é que o **corpo** da resposta é mantido, não drenado |
| `infra/premium_index_jsonl_sink.py` | `infra` | armazenamento cru, append-only: **uma linha por símbolo**, `flush`+`fsync` uma vez por ciclo (a mesma garantia de `jsonl_checkpoint.py`, medida em `tests/sentimento/test_infrastructure_durability.py`) |
| `infra/premium_index_probe_cli.py` | `infra` | o comando reprodutível de `CA-F0-1b`: `N` ciclos consecutivos, delta de peso reportado com a fórmula de veredito (`CONFIRMADO`/`DIVERGENTE`), nunca um número solto |

### O que esta task NÃO faz — plano `03`, seção "Não faz"

Não aplica shift, não normaliza, não pluga em `SeriesKey`/`SeriesRow` (isso é `T-04.1`/`T-04.2`,
fase `04`). Este coletor grava exatamente o que `parse_premium_index_batch` aceitou, ao lado de
`received_at` — nada além disso.

### `CA-F0-1b` reproduzido ao vivo, com o comando literal

Código real, não só `curl` — `infra/premium_index_probe_cli.py` chamado como CLI, dois ciclos
com 1 s de intervalo, contra o endpoint público (zero chave):

```
$ python -m src.modules.sentimento.infra.premium_index_probe_cli \
    --cycles 2 --interval-seconds 1.0 \
    --evidence backend/.probe-evidence/premium_index_probe.jsonl \
    --summary backend/.probe-evidence/premium_index_probe_summary.json

ciclos executados: 2
  received_at=1788304122239 estagio=WRITTEN n_simbolos=888 peso=10 status=200
  received_at=1788304123653 estagio=WRITTEN n_simbolos=888 peso=20 status=200
delta(s) de peso entre ciclos consecutivos: [10] (declarado CA-F0-1b: 10/chamada) -> CONFIRMADO
$ echo $?
0
```

`[MEDIDO 2026-09-01]`: **888 símbolos** no universo desta data — não 875. A contagem **drift**
é o mesmo fenômeno que `docs/decisoes-do-owner.md:364` já registrou entre `exchangeInfo` e
`premiumIndex` num único instante (872 vs 875); por isso `parse_premium_index_batch` nunca fixa
a contagem como invariante, só a ausência de `symbol` repetido. O que `CA-F0-1b` declarava —
**peso 10 por chamada, independente do universo** — se confirma de novo: `x-mbx-used-weight-1m`
saiu de 10 para 20 entre os dois ciclos, delta exato.

A evidência bruta (`backend/.probe-evidence/`) não é versionada — mesma razão de `data/`
(`.gitignore`): é dado de mercado, reproduzível pelo comando acima a qualquer momento.

**Isto é probe curto, não deploy contínuo** (decisão do owner, sem frontend ainda): o CLI acima
é uma composição de `collect_premium_index_once`, chamada por um humano, um número declarado de
vezes. Nenhum `cron`, `systemd` ou scheduler foi acrescentado por esta task.

### 📎 2026-09-01 por `T-03.4` — o agregado de bucket `q`/`nq`, e `QF-6` provado sobre `data/` real

`ADR-001`/6, `SPEC-001` §1.4 (`CL-5`), plano `03` item 3.5, DoD `D3.5`+`D3.7`+`D3.8`. **A task de
maior custo de relógio do projeto** — `nq` vive numa janela REST de 48 h e em nenhum histórico
(`GET /fapi/v1/aggTrades` em T-48h → `200` com `nq`; em T-49h → `400 -4166`). O escopo desta
rodada é DECLARADAMENTE código + prova de mecanismo sobre fixture — não deploy contínuo: sem
frontend, não há consumidor para o dado ao vivo ainda (decisão do owner), e o item pede o código
pronto para ligar, não ligado.

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/aggtrade_bucket_aggregate.py` | `domain` | `AggTradeBucketTrade` (as DUAS quantidades da mesma trade); `aggregate_by_bucket` (fold de 1 min: `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max`); `require_contiguous` (delega em `aggtrade_contiguity.py`, não duplica unicidade/contiguidade); `detect_bucket_agg_id_gaps` (a costura ENTRE fixtures, no grão do bucket) |
| `src/modules/sentimento/domain/qnq_divergence.py` | `domain` | `QnqTrade`/`measure_qnq_divergence` — `QF-6`: `count(q≠nq)/n` e déficit em bp, por `(symbol, day)` |
| `src/modules/sentimento/infra/aggtrade_csv_reader.py` | `infra` | **+`read_aggtrade_bucket_trades`** (dump replay: `quantity`+`is_buyer_maker`, `raw_nq=None` sempre — `CL-5` estrutural, o dump nunca teve a coluna) |
| `src/modules/sentimento/infra/aggtrade_rest_snapshot_reader.py` | `infra` | **novo** — lê `data/binance/rest/nq_*.json` (a evidência de `ADR-001`) em `QnqTrade`, um dia por `T` |
| `tests/sentimento/test_aggtrade_bucket_aggregate.py` | — | **15 testes** sintéticos: os oito termos por bucket, `nq` ausente vs PARCIAL (recusa — `PartialNqBucketError`), delegação de contiguidade, a costura entre fixtures |
| `tests/sentimento/test_aggtrade_bucket_aggregate_fixtures.py` | — | **5 testes** sobre os primeiros 20.000 trades reais de `BTCUSDT-aggTrades-2026-08-21.csv` (md5 `31f5b006…`), incl. o falsificador de `D3.5` — "deletar 1 linha ⇒ reprova" — removendo uma linha do MEIO do arquivo (não a borda de um bucket, o caso que um `min`/`max` por bucket sozinho não pegaria) |
| `tests/sentimento/test_qnq_divergence.py` | — | **12 testes**; 5 sobre a evidência REAL de `ADR-001` (`data/binance/rest/nq_{BTC,ETH,SOL,XRP,DOGE}USDT.json`), o resto sobre o agrupamento `(symbol, day)` em timestamps sintéticos |
| `tests/sentimento/test_nq_bucket_capture_boundary.py` | — | **3 testes**: liga o agregado novo à borda `SEM_FONTE` de `T-04.4` (`as_of` + `first_capture_at`) |

**`D3.7` reproduzido byte a byte sobre a evidência que `ADR-001` já cita.**
`data/binance/rest/nq_DOGEUSDT.json` (md5 `44206adf…`, 1000 trades de UM `GET /fapi/v1/
aggTrades`): **16/1000 divergentes, déficit 80,56 bp** — os mesmos dois números do ADR e de
`docs/medicao-coinalyze.md`. Os outros quatro símbolos do conjunto declarado (BTC/ETH/SOL/XRP):
**0/1000, 0,00 bp**. `[MEDIDO 2026-09-01: bash backend/scripts/test.sh -k test_qnq_divergence]`.

**O que NÃO foi medido, e por quê — nomeado, não escondido.** `D3.7` pede "≥ 7 dias × conjunto
declarado"; a evidência real disponível hoje é UMA janela de 251 s por símbolo (mín/máx do
próprio campo `T`), nunca 7 dias e nunca atravessa meia-noite UTC
(`test_d3_7_the_snapshot_never_crosses_a_utc_day_so_it_is_one_group_per_symbol`). A mecânica de
agrupar por `(symbol, day)` está provada — sobre timestamps SINTÉTICOS, porque a evidência real
não tem uma segunda data para exercitá-la. **Isto não é lacuna escondida: é exatamente o que o
handoff desta task já nomeava** — "não é medível hoje em regime real, precisa de dias rodando".
`D3.9` (o WS `<symbol>@aggTrade` carrega `nq`?) segue `[NÃO MEDIDO]`, herdado de
`T-03.1`/`docs/medicao-ws-aggtrade-nq.md` (0 eventos em 2 tentativas registradas; a regra de
parada daquele documento pede uma 2ª tentativa independente antes de tratar como medido). Esta
task não reabriu rede — `test.sh` é ZERO REDE por contrato — e não tinha mandato para tanto.

**`D3.5`: a "camada nova" é uma DELEGAÇÃO, não um segundo motor.** `require_contiguous` constrói
a view estreita `AggTradeTick` (`agg_id`+`transact_time_ms`) e chama `aggtrade_contiguity.
require_unique_agg_ids`/`detect_agg_id_gaps` (`T-04.3`, já em `master`) sem reimplementar
unicidade nem contiguidade — a mesma instrução do handoff, "não duplique a lógica que já existe
lá". Provado sobre os primeiros 20.000 trades reais de `BTCUSDT-aggTrades-2026-08-21.csv`: **0**
saltos internos; deletando a linha do meio, o detector acusa
`[MEDIDO 2026-09-01: bash backend/scripts/test.sh -k test_aggtrade_bucket_aggregate_fixtures]`.
**A escala de milhões de linhas não foi reprocessada por este módulo** — reler as mesmas
8.873.078 linhas que `T-04.3` já provou custaria `[MEDIDO 2026-09-01]` **68 s só para o primeiro
dos 3 arquivos**, com `Decimal`, por zero informação nova (a MESMA função de `T-04.3` é chamada,
inalterada); a delegação evita pagar esse custo duas vezes — o comando `bash backend/scripts/
test.sh -k test_aggtrade_contiguity_fixtures` já paga a prova de escala, e continua verde.

**`D3.8`: a borda `SEM_FONTE` já existia (`T-04.4`) — esta task liga o agregado novo a ela, não
a reimplementa.** `test_nq_bucket_capture_boundary.py` prova que um bucket dobrado de trades
"tipo dump" (`raw_nq=None` sempre) não produz observação NENHUMA sob `quantity_field=nq` — o
weld fica IMPOSSÍVEL DE CONSTRUIR, mais forte que "a leitura recusa" — e que um bucket "tipo
captura ao vivo" (as duas quantidades) atravessa a borda de `first_capture_at` normalmente, sem
duplicar os testes exaustivos de `test_as_of_accessor.py::test_d4_6_c_a_read_under_nq_before_
the_first_capture_is_no_source_and_never_welds_with_q` /
`test_after_the_first_capture_the_nq_series_stops_being_no_source`.

**A convenção `tx`/`btx` não foi inventada — é a que `docs/medicao-coinalyze.md` já mediu e
publicou** (reconciliação sobre 699 buckets reais: `tx` == nº de aggTrades do dump, `btx` == nº
com `is_buyer_maker=false`, 699/699 exato nos dois). `is_buyer_maker` segue a MESMA convenção de
sinal de `cvd.py` (comprador MAKER ⇒ vendedor foi o agressor).

**3 mutações aplicadas manualmente e revertidas, as 3 morrem:** inverter `is_buyer_maker` no fold
(`sum_q_buy`/`btx` trocam de lado) → `test_a_single_bucket_folds_the_eight_terms_of_adr_001_6`
reprova; inverter o sinal de `deficit_bp` (`sum_nq - sum_q` em vez de `sum_q - sum_nq`) →
**2** testes reprovam, incluindo o da evidência REAL de DOGEUSDT; afrouxar a recusa de bucket
parcial para tolerar `tx - 1` → `test_a_partial_bucket_refuses_instead_of_guessing_a_semantics`
reprova. Os três arquivos, `diff` byte-idêntico ao original depois de revertidos
`[MEDIDO 2026-09-01]`.

**Os seis portões, neste worktree:** `lint.sh` limpo (`ruff` + `ruff format` + `mypy --strict`);
`boundaries.sh` — **3 kept, 0 broken**; `natureza.sh` — universo de **29** arquivos em
`domain`/`use_cases`, **0** leituras de relógio; `test.sh` — **652 passed** (era 617 em
`master@634833b`), cobertura `domain 100,0% (1250/1250)` · `use_cases 100,0% (220/220)` ·
`infra 97,8% (872/892)`, total **99,09%**, todas acima do piso
`[MEDIDO 2026-09-01: bash backend/scripts/test.sh]`; `harness rules --mode sweep --changed-only`
— **0 achados** sobre os 8 arquivos desta task.

**Um achado do próprio portão, durante esta rodada.** A primeira versão de um comentário em
`aggtrade_bucket_aggregate.py` citava o NOME do arquivo `as_of_accessor.py` em prosa — não um
`import` — e isso bastou para `test_as_of_is_the_single_reader.py::test_no_production_module_
imports_this_accessor_yet_and_that_is_recorded_not_claimed` reprovar: aquele teste varre
`backend/src` por OCORRÊNCIA TEXTUAL da string `"as_of_accessor"`, deliberadamente mais largo que
um `import`, para forçar qualquer menção a ser revista. Corrigido reformulando o comentário sem a
citação literal do nome do arquivo — nenhuma linha de comportamento mudou, só a prosa.

## 📎 2026-09-01 por `T-02.2` — o one-shot Coinalyze `daily`, nascendo em quarentena, e o broker cego

`CA-F0-13` / `CA-F3-9` / `avaliacao:A3` (`SPEC-001` §5.2, plano 02 itens 2.3+2.4). Sete arquivos
novos, nenhum existente tocado:

| camada | arquivo | papel |
|---|---|---|
| `domain` | `coinalyze_daily_series.py` | tradução de símbolo, montagem do path, parse de `{t, o,h,l,c}`/`{t,l,s}` cru, e o piso `CA-F0-13` (OI ≥ 2.400/≤ 2020-01-21; liq ≥ 700/≤ 2024-08-26) |
| `domain` | `quarantine_terms.py` | o predicado de três termos de `SPEC-001` §5.2, e a constante `COINALYZE_ONE_SHOT_TERMS` (label_shift + unit resolvidos, `available_at` sempre ausente enquanto `Q19` não fecha) |
| `domain` | `local_quota_broker.py` | o broker CEGO: intervalo FIXO (`60 / 40 = 1,5 s`), nunca acelera, nunca lê header — porque não há header (`domain/quota_bucket.py`, já mediu `COINALYZE` como `BLIND`) |
| `domain` | `quarantined_series_entry.py` | amarra pontos + veredito + termos de quarentena numa linha gravável, `available_at` derivado de `quarantine`, nunca hardcoded duas vezes |
| `infra` | `coinalyze_history_client.py` | o irmão de `https_quota_probe.py` que devolve o CORPO em vez de descartá-lo — reaproveita conexão, autenticação e cabeçalhos do módulo de `T-03.7`, não reabre `http.client` |
| `infra` | `sqlite_series_quarantine_store.py` | a tabela `series_quarantine`, com `read_promoted()` = a query que um `backtest` futuro rodaria (`available_at IS NOT NULL`) |
| `use_cases` | `capture_coinalyze_daily_series.py` | orquestra: 2 chamadas por símbolo (OI, depois liquidação), pacetes pelo broker, nunca aborta a varredura por um símbolo ruim (`SPEC-001` §5.6, mesmo argumento do survivorship) |
| `infra` | `coinalyze_one_shot_cli.py` | a bancada — só ela abre o `http.client` real, nenhum portão a chama |

### `D2.6`, o falsificador da fase, medido nos dois sentidos

`plano 02`: *"leitura de `backtest` sobre as duas séries recém-capturadas devolve ZERO
linhas"*. `backtest` não existe como módulo (e `import-linter` já o proíbe como import de
`sentimento` — contrato "Fronteira de contexto"), então `read_promoted()` é a forma que um
consumidor futuro chamaria: filtra `available_at IS NOT NULL`.
`test_sqlite_series_quarantine_store.py::test_d2_6_the_two_freshly_captured_series_read_zero_promoted_rows`
grava as duas séries (OI com 2.500 pontos, liquidação com 730) para `BTCUSDT` e confirma **zero
linhas** nas duas leituras. **E o lado que prova que a query não está vazia por estar morta**:
`test_the_query_is_not_vacuously_empty_a_planted_promoted_row_is_read_back` escreve, por baixo
de `record()`, uma linha com `available_at` preenchido e confirma que ELA volta — sem esse teste,
um `read_promoted` que sempre devolvesse `()` por engano (ex.: `WHERE 1 = 0`) passaria no mesmo
verde.

### O broker: por que a pauta é intervalo FIXO, e a aritmética que ele reproduz

`domain/local_quota_broker.py` não acelera como `domain/ramp_plan.py` (`T-03.7`) — a rampa existe
para ACHAR o teto; este broker existe para NUNCA o alcançar, porque um `429` no meio de 1.140
chamadas não avança medição nenhuma, só atrasa a varredura. `interval_seconds = window_seconds /
calls_per_window`, aplicado igual à primeira e à última chamada.
`test_the_declared_broker_reproduces_the_published_cost_of_the_one_shot` reproduz `1.140 × 1,5 s
≈ 1.710 s ≈ 28,5 min` do `docs/decisoes-do-owner.md` — com uma diferença de **um intervalo**
(1.708,5 s medido contra 1.710 s do napkin math do PM), porque este módulo conta PAUSAS (`n - 1`
para `n` chamadas — mesma assimetria que `test_quota_ramp_bench_offline.py` já nomeia para o
laço de carga da rampa), e o número publicado multiplica `n × intervalo`. O teste documenta a
diferença em vez de forçar a igualdade exata contra um número aproximado (o próprio
`docs/decisoes-do-owner.md` usa `~`).

### Escopo que este task NÃO fecha, nomeado

- **Não descobre o universo de símbolos.** `docs/decisoes-do-owner.md` custeia a varredura em
  ~570 símbolos (perpétuos `TRADING` do `exchangeInfo`), mas nem `CA-F0-13` nem `avaliacao:A3`
  atribuem a esta task a curadoria desse universo — é `T-02.1` (snapshot de `exchangeInfo`) ou um
  catálogo futuro. `coinalyze_one_shot_cli.py` recebe a lista de símbolos como argumento; nada
  aqui presume `/future-markets` nem inventa um schema de catálogo que este task não mediu com
  chave real além dos 11 `[MEDIDO]` de `docs/medicao-coinalyze.md`.
- **Não constrói o mecanismo de promoção.** O handoff desta task é explícito: desenhar o esquema
  pensando no consumidor futuro (`T-03.11`), sem construir a promoção aqui. `read_promoted()` é a
  LEITURA que a promoção teria de satisfazer; nada neste código escreve `available_at`.
- **Não persiste `md.ingest_run`/`md.ingest_gap`.** Isso é plano 02 itens 2.6+2.7, `T-02.3`.

### Se a chave existir: o que muda, e o que não muda

`.env` foi verificado por presença de `COINALYZE_API_KEY`, nunca lido nem citado em texto (`grep`
sobre o CONTEÚDO do arquivo é bloqueado pela política de permissão desta sessão, por desenho — a
verificação usada foi `os.path.isfile` + varredura de linha por prefixo, sem nunca imprimir o
valor). A chave **existe** nesta sessão. O código acima é testado inteiramente contra
fixture/mock (rede zero, como toda a suíte) — a chamada REAL ao vivo (o "one-shot" de fato, ~570
símbolos × 2 séries) é uma operação separada, de custo declarado ~28,5 min, que **não** é
disparada pelo portão de teste e não deve ser repetida por engano.

## 🔌 Política de reconexão POR CLASSE de stream, Classe B — `T-03.3` (`CST-19`, `ADR-004` gate de F0, plano `03` item 3.2, DoD `D3.6`)

Implementa a Classe B de `ADR-004` (`!forceOrder@arr`, sem identificador de sequência e sem
reposição): sobreposição obrigatória na reconexão (B1), chave natural declarada para dedupe (B2)
e taxa de colisão publicada com a direção do viés escrita (B3). **Não constrói** a Classe A
(`aggTrade`) nem a integração contínua — o handoff desta task é explícito: desenhar pensando no
sucessor, sem construir a integração aqui.

### As peças, e a camada de cada uma

- **`domain/force_order_natural_key.py`** — `ForceOrderNaturalKey`, a chave `(symbol, side,
  price, orig_qty, trade_time)` que B2 declara, lida SÓ desses cinco campos do `raw` (nunca do
  restante do payload); `extract_force_order_natural_key` levanta `ForceOrderKeyExtractionError`
  com contexto para qualquer texto que não caiba nesse formato — nunca engolida em silêncio.
  `trade_time_utc_date` converte `trade_time` (epoch ms) no dia UTC, determinístico via
  `tz=UTC` explícito (nunca lê o fuso da máquina).
- **`domain/force_order_collision_accounting.py`** — `count_daily_collisions` bucketiza por
  `(symbol, day)`; uma chave repetida vira `collisions` e **nunca** soma de novo em
  `total_events` — é B3 ("subcontagem, nunca supercontagem") feito mecânico, não só documentado.
  `COLLISION_BIAS_DIRECTION` carrega a frase literal da ADR, publicada em TODO relatório.
  `d3_6_universe_met` diz se o universo declarado (`≥ 30` dias `× ≥ 20` símbolos) já foi
  atingido — hoje **não** é, e o módulo nunca finge que é.
- **`domain/force_order_reconnection_overlap.py`** — `require_overlap` levanta
  `ReconnectionGapError` se a conexão antiga fechar ANTES da primeira mensagem da nova — B1 como
  invariante que reprova, não como frase de comentário.
- **`use_cases/reconnect_force_order_stream.py`** — `perform_overlap_handoff` executa a
  ORDEM que B1 exige (abre a nova, lê a primeira mensagem, SÓ ENTÃO fecha a antiga) sobre
  `MessageSource` de verdade; `reconnect_and_key` compõe o handoff com a chave B2, pronto para
  alimentar `count_daily_collisions`.
- **`infra/force_order_collision_report_cli.py`** — lê o(s) arquivo(s) de evidência que
  `force_order_raw_recorder.py` (`T-03.2`) já grava, publica o relatório e o resumo JSON com a
  taxa de colisão por `(symbol, day)`, a frase de viés SEMPRE presente, e um veredito honesto
  sobre `D3.6` (atendido ou não). Uma linha de evidência corrompida (JSON inválido) É RECUSADA
  (`MalformedEvidenceLineError`), nunca lida por cima em silêncio; uma linha que não tem os
  campos de B2 é contada em `unkeyable_raw_lines`, nunca descartada sem registro.

### `D3.6` não é medível em regime real hoje — a MECÂNICA está pronta, a leitura é o que falta

O DoD declara isso explicitamente: o universo exigido (`≥ 30` dias `× ≥ 20` símbolos) precisa de
dias de captura ao vivo que este repositório ainda não tem. Esta task prova a MECÂNICA sobre uma
simulação de reconexão com overlap conhecido — `FRAME_A`/`FRAME_A_DUP` no bench (mesma chave B2,
`raw` diferente, do jeito que uma liquidação genuinamente re-servida por duas conexões chegaria)
produz `total_events=1, collisions=1` de ponta a ponta, do handoff até o relatório publicado. No
dia em que o coletor acumular evidência real, publicar `D3.6` é rodar
`force_order_collision_report_cli.py` sobre os arquivos — nenhuma lógica nova.

### A bancada — falsificador medido, não afirmado

`test_the_falsifier_removing_the_duplicate_makes_the_collision_disappear` remove a duplicata do
cenário acima e o `collisions` cai para `0` — prova que o contador realmente detecta a colisão
em vez de sempre devolver o mesmo número (`backend/tests/sentimento/test_force_order_reconnection.py`).
`test_the_new_source_opens_and_is_read_before_the_old_source_closes` observa a SEQUÊNCIA de
eventos (`new_opened → new_message_read → old_closed`) do handoff real, não só o resultado.
`test_require_overlap_rejects_the_old_source_closing_first` é o falsificador de B1: inverter as
duas marcas de tempo reprova, nomeando `ADR-004 B1`.

`bash backend/scripts/test.sh`: **897 passed**, cobertura total **98,06%** (domain **99,9%**,
use_cases **100%**, infra **95,8%** — todos acima do piso `90/80/70`). `lint.sh` limpo. `mypy
--strict` limpo. `boundaries.sh`: **3 contratos KEPT**, incl. `Natureza` (nem `domain` nem
`use_cases` tocam `socket`/`ssl`). `natureza.sh`: universo de 48 arquivos, **0 leituras de
relógio** em `domain`/`use_cases`. `harness rules --mode sweep --changed-only`: **0 achados**.

### O que esta task NÃO fecha, nomeado

- **Não integra a Classe A (`aggTrade`).** O handoff é explícito: desenhar pensando no sucessor,
  sem construir aqui — `T-03.2`'s sucessor de `aggTrade` (coberto por `T-03.1`/`T-03.4`) fica
  para uma task futura.
- **Não roda um daemon contínuo de reconexão.** `perform_overlap_handoff` é o mecanismo que um
  processo de captura real chamaria; ligar isso 24/7 é decisão de deploy, fora de escopo (owner,
  `docs/decisoes-do-owner.md` §Q1).
- **`D3.6` não está medido sobre regime real** — está provado sobre simulação offline com
  overlap conhecido, como o handoff pediu explicitamente.

## 📎 2026-09-02 por `T-03.11` — reconciliação diária, e a ressalva é o requisito, não o número

`CA-F0-14` (`SPEC-001`/plano `03` item 3.12, `DoD` em `tasks_review.md:275`). Seis arquivos
novos, dois arquivos existentes de `T-02.2` estendidos (nenhum comportamento deles mudou):

| camada | arquivo | papel |
|---|---|---|
| `domain` | `liquidation_reconciliation.py` (**novo**) | `parse_force_order_message` (primeiro leitor do `o` de `!forceOrder@arr` nesta base — `T-03.1`/`T-03.2` só gravam `raw` cru); `coinalyze_daily_liquidation_quantity` (`l+s`); `classify_daily_reconciliation` (as 4 hipóteses); `reconcile_daily_liquidation` (o agrupador por dia); `RECONCILIATION_CAVEAT` + `HYPOTHESIS_SCREEN_LABEL` |
| `use_cases` | `reconcile_daily_liquidation.py` (**novo**) | `run_daily_liquidation_reconciliation` — tolera linha malformada, CONTANDO-A, nunca a descarta em silêncio |
| `infra` | `liquidation_reconciliation_cli.py` (**novo**) | a bancada offline: lê o SQLite da quarentena (`T-02.2`) + os `.jsonl` de evidência (`T-03.2`), emite uma linha por dia + resumo |
| `domain` | `coinalyze_daily_series.py` (**estendido**) | `daily_points_from_stored_json` — reconstrói `DailyPoint` a partir do `points_json()` que `QuarantinedSeriesEntry` grava (array nu, sem o envelope `{"symbol", "history"}` do wire); refatorada a validação por item para `_daily_points_from_history_items`, reusada pelas duas formas de entrada |
| `infra` | `sqlite_series_quarantine_store.py` (**estendido**) | `read_latest()` — lê a quarentena **sem** o filtro `available_at IS NOT NULL` de `read_promoted()`; é o caminho que o handoff pede ("lê da quarentena diretamente… não é o mesmo caminho que `backtest` usaria") |

### A ressalva é o requisito central — como o código a satisfaz, campo a campo

O handoff é literal: *"não se sabe se a Coinalyze constrói o agregado dela a partir do MESMO
stream subamostrado que `T-03.2` grava… as DUAS saídas têm de informar em qual caso estamos"*.
Isso vira três decisões de código, não uma frase de comentário:

1. **`DailyLiquidationReconciliation` nunca expõe um `ratio` sozinho** — `hypothesis` é campo
   irmão na mesma dataclass, então nenhum consumidor consegue imprimir o número sem o rótulo.
2. **`RECONCILIATION_CAVEAT` é uma constante fixa**, presente em TODA linha, independente do que
   o `ratio` diga — "com a ressalva na tela" não é condicional ao resultado ser interessante.
3. **`classify_daily_reconciliation` sempre devolve uma de 4 hipóteses**, nunca um `Decimal`
   solto: as duas que o handoff nomeia (`SAME_STREAM_INCONCLUSIVE`,
   `INDEPENDENT_STREAM_MEASURES_LOSS`) e duas que a moldura binária do handoff não nomeia mas uma
   divisão real precisa responder (`NO_LIQUIDATION_EITHER_SIDE` para `0/0`, e
   `CAPTURED_EXCEEDS_COINALYZE` para o lado que nem a hipótese "mesmo stream" nem "stream
   independente mede perda" preveem — razão > 1, ou Coinalyze zerada com captura > 0). Dobrar
   qualquer um dos dois casos extras dentro de um dos dois nomeados seria o próprio defeito de
   "número solto" que o handoff aponta, uma camada abaixo.

**O limiar "perto de 1" não tem default em lugar nenhum do código** — `docs/medicao-
conectividade-forceorder.md` mediu **zero eventos reais** de `!forceOrder@arr` chegando a este
observador (85 s combinados, abaixo do gatilho de parada de `T-03.1`), então não existe
distribuição real de pares `(capturado, Coinalyze)` para calibrar uma faixa. `classify_daily_
reconciliation` e o CLI exigem os dois limites como argumento **obrigatório**, sem fallback — a
alternativa a embutir um número não medido como se fosse autoritativo.

### O falsificador — a fronteira `<=`/`<=` do "perto de 1" MORDE, não só cala

`test_classify_ratio_at_lower_boundary_is_inclusive` e `test_classify_ratio_at_upper_boundary_is_
inclusive` fixam os dois limites como **inclusivos** (`SAME_STREAM_INCONCLUSIVE` em `ratio ==
lower` e `ratio == upper`). Mutação manual, revertida em seguida (`git diff` conferido vazio
depois):

| mutante | comando | resultado |
|---|---|---|
| `classify_daily_reconciliation`: `ratio > near_one_upper_bound` → `ratio >= near_one_upper_bound` | `pytest -q tests/sentimento/test_liquidation_reconciliation.py -k classify` | **1 failed** — `test_classify_ratio_at_upper_boundary_is_inclusive` (o único que fixa `ratio == upper`) |
| `classify_daily_reconciliation`: `ratio < near_one_lower_bound` → `ratio <= near_one_lower_bound` | idem | **1 failed** — `test_classify_ratio_at_lower_boundary_is_inclusive` |
| `reconcile_daily_liquidation`: remove o `if day in seen_days: raise` (duplicidade de ponto Coinalyze) | `pytest -q tests/sentimento/test_liquidation_reconciliation.py -k duplicate` | **1 failed** — a soma silenciosa dos dois pontos do mesmo dia deixa de ser detectada |

Os três mutantes revertidos, árvore reconferida (`git status --short` limpo antes de cada um).

### Por que `l`, nunca `q` nem `z` — a mesma disciplina de `cvd.py`, uma camada acima

`!forceOrder@arr` empurra no máximo UMA atualização por `{símbolo, janela de 1000 ms}` — rótulo
`latest`/`largest` `NÃO_RESOLVIDA` (`force_order_envelope.py`). A MESMA ordem pode aparecer em
mais de um push conforme preenche através de janelas: somar `q` (tamanho TOTAL declarado,
repetido a cada push) ou `z` (total ACUMULADO, também repetido) contaria em dobro; `l` é o
incremento QUE ESTE push relata — mesma disciplina "incremento, nunca total corrente" que
`cvd.cvd_delta_by_bucket` já aplica a `aggTrade`. `test_parse_reads_l_never_q_or_z_when_they_
disagree` fixa isso com um payload onde os três discordam.

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`format --check`/`mypy --strict`, 159
arquivos). `bash backend/scripts/test.sh -q` → **rc=0**, cobertura total **98,09%** — `domain
99,9%` (meta 90%) · `use_cases 100%` (meta 80%) · `infra 95,9%` (meta 70%); os três arquivos
novos e os dois estendidos fecham em **100%** cada um. `bash backend/scripts/boundaries.sh` →
`3 kept, 0 broken` (111 arquivos, 485 dependências). `bash backend/scripts/natureza.sh` →
`universo de 46 arquivo(s), 0 leitura(s) de relogio` — `liquidation_reconciliation.py` só chama
`datetime.fromtimestamp(ms, tz=UTC)` sobre um argumento já recebido, mesmo padrão isento que
`coinalyze_daily_series.DailyPoint.date_utc` já usa.

### Achado, não meu, não bloqueante: `ResourceWarning` pré-existente no arquivo de teste da quarentena

`test_sqlite_series_quarantine_store.py` já reproduz, em `master@07193e6` (antes desta task),
**3 `ResourceWarning: unclosed database`** ao rodar isolado com `-W error::ResourceWarning`
`[MEDIDO nas duas árvores: idêntico antes e depois desta task]` — três usos pré-existentes de
`with sqlite3.connect(...) as connection:` (linhas fora do meu diff) que, ao contrário de
`with closing(sqlite3.connect(...))` (o padrão que o próprio módulo de produção usa), **não
fecham a conexão** — o `with` do `sqlite3.Connection` só comita/reverte a transação, nunca fecha.
O único ponto NOVO desta task que abre uma conexão crua (`test_read_latest_prefers_the_most_
recently_received_row`) já nasceu com `closing()`. Não corrigido nos três pontos pré-existentes:
não é desta fase, e `rc` continua `0` (é aviso, não falha) — nomeado aqui para não desaparecer.

### Escopo que esta task NÃO fecha, nomeado

- **Nenhuma reconciliação real foi rodada.** `docs/medicao-conectividade-forceorder.md` (`T-03.2`)
  mediu **zero eventos** de `!forceOrder@arr` chegando a este observador em 85 s combinados —
  abaixo do gatilho de parada de `T-03.1` (≥ 120 s × 2). Não existe hoje nenhum arquivo de
  evidência com liquidação real para alimentar `liquidation_reconciliation_cli.py` fora de
  fixture; o CLI está pronto e testado ponta a ponta contra arquivos reais em `tmp_path`, mas o
  "probe curto" que o handoff pede como prova é, nesta rodada, a suíte — não uma saída ao vivo.
- **Não decide o limiar "perto de 1".** É uma decisão que exige a distribuição real que ainda não
  existe (parágrafo acima); o código se recusa a inventar um default.
- **Não constrói a "tela".** `screen_label`/`caveat` são o dado pronto para quando ela existir —
  nenhuma UI é criada por esta task.
- **Não resolve o `unit`/`denom` da Coinalyze** (`docs/medicao-coinalyze.md` §2.3: 744
  `BASE_ASSET` / 20 `QUOTE_ASSET`) — citado como possível causa de `CAPTURED_EXCEEDS_COINALYZE`
  em `HYPOTHESIS_SCREEN_LABEL`, nunca medido ou corrigido aqui.

### 📎 2026-09-02 por `T-07.1` — o paginador correto: janela `[startTime, endTime]` fechada, enumerada A PRIORI, e a listagem S3 por `NextContinuationToken`

`CST-55`, `CA-F3-2`/`CA-F3-1`/`CA-F3-5`, `SPEC-001` §5.7, plano `07` itens 7.1+7.2+7.4. **Pré-requisito
de qualquer backfill grande** (`T-03.10` e além) — a prioridade declarada no handoff.

[`domain/oi_history_paginator.py`](src/modules/sentimento/domain/oi_history_paginator.py) (**novo**)
fixa `ClosedWindow` com **os dois limites obrigatórios** — não existe construtor que aceite só
`start_time_ms`, então o caso perigoso que `D7.3` mediu (`startTime` sozinho) é irrepresentável no
tipo. `enumerate_history_pages` divide a janela em sub-janelas fechadas **por aritmética pura**
(`period_ms * limit`), nunca consultando uma resposta — a propriedade que `SPEC-001` §5.7 exige
("enumerado ANTES do loop"). `classify_page` é a segunda metade da defesa: **qualquer** ponto
retornado fora de `[start_time_ms, end_time_ms]` reprova a página inteira com zero linhas
gravadas, `HTTP 200` ou não — é o que pega o comportamento `[MEDIDO]` da Binance (cauda de hoje,
sem aviso, para uma janela antiga) mesmo que a chamada tenha sido montada corretamente.
`api_code == -1130` é classificado como `end_of_history` (`D7.1`), nunca como erro transitório
a repetir. Nenhum teto de linhas é aplicado (`D7.5`: 501 pontos dentro da janela são aceitos e
gravados, contra o máximo documentado de 500 — o observado, não o documentado).

[`infra/binance_oi_history_client.py`](src/modules/sentimento/infra/binance_oi_history_client.py)
(**novo**) é o cliente HTTP de `/futures/data/openInterestHist`, mesmo padrão de conexão de
`binance_futures_snapshot_client.py` (`http.client`, fábrica de conexão injetável, sem socket em
teste). A assinatura recebe `ClosedWindow`, então nenhum caminho de código deste cliente consegue
enviar `startTime` sem `endTime`.

[`domain/s3_bucket_listing.py`](src/modules/sentimento/domain/s3_bucket_listing.py) (**novo**)
fixa `BucketListingPage` (recusa `is_truncated=True` sem `next_continuation_token` — defesa contra
um parser que descarta o token em silêncio) e `merge_pages` (recusa uma sequência de páginas cuja
ÚLTIMA ainda está truncada — defesa contra quem para de paginar cedo demais, exatamente o que
`D7.8` nomeia). [`infra/binance_dump_bucket_listing_client.py`](src/modules/sentimento/infra/binance_dump_bucket_listing_client.py)
(**novo**) faz o `GET` do `data.binance.vision` (`ListObjectsV2`, XML via `xml.etree.ElementTree`,
sem dependência nova) e `list_all_object_keys` drena todas as páginas seguindo
`NextContinuationToken` até `IsTruncated=false`.

**O falsificador de `D7.8`, medido diretamente:** `test_d7_8_the_falsifier_merging_only_the_first_of_two_truncated_pages_is_refused`
prova que `merge_pages` de uma sequência com só a primeira das duas páginas (a mutação exata que
o DoD nomeia) levanta `UnpaginatedTruncationError`; e `test_d7_8_list_all_object_keys_follows_nextcontinuationtoken_across_pages`
prova, ponta a ponta com XML real de 2 páginas (500 + 480 chaves), que o loop devolve as **980**
chaves e não as 500 da primeira página sozinha.

**Escopo que esta task NÃO fecha, nomeado:** não escreve `md.ingest_run`/`md.ingest_gap` (chega
com `T-03.8`/produção real, aqui é só o paginador e o cliente); não faz survivorship na borda de
ingestão (`T-07.2`); não faz dedupe por hash de conteúdo (`T-07.3`); nenhum `use_cases` novo foi
necessário — o escopo do plano (itens 7.1+7.2+7.4) é paginação e listagem, não o pipeline de
escrita, que é dono de tasks posteriores da mesma fase.

`bash backend/scripts/test.sh`: **1063 passed** (era 1029, `+34`), cobertura **97,84%** — `domain`
**99,9%** (meta 90%), `use_cases` **100,0%** (meta 80%), `infra` **95,2%** (meta 70%). `lint.sh`
limpo (`ruff check`/`format --check`/`mypy --strict`, 188 arquivos). `boundaries.sh`: **3 kept, 0
broken** (131 arquivos, 592 dependências). `natureza.sh`: universo 57 arquivos, 0 leituras de
relógio. `harness rules --mode sweep --changed-only`: **0 achados** (a 1ª rodada achou 4 `[AVISO]`
de docstring de módulo multi-linha, não-bloqueante, corrigido para o padrão de uma linha do
repositório). Relatório: [`gates/T-07.1-builder.md`](../docs/context/plataforma-dados/gates/T-07.1-builder.md).
**`tasks.toml`, ledger e Jira INTOCADOS; nenhum `gate-record`, `approve` ou `advance`** — veredito
é do `/qa`.

## 📎 2026-09-02 por `T-07.10` — `clock_skew_tolerance_ms` CALIBRADO, RECUSADO hoje por falta de 7 dias

`CA-F3-13`, plano `07` item 7.12, DoD `D7.18`. Lê a distribuição de `clock_skew_ms` que `T-03.8`
mede e persiste (`domain/clock_skew.py`, `use_cases/persist_ntp_skew_run.py`, reusados sem
duplicar `ClockSkewSample`) e calibra a tolerância como `p99` de `|clock_skew_ms|` — nunca um
número fixo. `D3.10`/`D7.18`, literal: `>= 7 dias de runs` é o padrão real; hoje só existem os 5
probes curtos de `T-03.8` (~6,6 s de span), e o mecanismo **RECUSA** calibrar sobre eles em vez de
fabricar um número.

### As peças, e a camada de cada uma

- [`domain/clock_skew_tolerance.py`](src/modules/sentimento/domain/clock_skew_tolerance.py)
  (**novo**): `ClockSkewObservation` (valor já computado + `observed_at_ms`, NÃO um
  `ClockSkewSample` reimplementado — `md.ingest_run` nunca persiste o bracket que produz o
  skew, só o resultado) e `calibrate_clock_skew_tolerance`, que reusa `p99` de
  `availability_lag_stats.py` (mesma convenção `LAG_STAT_NAME`/`TOLERANCE_STAT_NAME = "p99"`,
  nearest-rank, nunca interpolado) em vez de reimplementar percentil. Refusa
  (`InsufficientClockSkewCalibrationDataError`) com zero amostras ou `span_days < 7`
  (`MIN_CALIBRATION_SPAN_DAYS`, parametrizável só para teste de fronteira).
- [`use_cases/calibrate_clock_skew_tolerance.py`](src/modules/sentimento/use_cases/calibrate_clock_skew_tolerance.py)
  (**novo**): porta `ClockSkewHistorySource`, deixa a recusa propagar (mesma disciplina de
  `MissingUsedWeightError` em `persist_ntp_skew_run.py` — nunca engolida num default).
- [`infra/clock_skew_tolerance_reader.py`](src/modules/sentimento/infra/clock_skew_tolerance_reader.py)
  (**novo**): `parse_iso_ms` (inverso de `ntp_skew_probe_cli.iso_ms`) faz a única leitura de
  `datetime` desta task — `Natureza`, mesma fronteira de `infra/metrics_csv_reader.py` — e
  `IngestRunClockSkewSource` adapta qualquer `IngestRecordSource` (ex.: `SqliteIngestRecordStore`)
  lendo TODO `md.ingest_run`, não só linhas de probe NTP.
- [`infra/clock_skew_tolerance_cli.py`](src/modules/sentimento/infra/clock_skew_tolerance_cli.py)
  (**novo**): mesmo contrato de stream de `ingest_health_cli.py` (produto em `stdout`,
  diagnóstico em `stderr`). A recusa vira `{"calibrated": false, "reason": "..."}` na MESMA linha
  JSON de um sucesso — nunca um traceback escondendo o motivo.

### O falsificador da fase — rodado contra os 5 runs REAIS de `T-03.8`

`test_refuses_on_the_5_real_t038_probe_runs` (domain) e
`test_report_on_the_real_5_run_t038_store_refuses` (infra/CLI) alimentam os `clock_skew_ms`
efetivamente medidos (`-69,-69,-73,-66,-23`) com os `started_at` reais
(`docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/01_ingest_health_query.jsonl`) — span
`~6,6 s`, não `7 dias` — e o mecanismo **REPROVA com `InsufficientClockSkewCalibrationDataError`**.
Toda distribuição não trivial usada para provar a fórmula (`p99` de 1..100, skew negativo) é
SIMULADA e rotulada como tal no teste — nunca apresentada como medição real.

### Escopo que esta task NÃO fecha, nomeado

- **Não calibra uma tolerância real.** Os 7 dias de captura contínua que `D3.10`/`D7.18` exigem
  não existem (owner ainda roda local/probe-curto, `docs/decisoes-do-owner.md` §Q19) — quando
  existirem, `infra/clock_skew_tolerance_cli.py` já lê o mesmo store sem mudança de código.
- **Não decide o que fazer com a tolerância calibrada** (alarme, campo de UI, etc.) — só a
  calcula e a devolve com a evidência (`sample_n`, `span_days`, `stat_name`) anexada.

## 📎 2026-09-02 por `T-07.3` — dedupe por HASH DE CONTEÚDO, byte-estável verificado, nunca por nome/timestamp

`CA-F3-*`, plano `07` item 7.5. Dois objetos com o MESMO conteúdo byte-a-byte, sob chaves
diferentes (nome diferente, ou o mesmo dump re-baixado), colapsam num único item: o segundo é
descartado como duplicata e nunca republicado. O contra-exemplo que o DoD exige rejeitado
explicitamente — mesma chave, conteúdo DIFERENTE (dump republicado corrigido) — permanece NÃO
duplicata, porque a identidade comparada é sempre o digest, nunca o nome nem o instante do
download.

**Reuso em vez de invenção**, como o handoff pediu: `domain/checksum_manifest.py` (existente,
`T-02.4a`) já publicava o vocabulário de digest sha256; `T-07.3` reusa `ChecksumManifest`/
`ChecksummedFilePayload` em vez de hashear de novo. `use_cases/drain_etl_backlog.py` (existente)
não muda — a camada entra por DECORAÇÃO do `ItemWorker`, não por um segundo pipeline.

### As peças, e a camada de cada uma

| arquivo | camada | conteúdo |
|---|---|---|
| [`domain/content_dedupe.py`](src/modules/sentimento/domain/content_dedupe.py) (**novo**) | `domain` | `ContentDedupeVerdict` (NEW vs DUPLICATE-of-key) e `ContentDedupeLedger` (imutável, `decide`/`recording`) — pura: nenhum arquivo, rede ou relógio |
| [`infra/content_dedupe_store.py`](src/modules/sentimento/infra/content_dedupe_store.py) (**novo**) | `infra` | `JsonlContentDedupeStore` — mesma disciplina de `jsonl_checkpoint.py` (`flush`+`fsync` por linha, cauda truncada tolerada, forma errada recusada por nome, nunca coagida) |
| [`infra/content_deduping_worker.py`](src/modules/sentimento/infra/content_deduping_worker.py) (**novo**) | `infra` | `ContentDedupingWorker` (decorator de `ItemWorker`, ledger carregado UMA vez) + `verified_digest_source` (fábrica que confere o digest contra o `.CHECKSUM` ANTES de decidir, na mesma ordem de `ingest_verified`) |
| [`infra/dump_etl_cli.py`](src/modules/sentimento/infra/dump_etl_cli.py) (modificado) | `infra` | `run()` envolve `DumpIngestWorker` com `ContentDedupingWorker`; `CONTENT_DEDUPE_FILE` novo, `drain()`/`EtlBacklog` intocados |
| 4 suítes novas (**32 testes**) | — | `test_content_dedupe.py` (ledger puro, inclui os dois falsificadores), `test_content_dedupe_store.py` (durabilidade), `test_content_deduping_worker.py` (decorator + `verified_digest_source`), `test_content_dedupe_across_keys.py` (ponta a ponta pela raiz de composição) |

**Por que a ordem de verificação importa, e um ciclo de correção nomeado.** A primeira versão
ligava `digest_of` a `ChecksummedFilePayload(...).digest()` puro — abre o PAYLOAD antes de olhar
o `.CHECKSUM`. Isso quebrou 4 testes pré-existentes: dois porque a fixture reusava o MESMO corpo
de bytes para todas as partições de uma janela (colisão de conteúdo não intencional, corrigida
com um corpo distinto por índice de partição em `test_dump_etl_cli_surface.py`/
`test_dump_ingest_edge.py`), e dois porque `test_a_hole_in_the_bucket_stops_the_drain_and_the_cost_is_named`
espera `ChecksumMissingError` quando o objeto E o sidecar estão ausentes — a forma ingênua abre o
arquivo (ausente) primeiro e levanta `FileNotFoundError`, quebrando a distinção que
`ingest_verified_payload.py` já documentava entre "sidecar ausente" e "caminho desaparecido".
`verified_digest_source` conserta isso lendo o sidecar PRIMEIRO, na mesma ordem — e
`test_verified_digest_source_reports_a_missing_sidecar_before_opening_the_payload` fixa o
regressão para não voltar.

**Custo nomeado, não escondido:** para uma chave NOVA (não-duplicata), o payload é hasheado
DUAS vezes — uma em `verified_digest_source` (decide dedupe), outra dentro de `ingest_verified`
(streaming). Eliminar a segunda exigiria mudar o contrato de retorno de `ingest_verified`, que é
vigiado por uma asserção de ordem de chamada (`test_verified_edge_call_sites.py`) e está fora do
escopo desta task — `T-02.4a` é dona daquele contrato, não `T-07.3`.

`bash backend/scripts/test.sh` **pós-merge com `origin/master@21a5f1e`** (que trouxe `T-07.4`
Redis Streams e `T-07.7` circuit breaker, sem conflito de código com esta task): **1147
passed**, cobertura **97,44%** — domain **99,8%** (meta 90%, `2245/2249`), use_cases **100,0%**
(meta 80%), infra **95,0%** (meta 70%, piso OK). **25 testes NOVOS desta task**
`[MEDIDO: pytest --collect-only -q sobre as 4 suítes novas → 7+2+10+6]`, mais ajustes de fixture
(sem teste novo) em `test_dump_etl_cli_surface.py`/`test_dump_ingest_edge.py` para que o corpo
sintético de cada partição pare de colidir por conteúdo com o das demais. `lint.sh` limpo (`ruff
check`/`format --check`/`mypy --strict`, 212 arquivos). `boundaries.sh`: **3 kept, 0 broken**
(144 arquivos, 656 dependências). `natureza.sh`: universo 63 arquivos, 0 leituras de relógio.
`harness rules --mode sweep --changed-only`: **0 achados**.

### Escopo que esta task NÃO fecha, nomeado

- **Não elimina o hash duplo por chave nova** — nomeado acima, dono é uma mudança de contrato em
  `ingest_verified_payload.py` que esta task não faz.
- **Não escreve `md.ingest_run`/`md.ingest_gap`** — mesma lacuna que `T-07.1` já registrou;
  chega com `T-03.8`/produção real.
- **Não decide o que fazer com um objeto marcado duplicata além de não republicá-lo** — sem
  alarme, sem métrica agregada; o evento `etl_item_duplicate_content` fica no log.

## 📎 2026-09-02 por `T-07.7` — jitter e circuit breaker sobre o broker cego, por composição

`CA-F3-9`, plano `07` item 7.9. `domain/local_quota_broker.py` (`T-03.7`) paceia um balde CEGO
num intervalo fixo, mas nunca se recusa a chamar — mesmo logo depois do primeiro `429`. Esta
task compõe três peças novas em cima dele, **sem tocar o arquivo existente**, como o handoff
pediu explicitamente ("prefira composição a duplicar a lógica de contagem local"):

| camada | arquivo | o que faz |
|---|---|---|
| `domain` | `circuit_breaker.py` (**novo**) | a máquina de estados `CLOSED -> OPEN -> HALF_OPEN -> CLOSED`; `FailureKind.RATE_LIMITED`/`SERVER_ERROR` abrem o circuito na PRIMEIRA ocorrência (o único bit autoritativo que um balde cego dá), `TRANSPORT_ERROR` só conta para o limiar genérico |
| `domain` | `jitter.py` (**novo**) | `JitterPolicy.apply(base, sample)` puro (sample injetado, nunca lido de `random` dentro da função); `sample_uniform()` é a única linha não determinística do módulo, envolvendo `random.random()` |
| `domain` | `quota_circuit_broker.py` (**novo**) | `QuotaCircuitBroker` compõe `LocalQuotaBroker` + `JitterPolicy` + `CircuitBreakerPolicy`/`State`; `decide()` consulta o circuito PRIMEIRO — um circuito aberto nunca chega a jitterar nada |

### Por que a aleatoriedade é parâmetro, não chamada interna

Mesma disciplina que `domain/recoil_policy.py` já usa para `retry_after_seconds`: uma função que
RECEBE seu não-determinismo é uma função que um teste dirige com valores exatos
(`sample=0.0`/`0.5`/`1.0`) e prova as duas bordas sem depender de sorte.
`ADR-016`/`Natureza` proíbe `domain`/`use_cases` de importar `socket`/`ssl` e guarda `time`/
`datetime` POR USO (`backend/scripts/natureza.py`) — nenhum dos dois cobre `random`, que não lê
relógio nem abre soquete. `sample_uniform()` existe mesmo assim como wrapper fino, porque o
DoD desta task pede um teste que prove variância REAL entre chamadas, não apenas a aritmética
pura injetada.

### O falsificador do jitter — a proteção que o DoD pede, mostrando o que ela rejeita

`test_the_real_random_source_is_not_hardcoded_to_the_same_value` chama `sample_uniform()` 50
vezes e recusa se todas caírem no mesmo valor (`len(draws) > 1`). Mutação manual, revertida em
seguida (`git diff` conferido vazio depois):

| mutante | comando | resultado |
|---|---|---|
| `sample_uniform`: `return random.random()` → `return 0.42` (hardcoded) | `pytest -q tests/sentimento/test_jitter.py -k real_random_source_is_not_hardcoded` | **1 failed** — `len(draws) == 1`, exatamente o defeito que o DoD pede para rejeitar |
| `record_failure`: remove `kind.trips_immediately or` (só threshold genérico) | `pytest -q tests/sentimento/test_circuit_breaker.py -k first_occurrence` | **2 failed** — `RATE_LIMITED`/`SERVER_ERROR` deixam de abrir o circuito na primeira falha |

Os dois mutantes revertidos, árvore reconferida (`git status --short` limpo antes de cada um).

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`format --check`/`mypy --strict`, 189
arquivos). `bash backend/scripts/test.sh` → **rc=0**, `1064 passed, 3 warnings` (588 s) — os 3
`ResourceWarning` são o mesmo achado pré-existente já nomeado na seção de `T-03.11`, não desta
task. Cobertura total **97,84%** — `domain 99,8%` (meta 90%, `2111/2115`) · `use_cases 100%`
(meta 80%) · `infra 95,1%` (meta 70%); `jitter.py` e `quota_circuit_broker.py` fecham em
**100%**, `circuit_breaker.py` em **97%** (2 linhas: uma branch defensiva inalcançável do
`InvalidCircuitBreakerError` de tipo, guardada pelo próprio `__post_init__` do dataclass, e uma
linha de `__post_init__` de `CircuitBreakerState` já coberta pelo caminho irmão). `bash
backend/scripts/boundaries.sh` → `3 kept, 0 broken` (129 arquivos, 583 dependências) —
`circuit_breaker.py`/`jitter.py`/`quota_circuit_broker.py` vivem em `domain`, não importam
`socket`/`ssl`/outro contexto. `harness rules --mode sweep --changed-only` → **rc=0**, nenhum
achado sobre os 6 arquivos desta task (3 de produção, 3 de teste).

### Escopo que esta task NÃO fecha, nomeado

- **Não abre um novo consumidor real.** Nenhum CLI/use case novo chama `QuotaCircuitBroker` —
  o handoff pede o broker (`domain/`), não a fiação de um cliente HTTP concreto sobre ele; isso
  é escopo de quem for consumir `binance-futures-data`/`coinalyze` em regime (fora de `07.9`).
- **Não decide os números de produção** (`failure_threshold`, `cooldown_seconds`, `spread`) —
  são parâmetros do chamador; nenhum valor aqui é apresentado como calibrado contra tráfego real.
- **Não persiste o estado do circuito entre processos.** `CircuitBreakerState` é um valor puro em
  memória; um broker compartilhado entre processos (o cenário de thundering herd que o jitter
  mitiga) não tem, ainda, um armazenamento comum — cada processo mede sua própria série de falhas.

## 📎 2026-09-02 por `T-07.2` — survivorship na borda de ingestão: `ACCEPTED_WITH_WARNING`, nunca `REJECTED`

`CST-56`, `CA-F3-14`, `SPEC-001` §5.6, plano `07` item 7.3, DoD `D7.2`+`D7.6`. Um símbolo ausente
do `exchangeInfo` CORRENTE mas presente no dump histórico não pode ser descartado na borda de
ingestão — a SPEC é literal: *"NUNCA 'REJECTED', NUNCA zero linhas gravadas"*. **109 símbolos
históricos são invisíveis hoje** — 21,6% do universo cripto-perp com histórico não existe mais no
snapshot corrente (727 → 570) `[DOC: SPEC-001 §5.6]` — rejeitar apagaria esse histórico em silêncio.

[`domain/dump_survivorship.py`](src/modules/sentimento/domain/dump_survivorship.py) (**novo**)
fixa `SurvivorshipVerdict = Literal["ACCEPTED", "ACCEPTED_WITH_WARNING"]` — sem o terceiro membro
`REJECTED` no tipo, a mesma técnica que `ClosedWindow` usa contra `D7.3`: não é uma convenção que
`classify_symbol_survivorship` lembra de honrar, é uma forma que a função não consegue devolver
fora dela. `current_exchange_info_symbols` chega como o MESMO `frozenset[str]` que
`instrument_universe_snapshot.exchange_info_symbols` já produz (`T-02.1`) — nenhuma segunda
representação de "`exchangeInfo` corrente" foi inventada, por instrução explícita do handoff.
`build_survivorship_gap` monta a linha de `md.ingest_gap` que a SPEC pede ao lado do veredito,
com `gap_class="SURVIVORSHIP_WARNING"` — o **segundo** membro da enumeração de `class` que
`infra/metrics_csv_reader.py` já registrava como "em aberto" (`SOURCE_GAP_CLASS`) — e
`n_missing=0`, deliberado: a janela inteira FOI capturada, o aviso é sobre pertencimento ao
universo, não sobre um buraco na série.

### `D7.2`, medido sobre dado real, não inventado

`MATICUSDT` não é um exemplo sintético: é a ausência real que
`test_instrument_universe_snapshot.py::test_d2_3_premium_index_names_three_symbols_exchange_info_does_not`
já mede na MESMA fixture (`data/binance/rest/ei.json`, 872 símbolos, `[MEDIDO 2026-09-01]`).
`test_dump_survivorship.py` reusa exatamente essa captura: confirma a ausência antes de
classificar (`test_d7_2_maticusdt_absent_from_the_real_exchange_info_capture`), classifica e
confere `ACCEPTED_WITH_WARNING` + `reason`, e faz o "GRAVOU, com aviso" da SPEC ponta a ponta —
`IngestRun`+`IngestGap` persistidos pelo MESMO `SqliteIngestRecordStore` que `T-02.3`/`T-04.2` já
provam durável, `n_written=288` (nunca zero) e o `md.ingest_gap` com `gap_class` novo.

### O falsificador — a fronteira que `SPEC-001` §5.6 diz que NÃO generaliza

`classify_page` (`oi_history_paginator.py`, `T-07.1`) tem seu PRÓPRIO `Verdict` com `REJECTED`
(fim de histórico, ponto fora da janela) — eixo diferente, e ler `CA-F3-1` sem `CA-F3-14`
generaliza fail-closed e planta survivorship, o erro que a SPEC nomeia explicitamente.
`test_structural_falsifier_classify_symbol_survivorship_cannot_spell_rejected` prova, por AST
sobre o corpo executável (docstring excluída), que nenhuma constante `"REJECTED"` é alcançável
em `classify_symbol_survivorship` — e prova que o scanner MORDE: a mesma verificação sobre um
mutante manual (`verdict=ACCEPTED` → `verdict="REJECTED"`) encontra a palavra, confirmando que a
ausência no código real não é o scanner cego.

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`format --check`/`mypy --strict`, 200
arquivos). `bash backend/scripts/test.sh` → **rc=0**, `1128 passed, 3 warnings` (286 s) — os 3
`ResourceWarning` são o mesmo achado pré-existente já nomeado na seção de `T-03.11`. Cobertura
total **97,49%** — `domain 99,8%` (meta 90%, `2239/2243`) · `use_cases 100%` (meta 80%) ·
`infra 95,0%` (meta 70%); `dump_survivorship.py` fecha em **100%** (19 linhas, 2 branches).
`bash backend/scripts/boundaries.sh` → `3 kept, 0 broken` (142 arquivos, 641 dependências) —
`dump_survivorship.py` vive em `domain`, importa só `ingest_record.py` (mesma camada).
`harness rules --mode sweep --changed-only` → **rc=0**, nenhum achado sobre os 2 arquivos desta
task. **Achado de ambiente, não desta task:** `bash backend/scripts/test.sh` reprovava na
COLETA por `ModuleNotFoundError: No module named 'fakeredis'` — dependência que `T-07.4` já
declarou em `pyproject.toml`/`poetry.lock` (mesclado em `master` depois desta worktree ter sido
criada) mas que o venv compartilhado ainda não tinha instalado; corrigido com
`pip install fakeredis==2.37.1` (pin exato do lock) no MESMO venv que todas as worktrees
compartilham, sem tocar `pyproject.toml`/`poetry.lock` — não é dívida desta task, é a instalação
alcançando o que o lock já declarava.

### Escopo que esta task NÃO fecha, nomeado

- **Não escreve o pipeline de ingestão real** (ETL do S3, escritor único, dedupe por hash) —
  isso é `T-07.3`/`T-07.4`/`T-07.5`; esta task é a DECISÃO pura de `domain`, exercida com um
  `IngestRun`/`IngestGap` de teste, não com um caminho de produção que a chama.
- **Não mede novamente os 109 símbolos/21,6%** — esse número já é `[MEDIDO]` alhures
  (`SPEC-001` §5.6, `tasks_review.md`); o que esta task prova é a DECISÃO sobre um caso real
  (`MATICUSDT`) tirado da mesma fixture de `T-02.1`, não uma nova varredura S3 × `exchangeInfo`.
- **Não decide `universe_at`** (união de duas testemunhas, `T-07.8`) — a "universo corrente"
  aqui é só `exchangeInfo` de HOJE, o literal da SPEC (*"ausente do exchangeInfo CORRENTE"*),
  não a reconstrução point-in-time que `T-07.8` faz depender desta task.

## 📎 2026-09-02 por `T-07.8` — `universe_at(ts, filtro)`: `s3_inferred` inadmissível POR TIPO

`CST-62`, `CA-F3-4`, `SPEC-001` §3.7, plano `07` item 7.10, DoD `D7.7`. `SPEC-001` §3.7 fixa o
vocabulário de três membros `universe_source ∈ { snapshot, s3_inferred, premium_index_witness }`
e desqualifica um deles para a decisão: *"`universe_source = s3_inferred` é INADMISSÍVEL no
caminho de decisão. Ele deduz existência do símbolo da existência do arquivo — fato conhecível
~30,3h depois e só para símbolos cujos arquivos continuam publicados: survivorship e lookahead
na mesma coluna."* `PRD-001` `CA-F0-1` mede por que isso não é hipotético: a série diária de
snapshot `exchangeInfo` (`T-02.1`) só começou em `2026-08-25` (captura manual única; o `cron`
continua bloqueado por `Q1`) — todo `ts` anterior a essa data não tem NENHUM snapshot, só a
testemunha derivada do S3.

[`domain/universe_at.py`](src/modules/sentimento/domain/universe_at.py) (**novo**) fixa dois
tipos onde a SPEC fixa um: `UniverseSource` (os três membros literais, para QUEM PRECISA marcar
uma testemunha) e `DecisiveUniverseSource = Literal["snapshot", "premium_index_witness"]` —
**sem** `s3_inferred` — que é o único tipo que aparece na assinatura de
`decide_universe_membership`. Não existe `if fonte == "s3_inferred": raise` em lugar nenhum:
`mypy --strict` recusa a própria ATRIBUIÇÃO antes de o código rodar, medido diretamente
(`[MEDIDO 2026-09-02]`, arquivo descartável fora da árvore versionada):

```
$ mypy --strict <arquivo com `bad: DecisiveUniverseSource = "s3_inferred"`>
error: Incompatible types in assignment (expression has type "Literal['s3_inferred']",
variable has type "Literal['snapshot', 'premium_index_witness']")  [assignment]
```

`universe_at(ts, filtro)` nunca funde as duas testemunhas em silêncio: `symbols` é a UNIÃO
(`decided_symbols | s3_witness_symbols`), e `divergence` — reusando `compare_symbol_sets` de
`instrument_universe_snapshot.py` (`T-02.1`/`T-07.2`), nenhuma terceira representação do
universo foi inventada — nomeia exatamente que símbolos só um lado atesta. Quando
`snapshot_rows=None` (nenhum snapshot existe para `ts`, o caso honesto de todo `ts` antes de
`2026-08-25`), `decided_symbols` fica `frozenset()` — não porque a decisão confirmou um universo
vazio, mas porque não havia testemunha admissível — e `label=RETROSPECTIVE_LABEL` marca essa
diferença, para que "vazio por não confirmado" nunca seja lido como "vazio por medido".
`UniverseFilter` (`market`/`underlying_sub_type`) é o "universo é filtro na LEITURA" de
`SPEC-001` §6/Q5, sobre os mesmos dois campos que `InstrumentRow` (`T-02.1`) já persiste por
linha — nenhuma coluna nova.

### `D7.7`, sem inventar uma série histórica que não existe

`universe_at('2025-08-01')` tem de incluir `ICXUSDT` e excluir `DOSUSDT` (onboard `2026-08-11`,
`[MEDIDO]`, `CA-F3-4`). Como nenhum snapshot real cobre `2025-08-01` (`CA-F0-1`), o teste
constrói a testemunha S3 diretamente a partir do fato já medido em múltiplos documentos deste
repositório (`DOSUSDT` não existia até `2026-08-11`) em vez de fingir um arquivo histórico que
não foi capturado — a mesma disciplina de `test_dump_survivorship.py` ao reusar `MATICUSDT` real
em vez de inventar um símbolo sintético. `snapshot_rows=None` produz `label=RETROSPECTIVE_LABEL`
e `decided_symbols=frozenset()`; o resultado ainda inclui `ICXUSDT` e exclui `DOSUSDT` porque a
UNIÃO carrega a testemunha S3 mesmo sem decisão confirmada — provando exatamente a distinção que
o tipo existe para proteger: união (dado) não é decisão (confiança).

O caminho decisivo (snapshot disponível) é exercido com a MESMA fixture real que `T-02.1`/
`T-07.2` já cataloga (`data/binance/rest/ei.json`+`fi.json`+`pi.json`, 872 símbolos):
`MATICUSDT` — ausência real, não sintética — aparece na testemunha S3 mas não na decidida,
marcando divergência com `label=None` (decisão confirmada, divergência é dado). O filtro por
`market` (`MARKET_USDS_M`/`MARKET_COIN_M`) particiona os símbolos decididos em dois conjuntos
disjuntos cuja união bate com o total, sobre a mesma fixture.

### O falsificador estrutural

`test_decisive_universe_source_excludes_s3_inferred_by_member_set` prova, por
`typing.get_args`, que `DecisiveUniverseSource` tem dois membros e `UniverseSource` tem os três
da SPEC — a exclusão é deliberada, não um esquecimento. `test_structural_falsifier_decide_
universe_membership_cannot_spell_s3_inferred` prova por AST que nenhuma constante `"s3_inferred"`
é alcançável no corpo executável de `decide_universe_membership`, e prova que o scanner MORDE
sobre um mutante manual — a mesma técnica de `test_dump_survivorship.py` contra `"REJECTED"`.

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`format --check`/`mypy --strict`, 216
arquivos). `bash backend/scripts/test.sh` → **rc=0**, `1162 passed, 3 warnings` (296 s).
Cobertura total **97,47%** — `domain 99,8%` (meta 90%, `2304/2308`) · `use_cases 100%`
(meta 80%) · `infra 95,0%` (meta 70%); `universe_at.py` fecha em **100%** (40 linhas, 6
branches). `harness rules --mode sweep --changed-only` → **rc=0**, nenhum achado sobre os 2
arquivos desta task.

### Escopo que esta task NÃO fecha, nomeado

- **Não escreve o use_case/CLI que lê um snapshot real do disco e chama `universe_at`** — o
  handoff pede a DECISÃO pura de `domain`; a composição com `instrument_universe_snapshot_store.py`
  (`T-02.1`) e com a listagem S3 real fica para quem consumir esta função (`T-07.14`/`T-07.15`,
  `web`).
- **Não persiste `onboard_ts`/`deliveryDate` por símbolo** — `InstrumentRow` (`T-02.1`) não tem
  esses campos hoje; sem eles, um `ts` histórico posterior a `2026-08-25` só pode ser decidido
  se um snapshot real daquele dia exatamente existir, não por interpolação a partir do snapshot
  de hoje. Essa extensão é `SPEC-001` §3.4 (`T-02.1`), não `T-07.8`.
- **Não implementa `Q2`/S5 embutido** (seletor de símbolo, badge de delisting lido de
  `deliveryDate`) — isso é `T-07.14`/`T-07.15`, componente `web`, que consome `universe_at`
  como uma caixa fechada.
## 📎 2026-09-02 por `T-07.5` — escritor único; backfill MODELADO nunca sobrescreve captura OBSERVADA

`CST-59`, `ADR-002`/D5, `CA-F3-12`, plano `07` item 7.7, DoD `D7.16`. `ADR-002`/D5: todos os
caminhos de escrita convergem para **um** processo escritor, e a lógica de ler-antes-de-escrever
vive nele — não no motor de armazenamento, porque `D4` (candidato 4 × 5) segue **pendente de
spike** (`T-08.1`, `status = blocked` em `tasks.toml`). Esta task constrói esse escritor como
lógica de aplicação pura, atrás de PORTS (`Protocol`), independente de qual dos cinco candidatos
`ADR-002` acabar escolhendo.

| camada | arquivo | o que faz |
|---|---|---|
| `domain` | [`provenance.py`](src/modules/sentimento/domain/provenance.py) (**alterado**) | ganha `modeled_write_overwrites_observed(provenance, *, observed_already_present)` — predicado puro, sem I/O: `True` exatamente quando `provenance is Provenance.MODELED and observed_already_present` |
| `use_cases` | [`write_series_row.py`](src/modules/sentimento/use_cases/write_series_row.py) (**novo**) | o ESCRITOR ÚNICO: consulta `ObservedLookup.observed_already_present(row)` e só então chama `SeriesSink.accept(row)` — ou nem chama, se `D7.16` bloqueia |
| `use_cases` | [`run_single_writer.py`](src/modules/sentimento/use_cases/run_single_writer.py) (**novo**) | drena `SeriesWriteQueue.read_pending` DEPOIS `read_new` (ordem de recuperação de `D7.10`/`T-07.4`), chama `write_series_row` por entrada, `ack`a cada uma após o retorno |
| `infra` | [`redis_series_write_queue.py`](src/modules/sentimento/infra/redis_series_write_queue.py) (**novo**) | adapta `RedisStreamConsumerGroup` (`T-07.4`) ao port `SeriesWriteQueue`, com `decode` INJETADO |

### Por que só um predicado, e por que ele não decide sozinho quem escreve

`D7.16` nomeia UMA direção: "modelado nunca vence observado; observado sempre vence modelado;
modelado pode preencher um gap onde não havia nada". `modeled_write_overwrites_observed` não
recebe o `SeriesRow` inteiro nem faz leitura nenhuma — recebe só o `Provenance` do candidato e um
`bool` já respondido pelo chamador, porque `domain` não pode falar com um store (`Natureza`,
`ADR-016`) e a resposta tem a mesma forma não importa qual dos cinco candidatos de `ADR-002` a
supra. `OBSERVED`/`DERIVED`/`HUMAN` nunca são bloqueados por este predicado — um segundo `OBSERVED`
sobre o mesmo bucket é um append normal (a chave de `SeriesRow` inclui `observed_at`, então dois
`OBSERVED` do mesmo `bucket_end` já coexistem por desenho, `test_provenance_columns.py`).

### A ordem "ler antes de escrever" é a ordem de DUAS LINHAS, não uma alegação de docstring

`write_series_row` chama `lookup.observed_already_present(row)` e só interpreta o resultado antes
de decidir se chama `sink.accept(row)` — nunca o contrário.
`test_the_lookup_is_consulted_before_the_sink_is_ever_touched` planta um `lookup` que sempre
levanta `RuntimeError` e prova que `sink.accept` nunca é alcançado quando isso acontece: se a
ordem fosse invertida, uma linha poderia já estar durável no momento em que a leitura falhasse.

### O falsificador central — prova AUSÊNCIA no sink fake, não só o veredito devolvido

`test_a_modeled_candidate_over_an_observed_bucket_never_reaches_the_sink`
(`test_write_series_row.py`) monta um candidato `MODELED` sobre um bucket com
`observed_already_present=True` e afirma **duas** coisas: o retorno é
`WriteOutcome.REJECTED_MODELED_OVER_OBSERVED` **e** `sink.accepted == []`. Uma asserção só sobre
o retorno não provaria que a linha ficou fora do armazenamento — só que a função DISSE que sim.

### A guarda estrutural — a mesma forma de `test_verified_edge_call_sites.py`, para um segundo escritor

`test_single_writer_call_sites.py` varre `backend/src` por AST e conta chamadas diretas a
`write_series_row`: hoje são **exatamente 1**, dentro de `run_single_writer.py`.
`ADR-002`/D5 elimina a concorrência de escrita "por construção", e essa frase só continua
verdadeira enquanto o grafo de chamadas tiver um único caminho até `sink.accept` — o dia em que
esse número virar 2, um segundo escritor de produção existe e este teste reprova pelo nome, não
por acaso. O mesmo arquivo nomeia o ponto cego que herda de `test_verified_edge_call_sites.py`:
`getattr(modulo, "write_series_row")(...)` com o nome calculado em runtime não é visto — o mesmo
limite que `[tool.importlinter]` já documenta para o próprio grafo de imports.

### O schema de wire fica de fora, por decisão e não por esquecimento

Nenhum produtor publica na fila ainda — `RedisStreamPublisher` (`T-07.4`) segue com zero
chamadores de produção, o mesmo grep que `test_redis_series_write_queue.py` roda. Fixar um
layout de campos aqui seria decisão a partir de premissa, o mesmo erro que
`ingest_verified_payload.py:32` nomeia e recusa para outro port desta árvore. Por isso `decode`
é um `Callable` INJETADO em `RedisSeriesWriteQueue`, e o dono do schema real é a task que ligar
o primeiro produtor à fila.

### Achado do próprio `fakeredis`, nomeado e contornado — não é defeito deste adapter

`RedisStreamConsumerGroup.read_pending` sobre um Pending Entries List JÁ VAZIO **trava**, medido
isoladamente com as classes cruas de `T-07.4`, sem nenhum código deste adapter envolvido — nem
`test_redis_stream_bus.py` exercita essa forma (seus `read_pending` sempre têm PEL não-vazio).
`test_ack_forwards_the_entry_id_unchanged_to_the_consumer_group` confirma o `ack` via `XPENDING`
direto (a mesma técnica que `test_skipping_read_pending_loses_the_unacked_messages_forever` já
usa para o caso espelho) em vez de chamar `read_pending` nesse estado.

**Uma segunda forma do mesmo dublê, medida à parte**: chamar `ensure_group()` DUAS vezes — uma
vez na criação, outra simulando um "restart" — imediatamente antes de `read_pending` sobre um
PEL NÃO-vazio corrompe a conexão do mesmo jeito, mesmo com uma entrada de verdade para entregar
`[MEDIDO 2026-09-02: mesma reprodução isolada com as classes cruas — COM o segundo
`ensure_group()` antes de `read_pending`, `RedisProtocolError`; SEM ele, sucesso]`. A suíte deste
adapter (`_queue(address, ensure_group=False)`) evita a forma que quebra em vez de escondê-la —
`ensure_group` NUNCA é chamado por este adapter em produção (quem constrói o
`RedisStreamConsumerGroup` decide isso fora dele), então o achado é só da bancada de teste.

### `test_as_of_is_the_single_reader.py` ganha a 4ª entrada declarada — e a doctring dela estava desatualizada antes desta task

`write_series_row` toca `row.bucket_end`, mas só para identificar o bucket num `extra={}` de
`logger.info` — nunca como instante de decisão contra o qual algo é comparado — então entra em
`DECLARED_TOUCHERS` na mesma categoria de `reject_clock_skew`/`record` (caminho de ESCRITA, não
de leitura). Ao editar essa lista, a docstring do arquivo já estava errada ANTES desta task: dizia
"36 módulos, DOIS" quando `DECLARED_TOUCHERS` já carregava uma 3ª entrada
(`sqlite_series_quarantine_store.py`, de `T-02.2`) nunca mencionada ali, e a árvore já tinha
crescido. Corrigido para o número medido agora, com o comando:
`python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"` →
**116** `[MEDIDO 2026-09-02]`.

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`format --check`/`mypy --strict`, 221
arquivos). `bash backend/scripts/test.sh` → **rc=0**, `1174 passed, 3 warnings` (302 s) — os 3
`ResourceWarning` são o mesmo achado pré-existente já nomeado na seção de `T-03.11`, não desta
task. Cobertura total **97,48%** — `domain 99,8%` (meta 90%, `2266/2270`) · `use_cases 100%`
(meta 80%, `585/585`) · `infra 95,1%` (meta 70%, `2187/2300`); `write_series_row.py`,
`run_single_writer.py` e `redis_series_write_queue.py` fecham os três em **100%** — a primeira
versão de `redis_series_write_queue.py` fechava em 96% (a linha de `read_pending` sem cobertura,
porque só `read_new` tinha teste direto); `test_read_pending_decodes_the_unacked_tail_after_a_restart`
foi acrescentado para fechar a lacuna com um teste que prova o caminho de recuperação de `D7.10`,
não para satisfazer o número. `bash backend/scripts/boundaries.sh` → `3 kept, 0 broken` (148
arquivos, 675 dependências) — as três peças novas respeitam `infra > use_cases > domain` e
`Natureza`. `harness rules --mode sweep --changed-only` → **rc=0**, nenhum achado sobre os 12
arquivos alterados/novos desta task (`git status --short`: 5 modificados incluindo os 2 docs, 7
novos). **21 testes NOVOS desta task** `[MEDIDO: pytest --collect-only -q sobre as 4 suítes
novas (4+4+4+4=16) mais os 3 testes novos de `test_provenance_columns.py` (2 simples + 1
parametrizado em 3 = 5)]`.

### Escopo que esta task NÃO fecha, nomeado

- **Nenhum produtor real publica na fila.** O schema de campos do wire (que chaves, que tipos)
  fica para a task que ligar o primeiro coletor 24/7 ao stream — `decode` é injetado exatamente
  para não fixar essa decisão aqui.
- **Nenhum sink de armazenamento concreto.** `ADR-002`/D4 (candidato 4 × 5) segue pendente de
  spike (`T-08.1`, `status = blocked`); `SeriesSink`/`ObservedLookup` são `Protocol`s que
  qualquer um dos cinco candidatos pode implementar depois, sem mudar `write_series_row`.
- **`CA-F4-25`** (recusar sob divergência de `knowledge_time`) não é fechado por esta task — é a
  garantia de reprodutibilidade de `run_registry` (`04_contrato_temporal.md` item 4.10, já
  fechada por `T-04.4`'s `as_of_accessor.py`), não uma segunda invariante do escritor único; o
  `ADR-002`/D5 as cita juntas porque as duas exigem "ler antes de escrever", não porque vivem no
  mesmo código.

## 📎 2026-09-02 por `T-07.6` — particionamento dimensionado contra a vazão MEDIDA de um único símbolo

`CST-60`, `CA-F3-7`, plano `07` item 7.8, DoD `D7.11`. A medição que existe é por SÍMBOLO ÚNICO —
`docs/specs/PRD-001-plataforma-dados.md` `CA-F3-7` e o plano `D7.11` publicam os mesmos cinco
números sobre o `aggTrade` de um símbolo: **p50 21 · p95 204 · p99 483 · p99,9 1.251 · máx 3.224
msg/s** `[MEDIDO]`. O handoff desta task
(`docs/context/plataforma-dados/handoff/T-07.6.md`, mesclado em `master` durante a implementação
— ver "Ciclo de correção" abaixo) é explícito sobre o que "dimensionado" significa: o orçamento
por partição é o **máx** medido, gasto como se TODO símbolo da partição pudesse espicaçar ao
mesmo tempo — "dimensionar pelo p50 sub-provisiona e derruba consumidor no pico real".

| camada | arquivo | o que faz |
|---|---|---|
| `domain` | [`stream_partitioning.py`](src/modules/sentimento/domain/stream_partitioning.py) (**novo**) | `SingleSymbolThroughput` (percentis validados, não-decrescentes) + `MEASURED_SINGLE_SYMBOL_THROUGHPUT` = `D7.11` verbatim; `max_symbols_per_partition(capacity, throughput)` resolve `capacity // max`, recusando (`InfeasiblePartitionCapacityError`) capacidade abaixo do `max` medido; `partition_count(n, capacity, throughput)` = `ceil(n / max_symbols_per_partition(...))`; `partition_symbols(symbols, n)` faz o chunking determinístico, ordem preservada |
| `infra` | [`stream_partition_plan.py`](src/modules/sentimento/infra/stream_partition_plan.py) (**novo**) | `plan_stream_connections` compõe `max_symbols_per_partition` + `partition_symbols` com `combined_stream_path` (`T-03.1`, `infra/binance_stream_probe.py`) — o mesmo builder que o probe CLI já prova live sobre handshake real — para devolver, por universo de símbolos e capacidade declarada, a tupla de conexões `/stream?streams=...` já particionadas |

### Por que `partition_capacity_msg_per_second` não tem default

Este módulo mede o lado da OFERTA (quão rápido um símbolo fala). Ele nunca mediu o lado da
DEMANDA — quantas mensagens por segundo um consumidor de partição de fato drena — e cravar um
default adivinhado seria exatamente o número sem rótulo que `CLAUDE.md` ("nenhum número sem o
comando que o produziu") proíbe. Por isso `max_symbols_per_partition`/`partition_count`/
`plan_stream_connections` exigem a capacidade como argumento: quem a declara carrega o comando
que a mediu.

### O orçamento é `max` por símbolo, simultâneo — não "um pico, o resto em regime"

`n * max <= capacity` é a regra inteira: todo símbolo da partição é orçado no seu pico medido, ao
mesmo tempo que os outros. Isto é MAIS conservador que reservar `max` só para um símbolo "quente"
e `p50` para o resto — e é conservador **por instrução explícita do handoff**, não por escolha
deste código: correlação de pico entre símbolos nunca foi medida (`[NÃO MEDIDO]`), e assumir que
ela não existe (a leitura mais fraca) é exatamente o que produziria um consumidor derrubado no
dia em que a correlação aparecer. `test_p50_based_sizing_would_overflow_capacity_under_simultaneous_peaks`
(`test_stream_partitioning.py`) é o falsificador nomeado pelo handoff: sob capacidade de 10.000
msg/s, a fórmula por `p50` (rejeitada) empacotaria 323 símbolos numa partição cujo pico
simultâneo real seria `323 × 3.224 = 1.041.352` msg/s — **104× a capacidade declarada** — enquanto
a fórmula por `max` (a implementada) limita a mesma partição a 3 símbolos, cujo pico simultâneo
(`3 × 3.224 = 9.672`) cabe dentro dos 10.000 com folga.

### `p50`/`p95`/`p99`/`p999` viajam no tipo, mas não entram na aritmética

`SingleSymbolThroughput` carrega a régua de percentis inteira para que ela não possa divergir de
`D7.11` sem que algo perceba, mas só `max` alimenta `max_symbols_per_partition`/`partition_count`.
`test_only_max_feeds_the_sizing_arithmetic` prova isso: duas réguas que só concordam em `max`
dimensionam igual.

### `partition_symbols` nunca reordena

Para um coletor WS, a partição em que um símbolo cai é parte da sua identidade de reconexão
(`ADR-004`); reordenar aqui faria essa identidade depender do algoritmo de chunking em vez da
lista que o chamador declarou.

### Nenhum coletor de produção chama `plan_stream_connections` ainda — nomeado, não escondido

Mesma forma de `T-07.4`/`T-07.5`: `RedisStreamPublisher` segue com zero chamadores de produção, e
`combined_stream_path` só é chamado hoje pelo CLI de PROBE (`aggtrade_nq_probe_cli.py`, `T-03.1`),
nunca por um coletor 24/7 real. `plan_stream_connections` é a peça que decide QUANTAS conexões e
QUAIS símbolos cada uma carrega; ligá-la a um coletor real que efetivamente abre `N` sockets e
consome cada partição é trabalho de uma task futura, não desta.

### Ciclo de correção nomeado: o handoff chegou DEPOIS da primeira implementação

`docs/context/plataforma-dados/handoff/T-07.6.md` não existia quando esta worktree foi criada
(`master@bf15df6`); a primeira versão desta task foi reconstruída de fontes primárias (`PRD-001`,
o plano, `tasks.toml`) e usou a reserva "um pico + resto em `p50`" — mais fraca que o handoff
exige. Um `git fetch` + `merge-base` antes do commit achou `origin/master@b550a47` (handoff
mesclado em paralelo, mesma disciplina de "sempre `git fetch` antes do push" que este próprio
handoff pede), e o handoff nomeia a fórmula certa e o falsificador esperado, literalmente. A
correção substituiu `max_symbols_per_partition`, acrescentou `partition_count` e o teste de
overflow — sem tocar `partition_symbols`/`plan_stream_connections`, que já estavam corretos.

### Comandos rodados e resultado

`bash backend/scripts/lint.sh` → limpo (`ruff check`/`ruff format --check`/`mypy --strict`, 227
arquivos). `bash backend/scripts/test.sh` → **rc=0, 1209 passed** (era 1184 antes desta task; **25
testes NOVOS** `[MEDIDO: pytest --collect-only -q sobre as 2 suítes novas → 18+7]`), cobertura
**97,52%** — `domain` **99,8%** (2341/2345, meta 90%), `use_cases` **100,0%** (585/585, meta
80%), `infra` **95,1%** (2195/2308, meta 70%); `stream_partitioning.py` (35 linhas) e
`stream_partition_plan.py` (8 linhas) fecham os dois em **100%**. `harness rules --mode sweep
--changed-only` (arquivos `git add`ados antes de rodar — rodar sobre arquivo *untracked* devolve
falso-verde, achado já nomeado por `T-03.10`) → 1ª rodada (antes do handoff aparecer): **2
`[AVISO]`** `core.module-docstring-single-line` (docstring de módulo multi-linha nos 2 arquivos
novos), corrigidos no mesmo ciclo para o padrão de uma linha do repositório (conteúdo movido para
comentário `#` logo abaixo, mesma forma de `quota_bucket.py`/`clock_skew_tolerance.py`); rodadas
seguintes (inclusive após a correção de fórmula) → **0 achados**.

### Escopo que esta task NÃO fecha, nomeado

- **Nenhum coletor WS de produção existe.** `plan_stream_connections` decide o particionamento;
  abrir `N` conexões reais e consumi-las é trabalho de uma task futura (o mesmo estado em que
  `T-07.4`/`T-07.5` deixaram a fila e o escritor único: mecanismo pronto, sem produtor ligado).
- **Correlação de pico entre símbolos segue `[NÃO MEDIDO]`.** O orçamento por `max` simultâneo é
  a leitura CONSERVADORA que o handoff exige exatamente por essa ausência de medição — não uma
  medição de quantos símbolos podem espicaçar juntos.
- **Nenhuma decisão de `partition_capacity_msg_per_second` de produção é tomada aqui** — o
  número é responsabilidade de quem operar o coletor real, com o comando que o mediu.

## 📎 2026-09-02 por `T-07.9` — `instrument_alias`: YAML versionado, `evidence_url` OBRIGATÓRIO por validação

`Q12`'s mecanismo (`SPEC-001` §3.4, plano `07` item 7.11, `CST-63`). `Q12` continua `ABERTA`
(`docs/decisoes-do-owner.md`) — o que ela deixa em aberto é o CONTEÚDO (~5 linhas/ano de
renomeações curadas), não se o mecanismo que as lê deve existir. Mesma postura de
`T-07.10`/`clock_skew_tolerance.py`: constrói o mecanismo real, zero entrada fabricada.

### As peças, e a camada de cada uma

- [`domain/instrument_alias.py`](src/modules/sentimento/domain/instrument_alias.py) (**novo**):
  `AliasEntry` (as 4 colunas de `SPEC-001` §3.4 — `from_symbol`/`to_symbol`/`effective_from`/
  `evidence_url`, nomes em inglês por ser contrato NOVO sem herança de `janela_de_perda`) valida
  `evidence_url` **por construção** (`MissingEvidenceUrlError`, nunca convenção) e recusa alias
  para si mesmo. `InstrumentAliasCatalog.resolve(symbol, at)` decide CONTINUIDADE — nunca
  PERTENCIMENTO (`universe_at`/`T-07.8` é a outra pergunta) — andando a cadeia inteira de
  renomeações em uma chamada, com `AliasCycleError` guardando contra uma curadoria que ciclasse.
  `date` usado como VALOR (nunca `.today()`/`.now()`), mesma exceção de `Natureza`
  (`ADR-016/D1`) que `domain/dump_window.py` já usa, confirmada por `make natureza` — **0
  leitura(s) de relógio** sobre os 68 arquivos de `domain`+`use_cases`.
- [`infra/instrument_alias_reader.py`](src/modules/sentimento/infra/instrument_alias_reader.py)
  (**novo**): lê o arquivo do disco e delega TODA validação de forma a `domain` — a fronteira
  que o handoff pediu explicitamente. `yaml.YAMLError` nunca escapa cru (`from exc`,
  `core.silent-except`).
- [`config/instrument_alias.yaml`](config/instrument_alias.yaml) (**novo**): o arquivo
  versionado real, `aliases: []` — **zero entradas reais**. `MATICUSDT -> POLUSDT` e
  `RNDRUSDT -> RENDERUSDT` (os dois renomes `[MEDIDO]` que motivam o mecanismo) **não** entram
  aqui: listá-los sem `evidence_url` curado pelo owner seria exatamente o atalho "inferido, nunca
  curado" que o handoff proíbe.
- **Nova dependência de RUNTIME**: `pyyaml==6.0.3`, pin exato (`backend/pyproject.toml`),
  primeira desde que `T-01.6` declarou `dependencies = []`. Justificada em comentário no próprio
  `pyproject.toml`: o formato YAML é FIXADO pelo `SPEC-001`/plano `07`, e escrever um parser de
  subconjunto à mão trocaria uma biblioteca auditada por código próprio não testado contra a
  gramática real.

### O falsificador — a direção do calendário

`test_resolve_returns_the_old_symbol_strictly_before_effective_from` é o caso que pegaria uma
inversão `<`/`<=` (a mesma classe de defeito que `as_of_accessor.py` já documenta ter caçado):
um dia ANTES de `effective_from`, `resolve` tem que devolver o símbolo ANTIGO, não o novo.
`test_resolve_refuses_a_cycle` prova que uma curadoria `A -> B`, `B -> A` recusa
(`AliasCycleError`) em vez de laçar para sempre.

### Comandos rodados e resultado

- `bash backend/scripts/test.sh` → **`1225 passed`**, cobertura total **97,56%**; por camada
  (`ADR-009/D1`): domain **99,8%** (meta 90%), use_cases **100,0%** (meta 80%), infra **95,1%**
  (meta 70%) — as 3 camadas declaradas, todas `[OK]`.
- `bash backend/scripts/lint.sh` → `ruff check`/`ruff format --check`/`mypy --strict` **sem
  achado**, 227 arquivos.
- `bash backend/scripts/boundaries.sh` → **3 kept, 0 broken** (152 arquivos, 689 dependências).
- `bash backend/scripts/natureza.sh` → **68 arquivo(s), 0 leitura(s) de relógio**.
- `harness rules --mode sweep --changed-only` → 2 `[AVISO]` (`core.module-docstring-single-line`,
  não bloqueante — mesmo estilo de docstring de módulo multi-parágrafo já usado em
  `checksum_manifest.py`/`clock_skew_tolerance.py`), **0 `[BLOQUEIO]`**.

### Escopo que esta task NÃO fecha, nomeado

- **`Q12` continua `ABERTA`.** Esta task entrega o MECANISMO; curar o CONTEÚDO (quais pares
  entram, com `evidence_url` de verdade) é decisão do owner, registrada em
  `docs/decisoes-do-owner.md`.
- **Nenhum consumidor real chama `InstrumentAliasCatalog.resolve` ainda** — `T-07.9`'s handoff é
  explícito: "sem tela", mecanismo backend puro, consumido por código futuro (ex.: o
  survivorship de `T-07.2`), não por esta task.
- **Sem CLI.** Ao contrário de `clock_skew_tolerance_cli.py`, este mecanismo não ganhou um ponto
  de entrada de linha de comando — nada na task pede um, e um consumidor real decide a forma da
  integração quando existir.

## 📎 2026-09-02 por `T-06.1` — `series_catalog`: o contrato lido pelos testes, raiz da fase 06

`SPEC-001` §3.3, plano `06` itens **6.1 + 6.5 + 6.15** (`CST-45`). Esta é a task-raiz da fase
06 inteira — `T-06.2`..`T-06.10` dependem dela — e o escopo é deliberadamente estreito: o
CONTRATO (o tipo e a validação), não o conteúdo de produção de nenhuma série real e não o
mecanismo de quarentena (`T-06.6`).

### A peça

[`domain/series_catalog.py`](src/modules/sentimento/domain/series_catalog.py) (**novo**):
`SeriesCatalogEntry` envolve `SeriesKey` (`T-04.2`, reusado — não redefinido) com os campos
que `SPEC-001` §3.3 pede ALÉM da identidade:

- `native_grid` — campo **por linha**, nunca constante de módulo (`CA-F2-11`): a Coinalyze
  resolve `1min`, o `daily/metrics` da Binance resolve `5min`, e uma constante mislabelaria
  quem não é o dono dela.
- `max_staleness_ms` — obrigatório, positivo; é até onde um leitor pode `LOCF` (`SPEC-001`
  §3.2).
- `price_use` — opcional, restrito ao conjunto fechado de `SPEC-001` §3.7 (`InvalidPriceUseError`
  fora dele).
- `reconstructed_from` + `published_error` (`PublishedError.median_bp/p99_bp/n`) — obrigatórios
  **juntos**: uma série que se declara reconstrução de outra fonte sem `(mediana, p99, n)`
  reprova, literal de `SPEC-001` §3.3 ("`"bv` serve"` e `"bv` serve com p99 de 29,34 bp`" são
  afirmações diferentes").

`unit`, `denom`, `label_shift` e `verified_by` **não** são repetidos como campos do catálogo:
são quatro dos quinze termos que `SeriesKey.__post_init__` já recusa em branco
(`IncompleteSeriesKeyError`) — duplicá-los aqui criaria um segundo lugar para a mesma
obrigação divergir do primeiro. `SeriesCatalog` (o container) recusa duas linhas com o mesmo
`series_key_id()` — a "UMA linha por `SeriesKey`" de `§3.3` como falsificador, não como
comentário.

### O falsificador central — o teste lê o catálogo, não duplica valor

[`test_series_catalog.py`](tests/sentimento/test_series_catalog.py) (**novo**, 26 testes) chama
`SeriesCatalogEntry`/`PublishedError`/`build_series_catalog` de produção em todo
`pytest.raises` — nenhum valor esperado é recopiado à mão. Cobre: ausência de
`unit`/`denom`/`verified_by` (via `SeriesKey`, `IncompleteSeriesKeyError`), `native_grid` em
branco, `max_staleness_ms` não-positivo, `price_use` fora do conjunto fechado, reconstrução
sem erro publicado E o caso simétrico (erro publicado sem `reconstructed_from`), e duas linhas
para a mesma `SeriesKey`.

### Comandos rodados e resultado

- `bash backend/scripts/test.sh` → **1277 passed**, cobertura total **97,61%**; por camada
  (`ADR-009/D1`): domain **99,8%** (meta 90%), use_cases **100,0%** (meta 80%), infra **95,1%**
  (meta 70%) — as 3 camadas declaradas, todas `[OK]`.
- `bash backend/scripts/lint.sh` → `ruff check`/`ruff format --check`/`mypy --strict` **sem
  achado**, 234 arquivos.
- `bash backend/scripts/boundaries.sh` → **3 kept, 0 broken** (155 arquivos, 703 dependências).
- `bash backend/scripts/natureza.sh` → **70 arquivo(s), 0 leitura(s) de relógio**.
- `harness rules --mode sweep --changed-only` → **0 achados** (o `[AVISO]` de docstring de
  módulo multi-linha, achado uma vez durante o desenvolvimento, foi corrigido no próprio
  módulo antes deste commit — `series_catalog.py` abre com docstring de uma linha e o resto
  em comentário `#`, mesmo estilo de `quarantine_terms.py`).

### Escopo que esta task NÃO fecha, nomeado

- **Zero shift/série real populado.** `T-06.2` (tabela de shift por endpoint), `T-06.3` (as
  quatro séries de L/S), `T-06.4` (funding) e `T-06.9` (preço/`cvd_source`/`fee_schedule`)
  escrevem as linhas de produção; esta task só valida a forma delas.
- **Sem quarentena.** O predicado de três termos (`label_shift IS NULL OR unit IS NULL OR
  available_at IS NULL`, `quarantine_terms.py`) é `T-06.6` — misturado aqui, deixaria aquela
  task sem o que construir.
- **Sem persistência.** Nenhum arquivo/DB grava `SeriesCatalog` ainda — é lógica pura de
  `domain`, por `ADR-016`/`Natureza`; se um dia houver um `infra/*_series_catalog_store.py`,
  ele mora naquela camada, não nesta.

## 📎 2026-09-03 por `T-06.2` — tabela de shift POR ENDPOINT: dump = REST −5 min, exceto o taker

`CA-F2-1`, plano `06` item 6.2 (`CST-46`). Popula o valor real de `SeriesKey.label_shift`
(`T-06.1`, `series_key.py`) para os cinco endpoints REST cujo dump mensal do S3
(`daily/metrics`) `T-06.2` precisa alinhar — sem reabrir `series_key.py`/`series_catalog.py`
além de consumi-los.

### A tabela e o porquê do sinal

[`domain/endpoint_shift_table.py`](src/modules/sentimento/domain/endpoint_shift_table.py)
(**novo**): `ENDPOINT_LABEL_SHIFT_MS` fixa `openInterestHist` / `topLongShortPositionRatio` /
`topLongShortAccountRatio` / `globalLongShortAccountRatio` em `+300_000` e
`takerlongshortRatio` — a EXCEÇÃO medida — em `0`. `label_shift_for_endpoint` é lookup de
dicionário sem `.get(..., default)`: um endpoint não medido **reprova**
(`UnknownEndpointShiftError`), nunca herda o shift majoritário.

O sinal é `+300_000`, não `-300_000`, apesar do handoff descrever o fato como "dump tem
timestamp REST − 5 min" — as duas frases descrevem o MESMO fato de pontas opostas.
`SeriesKey.label_shift` é somado ao timestamp do dump para alcançar o instante que o valor
de fato descreve (mesma convenção que `SPEC-001` §2.2 já fixa para a Coinalyze: "`+interval`,
na mesma direção do dump `metrics`"), e é o valor que `test_series_identity.py` já fixava para
`openInterestHist` antes desta task existir — esta tabela concorda com código que a precede,
não inventa um sinal novo.

### O falsificador — dado real, não sintético

[`test_endpoint_shift_table.py`](tests/sentimento/test_endpoint_shift_table.py) (**novo**, 16
testes) lê `data/binance/metrics/btcusdt/2026-08-23.csv` (md5
`fc8c0fba983194cf356a7d172b3bd39e`) e `data/binance/rest/rest_oi.json` (md5
`a3a941904ab9bbe27024929d157ca6d1`) — os mesmos dois arquivos que `docs/recorte-plataforma.md`
linha 163 já cita. `[MEDIDO 2026-09-03]`: os dois têm exatamente 288 linhas para o mesmo dia
UTC, e casar `create_time + 300_000` contra o `timestamp` do REST bate **288 de 288**, com
`sum_open_interest` batendo `sumOpenInterest` a **MAE = 0,000000**.

**A mutação que o teste tem de reprovar, e por que a versão ingênua não bastava:** aplicar o
shift `0` (o do taker) ao `openInterestHist` real ainda casa **287 de 288** timestamps — o
dump publica na MESMA grade de 5 min que o endpoint, então a linha `i` do dump colide com a
linha `i+1` do REST por pura periodicidade, não porque o shift esteja certo. O que a mutação
realmente quebra é o VALOR: `sum_open_interest` pareado com o bucket ERRADO do REST tem
**MAE ≈ 41,9 BTC** (máx ≈ 496,8) contra o `0,000000` do shift correto — por isso
`match_dump_to_rest_by_shifted_timestamp` existe separado de `mean_absolute_error`, e o teste
verifica as DUAS, não só a contagem de casamentos.

A exceção do taker é provada do mesmo jeito, na direção oposta: contra
`data/binance/rest/r_takerlongshortRatio.json` (md5 `75821a6532a742127eb91bf2a07caddb`), shift
`0` bate com MAE bem abaixo de `0,001` sobre a janela que as duas capturas compartilham (>200
pares); aplicar `+300_000` (o shift dos outros quatro) nessa mesma série derruba a MAE para
acima de `0,5` — a exceção não é apenas não testada na direção contrária, é MEDIDAMENTE PIOR.

### Comandos rodados e resultado

- `bash backend/scripts/test.sh` → **1293 passed** (era 1277; +16 novos), cobertura total
  **97,62%**; por camada (`ADR-009/D1`): domain **99,8%** (2524/2528, meta 90%), use_cases
  **100,0%** (585/585, meta 80%), infra **95,1%** (2208/2321, meta 70%) — as 3 camadas
  declaradas, todas `[OK]`.
- `bash backend/scripts/lint.sh` → `ruff check`/`ruff format --check`/`mypy --strict` **sem
  achado**, 235 arquivos.
- `bash backend/scripts/boundaries.sh` → **3 kept, 0 broken** (156 arquivos, 707 dependências).
- `bash backend/scripts/natureza.sh` → **71 arquivo(s), 0 leitura(s) de relógio**.
- `harness rules --mode sweep --changed-only` → **0 achados**.

### Escopo que esta task NÃO fecha, nomeado

- **`topLongShortPositionRatio` não tem captura REST própria em disco** (`data/MANIFEST.md`
  não cataloga uma) — seu `+300_000` é o mesmo valor medido para os outros três endpoints de
  L/S, aplicado por semelhança de forma (mesma família de endpoint, mesmo dump de origem), e
  não por medição direta desse endpoint específico. Se uma captura REST desse endpoint entrar
  em `data/`, o falsificador equivalente ao de `openInterestHist` deve ser acrescentado.
- **`buyVol`/`sellVol` do REST `takerlongshortRatio` não são persistidos aqui** — é `T-06.10`
  (plano `06` item 6.10, "SPEC-001 §5.11").
- **`series_catalog.py` não recebe linhas populadas para estes 5 endpoints** — esta task fixa
  a tabela de shift que alimentará `label_shift`/`verified_by` das linhas reais; escrever as
  linhas do catálogo com `key=SeriesKey(...)` completo é composição de tasks futuras
  (`T-06.3`/`T-06.5`/`T-06.9`), que esta não antecipa.
## 📎 2026-09-03 por `T-06.5` — `reduction` populado: OI da Coinalyze = 4 linhas, Binance = 1

`CA-F2-17`, plano `06` item **6.11** (`CST-49`). `T-06.1` já tinha construído o CONTRATO — o
termo `reduction` na `SeriesKey`, o enum `Reduction` com os seis membros certos, e a recusa de
default sobre qualquer termo de identidade (`test_series_identity.py`, escrito naquela task já
citando esta medição). O que faltava era a POPULAÇÃO: as linhas reais de `series_catalog` para
Open Interest das duas fontes — e é isso que esta task fecha.

### A peça

[`domain/open_interest_catalog.py`](src/modules/sentimento/domain/open_interest_catalog.py)
(**novo**): três funções de produção, nenhuma delas uma cópia de fixture de teste.

- `coinalyze_open_interest_key(reduction, *, instrument_id=...)` — `reduction` é parâmetro
  **posicional obrigatório, sem default**. É o falsificador `D6.7` na própria assinatura:
  chamar sem o argumento é `TypeError` nomeando `reduction`, nunca uma linha escolhida em
  silêncio entre `OPEN`/`HIGH`/`LOW`/`CLOSE`.
- `binance_open_interest_key(*, instrument_id=...)` — sempre `Reduction.POINT` /
  `TsConvention.POINT_AT_BUCKET_END`, porque a Binance só publica UMA leitura por bucket.
- `open_interest_catalog_entries(instrument_id=...)` — monta as **cinco** linhas (4 Coinalyze
  `OHLC_OVER_BUCKET` + 1 Binance `POINT`) através de `build_series_catalog` (`T-06.1`), então a
  invariante "UMA linha por `SeriesKey`" (`SPEC-001` §3.3) é validada na construção, não
  apenas assumida por este módulo.

`OPEN_INTEREST_LABEL_SHIFT_MS = 300_000` para as duas fontes — `SPEC-001` §2.1, literal: *"o
`label_shift` da Coinalyze é `+interval`, na mesma direção do dump `metrics`, e não zero"*.
`D6.8`, medido (`CST-4`, `[DOC: SPEC-001 §2.1]`): o `c` da Coinalyze casa com o
`sumOpenInterest` da Binance no mesmo `create_time` a **1,86 bp de mediana / 9,46 bp de p99
(n=1.706)**, enquanto `o(t) = c(t-300)` em só **6 de 2.141** pares — prova de que o `t` da
Coinalyze é o INÍCIO do bucket, e de que as quatro leituras são identidades genuinamente
distintas, não três mais uma repetida.

### O falsificador — contra a população de PRODUÇÃO, não contra a fixture de `T-06.1`

[`test_open_interest_catalog.py`](tests/sentimento/test_open_interest_catalog.py) (**novo**, 10
testes) chama `open_interest_catalog.py` diretamente — nunca as fixtures locais de
`test_series_identity.py`/`test_series_catalog.py`. Cobre: `D6.7` (chamar
`coinalyze_open_interest_key()` sem `reduction` ⇒ `TypeError`), as cinco identidades
distintas por `series_key_id()`, o catálogo de produção com exatamente 5 linhas (4
`coinalyze` + 1 `binance`), busca de cada uma via `entry_for`, `label_shift` positivo e igual
nas duas fontes, uma SEXTA linha duplicando um `reduction` existente reprovando por
`DuplicateSeriesKeyError` através do `build_series_catalog` real (não uma cópia da regra), e
`instrument_id` como parâmetro (não símbolo fixo).

### Comandos rodados e resultado

- `bash backend/scripts/test.sh` → **1289 passed**, cobertura total **97,62%**; por camada
  (`ADR-009/D1`): domain **99,8%** (meta 90%), use_cases **100,0%** (meta 80%), infra **95,1%**
  (meta 70%) — as 3 camadas declaradas, todas `[OK]`. `open_interest_catalog.py` em
  **100% linha/branch** (`coverage.xml`).
- `bash backend/scripts/lint.sh` → `ruff check`/`ruff format --check`/`mypy --strict` **sem
  achado**, 235 arquivos.
- `bash backend/scripts/boundaries.sh` → **3 kept, 0 broken** (156 arquivos, 707 dependências).
- `bash backend/scripts/natureza.sh` → **71 arquivo(s), 0 leitura(s) de relógio** (era 70 em
  `T-06.1`; +1 pelo módulo novo).
- `harness rules --mode sweep --changed-only` → **1 achado WARN** na primeira passada
  (`core.module-docstring-single-line`, docstring de módulo multi-linha) — corrigido para
  docstring de uma linha + comentário `#` (mesmo estilo de `series_catalog.py`/
  `quarantine_terms.py`); segunda passada: **0 achados**. Nenhum achado de severidade `block`.

### Escopo que esta task NÃO fecha, nomeado

- **Sem persistência.** `open_interest_catalog_entries()` é lógica pura de `domain`
  (`ADR-016`/`Natureza`) — nenhum store grava o resultado ainda.
- **Sem quarentena/`available_at`.** O predicado de três termos (`T-06.6`) é quem decide se
  estas cinco linhas nascem isoladas; esta task só declara a identidade e o `label_shift`.
- **Não reconcilia automaticamente.** `D6.8` é uma medição publicada, não um mecanismo de
  correção — a divergência Coinalyze×Binance continua visível como divergência, nunca
  corrigida antes de gravar.
