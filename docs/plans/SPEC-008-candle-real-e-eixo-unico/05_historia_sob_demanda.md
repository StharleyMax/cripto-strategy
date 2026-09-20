# Fase `05` — História sob demanda: a parede é assimétrica, e a tela tem de DIZER isso

> **Pixel:** `P5` — arrastar para trás carrega mais barra; passado o horizonte da fonte, o painel
> mostra um estado **nomeado**, distinto de "carregando" e distinto de "zero"
> **Componentes:** `web` (paginação, estado nomeado) · `sentimento` (backfill, recusa da rota)
> **Requisitos cobertos:** `RN-1` aplicado ao eixo do tempo · `SPEC-008` `D5` `D6` (§7)
> **Depende da fase `02`** — a detecção de borda é do eixo mestre que `02` define

## ⛔ PRÉ-REQUISITO ACRESCENTADO EM 2026-09-20 — esta fase estava planejada sobre uma premissa FALSA

**Ela pressupõe que paginar para trás traz barra. Hoje não traz, e a causa já está medida.**

O backfill de 90 dias — **2.148.504 linhas**, **1,641 GB**, 3 h de walk, run `ACCEPTED` — está no
banco e **é invisível para a rota**. `R-1` do acessor é `available_at <= t` com `t` = **a fatia**,
e a linha do backfill tem `available_at − bucket_end ≈ 33 h` ⇒ servi-la naquela fatia **seria
lookahead** e o acessor recusa, **corretamente**:

```bash
# a MESMA janela: 240 linhas no psql, 241 fatias servidas com absence SEM_PONTO em TODAS
psql -Atc "select count(*) from md.series where series_key_id='6486750c2f…' and symbol='BTCUSDT'
           and bucket_end > 1789732800000 and bucket_end <= 1789747200000"   # 240
curl -s ".../series-history?series_key_id=6486750c2f…&…&bar_policy=final_only"
#   241 rows, absence: {'SEM_PONTO': 241}
```

`[MEDIDO 2026-09-19, gates/T-01.5-dod6-medicao-e-achado-lookahead.md; n=240 linhas × 241 fatias]`

