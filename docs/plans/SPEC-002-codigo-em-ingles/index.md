# Plano de execução — `SPEC-002` · Código em inglês

**SPEC:** [`SPEC-002`](../../specs/SPEC-002-codigo-em-ingles.md) (`DRAFT` — `SPEC_APPROVED` é gate **do owner**)
**ADRs:** [`ADR-013`](../../adr/ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md) (`aceito`, usada) · [`ADR-015`](../../adr/ADR-015-token-tipado-no-verificador-de-ancora-e-o-criterio-de-citacao-viva.md) (`proposto`, nasce com esta SPEC)
**Rev de ancoragem de TODA medição:** **`master@5f4ece0`**
**Data:** 2026-08-29

---

## As quatro fases, a ordem e o motivo dela

| fase | entrega | componente | classe | depende de | pode paralelizar com |
|---|---|---|---|---|---|
| [`01`](01_convencao_escrita.md) | **A convenção escrita, localizável e citável** — `CLAUDE.md` normativo + ponteiro no `README` | `docs` | **prospectivo** | — | — |
| [`02`](02_retroativo_backend_tests.md) | **`backend/tests`** — 2 arquivos, 40 identificadores, 0 mudança de comportamento | `sentimento` | **retroativo** | `01` | `03` |
| [`03`](03_retroativo_frontend.md) | **`frontend/src`** — 4 arquivos + 1 diretório, com a prova de dois lados re-executada **depois** | `web` | **retroativo** | `01` | `02` |
| [`04`](04_superficies_de_contrato.md) | **Superfícies de contrato e de consulta** — decisão escrita, **zero código** | `docs` | **fronteira** | `01` | `02`, `03` |

**Por que `01` primeiro, e não é cerimônia:** renomear antes de a fronteira estar declarada significa renomear **duas vezes**, e a segunda renomeação atinge um alvo que a primeira já moveu (`ADR-013/D1`). E há evidência de que `01` é a peça que falta, não uma nota: `T-02.3` e `T-02.4a` criaram **9 arquivos novos, 9 de 9 em inglês**, porque a regra entrou no prompt dos builders — **sem portão, sem regra, sem detector** `[MEDIDO 2026-08-29 em 7af0e4f]`. **E o contra-exemplo é do mesmo dia:** os 4 eventos de log em português nasceram nos mesmos commits, numa superfície que **ninguém tinha nomeado**. ⇒ **doutrina resolve o que ela alcança; a superfície que ela não nomeia, ela não alcança.** `01` é a diferença entre essas duas colunas.

**Por que `02` e `03` em paralelo:** os diffs são **disjuntos** — componentes diferentes (`sentimento` × `web`), diretórios diferentes (`backend/tests` × `frontend/src`), zero arquivo em comum. Worktrees paralelos são seguros. **A única interseção é `docs/context/plataforma-dados/tasks.toml`**, citado pelos dois: `02` toca a linha de `formatar-percentual.ts`? **Não** — `02` não toca `tasks.toml`; `03` sim. Sem colisão `[MEDIDO 2026-08-29]`.

**Por que `02` e `03` não se fragmentam mais:** 2 + 4 arquivos, 49 identificadores, diff revisável por inteiro. **Fragmentar multiplica o risco de rename não-atômico, que é o único risco real desta feature** (`RN-1`: um caminho renomeado cujo comando documentado não foi atualizado devolve `rc=0` e 0 byte — indistinguível de *"avaliado e limpo"*).

---

## As regras que valem em TODAS as fases

**`RN-1` · Renomear é ATÔMICO com as citações vivas, no mesmo commit.**
**`RN-2` · Citação HISTÓRICA não se atualiza.** `docs/INDEX.md` é **append-only por `CLAUDE.md`**; ADR e plano são decisões **datadas**. A enumeração viva/histórica é normativa e está em `SPEC-002` §4.2 — **é para copiar para a task, não para resumir.** *"Atualize todas as citações"* produz a violação que a regra evita.
**`RN-3` · Renomear o continente é permitido; traduzir o conteúdo citado, não.** A lista fechada de evidência está em `PRD-002` §5.3.
**`RN-4` · Nenhuma `[[rules.own]]` de idioma, nenhum alvo de `make` de idioma, nenhuma allowlist de idioma.** `ADR-011/D1.10`: declarar uma **REPROVA a fase**.
**`RN-5` · Todo `rc` de `harness rules --mode file` vem precedido de `test -f` e de `harness code-paths classify`, nesta ordem** — ou usa `--mode sweep`, imune aos três (`ADR-012/D4`). **⚠️ E `SPEC-002` §0.4 mediu que o passo (2) NÃO é rede do passo (1):** `classify` devolve `producao`/`rc=0` para caminho **inexistente**. Quem pula o `test -f` não está coberto.
**`RN-6` · Todo critério congela o REV junto com a lista.** `backend/src` foi de 23 para 77 declarações em um dia.
**`RN-7` · Nenhuma renomeação atravessa a fronteira do vocabulário de componentes.** `sentimento` e tudo que dele deriva ficam — `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]`.
**`RN-8` (nova, de `ADR-015/D2`) · O verificador de âncora é medido POR TOKEN, nos dois lados.** O DoD declara o `n` do lado MORDE antes de renomear e exige `0` por token depois. **Um token com MORDE `n=0` reprova a fase no ato da declaração** — ele contribui `rc=0` em silêncio e é indistinguível de um token que passou.

---

## O que reprova qualquer fase, sem apelação

1. **`rc=3` tratado como verde.** Sem `.venv`, `make lint`/`test`/`boundaries` recusam com `rc=3` = **"não mediu"**, que não é "passou".
2. **Um `rc` de `harness rules --mode file` citado sem o `test -f` que o precede** (`RN-5`).
3. **Uma linha existente de `docs/INDEX.md` reescrita** (`CLAUDE.md`, append-only).
4. **Uma `[[rules.own]]` de idioma declarada** (`ADR-011/D1.10`).
5. **Um número afirmado sem o comando, o universo (`n`) e o rótulo** (`[MEDIDO]` · `[DOC]` · `[NÃO MEDIDO]` · `[PREMISSA-OWNER]` · `[INFERRED: motivo]`). **`[PREMISSA-OWNER]` é exclusivamente citação literal do owner.**
6. **`Co-Authored-By:` em qualquer commit**, ou autor/committer diferente de `Stharley Maxwell <stharleymax@gmail.com>`. **`core.hooksPath` é proibido.**

---

## Gate do pipeline — quem pode o quê

```
harness pipeline approve  codigo-em-ingles prd   "gap analysis ok"     # coordenador
harness pipeline advance  codigo-em-ingles PRD_VALIDATED               # coordenador
harness pipeline advance  codigo-em-ingles SPEC_DRAFT                  # coordenador
harness pipeline approve  codigo-em-ingles spec  "…"                   # ⛔ OWNER
harness pipeline approve  codigo-em-ingles build "…"                   # ⛔ OWNER
```

**A SPEC nasce `DRAFT`.** Um documento que diga "Status: APPROVED" sem o evento no ledger **não está aprovado** — é violação, não atalho. **Não há rota que evite os dois gates de owner**, e o owner aceitou explicitamente que eles ficam no caminho `[DECISÃO-OWNER: 2026-08-29]`.
