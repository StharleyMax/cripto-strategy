# QA Gate — Fase `02` [candle-real-e-eixo-unico] — O eixo único

> Escopo: `T-02.1`..`T-02.8` (`CST-208`..`CST-215`), plano
> `docs/plans/SPEC-008-candle-real-e-eixo-unico/02_eixo_unico.md`, DoD verificável itens 1-8.
> Gates lidos e re-verificados: `gates/T-02.1-builder.md` .. `gates/T-02.8-design-review.md` +
> `gates/T-02-latencia-fix.md`. Mentalidade destrutiva: cada afirmação abaixo foi re-medida ao
> vivo nesta sessão, não apenas relida.

## Veredito

**NEEDS_FIX.**

Sete dos oito itens de DoD se sustentam sob re-medição independente. Um — `CA-5a`, item `1` do
DoD, explicitamente apontado no despacho para checagem ao vivo — **MORDE** numa condição real
(falha de upstream em `/series-history`) que nenhum teste desta fase exercita. A prova é um teste
vermelho reproduzível, não opinião: `frontend/src/app/symbol/view-model.test.ts`, teste `CA-5a (QA
· Fase 02 gate)`, `0 !== 5760`.

## Achados

### `[BLOQUEANTE]` `CA-5a` viola sob falha de upstream — long_short/liquidation colapsam a 0 slots

**Reprodução ao vivo, comando literal do próprio `tasks.toml:257`:**

```
$ STATE_DIR=$(bash scripts/e2e-env.sh up 1 8862 4362)
$ curl -s "$(cat $STATE_DIR/base_url)/symbol/BTCUSDT" \
  | grep -o 'data-fact="[a-z_]*slots:[0-9]*"' | cut -d: -f2 | sort -u | wc -l
2   # CA-5a exige 1
$ grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <página> | sort -u
data-fact="cvd_slots:5760"
data-fact="long_short_slots:0"
data-fact="oi_slots:5760"
data-fact="price_slots:5760"
```

`[MEDIDO 2026-09-22]`, universo: a store efêmera do próprio `scripts/e2e-env.sh up` (a mesma que
`make e2e`/`make verify` usam para as specs `01`-`16`) — `api.log` confirma que TODO
`GET /api/v1/series-history` respondeu `500` nesta store (fixture sem seed para o backend real).
`liquidation_slots:long:0`/`liquidation_slots:short:0` também colapsam (regex de uma linha não os
captura por causa do segmento `:long:`/`:short:` extra, confirmado com grep separado).

**Causa raiz, arquivo:linha:**

- `buildPricePanel`/`buildOiPanel`/`buildCvdPanel` (`frontend/src/charts/s2-panels.ts:149-213`)
  chamam `buildChartSeries`/`buildScalarSeries`, que constroem a grade a partir de
  `window.startMs`/`window.endMsExclusive` (`frontend/src/charts/canonical-grid-chart-consumer.ts:27-40`)
  — o comprimento do array de slots **nunca depende de quantos pontos reais chegaram**: com 0
  pontos, ainda produz o comprimento inteiro da janela, preenchido com `null` (whitespace). É
  exatamente o comportamento que `T-02.1` corrigiu para OI (`D9`/`D-C3.2`).
- `nonNegativeFlowSlotsFromHistoryRows` (`frontend/src/app/symbol/view-model.ts:385-404`), o
  mapeador que os painéis `long_short`/`liquidation` usam
  (`frontend/src/app/symbol/[symbol]/page.tsx:731,671`), é **"UM SLOT POR LINHA"** — sem grade de
  fallback. Quando `fetchPanelRows` cai no `catch` (`[symbol]/page.tsx:349-353`) ele devolve
  `rows: []`, e o painel correspondente colapsa a **0 slots**, enquanto os outros 5 continuam na
  grade cheia.

