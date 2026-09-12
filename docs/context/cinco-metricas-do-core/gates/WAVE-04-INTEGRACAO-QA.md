# QA Gate — wave de INTEGRAÇÃO (PR #218, `wave/cinco-metricas-do-core-integracao`)

> Árvore medida: **`42c1368`** (o SHA avançou durante este gate; `1273249` → `42c1368` é
> **docs-only**: `git diff --name-status 1273249..42c1368` → 2 arquivos, `docs/INDEX.md` (+1/-0,
> append-only respeitado) e o próprio relatório do builder ⇒ **toda medição de código feita em
> `1273249` vale para `42c1368` por construção**, e as 2 medições de portão foram refeitas em
> `42c1368`).
>
> Worktree próprio, **detached** em `/tmp/qa-wave218` (o worktree do builder está `locked`).
> `backend/.venv` é **symlink** para a venv do checkout principal — **nenhum `pip install` foi
> executado** (`pyvenv.cfg` intocado, `ago 28 22:17`), então nada foi contaminado para os outros
> agentes. `frontend/node_modules` é symlink para o do worktree do builder (o `npm ci` dele);
> **nenhum arquivo versionado de `frontend/` foi tocado por este gate** — e a wave não toca
> `frontend/` (`git diff --name-only 026b845..42c1368 -- frontend/ | wc -l` → **0**).
>
> ⛔ Higiene obrigatória em TODA medição abaixo: `PYTHONDONTWRITEBYTECODE=1` e
> `find … -name __pycache__ -prune -exec rm -rf {} +` antes de cada rodada.

## 1 · O merge perdeu linha de catálogo? **NÃO — e não foi por confiança no auto-merge**

Auto-merge limpo não prova união. Reconstruí o catálogo **a partir de cada commit-pai** (`git
archive` de `backend/src`, execução isolada) e comparei **conjuntos de `series_key_id`**, não
contagens:

| árvore | commit | `n_entries` (`list_series_catalog('BTCUSDT')`) |
|---|---|---|
| `master` | `026b845` | **11** |
| fase 05 | `b18e333` | **11** |
| fase 03 | `ae24e23` | **11** |
| fase 02 | `e9d0f8f` | **12** |
| **merge** | `1273249`/`42c1368` | **12** |

`união(f02,f03,f05) = 12` · `merged = 12` · **`LOST = []`** · **`EXTRA = []`**
`[MEDIDO 2026-09-12, n=5 árvores, comparação por `series_key_id` (sha256 dos 15 termos), não por
contagem]`. Ordem preservada (`RS-1`): `cvd_source`×3, `klines_last`, `price_mark_close`,
`sum_open_interest`×5, `klines_volume`, `kline_takerbuy` — os dois novos **no fim**.

**O que o auto-merge poderia ter quebrado e não quebrou — o lado do ESCRITOR.** Catálogo íntegro
com escritor divergente daria `n_points=0` silencioso. Medido, para os **4** símbolos de
`INITIAL_SYMBOLS`:

- `binance_open_interest_key(...)` ∈ catálogo → **True** nos 4 (`interval='5m'` nos 4);
- `build_klines_to_rows()` sobre 1 barra fechada → **2 linhas** por símbolo (volume `10`, CVD
  `-2` = `2·4−10`), **`orphans = 0`** nos 4.

⚠️ **Correção de ATRIBUIÇÃO no relatório do builder (não é defeito, é procedência):** a tabela
dele credita *"`cvd_source` 4 linhas → fase 02"* e *"`sum_open_interest` 5 → fase 03"*. Medido:
`master` **já tinha** 3 `cvd_source` + 5 `sum_open_interest`. Da fase 02 veio **1** linha
(`kline_takerbuy`); a fase 03 trouxe o **coletor**, nenhuma linha de catálogo. O total (12) e a
união estão certos; a coluna "fase que a trouxe" não.

## 2 · O supervisor de thread: as 4, uma a uma — e o mutante

O teste do builder prova a thread que **chegar primeiro** ao `record_run`; `run()` tem **quatro**
chamadas separadas de `_supervised(...)`, e uma não-embrulhada é invisível a esse teste. Escrevi
um driver que mata **uma thread nomeada por invocação**, pela porta que **só ela** chama
(`open_source` / `fetch` / `klines` / `open_interest_history`), com a exceção real da produção
(`psycopg.OperationalError`, fora de `_PUBLISH_FAILURE_EXCEPTIONS`):

