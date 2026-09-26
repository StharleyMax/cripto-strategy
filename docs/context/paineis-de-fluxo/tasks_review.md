# `paineis-de-fluxo` — narrativa de review da quebra em tasks

> ✅ **Aprovada em 2026-09-23** `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`
> — as 4 escolhas estão em §7, transmitidas pelo loop principal. Materializada no mesmo dia:
> [`tasks.toml`](tasks.toml) (39 tasks, validado), cards `CST-246..CST-289` (§6), escopo declarado (§8).
> Nenhuma linha de código foi escrita.
>
> **SPEC:** [`SPEC-009`](../../specs/SPEC-009-paineis-de-fluxo.md) · **PRD:** [`PRD-009`](../../specs/PRD-009-paineis-de-fluxo.md) ·
> **ADRs:** [`ADR-044`](../../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md) · [`ADR-045`](../../adr/ADR-045-candle-de-oi-derivado-e-projecao-na-rota-ancorada-na-fronteira-de-abertura.md)
> **Plano:** [`docs/plans/SPEC-009-paineis-de-fluxo/`](../../plans/SPEC-009-paineis-de-fluxo/index.md) — `index` + 4 arquivos de fase (a `03` em `03a`/`03b`)
> **Decisões do owner:** [`handoff/DECISOES-DO-OWNER-2026-09-23.md`](handoff/DECISOES-DO-OWNER-2026-09-23.md) · **design:** [`handoff/DESIGN-LAYOUT.md`](handoff/DESIGN-LAYOUT.md) §6-§7
> **Estado do ledger:** `harness pipeline state paineis-de-fluxo` → **`SPEC_APPROVED`** `[MEDIDO 2026-09-23]`
> **Execução:** [`PLANO-DE-PARALELISMO.md`](PLANO-DE-PARALELISMO.md) — 27 lotes, 6 waves.
> **Dado de máquina:** o `tasks.toml` nasce **depois** da aprovação desta narrativa. Este arquivo não é
> lido por máquina, e aquele não vai argumentar.

---

## 0. Veredito em uma linha

**39 tasks** em cinco fatias (`01` · `02` · `03a` · `03b` · `04`). A quebra é 1:1 com os itens numerados
do plano, **mais** as tasks que o plano exige e não numerou: o coletor em si (`T-03.4`), os DoD que são
trabalho próprio (Playwright com ablação, teto de latência, vereditos de design) e **um spike que eu
acrescentei** (`T-04.0`, §3). Duas fusões e uma cisão estão justificadas linha a linha em §1.

## 1. Trilha item do plano → task

Formato do título, que vai literal para o `tasks.toml`: `[componente][componente] <fase> · <o quê>`,
com `components` casando `harness policy --key components` → `["sentimento", "charts", "convergencia",
"backtest", "web", "docs", "infra"]` `[MEDIDO 2026-09-23, n=7]`. Nenhuma task usa `convergencia`,
`backtest` nem `docs`. **"Editor"** = a task edita `SymbolClient.tsx` (2.936 linhas, `wc -l` em
`61dbf6b`), e o plano de paralelismo não põe duas no mesmo lote (`SPEC-009` §8).

### Fase `01` — o esqueleto (9 itens → 12 tasks) · `web` · `charts`

