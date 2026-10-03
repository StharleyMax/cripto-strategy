# E2E: análise da pirâmide (2026-10-03)

**Estado: CONSOLIDADO, só análise.** Os 42 specs têm veredito. Os vereditos de 35 e 38 e as seções §0–§1 vêm do parcial
salvo antes desta consolidação. Os outros 40 vêm de 4 subagentes `Explore`, um por lote (01–11, 12–21, 22–31 e 32–42 sem 35/38),
e o texto de cada um foi transcrito **na íntegra** em §3. Nenhum teste foi rodado, editado ou movido.

**Rótulos.** Todo tempo por spec é a soma das linhas `✓` do log de referência `[MEDIDO]`. Todo ganho é `[INFERIDO]`. Nos textos
transcritos dos lotes, `[ESTIMADO]` e `[NÃO MEDIDO]` valem `[INFERIDO]`, e um número de ganho sem rótulo também é `[INFERIDO]`.

**De onde veio o texto dos lotes.** O último texto do assistant em cada transcript de subagente
(`~/.claude/projects/…/a6300abb-…/subagents/agent-{a3017aa1db3ef81d9,aeda7d20837d27b75,a332e17baf941cc72,a5001efc233101ea7}.jsonl`),
extraído com `python3` e quebrado em `### NN-`. O 11 aparece uma vez só, com o texto do lote 01–11. O 35 e o 38 aparecem uma vez
só, com o texto do parcial.

## 0. Os números de partida, refeitos

Comando: `grep -E '^\s+(✓|✘|-) +[0-9]+ \[chromium\]' verify-base-piramide.log`, e a soma por arquivo com a unidade `ms|s|m`
convertida (script em `scratchpad/e2e-lines.txt`). Universo: 141 linhas, sendo 127 passed e 14 skipped.

- **A soma dos testes dá 550,9 s, e não 491 s** `[MEDIDO]`. O 38 dá **187,6 s** e não 157 s: duas linhas dele saem em minutos
  (`1.2m` em `:1262` e `1.3m` em `:1266`), e um parser que só lê `s` erra essa conta. O arredondamento de `0.1m` deixa ±6 s por linha.
- O 35 e o 38 somam 248,9 s, **45 % de 550,9 s** `[MEDIDO]`, o que confirma a ordem de grandeza do BRIEF.
- O Playwright mede `127 passed (9.6m)`, ou seja 573–579 s `[MEDIDO]`. Em n=10 logs `/tmp/verify-*.log` de 2026-10-03, o mesmo
  número variou de 9,4 a 10,0 m `[MEDIDO: grep -oE '[0-9]+ passed \([0-9.]+m\)']`.

## 1. Os quatro caminhos do tempo

### 1.1 Por que o 38 (187,6 s) e o 35 (61,3 s) custam tanto

**38.** O custo não vem da subida da página. Vem do **instrumento**: cada balde é identificado por varredura serial do crosshair,
com um `page.mouse.move` mais um `page.evaluate` que espera 2 `requestAnimationFrame` (`readLegend`, `:482`), a cada `b/3` px,
**ida e volta** (`auditView`, `:708-740`).

- Pelos facts do log (`spacingPx`, `buckets`) `[MEDIDO]`, cada auditoria custa cerca de `6·(baldes+4)` leituras de legenda: ~140 na vista
  de fase, ~444 na do buraco e ~730 na da captura.
- Cada auditoria de fase acrescenta **65 `getImageData` do canvas inteiro**, um por px de deslocamento (`phase_scan steps 65`).
- Somando os três testes: CA-7 tem ~1.314 leituras (72 s), DoD-6 tem ~1.314 mais uma montagem a mais (78 s), e E5 tem ~540 (37,6 s).
  Isso dá **~50–70 ms por leitura** `[INFERRED: tempo/leituras]`.
- **A fase é medida 3 vezes, com resultado idêntico**: `spacing 65.9`, fase `−1` nas três `[MEDIDO: facts gate*_phase]`.
- **A volta da varredura serve para medir o atraso da legenda, e o atraso deu `lagPx=0` nas 6 vistas** `[MEDIDO: facts gate*_view_*]`.

**35.** São 4 testes de gate a ~15 s cada. Cada um paga `openSymbol` (goto, `anchored` e `waitForTimeout(1000)`, `:471`), o
`showView` e uma varredura de ~59 baldes × 4 passos, ou seja ~240 leituras de legenda (`auditPane`, `:701-720`). Três desses testes
são ablações e repetem a varredura inteira só para provar **uma** rejeição.

### 1.2 Subida de ambiente

O portão leva 587 s, contra 573–579 s do Playwright. Sobram **~8–14 s de `e2e-env.sh`**: o `next build` leva **9,8 s**
`[MEDIDO: .next/trace da worktree wave-estrutura-f02, span next-build]`, e as esperas de API e de `next start` levam 0,9 s
`[MEDIDO: linhas "pronto:" do log]`.

O Playwright gasta mais **~25 s** de overhead entre testes, para criar contexto e página (576 − 551) `[INFERRED]`.

Há ainda **25 chamadas de `startSecondaryNextInstance`** em 21 specs `[MEDIDO: grep -c]`. Elas ficam dentro do tempo dos testes e
custam **≤ ~1,5 s cada** `[INFERRED: o 28 inteiro, com instância secundária e render, leva 2,4 s]`, o que dá ≤ ~40 s no total
`[NÃO MEDIDO por boot]`.

⇒ **A subida de ambiente é ~2 % do portão. Não é ali que está o tempo.**

### 1.3 Mais de um worker cabe em 15 GB com swap cheio?

Agora: `free -m` mostra **5.047 MB disponíveis e o swap em 4.753/5.072 MB**, com 8 CPUs `[MEDIDO 2026-10-03]`. A RSS por worker
(Chromium a 1600×1300 mais as instâncias Next secundárias) **não foi medida**. A estimativa é de 0,5–1 GB por worker `[NÃO MEDIDO]`.

Três bloqueios independentes de RAM:

1. **Os specs com teto de latência** (17, 20, 21, 25 e 40: 60,7 s somados) reprovam por contenção do host. A T-00.4 mediu stall de
   I/O por swap e de CPU por contenção (`T-00.4-build.md` na branch `task/T-00.E2E`, §r4/r20).
2. **O 01 e o 02 contam incrementos no `api.log` compartilhado** (`helpers.ts`, `E2E_API_LOG_PATH`). Um segundo worker infla a contagem.
3. **Com o swap a ~94 %**, qualquer pico de memória vira o stall de I/O já documentado.

**Hipótese** `[NÃO MEDIDO]`: um projeto serial para {01, 02, 17, 20, 21, 25, 40} e 2 workers para o resto daria ~60 s + (551 − 61)/2
≈ **~305 s**, contra 551 s, se não houver inflação por contenção. Neste host a inflação é provável. **Mede-se antes de adotar.**

### 1.4 O que sai do e2e para outra camada

**Achado estrutural** `[MEDIDO: grep -rlE 'renderToString|createRoot|@testing-library' src --include='*.test.ts']`:
**nenhum teste unitário renderiza um componente React.** Os 10 `*-dom-contract.test.ts` são greps de fonte (`readFileSync` em
todos os 10, e `render=0`). Falta a camada de componente: jsdom já é dependência, mas não há Testing Library nem render de hook.
Por isso o e2e carrega:

- **o fiação de hook**: o E5 do 38 só existe porque `use-history-pager.ts` não tem teste de comportamento. A mutação que ele pega é
  passar `EMPTY_OI_CANDLE_BUNDLE` no lugar da página antiga (commit `a0734b98`), e a única cobertura unitária é `mergeOlderOiCandles`,
  em `oi-candle-pane.test.ts`;
- **a legenda e os atributos DOM**: o D2-bis do 38, o CA-9′(b)(c) do 35 e boa parte dos specs `*-dado-real`.

## 2. Tabela-resumo

O veredito é o **final**, já com os conflitos de §5 resolvidos. Onde ele difere do que o lote escreveu, a linha diz qual conflito
mudou o veredito. Uma fusão **dentro do próprio arquivo** conta como FICA (enxugado), porque o spec sobrevive. Os lotes 22–31 e
32–42 não seguiram a mesma convenção, e aqui ela foi uniformizada.

| spec | s medidos `[MEDIDO]` | veredito | destino | ganho est. (s) `[INFERIDO]` |
|---|---:|---|---|---:|
| 01-console-carrega | 2,2 | FICA | anfitrião das fusões de 02/04/05/06/07 | 0 |
| 02-rede-e-estados | 14,1 | FUNDE | B2 → 01-B1; B6: stub atrasa só `/collector-status`; B1/B3–B5 ficam | ~5 |
| 03-rotas | 3,1 | FICA | — | 0 |
| 04-interacoes | 2,1 | FUNDE | t2 → 01-t1; t1 fica | ~0,7 |
| 05-a11y | 3,0 | FUNDE | t2 → 01-t1; axe fica | ~1,0 |
| 06-viewport | 1,9 | FUNDE | 1280 → 01-t1; 390 fica | ~0,7 |
| 07-locale | 2,8 | FUNDE | D3.5 + ambiente → 01-t1; D3.4 fica | ~1,7 |
| 08-symbol-dado-real | 2,8 | FUNDE | → 09 (anfitrião único de `/symbol`, §5 C-1); t1 desce (já coberto) | ~2,8 |
| 09-volume-dado-real | 0,9 | FICA | **anfitrião único** do goto padrão de `/symbol` (§5 C-1) | 0 |
| 10-cvd-dado-real | 0,9 | FUNDE | t2 → goto do 09 | ~0,9 |
| 11-canvas-fundo | 0,7 | FICA | não fundir: é o spec que sempre roda (`scope-map.tsv`) | 0 |
| 12-oi-dado-real | 0,9 | FUNDE *(lote: FICA anfitrião; muda por §5 C-1)* | teste de página → 09; os 2 sem browser ficam | ~0,9 |
| 13-liquidacoes-dado-real | 2,9 | FUNDE | t2 → **35** (§5 C-2); t3 → 09; M-2 CORTA, a cobertura ≤1px vai para o 23 | ~2,8 |
| 14-long-short-dado-real | 2,4 | FUNDE | principal → 09; os 2 C-1 do portão DESCEM | ~2,4 |
| 15-vela-e-ablacao | 0,6 | FICA | CA-0 desce; CA-3 → 09, **não** para dentro do CA-2 (§5 C-6) | ~0,6 |
| 16-eixo-unico-pan-e-ablacao | 10,0 | DESCE | t2 → `axis-sync.test.ts`; o write-count e o settle do t1 → **27** (§5 C-3) | ~9 |
| 17-teto-latencia-eixo | 5,1 | FUNDE | → 20 (arrasto contínuo antes do pré-arrasto) | ~3 |
| 18-tf-refetch-e-ablacao | 5,0 | FICA (enxugado) *(lote: FUNDE interno)* | 1+2 dentro do 3; anfitrião do 26 | ~2 |
| 19-oi-provenance-ablacao-e-ascii | 5,5 | FUNDE | CA-9/DoD-3/DoD-4 → 09; **CA-10 fica no 19** (§5 C-4) | ~2,5 *(lote: ~4)* |
| 20-teto-latencia-historia-sob-demanda | 24,2 | FICA | anfitrião do 17 e do 22 (§5 C-5) | 0 |
| 21-arrasto-historia-parede-e-ablacao | 8,1 | DESCE | no universo fraco, decidir `readerPresent` antes dos arrastos; o forte fica opt-in | ~7,5 |
| 22-single-host-survives-paging | 19,9 | FUNDE | → 20: `data-chart-mount-count == 1` hard no fim | ~19,9 *(contado só aqui)* |
| 23-pane-layer | 3,7 | FICA | recebe a cobertura ≤1px do M-2 do 13 | 0 |
| 24-single-chart-axis-and-legend | 30,1 | FICA (enxugado) | CA-5 desce; CA-1′, CA-2′ e T-01.11-FIX numa montagem | ~14 |
| 25-sparse-feed-pixel-identity | 6,1 | FICA | — | 0 |
| 26-tf-click-swaps-drawn-grid | 3,4 | FUNDE | → 18 (tag antes/depois no clique 4h, mais um clique 5m) | ~2 |
| 27-drag-keeps-right-edge | 5,9 | FICA *(lote: FUNDE → 16; muda por §5 C-3)* | anfitrião do write-count e do settle do 16 | 0 *(lote: ~5)* |
| 28-volume-linear-scale-pixel | 2,4 | FICA | as asserções DOM L291-295 descem | 0 |
| 29-volume-direction-wiring-pixel | 4,0 | FICA | — | 0 |
| 30-volume-direction-per-bar-real-data | 0,0 | FICA | — (skip depois da montagem, §6.1) | 0 |
| 31-liquidation-pane-pixel | 1,6 | CORTA | coberto por `liquidation-pane-geometry.test.ts` + 35/34 (§5 C-7) | 1,6 |
| 32-liquidation-fused-pane-sides | 6,4 | FUNDE | → 35 (`wrongSide === 0` no canvas inteiro) | ~6,4 |
| 33-liquidation-legend-two-magnitudes | 22,5 | FICA (corte parcial) | (d)+(e) CORTA, coberto pelo 35 CA-9′ (§5 C-8) | ~10 |
| 34-liquidation-linear-scale-pixel | 10,8 | FICA (descida parcial) | t2 (log10) desce para o headless (§5 C-7) | ~3,6 |
| 35-liquidation-acceptance-per-bucket | 61,3 | FICA (enxugado) | anfitrião de 32 e 13-t2; ablações varrem ~20 baldes | ~25–30 |
| 36-oi-candle-pixel-and-ablation | 12,1 | CORTA | coberto pelo 38 (§5 C-9) | ~12,1 |
| 37-oi-regime-marks-pixel | 21,6 | FICA (descida parcial) | RM-5 desce | ~5 |
| 38-oi-candle-acceptance-per-bucket | 187,6 | FICA (enxugado) | fase medida 1×; varredura só de ida, com sonda de atraso | ~90–110 |
| 39-axis-step-per-timeframe | 7,1 | FICA (enxugado) | o caso 4h do laço absorve a checagem de montagem do teste de roda | ~2 |
| 40-coverage-magnitude-and-legend-room | 17,2 | FICA (descida parcial) | "A-2 + A-1" e "A-3" descem; os 8 C-3 ficam | ~6 |
| 41-band-tag-and-timeframe-heading | 8,4 | FICA (enxugado) | N-2 dentro das montagens do N-1; o 15m desce | ~3 |
| 42-view-helper | 19,6 | FICA (enxugado) | (d) roda na montagem do (e) | ~2,5 |
| **soma** | **550,9** | | | **~247–272** |

