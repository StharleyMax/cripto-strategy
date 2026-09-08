# PRD-005 — Coinalyze fora da quarentena: fórmula MODELED, probe em regime, mecanismo de promoção

**Feature:** `coinalyze-fora-da-quarentena` (**filha** de `plataforma-dados`, irmã de `captura-em-producao` — `harness pipeline show coinalyze-fora-da-quarentena` → `init`, `relate parent plataforma-dados`, `dispatch pm`, todos em `2026-09-08T12:21:3[4-5]Z`) · **Data:** 2026-09-08 · **Estado do pipeline ao escrever:** `INIT` → este documento leva a `PRD_DRAFT`
**Componentes tocados:** `sentimento` (fórmula MODELED, promoção, store de lag persistido, cadência de captura Coinalyze) · `infra` (persistência do probe em regime, possível cron/timer) · `docs`. `web`/`charts`/`convergencia`/`backtest` **não são tocados diretamente** — o efeito observável deles (uma série Coinalyze passa a aparecer em leitura de `backtest`) é consequência do predicado de quarentena mudar de valor, não de código novo nessas camadas. `harness policy --key components` → `["sentimento","charts","convergencia","backtest","web","docs","infra"]`, 7 elementos `[MEDIDO 2026-09-08]`.
**Fonte de verdade:** `harness policy --key docs.external_prd_repo` → saída vazia, `rc=0`; `docs.external_prd_paths` → `[]` ⇒ este PRD **nasce aqui**.
**Insumos lidos (integralmente ou na faixa citada):** `docs/decisoes-do-owner.md:214-267` (Q19) e `:34-94,169-271` (capture-or-lose, Q17) · `docs/specs/SPEC-001-plataforma-dados.md:376-421` (quarentena de 3 termos + fórmula MODELED) · `backend/src/modules/sentimento/domain/live_availability_write.py` (66 linhas, íntegro) · `backend/src/modules/sentimento/domain/quarantine_terms.py` (funções `quarantine_terms_for_catalog_entry`/`quarantine_drawer`/`readable_by_backtest`) · `docs/context/plataforma-dados/gates/T-03.6-builder.md` (133 linhas, íntegro) · `docs/context/plataforma-dados/gates/T-06.6-builder.md` (34 linhas, íntegro) · `docs/context/plataforma-dados/handoff/T-06.6.md` (41 linhas, íntegro) · `docs/context/plataforma-dados/tasks.toml:535-547` (`T-03.9`) · `docs/adr/ADR-027-topologia-de-processo-e-producao-real-do-escritor-unico.md:70-110` (D1/D2) · `docs/specs/PRD-004-captura-em-producao.md` (383 linhas, íntegro — irmã, padrão reusado) · `docs/medicao-coinalyze.md:35-60,190-200` (janelas de retenção por resolução) · `backend/src/modules/sentimento/infra/coinalyze_one_shot_cli.py:1-40`, `availability_probe_cli.py:1-50`.
**Rev de ancoragem de TODA medição deste documento:** **`master@4605767`** (`git rev-parse --short HEAD`).
**Tracker:** `harness policy --key tracker` → `{"kind":"jira","project":"CST","board_id":"36","parent_kind":"Epic","child_kind":"Tarefa"}`. **Nada criado nesta sessão** — unidade de valor é ato posterior à validação do arquiteto; candidatas em §6.
**Ledger:** `INIT` antes. Ato deste documento: `harness pipeline advance coinalyze-fora-da-quarentena PRD_DRAFT` depois de gravado (§17).
**Glossário:** `harness policy --key glossary_doc` → saída vazia, `rc=0`; `grep -n glossary harness.toml` → `rc=1` ⇒ dívida `ADR-013/D4` continua. Termos usados definidos em §9.

---

## 0. Como ler este documento

1. **Isto não é uma feature de captura nova do zero — é o fechamento de um mecanismo que duas tasks já deixaram parcialmente construído e explicitamente pausado.** `T-06.6` (`done`, 2026-09-03) implementou a quarentena de três termos e o ramo NÃO-MEDIDO da regra de escrita, e **recusou de propósito** o ramo MEDIDO (`MeasuredLagCannotUseUnmeasuredPathError`), nomeando-o como fora do seu DoD. `T-03.6` (`done`, 2026-09-02) mediu lag da Coinalyze **uma vez**, 9m20s, `n=36`/`n=7`, e nomeou explicitamente que "próxima rodada em regime é trabalho de implantação, fora do escopo desta task". Este PRD é esse trabalho.
2. **O gatilho é a decisão do owner de hoje, literal**, e ela resolve o único bloqueio que restava: *"ta, podemos retirar da quarentena então"* (Coinalyze) e *"sobre a region, a vps roda em SP e local tbm será SP então n vejo pendencias aí"* `[PREMISSA-OWNER: 2026-09-08]`. Isto destrava `T-03.9` (`observer_region`), que estava `blocked` só por essa decisão (`tasks.toml:538-539`, `docs/decisoes-do-owner.md:258-265`).
3. **Quatro perguntas do despacho, quatro respostas com evidência, nesta ordem de dependência:** (1) mecanismo de promoção — hoje **não existe**, precisa ser construído; (2) fórmula MODELED do ramo medido — **especificada, zero linha de código**; (3) probe em regime — **mecanismo existe** (`T-03.6`), nunca rodou além de 9m20s; (4) coletor de produção contínuo para Coinalyze — **avaliado e a resposta é NÃO**, com `ADR-027/D1` já decidindo isso para o gênero de coletor a que a Coinalyze pertence (§1.4).
4. **Herda sem reabrir:** `ADR-027/D1` (coletores one-shot/diários nunca viram container de vida longa — `coinalyze_one_shot_cli` está nominalmente incluído nessa classe), `ADR-002` (motor de armazenamento), `SPEC-001 §5.2` (a fórmula, íntegra, citada em §7.2 deste PRD), `ADR-016` (Natureza — fórmula MODELED é `domain` puro).
5. **O owner respondeu duas perguntas nesta sessão** (quarentena, região). Não foi possível levar o menu completo (§14) a ele — as decisões de forma (onde persistir o lag summary, cadência do probe em regime, se um cron chama o probe ou se ele fica de pé) ficam nomeadas com dono e custo, não decididas aqui.

