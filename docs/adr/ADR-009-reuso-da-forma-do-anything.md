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
