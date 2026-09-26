# W4-QA: QA de front da wave W4 (fase 02 + T-01.R1)

**Feature:** `paineis-de-fluxo` · **Base:** `5a2cd15` (`wave/paineis-f02`), diff `master...wave/paineis-f02` (78 arquivos,
17 em `frontend/src`) · **Data:** 2026-09-26 (UTC, 22:40–23:15) · **Agente:** `frontend-qa` · **Janela:** exclusiva ·
**Portas:** 8845/4345
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md` (DoD 1–5), o DoD de `T-02.1`…`T-02.5` em
`harness tasks json paineis-de-fluxo`, `gates/T-01.R1-builder.md` (SF-8/SF-9) e o fecho da W1 (`gates/W1-QA-r3.md`)

## 0. Veredito: NEEDS_FIX, só por Doc delta

**O código está aprovado.** Todo DoD de comportamento da fase 02 passa no app real, com dado real, e cada proteção
foi provada por mutação, não pelo relatório do builder:

1. **`CA-6` no app real:** `e2e/30` com dado real (proxy só-leitura): **123/123** barras concordam com a direção que
   `/series-history` dá para a vela (60 alta, 56 baixa, 7 neutras). O gêmeo invertido do instrumento dá **7/123**.
2. **A ablação do DoD 3 morde:** com o comparador invertido e rebuild, o `e2e/30` cai para **12/123** e o `e2e/29`
   (que está no gate) cai para `agreement=0`. Nos 3 TFs, o probe de coluna dá `differ` = 100% (§3).
3. **`make verify` VERDE, 8 portões**, com `VERIFY_FORCE=1` e `__pycache__` purgado. A latência fica dentro do teto e
   dentro da faixa da W1 (§5).
4. **Mutações: 16 rodadas, 15 mordem.** A que não morde, `M2b`, é um mutante equivalente (§4).

**O que reprova:** três documentos de "verdade corrente" ainda dizem **"doji = alta"**, e o código entrega o doji
**neutro** (`ADR-010/D-2`). São `docs/MAPA-DOCUMENTAL.md:68`, `PRD-009:194` (`RF-7`) e o plano `02:12`, e o DoD 1 do
plano (`:20`, "reprova 3 dos 4") não pode mais ser cumprido ao pé da letra. O `T-02.1-DOJI` e o
`handoff/T-02.1-doji-julgamento.md:96-99` declararam essa edição e a passaram ao orquestrador, mas **ninguém a
aplicou** (`git diff master...HEAD -- docs/specs docs/plans docs/MAPA-DOCUMENTAL.md` → 0 linhas). Pela doutrina, Doc
delta errado reprova com a mesma prioridade de código quebrado (BLOCKER-1, §7).

## 1. Checklist

```
## QA Gate (Front) — Fase 02: volume com direção (+ T-01.R1)
- [OK]   DoD da fase, item a item (§2), cada um com o comando
- [OK]   Lógica fora do componente: volumeBarColor/directionalVolumeSeriesLossless são puras em charts/volume-direction.ts,
         e formatLegendNumeral é pura em app/symbol/pane-legend.ts. Os dois arquivos têm *.test.ts. SymbolClient só liga
- [OK]   Contrato tipado na borda: tsc --noEmit --strict dentro do lint-frontend, rc=0. Nenhum contrato de rede mudou
         (data-fact continua terminando em `:absent`, e data-legend-raw não muda)
- [OK]   Sem segredo no cliente: portão `regras` com 0 bloqueio. A varredura completa (ndjson) dá 77 avisos, e 0 deles
         cai num dos 78 arquivos do diff
- [OK]   Acessibilidade: e2e/23 e e2e/24 verdes. SF-9 conferido no DOM real: os sr-only dizem "Leitura atual: ausente"
- [OK]   Testes existem, passam e têm o par morde/cala: 1125 de front, 0 fail. 15 de 16 mutações mordem (§4)
- [FAIL] Cobertura do front [NÃO MEDIDO]: não há instrumento, e o plano 02 não declara alvo. Não bloqueia. Back: 96,23%
- [OK]   Sweep de regras: 0 bloqueio (portão `regras`). ⚠ `harness rules --mode sweep --changed-only` dá rc=0 com saída
         vazia, e isso é ambíguo com a árvore limpa. Por isso a prova é a varredura completa cruzada com o diff
