# CODE-REVIEW — PR #217 (`D16`: atraso de publicação e alinhamento de grade)

**Veredito: COMPLIANT** — nenhuma regra bloqueante violada.

| | |
|---|---|
| universo | `git diff master...HEAD`, cabeça `7c29eda`, merge-base `3db99bd` |
| tamanho | **12 commits, 20 arquivos** (`+3.812/−10`), dos quais **10 são código** (`[code_paths]`) |
| régua mecânica | **8 regras bloqueantes em vigor**, **8 avaliadas**, **0 violadas** |
| revisor | read-only — nenhum arquivo de código alterado, nenhum teste criado, nenhum `gate-record` |

## O denominador, com o comando que o produziu

```bash
harness rules list --severity block              # 8 regras bloqueantes
harness rules --mode file --path <arquivo>       # rodado nos 10 arquivos de código do diff
harness rules --mode sweep --severity block      # 0 [BLOQUEIO], 73 [AVISO]
```

`[MEDIDO 2026-09-15 em 7c29eda]` — varredura do repositório inteiro: **`0` bloqueio, `73` avisos**
(`69` `core.module-docstring-single-line` + `4` `web-fullstack.hardcoded-url`). Os 10 arquivos de
código do diff, um a um: **nenhum `[BLOQUEIO]`**.

⚠️ **`glossary_doc` continua indeclarada**, então idioma segue **convenção, não portão** — e isto foi
reconferido, não herdado: `harness policy --key glossary_doc` devolve vazio com `rc=0` **e**
`grep -n 'glossary' harness.toml` devolve `rc=1`, nenhuma linha. Só o par separa *"declarado e vazio"*
de *"nunca declarado"* (`CLAUDE.md`, gatilho `ADR-013/D2e`).

## 1. ⛔ O wrapper `_supervised` e as 6 threads sobreviveram ao merge — verificado por DOIS caminhos

O `collectors_cli.py` foi reescrito na master no meio desta branch, e o risco era degradação por
caminho lateral. Não houve.

**Caminho A — estrutural.** O corpo de `_supervised` é **byte-idêntico** ao da master:

```bash
diff <(git show master:.../collectors_cli.py | sed -n '1750,1830p') \
     <(sed -n '1833,1913p' .../collectors_cli.py)     # IDENTICO
```

As **6** threads continuam embrulhadas, e nos pontos que o QA mediu — `Thread(` em
`:2374/2393/2412/2434/2455/2475`, cada uma com `target=_supervised(` na linha seguinte. Além do que o
QA mediu, confirmei o ciclo de vida completo, que é onde uma degradação silenciosa caberia:
**6 `.start()`** (`:2497-2502`) e **6 `.join(timeout=_JOIN_TIMEOUT_S)`** (`:2513-2518`). Nenhuma thread
criada e esquecida.

**Caminho B — executivo, porque estrutura viva não é comportamento vivo.**

```bash
pytest tests/sentimento/test_collectors_cli_every_thread_death_exits.py -q   # 6 passed in 9,60s
```

**6/6 mordem.** É o teste que existe por causa do apagão de `18 h 45 min` (`psycopg.OperationalError`,
processo vivo com `rc=0`) — o `rc` ambíguo de `ADR-012`. Ele continua provando que a morte de
**qualquer** das 6 threads leva o processo a `rc != 0`.

**Os 3 drivers de teste tocados não enfraqueceram nada.** O diff de `backend/tests/helpers/` é
**puramente aditivo**: os três só passam o campo novo e obrigatório `klines_cycle_offset_s` de
`BootConfig` (`0.0`, `0.0`, `2.0`), todos valores válidos. **Nenhuma asserção removida, nenhum limiar
afrouxado, nenhum `timeout` alargado.**

## 2. O `xfail(strict=True)` é vermelho DECLARADO, não vermelho escondido

O critério é `ADR-012`: o defeito é o `rc` que não distingue *"nada quebrou"* de *"o instrumento não
mede"*. Julguei contra ele, e o marcador passa — por quatro propriedades, todas verificadas aqui:

1. **É `strict`.** `backend/tests/sentimento/test_publication_lag_table.py:577`. Quando o dado melhorar,
   o passe vira `[XPASS(strict)]` e o portão volta a `rc=1`. Um `xfail` não-estrito devolveria `rc=0`
   dos dois lados da melhora — *essa* seria a proteção decorativa, e o `rc` de fato ambíguo.
2. **A asserção continua executando e continua verdadeira-sobre-o-dado.** `:624` é
   `assert p99(sample) < NATIVE_GRID_MS[KLINES]`, **não relaxada** e **não** trocada por `skip`. Um
   `skip` não mede nada; um `xfail` roda o corpo. Rodado: `43 passed + 1 xfailed`, `rc=0`, e o resumo
   nomeia o motivo.
3. **Nada neutraliza o `strict` globalmente** — verificado, não presumido: `backend/pyproject.toml:103`
   é `addopts = "--strict-markers --strict-config -q"`; **não há `--runxfail` nem
   `xfail_strict = false`**. O marcador vale o que diz que vale.
4. **O vermelho tem dono, escopo e critério de saída escritos.** O docstring (`:586-616`) nomeia a
   pendência `A5` (suspensa), diz que o vermelho é **do DADO** (asserta idêntico antes e depois de
   `418f47b`), e fixa os 4 critérios de reabertura — `ge60k = 0`, `p99 <= 5.000` ms, `mn >= 0`,
   `n >= 4.000` **sobre janela sem buraco de coleta**, com a cláusula final carregando peso justamente
   porque o apagão de `18 h 45 min` passaria por `n >= 4.000` medindo outro regime.

É **1** `xfail` em toda a PR — não uma faixa larga sobre um arquivo inconveniente. Universo:
`grep -rn 'pytest.mark.xfail\|pytest.mark.skip' backend/tests | wc -l` → **11** em toda a suíte.

**Veredito do item: honesto.** O marcador torna o débito *visível e mecanicamente cobrável*, que é
exatamente o oposto do modo de falha que `ADR-012` nomeia.

## 3. Idioma e `docs/INDEX.md`

**Mensagem de `raise`/`Error`/`Exception`: `30` novas, `30` em inglês, `0` em português.** Medido por
**AST** (não por regex de uma linha — `CLAUDE.md` documenta que o grep de uma linha subconta `34` contra
`137` reais, por não alcançar `raise` partido em várias linhas):

```bash
# percorre toda Call cujo nome termina em Error/Exception, str e f-string, nos .py do diff
```

Amostra: `grid_aligned_ticker.py:112` → `"offset_s must be in [0, {interval_s!r}), got {offset_s!r}"`.
Conforme à decisão de 2026-09-02 (prosa adjacente à tabela de fronteira, tratamento da linha 1).

**Identificador de produção e de teste (linhas 1 e 2):** inglês. Nomes de arquivo novos —
`grid_aligned_ticker.py`, `publication_lag_table.py`, `test_grid_aligned_ticker.py` — inglês (linha 3).

**Evento de log novo (linha 10):** `collector_tick_skipped`, com `extra={}` de chaves `endpoint`,
`skipped_ticks`, `interval_s`, `next_target_s` — **tudo inglês**, prospectivamente correto. O passivo de
4 eventos PT não cresceu.

**Falsificador `CA-F1-6` (erosão da exceção de componentes) — NÃO dispara:**

```bash
git ls-tree -r --name-only HEAD | grep -E '^(backend/src|backend/tests|frontend/src)/' \
  | awk -F/ '{for(i=1;i<NF;i++) print $i}' | sort -u \
  | grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'
```

**22 segmentos, `0` em português** `[MEDIDO 2026-09-15 em 7c29eda]` — `painel` já virou `panel`. A
exceção não virou rampa.

**`docs/INDEX.md` é append-only e foi respeitado:** `+5` inserções, **`0` deleções**
(`git diff master...HEAD -- docs/INDEX.md | grep -c '^-[^-]'` → `0`). Nenhuma linha existente reescrita.

