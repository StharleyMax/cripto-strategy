# Narrativa de review das tasks — `SPEC-002` · Código em inglês

**Feature:** `codigo-em-ingles` · **Data:** 2026-08-29 · **Autor:** `/tech-lead`
**Estado do ledger ao escrever:** `SPEC_APPROVED` `[MEDIDO 2026-08-29: harness pipeline state codigo-em-ingles → SPEC_APPROVED; 8 eventos, o approve spec em 14:35:44Z]`
**Rev de ancoragem de TODA medição minha:** **`master@7c3599b`** — e **não é `5f4ece0`**, que é a âncora da `SPEC-002` e dos 5 arquivos de plano. A diferença não é formal: ela move dois números do DoD. Ver §1.
**Insumos lidos:** `PRD-002` · `SPEC-002` · `ADR-013` (`aceito`) · `ADR-015` (`proposto`) · os 5 arquivos de `docs/plans/SPEC-002-codigo-em-ingles/` · `CLAUDE.md` · `docs/context/plataforma-dados/tasks.toml` (precedente de forma) · `scripts/tasks.sh` v0.13.0 (o validador) · `scripts/pipeline.sh` v0.13.0 (o portão de escopo)
**Glossário:** `harness policy --key glossary_doc` devolve **1 byte com `rc=0`** e `harness.toml` não tem a chave `[MEDIDO 2026-08-29]`. **Não existe glossário neste projeto e eu não li nenhum.** Dívida com dono em `ADR-013/D4`; nenhum critério destas tasks depende dela.
**Zero código escrito. Zero card criado. Ledger intocado.**

---

## 0. O veredito, em uma tela

**7 tasks, 4 fases, nenhuma delas com o critério *"o código está em inglês"*.** A `ADR-013/D2` mediu que idioma não é decidível por comando, e nenhuma task abaixo declara `[[rules.own]]` de idioma — isso reprovaria a fase por `ADR-011/D1.10`.

| fase | componente | classe | tasks | paralelizável com |
|---|---|---|---|---|
| `01` convenção escrita | `docs` | prospectivo | `T-01.1` · `T-01.2` · `T-01.3` | — |
| `02` retroativo `backend/tests` | `docs` + `sentimento` | retroativo | `T-02.1` | `03`, `04` |
| `03` retroativo `frontend/src` | `docs` + `web` | retroativo | `T-03.1` | `02`, `04` |
| `04` superfícies de contrato | `docs` | fronteira | `T-04.1` · `T-04.2` | `02`, `03` |

**E 6 achados que mudam o que o builder tem de fazer.** Quatro deles reprovariam uma task escrita por cópia do plano. Estão em §1–§6, cada um com o comando que o produziu.

**O que eu NÃO fiz, e por quê:** não declarei o escopo de caminhos da feature (§4 — o comando grava no ledger, e o coordenador proibiu), não criei card no Jira (instrução explícita do coordenador), não decidi o status da `ADR-015` (§5), não avancei o ledger.

---

## 1. `[G-A1]` não é risco futuro: **já aconteceu, e dentro dos números do DoD**

A `SPEC-002` §4.1 previu o auto-envenenamento e escreveu a regra que o evita (*"nenhum critério é uma contagem"*). Mas `ADR-015/D2` e `RN-8` **exigem** uma contagem — o `n` do lado MORDE, declarado antes do rename, para que um token de `n=0` não suma dentro do verde agregado. As duas obrigações convivem, e o ponto de atrito é exatamente onde a deriva bate.

**Medido, nos dois revs, com o mesmo comando e o mesmo escopo:**

```
$ git grep -h -F '<token>' <rev> -- harness.toml README.md backend/README.md \
      frontend/README.md docs/context backend/src backend/tests frontend/src | wc -l
```

| token | tipo (`ADR-015/D1`) | plano diz (`5f4ece0`) | **medido em `5f4ece0`** | **medido em `7c3599b`** |
|---|---|---|---|---|
| `Filtro.tsx` | CAMINHO | 8 | **8** ✔ | **12** ⚠ |
| `painel/` | CAMINHO | 17 | **17** ✔ | **19** ⚠ |
| `rotas.ts` | CAMINHO | 1 | **1** ✔ | **1** ✔ |
| `formatar-percentual.ts` | CAMINHO | 1 | **1** ✔ | **1** ✔ |
| `test_durabilidade_da_infra` | CAMINHO (escopo ampliado) | 4 | **4** ✔ | **4** ✔ |
| `test_etl_backlog_retomavel` | CAMINHO (escopo ampliado) | 3 | **3** ✔ | **3** ✔ |
| `configPainel` · `ROTAS` · `formatarPercentual` · `razao` · `casas` · `sinal` | IDENTIFICADOR | 1·2·1·3·2·2 | **1·2·1·3·2·2** ✔ | **1·2·1·3·2·2** ✔ |

`[MEDIDO 2026-08-29, n=12 tokens × 2 revs = 24 medições; escopo VIVO integral de `ADR-015/D1` para CAMINHO, escopo só-código para IDENTIFICADOR]`

**A causa é única e nomeável:**

```
$ git diff --name-only 5f4ece0..HEAD -- harness.toml README.md backend/README.md \
      frontend/README.md docs/context backend/src backend/tests frontend/src
docs/context/codigo-em-ingles/handoff_to_architect.md
```

**Um arquivo.** O handoff que o `/pm` escreveu **desta feature**, que cita `Filtro.tsx` em 4 linhas e `painel/` em 2. `git diff --stat 5f4ece0..HEAD -- backend frontend` é **vazio** — nenhuma linha de código mudou. **A deriva é 100% auto-envenenamento**, exatamente a classe que a `SPEC-002` §4.1 nomeou, materializada no intervalo entre o plano ser escrito e as tasks serem escritas.

> **⇒ E ela vai crescer de novo, por minha causa.** Este arquivo, o `tasks.toml` e o `handoff_to_builder.md` que eu entrego citam `Filtro.tsx` e `painel/`. **Um builder que rodar a medição depois de o meu PR mergear vai ver um número maior que 12 e 19.**

**A correção que eu aplico nas tasks, e ela preserva as duas obrigações:** o DoD **não congela o `n`**; ele manda o builder **re-medir e declarar** o `n` no rev em que ele trabalha, e exige duas coisas:

1. **`n > 0` por token, declarado ANTES do rename** — é isso que `RN-8` compra, e o valor absoluto é irrelevante para isso. Um `n = 0` reprova no ato.
2. **`n = 0` por token, DEPOIS do rename**, no mesmo escopo e com o mesmo comando.

