# QA — `43e726b` · atraso de publicação medido por endpoint (pré-condição de `D16`/`E1`)

- **Feature** `cinco-metricas-do-core` · **componente** `sentimento`
- **Worktree** `.claude/worktrees/agent-a5e4d8ce09d8fda3d`, branch `worktree-agent-a5e4d8ce09d8fda3d`
- **Veredito: `NEEDS_FIX`** — 1 defeito bloqueante (item 1), provado por teste que falha.

---

## 0 · O que foi medido, e com qual comando

Tudo abaixo é `[MEDIDO 2026-09-11]` no worktree, Postgres de produção em **somente leitura**
(nenhum `insert`/`update`/`delete`; nenhuma seed).

| portão | comando | resultado |
|---|---|---|
| laço | `make test-fast K=publication_lag` | **41 passed**, 2131 deselected, 1,23 s (árvore como entregue) |
| regras | `harness rules --mode file --path <cada um dos 2 arquivos>` | `rc=0`, saída vazia — **e o instrumento discrimina**: arquivo-controle com `from .x import y` + `print(...)` devolveu `rc=2` com `[core.relative-import]` e `[core.print-statement]` |
| lint | `bash backend/scripts/lint.sh` | `All checks passed!`, 417 arquivos formatados (já com os testes deste gate) |
| **portão** | `make verify` **sobre o commit como entregue** | **VERDE — 6 portões**: lint-backend `rc=0` · lint-frontend `rc=0` · test `rc=0` **2169 passed, cobertura total 96,98%** · boundaries `7 kept, 0 broken` · regras `0 bloqueio(s), 67 aviso(s)` · política `rc=0`. Log: `/tmp/verify-agent-a5e4d8ce09d8fda3d-20260911T203120Z.log` |
| cobertura | `coverage.xml` do run acima | `domain/publication_lag_table.py` **100%** (46 stmts, 12 branches, 0 miss) contra alvo declarado **domain ≥ 90** (`backend/scripts/check-coverage-layers.sh:51`); global 96,98% contra `fail_under = 70` (`backend/pyproject.toml:123`) |
| portão **com o teste deste gate** | `make test-fast K=publication_lag` | **1 failed, 46 passed** — a falha é a prova do defeito do item 1, §1.c |

---

## 1 · ⛔ DEFEITO BLOQUEANTE — a margem de 638 ms é artefato do filtro, e o invariante já é falso

**O item 1 do despacho estava certo em desconfiar, e a resposta é pior que "falta um teste".**

### 1.a O invariante não estava declarado

`SPEC-001` §5.2 escreve o carimbo MODELED como
`available_at_MODELED = próximo ponto da grade nativa >= (bucket_end + p99_lag + margem)`.
Logo `lag_p99_ms + margem` **tem de caber em um passo da grade nativa**: no instante em que
alcança `60.000` ms, o carimbo arredonda para o **segundo** ponto da grade e toda linha MODELED
nasce um bucket inteira atrasada — ilegível no instante de decisão da própria fatia sob
`final_only` (`as_of_accessor` R-1 + R-2). Nada no módulo nomeava isso.

O que existia era `test_a_live_lag_never_reaches_a_whole_poll_period`
(`test_publication_lag_table.py:344`), que afirma `lag_max_ms < poll_resolution_ms`. Ele **não é**
esse invariante por dois motivos:

1. amarra o limite a `poll_resolution_ms`, **campo mutável do próprio registro** que o editor
   está editando — uma edição coerente (`poll_resolution_ms = 120_000` junto de um lag maior)
   passa no teste e quebra o carimbo;
2. pela própria docstring dele, o limite é **consequência do filtro de população** (`nb = 1`
   exclui a poll que revelou 2 buckets). Ele afirma o artefato do próprio filtro: **não pode
   falhar enquanto `nb = 1` for o filtro**, logo não mede nada sobre o mundo.

### 1.b E o invariante **já é falso** quando a censura sai

O separador de fan-out não é circular na **forma** (nunca lê o atraso), mas é **censurante no
efeito**, e a censura cai exatamente em cima da grade: uma poll atrasada o bastante revela
**dois** buckets, vira `nb = 2` e sai da população. Por construção **nenhuma leitura ≥ 1 período
de poll sobrevive** — é por isso que `lag_max = 59.999 < 60.000`.

As 210 linhas de `nb = 2` **não são o "meio ambíguo"** que o módulo diz: são **polls ao vivo
atrasadas**, e isso é mensurável, não palpite:

