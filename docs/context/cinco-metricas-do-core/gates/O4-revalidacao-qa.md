# QA — RE-VALIDAÇÃO de `1549bab` (as 4 ações do `NEEDS_FIX` de `418f47b`)

- **feature** `cinco-metricas-do-core` · **componente** `sentimento` · **data** 2026-09-11
- **branch** `worktree-agent-a5e4d8ce09d8fda3d` · **HEAD** `1549bab`
- **parecer de origem** [`O4-alinhamento-de-grade-qa.md`](O4-alinhamento-de-grade-qa.md) (`NEEDS_FIX`)
- **resposta do builder** [`O4-correcoes-pos-qa-builder.md`](O4-correcoes-pos-qa-builder.md)
- ⛔ **escopo desta re-validação:** nada em `frontend/`, nenhuma escrita no Postgres, nenhuma
  edição de produção que tenha sobrevivido (as mutações foram restauradas e o `sha256` confere),
  nenhum `gate-record` gravado.

## Veredito: `NEEDS_FIX` — 3 ações e meia confirmadas, 1 achado NOVO provado

As quatro ações estão feitas. O que reprova **não** é uma delas: é uma **afirmação nova, escrita
neste commit**, sobre o `inf` — e ela é falsa por medição.

---

## AÇÃO 1 — CONFIRMADA. A afirmação falsa saiu, e o texto novo é o certo

Grep próprio (não o falsificador dele), sobre `docs/` e `backend/` inteiros:

```bash
grep -rn "ON the grid point\|alinhado à grade\|alinhado a grade" docs/ backend/
```

`4` ocorrências vivas, **nenhuma em posição assertiva**: o parecer de QA que a cita como achado,
o relatório do builder que a cita como o que corrigiu, a linha de `docs/INDEX.md` que descreve a
correção, e `OPCOES-D16-…:194`, onde a frase aparece **dentro** de *"este documento afirmava aqui
… **É falso**"*. Em `backend/src`: **zero**.

O comentário de `domain/publication_lag_table.py` foi **reescrito**, não emendado — e o
enunciado novo é mais forte que a ressalva que eu tinha pedido:

- *"the reason is NOT that its collector is aligned to the grid … it closes its cycle with the
  same post-work `stop_event.wait(interval_s)`"* (linhas 119-123);
- `bucket_end = reading.source_time` ⇒ `available_at − bucket_end = received_at − source_time`
  ⇒ *"Our poll phase is ALGEBRAICALLY absent from the column … absence of instrument, not absence
  of evidence"* (127-132);
- `min = −100 ms` ⇒ *"A negative value can only be SKEW between the two clocks"* (134-138).

**Aritmética da deriva, reproduzida por mim sobre as constantes do próprio módulo** — não sobre o
texto dele:

```
sample_n 34752 · window_s 262496.0 · ciclos 4344.0 · s/ciclo 60.441 · lag_min_ms -100
```
`[MEDIDO 2026-09-11, n = 34.752 linhas, lido de `ENDPOINT_PUBLICATION_LAG['…premiumIndex']`]`

## AÇÃO 2 — CONFIRMADA. O vermelho está declarado onde o leitor tropeça

`backend/tests/sentimento/test_publication_lag_table.py`, docstring de
`test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away`:

- *"⛔ THIS TEST IS RED ON PURPOSE, AND THAT IS THE DECLARED STATE OF THE GATE — NOT A REGRESSION"*;
- nomeia o valor (`assert 60936 < 60000`), o commit pai byte-idêntico (`967368f`), e que o
  `rc=1` dura *"until the data changes, not until the test does"*;
- nomeia **o que o fecha**: os quatro critérios (`ge60k = 0`, `p99 <= 5.000 ms`, `mn >= 0`,
  `n >= 4.000`) e o documento de remedição;
- *"DO NOT relax the assertion"*, com a grade medida (`44.612` passos, 1 valor distinto).

O mesmo em `handoff/REMEDICAO-ATRASO-APOS-ALINHAMENTO.md` §*"⛔ O portão está VERMELHO, e o
vermelho é ESPERADO"* (linhas 110-133). Quem rodar `make verify` amanhã encontra a declaração pelo
nome do teste que falha — que é exatamente onde ele vai olhar.

## AÇÃO 3 — CONFIRMADA

`handoff/MEDICAO-ATRASO-DE-PUBLICACAO.md:186-188`: `4 reprovam` e `3 reprovam` no lugar de `3` e
`2`, com os testes nomeados, e a terceira linha marcada `[NÃO REMEDIDO]` em vez de reafirmada.
História de commit não reescrita, como pedido.

## AÇÃO 4 — CONFIRMADA, e a varredura não achou outra armadilha viva

