#!/usr/bin/env bash
# boundaries.sh — a fronteira de modulo por GRAFO DE IMPORTS (`ADR-011/D3a`, `T-01.5`).
#
# E o `[test_cmd]`? Nao. E o portao de ARQUITETURA: `lint.sh` pergunta se o codigo esta bem
# escrito, este pergunta se ele esta no lugar certo. Os contratos vivem em
# `[tool.importlinter]` do `backend/pyproject.toml`; quem os roda sozinho e
# `scripts/hooks/pre-push.pre-harness` (`ADR-011/D3b`), via `make boundaries`.
#
# ── POR QUE ESTE ARQUIVO EXISTE, EM VEZ DE DUAS LINHAS NO `Makefile` ───────────────────
#
# `T-01.6` escreveu o alvo como `cd backend && poetry run lint-imports`, e o `/review` de
# 2026-08-28 mediu o que isso era: a QUINTA via de resolucao de interpretador do repositorio,
# e a UNICA execucao de backend que NAO passava por `backend/.venv/bin/python` — logo sem a
# recusa `rc=3` de "venv ausente" e sem o assert da versao efetiva. Era LATENTE, porque a
# guarda de `[tool.importlinter] ausente` recusava antes; ao preencher os contratos, `T-01.5`
# a tornaria ALCANCAVEL. O conserto declarado tinha duas formas, e este arquivo escolhe a
# segunda — HERDAR A RECUSA DOS SCRIPTS — por dois motivos, o segundo medido:
#
#   1. `ADR-011/D2` decide que o `Makefile` CHAMA os `.sh` e nao os absorve. Um alvo que
#      resolvesse interpretador dentro da receita seria a absorcao que a ADR recusa.
#   2. A primeira forma, `backend/.venv/bin/python -m importlinter`, NAO EXECUTA — o pacote
#      nao tem `__main__.py` [MEDIDO 2026-08-28: `.venv/bin/python -m importlinter --help` ->
#      "No module named importlinter.__main__; 'importlinter' is a package and cannot be
#      directly executed"]. A receita do `/review` estava certa no diagnostico e errada na
#      sintaxe; publicar a sintaxe sem roda-la teria posto no repositorio um comando que nao
#      roda. O equivalente que EXECUTA esta na ultima linha deste arquivo.
#
# ── POR QUE NAO `poetry run lint-imports` ──────────────────────────────────────────────
#
# `poetry run` acha o comando no venv do projeto; quando ele NAO esta la, o comando cai para
# o `PATH`, e nesta maquina o `PATH` tem um despachante: `command -v lint-imports` ->
# `~/.pyenv/shims/lint-imports` [MEDIDO 2026-08-28]. Um portao que possa cair num
# interpretador que o repositorio nao declarou mede outra coisa e chama o resultado de
# veredito. A ultima linha deste arquivo nomeia o interpretador e o script, os dois no venv.
#
# A EXPRESSAO DO ASSERT E A MESMA DE `bootstrap.sh` E `lint.sh` (mesmo `PY_ALVO`, mesma
# comparacao de major.minor). A duplicacao e deliberada e nomeada, pelo mesmo motivo que
# `lint.sh` ja registra: centraliza-la exigiria um script de biblioteca que `ADR-011/D2` nao
# autoriza. Se `PY_ALVO` mudar, mudam os TRES — e o `grep -n 'PY_ALVO' backend/scripts/*.sh`
# do DoD `D1.9` os encontra juntos.
set -euo pipefail

PY_ALVO="3.13"   # ADR-011/D5 (supersede ADR-009/D4, que dizia 3.12)

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"
LINT_IMPORTS="$BACKEND/.venv/bin/lint-imports"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'make setup' (precisa de rede)." >&2
    exit 3
fi

if ! "$PY" -c "import sys; raise SystemExit(0 if '.'.join(map(str, sys.version_info[:2])) == '$PY_ALVO' else 1)"; then
    echo "RECUSA: o venv em $BACKEND/.venv e $("$PY" -V 2>&1), e ADR-011/D5 declara Python $PY_ALVO." >&2
    echo "        Um grafo de imports montado por um interpretador que o repositorio nao" >&2
    echo "        declarou nao e o grafo do repositorio. Refaca o ambiente: 'make setup'." >&2
    exit 3
fi

