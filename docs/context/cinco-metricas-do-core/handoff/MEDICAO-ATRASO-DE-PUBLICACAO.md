# Medição do atraso de publicação por endpoint — a pré-condição de `D16`/`E1`

**O que esta medição é:** a pré-condição declarada de `D16` (owner, 2026-09-11 — `E1` opção 2),
literal na tabela de `OPCOES-E1-E5.md`: *"exige atraso **medido** por endpoint antes de qualquer
linha (`SPEC-001` §5.2 proíbe `event_time + interval`, o default **361× otimista**)"*.

**O que ela NÃO é:** o caminho de escrita do backfill **não foi tocado**. Nenhuma linha de
`md.series` foi escrita, nenhum seed, nenhum `UPDATE` — Postgres foi lido e só. O carimbo
`availability_source = MODELED` continua com **0 linhas** de `159.984`, exatamente como antes.

Artefato entregue: [`backend/src/modules/sentimento/domain/publication_lag_table.py`](../../../../backend/src/modules/sentimento/domain/publication_lag_table.py)
(o valor, como código versionado) e
[`backend/tests/sentimento/test_publication_lag_table.py`](../../../../backend/tests/sentimento/test_publication_lag_table.py)
(a evidência bruta e os falsificadores).

---

## 1 · O valor, por endpoint

`[MEDIDO 2026-09-11T19:4xZ, contra `deploy-postgres-1` (up 3 d), somente leitura]`

| endpoint | `p99` do atraso | `n` | mín | mediana | `p95` | máx | janela |
|---|---|---|---|---|---|---|---|
| `/fapi/v1/klines` | **59.361 ms** | 4.079 | 1.353 | 30.979 | 56.999 | 59.999 | 17,9 h (1 dia) |
| `/fapi/v1/premiumIndex` | **1.758 ms** | 34.752 | −100 | 968 | 1.625 | 1.895 | 72,9 h (4 dias) |

Janela **congelada** em `bucket_end < 1789155360000` (2026-09-11 19:36:00 UTC) para que os
números reproduzam depois que o coletor continuar rodando.

```bash
docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2),
     live as (select s.* from md.series s
                join g on g.series_key_id = s.series_key_id
                      and g.available_at = s.available_at and g.nb = 1
               where s.bucket_end < 1789155360000)
select source, count(*) n, min(bucket_end), max(bucket_end),
       min(available_at-bucket_end),
       percentile_disc(0.50) within group (order by available_at-bucket_end),
       percentile_disc(0.95) within group (order by available_at-bucket_end),
       percentile_disc(0.99) within group (order by available_at-bucket_end),
       max(available_at-bucket_end)
  from live group by 1 order by 1;"
# /fapi/v1/klines       | 4079  | ... | 1353 | 30979 | 56999 | 59361 | 59999
# /fapi/v1/premiumIndex | 34752 | ... | -100 |   968 |  1625 |  1758 |  1895
```

### ⚠️ O recorte da task tinha um filtro CIRCULAR, e ele foi trocado

A consulta que a task trouxe separa ao vivo de backfill por `available_at - bucket_end <=
300000`. Isso **usa a grandeza medida para definir a população sobre a qual ela é medida**, e
trunca justamente a cauda que o `p99` lê. E não separa nada: o histograma de atraso de
`md.series` **não tem vão em 300 s** — `24` linhas em `180–300 s`, `60` em `300–600 s`, `600` em
`10–60 min`, `16.560` em `1–24 h` — é uma rampa contínua, que é como aparece uma história
contígua importada de uma vez.

O separador **não circular** usado no lugar é o **fan-out** de um mesmo instante `available_at`
sobre um mesmo `series_key_id`: uma poll ao vivo revela **um** bucket novo; uma requisição de
backfill carimba o mesmo instante em todos os buckets que devolveu.

```bash
# ... select s.source, g.nb, count(*) from md.series s join g on ... group by 1,2
# /fapi/v1/klines        nb=1 -> 4.075   nb=2 -> 210   nb=1079/1080/1500 -> 120.951
# /fapi/v1/premiumIndex  nb=1 -> 34.752  (não existe outro fan-out: este endpoint não tem
#                                         caminho de history, logo 100% das linhas são ao vivo)
```

⇒ `nb = 1` descarta as **120.951** linhas de backfill **sem olhar o atraso**. O meio ambíguo
(`nb = 2`, 210 linhas) é **excluído**, não chutado.

O número do "insumo conhecido" da task (klines `min 0 s / max 279 s`) vinha do filtro circular e
**não se reproduz**: sob o separador de fan-out, o máximo ao vivo de klines é `59.999 ms` e o
mínimo é `1.353 ms`.

---

## 2 · As três perguntas

### Q1 · Qual estatística vira o modelo — `p50`, `p95`, `p99` ou `max`? → **`p99`**

**Não era escolha livre.** `SPEC-001` §5.2 já fixa a estatística dentro da fórmula que escreve
por extenso:

```
available_at_MODELED = próximo ponto da grade nativa
                       >= ( bucket_end + p99_lag(endpoint, observer_region) + margem )
```

e `availability_lag_stats.LAG_STAT_NAME` já carrega `"p99"` como constante nomeada, por um
motivo **medido**: `PRD-001` §5.1 — média e mediana são *"otimistas em metade dos casos"*, e
errar o rótulo por um bucket **inverte o sinal do ΔOI de 15 min em 21,96% das janelas
(n=8.629)**. `available_at` otimista **é** lookahead, que é o defeito que `D16` existe para não
cometer.

**Contra `max`, com número:** klines tem `max = 59.999` contra `p99 = 59.361` — **638 ms**,
**1,06%** — e `max` fica refém de **uma** poll travada. Como `SPEC-001` arredonda **para cima**
até o próximo ponto da grade nativa (60 s, medida abaixo), `59.361` e `59.999` caem **no mesmo
ponto**: `bucket_end + 60 s`. Pagar o refém para não ganhar nada é o argumento inteiro.

**A grade nativa, medida** (`lag(bucket_end)` por `series_key_id`, sobre o conjunto ao vivo):
klines `60.000 ms` em `3.963` de `4.075` passos (o resto são lacunas de `120/180/240 s`);
`premiumIndex` `60.000 ± 1.000 ms`. ⇒ **60 s nos dois.**

### Q2 · O atraso é estável, ou deriva? → **estável; não há tendência**

`p99` por hora (horas com `n >= 100`), comparando a **primeira metade** da série com a
**segunda** — o teste mais barato que separa deriva de ruído:

| endpoint | horas | 1ª metade | 2ª metade | diferença |
|---|---|---|---|---|
| `/fapi/v1/premiumIndex` | 74 | 1.767,1 ms | 1.764,8 ms | **0,13%** |
| `/fapi/v1/klines` | 17 (sem a hora truncada) | 59.228,9 ms | 59.306,9 ms | **0,13%** |

**A amplitude horária é larga em `premiumIndex` (`1.521`..`1.895`, `21,1%`) e isso é RUÍDO DE
AMOSTRAGEM, não deriva — e a prova é que ela ENCOLHE quando `n` cresce**, coisa que deriva não
faz: a `n ≈ 480/hora` o `p99` é a ~5ª maior leitura da hora e oscila `21,1%`; a `n ≈ 11.400/dia`
os quatro `p99` diários são `1.793 / 1.753 / 1.740 / 1.809` ms — **69 ms, 3,9%**, com o sinal da
variação alternando.

⚠️ **Limitação declarada:** klines só tem **17,9 h** ao vivo (o coletor dele começou em
2026-09-11), então a resposta hora-a-hora vale e a **dia-a-dia ainda não existe** para esse
endpoint. Isso está escrito no docstring do módulo, não escondido.

### Q3 · É por endpoint ou por símbolo? → **por ENDPOINT**

`p99` por símbolo, mesma janela (`n ≈ 1.020` e `≈ 8.688` por símbolo):

| endpoint | BTCUSDT | ETHUSDT | LINKUSDT | SOLUSDT | amplitude |
|---|---|---|---|---|---|
| `/fapi/v1/klines` | 59.248 | 59.430 | 59.531 | 59.361 | 283 ms (**0,48%**) |
| `/fapi/v1/premiumIndex` | 1.740 | 1.758 | 1.774 | 1.774 | 34 ms (**1,93%**) |

Nos dois casos a dispersão entre símbolos é **menor que o ruído hora-a-hora do próprio
endpoint** (`1,4%` e `21,1%`). Uma tabela por símbolo estaria ajustando ruído — e deveria uma
remedição a cada símbolo novo do universo. **Um valor por endpoint não mente para nenhum dos 4
símbolos medidos.**

---

## 3 · A ressalva que todo consumidor tem de carregar

`available_at` em `md.series` é **o instante em que o NOSSO coletor pôde saber** — que é o que
`SPEC-001` §2.2 define. Logo o número medido é `atraso de publicação + a fase da nossa própria
poll`, e **em klines a fase é quase tudo**.

**A evidência é o formato:** o atraso de klines é quase uniforme em `[1.353, 59.999]` ms, com
média `30.944` e desvio-padrão `16.687` ms — e `60.000 / √12 = 17.321`. É a assinatura de uma
fase uniforme sobre um período de poll de 60 s somada a uma constante pequena.

⇒ `lag_min_ms` é o limite superior mais apertado do atraso **do endpoint** (`1.353 ms` para
klines), e `poll_phase_share = (p99 − min) / poll_resolution` reporta quanto do `p99` é a nossa
amostragem: **96,7% em klines**, **3,1% em `premiumIndex`**.

