# ADR-009 — Reusar a FORMA do `anything_monorepo`, recusar o CONTEÚDO

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.1
**Fase/Epic:** F5a · `CST-1` · **Componente alvo:** `docs`
**Origem:** `premissas-de-infra-e-stack.md` §3.4 e **§4.3, que deixa isto explicitamente para o arquiteto** · `Q16` · `CA-F5-4`

## Contexto

O owner declarou `[PREMISSA-OWNER: 2026-08-25]`: monorepo `backend/` + `frontend/`; backend **Python + FastAPI, modular por bounded context**; frontend **Next, "mesma linha modular do `anything`"**; e — literal — *"podemos discutir os components de infra"*.

Medido no repositório vizinho, no disco:

| medida | valor |
|---|---|
| backend | **Poetry**, `python = "^3.12"`, `fastapi = "^0.139"`, `alembic`, `python-socketio` |
| layout de módulo | `src/modules/<bounded_context>/{domain,use_cases,infra,features}` — **17+ módulos** |
| layout de app | `src/{api/routes,config,core,infra/{database,events,providers,redis,socketio},jobs,main}` |
| **fronteira executável** | **`import-linter`** com dois tipos de contrato: `layers` (*"domain < use_cases < infra"*, por módulo) e **`forbidden`** (*"Boundary: `<mod>` business logic imports no other module"*, **um por módulo**) |
| qualidade | `ruff` + `mypy` + `pytest` com **piso de cobertura POR CAMADA** (`scripts/check-coverage-layers.sh`) |
| frontend | `next 16.2.11`, `react ^19.2.7`, `typescript ^6.0.3`, `tailwindcss ^4.3.0`, `@tanstack/react-query ^5.101`, `zod ^4.4.3`, `vitest ^4.1.8`, Playwright em `e2e/` |
| layout do frontend | **`src/app/**`** (rotas, grupos `(app)`/`(auth)`) · **`src/features/<feature>/`** · `src/components/{ui,states,a11y,theme}` |

**A fronteira de bounded context ali não é convenção — é verificada por ferramenta.** Isso é exatamente a forma que esta fase precisa: **condição de pronto com comando e universo**.

## Decisão

### D1 · A FORMA é copiada — quatro peças, e a razão de cada uma

| peça copiada | por que ela serve a ESTA fase |
|---|---|
| `src/modules/<bounded_context>/{domain,use_cases,infra}` + contrato `layers` | mantém a regra de dependência **executável**. Aqui ela protege coisa específica: **o acessor `as_of` vive em `use_cases`, e `domain` não conhece motor** — que é o que torna `ADR-002/D4` deferível sem reescrita |
| **um contrato `forbidden` POR COMPONENTE** | é **a versão executável de "componente alvo declarado"**. Sem ele, `[agents.by_component]` é decorativo e `ADR-003` é prosa |
| `pytest` com **piso por camada** | `[GAP G2]` pede `[test_cmd]`, e o piso por camada é o que impede a cobertura de subir na camada barata (`infra`) enquanto `domain` fica descoberto — e é em `domain` que R-1/R-2 vivem |
| layout do frontend em **`frontend/src/{app,features,components}`** | **decide `CA-F5-4`** — ver D3 |

### D2 · O CONTEÚDO é recusado, item por item — e esta é a metade que §4.3 pediu

| do `anything` | veredito aqui | por quê |
|---|---|---|
| **`organization_id` / multi-tenancy** | **NÃO SE APLICA** | single-user declarado. Importar a dimensão põe uma coluna constante em **toda** chave, e chave com termo constante é chave que **ensina errado** — a próxima pessoa a lê como eixo real. `SPEC-001` §4.4 usa `principal_id` como **dimensão de identidade**, que é outra coisa: um valor hoje, e não uma hierarquia de tenant |
| **`socketio`** | **NÃO SE APLICA** | [`ADR-005`](ADR-005-transporte-de-leitura.md) decide **SSE** para o vivo e **HTTP endereçável por conteúdo** para o histórico. Não há mensagem do browser para o servidor nesta fase |
| **`evolution` / domínio de conversas** | **NÃO SE APLICA** | domínio alheio |
| **`alembic`** | **APLICA-SE PARCIALMENTE** | serve catálogo/registro no Postgres (`ADR-002/D1`). **NÃO** governa a série colunar, e `harness.toml` **exclui `**/migrations/**`** ⇒ migração é **área declaradamente não coberta por regra**, e isso tem de ser dito e não descoberto |
| **`redis`** | **APLICA-SE, com o motivo trocado** | ali é cache/eventos; aqui é a **fila durável do escritor único** (`ADR-002/D5`). **Redis Pub/Sub é at-most-once por doc** (*"the message is forever lost"*) e **um acumulador de CVD não sobrevive a isso** ⇒ **Streams + consumer group**, nunca Pub/Sub |
| **`react-query`** | **APLICA-SE** | a rota de histórico é imutável por `knowledge_time` ⇒ cacheável para sempre; é exatamente o caso de uso |
| **`(auth)` como grupo de rota** | **APLICA-SE em forma, não em escopo** | `Q2` respondida: auth **mínima, single-user, extensível**. A forma do grupo de rota é gratuita e serve à extensibilidade que o owner pediu |

### D3 · Layout do frontend: `frontend/src/**`, e a decisão é de ENFORCEMENT

**Medido, e é o que decide:** o pack `web-fullstack` fixa `frontend/src/**`. ⇒ **um App Router em `frontend/app/` sai inteiro do universo de regras, em silêncio.**

