# W1-QA r2: QA de front da wave W1 depois do W1-FIX

**Feature:** `paineis-de-fluxo` · **Base:** `4a17e35` (`wave/paineis-f01`) · **Data:** 2026-09-26 (UTC) ·
**Agente:** `frontend-qa` · **Janela:** exclusiva · **Portas:** 8835/4335
**Contra:** `docs/plans/SPEC-009-paineis-de-fluxo/01_esqueleto.md` (DoD 1–12), `handoff/FIX-regressoes-fase05.md`,
`gates/W1-QA.md` (r1), `gates/W1-DESIGN-REVIEW.md` (MF-A/MF-B) e `wf_820bac26-f99-2/…/gates/T-01.11-design-review.md`
(MF-1/MF-2)

## 0. Veredito: NEEDS_FIX

As **3 regressões estão mortas**, no gate e no app real, e cada uma tem mutação que morde. O BLOCKER-1 do r1
(`e2e/18` depende do relógio) está **fechado e medido dentro da faixa**. `make verify` deu VERDE nas 2 rodadas.
MF-1/MF-2 continuam consertados. MF-A passa no falsificador literal do design gate.

Ficam **dois BLOCKER**:

1. **O MF-B foi consertado só em parte.** Em `15m` e `4h`, a legenda do **volume** continua dizendo `ausente`, em
   repouso e sob o crosshair, com a barra desenhada ao lado e com a API servindo o valor (§3). O `W1-FIX-builder.md`
   §1 dá o MF-B como corrigido.
2. **Doc delta.** O teto de `D-C3.5` passou de 5.000 para `max(5.000, seed + 1 página)`, que dá 6.260 em todo TF.
   Nenhuma SPEC registra a mudança (§4).

## 1. Checklist

```
## QA Gate (Front) — Fase 01: esqueleto (+ 1.F1/1.F2/1.3′/1.7′, T-01.10, T-01.11-FIX, W1-FIX)
- [OK]   DoD da fase, item a item (§2), cada um com o comando
- [OK]   Lógica fora do componente: effectiveMaxAccumulatedSlots (history-page-window.ts), bucketMs
         (charts/legend-reading.ts) e timeframeStepMs (supported-timeframes.ts) são puros e têm *.test.ts
- [OK]   Contrato tipado na borda: tsc --noEmit --strict dentro do lint-frontend, rc=0
- [OK]   Sem segredo no cliente: `regras`, 0 bloqueio (77 avisos)
- [OK]   Acessibilidade: e2e/23 e e2e/24 verdes. Não reauditei além disso
- [FAIL] Testes existem, passam e têm o par morde/cala: 13 mutações, 13 mordem (§5). MAS nenhum teste cobre a
         legenda do VOLUME em TF ≠ 1m, e é ali que o defeito do §3 vive
- [FAIL] Cobertura do front [NÃO MEDIDO]: não há instrumento em node --test nem no Playwright. Back 96,31%
- [OK]   regras sem bloqueante: 0 bloqueio, 77 avisos (dentro do make verify)
- [OK]   make verify verde nas 2 rodadas, a 2ª depois da purga de __pycache__: 68 passed / 2 skipped nas duas
- [FAIL] Doc delta: o teto de D-C3.5 mudou sem emenda (§4). docs/INDEX.md: +14 −0 (append-only OK)
- [OK]   Rótulos de força: no que li do W1-FIX-builder.md, os números têm comando. O único [NÃO MEDIDO] dele
         (e2e/18 dentro da faixa) foi medido aqui (§2 item 9)
```

## 2. DoD do plano 01, item a item

