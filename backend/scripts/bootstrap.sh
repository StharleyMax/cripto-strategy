#!/usr/bin/env bash
# bootstrap.sh — cria `backend/.venv` e instala as dependencias FIXADAS de desenvolvimento.
#
# E o UNICO passo do backend que precisa de rede. O `test_cmd` declarado
# (`backend/scripts/test.sh`) roda offline sobre o ambiente que este script deixa pronto,
# e RECUSA se ele nao existir — nunca cai para o interpretador do PATH.
#
# Interpretador: preferencia declarada, e a versao efetiva e CONFERIDA.
#
# ── O ALVO INVERTEU EM 2026-08-28: 3.12 -> 3.13 (`ADR-011/D5` supersede `ADR-009/D4`) ──
#
# `ADR-009/D4` decidia Python 3.12 e mandava REMOVER o `.python-version` = 3.13.13 da raiz. O
# owner derrubou as duas metades: "essa questao do python, pode regredir, quero que tenha o
# python version no 3.13" [PREMISSA-OWNER: 2026-08-28, citacao literal]. O arquivo FICA e o
# alvo passa a 3.13.
#
# A ORDEM DE PREFERENCIA VIROU JUNTO, e ela nao e cosmetica: enquanto o alvo era 3.12, listar
# `python3.12` primeiro era o que impedia o `pyenv` desta raiz de entregar 3.13 em silencio.
# Com o alvo em 3.13, manter `python3.12` na frente faria o script escolher, por preferencia
# declarada, exatamente o interpretador que o assert logo abaixo RECUSA — um script que
# recusa a si mesmo em todo caminho feliz. `python3.13` passa a ser o primeiro nome, e
# `python3` fica como unico reserva: sob o `pyenv` desta raiz ele resolve o `.python-version`
# = 3.13.13, e se resolver outra coisa o assert pega.
#
# ── PREFERENCIA POR NOME NAO E GARANTIA DE VERSAO (conserto do `/review`, item E) ──
#
# Ate 2026-08-28 este script escolhia o interpretador por NOME e terminava com um `echo` da
# versao: INFORMAVA, nao recusava. Duas falhas medidas nessa forma:
#   1. o nome nao diz nem a versao nem de quem e o binario. `[MEDIDO 2026-08-28 pelo /review:
#      `command -v python3.12` -> `…/harness-panel/.venv/bin/python3.12` — o venv de OUTRO
#      projeto]`.
#   2. num shell SEM o interpretador preferido, o laco cai em `python3`, cuja versao depende
#      do `pyenv` do shell — e o venv nascia com a versao errada EM SILENCIO.
# As duas falhas continuam valendo com o alvo invertido: elas sao sobre NOME nao ser VERSAO, e
# isso nao depende de qual versao e o alvo. O assert abaixo confere a versao EFETIVA do
# interpretador DO VENV — a unica que os portoes usam, seja qual for o nome que a produziu — e
# sai 3 antes de gastar rede instalando dependencia em ambiente errado.
#
# ── O QUE ESTE SCRIPT AINDA NAO FAZ, e e de `T-01.6`, nao desta task ──
#
# `ADR-011/D1` decide POETRY, e quem o instala e `T-01.6`, que reescreve o CONTEUDO deste
# script (venv+uv -> `poetry install`). `T-01.4` vem ANTES exatamente porque o assert de
# versao e a peca mais facil de se perder numa reescrita: declara-la aqui primeiro faz a
# reescrita ter de justificar a perda, em vez de simplesmente nao a cometer.
set -euo pipefail

PY_ALVO="3.13"   # ADR-011/D5 (supersede ADR-009/D4, que dizia 3.12)

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$BACKEND/.venv"

escolher_interpretador() {
    for candidato in python3.13 python3; do
        if command -v -- "$candidato" >/dev/null 2>&1; then
            printf '%s\n' "$candidato"
            return 0
        fi
    done
    echo "RECUSA: nenhum interpretador Python encontrado no PATH" >&2
    exit 3
}

PY_BOOTSTRAP="$(escolher_interpretador)"

USA_UV=0
if command -v uv >/dev/null 2>&1; then
    USA_UV=1
    uv venv --python "$PY_BOOTSTRAP" "$VENV"
else
    "$PY_BOOTSTRAP" -m venv "$VENV"
fi

# O assert. Roda ANTES de instalar: rede gasta em ambiente errado e rede desperdicada, e um
# venv 3.13 meio-instalado e pior que nenhum.
if ! "$VENV/bin/python" -c "import sys; raise SystemExit(0 if '.'.join(map(str, sys.version_info[:2])) == '$PY_ALVO' else 1)"; then
    echo "RECUSA: o venv nasceu em $("$VENV/bin/python" -V 2>&1), e ADR-011/D5 declara Python $PY_ALVO." >&2
    echo "        ADR-011/D5 supersede ADR-009/D4 (que declarava 3.12) por decisao do owner." >&2
    echo "        Interpretador de bootstrap escolhido: '$PY_BOOTSTRAP' -> $(command -v -- "$PY_BOOTSTRAP")" >&2
    echo "        Nome de binario NAO e versao: o .python-version = 3.13.13 desta raiz FICA (e" >&2
    echo "        rastreado), mas um 'python3.13' do PATH pode ser o venv de outro projeto, e" >&2
    echo "        'python3' resolve o que o pyenv do SEU shell disser. Aponte um $PY_ALVO real:" >&2
    echo "          PATH=/caminho/do/python$PY_ALVO/bin:\$PATH bash backend/scripts/bootstrap.sh" >&2
    echo "        O venv incompleto foi DEIXADO no disco de proposito, para inspecao: $VENV" >&2
    exit 3
fi

if [ "$USA_UV" -eq 1 ]; then
    uv pip install --python "$VENV/bin/python" -r "$BACKEND/requirements-dev.txt"
else
    "$VENV/bin/python" -m pip install --upgrade pip
    "$VENV/bin/python" -m pip install -r "$BACKEND/requirements-dev.txt"
fi

echo "ambiente pronto: $("$VENV/bin/python" -V) em $VENV (alvo ADR-011/D5: $PY_ALVO, CONFERIDO)"
