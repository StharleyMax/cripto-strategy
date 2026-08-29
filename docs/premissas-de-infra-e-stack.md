# Premissas de infraestrutura e stack — declaradas pelo owner, e o que elas fecham

**Declarado em:** 2026-08-25 · **Status:** premissa de projeto (declaração do owner) + medição sobre um repositório existente
**Efeito:** **fecha Q2** (as duas metades), corrige uma premissa técnica do owner, acrescenta um eixo novo ao
ADR de motor, e declara a stack que o `[GAP G2]` e a decisão de cobertura de `frontend/` estavam esperando.

---

## 1. O que o owner declarou — literal

Respostas de 2026-08-25, citadas na íntegra para que nenhuma leitura minha passe por declaração:

> **Motor:** *"N conheço nenhum desses bd. Um banco relacional ta totalmente fora de contexto, pelo o q estou vendo,
> certo? Creio q o melhor caminho seja a spike se preciso, tudo irá roda em uma VPS, a mesma que roda o
> anything_monorepo, então n temos tanto recurso assim."*

> **Onde roda:** *"Como respondido anteriormente vai estar em uma VPS. Por hora podemos ter o menor escopo possível
> de auth, considerando um único user, daí o isolamento de users, keys e afins entra em outro momento, somente
> precisamos garantir que seja extensível sem grande complicações"*

> **Stack:** *"Monorepo, com uma estrutura para backend/ e frontend/. back modular em python com fastapi e afins,
> podemos discutir os components de infra. Front com next, seguindo a mesma linha modular do anything. Parte do
> back isolado por bounded context e módulos"*

**A pergunta dentro da primeira resposta é respondida no §3.1** — ela contém uma premissa incorreta, e ela é o
tipo de premissa que, não corrigida, elimina o candidato certo por motivo errado.

---

## 2. O que eu MEDI — o `anything_monorepo`, no disco, agora

O owner nomeou o `anything_monorepo` como referência de estrutura **e** como co-inquilino da VPS. Ele existe em
`/home/stharley/Documentos/projects/anything_monorepo`, então isto é **medição, não suposição**.

### 2.1 O que a VPS já roda `[MEDIDO: deploy/compose.prod.yml]`

| serviço | imagem |
|---|---|
| `postgres` | `postgres:15` |
| `redis` | `redis:7-alpine` |
| `evolution` | `evoapicloud/evolution-api` (overlay próprio) |
| `backend` | build local (FastAPI) |
| `frontend` | build local (Next) |
| `caddy` | `caddy:2-alpine` — **reverse proxy + TLS, parametrizado por `${PUBLIC_HOST}`** |

**Seis serviços, e o stack é publicamente exposto** (Caddy com TLS e host público).

### 2.2 A VPS está sob pressão de disco — e existe precedente de resolução `[MEDIDO: docs/deploy/r2_migration_runbook.md]`

O runbook `KAN-86` move a mídia de **MinIO local → Cloudflare R2** e traz, como passo 6, *"Desligar MinIO no VPS +
liberar disco"* com checklist *"disco liberado"*. A decisão está ratificada em `ADR-006` (2026-07-09), e o motivo
declarado inclui *"R2 = grátis no MVP, egress zero, zero-ops"*.

**Consequência para este projeto, e é a mais importante deste documento:** existe **conta Cloudflare R2 já
provisionada, com token, bucket e um adapter `boto3` que é config-only** (`S3MediaStorage`). Ou seja, **storage de
objeto compatível com S3 não é infraestrutura nova a construir — é infraestrutura existente a reusar.**

### 2.3 O padrão modular do backend `[MEDIDO: backend/pyproject.toml, backend/src]`

- **Poetry** · `python = "^3.12"` · `fastapi = "^0.139"` · `python-socketio`, `alembic`
- `src/modules/<bounded_context>/{domain,use_cases,infra,features}` — **17+ módulos** (`auth`, `contacts`,
  `conversations`, `compliance`, `integrations`, `messages`, …)
