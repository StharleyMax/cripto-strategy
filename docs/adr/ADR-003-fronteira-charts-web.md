# ADR-003 — A fronteira `charts` ⇄ `web`

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.1
**Fase/Epic:** F5a (a fronteira) e F1 (o primeiro uso) · `CST-1`, `CST-3` · **Componente alvo:** `docs`
**Origem:** correção que o gate mandou carregar — **hoje nenhum dos dois tem arquiteto atribuído em `[agents.by_component]`**

## Contexto

Medido: `harness policy --key agents.by_component` devolve entradas para **`sentimento`, `convergencia` e `backtest`** — e **nada** para `charts` nem `web`. São os dois componentes que a rodada de superfícies produziu, e **é onde todo o sistema de honestidade do dado vai morar** (o selo, a política de ausência, a paleta, `<Anotacao>`).

**E o problema é anterior ao ponteiro:** `CST-7` registra que a fronteira é hoje *"indeterminável por caminho"*. Se ela não é decidível, **o componente-alvo de todo item de frontend é arbitrário** — e isso derrota `[agents.by_component]` e qualquer regra por caminho, porque as duas dependem de saber a qual componente um arquivo pertence.

**Componente omitido é componente sem dono de julgamento.** Atribuir ponteiro antes de a fronteira existir só move o arbítrio.

## Decisão

**A fronteira é por CONTRATO DE DADO, não por caminho de arquivo nem por tecnologia.**

```
charts  = o que transforma <ValorDeMercado> e <Anotacao> em GEOMETRIA
          grade canônica compartilhada · mapeamento tempo->x e valor->y · escalas
          política de ausência por `nature` · trilho de vigência · overlay de anotação
          => entra SÉRIE TIPADA, sai COORDENADA. Não faz fetch. Não conhece rota.
          Não conhece sessão, usuário nem `knowledge_time` — recebe-os como argumento.

web     = o que transforma INTENÇÃO em leitura tipada, e resposta em página
          rotas · sessão e identidade · bundle<->URL · seleção de símbolo/janela/TF
          chrome (selo de sessão, chip de `env`, `pointer_mode`)
          => entra REQUISIÇÃO, sai <ValorDeMercado>/<Anotacao> entregue a `charts`
```

**As três regras que tornam a fronteira decidível por inspeção:**

| # | regra | consequência |
|---|---|---|
| **FR-1** | **`charts` não faz I/O.** Zero `fetch`, zero rota, zero `localStorage`. Toda entrada é argumento | um módulo de `charts` é testável **sem servidor e sem rede** — e a S2-mínima é construível offline, que é o que F1 promete |
| **FR-2** | **`web` não calcula geometria.** Nenhum `px`, nenhuma escala, nenhuma decisão de "onde desenhar" | impede a segunda implementação da grade canônica, que é **o modo de falha em que a tela e o motor discordam sobre o que aconteceu** |
| **FR-3** | **A grade canônica é UMA função, dona de `charts`, e o motor de backtest a IMPORTA** — não a reimplementa | `charts` deixa de ser "a pasta do gráfico" e passa a ser **o dono da grade**, que é o que justifica ele ser componente e não pasta |

**Ponteiro de arquiteto:** ambos apontam para o mesmo dono de julgamento **hoje**, porque o repositório tem um arquiteto de domínio; **o que esta ADR entrega é o critério que torna a atribuição verificável**, não o nome.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **fronteira por caminho** (`frontend/src/features/chart/**` = `charts`, resto = `web`) | é a que parece mais barata e é **circular**: o layout ainda não existe (`ADR-009`), e amarrar componente a caminho faz **mover arquivo trocar de dono de julgamento** |
| **fronteira por tecnologia** (`charts` = o wrapper do Lightweight Charts) | reduz `charts` a um adaptador de biblioteca, e então **a grade canônica não tem dono** — e ela é compartilhada com o motor, que não é frontend |
| **`charts` some; tudo é `web`** | o vocabulário de componentes é **fechado** e `charts` já está nele. Colapsá-lo exigiria edição de política **e** deixaria a grade sem dono. Custo: a regra `FR-3` deixa de ser expressável |
| **atribuir o ponteiro agora e decidir a fronteira depois** | é o estado de hoje com um nome em cima. Mede-se: `harness rules --mode file --path <um .tsx>` devolve **saída vazia** — o dono existiria e não teria universo |

## Falsificador

**Um item de plano que não consiga declarar UM componente do vocabulário fechado.** É o teste que `CST-7` já nomeia, e esta ADR o aceita como o seu: se, ao fatiar F1 e F4, aparecer um item cujo alvo seja ambiguamente `charts` **e** `web`, a fronteira de FR-1/FR-2 não é decidível e esta ADR está errada.

**Aplicado ao plano desta rodada:** as 9 fases declaram alvo único em todos os itens (ver `docs/plans/SPEC-001-plataforma-dados/`). **O caso mais próximo do limite é o crosshair com linha-guia apontando para trás** (`CA-F1-10`): é **`charts`**, porque a linha-guia é geometria derivada de `available_at`, e `web` só entrega o par `(valor, available_at)`.

**Segundo falsificador:** um módulo de `charts` que precise de `fetch` para renderizar. Se aparecer, FR-1 é irreal e a fronteira é outra.

## Consequência

- O teste de `FR-1`/`FR-2` é **de comportamento e executável**: um contrato de import `forbidden` por componente, na forma medida no `anything_monorepo` (`import-linter`) — ver [`ADR-009`](ADR-009-reuso-da-forma-do-anything.md). **`grep` não é aprovação.**
- **`Q16` deixa de ser pergunta de arquitetura e passa a ser edição de política** (`[agents.by_component]` + `code_paths` + pack), que é `CST-1` e `ADR-009`.

