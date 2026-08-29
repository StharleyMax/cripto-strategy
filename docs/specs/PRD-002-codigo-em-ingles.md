# PRD-002 — Código em inglês

**Feature:** `codigo-em-ingles` · **Data:** 2026-08-29 · **Estado do pipeline ao escrever:** `INIT` (`harness pipeline state codigo-em-ingles` → `INIT`; um evento, `init` em `2026-08-29T12:06:25Z`) → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `docs` (predominante — a convenção e sua fronteira) · `sentimento` (o retroativo de `backend/tests`) · `web` (o retroativo de `frontend/src`)
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` devolve **0 byte com `rc=0`** e `docs.external_prd_paths` devolve `[]` ⇒ este PRD **nasce aqui**; não é referência nem extração de fonte externa.
**Insumos lidos:** [`docs/adr/ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md`](../adr/ADR-013-codigo-em-ingles-convencao-com-fronteira-e-sem-portao.md) — **lida duas vezes: `ace9fa9` (status `proposto`, 369 linhas) durante a redação, e `6aaefb1` (status **aceito**, 518 linhas) na revisão `R1`, depois que a PR #18 entrou. Ver §0.1** · [`ADR-011`](../adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md) `D6` · [`ADR-012`](../adr/ADR-012-o-portao-de-shell-e-o-make-nao-o-code-paths.md) · [`PRD-001`](PRD-001-plataforma-dados.md) §9/`Q14` · [`SPEC-001`](SPEC-001-plataforma-dados.md) §3.8 · `CLAUDE.md` · `harness.toml` · `docs/INDEX.md`
**Rev de ancoragem de TODA medição deste documento:** **`master@7af0e4f`**, e a âncora **não se move na `R1`**: o único delta entre `7af0e4f` e `0b6e910` (o `master` de agora) é `docs/INDEX.md` e a própria `ADR-013` `[MEDIDO 2026-08-29: `git diff --name-only 7af0e4f 0b6e910` → 2 arquivos, **zero sob `backend/` ou `frontend/`**]`. Nenhum número de §4 envelheceu. Onde um número deste PRD diverge de um número da `ADR-013`, o motivo está escrito e é sempre o mesmo: a `ADR-013` mediu em `01ec5a8`, e **`7af0e4f` traz `T-02.3` e `T-02.4a` mergeadas** (PRs #16 e #17, ambas de hoje).
**Tracker:** `harness policy --key tracker` → `{"kind": "jira", "project": "CST", "board_id": "36", "parent_kind": "Epic", "child_kind": "Tarefa"}`. **Nada foi criado, editado ou comentado no tracker por este documento.** Unidade de valor no tracker é ato posterior à validação do arquiteto, e o `/pm` não cria tasks.
**Ledger:** **intocado.** Nenhum `advance`, nenhum `approve`, nenhum `dispatch`. `INIT` antes, `INIT` depois.
**Glossário:** `harness policy --key glossary_doc` devolve **0 byte com `rc=0`**, `grep -n 'glossary' harness.toml` não casa nenhuma linha, e não existe `docs/glossario*` nem `docs/glossary*` `[MEDIDO 2026-08-29]`. **Não existe glossário neste projeto**, e o bootstrap que manda lê-lo aponta para o vazio. Isto não é nota de rodapé: `ADR-013/D2e` mediu que o glossário é **a peça que converteria esta convenção em portão**. Ver `[GAP G3]`.

---

## 0. Como ler este documento

**Cinco coisas o distinguem de um PRD comum. As cinco são consequência do que a `ADR-013` mediu antes dele.**

1. **A `ADR-013` veio ANTES deste PRD, e isso é irregular de propósito.** O fluxo normal é `/pm` → `/architect`. Aqui o `/architect` mediu primeiro porque a pergunta *"isto pode ter portão?"* precisava de resposta antes de o escopo poder ser escrito — um PRD que promete "o código está em inglês" como critério de aceite promete algo que a `ADR-013` demonstrou **não ser decidível por comando**. Este PRD **não repete** as medições dela; ele **reproduz** as que usa, e onde o número mudou o documento diz por quê.

2. **Nenhum critério de aceite deste PRD é "está em inglês".** Todos são de uma destas quatro formas, e a forma está declarada em cada um: **(a)** enumeração de arquivo, **(b)** lista fechada de identificadores congelada num rev, **(c)** igualdade de string sobre um conjunto enumerado (nunca detecção de idioma), **(d)** falsificador comportamental — a suíte, a cobertura e o `ast.dump` provam que a renomeação **não mudou comportamento**, o que é decidível, enquanto "está em inglês" não é.

3. **Retroativo e prospectivo são dois problemas, com dono, custo e risco diferentes — e este PRD os separa em unidades de valor distintas.** O prospectivo já funciona hoje sem portão nenhum, e há medição disso (§4.6). O retroativo é o que carrega risco, e o risco não é linguístico: é de **âncora morta**.

4. **`[PREMISSA-OWNER]` é exclusivamente citação literal.** Há **uma única** frase do owner neste documento com esse rótulo — a de §1.1, citada em 3 pontos (§1.1 integral; §3.1 linhas 1 e 3, em fragmento). **Nenhuma outra afirmação o carrega.** A decisão sobre o vocabulário de componentes **não** a tem — ela foi escolha entre alternativas apresentadas ao owner, e leva rótulo próprio: `[DECISÃO-OWNER: 2026-08-29, escolha de menu]`. Paráfrase vestida de citação já produziu defeito neste repositório, e a distinção entre os dois rótulos é a correção.

5. **Onde eu não sei, está escrito `[NÃO SEI]` com o nome de quem decide.** São **três**, e nenhuma delas foi convertida em `[INFERRED]` para o documento parecer completo.

---

## 0.1 Revisão `R1` — a `ADR-013` foi **aceita** durante a redação deste PRD

**Este PRD foi escrito contra `ace9fa9` (status `proposto`). Enquanto eu escrevia, o `/architect` publicou `6aaefb1` — a `ADR-013` passa a `aceito`, incorpora as duas respostas do owner e ganha uma quarta decisão — e a PR #18 foi mergeada.** `origin/master` está em `0b6e910`; esta branch o contém.

**O que a revisão mudou neste documento, e o que ela NÃO mudou:**

| # | a `ADR-013` em `6aaefb1` | efeito aqui |
|---|---|---|
| 1 | `D3` **fechada**: vocabulário de componentes é exceção declarada, com o rótulo **`[DECISÃO-OWNER]`, não `[PREMISSA-OWNER]`** | **convergência independente** — §3.3 já usava esse rótulo, pelo mesmo argumento, escrito antes de eu ler `6aaefb1`. Nada mudou |
| 2 | **`D4` nova** — o `glossary_doc` vazio vira **dívida com dono nomeado**, e a ADR endereça o dono ao **`/pm`**, com a ressalva *"se o `/pm` quiser cobri-lo, que seja como **dívida referenciada**, não como requisito desta feature"* | **`[GAP G3]` reescrito** para citar `D4` e **aceitar a ressalva explicitamente**. Ver §10 |
| 3 | a ADR **re-mediu** o universo em `7af0e4f` e **declarou o limite do próprio método**: *"o detector vê declaração e nome de arquivo, **não parâmetro** … `razao` e `casas` … **não estão** nos 27 ⇒ **27 é piso, não teto**"* | **§4.2 reescrito.** Meu número de `backend/tests` **não corrige a ADR — ele quantifica o piso que ela declarou.** A diferença estava em ser afirmação e virar número |
| 4 | a ADR chegou **independentemente** à divisão **VIVA × HISTÓRICA** das citações de `Filtro.tsx`, e conta **10** arquivos (os 9 + a própria ADR), **5 vivas / 5 históricas** | **§5.2 reconciliado**, e sobra **uma divergência real** que eu não resolvo sozinho: o **plano `01`**. Ver §5.2.1 |
| 5 | a ADR acrescenta uma ressalva à exceção de `components`: ela **cria uma classe nova de falso positivo** para qualquer instrumento futuro, que passa a precisar da lista de exceções como entrada de primeira classe | acrescentado a §3.3. **Não muda a decisão**, e a ADR mediu que o custo da alternativa **subiu** de 400 para **487 ocorrências em 69 arquivos** entre a pergunta e a resposta |
| 6 | `D1` **executada pelo owner**: `docstrings-em-ingles` → `REJECTED` em `12:06:17Z` com motivo escrito, `codigo-em-ingles` → `INIT` em `12:06:25Z` | confere com o que eu li do ledger. `[GAP G4]` mantido |

**O que NÃO mudou:** `D2` (doutrina, sem portão) está **inalterada** na revisão, e nada que eu medi a contradiz — §12 acrescenta **duas** recusas novas, com corpus de retenção, e nenhuma delas reabre `D2`.

---

## 1. Contexto e problema

### 1.1 O achado, e ele é literal

> *"Assim como docstring, todo código gerado é em inglês, olhando no front, ta tudo em portugues, nome dos arquivos, var, tudo."*
> `[PREMISSA-OWNER: 2026-08-29, citação literal]`

### 1.2 O diagnóstico NÃO é "a regra teve universo pequeno demais" — e a diferença muda o que este PRD tem de entregar

A leitura fácil seria: `T-01.7` traduziu docstrings e esqueceu identificadores. **Ela é falsa, e a `ADR-013` a falsificou com dois comandos que eu reproduzi.**

```
$ git show --name-only --format='' b0c2df3 | grep -c '^frontend/'
0
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · `T-01.7` (`b0c2df3`) **não tocou um único arquivo sob `frontend/`**. Os 4 arquivos de `frontend/src` — **e os 4 blocos JSDoc em inglês dentro deles** — nasceram em `T-01.2` (`e8c08d4`).

⇒ **No frontend não havia regra a calibrar.** O mesmo agente, no mesmo commit, escreveu docstring em inglês e identificador em português a uma linha de distância. O inglês veio de **hábito internalizado**, e hábito não tem calibração. E em `backend/tests`, onde `T-01.7` de fato entrou, a fronteira dela era explícita e tinha falsificador — *"APENAS o conteudo de docstring. Nenhuma assinatura, nenhum nome, nenhum comportamento"* `[DOC: docs/context/plataforma-dados/tasks.toml, T-01.7]` — e o falsificador dela (`ast.dump` idêntico) **teria reprovado uma renomeação**.

> **⇒ O defeito é LACUNA ENTRE TASKS: nenhuma task jamais teve o identificador como sujeito.** Isto é o que este PRD conserta, e é por isso que a unidade `U1` (a convenção escrita e localizável) não é cerimônia — ela é a peça que fecha a lacuna.

### 1.3 O instrumento que mede idioma acendeu no idioma errado — duas vezes, hoje, em dois agentes independentes

Registro porque é a razão pela qual §12 recusa detector de idioma como portão, e porque **os dois casos são confirmação de campo obtida por acidente**:

- o `/qa` da `T-02.3` mediu **46 linhas em português** porque tinha **`so`** no dicionário PT — **e `so` é inglês**;
- o `/review` mediu **31/177**, conferiu **6 linhas à mão**, achou **3 falso-positivos** (inglês que **cita** português entre aspas), calculou **~50% de erro** e **recusou publicar o número** `[DOC: docs/INDEX.md:73]`.

> *Instrumento que acende no idioma que ele deveria aprovar não está medindo.* E o token `so` não é anedota: ele **existe nesta árvore como identificador** — `so_linha_em_branco`, em `backend/tests/sentimento/test_etl_backlog_retomavel.py` (§4.2).

