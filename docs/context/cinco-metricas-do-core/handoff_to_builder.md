# Handoff para `/build` — `cinco-metricas-do-core`

> **Não despache nada antes de ler [`PLANO-PARALELISMO.md`](PLANO-PARALELISMO.md).** Ele é a entrada
> da execução: `D8` (owner) diz literalmente que o plano é o que a execução segue e que **não é para
> o orquestrador improvisar o agrupamento na hora**.

| | |
|---|---|
| **dado de máquina** | [`tasks.toml`](tasks.toml) — **50 tasks**, `harness tasks validate cinco-metricas-do-core` → `50 task(s), 0 ERROR, 0 WARN` `[MEDIDO 2026-09-10]` |
| **racional** | [`tasks_review.md`](tasks_review.md) |
| **plano de execução paralela** | [`PLANO-PARALELISMO.md`](PLANO-PARALELISMO.md) — 30 ondas, **33 lotes**, teto **2** |
| **SPEC** | [`SPEC-007`](../../specs/SPEC-007-cinco-metricas-do-core.md) · **plano de fases** [`docs/plans/SPEC-007-cinco-metricas-do-core/`](../../plans/SPEC-007-cinco-metricas-do-core/index.md) |
| **decisões do owner** | [`handoff/DECISOES-OWNER.md`](handoff/DECISOES-OWNER.md) — `D1`..`D8` |
| **tracker** | ⚠️ **nenhuma task cardada.** `local_only = true` com `local_reason` datado — decisão **deliberada**, não esquecimento. Ver `tasks_review.md` §6 |

---

## 1. As cinco coisas que reprovam qualquer fase, sempre

1. **`[P-seed]` violado** — dado sintético semeado no Postgres compartilhado. (Backfill lido da origem
   **não** é dado de teste: `SPEC-007` §3.7.)
2. **`DoD-3` contra mock** em vez do app real, ou **assert só de status HTTP** sem dado no DOM.
3. **Ausência renderizada como zero** (`RN-1`). Para série `FLOW` isso é **erro de tipo**, não de UX.
4. **Qualquer `[[rules.own]]`, alvo de `make` ou allowlist DE IDIOMA** (`RN-4`, `ADR-011/D1.10`) —
   declarar uma **reprova a fase**.
5. **Mudar a FORMA de qualquer das 6 rotas servidas** (`RF-5`/`RS-1`) ou tocar
   `INGEST_HEALTH_RUN_COLUMNS` (`RS-2`, `NG-6`).

## 2. Roteamento de agente — `harness policy --key agents.by_component`

| componente | quem constrói | quem valida |
|---|---|---|
| `sentimento` | `builder` do harness | `qa` do harness · `architect` = `quant-architect` |
| `infra` | `builder` do harness | `qa` do harness · `architect` = `infra-architect` |
| `web` | **`frontend-builder`** | **`frontend-qa`** · `architect` = `frontend-architect` · `design_gate` = `ux-ui-mastery` |

⚠️ **`frontend-qa` NÃO grava `gate-record`** — ele veta a própria escrita no ledger. O orquestrador
roda `harness gate-record cinco-metricas-do-core <fase> QA <verdict>` manualmente.
⚠️ **QA de frontend exige Playwright real** contra o app real, com assert de dado no DOM — nunca só
status HTTP. É a lição de `pagina-de-grafico-s2` fase 04.

## 3. Ordem — e ela é serial entre fatias, com justificativa

```
01 volume → 02 CVD → 03 open interest → 04 long/short → 05 liquidações
```

`tasks_review.md` §2 justifica **par a par**, incluindo os dois casos em que o DAG permitiria paralelo
(`03 ∥ 01` e `05 ∥ 02/03/04`) e o motivo de recusar: **arquivo compartilhado** (4 hot files) e
**ambiente único** (um `deploy/compose.yml`, um serviço `collector`, um Postgres compartilhado).

