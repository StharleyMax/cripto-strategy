# W-P1-QA — QA da wave 1 da fase 10 (pirâmide de testes): T-10.5, T-10.6, T-10.7

| | |
|---|---|
| **feature / fase** | `estrutura-do-front` · fase `10` · wave `piramide-w1` |
| **worktree / branch** | `.claude/worktrees/wave-piramide-w1` · `wave/piramide-w1` · HEAD `f730b8b0` (commit 19:20Z, árvore limpa) |
| **base** | `f6d21ec6` (`origin/master` das três tasks) |
| **agente** | `qa` (modo gate) · 2026-10-03 |
| **verify da wave** | `/tmp/verify-wave-piramide-w1-20261003T193004Z.log` (início 19:30Z, depois do HEAD) |

Evidência bruta das mutações: `scratchpad/qa-wp1/` da sessão
`a6300abb-…` (`mut5.py`, `mut6.py`, `run7.sh`, `*.tap`, `*.ids`). Nenhum arquivo de produção ficou
alterado: cada mutação foi revertida e conferida com `cmp`/`git diff --quiet`, e
`git status --short --untracked-files=all` termina só com `?? gates/W-P1-REVIEW.md` (de outro agente).

## Veredito

```
## QA Gate — Fase 10 [charts, web, sentimento] — wave piramide-w1 (T-10.5, T-10.6, T-10.7)
- [OK] core.relative-import / core.silent-except / core.print-statement / core.hardcoded-secret /
       web-fullstack.browser-imports-server / web-fullstack.tenant-from-request /
       web-fullstack.server-test-directory-present / own.compose-hardcoded-secret
       — portão `regras` do verify: 0 `[BLOQUEIO]`, 77 `[AVISO]` (todos pré-existentes, fora do diff);
         `harness rules --mode file --path <f>` nos 4 arquivos do diff → 0 linhas cada; e o
         instrumento morde: sonda `print("x")` em backend/tests → 1 achado `core.print-statement`.
- [OK] Testes existem e passam — verify: test:charts 354 pass / 1 skip / 0 fail; test:s1 105/0;
         test:app 722/0; test:s3 111/0; pytest 3601 passed; e2e 127 passed / 15 skipped.
         Rerodado por mim: eslint-boundary 6/6, fingerprint-sync 1/1, s2-cvd 8 pass + 1 skip,
         test_oi_candles_route_invariants 99/99 (×4, __pycache__ purgado).
- [OK] Cobertura 96,92% contra alvo 70% (fail-under do projeto) — verify linha 2012.
         Front: sem alvo declarado [NÃO MEDIDO]; o diff é só teste.
- [OK] DoD da fase, item a item — tabela abaixo.
- [anomalia] nenhuma.
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
Veredito: APPROVED
```

## T-10.5 — eslint-boundary e fingerprint-sync-boundary

| DoD | evidência | |
|---|---|---|
| (1) planta tudo e roda eslint 1×, só sobre os plantados | `eslint-boundary.test.ts:191` (`finally`), teste "the single eslint run covered exactly the planted probes" | OK |
| (2) CALA da árvore sai do teste; relatório cita a linha do verify | `scripts/verify.sh:225` = `portao "lint-frontend" npm --prefix frontend run lint`; `Makefile:195` | OK |
| (3) nome único + `finally` | `RUN_ID = pid-uuid8` (`eslint-boundary.test.ts:43,51`); 0 sondas órfãs após cada rodada | OK |
| REGRA-M | builder: 2 violadores reais → `make lint-frontend` rc=2 | OK (do builder) |
| ablação (a) | **refeita por mim, 5 mutações** (abaixo) | OK |
| ablação (b) F06 | builder | OK (do builder) |
| ablação (c) | **rodada por mim** (abaixo) | OK |

**Mutações em `frontend/eslint.config.mjs` (minhas, distintas das 13 do builder onde possível):**

