# ⛔ Os 7 dias de backfill são invisíveis ao `as_of` — o gráfico só pode mostrar o que foi coletado AO VIVO

`[MEDIDO 2026-09-11T14:4xZ]` pelo orquestrador, contra a stack viva, **só leitura**.
Achado ao verificar o número `745/5.760` do gate da janela deslizante.

## O sintoma

Janela derivada de 4 dias (`5.761` grades), `series_key_id = ef3033e6…4e42`, BTCUSDT:

    linhas = 5.761   com_valor = 769   (13,3%)
    indice do 1o com valor = 4971 de 5761

⇒ **os primeiros 86% da janela estão vazios**, embora `md.series` tenha cobertura **contínua**
de 1 min sobre todo o intervalo (`10.873` buckets distintos, de `1788486120000` a
`1789138440000` ≈ 7,5 dias).

## A causa: `available_at` do backfill é a hora em que BUSCAMOS, não a hora em que era sabível

    SELECT CASE WHEN available_at - bucket_end > 300000 THEN 'backfill' ELSE 'ao vivo' END,
           count(*), min(available_at-bucket_end)/1000, max(available_at-bucket_end)/1000
    FROM md.series WHERE series_key_id='ef3033e6…4e42' GROUP BY 1;

| classe | linhas | atraso mín | atraso máx |
|---|---:|---:|---:|
| **backfill** | **20.148** | 306 s | **604.703 s ≈ 7 dias** |
| ao vivo | 804 | 0 s | 267 s |

A regra `R-1` (`available_at <= t`) é anti-lookahead e está **correta**: ela recusa mostrar um
bucket num instante em que ainda não o tínhamos. Mas para a linha de backfill o `available_at`
é o instante da **requisição de backfill**, então todo bucket anterior a ela é recusado **no
seu próprio instante de grade**. Os `769` pontos legíveis são, dentro do erro de medição, os
`804` coletados ao vivo.

## Por que isso importa além do gráfico

`T-01.3` fez backfill de 7 dias **exatamente para** o `DoD-3` ter `N ≥ 30` e a tela ter história
(`[Q7]`: *"backfill lido da origem não é dado de teste"*). O `DoD-1` (`count(*) ≥ 10.000`) passa
— as linhas **estão** no banco. O que não acontece é elas serem **legíveis** pela porta que o
gráfico e o backtest usam.

⇒ **`ADR-036` prevê backfill profundo** (klines desde 2019-09-08, weight 1 por 1.500 velas) para
alimentar backtest. Se history importada é invisível ao `as_of`, **o caminho de backtest herda o
mesmo teto**, e o problema não é da fatia `01`.

## O que NÃO estou decidindo

As duas saídas têm custo e **nenhuma é minha**:

- **`available_at` = instante da busca** (hoje): honesto sobre o que sabíamos, **mas history
  importada nunca é legível no passado** ⇒ backtest só sobre o que coletamos ao vivo.
- **`available_at` reconstruído** (`bucket_end` + atraso típico de publicação): a tela e o
  backtest ganham história, **ao preço de afirmar conhecimento que não tínhamos** — que é
  exatamente o lookahead que `as_of` existe para impedir. Exigiria rótulo de proveniência
  (`RS-5`/`published_error` já existe para série reconstruída).

**Dono:** `ADR-006`/`SPEC-001` §5.11 — o mesmo dono de
[`ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`](ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md),
e as duas perguntas são sobre a mesma cláusula.

## O que isto NÃO bloqueia

`DoD-3` pede `N ≥ 30` pontos distintos. Com `769`, passa. A janela deslizante está **correta** e
é melhoria real (`0 → 769`); ela só não conserta o que não é dela.
