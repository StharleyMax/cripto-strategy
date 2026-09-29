# W6-QA-FRONT-r3 — QA de front da `03b` (`paineis-de-fluxo`), T-03.8..T-03.14 mais os laudos da T-03.7

- Worktree `MAIN/.claude/worktrees/wave-paineis-f03b`, branch `wave/paineis-f03b`, **HEAD medido `c42c9dc`**. O diff é
  `master...wave/paineis-f03b`, com `master` = `68e6d50`. Portas 8845/4345, janela exclusiva **do lado deste agente**
  (§6 mostra que a máquina não ficou exclusiva).
- Continua o `handoff/W6-QA-FRONT-r2.md`, que ficou PARTIAL pelo R6 sem veredito. Entre o r2 e este HEAD, o front de
  produção **não mudou**: `git diff 37e12a9..HEAD --stat -- frontend/src` mostra só os 2 `*.test.ts` do QA (`41f1555`). O
  único arquivo de front tocado depois disso é `e2e/38`, pelo pino E5 do `W6-FIX` (`a0734b9`, +42/−0).
- Nenhum `gate-record` foi rodado. `frontend/src` de produção não foi tocado: toda mutação foi revertida, e
  `git status --short` ficou vazio depois de cada uma. **Nenhum INSERT, nenhum seed no Postgres compartilhado.**
- Scratch: `SP=/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/854f12b5-43c8-425a-9856-b6679093c941/scratchpad/w6`.

## QA Gate (Front) — Fase 03b: o OI em candle

- [OK] DoD da `03b`, item a item, com o comando de cada um (§1)
- [OK] Lógica fora do componente: projeção e merge em `oi-candle-pane.ts`, marcas de regime em `oi-regime-marks.ts`,
  primitive em `oi-regime-primitive.ts`, parser na borda em `series-history-envelope.ts`. Cada um tem teste unitário próprio
- [OK] Contrato tipado e validado na borda: `series-history-envelope.ts` recusa `derived_from` fora do vocabulário, H/L
  inconsistente, ordem quebrada e `open_at ≥ close_at` (U6..U8, U10..U13 do r2 reprovam). Linhas `+` em `frontend/src` com
  `fetch(` ou URL: **0** (`git diff master...HEAD -- frontend/src | grep -E '^\+' | grep -cE 'fetch\(|https?://[a-z]'`)
- [OK] Sem segredo no cliente: **2** linhas `+` casam `api.?key|secret|password|COINALYZE|Bearer|postgres://` sobre
  `git diff master...HEAD -- frontend`, e as duas são prosa sobre `coinalyze_ohlc_5m`
- [OK] Acessibilidade: nenhum interativo novo. `onClick|<button|tabIndex|role=` nas linhas `+` dá **0**. As réguas dos rótulos
  de regime e a célula H/L invisível são `aria-hidden` (r1, item 4)
- [OK] Testes existem, passam e têm o par morde/cala: E5 agora **morre** (§3). U2, U9 e U15 morrem com o controle nulo verde.
  No r2, **15/15** mutantes de unidade e **5/5** de e2e foram mortos (E5 fechado aqui)
- [OK] Cobertura: front **1209 pass / 0 fail** em 4 suítes. O front não tem medidor de cobertura em portão, e o plano `03`
  não declara alvo de cobertura para o front `[NÃO MEDIDO]`. Backend **96,42%** (`make verify`, §2)
- [OK] Regras: `harness rules --mode sweep --changed-only` deu `rc=0` **com saída vazia** e árvore limpa, o que é ambíguo.
  Desambiguado arquivo a arquivo: `harness rules --mode file --path <f> --format ndjson` nos **26** arquivos A/M de
  `frontend/src`+`frontend/e2e` dá **0** linhas com `"severity": "block"`. O formato do grep foi conferido contra uma linha
  `warn` real (`chart-options.ts:77`). A cegueira para TS nos canários é herdada (W-5 do `W5-QA-r2`)