## 4. Arquitetura declarada — camadas e contratos

`make boundaries` → **`Contracts: 7 kept, 0 broken`**. Conferi o caso que esta PR poderia quebrar:
`publication_lag_table.py` é **domínio** e importa só `dataclasses`, `typing` e
`src.modules.sentimento.domain.availability_lag_stats` — **nenhum import de `infra`**, nenhum socket.
`GridAlignedTicker` está em `infra/`, que é onde um relógio de parede pertence, e chega ao coletor por
**injeção** (`wall_clock_s: Callable[[], float] = time.time`), preservando o contrato *"consumidor não
importa infra de contexto"*.

**Fail-fast de boot (`RN-4`, `SPEC-004` §3.1) foi endurecido, não afrouxado:**
`premium_index_cycle_interval_s` migrou de `_parse_float` para `_positive_float`, e `_positive_float`
passou a recusar `nan` e `inf` (`not value > 0 or not math.isfinite(value)`) — com o comentário
explicando por que as duas comparações **não se subsumem** (`nan <= 0` é `False`, logo a grafia antiga
aceitava `nan`). `_grid_offset` recusa offset fora de `[0, interval_s)` **no boot**, e o comentário diz
por que ali e não no uso: dentro da thread o único sintoma seria uma thread morta minutos depois.

`deploy/compose.yml`: **só comentário** (`+10`, documentando `KLINES_CYCLE_OFFSET_S`). Nenhum segredo
literal — `own.compose-hardcoded-secret` não dispara. A variável segue a rota já declarada em `:157-158`
(`env_file:`, deliberadamente **fora** de `environment:`, que teria precedência).

## Achados

Nenhum BLOCKER.

- **[WARNING]** docstring de módulo não abre e fecha na primeira linha —
  `backend/src/modules/sentimento/infra/grid_aligned_ticker.py:1` — regra
  **`core.module-docstring-single-line`** (severidade **AVISO**, não bloqueante).
  **Correção:** resumir a primeira linha em uma sentença que abra e feche na linha 1, movendo o corpo
  para depois de uma linha em branco.
  ⚠️ **Contexto obrigatório para não induzir o leitor ao erro:** este aviso tem **69 ocorrências** no
  repositório e é o estilo de casa (docstrings longas e argumentadas). O arquivo novo acrescenta **1**
  a esse conjunto. **Não reprova a PR** e seria falso positivo tratá-lo como bloqueio.

- **[INFO]** `backend/src/modules/sentimento/infra/collectors_cli.py:1` diz *"ONE process, **FIVE**
  threads"*, e o processo roda **SEIS** (`liquidation_thread` é a sexta).
  ⚠️ **PRÉ-EXISTENTE, não introduzido por esta PR** — verificado:
  `git show master:...collectors_cli.py | head -1` traz a mesma frase. O próprio docstring já tem a
  seção *"THE FOURTH THREAD"*, então o padrão de manutenção existe e só ficou para trás.
  **Correção sugerida** (fora do escopo desta PR, e não a bloqueia): atualizar o cabeçalho para SIX e
  acrescentar a seção da sexta thread, como as anteriores fizeram.

## Execução conferida

```bash
pytest tests/sentimento/test_grid_aligned_ticker.py \
       tests/sentimento/test_collectors_cli_boot.py \
       tests/sentimento/test_publication_lag_table.py -q --no-cov
# 107 testes: 106 passed + 1 xfailed, rc=0  (__pycache__ purgado, PYTHONDONTWRITEBYTECODE=1)
```

`__pycache__` foi purgado antes de rodar — verde de cache não é verde.

## O que este laudo NÃO faz

- **Não refaz** `gates/QA-PR-217-revalidacao.md` nem `gates/FIX-PR-217-acoes-1-e-2.md` (laudos fechados);
  a mutação que prova o `strict` está lá e não foi reexecutada aqui.
- **Não grava `gate-record`** e **não aprova gate** — revisor é read-only e não avança estado.
- **Não** reabre `D16` (suspenso, pendência `A5` com dono).