```sql
-- todos os 105 grupos nb=2, janela congelada bucket_end < 1789155360000, klines
-- span = max(bucket_end)-min(bucket_end) dentro do grupo
select span, count(*), min(lag_old), max(lag_old), min(lag_new), max(lag_new) from grp ...
-- 60000 | 105 | 60012 | 87855 | 12 | 27855
```

**Um único `span`: `60.000` ms** — dois buckets consecutivos, e o mais velho é o mais novo
**mais exatamente um passo da grade**. Backfill, medido, tem grupos de `1.079`–`1.500` buckets
(spans de até `604.746.695` ms); **nenhum caminho produz requisição de 2 buckets**.

Com a população ao vivo inteira (`nb <= 2`), mesma janela congelada, mesmo `percentile_disc`:

```
n = 4.289   p99 = 60.936 ms   max = 87.855 ms   105 leituras >= 60.000 ms
```

⇒ **`60.936 > 60.000`.** A folga de `638` ms não existe: ela é o teto do filtro. E o `max` de
`279 s` do enunciado de `E1` (`OPCOES-E1-E5.md:90`), que o handoff declarou não reproduzível
(`MEDICAO-ATRASO-DE-PUBLICACAO.md:71-73`), volta a ser corroborado — a cauda existe, ela só
tinha sido removida junto com o backfill.

### 1.c O teste que prova (escrito neste gate)

`backend/tests/sentimento/test_publication_lag_table.py`, seção nova ao final:

| teste | hoje |
|---|---|
| `test_the_modeled_stamp_lands_on_the_first_grid_point_after_its_own_bucket` | passa |
| `test_the_lag_keeps_declared_headroom_against_the_native_grid` | passa (amarrado a `NATIVE_GRID_MS`, não a `poll_resolution_ms`) |
| `test_a_lag_that_crosses_the_grid_is_caught_by_this_guard` | passa (falsificador do guarda, executado) |
| `test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away` | ⛔ **FALHA** — `p99 = 60.936` sobre a cauda não censurada (`k = 43`, todas as 43 leituras ≥ `60.936`) |

`make test-fast K=publication_lag` → **1 failed, 46 passed**.

A grade nativa de klines é `60.000` ms **exatos**, medida e não suposta:
`44.612` passos não-nulos, `44.612` iguais a `60.000`, `1` valor distinto.

---

## 2 · População — não circular na forma, **censurante no efeito**; os 120.951 são mesmo backfill

- **Reprodução exata** da medição do commit, hoje, somente leitura:
  `klines n=4079 min=1353 p99=59361 max=59999` · `premiumIndex n=34752 min=-100 p99=1758 max=1895`,
  e `min/max(bucket_end)` batem campo a campo com `window_start_ms`/`window_end_ms` do registro.
- **Backfill confirmado:** `nb = 1079/1080/1500` → `9.711 + 3.240 + 108.000 = 120.951` linhas em
  **84 instantes** de busca, atrasos de até `604.746.695` ms (7 dias). Nenhuma dúvida de rótulo.
- **Circularidade:** o critério novo lê só `(series_key_id, available_at, count)` — **nunca o
  atraso**. Formalmente não circular. **Mas** ver §1.b: a seleção trunca a distribuição em
  1 período de poll, então `max`/`p99` medidos **não são propriedades do endpoint**. A afirmação
  do handoff *"o máximo ao vivo de klines é 59.999 ms"* é **falsa sobre a população ao vivo**;
  vale só sobre o subconjunto `nb = 1`, e o teto é do filtro.

---

## 3 · `p99` recomputado, não literal — **confirmado**

`test_lag_p99_is_recomputed_from_the_measured_tail` roda
`availability_lag_stats.p99` (o do próprio repo, nearest-rank, `domain/availability_lag_stats.py:35`)
sobre a cauda `k = n − ceil(0,99n) + 1` medida. `PUBLICATION_LAG_STAT_NAME` reusa
`LAG_STAT_NAME`, não redigita `"p99"`. Nada aqui é literal envelhecendo em silêncio. ✅

---

## 4 · Mutação — a contagem do commit está **errada por baixo**, e o buraco admitido é real

