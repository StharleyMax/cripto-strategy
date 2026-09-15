# QA — `418f47b` · `O4`, alinhar o poll de klines à grade

- **commit** `418f47b33720c5f7536d600cdc3b50ae6ac39e43` · branch `worktree-agent-a5e4d8ce09d8fda3d`
- **feature** `cinco-metricas-do-core` · **componente** `sentimento`
- **data** 2026-09-11 · **modo** gate dirigido (5 itens de ataque nomeados pelo requisitante)
- **escopo de escrita deste gate**: **só arquivo de teste** (`backend/tests/sentimento/test_grid_aligned_ticker.py`,
  `+10` testes). Nenhum arquivo de produção, nenhum `frontend/`, nenhuma escrita no Postgres,
  nenhum `harness gate-record` — todos vedados pelo despacho.

---

## Item 1 — o risco que o próprio conserto cria: o sono pode ser `<= 0`?

**Não, em nenhum caminho alcançável.** `next_grid_instant_s` calcula
`offset_s + (floor((now_s - offset_s)/interval_s) + 1) * interval_s`; em aritmética real o
resultado é estritamente à frente, e a pergunta que a prosa não resolve é se IEEE 754 concorda na
magnitude de época (`~1.79e9`, onde 1 ULP ≈ `2,4e-7` s).

Varredura própria, `n = 1.080.000` instantes — todo ponto de grade de uma janela e seus vizinhos
de ±1/±2/±3 ULP, mais amostras aleatórias:

```
python3 <scratchpad>/probe3.py   # 3 épocas x 9 cadências x 4 offsets
```

| época | cadências testadas | violações `slept_s <= 0` |
|---|---|---|
| 2026 (`1.789.000.000`) | `1e-6 · 1e-3 · 0,1 · 0,3 · 1 · π · 60 · 900 · 86.400` | **0 / 40.000 cada** |
| 2100 (`4.102.444.800`) | idem | **0 / 40.000 cada** |
| 9999 (`253.402.300.799`) | idem, exceto `1e-6` | **0 / 40.000 cada** |
| 9999 | `interval_s = 1e-6` | **39.632 / 40.000**, pior `-3,05e-5` s |

⚠️ A única classe que quebra é **ano 9999 com cadência de 1 microssegundo** — fora do alcance
(e a essa cadência o coletor já é um laço apertado por configuração, independente deste módulo).
Para toda época e toda cadência plausíveis, incluindo as **não representáveis em binário**
(`0,1`, `0,3`) e uma **irracional** (`π`), a garantia "estritamente à frente" sobrevive.

Os quatro caminhos que o despacho nomeou, um a um:

1. **Relógio andando para trás (NTP)** — **seguro, e agora TESTADO.** O alvo é recomputado do
   `now_s` **corrente** a cada `wait`, nunca de `last_target`; um passo de `-3600 s` produz um
   sono de `22,0 s`, na grade, não um sono negativo. ⚠️ **Era o buraco de cobertura**: nenhum dos
   12 testes entregues move o relógio para trás. Fechado por
   `test_an_ntp_step_backwards_still_sleeps_forward_and_resumes_on_the_grid`.
2. **`interval_s` fracionário** — coberto pela varredura acima (`0,1` · `0,3` · `π` · `1e-3`): 0 violações.
3. **`offset` na borda** — `offset = 59,999999` e `offset = nextafter(interval, -inf)`: 0 violações.
4. **Trabalho de duração exatamente igual ao intervalo** — `slept_s = 22,0`, `skipped_ticks = 0`.
   O instante cai exatamente sobre um ponto de grade e a resposta é o **próximo**, não ele mesmo.

## Item 2 — `KLINES_CYCLE_OFFSET_S`: a recusa morde?

**Morde.** `resolve_boot_config` executado sobre 16 ambientes:

| valor | veredito |
|---|---|
| ausente | ACEITO → `2.0` (o default declarado) |
| `-1` | **RECUSADO** — `KLINES_CYCLE_OFFSET_S must be in [0, 60.0), got -1.0` |
| `60` (o `interval_s` exato) | **RECUSADO** — intervalo é `[0, interval_s)`, semiaberto de verdade |
| `59.999999` | ACEITO (correto: `< 60`) |
| `"abc"` | **RECUSADO** — `must be a number, got 'abc'` |
| `""` (vazio) | **RECUSADO** — `must be a number, got ''` |
| `"   "` | **RECUSADO** |
| `nan` · `inf` · `1e400` | **RECUSADO** (a comparação encadeada é falsa para `nan`, e `not False` recusa) |
| `10` com `KLINES_CYCLE_INTERVAL_S=10` | **RECUSADO** — a borda acompanha o intervalo configurado, não um `60` fixo |
| `30` com `interval=10` | **RECUSADO** |
| `-0.0` | ACEITO — inofensivo (`0.0 <= -0.0` é verdade e a aritmética é idêntica a `0.0`) |

A recusa é **por boot** (`CollectorBootConfigurationError`, `RN-4`) e o `GridAlignedTicker`
guarda o próprio construtor de novo — as duas camadas existem e as duas mordem.

## Item 3 — o vermelho pré-existente, confirmado por conta própria

**Confirmado, e a tensão do relatório dele tem explicação aritmética exata.**

```bash
# no worktree do commit
bash backend/scripts/test-fast.sh -k "the_live_lag_holds_the_grid"
#   assert 60936 < 60000   -> 1 failed, 2192 deselected

# worktree DETACHED e limpo no commit PAI (967368f), venv do worktree:
git worktree add --detach <scratch>/pre 967368f
cd <scratch>/pre/backend && <venv>/python -m pytest --no-cov -k "the_live_lag_holds_the_grid" -q
#   assert 60936 < 60000   -> falha IDÊNTICA
```

E o arquivo é byte-idêntico entre os dois commits:

```bash
git diff HEAD -- backend/src/modules/sentimento/domain/publication_lag_table.py   # vazio
git diff --stat 967368f 418f47b -- .../publication_lag_table.py .../test_publication_lag_table.py
#   vazio  (e `git show --pretty=format: --name-only 418f47b | grep -c publication_lag_table` = 0:
#    só a MENSAGEM do commit cita o arquivo)
```

**A tensão "2.189 passed" × "há um vermelho" — as duas cabem juntas, e o que faltava era o denominador:**

```bash
pytest --collect-only -q                       -> 2.193 testes
pytest --collect-only -q -m "process_real"     ->     3 testes
pytest --collect-only -q -m "not process_real" -> 2.190 testes
```

- **`make verify`** roda `bash backend/scripts/test.sh -m "not process_real"` (`scripts/verify.sh:105`)
  ⇒ seleção de **2.190**. `2.189 passed + 1 failed = 2.190`. **É desta seleção que vem o `2.189`.**
- **`make test`** (sem `-m`) roda os **2.193**.
- **`make test-fast K=…`** roda `--no-cov` com o filtro `-k`, e foi de onde saíram
  `12 passed, 2181 deselected` (soma `2.193`).

Ou seja: o `2.189` **nunca foi um verde**; era `2.190 − 1`. O relatório omitiu o denominador, não
inventou o número. ⚠️ Mas a omissão importa: `2.189 passed` lido sozinho anuncia suíte verde, e a
suíte **não** está verde — `make verify` reprova no portão `test`.

## Item 4 — `_run_premium_index_collector` (`collectors_cli.py:636`): defensável ou defeito vivo?

**Veredito: a DECISÃO de código dele está certa; a JUSTIFICATIVA está errada, e a fonte que ela
cita é falsa. Quem tem razão é ele no "deixar", ninguém no "porquê".**

**(a) A deriva EXISTE em `premiumIndex`, e é mensurável — pelos números da própria tabela.**
`build_premium_index_to_rows` emite **2 linhas por símbolo por ciclo** (`_mark_price_key` e
`_funding_estimado_key`, `collector_series_mapping.py:265-283`) sobre 4 símbolos ⇒ **8 linhas/ciclo**.
Com `sample_n = 34.752` e a janela `window_end_ms − window_start_ms = 262.496 s`
(`publication_lag_table.py:254-266`):

