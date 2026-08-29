# cripto-strategy

Plataforma pessoal de análise quantitativa de cripto-derivativos: **estrutura de preço**, **sentimento**
(Open Interest, Funding, Long/Short) e **order flow** (CVD), em prazos operacionais de **15m / 1h / 4h**,
com decisão **no fechamento do bucket**.

> ## ⚠️ Estado real: a primeira árvore de código existe, e ela é pequena
>
> Este repositório está na **fase de plataforma e dados**. O que existe é especificação com evidência
> medida **mais** o esqueleto executável que a fase `01` exige: **13 arquivos `.py`** em
> `backend/src` + `backend/tests`
> `[MEDIDO 2026-08-28: find backend/src backend/tests -name '*.py' -not -path '*/__pycache__/*' | wc -l → 13]`.
> Nenhum coletor de mercado roda ainda.
>
> O pipeline (`harness`) está em **`BUILD_AUTHORIZED`**
> `[MEDIDO 2026-08-28: harness pipeline state plataforma-dados]`. Rode `harness status plataforma-dados` para o estado corrente — **o ledger é a
> verdade, não este arquivo**.

## Comece por aqui

| se você quer | leia |
|---|---|
| **entender como os fluxos funcionam, em diagramas** | **[`docs/arquitetura-fluxos.md`](docs/arquitetura-fluxos.md)** ← ingestão · estrutura de dados · gráfico · estratégia · alertas |
| o contrato técnico completo | [`docs/specs/SPEC-001-plataforma-dados.md`](docs/specs/SPEC-001-plataforma-dados.md) (`DRAFT`) |
| as decisões de arquitetura, cada uma com falsificador | [`docs/adr/`](docs/adr/) — `ADR-001`..`ADR-011` |
| o que vai ser construído, em ordem | [`docs/plans/SPEC-001-plataforma-dados/index.md`](docs/plans/SPEC-001-plataforma-dados/index.md) |
| os requisitos e o porquê de cada um | [`docs/specs/PRD-001-plataforma-dados.md`](docs/specs/PRD-001-plataforma-dados.md) |
| **o que ainda depende de decisão do owner** | [`docs/decisoes-do-owner.md`](docs/decisoes-do-owner.md) — 20 perguntas, com estado |
| onde roda, e com que stack | [`docs/premissas-de-infra-e-stack.md`](docs/premissas-de-infra-e-stack.md) |
| tudo que já foi produzido, em ordem cronológica | [`docs/INDEX.md`](docs/INDEX.md) (append-only) |

## Setup e ativação da venv — tudo por `make`

O `Makefile` da raiz é a **fachada única** de comandos (`ADR-011/D2`). Ele **chama**
`backend/scripts/*.sh`, não os absorve — os scripts continuam sendo a implementação, e é a eles que as
medições deste repositório se referem.

```bash
make            # ou `make help`: lista os alvos. É o alvo padrão
make setup      # cria backend/.venv com Poetry e instala frontend/node_modules
                # ÚNICO alvo que usa rede
eval "$(make venv)"   # ATIVA a venv no SEU shell — leia a nota abaixo
make lint       # ruff + ruff format --check + mypy --strict, e o ESLint do projeto
make test       # a suíte + o piso de cobertura POR CAMADA
```

**Pré-requisitos:** `poetry` no `PATH` (`ADR-011/D1`) e um Python **3.13** (`ADR-011/D5`; a raiz fixa
`3.13.13` em `.python-version`). Faltando qualquer um, `bootstrap.sh` **recusa com `rc=3` e nomeia o que
falta** — ele **não** cai para o `python3` do `PATH`, e essa recusa é o ponto.

- **sem `poetry`** → `rc=3` `[MEDIDO 2026-08-28: env PATH=/usr/bin:/bin bash backend/scripts/bootstrap.sh → rc=3, "RECUSA: 'poetry' nao esta no PATH"]`
- **venv que nasce em outra versão** → `rc=3`, com a versão efetiva do interpretador nomeada
  `[DOC: backend/scripts/bootstrap.sh — o assert compara sys.version_info com PY_ALVO="3.13"; **não
  re-executado aqui**, porque forçá-lo exigiria destruir a venv desta bancada]`