- [OK]   make verify verde: 8 portões, e2e 71 passed / 3 skipped (os 2 da W1 em e2e/15, mais o CA-6 do e2e/30 no
         universo fraco)
- [FAIL] Doc delta: "doji = alta" continua em 3 documentos (BLOCKER-1). docs/INDEX.md: 10 linhas acrescentadas e 0
         removidas (append-only, OK)
- [OK]   Rótulos de força: os números do T-02.4-builder que refiz aqui batem na forma (123 contra 124 barras: a janela
         andou). Nenhum [PREMISSA-OWNER] novo no diff
```

## 2. DoD do plano 02, item a item

| DoD | como foi medido | resultado |
|---|---|---|
| 1 Unitário, 4 casos | `node --test 'src/charts/*.test.ts'` (323 pass) e M1 (§4) | os 4 casos existem (`volume-direction.test.ts:33-54`). O comparador invertido (M1) reprova **os casos 1 e 2** e 2 testes de pareamento (4 fails). O doji tem mutante próprio (M2, que reprova o caso 3), e o caso "ausente" tem M4 (caso 4). "3 dos 4" não vale mais ao pé da letra, porque o doji não passa pelo comparador. Esse é o Doc delta do BLOCKER-1, e não um defeito do teste |
| 2 Pixel `CA-6` | `E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1 E2E_BASE_URL=http://127.0.0.1:4345 npx playwright test 30-volume-direction-per-bar-real-data` | **passed**. `universe="FORTE"`, `ohlc_series_history_statuses=[200×4]`, `api_candles_in_window=4162`. `verdict`: compared **123** (up 60, down 56, neutral 7), agreeing **123**. `identityBreaks=0`, `volumeLegendDisagrees=0`. Há as duas direções, então não é inconclusivo. Zoom de 30 passos, 8,64 px por barra, largura 7–8 px |
| 3 Ablação | M1 no app real, com rebuild (§3) | **morde**: `e2e/30` com **12/123** (só os neutros concordam; primeira discordância no slot 5189, esperado `down` e visto `up`). `e2e/29` com `agreement=0`. Revertido, rebuild do HEAD, e de novo 123/123 |
| 4 Não-regressão `klines_volume·1m·SUM` | `e2e/09-volume-dado-real` no universo forte | **passed**: `series_window_reader_present=true`, `volume_api_rows_with_value = volume_dom_present_points = 4147` (> 0) |
| 5 `make verify` + `ux-ui-mastery` | §5, mais `gates/T-02.5-design-review-r2.md:3` e `gates/T-02.2-design-gate.md:526` | verify **VERDE**. Design: `T-02.5` r2 **APPROVED** (63/100, MF-1 fechado) e o gate de escala `T-02.2` **APPROVED** no ciclo 2 `[DOC]` |

**T-01.R1:** o SF-8 foi conferido no pixel real (legendas `73347.056`, `645589.9294`, `acumulado-5981.013`, sem ruído
de ponto flutuante; o `W-6` da W1 fecha). O SF-9 também: os 8 `sr-only` dizem `ausente`. O item (a) já tinha sido
feito em `1ebee50` `[DOC: T-01.R1-builder.md §1]`.

## 3. O app real, com dado real, por TF

**Setup:** proxy GET-only `:8845 → :8000` (modelo `T-01.11-r2-proxy.mjs.txt`), `next build` com
`INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8845` e `next start -p 4345`. O proxy fechou com **672 GETs** (507 de
`/series-history`) e **1 recusa**, que foi o meu `POST` de teste da trava. **Nada foi semeado, e nada foi escrito.**

`tfprobe.mjs` lê o canvas do pane de preço do mesmo jeito que o `e2e/29`. Ele compara, coluna a coluna, a tinta da
barra na linha de base (a linha 10 a partir do piso, acima da faixa de marcas de 10 px) com a tinta da vela acima da
faixa. É o único instrumento aqui que olha TF ≠ `1m`, porque os `e2e/29` e `e2e/30` são só `1m`.

