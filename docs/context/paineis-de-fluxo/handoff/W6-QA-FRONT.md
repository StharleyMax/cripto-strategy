# Handoff — W6-QA-FRONT (QA de front da 03b, `paineis-de-fluxo`), tentativa 1: PARTIAL pelo R6

Escrito porque o hook R6 avisou no turno 150. **Sem veredito ainda.** O laudo final vai para
`gates/W6-QA-FRONT.md`. Nenhum `gate-record` foi rodado. `frontend/src` não foi tocado: `git status --short` estava vazio
quando este arquivo foi escrito.

- Worktree: `MAIN/.claude/worktrees/wave-paineis-f03b`, branch `wave/paineis-f03b`, HEAD `1720912` (inclui o `W6-QA-BACK`),
  diff `master...wave/paineis-f03b` (`master` = `68e6d50`). Portas 8845/4345. Janela exclusiva.
- Scratch (absoluto, legível por qualquer agente): `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad/w6`.

## Feito e medido

1. **`make verify`**: `find backend -name __pycache__ -prune -exec rm -rf {} +; VERIFY_FORCE=1 E2E_API_PORT=8845
   E2E_NEXT_PORT=4345 make verify`, lançado às 21:29Z, log `/tmp/verify-wave-paineis-f03b-20260927T212934Z.log`. Quando
   este arquivo foi escrito, os 7 portões não-e2e tinham passado, o e2e estava em 84 ✓ e 0 ✘ (`grep -cE ' ✓ | ✘ '`), e
   faltavam `e2e/35`..`38`. **Leia o fim do log.** Se ele não tiver terminado, rode o verify de novo: o cache devolve na
   hora se a árvore limpa já tiver medido verde.
   Latência vista nesse verify: `e2e/17` p95 **17,1** / max 33,9 · `e2e/20` página p95 **91,2** · intra p95 38,2 / max
   **113,6** · over 0 (`grep -E 'axis_latency|history_page|intra_gesture' <log>`). Os dois tetos de 160 se mantêm.
2. **Regras**: `harness rules --mode file --path <f> --format ndjson` nos **26** arquivos A/M de `frontend/src`+`frontend/e2e`
   deu **0 bloqueio**. `--changed-only` deu rc=0 com saída vazia, com a árvore limpa. A cegueira para TS nos canários é
   herdada (`W5-QA-r2` §5, W-5).
3. **Segredo e rede**: sobre `git diff master...HEAD -- frontend`, o grep `api.?key|secret|password|COINALYZE|Bearer|postgres://`
   dá **2** linhas, as duas prosa sobre `coinalyze_ohlc_5m`. `fetch(`/URL em `+` de `frontend/src` dá **0**.
4. **A11y**: nenhum interativo novo (`onClick|<button|tabIndex|role=` nas linhas `+` dá 0). Os réguas dos rótulos de regime
   e a célula H/L invisível são `aria-hidden`, e o texto visível fica legível.
5. **Doc delta**: `docs/INDEX.md` **+11/−0**, `DESIGN_SYSTEM.md` +1 (token `--sup-regime`). `STITCH_CONTEXT.md` e
   `arquitetura-fluxos.md` não mudaram: o segundo não descreve o envelope de `/series-history`, e o contrato fica em
   `ADR-045/D3` + `SPEC-009` §6.4. Nos testes que já existiam, as linhas removidas são 3, e as 3 são atualizações
   legítimas (contagem 45→47 de `data-fact`, com o motivo escrito; o registry `oi` passou de `line` para `candlestick`;
   e o `OiPane` ganhou a prop `oiCandles`).
6. **Export só leitura** para o universo REAL: `$SP/oi-export.csv`, 12.927 linhas, sha256 `5719fc3879eff0d1…`, max
   `bucket_end` 21:30Z nas 8 séries, feito às 21:30:51Z com `default_transaction_read_only=on` (a receita de
   `handoff/T-03.10.md`). Os 8 ids estão em `$SP/oi-ids.txt`. **Refaça o export logo antes da rodada REAL**, porque
   export velho faz a leitura em repouso dar `ausente` (`T-03.14-design-review-r2` §1).
7. **Árvore do `master` para o A/B de latência**: `$SP/master` (`git archive 68e6d50`, com `node_modules`, `.venv` e `data`
   por hard link).

## ⚠️ Atualização no fim da tentativa 1

- **O verify deu VERMELHO, e a medida está CONTAMINADA por mim.** O resultado foi 7 portões verdes e o e2e com **94
  passed / 1 failed / 7 skipped** (7,8 min). A falha foi `e2e/38:1061` (GATE, DoD-6 ablação), com o erro de INSTRUMENTO
  `auditView: the candles do not map to ONE bucket shift of the grid (1,0)` (`grep -n -A25 '1) \[chromium\]' <log>`), e
  não com um defeito do juiz. Enquanto ela rodava, eu rodava em paralelo `mut-unit.sh` (8 execuções da suíte de unidade,
  com CPU cheia), o que quebrou a janela exclusiva. **Rode `VERIFY_FORCE=1 … make verify` de novo, sem nada junto.** Se
  `e2e/38` DoD-6 falhar de novo, é instabilidade do instrumento do `T-03.13` sob carga ou um defeito real. Nos dois casos
  é achado para o `frontend-builder`, com a linha do log. Se passar, registre no laudo como *"flake sob carga, causado
  pelo QA"*, com n de reexecuções (`--repeat-each`).