---

# ⚠️ Acrescentado por `T-01.3` (`CST-10`) em 2026-08-28 — nenhuma linha acima foi apagada

**Erro não se apaga, se tarja.** Três afirmações desta ADR deixaram de ser verdadeiras hoje,
e as três continuam legíveis onde estavam porque carregam a medição que as sustentava.

| linha | o que ela diz | estado em 2026-08-28 |
|---|---|---|
| **`:5`** | *"hoje nenhum dos dois tem arquiteto atribuído em `[agents.by_component]`"* | **SUPERADA.** Era verdadeira quando escrita e é falsa agora — ver `D1.2` abaixo, com o antes e o depois |
| **`:40`** | *"**Ponteiro de arquiteto:** ambos apontam para o mesmo dono de julgamento **hoje**, porque o repositório tem um arquiteto de domínio"* | **REVOGADA PELO OWNER, e a previsão estava errada.** O owner **separou** os dois: `charts` → `quant-architect`, `web` → `ui-designer` `[PREMISSA-OWNER: 2026-08-28]`. O critério que ele aplicou é **classe de risco**, não camada nem quantidade de arquitetos disponíveis |
| **`:61`** | *"o teste de `FR-1`/`FR-2` é … um contrato de import `forbidden` por componente, na forma medida no `anything_monorepo` (`import-linter`)"* | **INEXEQUÍVEL COMO ESCRITA.** `import-linter` lê o grafo de imports **de Python** (`grimp`); `charts` e `web` são **TypeScript**. A ADR nomeou um instrumento que **não alcança a fronteira que ela mesma define** — ver "`D1.6` não fecha aqui" abaixo |

## `D1.2` — fechado, e medido pelos dois lados

```
$ harness policy --key agents.by_component          # ANTES (base af02beb)
{"backtest": {...}, "convergencia": {...}, "sentimento": {...}}          # rc=0

$ harness policy --key agents.by_component          # DEPOIS
{"backtest": {"architect": ".claude/agents/quant-architect.md"},
 "charts":   {"architect": ".claude/agents/quant-architect.md",
              "design_gate": "docs/gate-de-design.md"},
 "convergencia": {"architect": ".claude/agents/quant-architect.md"},
 "sentimento":   {"architect": ".claude/agents/quant-architect.md"},
 "web":      {"architect": ".claude/agents/ui-designer.md",
              "design_gate": "docs/gate-de-design.md"}}                  # rc=0
```

**Universo: 2 componentes** (`charts`, `web`), os dois presentes. `harness validate --strict`
→ `politica valida`, `rc=0`; `harness doctor` → `CONFORME (12 checagens)`, `rc=0` — **e o
mesmo `CONFORME (12 checagens)` sai na baseline sem esta task** `[MEDIDO 2026-08-28 com
`git stash -u`]`, o que prova que o validador não passou a aprovar coisa nova por acidente.

**`charts` tem DUAS chaves de propósito**, e achatá-las em uma seria desfazer **a decisão do
owner (a separação dos donos) e a consequência que o `/architect` registrou**: `architect`
julga **fidelidade do dado**, `design_gate` julga **interação**, e **nenhum dos dois aprova o
trabalho do outro** `[DOC: decisoes-do-owner.md:418-421 — a consequência é do /architect, não
fala literal do owner]`. `web` também tem duas, porque o dono de
julgamento que o owner lhe deu é o `ui-designer` — o agente que o `CLAUDE.md` proíbe de
aprovar o próprio trabalho. A doutrina está em [`docs/gate-de-design.md`](../gate-de-design.md);
o esquema que comporta os dois ponteiros está medido em `harness.toml`.

## 🔴 O gatilho que `T-01.3` armou — e a data de validade que ele arma

Até hoje, `agents.by_component` **não tinha dono para `web`**. Foi por isso, e **só** por
isso, que o `/review` julgou **ACEITÁVEL** que `T-01.2` criasse **4 arquivos que
`harness code-paths classify` chama `producao`** sob `frontend/src/` com a task declarando
`components = ["docs"]`: acrescentar `web` naquele dia **não poria arquiteto nenhum no
circuito**, logo a omissão não custava julgamento nenhum. Era **deferimento**, e deferimento
tem prazo.

**O prazo vence NO DIA EM QUE `T-01.3` FECHAR** — a forma do `tasks.toml`, que é a
precisa: esta ADR e a declaração em `harness.toml` só existem no branch da task, e
`T-01.3` está `status = "todo"` enquanto isto se lê. Fechada ela:

> **Toda task que escrever sob `frontend/src/` declarando apenas `components = ["docs"]` é
> VIOLAÇÃO de `ADR-003:11-13`** — *"componente omitido é componente sem dono de julgamento"* —
> **e não deferimento.**

**Por que a regra passa a morder quando `T-01.3` fechar, e não mordia ontem, em um número:** `docs` **continua sem dono**
`[MEDIDO 2026-08-28: `harness policy --key agents.by_component` → `docs` **ausente**]`, e
`charts` e `web` **passaram a ter**. Omitir o componente deixou de ser gratuito — passou a
**custar o julgamento que existe**.

**Regra operacional, sem margem:** arquivo sob `frontend/src/` que renderiza, roteia, ou
transforma série tipada em geometria ⇒ a task declara `charts` ou `web` em `components`
**antes de o arquivo existir**, não depois. `docs` sozinho só continua valendo para arquivo
que **não** é produção.

**Onde este gatilho está escrito, e por que em três lugares e não em um:**

