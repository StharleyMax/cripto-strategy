# QA Gate — Fase `01` (volume ponta a ponta) · `cinco-metricas-do-core`

**Veredito: `NEEDS_FIX`** · 2026-09-15 · `master` em `d0cb997`, árvore limpa.
⛔ Postgres **somente leitura** (só `SELECT` e `GET`), nada semeado, nenhum deploy, nenhum arquivo
de produção tocado. `__pycache__` purgado e `PYTHONDONTWRITEBYTECODE=1` exportado antes de
qualquer medição.

---

## 1. Por que o ledger está `NEEDS_FIX` — e a causa original JÁ FOI SANADA

O veredito não está em arquivo de documento; está no ledger. Ele é **um só**, de `2026-09-11T15:21:11Z`:

```bash
python3 -c "
import json
for l in open('.git/harness/cinco-metricas-do-core/gates.jsonl'):
    d=json.loads(l)
    if d.get('phase')=='01': print(d['ts'], d['gate'], d['verdict']); print(d['notes'])"
```

> `2026-09-11T15:21:11Z QA NEEDS_FIX` — *"wave 03: e2e/08 importa `RANGE_START_MS`/
> `RANGE_END_MS_EXCLUSIVE` removidos de `s2-panels.ts` ⇒ `playwright --list` = 0 tests in 0 files
> (21 em 7 arquivos sem o 08); invisível a `make verify`…"*

Relatório de origem: `docs/context/cinco-metricas-do-core/gates/QA-wave-03.md` §1.

**Isso está corrigido em `master`** `[MEDIDO 2026-09-15]`:

```bash
grep -n 'RANGE_START_MS\|RANGE_END_MS_EXCLUSIVE' frontend/e2e/*.ts
# → 1 linha, e é COMENTÁRIO em 08-symbol-dado-real.spec.ts:14 ("This spec used to import…")
cd frontend && npx playwright test --list | tail -1
# → Total: 30 tests in 11 files      (era: Total: 0 tests in 0 files)
```

⇒ **O bloqueio de 2026-09-11 não é mais o motivo de a fase estar aberta.** O motivo hoje é outro, e
é o item 3 do `DoD-VERTICAL` — a métrica **até o pixel**, cobrada por um assert que ninguém escreveu.

---

## 2. Quais das 11 tasks estão de fato em `master` — **8 de 11**

⚠️ `tasks.toml` mostra as **11** como `status="todo"`. Ele está **desatualizado** e não foi usado como
fonte. O universo abaixo é PR mergeada + código/artefato em `master`.

| task | em `master`? | evidência citável |
|---|---|---|
| `T-01.1` identidade `klines_volume` | ✅ | `d35a7bd`, PR #211 · `backend/src/modules/sentimento/domain/klines_volume_catalog.py` |
| `T-01.2` cliente REST de `/fapi/v1/klines` | ✅ | `0132a20`, PR #211 · `backend/src/modules/sentimento/infra/binance_klines_client.py` |
| `T-01.3` coletor + backfill de 7 dias | ✅ | `27aea99`, PR #211 |
| `T-01.4` `ADR-035/D2` — `run_id` viaja e o escritor fecha | ✅ | `0fdd1e2`, PR #211 |
| `T-01.5` formatador imprime `extra` | ✅ | `9927dc4`, PR #211 |
| `T-01.6` `klines_volume` no catálogo SERVIDO | ✅ | `4f022f4`, PR #211 · `GET /api/v1/series-catalog` devolve `n_entries=60`, 4 delas `klines_volume` |
| `T-01.7` sub-eixo de volume no `PricePane` | ✅ | `06aa6ca`+`70a128d`, **PR #213** · `SymbolClient.tsx:277 VOLUME_SUBAXIS_TESTID` |
| `T-01.8` **veredito do `ux-ui-mastery`** | ⛔ **NÃO** | `ls docs/context/cinco-metricas-do-core/gates/design-01.md` → **arquivo inexistente**; `grep -rln 'sub-eixo de volume\|price-pane-volume-subaxis' docs/` → **nenhum gate de design** |
| `T-01.9` e2e `09-volume-dado-real.spec.ts` | ⛔ **NÃO** | `ls frontend/e2e/` → `08`, `10`, `11`, `12` — **não existe `09`** |
| `T-01.10` produção medida | ✅ | `ad62cc7`+`3a7e07b` · `gates/T-01.10-infra.md` |
| `T-01.11` fechamento vertical (conjunção dos DoD) | ⛔ **NÃO** | nenhum artefato de fechamento em `gates/`; este laudo o antecipa, mas **não o substitui** — `T-01.11` é task de build, com PR própria |

