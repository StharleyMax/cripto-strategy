# W-F2-QA — fase 02 de `estrutura-do-front` (T-02.1, T-02.2, T-02.3)

**Agente:** `frontend-qa`, 2026-10-03, worktree `wave-estrutura-f02`, branch `wave/estrutura-f02`, HEAD `19326b6e`.
**Fontes:** `docs/plans/SPEC-011-estrutura-do-front/02_registrar_por_chave.md` (DoD 1–5), `tasks.toml` T-02.1/2/3,
`gates/T-02.{1,2,3}-build.md`, `SPEC-011 §4.2`.
**Diff da fase:** `389fee7b..0f464b45` (T-02.1) + `1c45a945..19326b6e` (T-02.2, T-02.3). O merge `1c45a945` só traz docs da fase 10
(`git diff --name-only 1c45a945^1 1c45a945`: 9 arquivos, todos sob `docs/`) `[MEDIDO]`.
**Nada em `frontend/src/` foi alterado por mim.** As mutações foram aplicadas e revertidas com `git checkout --`, e `git status --short`
no fim só mostra `W-F2-REVIEW.md`, que é do code-review e não é meu `[MEDIDO]`.

## QA Gate (Front) — Fase 02: o registrar por chave, com unmount e refeed

- [OK] **DoD 1 (`CA-11`, T-02.1):** `binding-table.test.ts` usa um gráfico real sob `jsdom` e um overlay sintético. Os 5 ciclos voltam à
  contagem inicial, e a ablação "unmount vazio ⇒ +5" roda em toda execução. Eu mesmo rodei Q1 e Q2 (abaixo), e as duas reprovam.
- [OK] **DoD 2 (índice derivado, T-02.2):** 4 panes sintéticos, um desligado, dão `{a:1,b:2,d:3}` nas duas ordens de registro. Q3 e Q4 reprovam.
- [OK] **DoD 3 (`refeed`, T-02.3):** `refeed(key)` aplica só a chave, uma vez, pelo laço do host. A leitura é feita na biblioteca
  (`series.data()`): 42 no indicador, 1 nas outras. Q5 e Q6 reprovam. ⚠️ A lacuna L-1 (abaixo) está **confirmada**.
- [OK] **DoD 4 (tela, `CA-1`):** e2e 127 passed, 14 skipped, 141 testes, 42 specs, sobre HEAD. Nenhum arquivo `frontend/e2e/` no diff da fase.
- [OK] **DoD 5:** `make verify` VERDE nos 8 portões. `L` = 3.443 (`wc -l`). **`B` = 87.834 B**, medido por mim, +0,77% sobre `B0` e abaixo do teto de 90.651 B (§3).
- [OK] Lógica fora do componente: a tabela e a derivação moram em `binding-table.ts`, sem React. `ChartHost.tsx` só faz a ligação.
- [OK] Contrato tipado: `unmount` é obrigatório (`@ts-expect-error` em `binding-table.test.ts:440`). `PaneRegistrar extends IndicatorRegistrar`.
- [OK] Sem segredo no cliente: `harness rules --mode file` nos 6 arquivos do diff dá `rc=0`, sem nenhuma linha (§4).
- [OK] Acessibilidade: a fase não cria nenhum elemento interativo. Isso é `[INFERRED]` pelo diff, que é só `chart/host/` mais os `unmount`.
- [OK] Testes: existem, passam (13/13) e têm o par morde/cala.
- [OK] Cobertura: o repositório não mede cobertura do front. O universo é `binding-table.ts`, e as 6 mutações minhas mais as 15 dos builders reprovam.
- [OK] `harness rules`: 0 bloqueantes. O par morde/cala está no §4.
- [OK] Doc delta: `frontend/README.md` §26 ganhou `binding-table.ts`. `docs/INDEX.md` tem 4 linhas acrescentadas e 0 removidas.
- [OK] Rótulos: os números dos builders trazem o comando. O `B` não medido foi declarado como não medido, em vez de inventado.