# ── GUARDA 3 de 4 · A SECCAO EXISTE? E SO ISSO QUE ELA PERGUNTA ────────────────────────
#
# ⚠️ ELA MEDE O ARQUIVO, NAO O UNIVERSO AVALIADO, e ate 2026-08-29 a mensagem dela dizia o
# contrario ("nao ha CONTRATO a avaliar", "portao sem contrato nao e portao verde"). Isso era
# uma guarda de TEXTO falando em nome de uma medicao que ela nunca fez — o /review achou, e o
# achado dói porque e a NONA instancia da familia "regex de linha x estrutura" neste
# repositorio, desta vez DENTRO do arquivo que E o portao, cujo cabecalho tem 40 linhas
# explicando por que `grimp` le o GRAFO em vez de ler texto.
#
# A mensagem foi reescrita para dizer o que esta linha de fato mede. Quem responde pelo
# universo avaliado e a GUARDA 4, depois da execucao, porque essa pergunta so tem resposta
# DEPOIS de a ferramenta rodar.
#
# ESTA GUARDA FICA, e nao por inercia: ela e a unica que consegue NOMEAR a seccao errada. Sem
# ela, `[tool.importlinterXX]` cairia na guarda 4 com uma mensagem generica.
#
# O `\]` final da regex nao e enfeite: sem ele a guarda casava por PREFIXO e
# `[tool.importlinterXX]` PASSAVA [MEDIDO 2026-08-29, controle invertido: guarda sem `\]` +
# mutacao -> rc=1 com `'root_package'`; com `\]` + a MESMA mutacao -> rc=3; arvore boa -> rc=0].
if ! grep -q '^\[tool\.importlinter\]' "$BACKEND/pyproject.toml"; then
    echo "RECUSA: a seccao [tool.importlinter] nao existe em backend/pyproject.toml." >&2
    echo "        Esta guarda mede o ARQUIVO, nao o universo avaliado — quem mede o universo" >&2
    echo "        e a guarda depois da execucao, porque so ali existe resposta." >&2
    echo "        Os contratos sao de ADR-011/D3a (a peca 1 de ADR-009/D1): um contrato" >&2
    echo "        'layers' por contexto e um 'forbidden' por componente." >&2
    exit 3
fi

if [ ! -x "$LINT_IMPORTS" ]; then
    echo "RECUSA: $LINT_IMPORTS nao existe — o import-linter nao esta instalado no venv." >&2
    echo "        Ele e a 6a dependencia de [tool.poetry.group.dev.dependencies]" >&2
    echo "        (import-linter, pin exato). Rode 'make setup' (precisa de rede)." >&2
    exit 3
fi

cd "$BACKEND"

# ── A EXECUCAO ─────────────────────────────────────────────────────────────────────────
#
# O interpretador e o script sao NOMEADOS, os dois dentro do venv ja conferido acima. Chamar
# `$LINT_IMPORTS` direto funcionaria (o shebang dele aponta para o mesmo `$PY`), mas ai quem
# escolheria o interpretador seria uma linha escrita pelo instalador — e o que este arquivo
# existe para garantir e que a escolha esteja AQUI.
#
# `|| RC=$?` E OBRIGATORIO, e nao e estilo: com `set -e` ligado, uma atribuicao cujo comando
# falha ABORTA o script na hora, e nenhuma das classificacoes abaixo chegaria a rodar — o
# portao sairia com o rc cru, que e exatamente o que este bloco existe para nao fazer.
RC=0
SAIDA="$("$PY" "$LINT_IMPORTS" 2>&1)" || RC=$?
printf '%s\n' "$SAIDA"

