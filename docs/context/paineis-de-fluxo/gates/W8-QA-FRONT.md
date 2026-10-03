# W8 — QA de front (`T-05.6` + `T-06.1`), wave `wave/paineis-f06`

```
[QA GATE — Front — wave W8 de paineis-de-fluxo]
Árvore: .claude/worktrees/wave-paineis-f06, branch wave/paineis-f06 @ 19c3060 (nenhum arquivo de frontend/src alterado por este QA)
Portas próprias: E2E_API_PORT=8861 E2E_NEXT_PORT=4361; PW_OUTPUT_DIR no scratchpad da sessão
Postgres compartilhado: só LEITURA (GET na API do deploy local); nenhum dado escrito
```

## QA Gate (Front) — W8: T-05.6 (correção curta da W7) + T-06.1 (helper que posiciona o eixo)

- [OK] DoD da T-05.6, item a item: R-1, N-1, N-2, R-2 (detalhe abaixo, com comando e mutante)
- [OK] DoD 1 da T-06.1: F1/F2/F3/F4 conferidos; o par morde/cala a `VIEW_BARS = 60` foi fechado aqui também para `34`/`35`
- [OK] Lógica fora do componente — régua em `long-short-band.ts`, cabeçalho em `pane-legend.ts::paneHeadingLabel`
- [OK] Contrato tipado e validado na borda — sem mudança de transporte; `view.ts` só lê atributos publicados
- [OK] Sem segredo no cliente — nenhuma chave nem URL nova em `frontend/src`
- [OK] Acessibilidade nos interativos — sem `aria-label` no `h2`/`h3`, `sr-only` dentro do cabeçalho, sem `text-transform` (mordido por mutante CSS, MA2)
- [OK] Testes existem, passam e têm o par morde/cala — 7 mutações/ablações deste QA, 7 reprovam, + 1 braço CALA (tabela)
- [OK] Cobertura — front sem instrumento de cobertura `[NÃO MEDIDO]`; o universo é o das 4 suítes `node --test` (1275) + e2e
- [OK] `regras` no `make verify`: 0 bloqueio(s), 78 aviso(s) (`harness rules` por arquivo nos 5 arquivos centrais → 0 linhas ndjson)
- [FAIL] `make verify` verde — VERMELHO só em `e2e/20` (latência intragesto 177 ms > 160), carga concorrente provável; ver §verify
- [OK, com WARNING] Doc delta · `docs/INDEX.md` só com linhas ACRESCENTADAS (`git diff d2055d9..HEAD -- docs/INDEX.md | grep -cE '^-[^-]'` → 0)
- [OK] Rótulos de força — números dos relatórios de build conferidos contra execução própria onde dava

## Testes existentes rodados antes de qualquer mutação

| comando | resultado |
|---|---|
| `npm --prefix frontend run test:app` | 706/706 |
| `npm --prefix frontend run test:charts` · `test:s1` · `test:s3` | 353/353 · 105/105 · 111/111 (total **1275/0**) |
| `run.sh base1 e2e/14 e2e/40 e2e/41 e2e/42` (app real, `scripts/e2e-env.sh up 1 8861 4361`) | **29 passed / 2 skipped / 0 failed** |

`run.sh` (scratchpad): `e2e-env.sh up` → `playwright test --config=frontend/playwright.config.ts --reporter=line <specs>` → `e2e-env.sh down` — a receita de `make e2e`, com specs nomeados.

## Mutações e ablações deste QA — 7 aplicadas, 7 reprovam, + 1 braço CALA

Cada uma num build próprio (o `e2e-env.sh up` refaz `next build`), a árvore restaurada com `git checkout` depois de cada.

