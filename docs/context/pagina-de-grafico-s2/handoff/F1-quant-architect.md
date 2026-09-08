# Handoff /architect → quant-architect — `pagina-de-grafico-s2`, F1 (contrato das rotas de backend)

**Contexto:** PRD-006 aprovado. F1 constrói as 2 rotas que `ADR-005/D1` exige e que nunca foram
implementadas: histórico HTTP endereçável por conteúdo `(series_key_id, symbol, interval, janela,
knowledge_time, bar_policy)` e SSE de bucket parcial `(bucket_open_ts, cvd_delta_parcial,
last_price, n_trades, seq)`. Chave BTCUSDT, Preço+OI+CVD, componente `sentimento` (leitura do
registro que `captura-em-producao` já grava).

## Decida (`[Q5]`, PRD-006 §9/§15)

**Enum de `bar_policy` aceito na requisição.** `ADR-005/D4` já decide que é do CONSUMIDOR e nomeia
2 valores em prosa (`final_only`, `intrabar`, com `is_final=false` para o segundo) mas não fixa o
enum formalmente nem diz se há um 3º valor (ex.: bucket fechado sem replay). Fixe o enum exato e
o comportamento de cada valor na fronteira histórico (replay "como em T") vs ao vivo (borda direita).

## Confira (não é pergunta nova, é checagem de contrato)

- O envelope de linha da rota de histórico (D6: "rows, não texto") — quais campos por linha além
  dos citados em `D3` (sessão/painel/célula)? A rota lê de quais use-cases hoje existentes
  (`as_of_accessor.py`, `cvd.py`, `series_key.py`, `cvd_source_catalog.py` em
  `backend/src/modules/sentimento/domain/`)? Confirme se a leitura passa por
  `as_of_accessor` (ADR-006 max-staleness) ou se F1 precisa de um novo ponto de leitura.
- Ausência de OI/CVD tem de ser lida como ausência, nunca zero (`CA-F2-3`, herdado do motor
  `charts`) — confirme que o schema de linha da rota consegue expressar ausência (não só omitir
  o campo, que é ambíguo com "linha não existe").

## Onde ler

- `docs/adr/ADR-005-transporte-de-leitura.md` D1-D6 (a emenda de 2026-09-03 é a parte que rege
  schema/porta) · `docs/specs/PRD-006-pagina-de-grafico-s2.md` §5 F1 (US-1/2/3), §9, §10 F1
- `backend/src/modules/sentimento/domain/{as_of_accessor,cvd,series_key,cvd_source_catalog}.py`

## Devolva

Enum de `bar_policy` com comportamento de cada valor, e a confirmação/correção do ponto de leitura
do envelope — em ≤ 15 linhas, relatório completo em
`docs/context/pagina-de-grafico-s2/gates/F1-quant-architect.md`.
