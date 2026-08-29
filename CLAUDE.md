# Convenções deste repositório

## ⛔ Commits — regra determinística, aplicada por hook

1. **Sem trailer de co-autoria.** Nenhum `Co-Authored-By:`, em nenhuma variação de caixa.
2. **Autor e committer são o owner:** `Stharley Maxwell <stharleymax@gmail.com>`.

Declarado pelo owner em 2026-08-25. **Não é convenção — é portão.** O hook
[`scripts/hooks/commit-msg`](scripts/hooks/commit-msg) reprova o commit antes de ele existir, e reprova
igual para humano e para agente. Instale com `bash scripts/install-git-hooks.sh` (idempotente).

O hook checa a identidade com `git var GIT_AUTHOR_IDENT` / `GIT_COMMITTER_IDENT`, não a config — assim
`git commit --author=…` e `GIT_AUTHOR_EMAIL=…` também são pegos.

**`core.hooksPath` é proibido neste repositório.** O `pre-push` é gerado por `harness install-hooks` e
vive em `.git/hooks`; redirecionar `hooksPath` o desligaria **em silêncio**, que é a pior classe de
quebra — o portão para de existir e nada avisa.

## Design — autonomia delegada, com gate de validação

**Declarado pelo owner em 2026-08-25:** *"quero que meus agents nessa questão de design tenha autonomia
… porém n tenho experiência nem habilidades suficientes com ui-ux … o agente tem autonomia de decisão,
**desde que ux-ui-mastery esteja de acordo**"*.

| | |
|---|---|
| **quem decide** | [`ui-designer`](.claude/agents/ui-designer.md) — operador do Stitch, e ele decide de UI/UX **sem pedir permissão** |
| **o gate** | `ux-ui-mastery` (plugin, 19 skills / 10 comandos). **Nenhuma decisão de design vale antes de o validador concordar.** Não é revisão opcional — é a condição da autonomia |
| **por que dois** | agente que gera e aprova o próprio trabalho não tem gate. O ciclo é **gera → critica → itera** |
| **o que muda com a delegação** | a obrigação de prestar contas **aumenta**: argumento, fonte lida com arquivo citado, falsificador, e `[NÃO SEI]` explícito. Quem não pode auditar merece mais rigor, não menos |

O owner intervém **por exceção** — ele pontua o que discordar. Silêncio dele não é aprovação; aprovação
é o veredito do validador.

---

## O ledger é a identidade do estado, não o texto do documento

O pipeline é o `harness`. Um documento marcado "aprovado" **sem o evento `approve` no ledger não está
aprovado**. Antes de acreditar em qualquer estado:

```
harness status                        # dashboard
harness pipeline state <feature>      # o estado corrente
harness pipeline show  <feature>      # o histórico cru, evento a evento
harness doctor                        # a saúde da instalação
```

Gates marcados **owner** (`spec`, `build`, `advance DONE`) **não podem ser feitos por agente.**

## Nenhum número sem o comando que o produziu

Toda afirmação quantitativa carrega o comando, o universo (`n`) e um rótulo de força: `[MEDIDO]` ·
`[DOC]` · `[NÃO MEDIDO]` · `[PREMISSA-OWNER]` · `[INFERRED: motivo]`. **Não é estilo.** Três defeitos
reais deste projeto foram encontrados por essa disciplina, incluindo uma regra anti-lookahead que estava
**invertida** e propagada por dois documentos.

Corolário: **`[PREMISSA-OWNER]` é para citação literal do owner.** Paráfrase vestida de declaração já
produziu defeito aqui — leitura adotada por agente leva rótulo próprio.

## Higiene de contexto — o subagente devolve ponteiro, não relatório

`[MEDIDO 2026-08-29, sessão `b227a990`: 692 turnos do loop principal, 16h, 41 subagentes]` — **62% do
custo foi releitura de contexto**, não geração. Relatório de subagente inlinado: média **9,4KB**, e o
texto integral **já estava em disco**, no `<output-file>` que a própria notificação cita. Um relatório
entregue no turno 300 de 692 é relido **~390 vezes**: o custo de uma linha é o que ela custa vezes os
turnos que faltam.

Vinculante para o loop principal e para todo subagente — R1–R5 em
[`docs/protocolo-de-despacho.md`](docs/protocolo-de-despacho.md):

- **Subagente devolve no máximo 15 linhas** — veredito, números com o comando que os produziu, e o
  caminho do relatório completo em `docs/context/<feature>/gates/`. **NUNCA cole o corpo.**
- **Prompt de despacho: no máximo 20 linhas**, citando caminhos. Contexto longo vai para
  `docs/context/<feature>/handoff/<TASK>.md` **antes** do despacho.
- **NUNCA `cat` nem `sed -n '1,300p'` de arquivo grande no loop principal** — `grep -n` com âncora,
  `--json` com filtro, ou delegue a leitura.
- Todo comando que pode passar de ~50 linhas termina em `| head -N` ou `| tail -N`.

**Nada disto é portão** — é doutrina, e `agents/qa.md` já mediu que prosa sem portão tem 0% de adesão.
Por isso o documento carrega um falsificador que o manda sair se não pagar o que custa.

## Dado bruto não é versionado

`data/` (~850 MB) está no `.gitignore`. É dado de terceiro, re-obtenível, catalogado em
[`data/MANIFEST.md`](data/MANIFEST.md), que traduz os caminhos citados nos documentos para onde o
arquivo está. **O repositório guarda as conclusões e os comandos, não os bytes.**

**Nenhuma chave em documento, nunca.** A key da Coinalyze vive em `.env` (perms 600, gitignored) e os
comandos a referenciam só como `$COINALYZE_API_KEY`.

## Vocabulário fechado de componentes

`sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs` — via
`harness policy --key components`. Alterar o vocabulário é ato do owner, não de agente.

## Registro de artefatos é append-only

[`docs/INDEX.md`](docs/INDEX.md). Acrescente linha; **não reescreva linha existente.**
