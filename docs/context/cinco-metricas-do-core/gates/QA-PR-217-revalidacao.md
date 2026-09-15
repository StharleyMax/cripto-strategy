# QA — revalidação da PR #217 (`D16`: atraso de publicação e alinhamento de grade)

- **branch** `ciclo/d16-atraso-medido-e-alinhamento-de-grade`, cabeça `7dab8a9`
- **base** `origin/master` — `git rev-list --left-right --count origin/master...HEAD` → `0	9`
- **pareceres de origem** [`QA-D16-atraso-de-publicacao.md`](QA-D16-atraso-de-publicacao.md),
  [`O4-alinhamento-de-grade-qa.md`](O4-alinhamento-de-grade-qa.md),
  [`O4-revalidacao-qa.md`](O4-revalidacao-qa.md) — os três `NEEDS_FIX`
- **ambiente**: worktree `agent-aa54689fa3978517c`; `data` → symlink para o checkout principal
  (gitignored e ausente sem ele o portão `test-frontend` RECUSA medir, `rc=3`); `__pycache__`
  purgado antes e depois (`92` diretórios na primeira purga), `PYTHONDONTWRITEBYTECODE=1`
  exportado em toda execução. Postgres **não foi tocado** — nenhuma query, nenhum deploy.

---

## VEREDITO: `NEEDS_FIX` — 2 ações, ambas provadas, nenhuma no código de produção do `D16`

O que esta revalidação foi chamada para checar **passou inteiro**: os 6 testes do apagão mordem de
verdade, e o `_supervised` das 6 threads sobreviveu ao merge. O que reprova é outra coisa, e é o
que o merge coloca na master: **um portão vermelho evitável** e **uma afirmação falsa viva em
código de produção**, refutada por uma medição da própria PR.

---

## 1 · O foco do despacho — os 6 testes do apagão MORDEM. Provado por mutação, não presumido

`7dab8a9` passou a mandar `klines_cycle_offset_s` no driver de morte de thread
(`backend/tests/helpers/collectors_cli_thread_kill_driver.py:211`). Os 3 drivers hoje passam o
campo — `collectors_cli_driver.py:321` (`0.0`), `collectors_cli_postgres_driver.py:73` (`0.0`),
`collectors_cli_thread_kill_driver.py:211` (`2.0`).

**Base:**

```
cd backend && .venv/bin/python -m pytest \
  tests/sentimento/test_collectors_cli_every_thread_death_exits.py -q --no-cov -p no:randomly
# ......                                                                   [100%]
# 6 passed   [MEDIDO 2026-09-15]
```

**MUTANTE-K** — `_supervised` arrancado de `collector-klines` (`collectors_cli.py:2412-2418`,
`target=_supervised(_run_klines_collector, …)` → `target=_run_klines_collector`):

```
FAILED …test_each_collector_thread_death_exits_the_process[collector-klines]
```

**MUTANTE-L** — o mesmo em `collector-liquidation` (a 6ª thread, a que veio da master):

```
rc=1
.....F                                                                   [100%]
FAILED …test_each_collector_thread_death_exits_the_process[collector-liquidation]
E  AssertionError: collector-liquidation died of an unhandled exception and the process was
   STILL ALIVE after 40.0s — the 18h45 outage, for this thread
```

Duas leituras que valem mais que o `rc`:

1. **o mutante morre pelo `timed_out`, não pelo `returncode != 0`.** É a diferença exata que
   `7dab8a9` existe para restaurar: antes dele o driver estourava `TypeError` na primeira linha e
   satisfazia `returncode != 0` sem nunca subir thread nenhuma — o `rc` ambíguo de `ADR-012` pelo
   lado do vermelho. Agora o que reprova é a mensagem **`STILL ALIVE after 40.0s`**, que só pode
   vir de um processo que subiu, matou a thread e continuou vivo;
2. **`.....F` — 1 reprova, 5 passam.** O mutante é morto pelo SEU parâmetro e por mais nenhum: o
   teste discrimina qual thread perdeu a rede, não só que alguma perdeu.

Produção restaurada por cópia; `sha256sum -c` →
`src/modules/sentimento/infra/collectors_cli.py: SUCESSO`, e `git status --porcelain` vazio.

## 2 · O `_supervised` e as 6 threads sobreviveram ao merge — checado no código pós-merge

```
grep -n "_supervised\|Thread(" backend/src/modules/sentimento/infra/collectors_cli.py
# 1833: def _supervised(
# 2374/2393/2412/2434/2455/2475: threading.Thread(target=_supervised(…))   -> 6 de 6
```

`force-order` · `premium-index` · `klines` · `open-interest` · `long-short` · `liquidation`.
Nenhuma thread crua. A ordem carga do handler (`exit_code[0] = 1`; `failure_event.set()`; só então
`logger.critical`) está intacta em `collectors_cli.py:1891-1903`. O guarda de cadência não-finita
que o `O4-revalidacao-qa.md` pedia está em `collectors_cli.py:549`
(`if not value > 0 or not math.isfinite(value):`) — **aquele gate não tem mais ação em aberto**.

