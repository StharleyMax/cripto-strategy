# Gate `F02` · `web` — `T-02.5` + `T-02.6` (CVD na tela)

> `frontend-builder`, 2026-09-12. Branch: `worktree-agent-ace7a1de9c3964975`, sobre
> `worktree-agent-a714e16e185cbef5f` (`b3febfb`, `968a59e` — o backend de CVD).
> Escopo: **só `frontend/`** (mais `scripts/`, para o arnês do universo forte). ⛔ Zero arquivo de
> `backend/` no diff — há dois builders ativos nas fases `03` e `04`.

---

## 1. Veredito, em uma linha

**Item 3 do `DoD-VERTICAL` FECHADO sobre app real, com número:** `cvd_dom_present_points = 290`
(`>= 30`), igual ao da API no mesmo instante, e a leitura na tela é **`Delta atual: 1.439`** —
**não** `SEM_PONTO`, **não** um `0` fabricado
`[MEDIDO 2026-09-12: backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_dom.py → rc=0, 2 passed]`.

⚠️ **O que este número NÃO é:** não é a leitura de **produção**. Ver §6 — o universo forte aqui é
um Postgres descartável com klines **reais** da Binance publicadas na cadência ao vivo; a leitura
de produção é de `T-02.7`, que ainda não rodou (o catálogo servido por `deploy-api-1` tem
**44** entradas, sem a linha `kline_takerbuy` — `[MEDIDO 2026-09-12: curl
http://127.0.0.1:8000/api/v1/series-catalog]`).

---

## 2. O que mudou

| arquivo | estado | o que |
|---|---|---|
| `frontend/src/app/symbol/view-model.ts` | modificado | `matchesKlineTakerBuyCvd` — o seletor de **três termos** (`metric=cvd_source` · `provider=binance` · `quantityField=NA`), com a tabela das quatro linhas `cvd_source` e qual termo exclui qual irmã |
| `frontend/src/app/symbol/page.tsx` | modificado | o painel de CVD passa a selecionar a linha que **existe** (era `metric === "cvd_delta"`, que nenhum builder do backend produz ⇒ ausente por construção); `cvdAnchorMs` passado **explicitamente**; `cvd: CvdPaneData` derivado dos mesmos slots que o painel desenha |
| `frontend/src/app/symbol/SymbolClient.tsx` | modificado | `CvdPane` ganha `data-testid="cvd-pane"` + `data-cvd-present-points`, horizonte legível (`cvd_readable_horizon:<com valor>/<grades>` + `data-readable-since-ms`), âncora do acumulado na tela, e `SEM_PONTO` na ausência |
| `frontend/src/app/symbol/cvd-pane-dom-contract.test.ts` | **novo** | contrato de DOM, com MORDE de 4 mutações medidas e CALA de restyling |
| `frontend/src/app/symbol/cvd-series-selector.test.ts` | **novo** | o seletor executado de verdade contra as 4 linhas `cvd_source`, com MORDE dos três filtros mais fracos |
| `frontend/e2e/10-cvd-dado-real.spec.ts` | **novo** | `T-02.6` — o DOM contra a API, nos dois universos |
| `scripts/cvd-klines-falsifier/measure_cvd_dom.py` | **novo** | o arnês que sobe a pilha inteira (klines reais → Postgres real → `src.main` → `next start` → Playwright) para que o universo FORTE exista sem tocar no Postgres compartilhado |
| `docs/context/cinco-metricas-do-core/PENDENCIAS-PARA-AVALIAR-DEPOIS.md` | modificado | `C5` — o defeito pré-existente que deixa `make e2e` vermelho (§5) |

### 2.1 A decisão de `web` que vale a pena nomear: o seletor

`metric === "cvd_source"` casa **quatro** linhas por instrumento, e `Array.prototype.find` responde
a **primeira** — `aggtrade_q`, uma série para a qual este repositório não publica nenhuma linha.
Seria um `200` com a grade inteira ausente, e **todo gate continuaria verde**: é literalmente a
classe de defeito que a fase `04` de `pagina-de-grafico-s2` teve de achar **em produção, à mão**.
Por isso o seletor tem três termos, mora em `view-model.ts` (importável por `node --test`, ao
contrário de `page.tsx`) e tem **dois** guardas independentes: um contra fixture transcrito
(`cvd-series-selector.test.ts`) e um contra o catálogo **realmente servido** pela API sob teste
(o primeiro teste de `10-cvd-dado-real.spec.ts`).

### 2.2 A mudança de microcopy que **precisa** do `design_gate`

