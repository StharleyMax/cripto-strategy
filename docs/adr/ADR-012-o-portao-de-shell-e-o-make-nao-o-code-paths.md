# ADR-012 — O que precisa morder e não é fonte sob `code_paths` mora no `make`

**Data:** 2026-08-29 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §12
**Fase/Epic:** F5a · `CST-1` · **Componente alvo:** `docs`
**Origem:** a dívida que `harness.toml:176-215` declara com as duas causas separadas e a frase *"quem decide é `/architect`"*, mais a lacuna medida de `docs/gate-de-design.md` §"O que a mutação mostrou"

**Fecha, e as três estavam abertas com dono no `/architect`:**

| o que estava aberto | onde | decisão |
|---|---|---|
| `scripts/**` e `*.sh` fora de `code_paths`; os dois executáveis que **são** o portão sem governo | [`harness.toml:176-215`](../../harness.toml), [`backend/README.md`](../../backend/README.md) §"os dois `.sh` que são o portão" | **D1** recusa o glob · **D2** difere `shellcheck` · **D3** fecha com `bash -n` |
| a atribuição de dono de `Q16` desfazível em silêncio (5 mutações) | [`docs/gate-de-design.md`](../gate-de-design.md) | **D5** |
| onde mora, em geral, o portão que o `harness` não alcança | — | **D4** (a regra que gera as outras) |

---

## Contexto

`ADR-011` moveu quatro portões (`import-linter`, ESLint, `ruff`/`mypy`, o assert de interpretador) de dentro do `harness` para o `make`, e `ADR-011/D3b` pôs o `make` dentro do `pre-push`. **Este repositório passou a ter DUAS superfícies de enforcement, e só uma delas foi documentada como escolha.** A pergunta que ficou sem resposta escrita é: quando uma propriedade precisa morder, **qual das duas** a recebe?

A dívida de `scripts/**` chegou formulada como pergunta de `code_paths` — *"acrescentar `*.sh` a `include_globs`?"*. **A formulação é o defeito.** Ela pressupõe que o `harness` é o lugar, e a partir daí só existem respostas ruins.

### O que está medido hoje, e o que cada número significa

**Os dois executáveis que constituem o portão de fronteira não são avaliados** — e `rc=0` aqui **não** quer dizer limpo:

```
$ harness code-paths classify backend/scripts/boundaries.sh
nao-producao: backend/scripts/boundaries.sh — nenhum include_prefixes casa ['backend/src/', 'backend/tests/', 'frontend/src/']   # rc=1
$ harness code-paths classify scripts/hooks/pre-push.pre-harness
nao-producao: scripts/hooks/pre-push.pre-harness — nenhum include_prefixes casa [...]                                            # rc=1
$ harness rules --mode file --path backend/scripts/boundaries.sh --surface ci          # rc=0, saída de 0 byte
$ harness rules --mode file --path scripts/hooks/pre-push.pre-harness --surface ci     # rc=0, saída de 0 byte
```

`[MEDIDO 2026-08-29 nesta árvore, worktree `chore/architect-dividas-fase-01` sobre `48d5500`]`

**⚠️ E o mesmo `rc=0` com saída vazia sai por DOIS motivos incompatíveis, que só `classify` separa.** Plantei um violador de camada em `backend/src/modules/sentimento/domain/__sonda_camada__.py` (`from src.modules.sentimento.use_cases…`) — ele está **dentro** de `code_paths`, foi **avaliado**, e nenhuma regra o pegou:

```
$ harness code-paths classify backend/src/modules/sentimento/domain/__sonda_camada__.py
producao: … — include_prefixes + include_globs casam e nada exclui        # rc=0
$ harness rules --mode file --path <o mesmo> --surface ci                 # rc=0, saída de 0 byte
```

`[MEDIDO 2026-08-29, violador efêmero, removido da árvore no mesmo comando]`

