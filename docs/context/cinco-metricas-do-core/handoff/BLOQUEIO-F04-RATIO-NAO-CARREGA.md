# ⛔ `nature = RATIO` não carrega — e por isso `DoD-2` da fase `04` é **estruturalmente zero**

`[MEDIDO 2026-09-12]` pelo builder da fase `04`, contra a stack viva. Escrito **antes** do gate,
porque silenciar um bloqueio para o gate parecer fechado é o defeito mais caro deste fluxo.

## O que aconteceu, na ordem em que foi medido

A fase `04` (`count_long_short_ratio`) fez o dado **chegar**:

| DoD | comando | número |
|---|---|---|
| `DoD-1` | `select src_label_raw, count(distinct series_key_id), count(*) from md.series where src_label_raw='/futures/data/globalLongShortAccountRatio' group by 1;` | **4 séries · 2.100 linhas** (era `0`) |
| `DoD-4` | `select run_id, n_returned, n_written, verdict, writer_accounted_at from md.ingest_run where run_id='c37bbb59-…';` | **n_written = 2.000**, `ACCEPTED`, carimbado pelo writer |
| `DoD-2` | `GET /api/v1/series-history?series_key_id=279d3172…&symbol=BTCUSDT&interval=1m&…&bar_policy=final_only` | `HTTP 200`, **60 linhas, 0 com valor, 60 `SEM_PONTO`** |

## A causa, e ela **não** é `max_staleness_ms`

`as_of_accessor.py:112-118`:

```python
CARRY_FORWARD_BY_NATURE: Final[dict[Nature, bool]] = {
    Nature.STOCK: True,
    Nature.FLOW: False,
    Nature.RATIO: False,   # <—
    ...
}
```

⇒ para uma série `RATIO`, **não há `LOCF`**: um ponto só é legível **no seu próprio instante de
grade**, nunca num instante posterior. E a regra anti-lookahead `R-1` (`available_at <= t`) exige
que, **naquele mesmo instante**, o ponto já estivesse disponível.

As duas condições juntas são **mutuamente exclusivas para esta fonte**, e isso é medido, não
inferido:

```sql
select count(*) filter (where available_at <= bucket_end) as legiveis_no_proprio_instante,
       count(*) as total,
       min(available_at - bucket_end)/1000 as atraso_min_s
from md.series where src_label_raw='/futures/data/globalLongShortAccountRatio';
-- 0 | 2100 | 66
```

**0 de 2.100 linhas** têm `available_at <= bucket_end`; o atraso **mínimo** é de **66 s**.
`[MEDIDO 2026-09-12, n=2.100 linhas: 2.000 do passe de boot + 100 do passe seguinte, ao vivo]`

E o atraso **não pode** ser zero: a Binance publica o ponto **9,6 s / 70,8 s DEPOIS** do instante
que ele carimba `[MEDIDO 2026-09-12, poll de 10 s, n=2 fronteiras de bucket]`. Toda fonte
publica depois de observar. ⇒ **nenhuma série `RATIO` desta origem pode render um ponto sequer**,
hoje, por construção — independentemente de coletor, de cadência e de `max_staleness_ms`.

⚠️ **O falsificador de que a causa é o `nature`, não o resto da fase:** a série de open interest
(`94c3d3dd…`, `nature=STOCK`, mesma grade de `5min`, mesmo `max_staleness_ms = 600.000`, mesmo
endpoint família `/futures/data/`) responde **10 de 60 slots com valor** na mesma janela, na mesma
API, no mesmo instante. Muda **um** termo — `nature` — e o resultado vai de 10 para 0.

```
GET …series_key_id=94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9…
-> rows 60, com valor 10     (STOCK)
GET …series_key_id=279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e…
-> rows 60, com valor  0     (RATIO)
```

## Isto já estava nomeado — com dono — antes desta fase existir

`as_of_accessor.py:101-111`, verbatim:

