# `candle-real-e-eixo-unico` — narrativa de review da quebra em tasks

> **Aguardando aprovação humana.** Nenhum card foi criado no Jira — e isso é **decisão
> declarada**, não esquecimento (§6). `approve tasks` é gate do **owner**.
>
> **SPEC:** [`SPEC-008`](../../specs/SPEC-008-candle-real-e-eixo-unico.md) · **PRD:** `PRD-008` ·
> **ADR:** [`ADR-040`](../../adr/ADR-040-reagregacao-na-rota-supported-interval-vira-conjunto-e-a-funcao-e-de-nature-e-reduction.md)
> **Plano:** [`docs/plans/SPEC-008-candle-real-e-eixo-unico/`](../../plans/SPEC-008-candle-real-e-eixo-unico/) — `index` + 5 fases
> **Estado do ledger:** `harness pipeline state candle-real-e-eixo-unico` → **`SPEC_APPROVED`** `[MEDIDO 2026-09-19]`
> **Dado de máquina:** [`tasks.toml`](tasks.toml) — este arquivo **não** é lido por máquina e
> aquele **não** argumenta. Não se sobrepõem.

---

## 0. Veredito em uma linha

**48 tasks**, cinco fases, **nenhuma unidade de valor criada** e **nenhuma linha de código escrita**.
A quebra é 1:1 com os itens numerados do plano, mais as tasks que o plano **exige e não numerou**
(os DoD que são trabalho próprio: falsificadores, ablações, tetos de latência, vereditos de design).
A trilha item→task está em §1 e a contagem em §2.

---

## 1. Trilha item do plano → task, fase a fase

### Fase `01` — a vela real (11 itens do plano → 11 tasks)

| item | task | por que assim |
|---|---|---|
| 1.1 + 1.2 | `T-01.1` | **fusão.** Criar a identidade das 4 séries e passar o `metric` por `FORBIDDEN_METRIC_NAMES` é a **mesma edição** e o **mesmo teste**; separar produziria uma task cujo DoD é "não fiz nada errado na task irmã". O nome entra no `verified_by`, que entra no `sha256` da identidade — renomear depois é migração, não refactor |
| 1.3 | `T-01.2` | os 4 acessores nomeados `[1..4]` em `binance_klines_client.py` |
| 1.4 | `T-01.3` | o laço de 2 → 6 tuplas, proveniência escrita **uma vez**, `series_key_id()` **uma vez por página** |
| 1.5 + DoD 10 | `T-01.4` | **fusão.** `is_closed_bucket` e "o bucket é o que TERMINA em `ceil(t/B)*B`" são a **mesma asserção de identidade de bucket** vista de dois lados. O Δ medido é **0,114 pp** — pequeno demais para um teste de magnitude pegar ⇒ o assert é de **igualdade de bucket** |
| 1.6 + DoD 6 | `T-01.5` | backfill one-shot/cron até 90 dias **carrega** a medição de `pg_total_relation_size` antes/depois: é a mesma execução que produz o número. Previsão a bater: **≈ 2,07 M linhas** |
| 1.7 | `T-01.6` | as 4 entradas **servidas** por `/api/v1/series-catalog` |
| DoD 9 | `T-01.7` | **task própria, e é a mais importante da fase.** `[M-9]`: o irmão no mesmo coletor subestima a origem em **−2,450% / −4,474% / −2,212% / −2,227%**, `pos=0` em 4/4, `n=960`. Viés unilateral é assinatura de snapshot intrabarra, não ruído. Não conserta a causa (é de `/architect`/`ADR-034`) — **impede a propagação silenciosa para o preço** |
| 1.8 | `T-01.8` | o painel monta a vela; ausência vira `WhitespaceItem`, nunca vela de altura zero |
| 1.9 | `T-01.9` | ⛔ a degenerada **sai no mesmo commit** — `RN-2`, sem bandeira e sem convivência |
| 1.10 | `T-01.10` | veredito do `ux-ui-mastery` — a autonomia de design é **condicionada ao gate** |
| 1.11 + DoD 3/4 | `T-01.11` | e2e Playwright contra o app real **+ ablação de `P1`**. `DoD-3` sem `DoD-4` é verde falso |

