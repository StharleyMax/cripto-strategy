# UNIT-FRONT: análise dos testes unitários do front (pirâmide de testes)

**Data:** 2026-10-03. **Worktree:** `.claude/worktrees/piramide-de-testes`, em `4ae4c00c`. **Escopo:** `frontend/src/**/*.test.ts` sob `node --test`.
**Natureza:** só análise. Nenhum teste foi editado, e toda mutação foi revertida com `git checkout` e `cmp` contra a cópia
(`git status --short frontend` vazio ao fim de cada rodada).
**Estado:** PARCIAL. O portão R6 disparou no turno 150, e o que ficou pendente está na §7.

## 0. O universo, conferido e não herdado

| fato | valor | comando | rótulo |
|---|---:|---|---|
| arquivos de teste | **111**, e não os 112 do BRIEF | `find frontend/src -name '*.test.ts*' \| wc -l` | `[MEDIDO]` |
| testes que rodam | **1.291**, e não os 1.297 do BRIEF (722 app, 353 charts, 105 s1, 111 s3; 0 fail) | `npm --prefix frontend run test:{app,charts,s1,s3}`, linha `ℹ tests` | `[MEDIDO]` |
| chamadas `test()` estáticas | 1.227 (as outras 64 são geradas em laço) | AST, `scratchpad/unit/classify.mjs` | `[MEDIDO]` |
| testes que leem o FONTE (.ts/.tsx/.css) | **216 testes em 41 arquivos**; 41 deles são "MORDE em memória" | idem (taint de `readFileSync`/`readdirSync`, excluindo CSV e `data/`) | `[MEDIDO, heurística AST; ver §4]` |

O BRIEF diz "pelo menos 16 arquivos". São **41**, e a diferença está nos que leem via variável e nos que leem
`page.tsx`/`ChartHost.tsx`/`pane-stack.ts`. O estudo da `estrutura-do-front` (§6.2) contou **26 arquivos / 258 casos** sobre
`SymbolClient.tsx` e **16** sobre `page.tsx` `[DOC: docs/context/estrutura-do-front/gates/FRONTEND-ARCH-estudo.md:446]`. O meu número é por
teste, o dele é por caso de asserção, e não são a mesma unidade.

## 1. Tempo, que é o achado de maior retorno

**Por suíte**, do jeito que o `verify.sh:271` as roda (em sequência; dentro de cada suíte, o `node --test` roda os arquivos em paralelo,
nproc=8) `[MEDIDO: time npm --prefix frontend run test:<s>]`:

| suíte | wall | testes |
|---|---:|---:|
| `test:app` | 19,2 s | 722 |
| `test:charts` | **55,3 s** | 353 |
| `test:s1` | 11,6 s | 105 |
| `test:s3` | 0,5 s | 111 |
| **total** | **86,6 s** | 1.291 |

(O BRIEF mediu 63 s dentro do `make verify`. A diferença é a carga da máquina, e as proporções valem.)

**Por arquivo**, cada um isolado `[MEDIDO: node [--conditions=react-server] --test --test-reporter=tap <f>, 111 arquivos, soma 100 s]`:
os 5 primeiros somam **82,4 s dos 100**:

| arquivo | s | causa (medida no TAP, `duration_ms`) |
|---|---:|---|
| `charts/eslint-boundary.test.ts` | **43,05** | 5 testes × 2 `eslint src` **sobre a árvore inteira** = 10 rodadas de ~4–10 s cada (`:81`, `runEslint()`) |
| `charts/s2-cvd.test.ts` | 13,52 | testes 5, 6 e 7 fazem o parse de aggTrades reais (2,1 + 3,7 + **7,5 s**). O 7 **relê** 08-20 e 08-21 para provar só zero-fill e dia faltante |
| `charts/s2-axis-integration.test.ts` | 9,44 | os testes somam ~0,9 s; **~8,5 s** são o parse de CSV no carregamento do módulo |
| `features/s1-console/fingerprint-sync-boundary.test.ts` | 8,85 | 1 teste, `eslint src` inteiro (`:91`) |
| `features/s1-console/ingest-health-query-http.test.ts` | 7,49 | sobe a rota real e compara o fingerprint TS com o Python, o que é integração legítima |

**O caminho crítico do `test:charts` é o `eslint-boundary`.** Sem ele, a suíte cai de **55,3 s para 15,7 s**; sem ele e sem o
`s2-cvd`, cai para **10,3 s** `[MEDIDO: node --test $(ls src/charts/*.test.ts | grep -v …)]`.

