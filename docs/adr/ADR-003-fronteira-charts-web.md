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

**`charts` tem DUAS chaves de propósito**, e achatá-las em uma seria desfazer a decisão do
owner: `architect` julga **fidelidade do dado**, `design_gate` julga **interação**, e
**nenhum dos dois aprova o trabalho do outro**. `web` também tem duas, porque o dono de
julgamento que o owner lhe deu é o `ui-designer` — o agente que o `CLAUDE.md` proíbe de
aprovar o próprio trabalho. A doutrina está em [`docs/gate-de-design.md`](../gate-de-design.md);
o esquema que comporta os dois ponteiros está medido em `harness.toml`.

## 🔴 O gatilho que `T-01.3` armou — e a data de validade que ele venceu

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

**Por que a regra morde agora e não mordia ontem, em um número:** `docs` **continua sem dono**
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
