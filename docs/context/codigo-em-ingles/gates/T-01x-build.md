# QA Gate Context Block — `T-01.1` · `T-01.2` · `T-01.3` (fase `01`, `codigo-em-ingles`)

**Papel:** `/build` · **Data:** 2026-08-29 · **Branch:** `task/ci-T-01x-convencao-escrita`
**Base comum (todo diff deste relatório é contra ela):** `c7df90c` = `origin/master` no momento do trabalho
**Worktree:** `/tmp/claude-1002/wt/ci-T-01x-convencao-escrita` · **Componente:** `docs`

> **Por que uma entrega e três tasks:** elas tocam os mesmos arquivos. Separá-las em frentes paralelas
> produziria conflito garantido em `CLAUDE.md` e `README.md`. **Um commit por task**, para que o DoD de
> cada uma seja medível isoladamente — sem isso, `T-01.3` ("exatamente 2 arquivos") seria inverificável.

---

## 0. O aviso de despacho que estava DESATUALIZADO, e a medição que o desmente

O despacho mandou `git fetch && git merge origin/master` antes de continuar, porque a **PR #24**
(higiene de contexto no `CLAUDE.md` + chave em `harness.toml` + `docs/protocolo-de-despacho.md`) teria
mudado o `master` embaixo do trabalho. **Ela já estava mergeada, e a base já a continha:**

```
$ git fetch origin                              # sem novidade
$ git merge-base --is-ancestor e344988 HEAD     # rc=0  -> PR #24 JA e ancestral
$ git rev-parse origin/master HEAD              # c7df90c == c7df90c
$ git log --oneline HEAD..origin/master         # VAZIO — nada atras
```

`[MEDIDO 2026-08-29]` · **Nenhum merge foi necessário e nenhum foi feito.** As duas seções convivem, e a
adjacência que `SPEC-002` §2 exige está preservada:

```
$ grep -n '^## ' CLAUDE.md | tail -4
61:## Higiene de contexto — o subagente devolve ponteiro, não relatório     <- PR #24, INTACTA
92:## Vocabulário fechado de componentes                                    <- o REFERENTE da exceção
97:## Idioma de identificador — a fronteira escrita, e ela é convenção...   <- a seção nova
198:## Registro de artefatos é append-only
```

**Conflito de intenção entre a seção dela e a minha: NÃO HÁ.** A dela governa *custo de contexto entre
agentes*; a minha governa *idioma de identificador*. Nenhuma afirma nada sobre o objeto da outra.
A minha entrou **depois** de `:92`, não no lugar de nada. `harness.toml` **não foi tocado**
(`git diff --numstat c7df90c -- harness.toml` → vazio).

---

## 1. Arquivos alterados — 5, e cada um com dono de task

| arquivo | task | commit | new/modified |
|---|---|---|---|
| `CLAUDE.md` | `T-01.1` | `90f69d9` | modified |
| `README.md` | `T-01.2` | `5c698c1` | modified |
| `docs/INDEX.md` | `T-01.2` | `5c698c1` | modified (**append**) |
| `docs/specs/SPEC-002-codigo-em-ingles.md` | `T-01.3` | `0053c3b` | modified (cabeçalho) |
| `docs/plans/SPEC-002-codigo-em-ingles/index.md` | `T-01.3` | `0053c3b` | modified (cabeçalho) |

Spec: `docs/specs/SPEC-002-codigo-em-ingles.md` · Plan: `docs/plans/SPEC-002-codigo-em-ingles/01_convencao_escrita.md`

---

## 2. DoD — cada critério com o comando que o verifica e o universo varrido

### `T-01.1` · `CST-92`