| task | título | depende de | requisitos | DoD · o que morde |
|---|---|---|---|---|
| **`T-01.0`** | `[web][charts] 01 · ⛔ Spike: um createChart com panes nativos sobre dado real, F-1..F-5 + controle negativo de F-1 (NAO mergeado)` | — | `ADR-044` §Falsificador, `ARQ-1` `[NÃO SEI]` | Relatório em `gates/T-01.0-spike.md` com F-1..F-5, **cada um com comando e `n`**, **e** o controle negativo (busy-wait de 20 ms que **tem de** mover o `p95`; se não mover, vale um 2º instrumento com poder demonstrado, ou o resultado é `[NÃO MEDIDO]`). Responde os dois `[NÃO SEI]`: `getHTMLElement()` no tick de `addPane` e `setCrosshairPosition` sobre *whitespace*. `BTCUSDT`, `1m`, ~5.760 slots, 11 séries, `next build`/`next start`. **Reprovou qualquer um ⇒ a fase para, `S-2` reabre, relatório ao `/architect`, e esta narrativa reabre** (§4 R-1). O código vive em `spike/…` e nunca chega a `master` |
| `T-01.1` | `[web] 01 · Baseline de latencia no HEAD de master: 5 rodadas isoladas de e2e/17 e e2e/20 (p50/p95/max) + como o OI aparece hoje no TF 1m` | `T-01.0` | `CA-11′`, `SPEC-009` §6.4 | `p50/p95/max` por spec e por rodada, **com o sha medido**, comando de `ARQ-1` §7; `data-fact` de `oi_slots` e `presentPoints` em `/symbol/BTCUSDT?interval=1m`. **Lote solo**: medição de latência com outra worktree compilando mede a outra worktree |
| `T-01.2` | `[web] 01 · Pane registry: array ordenado, paneIndex = posicao, invariantes (i)-(v) com um caso que reprova e um que passa` | `T-01.0` | `RF-1`, `RF-5`, `RN-4`, §5 | `node --test`: ≥ 10 casos (5 invariantes × {reprova, passa}). `pane_id` ASCII em inglês (`price`, `liquidation_long`, `liquidation_short`, `oi`, `long_short`, `cvd`). **Morde:** tirar o `absence_mark` de uma série `FLOW` reprova (iii); escrever um `label` à mão reprova (iv); `time` fora da grade reprova (v). Os ~7 contratos de DOM que morrem (`ARQ-1` §6) **renascem aqui** |
| `T-01.3` | `[charts] 01 · Geometria das bandas de marca ancorada em IPaneApi.getHeight(), em charts; as 14 constantes de geometria de web nao crescem` | `T-01.0` | `RN-4`, `ADR-003/FR-2` | Função pura em `frontend/src/charts/`, com teste. `grep -nE '^const [A-Z_]*(_PX\|_SCALE_MARGINS\|_LOG_BASE\|_HEIGHT_PX)\s*=' frontend/src/app/symbol/SymbolClient.tsx \| wc -l` → **14** hoje `[MEDIDO em 61dbf6b]`; **≥ 15 reprova** |
| `T-01.4` | `[charts] 01 · Leitura da legenda como funcao pura: (param.logical, slots, nature) -> valor, held ou ausente; sem crosshair, o ultimo bucket FECHADO` | `T-01.0` | `RF-4`, `RN-4`, `ADR-044/D2`, `ADR-026` | **Cisão do item 1.6** (§2): a parte pura sai de `SymbolClient.tsx` e anda em paralelo. Casos `FLOW`/`STOCK`/`RATIO`, slot ausente ⇒ **ausente** (nunca `0`), sem crosshair ⇒ último **fechado** (o em formação só com marca, §4 da SPEC). **Morde:** índice do último bucket trocado por `−1`; ausente devolvendo `0` |
| `T-01.5` | `[web][charts] 01 · Montagem unica: useLightweightChart vira host, addSeries com paneIndex, axis-sync com panelCount=1; saem os 6 indices fixos e PANEL_COUNT=6` · **editor** | `T-01.2`, `T-01.3` | `RF-2`, `RF-3`, `RF-6` | `PANEL_COUNT` sai de `axis-sync.ts`/`axis-sync-provider.tsx` (e das 37 ocorrências em teste, `grep -c` em `61dbf6b`); `RangeDispatcher` e os testes de álgebra **ficam verdes sem edição de asserção**. Nenhuma forma de série muda ⇒ e2e `08`..`15` verdes |
| `T-01.6` | `[web][charts] 01 · Camada de DOM por pane sobre getHTMLElement(): pointer-events none, scaleMargins.top reservando a legenda, setStretchFactor com piso de 72px, enableResize=false, separador #8b949e testado` · **editor** | `T-01.5` | `RF-4`, `CA-12`, `[Q-DG-1]` | Carrega as condições do gate r2 que são de F1: **C-4** (modo explícito no chrome), **C-5** (filho interativo continua clicável e alcançável por teclado), **C-6** (asserção sobre `separatorColor` — o default da lib dá **1.30:1** `[MEDIDO pelo gate r2]` — e margem inferior ≥ 4px no volume). Os `data-testid` atuais sobrevivem na raiz da camada, derivados de `pane_id`. **Morde:** remover o override de separador reprova; remover `scaleMargins.top` faz marca intersectar a legenda no render. ⚠️ **Pesos**: ver §4 R-2 |
| `T-01.7` | `[web] 01 · Ligacao crosshair -> legenda: subscribeCrosshairMove SEM filtro por paneIndex, nome derivado de identityTerms uma vez por pane, coluna fixa para os numerais (C-8)` · **editor** | `T-01.4`, `T-01.6` | `RF-4`, `RF-5`, `CA-3′`, `CA-4`, `CA-5` | Consome a função de `T-01.4`. **C-8**: slot de largura fixa em `ch`, alinhado à direita |
| `T-01.8` | `[web] 01 · Re-ancorar e2e 16, 20 e 21 e os contratos de DOM acoplados a construcao (ARQ-1 §6); e2e/11 intacto` | `T-01.6` | — | `git diff --stat <base>..HEAD -- frontend/e2e/11-canvas-fundo.spec.ts` **vazio**. Contabilidade dos **56** testes de `*-pane-dom-contract.test.ts` (`ARQ-1` §6): quantos sobrevivem, quantos migram para `T-01.2`, e **nenhum some sem destino** |
| `T-01.9` | `[web] 01 · Playwright contra o app real: 1 grafico (CA-1'), 1 eixo por pixel (CA-2'), legenda == API em n>=5 posicoes (CA-3'/CA-4), legenda derivada (CA-5), com as 4 ablacoes` | `T-01.7`, `T-01.8` | `CA-1′`..`CA-5`, `DoD-3`/`DoD-4` | Itens 2–6 do DoD de `01`: `.tv-lightweight-charts` `== 1` e **6** panes com `N > 0`; rótulo de tempo só no rodapé, **por pixel**; hover em `x` ⇒ 6 legendas `==` slot de `x` em `/series-history`; sem hover ⇒ último fechado. **Ablações:** voltar a 6 `createChart` · filtrar por `param.paneIndex` · índice `−1` · nome escrito à mão. `DoD-1`/`DoD-2` como não-regressão. e2e `08`..`15` verdes |
| `T-01.10` | `[web] 01 · Teto de latencia (CA-11'): e2e/17 p95<=160ms com n>=61, e2e/20 p95<=400ms com n>=10, sem regredir sobre T-01.1, controle negativo que move o p95` | `T-01.1`, `T-01.8` | `CA-11′`, `RNF-2` | Tetos `[DECISÃO-OWNER: 2026-09-22]`/`[DECISÃO-OWNER: 2026-09-19]`, ambos com "escolha entre alternativas apresentadas". **Lote solo.** Sem o controle negativo movendo o `p95` ⇒ `[NÃO MEDIDO]` e escala, **não sai verde** |
| `T-01.11` | `[web] 01 · Veredito do ux-ui-mastery sobre o SCREENSHOT Playwright do app real com dado real (C-0, render medido)` | `T-01.9` | `CA-12`, `DoD-6` | O screenshot é o de `T-01.9`, não uma tela do Stitch `[DECISÃO-OWNER: 2026-09-23, 2ª rodada]`. `NEEDS_FIX` volta para `T-01.6`/`T-01.7` **dentro da fase** |

