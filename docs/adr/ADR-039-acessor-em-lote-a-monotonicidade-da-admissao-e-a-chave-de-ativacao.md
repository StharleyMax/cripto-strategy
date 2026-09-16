# ADR-039 — O acessor em LOTE é segunda porta do mesmo acessor; a admissão é monotônica; e a chave de ativação **não** é `available_at`

**Status:** `PROPOSTA` — **DRAFT**. Nasce DRAFT por construção: `approve`/`SPEC_APPROVED` é ato do
**owner**. Nada foi escrito no ledger por esta sessão.

**Feature:** `cinco-metricas-do-core` · **Componente:** `sentimento` · **Data:** 2026-09-16
**Origem:** pendência `A11` — a latência de `/symbol`, medida até a causa em
[`handoff/A11-LATENCIA-DE-SYMBOL.md`](../context/cinco-metricas-do-core/handoff/A11-LATENCIA-DE-SYMBOL.md).
**Decisão de arquitetura:** `/quant-architect`, laudo em
[`gates/A11-OPCAO-3-VARREDURA-UNICA-quant-architect.md`](../context/cinco-metricas-do-core/gates/A11-OPCAO-3-VARREDURA-UNICA-quant-architect.md).
**Autorização do owner:** `[PREMISSA-OWNER, 2026-09-16]` — *"ok, podemos seguir com a 3"*.
**Relação:** **não amenda** `ADR-006` (obriga-se a ser bit-idêntica a ela) · usa o `projection()`
de `D4.6` como instrumento · cita `ADR-038` como origem do dado de `D3` · **não** toca
`ADR-034/D9`, dona do `SELECT` de janela.

---

## 1 · O problema, em números medidos

`backend/src/modules/sentimento/use_cases/series_history.py:229-255` chama `as_of` **uma vez por
instante de grade**, e `domain/as_of_accessor.py:305-313` reconstrói uma list comprehension sobre
**todas** as linhas da janela a cada chamada.

| medida | valor | comando |
|---|---|---|
| `SELECT` de janela | **9,078 ms**, Bitmap Index Scan, 10.047 linhas | `EXPLAIN (ANALYZE, BUFFERS)` |
| resposta HTTP correspondente | **17,250 s** | `curl -w '%{time_total}'` |
| ⇒ fração do tempo que é Python | **99,95%** | as duas acima |
| linhas na série mais pesada (4 dias) | **36.179** (6,3 por bucket — revisões) | `GROUP BY series_key_id` |
| avaliações de predicado num painel | **208.391.040** (`5.760 × 36.179`) | aritmética sobre as duas acima |
| na página inteira | **≈ 475 milhões** | idem, 4 séries |
| `/symbol` ponta a ponta | **3 de 3 estouram `300 s`**, `ttfb=0`, 0 bytes | `curl --max-time 300` ×3 |

⭐ **O falsificador que exclui I/O, serialização e banco sem supor nada do interior do código:**
encolhendo a janela, o corpo cresce **exatamente linear** (`71` → `142` → `285` → `570` KB) enquanto
o tempo cresce **~5,5× por duplicação** (`0,098` → `0,558` → `3,174` → `17,250 s`). Saída linear com
tempo superquadrático só acontece quando o custo está no **cálculo por ponto**.

`[MEDIDO 2026-09-16, `deploy-postgres-1` SOMENTE LEITURA, nenhuma semeadura]`

---

## 2 · As decisões

### `D1` — o acessor-lote é **segunda porta do mesmo acessor**, não um segundo acessor

`as_of_batch` responde `N` instantes de grade numa passada. Ele é admitido sob **quatro condições
cumulativas**, e nenhuma é negociável:

- **`C1`** — mora em `as_of_accessor.py`. Mesma superfície de revisão, mesma entrada de
  `DECLARED_TOUCHERS`. Em `use_cases/` o AST-scan o acusaria, **e com razão**.
- **`C2`** — `as_of` **não é removida e continua sendo a DEFINIÇÃO**. A varredura é reformulação
  algorítmica de uma semântica que segue escrita num lugar só. ⛔ No dia em que `as_of` for apagada,
  a definição vira o código otimizado, e a partir daí **ninguém consegue provar equivalência contra
  nada**.
