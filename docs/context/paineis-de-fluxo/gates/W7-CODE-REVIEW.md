# W7 — code-review da fase 05 de `paineis-de-fluxo`

- **Alvo:** `git diff eda7520..31fade6` (branch `wave/paineis-f05` contra `master`), 89 arquivos,
  +8675/−550 `[MEDIDO 2026-10-02: git diff eda7520..31fade6 --stat | tail -1]`.
- **Instrumento:** skill `code-review`, nível `high`, mais verificação manual de cada achado contra
  o código em `31fade6` (só leitura; nenhum teste rodado por este gate).
- **Intenções lidas:** `docs/plans/SPEC-009-paineis-de-fluxo/05_correcoes_de_uso.md`,
  `handoff/T-05.1-desenho.md`, `handoff/T-05.2-desenho.md`, `handoff/T-05.4-desenho.md`,
  `handoff/FIX-uso-2026-10-02.md`, `docs/medicao-coinalyze.md §1.3`.

## Veredito: **NEEDS_FIX**

Um achado CONFIRMED de severidade relevante (leitura numérica na tela que contradiz a faixa
desenhada, em 1h/4h). O resto é PLAUSIBLE, aceito por desenho, ou limpeza.

## Achados CONFIRMED

### C-1 — `recentStats` do long/short corta na grade de 1 min, a faixa corta na grade do eixo (1h/4h) — **MÉDIA**

- `frontend/src/app/symbol/panel-assembly.ts:311` e a cópia SSR em
  `frontend/src/app/symbol/[symbol]/page.tsx:943`.
- A wave passou `longShortSlots` para a grade do eixo (`nonNegativeFlowSlotsFromHistoryRows(..., axisStepMs)`;
  em `eda7520:panel-assembly.ts:264` era sem `axisStepMs`), mas o corte de `recentStats` continua
  `windowEndMsInclusive - 4h`, e `windowEndMsInclusive` é `lastGridInstant(window, ONE_MINUTE_MS)`
  (`request-window.ts:171`). A faixa (`long-short-band.ts:61 recentBandSlotRange`) corta em
  `slots[last].time - 4h`, na grade do eixo.
- **Cenário:** TF 4h, slots em 08:00/12:00, `windowEndMsInclusive` = 15:59 ⇒ `recentStats` mantém
  só slots `>= 11:59` = **1 slot (n = 1, amplitude 0)**; a faixa vai de 08:00 a 12:00 = **2 barras**.
  Em 1h: **4 slots de estatística contra 5 barras de faixa**. O rodapé "Últimas 4 h … n = …" e o fato
  `long_short_recent_scale:n` descrevem um conjunto diferente da faixa sombreada. Em 1m os dois
  coincidem (sem regressão em 1m).
- **Correção sugerida:** cortar em `lastAxisInstantMs` (page) / tempo do último slot (assembly), ou
  derivar `recentStats` do próprio `recentBandSlotRange`.
- **Força:** CONFIRMED por leitura de código `[INFERRED: aritmética sobre as duas expressões; não
  rodei e2e em 4h]`.

## Achados PLAUSIBLE / aceitos por desenho (não bloqueiam)

