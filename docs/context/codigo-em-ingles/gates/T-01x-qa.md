# QA Gate — `codigo-em-ingles` fase `01` · `T-01.1`/`CST-92`, `T-01.2`/`CST-93`, `T-01.3`/`CST-94`

**Veredito: `APPROVED`** · worktree `/tmp/claude-1002/wt/ci-T-01x-convencao-escrita`, branch
`task/ci-T-01x-convencao-escrita`, commit **`ec39b48`**, base real **`origin/master@c7df90c`**.
Bancada de mutação em diretório privado, fora da árvore do owner.

> **A base é `origin/master@c7df90c`, e não o ref `master` local, que está em `e344988` — DESATUALIZADO.**
> Medir os DoDs contra `master...` produz dois falsos negativos (`docs/adr` "tocado", `docs/INDEX.md`
> `2 0`) que somem contra a base correta. `[MEDIDO 2026-08-29: git merge-base origin/master HEAD → c7df90c]`
> Quem re-medir esta fase com `master...` vai reprovar um builder correto.

---

## 1. Regras bloqueantes — 7 de 7 avaliadas

`harness rules list --severity block` → **7 regras**. Avaliadas contra a árvore por varredura, não por
inspeção de diff:

```
$ harness rules --mode sweep
rc=0 · [BLOQUEIO] 0 · [AVISO] 1  (web-fullstack.browser-test-file-present)
```

| # | regra | veredito | evidência |
|---|---|---|---|
| 1 | `core.relative-import` | **OK** | sweep `rc=0`, 0 `[BLOQUEIO]` |
| 2 | `core.silent-except` | **OK** | idem |
| 3 | `core.print-statement` | **OK** | idem |
| 4 | `core.hardcoded-secret` | **OK** | idem |
| 5 | `web-fullstack.browser-imports-server` | **OK** | idem |
| 6 | `web-fullstack.tenant-from-request` | **OK** | idem |
| 7 | `web-fullstack.server-test-directory-present` | **OK** | idem |

O único `[AVISO]` é o pré-existente e congelado na linha de base. **Reforço independente:**
`git diff --name-only origin/master...HEAD -- backend frontend` → **vazio**; as três tasks são `[docs]`
e nenhuma linha de código entrou no universo das 7 regras.

## 2. `D1.10` — nenhuma `[[rules.own]]` de idioma. Os DOIS lados, e é o que reprova a fase se falhar

```
$ git diff origin/master...HEAD -- harness.toml | grep -cF '[[rules.own]]'
0
$ git diff --name-only origin/master...HEAD -- harness.toml
                                    # vazio — harness.toml INTOCADO
$ git show origin/master:harness.toml | sha256sum ; sha256sum harness.toml
b1193822672401dc91da84e94913dcc528d81f66be0ec787c54594fdf4f88e30  -
b1193822672401dc91da84e94913dcc528d81f66be0ec787c54594fdf4f88e30  harness.toml
```

**Lado 2, o comportamental** — `harness rules list --severity block` rodado em **duas árvores reais**
(`git worktree add --detach <scratch> origin/master`, `rc=0`, `HEAD` conferido = `c7df90c`) e não em
uma só:

```
$ diff rules_antes(c7df90c) rules_depois(ec39b48)
                                    # VAZIO
$ grep -c '^\[BLOQUEIO\]' em cada    # 7 e 7
```

⚠️ **A minha primeira tentativa deste lado foi INVÁLIDA e eu a descartei em vez de a reportar:**
`git worktree add` devolveu **`rc=128`**, o `cd` seguinte caiu em diretório errado e o "antes" teria sido
o próprio "depois" — um `diff` vazio que não mediu nada. **Refeito em `base2`, com `rev-parse HEAD`
conferido antes de medir.** É o terceiro significado de `rc=0` da `ADR-012` tentando entrar por dentro do
instrumento de QA; registro porque um `diff` vazio obtido assim é indistinguível do verdadeiro.

**`[OK] D1.10` — os dois lados.**

## 3. DoD, item a item

### `T-01.1` / `CST-92`

