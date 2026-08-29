# Handoff para `/build` — `SPEC-002` · Código em inglês

**Feature:** `codigo-em-ingles` · **De:** `/tech-lead` · **Data:** 2026-08-29
**Estado do ledger:** `SPEC_APPROVED` `[MEDIDO 2026-08-29: harness pipeline state codigo-em-ingles]`
**Rev de ancoragem de TODA medição deste handoff:** **`master@7c3599b`** (o plano ancora em `5f4ece0` — ver §2, a diferença move dois números do DoD)
**Artefatos:** [`tasks_review.md`](tasks_review.md) (a narrativa e o racional) · [`tasks.toml`](tasks.toml) (o dado de máquina, **7 tasks, `harness tasks validate` → 0 ERROR / 0 WARN**)

---

## 0. ⛔ O portão que está no caminho, e ele não é meu

**Nada abaixo pode ser implementado ainda.** O estado é `SPEC_APPROVED`; `/build` exige `BUILD_AUTHORIZED`, e o caminho é:

```
harness pipeline approve  codigo-em-ingles tasks  "<motivo>"    # depois da narrativa aprovada
harness pipeline advance  codigo-em-ingles TASKS_APPROVED
harness pipeline approve  codigo-em-ingles build  "<motivo>"    # ⛔ OWNER — não há rota que o evite
harness pipeline advance  codigo-em-ingles BUILD_AUTHORIZED
```

**`advance codigo-em-ingles TASKS_APPROVED` exige o `tasks.toml` válido.** Ele está: `harness tasks validate codigo-em-ingles` → **`OK: 7 task(s), 0 ERROR, 0 WARN`** `[MEDIDO 2026-08-29]`.

---

## 1. Tracker — **zero card criado**, e a marcação diz exatamente isso

`harness policy --key tracker` → `{"kind": "jira", "project": "CST", "board_id": "36", "parent_kind": "Epic", "child_kind": "Tarefa"}` `[MEDIDO 2026-08-29]`. **O tracker existe e está configurado.** Nenhum card foi criado por **instrução explícita do coordenador**: ele carda depois de o owner aprovar o `build`.

As 7 tasks saem **sem `tracker` e sem `local_only`** — e a escolha é deliberada, porque `local_only = true` significa *"o owner decidiu não cardar, nunca"*, e a decisão aqui é *"cardar depois"*. **Um marcador que colapse "decidi" e "vou fazer depois" faz o segundo nunca chamar atenção.** A ferramenta já separa os dois eixos:

```
$ harness tasks list codigo-em-ingles | tail -1
total=7  linked=0  local=0  uncarded=7
```

`[MEDIDO 2026-08-29]` — **`uncarded=7`, `local=0`.** É o sinal âmbar consciente, e é recuperável por comando.

### O que deveria ser cardado, quando o coordenador cardar

**1 Epic + 7 `Tarefa` em `CST`**, com os títulos exatos do `tasks.toml`:

| id | componentes | título |
|---|---|---|
| — | — | **Epic:** `codigo-em-ingles` — Código em inglês: convenção, fronteira e retroativo |
| `T-01.1` | `docs` | `[docs] 01 · A secao normativa no CLAUDE.md — a tabela de fronteira de 12 linhas, a excecao literal do vocabulario e o gatilho de reabertura` |
| `T-01.2` | `docs` | `[docs] 01 · O ponteiro no README.md, SEM copia, e a linha nova em docs/INDEX.md` |
| `T-01.3` | `docs` | `[docs] 01 · A divida de status: SPEC-002 e o index.md do plano dizem DRAFT e o ledger diz SPEC_APPROVED` |
| `T-02.1` | `docs`, `sentimento` | `[docs][sentimento] 02 · Os 2 arquivos, os 40 identificadores e as 3 citacoes VIVAS, atomico e com a linha de base intacta` |
| `T-03.1` | `docs`, `web` | `[docs][web] 03 · 4 arquivos + 1 diretorio, as citacoes VIVAS atomicas e a prova de dois lados re-executada DEPOIS` |
| `T-04.1` | `docs` | `[docs] 04 · As tres superficies de contrato ganham dono no CLAUDE.md — evento de log, coluna de contrato e segmento de URL` |
| `T-04.2` | `docs` | `[docs] 04 · A pergunta FACTUAL ao owner sobre consumidor externo dos 4 eventos de log` |

**Depois de cardar:** acrescentar `tracker = { provider = "jira", id = "CST-NN", url = "https://conversationhub.atlassian.net/browse/CST-NN" }` em cada task, **na forma inline** — uma sub-tabela `[tasks.tracker]` engole as chaves seguintes em silêncio, e o validador só a sinaliza como `WARN` (`V-27`).