**Por que isto é exatamente a classe de defeito que a fase existe para eliminar:** o cabeçalho do
próprio plano diz *"ligar a assinatura sem unificar a grade sincroniza painéis MOSTRANDO INSTANTES
DIFERENTES — um defeito pior que o atual, porque parece consertado"*. `T-02.1` fechou isto para OI
(divergência de PASSO: `5m` vs `1m`). Este achado é a mesma invariante quebrada por um eixo
diferente — divergência de CONTAGEM (`0` vs grade cheia) sob falha parcial/total de upstream, um
caso que nenhum teste de `T-02.1`-`T-02.8` exercita: `T-02.6`'s `16-eixo-unico-pan-e-ablacao.spec.ts`
mede o *write-through* do `RangeDispatcher` (dispara incondicionalmente, não olha o comprimento do
painel de destino) e `axis-sync-alignment.test.ts` (`CA-5b`) usa 6 arrays sintéticos, nunca a
construção real de `long_short`/`liquidation` a partir de `rows: []`.

**Prova (teste vermelho, não opinião):**

```
$ node --experimental-strip-types --test --test-name-pattern='CA-5a' \
  frontend/src/app/symbol/view-model.test.ts
✖ CA-5a (QA · Fase 02 gate): an upstream fetch failure for long_short/liquidation breaks the
  ONE-GRID invariant, unlike price/OI/CVD
  AssertionError: 0 !== 5760
```

Teste adicionado em `frontend/src/app/symbol/view-model.test.ts` (após o teste `CA-F2-3`,
~linha 132), usando os mesmos fixtures/imports já presentes no arquivo (`buildS2Panels`,
`nonNegativeFlowSlotsFromHistoryRows`, `FIXTURE_WINDOW`). Controle positivo incluso no mesmo
teste: confirma que OI/CVD **continuam** pareados com Preço mesmo com 0 pontos (a correção de
`T-02.1` não regrediu).

**Ação recomendada (não prescritiva sobre a implementação):** os painéis `long_short`/
`liquidation` em `[symbol]/page.tsx` precisam de um caminho de padding de grade equivalente ao
que `buildOiPanel`/`buildCvdPanel` já têm — seja estendendo `nonNegativeFlowSlotsFromHistoryRows`
para aceitar a janela e preencher com `null` até o comprimento canônico, seja roteando
`long_short`/`liquidation` por `buildS2Panels`/`buildScalarSeries` como os outros três. Decisão de
desenho cabe a `frontend-builder`/`frontend-architect`, não a este gate.

### `[NÃO BLOQUEANTE]` Ambiente da worktree — `node_modules` duplicado corrompia o `make e2e`

Na primeira rodada isolada de `make verify` (`E2E_API_PORT=8861 E2E_NEXT_PORT=4361`), `e2e` falhou
com `Error: Playwright Test did not expect test() to be called here` em TODOS os specs — sintoma
clássico de duas cópias de `@playwright/test` carregadas. Causa encontrada:
`frontend/node_modules/node_modules/` — um diretório `node_modules` ANINHADO dentro de
`node_modules` (1,4 GB, `mtime` de 2026-09-06, portanto pré-existente a esta fase, não produzido
por nenhuma task de `T-02.x`). Gitignored, não é código de produção nem código versionado.
Removido (`rm -rf frontend/node_modules/node_modules`) como higiene de ambiente — depois disso o
`e2e` rodou limpo (45 passed, 2 skipped, `rc=0`, três rodadas seguidas). **Não é achado de código
desta fase**, registrado para quem herdar esta worktree: se `e2e` voltar a dar esse erro exato,
comece por aqui antes de suspeitar do diff.

### `[NÃO BLOQUEANTE]` Flake de contenção sob `make verify` concorrente

Numa rodada em que outro `make verify` corria em paralelo na mesma worktree (o "final" mencionado
no despacho, portas `8851/4351`), `test:s1`'s `eslint-boundary.test.ts` (`D5.17(b)`) reprovou
sozinho, levando `11,7s` (ordens de grandeza acima do normal em ms) — mesma classe de flake já
documentada em `gates/T-02.3-builder.md` ("Achado de processo"). Isolado (nenhum outro processo na
máquina), a mesma suíte passou limpa (804/0 antes de eu adicionar o teste `CA-5a`). Não é
regressão de código; é sensibilidade conhecida do `eslint-boundary` a contenção de CPU.

