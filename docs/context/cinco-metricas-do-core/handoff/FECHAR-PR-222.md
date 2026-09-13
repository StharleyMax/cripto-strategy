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

---

## Estado em 2026-09-13T15:35Z — a PR NÃO foi mergeada, e o motivo é novo

`[MEDIDO 2026-09-13, sessão de fechamento da #222]`

**Feito:**
- Merge de `origin/master` (`3db99bd`, não mais `7b7fd20`) publicado: cabeça da PR em `717bd45`,
  `mergeStateStatus` saiu de `CONFLICTING`. Conflito único em `docs/INDEX.md`, resolvido por
  **união cronológica** — 10 entradas, `git diff origin/master -- docs/INDEX.md | grep -c '^-[^-]'`
  = **0 linhas removidas**.
- **code-review `COMPLIANT`** — `0/8` regras bloqueantes violadas sobre `11/11` arquivos.
  `gates/T-03.5-T-03.6-code-review.md`, commit `75c0aea`.
- **design-review `NEEDS_FIX`** (era `APPROVED` na 1ª rodada; adendo appendado, `0f16d0f` intacto).
  `gates/T-03.5-T-03.6-design-review.md`, commit `717bd45`.
- Ledger: `harness gate-record cinco-metricas-do-core 03 REVIEW NEEDS_FIX`, gravado.

**Por que não mergeou — e NÃO é o `E1` nem os 2 WARNING que este handoff isentou.** É o `W-4`,
achado pelo code-review e adjudicado pelo design gate (só ele julga `RNF-2`; `RNF-2` não é
`[[rules.own]]`, então o code-review estruturalmente não podia reprová-lo):

`ageMs` é medido contra `windowEndMsInclusive`, que **trilha o relógio em `360.000–600.000 ms`**
`[MEDIDO n=1440 com o resolveRouteWindow real: min=360000 max=600000 mean=480000]`, contra um teto
de `600.000 ms`. Logo o painel imprime **`fresh` até 20 min (4,0× a periodicidade de 5 min) no pior
caso e 16 min (3,2×) no MELHOR** ⇒ **não existe leitura de relógio em que `stale` dispare na faixa
que `RNF-2` nomeia**. O aviso está correto, legível e **inalcançável** — é um `CALA` vacuoso na tela,
a mesma classe de defeito que `ADR-012` nomeia para o `rc=0`.

**Os 2 bloqueios, e qualquer um deles sem o outro NÃO libera o merge:**
1. **`A-4.1`** — nomear o referencial na frase (*"há N em relação ao fecho da janela (HH:MM UTC)"*)
   e declarar o termo de 6–10 min na docstring. **Test-safe**: o validador mediu que a correção
   passa em `L138`/`L139`/`fact`.
2. **`A-4.2`** — decisão **ESCRITA** do limiar: (i) orçar a geometria, (ii) subir
   `_MAX_STALENESS_MS` e **dizer** que é 4×, ou (iii) adiar com dono e data. **Dono: `/architect`
   + `quant-architect`.** Bloqueia a **ausência** de decisão, não a escolha — qualquer uma serve.

⛔ **A correção óbvia está VETADA:** trocar o referencial por `Date.now()` viola
`STITCH_CONTEXT.md:1773-1776` (proíbe o relógio de parede em caixa alta) e, com replay as-of, faria
**todo histórico** imprimir `stale`. Medir contra o fecho da janela está **certo** — o defeito é que
o referencial é **secreto** e um teto autorado como **orçamento de relógio** é comparado contra uma
idade que **não é de relógio**. É erro de **unidade**, não de constante.

**Não-bloqueio, mas registrado:** `W-3` — a guarda de `oi-pane-dom-contract.test.ts:138-139` protege
o **texto, não o requisito** (`2/2` asserts quebram se a microcopy for reescrita; o `data-fact`
sobrevive às 3 versões). Adote a opção **(a)** (afrouxar para estrutura); a (b) foi rejeitada porque
declara imutável uma microcopy que não é do builder.

**Armadilha de ambiente desta worktree, para o próximo não repetir:** `data/` é gitignored e **não
existe na worktree** ⇒ `make verify` devolve `test-frontend rc=3 NÃO MEDIU` (que **também recusa** o
push). O conserto é `ln -s <checkout principal>/data data`. E o disco raiz encheu (`100%`, 178M
livres) durante o `make setup`; liberado com `uv cache clean` + `npm cache clean --force` → **6,8G**.
