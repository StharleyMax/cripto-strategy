# Fase 07 — Aquisição em regime + S1 + `universe_at`

**Epic:** `CST-5` (F3) · **Componentes alvo: `sentimento`** (aquisição, universo) e **`web`** (S1) · **Gate: `Q3`, `Q18`**
**Depende de:** `06`. **Parte dela pode SUBIR de prioridade:** o paginador, o tratamento de `-1130` e a paginação do S3 são pré-requisito de **qualquer** backfill grande, inclusive o de `03`.

## Itens

| # | item | requisito | componente |
|---|---|---|---|
| 7.1 | **Paginação por janela `[startTime, endTime]` fechada e enumerada A PRIORI** — nunca por cursor | `CA-F3-2`, `SPEC-001` §5.7 | `sentimento` |
| 7.2 | `-1130` classificado como **fim de histórico** (30 dias), não falha transitória | `CA-F3-1` | `sentimento` |
| 7.3 | **Survivorship na borda de ingestão**: símbolo ausente do `exchangeInfo` corrente → `ACCEPTED_WITH_WARNING` + `md.ingest_gap`. **NUNCA `REJECTED`** | `CA-F3-14` | `sentimento` |
| 7.4 | Listagem S3 paginando por `NextContinuationToken` | `CA-F3-5` | `sentimento` |
| 7.5 | ETL com dedupe por **hash de conteúdo** (byte-estável verificado) | `CA-F3-*` | `sentimento` |
| 7.6 | **Redis Streams + consumer group** para todo consumidor com estado — **nunca Pub/Sub** | `CA-F3-8`, `ADR-009`/D2 | `sentimento` |
| 7.7 | **Escritor único** consumindo a fila; `CA-F3-12` e `CA-F4-25` vivem nele | `ADR-002`/D5 | `sentimento` |
| 7.8 | Particionamento dimensionado contra a **vazão medida** | `CA-F3-7` | `sentimento` |
| 7.9 | Broker de cota com jitter e circuit breaker, **contagem local** — dois dos três baldes são **cegos** | `CA-F3-9` | `sentimento` |
| 7.10 | `universe_at(ts, filtro)` com **`universe_source` inadmissível POR TIPO** no caminho de decisão, devolvendo a **união das duas testemunhas** com a divergência marcada | `CA-F3-4`, `SPEC-001` §3.7 | `sentimento` |
| 7.11 | `instrument_alias` como **YAML versionado com `evidence_url` obrigatório** — **sem tela** | `Q12` | `sentimento` |
| 7.12 | **`clock_skew_tolerance_ms` CALIBRADO** sobre a distribuição que `03` acumulou | `CA-F3-13` | `sentimento` |
| 7.13 | **S1 console**: `janela_de_perda`, fila de ETL, orçamento aritmético, GB/dia | `SPEC-001` §6 | `web` |
| 7.14 | S1 lê pela **consulta nomeada `ingest_health_query`** — a mesma de `02` | `ADR-008`/D3 | `web` |
| 7.15 | **S5 embutido**: seletor por `universe_at`, badge de delisting de `deliveryDate`, `universe_source` carimbado em toda saída | `SPEC-001` §6 | `web` |

## DoD — comando e universo

