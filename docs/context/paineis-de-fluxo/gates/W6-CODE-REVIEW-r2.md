# W6-CODE-REVIEW-r2 — code-review high de `master...wave/paineis-f03b`

- **Veredito: NEEDS_FIX.** Um achado de correção está **CONFIRMADO**: `D-1`, a violação de `ADR-045/D2-bis` na borda esquerda de uma janela `1m`. Eu reproduzi o defeito.
- HEAD revisado: `21b9038`. O código de produção é o mesmo de `ef2ff95` (r1): `git diff --shortstat ef2ff95 HEAD -- backend/src frontend/src` dá `2 files changed, 23 insertions(+)`, e os dois arquivos são `*.test.ts`. Os commits depois de `1c95f62` só mexem em `docs/` (`W6-REVIEW-r2.md`, `W6-DESIGN-REVIEW-r2.md`) `[MEDIDO 2026-09-28]`.
- Universo: `git diff --shortstat master...wave/paineis-f03b` dá 116 arquivos, +16524/−41. Só `backend` e `frontend`: 45 arquivos, +9273/−41 `[MEDIDO 2026-09-28]`. `docs/` ficou fora.
- Fonte dos candidatos: a skill `code-review` rodou em nível high como fork (`agent-a4dd2e506fd327b01`) e devolveu 10 candidatos. Verifiquei os 10 contra o código.

## Achado CONFIRMADO

### C-1 (= `D-1` do `W6-QA-BACK-r2`): em TF `1m`, o histórico serve um bucket que `D2-bis` dá ao polling