| # | critério | comando literal | resultado |
|---|---|---|---|
| `CA-F1-1` | tabela de 12 linhas íntegra | `grep -cE '^\| [0-9]+ \|' CLAUDE.md` | **12** ✅ |
| `CA-F1-1`' | idem, contagem crua da seção | `sed -n '97,197p' CLAUDE.md \| grep -c '^\| '` | **13** = 12 dados + 1 cabeçalho ⚠️ ver §4 |
| `CA-F1-2` | exceção literal e grepável | `grep -cF 'vocabulário fechado de componentes e todo caminho que dele deriva ficam em português' CLAUDE.md` | **1**, `rc=0` ✅ |
| `CA-F1-2`' | rótulo correto | `grep -cF '[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]' CLAUDE.md` | **2** ✅ |
| `CA-F1-2`'' | e a linha 9 **não** leva o rótulo errado | `awk '/^\| 9 \|/' CLAUDE.md \| grep -c 'PREMISSA-OWNER'` | **0** ✅ |
| `CA-F1-3` | gatilho de reabertura escrito | `grep -c 'glossary_doc' CLAUDE.md` | **2** (≥1) ✅ |
| `CA-F1-4` A | nenhuma regra nasce | `diff <(rules list antes) <(rules list depois)` | **VAZIO**, as mesmas **7** ✅ |
| `CA-F1-4` B | nenhuma `[[rules.own]]` declarada | `git diff c7df90c -- harness.toml \| grep -cF '[[rules.own]]'` | **0** ✅ |
| item `1.4` | linha 10 resolvida, sem marcador de indecisão | `awk '/^\| 10 \|/' CLAUDE.md \| grep -c 'INFERRED:'` = **1**; `… \| grep -c '⏸'` = **0** | ✅ |
| item `1.5` | linha 12 em aberto, com dono | `awk '/^\| 12 \|/' CLAUDE.md \| grep -c '⏸'` = **1**; `… \| grep -ci 'owner'` = **1** | ✅ |
| `CA-F1-8` | zero código | `git diff --name-only c7df90c -- backend frontend \| wc -l` | **0** ✅ |

### `T-01.2` · `CST-93`

| # | critério | comando literal | resultado |
|---|---|---|---|
| `CA-F1-5` A | o `README` **aponta** | `grep -c 'CLAUDE.md' README.md` | **5** (≥1) ✅ |
| `CA-F1-5` B | o `README` **não copia** | `grep -cF 'vocabulário fechado de componentes e todo caminho que dele deriva' README.md` | **0** ✅ |
| `CA-F1-7` | `docs/INDEX.md` cresce, não muda | `git diff --numstat c7df90c -- docs/INDEX.md` | **`1  0  docs/INDEX.md`** — zero remoções ✅ |
| `RN-1` | citação viva sobrevive ao rename do título | `grep -cF 'Idioma de docstring é convenção, não portão' README.md` | **1** ✅ ver §3 |

### `T-01.3` · `CST-94`

| # | critério | comando literal | resultado |
|---|---|---|---|
| — | exatamente 2 arquivos | `git diff --name-only 5c698c1..0053c3b \| wc -l` | **2** ✅ |
| — | estado **conferido**, não presumido | `harness pipeline state codigo-em-ingles` | **`BUILD_AUTHORIZED`** ⚠️ ver §4 |
| — | `docs/adr` intocado | `git diff --name-only 5c698c1..0053c3b -- docs/adr` | **vazio** ✅ |
| — | `backend`/`frontend` intocados | `git diff --name-only 5c698c1..0053c3b -- backend frontend` | **vazio** ✅ |
| — | só linhas de cabeçalho | `git diff -U0 5c698c1..0053c3b \| grep '^@@'` | `@@ -3,2 +3,2 @@` e `@@ -3 +3,2 @@` ✅ |

---

## 3. Um defeito que eu criei e consertei no mesmo commit — a âncora do título

Generalizar o título de `README.md:83` (item `1.6`) **quebraria uma citação viva**: `backend/README.md:286`
referencia a seção **pelo título antigo**, `§"Idioma de docstring é convenção, não portão"`. E
`ADR-015/D3` classifica `backend/README.md` como **VIVA** ("instrui trabalho corrente").

Deixá-la quebrada produziria o **terceiro significado de `rc=0`** da `ADR-012`: `grep` devolvendo zero
sobre um título que não existe mais é indistinguível de "procurei e está limpo". `RN-1` manda que o
rename seja **atômico com a citação viva**.

**Consertado sem tocar `backend/README.md`** — que é o arquivo disputado pelas fases `02` e `03`, e um
terceiro editor ali criaria conflito de merge sem necessidade. A frase antiga, **na grafia exata que a
citação usa**, permanece viva no corpo do `README.md`, num parágrafo que registra o próprio rename.
Medido: `grep -cF 'Idioma de docstring é convenção, não portão' README.md` → **1**.