### Fase `02` — o volume com direção (4 itens → 5 tasks) · `charts` · `web`

| task | título | depende de | requisitos | DoD · o que morde |
|---|---|---|---|---|
| `T-02.1` | `[charts] 02 · Funcao pura vela -> cor da barra de volume com os dois tokens da vela; doji = alta; vela ausente sem cor de direcao` | `T-01.10`, `T-01.11` | `RF-7`, `RNF-3`, `RN-4` | **Fusão 2.1 + 2.2**: é a mesma função, e "vela ausente" é o 4º caso do mesmo teste. `node --test`, 4 casos. **Morde:** `≥` → `<` reprova 3 de 4 |
| `T-02.2` | `[web] 02 · Escala log x linear do rodape de volume (Q-VOL-2/Q-DG-2), decidida pelo design_gate` · **editor** | `T-01.10`, `T-01.11` | `CA-12` | Decisão registrada com o veredito do `ux-ui-mastery` antes da implementação |
| `T-02.3` | `[web] 02 · Ligacao no registry: a serie secondary do pane price usa a funcao de T-02.1` · **editor** | `T-02.1`, `T-02.2` | — | Mesma entrada do registry que `T-02.2` ⇒ em série |
| `T-02.4` | `[web] 02 · Playwright CA-6: cor lida do canvas na barra i == direcao da vela i na API, n>=50, com alta e baixa na janela; ablacao inverte o comparador` | `T-02.3` | `CA-6`, `DoD-3`/`DoD-4` | Janela sem as duas direções ⇒ **inconclusivo**, não verde. Não-regressão de `binance·klines_volume·1m·SUM` |
| `T-02.5` | `[web] 02 · Veredito do ux-ui-mastery sobre o screenshot do volume com direcao` | `T-02.4` | `CA-12` | — |