## 3 · O portão — `make verify`, 8 portões, uma chamada

```
bash scripts/verify.sh
=== verify · agent-aa54689fa3978517c · 20260915T171348Z (UTC) ===
[OK       ] lint-backend    rc=0  452 source files
[OK       ] lint-frontend   rc=0  ESLint + tsc --noEmit --strict do projeto sobre frontend/src
[OK       ] test-frontend   rc=0  592 pass, 0 fail em 4 suítes (app/charts/s1/s3)
[FALHA    ] test            rc=1  2481 passed · Total coverage: 96.63%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK       ] política        rc=0
[OK       ] e2e             rc=0  27 passed (34.6s)
[----     ] diff            sem mudança não-commitada
veredito: VERMELHO — algum portão mediu e REPROVOU
```

- `grep -c '^FAILED'` no log bruto: **`1`**. `1 failed, 2481 passed, 1 skipped, 3 deselected,
  5 warnings in 554.78s`. O único vermelho é
  `test_publication_lag_table.py::test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away`.
- **Regras bloqueantes: 8 de 8** avaliadas pelo portão `regras`, `0` bloqueio
  (`harness rules list --severity block` → 8 regras).
- **Piso por camada — medido nesta rodada, e é a anomalia do gate anterior resolvida.**
  `backend/scripts/test.sh:37` é `set -euo pipefail` e o piso é a linha `53`, **depois** do
  `pytest` da linha `52`: com a suíte vermelha o portão nunca alcança o piso. Rodei-o direto sobre
  o `coverage.xml` da mesma rodada:

  ```
  bash backend/scripts/check-coverage-layers.sh     # rc=0
  [OK  ] domain      99.7% (meta 90%)  [4150/4161 linhas]
  [OK  ] use_cases   99.7% (meta 80%)  [1218/1222 linhas]
  [OK  ] infra       93.0% (meta 70%)  [3579/3850 linhas]
  universo: 3 camada(s) medida(s) de 3 declarada(s)
  ```

  Total global `96,63%` contra `fail_under = 70`. **Cobertura não reprova nada aqui.**

---

## ⛔ AÇÃO 1 — o vermelho declarado é EVITÁVEL, e mergeá-lo torna a master ambígua para sempre

`test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away`
(`backend/tests/sentimento/test_publication_lag_table.py:577`) é **novo desta PR** —
`git ls-tree -r --name-only origin/master | grep publication_lag_table` → **nenhuma linha**. Logo
a master hoje é verde e **este merge a deixa vermelha**, e vermelha até um deploy + remedição que
esta PR não pode fazer (o próprio docstring do teste, `:592-604`, diz que só a remedição
pós-deploy o vira).

O gate anterior aceitou o vermelho porque estava *declarado*. Declarar não basta quando existe
instrumento: uma master permanentemente vermelha faz todo portão futuro devolver `rc=1`, e o
próximo leitor não consegue separar a regressão dele deste vermelho herdado. É o modo de falha do
`rc` ambíguo de `ADR-012`, só que instalado na master de propósito.

**E o registro executável não precisa ser perdido para consertar isso — medi.** Com
`@pytest.mark.xfail(strict=True, reason="D16: uncensored live p99 overshoots the native grid")`
sobre esse único teste:

```
# (a) hoje, com o dado real: o arquivo inteiro fica VERDE e o registro continua no lugar
.venv/bin/python -m pytest tests/sentimento/test_publication_lag_table.py -q --no-cov -p no:randomly
# ...........................................x                             [100%]      rc=0

# (b) MUTACAO DE DADO — a cauda de KLINES_UNCENSORED_LAG_TAIL_MS trazida para dentro da grade,
#     que e exatamente o que a remedicao pos-deploy vai fazer:
# ...........................................F                             [100%]      rc=1
# [XPASS(strict)] D16: uncensored live p99 overshoots the native grid
# FAILED …test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away
```

`[MEDIDO 2026-09-15; arquivo de teste restaurado por cópia, `git status --porcelain` vazio]`

`strict=True` é o ponto todo: **o teste continua mordendo**, e morde do lado certo — no dia em que
o dado melhorar ele REPROVA, obrigando a substituir `KLINES_UNCENSORED_LAG_TAIL_MS` /
`KLINES_UNCENSORED_SAMPLE_N` pela nova medição, que é literalmente o que o docstring `:601` manda
fazer. Hoje o vermelho depende de alguém lembrar; com `xfail(strict=True)` o portão cobra sozinho.