| id | mutação | eslint-boundary | fingerprint-sync |
|---|---|---|---|
| Q1 | linha `"local/use-client-fingerprint-boundary": "error"` apagada | rc=0 (fora do escopo dele) | **rc=1** (D5.17(b)) |
| Q2 | `ignores` do bloco local ganha `src/**/_ephemeral-*` (as sondas viram "ignoradas", ataque à vacuidade) | **rc=1, 6/6 vermelhos** | **rc=1** |
| Q3 | negações do barrel removidas do bloco `src/app/symbol/**` (regra ampliada demais) | **rc=1** (ADR-034/D8, o CALA de regra) | rc=0 |
| Q4 | chave `no-restricted-imports` do bloco `web` apagada inteira | **rc=1** (static + D8) | rc=0 |
| Q5 | seletor `require` do bloco `charts` apagado | **rc=1** (só o teste `require`) | rc=0 |

Q2 é a que mais importa: prova que a guarda nova de vacuidade (`ruleIdsFor` exige a entrada da
sonda) pega o modo de falha que o desenho "lint só os plantados" cria.

**Ablação (c)** — `npm run test:charts` e `npm run test:s1` em paralelo, 3×: charts 354 pass/0 fail e
s1 105/0 nas três, 0 sondas órfãs `[MEDIDO 2026-10-03, n=3]`. Como 3 verdes de uma corrida não provam
que a corrida existiria, ela foi **tornada determinística**: com um violador alheio vivo
(`src/charts/_ephemeral-qa-collision.ts`, charts→app), o `fingerprint-sync-boundary.test.ts` **novo**
dá rc=0, e o da **base** (`git show f6d21ec6:…`) dá **rc=1**, citando `_ephemeral-qa-collision` e
`ADR-003 FR-1`. A colisão de `cf8fb5db` fechou por construção, e agora há medida disso.

**Perda declarada, aceita:** o teste novo não pega mais regra ampliada demais que só a árvore real
revelaria; isso passa para o `make lint-frontend`, que roda o mesmo `eslint src` que o CALA antigo
rodava (`verify.sh:225`). Q3 mostra que o CALA **de regra** continuou no teste.

## T-10.6 — s2-cvd teste 7 com fixture sintética

| DoD | evidência | |
|---|---|---|
| fixture sintética, sem ler 08-20/08-21 | teste 7 (`s2-cvd.test.ts:109-156`) só usa `syntheticDayCsv`; `duration_ms` 5,17 | OK |
| ablação (a) zero-fill off ⇒ teste 7 reprova | R1 abaixo | OK |
| ablação (b) dia faltante off ⇒ teste 7 reprova | R4, R5 abaixo | OK |

**Mutações em `frontend/src/charts/s2-cvd.ts`, rodadas contra o teste novo E o da base
(`f6d21ec6`):**

| id | mutação | novo | base |
|---|---|---|---|
| R1 | `fillCoveredDayZeros(totals, day)` removido (zero-fill desligado) | **not ok 7** | ok (cego) |
| R2 | zero-fill para um slot antes (`slotsPerDay - 1`) | **not ok 7** | ok (cego) |
| R3 | zero-fill sobrescreve soma existente (`if (!totals.has)` removido) | **not ok 7** | ok (cego) |
| R4 | zero-fill no dia seguinte (`dayOfMonth + 1`: o 08-21 preenche o 08-22 faltante) | **not ok 7** | not ok 7 |
| R5 | `missingDays.push(day)` removido | **not ok 7** | not ok 7 |

O teste novo mata 5/5; o antigo, 2/5. Confirma o achado do builder: o teste antigo era cego ao
zero-fill porque os 3 dias reais têm trade em todos os 1.440 minutos. O teste novo morde **mais**.

## T-10.7 — oráculo cacheado por seed

| DoD | evidência | |
|---|---|---|
| (1) `first_anchor` fora do gerador | `test_oi_candles_route_invariants.py:275,283` | OK |
| (2) `functools.cache` por seed, nunca `id()` | cache em `_hist_entry:90`, `_poll_entry:98`, `_data(seed):202`, `_seeded_observations(seed):213`; a única ocorrência de `id(` é o comentário `:83` | OK |
| (3) 99 coletados | `pytest --collect-only` → `99 tests collected` | OK |
| (4) 3 execuções verdes | `99 passed` ×3 (2,05 s · 2,07 s · 2,05 s), `__pycache__` purgado antes de cada | OK |
| ablação D-1, mesmo conjunto vermelho | K1 abaixo | OK |