### Fase `04` — as liquidações num pane (5 itens → 8 tasks) · `web` · `charts`

| task | título | depende de | requisitos | DoD · o que morde |
|---|---|---|---|---|
| **`T-04.0`** | `[web][charts] 04 · ⛔ Spike F-6 antes da construcao: base das duas escalas (invertida e superior) em <=1px e nenhum valor <0 em setData; responde o [NÃO SEI] de C-3 (NAO mergeado)` | `T-02.5` | `ADR-044/F-6`, C-3 | **Acréscimo meu, ver §3.** Relatório em `gates/T-04.0-spike-f6.md`. Reprovou ⇒ entra o plano B (negação + escala linear), relatório ao `/architect`, e `T-04.1`..`T-04.3` são reescritas **antes** de construídas |
| `T-04.1` | `[charts] 04 · Pane de liquidacao em charts: 2 barras, 4 marcas, 4 escalas; perna long com invertScale; mesmo maximo nas duas pernas (C-3); magnitudes >=0; par ausencia/zero por perna` | `T-04.0` | `RF-10`, `RN-3`, `RN-4`, `ADR-044/D4` | **Fusão da parte `charts` de 4.1 com 4.2**: o par ausência/zero de cada perna é escalado pela escala **da perna** ⇒ mesma edição. **Morde:** negar a perna long; autoscale independente (reprova o mesmo-máximo) |
| `T-04.2` | `[web] 04 · Registry: liquidation_long + liquidation_short viram um pane liquidation; short em cima (alta), long embaixo (baixa)` · **editor** | `T-04.1` | `RF-10`, `[Q-LIQ-2]` | Convenção Coinalyze `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`. A reversão, se um dia vier, é trocar o `scale_ref` das pernas |
| `T-04.3` | `[web] 04 · Legenda da liquidacao: 2 magnitudes sem sinal, numeral em tinta neutra, quadrado de 8px vazado (short) / cheio (long) estrutural em forced-colors (C-7), nenhum terceiro numero` · **editor** | `T-04.2` | `RF-10`, `RN-3`, `SPEC-009` §7.3 | **C-7**: borda nos dois e preenchimento só no cheio, ou `forced-color-adjust: none` |
| `T-04.4` | `[web] 04 · Log x linear e tamanho das duas metades do pane de liquidacao (Q-DG-2), decididos pelo design_gate` · **editor** | `T-04.2` | `CA-12` | — |
| `T-04.5` | `[web] 04 · Re-ancorar e2e/13 (hospedeiro de canvas por coorte, :532, 692-697) no pane fundido` | `T-04.2` | — | — |
| `T-04.6` | `[web] 04 · Playwright: F-6 no codigo de producao, CA-LIQ n>=20, CA-9' (a)(b)(c), CA-10' por perna, 5 panes com N>0, nao-regressao das duas coortes, com as ablacoes` | `T-04.3`, `T-04.4`, `T-04.5` | `CA-9′`, `CA-10′`, `CA-LIQ`, `CA-1′` | Itens 1–6 do DoD de `04`, **com as cláusulas de inconclusivo** (bucket com as duas pernas `> 0` e distintas; os dois estados na janela). **Ablações:** trocar o `scale_ref` · somar/subtrair as pernas · fundir ausência e zero |
| `T-04.7` | `[web] 04 · Veredito do ux-ui-mastery sobre o screenshot do pane fundido` | `T-04.6` | `CA-12` | — |

### Fase `03a` — o coletor (5 itens → 7 tasks) · `sentimento` · `infra`

Não toca `SymbolClient.tsx` ⇒ anda **em paralelo com a `01`/`02`**, respeitando o teto de 2.

