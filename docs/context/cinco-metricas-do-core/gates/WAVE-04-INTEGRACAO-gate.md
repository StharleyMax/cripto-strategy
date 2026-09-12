# Gate — wave de INTEGRAÇÃO (`WAVE-04-INTEGRACAO.md`)

> Branch: `wave/cinco-metricas-do-core-integracao`, a partir de `master` (`026b845`).
> ⛔ **Sem deploy** (DoD 5). ⛔ **Zero arquivo de `frontend/` tocado.** ⛔ **Fase 04 fora**, como
> instruído.

## 1 · O que entrou, na ordem exigida

As três branches saíam do mesmo ponto (`ff18811`); `master` já tinha 3 commits só de documentação
à frente dele. Integradas com `git merge --no-ff`, **nesta ordem**:

| ordem | branch | merge | o que traz |
|---|---|---|---|
| 1 | `worktree-agent-a51f816889224e772` | limpo | fase 05 `T-05.1`–`T-05.4` **+ `90f18fa`** (credenciais vivas fora do `.env.example` versionado) |
| 2 | `worktree-agent-a02a90124b12e6b19` | **1 conflito** (`docs/INDEX.md`) | fase 03 — coletor de open interest (`ae24e23`) |
| 3 | `worktree-agent-a714e16e185cbef5f` | limpo | fase 02 backend — CVD (`b3febfb`+`e9d0f8f`) |

**Prioridade 1 respeitada e ela era de segurança:** `gh repo view --json visibility` →
`{"visibility":"PUBLIC"}` `[MEDIDO 2026-09-12]`.

### O único conflito, e como foi resolvido

`docs/INDEX.md`, linhas 270–274 — as fases 03 e 05 acrescentaram **uma linha cada** no mesmo ponto.
Resolvido **por UNIÃO**, e em ordem cronológica (`13:45` da fase 03 antes de `14:45` da fase 05),
que é a forma que o registro append-only exige. **As duas linhas estão no arquivo; nenhuma foi
escolhida contra a outra.**

## 2 · ⚠️ Os hot files não conflitaram — e isso exigiu verificação, não alívio

`H1` `collectors_cli.py`, `H2` `series_catalog.py` e `H3` `collector_series_mapping.py` foram
**auto-mergeados pelo git sem conflito**, porque as fases escreveram em trechos distintos. É
exatamente o caso em que uma união se perde **em silêncio** — `git` não avisa, e o sintoma seria
`422 UnknownSeriesKeyIdError` com o painel vazio em `rc=0`. Então a união foi medida, não assumida:

```bash
.venv/bin/python -c "from src.modules.sentimento.use_cases.series_catalog import list_series_catalog; ..."
```
→ **`n_entries = 12` por instrumento** `[MEDIDO 2026-09-12]`, decompostos em:

| família | linhas | fase que a trouxe |
|---|---|---|
| `cvd_source` (3 + `kline_takerbuy`) | 4 | **02** |
| `sum_open_interest` (4 OHLC Coinalyze + 1 ponto Binance) | 5 | **03** |
| `klines_last` + `price_mark_close` | 2 | pré-existente |
| `klines_volume` | 1 | pré-existente |

E as **4 threads** de coletor sobreviveram ao merge — `collector-force-order`,
`collector-premium-index`, `collector-klines`, `collector-open-interest`
(`grep -n 'name="collector-' collectors_cli.py` → 4 linhas). **Nenhuma linha de catálogo se
perdeu.**

## 3 · ⛔ Defeito (a) — thread que morre tem de derrubar o processo. CONSERTADO

### A causa, e ela não era a que o sintoma sugeria

`psycopg.OperationalError` **não é `OSError` nem `ValueError`**, logo **não está** em
`_PUBLISH_FAILURE_EXCEPTIONS` (`collectors_cli.py:357-364`):

```
python -c "import psycopg; e=psycopg.OperationalError('x'); print(isinstance(e,OSError), isinstance(e,ValueError))"
→ False False                                                      [MEDIDO 2026-09-12]
```

Quando o Postgres caiu (`AdminShutdown`, `2026-09-11T19:53`), o `record_run` seguinte levantou-a
**dentro** da thread, ela escapou de todo `except` do runner, o `threading.excepthook` padrão
imprimiu `Exception in thread collector-klines`, a thread morreu — e o laço principal de `run()`,
que só observa `stop`/`failure`, **continuou dormindo**. `docker inspect` → `running=true`,
`exit=0`, `restarts=0`, por **18 h 45 min**.

### O conserto — a CLASSE, não o caso

⛔ **Não** foi "acrescentar `OperationalError` à tupla". Isso trocaria esta morte silenciosa pela
próxima exceção não listada — é precisamente o que a pendência `B3` já registrava como
*"foi consertado **um** caso; ninguém contou os outros"*.

`collectors_cli._supervised` envolve **as 4 threads** e captura `BaseException`: loga
`collector_thread_died` com `exc_info`, faz `exit_code[0] = 1` e `failure_event.set()` — o que
quebra o laço principal, para as irmãs e faz `run()` devolver não-zero. **`B3` fica fechada na
metade que importa** (a outra metade — quais exceções merecem `IngestRun` `REJECTED` **com
veredito gravado** — segue aberta e está anotada lá).

### O teste, e o mutante que o prova

`test_collectors_cli_run_exit_code_subprocess.py::test_a_thread_that_dies_unhandled_takes_the_whole_process_down`
— subprocesso REAL, `record_run` levantando a exceção REAL da produção.