- **Onde:** `backend/src/modules/sentimento/use_cases/series_history.py:560-579` (`_oi_fact_instants`), consumido por `domain/oi_candle_regimes.py:235-254` (`_polling_anchors_inside`).
- **Mecanismo:** `_oi_fact_instants` calcula o universo de leituras de **cada série** a partir do bucket efetivo **dela**. No polling (`1m`), o universo começa em `ceil(window_start, 1m) − 1m`. No histórico (`5m`), o `T0` do primeiro bucket é `ceil(window_start, 5m) − 5m`, que pode cair até 4 min antes. `_polling_anchors_inside` pergunta se `p_poll(T0)` pertence a `poll_instants`. Um `p_poll` que fica à esquerda do universo do polling nunca é lido, e por isso o bucket vai para o histórico. O resultado muda conforme o minuto em que a página começa.
- **Reprodução:** `cd backend && uv run pytest -q --no-cov --runxfail "tests/sentimento/test_oi_candles_route_invariants.py::test_in_1m_a_polled_anchor_left_of_the_window_still_owns_the_history_bucket"` termina em **1 failed**, com `Left contains one more item: ('binance_point_5m', 1789171500000)`. A janela que começa no minuto 4 não serve nada em `bucket_end = 10`. A que começa no minuto 7 serve o candle de histórico `(5,10]` `[MEDIDO 2026-09-28, depois de purgar __pycache__]`.
- **Efeito no front** (candidato #2 da skill, mesma causa): `mergeOlderOiCandles` (`frontend/src/app/symbol/oi-candle-pane.ts:103`) só cobra `bucket_end_ms` crescente. Quando duas páginas `1m` se juntam numa fronteira que não é múltipla de 5 min, os intervalos `(bucket_end − bucket_interval_ms, bucket_end]` podem se sobrepor: 1–4 min ficam cobertos pelas duas séries. Não é um achado independente. Quando C-1 for corrigido no backend, a sobreposição some.
- **Alcance:** só TF `1m`, e só quando há um `p_poll` num minuto múltiplo de 5 seguido de pelo menos 4 min sem polling. No export real de 23:04Z isso aparece 0 vezes `[DOC: W6-QA-BACK-r2 §2]`. O defeito é latente, mas a UI chega nele, porque o passo do eixo é 1 min.
- **Correção** (cabe ao builder): o `poll_instants` que decide o histórico tem de começar no `T0` do primeiro bucket **do histórico**. Outra opção é o domínio recusar um bucket de histórico que comece antes do primeiro instante de polling lido. Nos dois casos é preciso tirar o `xfail(strict=True)`. Na revalidação, peça a mutação: com a correção revertida, o teste tem de falhar.

## Os demais candidatos

| # | candidato (skill) | veredito | por quê |
|---|---|---|---|
| 3 | `series_history.py:623`: `_read_instant` só alcança `t+59 999 ms` também na série `5m`, e um fato publicado mais de 60 s depois cairia em R-1 | **REFUTADO** | R-1 é `available_at <= knowledge_time` (`domain/as_of_accessor.py:626`, `ADR-042/D1`), não `<= t`. Em `t = T + 59 999`, só R-2 (`bucket_end <= t`) depende de `t`, e `bucket_end = T` passa. O `available_at` modelado do `openInterestHist` (`T + 300 000`, `modeled_availability.py:190-193`) é admitido porque `knowledge_time` fica bem depois dele. O dado real confirma: 16 candles `binance_point_5m` servidos em `T-03.12-design-served-facts.json` (`grep -o binance_point_5m … \| wc -l` = 16) `[MEDIDO]` |
| 4 | `oi_candle.py:357`: `closed = bucket_end <= now_ms` ignora o lag de publicação | **PLAUSIBLE, por desenho** | `now_ms` é o `knowledge_time` da request (a página "como em T"). O front manda `knowledge_time = endMsExclusive + 4 min`, e a borda direita fica em `now − RIGHT_EDGE_LAG_MS` (`request-window.ts:118,162`). O lag medido do polling é de ~50 s, bem abaixo disso. Só um fato atípico, mais atrasado que isso, deixaria o candle "fechado em T" sem o `p(T1)`. A resposta continua reproduzível e é a mesma semântica dos `rows` `STOCK`. Nenhum valor servido é errado para o horizonte declarado |
| 5 | `use-history-pager.ts:367`: um `OiCandleBundleError` congela o `coverageFloorMs` e é relançado | **PLAUSIBLE, por desenho** | É o contrato do módulo ("WHY A FAILED PAGE ABORTS ALL TEN FETCHES"). O `RangeError` de `mergeOlderPage` segue o mesmo caminho. Já foi visto no r1 (#4) |
| 6 | `csv_series_window_reader.py:109`: `Decimal(...)` fica fora do `try` | higiene, não correção | Igual ao r1 #5. Nenhum chamador captura `CsvExportValueError`, e o CLI falha alto dos dois jeitos |
| 7 | `oi_candle_falsifier_cli.py:46,117`: mensagem de `SystemExit` em português | convenção | Viola a seção "Mensagem de exceção" do `CLAUDE.md`. É convenção, não portão, e não é correção. Igual ao r1 #8 |
| 8 | `SymbolClient.tsx:2546`: o posicionamento de rótulos roda a cada repaint | eficiência | Não é correção |
| 9 | o "acha a source ou lança" aparece 3 vezes, e a busca binária 2 | simplificação | Não é correção. Igual ao r1 #7 |
| 10 | `series_history.py:509`: um segundo `as_of_batch` sobre as mesmas observações | eficiência | Não é correção. É o custo declarado de `D2-bis`. Igual ao r1 #6 |

## Correção do r1

O r1 (`W6-CODE-REVIEW.md`, candidato #1) classificou como **PLAUSIBLE** o mecanismo de sobreposição entre páginas e disse que "dentro de uma mesma página a disjunção vale". **A segunda parte estava errada.** A causa é a borda esquerda de **cada** request `1m`, não só a costura entre páginas. O r1 viu o sintoma no merge e não subiu até `_oi_fact_instants`. O `W6-QA-BACK-r2` provou a causa com um teste, e este r2 reproduziu o teste.

## Não medido

- Não rodei `make verify` nem a suíte inteira. Este portão lê código, e o QA cobre a execução `[NÃO MEDIDO aqui]`.
- Não medi a correção de C-1, porque ela ainda não existe.