### Fase `02` — o eixo único (8 itens úteis → 8 tasks)

| item | task | por que assim |
|---|---|---|
| **2.0** | `T-02.1` | ⛔ **primeira da fase, e a ordem é o achado.** As grades já divergem hoje (`price_slots:5760` × `oi_slots:1152`); ligar a assinatura antes sincroniza painéis **mostrando instantes diferentes**. CALA = 0 min, MORDE = **5.460 min (91 h)** *com a guarda ligada* |
| 2.1 (`charts`) | `T-02.2` | `TimeAxisController` **puro** — sem `IChartApi`, sem `fetch` (`ADR-003/FR-1+FR-2`) |
| 2.2 + 2.2b | `T-02.3` | **fusão.** A guarda de reentrância **não é** o mecanismo de proteção (a malha ingênua não estoura: 6 notificações, 30 escritas, profundidade 1); o que protege é o **estado em instantes**. Juntá-las é o que impede a próxima leitura de acreditar na guarda |
| 2.1 (`web`) + 2.3 | `T-02.4` | `web` assina/despacha/aplica, e `fitContent()` deixa de ser por gráfico — é o **mesmo** deslocamento de dono do enquadramento |
| 2.4 | `T-02.5` | rota `/symbol/[symbol]`, segmento em inglês (linha 12 do `CLAUDE.md`); o nome exato é `[M-7]` |
| DoD 2/3/4 + `CA-5b` | `T-02.6` | Playwright: pan move os cinco, **ablação de `P2`**, e sem realimentação |
| 2.6 / DoD 7 | `T-02.7` | **teto de 16 ms, `p95` sobre `n ≥ 60` quadros.** ⚠️ **Média é proibida como critério** — 200 ms em 60 quadros de 10 ms some na média (13,2 ms, "passa") e é exatamente o que o owner percebe |
| 2.7 | `T-02.8` | veredito do `ux-ui-mastery` sobre pan/zoom |

**Item 2.5 não virou task**: o plano de migração de `/painel` está declarado **fora** (task dedicada,
`CLAUDE.md` linha 12). Ausência por decisão, registrada em §4.

### Fase `03` — o timeframe único (8 itens + 4 DoD próprios → 12 tasks)

| item | task | por que assim |
|---|---|---|
| 3.1 | `T-03.1` | `reduce(nature, reduction)` pura, domínio dos **8 pares**, **nunca** tabela por `metric` |
| 3.2 + DoD 4 | `T-03.2` | **fusão.** "falha alto em par não coberto" e "teste de totalidade sobre os 8 pares" são a mesma garantia: ⛔ **um 9º par quebra o build** |
| 3.3 + DoD 5 | `T-03.3` | `SUPPORTED_INTERVAL` vira `{1m,5m,15m,1h,4h}`; **tudo fora continua `422`** (`n=3`: `1d`, `3m`, `30s`). A cláusula de `ADR-034/D6` é **estendida, não diluída** |
| 3.4 | `T-03.4` | **`P-B`** — servir sempre, `{present, expected}` como **par de inteiros, nunca bool, nunca percentual**. Recusar foi derrubado com número: `sum_liquidation` tem **0,0% de buckets completos em TODO TF** ⇒ qualquer limiar apaga o painel inteiro |
| 3.5 | `T-03.5` | `(RATIO, POINT)` = `last` sob **allowlist de 1 elemento** — não por `nature`: `SeriesKey` tem **um** membro `RATIO` para **dois** comportamentos, e razão de fluxo somada infla **3,3×** |
| 3.5b | `T-03.6` | `coverage {earliest_bucket_ms, latest_bucket_ms, source_floor_ms}` — **sem isto a fase `05` é irrealizável por construção** |
| DoD 1 | `T-03.7` | **task própria e grande: `CA-8′`, quatro camadas.** O `CA-8` do `PRD-008` foi retirado porque **morde 1 de 20 trocas** e passa verde sobre a vela degenerada. Fixture colhida da **Binance**, não do nosso banco (`[P-seed]` respeitado: leitura de origem ≠ semeadura), **auto-verificável pelo owner** no gráfico |
| DoD 2/3 | `T-03.8` | testes diferenciais: `STOCK` **não** soma (senão **12×** o OI real), `FLOW` soma |
| 3.6 | `T-03.9` | a barra lê o conjunto **servido pelo backend** — senão o front oferece TF que a rota recusa e o `422` vira defeito de tela |
| 3.7 | `T-03.10` | `log10` do volume sob TF variável (`[Q8]`/`[M-6]`) |
| DoD 6/7/8 | `T-03.11` | Playwright: TF move **os seis**, ablação de `P3`, e a escada de `GA-2` some **ou é declarada** |
| 3.8 | `T-03.12` | veredito do `ux-ui-mastery` sobre a barra de TF |