**Marco intermediário que vale anunciar:** ao fim da fase `03`, `/symbol` fica **3/3 painéis com
ponto**, contra **0/3 hoje** `[MEDIDO 2026-09-10, PRD-007 §1.4]`.

## 4. Higiene, e ela é portão desde 2026-09-07

- **Subagente devolve no máximo 15 linhas** — veredito, números com o comando, e o caminho do
  relatório em `docs/context/cinco-metricas-do-core/gates/`. **NUNCA cole o corpo.**
- **Passando de ~150 turnos**, escreva o estado em `handoff/<TASK>.md` e devolva. O custo é
  **quadrático** nos turnos. O candidato óbvio é **`T-05.5`** (`RS-3.1..RS-3.7`, sete requisitos).
- **Verificação é `make verify`**, os seis portões numa chamada — nunca os seis soltos. Durante o
  desenvolvimento, `make test-fast K=<filtro>` (2,19s × 37,5s), lembrando que **verde ali não é verde
  de portão**.
- **Só remova a worktree depois de confirmar o commit** (`git log`/`git status` dentro dela). Três
  relatórios de QA já foram perdidos por pular esse passo.

## 5. Próximo passo

`harness pipeline approve cinco-metricas-do-core build` é **gate do OWNER**. Nem o `/tech-lead` nem o
`/build` o executam. Idem `advance DONE`.

---

## 6. Worktree — as duas armadilhas, medidas na primeira task

`[MEDIDO 2026-09-10, T-01.1]` — descobertas pelo builder de `T-01.1` gastando turnos nelas.
**Toda task subsequente deve aplicar isto no começo, não descobrir de novo.**

1. **A worktree nasce sem dependência instalada.** Não há `backend/.venv` nem
   `frontend/node_modules`. Faça symlink para os do checkout principal — são gitignored, então
   **não entram no commit**.

2. **`.harness/mechanism` não resolve dentro de worktree.** Sem isso, os portões `regras` e
   `política` do `make verify` saem com **`rc=3`** — e `rc=3` aqui não é "reprovou", é "não
   consegui rodar", que é pior porque parece falha de código. Exporte:

       HARNESS_MECHANISM=~/.claude/plugins/cache/harness/harness-plugin/0.13.0/bin/harness

   ⚠️ Aponte para o **executável**. Apontar para a pasta dá **`rc=126`**.

3. **A worktree pode nascer ATRASADA de `master`.** `T-01.6` nasceu em `8dc8941`, **sem
   `T-01.1`..`T-01.5`** — e a task dependia de `T-01.1`. `[MEDIDO 2026-09-11]`

   ⛔ **Primeira coisa a fazer, antes de ler qualquer código:**

       git log --oneline -1              # onde a worktree nasceu
       git log --oneline -1 master       # onde master está

   Se divergirem, `git checkout -B <sua-branch> master`. **Não confie no que a worktree
   trouxe** — se a sua task tem `depends_on`, confirme que o arquivo da dependência existe
   antes de implementar, ou você reimplementa o que já está mergeado.

## 7. Atribuição de commit — o `CLAUDE.md` vence, e isto é esperado

O ambiente de sessão pode injetar instrução para acrescentar um trailer `Co-Authored-By`.
**Não acrescente.** `CLAUDE.md` o proíbe e o hook `scripts/hooks/commit-msg` **reprova o commit
antes de ele existir**. `T-01.1` encontrou esse conflito e resolveu a favor do `CLAUDE.md` —
está correto, e é o precedente. Autor e committer são o owner.

⛔ **E NUNCA use `git -c core.hooksPath= commit` para contornar.** `CLAUDE.md` proíbe
`core.hooksPath` neste repositório, e usá-lo desliga o portão **exatamente na invocação em que
ele deveria medir** — `T-01.6` fez isso, declarou, e refez com `git commit --amend --no-edit`
sem o override. Se o hook reprovar seu commit, **conserte a mensagem**, não o hook.