**Mutações em `backend/src`, cada uma rodada contra o arquivo novo e contra o da base
(`f6d21ec6`, sem cache), `__pycache__` purgado antes de cada rodada, conjunto de ids vermelhos
comparado por `cmp`:**

| id | mutação | novo | base | conjunto |
|---|---|---|---|---|
| K1 | **o conserto de `20e01b4a` desfeito inteiro** (`git show 20e01b4a -- backend/src \| git apply -R`, domínio e use case) | 34 failed | 34 failed | **idêntico** |
| K2 | domínio ignora as âncoras (`\| poll.anchor_only_instants_ms` removido) | 4 | 4 | **idêntico** |
| K3 | trecho da borda começa um passo nativo depois (`hist_instants[0] + native_grid_ms`) | 2 | 2 | **idêntico** |
| K4 | instantes de fato deslocados conforme `window_start_ms` (defeito que depende de onde a janela começa) | 18 | 18 | **idêntico**, com **3 do invariante 3** (`[0-1m]`, `[4-1m]`, `[5-1m]`) |

Baseline sem mutação: 0 / 0. Tempo do arquivo sozinho, sem cov: 2,3–3,8 s novo contra 27,5–36,1 s
base, na mesma rodada `[MEDIDO 2026-10-03, n=5 pares, máquina com e2e de outra worktree rodando]`.

## Julgamentos pedidos

**1. A lacuna do invariante 3 (T-10.7): NÃO bloqueia.** Vira follow-up, e menor do que o relatório do
builder sugeria. K4 mostra que o invariante 3 **morde** (3 vermelhos), e com o **mesmo** conjunto antes e
depois do cache, então o cache não o cegou. A lacuna estava no conjunto de mutações M1–M5 do builder,
não no teste. O que sobra como follow-up é uma fraqueza **pré-existente** da asserção, que a task não
podia mexer: ela exclui o primeiro bucket da janela estreita (`end >= narrow[0] + interval_ms`), que é
onde mora o efeito de borda, e por isso só o TF `1m` reprovou em K4. Dono: quem abrir a próxima task
sobre o oráculo.

**2. Os comentários desatualizados em `frontend/eslint.config.mjs:87-90,102` (T-10.5): NÃO bloqueia.**
Vira follow-up, com a correção pronta. O `:87-90` ainda diz que o teste *"removes them and asserts the
real modules of both sides stay clean (CALA), in the SAME test run"*, e o `:102` cita *"`eslint-boundary.test.ts`'s
own inventory check"*, que saiu. É prosa errada num arquivo que não muda comportamento, já que as
regras e os seletores estão intactos (Q1–Q5). O `ESCOPO` da task proíbe tocar na config, e o builder
declarou isso em vez de esconder. Correção: em `:87-90`, *"…asserts `eslint` refuses it (MORDE); the
CALA of the real tree is `make lint-frontend` (`scripts/verify.sh:225`)"*. Em `:102`, trocar o *inventory
check* por *"verified by `make lint-frontend` over `src/`"*. Vai numa task que tenha
`frontend/eslint.config.mjs` no escopo. ⚠️ Se a fase fechar sem essa task registrada, o comentário
vira mentira permanente, e por isso ela precisa entrar no `tasks.toml`/handoff do orquestrador.

## Pendências não bloqueantes

- `make verify-scope` de cada task não foi rodado pelos builders (o despacho proibia). Ele foi suprido
  pelo `make verify` completo da wave, que é mais forte (8 portões, e2e 127 passed).
- O tempo do `test:charts` do T-10.5 (18,9 s) ficou acima dos 15,7 s da análise, por ruído de carga
  `[NÃO MEDIDO em separado]`. Isso não afeta o veredito, porque a REGRA-T pede antes e depois, e o depois
  é menor.