Os números do plano viram **piso de sanidade, não alvo**: se o builder medir `Filtro.tsx < 8`, alguém já mexeu nas âncoras e a fase para. **Um DoD que exigisse literalmente `8` reprovaria hoje um builder correto.**

---

## 2. A tabela de MORDE está em **linhas**, e um builder que medir em **ocorrências** reprova um trabalho certo

Achei isto tentando reproduzir o `ROTAS = 2` do plano e obtendo `3`.

```
$ git grep -n -F 'ROTAS' -- backend/src backend/tests frontend/src
frontend/src/app/rotas.ts:14:export const ROTAS = {
frontend/src/app/rotas.ts:18:export type Rota = (typeof ROTAS)[keyof typeof ROTAS];
```

**2 linhas. 3 ocorrências** — a linha `:18` tem `ROTAS` duas vezes. `git grep -c` (linhas) devolve **2**, que é o número do plano; `git grep -o | wc -l` (ocorrências) devolve **3**.

`[MEDIDO 2026-08-29 em 7c3599b, n=1 token com discrepância entre as duas unidades]`

**Nem a `SPEC-002` §4.3 nem `ADR-015/D2` dizem qual unidade é.** A `ADR-015` escreve *"MORDE (n de **ocorrências**, `5f4ece0`)"* na tabela — e o número que ela publica ao lado (`ROTAS` = 2) é o de **linhas**. **O rótulo contradiz o valor.** É defeito de uma palavra, e ele custa uma reprovação falsa.

> **⇒ Toda task minha fixa a unidade no próprio comando, e o comando é `git grep -c` / `wc -l` sobre linhas.** Não é escolha estética: o lado CALA (`n = 0`) é idêntico nas duas unidades, então a unidade só importa no lado MORDE, e a tabela existente está em linhas. Alinhar ao que já foi publicado custa zero e evita reconciliar dois números depois.

---

## 3. As fases `02` e `03` **não têm diffs disjuntos** — `backend/README.md` está nas duas

O `index.md` do plano afirma: *"os diffs são **disjuntos** … **zero arquivo em comum**"*, e nomeia `docs/context/plataforma-dados/tasks.toml` como *"a única interseção"*, resolvendo-a com a medição de que `02` não o toca. **A medição está certa e a conclusão não** — o arquivo em comum é outro, e está enumerado nas listas VIVAS das duas fases.

```
$ grep -nE 'test_durabilidade_da_infra|test_etl_backlog_retomavel' backend/README.md
568: 569: 717: 743: 815:        # ← as 5 linhas VIVAS da fase 02

$ grep -n 'features/painel' backend/README.md
455: 457:                        # ← as 2 linhas VIVAS da fase 03
```

`[MEDIDO 2026-08-29 em 7c3599b: backend/README.md tem 5 linhas na lista VIVA de `02` e 2 na de `03` — o próprio plano as enumera nas duas fases, nas tabelas "As citações VIVAS"]`

**A contradição está dentro do plano:** `02_retroativo_backend_tests.md` lista `backend/README.md` (5 linhas) como VIVA; `03_retroativo_frontend.md` lista `backend/README.md` (`:455`, `:457`) como VIVA; e `index.md` diz que não há arquivo em comum.

**Qual é o dano real, medido e não temido:** as linhas estão a **~110 linhas de distância** (455/457 contra 568+). O `git merge` resolve hunks distantes no mesmo arquivo sem conflito. **Então o paralelismo continua seguro** — o que é falso é a *justificativa*, não a conclusão.

> **⇒ Por que isso ainda importa, e é a razão de eu não deixar passar:** a segunda fase a mergear **precisa de rebase** sobre `backend/README.md`, e o DoD de ambas mede `git diff --name-only master...`. Um builder que leu *"zero arquivo em comum"* e vê `backend/README.md` no próprio diff **não sabe se isso é esperado**. As duas tasks declaram o compartilhamento explicitamente, com as linhas de cada uma, e declaram que a colisão é de arquivo e **não de linha**.

---

## 4. O escopo de caminhos está **vazio**, e declará-lo hoje **arma uma colisão** que detona no `approve build`

Este é o achado mais caro, e ele é sobre o portão de escrita.

```
$ harness pipeline scope codigo-em-ingles list
                                         # ← 0 byte, rc=0. Nenhum prefixo declarado.
```

**E o portão hoje devolve verde pela feature errada:**

```
$ harness pipeline require-code frontend/src/features/painel/Filtro.tsx
[pipeline] código permitido (...) — feature 'plataforma-dados' (scope)
```

`[MEDIDO 2026-08-29, n=12 caminhos consultados]` · **9 dos 12 caminhos que esta feature precisa tocar já são reivindicados por `plataforma-dados`**, que está em `BUILD_AUTHORIZED`:

| caminho | quem reivindica hoje |
|---|---|
| `README.md` · `harness.toml` · `backend/README.md` · `frontend/README.md` | `plataforma-dados` |
| `backend/src/.../jsonl_checkpoint.py` · `frontend/src/.../Filtro.tsx` | `plataforma-dados` |
| `docs/context/plataforma-dados/tasks.toml` · `docs/specs/` · (`docs/plans/`, `docs/adr/`) | `plataforma-dados` |
| **`CLAUDE.md`** | **ninguém** |
| **`backend/tests/...`** | **ninguém** |
| **`docs/INDEX.md`** | **ninguém** |
| **`docs/context/codigo-em-ingles/`** | **ninguém** |

**Por que declarar o escopo "corretamente" seria o erro.** Lido no motor (`scripts/pipeline.sh:1036-1050`): colisão é *">1 feature **autorizada** reivindica o path"*, e `authorized_features()` é `>= BUILD_AUTHORIZED` (`:512-522`). Hoje `codigo-em-ingles` está em `SPEC_APPROVED`, logo **um escopo declarado agora é inerte**. Ele acorda **no instante do `approve build`** — e, se eu tiver acrescentado os 9 prefixos compartilhados, nesse instante:

```
COLISÃO DE ESCOPO: o path 'frontend/src/...' é reivindicado por >1 feature autorizada
(codigo-em-ingles, plataforma-dados).                                          # rc=1
```

> **⇒ Eu teria bloqueado os três builders de `plataforma-dados` que rodam agora, e o bloqueio apareceria no gate que o coordenador está indo buscar.** A colisão não seria descoberta por mim, e sim por um builder de outra trilha, depois.

**O segundo motivo de eu não executar, e ele é de autoridade:**

```
scripts/pipeline.sh:755
  append(feature, {"event": "scope", "op": "add", "actor": "owner", "paths": paths})
```