| DoD | como foi medido | resultado |
|---|---|---|
| 1 Spike | `gates/T-01.0-spike.md` | presente `[DOC]`, não rodei de novo |
| 2 Um gráfico | `e2e/24:383` no `make verify` | verde nas 2 rodadas. Mutação E (sem `createPanesBeforeSeries`) não derruba o `:383` (§5) |
| 3 Um eixo | `e2e/24:427` | verde |
| 4 Crosshair e legenda == API | `e2e/24:476` (stub) + probe no app real, comparando a legenda com o corpo de `/series-history` capturado pelo proxy | 1m: **120/120** comparações (legenda × API, por slot e série) concordam. 15m: 143/144. 4h: 138/144. As 7 divergências são leitura `retido` de série STOCK (preço e OI), que é desenho `[MEDIDO: legcheck.cjs; o caso OI é INFERRED: o texto da OI não foi capturado no hover]`. **O volume ficou fora do mapeamento em 15m/4h porque nunca lê valor** (§3) |
| 5 Legenda derivada | `e2e/24:550` | verde |
| 6 Formas 08..15 | `make e2e` | verdes. `e2e/15` CA-2/CA-4 **SKIPPED** (universo fraco, 0 velas), como no r1 (W-4) |
| 7 Latência | fatos do `make verify`, rodadas 1 / 2 | `e2e/17`: p95 **25,2 / 32,9 ms**, n=86, max 32,9 / 34,0 (teto 160). `e2e/20`: página p95 **89,7 / 114,3 ms**, n=15 (teto 400). Intra-gesto: max **100,6 / 112,9 ms**, n=321/317, `over_ceiling_n=0` nas duas (teto 160) |
| 8 `make verify` + purga | rodada 1: `/tmp/verify-wave-paineis-f01-20260926T020823Z.log`. Purga de **24** `__pycache__` e rodada 2 | rodada 1 VERDE: 8 portões, **1080** testes de front (0 fail), back **2728 passed**, 96,31%, e2e **68 passed / 2 skipped**. Rodada 2 (`/tmp/verify-wave-paineis-f01-20260926T024404Z.log`), depois da purga: **VERDE**, com os mesmos números (1080 / 2728 / 96,31% / 68 passed, 2 skipped) |
| 9 `18` | `e2e/18` + `e2e/26`, com o relógio do servidor **deslocado para dentro da faixa** `HH:05–HH:10` | **dentro da faixa, 6/6 verde.** `window_before == window_after_4h` = `{start 1790035200000, end 1790380740000, knowledge 1790381040000}`: são **os mesmos valores** que reprovaram o r1. `one_minute_edge_on_4h_boundary=true` nos dois testes. Fora da faixa, verde no `make verify` |
| 10 `16` | `e2e/16` no gate e no app real + mutação D | `host_write_count_delta` = **0** nos 3 gestos, com dado real. D morde (47 escritas) |
| 11 `20` | `e2e/20`, `e2e/22` + mutação C, e o probe com ≥ 5 páginas no app real | `chart_mount_count_after=1` (gate e real). O probe fica em `mounts=1` do começo ao fim, depois de ≥ 5 páginas. `page_boundary_jump_slots` = 12× 0. `gestures_parked_after_page_n=0`. C morde `e2e/22` e `e2e/20:728` |
| 12 Baseline da `T-01.10` | `gates/T-01.10-latencia.md` | presente `[DOC]` |
| MF-1 / MF-2 | `e2e/24:597` + mutações E/F + captura real 1280×1200 | modos lidos da lib: preço/OI/LS/CVD `normal`, liquidação `logarithmic`. No pixel real, o eixo do CVD vai de **2000.00 a −2000.00**, e a liquidação não tem rótulo nenhum. E e F mordem (§5). Nota sobre o ×1,2 em W-2 |
| MF-A | `drag3.mjs` do `W1-DESIGN-REVIEW` §7 no app real + mutação M-A | HEAD: `T = 02:24` e *"há 0 min"* nos 3 estados. **M-A** (teto cru): `T` recua de 02:29 para **13:49** (*"há 12 h 39 min"*) na primeira soltura, e `e2e/27` dá `window_end_lost_minutes_0=760`. Resíduo em W-1 |
| MF-B | probe no app real em `4h`/`15m`, direto e por clique, com 24 posições de crosshair + mutação M-B | preço em repouso no `4h`: **83971.4**, igual ao valor servido na barra `[MEDIDO: legcheck]`. 7 das 8 leituras têm valor. **M-B** (sem o encaixe na barra): **8/8 `ausente`** em repouso e 24/24 posições sob o crosshair. **O volume continua `ausente`** (§3) |