**8 de 11 em `master`. Faltam `T-01.8`, `T-01.9`, `T-01.11`.**

⚠️ `T-01.7-qa.md` diz `APPROVED` — e é veredito **de uma task**, não da fase. A fase tem 11.

---

## 3. DoD da fase, item a item (`docs/plans/SPEC-007-cinco-metricas-do-core/01_volume.md` §DoD)

`series_key_id` de `klines_volume`/BTCUSDT recalculado do código (não copiado de documento):
`ef3033e6ad5a487330c9e669dd1ed3105a7a40ba274b78302b4d3eb624244e42`.

| # | DoD | veredito | comando e universo |
|---|---|---|---|
| 1 | `count(*)` ≥ **10.000** | **OK** | `docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -c "select count(*), count(distinct event_time) from md.series where series_key_id='ef3033e6…'"` → **95.275 linhas · 17.044 buckets distintos** (`min..max` = `1788486120000..1789508700000`) |
| 2 | `series-history` com `n_points > 0` | **OK** | `GET /api/v1/series-history?…&interval=1m&bar_policy=final_only`, janela de **6 h** encerrando `now−5min` → `rows=360`, **351 com valor**, **350 valores distintos** |
| 3 | **Playwright contra o app real: `N ≥ 30` pontos distintos no sub-eixo e nada de `SEM_PONTO`** | ⛔ **FAIL** | ver §4 |
| 4 | ≥ 1 run fechado com `n_written > 0` e `Σ n_written` = item 1 | **OK** | `select count(*) filter (where n_written=0), count(*), sum(n_written) from md.ingest_run where endpoint='/fapi/v1/klines' and ended_at is not null and ended_at::timestamptz > now()-interval '30 minutes'` → **`0 \| 29 \| 80864`**; a igualdade de janela controlada é a de `T-01.10-infra.md` (`Σ n_written = 28` = 28 linhas novas) |
| 5 | `writer_batch_acked` mostra `n_accepted`/`n_rejected` | **OK** | `docker logs deploy-writer-1 --since 30m \| grep -c writer_batch_acked` → **997**; amostra: `writer_batch_acked n_accepted=2 n_rejected=0` |
| 6 | `uptimePercent` do `premiumIndex` deixa de ser `0.0` | **OK** | `GET /api/v1/collector-status` → `/fapi/v1/premiumIndex` **`uptimePercent=100.0`**, `n_runs_in_window=1430` (era `0.0` em 2026-09-10) |
| 7 | os 12 campos do array de klines preservados | **OK** | `backend/tests/sentimento/test_binance_klines_client.py:146` `test_dod_7_all_twelve_fields_survive_parsing_including_index_9_takerbuybasevol`, dentro do portão `test` |
| 8 | `make verify` verde | **OK** | **VERDE — 8 portões** · `test rc=0` **2.482 passed, cobertura total 96,65%** · `test-frontend rc=0` **614 pass** · `boundaries` 7 kept/0 broken · `regras` **0 bloqueio**, 73 avisos · `e2e rc=0` **30 passed (34,6 s)**. Log: `/tmp/verify-cripto-strategy-20260915T213823Z.log` |

**Falsificador da fase — rodado, NÃO disparou, e COM CONTROLE:** `0` runs **fechados** de
`/fapi/v1/klines` com `n_written = 0` — sobre **29** runs fechados na mesma janela. O controle
importa: `29 > 0` separa *"o zero foi medido"* de *"não havia o que medir"* (`ADR-012`, o `rc=0`
indistinguível).

---

## 4. ⛔ O BLOQUEIO — `DoD-3` não é pago por nenhum teste que exista, e o portão fica VERDE assim