**`scope add` grava um evento no ledger, e o grava com `actor: "owner"`.** O coordenador escreveu *"não mexa no ledger"*. Um agente que rodasse isso escreveria no ledger um evento assinado como se fosse do owner. **Não rodei.**

**O que eu entrego no lugar: os 4 prefixos livres, prontos, e a decisão dos 9 disputados escalada.**

```
# SEGURO — nenhuma outra feature reivindica estes 4:
harness pipeline scope codigo-em-ingles add CLAUDE.md backend/tests docs/INDEX.md \
                                            docs/context/codigo-em-ingles
```

Para os 9 compartilhados há **três saídas, e a escolha é do owner/coordenador, não minha**:

| saída | custo | quem decide |
|---|---|---|
| **(a) não declarar** — deixar o verde vir de `plataforma-dados` | é o estado de hoje; funciona, mas o portão atribui a autorização à feature errada e ninguém é avisado | coordenador |
| **(b) `plataforma-dados` estreita o escopo dela** | ato sobre uma feature em execução, com 3 builders vivos — caro e arriscado agora | owner |
| **(c) `override` scoped em `codigo-em-ingles`** | resolve a colisão a favor dela (`pipeline.sh:1038-1044`), fica logado no `stderr`, e `harness status` já mostra overrides como anomalia | owner |

**Minha recomendação, com o rótulo:** **(a) agora, (c) se e quando um builder for barrado** `[INFERRED: (b) mexe numa feature com trabalho em voo e (c) gasta um escape que o dashboard sinaliza; (a) não muda nada do comportamento de hoje e mantém a decisão reversível]`. **`[NÃO SEI]` se o owner prefere pagar (b) para ter atribuição correta no portão** — é decisão de governança, não medição.

---

## 5. A dívida de status: três documentos contradizem o ledger, e **duas** delas eu trato

`CLAUDE.md` é explícito — *"o ledger é a identidade do estado, não o texto do documento"*. Isso resolve **quem tem razão**, não **o que fazer com o texto errado**.

| documento | diz | ledger diz | é decidível? |
|---|---|---|---|
| `docs/specs/SPEC-002-codigo-em-ingles.md:3` | `Status: DRAFT` | `SPEC_APPROVED` desde `14:35:45Z` | **sim** |
| `docs/plans/SPEC-002-codigo-em-ingles/index.md:3` | *"(`DRAFT` — `SPEC_APPROVED` é gate do owner)"* | idem | **sim** |
| `docs/adr/ADR-015-...md:3` | `Status: proposto` | — (ADR não tem estado no ledger) | **não** |

**As duas primeiras são sincronização, não decisão**, e é o próprio texto da `SPEC-002` que autoriza: ele diz *"**é DRAFT porque o ledger diz DRAFT**"*. O ledger deixou de dizer isso. Aplicar a regra que o documento escreveu sobre si mesmo é a leitura correta, e o evento (`approve spec`, com o motivo escrito, `2026-08-29T14:35:44Z`) é a evidência citável. **`T-01.3` faz isso, e cita o evento.**

**A terceira eu não decido, e digo por quê.** Status de ADR não vive no ledger — a `ADR-013` foi de `proposto` a `aceito` por **ato registrado em `docs/INDEX.md`**, com as respostas do owner na mão. Não existe evento equivalente para a `ADR-015`. E o incômodo é real: **`ADR-015/D1` e `/D2` são normativas dentro de DoDs de uma SPEC aprovada** (`CA-F2-4`, `CA-F3-4` citam-nas), ou seja, uma ADR `proposto` já está gateando trabalho.

> **⇒ Vai ao owner como item de decisão, não como task.** `T-01.3` **explicitamente não toca a `ADR-015`**, e o DoD dela mede isso (`git diff --name-only master... -- docs/adr` → vazio). Um agente que "aproveitasse para arrumar" estaria aceitando uma ADR em nome do owner.

---

## 6. Três achados menores que ainda assim mudam um comando ou uma linha

### 6.1 O shell é `zsh`, e ele **não faz word-splitting** — a primeira medição minha saiu zerada por isso

```
$ VIVO="harness.toml README.md backend/src ..." ; git grep -o -F 'Filtro.tsx' -- $VIVO | wc -l
0        # ← em zsh, $VIVO é UM pathspec, e ele não casa nada
$ git grep -o -F 'Filtro.tsx' -- harness.toml README.md backend/src ... | wc -l
13
```

`[MEDIDO 2026-08-29: n=1 comando, dois shells de semântica diferente sobre a MESMA linha]` · **Um `0` que significa *"o comando não mediu"*, vestido de `rc=0` e de "nenhuma âncora sobrou".** É o terceiro significado de `rc=0` que a `ADR-012` nomeia, desta vez produzido pelo shell.

> **⇒ Nenhum DoD meu passa lista de caminho por variável.** Os prefixos vão literais no comando. Custa uma linha mais longa e remove uma classe inteira de falso-verde.

### 6.2 A tabela de fronteira tem **12 linhas** em `CA-F1-1`, e a fase `04` edita a mesma tabela

`CA-F1-1` exige **12 linhas de tabela**. O item `4.2` da fase `04` manda escrever a coluna de contrato (`janela_de_perda`) como exceção com dono e gatilho, **no `CLAUDE.md`**. Se `04` acrescentar uma 13ª linha à tabela, `CA-F1-1` — se re-medida — passa a reprovar sobre um `CLAUDE.md` correto.

> **⇒ `T-04.1` declara na fronteira: a coluna de contrato entra como **prosa adjacente**, não como linha 13 da tabela.** `CA-F4-2` já mede por três `grep -F` e nunca contou linhas, então nada se perde. **`[NÃO SEI]` se o `/architect` pretendia 13 linhas** — a `SPEC-002` §8 diz *"esta linha esteja escrita no `CLAUDE.md`"* sem dizer onde. Escolhi a leitura que não quebra um critério já escrito.

### 6.3 Tensão VIVA × HISTÓRICA em `docs/context/plataforma-dados/tasks.toml:133`

A `SPEC-002` §4.2 classifica `docs/context/…/tasks.toml` como **VIVA**, integralmente. Mas a linha que cita `Filtro.tsx` é um `refs` da `T-01.2`, que está `done`:

> *"O ESLint DO PROJETO … tem de ACUSAR `tipos.ts` …, CALAR em `config.ts` … e CALAR em **`Filtro.tsx`** … Universo: 3 arquivos / 4 linhas / 2 violações reais / 2 usos legítimos."*