- **`C3`** — o portão é **diferencial, não argumentativo**: para todo instante da grade,
  `as_of_batch(...)[i].projection() == as_of(t=tᵢ, …).projection()`, **bit a bit**. `projection()`
  (`as_of_accessor.py:240-257`) existe exatamente para comparação canônica (`D4.6`) — o instrumento
  já está pronto.
- **`C4`** — o teste do invariante muda, e muda **apertando** (ver `DoD-1`).

⛔ **A forma que NÃO é admitida, e é a que parece mais natural:** deixar `as_of` virar
`as_of_batch(t)[0]` (inverte a definição, viola `C2`), ou deixar `as_of_batch` reimplementar a
conjunção de admissão (cria **duas cópias da verdade**, que é o que o arquivo do invariante diz que
*não falha, diverge*). **`as_of_batch` é a que existe a mais**, e é ela que responde ao diferencial.

### `D2` — `ativação(r) = max(available_at, bucket_end)` sob `final_only`; `available_at` sob `intrabar`

⛔ **A versão ingênua — ordenar por `available_at` — é LOOKAHEAD, e o dado prova.**

```sql
SELECT count(*) FILTER (WHERE available_at < bucket_end), min(available_at - bucket_end) FROM md.series;
-- 748  |  -3481439
```

**`748` linhas de `1.452.975`** têm `available_at < bucket_end`, a pior por **−3.481.439 ms ≈ 58
grades**. Ordenar por `available_at` deixaria uma linha ficar admissível **antes de o bucket dela
fechar**, mudando qual linha vence. `[MEDIDO 2026-09-16, `BEGIN READ ONLY`, verificado de forma
independente pelo orquestrador depois do laudo]`

⚠️ **O que estas 748 linhas NÃO são, e a distinção importa:** são **todas** de
`/fapi/v1/premiumIndex` (`availability_source=OBSERVED`), e **zero** tocam qualquer outra série
(`count(*) … WHERE series_key_id IN (SELECT … WHERE source <> '/fapi/v1/premiumIndex')` → **`0`**).
É a forma estrutural de uma série de **snapshot** atribuída a um bucket que fecha à frente — **não**
é incidente de coletor nem dado podre. A decisão de `D2` vale de qualquer modo; o que muda é que
**não há nada a consertar na ingestão** por causa dela.

### `D3` — mínimo corrente por `bucket_end`, re-minimizado a cada ativação

O vencedor **dentro** do bucket pode ser revisado **para trás**: em **`7.600` de `147.802`** buckets
multi-linha, uma linha que ativa depois vence pela chave `_first_observation_order`
(`as_of_accessor.py:423-431`). ⇒ manter o **mínimo corrente por `bucket_end`**, nunca *"a primeira
que ativou"*. (Origem do dado: `ADR-038`, que decide **escrita**; esta decide **leitura em lote**.)

### `D4` — os pós-filtros de LOCF/staleness são `O(1)` e **proibidos de curto-circuitar**

`as_of_accessor.py:328` e `:330`. Eles **não** são monotônicos em `t`, então não podem participar da
poda da varredura — aplicam-se por instante, depois de escolhido o vencedor.

### `D5` — a ordenação mora no `domain`; **`ORDER BY` no reader é vetado** como fonte de garantia

`postgres_series_window_reader.py:42` não tem `ORDER BY` e **não ganha um para isto**. Se a correção
de uma função de `domain` passasse a depender da ordem que uma **string SQL** em `infra` produz, a
premissa ficaria onde o guarda **estruturalmente não enxerga** — `test_as_of_is_the_single_reader.py:104-107`
já declara isso: *"`ast.Attribute` cannot see inside a string, and there is nothing to declare"*.
Um `sorted()` sobre 36.179 linhas é C nativo e desaparece ao lado dos 208 M de predicados eliminados.

### `D6` — pré-filtro `2A` admitido; **`2B` vetado**

**`2A`** (o *caller* aplica os predicados constantes em `t` uma vez fora do laço, e `as_of` mantém
os cinco) é **teorema**, não premissa. **`2B`** (remover `series_key_id`/`symbol` de dentro de
`as_of` "porque o SQL já filtrou") é **vetado**: esses dois predicados são a **guarda de solda**
`q`/`nq` (`as_of_accessor.py:283-286`), não performance, e o acoplamento reader↔`as_of` seria
invisível ao guarda AST.

⛔ **Este veto corrige uma proposta do próprio orquestrador**, registrada em `handoff` §6 opção 2.

---