---

## 1. Contexto e problema

### 1.1 Os dois pedidos do owner, literais, hoje (2026-09-08)

> *"ta, podemos retirar da quarentena então"*
> `[PREMISSA-OWNER: 2026-09-08]`

> *"sobre a region, a vps roda em SP e local tbm será SP então n vejo pendencias aí"*
> `[PREMISSA-OWNER: 2026-09-08]`

**Leitura adotada** `[INFERRED I-1]`: a primeira frase autoriza abrir a via para a Coinalyze sair da quarentena — não é ordem para forçar a saída sem medir; o predicado de três termos (`SPEC-001 §5.2`) continua sendo a lei, e "retirar da quarentena" significa **construir o que falta para que o terceiro termo (`available_at`) deixe de ser `NULL` quando a medição justificar**, não editar o predicado. A segunda frase fecha `observer_region`: como VPS e execução local caem na **mesma região** (São Paulo), a coluna `observer_region` deixa de ser uma incógnita de infraestrutura — pode ser gravada com um valor conhecido e estável desde já, sem depender de acesso à VPS.

### 1.2 O que está medido — o estado do mecanismo hoje, em `4605767`

| # | fato | comando | resultado | rótulo |
|---|---|---|---|---|
| 1 | Quarentena por 3 termos, implementada e testada sobre catálogo real | `docs/context/plataforma-dados/gates/T-06.6-builder.md` | `D6.1`/`D6.2` verdes, 1300 testes passando à época; `D6.2` prova com a linha real de OI `CLOSE` da Coinalyze que 2 termos resolvidos + 1 ausente ainda isola | `[DOC]` |
| 2 | Ramo NÃO-MEDIDO da regra de escrita (`D6.3`) | `live_availability_write.py:42-66` | implementado — assinatura só devolve `(None, MODELED)`, nunca `int` | `[DOC]` |
| 3 | Ramo MEDIDO da regra de escrita (fórmula MODELED de `SPEC-001` §5.2) | `grep -n 'p99_lag\|native.*grid\|grade nativa' backend/src/modules/sentimento -r --include='*.py'` | **0 ocorrências fora de comentário/docstring** — nenhuma função calcula `bucket_end + p99_lag + margem` | `[MEDIDO 2026-09-08]` |
| 4 | Mecanismo de promoção (mudar `available_at` de `NULL` para um valor, num catálogo já escrito) | `grep -rln 'promo\|reclassif\|requarant' backend/src/modules/sentimento/domain backend/src/modules/sentimento/use_cases` | **0 arquivos** — nenhum módulo existe com esse propósito | `[MEDIDO 2026-09-08]` |
| 5 | Onde `available_at_present_by_key` vem hoje | `quarantine_terms.py:91-94` (docstring) | é **argumento do chamador**, "tipicamente resolvido da tabela de lag de disponibilidade" — **não há query real que produza esse mapa a partir de um store persistido**; a única vez que existiu foi em memória, dentro de uma rodada de `availability_probe_cli` de 9m20s, nunca gravada | `[DOC]` |
| 6 | Rodada de medição de lag da Coinalyze existente | `docs/context/plataforma-dados/gates/T-03.6-builder.md:100-114` | 1 rodada, 9m20s, `open_interest`: `lag_p99_ms=32764, lag_n=36`; `liquidation`: `lag_p99_ms=70249, lag_n=7` — nomeado no próprio gate como **não em regime**, `n` baixo | `[MEDIDO 2026-09-02, 1 rodada]` |
| 7 | `T-03.9` (`observer_region` real) | `tasks.toml:535-547` | `status = "blocked"`, motivo: `observer_region` da VPS `[NÃO MEDIDO]`, decisão do owner de deixar local-first | `[DOC]`, **destravado por §1.1 desta sessão** |
| 8 | Classe de coletor a que a Coinalyze pertence, por decisão já tomada | `ADR-027-topologia-de-processo-e-producao-real-do-escritor-unico.md:87-90` | *"Os coletores one-shot/diários (…`coinalyze_one_shot_cli`) e os utilitários de diagnóstico (…`*_probe_cli`…) NUNCA viram container de vida longa"* | `[DOC: ADR-027/D1]` |
| 9 | Janela de retenção da Coinalyze, por resolução — o motivo técnico por trás de (8) | `docs/medicao-coinalyze.md:39-54` | OI a `5min`: **~7,0 dias**; Liquidação a `1min`: **~8 dias**; ambos a `daily`: **2.409 dias / 730 dias** | `[MEDIDO 2026-08-25, medicao-coinalyze.md]` |
| 10 | `interval` que o coletor one-shot atual pede | `coinalyze_one_shot_cli.py` docstring + `coinalyze_daily_series.py:77-94` | **sempre `interval=daily`** — o coletor de produção existente já opera na janela longa (2.409/730 dias), não na janela curta que expira em dias | `[DOC]` |
| 11 | Regras bloqueantes em vigor | `harness rules list --severity block` | **8** | `[MEDIDO 2026-09-08]` |
| 12 | Tasks não-terminais da mãe que este PRD toca | `grep -n 'T-03.9' -A5 tasks.toml` | 1 (`T-03.9`); nenhuma outra task da mãe nomeia a fórmula MODELED ou a promoção — **são lacunas não cobertas por task nenhuma existente** | `[MEDIDO 2026-09-08]` |

### 1.3 O diagnóstico — três peças que faltam, nesta ordem de dependência

