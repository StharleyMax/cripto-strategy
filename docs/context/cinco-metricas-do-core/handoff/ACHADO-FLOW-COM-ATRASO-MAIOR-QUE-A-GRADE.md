# ⚠️ Um bucket `FLOW` publicado com atraso maior que a grade é ILEGÍVEL — e isso é decisão de `ADR-006`, não bug

`[MEDIDO 2026-09-11]` — achado **ao corrigir** `ACHADO-SERIES-HISTORY-SEM-PONTO.md`
(ver [`gates/F01-series-history-sem-ponto-build.md`](../gates/F01-series-history-sem-ponto-build.md) §6).
**Não decidido. Escalado de propósito.**

## O fato

Corrigido o defeito do instante de leitura, `GET /series-history` sobre `klines_volume`/BTCUSDT
passou de `0/180` para **`176/181`** linhas com valor. As **5** que sobram são **exatamente** as 5
linhas cujo atraso de publicação passou de uma grade inteira:

```sql
-- janela [1789121820000, 1789132620000], series_key_id='ef3033e6…4e42', symbol='BTCUSDT'
SELECT count(*)                                               AS n,
       count(*) FILTER (WHERE available_at - bucket_end >= 60000) AS lag_ge_grid,
       min(available_at - bucket_end), max(available_at - bucket_end),
       percentile_disc(0.5) WITHIN GROUP (ORDER BY available_at - bucket_end)
FROM md.series WHERE …;
-- → 181 | 5 | 268 | 60936 | 31050
```

`5` linhas com `lag >= 60_000 ms` e `5` linhas `SEM_PONTO`: **correspondência exata, n=181.**

## Por que não há instante de leitura que resolva

Um bucket `FLOW` que fecha em `g` fica legível em `g + atraso`. Se `atraso >= 60_000`:

- em `t ∈ [g, g + 59_999]` ele ainda não é legível — R-1 (`available_at <= t`) rejeita;
- em `t >= g + 60_000` ele é legível, mas `age_ms >= bucket_interval_ms` e
  `CARRY_FORWARD_BY_NATURE[FLOW] is False` ⇒ `SEM_PONTO` por `D4.11`;
- e esticar `t` até lá **admitiria o bucket seguinte** (R-2, `bucket_end <= t`), que é lookahead —
  desenhar em `g` um dado de depois de `g`, o que `SPEC-001` §2.4 proíbe.

**A janela de legibilidade `[g + atraso, g + intervalo)` fica VAZIA.** Não é implementação: é a
regra `D4.11` encontrando um atraso maior do que a largura do bucket.

## A pergunta, e de quem ela é

> Quando um bucket `FLOW` só fica legível **depois** de a sua própria grade ter passado, o gráfico
> mostra `SEM_PONTO` (hoje), ou passa a mostrá-lo com uma marca de atraso?

**Dono: `ADR-006` / `SPEC-001` §5.11 (`D4.11`), via `/architect` ou `quant-architect`.** Mexer nisso
é mexer em `as_of()`, que é **o leitor único** e serve também o caminho de DECISÃO — onde
`age_ms >= bucket_interval_ms` significa "esta soma não é mais verdade" e a recusa é o
comportamento **correto**, não uma limitação. O que é aceitável para um pixel não é aceitável para
uma entrada, e `as_of` hoje não distingue os dois casos por `purpose` neste ponto.

## Teto de perda, para dimensionar a pergunta

**2,8%** das grades (5/181) `[MEDIDO 2026-09-11, 3 h de `klines_volume`/BTCUSDT]`. Não bloqueia
`DoD-2` da fatia `01`. **O custo de decidir errado é maior que o de não decidir agora** — por isso
está aqui e não no código.

⚠️ **O que este achado NÃO é:** não é justificativa para relaxar `D4.11` no caminho de decisão, e
não é pedido de `first_capture_at`/`staleness` maior (o `max_staleness_ms` de `120_000` já é maior
que o atraso; quem corta é `age_ms >= bucket_interval_ms`, não a stale).
