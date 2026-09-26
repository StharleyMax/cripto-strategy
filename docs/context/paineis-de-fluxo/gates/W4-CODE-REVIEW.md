# W4 — code-review (nível high) de `master...wave/paineis-f02`

- **Veredito: APPROVED.** Nenhum achado **CONFIRMADO de correção**. São 9 achados brutos da skill, e depois da
  verificação sobram 0 de correção, 4 WARNING e 5 NIT.
- **Universo:** `git diff --stat master...wave/paineis-f02` dá 79 arquivos, +8334/−452. A produção tocada é
  `charts/volume-direction.ts` (novo), `charts/s2-lightweight-adapter.ts` (só comentário), `charts/index.ts`,
  `app/symbol/pane-legend.ts` e `app/symbol/SymbolClient.tsx`. O resto é teste, e2e e docs.
- **Instrumento:** a skill `code-review` em `high`, num fork, sem passada de verificação própria. A saída bruta está
  em `scratchpad/review-paineis-f02.json`, fora do versionamento. Cada achado foi verificado à mão, e o resultado
  está no §2.
- **Portões rodados na worktree** `[MEDIDO 2026-09-26, HEAD c0d851b]`:
  - `npm run -s test:charts` dá 323 pass e 0 fail.
  - `npm run -s test:app` dá 586 pass e 0 fail.
  - `npm run -s typecheck` dá rc=0.
  - `npx eslint` sobre os 3 arquivos de produção dá rc=0.

## 1. O que foi conferido e se sustenta

- **O pareamento por instante (`directionalVolumeSeriesLossless`) está correto.** As chaves do `Map` e o `get`
  usam as duas `slot.time` em ms. `GridSlot.time` e `ScalarSlot.time` são epoch ms
  (`canonical-grid.ts:48`, `s2-scalar-grid.ts:27`), e `toUnixSeconds` só é aplicado na saída. Em TF ≠ `1m`, o
  `W4-QA.md` §3 mediu no app real que a coluna concorda em 9/9 no `4h`, sem nenhuma discordância.
- **O doji usa o mesmo predicado da vela e a mesma tinta.** O predicado é `close === open`, e a tinta vem de
  `dojiItemColors().color` = `provenanceWeak` (`color-tokens.ts:269-275`).
- **As margens (`paneScaleMargins`, `pane-stack-layout.ts:212-244`) fecham:**
  - Volume: `clearSeparator` resulta em `max(0.03, 4/335 ≈ 0.012)` = 0.03, então a faixa das barras não é
    reescrita.
  - Marcas: `top 0.97` com `bottom` = 4/h. A soma fica abaixo de 1, e a faixa real tem cerca de 6 px, o que já
    está declarado em `SymbolClient.tsx` (`N-1`).
  - Velas: a base é lida de `priceScale().options()` depois do `applyOptions` do mount (`:1087-1088`), então
    `PRICE_CANDLE_SCALE_MARGINS` é de fato a base do reserve.
- **A troca de `ABSENCE_TOKEN` não deixou nenhum literal `"SEM_PONTO"` renderizado.** O `grep -rIn SEM_PONTO`
  em `src e2e` só acha o enum do fio em fixture e comentários.

## 2. Achados verificados