| estado da árvore | resultado |
|---|---|
| **antes do conserto** | `AssertionError: … STILL ALIVE after 30.0s` — o processo **nunca sai** |
| **depois** | `2 passed` |
| **mutante** (`exit_code[0]=1` + `failure_event.set()` removidos) | **reprova** com a mesma mensagem |

⚠️ **Verde não prova nada até uma mutação reprovar — e esta reprovou.** O mutante foi revertido e a
árvore re-medida verde **depois de purgar `__pycache__`**.

### O teste achou um defeito no próprio conserto

A primeira versão usava `extra={"thread": ...}`. `thread` é atributo **reservado** de `LogRecord`, e
`logging.makeRecord` responde com `KeyError: Attempt to overwrite 'thread' in LogRecord` — levantado
**de dentro da própria rede de segurança**, isto é, uma morte silenciosa novinha. Renomeado para
`collector_thread` (e a chave nasce em inglês, `CLAUDE.md` linha 10). **Foi o teste que pegou.**

## 4 · Defeito (b) — `idle in transaction` da API. REGISTRADO, não consertado

`gates/ACHADO-API-VAZA-IDLE-IN-TRANSACTION.md` + pendência **`B13`**. Traz os `pg_stat_activity`
prontos, a hipótese de causa **rotulada como hipótese**, o falsificador (`application_name`) e o
portão que o conserto terá de trazer. A hipótese aponta para o **mesmo objeto** da pendência `B12`
(`infra/postgres_series_window_reader.py:136`).

Não consertado **por escopo**: é camada de API, fora do DoD desta wave, e o próprio handoff diz
*"o conserto pode ser task própria"* (`WAVE-04-INTEGRACAO.md:55`).

## 5 · Portões

`make verify`, **uma rodada, máquina ociosa** (DoD 2), após purgar `__pycache__` e com
`PYTHONDONTWRITEBYTECODE=1`:

| portão | veredito |
|---|---|
| `lint-backend` | **OK** `rc=0` — **423 source files** |
| `lint-frontend` | ⚠️ **NÃO MEDIU** `rc=3` — `frontend/node_modules` ausente |
| `test` | **OK** `rc=0` — **2208 passed · cobertura total 96,85%** |
| `boundaries` | **OK** `rc=0` — **7 kept, 0 broken** |
| `regras` | **OK** `rc=0` — **0 bloqueio(s)**, 69 aviso(s) |
| `política` | **OK** `rc=0` |

**Veredito literal do runner: `INDETERMINADO — algum portão RECUSOU medir (rc=3). Não é o mesmo
que passar.`** Saída bruta: `/tmp/verify-agent-add7855ae0e549be6-20260912T170022Z.log` (68K).

⛔ **Está reportado como `INDETERMINADO` e não como verde**, que é o que o DoD 2 exige. **5 dos 6
portões passaram**; o sexto **recusou medir**, e recusa não é aprovação.

### ⚠️ Uma rodada anterior foi DESCARTADA, e isso é parte da medição

A primeira invocação de `verify` reprovou em `lint-backend` (2 erros de `mypy` meus, no driver);
ao relançar, **a primeira não havia morrido** — duas `verify.sh` correram **concorrentes**,
disputando CPU e escrevendo **o mesmo `backend/coverage.xml`**. Isso viola o "máquina ociosa" do
DoD 2 e é gerador de falso resultado, então **as duas foram mortas e a rodada acima é uma terceira,
sozinha** (`pgrep -fa 'scripts/verify.sh'` → **1** durante, **0** depois). Registrado porque um
número medido sob concorrência não é um número.

### ⚠️ `lint-frontend` é INDETERMINADO, e está dito como INDETERMINADO

`rc=3` é a recusa "não mediu", **não** um verde. Falsificado antes de reportar, como o DoD 2 exige:

- `git diff --name-only master...HEAD -- frontend/ | wc -l` → **0** `[MEDIDO]`. A wave não altera
  **nenhum** arquivo de front, então não há o que este portão pudesse reprovar por causa dela;
- `node_modules` nunca existiu nesta worktree (não é versionado); a causa é ambiental e
  **anterior** à wave.

⛔ Não foi rodado `make setup` para pintá-lo de verde: havia instrução explícita de **não tocar em
`frontend/`** (agente de painel trabalhando lá).

## 6 · O que esta wave NÃO faz — e uma ressalva de leitura

- **Sem deploy** (DoD 5). A senha do Postgres pode ser rotacionada pelo owner, já que credenciais
  vivas estiveram num repositório público; deployar antes dessa decisão é trabalho jogado fora.
- **Fase 04 (`long-short`) fora**, aguardando `BLOQUEIO-F04-RATIO-NAO-CARREGA.md`.
- **`use_cases/series_history.py` não foi tocado** (`git diff --name-only master...HEAD | grep -c
  series_history` → **0**) — outro agente aplica `ADR-037` numa branch própria.

> ⚠️ **Ressalva que evita um falso alarme:** esta wave faz o open interest **ser coletado**; ela
> não faz o OI **ser lido**. A identidade de `sum_open_interest` tem `interval='5m'`, e `ADR-037`
> descreve `series_history.py:179` injetando `bucket_interval_ms=_GRID_STEP_MS` (60.000) onde o
> campo exige a grade nativa ⇒ `/api/v1/series-history` responde **`n_points=0`** para séries de
> grade nativa > 1 min. **Isso tem dono e não é regressão desta wave.**