**O `DoD-VERTICAL` item 3 exige `N ≥ 30` pontos DISTINTOS no sub-eixo de volume, contra o app real.**

### 4.1 O portão passa hoje com **ZERO** ponto de volume na tela

Do log do `make verify` desta rodada (`grep -n volume_dom /tmp/verify-cripto-strategy-20260915T213823Z.log`):

```
E2E-FACT 08-symbol-dado-real series_window_reader_present=false
E2E-FACT 08-symbol-dado-real volume_api_rows_with_value=0
E2E-FACT 08-symbol-dado-real volume_dom_present_points=0
[OK       ] e2e             rc=0  30 passed (34.6s)
```

⇒ **`rc=0` com `0` ponto de volume publicado.** `e2e/08` compara DOM **contra** API (`0 === 0` passa),
e é ele mesmo que declara, na linha 60, que **não** é o `DoD-3`:

> `08-symbol-dado-real.spec.ts:60` — *"⛔ NOT the `DoD-3` of `T-01.9`: that one counts `N >= 30`
> DISTINCT points on the volume sub-axis and gets its own spec (`09-volume-dado-real.spec.ts`)."*

### 4.2 A fase `01` é a ÚNICA das três sem o assert — e a comparação é o que prova que não é opinião

```bash
grep -rn 'MINIMUM_DISTINCT_POINTS\|MINIMUM_NATIVE_BARS' frontend/e2e/*.spec.ts
# 10-cvd-dado-real.spec.ts:69   const MINIMUM_DISTINCT_POINTS = 30;   (fase 02, CVD)
# 12-oi-dado-real.spec.ts:82    MINIMUM_NATIVE_BARS                   (fase 03, OI)
# 09-volume-dado-real.spec.ts   ← NÃO EXISTE
```

As fases `02` e `03` escreveram o assert com o desdobramento FRACO/FORTE (`12-oi:429-434`
`toBeGreaterThanOrEqual(MINIMUM_NATIVE_BARS)`). A fase `01`, que **inventou a exigência**, não tem.

### 4.3 E o dado está lá — o que falta é a AMARRA, não o pipeline

Rodada **somente leitura** contra a stack viva (`deploy-web-1:3000` + `deploy-api-1:8000`), sem semear:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 \
E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1 \
npx playwright test e2e/08-symbol-dado-real.spec.ts        # 2 passed, 1 failed (§5)
```

```
volume_api_rows_with_value = 3374
volume_dom_present_points  = 3374      ← a tela publica exatamente o que a API serve
volume_readable_horizon    = 3374/5760
volume_last_reading_text   = "Leitura atual: 15.224"
```

**3.374 ≫ 30.** ⇒ o `NEEDS_FIX` **não** é *"a métrica não chega ao pixel"*; é *"nada no repositório
reprova se ela parar de chegar"*. É exatamente o modo de falha que `D2` (owner) criou o `DoD-3` para
matar, e que a fase `04` de `pagina-de-grafico-s2` só achou **em uso ao vivo**.

---

## 5. Achado colateral — `e2e/08` pergunta a coisa errada para série de 5 min (universo FORTE)

Na rodada de §4.3, o teste **reprovou**, e não é no volume:

```
08-symbol-dado-real.spec.ts:410
  Expected substring: "SEM_PONTO"
  Received string:    "Leitura atual: 108197.43 (de 21:35:00Z (−4m))"
