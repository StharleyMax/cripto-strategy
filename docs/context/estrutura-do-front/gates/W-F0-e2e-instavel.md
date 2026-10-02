# Achado da wave `estrutura-f00`: dois specs de e2e instáveis, anteriores à F0

**Autor:** orquestrador, 2026-10-02. **Base:** `wave/estrutura-f00` em `9445763` (merge de T-00.1/2/3), cujo frontend difere de
`eda7520` só por 3 arquivos de tipo não importados por página, 1 regra de lint e testes `[MEDIDO: git diff --name-only
docs/estrutura-do-front..HEAD -- frontend; grep -rl "indicators/contract|indicator-binding|series-requirement" frontend/src → só os
próprios 3 arquivos]`.

## Contexto: o notebook reiniciou

Os 3 builders da F0 morreram antes de registrar o veredito do `make verify` (os logs em `/tmp` sumiram). O orquestrador rodou os portões
de novo.

## A1 — `e2e/20-teto-latencia-historia-sob-demanda.spec.ts:728` (latência)

| rodada | concorrência | resultado |
|---|---|---|
| `make verify` T-00.1/2/3, 2026-10-02T20:12Z | 3 suítes simultâneas | FALHA nas 3: p95 163,5 / 181,7 / 182,5 contra `<= 160` |
| `make verify` wave, 20:34Z | sozinha | FALHA: 1.053,3 contra `<= 400` |
| spec isolado, A/B sequencial, n=3 por lado | sozinho | **6/6 pass**: base p95 110,5 / 99,0 / 109,9 · wave 123,8 / 112,5 / 104,1 |
| `make verify` wave, 20:54Z | sozinha | pass, p95 89,7 |

`[MEDIDO: scratchpad/e2e20-ab.sh; grep history_page_latency_p95_ms nos logs]`. As faixas de base e wave se sobrepõem (min wave 104,1 <
max base 110,5); n=3 não distingue. O 1.053 ms com a suíte sozinha diz que a instabilidade é do spec ou da ordem da suíte, não só de
carga `[INFERRED]`. Precedente: o fechamento da `T-05.1` (paineis-de-fluxo) já registrou *"e2e/20 era ruído"*.

## A2 — `e2e/18-tf-refetch-e-ablacao.spec.ts:232` (corrida contra o relógio)

Na rodada de 20:54Z: as duas janelas comparadas diferem em **exatamente 300.000 ms** (`knowledgeTimeMs` 1790974440000 → 1790974740000).
`1790974440 mod 300 = 240`: o `knowledgeTimeMs` está numa grade de 5 min com offset de 240 s, e as duas cargas de página do teste
caíram dos dois lados de uma fronteira dela `[MEDIDO: o diff do expect no log; aritmética]`. Defeito do spec (assume que duas cargas
sequenciais caem no mesmo bloco), não da F0.

## O que fica para quem decidir

Os dois specs tornam o portão `make verify` não-determinístico para **toda** wave de front, não só esta. Conserto sugerido, fora do escopo
da F0: A2 fixa o `knowledgeTimeMs` por parâmetro nas duas cargas (ou compara após alinhar à mesma fronteira); A1 precisa de diagnóstico
do outlier de 1.053 ms antes de qualquer ajuste de teto. Origem `[MEDIDO: git log --diff-filter=A]`: e2e/18 nasceu em `T-03.11` (`feat(web)`), e2e/20 em `T-05.9` de `candle-real-e-eixo-unico`
(DONE) — nenhum dos dois é desta feature; quem conserta é decisão do owner.

## Veredito do portão da wave

Terceira rodada, `2026-10-02T21:09:42Z`, sozinha: **VERDE — 8 portões, e2e 98 passed**, p95 do e2e/20 = 129,9
`[MEDIDO: make verify, log /tmp/verify-wave-estrutura-f00-20261002T210942Z.log]`. Placar das rodadas completas da wave: 1 verde em 3,
os 2 vermelhos explicados acima (A1, A2) e nenhum deles em arquivo tocado pela F0.
