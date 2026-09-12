# Pendências — avaliar DEPOIS de tudo no ar

`[PREMISSA-OWNER: 2026-09-12]` — literal: *"vamos registrar as pendencias q depois de tudo no ar
vamos avaliar cada item"*.

⛔ **Nada aqui bloqueia as fases `02`–`05`.** Esta lista existe para que nenhum item seja perdido
**nem** vire motivo de descida recursiva antes das 5 métricas estarem fluindo (`D17`).
Cada item traz o endereço e o comando que o reproduz — quem for avaliar não deve ter de redescobrir.

## A · Decisões de contrato esperando o owner

| # | item | endereço | por que não pode ser decidido por agente |
|---|---|---|---|
| A1 | os **4 campos** do catálogo `premiumIndex` (`native_grid`, `max_staleness_ms`, `price_use`, `verified_by`) | [`OPCOES-CATALOGO-PREMIUM-INDEX.md`](OPCOES-CATALOGO-PREMIUM-INDEX.md) | `verified_by` entra em `series_key_id`; a janela é o `TRUNCATE` de `D15` |
| A2 | `E3` — `ADR-030/F-5` morto pela emenda `D12` | [`OPCOES-E1-E5.md`](OPCOES-E1-E5.md) §E3 | marcar ADR como SUPERSEDED é ato de quem a governa |
| A3 | `E4` — duas superfícies calculam `uptimePercent`, e uma **não pode** calcular a nova | `OPCOES-E1-E5.md` §E4 | escolher qual superfície mente é decisão de produto |
| A4 | `E5` — universo do `DoD-4` (`n_written` × `count(*)`) | `OPCOES-E1-E5.md` §E5 | ⚠️ a premissa original **não se reproduz**; a divergência real é premiumIndex com 1.797 de 5.050 runs nunca fechados |
| A6 | **8,5% dos buckets divergem na ATRIBUIÇÃO DE BORDA** entre o CVD de `klines` e o de `aggTrade` — `[MEDIDO 2026-09-12, T-02.1: 4.320 buckets BTCUSDT/3 dias, 276 corridas divergentes, ZERO com resíduo, total diário idêntico ao milésimo de BTC]` | `gates/T-02.1-falsificador-reconstructed-from.md` §6 | **não é erro de reconstrução** (nada a reconstruir — o falsificador provou leitura direta) e **não vira `published_error`**. É propriedade real da série: quem comparar as duas fontes bucket a bucket vai ver, e é esperado. Registrado para não ser redescoberto como defeito |
| A5 | `D16` **suspenso** — `p99` de klines (60.936 ms) excede a grade | [`OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md`](OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md) | depende de **remedir** com o escalonador consertado; amostra atual é insuficiente para fixar contrato |

## B · Defeitos localizados, não consertados

