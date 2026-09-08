# [QA GATE — Fase 01: As duas rotas de ADR-005/D1] — veredito QA

**Feature:** `pagina-de-grafico-s2` · **Fase:** `01` (`T-01.1..T-01.5`) · **Commit:** `4c330a1`
**Builder report:** `docs/context/pagina-de-grafico-s2/gates/F1-builder.md`
**Plan:** `docs/plans/SPEC-006-pagina-de-grafico-s2/01_rotas_de_serie.md`

## O que este gate verificou por conta própria (não aceitou de graça)

1. **A falha pré-existente é mesmo pré-existente.** Reproduzida em `4c330a1`
   (`.venv/bin/python -m pytest tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py -q`
   → `TypeError: SeriesRow.__init__() missing 1 required positional argument: 'value_raw'`) e
   **de novo, independentemente, num `git worktree add --detach` em `5cdf730`** (o commit
   anterior a todo este diff) — mesmo `TypeError`, mesma linha. `git diff --stat 5cdf730..4c330a1
   -- backend/src/modules/sentimento/infra/collectors_cli.py backend/src/modules/sentimento/domain/provenance.py`
   → vazio (nenhum dos dois arquivos que produzem o erro está no diff da fase). Confirmado: não é
   regressão desta fase.

2. **CA-F1-1..7, rodados de novo, não só lidos do relatório do builder:**
   - `CA-F1-1`: `grep -rlE '"/series-history' backend/src/api` → 1 arquivo (`routes/series_history.py`).
   - `CA-F1-6`: `grep -rniE 'binance|coinalyze|bybit'` sobre as 2 rotas + os 3 módulos novos de
     `use_cases`/`infra`/`domain` → 0 ocorrências.
   - `CA-F1-7`: `grep -rn 'MOCK|FIXTURE'` sobre os 7 módulos novos de produção → 0.
   - `CA-F1-2/3/4/5`: lidos e confirmados no código dos testes (`test_series_history_route.py`,
     `test_series_live_route.py`) — socket loopback real via `create_app()`, nunca um `TestClient`
     que pule a composição; `CA-F1-4` mede `Content-Type` sobre uma resposta HTTP real.
   - Falsificador da fase (`interval=5m` nunca `200`): `interval: Literal["1m"]` no assinatura da
     rota faz o `422` acontecer no nível de tipo do FastAPI/Pydantic, antes do corpo da função
     rodar — estruturalmente impossível servir `200` para `interval≠"1m"`.

3. **Contrato front↔back — não só self-consistência.** Lido `series_history.py`/`series_live.py`
   (assinatura da função = os nomes de query real) e comparado campo a campo contra
   `history-transport.ts`/`live-transport.ts`: os 7 nomes de `HistoryRequestKey`
   (`series_key_id`, `symbol`, `interval`, `window_start_ms`, `window_end_ms`,
   `knowledge_time_ms`, `bar_policy`) e os 3 de `LiveStreamOpenRequest`
   (`series_key_id`, `symbol`, `interval`, sem `bar_policy`) batem, literal, com os parâmetros
   que os handlers Python de fato declaram. Os testes TS testam o encode/decode do PRÓPRIO
   módulo (não uma chamada de rede real cross-linguagem) — mas como os nomes dos dois lados
   agora são idênticos por leitura direta do código, o gap de "self-consistente vs. real" fica
   coberto por esta verificação manual, não por um teste de contrato automatizado novo.

4. **Ambiente do worktree tinha DOIS gaps que o relatório do builder não previa** (nada a ver com
   o diff da fase; anomalias de ambiente, resolvidas para poder medir):
   - `frontend/node_modules` não existia neste worktree (`npm run lint`/`typecheck` falhavam por
     ausência de ferramenta, não por erro de código) — resolvido com
     `npm ci --prefer-offline --no-audit --no-fund` (233 pacotes, do cache local, sem rede nova).
     Depois disso: `npm run lint` limpo, `npm run typecheck` limpo.
   - `data/` (não versionado, `.gitignore`) não existia neste worktree — `universe-at.test.ts`
     falhava com `ENOENT` (arquivo catalogado em `data/MANIFEST.md`, existente no repo principal).
     Resolvido com um symlink temporário `data -> <repo principal>/data` só para rodar
     `npm run test:app` uma vez (**116 passed, 0 failed**, batendo o número do builder) —
     symlink removido depois, `git status` limpo.

5. **`bash scripts/verify.sh` rodado do zero, sem aceitar o número do builder:** `[OK] lint-backend`,
   `[OK] lint-frontend`, `[FALHA] test rc=1 · 1939 passed · Total coverage: 96.92%`, `[OK]
   boundaries · 7 kept, 0 broken`, `[NÃO MEDIU] regras/política rc=3` (mesmo gap de registro do
   worktree que o builder já tinha nomeado — confirmado que `harness rules`/`harness rules list`
   chamados DIRETO resolvem normalmente, usados no item 7 abaixo). Log completo:
   `/tmp/verify-agent-af4fef8f6fda8a09d-20260908T185837Z.log` (36K) →
   `grep -n "^FAILED\|passed,\|failed," ...` → **exatamente** a mesma falha do item 1, `1 failed,
   1939 passed, 3 deselected` — nenhuma falha nova, nenhuma falha a menos.