**Decisão: `frontend/src/{app,features,components}`** — igual ao vizinho. **A escolha do layout não é estética; é a diferença entre coberto e "parecendo coberto".**

**E o fecho de `CA-F5-4` tem DUAS partes obrigatórias, medidas:**

```
(a)  code_paths.include_prefixes += "frontend/src/"   E   include_globs += globs TS/TSX
(b)  um pack cujos `paths` casem o layout escolhido
```

**Medido: adotar um pack sozinho não resolve nada.** Um `.tsx` violando duas regras por construção devolveu **saída VAZIA, zero regras avaliadas** — as regras de `web-fullstack` declaram `scope = "code"` e **o classificador não considera `frontend/` código**.

**E `web-fullstack.server-test-directory-present` não é enforcement parcial disponível hoje:** ela é `path-presence`, `severity = block`, `target = "backend/tests/**"`, **sem chave `scope`** — mas declara **`modes = ["sweep"]`** ⇒ dispara em **varredura de repositório, não por arquivo**, e **só depois de o pack ser adotado** (`harness policy --key packs` → `["core"]`).

### D4 · Python 3.12, e o `.python-version` solto sai

Medido: o vizinho fixa `^3.12` no Poetry e `mypy python_version = "3.12"`; o `harness doctor` resolve **3.12.8**; e este repositório tem um **`.python-version` = 3.13.13 solto na raiz**, não commitado. **Decisão: remover, não commitar** — um pin que contradiz a política e o interpretador do mecanismo é uma armadilha para a primeira sessão que rodar `harness` num shell diferente.

### D5 · Componentes de infra: PROPOSTOS, não decididos

O owner disse *"podemos discutir"*, e **discutir não é delegar a decisão** — o vocabulário de componentes é **fechado** e `policy_tracked = true`, logo alterá-lo é edição de política do repositório.

**O que eu levo ao owner, com o argumento e não só a conclusão:** testei o vocabulário atual contra o plano desta rodada e **ele cobre todos os itens de código**. Onde ele **não** cobre:

| item sem componente hoje | consequência |
|---|---|
| `deploy/` (compose, reverse proxy, TLS) | fora de `code_paths` ⇒ **fora de qualquer regra**, exatamente a mesma classe de defeito que `frontend/` |
| `G1` — backup com **teste de restauração**, e a declaração **por tabela** do que é re-derivável dos dumps e do que não é | é o mecanismo que protege o que **não** é re-derivável (liquidação intraday, `available_at` OBSERVED, snapshot datado, **`nq`**) e **nenhuma das seis fases o carregava** |
| a topologia do escritor único e da fila durável | é decisão de infra com consequência de contrato (`ADR-002/D5`) |

⇒ **proposta: um componente `infra`.** **Falsificador da proposta, e é o mesmo de `ADR-003`:** se todo item de plano conseguir declarar um dos **seis** componentes existentes **sem forçar**, o componente novo é custo sem retorno. **Hoje os três itens acima forçam** — eles caem em `docs` por eliminação, e `docs` é *"o que já existe hoje"*, não infraestrutura executável.

**Enquanto não houver decisão do owner, esses itens declaram `docs` e o plano marca `[COMPONENTE-ALVO FORÇADO: candidato a `infra`]`** — visível, não silencioso.

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **"seguir o `anything`" sem lista do que não se aplica** | é a rota direta para **`organization_id` num sistema single-user**, que é o exemplo que `premissas` §4.3 nomeia. Uma coluna constante em toda chave é dívida que ninguém remove depois |
| **começar do zero, sem reusar a forma** | descarta uma fronteira de bounded context **já verificada por ferramenta em CI** num repositório que hoje tem **5 regras e zero teste**. O custo de reinventar é alto e o benefício é nenhum |
| **App Router em `frontend/app/`** | **sai inteiro do universo do pack**, em silêncio, e o `doctor` diria CONFORME |
| **re-declarar a lacuna de `frontend/` em vez de fechá-la** | era desfecho aceito no critério antigo ⇒ **o critério passava com o enforcement inalterado.** `CA-F5-4` foi reescrito para exigir **BLOQUEIO devolvido**, e esta ADR o atende com (a)+(b) |
| **criar o componente `infra` por decisão de arquiteto** | altera vocabulário fechado em política versionada. É **edição de política**, e o dono é o owner |

## Falsificador

**Se, com (a)+(b) aplicados, `harness rules --mode file --path <um `.tsx` violador em `frontend/src/`>` continuar devolvendo saída vazia, então D3 está errado** — e o fecho de `CA-F5-4` precisa de uma terceira parte que ninguém identificou ainda. **É o mesmo comando que hoje mede a lacuna, e é por isso que ele é o falsificador: ele já foi executado uma vez com resultado conhecido.**

**Segundo falsificador, contra D1:** se um contrato `forbidden` por componente **não** puder ser escrito para `charts` e `web` sem ambiguidade, então `ADR-003` não decidiu a fronteira e este mecanismo não tem o que verificar.

**Terceiro, contra D2:** se qualquer chave desta plataforma precisar de um termo de escopo além de `principal_id` — um agrupamento de usuários, um espaço de trabalho — então a recusa de `organization_id` foi prematura. **Hoje não precisa: um usuário declarado.**

---

## D6 · A camada consumidora — API e worker — vive FORA do bounded context · **emenda de 2026-09-03**

**Por que emenda e não ADR nova:** a razão de existir desta ADR é *"reusar a FORMA do `anything`"*, e o que se corrige aqui é **uma peça que `D1` não copiou**. **Append puro:** `D1`–`D5` ficam como estavam, **inclusive a omissão** — reescrever `D1` apagaria a evidência de que ela existiu, que é justamente o que produziu o defeito.