| superfície | por que ela, e não só a outra |
|---|---|
| **`harness.toml`**, encostado nas 4 linhas novas | é o arquivo cujo **conteúdo arma** o gatilho. É impossível mudar o estado de propriedade sem passar por ali |
| **esta ADR** (aqui) | a norma violada **é** `ADR-003:11-13`. Quem for confrontado com *"você violou `ADR-003:11-13`"* abre **este** arquivo, e tem de encontrar a data em que a regra passou a morder |
| **`tasks.toml`**, `refs` de `T-01.3` (já estava) | é a fonte que o `/tech-lead` lê ao criar a próxima task — mas **só** quem for ler `T-01.3` a vê, e é por isso que ela **não basta sozinha** |

## `D1.6` NÃO fecha nesta task — e o dono está nomeado, não órfão

`D1.6` pede que *"o contrato `forbidden` de import **reprove** um import de `charts` para
`web` e vice-versa"*, universo **2 imports proibidos, 1 em cada direção**. **Ele não fecha
aqui, e a razão é medida, não estimada.**

**A ordem destes fatos importa, e ela foi corrigida em 2026-08-28 pelo `/review`:** o
primeiro motivo **não** é o universo vazio — é que o único instrumento disponível reprova
por **caminho**, e declará-lo gravaria no artefato de política a alternativa que **esta ADR
recusa** (`:46`). Um universo vazio se enche na semana seguinte; **inverter a ADR pela porta
dos fundos para satisfazer um DoD, não.**

**Fato 1 — o único instrumento disponível hoje reprova pelo CAMINHO, e isso contradiz a
decisão desta ADR.** `import-linter` é Python (`ADR-011/D3`, e é da `T-01.5`); `ADR-011/D4`
**proíbe** `[[rules.own]]` de TypeScript nesta fase; sobra o ESLint, e a regra que ele tem é
`no-restricted-imports`, que só sabe casar **especificador de módulo** — isto é, **caminho**.
`ADR-003:46` recusa a fronteira por caminho com um argumento que continua de pé: *"amarrar
componente a caminho faz **mover arquivo trocar de dono de julgamento**"*. **Declarar esse
contrato seria escrever a alternativa recusada dentro do arquivo que a recusa.**

**Fato 2 — e, ainda que se aceitasse o caminho, o universo está vazio.**

```
$ find frontend/src -type f | wc -l                                     → 4
$ grep -rnE '^\s*(import|export)\s.*from\s' frontend/src                → nenhuma ocorrência
$ harness code-paths classify frontend/src/<cada um dos 4>              → producao (4 de 4)
```

**Zero declarações de import no componente inteiro.** Um contrato `forbidden` sobre um
universo com **0 imports** não tem o que avaliar. **Este é o segundo argumento, não o
primeiro:** ele diz que o contrato seria inútil hoje; o `Fato 1` diz que ele seria **errado**
em qualquer dia.

**Fato 3 — o teste dos dois lados (`1.8'`) foi RODADO, e ele reprova.** Bancada em
`eslint@10` + `typescript-eslint@8`, **fixture fora do repositório**, com um contrato
`no-restricted-imports` nas duas direções `[MEDIDO 2026-08-28]`:

| metade | corpus | comando | resultado |
|---|---|---|---|
| **MORDE** | os 4 arquivos reais **+ 2 violadores plantados**, 1 em cada direção | `eslint srcB` | **`exit=1`**, `2 problems (2 errors)`, **nomeando** `no-restricted-imports` e as duas mensagens de contrato (`charts-nao-importa-web`, `web-nao-importa-charts`) ✅ |
| **CALA** | os 4 arquivos reais de hoje | `eslint srcA` | `exit=0` ❌ **e o zero é VACUOSO** |

**Por que o `exit=0` não conta:** ele é **vacuoso**, não suspeito. O corpus tem **zero
declarações de import** (`grep -rnE '^\s*(import|export)\s.*from\s' frontend/src` →
nenhuma ocorrência) ⇒ **o lado "cala" não exercita o contrato uma única vez.** Não é que a
regra tenha sido testada e calado; é que **não houve nada para ela olhar**. E `1.8'` exige a
metade *"**CALA** (o código legítimo de hoje ⇒ verde)"* (plano `01`, linha 21) — sobre um
universo sem imports, essa demonstração não tem conteúdo.

E a metade "morde" só passou porque **2 dos 6 arquivos do corpus B são inventados**, um deles
exigindo o diretório `frontend/src/features/charts/`, que **não existe no repositório** — ou
seja, para o contrato morder é preciso **primeiro adotar a convenção de caminho que
`ADR-003:46` recusou**.

> **⚠️ Correção de argumento aplicada em 2026-08-28 pelo `/build`, após o `/qa` falsificar a
> redação anterior. O veredito não mudou; a razão dele mudou.**
>
> A primeira redação argumentava: *"o contrato ligado e o desligado dão saída **byte-idêntica**
> sobre o código de hoje ⇒ reprova"*. **Esse controle é sobre-estrito, e a falsificação é de uma
> linha** — ele vale para **qualquer regra correta sobre corpus limpo**. Reproduzido no próprio
> repositório `[MEDIDO 2026-08-28]`:
>
> ```
> harness rules --mode file --path frontend/src/features/painel/Filtro.tsx --surface ci
>   packs = ["core", "web-fullstack"]   → rc=0, 0 byte
>   packs = ["core"]        (controle)  → rc=0, 0 byte     ⇒ saídas IDÊNTICAS
> ```
>
> Aplicado uniformemente, esse critério reprovaria o lado "cala" de **`D1.3`**, que esta fase
> trata como **fechado**. Ou seja: ele reprova demais, e um critério que reprova tudo não
> distingue nada — que é exatamente a objeção que `1.8'` faz ao lado "morde".
>
> **O que sustenta a recusa de `D1.6` não depende do controle:** o `Fato 1` (o instrumento
> reprova por caminho, que esta ADR recusa) vale sozinho, e o número acima — **0 declarações
> de import** — é o reforço. O `/qa` reproduziu a recusa com fixture própria e chegou ao
> mesmo lugar.