### Fase `04` — o OI honesto (5 itens → 6 tasks)

| item | task | por que assim |
|---|---|---|
| 4.1 | `T-04.1` | o rótulo soletra **grandeza · universo · coorte**, lidos do `SeriesKey` — nunca escritos à mão |
| 4.2 + DoD 5 | `T-04.2` | o envelope `C-4`, e a unidade **permanece contratos (BTC)**. Carrega o assert de que **`ADR-036/D2` está intocada**: qualquer entrada nova de catálogo seria `F5`, que está fora **por decisão** |
| 4.3 | `T-04.3` | ⛔ a chave de máquina deixa de nascer da microcopy — hoje a página publica `data-fact="live_preço:attempted"`, **com acento** |
| 4.4 | `T-04.4` | os demais painéis herdam: o defeito é **da fábrica de chave**, não do painel de preço |
| DoD 2/3/4 | `T-04.5` | **cisão deliberada**: ablação de derivação (`CA-10`) + zero chave não-ASCII + assert de **posição**. ⚠️ O comando mede a **chave**, não a microcopy — reprovar acento na microcopy reprovaria um `/symbol` correto (linha 8 do `CLAUDE.md`) |
| 4.5 | `T-04.6` | veredito do `ux-ui-mastery` sobre o rótulo de proveniência |

### Fase `05` — história sob demanda (7 itens + 4 próprios → 11 tasks)

| item | task | por que assim |
|---|---|---|
| 5.1 | `T-05.1` | ⛔ borda por **aritmética sobre a grade, nunca `barsInLogicalRange`** — com whitespace à frente ele devolve `barsBefore = −4.608`, detector **permanentemente disparado = laço infinito** |
| 5.1b | `T-05.2` | paginação **serial**, teto ~**5.000 slots**: a biblioteca **não tem `prepend`** ⇒ custo quadrático em páginas |
| 5.2 + 5.6 + DoD 5/6 | `T-05.3` | **fusão.** Teto de 90 dias, backfill one-shot/cron (`ADR-027/D1`), custo de cota (**87 chamadas**, `< 4%` de um minuto) e pegada — é **uma** execução que produz os quatro números |
| 5.3 + DoD 4 | `T-05.4` | ⛔ além do teto a rota **recusa**. `200` vazio ali é o `rc=0` ambíguo de `ADR-012` |
| 5.4 | `T-05.5` | os três estados de `D6` — ⚠️ **e esta task é onde o requisito novo do owner incide**. Ver §3 |
| **novo** | `T-05.6` | ⚠️ **o aviso único de indisponibilidade** (3ª rodada). Ver §3 — é a task que o owner precisa ler antes de aprovar |
| 5.5 | `T-05.7` | o horizonte vem do **envelope**, nunca de contagem de linhas — a contagem é **não-monotônica** (`klines_volume`: `0` a 6 dias e `59` a 8 dias) e mentiria |
| DoD 1/2/3 | `T-05.8` | Playwright: 3 arrastos carregam monotonicamente, a parede assimétrica **é nomeada** nos dois painéis no **mesmo assert**, e ablação de `P5`. ⛔ **Morde se o painel apenas esvaziar** |
| DoD 7 | `T-05.9` | **teto de 400 ms, `p95` sobre `n ≥ 10` paginações, até o frame em que a barra está DESENHADA** — morde se o assert for de chegada da resposta |
| 5.7 | `T-05.10` | veredito do `ux-ui-mastery` sobre o estado nomeado |
| **novo** | `T-05.11` | `docs`: declarar o **não-construído** com gatilho nomeado. Ver §3, Parte A |

