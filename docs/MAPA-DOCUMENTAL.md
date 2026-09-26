# MAPA DOCUMENTAL — porta de entrada única de `docs/`

Consolidado em 2026-09-26 sobre `master@48482ea` (9 lotes, 91 documentos). Se o mapa envelhecer, o ledger vence.

---

## §0 Como ler — precedência

Quando dois documentos discordam, vale nesta ordem:

1. **ESTADO** (fase, aprovação, DONE): o **ledger do `harness`**. O cabeçalho de um doc nunca decide estado.
2. **Fala ou escolha literal do owner, a mais recente**: `CLAUDE.md` e `decisoes-do-owner.md` **na seção da pergunta**. O mapa do topo de `decisoes-do-owner.md` (L32-55) está caduco.
3. **ADR mais recente que declara supersessão** (emenda datada > texto original).
4. SPEC → 5. PRD → 6. plano.
7. O **código** decide **FATO** ("o que existe"), nunca **INTENÇÃO**: código divergente de decisão vigente é dívida do código.

"Produção" nos docs = **a stack Docker LOCAL** (`deploy-*`). A VPS ainda não recebeu nada (§1 deploy-infra).

---

## §1 Verdade corrente por tema

### fonte-dado
- Origem (Binance) por padrão; terceiro só se a origem é vetada, inexistente ou perde dado sem volta — `ADR-036:26-30`.
- Volume, OI, L/S, CVD e preço: Binance REST (`/fapi/v1/klines`, `/futures/data/openInterestHist`, `/fapi/v1/openInterest`) — `ADR-036`, `SPEC-009 O-4`.
- Liquidação: Coinalyze `liquidation-history` primária — `ADR-036/D4`. Revoga `!forceOrder@arr` como fonte (`SPEC-001 CL-1`, `PRD-007 DEF-2`).
- Coinalyze: sem OI multi-exchange (`exchange` obrigatório); intraday raso, por contagem de pontos; `daily` é a fonte mais profunda (OI 2.409 d) — `medicao-coinalyze.md:14-56`. Revoga `avaliacao-discovery:73,111`.
- WS de futuros `@aggTrade`/`@arr`: 0 eventos medidos; o REST carrega `nq` — `medicao-ws-aggtrade-nq.md:64-121`.
- Profundidade: klines desde 2019-09-08; `/futures/data` ~30 d; liquidação 1m ~1,5 d — `SPEC-007:714-722`.