### D6.0 · A premissa do owner, literal

> *"se é outro bounded context deve ser isolado dentro do que conversamos: sentimento, charts, convergencia na minha visão deveria ser bounded-context. Até pq já me parece que sentimento ta virando enorme.*
>
> *e sim, precisa ser exposto uma camada de API, daí a camada de api n pertence ao bounded-context, é o consumidor, usando de injeção de dependencias dos módulos. works tendem a ser a mesma coisa."*

`[PREMISSA-OWNER: 2026-09-03]` — registro: [`decisoes-do-owner.md` §*"o owner CORRIGE a forma de `5.13`"*](../decisoes-do-owner.md).

### D6.1 · O que `D1` copiou e o que ela NÃO copiou — medido, e é 30,8% do vizinho

A tabela de `D1` lista `src/modules/<bounded_context>/{domain,use_cases,infra}` + os contratos. **Ela não menciona `src/api`, `src/jobs`, `src/main`, `src/core` nem `src/config`.**

```bash
find anything_monorepo/backend/src -maxdepth 2 -type d          # src/{api,api/routes,jobs,main,core,infra,config,modules}
grep -rln 'FastAPI(' anything_monorepo/backend/src              # -> src/main/__init__.py
find anything_monorepo/backend/src -name '*.py' -not -path '*__pycache__*' | wc -l   # 327
# idem com -exec cat {} + | wc -l                                                     # 51.614
# idem restrito a modules/                                                            # 259 / 35.692
```

`[MEDIDO 2026-09-03: **68 módulos / 15.922 linhas FORA de `modules/` = 30,8% das linhas**; `api` **34 / 10.854** · `jobs` **3 / 186** · `main` **5 / 321** · `core` **7 / 705** · `config` **3 / 2.716**; n=327 módulos, 12 contextos]`

⇒ **a FORMA que esta ADR diz reusar TEM uma camada consumidora, e `D1` a omitiu.** O item `5.13` do plano `05`, escrito na manhã de 2026-09-03, pôs a rota como camada `infra/` do contexto `sentimento` e **fundamentou a escolha em `backend/pyproject.toml:202-207`** — que é verdade sobre o **contrato existente** e **não** sobre a forma do vizinho. **Nenhum dos dois agentes mediu `src/api/` antes de escrever o item.**

### D6.2 · A decisão: `src/api/` (+ `src/jobs/`) consome os contextos por injeção; nenhum contexto conhece seu consumidor

- **A camada de API não é parte de bounded context.** Ela consome `use_cases` (e os tipos de `domain`) e recebe o adaptador concreto **por injeção**, montado numa **raiz de composição**.
- **Worker é a mesma classe de coisa** — *"works tendem a ser a mesma coisa"* `[PREMISSA-OWNER: 2026-09-03]` ⇒ `src/jobs/`, tratamento idêntico.
- **Como o vizinho de fato faz, medido — e é o que sustenta a decisão:**

```bash
grep -rhoE 'from src\.modules\.[a-z_]+\.(domain|use_cases|infra)' anything_monorepo/backend/src/api \
  --include='*.py' | awk -F. '{print $NF}' | sort | uniq -c        # 40 domain · 94 use_cases · ZERO infra
grep -rc 'from src.config' anything_monorepo/backend/src/api --include='*.py' | grep -v ':0' | wc -l   # 28 de 34
```

`[MEDIDO 2026-09-03, n=134 imports de módulo em `src/api`]` — **`api/` nunca importa a `infra` de um contexto**, e **28 de 34** módulos importam a raiz de composição `src.config`.

> **O desvio do vizinho, declarado e não escondido:** `src/jobs/` importa `infra` **2×** (de 4 imports de módulo, n=4). Se o worker daqui precisar do mesmo, o adaptador vem **da raiz de composição** — **recortar `src.jobs` do contrato é sinal de erosão, não conserto.**

### D6.3 · Os dois contratos de `import-linter` que isto exige — e o vizinho **não** os declara

```toml
# (3) DIREÇÃO: a camada consumidora importa os contextos; nenhum contexto importa o consumidor.
[[tool.importlinter.contracts]]
name = "Camada consumidora > contextos: nenhum contexto conhece a API nem o worker"
type = "layers"
layers = ["main", "api | jobs", "modules"]
containers = ["src"]
exhaustive = false

# (4) PROFUNDIDADE: o consumidor fala com use_cases/domain, nunca com a infra de um contexto.
[[tool.importlinter.contracts]]
name = "Consumidor nao importa infra de contexto: o adaptador vem por injecao"
type = "forbidden"
source_modules = ["src.api", "src.jobs"]
forbidden_modules = ["src.modules.sentimento.infra"]
```

**O contrato (3) usa irmão INDEPENDENTE, e a sintaxe foi conferida na ferramenta instalada, não na documentação:** `_INDEPENDENT_LAYER_DELIMITER = "|"` e `_NON_INDEPENDENT_LAYER_DELIMITER = ":"` `[MEDIDO 2026-09-03: backend/.venv/lib/python3.13/site-packages/importlinter/contracts/layers.py:20-21, import-linter 2.14]` ⇒ `"api | jobs"` declara que **`api` e `jobs` não se importam entre si**, e ambos ficam **acima** de `modules`.

