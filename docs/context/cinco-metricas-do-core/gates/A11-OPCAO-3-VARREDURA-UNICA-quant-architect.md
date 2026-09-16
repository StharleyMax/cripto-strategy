# `A11` / opção 3 — a varredura única é admissível, e em qual forma

**Data:** 2026-09-16 · **Autor:** `quant-architect` (dono de julgamento do domínio `sentimento`)
**Entrada:** [`handoff/A11-LATENCIA-DE-SYMBOL.md`](../handoff/A11-LATENCIA-DE-SYMBOL.md)
**Escopo:** decisão de arquitetura. **Nenhum código escrito.** Postgres tocado **somente em
`BEGIN READ ONLY`**, nenhuma semeadura, nenhum `INSERT`/`UPDATE`/`DDL`.

> ⚠️ **O `harness doctor` não diz nada sobre o que está julgado aqui.** As 5 regras do pack `core`
> são higiene de Python; nenhuma delas sabe o que é lookahead. Cada veredito abaixo carrega **como o
> owner o confere sem confiar em mim** — e o que eu não sei conferir está rotulado como tal.

---

## 0. Veredito, em quatro linhas

| item | veredito |
|---|---|
| 1 · acessor-LOTE viola o invariante? | **NÃO viola** — é segunda porta legítima do MESMO acessor, sob 4 condições (§1). **O teste PRECISA mudar**, e na direção de APERTAR: hoje ele deixaria a porta passar **pelo motivo errado** (§1.3) |
| 2 · a monotonicidade permite a varredura? | **PERMITE. Nenhum termo quebra.** Mas **dois** pressupostos silenciosos são FALSOS em dado de produção, ambos medidos (§2.4, §2.5) — e um deles é lookahead |
| 3 · a opção 2 é segura de forma independente? | **SÓ em uma das duas formas.** Na forma "o SQL já filtrou" é **premissa não declarada** e eu a recuso (§3.2). Na forma "o caso de uso aplica ele mesmo, uma vez, fora do laço" é **teorema, não premissa** (§3.1) |
| 4 · ADR | **ADR nova: `ADR-039`.** Não estende `ADR-034`/`ADR-037`/`ADR-038` — nenhuma delas é dona de "quantas vezes o acessor é chamado por relatório" (§4) |

---

## 1. Item 1 — o acessor-LOTE é segunda porta do MESMO acessor, não um segundo acessor

### 1.1 Qual é o invariante, lido no que ele MEDE e não no que ele se chama

O invariante não é *"existe um único símbolo Python chamado `as_of`"*. Ele é, na letra do próprio
arquivo (`test_as_of_is_the_single_reader.py:1-7`):

> *"duas trilhas de leitura não falham, elas DIVERGEM — uma aplica R-2 e a outra não, e as duas
> respostas são plausíveis."*

O conteúdo é **um lugar só onde uma linha armazenada vira um número num instante de decisão**. Isso
é uma propriedade sobre **a verdade de admissão**, não sobre a aridade da assinatura. Um acessor que
responde N instantes numa passada continua tendo **uma** verdade de admissão — desde que ela não
seja reescrita numa segunda cópia.

O teste hoje cobra o invariante por **três** mecanismos, e eles não são equivalentes:

| mecanismo | linha | o que ele realmente prende |
|---|---|---|
| `DECLARED_TOUCHERS` | `:90-201`, `:247-256` | qual **função** pode ler `observed_at`/`available_at`/`bucket_end` como `ast.Attribute` |
| `DECLARED_IMPORTERS` | `:283-329` | quem pode **importar** o módulo |
| `test_exactly_one_public_callable_…` | `:265-280` | quantas **públicas do módulo** têm anotação de retorno `AsOfReading` |

### 1.2 A forma que preserva o invariante — 4 condições, e são cumulativas

- **`C1` · mora em `as_of_accessor.py`.** Mesma superfície de revisão, mesma entrada de
  `DECLARED_TOUCHERS`. Colocá-lo em `use_cases/series_history.py` seria criar a segunda trilha
  literalmente — lá o AST-scan o acusaria, e com razão.
