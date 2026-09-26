# W1-QA r3: QA de front da wave W1 depois do W1-FIX2

**Feature:** `paineis-de-fluxo` · **Base:** `493cd66` (código em `1ebee50`, `wave/paineis-f01`) · **Data:** 2026-09-26
(UTC, 03:34–04:20) · **Agente:** `frontend-qa` · **Janela:** exclusiva · **Portas:** 8835/4335
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/01_esqueleto.md` (DoD 1–12), `handoff/FIX-regressoes-fase05.md`,
`gates/W1-QA-r2.md` (BLOCKER-1/2), `gates/W1-DESIGN-REVIEW-r2.md` §8 (MF-B′) e
`wf_820bac26-f99-2/…/gates/T-01.11-design-review.md` (MF-1/MF-2)

## 0. Veredito: APPROVED

Os dois BLOCKER do r2 estão fechados, e cada um foi provado por mutação, não pelo relatório do builder:

1. **MF-B′ (volume `ausente` em TF ≠ `1m`) está fechado no app real, com dado real.** Em `4h` e `15m`, parado, a
   legenda do volume é igual à última barra fechada que a API serve. Sob o crosshair, **0** posições com barra servida
   leem `ausente` e **0** leem valor errado. A ablação (tirar a janela de `legendSlots` nos 2 call sites) devolve
   `ausente` em **24 de 24** posições em `4h` e deixa o `1m` intacto (§3).
2. **Doc delta de `D-C3.5`:** a nota de CORREÇÃO está em `SPEC-008` §`D-C3.5`, com a regra, o código, o motivo, quem
   escolheu (rotulado `[INFERRED: escolha de agente]`, e não como fala ou escolha do owner) e o custo medido (§4).

`make verify` deu **VERDE, 8 portões**, com `__pycache__` purgado antes da rodada. Não houve vermelho, nem dentro nem
fora da lista de conhecidos. As 3 regressões da fase 05 estão mortas no gate e no app real, e as escalas de CVD e de
liquidação continuam legíveis. **Mutações rodadas: 13. Todas mordem** (§5). Ficam WARNINGs herdados (§7), nenhum
bloqueante para esta fase.

## 1. Checklist

```
## QA Gate (Front) — Fase 01: esqueleto (+ 1.F1/1.F2/1.3′/1.7′, T-01.10, T-01.11-FIX, W1-FIX, W1-FIX2)
- [OK]   DoD da fase, item a item (§2), cada um com o comando
- [OK]   Lógica fora do componente: legendSlots sai de nonNegativeFlowSlotsFromHistoryRows (view-model.ts, puro) e
         keepFloor de paneScaleMargins (charts/pane-stack-layout.ts, puro). Os dois têm *.test.ts
- [OK]   Contrato tipado na borda: tsc --noEmit --strict dentro do lint-frontend, rc=0
- [OK]   Sem segredo no cliente: portão `regras`, 0 bloqueio (77 avisos, os mesmos do r2)
- [OK]   Acessibilidade: e2e/23 e e2e/24 verdes no make verify. Não auditei além disso
- [OK]   Testes existem, passam e têm o par morde/cala: 1091 de front (0 fail). Os consertos do W1-FIX2 têm teste
         que reprova sem eles: V1/V2/V3/K1/K2, 5 de 5 (§5). A exceção é o `blur` de P-1, sem teste (W-5)
- [FAIL] Cobertura do front [NÃO MEDIDO]: não há instrumento, nem no node --test nem no Playwright, e o plano
         não declara alvo. Não bloqueia. Back: 96,31% (pytest-cov, dentro do make verify)
- [OK]   Sweep de regras sem bloqueante: 0 bloqueio (portão `regras` do make verify)
- [OK]   make verify verde: 8 portões, e2e 68 passed / 2 skipped (os 2 skipped são e2e/15 CA-2/CA-4, W-4)
- [OK]   Doc delta: SPEC-008 §D-C3.5 emendado, docstring de view-model.ts atualizada, campo `Doc delta:` presente
         no W1-FIX2-builder.md:50. docs/INDEX.md: git diff master...HEAD → 0 linhas removidas (append-only)