## 3 · O contrato da varredura, enunciado como contrato e não como código

1. **ordenar** as observações por `ativação(r)` (`D2`), chave **dependente de `bar_policy`**;
2. ponteiro único; a cada `tᵢ` da grade, absorver toda linha com `ativação ≤ tᵢ`;
3. ao absorver: atualizar `max_bucket_end` corrente **e** o mínimo corrente de `best[bucket_end]`
   pela chave `_first_observation_order`;
4. a cada `tᵢ`: vencedor = `best[max_bucket_end]`; nada absorvido → `_absence_for_empty`;
5. aplicar os dois pós-filtros `O(1)` **sem curto-circuito** (`D4`).

Custo: **`O(n log n + m)`**, `n` = linhas, `m` = instantes de grade.

⚠️ `[NÃO MEDIDO]` — o ganho *"17,2 s → < 1 s"* projetado em `handoff` §6 é **estimativa do
orquestrador, não medição**. O número real só existe depois da construção. O que está **medido** é o
custo atual.

---

## 4 · DoD — e os dois são falsificadores, não checklists

### `DoD-1` — o teste do invariante muda **apertando**, provado por regressão plantada

⛔ **Hoje o portão passaria pelo motivo errado.**
`test_exactly_one_public_callable_in_the_module_produces_a_reading` decide pela **anotação de
retorno** (`in {AsOfReading, "AsOfReading"}`). Com `from __future__ import annotations`
(`as_of_accessor.py:3`) a anotação é **string**: `as_of_batch(...) -> tuple[AsOfReading, ...]` anota
`"tuple[AsOfReading, ...]"`, que **não está no conjunto** ⇒ **passaria sem uma linha alterada**.

**Isso não é aprovação; é o portão não tendo olhado** — a mesma classe de `rc=0` ambíguo que
`ADR-012` nomeia. E o repositório já nomeou este ato na letra, em `DECLARED_TOUCHERS`, entrada
`collectors_cli.py`: *"it would have kept this file out of this registry by picking a synonym,
**which is a bypass of the gate, not a compliance with it**"*.

**A mudança:** `producers` colhe toda pública cujo tipo de retorno **mencione** `AsOfReading`
(singular ou plural), e o `assert` passa a ser contra lista declarada — `["as_of", "as_of_batch"]` —
com o comentário de por que a segunda **não** é uma segunda trilha, no formato das 11 entradas de
`DECLARED_TOUCHERS`.

> **O falsificador, e ele é obrigatório:** plantar em `as_of_accessor.py` uma terceira pública
> `-> list[AsOfReading]` que devolva qualquer coisa. Com o teste de **hoje** a suíte fica **VERDE**;
> com o teste **novo** tem de ficar **VERMELHA**. **Se ficar verde nos dois, a mudança não apertou
> nada e o portão é cerimônia.** Rodar **antes** de escrever `as_of_batch`.

### `DoD-2` — diferencial `C3` bit a bit, sobre **fatia real** de `md.series`

`as_of_batch(...)[i].projection() == as_of(t=tᵢ, …).projection()` para todo instante da grade.

⛔ **Diferencial que só roda em fixture sintética NÃO VALE.** A fatia real tem de conter **pelo
menos uma** das 748 linhas de `D2` e **um** dos 7.600 buckets de `D3` — os dois defeitos **não
existem em fixture bem-comportada**; foram achados no dado de produção, não no raciocínio.

⛔ **Postgres SOMENTE LEITURA para obter a fatia.** Nenhuma semeadura, em nenhuma hipótese.

---

## 5 · O que esta ADR **não** decide

- **Workers / Granian** — é `/infra-architect`, laudo em
  [`gates/A11-infra-architect.md`](../context/cinco-metricas-do-core/gates/A11-infra-architect.md):
  workers **crash-loopam** hoje (`uvicorn/main.py:603-607` com app-objeto), Granian **recusado**
  (trocaria os 0,05% do tempo que não é Python da aplicação, ao custo de 33 chamadas em 16
  arquivos), e `B12` é **portão** dos workers, não sequela.
- **A ordem de execução** — `3 → medir → B12 → workers=2 só se ainda fizer falta`, com o critério
  do `/infra-architect`: **se 4 concorrentes com 1 worker fecharem em < 3 s, não subir workers.**
- **Se o ganho projetado se confirma** — `[NÃO MEDIDO]` até a construção (§3).
