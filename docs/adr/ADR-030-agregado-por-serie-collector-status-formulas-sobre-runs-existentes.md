# ADR-030 — Agregado por série (`collector-status`): as quatro fórmulas sobre `IngestRecordSource.runs()`, e o que este envelope se recusa a inventar

**Data:** 2026-09-05 · **Status:** proposto pelo `quant-architect` (dono de `sentimento`, `harness policy --key agents`); libera `D3.0` do plano `03` por autorização do owner `[PREMISSA-OWNER: 2026-09-05]` *"já podemos fazer o adr tbm e deixar tudo liberado"* — a ratificação do **texto** continua sendo dele, e silêncio não é aprovação · **SPEC:** [`SPEC-003`](../specs/SPEC-003-camada-de-leitura-do-painel.md) §3.6 (linha *"agregado por série"*, `I-10`), §8 `[Q7]` · **PRD:** [`PRD-003`](../specs/PRD-003-camada-de-leitura-do-painel.md) `US-10`, `CA-F3-2`
**Fase:** `F3` do plano [`03_recursos_baratos.md`](../plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md), item 3.5; task `T-03.1` (escreve) → `T-03.6` (constrói) · **Componentes:** `sentimento` (forma e fórmulas) · `infra` (rota) · `web` (parser, fora desta ADR)
**Insumos lidos em `master@c8e7193`:** `lacunas-leitura-api-painel.md` §1 · `REVISAO-FB-frontend-architect.md` §4/§4.1 · `frontend/src/features/s1-console/domain.ts:59-79,145-189` · `ingest-health-query.ts:524-566` · `backend/src/modules/sentimento/domain/ingest_record.py` · `use_cases/ingest_health.py:24-29` · `ADR-008/D3` · `ADR-006` · `ADR-014/D2`

## Contexto — o S1 mostra "status" lido de UM run, e o backend não tem onde calcular outro

O console S1 (`CollectorRow`, `domain.ts:180-189`) pede por série: `status` (4 valores), `uptimePercent`, `resilience` (4 variantes), `retention` (6 variantes), `statusDetail`. O que existe do lado servidor é `ingest_health_query` (`ADR-008/D3`): **um registro por execução**, 15 colunas, `sha256` sobre a projeção. O front hoje deriva a linha do **último run** por `(source, endpoint)`: `status` só de `verdict`, `uptimePercent = n_written/n_expected` daquele run, `resilience: not_scored`, `retention: unmeasured` (`ingest-health-query.ts:524-547`) — e o `frontend-architect` já disse que isso *"não é uptime"* (`REVISAO-FB` §4, linha 1).

Três fatos medidos fixam o espaço de decisão:

1. **A porta já carrega o que a fórmula precisa, e a projeção não.** `IngestRun` (`ingest_record.py:99-116`) tem `started_at`/`ended_at` — colunas **da tabela**, deliberadamente **não projetadas** nas 15 (`ingest_record.py:18-19`: *"TABLE only: started_at, ended_at"*). O use case lê `runs()` e vê os timestamps; o envelope de `/ingest-health` não muda em um byte. É por isso que **não precisa de método novo** na porta.
2. **Hoje há UM escritor de `md.ingest_run` em produção.** `grep -rn 'IngestRun(' backend/src --include='*.py' | wc -l` → **2**, e um é o próprio store (`sqlite_ingest_record_store.py:242`); o outro é `persist_ntp_skew_run.py:66` (`source="binance-futures"`, `endpoint="/fapi/v1/time"`, `n_expected=1`) `[MEDIDO 2026-09-05 em c8e7193]`. A captura Coinalyze escreve na **quarentena**, não em `md.ingest_run`. ⇒ o universo de linhas deste envelope em produção é, hoje, **1 série**. A ADR decide a forma para N; o número de linhas é o que o store tiver.
3. **`janela_de_perda` continua `null` e é coluna de contrato** (`ingest_record.py:81-91`, `CLAUDE.md` linha 11). Nenhuma fórmula daqui a preenche, renomeia ou recalcula — `NG-9`.

**Fronteira de idioma:** os 6 nomes de campo de `CollectorRow` vão no fio **como o TS já publicou** (`uptimePercent`, `statusDetail` em camelCase — são o contrato do parser); os campos de proveniência que esta ADR acrescenta usam **os nomes das colunas do store** (`run_id`, `ended_at`, `verdict`, snake_case) — para que a conferência em SQL leia o mesmo nome que o JSON.