```

**Diagnóstico — é defeito de TESTE, não de produção**, e a prova é de duas pontas:
`fetchSeriesHistory` (`08:169`) cravou `interval: "1m"` + `bar_policy: "final_only"`, mas
`klines_last` é **`interval=5m`, `nativeGrid=5min`, `maxStaleness=600000`**
(`GET /api/v1/series-catalog`). Medido: `interval=1m` → `rows=5760`, **`0` com valor**; `interval=5m`
→ **HTTP 422** (a rota só serve a grade de 1 min). Já a manchete do painel sai do endpoint **LIVE**
(`page.tsx:407 buildLiveUrl`) e **declara a idade na própria tela** (`−4m`, dentro dos 600 s do
contrato). O assert `(d)` compara a grade histórica vazia contra uma leitura viva ⇒ **falso negativo**.

⚠️ **Não corrigido aqui, de propósito:** `e2e/08` é portão de `pagina-de-grafico-s2`/fase `03`, não
desta fase, e consertá-lo por fora mudaria um gate alheio sem o dono. Fica registrado porque **quem
escrever o `09` herdará o mesmo molde se copiar `08` sem ler isto** — e `tasks.toml:T-01.9` manda
copiar o `08`.

---

## 6. Regras bloqueantes — **8 de 8** avaliadas

`harness rules list --severity block` lista 8. Portão `regras` do `make verify`
(`.harness/mechanism rules --mode sweep --surface git-hook`): **`rc=0`, 0 bloqueio(s), 73 aviso(s)** —
`core.relative-import`, `core.silent-except`, `core.print-statement`, `core.hardcoded-secret`,
`web-fullstack.browser-imports-server`, `web-fullstack.tenant-from-request`,
`web-fullstack.server-test-directory-present`, `own.compose-hardcoded-secret`. Os 73 avisos são
`hardcoded-url` em `*.test.ts`, pré-existentes e não bloqueantes.

**Cobertura:** `harness policy --key coverage` → *"campo ausente na politica"* ⇒ não há alvo
declarado em política; o alvo em vigor é o **piso por camada** cobrado dentro de `make test`
(`check-coverage-layers.sh`), que devolveu `rc=0`. Total medido: **96,65%**.

---

## 7. Veredito

```
## QA Gate — Fase 01 [sentimento · infra · web]
- [OK]   8 de 8 regras bloqueantes — portão `regras` rc=0, 0 bloqueio, 73 avisos
- [OK]   Testes existem e passam — `make verify` VERDE, 8 portões (2.482 backend + 614 front + 30 e2e)
- [OK]   Cobertura 96,65% contra alvo: sem chave `coverage` em política; piso por camada rc=0
- [FAIL] DoD-3 — `N >= 30` pontos distintos no sub-eixo: NENHUM teste o exige; o portão é VERDE
         com `volume_dom_present_points=0`, e `09-volume-dado-real.spec.ts` não existe