| id | task | mutante | o que reprova | resultado |
|---|---|---|---|---|
| MA1 | T-05.6 R-1 | `long-short-band.ts:53` `slot.time > last − span` → `>=` (régua inclusiva de volta) | `test:app`; `e2e/14` | **8/706 unit** reprovam; **e2e 3 reprovam**: bar count 1m `5519/5759` (esperado `5520`), C-1 1h `163/167` (esperado `164`), C-1 4h `40/41` (esperado `41/41`) |
| MA2 | T-05.6 N-2 | `SymbolClient.tsx:2221` classe CSS `uppercase` no `<h2>` do Preço (vetor diferente do `toUpperCase()` na string que o builder rodou: a string fica intacta, só o render muda) | `test:app`; `e2e/41` | **1/706 unit** (contrato estático do N-2); **e2e/41 N-2 4/4 reprovam** em 1m/15m/1h/4h: `the Preço heading is never case-transformed` |
| MA3 | T-05.6 N-1 | `SymbolClient.tsx:4062` `-right-px` → `right-6` (etiqueta 24 px para dentro: continua inteira e dentro do plot, só solta da borda da faixa — o mutante mais discreto) | `test:app`; `e2e/41` | **2/706 unit**; **e2e/41 N-1 4/4 reprovam**: `the tag hangs from the band's right border` |
| MB1 | T-06.1 helper | `view.ts:345` `if (landed) break` → `if (landed \|\| iterations >= 1) break` (pós-condição só depois do 1º gesto) | `e2e/42 22 29 33` | **1 reprova**: `42` (b) `5m: borda esquerda`. `22/29/33` e `42` (a) passam — os alvos `lastBars` chegam num gesto só (`wheelZoom` é malha fechada por evento). Mutante **morto, mas fraco**: só o alvo `timeRange` precisa de 2+ gestos |
| MB1′ | T-06.1 helper | `view.ts:345` `if (landed \|\| true) break` (helper vira no-op) a `VIEW_BARS = 120` | `e2e/42 20 33 34 35 37` | **6 reprovam**: `20` (pré-arrasto não chega à borda), `33` (`vista da varredura estreita demais`), `37` RM-1..4/RM-5/RM-6, `42` (a). **`34` e `35` PASSAM** — a 120 a montagem já é a vista deles (`34`: `from 5640 to 5760`, `iterations 0`) |
| MB2 | T-06.1 helper | `view.ts:402,419` guarda de `allowPaging` desligada | `e2e/42` | **1 reprova**: (e) `expect(received).rejects.toThrow()` |
| MB3 | T-06.1 DoD 1 | `VIEW_BARS = 60` (`timeframe-window.ts:73`) **+** helper no-op | `e2e/34 35` | **3 reprovam**: `34` desenho (`o pico … não salta (< 4x a mediana)`) e ablação log; `35` gate (`too few buckets swept — the instrument is blind`) |
| MB3-cala | T-06.1 DoD 1 | `VIEW_BARS = 60` com o helper real | `e2e/34 35 42` | **13 passed / 2 skipped / 0 failed** — o par fecha |

**Leitura de MB1′ + MB3, e a resposta à ressalva do F2 ("a ablação não distingue 60 de 120"):** a ressalva é
verdadeira e é a forma certa da prova, não um furo. A ablação do F2 (22/29) mostra que esses specs **dependem do
posicionamento** — a 120 também, porque a vista de montagem nunca foi a deles. O que discrimina 60 de 120 é o
**F1** (o completo passa a 60 e a 240 com o helper) somado ao inventário R60 do builder anterior (os ORIGINAIS
`34`/`35` reprovavam a 60). O que faltava era o mesmo par **com o helper como única variável** para `34`/`35`,
que são justamente os specs cuja vista coincide com a montagem a 120: MB3 (reprova a 60 sem helper) + MB3-cala
(passa a 60 com helper) fecham isso `[MEDIDO 2026-10-03, logs mb3.log/mb3cala.log no scratchpad]`.

## T-05.6 — o que foi conferido

- **R-1 (régua exclusiva):** `span/step` barras; `e2e/14` contra o app real: 1m `5520/5759` (240), 1h `164/167` (4),
  4h `41/41` (1). MA1 reprova os três.