> ⚠️ `RATIO` IS CONSERVATIVE HERE, AND IT IS A `[NAO SEI]` WITH AN OWNER. `SPEC-001` §5.11 splits
> ratios in two — "RATIO de estoque" (behaves like `STOCK`, `last()` on the edge is legitimate)
> and "RATIO de fluxo" (the taker series; the panel DISABLES itself) — but `SeriesKey.nature` has
> ONE `RATIO` member, so the key cannot express which one a series is. … Owner of the question
> "does `nature` need a sixth member, or does §5.11 need a second term?": `/architect`.

A fase `04` é a **primeira** série `RATIO` a chegar ao banco, então é a primeira vez que esse
`[NAO SEI]` custa um ponto na tela. O texto acima estava certo e o custo agora tem número.

## O que a fase `04` **não** fez, e por quê

**Não trocou `nature` para `STOCK`.** Seria a mudança de uma linha e faria o `DoD-2` passar hoje —
e é a decisão errada para um builder tomar:

1. `Nature.RATIO`'s own docstring (`series_key.py`) nomeia **exatamente estas quatro séries** como
   os membros de `RATIO`. Escolher `STOCK` contradiz o enum no arquivo que o define.
2. `nature` é um dos **quinze termos** de `SeriesKey`, e o `sha256` dos quinze **é** o
   `series_key_id` (`series_key.py:226-234`). Trocar depois **re-identifica a série** — a mesma
   migração que `T-04.1` existiu para evitar no `interval`.
3. O membro conservador existe porque **sub-servir devolve ausência VISÍVEL e sobre-servir devolve
   um número velho INVISÍVEL, e só um dos dois custa capital** (o comentário acima). Um builder
   inverter isso sozinho é exatamente o tipo de decisão que `ADR-006` tirou do caminho.

## As três saídas, com o custo de cada uma — **decisão do `/architect`**

| # | saída | custo | re-identifica? |
|---|---|---|---|
| A | **sexto membro em `Nature`** (`RATIO_STOCK` / `RATIO_FLOW`, ou `RATIO` + um termo novo) | emenda `SPEC-001` §2.1 + `ADR-006`; toca `series_key.py`, `as_of_accessor.py` e a união TS de `series-catalog.ts` | **sim** para toda série `RATIO` — hoje só esta, e ela ainda **não** está mergeada ⇒ custo de migração **zero se decidido antes do merge** |
| B | `CARRY_FORWARD_BY_NATURE[RATIO] = True` | uma linha; mas passa a carregar **também** `sum_taker_long_short_vol_ratio` (razão de fluxo), que é a direção perigosa que o comentário mede em `3,3x` de inflação | não |
| C | `nature=STOCK` só para `count_long_short_ratio` | uma linha, sem tocar o acessor; contradiz a docstring de `Nature.RATIO` e apaga a distinção que `SPEC-001` §5.11 faz | **sim** (mesma janela de custo zero de (A)) |

> ⏱️ **A janela barata é agora.** Enquanto o branch da fase `04` não entra, nenhuma linha de
> `md.series` depende do `series_key_id` atual — as 2.100 medidas serão truncadas por `D15` de
> qualquer forma. Depois do merge + reingestão, qualquer uma de (A) ou (C) vira migração de
> `series_key_id` com relatório já emitido, que é o custo que `ADR-008/DoD-2` descreve.

## O que NÃO é a causa, verificado para não mandar ninguém para o lado errado

- **Não** é `max_staleness_ms`: `600.000 ms = 2 x` a inter-chegada medida (`300.000 ms exatos`,
  `n=499` gaps). Sem `LOCF`, esse número não é lido por ninguém.
- **Não** é o `available_at` de backfill (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md` / `E1`): as
  **100 linhas coletadas AO VIVO** no segundo passe têm o mesmo destino, porque `66 s > 0 s`.
- **Não** é o catálogo: a série resolve (`HTTP 200`, `panel.nature = "RATIO"`), não `422`.
- **Não** é o coletor: `n_written = 2.000`, carimbado pelo writer.