- **Mutações de unidade, lote 1** (`mut-unit.sh NULL U1..U7`, `test:app`+`test:charts` juntos, n=991 testes):
  NULL deu 991/0. U1 1 fail, U3 1, U4 1, U5 1, U6 6, U7 6: **todos mortos**. **U2 SOBREVIVEU** (0 fail): no
  `trimOiCandlesToWindow`, `>= window.startMs` virou `> window.startMs`, e a vela com `bucket_end_ms == startMs` some sem
  nenhum teste reprovar. **Lacuna de borda.** Acrescente um teste de QA em `oi-candle-pane.test.ts` que mantém a vela em
  `startMs` e descarta a vela em `endMsExclusive` (o par morde/cala), e rode U2 de novo. Falta o lote 2: `U8..U15`.
  Contagens: `grep -E '^ℹ (pass|fail) ' $SP/mut/<tag>.log`.

## Falta (nesta ordem, nada rodando junto)

1. Refazer o verify limpo (ver acima).
2. **REAL**: `bash $SP/real.sh up`. Ele sobe o proxy híbrido `$SP/real-proxy.py` (cópia de `gates/T-03.13-real-proxy.py.txt`,
   que responde o OI com a função de rota da WAVE sobre o export e passa o resto para a produção `:8000`; não-GET dá 405),
   depois `next build` e `next start :4345`. **A produção roda o `master` e não serve `oi_candles`**, e por isso o proxy é
   híbrido. Declare isso no laudo. Depois rode, de `MAIN/.../wave-paineis-f03b`:
   `E2E_BASE_URL=http://127.0.0.1:4345 E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1 E2E_OI_REAL_API_BASE_URL=http://127.0.0.1:8845/api/v1 E2E_FACTS_FILE=$SP/facts-real.jsonl frontend/node_modules/.bin/playwright test --config=frontend/playwright.config.ts 38-oi-candle 36-oi-candle 37-oi-regime 24-single 35-liquidation 13-liquidacoes 16- 22- 26- 27-`
   (as specs de W4/W5 do `W5-QA-r2` §4, mais as da 03b). `bash $SP/real.sh down` imprime `proxy_counts` (refused tem de dar 0).
3. **QA test candidato**: em `e2e/38::viewsOf`, uma 3ª vista `reentry` sobre o início de captura depois do MAIOR buraco
   do polling (no REAL: `09-27T11:40Z`, a volta depois do idle-in-transaction). Hoje só `captures[0]` (`09-26T03:05Z`) é
   julgado, e a fronteira B→A→B nunca foi julgada no dado real. No GATE o stub tem uma captura só, então a vista não
   muda nada ali. Rode o REAL antes e depois da mudança.
4. **Mutações de unidade**: `bash $SP/mut-unit.sh NULL U1 … U15`. As especificações estão em `$SP/mut/U*.json`, com
   unicidade conferida. Cobrem vela/grade, trim, degrau por regime, rótulo, merge, parser (derived_from, H/L, ordem,
   open_at<close_at), H/L não medidos, gap da faixa, ablação no registry, kind do registry, instante da regra e o conflito
   de sources.
5. **Mutações de e2e**: `bash $SP/mut-e2e.sh <tag> $SP/mut/E<n>.json <filtros>`. E1 é a legenda sempre na última vela
   (`36-oi-candle 38-oi-candle -g GATE`). E2 é a ablação ignorada (`36-oi-candle 38-oi-candle -g GATE`). E3 troca
   open↔close (`36 38 -g GATE`). E4 é o rótulo DERIVADO lido de `sources[0]` (`36-oi-candle`). E5 faz o pager
   descartar a página antiga de OI (`22- 36 38 -g GATE`). **Se E5 sobreviver, é lacuna**: vale escrever um e2e que
   arrasta além da janela inicial e confere `data-oi-candles` contra a rota. Depois rode o controle NULL.
6. **A/B de latência**: `bash $SP/lat-ab.sh` (master × wave, `e2e/17`+`e2e/20`, `--repeat-each=3`, 2 rodadas, n=6 por
   braço). Compare com `W5-QA-r2` §6 (W-1: página +9 ms na W5).
7. **Achado herdado a julgar** (`T-03.13-builder.md` §5): no quarto esquerdo da vela K, a legenda do OI mostra K−1.
   Para saber se isso é da 03b ou é a semântica da página, meça no REAL se a legenda do PREÇO faz o mesmo no quarto
   esquerdo da vela de preço. Se só o OI fizer, é WARNING com destino `frontend-architect`.
8. Laudo `gates/W6-QA-FRONT.md` no formato do agente, `docs/INDEX.md` +1 linha, commit só do laudo, do INDEX e dos testes.
