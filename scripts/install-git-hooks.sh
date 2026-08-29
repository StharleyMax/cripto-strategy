#!/usr/bin/env bash
# Instala os git hooks versionados deste repositório em .git/hooks.
#
# NÃO usa `core.hooksPath` de propósito: o `pre-push` deste repositório é GERADO por
# `harness install-hooks` e vive em .git/hooks. Redirecionar hooksPath o desligaria
# EM SILÊNCIO, que é a pior classe de quebra — o portão para de existir e nada avisa.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
# ⚠️ `$ROOT/.git/hooks` NAO SERVE, e o motivo foi medido em 2026-08-28 por `T-01.5`: numa
# WORKTREE — o layout que este repositorio usa para rodar tasks em paralelo — `.git` e um
# ARQUIVO, nao um diretorio, e este script morria na primeira copia
# [MEDIDO 2026-08-28: `bash scripts/install-git-hooks.sh` de dentro de
# `/tmp/claude-1002/wt/T-01.5` -> "install: nao foi possivel obter estado de
# '.../.git/hooks/commit-msg': Nao e um diretorio", rc=1, ZERO arquivo instalado].
# Consequencia real e nao teorica: quem escreveu `scripts/hooks/pre-push.pre-harness`
# (`ADR-011/D3b`) nao conseguia instala-lo do lugar onde o escreveu.
#
# `git rev-parse --git-path hooks` responde a pergunta CERTA — "onde o git PROCURA hook?" —
# e a resposta e o diretorio COMUM, o mesmo de qualquer worktree
# [MEDIDO 2026-08-28: da raiz principal e da worktree, os dois devolvem
# `/home/stharley/Documentos/projects/cripto-strategy/.git/hooks`]. `--path-format=absolute`
# e OBRIGATORIO: sem ele, da raiz principal a saida e o RELATIVO `.git/hooks`, que depende do
# cwd — mesma armadilha que `harness_home.sh` documenta.
#
# COROLARIO QUE VALE DIZER EM VOZ ALTA: hook e COMPARTILHADO entre worktrees. Instalar de
# uma worktree instala para TODAS, inclusive as das outras tasks em andamento.
DESTINO="$(git rev-parse --path-format=absolute --git-path hooks)"
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