### cvd
- CVD por bucket = `2·takerBuyBaseVol[9] − volume[5]` do klines, sem aggTrades — `ADR-036/D5` (2026-09-10), `SPEC-007:161-172`. Revoga CVD por aggTrade (`proposta-discovery:14`; `ADR-001:27` no core) e a D5 original (Coinalyze).
- `cvd_delta` é fato; `cvd_cum(anchor)` é view com âncora obrigatória — `PRD-001:371-385`, `plataforma-superficies:115`.
- `quantity_field ∈ {q,nq,NA}` na `SeriesKey`; `nq` só a partir da 1ª captura ao vivo, sem emenda com `q` — `ADR-001` (rege só séries de aggTrade).
- **O código de aggTrade (`aggtrade_csv_reader`, `aggtrade_contiguity`, `aggtrade_bucket_aggregate`, `domain/cvd.py`) saiu do repositório em 2026-09-26 (PR #234, merge `dc725ef`)**, porque não tinha chamador em produção `[DECISÃO-OWNER: 2026-09-26, escolha entre alternativas apresentadas]`. Depois do merge, `ADR-001` rege um caminho sem código, e reabri-lo é gatilho de `Q20` (nota em `PRD-001` E-07).
- `cvd_source` com 6 valores — `SPEC-001:290`. No código: `kline_takerbuy` 22, `aggtrade_q` 24, `aggtrade_nq` 20 `[MEDIDO: grep -rhoE 'aggtrade_(q|nq)|kline_takerbuy' backend/src | sort | uniq -c]`.
- `bv` da Coinalyze recusado como 2ª testemunha (116/120 iguais) — `ADR-036:161-165`.

### oi
- Binance, em contratos: histórico `openInterestHist` 5m + polling `/fapi/v1/openInterest` a 60 s, janela `[T, T+20 s]` — `SPEC-009:139-179` (O-4). Revoga `ADR-027 D1a`.
- Candle de OI: projeção na rota, trio `(STOCK, POINT, POINT_AT_BUCKET_END)`, open = `p(T0)`, rótulo DERIVADO, um candle = uma série — `ADR-045:31-61`. Revoga `PRD-009 RN-5`.
- Cor do OI = variação de contratos, nunca preço — `PRD-009:192`.
- OI multi-exchange (F5) fora — `SPEC-008:640-663`.
- MODELED do `openInterestHist` = `bucket_end + 300.000` — `ADR-038 D1′` (DRAFT; §7.1 → §4 P4).

### funding
- `price_source` de funding e custo = `mark_price` — `ADR-007:35,37`.
- Funding majoritário 4h (432/570, 75,79%), muda por símbolo no tempo; countdown fixo em 8h é erro — `recorte-plataforma:31,85`.
- Sem coleta de funding no CORE; painel de funding fora — `PRD-007:36-46`, `PRD-008/009 NG`.

### liquidacao
- Coinalyze primária; `forceOrder` fora do caminho crítico — `ADR-036/D4`.
- Coorte ∈ {long, short}, denom quote, 1m; nunca somar nem líquido — `SPEC-007:400,437-441`, `PRD-009 RN-3`.
- Pane: short em cima, long embaixo por `invertScale`, valores ≥ 0 — `SPEC-009:277-315`, `ADR-044:176-200`. Revoga "painel de liquidação não existe" (`DESIGN_SYSTEM:1098`, `STITCH:1837`).
- Se `forceOrder` for usado: sobreposição + chave natural, soma = limite inferior, nunca `ACCEPTED` — `ADR-004 B1-B5`, `ADR-014:262`.
- Agregado diário recuperável por 730 d na Coinalyze — `medicao-coinalyze:68-86`.

### long-short
- M3 = `count_long_short_ratio` Binance 5m; `ls_ratio` genérico proibido; `sum_taker` fora (D18) — `SPEC-007:77-86`, plano `SPEC-007/04`.
- 4 séries L/S distintas — `recorte-plataforma:74,88`.
- Reagregação de RATIO = `last` sob allowlist; recompor de componentes recusado — `ADR-040:167-171`. Revoga `PRD-009:93`.
- RATIO fica OBSERVED, sem MODELED — `ADR-038:543-554`.

### volume-preco
- Volume = klines [5], 1m, FLOW/SUM, backfill 7 d — `ADR-036:45-47`, `SPEC-007:397`.
- Vela = 4 séries `klines_ohlc` 1m STOCK, fonte klines (nunca mark) — `SPEC-008 D1`. Revoga `klines_last` no PricePane (`SPEC-007:416-421`).
- `price_source` por `price_use`: estrutura/execução → last; liquidação/funding/custo → mark; sem `price_use` é erro — `ADR-007`.
- Cor do volume = direção da vela (doji = alta) — plano `SPEC-009/02`.
- Spread é premissa carimbada; `bookTicker` fora; resíduo `Q17` (a2/a3) aberto — `decisoes:202-209`.

### armazenamento
- Registro/catálogo em Postgres; série em TimescaleDB (imagem `timescale/timescaledb:2.17.2-pg15`); ClickHouse eliminado — `ADR-002/D4` (2026-09-04), `ADR-031`. Revoga "motor não decidido" (§3 #1).
- `md.ingest_run` (16 col) / `md.ingest_gap` (8) em Postgres; SQLite só dev/teste (`INGEST_RECORD_BACKEND`) — `ADR-031`. Revoga `ADR-014/D1`, `SPEC-003` default SQLite.
- `md.series.value_raw TEXT NOT NULL`, Decimal sobre string — `ADR-034/D7`.
- Teto 90 d de 1m por símbolo; disco = 496 B/linha; medir com `hypertable_size` — `SPEC-008:34-40, D5`. Revoga 99,06 B/linha como disco (`SPEC-009:166`).
- Lag store: 1 linha por (endpoint, região), `lag_n` somado, max p99 — `ADR-033`.
- Instância Postgres na VPS: `[NÃO SEI]` → §4 P1.

### captura-coletor
- 3 processos de vida longa (coletores num processo com threads, escritor, API); one-shot por cron; Redis dedicado — `ADR-027/D1`. Lista viva de coletores = `collectors_cli.py` (klines, OI hist, OI poll, premiumIndex, forceOrder).
- Offset do poll de klines = 20 s; cauda viva anterior está contaminada — `ADR-041`.
- Paginação só com janela fechada enumerada, nunca cursor — `SPEC-001:448-460`, `ADR-004 C1/C2`.
- Cota Coinalyze ≤ 40 u/60 s, custo = n_símbolos, cadência 5 min — `SPEC-007:520-563`.
- Fail-fast; Redis caído → `REJECTED` + `rc≠0` — `PRD-004 RN-4`, `SPEC-004:81`.
- Probe/one-shot da Coinalyze nunca vira serviço — `PRD-005`, `ADR-027:137`.

### escritor-registro
- Só o escritor único toca a série; Redis Streams + consumer group (`md.series.write`/`single_writer`), `MAXLEN ~100000`, `noeviction` — `ADR-002/D5`, `SPEC-004:21,96`.
- ack após commit; reentrega = upsert-noop; OBSERVED vence MODELED — `SPEC-004:106-110`.
- Coletor abre o run com `n_written=0`; o escritor credita (`credit_written`) e fecha — `ADR-035`. Revoga a leitura isolada de `ADR-031/D3`.
- `uptimePercent` = % de runs fechados — `ADR-035 D12`. Revoga `ADR-030/D2`.
- `verdict ∈ {REJECTED, ACCEPTED_WITH_WARNING, ACCEPTED}`, I-1..I-5 — `ADR-014`; 15 colunas de contrato (inclui `janela_de_perda`) — `ADR-008/D3`.

### tempo-grade
- Admissão: `available_at ≤ K ∧ observed_at ≤ K ∧ bucket_end ≤ t`; backtest K=t; K>t só `RENDERING` — `ADR-042`. Emenda `SPEC-001 §2.3`.
- `bar_policy ∈ {final_only, intrabar}`, obrigatório, sem default; entrada = `final_only` — `ADR-034/D4`, `ADR-005`.
- Reagregação na rota: `interval ∈ {1m,5m,15m,1h,4h}`, `reduce(nature, reduction)` em 8 pares, parcial com `{present, expected}` — `ADR-040`, `SPEC-008`. Revoga `ADR-034/D6`, "só 1m" de `SPEC-006`.
- `event_time` = fecho do bucket; `available_at` MODELED = próximo ponto da grade ≥ `bucket_end + p99 + margem` (para cima), margem = 2×`lag_resolution` — `PRD-001:233,252`, `SPEC-005:75-94`.
- Grade nativa é inteiro declarado; 5m no TF 1m = UPSAMPLING; `RN-S1` (÷5) só no TF 1m — `ADR-037`, `ADR-040`.
- Staleness: `asof_*`/`render_*`; `max_staleness_ms` solto é proibido — `ADR-006` (código diverge → §4 P3).

### leitura-api
- FastAPI é a única porta de leitura; Next sem SQL nem regra de domínio; zero `route.ts` — `ADR-005/D5`, `ADR-028`, `decisoes A4`.
- `/series-history` (HTTP endereçável por conteúdo) e `/series-live` (SSE) — `ADR-034`, `ADR-005`.
- Linha = par `(value, absence)`, nunca `null` isolado nem `0` — `ADR-034:86-89`.
- Mesma origem, `API_PREFIX=/api/v1`, sem CORS, ETag = fingerprint, `/ready` — `ADR-029`, `SPEC-003`.
- Ingest-health `server-only`; seletor symbol/TF client-driven com URL por prop — `ADR-028`, `ADR-043`.
- Além de 90 d a rota recusa; estados absent / not-loaded / beyond-coverage; envelope com `coverage` — `SPEC-008 D5/D8`.

### ui-painel
- Um `createChart`, um pane por métrica, eixo no rodapé, legenda por `param.logical`; ordem Preço+Volume · Liquidações · OI · L/S · CVD — `ADR-044`, `SPEC-009:125-126`.
- Cor: 3 hues; direção `#089981`/`#f23645` só em fill; forma vazado/cheio/cruz; violeta = dado quebrado — `ADR-010`, `DESIGN_SYSTEM`. Revoga azul/laranja.
- Tema único escuro — `DESIGN_SYSTEM D13` (2026-09-11). Revoga "dois modos" (`STITCH:568-570`).
- Ausência nunca é zero; FLOW ausente = vazio (sem LOCF); STOCK = último valor em tinta secundária — `DESIGN_SYSTEM:1061-1072`.
- Latência: eixo p95 ≤ 160 ms (n≥61), história p95 ≤ 400 ms — `SPEC-009:32` (rotula DECISÃO-OWNER 2026-09-22). Revoga 16 ms (`SPEC-008:754`).
- `web` importa só o barrel `charts/index.ts`; S2 canônica no Stitch = `8174…`; sem mobile no piloto — `ADR-034/D8`, `DESIGN-LAYOUT.md:12`, D14.

### rotas-url
- Rotas em inglês, retroativo — `CLAUDE.md` linha 12 `[PREMISSA-OWNER: 2026-09-08]` *"rotas em ingles, inclusive o que tiver de rotas em ptbr pode ser migrado para ingles"*.
- `/painel` → `/console` (308, `next.config.ts`) — `ADR-034/D2-D3`, `routes.ts:14-21`.
- Página de gráfico = `/symbol/[symbol]` — `PRD-009:94`, `frontend/src/app/symbol/[symbol]`.
- Backend sob `/api/v1`: `/series-history`, `/series-live`, `/collector-status`, `/ingest-health`, `/series-catalog`, `/series-quarantine` — `ADR-034`, `ADR-030`, `SPEC-003`.

### idioma
- Normativa única: `CLAUDE.md §Idioma` (12 linhas + prosa) — `SPEC-002:100-104`. Revoga `ADR-013 D3` (8 linhas) e `PRD-002 [Q1]/[Q2]`.
- Inglês: código, arquivo, diretório, docstring, log novo, mensagem de exceção. pt-BR: docs, commit, UI.
- Exceções: 7 componentes e caminhos derivados; coluna `janela_de_perda` (linhas 9/11).
- 4 eventos de log PT ficam e não podem subir — `SPEC-002 §6.3`. Convenção, não portão — `ADR-013/D2`.

### processo-harness
- ESTADO = ledger — `CLAUDE.md`. Portões em `make verify`; import-linter + ESLint; Poetry; Python 3.13 — `ADR-011`, `ADR-012`, `ADR-016`.
- `design_gate` = ux-ui-mastery (interação); architect (domínio); `web` = frontend-architect (A6); `charts` = quant-architect — `gate-de-design.md`, `decisoes:699-702`. Revoga `ADR-003:74`.
- R1–R9 e hook de 150 turnos — `protocolo-de-despacho.md`. Teto de 3 tasks: `[PREMISSA-OWNER: 2026-09-12]` *"Podemos executar até 3 tasks paralelas"* (memória do owner, reconfirmado 2026-09-24). Revoga o "2" dos planos 008/009.
- Critério de fase: DoD-VERTICAL + ablação por pixel — `PRD-007 D2`, `SPEC-008 DoD-4`. Nunca semear teste no PG compartilhado — `PRD-007 P-seed`. `INDEX.md` append-only.

### deploy-infra
- Ambiente atual = stack Docker LOCAL (`deploy/compose.yml` + `compose.local.yml`); VPS fora — `decisoes Q19:228-265`; `INDEX.md:247` `[PREMISSA-OWNER: 2026-09-08]` *"vide que rodamos apenas local"*.
- Alvo de deploy: 7 serviços (api caddy collector postgres redis web writer), backend `python:3.13-slim`, front `node:22-alpine`, Redis 64 MB `noeviction` — `ADR-032`, `ADR-027`.
- Deploy local sem perguntar: `[PREMISSA-OWNER: 2026-09-19]` *"Tem autorização para fazer o deploy no docker sempre q precisar."* (memória do owner).
- Na VPS, quando for: Caddy/TLS + `basic_auth` por hash (auth mínima single-user) — `decisoes Q2:139-149`, `ADR-029:49-51`.
- Premissa: poucos recursos, VPS compartilhada, sem daemon novo — `premissas-de-infra-e-stack.md`.

### backtest-estrategia
- Fora hoje: SMC, Fib, limiar, convergência, SL/TP, walk-forward, execução — `PRD-008:41-43`, `STITCH:72-78`.
- `Q20` = "coexistem" (SMC e pivôs+Fib sobre o mesmo swing) — `decisoes:560-566`, `ADR-017` (RASCUNHO). `Q10`: pesquisar > monitorar > executar — `decisoes:392-398`.
- Reprodutibilidade = `run_registry` (bundle_hash, window, knowledge_time, grid_version) — `ADR-021`, `ADR-025`; walk-forward em ms, `knowledge_time` por fold — `ADR-023`.
- Limitado pela fonte mais rasa; série Coinalyze invisível ao backtest; klines da cauda viva pré-`ADR-041` proibidos — `SPEC-007:714-722`, `PRD-008 RN-6`.

### escopo-fases
- CORE = 5 métricas fechadas (volume, OI, L/S, liquidações, CVD); fase = fatia vertical até o pixel — `PRD-007:36-46, D1`.
- Fora: pane de funding, VPVR, CVD spot, OI multi-exchange, mobile, watchlist, UI de login, livro de ofertas — `PRD-008/009 NG`, `SPEC-008 F5`.
- Ledger `[MEDIDO 2026-09-26: harness pipeline state]`: `plataforma-dados` e `paineis-de-fluxo` BUILD_AUTHORIZED; `coinalyze-fora-da-quarentena` SPEC_APPROVED (não construída); as outras 6 filhas DONE.

### quarentena-proveniencia
- QUARENTENA ⇔ `label_shift IS NULL OR unit IS NULL OR available_at IS NULL` — `PRD-001:292-307`, `SPEC-001 §5.2`.
- A Coinalyze fica em quarentena até `SPEC-005` ser construída (`observer_region="sa-east-1"`, promoção com `lag_n ≥ 200`).
- `availability_source ∈ {OBSERVED, MODELED}`, fechado — `ADR-033:90-96`. `verdict` ⟂ quarentena — `ADR-014:211`.
- Série de terceiro vai à tela rotulada (`published_error`) e fica invisível ao backtest — `SPEC-007 RS-5`, `PRD-008 RN-6`.

---

## §2 Catálogo (91 documentos)

Status: VIGENTE · PARCIAL (parte caiu) · SUPERADO (nada vale) · HISTÓRICO (feature DONE / evidência; vale só como registro).

### docs/specs
| doc | status | decide | superado em (por quê → quem) |
|---|---|---|---|
| PRD-001-plataforma-dados | PARCIAL | requisitos da camada de dados F0–F5, contratos temporais, quarentena | SeriesKey/cvd_source/Epics/auth/rótulo OI → SPEC-001 §8; motor → ADR-002/D4; paleta → ADR-010; liquidação → ADR-036/D4; R-1 → ADR-042 |
| SPEC-001-plataforma-dados | PARCIAL | identidades, SeriesKey 15 termos, escritor único, transporte, 7 Epics | §6.2 → ADR-010; Q16/infra → decisoes Q16 + ADR-009/D6.5; motor → ADR-002/D4; §2.3 → ADR-042; CL-1 → ADR-036/D4; cabeçalho DRAFT × ledger BUILD_AUTHORIZED |
| PRD-002-codigo-em-ingles | PARCIAL | fronteira de idioma em 12 superfícies | Q1/Q2/linha 12, 7 componentes → SPEC-002 + CLAUDE.md |
| SPEC-002-codigo-em-ingles | PARCIAL | convenção no CLAUDE.md, renomeações, log novo em inglês | §7 `/painel` → CLAUDE.md linha 12 (2026-09-08) |
| PRD-003-camada-de-leitura-do-painel | HISTÓRICO | leitura do painel por RSC, estados honestos | SPEC-003; rota → ADR-034 |
| SPEC-003-camada-de-leitura-do-painel | PARCIAL | RSC + server-only, Caddy, API_PREFIX, /ready, ETag | `/painel` → ADR-034; store SQLite default → ADR-031 |
| PRD-004-captura-em-producao | HISTÓRICO | coletor → Redis Stream → escritor → Postgres | SPEC-004 (contagens 15/16) |
| SPEC-004-captura-em-producao | PARCIAL | wire de 15 campos, stream, ack pós-commit, compose em 2 alvos | contagem de threads → SPEC-007 §4 (emenda interna) |
| PRD-005-coinalyze-fora-da-quarentena | PARCIAL | tirar a Coinalyze da quarentena pelo 3º termo | `lag_n>0` → SPEC-005 (≥200); lag store → ADR-033/D2 |
| SPEC-005-coinalyze-fora-da-quarentena | VIGENTE | sa-east-1, REGIME_N_MIN=200, margem 2×res, LagSummaryStore | §10 diz "não aprovada" × ledger SPEC_APPROVED |
| PRD-006-pagina-de-grafico-s2 | PARCIAL | rotas de série + página S2 + migrar `/painel` | D-h → SPEC-006; TBD → ADR-034 |
| SPEC-006-pagina-de-grafico-s2 | PARCIAL | value_raw, /series-history, /series-live, /console | "só 1m" → ADR-040; `/symbol` → `/symbol/[symbol]` |
| PRD-007-cinco-metricas-do-core | PARCIAL | CORE de 5 métricas, fatia vertical, DoD-VERTICAL | DEF-2/DEF-3 → SPEC-007/ADR-036/ADR-035; "congelada" → ledger |
| SPEC-007-cinco-metricas-do-core | PARCIAL | identidade das 5 séries, fonte por métrica, cota Coinalyze | RN-S1 → só TF 1m (ADR-040); preço klines_last → SPEC-008 D1; OI 1m → SPEC-009 |
| PRD-008-candle-real-e-eixo-unico | PARCIAL | vela real, eixo mestre, TF, OI honesto | CA-5/CA-8 → SPEC-008; "OI OHLC Coinalyze vivo" → PRD-009 M2 |
| SPEC-008-candle-real-e-eixo-unico | VIGENTE | klines_ohlc, reagregação na rota, eixo mestre, teto 90 d | linha :754 (16 ms) → SPEC-009:32; :777 número → CLAUDE.md |
| PRD-009-paineis-de-fluxo | PARCIAL | um gráfico com panes, volume/OI/liquidação | RN-5/TFs/RATIO/G-3 → SPEC-009, ADR-040, ADR-045 |
| SPEC-009-paineis-de-fluxo | VIGENTE | createChart único, OI polling 1m, liquidação num pane | §6.1 disco usa B/linha de fio (→ SPEC-008) |

### docs/adr
| doc | status | decide | superado em (por quê → quem) |
|---|---|---|---|
| ADR-001 quantity_field | PARCIAL | `quantity_field` na SeriesKey; q/nq sem emenda | CVD do core via klines → ADR-036/D5 |
| ADR-002 motor | VIGENTE (emendas) | store partido; TimescaleDB (cand. 4); escritor único | D1 SQLite F0 → ADR-031; instância VPS `[NÃO SEI]` (§4 P1) |
| ADR-003 charts⇄web | PARCIAL | fronteira por contrato de dado, FR-1/2/3 | :74 dono web → A6 (frontend-architect) |
| ADR-004 reconexão | VIGENTE (emenda) | política por classe A/B/C; silêncio 300 s | — (A1/A3 não construídos) |
| ADR-005 transporte | VIGENTE (emenda) | HTTP endereçável + SSE; FastAPI serve | :112 "infra aberto" → ADR-009/D6.5 |
| ADR-006 max_staleness | VIGENTE | asof_/render_ por série; nome solto banido | código diverge (§4 P3) |
| ADR-007 price_source | VIGENTE | price_source por price_use | — |
| ADR-008 registro cru F0 | PARCIAL | 15 colunas, uma query, DoD por sha256 | DoD-1 `[[rules.own]]` → ADR-011 |
| ADR-009 forma do anything | PARCIAL | módulos/camadas, Redis Streams, infra adotado | D4 → ADR-011/D5 |
| ADR-010 cor | VIGENTE | cor por tipo de marca, 3 hues | — |
| ADR-011 portão no make | VIGENTE | Poetry, Makefile, import-linter, ESLint, Py 3.13 | — |
| ADR-012 portão de shell | VIGENTE | shell no make, bash -n, golden de agents | — |
| ADR-013 idioma | PARCIAL | convenção sem portão; exceção de componentes | tabela 8→12 e 6→7 → CLAUDE.md |
| ADR-014 verdict/testemunha | PARCIAL | verdict 3 membros, testemunha por fonte | D1 SQLite → ADR-031 |
| ADR-015 token tipado | VIGENTE | CAMINHO×IDENTIFICADOR; citação VIVA/HISTÓRICA | — |
| ADR-016 relógio é capacidade | VIGENTE (texto: proposto) | socket/ssl por import; datetime por uso (AST) | — |
| ADR-017 detecção autônoma | VIGENTE-RASCUNHO | swing fractal, walk-forward, SMC+Fib no mesmo swing | aceite pendente (§4 P2) |
| ADR-018 scaffold Next | PARCIAL | Next/React, tsconfig estrito, tsc no lint | D2 `/painel` → CLAUDE.md L12/ADR-034 |
| ADR-019 cliente ingest-health | PARCIAL | parse permissivo/estrito, sem NEXT_PUBLIC | D1 → ADR-028; D4 relativizada → ADR-043 |
| ADR-020 S4 bins | PARCIAL | FieldIdentity, bordas por quantis, receita no bundle | D5 → ADR-023 |
| ADR-021 run_registry | VIGENTE | schema backtest.run_registry, epoch ms | estendida por ADR-025 |
| ADR-022 min_obs | VIGENTE (texto: proposto) | Observation, min_obs por ponto | — |
| ADR-023 walk-forward | VIGENTE (texto: proposto) | janelas em ms, knowledge_time por fold | — |
| ADR-024 S4 honestidade | VIGENTE (texto: proposto) | sem idade em agregado; S4 retrospectiva | — |
| ADR-025 grid_version | PARCIAL | grid_version no run_registry | D3 constante TS não existe `[MEDIDO: grep -rni GRID_VERSION frontend/src → 0]` |
| ADR-026 regras de painel | VIGENTE (texto: proposto) | habilitação de TF, colisão, bucket em formação, 1 denom | tensão com pane Preço+Volume (§4 P5) |
| ADR-027 topologia | PARCIAL | 3 processos, cron, Redis dedicado | lista de coletores/D1a → código + SPEC-009 |
| ADR-028 RSC + server-only | PARCIAL | leitura em RSC; server-only é o portão | caminho → ADR-034; exceção symbol/TF → ADR-043 |
| ADR-029 topologia de leitura | VIGENTE | Caddy próprio, mesma origem, /ready | — ("não implantado" na VPS segue verdadeiro) |
| ADR-030 collector-status | PARCIAL | status/uptime/retention/resilience | D2 uptime → ADR-035 D12 |
| ADR-031 registro em Postgres | PARCIAL | Postgres por adaptador; imagem cand. 4 | D3 quem fecha o run → ADR-035 |
| ADR-032 dois alvos de compose | VIGENTE | deploy 7 serviços + overlay local | — |
| ADR-033 lag store | VIGENTE | LagSummaryStore, mesclagem conservadora | — |
| ADR-034 rotas de série | PARCIAL | /series-history, /series-live, /console, bar_policy, value_raw | D6 → ADR-040 |
| ADR-035 n_written | VIGENTE (emendas) | escritor fecha o run; uptime por runs fechados | — |
| ADR-036 fonte por métrica | VIGENTE (D5 reescrita) | origem por padrão; CVD klines; liq Coinalyze | — |
| ADR-037 grade nativa | VIGENTE | grade nativa declarada; UPSAMPLING | — (RATIO 6º membro aberto, técnico) |
| ADR-038 carimbo MODELED | PARCIAL/DRAFT | OI MODELED = bucket_end+300.000 (D1′) | §7.1 pendente (§4 P4) |
| ADR-039 acessor em lote | DRAFT | as_of_batch, ativação max(available_at, bucket_end) | — |
| ADR-040 reagregação na rota | VIGENTE | interval ∈ 5 TFs, (nature, reduction) | — |
| ADR-041 cauda viva | VIGENTE | offset de klines 20 s | — |
| ADR-042 dois relógios | VIGENTE | available_at ≤ K | — |
| ADR-043 client-driven | VIGENTE | seletor symbol/TF sem round-trip RSC | — |
| ADR-044 panes nativos | VIGENTE (D2′/D3′) | um createChart, legenda por slot, invertScale | — |
| ADR-045 candle de OI | VIGENTE | projeção na rota, open = p(T0) | — |
| adr/README.md | SUPERADO | índice de ADRs | fotografa 26 ADRs; hoje são 45 `[MEDIDO: ls docs/adr/ADR-*.md \| wc -l]` |

### docs/ (topo)
| doc | status | decide | superado em (por quê → quem) |
|---|---|---|---|
| decisoes-do-owner.md | VIGENTE (seções) / PARCIAL (mapa L32-55, :618, :643, :683, :741) | Q1–Q20, A4/A6/A7 | mapa Q10 → seção :390-398; motor → ADR-002/D4; infra → :829-836 |
| proposta-discovery.md | SUPERADO | 4 módulos, intenção original | recorte, PRD-001/SPEC-001, decisoes |
| avaliacao-discovery.md | PARCIAL | auditoria do discovery, 5 falhas centrais | Coinalyze daily → medicao-coinalyze; CVD sem aggTrade → Q9 |
| recorte-plataforma.md | PARCIAL | contrato de dados, 68/21 achados | faseamento F1–F5 → SPEC-001 (9 fases, F0); motor → ADR-002 |
| plataforma-superficies-e-faseamento.md | PARCIAL | 5 superfícies, ausência por nature, selo | paleta → ADR-010/Q13; probe → Q19; painel de liquidação → SPEC-009 |
| arquitetura-fluxos.md | PARCIAL | 4 fluxos em diagrama (intenção) | Q16/Q10/Q11/Q13/Q20 respondidas; motor → ADR-002 |
| arquitetura-do-codigo.md | SUPERADO | fotografia do código em 840c500 | o próprio falsificador §11: 36/4.986/2/3/0 → 223/40.495/3/15/32 `[MEDIDO L7]` |
| premissas-de-infra-e-stack.md | PARCIAL | VPS, R2, stack, Q2 | motor → ADR-002; instância VPS → §4 P1 |
| direcionamento-operacional.md | PARCIAL | tese do owner, 3 camadas, final_only | Q20 → decisoes; motor → ADR-002 |
| gate-de-design.md | VIGENTE | architect × design_gate | ponteiros :50-51,57 para decisoes estão velhos |
| protocolo-de-despacho.md | VIGENTE | R1–R9 | — |
| medicao-coinalyze.md | VIGENTE | medição real da Coinalyze | — |
| medicao-ws-aggtrade-nq.md | PARCIAL | WS aggTrade silencioso; REST tem nq | D3.9 `[NÃO MEDIDO]` |
| medicao-conectividade-forceorder.md | PARCIAL | forceOrder conecta e fica mudo | entrega `[NÃO MEDIDO]`; fonte primária já é a Coinalyze |

### docs/plans (uma linha por pasta)
| pasta | status | decide | superado em |
|---|---|---|---|
| SPEC-001-plataforma-dados/ | PARCIAL | 9 fases F0–F5b | 6 componentes → 7; forceOrder → ADR-036/D4; cabeçalho × ledger |
| SPEC-002-codigo-em-ingles/ | HISTÓRICO | 4 fases de idioma | `/painel` PT → SPEC-006/03 |
| SPEC-003-camada-de-leitura-do-painel/ | HISTÓRICO | 3 fases RSC/API/recursos | `/painel` → `/console` |
| SPEC-004-captura-em-producao/ | HISTÓRICO | coletor → escritor → compose | 2 threads → código atual |
| SPEC-005-coinalyze-fora-da-quarentena/ | VIGENTE | probe + lag store → fórmula MODELED | cabeçalho SPEC_DRAFT × ledger SPEC_APPROVED |
| SPEC-006-pagina-de-grafico-s2/ | HISTÓRICO | value_raw, rotas, /symbol, /console | R-D (só 1m) → ADR-040 |
| SPEC-007-cinco-metricas-do-core/ | HISTÓRICO | 5 fatias verticais | index :21 ÷5 → fase 04 :60-71 |
| SPEC-008-candle-real-e-eixo-unico/ | HISTÓRICO | vela, eixo, TF, OI, história | 16 ms → 160 ms; teto de 2 tasks → 3 |
| SPEC-009-paineis-de-fluxo/ | VIGENTE | 6 panes, volume c/ direção, OI candle, liquidação | teto 2 → 3; instrumento de disco → hypertable_size |

### docs/product, docs/spike
| doc | status | decide | superado em |
|---|---|---|---|
| product/DESIGN_SYSTEM.md | VIGENTE / PARCIAL | cor, selo, ausência, estados | tema claro → D13; lucide/outline/painel de liquidação/caminho do falsificador → código |
| product/STITCH_CONTEXT.md | PARCIAL | operação do Stitch, telas canônicas, D1–D19 | "dois modos" → D13; painel de liquidação → SPEC-009; S3 "[NÃO EXISTE]" só vale no Stitch |
| spike/T-08.1-motor-armazenamento/README.md | HISTÓRICO | evidência do motor | decisão em ADR-002/D4 |
| spike/smc-strategy.tradingview | HISTÓRICO | Pine de terceiro, referência | — |

Não cobertos pelos lotes: `CLAUDE.md` (autoridade, §0), `docs/INDEX.md` (registro), `docs/adr/bancadas/`, `docs/context/**`.

---

## §3 Contradições (deduplicadas, ordenadas por tema)

`ação`: **banner** = marcar supersessão no doc velho · **corrigir-texto** = fato verificável errado · **owner** = decisão que ninguém tomou.

| # | tema | ponta A | ponta B | vale | base | ação |
|---|---|---|---|---|---|---|
| 1 | armazenamento | motor "não decidido / 3 candidatos": PRD-001:642,671; SPEC-001:682,746; arquitetura-fluxos:57-59; premissas:115-119; direcionamento:106-116; decisoes:618; proposta-discovery:33 | ADR-002:142 (D4 = TimescaleDB, cand. 4) | B | emenda datada 2026-09-04; `deploy/compose.yml:46` | banner |
| 2 | armazenamento | ADR-002:43 + premissas:100-113 (Postgres "já de pé", TimescaleDB como extensão, sem daemon novo) | ADR-032:25 + `deploy/compose.yml:46` (container postgres próprio no alvo deploy); ADR-031:33 `[NÃO SEI]` | — | dois docs vigentes; a VPS nunca recebeu deploy | owner |
| 3 | armazenamento | ADR-014:87 e SPEC-003:172,175 (registro em SQLite) | ADR-031:4,24 e SPEC-004:17 (Postgres em produção) | B | ADR-031 declara emenda; código `ingest_record_store_composition.py:18-20` | banner |
| 4 | armazenamento | SPEC-009:162-166 (99,06 B/linha → ~208 MB/ano) | SPEC-008:34-40,369-371 (496 B/linha de disco; 99,06 é de fio) | B | medição; ~1 GB/ano `[INFERRED: 5.760 linhas/dia × 496 B × 365]` | corrigir-texto + owner (P6: o veto Q-CAD-1 usou o número errado) |
| 5 | armazenamento | plans/SPEC-009/03_oi_candle.md:35 (`pg_total_relation_size`) | plans/SPEC-008/01_vela.md:54,64-79 (cego em hypertable; usar `hypertable_size`) | B | correção medida (24.576 × 1.505.697.792 B) | corrigir-texto |
| 6 | armazenamento | plans/SPEC-008/05:13 (backfill de 2.148.504 linhas) | plans/SPEC-008/05:128 (DoD ≤ 2,07 M linhas) | `[NÃO SEI]` | 2.148.504/129.600 não é inteiro ⇒ universo talvez diferente (inclui klines_volume?) | corrigir-texto (após medir) |
| 7 | armazenamento | PRD-001:768,832 (Q9: disco não decide) | SPEC-001:629 (a VPS está sob pressão de disco) | B | posterior + premissa de poucos recursos | banner |
| 8 | armazenamento | PRD-005:168 RF-3 (acrescentar) × PRD-005:188 RNF-1 (1 linha por chave) | ADR-033/D2 (1 linha, max p99) | ADR-033 | ADR posterior | banner |
| 9 | backtest-estrategia | Q20 aberta: arquitetura-fluxos:272; direcionamento:122-133 | decisoes:560-566 (Q20 "coexistem", 2026-09-03) | B | seção do owner, posterior | banner |
| 10 | captura-coletor | 2 coletores / sem poller de OI: ADR-027:74,137; PRD-004:88; plans/SPEC-004/01:12 | SPEC-004:66 (emenda → SPEC-007 §4); `collectors_cli.py` (klines, OI hist, OI poll) | B | código decide o fato | banner |
| 11 | captura-coletor | plataforma-superficies:262 (probe M-1 sem universo) | decisoes:235-246 (Q19: 4 símbolos + Coinalyze) | B | owner 2026-09-02 | banner |
| 12 | cvd | CVD por aggTrade: ADR-001:27; PRD-001:371-385; proposta-discovery:14; avaliacao-discovery:216 | ADR-036:116-120 (klines `2·takerBuyBaseVol − volume`, D5 de 2026-09-10); decisoes Q9:363-375 | B | ADR posterior; ADR-001 continua regendo só séries de aggTrade | banner |
| 13 | cvd | PRD-001:371 (`cvd_source` com 5 valores) | SPEC-001:290 (6, `aggtrade_q`/`aggtrade_nq`) | B | SPEC corrige o PRD; código com 24/20 ocorrências | banner |
| 14 | deploy-infra | PRD-001:825,1018 (Q2 "não exposto", login é non-goal) | SPEC-001:368-372 + decisoes:139-149 (exposta, auth mínima) | B | Q2 respondida depois do PRD | banner |
| 15 | deploy-infra | SPEC-001:652,689 (Q16 ABERTA; `infra` só proposto); ADR-005:112; decisoes:683,741 | decisoes Q16 2026-08-28; ADR-009:196,295 + decisoes:829-836,910-915 (`infra` adotado 2026-09-03) | B | posterior, mesmo registro; `harness.toml:84` | banner |
| 16 | escopo-fases | PRD-001:1093 (6 Epics; o 7º seria auth) | SPEC-001:596-618 (7 Epics; auth dentro de CST-3) | B | SPEC lida do tracker | banner |
| 17 | escopo-fases | PRD-007:105,356 (coinalyze congelada em SPEC_DRAFT) | ledger SPEC_APPROVED | B | ledger | banner |
| 18 | escopo-fases | plans/SPEC-008/index.md:45, plans/SPEC-009/index.md:35 (teto de 2 tasks) | owner 2026-09-12 "até 3 tasks paralelas", reconfirmado 2026-09-24 | B | fala literal do owner, mais recente | corrigir-texto |
| 19 | escopo-fases | "painel de liquidação não existe": plataforma-superficies:9-70; DESIGN_SYSTEM:1098-1100; STITCH:1837 | SPEC-009:277-315 (pane de liquidação) + código `SymbolClient.tsx:319` | B | SPEC + ADR-044 posteriores; código | corrigir-texto |
| 20 | escritor-registro | PRD-004:168,170 (SeriesRow 12, IngestRun 15) | SPEC-004:93,115 (15 e 16, por `dataclasses.fields`) | B | medido | banner |
| 21 | escritor-registro | ADR-031:37-39 (o coletor grava o run) | ADR-035:128-163 (o escritor credita e fecha) | B | ADR posterior, complementa | banner |
| 22 | escritor-registro | ADR-030:49-54 (uptime = Σn_written/Σn_expected) | ADR-035:49-65 (% de runs fechados, D12) | B | emenda 2026-09-11 | banner |
| 23 | escritor-registro | ADR-008:53 (DoD-1 por `[[rules.own]]` + corpus) | ADR-011:239-257 (corpus descartado; 1.8′) | B | ADR posterior | banner |
| 24 | fonte-dado | avaliacao-discovery:73,111 (Coinalyze não é rota de histórico) | medicao-coinalyze:40,45-47; decisoes Q4 (daily = 2.409 d) | B (qualificado: intraday segue raso) | medição posterior | banner |
| 25 | fonte-dado | PRD-006:85 (D-h: dado real satisfeito) | SPEC-006:31-36 (`md.series` sem coluna de valor) | B | SPEC | banner |
| 26 | fonte-dado | PRD-008:57; SPEC-008:271-273 (OI OHLC Coinalyze existe "hoje") | PRD-009:49 M2 (catálogo com 0 linhas) | B | medição posterior | corrigir-texto |
| 27 | idioma | 6 componentes: ADR-013:380; PRD-002:106,435; SPEC-002:236; plans/SPEC-001/index.md:5 | CLAUDE.md (7) | B | política (`harness policy --key components`) | banner |
| 28 | idioma | ADR-013:324 (8 superfícies, UI fora do universo) | CLAUDE.md tabela de 12 (PRD-002 §3.1) | B | estende | banner |
| 29 | idioma | PRD-002:107 (evento de log NÃO DECIDIDO) | SPEC-002:254 (inglês prospectivo) | B | SPEC + CLAUDE.md linha 10 | banner |
| 30 | idioma | SPEC-008:777 ("23 contra 22") | CLAUDE.md, correção de 2026-09-20 ("22 contra 21") | B | comando rodado | corrigir-texto |
| 31 | idioma | plans/SPEC-006/03_migracao_console.md:22 (`infra` na exclusão do falsificador) | CLAUDE.md (a omissão de `infra` é deliberada) | B | CLAUDE.md; plano DONE ⇒ citação histórica (ADR-015) | banner |
| 32 | leitura-api | ADR-028:29-31 (server-only é O portão); ADR-019:100 ("jamais use client") | ADR-043:59-64 (módulos-irmãos client-safe para symbol/TF) | B, no escopo symbol/TF | ADR posterior; ADR-043 não cita ADR-028 `[INFERRED]` | banner |
| 33 | leitura-api | ADR-019:42 (o CLI fica intocado) | ADR-028:84-87 (T-05.15 removeu o transporte por subprocesso) | B | posterior | banner |
| 34 | liquidacao | `!forceOrder` capture-or-lose como fonte: SPEC-001 CL-1; plans/SPEC-001/03:6,12; PRD-007:253-262 DEF-2 | ADR-036:78-92 D4; SPEC-007:280-282 | B | ADR posterior, divergência declarada | banner |
| 35 | liquidacao | PRD-001:512 (CA-F0-2: histórico inexistente) | PRD-001:187 (CL-1 R2: 730 d); medicao-coinalyze:68-86 | B | R2 | banner (no banner do PRD-001) |
| 36 | oi | PRD-001:284,603 (rótulo do OI Coinalyze `[NÃO MEDIDO]`) | SPEC-001:117 (`t` = início, `label_shift=+interval`, n=1.706) | B | medido | banner (no banner do PRD-001) |
| 37 | oi | PRD-009:217 RN-5 ("open do primeiro") | ADR-045:31-42 (âncora `p(T0)`) | B | ADR | banner |
| 38 | processo-harness | cabeçalhos de estado: SPEC-001:3 (DRAFT); SPEC-002/003/004 (SPEC_APPROVED); SPEC-005 §10; SPEC-006 (SPEC_DRAFT); SPEC-007:4 (SPEC_DRAFT); SPEC-008/009 (DRAFT); índices dos planos 001/002/005–009; decisoes:643 (PRD_DRAFT) | ledger (§1 escopo-fases) | B | CLAUDE.md: estado = ledger | corrigir-texto (status) |
| 39 | processo-harness | ADRs em "proposto"/"RASCUNHO"/"DRAFT" já implementadas (ADR-001, 011, 016, 017, 018, 019, 020, 022–026, 030, 034–045) | código implementado; ADR-016:264 e ADR-017 exigem aceite do owner | — | aceitar ADR é gate do owner | owner |
| 40 | processo-harness | adr/README.md:22-27 (26 ADRs); :48-58 (grep de falsificador case-sensitive) | `ls` → 45; ADR-038:276 `## 5 · FALSIFICADORES` não casa | B | medido | corrigir-texto |
| 41 | processo-harness | ADR-003:74 (web → ui-designer) | decisoes A6:699-702; `harness.toml:948-950` (frontend-architect) | B | posterior; política | banner |
| 42 | processo-harness | CLAUDE.md:71 ("692 turnos… 41 subagentes") | CLAUDE.md:77-78 + protocolo-de-despacho.md:14-21 (868 turnos, 45 subagentes) | B | a mesma sessão, com o comando | corrigir-texto |
| 43 | processo-harness | gate-de-design.md:50-51,57 (cita decisoes :405, :418-421) | decisoes reescrito: Q16 em :498, frase em :527, A6 em :700 | B | ponteiro velho | corrigir-texto |
| 44 | processo-harness | decisoes:43,55 (Q10 ABERTA; "7 ABERTA · 7 RESPONDIDA") | decisoes:390-398 (Q10 RESPONDIDA 2026-09-04) | B | seção literal | corrigir-texto |
| 45 | processo-harness | arquitetura-do-codigo:45,502-504,538-553 (sem API, sem front, bloqueio por Q1) | falsificador §11 rodado hoje (223/40.495/3/15/32); Q1 respondida 2026-09-01 | B | o próprio doc declara que envelhece | banner |
| 46 | processo-harness | arquitetura-fluxos:500-501 (S2/S1/S3/S4 bloqueadas por Q16/Q10/Q11/Q13) | decisoes: as quatro respondidas; só Q3/Q18 abertas | B | seções do owner | banner |
| 47 | quarentena-proveniencia | PRD-005:199 RN-2 (`lag_n > 0`) | SPEC-005:110-112 (`lag_n ≥ 200`) | B | SPEC | banner |
| 48 | quarentena-proveniencia | ADR-038:403-418 §7.1 (A: `observed_at = available_at` em MODELED × B: manter D16) | nenhuma resposta registrada (sem D19+ em `cinco-metricas-do-core/handoff/DECISOES-OWNER.md`) | — | ADR-038:215,337 mede que §7.1 "não compra nada" | owner |
| 49 | rotas-url | `/painel` em PT: SPEC-002:148,284-289; PRD-002:109; PRD-003:100; SPEC-003:278; ADR-018:53; ADR-028:25; plans/SPEC-002/03:19-23, /04:26,55; plans/SPEC-003/01:15,45 | CLAUDE.md linha 12 (2026-09-08); ADR-034:36-57; `routes.ts:14-21` | B | fala do owner + código | banner |
| 50 | rotas-url | DESIGN_SYSTEM.md:1317-1318 (falsificador grepa `frontend/src/app/painel`) | a rota é `/console` | B | caminho inexistente | corrigir-texto |
| 51 | rotas-url | SPEC-006:59,146 (`/symbol`); SPEC-008:756 (`[M-7]` aberto) | PRD-009:94 + `frontend/src/app/symbol/[symbol]` | B | código + PRD posterior | corrigir-texto (SPEC-008) + banner (SPEC-006) |
| 52 | rotas-url | plans/SPEC-008/02_eixo_unico.md:48 (a "linha 12 do CLAUDE.md" rotulada `[DECISÃO-OWNER: 2026-09-19]`) | CLAUDE.md linha 12 = `[PREMISSA-OWNER: 2026-09-08]`; o segmento `/symbol/[symbol]` é que é de 2026-09-19 | B | rótulo e data trocados | corrigir-texto |
| 53 | tempo-grade | "só 1m": SPEC-006:75,114,168,175; ADR-034:109-113; plans/SPEC-006/index.md:35 | ADR-040:86-90 (5 TFs); `series_history.py:84` | B | ADR posterior + código | banner |
| 54 | tempo-grade | SPEC-007:74,614-618 RN-S1 (÷5); plans/SPEC-007/index.md:21 | ADR-040 (reagrega; escada só no TF 1m); plans/SPEC-007/04_long_short.md:60-71 (L/S conta por `available_at` distinto) | B | posterior; correção 2026-09-16 | banner (SPEC) + corrigir-texto (index) |
| 55 | tempo-grade | PRD-009:93 (RATIO "recomputa"; 4 TFs) | SPEC-008:436-446; ADR-040:167-171; SPEC-009:36 (5 TFs, 1m default) | B | SPEC/ADR | banner |
| 56 | tempo-grade | R-1 `available_at ≤ t`: PRD-001:236; SPEC-001 §2.3; recorte:26 | ADR-042:88-95 (`≤ K`; K=t idêntico) | B | ADR emenda SPEC-001 §2.3 | banner |
| 57 | tempo-grade | ADR-006:29 (`max_staleness_ms` não existe) | código: 30 ocorrências soltas `[MEDIDO: grep -rnE '(^|[^_a-z])max_staleness_ms' backend/src --include='*.py' \| wc -l → 30]` | A (intenção) | código ≠ decisão; ninguém decidiu o foro | owner |
| 58 | tempo-grade | ADR-025:84 (constante `CANONICAL_GRID_VERSION` em `canonical-grid.ts`) | `grep -rni GRID_VERSION frontend/src` → 0 | A (intenção), não implementada | fato do código | corrigir-texto (status) |
| 59 | ui-painel | paleta azul/laranja, "vermelho = dado quebrado": PRD-001:657,836; plataforma-superficies:171 | ADR-010; decisoes Q13:458-468 | B | aceita pelo owner em 2026-08-25 | banner |
| 60 | ui-painel | SPEC-008:754, plans/SPEC-008/02_eixo_unico.md:48,80-91 (p95 ≤ 16 ms) | SPEC-009:32 (160 ms, recalibrado em 2026-09-22); ADR-044:241-258; `e2e/17-teto-latencia-eixo.spec.ts:9` | B | posterior + código | corrigir-texto |
| 61 | ui-painel | SPEC-007:416-421 (preço `klines_last` 5m no PricePane) | PRD-008:53 (`klines_last` nunca teve escritor); SPEC-008 D1 (`klines_ohlc` 1m) | B | SPEC posterior | banner |
| 62 | ui-painel | ADR-026:115 (um painel = um `denom`); plans/SPEC-001/08:39 ("nunca dois eixos Y no mesmo painel") | SPEC-007:353-364 (volume como sub-eixo do PricePane); SPEC-009:125 (pane Preço+Volume); ADR-044:7 declara que NÃO emenda ADR-026 | — | ADR mais antiga × SPEC mais nova, sem supersessão declarada `[INFERRED: pane ≡ painel]` | owner |
| 63 | ui-painel | STITCH:568-570 (os dois modos são validados) | DESIGN_SYSTEM:399-407 (D13: só escuro); `globals.css:92` | B | owner 2026-09-11 | corrigir-texto |
| 64 | ui-painel | DESIGN_SYSTEM:1291,1336-1339 (ícones lucide) | código: `material-symbols-outlined`; `grep -c lucide frontend/package.json` → 0 | B | fato | corrigir-texto |
| 65 | ui-painel | DESIGN_SYSTEM:932-934,1148 (outline-offset `[NÃO SEI]`) | `globals.css:173` (2px) | B | fato | corrigir-texto |
| 66 | ui-painel | STITCH:486 (S3 `[NÃO EXISTE]`) | `frontend/src/features/s3-inspector/` | B, qualificado ("não existe no Stitch") | fato | corrigir-texto |

**Por ação (principal):** banner **40** · corrigir-texto **21** · owner **5** · total **66**. A #4 tem também um componente owner ⇒ **6 pendências** no §4.

### Falsos positivos dos lotes — sem ação, registrados para não voltarem
- **"Não implantar" × "produção desde 09-17"** (L2#8, L5, L6#8, L7-E VPS). "Produção" é a stack Docker local — `INDEX.md:247` *"rodamos apenas local"*. As regras "não implantar na VPS" (PRD-003/004/005, SPEC-004 P6, ADR-029/D1, `decisoes Q19`) **continuam verdadeiras**.
- **Data de `infra`: 2026-09-03 × 2026-09-19.** São atos distintos: a adoção do componente (ADR-009/D6.5) e o alinhamento do CLAUDE.md à política. O próprio CLAUDE.md diz "não é vocabulário novo".
- **`gate-de-design.md:222` com "6 componentes" no dourado.** Está correto: `agents.by_component` tem 6, e `docs` fica fora — `scripts/check-agents-by-component.sh:23`.
- **S2 canônica `8174…` × app com 7 panes.** É consistente com `DESIGN-LAYOUT.md:12,141`: a candidata fica reprovada até existir render medido.
- **ADR-045 cita `candlestick_oi` da Coinalyze:** referência semântica, não fonte (ADR-045:3-9).
- **`collectors_cli.py:1,39` ("FIVE"/"SEVENTH THREAD"):** docstring de código, fora do escopo.

---

## §4 Pendências do owner

Só as linhas `owner` do §3.

**P1 · Instância Postgres na VPS (§3 #2).** Só dispara quando houver deploy na VPS.
- **A — extensão TimescaleDB no `postgres:15` compartilhado.** Honra "sem daemon novo" (premissas:100-113). Custo: a migração in-place nunca foi testada (`spike/T-08.1/README.md:87-95`), e o compose de deploy muda.
- **B — container próprio `timescale/timescaledb:2.17.2-pg15`**, como já está em `deploy/compose.yml:46`. Custo: um 7º container de banco na VPS compartilhada.

**P2 · Aceite das ADRs implementadas (§3 #39).** São 25 ADRs (lista em §3 #39) com texto "proposto", "RASCUNHO" ou "DRAFT" e código em produção.
- **A — ratificar em lote.** Custo: um ato do owner; o README passa a mostrar `aceita`.
- **B — manter como está.** O README marca "implementada, não aceita". Custo: a ambiguidade entre texto e fato continua por ADR.

**P3 · `max_staleness_ms` solto no código (§3 #57).** São 30 ocorrências, contra o banimento de ADR-006/D2.
- **A — renomear para `asof_*`/`render_*`.** Custo: uma task sobre 30 ocorrências em `backend/src`.
- **B — emendar ADR-006 para admitir o nome no contexto em que ele aparece.** Custo: reabre a ambiguidade que a D2 existe para impedir.

**P4 · ADR-038 §7.1 (§3 #48).**
- **A — `observed_at = available_at` em linha MODELED.** Custo: reescreve uma coluna do índice (`ADR-038:394`).
- **B — manter D16.** Custo medido: nenhum, porque `ADR-038:215,337` mostra que §7.1 "não compra nada".

**P5 · Volume no pane do preço × "um painel, um denom" (§3 #62).**
- **A — emendar ADR-026 para admitir escala overlay sem eixo visível.** Custo: uma emenda.
- **B — dar ao volume um pane próprio.** Custo: layout e `design_gate` refeitos em `paineis-de-fluxo`.

**P6 · Disco do OI por polling (§3 #4).** O veto `Q-CAD-1` se apoiou em ~208 MB/ano; pela mesma aritmética com 496 B/linha, dá ~1 GB/ano para 4 símbolos `[INFERRED]`. O plano `SPEC-009/03:35` já devolve a decisão ao owner se a medição passar de 2× a estimativa.
- **A — manter 60 s.** Custo: ~1 GB/ano.
- **B — cadência maior ou retenção.** Custo: perde resolução de 1 min.

---

## §5 Redução de carga proposta (edições mecânicas, nenhuma decide nada)

Insumo linha a linha: `ACOES.tsv`. Tipos:
- **banner** — uma linha no topo do doc (ou na seção caduca) apontando quem prevalece;
- **status** — alinhar o cabeçalho ao ledger, no formato `Estado: ver harness pipeline state <feature> (em 2026-09-26: X)`, para não envelhecer de novo;
- **numero** — fato verificável: número, caminho, valor ou rótulo.

| tipo | linhas | o que cobre |
|---|---|---|
| banner | 41 | 9 PRDs · 5 SPECs (001, 002, 003, 006, 007) · 14 ADRs (001, 002, 003, 005, 008, 013, 014, 018, 019, 027, 028, 030, 031, 034) · 8 docs de topo · `decisoes-do-owner` (2 pontos) · 3 planos (002, 003, 006) |
| status | 19 | `adr/README.md` (índice 26→45) · 9 cabeçalhos de SPEC · 7 índices de plano (001, 002, 005, 006, 007, 008, 009) · `decisoes:643` · ADR-025 (D3 não implementada) |
| numero | 20 | SPEC-008 (4) · SPEC-009 (1) · planos 001/007/008/009 (5) · DESIGN_SYSTEM (4) · STITCH (3) · `decisoes:43,49,55` · gate-de-design · CLAUDE.md:71 |
| **total** | **80** | `[MEDIDO: wc -l ACOES.tsv → 80]` |

Um item fica fora do TSV por ser `[NÃO SEI]`: o universo do backfill (§3 #6).
As 6 pendências do §4 também ficam fora, porque não são mecânicas.

**Maior ganho por edição:** `docs/adr/README.md` refeito como índice de 45 linhas, com a coluna `estado de fato | aceite no texto | superado por`. Isso substitui o trabalho de abrir 45 cabeçalhos append-only (ADR-004:138-140). É a linha 1 do TSV.

**Não mexer:** corpo das ADRs (supersessão = banner/emenda, nunca reescrita); numeração de `decisoes-do-owner.md`; `docs/INDEX.md`.