**Nenhuma medição do `README` foi apagada ou alterada de valor** — as 3 mutações de docstring, os `rc=1`
de `D102`/`D400`/`D415`, o `rc=3` sem venv e a tabela dos 3 portões recusados continuam onde estavam.
O único ajuste de corpo desambigua o antecedente que o título novo tornaria ambíguo:
*"a convenção **de `ADR-011/D6`** alcança a docstring, e só ela"*.

---

## 4. Três divergências que eu NÃO resolvo sozinho — nomeadas, com dono

### 4.1 ⚠️ O DoD de `T-01.3` envelheceu pelo mesmo defeito que a task ataca

A task manda conferir `harness pipeline state codigo-em-ingles` → **`SPEC_APPROVED`**. **O ledger diz
`BUILD_AUTHORIZED`.** A task foi escrita quando o estado era `SPEC_APPROVED`; três eventos depois, o
texto do DoD envelheceu — **a mesma família de defeito, uma volta acima.**

```
$ harness pipeline state codigo-em-ingles      ->  BUILD_AUTHORIZED
    2026-08-29T14:35:44Z  approve   spec              <- a autorizacao que o texto cita
    2026-08-29T14:35:45Z  advance   SPEC_APPROVED
    2026-08-29T15:07:18Z  advance   BUILD_AUTHORIZED  <- e o estado de HOJE
```

**O que escrevi**, e é o que o ledger sustenta: o cabeçalho declara `SPEC_APPROVED` citando o evento
`approve spec` **com timestamp**, e registra que a feature **já seguiu para `BUILD_AUTHORIZED`**.
`[MEDIDO]`, não presumido do resumo de quem despachou nem do texto do documento.

### 4.2 ⚠️ DESVIO DECLARADO — `index.md:4` dizia que a `ADR-015` está `proposto`

O "NÃO FAZ" de `T-01.3` é enfático: *"NÃO muda o status da `ADR-015`, que está `proposto`"*, e a razão
dada era que aceitá-la seria **ato do owner**. **Essa razão está vazia hoje:** a `ADR-015` é `aceito`
desde 2026-08-29, por ato do owner registrado no cabeçalho da própria ADR
(`[DECISÃO-OWNER: 2026-08-29 — escolha entre alternativas apresentadas]`).

**Atualizei a REFERÊNCIA, não o status.** Atualizar um documento que descreve o status de outro não é
aceitar a ADR — e a própria operacionalização do DoD confirma o limite que importa:
`git diff --name-only -- docs/adr` → **vazio**. **Nenhum arquivo sob `docs/adr/` foi tocado.**
Deixá-la dizendo `proposto` seria manter escrita uma afirmação que eu **medi ser falsa**, que é
exatamente a contradição texto × ledger que `CLAUDE.md` proíbe. **Se o QA discordar, a reversão é uma
linha** — mas ela precisa ser uma decisão consciente, não um descuido.

### 4.3 ⚠️ Para quem for rodar `T-04.1`: o ledger e a `SPEC-002` §6.3 divergem sobre os 4 eventos de log

**Não é da fase `01` e eu não a resolvo.** Escrevi na tabela o que a SPEC e a task mandam — *"os 4
eventos existentes NÃO são renomeados por esta SPEC"* (`SPEC-002` §6.3, e `T-04.1(b)` repete literalmente).
**Mas o motivo do `approve build` no ledger diz o contrário:**

> *"PERGUNTA T-04.2 JA RESPONDIDA pelo owner no mesmo ato: nao existe consumidor externo dos 4 eventos
> de log em portugues, entao renomea-los e barato e **a task fecha a divergencia agora**."*

`SPEC-002` §6.3 responde a "sem consumidor" com *"migram numa fase própria e futura, **fora do escopo
desta SPEC**"*. **Dono da reconciliação: `/architect` (e o coordenador, que gravou o motivo).** Se a
leitura do ledger vencer, `T-04.1(b)` e a nota da linha 10 do `CLAUDE.md` mudam juntas — e é **uma
linha** em cada. Registro agora porque em duas fases sai caro.

### 4.4 ⓘ Observação sem ação — `docstring / comentário` na linha 5 da tabela

