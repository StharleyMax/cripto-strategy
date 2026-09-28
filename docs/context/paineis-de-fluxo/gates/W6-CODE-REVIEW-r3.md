# W6-CODE-REVIEW-r3 — code-review high de `master...wave/paineis-f03b`

- **Veredito: APPROVED.** Nenhum achado de correção CONFIRMADO. O `C-1`/`D-1` do r2 está fechado em `20e01b4`, e o teste que o cobre morde.
- HEAD revisado: `6c4014b`. Desde o r2 (`21b9038`), o código mudou em 5 arquivos, +282/−23: `domain/oi_candle_regimes.py`, `use_cases/series_history.py`, dois testes de backend e `e2e/38`. Comando: `git diff --stat 21b9038 HEAD -- backend frontend` `[MEDIDO 2026-09-28]`.
- Universo: `git diff --stat master...wave/paineis-f03b` dá 120 arquivos, +17240/−41 `[MEDIDO 2026-09-28]`.
- Fonte dos candidatos: a skill `code-review` foi lançada em nível high como fork (`@code-review`, `78b85e`), mas **não devolveu antes do fechamento deste laudo** `[NÃO SEI: candidatos novos da skill]`. Por isso o laudo se apoia na verificação manual do diff do conserto e nos 10 candidatos do r2. O código deles só mudou nos dois arquivos de produção abaixo.

## C-1 do r2: fechado

- **Conserto:** `_poll_anchors_left_of_window` (`series_history.py:577`) lê o polling em `[T0 do 1º bucket de histórico, T0 do 1º bucket de polling)` e entrega esses instantes como `anchor_only_instants_ms`. O domínio os junta a `poll_instants` (`oi_candle_regimes.py:213-216`), e eles nunca viram vela. O slot de histórico que traga âncoras é recusado.
- **Prova de cobertura (manual):** em TF `1m`, `T0_hist = ceil(ws,5m) − 5m < ws ≤ ceil(ws,1m)`, e os dois ficam na grade de 1 min. Então `T0_hist ≤ poll_first_anchor`, e o trecho mais as leituras do polling cobrem todo início polled `T0_hist … T0_hist+4m` do 1º bucket de histórico. Na borda direita, `floor(we,1m) ≥ floor(we,5m)`, então nada falta ali. Para TF `≥ 5m` os dois `T0` coincidem, e o trecho sai vazio.
- **Paginação:** a página mais velha cobre o mesmo bucket com as leituras de polling dela até `floor(we,1m)`. A decisão de D2-bis fica a mesma nas duas páginas, e isso fecha também a sobreposição do front (r2, candidato #2).
- **Testes:** `uv run pytest --no-cov -p no:cacheprovider tests/sentimento/test_oi_candles_route_invariants.py tests/sentimento/test_oi_candle_regimes.py` dá **397 passed**, depois de purgar `__pycache__` `[MEDIDO 2026-09-28]`.
- **Mutação:** com `_poll_anchors_left_of_window` forçado a devolver `frozenset()`, o mesmo comando dá **5 failed, 392 passed** `[MEDIDO 2026-09-28]`. O arquivo foi restaurado com `git checkout`, e a árvore voltou limpa.

## Os demais candidatos (r2)

Os candidatos #3 a #10 do r2 não mudaram de veredito. Nenhum dos trechos que eles citam foi tocado depois do r2, e `git diff 21b9038 HEAD -- frontend/src` sai vazio. Os PLAUSIBLE por desenho continuam PLAUSIBLE (#4 `closed` contra `knowledge_time`, #5 `OiCandleBundleError`). Os de higiene, convenção, eficiência e simplificação (#6 a #10) não são correção.

- **Nota nova, não é correção:** o conserto faz uma terceira leitura (`read_window`) por request `1m` de OI. Ela só acontece quando existem os dois regimes.
