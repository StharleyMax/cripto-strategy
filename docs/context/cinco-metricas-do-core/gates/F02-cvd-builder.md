# Gate de build — fase `02` (CVD) de `SPEC-007`, componente `sentimento`

> **Feature:** `cinco-metricas-do-core` · **Data:** 2026-09-12 · **Worktree:** `agent-a714e16e185cbef5f`
> **Tasks fechadas aqui:** `T-02.1`, `T-02.2`, `T-02.3`, `T-02.4`.
> **Tasks NÃO fechadas, e nomeadas:** `T-02.5`/`T-02.6` (`web`), `T-02.7` (`infra`/produção), `T-02.8`.

## 1. O que a fase entrega, em uma linha

Uma **segunda identidade pegou carona no coletor de klines da fase `01`**: `cvd_source` com
`provider="binance"` e `quantity_field=NA`, valor `2·takerBuyBaseVol[9] − volume[5]`, do **mesmo
array de 12 campos** que já traz o volume. **Diff de rede: ZERO.**

## 2. `T-02.1` — o falsificador, rodado ANTES de a identidade existir

Relatório completo: [`T-02.1-falsificador-reconstructed-from.md`](T-02.1-falsificador-reconstructed-from.md).

```bash
backend/.venv/bin/python scripts/cvd-klines-falsifier/falsify_reconstructed_from.py \
  --symbol BTCUSDT --day <DIA> --dump data/binance/aggtrades/BTCUSDT-aggTrades-<DIA>.csv
```

`[MEDIDO 2026-09-12, universo: 3 dias UTC de BTCUSDT, **n=4.320 buckets** de 1 min]` — os dias
para os quais este repositório tem dump canônico de `aggTrade`:

| dia | `exact_match` | `day_total_diff` | corridas divergentes | **com resíduo** |
|---|---:|---:|---:|---:|
| 2026-08-20 | 1.131/1.440 | `0.000` | 117 | **0** |
| 2026-08-23 | 1.291/1.440 | `0.000` | 62 | **0** |
| 2026-08-24 | 1.182/1.440 | `0.000` | 97 | **0** |

**Veredito: `DIRECT_READ (BUCKET_BOUNDARY_ATTRIBUTION)`** ⇒ `reconstructed_from=None`,
`published_error=None`.

⛔ **O predicado do veredito não é "qualquer diferença é reconstrução", e a primeira versão do
script fazia isso e respondeu ERRADO** (imprimiu `RECONSTRUCTION` com `exact_match=1182/1440`).
Agregação de bucket tem assinatura própria: move quantidade entre minutos adjacentes sem criar
nem destruir nenhuma ⇒ **toda corrida maximal de buckets divergentes soma exatamente zero**.
Reconstrução erra a *quantidade*, e quantidade errada não cancela contra o vizinho. **276
corridas, zero resíduos, total diário idêntico ao milésimo de BTC nos três dias.**

## 3. Os 8 itens do DoD da fase

| # | item | estado | comando e número |
|---|---|---|---|
| 1 | `count(*)` de `md.series` para `cvd_source`/`binance` **> 0** | **⚠️ mecanismo medido, produção PENDENTE** | ver §4 |
| 2 | `/api/v1/series-history` → `n_points > 0` | **⚠️ idem** | ver §4 |
| 3 | Playwright: `CvdPane` com `N ≥ 30` | ⛔ **NÃO FEITO — é `frontend/`** | handoff em §6 |
| 4 | run fechado com `n_written > 0` | **⚠️ mecanismo medido, produção PENDENTE** | ver §4 |
| 5 | `takerBuy ≤ volume` em **100%** da janela de backfill | ✅ | §5 |
| 6 | falsificador de `reconstructed_from` rodado **antes** | ✅ | §2 |
| 7 | **nenhuma chamada HTTP nova** | ✅ | §5 |
| 8 | `make verify` verde | ✅ | §7 |

## 4. `DoD 1`/`2`/`4` — o mecanismo, medido com dado REAL; a produção é de `T-02.7`

⛔ **Este builder NÃO fez o deploy, e a recusa tem causa medida:** `gates/T-01.10-infra.md`
registra que o projeto compose `deploy` ficou ancorado na worktree de um agente
(`com.docker.compose.project.working_dir` → diretório inexistente), quebrando `docker compose`
a partir do checkout canônico. Buildar daqui reproduziria isso. **O deploy é do checkout
canônico, depois do merge** — comandos literais em
[`handoff/T-02.7-infra.md`](../handoff/T-02.7-infra.md).