## Itens confirmados ao vivo, não apenas relidos

- **`DoD 3` (ablação, `CA-6`)** — `?e2eAxisSyncDisabled=1` confirmado real: rodei
  `frontend/e2e/16-eixo-unico-pan-e-ablacao.spec.ts` isolado (`make e2e`, portas `8861/4361`,
  `next-server`/API frescos). O teste `DoD-3/CA-6` passou (`2.4s`): com a assinatura desligada, o
  painel de Preço continua respondendo ao arrasto nativo (`from -1 → -283`) e os outros 5 ficam
  **intocados** (`from -1 → -1`, `write_count = 0`) — o par morde/cala é real, não decorativo.
- **`DoD 7` (teto de latência, `160ms` recalibrado)** — `[DECISÃO-OWNER: 2026-09-22]` bem
  documentada em `gates/T-02.7-builder.md` e `gates/T-02-latencia-fix.md`: duas hipóteses de causa
  raiz testadas por mutação real (coalescing via `requestAnimationFrame`, escrita zerada nos 5
  painéis), ambas refutadas — o `p95 ~33-50ms` já existe no evento CRU do painel de origem, antes
  de qualquer fan-out (`RangeDispatcher`/`axis-sync.ts` absolvidos). Conta do novo teto
  (`3,2× 49,70ms = 159,04 → 160ms`) é o MESMO método já usado em `playwright.config.ts`, não um
  número solto. Re-rodei `frontend/e2e/17-teto-latencia-eixo.spec.ts` isolado nesta sessão:
  `axis_latency_p95_ms=17.5`, `n=87/86`, bem abaixo do teto — verde, sem questionar o número
  (decisão já fechada, conforme instruído).
- **`T-02.8` (gate `ux-ui-mastery`)** — `gates/T-02.8-design-review.md`: `APPROVED`, 1 achado
  `[MÉDIO]` (proximidade Gestalt quebrada pela altura da página — os 6 painéis não têm affordance
  visual de "estão sincronizados") e 2 `[BAIXO]` (ausência de feedback de "chegada" nos painéis
  seguidores; crosshair não compartilhado). Os três são explicitamente registrados como não
  bloqueantes pelo próprio validador, com justificativa (o DoD desta fase pede o COMPORTAMENTO,
  provado por `T-02.6`, não a affordance de comunicá-lo) — concordo com a leitura: nenhum dos três
  contradiz um item do DoD verificável do plano `02`.
- **`CA-5b`/`DoD-2`/`DoD-4`** — confirmados via a mesma rodada isolada de `16-eixo-unico-pan-e-ablacao.spec.ts`
  (`45 passed`), reproduzindo os números que `gates/T-02.6-builder.md` já registrou (lockstep de
  escrita nos 5 painéis, sem laço após 1s parado).
- **`DoD 5` (rota `/symbol/[symbol]`)** — `gates/T-02.5-builder.md` já mediu ao vivo
  (`BTCUSDT`/`ETHUSDT`/`LINKUSDT`/`SOLUSDT` → `200`; `XRPUSDT`/`/symbol` sem segmento → `404`);
  não redescoberto aqui — evidência já citável.

## `make verify` — meu próprio, fresco, isolado

`E2E_API_PORT=8861 E2E_NEXT_PORT=4361 make verify`, `__pycache__` purgado antes, worktree sozinha
na máquina (`ps aux` confirmado sem outro `make verify`/`pytest`/`playwright` antes de rodar):

```
[OK       ] lint-backend    rc=0  461 source files
[OK       ] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[FALHA    ] test-frontend   rc=1  804 pass, 1 fail em 4 suítes (app/charts/s1/s3)
[OK       ] test            rc=0  2623 passed · Total coverage: 96.31%
[OK       ] boundaries      rc=0  7 kept, 0 broken
[OK       ] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK       ] política        rc=0
[OK       ] e2e             rc=0  45 passed (58.5s)
veredito: VERMELHO — algum portão mediu e REPROVOU
```