| # | severidade | arquivo:linha | achado | por que não é defeito de correção |
|---|---|---|---|---|
| 1 | WARNING | `SymbolClient.tsx:1987` + `pane-legend.ts` n/a | Com `keepFloor` e `bottom 0.22`, `top+bottom ≥ 1` já ocorre em `r ≥ 0.725`, e não só no teto `MAX_LEGEND_RESERVE_FRACTION = 0.75` (`pane-stack-layout.ts:54`). Então o fallback `overflow` passa a disparar 2,5 p.p. mais cedo. | **A aritmética está CONFIRMADA, mas o dano não.** Em `r = 0.72` a vela ficaria numa faixa de `1−0.776−0.22 = 0.4%` do pane, cerca de 1,3 px em 335 px, que já é ilegível. O fallback devolve o mesmo resultado que o teto de 0.75 devolve por desenho, e publica `overflow` honestamente. O cenário exige uma legenda de ~243 px, e os testes de legenda alta usam 90 px (`price-volume-band-separation.test.ts:321`). Sugestão, não bloqueio: incluir `keepFloor` na condição do teto, ou declarar o limiar efetivo. |
| 2 | WARNING | `SymbolClient.tsx:1818, 2005, 2385, 2720` | O SF-8 limpou o ruído IEEE-754 só do numeral da legenda. Os readouts `sr-only` ainda imprimem `String(value)`, como `613372.7679000001`. | **É PREEXISTENTE:** o diff desses readouts só troca o `ABSENCE_TOKEN`. O escopo do `T-01.R1`/SF-8 era a legenda. Fica como dívida candidata para o `design_gate` e para acessibilidade. |
| 3 | WARNING | `pane-legend.ts:228-250` | A docstring de `formatLegendNumeral` afirma *"no precision the data has is thrown away"*, mas um valor servido com 16-17 dígitos significativos muda. Medido com `node -e`: `0.1234567890123456` vira `0.123456789012346`, e `9007199254740991` vira `9007199254740990`. | **Só a pintura muda:** `rawValue`/`data-legend-raw` continuam exatos (`e2e/24`), e nenhum consumidor compara o numeral pintado com a API (`grep -rIln legendNumeral e2e src/app` acha só o próprio módulo, o teste e o `SymbolClient`). A imprecisão está na docstring, não no comportamento. |
| 4 | WARNING | `volume-direction.ts:60` | A direção do volume usa só o matiz e não tem um segundo canal, que a vela tem (corpo vazado). | É decisão de FORMA, aprovada pelo `ux-ui-mastery` (`T-02.5-design-review-r2`). Pela regra do `CLAUDE.md` §Design, reabrir cabe ao `design_gate`, não ao code-review. |
| 5 | NIT | `volume-direction.ts:97-100` | A mensagem do `RangeError` ainda cita *"a logarithmic scale"*, mas a escala é linear desde o `T-02.2`. Ela também duplica a metade de valor de `positiveValueSeriesLossless`. | É só o texto da exceção. O comportamento (negativo lança) está correto e é testado (`volume-direction.test.ts:115`). |
| 6 | NIT | `SymbolClient.tsx:1911-1915` | Um comentário obsoleto diz que *"`lineSeriesLossless` is REUSED"* para o volume. | É preexistente: no `master` já não era verdade. |
| 7 | NIT | `SymbolClient.tsx:1785` | Uma linha de docstring foi reescrita em português (*"As DUAS marcas da faixa de marcas…"*), contra a linha 5 da tabela do `CLAUDE.md`. | A docstring já era PT no `master`, e o diff só alterou a linha. Idioma é "convenção, não portão" (`CLAUDE.md`). |
| 8 | NIT | `SymbolClient.tsx:1535, 1578, 1581` | Os literais `0.97`, `0.22` e `10` são copiados à mão da invariante de faixa, em vez de derivados de `VOLUME_SCALE_MARGINS`. | É manutenibilidade, e `price-volume-band-separation.test.ts` reprova se uma das metades se mover. |
| 9 | NIT | `volume-direction.ts:86-104` | Cada `apply` reconstrói o `Map` sobre a grade de preço e chama `colorTokens()`/`dojiItemColors()` uma vez por barra. | É eficiência, com custo O(n) por página. Não há medição de regressão de latência `[NÃO MEDIDO]`. |

## 3. Relação com o W4-QA

O `W4-QA.md` já é NEEDS_FIX pelo Doc delta (*"doji = alta"* em 3 documentos). Este laudo não acrescenta
bloqueio de código. Os achados 3 (docstring) e 5 (mensagem da exceção) podem ir no mesmo ciclo de docs.
