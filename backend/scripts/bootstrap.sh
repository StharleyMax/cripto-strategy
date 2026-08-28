#!/usr/bin/env bash
# bootstrap.sh — cria `backend/.venv` com POETRY e instala as dependencias FIXADAS de
# desenvolvimento.
#
# E o UNICO passo do backend que precisa de rede. O `test_cmd` declarado
# (`backend/scripts/test.sh`) roda offline sobre o ambiente que este script deixa pronto,
# e RECUSA se ele nao existir — nunca cai para o interpretador do PATH.
#
# Chamado por `make setup`, na raiz. Ate 2026-08-28 NENHUM alvo o chamava — as tres mencoes a
# `bootstrap.sh` em `lint.sh`, `test.sh` e `check-coverage-layers.sh` eram TEXTO DE MENSAGEM DE
# ERRO, nao chamada, e o assert de versao abaixo nao era executado por ninguem
# [MEDIDO 2026-08-28 pelo /review]. Ver a secao "O portao que faltava" mais abaixo.
#
# ── O GERENCIADOR VIROU POETRY EM 2026-08-28 (`ADR-011/D1`, `T-01.6`) ──
#
# Ate aqui: `uv venv` + `uv pip install -r requirements-dev.txt`, com reserva em
# `python -m venv` + `pip`. Duas razoes para a troca, e a primeira e autoridade e nao tecnica:
#   "Aplicacao deve rodar com poetry, ter Makefile para simplicar as chamadas, builds e afins"
#   [PREMISSA-OWNER: 2026-08-28, citacao literal, registrada em `ADR-011/D1`]
# A segunda e o `poetry.lock` versionado: a resolucao transitiva passa a ser a MESMA em clone
# limpo, que era exatamente o falsificador que `T-01.1` registrou ao escolher `uv pip`.
#
# `backend/requirements-dev.txt` FOI REMOVIDO. As 5 dependencias vivem em
# `[tool.poetry.group.dev.dependencies]` do `backend/pyproject.toml`, com pin exato.
#
# ── ONDE O VENV NASCE E CONTRATO, e ele mora em `backend/poetry.toml` ──
#
# Os outros tres scripts resolvem `backend/.venv/bin/python` LITERAL. O Poetry so poe o venv
# ali se `virtualenvs.in-project` for verdadeiro — e nesta maquina isso e config de USUARIO,
# nao do repositorio [MEDIDO 2026-08-28: `cd /tmp && poetry config virtualenvs.in-project` ->
# `true`, lido de fora do repo]. `backend/poetry.toml`, VERSIONADO, fixa isso para o clone.
# Sem ele o venv nasceria em `~/.cache/pypoetry/virtualenvs/` e as tres recusas `rc=3` de
# "venv nao existe" disparariam SEMPRE — e `rc=3` por venv ausente NAO e portao aprovando.
#
# ── IDEMPOTENCIA: consertada, e o defeito era medido (`/review` de `T-01.4`, divida 2 de 4) ──
#
# `uv venv` sobre venv existente saia `rc=2` (`A virtual environment already exists ... Use
# --clear to replace it`) [MEDIDO 2026-08-28]. Para migrar 3.12 -> 3.13 foi preciso mover o
# venv antigo para fora antes de rodar. `poetry env use` + `poetry install` convergem sobre o
# venv que ja existe, sem `--clear` e sem apagar nada: rodar duas vezes seguidas sai `rc=0` nas
# duas.
#
# ── PREFERENCIA POR NOME NAO E GARANTIA DE VERSAO, e agora o script passa o CAMINHO ──
#
# Duas falhas medidas na forma antiga, e as duas sobrevivem a troca de gerenciador porque sao
# sobre NOME nao ser VERSAO:
#   1. o nome nao diz nem a versao nem de quem e o binario [MEDIDO 2026-08-28 pelo /review:
#      `command -v python3.12` -> `.../harness-panel/.venv/bin/python3.12`, o venv de OUTRO
#      projeto].
#   2. num shell SEM o interpretador preferido, o laco cai em `python3`, cuja versao depende do
#      `pyenv` do shell — e o venv nascia com a versao errada EM SILENCIO.
#
# O conserto que o `/review` prescreveu (divida 1 de 4) era passar
# `"$(command -v -- "$candidato")"` — o CAMINHO ABSOLUTO — em vez do nome. Sob `uv` isso nao
# bastava: `uv python find` preferia o CPython dele (`~/.local/share/uv/python/cpython-3.13-...`)
# e o venv nascia 3.13.12 enquanto o `.python-version` declarava 3.13.13. Com Poetry o caminho
# E honrado [MEDIDO 2026-08-28 por `T-01.6`: `poetry env use "$(command -v -- python3.13)"` ->
# `.venv/pyvenv.cfg` com `home = ~/.pyenv/versions/3.13.13/bin` e `version = 3.13.13`,
# IGUAL ao `.python-version` da raiz. A deriva de patch FECHOU].
#
# ── MAS O CAMINHO ABSOLUTO TAMBEM NAO E VERSAO, e isto foi MEDIDO em bancada por `T-01.6` ──
#
# `command -v python3.13` devolve `~/.pyenv/shims/python3.13` — um SHIM, que e um despachante,
# nao um interpretador. Ele resolve a versao contra o `.python-version` do diretorio de onde e
# invocado. Numa replica do `backend/` FORA da arvore (logo sem o `.python-version` da raiz),
# `poetry env use ~/.pyenv/shims/python3.13` falhou com `pyenv: python3.13: command not found`
# e `Could not find the python executable` [MEDIDO 2026-08-28]. Caminho absoluto, e ainda assim
# a versao dependia do CWD.
#
# E a licao de "nome nao e versao" numa TERCEIRA forma — depois de (1) o nome do binario e
# (2) o nome passado a ferramenta. Por isso este script nao para no `command -v`: ele pergunta
# ao proprio candidato onde ele mora (`sys.executable`), o que resolve o shim ate o binario
# real e, de quebra, RECUSA um candidato que nem executa em vez de passa-lo adiante.
#
# Isso NAO aposenta o assert: ele confere a versao que NASCEU, nao a que foi pedida, e e a
# unica coisa que o faz. `mypy python_version` e `ruff target-version` declaram ALVO — um venv
# 3.12 passaria o lint igual.
#
# ── O PORTAO QUE FALTAVA (`/review` de 2026-08-28, o mais grave dos quatro achados) ──
#
# O achado: NENHUM portao chamava este script, logo o assert de versao efetiva nao rodava
# nunca. `T-01.6` decidiu as DUAS metades, e a razao de nao escolher so uma esta no
# `Makefile` da raiz, alvo `setup`:
#   (a) `make setup` chama este script — mas `make setup` e comando de humano, nao portao;
#   (b) por isso a assercao da versao EFETIVA do venv entrou tambem em `backend/scripts/lint.sh`,
#       que e alcancavel pelo portao que `T-01.5` costura (`scripts/hooks/pre-push.pre-harness`
#       -> `make lint`). So (a) deixaria o achado aberto com aparencia de fechado.
set -euo pipefail