**(a) Medir em regime.** `T-03.6` provou o mecanismo (`availability_probe`) e mediu 1 rodada curta. "Em regime" significa: rodar por tempo suficiente para que `lag_n` pare de ser um dígito — hoje `n=36` (OI) e `n=7` (liquidação) são amostras de uma manhã, não uma distribuição estável de `p99`. O owner destravou `T-03.9` (`observer_region = "sa-east-1"` ou equivalente string fixa, já que VPS e local são a mesma região) — mas **`observer_region` sozinho não é "rodar em regime"**: são duas coisas que a resposta do owner resolve juntas (a coluna passa a ter um valor conhecido) mas que só a execução prolongada do probe realmente mede.

**(b) Persistir o resultado.** Hoje o `AvailabilityLagSample`/`LagSummaryRow` que `T-03.6` produz **vive só na memória do processo do CLI, uma rodada, um `stdout`**. Não há store. Sem persistência, "rodar em regime" produz um `stdout` mais longo, não um fato que `quarantine_terms.readable_by_backtest` possa ler amanhã. Este é o `[GAP]` que conecta (a) a (c).

**(c) Escrever a fórmula MODELED e usá-la para promover.** Com `lag_summary.lag_n > 0` persistido e legível, dois pedaços de código que hoje não existem entram: a função que calcula `available_at_MODELED = próximo ponto da grade nativa >= bucket_end + p99_lag(endpoint, observer_region) + margem` (o ramo que `live_availability_write.py` recusa hoje, de propósito), e o adaptador que lê o lag summary persistido e monta `available_at_present_by_key` para `quarantine_terms.readable_by_backtest` — hoje esse mapa é sempre construído à mão em teste, nunca por um caminho de produção.

**Ordem:** (a) roda **depois** de `T-03.9` resolvida (§1.1) → (b) precisa existir **antes** de (a) rodar por muito tempo (perder uma rodada longa sem gravar é o mesmo desperdício que motivou nomear isto como capture-or-lose em `Q19`) → (c) consome (b). O probe em regime **não pode começar sem a persistência** — rodar horas para jogar fora ao fechar o terminal repete o defeito que `Q19` já nomeou.

### 1.4 Resposta à pergunta 4 do despacho — coletor de produção contínuo para Coinalyze

**Não.** Três fatos convergem:

1. `ADR-027/D1`, já aprovada pelo owner (2026-09-04), **já classificou** `coinalyze_one_shot_cli` na categoria "one-shot/diário… nunca vira container de vida longa" — ao lado de `daily_instrument_universe_snapshot_cli`. Reabrir essa classificação exigiria reabrir `ADR-027`, não é decisão desta feature.
2. A razão de mecanismo é mensurável: a Coinalyze só tem dado **capture-or-lose de curta janela** nas resoluções finas (OI `5min` ~7 dias, liquidação `1min` ~8 dias) — o resto (a resolução `daily`, que é o que o coletor de produção hoje já busca) é backfillável por até 2.409/730 dias. Um coletor que roda **dentro** dessa janela (diário, ou a cada 2-3 dias, via cron/systemd timer — o mesmo padrão que `ADR-027` já prescreve para este gênero) não perde nada; um processo de vida longa não compra nada a mais para dado em bucket, porque não há tick para perder entre buckets.
3. `captura-em-producao` (a irmã) já decidiu a topologia de processo de vida longa para o que **de fato** é capture-or-lose contínuo (`!forceOrder@arr`, `premiumIndex` — ambos Binance, ambos WebSocket/poll de alta cadência). A Coinalyze não está nessa lista (`PRD-004 NG-4` a exclui explicitamente: *"Backfill histórico (Coinalyze, OI history) como serviço… são one-shot"*).

O que **este PRD de fato entrega** para produção contínua não é um coletor novo — é (i) o **probe de disponibilidade** rodando por tempo suficiente (não 24/7 permanentemente, mas mais que 9 minutos) para produzir `p99`/`n` confiáveis, com persistência, e (ii) a decisão, **nomeada e não fechada aqui**, de se o `coinalyze_one_shot_cli` de captura de dado (distinto do probe de disponibilidade) precisa de agendamento formal (cron/systemd timer) para não deixar a janela curta expirar — hoje ele é invocado manualmente (`docs/decisoes-do-owner.md` não registra cadência de produção para ele). Ver `[Q4]`.

---

## 2. Objetivo

**Que a Coinalyze saia da quarentena pelo mecanismo correto — o terceiro termo do predicado (`available_at`) passa a ter valor real quando (e só quando) a defasagem tiver sido medida em regime — e que a leitura de `backtest` sobre uma série Coinalyze qualificada devolva linhas de verdade, não zero.** Em termos verificáveis:

1. O probe de disponibilidade (`T-03.6`) roda por um período **em regime** (não um one-shot de minutos) contra os endpoints Coinalyze declarados (`open_interest`, `liquidation`), com `observer_region` gravado como valor conhecido (São Paulo, `[Q1]` decide a string exata).
2. Cada amostra de lag é **persistida** — sobrevive ao fim do processo do probe.
3. A fórmula MODELED do ramo medido (`SPEC-001 §5.2`) está implementada, testada e é o único caminho que produz um `available_at` não-nulo a partir de um `LagSummaryRow` com `lag_n > 0`.
4. Existe um mecanismo — batch ou leitura sob demanda, decisão de arquitetura — que lê o lag summary persistido e monta `available_at_present_by_key`, alimentando `quarantine_terms.readable_by_backtest` sem intervenção manual.
5. **Falsificador de fase:** com os quatro itens acima no lugar, uma leitura real de `backtest` sobre a série Coinalyze de OI (a mesma que `D6.2` provou quarentenada) devolve **linhas não-vazias**, e o predicado de 3 termos continua reprovando qualquer outra série Coinalyze cujo endpoint não tenha sido medido.
6. Nenhuma mudança no envelope de `/collector-status` ou nas 15 colunas de `/ingest-health` (herdado, `ADR-030/D5`, `ADR-008/D3`).

---

## 3. Decisões já tomadas que este PRD NÃO reabre

