# Design Critique — `T-01.3` · forma/microcopy dos 8 estados (`SPEC-003` §3.3) + mecanismo `I-8`

**Gate independente `ux-ui-mastery`, rodado pelo workflow (não pelo `ui-designer`) — `R9`.**
Artefato avaliado: **prosa de decisão**, não tela renderizada — `docs/product/DESIGN_SYSTEM.md` §9
(conteúdo produzido em `c348103`, branch `tasks/T-01.3-gate-design-f1`; texto de forma/microcopy
inalterado desde então — só o falsificador de §9.3 e a reconciliação `§6.1`×`§9.1` mudaram nas rodadas
seguintes, ver "Atualização" abaixo). Não existe HTML/screenshot do Stitch para esta decisão porque
`T-01.3` é `[web][docs]`: fixa forma+microcopy+mecanismo em documento; `T-01.4`/`T-01.5` implementam.
Cada citação de fonte foi conferida contra o arquivo do plugin, linha por linha (ver "Fidelidade das
fontes" abaixo) — não tomada de bom grado.

### Contexto
- **Artefato**: `DESIGN_SYSTEM.md` §9 — decisão de mecanismo de estilo (`I-8`: Tailwind + `shadcn/ui`,
  variantes de cor removidas) e tabela forma+microcopy dos 8 estados de `SPEC-003` §3.3
- **Público**: operador único (`STITCH_CONTEXT.md` §3) — não multiusuário
- **Metas** (`tasks.toml` `T-01.3`): 8 estados com forma+texto; contrato `data-fact` intocado; nenhum
  token novo (`NG-5`); nenhum código de app; guarda de cor por severidade (`D17`) estendida aos 4 erros

### Statements of Meaning (Forças)
1. **Fidelidade de fonte, verificada literalmente.** As 5 citações novas de §9.2 (`nng-ux-heuristics`
   H9, Doherty Threshold, `product-deep-dives` Stripe, `neurodiversity-accommodations`,
   `wcag-aria-patterns`) foram conferidas linha a linha contra o arquivo do plugin em
   `~/.claude/plugins/cache/ux-ui-mastery-marketplace/ux-ui-mastery/3.0.0/skills/`: **todas reproduzem
   exatamente**, incluindo a citação de `wcag-aria-patterns.md:591`, que aponta para a linha exata do
   `<div>` de exemplo (não uma aproximação).
2. **A tensão H9 ("sem código") × `SPEC-003` §3.3 (`status` obrigatório em `non_2xx`) foi nomeada e
   resolvida em vez de ignorada** — o número aparece embutido em frase, nunca isolado (§9.2, linha
   `non_2xx`).
3. **A guarda de severidade-sem-cor (`D17`) foi estendida com o argumento certo, não só a conclusão**:
   os 4 `Alert` de erro reusam tokens **já medidos** (`--proc-forte`/`--proc-fraca`/`--acao-borda`) em
   vez de inventar um quinto papel de cor — `NG-5` respeitado de fato, não só declarado.
4. **Reuso do precedente `§6.1`** (`@shadcn/badge`, variantes removidas-não-sobrescritas) estendido
   com o mesmo tratamento a `alert`/`empty`/`skeleton` — consistência de método entre revisões do
   mesmo documento.
5. **`[NÃO SEI]`/`[INFERRED]` usados onde cabem** (nomes de ícone `lucide`, aceite do
   `frontend-architect` sobre `I-8`) — a seção não finge fechar o que não fechou (§9.0, §9.4).

### Fidelidade das fontes — o que foi conferido, comando por comando
```
grep -n "Help Users Recognize\|Error messages must state" nng-ux-heuristics/SKILL.md         # 129,134 — casa
grep -n "Skeleton screens" cognitive-psychology-ux/references/laws-of-ux-encyclopedia.md      # 223 — casa
grep -n "render gray blocks" design-critique-case-studies/references/product-deep-dives.md    # 39 — casa
grep -n "Replace loading skeletons" accessibility-inclusive-design/references/neurodiversity-accommodations.md  # 327 — casa
grep -n "aria-live=.assertive." accessibility-inclusive-design/references/wcag-aria-patterns.md                  # 577 — casa
```
`STITCH_CONTEXT.md` `D17` (linha 1103) conferido byte a byte contra a citação em
`DESIGN_SYSTEM.md:1209` — idêntico.

### Dimension Scores
| Dimensão | Nota | Observação |
|---|---|---|
| Clarity | 9 | Tabela 1 estado = 1 linha, sem ambiguidade forma×texto×`data-fact` |
| Consistency | 9 | Reusa tokens/precedente `§6.1` em vez de inventar; mesmo tratamento em 4 primitivos novos |
| Hierarchy | 8 | Título+descrição em H9 (causa+próximo passo); `role`/`aria-live` corretos por urgência |
| Efficiency | 8 | Zero token novo, zero componente sem discovery prévio |
| Accessibility | 8 | ARIA bem fundamentado; falta cobrir foco/afordância de retry (ver Should-Fix) |
| Emotional Design | 7 | Tom neutro apropriado a console de diagnóstico single-user |
| Error Resilience | 7 | Mensagem nomeia causa+ação, mas nenhuma tem controle de retry — só texto |
| Cognitive Load | 8 | Padrão icone+título+descrição repetido nos 4 erros reduz aprendizado por estado |
| Innovation | 6 | Deliberadamente convencional (non-goal desta fase é inovar em UI) |
| Polish | 8 | Citações exatas; falsificador de §9.3 corrigido nesta rodada (ver "Atualização") |

**Overall Score**: 7,9/10 — decisão sólida, sem violação bloqueante; um ponto residual a fechar antes de
`T-01.4` (ver Should-Fix 2, fora do escopo desta task).

### Findings

#### Must-Fix
*(nenhum)*

#### Should-Fix
1. ~~O falsificador de `§9.3` mede um proxy incompleto~~ **RESOLVIDO nesta consolidação.** O comando
   original (`grep -rn 'destructive\|text-red-\|bg-red-\|border-red-' …`) não capturava cor vermelha
   introduzida via valor arbitrário do Tailwind (`bg-[#f23645]`, `text-[#d03b3b]`). `DESIGN_SYSTEM.md`
   §9.3 (linha `1224`, branch `tasks/T-01.3-gate-design-f1` consolidada em `2026-09-06`) já estende o
   grep com os dois hex literais: `grep -rn 'destructive\|text-red-\|bg-red-\|border-red-\|f23645\|d03b3b' frontend/src/app/painel frontend/src/features --include='*.tsx' → 0` (comando ainda não roda — os
   arquivos de `T-01.4`/`T-01.5` não existem em `F1`; fica registrado para ser copiado, não
   redescoberto). Este projeto já documentou a mesma classe de defeito duas vezes (`CLAUDE.md`
   §"Nenhum número sem comando"): um falsificador que não pode disparar não mede erosão nenhuma —
   **agora ele pode**.
2. **DoD "completo" de `T-01.3` no sentido dos três juízes de `tasks.toml` ainda não fecha por inteiro.**
   `tasks.toml` nomeia **dois** julgamentos além deste (`ui-designer` para forma/microcopy — julgado
   `[OK]` aqui — e `frontend-architect` para `I-8`). Este documento fecha o veredito do `ux-ui-mastery`
   sobre **forma/microcopy** (o `DoD` literal e machine-checável de `T-01.3`: `test -f` + veredito
   concordando + 8 estados com forma/texto + `data-fact` intocado + `docs/product/` atualizado — todos
   satisfeitos). **Não fecha**, e não finge fechar, a ratificação por escrito do `frontend-architect`
   sobre o mecanismo `I-8` (`§9.1`) — nenhuma sessão até `2026-09-06` produziu esse artefato, e este
   gate (`ux-ui-mastery`, avaliando forma/microcopy) não é o juiz de mecanismo de estilo. `[NÃO SEI]`
   quando essa ratificação será colhida — decisão do coordenador, fora do escopo `[web]` desta
   consolidação de estado.

#### Could-Improve
1. Os 4 estados de erro dizem *"verifique"/"confirme"* mas não têm nenhum controle de retry — só
   recarregar a página manualmente. É consistente com `M3`/`RN-5` (nenhum controle inerte) já que não há
   ação de cliente definida nesta fase, mas vale registrar como candidato de `F2`: um link "recarregar"
   que apenas dispara navegação, sem lógica nova, fecharia a lacuna entre o texto e a ação sem violar
   `RN-5`.
2. `§9.2` não distingue explicitamente o tratamento de foco entre estados (cada estado é um render de
   Server Component novo, não uma transição SPA) — correto por arquitetura (`ADR-028/D1`), mas vale uma
   frase futura confirmando que nenhum JS de foco manual é necessário.

#### Explore
- Se `#e0aaff`/`#581c87` (`--dado-quebrado-ink`) alguma vez precisar aparecer perto destes 4 estados de
  erro (ex.: um erro que também é sinal de dado quebrado), os pares críticos já medidos em
  `DESIGN_SYSTEM.md` §1.3 cobrem a colisão — não é um risco novo, só não foi testado neste contexto.

### Atualização (`2026-09-06`, consolidação de branch — sem reabrir conteúdo)

Este arquivo é a mesma crítica independente aplicada em `2026-09-05` (evidência de fidelidade de fonte,
scores e achados originais preservados acima, não reescritos). O que mudou nesta rodada foi puramente
**estado do repositório**, não design: a branch `tasks/T-01.3-gate-design-f1` tinha divergido entre um
histórico remoto correto (`22b7c12`→`0d27283`, com a reconciliação `§9.1-bis` e o falsificador de §9.3
corrigido) e um checkout de worktree paralelo com *staged changes* não commitadas que revertiam essas
duas correções **e** artefatos de `T-01.1`/`T-01.7` fora do escopo de `T-01.3` — descoberto por auditoria
de `git show`/`git diff --staged`/`git write-tree` contra o histórico conhecido. Esta consolidação
recria a branch a partir de `origin/master` atualizado (`10519e2`, já incluindo `T-01.2`/`T-01.8`),
reaplica **só** o diff de `DESIGN_SYSTEM.md` §9 que o histórico remoto validou (`f8d0ad8`→`0d27283`,
179 linhas, 0 remoções fora do cabeçalho de data) e adiciona este arquivo — que nenhuma rodada anterior
havia commitado, apesar de já existir como avaliação real (ver histórico do worktree que a produziu).
Nenhum texto de forma/microcopy foi alterado por este ato.

### Recomendação
**Nenhum achado é Must-Fix.** A forma e a microcopy dos 8 estados, e o argumento do mecanismo `I-8`,
estão sourced corretamente e não violam a guarda de cor por severidade nem o contrato `data-fact`.
**Should-Fix 1 resolvido nesta consolidação.** **Should-Fix 2 (ratificação do `frontend-architect` sobre
`I-8`) permanece residual explícito, fora do escopo `[web]` desta task** — não bloqueia o `DoD` literal
de `T-01.3`, que este arquivo satisfaz.

---
**Veredito `ux-ui-mastery`: APROVADO COM CONDIÇÃO** — a condição residual (Should-Fix 2) não bloqueia o
conteúdo de design revisado aqui nem o `DoD` machine-checável de `T-01.3`; é um item de acompanhamento
para antes de `T-01.4`/`T-01.5` consumirem `I-8` como decisão fechada. Referenciar por âncora:
`DESIGN_SYSTEM.md` §9 (não duplicar o texto — a seção termina em "Referências", não há `§9.5` nesta
versão consolidada).