- [OK] `make verify` verde em `c42c9dc`: 8 portões (§2)
- [OK] Doc delta correto: `docs/INDEX.md` **+13/−0** (0 linha removida, `git diff master...HEAD -- docs/INDEX.md | grep -cE '^-[^-]'`),
  `DESIGN_SYSTEM.md` **+1** (token `--sup-regime`). `arquitetura-fluxos.md` e `STITCH_CONTEXT.md` não mudaram, e o motivo
  está no r1: o contrato do envelope fica em `ADR-045/D3` + `SPEC-009` §6.4
- [OK] Rótulos de força e números com comando. Uma correção de número: o r2 previa `test-frontend 1210`, e o certo é
  **1209**. O `41f1555` acrescenta **1** `test(` (Q-3 ii-bis) e um assert dentro de um teste que já existia
  (`git show 41f1555 -- frontend/src | grep -cE '^\+\s*test\('` → 1). O e2e **98 = 96 + reentrada + E5** fecha

Achados:
1. [WARNING] **T-03.7 / DoD-03a.1 segue FAIL** (`W6-QA-BACK-r3` §4: t2 de 685 a 689 linhas contra o piso de 1.368). É
   operação e backend, **não** front. Pela D-3 do owner, porém, o merge da W6 espera por ela. O E-7 continuava ativo às
   12:15Z: `idle in transaction` havia 24 h 13 min e 17 h 16 min, com o `ALTER TABLE md.ingest_run` parado há 13 h 07 min
   (`pg_stat_activity`, leitura só). — `gates/W6-QA-BACK-r3.md:110-157`
2. [WARNING] **O dado REAL é o mesmo do r2.** O export novo tem sha256 `1211bfc949fc2830…`, **idêntico** ao do r2
   (`cmp` → igual), com 13.390 linhas e fim em **09-27T23:07Z** nas 8 séries. O REAL confirma o HEAD sobre o mesmo
   universo, e não sobre dado novo. — §4
3. [WARNING] **Latência sob carga externa** (§6). Todos os tetos se mantêm no `make verify`. No A/B sob 30–37% de CPU de
   terceiros, o teto intra-gesto de 160 ms estourou em **1 de 6** repetições **em cada braço** (master 239,5 · wave 241,8).
   Não há regressão atribuível à wave (permutação p ≥ 0,12 nas 5 comparações), mas o teto fica a ~80 ms de folga sob carga,
   e isso ameaça o `make verify` do `master` também. — `frontend/e2e/20-teto-latencia-historia-sob-demanda.spec.ts`
4. [WARNING, herdado] W-5 (regras cegas para TS nos canários) e a OBS do K−1 no quarto esquerdo, que é **da página** e
   vai ao `frontend-architect` (r2, item 7).
5. [OBS] O `e2e/17` emite os fatos com o rótulo `16-teto-latencia-eixo`. É cosmético, mas engana quem greppa por número de
   spec. — `frontend/e2e/17-teto-latencia-eixo.spec.ts` (constante `SPEC`)

Veredito: APPROVED (escopo front da `03b`). **A fase não fecha** enquanto a T-03.7 não passar (achado 1, D-3 do owner).
Ações (nenhuma de código de front):
1. Orquestrador/infra: implantar `83e7a78` (API primeiro, `--no-deps`), destravar o coletor e abrir a janela de 24 h da
   T-03.7 (`W6-QA-BACK-r3` §6.1).
2. Opcional, para o `frontend-builder`: renomear a constante `SPEC` do `e2e/17` (achado 5).
Relatório completo: docs/context/paineis-de-fluxo/gates/W6-QA-FRONT-r3.md

## 1. DoD da `03b` (`plans/SPEC-009-paineis-de-fluxo/03_oi_candle.md:59-74`), item a item