## 1. Testes que rodei

| comando | resultado |
|---|---|
| `node --conditions=react-server --test src/app/symbol/chart/host/binding-table.test.ts` (em `frontend/`) | **13 / 0** `[MEDIDO]` |
| `npm run -s typecheck` · `npm run -s lint` · `npm run -s test:app` (com a mutação L-1 aplicada) | `rc=0` · `rc=0` · **735 / 0** `[MEDIDO]` |
| log do verify `/tmp/verify-wave-estrutura-f02-20261003T190814Z.log` (só `grep`) | `test:app` 735/0. pytest `3601 passed, 1 skipped, 3 deselected, 1 xfailed`. e2e `Running 141 tests` ⇒ `127 passed`, `14 skipped`, 42 specs distintos (`grep -oE 'e2e/[0-9]+[^ :]*\.spec\.ts' \| sort -u \| wc -l` = 42). Os 14 skipped são os mesmos 14 do verify da T-02.1 (`…154314Z.log`: 14 skipped / 127 passed), e são os specs de dado real. Bloco `diff` vazio, ou seja, árvore limpa `[MEDIDO]` |
| o log é do HEAD? | O commit `19326b6e` é de 16:06:48 −03 (19:06Z). O log começou às 19:08Z, e o `test:app` de 735 bate com o T-02.3-build `[MEDIDO]` |

**E2E não rodado por mim.** O verify da wave já rodou o e2e completo (42/42) sobre o HEAD. Os caminhos que esta fase acrescenta
(montagem tardia, `refeed` e `unmount`) **não são alcançáveis pelo e2e**, porque ele usa `next build` + `next start` (`scripts/e2e-env.sh:170,180`),
os 5 panes renderizam sem condição (`SymbolClient.tsx:3407-3426`) e o `refeed` não tem chamador (`grep -rn '\.refeed(' src` não acha nenhum fora de teste).
Um spec a mais não teria provado nada sobre eles `[INFERRED: pelos três greps citados]`.

## 2. Ablações minhas (aplicadas por script, cada uma revertida, `git status` limpo no fim) `[MEDIDO]`

| # | task | mutação em `binding-table.ts` | resultado |
|---|---|---|---|
| Q1 | T-02.1 | `unmountKey` não chama `unmount` | **10 / 3**: reprovam `CA-11`, chave repetida e `detach` |
| Q2 | T-02.1 | `detach` faz só `mounted.clear()` | **12 / 1**: reprova `detach` |
| Q3 | T-02.2 | `derivePaneIndex` ignora o conjunto ativo (posição na ordem inteira) | **11 / 2**: reprovam DoD 2 e F1 |
| Q4 | T-02.2 | o "ativo" passa a ser só o que já está montado mais o próprio, ou seja, índice por ordem de chegada | **10 / 3**: reprovam DoD 2, a ablação e "no mount" |
| Q5 | T-02.3 | `refeed` reaplica todas as bindings montadas | **12 / 1**: reprova DoD 3 |
| Q6 | T-02.3 | `refeed` não faz nada quando há qualquer chave registrada | **12 / 1**: reprova DoD 3 |
| L-1 | T-02.3 | **`ChartHost.tsx:209`**: `feedOutsidePage: () => undefined` | **typecheck `rc=0`, lint `rc=0`, `test:app` 735/0. Nada reprova** |

**Os 5 `unmount` de `SymbolClient.tsx` não têm unitário** (o T-02.1-build §5 declara isso). Conferi por leitura: `addSeries` contra
`removeSeries` em cada pane dá price 4/4, OI 1 (as duas ramificações são exclusivas) + 1 primitivo / 1 + `detachPrimitive`, CVD 2/2,
liquidação 3 por lado × 2 / 6 e long/short 1/1 (`grep -n 'addSeries\|attachPrimitive' SymbolClient.tsx`) `[MEDIDO: leitura + grep]`.
O `CA-11` sobre um embutido real fica para a F8, como o plano diz.

