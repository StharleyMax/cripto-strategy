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