O que foi medido: a **vertical inteira com componentes de produção**, dado real da Binance,
TimescaleDB real (container efêmero, destruído ao fim — **o Postgres compartilhado não foi
tocado para escrita**), publicando na **cadência ao vivo** (1 bar por ciclo, `bucket_end + 58 s`,
o atraso medido do endpoint):

```bash
backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_vertical.py
```

`[MEDIDO 2026-09-12, universo: 4 símbolos × 300 bars de 1 min = 1.200 bars]`

| símbolo | `DoD-1` `count(*)` | `DoD-2` `n_points` |
|---|---:|---:|
| BTCUSDT / ETHUSDT / LINKUSDT / SOLUSDT | **300** cada | **298** cada |

**`DoD-4` `n_written = 2.400`** (1.200 bars × 2 identidades).

⚠️ **Uma primeira execução deu `n_points = 1`, e o número é verdadeiro e conhecido:** publicar a
página inteira com um único `received_at` é um **boot backfill**, e o backfill é invisível ao
`as_of` — `handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`, `[MEDIDO 2026-09-11: 769 pontos
legíveis de 5.761 grades]`. É defeito **pré-existente da série de volume**, não do CVD, e `D15`/
`D17` o põem **fora** desta fase. O CVD o herda inteiro, sem piorá-lo.

Baseline de produção, só leitura `[MEDIDO 2026-09-12]`:
`select source, symbol, count(*) from md.series group by 1,2` → `/fapi/v1/klines` **31.329**
linhas por símbolo, `/fapi/v1/premiumIndex` **8.726**, e **nenhuma de `cvd_source`** ⇒ `DoD-1`
em produção é **0 hoje**, como o plano previa.

## 5. `DoD 5` e `DoD 7`

**`DoD 5` — invariante `0 ≤ takerBuy ≤ volume`:**

```bash
backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_takerbuy_invariant.py
```

`[MEDIDO 2026-09-12]` — universo: **4 símbolos × 7 dias a 1 min = n=40.320 buckets** (a MESMA
janela e os MESMOS símbolos que o coletor faz no boot). **Violações: 0.** `VERDICT:
INVARIANT_HELD`. A verificação chama a função de **produção** (`kline_cvd_delta`), não uma
reescrita da comparação.

**`DoD 7` — zero chamada HTTP nova.** Duas metades, porque cada uma perde o que a outra pega:

- comportamental — `test_both_identities_are_published_from_the_very_same_single_http_call`:
  uma página, **duas identidades publicadas**, `len(client.calls) == 1`, `weight_used ==
  KLINES_WEIGHT_PER_CALL`;
- estrutural — `test_the_cvd_mapping_reaches_no_transport_at_all`: por AST, nem `domain/kline_cvd.py`
  nem `use_cases/collector_series_mapping.py` importam `http`/`urllib`/`socket`/`ssl`/`requests`/
  `httpx`/`redis` nem nada de `infra`.

⚠️ Os dois scripts de medição acima **fazem** chamadas HTTP. Isso não contradiz `DoD 7`: ele é o
diff do que o **coletor** gasta, e são os dois testes acima que o fixam.

## 6. ⛔ Bloqueado, nomeado

| task | componente | por quê | onde está escrito |
|---|---|---|---|
| `T-02.5`, `T-02.6` | `web` | instrução de escopo: este builder **não toca `frontend/`** | [`handoff/T-02.5-T-02.6-web.md`](../handoff/T-02.5-T-02.6-web.md) |
| `T-02.7` | `infra` | deploy de worktree já quebrou a produção uma vez (`T-01.10`) | [`handoff/T-02.7-infra.md`](../handoff/T-02.7-infra.md) |
| `T-02.8` | os três | é a CONJUNÇÃO; não fecha com `DoD 3` em zero | — |

⚠️ **`DoD-3` (`N ≥ 30` pontos distintos) precisa de ~30 min de coleta AO VIVO depois do deploy**,
pela invisibilidade do backfill ao `as_of`. Rodar o Playwright antes reprova por tempo, não por
código. ⛔ **Não semear o Postgres compartilhado para adiantar.**

## 7. Mutação — verde não prova nada até um mutante reprovar

`[MEDIDO 2026-09-12, 9 mutantes]`. **Dois SOBREVIVERAM na primeira passada, e os dois eram
afirmações minhas que nunca tinham sido rodadas:**

