# W6-QA-BACK-r4 — QA de backend da wave W6 (`paineis-de-fluxo`, 03b + T-03.7), rodada 4, em `ccf13c1`

- **Alvo:** `wave/paineis-f03b` em `ccf13c1`, que é o merge de `origin/master` (`2fdabe8`, PR #238, trilha WI) sobre `1dea849`
  (t3 da T-03.7). Worktree: `.claude/worktrees/wave-paineis-f03b`.
- **O que mudou desde o r3 (`2bab956`):** no código, só o que veio do master pela WI (`backend/src/main/__init__.py`,
  `ingest_record_store_composition.py`, `deploy/compose.yml` e 3 testes em `backend/tests/main/`). O código da 03b não mudou.
  O r3 reprovou **só** pela T-03.7 (t2 com 685–689 linhas contra o piso de 1.368). Esta rodada reconfere o t3 e a árvore mergeada.
- **Retomada:** a rodada anterior morreu num reboot do host. O merge já estava feito, e os containers `deploy-*` foram recriados em
  `2026-09-29T20:35:38Z` (`docker inspect`, `RestartCount=0` nos 4). Comecei pelo passo 2. `gate-record` **não** foi rodado.

```
## QA Gate — Fase 03 (03b + T-03.7) [sentimento/infra]
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request / own.compose-hardcoded-secret
       — `harness rules --mode sweep --path <f>` sobre os 51 arquivos de backend/frontend/deploy do diff da wave
       mais os do merge: 0 BLOQUEIO. Controle positivo: uma isca em backend/tests/ deu 3 BLOQUEIO
       (relative-import :1, silent-except :4, print-statement :6). A isca foi apagada.
- [OK] web-fullstack.server-test-directory-present — backend/tests/ existe e roda 3429 testes.
- [OK] Testes existem e passam — `VERIFY_FORCE=1 E2E_API_PORT=8843 E2E_NEXT_PORT=4343 make verify`, rc=0, VERDE nos 8 portões:
       test 3429 passed, 1 skipped, 1 xfailed; test-frontend 1209/0; e2e 98 passed / 0 falhas / 7 skipped; boundaries 7/0;
       regras 0 bloqueio / 77 avisos.
- [OK] Cobertura 96,42% contra o alvo de 70% (fail_under). Pisos por camada: domain 99,7% (meta 90), use_cases 99,6% (meta 80),
       infra 92,6% (meta 70).
- [OK] DoD-03a.1 (T-03.7, t3), contado de novo por mim: 1.435 por símbolo nos 4 símbolos, contra o piso de 1.368.
- [OK] DoD-03a.3: 1,52 MB/dia de tupla e ~2,78 MB/dia com índice, contra o teto da D-1 (~5,7 MB/dia).
- [OK] DoD-03a.5 / DoD-03b.5: make verify verde (acima).
- [OK] O merge da WI não quebrou nada na wave, e o portão dela continua mordendo na árvore mergeada: tirar `connect_autocommit`
       de main:243 ou de main:260 derruba 2 testes em cada caso (§3).
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED
```

## 1. Conferência do t3 contra o DoD-03a.1 e o DoD-03a.3 (só leitura)

Rodei tudo com `docker exec -i -e PGOPTIONS="-c lock_timeout=3s -c statement_timeout=120s" deploy-postgres-1 psql`, dentro de
`begin transaction read only`, às `2026-09-29T20:4xZ`. Usei os mesmos 4 `series_key_id` do `T-03.7-t0.md:40-43` e a mesma janela do t3,
`[2026-09-28T14:35Z, 2026-09-29T14:35Z)`, filtrando por `bucket_end`.

| símbolo | n | `T` distintos | primeiro / último `T` | bytes de tupla | atraso máx. | ≥ 20 s | negativo |
|---|---|---|---|---|---|---|---|
| BTCUSDT | **1.435** | 1.435 | 14:35Z / 14:34Z | 377.405 | 16.628 ms | 0 | 0 |
| ETHUSDT | **1.435** | 1.435 | 14:35Z / 14:34Z | 380.275 | 13.848 ms | 0 | 0 |
| LINKUSDT | **1.435** | 1.435 | 14:35Z / 14:34Z | 380.190 | 16.373 ms | 0 | 0 |
| SOLUSDT | **1.435** | 1.435 | 14:35Z / 14:34Z | 378.840 | 13.923 ms | 0 | 0 |
| total | 5.740 | | | 1.516.710 | 16.628 ms | 0 | 0 |

`[MEDIDO 2026-09-29T20:4xZ, n=5.740]`. **Bate linha a linha com a §1 do t3**, inclusive nos bytes e no atraso máximo (16,63 s).
Como 1.435 ≥ 0,95 × 1.440 = 1.368, o **DoD-03a.1 passa**.

**Os minutos que faltam**, medidos com `generate_series` sobre a grade de 1 min e contando quantos símbolos existem em cada `T`:
são 5, e nos 5 faltam os 4 símbolos ao mesmo tempo (`20:00Z`, `22:12Z`, `07:45Z`, `07:46Z` e `11:00Z`). É a mesma lista da tabela do t3.

**`md.ingest_run`** do poll de OI, na mesma janela: `ACCEPTED` teve 1.438 runs, `n_written=5.740` e 3 runs sem `writer_accounted_at`.
`ACCEPTED_WITH_WARNING` teve 1 run, com 3 de 4 lidos e `n_written=0`. **Igual à §3 do t3.** Os 3 runs `ACCEPTED` sem crédito são o
achado da §5 do t3, e eu os reproduzi.

**Disco (DoD-03a.3), com base no `hypertable_detailed_size('md.series')` de agora:** `index_bytes=2.082.889.728` e
`count(*)=9.530.789` dão 218,54 B de índice por linha. Somados aos 264,24 B de tupla por linha de OI, isso dá **482,78 B/linha**. A
5.760 linhas/dia, são **2,78 MB/dia com índice** e **1,52 MB/dia só de tupla**. O t3 publicou 2,80 MB/dia, porque usou o índice médio
de 4 h antes. Os dois ficam a ~49% do teto de ~5,7 MB/dia da D-1 (`DECISOES-DO-OWNER-2026-09-27.md:9`, `[DECISÃO-OWNER: 2026-09-27]`).
A parte de índice é `[INFERRED]`, pela mesma premissa do t3 (índice médio da hypertable aplicado às linhas de OI). **Não é `DISK_HIGH`.**

## 2. Portões

`find backend -name __pycache__ -prune -exec rm -rf {} +` (ficaram 0 diretórios), e depois
`VERIFY_FORCE=1 E2E_API_PORT=8843 E2E_NEXT_PORT=4343 make verify`, com início em `20260929T203857Z` e fim em `2026-09-29T20:55Z`. Deu
**rc=0, VERDE, 8 portões**. O log completo ficou em `/tmp/verify-wave-paineis-f03b-20260929T203857Z.log`, e vale lembrar que o `/tmp` não
sobrevive a reboot.

- `test`: **3429 passed, 1 skipped, 3 deselected, 1 xfailed** em 243 s (linha 1924 do log). São os 3419 do r3 mais os 10 testes da WI
  que entraram pelo merge. O `xfailed` é `test_publication_lag_table.py:577`, anterior à wave (r3 §1).
- Cobertura: 96,42% (`Required test coverage of 70.0% reached`). domain 99,7%, use_cases 99,6%, infra 92,6%.
- e2e: **98 passed, 7 skipped, 0 `✘`** em 10,3 min. Nenhum dos vermelhos conhecidos de REGRAS §2 aparece. Os 7 skipped são os mesmos 7
  do `W6-QA-FRONT-r3.md:86`.

## 3. A árvore mergeada: o portão da WI morde dentro da wave

Rodei numa cópia isolada (`git archive HEAD backend deploy` no scratchpad, com o `.venv` da worktree), sem tocar em código de produção
da worktree. Os alvos foram `tests/main/test_api_connections_hold_no_transaction.py`, `tests/main/test_connect_autocommit_reaches_the_api_alone.py`
e `tests/sentimento/test_oi_candles_route_invariants.py` (a rota da 03b, que lê pela conexão da API).

| mutante | resultado |
|---|---|
| HEAD | 107 passed |
| M1: `main/__init__.py:243` sem `connect=connect_autocommit` (o `ingest_store`) | **2 failed**, 105 passed |
| M2: `main/__init__.py:260` sem `connect=connect_autocommit` (a `window_connection`) | **2 failed**, 105 passed |
| restaurado | 107 passed |

Bate com as mutações A/B do `WI-CODE-REVIEW` ("2 failed cada"). O merge também preservou os dois lados:
`git diff --stat 2fdabe8 ccf13c1 -- backend/src/main deploy .../ingest_record_store_composition.py` sai vazio, e
`git diff 2fdabe8 ccf13c1 -- docs/INDEX.md` e `git diff 1dea849 ccf13c1 -- docs/INDEX.md` não têm nenhuma linha removida.

## 4. O que fica fora do veredito e segue para o orquestrador

- **Os 3 ciclos `ACCEPTED` que o writer nunca creditou** (t3 §5). Reproduzi: são 3 runs com `writer_accounted_at IS NULL` e 0 linhas.
  Não derrubam o DoD-03a.1 (sobram 67 linhas de folga), e o código fica fora da 03b (é o escritor único, `infra`). Mas é um defeito
  de correção: o ciclo diz `ACCEPTED` e perde o dado. Endosso a task própria que o t3 recomenda. **Não escrevi teste que o reproduza**,
  porque o mecanismo é `[NÃO SEI]` (t3 §5) e o gatilho candidato é um poll publicado durante o backfill de boot.
- **O falsificador §5.4 da WI continua aberto** (pede ≥ 2 dias de `cripto-api|2|0`). Agora vi `cripto-api` com 2 sessões `idle` e 0
  `idle in transaction`, mas a API foi recriada às 20:35Z, então a contagem de idade recomeçou.
- **Disco do host:** `df -h /` mostra 95%, com 12 GB livres (o t3 mostrou 97%, com 8,3 GB). Já está com o owner pelo t3/WI-deploy.