**Usar o atraso de observador mesmo assim é o ponto, não desleixo:** uma linha MODELED de
backfill tem de afirmar exatamente o que o **nosso caminho ao vivo** teria sabido no mesmo
bucket — senão ela fica **mais otimista que a nossa própria captura**, que é lookahead medido
contra nós mesmos. Errar tarde é a direção que `SPEC-001` §5.2 manda ("o erro é sempre
pessimista").

**`premiumIndex` é o regime oposto, e o `min = −100 ms` merece nome:** aquele coletor amostra
**no** ponto da grade em vez de depois do fechamento do bucket, então **424 de 34.752 linhas
(1,22%)** carregam `available_at` algumas dezenas de ms **antes** de `bucket_end`. Negativo é
**registrado, não clampado** — clampar esconderia um fato real de escalonamento atrás de um zero.

---

## 4 · O teste que reprova quem trocar o número sem remedir

O número **não é asserido, é RECOMPUTADO**. Cada endpoint carrega no teste a **cauda superior
medida**: as `k` maiores leituras da janela congelada, com `k = n − ceil(0,99·n) + 1` — que é
exatamente a fatia que um `p99` de rank-mais-próximo lê (klines `k = 41`, `premiumIndex`
`k = 348`). O teste reconstrói uma amostra do comprimento real `sample_n` cuja cauda é esse dado
e roda `availability_lag_stats.p99` — o percentil do próprio repositório, não uma segunda
implementação.

**Mutações rodadas** (`make test-fast K=publication_lag`, 41 testes):

⚠️ **Contagem corrigida em 2026-09-11.** A tabela abaixo (e o corpo do commit `43e726b`, que a
história não reescreve) declarava **3** e **2**; o QA remediu e achou **4** e **3**
`[MEDIDO 2026-09-11, `make test-fast K=publication_lag`, `docs/context/cinco-metricas-do-core/gates/QA-D16-atraso-de-publicacao.md` §4]`.
O erro é **para baixo** — o falsificador é mais forte que o anunciado —, mas número que não
reproduz é defeito de evidência do mesmo jeito.

| mutação | declarado em `43e726b` | **medido (vale este)** |
|---|---|---|
| `lag_p99_ms` de klines `59_361 → 59_000` | 3 reprovam | **4 reprovam** (`forged_p99`, `recomputed[klines]`, `tail_slice[klines]`, `per_symbol_range[klines]`) |
| `lag_p99_ms` de `premiumIndex` `1_758 → 1_800` | 2 reprovam | **3 reprovam** (`recomputed`, `tail_slice`, `per_symbol_range` — `premiumIndex`) |
| constante **e** cabeça da cauda, juntas, `59_361 → 59_000` | 2 reprovam (`p99` fora da faixa por símbolo) | `[NÃO REMEDIDO — o QA não repetiu esta mutação; o número da coluna à esquerda é o único que existe]` |
| nenhuma | 41 passam | ⚠️ a suíte cresceu desde então; o denominador de hoje sai do comando, não desta linha |

**O que a suíte NÃO alcança, dito explicitamente:** uma edição coordenada de constante + cauda
que fique **dentro** da faixa por símbolo (283 ms em klines, **34 ms** em `premiumIndex`) passa.
Ou seja, a falsificação não detectável está **limitada ao envelope da própria medição**, que é
menor que o ruído dela — não é "impossível forjar", é "forjar não muda o número de forma
relevante".

---

## 5 · O que fica em aberto para quem escrever a escrita (fase seguinte)

1. **O arredondamento para a grade** (`SPEC-001` §5.2: *"próximo ponto da grade nativa >=
   bucket_end + p99 + margem"*, sempre **para cima**) **não está implementado aqui** — esta task
   entrega só o termo `p99_lag`. Com grade de 60 s e os dois `p99` medidos, os dois endpoints
   caem em `bucket_end + 60 s`; quem implementar precisa decidir a **margem** e provar o
   arredondamento com um caso que reprove.
2. **A migração das 80.592 linhas de backfill já gravadas** — `E1` opção 2 já declarou o custo:
   *"ou elas ficam como estão e a fronteira é uma data"*. Decisão pendente, não desta task.
3. **`CA-F3-12`** (backfill MODELADO não sobrescreve captura OBSERVADA) tem de ser exercido pelo
   caminho de escrita, e hoje nunca foi: `MODELED` tem **0 linhas**.
4. **Só 2 endpoints têm atraso medido.** Qualquer outro (`openInterestHist`,
   `topLongShortAccountRatio`, Coinalyze…) cai em `UnmeasuredPublicationLagError`, e o caminho
   de escrita tem de traduzir isso em `available_at = NULL` + quarentena (`SPEC-001` §5.2), não
   em um palpite.
5. **`D16` não está escrito em `DECISOES-OWNER.md`** — aquele arquivo vai até `D14` neste
   `HEAD`. A decisão chegou a esta task pelo despacho; registrá-la no documento é ato de quem
   tem a caneta do ledger.