**E aqui a emenda vai ALÉM do vizinho, de propósito:** `grep -cE 'src\.api|src\.jobs' anything_monorepo/backend/pyproject.toml` → **`0`**, sobre **13** contratos declarados `[MEDIDO 2026-09-03]`. **O vizinho PRATICA a propriedade e não a DECLARA** — lá é convenção, aqui passa a ser **portão**. É a mesma escolha que `ADR-011/D3` já fez ao adotar `import-linter`: propriedade medida vale mais que propriedade praticada.

### D6.4 · O que esta emenda NÃO decide

| # | pergunta | dono |
|---|---|---|
| rótulo de componente da camada (`infra` · `api` · nenhum) | vocabulário fechado e `policy_tracked` ⇒ **edição de política**. O menu com o custo de cada opção é ato do `/architect` e está em [`05_fatia_visivel.md` §*"Menu para o owner"*](../plans/SPEC-001-plataforma-dados/05_fatia_visivel.md) | **⛔ owner** |
| partir `sentimento` em mais de um contexto (**130 módulos / 18.946 linhas** contra **50 / 9.313** do maior contexto do vizinho) | partição de contexto, com relógio de **retrabalho** (contrato + imports), **não** bloqueia `5.13` | **⛔ owner**, assessorado pelo `quant-architect` |

**E o efeito em `D5`, que é a razão de esta emenda não fechar `D5`:** a tabela de `D5` tem **três** itens que forçam o vocabulário (`deploy/`, backup com restauração, topologia do escritor único). **A camada consumidora é o QUARTO** — e ela é a primeira que é **código de produção executável**, não infraestrutura de operação. Isso **reforça** a proposta de `D5` e **não** a decide.

## Falsificador de `D6`

| # | falsifica | comando | hoje | tem de ser |
|---|---|---|---|---|
| **F-D6-1** | `D6.2`, **direção** — o contexto não conhece seu consumidor | `grep -rnE 'from (src\.)?(api\|jobs)' backend/src/modules --include='*.py' \| wc -l` | **`0`** (a camada não existe) `[MEDIDO 2026-09-03]` ⇒ mede **erosão**, não conquista | **`0`** depois de a camada existir. **≥ 1 e `D6.2` está violada** |
| **F-D6-2** | `D6.3`, **profundidade** — o par morde/cala de `1.8'` | `make boundaries` com um import plantado de `src.api` → `src.modules.sentimento.infra`, e sem ele | `[NÃO MEDIDO]` — os contratos não existem | **`≠ 0` nomeando o contrato (4)** com o violador · **verde** sem ele. Só um dos dois lados é ferramenta desligada ou ferramenta que reprova tudo |
| **F-D6-3** | a peça que faltava — a **injeção** | construir `src/api/` consumindo `ingest_health_query` **sem** importar `infra` de contexto | `[NÃO MEDIDO]` | se **não** for possível, a raiz de composição está faltando ⇒ o desfecho é **criar `src/config/`**, nunca recortar o contrato (4) |
| **F-D6-4** | **a própria emenda**, contra excesso de estrutura | ao fim da fase `05`: `find backend/src/api backend/src/jobs -name '*.py' \| wc -l` | `[NÃO MEDIDO]` | se a camada ficar em **1 módulo** e a injeção couber em **uma linha**, a forma do vizinho (**34 módulos / 10.854 linhas**, SaaS multi-tenant) **não se aplica nesta escala** e `D6` cobrou estrutura por antecipação — o vizinho é evidência de forma, **não** de tamanho |

### D6.5 · **`D5` está FECHADO no vocabulário — `infra` foi ADOTADO** · emenda datada de 2026-09-03

**O ato:** o owner escolheu, do menu de três opções que o `/architect` redigiu em [`05_fatia_visivel.md` §*"Menu para o owner"*](../plans/SPEC-001-plataforma-dados/05_fatia_visivel.md), a opção **`A` — `infra`**, com o custo declarado *"põe schema HTTP e TLS/compose sob o mesmo juiz"* **aceito**.

`[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` — **e o rótulo é este, não `[PREMISSA-OWNER]`:** nenhuma frase desta seção é fala do owner; ele escolheu uma opção de um menu escrito por agente, com o custo de cada uma na mesa. `CLAUDE.md` §*"os dois rótulos de owner não são o mesmo ato"*.

**`D5` fecha por IDENTIDADE, e é preciso dizer por quê:** `D5` perguntava *"o componente `infra` é adotado ou recusado?"* e **propôs exatamente o nome `infra`**. A escolha do owner é **esse** nome ⇒ a pergunta que `D5` fez está respondida: **ADOTADO**, `components` **6 → 7**.

**O que `D5` tinha de mais largo, e que a escolha NÃO fecha — porque não era pergunta de vocabulário:**

| item da tabela de `D5` | o que a adoção resolve | o que continua aberto, e de quem é |
|---|---|---|
| **a camada consumidora** (`api`/`jobs`, o 4º item, acrescentado por `D6.1`) | **rótulo resolvido** — `5.13` declara `infra` **sem marca de forçamento** | nada |
| `deploy/` (compose, reverse proxy, TLS) | ganha **casa de rótulo** | **continua fora de toda regra:** `harness policy --key code_paths` → `include_prefixes` com **3** entradas (`backend/src/`, `backend/tests/`, `frontend/src/`) e **`ls -d deploy` → inexistente** `[MEDIDO 2026-09-03]`. Rótulo **não** é cobertura: falta **item de fase** que ponha o prefixo em `code_paths`, como `T-01.2` fez por `frontend/src/` |
| `G1` — backup com teste de restauração | idem | idem: item de fase, dono `/architect` quando a fase existir |
| topologia do escritor único / fila durável | idem | `ADR-002/D5`, não esta ADR |