| # | item | endereço exato | risco |
|---|---|---|---|
| B1 | `interval` da `SeriesKey` vem de **variável de ambiente** | `use_cases/collector_series_mapping.py:255-260`, fechando sobre `config.premium_index_cycle_interval_s` | mudar `PREMIUM_INDEX_CYCLE_INTERVAL_S` **re-órfã 8 séries sem PR**. klines é imune: `domain/klines_volume_catalog.py:121` crava `interval="1m"` |
| B2 | `build_series_row` tem **0 chamador** | — | a invariante de `SPEC-001` §3.2 nunca é aplicada ⇒ **424 de 34.760** linhas com `available_at < bucket_end` (mín. **−100 ms**) |
| B3 | `_PUBLISH_FAILURE_EXCEPTIONS` **nunca conferida** contra o que o bloco levanta | `infra/collectors_cli.py:581-611` vs `:640` | `OverflowError` escapava e matava a thread **sem** `failure_event.set()` ⇒ processo vivo, `rc=0`, coletor morto. Foi consertado **um** caso; ninguém contou os outros. ✅ **FECHADO pela wave de integração (2026-09-12)**: contar os outros deixou de ser necessário — `collectors_cli._supervised` envolve as **4** threads e captura `BaseException`, então a CLASSE inteira ("thread morre por exceção não listada") passou a derrubar o processo com `rc != 0`. O caso real que a motivou (`psycopg.OperationalError`, 18 h 45 min de produção muda) está pinado em `test_collectors_cli_run_exit_code_subprocess.py::test_a_thread_that_dies_unhandled_takes_the_whole_process_down`, com mutante reprovando. ⚠️ O que **continua aberto** é a outra metade de `B3`: quais exceções devem fechar o `IngestRun` como `REJECTED` **com veredito registrado** (`_PUBLISH_FAILURE_EXCEPTIONS`) em vez de cair na rede de segurança — a rede derruba o processo, mas não grava run |
| B4 | `_run_premium_index_collector` tem a **mesma** deriva de escalonador | `infra/collectors_cli.py:636` | medida: **60,441 s/ciclo** contra 60,0 declarados (`34.752÷8=4.344` ciclos em `262.496 s`). Não aparece na coluna porque `bucket_end = source_time` torna a fase **algebricamente ausente** |
| B5 | `page.tsx:239` chama `volumeSlotsFromHistoryRows` **fora** de try/catch | `frontend/src/app/symbol/page.tsx:239` | `CA-F2-3`; lança via `view-model.ts:184,191` |
| B6 | `S3Inspector.tsx:60-70` descreve um seletor de tema que **não existe mais** | — | prosa de produção que virou mentira após `ff15921` |
| B7 | `inf` na cadência — falsificador **[NÃO MEDIDO]** | PR #217 | o conserto está aplicado e 42 testes passam, mas o mutante nunca foi rodado |
| B8 | `gates/O4-correcoes-pos-qa-builder.md:130` ainda diz *"falha na direção segura"* | — | frase **provada falsa** pelo commit seguinte |
| B9 | `deploy/compose.yml:160` sem a restrição de boot de `PREMIUM_INDEX_CYCLE_INTERVAL_S` | — | o irmão `KLINES_CYCLE_OFFSET_S` documenta a dele no mesmo bloco; a convenção existe e esta linha não a seguiu |
| B10 | `binance_server_time_probe.py:89` afirma que os headers `x-mbx-*` são lidos ao vivo **em `/futures/data/openInterestHist`** | `infra/binance_server_time_probe.py:89` | prosa **provada falsa** por `T-03.2` `[MEDIDO 2026-09-12: n=1 resposta, ZERO header casando `weight`/`used`; 60 chamadas consecutivas sem 429/418]`. Não corrigida na fase `03` — fora do escopo, e o arquivo é probe |
| B11 | `label_shift=300_000` na identidade de `sum_open_interest` (Binance) é herdado da medição da **Coinalyze** | `domain/open_interest_catalog.py:62-68` | `T-03.2` mediu que o ponto rotulado `T` é publicado **6.231 ms depois de `T`** e fica estável por 240 s `[MEDIDO 2026-09-12]` ⇒ `T` é o INSTANTE da leitura, não o início de um bucket agregado. O coletor grava `bucket_end = T` (correto e sem lookahead), mas **o termo de identidade não foi reaberto**: reabrir RE-IDENTIFICA a série (`series_key_id` novo, migração, não conserto). Dono: `ADR-036`/`SPEC-001` §2.1 |
| B12 | a API mantém **UMA conexão psycopg de vida longa, sem reconexão** | `infra/postgres_series_window_reader.py:136` | `[MEDIDO 2026-09-12: `/api/v1/series-history` devolvia **HTTP 500 `psycopg.OperationalError: the connection is closed`** para TODA série, inclusive `klines_volume`, até `docker restart deploy-api-1`]`. Não é defeito desta fase e não foi consertado aqui — mas **qualquer DoD que leia essa rota mede zero sem aviso** enquanto durar |
| B13 | a API **vaza sessão `idle in transaction`** — 2 sessões, **72 min e 35 min, desde o boot** | `gates/ACHADO-API-VAZA-IDLE-IN-TRANSACTION.md`; hipótese aponta para o mesmo objeto de `B12` (`infra/postgres_series_window_reader.py:136`) | `[DOC: WAVE-04-INTEGRACAO.md:53-55]` travou o `ALTER TABLE` de boot do coletor e, atrás dele, **congelou `md.ingest_run` para leitura**. Não devolve erro — devolve **espera**, então o sintoma lê como "banco lento". Registrado pela wave de integração, **não consertado** (é camada de API, fora do DoD da wave; o handoff diz *"o conserto pode ser task própria"*). O doc traz os `pg_stat_activity` prontos, o falsificador (`application_name`) e o portão que o conserto tem de trazer |