| build | TF | barras up/down/neutro | coluna concorda | discorda | neutro sob vela |
|---|---|---|---|---|---|
| HEAD | 1m | 466/446/98 | 697 | **0** | 55 (doji + coluna mista) |
| HEAD | 5m | 206/193/4 | 399 | **0** | 0 (os 4 neutros não têm vela: `RN-4`) |
| HEAD | 15m | 66/69/0 | 135 | **0** | 0 |
| HEAD | 1h | 17/16/0 | 33 | **0** | 0 |
| HEAD | 4h | 5/4/0 | 9 | **0** | 0 |
| M1 comparador invertido | 1m / 15m / 4h | — | 0 / 0 / 0 | **701 / 135 / 9** | — |
| M5 ligação revertida | 1m / 15m / 4h | todas neutras | 0 | 0 | **761 / 135 / 9** |
| M3 pareamento por posição | 1m / 15m / 4h | — | 697 / 5 / 0 | 0 / 4 / 0 | 55 / **126 / 9** |

**O que a linha M3 mostra (W-1):** parear por posição do array, e não por instante, **não muda nada em `1m`**. Por
isso o `e2e/29` (`agreement=0.9959`) e o `e2e/30` (123/123) **passam com o mutante**. Em `15m` e `4h` o mesmo
mutante apaga a direção (126 de 135 e 9 de 9 neutras). O pareamento por tempo tem, portanto, carga real, e hoje
**só o unitário o protege**: `volume-direction.test.ts:89`, 1 fail sob M3. O unitário morde, mas nenhum e2e do gate
olha TF ≠ `1m`.

## 4. Mutações (16 rodadas, 15 mordem)

Cada mutação foi aplicada com replace literal, medida e revertida com `git checkout --`. Depois de cada uma,
`git status --short` ficou vazio. As unitárias rodaram `node --test 'src/charts/*.test.ts'` mais
`node --conditions=react-server --test 'src/app/**/*.test.ts'`, com base de 909 pass / 0 fail. As de app real rodaram
com rebuild sobre o proxy, seguidas de `e2e/29`, `e2e/30` e do probe.

| # | mutação | reprova | cala |
|---|---|---|---|
| M1 | `close > open` → `close < open` (`volume-direction.ts:58`) | unit: **4 fail** (casos 1 e 2, mais 2 de pareamento) · real: `e2e/30` **12/123**, `e2e/29` **agreement=0**, probe 100% discorda | doji e ausente (não passam pelo comparador) |
| M2 | remove o ramo do doji | unit: **caso 3** e o pareamento. Os 5 testes de fronteira também caem (o `if (false)` quebra o tsc deles) | — |
| M2b | `>` → `>=` (a forma literal do plano) | **não morde: mutante equivalente**. O ramo `===` vem antes, então `>=` e `>` nunca divergem ali | — |
| M3 | pareamento por posição | unit: **1 fail** (`:89`, "never a neighbour's direction") · real: `e2e/29`/`e2e/30` **passam** (W-1) | `1m` |
| M4 | vela ausente → tinta de alta | unit: **3 fail** (caso 4 e 2 de pareamento) | — |
| M5 | ligação de volta a `positiveValueSeriesLossless` | unit: **7 fail** (`volume-subaxis-dom-contract` e os de fronteira) · real: `e2e/30` **12/123**, `e2e/29` **0** | — |
| M6 | `PriceScaleMode.Normal` → `Logarithmic` (`T-02.2`) | unit: **6 fail** (geometria linear, F-3 do pico ≥ 4× a mediana, MORDE dos 7) | — |
| M7 | margem inferior das velas 0,22 → 0,10 (`T-02.5` MF-1) | unit: **8 fail** (`price-volume-band-separation`, as 7 alturas de legenda) | — |
| M7b | não aplicar `PRICE_CANDLE_SCALE_MARGINS` | unit: **6 fail** ("production applies its own candle margins" e os de fronteira) | — |
| M8 | `formatLegendNumeral` → `String(value)` (SF-8) | unit: **2 fail** (`pane-legend.test.ts`, SF-8) | — |
| M9 | `ABSENCE_TOKEN = "SEM_PONTO"` (SF-9) | unit: **11 fail** (microcopy e os 5 `*-dom-contract`) | — |
| M10 | faixa de marcas de volta sobre as barras (top 0,97 → 0,8) | unit: **1 fail** (N-1, as faixas nunca se tocam) | — |

M1, M3 e M5 foram medidos nos dois níveis. Contando cada nível em separado, dá 16 rodadas. M2b é a única que não
morde, e é equivalente por construção.

## 5. `make verify` e latência

