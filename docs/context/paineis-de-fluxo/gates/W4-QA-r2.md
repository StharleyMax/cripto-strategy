# W4-QA-r2: QA de front da wave W4 (fase 02 + T-01.R1), revalidação depois do `W4-QA-fix`

**Feature:** `paineis-de-fluxo` · **Base:** `274bd1f` (`wave/paineis-f02`), diff `master...wave/paineis-f02` (87 arquivos)
· **Data:** 2026-09-26 (UTC, 23:30–00:05) · **Agente:** `frontend-qa` · **Janela:** exclusiva · **Portas:** 8845/4345
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md` (DoD 1–5), o DoD de `T-02.1`…`T-02.5` e
`T-01.R1`, o `W4-QA.md` (r1, NEEDS_FIX só por Doc delta), o `W4-QA-fix.md` e o fecho da W1 (`gates/W1-QA-r3.md`)

## 0. Veredito: APPROVED

O único BLOCKER do r1 (Doc delta do doji) está fechado, e o conserto foi medido, não relido. O código mudou em
**1 arquivo desde o r1, e a mudança é só em comentário**: `git diff c0d851b..HEAD -- frontend backend scripts Makefile`
dá `SymbolClient.tsx | 3 ++-`, com as 3 linhas dentro da docstring do sub-eixo (`:1728`). Mesmo assim, pela regra
*"APPROVED velho sobre código novo"*, tudo o que prova comportamento foi medido de novo sobre o HEAD:

1. **`make verify` VERDE, 8 portões**, com `VERIFY_FORCE=1` e `__pycache__` purgado (§4).
2. **`CA-6` no app real, com dado real:** `e2e/30` com **124/124** barras concordando com `/series-history`
   (56 alta, 50 baixa, 18 neutras). O instrumento invertido dá **18/124**.
3. **Ablação no app real, com rebuild:** comparador invertido ⇒ `e2e/30` **17/124**, `e2e/29` `agreement=0`, e o probe
   por TF dá `differ` = 711/711 (`1m`), 136/136 (`15m`) e 9/9 (`4h`). Revertido e reconstruído: 124/124 de novo.
4. **As mutações que a nota nova do plano cita foram rodadas**, e a nota diz a verdade (§3).

## 1. Checklist

```
## QA Gate (Front) — Fase 02: volume com direção (+ T-01.R1), rodada 2
- [OK]   DoD da fase, item a item (§2), cada um com o comando
- [OK]   Lógica fora do componente: sem mudança desde o r1 (volume-direction.ts e pane-legend.ts puros, com *.test.ts)
- [OK]   Contrato tipado na borda: tsc --noEmit --strict dentro do lint-frontend, rc=0
- [OK]   Sem segredo no cliente: portão `regras` com 0 bloqueio e 77 avisos (o mesmo número do r1)
- [OK]   Acessibilidade: e2e/23 e e2e/24 verdes no app real. Os sr-only dizem "ausente" (SF-9)
- [OK]   Testes existem, passam e têm o par morde/cala: 1125 de front, 0 fail. M1/M2/M4 mordem de novo (§3)
- [FAIL] Cobertura do front [NÃO MEDIDO]: não há instrumento, e o plano 02 não declara alvo. Não bloqueia.
         Back: 96,23% (`make test` dentro do verify)
- [OK]   Sweep de regras: 0 bloqueio (portão `regras` do make verify)
- [OK]   make verify verde: 8 portões, e2e 71 passed / 3 skipped, os mesmos 3 skips do r1
- [OK]   Doc delta: as 5 linhas "doji = alta" / "3 dos 4" têm nota datada logo abaixo (§5). docs/INDEX.md com
         11 linhas acrescentadas e 0 removidas no diff inteiro (append-only)
- [OK]   Rótulos de força: a nota nova do plano cita M1, M2 e M4 com o universo do r1, e a rodada deles aqui bate (§3)
```

## 2. DoD do plano 02, item a item (medido de novo sobre `274bd1f`)

| DoD | comando | resultado |
|---|---|---|
| 1 Unitário, 4 casos | `umut.sh` (replace, `node --test 'src/charts/*.test.ts'` + `node --conditions=react-server --test 'src/app/**/*.test.ts'`, revert) | base **909 pass / 0 fail**. M1 reprova os **casos 1 e 2** (mais 2 de pareamento), que são os "2 dos 4" da nota nova. M2 reprova o **caso 3**, e M4 o **caso 4** (§3) |
| 2 Pixel `CA-6` | `E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1 E2E_BASE_URL=http://127.0.0.1:4345 npx playwright test 30-volume-direction-per-bar-real-data 29-volume-direction-wiring-pixel` | **3 passed**, sem skip. `universe="FORTE"`, `ohlc_series_history_statuses=[200,200,200,200]`, `api_candles_in_window=4162`. `verdict`: compared **124**, agreeing **124**, e há as duas direções, então o resultado não é inconclusivo. `e2e/29` `agreement=1`. Rodada final sobre o HEAD reconstruído: 124/124 de novo (53/52/19, porque a janela anda) |
| 3 Ablação | `emut.sh r2-M1-cmp-inverted src/charts/volume-direction.ts 'return candle.close > candle.open ?' 'return candle.close < candle.open ?'` (rebuild, e2e, probe, revert) | **morde:** `2 failed, 1 passed`. `e2e/30` com **17/124** (só os neutros concordam; primeira discordância no slot 5219, esperado `up` e visto `down`). `e2e/29` com `agreement=0`. No probe, `same=0` nos 3 TFs |
| 4 Não-regressão `klines_volume·1m·SUM` | `npx playwright test 09-volume-dado-real` no app real | **passed**: `series_window_reader_present=true`, `volume_api_rows_with_value = volume_dom_present_points = 4147` (> 0) |
| 5 `make verify` + `ux-ui-mastery` | §4, mais `gates/W4-DESIGN-REVIEW.md:7` | verify **VERDE**. Design: `W4-DESIGN-REVIEW` **APPROVED** 63/100 `[DOC]` |