## 3. BLOCKER-1: o MF-B está aberto no volume

**Medido no app real, com dado real** (`next start :4335`, proxy só-leitura `:8835 → :8000`, `refused=0`):

| estado | legenda do volume | o que a API serve (`/series-history`, série `ef3033…`, FLOW BTC) |
|---|---|---|
| `4h`, em repouso | `ausente`, `data-legend-absence=SEM_PONTO`, **slot 23** | barras `16:00` = **34200.456** e `20:00` = **14515.595** |
| `15m`, em repouso | `ausente`, **slot 383** | barras `01:45` = **488.35** e `02:00` = **276.608** |
| `4h` e `15m`, crosshair | `ausente` em **24 de 24** posições | — |
| `1m`, em repouso | **5.744** (ok) | — |

A tela confirma: `Volume (1m, BTC)   ausente`, com as barras de volume desenhadas logo abaixo (`head-mfb-15m_direct.png`,
no scratchpad da sessão, fora do versionamento).

**Por que é BLOCKER:** é a linha 2 da própria tabela do MF-B (*"crosshair em 4h … Volume = `ausente`"*), e o
`W1-FIX-builder.md` §1 dá o MF-B como fechado. A legenda afirma que não sabemos de um dado que está desenhado e que
a API serve. **Isso já existia no master** (o design gate mediu 8/8 `ausente` lá), então não é regressão. Mas a
entrega do W1-FIX era fechar o MF-B.

**Causa `[INFERRED: leitura dos fatos, sem mutação]`:** o volume lê `slot 23`/`383`, e o preço lê `5520`/`5745`. Os
slots do volume estão em outro espaço de índice, o da grade nativa do TF (24 e 384 barras), e não na grade canônica
de 1 min (5760). Então o `bucketMs` do `LegendFrame` não os encaixa. A mutação M-B mostra que o encaixe consertou as
outras 7 leituras e **não** mexe no volume. Nenhum teste unitário nem e2e cobre a legenda do volume em TF ≠ `1m`.

## 4. BLOCKER-2 (Doc delta): `D-C3.5` mudou de número sem emenda

- `use-history-pager.ts` passou a aplicar `effectiveMaxAccumulatedSlots` = `max(5.000, seed + 1 página)`. Com o seed
  de 5.760 slots, isso dá **6.260 em todo TF**. É 25% acima do teto declarado.
- `docs/specs/SPEC-008-candle-real-e-eixo-unico.md:494` continua dizendo *"`D-C3.5` … teto ~**5.000 slots**"*, com o
  argumento de custo quadrático. `SPEC-009` e `ADR-044` não mencionam a mudança
  (`grep -rn 'effectiveMaxAccumulatedSlots\|6260\|6.260' docs/specs docs/adr` → 0 linhas).
- `handoff/FIX-regressoes-fase05.md` §7 diz: *"a política de teto é `D-C3.5`"* (o documento não a decide). O
  `W1-DESIGN-REVIEW.md` §2 MF-A diz: *"Conserto: decisão de quem é dono de `D-C3.5`"*. O builder escolheu a saída (a).
  A escolha é defensável e o código a explica, mas a decisão não chegou ao documento que é dono do número.
- **Efeito medido, n=2 rodadas, sem atribuição causal:** a página do `e2e/20` foi de p95 71,8/72,4 ms (r1) para
  **89,7/114,3 ms**. O intra-gesto max foi de 66,9/80,5 para **100,6/112,9 ms**. Os dois continuam dentro do teto,
  mas a tendência é o custo quadrático que `D-C3.5` nomeia, e por isso o número tem de estar no documento dele.
- `W1-FIX-builder.md` não tem o campo literal `Doc delta:`. O conteúdo está nas linhas do §1, mas é por essa falta
  que a lacuna passou.

## 5. Mutações rodadas por este QA (13/13 mordem)

Cada mutação foi aplicada, medida e revertida com `git checkout --`. `git status --short` ficou vazio depois de
cada uma. As e2e rodaram com `scripts/e2e-env.sh up 1 8835 4335` (universo fraco) ou no app real.

