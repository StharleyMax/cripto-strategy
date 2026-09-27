# W6-QA-BACK — QA de backend da wave W6 (`paineis-de-fluxo`, 03b: T-03.8..T-03.10, mais os laudos da T-03.7)

- **Alvo:** `master...wave/paineis-f03b` em `04cdfd0`, worktree `.claude/worktrees/wave-paineis-f03b`.
  O universo de backend são **18 arquivos** (`git diff --name-only master...wave/paineis-f03b -- backend | wc -l`).
- **Contra:** `plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md` §03b (itens 3b.1–3b.3, DoD-03b 1, 2 e 5 no lado do
  servidor), `ADR-045` (D1, D2, D2-bis, D3 e §Falsificador 1–4) e os `refs` de DoD de T-03.8, T-03.9 e T-03.10
  (`harness tasks json paineis-de-fluxo`).
- **Fora deste laudo:** T-03.11..T-03.14 (`web`, pixel, Playwright, ux-ui-mastery) são do QA de front.
  `gate-record` **não** foi rodado.

```
## QA Gate — Fase 03 (03b) [sentimento]
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request / own.compose-hardcoded-secret
       — `harness rules --mode sweep --path <f>` nos 18 arquivos de backend do diff: 0 BLOQUEIO em 18/18.
       `--changed-only`: rc=0. Controle positivo: um arquivo-isca com `from . import x`, `except: pass` e `print`
       deu 3 BLOQUEIO (relative-import, silent-except, print-statement). A isca foi apagada e o `git status` ficou limpo.
- [OK] web-fullstack.server-test-directory-present — backend/tests/ existe, com 3318 testes coletados.
- [OK] Testes existem e passam — `make test` (rc=0): 3318 passed, 1 skipped, 1 xfailed, 151,12 s.
       Os 8 arquivos focais da 03b: 513 passed (`pytest --no-cov` nos 8 arquivos, 8,55 s).
- [OK] Cobertura 96,42% contra o alvo de 70% (fail_under). Piso por camada (ADR-009/D1): domain 99,7% (meta 90),
       use_cases 99,6% (meta 80), infra 92,6% (meta 70), com 3/3 camadas medidas.
- [OK] DoD da fase (03b, servidor), item a item — §2 abaixo.
- [OK] Mutação: 21 mutantes não equivalentes, 21 mortos. 1 mutante equivalente foi descartado com prova (§3).
- [anomalia→pendência] T-03.7 (DoD-03a.1, 24 h ≥ 1.368/símbolo) SEM veredito: a janela nova vai de
       2026-09-27T11:39Z a 2026-09-28T11:39Z e estava em 9 h 43 min quando medi (§4). Não é defeito da 03b.
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED (03b backend: T-03.8, T-03.9, T-03.10). T-03.7 NÃO está coberta por este APPROVED.
```

## 1. Rodado antes de qualquer teste novo

- `find backend -name __pycache__ -prune -exec rm -rf {} +; make test` → **rc=0**. Resultado: `3318 passed, 1 skipped,
  1 xfailed`, `TOTAL 11016 stmts / 363 miss / 96.42%`, `Required test coverage of 70.0% reached`. Log bruto em
  `<scratchpad>/make-test-1.log`, não versionado `[MEDIDO 2026-09-27T21:2xZ]`.
- Cobertura dos módulos novos no mesmo run: `oi_candle.py` 112/0 (30 br), `oi_candle_regimes.py` 74/0 (18 br),
  `oi_candle_falsifiers.py` 113/0 (34 br), `series_history_report.py` 48/0, `csv_series_window_reader.py` 43/0,
  `oi_candle_falsifier_cli.py` 69/0, `measure_oi_candle_falsifiers.py` 58/0. Todos estão em **100%**. `use_cases/series_history.py`
  está em 98%, e as linhas sem cobertura são `709, 713->703`. `git blame` põe as duas em `43820f32`/`f75b9b6d` (2026-09-22),
  ou seja, são **pré-existentes** e fora do diff.
- `bash backend/scripts/lint.sh`: ruff "All checks passed!", format "488 files already formatted", mypy "no issues
  found in 488 source files".
- **Nenhum teste novo foi criado.** A bancada de mutação (§3) não deixou nenhum sobrevivente não equivalente, então não
  apareceu lacuna para um teste cobrir.

## 2. DoD, item a item (lado do servidor)

