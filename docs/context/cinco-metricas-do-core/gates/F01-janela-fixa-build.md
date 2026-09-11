# Fase `01` · segundo defeito — a janela de `/symbol` era literal e antecedia todo o dado

> **Escopo:** `web` + `charts`. **Origem:** [`handoff/ACHADO-SERIES-HISTORY-SEM-PONTO.md`](../handoff/ACHADO-SERIES-HISTORY-SEM-PONTO.md),
> seção *"Segundo defeito, independente"*. **Data:** 2026-09-11.
> ⚠️ O **terceiro achado** daquele documento (catálogo serve 1 símbolo, `md.series` tem 4) **não foi
> tocado** — dono é `sentimento`. Ver §7.

## 1. O defeito, e por que ele não falhava

`frontend/src/charts/s2-panels.ts:43` exportava a janela como três constantes de módulo —
`DAYS = ["2026-08-20"…"2026-08-23"]`, `RANGE_START_MS`, `RANGE_END_MS_EXCLUSIVE`. Elas foram
escolhidas em `T-05.2` porque eram os quatro dias de CSV em `data/binance/*` **em disco**, e para
um módulo cujo único consumidor era um teste de fixture isso estava certo. Virou defeito quando
`T-02.4` apontou a rota viva `/symbol` para elas: `klines_volume` só existe a partir de
**2026-09-04** (`min(bucket_end) = 1788486120000`) ⇒ **a rota pedia uma janela que antecede toda
linha que existe**, e a tela ficava vazia com todos os elos da corrente funcionando.

**Um literal não falha — ele só envelhece.** É esta a classe de defeito que a correção fecha.

## 2. A forma escolhida, e a alternativa recusada **com medição**

**Escolhida: janela DESLIZANTE ancorada na leitura do relógio** —
`[floor(now − lag) − span, floor(now − lag))`, com as duas bordas no bucket.
`charts/s2-window.ts::resolveTrailingWindow`, **pura** (`nowMs` é argumento; o módulo nunca chama
`Date.now()`).

**Recusada: derivar da cobertura que a série oferece.** Não é preferência, é ausência de superfície:
`SeriesCatalogEntry` (`features/s3-inspector/series-catalog.ts`, transcrição campo a campo de
`series_catalog.py`) carrega `nativeGrid`, `maxStalenessMs`, `priceUse`, `reconstructedFrom` e
`publishedError` — **e nenhum primeiro/último `event_time`**; `GET /series-history` só responde
sobre uma janela que o chamador **já escolheu**. Derivar da série exigiria ou um campo novo no
backend (dono `sentimento`, fora de `web`/`charts`) ou uma requisição-sonda sobre uma janela
chutada — **o mesmo literal, um nível mais fundo e mais difícil de ver**.

**O que NÃO mudou: o VÃO.** Quatro dias, os "4 dias" de `ADR-034/D8` (`S2_WINDOW_SPAN_MS`). Só
**quais** quatro dias passou a ser derivado.

**Por que existe `lagMs` (5 min) e por que ele não é zero:** `available_at − event_time` medido em
**10,434s / 12,034s / 13,591s** (`n=3`, o mesmo handoff). Uma borda direita colada no `now`
incluiria buckets que o escritor ainda não publicou, e a "leitura atual" — que lê o **último**
instante da janela — imprimiria `SEM_PONTO` para uma barra que existe. Isso é **ausência fabricada
pela REQUISIÇÃO**, e `RN-1` é sobre ausência **real**.

## 3. A fronteira `charts` ↔ `web`, respeitada e verificável

- **`charts`** (`s2-window.ts`): toda a geometria — o `floor` (`alignToTimeframeStart`, reusado, não
  reimplementado), as duas bordas, e `utcDaysCovered`. Puro.
- **`web`** (`app/symbol/request-window.ts`): lê o relógio (`Date.now()` — I/O, e por isso é de
  `web`), passa `nowMs` como argumento, e deriva `knowledgeTimeMs = endMsExclusive + 60_000`, que
  **não é geometria** — é política de `as_of` (`ADR-005/D1`): não calcula bucket nem alinha nada.
- **Estrutural, não só documental:** `s2-fixture-window.ts` (os 4 dias de CSV) **não é reexportado
  pelo barril**; `eslint.config.mjs` recusa import profundo de `charts/**` a partir de
  `src/app/symbol/**` ⇒ **uma rota não consegue voltar a ler janela congelada nem por acidente**.

## 4. Vermelho ANTES do verde, e morte por mutação

| passo | comando | resultado |
|---|---|---|
| baseline | `npm --prefix frontend run test:charts` / `test:app` | `166/166` · `142/142` |
| **vermelho** (testes escritos antes do fix) | idem | `ERR_MODULE_NOT_FOUND` em `s2-window.ts` e `request-window.ts` |
| verde | `npm --prefix frontend run test:charts` | **176 testes, 176 pass, 0 fail** |
| verde | `npm --prefix frontend run test:app` | **148 testes, 148 pass, 0 fail** |
| **mutação 1** — literal replantado em `request-window.ts` (`resolveRouteWindow` ignora `nowMs`) | `test:app` | **rc=1, 3 falhas**: `REPRO: the frozen window misses the data…`, `…TRACKS the clock…`, `…day list… not a literal` |
| **mutação 2** — literal replantado em `s2-window.ts` (borda direita fixa) | `test:charts` | **rc=1, 3 falhas**: `…ends near the clock reading…`, `…CONTAINS the recent past…`, `…TRACKS the clock…` |