| # | decisão | rótulo | onde | efeito aqui |
|---|---|---|---|---|
| D-a | Predicado de quarentena de 3 termos, e a regra "nunca `event_time`/`event_time+interval`" | `[DOC: SPEC-001 §5.2]` | `quarantine_terms.py`, `live_availability_write.py` | este PRD **implementa o ramo que falta**, não reabre o predicado nem a proibição |
| D-b | Coletores one-shot/diários nunca viram container de vida longa | `[DOC: ADR-027/D1]` | `ADR-027:87-90` | `coinalyze_one_shot_cli` e o probe de disponibilidade continuam invocação pontual (cron/timer), nunca serviço 24/7 |
| D-c | Símbolos do `availability_probe_set` — `BTCUSDT`/`ETHUSDT`/`LINKUSDT`/`SOLUSDT` | `[PREMISSA-OWNER: 2026-09-02]` | `decisoes-do-owner.md:230-233` | rodada em regime usa o **mesmo** conjunto; não expande universo |
| D-d | Endpoints Coinalyze no probe — `open_interest`, `liquidation`, a 30s, orçamento cego 40/min | `[DECISÃO-OWNER: 2026-09-02]` | `T-03.6-builder.md:26-28` | rodada em regime reusa `AvailabilityProbeSet`; não redesenha o probe |
| D-e | Motor de armazenamento (série de mercado, catálogo/registro) | `[DOC: ADR-002 D1/D4]` | `ADR-002` | o store novo de lag summary segue o mesmo motor decidido (`[Q2]` escolhe SQLite-provisório vs. Postgres, na mesma lógica de `ADR-014/D1e`) |
| D-f | Premissas de recurso — VPS compartilhada, só Postgres, R2 free tier | `[PREMISSA-OWNER: 2026-08-25]` | `.claude/agents/infra-architect.md:39-48` | qualquer persistência nova declara pegada; nada em disco sem teto |
| D-g | Região da VPS e da execução local são a mesma (São Paulo) | `[PREMISSA-OWNER: 2026-09-08]` | §1.1 deste PRD | `observer_region` grava um valor **conhecido**, não `unknown`; destrava `T-03.9` |
| D-h | `/collector-status`: rota, envelope, 4 fórmulas | `[DOC: ADR-030 D0-D5]` | `ADR-030` | intocado; a Coinalyze sair da quarentena muda **dado que `backtest` lê**, não o painel de coleta |
| D-i | Feature filha, ledger novo | `[PREMISSA-OWNER: 2026-09-07, aplicada aqui por analogia ao mesmo padrão da irmã]` | `relate` | fases próprias, tasks em `docs/context/coinalyze-fora-da-quarentena/` |

---

## 4. Escopo

### 4.1 As três peças de §1.3, e o que cada uma ganha

| peça | hoje | depois desta feature | fase |
|---|---|---|---|
| **(a) probe em regime** | mecanismo pronto (`T-03.6`), 1 rodada de 9m20s | roda por período declarado (`[Q1]` decide duração-alvo), `observer_region` = valor conhecido (não `unknown`) | F1 |
| **(b) persistência do lag** | `LagSummaryRow` só em memória/`stdout` | store novo (motor por `[Q2]`) que sobrevive ao fim do processo; schema mínimo: `(endpoint, observer_region, lag_p99_ms, lag_n, measured_at)` | F1 |
| **(c) fórmula MODELED + promoção** | `live_availability_write.py` recusa o ramo medido | função nova que implementa `SPEC-001 §5.2` (grade nativa, arredondamento para cima) + adaptador que monta `available_at_present_by_key` a partir do store de (b) | F2 |
| **cadência de produção do `coinalyze_one_shot_cli`** | invocação manual, sem agendamento declarado | decisão nomeada (`[Q4]`) — dentro da janela mais curta medida (~7 dias) se o owner quiser produção contínua da resolução fina; **não** implementado por padrão neste PRD sem essa decisão | F3 (condicional) |

### 4.2 O que este PRD assume da mãe — referência, não cópia

`T-03.9` (`CST-25`) passa de `blocked` para `todo`/`done` **dentro desta feature filha** (mesmo padrão de `PRD-004 §4.2`: a task da mãe é referenciada, a decisão de mover/fechar como `superseded` fica com o owner, `[M1]`). Nenhuma outra task da mãe nomeia a fórmula MODELED ou a promoção — são requisitos novos, não herdados.

---

## 5. User stories — com fronteira por fase

Ordem obrigatória **F1 → F2 → F3** (§1.3). Componente por story.

### F1 · Medir em regime e persistir — `sentimento` (+ `infra` para o store)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-1** | Como operador, o probe de disponibilidade roda contra `open_interest` e `liquidation` da Coinalyze por um período **em regime** (não minutos), com `observer_region` gravado como um valor conhecido de São Paulo. | reusa `AvailabilityProbeSet`/`run_availability_probe`; `observer_region` deixa de ser `UNKNOWN_OBSERVER_REGION`; duração é `[Q1]` | `CA-F1-1..2` |
| **US-2** | Como operador, o resultado do probe (`LagSummaryRow` por `endpoint`×`observer_region`) **sobrevive** ao fim do processo — uma segunda rodada acrescenta amostra, não substitui a primeira. | store novo, motor por `[Q2]`; teste de round-trip write→read | `CA-F1-3..4` |

### F2 · Fórmula MODELED e promoção — `sentimento`

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-3** | Como sistema, um endpoint com `lag_n > 0` persistido tem seu `available_at_MODELED` calculado pela fórmula de `SPEC-001 §5.2`: próximo ponto da grade nativa ≥ `bucket_end + p99_lag + margem`, **sempre arredondado para cima**. | função nova em `domain`, ao lado (não dentro) de `live_availability_write.py` — o módulo atual **documenta explicitamente** que só cobre o ramo não-medido; este é o outro ramo, mesmo contrato de tipo de retorno declarado como enforcement | `CA-F2-1..3` |
| **US-4** | Como sistema, `quarantine_terms.readable_by_backtest` recebe `available_at_present_by_key` **calculado do store persistido**, não montado à mão — existe um caminho de produção entre (b) de F1 e o predicado de quarentena. | adaptador/leitura em `infra`, chamada por um use case novo ou existente (`quant-architect` decide a forma exata) | `CA-F2-4` |
| **US-5** | Como operador, com `open_interest` da Coinalyze medido (`lag_n > 0`) e o predicado reavaliado, uma leitura de `backtest` sobre essa série devolve **linhas reais**, não zero — e uma série Coinalyze cujo endpoint nunca foi medido **continua** quarentenada. | falsificador de fase — mesma classe de `D6.2`, agora provando a **abertura**, não só o fechamento | `CA-E2E-1` |

