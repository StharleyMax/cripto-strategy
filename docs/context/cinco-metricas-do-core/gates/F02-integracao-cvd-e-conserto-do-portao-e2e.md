# Gate — integração do painel de CVD + o conserto do portão cego (`make e2e`)

**Feature:** `cinco-metricas-do-core` · **Componente:** `web` · **Agente:** `frontend-builder`
**Data:** 2026-09-12 · **Base:** `master` em `1528e52`

Duas coisas, e a segunda é a que importa mais: **`make e2e` estava vermelho por motivo conhecido, e
um portão vermelho por motivo conhecido é indistinguível de um portão vermelho por motivo novo.**

---

## 1 · Integração — `T-02.5`/`T-02.6` (painel de CVD em `/symbol`)

Origem: `worktree-agent-ace7a1de9c3964975`, commit `9ab9fe0`, que saiu de `968a59e`. O trabalho de
backend daquela branch (`b3febfb`) **já estava em `master`** via PR #218, então só o commit `web`
foi trazido — `git cherry-pick -x 9ab9fe0`.

**O conflito esperado não aconteceu, e o motivo é medido:** o enunciado previa colisão nos 3
arquivos de `frontend/src/app/symbol/`. `git diff --stat ff18811 master -- frontend/` devolve
**0 arquivos** — `master` não tocou `frontend/` desde a base comum, então os três auto-mergearam
sem ambiguidade. **O único conflito real foi `docs/INDEX.md`**, que é *append-only* e por
construção colide em toda integração: resolvido **mantendo as duas metades**, com a linha nova
(`14:30Z`) inserida em ordem cronológica entre `13:45Z` e `14:45Z` — nenhuma linha existente
reescrita.

Relatório do autor, preservado: [`F02-web-T-02.5-T-02.6.md`](F02-web-T-02.5-T-02.6.md).

Arquivos que entraram (10, `git show --stat 9ab9fe0`): `SymbolClient.tsx`, `page.tsx`,
`view-model.ts`, os 2 testes de unidade de CVD, `frontend/e2e/10-cvd-dado-real.spec.ts`,
`scripts/cvd-klines-falsifier/measure_cvd_dom.py`, `docs/INDEX.md`,
`PENDENCIAS-PARA-AVALIAR-DEPOIS.md` e o relatório acima. **Zero arquivo de `backend/`** — a PR
#219 não foi tocada.

---

## 2 · O portão cego — `C5`, e por que trocar `5` por `20` seria o mesmo defeito

`frontend/e2e/04-interacoes.spec.ts` exigia **5** linhas para o filtro `sum_open_interest`. O
catálogo servido publica **20**. O literal `5` foi escrito quando o piloto descrevia **um**
instrumento; `list_pilot_series_catalog` passou a concatenar **quatro** (`INITIAL_SYMBOLS` =
`BTCUSDT`/`ETHUSDT`/`LINKUSDT`/`SOLUSDT`), e as mesmas 5 linhas de open interest passaram a ser
publicadas 4 vezes.

```
python3 -c "…list_pilot_series_catalog()…"  →  n_entries=48
   Counter({'sum_open_interest': 20, 'cvd_source': 16, 'klines_last': 4,
            'price_mark_close': 4, 'klines_volume': 4})
```

**O conserto NÃO foi `toBe(20)`.** Seria o mesmo defeito com outro número, agendado para o dia em
que um quinto símbolo entrar — e este é o arquivo cujo próprio cabeçalho já registra que o total
`10` foi trocado por uma chamada à API pelo mesmo motivo, deixando o subtotal literal para trás.

O que mudou:

- **`frontend/e2e/helpers.ts`** — `seriesCatalogMetricRowCount(metric)`, que conta no mesmo
  envelope que a página renderiza as entradas cujo `key.metric` casa. `fetchSeriesCatalog()` foi
  extraído para que os dois helpers parseiem e validem uma vez só — e ele **valida `entries`**,
  não só `n_entries`: um envelope sem o array faria a contagem responder `0`, um número que se lê
  como medição e é a ausência de uma.
- **`frontend/e2e/04-interacoes.spec.ts`** — a prova de que o filtro **reduz** virou
  `0 < casadas < total`, sobre dois números que a API acabou de declarar. A expectativa é
  computada de `key.metric` **sozinho**, nunca re-implementando `catalogRowMatchesText`
  (`domain.ts`): um teste que re-deriva o predicado de produção concorda com ele até quando os
  dois estão errados.

### MORDE / CALA — rodado, não presumido

Ambiente de pé uma vez (`scripts/e2e-env.sh up 1 8821 4321`), spec `04` isolado. Mutação de
produção (`domain.ts`) exigiu `next build` novo; as outras duas não.

