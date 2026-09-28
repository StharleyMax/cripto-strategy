# W6-QA-BACK-r3 — QA de backend da wave W6 (`paineis-de-fluxo`, 03b), revalidação depois do W6-FIX, em `2bab956`

- **Alvo:** `master...wave/paineis-f03b` em `2bab956`, worktree `.claude/worktrees/wave-paineis-f03b`. O backend mudou só em
  `20e01b4` (W6-FIX, D-1): `domain/oi_candle_regimes.py`, `use_cases/series_history.py` e dois arquivos de teste
  (`git diff --stat ba40d9e..HEAD -- backend`). O universo de backend do diff tem **19 arquivos**
  (`git diff --name-only master...HEAD -- backend`).
- **Contra:** `plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03b (3b.1–3b.3, DoD-03b 1, 2 e 5 no lado do servidor) e §03a
  (DoD-03a.1 e 3, pelos laudos da T-03.7), `ADR-045` (D1, D2, D2-bis e §Falsificador 3–4) e os títulos de T-03.8..T-03.10
  (`harness tasks json paineis-de-fluxo`). T-03.11..T-03.14 são `web` e ficam com o QA de front (`W6-QA-FRONT*`).
- **O que o r3 acrescenta:** a mutação que o W6-FIX §5 pediu, mais 8 mutantes novos. Dois deles sobreviviam, e para eles entram
  **2 testes novos** (4 itens). Há também o **t2 da T-03.7**, medido só com leitura. `gate-record` **não** foi rodado.

```
## QA Gate — Fase 03 (03b + laudos da T-03.7) [sentimento]
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request / own.compose-hardcoded-secret
       — `harness rules --mode sweep --path <f>`: 0 BLOQUEIO nos 19 arquivos de backend, nos 26 de frontend/ do diff
       e no teste alterado. Controle positivo: isca em backend/tests/ deu 3 BLOQUEIO (relative-import :1,
       silent-except :4, print-statement :6). A isca foi apagada.
- [OK] web-fullstack.server-test-directory-present — backend/tests/ existe e roda 3419 testes (§5).
- [OK] Testes existem e passam — `make test` rc=0 antes dos testes novos (3415 passed, 1 skipped, 1 xfailed, 220 s)
       e depois deles (3419 passed, 1 skipped, 1 xfailed, 249 s, §5). `bash backend/scripts/lint.sh` rc=0.
- [OK] Cobertura 96,43% contra o alvo de 70% (fail_under). Pisos por camada: domain 99,7% (meta 90),
       use_cases 99,6% (meta 80), infra 92,6% (meta 70). Os 7 módulos novos estão em 100%, oi_candle_regimes.py incluído.
- [OK] D-1 do r2 corrigido, e a correção morde: com `_poll_anchors_left_of_window` curto-circuitado em frozenset(),
       5 testes falham (§2).
- [OK] DoD-03b 1, 2 e 5, ADR-045 F3/F4: export NOVO (11:52Z), 4 símbolos rc=0, 13 veredictos `held` cada, 0 divergência (§3).
- [OK] Mutação r3: 9 mutantes → 7 mortos e 2 equivalentes com prova. N2 e N4 só morrem com os testes novos (§2).
- [FAIL] DoD-03a.1 (T-03.7), t2: de 685 a 689 linhas por símbolo, contra o piso de 1.368. O coletor está parado desde
       2026-09-27T23:07Z, pelo mesmo idle-in-transaction da API (3ª ocorrência). Não é defeito da 03b (§4).
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: NEEDS_FIX
Ações: 1. (infra/orquestrador) Implantar o conserto do idle-in-transaction (`83e7a78`, wave/api-idle-tx), destravar o
          coletor e abrir a 3ª janela de 24 h da T-03.7. 2. Pela D-3 do owner, o merge da W6 espera por isso.
          O código da 03b não tem ação pendente.