### F3 · Cadência de produção — `sentimento`/`infra` (condicional a `[Q4]`)

| id | story | fronteira | aceite |
|---|---|---|---|
| **US-6** | Como owner, decido se o `coinalyze_one_shot_cli` (captura de dado, distinto do probe de disponibilidade) precisa de agendamento formal para não deixar a janela curta (~7-8 dias) das resoluções finas expirar. | menu `[Q4]`/`M2`; **não implementado sem decisão** | condicional |

---

## 6. Unidades de valor candidatas (para o tracker, DEPOIS da validação do arquiteto)

| UV | título | fases | componente | Epic pai |
|---|---|---|---|---|
| UV-1 | Probe de disponibilidade Coinalyze roda em regime, com `observer_region` conhecido, e persiste o resultado | F1 | `sentimento`, `infra` | `[INFERRED I-2]` mesmo Epic pai que `T-03.6`/`T-03.9` usam hoje (`CST-25` é a task; Epic ainda não confirmado — `/tech-lead` decide) |
| UV-2 | Fórmula MODELED implementada; predicado de quarentena promove a Coinalyze quando medida | F2 | `sentimento` | idem |
| UV-3 | Cadência de produção do coletor Coinalyze decidida e, se aplicável, agendada | F3 | `sentimento`, `infra` | idem — **condicional a `[Q4]`** |

**Nada disto foi criado.** Ato posterior ao `approve prd` do `/architect`.

---

## 7. Requisitos

### 7.1 Funcionais

| id | requisito | story |
|---|---|---|
| RF-1 | O probe roda contra `open_interest` e `liquidation` da Coinalyze com `observer_region` ≠ `UNKNOWN_OBSERVER_REGION` | US-1 |
| RF-2 | Duração do probe é declarada e registrada junto com o resultado (não é um número solto no commit) | US-1 |
| RF-3 | `LagSummaryRow` (ou equivalente) é gravado num store que sobrevive ao fim do processo; uma segunda execução **acrescenta**, nunca sobrescreve, amostra anterior do mesmo `(endpoint, observer_region)` sem declarar a regra de acumulação | US-2 |
| RF-4 | Existe uma função pura que implementa `available_at_MODELED = próximo ponto da grade nativa >= bucket_end + p99_lag + margem`, arredondamento sempre para cima | US-3 |
| RF-5 | A função de RF-4 só é chamada quando `lag_summary.lag_n > 0` — o caso `lag_n == 0`/`None` continua no ramo de `live_availability_write.py`, intocado | US-3 |
| RF-6 | Existe um caminho de produção (não só teste) que lê o store de RF-3 e produz `available_at_present_by_key` para `quarantine_terms.readable_by_backtest` | US-4 |
| RF-7 | Uma leitura real de `backtest` sobre `open_interest` Coinalyze (com `lag_n > 0`) devolve linhas não-vazias | US-5 |
| RF-8 | Uma série Coinalyze cujo endpoint nunca foi medido (`lag_summary is None`) continua devolvendo zero linhas em `backtest` | US-5 |

### 7.2 A fórmula, citada íntegra (não parafraseada) — `SPEC-001 §5.2`

```
available_at_MODELED = próximo ponto da grade nativa
                       >= ( bucket_end + p99_lag(endpoint, observer_region) + margem )
```

*"Arredondamento sempre PARA CIMA ⇒ o erro é sempre pessimista: a plataforma diz que soube mais tarde do que soube, nunca mais cedo."* `[DOC: SPEC-001:405-409]` — `margem` é `TBD`, dono `/architect` (`[Q3]`).

### 7.3 Não-funcionais

| id | requisito | rótulo / medição |
|---|---|---|
| RNF-1 | Persistência do lag summary não cresce sem teto — é uma tabela por `(endpoint, observer_region)`, atualizada, não uma linha por amostra bruta acumulada para sempre (decisão de acumulação é `[Q2]`) | `[INFERRED: mesma doutrina de D-f/RN-5 de PRD-004]` |
| RNF-2 | O probe em regime não compete com o orçamento Binance (`120/min` já em uso por `T-03.6`) nem excede o orçamento cego Coinalyze (`40/min`) — mesmos números já validados por `AvailabilityProbeSet.__post_init__` | `[DOC: T-03.6-builder.md:24-30]` |
| RNF-3 | `observer_region` é uma **string fixa e nomeada**, não inferida por IP em runtime — decisão do owner já fecha o valor (São Paulo); `[Q1]` só decide a grafia exata (`sa-east-1`, `são-paulo`, etc.) | `[PREMISSA-OWNER: 2026-09-08]` |

---

## 8. Regras de negócio

