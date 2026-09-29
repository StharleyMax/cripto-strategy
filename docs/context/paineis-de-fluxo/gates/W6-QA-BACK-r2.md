# W6-QA-BACK-r2 — QA de backend da wave W6 (`paineis-de-fluxo`, 03b), revalidação em `0b1b5b3`

- **Alvo:** `master...wave/paineis-f03b` em `0b1b5b3`, worktree `.claude/worktrees/wave-paineis-f03b`. O backend **não mudou**
  desde o r1 (`git diff --name-only 04cdfd0..HEAD -- backend` sai vazio). O universo de backend continua sendo **18 arquivos**
  (`git diff --name-only master...HEAD -- backend | wc -l`).
- **Contra:** `plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03b (3b.1–3b.3 e DoD-03b 1, 2 e 5 no lado do servidor),
  `ADR-045` (D1, D2, D2-bis e §Falsificador 1–4) e os `refs` de T-03.8, T-03.9 e T-03.10 (`harness tasks json`).
  T-03.11..T-03.14 são `web` e ficam com o QA de front (`W6-QA-FRONT*`). Este laudo **não** as cobre.
- **O que o r2 acrescenta ao r1:** uma bancada de mutação nova (26 mutantes, nenhum repetido do r1), um arquivo de teste
  novo e **um defeito provado** (D-1). `gate-record` **não** foi rodado.

```
## QA Gate — Fase 03 (03b) [sentimento]
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request / own.compose-hardcoded-secret
       — `harness rules --mode sweep --path <f>`: 0 BLOQUEIO nos 18 arquivos do diff e no teste novo.
       Controle positivo: uma isca em backend/tests/ deu 3 BLOQUEIO (relative-import, silent-except,
       print-statement). A isca foi apagada.
- [OK] web-fullstack.server-test-directory-present — backend/tests/ existe e roda 3410 testes.
- [OK] Testes existem e passam — `make test` rc=0 antes (3318 passed, 1 skipped, 1 xfailed, 131 s) e depois
       dos testes novos (3410 passed, 1 skipped, 2 xfailed, 190 s). `bash backend/scripts/lint.sh` rc=0.
- [OK] Cobertura 96,42% contra o alvo de 70% (fail_under). Pisos por camada: domain 99,7% (meta 90),
       use_cases 99,6% (meta 80), infra 92,6% (meta 70). Os 7 módulos novos estão em 100%.
- [FAIL] DoD da fase, item a item — ADR-045/D2-bis violado na borda esquerda de uma janela `1m` (D-1, §2).
- [OK] Falsificadores 1–4 de ADR-045 num export NOVO (23:04Z): 4 símbolos rc=0, 0 divergência. ETH F4 8,476 bp.
- [OK] Mutação: 26 mutantes → 21 mortos e 5 equivalentes, cada equivalente com prova (§3). Antes dos testes
       novos, 3 não equivalentes sobreviviam (R08, R18 e R24).
