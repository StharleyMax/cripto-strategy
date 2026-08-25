#!/usr/bin/env bash
# Instala os git hooks versionados deste repositório em .git/hooks.
#
# NÃO usa `core.hooksPath` de propósito: o `pre-push` deste repositório é GERADO por
# `harness install-hooks` e vive em .git/hooks. Redirecionar hooksPath o desligaria
# EM SILÊNCIO, que é a pior classe de quebra — o portão para de existir e nada avisa.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DESTINO="$ROOT/.git/hooks"
ORIGEM="$ROOT/scripts/hooks"

for src in "$ORIGEM"/*; do
    nome="$(basename "$src")"
    alvo="$DESTINO/$nome"
    if [ -f "$alvo" ] && grep -q 'harness-githook' "$alvo" 2>/dev/null; then
        printf '  ignorado  %-12s já é hook gerado pelo harness — não sobrescrevo\n' "$nome"
        continue
    fi
    install -m 0755 "$src" "$alvo"
    printf '  instalado %-12s\n' "$nome"
done

git config --local user.email stharleymax@gmail.com
git config --local user.name  "Stharley Maxwell"
printf '  fixado    user.email/user.name locais (não depende da config global)\n'