**A medição do `nan`, refeita por mim** (3 repetições, não 1):

```
wait(nan) -> False em 1.4033983461558819e-05 s
wait(nan) -> False em 8.378003258258104e-06 s
wait(nan) -> False em 4.535017069429159e-06 s
nan <= 0 : False        not nan > 0 : True        inf > 0 : True
```
`[MEDIDO 2026-09-11, CPython 3.13.13, Linux 6.1]` — a troca `value <= 0 → not value > 0` **não é
cosmética**: sem ela `nan` boota e entrega o laço apertado.

**Varredura de toda guarda de configuração** (`grep '<= 0\|> 0'` em `collectors_cli.py` e nos
vizinhos de `infra/`), com o destino de cada `nan` **medido**, não inferido:

| guarda | `nan` passa? | destino do `nan`, medido | veredito |
|---|---|---|---|
| `_positive_float` (`collectors_cli.py:377`) | não (`not nan > 0` é `True`) | recusado no boot, nomeando a variável | OK |
| `_grid_offset` (`:396`) | não (`0.0 <= nan` é `False` ⇒ `not False`) | recusado no boot | OK |
| `_positive_int` (`:412`, grafia antiga `<= 0`) | **inalcançável**: `int('nan')` → `ValueError` | recusado por `_parse_int` | OK |
| `grid_aligned_ticker.py:76` e `:109` (grafia antiga `<= 0`) | sim, a guarda aceita | mas o construtor recusa pelo offset (`not 0.0 <= 0.0 < nan`), e `next_grid_instant_s` levanta `ValueError: cannot convert float NaN to integer` em `math.floor` | **resíduo cosmético**, não armadilha |
| `system_probe_clock.py:26` / `system_ramp_clock.py:28` (`< 0`) | sim | `time.sleep(nan)` → `ValueError: Invalid value NaN` | OK (alto e claro) |
| `premium_index_probe_cli.py:139` (`wait(float(args.interval_seconds))`, **sem guarda nenhuma**) | sim | `time.sleep(nan)` → `ValueError`; e o laço é limitado por `--cycles` | OK (pré-existente, não é a armadilha) |

⇒ **`threading.Event.wait` é o ÚNICO sumidouro que aceita `nan` em silêncio** entre todos os
medidos; todos os outros levantam. E **todo caminho de configuração que chega a um
`Event.wait`** passa hoje por `_positive_float`. **Nenhuma armadilha sobrou** — o resíduo das
linhas `76`/`109` é a grafia, não a consequência, e está registrado aqui para quem mexer no
módulo não recriar o furo ao mudar a ordem das guardas.

## ⛔ O achado que reprova — `inf` NÃO é "direção segura", e a frase é NOVA deste commit

`O4-correcoes-pos-qa-builder.md` escreve: *"é falha na direção segura (`Event().wait(inf)` levanta
`OverflowError` em vez de martelar o venue)"*. **O parêntese é verdade; a conclusão é falsa.**

**O que eu medi:**

```
Event().wait(inf) -> OverflowError: timestamp out of range for platform time_t   em 1.5e-05 s
resolve_boot_config({'KLINES_CYCLE_INTERVAL_S': 'inf'})          -> BOOTOU -> inf
resolve_boot_config({'PREMIUM_INDEX_CYCLE_INTERVAL_S': 'inf'})   -> BOOTOU -> inf
(idem 'Infinity' e '1e400')
GridAlignedTicker(interval_s=inf).wait(...) -> OverflowError
```
`[MEDIDO 2026-09-11]`

**Primeiro:** a hipótese *"bloqueia para sempre"* está **falsificada** — em CPython/Linux ele não
dorme, ele levanta. **Segundo, e é o defeito:** o `OverflowError` é levantado em
`collectors_cli.py:640`, **FORA** do `try` (que vai de `:581` a `:611`), e `OverflowError` **não
está** em `_PUBLISH_FAILURE_EXCEPTIONS` (`RedisCommandError`, `RedisProtocolError`, `OSError`,
`ValueError`, `StreamTransportError`, `SeriesRowMappingNotDecidedError`). Logo:

> a thread do coletor **morre ao fim do primeiro ciclo**, sem `failure_event.set()` e sem
> `exit_code[0] = 1`; o supervisor em `:1222` gira em `while not stop.is_set() and not
> failure.is_set()` e **não percebe**. O processo segue vivo, o `rc` segue `0`, e o coletor está
> morto. É o `rc=0` ambíguo de `ADR-012`, com um traceback de `threading.excepthook` como único
> aviso.

⇒ a resposta à pergunta do despacho é: **não bloqueia para sempre — é pior, morre e nada avisa.**

