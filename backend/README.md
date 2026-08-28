# `backend/` — o runner declarado e a primeira árvore de código

Nascido em **2026-08-28** pela task **`T-01.1`** (`CST-8`, fase `01`, item `1.1`, DoD `D1.1`).
Antes desta task o repositório tinha **zero código** e `harness policy --key test_cmd` devolvia
**`{}`** `[MEDIDO 2026-08-28]`.

## Os três comandos — e desde 2026-08-28 eles têm uma fachada

```bash
make setup   # cria backend/.venv com POETRY + instala frontend/node_modules — ÚNICO passo com rede
make test    # [test_cmd.sentimento] test  — suíte + piso por camada
make lint    # [test_cmd.sentimento] lint (backend) + ESLint do projeto (frontend)
```

O `Makefile` da raiz (`ADR-011/D2`, `T-01.6`) é a **fachada**: ele **chama** os scripts abaixo, que
continuam sendo a **implementação**. Os comandos diretos continuam válidos e são os que este
documento cita nas medições:

```bash
bash backend/scripts/bootstrap.sh   # o que `make setup` chama
bash backend/scripts/test.sh        # o que `make test` chama
bash backend/scripts/lint.sh        # o que `make lint-backend` chama
```

**Por que as medições citam o script e não o `make`:** quando uma receita falha, o `make` sai com
**2**, qualquer que seja o `rc` do comando. As recusas deste repositório distinguem **`rc=3`** ("não
mediu") de **`rc=1`** ("mediu e reprovou"), e essa distinção só é visível na chamada direta
`[MEDIDO 2026-08-28: `make boundaries` → `make: *** [Makefile:135: boundaries] Erro 3`, e o `make`
sai **2**; `bash backend/scripts/test.sh --no-cov -k <1 teste>` → **3**]`. Para portão ("passou ou
não"), `make` basta.

`test.sh` e `lint.sh` **RECUSAM com saída 3** se `backend/.venv` não existir, em vez de cair para o
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
`patch = "3.13.13"`]`. Quem migrar um clone que já tinha bootstrapped sem o `poetry.toml` precisa de
`poetry -C backend env remove --all` antes — e a recusa do `bootstrap.sh` diz isso na saída.

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

## O que existe, e por quê

| caminho | camada | papel |
|---|---|---|
| `src/modules/sentimento/domain/etl_backlog.py` | `domain` | a janela **fechada e enumerada a priori** (`SPEC-001` §5.7) e o cálculo do pendente. Zero IO |
| `src/modules/sentimento/use_cases/drain_etl_backlog.py` | `use_cases` | a drenagem retomável e as duas **portas** (`ItemWorker`, `Checkpoint`) |
| `src/modules/sentimento/infra/jsonl_checkpoint.py` | `infra` | checkpoint durável em JSONL append-only, `fsync` por linha, cauda truncada descartada |
| `src/modules/sentimento/infra/file_etl_worker.py` | `infra` | publica por **rename atômico** ⇒ reprocessar é inócuo |
| `tests/sentimento/test_etl_backlog_retomavel.py` | — | **`CA-F0-5` / `D3.1`**: 120 arquivos, `SIGKILL` de verdade no meio, retomada |
| `tests/sentimento/test_durabilidade_da_infra.py` | — | a durabilidade **observada**: `os.fsync` espiado por `monkeypatch`, conteúdo já no arquivo e `rename` ainda não feito **no instante da chamada** |
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
**`0 ocorrência`** para o grep abaixo, e a correção seguinte disse **`1`**. **São `2`** — e a
segunda nasceu *dentro* da própria iteração que corrigiu a primeira, o que é a lição:
número medido envelhece com a edição seguinte. Corrigi **o número, não o comando** — o comando
está certo, o universo está certo, e as duas ocorrências são nomeadas, não escondidas:

```bash
cd backend && grep -rnE 'http|socket|requests|urllib|websocket|Binance|Bybit|Coinalyze|api[_-]?key|API_KEY' \
  src/ tests/ scripts/ pyproject.toml poetry.toml
# scripts/test.sh:8:# ZERO REDE: nenhum teste desta suite chama Binance, Bybit ou Coinalyze. ...
# scripts/test.sh:11:# com `socket` amputado por um `sitecustomize.py`, que alcanca tambem o ...
# scripts/bootstrap.sh:84:# "Zero rede, zero chave", varre `scripts/` com um padrao que casa `http` ...
```

**⚠️ O COMANDO MUDOU EM 2026-08-28 (`T-01.6`), e o número mudou com ele.** `requirements-dev.txt`
**deixou de existir** — as 5 dependências migraram para `[tool.poetry.group.dev.dependencies]` do
`pyproject.toml` (`ADR-011/D1`) — e `poetry.toml` entrou no lugar dele na varredura. **`poetry.lock`
ficou de FORA, e a exclusão é declarada com o número:** ele é gerado por máquina e teria **1
ocorrência** `[MEDIDO 2026-08-28: `poetry.lock:545` → `dev = [..., "requests", ...]`, a lista de
`extras` opcionais do `pytest` — metadado de pacote, não dependência instalada]`. Incluí-lo somaria
ruído de metadado a um portão que existe para achar chamada de rede.

**Re-medido em 2026-08-28 DEPOIS de escrever esta passada** (`/review`: itens B/D/E/F/G/H/I mexeram
em `scripts/test.sh`, `scripts/check-coverage-layers.sh`, `scripts/bootstrap.sh` e neste `README.md`)
— **continua 2, e o universo continua 19**. O procedimento é a lição, não o número: *o texto que
descreve a medição vive dentro do universo medido*, então escrever "Coinalyze" num comentário de
`src/`, `tests/` ou `scripts/` cria uma ocorrência nova. **Este número só vale re-rodado depois da
última edição** — não antes.

**[MEDIDO 2026-08-28, RE-RODADO por `T-01.6` depois da migração para Poetry]: 3 ocorrências**,
**as três prosa de comentário**, universo **19 arquivos** — os 17 `.py`/`.sh` sob `src/`, `tests/` e
`scripts/`, mais `pyproject.toml` e `poetry.toml`. As duas antigas continuam em `scripts/test.sh:8`
e `:11`; **a terceira nasceu nesta passada**, em `scripts/bootstrap.sh:84`, e é a lição do parágrafo
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

**Universo declarado com precisão:** este `README.md` **não** está na varredura, de propósito — ele
cita os três nomes de exchange nesta mesma seção, e incluí-lo faria o portão medir a si mesmo.

### E a evidência que vale mais que o grep: zero rede em RUNTIME

Grep é evidência **textual** — prova que ninguém escreveu a palavra, não que ninguém abriu soquete.
A prova de comportamento é rodar a suíte com `socket` amputado, e ela também alcança o **subprocesso
do driver** (que recebe `PYTHONPATH=<backend>`, o mesmo diretório do `sitecustomize.py`):

```bash
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
| **o que acontece agora** | `[MEDIDO 2026-08-28: **2 failed, 12 passed**]`, e os dois que reprovam são exatamente os dois de `test_durabilidade_da_infra.py` |

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
| A **janela de risco real** de "não duplica" — item publicado mas **não** registrado, depois reprocessado — **não é garantida** pelo teste de `D3.1`: o relógio é dominado pelo `sleep` dentro de `transform`, logo **antes** do `os.replace`, e o teste **não afirma onde a morte caiu**. Hoje a propriedade é **reivindicada** por um teste e **provada** por outro (o de idempotência) | **[MEDIDO]** por leitura das asserções — nenhuma delas fala da janela | `tests/sentimento/test_etl_backlog_retomavel.py`, docstring do teste de `D3.1` | **`T-03.10`** (fase `03`) |
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
| **medida** | `[MEDIDO 2026-08-28: dos **13** `.py` versionados sob `backend/`, exatamente **2** citam ≥ 3 das 4 peças — `tests/helpers/drain_driver.py` (**4 de 4**) e `tests/sentimento/test_etl_backlog_retomavel.py` (**4 de 4**). Em `backend/src/`, **nenhum** módulo fora de `infra/` conhece as duas implementações]` |
| **por que importa** | quem monta o objeto **decide a direção das dependências**. Hoje quem monta é o teste, e teste pode depender de tudo |
| **o risco concreto** | o **primeiro chamador de produção** — **`T-03.10`** — vai ter de **inventar onde isso mora**, e os dois candidatos naturais **invertem a direção**: em `use_cases`, a camada de caso de uso passa a conhecer `infra`; em `infra`, a borda passa a orquestrar o caso de uso |
| **dono** | **`T-03.10`** — é ela que traz o primeiro chamador de produção, e portanto a primeira que **não pode** adiar a decisão |
| **falsificador** | se `T-03.10` puder ligar as quatro peças sem nenhum módulo novo e sem `use_cases` ou `infra` importar para o lado errado, o achado era falso alarme |

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