`CvdPane` deixou de imprimir `—` (`formatFlowValue`, `D5.3`) e passou a imprimir **`SEM_PONTO`**,
como Preço, OI e o sub-eixo de Volume já faziam. Motivo declarado no código: `DoD-3` pede que o
painel **não diga `SEM_PONTO`** quando há dado, e isso é infalsificável contra um painel que nunca
poderia dizê-lo — um teste que passa com e sem o dado não prova nada. ⛔ **`formatFlowValue` não
foi tocado** (é a palavra do crosshair, dentro de `charts`, com teste próprio).

**Proposta ao [`ui-designer`](../../../.claude/agents/ui-designer.md), não decisão tomada aqui** —
três strings visíveis novas/alteradas no `CvdPane`, todas placeholders sóbrios:
`Delta atual: SEM_PONTO` · `Dado legível desde <YYYY-MM-DD HH:MM UTC> — 290/5760 grades de 1 min
na janela.` · `Acumulado ancorado em <…> UTC.` O que um builder decidiu é que o **fato** está na
tela e é legível por máquina; a forma é do `ui-designer` **com o veredito do `ux-ui-mastery`**.
⛔ Nenhum papel de cor novo foi criado ⇒ `CONTRAST_BACKDROP` **não** foi tocado (só
`provenanceStrong`/`provenanceWeak`, que já têm linha e piso medidos).

### 2.3 O horizonte legível — declarado, e o vão **não** encolhe

O painel diz **quantas grades têm valor de quantas**, e desde quando. O denominador é a grade
**inteira** da janela, não um sub-intervalo recortado em volta do dado: `290/5760` no universo
forte, `0/5760` no fraco. ⚠️ E aqui há uma diferença real com o sub-eixo de Volume, que o spec
documenta: os slots de volume vêm das **linhas da API** (`volumeSlotsFromHistoryRows`), os de CVD
vêm de `buildCvdPanel`, que alinha na grade canônica da **janela** — então quando a API recusa, o
CVD continua declarando `0/5760`, que é o que ele **deve** declarar. Uma tela que encolhe a janela
para esconder o próprio buraco é pior do que uma que o nomeia.

---

## 3. Os números, com o comando e o universo

### 3.1 Universo FORTE — item 3 do `DoD-VERTICAL`

```
backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_dom.py
```

| fato | valor |
|---|---|
| `n_written` (klines reais, 4 símbolos × 300 barras, cadência ao vivo) | **2.400** linhas |
| `series_window_reader_present` | **true** (Postgres, não sqlite) |
| `cvd_series_history_status` | **200** |
| `cvd_series_history_rows` / `cvd_api_rows_with_value` | **5.760** / **290** |
| **`cvd_dom_present_points`** | **290** — igual à API, exato |
| `cvd_readable_horizon_fact` | `cvd_readable_horizon:290/5760` |
| `cvd_readable_since_ms` | `1789203900000` (= `event_time` da 1ª linha com valor da API) |
| `cvd_cumulative_anchor_fact` | `cvd_cumulative_anchor:1788875700000` (= `data-window-start-ms`) |
| `cvd_api_last_instant_value` / `cvd_last_reading_text` | `"1.439"` / **`"Delta atual: 1.439"`** |
| veredito | **rc=0 · 2 passed (4,0 s)** |

`290` de `300` barras publicadas: as ~10 que faltam são a cauda de publicação (`bucket_end + 58 s`
contra o instante de grade), o mesmo comportamento que `measure_cvd_vertical.py` já mediu em
`298/300`. **`290 ≥ 30`** ⇒ `DoD-3` pago, e pago com folga de quase 10×.

### 3.2 Universo FRACO — `make e2e`, o portão canônico

```
make e2e     # → 25 passed · 1 failed (a falha é a C5 pré-existente, §5)
```

| fato | valor |
|---|---|
| `catalog_entries_total` | **48** (12 métricas × 4 símbolos) |
| `catalog_cvd_source_rows_for_symbol` | **4** ⇒ o filtro de três termos **não** é decorativo |
| `catalog_kline_takerbuy_matches` | **1** — exatamente uma |
| `series_window_reader_present` | **false** (sqlite, `ADR-034/D9`) |
| `cvd_series_history_status` | **500** — a rota **recusa** em vez de inventar grade |
| `cvd_dom_present_points` | **0**, com o atributo **presente e em dígitos** |
| `cvd_last_reading_text` | **`"Delta atual: SEM_PONTO"`** — sem nenhum dígito |
| os 2 testes de `10-cvd-dado-real.spec.ts` | **passed** |

### 3.3 `bash scripts/verify.sh`

```
[OK] lint-backend   rc=0  417 source files
[OK] lint-frontend  rc=0  ESLint + tsc --noEmit --strict do projeto sobre frontend/src
[OK] test           rc=0  2159 passed · Total coverage: 96.98%
[OK] boundaries     rc=0  7 kept, 0 broken
[OK] regras         rc=0  0 bloqueio(s), 67 aviso(s)
[OK] política       rc=0
veredito: VERDE — 6 portões mediram e passaram
```