**Segundos removíveis, sem perder nenhuma mordida:**
- `eslint-boundary`: plantar os 10 violadores de uma vez e rodar `eslint <só os plantados>` **uma vez** (o MORDE). O CALA ("a árvore
  real fica verde") é **literalmente** o `npm run lint` que `make lint-frontend` já roda (`package.json:8`, `"lint": "eslint src"`).
  São **~40 s de wall** no `test:charts` `[MEDIDO: 55,3 → 15,7 s com o arquivo fora; o custo da versão reescrita é INFERRED, ~1 rodada de eslint]`.
- `fingerprint-sync-boundary`: o mesmo conserto, ~7 s `[INFERRED da mesma forma]`. Há um defeito a mais, **medido**: o CALA reprova
  por **lint alheio**. A mutação F06 (`typeof window === "undefined"` → `false` em `axis-latency-probe.ts`) o derrubou com
  `ruleId: no-constant-condition`. É um teste de fronteira de import que vira vermelho por uma regra que nada tem a ver com ele.
- `s2-cvd` teste 7: com fixture sintética, ~7,5 s `[MEDIDO: duration_ms 7472]`.
- **Total: ~45–50 s de 86,6 s** `[INFERRED: soma do medido acima; a rodada com os consertos não foi feita, porque esta tarefa não edita teste]`.

⚠️ **Risco de corrida, declarado:** os dois testes de eslint **plantam arquivos em `src/`** (`src/app/_ephemeral-morde-*.ts`,
`src/features/s3-inspector/_ephemeral-*.ts`) e depois rodam `eslint src`. Se rodarem em paralelo, um lê o violador do outro.
Hoje o `verify.sh` roda as suítes em sequência, e é isso que os protege. O commit `cf8fb5db` já registrou "falhas de s1 por corrida com
test:s1 paralelo". Lintar só os arquivos plantados também fecha essa corrida.

## 2. Mutação: o que morde, o que é duplicado e o que é frágil

Rodada 1: **18 mutações**, 14 de defeito (F) e 4 de **refatoração sem mudança de comportamento** (R), contra os 110 arquivos
(fora o `eslint-boundary`), com o veredito por arquivo `[MEDIDO: scratchpad/unit/mutrun.sh + mutations.txt; resultado em mut1/summary.tsv]`.
A linha de base, sem mutação, foi 110/110 verde (38 s, `xargs -P6`).

| id | mutação | arquivos que reprovam |
|---|---|---|
| F01 | `BeyondCoverageBadge.tsx`: "LIMITE DA COBERTURA" → "DE" | `beyond-coverage-badge-dom-contract` |
| F02 | `pane-legend.ts`: `SEM_PONTO: "ausente"` → `"vazio"` | `absence-readout-microcopy`, `chart/legend/pane-legend` |
| **F03** | `AbsenceNote.tsx`: `ABSENCE_TOKEN = "SEM_PONTO"` | **6:** `absence-readout-microcopy` + `cvd`/`liquidation`/`long-short`/`oi`-pane-dom-contract + `volume-subaxis-dom-contract` |
| F04 | `supported-timeframes.ts`: some o 15m | `supported-timeframes`, `timeframe-window` |
| F05 | `pane-registry.ts`: troca oi↔long_short | `pane-registry` |
| F06 | `axis-latency-probe.ts`: guarda de `window` → `false` | `axis-latency-probe`, **`fingerprint-sync-boundary` (lint alheio, §1)** |
| F07 | `slot-coverage.ts`: `null` → `"beyond-coverage"` | `slot-coverage` |
| F08 | `canonical-grid.ts`: `floor` → `round` | `request-window`, `canonical-grid`, `canonical-grid-sha256-proof`, `s2-window` |
| F09 | `ratio-format.ts`: `toFixed(1)` → `(2)` | `ratio-format` |
| F10 | `series-catalog.ts`: `" · grade"` → `" / grade"` | `s3 series-catalog`, `s3 view-model` |
| F11 | `TimeframeBar.tsx`: some `aria-pressed` | `timeframe-bar-dom-contract` |
| F12 | `SymbolClient.tsx`: `oi_freshness` → `oi_fresh` | `oi-pane-dom-contract` |
| F13 | `chart-options.ts`: fundo → `"#000000"` | `chart-construction` |
| F14 | `oi-candle-pane.ts`: `>=` → `>` | `oi-candle-pane` |
| **R01** | `SymbolClient.tsx`: **ordem** das props de `<OiPane>` | **`beyond-coverage-badge-dom-contract`** (falso alarme) |
| **R02** | `SymbolClient.tsx`: renomear a local `oiWallState` | **`beyond-coverage-badge-dom-contract`** (falso alarme) |
| **R03** | `SymbolClient.tsx`: quebra de linha antes de `/>` (o que um prettier faz) | **`beyond-coverage-badge-dom-contract`** (falso alarme) |
| **R04** | `TimeframeBar.tsx`: renomear `handleKeyDown` | **`timeframe-bar-dom-contract`** (falso alarme) |

**Leitura:**
- **14/14 defeitos foram pegos por ≥1 arquivo.** Na amostra não apareceu nenhum teste comportamental surdo. Os comportamentais
  (F04–F10, F13, F14) reprovam onde deveriam, e só ali.
- **4/4 refatorações sem efeito ficaram VERMELHAS.** É a medida da fragilidade: o teste de fonte reprova a **forma** do JSX, não o
  comportamento. Um prettier (R03) basta para quebrar o `beyond-coverage-badge-dom-contract`.
- **F03 é o único duplicado medido de verdade:** o valor `"ausente"` de `ABSENCE_TOKEN` está pinado em **6 arquivos**
  (`EXPECTED_ABSENCE_TOKEN = "ausente"` nos 5 contratos de pane, mais o `absence-readout-microcopy`). Mudar a palavra exige editar 6
  testes, e uma asserção só pega o mesmo defeito. Desde a `T-01.3`, `ABSENCE_TOKEN` é **exportado** de `chart/marks/AbsenceNote.tsx:57`.
  Por isso a forma certa dispensa regex: `assert.equal(ABSENCE_TOKEN, ABSENCE_MICROCOPY[LEGEND_GRID_ABSENCE])`, num lugar só.
  O que se perde ao fundir: nada, porque as 6 cópias afirmam a mesma igualdade.
- F08 derruba 4 arquivos, mas **não** é duplicado: são 4 consumidores diferentes da grade (janela de request, sha256, a grade em si e
  `s2-window`), e cada um tem casos que os outros não têm.

## 3. Testes inúteis: o que encontrei, e o que NÃO chamo de inútil

- **Tautologia:** nenhuma. Varri `assert.ok(true…`, `assert.equal(x, x)` e `typeof … === "function"` e só achei 1 ocorrência, que é código de
  apoio de um proxy (`candle-direction-channel.test.ts:353`) e não asserção `[MEDIDO: grep -rnP]`.
- **Teste da biblioteca, e não do nosso código:** nenhum puro. `axis-fidelity`, `liquidation-pane-geometry` e `candle-direction-channel`
  medem a saída do `lightweight-charts`, mas sobre a **nossa** configuração e os **nossos** dados (whitespace lossless, margens e estilo). O
  controle negativo de cada um (por exemplo `naiveDropGapsLine` em `s2-axis-integration:271`) prova que reprovam o nosso erro.
- **Latency probes** (`axis-latency-probe`, `history-page-latency-probe`, 1 teste cada): parecem vazios, só `doesNotThrow`, mas a F06
  provou que mordem a guarda de `window`. Ficam, porque custam ~0.
- **41 testes de "MORDE em memória"** (`.replace()` sobre o texto do fonte, seguido de reavaliar o predicado do próprio teste). Exemplos:
  `absence-readout-microcopy.test.ts:84`, o "D-1 MORDE: the 7 ways this band dies silently" do
  `long-short-pane-design-contract`. **Pela construção, nenhuma mutação de produção os derruba sozinhos.** Eles reprovam em dois casos: (a) a âncora
  sumiu, e aí o teste principal do mesmo arquivo também reprova (a âncora é a mesma); ou (b) o predicado copiado em linha diverge
  do assert de cima, e isso é mudança no **teste**, não no produto. São **prova de autoria** (mostram, no commit, que o regex morde),
  não teste de regressão. Pelo critério do BRIEF, são **duplicados do teste principal** `[INFERRED: argumento estrutural. A
  confirmação por teste, a rodada 2, não fechou (§7)]`. **O que se perde ao cortá-los:** a garantia, a cada execução, de que o predicado
  ainda rejeita a forma antiga. Essa garantia também cai com o regex inteiro, se ele for reescrito como teste comportamental.
- **Código que só teste usa:** `s2-klines-loader.ts`, `s2-oi-loader.ts`, `s2-fixture-window.ts` e o caminho de parse de aggTrades de
  `s2-cvd.ts` (`accumulateDayIntoTotals`, `assembleCvdDeltas`) **não têm import de produção** (aparecem em `s2-panels.ts` só em
  comentário) `[MEDIDO: grep -rlw <fn> src e2e | grep -v .test.ts]`. Nasceram no spike S2 (`0670c529`, T-05.2, 2026-09-03), quando o
  gráfico lia CSV. Hoje o CVD vem do Coinalyze `[DOC: memória coinalyze-cota-e-cobertura]`. Os testes desses loaders **não são
  inúteis**, porque testam o código que existe, mas custam ~25 s de CPU (s2-cvd + s2-axis-integration + loaders) sobre código fora do
  produto. **Decisão do owner**, não minha: aposentar os loaders (e os testes vão junto) ou mantê-los como harness de dado real.

## 4. Os testes de contrato por grep do fonte

**Classes**, porque nem todo `readFileSync` é o mesmo tipo de teste `[MEDIDO: leitura dos 41 arquivos]`:

| classe | arquivos | veredito | por quê |
|---|---|---|---|
| **âncora de JSX/código** (regex sobre a forma de uma linha) | 20 (os `*-dom-contract`, `long-short-pane-design-contract`, `absence-readout-microcopy`, `liquidation-legend-swatch`, `volume-legend-grid-contract`, `pane-chrome-options`, `unlabeled-tick-format`, parte de `coverage-magnitude`/`pane-legend`/`seed-identity`) | **REESCREVE** | R01–R04 provam o falso alarme; é a classe que a estrutura-do-front quebra |
| **raspagem de constante** (`/const CHART_HEIGHT_PX = (\d+);/` e afins) | 5 (`price-candle`, `candle-direction-channel`, `volume-subaxis-geometry`, `volume-subaxis-tf-invariance`, `price-volume-band-separation`) | **REESCREVE pequeno** | o teste é comportamental (headless real) e só **lê** a constante do texto. Basta `export` + `import`. `pane-stack.ts` já se moveu (T-01.2) e obrigou a re-apontar 2 deles |
| **lint da árvore** (invariante universal) | `data-fact-ascii-key-contract`, `bucket-arithmetic-boundary`, `chart-construction`, `color-tokens`, a pureza de import em `time-axis-controller`/`range-dispatch`/`timeframe-switch` | **MANTÉM** | não há equivalente comportamental para "nenhum arquivo faz X", e a F0 já os alargou para recursão |
| **cross-language** | `supported-timeframes` (lê o `.py` do backend) | **MANTÉM** | é a única guarda da transcrição |
| **estrutura** | `top-level-source-directories`, `eslint-boundary`, `fingerprint-sync-boundary`, `indicators/contract` (tsc) | MANTÉM / REESCREVE (só o custo) | §1 |

**Fragilidade sob a migração, medida no histórico:** os 3 commits de movimento da `estrutura-do-front` tocaram
**15, 20 e 13 arquivos de teste** (T-01.2 `45d9dcbb`, T-01.3 `969914a8`, T-01.4 `d8555c15`) `[MEDIDO: git show --stat <c> -- 'frontend/src/**/*.test.ts']`.
O padrão é a lista `MOVED_OUT_FILES`, **copiada em 9 arquivos**
(`grep -rn '"chrome/page-gutter.ts"' frontend/src` → 9). Cada fatia nova a amplia nos 9. Antes da migração já havia um commit **só
de re-ancoragem** dos regexes: `3dc28885`, "os 10 contratos de fonte re-ancorados na assinatura com axisStep". Os arquivos que mais
mudam no front são exatamente estes: `oi-pane-dom-contract` 19 commits, `long-short-pane-dom-contract` 15, `liquidation-pane-dom-contract` 13,
`volume-subaxis-dom-contract` 12 `[MEDIDO: git log --oneline -- <f> | wc -l]`.

**O que ainda vai quebrar, conforme o plano:** F3 item 3.4 (os regexes de `page.tsx` viram teste de valor, o que já é a direção certa),
F4 4.4 (CVD, 1 arquivo), F5 5.4 (OI, 3), F6 6.4 (liquidação, 2) e F7 7.4 (long/short, 2) `[DOC: docs/plans/SPEC-011-estrutura-do-front/0{3..7}_*.md]`.
**O plano só re-aponta o caminho.** Recomendo que cada fatia **reescreva**, em vez de re-apontar, o contrato do pane que ela move.

**Por que nasceram, e por que a premissa caiu.** Todos repetem a mesma justificativa: *"no component renderer in this suite
(`@testing-library` is not installed), and `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM"*
(`beyond-coverage-badge-dom-contract.test.ts:15-19`). Hoje, porém, **`jsdom` é devDependency** (`package.json`, `"jsdom": "^29.1.1"`,
entrou em `083e1620`, 2026-08-29), e 10 testes já montam o `lightweight-charts` sobre ele (`installGlobals`, `volume-subaxis-geometry.test.ts:43`).
`react-dom` é dependência. ⇒ **Renderizar um pane** com `react-dom/client` + JSDOM e assertar `data-fact`/`aria-*` no DOM é
viável **sem dependência nova** `[INFERRED: nenhum teste do repo faz isso hoje (grep renderToStaticMarkup|createRoot → 0), e o custo
de montar `SymbolClient` inteiro não foi medido. O caminho de menor risco é renderizar o subcomponente (`OiPane`, `BeyondCoverageBadge`,
`TimeframeBar`) com props literais]`.

**O que se perde ao reescrever, e precisa ser mantido de propósito:** (1) o regex prova que a linha está **no** componente montado
(`<OiPane … wallState={oiWallState} />`), e um render do subcomponente isolado não prova a **ligação** em `SymbolClient`. Essa metade
é do e2e, ou de um render do `SymbolClient` com cliente falso. (2) Os negativos ("PricePane **não** tem `wallState`") viram "o render do
preço não tem o badge", que é mais forte. (3) Os pares morde/cala do repositório: cada contrato reescrito precisa do seu controle
negativo, agora por mutação de **prop**, não de texto.

## 5. Vereditos por arquivo

**Totais:** MANTÉM **81** · REESCREVE **28** · FUNDE **2** · CORTA **0**.
Os 28 REESCREVE somam **264 testes**, 185 dos quais leem o fonte. **Nenhum arquivo inteiro sai.** O que sai está **dentro** dos arquivos:
os **41 MORDE em memória** (§3, INFERRED) e **5 das 6 cópias** do pino `ABSENCE_TOKEN` (F03, medido).

| arquivo | s (isolado) | testes | leem fonte | MORDE em memória | veredito | por quê / medida |
|---|---:|---:|---:|---:|---|---|
| `charts/eslint-boundary.test.ts` | 43,05 | 5 | 1 | 0 | **REESCREVE** | 10 `eslint src` inteiros (4 s cada); MORDE só nos arquivos plantados, numa rodada; o CALA é o `make lint-frontend` |
| `charts/s2-cvd.test.ts` | 13,52 | 8 | 0 | 0 | **REESCREVE** | o teste 7 relê 3 dias de aggTrades (7,5 s) para provar zero-fill; fixture sintética prova o mesmo |
| `charts/s2-axis-integration.test.ts` | 9,44 | 4 | 0 | 0 | **FUNDE** | mesma metodologia de `app/symbol/axis-fidelity.test.ts` (o próprio cabeçalho diz); 8 s de parse de CSV por loaders que só teste usa |
| `features/s1-console/fingerprint-sync-boundary.test.ts` | 8,85 | 1 | 0 | 0 | **REESCREVE** | mesmo padrão (`eslint src` inteiro); F06 provou que reprova por lint ALHEIO (`no-constant-condition`) |
| `features/s1-console/ingest-health-query-http.test.ts` | 7,49 | 10 | 0 | 0 | **MANTÉM** | 7,5 s; fingerprint TS == Python sobre a rota real (integração entre linguagens), fica |
| `charts/liquidation-pane-geometry.test.ts` | 3,95 | 14 | 0 | 0 | **MANTÉM** | 3,9 s; 4 testes contra o lightweight-charts headless (geometria real) |
| `app/symbol/indicators/contract.test.ts` | 3,33 | 4 | 0 | 0 | **MANTÉM** | 3,3 s de `tsc`; prova de tipo (morde/cala), não tem substituto em runtime |
| `app/symbol/candle-direction-channel.test.ts` | 2,84 | 7 | 7 | 1 | **REESCREVE** | pequeno: raspa `CHART_HEIGHT_PX`, o mesmo do price-candle; o resto é headless real |
| `app/symbol/price-volume-band-separation.test.ts` | 2,42 | 11 | 5 | 0 | **REESCREVE** | pequeno: raspa as margens `{ top, bottom }` |
| `app/symbol/chart/axis/axis-sync-alignment.test.ts` | 2,04 | 2 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/volume-subaxis-geometry.test.ts` | 1,82 | 9 | 8 | 0 | **REESCREVE** | pequeno: `productionNumber()` raspa constantes de SymbolClient.tsx |
| `charts/mark-band-geometry.test.ts` | 1,47 | 13 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/indicator-isolation-rule.test.ts` | 1,39 | 5 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/price-candle.test.ts` | 1,32 | 11 | 4 | 0 | **REESCREVE** | pequeno: raspa `CHART_HEIGHT_PX` do fonte; exportar e importar a constante |
| `app/symbol/volume-subaxis-tf-invariance.test.ts` | 1,28 | 5 | 4 | 0 | **REESCREVE** | pequeno: a mesma raspagem |
| `app/symbol/axis-fidelity.test.ts` | 1,06 | 1 | 0 | 0 | **FUNDE** | par de `charts/s2-axis-integration.test.ts`; fica o que tiver o controle negativo |
| `app/symbol/pane-scale-isolation.test.ts` | 1,05 | 4 | 1 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/unlabeled-tick-format.test.ts` | 1,01 | 2 | 1 | 0 | **REESCREVE** | 1 de 2 por regex de `barStyle` em SymbolClient.tsx |
| `app/symbol/absence-readout-microcopy.test.ts` | 0,92 | 4 | 4 | 2 | **REESCREVE** | F02 e F03 o reprovam; `ABSENCE_TOKEN` já é exportado de `AbsenceNote.tsx`, então basta um import, sem regex |
| `app/symbol/chart/history/request-window.test.ts` | 0,89 | 12 | 0 | 0 | **MANTÉM** | F08 |
| `app/symbol/chart/axis/timeframe-window.test.ts` | 0,84 | 14 | 0 | 0 | **MANTÉM** | F04 |
| `app/symbol/chart/history/history-page-window.test.ts` | 0,83 | 14 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/oi-series-selector.test.ts` | 0,82 | 13 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/chart/axis/axis-sync.test.ts` | 0,80 | 26 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/chart-construction.test.ts` | 0,80 | 9 | 3 | 0 | **MANTÉM** | F13 o reprova; varre todo `createChart` da árvore; os MORDE são comportamentais |
| `app/symbol/view-model.test.ts` | 0,79 | 24 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/liquidation-series-selector.test.ts` | 0,79 | 15 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/headless-chart.test.ts` | 0,78 | 4 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/slot-coverage.test.ts` | 0,77 | 21 | 0 | 0 | **MANTÉM** | F07 |
| `app/symbol/liquidation-pane-dom-contract.test.ts` | 0,77 | 13 | 13 | 2 | **REESCREVE** | 13 commits; pina ABSENCE_TOKEN (F03 x6); 27 replaces em memória |
| `app/symbol/host-series-feed.test.ts` | 0,77 | 9 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/chart/legend/pane-legend.test.ts` | 0,76 | 25 | 6 | 2 | **REESCREVE** | 6 de 25 leem 17 arquivos de fonte; F02 o reprova junto com absence-readout |
| `app/symbol/pane-registry.test.ts` | 0,75 | 36 | 1 | 0 | **MANTÉM** | F05; 1 de 36 testes lê o fonte |
| `app/symbol/oi-regime-marks.test.ts` | 0,75 | 20 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/oi-candle-pane.test.ts` | 0,75 | 15 | 0 | 0 | **MANTÉM** | F14 |
| `app/symbol/oi-regime-primitive.test.ts` | 0,73 | 8 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/long-short-series-selector.test.ts` | 0,73 | 10 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/cvd-series-selector.test.ts` | 0,72 | 4 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/panel-assembly.test.ts` | 0,70 | 13 | 1 | 0 | **MANTÉM** | 1 de 12 é regex sobre page.tsx (plano F3 item 3.4) |
| `app/symbol/pane-chrome-options.test.ts` | 0,70 | 4 | 2 | 1 | **REESCREVE** | 2 de 4 por regex (o rodapé de atribuição) |
| `app/symbol/liquidation-pane-form.test.ts` | 0,70 | 3 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/interval-reduction-shape.test.ts` | 0,70 | 6 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s3-inspector/series-catalog-query.test.ts` | 0,28 | 45 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-panels.test.ts` | 0,27 | 3 | 0 | 0 | **MANTÉM** | idem: usa os loaders de CSV, que só os testes usam |
| `features/s1-console/collector-status-query.test.ts` | 0,25 | 38 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/chart/history/series-history-client.test.ts` | 0,25 | 10 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s3-inspector/series-quarantine-query.test.ts` | 0,24 | 26 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/canonical-grid-sha256-proof.test.ts` | 0,23 | 6 | 0 | 0 | **MANTÉM** | F08; usa CSV real de klines |
| `app/history-transport.test.ts` | 0,22 | 31 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s1-console/ingest-health-query.test.ts` | 0,21 | 23 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/color-contrast.test.ts` | 0,21 | 23 | 5 | 0 | **MANTÉM** | lê o globals.css (valores de token), o que é dado do CSS e não forma de código |
| `features/s3-inspector/view-model.test.ts` | 0,19 | 15 | 0 | 0 | **MANTÉM** | F10 |
| `charts/time-axis-controller.test.ts` | 0,19 | 34 | 1 | 1 | **MANTÉM** | 1 de 34 lê o fonte (pureza de import) |
| `charts/s2-lightweight-adapter.test.ts` | 0,19 | 9 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-absence-policy.test.ts` | 0,19 | 10 | 0 | 0 | **MANTÉM** | o REAL FIXTURE passa pelos loaders que só os testes usam |
| `app/symbol/bucket-arithmetic-boundary.test.ts` | 0,19 | 6 | 3 | 0 | **MANTÉM** | lint da árvore (aritmética de bucket proibida fora do dono); a F0 o tornou recursivo |
| `features/s1-console/view-model.test.ts` | 0,18 | 15 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-window.test.ts` | 0,18 | 13 | 0 | 0 | **MANTÉM** | F08 |
| `charts/pane-stack-layout.test.ts` | 0,18 | 16 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/universe-at.test.ts` | 0,18 | 19 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s1-console/domain.test.ts` | 0,17 | 12 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/volume-direction.test.ts` | 0,17 | 9 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-swing-point.test.ts` | 0,17 | 12 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-review-mode.test.ts` | 0,17 | 16 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-pointer-mode.test.ts` | 0,17 | 14 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-badge.test.ts` | 0,17 | 17 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/color-tokens.test.ts` | 0,17 | 8 | 4 | 0 | **MANTÉM** | 4 de 8 leem color-tokens.ts e index.ts (lint de literal hex) |
| `charts/canonical-grid.test.ts` | 0,17 | 13 | 0 | 0 | **MANTÉM** | F08 |
| `app/threshold-spec-bundle.test.ts` | 0,17 | 28 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/volume-subaxis-dom-contract.test.ts` | 0,17 | 13 | 13 | 3 | **REESCREVE** | 12 commits; pina ABSENCE_TOKEN (F03 x6) |
| `app/symbol/ratio-format.test.ts` | 0,17 | 5 | 0 | 0 | **MANTÉM** | F09 |
| `app/symbol/chart/history/browser-series-history-client.test.ts` | 0,17 | 6 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s1-console/sha256.test.ts` | 0,16 | 6 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/timeframe-switch.test.ts` | 0,16 | 6 | 1 | 0 | **MANTÉM** | 1 de 6 lê o fonte |
| `charts/s2-scalar-grid.test.ts` | 0,16 | 4 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-oi-loader.test.ts` | 0,16 | 5 | 0 | 0 | **MANTÉM** | idem: o loader só é usado por teste |
| `charts/range-dispatch.test.ts` | 0,16 | 16 | 1 | 1 | **MANTÉM** | 1 de 16 lê o fonte |
| `charts/axis-fidelity.test.ts` | 0,16 | 9 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/liquidation-legend-swatch.test.ts` | 0,16 | 7 | 4 | 1 | **REESCREVE** | 4 de 7 testes leem o fonte; a lista MOVED_OUT_FILES aparece copiada em 9 arquivos |
| `app/symbol/data-fact-ascii-key-contract.test.ts` | 0,16 | 6 | 6 | 2 | **MANTÉM** | lê o fonte, mas como lint da árvore inteira (invariante universal; a F0 o alargou); sem equivalente comportamental |
| `app/symbol/cvd-pane-dom-contract.test.ts` | 0,16 | 11 | 11 | 1 | **REESCREVE** | 9 commits, 3 deles só da estrutura-do-front; pina ABSENCE_TOKEN (F03 x6) |
| `app/symbol/chrome/timeframe-bar-dom-contract.test.ts` | 0,16 | 12 | 11 | 3 | **REESCREVE** | R04 (renomear `handleKeyDown`) o reprova; 3 MORDE em memória |
| `app/knowledge-time-bundle.test.ts` | 0,16 | 13 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `features/s3-inspector/series-catalog.test.ts` | 0,15 | 11 | 0 | 0 | **MANTÉM** | F10 |
| `features/s3-inspector/domain.test.ts` | 0,15 | 9 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/sparse-series-feed.test.ts` | 0,15 | 6 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-price-source.test.ts` | 0,15 | 3 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-klines-loader.test.ts` | 0,15 | 3 | 0 | 0 | **MANTÉM** | o loader só é usado por teste (nenhum import de produção); fica enquanto o owner mantiver o loader |
| `charts/legend-reading.test.ts` | 0,15 | 31 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/top-level-source-directories.test.ts` | 0,15 | 4 | 1 | 0 | **MANTÉM** | guarda de estrutura (readdir), legítima |
| `app/symbol/volume-legend-grid-contract.test.ts` | 0,15 | 4 | 4 | 1 | **REESCREVE** | 4 testes, todos regex sobre 3 fontes |
| `app/symbol/oi-pane-dom-contract.test.ts` | 0,15 | 12 | 12 | 4 | **REESCREVE** | 19 commits; pina ABSENCE_TOKEN (F03 x6); 11 mutações em memória |
| `app/symbol/coverage-magnitude.test.ts` | 0,15 | 25 | 6 | 2 | **REESCREVE** | 6 de 25 testes leem o fonte (e carregam a lista MOVED_OUT_FILES); os outros 19 são de função pura |
| `app/symbol/chart/axis/supported-timeframes.test.ts` | 0,15 | 7 | 3 | 0 | **MANTÉM** | F04; lê o .py do backend para conferir a transcrição entre linguagens, o que não tem substituto sem geração de código |
| `app/symbol/axis-latency-probe.test.ts` | 0,15 | 1 | 0 | 0 | **MANTÉM** | F06 o reprova (guarda de `window`); custa ~0 |
| `features/s3-inspector/quarantine.test.ts` | 0,14 | 5 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-asof-frame.test.ts` | 0,14 | 11 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-annotation-price-binding.test.ts` | 0,14 | 5 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/seed-identity.test.ts` | 0,14 | 7 | 1 | 0 | **REESCREVE** | 1 de 7 é regex sobre page.tsx (plano F3 item 3.4 já o converte) |
| `app/symbol/oi-candles-envelope.test.ts` | 0,14 | 4 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/oi-candle-dom-contract.test.ts` | 0,14 | 7 | 7 | 1 | **REESCREVE** | regex de JSX; 16 replaces em memória |
| `app/symbol/long-short-pane-design-contract.test.ts` | 0,14 | 25 | 25 | 5 | **REESCREVE** | 25 testes, todos de fonte; a11y (aria-hidden, focus) vira asserção de DOM renderizado |
| `app/symbol/history-page-latency-probe.test.ts` | 0,14 | 1 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/beyond-coverage-badge-dom-contract.test.ts` | 0,14 | 9 | 9 | 3 | **REESCREVE** | R01, R02 e R03 (refatoração sem mudança de comportamento) o reprovam |
| `app/live-transport.test.ts` | 0,14 | 26 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `charts/s2-annotation-identity.test.ts` | 0,13 | 3 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/price-pane-dom-contract.test.ts` | 0,13 | 9 | 9 | 1 | **REESCREVE** | regex de JSX em SymbolClient.tsx e page.tsx |
| `app/symbol/oi-regime-dom-contract.test.ts` | 0,13 | 6 | 6 | 1 | **REESCREVE** | regex de JSX; 15 replaces em memória |
| `app/symbol/long-short-pane-dom-contract.test.ts` | 0,13 | 11 | 11 | 3 | **REESCREVE** | 15 commits; pina ABSENCE_TOKEN (F03 x6) |
| `app/symbol/long-short-band.test.ts` | 0,13 | 17 | 0 | 0 | **MANTÉM** | comportamental puro, fora da amostra de mutação |
| `app/symbol/chart/host/chart-host-dom-contract.test.ts` | 0,13 | 1 | 1 | 0 | **REESCREVE** | 1 teste, regex sobre ChartHost.tsx (nasceu na própria T-01.2) |

`s` = segundos com o arquivo rodando sozinho (inclui ~0,2 s de boot do node). "leem fonte" e "MORDE em memória" saem da heurística AST,
por teste. Os REESCREVE marcados "pequeno" são de 1 linha de produção (`export`) e 1 `import` no teste.

## 6. Recomendação, em ordem de retorno sobre custo

1. **`eslint-boundary` e `fingerprint-sync-boundary`:** lintar só os plantados, numa rodada, e deixar o CALA para o `make lint-frontend`.
   Ganho de **~45 s de 86** no portão, sem perder nenhuma mordida, e a corrida e o falso vermelho por lint alheio somem.
2. **`s2-cvd` teste 7:** fixture sintética, ~7,5 s.
3. **O pino `ABSENCE_TOKEN`:** um import e um assert, no lugar de 6 regex.
4. **Raspagem de constante (5 arquivos):** `export` + `import`, e eles deixam de quebrar com movimento.
5. **Contratos de âncora (20 arquivos):** reescrever **na fatia da estrutura-do-front que move o pane**, renderizando o subcomponente
   sobre o JSDOM que já existe. Pedir ao `frontend-architect` uma ADR curta do padrão (renderizador, `installGlobals`, e onde mora o
   morde/cala), porque é padrão novo de teste.
6. **Os 41 MORDE em memória:** cortar junto com a reescrita do regex que eles defendem, e não antes. Hoje são a única prova de que
   aquele regex morde.
7. **Loaders de CSV que só teste usa:** decisão do owner (§3).

## 7. Pendente (o portão R6 parou a tarefa aqui)

- **Rodada 2, por TESTE e não por arquivo**, para confirmar §3 (os MORDE em memória só reprovam junto com o principal) e para nomear os
  testes exatos que R01–R04 derrubam. O runner (`scratchpad/unit/mutrun2.sh`) e as 12 mutações (`mutations2.txt`) estão prontos.
  A rodada devolveu 0 em todas por um **erro meu de caminho**: a coluna 1 de `classes.tsv` já tem `src/`, e eu prefixei de novo.
  Corrigir para `FILES=$(awk -F'\t' '$2!="BEHAV"{print $1}' classes.tsv | sort -u | grep -v eslint-boundary)` e rodar de novo.
  Scratchpad: `/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/a6300abb-51da-44af-9f16-e5a540b2363f/scratchpad/unit/`.
- O par FUNDE (`axis-fidelity` × `s2-axis-integration`) é `[INFERRED]` pelo cabeçalho e não foi provado por mutação. A mutação que o
  decide: em `s2-lightweight-adapter.ts`, fazer `lineSeriesLossless` descartar o whitespace e ver se só um dos dois reprova.
- Não medi a cobertura de linha do front (não há instrumento no portão), nem a sobreposição unitário × e2e, que é do relatório
  `E2E-analise.md`.