⇒ **`rc=0` de `harness rules --mode file` é ambíguo entre *"avaliado e limpo"* e *"nunca avaliado"*, e o desempate é `code-paths classify` (rc=0 vs rc=1).** Quem citar o `rc=0` sem o `classify` ao lado publicou meia medição — é a mesma classe das nove instâncias de *"método de busca que não vê o que afirma ver"* desta trilha.

## Decisão

### D1 · `*.sh` **não** entra em `include_globs` — e há um terceiro motivo, além dos dois do `/review`

O `/review` mediu dois, e os dois valem: (i) falta também o **prefixo** — `include_prefixes` é `['backend/src/', 'backend/tests/', 'frontend/src/']` e nenhum alcança `backend/scripts/` nem `scripts/hooks/`; (ii) **zero regra de shell existe** nos packs instalados. Declarar o glob produziria *"parecendo coberto"*, que `ADR-009/D3` nomeia como pior que a lacuna declarada.

**O terceiro é decisivo e é novo: o glob `*.sh` NÃO ALCANÇA os dois arquivos que mais importam.** O portão de push e o portão de commit não têm extensão:

```
$ ls scripts/hooks/
commit-msg   pre-push.pre-harness
```

`[MEDIDO 2026-08-29]` · **`commit-msg` é o portão que o `CLAUDE.md` declara em voz alta** (*"não é convenção — é portão"*), e `pre-push.pre-harness` é `ADR-011/D3b`. Um glob por extensão os deixa de fora **por construção**, e fecharia a lacuna exatamente onde ela não dói, publicando cobertura no lugar errado. Universo de shell real, por conteúdo e não por extensão: **9 arquivos** — 5 em `backend/scripts/`, 2 em `scripts/`, 2 em `scripts/hooks/` `[MEDIDO 2026-08-29: os 9 enumerados um a um em D3 abaixo, cada um com seu `rc` impresso]`.

### D2 · `shellcheck` **não** é adotado hoje — e a razão não é gosto, é `1.8'`

`shellcheck` **não existe nesta máquina** `[MEDIDO 2026-08-29: `command -v shellcheck` → rc=1, saída vazia]`. O item `1.8'` do plano `01` exige que **toda ferramenta adotada como portão nasça com prova de que MORDE e de que CALA**, *"uma sem a outra não conta"*. **Com a ferramenta ausente, nenhuma das duas metades é executável** — eu não posso rodar o violador plantado nem o corpus legítimo. Adotá-la agora seria declarar um portão cujo teste de admissão é `[NÃO MEDIDO]` nas duas pontas, que é precisamente a forma de *"ferramenta que existe e ninguém roda"* que `ADR-011` inteira existe para recusar.

**O que eu NÃO afirmo, e é importante que não fique implícito:** não afirmo que `shellcheck` seja desnecessário. **`[NÃO MEDIDO]`** — não rodei a ferramenta, logo não sei o que ela pegaria nestes 9 arquivos.

**Gatilho de reabertura, escrito para não depender de memória:** no dia em que `command -v shellcheck` devolver um caminho **ou** em que alguém pinar a ferramenta como dependência de `[tool.poetry.group.dev.dependencies]`, esta decisão vence e a adoção volta à mesa **com as duas metades de `1.8'` rodadas**. Quem a adotar herda a recusa `rc=3` dos scripts do backend: *"não mediu"* recusa, e não é o mesmo que *"está tudo certo"* (`ADR-011/D2`).

### D3 · A lacuna fecha **hoje** com `bash -n`, e o portão é `make lint-shell` dentro de `make lint`

`bash` existe, é o interpretador que estes arquivos já declaram no shebang, e **as duas metades de `1.8'` foram rodadas antes desta linha ser escrita**:

**CALA — os 9 arquivos reais da árvore de hoje, cada `rc` impresso, nenhum inferido de silêncio:**