- [OK]   DoD 1, 2, 4, 5, 6, 7, 8 — todos medidos acima, com comando e universo
- [FAIL] Tasks da fase: 8 de 11 em `master`; faltam T-01.8, T-01.9, T-01.11
Veredito: NEEDS_FIX
```

### Ações

1. **`T-01.9`** — escrever `frontend/e2e/09-volume-dado-real.spec.ts` no molde de
   `10-cvd-dado-real.spec.ts` (**não** no de `08`, por §5): `MINIMUM_DISTINCT_POINTS = 30`,
   desdobramento FRACO/FORTE por `series_window_reader_present`, seleção por
   `data-testid="price-pane-volume-subaxis"` e `data-volume-present-points`, e o assert de que o
   sub-eixo **não** exibe `SEM_PONTO`. ⛔ Sem semear o Postgres compartilhado — §4.3 mostra que o
   backfill de `T-01.3` já entrega **3.374** pontos legítimos.
2. **`T-01.8`** — submeter o sub-eixo ao `ux-ui-mastery` e registrar o veredito em
   `gates/design-01.md`. A autonomia do `ui-designer` é **condicionada** a esse gate
   (`CLAUDE.md` §Design); hoje o arquivo não existe.
3. **`T-01.11`** — fechamento vertical com a conjunção dos 8 itens, em PR própria. Os itens 1, 2, 4,
   5, 6, 7 e 8 já estão medidos acima e podem ser citados; o **item 3** só fecha depois da ação 1.
4. **`tasks.toml` desatualizado** — 11 tasks em `todo` com 8 mergeadas. O portão do `gate-record`
   RECUSA (exit 4) o próximo veredito com fase aprovada e task aberta ⇒ antes de qualquer
   `APPROVED` desta fase, `harness tasks resolve cinco-metricas-do-core 01 <TODAS as 11>`
   (atômico por fase) e `harness tasks validate`. **Não editar o arquivo à mão.**
5. **Achado de §5, dono externo** — `e2e/08:169` cravar `interval: "1m"` reprova série de 5 min no
   universo FORTE. Escalado para o dono de `pagina-de-grafico-s2`/fase `03`; não bloqueia a `01`.

**`gate-record` NÃO gravado e `advance` NÃO rodado — por instrução explícita do despacho.**

---

# APÊNDICE A — REVALIDAÇÃO em `cb714e0` (2026-09-15, pós `T-01.9` e `T-01.8`)

⚠️ **Append-only: o veredito `NEEDS_FIX` de `1a81c5b` acima fica INTACTO.** Ele era correto no
commit em que foi medido; o que segue mede **outra cabeça**. `__pycache__` purgado,
`PYTHONDONTWRITEBYTECODE=1`, Postgres **somente leitura**, nada semeado, sem deploy.

**Denominador:** `master` em `cb714e0`, árvore limpa. Entraram desde o laudo: `b6f407d` (`T-01.9`,
`frontend/e2e/09-volume-dado-real.spec.ts`, 472 linhas), `388ec1a` (**produção**: `SymbolClient.tsx`,
`s2-lightweight-adapter.ts`, `charts/index.ts` + 2 arquivos de teste), `cb714e0` (`design-01.md`).

## A1. ⛔ O app medido NÃO é o container de produção — e a diferença importa

`docker inspect deploy-web-1 --format '{{.State.StartedAt}}'` → **`2026-09-15T22:28:35Z`**, e
`388ec1a` é de **`2026-09-15T23:13:30Z`** ⇒ **o container não tem o conserto de design.** Medir
`DoD-3` contra ele mediria o commit errado. Tudo abaixo foi medido contra um
`next start -p 3997` do **HEAD atual**, lendo a **API de produção** (`:8000`) — processo local, não
deploy, e nenhuma escrita. ⚠️ **Ressalva com dono externo:** o pixel corrigido por `388ec1a`
**ainda não está no ar**; quem publica é o owner.

## A2. `DoD-3` — **FECHA**, e o verde deixou de ser vacuoso

### CALA — duas rodadas, contra o app real

```bash
E2E_BASE_URL=http://127.0.0.1:3997 E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1 \
  npx playwright test e2e/09-volume-dado-real.spec.ts        # rc=0, 3 passed
```

| rodada | `series_window_reader_present` | `volume_api_rows_with_value` | `volume_dom_present_points` | leitura |
|---|---|---:|---:|---|
| 1 (pré-mutação) | `true` | **3.483** | **3.483** | `20.193` = `volume_api_last_instant_value` |
| 2 (pós-revert) | `true` | **3.488** | **3.488** | `91.306` |

Igualdade **exata** `DOM == API` nas duas, e os números **mudaram entre elas** (3.483 → 3.488) ⇒ a
série está viva; não é um par congelado que casaria por construção. **3.488 ≫ 30.**

### MORDE — replantado por mim, e ISOLANDO o piso

O risco real não era *"o piso não falha nunca"*, era *"o piso é redundante com `DOM == API`"*. A
mutação foi escolhida para **manter `DOM == API` verdadeiro** e ainda assim derrubar o `DoD-3` —
uma regressão de janela, que é o defeito que chega à tela sem quebrar a igualdade:

```
frontend/src/charts/s2-window.ts:65
-  export const S2_WINDOW_SPAN_MS = 4 * ONE_DAY_MS;
+  export const S2_WINDOW_SPAN_MS = 20 * 60 * 1000;      (mutação, `npm run build`, revertida)
```

```
volume_api_rows_with_value = 20 · volume_dom_present_points = 20 · volume_window_grid_slots = 20
  → (b) `DOM == API` PASSA (20 === 20), como previsto
  ✗ 09-volume-dado-real.spec.ts:447
    Error: DoD-3 pede N >= 30 pontos distintos no sub-eixo de Volume; a tela declara 20 em 20 grades de 1 min
    Expected: >= 30
    Received:    20
  1 failed · 2 passed
