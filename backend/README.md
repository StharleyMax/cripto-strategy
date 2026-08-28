# `backend/` — o runner declarado e a primeira árvore de código

Nascido em **2026-08-28** pela task **`T-01.1`** (`CST-8`, fase `01`, item `1.1`, DoD `D1.1`).
Antes desta task o repositório tinha **zero código** e `harness policy --key test_cmd` devolvia
**`{}`** `[MEDIDO 2026-08-28]`.

## Os três comandos

```bash
bash backend/scripts/bootstrap.sh   # cria backend/.venv — ÚNICO passo que usa rede
bash backend/scripts/test.sh        # [test_cmd.sentimento] test  — suíte + piso por camada
bash backend/scripts/lint.sh        # [test_cmd.sentimento] lint  — ruff + ruff format + mypy --strict
```

`test.sh` e `lint.sh` **RECUSAM com saída 3** se `backend/.venv` não existir, em vez de cair para o
`python3` do `PATH`. O motivo é medido neste disco: `python3` resolve hoje para
`…/harness-panel/.venv/bin/python3` (3.12.8) por vazamento de `PATH`, e o `pyenv` deste repositório
resolveria **3.13.13** pelo `.python-version` da raiz. **Dois ambientes, o mesmo comando** — e um
portão que roda em ambiente não declarado mede outra coisa.

### As outras duas recusas, acrescentadas em 2026-08-28 pelo `/review`

| recusa | o que ela impede | prova de que morde |
|---|---|---|
| **`test.sh` apaga `coverage.xml` antes do pytest**, e `check-coverage-layers.sh` exige o XML **mais novo que o `.py` mais novo de `src/`** | o portão anunciar cobertura lida de **relatório velho**. `test.sh` repassa `"$@"`, logo aceita `--no-cov`/`-k`: sem invalidar o relatório, `--no-cov` não escrevia XML nenhum e o piso media o da **rodada anterior** | `[MEDIDO 2026-08-28: bash backend/scripts/test.sh --no-cov -k test_pendente_preserva_a_ordem_declarada → **rc=3**, `RECUSA: … coverage.xml ausente`. **Antes** do conserto, o **mesmo comando** → `1 passed, 13 deselected` + três `[OK]` 100% + **rc=0**, com o XML **byte-idêntico** (md5 `73dbab8d…`) ao de **3 h antes**]` |
| **`bootstrap.sh` confere a versão efetiva do venv** e sai 3 se não for 3.12 (`ADR-009/D4`) | o venv nascer **3.13 em silêncio**. Antes ele escolhia interpretador **por nome** e só **imprimia** a versão — informava, não recusava | `[MEDIDO 2026-08-28: num `PATH` em que só existe 3.13, `bootstrap.sh` → **rc=3**, `RECUSA: o venv nasceu em Python 3.13.12, e ADR-009/D4 declara Python 3.12`, e **nada foi instalado** — o assert roda antes do `uv pip install`. Caminho feliz → **rc=0**, `Python 3.12.13 … (alvo ADR-009/D4: 3.12, CONFERIDO)`]` |

**Por que a cobertura precisou das duas metades:** o `rm -f` protege quem entra por `test.sh`; a
checagem de frescor protege a chamada **direta** de `check-coverage-layers.sh` e o caso de um `.py`
editado **depois** da última suíte verde. `[MEDIDO 2026-08-28: touch em
`src/modules/sentimento/domain/etl_backlog.py` + chamada direta do piso → **rc=3**, com o arquivo
ofensor nomeado na saída]`.

**E o nome do binário não é a versão** — este disco prova: `command -v python3.12` →
`…/harness-panel/.venv/bin/python3.12` `[MEDIDO 2026-08-28]`, **o venv de outro projeto**. O
`.python-version` = 3.13.13 da raiz continua onde estava: removê-lo é `T-01.4`, e o assert acima
**não** é substituto disso — é a recusa que faltava enquanto ele existe.

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
| **`venv` + `uv pip` + `requirements-dev.txt` fixado**, e **não Poetry** | `ADR-009/D1` enumera as 4 peças copiadas do vizinho e **Poetry não é uma delas**. `uv 0.10.12` já está no disco e resolve sem decidir formato de lock | se uma dependência de runtime entrar e a resolução transitiva derivar entre clones, o lock passa a valer e a escolha vira ADR |
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
  src/ tests/ scripts/ pyproject.toml requirements-dev.txt
# scripts/test.sh:8:# ZERO REDE: nenhum teste desta suite chama Binance, Bybit ou Coinalyze. ...
# scripts/test.sh:11:# com `socket` amputado por um `sitecustomize.py`, que alcanca tambem o ...
```

**Re-medido em 2026-08-28 DEPOIS de escrever esta passada** (`/review`: itens B/D/E/F/G/H/I mexeram
em `scripts/test.sh`, `scripts/check-coverage-layers.sh`, `scripts/bootstrap.sh` e neste `README.md`)
— **continua 2, e o universo continua 19**. O procedimento é a lição, não o número: *o texto que
descreve a medição vive dentro do universo medido*, então escrever "Coinalyze" num comentário de
`src/`, `tests/` ou `scripts/` cria uma ocorrência nova. **Este número só vale re-rodado depois da
última edição** — não antes.

**[MEDIDO 2026-08-28]: 2 ocorrências**, ambas prosa de comentário no mesmo arquivo
(`scripts/test.sh:8` e `:11` — a frase que declara a ausência de rede e a que nomeia o
instrumento que a prova), universo **19 arquivos** — os 17 `.py`/`.sh` sob `src/`,
`tests/` e `scripts/`, mais `pyproject.toml` e `requirements-dev.txt`. **As duas são prosa de
comentário** — o grep pegou a frase que declara a ausência de rede (`:8`) e a que nomeia o
instrumento de runtime que a prova (`:11`). Nenhuma é chamada de rede.
Excluindo linhas de comentário, **[MEDIDO 2026-08-28]: 0 ocorrência**:

```bash
cd backend && grep -rnE '<mesmo padrão>' src/ tests/ scripts/ pyproject.toml requirements-dev.txt \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#'
# (vazio)
```

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
| **medida** | `[MEDIDO 2026-08-28: grep -rnE '^\s*(from\|import)\s+' backend/src --include='*.py'` sobre os **10** arquivos de produção → **1 único import interno** em todo `backend/src/`, `use_cases → domain` (`drain_etl_backlog.py:8`); **`domain` importa zero** módulo interno; `import-linter` **não está** em `requirements-dev.txt` nem em `pyproject.toml`]` |
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
