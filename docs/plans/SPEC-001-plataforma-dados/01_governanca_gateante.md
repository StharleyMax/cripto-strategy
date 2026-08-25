# Fase 01 — Governança gateante

**Epic:** `CST-1` (F5a) · **Componente alvo: `docs`** (+ `harness.toml`) · **Gate:** nenhum · **Fecha ANTES de 02**

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

## DoD — comando e universo

| # | critério | comando | universo |
|---|---|---|---|
| **D1.1** | o runner existe e roda | `harness policy --key test_cmd` **deixa de devolver `{}`**, e o comando declarado **roda verde** | **≥ 1 teste**, e ele é um dos de `02`/`03` |
| **D1.2** | dono de julgamento existe para os dois | `harness policy --key agents.by_component` **contém `charts` e `web`** | **2 componentes** |
| **D1.3** | **cobertura de `frontend/` FECHADA, medida por bloqueio devolvido** | `harness rules --mode file --path frontend/src/<violador>.tsx` **devolve BLOQUEIO** | **1 arquivo violando ≥ 2 regras por construção** (`const x: any`, `console.log`) |
| **D1.4** | a lacuna medida **antes** não se repete | o **mesmo** comando de D1.3 devolvia **saída VAZIA, zero regras avaliadas** `[MEDIDO]`. **Passar exige que a saída mude** | idem |
| **D1.5** | regra própria é enforcement **medido** | `harness corpus verify --corpus <dir> --reference <cmd>` **e** `harness corpus mutate --corpus <dir> --reference <cmd>` | **toda `[[rules.own]]` declarada nesta fase** |
| **D1.6** | fronteira de componente **executável** | o contrato `forbidden` de import **reprova** um import de `charts` para `web` e vice-versa | **2 imports proibidos, 1 em cada direção** |

**⚠️ D1.3 é o critério que o `CA-F5-4` original não tinha.** Como estava escrito, *"re-declarar a lacuna com a contagem de arquivos"* era **desfecho aceito** ⇒ **o critério passava com o enforcement inalterado**. Um critério que passa sem que nada mude não testa nada.

## Não faz

Não escreve código de produção. **Não consolida ADR** (é `09`). Não decide arquitetura de dado. **Não altera o vocabulário fechado de componentes** — `1.7` é proposta ao owner.

## Falsificador da fase

Se, com `1.4` aplicado nas **duas** partes, D1.3 continuar devolvendo saída vazia, o fecho de `CA-F5-4` precisa de uma **terceira** parte que ninguém identificou — e `ADR-009/D3` está errado.