| item | exigência | evidência | ok |
|---|---|---|---|
| T-03.8 / 3b.1 | trio `(STOCK, POINT, POINT_AT_BUCKET_END)`, e outro trio falha alto | `oi_candle.py:84-88,362-365` (`UncoveredOiCandleTrioError`). Mutante M07 (checagem desligada) **morto** | OK |
| T-03.8 | `g` vem do `SeriesKey`/catálogo, nunca do chamador | `oi_candle.py:295-298` lê `entry.native_grid_ms`. M09 (`effective` ignora `g`) e M06b (`g` fixo em 1 min) **mortos** | OK |
| T-03.8 | `low ≤ min(o,c) ≤ max(o,c) ≤ high`; nenhuma linha com `open_at_ms == close_at_ms` | `OiCandle.__post_init__`, `oi_candle.py:193-206`. Todo candle servido passa pelo construtor, inclusive todos os do replay real da §2.1, e os 4 símbolos saíram com rc=0, sem exceção. M01 (high/low sem o `open`) **morto** | OK |
| T-03.8 | `samples.expected = TF/g` | `oi_candle.py:299` (`bucket_ms // grid_ms`, com `bucket_ms = max(TF, g)`). M06b e M06c **mortos**. M06 é equivalente (§3) | OK |
| T-03.8 MORDE | costurar âncora sobre buraco | a âncora é busca exata em `dict` (`oi_candle.py:337`), e o `as_of` com carry-forward é filtrado em `series_history.py` (`projection()["bucket_end"] != instant`). M05 (âncora = última leitura ≤ T0) e M16 (carry-forward aceito) **mortos** | OK |
| T-03.9 / 3b.2 | D2-bis: polling se há `p_poll(T0)`, `openInterestHist` senão | `oi_candle_regimes.py:201-229`. M10 (polled sem âncora servido), M11 (histórico nunca cede) e M12 (em `1m`, o histórico só cede no próprio T0) **mortos** | OK |
| T-03.9 MORDE / DoD-03b.5 | âncora do histórico com amostras do polling | é estrutural: nenhuma lista mistura as duas séries (`project_oi_candles` roda uma vez por série). M13 (slot trocado) e M14 (dois instrumentos) **mortos** | OK |
| T-03.9 | a rota serve `OiCandle` com `derived_from ∈ {binance_poll_1m, binance_point_5m}` e `samples` | `series_history_report.py` (`oi_candles`, `null` explícito fora de OI); `tests/api/test_series_history_route.py` fixa os 10 campos da §6.4 por HTTP real. M17 (outro regime nunca lido), M18 (`oi_candles` sempre `null`) e M20 (`derived_from` trocado na tabela) **mortos** | OK |
| T-03.10 / DoD-03b.1 | close == `last` servido e `open(Bₖ) == close(Bₖ₋₁)`, n ≥ 288 por regime, sem divergência | replay independente, §2.1 | OK |
| T-03.10 / DoD-03b.2 | mediana de `\|poll−hist\|/hist` ≤ 10 bp, n ≥ 288 | replay (§2.1) e recomputação crua sem o código de produção (§2.2) | OK |
| ADR-045 F3 | com âncora e sem buraco, corpo zero em ≤ 50%, n ≥ 200 | replay (§2.1) e contagem crua (§2.2) | OK |

### 2.1 Replay dos falsificadores sobre um export NOVO (não é o CSV do builder)

Export só de leitura (`PGOPTIONS=-c default_transaction_read_only=on -c lock_timeout=3000 -c statement_timeout=120000`),
com a receita de `handoff/T-03.10.md` §"Leitura do dado real": 8 séries, `bucket_end >= 1789603200000`, **40.030 linhas**
(`wc -l`, com cabeçalho), `sha256` com prefixo `3baa23f632557671`, feito em 2026-09-27T21:22Z. O do builder tinha
38.106 linhas, às 14:41Z. Comando: `python -m src.modules.sentimento.infra.oi_candle_falsifier_cli <csv> <SYM>
1789603200000 1790544000000 1790544000000`. Os 4 símbolos saem com **rc=0** `[MEDIDO]`:

| símbolo | poll 1m close/âncora/poder (n, div\|flat) | poll 5m | hist 5m | F4 n · mediana · máx |
|---|---|---|---|---|
| BTC | 1860/0 · 1858/0 · 1860/0 | 371/0 · 370/0 · 371/0 | 2262/0 · 2256/0 · 2262/0 | 371 · **0,715 bp** · 4,08 |
| ETH | 1860/0 · 1858/0 · 1860/0 | 371/0 · 370/0 · 371/0 | 2161/0 · 2157/0 · 2161/0 | 371 · **8,478 bp** · 18,66 |
| LINK | 1852/0 · 1846/0 · 1852/0 | 369/0 · 368/0 · 366/0 | 2084/0 · 2077/0 · 2084/0 | 370 · **1,848 bp** · 21,93 |
| SOL | 1860/0 · 1858/0 · 1860/0 | 371/0 · 370/0 · 371/0 | 2126/0 · 2121/0 · 2126/0 | 372 · **3,216 bp** · 7,97 |

O poll 5m do BTC subiu de n=291 (builder) para **371**: a janela nova contínua da T-03.7 tirou o `n` do regime de polling
da borda de 288. **ETH continua a 1,52 bp do limiar** (8,478 contra 10), com o mesmo nível que o builder mediu
(8,496, n=291). Continua sendo um sinal para o `/architect`, e não uma reprovação.

### 2.2 Recomputação crua, sem passar pelo código de produção

Python solto sobre o CSV, sem importar nada de `src/`. Ele compara os `value_raw` de instantes adjacentes da mesma série e
os pares poll/hist nos instantes `T % 300000 == 0`:

- **F3:** pares adjacentes com o valor igual: **0** em todas as 8 séries (1.855 a 2.631 pares por série). Isso bate com
  o `flat=0` do CLI.
- **F4:** BTC n=372 com mediana 0,715 · ETH n=372 com 8,478 · LINK n=371 com 1,848 · SOL n=373 com 3,215 bp. Bate com o CLI
  até a 3ª casa. O `n` vem +1 porque o CLI corta o último instante pelo `knowledge_time` e a conta crua não corta.

## 3. Verde não prova nada até uma mutação reprovar

A bancada fica em `<scratchpad>/qa_mutate.py` (sha256 `bbb89c039abedf16…`, não versionada). Para cada mutante ela faz
uma substituição exata (e recusa se o padrão aparecer ≠ 1 vez), purga `__pycache__`, roda `pytest --no-cov -x -p no:cacheprovider`
nos 8 arquivos focais e restaura o arquivo. A baseline deu rc=0 e, no fim, `git status --porcelain` saiu vazio.
Os mutantes são **meus**, diferentes dos 16 do builder, que atacavam o módulo dos falsificadores. Estes atacam a
projeção, a escolha de regime e a leitura na rota:

| # | mutação | resultado |
|---|---|---|
| M01 | high/low sem o `open` | morto |
| M02 | `closed` com `<` | morto |
| M03 | bucket por floor em vez de ceil (`(T0,T1]` vira `[T0,T1)`) | morto |
| M04 | doji com `\|S\|=1` sem âncora | morto |
| M05 | âncora costurada na última leitura ≤ T0 | morto |
| M06 | `expected = max(1, TF//g)` | **sobreviveu, e é EQUIVALENTE**: com `TF % g == 0` imposto e `bucket_ms = max(TF, g)`, as duas expressões coincidem em todo domínio válido |
| M06b | `expected = bucket_ms // 60_000` | morto |
| M06c | `expected = TF // g` | morto |
| M07 | checagem do trio desligada | morto |
| M08 | leitura fora da grade aceita | morto |
| M09 | TF efetivo ignora `g` | morto |
| M10 | D2-bis: candle polled sem âncora servido | morto |
| M11 | D2-bis: histórico nunca cede | morto |
| M12 | 1m: histórico cede só no próprio T0 | morto |
| M13 | checagem de slot desligada | morto |
| M14 | checagem de instrumento desligada | morto |
| M15 | instantes perdem a âncora do 1º bucket | morto |
| M16 | carry-forward aceito como leitura | morto |
| M17 | o outro regime nunca é lido | morto |
| M18 | `oi_candles` sempre `null` no envelope | morto |
| M19 | `knowledge_time` ignorado nas leituras | morto |
| M20 | `derived_from` trocado na tabela | morto |

**21/21 não equivalentes mortos** `[MEDIDO]`.

## 4. T-03.7: os laudos, e por que ela não está aprovada aqui

- `gates/T-03.7-t1.md` dá `COUNT_LOW_AND_DISK_HIGH`: 1.280/1.368 por símbolo, com a causa em operação (coletor preso
  11 h atrás de `idle in transaction` da API), e 1,52 MB/dia de tupla contra 1,14.
- `handoff/DECISOES-DO-OWNER-2026-09-27.md` registra `[DECISÃO-OWNER: 2026-09-27, escolha entre alternativas apresentadas]`:
  D-1 sobe o teto de disco para ~5,7 MB/dia (1,52 medido fica dentro dele); D-2 cuida do idle-in-transaction; D-3 deixa
  a 03b correr em paralelo, mas **o merge da W6 só acontece depois de a T-03.7 passar**.
- **Medição de progresso** (só leitura, `default_transaction_read_only=on`, `lock_timeout=3s`), `count` por
  `series_key_id` das 4 séries de polling com `bucket_end >= 1790509140000` (11:39Z), às 21:22:29Z: BTC/ETH/SOL
  **584/584** minutos (contíguos, 11:39Z→21:22Z), LINK **580/584** `[MEDIDO]`. O coletor está vivo, mas a janela de 24 h
  só fecha em **2026-09-28T11:39Z**. **DoD-03a.1 continua sem prova**, e este laudo não a aprova.
- A consequência para o orquestrador: T-03.7 **não pode** entrar como `done` num `tasks resolve` da fase 03 com base
  neste laudo, e o merge da W6 segue bloqueado pela D-3.

## 5. Ações

Nenhuma correção de código foi pedida. Ficam três pendências fora do código da 03b:

1. **T-03.7:** medir o t2 depois de 2026-09-28T11:39Z. O piso é ≥ 1.368 por símbolo. O disco é julgado contra o teto
   novo da D-1.
2. **ETH, F4 a 1,52 bp da borda:** o número vai ao `/architect`, como o builder já registrou. Isto não reprova, e só
   passa a reprovar se a mediana passar de 10 bp.
3. O QA de front (T-03.11..T-03.14, DoD-03b 3, 4 e 6) é outro portão e não é coberto aqui.
