# W2 — code-review (nível high) — `master...wave/paineis-f03a`

- **Data:** 2026-09-25 · **Worktree:** `.claude/worktrees/wave-paineis-f03a` · **HEAD revisado:** `5f3a440`
- **Universo:** `git diff --stat master...wave/paineis-f03a` → **51 arquivos, +5859/−41** `[MEDIDO]`
  (T-03.1 a T-03.6: cliente `/fapi/v1/openInterest`, carimbo `[T − 20 s, T]`, catálogo +4 linhas,
  coletor de polling, compose, bench).
- **Método:** skill `code-review` em nível `high` (subagente bifurcado), e depois **cada achado
  re-verificado no código** por este portão. Laudo bruto da skill (JSON, 10 achados):
  `/tmp/claude-1002/.../scratchpad/review-paineis-f03a.json` (efêmero, fora do repositório).
- **Sanidade dos testes:** `make test-fast K="open_interest or series_catalog or as_of_is_the_single_reader or ingest_run_pairs"`
  → **291 passed, 2589 deselected em 6,11 s** `[MEDIDO]`. ⛔ Verde de `test-fast` **não** é verde
  de portão. O `make verify` rodado aqui **estourou o `timeout 580`** na etapa de backend
  (lint-backend/lint-frontend/test-frontend OK antes disso) `[MEDIDO: rc=124]`: **não medido** por
  este portão.

## Veredito: **NEEDS_FIX**

Há 1 achado de correção confirmado no comportamento (C-1) e 2 defeitos confirmados em documentação
sobre o sentido do anti-lookahead (C-2, C-3), que é a classe de defeito que o `CLAUDE.md` cobra
explicitamente. Os três custam poucas linhas.

## Confirmados (bloqueiam)

### C-1 — `BinanceOpenInterestClient.fetch` só captura `OSError`: um `http.client.HTTPException` derruba o processo inteiro dos coletores
`backend/src/modules/sentimento/infra/binance_open_interest_client.py:94`

- `IncompleteRead` (de `response.read()` com o corpo truncado), `BadStatusLine`, `LineTooLong` e
  `ImproperConnectionState/CannotSendRequest` são subclasses de `http.client.HTTPException`, **não** de
  `OSError` (só `RemoteDisconnected` herda de `ConnectionResetError`).
- Caminho: a exceção escapa de `fetch` sem virar `TRANSPORT` → escapa de
  `_run_open_interest_poll_collector` (não há `try` em volta de `client.fetch`, `collectors_cli.py`
  ~1828) → `_supervised` faz `failure_event.set()` → **as 7 threads param**, `exit 1`, o compose
  reinicia (`restart: unless-stopped`). Enquanto isso, o `forceOrder` (stream, captura-ou-perde)
  fica sem captura. Além disso, a conexão meio lida **não é descartada** (`_drop()` não roda).
- ⚠️ **Não é regressão isolada:** `premium_index_http_client.py:79` tem o mesmo `except OSError` em
  `master`. Mas esta wave **acrescenta uma 2ª exposição** num coletor de 5.760 chamadas/dia, e o
  conserto é local.
- **Correção:** `except (OSError, http.client.HTTPException)` → `TRANSPORT` com `_drop()`, e um teste
  com uma conexão falsa que levanta `IncompleteRead`. (Estender ao `premium_index_http_client` fica
  como follow-up, fora do escopo da wave.)

### C-2 — o comentário de `max_staleness` descreve a janela **invertida** (`[T, T + 20 s]`, o sentido do look-ahead)
`backend/src/modules/sentimento/domain/open_interest_catalog.py:193`

- O texto diz *"`T-03.2` leaves a minute ABSENT when no reading lands in `[T, T + 20 s]`"*. A janela
  implementada (`open_interest_grid_stamp.py`, pós-`Q-STAMP-1`, commit `03e8e9a`) é
  **`[T − 20 s, T]`**. `[T, T + 20 s]` é justamente a versão que o `quant-architect` reprovou
  (`handoff/Q-STAMP-1-quant-architect.md`) por ser look-ahead. O comentário é resíduo do `67d8c0e`.
- É a mesma classe do defeito que o `CLAUDE.md` cita (uma regra anti-lookahead invertida e propagada).
  Quem confiar no comentário pode "consertar" o carimbo para bater com ele.
