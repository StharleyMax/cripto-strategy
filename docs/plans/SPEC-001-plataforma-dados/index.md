# Plano de execução — SPEC-001 `plataforma-dados`

**SPEC:** [`SPEC-001`](../../specs/SPEC-001-plataforma-dados.md) (`DRAFT`) · **Data:** 2026-08-25
**Epics existentes no tracker (lidos, não escritos):** `CST-1`..`CST-7`
**Componentes (vocabulário fechado):** `sentimento` · `charts` · `convergencia` · `backtest` · `web` · `docs`

## Regra deste plano

1. **Cada item referencia o requisito que cobre** (`CA-*`, `R-*`, `QF-*`, `ZL-*`, `[GAP G*]`, ADR) e **declara UM componente alvo**.
2. **Cada fase tem DoD que nomeia o COMANDO e o UNIVERSO.** *"Testes passam"* não é DoD.
3. **Fases pequenas.** Nenhuma fase abre e fecha em prazos opostos; cada uma tem DoD encerrável.
4. **Nenhuma fase escreve no tracker.** Materializar tasks é ato do `/tech-lead`.
5. **Quando a fronteira de escopo de uma task colide com uma decisão de arquitetura registrada em ADR, a ADR ganha.** Acrescentada em 2026-08-29 pelo `/architect`, a partir do precedente que o `/review` declarou em `T-01.7` — ver abaixo.

### A `Regra 5`, e o precedente medido que a produziu

**Origem:** `T-01.7` declarava fronteira *"APENAS o conteúdo de docstring"* e **a cruzou** — editou `backend/pyproject.toml` para pôr `"D"` no `select` do `ruff`. O `/review` julgou **ampliação legítima e declarada**, com esta razão, citada literal:

> *"quando fronteira de escopo escrita em `tasks.toml` colide com decisão de arquitetura registrada em ADR, a ADR ganha — a fronteira é nota de escopo, a ADR é arquitetura de registro"*

`[DOC: docs/context/plataforma-dados/tasks.toml, refs de `T-01.7`, 3º item]`

**Por que a regra mora AQUI e não na fase `01` nem só em `tasks.toml`:** ela é sobre **precedência entre duas superfícies**, e vale para qualquer task de qualquer fase. Escrevê-la na fase `01` a esconderia das outras oito; escrevê-la só em `tasks.toml` a esconderia de quem não abre `T-01.7` — que é o mesmo argumento pelo qual `ADR-003:134-140` escreveu um gatilho em **três** superfícies em vez de uma.

**O que a regra NÃO autoriza, e o limite é o que a torna usável.** Ela não é licença para ampliar escopo por conveniência. **As quatro condições que sustentaram o precedente, e são elas que a `Regra 5` exige:**

| # | condição | como foi satisfeita em `T-01.7` |
|---|---|---|
| 1 | a fronteira, respeitada à letra, deixaria **fora de qualquer portão** a metade mensurável do DoD | `ruff check src tests` roda **sem** `--select D` e `"D"` não estava no `select` ⇒ o portão era **cego a docstring**, e as 55 podiam ser apagadas no dia seguinte com tudo verde. Provado por mutação `[DOC: refs de `T-01.7`; MEDIDO 2026-08-29, n=4 via `bash backend/scripts/lint.sh`]` |
| 2 | o arquivo tocado **já estava no perímetro de auditoria** da task, e a travessia o **APERTA**, nunca o afrouxa | quem responde por não afrouxar um arquivo tem autoridade para apertá-lo, **e o aperto foi medido COMO aperto**: 275 regras habilitadas antes e depois, `--show-settings` byte a byte idêntico exceto pelo `D` |
| 3 | **o falsificador da fronteira original continua obrigatório e continua verde** | `ast.dump` dos 13 `.py` com as docstrings removidas: **idêntico 13/13** contra a base |
| 4 | a travessia é **ESCRITA**, não silenciosa — e **a linha reservada ao owner não é cruzada** | `0` `[[rules.own]]`, `harness.toml` intocado. **`components`, vocabulário fechado e gates de owner NUNCA são "ampliação legítima"** |

**Falsificador da `Regra 5`:** se aparecer uma travessia que satisfaça as quatro condições e ainda assim tenha sido a decisão errada — porque a ADR invocada não cobria de fato o que se editou —, então a regra precisa de uma quinta condição: *"a ADR nomeia o arquivo tocado, e não só a propriedade"*. **Ainda não vi esse caso** `[NÃO MEDIDO: universo de 1 travessia]`.

**A metade que é do `/tech-lead`, com o texto pronto para copiar.** A próxima task deste tipo declara a fronteira **já ampliada**, em vez de a cruzar depois — redação proposta pelo `/review` e adotada aqui:

> *"Fronteira: a docstring, e o que for preciso para o portão que a mede. Nenhuma assinatura, nenhum nome, nenhum comportamento — e o falsificador continua obrigatório: mesmos números de cobertura por camada, e `ast.dump` idêntico com as docstrings removidas."*