⇒ **o que fecha é o VOCABULÁRIO; o que resta é TRABALHO DERIVADO, e ele não é `D5`.** Duas peças, as duas com dono nomeado: **(1)** `[agents.by_component.infra]` precisa de `architect` — **menu `J1`–`J4` no plano `05`, escolha do owner** (`V-16` reprova componente fora do enum, `lib/policy.py:539-543` ⇒ `components` primeiro, juiz depois); **(2)** o registro do ato é o item **`9.6`** / task **`T-09.4`** (`CST-86`, **`todo`**) `[MEDIDO 2026-09-03: grep -n -A6 '^id = "T-09.4"' docs/context/plataforma-dados/tasks.toml]`.

**A instrução de `D5` que CADUCA, e a que continua valendo:** *"enquanto não houver decisão do owner, esses itens declaram `docs` e o plano marca `[COMPONENTE-ALVO FORÇADO]`"* — **caduca para a camada consumidora** (declara `infra` agora) e **continua em vigor** para `deploy/`, backup e topologia, que seguem sem item.

**Nada foi escrito em `harness.toml` por esta emenda:** `harness policy --key components` continua devolvendo **6** rótulos até o ato de política acontecer `[MEDIDO 2026-09-03]`. **Documento marcado como decidido sem o ato na política é a mesma classe de defeito que `CLAUDE.md` nomeia para o ledger.**

### Falsificador da ADOÇÃO — substitui o da PROPOSTA, que perdeu objeto

O falsificador de `D5` era *"se todo item conseguir declarar um dos seis sem forçar, o componente novo é custo sem retorno"*. **Ele mediu a pergunta certa e a pergunta acabou** — proposta adotada não se falsifica por *"ninguém precisou dela"*. O que a substitui:

| # | falsifica | comando | tem de ser |
|---|---|---|---|
| **F-D6-5** | **a LARGURA do rótulo** — foi `infra` (largo) e não `api` (estreito) | ao fim da fase `05`: contar as coisas distintas que declaram `infra` — item de plano, prefixo de `code_paths`, task | **≥ 2 naturezas distintas** (camada consumidora **e** ao menos uma de `deploy/`/backup/topologia). **Se `infra` só rotular a camada de API e nada mais, a opção `B` (`api`) era o nome certo** e o rótulo largo comprou apenas ambiguidade de juiz — que é o custo que o owner aceitou pagar por antecipação |
| **F-D6-6** | **o juiz** — rótulo sem dono de julgamento | `harness policy --key agents.by_component` depois do ato de política | **`infra` presente COM `architect`.** `infra` no enum e ausente desta tabela é exatamente *"componente omitido é componente sem dono de julgamento"* (`ADR-003:11-13`) com uma camada a mais de silêncio: o rótulo existe, então ninguém procura o dono |

### D6.6 · **O contrato (4) de `D6.3` nasce com WILDCARD** — conserto de defeito silencioso, achado pelo estudo de partição · 2026-09-03

**Crédito, e é rastreabilidade e não cortesia:** o defeito foi achado pelo `quant-architect` em [`gates/estudo-particao-sentimento-2026-09-03.md`](../context/plataforma-dados/gates/estudo-particao-sentimento-2026-09-03.md) §7.1/§7.3 (achados `A5`/`A6`; 858 linhas, 51 `[MEDIDO]`), **horas depois de `D6.3` ser escrito**. **`D6.3` não é reescrito — `D6.6` o emenda**, pelo mesmo motivo que `D6.1` não reescreveu `D1`: apagar a redação defeituosa apagaria a evidência de que o defeito existiu.

**O defeito:** `forbidden_modules` apontando para módulo **inexistente** devolve **`KEPT`, `0 broken`, `rc=0`**. Com `forbidden_modules = ["src.modules.sentimento.infra"]`, partir ou renomear `sentimento` tira **11 módulos de `infra`** da cobertura **sem um byte de aviso** — e `src.modules.sentimento.infra` continua existindo (37 módulos ficam), então **nem o erro de módulo-inexistente aparece**. É o `rc=0` ambíguo de `ADR-012`: *sinal indistinguível entre "nada violou" e "o instrumento não é capaz de ver"*.

**A correção, normativa:**

```toml
forbidden_modules = ["src.modules.*.infra"]   # WILDCARD, nunca o nome literal do contexto
```

**Remedido por mim antes de aceitar** `[MEDIDO 2026-09-03, import-linter 2.14, configs em scratch; `backend/pyproject.toml` NÃO tocado]`:

| metade | config | resultado |
|---|---|---|
| **morde** | `source_modules = ["src.modules.*.infra"]`, `forbidden_modules = ["socket"]` | **`BROKEN`, `0 kept, 1 broken`, `rc=1`** — *"src.modules.sentimento.infra.binance_stream_probe -> socket (l.14)"* |
| **cala** | o mesmo com `src.modules.*.domain` | **`KEPT`, `1 kept, 0 broken`, `rc=0`** |
| **fantasma** (o defeito) | `forbidden_modules = ["src.modules.catalog.infra"]`, inexistente | **`KEPT`, `0 broken`, `rc=0`** |

⇒ **regra geral que esta emenda declara: contrato `forbidden` que ENUMERA nome de contexto é contrato que caduca em silêncio quando o contexto muda de nome.** O wildcard custa **zero hoje** — casa exatamente um contexto — e é pagável **sem mover arquivo nenhum**.

