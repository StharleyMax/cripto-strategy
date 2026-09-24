# DIAG — as 4 falhas de e2e que reprovam `make verify` em `master` (`16:204`, `18:107`, `18:153`, `20:383`)

**Feature:** `paineis-de-fluxo` · **Data:** 2026-09-23 · **Sha diagnosticado:** `ba21f07` (`master`).
**Código de produção alterado:** nenhum. **Postgres semeado:** não. O universo "fraco" é o sqlite efêmero
de `scripts/e2e-env.sh`. O universo "real" é a API real (`127.0.0.1:8000`) lida por um proxy que só aceita
GET/HEAD/OPTIONS: **0 métodos recusados** em 3 execuções (`proxy refused=0`, `DIAG-e2e-master-rounds.txt`).
**Lote solo:** `ps aux | grep -E 'playwright|next start|next build|vitest|pytest'` → **0** antes de largar.

## Veredito

| falha | (a) reprova em `master` puro? | (b) instrumento ou regressão | (c) desde |
|---|---|---|---|
| `18:107` e `18:153` | **sim, 3/3** (fraco) · **2/2** (real) | **REGRESSÃO REAL DE PRODUÇÃO.** Clicar `4h` muda a URL, e a tela continua desenhando as mesmas velas de 1m | **`718cb1a`** (`T-05.2`) · pai `0c9cb43` verde 2/2 |
| `16:204` | **sim, 3/3** (fraco) · **2/2** (real) | **REGRESSÃO REAL.** Um painel não-origem ecoa fora do guard e o dispatcher reescreve o PRÓPRIO painel de Preço no meio do arrasto dele | **`48d47e5`** (`T-05-FIX` rodada 3, guard vira contador) · `7f63aa0` verde 2/2 (fraco) + 2/2 (real) |
| `20:383` | **sim, 3/3** (583,1 · 584,2 · 567,1 ms) | **AS DUAS COISAS.** O número está inflado pelo instrumento (ele soma a pausa do driver entre gestos). Por baixo há um defeito real: depois que a página chega, o resto do arrasto é descartado em **24/24 gestos** | o spec **nunca foi verde**. O defeito vem do remonte por página, que nasceu em `T-05.2` `[INFERRED]` |

**O laudo anterior não se sustenta.** `ACHADOS-orquestrador-pre-existentes-fase-05.md` classificou `16` e `18`
como "pré-existentes de fase 02/03" e disse ter reproduzido os dois em `ef608ec`. Medido aqui: `16` passa
**3/3 em `ef608ec`**, e **os dois passam 2/2 no merge da fase 04 (`08e5e75`)**. Os dois nascem **dentro da
fase 05**, que foi aprovada com eles vermelhos (`handoff/QA-fase-05.md`).

## 1. Comandos e universo

- **Runner:** `DIAG-e2e-master-runners.txt`. Tem duas partes. `run.sh <label> <N> <specs>` sobe a stack com
  `scripts/e2e-env.sh up 1 8937 4397` e roda o `playwright test` literal do `Makefile` N vezes, na mesma stack.
  `run-real.sh` faz `next build`/`next start` com `INGEST_HEALTH_API_BASE_URL` apontado para o proxy
  (portas 8961/4461).
- **Dependências:** `node_modules` e `backend/.venv` foram trazidos por `cp -al` do checkout principal.
- **Bisect:** `git checkout --detach <sha>` na própria worktree. Cada sha ganhou um `next build` novo, e a worktree
  voltou para a branch no fim. Os `package.json`/`package-lock.json`/`pyproject.toml` não mudam entre `f324b4c` e
  `HEAD` (`git diff --stat` vazio), então os mesmos `node_modules` valem para todos os shas.
- **Rodadas e rc por sha:** `DIAG-e2e-master-rounds.txt`. **Fatos:** `DIAG-e2e-master-facts.jsonl` (803 linhas,
  só o subconjunto relevante).
- **Universo fraco:** todo `GET /series-history` responde **500** (`NotImplementedError:
  get_series_window_reader_source has no default adapter` → **300 de 391** respostas no `api.log` de `master`).
  Isso **não explica** nenhuma das falhas: **o mesmo 500 existia em `08e5e75`** (200 respostas 500), e lá `16` e
  `18` passam 2/2. Nas duas falhas que nascem na fase 05, o universo real reproduz a mesma reprovação.

## 2. `18:107` / `18:153`: o TF bar ficou inerte `[MEDIDO]`

- **(a)** Em `master`, `window_after_4h.endMsInclusive` é igual a `window` antes do clique em 3/3 rodadas no
  universo fraco (`Expected: not 1790209440000`) e em 2/2 no real (`not 1790210340000`).