| # | item | medida | comando |
|---|---|---|---|
| 1 | Propriedades de `ADR-045` (`close == last`, `open(Bₖ) == close(Bₖ₋₁)`), `n ≥ 288` por regime | backend, fora do front. `W6-QA-BACK-r3` mede F3/F4 held nos 4 símbolos `[DOC]` | — |
| 2 | Mesma grandeza, mediana ≤ 10 bp | idem, backend. ETH a 1,52 bp da borda, com o `/architect` `[DOC: W6-QA-BACK-r3 §6.3]` | — |
| 3 | **CA-7**, cor por contratos, `n ≥ 50` por regime e ≥ 1 divergente | REAL: hist **n=146** (74 divergentes), poll **n=129** (70), **0 defeito**. GATE verde no `make verify`. Morde: E3 (open↔close) mata `e2e/38` CA-7 (r2) | `playwright test 38-oi-candle` REAL, fato `verdict_real_ca7_colour` |
| 4 | **CA-8′**, buraco no regime histórico | REAL: 1 buraco, **41** slots, **0 defeito** | fato `verdict_real_ca8_hole` |
| 5 | **Um candle, uma série** na fronteira | REAL: **3** baldes de início de captura julgados, **0 defeito**. Morde: o `W6-QA-BACK-r3` N1 mata 5 testes | fato `verdict_real_d2bis_one_series` |
| 6 | **Pixel com ablação**: sob `line`, o candle some | REAL `e2e/38`: **275** baldes julgados nas 3 vistas (buraco, captura, reentrada), **0** tinta de vela, `line_ink` 2685, e o juiz de cor **REJEITA** a linha (275 defeitos, o controle positivo). REAL `e2e/36`: `seriesKind line`, up/down 0/0, `lineInk` 21519. Morde: E2 (ablação ignorada) mata `36:370` e `38` DoD-6 (r2) | fatos `verdict_real_px_ablation`, `real_ablation_colour_defects`, `ablation_oi_ink` |
| 7 | `make verify` verde + `ux-ui-mastery` | verde (§2). Design: `W6-DESIGN-REVIEW-r2` APPROVED WITH CONDITIONS 64/100 `[DOC]` | §2 |

## 2. `make verify` em `c42c9dc`

`find backend -name __pycache__ -prune -exec rm -rf {} +; VERIFY_FORCE=1 E2E_API_PORT=8845 E2E_NEXT_PORT=4345 make verify`,
com `run_in_background`, lançado às 12:15:16Z. Log: `/tmp/verify-wave-paineis-f03b-20260928T121516Z.log`. **VERDE, 8 portões**
`[MEDIDO 2026-09-28]`:

- lint-backend rc=0 (489 arquivos) · lint-frontend rc=0 (ESLint + `tsc --noEmit --strict`)
- test-frontend **1209 pass / 0 fail** (app 649, charts 344, s1 105, s3 111)
- test **3416 passed**, 1 skipped, 1 xfailed, **96,42%** · boundaries 7 kept / 0 broken · regras 0 bloqueio / 77 avisos · política rc=0
- e2e **98 passed / 0 ✘ / 7 skipped** (10,3 min). Nenhum dos vermelhos conhecidos do REGRAS §2 aparece.
- Latência no mesmo log (`grep -E 'axis_latency|history_page|intra_gesture'`): `e2e/17` p95 **17,1** / max 32,7 · `e2e/20`
  página p95 **94,1**, intra p95 **47,9** / max **116,2**, over 0. Tetos: 160 (`e2e/17` e intra), 400 (página).
  Nos verdes anteriores: 32,9 / 100,5 / 128,4 no r2, e 32,9 / 108,5 no `W6-FIX`.

Este verify serve também de controle NULL das mutações de e2e.

## 3. Mutações, a revalidação pedida (REGRAS §4: "peça a mutação, não o relatório")

