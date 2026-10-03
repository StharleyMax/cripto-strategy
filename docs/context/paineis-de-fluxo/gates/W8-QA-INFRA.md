# W8 — QA de infra (`T-06.2`, verificação por escopo) + o `make verify` da wave sozinho na máquina

```
[QA GATE — Infra — wave W8 de paineis-de-fluxo]
Árvore: .claude/worktrees/wave-paineis-f06, branch wave/paineis-f06 @ 8bf17ad (árvore 7241991b)
Portas próprias: E2E_API_PORT=8861 E2E_NEXT_PORT=4361
Mutações: worktree descartável e destacada no scratchpad da sessão (commit de mutação nunca publicado),
          removida ao final; nenhum arquivo de produção alterado na worktree da wave
Escrito por este QA: backend/tests/main/test_scope_resolve.py (novo, 16 testes) + este arquivo
```

## QA Gate — Fase 06 [infra] — T-06.2 + o verify da wave

- [OK] `make verify` da wave combinada, **sozinho na máquina** — rc=0, `VERDE — 8 portões … e2e COMPLETO 42/42`, 842 s (§1)
- [OK] `e2e/20` sem carga: intervalo intragesto **máx 100 ms** contra teto 160 (p95 43,6 ms, n=318); latência de página máx 94 ms (n=15)
- [OK] 8 regras bloqueantes — portão `regras` do mesmo verify: `0 bloqueio(s), 78 aviso(s)`
- [OK] Testes passam — `make verify`: pytest 3546 passed, front 1275 pass, e2e 125 passed (14 skipped)
- [FAIL] Testes existem — **o resolvedor não tinha nenhum teste automatizado** (`grep -rlE 'scope-resolve|scope-graph' backend/tests frontend/src` → 0). Este QA escreveu 16: **15 passam, 1 reprova (F-1)**
- [OK] Cobertura 96,92% (`make verify`) contra o piso por camada. Os scripts de shell e o `.mjs` estão fora do instrumento `[NÃO MEDIDO]`: o universo deles é a suíte nova mais as 6 mutações
- [FAIL] DoD 2, item a item (§3): reprova quando a task quebra um spec que ela toca — **furado por F-1**; ≤ 1/3 só no backend (0,25); front de liquidação 0,55, declarado
- [OK] DoD 5 — `make verify` verde no gate da wave (§1)
Regras bloqueantes avaliadas: 8 de 8 listadas por `harness rules list --severity block`
**Veredito: NEEDS_FIX**

Ações:
1. **F-1 (bloqueia):** um diff que edita `frontend/e2e/scope-map.tsv` resolve as linhas pelo mapa **já editado** e
   pode tirar da própria seleção o spec que ele quebra. Conserto: ou o mapa no diff vira `e2e=COMPLETO` (como
   `scope-resolve.sh`/`scope-graph.mjs` já viram), ou as linhas são a **união** das do mapa da base
   (`git show $MB:frontend/e2e/scope-map.tsv`) com as do mapa atual. O teste aceita qualquer um dos dois:
   `cd backend && PYTHONPATH=scripts/nonet .venv/bin/python -m pytest --no-cov tests/main/test_scope_resolve.py`
   precisa passar 16/16.
2. DoD 2 / tempo do front: é decisão do orquestrador (§3), e não bloqueia por si só. O dado novo que entra na
   decisão: uma linha de liquidação mais estreita **caberia** no 1/3.

## 1. O `make verify` da wave, sozinho

`pgrep -af "playwright|verify.sh"` **antes**: só o próprio `pgrep`. **Durante** (duas vezes, no estágio de e2e):
só o `verify.sh` desta rodada e o `playwright test` dele; load average 1,44. ⚠️ Uma ressalva honesta: um
`pytest` de 2 s deste QA (a suíte nova, `tests/main/test_scope_resolve.py`) rodou durante o `next build` do e2e,
**antes** de o `e2e/20` começar. Fora isso, nada.