| task | título | depende de | requisitos | DoD · o que morde |
|---|---|---|---|---|
| `T-03.1` | `[sentimento] 03a · Cliente de GET /fapi/v1/openInterest: o time da resposta vira event_time; le x-mbx-used-weight-1m` | — | `RN-1` | Teste com resposta **lida** da Binance (leitura de origem não é semeadura). **Morde:** usar o instante do pedido em vez do `time` |
| `T-03.2` | `[sentimento] 03a · Carimbo na grade de 1 min com janela de admissao [T, T+20s]; fora dela o minuto fica AUSENTE, nunca carrega o anterior` | — | `RN-2`, `[Q-STAMP-1]` | Função pura; casos na borda da janela. **Validação do `quant-architect` registrada** (`[Q-STAMP-1]` é inferível, e o dono é ele). **Morde:** *carry-forward* |
| `T-03.3` | `[sentimento] 03a · Catalogo: 4 entradas binance·open_interest·1m·POINT (STOCK, POINT_AT_BUCKET_END, unit=BTC, denom=base), uma por simbolo` | — | `D-a`, `D-b` | Servidas por `/api/v1/series-catalog`. ⚠️ ver §4 R-4 (colisão com `coinalyze-fora-da-quarentena`) |
| `T-03.4` | `[sentimento] 03a · Coletor: laco de 60s alinhado a grade que compoe cliente + carimbo + escritor, registrado no collectors_cli, com n_written por ciclo` | `T-03.1`, `T-03.2`, `T-03.3` | `RNF-4`, `PRD-009` G-1 | **Task que o plano exige e não numerou** (`SPEC-009` §6.7 lista "coletor"). Escritor desde o 1º dia. Eventos de log e chaves de `extra` **novos em inglês** (linha 10 do `CLAUDE.md`) |
| `T-03.5` | `[infra] 03a · Cadencia de 60s como variavel de ambiente do servico collectors em deploy/compose.yml, no idioma de OPEN_INTEREST_CYCLE_INTERVAL_S (:187), com julgamento do infra-architect` | `T-03.4` | `RNF-4`, `D-j`, `[Q-CAD-1]` | 60 s `[DECISÃO-OWNER: 2026-09-23, 2ª rodada]`. `docker compose config` válido. Veredito do `infra-architect` em `gates/` |
| `T-03.6` | `[sentimento] 03a · DoD de captura na stack de e2e PROPRIA: md.series 0 -> >0 com n_written>0, cota <=4/min pelo header, minuto com o coletor parado nao tem linha` | `T-03.5` | `DoD-1`, `RN-2` | Itens 1 (parte de contagem), 2 e 4 do DoD de `03a`. **Nunca no Postgres compartilhado** (`D-g`). **Morde:** laço sem espera faz a parcela passar de 4; *carry-forward* cria linha no minuto parado |
| `T-03.7` | `[infra] 03a · Medicao pos-deploy de 24h: count por simbolo >= 0,95 x 1.440 e pg_total_relation_size contra ~570 KB/dia (> 1,14 MB/dia volta ao owner)` | `T-03.6` | `DoD-1`, `RNF-4` | **Task com relógio**: o `t0` de `pg_total_relation_size` é tirado **no deploy** (ato do orquestrador ao mergear a wave da `03a`); o `t1`, ≥ 24 h depois. Abaixo de 0,95 × 1.440 ⇒ número ao `quant-architect` |

### Fase `03b` — a projeção e o pixel (5 itens → 7 tasks) · `sentimento` · `web`

Só depois da `04` (restrição do despacho e `SPEC-009` §8) **e** de `T-03.7`.