| # | arquivo:linha | cenário | status |
|---|---|---|---|
| P-1 | `backend/src/modules/sentimento/infra/collectors_cli.py:2588` | `lookback_s` volta a 3 h após o 1º ciclo que não lança, mesmo se um símbolo esgotou retry (429/5xx) nesse ciclo ⇒ os buracos antigos daquele símbolo não são re-consultados e nada avisa | CONFIRMED no código, mas **é o desenho** (`T-05.2-desenho.md:180-182`: "só para o primeiro ciclo depois do boot"); mitigação operacional = reiniciar de novo. Baixa. |
| P-2 | `backend/src/modules/sentimento/domain/liquidation_collection.py:321` | zero candidato sem margem de assentamento; se o provedor publicar o minuto depois do 1º ciclo, `argmin(observed_at)` serve o zero falso | PLAUSIBLE. Desenho recusou margem com medição (5.846/5.848 buckets capturados, `[MEDIDO 2026-10-02, desenho §1, q7]`). Falsificador em produção, não defeito de código. |
| P-3 | `liquidation_collection.py:313` | guarda de retenção só morde com `>= 1500` pontos; resposta esparsa cortada por retenção com < 1500 pontos geraria zeros falsos | **Refutado em grande parte:** `docs/medicao-coinalyze.md §1.3` mede retenção por pontos *presentes* ("série esparsa retém mais tempo de relógio", 3.052 pontos ≈ 8 d). Resta o `[NÃO SEI]` "retenção mantém os mais novos" já declarado em `T-05.2-desenho.md:259`. |
| P-4 | `frontend/src/app/symbol/coverage-magnitude.ts:91` | `expectedFacts`/`reaggregatedBuckets` incluem a cabeça; `missingFacts`/`partialBuckets` não ⇒ "em P de R barras" conta barras da cabeça em R | Denominador com cabeça é **desenho** (`T-05.4-desenho.md §2.1`, comentário em `:58-60`). Só `R` de barras é discutível. Baixa. |
| P-5 | `coverage-magnitude.ts:262` | `allSame` funde pernas com mesmas contagens sem comparar `nativeGridMs`; long 1min e short 5min com 10/100 cada imprimiriam um único span | PLAUSIBLE; hoje as duas pernas de liquidação vêm do mesmo catálogo/grade. Endurecer com `nativeGridMs` no predicado. |
| P-6 | `backend/src/modules/sentimento/infra/redis_resp_client.py:94` | `RespConnection.command` sem lock, compartilhada por 7 threads em `collectors_cli` ⇒ resposta lida pela thread errada / bytes intercalados | **Pré-existente, fora do diff.** O gate novo (`redis_stream_backpressure.py`, `StreamDrainGate`) usa conexão **própria e preguiçosa** e documenta o risco — correto para o que a wave introduz. Recomendo `threading.Lock` em `command` numa task separada. |
| P-7 | `frontend/src/app/symbol/SymbolClient.tsx:1237` | `publishBarSpacing` (instrumentação e2e) roda em produção a cada mudança de range | Limpeza/eficiência; o handler já escreve `dataset` a cada evento. Baixa. |
| P-8 | `frontend/src/app/symbol/use-history-pager.ts:254` | `useRef(mountViewRange(axis).fromMs)` recalcula a cada render | Limpeza (`useState(() => …)`). |
| P-9 | `SymbolClient.tsx:3590` | `LongShortReadableHorizon` chama `formatCoverageSpan(axisStepMs)` em vez de `useSlotUnit()` | Limpeza (duas fontes da mesma unidade). |

## Focos pedidos, verificados sem achado

- **Trava por posição do pager:** `isLeftOfMountView` compara instante absoluto em ms com meia
  barra de tolerância; o `ref` é do mount, e a troca de TF remonta o cliente
  (`seedIdentityKey` inclui `interval`, `page.tsx:1033`, `seed-identity.ts:58`) ⇒ sem ref obsoleto.
- **Regressão em 1m:** `TIMEFRAME_WINDOW_BARS["1m"].pageBars = 500` = o antigo `DEFAULT_PAGE_SLOTS`;
  `axisForWindow(…, stepMs)` com 1 min reproduz o `axisFromWindow` removido.
- **Backpressure:** probe por `XINFO GROUPS … lag` (não `XLEN`), teto derivado de `MAXLEN/5`, grupo
  ausente = espera (não crash), `stop_event` encerra a espera.
- **Anti-lookahead do zero:** zero candidato obedece `is_settled_bucket` (mesma fronteira do não-zero)
  e `first_whole_bucket_start(from)`; `heapq.merge` preserva a recusa de ordem a jusante.