---

## 2. ⚠️ O que o builder tem de saber ANTES de abrir o plano

O plano é excelente e denso, e **quatro coisas nele envelheceram ou estão erradas**. Cada uma reprovaria um builder correto ou aprovaria um errado.

### 2.1 Os números de MORDE do DoD **derivaram**, e não é erro do plano — é `[G-A1]` acontecendo

| token | plano (`5f4ece0`) | **hoje (`7c3599b`)** |
|---|---|---|
| `Filtro.tsx` | 8 | **12** |
| `painel/` | 17 | **19** |
| os outros 10 | — | **inalterados** |

`[MEDIDO 2026-08-29, n=12 tokens × 2 revs]` · Causa **única**: `docs/context/codigo-em-ingles/handoff_to_architect.md` — o handoff **desta própria feature**. `git diff --stat 5f4ece0..HEAD -- backend frontend` → **vazio**. **Zero linha de código mudou.** E vai subir de novo: `tasks.toml`, `tasks_review.md` e **este arquivo** citam os dois tokens.

> **⇒ O DoD NÃO congela o `n`.** Meça no seu rev, declare `n > 0` por token **antes** do rename, exija **`0` depois**. Os números do plano são **piso de sanidade**: medir *menos* que 8 significa que alguém já mexeu nas âncoras.

### 2.2 A unidade é **linhas**, não ocorrências

`ADR-015/D2` rotula a coluna como *"n de ocorrências"* e publica valores de **linhas**. `ROTAS` = **2 linhas / 3 ocorrências** (`rotas.ts:18` o cita duas vezes na mesma linha). **Use `git grep -c` / `wc -l` sobre linhas** — é o que a tabela publicada já é.

### 2.3 `backend/README.md` é tocado pelas **duas** fases retroativas

O `index.md` diz *"zero arquivo em comum"*. **É falso, e o próprio plano o enumera nas duas listas VIVAS:** `:568 :569 :717 :743 :815` na fase `02`, `:455 :457` na fase `03`. **Compartilhamento de arquivo, não de linha** (~110 linhas de distância) ⇒ **o paralelismo continua seguro**, o merge resolve, e a segunda fase a mergear rebaseia. **Ver `backend/README.md` no seu diff é esperado.**

### 2.4 O shell é `zsh`, e ele **não faz word-splitting**

```
$ VIVO="harness.toml README.md backend/src ..." ; git grep -o -F 'Filtro.tsx' -- $VIVO | wc -l
0        # ← "não mediu", vestido de rc=0 e de "nenhuma âncora sobrou"
```

**Passe os prefixos literais.** Nenhum DoD do `tasks.toml` usa variável de shell para lista de caminho.

---

## 3. A linha de base congelada — a sua âncora de "não quebrei nada"

**Conferida por mim em `7c3599b`, e ela é IDÊNTICA à que o `/architect` congelou em `5f4ece0`:**

```
$ make test
107 passed
TOTAL   370 statements   0 miss   54 branch   0 partial   100%
[OK] domain 100.0% [124/124] · [OK] use_cases 100.0% [52/52] · [OK] infra 100.0% [194/194]
$ make lint                                    # rc=0
$ harness rules list --severity block          # 7 regras
$ harness rules --mode sweep                   # 1 [AVISO], 0 [BLOQUEIO], rc=0
```

`[MEDIDO 2026-08-29 em 7c3599b, worktree com .venv após make setup]`

> **Toda task retroativa termina com estes números IDÊNTICOS. Divergência reprova, INCLUSIVE PARA MAIS** — se a suíte passar com número diferente de statements, a renomeação virou reescrita e ninguém viu, e **o número que denuncia é o `370`, não o `107`**.
>
> ⚠️ **Sem `.venv`, `make lint`/`test`/`boundaries` recusam com `rc=3` = "NÃO MEDIU", que não é "passou".** Um DoD satisfeito com `rc=3` é falso-verde. Rode `make setup` primeiro.

---

## 4. ⛔ O escopo de caminhos **não foi declarado**, e há um motivo em cada metade

```
$ harness pipeline scope codigo-em-ingles list      # 0 byte, rc=0. NENHUM prefixo.
```

**Metade 1 — o comando grava no ledger.** `scripts/pipeline.sh:755` faz `append(feature, {"event": "scope", "op": "add", "actor": "owner", ...})`. O coordenador proibiu mexer no ledger, e o evento sairia **assinado como se fosse do owner**. Não executei.