# ── GUARDA 4 de 4 · O QUE A FERRAMENTA FEZ, e nao o que o arquivo diz ──────────────────
#
# ACHADO DO /review 2026-08-29, e este era BLOQUEANTE: a guarda 3 responde "o cabecalho
# existe" e a mensagem dela afirmava "nao ha contrato a avaliar". Sao perguntas diferentes, e
# a distancia entre as duas sao QUATRO rotas medidas para VERDE SOBRE ZERO CONTRATO — todas
# com a guarda 3 ja consertada, `n=4`, cada mutacao revertida e a arvore limpa reconferida
# entre elas [MEDIDO 2026-08-29]:
#
#   seccao mantida e os 2 blocos [[...contracts]] removidos  -> "0 kept, 0 broken", rc=0
#   typo no nome da tabela: [[tool.importlinter.contract]]    -> "0 kept, 0 broken", rc=0
#   um backend/.importlinter passa a existir (precedencia)    -> "0 kept, 0 broken", rc=0
#   um backend/setup.cfg com [importlinter]                   -> "0 kept, 0 broken", rc=0
#
# AS DUAS ULTIMAS SAO A VERSAO PIOR DO MESMO DEFEITO: a guarda le UM arquivo e a ferramenta le
# OUTRO. Nenhuma regex sobre `pyproject.toml` fecha isso, porque o problema nao esta la dentro.
#
# E A PREMISSA QUE AUTORIZAVA A GUARDA FRACA ERA FALSA. O comentario antigo publicava, sem
# comando e sem rotulo, que "`lint-imports` sem contrato nenhum sai rc=1 com 'no contracts'".
# NAO REPRODUZ: sai `rc=0` com `Contracts: 0 kept, 0 broken.` [MEDIDO 2026-08-29, rota 1].
# Um numero sem comando envelheceu para dentro de um portao — e sustentou a fresta.
#
# O QUE ESTA GUARDA MEDE: a linha de veredito que a PROPRIA ferramenta imprime.
#   - nenhuma linha `Contracts: N kept, M broken` -> ela nem chegou a julgar => NAO MEDIU (3).
#     Cobre `root_package` inexistente ("Could not find package") e `containers` com modulo
#     que nao existe ("module does not exist"), que sao declaracao quebrada e nao fronteira
#     violada — o `rc=1` cru da ferramenta os chamaria de "mediu e reprovou".
#   - `0 kept, 0 broken` -> julgou o vazio => NAO MEDIU (3). E a familia das 4 rotas acima.
#   - qualquer outro veredito -> o rc da ferramenta passa INTEIRO. Contrato BROKEN continua
#     `rc=1`, e este e o controle que importa: nao se converte violacao real em "nao mediu".
#
# O `|| true` NAO E DEFENSIVO A ESMO, e a falta dele foi medida nesta mesma bancada: `grep`
# sem casar sai `1`, `set -o pipefail` propaga esse `1` para a substituicao, e `set -e` MATA o
# script ali — de modo que o ramo "nenhum veredito" abaixo ficava INALCANCAVEL e o portao
# saia `rc=1` fingindo ser a ferramenta [MEDIDO 2026-08-29: sem o `|| true`, `root_package`
# inexistente e `containers` inexistente davam rc=1; com ele, os dois dao rc=3]. E a mesma
# familia do defeito que este bloco conserta, uma camada abaixo: um `rc` de ferramenta
# passando por veredito de portao.
VEREDITO="$(printf '%s' "$SAIDA" | grep -oE 'Contracts: [0-9]+ kept, [0-9]+ broken' | tail -1 || true)"

if [ -z "$VEREDITO" ]; then
    echo "" >&2
    echo "RECUSA: o import-linter nao produziu veredito nenhum — nenhuma linha" >&2
    echo "        'Contracts: N kept, M broken' na saida acima." >&2
    echo "        Ele nao chegou a julgar a fronteira, entao isto e NAO MEDIU (rc=3) e nao" >&2
    echo "        'mediu e reprovou' (rc=1). Causas tipicas, e a saida acima nomeia a sua:" >&2
    echo "          - root_package apontando para pacote que nao existe;" >&2
    echo "          - contrato citando modulo inexistente em 'containers';" >&2
    echo "          - [tool.importlinter] sem root_package." >&2
    exit 3
fi

if [ "$VEREDITO" = "Contracts: 0 kept, 0 broken" ]; then
    echo "" >&2
    echo "RECUSA: ZERO contrato avaliado — a seccao [tool.importlinter] existe e o universo" >&2
    echo "        que ela produziu esta VAZIO. Verde sobre universo vazio e o portao que" >&2
    echo "        aprova por nao ter olhado, e e a classe de defeito que ADR-011/D3b nomeia." >&2
    echo "        As quatro causas medidas, todas passando pela guarda anterior:" >&2
    echo "          - os blocos [[tool.importlinter.contracts]] foram removidos;" >&2
    echo "          - typo no nome da tabela (ex.: [[tool.importlinter.contract]], singular);" >&2
    echo "          - backend/.importlinter existe e toma precedencia sobre o pyproject.toml;" >&2
    echo "          - backend/setup.cfg tem [importlinter] e toma precedencia." >&2
    echo "        Nas duas ultimas a guarda le UM arquivo e a ferramenta le OUTRO." >&2
    exit 3
fi

exit $RC