**A ação:** marcar esse único teste com `xfail(strict=True)`, mantendo o docstring inteiro (ele é
o registro do defeito e não deve encolher), e `make verify` fecha **VERDE** com `0` afirmação
enfraquecida. ⛔ **Não relaxe a asserção** — `NATIVE_GRID_MS[KLINES]` é a grade medida do venue.

## ⛔ AÇÃO 2 — afirmação FALSA viva em código de PRODUÇÃO, refutada pela própria PR

`backend/src/modules/sentimento/domain/publication_lag_table.py:51`:

> `nb = 2` (210 rows) is the ambiguous middle — a live poll that caught up after a gap, or a
> two-bucket backfill — and it is EXCLUDED rather than guessed at

`backend/tests/sentimento/test_publication_lag_table.py:551-559`, no MESMO commit, mede o
contrário e diz o nome:

> The `nb = 2` rows are **not** the "ambiguous middle" the module's docstring calls them — they
> are provably LATE LIVE POLLS … all `105` groups span exactly `60_000` ms (two consecutive
> buckets) … Every backfill group measured spans `1_079`-`1_500` buckets; no path produces a
> two-bucket request.

As duas frases não podem ser verdade ao mesmo tempo, e a que está errada é a de produção. O
handoff é explícito: *"Remova a afirmação falsa em vez de empilhar ressalva nela."*

**E a consequência não é cosmética — é a ação 1 ainda aberta de
[`QA-D16-atraso-de-publicacao.md`](QA-D16-atraso-de-publicacao.md) §7.** A constante que a PR
entrega, `lag_p99_ms=59_361` (`publication_lag_table.py:260`), é lida sobre a população
**censurada** (`sample_n=4_079`). Sobre a população não-censurada (`nb <= 2`, `n = 4.289`) o `p99`
é **`60_936` ms — acima da grade nativa de `60_000`**, e `grep -n "60_936\|uncensored\|censor\|
4_289\|nb = 2" backend/src/modules/sentimento/domain/publication_lag_table.py` devolve **só as
linhas `46` e `51`**: o número que refuta a escolha **não aparece em lugar nenhum do módulo de
produção**. Um consumidor futuro lê `59_361`, lê "ambiguous middle", e carimba no primeiro ponto
da grade sem nunca saber que a própria PR mediu que não pode.

**A ação, e ela é de texto, não de número:** substituir a frase de `:51` pelo que está medido —
`nb = 2` são polls atrasados, `210` linhas, `4,9%` de `4.289` — e registrar ao lado de
`lag_p99_ms=59_361` (`:257-269`) que **sobre a população não-censurada o `p99` é `60_936 > 60_000`
e portanto o carimbo no primeiro ponto da grade é decisão do owner, ainda em aberto**, com
ponteiro para o teste que é o registro executável disso. Não mexe em nenhuma constante.

---

## O que NÃO reprova, e está dito para ninguém repetir pedido já atendido

- Os 6 testes do apagão e o `_supervised` — §1 e §2. **Atendido, provado por 2 mutantes.**
- Recusar cadência não-finita (`O4-revalidacao-qa.md` §"Ação única") — `collectors_cli.py:549`.
- A frase falsa sobre `premiumIndex` "alinhado à grade" — corrigida e marcada como falsa em
  `OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md:203` e em `publication_lag_table.py:119-132`.
- Cobertura, camadas, `boundaries`, `regras` (8/8), `política`, `e2e`, frontend — todos verdes.

## Ambiente e higiene

`git status --porcelain` vazio ao fim; `sha256sum -c` da produção `SUCESSO`; `__pycache__`
purgado nas duas pontas. Nenhuma query no Postgres, nenhum deploy, nenhum dado sintético.
**Sem `harness gate-record`:** esta feature não tem `tasks.toml` nem fase declarada
(`harness pipeline state cinco-metricas-do-core` → `BUILD_AUTHORIZED`), e inventar um número de
fase para gravar no ledger é pior que não gravar — os 3 pareceres anteriores desta PR também são
`.md` sem evento.

## Veredito

```
## QA Gate — PR #217 [sentimento]
- [OK] 8 de 8 regras bloqueantes — portão `regras` rc=0, 0 bloqueio(s), 73 aviso(s)
- [OK] Testes existem e MORDEM — 6 passed; MUTANTE-K e MUTANTE-L -> rc=1, `.....F`
- [OK] Cobertura 96,63% global (alvo 70) · domain 99,7/90 · use_cases 99,7/80 · infra 93,0/70
- [FAIL] `make verify` VERMELHO — 1 failed, e o vermelho é evitável (xfail strict medido, rc=0)
- [FAIL] Afirmação falsa em produção — publication_lag_table.py:51 vs test_…:551-559
Veredito: NEEDS_FIX
Acoes: 1. xfail(strict=True) no teste declarado-vermelho, docstring intacto.
       2. Corrigir a frase de publication_lag_table.py:51 e registrar o p99 60_936 ao lado de
          lag_p99_ms=59_361.
```