## 3. Bundle `B` (DoD 5, `SPEC-011 §7.4`)

Comando (o mesmo de `F1-base.md:37` e `T-01.4-build.md:92`), em `frontend/` sobre `19326b6e`, sob `flock …/scratchpad/e2e.lock`,
depois de esperar o verify de outra worktree terminar: `rm -rf .next && npx next build`; pega o maior (`ls -S`) de
`grep -l data-fact .next/static/chunks/*.js`; mede com `gzip -c | wc -c`. Next.js 16.3.4 (Turbopack).

| build | rc | chunk | crus | gzip | chunks com `data-fact` |
|---|---|---|---|---|---|
| 1 | 0 | `0aldo30uhz8gm.js` | 278.491 B | **87.834 B** | 3 |
| 2 | 0 | `0aldo30uhz8gm.js` | 278.491 B | **87.834 B** | 3 |

`[MEDIDO: n=2 builds, mesmos bytes]`. **Contra `B0` = 87.164: +670 B (+0,77%).** Contra o fechamento da F1 (87.254, `[DOC: T-01.4-build §5]`):
+580 B (+0,66%). O teto de `CA-15` é `87.164 × 1,04 = 90.651 B`, e a folga é de 2.817 B. O `|ΔB| ≤ 1%` de `SPEC-011 §7.4` é sinal só para
fatia de movimento, e esta fase declara o diff. Mesmo assim ficou dentro. Os +580 B são compatíveis com a tabela nova, os 5 `unmount`
e o `refeed`, mas `[INFERRED: não decompus o delta]`. **Este número precisa ir para a PR da wave (DoD 5).**

## 4. `harness rules`: o par morde/cala

- **cala:** `harness rules --mode file --path <f>` nos 6 arquivos do diff (`binding-table.ts`, `binding-table.test.ts`, `ChartHost.tsx`,
  `registrar.ts`, `indicator-binding.ts`, `SymbolClient.tsx`) dá `rc=0`, 0 linhas em cada.
- **morde** (para que esse `rc=0` vazio não fique ambíguo): o mesmo comando em `backend/src/api/dependencies.py` dá `rc=2` e
  `{"decision": "block", … core.module-docstring-single-line …}` `[MEDIDO]`. O instrumento é capaz de falar, e sobre os arquivos da fase ficou calado.

## 5. As lacunas declaradas pelos builders

### L-1 (T-02.3): nada pega se o `ChartHost` deixar de passar `feedOutsidePage` por `feedSeries` — **CONFIRMADA, vira follow-up e não bloqueia**

- **Confirmada** pela mutação L-1 da §2: com `feedOutsidePage: () => undefined`, typecheck, lint e `test:app` ficam verdes. O e2e também não
  alcança esse caminho (§1).
- **Por que não bloqueia:** hoje o caminho não tem consumidor. O `refeed` tem 0 chamadores, e a montagem tardia não acontece nem em
  `next start` nem sob o StrictMode do `next dev`. No StrictMode o React desfaz o host antes dos filhos e refaz os filhos antes do host,
  então os panes re-registram sem a tabela anexada `[INFERRED: ordem de disconnect/reconnect do React 19, não medida]`. Fiz a DoD 3 ao
  pé da letra, e ela pede o contrato **da tabela**: está cumprido e morde. Com isso a lacuna é de ligação sem usuário, não de comportamento
  visível.
- **Follow-up, com dono:** a **primeira task que fizer um indicador de `indicator-endpoint` chamar `refeed`** precisa trazer um teste que
  reprove com L-1 aplicada. O caminho mais barato é tirar `(feeds) => feedSeries(paneSeriesFeeds(feeds, dense))` do `ChartHost.tsx` para um
  arquivo sem React (como `binding-table.ts`) e testá-lo sob `node --test`. Um e2e do indicador também serve. **Sem esse teste, aquela task
  não fecha.**