| CA | comando | esperado | medido | |
|---|---|---|---|---|
| `CA-F1-1` | `grep -cE '^\| [0-9]+ \|' CLAUDE.md` | 12 | **12** | OK |
| `CA-F1-2` | `grep -cF 'vocabulário fechado de componentes e todo caminho que dele deriva ficam em português' CLAUDE.md` | 1, `rc=0` | **1**, `rc=0` | OK |
| `CA-F1-3` | `grep -c 'glossary_doc' CLAUDE.md` | ≥1 | **2** | OK |
| `CA-F1-4` | §2 acima | dois lados | dois lados | OK |
| `CA-F1-8` | `git diff --name-only origin/master...HEAD -- backend frontend` | vazio | **vazio** | OK |
| `CA-F1-9` | `make lint` / `make test` | `rc=0` | **`rc=0` / `rc=0`** | OK |

`make setup` → **`rc=0`** antes de qualquer medição. **Nenhum `rc=3` em nenhum ponto** — nenhuma
medição desta fase é um "não mediu" vestido de verde.

**`CA-F1-3` é dívida com DONO, não nota solta** — conferido no texto, não só na contagem: `CLAUDE.md`
diz *"Hoje ela é **dívida com dono** (`ADR-013/D4`)"* e carrega a desambiguação que o número sozinho não
dá — `harness policy --key glossary_doc` → **1 byte, `rc=0`** contra `grep -n 'glossary' harness.toml` →
**`rc=1`** ⇒ *"nunca declarado"*, não *"declarado e vazio"*. **As duas ocorrências têm função distinta**
(a chave e o comando que a separa do falso positivo); não é a mesma palavra escrita duas vezes.

### `T-01.2` / `CST-93`

| CA | comando | esperado | medido | |
|---|---|---|---|---|
| `CA-F1-5` **metade 1** | `grep -c 'CLAUDE.md' README.md` | ≥1 | **5** | OK |
| `CA-F1-5` **metade 2** | `grep -cF '<exceção literal>' README.md` | **0** | **0** (`rc=1`) | OK |
| `CA-F1-7` | `git diff --numstat origin/master...HEAD -- docs/INDEX.md` | `N 0` | **`1 0`** | OK |

**A metade 2 é a que prova o deliverable** e ela passa: a exceção não foi copiada. `docs/INDEX.md`
cresceu **1 linha, 0 remoções** ⇒ append-only respeitado.

### `T-01.3` / `CST-94`

| DoD | esperado | medido | |
|---|---|---|---|
| arquivos do commit `0053c3b` | exatamente 2 | **2** (`index.md` do plano + `SPEC-002`) | OK |
| `git diff --name-only origin/master...HEAD -- docs/adr` | vazio | **vazio** | OK |
| `git diff --name-only origin/master...HEAD -- backend frontend` | vazio | **vazio** | OK |
| só linhas de cabeçalho | sim | **sim** — 2 linhas no `index.md`, 1 alterada + 1 anotação no `SPEC-002`, tudo acima de `**Feature:**` | OK |

## 4. Linha de base comportamental — IDÊNTICA, e é o falsificador barato de "task `[docs]`"

```
$ make test    # rc=0
107 passed in 5.11s
TOTAL  370  0  54  0  100%
[OK] domain 100.0% [124/124] · [OK] use_cases 100.0% [52/52] · [OK] infra 100.0% [194/194]
$ make lint    # rc=0 — All checks passed! · 29 files formatted · no issues in 29 source files
```

**`107 passed · 370 statements · 54 branches · 124/52/194 · 100%` — os seis números batem, um a um, com
a linha de base congelada.** Cobertura **100%** contra alvo declarado **70%** global e **90/80/70** por
camada: **acima do alvo em todas as quatro medidas.** Estas são tasks `[docs]`; um único número diferente
seria a prova de que alguém tocou código, e nenhum é.

**`CA-F1-6`** (medidor de erosão, o único critério que sobrevive à feature) re-medido como linha de base
para as fases `02`/`03`: **14 segmentos, exatamente 1 em português (`painel`)** — igual ao declarado no
plano. Não é DoD desta fase; fica registrado para que `03` tenha um "antes" que não precise ser inventado.