| task | título | depende de | requisitos | DoD · o que morde |
|---|---|---|---|---|
| `T-03.8` | `[sentimento] 03b · Projecao OiCandle pura (ADR-045/D1), chave no trio (STOCK, POINT, POINT_AT_BUCKET_END); outro trio falha alto; a grade nativa g vem do SeriesKey` | `T-04.7`, `T-03.7` | `RN-2`, `RN-5` corrigido | Propriedades de `§6.4`: `low ≤ min(o,c) ≤ max(o,c) ≤ high`; nenhuma linha com `open_at_ms == close_at_ms`; `samples.expected = TF/g`. **Morde:** aceitar outro trio; costurar âncora sobre buraco |
| `T-03.9` | `[sentimento] 03b · Um candle, uma serie (ADR-045/D2-bis): polling se ha ponto em T0, openInterestHist senao; a rota serve OiCandle com derived_from e samples` | `T-03.8` | `RN-6` | `derived_from ∈ {binance_poll_1m, binance_point_5m}`. **Morde:** âncora do histórico com amostras do polling |
| `T-03.10` | `[sentimento] 03b · ⛔ Falsificadores 3 e 4 de ADR-045 ANTES do pixel: propriedades em n>=288 buckets reais por regime e mediana abs(poll-hist)/hist <= 10bp em n>=288` | `T-03.9` | `ADR-045` §Falsificador | Itens 1–2 do DoD de `03b`. **Uma divergência reprova.** Reprovou ⇒ **para**, número ao `/architect`/owner. O limiar de 10 bp é `[INFERRED]` (`SPEC-009` §6.2) |
| `T-03.11` | `[web] 03b · Pane oi passa de line para candlestick no registry, legenda O·H·L·C, rotulo DERIVADO derivado de derived_from (nunca escrito a mao)` · **editor** | `T-03.10` | `RF-8`, `RF-9`, `RN-6` | — |
| `T-03.12` | `[web] 03b · Forma do trecho anterior a captura em 1m, falta de pavio em 5m e marca de fronteira entre regimes (Q-DG-3, Q-OI-3), por design_gate + quant-architect` · **editor** | `T-03.11` | `Q-OI-3`, `[Q-DG-3]` | — |
| `T-03.13` | `[web] 03b · Playwright: CA-7 n>=50 por regime com bucket de divergencia preco x OI, CA-8' com buraco de M3, um candle uma serie na fronteira, pixel com ablacao (volta a line)` | `T-03.12` | `CA-7`, `CA-8′`, `DoD-3`/`DoD-4` | Itens 3–6 do DoD de `03b`, com as cláusulas de inconclusivo. **Morde:** colorir pelo preço; costurar o buraco; misturar as séries |
| `T-03.14` | `[web] 03b · Veredito do ux-ui-mastery sobre o screenshot do candle de OI nos dois regimes` | `T-03.13` | `CA-12` | — |

**Numeração:** `03a` e `03b` usam `T-03.1..7` e `T-03.8..14`, e no `tasks.toml` as duas são
`phase = "03"` (§4 R-3). O id não mudou com a decisão da chave de fase.

## 2. Contagem, fusões e cisões

| fase | componentes | tasks | editores de `SymbolClient.tsx` | pixel |
|---|---|---|---|---|
| `01` | `web` · `charts` | **12** | 3 | 6 panes num gráfico, um eixo, legenda = API |
| `02` | `charts` · `web` | **5** | 2 | barra de volume na cor da vela |
| `04` | `web` · `charts` | **8** | 3 | short em cima, long embaixo, um pane |
| `03a` | `sentimento` · `infra` | **7** | 0 | (dado) `md.series` de 0 para `> 0` |
| `03b` | `sentimento` · `web` | **7** | 2 | candle de OI por contratos, dois regimes |
| | | **39** | 10 | |

- **Fusões (2):** `T-02.1` (2.1 + 2.2) e `T-04.1` (parte `charts` de 4.1 + 4.2), cada uma porque a segunda
  metade é caso de teste da primeira.
- **Cisão (1):** item 1.6 → `T-01.4` (função pura, `charts`) + `T-01.7` (ligação, `web`), para tirar
  código de `SymbolClient.tsx` e liberar o lote.
- **Acréscimos (2):** `T-03.4` (o coletor, que o plano pressupõe) e `T-04.0` (§3).

## 3. O acréscimo que precisa de olho: `T-04.0`, um spike de F-6

O plano põe F-6 como **item 1 do DoD** da `04`, ou seja, no fim. Mas F-6 é o falsificador do
**mecanismo** da fase (`invertScale`), e o plano B (negação + escala linear) troca o mecanismo de
`T-04.1`..`T-04.3`. Medir F-6 no fim significa, se reprovar, **refazer a fase inteira**. Com um spike antes,
o custo é **um lote**. A mesma lógica já é o `T-01.0`. F-6 **continua** no DoD de `T-04.6`, agora
contra o código de produção. **Se o owner recusar, `T-04.0` sai e nada mais muda.**

## 4. Riscos

