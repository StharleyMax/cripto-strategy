#!/usr/bin/env bash
# bootstrap.sh — cria `backend/.venv` e instala as dependencias FIXADAS de desenvolvimento.
#
# E o UNICO passo do backend que precisa de rede. O `test_cmd` declarado
# (`backend/scripts/test.sh`) roda offline sobre o ambiente que este script deixa pronto,
# e RECUSA se ele nao existir — nunca cai para o interpretador do PATH.
#
# Interpretador: preferencia declarada, e a versao efetiva e CONFERIDA. `ADR-009/D4` decide
# Python 3.12; a remocao do `.python-version` = 3.13.13 da raiz e a task `T-01.4`. Enquanto
# ela nao roda, um shell sob `pyenv` resolve 3.13 e este script preferiria 3.13 se nao
# nomeasse `python3.12` primeiro.
#
# ── PREFERENCIA POR NOME NAO E GARANTIA DE VERSAO (conserto do `/review`, item E) ──
#
# Ate 2026-08-28 este script escolhia o interpretador por NOME e terminava com um `echo` da
# versao: INFORMAVA, nao recusava. Duas falhas medidas nessa forma:
#   1. o nome nao diz nem a versao nem de quem e o binario. `[MEDIDO 2026-08-28 pelo /review:
#      `command -v python3.12` -> `…/harness-panel/.venv/bin/python3.12` — o venv de OUTRO
#      projeto]`.
#   2. num shell SEM `python3.12`, o laco cai em `python3`, que sob o `pyenv` deste repo com
#      `.python-version` = 3.13.13 resolve 3.13 — e o venv nascia 3.13 EM SILENCIO, contra
#      `ADR-009/D4`.
# O adiamento do `.python-version` para `T-01.4` continua valendo. O que nao podia continuar e
# o script ACEITAR o que `ADR-009/D4` recusa. O assert abaixo confere a versao EFETIVA do
# interpretador DO VENV — a unica que os portoes usam, seja qual for o nome que a produziu — e
# sai 3 antes de gastar rede instalando dependencia em ambiente errado.
set -euo pipefail

PY_ALVO="3.12"   # ADR-009/D4

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$BACKEND/.venv"

escolher_interpretador() {
    for candidato in python3.12 python3 python3.13; do
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
    echo "RECUSA: o venv nasceu em $("$VENV/bin/python" -V 2>&1), e ADR-009/D4 declara Python $PY_ALVO." >&2
    echo "        Interpretador de bootstrap escolhido: '$PY_BOOTSTRAP' -> $(command -v -- "$PY_BOOTSTRAP")" >&2
    echo "        Nome de binario NAO e versao: 'python3' sob o pyenv desta raiz resolve o" >&2
    echo "        .python-version = 3.13.13 (remocao e T-01.4), e um 'python3.12' do PATH pode" >&2
    echo "        ser o venv de outro projeto. Aponte um 3.12 real, por exemplo:" >&2
    echo "          PATH=/caminho/do/python3.12/bin:\$PATH bash backend/scripts/bootstrap.sh" >&2
    echo "        O venv incompleto foi DEIXADO no disco de proposito, para inspecao: $VENV" >&2
    exit 3
fi

if [ "$USA_UV" -eq 1 ]; then
    uv pip install --python "$VENV/bin/python" -r "$BACKEND/requirements-dev.txt"
else
    "$VENV/bin/python" -m pip install --upgrade pip
    "$VENV/bin/python" -m pip install -r "$BACKEND/requirements-dev.txt"
fi

echo "ambiente pronto: $("$VENV/bin/python" -V) em $VENV (alvo ADR-009/D4: $PY_ALVO, CONFERIDO)"