### `make venv` **imprime** o comando; ele não ativa nada — e a diferença não é detalhe

Toda receita de `make` roda num **subshell filho**. Um `source .../activate` lá dentro morreria com o
subshell e o seu shell continuaria sem a venv: mudança invisível que pareceria ter funcionado. **Nenhum
`Makefile` consegue mutar o shell pai.** Por isso o alvo faz o que o próprio Poetry 2.x passou a fazer
quando aposentou o `poetry shell`: **imprime a linha, para você avaliá-la.**

```bash
eval "$(make venv)"      # ou copie e cole a linha que ele imprimir
# ele imprime, literalmente:  source <repo>/backend/.venv/bin/activate
```

**Quem só quer RODAR não precisa ativar nada:** `make lint` e `make test` resolvem
`backend/.venv/bin/python` sozinhos, e **recusam com `rc=3`** se ele não existir.

### Os alvos que **recusam** hoje — e a recusa é a informação

| alvo | hoje | por quê |
|---|---|---|
| `make boundaries` | **recusa**, `rc=3` | não há `[tool.importlinter]` em `backend/pyproject.toml`. Os contratos são de `T-01.5` (`ADR-011/D3a`). Um alvo que saísse verde sobre universo vazio seria o portão que aprova por não ter olhado |
| `make build` | **recusa**, `rc=3` | não há artefato distribuível: o backend tem `package-mode = false` e zero dependência de runtime; `frontend/package.json` declara um único script, `lint` |

⚠️ **O `rc` do `make` não é o do script.** Quando uma receita falha, o `make` sai com **2**, qualquer que
seja o código do comando. As recusas **`rc=3`** deste repositório (*"não mediu"*, distinto de `rc=1`
*"mediu e reprovou"*) só são visíveis na chamada **direta** do script — e é por isso que os DoD citam
`bash backend/scripts/test.sh`, não `make test`.

## Idioma de docstring é convenção, **não portão**

> Em uma linha, e literal para quem vier grepar: idioma de docstring é convenção, não portão.

**As docstrings deste repositório são escritas em inglês** (`ADR-011/D6`). Os comentários `#`, as
mensagens de erro e a documentação continuam em português — a convenção alcança **a docstring, e só
ela**.

E aqui vai a parte que importa mais que a convenção: **idioma de docstring é convenção declarada, não
portão. Este repositório NÃO mede o idioma das docstrings, e não finge que mede.** Não porque medir seja
caro, mas porque as formas de medir que existem falham de maneiras que foram **medidas**:

| tentativa de portão | o que devolveria sobre as 18 docstrings em português de então | veredito |
|---|---|---|
| proibir **diacríticos** — o único teste de idioma determinístico que existe | **0 achados de 18** `[MEDIDO 2026-08-28]`, porque este código escrevia português **sem acento** (`nao`, `atomico`, `duravel`) | verde absoluto sobre 100% de violação: o portão que aprova por não ter olhado |
| lista fechada de palavras-função portuguesas em ASCII | **12 de 18** `[MEDIDO 2026-08-28]` — **6 falsos negativos, 33%** | recall de 67% num portão de bloqueio é ruído com severidade |
| detector probabilístico de idioma | `[NÃO MEDIDO]` — dependência nova, veredito probabilístico | portão que erra sozinho é pior que convenção honesta |

**O que É medido, e o que ele de fato mede:**

```bash
eval "$(make venv)"                               # ver §Setup — o `ruff` mora na venv
cd backend && ruff check --select D src tests     # rc=0, "All checks passed!"
```

Ele (pydocstyle) mede **presença** e **forma** — a docstring existe, o resumo cabe numa linha, termina em
ponto, está no imperativo (`D401`). **Nenhuma regra `D` é sensível a idioma**, e isso não é leitura de
documentação, é medição: trocar uma docstring inglesa por português **com a forma intacta** deixa o
comando **verde**
`[MEDIDO 2026-08-28, n=3 mutações no mesmo arquivo, comando `cd backend && ruff check --select D src tests`:
M3 traduz JsonlCheckpoint.done() de volta ao português e o comando devolve rc=0, "All checks passed!";
M1 apaga essa mesma docstring → rc=1, D102; M2 tira o ponto final do resumo de record() → rc=1, D400]`.