**É o registro de um DoD já cumprido, cujos vereditos de `/qa` e `/review` foram dados sobre o nome `Filtro.tsx`** — estruturalmente idêntico ao argumento com que `ADR-015/D3` moveu `docs/plans/SPEC-001-.../01_governanca_gateante.md` de VIVA para HISTÓRICA.

> **⇒ Eu aplico a `SPEC-002` como escrita (VIVA, atualiza) e registro a tensão em vez de decidir contra uma SPEC aprovada.** O critério da `ADR-015/D3` (*"VIVA é a citação que uma obrigação EM VIGOR manda alguém re-executar"*) aponta para HISTÓRICA aqui, e o critério da `SPEC-002` (arquivo inteiro) aponta para VIVA. **A SPEC é normativa e aprovada; a `ADR-015` está `proposto` (§5).** Se o owner aceitar a `ADR-015`, esta linha muda de lado — e é mais um motivo para §5 não ficar aberta.

---

## 7. A quebra, task a task

### Por que a granularidade não segue a contagem de itens do plano

O precedente de `plataforma-dados` é ~1 task por 1–2 itens de plano. **Aqui isso produziria tasks que colidem na mesma seção do mesmo arquivo.** Os itens `1.1`–`1.5` são cinco obrigações sobre **uma seção de um arquivo** (`CLAUDE.md`); cinco tasks disputariam as mesmas linhas.

**A unidade que eu uso é a atomicidade do artefato**, e ela tem apoio medido no próprio plano, para as fases retroativas: *"Fragmentar multiplica o risco de rename não-atômico, que é o único risco real desta feature"* (`RN-1`: caminho renomeado cujo comando documentado não foi atualizado devolve `rc=0` e 0 byte — indistinguível de "avaliado e limpo"). **Estendo o mesmo raciocínio à fase `01`:** a propriedade que `CA-F1-5` compra é *"não existem duas verdades"*, e duas tasks que escrevam doutrina em paralelo são o modo mais direto de produzir duas verdades.

**Onde eu SEPAREI, e o motivo em cada caso:** arquivos diferentes, DoD auto-contido, e um deliverable que seria engolido por uma task grande.

---

### Fase `01` · `docs` · prospectivo — 3 tasks

#### `T-01.1` — `[docs]` · A seção normativa no `CLAUDE.md`

**Escopo:** uma seção nova em `CLAUDE.md`, adjacente a *"Vocabulário fechado de componentes"* (`:70`). Itens `1.1`–`1.5` do plano.
**Entrega:** a regra em uma linha · a **tabela de fronteira de 12 linhas** de `PRD-002` §3.1, integral · a exceção do vocabulário **literal e grepável** com o rótulo `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` · a frase *"idioma de identificador é convenção, não portão"* **com o gatilho de reabertura** de `ADR-013/D2e` · **linha 10 resolvida** (evento de log e chave de `extra={}` nascem em inglês, rótulo `[INFERRED: …]`, e a nota de que os 4 existentes NÃO são renomeados) · **linha 12 permanece `⏸ NÃO DECIDIDO`** com o dono (**owner**).
**DoD:** `CA-F1-1`, `CA-F1-2`, `CA-F1-3`, `CA-F1-4`, `CA-F1-8`, `CA-F1-9`.
**Não faz:** não toca `README.md` (é `T-01.2`), não toca nada sob `backend/` ou `frontend/` (`CA-F1-8` mede), não declara `[[rules.own]]` (`CA-F1-4` mede nos dois lados).
**Dependências:** nenhuma.

#### `T-01.2` — `[docs]` · O ponteiro no `README.md`, **sem cópia**, e a linha em `docs/INDEX.md`

**Escopo:** `README.md` da raiz (§*"Idioma de docstring é convenção, não portão"*, `:83`) e `docs/INDEX.md`. Itens `1.6` e `1.7`.
**Entrega:** o título generaliza para **idioma de identificador**, o corpo **aponta** para `CLAUDE.md` · **uma linha nova** em `docs/INDEX.md` registrando a convenção e a correção de uma linha da tabela da `ADR-013` (`ADR-015/D3`).
**DoD:** `CA-F1-5` (**as duas metades**: `grep -c 'CLAUDE.md' README.md` ≥ 1 **e** `grep -cF '<a frase literal da exceção>' README.md` → **0**) · `CA-F1-7` (`git diff --numstat master... -- docs/INDEX.md` → **`N  0`**; **qualquer linha removida reprova**).
**Por que é task separada de `T-01.1`, e não é arrumação:** a metade `→ 0` de `CA-F1-5` é a única coisa que impede as duas verdades, e ela é a mais fácil de perder dentro de uma task cujo trabalho principal é *escrever a tabela*. **Como deliverable próprio, "não copiar" tem DoD, dono e revisor.** Arquivos diferentes de `T-01.1` ⇒ zero conflito de linha.
**Dependências:** `T-01.1` (o ponteiro aponta para uma seção que precisa existir).

#### `T-01.3` — `[docs]` · A dívida de status: `SPEC-002` e o `index.md` do plano dizem `DRAFT`; o ledger diz `SPEC_APPROVED`

**Escopo:** os **cabeçalhos** de `docs/specs/SPEC-002-codigo-em-ingles.md` e `docs/plans/SPEC-002-codigo-em-ingles/index.md`. Nada mais.
**Entrega:** o `Status:` passa a `SPEC_APPROVED` **citando o evento do ledger** (`approve spec`, `2026-08-29T14:35:44Z`) como evidência, no formato `[MEDIDO 2026-08-29: harness pipeline show codigo-em-ingles]`.
**DoD:** `git diff --name-only master... ` devolve **exatamente 2 arquivos** · `harness pipeline state codigo-em-ingles` → `SPEC_APPROVED` (a evidência citada é conferida, não presumida) · `git diff --name-only master... -- docs/adr` → **vazio** (a `ADR-015` NÃO é tocada) · `git diff --name-only master... -- backend frontend` → **vazio** · **nenhum corpo de documento alterado**: o diff toca só as linhas de cabeçalho.
**Não faz:** **não muda o status da `ADR-015`** (§5 — é decisão de owner, não sincronização) e não reescreve nenhuma decisão dos dois documentos.
**Dependências:** nenhuma. **Não é pré-requisito de `02`/`03`** — é dívida de documento, não de fronteira.

---

### Fase `02` · `docs` + `sentimento` · retroativo — 1 task

#### `T-02.1` — `[docs][sentimento]` · Os 2 arquivos, os 40 identificadores e as 3 citações VIVAS, **atômico**