`find backend -name __pycache__ -type d -not -path '*/.venv/*' -exec rm -rf {} +`, depois
`VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify` → **rc=0, VERDE**. O log fica em
`/tmp/verify-wave-paineis-f02-20260926T224202Z.log`: lint-backend 474, lint-frontend (ESLint + tsc strict),
test-frontend **1125 pass / 0 fail** em 4 suítes, test **2816 passed** com 96,23%, boundaries 7/0, regras 0 bloqueio
com 77 avisos, política ok, e2e **71 passed / 3 skipped**. Não houve vermelho, nem dentro nem fora da lista de
conhecidos das regras §2.

| medida | W4 (esta rodada) | W1 (`W1-QA-r3`) | teto |
|---|---|---|---|
| `e2e/17` p95 do eixo | **17,5 ms** (p50 16,7, max 33,1, n=86) | 32,7 | 160 |
| `e2e/20` intra-gesto max | **85,6 ms** (p95 49,6, n=316, `over_ceiling_n=0`) | 81,9 (p95 41,2) | 160 |
| `e2e/20` página p95 | **128,2 ms** (n=15) | 83,7 | 400 |

**Não há regressão atribuível.** A página p95 de 128,2 cai dentro da faixa já medida. Nos 40 mais recentes dos 50 logs
`/tmp/verify-*.log` que têm o fato (2026-09-25/26), as rodadas da W1 foram de 70,6 a 114,3, e o `master` foi de 94 a 140,2 (`grep -hoE
'history_page_latency_p95_ms=[0-9.]+'`). É n=1 por lado, e não há atribuição causal `[MEDIDO]`. O intra-gesto 85,6
também está dentro da faixa da W1 (66,9–116,4).

## 6. Não-regressão do fecho da W1

As provas da W1 continuam no gate e verdes: `e2e/16`, `18`, `20`, `22`, `24`, `26` e `27` estão entre os 71 passed.
As 13 mutações da W1 não foram repetidas. O W4 não toca `range-dispatch.ts`, `history-page-window.ts`, `panel-assembly.ts`
nem `[symbol]/page.tsx` (`git diff --stat master...HEAD -- frontend/src`). Em `SymbolClient.tsx` o W4 só muda a
ligação do volume, a escala e as margens do pane de preço, e o `ABSENCE_TOKEN`. O `keepFloor` novo das velas é
coberto por M7/M7b. No app real, o MF-B′ se mantém: a legenda do volume em `4h` lê valor (`6101.346`), não `ausente`.

## 7. Achados