- **R-2 (C-1 sem flake):** no ambiente de `make e2e` o store é SQLite efêmero ⇒ `seriesWindowReaderPresent()` é
  falso e o C-1 cai no ramo fraco (`long_short_recent_scale:absent`, `c1_*_history_status=500`) — **o ramo que a
  R-2 mudou nunca roda no portão** (pré-existente: o ramo fraco já existia). Rodei por isso o `e2e/14` contra a API
  **real** do deploy local (`next build`/`next start` na 4361 com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000/api/v1`,
  só GET): C-1 1h `readable_in_band=4` vs `inclusive_cut=5`, 4h `1` vs `2` — **discrimina nos dois**, rodapé
  `long_short_recent_scale:4`/`:1`, igualdade afirmada. O único vermelho dessa rodada é o `ceil(wire/5)` do bar
  count de 1m (`1132 < 1152`), **pré-existente no master** (registrado por `W7-QA-FRONT`).
  A troca "reprova → anotação `non-discriminating`" **não afrouxa** o C-1: a régua continua mordida pelo índice da
  faixa, que independe do dado (MA1 prova).
- **N-1:** `e2e/41` cobre 1024/1280 × 1h/4h (mordido por MA3). ⚠️ ver WARNING-1.
- **N-2, redação do gate:** texto visível `<nome> <TF> (<nativa>, <unidade>)`, `sr-only` dentro do `h2`/`h3`,
  `title`, sem `aria-label`, sem `text-transform` — `e2e/41` N-2 em 1m/15m/1h/4h (mordido por MA2; os mutantes
  `toUpperCase()`/`aria-label`/`nativo` visível foram rodados pelo builder, `T-05.6-build.md` §Falsificador).
- **O stub `longest` do `e2e/40` — NÃO afrouxou o C-3.** A fórmula nova
  `floor((n−1)·perBucket/60)·60` dá, em 1h (`n=168`, `perBucket=60`), `167·60 = 10 020 min` — **o mesmo número**
  que a constante antiga `167 * perBucket`; os outros continuam `23·60+59 = 1 439` min. Em 1h o stub é
  aritmeticamente idêntico e a asserção exata de texto (`LONGEST_TEXTS["1h"]`) é a mesma tripla de antes. O 15m é
  **acréscimo** (4 viewports novos), com texto de mesma contagem de glifos (`3 d 23 h`/`de 4 d`/`25.0%` contra
  `6 d 23 h`/`de 7 d`/`14.3%`) e asserção exata própria. A razão da generalização (a produção arredonda para cima
  acima de um dia: `5 745 min` imprimiria `4 d`, mais curto) está certa: sem ela o caso de 15m não seria o mais
  longo. `e2e/40` 100% verde no `base1`.
- **`e2e/24` CA-5:** matcher de `${word} (` para `${word} ` + um token + ` (` — acompanha a gramática nova, sem
  perder a exigência de "exatamente um nome derivado".

## T-06.1 — a migração preservou o que cada spec media?

`git diff 7d5b5a7^1 7d5b5a7 -- frontend/src | wc -l` → **0** (nenhuma superfície de produção).

| spec | antes | depois | veredito |
|---|---|---|---|
| 20, 22 | zoom-out ao piso (~2 300) + `span ≥ 1 000` + "não pediu página" | `showView lastBars 2 000` (tolerância 2%) — `allowPaging:false` **lança** se pedir página | **preservado** (o "não pediu página" virou pós-condição do helper, mordida por MB2) |
| 29 | piso (~2 400) + `span ≥ 2·CYCLE` | `lastBars 2 000` + o mesmo `span ≥ 2·CYCLE` | preservado |
| 33 | piso + `span ≥ 1 000` | `lastBars 2 000` + o mesmo `span ≥ 1 000` | preservado |
| 34 | (sem posicionamento) | `lastBars 2·PERIOD_MIN` | **ganho** — era R60; MB3 prova |
| 35 | zoom-in até `MIN_SPACING_PX` ou `span ≤ 80`; piso na busca real | `lastBars 120` com `minBarSpacingPx`; `lastBars 2 000` na busca | preservado (o "too few buckets swept" segue de pé, MB3 o dispara) |
| 37 | `from ≤ alvo` | `from ≤ alvo + 2% do span` | **afrouxado em tolerância, sem perder o que mede**: margens de 60 slots (1m, tolerância ≤ 44) e 12 (5m, span ~204 ⇒ tolerância ~4) mantêm a marca na tela, e os hovers/`edgeX > box.x` seguintes reprovam se ela sair (MB1′ reprova os três) |
| 38 | `showRange` próprio (arrasto até 0,8 da largura, zoom-in se `b < 3·MIN_SPACING`) + `zoomOutFromLastBar(600)` antes da página antiga | `showView timeRange` (margem de 2 buckets, `allowPaging:true`); o zoom-out prévio sumiu | preservado — o alvo é mais apertado que o antigo; a travessia da página antiga continua julgada por `judgeOlderPage` (inconclusivo reprova em `expectGreen`) `[INFERRED: leitura; 38 não rodado sob mutante — 270 s]` |

Nenhum assert de propriedade foi removido; os removidos eram pré-condições do zoom manual, absorvidas como
pós-condição do helper.

## Achados

1. **[WARNING-1]** N-1 só tem prova comportamental em 1h/4h × 1024/1280 (`e2e/41:36-37`). O 1m — o único TF em que
   a faixa sai **recortada à esquerda e sem borda** — e o 15m dependem de um contrato por regex de fonte
   (`long-short-pane-design-contract.test.ts:317`) e da medida manual do builder (`T-05.6-build.md:50-56`). O
   falsificador 1 de (a) do gate diz "em qualquer TF". Sugestão: acrescentar `1m` ao laço de `e2e/41` com
   `data-recent-band-clipped=left` e `border-left-width: 0px`.
2. **[WARNING-2]** O ramo forte do C-1 (o que a R-2 mudou) **não roda em `make verify`** (store SQLite ⇒ ramo
   fraco). Rodado aqui contra a API real e verde; mas o portão não o vê. Pré-existente na estrutura, não regressão.
3. **[WARNING-3]** MB1 só é morto por `e2e/42` (b): o helper é robusto o bastante para que os alvos `lastBars`
   cheguem num gesto, então a pós-condição quase nunca é exercida com 2+ gestos fora do (b). Não reprova; registra
   que a força da pós-condição repousa num teste só.
4. **[WARNING-4] Doc delta:** a regra durável "cabeçalho de pane e botão de TF nunca recebem transformação de caixa"
   e a gramática `<nome> <TF> (<nativa>, <unidade>)` vivem só em `gates/T-05.6-DESIGN-GATE.md` §(b).4 e no JSDoc de
   `PaneHeading`; `docs/product/DESIGN_SYSTEM.md` não tem nenhuma das duas (nem a gramática antiga —
   `grep -rnE '\(1m, USDT\)|Preço \(' docs/product/` → 0). Está guardada por teste (MA2), por isso não bloqueia;
   recomenda-se a linha no `DESIGN_SYSTEM.md`.
5. **[pré-existente]** `e2e/14` bar count em 1m contra dado real: `1132 < ceil(wire/5) = 1152` — já registrado no
   master por `W7-QA-FRONT`.

## `make verify` — wave combinada (T-05.6 + T-06.1 + T-06.3 + T-06.4 + D-1/D-2)

`find . -name __pycache__ … -exec rm -rf {} +` e depois
`VERIFY_FORCE=1 VERIFY_LOG_DIR=/tmp E2E_API_PORT=8861 E2E_NEXT_PORT=4361 make verify` sobre **`19c3060`** →
**VERMELHO** (rc=2), log `/tmp/verify-wave-paineis-f06-20261003T021459Z.log`:

| portão | resultado |
|---|---|
| lint-backend · lint-frontend | OK (503 arquivos; ESLint + `tsc --noEmit --strict`) |
| test-frontend | OK 1275 pass / 0 fail (4 suítes) |
| test | OK 3546 passed, cobertura 96,92% |
| boundaries · regras · política | OK (7 kept/0 broken; 0 bloqueio/78 avisos) |
| **e2e** | **FALHA 124 passed / 1 failed / 14 skipped** (9,5 min) |

**A falha:** `e2e/20` RNF-2/DoD-7 — `intervalo máximo entre aplicações de eixo DENTRO de um gesto foi 177.00 ms
(n=320; teto 160 ms)`. O resto do mesmo teste dentro do teto: apply p50 34,2 ms (n=15).

**Por que leio como carga e não como regressão — e por que isso NÃO basta para aprovar:**
- dois `make verify` da worktree `t06-2` começaram **1 s depois** do meu e correram em paralelo
  (`/tmp/verify-t06-2-20261003T021500Z.log`, `…T021923Z.log`, este até 02:23:14Z), invisíveis ao `pgrep` do
  início `[MEDIDO: ls -l --time-style das logs /tmp/verify-*]`;
- `e2e/20` isolado, logo depois, sem carga (`load average 0,16`): `run.sh e20x3 e2e/20 --repeat-each=3` →
  **3 passed**, máximo intragesto **93,3 / 100 / 100,1 ms** `[MEDIDO 2026-10-03, n=3]`;
- o mesmo padrão já foi medido duas vezes nesta wave: `T-05.6` verify #2 **171,1 ms** com outra worktree em e2e,
  `T-06.1` isolado com carga **917,5 ms** contra **144,7 ms** sem carga;
- a T-06.1 mudou a pré-caminhada do `e2e/20` de ~2 300 para 2 000 slots — **menos** barras desenhadas, não mais
  `[INFERRED: direção do custo por quadro]`.

Mas o verde de portão é o `make verify`, e ele está vermelho. **Falta UMA rodada sem concorrência.**

## Veredito

**NEEDS_FIX — só portão, nenhum defeito de código achado.** Todo o resto do gate está OK.

Ações:
1. Rodar de novo `VERIFY_FORCE=1 E2E_API_PORT=8861 E2E_NEXT_PORT=4361 make verify` sobre `19c3060` (ou o commit
   deste relatório, só docs) **sem outra worktree em `verify.sh`/`playwright` durante a janela** — conferir com
   `pgrep -af "playwright|verify.sh"` também no meio, não só no início. Verde ⇒ este gate vira **APPROVED** sem
   outra mudança. Vermelho de novo em `e2e/20` sem carga ⇒ é regressão e volta ao `frontend-builder` com o log.
2. (WARNING-1, não bloqueia) `1m` no laço de `e2e/41` N-1 — `frontend/e2e/41-band-tag-and-timeframe-heading.spec.ts:36-37`.
3. (WARNING-4, não bloqueia) gramática do cabeçalho e "sem transformação de caixa" em `docs/product/DESIGN_SYSTEM.md`.

Estado para quem continuar: `handoff/W8-QA-FRONT-estado.md`.