## C · Portões que pararam de medir

| # | item | comando que mostra | efeito |
|---|---|---|---|
| C1 | **nenhuma suíte de front está em portão** | `grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push` → **0 linhas** | 189+156+111 testes rodam só quando alguém pede. Custo de ligar: **42 s**. ⚠️ ordem obrigatória — ligar `test:s1` hoje pinta `verify` de vermelho por `data/md` ausente |
| C2 | piso de cobertura **por camada** não é medido | `test.sh` só o roda **depois** da suíte, que reprova no teste do `D16` | desconhecido enquanto o vermelho declarado durar |
| C3 | suíte levou **532 s** contra os ~37,5 s da doutrina | — | 14×, **sem explicação medida**. Não causado por nenhum commit identificado |
| C4 | `test:s1` com **8 falhas ambientais** | `store_parent_missing: data/md` | idêntico em `master`; `data/md` não existe nem no checkout principal |
| C5 | `make e2e` REPROVA por um literal de contagem que envelheceu — `04-interacoes.spec.ts:51` exige **5** linhas para o filtro `sum_open_interest` e o catálogo serve **20** `[MEDIDO 2026-09-12: `make e2e` → `Expected: 5 · Received: 20`, `1 failed`; universo: `GET /series-catalog` com `n_entries=48` = 12 métricas × 4 símbolos]` | `frontend/e2e/04-interacoes.spec.ts:51` | **Pré-existente e NÃO causado pela fase `02`**, e a aritmética prova: as 4 linhas que `T-02.4` acrescentou são `cvd_source` e nenhuma casa o texto `sum_open_interest` — `44` entradas já davam `5×4=20`. O literal foi escrito quando o piloto tinha **1** símbolo; `D4` o levou a 4. ⚠️ Enquanto durar, o portão canônico `make e2e` fica vermelho por esta linha e **esconde qualquer regressão nova atrás dela**. O conserto é de uma linha e o helper já existe: `helpers.ts::seriesCatalogEntryCount()` foi escrito exatamente contra esta classe (*"um literal aqui é uma falha falsa agendada"*). Não consertado aqui por `D17` (largura antes de profundidade) e para não colidir com a worktree que edita a suíte de `01` |

## D · Higiene

| # | item |
|---|---|
| D1 | **61 branches locais** recusadas por `git branch -d` (provavelmente squash-merged) — lista em `/tmp/claude-1002/branches-recusadas.txt` |
| D2 | worktrees de agente acumuladas em `.claude/worktrees/` ⚠️ **conferir commit antes de remover**, e conferir se algum processo aponta para o caminho (produção já foi ancorada numa worktree apagada) |
| D3 | `.env.example` é **rastreado** (`git ls-files` → 1). Se valor real foi commitado, é **rotação de segredo**, não `git revert` |
| D4 | container órfão `t-01-1-series-window-reader-test-*` |

## E · O que NÃO está aqui, e por quê

`E1`/`E2` (backfill invisível ao `as_of`; `FLOW` com atraso ≥ grade) **não** são pendência: são
**caminho crítico** de `D15`/`D16`, a executar **uma vez só sobre as 5 métricas** depois da
largura (`D17`), nunca 4× em descida.