- **E5, o mutante ORIGINAL do r2** (`$SP/mut/E5.json`: `use-history-pager.ts:319` passa a usar só `currentRows.oiCandles`,
  e a página antiga de OI é descartada). Ele é **diferente** do mutante que o `W6-FIX` usou (`EMPTY_OI_CANDLE_BUNDLE`).
  Comando: `bash $SP/mut-e2e.sh E5r3 $SP/mut/E5.json 22- 36-oi-candle 38-oi-candle -g "GATE|T-03.11|DoD-11"`, o mesmo
  filtro que no r2 deu 6 passed. Resultado: **1 failed / 6 passed**. A falha é
  `e2e/38:1215` *"E5: as velas de OI da página ANTIGA chegam à tela"*, com `gate_e5_older_page: 80 defect(s)` (`judged 80`).
  Árvore limpa depois. ⇒ **A lacuna do r2 está fechada.** O pino mora só no GATE, porque o REAL não tem vista de página
  antiga; é suficiente, já que o defeito é de ligação e não de dado.
- **Unidade** (`bash $SP/mut-unit.sh NULL U2 U9 U15`, `test:app` + `test:charts`, n=993): NULL **993/0**. U2 (`>=`→`>` no
  `trimOiCandlesToWindow`) **1 fail**, U9 (`> width`→`> 2*width`) **1 fail**, U15 (cláusula `bucket_interval_ms` do
  `mergeSources`) **1 fail**. São os 3 que já tinham sobrevivido em algum ciclo, e os 3 seguem mortos. Os outros 12 foram
  mortos no r2, sobre o mesmo código de produção.

## 4. App real, dado real (proxy só leitura)

- **Export** (`handoff/T-03.10.md`, receita com `default_transaction_read_only=on`, `lock_timeout=3000`), às 12:52:37Z:
  `$SP/oi-export.csv`, 13.390 linhas, sha256 `1211bfc949fc2830…`, **byte a byte igual** ao do r2 (`cmp -s` → igual; o do
  r2 está em `oi-export-r2.csv`). O último `bucket_end` é **09-27T23:05Z–23:07Z** nas 8 séries. O coletor segue parado
  (achado 1).
- **Pilha**: `bash $SP/real.sh up` sobe o proxy híbrido só leitura `:8845` (modelo `gates/T-01.11-r2-proxy.mjs.txt`, versão
  Python de `gates/T-03.13-real-proxy.py.txt`). O OI é respondido pela função de rota **da wave** sobre o export. O resto
  é GET passado à produção `:8000`, e não-GET dá 405. Por cima, `next build` + `next start :4345` da worktree. A produção
  roda o `master` e não serve `oi_candles`, e por isso o proxy é híbrido.
- **Rodada**: `E2E_BASE_URL=http://127.0.0.1:4345 E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8845/api/v1
  E2E_OI_REAL_API_BASE_URL=http://127.0.0.1:8845/api/v1 E2E_FACTS_FILE=$SP/facts-real-r3.jsonl playwright test 38-oi-candle
  36-oi-candle 37-oi-regime 24-single 35-liquidation 13-liquidacoes 16- 22- 26- 27-` → **36 passed / 0 failed / 0 ✘**
  (17,7 min, `$SP/real-r3.log`). No r2 foram 34: a diferença de +2 são a vista de reentrada (QA r2) e o E5 (GATE, no mesmo
  arquivo). No `real.sh down`, o proxy contou **`passthrough_get 299, local_oi 30, refused 0`**.
- Os fatos da 03b estão em §1 (CA-7, CA-8′, D2-bis, ablação). No `e2e/37` REAL, a ablação das marcas de regime deixa
  `ruleColumns []` e `legendRows 54, weak 0, band 0` (fato `ablation_canvas`): a marca some quando é desligada.
- **Não regressão W4/W5**: `e2e/35` REAL `real_ca1` dá **1 chart, 0 panes velhos**, com pontos de preço 3064 · liq 526 ·
  OI 3050 · L/S 4935 · CVD 3055. As ablações do `e2e/35` (`real_ablation_swap`, `real_ablation_fuse_absence_zero`) são
  reprovadas pelo juiz, como devem ser, porque são controle positivo. O `e2e/16` mostra a ablação do host (`write_count_after 0`).
  `13-`, `22-`, `24-`, `26-` e `27-` ficaram verdes. Nos dois universos, o que o `W5-QA-r2` §4 julgou continua verde.

## 5. Os laudos da T-03.7