- [anomalia→pendência] T-03.7 (DoD-03a.1) SEM veredito: a janela de 24 h só fecha em 2026-09-28T11:39Z (§4).
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: NEEDS_FIX
Ações: 1. Corrigir D-1 (§2) e retirar o `xfail(strict=True)` do teste que o prova. 2. T-03.7: t2 depois de 11:39Z.
```

## 1. Rodado antes de qualquer teste novo

- `find backend -name __pycache__ -prune -exec rm -rf {} +; make test` → **rc=0**: `3318 passed, 1 skipped, 1 xfailed`,
  `TOTAL 11016 stmts / 363 miss / 96.42%`, pisos domain 99,7 / use_cases 99,6 / infra 92,6. São os mesmos números do r1, o que
  é o esperado com o backend intocado. Log bruto em `<scratchpad>/make-test-r2.log`, não versionado `[MEDIDO 2026-09-27T23:00Z]`.
- Cobertura dos módulos do diff: `oi_candle.py`, `oi_candle_regimes.py`, `oi_candle_falsifiers.py`, `series_history_report.py`,
  `csv_series_window_reader.py`, `oi_candle_falsifier_cli.py` e `measure_oi_candle_falsifiers.py` estão em 100%.
  `use_cases/series_history.py` está em 98%. As linhas `709, 713->703` já eram pré-existentes no r1 (blame de 2026-09-22).

## 2. D-1: `D2-bis` violado na borda esquerda de uma janela `1m` (defeito PROVADO)

**A regra** (`ADR-045/D2-bis`, `plano 03` 3b.2): *"Se o bucket do TF tem ponto de polling em `T0`, ele é montado **só** com a
série de polling"*.

**O que acontece:** em TF `1m`, o histórico é servido no bucket efetivo de 5 min, e os polled buckets dele são julgados por
`_polling_anchors_inside` (`domain/oi_candle_regimes.py:235-254`) contra `poll_instants`. Só que `poll_instants` vem de
`_oi_fact_instants(poll_entry)` (`use_cases/series_history.py`, na função `_oi_fact_instants`), que começa em
`ceil(window_start, 1 min) − 1 min`. **O `T0` do primeiro bucket de histórico** é `ceil(window_start, 5 min) − 5 min`, que
pode ficar até 4 min **antes** disso. Um `p_poll(T0)` à esquerda do primeiro minuto da janela nunca é visto, e o histórico
serve um bucket que `D2-bis` dá ao polling.

**A prova:** o teste
`backend/tests/sentimento/test_oi_candles_route_invariants.py::test_in_1m_a_polled_anchor_left_of_the_window_still_owns_the_history_bucket`
monta o histórico em `p(0), p(5), p(10), p(15)` e o polling em `p(5)`, com buraco de 6 a 9 e pontos de 10 a 15.

| janela `1m` | o que se serve em `bucket_end = 10` |
|---|---|
| começa no minuto 4 | nada. O polling tem `p(5)`, que é o `T0` do bucket, e `(5,6]` não tem amostra. É a resposta que o domínio dá |
| começa no minuto 7 | **`binance_point_5m`, com `open_at_ms = T0 = 5`**, num bucket cujo `T0` tem ponto de polling |

Sem o marcador, o teste falha assim: `Left contains one more item: ('binance_point_5m', 1789171500000)`. `1789171500000` é o
minuto 5 `[MEDIDO]`. Ele entra como `xfail(strict=True)`, o mesmo padrão que o `/qa` já usou em
`test_publication_lag_table.py:577`. A suíte continua verde, e o teste vira XPASS e reprova sozinho quando alguém corrigir o
defeito. **Quem corrigir retira o marcador.**

**O alcance:** acontece só em TF `1m`, que é o único TF em que o bucket do histórico (5 min) é mais largo que o do polling.
O passo do eixo é 1 min (`charts/s2-panels.ts:73`, `S2_AXIS_STEP_MS`), e por isso o início de uma página `1m` cai em qualquer
minuto. Para disparar, o dado precisa de um `p_poll` num minuto múltiplo de 5 seguido de ≥ 4 min sem polling, que é o começo
de uma parada do coletor numa fronteira de 5 min. **No dado real de hoje isso aparece 0 vezes** (varredura das 4 séries de polling
do export de 23:04Z, 1.962 a 1.966 minutos por símbolo `[MEDIDO]`). O defeito é **latente, de severidade baixa**, mas contraria a
ADR, pode ser atingido pela UI e deixa a resposta da rota depender de onde a página começa. O mesmo módulo proíbe exatamente isso
para `rows` (`series_history.py:360-363`, *"a wide bucket at the left edge of the window is never composed from a truncated slice
of its own native facts"*).

**Correção** (é do builder, não deste portão): o universo de `poll_instants` que decide o histórico tem de alcançar o `T0` do
primeiro bucket **do histórico**, e não o do polling. Outra saída é o domínio recusar servir um bucket de histórico que comece
antes do primeiro instante de polling lido.

### 2.1 DoD, item a item (lado do servidor)

| item | evidência | ok |
|---|---|---|
| T-03.8 / 3b.1: trio e `g` do catálogo | r1 §2 (M07, M09, M06b mortos) e, neste r2, R13, R14 e R15 mortos | OK |
| T-03.8: `low ≤ min(o,c) ≤ max(o,c) ≤ high`, sem `open_at == close_at` e `expected = TF/g` | `OiCandle.__post_init__` passou em todos os candles do replay (§2.2), ≥ 26.658 pela soma dos `n` de F1, sem exceção | OK |
| T-03.9 / 3b.2 / DoD-03b.5: um candle, uma série | disjunção e pureza de série valem (`test_oi_candle_regimes.py:258`). **Na borda `1m`, a escolha contraria D2-bis** (D-1) | **FAIL** |
| T-03.9: rota com `derived_from` e `samples` | `tests/api/test_series_history_route.py:271` (HTTP real). Os 3 invariantes novos, nos 5 TFs, passam 90/90 | OK |
| T-03.10 / DoD-03b.1 e 03b.2, ADR-045 F3 e F4 | §2.2 | OK |

### 2.2 Falsificadores 1–4 num export NOVO

Export só de leitura (`PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000`), com a
receita de `handoff/T-03.10.md`: as 8 séries, `bucket_end >= 1789603200000`, **40.514 linhas** (`wc -l`, com cabeçalho),
`sha256` com prefixo `6df36de443c28224`, feito em 2026-09-27T23:04Z. O do r1 tinha 40.030 linhas. O comando foi
`python -m src.modules.sentimento.infra.oi_candle_falsifier_cli <csv> <SYM> 1789603200000 1790550000000 1790550000000`, e os 4
símbolos saem com **rc=0**. Todos os veredictos saem `held` e nenhum tem divergência `[MEDIDO]`:

| símbolo | poll 1m close/âncora/poder (n) | poll 5m | hist 5m | F4 n · mediana · p90 · máx (bp) |
|---|---|---|---|---|
| BTC | 1960 · 1958 · 1960 | 391 · 390 · 391 | 2262 · 2256 · 2262 | 391 · **0,715** · 0,938 · 4,08 |
| ETH | 1960 · 1958 · 1960 | 391 · 390 · 391 | 2161 · 2157 · 2161 | 391 · **8,476** · 8,641 · 18,66 |
| LINK | 1952 · 1946 · 1952 | 389 · 388 · 386 | 2084 · 2077 · 2084 | 390 · **1,851** · 2,316 · 21,93 |
| SOL | 1960 · 1958 · 1960 | 391 · 390 · 391 | 2126 · 2121 · 2126 | 392 · **3,218** · 3,672 · 7,97 |

F3: `flat = 0` em todo regime (corpo zero em 0% contra o teto de 50%). O ETH segue a **1,52 bp** do limiar de F4, estável desde o
builder (8,496) e o r1 (8,478). Isso é sinal para o `/architect`, não reprovação.

## 3. A bancada de mutação do r2

A bancada fica em `<scratchpad>/qa_mutate_r2.py` e `qa_mutate_r2b.py`, não versionadas. Cada mutante é uma substituição exata
(recusada se o padrão não aparecer exatamente 1 vez). Antes de cada rodada a bancada purga `__pycache__`, roda
`pytest --no-cov -x -p no:cacheprovider` separadamente sobre os 9 arquivos focais existentes e sobre o arquivo novo (com
`-k "not left_of_the_window"`, para o xfail não contar como morte) e depois restaura o arquivo. A baseline deu rc=0 nos dois
conjuntos, e `git status` terminou só com o teste novo.

| # | mutação | existentes | novo | resultado |
|---|---|---|---|---|
| R01 | leitura da outra série com `lookback 0` | vivo | vivo | **equivalente**: `oi_point_readings` descarta todo carry-forward (`bucket_end != t`), então fato anterior a `T0` nunca vira leitura |
| R02 | leitura da outra série começa em `T0 + g` | vivo | vivo | **equivalente**: `lookback = max(1m, g, staleness) = 2g` nas duas séries, e o limite inferior `T0 − g` ainda contém `T0` |
| R03 | leitura da outra série termina um `g` antes | morto | morto | morto |
| R04 / R05 | instantes perdem o primeiro `T0` / o último `T1` | morto | morto | morto |
| R06 | instantes a cada 1 min, qualquer que seja `g` | vivo | vivo | **equivalente**: instantes fora da grade nunca casam `bucket_end == t` e são descartados |
| R07 | leituras perguntadas sob `INTRABAR` (`t` em vez de `t + 59.999`) | vivo | vivo | **equivalente**: R-1 é `available_at <= knowledge_time` (ADR-042), e R-2 admite o mesmo fato de grade nos dois `t` |
| R08 | `closed` julgado no fim da janela, não no `knowledge_time` | **vivo** | morto | morto só pelo teste novo |
| R09 / R10 | o histórico cede só ao `T0` do próprio início / a qualquer leitura de polling | morto | morto/vivo | morto |
| R11 / R12 | candles sem ordenação / checagem de grade desligada | morto | vivo | morto |
| R13 / R14 / R15 | `open` sem âncora na penúltima amostra / exige ≥ 3 / `present` conta a âncora | morto | vivo | morto |
| R16 / R25 / R26 | F1 / F4 / F3 com `n <=` no limiar | morto | morto/— | morto |
| R17 / R19 / R20 / R21 / R22 | F3 `>=`; F4 dividido pelo poll; F3 sem checagem de buraco; F2 contra o regime vizinho; F1 com bucket aberto | morto | — | morto |
| R18 | F4 com `median >= 10 bp` | **vivo** | morto | morto só pelo teste novo |
| R23 | leitura da outra série perde `T0` de verdade (`T0 + g` e lookback 0) | morto | morto | morto |
| R24 | limites da leitura da outra série calculados na grade da série pedida | **vivo** | morto | morto só pelo teste novo |

Resultado: **21/21 não equivalentes mortos** e 5 equivalentes provados acima `[MEDIDO]`. Os 3 que só o teste novo mata (R08,
R18 e R24) eram lacunas reais da suíte da 03b.

**O teste novo**, `backend/tests/sentimento/test_oi_candles_route_invariants.py`, com 92 itens mais 1 xfail, roda em 15 s:
- três invariantes da rota com semente, nos 5 TFs × 6 sementes: a mesma resposta para qualquer um dos dois ids, a rota contra
  o oráculo de domínio sobre as leituras armazenadas, e o mesmo candle para um bucket que termina dentro de duas janelas;
- `closed` julgado no `knowledge_time` do pedido;
- os limiares dos falsificadores exatamente na borda;
- o xfail de D-1.

Ele passa em `ruff`, `ruff format` e `mypy`, e `harness rules` dá 0 BLOQUEIO. Os invariantes com semente **não** acharam D-1
sozinhos, porque o padrão de dado é raro, e é por isso que o caso fixo existe.

## 4. T-03.7: sem veredito (fora do código da 03b)

- Os laudos continuam como no r1: `gates/T-03.7-t1.md` dá `COUNT_LOW_AND_DISK_HIGH`, e `handoff/DECISOES-DO-OWNER-2026-09-27.md`
  registra D-1, D-2 e D-3 `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`. Pela D-3, **o merge da W6 só
  acontece depois de a T-03.7 passar**.
- **Progresso** (só leitura): `count` por símbolo das 4 séries de polling com `bucket_end >= 1790509140000` (11:39Z), às
  2026-09-27T23:04:20Z. BTC, ETH e SOL têm **686/686** minutos contíguos, e LINK tem **682/686** `[MEDIDO]`. A janela de 24 h
  fecha em **2026-09-28T11:39Z**, e a DoD-03a.1 (≥ 1.368 por símbolo) continua sem prova. T-03.7 **não** pode entrar como
  `done` com base neste laudo.

## 5. Ações

1. **D-1 (bloqueia este portão):** alinhar o universo de `poll_instants` ao `T0` do primeiro bucket de histórico em TF `1m`, e
   retirar o `xfail(strict=True)` do teste que prova o defeito. Na revalidação, peça a mutação: com a correção revertida, o teste
   tem de falhar.
2. **T-03.7:** medir o t2 depois de 2026-09-28T11:39Z, com piso ≥ 1.368 por símbolo e o disco julgado contra o teto de ~5,7 MB/dia
   da D-1 do owner.
3. **ETH, F4 a 1,52 bp da borda:** o número vai ao `/architect`. Isto só passa a reprovar acima de 10 bp.
