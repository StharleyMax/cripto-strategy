# QA Gate (Front) — Fase 03: O timeframe único

> Escopo: `T-03.9`, `T-03.10`, `T-03.11`, `T-03.12` (componente `web`). Backend (`T-03.1`–`T-03.8`)
> fora deste escopo, exceto verificação pontual de coexistência `CA-8`/`CA-8′` pedida no handoff.
> Worktree `candle-f03-qa-web`, HEAD antes deste gate `24c485a` (`wave/candle-f03`).

## DoD do plano `03_timeframe.md` — itens de `web` (3.6, 3.7, 3.8) e DoD numerado 6/7/8

- [OK] **3.6** — barra de TF lê `SUPPORTED_TIMEFRAMES` (transcrição sincronizada por teste contra
  `series_history.py`), nunca hand-typed. `supported-timeframes.test.ts` + metade de
  `timeframe-bar-dom-contract.test.ts` — confirmado por MORDE real (reduzir `SUPPORTED_INTERVALS`
  do backend para 4 membros reprova 2/7 testes, conforme `T-03.9-builder.md`; não re-executado por
  mim pois já é mutação sobre arquivo Python fora do escopo `web`, mas a mecânica do teste foi lida
  e é sólida).
- [OK] **3.7** — escala `log10`/base 1 CONTINUA sob TF≠1m, com prova nova
  (`volume-subaxis-tf-invariance.test.ts`, `n=1.440`, `BLOCKER-1` segue pago a `240×`). Achado
  honesto e não escondido: o `spread` visual comprime `39%` a `240×` — registrado para o
  `design_gate`, não escondido.
- [OK] **3.8 / `T-03.12`** — veredito `ux-ui-mastery`: **APPROVED**, 7,5/10, evidência ao vivo (SSR
  + Playwright contra `google-chrome`), não apenas leitura de código.
- [OK] **DoD 6/7 (Playwright real)** — `e2e/18-tf-refetch-e-ablacao.spec.ts`, **re-executado por
  mim ao vivo** (`scripts/e2e-env.sh up/down`, Postgres não disponível — universo fraco sqlite,
  igual ao que o builder já documentou): **4/4 passed**, números idênticos ao relatório
  (`series_history_interval_4h_hits_after=10`, ablação restaura a janela byte-a-byte). Suíte `e2e`
  inteira também re-executada: **49 passed, 2 skipped** (skips pré-existentes) — bate exatamente
  com `T-03.11-builder.md`.
- [OK] **DoD 8** — `interval-reduction-shape.test.ts` re-executado isolado: 6/6, incluindo o MORDE
  (escada `1m` mal-rotulada como `5m` é rejeitada).

## Cadeia de decisões adiadas T-03.9→T-03.10→T-03.11 — teste destrutivo

Os três relatórios (`T-03.9`, `T-03.10`, `T-03.11`) citam, cada um, EXATAMENTE os mesmos dois
pré-requisitos bloqueantes (`T-03.4`, `T-03.6`) para o motivo de NÃO ligar `onSelect` a refetch —
e cada relatório subsequente confirma que o anterior parou no lugar certo (via `git log
--oneline` da própria branch, citado literalmente). Verifiquei:

- [OK] O `useState(DEFAULT_TIMEFRAME)` que `T-03.9` introduziu foi de fato REMOVIDO por `T-03.11`
  (não deixado morto ao lado do novo prop) — `NO_LOCAL_TIMEFRAME_STATE` nega a presença, e o teste
  passa contra o código real.
- [OK] Nenhuma superfície cliente chama `/series-history` diretamente — negative control
  (`assert.doesNotMatch(source, /fetch\(.*series-history/)`) passa contra o código real, e
  `page.tsx` é quem threading `interval` nos 10 `fetchPanelRows` (confirmado por leitura direta,
  `[symbol]/page.tsx:429-545`).
- [OK] `alignmentMs` (achado "não estava no handoff" de `T-03.11`) é real e testado:
  `request-window.test.ts` tem o MORDE citado (alinhamento de 5 min sozinho não cai em fronteira
  de 4h) — confirmado por leitura do arquivo, não re-derivado aqui por falta de tempo.
- [OK] `CA-8`/`CA-8′` (backend) coexistem: `test_series_reduction.py` e
  `test_series_reduction_ca8_prime.py` ambos existem, sem `skip`/`xfail` sobre os casos `CA-8` —
  não re-executados (fora do escopo `web`), só confirmada a não-redundância estrutural pedida no
  handoff.

## O gap de contrato de DOM (achado do `design_gate`, `T-03.12`, Future-Readiness 6/10)

**Confirmado real por mutação ao vivo, não apenas por leitura estática** — mentalidade destrutiva
aplicada literalmente, restrição #1 respeitada (produção só tocada e revertida, nunca commitada):

1. Removido `aria-pressed`/`tabIndex` roving do botão real em disco → `typecheck` limpo, `lint`
   limpo, `test:app` **387/387 passou mesmo assim**, `test:charts` sem mudança. Revertido,
   `git status --porcelain` confirmado limpo antes de seguir.
