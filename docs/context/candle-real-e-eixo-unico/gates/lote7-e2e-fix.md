# Lote 7 — fix dos 2 achados de `make verify` (wave/candle-f02)

Contexto: `make verify` reprovou com `rc=2` no e2e (`40 passed, 2 failed`) após o merge de
`T-02.1`+`T-02.5` em `wave/candle-f02`. Log original: `/tmp/verify-wave-f02-20260921T224615Z.log`.

## Achado 1 — `frontend/e2e/12-oi-dado-real.spec.ts:392` (assert desatualizado)

**Sintoma:** `expect(horizonFact).toBe(\`oi_readable_horizon:${api.native}/${nativeGridSlots}\`)`
reprovava (`Expected: .../1152, Received: .../5760`).

**Causa raiz:** o teste calculava o denominador com `nativeGridSlots` (grade de 5 min do OI,
`NATIVE_GRID_MS`), suposição de ANTES de `T-02.1`. `T-02.1` (`CA-5a`) unificou TODO painel na
MESMA grade (`S2_AXIS_STEP_MS`, 1 min) — `buildOiPanel` parou de reimplementar a própria grade
(`frontend/src/charts/s2-panels.ts:164-180`), e `panels.oi.slots.length` (o `gridSlots` que
`OiReadableHorizon` recebe em `SymbolClient.tsx:1147`) já é a grade de 1 min, igual
price/CVD/volume. O comentário `:388` ("nunca windowGridSlots") documentava a suposição PRÉ-fix
e passou a mentir sobre o motivo.

**Fix (só no teste):** assert trocado para `windowGridSlots` (numerador `api.native` preservado,
sem tocar produção); comentário reescrito explicando a unificação de `T-02.1`. Confirmado por
`oi_native_grid_slots=1152` / `oi_window_grid_slots=5760` nos fatos do `make e2e` pós-fix — a
razão 5 continua publicada, só deixou de ser o denominador do horizonte.

## Achado 2 — `frontend/e2e/08-symbol-dado-real.spec.ts:326` (timeout 400s, hang real)

**Sintoma:** `locator.textContent: Test timeout of 400000ms exceeded`, esperando por
`section[aria-label="PreÃ§o"] [data-fact*="_last_reading:"]`.

**NÃO é flake de ambiente efêmero.** `series_window_reader_present=false` / `status=500` nas 7
specs que tocam `series-history` é o comportamento CORRETO e documentado (`ADR-034/D9`: engine
sqlite não tem reader de `md.series`; confirmado no `api.log` capturado —
`NotImplementedError: get_series_window_reader_source has no default adapter`). Reproduzido 2×
isolado (`make e2e` sozinho, fora do `make verify`): mesmo hang, 100% determinístico — não é
race nem contenção de máquina.

**Causa raiz real:** `git log -L` em `frontend/e2e/08-symbol-dado-real.spec.ts:407` aponta o
commit `61f35b1` (`T-02.5`, já mergeado em `wave/candle-f02`) trocando o literal
`["Preço", "klines_ohlc", "CLOSE"]` por `["PreÃ§o", "klines_ohlc", "CLOSE"]` — UTF-8
double-encoded ("ç" virou "Ã§"), efeito colateral do reescreve-em-massa daquele commit (9 specs
e2e reescritos, diffs de centenas de linhas). `SymbolClient.tsx:979` renderiza
`aria-label="Preço"` (UTF-8 correto — confirmado por leitura de bytes). O seletor
`section[aria-label="${label}"]` NUNCA casava com nenhum elemento, em nenhum universo (a espera
independe de `readerPresent`), e um `.textContent()` sem `expect(...).toHaveCount()` não falha
rápido — trava até o timeout do teste (400s), daí o "hang" de 6,7 min.

Achado agravante: esse seletor por `aria-label` (texto pt-BR) é exatamente o anti-padrão que o
próprio arquivo (e `09-volume-dado-real.spec.ts:83`, `14-long-short-dado-real.spec.ts:85`)
documenta como proibido — a convenção do repo já é `data-testid`, nunca `aria-label`/texto, e
era o ÚNICO uso restante do padrão banido em toda a suíte e2e (`grep -rn aria-label
frontend/e2e/*.spec.ts` confirma).

**Fix (só no teste):** revertido o literal para `"Preço"` (UTF-8 correto), único ponto de
mudança — comentários com o mesmo mojibake em outras linhas do arquivo (`:33,53,57,404`) são
pré-existentes, cosméticos, e fora do escopo deste fix.

## Verificação

- `make e2e` isolado, 2× (pré-fix reproduziu o hang determinístico; pós-fix: `42 passed (41.4s)`
  e `42 passed (41.9s)`).
- `make verify` final: `rc=0` — `lint-backend`, `lint-frontend`, `test-frontend` (757/0),
  `test` (2623 passed, 96.31% cobertura), `boundaries` (7/0), `regras` (0 bloqueio, 73 aviso),
  `política`, `e2e` (42 passed) — todos `[OK]`. Log:
  `/tmp/verify-wave-f02-fix-20260922T002744Z.log`.
- Nenhum arquivo de produção tocado — só os 2 specs e2e.

Commit: em `wave/candle-f02`, sem PR (conforme instrução de despacho).