**Declarar esse contrato hoje seria "ferramenta que existe e ninguém roda" com aparência de
progresso. Não declarei.**

**Fato 4 — e este é defeito desta ADR, não da task:** `:61` nomeia `import-linter` como o
teste de `FR-1`/`FR-2`. `import-linter` não lê TypeScript. **A mesma assimetria de linguagem
atinge `FR-3`**, que exige que *"o motor de backtest **importe** a grade canônica"*: `backtest`
é Python (`backend/src/`) e `charts` é TypeScript ⇒ **não existe `import` literal atravessando
essa fronteira** `[INFERRED: dos componentes declarados em `harness.toml` e de
`code_paths.include_prefixes`; não há código de `charts` nem de `backtest` para medir]`.
**Não resolvi isto aqui** — é decisão de arquitetura, não de implementação.

### De quem `D1.6` passa a ser

| o quê | dono | por quê ele |
|---|---|---|
| **o contrato executável** (as duas metades na mesma passada) | **`T-05.1` / `CST-35`** | é a primeira task com **universo não vazio**: ela cria os módulos de `charts` e sua própria `refs` diz que *"é esta task que torna `charts` componente e não pasta"*. Nesse momento o "cala" é medido contra código **real** (`charts` + `frontend/src/app/rotas.ts`, que é lado `web`), e o "morde" contra violadores **efêmeros** — as duas metades ficam disponíveis na mesma passada, que é o que `1.8'` exige. Ela já declara `depends_on = ["T-01.3"]` |
| **a reconciliação do plano** | **`/architect`** | `D1.6` é DoD da **fase 01**, e o plano diz que *"`1.2` e `1.3` fecham antes de `05`"*. Um DoD de `01` que só pode fechar em `05` é **contradição do plano**, da mesma classe das duas que o próprio `01_governanca_gateante.md` já registra (*"a peça 1 caiu entre os itens"*, *"`D1.1` contradiz a proibição de produção"*). Editar DoD de plano aprovado é superfície do `/architect` — **as três correções ⚠️ daquele arquivo foram acrescentadas pelo `/architect` e pelo `/review`, nunca pelo `/build`** |

**O que NÃO é aceitável fazer com isto, e está escrito para que ninguém o faça depois:**
declarar o contrato agora em `frontend/eslint.config.mjs` para o DoD "fechar". Ele passaria
em `cala` por vacuidade, ninguém o rodaria contra um violador real, e o repositório trocaria
um DoD aberto e nomeado por um portão falso. **`D1.6` aberto com dono é mais barato que
`D1.6` fechado com mentira.**

---

# ⚠️ Acrescentado pelo `/architect` em 2026-08-29 — a segunda metade foi paga, e uma linha desta ADR fica em dívida

**Nenhuma linha acima foi apagada.** A tabela *"De quem `D1.6` passa a ser"* (`:230-235`) nomeava
dois donos. **O contrato executável** segue com `T-05.1`/`CST-35`. **A reconciliação do plano**,
que era do `/architect`, **está feita**:

| o que | onde foi parar |
|---|---|
| o DoD, com a **propriedade inalterada** e o **comando mais forte** | **`D5.12`** da [fase `05`](../plans/SPEC-001-plataforma-dados/05_fatia_visivel.md) — é onde o universo nasce e onde as duas metades de `1.8'` ficam disponíveis na mesma passada. **O universo migra literal; o comando ganha a metade `cala`, que `D1.6` não exigia** — dizer "critério inalterado" subdeclarava a migração `[/review 2026-08-29]` |
| a linha `D1.6` da fase `01` | **tarjada, não apagada**, com a migração declarada — [plano `01`](../plans/SPEC-001-plataforma-dados/01_governanca_gateante.md) §*"`D1.6` não era DoD desta fase"* |

**Por que migrar e não diferir:** a fase `01` fechou com `f01·QA=APPROVED` e `f01·REVIEW=COMPLIANT`
no ledger. Um DoD marcado *"diferido"* dentro dela ficaria num estado que **nenhum evento futuro
resolve** — ninguém reabre fase fechada para carimbar DoD —, e o `CLAUDE.md` é explícito sobre
qual das duas superfícies manda: *"o ledger é a identidade do estado, não o texto do documento"*.

## 🔴 A dívida que ISTO NÃO paga, e ela é desta ADR

**`:75` já registra que `:61` é *"inexequível como escrita"*** — `import-linter` lê grafo de
Python, e `charts`/`web` são TypeScript. **Migrar o DoD de fase não conserta isso.** O `Fato 1`
(`:154-160`) — o único instrumento disponível reprova por **caminho**, que `:46` recusa — **vale em
qualquer dia e viaja junto com `D5.12`**. Universo cheio resolve o `Fato 2`; **o `Fato 1` continua
de pé**.

⇒ **`D5.12` nasce com uma pergunta de arquitetura embutida, e `T-05.1` a responde com medição:**
*é possível expressar o contrato sem definir `charts` e `web` por caminho?* **Se não for**, o
desfecho correto **não é** declarar o contrato por caminho e chamar de fechado — é **reabrir esta
ADR e reescrever `FR-1`/`FR-2` com um instrumento que exista**. `[NÃO MEDIDO: as alternativas
plausíveis — `import/no-restricted-paths` sobre grupos declarados, `project references` do
TypeScript, campo de manifesto por módulo — não foram rodadas, porque não há universo em que
rodá-las até `5.2` existir]`

**`FR-3` continua com o mesmo buraco, e ele é maior:** *"o motor de backtest IMPORTA a grade
canônica"* atravessa Python ⇄ TypeScript, onde **não existe `import` literal** (`:222-228`).
**Também não resolvi isto** — segue sendo decisão de arquitetura, sem dono nomeado, e o lugar
natural dela é a fase `08` (o motor) ou a consolidação de `09`.