`saída completa: /tmp/verify-wave-f02-20260922T135857Z.log`. O único `FALHA` é o teste `CA-5a` que
eu mesma adicionei para provar o achado acima — sem ele, `test-frontend` teria fechado `804 pass, 0
fail` e o veredito global seria `VERDE`. **A prova está no código, não escondida atrás de uma
alegação.**

## Regras bloqueantes (`harness rules list --severity block`, 8 no total)

Nenhuma das 8 regras (`core.relative-import`, `core.silent-except`, `core.print-statement`,
`core.hardcoded-secret`, `web-fullstack.browser-imports-server`,
`web-fullstack.tenant-from-request`, `web-fullstack.server-test-directory-present`,
`own.compose-hardcoded-secret`) tem achado no diff da fase — evidência: `regras rc=0 (0
bloqueio(s), 73 aviso(s))` acima, e `harness rules --mode sweep --changed-only` já citado limpo em
`gates/T-02.4-builder.md`/`T-02.7-builder.md`.

## DoD da fase (`02_eixo_unico.md`, itens 1-8), item a item

1. `CA-5a`/`CA-5b`/`CA-5c`/`CA-5d` — `CA-5b`/`c`/`d` **OK** (medidos, `gates/T-02.3`/`T-02.6`, e
   `CA-5b` re-confirmado nesta sessão). **`CA-5a` FAIL** — ver achado bloqueante acima.
2. Pan move os 5 — **OK**, confirmado ao vivo nesta sessão.
3. Ablação — **OK**, confirmado ao vivo nesta sessão.
4. Sem realimentação — **OK**, confirmado ao vivo nesta sessão (lockstep + idle sem laço).
5. Rota responde, `n=4` símbolos — **OK**, `gates/T-02.5-builder.md`, evidência citável.
7. Teto de latência `160ms` — **OK**, recalibração bem documentada e decisão do owner respeitada.
8. `make verify` verde, `__pycache__` purgado — **FALHA** (ver acima; o `FALHA` é o achado real
   que este gate existe para produzir, não um erro de execução do portão).

## Ações (NEEDS_FIX)

1. `frontend-builder`: consertar `long_short`/`liquidation` para compartilhar a mesma grade
   canônica de `price`/`oi`/`cvd` mesmo sob falha de upstream (`rows: []`) — ver "causa raiz"
   acima. O teste vermelho `CA-5a` em `frontend/src/app/symbol/view-model.test.ts` é o
   falsificador: fica verde quando corrigido.
2. Re-rodar `CA-5a` literal (o `grep` ao vivo) contra a página renderizada depois do conserto, não
   só o teste unitário — o unitário prova a causa raiz; o `grep` prova o sintoma na página real.
3. Nenhuma ação sobre `T-02.5`/`T-02.7`/`T-02.8` — os três fecham `OK` nesta re-verificação.

## Fix aplicado (`wave/candle-f02`, 2026-09-22) — não apaga o achado acima, que é histórico

**Veredito pós-fix: os 8 portões de `make verify` fecham VERDE.** `saída completa:
/tmp/verify-wave-f02-20260922T150301Z.log`; resumo:

```
[OK] lint-backend    rc=0  461 source files
[OK] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[OK] test-frontend   rc=0  805 pass, 0 fail em 4 suítes (app/charts/s1/s3)
[OK] test            rc=0  2623 passed · Total coverage: 96.31%
[OK] boundaries      rc=0  7 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK] política        rc=0
[OK] e2e             rc=0  45 passed (58.2s)
veredito: VERDE — 8 portões mediram e passaram
```

**A causa raiz e o conserto, no arquivo:linha que o achado apontou:**