**A forma geral, para tasks que não são de docstring:** *"Fronteira: `<o artefato>`, **e o que for preciso para o portão que o mede**. `<o que continua proibido>` — e o falsificador continua obrigatório: `<a medição que prova que só o artefato mudou>`."*

## As nove fases

| # | fase | componente predominante | Epic | gate |
|---|---|---|---|---|
| [`01`](01_governanca_gateante.md) | Governança gateante — runner, dono de julgamento, cobertura de `frontend/` | `docs` | `CST-1` | nenhum |
| [`02`](02_captura_sem_gate_de_host.md) | Captura que **não** precisa de host 24/7 — snapshot datado + one-shot Coinalyze `daily` | `sentimento` | `CST-2` | `Q1` |
| [`03`](03_captura_continua.md) | Captura contínua — `forceOrder`, `premiumIndex`, probe, skew, **agregado `q`/`nq`** | `sentimento` | `CST-2` | `Q1` + `Q2` + `Q19` (+ `Q17` p/ spread) |
| [`04`](04_contrato_temporal.md) | Contrato temporal e identidade — **offline, sem rede, sem chave** | `sentimento` | `CST-3` | nenhum |
| [`05`](05_fatia_visivel.md) | S2-mínima + auth mínima — a primeira fatia de valor visível | `charts` / `web` | `CST-3` | `Q16` |
| [`06`](06_semantica_declarada.md) | `series_catalog` + quarentena + S3 | `sentimento` / `web` | `CST-4` | nenhum |
| [`07`](07_aquisicao_em_regime.md) | Aquisição em regime + S1 + `universe_at` | `sentimento` / `web` | `CST-5` | `Q3`, `Q18` |
| [`08`](08_superficie_e_reprodutibilidade.md) | Motor, S4, S2 completa, `run_registry` | `charts` / `backtest` | `CST-6` | `Q10`, `Q11`, `Q13` |
| [`09`](09_consolidacao_de_fronteira.md) | ADRs numerados, `env`, consolidação | `docs` | `CST-7` | nenhum |

## Ordem e dependência real

```
T-01.1  (runner · gate nenhum)
   ├──> 02 ──┐                   02 e 03 são o MESMO Epic, separados pelo GATE
   ├──> 03 ──┤
   └─────────┴──> 04 ──> 05
                    └──> 06 ──> 07 ──> 08 ──> 09

T-01.2 + T-01.3  (Q16) ──────> 05    o relógio de retrabalho de Q16 é "antes do
                                     primeiro .tsx", e o primeiro .tsx é 05
T-01.4  ─── independente: não precede fase nenhuma
```

**`T-01.1` gateia `02`/`03`/`04` — não a fase `01` inteira.** O que essas três fases precisam de `01` é **o runner**: as condições de pronto de `02` e `03` **já são testes** (`CA-F0-3`, `CA-F0-4`, `CA-F0-5`) e `harness policy --key test_cmd` devolve **`{}`** `[MEDIDO 2026-08-28]`. Sem runner, a fase cujo dado não se recaptura termina com afirmações não conferíveis.

**`T-01.2` e `T-01.3` não são o runner.** São cobertura de `frontend/` e dono de julgamento de `charts`/`web` — `Q16` — e o relógio de **retrabalho** de `Q16` está declarado como *"antes do primeiro `.tsx`"* **[DOC:** `docs/decisoes-do-owner.md` §Q16(d)**]**. O primeiro `.tsx` é `05`. Deixá-las a montante de `02`/`03` punha uma pergunta **sem relógio** a montante de `CL-1`..`CL-5`, que é a fase de custo **irreversível**.

### Registro — `D-1` aplicada em 2026-08-28

**A aresta que saiu:** `01 (gateia tudo) └─> 02` — a fase `01` **inteira** precedia `02`, e por extensão `03`.
**A aresta que entrou:** somente **`T-01.1`** precede `02`/`03`/`04`; **`T-01.2` e `T-01.3` passam a preceder `05`**.

**Origem.** Decisão do **owner** em **2026-08-28**, `D-1` **ACEITA** — registrada em [`decisoes-de-execucao-2026-08-28.md`](../../context/plataforma-dados/decisoes-de-execucao-2026-08-28.md) §0.1 (item **1** da tabela de superfícies) e §2. A proposta original é do `/tech-lead`, em [`tasks_review.md`](../../context/plataforma-dados/tasks_review.md) §7/`D-1`, que **recusou aplicá-la sozinho** por ser aresta de grafo. `[PREMISSA-OWNER: 2026-08-28]` para a aceitação; `[DOC]` para o argumento.

**Isto é reconciliação de duas superfícies, não decisão nova de arquitetura.** `tasks.toml` **já materializava `D-1` no nível de task** desde 2026-08-25; era o plano, no nível de **fase**, que dizia o contrário — e como `/build` opera **por fase**, era a superfície mais restritiva que valia. Medido com `grep -n 'depends_on' docs/context/plataforma-dados/tasks.toml`, sobre **81** tasks `[MEDIDO 2026-08-28]`:

| o que | valor | universo |
|---|---|---|
| tasks de `02`/`03`/`04` que declaram exatamente `depends_on = ["T-01.1"]` | **13** | **23** tasks nas três fases `[MEDIDO 2026-08-28]` |
| tasks de `02`/`03`/`04` que citam `T-01.2` **ou** `T-01.3` em `depends_on` | **0** | idem — as outras **10** dependem de irmãs da própria fase, e **toda** cadeia enraíza em `T-01.1` `[MEDIDO 2026-08-28]` |
| linhas `depends_on` do arquivo inteiro que citam `T-01.3` | **1** | `T-05.1`, que é **fase `05`** — exatamente para onde `D-1` move a aresta `[MEDIDO 2026-08-28]` |

⇒ **`D-1` move o plano na direção que o `tasks.toml` já tinha.** Nenhum Epic muda de dono, nenhuma fronteira de valor se move: `T-01.1`..`T-01.4` seguem em `CST-1`.

**O que este documento NÃO afirma.** A outra metade de `D-1` — `T-05.1` recebendo `T-01.2` em `depends_on`, e o desbloqueio de `T-01.2`/`T-01.3`/`T-05.1` em `tasks.toml` e no Jira — é superfície do `/tech-lead` (§0.1, item **2**), e **não foi tocada aqui**. E o **ledger não se moveu**: `harness pipeline state plataforma-dados` segue **`TASKS_APPROVED`**; `build` é gate do **owner**.

**`04` não depende de rede.** Todos os fixtures estão em disco (`data/`, 850 MB, `data/MANIFEST.md`). Ela pode correr em paralelo com `03`.

## ⚠️ Divergência declarada em relação à fronteira dos Epics

**Nove fases sobre sete Epics. Nenhum Epic novo, nenhuma fronteira de valor movida.** Dois Epics são partidos, e o critério é **a fronteira do gate**, não o tamanho:

| Epic | fases | por que partido |
|---|---|---|
| `CST-2` (F0) | `02`, `03` | **o gate de F0 é declarado POR COLETOR.** O snapshot diário e o one-shot da Coinalyze **não precisam de `Q2`** (um `GET` mais `gzip`; 1.140 chamadas ≈ 28,5 min uma vez); os coletores contínuos precisam. Fatiar em outro lugar reintroduziria o gate de fase que R1 removeu de propósito |
| `CST-3` (F1) | `04`, `05` | `04` é **contrato sem rede e sem chave**; `05` é a primeira superfície servida de host exposto. **Duas classes de risco, dois DoD.** E `05` carrega auth, que hoje não tem Epic (SPEC §8.3) |

> **⚠️ Conserto de 2026-08-29, `/architect` — a linha da fase `07` tinha 5 colunas numa tabela de 6.**
> O Epic estava **ausente**, e a consequência não era estética: `Q3, Q18` renderizava **na coluna `Epic`**,
> e a coluna `gate` saía vazia — isto é, **a tabela publicava que a fase `07` não tem gate**, quando ela tem
> dois. **A fonte autoritativa é o cabeçalho da própria fase**, que sempre disse `CST-5`.
>
> **Conferido nas NOVE fases, não só na que falhou** `[MEDIDO 2026-08-29: `**Epic:**` do cabeçalho de cada
> `0N_*.md` contra a linha correspondente desta tabela → **8 de 9 concordam; 1 divergência, a `07`, por
> ausência**]`. **Achado ao conferir a boa-formação das tabelas que eu mesmo editei** — o verificador
> ingênuo acusou três arquivos, e dois eram falso positivo dele (contava `\|` escapado dentro de crase);
> corrigido o verificador, sobrou **esta**, que é real e é **anterior a esta sessão**.
>
> **É a mesma família das nove:** um leitor que confiasse na tabela concluiria *"`07` não tem gate"* a
> partir de uma linha malformada. **Nenhuma linha foi reescrita além da célula ausente.**

**E a reconciliação de contagem que o PRD não fez:** PRD §13.5 diz *"SEIS Epics, com um sétimo contingente a `Q2` = exposto"*. `Q2` foi respondida como **exposto com auth mínima**, e essa condição **não** se realiza. **O sétimo Epic existente é a PARTIÇÃO DE F5 em F5a/F5b**, exatamente como PRD §13.2 e §15 argumentaram — e §13.5 não a contou. **Quem ler §13.5 hoje conclui que o sétimo Epic é auth. Não é.**

## Falsificadores globais

Ver [`SPEC-001` §12](../../specs/SPEC-001-plataforma-dados.md). Resumo: **F-1** leitura de decisão com `available_at > t` ou `bucket_end > t` sob `final_only` · **F-2** duas séries com a mesma `SeriesKey` e `cvd_cum` divergente · **F-3** item de plano que não consiga declarar UM componente · **F-4** mesmo `bundle_hash` + `window` devolvendo número diferente **sem recusa**.

## O que este plano NÃO faz

Não cria, edita ou comenta nada no tracker. Não escreve código. Não decide nenhuma das 14 perguntas abertas do owner. Não marca a SPEC como aprovada.