Estão fora do escopo do front, e este portão só os lê. O t2 é **FAIL** (`W6-QA-BACK-r3` §4, 685–689/1.368). A causa é o
idle-in-transaction da API, na 3ª ocorrência. O conserto `83e7a78` não está implantado. A leitura só deste QA às 12:15Z
viu o E-7 ativo: 2 sessões `idle in transaction` (24 h 13 min e 17 h 16 min) e o `ALTER TABLE … writer_accounted_at`
`active` havia 13 h 07 min `[MEDIDO 2026-09-28T12:15Z, n=4 sessões não-ociosas]`. **Nada foi destravado.** O efeito no
front é o achado 2: o REAL julga o mesmo universo do r2. Pela D-3 do owner, o merge da W6 espera a T-03.7.

## 6. Latência: A/B e a contaminação declarada

`bash $SP/lat-ab.sh` compara `$SP/master` (`git archive 68e6d50`) com a wave, rodando `e2e/17` + `e2e/20` com
`--repeat-each=3`, em 2 rodadas por árvore.

- **A/B #1 (12:38–12:44Z) CONTAMINADO.** Às **12:42:58Z** um processo de terceiro (`bfs … / -xdev -name *.jsonl -path
  *harness*`, não lançado por este agente) começou a usar 98% de uma CPU, durante exatamente o braço `wave r2`
  (12:43–12:44:43Z). Nesse braço, a página chegou a p95 **853,8** e depois 295,2 (1 failed). Os logs estão em
  `$SP/lat-r3-contaminated/`. Descartado.
  - As amostras limpas do #1 (antes das 12:42:58Z) dão página: master med **102,85** (n=6), wave med **108,2** (n=3),
    **+5,35 ms**, p=0,26. Isso fica abaixo do limiar de +9 ms do falsificador do W-1 do `W5-QA-r2`.
- **A/B #2 (12:45–12:51Z)**, com `vmstat -t 5` junto (`$SP/vmstat-ab-r3b.log`). O `us` de terceiros ficou em **30–37%**
  durante toda a rodada (Chrome, Slack, VS Code e outras sessões), e a janela **não** foi exclusiva na máquina.
  Permutação exata, unicaudal, n=6 por braço:

| métrica | master (mediana) | wave (mediana) | Δ | p | teto |
|---|---|---|---|---|---|
| `e2e/20` página p95 | 136,6 | 127,55 | −9,05 | 0,755 | 400 |
| `e2e/20` intra-gesto max | 131,05 | 138,25 | +7,2 | 0,207 | 160 |
| `e2e/20` intra-gesto p95 | 60,1 | 62,25 | +2,15 | 0,149 | 160 |
| `e2e/17` p95 (faixa) | 27,6–39,1 | 29,6–33,4 | — | — | 160 |

  O teto intra-gesto (160) estourou **1 vez em cada braço**: master r1 **239,5** (`lat-master-r1.log:166`) e wave r2
  **241,8** (`lat-wave-r2.log:326`). ⇒ **O problema é o ambiente, e não a wave.** O W-1 do `W5-QA-r2` não dispara: a
  mediana da página não subiu ≥ 9 ms em nenhuma rodada limpa.

## 7. Comandos e artefatos

- verify: `/tmp/verify-wave-paineis-f03b-20260928T121516Z.log`
- E5: `$SP/mut-E5r3.log`, `$SP/facts-mut-E5r3.jsonl` · unidade: `$SP/mut/{NULL,U2,U9,U15}.log`
- REAL: `$SP/real-r3.log`, `$SP/facts-real-r3.jsonl`, `$SP/proxy.log`, `$SP/oi-export.csv` (igual a `oi-export-r2.csv`)
- A/B: `$SP/lat-{master,wave}-r{1,2}.log` (#2), `$SP/lat-r3-contaminated/` (#1), `$SP/vmstat-ab-r3b.log`
- regras: `harness rules --mode file --path <f> --format ndjson`, sobre `git diff master...HEAD --name-only --diff-filter=AM -- frontend/src frontend/e2e` (n=26)