| # | risco | o que acontece | onde está tratado |
|---|---|---|---|
| **R-1** | `T-01.0` reprova | `S-2` reabre; `T-01.2`..`T-01.11` **estão decompostas para `S-1`** e ficam inválidas; esta narrativa reabre. A `03a` **não** é afetada | `T-01.0` DoD; a `03a` segue |
| **R-2** | **pesos de pane ambíguos para a F1** | `34 · 11 · 15 · 9 · 9 · 9 · 9` nomeiam 7 panes (com funding e CVD partido). A F1 tem 6, com a liquidação em **dois** panes e o CVD em **um**. Não está escrito se a liquidação leva 11 cada ou 5,5 cada, nem se o CVD leva 9 ou 18. **Dono: `design_gate`** (autonomia delegada), decidido dentro de `T-01.6`. **Não é pergunta ao owner** | `T-01.6` |
| **R-3** | chave de fase `03a`/`03b` **sem precedente** no validador | ✅ **Medido na materialização (2026-09-23):** `phase = "03a"` → `V-11 phase '03a' fora do formato NN` (14 ERROR); `phase = "05"` para a `03b` → `V-24 phase '05' sem arquivo correspondente` (7 ERROR). **Resolução:** as 14 tasks são `phase = "03"`, com o rótulo `03a`/`03b` no título, e os ids ficaram iguais. **Custo:** `harness resolve` é atômico por fase, então ao fechar a `03a` a mesma chamada lista `T-03.8..T-03.14` como `blocked:<motivo>`. `[NÃO MEDIDO: se o resolve aceita blocked → done depois]` | `tasks.toml` (cabeçalho) |
| **R-4** | colisão com `coinalyze-fora-da-quarentena` | `SPEC_APPROVED` e aguardando `/tech-lead` (`harness status`), mexe em `sentimento` e cita `open_interest`. **O teto de 2 é global**: se ela entrar em build, divide as vagas com esta, e pode editar o mesmo módulo de catálogo de `T-03.3` | `PLANO-DE-PARALELISMO.md` §4 |
| **R-5** | `T-03.7` e `T-03.10` dependem de **relógio** | ≥ 24 h de captura depois do deploy. Não trava `01`/`02`/`04`; só a `03b` | `T-03.7` |
| **R-6** | caminho crítico **serial** | 27 lotes para 39 tasks, ocupação **1,44**. A `03b` são 7 lotes de uma task: é cadeia de `depends_on`, não folga | `PLANO-DE-PARALELISMO.md` §3 |
| **R-7** | `candle-real-e-eixo-unico` ainda não está `DONE` | `harness status` → `BUILD_AUTHORIZED`, com as 5 fases `APPROVED`, aguardando o owner. Se reabrir algo em `SymbolClient.tsx`, colide com a F1 | owner |

## 5. O que NÃO virou task, e cada ausência é decisão

| ausência | motivo | dono |
|---|---|---|
| As pernas da `ADR-043` | ela é `proposta` e **não tem feature**. O que esta quebra garante é o **lugar** delas: a F1 vem antes, e **nenhuma** perna entra enquanto uma fase desta feature estiver em construção (`SPEC-009` §8) | owner (§7 pergunta 3) |
| Ramos `O-1`/`O-2`/`O-3` e a emenda de `ADR-036/D2` | recusados `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]` | — |
| Pane de funding e CVD partido | `NG-3`/`NG-5`, mantidos na 2ª rodada | owner |
| Consertar os buracos do OI da Binance | `NG-6`: aqui só se desenha honesto | — |
| Divergência, VPVR, CVD spot, L/S de top traders | `NG-1`, `NG-2`, `NG-4` | — |
| *"`setData` sem remontar"* | `[I-5]`, herança possível da `ADR-043` | `ADR-043` |
| Qualquer `[[rules.own]]`, alvo de `make` ou allowlist **de idioma** | `ADR-011/D1.10`: **reprova a fase** | — |

## 6. Tracker — **cardado em 2026-09-23**

`harness policy --key tracker` → `{kind = "jira", project = "CST", board_id = "36", parent_kind = "Epic",
child_kind = "Tarefa"}` `[MEDIDO 2026-09-23]`. Criado **depois** da aprovação de §7, na convenção das
features anteriores (um Epic por fatia, Tarefa filha com `parent`):