| # | critério | ação | universo esperado |
|---|---|---|---|
| **D7.1** | fim de histórico é fim de histórico | `startTime` de **60 dias atrás** | `verdict='REJECTED'`, `api_code=-1130`, **zero linhas gravadas** |
| **D7.2** | **e não se generaliza** | ingerir dump de **`MATICUSDT`** (existe no S3, **não** existe no `exchangeInfo` de hoje) | **GRAVOU, com aviso.** `ACCEPTED_WITH_WARNING` + `md.ingest_gap`. **109 símbolos históricos são invisíveis hoje** |
| **D7.3** | o paginador não grava dado de hoje com timestamp antigo | replay do caso `startTime` **sozinho** | **reprova, não grava.** Medido: devolve **a cauda de hoje, HTTP 200, sem aviso** — comportamento **NÃO DOCUMENTADO** |
| **D7.4** | invariante permanente do paginador | toda ingestão | **nenhum timestamp gravado fora da janela requisitada** |
| **D7.5** | o limite observado, não o declarado | `limit=501` | devolveu **501 linhas** contra doc de máx 500 ⇒ o teste usa o **observado** |
| **D7.6** | backfill de um dia | 5m | **288 pontos distintos**; de `2026-08-12` → **285 + gap registrado** |
| **D7.7** | universo point-in-time | `universe_at('2025-08-01')` | **inclui `ICXUSDT`** e **exclui `DOSUSDT`** (onboard 2026-08-11) |
| **D7.8** | S3 pagina | listagem | **falha se `IsTruncated=true` sem paginação**. **980 prefixos contra `MaxKeys=1000` ⇒ folga de 20**, com **+28 símbolos em 30 d e +136 em 90 d** |
| **D7.9** | liveness por **contiguidade**, nunca por taxa | matar o stream | detectado por `agg_id` + heartbeat. A média variou **3,66×** entre dois dias (55,6 vs 15,2 msg/s) e **o pico não escala com o volume** (3.468 msg/s num dia com 43% menos trades) |
| **D7.10** | consumidor com estado sobrevive a reinício | reiniciar o acumulador de CVD | **nenhuma mensagem perdida.** Redis Pub/Sub é **at-most-once por doc** (*"the message is forever lost"*) |
| **D7.11** | particionamento dimensionado | vazão de **um único** símbolo | p50 **21** · p95 **204** · p99 **483** · p99.9 **1.251** · máx **3.224** msg/s |
| **D7.12** | **`janela_de_perda` é FÓRMULA, não constante** | por coletor e **por série** | Coinalyze `pontos × intervalo`: OI 1 min **2.206 pts = ~1,5 d** · OI 5 min **~2.000 = ~7,0 d** · liquidação 1 min **3.052 = ~8 d** · `daily` **sem apagamento `[DOC-ONLY]`** · `/futures/data/*` **30 d** · liquidação intraday por stream **imediata** · dump S3 **`re-baixável (retenção NÃO MEDIDA)`**, nunca "infinito" |
| **D7.13** | a escolha do trilho de resiliência vai **escrita** | painel | trilhar 5 min em vez de 1 min multiplica o orçamento do SLO P1 por **~4,7** |
| **D7.14** | **retenção anticorrelacionada com a necessidade** | painel da série de liquidação | escreve **`janela válida no regime atual, não garantida em cascata`** — nunca um número seco. A série é **esparsa**: a janela **encolhe durante uma cascata**, o único regime em que ela importa |
| **D7.15** | reconexão é **normal, não erro** | S1 | desconexão de 24 h aparece como rotina |
| **D7.16** | backfill MODELADO não sobrescreve captura OBSERVADA | tentar sobrescrever | **proibido.** `ReplacingMergeTree(ingested_at)` ou equivalente **destrói o `available_at` real e apaga a variante `nq` de linhas ao vivo, sempre na direção otimista** |
| **D7.17** | a consulta é **UMA** | `sha256` da projeção canônica da saída do CLI **igual** à que alimenta S1; e **um `verdict` INÉDITO** ⇒ **os dois mudam juntos ou os dois reprovam** | `ADR-008`/DoD-3. **≥ 1 run de cada `verdict`, mais 1 valor inédito** |
| **D7.18** | tolerância de skew **calibrada, não adivinhada** | distribuição de `clock_skew_ms` por `ingest_run` que `03` acumulou | **≥ 7 dias de runs** |
| **D7.19** | "re-baixável" é verificado, não presumido | `curl -sI` mensal em prefixo **antigo e recente** | **`aggTrades` e `bookDepth`.** `bookDepth` **não tem prefixo `monthly`** — um ETL que assuma mensal **quebra** |

## Não faz

Não escolhe corretora, não fixa `N` do universo antes da rampa, não dispara ordem. **S1 NÃO é o canal de alarme** — *"coletor parado"* é P1 com orçamento de 24 h e **não pode depender de uma aba aberta**: tela fechada não avisa ninguém (`Q3`). O console é onde se **diagnostica depois de ser avisado**.

## Falsificador da fase

`D7.17` com um `verdict` inédito: **se um consumidor passar e o outro não, existem duas implementações da mesma verdade** — e o teste diz qual.