**Por que UMA task para a fase inteira:** o plano decide isso com argumento medido, e eu concordo — *"2 + 4 arquivos, 49 identificadores, diff revisável por inteiro. Fragmentar multiplica o risco de rename não-atômico, que é o único risco real desta feature."* **`RN-1` exige que o rename e as citações vivas estejam no mesmo commit**; duas tasks tornariam a violação de `RN-1` o caminho de menor resistência.

**Escopo:** `git mv` dos 2 arquivos (mapa normativo de `SPEC-002` §3.1) · os **40 identificadores** (mapa fechado, sem reticências) · as **3 citações VIVAS**, no mesmo commit.
**As 3 VIVAS, enumeradas — para copiar, não resumir:** `backend/README.md` (`:568`, `:569`, `:717`, `:743`, `:815`) · `backend/src/modules/sentimento/infra/jsonl_checkpoint.py:22` (docstring de produção — **a única linha de `backend/src` que esta fase toca**) · `backend/tests/sentimento/test_resumable_etl_backlog.py` (citação cruzada entre os 2 arquivos).
**A HISTÓRICA, e ela NÃO se toca:** `docs/INDEX.md` — **append-only por `CLAUDE.md`**.
**DoD:** `CA-F2-1` … `CA-F2-9`, com **duas emendas minhas**:
- **`CA-F2-4` re-medido, não congelado** (§1): o builder mede `test_durabilidade_da_infra` e `test_etl_backlog_retomavel` **no rev dele**, declara `n > 0` por token **antes**, e exige `0` por token **depois**. Os valores do plano (**4** e **3**) entram como piso de sanidade. **Unidade: linhas** (§2).
- **`backend/README.md` é compartilhado com `T-03.1`** (§3) — arquivo em comum, **linhas disjuntas** (`:568+` aqui, `:455`/`:457` lá). Esperado no diff; **não é sinal de erro**, e a segunda fase a mergear rebaseia.
**A âncora de "não quebrei nada", conferida por mim em `7c3599b`:** `make test` → **107 passed · 370 statements · 54 branches · domain 124/124 · use_cases 52/52 · infra 194/194 · 100%**. `[MEDIDO 2026-08-29 em 7c3599b, worktree com .venv após make setup]` — **idêntica à congelada pelo `/architect` em `5f4ece0`.** `CA-F2-3` reprova **qualquer** divergência, inclusive para mais. **`rc=3` é "não mediu", não "passou".**
**Não faz:** `backend/tests/sentimento/` **não muda de nome** (`RN-7`, exceção do vocabulário — `CA-F2-5` mede os dois lados) · nenhum evento de log renomeado (`CA-F2-9`: **9** eventos, os **4** portugueses intactos) · nenhuma HISTÓRICA tocada.
**Componentes `["docs","sentimento"]` e não só `sentimento`:** a task escreve `backend/README.md`, que é superfície de `docs`. **Precedente medido:** a `T-01.1` de `plataforma-dados` foi corrigida por `/review` exatamente por isto, e `ADR-003:11-13` diz *"componente omitido é componente sem dono de julgamento"*. O prefixo do título acompanha no mesmo ato — `V-26` compara o **conjunto** de colchetes iniciais com `components` (`scripts/tasks.sh:887-891`) e sai `WARN` se só um dos dois mudar.
**Dependências:** `T-01.1`, `T-01.2` (a fronteira declarada — `ADR-013/D1`: renomear antes disso é renomear duas vezes).
**Paraleliza com:** `T-03.1`, `T-04.1`, `T-04.2`.

---

### Fase `03` · `docs` + `web` · retroativo — 1 task

#### `T-03.1` — `[docs][web]` · 4 arquivos + 1 diretório, com a prova de dois lados re-executada **DEPOIS**

**Por que UMA task, mesmo sendo a maior:** `harness.toml:149` é a metade **CALA** da prova de dois lados que fez o ESLint substituir duas `[[rules.own]]` de TS na `T-01.2`. **Renomear `Filtro.tsx` sem consertar a citação no mesmo commit converte a prova em `rc=0` por caminho inexistente — conformidade falsa**, e `harness code-paths classify` **não pega isso** (`SPEC-002` §0.4: ele é cego à existência do arquivo). Separar o rename da correção da prova é criar exatamente esse commit intermediário.

**Escopo:** `git mv` dos 4 arquivos e do diretório (mapa normativo de `SPEC-002` §3.2) · os **10 identificadores** · as citações VIVAS, atômico · a sonda documentada de `harness.toml:238-252` passa a `Filter.test.tsx` **e é re-medida** · a prova de dois lados de `ADR-011/D4` re-executada **depois**, nos **quatro** casos.
**As VIVAS (5 arquivos) — para copiar, não resumir:** `harness.toml` (**5 linhas** com `features/painel`, **incluindo as 4 de `serie.tsx`**, que continua sendo caminho hipotético, plantado por `printf` e removido por `rm`) · `frontend/README.md` (`:33`, `:85-86`, `:118-121`, `:250`, `:253`, `:381`) · `backend/README.md` (`:455`, `:457`) · `docs/context/plataforma-dados/tasks.toml` (`:133`, `:234` — ver §6.3) · `docs/context/plataforma-dados/handoff_to_builder.md`.
**As HISTÓRICAS (6) — NÃO se tocam:** `docs/INDEX.md` · `ADR-003` · `ADR-011` · `ADR-012` · `ADR-013` · `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md`.
**⛔ TRÊS coisas que NÃO mudam — omitir qualquer uma reprova a fase:**
1. **`<p>Filtro: any resultado serve</p>` fica literal.** A palavra `Filtro` **sobrevive dentro da string, e isso é o resultado CORRETO** — a evidência é a posição sintática do token `any` (`JSXText`), não o nome do arquivo. `CA-F3-2` mede por `grep -F` de **igualdade**, não por ausência.
2. **`{ retry: 3, any: true }` fica literal** — a outra metade da bancada `D1.3b`.
3. **O valor `"/painel"` fica em português.** O arquivo conterá **`panel: "/painel"`**, **mista de propósito** (`[Q2]` é do owner). **Um builder que "arrumar" isso reprova a fase** — `CA-F3-8` mede.
**E uma quarta, que eu acrescento porque está dentro de uma VIVA:** em `frontend/README.md:250`, a célula `` `Filtro.tsx` `` (**caminho**) atualiza, e o payload `` `<p>Filtro: any resultado serve</p>` `` na mesma linha **não** — `RN-3`: renomear o continente é permitido; traduzir o conteúdo citado, não. **Uma linha, duas regras opostas.**
**DoD:** `CA-F3-1` … `CA-F3-9`, com as mesmas duas emendas de `T-02.1` (`n` re-medido §1; unidade em linhas §2) e mais uma:
- **`CA-F3-6` é de TRÊS lados e os três são obrigatórios** (`SPEC-002` §4.4): `test -f` nos 4 **novos** → `rc=0`; `test -f` nos 4 **antigos** → **`rc=1`**; **só então** `classify` nos 4 novos → `producao`. **Sem o passo (2) o critério é vácuo** — reproduzi o defeito do instrumento: `classify` devolve `producao`/`rc=0` para caminho inexistente `[MEDIDO 2026-08-29, n=3 caminhos, 2 inexistentes]`.
- **`CA-F3-3` medido ANTES do rename não conta**, mesmo com todos os comandos verdes.
**Não faz:** não cria `Filter.test.tsx` nem fecha o aviso `browser-test-file-present` (**baseline conferida em `7c3599b`: `harness rules --mode sweep` → 1 `[AVISO]`, 0 `[BLOQUEIO]`, `rc=0`** — e continua 1 depois) · não toca `backend/` exceto `backend/README.md`.
**Componentes `["docs","web"]`:** `frontend/src` é `web` (dono de julgamento: `ui-designer` + `design_gate`, `harness policy --key agents.by_component`); `harness.toml`, os dois `README` e `docs/context/` são `docs`.
**Dependências:** `T-01.1`, `T-01.2`.
**Paraleliza com:** `T-02.1`, `T-04.1`, `T-04.2`.