```
34.752 / 8               = 4.344 ciclos
262.496 s / (4.344 - 1)  = 60,441 s por ciclo   contra uma cadência declarada de 60,0 s
```

**A assinatura do `O4` está lá: `+0,441 s` por volta.** Não é "não exibe a assinatura" — é `0,7%`
dos pontos de uma grade de 60 s que nunca recebem amostra, e uma `SeriesKey.interval` gravada
literalmente como a string `"60s"` (`collector_series_mapping.py:260`) sobre amostras que distam
`60,44 s`.

**(b) Por que a MEDIÇÃO não podia mostrá-la — e este é o argumento forte que faltava.**
`_build_row` grava `bucket_end = instant_ms = reading.source_time`
(`collector_series_mapping.py:230`), isto é, **o relógio da própria Binance no instante em que ela
respondeu**. Logo, para `premiumIndex`,

```
available_at − bucket_end  =  received_at − source_time  =  ida-e-volta de rede, e mais nada
```

— **a fase do nosso poll é algebricamente ausente da estatística.** O `p99 = 1.758 ms` seria o
mesmo com o escalonador perfeito ou com um que derivasse uma hora por dia. Em klines o
`bucket_end` vem da **grade do venue** (`close_time_ms`), e por isso lá a fase aparece — e aparece
como `96,7%` do `p99` contra `3,1%` aqui (`publication_lag_table.py:112`), que é a própria tabela
dizendo que estes dois números medem coisas diferentes.

⇒ Ele escreveu *"não aparece na medição" não é "não existe"* e estava **certo em hedgear** — mas
o que havia para dizer era mais forte e estava no código: **a medição é incapaz de mostrar, por
construção**. "Ausência de evidência" aqui nem chega a ser ausência de evidência; é **ausência de
instrumento**.

**(c) ⛔ E há um defeito de FATO herdado, em comentário de produção, que este gate reprova.**
`publication_lag_table.py:119-122` afirma:

> *"`premiumIndex` … that collector polls **ON the grid point** instead of after a bucket closes,
> so `424` of `34.752` rows (`1,22%`) carry `available_at` a few tens of ms **BEFORE** `bucket_end`."*

As duas metades são falsas, e a segunda é **impossível**:

1. O coletor **não** é alinhado à grade — usa o mesmíssimo `stop_event.wait(interval_s)`
   pós-trabalho (`collectors_cli.py:636`), e a alínea (a) mede a deriva: `60,441 s`.
2. `bucket_end` é carimbado pela Binance **ao responder**; `available_at` é carimbado por nós **ao
   receber**. Em tempo real o recebimento é sempre **posterior**. Um valor negativo só pode ser
   **desvio entre os dois relógios** — nunca "poll antes do bucket fechar". A explicação escrita
   descreve um evento que a ordem causal proíbe.

`OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md:194` propaga a mesma afirmação (*"coletor **alinhado à
grade**"*), e o handoff deste commit
(`handoff/REMEDICAO-ATRASO-APOS-ALINHAMENTO.md:85-90`) a cita como fonte. São **três documentos**
carregando o mesmo fato falso — exatamente o modo de falha que o `CLAUDE.md` nomeia como o defeito
real mais caro já encontrado aqui (*"uma regra anti-lookahead que estava **invertida** e propagada
por dois documentos"*).

**O que este gate exige, e o que ele NÃO exige:** não exige consertar o escalonador do
`premiumIndex` nesta task — o escopo é klines, o defeito medido é klines (`105/4.289`), e nomear o
resto em vez de calar foi o ato certo. Exige **corrigir as três frases**, porque enquanto elas
existirem o próximo leitor conclui que `premiumIndex` está alinhado e a remedição futura vai
comparar contra uma linha de base falsa.

## Item 5 — relógio injetado, zero `sleep` real

**Confirmado.** `grep -c "time.sleep" backend/tests/sentimento/test_grid_aligned_ticker.py` = **0**.
O relógio é `_FakeWallClock` e o latch é `_ClockAdvancingStopEvent`, cujo `wait` **avança o relógio
falso** em vez de bloquear. Custo medido: **22 testes em 1,42 s** (`make test-fast K=grid_aligned`)
— incluindo os 10 que este gate acrescentou, um dos quais varre `2.000` instantes por caso.

Os dois únicos `time.sleep` vizinhos (`test_collectors_cli_ingest_run_pairs.py:44`,
`test_collectors_cli_shutdown.py:33`) são laços de *polling* **pré-existentes** e não foram tocados
por `418f47b` (não aparecem no `--name-only` do commit).

---

## O que este gate ACRESCENTOU à suíte, e a prova de que morde

`backend/tests/sentimento/test_grid_aligned_ticker.py`, `12 -> 22` testes. Nenhum arquivo de
produção tocado.

| teste novo | buraco que fecha |
|---|---|
| `test_an_ntp_step_backwards_still_sleeps_forward_and_resumes_on_the_grid` | a afirmação de NTP do docstring do módulo, que nenhum teste exercia |
| `test_a_clock_stepped_backwards_reports_no_skipped_ticks_rather_than_a_negative_count` | o `max(0, …)` de `skipped_ticks`, que ia para o `extra={}` de um log |
| `test_no_cadence_or_offset_in_this_repository_can_round_the_sleep_down_to_zero` (×8 params) | a garantia "estritamente à frente" sob IEEE 754, não só em aritmética real |

**Mutação executada** (mutantes construídos em memória, produção **nunca** editada —
`<scratchpad>/mutants.py`):

```
PASS  sweep  vs ORIGINAL
FAIL  sweep  vs MUTANT-A (floor sem o +1)        -> menor sono foi -59,99999976 s
PASS  ntp    vs ORIGINAL
FAIL  ntp    vs MUTANT-B (last_target+interval)  -> sonos [58,3 · 60,0 · 3660,0 · 60,0]
PASS  skip   vs ORIGINAL
FAIL  skip   vs MUTANT-C (sem max(0,…))          -> reportou -60 pontos de grade pulados
```

⚠️ **O `MUTANT-B` sobreviveu à primeira versão do teste de NTP e a asserção foi corrigida por
causa disso.** Um passo de relógio **para trás** não faz `last_target + interval` ficar negativo —
faz ficar **longe demais à frente**: o mutante dorme `3.660 s` e o coletor passa **uma hora sem
pollar**. A asserção que separa os dois não é "sono `> 0`" (que o mutante satisfaz) e sim
**"sono `<= 1` cadência"**. Toda asserção que só proíbe `<= 0` é cega para este defeito — anotado
no docstring do teste.

## Achados PRÉ-EXISTENTES (não introduzidos por `418f47b`, não bloqueiam este commit)

1. ⛔ **`PREMIUM_INDEX_CYCLE_INTERVAL_S` não tem guarda nenhuma de positividade.**
   `collectors_cli.py:446` usa `_parse_float`, não `_positive_float`. Medido:
   `PREMIUM_INDEX_CYCLE_INTERVAL_S=0` **boota** (`-> 0.0`), assim como `-5` e `inf`. Um `0`
   entrega exatamente o laço apertado contra `/fapi/v1/premiumIndex` que o docstring do
   `_positive_float` existe para proibir. Introduzido em `4951fe3`.
2. `KLINES_CYCLE_INTERVAL_S=inf` é aceito (`inf > 0`): o coletor dorme para sempre em vez de
   pollar. Falha silenciosa, mas na direção segura.
3. O vermelho do item 3 (`assert 60936 < 60000`), que é o próprio `D16` e já tem dono.

---

## O portão

```
make verify   # rc=1
[OK       ] lint-backend    rc=0  419 source files
[OK       ] lint-frontend   rc=0
[FALHA    ] test            rc=1  2199 passed · Total coverage: 97.00%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 68 aviso(s)
[OK       ] política        rc=0
veredito: VERMELHO
```

- **A única falha é a do item 3**, provada pré-existente:
  `FAILED tests/sentimento/test_publication_lag_table.py::test_the_live_lag_holds_the_grid_…`
  `1 failed, 2199 passed, 3 deselected` (`2.190` da seleção `-m "not process_real"` `+ 10` deste gate `= 2.200`).
- **`grid_aligned_ticker.py`: cobertura `100%`** — `45` comandos, `10` ramos, `0` não cobertos.
  Total do repositório `97,00%`.
- **`boundaries` `7 kept, 0 broken`**, com `Camadas por contexto: infra > use_cases > domain KEPT`
  — a alegação de `ADR-016/D4` ("o relógio fica em `infra`") está **medida**, não só afirmada.
- **`regras`: `0` bloqueio.** As 8 regras bloqueantes de `harness rules list --severity block`
  foram avaliadas pelo próprio portão. 1 aviso novo e não-bloqueante:
  `[core.module-docstring-single-line] grid_aligned_ticker.py:1`.

### [anomalia] a suíte levou `532,18 s` (8min52), não os `~37,5 s` da doutrina

`1 failed, 2199 passed, 3 deselected, 4 warnings in 532.18s (0:08:52)`. É **14×** o número que o
`CLAUDE.md` cita para a suíte inteira. Não é causado por `418f47b` (os 22 testes de
`grid_aligned` custam `1,42 s` somados e não há `sleep` real neles), mas **é uma resposta
desconhecida**: não há medição aqui que diga se é cobertura, carga do host, ou um teste que
espera por I/O. Fica nomeado, não explicado.

---

## VEREDITO: `NEEDS_FIX`

**O código está certo e não precisa mudar.** `GridAlignedTicker` sobreviveu a todos os cinco
ataques: `0` violações de `slept_s <= 0` em `n = 1.080.000` instantes sobre épocas e cadências
realistas, NTP para trás seguro, recusa de `offset` mordendo em 16 ambientes, `100%` de cobertura,
camadas intactas, zero `sleep` real, e três mutantes mortos.

As duas ações não são sobre o conserto — são sobre o **registro** dele:

1. ⛔ **Corrigir a afirmação falsa sobre `premiumIndex` nos três lugares**, porque enquanto ela
   existir a remedição futura compara contra uma linha de base inventada:
   - `backend/src/modules/sentimento/domain/publication_lag_table.py:119-122` — "*polls ON the
     grid point*" é falso (mesmo `wait(interval_s)` pós-trabalho, deriva medida de `60,441 s/ciclo`);
     e "*`available_at` a few tens of ms BEFORE `bucket_end`*" **não pode** ser causado pelo
     horário do poll — `bucket_end` é o relógio da Binance ao responder e `available_at` é o nosso
     ao receber, então valor negativo é **desvio de relógio**, e só.
   - `docs/context/cinco-metricas-do-core/OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md:194` — remover
     "coletor **alinhado à grade**".
   - `docs/context/cinco-metricas-do-core/handoff/REMEDICAO-ATRASO-APOS-ALINHAMENTO.md:85-90` —
     trocar "*não exibe a assinatura do defeito na medição*" pelo enunciado forte e verificável:
     **a medição de `premiumIndex` é incapaz de exibir a fase do poll por construção**, porque
     `bucket_end = source_time` (`collector_series_mapping.py:230`); a deriva existe e mede
     `60,441 s/ciclo`.
2. **Declarar o vermelho de `test_the_live_lag_holds_the_grid_…` como esperado**, com o commit
   que o resolve. Ele é pré-existente e tem dono (`D16`), mas `make verify` está **VERMELHO** e
   um portão vermelho sem declaração é indistinguível de regressão para o próximo leitor —
   `ADR-012`, o mesmo modo de falha do `rc=0` ambíguo.

**Não bloqueia:** consertar o escalonador do `premiumIndex` (fora do escopo, corretamente nomeado)
e os dois achados pré-existentes de validação de `interval` listados acima.