`bash .harness/mechanism rules --mode sweep --changed-only` → **rc=0**, nenhum achado.

### 3.4 Suíte de front

`npm --prefix frontend run test:app` → **168 pass / 0 fail** (eram **160** antes destes dois
arquivos novos). ⚠️ `npm --prefix frontend run lint` e `run typecheck` → limpos, mas **é o `lint`
do projeto**: o `eslint` global desta máquina é `6.4.0`, anterior ao flat config, e recusa com
"couldn't find a configuration file" — quem roda tem de ter `frontend/node_modules` (`make setup`).

---

## 4. Verde não prova nada até uma mutação reprovar

**Todas as mutações abaixo foram rodadas**, uma de cada vez, com restauração conferida entre elas.

### 4.1 No e2e, universo FORTE (`measure_cvd_dom.py`)

| mutação | rc | como morreu |
|---|---|---|
| `CVD_KLINE_QUANTITY_FIELD` `"NA"` → `"q"` (o painel passa a ler `aggtrade_q`) | **1** | `cvd_dom_present_points=0` · `Expected: 294 · Received: 0` · 1 failed / 1 passed |
| `data-cvd-present-points` apagado do DOM | **1** | *"a página parou de publicar `data-cvd-present-points`"* · `Received: null` · 1 failed / 1 passed |
| **restaurado, sem mutação** | **0** | `cvd_dom_present_points=293` · **2 passed** |

⛔ A segunda é a armadilha que o enunciado nomeia e que já custou um ciclo: sem o
`expect(raw).not.toBeNull()`, `Number(null) === 0` compararia `0 === 0` e o gate ficaria **verde
sobre um DOM sem contrato nenhum**. Ela **reprova**, e reprova pela mensagem certa.

### 4.2 No e2e, universo FRACO (`make e2e`) — o falsificador de `RN-1`

Aqui é onde o ramo de ausência é exercido — no universo forte o último instante tem valor
(`"1.439"`), então a mutação de `RN-1` só pode ser medida contra a API que **recusa**.

| mutação | rc | como morreu |
|---|---|---|
| ausência `FLOW` renderizada como `0` (`ABSENCE_TOKEN` → `"0"` no `CvdPane`) | **2** | `cvd_last_reading_text="Delta atual: 0"` · `Expected substring: "SEM_PONTO" · Received string: "Delta atual: 0"` · **2 failed / 24 passed** (a 2ª falha é a `C5` pré-existente) |
| sem mutação, mesmo comando | **1** | **1 failed / 25 passed** — só a `C5`; os 2 specs de CVD passam |

⇒ o `+1 failed` é **atribuível à mutação**, não ao ruído: os dois comandos são o mesmo `make e2e`
e a única diferença entre eles é o token.

### 4.3 Na suíte `node --test` — as 4 que passavam despercebidas

Com `cvd-pane-dom-contract.test.ts` **removido** da suíte, uma mutação por vez,
`npm --prefix frontend run test:app` depois de cada `[MEDIDO 2026-09-12]`:

```
baseline (arquivo removido, nada mutado)     -> 160 pass / 0 fail
M1 CVD_PANE_TESTID renomeado                 -> 160 pass / 0 fail
M2 ABSENCE_TOKEN chegando ao CvdPane como "0"-> 160 pass / 0 fail
M3 data-cvd-present-points apagado           -> 160 pass / 0 fail
M4 cvdAnchorMs removido de page.tsx          -> 160 pass / 0 fail
arquivo restaurado, nada mutado              -> 168 pass / 0 fail
```

**Quatro mutações, zero detecções** antes do arquivo existir — inclusive a `M2`, que É o defeito de
`RN-1` a um token de distância. Depois dele, as quatro reprovam (o próprio teste `MORDE` as aplica
e falha se alguma sobreviver).

### 4.4 O que **não** está provado por mutação, e é honesto dizer

- A asserção `(c)` do horizonte (`cvd_readable_horizon:<n>/<grades>`) e a `(d)` da âncora
  (`cvd_cumulative_anchor:<ms>`) reprovam por construção se o `data-fact` mudar, mas **nenhuma
  mutação foi rodada contra elas no e2e** — o que existe é o MORDE delas na suíte `node --test`
  (§4.3, `M4` para a âncora). `[NÃO MEDIDO]` no nível do browser.
- O ramo `else` de `(e)` — *"a API sabe o valor e a tela mostra ESSE número"* — foi **exercido de
  verdade** no universo forte (`Delta atual: 1.439` contra `cvd_api_last_instant_value="1.439"`),
  mas não por mutação: nenhum mutante trocou o número na tela por outro.

