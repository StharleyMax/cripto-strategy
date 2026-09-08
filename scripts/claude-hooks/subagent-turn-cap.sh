#!/usr/bin/env bash
# Teto de turnos de subagente — o PORTÃO que `docs/protocolo-de-despacho.md` (R6, "O limite que
# este documento admite") declarava INEXISTENTE: *"um teto de turnos … não existe no mecanismo e
# seria mudança no plugin, não aqui"*. Não é mudança no plugin: é um hook `PostToolUse`.
#
# POR QUE EXISTE, com o número que o produziu
# `[MEDIDO 2026-09-07 sobre 614 subagentes de 14 sessões, ~/.claude/projects/<slug>/**/*.jsonl]`:
# a mediana de turnos por subagente JÁ obedece a doutrina (66–86, contra a base de 137), mas os
# máximos são 528, 483 e 404 — e os subagentes que passam de 150 turnos são 19% do universo e
# consomem 65% de todo o contexto de subagente. O corpo da distribuição não é o problema; a
# cauda é. Este hook não toca em quem obedece: ele só fala com a cauda.
#
# O QUE ELE FAZ, e o que ele DELIBERADAMENTE não faz: ele INJETA UM AVISO, não bloqueia. Um
# bloqueio no meio de uma task deixaria trabalho pela metade sem handoff escrito, que é pior que
# o custo que se quer evitar. Quem decide devolver continua sendo o agente — mas agora ele é
# informado, e prosa que ninguém lê deixa de ser a única cobrança.
#
# Escopo: SÓ subagente. O loop principal roda milhares de turnos legitimamente (2.843 na maior
# sessão medida) e é discriminado pelo caminho do transcript, que carrega `/subagents/`.
#
# Fonte versionada: scripts/claude-hooks/subagent-turn-cap.sh
# Registro:         `bash scripts/install-claude-hooks.sh` (idempotente).
#
# ⚠️ O REGISTRO NÃO É VERSIONADO, e isto tem de ser dito: `.claude/settings.json` é gitignored
# (`.gitignore:21`), porque carrega permissões com caminhos absolutos desta máquina. Logo, num
# clone limpo este arquivo existe e o portão NÃO — e nada avisa, a mesma classe de quebra que o
# `CLAUDE.md` descreve para `core.hooksPath`. Quem fecha a distância é o instalador acima.
#
# ⚠️ E ELE NÃO MORA EM `scripts/hooks/`: aquela pasta é o universo de `install-git-hooks.sh`,
# que instala TUDO que está lá em `.git/hooks`. Um hook de Claude Code ali seria copiado como
# hook de git, com um nome que o git não conhece — instalado em silêncio e nunca executado.
set -uo pipefail

LIMITE=150   # o teto que R6 declara
PASSO=50     # só repete o aviso a cada 50 turnos, para o próprio aviso não virar spam de contexto

ENTRADA="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TRANSCRIPT="$(printf '%s' "$ENTRADA" | jq -r '.transcript_path // empty' 2>/dev/null)"
if [[ -z "$TRANSCRIPT" || ! -f "$TRANSCRIPT" ]]; then
    SESSAO="$(printf '%s' "$ENTRADA" | jq -r '.session_id // empty' 2>/dev/null)"
    [[ -z "$SESSAO" ]] && exit 0
    TRANSCRIPT="$(find "$HOME/.claude/projects" -name "${SESSAO}.jsonl" -print -quit 2>/dev/null)"
fi
[[ -z "$TRANSCRIPT" || ! -f "$TRANSCRIPT" ]] && exit 0

# Loop principal não tem teto: só subagente é cobrado aqui.
[[ "$TRANSCRIPT" != *"/subagents/"* ]] && exit 0

TURNOS="$(grep -c '"type":"assistant"' "$TRANSCRIPT" 2>/dev/null || echo 0)"
[[ "$TURNOS" -lt "$LIMITE" ]] && exit 0

ESTADO_DIR="${TMPDIR:-/tmp}/claude-subagent-turn-cap"
mkdir -p "$ESTADO_DIR" 2>/dev/null || exit 0
ESTADO="$ESTADO_DIR/$(basename "$TRANSCRIPT" .jsonl).last"
ULTIMO="$(cat "$ESTADO" 2>/dev/null || echo 0)"
[[ "$ULTIMO" =~ ^[0-9]+$ ]] || ULTIMO=0
[[ "$TURNOS" -lt $((ULTIMO + PASSO)) ]] && exit 0
printf '%s' "$TURNOS" > "$ESTADO"

AVISO="PORTÃO R6 (docs/protocolo-de-despacho.md) — este subagente está no turno ${TURNOS}, acima do teto de ${LIMITE}.

O custo de contexto é QUADRÁTICO nos turnos, não linear: 376 turnos custaram 93M; 188 custariam ~22M pelo mesmo trabalho. Cada turno a mais aqui custa mais que o anterior.

O que fazer AGORA, salvo se faltar literalmente uma chamada para terminar:
  1. escreva o estado em docs/context/<feature>/handoff/<TASK>.md — o que já foi feito, o que falta, os caminhos e os números medidos;
  2. DEVOLVA (no máximo 15 linhas: veredito, números com o comando que os produziu, e o caminho do relatório completo);
  3. o workflow invoca o próximo agente com aquele arquivo como entrada.

Cadeia de agentes curtos custa quadraticamente menos que um agente longo, pelo mesmo trabalho."

jq -n --arg ctx "$AVISO" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}, suppressOutput: true}'
