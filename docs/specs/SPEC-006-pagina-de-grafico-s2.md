# SPEC-006 — Página de gráfico S2: a coluna de valor que faltava, as duas rotas de `ADR-005/D1`, a página `symbol`, e a migração `/painel` → `/console`

**Status:** `SPEC_DRAFT` — nasce assim; `SPEC_APPROVED` exige `approve spec` do **owner**
(`harness pipeline state pagina-de-grafico-s2` é sempre a fonte, não este texto).
**Feature:** `pagina-de-grafico-s2` (filha de `plataforma-dados`) · **Data:** 2026-09-08
**Componentes:** `sentimento` (F0 — coluna de valor; F1 — leitor de janela + rotas) · `web` (F1
contrato de rota, F2 página, F3 migração) · `charts` (F2 — só a superfície exportada nova,
`index.ts`; nenhuma geometria nova). **`convergencia`/`backtest` não são tocados.**
**Ledger ao escrever:** `PRD_VALIDATED` (`approve prd` + `advance` em 2026-09-08, Gap Analysis em
[`gates/PRD-006-architect.md`](../context/pagina-de-grafico-s2/gates/PRD-006-architect.md), com
addendum registrando o achado bloqueante de `quant-architect` resolvido nesta SPEC).
**Rev de ancoragem:** `master@adf6537`.
**Insumos:** [`PRD-006`](PRD-006-pagina-de-grafico-s2.md) · `ADR-005` (D1-D6 + emenda 2026-09-03) ·
[`ADR-034`](../adr/ADR-034-rotas-de-serie-nome-schema-e-a-coluna-de-valor-que-faltava.md) (nasce com
esta SPEC) · `ADR-002/D6c`, `ADR-003/D5.12`, `ADR-006` (max-staleness), `ADR-009/D3` (layout Next) ·
relatórios de dispatch: [`gates/F1-F2-frontend-architect.md`](../context/pagina-de-grafico-s2/gates/F1-F2-frontend-architect.md),
[`gates/F1-quant-architect.md`](../context/pagina-de-grafico-s2/gates/F1-quant-architect.md) · código:
`postgres_series_sink.py`, `provenance.py`, `series_row_wire.py`, `as_of_accessor.py`, `cvd.py`,
`series_key.py`, `frontend/eslint.config.mjs`, `frontend/next.config.ts`, `frontend/src/app/
{routes.ts,painel/**,history-transport.ts,live-transport.ts}`.
**Glossário:** vazio (`ADR-013/D4`, dívida com dono, herdada). Termos em §1.
**Zero código.** Contratos, formas de dado, limites de camada, comportamento de borda.

---

## 0. O que mudou desde o `PRD_VALIDATED` — leia antes do resto