| id | regra | falsificador |
|---|---|---|
| **RN-1** | **Nunca `event_time`/`event_time+interval` como `available_at`** — nem no ramo não-medido (já garantido) nem no novo ramo medido | teste que planta um valor igual a `event_time` ou `event_time+interval` no retorno da fórmula MODELED ⇒ reprova |
| **RN-2** | **A fórmula MODELED só promove quando `lag_n > 0` persistido e legível** — nunca com base numa amostra em memória de uma rodada que não terminou de gravar | `CA-E2E-1` reprova se `available_at` mudar sem uma leitura do store |
| **RN-3** | **Arredondamento sempre para cima**, nunca média/mediana | mutante que troca `>=` por média ⇒ falsificador de `CA-F2-*` reprova, mesma classe do `21,96%` medido em `SPEC-001:409` |
| **RN-4** | **A quarentena de uma série cujo endpoint nunca foi medido não muda** — abrir uma série não pode abrir as outras por engano | falsificador de fase (US-5, segunda metade) |
| **RN-5** | **Coletor de dado Coinalyze (`coinalyze_one_shot_cli`) não vira container de vida longa** salvo decisão nova do owner via `[Q4]`/`M2` | `docker compose ps` (se F3 acontecer) mostrando `coinalyze` como serviço permanente sem essa decisão ⇒ reprova `ADR-027/D1` |
| **RN-6** | Mensagem de exceção, evento de log e identificador novos em inglês (`CLAUDE.md`); vocabulário `sentimento` fica | `/review` |

---

## 9. Tipos e contratos críticos

| contrato | estado | dono | prazo |
|---|---|---|---|
| Schema do store de lag summary persistido (colunas, motor) | **`TBD`** | `/architect` (`[Q2]`) | F1 |
| Valor exato de `observer_region` (string) | **`TBD`** — owner já decidiu a região, falta a grafia | `/architect` (`[Q1]`) | F1 |
| Duração-alvo do probe em regime | **`TBD`** | `quant-architect` (`[Q1]`) | F1 |
| `margem` da fórmula MODELED | **`TBD`** | `/architect` (`[Q3]`) | F2 |
| Assinatura da função MODELED (nome, módulo — ao lado ou não de `live_availability_write.py`) | **`TBD`** | `quant-architect` | F2 |
| Cadência de produção do `coinalyze_one_shot_cli` | **`TBD` — condicional** | owner (`[Q4]`/`M2`) | F3 |

**Termos (na ausência de glossário):** *em regime* — execução do probe por período suficiente para `lag_n` deixar de ser um dígito de amostra única, em oposição à rodada de prova de 9m20s de `T-03.6`; *promoção* — o predicado de quarentena reavaliar uma série de `NULL` para um valor de `available_at`, sem editar o catálogo diretamente (é o **mapa** `available_at_present_by_key` que muda, não os campos do `SeriesKey`); *coletor de produção* — o processo que captura a série de mercado em si (`coinalyze_one_shot_cli`), distinto do *probe de disponibilidade* (`availability_probe_cli`), que só mede defasagem.

---

## 10. Critérios de aceite — testáveis, com o comando e a coluna "morde"

### F1

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F1-1 | `observer_region` gravado como valor conhecido | `grep -n 'observer_region' <saída do probe em regime>` → valor ≠ `unknown`/`UNKNOWN_OBSERVER_REGION` | rodar sem a variável/constante nova ⇒ ainda grava `unknown` — reprova |
| CA-F1-2 | Probe roda por duração declarada | comando + `stdout`/log com `started_at`/`ended_at`, duração ≥ o valor fixado em `[Q1]` | rodada mais curta que o declarado ⇒ não conta como "em regime" |
| CA-F1-3 | Lag summary sobrevive ao fim do processo | rodar probe, matar processo, reabrir store, ler `(endpoint, observer_region)` → linha presente | sem persistência ⇒ leitura pós-restart vazia (estado de hoje) |
| CA-F1-4 | Segunda rodada acrescenta, não apaga | rodar 2×, ler store → `lag_n` da 2ª leitura ≥ `lag_n` da 1ª (nunca reseta a 0) | sobrescrita ⇒ `lag_n` da 2ª = só a 2ª amostra — reprova |

### F2

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-F2-1 | Fórmula MODELED implementada e testada | `pytest tests/sentimento -k 'modeled_available_at or measured_branch' -q` → passa | mutante que troca `>=` por `>` ou remove o arredondamento para cima ⇒ reprova |
| CA-F2-2 | Fórmula nunca devolve `event_time`/`event_time+interval` | teste parametrizado (mesma forma de `test_the_output_is_never_event_time_nor_event_time_plus_interval`, agora sobre o ramo medido) | valor igual a qualquer um dos dois ⇒ reprova |
| CA-F2-3 | `lag_n == 0`/`None` continua no ramo antigo | `MeasuredLagCannotUseUnmeasuredPathError` continua disparando para `lag_n > 0` chamado no módulo antigo | regressão que deixa o módulo antigo aceitar `lag_n > 0` sem erro ⇒ reprova |
| CA-F2-4 | `available_at_present_by_key` de produção, não só de teste | `grep -rn 'available_at_present_by_key' backend/src/modules/sentimento/infra` → **≥ 1** (hoje **0**, só existe em teste) | ausência ⇒ reprova — mapa continua só manual |

### Ponta a ponta

| id | critério | comando (cala) | **morde** |
|---|---|---|---|
| CA-E2E-1 | `backtest` lê `open_interest` Coinalyze real, não-vazio, depois que `lag_n > 0` está persistido | leitura real de `backtest` sobre a chave já usada em `D6.2` (`open_interest_catalog_entries().entry_for(coinalyze_open_interest_key(Reduction.CLOSE))`) → linhas **> 0** (hoje: 0, provado por `D6.2`) | sem o store/fórmula ⇒ continua 0 — regressão de `D6.2` sobre a MESMA chave, agora esperando o resultado oposto |
| CA-E2E-2 | Série Coinalyze nunca medida continua quarentenada | mesma leitura sobre um endpoint Coinalyze **sem** amostra no store → 0 linhas | qualquer valor > 0 ⇒ `RN-4` violado |
| CA-E2E-3 | Nenhum contrato de leitura mudou | `git diff --stat <base>..HEAD -- backend/src/api/routes backend/src/modules/sentimento/domain/collector_status.py frontend/src` → vazio | qualquer linha ⇒ fora de escopo |

---

## 11. Non-goals — fora, com o motivo