---

# ⚠️ Acrescentado por `T-05.1`/`quant-architect` em 2026-09-02 — a pergunta embutida de `:262-269` é RESPONDIDA com medição; `FR-3` fica com um escopo declarado, não fechado

**Nenhuma linha acima foi apagada.** As duas dívidas que `:261-280` deixou nomeadas —
"o contrato pode ser expresso sem caminho?" e "`FR-3` atravessa Python ⇄ TypeScript" — são
respondidas aqui, com o universo que só existe a partir desta task (`find frontend/src -type f`
deixou de ser **4**; ver `docs/context/plataforma-dados/gates/T-05.1-builder.md` pelo inventário).

## D1 — o contrato É expresso por especificador de módulo, e a resposta às 3 alternativas é medida, não presumida

`05_fatia_visivel.md:53` nomeou três instrumentos a testar antes de aceitar
`no-restricted-imports`: *"`import/no-restricted-paths` sobre grupos declarados, `project
references` do TypeScript, ou um campo de manifesto por módulo"*. Os três foram medidos, não
escolhidos por preferência:

| alternativa | medição | veredito |
|---|---|---|
| `import/no-restricted-paths` (`eslint-plugin-import`) | `[MEDIDO 2026-09-02: node -e "require.resolve('eslint-plugin-import')" → Cannot find module 'eslint-plugin-import'; grep -n eslint-plugin-import frontend/package.json frontend/package-lock.json → 0 linhas]` | **ausente do projeto hoje.** Instalá-la é possível, mas suas `zones` (`target`/`from`) casam **arrays de diretório** — a MESMA classe de padrão de `no-restricted-imports.patterns`, só com API diferente. Adotá-la não escapa do `Fato 1` de `:154-160`; troca o nome do instrumento, não a propriedade dele |
| `project references` do TypeScript | `[MEDIDO 2026-09-02: ls frontend/tsconfig.json → No such file or directory (mesma ausência que `universe-at.ts:22-24` já documenta)]` | **inexequível sem infraestrutura nova.** Exigiria criar `tsconfig.json` + subprojetos (`references`) para `charts`/`web` — uma reestruturação de repositório inteira, fora do escopo desta task ("grid + boundary only", handoff `T-05.1.md`) |
| campo de manifesto por módulo | `[NÃO MEDIDO por falta de objeto a medir: nenhum manifesto desse tipo existe no repositório hoje]` | **exigiria um scanner novo**, bespoke, para ler o campo — a mesma classe de instrumento que `ADR-011/D4` baniu (`[[rules.own]]` regex-like) pelo motivo já medido lá: sem AST, "nome do arquivo" e "conteúdo do arquivo" são coisas fáceis de dessincronizar, e nada aqui as manteria em acordo |

**Conclusão medida, não presumida:** nenhuma das três alternativas está disponível HOJE sem
adicionar dependência nova, criar infraestrutura nova (`tsconfig.json` + subprojetos), ou
construir um instrumento novo da classe que `D4` já baniu. `no-restricted-imports.patterns`
continua sendo, medido em 2026-09-02 como em 2026-08-28, o único instrumento que este
repositório já tem e que casa especificador de módulo via AST.

**E aqui está a distinção que faltava, e que resolve `Fato 1` sem inverter esta ADR pela porta
dos fundos:** `Fato 1` (`:154-160`) tem razão sobre a LETRA — para um import relativo do mesmo
repositório, "especificador de módulo" e "caminho" são, hoje, o MESMO texto (não há alias nem
pacote publicado que os separe). **Mas o que `:46` recusou não foi "um instrumento que lê
caminho" — foi usar caminho para decidir QUEM REVISA um arquivo** (`[agents.by_component]`,
`code_paths.classify`, o roteamento de arquiteto). `frontend/eslint.config.mjs` não é essa
superfície: `harness policy --key agents.by_component` e `harness code-paths classify` não leem
este arquivo, e não vão passar a ler — **nenhuma linha das duas regras abaixo alimenta essas
duas chaves de política**. Se `charts` for reorganizado fisicamente amanhã, o custo é UMA edição
neste arquivo de lint (dois `files:`/`group:`), não uma reatribuição silenciosa de dono de
julgamento — que é exatamente o dano que `:46` nomeia e que continua evitado.

**Decisão:** `D5.12` fecha com `no-restricted-imports.patterns`, simétrico e total nas duas
direções (`frontend/eslint.config.mjs`, dois blocos de `files`), provado nas duas metades de
`1.8'` na mesma passada por `frontend/src/charts/eslint-boundary.test.ts` — `[MEDIDO
2026-09-02: MORDE — 2 violadores efêmeros plantados, `eslint src` → `rc=1`, 2 problemas, ambos
nomeando `no-restricted-imports` e citando esta ADR; CALA — violadores removidos, `eslint src`
sobre os módulos REAIS de `charts`(12 arquivos) + `app`(11) + `features`(10) → `rc=0`,
`[MEDIDO 2026-09-02: find frontend/src/{charts,app,features} -type f | wc -l por diretório]`]`.
`ADR-003`
fica de pé — não foi reescrita, porque a alternativa que `:53` temia (reabrir e reescrever
`FR-1`/`FR-2`) não se tornou necessária.

**O que fica deliberadamente de fora, e é gap declarado, não escondido:** `frontend/src/
components/**` não está em nenhum dos dois grupos (`charts` nem `web`) — hoje ele tem 1 arquivo
(`format-percentage.ts`) que não importa nem é importado por nenhum dos dois lados
`[MEDIDO 2026-09-02]`, então a omissão não deixa nenhum import real sem guarda; mas um arquivo
futuro ali poderia atravessar a fronteira sem que esta regra o veja. Fica para quem primeiro
classificar aquele diretório — não é resolvido por presunção aqui.

## D2 — `FR-3` (Python ⇄ TypeScript): escopo declarado, e o buraco de `:222-228`/`:275-278` NÃO fecha, porque não é desta fronteira

`FR-3` diz "o motor de backtest importa a grade canônica". Esta task (`T-05.1`) prova que a
grade tem UMA implementação **do lado TypeScript** — `frontend/src/charts/canonical-grid.ts`,
consumida por dois call-sites reais e provada por `sha256` idêntico
(`docs/context/plataforma-dados/gates/T-05.1-builder.md`). O segundo call-site
(`canonical-grid-accessor-consumer.ts`) é um SUBSTITUTO declarado para o futuro consumidor
`backtest` — não existe hoje nenhum motor de replay/paper-trading em `frontend/src/`, e o
motor Python em `backend/src/` está fora do escopo desta task (handoff `T-05.1.md`: "Não toque
`backend/`").

**Isto não fecha `Fato 4` (`:222-228`), e não finjo que fecha:** um `import` Python de um
módulo TypeScript não existe e não vai existir — a linguagem impede. Se o vocabulário fechado
de componentes (`sentimento`·`charts`·`convergencia`·`backtest`·`web`·`docs`) algum dia tiver
um motor de `backtest` em Python que precise da MESMA grade, `FR-3` para aquele consumidor só
pode ser satisfeita por um contrato QUE NÃO É IMPORT — ex.: uma especificação compartilhada
(schema/vetor de teste) que os dois lados implementam contra, com paridade provada por teste
cruzado, nunca por um `import` que a linguagem não permite. **Isto é `[NÃO SEI]` de propósito:**
decidir qual desses dois lados (TS ou Python) é a fonte de verdade da grade, se algum dia
existirem os dois, é uma decisão de arquitetura que não tem candidato a resolver hoje —
permanece em aberto, dona `quant-architect`, gatilho: o dia em que uma task real precisar de
bucketing de tempo em AMBAS as linguagens para o MESMO propósito (hoje nenhuma precisa).

---

# ⚠️ Acrescentado por `T-05.1`/`quant-architect` em 2026-09-02 (correção pós-QA) — `D5.12` tinha um buraco estrutural em `import()` dinâmico, fechado com uma segunda regra

**Nenhuma linha acima foi apagada.** O bloco `D1` (`:291-338`) afirmou que `D5.12` fechava
"simétrico e total" com `no-restricted-imports.patterns`. **Essa afirmação estava incompleta,
não errada na parte que mediu** — QA independente (`docs/context/plataforma-dados/gates/
T-05.1-qa.md` §3) provou, contra a fonte da própria regra
(`frontend/node_modules/eslint/lib/rules/no-restricted-imports.js:858-864`), que ela só
registra listener para `ImportDeclaration`/`ExportNamedDeclaration`/`ExportAllDeclaration` —
nunca para `ImportExpression`, o nó AST de `import(...)` dinâmico. `[MEDIDO 2026-09-02, QA:
await import("../charts/canonical-grid.ts") em src/app/ → eslint rc=0, ruleId: []]`. Isto não
era um gap de configuração deste repositório — é propriedade estrutural do `no-restricted-
imports` do ESLint, e `import()` dinâmico é o padrão idiomático para lazy-load de bibliotecas
de gráfico (`next/dynamic`), então não era cenário de laboratório.

**Fechado, não apenas declarado — via a opção (a) que o QA sugeriu:** uma segunda regra,
`no-restricted-syntax`, com seletor `esquery` sobre `ImportExpression[source.value=/.../]`,
espelhando o mesmo grupo de alvo de cada bloco de `no-restricted-imports`
(`frontend/eslint.config.mjs`, os dois blocos de `files:` de `D5.12`). Medido:

```
$ npx eslint src/app/_probe.ts        # await import("../charts/canonical-grid.ts")
rc=1, ruleId: ["no-restricted-syntax"]          # [MEDIDO 2026-09-02]

$ npx eslint src/charts/_probe.ts     # await import("../app/routes.ts")
rc=1, ruleId: ["no-restricted-syntax"]          # [MEDIDO 2026-09-02]

$ npx eslint src                      # árvore real, sem probes
rc=0, 0 messages                                # [MEDIDO 2026-09-02]
```

Provado nas duas metades de `1.8'` (morde+cala) pelo mesmo padrão dos probes estáticos, em
`frontend/src/charts/eslint-boundary.test.ts` (novo teste
`"D5.12 MORDE+CALA (dynamic form): ..."`) — `npm --prefix frontend run test:charts` → **34
pass, 0 fail** `[MEDIDO 2026-09-02]` (era 33 antes desta correção). `npm --prefix frontend run
lint` → `rc=0`.

**O que isto NÃO cobre, e é gap declarado, não escondido:** o seletor casa o segmento de
caminho `app`/`features`/`charts` por regex sobre `source.value` — a mesma classe de padrão
"casa especificador de módulo" que o resto de `D5.12` já usa (`:310-320`), então não reabre a
discussão de `:46` sobre fronteira por caminho como critério de DONO. Um alias de bundler
(`@charts/...`) resolvido em tempo de build, se algum dia existir, não é alcançado por este
regex — não existe hoje (`grep -rn '"@charts' frontend` → nenhuma ocorrência), e fica para
quem primeiro introduzir alias de import neste projeto.

---

# ⚠️ Acrescentado por `T-05.1`/`quant-architect` em 2026-09-02 (correção pós-QA rodada 2) — mais 2 formas fechadas por AST, 2 formas declaradas FORA DE ESCOPO por limite estrutural, não por preguiça

**Nenhuma linha acima foi apagada.** O bloco anterior (`:365-407`) fechou `ImportExpression`
com `source` do tipo `Literal` (string simples). QA independente, rodada 2
(`docs/context/plataforma-dados/gates/T-05.1-qa.md`, seção "RODADA 2"), plantou 6 sondas
próprias e achou que o seletor `esquery` só lê o atributo `.value`, que só existe em nó
`Literal` — 4 formas cujo nó AST não tem `.value` atravessaram com `rc=0`/`ruleId: []`:
template literal puro, template literal interpolado, concatenação de string, e `require(...)`.

**As 4 formas se dividem em duas classes DIFERENTES, e o tratamento de cada uma é essa
distinção, não um julgamento de gosto:**

## Classe 1 — fechável por AST, e fechada nesta correção

| forma | por que é fechável | seletor `esquery` (`frontend/eslint.config.mjs`) |
|---|---|---|
| template literal SEM interpolação — `` import(`../charts/x.ts`) `` | `TemplateLiteral` com `expressions.length === 0` tem a string inteira resolvível em `quasis[0].value.cooked` ANTES do programa rodar — é o mesmo dado que `Literal.value` carrega, só num campo diferente. `[MEDIDO 2026-09-02: node -e "esquery.match(ast, esquery.parse('ImportExpression[source.quasis.0.value.cooked=/charts/]'))" → 1 match]` | `ImportExpression[source.type='TemplateLiteral'][source.expressions.length=0][source.quasis.0.value.cooked=/.../ ]` |
| `require("../charts/x.ts")` | `CallExpression` cujo `callee.name === "require"` com primeiro argumento `Literal` é EXATAMENTE tão resolvível quanto `ImportExpression` com `Literal` — mesmo padrão já usado, seletor novo porque nenhuma das duas regras existentes tinha qualquer seletor de `CallExpression` (`grep -c CallExpression node_modules/eslint/lib/rules/no-restricted-imports.js` → 0) | `CallExpression[callee.name='require'][arguments.0.value=/.../ ]` |

Fechado nos DOIS blocos de `frontend/eslint.config.mjs` (`src/charts/**` e
`src/app/**`+`src/features/**`), morde+cala provado nas duas direções em
`frontend/src/charts/eslint-boundary.test.ts` — `[MEDIDO 2026-09-02: npm --prefix frontend
run test:charts → 36 pass, 0 fail (era 34 antes desta correção); npm --prefix frontend run
lint → rc=0]`.

## Classe 2 — NÃO fechável por análise estática, declarado como limite permanente, não como TODO

**Concatenação de string** (`import("../charts/" + "x.ts")`) e **template literal
INTERPOLADO** (`` import(`../charts/${x}`) ``) exigem avaliar um valor computado em tempo de
EXECUÇÃO. Nenhum dos dois nós AST expõe uma string que nomeie o módulo-alvo antes do programa
rodar:

- `BinaryExpression` (a concatenação) não tem `.value` nem `.cooked` — os dois operandos
  podem ser, e frequentemente são, expressões arbitrárias (variável, chamada de função,
  resultado de `fetch`); resolver o valor final exige INTERPRETAR o programa, que é
  precisamente o que um linter estático não faz.
- `TemplateLiteral` com `expressions.length > 0` tem `quasis` (os pedaços literais) e
  `expressions` (os buracos) como arrays SEPARADOS — não existe um único `.cooked` que junte
  os dois, porque o valor de cada `expression` só existe em tempo de execução.

**Isto é a mesma classe de achado que a lacuna de alias já declarada** (`:401-407` acima,
"gap declarado, não escondido"): não é configuração incompleta deste repositório, é
propriedade estrutural de QUALQUER instrumento de análise estática (ESLint, TypeScript
`project references`, ou qualquer scanner AST) — nenhum deles executa o programa, então
nenhum pode saber o valor de uma expressão em tempo de escrita. Um especificador
deliberadamente ofuscado (concatenação, interpolação, `require` computado) é, por construção,
**indecidível estaticamente**.

**Declaração de escopo do contrato, explícita a partir desta correção:** `D5.12` reprova
import/export ES estático, e `import()`/`require()` dinâmico com argumento `Literal` ou
template literal NÃO interpolado. Um especificador computado em tempo de execução
(concatenação, interpolação, `require` com variável) está **fora do escopo deste contrato** —
é limitação conhecida e aceita, não item pendente de "fechar depois". Quem escrever esse
padrão em `charts` ou `web` está, por definição, contornando um contrato que declara
explicitamente não alcançá-lo — o mesmo tipo de ofuscação deliberada que nenhum linter de
nenhum projeto detecta sem executar o código.

**O que isto NÃO significa:** não é uma admissão de que o contrato "não serve" — a idiomática
para lazy-load de biblioteca de gráfico (`next/dynamic(() => import("../charts/algo.ts"))`)
usa um especificador LITERAL na esmagadora maioria dos casos reais (é assim que o bundler
consegue fazer code-splitting estático); só o caso patológico de especificador computado em
runtime escapa, e esse caso já teria outros problemas (o bundler também não consegue
code-split um `import()` cujo argumento não é estaticamente conhecido).

## Addendum `T-05.2` (2026-09-03, quant-architect) — o achado do `T-08.2` (`docs/INDEX.md:97`) É FECHADO, com medição real, não sintética

`docs/INDEX.md:97` registrou o achado de `T-08.2`/`D8.19`: **o eixo do Lightweight Charts é
ORDINAL, não temporal** — "com grade uniforme as duas leituras (índice de barra vs.
`event_time`) coincidem, com buracos divergem", e o registro nomeou o achado como "maior que
o veredito", com **16 tasks de `charts` assentando nessa premissa** sem que nenhum ADR o
tivesse formalmente fechado. `T-05.1`'s handoff (`docs/context/plataforma-dados/handoff/
T-05.2.md`) apontou `canonical-grid.ts`'s `buildChartSeries`/`GridSlot` (`candle: null`
explícito, nunca compactado) como o mecanismo candidato a fechar isso **por construção**, e
exigiu confirmação contra a biblioteca real antes de qualquer renderização — não assumida.

**Confirmado, com dado real de 4 dias × `BTCUSDT` (`data/binance/klines`, `data/binance/
metrics`, `data/binance/aggtrades`), não com carga sintética:**

1. `GridSlot`/`ScalarSlot` mapeados para o formato do `lightweight-charts` v5
   (`frontend/src/charts/s2-lightweight-adapter.ts`) usando o mecanismo de PRIMEIRA CLASSE
   da própria biblioteca para isto — `WhitespaceData`, um item `{ time }` sem valor —
   REALMENTE preservam a posição do slot no eixo: uma lacuna real de um dia inteiro
   (`2026-08-22`, ausente em `metrics` e em `aggtrades`) foi passada como 288 (OI, grade 5
   min) / 1.440 (CVD delta, grade 1 min) itens whitespace consecutivos, e
   `timeScale.timeToCoordinate()` continuou resolvendo uma coordenada não-nula para o
   primeiro minuto daquele dia — o slot ocupa posição no eixo mesmo sem dado
   `[MEDIDO 2026-09-03: frontend/src/charts/s2-axis-integration.test.ts, teste "NEGATIVE
   CONTROL — OI" — gapCoord=568.49 (lossless) vs gapCoord=null (naive, quando o mesmo
   período é filtrado em vez de preenchido com whitespace)]`.
2. `D5.11` (tolerância 0,5 px), medido na escala desta task (4 dias, 1 símbolo, 3 séries —
   preço 1m + OI 5m + CVD 1m — 15.264 amostras reais, 5.760 timestamps distintos no eixo
   compartilhado): **pior caso 0,0000 px**, dentro da tolerância
   `[MEDIDO 2026-09-03: npm --prefix frontend run test:charts, "D5.11 combined: n=15264
   distinct_t=5760 worst=0.0000px tol=0.5px within=true"]`.
3. **O CONTROLE NEGATIVO, que é o que fecha o achado de verdade** (um verde que não pode
   falhar não prova nada — `T-08.2`'s próprio argumento, reaplicado aqui): a MESMA lacuna
   real, mapeada filtrando os slots ausentes em vez de emitir whitespace (o erro plausível
   que um desenvolvedor futuro cometeria "limpando" a série), quebra `D5.11` em **189,50 px**
   (OI) e **189,63 px** (CVD delta) — **379× a tolerância** — exatamente a divergência
   ordinal-vs-temporal que `docs/INDEX.md:97` previu
   `[MEDIDO 2026-09-03: mesmo comando, testes "NEGATIVE CONTROL — OI"/"— CVD delta"]`.

**Conclusão, e ela é a que fecha o achado:** a premissa que 16 tasks de `charts` assumem —
"a grade é gapless, então ordinal e temporal coincidem" — **é verdadeira NA BIBLIOTECA REAL,
condicionada a `charts` sempre emitir um item por slot canônico (whitespace incluído)**. Essa
condição não é automática: `T-05.2` mediu que **omiti-la quebra o eixo em 379× a tolerância
com dado real**, não com um cenário hipotético. `frontend/src/charts/s2-lightweight-adapter.ts`
é hoje o único ponto de conversão `GridSlot`/`ScalarSlot` → biblioteca, e ele SEMPRE emite
whitespace para `candle`/`value === null` — a função `naiveDropGapsLine` que demonstra o
contrário existe SÓ como controle negativo de teste (documentado na própria função como código
morto de produção) e nunca é chamada pelo caminho de renderização real.

**Achado colateral, medido e não escondido:** `series.data()` (o getter público da biblioteca)
tem docstring afirmando devolver "original data items provided via setData"
(`node_modules/lightweight-charts/dist/typings.d.ts:2497`), mas **descarta silenciosamente
os itens whitespace do array retornado** — um `LineSeries`/`CandlestickSeries` alimentado com
`[real, {time}, real]` devolve `.data().length === 2`, não 3, único ou consecutivo, na borda
ou no meio `[MEDIDO 2026-09-03, bancada ad-hoc citada em
frontend/src/charts/s2-headless-run.ts:23-32]`. Isto NÃO invalida o fechamento acima — a
prova real de "losslessness" é o eixo (`timeToCoordinate` + `D5.11`), não `.data()` — mas é
uma divergência entre o JSDoc da biblioteca e o comportamento medido que qualquer consumidor
futuro de `series.data()` (auditoria, export, replay) precisa saber antes de usá-lo como fonte
da verdade.

**Segundo achado colateral, operacional, fora do escopo desta ADR mas nomeado para não se
perder:** `minBarSpacing` da biblioteca é `0,5 px` por padrão. Em 5.760 slots (4 dias × 1 min)
sobre uma pane de 1.200 px, o espaçamento exigido para caber tudo de uma vez é `~0,198 px`,
abaixo desse piso — a biblioteca RECUSA comprimir tanto com as opções padrão
(`assertViewportFitted` mediu isso como um `RangeError` real antes de o teste de `T-05.2`
sobrescrever `minBarSpacing` para fins de medição do eixo). Ou seja: **um `S2-mínima` real,
por padrão, não cabe inteiro numa viewport de 1.200 px de largura** — é decisão de UX de
`T-05.3`+ (zoom inicial, janela visível padrão), não desta ADR, mas o número está aqui para
quem for desenhar aquele chrome.