A linha 5 (copiada **íntegra** de `PRD-002` §3.1, como `1.1` exige) diz *"docstring / comentário →
inglês"* com força `ADR-011/D6`. **`ADR-011/D6` alcança só a docstring**, e `README.md:87-89` — texto
medido por `T-01.7` — diz que os comentários `#` continuam em português. **Não editei nem a tabela nem
a medição**: alterar a tabela violaria "íntegra", e apagar a medição violaria `RN-2`. Dono: `/architect`.

---

## 5. Comandos rodados (literais) e resultado — com o universo varrido

```
$ make setup                                    # rc=0 — Python 3.13.13 em backend/.venv
$ make test                                     # rc=0
    107 passed in 5.56s
    TOTAL  370 statements  0 miss  54 branch  0 partial  100%
    [OK] domain 100.0% [124/124] · [OK] use_cases 100.0% [52/52] · [OK] infra 100.0% [194/194]
$ make lint                                     # rc=0  (ruff E,F,I,N,UP,B,S,ANN,C90,D + eslint)
$ harness rules --mode sweep --changed-only     # rc=0 — 0 [BLOQUEIO], 1 [AVISO]
$ harness rules --mode sweep                    # rc=0 — 0 [BLOQUEIO], 1 [AVISO]
$ harness rules list --severity block           # rc=0 — 7 regras
```

**Universo:** 107 testes · 370 statements · 3 camadas medidas de 3 declaradas · 7 regras em vigor.
**`rc=3` não apareceu em nenhum alvo** — e `rc=3` seria "não mediu", não "passou".

**LINHA DE BASE INTACTA, e ela é o falsificador barato desta entrega.** Congelada em `7c3599b` pelo
`/tech-lead`, re-medida por mim **antes** e **depois** das três tasks, no mesmo worktree:

| medida | antes | depois | esperado |
|---|---|---|---|
| testes | 107 passed | **107 passed** | 107 |
| statements | 370 | **370** | 370 — *o número que denuncia* |
| branches | 54 | **54** | 54 |
| cobertura por camada | 124/52/194 · 100% | **124/52/194 · 100%** | idêntica |
| regras em vigor | 7 | **7** | 7 |
| sweep | 0 BLOQ / 1 AVISO | **0 BLOQ / 1 AVISO** | idêntico |

As três tasks são `[docs]` e **não tocam código** — divergência aqui, **inclusive para mais**, seria
prova de que fiz algo que não devia. `git diff --name-only c7df90c -- backend frontend` → **vazio**.

---

## 6. Falsificadores — 5 mutações, e as 5 REPROVAM

**Verde não prova nada até uma mutação reprovar.** Cada proteção que eu afirmo funcionar tem abaixo o
caso concreto que ela **rejeita**. `M1`–`M3` em cópias descartáveis; `M4`–`M5` na árvore, **restauradas
e conferidas por `sha256sum -c` → `SUCESSO` nos dois arquivos**.

| # | mutação | comando do critério | árvore limpa | mutada | veredito |
|---|---|---|---|---|---|
| `M1` | a exceção perde **um acento** (`português` → `portugues`) | `grep -cF '…ficam em português' CLAUDE.md` | **1** | **0** | ✅ reprova |
| `M2` | alguém **cola a exceção** no `README` | `grep -cF '…que dele deriva' README.md` | **0** | **1** | ✅ reprova |
| `M3` | o **rótulo errado**: `[PREMISSA-OWNER]` na linha 9 | `awk '/^\| 9 \|/' CLAUDE.md \| grep -c 'DECISÃO-OWNER'` | **1** | **0** | ✅ reprova |
| `M4` | alguém **reescreve** a linha 40 do `INDEX` | `git diff --numstat c7df90c -- docs/INDEX.md` | `1  0` | **`2  1`** | ✅ reprova (o `1` em remoções) |
| `M5` | alguém declara uma **`[[rules.own]]` de idioma** | `harness rules list --severity block` | **7** | **8** | ✅ reprova |

**`M5` em detalhe, porque é o que `ADR-011/D1.10` reprova a fase por fazer.** Primeira tentativa foi
**mal-formada** (usei `kind =` no lugar de `form =`) e o harness recusou a política inteira com `V-09` —
o diff mudava, mas por erro de sintaxe, o que é **prova mais fraca do que a que eu afirmava**. Refeita
**bem-formada**, e aí a demonstração é a certa:

```
$ harness rules list --severity block | tail -2
[BLOQUEIO] no-portuguese-identifier  (own · forbidden-regex · escopo code)
total: 8 regra(s) em vigor            # <- 7 na arvore limpa
$ git diff c7df90c -- harness.toml | grep -cF '[[rules.own]]'    ->  1   # 0 na arvore limpa
```

**Os dois lados de `CA-F1-4` detectam.** Registro a primeira tentativa em vez de apagá-la: uma mutação
que "funciona" pelo motivo errado é a forma mais barata de fabricar confiança falsa.

**Achado lateral, e ele corrige um número que eu mesmo ia reportar errado:**
`grep -c '\[\[rules.own\]\]' harness.toml` → **4**, mas **as 4 ocorrências estão dentro de comentários**
— o repositório declara **ZERO** `[[rules.own]]` de verdade. `harness rules list` confirma: as 7 regras
vêm todas dos packs `core` e `web-fullstack`, nenhuma de `own`.

---

## 7. Doc delta

- **`CLAUDE.md`**: **atualizado** — seção nova *"Idioma de identificador — a fronteira escrita, e ela é
  convenção, não portão"* (`:97`–`:196`), adjacente a *"Vocabulário fechado de componentes"* (`:92`).
  Motivo: é o item `1.1`–`1.5` da fase, e `SPEC-002` §2 escolheu este arquivo por ser o único carregado
  **incondicionalmente** como *project instructions* em toda sessão de agente.
- **`README.md`**: **atualizado** — §`:83` vira ponteiro; título generalizado. Motivo: item `1.6`.
- **`docs/INDEX.md`**: **atualizado por ACRÉSCIMO** — 1 linha nova (`:85`). Motivo: item `1.7`, e
  registra também a correção de `ADR-015/D3` (o plano `01` de `SPEC-001` move de VIVA para HISTÓRICA;
  contagem 5/5 → 4/6). **Nenhuma linha existente reescrita.**
- **`SPEC-002` + `index.md` do plano**: **atualizados** — só cabeçalho. Motivo: `T-01.3`.
- **`ADR`**: **nenhuma criada, nenhuma editada** — não necessário. As decisões desta fase já estão em
  `ADR-013`, `ADR-015`, `PRD-002` e `SPEC-002`; esta fase **transcreve fronteira, não decide nada novo**.
  `git diff --name-only c7df90c -- docs/adr` → **vazio**.

---

## 8. Bloqueado

**Nada bloqueado.** Os quatro itens de §4 são divergências **nomeadas com dono**, nenhuma delas trava a
fase `01`, e nenhuma é decisão minha: §4.1 e §4.2 estão **resolvidas com a evidência do ledger citada**;
§4.3 e §4.4 são de `/architect` e afetam a fase `04`, não esta.

**O que eu NÃO fiz, por proibição explícita do despacho:** nenhum `gate-record`, `approve` ou `advance`;
nenhum QA despachado; nenhum merge; `tasks.toml` **não editado**; Jira **não tocado**; ledger
**intocado** — `BUILD_AUTHORIZED` antes, `BUILD_AUTHORIZED` depois.

---

# CICLO 2 — resposta a `/qa APPROVED` + `/review COMPLIANT`

**Base:** `77cf178` · **Commit dos consertos:** `e41a674` · **Zero `BLOCKER` nos dois gates.**
Os 7 itens do despacho, item a item: **o que foi feito, ou o argumento de por que não.**

| # | item | ação |
|---|---|---|
| 1 | falsificador da exceção nasce falso | ✅ **corrigido** — §C2.1 |
| 2 | "enumeração fechada" com buraco medido | ✅ **corrigido como prosa**, não 13ª linha — §C2.2 |
| 3 | `[DECISÃO-OWNER]` não definido em `:53-54` | ✅ **corrigido** — §C2.3 |
| 4 | `README` subdeclara alcance (`comentário`) | ✅ **corrigido** — §C2.4 |
| 5 | 3 mutações escaparam à bancada | ✅ **escaladas com dono** — §C2.5 |
| 6 | `[PREMISSA-OWNER]` solda prescrição + queixa | ✅ **escalado ao owner, NÃO decidido** — §C2.6 |
| 7 | errata do DoD de `T-01.3` | ✅ **nomeada para o `/tech-lead`** — §C2.7 |