| Epic | título | Tarefas |
|---|---|---|
| `CST-246` | `[paineis-de-fluxo] F1 · O esqueleto` | `T-01.0` … `T-01.11` → `CST-251` … `CST-262` (12) |
| `CST-247` | `[paineis-de-fluxo] F2 · O volume com direcao` | `T-02.1` … `T-02.5` → `CST-263` … `CST-267` (5) |
| `CST-248` | `[paineis-de-fluxo] F3a · O coletor de OI` | `T-03.1` … `T-03.7` → `CST-276` … `CST-282` (7) |
| `CST-249` | `[paineis-de-fluxo] F3b · O candle de OI` | `T-03.8` … `T-03.14` → `CST-283` … `CST-289` (7) |
| `CST-250` | `[paineis-de-fluxo] F4 · As liquidacoes num pane` | `T-04.0` … `T-04.7` → `CST-268` … `CST-275` (8) |

Toda task tem `tracker` inline; **nenhuma é `local_only`**. `harness tasks list paineis-de-fluxo` →
`total=39 linked=39 local=0 uncarded=0` `[MEDIDO 2026-09-23]`.

> ⚠️ **CORREÇÃO, 2026-09-23.** A versão anterior desta seção dizia que *"o conector Atlassian exige OAuth
> e a sessão é não-interativa"*. **É falso para o servidor `atlassian` local**: `jira_search` em `CST`
> respondeu autenticado. Quem pede OAuth é o conector `claude.ai Atlassian`, que é outro servidor. É o
> mesmo erro que `candle-real-e-eixo-unico/tasks.toml` corrigiu em 2026-09-19, e fica escrito em vez de
> apagado. ⚠️ `jira_batch_create_issues` devolveu `HTTPError` sem criar nada (conferido por `jira_search`),
> e os cards saíram um a um por `jira_create_issue`.

## 7. As escolhas do owner — `[DECISÃO-OWNER: 2026-09-23, escolha entre alternativas apresentadas]`

Transmitidas pelo loop principal em 2026-09-23. **Não são fala do owner**: ele escolheu entre as opções
que esta narrativa redigiu, com o custo de cada uma declarado.

| # | pergunta (como estava no menu) | escolha | alternativa recusada |
|---|---|---|---|
| 1 | a quebra em 39 tasks, e wave = fase | **aprovada, com wave = fase** (6 PRs: F1, `03a`, `03a`-24h, F2, F4, `03b`) | uma PR por lote (27 PRs) |
| 2 | `T-04.0`, o spike de F-6 antes da `04` | **entra** | F-6 só no DoD de `T-04.6` |
| 3 | onde entram as pernas da `ADR-043` | **depois de `DONE` desta feature** | na janela entre o merge da F1 e a F2, atrasando a F2 |
| 4 | a prioridade da `03a` | **padrão**: trilha de tela primeiro, 27 lotes, coletor em deploy depois do lote 13 | vaga reservada ao coletor: 30 lotes, deploy depois do lote 8 |

**Consequência da escolha 3:** enquanto esta feature não estiver `DONE`, **nenhuma** branch da `ADR-043`
edita `SymbolClient.tsx`. O falsificador de `SPEC-009` §8 (`D7`) passa a ser medido quando ela for agendada.

## 8. O que foi feito, e o próximo passo

1. ✅ `tasks.toml` gerado: `harness tasks validate paineis-de-fluxo` → `OK: 39 task(s), 0 ERROR, 0 WARN`
   `[MEDIDO 2026-09-23]`, depois de resolver R-3;
2. ✅ cards no Jira (§6);
3. ✅ escopo declarado:
   ```
   harness pipeline scope paineis-de-fluxo add \
     frontend/src/app/symbol frontend/src/charts frontend/e2e \
     backend/src/modules/sentimento/domain backend/src/modules/sentimento/use_cases \
     backend/src/modules/sentimento/infra backend/src/api/routes/series_history.py \
     backend/src/api/routes/series_catalog.py backend/tests/sentimento backend/tests/api \
     deploy/compose.yml docs/context/paineis-de-fluxo docs/plans/SPEC-009-paineis-de-fluxo docs/INDEX.md
   ```
4. ✅ [`handoff_to_builder.md`](handoff_to_builder.md) e a linha em `docs/INDEX.md`;
5. `approve tasks` → `advance TASKS_APPROVED`;
6. **`approve build` é do owner.** Depois dele, `/build` começa por `T-01.0`, solo, no lote 1.