## 3. Por spec, 01 → 42

Os textos dos lotes estão na íntegra. O 35 e o 38 vêm do parcial, sem alteração. Cada seção traz (a) o que só o browser prova, (b) o que desce, (c) a duplicação, a origem e o veredito **do lote**. O veredito final está em §2 e §5.

### 01-console-carrega  (tempo: 2.2s, 2 testes)
(a) só-browser: SSR real do /console contra a API real (o access log do uvicorn sobe, `countCollectorStatusAccessLogHits`), CSS aplicado, fonte de ícones computada (`getComputedStyle` → Material Symbols), console/pageerror na hidratação, `rows:N`/`catalog_rows:N` iguais ao `n_entries` da API viva.
(b) desce?: h1==1, 5 `source:none`, texto da bancada ausente e regex `1,6 GB|99,8%` são DOM estático. Nenhum unitário renderiza o console (grep `renderToString|renderToStaticMarkup|ui_state|catalog_rows|source:none` em *.test.ts → 0). O vazamento de fixture tem só testemunha indireta: src/features/s1-console/view-model.test.ts "buildS1ViewModel: orcamento total bate com a soma das linhas e com '1,6 GB'" (formata o fixture, não prova que ele saiu da rota).
(c) duplica?: h1==1 também em 05 t2; `rows>0` na página ambiente também em 02-B2 (mesma inversão com E2E_API_UP=0).
(origem): 4401f6d4 T-01.9 (suíte reescrita pós-ADR-028/D1); c0cd4669 trocou o literal `catalog_rows:10`, que ficou vermelho quando T-01.6 acrescentou a 11ª linha.
veredito: FICA, e passa a receber as fusões de 02/04/05/06/07 — ganho 0s — risco: se as asserções forem somadas sem `test.step`/`expect.soft`, a primeira falha esconde as seguintes.

### 02-rede-e-estados  (tempo: 14.1s, 7 testes)
(a) só-browser: t1 (zero request API-like e zero websocket no browser) é rede real. B3 mostra que o `INGEST_HEALTH_API_BASE_URL` é lido em runtime num segundo `next start`. B6 mostra o fallback de `loading.tsx` em streaming real. B4/B5 mostram o banner `error_kind`/`status:500`/`ui_state:empty` renderizado pelo servidor real.
(b) desce?: a classificação dos kinds já está coberta por src/features/s1-console/collector-status-query.test.ts ("MORDE TransportErrorKind=missing_base_url…", "…=connection_refused: fetchImpl rejeita", "…=non_2xx: resposta 500 ⇒ kind certo, com status preservado"). O e2e só soma o caminho kind→DOM e o erro de transporte real do undici (o unitário usa mock).
(c) duplica?: B2 (`tbody tr > 0` + fact sha256 sem asserção) faz a mesma inversão que 01-B1 (`rows:[1-9]`); o próprio comentário diz "reusing B1's own signal". B6 custa 7.0s [MEDIDO, verify-base-piramide.log] porque o stub ignora o path e `console/page.tsx` faz 3 awaits em série nele (:109, :121, :138), ou seja ~3×2s.
(origem): 4401f6d4 T-01.9 (B1–B6 do SPEC-003 §5); 6069c2e7 T-03.7 (troca para /collector-status).
veredito: FUNDE(com 01): B2 entra em 01-B1. Ajustar o stub de B6 para atrasar só `/collector-status`. ganho estimado ~5s (0.94s do B2 + ~4s do B6 [INFERIDO]). risco: B2 é a metade "de pé" do diff externo de `main_sha256` entre rodadas (D1.4), então o fact precisa migrar junto.

### 03-rotas  (tempo: 3.1s, 3 testes)
(a) só-browser: redirect do `next.config.ts` (`redirects()`, :25) seguido até /console, 404 real do `not-found.tsx` com `lang=pt-BR` e link de volta, barra final servida pelo servidor real.
(b) desce?: só um servidor Next real exercita roteamento. Unitário que já cobre: nenhum achado (grep `redirect|not-found|next.config` em *.test.ts → 0; src/charts/eslint-boundary.test.ts só cita `ROUTES`).
(c) duplica?: não. O t3 só afirma a barra final; `/Console` gera só fact, sem asserção.
(origem): 4401f6d4 T-01.9 (B8/B9); 31e0f38b migrou /painel para /console (o redirect antigo fica de fora por causa do grep do CA-F3-4).
veredito: FICA — ganho ~0s (juntar o t3 ao B8 economizaria só o overhead de contexto, ~0.3s) — risco: perder a única prova de rota e 404.

### 04-interacoes  (tempo: 2.1s, 2 testes)
(a) só-browser: input controlado depois da hidratação (fill → re-render), contagem da tabela == `n_entries` da API viva e subtotal == linhas `sum_open_interest` da API.
(b) desce?: o predicado já está coberto em src/features/s3-inspector/domain.test.ts ("filterCatalogRows por texto casa símbolo/métrica/fonte, case-insensitive", "filterCatalogRows sem filtro devolve o catálogo inteiro"). Sobra a fiação de estado + dado real. O t2 ('abrir' ausente) é DOM estático; unitário: nenhum achado (o `abrir` de domain.test.ts:31 é comentário de D6.15).
(c) duplica?: parcial com 01-B1: a contagem do catálogo é a mesma (`catalog_rows:N` == `n_entries`), na mesma página e com a mesma mutação no parse. O t2 é da mesma classe do "bancada ausente" de 01-t1.
(origem): 4401f6d4 T-01.9; f632ba91 T-03.3; f57b3fbd (o subtotal literal 5 quebrou quando o catálogo passou a ter 4 instrumentos, `n_entries=48`, `sum_open_interest=20`).
veredito: FUNDE(com 01): o t2 vira uma asserção em 01-t1, o t1 fica — ganho ~0.7s — risco: nenhum além do mascaramento citado em 01.

### 05-a11y  (tempo: 3.0s, 2 testes)
(a) só-browser: axe-core sobre o CSS computado de verdade (contraste, nomes acessíveis) e foco por Tab real.
(b) desce?: o t2 (h1/main/lang/labels/captions) é DOM estático. O Tab só gera fact (nenhuma asserção no foco/outline). Unitário: nenhum achado (grep `aria-label|caption|lang` não acha teste de componente no console). O contraste de tokens já está em src/charts/color-contrast.test.ts, mas só para o chart, não para /console.
(c) duplica?: h1==1 com 01-t1 (meter um segundo `<h1>` reprova os dois). `lang=pt-BR` vem do mesmo `<html>` do layout que 03-B9 verifica (mutar o layout reprova os dois).
(origem): 4401f6d4 T-01.9.
veredito: FUNDE(com 01): o t2 entra em 01-t1, o axe FICA isolado — ganho ~1.0s — risco: as asserções soft (labels/captions) ficam diluídas num teste maior.

### 06-viewport  (tempo: 1.9s, 2 testes)
(a) só-browser: layout real (scrollWidth vs clientWidth, largura das tabelas por `getBoundingClientRect`) com Tailwind ligado, em 390 px.
(b) desce?: não. Overflow de layout só existe com engine de layout; jsdom não faz layout. Unitário: nenhum achado (grep `scrollWidth|getBoundingClientRect` no console → 0).
(c) duplica?: o caso 1280×800 é o mesmo viewport default do projeto (playwright.config.ts:48) e a mesma página de 01-t1, ou seja uma montagem paga duas vezes.
(origem): 4401f6d4 T-01.9 (o comentário também registra o sub-conto do grep `[Q11]`).
veredito: FUNDE(com 01): as métricas de 1280 entram em 01-t1, o 390 fica — ganho ~0.66s — risco: o comentário `[Q11]` sobre o loop gerar 2 casos deixa de valer (a contagem por grep muda).

### 07-locale  (tempo: 2.8s, 3 testes)
(a) só-browser: D3.4 sobe stub + segundo `next start` e mostra que um decimal real (99.8) atravessa o SSR e aparece como "99,8%", sem nenhum ponto decimal na tela inteira.
(b) desce?: o formatador já está em src/features/s1-console/view-model.test.ts ("formatPtBrNumber: MESMO formatador tambem cobre uptime%/GB-dia", que afirma 99.8→"99,8"). `uptimeText` (view-model.ts:120) não tem unitário (grep `uptimeText` → 0). O D3.5 (`<th>` 'Janela de perda') é markup estático de S1Console.tsx; unitário: nenhum achado (grep 'Janela de perda' em *.test.ts → 0). Desceria como source-scan, a técnica que o repo já usa.
(c) duplica?: o teste "ambiente" só tem asserção soft e mede 0 decimais por construção (o próprio comentário diz isso). Ele e o D3.5 pagam o mesmo goto ambiente de /console que 01-t1.
(origem): 1970ab6b T-03.8 (a versão anterior, soft e só ambiente, nunca exercitava um decimal).
veredito: FUNDE(com 01): D3.5 e ambiente entram em 01-t1, D3.4 FICA — ganho ~1.7s — risco: nenhum para D3.4. O "ambiente" é só registro.

### 08-symbol-dado-real  (tempo: 2.8s, 3 testes)
(a) só-browser: os atributos de janela que o SSR real publicou (`data-window-*`) comparados com a API real sobre a mesma janela, e os readouts de Preço/OI dizendo "ausente" sem dígito (RN-1) na página renderizada.
(b) desce?: o t1 (janela de 4 dias − 1 min, acompanha o relógio, nunca no futuro) já está em src/app/symbol/chart/history/request-window.test.ts ("the route's window TRACKS the clock…", "T-05.1: … `1m` keeps the 4 days (5.760 bars)", "the route never asks for the future…"). A presença dos atributos está em src/app/symbol/volume-subaxis-dom-contract.test.ts "C4: the request this render was built from is on the root element" (source-scan). O t2 é contrato só de API (500 sem reader ou grade completa), parcial em backend/tests/main/test_create_app_wires_series_window_reader.py::test_sqlite_backend_leaves_series_window_reader_unwired.
(c) duplica?: o t3 (a)–(c) (`data-volume-present-points` == API, horizonte, readout) é o mesmo que 09-t3 (a)–(c). Apagar o atributo em SymbolClient reprova os dois. Só o (d) de Preço/OI é exclusivo do 08, e só o piso N≥30 é exclusivo do 09.
(origem): 1e108d6f F4 (a /symbol não servia dado real em produção, janela congelada em 2026-08-20..24); c0cd4669 wave 03 (BLOCKER-2: API de produção contra API de fixture, 916 vs 0; BLOCKER-3: `Number(null)===0`).
veredito: FUNDE(com 09): um goto só, o t1 desce (já coberto), as asserções de API do t2 e o (d) do t3 vão para 09-t3 — ganho ~2.8s — risco: a linha `src/app/symbol/oi-` de scope-map.tsv cita 08 e teria de passar a citar 09.