- **`C2` · `as_of` NÃO é removida, e continua sendo a DEFINIÇÃO.** A varredura é uma
  **reformulação algorítmica** de uma semântica que continua escrita em um lugar só. O dia em que
  `as_of` for apagada, a definição passa a ser o código otimizado — e a partir daí ninguém consegue
  provar equivalência contra nada.
- **`C3` · o portão é DIFERENCIAL, não argumentativo.** A única verificação que não exige confiar no
  meu raciocínio é: sobre um conjunto de observações, **para todo instante da grade**,
  `as_of_batch(...)[i].projection() == as_of(t=t_i, …).projection()`, **bit a bit**. `projection()`
  (`as_of_accessor.py:240-257`) já existe **exatamente para comparação canônica entre dois
  conjuntos** (`D4.6`) — o instrumento está pronto e não precisa ser inventado.
  - **⛔ E ele não vale sobre fixture sintética sozinha.** Tem de rodar sobre **fatia real de
    `md.series`**, porque os dois defeitos de §2.4/§2.5 **não existem em fixture bem-comportada** —
    foram achados no dado de produção, não no raciocínio.
- **`C4` · o teste do invariante muda, e muda APERTANDO.** Ver §1.3.

### 1.3 ⛔ O achado que muda a resposta: hoje o teste passaria **pelo motivo errado**

`test_exactly_one_public_callable_in_the_module_produces_a_reading` (`:265-280`) decide pela
**anotação de retorno**:

```python
and inspect.signature(member).return_annotation in {AsOfReading, "AsOfReading"}
…
assert producers == ["as_of"]
```

Com `from __future__ import annotations` (`as_of_accessor.py:3`) a anotação é **a string**. Uma
função nova `as_of_batch(...) -> tuple[AsOfReading, ...]` anota
`"tuple[AsOfReading, ...]"`, que **não está no conjunto** ⇒ **o teste passa sem uma linha de
alteração**.

**Isso não é aprovação; é o portão não tendo olhado.** E o repositório já nomeou essa classe, na
letra, no próprio arquivo — `DECLARED_TOUCHERS`, entrada `collectors_cli.py` (`:155-159`), sobre a
alternativa de usar `row.event_time` em vez de `row.bucket_end`:

> *"it would have kept this file out of this registry by picking a synonym, **which is a bypass of
> the gate, not a compliance with it**."*

Trocar a grafia do tipo de retorno para escapar do `assert` é **o mesmo ato**. Então:

**O teste tem de mudar, e a mudança é para MAIS apertado, nunca para acomodar.** A forma:
`producers` passa a colher toda pública do módulo cuja anotação **mencione** `AsOfReading`
(singular ou plural), e o `assert` passa a ser contra uma lista declarada — `["as_of",
"as_of_batch"]` — **com o comentário de por que a segunda não é uma segunda trilha**, no mesmo
formato que as 11 entradas de `DECLARED_TOUCHERS` já usam.

> **Como o owner confere isto sem confiar em mim** `[VERIFICÁVEL — regressão plantada]`: antes de
> aceitar a mudança do teste, plante em `as_of_accessor.py` uma terceira pública
> `-> list[AsOfReading]` que devolva qualquer coisa. Com o teste **de hoje**, a suíte fica
> **VERDE**. Com o teste **novo**, tem de ficar **VERMELHA**. Se ficar verde nos dois, a mudança
> não apertou nada e o gate é cerimônia.
>
> `[NÃO MEDIDO]` — eu **não** rodei essa plantação; escrever código está fora do escopo deste
> despacho (`handoff` §7). É trabalho do `builder`/`qa`, e é o DoD-1 da `ADR-039`.

### 1.4 O que eu NÃO aprovo, e é a forma que parece a mais natural

⛔ **Mover os predicados de admissão para fora de `as_of`** (deixar `as_of` chamar
`as_of_batch(t)[0]`, ou deixar `as_of_batch` reimplementar a conjunção). O primeiro inverte a
definição (viola `C2`); o segundo cria **duas cópias da verdade de admissão** — e duas cópias é
exatamente o que o arquivo do invariante diz que **não falha, diverge**. A forma admitida é a
inversa: **`as_of_batch` é a que existe a mais**, e é ela que responde ao diferencial.

