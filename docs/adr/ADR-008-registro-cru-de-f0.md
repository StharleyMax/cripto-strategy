# ADR-008 — O registro cru de F0: CLI, e uma consulta nomeada compartilhada

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §3.5
**Fase/Epic:** F0 · `CST-2` (o registro) e `CST-5` (o consumidor S1) · **Componente alvo:** `sentimento`
**Origem:** decisão `A1` do handoff + a terceira correção que o gate mandou carregar (**DoD falsificável para a query nomeada compartilhada**)

## Contexto

O `faseamento` declara componente `sentimento` para F0 e, **no mesmo parágrafo**, descreve o registro como *"tabela crua, sem estilo, **ordenável por clique**"*. **Clique é browser.** Se for browser, **`web` entra em F0** e o prazo de `Q16` (dono de `charts`/`web` + regra em `frontend/`) passa a ser **antes de F0**.

Dois fatos medidos que pesam na conta:

| fato | `[força]` |
|---|---|
| `core.print-statement` **bloqueia a implementação ingênua**: `harness rules --mode file --path backend/src/cli/report.py` com `print(rows)` → `{"decision":"block","reason":"[BLOQUEIO] [core.print-statement] …"}` | `[MEDIDO]` |
| um `.tsx` violando duas regras **por construção** devolve **saída VAZIA, zero regras avaliadas** (`scope = "code"`, e `frontend/` não é código para o classificador) | `[MEDIDO]` |

**O segundo fato é contraintuitivo e importa:** em browser a regra **não morde**, porque `frontend/` está fora do universo. ⇒ **a colisão de `core.print-statement` empurra na direção do CLI e NÃO a favor dele** — escolher browser evita a regra por ausência de enforcement, o que é o oposto de um argumento.

## Decisão

### D1 · O registro cru de F0 é RELATÓRIO DE CLI sobre as tabelas persistidas

Componente `sentimento`. **`web` NÃO entra em F0.**

**O argumento que decide não é o que o PM apresentou.** Ele argumentou *"a fila de 14 h precisa de observabilidade, não de ordenação por clique"* — verdadeiro e insuficiente. **O que decide é o gate:** o gate de F0 é declarado **POR COLETOR**, e o snapshot diário **pode começar assim que `Q1` for sim** (é um `GET` mais `gzip`, não precisa de `Q2`). Colocar `web` em F0 **reintroduz um gate de fase que R1 removeu de propósito** — passaria a exigir `Q16` respondida para capturar dado que não se recaptura.

### D2 · A saída é um REGISTRADOR NOMEADO escrevendo em `stdout`

**Não `print`.** É literalmente o que a mensagem da regra pede (*"use um registrador nomeado pelo módulo em vez de imprimir"*), e **tem de ser decidido antes da primeira linha, não descoberto no pre-push.**

O relatório é **saída de produto** e continua sendo: o registrador nomeado escreve em `stdout` com formato estável, e `md.ingest_run`/`md.ingest_gap` continuam **PERSISTIDOS, nunca log** — `print` não é nem log.

### D3 · UMA consulta nomeada, DOIS consumidores

```
ingest_health_query   -- nome estável, definição única
   consumidor 1: o registro cru de F0 (CLI)          -- CST-2
   consumidor 2: o console S1 em F3 (web)            -- CST-5
```

**Se F0 escrever o seu próprio caminho de leitura, F3 reimplementa o mesmo registro e o repositório passa a ter duas implementações da mesma verdade — e elas divergem no primeiro `verdict` novo.**

**Colunas que a consulta devolve, fixadas aqui porque são o contrato entre os dois consumidores:**
`run_id · source · endpoint · window · n_expected · n_returned · n_written · verdict · api_code · src_sha256 · weight_used · observer_id · observer_region · clock_skew_ms · janela_de_perda`

### D4 · DoD FALSIFICÁVEL da consulta compartilhada — e é o que o gate pediu

**Um critério que só diz "as duas telas usam a mesma consulta" não é falsificável.** Este é:

| # | critério | comando e universo |
|---|---|---|
| **DoD-1** | **existe exatamente UMA definição** de `ingest_health_query` no repositório | `harness rules --mode sweep` com regra própria `[[rules.own]]` de forma `forbidden-regex` contra uma segunda definição, **acompanhada de corpus** (`harness corpus verify` + `harness corpus mutate`) — **regra sem corpus é enforcement declarado, não medido** |
| **DoD-2** | **as duas saídas são IDÊNTICAS sobre o mesmo estado**: `sha256` da projeção canônica (§3.8, invariante de locale) da saída do CLI **igual** ao `sha256` da projeção da resposta que alimenta S1 | sobre o **mesmo** `md.ingest_run` congelado como fixture, **≥ 1 run de cada `verdict` existente** |
| **DoD-3** | **teste do `verdict` NOVO — e é este que dá dente ao critério.** Acrescentar um valor de `verdict` que nenhum dos dois consumidores conhece ⇒ **os dois têm de mudar juntos ou os dois reprovam.** Nunca um passa e o outro ignora | universo: **1 valor de `verdict` inédito**, injetado no fixture |

**DoD-3 é o critério que falsifica a duplicação**, porque é exatamente onde duas implementações divergem: a que não conhece o `verdict` novo o esconde em silêncio. **Se um passar e o outro não, existem duas implementações — e o teste diz qual.**

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **(b) registro em browser** | põe `web` no caminho crítico de F0 e **move o prazo de `Q16` para antes de F0**, revertendo uma correção deliberada de R1. E "ordenável por clique" **não é requisito de F0**: a fila de 14 h precisa de observabilidade |
| **`print` direto** | **bloqueado, medido**. E a regra tem razão de domínio, não só de higiene: registro persistido ≠ saída de terminal |
| **duas consultas, uma por consumidor** | divergem no primeiro `verdict` novo — e o defeito é **silencioso**, que é a classe que esta fase inteira existe para impedir |
| **desligar `core.print-statement` para o caminho de CLI** | trocaria uma regra bloqueante por uma exceção, num repositório cujas 5 regras são todo o enforcement que existe. O custo real da alternativa correta é **uma linha de registrador** |

## Falsificador

**DoD-3 é o falsificador desta ADR**, e ele é executável: **um `verdict` novo que apareça em um consumidor e não no outro prova que D3 não foi implementado.**

**Segundo falsificador, contra D1:** se o owner declarar que quer operar F0 **pelo browser** — a decisão é dele, é preferência de operação, não arquitetura — então D1 cai e o prazo de `Q16` sobe para antes de F0. **A SPEC não precisa de reescrita: `ingest_health_query` já é o contrato, e o segundo consumidor apenas nasce mais cedo.** É por isso que D3 é a decisão importante desta ADR, e D1 é a barata.
