# Handoff — W6-QA-FRONT-r2 (QA de front da 03b, `paineis-de-fluxo`): PARTIAL pelo R6, sem veredito

O hook R6 avisou no turno 151. **Ainda não há veredito.** O laudo final vai para `gates/W6-QA-FRONT-r2.md`. Nenhum
`gate-record` foi rodado. `frontend/src` de produção não foi tocado. A árvore estava limpa depois do commit `41f1555`.

- Worktree: `MAIN/.claude/worktrees/wave-paineis-f03b`, branch `wave/paineis-f03b`. O HEAD medido era `37e12a9`. Os
  testes do QA estão em **`41f1555`**. Portas 8845/4345. Janela exclusiva.
- Scratch: `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad/w6`
  (os scripts `real.sh`, `mut-unit.sh`, `mut-e2e.sh`, `lat-ab.sh` e `mut/*.json`, e as sondas em `probe/`).

## Feito e medido `[MEDIDO 2026-09-27T23:34Z–09-28T00:58Z]`

1. **`make verify` em `37e12a9`**, antes dos testes do QA. Comando: purga de `__pycache__`, depois `VERIFY_FORCE=1
   E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify`, com nada rodando junto. Resultado: **VERDE, 8 portões**
   (log `/tmp/verify-wave-paineis-f03b-20260927T233404Z.log`):
   - test-frontend 1208/0
   - test 3407 passed, 96,42%
   - regras 0 bloqueio / 77 avisos
   - e2e **96 passed / 0 `✘` / 7 skipped**, em 9,5 min

   Latência no mesmo log (`grep -E 'axis_latency|history_page|intra_gesture'`):
   - `e2e/17`: p95 **32,9** / max 33,3
   - `e2e/20`: página p95 **100,5**, intra p95 50,1 / max **128,4**, over 0

   Os tetos de 160 se mantêm.

   ⇒ O flake `e2e/38:1061` do r1 **não voltou**. O DoD-6 GATE ficou verde, e o conserto do `W6-QA-FRONT-FIX` segurou sem
   carga junto.
2. **Export novo, só leitura**: `$SP/oi-export.csv` (o r1 ficou em `oi-export-r1.csv`), 13.391 linhas, sha256 `1211bfc949fc2830…`, feito às
   23:47:57Z com `default_transaction_read_only=on`. **O dado para às 23:07Z** nas 8 séries.
   - ⚠️ **Operação (E-7 reincidiu):** a stack local tem de novo 2 sessões da API em `idle in transaction`, com
     04:49 h e 01:37 h, e um `ALTER TABLE md.ingest_run ADD COLUMN …` do boot parado atrás delas há 40 min
     (`pg_stat_activity`). O coletor subiu às ~23:07Z. Isso é a `D-2` de `DECISOES-DO-OWNER-2026-09-27`, e é a
     worktree `wave-api-idle-tx`. **Não é da wave nem do QA.** Não mexi em nada: é para o orquestrador ou o owner.
3. **REAL** (proxy híbrido só leitura `:8845`: OI respondido pela função de rota da wave sobre o export, o resto
   passado a `:8000`; `next start :4345`): `playwright test 38-oi-candle 36-oi-candle 37-oi-regime 24-single 35-liquidation
   13-liquidacoes 16- 22- 26- 27-` deu **34 passed / 0 failed** (15,1 min, log `$SP/real-r2-before.log`, fatos
   `$SP/facts-real.jsonl`). Ao fechar, o proxy contou `passthrough_get 378, local_oi 44, refused 0`. **Nenhum INSERT,
   nenhum seed.**
   - `e2e/38` REAL, antes: CA-7 hist n=150 (76 divergentes), poll n=70 (35), 0 defeito · CA-8′ 1 buraco / 38 slots,
     0 defeito · D2-bis 2 baldes julgados, 0 defeito · ablação 220 julgados, 0 tinta de vela, `line_ink` 1786, e o juiz
     de cor REJEITA a linha (220 defeitos).
   - `e2e/35` REAL `real_ca1`: 1 chart, 0 panes velhos, pontos preço 3689 · liq 692 · OI 3675 · L/S 5715 · CVD 3679.
     W5 não regrediu.
