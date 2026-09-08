# Fase 00 — A coluna de valor que faltava em `md.series`

**Componente:** `sentimento` · **Depende de:** nada · **Bloqueia:** `01`
**Decisão que fecha:** [`ADR-034/D7`](../../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md)

## Por que esta fase existe

`md.series` (`postgres_series_sink.py:40-58`) tem 15 colunas — identidade, bucket, procedência —
nenhuma numérica. `SeriesRow` (`provenance.py:144-178`) documenta a omissão como intencional.
`series_row_wire.py` transcreve os mesmos 15 nomes. Sem esta fase, `01` não tem o que ler além de
metadados. Achado por `quant-architect` durante o dispatch de `/architect` para `SPEC-006`, não
previsto pelo `PRD-006`.

## Itens

| item | entrega | requisito | componente |
|---|---|---|---|
| 0.1 | `md.series` ganha `value_raw TEXT NOT NULL` no `CREATE TABLE` de `postgres_series_sink.py` | `ADR-034/D7` | `sentimento` |
| 0.2 | `SeriesRow` (`provenance.py`) ganha campo `value_raw: str`; `__post_init__` recusa string vazia (mesma disciplina das outras colunas de texto obrigatórias) | `ADR-034/D7` | `sentimento` |
| 0.3 | `series_row_wire.py`: `FIELD_NAMES` ganha `value_raw`; `encode`/`decode` round-trip | `ADR-034/D7` | `sentimento` |
| 0.4 | Migração de schema: `ALTER TABLE md.series ADD COLUMN value_raw TEXT` para ambiente onde a tabela já exista, nomeada como script/instrução — decisão de custo/backfill é do owner (`M3`, `SPEC-006 §12`), não desta task | `ADR-034/D7` | `sentimento` (+`infra` se script de migração viver lá) |

## DoD — verificável, com comando e universo

| id | critério | comando | morde |
|---|---|---|---|
| CA-F0-1 | `value_raw` existe e sobrevive ao round-trip do wire | teste estendido de `series_row_wire.py`: 4 `Provenance` × **16** campos (era 15), `encode` → `decode` → comparação campo a campo | remover `value_raw` do `decode` ⇒ teste vermelho |
| CA-F0-2 | string vazia é recusada | `SeriesRow(..., value_raw="")` → `InvalidSeriesRowError` | ausência da checagem ⇒ `SeriesRow` aceita string vazia silenciosamente |
| CA-F0-3 | `CREATE TABLE` inclui a coluna nova | `grep -n 'value_raw' backend/src/modules/sentimento/infra/postgres_series_sink.py` → ≥ 1 | ausência ⇒ reprova |

## Non-goals desta fase

Não decide QUEM roda a migração em produção nem QUANDO (owner, `M3`) · não altera `as_of_accessor.py`/
`cvd.py` (ficam para `01`, que é quem consome `value_raw`) · não adiciona colunas OHLC (`ADR-034/D7`
recusa explicitamente).

## Falsificador da fase

Se `01` conseguir servir um valor sem que ele tenha vindo de `value_raw` (ex.: um literal
hardcoded "para não bloquear"), `00` não cumpriu o papel de ser a ÚNICA fonte de número — `RN-7`
de `SPEC-006` existe para pegar isso na fase seguinte, mas o defeito nasceria aqui se `00` for
pulada ou feita pela metade.