---

## 2. Item 2 — a monotonicidade PERMITE. Mas dois pressupostos silenciosos são falsos.

### 2.1 `t` é monotônico — confirmado, e sob as duas políticas

`series_history.py:229-255`: `grid_instant` só cresce (`+= 60_000`), e
`_read_instant` (`:108-149`) é monotônica em ambos os ramos — `grid_instant` sob `INTRABAR`,
`grid_instant + 59_999` sob `FINAL_ONLY`. ⇒ `t₁ < t₂ < … < t₅₇₆₀`. **Nenhuma ressalva.**

### 2.2 O conjunto admitido é MONOTÔNICO CRESCENTE — termo a termo

`as_of_accessor.py:305-313`, os cinco conjuntos da conjunção:

| # | termo | linha | depende de `t`? | monotônico? |
|---|---|---|---|---|
| P1 | `row.series_key_id == series_key_id` | `:308` | **não** | constante |
| P2 | `row.symbol == symbol` | `:309` | **não** | constante |
| P3 | `row.observed_at <= knowledge_time` | `:310` | **não** (`knowledge_time` é fixo na requisição) | constante |
| P4 | `row.available_at <= t` | `:311` | **sim** | ✅ falso→verdadeiro, **nunca volta** |
| P5a | `row.bucket_end <= t` (`_r2_admits`, só `final_only`) | `:420` | **sim** | ✅ falso→verdadeiro, **nunca volta** |
| P5b | `row.is_final is not False` | `:420` | **não** | constante |
| P5c | `bar_policy is INTRABAR ⇒ True` | `:418-419` | **não** | constante |

**Conclusão formal:** `admitted(t₁) ⊆ admitted(t₂)` para `t₁ ≤ t₂`. **Linha só entra, nunca sai.**
⇒ `latest_bucket_end = max(bucket_end)` (`:321`) é **não-decrescente em `t`** ⇒ ponteiro único vale.

### 2.3 Os termos que eu fui mandado a checar e que **não** quebram nada

- **`bar_policy`** — `final_only`/`intrabar` não alterna dentro de uma requisição
  (`series_history.py:234` passa o mesmo valor em toda iteração). Ela muda **qual é a chave de
  ativação** (§2.4), não a monotonicidade.
- **`LOCF`/`CARRY_FORWARD_BY_NATURE`** (`:328`) — **pós-filtro sobre o vencedor já escolhido**, não
  toca o conjunto admitido. Ele **não é monotônico** (a saída vira `NO_POINT` e **volta** a ser
  valor quando um bucket novo chega), e é por isso que ele é `O(1)` por instante e **nunca** pode
  virar curto-circuito do tipo "uma vez ausente, sempre ausente".
- **`age_ms > staleness_ms`** (`:330`) — idem: pós-filtro `O(1)`, não-monotônico, mesma proibição de
  curto-circuito.
- **`observed_at <= knowledge_time`** (`:310`) — **não depende de `t`**. Este é o achado que
  sustenta a opção 2 (§3.1).
- **`_absence_for_empty`** (`:434-444`) — lê `t` contra `first_capture_at`, `O(1)`, só no ramo
  vazio.

### 2.4 ⛔ Pressuposto falso nº 1 — a chave de ativação **não** é `available_at`. E errar isso é LOOKAHEAD.

A forma óbvia da varredura é ordenar por `available_at` (é o que R-1 lê) e andar o ponteiro. **Está
errado sob `final_only`.** A ativação de uma linha é o instante em que **os dois** predicados
dependentes de `t` passam a valer:

```
ativação(r) = max(r.available_at, r.bucket_end)    sob final_only
ativação(r) =      r.available_at                  sob intrabar   (R-2 é vácuo, :418-419)
```

Isso só importa se `available_at < bucket_end` acontecer — e **acontece**, porque nada o proíbe:
`reject_clock_skew` (`provenance.py:282-300`) só limita `event_time - available_at <= tolerância`,
isto é, **tolera** `available_at` antes de `event_time` por uma folga declarada.