| mutação | `rc` | o que o Playwright imprimiu |
|---|---|---|
| literal `5` replantado | **1** | `Expected: 5 · Received: 20` |
| filtro de produção deixado de reduzir (`catalogRowMatchesText` sempre verdadeiro) | **1** | `Expected: 20 · Received: 48` |
| universo casante vazio (métrica que a API não publica) | **1** | `Expected: > 0 · Received: 0` — a armadilha do `0 === 0` |
| **CALA** — as três revertidas | **0** | `2 passed` |

As três mutações foram revertidas e `git status` confirma árvore limpa em `domain.ts`.

---

## 3 · Comandos rodados, com o universo

| comando | resultado | universo |
|---|---|---|
| `make e2e` | **`rc=0`, 26 passed (33,0 s)** | 9 specs, incluindo `10-cvd-dado-real.spec.ts` |
| `make verify` | **VERDE, 6 portões** — `test rc=0, 2213 passed · 96,85%`; `regras 0 bloqueio(s), 69 aviso(s)`; `boundaries 7 kept, 0 broken` | árvore inteira |
| `npm --prefix frontend run lint` / `typecheck` | `rc=0` (dentro de `lint-frontend`) | `frontend/src` |
| `npm --prefix frontend run test:app` | `rc=0`, **168/168** | inclui os 2 testes de CVD que vieram de `9ab9fe0` |
| `npm --prefix frontend run test:charts` | `rc=0`, **191/191** | — |
| `npm --prefix frontend run test:s3` | `rc=0`, **111/111** | — |
| `npm --prefix frontend run test:s1` | **`rc=1`, 97/105** | **`C4`, pré-existente** — 8 × `store_parent_missing: data/md`, e `data/md` não existe nem no checkout principal |

Fatos do spec `04` na corrida final (`E2E-FACT`, arquivo de fatos da própria suíte):
`series_catalog_n_entries=48` · `catalog_rows_before_filter=48` ·
`series_catalog_n_sum_open_interest=20` · `catalog_rows_after_matching_filter=20` ·
`catalog_rows_after_nonmatching_filter=0`.

### ⚠️ As suítes de front não rodam numa worktree sem `data/`, e isso quase virou falso positivo

Primeira medição de `test:app`/`test:charts` nesta worktree deu `rc=1` — **e não era regressão**:
`data/` é gitignored (`CLAUDE.md`, *"Dado bruto não é versionado"*), então **uma worktree nasce sem
ele** e `readFileSync` de `data/binance/klines/tf2/BTCUSDT-1m-2026-08-20.csv` sai `ENOENT`. Com
`data/` do checkout principal ligado por symlink (só leitura, removido depois), as duas ficam
verdes nos números acima. **É a mesma classe de `C4`, uma superfície adiante** — e vale registrar
porque `C1` já diz que nenhuma suíte de front está em portão: quem as rodar numa worktree vê
vermelho ambiental e pode lê-lo como defeito de código.

---

## 4 · O que este conserto revelou — nada, e isso é um resultado

O enunciado previu que, com o primeiro defeito fora da frente, outro poderia aparecer. **Não
apareceu:** `make e2e` foi de `1 failed` para **26 passed** sem nenhum achado novo, e `make verify`
ficou VERDE nos 6 portões. O que estava escondido atrás do vermelho conhecido era, desta vez, o
próprio vermelho conhecido.

## 5 · Doc delta

- `docs/context/cinco-metricas-do-core/PENDENCIAS-PARA-AVALIAR-DEPOIS.md` — **`C5` marcado
  RESOLVIDO** com os números e as três mutações. O texto original do achado **não foi reescrito**;
  a resolução foi acrescentada à linha.
- `docs/INDEX.md` — **duas linhas acrescentadas** (a de `9ab9fe0`, preservada do cherry-pick, e a
  desta integração). Append-only respeitado.
- ADR: **não necessária** — nenhuma decisão de arquitetura mudou. O conserto aplica a regra que
  `helpers.ts` já carregava por escrito (*"um literal aqui é uma falha falsa agendada"*) a um
  segundo eixo do mesmo spec.
- `STITCH_CONTEXT.md`: **sem mudança** — nada visual mudou aqui; o painel de CVD veio pronto de
  `9ab9fe0`, com o design já exercido lá.

## 6 · Não fechado

Nada bloqueante. Pendências herdadas, todas já registradas e **não causadas por este trabalho**:
`C1` (nenhuma suíte de front em portão), `C4` (`test:s1`, `data/md` ausente) e o `500` de
`/series-history` para a chave de CVD sob o store efêmero de `make e2e` — que é justamente o caminho
de ausência que `10-cvd-dado-real.spec.ts` assere renderizar `SEM_PONTO`, nunca `0`.