## Decisão

### D0 · Universo, chave e ordem — as premissas que toda fórmula abaixo assume

- **Série** = par `(source, endpoint)`; `series = f"{source} · {endpoint}"` (mesma composição que `ingest-health-query.ts:534`). É a única identidade que `runs()` oferece; `window` é `TEXT` opaco (o probe grava `f"{started_at}/{ended_at}"`, `persist_ntp_skew_run.py:70`) e **não é parseado**.
- **`R(s)`** = todos os runs da série, na ordem do store: `ORDER BY started_at, run_id` (`sqlite_ingest_record_store.py:146`, invariante testada). **`last(s)`** = último elemento. Nenhuma ordenação própria é inventada.
- **`now`** é **parâmetro** do use case (UTC, injetado pela rota; nos testes, fixo). Vai no envelope como `as_of`, porque sem ele nenhum número abaixo é reproduzível.
- `ended_at` é ISO-8601 com `Z` (`"2026-09-01T23:05:25.356Z"`, formato que os testes já pinam). **Timestamp que não parseia ⇒ o use case levanta `MalformedRunTimestampError`** — mesma doutrina de `UnknownVerdictError`: recusar em vez de esconder.
- Linhas do envelope em ordem `(source, endpoint)` ascendente. Ordenar por severidade é do front (`orderRowsBySeverity`, `domain.ts:196`).

### D1 · `status` — o último `verdict` E a idade do último run, calibrada pela própria série

```
period(s)      = mediana de Δ(ended_at) entre runs consecutivos dos últimos min(|R|, 20) runs   (exige |R| >= 3)
stale_after(s) = K × period(s),   K = 3
age(s)         = now − ended_at(last(s))

status(s) = PARADO   se verdict(last) == "REJECTED"                                   (regra A)
          | PARADO   se |R| >= 3  e  age(s) > stale_after(s)                           (regra B)
          | ATIVO    caso contrário
```

- **Regra A** herda a única leitura que o front já fazia (`statusFromVerdict`, `:524`) e a invariante `ADR-014/I-1` (`REJECTED ⟹ n_written = 0`): a última tentativa não escreveu nada.
- **Regra B é o que `US-10` pede** — status que não venha *"do último run"*. O limiar **não é constante global** e **não deriva da cadência do provedor** (`ADR-006` recusou `k × interval` porque a defasagem de publicação é 361× a cadência). Ele deriva da **cadência observada da própria série de runs**, que é agenda **nossa**, medida no store. Com `|R| < 3` a mediana não existe ⇒ **staleness não é julgado**, e o envelope diz isso em `liveness.kind = "not_judged"` em vez de fingir `ATIVO` por omissão.
- `K = 3` é **`[INFERRED: opinião do quant-architect; nenhuma medição de jitter de agenda existe porque nenhum coletor está agendado — ADR-027 D1]`**. O falsificador `F-3` é o que o mede quando houver dado.
- **`ARQUIVO` e `PENDENTE` NÃO são emitidos por este envelope.** Exigem insumos fora de `md.ingest_run` (contagem de objetos do dump S3; profundidade da fila ETL em Redis, `ADR-027/D2`). O tipo TS continua com 4 valores; o fio, em `F3`, usa **2**. Ver §*O que NÃO julgo*.
- `statusDetail = null` sempre, no backend. A microcopy pt-BR (linha 8 da tabela de idioma) é composta pelo front a partir de `liveness`/`age_s`, não pelo servidor.

**Exemplo numérico** (probe NTP, `n_expected = 1`): 24 runs nas últimas 24 h, Δ medianos de 3.600 s ⇒ `period = 3600`, `stale_after = 10.800 s`. (i) `last` = `ACCEPTED`, `ended_at` há 2.400 s ⇒ **ATIVO**. (ii) mesma série, `last` há 14.400 s ⇒ 14.400 > 10.800 ⇒ **PARADO** por B. (iii) série com 2 runs ⇒ `liveness = {"kind":"not_judged","n_runs":2}`, status só por A.

### D2 · `uptimePercent` — completude de escrita na janela trailing de 24 h, não a razão do último run