- **Correção:** trocar para `[T − 20 s, T]`.

### C-3 — a justificativa nova em `DECLARED_TOUCHERS` afirma que `event_time` e `bucket_end` são "o mesmo instante" para estas linhas, e isso é falso
`backend/tests/sentimento/test_as_of_is_the_single_reader.py:239-241`

- O trecho *"keying the watermark off `row.event_time` (the same instant for these rows …)"* foi
  copiado do parágrafo de klines (`label_shift = 0`). Na série polled, `bucket_end = T` e
  `event_time` é o `time` da Binance, **até 20 s antes**. A diferença entre os dois é a própria
  staleness que o mapping documenta (`collector_series_mapping.py`, bloco do sétimo produtor).
- A isenção do registro se apoia nessa premissa. As propriedades (a)–(c) continuam valendo; só a
  frase está errada.
- **Correção:** reescrever a frase. `event_time` difere de `bucket_end` em `[0, 20 000]` ms, e a
  watermark usa `bucket_end` porque ela é a chave de deduplicação `(symbol, T)`.

## Plausíveis e advisórios (não bloqueiam; registrados para quem for decidir)

| # | onde | achado | por que não bloqueia |
|---|---|---|---|
| A-1 | `collectors_cli.py` ~1828 | as 4 chamadas são sequenciais numa conexão com timeout de 20 s. Um travamento empurra os símbolos seguintes para depois de `T` (`OUT_OF_WINDOW`), e o bench mostra o lead caindo de 5,00 para ~3,96 s no 4º símbolo | o resultado é minuto **AUSENTE**, nunca look-ahead (o teto do carimbo impede). A margem fresca continua ≥ 0 no envelope medido (3,96 − 2,24 = 1,72 s). É risco de `DoD-1` (≥ 95%), a monitorar pelo `lag_ms` já logado |
| A-2 | `binance_open_interest_client.py:105` | 429/418 tratados como qualquer não-200, sem `Retry-After` nem backoff | 4 chamadas/min, peso 1. Os irmãos Binance do mesmo arquivo também não fazem backoff. Vale uma decisão transversal, não um conserto só aqui |
| A-3 | `collect_open_interest_poll.py:221` | leitura que o filtro de símbolos do mapping descarta fica com fate `ADMITTED` e o ciclo fecha `ACCEPTED` com 0 linhas | em produção `symbols = sorted(INITIAL_SYMBOLS)` = o próprio filtro, então é latente e só dispara com injeção divergente |
| A-4 | `collectors_cli.py` ~1845 | o `except _PUBLISH_FAILURE_EXCEPTIONS` (que inclui `ValueError`) envolve também o `settle`, então um `ValueError` de invariante (`_next_admitted`) é registrado como falha de publish. O run `REJECTED` descarta `weight_used`, `api_code` e `src_sha256` (grava `sha256('')`) | o processo cai com `exit 1` nos dois casos, e `_failure_note` carrega o tipo e a mensagem da exceção. A perda é diagnóstica |
| A-5 | `collect_open_interest_poll.py:194` | fate casado por `id(snapshot)` mais um iterador em ordem. Um cliente que reutilize o mesmo objeto snapshot faz as duas chamadas ficarem `SUPERSEDED` | o cliente real cria um snapshot novo por chamada, e `_next_admitted` falha alto se a ordem mudar |
| A-6 | `open_interest_grid_stamp.py:52` e `open_interest_catalog.py:189` | dois `60_000` independentes para a mesma grade | limpeza: o carimbo deveria importar a constante do catálogo |
| A-7 | `open_interest_snapshot.py` `read_used_weight` | 3ª cópia do parse de `x-mbx-used-weight-1m` | limpeza (reuso) |
| A-8 | `tests/helpers/collectors_cli_driver.py` | a cadência de 999 960 s não garante que o tick caia fora do cenário. A grade é época-alinhada, então a chance por execução é ~duração/999 960 | flake teórico da ordem de 1/30 000 por cenário de 30 s `[INFERRED: razão duração/intervalo]` |

## Revalidação

Seguindo a §4 das regras de despacho: depois da correção, peça **a mutação**, não o relatório.
- C-1: o teste com `IncompleteRead` tem de ficar **vermelho** quando se volta para `except OSError`.
- C-2 e C-3: `grep -n 'T, T + 20' backend/src` tem de devolver `rc=1`.