`[MEDIDO 2026-09-16, `deploy-postgres-1`, `BEGIN READ ONLY`, universo = `md.series` inteira, n=1.452.521]`

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
BEGIN READ ONLY;
SELECT 'rows_total', count(*)::text FROM md.series
UNION ALL SELECT 'avail_lt_bucket_end', count(*)::text FROM md.series WHERE available_at < bucket_end
UNION ALL SELECT 'obs_gt_avail',        count(*)::text FROM md.series WHERE observed_at  > available_at
UNION ALL SELECT 'event_ne_bucket',     count(*)::text FROM md.series WHERE event_time  <> bucket_end
UNION ALL SELECT 'is_final_false',      count(*)::text FROM md.series WHERE is_final IS FALSE;
COMMIT;"
```

| fato | n |
|---|---|
| linhas em `md.series` | **1.452.521** |
| **`available_at < bucket_end`** | **748** |
| `observed_at > available_at` | 54.743 |
| `event_time <> bucket_end` | **0** |
| `is_final IS FALSE` | **0** (e 69.480 `NULL`) |

E a magnitude do erro, não só a existência:

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
BEGIN READ ONLY;
SELECT left(series_key_id,8), symbol, count(*), min(available_at-bucket_end), max(available_at-bucket_end)
FROM md.series WHERE available_at < bucket_end GROUP BY 1,2 ORDER BY 3 DESC LIMIT 8;
COMMIT;"
```

```
b3d96034|BTCUSDT|126|-3481439|-1
539495b4|BTCUSDT|126|-3481439|-1
2876b82d|ETHUSDT| 95|-3481439|-1
c722a0e1|ETHUSDT| 95|-3481439|-1
593ef0aa|LINKUSDT|77|-3481439|-1
```

**`-3.481.439 ms` ≈ 58 minutos ≈ 58 instantes de grade.** `[MEDIDO 2026-09-16, n=748 linhas em ≥8
pares série×símbolo, incluindo `BTCUSDT`]`

**A direção do erro é a que custa caro.** Ordenar por `available_at` sozinho **ativa a linha CEDO
DEMAIS** ⇒ admite, sob `final_only`, um bucket que **ainda não tinha fechado em `t`** ⇒ é
**exatamente R-2 desligada**, que é a porta que `SPEC-001` §2.3 nomeia: *"Um bucket parcial responde
SIM a R-1 e NÃO a R-2 — e aí que o lookahead entrava"*. Não é lentidão nem arredondamento: é a
regeneração do defeito `D-01` (a regra anti-lookahead invertida) **por dentro de uma otimização**.

> **Como o owner confere** `[VERIFICÁVEL — fixture de mercado conhecido]`: as 748 linhas são um
> corpus REAL, já identificado por série e símbolo pelo `SELECT` acima. Congele uma janela de
> `BTCUSDT` que contenha pelo menos uma delas como fixture de regressão e rode o diferencial `C3`.
> A varredura ingênua (chave = `available_at`) **tem de divergir** de `as_of` nessa janela; a
> correta (chave = `max`) tem de bater bit a bit. **Fixture que não diverge com a versão ingênua
> não está exercitando o defeito** e não serve de prova.

### 2.5 ⛔ Pressuposto falso nº 2 — o vencedor DENTRO do bucket pode ser revisado **para trás**

Passo 5 de `as_of` (`:322-325`) é `argmin(observed_at, source, ingested_at)` **restrito às linhas do
`latest_bucket_end`**. A tentação da varredura é *"a primeira linha do bucket a ativar é a
vencedora"*. **Falso:** uma linha do MESMO bucket pode ativar **depois** (ela tem
`max(available_at,bucket_end)` maior) e ainda assim ter chave de ordem **menor**, porque
`observed_at` e `available_at` **não são co-monotônicos** (54.743 linhas com
`observed_at > available_at`, §2.4 — carimbo `MODELED` de `ADR-038` mora aí).