2. Afrouxado o guarda de `PartialCoverageMark` de `=== 0` para `< 0` (mutação realista — nenhuma
   contagem real do backend é negativa, então o guarda deixa de disparar em QUALQUER janela real,
   e a marca "COBERTURA PARCIAL — soma subestimada" passaria a aparecer sobre janelas 100%
   completas) → `typecheck`/`lint` limpos, `test:app` **387/387 passou mesmo assim**. Revertido.

Isto prova, com número e não com intenção, o que o `design_gate` já havia registrado como dívida
não-bloqueante: uma regressão real em `aria-pressed`, no roving `tabIndex`, ou no guarda de
`PartialCoverageMark` passaria por `make verify` inteiro E por toda a suíte de front hoje mantida
manualmente (`test:app`/`test:charts`) sem que uma única asserção reprovasse.

**Ação tomada, não apenas registrada:** fechei o gap eu mesma, só em arquivo de teste
(`frontend/src/app/symbol/timeframe-bar-dom-contract.test.ts`, +6 testes), respeitando a restrição
#1 (`frontend/src/` fora de teste não foi alterado — cada mutação foi aplicada, testada e
revertida, confirmado por `git status --porcelain` limpo antes do commit final). Os 6 testes novos
foram confirmados MORDENDO exatamente as duas mutações acima, reaplicadas ao vivo uma segunda vez
sobre o arquivo real (não uma cópia) para prova direta, depois revertidas de novo.

`npm --prefix frontend run test:app` final: **393 passed, 0 failed** (387 + 6 novos).

## Contrato na borda / transporte (`ADR-005/D1`)

- [OK] `selectedInterval` é validado (`isSupportedTimeframe`) ANTES de entrar em qualquer
  `fetchPanelRows` (`[symbol]/page.tsx:429-437`) — string arbitrária da URL nunca alcança o
  backend sem passar pelo conjunto servido; caso `string[]` do Next `searchParams` é descartado
  (`typeof !== "string" → undefined → default`), não ignorado silenciosamente.
- [OK] Nenhum `fetch` direto a exchange/endpoint externo nas superfícies tocadas — só
  `fetchPanelRows` server-side contra `/series-history` (envelope de bucket, nunca tick).

## Sem segredo no cliente

- [OK] `grep -rniE 'api[_-]?key|secret|password|token'` sobre os 4 arquivos de produção tocados —
  zero ocorrência de credencial (só `colorTokens()`, nome de função de design system).

## Doc delta

- [OK] `docs/INDEX.md` sem entrada nova em nenhum dos 4 builders — motivo dado e consistente
  ("registro por-pipeline é de outro papel"), e confirmado sem reescrita (`git diff --stat` vazio
  para o arquivo).
- [OK] `ADR-040`, `03_timeframe.md`: sem mudança — itens já normativos, executados como escritos.
- [OK] `DESIGN_SYSTEM.md` §1.2: papel `action` já estava declarado antes desta fase; `T-03.12` é o
  PRIMEIRO consumidor de produção, não um padrão novo não documentado.
- [OK] `STITCH_CONTEXT.md`: já antecipava um seletor de TF como parte do chrome de `S2` (linha
  1070: "escolhe janela e TF"; linha 469, ao descrever o que a `S1` removeu por herança da `S2`) —
  não é mudança visual persistente sem registro prévio.

## Rótulos de força e números

Todos os números deste relatório carregam o comando que os produziu (citado inline). Os dois
achados por MORDE (aria-pressed/tabIndex, guarda de `PartialCoverageMark`) são `[MEDIDO
2026-09-22]`, produzidos por mim nesta sessão, não herdados de relatório de builder.

## Achados

1. [WARNING — FECHADO NESTE GATE] `timeframe-bar-dom-contract.test.ts` não cobria
   `role="group"`/`aria-pressed`/`tabIndex` roving/`handleKeyDown` nem `PartialCoverageMark`
   (`data-fact`, guarda de render-null) — confirmado real por mutação, fechado com 6 testes novos
   no mesmo arquivo, commitado neste gate.
2. [WARNING — não fechado, registrado] Roadmap do `T-03.12` cita `items-center` → `items-start`
   em `PartialCoverageMark` (`SymbolClient.tsx:715`) para colunas <900px — cosmético, não afeta
   `frontend/src/` fora de teste, então não é meu para consertar (restrição #1); nomeado para o
   `frontend-builder` se a próxima dispatch tocar este componente.
3. [WARNING — não fechado, registrado] DoD 6/8 só têm números REAIS de Postgres nomeados como
   pendência pelo próprio `T-03.11-builder.md` (universo sqlite fraco usado aqui e lá) — não é
   bloqueio desta fase (mesma limitação que `12-oi-dado-real.spec.ts` já carrega), mas fica
   registrado para quando houver backend desta branch contra Postgres.

## Veredito: **APPROVED**

Nenhum achado é bloqueante. O único achado que seria candidato a `BLOCKER` (contrato de DOM
ausente, confirmado por mutação real) foi fechado dentro deste próprio gate, só em arquivo de
teste, com o par MORDE/CALA presente e reconfirmado ao vivo contra o arquivo real duas vezes.

Relatório completo: `docs/context/candle-real-e-eixo-unico/gates/FASE-03-qa.md`