| # | mutação | resultado |
|---|---|---|
| 1 | `delta = takerBuy − volume` (fator 2 removido) | ✅ **9 testes** reprovam |
| 2 | remove a guarda `0 ≤ takerBuy ≤ volume` | ✅ **3 testes** reprovam |
| 3 | ⚠️ remove o *binding* por argumento default contra late binding | ⛔ **SOBREVIVEU — 0 teste** |
| 3b | `bucket_end` içado para o bar mais novo | ✅ **5 testes** reprovam |
| 4 | ⚠️ `n_published` conta LINHAS em vez de bars | ⛔ **SOBREVIVEU — 0 teste** |
| 4' | a mesma, depois do teste novo | ✅ `test_n_published_counts_bars_not_rows…` reprova |
| 5 | linha de CVD não servida pelo catálogo | ✅ **6 testes** reprovam |
| 6 | `verified_by` divergente | ✅ `test_the_verified_by_of_this_row_has_exactly_one_home` |
| 7 | `reconstructed_from="aggtrade_q"` sem `published_error` | ✅ **17 erros de coleta** (`D6.9`) |
| 8 | `import urllib.request` em `kline_cvd.py` | ✅ `test_the_cvd_mapping_reaches_no_transport_at_all` |
| 9 | linha de CVD nunca emitida pelo writer | ✅ **15 testes** reprovam |

**Os dois sobreviventes, e o que foi feito:**

- **`#3`:** o código de produção prendia `bucket_end` como argumento default de um closure
  "contra late binding". **Não havia late binding**: o closure era chamado na mesma iteração e
  lia o valor corrente. A prosa do módulo E do teste afirmavam um falsificador **que nunca tinha
  sido rodado**. ⇒ closure removido (laço sobre pares `(series_key_id, value_raw)`), e as duas
  docstrings agora dizem o que a mutação mostrou, em vez da afirmação falsa.
- **`#4`:** `n_published` nunca chega ao `IngestRun` — só ao registro de log, e **nada lia o
  registro de log**. A invariante escrita em `_KlinesPassTotals` ("`n_returned − n_published` é o
  tamanho do corte `RS-3.4`") era prosa não executada. ⇒ teste novo
  `test_n_published_counts_bars_not_rows_so_the_cut_size_stays_readable`, por `caplog`, que
  reprova em `return len(rows)`.

## 8. Arquivos alterados

**Produção (`sentimento`):**
- `backend/src/modules/sentimento/domain/kline_cvd.py` *(new)* — a aritmética e a invariante
- `backend/src/modules/sentimento/domain/cvd_source_catalog.py` — 4ª entrada + `REGISTERED_CVD_SOURCES` + `KLINE_TAKERBUY_VERIFIED_BY`
- `backend/src/modules/sentimento/use_cases/collector_series_mapping.py` — 2 linhas por bar; `KlineLike` ganha `taker_buy_base_volume`
- `backend/src/modules/sentimento/use_cases/series_catalog.py` — append no fim (11 → 12 por instrumento)
- `backend/src/modules/sentimento/infra/collectors_cli.py` — `n_published` conta **bars**

**Testes:** `test_kline_cvd.py` *(new)*, `test_cvd_source_catalog.py`, `test_collector_klines_mapping.py`,
`test_collectors_cli_klines_collector.py`, `test_collectors_cli_publishes_the_run_id.py`,
`test_series_catalog_use_case.py`, `tests/api/test_series_catalog_route.py`,
`tests/api/test_klines_volume_writer_and_catalog_agree.py`.

**Scripts de medição:** `scripts/cvd-klines-falsifier/{falsify_reconstructed_from,measure_takerbuy_invariant,measure_cvd_vertical}.py` *(new)*.

**Docs:** este gate, `gates/T-02.1-falsificador-reconstructed-from.md`, os dois handoffs, e a
linha `A6` em `PENDENCIAS-PARA-AVALIAR-DEPOIS.md`.

## 9. Uma escolha de forma que vale registrar

`kline_takerbuy` **não** entrou em `build_cvd_source_catalog_entries` junto dos três irmãos, que
é o lugar mais arrumado. Agrupá-lo o **inseriria no índice 3** do catálogo servido, deslocando as
oito linhas seguintes — e a ORDEM de `"entries"` é **forma**, que `RS-1` proíbe esta feature de
mudar. Lista permutada é a falha que **nenhum campo da resposta reporta**. Então ele é
**anexado ao fim** por `list_series_catalog`, exatamente onde `T-01.6` anexou `klines_volume`.
