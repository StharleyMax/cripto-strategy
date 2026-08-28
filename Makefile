# Makefile — a fachada UNICA de comandos deste repositorio (`ADR-011/D2`, plano 01 item 1.10).
#
#   "Aplicacao deve rodar com poetry, ter Makefile para simplicar as chamadas, builds e afins"
#   [PREMISSA-OWNER: 2026-08-28, citacao literal, registrada em `ADR-011/D1`+`D2`]
#
# ── ELE CHAMA OS `.sh`, NAO OS ABSORVE. E a regra mais importante deste arquivo ──
#
# Os quatro scripts de `backend/scripts/` continuam sendo a IMPLEMENTACAO. Tres argumentos,
# medidos, estao em `ADR-011/D2`; o do meio e o que este cabecalho existe para nao deixar
# esquecer: uma receita de Make e uma sequencia de comandos encadeados por `;`, cada um num
# subshell, e o recipe devolve o exit code do ULTIMO. O repositorio de referencia MEDIU o
# falso-verde que isso produz e carrega o aviso literal no alvo `lint-frontend` dele:
#
#   "NOTE (KAN-172): `set -e` e OBRIGATORIO. Sem ele, o `;` entre os comandos faz o recipe
#    retornar o exit code do ULTIMO comando (`echo OK` = 0), mascarando falha de eslint/tsc
#    -> falso-verde local (o gate mente)."   [DOC: anything_monorepo/Makefile]
#
# CONSEQUENCIA DIRETA, e ela e obrigacao e nao estilo: o alvo `test` NAO encadeia `pytest` e o
# piso de cobertura. Ele chama `bash backend/scripts/test.sh`, que ja os encadeia sob
# `set -euo pipefail`. `ADR-011/D2` decide essa forma explicitamente.
#
# REGRA DE ESCRITA DESTE ARQUIVO, para quem for acrescentar alvo: UM COMANDO POR LINHA de
# receita. O `make` confere o exit code de CADA linha e aborta na primeira que falhar — e o
# perigo do `;` so existe DENTRO de uma linha. Onde precisar de dois comandos numa linha, use
# `&&`, nunca `;`.
#
# ── O CODIGO DE SAIDA DO `make` NAO E O DO SCRIPT, e citar um pelo outro e meia medicao ──
#
# Quando uma receita falha, o `make` sai com **2**, qualquer que seja o `rc` do comando. As
# recusas `rc=3` deste repositorio ("nao mediu", distinto de `rc=1` "mediu e reprovou") sao
# visiveis apenas na chamada DIRETA do script. Por isso os comandos do DoD `D1.8` sao
#   bash backend/scripts/test.sh ...        e nao   make test ...
# e continuar assim e deliberado. Para portao ("passou ou nao"), `make` basta: nao-zero e
# nao-zero.

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help setup venv lint lint-backend lint-frontend test boundaries build

# Argumentos repassados ao pytest: `make test ARGS="-k nome --no-cov"`.
ARGS ?=

help:
	@printf '%s\n' \
	  'Fachada de comandos — cripto-strategy (ADR-011/D2)' \
	  '' \
	  '  make setup           cria backend/.venv com Poetry e instala frontend/node_modules' \
	  '                       (UNICO alvo que usa rede; chama backend/scripts/bootstrap.sh)' \
	  '  make venv            imprime o comando de ativacao da venv — LEIA a nota do alvo' \
	  '  make lint            lint-backend + lint-frontend' \
	  '  make lint-backend    ruff + ruff format --check + mypy --strict (backend/scripts/lint.sh)' \
	  '  make lint-frontend   ESLint do PROJETO sobre frontend/src (ADR-011/D4)' \
	  '  make test            suite + piso de cobertura POR CAMADA (backend/scripts/test.sh)' \
	  '                       argumentos: make test ARGS="-k nome"' \
	  '  make boundaries      fronteira de modulo por import-linter (ADR-011/D3a — T-01.5)' \
	  '  make build           artefato distribuivel — hoje RECUSA com rc=3, e o alvo diz porque' \
	  '' \
	  'O make sai com 2 em qualquer receita que falhe: ele NAO propaga o rc=3 dos scripts.'

