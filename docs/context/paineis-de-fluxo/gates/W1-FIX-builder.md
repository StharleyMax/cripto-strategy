# W1-FIX — correção dos portões reprovados da wave W1

**Feature:** `paineis-de-fluxo` · **Componente:** `web` (+ `charts`, `docs`) · **Base:** `dd07bc3` (`wave/paineis-f01`) ·
**Data:** 2026-09-26 (UTC) · **Agente:** `frontend-builder` · **Portas:** 8831/4331

Entrada: `gates/W1-QA.md` (NEEDS_FIX), `gates/W1-REVIEW.md` (NON_COMPLIANT), `gates/W1-CODE-REVIEW.md`
(incompleto), `gates/W1-DESIGN-REVIEW.md` (NEEDS_FIX 53/100).

## 1. O que foi corrigido, achado por achado

| achado | correção | prova (mutação que morde) |
|---|---|---|
| **DR MF-A** (sev. 4): soltar o arrasto apagava as 12 h 40 min mais recentes | causa confirmada: o seed de todo TF tem 5.760 slots e o teto era 5.000; `holdRightEdgeCap(false)` corta na **primeira soltura**, sem página nenhuma. `history-page-window.ts::effectiveMaxAccumulatedSlots` = `max(teto, seed + 1 página)` (saída (a) do laudo), ligado em `use-history-pager.ts` | `e2e/27` novo: com o teto cru religado no pager, **`window_end_lost_minutes_0=760`**, 1 failed; com a correção, `0` e `0`, verde `[MEDIDO]`. Unitário: 4 testes novos, e o teto cru reprova 2 |
| **DR MF-B** (sev. 3): em TF ≠ `1m` a legenda dizia `ausente` com a barra desenhada | `charts/legend-reading.ts` ganha `bucketMs`: o slot lido (crosshair ou último fechado) vai para o slot da **abertura** da barra servida, e "último fechado" passa a ser a última **barra** fechada. `SymbolClient` passa `timeframeStepMs(selectedTimeframe)` (novo, `supported-timeframes.ts`) pelo `LegendFrame` | 6 testes novos em `legend-reading.test.ts`. Tirar o encaixe reprova 3. O caso sem `bucketMs` segue medido como o defeito (`MF-B MORDE`) |
| **REVIEW BLOCKER-1**: o registry implementava a (iii) antiga | `pane-registry.ts`: a (iii′) só exige o par de marcas para `FLOW` `histogram`; `FLOW` `line` passa (iii-b); `FLOW` `candlestick` reprova até ser classificado. Teste: o CVD de produção (2 linhas, sem marca) vira **PASSES**, entra **(iii-a) FAILS** com 4 violações, e `validRegistry()` perde `marks("cvd", …)` | tirar a guarda `line`: 14 testes falham (a base válida cai). Pular também `histogram`: 4 falham, incluindo o (iii-a) |
| **QA BLOCKER-1**: `e2e/18` reprovava por relógio | `e2e/18`: na faixa em que as janelas de 1m e 4h coincidem por construção, o teste afirma a identidade (e mantém o access log de +10). No `:153`, se o `knowledgeTimeMs` muda entre as leituras, a volta inteira roda de novo (até 3 vezes) | o predicado em que o teste se apoia está provado exato em `request-window.test.ts`: em 1.440 minutos, identidade ⇔ predicado, **30 minutos** coincidentes, todos em `HH:05–HH:09` com HH ∈ {00,04,…,20} `[MEDIDO]`. ⚠️ O e2e **não** rodou dentro da faixa (a hora atual era 01:26 UTC) `[NÃO MEDIDO]` |
| **QA BLOCKER-2 / REVIEW W-2**: a ADR-044 publicava o falsificador de D2′ julgado falso | `ADR-044` recebeu a §4.1 de `handoff/ADR044-D2P-julgamento.md` palavra por palavra, com nota de CORREÇÃO. `handoff/T-01.10-desenho.md:98` recebeu a §4.2 | `grep -c 'portadora também filtrada ⇒ as lacunas colapsam e os bytes diferem'` nos dois arquivos dá 0 |
| **REVIEW W-1**: a premissa da D3′ foi medida falsa | nota de CORREÇÃO na D3′ que aponta `T-01.10-desenho.md` §7 (169 px), diz o que continua valendo (a (iii-b) como regra de dado), o que caiu (o argumento de geometria) e os donos (`quant-architect` + `design_gate`). O falsificador da D3′ continua **não rodado**, e está declarado assim | — (documento) |
| **REVIEW W-3**: a SPEC-009 §3 dizia "exatamente com os `time` da grade" | emendada para a D2′ (portadora = grade, pane = subconjunto), com a nota de origem | — (documento) |
| teste de contrato `timeframe-bar-dom-contract.test.ts` | a regex exigia o import literal `{ DEFAULT_TIMEFRAME, SUPPORTED_TIMEFRAMES }`. Agora aceita outros nomes do mesmo módulo, e continua exigindo `SUPPORTED_TIMEFRAMES` de `supported-timeframes.ts`. O controle negativo (a lista escrita à mão) ficou igual | — |