`[MEDIDO 2026-09-16, `BEGIN READ ONLY`, universo = `md.series` inteira]`

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
BEGIN READ ONLY;
WITH b AS (SELECT series_key_id,symbol,bucket_end FROM md.series GROUP BY 1,2,3 HAVING count(*)>1),
     p AS (SELECT r1.series_key_id,r1.symbol,r1.bucket_end
           FROM md.series r1 JOIN md.series r2
             ON r1.series_key_id=r2.series_key_id AND r1.symbol=r2.symbol AND r1.bucket_end=r2.bucket_end
            AND (r1.source,r1.observed_at)<>(r2.source,r2.observed_at)
           WHERE greatest(r1.available_at,r1.bucket_end) < greatest(r2.available_at,r2.bucket_end)
             AND (r2.observed_at,r2.source,r2.ingested_at) < (r1.observed_at,r1.source,r1.ingested_at))
SELECT 'multi_row_buckets', count(*)::text FROM b
UNION ALL SELECT 'buckets_com_vencedor_revisado_para_tras', count(DISTINCT (series_key_id,symbol,bucket_end))::text FROM p;
COMMIT;"
```

| fato | n |
|---|---|
| buckets com mais de uma linha | **147.802** |
| **buckets onde uma linha que ativa DEPOIS tem chave de ordem MENOR** | **7.600** (**5,1%**) |

⇒ A varredura **tem de manter um mínimo corrente por `bucket_end`**, re-minimizado a cada ativação —
não *"a primeira que ativou"*. Custo: `O(1)` por ativação, `O(n)` no total. **Não é caro; é fácil de
esquecer.** E o erro dele é silencioso: devolve a observação **errada** do bucket **certo**, o que
`D4.13` (*"a PRIMEIRA, nunca a última, nunca a definitiva"*) existe para impedir.

### 2.6 A forma admitida da varredura, enunciada como contrato (não como código)

1. **ordenar** as observações por `ativação(r)` (§2.4), com a chave **dependente de `bar_policy``;
2. ponteiro único; a cada `tᵢ` da grade, absorver toda linha com `ativação ≤ tᵢ`;
3. ao absorver: atualizar `max_bucket_end` corrente **e** o mínimo corrente de
   `best[bucket_end]` pela chave `_first_observation_order` (`:423-431`);
4. a cada `tᵢ`: vencedor = `best[max_bucket_end]`; se não há nada absorvido → `_absence_for_empty`;
5. aplicar os **dois pós-filtros `O(1)`** (`:328`, `:330`) **sem curto-circuito** (§2.3).

Custo: `O(n log n + m)` com `n` = linhas, `m` = instantes de grade.
`[NÃO MEDIDO]` — o ganho de 17,2 s → "< 1 s" que o `handoff` §6 projeta é **estimativa dele, não
medição minha**; o número real só existe depois que o `builder` construir. O que está **medido** é o
custo atual (§ `handoff` tabela, 475 M de avaliações).

### 2.7 ⚠️ A ordenação mora no `domain`, **não** no `ORDER BY` do reader

`postgres_series_window_reader.py:42` **não tem `ORDER BY`**, e **não deve ganhar um para isto**.
Motivo, e é o mesmo do item 3: se a correção de uma função de `domain` passar a depender da ordem
que uma **string SQL** em `infra` produz, a premissa fica num lugar que **o guarda estruturalmente
não enxerga** — o próprio `test_as_of_is_the_single_reader.py:104-107` declara isso sobre
`read_promoted`: *"`ast.Attribute` cannot see inside a string, and there is nothing to declare"*.
Um `sorted()` em Python sobre 36.179 linhas é C nativo e desaparece ao lado dos 208 M de predicados
que a varredura elimina.

---

## 3. Item 3 — a opção 2 é segura **em uma** das duas formas, e a outra é a premissa não declarada

### 3.1 Forma `2A` — **ADMITIDA**, e é teorema, não premissa

**O caso de uso (ou o próprio acessor-lote) aplica ele mesmo, UMA vez, fora do laço, os três
predicados que não dependem de `t`** — `P1`, `P2`, `P3` — e `as_of` **continua com os cinco no
corpo**.

**Por que é seguro sem premissa nenhuma sobre o reader:** `P1∧P2∧P3` são **constantes em `t`**
(§2.2). Uma linha que os reprova é reprovada por `as_of` **em todo instante da grade**. Remover
antes do laço remove **exatamente** o conjunto que a função rejeitaria de qualquer forma ⇒ a saída
é **bit-idêntica por construção**, e a prova é o mesmo diferencial `C3`.