## 5. Auditoria de CONTEÚDO da tabela de fronteira — linha a linha contra `PRD-002` §3.1

Comparei as **12** linhas do `CLAUDE.md` com as 12 de `PRD-002` §3.1 (`:98-109`). **Fidelidade
integral nas 12**, com três divergências deliberadas e todas justificadas:

| linha | `PRD-002` §3.1 | `CLAUDE.md` | veredito |
|---|---|---|---|
| 1–9, 12 | — | idênticas (adaptação de coluna "origem" só onde o PRD dizia "estendida **aqui**") | **fiel** |
| **10** | `⏸ NÃO DECIDIDO` · `[NÃO SEI]` | **inglês, PROSPECTIVAMENTE** · `[INFERRED: aplicação de ADR-013/D3 linha 1 a superfície não enumerada]` | **correto** — é a resolução que `SPEC-002` §6.1 manda e o `refs` de `T-01.1` prescreve, **com o rótulo exato exigido** |
| **11** | `[DOC: …/ingest_record.py:80-89]` | `[DOC: …/ingest_record.py:87-89]` | **âncora ESTREITADA e VERIFICADA** — `:88-89` é literalmente *"The NAME stays Portuguese because it is a CONTRACT COLUMN NAME quoted from `ADR-008/D3`"*; e `:87-89` é o mesmo intervalo que `tasks.toml`/`T-04.1` já cita. Alinhou com a task a jusante, não com o PRD. Nit: `:87` é um `#` vazio; `:88-89` seria exato |

**As três superfícies que o enunciado mandou caçar estão TODAS cobertas, e nenhuma por omissão:**
**evento de log = linha 10** (decidida, prospectiva, com o residual dos 4 existentes remetido a
`SPEC-002` §6.3, cujo dono é `T-04.1` item (b) — e `CA-F4-5` exige os 9 eventos **intactos**, então o
"NÃO renomeados por esta SPEC" do `CLAUDE.md` é **verdadeiro**, não otimista); **coluna de contrato =
linha 11** (com dono nomeado: `ADR-008/D3`, *"reabri-la é ato daquela ADR"*); **segmento de URL = linha
12** (`⏸ NÃO DECIDIDO`, dono **owner**, `[Q2]`, com o custo de adiar escrito). **Nenhum buraco.**

**A fronteira de `T-04.1` está respeitada por antecipação:** o `/tech-lead` exigiu que a coluna de
contrato entre como *"prosa adjacente, NÃO como 13ª linha"*, porque uma 13ª faria `CA-F1-1` reprovar.
Ela é **linha 11 das 12 canônicas**, não uma 13ª ⇒ `CA-F1-1` continua medindo **12** ao fim de `04`.

### O rótulo da exceção — `[DECISÃO-OWNER]`, e está certo

```
$ awk '/^\| 9 \|/' CLAUDE.md | grep -c 'DECISÃO-OWNER'   → 1
$ awk '/^\| 9 \|/' CLAUDE.md | grep -c 'PREMISSA-OWNER'  → 0
```

Linha 9 **e** o bloco da exceção literal levam `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas
apresentadas]`, com o custo aceito transcrito. O `CLAUDE.md` **explica por que** não é `[PREMISSA-OWNER]`
(*"o owner escolheu uma opção de um menu que um agente redigiu"*), que é mais forte do que só usar o
rótulo certo. A **única** citação literal do owner aparece **uma vez**, sob `[PREMISSA-OWNER]`, íntegra:
*"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome dos
arquivos, var, tudo."* **`[OK]`**