- `src/{api/routes,config,core,infra/{database,events,providers,redis,socketio},jobs,main}`
- **`import-linter` com contratos executáveis**, e são de dois tipos:
  1. `type = "layers"` — *"Clean Architecture layers (per module: domain < use_cases < infra)"*
  2. `type = "forbidden"` — **um contrato por módulo**: *"Boundary: `<mod>` business logic imports no other module (§2.2)"*
- `ruff` + `mypy` (`python_version = "3.12"`) + `pytest` com **piso de cobertura POR CAMADA**
  (`scripts/check-coverage-layers.sh`)

**A fronteira de bounded context ali não é convenção — é verificada por ferramenta em CI.** Isso importa porque
é exatamente a forma que `CA-F5-*` pede: condição de pronto com comando e universo.

### 2.4 O padrão modular do frontend `[MEDIDO: frontend/package.json, frontend/src]`

`next 16.2.11` · `react ^19.2.7` · `typescript ^6.0.3` · `tailwindcss ^4.3.0` ·
`@tanstack/react-query ^5.101` · `zod ^4.4.3` · `vitest ^4.1.8` · Playwright em `e2e/`
Layout: `src/app/**` (rotas, com grupos `(app)` / `(auth)`) · **`src/features/<feature>/`** · `src/components/{ui,states,a11y,theme}`

---

## 3. O que isso RESOLVE

### 3.1 ⚠️ Correção: "banco relacional está fora de contexto" está INCORRETO — os três candidatos são relacionais

A premissa merece correção direta, porque ela eliminaria o candidato preferido por motivo errado:

| candidato | relacional / SQL? | modelo de armazenamento | precisa de daemon? |
|---|---|---|---|
| **TimescaleDB** | **sim — é uma EXTENSÃO do PostgreSQL** | híbrido (row + compressão colunar) | **sim** (o Postgres) |
| **ClickHouse** | **sim, SQL** | colunar | **sim** |
| **Parquet/DuckDB** | **sim, SQL** | colunar | **NÃO — é embarcado, roda dentro do processo** |

**Os três são relacionais e falam SQL.** O eixo que decide **não é** relacional × não-relacional; são dois outros:

1. **row-store OLTP × column-store OLAP** — nosso perfil é OLAP puro: append-only, leitura sequencial pesada de
   backtest, agregação por bucket. Isso desqualifica **Postgres puro como row-store** para a série, não
   "relacional".
2. **daemon × embarcado** — e é aqui que a sua restrição de VPS morde, no §3.2.

### 3.2 Q2 · metade "onde roda" — **FECHADA**, e ela restringe o motor mais do que qualquer medição de performance

**VPS compartilhada com um stack de 6 serviços que já offloada dado para liberar disco.** Três consequências:

- **Somar um sétimo container servidor de banco (ClickHouse, ou um segundo Postgres) compete por RAM e disco com
  produção alheia.** Não é argumento de benchmark — é de vizinhança.
- **Mas existe um eixo que eu não tinha considerado e a medição revelou: `postgres:15` JÁ ESTÁ DE PÉ.** TimescaleDB
  é extensão de Postgres ⇒ *poderia* rodar **sem daemon novo**. Isso o tira do descarte automático e
  **acrescenta um quarto candidato ao ADR: "TimescaleDB na instância Postgres existente"** — com o custo próprio,
  que é acoplamento a um banco de aplicação não relacionada (backup, upgrade, `shared_buffers`, blast radius).
- **E o R2 já provisionado (§2.2) muda a forma do ADR.** Os ~87 GB do histórico em bucket **não precisam morar no
  disco da VPS**: Parquet particionado em R2, lido por DuckDB embarcado via `httpfs`, é a combinação que resolve
  simultaneamente disco, ausência de daemon e o *"custo de nuvem"* que o direcionamento nomeou. **Egress zero do R2
  é o que torna isso viável** — em S3 o mesmo desenho pagaria egress por cada varredura de backtest.