1. **[BLOCKER] Doc delta: "doji = alta" contradiz o código em 3 documentos.** São `docs/MAPA-DOCUMENTAL.md:68`, a
   porta de "verdade corrente", `docs/specs/PRD-009-paineis-de-fluxo.md:194` (`RF-7`, "cor de alta se `close_i ≥
   open_i`") e `docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md:12` e `:20` ("reprova 3 dos 4"). O código
   entrega o doji neutro (`volume-direction.ts:55-57`, pela `ADR-010/D-2`). A precedência está certa, e o design gate
   aceitou (`T-02.5-design-review-r2`). O que falta é o documento. A edição foi declarada em
   `handoff/T-02.1-doji-julgamento.md:96-99` e em `gates/T-02.1-DOJI-builder.md:97-101`, e não foi aplicada.
2. **[WARNING] W-1: o pareamento por instante não tem guarda de e2e em TF ≠ `1m`.** Sob M3, os `e2e/29`/`e2e/30`
   passam, e no app real `15m`/`4h` perdem a direção (§3). Hoje o único guarda é `volume-direction.test.ts:89`, que
   morde. Não bloqueia.
3. **[WARNING] `Q-VOL-2`/`Q-DG-2` respondida, e não anotada.** O gate `T-02.2` decidiu pela escala linear
   (`gates/T-02.2-design-gate.md:526`), mas `SPEC-009:389` ainda diz *"o de hoje"* (log10) como default, e
   `PRD-009:337` a mantém aberta. O `STITCH_CONTEXT.md:224` (`D5.3`, "traço **na linha de base**") ficou "proposta ao
   `ui-designer`" (`T-02.2-builder.md` Doc delta), e a forma mudou (a faixa agora fica abaixo da base).
4. **[WARNING] O `e2e/14:472` reprova no universo forte, e a causa não é o W4.** Recebe 775, espera ≥ 1152.
   `domNativeBars` é **igual** ao fato da API (`long_short_api_native_by_publication=775`), e a premissa do spec
   (*"≥ `ceil(wire/5)`"*) é que o coletor não tem buraco. A linha `:620` não mudou no diff (o W4 só trocou a constante
   `ABSENCE_TOKEN` e o enum das linhas sintéticas). No gate, esse spec é pulado (universo fraco). Classificação `[INFERRED: não rodei o master no
   universo forte]`.
5. **[WARNING] A folga do `e2e/20:995` é fina.** Esta rodada deu 85,6, mas `verify-wave-paineis-f02-20260926T222251Z`
   deu **161,8** (vermelho), e o `master` já deu 159,3. O diagnóstico está em `gates/T-02.5-integracao-e2e20.md`, e
   a saída é do owner (`[DECISÃO-OWNER: 2026-09-22]` sobre o teto).
6. **[WARNING] Comentário obsoleto** em `frontend/src/app/symbol/SymbolClient.tsx:1728` (*"prints `SEM_PONTO` when
   the last instant has nothing"*). Depois do SF-9, ele imprime `ausente`. A docstring da constante (`:1385-1408`)
   tem a correção acrescentada, então não mente.
7. **[WARNING, herdado]** W-4 da W1: `e2e/15` CA-2/CA-4 continuam SKIPPED. O CA-6 do `e2e/30` também é SKIPPED no
   gate, pelo desenho do universo fraco. O guarda do gate para a direção é o `e2e/29` (stub), e ele morde M1 e M5.

## 8. Ações

1. **Orquestrador (ou quem ele despachar em `docs`):** acrescentar a nota datada, apontando para
   `handoff/T-02.1-doji-julgamento.md`, em `docs/MAPA-DOCUMENTAL.md:68`, `PRD-009:194` (`RF-7`) e `:282` (`I-3`), e
   no plano `02:12` e `:20`. No `:20`, o "3 dos 4" vira "2 dos 4 pelo comparador, mais o mutante do doji". A nota vai
   **abaixo** da linha, sem reescrevê-la. Revalidação: `grep -n 'doji = alta' docs/MAPA-DOCUMENTAL.md
   docs/specs/PRD-009-paineis-de-fluxo.md docs/plans/SPEC-009-paineis-de-fluxo/02_volume_com_direcao.md` tem de sair
   só em linha seguida de uma nota de correção.
2. (WARNING) `SPEC-009:389` e `PRD-009:337`: anotar que `Q-VOL-2` foi respondida (linear, `T-02.2-design-gate` §8).
   `STITCH_CONTEXT.md:224`: fica com o `ui-designer`.
3. (WARNING, opcional) um e2e em TF ≠ `1m` com stub, ou um unitário de `web` sobre o par `volume.slots` e
   `panels.price.series.slots` em `15m`, que reprove M3.

## 9. Comandos e instrumentos

- verify: §5. Unitárias base: `cd frontend && node --test 'src/charts/*.test.ts'` (323/0) e
  `node --conditions=react-server --test 'src/app/**/*.test.ts'` (586/0)
- app real: `node proxy.mjs 8845`, depois `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8845 next build` e
  `next start -H 127.0.0.1 -p 4345`. Depois, `E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1
  E2E_BASE_URL=http://127.0.0.1:4345 npx playwright test 30-volume-direction-per-bar-real-data 09-volume-dado-real
  14-long-short 29-volume-direction`, que deu 9 passed e 1 failed (o `e2e/14:472`, achado 4)
- mutações: `umut.sh <tag> <arquivo> <old> <new>` (unitárias) e `emut.sh <tag> <arquivo> <old> <new>` (rebuild,
  `e2e/29` + `e2e/30` + `tfprobe.mjs`, revert). Rodada final `emut.sh HEAD-final` sobre o HEAD sem mutação: 3 passed,
  123/123
- `harness rules --mode sweep --format ndjson` cruzado com `git diff --name-only master...HEAD` (78 arquivos): 0
  achados no diff
- os scripts (`proxy.mjs`, `tfprobe.mjs`, `umut.sh`, `emut.sh`), os fatos (`probe-*.json`, `e2e-*.log`) e os PNGs
  ficam no scratchpad da sessão, **fora do versionamento**, porque são instrumento de QA e não teste