```

⇒ **o piso MORDE onde `DOM == API` CALA.** É exatamente o vão pelo qual, no laudo acima,
`volume_dom_present_points=0` convivia com `e2e rc=0 30 passed`.

**Reversão provada, não afirmada:** arquivo restaurado por cópia do backup,
`git status --porcelain` → **vazio**, `S2_WINDOW_SPAN_MS = 4 * ONE_DAY_MS` de volta, `next build`
refeito e a **rodada 2** acima é justamente a confirmação pós-revert.

### O piso também tem falsificador DENTRO do portão

`09:307` roda nos dois universos e não depende de DOM: `morde_empty_window_present=0`,
`morde_just_below_present=**29**` (reprova), `cala_at_floor_present=**30**` (passa),
`cala_measured_live_present=3.374`. ⚠️ É prova do **predicado**, não da **tela** — quem prova a tela
é a mutação de A2.

### E a lição do §5 do laudo virou asserção

`09:293-294` exige `interval="1m"` **e** `nativeGrid="1min"` do catálogo servido — medido no portão:
`catalog_volume_interval="1m"`, `catalog_volume_native_grid="1min"`, `catalog_volume_rows_for_symbol=1`.
O falso negativo que `08:169` produz em série de 5 min **não pode se repetir aqui sem reprovar**.

## A3. DoD 1, 2, 4, 5, 6, 7, 8 — remedidos na cabeça atual, nenhum regrediu

| # | antes (`1a81c5b`) | agora (`cb714e0`) | comando |
|---|---|---|---|
| 1 | 95.275 linhas / 17.044 buckets | **105.450 / 17.140** ✅ | `psql … count(*), count(distinct event_time) from md.series where series_key_id='ef3033e6…'` |
| 2 | 351 com valor / 350 distintos | **352 / 352** de `rows=360` ✅ | `GET /api/v1/series-history`, janela de 6 h |
| 4 | 0 de 29 fechados com `n_written=0` | **0 de 30** ✅ (controle `30 > 0`) | `psql … md.ingest_run … ended_at::timestamptz > now()-interval '30 minutes'` |
| 5 | 997 `writer_batch_acked` | **199** em 30 min ✅ (writer reiniciado às 22:28Z) | `docker logs deploy-writer-1 --since 30m \| grep -c` |
| 6 | `premiumIndex` 100,0% | **100,0%**, 1.431 runs ✅ | `GET /api/v1/collector-status` |
| 7 | teste dos 12 campos | inalterado ✅ | `test_binance_klines_client.py:146`, dentro do portão `test` |
| 8 | VERDE, 8 portões | **VERDE, 8 portões** ✅ | ver A4 |

## A4. `make verify` — **VERDE, 8 portões**

```
[OK] lint-backend rc=0  452 · [OK] lint-frontend rc=0 · [OK] test-frontend rc=0  628 pass, 0 fail
[OK] test rc=0  2482 passed · Total coverage: 96.65% · [OK] boundaries rc=0  7 kept, 0 broken
[OK] regras rc=0  0 bloqueio(s), 73 aviso(s) · [OK] política rc=0 · [OK] e2e rc=0  33 passed (35.6s)
veredito: VERDE — 8 portões mediram e passaram
```
`[MEDIDO 2026-09-15T23:20:56Z]` · log `/tmp/verify-cripto-strategy-20260915T232056Z.log`.
**+3 e2e** (30 → 33, os três de `09`) e **+14 front** (614 → 628, a geometria de `388ec1a`).
`regras`: **8 de 8** bloqueantes, **0 violação**; os 73 avisos são `hardcoded-url` em `*.test.ts`,
pré-existentes.

## A5. As duas cegueiras declaradas — **confirmadas como RESSALVA, não como bloqueio**

1. **Universo FRACO fica antes do piso.** Medido no log do portão: `series_window_reader_present=false`
   ⇒ `09:430` retorna antes de `09:443`. ✅ **Mas o ramo fraco NÃO é vacuoso** — e isso é o que o
   separa do `08`: ele asserta o oposto e o assert é forte. Medido: `volume_series_history_status=**500**`
   (a rota RECUSA, não inventa grade `200`), `volume_api_rows_with_value=0`,
   `volume_last_reading_text="Leitura atual: **SEM_PONTO**"`, sem dígito. ⇒ o portão que roda em CI
   não prova `N >= 30`, e **também não passa por omissão**.
2. **`harness rules --changed-only` não olhou.** `harness code-paths classify frontend/e2e/09-volume-dado-real.spec.ts`
   → **`nao-producao: nenhum include_prefixes casa ['backend/src/','backend/tests/','frontend/src/','deploy/']`**
   ⇒ o `rc=0` vazio do sweep sobre este arquivo significa **"não olhou"**, não **"aprovou"**. Quem
   mediu foi a mutação de A2. ✅ Declarado pelos entregadores antes de eu perguntar — registrado
   como tal.

## A6. O que AINDA falta para a FASE fechar — 1 task, não 3

`T-01.9` ✅ (`b6f407d`) · `T-01.8` ✅ (`cb714e0`, readjudicação `APPROVED` em §A8 do `design-01.md`,
após 2 `BLOCKER` reais consertados em `388ec1a` — e os dois viraram teste com controle negativo em
`volume-subaxis-geometry.test.ts:235,252,270,280,303`, dentro do portão).

⛔ **`T-01.11` continua sem artefato** — `grep -rln 'T-01.11' docs/context/cinco-metricas-do-core/gates/`
devolve só plano, `tasks.toml`, `MEDICAO-PRODUCAO-F01.md`, `T-01.10-infra.md` e **este laudo**.
A **substância** dela (os 8 itens com comando e `n`) está medida duas vezes aqui, por QA; o
**artefato de fechamento com PR própria**, não. ⚠️ **Não o escrevo como se fosse a task:** `T-01.11`
é de build, e QA redigir o fechamento que QA depois aprova é o ciclo sem gate que o `CLAUDE.md`
proíbe. **Decisão de governança, do coordenador/`tech-lead`:** despachar `T-01.11` citando A3/A4,
ou resolvê-la como `done` citando este apêndice como evidência.

⛔ **`tasks.toml` segue com as 11 tasks em `todo`** — o portão do `gate-record` RECUSA (exit 4) o
próximo veredito com fase aprovada e task aberta. `harness tasks resolve cinco-metricas-do-core 01`
com **as 11 numa chamada** (atômico por fase) antes de qualquer `APPROVED`.

## A7. Veredito da revalidação

```
## QA Gate — Fase 01 [sentimento · infra · web] · REVALIDAÇÃO em cb714e0
- [OK]   DoD-3 — N >= 30 no app real: 3.488 == 3.488 (DOM == API), 2 rodadas
- [OK]   ...e o piso MORDE: mutação de janela mantém DOM == API (20 == 20) e o piso
         reprova sozinho em 09:447 (`Expected: >= 30 · Received: 20`); revertida, árvore limpa