---

## 2. Objetivo

**Que o código deste repositório seja escrito em inglês por convenção declarada, localizável e citável — com a fronteira do que fica em português escrita item a item — e que o que já existe em português seja convertido sem destruir nenhuma das três coisas que ele carrega: evidência de decisão arquitetural, âncora textual de documento, e contrato com consumidor.**

**Não é objetivo:** criar portão de idioma. `ADR-013/D2` mediu três candidatos e recusou os três; §12 mede mais dois e recusa os dois. O que **é** objetivo é criar portão para o **risco da renomeação**, que é decidível — e §12 o mede dos dois lados.

---

## 3. Fronteira do universo — item a item

### 3.1 A tabela

`ADR-013/D3` escreveu 8 linhas. **Acrescento 4 superfícies que ela não lista, e as 4 existem na árvore de hoje com divergência viva** (§4.4, §4.5). Marco a origem de cada linha.

| # | superfície | decisão | força | origem |
|---|---|---|---|---|
| 1 | **identificador de produção** (`backend/src`, `frontend/src`) | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"todo código gerado é em inglês … var, tudo"* | `ADR-013/D3` |
| 2 | **identificador de teste** (`backend/tests`) — incluindo nome `test_*`, fixture, helper, classe de apoio, **parâmetro, variável local e constante de módulo** | **inglês** | `[INFERRED: "todo código" sem qualificador de camada; e `harness.toml [code_paths] include_prefixes` lista `backend/tests/` como código]` | `ADR-013/D3`, **estendida aqui** — ver §4.2, a extensão dobra o universo |
| 3 | **nome de arquivo** | **inglês** | `[PREMISSA-OWNER: 2026-08-29]` — *"nome dos arquivos"*, literal | `ADR-013/D3` |
| 4 | **nome de diretório** | **inglês**, exceto o que deriva de `components` (linha 9) | `[INFERRED: um diretório é metade de um caminho]` | `ADR-013/D3` |
| 5 | **docstring / comentário** | **inglês** | `ADR-011/D6` + `T-01.7`, em vigor `[DOC]` | `ADR-013/D3` |
| 6 | **mensagem de commit, corpo de PR** | **português** | `[INFERRED: não é "código gerado"; 18 dos 20 últimos commits em português, n=20]` | `ADR-013/D3` |
| 7 | **`docs/`, `README`, SPEC, ADR, plano, `tasks.toml`, `CLAUDE.md`** | **português** | `[INFERRED: traduzir destruiria as âncoras textuais que 3 ADRs usam para se referir umas às outras]` | `ADR-013/D3` |
| 8 | **string visível de UI / microcopy de operador** | **português (pt-BR)** — e **fora do universo desta feature por REMISSÃO, não por omissão** | `[DOC: SPEC-001 §3.8 + PRD-001 §9/Q14]` — ver §3.2 | `ADR-013/D3` colocou fora; **§3.2 dá a razão mais forte** |
| 9 | **vocabulário fechado de componentes** (`sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs`) **e os caminhos que dele derivam** (`backend/src/modules/sentimento/`, `backend/tests/sentimento/`) | **português — EXCEÇÃO DECLARADA** | `[DECISÃO-OWNER: 2026-08-29, escolha entre alternativas apresentadas]` — ver §3.3 | **resolve a pergunta que `ADR-013/D3` deixou aberta** |
| 10 | **nome de EVENTO DE LOG** (a string em `logger.info("...")`) e **as chaves de `extra={}`** | **⏸ NÃO DECIDIDO** — ver `[Q1]` | `[NÃO SEI]` | **superfície nova, medida em §4.4** |
| 11 | **nome de COLUNA DE CONTRATO** (`janela_de_perda`, `window`, `class`) | **português — EXCEÇÃO, já declarada em código de produção** | `[DOC: backend/src/modules/sentimento/domain/ingest_record.py:80-89]` — ver §3.4 | **superfície nova, medida em §4.5** |
| 12 | **segmento de URL / rota** (`"/painel"` em `ROTAS`) | **⏸ NÃO DECIDIDO** — ver `[Q2]` | `[NÃO SEI]` | **superfície nova, medida em §4.3** |

### 3.2 Por que a string de UI fica FORA — e o argumento não é o da `ADR-013`

`ADR-013/D3` a coloca fora com o argumento *"idioma de interface e idioma de código são eixos independentes"*. **O argumento é bom e eu tenho um mais forte, que é de governança e não de taxonomia: a UI já tem decisão tomada, em outro artefato, com dono e com requisito derivado.**

```
$ git show 7af0e4f:docs/specs/SPEC-001-plataforma-dados.md | sed -n '309,318p'
### 3.8 Serialização de numeral — invariante de locale
…
pt-BR aplica-se EXCLUSIVAMENTE a microcopy e rótulo de eixo
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · E a origem dela é `PRD-001` §9, que classifica `Q14` como **inferível** e não como pergunta aberta: **`[INFERRED: Q14 — microcopy em pt-BR, com identificadores de série não traduzidos]`** — com custo de reversão declarado (*"i18n é retrofit conhecido"*) e com uma consequência de domínio que `R1` acrescentou: **serialização de numeral é invariante de locale em qualquer caminho de dado**, senão o fixture deixa de ser byte-estável entre `LANG=pt_BR.UTF-8` e `LANG=C`.

> **⇒ Reabrir a UI aqui criaria DUAS VERDADES sobre a mesma superfície** — uma em `SPEC-001` §3.8, outra neste PRD — e o repositório já tem precedente do custo disso (`PRD-001` §0.3 registra uma colisão real de numeração entre dois documentos que "eram o mesmo item, o que foi sorte e não acerto"). A UI fica fora **por remissão a um requisito vigente**, e este PRD **declara que `SPEC-001` §3.8 permanece de pé sem alteração**.
>
> **Falsificador desta decisão:** se o owner disser que a interface passa a inglês, quem muda é `SPEC-001` §3.8 e `PRD-001` §9/`Q14` — **não este PRD**, que continuaria correto no seu próprio universo. A remissão é o que torna a fronteira reversível de um lugar só.

### 3.3 A exceção do vocabulário de componentes — a decisão, e o que ela custou não fazer

`ADR-013/D3` terminou numa pergunta bloqueante ao owner: *"o vocabulário fechado está DENTRO ou FORA do universo?"*. **Está FORA.**

`[DECISÃO-OWNER: 2026-08-29]` — e o rótulo é este, e não `[PREMISSA-OWNER]`, porque **foi escolha entre alternativas apresentadas ao owner com o custo de cada uma declarado, não frase ditada por ele.** O custo que ele aceitou, como foi escrito no menu: *"o repositório fica bilíngue numa fronteira, mas a fronteira é declarada e tem uma linha só"*.

**A alternativa recusada, com o custo medido que a recusou:**

```
$ git grep -c 'sentimento' 7af0e4f -- . | awk -F: '{s+=$NF} END{print s}'   # 400 ocorrências
$ git grep -l 'sentimento' 7af0e4f -- . | wc -l                             # 55 arquivos
$ git ls-tree -r --name-only 7af0e4f | grep -c 'sentimento'                 # 10 caminhos versionados
```

`[MEDIDO 2026-08-29 em 7af0e4f, reproduzindo a ADR-013]` · Mais **84 tasks** em `tasks.toml` e **rótulos do Jira**, que não se renomeiam por commit. E `sentimento` não é identificador de código: é **chave de política**, consumida por `[components]`, `[agents.by_component]` e `[code_paths]` — mudá-la é migração de governança com efeito em `require-code`, em `classify` e no roteamento de agente.

**A ressalva que a `ADR-013` acrescentou em `6aaefb1`, e que NÃO estava na frase que o owner leu — registrada aqui em vez de deixada passar:** a exceção **cria uma classe nova de falso positivo** para qualquer instrumento futuro. O detector da própria ADR **acusa `sentimento` de português**, e a partir desta decisão essa acusação é **falsa por construção**. ⇒ **todo instrumento que algum dia medir idioma terá de carregar a lista de exceções como entrada de primeira classe**, exatamente como `ADR-013/D2e` já exige para o glossário. **Não muda a decisão**, e a ADR mediu que o custo da alternativa **subiu** entre a pergunta e a resposta — de 400 para **487 ocorrências em 69 arquivos** `[DOC: ADR-013, `D3`]`, porque `T-02.3` e `T-02.4a` acrescentaram código sob `sentimento/` nesse intervalo.

**O falsificador da exceção, que a `ADR-013` escreveu e este PRD adota como regra operável — ele mede EROSÃO, não intenção:** todo nome em português aceito sob `backend/src/` ou `frontend/src/` tem de casar, **por igualdade de string**, com um elemento de `harness policy --key components`. **Hoje isso é `1` — `sentimento` — e nenhum outro.** Um segundo nome português que **não** case é a evidência de que a exceção virou rampa. **Isto vira `CA-U1-6`.**

**A fronteira, em uma linha, e é ela que vai para `U1`:**

> **O vocabulário fechado de componentes e todo caminho que dele deriva ficam em português. Todo o resto do código vai para o inglês.**

### 3.4 A exceção da coluna de contrato — ela já está escrita em código de produção, e ninguém a listou

O código de produção **já declarou esta exceção, em inglês, com o motivo**:

```
$ git show 7af0e4f:backend/src/modules/sentimento/domain/ingest_record.py | sed -n '87,89p'
# The NAME stays Portuguese because it is a CONTRACT COLUMN NAME quoted from `ADR-008/D3`,
# like `window` — renaming it here would break the consumer of `T-07.13`.
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · `janela_de_perda` é uma das **15 colunas que `ADR-008/D3` fixou**, e a ordem da tupla alimenta o `sha256` da projeção canônica (`ADR-008/DoD-2`): **reordenar ou renomear muda a impressão digital de todo relatório — é mudança de contrato, não de estilo.**

⇒ **Coluna de contrato fica em português por herança do ADR que a fixou.** Reabri-la é ato de `ADR-008`, não desta feature. Ver `[GAP G1]` para o que isso deixa em aberto.

---

## 4. O universo, medido e CONGELADO em `master@7af0e4f`

**Toda medição desta seção usa uma árvore EXTRAÍDA do rev**, não a árvore viva:

```
$ T=$(mktemp -d); git archive 7af0e4f | tar -x -C "$T"
```

**Por quê:** este PRD contém os tokens que ele mede (`oi`, `painel`, `Filtro`, `so`). Rodar `grep -r` sobre a árvore viva depois de publicá-lo faz o comando medir a si mesmo — é a família de defeito que `ADR-012` nomeia, e a `ADR-013` registra que ela já ocorreu **seis vezes** nesta trilha. Extrair o rev é imune; `--exclude` não seria.

### 4.1 `backend/src` — conforme, e o universo é **3,3× maior** que o da `ADR-013`

```
$ grep -rnoE '\b(def|class) [a-zA-Z_0-9]+' "$T/backend/src" --include='*.py' | wc -l
77
```

`[MEDIDO 2026-08-29 em 7af0e4f, n=77]` · **0 em português**, lidas uma a uma.