| # | mutação | reprova | cala |
|---|---|---|---|
| U1 | `legend-reading.ts`: `slotIndex = foundIndex` (sem encaixe) | `legend-reading.test.ts` **3 fail** / 28 pass | — |
| U2 | `lastClosedSlotIndex(slots, axisStepMs, …)` (último **minuto** fechado) | **1 fail** / 30 | — |
| U3 | `pane-registry.ts`: sem a guarda `line` da (iii′) | **14 fail** / 15 | — |
| U4 | `effectiveMaxAccumulatedSlots` devolve o teto cru | `history-page-window.test.ts` **2 fail** / 12 | — |
| M-A | teto cru no pager (e2e, fraco) | `e2e/27` (**760 min** perdidos) | `e2e/22` |
| M-A | idem, no app real | `T` recua 12 h 40 min na 1ª soltura | — |
| M-B | `bucketMs: frame.axisStepMs` (app real) | 4h/15m: **8/8 `ausente`** em repouso | 1m inalterado |
| B | `key` constante em `<SymbolClient>`, **fora** da faixa | `18:120`, `18:175`, `26` 5m e 4h (**4 failed**) | `18:103`, `18:232` |
| B | idem, **dentro** da faixa (relógio deslocado) | `26` 5m e 4h (**2 failed**) | `e2e/18` 4/4 verde: cego por desenho (W-3) |
| C | `axis` nas deps do efeito de montagem (`SymbolClient.tsx:1175`) | `e2e/22:202`, `e2e/20:728` | — |
| D | `index === originIndex && false` (`range-dispatch.ts:194`) | `e2e/16:149` (47 escritas) | `e2e/16:181` |
| E | sem `createPanesBeforeSeries` (`SymbolClient.tsx:1050`) | `e2e/24:597` (OI/LS/CVD `logarithmic`) | os outros 4 do `e2e/24` |
| F | `priceFormat` numérico na liquidação (`:2604`) | `e2e/24:597` (MF-2) | os outros 4 |

**Como o relógio foi deslocado:** `next start` foi reiniciado com `NODE_OPTIONS=-r shift-clock.cjs`, e esse preload
soma `CLOCK_SHIFT_MS` a `Date.now()` só no processo do Next. O deslocamento levou o relógio para `2026-09-26T00:05:30Z`.
A API efêmera ficou no relógio real. Script no scratchpad, **não versionado**: é instrumento de QA, e não teste.

## 6. As 3 regressões e as escalas, com a prova

| regressão | prova no HEAD | mutação que reprova |
|---|---|---|
| **TF 4h troca o dado** (`18`) | `e2e/26` com dado real: `1m` desenha **3328**, e o clique em `4h` desenha **23**, igual à carga direta. A legenda do clique é idêntica à da carga direta de `4h` nas 8 leituras. `e2e/18` verde dentro e fora da faixa | B (fora e dentro da faixa, via `26`) |
| **sem pulo no arrasto** (`16`) | `host_write_count_delta` = 0 × 3, no gate e no real | D |
| **arrasto sobrevive à página** (`20`/`22`) | `mount_count=1` depois de ≥ 2 páginas (gate e real) e depois de ≥ 5 (probe) | C |
| **MF-1** (CVD) | eixo **±2000** no pixel real (era `2e+37`) | E |
| **MF-2** (liquidação) | 0 rótulo no eixo log (era `2000000000000000000.00`) | F |

**Universo real:** proxy GET-only com **164 + 28 + 81 + 126** GETs e **`refused=0`** nas 4 subidas. **Nada foi
semeado.** O único INSERT possível era o do store efêmero do `e2e-env.sh`, que é descartado.

## 7. WARNINGs

- **W-1 (para o design gate):** o MF-A continua existindo **depois de ≥ 2 páginas**. Numa sequência mais funda (8
  arrastos para o passado e 12 de volta), a borda direita recua **41 h 40 min** e não volta: `T = 2026-09-24 08:44`,
  *"há 41 h 39 min"*, e depois *"49 h 59 min"*. **O master de controle faz pior** (`ba21f07`, mesmo gesto: recua
  **62 h 39 min**). Então é o `D-C3.5` de antes, e não regressão da W1. O `e2e/27` só cobre ≤ 1 página. A saída (c)
  do design gate (*"ir para o agora"*) não foi feita.