**Prova executável** (roda hoje, `6 failed, 1 passed`; fica FORA de `backend/tests/` de propósito,
para o portão manter **um** vermelho declarado — cole junto com o conserto):

```python
@pytest.mark.parametrize("variable", ["KLINES_CYCLE_INTERVAL_S", "PREMIUM_INDEX_CYCLE_INTERVAL_S"])
@pytest.mark.parametrize("raw", ["inf", "Infinity", "1e400"])
def test_a_non_finite_cadence_is_refused_at_boot(variable: str, raw: str) -> None:
    with pytest.raises(CollectorBootConfigurationError):
        resolve_boot_config({variable: raw})


def test_the_sink_of_a_non_finite_cadence_dies_uncaught() -> None:
    """`stop_event.wait(inf)` does not block: it raises, and the raise is not caught."""
    with pytest.raises(OverflowError):
        threading.Event().wait(math.inf)
    assert not issubclass(OverflowError, _PUBLISH_FAILURE_EXCEPTIONS)
```

⚠️ **Armadilha que este mesmo teste me pregou, e vale para quem for colá-lo:** a primeira versão
passou **verde pelo motivo errado** — com `INGEST_RECORD_BACKEND='jsonl'` (valor inválido),
`resolve_boot_config` levanta `CollectorBootConfigurationError` **antes** de olhar a cadência, e o
`pytest.raises` engolia a vitória. Use o backend padrão (ou `sqlite`) e, como o teste do builder
já faz, **assere `excinfo.value.variable`**.

## Regressão — os 22 testes do ticker e os três mutantes

```
pytest tests/sentimento/test_grid_aligned_ticker.py -q   -> 22 passed
pytest tests/sentimento/test_collectors_cli_boot.py -k "cadence or interval or positive" -> 18 passed
MUTANT-A (floor sem o +1)              -> FAILED test_no_cadence_or_offset_…_round_the_sleep_down_to_zero (3+ params)
MUTANT-B (last_target + interval)      -> FAILED …skips_ahead_and_never_sleeps_backwards
                                          FAILED …a_skipped_grid_point_is_counted_and_a_served_one_is_not
                                          FAILED …an_ntp_step_backwards_still_sleeps_forward_and_resumes_on_the_grid
MUTANT-C (sem max(0, …))               -> FAILED …reports_no_skipped_ticks_rather_than_a_negative_count
```

**`MUTANT-B` — o que sobreviveu à minha primeira versão — agora é morto por 3 testes**, o de NTP
entre eles, pela asserção *"sono `<= 1` cadência"*. Mutantes aplicados por `sed` sobre a produção e
revertidos por cópia; `sha256sum -c` → `SUCESSO` depois de cada um, e o próprio `make verify`
fecha com `[----] diff  sem mudança não-commitada`.

## O portão

```
make verify   # rc=1
[OK       ] lint-backend    rc=0  419 source files
[OK       ] lint-frontend   rc=0
[FALHA    ] test            rc=1  2208 passed · Total coverage: 97.00%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 68 aviso(s)
[OK       ] política        rc=0
[----     ] diff            sem mudança não-commitada
veredito: VERMELHO
```

- **`grep -c '^FAILED'` no log bruto: `1`.** É `test_the_live_lag_holds_the_grid_…` — o `D16`
  declarado. `1 failed, 2208 passed, 3 deselected in 481,42s`.
- `grid_aligned_ticker.py`: **`45` comandos, `10` ramos, `0` não cobertos — 100%**.
- **Regras bloqueantes: 8 de 8** avaliadas pelo portão `regras` (`0` bloqueio). O aviso
  `[core.module-docstring-single-line] grid_aligned_ticker.py:1` é não-bloqueante e já era.
- **[anomalia]** o **piso de cobertura POR CAMADA não foi medido nesta rodada**: `test.sh` roda o
  piso **depois** da suíte, e a suíte reprova no `D16`. Total global `97,00%` contra
  `fail_under = 70` (`backend/pyproject.toml:123`) está medido; o piso por camada fica
  **desconhecido enquanto o vermelho declarado durar** — e desconhecido não é `OK`.

## Ação única para fechar

1. ⛔ **Recusar cadência não-finita em `_positive_float`** — a guarda que este commit já tocou,
   uma linha (`if not value > 0 or not math.isfinite(value):`, ou `math.isfinite` explícito), com
   os dois testes acima colados em `test_collectors_cli_boot.py`. **E corrigir a frase
   *"falha na direção segura"*** em `O4-correcoes-pos-qa-builder.md`: pelo que está medido acima,
   a direção é *thread morta, `failure_event` limpo, `rc=0`*.