## 2. CODE-REVIEW: o candidato do passe parcial é FALSO, e não foi "consertado"

O `W1-CODE-REVIEW.md` §1 levantou uma hipótese: com o ponteiro parado, a legenda leria um slot N posições mais velho
depois de uma página que prepende N. Cheguei a escrever o deslocamento. Depois li o fonte da biblioteca, e ele
**reverteria o bug para o outro lado**: `_sendUpdateToChart` (`lightweight-charts.development.mjs:13331-13341`) termina
em `_internal_recalculateAllPanes()` (`:7155-7158`). Essa função chama `_internal_updateCrosshair()` (`:7107-7115`),
que reposiciona o crosshair na **mesma coordenada de pixel** e dispara `crosshairMoved` com o índice novo
(`:7062-7085`). Isso acontece de forma síncrona, dentro de todo `setData`. O store já recebe o índice certo, e
somar N daria deslocamento duplo. **Revertido. Nenhuma mudança de código por esse candidato** `[DOC: fonte da 5.2.1]`.

O portão de code-review **continua incompleto**: este builder não roda o fork `code-review` (high). O que não foi
coberto está na §3 daquele laudo, e quem o re-despacha é o orquestrador.

## 3. O que NÃO foi feito, e por quê

- **REVIEW W-4** (bandas de marca em `getHeight()`) e **W-5** (o registry de produção): dependem de decisão de
  escopo do orquestrador ou do owner, como o próprio laudo diz (§5). Não mexi.
- **REVIEW W-6** (`hardcoded-url` da atribuição): é ato de política. Segue como aviso.
- **DR SF-8/SF-9/SF-10, E-3/E-4/E-5**: são should-fix ou escalados, anteriores à W1. O SF-9 (`SEM_PONTO` no
  `sr-only`) mexe em texto que e2e existentes leem. Fica para uma task com o próprio gate.
- **O MF-B no app real** não foi medido por Playwright: no universo fraco do `make e2e` a API serve 0 velas, e a
  legenda fica ausente nos dois lados. A prova é unitária. O falsificador do DR (§8, itens 2 e 3) tem de ser rodado
  pelo design gate contra o app real `[NÃO MEDIDO por este builder]`.
- **Playwright MCP**: não existe nesta instalação. O `@playwright/test` versionado roda.

## 4. Comandos

- `make lint-frontend` → eslint + `tsc --noEmit --strict`, rc=0
- `npm --prefix frontend run test:app` → **552** testes antes do ajuste de contrato (1 fail: a regex), depois verde.
  `test:charts` → **312 pass / 0 fail**
- e2e parcial com `scripts/e2e-env.sh up 1 8831 4331` e `playwright test 16- 18- 20- 21- 22- 24- 26- 27-` →
  **18 passed**
- mutação M1 (teto cru no pager) + `playwright test 27-` → **1 failed**, `recuou 760 min`
- mutações unitárias M2/M3a/M3b/M1u: `node --test <arquivo>`, contagens na §1
- `E2E_API_PORT=8831 E2E_NEXT_PORT=4331 make verify` → ver o `verify_log_path` da devolução