---

### Fase `04` · `docs` · fronteira — 2 tasks · **zero linha de código**

#### `T-04.1` — `[docs]` · As três superfícies de contrato ganham dono no `CLAUDE.md`

**Escopo:** `CLAUDE.md`. Itens `4.1`, `4.2`, `4.3`.
**Entrega:** **linha 10** deixa de ser `⏸` e ganha a **regra condicional de migração** dos 4 eventos existentes (as três metades: prospectivo · os 4 existentes **não** renomeados por esta SPEC · a tabela de resposta do owner, incluindo *"sem resposta ⇒ nada acontece e nada trava"*) · a **coluna de contrato** `janela_de_perda` vira exceção **com dono e gatilho nomeado** (`ADR-008/D3`, reaberta quando `T-07.12`/`T-07.13` escrever o consumidor da projeção) · **linha 12 continua `⏸ NÃO DECIDIDO`** com o dono (**owner**) e o custo de adiar escrito.
**DoD:** `CA-F4-1`, `CA-F4-2`, `CA-F4-3`, `CA-F4-4`, `CA-F4-5`, `CA-F4-7`, **mais a fronteira de §6.2**: a coluna de contrato entra como **prosa adjacente à tabela**, e a tabela de fronteira **continua com 12 linhas** — `CA-F1-1` re-medida ao fim de `04` tem de continuar devolvendo **12**.
**Não faz:** nenhuma renomeação (`CA-F4-4`: `git diff --name-only master... -- backend frontend` → **vazio**, e é o lado que prova que a fase entregou texto) · nenhum dos 9 eventos tocado (`CA-F4-5`).
**Dependências:** `T-01.1` (edita a mesma tabela e a mesma linha 10).

#### `T-04.2` — `[docs]` · A pergunta **factual** ao owner sobre consumidor de log

**Escopo:** um arquivo em `docs/context/codigo-em-ingles/`. Item `4.4`.
**Entrega:** a pergunta escrita **como fato, não como escolha de idioma**: *"alguma query, alerta, dashboard ou script **fora deste repositório** consulta os nomes `etl_item_publicado`, `etl_item_concluido`, `etl_drenagem_concluida`, `checkpoint_cauda_truncada`, ou as chaves `destino`, `processados`, `janela`, `bytes_descartados`?"* — **sim ou não**, e **nenhuma das duas respostas bloqueia qualquer fase**. Acompanha o que foi medido e o que **não** foi: `git ls-files | grep -icE 'dashboard|alert|grafana|prometheus|loki|logql'` → **0** `[MEDIDO]`, e **isso não prova ausência de consumidor** — `ingest_health_cli.py:69` diz em docstring que *"a scheduler or a supervisor calls `logging.basicConfig(...)`"*, ou seja o desenho **antecipa** um hospedeiro externo `[NÃO MEDIDO]`.
**DoD:** `CA-F4-6`.
**Por que é task separada de `T-04.1`:** arquivo diferente, **audiência diferente** (o owner, não o builder), e é o deliverable mais fácil de ser engolido por uma task cujo trabalho principal é editar o `CLAUDE.md`. **A superfície de log divergiu justamente por não ter dono declarado** (`docs/INDEX.md:68`: *"a divergência é decisão de leitura do agente, não citação do owner"*) — repetir o padrão de escondê-la dentro de outra entrega seria irônico.
**Dependências:** nenhuma. A pergunta não depende do `CLAUDE.md`; declarar uma aresta falsa é pior que não declarar.

---

## 8. O grafo, e a confirmação do paralelismo

```
T-01.1 ──┬──> T-01.2 ──┬──> T-02.1   [docs][sentimento]  ┐
         │             │                                  ├─ paralelas
         │             └──> T-03.1   [docs][web]         ┘
         └──> T-04.1   [docs]
T-01.3   (independente)
T-04.2   (independente)
```

**`02` × `03` paralelizam — confirmado, com a ressalva de §3.** Componentes diferentes (`sentimento` × `web`), diretórios de código disjuntos (`backend/tests` × `frontend/src`), **e um arquivo em comum que o `index.md` negava**: `backend/README.md`, em linhas separadas por ~110 linhas. `docs/context/plataforma-dados/tasks.toml` **não** é interseção — `02` não o toca `[MEDIDO 2026-08-29: grep -E 'test_durabilidade_da_infra|test_etl_backlog_retomavel' docs/context/plataforma-dados/tasks.toml → 0 linhas]`.

**`04` paralela com `02` e `03`:** `CLAUDE.md` e `docs/context/` não são tocados por nenhuma das duas.

---

## 9. Tracker — **nenhum card criado, e a marcação diz exatamente isso**

`harness policy --key tracker` → `{"kind": "jira", "project": "CST", "board_id": "36", "parent_kind": "Epic", "child_kind": "Tarefa"}` `[MEDIDO 2026-08-29]`. **O tracker existe e está configurado.** Não criei card por **instrução explícita do coordenador**: ele carda depois de o owner aprovar o `build`.

**Como isso está marcado no `tasks.toml`, e por que NÃO é `local_only`:**