PY_ALVO="3.13"   # ADR-011/D5 (supersede ADR-009/D4, que dizia 3.12)

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$BACKEND/.venv"

if ! command -v poetry >/dev/null 2>&1; then
    echo "RECUSA: 'poetry' nao esta no PATH, e ADR-011/D1 o declara como o gerenciador." >&2
    # A URL da documentacao NAO esta escrita aqui de proposito: `backend/README.md`,
    # "Zero rede, zero chave", varre `scripts/` com um padrao que casa `http`, e o unico
    # numero interessante daquela secao e "0 ocorrencia fora de comentario". Um endereco de
    # documentacao dentro de um `echo` (que nao e linha de comentario) o levaria a 1 e
    # gastaria o sinal do portao com prosa.
    echo "        Instale-o conforme a documentacao oficial do Poetry (python-poetry.org)." >&2
    echo "        Medido em 2026-08-28 nesta maquina: 'poetry --version' -> Poetry (version 2.4.1)." >&2
    exit 3
fi

escolher_interpretador() {
    local candidato real
    for candidato in python3.13 python3; do
        # 1. existe no PATH?
        command -v -- "$candidato" >/dev/null 2>&1 || continue
        # 2. EXECUTA? Um shim do pyenv sem versao selecionada existe e nao roda — e passa-lo ao
        #    Poetry produz uma falha a duas camadas de distancia do motivo.
        real="$("$candidato" -c 'import sys; print(sys.executable)' 2>/dev/null)" || continue
        # 3. e o binario REAL, resolvido pelo proprio interpretador — nao o shim, nao o nome.
        [ -n "$real" ] && [ -x "$real" ] || continue
        printf '%s\n' "$real"
        return 0
    done
    echo "RECUSA: nenhum interpretador Python EXECUTAVEL encontrado no PATH." >&2
    echo "        Procurados, nesta ordem: python3.13, python3." >&2
    echo "        'existe no PATH' nao basta: um shim do pyenv sem versao selecionada existe e" >&2
    echo "        nao roda. Este script exige um candidato que responda a 'sys.executable'." >&2
    exit 3
}

PY_BOOTSTRAP="$(escolher_interpretador)"

cd "$BACKEND"