```
OK rc=0 backend/scripts/bootstrap.sh          OK rc=0 scripts/install-git-hooks.sh
OK rc=0 backend/scripts/boundaries.sh         OK rc=0 scripts/measure_stitch_drift.sh
OK rc=0 backend/scripts/check-coverage-layers.sh   OK rc=0 scripts/hooks/commit-msg
OK rc=0 backend/scripts/lint.sh               OK rc=0 scripts/hooks/pre-push.pre-harness
OK rc=0 backend/scripts/test.sh
```

`[MEDIDO 2026-08-29: `bash -n <f>` sobre os 9, universo n=9, 9 de 9 em rc=0]`

**MORDE — mutação efêmera (um `if` sem `fi`) apensada a uma CÓPIA de cada um dos dois executáveis do portão:**

```
backend/scripts/boundaries.sh        -> rc=2 :: linha 181: erro de sintaxe: fim prematuro do arquivo
scripts/hooks/pre-push.pre-harness   -> rc=2 :: linha  92: erro de sintaxe: fim prematuro do arquivo
```

`[MEDIDO 2026-08-29, cópia fora da árvore, universo n=2, 2 de 2 em rc=2 nomeando a linha]`

**E o "antes" não é *"já temos `bash -n`"* — é ZERO, e isto foi medido em vez de suposto.** A frase que circulava (*"são governados por `bash -n` e por mais ninguém"*) sugere um verificador em operação. **Não há nenhum.** O comando, e ele precisa excluir este arquivo pela razão dita logo abaixo:

```
$ grep -rn 'bash -n' . --exclude-dir=.venv --exclude-dir=node_modules --exclude-dir=.git \
    --exclude='ADR-012-*'
harness.toml:201        docs/INDEX.md:63        backend/README.md:558
```

**3 ocorrências, 3 de 3 em PROSA** — e **zero** em `Makefile`, em `.sh` ou em hook `[MEDIDO 2026-08-29 na base `48d5500`]`.

> **⚠️ E este parágrafo quase publicou o defeito que ele descreve.** Escrevi *"3 ocorrências"*, rodei o `grep` **depois** de o rascunho existir, e a saída veio **11** — porque **8 delas são desta própria ADR**. É *"número medido envelhece com a edição seguinte"* pela quarta vez nesta trilha, agora dentro do documento que a nomeia. O número **3** é do universo `48d5500` **antes** deste arquivo, e por isso o comando publicado carrega o `--exclude` que o torna reproduzível **depois** dele `[MEDIDO 2026-08-29: sem o `--exclude` → 11; com ele → 3]`.

O que existe hoje é o parse incidental da execução, e **ele não é equivalente**:

```
$ bash sonda.sh          # erro de sintaxe na última linha
PRIMEIRA LINHA EXECUTOU
sonda.sh: linha 6: erro de sintaxe: fim prematuro do arquivo      # rc=2
$ bash -n sonda.sh
sonda.sh: linha 6: erro de sintaxe: fim prematuro do arquivo      # rc=2, e NADA executou
```

`[MEDIDO 2026-08-29, sonda de 5 linhas no scratchpad]` ⇒ **executar um portão quebrado roda os efeitos colaterais até o ponto do erro.** Num arquivo que decide se um push passa, *"descobrir o defeito executando"* é a ordem errada.

**Onde mora:** alvo `lint-shell` no `Makefile`, **pré-requisito de `lint`**, portanto já dentro de `make lint` que `scripts/hooks/pre-push.pre-harness:77` roda. **Zero superfície nova, zero `core.hooksPath`, zero edição no hook gerado.** A descoberta dos arquivos é **por shebang e não por extensão** (D1), e a ausência de `bash` recusa com **`rc=3`**, pela semântica que `ADR-011/D2` fixou.