| id | fora | motivo |
|---|---|---|
| **NG-1** | Coletor de dado Coinalyze como processo de vida longa/container permanente | `ADR-027/D1`; §1.4 mede o motivo técnico (janela curta é de dias, não de segundos) |
| **NG-2** | Expandir o `availability_probe_set` para além dos 4 símbolos e 2 endpoints (`open_interest`, `liquidation`) já declarados | `D-c`/`D-d`; expandir universo é decisão nova do owner, não desta feature |
| **NG-3** | Mudar o predicado de quarentena de 3 termos, ou os outros dois termos (`label_shift`, `unit`) — já resolvidos para a Coinalyze | `SPEC-001 §5.2`; esta feature só ataca o terceiro termo |
| **NG-4** | Mudar `/collector-status` ou `/ingest-health` (envelope, fórmulas, 15 colunas) | `ADR-030/D5`, `ADR-008/D3` |
| **NG-5** | Implantar qualquer coisa na VPS | herda `ADR-029/D1`; fora de escopo salvo owner dizer o contrário |
| **NG-6** | Backfill histórico de Coinalyze como serviço agendado, decidido nesta feature sem `[Q4]` | condicional — F3 só acontece se o owner responder `[Q4]` |
| **NG-7** | Qualquer mudança em `web`/`charts`/`convergencia` | o efeito é indireto (mais dado passa a ser lido por `backtest`); nenhum código dessas camadas muda |

---

## 12. `[INFERRED]` — com motivo e custo de reversão

| # | inferência | motivo | custo se errada |
|---|---|---|---|
| I-1 | *"podemos retirar da quarentena"* = construir o mecanismo de promoção, não editar o predicado à força | o próprio predicado é o falsificador central da fase `06` (`D6.2`); forçar a abertura sem medir contradiria o que o owner mesmo aprovou em `SPEC-001` | se o owner quis uma saída manual/administrativa: escopo encolhe para uma flag operacional, sem fórmula nem probe em regime — mas isso reabriria `D6.2` |
| I-2 | Epic pai das UVs segue o mesmo de `T-03.9`/`T-03.6` | não há Epic próprio nomeado para esta filha ainda; `/tech-lead` decide | 0 custo — Epic é ato de tracker, não de arquitetura |

---

## 13. GAPs nomeados por esta rodada

| gap | severidade | dono | ação |
|---|---|---|---|
| `[GAP G1]` Nenhum store persiste `LagSummaryRow` hoje — todo resultado de probe já rodado (`T-03.6`) morreu com o processo | **alta** — bloqueia F1 inteira | `/architect` (`[Q2]`) | US-2, RF-3 |
| `[GAP G2]` Fórmula MODELED especificada em prosa (`SPEC-001 §5.2`) há dias, zero linha de código | **alta** — é o corpo da feature | `quant-architect` | US-3, RF-4 |
| `[GAP G3]` Nenhuma task da mãe nomeia a promoção ou a fórmula MODELED — não há DoD herdado para reusar | média — `/tech-lead` escreve DoD do zero | `/tech-lead` | tasks novas |
| `[GAP G4]` Cadência de produção do `coinalyze_one_shot_cli` nunca foi decidida (nem antes desta feature) | média, condicional | owner | `[Q4]` |
| `[GAP G5]` `margem` da fórmula MODELED não tem valor proposto em nenhum documento lido | média | `/architect` | `[Q3]` |

---

## 14. Menu para o owner — escolhas com o custo de cada opção

Nenhum item bloqueia `PRD_DRAFT`. `M1` pode esperar até o `/tech-lead`; `M2` só importa se `[Q4]` vier "sim".

| # | pergunta | opção | custo | proposta `[INFERRED]` |
|---|---|---|---|---|
| **M1** | Destino de `T-03.9` (`CST-25`) na mãe | **(a)** mover a task para esta feature filha, mantendo o id/tracker | 0 custo de código; a task já está `blocked` só por isto | **(a)** |
| | | (b) fechar na mãe como `superseded`, task nova nesta feature | duplica trabalho de tracker sem ganho | |
| **M2** | Coletor de dado Coinalyze ganha cron/systemd timer nesta feature (F3)? | **(a)** sim — agendar dentro da janela curta (~7 dias), evita perder resolução fina | +1 unidade de infra pequena; only-if `[Q4]`="sim" | `[NÃO SEI]` — depende de `[Q4]` |
| | | (b) não — continua manual, só a resolução `daily` (longa janela) é garantida | 0 custo agora; resolução fina (`5min`/`1min`) pode ficar sem cobertura contínua | |

---

## 15. Perguntas em Aberto — classificadas, com quem decide

| id | pergunta | bloqueia? | decide |
|---|---|---|---|
| **[Q1]** | Valor exato de `observer_region` (grafia da string) e duração-alvo do probe em regime | **F1** | `/architect` + `quant-architect` |
| **[Q2]** | Motor de persistência do lag summary — SQLite provisório (mesmo padrão de `ADR-014/D1e`) ou já Postgres | **F1** | `/architect` |
| **[Q3]** | Valor/fórmula de `margem` na conta `bucket_end + p99_lag + margem` | **F2** | `/architect` |
| **[Q4]** | ~~O `coinalyze_one_shot_cli` precisa de agendamento formal (cron/systemd timer) para não perder a janela curta (~7-8 dias) das resoluções finas?~~ **RESPONDIDA 2026-09-08.** | não bloqueia F1/F2; decidia se F3 existe | **owner** |
| **[Q5]** | O adaptador de US-4 (leitura do store → `available_at_present_by_key`) é chamado sob demanda (toda leitura de `backtest`) ou por um job periódico que atualiza um cache? | F2 | `quant-architect` |

---

## 16. Registro da varredura de discovery

