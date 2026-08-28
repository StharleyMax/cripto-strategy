# Proposta ao owner — um componente `infra` no vocabulário fechado

**Data:** 2026-08-28 · **Origem:** `ADR-009/D5` · **Plano:** [`01_governanca_gateante.md`](../../plans/SPEC-001-plataforma-dados/01_governanca_gateante.md) item `1.7` · **Task:** `T-01.4` (`CST-11`), metade `D5`
**Estado: PROPOSTA. NÃO DECIDIDA.**

---

## 0. O que está sendo pedido, e por que não posso decidir

O vocabulário de componentes é **fechado** e é **política do repositório**:

```
harness policy --key components
→ ["sentimento", "charts", "convergencia", "backtest", "web", "docs"]
```
`[MEDIDO 2026-08-28]`

> *"Alterar o vocabulário é ato do owner, não de agente."* `[DOC: CLAUDE.md, §"Vocabulário fechado de componentes"]`

`ADR-009/D5` registrou que o owner disse *"podemos discutir"*, e registrou também a leitura que
governa este documento: **discutir não é delegar a decisão.** Por isso o item `1.7` do plano manda
**levar a proposta**, e não implementá-la. Este arquivo é a entrega desse item.

**A resposta pode ser "não", e "não" fecha o item igual.** O que fecharia mal seria eu criar o
componente, ou deixar a proposta sem o número que a derruba.

---

## 1. O argumento, como foi construído em `ADR-009/D5`

O teste aplicado foi: **o vocabulário atual cobre todos os itens de código do plano?** A resposta
medida então foi *sim para código, não para três itens*, e os três eram:

| item sem componente | por que ele não tem casa |
|---|---|
| `deploy/` (compose, reverse proxy, TLS) | ficaria **fora de `code_paths`** ⇒ fora de qualquer regra — a mesma classe de defeito que `frontend/` |
| `G1` — backup com **teste de restauração** e declaração **por tabela** do que é re-derivável | protege o que **não** é re-derivável (liquidação intraday, `available_at` OBSERVED, snapshot datado, `nq`), e nenhuma das seis fases o carregava |
| topologia do escritor único e da fila durável | decisão de infra com consequência de contrato (`ADR-002/D5`) |

⇒ **proposta: um sétimo componente, `infra`.**

**A metade do argumento que continua de pé, medida hoje:** o buraco de `code_paths` é real e é
verificável por comando, não por leitura.

```
harness code-paths classify backend/src/modules/sentimento/domain/etl_backlog.py
→ producao: … include_prefixes + include_globs casam e nada exclui
harness code-paths classify frontend/src/App.tsx
→ nao-producao: … nenhum include_prefixes casa ['backend/src/', 'backend/tests/']
harness code-paths classify deploy/compose.prod.yml
→ nao-producao: … nenhum include_prefixes casa ['backend/src/', 'backend/tests/']
```
`[MEDIDO 2026-08-28]` · universo de `include_prefixes`: **2** (`backend/src/`, `backend/tests/`)
`[MEDIDO 2026-08-28: harness policy --key code_paths]`

Um `deploy/` nasceria invisível para `harness rules --mode sweep`. Isso não é hipótese.

---

## 2. O falsificador — e ele **disparou em parte**. Este é o achado central deste documento

`ADR-009/D5` declarou o próprio falsificador, e ele é o mesmo de `ADR-003`:

> *"Se todo item de plano conseguir declarar um dos **seis** componentes existentes **sem forçar**, o
> componente novo é custo sem retorno. **Hoje os três itens acima forçam.**"*

**Hoje eles não forçam mais — e a maior parte disso já aconteceu, sem que ninguém tocasse no
vocabulário.** Medido, item a item:

| o item de `ADR-009/D5` | estado em 2026-08-28 | comando |
|---|---|---|
| `G1` (backup + restauração) | **dissolvido.** O `/tech-lead`, na discordância `D-3`, partiu o item `2.5` em **`T-02.4a`** (`.CHECKSUM` na borda de ingestão = código no caminho de escrita ⇒ `components = ["sentimento"]`) e **`T-02.4b`** (backup e restauração ⇒ `components = ["docs"]`). **Nenhuma das duas força** | `grep -A4 '^id = "T-02.4' docs/context/plataforma-dados/tasks.toml` |
| `deploy/` | **não existe, e nenhum item de plano ou task deste repositório o reivindica.** A única ocorrência de `deploy/` nos documentos é uma **medição do repositório vizinho** (`anything_monorepo/deploy/compose.prod.yml`, `SPEC-001:616`) | `ls -d deploy` → *inexistente* · `grep -rn 'deploy/' docs/plans docs/context/plataforma-dados/tasks.toml docs/specs` → **1 ocorrência, e é sobre outro repo** |
| escritor único / fila durável | **não está em nenhum plano nem em nenhuma task desta feature** | `grep -rn 'escritor único\|fila durável' docs/plans docs/context/plataforma-dados/tasks.toml` → **0** |