⇒ **Construído como este plano está escrito hoje, o `DoD 1` (*"3 arrastos aumentam a contagem de
barras"*) morde — não por defeito de paginação, mas porque não há o que paginar.** Arrastar
carrega `SEM_PONTO`, por mais páginas que se peça.

**A decisão que destrava está em [`ADR-042`](../../adr/ADR-042-dois-relogios-available-at-responde-ao-horizonte-de-conhecimento-nao-a-fatia.md)**
— `R-1` liga `available_at` ao **horizonte de conhecimento** (`K`), não à fatia; com `K = t` o
comportamento de decisão é idêntico ao de hoje, e `K > t` só é admitido sob
`ReadPurpose.RENDERING`. **A execução é `T-05.0`, e `T-05.1`/`T-05.8` dependem dela.**

⚠️ **O que isto NÃO autoriza:** afrouxar `R-1`. Se a contagem de barras subir **sem** que o
portão `D3` da `ADR-042` exista (`ENTRY_CONDITION` com `K > t` **levanta**), o lookahead que
`SPEC-001` §2.3 existe para impedir voltou — e voltou pela porta que esta fase abriu.

## O requisito, e ele é NOVO

`[PREMISSA-OWNER: 2026-09-19]`, literal — não estava no `PRD-008`:

> *"únco ponto é que a depender do zoom e movimentação da tela, tvz haja um espécie de navegação
> infinita, n sei como o TV e coinalyze resolvem isso. Então acho válido ser pensado essa navegação
> e zooms"*

## Os três números que fixam o desenho

| fato | número | fonte |
|---|---|---|
| profundidade de `klines` | desde **2019-09-08** | `[DOC: ADR-036/D5:61,152]` |
| teto por chamada | **1.500** velas, **weight 1**, contra **2.400/min** por IP | `[DOC: binance_klines_client.py:66; ADR-036:152]` |
| parede de `/futures/data/*` (OI, long/short) | **~30 dias** (`startTime` de −60 d → **HTTP 400**) | `[MEDIDO 2026-09-10, DOC: ADR-036/D5:58-59]` |

## ⛔ CORREÇÃO: a parede que importa **não é a da fonte** — é a do NOSSO armazém, e é um queijo suíço

`[MEDIDO 2026-09-19: 56 sondas de 60 grades contra /series-history]` — o `frontend-architect`
sondou o nosso Postgres em vez de citar a fonte, e mediu outra coisa:

| série | até onde o **nosso** armazém tem dado |
|---|---|
| `sum_open_interest` | morre entre **8 e 11 dias** |
| `cvd_source`, `count_long_short_ratio`, `sum_liquidation` | morrem entre **4 e 6 dias** |
| `klines_last`, `price_mark_close` | **0 em todas as 8 profundidades** (é `M2`: sem escritor) |
| `klines_volume` | **`0` a 6 dias e `59` a 8 dias** — ⚠️ **não monotônico** |

⛔ **A não-monotonicidade é o achado dentro do achado:** inferir parede a partir de contagem de
linhas é **errado por construção** — o armazém tem **buracos no meio**, não uma borda.

**Aritmética dura:** contra ~500 velas, `4h` = **83,3 dias** ⇒ **~11% do OI e ~6% do CVD** têm
dado **na primeira renderização**, não ao arrastar.

⇒ **`F3` entrega botões de TF que mostram tela quase vazia sem o backfill andar junto**, e `B1`
**não conserta isso**: reagregar sobre 5 dias de CVD devolve 500 velas das quais ~470 são vazias,
só que mais rápido. **Onde mora a reagregação e quanto há para reagregar são ortogonais.**

## Itens

| # | item | componente | requisito |
|---|---|---|---|
| 5.1 | Paginação para trás ao arrastar. ⛔ **A borda é detectada por aritmética sobre a grade — NUNCA por `barsInLogicalRange`**: com whitespace à frente ele devolve `barsBefore = −4.608`, detector **permanentemente disparado = laço infinito de paginação** `[MEDIDO 2026-09-19: probe3.mjs]` (`D-C3.4`) | `web`/`charts` | `D5` |
| 5.1b | `web` pagina **serial, uma requisição em voo por grade**, teto ~**5.000 slots** — a biblioteca **não tem `prepend`**, então o custo é **quadrático** em páginas; `setData` de 129.600 pts × 6 painéis = **752,6 ms** de thread principal `[MEDIDO 2026-09-19]` (`D-C3.5`) | `web` | `D5` |
| 5.2 | **Teto declarado de 90 dias** de 1m persistido por símbolo. Razão: `4h × 500 velas ≈ 83,3 dias` — 90 é o menor teto redondo que cobre `[Q2]`+`[Q3]` inteiros (`SPEC-008` §7.1) | `sentimento` | `D5` |
| 5.3 | ⛔ **Além do teto, a rota RECUSA — não serve `200` com zero linha.** `200` vazio ali é o `rc=0` ambíguo de `ADR-012`: indistinguível entre *"não há dado"* e *"o instrumento nunca alcançou"* | `sentimento` | `D5`, `ADR-012` |
| 5.4 | ⛔ **TRÊS estados distinguíveis, nunca dois** (`D-C3.6`): `absent` (dentro da cobertura, e mesmo assim sem ponto — é o **buraco** do queijo suíço) · `not-loaded` (ainda não paginamos) · `beyond-coverage` (fora do que o armazém/fonte alcança). Hoje os três são **indistinguíveis** | `web` | `D6`, `RN-1` |
| 5.5 | O horizonte vem do **envelope da rota** (`coverage`, item 3.5b da fase `03`), nunca de constante escrita à mão e **nunca inferido de contagem de linhas** — a contagem é não-monotônica e mentiria | `web` | `RN-5`, `D8` |
| 5.6 | Backfill one-shot/cron até o teto, **nunca** serviço de vida longa (`ADR-027/D1`) | `sentimento` | `D-i` |
| 5.7 | **Veredito do `ux-ui-mastery`** sobre o estado nomeado — `SPEC-008` fixa que ele **existe e é distinguível**; a aparência é do `design_gate` | `web` | `CLAUDE.md` §Design |

## DoD verificável — comando e universo

1. **Arrastar carrega.** Playwright contra o app real: `n = 3` arrastos sucessivos para trás
   aumentam a contagem de barras do painel de Preço, monotonicamente. **Morde** se a contagem
   estabilizar antes do teto.
   ⛔ **E morde HOJE por uma causa que não é paginação** — ver o pré-requisito no topo: sem
   `T-05.0`/`ADR-042` o arrasto pagina sobre `SEM_PONTO`. **Este `DoD` não é executável antes de
   `T-05.0`**, e tentar fechá-lo antes mede a paginação contra um armazém que a rota não serve.

0. ⛔ **`DoD` NOVO, e é o portão que impede a correção de virar afrouxamento** (`ADR-042`/`D3`):
   `as_of(..., purpose=ENTRY_CONDITION, t=T, knowledge_time=T+1)` **levanta**, e o mesmo sob
   `EXECUTION_SIMULATION`. **No MESMO arquivo de teste**, o caso positivo: `RENDERING` com
   `K = T+1` **devolve** a linha do backfill. **Morde** se qualquer um dos dois recusar errado —
   e morde em particular se só o caso negativo existir, porque aí o teste não distingue
   *"recusou certo"* de *"recusa tudo"*.
   **E a janela auto-verificável pelo owner:** `BTCUSDT`, `bucket_end ∈ (1789732800000,
   1789747200000]` — hoje `absence: {SEM_PONTO: 241}`; depois, **≥ 1** das 240 linhas servida,
   **sem** `R-1` ter sido removida.

2. **A parede assimétrica aparece e é NOMEADA.** Arrastando além de **~30 dias** em `4h`:
   o painel de Preço **continua** com barras **e** os painéis de OI e long/short mostram o estado
   nomeado — **os dois fatos no mesmo assert**, `n = 2` painéis.
   ⛔ **Morde se o painel apenas esvaziar**: esvaziar em silêncio é o defeito, não a ausência.

3. ⛔ **Ablação de `P5`.** Removido o estado nomeado, o painel **volta a esvaziar sem dizer nada** —
   captura antes/depois. Se o pixel não muda sob ablação, não era o estado nomeado.

4. **A rota recusa além do teto.** Requisição a `series-history` com janela iniciando antes de
   90 dias → **recusa explícita**, nunca `200` com `rows: []`.
   **Morde** com `200` vazio, `n = 2` casos (91 dias, 400 dias).

5. **Custo de cota declarado e respeitado.** Backfill de um símbolo até o teto =
   `90 × 1440 ÷ 1500` = **87 chamadas**, weight 1 cada, contra teto de 2.400/min
   `[INFERRED: aritmética sobre os números medidos acima]` ⇒ **< 4%** de um minuto de cota.
   **Morde** se o backfill exceder o orçamento declarado ou rodar como serviço de vida longa.

6. **Pegada de disco dentro do teto.** `count(*)` das 4 chaves de vela **≤ 2,07 M linhas** para
   4 símbolos (§3.6 da SPEC). **Morde** com crescimento sem teto — é o que `D5` existe para impedir.

7. ⭐ **Teto de latência da história sob demanda: `400 ms` para a barra nova aparecer**
   `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`. Fecha `[M-5]` do lado
   da paginação — o outro lado (**16 ms** por quadro de pan) é DoD 7 da fase `02`.

   **Como é medido:** Playwright contra o app real, `n ≥ 10` paginações disparadas por arrasto —
   do instante em que a borda é detectada até o primeiro frame em que a barra nova está
   **desenhada** (não em que a resposta chegou):

   - **`p95 ≤ 400 ms`**, `n ≥ 10` paginações;
   - **morde** com `p95 > 400 ms`, e morde **também** se o assert for de chegada da resposta em vez
     de pixel — `Assert de DOM não prova pixel`, e aqui a diferença é o `setData`.

   ⛔ **E os dois tetos compõem: a paginação NÃO pode rodar dentro do quadro de pan.** `setData`
   de 129.600 pontos × 6 painéis custa **752,6 ms** `[MEDIDO 2026-09-19]` — **47× o teto de 16 ms**
   da fase `02` e **~1,9× o teto de 400 ms desta**. ⇒ duas consequências de desenho, não de ajuste:
   a paginação é **assíncrona e fora do quadro**, e o teto de **~5.000 slots** por página (item
   5.1b) é o que mantém o `setData` dentro dos 400 ms. **Morde** se um pan durante paginação
   estourar os 16 ms da fase `02` — é o sintoma de que a paginação entrou no quadro.

8. `make verify` verde, `__pycache__` purgado antes.