```
W(s)              = { r ∈ R(s) : now − 24h < ended_at(r) <= now }
uptimePercent(s)  = 100 × Σ_{r∈W} n_written(r) / Σ_{r∈W} n_expected(r)     se Σ n_expected > 0
                  | null                                                     caso contrário
```

- É a **mesma grandeza** que o front já calculava para um run (`:540`), estendida à janela — continuidade de semântica, não uma métrica nova com o mesmo nome. `REJECTED` entra com `n_written = 0` (`I-1`) e puxa o número para baixo sem que a fórmula leia `verdict`; `ACCEPTED_WITH_WARNING` entra com o parcial que gravou. É **completude do que foi pedido**, não fração de tempo de processo — o nome `uptimePercent` é herdado do TS e **não** é renomeado aqui (renomear é `web`).
- `null` quando **nada foi esperado** na janela: série sem run nas 24 h, ou série de tick, que *"não tem `n_expected`"* (`SPEC-001` §6, linha 534). **`PARADO` não zera nem anula o número**: um coletor parado há 4 h com 95,8 % nas 24 h está dizendo *quando* parou; anular esconderia isso.
- **Não há clamp.** `Σ n_written > Σ n_expected` produz `> 100` e é **defeito do store exposto**, não arredondado.
- `24h` é `[INFERRED: horizonte que `D7.15` já usa — "desconexão de 24 h aparece como rotina"]`; vai no envelope como `window_hours`, para que trocar o horizonte seja 1 constante e o leitor saiba qual foi usado.

**Exemplo numérico:** 24 runs em `W`, 23 `ACCEPTED` (1/1) e 1 `REJECTED` (0/1) ⇒ `100 × 23/24 = 95,83`. Só o último run: `100 × 1/1 = 100` — a diferença entre 95,83 e 100 é exatamente o que `US-10` quer ver.

### D3 · `retention` — `unmeasured`, ou `not_applicable` quando parado; nenhuma janela nasce de `runs()`

```
retention(s) = {"kind":"not_applicable"}   se status(s) == PARADO
             | {"kind":"unmeasured"}       caso contrário
```

`D7.12` define `janela_de_perda = pontos × intervalo` **por série**, onde `pontos` é quanto o **provedor retém** (Coinalyze OI 1 min: 2.206 pts ⇒ ~1,5 d). Isso é propriedade do provedor, medida por sonda contra a API dele — **não está em nenhuma coluna de `md.ingest_run`** e o catálogo do backend (`series_catalog.py`) não tem campo de retenção e é chaveado por `SeriesKey`, não por `(source, endpoint)`: o `JOIN` não existe. Emitir `computed_uniform` copiando os números do plano seria publicar como dado uma medição de agosto congelada em constante — o *"número seco"* que `D7.14` proíbe. `computeUniformWindowDays` fica onde está (`domain.ts`, só teste, `REVISAO-FB` §4.1 item 3).

**O que faz a linha virar `computed_uniform`/`measured_sparse`/`declared_constant`:** uma medição de retenção **por série, persistida, com `measured_at` e comando** — sonda de `sentimento`, fora de `F3` (*recursos baratos*). Até lá, `unmeasured` é o valor **correto**, não um placeholder.

### D4 · `resilience` — `not_scored`, ou `unavailable` quando parado; o `~4,7×` do plano não vira dado

```
resilience(s) = {"kind":"unavailable"}   se status(s) == PARADO
              | {"kind":"not_scored"}    caso contrário
```

`D7.13` declara **~4,7×** como custo de trilhar 5 min em vez de 1 min — constante de **plano**, sobre uma escolha de desenho, não medição por série. O gate `ux-ui-mastery` já apontou como ambíguo o mesmo `4,7×` em toda linha `T1m` (`domain.ts:134-140`, *"achado 4"*). Um backend que o ecoasse lavaria constante de plano como dado de série. Flip para `slo_multiplier` exige `resilienceMultiplierFromWindows(days1m, days5m)` sobre **duas retenções medidas da mesma série** — depende de `D3` sair de `unmeasured`. `external_sla` exige saber que a série é dump S3 — não é inferível de `(source, endpoint)` sem catálogo.

### D5 · Rota, envelope e campos no fio

- Rota: **`GET {API_PREFIX}/collector-status`** (`I-10` mantido). Nome da query: **`collector_status`**. Sem paginação e sem parâmetro de janela nesta ADR (`[Q5]` fica aberta; `window_hours` é constante do servidor).
- Envelope (família `ADR-005/D6.1`; parser permissivo em campo desconhecido, estrito em ausente, `ADR-019/D2`):