# ── setup ──────────────────────────────────────────────────────────────────────────────
# O UNICO alvo que precisa de rede.
#
# Ele fecha a metade (a) do achado "NENHUM PORTAO CHAMA bootstrap.sh" [/review 2026-08-28]:
# ate hoje as tres mencoes a `bootstrap.sh` nos outros scripts eram TEXTO DE MENSAGEM DE ERRO,
# nao chamada, e o assert da versao efetiva do interpretador nao era executado por ninguem.
# A metade (b) — a que de fato o poe ao alcance de um portao — esta em `backend/scripts/lint.sh`,
# porque `make setup` e comando de HUMANO e nao reprova nada sozinho.
#
# `npm install` do frontend NAO e enfeite: `node_modules/` e gitignored e sem ele o ESLint do
# projeto (`ADR-011/D4`) nao roda. A bancada de `D1.3`/`D1.3b` so existia como RECEITA em
# `frontend/README.md` §3 e §4; `make setup` + `make lint` sao onde ela volta a rodar sozinha.
setup:
	bash backend/scripts/bootstrap.sh
	npm --prefix frontend install

# ── venv ───────────────────────────────────────────────────────────────────────────────
# ⚠️ ESTE ALVO IMPRIME O COMANDO; ELE NAO ATIVA NADA, e a diferenca nao e detalhe.
#
# Toda receita de Make roda num subshell FILHO. Um `source .../activate` aqui dentro morreria
# com o subshell e o shell do usuario continuaria sem a venv — mudanca invisivel que pareceria
# ter funcionado. Nenhum `Makefile` de projeto nenhum consegue mutar o shell PAI.
#
# A forma honesta e a que o proprio Poetry 2.x adotou quando aposentou o `poetry shell`:
# `poetry env activate` IMPRIME a linha para voce avaliar. Use assim:
#
#     eval "$$(make venv)"      # ou copie e cole a linha que ele imprime
#
# Quem so quer RODAR um comando na venv nao precisa ativar nada: `make lint` e `make test` ja
# resolvem `backend/.venv/bin/python` sozinhos, e RECUSAM com rc=3 se ele nao existir.
venv:
	@cd backend && poetry env activate

# ── lint ───────────────────────────────────────────────────────────────────────────────
# Dois lados, e os dois sao pre-requisitos: se qualquer um falhar, `make lint` falha.
lint: lint-backend lint-frontend

lint-backend:
	bash backend/scripts/lint.sh

# O ESLint do PROJETO (v10.9.1), nunca o global — existe um `/usr/bin/eslint` v6.4.0 nesta
# maquina que e anterior ao flat config e nao conhece `typescript-eslint`
# [MEDIDO 2026-08-28 por `T-01.2`, registrado em `frontend/README.md` §4].
#
# A recusa abaixo e rc=3 pela mesma semantica dos scripts do backend: "nao mediu" e diferente
# de "mediu e reprovou". Sem `node_modules/`, `npm run lint` falharia por motivo que NAO e
# violacao de regra, e ler isso como reprovacao de lint seria numero de universo errado.
lint-frontend:
	@test -d frontend/node_modules || { printf '%s\n' "RECUSA: frontend/node_modules ausente — sem ele o ESLint do PROJETO nao roda." "        'node_modules/' e gitignored (ADR-011/D4), entao clone limpo nao o tem." "        Rode 'make setup' (precisa de rede)." >&2; exit 3; }
	npm --prefix frontend run lint