⚠️ **Nada disso decide.** É restrição declarada e candidato acrescentado. **O ADR continua exigindo falsificador**, e
o falsificador do candidato Parquet **não mudou e é o mesmo de `CA-F4-24`**: `CA-F3-12` proíbe backfill MODELADO
sobrescrever captura OBSERVADA e `CA-F4-25` exige recusar sob divergência de `knowledge_time` — as duas exigem
**ler o que já está lá antes de escrever**, e num store de objeto isso é responsabilidade da aplicação. **Quem
propor Parquet/R2 tem de dizer onde essa lógica vive.** Latência de rede por consulta é o segundo falsificador.

### 3.3 Q2 · metade "quem acessa" — **FECHADA**, e ela NÃO cria o sétimo/oitavo Epic

O owner declarou *"menor escopo possível de auth, considerando um único user"* + *"extensível sem grande
complicações"*. Isso resolve a trava que o PRD §12 registrava como *"não sei a resposta e não desenho as duas"*:

- **Auth NÃO é código morto** (a VPS é exposta, com Caddy/TLS) ⇒ o non-goal *"login/autenticação: indefinido — não
  construir especulativamente"* **está respondido e sai da lista**.
- **Auth NÃO é fase nova.** A condição de PRD §13.5 para um Epic extra era *"exposto ⇒ auth entra como FASE NOVA"*;
  a declaração é **mínima com extensibilidade**, não isolamento multi-tenant. ⇒ **continua 7 Epics.**
- **O requisito que fica é o de extensibilidade, e ele é falsificável:** identidade tem de ser **dimensão desde a
  primeira linha** — nunca constante implícita nem `NULL`. É o mesmo princípio já aplicado a `env` e a `provider`.
- **`observer_region` = a região da VPS** `[NÃO MEDIDO — ver §4]`, e continua sendo **coluna de F0**, impossível
  retroativamente (`[GAP G7]`).

### 3.4 A stack está declarada — e o `[GAP G2]` e a cobertura de `frontend/` ganham resposta

Declaração do owner: **monorepo `backend/` + `frontend/`** · backend **Python + FastAPI, modular por bounded
context** · frontend **Next, "mesma linha modular do anything"**. Combinada com §2.3/§2.4, isto entrega o que
estava faltando para F0 e F5:

- **`[test_cmd]` (`[GAP G2]`)** tem precedente executável: `pytest` com piso por camada + `vitest` no front.
- **Cobertura de `frontend/`** (a decisão que vence antes do primeiro `.tsx`): TypeScript é confirmado, logo a
  lacuna dos rule packs — cujas regras são todas `**/*.py` — **é real e tem de ser fechada, não re-declarada**.
- **`import-linter` é o mecanismo de fronteira de bounded context**, e ele mapeia direto no vocabulário fechado de
  componentes deste repo (`sentimento`, `charts`, `convergencia`, `backtest`, `web`) — um contrato `forbidden` por
  componente é a versão executável de *"componente alvo declarado"*.