E o teste do falsificador aplicado ao universo inteiro, não aos três itens:

```
grep -c '^id = "T-'         docs/context/plataforma-dados/tasks.toml   →  84
grep -c '^components = '    docs/context/plataforma-dados/tasks.toml   →  84
grep -c 'COMPONENTE-ALVO FORÇADO' docs/context/plataforma-dados/tasks.toml → 0
```
`[MEDIDO 2026-08-28]`

**84 de 84 tasks declaram um dos seis nomes existentes, e zero carregam o marcador de forçamento.**
Distribuição: `sentimento` 43 · `charts` 16 · `docs` 13 · `web` 9 · `docs`+`sentimento` 2 ·
`backtest` 1 `[MEDIDO 2026-08-28: grep -oE '^components = \[.*\]' … | sort | uniq -c]`.

Resta **um** marcador `[COMPONENTE-ALVO FORÇADO: candidato a infra]` no repositório inteiro, e ele
está no **texto do plano**, no item `2.5` — exatamente o item que as tasks `T-02.4a`/`T-02.4b` já
substituíram. `[MEDIDO 2026-08-28: grep -rn 'COMPONENTE-ALVO FORÇADO' docs/plans/SPEC-001-plataforma-dados/*.md → 1]`
**O plano é superfície do `/architect` e não foi editado por esta task.**

---

## 3. Recomendação: **ADIAR a criação, com o gatilho nomeado** — e não é "não"

Adiar não é arquivar. A diferença é que o gatilho fica escrito e verificável:

> **Criar `infra` quando, e só quando, um dos dois acontecer:**
> **(a)** um diretório de infraestrutura executável passar a existir neste repositório (`deploy/`,
> compose, reverse proxy, TLS) — porque aí o buraco de `code_paths` deixa de ser hipótese e vira
> arquivo em disco; **ou**
> **(b)** um item de plano precisar declarar componente e **nenhum dos seis servir sem forçar** —
> o marcador `[COMPONENTE-ALVO FORÇADO]` reaparecendo em um plano é a evidência, e ela é grep.

**O argumento para adiar, e ele é o custo, não a preguiça.** Um componente não é uma string: ele é
um nome que outras três superfícies passam a poder referenciar, e duas delas hoje estão
**incompletas para os seis que já existem**:

```
harness policy --key test_cmd            → {"sentimento": {...}}         — 1 de 6 componentes
harness policy --key agents.by_component → {"backtest": …, "convergencia": …, "sentimento": …}
                                                                          — 3 de 6 componentes
```
`[MEDIDO 2026-08-28]`

**Um sétimo nome sem `test_cmd` é um componente cujo portão não existe** — e este repositório já
tem cinco assim. Acrescentar o sétimo antes de haver arquivo que ele governe aumenta a distância
entre o vocabulário e o que é de fato medido, que é a classe de defeito que `ADR-011` passou o dia
recusando.

**O que o adiamento NÃO cobre, e precisa ser dito:** o buraco de `code_paths` para `frontend/`
continua aberto e **não é resolvido por componente nenhum** — `web` já existe no vocabulário e
`frontend/src/App.tsx` mesmo assim classifica como `nao-producao`. Componente e `code_paths` são
eixos diferentes, e confundi-los faria a criação de `infra` parecer resolver algo que ela não
resolveria. A rota declarada para o `frontend/` é **ESLint** (`ADR-011/D4`, `T-01.2`), não vocabulário.

---

## 4. Falsificador **desta proposta**

Se o owner criar `infra` e, três fases adiante, **nenhuma task tiver declarado `infra`** — ou o
componente existir sem entrada em `test_cmd`, isto é, sem portão —, então este documento
recomendou custo sem retorno, e a recomendação de adiar era a certa pelo motivo errado: eu teria
acertado o veredito e errado o argumento.

**E o inverso, que é o falsificador do adiamento:** se `deploy/` (ou equivalente) nascer neste
repositório **antes** de o componente existir, houve uma janela em que infraestrutura executável
viveu fora de `code_paths` e fora de qualquer regra — e o adiamento terá comprado exatamente o
defeito que a proposta original queria evitar. **É por isso que o gatilho `(a)` é "quando o
diretório passar a existir", e não "quando alguém se lembrar".**

---

## 5. O que esta task NÃO fez, explicitamente

- **Não alterou** `harness policy --key components`. O vocabulário segue com **6** nomes.
- **Não editou** `harness.toml` (a task `T-01.2` estava trabalhando nele em paralelo).
- **Não editou** os planos — o marcador `[COMPONENTE-ALVO FORÇADO]` do item `2.5` continua lá, e
  removê-lo é ato do `/architect`, não deste `/build`.
- **Não decidiu nada.** A decisão é do owner, e o item `1.7` fecha com a proposta entregue, seja
  qual for a resposta.
