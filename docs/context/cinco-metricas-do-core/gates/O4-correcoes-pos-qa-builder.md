# Builder — as 4 correções pedidas pelo QA de `O4`

- **feature** `cinco-metricas-do-core` · **componente** `sentimento` · **data** 2026-09-11
- **branch** `worktree-agent-a5e4d8ce09d8fda3d`
- **parecer de origem** [`gates/O4-alinhamento-de-grade-qa.md`](O4-alinhamento-de-grade-qa.md) (`NEEDS_FIX`)
- ⛔ **fora de escopo, e continua fora:** consertar o escalonador do `premiumIndex`. Nada em
  `frontend/`. Nenhuma escrita no Postgres. Nenhuma reescrita de história de commit.

---

## AÇÃO 1 — o fato falso, removido dos três documentos

**O que era afirmado** (`domain/publication_lag_table.py`, linhas 119-122 do commit `8d5f13c`):

> *"that collector polls **ON the grid point** instead of after a bucket closes, so `424` of
> `34.752` rows (`1,22%`) carry `available_at` a few tens of ms **BEFORE** `bucket_end`"*

**As duas metades são falsas, e a segunda é impossível:**

1. **O coletor não é alinhado — ele deriva, e a deriva sai dos números da própria tabela.**
   `build_premium_index_to_rows` emite 2 linhas por símbolo por ciclo
   (`use_cases/collector_series_mapping.py:266-283`, `_mark_price_key` e `_funding_estimado_key`)
   sobre 4 símbolos ⇒ **8 linhas/ciclo**:

   ```
   sample_n = 34.752 ;  window_end_ms - window_start_ms = 1.789.155.303.000 - 1.788.892.807.000
                                                        = 262.496.000 ms = 262.496 s
   34.752 / 8              = 4.344 ciclos
   262.496 / (4.344 - 1)   = 60,441 s por ciclo     contra 60,0 s declarados
   ```
   `[MEDIDO 2026-09-11 sobre os campos literais de `ENDPOINT_PUBLICATION_LAG`, n = 34.752 linhas]`

2. **Atraso negativo não pode vir de fase de poll.** `bucket_end` é carimbado pela Binance ao
   responder; `available_at` é carimbado por nós ao receber. Recebimento é **sempre posterior** ao
   carimbo ⇒ `min = -100 ms` só pode ser **desvio entre os dois relógios**. A frase antiga
   descrevia um evento que a ordem causal proíbe.

**O que ficou escrito no lugar — e é mais forte que a ressalva que estava lá:**
`_build_row` grava `bucket_end = instant_ms = reading.source_time`
(`use_cases/collector_series_mapping.py:232`), logo

```
available_at - bucket_end  =  received_at - source_time     (ida-e-volta de rede, e nada mais)
```

⇒ **a fase do nosso poll é algebricamente ausente da coluna.** O `p99 = 1.758 ms` seria idêntico
sob um escalonador perfeito e sob um que derivasse uma hora por dia. Não é *"ausência de
evidência"*; é **ausência de instrumento**. Em klines o `bucket_end` vem da grade do venue
(`close_time_ms`), e por isso lá a fase aparece — `96,7%` do `p99` contra `3,1%` aqui.

| arquivo | o que mudou |
|---|---|
| `backend/src/modules/sentimento/domain/publication_lag_table.py` | bloco de comentário reescrito (4 linhas → 21): deriva medida, `bucket_end = source_time` com o caminho e a linha, e o negativo reatribuído a **skew de relógio** |
| `docs/context/cinco-metricas-do-core/OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md` §`O5` | *"coletor **alinhado à grade**"* **removido da posição assertiva**; no lugar, a correção datada com o número da deriva |
| `docs/context/cinco-metricas-do-core/handoff/REMEDICAO-ATRASO-APOS-ALINHAMENTO.md` §*Bloqueio nomeado* | *"não exibe a assinatura do defeito na medição"* trocado pelo enunciado forte, em 3 itens |

**Falsificador desta ação:**

```bash
grep -rn "alinhado à grade\|ON the grid point" docs/context/cinco-metricas-do-core/ backend/src/
# hoje: só `gates/O4-alinhamento-de-grade-qa.md` (que CITA a frase como achado) e a linha da
# correção datada no OPCOES-D16, onde a frase vem seguida de "**É falso**".
```

## AÇÃO 2 — o vermelho, declarado nos dois lugares onde o leitor tropeça

`make verify` devolve **`rc=1`**, e a única falha é
`test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away`
(`assert 60936 < 60000`). Ele é o **documento executável do defeito do `D16`**, reprova
byte-idêntico no commit pai (`967368f`) e só a remedição pós-alinhamento o fecha.

Declarado em:

1. **docstring do próprio teste** (`backend/tests/sentimento/test_publication_lag_table.py`) — com
   o `rc=1` esperado, o "não afrouxe a asserção" (`NATIVE_GRID_MS[KLINES]` é grade medida:
   `44.612` passos não-nulos, `44.612` iguais a `60.000`, 1 valor distinto) e os **quatro
   critérios**;