---

## 5. Bloqueado / não consertado, com endereço

1. **`make e2e` fecha em `rc != 0` por um defeito PRÉ-EXISTENTE, e não é desta fase.**
   `frontend/e2e/04-interacoes.spec.ts:51` exige **5** linhas para o filtro `sum_open_interest`; o
   catálogo serve **20** (`5 × 4` símbolos). A aritmética prova que não foi a fase `02`: as 4 linhas
   que `T-02.4` acrescentou são `cvd_source` e nenhuma casa aquele texto — com `44` entradas já era
   `20`. Registrado como **`C5`** em `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`, com o conserto de uma
   linha (`helpers.ts::seriesCatalogEntryCount()` existe exatamente para isso). Não consertado aqui
   por `D17` e para não colidir com a worktree que edita a suíte da fase `01`.
   ⚠️ **Enquanto durar, essa linha esconde qualquer regressão nova atrás dela.**
2. **A leitura de PRODUÇÃO do item 3 continua devendo, e é de `T-02.7`.** Hoje `deploy-api-1` serve
   **44** entradas (sem `kline_takerbuy`) e `md.series` não tem linha de CVD ⇒ contra produção o
   painel diria `SEM_PONTO` com `panel_absent:not_in_catalog`, **corretamente**. Depois do deploy e
   de ~30 min de coleta ao vivo, o comando que fecha é o mesmo spec com as duas variáveis apontando
   para produção.
3. **`B5` de `PENDENCIAS` continua de pé e agora tem um irmão:** `page.tsx` chama
   `scaledCvdDeltasFromHistoryRows` fora de `try/catch`, igual a `volumeSlotsFromHistoryRows`. Não
   alcançável hoje (o backend escreve `str(Decimal)` com ≤ 8 casas), não consertado, mesma linha de
   `D17`.

---

## 6. ⛔ O que o arnês do universo forte **não** é

`measure_cvd_dom.py` sobe a pilha de produção componente por componente — `/fapi/v1/klines` real,
`build_klines_to_rows` real, `PostgresSeriesSink` real sobre TimescaleDB real, `src.main` (a mesma
FastAPI do deploy, engine `postgres`), `next build`/`next start` do mesmo app, e o Playwright
contra o DOM. **O dado é real**; um zero no fim seria um zero de verdade.

O que ele **não** é: a medição de produção. O Postgres é um contêiner descartável que o script cria
e destrói, deliberadamente, por duas razões declaradas:

- **semear o Postgres compartilhado é proibido** (`[P-seed]`, `D2`; dado sintético já vazou para a
  tela do owner uma vez) — e note que aqui nem sequer haveria dado sintético, mas a regra é sobre
  **onde** se escreve, não sobre a qualidade do dado;
- uma worktree não pode virar o project directory da stack do owner (o defeito que
  `gates/T-01.10-infra.md` registra).

Ele também **não** faz backfill de boot: publica **um bar por ciclo**, em `bucket_end + 58 s`, a
latência medida deste endpoint — porque um backfill poria `available_at = "quando buscamos"` e
`R-1` (anti-lookahead, e está **correta**) recusaria cada bucket no seu próprio instante de grade
(`769` legíveis em `5.761` grades, `[MEDIDO 2026-09-11]`). Esse conserto é `D15`/`D17`, fora desta
fase.

---

## 7. Doc delta

| documento | o que |
|---|---|
| `PENDENCIAS-PARA-AVALIAR-DEPOIS.md` | **atualizado** — `C5` (§5.1) |
| `docs/INDEX.md` | **acrescentada** 1 linha (append-only) apontando para este relatório |
| `docs/product/STITCH_CONTEXT.md` | **sem mudança — e a omissão é deliberada**: a microcopy nova é **proposta** ao `ui-designer` (§2.2), e quem escreve ali é ele, com o veredito do `ux-ui-mastery`. Um builder editando o documento de design fecharia o gate por conta própria |
| `docs/product/DESIGN_SYSTEM.md` | **sem mudança** — nenhum token novo, nenhum papel de cor novo |
| ADR | **não necessária** — nenhuma decisão de fronteira nova. `ADR-003` respeitada (zero geometria nova em `web`: `lineSeriesLossless`/`buildCvdPanel` reusados); `ADR-034/D8` respeitada (nada de deep import em `charts`) |

## 8. O que eu **não** fiz, de propósito

`harness gate-record`, `approve`, `advance` — atos de **owner**. Nenhum arquivo de `backend/`
tocado. Nenhuma task criada ou editada no tracker. Nenhum subagente aninhado.