```

## 1. Rodado antes e depois dos testes novos

- Antes: `find backend -name __pycache__ -prune -exec rm -rf {} +; make test` → **rc=0**, `3415 passed, 1 skipped, 1 xfailed`,
  `TOTAL 11034 stmts / 363 miss / 96.43%`, e os três pisos `[OK]` `[MEDIDO 2026-09-28T11:5xZ]`. Log bruto em
  `<scratchpad>/make-test-r3-pre.log`, não versionado.
- O `1 xfailed` restante **não** é o de D-1. É `test_publication_lag_table.py:577`, anterior à wave. D-1 saiu de xfail no
  W6-FIX, e o teste agora passa pelos dois ids.
- Única linha descoberta nos módulos do diff: `use_cases/series_history.py:802, 806->796`. É a mesma linha `709, 713->703` do r2,
  deslocada em +93 pelo conserto (`git blame -L 800,806`: commits `43820f32`/`f75b9b6d` de 2026-09-22, anteriores à wave).
- Depois dos testes novos: ver §5.

## 2. D-1: revalidação por mutação

A bancada fica em `<scratchpad>/mut_r3.py`, não versionada. Cada mutante é uma substituição exata, recusada se o padrão não
aparecer exatamente 1 vez. Antes de cada rodada a bancada purga `__pycache__` e roda `pytest --no-cov -p no:cacheprovider` sobre
6 arquivos focais: `test_oi_candles_route_invariants.py`, `test_oi_candle_regimes.py`, `test_series_history_oi_candles.py`,
`tests/api/test_series_history_route.py`, `test_measure_oi_candle_falsifiers.py` e `test_oi_candle.py`. Depois restaura o arquivo.
A NULL e a RESTORED deram rc=0, e `git status` terminou só com o teste alterado `[MEDIDO]`.

| # | mutação | antes dos testes novos | com eles | resultado |
|---|---|---|---|---|
| N1 | `_poll_anchors_left_of_window` devolve sempre `frozenset()` (o conserto revertido, o pedido do W6-FIX §5) | morto: D-1 `by_hist` e `by_poll`, mais o invariante 2 `[0-1m]` | morto: os mesmos, mais os 2 do N2 novo | **morto** |
| N2 | o trecho à esquerda anda na grade do histórico (5 min), não na do polling | **vivo** | morto: `…off_the_5_minute_grid…` ×2, falha no minuto inicial 8 | **morto só pelo teste novo** |
| N3 | o trecho perde o último minuto antes do `T0` do polling | morto: D-1 ×2 | — | morto |
| N4 | a leitura do trecho ignora o `knowledge_time` do pedido (`2**62`) | **vivo** | morto: `…not_yet_known…` ×2, falha no minuto inicial 7 | **morto só pelo teste novo** |
| N5 | o domínio aceita `anchor_only_instants_ms` no slot do histórico | morto: `test_anchor_only_instants_on_the_history_slot_are_refused` | — | morto |
| N7 | o polling serve bucket sem `p(T0)` (sai o filtro de `D2-bis`) | morto: 8 testes em 2 arquivos | — | morto |
| N8 | o trecho termina em `ceil(ws, 1m)`, não em `ceil(ws, 1m) − 1m` | vivo | vivo | **equivalente**: o único instante a mais é `ceil(ws,1m) − 1m`, o 1º de `poll.readings`. A união de conjuntos o absorve, e a condição de saída antecipada só muda quando o trecho é esse instante sozinho |
| N9 | a leitura do trecho com `lookback 0` | vivo | vivo | **equivalente**: é o M4 do W6-FIX. Só vira leitura o fato com `bucket_end == t`, e todo `t` está em `[instants[0], instants[-1]]`, que a leitura cobre sem lookback |
| N10 | a leitura do trecho termina 1 ms antes do último instante | morto: D-1 ×2 | — | morto |

Um décimo mutante (N6, "projetar os instantes só de âncora") saiu da contagem por **erro da bancada**. A substituição virou
`if True if <filtro>`, que é o mesmo filtro. Ele não mede nada, e não é contado como equivalente nem como morto.

**Os dois testes novos** ficam em `backend/tests/sentimento/test_oi_candles_route_invariants.py`, e cada um roda pelos dois ids e
para cada minuto inicial de 4 a 9. `_served` ganhou `poll_lag_ms` (padrão `POLL_LAG_MS`, e nenhum chamador existente muda):
- `test_in_1m_a_polled_anchor_off_the_5_minute_grid_left_of_the_window_owns_the_bucket`: só `p_poll(6)` no trecho. Por
  `_polling_anchors_inside` (`oi_candle_regimes.py:250-266`), qualquer um dos 5 buckets de polling com `p(T0)` tira `(5, 10]` do
  histórico, e não só o do minuto 5. É uma lacuna real: o teste de D-1 do W6-FIX só tem âncora no minuto 5.
- `test_in_1m_a_polled_anchor_not_yet_known_left_of_the_window_owns_nothing`: o polling tem atraso de 20 min, como depois de um
  backlog do writer, e o pedido tem `knowledge_time` no minuto 16. A resposta que o pedido podia conhecer é `(5, 10]` do histórico
  em qualquer janela. Se a leitura do trecho olhar o futuro, a resposta muda com o início da página. É anti-lookahead, e nada o
  cobria.

Os dois passam no código de hoje (4 passed). **Não há defeito de produção**: N2 e N4 eram lacunas da suíte, e o código já fazia o
certo. Passam também em `ruff check`, `ruff format --check` e `mypy`, com 0 BLOQUEIO em `harness rules`.

## 3. Falsificadores 3 e 4 (T-03.10, DoD-03b 1 e 2) num export NOVO

Export só de leitura (`PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000`), com a
receita de `handoff/T-03.10.md`: as 8 séries, `bucket_end >= 1789603200000`, **40.530 linhas** (`wc -l`, com cabeçalho),
`sha256` com prefixo `c533090d8f5c5692`, feito em 2026-09-28T11:52Z. O do r2 tinha 40.514. As 16 linhas a mais são os
minutos 23:04–23:07Z × 4 símbolos, e depois deles o coletor parou (§4). O comando foi
`python -m src.modules.sentimento.infra.oi_candle_falsifier_cli <csv> <SYM> 1789603200000 1790550000000 1790550000000`, e os 4
símbolos saem com **rc=0**, 13 veredictos cada, `worst=held` e 0 divergência `[MEDIDO]`. Formato das células: `close n · âncora n`.

| símbolo | poll 1m | hist em 1m | poll 5m | hist 5m | F4 n · mediana · p90 · máx (bp) |
|---|---|---|---|---|---|
| BTC | 1960 · 1958 | 2261 · 2255 | 391 · 390 | 2262 · 2256 | 391 · **0,715** · 0,938 · 4,08 |
| ETH | 1960 · 1958 | 2161 · 2157 | 391 · 390 | 2161 · 2157 | 391 · **8,476** · 8,641 · 18,66 |
| LINK | 1952 · 1946 | 2083 · 2077 | 389 · 388 | 2084 · 2077 | 390 · **1,851** · 2,316 · 21,93 |
| SOL | 1960 · 1958 | 2126 · 2121 | 391 · 390 | 2126 · 2121 | 392 · **3,218** · 3,672 · 7,97 |

- F3: `flat = 0` em todo regime. **Os números são idênticos aos do r2.** A janela termina às 22:59Z e não alcança as linhas novas.
  Isso também mostra, no dado real, que a refatoração `oi_point_readings` → `_point_readings_at` do W6-FIX não mudou a leitura
  que F4 mede.
- `n ≥ 288` em cada regime de BTC (DoD-03b.1) e em F4 (DoD-03b.2): o menor é 391.
- Em BTC e LINK o histórico serve 1 bucket a menos em `1m` do que em `5m` (2261 contra 2262). Isso é por construção, não defeito:
  em `1m` um bucket de 5 min do histórico cede a **qualquer** `p_poll(T0)` dos 5 buckets de polling que ele cobre, e em `5m` só ao
  `T0` do bucket (`_polling_anchors_inside`, e é o que o N2 novo fixa).
- O ETH segue a **1,52 bp** do limiar de F4. É sinal para o `/architect`, como no r2, e não reprovação.

## 4. T-03.7: t2 da janela de 24 h, `[2026-09-27T11:39Z, 2026-09-28T11:39Z)` — **FAIL, pela 2ª vez e pela mesma causa**

Tudo aqui foi medido só com leitura (`default_transaction_read_only=on`, `lock_timeout=3000`), às 2026-09-28T11:51Z. Nada foi
destravado nem reiniciado. Os ids são os 4 do t0.

| símbolo | n | `T` distintos | primeiro `T` | último `T` | bytes de tupla | B/linha |
|---|---|---|---|---|---|---|
| BTCUSDT | **689** | 689 | 11:39Z | 23:07Z | 181.207 | 263 |
| ETHUSDT | **689** | 689 | 11:39Z | 23:07Z | 182.585 | 265 |
| LINKUSDT | **685** | 685 | 11:39Z | 23:07Z | 180.840 | 264 |
| SOLUSDT | **689** | 689 | 11:39Z | 23:07Z | 181.896 | 264 |

`[MEDIDO 2026-09-28T11:51Z, n=2.752 linhas]`. O piso é 0,95 × 1.440 = **1.368** ⇒ **`COUNT_LOW`**, com 47,8% de 1.440.

- **O coletor não perdeu minuto enquanto estava vivo.** De 11:39Z a 23:07Z são 689 minutos, e BTC, ETH e SOL têm os 689. LINK
  tem 4 buracos, os mesmos 4 do r2 (682/686 às 23:04Z). A janela de 20 s e a cadência não são a causa.
- **A causa é a do t1, de novo:** `deploy-collector-1` com `StartedAt=2026-09-27T23:07:39Z` e `RestartCount=2` (`docker inspect`).
  No `pg_stat_activity` aparecem duas sessões `idle in transaction` da API (`172.18.0.3`), com transações de **23 h 49 min**
  (`SELECT MIN(bucket_end), MAX(bucket_end) FROM md.series …`) e **16 h 52 min** (`SELECT run_id, … FROM md.ingest_run`).
  A sessão do coletor (`172.18.0.2`) está `active`, esperando `Lock` há **12 h 43 min**, no
  `ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS writer_accounted_at TEXT` `[MEDIDO, n=5 sessões]`. É a **3ª ocorrência**,
  depois do t0 e do t1.
- **O conserto existe e não está implantado.** `83e7a78` (`fix(infra): WI — a API deixa de segurar transação aberta`) só está em
  `wave/api-idle-tx` (`git branch -a --contains 83e7a78`). O `deploy-api-1` subiu em 2026-09-27T11:38:36Z, antes do commit
  (12:24Z) `[MEDIDO]`.
- **Disco (DoD-03a.3), contra o teto da D-1 do owner (~5,7 MB/dia):** 263–265 B por linha. Com 1.440 × 4 × 263 B, isso dá
  **1,51 MB/dia só de tupla**, e ~2,85 com índice pela estimativa de `SPEC-009` §6.1 `[DOC]`. Os dois ficam abaixo do teto ⇒
  **o disco não reprova**. O delta do `hypertable_size` desde o t1 (3.863.470.080 → 3.945.725.952, +82,3 MB em ~1,01 dia) soma
  todos os produtores e não isola o OI, como o t1 já dizia.
- **O que isto decide:** a T-03.7 **não** pode entrar como `done`. Pela D-3 do owner (`handoff/DECISOES-DO-OWNER-2026-09-27.md`),
  o merge da W6 espera por ela. A janela nova de 24 h só começa quando o coletor for destravado, e ela só prova alguma coisa se o
  conserto da API estiver implantado. Sem isso, a 4ª janela cai do mesmo jeito.

## 5. Depois dos testes novos

`find backend -name __pycache__ -prune -exec rm -rf {} +; make test` → **rc=0**: `3419 passed, 1 skipped, 1 xfailed`, 249 s,
96,43%. Os pisos ficam em domain 99,7, use_cases 99,6 e infra 92,6, todos `[OK]`. `oi_candle_regimes.py` está em 100%.
`bash backend/scripts/lint.sh` deu rc=0 `[MEDIDO 2026-09-28]`. Log bruto em `<scratchpad>/make-test-r3-post.log`. O
`make verify` completo (e2e incluído) **não** foi rodado neste portão: o último verde é o do W6-FIX em `a0734b9`, e este laudo só
acrescenta código de teste de backend, que o `make test` acima cobre.

## 6. Ações

1. **T-03.7 / DoD-03a.1 (bloqueia a fase, não o código da 03b):** implantar `83e7a78` seguindo as 2 condições de deploy do
   `WI-INFRA` (a API primeiro e sozinha, `--no-deps`), destravar o coletor, abrir a janela nova de 24 h e medir o t3 com piso
   ≥ 1.368 por símbolo. Quem age é o orquestrador/infra. Este portão não destrava nada.
2. **Código da 03b:** nenhuma ação. D-1 está fechado e morde, e os 2 mutantes que sobreviviam agora morrem com os testes novos.
3. **ETH, F4 a 1,52 bp da borda:** o número vai ao `/architect`. Isto só passa a reprovar acima de 10 bp.