> **⚠️ ACHADO HERDADO, e eu NÃO o cobro deste builder — mas ele agora está na constituição.** As linhas
> 1 e 3 rotulam `[PREMISSA-OWNER]` sobre **fragmentos** da citação, e a elipse da linha 1 —
> *"todo código gerado é em inglês … var, tudo"* — **emenda duas orações de sentido oposto**: `"var,
> tudo"` pertence à oração *"olhando no front, **ta tudo em portugues**, nome dos arquivos, var, tudo"*,
> que é a **queixa** do owner sobre o estado atual, não a **prescrição**. O mesmo vale para o `"nome dos
> arquivos", literal` da linha 3. **A decisão é certa** (nome de arquivo e var vão para o inglês, por
> *"todo código gerado é em inglês"*), **o rótulo da evidência é que promove queixa a ditado.**
> **Origem: `PRD-002` §3.1 `:98` e `:100`, verbatim** — e `CA-F1-1` exige a tabela **integral**, então
> corrigir aqui teria sido o builder editando um PRD aprovado por conta própria. **Ele fez o certo ao
> reproduzir.** Fica **escalado ao owner**, não cobrado da fase: o rótulo correto para as linhas 1 e 3
> seria `[INFERRED: aplicação de "todo código gerado é em inglês" a esta superfície]`, e `PRD-002` §24
> — que declara *"paráfrase vestida de citação já produziu defeito neste repositório"* — é a própria
> regra que a emenda contraria.

## 6. Bancada de mutação — n=7, **4 reprovam, 3 ESCAPAM**

A do builder (`M1`–`M5`, n=5) reproduz: as 5 reprovam, e são mutações reais. **Construí outra para achar
o que ela não cobre**, em cópia privada — a árvore do owner não foi tocada em nenhum momento.

| # | mutação | detector | esperado | sob mutação | |
|---|---|---|---|---|---|
| `N3` | 13ª linha na tabela | `CA-F1-1` | 12 | **13** | ✅ reprova |
| `N4` | dívida do `glossary_doc` apagada | `CA-F1-3` | 2 | **0** | ✅ reprova |
| `N5` | exceção copiada **verbatim** no `README` | `CA-F1-5`/2 | 0 | **1** | ✅ reprova |
| `N7` | acento removido da exceção | `CA-F1-2` | 1 | **0** | ✅ reprova |
| **`N1`** | **linha 10 revertida em silêncio para `⏸ NÃO DECIDIDO`** | `CA-F1-1`…`F1-9` | — | **12 · 1 · 2 — TODOS VERDES** | ❌ **ESCAPA** |
| **`N2`** | **linha 12 DECIDIDA por um agente**, fechando a pergunta do owner sem ele | `CA-F1-1`…`F1-9` | — | **12 · 1 · 2 — TODOS VERDES** | ❌ **ESCAPA** |
| **`N6`** | **exceção copiada no `README` PARAFRASEADA** (*"vocabulário de componentes e seus caminhos derivados permanecem em português"*) | `CA-F1-5`/2 | 0 | **0** | ❌ **ESCAPA** |

**Os três escapes são buracos dos CRITÉRIOS, não da entrega** — nenhum DoD desta fase os promete, e por
isso **nenhum reprova `T-01.1`–`T-01.3`**. Mas dois deles têm dono a jusante e um contradiz o que o
plano anuncia de si:

- **`N1` tem dono e é barato:** `CA-F4-1` (`T-04.1`) já é *"a linha 10 contém `[INFERRED:` e **não**
  contém o marcador de não-decidido"* — **exatamente o detector que falta**. Ele existe na fase `04` e
  não na `01`, então a linha 10 fica **três fases sem guarda**. Recomendo adotar `CA-F4-1` como
  verificação de regressão já a partir de `02`.
- **`N2` é o mais caro dos três e não tem dono:** `⏸ NÃO DECIDIDO` é uma pergunta **reservada ao owner**
  (`[Q2]`), e **nada mede que ela continue aberta**. Um agente que a "resolva" com boa intenção passa em
  todos os critérios da fase. O detector é simétrico ao de `N1` e cabe numa linha.