# `poetry env use` falha com rc=1 e mensagem propria quando o candidato nao satisfaz o
# `requires-python` de `[project]`. A mensagem dele esta certa e e citada abaixo; o que se
# acrescenta e o rc=3 deste repositorio ("nao mediu / ambiente nao declarado", distinto de
# rc=1 "mediu e reprovou") e o ponteiro para a ADR que decidiu a faixa.
#
# MEDIDO 2026-08-28 por `T-01.6`, em bancada isolada com PATH onde `python3` era 3.12.8 REAL e
# `python3.13` NAO existia: o Poetry recusou ANTES de criar qualquer coisa —
#   "The specified Python version (3.12.8) is not supported by the project (>=3.13,<3.14)."
# e `backend/.venv` nao chegou a nascer. E a RESPOSTA a divida herdada 2 de 4: o `uv`, no MESMO
# cenario, criava um venv 3.13.12 assim mesmo — nao honrava o interpretador que recebia. O
# Poetry honra, e o `requires-python` que `T-01.6` declarou faz o servico de portao aqui.
if ! poetry env use "$PY_BOOTSTRAP"; then
    echo "RECUSA: 'poetry env use' rejeitou o interpretador escolhido." >&2
    echo "        Candidato: $PY_BOOTSTRAP -> $("$PY_BOOTSTRAP" -V 2>&1)" >&2
    echo "        Causa mais provavel: ele nao satisfaz o requires-python = '>=3.13,<3.14'" >&2
    echo "        declarado em backend/pyproject.toml [ADR-011/D5, superficie 4 de 4]." >&2
    echo "        A mensagem do Poetry, logo acima, nomeia a versao e a faixa." >&2
    echo "        Aponte um $PY_ALVO real e repita:" >&2
    echo "          PATH=/caminho/do/python$PY_ALVO/bin:\$PATH make setup" >&2
    exit 3
fi

# FALSIFICADOR DE ADR-011/D1, escrito como recusa e nao como nota de rodape: se o Poetry
# produzir um ambiente em que `backend/.venv/bin/python` NAO exista, a forma escolhida NAO
# preserva o contrato dos outros tres scripts, e a decisao precisa reescrever a resolucao de
# interpretador em vez de herda-la. Este script diz isso em voz alta em vez de contornar.
if [ ! -x "$VENV/bin/python" ]; then
    echo "RECUSA: 'poetry env use' nao criou $VENV/bin/python." >&2
    echo "        E o falsificador de ADR-011/D1: os outros tres scripts resolvem esse caminho" >&2
    echo "        LITERAL, e sem ele a migracao para Poetry nao preserva o contrato deles." >&2
    echo "        Causa mais provavel: 'virtualenvs.in-project' desligado. Confira que" >&2
    echo "        backend/poetry.toml esta na arvore e diz '[virtualenvs] in-project = true':" >&2
    echo "          poetry -C \"$BACKEND\" config virtualenvs.in-project   # espera: true" >&2
    echo "        Onde o venv de fato nasceu: $(poetry env info --path 2>/dev/null || echo '<poetry env info falhou>')" >&2
    echo "        Se 'in-project' JA diz true e mesmo assim o venv nasceu fora, o Poetry esta" >&2
    echo "        GRUDADO num ambiente que ele registrou antes: o 'envs.toml' do cache guarda o" >&2
    echo "        env corrente por projeto, e 'env use' o reaproveita em vez de criar em" >&2
    echo "        backend/.venv [MEDIDO 2026-08-28 por T-01.6, em replica isolada: bootstrap" >&2
    echo "        rodado SEM poetry.toml e depois COM ele -> as duas vezes rc=3, pelo residuo]." >&2
    echo "        Desgrude e repita (o IN_PROJECT=false e OBRIGATORIO: com ele ligado," >&2
    echo "        'env remove --all' so enumera o .venv do PROJETO e NAO ve o env do cache," >&2
    echo "        que e justamente o que gruda — sai rc=0 sem imprimir nada e sem apagar" >&2
    echo "        nada) [MEDIDO 2026-08-28 pelo /qa e reproduzido por T-01.6, n=3 receitas" >&2
    echo "        com controle invertido em cada uma]:" >&2
    echo "          POETRY_VIRTUALENVS_IN_PROJECT=false poetry -C \"$BACKEND\" env remove --all && make setup" >&2
    exit 3
fi

# O assert. Roda ANTES de instalar: rede gasta em ambiente errado e rede desperdicada, e um
# venv 3.13 meio-instalado e pior que nenhum. Ele confere a versao do venv que NASCEU — a unica
# que os portoes usam —, nao o nome nem o caminho que foi pedido.
if ! "$VENV/bin/python" -c "import sys; raise SystemExit(0 if '.'.join(map(str, sys.version_info[:2])) == '$PY_ALVO' else 1)"; then
    echo "RECUSA: o venv nasceu em $("$VENV/bin/python" -V 2>&1), e ADR-011/D5 declara Python $PY_ALVO." >&2
    echo "        ADR-011/D5 supersede ADR-009/D4 (que declarava 3.12) por decisao do owner." >&2
    echo "        Interpretador de bootstrap escolhido: $PY_BOOTSTRAP" >&2
    echo "        Nome de binario NAO e versao: o .python-version = 3.13.13 desta raiz FICA (e" >&2
    echo "        rastreado), mas um 'python3.13' do PATH pode ser o venv de outro projeto, e" >&2
    echo "        'python3' resolve o que o pyenv do SEU shell disser. Aponte um $PY_ALVO real:" >&2
    echo "          PATH=/caminho/do/python$PY_ALVO/bin:\$PATH make setup" >&2
    echo "        O venv incompleto foi DEIXADO no disco de proposito, para inspecao: $VENV" >&2
    exit 3
fi

poetry install

echo "ambiente pronto: $("$VENV/bin/python" -V) em $VENV (alvo ADR-011/D5: $PY_ALVO, CONFERIDO)"