### L-2 (T-02.2): um pane que chega tarde não reordena os panes já montados — **CONFIRMADA, vira follow-up e não bloqueia**

- **Confirmada e medida:** um teste de rascunho (criado e apagado, fora do commit) usou a derivação de produção (`F1_HOST_PANE_ORDER`). Com
  price, liquidation, long_short e cvd anexados, e `oi` registrado **depois** do `attach`, o resultado é
  `[["price",0],["liquidation",1],["long_short",2],["cvd",3],["oi",2]]`, isto é, **`oi` e `long_short` no mesmo pane 2** `[MEDIDO]`.
  É uma colisão visual, não só um "não reordena".
- **Por que não bloqueia:** hoje é inalcançável, pelos mesmos motivos da L-1: os 5 panes renderizam sem condição, e não há montagem tardia
  em `next start` nem no StrictMode. A fase 02 não liga nem desliga pane.
- **Follow-up, com dono:** **T-09.3** (`<ChartHost key={paneSetSignature(active)}>`) é o desenho que torna isso impossível, porque o
  conjunto mudou ⇒ o host remonta ⇒ tudo é derivado de novo no `attach`. **A ablação da T-09.3 não nomeia este caso.** Recomendo somar à
  DoD dela: *"tirar o `key` ⇒ ligar um pane depois do mount põe dois panes no mesmo `paneIndex` ⇒ reprova"*. Outra opção, mais forte, é
  a tabela recusar (lançar) a montagem tardia de um `kind: "pane"` cujo índice derivado já esteja ocupado. Isso transforma colisão
  silenciosa em erro alto, e vale para a F9 também.

## 6. Achados

1. **[WARNING, resolvido aqui] Nenhuma das 3 tasks mediu o `B`.** Eu o medi (§3): 87.834 B. Falta só o orquestrador registrá-lo na PR.
2. **[WARNING] A T-02.1 tocou `SymbolClient.tsx` (+36/−3), fora da fronteira "só `chart/host/`" do plano.** Está declarado no
   T-02.1-build §2 e é forçado pelo tipo (`unmount` obrigatório ⇒ os 5 panes precisam implementá-lo, senão o typecheck reprova). O plano
   pede "declara o diff", e o diff foi declarado. Não bloqueia.
3. **[WARNING] L-1 e L-2** (§5): follow-ups com dono, que não bloqueiam a fase.
4. **[INFO] As "ablações que rodam em toda execução"** dos testes de T-02.2 e T-02.3 provam que o **instrumento** é capaz de falhar
   (a mutação é encenada dentro do próprio teste), não que a **produção** morde. A prova de produção são as mutações em `binding-table.ts`
   (as dos builders e as minhas Q1–Q6). As duas existem.
5. **[INFO] `paneIndex` do preço = 0.** O plano diz "`1 +` posição em `F1_PANE_ORDER`", e o builder pôs o preço como núcleo no 0. Isso
   está de acordo com `SPEC-011:98` ("entre os **indicadores** de pane ativos"), e o preço não é indicador. Não é desvio.

## 7. Veredito

**APPROVED.** As DoD 1–5 da fase estão cumpridas e medidas. As 6 ablações que refiz (Q1–Q6, pelo menos uma por task) reprovam. L-1 e L-2
estão confirmadas e **não bloqueiam**, porque nenhuma das duas é alcançável no código de hoje. Elas viram follow-up com dono (§5): L-1 vai
para a primeira task que chamar `refeed`, e L-2 para a DoD da T-09.3.

Ações (não bloqueantes):
1. Orquestrador: registrar na PR da wave `B` = 87.834 B (+0,77% sobre `B0`) e `L` = 3.443 (DoD 5).
2. `tasks.toml`, T-09.3: somar a ablação de L-2 ("sem `key` ⇒ pane ligado tarde colide no mesmo `paneIndex` ⇒ reprova").
3. A primeira task de indicador `indicator-endpoint`: teste que reprove com `feedOutsidePage: () => undefined` em `ChartHost.tsx:209` (L-1).
