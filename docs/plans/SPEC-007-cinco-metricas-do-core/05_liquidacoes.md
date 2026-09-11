# Fase `05` — Liquidações: a métrica chega na tela sem depender do socket morto

> **Métrica:** M4 · **Fonte primária:** Coinalyze `liquidation-history` (`ADR-036/D4`) · **Painel:** **novo**
> **Componentes:** `sentimento` · `infra` (cota, segredo) · `web`
> **Requisitos:** `RF-1` `RF-2` `RF-3` `RF-6` `RNF-3` `RNF-4` · `RS-3.1..RS-3.7` · `RS-5` · `DEF-2`
> **Cota:** `N` u/ciclo — o **único** endpoint Coinalyze da feature; **2 u/min a `N = 10`, 5% do teto
> medido** na cadência de 5 min (`SPEC-007` §6.3)

## ⚠️ Esta fase ficou MAIS CARA, não mais barata — e é honesto dizer por quê

A primeira versão do plano dizia que a `05` reusaria o coletor Coinalyze construído na fase de CVD:
*"um endpoint a mais num coletor que já funciona"*. **Esse coletor deixou de existir.**
`SPEC-007`/`GA-7` tirou o CVD da Coinalyze (o dado vem da origem, no índice `[9]` do `klines`), então
**esta é a única integração de terceiro da feature, e ela é do zero**. O `/tech-lead` deve dimensioná-la
como integração completa.

**O que ela ganha em troca:** é a **última** fase, então nada mais depende dela; e `ADR-036/D4` já lhe
deu caminho de saída independente do socket morto.

## A decisão que define esta fase, e ela **diverge de `PRD-007`/`DEF-2`**

O PRD colocava o conserto do `!forceOrder@arr` **dentro** da fatia. `ADR-036/D4` inverte: a Coinalyze
vira **fonte primária** e o socket sai do caminho crítico.

**O argumento não é cota — é recuperabilidade.** Como o custo de uma requisição **independe da janela
pedida** `[MEDIDO 2026-09-10, MEDICAO §4.2.3-§4.2.5: 4 chamadas de 1.800 buckets custaram as mesmas 40
unidades que 4 de 5 buckets]`, um coletor REST 3 h fora recupera tudo em **uma requisição por
símbolo-endpoint**. O `!forceOrder@arr` ficou **~46 h** mudo e, sendo WebSocket, **aquele dado está
perdido para sempre** `[DOC: ACHADO-FORCEORDER.md, n=2 runs]`.

⇒ `DoD-1` desta fase é satisfazível **mesmo que o socket nunca seja consertado**.

