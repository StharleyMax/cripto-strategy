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

# A guarda que `T-01.6` escreveu no alvo `boundaries` do `Makefile`, TRAZIDA PARA CA sem
# mudar de sentido — e ganhando o `rc=3` de verdade, que o `make` nao propaga (ele sai 2 em
# qualquer receita que falhe). Ela continua valendo depois que `T-01.5` preencheu os
# contratos: quem apagar `[tool.importlinter]` faz o portao RECUSAR, e nao passar sobre
# universo vazio. `lint-imports` sem contrato nenhum sai `rc=1` com "no contracts", que ja
# seria reprovacao — mas reprovacao por motivo que nao e violacao de fronteira, e chamar as
# duas pelo mesmo nome e o que esta recusa impede.
if ! grep -q '^\[tool\.importlinter' "$BACKEND/pyproject.toml"; then
    echo "RECUSA: [tool.importlinter] ausente em backend/pyproject.toml — nao ha contrato a avaliar." >&2
    echo "        Os contratos sao de ADR-011/D3a (a peca 1 de ADR-009/D1): um contrato" >&2
    echo "        'layers' por contexto e um 'forbidden' por componente." >&2
    echo "        Portao sem contrato nao e portao verde: e portao que nao olhou." >&2
    exit 3
fi

if [ ! -x "$LINT_IMPORTS" ]; then
    echo "RECUSA: $LINT_IMPORTS nao existe — o import-linter nao esta instalado no venv." >&2
    echo "        Ele e a 6a dependencia de [tool.poetry.group.dev.dependencies]" >&2
    echo "        (import-linter, pin exato). Rode 'make setup' (precisa de rede)." >&2
    exit 3
fi

cd "$BACKEND"
# O interpretador e o script sao NOMEADOS, os dois dentro do venv ja conferido acima. Chamar
# `$LINT_IMPORTS` direto funcionaria (o shebang dele aponta para o mesmo `$PY`), mas ai quem
# escolheria o interpretador seria uma linha escrita pelo instalador — e o que este arquivo
# existe para garantir e que a escolha esteja AQUI.
"$PY" "$LINT_IMPORTS"
