# Fase `02` — O retroativo de `backend/tests`: 2 arquivos, 40 identificadores, **0 mudança de comportamento**

**Componente:** `sentimento` · **Classe:** retroativo · **Depende de:** `01` · **Paraleliza com:** `03` · **Cobre:** `PRD-002`/`U2`
**Rev de ancoragem:** `master@5f4ece0`
**Fronteira:** exatamente **2 arquivos** de `backend/tests`, mais **3 citações vivas**. **`backend/src` é tocado em UM arquivo e SÓ na docstring** (`jsonl_checkpoint.py:22`).

---

## Itens

| # | item | requisito | alvo |
|---|---|---|---|
| `2.1` | `git mv` dos 2 arquivos, conforme o mapa **normativo** de `SPEC-002` §3.1 | `U2` | `sentimento` |
| `2.2` | Os **40 identificadores** renomeados conforme o mapa fechado de `SPEC-002` §3.1 | `U2` | `sentimento` |
| `2.3` | As **3 citações VIVAS** atualizadas, **no mesmo commit** (`RN-1`) | `RN-1`, `RN-2` | `sentimento` |
| `2.4` | **Nenhuma citação HISTÓRICA tocada** | `RN-2` | — |

**As 3 citações VIVAS, enumeradas — é para copiar, não para resumir:**

| arquivo | linhas | por quê é VIVA |
|---|---|---|
| `backend/README.md` | **5 linhas** (`:568`, `:569`, `:717`, `:743`, `:815`) | instrui trabalho corrente e nomeia o caminho |
| `backend/src/modules/sentimento/infra/jsonl_checkpoint.py` | **`:22`**, docstring de produção | **é `backend/src`** — a única linha desse diretório que esta fase toca |
| `backend/tests/sentimento/test_resumable_etl_backlog.py` | citação cruzada entre os 2 arquivos | é código |

**A HISTÓRICA, e ela NÃO se toca:** `docs/INDEX.md` — **append-only por `CLAUDE.md`.**

> **`docs/context/plataforma-dados/tasks.toml` NÃO cita nenhum dos 2 nomes** `[MEDIDO 2026-08-29 em 5f4ece0]` — é por isso que `02` e `03` não colidem, mesmo `03` tocando esse arquivo.

**⛔ `backend/tests/sentimento/` NÃO muda de nome.** `sentimento` é exceção de `RN-7`.

---

## DoD — cada critério nomeia o comando e o universo

| # | critério | comando | esperado |
|---|---|---|---|
| `CA-F2-1` *(a, dois lados)* | **exatamente 2** arquivos renomeados, e **nada mais** | `git diff --name-status master... -- backend/tests \| grep -c '^R'`; **e** `git diff --name-only master... -- backend/tests backend/src \| grep -v 'test_infrastructure_durability\|test_resumable_etl_backlog\|jsonl_checkpoint'` | **`2`**; e a segunda saída **vazia** |
| `CA-F2-2` *(b, dois lados)* | **zero** identificador em português, **e o total de nomes ligados INALTERADO** | o script `ast` de `PRD-002` §6/`U2`, re-rodado sobre os arquivos renomeados com o **mesmo conjunto `PT` literal** | `em_PT=0` nos dois **E** `ligados_distintos` continua **15** e **55**. **As duas metades importam: só a primeira seria satisfeita apagando código** |
| `CA-F2-3` *(d — o critério que impede a renomeação de virar reescrita)* | comportamento **idêntico** antes e depois | `make test` | **`107 passed`**, **`370` statements**, **`54` branches**, `domain` **124/124**, `use_cases` **52/52**, `infra` **194/194**, total **100%** `[MEDIDO 2026-08-29 em 5f4ece0]`. **Qualquer divergência reprova, INCLUSIVE PARA MAIS.** `rc=3` reprova — é "não mediu" |
| `CA-F2-4` *(c, por token — `RN-8`)* | nenhum nome antigo sobrevive em citação **viva** | verificador de âncora, **escopo integral** (exceção declarada de `ADR-015`/Consequência), token a token | `test_durabilidade_da_infra`: MORDE **`n=4`** → CALA **`0`**; `test_etl_backlog_retomavel`: MORDE **`n=3`** → CALA **`0`**. **Ambos os `n` declarados ANTES do rename; um `n=0` reprova a fase no ato** |
| `CA-F2-5` *(c, dois lados)* | **`sentimento/` continua `sentimento/`** | `test -d backend/tests/sentimento`; `test -d backend/tests/sentiment` | `rc=0` e **`rc=1`**. **O segundo lado é o que pega o builder que "aproveitou para arrumar"** |
| `CA-F2-6` *(c)* | `backend/src` é tocado em **1 arquivo e só na docstring** | `git diff --name-only master... -- backend/src`; **e** `git diff master... -- backend/src \| grep -cE '^[+-][^+-]' ` | **1 arquivo** (`jsonl_checkpoint.py`); e as linhas alteradas **todas dentro do bloco de docstring da linha 22** |
| `CA-F2-7` *(c)* | **nenhuma HISTÓRICA tocada** | `git diff --numstat master... -- docs/INDEX.md docs/adr docs/plans docs/specs` | **vazio** |
| `CA-F2-8` *(d)* | a árvore continua limpa | `make lint` | `rc=0`. `rc=3` reprova |
| `CA-F2-9` *(c)* | **nenhum evento de log renomeado** | `grep -rnE 'logger\.(info\|warning\|debug\|error)\("' backend/src \| wc -l` | **9**, e os **4 portugueses intactos** (`etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`) — `SPEC-002` §6.3 |

---

## Falsificador desta fase

**Apague uma docstring, um `noqa` ou uma asserção junto com a renomeação. `CA-F2-3` TEM DE REPROVAR.** Se a suíte passar com número diferente de statements, **a renomeação virou reescrita e ninguém viu** — e o número que denuncia é `370`, não o `107`.

**E o falsificador do próprio `CA-F2-2`:** o conjunto `PT` do script é **classificação humana, assinada**. Ele **não** vem de dicionário, e a razão está medida: dicionário erra em `so` (o `/qa` da `T-02.3` acusou 46 linhas por causa dele) e em `oi`, `sem`, `os`, `com`, `parametrize` (`ADR-013/D2b`). **`so_linha_em_branco` existe nesta árvore** `[MEDIDO 2026-08-29: test_etl_backlog_retomavel.py:250,251,252]` — **o falso positivo do instrumento é identificador real do repositório.** Se alguém substituir o conjunto `PT` literal por um detector, o critério deixa de ser lista fechada e vira estimativa: **reprova.**
