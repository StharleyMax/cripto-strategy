#!/usr/bin/env bash
# Registra os hooks de Claude Code deste repositório em .claude/settings.json.
#
# POR QUE ESTE SCRIPT EXISTE, e é a única razão: `.claude/settings.json` é **gitignored**
# (`.gitignore:21`, `.claude/*`) porque carrega regras de permissão com caminhos absolutos DESTA
# máquina. Consequência: o hook em `scripts/claude-hooks/` é versionado, mas o REGISTRO dele não
# é. Num clone limpo o script existe e o portão NÃO — e nada avisa, que é a mesma classe de
# quebra que `install-git-hooks.sh` cita para o `core.hooksPath`. Este script é o que fecha essa
# distância, e é idempotente pelo mesmo motivo que o outro é.
#
# ⚠️ POR QUE O HOOK NÃO MORA EM `scripts/hooks/`: aquela pasta é o universo de
# `install-git-hooks.sh`, que faz `for src in "$ORIGEM"/*` e instala TUDO em `.git/hooks`. Um
# hook de Claude Code ali seria copiado como se fosse hook de git — nome que o git não conhece,
# instalado em silêncio, sem nunca rodar. Daí a pasta separada.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SETTINGS="$ROOT/.claude/settings.json"
HOOK_REL="scripts/claude-hooks/subagent-turn-cap.sh"
HOOK_ABS="$ROOT/$HOOK_REL"

command -v jq >/dev/null 2>&1 || { echo "RECUSA: jq nao encontrado; ele e obrigatorio para editar JSON sem reescrever o arquivo." >&2; exit 3; }
[ -x "$HOOK_ABS" ] || { echo "RECUSA: $HOOK_REL ausente ou sem permissao de execucao." >&2; exit 3; }

mkdir -p "$ROOT/.claude"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

# `${CLAUDE_PROJECT_DIR:-<absoluto>}`: o fallback nao e decorativo. Se a variavel nao existir no
# ambiente do hook, `bash /scripts/...` falharia em TODA chamada de ferramenta — ruido constante
# em vez de portao. Com o fallback, funciona nos dois casos.
COMANDO="bash \"\${CLAUDE_PROJECT_DIR:-$ROOT}\"/$HOOK_REL"

# O gerador tem de ATRAVESSAR os dois níveis (grupos de matcher → hooks) e a entrada tem de ser
# o documento inteiro. `(.hooks.PostToolUse // []) | any(.hooks[]?; …)` NÃO serve e foi medido
# falhando: com um array como entrada, `.hooks[]?` não casa nada, o `?` engole o erro, `any`
# sobre vazio devolve `false` e o script registra de novo — 3 execuções, 3 registros duplicados
# `[MEDIDO 2026-09-07 antes desta correção]`.
if jq -e --arg c "$COMANDO" \
     'any(.hooks.PostToolUse[]?.hooks[]?; .command == $c)' "$SETTINGS" >/dev/null 2>&1; then
    printf '  ja registrado  %s\n' "$HOOK_REL"
    exit 0
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
jq --arg c "$COMANDO" '
  .hooks //= {} |
  .hooks.PostToolUse //= [] |
  .hooks.PostToolUse += [{
    hooks: [{
      type: "command",
      command: $c,
      timeout: 10,
      statusMessage: "portao R6: teto de turnos de subagente"
    }]
  }]
' "$SETTINGS" > "$TMP"

# Só troca o arquivo se o resultado for JSON válido: um settings.json malformado desliga TODAS
# as configurações daquele arquivo em silêncio, permissões inclusive.
jq -e . "$TMP" >/dev/null || { echo "RECUSA: o merge produziu JSON invalido; $SETTINGS NAO foi tocado." >&2; exit 3; }
cat "$TMP" > "$SETTINGS"
printf '  registrado     %s  (PostToolUse)\n' "$HOOK_REL"
printf '  abra /hooks ou reinicie a sessao para o Claude Code recarregar a configuracao.\n'