**Metade 2 — declarar os prefixos "certos" armaria uma colisão.** **9 dos 12 caminhos desta feature já são reivindicados por `plataforma-dados`**, que está em `BUILD_AUTHORIZED`. Colisão é *">1 feature **autorizada** reivindica o path"* (`pipeline.sh:1036-1050`), e `authorized_features()` é `>= BUILD_AUTHORIZED` (`:512-522`) ⇒ um escopo declarado agora é **inerte**, e **acorda no instante do `approve build`**, bloqueando os três builders de `plataforma-dados` que rodam hoje.

**Os 4 prefixos LIVRES, prontos e sem colisão:**

```
harness pipeline scope codigo-em-ingles add CLAUDE.md backend/tests \
                                            docs/INDEX.md docs/context/codigo-em-ingles
```

**Os 9 disputados são decisão do owner** — as três saídas com o custo de cada uma estão em [`tasks_review.md`](tasks_review.md) §4. **Recomendação com rótulo: `(a) não declarar` agora, `(c) override scoped` se e quando um builder for barrado** `[INFERRED: (b) estreitar plataforma-dados mexe numa feature com 3 builders em voo; (a) não muda nada do comportamento de hoje e mantém a decisão reversível]`.

**Enquanto isso, o portão devolve verde pela feature errada** — `require-code frontend/src/.../Filtro.tsx` → *"código permitido — feature `plataforma-dados` (scope)"*. **Nada trava. Mas a autorização está atribuída à trilha errada, e ninguém é avisado.**

---

## 5. A ordem de execução, e o que paraleliza

```
T-01.1 ──┬──> T-01.2 ──┬──> T-02.1   [docs][sentimento]  ┐
         │             │                                  ├─ paralelas, worktrees separados
         │             └──> T-03.1   [docs][web]         ┘
         └──> T-04.1   [docs]
T-01.3   (independente — dívida de documento, não de fronteira)
T-04.2   (independente — a pergunta ao owner)
```

**`01` primeiro, e não é cerimônia:** renomear antes de a fronteira estar declarada é renomear **duas vezes**, e a segunda renomeação atinge um alvo que a primeira já moveu (`ADR-013/D1`).

**`02`, `03` e `04` paralelizam** — componentes diferentes, diretórios de código disjuntos, com a ressalva de §2.3.

---

## 6. As três regras que reprovam sem apelação, e que ninguém lembra sozinho

1. **`docs/INDEX.md` é append-only por `CLAUDE.md`.** Acrescente linha; **não reescreva linha existente.** *"Atualize todas as citações"* produz a violação que `RN-2` existe para evitar — as citações se dividem em **VIVAS** (receita executável, atualiza) e **HISTÓRICAS** (decisão datada, não se reescreve), e as duas listas estão **enumeradas por token** em `SPEC-002` §4.2 e copiadas nos `refs` de `T-02.1` e `T-03.1`.
2. **Nenhuma `[[rules.own]]` de idioma, nenhum alvo de `make` de idioma, nenhuma allowlist de idioma.** `ADR-011/D1.10`: declarar uma **REPROVA A FASE**. A `ADR-013/D2` construiu três detectores e recusou os três — o melhor dá **7 falsos positivos** no corpus de retenção, um deles `oi` (*open interest*) com **286 ocorrências em 23 arquivos**, e **a propriedade que faz o detector morder — token curto — é a que o impede de calar.**
3. **`harness code-paths classify` é CEGO à existência do arquivo.** Ele devolve `producao`/`rc=0` para caminho inexistente `[MEDIDO 2026-08-29, n=3]`. **E o passo (2) de `RN-5` NÃO é rede do passo (1)** — quem pula o `test -f` confiando no `classify` **não está coberto**. É por isso que `CA-F3-6` tem três lados e o segundo (`test -f` nos caminhos **antigos** → `rc=1`) é o que pega o rename para o lugar errado.

**E a armadilha concreta da fase `03`, que vale repetir:** `harness.toml:149` é a metade **`cala`** de uma prova de dois lados — a prova que fez o ESLint (AST) substituir duas `[[rules.own]]` de TS. **Renomear sem consertar a citação no mesmo commit converte a prova em `rc=0` por caminho inexistente: conformidade falsa.** E o texto JSX `"Filtro: any resultado serve"` **não se traduz** — o `any` ali dentro **é o payload da prova**.

---

## 7. Sem commit de agente com co-autoria

**Nenhum `Co-Authored-By:`**, em nenhuma variação de caixa. Autor **e** committer: `Stharley Maxwell <stharleymax@gmail.com>`. **`core.hooksPath` é proibido neste repositório.** O hook `scripts/hooks/commit-msg` reprova antes de o commit existir; instale com `bash scripts/install-git-hooks.sh` (idempotente).

---

## 8. Próximo passo

**`/build`, uma fase por vez, depois de `approve build` (owner).** Comece por `01` — ela é a única que não paraleliza, e é a peça de que as duas retroativas dependem.