- `frontend/src/app/symbol/view-model.ts::nonNegativeFlowSlotsFromHistoryRows` ganhou um segundo
  parâmetro **opcional**, `window?: S2Window`. Sem ele, o comportamento é o de sempre — "um slot
  por linha", inalterado, o que preserva os 25 testes de `view-model.test.ts` que passam fixtures
  pequenas não pensadas para cobrir a janela inteira. Com ele, a validação (`InvalidSeriesValueError`
  nos mesmos dois casos de antes, mesma mensagem) fica igual, mas as linhas presentes viram
  `ScalarPoint[]` e passam por `charts/s2-scalar-grid.ts::buildScalarSeries` — a MESMA primitiva de
  grade que `buildOiPanel`/`buildCvdPanel` já usam internamente (`ADR-003` FR-2/FR-3: nenhuma
  geometria nova foi escrita, só reaproveitada) — alinhada em `S2_AXIS_STEP_MS`, `[window.startMs,
  window.endMsExclusive)`. O comprimento do resultado passa a depender só da JANELA, nunca de
  quantas linhas o wire respondeu: `0` linhas reais ainda produzem a grade cheia, `null`-preenchida,
  exatamente como `oi`/`cvd` já faziam desde `T-02.1`.
- `frontend/src/charts/index.ts`: `buildScalarSeries` passou a ser reexportado do barrel (categoria
  2, ao lado de `buildOiPanel`/`buildCvdPanel`) — sem isso `view-model.ts` (componente `web`)
  precisaria de um deep-import proibido por `ADR-034/D8` para alcançar a mesma primitiva.
- `frontend/src/app/symbol/[symbol]/page.tsx`: os dois call sites de `long_short`/`liquidation`
  (linhas ~671/~731 antes do fix) passaram a chamar `nonNegativeFlowSlotsFromHistoryRows(rows,
  routeWindow.window)`. O call site do sub-eixo de volume (linha ~582) **não mudou** — `klines_volume`
  não é um dos 6 painéis do invariante de `CA-5a` (`SPEC-007 §3.6`: sub-eixo, não painel; nenhum
  `data-fact` publica `volume_slots`), então estender o grid-padding ali não tinha motivo e
  aumentaria o raio do diff sem necessidade.

**Por que preserva o comportamento CORRETO dos outros 4 painéis (price/oi/cvd, e o próprio
`nonNegativeFlowSlotsFromHistoryRows` sem `window`):** nenhuma linha de `s2-panels.ts` foi tocada —
`buildPricePanel`/`buildOiPanel`/`buildCvdPanel` continuam chamando `buildChartSeries`/
`buildScalarSeries` exatamente como antes. A prova ao vivo, literal do `tasks.toml:257`, contra a
MESMA store efêmera onde o achado morde (`/series-history` devolvendo `500` para tudo):

```
$ curl -s "$BASE/symbol/BTCUSDT" | grep -o 'data-fact="[a-z_]*slots:[0-9]*"' | sort -u
data-fact="cvd_slots:5760"
data-fact="long_short_slots:5760"
data-fact="oi_slots:5760"
data-fact="price_slots:5760"
$ curl -s "$BASE/symbol/BTCUSDT" | grep -o 'data-fact="[a-z_]*slots:[0-9]*"' | cut -d: -f2 | sort -u | wc -l
1
$ curl -s "$BASE/symbol/BTCUSDT" | grep -o 'data-fact="liquidation_slots:[a-z]*:[0-9]*"' | sort -u
data-fact="liquidation_slots:long:5760"
data-fact="liquidation_slots:short:5760"
```

`[MEDIDO 2026-09-22]` — `wc -l` volta a dar `1` (era `2`), e os 6 painéis (o `grep` de 1 linha não
captura `liquidation_slots:long:`/`:short:` por causa do segmento extra, checado à parte com o
segundo `grep`, exatamente como o achado original já registrava) concordam em `5760`.

