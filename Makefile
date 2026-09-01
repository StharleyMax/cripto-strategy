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
# REGRA DE ESCRITA DESTE ARQUIVO, para quem for acrescentar alvo: A ULTIMA PALAVRA DA LINHA
# DECIDE O `rc`. O `make` confere o exit code de CADA linha e aborta na primeira que falhar, e
# o perigo do `;` so existe DENTRO de uma linha — onde ele descarta o veredito de tudo que veio
# antes. Prefira uma linha, um comando; quando forem dois, encadeie com `&&`.
#
# A EXCECAO, e ela esta no alvo `lint-frontend`: `cmd || { printf ...; exit N; }` usa `;`
# DE PROPOSITO e esta CERTO — quem tem a ultima palavra e o `exit N`, entao o `rc` e o que se
# quer. (Ate `T-01.5` o alvo `boundaries` era o segundo caso; a guarda dele mudou de arquivo
# para `backend/scripts/boundaries.sh` e este paragrafo foi atualizado no mesmo ato — nota de
# cabecalho que sobrevive ao codigo que ela descreve e como um portao que nao olha.)
# Trocar por `printf ... && exit N` seria pior: um `printf` que falhasse (saida
# fechada, disco cheio) engoliria o `exit` e o alvo devolveria SUCESSO. "Nunca `;`" seria uma
# regra que quebra o codigo correto — o que importa nao e o separador, e quem fala por ultimo.
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
.PHONY: help setup venv lint lint-backend lint-frontend test boundaries natureza build verify

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
	  '  make boundaries      fronteira de modulo por grafo de imports, via import-linter' \
	  '                       (ADR-011/D3a; backend/scripts/boundaries.sh)' \
	  '  make natureza        natureza por USO (scanner de AST): domain/use_cases nao leem' \
	  '                       relogio (ADR-016/D4; backend/scripts/natureza.sh)' \
	  '  make build           artefato distribuivel — hoje RECUSA com rc=3, e o alvo diz porque' \
	  '  make verify          OS SEIS PORTOES numa chamada, veredito em ~10 linhas e a saida' \
	  '                       bruta em arquivo (scripts/verify.sh). E o alvo para AGENTE rodar' \
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
# PREENCHIDO POR `T-01.5` (`ADR-011/D3a`, plano 01 item 1.9'). `T-01.6` declarou o alvo e o
# fez RECUSAR com rc=3 enquanto nao houvesse contrato; agora ha, e a recusa nao sumiu — ela
# MUDOU DE ARQUIVO. Ver `backend/scripts/boundaries.sh`, que a carrega junto com as outras
# duas ("venv ausente" e "venv na versao errada").
#
# UMA LINHA, UM COMANDO, e um `.sh` do outro lado — a forma que `ADR-011/D2` decide. O que a
# receita de T-01.6 fazia (`cd backend && poetry run lint-imports`) era a QUINTA via de
# resolucao de interpretador do repositorio e a unica execucao de backend fora de
# `backend/.venv/bin/python`; o `/review` de 2026-08-28 a mediu como LATENTE, porque a guarda
# recusava antes de chegar la. Preencher os contratos a tornaria alcancavel, entao ela foi
# fechada NO MESMO ATO em que deixou de ser latente.
boundaries:
	bash backend/scripts/boundaries.sh

# ── natureza ───────────────────────────────────────────────────────────────────────────
# `ADR-016/D4` + `T-03.12` (`ADR-016/D5`). `boundaries` guarda DIRECAO de import, granularidade
# de modulo; este guarda NATUREZA — a distincao capacidade x valor que `import-linter` nao
# consegue expressar (`datetime.date` nao e submodulo de `datetime`). Scanner de AST em
# `backend/scripts/natureza.py`, promovido (copiado e endurecido) de
# `docs/adr/bancadas/ADR-016-natureza.py`; a bancada permanece la, reproduzivel a partir do
# texto da ADR (DoD-11).
#
# MESMA FORMA que `boundaries`: UMA LINHA, UM COMANDO, um `.sh` do outro lado.
natureza:
	bash backend/scripts/natureza.sh

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

# ── verify ─────────────────────────────────────────────────────────────────────────────
# Os cinco portoes numa chamada, veredito compacto, saida bruta em arquivo.
#
# EXISTE POR UM NUMERO, e o numero e de consumo e nao de gosto: `[MEDIDO 2026-08-29 sobre
# 105 transcripts de subagente deste projeto, n=1.320 chamadas]` os comandos de verificacao
# despejaram ~397 mil tokens de saida BRUTA no contexto dos agentes -- `git diff` 277
# chamadas / ~201k tokens, `harness rules` 332 / ~66k, `make lint` 221 / ~43k, `make test`
# 263 / ~41k, `git status` 158 / ~35k, `make boundaries` 69 / ~10k. E cada token que entra
# num contexto e relido a cada turno seguinte: o maior /build da sessao leu 93,5M para
# produzir 72,7k de conteudo unico (1.286x).
# `[MEDIDO 2026-08-29: 5.915 bytes de log -> 591 bytes impressos, 10x, e UMA chamada no
# lugar de seis]`. Doutrina em `docs/protocolo-de-despacho.md` R7.
#
# ⚠️ O `rc` UTIL E O DO SCRIPT, NAO O DO MAKE, e aqui isso pesa mais que nos outros alvos:
# `verify.sh` distingue 1 ("mediu e reprovou") de 3 ("RECUSOU medir"), e o `make` colapsa os
# dois em 2 -- que e exatamente a diferenca que o cabecalho deste arquivo existe para nao
# deixar perder. Para portao, `make verify` basta. Para LER a causa, chame o script direto:
#   bash scripts/verify.sh
verify:
	bash scripts/verify.sh
