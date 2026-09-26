# W4 — code-review r2 (nível high) de `master...wave/paineis-f02`, HEAD `2b1b2f4`

- **Veredito: APPROVED.** Nenhum achado **CONFIRMADO de correção**. A skill classificou 2 dos 8 achados como
  correção. Verificados à mão (§2), os dois são os mesmos WARNING 1 e 2 do `W4-CODE-REVIEW.md` (r1) e continuam
  não sendo defeito introduzido por este diff.
- **Universo:** `git diff --stat master...wave/paineis-f02` dá 88 arquivos, +8828/−453, em 36 commits.
- **O que mudou desde o r1 (`84a1032`):** `git diff --stat 84a1032 wave/paineis-f02` dá 8 arquivos. A única linha
  de `frontend/`/`backend/` é **um comentário** em `SymbolClient.tsx:1728-1729`, que troca `SEM_PONTO` por
  `ABSENCE_TOKEN` (`ausente`). O resto é doc do `W4-QA-fix` e o laudo `W4-QA-r2`. O comentário foi conferido contra
  o código: `ABSENCE_TOKEN = "ausente"` é o valor que 4 testes de contrato fixam (`*-dom-contract.test.ts`,
  `absence-readout-microcopy.test.ts`).
- **Instrumento:** a skill `code-review` em `high`, num fork (`agent-a535bb9079ce7315e`, 139 linhas de transcript).
  Ela devolveu o veredito NEEDS_FIX e só o resumo por categoria. O array de achados **não foi emitido**
  `[MEDIDO: nenhum tool_use ReportFindings no transcript]`, então cada categoria foi reconstruída pelos comandos
  que o fork rodou, e as duas de correção foram re-derivadas a partir do código.
- **Portões rodados na worktree** `[MEDIDO 2026-09-26, HEAD 2b1b2f4]`:
  - `npm run -s test:charts` dá 323 pass e 0 fail.
  - `npm run -s test:app` dá 586 pass e 0 fail.
  - `npm run -s typecheck` dá rc=0.
  - `npx eslint` sobre os 5 arquivos de produção tocados dá rc=0.
- **Conformidade:** o fork mediu que todos os commits têm autor e committer = owner, com 0 `Co-Authored-By`, e que
  `docs/INDEX.md` só ganha linhas (0 linhas removidas).

## 1. Os 8 achados da skill, por categoria

| categoria (skill) | n | destino |
|---|---|---|
| correção | 2 | §2: nenhum dos dois é CONFIRMADO |
| drift de teste | 2 | não é correção por construção. Os unitários estão verdes (909/909) |
| design/semântica | 2 | cabe ao `design_gate` (`CLAUDE.md` §Design). O r1 já registrou o matiz como único canal (WARNING 4) |
| convenção `CLAUDE.md` | 1 | a docstring em PT de `SymbolClient.tsx:1785` (r1 NIT 7). Idioma é "convenção, não portão" |
| limpeza | 1 | `positiveValueSeriesLossless` duplicada/mensagem do `RangeError` (r1 NIT 5) |

## 2. As duas de correção, verificadas

| # | alegação | verificação | classe |
|---|---|---|---|
| C-a | Os readouts `sr-only` imprimem `String(value)`, com ruído IEEE-754. | `SymbolClient.tsx:1818-1819` é **byte a byte igual** a `master:1790-1791`. O mesmo vale para os outros 5 `readingText` (master `:1968, 2165, 2347, 2678, 3327`). O diff não tocou a formatação, só o token de ausência. | **PREEXISTENTE.** Não entra neste diff. Fica como dívida de a11y (r1 WARNING 2) |
| C-b | Com `keepFloor` nas velas e `bottom 0.22`, a legenda alta joga o pane em `overflow`. | Base `PRICE_CANDLE_SCALE_MARGINS = {0.2, 0.22}` (`:1536`). Por `paneScaleMargins` (`pane-stack-layout.ts:211-244`), `top+bottom ≥ 1` ⇔ `0.8r + 0.42 ≥ 1` ⇔ `r ≥ 0.725`, contra o teto `MAX_LEGEND_RESERVE_FRACTION = 0.75`. A aritmética está **CONFIRMADA**. | **Sem dano alcançável.** Em `r = 0.72` a faixa da vela é `1−0.776−0.22 = 0.4%` ≈ 1,3 px, já ilegível. O fallback é o mesmo do teto por desenho e publica `overflow` honestamente. É preciso uma legenda de cerca de 243 px num pane de 335 px, e o teste de legenda alta usa 90 px. Fica WARNING (r1 #1) |

**Nota nova (NIT):** o comentário em `pane-stack-layout.ts:238`, *"Only reachable through `clearSeparator`"*, deixou
de ser verdade com `keepFloor`. O arquivo não está neste diff, e o `keepFloor` das barras já existia no `master`.

## 3. Relação com os outros portões da W4

O `W4-QA-r2` está APPROVED, o `W4-REVIEW` está COMPLIANT e o `W4-DESIGN-REVIEW` está APPROVED 63/100. Este laudo
não acrescenta bloqueio. Os WARNING e NIT do r1 seguem como dívida não bloqueante.