**Probe por TF sobre o HEAD** (`tfprobe.mjs`, o mesmo instrumento do r1, coluna a coluna no canvas do pane de preço):
`1m` same 711 / differ **0** · `15m` same 136 / differ **0** · `4h` same 9 / differ **0**. `volume_scale:linear` nos 3.

## 3. Mutações rodadas nesta rodada

A regra §4 manda pedir a mutação, e não o relatório. Todas foram aplicadas com replace literal e revertidas com
`git checkout --`. Depois de cada uma, `git status --short` ficou vazio.

| # | mutação | nível | resultado |
|---|---|---|---|
| M1 | `close > open` → `close < open` (`volume-direction.ts:58`) | unit | **4 fail**: DoD case 1, DoD case 2 e 2 de pareamento |
| M1 | idem | app real, com rebuild | `e2e/30` **17/124**, `e2e/29` **0**, probe `differ` 100% nos 3 TFs |
| M2 | `close === open` → `close !== close` (o ramo do doji nunca entra) | unit | **2 fail**: DoD case 3 e o pareamento |
| M4 | vela ausente → `directionUpFill` | unit | **3 fail**: DoD case 4 e 2 de pareamento |

O r1 mediu 16 rodadas (M1 a M10). Essas não foram repetidas, porque o código de produção não mudou desde ele (§0).

## 4. `make verify` e latência

`find backend -name __pycache__ -type d -not -path '*/.venv/*' -exec rm -rf {} +`, depois
`VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify` → **rc=0, VERDE**. O log fica em
`/tmp/verify-wave-paineis-f02-20260926T233253Z.log`. Resultado: lint-backend 474 · lint-frontend (ESLint + tsc strict)
· test-frontend **1125 pass / 0 fail** em 4 suítes · test **2816 passed**, 96,23% · boundaries 7/0 · regras 0
bloqueio, 77 avisos · política ok · e2e **71 passed / 3 skipped**. Não houve vermelho, nem dentro nem fora da lista
de conhecidos das regras §2.

| medida (`grep -hoE` no log) | W4-r2 | W4-r1 | W1 (`wave-paineis-f01`, n=9 logs) | teto |
|---|---|---|---|---|
| `e2e/17` `axis_latency_p95_ms` | **17,3** (p50 16,7, n=86) | 17,5 | 17,4–32,9 | 160 |
| `e2e/20` `axis_intra_gesture_interval_max_ms` | **100** (p95 33,8, n=317, `over_ceiling_n=0`) | 85,6 | 66,9–116,4 | 160 |
| `e2e/20` `history_page_latency_p95_ms` | **92,5** (n=15) | 128,2 | 70,6–114,3 | 400 |

**Não há regressão sobre a W1.** Os três números ficam dentro da faixa que os 9 logs `verify-wave-paineis-f01-*`
mediram. `axis_other_interval_over_ceiling_n=17` é o mesmo valor em todos os 37 logs recentes que têm o fato, então é
estrutural, e não da W4 `[MEDIDO: ls -t /tmp/verify-*.log | head -60, grep do fato]`. A folga do intra-gesto continua
fina (o r1 já viu 161,8 numa rodada, achado 5 dele). Nesta rodada, a folga foi de 60 ms.

## 5. Doc delta: o BLOCKER-1 do r1

Rodei de novo o falsificador de `W4-QA-fix.md` §2, com o padrão **alargado** (`… | close_i ≥ | close ≥ open | close
>= open`):

```bash
for f in docs/MAPA-DOCUMENTAL.md docs/specs/PRD-009-paineis-de-fluxo.md docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md; do
  grep -n -iE 'doji = alta|doji → cor de alta|doji fica com a cor de alta|reprova 3 dos 4|close_i ≥|close ≥ open|close >= open' "$f" \
  | grep -vE '^[0-9]+: *>' | while IFS=: read -r n _; do
    sed -n "$((n+1)),$((n+15))p" "$f" | grep -q 'CORREÇÃO 2026-09-26.*T-02.1-doji-julgamento' && echo "ok $f:$n" || echo "STALE $f:$n"; done; done
```