**Custo aceito, e ele fica visível:** o coletor morto permanece de pé, gravando `REJECTED`, sem data de
conserto dentro desta feature. Dono: `plataforma-dados`/`T-07.11`. Gatilho de reabertura: quando alguma
consumidora exigir liquidação **por evento** em vez de por bucket — o que, sob `15min .. 4h`, é
`backtest`/`convergencia` (`NG-8`), não esta feature.

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 5.1 | **Antes de gravar a identidade:** comparar uma janela de `liquidation-history` com o payload de `!forceOrder@arr` e fixar `denom` (`[INFERRED: quote]`, `SPEC-007` §4.3) | `sentimento` | `RF-2` |
| 5.2 | Identidade `sum_liquidation` com `cohort ∈ {long, short}` — **duas linhas por instrumento**; somá-las apagaria o sinal | `sentimento` | `RF-2` |
| 5.3 | **Coletor Coinalyze de produção, do zero** — `RS-3.1..RS-3.7` inteiros: contador de cota próprio sobre `QuotaBucket`/`QuotaProbe`, recuo por `Retry-After` (nunca fixo cego), retentativa **por símbolo-endpoint**, bucket em curso não-final, cadência em configuração, requisições **espalhadas**, símbolo pedido e não devolvido vira `IngestGap`. Reusa `infra/coinalyze_history_client.py` e `infra/https_quota_probe.py` — **não reinventa** `[DOC: MEDICAO §6]` | `sentimento` | `RF-1`, `RNF-3` |
| 5.3b | Key só como `$COINALYZE_API_KEY`, de `.env` — **nenhuma chave em documento ou código** | `infra` | `RNF-4` |
| 5.3c | `RS-5`: série de terceiro chega à tela **rotulada**, com `published_error` | `web` | `RS-5` |
| 5.4 | Série **esparsa**: ausência é `SEM_PONTO`, **nunca zero** — e para `FLOW` isso é erro de tipo, não de UX | `sentimento` + `web` | `RN-1` |
| 5.5 | **Liveness por contiguidade e heartbeat, nunca taxa** — herda `T-07.11` (`docs/context/plataforma-dados/tasks.toml:1161`, hoje `blocked`), agora medindo a fonte REST | `sentimento` | `ACHADO-FORCEORDER.md` |
| 5.6 | `RF-6`: veredito `REJECTED` registra o **motivo** (`api_code` e/ou `notes` não-nulos). `core.silent-except` é BLOQUEIO e foi o que **produziu** `DEF-2` | `sentimento` | `RF-6`, `RS-4` |
| 5.7 | **Medir a retenção real** de `liquidation-history` — é o falsificador de `ADR-036/D4` | `sentimento` | `ADR-036` |
| 5.8 | **Painel novo**; `ui-designer` desenha, **veredito do `ux-ui-mastery` antes de fechar** | `web` | `RF-3`, `CLAUDE.md` §Design |
| 5.9 | e2e Playwright contra o app real | `web` | `DoD-3` |

## DoD verificável

1. `count(*)` de `md.series` para `sum_liquidation` (as **duas** coortes) **> 0**. Hoje: `0`
   `[MEDIDO 2026-09-10]`, e o coletor vivo acumulou **2 runs, ambos `REJECTED`, `n_returned = 0`**.
2. `GET /api/v1/series-history` → `n_points > 0` para `cohort="long"` **e** `cohort="short"`.
3. Playwright: **`N ≥ 30`** pontos distintos, **não** `SEM_PONTO`. ⚠️ Série esparsa: o e2e escolhe uma
   janela em que houve liquidação — **evento esparso não distingue conserto de ausência**, que é
   precisamente o alerta de `ACHADO-FORCEORDER.md`. O detector de liveness (5.5), não a taxa, é o que
   prova que o cano está vivo.
4. Run fechado da fonte com `n_written > 0`.
5. **Nenhum veredito `REJECTED` com `api_code` e `notes` ambos nulos** na fonte desta fase — universo:
   todos os runs da janela. Hoje, no `!forceOrder@arr`: **2 de 2 violam** `[MEDIDO 2026-09-10]`.
6. Retenção de `liquidation-history` medida, com comando e `n`.
6b. **Cota:** teste com fonte injetada prova que o coletor recusa ultrapassar 40 unidades/60 s e que um
   ciclo `N=10` **não** dispara em rajada; consumo medido em produção **≤ 5% do teto** a `N=10`,
   cadência 5 min (`SPEC-007` §6.3).
6c. **Fidelidade escalada ao `quant-architect`** (`ADR-036/D6`): é a **única** série de terceiro da
   feature e a **única sem oráculo** — a Binance não tem REST de liquidação, e o `!forceOrder@arr`,
   que seria a única comparação, está fora do caminho crítico. Entrada para ele: a divergência de
   `volume` da Coinalyze medida em 2026-09-10 (máx 566 bp, 104/120 exatos) é **maior** que a de
   `takerBuy` (máx 38,52 bp, 116/120), e a causa é `[NÃO SEI]` — hipótese barata não testada:
   alinhamento de bucket.
7. **Veredito `APPROVED` do `ux-ui-mastery`** sobre o painel novo.
8. `make verify` verde.

## Falsificador da fase

Se a retenção real de `liquidation-history` for **menor** que o tempo entre uma queda de coletor e o
alarme de liveness, a recuperabilidade que justificou `ADR-036/D4` é teórica — e a decisão de tirar o
socket do caminho crítico tem de ser reaberta.
