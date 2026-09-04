#!/usr/bin/env bash
# Classificador de REFERENCIA de `own.compose-hardcoded-secret` — `T-01.10`, `D1.14b`.
#
# ── POR QUE ELE EXISTE, e por que nao pode ser a mesma regex ───────────────────────
#
# `harness corpus verify` afere IGUALDADE DE VEREDITO entre DUAS implementacoes, e
# `harness corpus mutate` RECUSA rodar sem esta (`ci/scope_mutation_check.py:152-158`:
# *"sem ele nao ha com quem discordar, e nenhum vermelho prova nada"*). Reimplementar a
# regex da politica aqui daria concordancia por construcao — duas copias do mesmo erro
# concordam perfeitamente. Entao este arquivo decide por OUTRO mecanismo: `awk` separa a
# linha em chave e valor por campo, e julga os dois lados separadamente, sem `^`, sem
# alternancia e sem classe negada.
#
# ── O CONTRATO, que e do arnes e nao meu ──────────────────────────────────────────
#
# entrada  : JSON em stdin, `{"tool_input": {"file_path": "<absoluto>"}}`
#            (`corpus/harness.py:run_reference`)
# saida    : linha em STDERR comecando por uma das `reference_tags` do manifesto
# casamento: a `needle` declarada em `[[reference_message]]` decide qual regra disparou
#
# O ESCOPO DE CAMINHO E METADE DE TODA REGRA, e por isso ele e julgado aqui tambem: o
# arnes materializa cada caso no `repo_path` declarado, e um caso no caminho errado nao
# prova nada. Esta referencia so olha `.yml`/`.yaml` sob um diretorio `deploy/`.
set -u

payload="$(cat)"
path="$(printf '%s' "$payload" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

[ -n "$path" ] || exit 0
[ -f "$path" ] || exit 0
case "$path" in
    */deploy/*.yml|*/deploy/*.yaml|deploy/*.yml|deploy/*.yaml) ;;
    *) exit 0 ;;
esac

hit="$(awk '
function is_credential_key(k) {
    k = tolower(k)
    return (index(k, "password") || index(k, "passwd") || index(k, "secret") \
         || index(k, "apikey")   || index(k, "api_key") || index(k, "api-key") \
         || index(k, "accesskey")|| index(k, "access_key") || index(k, "access-key") \
         || index(k, "token")    || index(k, "dsn") || index(k, "connection_string"))
}
# `T-01.10` rodada 2 — as tres funcoes abaixo mudaram porque o QA achou 2 escapes reais
# nesta MESMA classe de defeito do lado da regra (`harness.toml`): checar "contem em
# QUALQUER LUGAR do valor" em vez de "e o proprio valor, desde o inicio dele". A
# referencia tinha o MESMO defeito, so que implementado em awk em vez de regex — entao
# um caso `violating` que prova o fechamento do lado da regra teria de divergir aqui, e
# a divergencia reprovaria `corpus verify` por um motivo errado (a referencia estava
# tambem cega, nao a regra). Corrigido nos dois lados, por mecanismos diferentes.
#   (A) `POSTGRES_PASSWORD: hunter2_prod_master${UNUSED}` — o `${UNUSED}` e decorativo e
#       morto; a versao anterior de `is_literal_value` via `$` EM QUALQUER LUGAR do valor
#       e desistia. Agora so desiste se o valor COMECA por indirecao de fato.
#   (B) `POSTGRES_PASSWORD: hunter2_prod_master  # changeme depois` — a palavra de
#       amostra estava no COMENTARIO, nao no valor; a versao anterior nem separava
#       comentario de valor, e a checagem de "espaco em qualquer lugar" desistia so por
#       ter um `#` com espaco antes. Agora o comentario e cortado ANTES de qualquer
#       julgamento, e "amostra" so conta se for o INICIO do valor remanescente.
function starts_with_indirection(v) {
    return (v ~ /^\$\{/)                     # `${...}` logo no inicio do valor
}
function is_placeholder(v) {
    lv = tolower(v)
    return (lv ~ /^(example|placeholder|changeme|dummy|redacted)/)
}
function is_literal_value(v) {
    if (length(v) < 6) return 0
    if (starts_with_indirection(v)) return 0
    if (is_placeholder(v)) return 0
    if (index(v, " ") || index(v, "\t")) return 0
    return 1
}
{
    line = $0
    sub(/^[ \t]*-[ \t]*/, "", line)          # item de lista `- CHAVE=valor`
    sub(/^[ \t]+/, "", line)
    gsub(/["\047]/, "", line)                # aspas simples ou duplas ao redor
    sep = 0
    for (i = 1; i <= length(line); i++) {
        c = substr(line, i, 1)
        if (c == ":" || c == "=") { sep = i; break }
    }
    if (sep == 0) next
    key = substr(line, 1, sep - 1)
    val = substr(line, sep + 1)
    sub(/^[ \t]+/, "", val)
    sub(/[ \t]+#.*$/, "", val)               # comentario de fim de linha nao e o valor
    sub(/[ \t]+$/, "", val)
    if (!is_credential_key(key)) next
    lk = tolower(key)
    if (lk ~ /_file$/) next                  # `*_FILE: /run/secrets/...` e o CONSERTO
    if (val ~ /^\/run\/secrets\//) next       # o mesmo padrao pelo lado do valor, no INICIO
    if (!is_literal_value(val)) next
    print NR
    exit
}' "$path")"

if [ -n "$hit" ]; then
    echo "[REF-COMPOSE] $path:$hit segredo literal em compose" >&2
fi
exit 0