As duas mutações foram **revertidas** (`cp` de backup) e o verde refeito.

## 5. A medição que importa — contra a API de PRODUÇÃO, sem semear nada

Mesmo `series_key_id` (`ef3033e6…4e42`, `klines_volume`/BTCUSDT), mesmo vão de 4 dias,
`bar_policy=final_only`. **Leitura apenas — `[P-seed]` não foi tocado, nada foi escrito.**

| janela | `n_rows` | linhas **com valor** |
|---|---|---|
| **congelada** (o que a rota pedia): `1787184000000 .. 1787529540000` (2026-08-20..24) | 5.760 | **0** |
| **derivada** (o que a rota pede agora): `1788791100000 .. 1789136640000` | 5.760 | **745** |

```
curl -s "http://127.0.0.1:8000/api/v1/series-history?series_key_id=$KID&symbol=BTCUSDT\
&interval=1m&window_start_ms=…&window_end_ms=…&knowledge_time_ms=…&bar_policy=final_only"
```

`[MEDIDO 2026-09-11T14:3xZ, n=2 janelas × 5.760 linhas]`. **De 0 para 745 pontos reais, com o mesmo
backend, no mesmo minuto — a diferença é só a janela.**

## 6. ⚠️ Achado que NÃO foi "consertado", porque consertá-lo seria fabricar continuidade

A série tem **buraco real** perto da borda direita: `701/720` presentes nos últimos 720 min, e o
**último** instante da janela estava ausente na medição acima (`last_present` = `end−2min`)
`[MEDIDO 2026-09-11, n=5.760 linhas; 745 presentes, cobertura começa 763 min atrás]`.

⇒ A "leitura atual" pode imprimir `SEM_PONTO` legitimamente. **Isso é `RN-1` funcionando**, não
defeito: para uma série `FLOW`, andar para trás até o último valor presente **fabricaria
continuidade** (`D5.3`). **Consequência para `T-01.9`:** o assert de `DoD-3` tem de ser
**`N ≥ 30` pontos distintos** (`RN-S2`), **não** "o readout da borda não é `SEM_PONTO`" — este
segundo é flaky por construção, contra dado real. **Escalado, não corrigido.**

## 7. Terceiro achado — NÃO tocado, conforme o despacho

Catálogo servido tem 1 entrada de `klines_volume` (BTCUSDT) enquanto `md.series` tem 4 símbolos.
**Dono: `sentimento`.** Nada neste PR o altera. Cruzou com ele em `page.tsx::findCatalogEntry`, que
continua procurando **um** símbolo (`SYMBOL = "BTCUSDT"`) — comportamento inalterado.

## 8. Observação de estado (não é reivindicação de autoria)

O **primeiro** defeito daquele handoff (`/series-history` devolvendo `SEM_PONTO` para **toda** linha
de `klines_volume`) **não se reproduz mais** na medição de §5: a janela derivada devolve 745 linhas
com valor para a mesma chave. **Não foi esta task que o corrigiu** e nada aqui o toca — registrado
para que o orquestrador reconfira antes de contar `DoD-2` como fechado.

## 9. Arquivos

**Novos:** `frontend/src/charts/s2-window.ts` · `s2-window.test.ts` · `s2-fixture-window.ts` ·
`frontend/src/app/symbol/request-window.ts` · `request-window.test.ts`.
**Alterados:** `charts/s2-panels.ts` (janela vira parâmetro obrigatório) · `charts/index.ts` ·
`charts/s2-panels.test.ts` · `s2-axis-integration.test.ts` · `s2-absence-policy.test.ts` ·
`app/symbol/page.tsx` · `SymbolClient.tsx` · `view-model.test.ts` · `axis-fidelity.test.ts`.

## 10. Portões

- `make verify` → **VERDE, 6 portões**: `lint-backend rc=0` (413 arquivos) · `lint-frontend rc=0`
  (ESLint + `tsc --noEmit --strict`) · `test rc=0` (**2.120 passed**, cobertura **96,96%**) ·
  `boundaries rc=0` (7 kept, 0 broken) · `regras rc=0` (**0 bloqueio**, 66 avisos, todos
  pré-existentes e nenhum nos arquivos novos) · `política rc=0`.
- `harness rules --mode sweep --changed-only` → `rc=0`, sem achado.
- **Nota de ambiente:** nesta worktree foi preciso `ln -sfn` de `frontend/node_modules`, `data/` e
  `backend/.venv` (todos gitignored, vivem só no checkout principal) e
  `HARNESS_MECHANISM=<…>/harness-plugin/0.13.0/bin/harness` — **sem isso `make verify` RECUSA medir
  (`rc=3`), que não é o mesmo que passar.**
- **Escopo:** `harness pipeline scope cinco-metricas-do-core add frontend/src/charts` foi executado
  por esta task (a feature está `BUILD_AUTHORIZED` e o despacho declara componente `web`/`charts`;
  `frontend/src/charts` era reivindicado só por `pagina-de-grafico-s2`, que está `DONE`). Registrado
  aqui porque é alteração de estado do pipeline feita por agente.