```
VERIFY_FORCE=1 E2E_API_PORT=8861 E2E_NEXT_PORT=4361 make verify      [MEDIDO 2026-10-03, n=1]
[OK] lint-backend 503 source files · lint-frontend · test-frontend 1275 pass, 0 fail · 58s
[OK] test 3546 passed · Total coverage: 96.92% · 206s · boundaries 7 kept, 0 broken
[OK] regras 0 bloqueio(s), 78 aviso(s) · política rc=0
[OK] e2e rc=0 125 passed · COMPLETO 42/42 specs · 572s
veredito: VERDE — 8 portões mediram e passaram · e2e COMPLETO 42/42 specs
duração: 842s · saída completa: /tmp/verify-wave-paineis-f06-20261003T033510Z.log
rc=0
```

`e2e/20`, linhas `E2E-FACT 20-…` do mesmo log: `axis_intra_gesture_interval_max_ms=100` (o vermelho de
`W8-QA-FRONT.md` era 177 sob carga), `axis_intra_gesture_interval_p95_ms=43.6`, `_over_ceiling_n=0`,
`history_page_latency_max_ms=94`, `history_page_apply_p50_ms=29.6`. **Não é regressão:** o vermelho de antes
era carga, como `W8-QA-FRONT.md` §verify supôs. A condição que aquele gate deixou ("verde ⇒ APPROVED sem
mais mudança") **está cumprida**; o gate do front é dele, não deste arquivo.

O cache da árvore `7241991b…` foi gravado por esta rodada **completa**. ⚠️ Commitar este arquivo e o teste
muda a árvore, e o próximo `make verify` mede de novo; com o teste de F-1 vermelho, ele **vai reprovar** até o
conserto. É de propósito: o defeito tem que ficar provado.

## 2. T-06.2 — mentalidade destrutiva

### 2.1 Sondas no resolvedor (`VERIFY_BASE=HEAD bash scripts/scope-resolve.sh` numa worktree descartável)

| # | diff | esperado pela norma | obtido |
|---|---|---|---|
| A1 | arquivo novo em `src/app/symbol/` que ninguém importa | só `11` (não pinta nada) | só `11` ✓ |
| A2 | `src/app/qa/page.tsx` nova | COMPLETO (raiz nova do Next) | `e2e=COMPLETO — alcançado por …/page.tsx` ✓ |
| A3 | **rename** `liquidation-legend-swatch.ts` → `liq-swatch.ts`, importadores atualizados | os dois lados vistos | antigo → linha do mapa; novo + importadores → rota `/symbol` (08+) ✓ |
| A4 | **deleção** de `liquidation-legend-swatch.ts` sem tocar nos importadores | não encolher em silêncio | linha do mapa (13 specs); o `tsc` do `lint-frontend` reprova o import quebrado ✓ |
| A5 | `tools/x.sh` + `.github/w.yml` (fora de qualquer prefixo) | COMPLETO nos dois lados | `e2e=COMPLETO`, `pytest=COMPLETO` ✓ |
| A6 | `deploy/compose.yml` | só `11` + testes que o nomeiam | `pytest=ALVO` (`tests/api/test_api_prefix…`, `tests/main/test_compose_*` …) ✓ |
| A7 | `E2E_EXTRA=99` | RECUSA | rc=3 ✓ |
| A8 | spec `35` deletado (o mapa o cita) | RECUSA | rc=3 ✓ |
| **A11** | **mapa estreitado (tira `33` da linha de liquidação) + swatch alterado no MESMO diff** | o `33` continua (a base o seleciona) | **o `33` sai: `11 13 14 23 24 31 32 34 35 36 37 38 40`** ✗ — controle (só o swatch): com `33` |
| A12 | evidência das linhas do mapa rodada de novo (`grep -ail liquidat`, a de OI, a do eixo) | linhas ⊇ evidência | iguais/contidas hoje ✓ |

**F-1, por que bloqueia.** A `T-06.2-build.md` §1 provou que `LIQUIDATION_SWATCH_FILLED_BORDER_PX = 1` deixa o
`e2e/33` vermelho. A11 é a mesma task **com uma linha a mais no diff**, a que tira `33` do mapa, e aí o
`make verify-scope` não roda o `33` e responde `VERDE-ESCOPO`. É exatamente o "mapa podre não pode
encolher o conjunto em silêncio" do desenho §2.2, e o "reprova quando a task quebra um spec que ela toca"
do DoD 2. A incoerência está escrita no próprio script: `scope-resolve.sh:223` manda `scope-resolve.sh` e
`scope-graph.mjs` para COMPLETO ("decide como o e2e roda"), e `scope-resolve.sh:174-175` responde "só 11"
para o mapa, que decide tanto quanto eles. O anteparo existe (o completo da wave pega), mas aí a palavra
`VERDE-ESCOPO` do builder **mentiu**, e o que este modo vende é não mentir.

Prova automatizada: `test_editing_the_map_cannot_drop_a_spec_from_its_own_diff` (mapa-miniatura, linha
`12 13` → `13`) — `AssertionError: the map edit dropped e2e/12 from its own diff's selection: ['11', '13']`.

### 2.2 `verify.sh --scope`: cache e ambiente

- **VERDE-ESCOPO não grava o cache.** `scripts/verify.sh:503` exige `COMPLETO_DE_FATO -eq 1`; ele só vale 1 com
  `e2e=COMPLETO` **e** `pytest=COMPLETO` (`:195-196`), e aí o e2e roda com `E2E_SPECS=` e o pytest com
  cobertura e piso, ou seja, é o completo. Mutação M6 (§2.3) remove a guarda.
- **`E2E_SPECS` no ambiente não encolhe o completo** (Makefile, linha de comando vence):
  `E2E_SPECS=e2e/11-… make -n e2e E2E_SPECS=` → `playwright test --config=… ;` (sem filtro);
  `MAKEFLAGS='E2E_SPECS=e2e/11-…' make -n e2e E2E_SPECS=` → idem; **controle** sem o override →
  `… e2e/11-canvas-fundo.spec.ts` (o override segura o portão). Segunda camada: `N < M` no completo é rc=1.
- **`E2E_EXTRA` no completo:** `grep -n E2E_EXTRA scripts/verify.sh` → só o comentário `:65`; o completo não
  chama o resolvedor.

### 2.3 Mutações (worktree descartável; teste = `tests/main/test_scope_resolve.py`)

| # | mutação | reprova? |
|---|---|---|
| M1 | ramo `*)` do resolvedor vira `echo "só 11"` (fail-open) | **sim** — `test_unknown_path_widens_e2e_and_pytest` |
| M2 | `spec_of` deixa de exigir exatamente 1 arquivo (`-ge 0`) | **sim** — `test_map_citing_a_deleted_spec_refuses` |
| M3 | `scope-graph.mjs` sem a forma `import(…)` dinâmica | **sim** — `test_lazy_import_is_an_edge` |
| M4 | validação de prefixo podre desligada | **sim** — `test_map_prefix_matching_no_file_refuses` |
| M5 | entrada fora de console/symbol (layout, página nova) tratada como `/symbol` | **sim** — `test_new_next_entry_widens_e2e`, `test_root_layout_dependency_widens_e2e` |
| M6 | `verify.sh:503` sem `[ "$COMPLETO_DE_FATO" -eq 1 ]`, rodada real `verify.sh --scope` em árvore limpa | ver abaixo |

M6: árvore limpa `f6f21d43…` (só a mutação commitada), `VERIFY_BASE=HEAD … bash scripts/verify.sh --scope` →
`veredito: VERDE-ESCOPO … e2e em 1/42 specs (11 pixel)`, 86 s, rc=0 — **e o mutante gravou
`.git/verify-cache/f6f21d43…`** (o `make verify` seguinte sobre a mesma árvore responderia `VERDE (cache da
árvore)` sem e2e completo nem piso). **Reprova.** Controle sem mutação: `T-06.2-build.md` §1 "MORDE cache"
(entrada ausente depois do escopo). A entrada envenenada foi apagada logo depois da medição.

**6 de 6** mutações reprovam. M0 (sem mutação): 15 passam, 1 reprova (F-1, o defeito real).

## 3. DoD 2 — o 0,55 do front de liquidação

**O relatório o declara com honestidade?** Sim. `T-06.2-build.md` deixa o item **desmarcado** (`- [ ]`,
"BLOQUEADO"), dá o número (464 s / 848 s = 0,55, limite 282,7 s), nomeia a causa e abre a bifurcação para o
orquestrador em vez de decidir sozinho. Isso é o que a casa pede.

**Uma frase dele não se sustenta:** *"Mapa mais fino não resolve"*. Ela não foi medida, e medi agora
`[MEDIDO 2026-10-03, máquina sozinha, n=1]`:

- Por spec, no log do completo acima (soma das durações por teste do reporter `list`): a linha de liquidação
  (13 specs + `11`) soma **227 s** de 394 s; `35` sozinho dá 60,8 s, `38` 37,6 s, `33` 22,5 s, `37` 21,2 s. O
  "69% do tempo do e2e em 42% dos testes", que lá era `[INFERRED]`, bate com o Playwright: 390 s do escopo de
  14 specs contra 564 s (9,4 min) do completo = **69%**.
- Uma linha estreita `{13, 31–35}` (os specs que desenham a **legenda/o painel** de liquidação, sem os de
  OI/cobertura que só o mencionam): `make e2e E2E_SPECS="e2e/11… e2e/13… e2e/31…e2e/35…"` → **19 passed,
  2 skipped, Playwright 1,8 min, wall 115 s**, rc=0 (log `/tmp/claude-1002/w8qa-narrow.log`).
- Somando os portões não-e2e do escopo de front do builder (464 − 396 = **68 s**): ≈ **183 s ≈ 0,22** do
  completo `[INFERRED: soma de duas medições separadas; e esta rodada não recompilou o front]`.

Então o mapa **poderia** afinar e caber no 1/3. O que falta não é tempo, é **evidência de que é seguro**:
`14`, `23`, `24`, `36–38`, `40` desenham a mesma tela e podem ver o efeito do swatch. Estreitar a linha é
apostar nisso, e o anteparo é o completo da wave. É a opção (c) a pôr ao lado das (a)/(b) do relatório;
quem escolhe é o orquestrador/owner, não este QA.

## 4. Avisos (não bloqueiam)

- **W-1 — spec novo fica fora das linhas finas do mapa.** Um `e2e/43` de liquidação, depois de mergeado, não
  roda quando outra task mexe em `liquidation-*.ts` (a linha lista números explícitos; só `@rota:symbol` usa
  `08+`). Está declarado no cabeçalho do mapa ("hipótese; o completo é o anteparo"), e A12 mostra as linhas
  em dia hoje. Alavanca barata: a coluna de evidência **é** um comando, e o resolvedor poderia rodá-lo e
  recusar a linha que perdeu a evidência.
- **W-2 — `*.md` é o primeiro ramo do `case`.** `frontend/public/*.md` (servido pelo Next) cai em "só 11"
  antes de `frontend/*` → COMPLETO. Hoje não existe nenhum; fica registrado.

## 5. Arquivos

- `backend/tests/main/test_scope_resolve.py` — 16 testes, `ruff check`/`ruff format --check`/`mypy` limpos;
  `cd backend && PYTHONPATH=scripts/nonet .venv/bin/python -m pytest --no-cov tests/main/test_scope_resolve.py`
  → `1 failed, 15 passed`.
- Logs: `/tmp/verify-wave-paineis-f06-20261003T033510Z.log` (completo), `/tmp/claude-1002/w8qa-narrow.log`
  (linha estreita), `/tmp/verify-w8qa-scope-20261003T035446Z.log` (M6).