2. **`handoff/REMEDICAO-ATRASO-APOS-ALINHAMENTO.md`**, seção nova
   *"⛔ O portão está VERMELHO, e o vermelho é ESPERADO"*, com a mesma tabela.

| critério | valor exigido |
|---|---:|
| `ge60k` | `0` |
| `p99` | `<= 5.000 ms` |
| `mn` | `>= 0` |
| `n` | `>= 4.000` |

Motivo, nomeado: **portão vermelho sem declaração é indistinguível de regressão** — o modo de
falha que `ADR-012` nomeia para o `rc=0` ambíguo, com o sinal trocado.

## AÇÃO 3 — a contagem de mutação, corrigida onde é documento

O corpo do commit `43e726b` declara *"59_361 -> 59_000 mata 3 testes; 1_758 -> 1_800 mata 2"*.
O QA remediu e achou **4** e **3** (`gates/QA-D16-atraso-de-publicacao.md` §4). História de commit
**não** foi reescrita; corrigido em
`handoff/MEDICAO-ATRASO-DE-PUBLICACAO.md` §4, que era o único documento a repetir o número errado:

| mutação | declarado em `43e726b` | medido (vale este) |
|---|---|---|
| `lag_p99_ms` klines `59_361 → 59_000` | 3 | **4** (`forged_p99`, `recomputed[klines]`, `tail_slice[klines]`, `per_symbol_range[klines]`) |
| `lag_p99_ms` `premiumIndex` `1_758 → 1_800` | 2 | **3** (`recomputed`, `tail_slice`, `per_symbol_range`) |
| constante **e** cabeça da cauda, juntas | 2 | `[NÃO REMEDIDO]` — o QA não repetiu esta; a coluna da esquerda é o único número que existe |

O erro é **para baixo**: o falsificador é mais forte que o anunciado. Ainda assim é número que não
reproduz, e isso é defeito de evidência.

## AÇÃO 4 — `PREMIUM_INDEX_CYCLE_INTERVAL_S` sem guarda, e a guarda que também estava furada

**O achado, como o QA o nomeou:** `resolve_boot_config` parseava a cadência do `premiumIndex` com
`_parse_float`, **sem nenhuma guarda de positividade** ⇒ `PREMIUM_INDEX_CYCLE_INTERVAL_S=0`
**bootava** e `_run_premium_index_collector` fechava o ciclo com `stop_event.wait(0.0)` — o laço
apertado contra `/fapi/v1/premiumIndex` que o docstring de `_positive_float` existe para proibir.

**E ao escrever o teste de `nan` que o despacho pediu, a guarda existente também caiu:**

```bash
python3 -c "import threading,time;e=threading.Event();t=time.perf_counter();print(e.wait(float('nan')), time.perf_counter()-t)"
# False 1.0175979696214199e-05     -> retorna na hora; MESMO laço apertado
python3 -c "print(float('nan') <= 0)"
# False                            -> `if value <= 0` ACEITA nan
```

⇒ duas mudanças, ambas de uma linha:

- `premium_index_cycle_interval_s=_parse_float(...)` → `_positive_float(...)`;
- em `_positive_float`, `if value <= 0:` → `if not value > 0:` (`not (nan > 0)` é `True` ⇒ recusa).
  Isto fecha o mesmo furo em `KLINES_CYCLE_INTERVAL_S`, que já usava a guarda.

⚠️ **`inf` continua aceito** (`inf > 0` é `True`) — achado pré-existente #2 do QA, **não tocado**:
é falha na direção segura (`Event().wait(inf)` levanta `OverflowError` em vez de martelar o venue).

**Testes novos** (`backend/tests/sentimento/test_collectors_cli_boot.py`, `+9`):
`test_a_non_positive_premium_index_cadence_is_refused_at_boot` (`0`, `0.0`, `-1`, `-0.5`, `nan`,
`NaN`, `-nan`), `test_a_positive_premium_index_cadence_still_boots`, e
`("KLINES_CYCLE_INTERVAL_S", "nan")` acrescentado à parametrização que já existia.

**Mutação executada — saída literal:**

```
=== MUTANT-A: premium_index_cycle_interval_s volta a _parse_float
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[nan]
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[NaN]
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[-nan]
7 failed, 1 passed, 2204 deselected in 1.33s

=== MUTANT-B: guarda volta a 'value <= 0' (aceita nan)
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[nan]
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[NaN]
FAILED ...::test_a_non_positive_premium_index_cadence_is_refused_at_boot[-nan]
4 failed, 12 passed, 2196 deselected in 1.30s

=== ORIGINAL restaurado
16 passed, 2196 deselected in 1.23s
```

`MUTANT-A` mata os 7 parâmetros da recusa nova; `MUTANT-B` mata exatamente os 4 casos de `nan`
(3 do `premiumIndex` + 1 de klines) — que é a prova de que a mudança `value <= 0 → not value > 0`
não é cosmética. Mutantes construídos e revertidos por cópia; produção nunca ficou mutada ao fim.