Saída: **5 ok, 0 STALE** (`MAPA:68`, `PRD-009:194`, `PRD-009:289`, `plano 02:12`, `plano 02:26`). O padrão alargado
não achou linha nova. `grep -rn -i doji` em `docs/specs`, `docs/plans`, `docs/adr`, `MAPA-DOCUMENTAL`,
`arquitetura-fluxos` e `STITCH_CONTEXT` também não achou nenhum outro "doji = alta": o `STITCH_CONTEXT` e a `ADR-010`
dizem "direção não afirmada", que é o que o código faz. O commit `274bd1f` tem **79 inserções e 1 remoção**, e a
remoção é a linha de comentário do `SymbolClient.tsx`. Nenhuma linha de documento foi reescrita.

## 6. Não-regressão do fecho da W1

Os `e2e/16`, `18`, `20`, `22`, `24`, `26` e `27` estão entre os 71 passed do verify. O diff desde o r1 não toca
`frontend/src` fora do comentário (§0), então os argumentos do r1 §6 continuam valendo sem mudança.

## 7. Achados

1. **[WARNING, novo] O `e2e/08-symbol-dado-real:328` reprova no universo forte, e a causa não é a W4.** Ele espera
   `ausente` no readout do OI e recebe `Leitura atual: 94297.533`. O fato do spec é
   `sum_open_interest_api_has_value=false`. O `GET /series-catalog` de produção tem **80 entradas**, e as primeiras
   entradas `sum_open_interest` de BTCUSDT são **4 da `coinalyze`**, antes da da `binance`. O `findEntry(metric ===
   "sum_open_interest")` do spec pega a primeira, que não tem linha, enquanto o pane lê a da binance `[MEDIDO: curl
   do catálogo pelo proxy]`. O diff da W4 nesse spec só troca a constante `ABSENCE_TOKEN`, e o readout tem dígito, então
   ele reprova com `SEM_PONTO` do mesmo jeito. O defeito é a premissa do spec sobre um catálogo que cresceu
   (fase 03a), e não o código da W4 `[INFERRED: não rodei o master no universo forte]`. No gate (universo fraco)
   ele passa. **Dono:** quem mantém o `e2e/08`, que é a fase 03 de `paineis-de-fluxo`. A correção é filtrar
   `provider` no `findEntry`.
2. **[WARNING, herdado do r1, achado 4]** O `e2e/14:472` continua reprovando no universo forte (775 contra ≥ 1152),
   pela mesma causa (premissa do spec sobre coletor sem buraco).
3. **[WARNING, herdado do `W4-REVIEW` WARNING-1]** A D3 de `handoff/DESIGN-LAYOUT.md:39` pede a barra de volume **com a
   forma da vela** (vazado/cheio), e o código a desenha cheia, com a direção só no matiz. Isso não reprova aqui, porque
   o plano 02 (item 2.1, "os mesmos dois tokens … uma gramática de cor só") está acima do handoff na precedência do
   `MAPA-DOCUMENTAL.md:9-15`, bate com o código, e o `ux-ui-mastery` aprovou com o SF-14 aberto
   (`T-02.5-design-review-r2`, `W4-DESIGN-REVIEW`). O registro da troca abaixo da D3 continua faltando.
4. **[WARNING, herdado do r1]** W-1: o pareamento por instante não tem guarda de e2e em TF ≠ `1m`. O unitário
   `volume-direction.test.ts:89` morde. Os achados 5 e 7 do r1 (folga do `e2e/20`, skips do `e2e/15`) seguem iguais.
5. **[WARNING, herdado do `W4-REVIEW` WARNING-4]** A docstring de `VolumeMarksLegend` (`SymbolClient.tsx:1785`) continua
   em português. É convenção, e não portão.

## 8. Ações

Nenhuma ação bloqueante. Os WARNINGs 1 e 3 vão para o backlog do orquestrador: o filtro de `provider` no
`e2e/08::findEntry`, e a nota datada abaixo da D3 em `DESIGN-LAYOUT.md`.

## 9. Setup e instrumentos

- Proxy só-leitura `:8845 → :8000` (`proxy.mjs`, modelo `T-01.11-r2-proxy.mjs.txt`). Ele fechou com **344 GETs**
  (251 de `/series-history`) e **1 recusa**, que foi o meu `POST` de teste da trava (405). **Nenhum INSERT, nenhum
  seed.**
- `next build` com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8845`, depois `next start -H 127.0.0.1 -p 4345`.
  Três builds: `r2-HEAD`, `r2-M1-cmp-inverted` e `r2-HEAD-final`.
- Outros specs no app real: `npx playwright test 09-volume-dado-real 23 24 14-long-short 08-symbol-dado-real`, que
  deu **14 passed, 2 failed** (`e2e/08:328` é o achado 1, e `e2e/14:472` é o achado 2).
- Os scripts (`proxy.mjs`, `tfprobe.mjs`, `umut.sh`, `emut.sh`) e os logs (`e2e-r2-*.log`, `probe-r2-*.json`) ficam
  no scratchpad da sessão, **fora do versionamento**.
- Ao sair: `:4345` e `:8845` fechadas, e `git status --short` vazio antes deste laudo.