```
.venv/bin/python -m pytest tests/sentimento/test_collectors_cli_every_thread_death_exits.py \
  tests/sentimento/test_collectors_cli_run_exit_code_subprocess.py -q   # 6 passed em 5,99 s
```
→ **4/4 threads** (`collector-force-order`, `collector-premium-index`, `collector-klines`,
`collector-open-interest`) matam o processo com **`rc = 1` de verdade** (`Popen.returncode` de
subprocesso REAL, não valor de retorno em processo) `[MEDIDO 2026-09-12 em 42c1368, n=4]`.

**Mutante (o verde só vale depois que uma mutação reprova):** removi o `_supervised(...)` **de uma
só** das quatro (`collector-open-interest`), em cópia descartável fora do repositório →
**`1 failed, 3 passed in 44,47s`**, e a que falhou foi exatamente `[collector-open-interest]`, por
`STILL ALIVE after 40.0s`. ⇒ o embrulho é **load-bearing em cada sítio**, e o teste distingue
sítio a sítio.

### `except BaseException` engole `KeyboardInterrupt`/`SystemExit` indevidamente? **NÃO**

Engolir seria o processo **seguir vivo**. Medido, matando thread com cada classe:

| exceção na thread | `collector-premium-index` | `collector-klines` |
|---|---|---|
| `psycopg.OperationalError` | `rc=1` | `rc=1` |
| `SystemExit(7)` | `rc=1` | `rc=1` |
| `KeyboardInterrupt` | `rc=1` | `rc=1` |

`[MEDIDO 2026-09-12, n=6 subprocessos]`. `SystemExit` em thread é **ignorado em silêncio** pelo
`threading.excepthook` padrão — o wrapper o torna **mais** alto, não menos. E `KeyboardInterrupt`
de `Ctrl-C` é entregue à thread **principal** em CPython, não às workers: o wrapper não intercepta
o caminho do operador.

### ⚠️ Achado NÃO-BLOQUEANTE e PRÉ-EXISTENTE: `SIGINT` não derruba o processo

`kill -INT` no processo do coletor (fake ocioso) → **"STILL ALIVE after 20s"**. Falsificado antes
de reportar: **`master` (`026b845`) se comporta igual** `[MEDIDO 2026-09-12, n=2 árvores]` ⇒ **não
é regressão desta wave** (a causa é a thread `force-order` não-daemon bloqueada + ausência de
handler de `SIGINT`; produção usa `SIGTERM`, que tem handler e é o que o Docker envia). Registrar
como pendência, não bloquear a PR.

## 3 · "A wave faz o OI ser COLETADO, não ser LIDO" — **VERDADEIRO, e não é regressão**

- **Coletado**: `git grep -c 'collector-open-interest' 026b845 -- …/collectors_cli.py` → **`rc=1`,
  zero**; em `42c1368` → **2**. `deploy/compose.yml:200` roda `python -m …collectors_cli`, e o
  período é `_OPEN_INTEREST_PERIOD = "5m"` com defaults próprios (nenhuma env nova obrigatória).
- **Não lido**: `use_cases/series_history.py` **não está no diff** (`git diff --name-only
  026b845..42c1368 | grep -c series_history` → **0**) e segue com `bucket_interval_ms=_GRID_STEP_MS`
  (`=60_000`, linha 179) contra `sum_open_interest.interval='5m'`.
- **Não é regressão**: as **5** linhas de `sum_open_interest` **já estavam no catálogo do
  `master`** (medição da §1) ⇒ a leitura já estava quebrada antes da wave; dona é `ADR-037`, em
  branch de outro agente. Este gate **não tocou** aquele arquivo.

## 4 · `make verify` — **VERDE 6/6, reproduzido de forma independente**

Rodada própria, em `/tmp/qa-wave218` (`42c1368`), **com a máquina ociosa** (gate de ociosidade por
`pgrep` antes de iniciar; `peers pytest/verify = 0` antes e depois):