- **W-2:** o falsificador literal do MF-1 é *"rótulo dentro de [min, max] × 1,2"*. O delta servido do CVD vai de
  **−1525,72 a 829,79**, que com ×1,2 dá [−1830,9; 995,7], e o eixo rotula **±2000**. A ordem de grandeza está certa
  e a reserva da legenda explica a folga, mas pela letra o falsificador reprova. O r2 do design gate aceitou com
  condições (64/100).
- **W-3:** dentro da faixa, o `e2e/18` fica cego à mutação B (4/4 verde). Quem cobre é o `e2e/26`, que é do mesmo
  `make verify`. Está declarado no próprio spec.
- **W-4:** `e2e/15` CA-2/CA-4 continuam SKIPPED no `make e2e`.
- **W-5 (orquestrador):** `docs/INDEX.md` não tem linha para `W1-REVIEW.md`, `W1-CODE-REVIEW.md`,
  `W1-DESIGN-REVIEW.md` nem para este laudo (`grep -c` → 0 para os três primeiros).
- **W-6:** o portão de code-review continua incompleto (`W1-FIX-builder.md` §2). Não é escopo deste QA.
- **W-7:** o rótulo do cabeçalho diz `Preço (1m, USDT)` e `Volume (1m, BTC)` com o TF `15m` selecionado. É o E-4 já
  escalado pelo design gate, e não é novo.

## 8. Ações (NEEDS_FIX)

1. **`frontend-builder` — `frontend/src/app/symbol/SymbolClient.tsx:1781` e a origem de `volume.slots`:** a legenda
   do volume tem de ler a barra servida em TF ≠ `1m`. Acrescentar um teste que reprove hoje: um unitário sobre a
   montagem do volume em `4h`, ou um e2e com stub de volume em `4h`. **Falsificador:** no app real, em `4h` e `15m`
   parados, a legenda do volume é igual ao valor da última barra fechada servida, e sob o crosshair nenhuma posição
   dentro de uma barra servida lê `ausente`.
2. **Quem é dono de `D-C3.5` (via orquestrador) — `docs/specs/SPEC-008-candle-real-e-eixo-unico.md:494`, ou uma
   emenda em `SPEC-009`:** registrar o teto efetivo `max(5.000, seed + 1 página)` = 6.260, com a origem (W1-FIX /
   `W1-DESIGN-REVIEW` MF-A, saída (a)) e o custo medido (`e2e/20`, página p95 89,7/114,3 ms contra 71,8/72,4 no r1).
3. **Orquestrador:** as linhas de INDEX do W-5.

## 9. Comandos

- `E2E_API_PORT=8835 E2E_NEXT_PORT=4335 make verify`: rodada 1 em `/tmp/verify-wave-paineis-f01-20260926T020823Z.log`
  (VERDE). Rodada 2 em `/tmp/verify-wave-paineis-f01-20260926T024404Z.log` (VERDE), depois de
  `find backend -name __pycache__ -type d -not -path '*/.venv/*'` (24 purgados)
- universo fraco: `scripts/e2e-env.sh up 1 8835 4335` + `playwright test <filtro>` + `down`, para as mutações B, C,
  D, E, F e M-A, e para o `e2e/18`/`26` com o relógio deslocado
- universo real: proxy GET-only `:8835 → :8000`, que grava os corpos de `/series-history`; `next build` com
  `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8835`; `next start -p 4335`; `probe.mjs` (MF-A com `drag3` + sequência
  funda, MF-B com 4 estados × 24 posições, escalas 1280×1200); `legcheck.cjs` (legenda × API por slot);
  `playwright test 16- 22- 26- 27-` com `E2E_BASE_URL=:4335` (**6 passed**)
- controle: `git worktree add --detach … master` (`ba21f07`), a mesma subida real e o mesmo probe MF-A; worktree
  removida depois
- unitárias: `node --conditions=react-server --test <arquivo>` para U1–U4