**Nenhum CA da fase mudou de valor:** `CA-F1-1` **12** · `CA-F1-2` **1**/`rc=0` · `CA-F1-3` **2** ·
`CA-F1-5` **7** e **0** · `CA-F1-7` **`1  0`** · `CA-F1-8` **0**.
**Linha de base intacta:** 107 passed · 370 statements · 54 branches · 124/52/194 · 100% ·
`make lint` `rc=0` · sweep 0 BLOQ / 1 AVISO · `rules list` **7**, `diff` antes × agora **VAZIO**.

---

## C2.1 · `[WARNING-1]` — o falsificador reprovava a árvore que ele acabara de aprovar

**Era o achado mais importante, e a correção não é a prescrita ao pé da letra — é uma mais forte.**
O `/review` sugeriu *"…ou com um nome de coluna de contrato da linha 11"*. **Isso remendaria o sintoma e
deixaria o defeito de raiz:** o universo estava errado, não a lista de exceções. O texto dizia **"todo
nome"**, mas o critério que a fase de fato mede (`CA-F1-6`) varre **segmento de diretório**. Um
falsificador cujo universo não é o do seu próprio comando não mede o que anuncia.

**Universo corrigido para `CA-F1-6` + as duas subtrações:**

```bash
git ls-tree -r --name-only HEAD | grep -E '^(backend/src|backend/tests|frontend/src)/' \
  | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u \
  | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'
```

**14 segmentos, exatamente 1 em português (`painel`)** — que a fase `03` renomeia ⇒ depois: **13, zero**
`[MEDIDO 2026-08-29 em 77cf178, n=14]`.

**Os dois lados, provados — porque um falsificador que só cala não é falsificador:**

| # | mutação | antes | sob mutação | |
|---|---|---|---|---|
| `N8` | alguém cria `backend/src/modules/sentimento/dominio/` | 1 seg. PT | **2** | ✅ **MORDE** erosão nova |
| `N9` | `janela_de_perda` (a exceção da linha 11) | — | **0** no universo | ✅ **CALA** sobre a exceção |
| `N10` | a versão **antiga** ("todo nome") | — | acusa `"janela_de_perda"` **e** `numero` | ❌ era isto que reprovava |

---

## C2.2 · `[WARNING-2]` — a lacuna entra como prosa, e a palavra "fechada" para de mentir

**Não virou 13ª linha, e a recusa é a razão de a correção existir:** `CA-F1-1` congela a tabela em **12**,
e uma 13ª **reprovaria um `CLAUDE.md` correto** se o critério fosse re-medido ao fim de `04`.
Entrou como **prosa adjacente sob a tabela** — o precedente é a coluna de contrato, que o `/tech-lead`
colocou assim pelo mesmo motivo.

**Re-medi por conta própria em vez de copiar o número do `/review`** — `n=5` mensagens em 3 arquivos,
**3 PT / 2 EN**, confirmado. Status **`⏸ NÃO DECIDIDO`**, **dono `/architect`**, com **gatilho
observável**: se o número de mensagens em português subir, a lacuna deixou de ser inércia e virou rampa.

E `:99-100` deixou de afirmar mais do que entrega: *"fechada **sobre as superfícies que ela lista** — e
há **uma lacuna conhecida, declarada logo abaixo da tabela**, em vez de escondida atrás da palavra
*fechada*"*.

---

## C2.3 · `[WARNING-3]` — o arquivo usava um rótulo que não definia

`[DECISÃO-OWNER]` entrou na enumeração de `:53-55`, e a distinção virou cláusula própria junto ao
corolário: **`[PREMISSA-OWNER]` = o owner _disse_** (citação literal); **`[DECISÃO-OWNER]` = o owner
_escolheu_** entre opções que um agente redigiu. Com a assimetria escrita: *rotular uma escolha como
`[PREMISSA-OWNER]` inventa uma frase que o owner nunca disse; rotular uma fala dele como
`[DECISÃO-OWNER]` dissolve a autoridade dela.*

**Também apliquei `[INFO-2]`** (1 linha, e reduz materialmente o risco que `WARNING-3` nomeia): o rótulo
mudou para **dentro** do bloco `>` da exceção, com `⚠️ isto NÃO é fala do owner`. Antes, quem grepasse a
frase — que é exatamente o que `CA-F1-2` treina o leitor a fazer — recebia a linha **sem** rótulo, no
mesmo dispositivo tipográfico da citação literal do owner 2 linhas acima.