---

## 2. Contagem por fase

| fase | componentes | tasks | pixel |
|---|---|---|---|
| `01` vela | `sentimento` · `web` | **11** | `P1` corpo e pavio |
| `02` eixo único | `charts` · `web` | **8** | `P2` pan move os cinco |
| `03` timeframe | `sentimento` · `web` | **12** | `P3` TF reagrega todos |
| `04` OI honesto | `web` | **6** | `P4` rótulo soletra os 3 termos |
| `05` história sob demanda | `web` · `charts` · `sentimento` · `docs` | **11** | `P5` a parede é **dita** |
| | | **48** | |

**Ordem** (do `index.md`, teto de **2** tarefas simultâneas `[DOC: MEMORY.md]`):
`01` ∥ `04` → `02` → `03` → `05`.

---

## 3. ⚠️ O JULGAMENTO QUE O DESPACHO PEDIU — o requisito do aviso de indisponibilidade

> **A pergunta:** a 3ª rodada de
> [`DECISOES-DO-OWNER-2026-09-19.md`](handoff/DECISOES-DO-OWNER-2026-09-19.md) chegou **depois**
> de `approve spec` (17:00:57). Cabe como detalhe de task dentro das 5 fases aprovadas, ou exige
> emenda da SPEC?

**Resposta curta: são DUAS coisas com respostas DIFERENTES, e colapsá-las numa só é o erro.**

### Parte A — "não exibir o indicador no TF onde ele não está disponível" → **cabe, e cabe como NEGATIVO**

A medição do próprio handoff mata a construção: existem **duas** grades nativas em todo o catálogo
(`1min` e `5min`, `n=60` entradas), a mais grossa é `5min`, e o TF mais fino escolhido é **`5m`**.
Agregar para cima é sempre possível ⇒ **nenhuma série fica indisponível em `5m`/`15m`/`1h`/`4h`**.

⛔ **Construir o mecanismo hoje seria construir um pixel que nunca acende** — e um pixel que nunca
acende **não tem ablação**, que é justamente o `DoD-4` desta feature. É a mesma classe do `rc=0`
ambíguo de `ADR-012`: verde indistinguível entre *"nunca disparou"* e *"nunca foi capaz de
disparar"*.

⇒ entra como **`T-05.11`, componente `docs`**: declarar o não-construído **com gatilho nomeado** —
*"o dia em que `1m` entrar na barra"*, e aí pega **três** métricas de uma vez (`sum_open_interest`,
preço e `count_long_short_ratio`, todas nascidas em `5min`), não só o OI. **Sem emenda da SPEC:**
`SPEC-008` §11 já é o lugar declarado para *"o que esta SPEC não decide — com dono e gatilho"*.

### Parte B — "uma só: 'indisponível'" × os TRÊS estados de `D6` → **cabe sob a LEITURA A, e NÃO exige emenda — mas exige UMA LINHA do owner**

⚠️ **Aqui há tensão real com a SPEC aprovada, e eu não vou silenciá-la.** `SPEC-008` §7.2 (`D6`) é
**normativo** e fixa **três** estados distinguíveis — `absent` · `not-loaded` · `beyond-coverage`.
O owner escolheu **"uma só"**, *"contra a recomendação de distinguir três causas"*. As duas frases
falam do mesmo número.

**Minha leitura — e ela sustenta a LEITURA A do loop principal sem precisar de emenda:**
as duas decisões vivem em **camadas diferentes**, e a SPEC diz isso literalmente
(*"esta SPEC fixa que eles existem e são distinguíveis; **não fixa a aparência**"*):