**Efeito colateral real, encontrado e corrigido, não escondido:** dois testes de mutação
(`frontend/src/app/symbol/liquidation-pane-dom-contract.test.ts`,
`long-short-pane-dom-contract.test.ts`) tinham uma âncora regex sobre o TEXTO LITERAL do call site
(`const slots = nonNegativeFlowSlotsFromHistoryRows(rows);`) — quebraram ao ganhar o segundo
argumento, e as âncoras foram atualizadas para o texto novo (`..., routeWindow.window);`), sem
alterar o que cada teste verifica (mesma contagem de 3 call sites, mesmo par de mutantes MORDE).

**Segundo efeito colateral, mais interessante — achado, não escondido:**
`frontend/e2e/14-long-short-dado-real.spec.ts` (`the LongShortPane's bar count is the API's, over
the SAME window`) tinha DOIS asserts que codificavam a MESMA suposição errada que `CA-5a` corrige,
sob o ramo `!readerPresent` (a store deste worktree, sem leitor `md.series`, `status=500`):

- `expect(domSlots, ...).toBe(0)` — óbvio, o mesmo bug, agora `toBe(windowGridSlots)`.
- `await expect(bandLocator, ...).toHaveCount(0)` (a faixa de "últimas 4 h", `D-1`) — menos óbvio:
  `long-short-band.ts::recentBandSlotRange`'s próprio docstring já dizia que `null` acontece
  "quando não há slots" — nunca "quando não há OBSERVAÇÃO nos slots" — e `slots.length === 0` era a
  ÚNICA razão prática de ela devolver `null` antes deste fix. Com a grade sempre no comprimento
  cheio, a faixa agora RENDERIZA mesmo sem nenhum dado dentro dela (marca ONDE ficam as últimas 4h
  no eixo; o texto "NENHUMA GRADE LEGÍVEL", renderizado ao lado por `hasObservation === false`, diz
  que não há dado). **Nenhuma linha de `SymbolClient.tsx`/`long-short-band.ts` foi tocada** — o
  comportamento novo já estava especificado no docstring da função, só nunca .tinha sido exercitado
  porque o bug de `CA-5a` mascarava o caminho. O teste e2e foi atualizado para `toHaveCount(1)` e
  reusa a MESMA checagem de geometria (`expectedFirstIndex`/`expectedLastIndex` a partir de
  `domSlots`/`recentSpanMs`) que o ramo "universo forte" (dado real) já fazia — mesmo invariante
  `M-1`, agora provado também sob ausência total. Rodado isolado 2×: vermelho antes do ajuste do
  teste (`Received: 1` onde se esperava `0`), verde depois, 4/4 specs do arquivo.

**Comandos rodados, literais:**

```
node --experimental-strip-types --test --test-name-pattern='CA-5a' frontend/src/app/symbol/view-model.test.ts
  → 1 passed
node --experimental-strip-types --test frontend/src/app/symbol/view-model.test.ts
  → 25 passed
node --experimental-strip-types --test frontend/src/app/symbol/liquidation-pane-dom-contract.test.ts frontend/src/app/symbol/long-short-pane-dom-contract.test.ts
  → 23 passed
npm --prefix frontend run test:app
  → 361 passed
playwright test frontend/e2e/14-long-short-dado-real.spec.ts (isolado, store própria)
  → 4 passed
E2E_API_PORT=8875 E2E_NEXT_PORT=4375 make verify (worktree sozinha, __pycache__ purgado antes)
  → VERDE, 8/8 portões
```

**Doc delta:** esta seção. Nenhum ADR novo — a mudança é implementação de um `achado` já registrado
neste mesmo gate, não uma decisão de arquitetura nova (`ADR-003` já cobria "grade em `charts`, não
em `web`"; este fix só faz `long_short`/`liquidation` finalmente obedecer o que `oi`/`cvd` já
obedeciam desde `T-02.1`).

**Bloqueado:** nenhum. Devolvo para o loop principal decidir sobre re-despachar `frontend-qa` para
re-veredicto da fase — não é ato meu (`gate-record`/`advance` são de owner/QA, não de builder).