4. **Teste do QA 1, a vista `reentry` no `e2e/38`** (`41f1555`). É a volta depois do MAIOR buraco do polling
   (`longestGapRestart`). No REAL, cai em 09-27T11:40Z. REAL depois (`-g REAL`, 2 passed, 5,9 min, `$SP/facts-real-after.jsonl`):
   - poll n **70 → 129** (70 divergentes)
   - D2-bis **2 → 3** baldes
   - ablação **220 → 279**, 0 defeito

   No GATE a vista não existe, porque o stub tem uma captura só. O pino sem browser (`-g reentrada`) está verde, e 3
   mutantes do helper reprovam, 3 de 3: "o último e não o maior", `ceil → floor` e `> MIN → >= MIN`.
5. **Mutações de unidade** (`mut-unit.sh`, `test:app`+`test:charts`, n=992):
   - NULL: 992/0.
   - Mortos: U1 1 fail, U2 1 (o teste do FIX morde), U3 1, U4 1, U5 1, U6 6, U7 6, U8 3, U10 6, U11 2, U12 1, U13 3,
     U14 1.
   - **Sobreviveram U9 e U15, e estão fechados agora por teste do QA** (`41f1555`):
     - U9 (`oi-regime-marks.ts:140`, `> width` → `> 2*width`): `Q-3 (ii-bis)`, um bucket faltando já quebra a faixa, com
       o par cala.
     - U15 (`oi-candle-pane.ts:84`, a cláusula `bucket_interval_ms` do `mergeSources`): `otherWidth` é recusado.
     - Os dois reprovam 1/35 com a mutação e ficam 35/0 limpos. `eslint` e `tsc --noEmit` deram rc=0.
6. **Mutações de e2e** (`mut-e2e.sh`, universo fraco, `-g "GATE|T-03.11"`):
   - E1, legenda sempre na última vela: 2 failed (`36:381` PX-4 e `38` CA-7).
   - E2, ablação ignorada: 2 failed (`36:370` PX-2 e `38` DoD-6).
   - E3, open↔close: 2 failed (`36:345` PX-1+3 e `38` CA-7).
   - E4, rótulo de `sources[0]`: 1 failed (`36:381`).
   - **E5 SOBREVIVEU** (`use-history-pager.ts:319` descarta a página antiga de OI): `22- 36 38 -g "GATE|T-03.11|DoD-11"`
     deu **6 passed**. ⇒ É **lacuna de teste**: `mergeOlderOiCandles` tem pino (U5), mas a **ligação dele no pager** não
     tem nenhum. Classificação proposta: **WARNING** com ação para o `frontend-builder`, porque o código de hoje está
     certo e só a proteção falta. O teste sugerido vai no GATE do `e2e/38`: `showRange` até antes de
     `request.windowStartMs`, o que arrasta e pagina, depois contar a tinta de vela nos baldes fechados do stub (que
     serve hist para qualquer `t ≤ STUB_END`). Com E5, a contagem tem de dar 0.
7. **Achado herdado do `T-03.13-builder` §5** (a legenda mostra K−1 no quarto esquerdo). A sonda `$SP/probe/legend-quarter.mjs`
   rodou no REAL, BTCUSDT 5m, b ≈ 20 px:
   - as legendas de PREÇO e de OI mudam de balde **nos mesmos x** (7/7 transições, e iguais sobre os dois panes);
   - as colunas de vela de preço e de OI caem **nos mesmos x** (10/10 corridas de tinta, `lq2.json.*.png`).

   ⇒ O efeito é **da página**, e não da 03b. Vale como OBS para o `frontend-architect`, não como achado da wave.
8. Regras, segredo e a11y: vale o que o r1 mediu (`handoff/W6-QA-FRONT.md` itens 2–5). O código de produção do front não
   mudou desde então (`e369418` só tocou `e2e/38` e um teste).

## Falta (nesta ordem, nada rodando junto)

1. **`make verify` em `41f1555`** (os testes do QA mudaram `e2e/38` e dois `*.test.ts`):
   `find backend -name __pycache__ -prune -exec rm -rf {} +; VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify`,
   com `run_in_background`. Espere test-frontend 1210/0 (1208+2) e e2e 97 passed (+1 do pino `reentrada`). O verify
   serve também de controle NULL do e2e.
2. (opcional) A/B de latência: `bash $SP/lat-ab.sh` (`$SP/master` = `68e6d50`). Compare com o W-1 do `W5-QA-r2` §6.
3. Laudo `gates/W6-QA-FRONT-r2.md` no formato do agente, com os itens acima. **Veredito provável:** APPROVED com
   WARNINGs: E5 (lacuna), E-7 (operação), OBS do K−1 da página e W-5 herdado (regras cegas para TS). Não há BLOCKER
   até aqui. Commite só o laudo. Não rode `gate-record`.