O Gap Analysis aprovou o PRD sem bloqueante. Ao escrever esta SPEC, o dispatch a
`quant-architect` (mandatado para decidir `bar_policy` e o schema de linha) devolveu um achado que
**precede** as três perguntas que lhe foram feitas: **`md.series` — a tabela que `captura-em-
producao` grava — não tem coluna de valor.** Verificado por `/architect` em 3 fontes de código
independentes (addendum do gate, §"Addendum"). Isto invalida `D-h` do PRD (*"a dependência de dado
real está satisfeita hoje"* — satisfeita para procedência, não para o número) sem invalidar o
resto do PRD: a lacuna é de schema do módulo `sentimento`, que já é componente tocado por esta
feature. Por isso esta SPEC nasce com uma fase **F0** que o PRD não previa, decidida em `ADR-034/D7`,
em vez de voltar ao PM.

---

## 1. Termos (na ausência de glossário)

*grade nativa* — a resolução de 1 minuto em que `md.series` grava e `cvd.py` calcula fatos,
`CVD_BUCKET_WIDTH_MS = 60_000`, fixa, não parâmetro · *rota endereçável por conteúdo* — resposta
HTTP cuja chave determina o corpo de forma imutável, cacheável para sempre · *borda direita do
tempo* — a fronteira entre histórico fechado e "agora", servida por SSE · *par discriminado* —
`(value, absence)` onde exatamente um é não-nulo, nunca os dois, nunca nenhum (`ADR-034/D5`) ·
*leitor de janela* — o componente de `infra` novo que faz `SELECT` sobre `md.series` por intervalo
de tempo (não existe hoje) · *S2-mínima* — item `5.1` do plano-mãe: BTCUSDT, 4 dias, Preço+OI+CVD.

---

## 2. Objetivo, em propriedades verificáveis

1. `md.series`/`SeriesRow`/`series_row_wire.py` carregam uma coluna de valor (`value_raw`); round-
   trip provado para os 4 `Provenance` × 16 campos (era 15).
2. `GET {API_PREFIX}/series-history` responde com envelope endereçável por conteúdo (`ADR-005/D6`)
   para uma janela fechada de série real, grade nativa de 1 min, com par discriminado por célula.
3. `GET {API_PREFIX}/series-live` serve SSE com o envelope de bucket parcial de `ADR-005/D2`.
4. Uma página Next em `/symbol` monta a S2-mínima sobre as duas rotas acima — sem fixture.
5. `/painel` deixa de existir: segmento, diretório, `ROUTES.panel` e referentes migram para
   `/console`; bookmark antigo recebe redirect 308.
6. Nenhuma mudança em `/collector-status`, `/ingest-health`, `/series-catalog`, `/series-quarantine`.

---

## 3. Decisões desta SPEC e de `ADR-034` — não reabrir sem reabrir a ADR

| # | decisão | onde |
|---|---|---|
| S-a | `value_raw TEXT NOT NULL`, string crua, disciplina `Decimal`-sobre-string | `ADR-034/D7` |
| S-b | Rotas: `/series-history` (HTTP), `/series-live` (SSE) | `ADR-034/D1` |
| S-c | Página: `/symbol`; sucessor de `/painel`: `/console`; bookmark: redirect 308 | `ADR-034/D2,D3` |
| S-d | `bar_policy`: `final_only`/`intrabar`, sem 3º valor, nunca default | `ADR-034/D4` |
| S-e | Schema de linha: par discriminado `(value, absence)` | `ADR-034/D5` |
| S-f | F1/F2 servem só `interval=1m` — sem reagregação de CVD para grade grossa | `ADR-034/D6` |
| S-g | Exceção ESLint escopada a `src/app/symbol/**`, barrel `charts/index.ts` | `ADR-034/D8` |
| S-h | Leitor de janela (`infra`) + use-case novo (`use_cases`) — nenhum reuso puro | `ADR-034/D9` |
| S-i | Herdado do PRD: porta de leitura é o backend (`ADR-005/D5`); rows não texto (`D6.0`) | `ADR-005` |

---

## 4. Escopo por fase

| fase | entrega | componente | depende de |
|---|---|---|---|
| **F0** | `value_raw` em `md.series`/`SeriesRow`/`series_row_wire.py`; round-trip 16 campos | `sentimento` | nada |
| **F1** | leitor de janela + use-case de leitura; `/series-history`; `/series-live` | `sentimento`, `web` | `F0` |
| **F2** | barrel `charts/index.ts`; exceção ESLint; página `/symbol` consumindo `history-transport.ts`/`live-transport.ts` | `web`, `charts` | `F1` |
| **F3** | `/painel` → `/console`; `ROUTES.panel`; `not-found.tsx`; e2e; redirect 308 | `web` | independente de F1/F2, mas fecha por último (`I-3` do PRD) |

---

## 5. Contratos

### 5.1 `md.series` (F0) — coluna nova

```
value_raw TEXT NOT NULL   -- string crua da fonte; Decimal(value_raw) no consumidor, nunca float
```

**Migração:** se a tabela já existir num ambiente com `CREATE TABLE IF NOT EXISTS` já executado,
F0 precisa de `ALTER TABLE md.series ADD COLUMN value_raw TEXT` seguido de backfill ou de
re-ingestão — a coluna nasce `NOT NULL` e não há valor retroativo a inferir de uma linha que nunca
o carregou. **Decisão de custo operacional é do owner** (§14, `M3`).

**`SeriesRow`:** campo novo `value_raw: str`, mesma disciplina de `__post_init__` que já recusa
string vazia para os outros campos de texto obrigatórios.

**`series_row_wire.py`:** `FIELD_NAMES` ganha `value_raw`; round-trip testado para os 4
`Provenance` × 16 campos (o teste que hoje cobre 15 campos é estendido, não substituído).

### 5.2 `GET {API_PREFIX}/series-history`

**Query:** `series_key_id`, `symbol`, `interval` (aceita **só** `"1m"` nesta SPEC — outro valor
recebe `422`), `window_start_ms`, `window_end_ms`, `knowledge_time_ms`, `bar_policy`
(`"final_only"` | `"intrabar"`, obrigatório, sem default).

**Resposta — envelope de 3 níveis (`ADR-005/D3`), rows não texto (`D6.0`):**

```json
{
  "session": { "principal_id": "…", "server_now_ms": 1700000100000 },
  "panel": { "series_key_id": "…", "source": "…", "nature": "OI", "unit": "…" },
  "rows": [
    { "event_time": 1700000000000, "available_at": 1700000012000, "value": "1234.56", "absence": null },
    { "event_time": 1700000060000, "available_at": null,            "value": null,      "absence": "SEM_PONTO" }
  ],
  "knowledge_time": 1700000100000,
  "bar_policy": "final_only"
}
```

Cacheável para sempre pela chave `(series_key_id, symbol, interval, window_start_ms,
window_end_ms, knowledge_time_ms, bar_policy)` — mesma resposta sempre, `ETag` opcional.

**Erros nomeados:** `422` — `interval` ≠ `1m`; `bar_policy` ausente ou fora do enum;
`knowledge_time_ms` no futuro relativo a `server_now_ms`. `500` — `AsOfReading` mal-formado
(`value` e `absence` ambos nulos ou ambos não-nulos) — nunca servir, sempre recusar.

### 5.3 `GET {API_PREFIX}/series-live` (SSE)

`Content-Type: text/event-stream`. Cada evento carrega o envelope de bucket parcial de
`ADR-005/D2`, sem alteração: `(bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq)`, a
`max(1 Hz, 1/TF)`. Sem `bar_policy` (§`ADR-034/D4`). Reconecta sozinho (`RNF-3` do PRD, herdado).

### 5.4 Página `/symbol` (F2)

Server Component (`ADR-005/D5`: zero SQL, zero subprocess no lado Next); consome
`history-transport.ts`/`live-transport.ts` existentes apontando para `/series-history`/
`/series-live`; importa **só** `frontend/src/charts/index.ts` (o barrel de `ADR-034/D8`) —
nenhum import profundo de `charts`.

### 5.5 Migração `/painel` → `/console` (F3)

`ROUTES.panel` (hoje `"/painel"`) passa a `"/console"`; diretório `frontend/src/app/painel/`
renomeia para `frontend/src/app/console/`; `not-found.tsx` e `frontend/e2e/01-painel-carrega.spec.ts`
atualizados; `frontend/next.config.ts` ganha `{ source: "/painel", destination: "/console",
permanent: true }` no array `redirects()` já existente.

---

## 6. Regras de negócio (herdadas + novas)

| id | regra | falsificador |
|---|---|---|
| RN-1..6 | herdadas de `PRD-006 §8`, inalteradas | ver PRD |
| **RN-7** | `value_raw` é a ÚNICA fonte de número em `/series-history` — nenhum fixture, nenhum literal | `grep -rn 'MOCK\|FIXTURE' backend/src/api/routes/series_history.py` fora de teste ⇒ reprova |
| **RN-8** | `interval` ≠ `1m` é recusado, nunca aproximado | requisição com `interval=5m` → `422`, nunca `200` com número subestimado (`ADR-034/D6`) |
| **RN-9** | linha com `value`/`absence` mal-formados nunca é servida | `500` nomeado, não `200` com dado inconsistente |

---

## 7. Non-goals (herdados de `PRD-006 §11`, + 1 novo)

Todos os `NG-1..8` do PRD valem. **`NG-9` (novo):** reagregação de CVD para `interval` ≠ `1m` —
fica para quando um seletor de timeframe entrar no escopo de alguma feature (`ADR-034/D6`).

---

## 8. Critérios de aceite

### F0

| id | critério | comando | morde |
|---|---|---|---|
| CA-F0-1 | `value_raw` existe em `SeriesRow` | round-trip 4×16 campos via `series_row_wire.py` | campo ausente ⇒ `KeyError`/teste vermelho |
| CA-F0-2 | string vazia é recusada | `SeriesRow(..., value_raw="")` | `InvalidSeriesRowError` |

### F1

| id | critério | comando | morde |
|---|---|---|---|
| CA-F1-1 | rota de histórico existe | `grep -rlE '"/series-history' backend/src/api` → ≥ 1 | ausência ⇒ reprova |
| CA-F1-2 | endereçável por conteúdo | 2 chamadas, mesma chave → corpos byte-idênticos | corpo muda ⇒ reprova |
| CA-F1-3 | `interval≠1m` recusado | `422` | `200` com número ⇒ reprova `RN-8` |
| CA-F1-4 | SSE responde `text/event-stream` | `curl -sD -` | ausência ⇒ reprova |
| CA-F1-5 | par discriminado nunca mal-formado | schema check sobre resposta real | `value`+`absence` juntos ⇒ reprova `RN-9` |
| CA-F1-6 | nenhuma chamada de exchange direta | `grep -rn 'binance\|coinalyze' <rotas novas>` além de label ⇒ 0 | chamada HTTP externa ⇒ reprova |

### F2

| id | critério | comando | morde |
|---|---|---|---|
| CA-F2-1 | página importa só o barrel | `grep -n 'from.*charts/index' frontend/src/app/symbol` → ≥ 1; import profundo → 0 | import profundo ⇒ reprova `ADR-034/D8` |
| CA-F2-2 | consome os transports existentes | `grep -n 'history-transport\|live-transport'` → ≥ 1 cada | fetch direto ⇒ reprova |
| CA-F2-3 | ausência lida como ausência | herdado de `D5.2`/`D5.3`, exercitado com dado real | zero renderizado no lugar de ausência ⇒ reprova |
| CA-F2-4 | ESLint boundary — 3 casos | tabela de `ADR-034/D8` | qualquer um dos 3 diferente do esperado ⇒ reprova |

### F3

| id | critério | comando | morde |
|---|---|---|---|
| CA-F3-1 | zero segmento `/painel` | falsificador de `CLAUDE.md` (`git ls-tree` + `awk` + `grep -vxE`) | `painel` presente ⇒ reprova |
| CA-F3-2 | `ROUTES.panel` = `/console` | `grep -n 'panel:' routes.ts` | valor antigo ⇒ reprova |
| CA-F3-3 | redirect 308 | `curl -sD - <base>/painel` → `Location: /console`, `308` | ausente/status errado ⇒ reprova |

### Ponta a ponta

| id | critério | morde |
|---|---|---|
| CA-E2E-1 | `/symbol` renderiza sobre dado real, não fixture, com `captura-em-producao` `DONE` e F0 aplicada | fixture em produção ⇒ reprova |
| CA-E2E-2 | contratos herdados intocados | `git diff --stat` sobre as 4 rotas antigas → vazio |

---

## 9. `[INFERRED]`

| # | inferência | motivo | custo se errada |
|---|---|---|---|
| I-1 | Uma coluna (`value_raw`) basta — sem OHLC | `series_key_id` já discrimina o quê; a tabela é observação pontual, não candle | se falso, F0 refeita com colunas extras — schema ainda não está em produção pelo que se mede aqui |
| I-2 | `interval=1m` fixo em F1/F2 não quebra o item `8.6` (S2 completa) | glossário do PRD define `8.6` como "painéis restantes + as-of + marcação", não multi-timeframe | se `8.6` exigir outro `interval`, `ADR-034/D6` vira bloqueio dessa fase futura, dono `quant-architect` |

---

## 10. GAPs abertos

| gap | severidade | dono |
|---|---|---|
| Reagregação de CVD para `interval`≠`1m` | baixa (fora do escopo declarado) | `quant-architect`, gatilho: seletor de timeframe |
| `RNF-2` (eixo sob carga real) ainda não medido com dado real | média, herdado do PRD (`G4`) | `frontend-architect`, medir em F2 |
| ~~Custo de re-ingestão se `captura-em-producao` já gravou em produção sem `value_raw`~~ | ~~alta se já houver dado; zero se não~~ | **RESPONDIDA 2026-09-08, ver §12 `M3`** |

---

## 11. Non-goals herdados e novos

Ver §7.

---

## 12. Onde o `approve spec` do owner decide (menu)

| # | pergunta | default adotado | custo de reverter |
|---|---|---|---|
| **M1** (herdado, `PRD §14`) | destino de `T-05.2`/`T-08.9` na mãe | `superseded`, `refs` para as tasks desta filha | histórico preservado; transições de tracker |
| **M2** (herdado) | — resolvida: bookmark é redirect 308 (`ADR-034/D3`) | — | — |
| **M3** (novo) | `captura-em-producao` já gravou dado em produção sem `value_raw`? Se sim, quem paga a re-ingestão e quando | **RESPONDIDA 2026-09-08 — ver abaixo** | — |

### ✅ M3 — RESPONDIDA em 2026-09-08, medida ao vivo antes de fechar

`ADR-029/D1` já apontava "NÃO implantado" como evidência indireta de que não havia produção real —
mas isso não media o ambiente local em si, que é onde `captura-em-producao` estava rodando desde o
merge de `deploy-collector-1`. Medido diretamente contra o Postgres do `docker compose` local do
owner:

```
docker exec -e PGPASSWORD=*** deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -c \
  "SELECT source, symbol, count(*), min(ingested_at), max(ingested_at) FROM md.series GROUP BY source, symbol;"
```

`[MEDIDO 2026-09-08]`: **3.608 linhas reais** em `md.series` (902 por símbolo × 4 símbolos, todas de
`/fapi/v1/premiumIndex`, janela `2026-09-08T14:00Z`–`15:47Z`, ~1h45 de coleta local). Zero linhas de
`forceOrder` — coerente com o crash-loop corrigido em `PR #203`, que nunca publicou nada antes do fix.
Como `md.series` não tem NENHUMA coluna de valor hoje (confirmado via `\d md.series`), toda linha
existente já nasceu sem o que `F0` vai adicionar — exatamente o "dado órfão" que este gap nomeava.

`[PREMISSA-OWNER: 2026-09-08]` — literal: *"Caso tenha dados inválidos/anteriores a correção, vamos
somente deletar eles. Se for preciso podemos limpar a base, n é nenhum problema, vide que rodamos
apenas local."* Ação tomada, com o dado já contado acima: `TRUNCATE md.series;` → 3.608 → **0 linhas**.
`md.ingest_run` (925 linhas, log de execução, sem coluna de valor) não foi tocado — fora do escopo do
gap.

**Resposta final:** custo de re-ingestão = **zero** — a base está vazia, e `deploy-collector-1` está
de pé (sem crash-loop, `PR #203`) gravando do zero assim que `F0` subir `value_raw`.

---

## 13. Gate de handoff

- [x] cada fase tem DoD verificável com comando e universo (§8)
- [x] `ADR-034` fecha toda decisão de nome/schema/enum que era `TBD` no PRD
- [x] o achado bloqueante (`md.series` sem valor) está registrado com dono e não foi escondido
      atrás de uma SPEC otimista
- [x] non-goals herdados + `NG-9` novo (§7)

**Próximo passo:** `harness pipeline advance pagina-de-grafico-s2 SPEC_DRAFT`; plano de execução em
`docs/plans/SPEC-006-pagina-de-grafico-s2/`; `approve spec` é ato do owner (`SPEC_APPROVED`).
