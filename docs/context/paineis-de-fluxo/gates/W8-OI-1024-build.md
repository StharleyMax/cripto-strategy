# W8 — build do `B-1` (área de dado do OI a 1024×768)

- Builder: `frontend-builder`, worktree `w8-oi` (branch a partir de `wave/paineis-f06 @ fd5442c`).
- Norma, nesta ordem: `gates/W8-OI-1024-DESIGN-GATE.md` (APROVADO COM AJUSTE), `handoff/W8-oi-1024-decisao.md`,
  `gates/W8-DESIGN-REVIEW.md` §B-1.
- Ambiente das medidas: `next build` + `next start :4371` desta worktree com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`
  (API do Docker local, só leitura, GET). Nenhuma escrita em banco. Stub do `e2e/40` em processo.

## 1. O que mudou

| arquivo | mudança |
|---|---|
| `frontend/src/app/symbol/SymbolClient.tsx` | `OiCandleLegend`: os 4 campos O·H·L·C num `<span data-legend-ohlc-row className="inline-flex flex-nowrap items-baseline gap-x-2">` (decisão §4). `OiProvenance`: o `<p>` passa a ter `Grandeza: <g>` + um `OiProvenanceTerm` por termo seguinte = ` · ` fora do span + `<span className="inline-block">{Rótulo}: {cabeça}</span>{resto}` (gate §3). `data-fact`, ramo `null` e classe do `<p>` intactos |
| `frontend/src/app/symbol/oi-pane-dom-contract.test.ts` | o CALA de reescrita da frase re-ancorado na forma nova (a regex antiga virava no-op silencioso) |
| `frontend/e2e/40-coverage-magnitude-and-legend-room.spec.ts` | F-1 (piso por TF, `1m` incluído, dado real), F-2 (sonda 13ch no stub `longest` a 1024), F-3 (geometria **e pintura**, 1024 e 1280, stub e real); o stub passou a servir `oi_candles` |
| `frontend/e2e/41-band-tag-and-timeframe-heading.spec.ts` | `WARNING-1`: `1m` no laço N-1, com `data-recent-band-clipped=left` e `border-left-width: 0px` |
| `docs/product/DESIGN_SYSTEM.md` | §6.2 (`WARNING-4`: gramática `<nome> <TF> (<nativa>, <unidade>)` e "sem transformação de caixa") e §6.3 (regra da procedência do OI) |

Fora de escopo, como pedido: o `title` inerte sob `pointer-events-none` e o `N-1b`.

## 2. A condição do `B-1` — px medidos a 1024×768

Área = `data-pane-height-px − data-reserved-scale-top-px` do `oi-pane`, dado real, BTCUSDT
`[MEDIDO 2026-10-03: e2e/40 "T-05.4 real data" @ worktree, facts real_<tf>_1024x768 e real_1m_1024x768]`:

| TF | master (decisão §1.2) | wave antes | **wave + fix** | piso F-1 (`C-4`) | ablação sem `nowrap` |
|---|---|---|---|---|---|
| 1m | 72,0 | 59,2 | **72,0** | 71 | 59,2 ✘ |
| 5m | 72,0 | 59,2 | **72,0** | 71 | 59,2 ✘ |
| 15m | 72,0 | 59,2 | **72,0** | 71 | 59,2 ✘ |
| 1h | 59,2 | 32,0 | **59,2** | 58,2 | 32,0 ✘ |
| 4h | 59,2 | 32,0 | **59,2** | 58,2 | 32,0 ✘ |

**Igual ao master nos 5 TFs** ⇒ a condição do `B-1` (≥ 72,0 / ≥ 59,2, valor medido, não o piso) está cumprida.
A 1280×800: 72,0 nos 4 TFs medidos, igual ao master. Na tela (screenshot do scratchpad, 1024/15m):
`Open Interest 15m (5m, BTC)  O 97450.727 H 97486.774 L 97439.531 C 97442.665   Grandeza: contracts (BTC) · …`,
com `DERIVADO (OHLC de amostras 1m · ADR-045)` sozinho na linha 2. A 1280: `… · Universo: binance/usdm_futu…`.

## 3. Os falsificadores e as ablações

Cada ablação = rebuild do Next com UMA mutação, `next start` novo, e `playwright test e2e/40 -g "C-3 at (1024x768|1280x800)|T-05.4 real data: A-1"`.

| falsificador | forma de produção | ablação | resultado |
|---|---|---|---|
| **F-1** (real, 5 TFs a 1024) | 72/72/72/59,2/59,2, verde | sem o grupo `nowrap` (`className="contents"`) | **reprova 5/5**: 59,2 < 71 (1m/5m/15m), 32,0 < 58,2 (1h/4h); mais o A-4 do probe C-3 (32,0) |
| **F-2** (stub `longest`, 1024, 1h e 15m) | `oiCandles` 168 / 384; tops O,H,L,C = 619,619,619,619; `DERIVADO` 635 | idem | **reprova 2/2**: `part close at top 635.0 ≠ 619.0: the row wrapped` (`DERIVADO` desce para 651) |
| **F-3** (1024: 5 TFs reais + 2 stub) | `Universo` com `painted=false` nos 7 casos ⇒ a linha termina em `· …` | sem `inline-block` no span | **reprova 7/7**: `Universo: label painted with its head "binance" at 1.0 / 6.5 / 8.5 / 14.5 / 33.2 / 36.4 of 49.0 px` (15m real = 1,0 px: o `Universo: …` órfão que o gate previu) |
| **F-3 contra-ablação** (1280, 4 TFs reais + 2 stub) | `painted=true`, cabeça 49/49 px nos 6 | termo inteiro atômico (`{Rótulo}: {cabeça}{resto}` no `inline-block`, gate §2.3) | **reprova 4/4 no real**: `painted=false`. O stub **não** a pega: com numerais mais curtos, o termo inteiro cabe a 1280 no stub (`truncated=true` pela `Coorte`). Declarado, não escondido |

**Por que o F-3 lê PINTURA, e não só geometria** (`memória: assert de DOM não prova pixel`): na forma de produção a
1024 o rótulo `Universo:` está **inteiro dentro da caixa do `<p>`** (`labelInBoxPx = 63`) e mesmo assim não é
pintado. O `inline-block` escondido pelo `text-overflow` **mantém a geometria**. Um F-3 só geométrico reprovaria
a forma correta. `paintsIn` tira dois screenshots da caixa do rótulo, um com o elemento que o contém em
`visibility: hidden`, e repete até a base ficar estável. O **controle** (esconder o `<p>` inteiro muda os pixels
de `Grandeza: …`) é `true` em todos os casos, então a sonda não é vazia. A contra-ablação acima é a prova do
outro lado: a geometria dizia cabeça 49/49 e a pintura dizia `false`, e a tela confirmou que o `Universo` sumiu.

**O mecanismo do CSS confirmado no Chromium deste projeto** (o `[DOC]`/`[NÃO MEDIDO]` do gate §3.3): o
`inline-block` que não cabe é escondido inteiro, não cortado no meio (forma de produção a 1024: `painted=false`
nos 7 casos, e o screenshot mostra `· …`).

`textContent` do `<p>` = a frase única de antes, byte a byte, em todos os casos medidos (F-3, `text=`).

## 4. Testes rodados

- `npm --prefix frontend run lint` → limpo. `test:app` 706/706 · `test:charts` 353/353 · `test:s1` 105/105 ·
  `test:s3` 111/111 `[MEDIDO 2026-10-03]`.
- `e2e/40`, forma de produção: stub C-3 a 1024/1280 (4 testes) **4 passed**; dado real **1 passed** (2,2 min).
- `e2e/41` e `make verify-scope`: ver `handoff/W8-OI-1024-estado.md` (o builder bateu o teto de turnos do R6
  antes de rodá-los).

## 5. Declarado

- `[NÃO SEI]` O piso do stub para o OI a 1024 continua o snapshot `K-3` (58,2): no stub a linha de frescor
  ("Última leitura há 14 min …") quebra em 2 linhas a 1024, porque o dado do stub é mais velho, e a área dá
  59,2 mesmo com a fileira O·H·L·C inteira. Por isso o F-1 por TF só julga dado real, e o F-2 é quem morde
  no `make verify` (onde o teste de dado real é pulado: store SQLite).
- `[NÃO SEI]` 5 da decisão (por que 1h/4h dá 59,2 e não 72) segue aberto: medido, é a mesma coisa no stub —
  um bloco a mais na legenda (`reserved` 88,8 contra 76). Não investigado, fora do escopo.
- Gate §4, falsificador do gate como um todo (o operador lê `· …` como "não tem universo"?): não testado com usuário.