---

## C2.4 · `[WARNING-4]` — o único ponto corrigível sem violar `CA-F1-1` nem `RN-2`

`README.md` passou a declarar `comentário` no alcance, **e a divergência ficou escrita em vez de
resolvida à revelia**: a linha 5 manda *docstring / comentário → inglês*; o `README` diz que comentários
`#` continuam em português; e **`ADR-011/D6`, a força que a linha 5 invoca, alcança só a docstring**.
⇒ a tabela afirma, nesta linha, mais do que a decisão que ela cita sustenta. **Dono: `/architect`** — quem
tem de se decidir é a **linha 5 de `PRD-002` §3.1**. Nem a tabela nem a medição do `README` foram
tocadas: editar a primeira violaria *"íntegra"*, apagar a segunda violaria `RN-2`.

---

## C2.5 · Os três escapes — ESCALADOS, com dono, porque são buracos dos CRITÉRIOS

O `/qa` mediu `n=7`, **4 reprovam e 3 escapam**. Nenhum reprova esta entrega — **nenhum DoD desta fase os
promete** — e por isso a resposta certa é **escalar**, não remendar o texto para tapar um critério que
não é meu. **Nenhum deles é corrigível dentro de `T-01.1`–`T-01.3`: os três exigem um CA novo**, e
escrever CA é ato de quem quebra tasks, não de quem as implementa.

| escape | o que passa despercebido | dono | conserto, e ele é de uma linha |
|---|---|---|---|
| **`N1`** | a **linha 10 revertida em silêncio** para `⏸ NÃO DECIDIDO` — todos os CA verdes | **`/tech-lead`** | **o detector JÁ EXISTE**: `CA-F4-1` (*"a linha 10 contém `[INFERRED:` e **não** contém o marcador"*). Está na fase `04` e não na `01` ⇒ a linha 10 fica **três fases sem guarda**. Adotar `CA-F4-1` como regressão a partir de `02` |
| **`N2`** | a **linha 12 DECIDIDA por um agente**, fechando uma pergunta reservada ao **owner** (`[Q2]`) sem ele | **`/tech-lead`** + **owner** | **o mais caro dos três e o único sem dono declarado.** Nada mede que a pergunta continue **aberta**. Detector simétrico ao de `N1`: *a linha 12 contém `⏸` e a palavra `owner`* — é o que eu já meço no meu próprio DoD, e que nenhum CA da fase exige |
| **`N6`** | a exceção copiada no `README` **parafraseada** | **`/architect`** | **falsifica uma afirmação publicada:** `01_convencao_escrita.md:42` diz que a metade `→ 0` *"é a que impede as duas verdades"*. Ela é `grep -F` de **uma frase literal** ⇒ impede a cópia **verbatim** e **não** impede a **paráfrase**, que produz as mesmas duas verdades pelo mesmo custo. **A conclusão do plano está certa; o argumento é mais fraco do que ele afirma** |

> **`N2` é o que eu destacaria se só um pudesse ser levado adiante.** `N1` e `N6` degradam um critério;
> `N2` permite que **uma decisão do owner seja tomada por um agente** e passe em todos os portões. É a
> mesma classe de defeito que a linha 10 já sofreu — *"a divergência nasceu de a superfície não ter dono
> declarado"* — só que aplicada a uma pergunta que **tem** dono e é dele.

---

## C2.6 · ⛔ PARA O OWNER — um rótulo solda duas orações de sentido oposto, e isso vira regra que ninguém enunciou

**Isto não é conserto, é pergunta. Eu não a decido, e reproduzi a tabela como está porque `CA-F1-1`
exige a íntegra — o defeito é herdado de `PRD-002` §3.1, não introduzido aqui.**

**O parágrafo para o owner ler:**

