# Decisões de execução — `plataforma-dados`, 2026-08-28

**Papel de origem:** `/workflow` (orquestrador, loop principal) · **Estado do ledger ao escrever:** `TASKS_APPROVED`
**Destino:** o owner abre o gate `build` a partir do **harness-panel** e a execução começa.

> ⛔ **Nada aqui autoriza nada.** O gate `build` é do owner (`CLAUDE.md`: *"Gates marcados owner
> (`spec`, `build`, `advance DONE`) não podem ser feitos por agente"*). Este documento **descreve** as
> quatro decisões tomadas em 2026-08-28 e entrega os comandos; **executá-los é ato do owner.**
> **O ledger é a identidade do estado.** Enquanto `harness pipeline state plataforma-dados` devolver
> `TASKS_APPROVED`, este documento é **intenção registrada, não estado.**

---

## 0. Os comandos, na ordem — o que rodar do harness-panel

### 0.1 Antes de abrir o gate: aplicar `D-1` nas duas superfícies

**`D-1` foi ACEITA (§2), e ela ainda não existe em disco.** São artefatos de outros papéis:

| # | superfície | edição | papel |
|---|---|---|---|
| 1 | [`docs/plans/SPEC-001-plataforma-dados/index.md`](../../plans/SPEC-001-plataforma-dados/index.md) | a aresta `01 (gateia tudo) └─> 02` passa a ser **`T-01.1` ─> `02`/`03`/`04`**; `T-01.2`/`T-01.3` passam a preceder `05` | `/architect` |
| 2 | `docs/context/plataforma-dados/tasks.toml` + Jira | `T-05.1` recebe `depends_on += ["T-01.2"]`; `T-01.2`/`T-01.3`/`T-05.1` saem de `blocked`; rótulo `contestado-d1` resolvido em `CST-9`, `CST-10`, `CST-35` | `/tech-lead` |

**Sem o item 1, a paralelização não acontece:** `/build` constrói **fase**, e a regra de fase do plano
ainda exige `01` inteira antes de `02`.

Verificação depois de aplicar:

```
harness tasks validate plataforma-dados     # esperado: OK — 81 task(s), 0 ERROR, 0 WARN
harness tasks list plataforma-dados         # esperado: 66 todo · 15 blocked (hoje: 63 / 18)
```

### 0.2 O gate — **só o owner**

```
harness pipeline approve plataforma-dados build "escopo: as 16 tasks destravadas das fases 01-04, zero resposta de owner pendente. D-1 ACEITA em 2026-08-28: a aresta de fase 01->02/03/04 passa a ser somente T-01.1; T-01.2/T-01.3 passam a preceder 05. Q16 respondida no mesmo ato (charts->quant-architect, web->ui-designer), destravando T-01.2, T-01.3 e T-05.1. Q1 SEGUE ABERTA e nenhuma task deste escopo depende dela. Registro: docs/context/plataforma-dados/decisoes-de-execucao-2026-08-28.md"

harness pipeline advance plataforma-dados BUILD_AUTHORIZED
```

### 0.3 A execução

**`T-01.1` é obrigatoriamente a primeira.** `harness policy --key test_cmd` → **`{}`**
`[MEDIDO 2026-08-28]`, e `D1.1` exige que o primeiro teste **seja um dos de `02`/`03`** — o que amarra o
runner ao trabalho que tem relógio. Depois dela o leque abre sem ordem imposta.

---

## 1. Decisão A — escopo do gate `build`: as **16 tasks destravadas** das fases `01`–`04`

**Declaração do owner (2026-08-28), opção escolhida de um conjunto enumerado:**

> **"As 14 destravadas (01+02+03+04)"**

`[PREMISSA-OWNER: 2026-08-28]`

**O número mudou de 14 para 16 no mesmo ato**, e a causa é a Decisão C: `Q16` foi respondida na mesma
rodada e destravou `T-01.2` e `T-01.3`, que não estavam no conjunto de 14 quando ele foi enumerado.
`T-05.1` também destravou, mas é `charts` — **entra na trilha do layout, não nesta.**

### 1.1 As 16, e o que prova que cada uma está destravada

`[MEDIDO: cadeia de `depends_on` em `tasks.toml`, sem nenhum ancestral `blocked`]`

| fase | tasks | gate declarado | componente |
|---|---|---|---|
| `01` | `T-01.1`, `T-01.2`, `T-01.3`, `T-01.4` | nenhum (`Q16` respondida) | `docs` |
| `02` | `T-02.3`, `T-02.4a` | — | `sentimento` / `docs` |
| `03` | `T-03.1`, `T-03.7`, `T-03.10` | nenhum | `sentimento` |
| `04` | `T-04.1` … `T-04.7` (**fase inteira**) | **nenhum · zero rede · zero API key** | `sentimento` |

**Fora do escopo, e o motivo é nominal:** `T-02.4b` depende de `T-02.1`, travada por `Q1`.

### 1.2 Por que este escopo é o que paraleliza com a sessão de layout

A trilha de layout que corre em paralelo produz `charts` e `web`. **Nenhuma das 16 toca esses dois
componentes** — 12 são `sentimento`, 4 são `docs`. A colisão é **zero por construção**, não por
coordenação.

E a fase `04` é a peça de maior valor da trilha: **7 tasks, offline, sem chave**, e ela decide se todo
dado gravado daqui para frente **nasce certo** — o shift canônico, a unicidade por `agg_id`, o acessor
`as_of` e a âncora obrigatória de `cvd_cum`. **Ela vem antes de ligar coletor, não depois.**

---

## 2. Decisão B — `D-1` ACEITA

**A aceitação é implícita na Decisão A** e está declarada no enunciado que o owner escolheu
(*"Implica aceitar D-1"*). Registro explícito aqui porque `D-1` **muda o grafo**, e grafo não se muda
por implicação silenciosa.

| | |
|---|---|
| **o que era** | [`index.md`](../../plans/SPEC-001-plataforma-dados/index.md): `01 (gateia tudo) └─> 02` |
| **o que passa a ser** | somente **`T-01.1`** precede `02`/`03`/`04`; `T-01.2`/`T-01.3` precedem `05` |
| **quem propôs** | `/tech-lead`, e **recusou aplicar sozinho** — [`handoff_to_builder.md`](handoff_to_builder.md) §3.2 e §8: *"são decisões de grafo… Marcadas, não aplicadas"* |
| **como recuperar as marcas** | `harness tasks json plataforma-dados \| grep -B4 CONTESTADO` · `jql: project = CST AND labels IN (contestado-d1)` |

### 2.1 O argumento que já estava medido, e que a decisão fecha

`tasks.toml` **já materializa `D-1` no nível de task**: `T-02.*`, `T-03.*` e `T-04.*` declaram
`depends_on = ["T-01.1"]` e **nenhuma** depende de `T-01.2`/`T-01.3` `[MEDIDO]`. O plano, no nível de
fase, dizia o contrário. **Duas superfícies aprovadas discordando sobre a mesma aresta** — e como
`/build` opera por fase, era a superfície mais restritiva que valia. `D-1` reconcilia as duas **na
direção que o `tasks.toml` já tinha**.

### 2.2 `D-2` NÃO foi decidida e segue pendente

`D-2` (o spike do eixo do Lightweight Charts, `T-08.2`/`CST-70`, agendado depois das 16 tasks de
`charts` que assumem a premissa que ele testa) **continua marcada e não aplicada**. Ela é decisão de
grafo **e de atribuição de Epic** (`CST-6` → `CST-1`), logo do owner. Não entrou nesta rodada porque
`T-08.2` é `charts` — **trilha do layout, não desta.**

---

## 3. Decisão C — `Q16` respondida

**Declaração literal do owner (2026-08-28):**

> **`charts` → `quant-architect` · `web` → `ui-designer`**

`[PREMISSA-OWNER: 2026-08-28]`

**Registro completo, com o critério e as três consequências, está na fonte única:**
[`docs/decisoes-do-owner.md` §Q16](../../decisoes-do-owner.md). Resumo do que importa para a execução:

1. **O relógio de retrabalho parou.** `Q16(d)` o definia como *"antes do primeiro `.tsx`"*. A resposta
   chegou antes. `[DOC]`
2. **Toda tela de `charts` passa a ter DOIS julgamentos independentes** — `quant-architect` sobre a
   fidelidade do dado, `ux-ui-mastery` sobre a interação. **Nenhum aprova o trabalho do outro.** Isto é
   conteúdo obrigatório de `T-01.3`.
3. **Nomear o dono é ZERO das duas partes que fecham `frontend/`.** Medido em 2026-08-28, **inalterado**:
   `harness policy --key code_paths` → `include_prefixes=["backend/src/"]`, `include_globs=["*.py"]`
   ⇒ `harness rules --mode file --path frontend/src/<violador>.tsx` **continua devolvendo saída vazia**.
   Fechar exige prefixo + globs TS/TSX **e** um pack cujos `paths` casem o layout — que é `T-01.2`.

**Isto NÃO revoga a delegação de design do `CLAUDE.md`.** O `ui-designer` segue decidindo UI/UX sem
pedir permissão, com `ux-ui-mastery` como gate. `[agents.by_component]` nomeia **dono de julgamento no
harness**, que é coisa diferente.

---

## 4. Decisão D — `Q13` reconciliada (correção de estado, não decisão nova)

`SPEC-001:649` registrava **`RESPONDIDA`** desde 2026-08-25; `decisoes-do-owner.md` — que se declara
**fonte única de estado** — registrava **`ABERTA`**. **A divergência era da fonte única, não da SPEC.**

Corrigido em 2026-08-28, com a origem citada no próprio bloco. Aproveitada a passagem para corrigir o
`"trocar custa 2 tokens"` que sobrevivia na linha `(d)`: o medido é **25 tokens · 4 valores com `hue` ·
361 medições** (`SPEC-001:548`, `ADR-010` §5/`E-2`). **Era o resíduo `E-4`** que
[`handoff_to_builder.md`](handoff_to_builder.md) §4.1 nomeou.

**Não gateia nada.** Está aqui porque duas superfícies discordando sobre o estado de uma decisão do
owner é exatamente o defeito que o §"colisão de numeração" da fonte única existe para não repetir.

---

## 5. O que NÃO foi decidido, e continua correndo

| | estado | relógio |
|---|---|---|
| **`Q1`** — autoriza ligar os coletores | `ABERTA` | **SIM, capture-or-lose. ~1 dia perdido por dia — único item do registro sem mitigação de engenharia** |
| **`Q15`** — ToS de Binance, Bybit, Coinalyze | `ABERTA`, **`[MEDIDO]: nada`** — ninguém leu os três | não por si; **incide RETROATIVAMENTE sobre o que `Q1` manda acumular** |
| **`Q19`** — `availability_probe_set` | `ABERTA` | **SIM.** Decide quais séries têm defasagem real **para sempre** |
| **`Q17`** resíduo — spread `(a2)` ou `(a3)` | `RESPONDIDA COM RESÍDUO` | **SIM.** Enquanto pender, `T-03.12` não nasce |
| **`D-2`** — o spike do eixo | marcada, não aplicada | trilha de `charts` |
| **os 3 números de SSH** — `ipinfo.io`, `free -m`, `df -h` | não medidos | **a região vence junto com `Q1`**, e `observer_region` é coluna de F0, impossível retroativamente |

**`Q1` e `Q15` não foram levadas a decisão nesta rodada de propósito.** Nenhuma das 16 tasks depende de
`Q1`, então a paralelização anda sem ela — e forçar `Q1` com `Q15` por ler seria pedir ao owner uma
decisão que [`handoff_to_builder.md`](handoff_to_builder.md) §5.4 declara **não dissolvível pela
decomposição**. **O relógio de `Q1`, porém, não parou por isso.**

---

## 6. Versão do mecanismo — conferida, **nada a atualizar**

Conferido em 2026-08-28 porque o owner suspeitou de uma versão nova. **Não há.**

| evidência | comando | resultado |
|---|---|---|
| versão da sessão | `harness version` | **`0.13.0`** |
| pin da política | `harness.toml` `[plugin] ref` | **`v0.13.0`** |
| veredito | `harness doctor` | **CONFORME**, 12 checagens, 1 aviso (interpretador) |
| última tag do mecanismo | `git -C ~/…/harness-plugin tag --sort=-v:refname \| head -1` | **`v0.13.0`** |
| `HEAD` do mecanismo | `git -C ~/…/harness-plugin log --oneline -1` | `ab25712 release: v0.13.0` · árvore **limpa** |
| versão declarada | `.claude-plugin/plugin.json` | **`0.13.0`** |
| commit instalado nesta raiz | `installed_plugins.json` | **`ab25712d43…`** — **idêntico ao `HEAD`** |

⇒ **instalado = pin = tag mais alta = `HEAD` do mecanismo.** A subida que o owner lembra é
**`0.12.0` → `0.13.0`, em 2026-08-25**, já aplicada e já documentada no comentário de `[plugin]` do
`harness.toml`.

**Uma linha desse comentário ficou obsoleta e foi corrigida:** ela avisava que *"o `harness` DESTA
sessão continua em v0.12.0 até reiniciar o Claude Code"*. A divergência era transitória e **resolveu** —
esta sessão reporta `0.13.0` `[MEDIDO 2026-08-28]`.

---

## 7. Estado esperado depois de cada passo

| depois de | `harness pipeline state` | `harness tasks list` |
|---|---|---|
| hoje, antes de qualquer coisa | `TASKS_APPROVED` | `63 todo · 18 blocked` `[MEDIDO 2026-08-28]` |
| `/architect` + `/tech-lead` aplicarem `D-1` | `TASKS_APPROVED` (inalterado — nenhum dos dois move o ledger) | `66 todo · 15 blocked` |
| `approve build` + `advance` **(owner)** | `BUILD_AUTHORIZED` | inalterado |
| `/build` → `/qa` → `/review`, por fase | `BUILD_AUTHORIZED` (**platô**) | conforme `harness status plataforma-dados` |

**`BUILD_AUTHORIZED` é platô, não passo.** Dentro dele a próxima ação não vem do estado, vem dos
**vereditos** de QA/review por fase — quem responde *"o que falta"* é `harness status plataforma-dados`,
nunca este documento.