- [OK]   DoD 1, 2, 4, 5, 6, 7 — remedidos, nenhum regrediu (A3)
- [OK]   DoD-8 — make verify VERDE, 8 portões (2.482 backend 96,65% · 628 front · 33 e2e)
- [OK]   8 de 8 regras bloqueantes — portão `regras` rc=0, 0 bloqueio
- [ressalva] universo FRACO não alcança o piso (mas asserta 500 + SEM_PONTO, não é vacuoso)
- [ressalva] `frontend/e2e/` fora de `include_prefixes` ⇒ sweep "não olhou, não aprovou"
- [ressalva] `deploy-web-1` iniciou ANTES de 388ec1a ⇒ o pixel corrigido não está no ar
- [FAIL] T-01.11 sem artefato · tasks.toml com as 11 em `todo`
Veredito: o DoD-3 que eu reprovei está PAGO; a FASE ainda é NEEDS_FIX por 1 task e pelo resolve.
```

### Ações (2, ambas de governança — nenhuma de código)

1. **`T-01.11`** — despachar (citando A3/A4) **ou** resolver como `done` citando este apêndice.
2. **`harness tasks resolve cinco-metricas-do-core 01 <as 11 numa chamada>`** + `harness tasks validate`,
   antes do `gate-record`.

**`gate-record` NÃO gravado e `advance` NÃO rodado — por instrução explícita do coordenador.**