```json
{"query":"collector_status","as_of":"2026-09-05T18:00:00.000Z","window_hours":24,"n_rows":1,
 "rows":[{
   "series":"binance-futures · /fapi/v1/time","source":"binance-futures","endpoint":"/fapi/v1/time",
   "status":"ATIVO","uptimePercent":95.83,"statusDetail":null,
   "retention":{"kind":"unmeasured"},"resilience":{"kind":"not_scored"},
   "n_runs_total":31,"n_runs_in_window":24,
   "last_run_id":"…","last_verdict":"ACCEPTED","last_ended_at":"2026-09-05T17:20:00.000Z","age_s":2400,
   "liveness":{"kind":"judged","period_s":3600,"stale_after_s":10800}
 }]}
```

Os 6 primeiros campos de cada linha são `CollectorRow` **verbatim**; os demais são **os insumos das fórmulas**, para que a conferência não dependa de confiar no código. `uptimePercent` com 2 decimais, ponto decimal (`SPEC-001` §3.8). `weight_used` **não entra**: é cota por minuto do provedor (`x-mbx-used-weight-1m`), somá-la entre runs de endpoints distintos não tem semântica; a leitura de cota é de `quota_ramp_cli`.

## Alternativas recusadas

| alternativa | por que não |
|---|---|
| **acrescentar `started_at`/`ended_at` às 15 colunas** e deixar o front agregar | move o `sha256` de todo relatório emitido (`ADR-008/DoD-2`); é ato de `ADR-008/D3`, e `F-D6-3` prescreve exatamente o envelope separado quando *"a projeção não expressa"* (`REVISAO-FB` §4.1) |
| **`status` só por `verdict`** (o que o front faz hoje) | coletor morto há 3 dias com último `ACCEPTED` lê `ATIVO` — otimismo por omissão; é o que `US-10` existe para corrigir |
| **limiar de staleness constante global** (ex.: 10 min) | `ADR-006` mediu essa classe de constante virando default por gravidade; uma constante não serve ao probe horário e ao stream ao mesmo tempo |
| **limiar derivado da cadência nativa da série** (`k × interval` do catálogo) | recusado por `ADR-006` com medição (361× otimista); e o catálogo não faz `JOIN` com `(source, endpoint)` |
| **tabela declarada de agendas por série** | nenhum coletor está agendado (`ADR-027`: *"not wired to any scheduler"*); a tabela nasceria vazia ou inventada |
| **`uptimePercent` = fração de runs não-`REJECTED`** | ignora o parcial de `ACCEPTED_WITH_WARNING` (713 h de gap num run aceito, `ADR-014` linha 260, contariam como 100 %) |
| **`retention` com os pontos de `D7.12` como constante** | medição de uma data, publicada sem `measured_at`, num campo cujo nome diz *computed*; `D7.14` proíbe |
| **ecoar `4,7×` em `resilience`** | constante de plano como dado de série; o gate de UX já flagrou a ambiguidade |
| **usar `max_staleness_ms` do catálogo como limiar** | é validade de observação para `LOCF`, não vitalidade de coletor; e `ADR-006/D1` diz que esse nome não deveria existir — `grep -rn max_staleness_ms backend/src \| wc -l` → **29** `[MEDIDO 2026-09-05]`, divergência **registrada aqui, não resolvida** (dona: `ADR-006`) |

## Falsificadores — um por fórmula, e como o owner confere sem confiar em mim

Store: `INGEST_HEALTH_STORE_PATH` (`src/main/__init__.py:38`); tabela `md_ingest_run`.