**O contrato (3) de `D6.3` NÃO muda, e a razão é a assimetria do mecanismo — medida:** ele não cita contexto (`containers = ["src"]`), e **`layers` falha ALTO**: `layers = ["main", "api | jobs", "modules"]` sobre a árvore de hoje devolve **`Missing layer in container 'src': module src.main does not exist.`, `rc=1`** `[MEDIDO 2026-09-03]`. **`forbidden` erra em silêncio; `layers` erra aos gritos** ⇒ (3) não pode virar fantasma. **Consequência de ordem, e ela é vinculante:** (3) só pode ser declarado **na mesma task que cria `src/main/`, `src/api/` e `src/jobs/`** — declará-lo antes deixa `make boundaries` vermelho por ausência, não por violação.

**Fora do escopo desta emenda, com dono nomeado:** os contratos **1** (`layers` por contexto, `containers = ["src.modules.sentimento"]`) e **3** (natureza, que perde **31 de 79** módulos = **39%** na partição) de `backend/pyproject.toml` são o mesmo defeito de enumeração, achados pelo mesmo estudo. **Donos: `ADR-011/D3a` e `ADR-016/D4`** — não esta ADR, e `backend/pyproject.toml` não foi tocado. **A partição de `sentimento` segue decisão do owner e NÃO é decidida aqui.**

| # | falsifica | comando | tem de ser |
|---|---|---|---|
| **F-D6-7** | o wildcard **casa mesmo** — `KEPT` com wildcard poderia ser *"não casou com nada"*, a mesma armadilha em roupa nova | plantar `import socket` em um módulo de `src/modules/<qualquer>/infra/` e rodar `make boundaries` com (4) em wildcard | **`≠ 0` nomeando o módulo plantado.** `KEPT` com o violador na árvore = o wildcard não casou nada, e o conserto trocou um portão cego por outro |

### D6.7 · A cobertura de `deploy/` — **três partes que só valem juntas**, e o item NÃO pode nascer na fase `05` · 2026-09-03

**O gatilho:** o owner autorizou o item de fase para `deploy/`, e o `/tech-lead` mediu que, na quebra dele, **`infra` é declarado por 2 tasks (`T-05.12`, `T-05.13`) e as duas são a MESMA natureza** (a camada consumidora) ⇒ **`F-D6-5` dispara sem conserto disponível**. Esta seção dá o conserto e **re-mira o falsificador**, e as duas metades andam juntas de propósito: **re-mirar sozinho seria afrouxar.**

**A lacuna, medida por mim, e ela é MAIOR do que "falta prefixo":**

```bash
harness code-paths classify deploy/docker-compose.yml   # nao-producao — "nenhum include_prefixes casa"  rc=1
harness code-paths classify backend/src/config.yml      # nao-producao — "nenhum include_globs casa"      rc=1
grep -hE '^(paths|target) *=' packs/{core,web-fullstack,hexagonal-layers,read-model-projection}/rules.toml | sort -u
#   backend/**/*.py · frontend/src/** · **/*.py  (+ 2 `target` de path-presence)
```

`[MEDIDO 2026-09-03]` — ⇒ **as 10 regras em vigor alcançam `.py` e `frontend/src/**`, e ZERO alcança `*.yml`, `*.yaml` ou `Dockerfile`** (n=10 regras, 4 packs). **`core.hardcoded-secret` — a regra que EXISTE para segredo em código — declara `paths = ["**/*.py"]`** (`packs/core/rules.toml:50`) e **não veria uma senha num `docker-compose.yml`**.

⇒ **cobrir `deploy/` exige TRÊS partes, e é o mesmo formato do item `1.4` da fase `01`** (*"(a)+(b) sem (c) não fecha nada, e (c) sem (a)+(b) também não"*):

| parte | o que | por que sozinha não fecha |
|---|---|---|
| **(a)** | `code_paths.include_prefixes += "deploy/"` | sem (b), `.yml` continua `nao-producao` — *"nenhum include_globs casa"* |
| **(b)** | `include_globs += "*.yml"`, `"*.yaml"` | com (a)+(b) o `classify` diz `producao` **e nenhuma regra morde** ⇒ **cobertura aparente, zero mordida** — o defeito exato de `D1.4` |
| **(c)** | **uma regra que ALCANCE YAML** — `[[rules.own]]` **com corpus** (`plano 01` item `1.8`: *"toda `[[rules.own]]` que a fase declarar nasce com corpus"*, `harness corpus verify` + `mutate`). Alvo óbvio: **segredo em compose**, porque a regra que existe para isso não enxerga o arquivo | sem (a)+(b) a regra nunca é avaliada |

**⚠️ `[NÃO MEDIDO]`: se `include_globs` aceita nome sem extensão (`Dockerfile`).** O comando que decide, e ele exige o ato de política: acrescentar `"Dockerfile"` a `include_globs` e rodar `harness code-paths classify deploy/Dockerfile`. **Enquanto não medido, `Dockerfile` fica fora da cobertura e isso está escrito, não suposto.**

**O item CRIA `deploy/` — e a razão é a armadilha de vacuidade, medida:** `classify` **não confere existência** (`harness code-paths classify backend/src/api/routes/ingest_health.py` → **`producao`** para arquivo que **não existe** `[MEDIDO 2026-09-03]`). ⇒ **o DoD não pode ser `classify`**; ele é o de `D1.3`, verbatim: **`harness rules --mode file --path deploy/<violador real>` devolve BLOQUEIO nomeando a regra, `exit=2`** (**morde**) **e** o mesmo comando sobre um arquivo legítimo real devolve **silêncio, `exit=0`** (**cala**) — **os dois sobre arquivo que EXISTE na árvore**. Hoje o "antes" é inequívoco: `harness rules --mode file --path deploy/docker-compose.yml` → **saída vazia, `rc=0`**, e `ls -d deploy` → **inexistente** `[MEDIDO 2026-09-03]`.