> **⚠️ Este número diverge da `ADR-013`, que publicou 23, e a divergência NÃO é defeito de nenhum dos dois.** A `ADR-013` mediu em `01ec5a8`; `7af0e4f` traz `T-02.3` e `T-02.4a` mergeadas (PRs #17 e #16, ambas de hoje), que acrescentaram **7 módulos de produção**. O universo cresceu **3,3× em um dia**, e o veredito não mudou: **0 em português**, antes e depois.
>
> **A lição de método, e ela é para quem citar este PRD amanhã:** *"0 de 23"* e *"0 de 77"* têm a mesma conclusão e universos diferentes por um fator de 3. **Um número de universo tem prazo de validade de horas neste repositório.** É por isso que todo critério de aceite de §6 congela o rev junto com a lista.

### 4.2 `backend/tests` — o universo real é **40 identificadores**, não 19, e cabe em **2 arquivos**

**Este é o achado central deste PRD para o retroativo do backend. Ele NÃO corrige a `ADR-013` — ele QUANTIFICA um limite que ela própria declarou**, e a distinção importa porque a alternativa seria eu me atribuir uma correção que não fiz.

**A `ADR-013` em `6aaefb1` escreve, com todas as letras:** *"o detector vê **declaração e nome de arquivo**, não **parâmetro**. `razao` e `casas`, parâmetros de `formatarPercentual`, são portugueses e **não estão** nos 27. ⇒ **27 é piso, não teto**"*. `[DOC: ADR-013, §"O universo, RE-MEDIDO"]`

> **⇒ A ADR declarou que o número era piso. Este PRD mede de quanto era o piso, para os 2 arquivos que a unidade `U2` vai tocar.** Uma afirmação verdadeira sem número não dimensiona uma task; **19 e 40 dão a mesma conclusão e planos diferentes.**

Re-medido por `ast` — `Name(Store)` ∪ `arg` ∪ `FunctionDef` ∪ `AsyncFunctionDef` ∪ `ClassDef`, que **vê parâmetro, variável local e constante de módulo** — sobre os 2 arquivos:

```
$ python3 - <<'PY'   # o script completo está em §6/U2, e classifica PT à mão, token a token
… ast.walk sobre Name(Store) ∪ arg ∪ FunctionDef ∪ AsyncFunctionDef ∪ ClassDef …
PY
test_durabilidade_da_infra.py: ligados_distintos=15  em_PT=7
test_etl_backlog_retomavel.py: ligados_distintos=55  em_PT=33
TOTAL: ligados_distintos=70  em_PT=40
```

`[MEDIDO 2026-08-29 em 7af0e4f, n=70 nomes ligados distintos, 40 em português]`

> **⚠️ Os dois números medem universos diferentes e NÃO se contradizem — dizer o contrário seria o defeito que este repositório caça.** A `ADR-013` varre **12 arquivos** de `backend/tests` por **declaração** e acha **19 de 149**; este PRD varre **2 arquivos** por **todo nome ligado** e acha **40 de 70**. **A interseção é exata:** as 19 declarações da ADR estão contidas nos meus 40, e as 21 restantes são precisamente a classe que ela declarou não ver.

**E o universo é surpreendentemente pequeno em arquivos.** Os 14 nomes `test_*` em português e os 5 apoios (`_semear`, `_conferir_saida_integra`, `ContadorDeTrabalho`, `CheckpointVolatil`, `espia`) **vivem nos mesmos 2 arquivos**, e esses 2 são exatamente os **2 únicos com nome de arquivo em português**:

```
$ grep -rlnE 'def test_(cauda_|checkpoint_|drenagem_|janela_|linha_|matar_|pendente_|reprocessar_|segunda_|worker_)' "$T/backend/tests"
backend/tests/sentimento/test_durabilidade_da_infra.py
backend/tests/sentimento/test_etl_backlog_retomavel.py
```

`[MEDIDO 2026-08-29 em 7af0e4f, n=2 arquivos de 12]` · E os dois nasceram no **mesmo commit**, o mais antigo da árvore de código:

```
$ git log --format='%h %s' 7af0e4f --diff-filter=A --name-only -- backend/tests | grep -B12 'test_etl_backlog_retomavel'
3b31ebc feat(T-01.1): o runner nasce preso a um teste que tem relógio (#2)
```

`[MEDIDO 2026-08-29]`

> **⇒ O retroativo de `backend/tests` não é "19 identificadores espalhados por uma suíte". É 2 arquivos, 70 nomes, 40 deles em português, todos de `T-01.1`.** Isso torna o critério de aceite enumerável e o diff revisável por inteiro — e é o que `U2` explora.

**A lista fechada dos 40 está em §6/`U2`**, integral, sem reticências. Um deles merece ser lido em voz alta aqui: **`so_linha_em_branco`** — a variável cujo primeiro token é `so`, a mesma palavra que fez o `/qa` da `T-02.3` medir 46 linhas em português por engano (§1.3). **O corpus e o instrumento se encontraram nesta árvore, por acidente.**

### 4.3 `frontend/src` — 4 arquivos, e a divergência é maior do que o nome-base

```
$ find "$T/frontend/src" -type f | sed "s|$T/||" | sort
frontend/src/app/rotas.ts
frontend/src/components/ui/formatar-percentual.ts
frontend/src/features/painel/config.ts
frontend/src/features/painel/Filtro.tsx
```

`[MEDIDO 2026-08-29 em 7af0e4f, n=4]`

| arquivo | nome-base | identificadores em PT | outras superfícies |
|---|---|---|---|
| `app/rotas.ts` | **PT** | `ROTAS`, `Rota`, **`painel` (chave de objeto)** | **`"/painel"` — segmento de URL, superfície `[Q2]`** |
| `components/ui/formatar-percentual.ts` | **PT** | `formatarPercentual`, `razao`, `casas`, `sinal` | — |
| `features/painel/config.ts` | **EN** | `configPainel` | **diretório `painel/` em PT**; `any` é payload de bancada |
| `features/painel/Filtro.tsx` | **PT** | `Filtro` | **diretório `painel/`**; **texto JSX é evidência, ver §5.3** |

`[MEDIDO 2026-08-29, os 4 arquivos lidos integralmente; 9 identificadores PT, 3 de 4 nomes-base PT, 1 segmento de diretório PT]` — **confere com `ADR-013`, incluindo a correção dela: `config` é inglês, o português ali é o diretório.**

**E os 4 blocos JSDoc são 4 de 4 em inglês** `[MEDIDO: `grep -rc '^/\*\*' "$T/frontend/src"`]` — o dado que sustenta o diagnóstico de §1.2.

### 4.4 ⚠️ Superfície NOVA · nome de evento de log — **9 eventos, 4 em português, e ninguém decidiu**

```
$ grep -rnE 'logger\.(info|warning|debug|error)\(' "$T/backend/src" --include='*.py'
```

`[MEDIDO 2026-08-29 em 7af0e4f, n=9 eventos nomeados + 1 chamada que loga uma linha já pronta]`

| evento | idioma | chaves de `extra=` | arquivo |
|---|---|---|---|
| `etl_item_publicado` | **PT** | `etl_key`, **`destino`** | `infra/file_etl_worker.py:41` |
| `etl_item_concluido` | **PT** | `etl_key` | `use_cases/drain_etl_backlog.py:62` |
| `etl_drenagem_concluida` | **PT** | **`processados`**, **`janela`** | `use_cases/drain_etl_backlog.py:63` |
| `checkpoint_cauda_truncada` | **PT** | **`bytes_descartados`** | `infra/jsonl_checkpoint.py:76` |
| `ingest_run_persisted` | EN | `run_id` | `infra/sqlite_ingest_record_store.py:198` |
| `ingest_gap_persisted` | EN | `source`, `symbol` | `infra/sqlite_ingest_record_store.py:217` |
| `checksum_sidecar_absent` | EN | `subject` | `infra/checksummed_file_payload.py:78` |
| `ingest_health_query_read` | EN | `runs`, `gaps` | `use_cases/ingest_health.py:66` |
| `ingestion_verified` | EN | `subject`, `sha256`, `lines` | `use_cases/ingest_verified_payload.py:162` |

**4 PT / 5 EN.** E o próprio repositório já registrou que a divergência é **decisão de agente e não do owner**:

> *"o código novo é **todo em inglês** … o que cria um **segundo vocabulário de observabilidade** ao lado do que já existe em português … **Nada existente foi renomeado.** A divergência é **decisão de leitura do agente**, não citação do owner"* `[DOC: docs/INDEX.md:68]`

> **⚠️ Por que isto NÃO é identificador, e por que a `ADR-013/D3` não o alcança: nome de evento de log é CHAVE DE CONSULTA OPERACIONAL.** Quem o consome é uma query, um alerta ou um dashboard — que vivem **fora deste repositório** e não aparecem em nenhum `git grep`. Renomear um identificador Python quebra um import, e o import reprova. Renomear um evento de log quebra uma consulta, **e a consulta continua devolvendo `rc=0` com zero linhas** — a mesma família de falso-verde que `ADR-012` nomeia. É por isso que vira `[Q1]` e não `[INFERRED]`.
>
> `[NÃO MEDIDO]` **se existe consumidor de log hoje.** Não há dashboard, alerta ou coletor versionado neste repositório, e eu não tenho como saber o que o owner roda na VPS. **Isso é exatamente o que torna a pergunta barata de responder e cara de errar.**

### 4.5 ⚠️ Superfície NOVA · nome de coluna de contrato — a exceção já existe em código e não estava listada

`janela_de_perda` é uma das 15 colunas de `INGEST_HEALTH_RUN_COLUMNS`, fixadas por `ADR-008/D3`. O código de produção já escreveu a exceção e o motivo (§3.4). **E há uma divergência viva que precisa ser vista:**

```
$ grep -rn 'loss_window\|janela_de_perda' "$T/backend/tests/sentimento/test_ingest_health_query.py"
277:def test_the_loss_window_column_is_present_and_explicitly_not_computed_in_f0
278,286,287:    … "janela_de_perda" …
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · **O nome do teste está em inglês (`loss_window`) e a coluna que ele testa está em português (`janela_de_perda`).** Isso não é defeito — é a fronteira funcionando exatamente como §3.4 a descreve: o **identificador** vai para o inglês, o **contrato** fica. Mas é a prova de que a fronteira é fina o bastante para caber dentro de uma função, e por isso ela tem de estar escrita antes de qualquer builder tocar nisso.

### 4.6 O código que nasceu HOJE já é inglês — e isto é o dado que sustenta `U1`

```
$ git log --format='%h %s' 7af0e4f --diff-filter=A --name-only -- backend/src backend/tests \
    | sed -n '/T-02.3/,$p'
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · `T-02.3` e `T-02.4a` (mergeadas hoje) criaram **9 arquivos novos** sob `backend/src` e `backend/tests` — **9 de 9 com nome em inglês**, e os nomes de teste dentro deles em inglês (`test_absent_sidecar_refuses_instead_of_assuming_the_file_is_fine`, `test_killing_the_recorder_mid_run_keeps_every_committed_record`, …).

> **⇒ A convenção JÁ FUNCIONA como doutrina quando quem escreve a conhece.** Ela entrou no prompt dos builders hoje, e o código nasceu certo — **sem portão, sem regra, sem detector.** O que falta não é enforcement: é a convenção existir num lugar que a próxima pessoa encontre sem depender de alguém ter colado a frase no prompt. **É isso, e só isso, que `U1` entrega.**
>
> **E há o contra-exemplo no mesmo dia, que impede a leitura otimista:** os eventos de log de §4.4 nasceram **nos mesmos commits**, em inglês, **ao lado de 4 eventos em português que ninguém renomeou** — e o próprio `INDEX` registra que a decisão foi do agente. **Doutrina resolve o que ela alcança. A superfície que ela não nomeia, ela não alcança.**

---

## 5. Tipos e contratos críticos

### 5.1 As seis classes de superfície — e cada uma tem um mecanismo de falha diferente

Esta taxonomia é o que impede o PRD de tratar "renomear" como um verbo só. **A coluna que importa é a última.**

| classe | exemplo nesta árvore | quem quebra se renomear errado | o erro é visível? |
|---|---|---|---|
| **A · identificador interno** | `razao`, `_semear`, `Filtro` | o import / o interpretador | **sim** — reprova na hora |
| **B · nome de arquivo/diretório** | `rotas.ts`, `painel/` | import, **e toda citação textual em documento e comando** | **parcialmente** — o import reprova, a citação **não** |
| **C · âncora textual em documento** | `harness.toml:149`, `frontend/README.md:120` | um comando documentado que passa a rodar sobre caminho inexistente | **NÃO** — `rc=0`, 0 byte, indistinguível de "limpo" |
| **D · chave de consulta operacional** | `etl_item_publicado` | uma query/alerta fora deste repositório | **NÃO** — a consulta devolve zero linhas em silêncio |
| **E · nome de contrato** | `janela_de_perda`, `window`, `class` | o consumidor da projeção; e o `sha256` de todo relatório | **sim, mas tarde** — só quando o fingerprint diverge |
| **F · evidência** | o texto JSX `"Filtro: any resultado serve"` | a prova que ele carrega | **NÃO** — a prova some e o documento continua a afirmar que ela existe |

> **As classes C, D e F falham em SILÊNCIO.** É por isso que o critério de aceite de `U3` não é "renomeou", é "renomeou **e** a prova de dois lados foi re-executada **depois**".

### 5.2 Citação VIVA × citação HISTÓRICA — e por que *"atualize as 9 citações"* está errado

O enquadramento desta feature diz, com razão, que `Filtro.tsx` é citado em **9 arquivos versionados** e que renomear sem consertar converte uma prova de silêncio em falso-verde. **Reproduzo o número e depois o corrijo em duas direções.**

```
$ git grep -l -F 'Filtro.tsx' 7af0e4f -- . | wc -l
9
$ git grep -l -F 'Filtro'     7af0e4f -- . | wc -l
12
```

`[MEDIDO 2026-08-29 em 7af0e4f]`

**Correção (a) — o universo de citação é MAIOR que 9 quando o token é a palavra.** Os 3 arquivos a mais são `docs/proposta-discovery.md`, `docs/specs/PRD-001-plataforma-dados.md` e o próprio `Filtro.tsx`. E `harness.toml` cita, em 3 linhas adicionais que `grep -F 'Filtro.tsx'` **não** pega, um caminho hipotético de sonda:

```
$ git show 7af0e4f:harness.toml | sed -n '238,241p'
# … Logo, o primeiro `Filtro.test.tsx` que existir
# será classificado **produção** — que é a classificação ERRADA …
# `[MEDIDO 2026-08-28: harness code-paths classify frontend/src/__sonda__/Filtro.test.tsx`
```

`[MEDIDO 2026-08-29 em 7af0e4f]` · Se o componente virar `Filter`, a convenção do vizinho (`<nome>.test.tsx`, `ADR-009/D1`) faz o teste futuro chamar-se `Filter.test.tsx` — e essas 3 linhas passam a documentar uma sonda com o nome errado.

**Correção (b), e é a mais consequente — NEM TODAS AS 9 SÃO PARA ATUALIZAR.** Elas se dividem em duas classes com regras opostas:

| classe | arquivos | o que fazer | por quê |
|---|---|---|---|
| **VIVA** — alguém vai rodar o comando ou abrir o caminho | `harness.toml` (5 linhas) · `frontend/README.md` (**4 lugares**, incluindo o protocolo de reprodução de `§3`) · `backend/README.md` · `docs/context/plataforma-dados/tasks.toml` · `docs/context/plataforma-dados/handoff_to_builder.md` | **atualizar, atômico com o rename** | um caminho inexistente devolve `rc=0` e 0 byte |
| **HISTÓRICA** — registro datado do que foi medido naquele rev | `docs/INDEX.md` · `docs/adr/ADR-003` · `ADR-011` · `ADR-012` · `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` · `docs/proposta-discovery.md` · `docs/specs/PRD-001-plataforma-dados.md` | **NÃO atualizar** | **`docs/INDEX.md` é append-only por regra da casa** (`CLAUDE.md`), e uma ADR é decisão **datada** — ela continua verdadeira no rev que declara. Reescrevê-la para casar com um rename destrói a âncora que outras 2 ADRs usam para citá-la |

> **⇒ O critério de aceite de `U3` distingue as duas classes por enumeração, e a enumeração está em `U3`.** Um builder que receber *"atualize as 9 citações"* vai reescrever o `INDEX.md` — que é exatamente o que `CLAUDE.md` proíbe. **A instrução tem de vir enumerada, ou ela produz a violação que quer evitar.**

**Convergência independente, e ela vale registrar:** a `ADR-013` em `6aaefb1` chegou à **mesma** divisão VIVA × HISTÓRICA, escrita sem que eu tivesse lido a revisão dela. Ela conta **10 arquivos** — os 9 mais **a própria ADR**, que passou a citar `Filtro.tsx` ao ser escrita — com **5 vivas** e **5 históricas**. **Duas medições independentes chegando à mesma taxonomia é o melhor sinal que esta seção pode ter.**

### 5.2.1 ⏸ A divergência que sobra, e eu NÃO a resolvo sozinho: o plano `01`

**Os dois inventários coincidem em tudo, menos numa linha.** A `ADR-013` classifica `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` como **VIVA**; §5.2 deste PRD o classifica como **HISTÓRICA**. **O objeto é o mesmo e a leitura é diferente, então um dos dois está errado.**

**O que a linha diz, na íntegra do trecho que importa:**

```
$ git show 0b6e910:docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md | grep -n 'Filtro.tsx'
36:| **D1.3b** | … | o ESLint **do projeto** (não o global) sobre os **3 arquivos de bancada**:
     acusa `tipos.ts`, **cala** em `config.ts` e em `Filtro.tsx` | … |
```

`[MEDIDO 2026-08-29 em 0b6e910]`

**O argumento de cada lado, e os dois são bons:**
- **VIVA** (a ADR): é uma **receita executável** — `CA-U3-3` manda re-executá-la depois do rename. Uma receita que nomeia um arquivo inexistente é âncora morta.
- **HISTÓRICA** (este PRD): é uma **linha de DoD de fase concluída** — `D1.3b` foi fechado por `T-01.2`, com `/qa APPROVED` e `/review COMPLIANT`. Reescrevê-la muda o registro de um critério **já cumprido naquele rev**, e nenhum dos dois vereditos foi dado sobre `Filter.tsx`.

**A terceira leitura, que é a minha recomendação e leva rótulo próprio:** **o plano é HÍBRIDO, e a saída não é escolher um dos dois lados — é notar que a receita viva JÁ MORA em outro lugar.** `frontend/README.md` a carrega em **4 lugares**, como protocolo executável com `printf`/`rm` (linhas 33, 85-86, 118-121, 379-383) — e esse arquivo está em **VIVA nos dois inventários**. ⇒ **atualizar `frontend/README.md` mantém a receita executável; deixar a linha do plano como está preserva o registro do DoD.** Nenhuma âncora morre, nenhum registro é reescrito. `[INFERRED: recomendação de PM]`

> **⇒ `[NÃO SEI]` de forma vinculante, e decide o `/architect`: o plano `01` é dele.** `CA-U3-4` lista o plano em HISTÓRICA **provisoriamente**, e a SPEC pode movê-lo para VIVA — mas se o mover, tem de dizer o que fazer com o fato de que o veredito de `/qa` daquela fase foi dado sobre o nome antigo.

### 5.3 O que é evidência e NÃO se traduz — a lista, e ela é fechada

| objeto | por que é intocável |
|---|---|
| o texto JSX `<p>Filtro: any resultado serve</p>` | a palavra **`any` dentro da string** é o payload da bancada `D1.3b`: ela prova que nenhuma regex de linha é simultaneamente completa e correta (`ADR-011/D4`). **Traduzir o texto apaga a prova.** Renomear o componente e o arquivo, não |
| `config.ts` → `{ retry: 3, any: true }` | `any` como **chave de objeto** é a outra metade da mesma bancada |
| as citações literais de owner e de ADR **dentro de docstring** | `T-01.7` já as preservou ao traduzir; o `/review` de hoje mediu que **3 dos "resíduos de português" eram inglês CITANDO português entre aspas** (§1.3) |
| os rótulos `[MEDIDO]` · `[DOC]` · `[PREMISSA-OWNER]` · `[INFERRED]` | são vocabulário de governança em português, e §3.1/linha 7 os mantém |

**A regra operável, uma linha:** *renomear o continente é permitido; traduzir o conteúdo citado, não.* Um arquivo pode virar `Filter.tsx`; a string dentro dele, não.

---

## 6. Unidades de valor

**Quatro unidades. A ordem entre elas é obrigatória e o motivo está escrito.** `U1` antes de tudo — renomear antes de a fronteira estar declarada significa renomear **duas vezes**, e a segunda renomeação atinge um alvo que a primeira já moveu (`ADR-013/D1`). `U4` é **decisão**, não código, e é a única despachável em paralelo.

| | unidade | componente | classe do problema | depende de |
|---|---|---|---|---|
| **U1** | A convenção escrita, localizável e citável | `docs` | **prospectivo** | — |
| **U2** | O retroativo de `backend/tests` — 2 arquivos | `sentimento` | **retroativo** | `U1` |
| **U3** | O retroativo de `frontend/src` — 4 arquivos + o diretório | `web` | **retroativo** | `U1` |
| **U4** | As superfícies de contrato e de consulta — decisão, não renomeação | `docs` | **fronteira** | `[Q1]` respondida |

---

### U1 · A convenção escrita, localizável e citável

> **Como** agente ou humano que vai escrever a próxima linha de código deste repositório,
> **quero** encontrar a convenção de idioma e a lista do que fica em português num lugar canônico e grepável,
> **para que** eu não dependa de alguém ter colado a frase do owner no meu prompt.

**Por que isto é uma unidade de valor e não uma nota:** §4.6 mediu que a convenção **já funciona** quando quem escreve a conhece (9 de 9 arquivos novos nasceram em inglês hoje) e **já falhou** onde ninguém a nomeou (os 4 eventos de log em português, nascidos nos mesmos commits). **O que está sendo entregue é a diferença entre essas duas colunas.**

**Fronteira — o que esta unidade toca:** apenas arquivos de convenção. **Nenhum arquivo sob `backend/` ou `frontend/` é renomeado, editado ou movido por `U1`.**

**Critérios de aceite** — forma **(c)**, igualdade de string sobre conjunto enumerado:

- **`CA-U1-1`** · A tabela de 12 linhas de §3.1 está escrita, integral, num arquivo de convenção da raiz do repositório. **Verificação:** `test -f <arquivo>` **e** um `grep -F` por cada uma das 12 linhas-chave devolve exatamente 1 ocorrência. `[NÃO SEI]` **qual arquivo** — ver `[Q3]`; o `/architect` decide entre `CLAUDE.md`, `README.md` da raiz e um `docs/CONVENCOES.md` novo, e a decisão tem consequência medida (o `README.md` da raiz já carrega a frase de `ADR-011/D6`, `T-01.7`, `D1.10`).
- **`CA-U1-2`** · A exceção de §3.3 aparece **literal e grepável**: `grep -F 'vocabulário fechado de componentes e todo caminho que dele deriva ficam em português' <arquivo>` → **1 linha, `rc=0`**.
- **`CA-U1-3`** · A frase *"idioma de identificador é convenção, não portão"* (ou equivalente literal declarado pelo `/architect`) está escrita **junto com o gatilho de reabertura de `ADR-013/D2e`** — glossário sob `glossary_doc` **mais** lista de vocabulário de biblioteca. **Verificação:** `grep -n 'glossary_doc' <arquivo>` → `rc=0`.
- **`CA-U1-4`** · **Nenhuma `[[rules.own]]` de idioma nasce.** `harness rules list --severity block` devolve **as mesmas 7 regras** de hoje, com os mesmos identificadores. **Verificação, dois lados:** o `diff` da saída de `harness rules list --severity block` antes e depois é **vazio**; e `git diff master -- harness.toml` **não** contém a substring `[[rules.own]]`. `[DOC: ADR-011/D1.10 — declarar uma [[rules.own]] de idioma REPROVA a fase]`
- **`CA-U1-5`** · A convenção entra no **contexto de builder**, não só num documento que ninguém abre. **Verificação:** `[NÃO SEI]` o mecanismo — depende de onde o `/tech-lead` injeta contexto de task. O `/architect` nomeia o mecanismo na SPEC; **o critério só é aceito se for verificável por comando**, não por "está escrito no plano".

- **`CA-U1-6`** *(forma **c**, e é o medidor de EROSÃO da exceção — adotado de `ADR-013/D3`)* · Todo segmento de caminho em português sob `backend/src/`, `backend/tests/` e `frontend/src/` casa, **por igualdade de string**, com um elemento de `harness policy --key components`. **Verificação, e ela é executável hoje:**
  ```
  $ git ls-tree -r --name-only <rev> | grep -E '^(backend/src|backend/tests|frontend/src)/' \
      | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u \
      | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'
  app  backend  components  domain  features  frontend  helpers  infra  modules
  painel  src  tests  ui  use_cases
  ```
  `[MEDIDO 2026-08-29 em 7af0e4f: 15 segmentos distintos; 14 sobrevivem ao filtro, e a leitura à mão diz que **13 são inglês e 1 é português: `painel`**]`

  > **⇒ Este critério tem prova de dois lados embutida, e é o único do PRD que já pode ser rodado antes de qualquer código mudar. HOJE ele MORDE:** o conjunto de segmentos portugueses é **`{sentimento, painel}`**, tamanho **2**. **Depois de `U3` ele CALA:** o conjunto vira **`{sentimento}`**, tamanho **1** — e `sentimento` casa com `components`. **Um terceiro elemento, em qualquer fase futura, é a evidência de que a exceção virou rampa.**

  Este é o único critério deste PRD que **continua valendo depois** de a feature fechar.

**Non-goals de `U1`:** não renomeia nada; não cria portão; não altera `[components]`; não toca `SPEC-001` §3.8; **não escreve o glossário de `ADR-013/D4`** — ver `[GAP G3]`.

**Falsificador de `U1`:** rode a variante `D` de `ADR-013/D2a` sobre a árvore **ao fim de cada fase de `SPEC-001`**. **Há DOIS marcos zero, e os dois têm de ser citados juntos porque medem universos diferentes** (§4.2):

| marco | instrumento | universo | valor em `7af0e4f` |
|---|---|---|---|
| **da `ADR-013`** | variante `D` + glossário, sobre **declaração e nome de arquivo** | 237 identificadores/nomes nas 3 superfícies | **27 acusados** — 19 `backend/tests` · 8 `frontend/src` · **0 `backend/src`** |
| **deste PRD** | `ast`, **todo nome ligado**, nos 2 arquivos de `U2` | 70 nomes ligados | **40 em português**, classificados à mão |

**A comparação entre fases tem de usar o MESMO instrumento dos dois lados** — comparar 27 com 40 não mede nada, e é a família de defeito que §4.1 e §4.2 documentam. Se o número de achados **do mesmo instrumento** subir entre duas fases aprovadas por `/qa` e `/review`, então doutrina comprou nada e a troca certa era aceitar 8% de falso positivo em `[AVISO]`.

---

### U2 · O retroativo de `backend/tests` — 2 arquivos, 40 identificadores, 0 mudança de comportamento

> **Como** dono deste repositório,
> **quero** que os 2 arquivos de teste que nasceram em português passem a inglês,
> **para que** o repositório não tenha duas convenções vivas na mesma suíte — sem que uma única asserção mude de sentido.

**Fronteira:** exatamente **2 arquivos**, e a enumeração é o critério:

```
backend/tests/sentimento/test_durabilidade_da_infra.py    →  <nome novo>.py
backend/tests/sentimento/test_etl_backlog_retomavel.py    →  <nome novo>.py
```

**O diretório `sentimento/` NÃO muda** — é exceção de §3.1/linha 9.

**A lista fechada dos 40 identificadores, congelada em `7af0e4f`.** Sem reticências, porque uma lista com reticências não é critério de aceite:

*`test_durabilidade_da_infra.py` — 15 nomes ligados, 7 em português:*
`chamadas` · `destino` · `espia` · `parcial` · `visto` · `test_checkpoint_faz_fsync_e_a_linha_ja_esta_no_arquivo_quando_ele_ocorre` · `test_worker_faz_fsync_no_parcial_antes_do_rename_atomico`

*`test_etl_backlog_retomavel.py` — 55 nomes ligados, 33 em português:*
`CheckpointVolatil` · `ContadorDeTrabalho` · `UNIVERSO` · `_conferir_saida_integra` · `_semear` · `alvo` · `ambiente` · `ausente` · `contador` · `esperado` · `limite` · `mortos_com` · `processados` · `processo` · `publicados` · `quantos` · `reinicio` · `residuos` · `retomada` · `so_linha_em_branco` · `test_cauda_truncada_e_descartada_e_o_resto_sobrevive` · `test_checkpoint_ausente_ou_vazio_devolve_janela_inteira` · `test_checkpoint_fora_da_janela_e_erro_e_nao_ruido` · `test_checkpoint_volatil_reprocessa_a_janela_inteira` · `test_drenagem_completa_processa_cada_arquivo_uma_unica_vez` · `test_janela_declarada_recusa_chave_repetida` · `test_janela_declarada_recusa_chave_vazia` · `test_linha_completa_ilegivel_e_corrupcao_e_nao_e_tolerada` · `test_matar_o_processo_no_meio_e_retomar_nao_duplica_nem_perde` · `test_pendente_preserva_a_ordem_declarada` · `test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial` · `test_segunda_drenagem_sem_falha_nao_refaz_nada` · `vazio_path`

**O comando que produziu a lista, na íntegra, para que ela seja re-derivável e não acreditada:**

```python
import ast
PT = {  # classificação feita À MÃO, token a token, por quem assina este PRD
  "chamadas","destino","espia","parcial","visto",
  "CheckpointVolatil","ContadorDeTrabalho","UNIVERSO","_conferir_saida_integra","_semear",
  "alvo","ambiente","ausente","contador","esperado","limite","mortos_com","processados",
  "processo","publicados","quantos","reinicio","residuos","retomada","so_linha_em_branco","vazio_path",
}
for f in ("test_durabilidade_da_infra.py", "test_etl_backlog_retomavel.py"):
    t = ast.parse(open(BASE + f).read()); names = set()
    for n in ast.walk(t):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store): names.add(n.id)
        elif isinstance(n, ast.arg): names.add(n.arg)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)): names.add(n.name)
    pt = sorted(x for x in names if x in PT or x.startswith("test_"))
    print(f, len(names), len(pt))
# test_durabilidade_da_infra.py 15 7
# test_etl_backlog_retomavel.py 55 33
```

> **⚠️ A classificação PT é HUMANA e está assinada, de propósito.** Ela **não** vem de dicionário: §1.3 mediu que dicionário erra em `so`, e `ADR-013/D2b` mediu que erra em `oi`, `sem`, `os`, `com` e `parametrize`. **A lista é fechada porque foi lida, não porque foi detectada** — e é isso que a torna um critério de aceite em vez de uma estimativa.

**Critérios de aceite:**

- **`CA-U2-1`** *(forma **a**, enumeração)* · Os 2 arquivos nomeados acima, e **somente** eles, mudaram de nome sob `backend/tests`. **Verificação:** `git diff --name-status master... -- backend/tests | grep -c '^R'` → **2**; e `git diff --name-only master... -- backend/tests backend/src | grep -v '^backend/tests/sentimento/test_\(durabilidade\|etl_backlog\)'` → **vazio**.
- **`CA-U2-2`** *(forma **b**, lista fechada)* · O script acima, re-rodado sobre os arquivos renomeados com o **mesmo conjunto `PT` literal**, devolve **`0`** em português nos dois — **e o total de nomes ligados continua `15` e `55`**. As duas metades importam: só a primeira seria satisfeita por apagar código.
- **`CA-U2-3`** *(forma **d**, falsificador comportamental — este é o critério que impede a renomeação de virar reescrita)* · A suíte inteira e a cobertura são **idênticas antes e depois**. **Verificação:** `bash backend/scripts/test.sh` → mesmo número de testes passando, mesmos percentuais por camada (`domain` / `use_cases` / `infra`), mesmo total de statements e branches. **Qualquer divergência reprova**, inclusive para mais.
- **`CA-U2-4`** *(forma **c**)* · Nenhum nome antigo sobrevive numa **citação viva**. O universo de citação, medido:
  ```
  $ git grep -l -F 'test_durabilidade_da_infra' 7af0e4f -- .   # 4 arquivos
  backend/README.md
  backend/src/modules/sentimento/infra/jsonl_checkpoint.py     # ← DENTRO de código de produção
  backend/tests/sentimento/test_etl_backlog_retomavel.py
  docs/INDEX.md                                                 # ← HISTÓRICA, não atualizar
  $ git grep -l -F 'test_etl_backlog_retomavel' 7af0e4f -- .   # 2 arquivos
  backend/README.md
  docs/INDEX.md                                                 # ← HISTÓRICA, não atualizar
  ```
  `[MEDIDO 2026-08-29 em 7af0e4f]` · **VIVAS a atualizar (3):** `backend/README.md`, `backend/src/modules/sentimento/infra/jsonl_checkpoint.py` (docstring de produção, linha 22), `backend/tests/sentimento/test_etl_backlog_retomavel.py`. **HISTÓRICA a NÃO tocar (1):** `docs/INDEX.md` — append-only por `CLAUDE.md`. **Verificação:** o verificador de âncora viva de §12, com a lista dos 2 nomes antigos, devolve `rc=0`.
- **`CA-U2-5`** *(forma **c**)* · **`sentimento/` continua `sentimento/`.** `test -d backend/tests/sentimento` → `rc=0`; `test -d backend/tests/sentiment` → `rc=1`. Critério de dois lados, e o segundo lado é o que pega o builder que "aproveitou para arrumar".
- **`CA-U2-6`** *(forma **c**)* · Se `[Q1]` decidir que evento de log vai para inglês, os 4 eventos PT de §4.4 **não** entram nesta unidade — `drain_etl_backlog.py` e `file_etl_worker.py` são `backend/src`, e `U2` toca `backend/tests`. **Verificação:** `git diff --name-only master... -- backend/src` → **1 arquivo apenas** (`jsonl_checkpoint.py`, só a docstring de `CA-U2-4`).

**Non-goals de `U2`:** não toca `backend/src` além da docstring de `jsonl_checkpoint.py`; não renomeia `sentimento/`; não muda nenhuma asserção; não muda nome de evento de log; não muda `janela_de_perda`.

**Falsificador de `U2`:** apague uma docstring, um `noqa` ou uma asserção junto com a renomeação e `CA-U2-3` **tem de reprovar**. Se a suíte passar com número diferente de statements, a renomeação virou reescrita e ninguém viu.

---

### U3 · O retroativo de `frontend/src` — e a prova de dois lados re-executada DEPOIS

> **Como** dono deste repositório,
> **quero** que os 4 arquivos do frontend passem a inglês, incluindo o diretório,
> **para que** a superfície que vai crescer na fase `05` cresça sobre nomes certos — **sem** que a bancada `D1.3b` deixe de provar o que prova.

**Fronteira:** 4 arquivos + 1 diretório + as citações **vivas** enumeradas em `CA-U3-4`.

| de | para (sugestão; o nome exato é do `/architect`) |
|---|---|
| `frontend/src/app/rotas.ts` | `frontend/src/app/routes.ts` (`ROTAS`→`ROUTES`, `Rota`→`Route`) |
| `frontend/src/components/ui/formatar-percentual.ts` | `format-percentage.ts` (`formatarPercentual`, `razao`, `casas`, `sinal`) |
| `frontend/src/features/painel/` | `frontend/src/features/panel/` |
| `frontend/src/features/painel/config.ts` | `panel/config.ts` (`configPainel`→`panelConfig`; nome-base já é inglês) |
| `frontend/src/features/painel/Filtro.tsx` | `panel/Filter.tsx` (componente `Filtro`→`Filter`) |

**Critérios de aceite:**

- **`CA-U3-1`** *(forma **a**)* · `find frontend/src -type f` devolve **4 arquivos**, todos com nome-base em inglês, e **nenhum segmento de caminho em português**. Enumeração explícita no diff, e o diff é revisado por inteiro — são 4 arquivos, cabe.
- **`CA-U3-2`** *(forma **f**, evidência — e é o critério que a `ADR-013` obriga)* · **O texto JSX não muda.** `grep -F 'Filtro: any resultado serve' frontend/src/features/panel/Filter.tsx` → **1 linha, `rc=0`**; e `grep -F 'any: true' frontend/src/features/panel/config.ts` → **1 linha, `rc=0`**. **A palavra `Filtro` sobrevive DENTRO da string e isso é correto**, porque a evidência é a posição sintática do token `any`, não o nome do arquivo.
- **`CA-U3-3`** *(forma **d**, a prova de dois lados, re-executada DEPOIS do rename)* · Os **quatro** casos de `ADR-011/D4` medidos novamente, na ordem, com o `rc` de cada um:
  ```
  # planta o violador (o protocolo já está escrito em frontend/README.md §3)
  printf 'export type Payload = Record<string, any>;\nexport const cache: Map<string, any> = new Map();\n' \
      > frontend/src/features/panel/tipos.ts
  npm --prefix frontend run lint          # espera 2 erros @typescript-eslint/no-explicit-any, rc=1   ← MORDE
  rm frontend/src/features/panel/tipos.ts
  npm --prefix frontend run lint          # espera 0 erro, rc=0                                       ← CALA
  harness rules --mode file --path frontend/src/features/panel/Filter.tsx --surface ci
                                          # espera saída de 0 byte, rc=0                              ← CALA
  harness rules --mode sweep              # espera 1 AVISO (browser-test-file-present), 0 BLOQUEIO, rc=0
  ```
  **⚠️ Antes de citar qualquer `rc` de `harness rules --mode file`: (1) `test -f <caminho>`, (2) `harness code-paths classify <caminho>`, (3) só então o `rc`** — ou use `--mode sweep`, que é imune aos três (`ADR-012/D4`). **Sem o passo (1), `rc=0` sobre caminho renomeado é falso-verde**, que é exatamente o defeito que esta unidade existe para não cometer.
- **`CA-U3-4`** *(forma **c**)* · **As citações VIVAS, enumeradas, e nenhuma HISTÓRICA tocada.**
  **VIVAS a atualizar (5 arquivos):** `harness.toml` (5 linhas com `features/painel`, **incluindo as 4 de `serie.tsx`**, que é caminho hipotético e continua sendo) · `frontend/README.md` (**4 lugares** — o protocolo de reprodução das linhas 33, 85-86, 118-121 e 379-383) · `backend/README.md` (linhas 455-457) · `docs/context/plataforma-dados/tasks.toml` · `docs/context/plataforma-dados/handoff_to_builder.md`.
  **HISTÓRICAS a NÃO tocar (7 arquivos):** `docs/INDEX.md` · `docs/adr/ADR-003` · `ADR-011` · `ADR-012` · `docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` · `docs/proposta-discovery.md` · `docs/specs/PRD-001-plataforma-dados.md`.
  **Verificação:** o verificador de §12 com os nomes antigos `Filtro.tsx`, `painel/`, `rotas.ts`, `formatar-percentual.ts`, `configPainel`, `ROTAS`, `formatarPercentual` → **`rc=0`**. E `git diff --name-only master... -- docs/INDEX.md docs/adr docs/plans docs/proposta-discovery.md docs/specs/PRD-001-plataforma-dados.md` → **vazio**.
- **`CA-U3-5`** *(forma **c**)* · A sonda de `harness.toml:238-252` é atualizada junto: o caminho documentado `frontend/src/__sonda__/Filtro.test.tsx` passa a `Filter.test.tsx`, **e a medição que o acompanha é re-executada e o `rc` republicado** — porque a linha afirma um `rc` **medido**, e um `rc` medido sobre outro caminho é outro número. **Verificação:** `grep -c 'Filtro' harness.toml` → **0**.
- **`CA-U3-6`** *(forma **c**)* · `harness code-paths classify` sobre cada um dos 4 caminhos novos devolve **`producao`** — a mesma classificação de hoje. Se um deles cair para `nao-producao`, o rename tirou `frontend/src` do universo de regra **em silêncio**, que é o defeito de `ADR-009/D3`.

**Non-goals de `U3`:** não traduz string de UI (§3.2); não cria `Filter.test.tsx`; não mexe no aviso `web-fullstack.browser-test-file-present`, que continua sendo 1 aviso; não toca `backend/`.

**Falsificador de `U3`:** se `CA-U3-3` for medido **antes** do rename, ou se qualquer `rc` for citado sem o `test -f` que o precede, a unidade **não passou** — mesmo com todos os comandos verdes. **O verde sem o passo (1) é o falso-verde que `ADR-012` nomeia como "barato de cometer e caro de detectar".**

---

### U4 · As superfícies de contrato e de consulta — decisão escrita, renomeação nenhuma

> **Como** dono deste repositório,
> **quero** que as três superfícies que não são identificador nem documento — evento de log, coluna de contrato, segmento de URL — tenham fronteira escrita,
> **para que** a próxima task não decida por hábito, como as duas de hoje decidiram.

**Esta unidade entrega TEXTO, não código.** Ela é a que fecha a lacuna que §4.4 mediu: 4 eventos em português e 5 em inglês nascidos no mesmo mês, com o `INDEX` registrando que *"a divergência é decisão de leitura do agente, não citação do owner"*.

**Critérios de aceite:**

- **`CA-U4-1`** · A linha 10 de §3.1 (evento de log) deixa de ser `⏸ NÃO DECIDIDO` e passa a ter decisão + rótulo de força, **depois** de `[Q1]` ser respondida.
- **`CA-U4-2`** · A linha 11 (coluna de contrato) fica escrita como **exceção com dono**: o dono é `ADR-008/D3`, e mudá-la é ato daquela ADR. **Verificação:** `grep -F 'janela_de_perda' <arquivo de convenção>` → `rc=0`, e a linha cita `ADR-008/D3`.
- **`CA-U4-3`** · A linha 12 (segmento de URL) idem, depois de `[Q2]`.
- **`CA-U4-4`** · **Se `[Q1]` decidir "inglês", a migração dos 4 eventos é unidade PRÓPRIA, futura, e NÃO entra em `U2` nem em `U3`** — porque ela tem um risco que nenhuma renomeação de identificador tem: o consumidor está fora deste repositório e a quebra é silenciosa (§5.1, classe D). O plano dessa unidade tem de conter um período de **emissão dupla** ou uma prova de que não há consumidor. `[NÃO SEI]` qual das duas — depende de `[Q1]`.

**Non-goals de `U4`:** não renomeia nenhum evento, nenhuma coluna e nenhuma rota. **Zero linhas de código.**

---

## 7. Regras de negócio transversais

**`RN-1` · Renomear é ATÔMICO com as citações vivas, no mesmo commit.** Um caminho renomeado cujo comando documentado não foi atualizado devolve `rc=0` e 0 byte — indistinguível de *"avaliado e limpo"*. `ADR-012` já nomeou esse terceiro significado de `rc=0` como *"barato de cometer e caro de detectar"*.

**`RN-2` · Citação HISTÓRICA não se atualiza.** `docs/INDEX.md` é **append-only por `CLAUDE.md`**; ADR e plano são decisões **datadas**, verdadeiras no rev que declaram. A enumeração viva/histórica está em `CA-U2-4` e `CA-U3-4`, e ela é normativa: um builder que receber *"atualize todas as citações"* produz a violação que a regra evita.

**`RN-3` · Renomear o continente é permitido; traduzir o conteúdo citado, não.** A lista fechada do que é evidência está em §5.3.

**`RN-4` · Nenhuma `[[rules.own]]` de idioma, nenhum alvo de `make` de idioma, nenhuma allowlist de idioma.** `ADR-011/D1.10` declara que uma `[[rules.own]]` de idioma **REPROVA a fase**; `ADR-013/D2b` mediu que a allowlist derivada de hoje é **vazia** e produz **7 falsos positivos** no corpus de retenção, e que **entrada de allowlist é indistinguível de bypass**. O gatilho que reabre é o de `ADR-013/D2e`, e só ele.

**`RN-5` · Todo `rc` de `harness rules --mode file` citado neste ciclo vem precedido de `test -f` e de `harness code-paths classify`, nesta ordem** — ou usa `--mode sweep`, imune aos três `[DOC: ADR-012/D4]`. Um `rc` sem os dois passos anteriores **não é evidência**, e o PRD não o aceita como critério cumprido.

**`RN-6` · Todo critério de aceite congela o REV junto com a lista.** §4.1 mediu que o universo de `backend/src` cresceu **de 23 para 77 em um dia**. Uma lista fechada sem rev é uma lista aberta com aparência de fechada.

**`RN-7` · Nenhuma renomeação atravessa a fronteira de §3.3.** O vocabulário de componentes e os caminhos derivados ficam. `CA-U2-5` verifica isso pelos **dois** lados, e o segundo lado (`test -d backend/tests/sentiment` → `rc=1`) é o que pega o builder bem-intencionado.

---

## 8. Non-goals — o que este PRD declara FORA, e com o motivo

| non-goal | motivo |
|---|---|
| **portão bloqueante de idioma** | `ADR-013/D2` recusou 3 candidatos; §12 recusa mais 2. O gatilho de reabertura está em `ADR-013/D2e` |
| **traduzir `docs/`, ADR, SPEC, plano, `tasks.toml`, `CLAUDE.md`, `README`** | destruiria as âncoras textuais que `ADR-011`, `ADR-012` e o plano `01` usam para se citar. §3.1/linha 7 |
| **traduzir mensagem de commit e corpo de PR** | §3.1/linha 6 |
| **traduzir string de UI e microcopy de operador** | **já decidido em `SPEC-001` §3.8 e `PRD-001` §9/`Q14`** — §3.2. Reabrir aqui criaria duas verdades |
| **renomear `sentimento` / `convergencia` ou os caminhos derivados** | §3.3, `[DECISÃO-OWNER: 2026-08-29]`. Custo medido da alternativa: 400 ocorrências, 55 arquivos, 84 tasks, rótulos de Jira |
| **renomear `janela_de_perda` ou qualquer coluna de contrato** | §3.4. É ato de `ADR-008/D3`, e muda o `sha256` de toda projeção |
| **renomear os 4 eventos de log nesta rodada** | `CA-U4-4`. O consumidor está fora do repositório e a quebra é silenciosa |
| **criar `Filter.test.tsx` ou fechar o aviso `browser-test-file-present`** | é dívida de outra trilha; `harness rules --mode sweep` continua com **1 aviso** depois de `U3` |
| **instalar `langdetect` ou plugin de `flake8`** | `[NÃO MEDIDO]` nos dois casos, e instalar dependência não é ato deste ciclo (`ADR-011/D4`) |
| **criar task no tracker** | unidade de trabalho é do `/tech-lead`. Este PRD não criou, editou nem comentou nada em CST |
| **mover o ledger** | `INIT` antes, `INIT` depois. `dispatch` e `advance` são do coordenador; `approve spec` e `approve build` são do **owner** |

---

## 9. `[INFERRED]` — três, com motivo e custo de reversão

Nenhuma é *unknown* crítico. As três derivam de convenção já declarada, e as três revertem sem migração de dado. **Todo *unknown* crítico está em §11 como pergunta.**

**`[INFERRED: identificador de TESTE entra no universo, e "identificador" inclui parâmetro, variável local e constante de módulo]`**
*Motivo:* a citação do owner não qualifica camada (*"todo código gerado"*), e `harness.toml [code_paths] include_prefixes` lista `backend/tests/` como código a par de `backend/src/`. A extensão a parâmetro/local/constante não é interpretação criativa: é a leitura literal de *"var, tudo"*, e §4.2 mediu que ela **dobra o universo** (19 → 40). Inferir o contrário deixaria `so_linha_em_branco` e `quantos` em português dentro de um arquivo cujo nome de função acabou de virar inglês.
*Custo de reversão:* baixo antes de `U2`; **alto depois** — desfazer exigiria um segundo rename sobre o mesmo alvo. **É por isso que esta inferência está no topo da lista de confirmação de §11.**

**`[INFERRED: nome de DIRETÓRIO entra no universo, exceto o derivado de `components`]`**
*Motivo:* *"nome dos arquivos"* no contexto de *"ta tudo em portugues"*; e um diretório é metade de um caminho. Herdada de `ADR-013/D3`.
*Custo de reversão:* **`painel/` é a única ocorrência afetada** — `sentimento/` já está excetuado por §3.3. Reverter custa um rename de diretório e a atualização de 5 citações vivas. Falsificável em uma frase do owner.

**`[INFERRED: documentação, commit e PR continuam em português]`**
*Motivo:* o corpus inteiro de decisão deste repositório é português; `CLAUDE.md` é português; **18 dos 20 últimos commits** têm assunto em português, e os outros 2 são mensagens de merge geradas pelo GitHub — sem idioma de autor `[MEDIDO 2026-08-29: `git log --format='%s' -20 7af0e4f`, n=20]`.
*Custo de reversão:* **o mais alto dos três, e por isso a linha está escrita.** Traduzir o corpus quebraria **as duas formas de âncora de uma vez** — a textual, que `ADR-012` adotou justamente porque número de linha envelhece; e a de citação literal de owner, que os rótulos `[PREMISSA-OWNER]` protegem.

---

## 10. GAPs nomeados por esta rodada

### `[GAP G1]` — a coluna de contrato em português não tem gatilho de reabertura · **severidade: média, custo de esquecer alto**

§3.4 excetua `janela_de_perda` porque `ADR-008/D3` a fixou e o `sha256` da projeção depende dela. **Mas o dono declarado da fórmula é `T-07.12` / `T-07.13` — fase `07`, componente `web`, e essa fase ainda não existe.** Quando ela existir, alguém vai escrever o consumidor e a pergunta *"a coluna vira `loss_window`?"* volta, com dado já gravado atrás dela. **O gap é que ninguém marcou o momento.** Endereço: a SPEC de `codigo-em-ingles` escreve o gatilho, ou a `ADR-008` ganha uma linha. Não é bloqueante para `U1`–`U3`.

### `[GAP G2]` — não há prova de que o evento de log não tem consumidor · **severidade: alta se `[Q1]` responder "inglês"**

§4.4 mediu 4 eventos em português. `[NÃO MEDIDO]` se alguma query, alerta ou coletor os consome — **não há nada versionado neste repositório que os leia, e o que roda na VPS do owner está fora do meu alcance.** Se `[Q1]` responder "inglês" sem essa medição, a migração é feita às cegas sobre uma superfície cuja quebra é silenciosa. Endereço: **o owner responde se existe consumidor**; se existir, `CA-U4-4` exige emissão dupla.

### `[GAP G3]` — o repositório não tem glossário, e a chave que o apontaria está vazia · **severidade: média, e é a peça que converteria doutrina em portão**

```
$ harness policy --key glossary_doc      # 0 byte, rc=0
$ grep -n 'glossary' harness.toml        # nenhuma linha
$ ls docs/glossario* docs/glossary*      # nenhum arquivo
```

`[MEDIDO 2026-08-29]` · **O bootstrap de todo agente deste repositório manda ler `glossary_doc`, e a chave aponta para o vazio.** `ADR-013/D2e` mediu que um glossário mínimo (n=12) reduz os falsos positivos do melhor detector de **7/88 para 5/88** — fecha `oi`, e **estruturalmente não fecha** `sem`, `serie` e `parametrize`, que são vocabulário de biblioteca. ⇒ **são duas listas, não uma.**

**A `ADR-013` em `6aaefb1` promoveu esta dívida a decisão própria — `D4` — e endereçou o dono ao `/pm`**, com uma ressalva que este PRD **acata literalmente**:

> *"Endereço natural: o `/pm`, no PRD de `codigo-em-ingles` ou numa trilha própria, com julgamento técnico do `quant-architect` … **Se o `/pm` quiser cobri-lo, que seja como dívida referenciada, não como requisito desta feature.**"* `[DOC: ADR-013/D4]`

**⇒ Este PRD a cobre como dívida referenciada e NÃO como requisito.** Nenhum critério de aceite de `U1`–`U4` depende do glossário existir, e nenhuma unidade o entrega. **A razão é de escopo e está medida na própria `D4`:** preencher `glossary_doc` é escrever vocabulário de domínio (`OI`, `CVD`, `funding`, `basis`, `knowledge_time`, `nature`, `LOCF`), o que é trabalho de **produto e domínio** com julgamento do `quant-architect` — que `[agents.by_component]` declara para `sentimento`, `charts`, `convergencia` e `backtest`. Enfiá-lo numa feature sobre idioma de identificador é a ampliação de escopo que a `ADR-013` nomeia.

**Recomendação de endereço, com rótulo próprio:** **trilha própria, não esta feature** — `[INFERRED: recomendação de PM; o glossário tem 4 componentes de domínio como universo e `codigo-em-ingles` tem 3, e a interseção é `sentimento` apenas]`. Esta dívida é **anterior** a esta feature; fica declarada porque é o único caminho conhecido de reabrir `RN-4`.

### `[GAP G4]` — `harness` não tem `rename`, e o `INDEX` não registra a substituição de feature · **severidade: baixa, custo de esquecer médio**

`docstrings-em-ingles` está em `REJECTED` e `codigo-em-ingles` em `INIT` `[MEDIDO 2026-08-29: `harness pipeline state`]`. O ledger preserva os dois. **Mas quem ler `docs/INDEX.md` daqui a um mês não encontra a ponte entre os dois nomes**, porque nenhuma linha a escreve. Endereço: a linha que este PRD acrescenta ao `INDEX` a escreve. **Fechado por esta rodada.**

---

## 11. Perguntas em Aberto — três, classificadas, com quem decide

> **Regra que este PRD honra:** *unknown* crítico **nunca** vira `[INFERRED]` silencioso. As três abaixo são as que eu **não decido**, e digo por quê em cada uma.

### `[Q1]` · Nome de evento de log e chave de `extra=` vão para o inglês? — **BLOQUEANTE para `U4`, não para `U1`–`U3`** · decide: **owner**

**Estado:** 4 em português, 5 em inglês, medidos em §4.4. A divergência nasceu **hoje**, nos mesmos commits, e o `INDEX` registra que foi decisão de agente.
**Por que eu não decido:** não é identificador (não quebra import) nem documento (não é prosa). É **chave de consulta operacional**, e o consumidor dela vive fora deste repositório — `[GAP G2]`. Uma renomeação errada aqui devolve zero linhas em silêncio.
**Custo de deixar aberta:** cada task futura decide por hábito, e o segundo vocabulário de observabilidade cresce. **É barata de responder e cara de adiar.**
**Recomendação, com rótulo próprio:** **inglês, com emissão dupla ou com prova escrita de que não há consumidor** — `[INFERRED: recomendação de PM; consistência com os 5 eventos ingleses de hoje, e o custo de unificar sobe com o número de eventos]`. **Não é declaração do owner.**

### `[Q2]` · Segmento de URL (`"/painel"`) é código ou é superfície de produto? — **não bloqueante** · decide: **owner**

**Estado:** `ROTAS = { painel: "/painel" }`. A **chave** `painel` é identificador (§3.1/linha 1 ⇒ inglês). O **valor** `"/painel"` aparece na barra de endereços do usuário.
**Por que eu não decido:** ele está exatamente sobre a linha que §3.2 traçou. Se URL é superfície visível, ela cai sob `SPEC-001` §3.8 (pt-BR) e **não** sob este PRD; se é rota interna de aplicação single-user, é código.
**Custo de deixar aberta:** hoje é **1 rota**. Na fase `05` são muitas, e mudar URL depois quebra bookmark e link.
**Recomendação:** **inglês** — `[INFERRED: recomendação de PM; sistema single-user sem SEO nem link externo, e o custo de trocar depois é monotônico crescente]`.

### `[Q3]` · Onde a convenção mora fisicamente? — **não bloqueante, mas `CA-U1-1` não fecha sem ela** · decide: **`/architect`**

**Estado:** `[NÃO SEI]`. Os candidatos são `CLAUDE.md` (é onde o owner declara regra de casa, e já carrega o vocabulário fechado), o `README.md` da raiz (é onde `T-01.7`/`D1.10` colocou a frase de docstring, o que dá precedente) e um `docs/CONVENCOES.md` novo.
**Por que eu não decido:** a escolha tem consequência de **enforcement**, não de arrumação — `CLAUDE.md` é lido no bootstrap de todo agente; o `README` da raiz, não necessariamente. E há um precedente com medição (`D1.10`) que eu não sou o dono de reinterpretar.
**Custo de deixar aberta:** nenhum até a SPEC. **`CA-U1-1` está escrito com o `<arquivo>` como variável de propósito**, para que a SPEC o preencha em vez de o PRD adivinhar.

---

## 12. O mecanismo automático que eu proponho — e as duas variantes que eu FALSIFIQUEI antes de propor

**Eu não proponho detector de idioma.** `ADR-013/D2` mediu três candidatos e recusou os três; nada do que eu medi contradiz isso, e §1.3 acrescenta duas confirmações de campo obtidas por acidente no mesmo dia.

**O que eu proponho é um verificador de ÂNCORA VIVA** — que não decide idioma. Ele decide **igualdade de string sobre um conjunto enumerado**, que é decidível:

> Para cada par `(nome_antigo, nome_novo)` da tabela de renomeação desta feature, **nenhuma ocorrência de `nome_antigo` sobrevive no conjunto VIVO** — `harness.toml`, os `README`, `docs/context/`, `backend/src`, `backend/tests`, `frontend/src`. **O conjunto HISTÓRICO (`docs/INDEX.md`, `docs/adr/`, `docs/plans/`, `docs/specs/`) fica fora por `RN-2`.**

### 12.1 A prova de dois lados, medida em bancada, fora do repositório do owner

Bancada num diretório temporário, sobre uma árvore **extraída** de `7af0e4f`. **Nenhum arquivo de `backend/` ou `frontend/` do repositório foi tocado.**

**Lado MORDE** — árvore intacta, nomes antigos ainda citados:

```
$ check_anchors.sh "$BENCH" 'Filtro.tsx' 'painel/'
[ANCORA MORTA] 'Filtro.tsx' ainda citado:      … 8 ocorrências (harness.toml, frontend/README.md ×4,
                                                  handoff_to_builder.md, tasks.toml)
[ANCORA MORTA] 'painel/' ainda citado:         … 16 ocorrências (harness.toml ×5, frontend/README.md ×9,
                                                  backend/README.md ×2)
rc=1
```

**Lado CALA** — depois do rename **atômico** (diretório + arquivo + componente + as 5 citações vivas):

```
$ check_anchors.sh "$BENCH" 'Filtro.tsx' 'painel/' 'configPainel'
rc=0
$ grep -n 'resultado serve' "$BENCH/frontend/src/features/panel/Filter.tsx"
10:  return <p>Filtro: any resultado serve</p>;      ← a evidência SOBREVIVEU
```

`[MEDIDO 2026-08-29, bancada sobre árvore extraída de 7af0e4f; MORDE 24 ocorrências / rc=1, CALA 0 / rc=0]`

> **⇒ As duas metades passam, e a metade CALA passa COM a evidência intacta** — que é a condição que `ADR-013/D3` impõe e que um verificador ingênuo violaria.

### 12.2 As duas variantes que eu construí e RECUSEI, com o número que recusa cada uma

**Variante 1 · "todo caminho citado num documento existe na árvore".** Parecia a generalização óbvia. **Cai sobre corpus de retenção** — a árvore **já corrigida**, que não foi usada para construí-la:

```
$ … | while read p; do [ -e "$BENCH/$p" ] || echo "[FP] $p"; done
[FP] frontend/src/features/panel/serie.<ext>
[FP] frontend/src/features/panel/serie.tsx
[FP] frontend/src/features/panel/tipos.ts
```

`[MEDIDO 2026-08-29, n=3 falsos positivos sobre a árvore corrigida]` · **Os três são violadores plantados por receita** — `frontend/README.md` os cria com `printf`, mede, e os remove com `rm` na linha seguinte. Eles **têm** de ser citados e **não** devem existir. ⇒ **A variante genérica reprova o protocolo de reprodução deste próprio repositório**, e o remédio (allowlist) é o bypass que `RN-4` recusa. **Recusada.**

**Variante 2 · verificador com token de PALAVRA (`Filtro`) em vez de CAMINHO (`Filtro.tsx`).** Sobre a árvore **já corrigida**:

```
$ check_anchors.sh "$BENCH" 'Filtro'
[ANCORA MORTA] 'Filtro' ainda citado:
    harness.toml:238,241,252                                  ← Filtro.test.tsx, a sonda de §5.2
    frontend/README.md:250                                    ← a tabela da bancada D1.3b
    frontend/src/features/panel/Filter.tsx:10                 ← O TEXTO JSX QUE NÃO SE TRADUZ
rc=1
```

`[MEDIDO 2026-08-29, n=5 falsos positivos]` · **Duas das cinco linhas são exatamente a evidência que `CA-U3-2` obriga a preservar.** Um verificador que morde a prova que o PRD manda proteger transforma o critério de aceite em contradição. ⇒ **Recusada. O token do verificador é o CAMINHO, nunca a palavra.**

### 12.3 O que este mecanismo NÃO é, dito com todas as letras

**Não é portão de idioma, e não vira um.** Ele não sabe o que é português. Ele sabe que um nome enumerado por um humano não deve mais aparecer num conjunto enumerado de arquivos. **Ele expira quando a renomeação termina** — e isso é virtude, não limitação: um verificador com prazo não vira cerimônia que todo builder edita, que é o falsificador nº 4 de `ADR-012/D5(b)` e o que matou o arquivo-dourado de `ADR-013/D2c`.

**Onde ele mora:** `[NÃO SEI]` — `make`, script de task, ou apenas o critério de aceite escrito e rodado à mão pelo `/qa`. **Dado que ele expira, "à mão no `/qa`" é defensável e é minha recomendação** `[INFERRED: recomendação de PM; criar alvo de `make` para um verificador temporário paga custo permanente por benefício de duas tasks]`. Decide: `/architect`.

---

## 13. Registro da varredura de discovery — o que foi perguntado, o que ficou

**Sete dimensões varridas contra os artefatos. `[COBERTO: fonte]` ou `[GAP]`, sem meio-termo.**

| dimensão | estado | onde |
|---|---|---|
| **stakeholders e consumidores** | `[COBERTO: PRD-001 §10/GAP G5]` — operação de um só, single-user · **e `[GAP]` na metade que importa aqui:** o consumidor de **log** é desconhecido | `[GAP G2]`, `[Q1]` |
| **volumetria e escala** | `[COBERTO: §4 deste PRD]` — 6 arquivos, 49 identificadores PT (40 backend + 9 frontend), 12 arquivos de citação. **Universo pequeno e enumerável — é o que torna `U2`/`U3` uma fase só** | §4.2, §4.3, §5.2 |
| **requisitos não-funcionais** | `[COBERTO por ausência, e declarado]` — não há latência nem frescor nesta feature; o único NFR é **`CA-U2-3`: comportamento idêntico antes e depois** | §6/`U2` |
| **estados e casos de borda** | `[COBERTO]` — **fora de ordem:** `U1` antes de `U2`/`U3` (`ADR-013/D1`) · **duplicado:** rename parcial deixando citação viva (`RN-1`) · **remoção:** citação histórica reescrita (`RN-2`) · **parcial:** suíte verde com statements diferentes (`CA-U2-3`) · **vazio:** `rc=0` com 0 byte sobre caminho inexistente (`RN-5`) | §7 |
| **contrato e dependências** | `[COBERTO]` — 6 classes de superfície com o mecanismo de falha de cada uma; e **duas superfícies de contrato que a `ADR-013` não listava** | §5.1, §4.4, §4.5 |
| **métricas e observabilidade** | **`[GAP]`, e é o mais consequente desta rodada** — a superfície de observabilidade **é ela própria** um objeto do universo, e ninguém decidiu o idioma dela | §4.4, `[Q1]`, `[GAP G2]` |
| **escopo e non-goals** | `[COBERTO]` — 11 non-goals escritos com motivo; 12 linhas de fronteira; 3 exceções nomeadas | §3.1, §8 |

**Dois rounds levados ao owner, e o que voltou:**
- **round 1** (levado pelo `/architect` via `ADR-013/D3`): *o vocabulário de componentes está dentro ou fora?* → **FORA**, `[DECISÃO-OWNER: 2026-08-29, escolha de menu]` (§3.3). E: *a feature nova existe, com os dois gates de owner no caminho?* → **aceito explicitamente**.
- **round 2** (o que este PRD devolve, em §11): **`[Q1]` evento de log** · **`[Q2]` segmento de URL** · **`[Q3]` onde a convenção mora** — a terceira é do `/architect`, não do owner.

**O que NÃO foi perguntado ao owner, de propósito:** a confirmação das 3 linhas `[INFERRED]` de §9. Elas estão registradas com motivo e custo de reversão, e nenhuma é *unknown* crítico. **Mas a primeira — identificador de teste inclui parâmetro e local — tem custo de reversão que sobe depois de `U2`**, e por isso ela encabeça a lista de confirmação barata do handoff.

---

## 14. O que este PRD NÃO decide, e quem decide

| item | decide |
|---|---|
| os nomes novos exatos de arquivo, diretório e identificador | `/architect` na SPEC; as sugestões de `U3` são sugestões |
| onde a convenção mora fisicamente (`[Q3]`) | `/architect` |
| onde o verificador de §12 mora, e se ele vira alvo de `make` | `/architect` |
| **se o plano `01` é citação VIVA ou HISTÓRICA (§5.2.1)** — a `ADR-013` diz VIVA, este PRD diz HISTÓRICA, e a minha recomendação é uma terceira leitura | **`/architect`** — o plano é dele, e a decisão tem de dizer o que fazer com o veredito de `/qa` dado sobre o nome antigo |
| o faseamento e a ordem de execução dentro de cada unidade | `/architect` no plano |
| as tasks | `/tech-lead`, depois de `SPEC_APPROVED` |
| **evento de log (`[Q1]`) e segmento de URL (`[Q2]`)** | **owner** |
| **`approve codigo-em-ingles spec` e `approve codigo-em-ingles build`** | **owner** — `CLAUDE.md` proíbe agente, e não há rota que os evite |
| reabrir a exceção da coluna de contrato | `ADR-008/D3`, no gatilho de `[GAP G1]` |
| reabrir `RN-4` (portão de idioma) | apenas o gatilho de `ADR-013/D2e`: glossário sob `glossary_doc` **mais** lista de vocabulário de biblioteca, medidos sobre corpus de retenção de n ≥ 88, com **0** falso positivo e ≥ 90% de acerto |

---

## 15. Gate de handoff — a checklist, conferida

- [x] **cada story tem fronteira clara e cabe numa fase** — `U1` (só convenção) · `U2` (2 arquivos) · `U3` (4 arquivos + 1 diretório + 5 citações vivas) · `U4` (zero código). Nenhuma atravessa componente.
- [x] **as regras bloqueantes em vigor são endereçáveis** — `harness rules list --severity block` → **7 regras** (`core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`, `web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`) `[MEDIDO 2026-08-29]`. **Nenhuma é sensível a idioma**, e `CA-U1-4` exige que a lista seja **idêntica** depois — a renomeação não pode acrescentar nem remover nenhuma.
- [x] **tipos e contratos críticos definidos, ou `TBD` com dono e data** — as 6 classes de superfície (§5.1) e a taxonomia viva/histórica (§5.2) estão definidas; as 3 `⏸ NÃO DECIDIDO` de §3.1 têm dono nomeado em §11 e são `[Q1]`, `[Q2]`, `[Q3]`.
- [x] **non-goals escritos** — 11, com motivo (§8), mais os non-goals por unidade em §6.

**Classificação dos gaps, pela regra do `/pm`:** **bloqueante** → nenhum para `U1`–`U3`; `[Q1]` é bloqueante **apenas para `U4`**, e `U4` não trava as outras três. **Não-bloqueante** → `[Q1]`, `[Q2]`, `[Q3]` em §11; `[GAP G1]`–`[GAP G4]` em §10. **Inferível** → os três `[INFERRED]` de §9.

⇒ **Não há `feedback_to_pm.md`, porque não há bloqueante que impeça o `/architect` de escrever a SPEC de `U1`, `U2` e `U3`.**