- **(b) A prova de que é a tela, e não só o atributo** (`DIAG-e2e-master-tf-stale.spec.ts.txt`, dado real, n=1):

  | estado | URL | `data-price-candles` | `price_candles` | `volume_readable_horizon` |
  |---|---|---|---|---|
  | carga de `/symbol/BTCUSDT` | `` | 4583 | `4583/5760` | `4560/5760` |
  | **depois de clicar `4h`** (+`networkidle` +1,5 s) | `?interval=4h` | **4583** | **`4583/5760`** | **`4560/5760`** |
  | carga direta de `?interval=4h` | `?interval=4h` | **24** | `24/5760` | `24/24` |

  O servidor re-renderiza com a janela de 4h. O client **descarta a mudança**: `use-history-pager.ts:199-200` lê
  `useState(seed.window)`/`useState(seed.rows)` **uma vez só**, e `<SymbolClient>` (`[symbol]/page.tsx:967`) não
  tem `key`. Por isso, ao navegar só por `searchParams`, o componente não remonta e o pager mantém a janela e as
  linhas do TF anterior `[INFERRED: leitura de código; o efeito na tela está MEDIDO acima]`.
- **(c) Bisect:** `08e5e75` verde 2/2 → `0c9cb43` verde 2/2 → **`718cb1a` vermelho 2/2**. `718cb1a` é o commit que
  cria o `useHistoryPager`.
- **Instrumento:** está correto. Ele morde exatamente o que o DoD de `T-03.11` promete.

## 3. `16:204`: eco fora do guard reescreve o painel de origem `[MEDIDO]`

- **(a)** Em `master`, 3/3 no universo fraco dão `{"oi":48,"cvd":48,"liq-long":48,"liq-short":48,"long-short":47}`
  no gesto 0. No universo real, 2/2 dão `{48,49,48,49,49}`. É **determinístico**, não é "1 em cada ~2".
- **(b) Linha do tempo por `MutationObserver`** (`DIAG-e2e-master-lockstep.spec.ts.txt`, mesmo gesto de 150 px):
  - **Universo fraco:** o **painel de Preço recebe 1 escrita do dispatcher durante o próprio arrasto**
    (`price-pane` 0 → 1). Em t=1839,6 ms, o `long-short-pane` emite `from=-3` sem ter recebido escrita. O
    dispatcher propaga esse valor aos outros cinco, e o Preço **salta de `-55` para `-3`**, perdendo **52 barras**
    de arrasto no meio do gesto.
  - **Universo real:** o Preço é **escrito 2× no próprio arrasto**. `from` vai 3339 → 3351 → 3379 **antes** de o
    arrasto começar a descer, ou seja, um salto de ~40 barras no início do gesto.
  - **Controle `7f63aa0`**, mesmo diagnóstico: o delta do Preço é **0** nos dois universos, com o lockstep em 47/47
    (fraco 1/1, real 2/2).
- **(c) Bisect:** `c0fe440` ✓ 2/2 → `d88d579` ✓ 2/2 → `ef608ec` ✓ 3/3 → `7f63aa0` ✓ 2/2 → **`48d47e5` ✗ 2/2** →
  `2e86ade` ✗ 3/3. De `8f98e7f` para `48d47e5` a única mudança em `frontend/src` é
  `charts/range-dispatch.ts`: o `applying` booleano vira `holdCount`.
- **Mecanismo** `[INFERRED, NÃO MEDIDO por dentro]`: a biblioteca entrega o `subscribeVisibleLogicalRangeChange`
  de um painel escrito no **rAF seguinte**. Esse eco pode chegar depois de o guard soltar e de o estado já ter
  avançado com o arrasto. Nesse caso `reduceRangeEvent` o toma por candidato novo e o redespacha, **inclusive para
  a origem**. Em `7f63aa0` esse caminho estava mascarado de outro jeito: lá a linha de base do teste já partia de
  escritas de montagem (`price 17`, `oi 14`…), que é o laço que o `T-05-FIX` fechou.
- **Instrumento:** está correto. O lockstep e o "Preço nunca é escrito" são exatamente a `DoD-4`. O teste reprova
  na primeira asserção. A segunda (`price delta = 0`) também reprovaria, e ela nem chega a rodar.

## 4. `20:383`: o instrumento infla, e por baixo há um defeito real `[MEDIDO]`

**Ablação do instrumento.** Fiz uma cópia do spec com marcas `moveStart`/`moveEnd` em cada gesto
(`DIAG-e2e-master-20-intra-inter.spec.ts.txt`) e separei os intervalos entre amostras do eixo em dois grupos.

| rodada | `axis_max_interval_during_paging_ms` (o do spec) | **intra-gesto** n · max · p95 | **>160 ms intra** | >160 ms entre gestos | pausa do driver entre gestos |
|---|---|---|---|---|---|
| 1 | 600,6 | 243 · **82,6** · 49,3 | **0** | 10 | 242–291 ms |
| 2 | 593,6 | 243 · **66,5** · 49,3 | **0** | 10 | 266–293 ms |
| 3 | 588,3 | 243 · **66,9** · 49,5 | **0** | 10 | 260–290 ms |