| marcação | o que significa | é o nosso caso? |
|---|---|---|
| `tracker = { ... }` | cardou | **não** — não há id, e inventar um seria pior que não ter |
| `local_only = true` + `local_reason` | o owner decidiu **não** cardar, **nunca** | **não** — a decisão é *cardar depois*, não *não cardar* |
| **sem marcação** + declaração no handoff | pendência **consciente** de sincronização | **sim** |

**Um marcador que colapse "decidi" e "vou fazer depois" faz o segundo nunca chamar atenção.** As 7 tasks saem **sem `tracker` e sem `local_only`**, e a pendência está escrita no cabeçalho do `tasks.toml` **com data e motivo** e repetida no `handoff_to_builder.md`. **Recuperável por comando:** `harness tasks json codigo-em-ingles | grep -c tracker` → **0**.

**O que deveria ser cardado, quando o coordenador cardar:** 1 Epic (`codigo-em-ingles`) + 7 `Tarefa`, com os títulos exatos do `tasks.toml`, em `CST`. A lista está no `handoff_to_builder.md`.

---

## 10. O que eu não sei, dito

- **`[NÃO SEI]` se o owner quer pagar o custo de (b) em §4** — estreitar o escopo de `plataforma-dados`, que tem 3 builders em voo, para que o portão atribua a autorização à feature certa. É governança, não medição, e recomendei (a) com rótulo `[INFERRED]`.
- **`[NÃO SEI]` se a `ADR-015` deve passar a `aceito`** (§5). Ela está `proposto` e já é normativa dentro de DoDs de uma SPEC aprovada. Não decido em nome do owner.
- **`[NÃO SEI]` se o `/architect` pretendia 13 linhas na tabela de fronteira** depois de `04` (§6.2). Escolhi a leitura que não quebra `CA-F1-1`, e declarei a escolha.
- **`[NÃO MEDIDO]`: não estimei duração de nenhuma task.** Não tenho base histórica para renomeação neste repositório e não vou fabricar uma.
- **`[NÃO MEDIDO]`: não rodei `make lint`/`test` depois de nenhuma renomeação** — nada foi renomeado. A linha de base de `7c3599b` é o **antes**; o **depois** é obrigação do builder.
- **Não li glossário nenhum, porque não existe** (cabeçalho). `ADR-013/D4` tem o dono.

---

## 11. O que reprova qualquer task desta feature, sem apelação

Adotado integral do `index.md` do plano, mais um item meu:

1. **`rc=3` tratado como verde.** Sem `.venv`, `make lint`/`test`/`boundaries` recusam com `rc=3` = **"não mediu"**.
2. **Um `rc` de `harness rules --mode file` citado sem o `test -f` que o precede** (`RN-5`) — e **o `classify` não é rede do `test -f`** (`SPEC-002` §0.4).
3. **Uma linha existente de `docs/INDEX.md` reescrita** (`CLAUDE.md`, append-only).
4. **Uma `[[rules.own]]` de idioma declarada** (`ADR-011/D1.10`).
5. **Um número afirmado sem o comando, o universo (`n`) e o rótulo.** **`[PREMISSA-OWNER]` é exclusivamente citação literal do owner.**
6. **`Co-Authored-By:` em qualquer commit**, ou autor/committer diferente de `Stharley Maxwell <stharleymax@gmail.com>`. **`core.hooksPath` é proibido.**
7. **(meu, §6.1) Lista de caminho passada por variável de shell num DoD.** O shell aqui é `zsh`; a variável não se divide e o comando devolve `0` sem ter medido.

---

## 12. O que eu peço ao owner

**Aprovar esta narrativa** (`harness pipeline approve codigo-em-ingles tasks`) e, junto, **três decisões que eu não tomei**:

| # | decisão | onde | se não decidir |
|---|---|---|---|
| **A** | escopo de caminhos: (a) não declarar · (b) estreitar `plataforma-dados` · (c) `override` scoped | §4 | fica (a), que é o comportamento de hoje. **Nada trava** |
| **B** | `ADR-015` passa a `aceito`? | §5 | fica `proposto`, e uma ADR proposta segue gateando DoDs de uma SPEC aprovada |
| **C** | existe consumidor externo dos 4 eventos de log? (**fato, não escolha**) | `T-04.2` | **nada trava.** `F1` escreve a regra prospectiva e a divergência para de crescer |

**Nenhuma das três bloqueia nenhuma task.** É por isso que as 7 saem `todo` e não `blocked`.

---

# ADENDO pós-`/qa` retroativo das fases `01`–`03` — 2026-08-29

Fonte: [`gates/fases-01-03-retroativo.md`](gates/fases-01-03-retroativo.md). **`01` e `03` passaram e estão
no ledger; `02` reprovou nos PRÓPRIOS CRITÉRIOS, não na árvore** — `R067`+`R063`, `CA-F2-5` medida dos dois
lados, `CA-F2-7` vazio, `backend/src` = 2 linhas de docstring. **Nada aqui toca código de produção ou de
teste, e nada aqui grava gate.**

## 13. As três erratas de `T-02.1` — o que mudou, e por que nenhuma é conveniência

| # | critério | era | passa a ser | por quê, em uma linha |
|---|---|---|---|---|
| **1** | `CA-F2-3` | *"o critério que impede a renomeação de virar reescrita"*, com falsificador `docstring / noqa / asserção` | **linha de base de suíte, e só isso** — o falsificador sai | ele reprovava **0 de 3** |
| **2** | `CA-F2-2` (b) | `ligados_distintos` = **15 e 55** | **15 e 54**, com a prova de conjunto | o mapa de `SPEC-002` §3.1 **não é injetivo** |
| **3** | `CA-F2-2` (a) | `x in PT or x.startswith("test_")` | `x in PT40`, **lista fechada dos 40**, sem `startswith` | como estava, só era satisfeita **apagando a suíte** |

### 13.1 A errata do `55` é sobre o MAPA, não sobre esta entrega

`processo` (variável local do `Popen`) e `process` (método) são **dois** nomes ligados no ANTES e **um** no
DEPOIS: o mapa manda `processo`→`process` e `process` **já existia**. **55 − 1 = 54.** A prova que eu rodei
não é uma contagem — é igualdade de conjuntos, e ela fecha nos dois arquivos:

```
$ backend/.venv/bin/python   # ast: Name(Store) ∪ arg ∪ {FunctionDef, AsyncFunctionDef, ClassDef}
test_infrastructure_durability.py   ANTES= 15  DEPOIS= 15  em_PT40_DEPOIS=0   colisoes=[]
test_resumable_etl_backlog.py       ANTES= 55  DEPOIS= 54  em_PT40_DEPOIS=0
                                    imagem(ANTES)−DEPOIS=[]   DEPOIS−imagem(ANTES)=[]
                                    colisoes=[('process', ['processo', 'process'])]
```