6. **Achado real, não do builder: `check-coverage-layers.sh` NUNCA RODOU dentro de
   `scripts/verify.sh`/`scripts/test.sh` nesta medição**, porque `test.sh` tem `set -euo
   pipefail` e o `pytest` da linha anterior devolve `rc=1` (a falha pré-existente do item 1) —
   o script morre ali, antes de chegar na chamada de `check-coverage-layers.sh` na linha
   seguinte. A frase do builder *"nenhuma camada tocada por esta fase ficou abaixo do piso (ver
   check-coverage-layers.sh embutido em test.sh, rc=0)"* não podia ter vindo dessa cadeia com a
   suíte inteira — só de uma chamada separada do script. **Rodei `check-coverage-layers.sh`
   direto sobre o `coverage.xml` que a suíte cheia acabou de escrever:** `domain 99.8% (meta
   90%)`, `use_cases 100.0% (meta 80%)`, `infra 93.2% (meta 70%)`, `rc=0` — os 3 pisos passam de
   verdade, por agregado de camada (não por arquivo), então a alegação do builder é
   **verdadeira no resultado, só não pelo caminho que ele descreveu**. Registrado aqui para não
   virar um "verde que não prova nada".

7. **Gap real encontrado e FECHADO, não só nomeado:** `src/modules/sentimento/domain/
   live_bucket_envelope.py` estava em **82%** de cobertura (2 de 22 linhas descobertas — as duas
   linhas `raise InvalidLiveBucketEnvelopeError` dentro de `__post_init__`, para `n_trades`/`seq`
   negativos). Busca confirmou **zero teste** exercitava essas duas linhas em todo
   `backend/tests/` (`test_series_live_route.py` só constrói envelopes VÁLIDOS via
   `_FiniteSource`). Não é item do DoD `CA-F1-1..7` e não derruba o piso agregado de `domain`
   (99,8% mesmo com o gap), mas é uma invariante nova, sem prova — escrevi
   `backend/tests/sentimento/test_live_bucket_envelope.py` (5 testes: happy path, `n_trades`
   negativo recusado, `seq` negativo recusado, `0` aceito nos dois — a fronteira exata —, e
   `to_wire()` projeta os 6 campos verbatim). `bash scripts/lint.sh` limpo (ruff+format+mypy
   --strict, 399 arquivos), `harness rules --mode file --path
   backend/tests/sentimento/test_live_bucket_envelope.py` → 0 achados.

8. **Confirmação final, suíte inteira, com o pré-existente deselecionado** —
   `bash scripts/test.sh --deselect
   tests/sentimento/test_collectors_cli_idle_timeout_reconnect.py::test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected`
   → **`1947 passed, 1 deselected`**, `rc=0`, `Total coverage: 96.88%`, e desta vez
   `check-coverage-layers.sh` RODOU pela cadeia normal (nada travou o `set -e`):
   `domain 99.8% (3741/3748, subiu 2 linhas — exatamente as que o teste novo fechou)`,
   `use_cases 100.0%`, `infra 93.1%` — os 3 `[OK]`, `rc=0`.

## Veredito

## QA Gate — Fase 01 [sentimento, web]
- [OK] `CA-F1-1` rota existe — `grep -rlE '"/series-history' backend/src/api` → 1 arquivo
- [OK] `CA-F1-2` endereçável por conteúdo — `test_two_identical_requests_produce_byte_identical_bodies`, socket real, `server_now_ms` excluído com justificativa (`ADR-005/D3`)
- [OK] `CA-F1-3` `interval=5m` → `422` — `test_interval_other_than_1m_is_refused_with_422`, garantido em nível de tipo (`Literal["1m"]`), estruturalmente impossível servir `200`
- [OK] `CA-F1-4` SSE `Content-Type` — `test_series_live_responds_with_the_sse_content_type`, socket real via `create_app()`
- [OK] `CA-F1-5` par nunca mal-formado — asserção `(value is None) != (absence is None)` sobre linha real
- [OK] `CA-F1-6` zero exchange direta — `grep -rniE 'binance|coinalyze|bybit'` sobre rotas+use_cases+infra novos → 0
- [OK] `CA-F1-7` zero `MOCK`/`FIXTURE` fora de teste — `grep -rn 'MOCK|FIXTURE'` sobre 7 módulos novos → 0
- [OK] `core.*`/`web-fullstack.*` (8 regras bloqueantes) — `harness rules --mode file --path <arquivo>` sobre os 12 arquivos de produção alterados/novos + o teste novo → 0 BLOQUEIO em todos
- [OK] Testes existem e passam — `bash scripts/test.sh --deselect <pré-existente>` (`1947 passed, 1 deselected`, rc=0); alvo por camada batido: `domain 99.8%≥90%`, `use_cases 100%≥80%`, `infra 93.1%≥70%`
- [OK] A 1 falha do `verify.sh` sem deselect é pré-existente — reproduzida de forma independente em `5cdf730` (antes do diff), mesmo `TypeError`; `git diff --stat` dos 2 arquivos responsáveis → vazio
- [OK] DoD da fase (`01_rotas_de_serie.md`) — 7/7 critérios, cada um com comando rodado por este gate, não só lido do relatório do builder
- [anomalia — resolvida] `frontend/node_modules` ausente neste worktree (não é código) — `npm ci --prefer-offline` restaurou; `data/` (não versionado) ausente — symlink temporário confirmou `116 passed` e foi removido
- [anomalia — nomeada, não bloqueia] `harness rules`/`política` devolvem `rc=3` **dentro de `verify.sh`** neste worktree (mecanismo não resolvível); chamada direta (`harness rules --mode file`) resolve normalmente e foi o que este gate usou
Regras bloqueantes avaliadas: 8 de 8
Veredito: **APPROVED**
Nota: um teste novo foi adicionado (`test_live_bucket_envelope.py`, 5 casos) para fechar um gap de cobertura real (82% → 100% em `live_bucket_envelope.py`) achado durante a verificação — não altera nenhum arquivo de produção.