### 09-volume-dado-real  (tempo: 0.9s, 3 testes)
(a) só-browser: o t3 compara o contador do DOM servido (`requireDigits` antes de `Number`) com a API real, e no universo FORTE aplica o piso N≥30. t1 e t2 não abrem página (6 ms cada [MEDIDO]).
(b) desce?: o t1 (catálogo: 1 linha, 1m/1min, staleness 2×, FLOW/SUM, não reconstruída) é contrato do backend, em parte coberto por backend/tests/sentimento/test_series_catalog_use_case.py::test_klines_volume_is_registered_in_the_catalog_the_route_serves e …::test_klines_volume_and_klines_last_are_served_as_two_rows_not_one. O t2 (MORDE) testa `countPresentRows`, uma função definida dentro do próprio spec, com fixture sintética: é o controle do próprio instrumento e não toca código do app. O DOM contract do t3 está em volume-subaxis-dom-contract.test.ts ("T-01.9 contract: the present-point count is a bare integer attribute…", source-scan).
(c) duplica?: o t3 (a)–(c) duplica 08-t3 (ver acima).
(origem): b6f407dc T-01.9 (o portão estava verde com `volume_dom_present_points=0` ao lado de `rc=0 30 passed`, QA-FASE-01-fechamento §4.1).
veredito: FICA (absorve o 08). t1/t2 poderiam descer, mas o custo é ~0s — ganho 0s — risco: tirar o t2 apaga o par morde/cala do piso, a única coisa que morde no universo FRACO do portão.

### 10-cvd-dado-real  (tempo: 0.9s, 2 testes)
(a) só-browser: o t2 compara a página renderizada com a API real: contagem == API, horizonte `N/gradeDaJanela`, âncora == `windowStartMs` do servidor, kind do acumulado == kind do delta, legenda "Delta/Acumulado". O t1 só lê a API (5 ms).
(b) desce?: os seletores e strings já estão em src/app/symbol/cvd-pane-dom-contract.test.ts ("C4 for CVD…", "D4.7: the cumulative anchor is CHOSEN by the route and PRINTED by the pane", "DR-3/WCAG 1.4.1…", "DR-3: the cumulative curve has a NUMBER in the DOM…"), todos source-scan. O predicado do t1 está em src/app/symbol/cvd-series-selector.test.ts ("the predicate matches EXACTLY ONE of the four cvd_source rows…", contra fixture) e no backend em backend/tests/sentimento/test_cvd_source_catalog.py::test_the_fourth_source_coexists_with_the_three_without_colliding_with_any. O t1 é o guarda de deriva contra o catálogo realmente servido.
(c) duplica?: não na asserção. Mas paga o mesmo goto de /symbol que 08/09.
(origem): 5fe218d7 fase 02 (CVD na tela, N=290); c7e17fc5 (bloqueantes do design-review, DR-3: a curva acumulada não tinha leitura no DOM).
veredito: FUNDE(com 09): o t2 compartilha a montagem de /symbol com o 09-t3 — ganho ~0.9s — risco: uma falha no painel de volume esconde o de CVD (mitigar com `test.step`/soft).