| dimensão | estado | fonte / gap |
|---|---|---|
| stakeholders e consumidores | `[COBERTO]` operador único (owner); consumidor: leitura de `backtest` sobre séries Coinalyze | §2, `D-h` |
| volumetria e escala | `[COBERTO]` orçamento de probe já validado (`120/min` Binance + `16/min` Coinalyze, `T-03.6`); `[GAP]` duração-alvo do regime não fixada | `[Q1]` |
| requisitos não-funcionais (frescor, latência) | `[COBERTO]` `RNF-2` reusa orçamentos medidos; `[GAP]` teto de crescimento do store novo | `[Q2]`, `RNF-1` |
| estados e casos de borda | `[COBERTO]` endpoint nunca medido (`RN-4`, `CA-E2E-2`), segunda rodada de probe (`CA-F1-4`), processo morto no meio do probe (herdado de `T-03.6`) | §10 |
| contrato e dependências | `[COBERTO]` fórmula citada íntegra (§7.2); `[GAP]` schema do store, `margem`, nome/módulo da função | §9 |
| métricas e observabilidade | `[GAP]` nenhum instrumento hoje reporta "quantas séries Coinalyze estão quarentenadas vs. promovidas" — não pedido pelo despacho, nomeado aqui para o `/architect` avaliar | não é `[Q]` — é achado, sem dono forçado |
| escopo e non-goals | `[COBERTO]` §11, 7 itens; coletor de produção contínuo avaliado e recusado com evidência (§1.4) | — |

**O que foi perguntado ao owner nesta sessão:** as duas frases de §1.1 (quarentena, região) — ambas já respondidas e citadas. Nada mais foi levado a ele; o restante está em §14/§15.

---

## 17. Gate de handoff — a checklist, conferida

- [x] cada story tem fronteira clara e cabe numa fase — **6 stories em 3 fases** (§5), F3 explicitamente condicional
- [x] as regras bloqueantes em vigor são **endereçáveis** — `harness rules list --severity block` → **8** `[MEDIDO 2026-09-08]`: mesmas 8 de `PRD-004`; código novo (função MODELED, adaptador, store) usa logger nomeado, import absoluto, sem segredo literal — nenhuma delas cai por vacuidade aqui (há código Python novo, ao contrário de partes de `PRD-004`)
- [x] tipos e contratos críticos definidos, ou `TBD` com dono e data — §9 (**6 `TBD`**, donos nomeados, prazo por fase)
- [x] non-goals escritos — §11, **7 itens**

**Gaps classificados:** bloqueante → **nenhum** para `PRD_DRAFT`; não-bloqueante → `[Q1]`–`[Q5]`, `G1`–`G5`; inferível → `I-1`–`I-2`.

**Ledger:** `harness pipeline advance coinalyze-fora-da-quarentena PRD_DRAFT` — executado após gravar este arquivo; registrado em `docs/INDEX.md`.

**Próximo passo:** `/architect` sobre [`handoff_to_architect.md`](../context/coinalyze-fora-da-quarentena/handoff_to_architect.md) — Gap Analysis; decidir `[Q1]`-`[Q3]` (região/duração, motor de persistência, margem), escolher `M1`/`M2` com o owner quando possível; SPEC + plano em fases F1 → F2 → (F3 condicional).

---

## 18. Decisão do owner — `[Q4]`/`M2`/F3 postergados (2026-09-08)

O owner pediu, à parte deste PRD, uma confirmação SMC×CVD×OI "quase em tempo real" — o que reabriu
a pergunta de fundo por trás de `[Q4]`: não "o CLI diário precisa de cron", mas "existe uma
necessidade real de OI intradiário agora". `quant-architect` investigou (dispatch registrado em
`docs/INDEX.md`, relatório completo em
[`context/coinalyze-fora-da-quarentena/gates/oi-source-v0-necessidade-quant-architect.md`](../context/coinalyze-fora-da-quarentena/gates/oi-source-v0-necessidade-quant-architect.md))
e o achado central é que **`convergencia` (o único consumidor possível de um poller intradiário de
OI) ainda não existe no código** — `[MEDIDO 2026-09-08]`: `find backend/src/modules -maxdepth 1
-type d` não lista esse componente. Sem consumidor, F3 não tem para quem entregar hoje.

**Decisão, literal:** *"podemos comitar os aprendizados e aprovar prd e spec e seguir com f3
postergada"* `[PREMISSA-OWNER: 2026-09-08]`.

- `[Q4]` fecha como **postergada**, não "sim"/"não" — a pergunta original (agendamento formal do
  CLI diário) fica subsumida: sem F3, o `coinalyze_one_shot_cli` segue exatamente como `ADR-027/D1`
  já classifica (one-shot/cron, invocação manual aceitável dentro da janela medida em
  `docs/medicao-coinalyze.md`).
- `M2` fecha como **(b)** — nenhum cron/systemd timer novo nesta feature.
- **F3 sai do escopo de entrega desta feature.** `PRD_DRAFT`/`SPEC_DRAFT` avançam só com F1+F2
  (§5); a US-6/UV-3 condicionais a `[Q4]` (§5, §6) não são materializadas em task pelo `/tech-lead`
  nesta rodada.
- **Gatilho de reabertura** (mesmo padrão do gatilho endereçado em `CLAUDE.md` §linha 11): quando a
  SPEC do componente `convergencia` definir o contrato de entrada de OI (granularidade, alinhamento
  temporal com candle fechado), F3 volta à mesa — aí sim como decisão de FONTE (Coinalyze agregado
  vs. `openInterestHist` da Binance), não mais como decisão de cadência de um CLI diário.
- Achado colateral do mesmo gate, registrado para não se perder: a premissa de que "Coinalyze agrega
  OI nativamente entre exchanges" é **falsa** — cada mercado exige um campo `exchange` obrigatório
  (28 exchanges, 5.127 mercados, `docs/medicao-coinalyze.md`); o "Aggregated OI" que a interface do
  Coinalyze mostra é visualização do próprio site somando várias chamadas, não um símbolo agregado
  nativo da API. Relevante para quando F3 reabrir: agregar via Coinalyze custaria o mesmo N-chamadas
  + merge que agregar direto das APIs nativas de cada exchange — o valor do Coinalyze é schema
  uniforme sob uma API key, não agregação de graça.