| camada | quem decide | quantos |
|---|---|---|
| estado de **máquina** (`data-fact`, envelope, teste) | `SPEC-008` `D6` | **3** — e `not-loaded` nem é "indisponível": é *carregando*, que o `P5` já exige distinto |
| **badge visível** de indisponibilidade | **owner**, 3ª rodada | **1** |

⇒ **`T-05.6`**: o aviso **novo** é **um** badge por painel, texto único; os três estados continuam
distinguíveis **na máquina** porque `D8`/`T-03.6` os produz de qualquer forma (o par
`{present, expected}` de `P-B` precisa do `coverage` **independentemente** do que a tela mostra).
`T-05.5` fica, com o DoD reescrito: *três estados no contrato, um badge no pixel*.
**As marcas por ponto (`RN-1`) e os 6 motivos de `ABSENCE_REASON_LABEL` ficam INTACTOS** — a
LEITURA B (colapsar também o que já existe) seria **remoção deliberada de comportamento em
produção construído contra um defeito real**, e não foi adotada.

### ⛔ O que eu peço explicitamente ao owner, e é uma pergunta de sim/não

> **O "uma só" vale para o BADGE VISÍVEL (LEITURA A, o que está quebrado acima) ou para o CONTRATO
> INTEIRO?**
>
> - **Se é o badge** → nada a fazer: aprove as tasks como estão, **sem emenda da SPEC**.
> - **Se é o contrato inteiro** → `SPEC-008` §7.2 `D6` precisa de **emenda** (3 → 2 estados: `absent`
>   e `beyond-coverage` viram um), e `T-05.5`/`T-05.8` mudam junto. O custo: perde-se a capacidade
>   de distinguir **buraco dentro da cobertura** de **fora da cobertura** — e o queijo suíço medido
>   (`klines_volume` não-monotônico: `0` a 6 dias, `59` a 8) é exatamente o caso em que os dois
>   coexistem na mesma tela.

**Nenhuma das duas interpretações bloqueia as fases `01`–`04`.** A tensão é inteira dentro da `05`,
que é a última da ordem — então a aprovação pode sair já e a resposta chegar antes de `/build` da `05`.

---

## 4. O que NÃO virou task, e cada ausência é decisão

| ausência | motivo | dono |
|---|---|---|
| `F5` do `PRD-008` — OI agregado multi-exchange em nocional USD | **fora por DECISÃO do owner, não por dedução** (`[M-2]`). Volta só por nova decisão dele, **não por argumento novo** | owner |
| Plano de migração de `/painel` | item 2.5: task **dedicada**, `CLAUDE.md` linha 12. Esta feature fecha a REGRA; a EXECUÇÃO tem gate próprio | feature dedicada |
| Causa raiz de `[M-9]` (`klines_volume` subestimado) | escalado. `T-01.7` **detecta** a propagação; **não conserta** | `/architect` / `ADR-034` |
| Causa raiz de `[M-10]` (`SEM_PONTO` ambíguo) | escalado | `/architect` |
| Renomear os 4 eventos de log em português | `NG-7`; linha 10 do `CLAUDE.md` é **prospectiva** | — |
| `T-07.15`/`T-07.16`/`T-07.17` da mãe | `NG-8`, são de `plataforma-dados` | outra feature |
| SMC, VPVR, funding | `NG-1`/`NG-2`/`NG-3` | — |
| Qualquer `[[rules.own]]` / alvo de `make` / allowlist **de idioma** | `PRD-002`/`RN-4`, `ADR-011/D1.10`: **REPROVA a fase** | — |
| Mecanismo de indisponibilidade **por TF** | §3 Parte A: nasceria sem poder disparar. Declarado com gatilho em `T-05.11` | `/tech-lead` → owner |

---

## 5. Os cards no Jira — **planejados, NÃO criados**

`harness policy --key tracker` → `{kind=jira, project=CST, board_id=36, parent_kind=Epic,
child_kind=Tarefa}` `[MEDIDO 2026-09-19]`. Convenção medida nas 3 features anteriores:
**um Epic por fase** (ex. `CST-168..171` de `pagina-de-grafico-s2`).