- **`N6` falsifica uma afirmação publicada do plano `01`:** `01_convencao_escrita.md:42` diz *"⚠️
  `CA-F1-5` sem a segunda metade seria satisfeita por copiar a tabela nos dois lugares. A metade `→ 0` é
  a que impede as duas verdades."* **A metade `→ 0` é `grep -F` de UMA frase literal — ela impede a
  cópia VERBATIM e não impede a cópia PARAFRASEADA**, que produz as mesmas duas verdades divergentes com
  custo idêntico. A conclusão do plano está certa e o argumento é mais fraco do que ele afirma.

## 7. Os dois desvios declarados pelo builder — JULGADOS, e os dois procedem

**Desvio 1 — o DoD de `T-01.3` manda conferir `SPEC_APPROVED`; o ledger diz `BUILD_AUTHORIZED`.**

```
$ harness pipeline state codigo-em-ingles
BUILD_AUTHORIZED
```

**PROCEDE.** `BUILD_AUTHORIZED` é **a jusante** de `SPEC_APPROVED` no mesmo caminho — o `approve spec`
de `2026-08-29T14:35:44Z` continua no ledger e é o que o DoD queria conferir. **O DoD envelheceu pelo
mesmo defeito que a task ataca** (texto que fixa um estado enquanto o ledger anda), o que é confirmação
e não coincidência. O builder **conferiu o ledger em vez de presumir o texto**, e escreveu os **dois**
estados no `SPEC-002` (`SPEC_APPROVED` + *"a feature já seguiu adiante — `BUILD_AUTHORIZED`"*), que é a
leitura que não envelhece de novo. **`[OK]`**

**Desvio 2 — a referência à `ADR-015` foi de `proposto` para `aceito` no `index.md` do plano.**

**PROCEDE, e ele NÃO foi além disso — conferido, não aceito de palavra:**