**Limite declarado, e ele é o mais importante desta ADR: `bash -n` fecha SINTAXE e não fecha SEMÂNTICA — e foi semântica que mordeu este repositório.** O nono defeito da família (`/review`, 2026-08-29) foi a guarda 3 de `boundaries.sh` medindo a **secção do arquivo** e falando em nome dos **contratos avaliados**. Sintaticamente perfeita. **`bash -n` não a pegaria** `[MEDIDO 2026-08-29: `bash -n backend/scripts/boundaries.sh` → rc=0 tanto hoje quanto com a guarda antiga, que é sintaticamente idêntica]`, e se `shellcheck` a pegaria é `[NÃO MEDIDO]` — mas o eixo dela (uma mensagem que afirma mais do que a condição mede) não é o eixo que um linter de shell percorre.

⇒ **O que fecha a classe que de fato mordeu é `1.8'` aplicado GUARDA A GUARDA:** cada guarda de um script de portão nasce com uma mutação que a faz disparar e uma árvore limpa que a faz calar. `boundaries.sh` já carrega **4 rotas medidas** para *"verde sobre zero contrato"* nos comentários das guardas 3 e 4 — **isso é o instrumento, e ele já existe neste repositório como prática.** Esta ADR o promove de prática a obrigação declarada (`D4`).

### D4 · A regra geral, e é dela que `D1`–`D3` e `D5` saem

> **O alcance de `harness rules` é o ARQUIVO-FONTE sob `code_paths`. Toda propriedade que precisa morder e não é isso mora no `make`, e chega ao `pre-push` por `ADR-011/D3b`.**

`code_paths` é a declaração de **onde vivem as regras de conteúdo de código**. Esticá-lo para governar executáveis de infraestrutura, arquivos de política ou atribuição de dono confunde duas perguntas: *"este arquivo é código de produção deste repositório?"* (o que `classify` responde, e que `harness require-push` consome via `lib/runner.py:633`) e *"esta propriedade tem portão?"*. **A primeira tem consequência de governança própria** — mudar a classificação de `backend/scripts/*.sh` para `producao` os poria sob `require-push`, exigindo que toda edição de script fosse reivindicada por feature autorizada. Isso é uma decisão sobre **reivindicação de arquivo**, tomada de lado, como efeito colateral de querer um linter. **Não se paga esse preço por engano.**

**Corolário operacional:** ao declarar qualquer propriedade nova como portão, a pergunta não é *"como ponho isto no `harness`?"* mas *"o sujeito desta propriedade é um arquivo-fonte sob `code_paths`?"* — **não** ⇒ `make`.

### D5 · A atribuição de dono de `Q16` vira propriedade medida no `make`; o **roteamento** por `design_gate` **não** é decisão deste repositório

São duas perguntas que a formulação corrente funde. Separadas:

**(a) Pôr `design_gate` no circuito de despacho — NÃO, e a razão é de fronteira de repositório.** O roteamento vive nos comandos do plugin, e eles consomem **exclusivamente** `builder` e `qa`:

```
commands/build.md:36  → harness policy --key agents ;  :39 age sobre `by_component.<c>.builder`
commands/qa.md:19     → harness policy --key agents ;  :23 age sobre `by_component.<c>.qa`
```

**E o número mais forte: `design_gate` não aparece UMA vez no plugin inteiro** `[MEDIDO 2026-08-29: `grep -rn 'design_gate' <plugin v0.13.0>` → **rc=1, zero ocorrência**]`. Os consumidores da chave de política são **6 linhas ao todo**: as 2 de `commands/` acima, e **4 em `lib/policy.py:536-550`, que são a validação `V-16` e nada mais** `[MEDIDO 2026-08-29: `grep -rn 'agents\.by_component\|--key agents' <plugin> --exclude-dir=tests` → 6]`.