⚠️ **Mas o ganho não é o que o `handoff` §6 estima.** Ele credita ~40% a *"tirar os 2 predicados
tautológicos"* — e tautológicos eles são: removê-los **não elimina uma linha** (o `SELECT` já
filtrou), só deixa de **avaliar** a comparação. O ganho real de `2A` vem de duas coisas diferentes:
(a) `P3` (`observed_at <= knowledge_time`) **elimina linhas de verdade**, e (b) a comprehension
passa a avaliar 2 predicados por linha em vez de 5. `[NÃO MEDIDO]` — eu não medi a repartição entre
(a) e (b); quem construir tem de medir antes de citar os 40%.

### 3.2 ⛔ Forma `2B` — **RECUSADA**. É a premissa não declarada, e ela tem nome.

**Remover `P1`/`P2` de dentro de `as_of` porque *"o SQL em `postgres_series_window_reader.py:42` já
filtrou os dois"*.** Recuso, por dois motivos independentes — qualquer um basta:

1. **É acoplamento reader↔`as_of`, e ele é invisível ao guarda.** A garantia passaria a morar numa
   string SQL de `infra`. Um `as_of` correto e um reader correto **isoladamente** produzem leitura
   errada juntos, e nenhum teste de nenhum dos dois reprova. Pior: `as_of` é **pura e recebe uma
   `Sequence`** de propósito (`:297-299`) — qualquer chamador futuro (backtest, fixture, motor
   event-driven) que monte a lista **sem** passar por aquele `SELECT` herda a leitura errada **em
   silêncio**.
2. **`P1`/`P2` não são performance; são a guarda de solda `q`/`nq`.** O passo 2 do docstring
   (`:283-286`) é literal: *"this filter is what makes `SPEC-001` §5.1 class (c) **impossible**
   rather than merely discouraged"*, porque `quantity_field` é **termo da chave** (`ADR-001`).
   Removê-los rebaixa "impossível" para "o chamador tomou cuidado". Isso é uma mudança de
   **contrato de domínio** travestida de otimização — e é a única superfície deste laudo onde eu
   diria que o ganho não paga o preço **mesmo que fosse 100%**.

**Em uma linha:** a opção 2 é segura **como pré-filtro que ADICIONA** (`2A`), nunca como predicado
que **SUBTRAI** de `as_of` (`2B`).

### 3.3 E o mesmo raciocínio se aplica à opção 3

O acessor-lote **também** tem de manter `P1`/`P2` na sua própria passada de admissão. Ele os avalia
**uma vez por linha** (`O(n)`) em vez de uma vez por linha por instante de grade (`O(n·m)`) — o
ganho vem de **quantas vezes**, não de **remover**. Essa distinção é a fronteira inteira entre
otimizar e afrouxar.

---

## 4. Item 4 — `ADR-039`, nova. E por que não é extensão.

`[MEDIDO 2026-09-16]` `ls docs/adr | grep -cE '^ADR-0'` → **38**; a maior é
`ADR-038-carimbo-modeled-…`; `grep -rn 'ADR-039' docs` → **nenhuma linha**. ⇒ **`ADR-039` está
livre.**

**Título proposto:**
`ADR-039-acessor-em-lote-a-monotonicidade-da-admissao-e-a-chave-de-ativacao.md`

**Por que NÃO estende nenhuma existente:**

| ADR | de que ela é dona | por que não cabe |
|---|---|---|
| `ADR-006` | as duas lentes de `staleness` | esta decisão **não amenda** a semântica — ela se obriga a ser **bit-idêntica** a ela |
| `ADR-034/D9` | rotas, schema e a coluna de valor | dona do `SELECT` de janela, **não** de quantas vezes o acessor é chamado |
| `ADR-037` | `bucket_interval_ms` = grade nativa | um parâmetro, não a trilha de leitura |
| `ADR-038` | carimbo `MODELED`, `observed_at` como 2ª barreira | **vizinha e citada** (é dela que vêm as 54.743 linhas de §2.5), mas ela decide **escrita**; esta decide **leitura em lote** |

**Os `D` que a `ADR-039` precisa fixar** (e cada um já está argumentado acima):