| # | fórmula | o que a derruba | como conferir |
|---|---|---|---|
| **F-1** | `D1/A` | linha com `last_verdict == "REJECTED"` e `status == "ATIVO"` | `SELECT source,endpoint,verdict FROM md_ingest_run ORDER BY started_at,run_id` — o último por par, contra o JSON |
| **F-2** | `D1/B` | `liveness.kind == "judged"` e `age_s > stale_after_s` e `status == "ATIVO"` | aritmética sobre os três campos da própria linha |
| **F-3** | `K = 3` | numa série **sabidamente saudável**, `max(Δ)/mediana(Δ)` dos últimos 20 runs ≥ 3 (⇒ falso `PARADO`) — ou um coletor **morto por teste** ficar `ATIVO` após `3 × period` | `python3 -c` sobre `SELECT ended_at … ORDER BY started_at,run_id` computando Δ; se disparar, `K` muda **com esse número**, não por gosto |
| **F-4** | `D1` fechamento | `grep -rnE '"ARQUIVO"\|"PENDENTE"' backend/src` → **≠ 0** em `F3` | o backend inventou um status sem insumo |
| **F-5** | `D2` | `uptimePercent` ≠ `SELECT 100.0*SUM(n_written)/SUM(n_expected) FROM md_ingest_run WHERE source=? AND endpoint=? AND ended_at > ? AND ended_at <= ?` com `?` = `as_of − 24h`, `as_of` do envelope | 1 query, 2 decimais |
| **F-6** | `D2` | com ≥ 2 runs na janela de razões distintas, o valor **igualar** `n_written/n_expected` do último run | prova que voltou a ser *"do último run"* |
| **F-7** | `D3` | `grep -rnE 'computed_uniform\|measured_sparse\|declared_constant' backend/src` → **≠ 0** sem tabela de retenção medida com `measured_at` | janela publicada sem medição |
| **F-8** | `D4` | `grep -rnE 'slo_multiplier\|4\.7' backend/src/modules/sentimento` → **≠ 0** | constante de plano virou dado |
| **F-9** | `NG-9` | `sha256` do corpo de `/ingest-health` mudar com a rota nova sobre o mesmo store (`F-D6-2`, `D3.3` do plano) | a ADR tocou o que prometeu não tocar |
| **F-10** | `D0` | um `ended_at` não-ISO no store produzir linha em vez de erro | `MalformedRunTimestampError` ausente ⇒ a ADR é decorativa no mesmo sentido de `ADR-006` §Falsificador |

## O que esta ADR NÃO julga — com dono

| item | por que não daqui | dono |
|---|---|---|
| **`ARQUIVO`/`PENDENTE`** — insumos (objetos S3, fila Redis) e quem os escreve em `md.ingest_run` | fora de `runs()`; topologia de processos é `ADR-027` | `infra-architect` (fonte) + `ADR-027` (processo) |
| **medição de retenção por série** (a sonda que tira `D3` de `unmeasured`) | é coleta nova, não leitura; `F3` é *recursos baratos* | `quant-architect`, task futura de `sentimento`, fora de `SPEC-003` |
| **paginação/teto de linhas** | `[Q5]`, explícito na task | `quant-architect` + owner |
| **renomear `uptimePercent`** para o que ele mede (completude) | é `web`; parser e tipo são do `frontend-architect` | `frontend-architect` |
| **microcopy de `liveness`/`age_s`** na tela | linha 8 da tabela de idioma; gate `ux-ui-mastery` | `ui-designer` + gate |
| **`max_staleness_ms` no catálogo × `ADR-006/D1`** | divergência medida (29 ocorrências), não é desta feature | `ADR-006` |
| **cadência real dos coletores** (que validaria `K`) | não há agendamento em produção | `ADR-027` / owner |
| **se `24h` é o horizonte certo** | `[INFERRED]` de `D7.15`; nenhum operador mediu | owner, ao olhar a tela |

## Consequências

- `T-03.6` constrói: `use_cases/collector_status.py` (função pura `collector_status_query(source: IngestRecordSource, now: datetime) -> CollectorStatusReport`), rota `GET {API_PREFIX}/collector-status`, DI em `dependencies.py`; `to_envelope()` e as 15 colunas **intocados**; pytest com fixture de runs cobrindo (i)(ii)(iii) de `D1` e o exemplo de `D2`.
- Em produção, hoje, o S1 mostra **1 linha** (probe NTP) — e é o número honesto. Cada escritor novo de `md.ingest_run` acrescenta a sua sem código na leitura.
- `retention`/`resilience` saem `unmeasured`/`not_scored` em toda linha ativa: a tela **perde** os `1,5 d`/`7,0 d`/`4,7×` das fixtures — que eram sintéticos (`RN-3`). O que aparece é o que foi medido, e isso é a tese deste repositório.
- `K = 3` e `24h` são os dois parâmetros de opinião desta ADR; ambos estão no envelope (`stale_after_s`, `window_hours`), e `F-3` diz como o primeiro muda com número.