| mutação | commit diz | **medido** (`make test-fast K=publication_lag`) |
|---|---|---|
| `lag_p99_ms=59_361 -> 59_000` | mata 3 | **mata 4** (`forged_p99`, `recomputed[klines]`, `tail_slice[klines]`, `per_symbol_range[klines]`) |
| `lag_p99_ms=1_758 -> 1_800` | mata 2 | **mata 3** (`recomputed`, `tail_slice`, `per_symbol_range` — premiumIndex) |
| `p99 -> 60_361` + `max -> 60_999` (cruza a grade) | — | mata 6 |

Direção do erro: **subdeclarado**, o falsificador é mais forte que o anunciado. Ainda assim é
número que não reproduz, e número que não reproduz é defeito de evidência.

**Forja dentro do envelope por símbolo: CONFIRMADA como indetectável.** Elevando
`lag_p99_ms` de `1_758` para `1_774` (topo do envelope) e subindo os valores da cauda abaixo de
`1_774` para `1_774` (mantém ordenada, mantém `k = 348`, mantém `tail[-1] = lag_max`):
**41 passed** — nenhum teste reprova. Teto da forja: `+16` ms (premiumIndex) e `+170` ms (klines,
envelope `59.248`–`59.531`).

**É aceitável?** Só **condicionalmente**, e a condição é justamente o item 1: uma forja de
`+170` ms é inofensiva **se** houver folga real contra a grade. Como §1.b mostra que a folga é
negativa, o envelope por símbolo hoje **não** é a última linha de defesa que o argumento supõe.
Depois que o item 1 for consertado (grade como invariante testado, com a folga medida sobre a
população não censurada), o buraco vira dívida aceitável e declarada — não antes.

---

## 5 · `lag_min_ms = -100` registrado e não clampado — **escolha certa**

Registrar está certo, e o precedente é do próprio repositório:

- `SPEC-001:478` diz que a invariante `available_at >= event_time` a 100% *"derruba ingestão ao
  vivo por skew de NTP se aplicada sem tolerância"*, e manda **F3 CALIBRAR** a tolerância
  **sobre a distribuição acumulada**;
- `domain/clock_skew_tolerance.py:1` implementa exatamente isso — `p99` de `|clock_skew_ms|`
  calibrado da distribuição, *"never a hardcoded number"*.

Clampar destrói o insumo da calibração e apaga um fato de agendamento real (`424/34.752`,
`1,22%`, a poll dispara **no** ponto da grade). **Não** é normalizar dado inválido: `-100` não é
gravado em `md.series` por este módulo — o módulo **não escreve nada** —, é reportado como
estatística da amostra. ✅

**Achado menor (não bloqueia):** nada limita `poll_phase_share` a `<= 1`. Com um `lag_min_ms`
bem negativo (p.ex. `-30.000`), a propriedade devolveria `1,49` — "fração da fase" acima de 1 —
sem que nenhum invariante reclame. Um `__post_init__` com teto, ou um teste, fecha.

---

## 6 · Regras bloqueantes (8 de 8, por `harness rules list --severity block`)

`core.relative-import` · `core.silent-except` · `core.print-statement` · `core.hardcoded-secret` ·
`web-fullstack.browser-imports-server` · `web-fullstack.tenant-from-request` ·
`web-fullstack.server-test-directory-present` · `own.compose-hardcoded-secret`

`harness rules --mode file` sobre os **dois** arquivos do diff: `rc=0`, nenhuma ocorrência.
Controle positivo rodado (ver §0) — o `rc=0` aqui é "nada encontrado", não "não mediu".

---

## 7 · Ações para fechar

1. **Item 1 — decidir e medir de novo a população ao vivo.** `nb <= 2` com `span = 1` passo da
   grade é ao vivo **provado** (§1.b); ou o `p99` passa a `60.936` — e aí `D16` **não pode**
   carimbar no primeiro ponto da grade e a decisão volta ao owner —, ou se declara por que a
   poll atrasada não conta, **com o número da massa excluída** (`210` linhas, `4,9%` de `4.289`).
2. **Item 1 — manter o invariante da grade como teste**, amarrado à grade nativa e nunca a
   `poll_resolution_ms`; os 4 testes já estão escritos.
3. Corrigir a contagem de mutação da mensagem do commit (`4` e `3`, não `3` e `2`), ou removê-la.
4. Opcional (§5): teto em `poll_phase_share`.

## 8 · Ambiente

Symlinks `backend/.venv` e `frontend/node_modules` → checkout principal, ambos em
`.git/info/exclude` (`git check-ignore -v` confirma), **fora do índice**: `git status --porcelain`
devolve só o arquivo de teste deste gate. `frontend/` não foi tocado.