```
[OK] lint-backend  rc=0  423 source files
[OK] lint-frontend rc=0  ESLint + tsc --noEmit --strict sobre frontend/src
[OK] test          rc=0  2208 passed · Total coverage: 96,85%
[OK] boundaries    rc=0  7 kept, 0 broken
[OK] regras        rc=0  0 bloqueio(s), 69 aviso(s)
[OK] política      rc=0
veredito: VERDE — 6 portões mediram e passaram        (make rc=0)
```
`[MEDIDO 2026-09-12T17:29:41Z; bruto em /tmp/verify-qa-wave218-20260912T172941Z.log]`

⇒ o `INDETERMINADO` (`lint-frontend rc=3`) da primeira rodada do builder **não se reproduz** aqui,
e o motivo é o mesmo que ele declarou: `node_modules` presente. **`INDETERMINADO` não virou verde
por decreto — o portão MEDIU.** Ressalva honesta: meu `node_modules` é symlink para o dele; como a
wave não altera **nenhum** arquivo de front, o portão de front atesta a sanidade da árvore de
front, não um efeito desta wave.

**Cobertura contra alvo:** 96,85% medido contra o piso que `backend/scripts/test.sh` aplica (o
próprio portão `test` devolveu `rc=0`, que é a forma como o piso se manifesta). Não há alvo de
cobertura declarado para esta wave além do piso do portão.

## 5 · Regras bloqueantes — 8 de 8 avaliadas

`harness rules list --severity block` → **8** regras. Instrumento citável: o portão `regras` do
`make verify` acima varre a árvore inteira e devolveu **`rc=0`, 0 bloqueio(s)** (69 avisos), o que
cobre as 8 (`core.relative-import`, `core.silent-except`, `core.print-statement`,
`core.hardcoded-secret`, `web-fullstack.browser-imports-server`,
`web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`,
`own.compose-hardcoded-secret`). Conferência dirigida ao que a wave mexeu:
`_supervised` **não** é `core.silent-except` (loga `critical` com `exc_info=True` e sinaliza o
supervisor — não descarta); `.env.example` saiu com `POSTGRES_PASSWORD=changeme-dev-only` e
`COINALYZE_API_KEY=` vazia; `deploy/compose.yml` lê **toda** credencial de `${VAR:?}`.

## 6 · DoD da wave, item a item

1. **Branch única com as 3 fases, conflito por união** — ✅ `docs/INDEX.md` de `269` (master) para
   `272` linhas, **+3 / −0** (as 2 linhas das fases + a da wave); união de catálogo exata (§1).
2. **`make verify` com máquina ociosa; `INDETERMINADO` não é verde** — ✅ VERDE 6/6 próprio (§4).
3. **Teste novo: thread morre ⇒ `rc != 0`** — ✅ existe, passa, e **foi estendido por este gate
   para as 4 threads**, com mutante reprovando (§2).
4. **PR aberta descrevendo as 3 fases e os 2 defeitos** — ✅ PR #218, `MERGEABLE`, 46 arquivos,
   8 em `backend/src`.
5. **Sem deploy** — ✅ nada nesta wave executa deploy; nenhum serviço foi reconstruído por este
   gate.

## 7 · Artefatos de teste que este gate produziu

`gates/qa-artifacts-wave-04/` — para incorporar na branch, mover para:

- `test_collectors_cli_every_thread_death_exits.py` → `backend/tests/sentimento/`
- `collectors_cli_thread_kill_driver.py` → `backend/tests/helpers/`

Eles **não** foram commitados por este gate (QA não escreve na branch do builder) e **não**
participaram da rodada de `make verify` acima — a rodada mediu a árvore commitada, exatamente
`42c1368`, `diff: sem mudança não-commitada`.

## 8 · Pendências que este gate levanta (nenhuma bloqueia)

- **`SIGINT` não termina o processo** (§2) — pré-existente em `master`, candidato a pendência
  própria ao lado de `B3`.
- **Atribuição de linhas de catálogo** no relatório/PR do builder (§1) — corrigir o texto, o
  número está certo.
- **Fechamento de fase NÃO está implicado** por este veredito: a wave integra 3 fases e **não
  conclui nenhuma** (`T-05.5`–`T-05.7`, `T-03.5`/`T-03.6` seguem abertas). Nenhuma task foi
  resolvida por este gate.