⚠️ **O caminho faz parte do número, e a forma nua mede outra coisa.** O escopo acima (`src tests`, a
partir de `backend/`) é o de `backend/scripts/lint.sh`. **Rodado nu da raiz**, o mesmo comando devolve
**`rc=1`, 8 achados, todos em `scripts/verify_screen.py`** — `D103`×4, `D403`×2, `D205`, `D209`
`[MEDIDO 2026-08-29: backend/.venv/bin/python -m ruff check --select D, a partir da raiz → rc=1,
"Found 8 errors."]`. Os 8 são **pré-existentes** (`scripts/` não foi tocado por `T-01.7`) e estão **fora
de todo escopo de lint deste repositório**: `lint.sh` linta `src tests`, o ESLint linta `frontend/src`,
e **`scripts/` não é lintado por ninguém**. Na base `c89d435` a forma nua devolvia **39 = 16
(`backend/src`) + 15 (`backend/tests`) + 8 (`scripts/`)**
`[MEDIDO 2026-08-29: git archive c89d435 | tar -x, e o mesmo comando na árvore extraída → "Found 39 errors."]`;
hoje devolve **8**, porque os 31 do backend fecharam. **Cite sempre a forma escopada** — a nua nunca
disse "All checks passed!" neste repositório.

**A correção de idioma é verificável por revisão humana — e é assim que ela é conferida.**
Declarar uma regra automática de idioma **reprova** a fase (`plano 01`, `D1.10`).

## A regra que organiza este repositório

**Nenhum número sem o comando que o produziu.** Toda afirmação quantitativa nos documentos carrega o
comando, o universo (`n`) e um rótulo de força: `[MEDIDO]` · `[DOC]` · `[NÃO MEDIDO]` ·
`[PREMISSA-OWNER]` · `[INFERRED: motivo]`. Isso não é estilo — três defeitos reais deste projeto foram
encontrados exatamente por essa disciplina, incluindo uma **regra anti-lookahead que estava invertida** e
propagada por dois documentos.

Consequência prática: **os dados brutos de medição não são versionados**. Vivem em `data/` (~850 MB,
gitignored), catalogados em [`data/MANIFEST.md`](data/MANIFEST.md), que traduz os caminhos citados nos
documentos para onde o arquivo realmente está. O repositório guarda **as conclusões e os comandos**.

## O que a plataforma existe para impedir

Três modos de falha, e cada um deles é um contrato:

1. **Lookahead.** Todo dado é bitemporal — `(event_time, available_at, ingested_at, observed_at)`. Uma
   leitura de decisão em `t` só vê observações com `available_at ≤ t` **e** `bucket_end ≤ t`.
2. **Número sem procedência.** Nenhum numeral de mercado renderiza sem selo de quatro campos — série,
   idade, procedência, completude — **visível sem hover**.
3. **Lacuna preenchida em silêncio.** Lacuna nunca é preenchida no armazenamento; `LOCF` existe só na
   leitura, com `max_staleness_ms` explícito. Para série de `nature = FLOW`, `LOCF` é **erro de tipo**.

## Stack (declarada, não construída)

Monorepo `backend/` + `frontend/` · backend **Python 3.13 + FastAPI** ([`ADR-011/D5`](docs/adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md), que supersede o 3.12 de `ADR-009/D4`), modular por bounded context com
contratos de import executáveis · frontend **Next** · store **partido**: catálogo e registro em
PostgreSQL, série de mercado em store colunar append-only (finalista pendente de spike,
[`ADR-002`](docs/adr/ADR-002-motor-de-armazenamento.md)).

## Non-goals desta fase

Detectores de estrutura (SMC, pivôs, Fibonacci) · limiar de sinal · matriz de convergência · regra de
entrada/SL/TP · métricas de performance · walk-forward · paper trading · **execução de ordem**. Ver
[`PRD-001` §12](docs/specs/PRD-001-plataforma-dados.md). Esta fase entrega **o dado e o primitivo** de que
qualquer dessas escolhas depende.