- **Defeito de instrumento.** Os 10 intervalos acima de 160 ms, em 3/3 rodadas, **cruzam a pausa entre um gesto e
  o seguinte**. Essa pausa soma o `waitForTimeout(100)` depois do último `move`, o `mouse.up`, as esperas da sonda,
  as leituras de `boundingBox`/range e o `waitForTimeout(100)` antes do primeiro `move`: 242–293 ms que **nenhum
  usuário produz** e que o spec mede como "quadro de pan". Dentro do gesto, o p95 é 49,3–49,5 ms e o max é
  66,5–82,6 ms. Os dois ficam abaixo do teto de 160.
- **Defeito real, que a ablação revelou.** Nos mesmos gestos, depois que a página é desenhada, o `data-visible-
  logical-from` do Preço assume **um único valor**: o re-enquadramento do remonte (ex.: `-15` → `507`). Ele fica
  parado durante os **147–616 ms de arrasto que ainda faltam**. Foram **24/24 gestos com página em 2 rodadas**
  (`diag20d-master`). **O remonte dos 6 `IChartApi` a cada página descarta o arrasto em curso**, e o usuário
  precisa soltar e arrastar de novo. Descontada a pausa do driver, o buraco real vai da última amostra do eixo ao
  fim do gesto: **188–248 ms**, também acima de 160.
- **(c)** O spec **nunca foi verde**. Em `d88d579` ele reprova antes, porque o stub não tinha `panel.coverage`
  (`drawnCandles 0`, rodei 1×). Depois de `dc3ddad`/`2e86ade`, reprova nesta asserção. O remonte por página é o
  desenho de `T-05.2` `[INFERRED: a sonda de T-05.9 não existe em 718cb1a, então não medi lá]`.

## 5. Correção proposta, com dono. Nada foi corrigido aqui

1. **`18`, código de produção. Dono: `frontend-builder` (`web`).** O `frontend-architect` escolhe entre duas
   opções. A primeira é dar `key` ao `<SymbolClient>` com a identidade do seed (`selectedTimeframe` +
   `knowledgeTimeMs`). A segunda é resetar `windowState`/`rows`/`preservedRange`/`coverageFloorMs` em
   `useHistoryPager` quando `seed.interval`/`seed.window` mudarem. Falsificador: `e2e/18` verde e o
   `DIAG-…-tf-stale` mostrando 24 velas depois do clique. **`/architect`: a premissa de `ADR-043:95`** (*"o
   comportamento de `T-03.11` está em produção, testado e correto"*) **é falsa desde `718cb1a`.**
2. **`16`, código de produção. Dono: `frontend-builder`, com `frontend-architect` no desenho.** O dispatcher não
   pode aceitar como candidato o eco atrasado de um painel que ele mesmo escreveu. Duas saídas possíveis: guardar
   por painel o último `logical` escrito e descartar o eco igual a ele, ou aceitar candidato só do painel com
   ponteiro ativo. E sem reintroduzir o laço de montagem de `T-05-FIX`: `e2e/20` e `range-dispatch.test.ts` são
   o contrafalsificador.
3. **`20`, instrumento. Dono: `frontend-architect`**, que é dono do teto `T-02.7`/`CA-11′`. A proposta é
   **só de teste**. Primeiro, medir o intervalo **apenas dentro de `[moveStart, moveEnd]`** de cada gesto, como na
   cópia `.txt`. Segundo, somar uma asserção explícita de *"o range do Preço continua mudando depois da página
   desenhada, enquanto o mouse se move"*. Essa asserção reprova hoje (24/24), e esse vermelho é o honesto.
   **Código: dono `frontend-architect`.** O remonte por página precisa preservar o arrasto (sem remontar, ou
   religando o gesto). ⚠️ `T-01.10` desta feature usa `e2e/20` como régua e **não pode ler o vermelho atual como
   latência**.

## 6. Portões e Doc delta

- **Não rodei `make verify`.** Rodei o e2e isolado, como o despacho permitia. O diff é só documento em
  `docs/context/paineis-de-fluxo/gates/`. Os três instrumentos vão como `.txt` e **fora** de `frontend/e2e/`, pelo
  precedente de `T-01.1`: dentro da pasta, o `make e2e` os coletaria `[NÃO MEDIDO: nenhum portão rodado sobre este
  commit]`.
- **Doc delta:** 7 arquivos **novos**, todos `DIAG-e2e-master*`. `docs/INDEX.md` **sem mudança**, pelo precedente
  de `T-01.1-baseline.md`/`T-01.0-spike.md`, que também não entraram lá. Nenhuma decisão visual. ADR não se
  aplica, porque isto é medição.
- **Correção de registro, e não reescrita:** `candle-real-e-eixo-unico/gates/ACHADOS-orquestrador-pre-existentes-
  fase-05.md` §1–§2 atribui `16`/`18` às fases 02/03. Os bisects da §2 e da §3 refutam isso. Quem registra a
  correção naquele documento é o dono dele (o orquestrador). Este arquivo não o edita.