> Stharley — em 2026-08-29 você escreveu, sobre idioma de código:
>
> > *"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome
> > dos arquivos, var, tudo."*
>
> Esta frase está hoje citada em `PRD-002` §3.1 sob **um único rótulo `[PREMISSA-OWNER]`**, e ela tem
> **duas orações que fazem coisas diferentes**:
>
> - ***"todo código gerado é em inglês"* é PRESCRIÇÃO** — você manda. Disso saem as linhas 1 e 2 da
>   tabela, e ninguém tem dúvida.
> - ***"olhando no front, tá tudo em português, nome dos arquivos, var, tudo"* parece QUEIXA** — você
>   está descrevendo **o que viu ao olhar**, não emitindo uma segunda ordem. Mas ela foi lida como
>   prescrição e virou a força da **linha 3** (*nome de arquivo → inglês*, `[PREMISSA-OWNER]`, com
>   *"nome dos arquivos"* citado como literal) e, por herança, da **linha 4** (nome de diretório).
>
> **Se a segunda oração era queixa e não ordem**, então as linhas 3 e 4 têm força **`[INFERRED]`**, não
> `[PREMISSA-OWNER]` — e uma delas governa a fase `03`, que **renomeia arquivos e um diretório**.
> **Se era ordem**, está tudo certo como está e esta pergunta morre em uma palavra sua.
>
> **A pergunta, e ela é de sim ou não:** *"tá tudo em português, nome dos arquivos, var, tudo"* era
> **você mandando** renomear arquivos e diretórios, ou **você relatando** o que encontrou?
>
> **Nada trava enquanto você não responde.** As fases `01`–`03` seguem: a linha 1 (prescrição, sem
> dúvida) já sustenta o trabalho de identificador. O que muda com a resposta é **o rótulo de força** das
> linhas 3 e 4 — e rótulo de força errado é exatamente o defeito que este repositório mais paga.

**Dono da correção depois da resposta:** `/architect` (é `PRD-002` §3.1 que se edita, não o `CLAUDE.md`).

---

## C2.7 · A errata do DoD de `T-01.3` — ato do `/tech-lead`, nomeada aqui para encaminhamento

**Os dois auditores confirmaram o desvio, e os dois confirmaram que eu acertei em não editar o critério.**
O DoD de `T-01.3` fixa `harness pipeline state codigo-em-ingles` → **`SPEC_APPROVED`**, que é um **valor
derivado e monotônico** — ele envelhece a cada `advance`. O **evento é imutável**; o **estado não é**.
Hoje o ledger diz `BUILD_AUTHORIZED`, e o DoD, lido ao pé da letra, **reprovaria uma entrega correta**.

> **A errata, e ela é do `/tech-lead` porque `tasks.toml` é dele — eu não o edito:**
> trocar `harness pipeline state codigo-em-ingles` → `SPEC_APPROVED` por
> **`SPEC_APPROVED` ou posterior**, verificado por `harness pipeline show codigo-em-ingles` **contendo o
> evento `approve spec`**. O evento não envelhece; o estado sim. **É a mesma lição da própria `T-01.3`,
> aplicada ao critério em vez de ao documento** — e é a terceira volta da mesma espiral nesta trilha.

**O que eu fiz e mantenho:** escrevi no cabeçalho o que o ledger sustenta — `SPEC_APPROVED` citando
`approve spec` em `2026-08-29T14:35:44Z`, **e** registrando que a feature já seguiu para
`BUILD_AUTHORIZED`. Evidência **conferida por comando**, não presumida do texto nem do resumo do despacho.

---

## C2.8 · O que eu NÃO consertei, e o argumento

- **`[INFO-1]`** (a âncora do título sobrevive como **prosa**, e `grep -cF` é cego ao tipo): **não
  consertado, de propósito.** O conserto real é atualizar `backend/README.md:262` e `:286` para o título
  novo — e esse arquivo é **disputado pelas fases `02` e `03`**. Um terceiro editor ali criaria conflito
  de merge sem necessidade. **Fica para quem tocar `backend/README.md` na `02`/`03`, atomicamente.**
  O `/review` classificou como INFO e endossou a decisão.
- **`[INFO-3]`** (`docs/INDEX.md:85` é não-monotônico no tempo e não avisa): **não corrigível por
  edição** — o arquivo é **append-only por `CLAUDE.md`**, e reescrever a linha para acrescentar o aviso
  **violaria `CA-F1-7`**, que é o critério que esta própria task existe para provar. A saída seria uma
  **segunda linha** de errata, e o custo (uma linha permanente no registro) excede o do defeito (um
  carimbo fora de ordem num arquivo que já tem outros). **Registrado, não consertado.**