**Em que fase ele mora — e a resposta NÃO é `05`:**

| fase | veredito |
|---|---|
| **`05`** (autorizada e aberta) | **NÃO.** Fechar cobertura de `deploy/` aqui contradiz o próprio item `5.11`, que rebaixou a superfície de auth por *"vps n é problema agora, vai rodar muito local até lá"* `[PREMISSA-OWNER: 2026-08-25]` e invocou `PRD-001` §12 (*proíbe construir especulativamente*). **A VPS é destino, não presente** — escrever `deploy/` na fatia visível é a construção especulativa que aquele item recusou |
| **`09`** (consolidação) | **NÃO.** Os **8** itens de `09` são **registro** (`9.1`–`9.8`, componente `docs`), e ela **depende de `04`,`06`,`07`,`08`** ⇒ fechar cobertura ali deixa `deploy/` fora de toda regra o projeto inteiro. `9.6` registra a **decisão** de `infra`; não fecha **enforcement** |
| **`01`** (governança gateante) | **SIM, por precedente literal:** o item `1.4` é *"Cobertura de `frontend/` fechada, em três partes que só valem juntas"*, com DoD `D1.3`/`D1.4`, componente `docs` — **a mesma propriedade, o mesmo formato, o mesmo instrumento** |

**⛔ E a fase `01` tem `7 de 7` tasks `done`** (`T-01.1`..`T-01.7`) `[MEDIDO 2026-09-03]`, e o owner **não** autorizou reabri-la — autorizou a `05` (`A7`). ⇒ **esta ADR ESPECIFICA o item e NÃO o escreve em plano nenhum.** É o mesmo desfecho de `A6`, e pelo mesmo motivo: **um único ato de owner sobre a fase `01` materializa os dois** (`A6` + cobertura de `deploy/`), e escrever qualquer um deles noutra fase criaria segunda verdade sobre a mesma superfície.

**E o trabalho de `deploy/` não tem casa em fase nenhuma hoje** — `grep -niE 'deploy|vps|compose|systemd|reverse proxy|TLS'` sobre as **8** fases fora da `05` → **`0` linhas** `[MEDIDO 2026-09-03, n=8 arquivos]`. **A ausência é o achado:** `ADR-009/D5` nomeou `deploy/` em 2026-08-2x e **nenhuma fase o adotou desde então**.

| # | falsifica | comando | tem de ser |
|---|---|---|---|
| **F-D6-5b** | **substitui o RELÓGIO de `F-D6-5`, não o critério** — e a substituição é PAREADA com `D6.7`, que dá ao segundo natureza um item especificado e um DoD | ao fechar `9.6`/`T-09.4` (o registro da decisão de `infra`): contar as naturezas distintas que declaram `infra` | **≥ 2 naturezas** — a camada consumidora **e** ao menos uma de `deploy/`/backup/topologia. **Por que o relógio mudou, e por que isto NÃO é afrouxamento:** *"ao fim da fase `05`"* era um marco em que a resposta é **estruturalmente pré-determinada** — a `05` é a fatia visível, e `deploy/` **não tem item em nenhuma das 9 fases** ⇒ o critério mediria o escopo da fase, não a largura do rótulo. O novo marco é **mais tarde e mais duro**: é onde a decisão de `infra` é **registrada**, e chegar lá com uma natureza só significa que **`api` (opção `B`) era o nome certo**. **Mover este relógio SEM `D6.7` teria sido lavar o falsificador — por isso as duas metades estão na mesma seção** |

### D6.8 · **O ATO DE POLÍTICA ACONTECEU** — `components` 6 → 7, e o que a medição de `D6.5` dizia caduca aqui · `T-09.4`/item `9.6` · 2026-09-03

**Isto NÃO reescreve `D6.5`, e a razão é a mesma que fez `D6.1` não reescrever `D1`:** `D6.5` fechou com *"Nada foi escrito em `harness.toml` por esta emenda: `harness policy --key components` continua devolvendo **6** rótulos até o ato de política acontecer `[MEDIDO 2026-09-03]`"*. **Aquela frase continua verdadeira sobre aquela emenda** — ela era medição datada, e apagá-la esconderia que o documento esteve marcado como decidido antes de a política mudar, que é exatamente a classe de defeito que ela nomeia. **O ato é este parágrafo, e ele é auditável por comando:**

```bash
harness policy --key components
# ANTES:  ["sentimento", "charts", "convergencia", "backtest", "web", "docs"]            (6)
# DEPOIS: ["sentimento", "charts", "convergencia", "backtest", "web", "docs", "infra"]   (7)
```

`[MEDIDO 2026-09-03, n=1 chave de política]`. O motivo escrito vive em **duas** superfícies e as duas dizem a mesma coisa: `harness.toml` (comentário do enum, imediatamente acima de `components`) e esta seção.

**A DECISÃO, NAS DUAS DIREÇÕES QUE `D9.6` EXIGE** — *"adotado **ou** recusado, com o motivo — **nunca ausente**"*. `[DECISÃO-OWNER: 2026-09-03, escolha entre alternativas apresentadas]` — **não é fala do owner:** ele escolheu a opção `A` de um menu de três que o `/architect` redigiu, com o custo de cada uma declarado (`CLAUDE.md` §*"os dois rótulos de owner não são o mesmo ato"*).