- `git diff --name-only origin/master...HEAD -- docs/adr` → **vazio**. `docs/adr` intocado.
- A `ADR-015` **já estava `aceito` na base**: `git show origin/master:docs/adr/ADR-015-….md` → `**Status:**
  `aceito` · **Aceita em** 2026-08-29 pelo owner`. Quem a mudou foi **`91aac55`**, que está **em
  `origin/master`**, com o ato registrado em `docs/INDEX.md` (linha `16:45Z`, *"DECISÃO 1 — `ADR-015`
  passa a `aceito`"*, `[DECISÃO-OWNER]`).
- ⇒ **o builder sincronizou uma REFERÊNCIA a um fato já consumado pelo owner**, que é precisamente o
  escopo de `T-01.3`. O `NÃO FAZ` da task — *"não muda o status da `ADR-015`"* — **está obedecido ao pé
  da letra**: ele não mudou status nenhum, mudou a menção.
- `git show --name-only 0053c3b` → **2 arquivos**, e as **2** linhas alteradas no `index.md` são a do
  `SPEC:` e a dos `ADRs:`. **Nenhuma decisão, nenhuma medição e nenhum corpo alterado.** Ele **não foi
  além.** **`[OK]`**

## 8. Observações que NÃO reprovam — âncoras de seção, e por que eu não as cobro

`T-01.2` renomeia o §título do `README` e cria um ponteiro novo. Medi as duas âncoras que isso move:

1. **`README.md:86` cita o título da seção do `CLAUDE.md` sem a marcação:** `grep -cF 'Idioma de
   identificador — a fronteira escrita, e ela é convenção, não portão' CLAUDE.md` → **0, `rc=1`**,
   porque o heading real (`CLAUDE.md:97`) é `## … e ela é **convenção, não portão**`. Resolve para um
   humano; **não resolve por `grep -F`**, num documento cuja tese é ser grepável.
2. **A afirmação do relatório de build de que a âncora antiga *"continua resolvendo"* é imprecisa.**
   O `grep -cF 'Idioma de docstring é convenção, não portão' README.md` → **1** é verdadeiro, mas a
   ocorrência sobrevivente é **`README.md:102`, dentro da nota de proveniência que o próprio builder
   escreveu** — **prosa de redirecionamento, não heading**. `backend/README.md:286` cita
   **`§"…"`** — um **título de seção** —, e esse título **deixou de existir**. Redirecionamento
   deliberado é solução legítima; a formulação exata seria *"a âncora antiga resolve por NOTA DE
   REDIRECIONAMENTO em `README.md:102`, não por heading"*.

**Por que isto é observação e não `FAIL`, e eu prefiro dizer o limite a inflar o achado:** conferi se
alguma regra em vigor as alcança e **nenhuma alcança**. `ADR-015/D1` tipa tokens em **`CAMINHO`** e
**`IDENTIFICADOR`** (`:93-95`) — **§título de seção não é nenhum dos dois**, e o escopo de `IDENTIFICADOR`
é explicitamente *"apenas diretórios de código"*. `RN-1` fala de *"caminho renomeado cujo comando
documentado não foi atualizado"* — aqui não há caminho nem comando. ⇒ **não há critério violado**, e
inventar um agora seria eu legislar dentro de um gate. Fica como dívida barata para quem editar o
`README` a seguir.

---

## Veredito

```
## QA Gate — Fase 01 [docs] · codigo-em-ingles
- [OK] core.relative-import · core.silent-except · core.print-statement · core.hardcoded-secret
       · web-fullstack.browser-imports-server · web-fullstack.tenant-from-request
       · web-fullstack.server-test-directory-present
       — harness rules --mode sweep → rc=0, 0 [BLOQUEIO], 1 [AVISO] (pré-existente)
- [OK] ADR-011/D1.10 (nenhuma [[rules.own]] de idioma) — os DOIS lados: git diff -- harness.toml
       → vazio e 0 ocorrências; diff de `rules list` antes(c7df90c)×depois(ec39b48) → VAZIO, 7 e 7;
       sha256 do harness.toml idêntico
- [OK] Testes existem e passam — make test (rc=0) → 107 passed; make lint rc=0; make setup rc=0
- [OK] Cobertura 100% (370 stmts · 54 branches · domain 124/124 · use_cases 52/52 · infra 194/194)
       contra alvo 70% global e 90/80/70 por camada — acima nas 4 medidas, e IDÊNTICA à linha de base
- [OK] DoD T-01.1 — CA-F1-1=12 · CA-F1-2=1 · CA-F1-3=2 · CA-F1-4 (2 lados) · CA-F1-8 vazio · CA-F1-9 rc=0
- [OK] DoD T-01.2 — CA-F1-5 metade1=5 E metade2=0 · CA-F1-7 = `1  0` (append-only)
- [OK] DoD T-01.3 — 2 arquivos · docs/adr vazio · backend/frontend vazio · só cabeçalho
- [OK] Conteúdo da tabela: 12/12 fiéis a PRD-002 §3.1; evento de log, coluna de contrato e segmento
       de URL cobertos como linhas 10, 11 e 12, todos com dono nomeado — NENHUM buraco
- [OK] Rótulo da exceção = [DECISÃO-OWNER], não [PREMISSA-OWNER] (linha 9: 1 e 0)
- [OK] Os 2 desvios declarados PROCEDEM e o builder não foi além deles
- [anomalia] 1ª tentativa do lado "antes" de D1.10: `git worktree add` → rc=128, medição DESCARTADA
             e refeita com HEAD conferido. Não entrou como evidência.
Regras bloqueantes avaliadas: 7 de 7 listadas por `harness rules list --severity block`
Veredito: APPROVED
```

**Escalado ao owner, sem reprovar a fase:** (a) a elipse de `PRD-002` §3.1 `:98` emenda duas orações de
sentido oposto sob `[PREMISSA-OWNER]` — herdado, agora na constituição; (b) `N1`/`N2` — as linhas 10 e 12
não têm detector de regressão antes da fase `04`, e `N2` fecharia uma pergunta reservada ao owner sem
que nada avisasse; (c) `N6` — a metade `→ 0` de `CA-F1-5` não impede cópia parafraseada, ao contrário do
que `01_convencao_escrita.md:42` afirma.

**Não executado por restrição do despacho:** `gate-record`, `tasks resolve`, merge, edição de
`tasks.toml`, Jira. **Nenhum código de produção tocado; a bancada de mutação rodou em cópia privada.**