- **`D1`** — o acessor-lote é **segunda porta do mesmo acessor**, sob `C1`–`C4` (§1.2).
  `as_of` permanece a **definição**; a varredura é reformulação algorítmica.
- **`D2`** — **`ativação(r) = max(available_at, bucket_end)` sob `final_only`; `available_at` sob
  `intrabar`.** Com o número `748`/`-3.481.439 ms` transcrito, porque a versão ingênua **é
  lookahead** (§2.4).
- **`D3`** — **mínimo corrente por `bucket_end`, re-minimizado a cada ativação.** Com o número
  `7.600` de `147.802` (§2.5).
- **`D4`** — pós-filtros de `LOCF`/`staleness` são `O(1)` por instante e **proibidos de
  curto-circuitar** (§2.3).
- **`D5`** — a ordenação mora no `domain`; **`ORDER BY` no reader é vetado** como fonte de garantia
  (§2.7).
- **`D6`** — pré-filtro `2A` admitido; **`2B` vetado** — `P1`/`P2` são a guarda de solda `q`/`nq`
  (§3.2).
- **`DoD-1`** — o teste do invariante muda **apertando**, e o falsificador é a pública plantada
  (§1.3): **verde com o teste de hoje, vermelha com o novo**.
- **`DoD-2`** — diferencial `C3` bit a bit contra `as_of` sobre **fatia real de `md.series`** que
  contenha **pelo menos uma** das 748 linhas de `D2` e **um** dos 7.600 buckets de `D3`.
  ⛔ **Diferencial que só roda em fixture sintética não vale** — os dois defeitos não aparecem lá.

---

## 5. O que eu NÃO julgo, declarado

- **Opção 1 (subir workers)** — `handoff` §6 a mantém como ajuste que vale por si, e eu concordo
  que ela é **ortogonal** a esta decisão (uma corta o trabalho por requisição, a outra o
  paralelismo entre requisições). Mas a confirmação de que **a API não escreve** (`ADR-009/D3`) é
  de `infra-architect`, **não minha**.
- **Granian** — `handoff` §5 já mede o custo (`D5.13` e os ~8 testes que sobem `uvicorn.Server` numa
  thread). Decisão de infra + owner.
- **Opção 4 (cache)** — `handoff` §6 já diz o que eu diria: *"esconde o custo, não conserta"*.
  Depois da opção 3, ela deixa de ser necessária para este sintoma.

## 6. Rótulos, em bloco, para quem for auditar

| afirmação | rótulo |
|---|---|
| `t` monotônico; `admitted(t)` monotônico crescente; `max(bucket_end)` não-decrescente | `[DOC]` — derivado dos termos em `as_of_accessor.py:305-313` e `series_history.py:229-255`, citados linha a linha |
| `748` linhas com `available_at < bucket_end`, mín. `-3.481.439 ms`, n=1.452.521 | `[MEDIDO 2026-09-16, `BEGIN READ ONLY`, comando em §2.4]` |
| `7.600` de `147.802` buckets com vencedor revisado para trás | `[MEDIDO 2026-09-16, `BEGIN READ ONLY`, comando em §2.5]` |
| `ADR-039` livre | `[MEDIDO 2026-09-16: `ls docs/adr \| grep -cE '^ADR-0'` → 38; `grep -rn ADR-039 docs` → 0 linhas]` |
| o teste de hoje passa para `-> tuple[AsOfReading, ...]` | `[INFERRED: `from __future__ import annotations` torna a anotação string; `"tuple[AsOfReading, ...]" ∉ {AsOfReading, "AsOfReading"}`]` — **`[NÃO MEDIDO]`: não executei a plantação; é o `DoD-1`** |
| ganho "17,2 s → < 1 s" | `[NÃO MEDIDO]` — estimativa do `handoff` §6, não medição minha |
| repartição do ganho da opção `2A` entre `P3` e a contagem de predicados | `[NÃO MEDIDO]` — quem construir mede antes de citar os 40% |
| `2B` é acoplamento não declarado; `P1`/`P2` são guarda de solda | `[DOC: as_of_accessor.py:283-286` + `ADR-001` + `SPEC-001` §5.1 classe (c)]` |