| Epic | título a criar | Tarefas filhas |
|---|---|---|
| `E1` | `[candle-real-e-eixo-unico] F1 · A vela real` | `T-01.1` … `T-01.11` (11) |
| `E2` | `[candle-real-e-eixo-unico] F2 · O eixo único` | `T-02.1` … `T-02.8` (8) |
| `E3` | `[candle-real-e-eixo-unico] F3 · O timeframe único` | `T-03.1` … `T-03.12` (12) |
| `E4` | `[candle-real-e-eixo-unico] F4 · O OI honesto` | `T-04.1` … `T-04.6` (6) |
| `E5` | `[candle-real-e-eixo-unico] F5 · História sob demanda` | `T-05.1` … `T-05.11` (11) |

**Total: 5 Epics + 48 Tarefas.** O título de cada Tarefa é o campo `title` do `tasks.toml`,
já com o prefixo de componente.

---

## 6. Por que nenhuma task está cardada — **deliberado, com data e motivo**

`tracker.kind` é **`jira`**, não `none`: o destino está identificado (`CST`, board `36`). O que
não aconteceu foi a **criação**, e por **duas** razões, ambas escritas:

1. ⛔ **Ordem explícita de `REVIEW-ONLY`**: criar Epic/Tarefa antes de `approve tasks` é **ação
   externa irreversível** sobre um gate que é do **owner**;
2. o servidor MCP `atlassian` exige **OAuth** e esta sessão é **não-interativa**.

⇒ as 48 tasks nascem `local_only = true` com `local_reason` **datado**. Este **não** é o marcador de
"esqueci": sabemos exatamente que elas não estão cardadas e por quê. **Um marcador que colapse
"decidi" com "esqueci" faz o segundo nunca chamar atenção.**

**Reversão, e ela é atômica por task:** trocar `local_only`/`local_reason` por
`tracker = { provider = "jira", id = "CST-nnn", url = "…" }` na **mesma edição** — o validador
**proíbe os dois juntos** (`V-20`), então a troca não pode ficar pela metade em silêncio.

**Cadastro manual, se o owner preferir:** criar os 5 Epics de §5 no projeto `CST`, board `36`, e
uma `Tarefa` por linha de `tasks.toml`, vinculando ao Epic da `phase`.

---

## 7. Escopo de caminhos declarado

`harness pipeline scope candle-real-e-eixo-unico add …` — é o que o portão de escrita usa para
decidir 1 / 0 / colisão:

```
backend/src/modules/sentimento/domain
backend/src/modules/sentimento/use_cases
backend/src/modules/sentimento/infra
backend/src/api/routes/series_history.py
backend/src/api/routes/series_catalog.py
backend/tests/sentimento
backend/tests/api
frontend/src/app/symbol
frontend/src/charts
frontend/e2e
docs/context/candle-real-e-eixo-unico
docs/plans/SPEC-008-candle-real-e-eixo-unico
docs/specs/SPEC-008-candle-real-e-eixo-unico.md
docs/adr/ADR-040-reagregacao-na-rota-supported-interval-vira-conjunto-e-a-funcao-e-de-nature-e-reduction.md
docs/INDEX.md
```

⚠️ **Colisão conhecida e declarada:** `frontend/src/app/symbol/` e `backend/src/api/routes/series_history.py`
são tocados por **mais de uma fase** (`01`/`03`/`04`/`05` e `03`/`05`). Com o teto de **2** tarefas
simultâneas, a ordem `01 ∥ 04 → 02 → 03 → 05` já separa os dois pares que mais colidem — `01` e `04`
tocam o mesmo arquivo de front mas em regiões distintas (montagem da vela × fábrica de `data-fact`).

---

## 8. Próximo passo

1. **owner lê §3** e responde a pergunta de sim/não sobre o escopo do "uma só";
2. **owner aprova** esta narrativa;
3. só então os cards de §5 são criados no Jira e o `tasks.toml` troca `local_only` por `tracker`;
4. `harness pipeline advance candle-real-e-eixo-unico TASKS_APPROVED`;
5. `/build`.