# ── test ───────────────────────────────────────────────────────────────────────────────
# UMA LINHA, UM COMANDO. Ver o cabecalho: encadear `pytest` e o piso com `;` devolveria o exit
# code do ULTIMO e mascararia a suite reprovando — o falso-verde de `KAN-172`.
#
# `test.sh` roda a suite com cobertura, APAGA o `coverage.xml` antes de medir e so entao chama
# `check-coverage-layers.sh`. As duas recusas `rc=3` (relatorio AUSENTE / relatorio VELHO) vivem
# la dentro, INALTERADAS pela migracao para Poetry — sao o ativo mais caro desta trilha (`D1.8`).
test:
	bash backend/scripts/test.sh $(ARGS)

# ── boundaries ─────────────────────────────────────────────────────────────────────────
# ⚠️ ALVO DECLARADO POR `T-01.6`, CONTEUDO DEVIDO POR `T-01.5`. Ele NAO fica verde hoje.
#
# `ADR-011/D3a` decide `import-linter` para a direcao de camada e para a fronteira entre
# componentes; quem escreve `[tool.importlinter]` no `backend/pyproject.toml` e adiciona a
# dependencia e `T-01.5`, nao esta task — inventar contrato aqui seria decidir por ela.
# `ADR-011/D3b` acrescenta a metade que o transforma em portao
# (`scripts/hooks/pre-push.pre-harness` rodando `make boundaries`), e tambem e de `T-01.5`.
#
# O alvo existe porque o plano 01 item 1.10 enumera `boundaries` na fachada, e porque
# `T-01.5` depende de `make boundaries` existir. O que ele NAO faz e devolver 0: um alvo que
# sai verde sem ter contrato nenhum a avaliar e literalmente o portao que aprova por nao ter
# olhado — a classe de defeito que este repositorio catalogou seis vezes em 2026-08-28.
boundaries:
	@grep -q '^\[tool\.importlinter' backend/pyproject.toml || { printf '%s\n' "RECUSA: [tool.importlinter] ausente em backend/pyproject.toml — nao ha contrato a avaliar." "        Os contratos sao de T-01.5 (ADR-011/D3a), junto com a dependencia import-linter" "        e o portao scripts/hooks/pre-push.pre-harness (ADR-011/D3b)." "        T-01.6 declarou este alvo (plano 01, item 1.10) e o fez RECUSAR em vez de" "        devolver verde sobre universo vazio." >&2; exit 3; }
	cd backend && poetry run lint-imports

# ── build ──────────────────────────────────────────────────────────────────────────────
# ⚠️ ALVO DECLARADO, E ELE RECUSA — de proposito, e a recusa e a informacao.
#
# Nao existe artefato distribuivel neste repositorio hoje, e isso e medido e nao suposto:
#   - o backend tem `package-mode = false` e ZERO dependencia de runtime; `src/` nao e pacote
#     publicavel, e `poetry build` falharia por isso, com mensagem que nao diz o motivo real;
#   - `frontend/package.json` declara UM script, `lint` — nao ha `build`. A aplicacao Next.js
#     pertence ao componente `web` e a outra task [DOC: frontend/README.md §1].
#
# Um `build:` vazio devolvendo 0 seria o pior desfecho possivel: alguem leria "build passou"
# de um alvo que nao construiu nada. Preencher este alvo e da task que trouxer o primeiro
# artefato — e ai esta recusa sai junto com o motivo dela.
build:
	@printf '%s\n' "RECUSA: nao ha artefato a construir neste repositorio hoje, e este alvo diz isso" "        em voz alta em vez de devolver verde." "" "        backend : package-mode = false, zero dependencia de runtime, src/ nao e pacote" "                  publicavel (backend/pyproject.toml). 'poetry build' falharia por isso." "        frontend: package.json declara UM script, 'lint'. Nao ha 'build'. A aplicacao" "                  Next.js pertence ao componente 'web' e a outra task." "" "        O alvo existe porque o plano 01 item 1.10 enumera 'build' na fachada. Quem trouxer" "        o primeiro artefato preenche esta receita e remove esta recusa." >&2
	@exit 3
