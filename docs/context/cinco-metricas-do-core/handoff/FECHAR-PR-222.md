# Handoff — fechar a PR #222 (painel de open interest, `T-03.5`/`T-03.6`)

`[PREMISSA-OWNER: 2026-09-13]` — *"vamos fechar os trabalhos atuais q estãso com pr abertos.
Então vamos continuar até fechar todas pr em aberto"*.

## Onde ela está

- Branch: `feat/t-03-5-t-03-6-painel-open-interest`, cabeça `c910483`.
- **25 commits atrás da master, 2 à frente.** `git merge-tree` acusa **≥1 região de conflito**
  `[MEDIDO 2026-09-13]` — quase certamente `docs/INDEX.md`, que é **append-only**: resolva por
  **união em ordem cronológica**, nunca escolhendo um lado. Master em `7b7fd20`.
- Escopo: 11 arquivos, `1.921+/30−`. Produção: `SymbolClient.tsx`, `page.tsx`, `panel-status.ts`.

## O gate que JÁ está fechado — não o refaça

**QA `APPROVED`**, gravado por mim no ledger (`harness gate-record … 03 QA APPROVED`). Relatório
em `docs/context/cinco-metricas-do-core/gates/T-03.5-T-03.6-qa-remedicao.md` (commit `c910483`,
publicado no branch). O que ele mediu: `DoD-3` fecha com `N=32 ≥ 30` **barras nativas** no DOM
(era `N=2`); `DOM == API` em `32==32` nativas e `164==164` degraus; o controle foi **previsto
antes da rodada** pelo SQL (`2` da ilha de `13:30:32Z` + `30` de `23:45Z`→`02:10Z` = `32`) e
bateu exato; MORDE replantado dá `rc=1`.

## O que FALTA, e é só isto

Por [[pr-por-wave-e-autonomia-de-merge]], o merge sem o owner exige **QA + code-review +
design-review**. Faltam os dois últimos:

1. **code-review** — `harness-plugin:reviewer`, read-only, cita o identificador da regra violada.
2. **design-review** — `panel-status.ts` mudou, e é a superfície de `RNF-2` (*o painel não exibe
   dado mais velho que a periodicidade sem DIZER que é velho*). Quem decide é o `ui-designer`;
   **quem aprova é o `ux-ui-mastery`** — a autonomia de design é condicionada ao gate.
   ⛔ **NUNCA Figma, em nenhuma hipótese** — o design deste repo é no Stitch.

Aprovados os dois: `make verify` (8 portões) e **merge**. Grave o `gate-record` de REVIEW.

## O que NÃO é bloqueio — declarado para não ser redescoberto

- ⛔ **`E1` não está resolvido**: o horizonte legível é `32/1152` = **2,8%** da janela. Dono é
  `T-03.7`/`D15`-`D16`, **fora desta PR**. Não a reprove por isso.
- Os **2 WARNING** do QA não bloqueiam: a frase `available_at <= bucket_end` do builder é o número
  certo com explicação torta (a causa é o teto de carry de `600 s`), e há um flake estreito no
  invariante `DOM == API`.

## Regras que reprovam o trabalho se violadas

- Commit **sem** `Co-Authored-By` em qualquer caixa; autor e committer são o owner.
- `docs/INDEX.md` é **append-only** — acrescente linha, nunca reescreva.
- **Nada de deploy.** Postgres **somente leitura**; nunca semeie dado sintético no compartilhado.
- Todo número com o comando, o universo (`n`) e o rótulo de força.
- Passando de ~150 turnos, escreva o estado aqui e devolva. **Devolva no máximo 15 linhas.**
- **Commite antes de devolver** — seu relatório é insumo do próximo, e ele nasce em worktree.