| direção | rótulo | o motivo, na redação do menu |
|---|---|---|
| **ADOTADO** | **`infra`** | custo aceito: *"põe o schema HTTP e o TLS/compose sob o mesmo juiz — duas classes de risco diferentes com um só dono"*. É o rótulo largo: cobre a camada consumidora (`src/api/`, `src/jobs/`) **e** `deploy/`/backup/topologia numa decisão só |
| **RECUSADO** | `api` | *"nome preciso para a API, mas **mente para o worker** (`jobs/` não é API) e deixa `ADR-009/D5` aberto para `deploy/`/backup ⇒ **duas decisões em vez de uma**"* |
| **RECUSADO** | **nenhum rótulo** | *"zero ato de política, mas cai em `ADR-003:11-13` (componente sem dono de julgamento) e faria `sentimento` rotular código que não é dele — **falso por construção**"* |

**O que o ato mudou, medido — e é MENOS do que o rótulo sugere:** ele afeta **só** `components` + `[agents.by_component]` (`V-16`), ou seja **quem julga**. A consequência corrente e visível:

```bash
harness tasks validate plataforma-dados
# ANTES:  FALHOU — 93 task(s), 2 ERROR, 4 WARN   (rc=1)   ERROR = V-16 em T-05.12 e T-05.13
# DEPOIS: OK     — 93 task(s), 0 ERROR, 4 WARN   (rc=0)
harness validate --strict   # politica valida: cripto-strategy (schema_version=1)  rc=0, antes e depois
```

`[MEDIDO 2026-09-03, universo: 93 tasks de `docs/context/plataforma-dados/tasks.toml`]`. **As 4 `WARN` são pré-existentes** (`V-09`/`blocked_reason` em `T-02.4b`, `T-03.9`, `T-05.10`, `T-07.11`) e **continuam** — este ato não as toca, e fingir que as zerou seria creditar a si uma limpeza que não fez.

**⚠️ Verde não prova nada até uma mutação reprovar — a sonda, com os dois lados:** arquivo de tasks avulso com duas tasks, uma `components = ["infra"]` e outra `components = ["foo"]`.

```bash
harness tasks validate <sonda>.toml
# MORDE: ERROR ...:T-99.2 V-16 componente fora do enum: foo (validos: sentimento, charts,
#        convergencia, backtest, web, docs, infra)
# CALA:  T-99.1 (components = ["infra"]) NAO produz nenhum V-16
```

`[MEDIDO 2026-09-03, n=2 tasks]` — ⇒ o enum **não** virou permissivo: ele passou a aceitar exatamente **um** rótulo a mais, e continua reprovando o que está fora. (O outro `ERROR` da sonda é `V-23`, cabeçalho sem `plan`, alheio a `V-16`; declarado para a saída não parecer mais limpa do que é.)

**`F-D6-5b` AVALIADO NO MARCO QUE ELE MESMO ESCOLHEU — ele NÃO dispara, e a contagem é por comando.** O relógio é *"ao fechar `9.6`/`T-09.4`"*, que é agora:

| natureza | quem a declara | comando |
|---|---|---|
| **camada consumidora** (`src/api/`, `src/jobs/`) | item `5.13` do plano `05` (componente-alvo `infra`, sem marca de forçamento) + tasks `T-05.12`, `T-05.13` (`components = ["docs","infra"]`) | `grep -n 'components = .*"infra"' docs/context/plataforma-dados/tasks.toml` → **2 tasks** |
| **`deploy/`** (compose, reverse proxy, TLS) | item `1.14` do plano `01` (componente-alvo `infra`), criado pela reabertura de 2026-09-03 | `sed -n '154p' docs/plans/SPEC-001-plataforma-dados/01_governanca_gateante.md` |

⇒ **2 naturezas distintas**, o mínimo que `F-D6-5b` exige `[MEDIDO 2026-09-03, n=2 itens de plano + 2 tasks]`. **E o falsificador continua vivo, não gasto:** se o item `1.14` for retirado ou nunca virar task, `infra` volta a rotular só a camada de API e **`api` (opção `B`) era o nome certo**. O sinal a observar está escrito no próprio plano `01` (*"`find deploy -type f | wc -l` estagnado em 1"*).

**⛔ O QUE ESTE ATO NÃO FAZ, e nomear isto é a parte que impede o falso fechamento:**

1. **Não declara o juiz.** `[agents.by_component.infra]` continua **ausente** — é `T-01.8`, e a ordem não é preferência: `V-16` (`lib/policy.py:539-543`) reprova chave de `agents.by_component` fora do enum, logo **enum primeiro, juiz depois**. ⇒ **`F-D6-6` está DISPARADO agora, por construção e por uma janela conhecida**: `infra` está no enum e ausente da tabela de juízes. **Condição datada, com dono (`T-01.8`/`CST-100`) e auto-resolúvel** — e é o preço da ordem que `V-16` impõe, não um descuido.
2. **Não fecha `deploy/`.** **Rótulo não é cobertura:** `code_paths.include_prefixes` continua com **3** entradas e `ls -d deploy` continua **inexistente** `[MEDIDO 2026-09-03]`. Quem fecha é o item `1.14` (`D1.14`), em três partes que só valem juntas.
3. **Não toca o ledger.** `gate-record`, `approve` e `advance` são atos de **owner** (`CLAUDE.md` §*"O ledger é a identidade do estado"*), e `T-09.4` permanece com o status que o tracker disser até o owner movê-lo.