- [OK]   Rótulos de força: o único [NÃO MEDIDO] do W1-FIX2 (validação no app real) foi medido aqui (§3). O
         `[INFERRED: escolha de agente]` da emenda de D-C3.5 está correto: não é fala nem escolha do owner
```

## 2. DoD do plano 01, item a item

| DoD | como foi medido | resultado |
|---|---|---|
| 1 Spike | `gates/T-01.0-spike.md` | presente `[DOC]`, não rodei de novo |
| 2 Um gráfico | `e2e/24:383` no `make verify` | verde |
| 3 Um eixo | `e2e/24:427` | verde |
| 4 Crosshair e legenda == API | `e2e/24:476` (stub), mais `legcheck.cjs` no app real, comparando a legenda com o corpo de `/series-history` capturado pelo proxy | `1m`: **120/120** comparações concordam. `15m`: **167/168**. `4h`: **162/168**. O universo cresceu de 144 para 168 porque o **volume agora entra no mapeamento** (no r2 ele nunca lia valor). As 7 divergências são **todas** leitura `retido` de série STOCK (preço em `15m` slot 4350 e em `4h` slot 5040, OI em `4h` slot 3840). O texto da legenda traz o sufixo (`"84199.9retido"`), e esse é o desenho `[MEDIDO: head-mfb-facts.json]` |
| 5 Legenda derivada | `e2e/24:550` | verde |
| 6 Formas 08..15 | `make verify` (e2e) | verdes. `e2e/15` CA-2/CA-4 **SKIPPED** (universo fraco, 0 velas), como no r1 e no r2 (W-4) |
| 7 Latência | fatos do `make verify` | `e2e/17`: p95 **32,7 ms**, p50 16,7, max 37,6, n=86 (teto 160, banda de mediana ≤ 49,4). `e2e/20`: página p95 **83,7 ms**, n=15 (teto 400). Intra-gesto: max **81,9 ms**, p95 41,2, n=323, `over_ceiling_n=0` (teto 160). O custo de `D-C3.5` que o r2 mediu (página p95 89,7/114,3 ms) caiu nesta rodada. n=1, sem atribuição causal |
| 8 `make verify` + purga | purga de `__pycache__` e depois `E2E_API_PORT=8835 E2E_NEXT_PORT=4335 make verify` | **VERDE**. Log em `/tmp/verify-wave-paineis-f01-20260926T033416Z.log`. Front **1091** pass / 0 fail em 4 suítes. Back **2728 passed**, 96,31%. `boundaries` 7 kept. `regras` 0 bloqueio. e2e **68 passed / 2 skipped** |
| 9 `18` | `e2e/18` no gate, `e2e/26` no gate e no app real, e a mutação B **dentro e fora** da faixa do relógio | gate verde. App real: `1m` desenha **3492**. O clique em `4h` desenha **23**, igual à carga direta (23). O clique em `5m` desenha **716**, igual à carga direta (716). B morde nas duas faixas (§5) |
| 10 `16` | `e2e/16` no gate e no app real, mais a mutação D | `host_write_count_delta` = **0** nos 3 gestos, no gate e com dado real. D morde `e2e/16:149` |
| 11 `20` | `e2e/20`, `e2e/22`, a mutação C e o probe fundo no app real | `chart_mount_count_after=1` no gate e no real (`history_pages_drawn=2`). O probe fica em `mounts=1` do começo ao fim, com 25 arrastos. `page_boundary_jump_slots` = 12× 0. `gestures_parked_after_page_n=0`. C morde `e2e/22:202` e `e2e/20:728` |
| 12 Baseline da `T-01.10` | `gates/T-01.10-latencia.md` | presente `[DOC]` |
| MF-1 / MF-2 | `e2e/24:597` e mutações E/F, mais a captura real 1280×1200 | no pixel real, o CVD rotula `2000.00` em `1m` e `50000.00`/`25000.00` em `4h`. Nada de `2e+37`. A liquidação **não tem rótulo** no eixo log, em nenhum TF. E e F mordem `e2e/24:597` (§5) |
| MF-A (item 1 do §2 do design r2) | `probe.mjs` com os gestos do `drag3.mjs` no app real | `T = 03:54` e *"há 0 min"* nos 3 estados. `e2e/27` com dado real: `window_end_lost_minutes` = 0 e 0. Resíduo da sequência funda em W-1 |
| Preço legenda == eixo (item 2 do §2 do design r2) | PNG `4h`/`15m` do probe | `4h`: legenda `83971.4`, eixo `83971.40`. `15m`: `83988` e `83988.00` |
| **MF-B′** | §3 | **fechado**, com ablação |

## 3. MF-B′ (o BLOCKER-1 do r2): fechado, medido no app real

**Setup:** `next build` + `next start :4335` com `INGEST_HEALTH_API_BASE_URL` apontando para o proxy só-leitura
`:8835 → :8000`, que grava os corpos de `/series-history`. HEAD: **385** GETs, `refused=0`. Ablação: **70** GETs,
`refused=0`. **Nada foi semeado.** `volcheck.cjs` compara a legenda do volume (série `ef3033…`) com a barra servida
no instante de abertura do bucket de cada slot.

| estado | legenda em repouso | última barra fechada servida | crosshair: com barra, leu valor | com barra, leu `ausente` | valor errado | sem barra, `ausente` |
|---|---|---|---|---|---|---|
| `4h` direto | **14515.595** | `14515.595` (bar `1790366400000`) | **21** | **0** | **0** | 3 |
| `4h` por clique | **14515.595** | `14515.595` | **21** | **0** | **0** | 3 |
| `15m` direto | **314.599** | `314.599` (bar `1790393400000`) | **9** | **0** | **0** | 15 |
| `1m` direto | **3.989** | `3.989` | 8 | 0 | 0 | 16 |

O falsificador do `W1-DESIGN-REVIEW-r2` §8 pede três coisas. As três valem. Parado, a legenda mostra a soma da última
barra fechada. Sob o crosshair, ela lê valor em todo x com barra servida. E o número é a soma que a API serve para
aquela barra, e não outro número. Os `ausente` que sobram caem onde a API **não tem linha** naquele bucket, e então
são verdadeiros. A tela confirma: `Volume (1m, BTC)   14515.595` em `4h` e `314.599` em `15m`, com as barras
desenhadas logo abaixo.

**Ablação no app real (M-V):** `legendSlots` sem a janela nos 2 call sites (`panel-assembly.ts` e
`[symbol]/page.tsx`), com rebuild. Em `4h`, direto e por clique, a legenda fica **`ausente` (`SEM_PONTO`) em
repouso** e em **24 de 24** posições com barra servida. Em `15m`, fica `ausente` em repouso. No `1m` não muda nada:
`3.989`, 8 de 8. Revertido com `git checkout --`, e `git status --short` ficou vazio.

## 4. `D-C3.5` (o BLOCKER-2 do r2): emenda conferida

`docs/specs/SPEC-008-candle-real-e-eixo-unico.md` §`D-C3.5` ganhou a nota *"CORREÇÃO, 2026-09-26"* com as partes que
o r2 pediu: a regra `max(5.000, seed + 1 página)` = 6.260, o código (`history-page-window.ts::effectiveMaxAccumulatedSlots`),
o motivo (M-A, 760 min), o rótulo de quem escolheu (`[INFERRED: escolha de agente, não do owner]`), o custo medido
com `[DOC: gates/W1-QA-r2.md §4]` e o resíduo conhecido (W-1). A linha original **não foi reescrita**: a nota foi
acrescentada abaixo dela. A mutação U4 do r2 (`effectiveMaxAccumulatedSlots` devolve o teto cru) não foi repetida
aqui, porque o código dela não mudou no W1-FIX2 (`git diff 4a17e35..HEAD -- frontend/src/app/symbol/history-page-window.ts`
→ vazio).

## 5. Mutações rodadas por este QA (13/13 mordem)

Cada mutação foi aplicada com `sed`, medida e revertida com `git checkout --`. `git status --short` ficou vazio depois
de cada uma. As unitárias rodaram com `node --conditions=react-server --test <arquivo>`, e as e2e com
`scripts/e2e-env.sh up 1 8835 4335` (universo fraco), por `mut.sh`.

| # | mutação | reprova | cala |
|---|---|---|---|
| V1 | `panel-assembly.ts`: `legendSlots` sem `s2Window` | `panel-assembly.test.ts` **1 fail** / 9 · `volume-legend-grid-contract.test.ts` **1 fail** / 4 | — |
| V2 | `[symbol]/page.tsx`: `legendSlots` sem `routeWindow.window` | `volume-legend-grid-contract` **1 fail** / 4 | — |
| V3 | `<LegendValue seriesId="volume" slots={volume.slots}>` | `volume-legend-grid-contract` **2 fail** / 4 | — |
| M-V | V1 + V2 juntas, no app real, com rebuild | `4h`: **`ausente` em 24/24** e em repouso · `15m`: `ausente` em repouso | `1m` inalterado (8/8 valor) |
| K1 | tirar `keepFloor: true` da binding da barra de liquidação | `liquidation-geometry.test.ts` **1 fail** / 15 | — |
| K2 | `pane-stack-layout.ts`: `bottom = base.bottom * (1 - reserve)` sempre | `liquidation-geometry` **1 fail** / 15 · `pane-stack-layout.test.ts` **1 fail** / 16 | — |
| B | `key="const"` em `<SymbolClient>`, às 04:05:56 (**dentro** da faixa `HH:05–HH:10`) | `e2e/26` 5m e 4h (**2 failed**) | `e2e/18` 4/4 verde: cego por desenho dentro da faixa (W-3) |
| B2 | idem, às 04:19:27 (**fora** da faixa) | `e2e/18:120` e `e2e/18:175` (**2 failed**) | `e2e/18` os outros 2 |
| C | `axisSync` nas deps do efeito de montagem (`SymbolClient.tsx:1189`) | **não morde (2 passed). Não é defeito do teste:** `axisSync` é estável por mount por desenho (`axis-sync-provider.tsx:62`, `useState`), então a mutação não muda nada. Por isso foi refeita como C2 | — |
| C2 | `axis` nas deps do efeito de montagem (a forma do r2) | `e2e/22:202` e `e2e/20:728` (**2 failed**) | — |
| D | `index === originIndex && false` (`range-dispatch.ts:194`) | `e2e/16:149` (**1 failed**) | `e2e/16:181` |
| E | sem `createPanesBeforeSeries` (`SymbolClient.tsx:1059`) | `e2e/24:597` (**1 failed**) | os outros 4 do `e2e/24` |
| F | `priceFormat` numérico na liquidação (`SymbolClient.tsx:2624`) | `e2e/24:597` (**1 failed**) | os outros 4 |

C não entra na conta de 13: foi uma mutação nula, e a conta usa a forma que de fato mexe no código (C2).

## 6. As 3 regressões e as escalas, com a prova

| regressão | prova no HEAD | mutação que reprova |
|---|---|---|
| **TF 4h troca o dado** (`18`) | `e2e/26` com dado real: `1m` desenha 3492, e o clique em `4h` desenha **23**, igual à carga direta. A legenda do clique é idêntica à da carga direta de `4h`, inclusive o volume (`14515.595`). `e2e/18` verde no gate | B (dentro da faixa, via `26`) e B2 (fora, via `18`) |
| **sem pulo no arrasto** (`16`) | `host_write_count_delta` = 0 × 3, no gate e no real | D |
| **arrasto sobrevive à página** (`20`/`22`) | `mount_count=1` depois de ≥ 2 páginas (gate e real) e ao longo de 25 arrastos no probe | C2 |
| **MF-1** (CVD) | eixo `2000.00` em `1m` e `50000.00`/`25000.00` em `4h`, no pixel real | E |
| **MF-2** (liquidação) | 0 rótulo no eixo log, em `1m`, `15m` e `4h` | F |

## 7. WARNINGs (nenhum bloqueia a fase)

- **W-1 (design gate, herdado do r2):** o corte da borda direita ainda acontece **depois de ≥ 2 páginas**. Com 8
  arrastos para o passado e 12 de volta, `T` vai de 03:54 para `2026-09-24 01:54` (*"há 49 h 59 min"*) e depois
  para `2026-09-23 17:34` (*"há 60 h 49 min"*), e não volta. O r2 mediu o master de controle **pior** com o mesmo gesto
  (62 h 39 min). É o resíduo que a emenda de `D-C3.5` declara. O `e2e/27` só cobre ≤ 1 página, e a saída (c) (*"ir
  para o agora"*) não foi feita.
- **W-2 (herdado, não remedi):** o falsificador literal do MF-1 (*"rótulo dentro de [min, max] × 1,2"*) reprova pela
  letra no r2 (±2000 contra [−1830,9; 995,7]). A ordem de grandeza está certa. O design gate aceitou com condições.
- **W-3:** dentro da faixa `HH:05–HH:10`, o `e2e/18` fica cego à mutação B (**medido de novo**: 4/4 verde às 04:05).
  Quem cobre é o `e2e/26`, que está no mesmo `make verify`.
- **W-4:** `e2e/15` CA-2/CA-4 continuam SKIPPED no `make verify`.
- **W-5 (P-1 do code-review):** o `window.addEventListener("blur", handlePointerUp)` (`SymbolClient.tsx:1149`) não tem
  teste. O próprio builder o declara `[NÃO MEDIDO]`. É uma linha simétrica às duas que já existem, mas nenhuma
  mutação o protege.
- **W-6 (SF-8 do design gate, aberto):** a legenda da liquidação mostra ruído de ponto flutuante no app real:
  `60777.34220000001` em `4h`. Já é condição do design gate, e não é novo.
- **W-7 (E-4 do design gate):** o cabeçalho diz `Preço (1m, USDT)` e `Volume (1m, BTC)` com `15m`/`4h` selecionado.
- **W-8 (orquestrador):** este laudo não tem linha em `docs/INDEX.md`. As regras de despacho §4 mandam o portão
  commitar só o laudo, e por isso a linha fica para o orquestrador. Os outros portões r3 (review, code-review,
  design) não são escopo deste QA.

## 8. Comandos

- `find backend -name __pycache__ -type d -not -path '*/.venv/*' -exec rm -rf {} +`, depois
  `E2E_API_PORT=8835 E2E_NEXT_PORT=4335 make verify` → `/tmp/verify-wave-paineis-f01-20260926T033416Z.log` (VERDE)
- unitárias (HEAD e V1–V3, K1–K2): `node --conditions=react-server --test src/app/symbol/{panel-assembly,volume-legend-grid-contract,liquidation-geometry}.test.ts src/charts/pane-stack-layout.test.ts`
- universo real: `real.sh up <tag>` (proxy GET-only `:8835 → :8000` com tee de `/series-history`, `next build` e
  `next start -p 4335`). `probe.mjs <out> <tag> mfb|axes|mfa`. `legcheck.cjs` (as 7 leituras × API) e
  `volcheck.cjs` (volume × API, com `VOL_ID=ef3033`).
  `E2E_BASE_URL=http://127.0.0.1:4335 playwright test 16- 22- 26- 27-` → **6 passed**
- universo fraco: `mut.sh <tag> <arquivo> <sed> <filtros>` (`e2e-env.sh up 1 8835 4335`, playwright, `down`, `git checkout --`)
- os scripts e os fatos (`head-mfb-facts.json`, `head-mfa-facts.json`, `mutV-facts.json`, `facts-mut-*.jsonl`,
  PNGs) ficam no scratchpad da sessão, **fora do versionamento**: são instrumento de QA, e não teste
