# Fase 01 — Governança gateante

**Epic:** `CST-1` (F5a) · **Componente alvo: `docs`** (+ `harness.toml`) · **Gate:** nenhum · **Só `1.1` (o runner) fecha ANTES de `02`/`03`/`04`** — `1.2` e `1.3` fecham antes de `05`, por `D-1` (owner, 2026-08-28 — [registro](../../context/plataforma-dados/decisoes-de-execucao-2026-08-28.md) §2)

**Por que primeiro:** as condições de pronto de `02` e `03` **já são testes** (`CA-F0-3` é o M-1, `CA-F0-4` é a rampa até o primeiro 429, `CA-F0-5` é matar o processo e retomar). Medido: `harness policy --key test_cmd` → **`{}`**. **Sem runner, a fase cujo dado não se recaptura termina com sete afirmações e nenhuma conferível por comando.**

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 1.1 | `[test_cmd]` declarado **e o primeiro teste nascendo junto** — `pytest` com piso de cobertura **por camada**, na forma medida no vizinho | `[GAP G2]`, `CA-F5-5`, `ADR-009/D1` | `docs` |
| 1.2 | `[agents.by_component]` ganha entrada para **`charts`** e **`web`** | `CA-F5-1`, `Q16`, `ADR-003` | `docs` |
| 1.3 | Fronteira `charts` ⇄ `web` registrada como ADR e **traduzida em contrato `forbidden` de import por componente** | `ADR-003`, `ADR-009/D1` | `docs` |
| 1.4 | Cobertura de `frontend/`: `code_paths.include_prefixes += "frontend/src/"` **e** globs TS/TSX **e** pack cujos `paths` casem o layout | `CA-F5-4`, `ADR-009/D3` | `docs` |
| 1.5 | Layout fixado em `frontend/src/{app,features,components}` — **decisão de enforcement, não de estética** | `ADR-009/D3` | `docs` |
| 1.6 | `.python-version` (3.13.13) **removido** da raiz; Python **3.12** declarado | `ADR-009/D4` | `docs` |
| 1.7 | **Proposta** de componente `infra` levada ao owner, com o argumento e o falsificador. **Não decidida aqui** | `ADR-009/D5` | `docs` |
| 1.8 | Toda `[[rules.own]]` que esta fase declarar nasce **com corpus** | `SPEC-001` §12 | `docs` |
| 1.9 | **Contrato `layers` — a peça 1 de `ADR-009/D1` ganha dono.** A direção `domain < use_cases < infra` deixa de ser convenção e vira **regra em vigor**, avaliada por `harness rules` nas duas superfícies que já existem (escrita e `pre-push`): **duas `[[rules.own]]`** — `own.layer-domain-up-import` e `own.layer-use-cases-imports-infra` — cada uma nascendo **com corpus**, por `1.8`. **Ordem lógica: logo depois de `1.1`.** O número é `1.9` porque renumerar quebraria os `refs` já materializados no tracker (`plano 01 itens 1.2+1.3`, `1.4+1.5`, `1.6+1.7`) | `ADR-009/D1` (peça 1), `ADR-003:61`, `SPEC-001` §12 | `docs` |

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D1.1** | o runner existe e roda | `harness policy --key test_cmd` **deixa de devolver `{}`**, e o comando declarado **roda verde** | **≥ 1 teste**, e ele é um dos de `02`/`03` |
| **D1.2** | dono de julgamento existe para os dois | `harness policy --key agents.by_component` **contém `charts` e `web`** | **2 componentes** |
| **D1.3** | **cobertura de `frontend/` FECHADA, medida por bloqueio devolvido** | `harness rules --mode file --path frontend/src/<violador>.tsx` **devolve BLOQUEIO** | **1 arquivo violando ≥ 2 regras por construção** (`const x: any`, `console.log`) |
| **D1.4** | a lacuna medida **antes** não se repete | o **mesmo** comando de D1.3 devolvia **saída VAZIA, zero regras avaliadas** `[MEDIDO]`. **Passar exige que a saída mude** | idem |
| **D1.5** | regra própria é enforcement **medido** | `harness corpus verify --corpus <dir> --reference <cmd>` **e** `harness corpus mutate --corpus <dir> --reference <cmd>` | **toda `[[rules.own]]` declarada nesta fase** |
| **D1.6** | fronteira de componente **executável** | o contrato `forbidden` de import **reprova** um import de `charts` para `web` e vice-versa | **2 imports proibidos, 1 em cada direção** |
| **D1.7a** | **direção de camada FECHADA, medida por bloqueio devolvido** | `harness rules --mode file --path <violador>` devolve **BLOQUEIO** nomeando a regra, nos **dois** violadores plantados | **2 violadores, 1 por regra**: `backend/src/modules/sentimento/domain/<x>.py` com `from src.modules.sentimento.use_cases…` e `backend/src/modules/sentimento/use_cases/<x>.py` com `from src.modules.sentimento.infra…` |
| **D1.7b** | a lacuna medida **antes** não se repete | o **mesmo** comando de D1.7a devolvia **saída VAZIA, exit 0** — e `harness rules --mode sweep` também `[MEDIDO 2026-08-28: fixture com o `harness.toml` deste repo + os 2 violadores plantados → `harness --root <fx> rules --mode file --path <cada um>` → saída `[]`, exit 0; idem sweep]`. **Passar exige que a saída mude** | idem |
| **D1.7c** | o gate que de fato reprova é o do `pre-push`, não só o de escrita | `harness rules --mode sweep --surface git-hook` **sai ≠ 0** com os violadores, e **sai 0 sem eles** | o universo que o sweep enxerga — **13 arquivos `.py`** hoje `[MEDIDO 2026-08-28: find backend/src backend/tests -name '*.py' -not -path '*/__pycache__/*' \| wc -l → 13. **Não** `find backend …`: isso devolve **888**, porque `backend/.venv` tem **875** `.py` — e o sweep não os vê, `exclude_globs` traz `**/.venv/**`]` |
| **D1.7d** | a regra **não reprova o código legítimo de hoje** | `harness rules --mode sweep` **verde** com as 2 regras declaradas e **nenhum** violador plantado | mesmos **13 arquivos**; o único import interno do repositório (`use_cases` → `domain`) **tem de continuar passando** `[MEDIDO 2026-08-28: grep -rnE '^[[:space:]]*(from\|import)[[:space:]]+src' backend/src --include='*.py' \| wc -l → 1]` |
| **D1.7e** | o corpus **defende** cada uma das duas regras (é `1.8` aplicado a `1.9`) | `harness corpus verify --corpus corpus --reference <cmd>` **VERDE** *e* `harness corpus mutate --corpus corpus --reference <cmd>` → **`2/2 mutantes mortos`** | **as 2 regras**. `mutate` só reprova quem tem violador **em caminho de teste** — ⇒ cada regra precisa de **um caso violador sob `backend/tests/…`** além do de produção |

**⚠️ D1.7 não passa com o pack `hexagonal-layers`, e isto foi medido — não presumido.** O pack **não está adotado** (`harness policy --key packs` → `["core"]`; `harness rules list` → **5 regras**, nenhuma de camada). E adotá-lo **não fecharia** `D1.7`, por três defeitos independentes, lidos em `packs/hexagonal-layers/rules.toml` do plugin **v0.13.0** instalado: (i) as **2** regras declaram `path_regex = ['/domain/']` ⇒ **não existe regra alguma para `use_cases` → `infra`**, que é metade de `D1.7a`; (ii) `domain-up-import` compila `from\s+{root_package}\.({upper_layers})` com `root_package = "src"`, e o layout modular põe **dois segmentos** entre a raiz e a camada `[MEDIDO 2026-08-28: a regex compilada, aplicada a `from src.modules.sentimento.infra…` → NÃO CASA; a `from src.use_cases.foo…` → casa]`; (iii) `upper_layers` traz `infrastructure`, e este repositório usa `infra`. **Consertar o pack é mudança no `harness-plugin` — outro repositório** — e por isso `1.9` declara regra própria: `[[rules.own]]` é o lugar onde vocabulário interno (`modules/<ctx>/`, `infra`) pode ser nomeado sem levá-lo para dentro de um pack compartilhado.

**⚠️ `ADR-003:61` — *"`grep` não é aprovação"* — é atendido, não contornado.** Duas razões, e as duas são medidas. **(1) A forma sintática é obrigatória, não provável:** `core.relative-import` (`BLOQUEIO`, `scope = "code"`, regex `^\s*from\s+\.+`) já proíbe **todo** import relativo no repositório ⇒ o import absoluto é a **única** forma legal, e é exatamente a forma que as duas regras casam. Não é uma amostra da superfície: é a superfície. **(2) A aprovação não vem da regex, vem da igualdade de veredito contra uma segunda implementação:** `--reference` é **obrigatório** em `harness corpus mutate` (sem ele o comando RECUSA), e `1.9` exige que esse classificador de referência seja **independente — parse de `import`/`from` por `ast`, não uma cópia da regex.** Referência que repete a regex torna a igualdade tautológica e **não** satisfaz `D1.7e`.

**⚠️ D1.3 é o critério que o `CA-F5-4` original não tinha.** Como estava escrito, *"re-declarar a lacuna com a contagem de arquivos"* era **desfecho aceito** ⇒ **o critério passava com o enforcement inalterado**. Um critério que passa sem que nada mude não testa nada.

## Não faz

Não escreve código de produção. **Não consolida ADR** (é `09`). Não decide arquitetura de dado. **Não altera o vocabulário fechado de componentes** — `1.7` é proposta ao owner.

### ⚠️ Exceção explícita à primeira frase: `1.1` escreve, sim, código de produção — e é `D1.1` que o obriga

**Acrescentado em 2026-08-28 pelo `/review` (`NON_COMPLIANT`, item C). A frase acima NÃO foi apagada** — ela continua valendo para `1.2`–`1.8`. O que ela não pode fazer é valer para `1.1`, porque **contradiz o `D1.1` da tabela de DoD**, e a contradição é defeito do plano, não indisciplina de quem o executou:

| | |
|---|---|
| **o que `D1.1` exige** | universo **`≥ 1 teste`, e ele é um dos de `02`/`03`** |
| **qual teste é esse** | `CA-F0-5` — *matar o processo e retomar* |
| **por que a proibição não pode valer aqui** | **não existe teste de matar o processo e retomar sem o código que se mata.** O critério nomeia um teste de comportamento de produção; satisfazê-lo sem produção é impossível |
| **o que de fato nasceu** | **10 arquivos** que `harness code-paths classify` chama `producao`, todos sob `backend/src/modules/sentimento/` `[MEDIDO 2026-08-28: 10 de 10]` |
| **a consequência de governança, e o motivo de isto estar escrito** | a task declarava `components = ["docs"]`, e `docs` **não tem dono** em `agents.by_component` `[MEDIDO 2026-08-28: harness policy --key agents.by_component → backtest, convergencia, sentimento; docs ausente]` ⇒ as invariantes de `domain` nasceram **sem o arquiteto no circuito de julgamento**. Corrigido para `["docs", "sentimento"]` em `tasks.toml`. `ADR-003:11-13`: *"componente omitido é componente sem dono de julgamento"* |

**Para a próxima task não herdar uma proibição que o próprio DoD contradiz:** o escopo de produção liberado aqui é **exatamente** o mínimo que `D1.1` exige — o módulo que o teste de `02`/`03` exercita — e **nada além**. Produção fora disso continua proibida nesta fase, e o componente que ela tocar tem de estar declarado em `components` **antes de o arquivo existir**, não depois.

### ⚠️ Por que `1.9` só existe agora: a peça 1 caiu **entre** os itens

**Acrescentado em 2026-08-28 pelo `/architect`, a partir do blocker remanescente do `/review` (`NON_COMPLIANT` da `T-01.1`). É defeito de PLANO, não de código** — e nenhuma linha acima foi apagada.

`ADR-009/D1` enumera **quatro** peças copiadas do vizinho. A **peça 1** é `src/modules/<ctx>/{domain,use_cases,infra}` **+ contrato `layers`**, e a ADR diz por que ela é peça: *"mantém a regra de dependência **executável**"*. O plano deu dono às outras três — `1.1` levou o layout de módulo e o piso de cobertura por camada, `1.3` levou o contrato **`forbidden`**, `1.4`/`1.5` levaram o layout do frontend. **Ninguém levou o `layers`.**

| | |
|---|---|
| **o que existe hoje no disco** | `backend/src/` tem **exatamente 1 import interno** — `use_cases/drain_etl_backlog.py:8` → `domain` `[MEDIDO 2026-08-28: grep -rnE '^[[:space:]]*(from\|import)[[:space:]]+src' backend/src --include='*.py' → 1 ocorrência]`. `domain` importa **0**, `infra` importa **0**, e `use_cases` toca `infra` só por `Protocol`. **É hexagonal de livro** |
| **o que mede isso** | **nada.** `harness rules list` → **5 regras**, nenhuma sobre camada `[MEDIDO 2026-08-28]` |
| **por que não é acadêmico** | `ADR-009/D1` declara que esta é a forma que **as ~80 tasks restantes vão copiar**. A direção sobrevive hoje por disciplina de uma pessoa numa sessão, e cada commit sem enforcement aumenta o custo de instalá-lo |
| **por que `[test_cmd].lint` sozinho não resolve** | `test_cmd` **não é lido por nenhum portão**: quem o consome são os agentes `builder` e `qa` `[MEDIDO 2026-08-28: grep -rn 'test_cmd' lib/ bin/ hooks/ agents/ no plugin v0.13.0 → só `lib/policy.py` (leitura da chave) e os dois `agents/*.md`]`. O `pre-push` deste repositório roda `require-push` **e `rules --mode sweep`** — e **não** roda `lint` `[MEDIDO 2026-08-28: cat .git/hooks/pre-push]`. Uma ferramenta só no `lint.sh` fica **fora do portão que de fato reprova**, e invisível a `harness rules list` |

**Onde o corpus mora, e por que importa para o DoD:** em **`corpus/`, na raiz** — fora de `code_paths` `[MEDIDO 2026-08-28: harness code-paths classify corpus/cases/… → "nao-producao: nenhum include_prefixes casa"]`. Os casos do corpus **são violadores por construção**; se nascerem sob `backend/src/` ou `backend/tests/`, eles próprios reprovam `D1.7d` e o sweep do `pre-push`.

## Falsificador da fase

Se, com `1.4` aplicado nas **duas** partes, D1.3 continuar devolvendo saída vazia, o fecho de `CA-F5-4` precisa de uma **terceira** parte que ninguém identificou — e `ADR-009/D3` está errado.

**Falsificador de `1.9`, e ele é executável:** se `harness corpus mutate --corpus corpus --reference <cmd>` devolver **mutante SOBREVIVENTE** para qualquer uma das duas regras, o corpus **não** defende aquela regra — e a regra é enforcement declarado, não medido, exatamente o que `1.8` existe para impedir. **Já medido em bancada, e a falha é real, não hipotética:** um corpus com violador só em caminho de produção devolveu `[SOBREVIVEU] own.layer-domain-up-import`; com o violador em caminho de teste acrescentado, `2/2 mutantes mortos` `[MEDIDO 2026-08-28: corpus de bancada em diretório temporário, `harness corpus mutate --corpus <tmp> --reference <ast>`]`.

**Segundo falsificador, contra a escolha do mecanismo:** se aparecer um import que viole a direção de camada e **não** seja pego pelas duas regras — um `importlib.import_module("src.modules.<ctx>.infra…")`, um alias construído em tempo de execução — então a forma declarativa é insuficiente e o `layers` precisa de análise de grafo (`import-linter`/`grimp`). **Registro honesto do limite: `import-linter` também é estático e também não veria esse caso** — o falsificador não aponta para ele como conserto pronto, aponta para "o mecanismo escolhido tem um buraco conhecido e este é o formato dele".
