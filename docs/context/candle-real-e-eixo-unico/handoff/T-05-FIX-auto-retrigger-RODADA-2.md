# Handoff — auto-retrigger, RODADA 2 (o fix de `7f63aa0` não fecha o achado)

Branch: `task/candle-f05-t05-retrigger-fix` (mesma desta rodada 1, commit `7f63aa0` já presente —
NÃO reverta, continue em cima). Worktree:
`/home/stharley/Documentos/projects/cripto-strategy-worktrees/candle-f05-t05-retrigger-fix`.

## O que a rodada 1 fez, e o que ela realmente prova

`7f63aa0` estende `ReentrancyGuard` (`range-dispatch.ts`) com `holdApplying()` e passa a segurar a
aplicação de montagem (`setVisibleLogicalRange` em `SymbolClient.tsx`) até o frame seguinte. O
falsificador unitário (`range-dispatch.test.ts`) morde de verdade — mutar `holdApplying` para
liberar cedo faz o teste nomear a reprovação. **Isso prova que o mecanismo novo funciona no nível
em que foi escrito.** Não prova que ele é a causa do sintoma observado — e o próprio builder já
tinha sinalizado isso honestamente: o repro ad hoc dele não reproduziu a race nem no baseline nem
no fix.

## O que EU medi, direto, comparando as duas branches com o MESMO instrumento

Achei e consertei, de passagem, um bug real e não relacionado no stub de `20-*.spec.ts`: desde
`T-05.7`, `panel.coverage` é campo obrigatório no envelope (`series-history-envelope.ts`,
`assertWirePanelCoverage`), e o stub sintético de `T-05.9` nunca ganhou esse campo — toda resposta
reprovava a validação, `stub_drawn_candles` ficava `0`, e o teste nunca chegava a medir nada. Já
apliquei o fix (`panel.coverage: {earliest_bucket_ms:null,latest_bucket_ms:null,source_floor_ms:null}`)
nesta branch E na wave — não precisa refazer.

Com o stub consertado, `20-*.spec.ts` roda de verdade:
- `npx playwright test e2e/20-teto-latencia-historia-sob-demanda.spec.ts` nesta branch (com
  `7f63aa0`): `axis_max_interval_during_paging_ms=205.40` (teto 160ms, ainda reprova) — **era
  1071.70ms antes** (medição original de T-05.9). Real melhoria, mas não fecha.
- Mesmo comando em `wave/candle-f05` HEAD (SEM o fix): `axis_max_interval_during_paging_ms=303.40`.

Depois escrevi um probe minimalista (script Playwright descartável, não commitado — reproduza com
a receita abaixo) que só espera, sem NENHUM gesto de mouse, e lê
`window.__historyPageLatencyProbe.requestedMs.length` a cada 1,5s, 8 amostras, exatamente a
receita que o docstring de `20-*.spec.ts` já documenta ter medido em `[MEDIDO 2026-09-23]` (lá:
`6 -> 13 -> 21 -> 28 -> 35 -> 43 -> 52 -> 59`).

**Resultado, comparando as duas branches, MESMO stub, MESMO catálogo (1 chave `klines_ohlc`,
catálogo mínimo — o app real declara 10 chaves, mas o achado já se reproduz com 1):**

| Branch | Amostras de `requestedMs.length` (8x, 1,5s cada) |
|---|---|
| `wave/candle-f05` HEAD (sem `7f63aa0`) | `66, 150, 234, 306, 384, 456, 540, 624` |
| `task/candle-f05-t05-retrigger-fix` (com `7f63aa0`) | `75, 140, 215, 280, 350, 420, 490, 565` |

**As duas crescem, sem parar, sem NENHUM gesto de mouse, em taxa estatisticamente indistinguível
(~65-80 por intervalo em ambas).** `7f63aa0` não reduz a taxa do loop — só reduz o CUSTO de cada
remonte individual (por isso `axis_max_interval_during_paging_ms` melhora, 1071→205, mas o LOOP em
si continua rodando indefinidamente).

## Conclusão, e o que isto significa para o diagnóstico da rodada 1

O diagnóstico original (eco assíncrono de `setVisibleLogicalRange` fora do guard) está CORRETO
como mecanismo — o falsificador unitário prova isso — mas **não é a única fonte do re-disparo**,
ou o guard novo não está no caminho que o re-disparo realmente percorre em produção. Hipótese a
investigar (não verificada por mim, é só uma pista): `subscribeVisibleLogicalRangeChange`
costuma invocar o handler imediatamente com o range CORRENTE ao (re)inscrever — se for esse o
caso aqui, cada remonte religaria a inscrição e IMEDIATAMENTE ecoaria o range atual para
`onCandidateRange`, um caminho que nunca passa por `setVisibleLogicalRange`/`holdApplying` e que o
fix de `7f63aa0` não cobre. Leia o código de novo, não assuma que a pista acima é a resposta —
é só onde eu pararia de procurar primeiro.

## Como reproduzir, exatamente

1. Suba o app: `npm --prefix frontend run build && npx playwright test` com um spec descartável
   que: sobe `startSecondaryNextInstance` contra um `http.createServer` local respondendo
   `/series-catalog` (1 entrada `klines_ohlc`, `nativeGrid:"1m"`) e `/series-history` (linha por
   minuto, `panel.coverage` com os 3 campos `null` — **obrigatório**, ver acima), navega para
   `/symbol/BTCUSDT`, espera o canvas pintar + 2s, chama `.reset()` no probe, e daí só espera —
   sem `page.mouse` nenhum — lendo `requestedMs.length` a cada 1,5s.
2. Rode o MESMO script nas duas branches (`wave/candle-f05` e esta) para comparar — é a única
   forma de separar "melhorou" de "não mudou nada".

## Ao terminar

Não solte o achado sem fechar: ou (a) identifique e conserte o segundo caminho de re-disparo, ou
(b) prove com evidência igualmente direta que meu repro está errado (ex.: catálogo incompleto
causando um artefato diferente — considerei essa hipótese e não a descartei com certeza, ver nota
abaixo). Verifique fim-a-fim com o MESMO probe de zero-gesto antes de declarar fechado — não
aceite só o falsificador unitário como prova, essa foi exatamente a lacuna desta rodada.

**Nota de honestidade meta:** meu catálogo sintético (1 chave) difere do catálogo real do app (10
chaves/6 painéis). É possível — não descartei — que a AUSÊNCIA das outras 9 chaves no catálogo
gere um artefato de erro/retry que pareça auto-retrigger mas seja outra coisa. Contra isso: (1) o
`20-*.spec.ts` oficial usa a MESMA receita de catálogo mínimo (só `klines_ohlc`) e já documentou o
mesmo crescimento sem gesto ANTES de mim; (2) a taxa medida aqui (~70/intervalo) é da mesma ordem
de grandeza da doc original (~7/intervalo, mas aquele catálogo tinha 4 reduções vs minha 1 — a
proporção não bate exatamente, e ISSO É um ponto a esclarecer, não a ignorar).

Se passar de ~150 turnos, escreva o estado aqui mesmo e devolva.