> **⚠️ A primeira redação deste parágrafo publicava "17 ocorrências de `by_component`", e o método estava errado — é a instância nº 7 da família, *"casar o homônimo em vez do campo"*, reincidindo.** `grep -rn 'by_component'` devolve **28** `[MEDIDO 2026-08-29]`, e as de `scripts/tasks.sh:492-537` e `scripts/status.sh:639-663` são uma **variável local que conta TASKS por componente** — objeto sem relação nenhuma com `[agents.by_component]`. Contá-las como consumidoras da política teria publicado *"há mais consumidores do que eu pensava"* a partir de um homônimo. **O veredito não mudou; a evidência dele mudou, e só a busca pelo campo qualificado (`agents.by_component`) o sustenta.**

**E `architect` tem exatamente a mesma propriedade** — declarado para `sentimento`/`convergencia`/`backtest` desde antes desta feature, e igualmente não roteado. ⇒ **não é fraqueza que `T-01.3` introduziu**, e tratá-la como dívida desta fase seria atribuir a `charts`/`web` um defeito que o repositório sempre teve. Mudar isso é **editar `commands/*.md` do `harness-plugin` — outro repositório** — exatamente a mesma fronteira que o plano `01:60` já respeitou ao recusar consertar o pack `hexagonal-layers` daqui. **Recomendação ao owner, não ato de agente.**

**(b) A atribuição do owner deixar de ser desfazível em silêncio — SIM, e é barato.** O que a mutação de `docs/gate-de-design.md` mostrou é mais grave que a ausência de roteamento: **trocar `charts` → `ui-designer` e `web` → `quant-architect`, invertendo literalmente a resposta de `Q16`, sai `rc=0` em `validate --strict`, `policy`, `doctor`, `sweep` e `tasks validate` — silêncio total** `[DOC: docs/gate-de-design.md §"O que a mutação mostrou", 5 mutações efêmeras, MEDIDO 2026-08-28 por `T-01.3`]`. Uma decisão do owner que qualquer edição desfaz sem um único comando acusar.

A saída de `harness policy --key agents.by_component` é **JSON determinístico de chaves ordenadas** `[MEDIDO 2026-08-29: rodado nesta árvore, chaves em ordem `backtest, charts, convergencia, sentimento, web`]` ⇒ uma asserção de arquivo-dourado é executável hoje, mora no `make` por `D4`, e converte as três piores mutações (apagar `design_gate`, trocar os donos, esvaziar a secção) de `rc=0` em recusa.

**O que ela NÃO compra, declarado para ninguém a vender como mais do que é:** ela não faz o `design_gate` ser consultado. Ela faz com que **desfazer a atribuição custe editar duas superfícies em vez de uma**, e que a segunda seja aquela cujo diff um humano lê como *"estou revogando uma decisão do owner"*. Isso é defesa em profundidade, **não** é roteamento — e o parágrafo de `docs/gate-de-design.md` que diz que o resto é revisão humana **continua verdadeiro** e não deve ser apagado.

## Alternativas recusadas

| alternativa | por que não, com o custo medido |
|---|---|
| **`*.sh` em `include_globs` + prefixo `scripts/`** | compra `0` cobertura hoje (zero regra de shell nos 4 packs instalados), **perde os 2 arquivos que mais importam** (`commit-msg`, `pre-push.pre-harness` não terminam em `.sh` — `[MEDIDO 2026-08-29: ls scripts/hooks/`]`), e arrasta `require-push` para dentro de `backend/scripts/` como efeito colateral não pedido |
| **adotar `shellcheck` agora** | as duas metades de `1.8'` são **inexecutáveis** com a ferramenta ausente `[MEDIDO 2026-08-29: `command -v shellcheck` → rc=1]`. Custo de adotar assim: um portão cujo teste de admissão é `[NÃO MEDIDO]` nas duas pontas. Difere por `D2`, com gatilho |
| **aceitar a lacuna com dono e prazo, sem instrumento** | era a opção honesta enquanto nenhum instrumento existisse. **Ela caiu quando eu medi que `bash -n` morde e cala hoje** (`D3`): aceitar lacuna que um comando já instalado fecha é escolher a declaração sobre a medição, que é o inverso da disciplina deste repositório |
| **declarar `[[rules.own]]` de shell** | o sujeito não é arquivo-fonte sob `code_paths` (`D4`), e a regra não teria universo: fechar exigiria **primeiro** a alternativa da linha 1 desta tabela. Além disso `[[rules.own]]` sem corpus troca enforcement medido por declarado, e `ADR-011/D3`/`D4` já tiraram deste repositório a rota de declarar regra própria nesta fase |
| **rotear `design_gate` editando `commands/*.md` daqui** | os comandos vivem no `harness-plugin` instalado (`~/.claude/plugins/cache/…/0.13.0/`), **fora deste repositório**. Editá-los de dentro daqui seria mudança invisível ao versionamento deste repo e perdida no próximo upgrade de plugin |