`[MEDIDO 2026-08-29 em 75026ff pelo /tech-lead, n=2 arquivos]`. **Um DoD escrito sobre um mapa não-injetivo
reprova um builder correto** — e o `54` não é exceção casuística concedida a esta entrega: é a **imagem do
mapa**, que é o mesmo objeto que o DoD manda observar. **Precedente idêntico e já resolvido nesta trilha:**
a `T-02.3` de `plataforma-dados` exigia 55 renomeações e o correto era 54, pelo mesmo motivo.

`02_retroativo_backend_tests.md:39` e `PRD-002` §6/`CA-U2-2` repetem o `55` e **herdam** esta errata.
**Corrigi-los é ato do `/architect`, não meu** — eu não edito SPEC nem PRD.

### 13.2 `CA-F2-3'` — e eu **não aceitei o `3/3` de palavra**

A causa-raiz do `0 de 3` é uma linha: `backend/scripts/test.sh:41` roda `--cov=src`, então **`backend/tests`
contribui ZERO statement** e toda mutação dentro do corpo de um teste é invisível ao número **por
construção** — que é exatamente a superfície que a fase `02` reescreveu. `--cov=tests/sentimento` fecharia
`M1`/`M2` e **não** `M3`: comentário não é statement.

`CA-F2-3'` é **igualdade de fluxo de tokens módulo o mapa fechado** — e igualdade não se satisfaz apagando
nada, porque apagar **cria** divergência. Instrumento versionado em
[`gates/CA-F2-3-linha-verificador.py`](gates/CA-F2-3-linha-verificador.py), `COMMENT` **deliberadamente não
descartado** (é o único token que vê o `noqa` sumir). **Placar que eu mesmo medi**, árvore restaurada e
`git status --porcelain` vazio entre cada mutação `[MEDIDO 2026-08-29 em 75026ff, n=3]`:

| árvore | órfãs | `rc` | veredito |
|---|---|---|---|
| **como entregue** | `0` (e `ENUMERADAS_AUSENTES=0`) | `0` | **CALA** — o lado que impede o falsificador de morder em tudo |
| **+ `M1`** apagar `assert leftovers == [], …` (`:51`) | `12` | `1` | **MORDE** |
| **+ `M2`** apagar docstring (`:243`) | `10` | `1` | **MORDE** |
| **+ `M3`** apagar `# noqa: S603` (`:171`) | `1` — `[delete] COMMENT '# noqa: S603 - argv literal, sem shell'` | `1` | **MORDE** — e este escapava de `test` **e** de `lint` |

**A lista de exceções é fechada em 2 e isso é metade do critério:** a vírgula mágica de `:142` (que o
`ruff format` obriga e que **nenhum critério anterior contabilizava** — `T-02.1-qa.md` §7, divergência nº 4)
e a citação **truncada** `test_reprocessar_o_mesmo_item_...` → `test_reprocessing_the_same_item_...`.
**Um `ORFAS=0` obtido acrescentando uma terceira exceção é a própria evidência de que a renomeação virou
reescrita.**

### 13.3 O que eu deliberadamente **não** fiz

- **Não gravei gate, não usei `pipeline override`, não toquei código de produção nem de teste.**
- **Não apliquei a ação 4 do `/qa`** (`master` → `origin/master` nos `diff` dos DoDs). Ela é **herdada e vale
  para as três fases**, e `01`/`03` **já estão no ledger** — mexer no critério de uma fase aprovada é outro
  ato, com outro dono. Fica **declarado como dívida aberta**, não silenciado.
- **Não editei `SPEC-002`, `PRD-002` nem o plano `02`** — §13.1 nomeia as duas linhas que herdam a errata.

---

## 14. ⏸ O **10º evento de log em português** — registro, NÃO decisão

**Não é meu para decidir, e não estou decidindo.** Dono: **owner / `/architect`** (linha 10 da tabela de
fronteira do `CLAUDE.md`) **+ o dono de `plataforma-dados`, de onde o commit veio.**

**O fato, confirmado:** `backend/src/modules/sentimento/use_cases/probe_bucket_coupling.py:75` —
`logger.debug("leitura do contador de %s falhou: %s", …)`, introduzido por **`207c817`**
(`feat(T-03.7)`, `plataforma-dados`), **em `master` hoje**.

**As duas leituras, e as duas são defensáveis:**

| leitura | argumento | consequência |
|---|---|---|
| **literal** | a linha 10 diz *"nome de EVENTO DE LOG (**a string em `logger.info("…")`**)"*. Isto **é** string em chamada de logger, **é** português, **é** nova | o contador vai de **4 para 5** e **o falsificador declarado da fase `04` DISPAROU**: *"se um evento de log NOVO nascer em português tendo o `CLAUDE.md` no contexto, a decisão prospectiva não pegou e a superfície precisa de MECANISMO, não de doutrina"* |
| **estreita** | *"nome de EVENTO"* é o núcleo; uma mensagem formatada com `%s` **não é nome** de evento | não conta — **mas a linha 10 passa a ter uma lacuna para MENSAGEM FORMATADA**, exatamente paralela à lacuna de `raise X("…")` que o `CLAUDE.md` já declara como `⏸ NÃO DECIDIDO` |

**Nenhuma das duas está escrita no `CLAUDE.md`**, e é essa ausência — não o commit — que é o achado.

### 14.1 ⚠️ Risco de contaminação, e ele é **meu**

A classificação operacional *"evento nomeado = 1º argumento literal, sem espaço"* **saiu do meu prompt de
despacho**, e **quatro derivações `ast` a herdaram**. Elas foram independentes na **contagem**;
**não** na **regra de classificação**. Portanto: **"quatro derivações concordam" NÃO é evidência sobre esta
pergunta.** O instrumento que produziu o `9`, o `10` e o `4 de 9` **não distingue nome de evento de mensagem
formatada** — ele nunca foi construído para isso.

**Consequência prática, e ela é barata:** qualquer decisão sobre esta pergunta precisa ser tomada **contra
as 13 chamadas de `logger.*` lidas à mão**, não contra o número que o `ast` publica. E se a leitura
**literal** vencer, o `4 de 9` de `CA-F2-9`/`CA-F4-5` e a nota do `CLAUDE.md` **passam a estar errados por
construção**, não por deriva.

**Não bloqueia nenhuma task desta feature.** `CA-F2-9` mede os **4 eventos em português da fase `02`
INTACTOS**, e isso continua verdadeiro.