### 11-canvas-fundo  (tempo: 0.7s, 1 teste)
(a) só-browser: lê os pixels reais do `<canvas>` (`getImageData`, cor modal == SURFACE_BASE em mais de 50% da amostra). É a única camada que pega CSS por cima, mudança de semântica de `layout` na lib ou `applyOptions` redefinindo o fundo.
(b) desce?: a aritmética já está em src/charts/color-contrast.test.ts ("DR-1: the chart background IS the page surface — one value, not two that agree today"). O que está escrito já está em src/app/symbol/chart-construction.test.ts ("DR-1: every createChart that MOUNTS a chart takes its options from chartConstructorOptions()", "MORDE: the 74d59a4 call … is REJECTED"). O headless chart tem contexto 2D no-op e não chega ao pixel.
(c) duplica?: não. E não deve ser fundido ao goto de /symbol do 09: scope-map.tsv o usa como o spec que sempre roda ("runs nothing beyond `e2e/11`").
(origem): c7e17fc5 design-review DR-1 (canvas #FFFFFF: 14,72:1 no portão e 1,22:1 na tela, com os 6 portões verdes).
veredito: FICA — ganho 0s — risco: sem ele, a correção de DR-1 volta a ser só uma afirmação do código sobre si mesmo.

### 12-oi-dado-real  (tempo: 0.9s, 3 testes)
(a) só-browser: o SSR real de /symbol contra a API real. O teste de página (908ms) compara `data-oi-native-bars`/`wire-points`/frescor/horizonte do DOM com `/series-history` sobre a janela do `<main>`. No portão (sqlite) só confere a degradação: API 500, DOM com dígitos 0=0, `ausente` sem dígito, `oi_freshness:unknown`, horizonte `0/N`. Os outros 2 testes não abrem browser (catálogo real 5ms, MORDE do contador 3ms).
(b) desce?: os testes de catálogo e MORDE são contas sem página, mas custam ~0s. O estado de DOM já está em `src/app/symbol/oi-pane-dom-contract.test.ts` ("RN-1: the OI readout says `ausente`…", "RN-S1: the pane publishes the NATIVE bar count…", "RNF-2…"), só que é varredura de fonte e não render (o próprio cabeçalho dele diz que não há renderer). A contagem nativa está em `src/app/symbol/view-model.test.ts` (ladderRows, l.463-510). Seletor: `src/app/symbol/oi-series-selector.test.ts` ("matches EXACTLY ONE…", "DoD-5…"), mas contra um fixture transcrito; o e2e é a testemunha contra o catálogo servido.
(c) duplica?: a mesma montagem de /symbol, com asserções vizinhas no universo fraco, é paga também por 13 (teste 3), 14 (teste 4), 19 (CA-9/DoD-3/DoD-4) e, fora do lote, 08/10.
(origem): 01057b33 (2026-09-12, T-03.5/T-03.6): a página pedia a série errada e todo portão de backend ficou verde. `requireDigits` nasceu do BLOCKER-3 da wave 03 (`rc=0, 24 passed` com o contrato apagado). A âncora do readout vem de 0f35cae5 (A-4.2, TypeError medido em `gates/T-03.5-T-03.6-qa-remedicao.md` §A5).
veredito: FICA (como anfitrião da fusão de 13/14/19 sobre um único goto) — ganho 0s aqui (contado nos outros) — risco: é o único testemunho comportamental (não grep de fonte) do contrato de DOM do OiPane sob API recusando.

### 13-liquidacoes-dado-real  (tempo: 2.9s, 4 testes)
(a) só-browser: o teste 3 (985ms) confere as duas coortes do DOM contra a API sobre a mesma janela do SSR. No portão vira só `SEM_PONTO`, `published_error` declarado e horizonte `0/N`. O teste 2 (954ms) checa a estrutura do pane fundido depois do portal (`data-pane-layers=anchored`, 1 raiz por plot cell, 2 pernas dentro).
(b) desce?: o teste 4 "M-2" (942ms) cria um gráfico LWC descartável via `addScriptTag` e pergunta `getVisibleLogicalRange`. Isso testa a biblioteca e não o app; só afirma "não nulo" e "visível ≤ declarado", o resto é `fact`. Testids/coortes já estão em `src/app/symbol/liquidation-pane-dom-contract.test.ts` (COHORT_TESTID_BUILDER, l.170, varredura de fonte). Seletor em `src/app/symbol/liquidation-series-selector.test.ts` ("each cohort selector matches EXACTLY ONE row…", "MORDE: dropping `cohort`…"). Grade preenchida sob falha (CA-5a) em `src/app/symbol/panel-assembly.test.ts` ("MORDE: an upstream-failed series (empty rows) still comes back GRID-PADDED…").
(c) duplica?: o teste 2 duplica 32 ("desenho": `sides`=`short:up;long:down` e `legSides` lidos dentro da camada). A mutação "uma perna fora do pane fundido" reprova os dois. Só o 13 pega um grupo de coorte extra fora do pane (`cohortGroupsInPage`) e `layerRootsInAnchor==1`. O teste 3 repete a montagem de 12/14.
(origem): 60178e72 (T-05.11). b128e226 (T-04.5) re-ancorou no pane fundido depois que a largura do M-2 passou a medir a legenda (1208px) e não o canvas (1224px). `loadRenderedRequestWithLiveRead` registra uma degradação real de produção (`page.tsx:305`, `connection_refused`, 2 de 6 cargas).
veredito: FUNDE (teste 2 com 32, levando os 2 contadores extras; teste 3 no goto anfitrião do 12) + CORTA do M-2 (passar o "camada cobre o canvas ≤1px" para 23) — ganho estimado ~2.8s — risco: o M-2 deixa de gravar `m2_visible_fraction` em `facts.jsonl` a cada rodada (é registro, nunca foi asserção).

### 14-long-short-dado-real  (tempo: 2.4s, 6 testes)
(a) só-browser: o teste principal (857ms) compara contagem DOM×API, grade preenchida e índices da faixa de 4h. O z-index da faixa contra os canvas da LWC é o único teste de "existe na tela", e ele roda SÓ no universo forte (o ramo fraco dá `return` antes, l.~588), ou seja nunca no portão. C-1 1h/4h (785+713ms) passa pela rota `?interval=`.
(b) desce?: 3 testes não abrem browser (≈11ms; MORDE do seletor e do divisor sobre a cópia do próprio e2e). Duplicam `src/app/symbol/long-short-series-selector.test.ts` ("MORDE: dropping `provider`…", "MORDE: `presentRows / 5`…", "MORDE: the five-minute-grid filter…"). No portão o C-1 só afirma a aritmética da faixa e `long_short_recent_scale:absent`, já em `src/app/symbol/long-short-band.test.ts` ("D-1: the range is read off the LAST slot…", "C-1 MORDE (control)…", "N-1 MORDE…4h") e em `src/app/symbol/panel-assembly.test.ts` ("MORDE C-1/R-1…", "MORDE C-1: page.tsx … SAME function"). CA-5a está em `panel-assembly.test.ts` ("…GRID-PADDED…").
(c) duplica?: a montagem do teste principal é a mesma de 12/13. A rota `?interval=1h|4h` já é exercida por 39 e 18.
(origem): e5d97c2a (T-04.7). 10fffdff (T-04.10): a faixa passou em todas as asserções de DOM sem aparecer na tela (z-index), defeito real. CA-5a veio de `gates/FASE-02-qa.md`; C-1 de W7-CODE-REVIEW (9fc401e5, 6fdcdfaa).
veredito: FUNDE (principal no goto do 12) + DESCE dos dois C-1 no portão — ganho estimado ~2.4s — risco: a checagem de z-index (o defeito que já foi entregue) continua fora do portão de qualquer jeito; ela precisa de um stub com dado (receita do 17/20) para passar a morder.

### 15-vela-e-ablacao  (tempo: 0.6s medido, 4 testes: 2 passam, 2 skipped)
(a) só-browser: CA-2 lê tinta de vela no canvas (extensão vertical, pavio, alinhamento de 4 arestas com a API em ≤3px, com mutação do próprio instrumento). CA-4 sobe um proxy HTTP e um 2º `next start` (o fetch é RSC, `page.route` não alcança) para ablar `klines_ohlc` (MORDE) e `sum_open_interest` (CALA, mesma geometria).
(b) desce?: CA-0 (1ms) é grep de `VOLUME_SCALE_MARGINS` em SymbolClient.tsx. `src/app/symbol/volume-subaxis-geometry.test.ts` (l.93-101, `productionMargins`) já extrai a mesma constante, então pode descer. CA-3 (636ms): `data-price-candles`==API e `price_last_reading:absent` é estado de DOM, coberto por `src/app/symbol/price-pane-dom-contract.test.ts` ("the drawn-candle count is counted off the SLOTS…"). Corpo/pavio em coordenada: `src/app/symbol/price-candle.test.ts` ("P1: the four readings draw a BODY and a WICK…", "⛔ ABLATION (DoD-4)…").
(c) duplica?: CA-3 repete a montagem de 08/12. CA-2 e CA-4 não têm par.
Skips: CA-2 (l.841) e CA-4 (l.975) pulam quando `candles.length===0` na resposta de `/series-history` montada a partir da API. Não é variável de ambiente (o cabeçalho recusa env de propósito). No portão (sqlite → 500) os dois são SEMPRE pulados. CA-2 ainda executa antes do skip: goto, `waitForPaintedChart` (2s fixos), ink==0, drawn==0 e screenshot. CA-4 faz goto e fetch. Esse custo (~3–4s [ESTIMADO]) não aparece na soma do log.
(origem): 10fd6907 (T-01.11): a suíte tinha 40 asserções sobre /symbol e nenhuma olhava a vela. 63edd895: o portão da fase 01 deu NEEDS_FIX pelos instrumentos desta spec.
veredito: FICA (só CA-2/CA-4 provam pixel da vela contra a API; CA-3 entra no goto do CA-2 e CA-0 desce) — ganho estimado ~0.6s — risco: o portão nunca exerce o pixel forte. Migrar CA-2/CA-4 para stub sintético (como 17/20) faria eles morderem no `make verify`.

### 16-eixo-unico-pan-e-ablacao  (tempo: 10.0s, 2 testes)
(a) só-browser: arrasto real de mouse no host único. `data-axis-sync-write-count` fica 0 em 3 gestos, nada se move depois de 1s parado (DoD-4) e o pan nativo sobrevive a `?e2eAxisSyncDisabled=1`.
(b) desce?: com panelCount=1 o invariante central é unitário: `src/charts/range-dispatch.test.ts` ("T-01.5 (a): with panelCount = 1, no gesture ever produces a write") e `src/app/symbol/chart/axis/axis-sync.test.ts` ("T-01.5: with the default single panel… nothing is ever written", "withAxisSyncAblation(store, true) MORDE…", "isAxisSyncAblationRequested: MORDE…"). A mutação "tirar o `continue` da origem" morde o unitário. No ablado o contador é 0 com ou sem a assinatura, então o teste 2 só repete o MORDE do wrapper.
(c) duplica?: o atributo e a query só aparecem aqui (grep). Arrasto real com range mudando já é exercido por 17/20/22/27.
(origem): 30eb49d3 (T-02.6): defeito de eco tardio escrito no painel arrastado, na era de 6 IChartApi. 122c406d/8f6d518c (T-01.5/T-01.8) re-ancoraram no host único, onde o cabeçalho admite que "os cinco seguem" virou vazio por construção.
veredito: DESCE (o teste 2 é coberto por axis-sync.test.ts; o "settle sem laço" de 1 arrasto pode entrar no 27) — ganho estimado ~9s — risco: perde a prova fim-a-fim de que eventos reais da LWC → ChartHost → pager não realimentam (DoD-4), algo que o unitário com chart falso não exerce.

### 17-teto-latencia-eixo  (tempo: 5.1s, 1 teste)
(a) só-browser: desempenho sob gesto real. Mede p95 ≤160ms entre aplicações de range (`__axisLatencyProbe`) em ≥61 amostras de um arrasto contínuo, num 2º `next start` com stub OHLC sintético. O stub existe porque, medido, a LWC não faz pan com séries só de whitespace.
(b) desce?: não. `src/app/symbol/axis-latency-probe.test.ts` só prova "never throws outside a browser". Nenhum unitário mede cadência.
(c) duplica?: 20 usa a MESMA receita (stub, 2ª instância Next, mesmo probe) e afirma intervalo intra-gesto máx ≤160ms (`expect.soft`), que é mais estrito que p95. Só o 17 tem o piso de taxa (≥61 amostras) e o arrasto sem paginação.
(origem): 24b597e3 (T-02.7) mediu p95 de ~33ms contra o teto de 16ms; o teto foi recalibrado para 160ms por decisão do owner (2026-09-22); renumerado em 3ba71607. Atenção: `SPEC="16-teto-latencia-eixo"`, então os facts saem com o nome errado (aparece assim no log).
veredito: FUNDE (com 20: o arrasto contínuo roda na mesma instância, antes do pré-arrasto) — ganho estimado ~3s (subir a 2ª instância + goto + espera fixa de 2s) — risco: uma falha aqui pode mascarar o veredito do 20 se não for soft. O cabeçalho já está desatualizado ("cinco painéis").

### 18-tf-refetch-e-ablacao  (tempo: 5.0s, 4 testes)
(a) só-browser: clique real no botão de TF navega, a janela do SERVIDOR (`<main>`) se move, e o `uvicorn` recebe exatamente 10 `interval=4h` (lido do access log, rede real). `?interval=7m` degrada para 1m sem nenhum hit na API. Ida e volta 1m→4h→1m restaura a janela byte a byte.
(b) desce?: o teste 1 (aria-pressed no primeiro paint, sem query) é DOM estático: `src/app/symbol/chrome/timeframe-bar-dom-contract.test.ts` ("T-03.12 contract: each button announces aria-pressed…"). Alinhamento da borda: `src/app/symbol/chart/history/request-window.test.ts` ("…right edge lands on ITS OWN boundary", "MORDE: the interval-aware alignment…", "W1-FIX: the 1m and 4h RIGHT EDGES coincide IFF…"). TF fora do conjunto: `src/app/symbol/chart/axis/supported-timeframes.test.ts` ("removing a member… shrinks isSupportedTimeframe's domain…"). O access log não desce.
(c) duplica?: dentro do arquivo, os testes 2 e 3 pagam o mesmo goto + clique em 4h. O teste 3 já contém a pré-condição do 2, só falta o access log. 26 prova a troca do grid desenhado, 39 a abertura por `?interval=`.
(origem): 61566b0a (T-03.11, o refetch real substituiu o `useState` local). 4a17e35d (W1-FIX) corrigiu o flake da faixa HH:05–HH:10 (`gates/W1-QA.md` BLOCKER-1).
veredito: FUNDE (1+2 dentro do 3; contar os hits por tentativa no laço de 3) — ganho estimado ~2s — risco: o laço de retry do 3 pode contar hits a mais se o `hitsBefore` não for relido a cada tentativa.

### 19-oi-provenance-ablacao-e-ascii  (tempo: 5.5s, 4 testes)
(a) só-browser: DoD-4 checa visibilidade real com boundingBox no viewport e falsifica a si mesmo com `display:none`. DoD-3 varre o HTML SERVIDO inteiro (valores interpolados em runtime). CA-10 usa um stub de catálogo + 2ª instância Next e mostra o rótulo mudando via SSR quando só a chave muda (e `unresolved` com catálogo vazio).
(b) desce?: CA-9 (822ms) compara o atributo com uma cópia do e2e: `src/app/symbol/oi-pane-dom-contract.test.ts` ("T-04.1/RN-5/CA-9…DERIVED", "MORDE (T-04.1): hard-coding the label…") e `src/app/symbol/oi-series-selector.test.ts` ("T-04.1: today's REAL Binance OI row…", "CA-10 (ablation): a different `denom`… / `provider`/`venue`… / `cohort`…"). ASCII na fonte: `src/app/symbol/data-fact-ascii-key-contract.test.ts` ("DoD 3, at the source…").
(c) duplica?: CA-9, DoD-3 e DoD-4 fazem 3 gotos do mesmo /symbol (e o do 12). CA-10 é vizinho de 24 "CA-5" (mesmo padrão stub + `setCatalog`, troca de chave → nome derivado), mas o 24 só troca a unidade e lê headings, não `oi_provenance`.
(origem): 77fa8b2a (T-04.5, CST-232), o "segundo testemunho, pelo pixel" dos unitários T-04.1–T-04.4.
veredito: FUNDE (CA-9/DoD-3/DoD-4 num goto, de preferência o do 12; CA-10 dentro do 24 CA-5 ampliando a troca para venue/denom/cohort mais o caso vazio) — ganho estimado ~4s — risco: perder o caso `oi_provenance:unresolved` se ele não migrar junto.

### 20-teto-latencia-historia-sob-demanda  (tempo: 24.2s, 1 teste)
(a) só-browser: p95 ≤400ms entre borda detectada e barra DESENHADA em ≥10 páginas disparadas por arrasto real. Também cobre: intra-gesto ≤160ms, o range continua mudando depois da página (o host sobrevive), salto na fronteira ≤48 slots e nenhuma cascata em 2s sem input. Usa stub sintético + 2ª instância Next + `showView` (view.ts) no pré-arrasto.
(b) desce?: não. `src/app/symbol/history-page-latency-probe.test.ts` só prova "never throw outside a browser". O gatilho de paginação está em `src/app/symbol/slot-coverage.test.ts` ("MORDE: historyRequest refuses another page…"), mas não a latência nem o gesto. `E2E20_SYMBOL_QUERY` (env, padrão vazio) só serve para rodar as ablações manualmente (`?e2eDenseSeries=1`, `?e2ePageApplyBusyMs=80`). O portão mede o caminho entregue.
(c) duplica?: 22 (19.9s, fora do lote) repete o stub, a 2ª instância e a paginação por arrasto. A mutação que o cabeçalho do 20 cita ("`axis` de volta nas deps de montagem do host") é a mesma MORDE do 22 (`data-chart-mount-count`). Tem vizinhança com 17 (ver acima).
(origem): e8aa50e7 (T-05.9) pegou a corrida `inFlightRef`/`axisRef` (`widenAndCapWindow` depois de ~7 páginas). T-01.F2 mediu 24/24 gestos parados por remontagem (`gates/DIAG-e2e-master.md` §4). Re-ancorado em ab293210/0fa2c3d8.
veredito: FICA (e absorve o 22: ler `data-chart-mount-count==1` no fim; e o 17) — ganho 0s aqui; a absorção do 22 renderia ~18–20s, contados à parte para não somar duas vezes com o lote do 22 — risco: o teste já leva 24s e soma vereditos soft; uma falha de mount-count tem de continuar com mensagem própria.

### 21-arrasto-historia-parede-e-ablacao  (tempo: 8.1s, 2 testes)
(a) só-browser: no universo FORTE: arrastos reais paginam a história, OI e L/S mostram `beyond` visíveis enquanto o Preço segue com barras, e a ablação por `display:none` esvazia em silêncio. Nenhum dos dois roda no portão.
(b) desce?: no portão (sqlite) o teste A faz 3 arrastos inertes (17 mediu que a LWC não faz pan sem valor real) e ~4 sondagens de assentamento de ≥1,4s cada (7.3s) só para afirmar `price_candles==0`. O teste B (836ms) afirma ausência dos badges. Cobertos por `src/app/symbol/beyond-coverage-badge-dom-contract.test.ts` ("T-05.6: both badges are GUARDED on the strict 'beyond-coverage' verdict…") e `src/app/symbol/slot-coverage.test.ts` ("CALA: unmeasured coverage (null) never reports beyond-coverage…").
(c) duplica?: no fraco, `price_candles==0` com a API em 0 é a mesma asserção do 15 CA-3 (e do 08). A mutação "fabricar velas sem dado" reprova os dois. "Sem cascata" já mora no 20 (o cabeçalho do 21 diz isso).
(origem): 0d390616 (T-05.8) achou a cascata de paginação sem gesto (6 páginas automáticas), depois fechada por T-05-FIX. Re-ancorado em 8f6d518c/e2596fb2.
veredito: DESCE (no fraco: decidir `readerPresent` ANTES dos arrastos e sair cedo; a parte forte fica opt-in) — ganho estimado ~7.5s — risco: nenhum para o portão (o fraco não exerce paginação). Nos runs contra produção nada se perde se o ramo forte for mantido.

### 22-single-host-survives-paging  (tempo: 19.9s, 1 teste)
(a) só-browser: um arrasto real, com 12 tentativas de gesto, dispara 2 páginas de `/series-history` por rede real (stub HTTP + segundo `next start`, L200-203). Depois disso o atributo `data-chart-mount-count` continua 1, ou seja, nenhum `chart.remove()`/`createChart` durante o gesto. Por que custa: 4 dos 6 arrastos não pedem página, e cada um queima o timeout `NO_REQUEST_WAIT_MS` de 2,5s (L60, L239-244). Isso dá ~10s [MEDIDO: e2e.log `drag_requested_new_page:0..3=false`]. Somam-se `waitForTimeout(2_000)` (L211), o `showView` 2000 barras (L223, view.ts L285-310) e 2×100ms por arrasto (L184/L186).
(b) desce?: o contador de montagens é estado React sob arrasto real e nenhum unitário o lê. axis-sync.test.ts cobre o `rebase` da store ("T-01.5 rebase: the page's own echo…"), não o efeito de montagem do host. Unitário que já cobre a contagem: nenhum achado (grep: `mount-count|mountCount`).
(c) duplica?: sim, com o e2e/20. O 20 também pagina por arrasto (≥10 páginas) e o cabeçalho dele diz "Bites (`gates/T-01.8-builder.md` §4): `axis` back in the host's mount deps (a remount per page)". É a mesma mutação que o 22 morde. A asserção `.tv-lightweight-charts == 1` repete o 23 e o 24 CA-1′.
(origem): 6767f3f0 "T-01.5 — host sobrevive à página". Defeito real: em `DIAG-e2e-master.md` §4, 24/24 gestos morriam com o canvas removido (FIX-regressoes-fase05 §4.2-4.3).
veredito: FUNDE(com 20) — ganho estimado ~19.9s (basta afirmar `data-chart-mount-count == 1` no fim do 20, que já paga a caminhada e as páginas). Risco: no 20, parte das verificações de paginação é soft (L827-846). A mensagem direta "recriado N vezes" tem de virar uma asserção hard lá.

### 23-pane-layer  (tempo: 3.7s, 1 teste)
(a) só-browser: o estilo computado do separador que a biblioteca desenha (`td[colspan=3]`) e `pointer-events` lido no DOM real. Tinta de vela no pixel abaixo e acima do fundo medido da legenda (L282-295). A sonda C-5 testa hit-test real (`elementFromPoint`), clique e alcance por Tab (L298-340).
(b) desce?: o valor da opção e a conta da reserva já descem. pane-chrome-options.test.ts tem "C-6: the built options set the separator … and turn resizing off" com MORDE. pane-stack-layout.test.ts tem "belowLegend: the first pixel the scale may draw is at or below the legend's bottom + gap" e "MORDE: the base margins alone…". O e2e prova que a opção chega ao DOM da biblioteca, e o C-5 não tem unitário (grep: `pointerEvents` só em long-short-pane-design-contract.test.ts).
(c) duplica?: só a contagem de 1 gráfico e "camada dentro do gráfico" (repetem o 24 CA-1′ e o 22). O stub (OHLC doji, sem volume) é diferente, então não dá para dividir montagem com o 24.
(origem): e2596fb2 "T-01.6 — camada de DOM por pane…" (gate r2 C-4/C-5/C-6). A mutação está registrada em `gates/T-01.6-builder.md`: sem o bloco `panes` reprova (b), sem `belowLegend` reprova (c).
veredito: FICA — ganho estimado ~0s (≤1,5s se o `waitForTimeout(2_000)` da L231 virar espera por rAF). Risco: sem ele, nenhuma prova de que o filho interativo da camada recebe clique e Tab.

### 24-single-chart-axis-and-legend  (tempo: 30.1s, 6 testes)
(a) só-browser: CA-1′ mede tinta por pane e CA-2′ mede uma única faixa de eixo de tempo por pixel. CA-3′/CA-4 movem o crosshair com o mouse real, e a legenda tem de bater com a linha que o stub serviu pela rede. Os pixels do eixo da liquidação ficam parados em repouso (MF-2) e sob o ponteiro (RN-3). Por que custa: são 7 `openSymbol`, cada um com `waitForTimeout(2_000)` (L356), ~14s só de sono. CA-5 monta duas vezes (L679, L683; 7.1s). CA-3′ faz 7 hovers × 150ms (L630). RN-3 faz 4 × (300+300ms) (L842, L853). O `startSecondaryNextInstance` roda uma vez no `beforeAll` (L479).
(b) desce?: CA-5 (trocar a unidade muda o nome) já está em pane-legend.test.ts: "CA-5: the legend name is a function of the SeriesKey…", "CA-5 MORDE: a hand-written name…" e "paneIdentityLabel is cadence then unit, and SymbolClient renders every heading through it". O e2e/41 lê os títulos derivados na página real. A parte MF-1 o próprio arquivo declara que "no longer bites" (L709-718), e quem pega é pane-scale-isolation.test.ts e unlabeled-tick-format.test.ts. SF-1 (atribuição no rodapé) está em pane-chrome-options.test.ts "SF-1: the logo is off…". A lógica de CA-3′/CA-4 está em pane-legend.test.ts "CA-3′ MORDE: a handler that filters by paneIndex…" e legend-reading.test.ts "no crosshair: reads the last CLOSED bucket…", mas o fio crosshair→slot→rede só o e2e prova.
(c) duplica?: CA-5 sobrepõe o e2e/41 (títulos derivados no app real). Internamente, CA-1′, CA-2′ e T-01.11-FIX são leituras em repouso da mesma montagem e pagam 3 montagens.
(origem): b31d2124 "T-01.9 — Playwright contra o app real… com as 4 ablações" e 98196b91 "T-01.11-FIX". Defeito real pego pelo RN-3 [MEDIDO 2026-09-27]: barras de cima em `right` mutadas deram 987 px alterados no eixo da liquidação.
veredito: FICA, com CA-5 DESCE e CA-1′+CA-2′+T-01.11-FIX numa montagem só — ganho estimado ~14s (7.1s do CA-5 + ~7s de 2 montagens). Risco: o arquivo diz que separou os testes de propósito (L464, "one red criterion never hides the next"), então a fusão tem de usar `expect.soft`.

### 25-sparse-feed-pixel-identity  (tempo: 6.1s, 2 testes)
(a) só-browser: identidade byte a byte do canvas. No braço (i) a LWC standalone roda no Chromium com feeds da fixture, e há dois controles que têm de diferir. No braço (ii) o app real é carregado esparso e depois com `?e2eDenseSeries=1`, com 0 byte de diferença. O headless chart não rasteriza (contexto 2D no-op), então essa propriedade não desce. Custo: segundo `next start` (L343), 2 cargas, cada uma com `waitForTimeout(1_000)` (L295).
(b) desce?: o nível de item já está embaixo. host-series-feed.test.ts tem "F-E: the carrier is fed FIRST…", "ablation ?e2eDenseSeries=1…" e "MORDE F-E: the carrier fed through plotItemsOnly is REJECTED". sparse-series-feed.test.ts tem "MORDE: feeding the carrier through plotItemsOnly leaves NO grid…". "Mesmo pixel" não desce.
(c) duplica?: não.
(origem): f16673d0 "T-01.10 — portadora da grade… (ADR-044/D2′)", promovido de `gates/T-01.10-desenho-pixel.mjs.txt`. Na primeira rodada o controle da portadora estava cego (0 bytes com marcas) [MEDIDO 2026-09-25].
veredito: FICA — ganho estimado 0s. Risco: nenhuma outra prova de que o feed esparso não muda o desenho.

### 26-tf-click-swaps-drawn-grid  (tempo: 3.4s, 2 testes)
(a) só-browser: um clique real no TF navega por rota, o servidor re-renderiza e o nó DOM do host é outro (a tag `data-qa-seed-tag` não sobrevive). A leitura (B) não afirma nada no universo fraco (L79-82). Cada teste faz 3 navegações `networkidle` (L54, L60-62, L67).
(b) desce?: seed-identity.test.ts cobre a função ("every pair of distinct served timeframes gives distinct keys") e tem um pin de fonte, "page.tsx keys <SymbolClient> by seedIdentityKey over the same three values…". Pela regex (L76-81) esse pin morde as duas mutações citadas: tirar o `key` e trocar `interval` por constante. Por ser grep de fonte, o comportamental continua sendo o e2e.
(c) duplica?: parcialmente o e2e/18 L120, que clica em 4h no mesmo app e universo. O caso 5m é único: é onde `interval` é o único termo da chave que muda.
(origem): c06d4201 "W1-QA — … e2e/26, troca de TF substitui o seed desenhado". O e2e/18 não vê o termo `interval`, e o "4h move a borda" dele é falso entre HH:05 e HH:10 [MEDIDO 2026-09-26]. Defeito: 718cb1a, TF inerte.
veredito: FUNDE(com 18) — ganho estimado ~2s (tag antes/depois no clique 4h do 18, mais um clique 5m). Risco: a leitura (B) do universo forte e a independência do relógio têm de ir junto para o 18.

### 27-drag-keeps-right-edge  (tempo: 5.9s, 1 teste)
(a) só-browser: o pager segura o corte enquanto o ponteiro está pressionado e aplica na soltura (`holdRightEdgeCap`). Só um gesto real com mousedown/up exercita esse fio. O teste lê `<main data-window-end-ms-inclusive>` depois de 2 arrastos de 150px. Custo: 2 × `waitForTimeout(1_500)` (L87), 2×(100+100ms) (L64/L66) e um goto `networkidle`.
(b) desce?: a aritmética já desceu. history-page-window.test.ts tem "W1-FIX MF-A MORDE: the RAW cap (5.000) cuts the 5.760-slot seed on a bare release…" e "W1-FIX MF-A CALA: with the effective cap, a release with no page leaves the seed window untouched". O fio pointer→soltura não tem unitário.
(c) duplica?: não. O cabeçalho diz que 16/20/22 não olham a borda direita. Mas o e2e/16 L149 já paga a mesma página no mesmo universo, com 3 arrastos reais no pane de Preço e uma espera de silêncio (L137, L173).
(origem): 4a17e35d "W1-FIX — borda direita sobrevive ao arrasto…". Defeito real (W1-DESIGN-REVIEW MF-A): a 1ª soltura cortava 760 slots, as 12h40 mais recentes.
veredito: FUNDE(com 16) — ganho estimado ~5s (ler a borda antes/depois nos arrastos do 16). Risco: no universo forte, arrastos maiores do 16 podem pedir 2 páginas e deslizar a borda de propósito ("the second slides it by one page"). Precisa limitar a amplitude dos arrastos ou ler a borda só após o 1º.

### 28-volume-linear-scale-pixel  (tempo: 2.4s, 1 teste)
(a) só-browser: no canvas real, a faixa de marcas, pelo menos 1 linha vazia (calha) e a base das barras. O pico fica ≥4× a mediana em pixels pintados. A calha de 1 linha é arredondamento de rasterização e o headless (coordenada) não a enxerga.
(b) desce?: a geometria em coordenada já desceu, com as mesmas duas ablações. volume-subaxis-geometry.test.ts tem "N-1: the strips never touch…", "F-3 (unit form)…", "MORDE: the previous log10 base-1 configuration FAILS…", "MORDE: marks back on the bars' margins … FAIL" e "T-02.2: production APPLIES the linear mode with base 0". A metade DOM (L291-295: texto "escala linear", sem "linha de base") repete volume-subaxis-dom-contract.test.ts "T-02.2 (MF-5)…".
(c) duplica?: não. O stub só de volume, sem velas, é o que deixa o instrumento contar tinta sem regra de cor.
(origem): 7a3a1292 "T-02.2 — rodapé de volume em escala linear base 0…". Ablação feita à mão em `gates/T-02.2-builder.md`.
veredito: FICA, com as asserções DOM L291-295 descendo sem custo — ganho estimado 0s. Risco: sem ele, nada prova a calha em pixel no app real.

### 29-volume-direction-wiring-pixel  (tempo: 4.0s, 1 teste)
(a) só-browser: por coluna do canvas real, a tinta da barra de volume é igual à da vela acima, com concordância ≥0.97 e ≥40 colunas por direção. Sem vela, a barra fica neutra (RN-4). Custo: segundo `next start` (L373), `showView` de 2000 barras (L391) e `waitForTimeout(1_000)` (L388).
(b) desce?: a função já desceu. volume-direction.test.ts tem "each bar takes the direction of the candle at the SAME time…" e "a volume slot with no price slot at its time is neutral…". volume-subaxis-dom-contract.test.ts tem um pin de `directionalVolumeSeriesLossless` no fio. A cor no pixel não desce.
(c) duplica?: não no portão. O e2e/30 prova a mesma coisa por barra, mas só roda no universo forte (pulado no gate).
(origem): bca166b9 "T-02.3 — a série de volume… usa a cor da vela". Depois veio 15c5698a (T-05.1): o mount de 120 barras deixava o veredito INCONCLUSIVO.
veredito: FICA — ganho estimado 0s. Risco: sem ele, o portão não prova a ligação cor-da-vela→barra em pixel.

### 30-volume-direction-per-bar-real-data  (tempo: 0.0s, 1 passado + 1 skipped)
(a) só-browser: CA-6, só no universo forte. Zoom pela roda até espaçamento ≥6px (L399-414, `waitForTimeout(250)` por rajada). Hover no centro de cada barra, identidade vinda da legenda, tinta comparada à vela da API real, n≥50.
(b) desce?: o teste "MORDE do instrumento" (3ms) é node puro sobre o `judgeBars` do próprio spec, sem `page`. Poderia ir para node --test, mas o ganho é zero. Unitário de `volumeBarColor`: volume-direction.test.ts "DoD case 1/2/3/4…".
(c) duplica?: não. É o par do 29 no universo forte.
(origem): 2c162bff "T-02.4 — Playwright CA-6: cor da barra de volume i no canvas = direção da vela i na API, n>=50…".
Condição do skip (L446-452): `GET /ready` → `store.path` termina em `.sqlite3` (L155-161, universo fraco). Antes disso afirma que os 4 `/series-history` OHLC responderam 500. Mesmo pulado, paga um goto `networkidle` e 5 fetches (L438-442).
veredito: FICA — ganho estimado 0s. Risco: é o único juiz por barra contra dado real.

### 31-liquidation-pane-pixel  (tempo: 1.6s, 1 teste)
(a) só-browser: rasterização da LWC standalone no Chromium, sem app, com a fixture em node (liquidation-pane-fixture.ts). Lados, base única, mesma altura para o mesmo valor, marcas na borda externa. São 3 ablações nos modos normal e log.
(b) desce?: já desceu, com as mesmas ablações. liquidation-pane-geometry.test.ts tem "against lightweight-charts: the two bases are ≤ 1 px apart, and a 3 px shift is caught (F-6 a)", "…swapping the scale_ref is caught (CA-LIQ)", "…independent autoscale is caught (C-3)", "…each leg's marks stay on its outer edge" e "MORDE: negating the long leg … the feed throws". Lá é em coordenada, 2 modos × 3 janelas.
(c) duplica?: sim. Pixel no app real: e2e/35 (F-6 ≤1px e ablação de troca do `scale_ref`, roda no gate), e2e/32 (lados + `?e2eSwapLiquidationSides=1`) e e2e/34 (proporcionalidade C-3 e ablação log10). A mutação "trocar o `scale_ref`" reprova o 31, o unitário, o 32 e o 35.
(origem): fb42296f "T-04.1 — pane de liquidação fundido…". O próprio cabeçalho diz que é a metade `charts` antes da ligação (T-04.2), "the GEOMETRY the app will receive… before it is wired".
veredito: CORTA (par: liquidation-pane-geometry.test.ts + e2e/35/34) — ganho estimado 1.6s. Risco: perde-se a prova em pixel isolada do app (útil para localizar uma falha) e o modo log em pixel sintético. O produto é linear desde a T-04.4, e o log já é ablação no 34.

### 32-liquidation-fused-pane-sides  (tempo: 6.4s [MEDIDO], 2 testes)
(a) só-browser: tinta de alta/baixa lida no canvas do app real (`getImageData`): 0 px do lado errado do zero em ≥20 colunas, a base a ≤2 px do zero, a barra alta (short) em cima; ablação `?e2eSwapLiquidationSides=1`.
(b) desce?: os lados (`data-liquidation-sides`, `legSides`) e `barScales` "inverted" são DOM/coordenada. Unitário que já cobre: `src/charts/liquidation-pane-geometry.test.ts` "against lightweight-charts: short above the zero line, long below, and swapping the scale_ref is caught (CA-LIQ)" e "the side is the scale_ref's alone…"; `src/app/symbol/pane-registry.test.ts` "T-04.2 MORDE: swapping the two scale_refs…".
(c) duplica?: SIM, o 35. "ablation: the two scale_ref swapped — CA-LIQ rejects" (35:1071) usa a MESMA mutação (`?e2eSwapLiquidationSides=1`) e julga lado/tinta/base balde a balde (CA-LIQ, F-6). O 34:442 afirma a mesma string `barScales`. O que só o 32 tem: a contagem de px do lado errado no canvas INTEIRO, não só na coluna do centro de cada balde.
(origem): c8a0e2b6 "T-04.2 … e2e/32 contra o app real com ablação do scale_ref"; 97dd3c6b (T-04.4). O próprio cabeçalho do 35 diz que 31-34 "each pinned one property" e que o 35 é o DoD.
veredito: FUNDE(com 35): levar `wrongSide===0` sobre o canvas inteiro para o teste de desenho do 35 — ganho ~6.4s, mais um `next start` secundário a menos — risco: só perde a varredura de px fora das colunas amostradas, se a fusão não for feita.

### 33-liquidation-legend-two-magnitudes  (tempo: 22.5s [MEDIDO], 3 testes)
(a) só-browser: (a) quadrado vazado/cheio e a tinta lidos no PNG do screenshot a DPR 2; (b) `forced-colors: active` com repintura real do Chromium, contraste ≥3:1 e 2 ablações CSS; (c) numeral em tinta neutra, computada e em px.
(b) desce?: o teste (d)+(e) é mapeamento legenda↔valor servido, `ausente`, sem sinal, sem terceiro número: estado DOM. Unitário que já cobre: `src/app/symbol/liquidation-legend-swatch.test.ts` "each leg shows ONE value…; no third number", "the lead is right before the numeral, and the numeral is in neutral ink", "MORDE C-7: … background is REJECTED" (só estrutura, não repintura).
(c) duplica?: o teste (d)+(e) SIM, com o 35 CA-9′ (b)(c): 2 numerais iguais à perna na API, `ausente`, sem sinal, nem |long−short| nem soma, com as mesmas ablações (diferença/soma injetadas, 35:1036-1068). (a), (b) e (c) não são duplicados.
(origem): 293b332a "T-04.3 … e2e/33 contra o app real com 3 ablações"; 15c5698a/0fa2c3d8 (zoom-out antes de varrer: o spec reportava-se cego, 25 baldes < 40).
custo: o laço de varredura em :423-427 faz `mouse.move` + `expect` + `snapshot` a cada 0,5 px sobre 20% da largura (~480 voltas [INFERIDO]), depois de `showView` até 2.000 barras (:408). Somam-se as buscas a 0,5 px em :460 e :507, `waitForTimeout(1000)` em :295 e 3× `waitForTimeout(200)` (:567, :575, :587), mais o `startSecondaryNextInstance` (:443).
veredito: FICA para (a+c) e (b); CORTA o teste (d)+(e), que o 35 duplica — ganho ~10s [INFERIDO] — risco: nenhum que o 35 não pegue (ele julga por balde contra a API real da página).

### 34-liquidation-linear-scale-pixel  (tempo: 10.8s [MEDIDO], 3 testes)
(a) só-browser: (e) V-3, a linha do zero desenhada como tinta da grade nas colunas sem barra, com ablação que remove o `stroke()` da grade no canvas (:206). Também os px de altura de pico/mediana e das marcas.
(b) desce?: o teste 2 (ablação log10: pico <4× a mediana, 800k≈400k) é razão entre alturas, e `priceToCoordinate` do headless (modo `logarithmic` já está em `MODES`) daria isso. Unitário que já cobre: `src/charts/liquidation-pane-geometry.test.ts` "the same value is the same height on both legs; independent autoscale is caught (C-3)" e "the visible maximum reaches its band's ceiling…"; `src/app/symbol/liquidation-pane-form.test.ts` "§5.2: marks never share a row with their bars…"; `src/app/symbol/liquidation-pane-dom-contract.test.ts` "T-04.4: the form is linear, and the scale is declared on screen as linear — never as log" (cobre o (f)).
(c) duplica?: não. O 35 não julga escala, log nem grade (grep "log|grid|linear" no 35: só o cabeçalho). O 32 não toca nisso.
(origem): 97dd3c6b "T-04.4 — liquidação em escala linear…"; 0fa2c3d8 migrou para `showView` 240 barras porque com 60 o F-1 lia pico de 1× a mediana (comentário :80-84, spec cego, não defeito do produto).
veredito: DESCE o teste 2 (pico/mediana e razão dos picos sob log, no headless); FICAM os testes 1 e 3 — ganho ~3.6s [INFERIDO] — risco: perde a prova de que `?e2eLiquidationLogScale=1` chega à lib no app real; o (b)/(c) em px do teste 1 fica sem contraprova no browser.

### 35-liquidation-acceptance-per-bucket  (tempo: 61,3 s [MEDIDO], 5 testes + 2 skipped)

**Veredito: FICA, com as ablações mais baratas.** (texto do parcial, inalterado)

**(a) O que só o browser prova.** As bases das duas pernas no mesmo px, os lados e a tinta por balde, os numerais da legenda, e as
marcas de ausente e de zero, tudo no canvas real. Prova ainda o tap do `setData` no **bundle** de produção.

**(b) O que desce para camada inferior.** A rejeição `negate-lower-leg` já é pega em unitário por
`liquidation-pane-geometry.test.ts` ("MORDE: negating the long leg … the feed throws" e "no value < 0 reaches setData"). Os juízes
já têm teste sintético de 7 ms. O teste de ablação no browser só acrescenta que o tap enxerga valores, e o teste de design já cobre
isso via `patched === 1`.

**(c) Duplicação.** Do 31 ao 34, cada spec fixa uma propriedade no agregado. Pendente de confirmação pelo lote 32–42.

**Proposta:**

1. Varrer ~20 baldes nas 3 ablações em vez de ~59, porque o MORDE precisa de uma rejeição só: **~25 s** `[INFERRED]`.
2. Opcionalmente, descer a ablação `negate`: **+15 s**. O risco é a prova de rejeição sair do bundle real.

### 36-oi-candle-pixel-and-ablation  (tempo: 12.1s [MEDIDO], 3 testes)
(a) só-browser: colunas de tinta de vela de alta/baixa no canvas de OI, dominância pela direção dos CONTRATOS e não do preço (PX-3), ablação `?e2eOiLine=1` em que a vela some e a linha aparece (PX-2), hover nos dois regimes (PX-4).
(b) desce?: PX-4 é rótulo/fato DOM. Unitário que já cobre: `src/app/symbol/oi-candle-pane.test.ts` "the label names the native grid of the source…" e "MORDE: a label keyed by the enum…"; `src/app/symbol/oi-candle-dom-contract.test.ts` "RF-9: … each bar coloured by its own close vs open" e "RN-6: the DERIVADO label is derived from derived_from"; `src/app/symbol/pane-registry.test.ts` "T-03.11: the OI pane mounts the registry's kind, `line` only under the DoD-6 ablation".
(c) duplica?: SIM, o 38. Com as mesmas mutações: colorir pelo preço (CA-7, por balde, com balde divergente obrigatório em cada regime) e `?e2eOiLine=1` (DoD-6 "a vela some em todos os baldes julgados"). O D2-bis do 38 confere na legenda `oi_candle_provenance:<derived_from>` (38:951). O cabeçalho do 38 diz "e2e/36 proved … in AGGREGATE".
(origem): 9270e268 "T-03.11 — … e2e/36 de pixel com ablação". Não achei defeito real que só ele pegou.
veredito: CORTA (par 38; mutações: colorir pelo preço e `?e2eOiLine=1`) — ganho ~12.1s, mais um `next start` a menos — risco: perde o sentinela barato. Se o 38 der INCONCLUSIVO ele FALHA, então não há verde silencioso; o texto exato do rótulo fica no unitário.

### 37-oi-regime-marks-pixel  (tempo: 21.6s [MEDIDO], 3 testes)
(a) só-browser: RM-2, fundo modal dentro/fora da faixa no canvas, com ablação `?e2eOiRegimeMarks=0`; RM-3, coluna `provenanceWeak` na regra; RM-3b, nenhuma tinta de regra/faixa nas linhas da legenda (defeito real MF-1, regra riscando o texto da legenda); RM-4, rótulos sem tinta de vela embaixo; RM-6, largura da legenda ±1 px (layout real).
(b) desce?: RM-1 (fatos DOM da derivação) e o teste RM-5 (1m: célula "H/L não medidos" sobre A e B). Unitário que já cobre: `src/app/symbol/oi-regime-marks.test.ts` "Q-1: poll → hist → poll: rules == changes…", "Q-3 (ii)…", "Q-4 (iv): every 1m candle … → not measured"; `src/app/symbol/oi-regime-dom-contract.test.ts` "the DOM publishes the derivation…" e "DG-4: the legend's cell is hlUnmeasured of THE candle it reads…"; `src/app/symbol/oi-regime-primitive.test.ts` "MF-1: at DPR … band and rule start under the legend…" (coordenada).
(c) duplica?: não. O 38 não julga faixa, regra, rótulo nem célula H/L (grep "regime" no 38: só contagem por `derived_from`).
(origem): 9b583c1c "T-03.12 … e2e/37 com ablação; 15/15 mutações vermelhas"; 01194358 "T-03.14 — MF-1: faixa e regra … começam em data-legend-bottom-px, não em y=0" (defeito real, RM-3b); 2a790a30 (passo do TF).
custo: 4 montagens, cada uma com `waitForTimeout(2_500)` fixo (:263), o que dá 10s de sono. O teste 1 monta 2×. `showView` vai a 2.200 barras a partir de 120 (:297, :305), ~30 rodadas fechadas de roda [INFERIDO]. `hoverLegend` faz `waitForTimeout(200)` por hover (:464), 5 vezes. `readCanvas` varre o canvas inteiro por coluna (:375-379).
veredito: DESCE o teste RM-5; FICAM RM-1..4+ablação e RM-6 (RM-6 continua provando no app a ligação legenda→hlUnmeasured, em 5m) — ganho ~5s [INFERIDO] — risco: perde a ligação em 1m, que fica só no unitário. Fora do veredito: trocar o `waitForTimeout(2_500)` pela espera de `data-pane-layers=anchored` corta mais ~2s por montagem [INFERIDO].

### 38-oi-candle-acceptance-per-bucket  (tempo: 187,6 s [MEDIDO], 5 testes + 2 skipped)

**Veredito: FICA, mas com o instrumento enxugado.** (texto do parcial, inalterado)

**(a) O que só o browser prova.** A tinta da vela (subida, descida ou doji) sob o centro de **cada** balde de 5m, com a identidade
do balde lida no crosshair e cruzada com `/series-history`. Prova também que a ablação `?e2eOiLine=1` apaga a vela, e que as velas
da página antiga chegam ao canvas, que é a fiação do pager (E5).

**(b) O que desce para camada inferior.**

- A cor pelo sinal de `close − open` como **mapeamento** já está em `oi-candle-dom-contract.test.ts` (RF-9, por grep de fonte) e em
  `oi-candle-pane.test.ts` (`oiCandlePaneData`, que também põe "nothing on the others", o lado front do CA-8′).
- O merge da página antiga está em `mergeOlderOiCandles`, no mesmo arquivo.
- O CA-8′ do lado da rota é backend, e no GATE o stub constrói as velas no próprio spec.
- Os 2 testes "o instrumento" são puros (~0 s) e podem ir para `node --test`, mas sem ganho.

**(c) Duplicação.** O 36 prova a vela no agregado e o 38 por balde. Não é duplicata, porque o 38 pega a troca de balde que o
agregado não vê.

**Origem.** Os commits `1f51d7cf`, `e369418d` (o flake de fase), `a0734b98` (o E5, com mutante de 80 defeitos) e `41f1555e` (a reentrada).

**Proposta, sem tirar nenhuma asserção:**

1. Medir a fase uma vez e compartilhar entre os 3 testes, com `describe.serial` e a fase no escopo: **~15 s** `[INFERRED]`.
2. Varrer só a ida, mantendo a volta num trecho de ~10 baldes como sonda de atraso: **~60–75 s** `[INFERRED: ~1.370 leituras × 50 ms]`.
3. Na ablação, auditar só a vista de captura: **~20 s**.

### 39-axis-step-per-timeframe  (tempo: 7.1s [MEDIDO] nos 2 que passaram; 5 skipped, 7 testes)
(a) só-browser: rede real. Nenhum `/series-history` do browser na montagem (defeito real: 4h pedia 10 na montagem). Arrasto real em 4h pede página; roda (zoom-in) em 4h não pede. `data-bar-spacing-px` vindo da lib real.
(b) desce?: (1) `gridSlots == initialBars` é mapeamento. Unitário que já cobre: `src/app/symbol/chart/axis/timeframe-window.test.ts` "MORDE D-A: the 4h route window is a 42-slot axis…", "…1h … 168-slot", "the paginator's assembly of a 1h page puts the price panel on 168 slots", "lock CALA: a 4h zoom-IN … does not ask", "lock MORDE: a 4h drag past half a bar … asks". A ablação mexe em 2 sítios (`use-history-pager.ts` E `[symbol]/page.tsx`); só o e2e integra os dois.
(c) duplica?: não com 35 nem com 38. Dentro do próprio spec, a montagem `?interval=4h` é paga 3× e a asserção "montagem em 4h não pede página" se repete (:139 e :234).
(origem): ab293210 "T-05.1 — e2e/39 … (4h pedia 10 /series-history na montagem)"; b7af6bca (trava por posição `isLeftOfMountView`).
skipped: `test.skip(universe !== true)` em :158. Pula quando `E2E_SENTIMENTO_API_BASE_URL` não está declarado ou quando `/ready` tem `store.path` terminando em `.sqlite3` (universo FRACO). ATENÇÃO: o skip vem DEPOIS da montagem e das asserções (1), (3) e sem-request. Os 5 "skipped" rodam e custam ~5 montagens + 5×`waitForTimeout(1500)` (:128), e esse tempo NÃO entra no 7.1s. O teste de roda tem `waitForTimeout(3_000)` em :244.
veredito: FICA (+ FUNDE interno: o caso 4h do laço por TF absorve a checagem de montagem do teste de roda) — ganho ~2s [INFERIDO] — risco: baixo.

### 40-coverage-magnitude-and-legend-room  (tempo: 17.2s [MEDIDO], 10 testes + 2 skipped)
(a) só-browser: C-3 nos 4 viewports × 2 TFs. A-5 truncamento, A-6 uma linha, A-4 áreas, A-7: a forma compacta/cheia escolhida pela container query `@max-[1140px]/legend` com largura medida. F-2 (linha O·H·L·C a 1024) e F-3 por pintura (`paintsIn`, screenshots).
(b) desce?: os testes "A-2 + A-1" (nenhum chip com cobertura cheia; 3/<expected> num balde do meio) e "A-3" (cabeça de 10 min em 5m) são aritmética/estado DOM. Unitário que já cobre: `src/app/symbol/coverage-magnitude.test.ts` "1: 96 rows answered in full ⇒ … nothing renders", "2: … 64/5760", "3: the only partial row inside the head … ⇒ missing 0, head > 0", "7: legs short by the SAME amount ⇒ … no redundant twin chip", "the null rule lives in the pure function…". O A-1 contra o servido continua nos 8 testes C-3 (:1088-1091).
(c) duplica?: não com 35 nem com 38.
(origem): fca1cc8c "T-05.4 — e2e/40 com A-1..A-6 … A-5 a 1024 reprova (escala linear some com o chip inline)" (defeito real); 7a3c6997 (C-3/A-7, K-1, K-3); ce6519f9 (T-05.6).
custo: 13 montagens no portão (A-2+A-1 sozinho faz 4: 15m/4h × full/mid-3). Cada montagem passa por `settleLayout`, que faz `waitForTimeout(400)` em laço até 2 leituras iguais (≥0,8s, :446-447). `paintsIn` tira 3 screenshots por tentativa e por termo (:709-716) a 1024/1280. Há também o `startSecondaryNextInstance` (:987).
skipped: os 2 testes REAL (:1152, :1265), `test.skip(!readerPresent)`: `/ready` com `store.path` `.sqlite3` (sem leitor de janela de `md.series`). Pulam cedo, logo depois de um `fetch /ready`.
veredito: DESCE "A-2 + A-1" e "A-3"; FICAM os 8 testes C-3 — ganho ~6s [INFERIDO, 5 montagens] — risco: perde a prova no app de que cobertura cheia não deixa nenhum nó `[data-coverage-chip]` e de que a cabeça é publicada a partir das linhas por `interval` que o stub serve como o backend.

### 41-band-tag-and-timeframe-heading  (tempo: 8.4s [MEDIDO], 10 testes)
(a) só-browser: N-1 (6 testes), a etiqueta "Últimas 4 h" inteira e dentro do plot, recortada pelos ancestrais com `overflow` real (o defeito "Última"), e `borderLeftWidth` computado em 1024/1280 × 1m/1h/4h. Layout real; jsdom não tem.
(b) desce?: N-2 (4 testes) é texto do cabeçalho, sufixo sr-only, `title`, sem `aria-label`. Unitário que já cobre: `src/app/symbol/chart/legend/pane-legend.test.ts` "N-2 MORDE: on 1h every heading puts 1h OUTSIDE the parenthesis…", "N-2: the screen-reader suffix and the title carry the word…" (inclui 15m, :260), "N-2: the TF token appears on EVERY TF…", "N-2: … NEVER an aria-label". Só o browser dá o `text-transform` computado (risco 1m→1M) e o nome acessível do Chromium. `src/app/symbol/long-short-band.test.ts` "N-1: the band is clamped to the plot…" cobre a conta do N-1.
(c) duplica?: não com 35 nem com 38.
(origem): 6fdcdfaa "T-05.6 — … etiqueta ancorada à direita dentro do plot (N-1), cabeçalho com o TF ativo (N-2)" (defeitos reais do W7-DESIGN-REVIEW); ce6519f9; e28d3f80.
veredito: FUNDE interno: o N-2 lê os cabeçalhos dentro das montagens 1280/{1m,1h,4h} do N-1; o 15m DESCE (já está no `pane-legend.test.ts`) — ganho ~3s [INFERIDO] — risco: baixo; o `text-transform` e o nome acessível seguem provados em 3 TFs.

### 42-view-helper  (tempo: 19.6s [MEDIDO], 5 testes, serial)
(a) só-browser: o próprio `view.ts` (roda e arrasto em laço fechado na lib real) se prova: `lastBars` 60/600/2.000, `timeRange` em 5m, 0 gestos quando o alvo já está na tela, MORDE (d)/(e). (f): depois de uma página real, `data-window-start-ms` ainda nomeia o slot 0, lido pela legenda sob o crosshair (integração pager + eixo).
(b) desce?: (d) "alvo além do piso lança, sem gesto" é conta pura (`plot.width/0.5`) e só usa a montagem para ler a largura. Unitário que já cobre: nenhum achado (grep: `showView|view.ts` em *.test.ts).
(c) duplica?: não com 35 nem com 38. Ele é a base de 33/34/35/37/38 (todos chamam `showView`).
(origem): 0fa2c3d8 (nasceu como e2e/41 na T-06.1); 19c3060e "spec do helper … renumerado 41→42".
custo: 5 montagens com espera de `anchored` + poll de `data-price-candles` (:133-136), mais `startSecondaryNextInstance` (:176). `wheelZoom` espera a mudança de range a cada evento (~37 eventos para ir de 60 a 2.000 [INFERIDO]). Cada `drag` tem 2× `waitForTimeout(100)` (`view.ts:306,308`). `legendAt` faz `waitForTimeout(150)` + `steps:5` (:144-147). (f) espera a página ser desenhada.
veredito: FICA (+ FUNDE interno: (d), que não move a vista, roda na montagem do (e) antes do gesto deste) — ganho ~2.5s [INFERIDO] — risco: se o helper perder a autoprova, os 5 specs que dependem dele andam às cegas.

## 4. Totais

### 4.1 Por veredito final (n = 42)

| veredito | n | specs |
|---|---:|---|
| FICA | 23 | 01, 03, 09, 11, 15, 18, 20, 23, 24, 25, 27, 28, 29, 30, 33, 34, 35, 37, 38, 39, 40, 41, 42 |
| FUNDE | 15 | 02, 04, 05, 06, 07, 08, 10, 12, 13, 14, 17, 19, 22, 26, 32 |
| DESCE | 2 | 16, 21 |
| CORTA | 2 | 31, 36 |

Dos 23 FICA, 12 ficam **praticamente iguais**: 01, 03, 09, 11, 15, 20, 23, 25, 27, 28, 29 e 30, com ganho 0 ou residual (o 15
só perde o CA-0, e o 28 só perde as asserções de DOM). Os outros 11 ficam **mais magros**: 18, 24, 35, 38, 39, 41 e 42 por fusão
interna ou enxugamento do instrumento, e 33, 34, 37 e 40 por descida ou corte de uma parte.

**Partes que descem ou saem de um spec que sobrevive.** Descem 08-t1, 14 C-1 (portão), 15 CA-0, 24 CA-5, 28 L291-295, 34-t2, 37
RM-5, 40 "A-2 + A-1" e "A-3" e o 15m do 41-N-2. Saem o M-2 do 13 e o (d)+(e) do 33.

**O que mudou em relação aos lotes.** O 12 passou de FICA para FUNDE (§5 C-1) e o 27 de FUNDE para FICA (§5 C-3). O 18 e o 41
passaram de "FUNDE interno" para FICA (enxugado), pela convenção de §2. Os totais que cada lote declarou, transcritos sem
alteração:

- lote 01-11: Totais: FICA 4 (01, 03, 09, 11) · FUNDE 7 (02, 04, 05, 06, 07 → 01; 08, 10 → 09) · DESCE 0 no nível de spec (sub-partes descíveis: 08-t1, 09-t1/t2, 07-D3.5) · CORTA 0 — ganho estimado do lote ≈ 12.8s de 34.5s (inclui ~4s [INFERIDO] de ajuste no stub do 02-B6).
- lote 12-21: Totais: FICA 3 (12, 15, 20) · FUNDE 5 (13, 14, 17, 18, 19) · DESCE 2 (16, 21) · CORTA 0 (só o teste M-2 dentro do 13) — ganho estimado do lote ≈ 31s [ESTIMADO] de 64.7s medidos (+ ~18–20s se o 22 for absorvido pelo 20, contar uma vez só), sem contar os ~3–4s escondidos dos skipped do 15, que continuam sendo pagos.
- lote 22-31: Totais: FICA 6 (23, 24, 25, 28, 29, 30), FUNDE 3 (22→20, 26→18, 27→16), DESCE 0 como spec inteiro (CA-5 do 24 e o DOM do 28 descem em parte), CORTA 1 (31). Ganho estimado do lote: ~42.5s (22: 19.9 + 24: ~14 + 27: ~5 + 26: ~2 + 31: 1.6).
- lote 32-42: Totais: FICA 2 (39 e 42, ambos com fusão interna); FICA+CORTA parcial 1 (33); FICA+DESCE parcial 3 (34, 37, 40); FUNDE 2 (32→35, 41 interno); CORTA 1 (36→38). Ganho estimado do lote ≈ 50s (6.4+10+3.6+12.1+5+2+6+3+2.5), mais 2 `next start` secundários a menos (32 e 36). Não sei se o `beforeAll` cai dentro do `✓ (Ns)`: [INFERIDO], não medido.

### 4.2 Ganho, deduplicado

| parcela | s `[INFERIDO]` |
|---|---:|
| 40 specs fora 35/38 (soma da coluna de §2) | ~131,6 |
| 35 + 38 (enxugamento do instrumento, do parcial) | ~115–140 |
| **total deduplicado** | **~247–272**, ou seja **45–49 %** dos 550,9 s `[MEDIDO]` |

**Como a soma ingênua erra por ~25,5 s** `[INFERIDO]`. Os lotes somam 12,8 + 31,3 + 42,5 + 50,6 = 137,2 s. Quem somar também o
"+ ~18–20 s se o 22 for absorvido pelo 20" que o lote 12–21 deixou fora do total chega a ~157 s, mais 115–140 s, ou seja
**~272–297 s**. Para deduplicar:

- **−19,9 s.** O 22 → 20 aparece nos dois lotes e conta uma vez só, na linha do 22.
- **−5 s.** O 16 e o 27 não podem sumir os dois, porque um é anfitrião do outro (§5 C-3). Fica só o ganho do 16.
- **−1,5 s.** O CA-10 do 19 fica onde está (§5 C-4).
- **+0,9 s.** Os dois anfitriões de `/symbol` viram um só (§5 C-1).

**Fora da tabela e fora dos 550,9 s.** Os skips depois da montagem custam ≥ ~12 s (§6.1). Esse tempo cai dentro dos ~25 s de
overhead de §1.2, e não na soma das linhas `✓`. A hipótese de workers (§1.3, até ~245 s) é **independente** e não entra na soma.
Ela mede o que sobra depois deste corte, e não o tempo de hoje.

## 5. Conflitos de destino, e a resolução de cada um

**C-1. Dois anfitriões para o mesmo goto de `/symbol`.** O lote 01–11 elege o 09, que absorve o 08 e o 10. O lote 12–21 elege o
12, que absorve o 13-t3, o 14 e o CA-9/DoD-3/DoD-4 do 19. O 15 CA-3 cita os dois.
- **Resolução:** anfitrião único, o 09. A linha `src/app/symbol/oi-` do `scope-map.tsv`, que hoje cita o 08, já teria de ser
  re-apontada pela fusão 08 → 09. O teste de página do 12 entra no 09, e os 2 testes sem browser do 12 (5 ms e 3 ms `[MEDIDO]`)
  ficam onde estão.
- **Ganho:** +~0,9 s, uma montagem a menos `[INFERIDO]`.
- **Custo:** o teste cresce, e cada painel vai num `test.step` com `expect.soft`, para que a falha de um painel não esconda a
  dos outros. Um diff num painel passa a rodar o goto de todos, o que é aceitável porque é um goto só.

**C-2. 13-t2 → 32 enquanto 32 → 35.** É uma cadeia.
- **Resolução:** o destino final é o 35. O teste de desenho do 35, que roda no portão, recebe três coisas: o `wrongSide === 0`
  sobre o canvas inteiro (do 32) e os dois contadores que só o 13 tem (`cohortGroupsInPage` e `layerRootsInAnchor == 1`).
- **Ganho:** não muda (13: ~2,8 s, 32: ~6,4 s).

**C-3. 27 → 16 enquanto 16 DESCE.** É um ciclo. O lote 12–21 manda o settle do 16 para o 27, e o lote 22–31 manda o 27 para o 16.
- **Resolução:** o 27 é o anfitrião (FICA). Ele carrega a asserção hard de um defeito real (MF-A, a 1ª soltura cortava 760
  slots). O t2 do 16 já está coberto por `axis-sync.test.ts`. O t1 do 16 entra no 27 como `data-axis-sync-write-count == 0` e
  1 s de silêncio sobre os 2 arrastos de 150 px do 27.
- **Vantagem:** some o risco que o lote 22–31 apontou, de os arrastos maiores do 16 pedirem página e deslizarem a borda.
- **Ganho:** só o do 16 (~9 s). O ~5 s do 27 sai da soma.
- **Perda:** o write-count passa a ser provado em 2 gestos, e não em 3. Com `panelCount = 1`, o invariante é unitário.

**C-4. 19 CA-10 → 24 CA-5 enquanto o 24 CA-5 DESCE.**
- **Resolução:** o CA-10 fica no 19 (2,9 s `[MEDIDO]`). A propriedade dele não desce: o rótulo `oi_provenance` muda pelo SSR
  quando só a chave do catálogo muda, incluindo o caso `unresolved`. Para hospedá-lo, o CA-5 do 24 teria de ficar no e2e, e o 24
  perderia ~7,1 s de descida para que o 19 ganhasse 2,9 s.
- **Ganho do 19:** ~4 s → ~2,5 s. As três montagens somam CA-9 822 ms + DoD-3 903 ms + DoD-4 831 ms `[MEDIDO]`, menos o resíduo
  das asserções no anfitrião `[INFERIDO]`.

**C-5. O 20 absorve o 17 e o 22.** Os destinos não conflitam, mas o anfitrião fica sobrecarregado. O 20 é o spec que reprova sob
carga (917,5 ms contra ≤ 100 ms, `CLAUDE.md`), e passa de 24,2 s `[MEDIDO]` para ~30 s `[INFERIDO]`.
- **Resolução:** ordem fixa. Primeiro o arrasto contínuo do 17 (p95 e piso de ≥ 61 amostras), depois o fluxo do 20, e no fim o
  `data-chart-mount-count == 1` **hard**, com mensagem própria. Cada veredito vai num `test.step`.
- **Efeito em §1.3:** o projeto serial passa de {01, 02, 17, 20, 21, 25, 40} para {01, 02, 20, 21, 25, 40}.

**C-6. 15 CA-3 → "o goto do CA-2" (lote 12–21) contra "o CA-3 repete a montagem de 08/12" (o mesmo lote).** No portão, o CA-2
pula **depois** da montagem (§6.1), e o CA-3 lá dentro sairia no relatório como skipped.
- **Resolução:** o CA-3 vai para o anfitrião 09.

**C-7. O 31 CORTA citando o log10 do 34, enquanto o 34-t2 (log10) DESCE.** Com os dois, não sobra pixel em escala log no e2e.
- **Resolução:** aceitar os dois. O produto é linear desde a T-04.4, e o log só existe como ablação. A coordenada log continua em
  `liquidation-pane-geometry.test.ts` (2 modos × 3 janelas, pelo lote 22–31).
- **Perda declarada:** a prova de que `?e2eLiquidationLogScale=1` chega à lib no app real. Para mantê-la, o 34-t2 fica, e o
  ganho cai ~3,6 s.

**C-8. O 33 (d)+(e) CORTA → 35 CA-9′(b)(c), enquanto §1.4 lista o CA-9′(b)(c) como candidato à futura camada de componente, e
a proposta do 35 reduz as ablações a ~20 baldes.**
- **Resolução:** é questão de ordem. O corte do 33 (d)+(e) só vale enquanto o CA-9′ estiver no e2e. Quando ele descer, o teste
  de componente cobre os dois.
- **Condição:** a redução a ~20 baldes mantém as ablações de diferença e de soma (35:1036-1068), com pelo menos uma rejeição cada.

**C-9. O 36 CORTA → 38, enquanto o 38 é enxugado (ablação só na vista de captura).** O PX-2 do 36 também afirma que **a linha
aparece** sob `?e2eOiLine=1`. Pelo texto do lote 32–42, o DoD-6 do 38 só afirma que a vela some.
- **Resolução:** antes de cortar o 36, o teste de ablação do 38 ganha a leitura de tinta da linha na mesma vista, a custo ~0
  `[INFERIDO]`. O CA-7 enxugado mantém um balde divergente por regime, que é o PX-3 do 36.
- **Ordem:** enxugar o 38, acrescentar a linha e só depois cortar o 36.

**Verificados e sem conflito:**
- o M-2 do 13 → 23, com o 23 em FICA;
- o 26 → 18, com o 18 em FICA como anfitrião. O laço de retry do 18 precisa reler o `hitsBefore` **e** a tag na mesma tentativa;
- o 24 CA-5 desce, e o 41 continua sendo a testemunha dos títulos derivados no app real;
- o 14 C-1 desce, e o 18 e o 39 continuam exercendo a rota `?interval=`.

## 6. Custos escondidos

### 6.1 Skip depois da montagem: 15, 30 e 39

**Dos 14 skipped, 8 pagam a montagem antes de pular** `[MEDIDO: grep -E '^\s+- +[0-9]+ \[chromium\]' no log → 15×2, 30×1,
35×2, 38×2, 39×5, 40×2]`. Os outros 6 (35, 38 e 40) pulam cedo, logo depois de um `fetch /ready` ou de ler o env.

| spec | o que roda antes do `test.skip` | custo `[INFERIDO]` |
|---|---|---:|
| 15 (l.841, l.975) | CA-2: goto, `waitForPaintedChart` (2 s fixos), ink == 0, drawn == 0 e screenshot. CA-4: goto e fetch | ~3–4 s |
| 30 (L446-452) | goto `networkidle`, 5 fetches e a asserção de que os 4 OHLC dão 500 | ~1 s |
| 39 (:158) | 5 montagens, 5 × `waitForTimeout(1500)` (:128) e as asserções (1), (3) e sem-request | ≥ 7,5 s |

São **≥ ~12 s** fora da soma das linhas `✓`, ou seja, dentro dos ~25 s de "overhead" de §1.2 `[INFERIDO]`. Há dois problemas:

1. **O custo.**
2. **A contagem mente.** O relatório diz "5 skipped" no 39, mas as asserções do universo fraco rodaram e passaram. É justamente a
   que pegou um defeito real (4h pedia 10 `/series-history` na montagem). Uma regressão ali ainda reprova, porque a asserção lança
   antes do skip, mas um verde ali fica invisível.

O 21 é da mesma classe: no universo fraco ele faz 3 arrastos e ~4 sondagens de assentamento (7,3 s, lote 12–21) antes de saber
que não há leitor.

**Recomendação transversal:**
- Uma fixture `universe` de escopo de worker em `helpers.ts` sonda `/ready` **uma vez**. É o padrão que o 35 e o 40 já usam
  (`seriesWindowReaderPresent`). O `test.skip` vai na primeira linha do teste.
- O que morde no universo fraco vira **um teste próprio, que passa**. O que é do universo forte vira outro, que pula antes do goto.
- **Falsificador:** os 8 skipped-depois-da-montagem caem a 0, e o intervalo 576 − 551 s de §1.2 encolhe ≥ ~10 s.

### 6.2 `waitForTimeout` fixos

**57 chamadas com literal, em 25 specs mais o `view.ts`, somam 44,65 s numa única passada por chamada**
`[MEDIDO: grep -oE 'waitForTimeout\(\s*[0-9_]+' frontend/e2e/*.ts, somado por arquivo]`. Há ainda 3 chamadas com variável:
`quietMs` no 16:137 e no 21:119, e `IDLE_AFTER_PAGING_MS` no 20:798 `[MEDIDO: grep]`. O custo real é maior, porque a chamada roda
por montagem ou por gesto `[INFERIDO, pelos textos dos lotes]`:

- 24: `openSymbol` × 7 × 2 s ≈ 14 s;
- 37: 4 × 2,5 s = 10 s;
- 39: 1,5 s × 7 montagens;
- 22: a janela `NO_REQUEST_WAIT_MS` de 2,5 s × 4 arrastos ≈ 10 s. Não é `waitForTimeout`, é a mesma classe;
- 33: 0,5 px por volta, ~480 voltas.

**Recomendação transversal:** separar as duas classes de espera.

1. **Espera positiva** (algo vai acontecer). Troca-se por condição: `data-pane-layers=anchored` (o 35 e o 42 já esperam assim),
   o poll de `data-price-candles`, 2 `requestAnimationFrame` (o `readLegend` do 38) ou `expect.poll`. Um único helper
   `waitForChartSettled(page)` em `helpers.ts` substitui as variantes por spec.
2. **Janela negativa** (provar que **nada** acontece: `quietMs`, `IDLE_AFTER_PAGING_MS`, `NO_REQUEST_WAIT_MS`). É legítima,
   porque ausência só se prova esperando. Mas vale **uma por teste, e não uma por gesto**, com o valor justificado no comentário.
   No 22 isso já some com a fusão no 20.

**Falsificador:** o `grep -c` de 57 cai, e o ganho aparece no tempo por spec do log seguinte.

### 6.3 Montagens repetidas

- **A mesma página em specs diferentes.** O goto padrão de `/symbol` é pago por 08, 09, 10, 12, 13 (t2 e t3), 14, 15 (CA-3),
  19 (3×) e 21 (B), o que dá ≥ 12 montagens da mesma página no mesmo universo `[INFERIDO: contagem pelos textos dos lotes]`. O
  `/console` é pago por 01, 04, 05, 06 e 07.
- **A mesma página dentro do arquivo:** 24 (7 `openSymbol`), 40 (13 montagens), 42 (5), 37 (4), 39 (4h × 3), 18 (testes 2 e 3)
  e 19 (3).
- **A instância Next secundária:** 25 chamadas de `startSecondaryNextInstance` em 21 specs `[MEDIDO: grep -c]`. Com as fusões e
  os cortes de 17, 22, 32 e 36, sobram 21 `[INFERIDO]`.

**Recomendação transversal:**
1. Entre specs, um anfitrião por página e universo: o 01 para `/console` e o 09 para `/symbol` (§5 C-1).
2. Dentro do arquivo, `test.describe.serial` com a página montada em `beforeAll` **só** para leituras em repouso da mesma
   montagem, com `test.step` e `expect.soft`. O 24 separou os testes de propósito (L464, "one red criterion never hides the
   next"), e o `expect.soft` preserva isso.
3. A instância Next secundária vira uma fixture de escopo de worker, chaveada pela receita do stub. O 17, o 20 e o 22 já usam a
   mesma.

**O que se paga:** testes que compartilham página ficam acoplados pela ordem, e um `--grep` de um teste isolado paga a montagem do
mesmo jeito. Aceitar só onde a leitura é em repouso, nunca entre gestos.

### 6.4 O instrumento serial (já em §1.1, citado para fechar a lista)

Os vereditos por balde do 33, do 35 e do 38 identificam o balde por varredura serial do crosshair, a ~50–70 ms por leitura
`[INFERIDO, §1.1]`. **Recomendação transversal:**
- pôr o ponteiro direto no centro do balde, calculado pela escala de tempo da página, em vez de px a px;
- varrer em uma direção só, com a sonda de atraso num trecho curto, porque `lagPx = 0` nas 6 vistas `[MEDIDO, §1.1]`;
- medir a fase uma vez por arquivo.

O ganho do 35 e do 38 já está em §4.2. O do 33 entra se o laço de :423-427 adotar o mesmo esquema `[INFERIDO, não somado]`.