## Falsificador

**O principal, e ele é um comando.** Ponha, num branch, um `if` sem `fi` em `scripts/hooks/pre-push.pre-harness` **e** rode `git push --dry-run`. **Se o push for ACEITO, `D3` está errada** — o alvo não está no caminho do portão, e o repositório terá trocado uma lacuna declarada por um alvo de `make` que ninguém alcança. **O "antes" é conhecido: hoje o push é ACEITO** com o portão sintaticamente quebrado, porque nada o verifica antes de executá-lo `[MEDIDO 2026-08-29 por composição: `grep -rn 'bash -n'` → 3 ocorrências, 3 de 3 em prosa; nenhum alvo de `make` e nenhum hook o invoca]`.

**Segundo, contra `D1` — e ele reabre a decisão inteira.** Se aparecer um pack cujas regras declarem alvo casando shell (`paths` com `*.sh` ou `scripts/**`), o motivo (ii) do `/review` cai, e a pergunta *"`code_paths` alcança `scripts/`?"* volta à mesa **com o custo de `require-push` explícito na conta**, não de lado. **`D4` continua de pé mesmo assim** — a regra é sobre o sujeito da propriedade, não sobre a existência do pack.

**Terceiro, contra `D3` — e é o que me faria estar errado do jeito mais caro.** Se aparecer um defeito na classe *"a guarda mede X e a mensagem afirma Y"* **depois** de `lint-shell` estar verde, e alguém ler o verde como *"os portões estão bons"*, então `D3` comprou **confiança** em vez de cobertura, e o custo dela é negativo. É o motivo de o limite estar escrito dentro de `D3` e não em rodapé — e de a obrigação guarda-a-guarda ser parte da decisão, não um adendo.

**Quarto, contra `D5(b)`.** Se a asserção de arquivo-dourado passar a ser editada **no mesmo commit** que `harness.toml` mais de uma vez, ela virou cerimônia: duas superfícies que sempre mudam juntas são uma superfície com passo extra. O sintoma é observável no `git log`, e o remédio é remover a asserção — **não** mantê-la por já existir.

## Consequência

- Nasce **um** alvo de `make` (`lint-shell`) e **uma** asserção de política, os dois já dentro do `pre-push` existente. **Nenhuma superfície de enforcement nova.**
- `harness.toml:176-215` deixa de ser lacuna sem decisão e passa a ser lacuna **decidida**: `D1` recusa o caminho que ela propunha, `D3` a fecha por outro, `D2` nomeia o que continua aberto e o gatilho.
- **Não** escrevo o código: `/architect` decide e o `/tech-lead` materializa. Os dois itens de plano e os dois DoD com comando e universo estão em [`plano 01`](../plans/SPEC-001-plataforma-dados/01_governanca_gateante.md), itens `1.12` e `1.13`.
- O que **continua sem portão** e está declarado: idioma de docstring (`ADR-011/D6`), semântica de guarda de shell (`D3`, limite), e o **roteamento** por `design_gate`/`architect` (`D5a`, e é do `harness-plugin`).