- ~~**Python 3.12** (`^3.12` no Poetry, `mypy python_version = "3.12"`) — **coincide com o 3.12.8 que o
  `harness doctor` resolve**, e **contradiz o `.python-version` = 3.13.13** que ficou solto na raiz deste repo.
  ⇒ argumento a favor de removê-lo, não de comitá-lo.~~
  > 🔴 **SUPERSEDED por [`ADR-011/D5`](adr/ADR-011-o-portao-sai-do-harness-e-vai-para-o-make.md) em 2026-08-28.
  > Tarjado — não apagado — pelo `/architect` em 2026-08-29.** Este repositório **não apaga**; o texto acima
  > continua legível porque a medição que ele carrega (`.python-version` = `3.13.13`, e o `harness doctor`
  > resolvendo 3.12.8) **era verdadeira quando escrita**. O que caiu foi a **conclusão**, e o **sinal se
  > inverteu**: o `.python-version` **FICA**, e **3.13 é o alvo**.
  >
  > **Estado de hoje, medido:** `cat .python-version` → **`3.13.13`** · as declarações de versão nas superfícies
  > que declaram → **6 linhas, `0` divergentes de 3.13** `[MEDIDO 2026-08-29 na base `48d5500`:
  > `grep -nE '^(requires-python|python_version|target-version|PY_ALVO)' backend/pyproject.toml backend/scripts/*.sh`
  > lista as 6; a mesma lista por `grep -cvE '3\.13|py313'` → **`0`**]`.
  >
  > **Por que a inversão, em uma frase de `ADR-011/D5`:** a coincidência com o `3.12.8` do `doctor` era
  > argumento sobre **conveniência de ambiente**, não sobre a versão que o projeto quer declarar — e um
  > arquivo de versão solto na raiz é **declaração**, não sujeira, desde que alguma superfície a **confira**.
  > Hoje **três** conferem, e o assert sai **`rc=3`** se o venv divergir (`bootstrap.sh`, `lint.sh`,
  > `boundaries.sh`).
  >
  > **Esta órfã não era de task nenhuma** (diff zero em todas as 7 da fase `01`), e por isso sobreviveu ao
  > ciclo inteiro. **As outras duas menções a 3.12 neste arquivo — `:60` e `:67` — caem pelo mesmo
  > `ADR-011/D5`** e ficam igualmente legíveis: são a *declaração do owner à época*, e reescrevê-las
  > apagaria o que ele de fato disse em 2026-08-25.

*"podemos discutir os components de infra"* `[literal]` — registrado: os componentes de infra ficam **abertos para
discussão no ADR**, não decididos aqui.

---

## 4. O que ABRE — e é pequeno

### 4.1 `[NÃO MEDIDO]` Os recursos reais da VPS

*"n temos tanto recurso assim"* é restrição qualitativa. O ADR de motor precisa do número, e eu **não tenho acesso à
VPS**. Faltam três, e todos saem de dois comandos lá dentro:

| o que falta | como obter | por que decide |
|---|---|---|
| RAM total e livre | `free -m` | separa "cabe um daemon" de "não cabe" |
| disco livre | `df -h` | decide se qualquer byte de série pode morar local |
| região/provedor | painel, ou `curl -s ipinfo.io` | **`observer_region`, que é coluna de F0** |

**Não é bloqueante para a SPEC** (o ADR pode expressar o falsificador como teto declarado), **mas é bloqueante para
fechar o ADR de motor.**

### 4.2 O acoplamento ao Postgres existente é decisão, não detalhe

Se TimescaleDB entrar na instância que serve o `anything`, este projeto passa a compartilhar ciclo de backup,
janela de upgrade e falha com uma aplicação de produção alheia. **O ADR tem de nomear isso como custo**, não
descobri-lo depois.

### 4.3 "Mesma linha modular do anything" precisa de fronteira explícita

O `anything` é multi-tenant, orientado a conversas, com `socketio` e `evolution`. Reusar **a forma** (módulos,
camadas, contratos de import) não é reusar **o conteúdo**. O arquiteto tem de declarar o que é copiado como
padrão e o que **não** se aplica — senão importamos `organization_id` para um sistema single-user.

---

## 5. Procedência

| afirmação | comando |
|---|---|
| os 6 serviços da VPS | `grep -n "image:" anything_monorepo/deploy/compose.prod.yml` |
| pressão de disco + R2 ratificado | `sed -n '1,120p' anything_monorepo/docs/deploy/r2_migration_runbook.md` |
| Poetry / py 3.12 / FastAPI / import-linter | `grep -n -E "^\[|python =\|fastapi =\|type =" anything_monorepo/backend/pyproject.toml` |
| módulos por bounded context | `find anything_monorepo/backend/src -maxdepth 3 -type d` |
| stack do frontend | `grep -n -E '"(next\|react\|typescript\|vitest)"' anything_monorepo/frontend/package.json` |
| TimescaleDB é extensão do Postgres; DuckDB é SQL embarcado | conhecimento de domínio — **nenhum dos quatro foi instalado nem medido** |
