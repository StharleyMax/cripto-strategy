# Coinalyze como fonte do CORE em tempo real — medição de 2026-09-10

**Por que este arquivo existe:** o owner levantou que *"o CVD poderia vir do coinalyze, porém
aparentemente isso nunca se confirmou nem foi feito"* e pediu para delimitar o limite aceitável
de extração **em tempo real, não histórica** `[PREMISSA-OWNER: 2026-09-10]`.

Responde diretamente a `[Q4]` do `PRD-007` (fonte/agregação de CVD sob o veto a gigas de
aggTrades). **Entrada para o `/architect`. Não é decisão.**

Complementa `docs/medicao-coinalyze.md` (2026-08-25) — não o substitui. Onde diverge, diz.

---

## 1. O fato que muda o desenho: não há WebSocket

Todos os endpoints são REST `…-history` (`docs/medicao-coinalyze.md` §5). **"Tempo real" na
Coinalyze só pode significar polling**, e o teto do polling é a cota. Isso não é limitação de
como usamos a API — é o que ela oferece.

## 2. As 5 métricas do CORE contra a Coinalyze

`[MEDIDO 2026-09-10T20:2xZ · BTCUSDT_PERP.A · janela 3h · n=180 buckets por série]`

    python3 <script>  # cz2.py/cz3.py, ver §7

| métrica do CORE | endpoint | grade mais fina | defasagem do ponto mais novo | campos |
|---|---|---|---|---|
| **volume** | `ohlcv-history` | `1min` | **58 s** | `v` (+`o h l c`, `tx`) |
| **CVD** | `ohlcv-history` — **mesma chamada** | `1min` | **58 s** | `bv`, `btx` |
| **open interest** | `open-interest-history` | `1min` | **58 s** | OHLC do bucket |
| **liquidações** | `liquidation-history` | `1min` (esparsa) | **118 s** | `l`, `s` |
| **long/short ratio** | `long-short-ratio-history` | **`5min`** | **134 s** | `l`, `s`, `r` |
| *(funding, fora do CORE)* | `funding-rate-history` | `1min` | 58 s | OHLC |

### 2.1 Volume e CVD saem da mesma chamada — e a origem também os serve assim

`ohlcv-history` devolve `v` (volume do bucket) **e** `bv` (volume comprador agressor), logo
`delta_cvd = 2*bv - v`. `[MEDIDO 2026-09-10, n=30 buckets de 1min]` — sanidade `bv <= v` em 30/30.

⛔ **Isto NÃO é a fonte escolhida para volume nem para CVD.** `/fapi/v1/klines` da Binance serve
os dois na mesma resposta (`volume` no índice `[5]`, `takerBuyBaseVol` no `[9]`), mais fundo e
mais barato — e o `bv` da Coinalyze **é** o `takerBuyBaseVol` da Binance, exato em **116 de 120**
buckets `[MEDIDO 2026-09-10]`. Ver [`ACHADO-KLINES-CVD.md`](ACHADO-KLINES-CVD.md) e `ADR-036/D5`.

O que sobra desta seção, e é o que importa para a decisão que ficou: a Coinalyze **teria**
servido volume e CVD sem aggTrades. Isso deixou de ser necessário porque a origem os serve.

### 2.2 Long/short ratio a `1min` é VAZIO — achado novo, corrige leitura possível do doc

`[MEDIDO 2026-09-10, janela 7d]`

| intervalo | n | defasagem |
|---|---:|---:|
| `1min` | **0 — vazio, não erro** | — |
| `5min` | 2.006 | 134 s (2,2 min) |
| `15min` | 672 | 134 s (2,2 min) |
| `30min` | 336 | **1.034 s (17,2 min)** |
| `1hour` | 168 | 1.034 s |
| `daily` | 7 | 73.034 s |

Dois pontos:
1. `docs/medicao-coinalyze.md` §2.3 diz `has_long_short_ratio_data = true` nos perpétuos da
   Binance. É verdade, e **não implica `1min`**. A grade mais fina real é **`5min`**.
   `[INFERRED: o limite é da Binance, que publica long/short em 5min — não da Coinalyze]`.
   **Não medido:** confirmação contra a API da Binance. Barato de fazer, não fiz.
2. **A defasagem salta em degrau, não degrada suave:** 2,2 min até `15min`, e **17,2 min** de
   `30min` para cima. Um requisito de "atualizar a cada 30min" é 8× pior em frescura do que
   parece.

⇒ **O painel de long/short não pode prometer 1 minuto.** O DoD-VERTICAL daquela fatia tem de
escrever 5min, ou a fase reprova por uma promessa que a fonte não sustenta.

## 3. A cota — o teto real do "tempo real"

`[MEDIDO 2026-09-10, n=41 requisições]`

    rajada sequencial em /v1/exchanges, parando no primeiro nao-200
    → 40 aceitas · 429 na #41 apos 11,2 s · Retry-After: 49.119

**40 requisições por minuto.** Duas propriedades que decidem o desenho:

- **A API não publica cota enquanto você está dentro dela.** Zero header de `X-RateLimit-*`
  numa resposta `200` (medido em `/exchanges`). Você só descobre o teto batendo nele ⇒
  **o contador de cota tem de ser nosso**, mantido no lado do coletor. Isto refina o defeito
  3.1 de `docs/medicao-coinalyze.md` ("não existe telemetria de cota"): não é lacuna da nossa
  plataforma, é ausência na origem.
- **Divergência com a medição anterior, e ela importa:**
  `docs/context/plataforma-dados/medicoes/T-03.7-balde-de-cota/06_rampa_coinalyze.json`
  registra `accepted: 40`, `429` no degrau 41 — **meu número reproduz o dela exatamente** —
  porém concluiu `recoil_source: "POLICY_NO_RETRY_AFTER"`, isto é, **não viu `Retry-After`**.
  Hoje a API **devolveu** `Retry-After: 49.119`. `[NÃO SEI]` se a API mudou, se o header só
  aparece em certos caminhos, ou se a sonda o descartava. **Reconciliar isto é tarefa do
  `/architect`** — um recuo fixo de 60 s quando a origem diz 49 s desperdiça ~18% da janela.

### 3.1 Lote de símbolos — funciona, e não economiza cota

`[MEDIDO 2026-09-10]` `symbols=` aceita lista separada por vírgula numa só requisição:

| símbolos pedidos | séries devolvidas | latência | bytes |
|---:|---:|---:|---:|
| 1 | 1 | 283 ms | 3.833 |
| 4 | 4 | 443 ms | 14.656 |
| 10 | 10 | 421 ms | 34.155 |
| 20 | **19** | 601 ms | 64.152 |

O 20º ausente é `MATICUSDT` — consistente com `docs/medicao-coinalyze.md` §1.4 (a Coinalyze não
serve símbolo deslistado). Terceira testemunha do mesmo fato.

Perpétuos Binance na Coinalyze hoje: **n=781** (`/future-markets`), contra 764 medidos em
2026-08-25. O universo cresce; não trate 764 como constante.

O lote economiza **latência e conexões**, não cota — ver §4.

## 4. O contrato de cota — medido

    unidade = 1 (símbolo × endpoint × requisição)
    custo(requisição) = n_símbolos
        INDEPENDENTE de `interval`, de `from`/`to`, e do nº de buckets devolvidos
    teto    = 40 unidades por janela deslizante de 60 s
    sinal   = NENHUM em resposta 200; só o próprio 429 e seu `Retry-After`
              (49,1 s · 56,8 s · 59,0 s observados)

Três desenhos independentes convergem no mesmo teto de 40 `[MEDIDO 2026-09-10]`:

| desenho | observado |
|---|---|
| 40 requisições de 1 símbolo | 40 aceitas, `429` na #41 |
| 1 requisição de 40 símbolos | aceita; a **2ª** dá `429` |
| 4 requisições de 10 símbolos, **janela de 3 h** (1.800 buckets cada) | 4 aceitas, `429` na 5ª |

O terceiro é o que fixa a independência da janela: **1.800 buckets custam o mesmo que 50.**

**A API não publica cota enquanto você está dentro dela** — zero header `X-RateLimit-*` num
`200`. O contador tem de ser nosso. Isto refina o defeito 3.1 de `docs/medicao-coinalyze.md`
("não existe telemetria de cota"): não é lacuna da nossa plataforma, é ausência na origem.

⚠️ **Divergência com `T-03.7`, não reconciliada:**
`docs/context/plataforma-dados/medicoes/T-03.7-balde-de-cota/06_rampa_coinalyze.json` registra
`accepted: 40` — **o mesmo número** — mas concluiu `recoil_source: "POLICY_NO_RETRY_AFTER"`,
isto é, não viu `Retry-After`. Hoje a API o devolveu três vezes. `[NÃO SEI]` se a API mudou, se
o header só aparece em certos caminhos, ou se a sonda o descartava. Um recuo fixo de 60 s quando
a origem diz 49 s desperdiça ~18% da janela.

### 4.1 O orçamento: a cadência paga, a granularidade é de graça

Custo médio = `4 endpoints × N símbolos ÷ cadência_min`, contra o teto de 40:

| cadência | N=4 (piloto) | N=10 (alvo) | N máximo a 80% da cota |
|---|---:|---:|---:|
| 1 min | 16 u/min (40%) | 40 u/min (**100% — não cabe**) | 8 |
| 2 min | 8 u/min (20%) | 20 u/min (50%) | 16 |
| **5 min** | **3,2 u/min (8%)** | **8 u/min (20%)** | **40** |
| 15 min | 1,1 u/min (3%) | 2,7 u/min (7%) | 120 |

Puxar `interval=1min` a cada 5 minutos devolve os 5 buckets de uma vez, com resolução de 1 min
idêntica, por **1/5** do custo de puxar a cada minuto.

Com `D5` (operação a **15min–4h**), a cadência de 5 min dá 3 atualizações por candle de 15 min.

⚠️ **Média não é pico.** A janela é deslizante de 60 s: um ciclo `N=10` disparado de uma vez são
40 unidades **instantâneas**, que a ocupam inteira. As requisições têm de ser **espalhadas** ao
longo da cadência. Isto é requisito, não otimização — virou `RS-3.6` na `SPEC-007`.

⚠️ **Retentativa é por símbolo-endpoint que falhou**, nunca do ciclo inteiro.

### 4.2 O universo de símbolos do owner cabe

`[PREMISSA-OWNER: 2026-09-10]` — *"no piloto estamos rodando 4 symbols, quando virar n vamos
chegar a 10"*. Ver `DECISOES-OWNER.md` `D4`.

A 5 min de cadência, N=10 custa **8 u/min = 20% da cota**. Cabe com folga de 4×.

⚠️ **Cada corretora multiplica o custo**, porque a unidade é `símbolo × endpoint`: multi-corretora
funciona numa só chamada `[MEDIDO 2026-09-10: Binance `.A` e OKX `.3` devolvidas juntas]`, mas
10 símbolos em 3 corretoras a 5 min custam 24 u/min (60%).

### 4.3 Recuperação de lacuna é quase de graça

Como a janela não custa, **um coletor que ficou 3 h fora recupera tudo em UMA requisição por
símbolo-endpoint** (medido: 180 buckets/símbolo numa chamada, 909 ms). A N=10, recuperar 3 h
custa 40 unidades — um único ciclo.

Contraste: o forceOrder ficou **~46 h** em silêncio ([`ACHADO-FORCEORDER.md`](ACHADO-FORCEORDER.md))
e, sendo WebSocket, **aquele dado está perdido para sempre**. Fonte REST com janela gratuita
transforma indisponibilidade em atraso recuperável em vez de buraco permanente.

⚠️ Limitado pela retenção da origem: ~1,5 dia a 1min, ~7 dias a 5min. Recupera **horas, não
semanas**.

## 5. O que isto NÃO resolve

- **Bucket mais novo é PARCIAL.** Defasagem de 58 s significa que o ponto mais novo é o minuto
  em curso, ainda aberto (medido: `v=4,413` no último bucket contra 10–44 nos vizinhos). O
  coletor tem de marcar `is_final=false` ou descartá-lo, sob pena de gravar volume subestimado
  e violar a regra anti-lookahead. Interage com `T-03.9` (`observer_id`/`available_at`).
- **Retenção intraday é rasa** (`docs/medicao-coinalyze.md` §1.2/§1.3: teto por **contagem de
  pontos**, ~2.000). A Coinalyze **não** é fonte de backfill profundo em 1min — para `DoD-3`
  (`[Q7]` do PRD-007, dias de backfill) ela dá ~1,5 dia a 1min. Backfill maior é outra fonte.
- **`coinalyze-fora-da-quarentena` é outro assunto.** `SPEC-005` trata de `observer_region`,
  fórmula MODELED e store de defasagem — Coinalyze como **testemunha de disponibilidade**, não
  como fonte do CORE. Congelá-la (decisão `D3`) **não** bloqueia usá-la como fonte aqui, e as
  duas coisas não devem ser fundidas sem o `/architect` dizer que são a mesma.
- **Nada disto foi decidido.** É medição. A escolha Coinalyze × Binance por métrica, e o custo
  de depender de terceiro para o CORE, é do `/architect` com co-assinatura do `quant-architect`.

## 6. Código que já existe — não reinventar

| arquivo | o que é |
|---|---|
| `infra/coinalyze_history_client.py` (105 ln) | cliente HTTP genérico, `fetch(path)`. **Sem** lógica por endpoint e **sem** controle de cota |
| `infra/https_quota_probe.py` | `QuotaBucket`/`QuotaProbe`, e trata o `429` que `urlopen` esconde |
| `infra/quota_ramp_cli.py` | a rampa que produziu `06_rampa_coinalyze.json` |
| `infra/coinalyze_one_shot_cli.py` | chamada avulsa |
| `domain/coinalyze_daily_series.py` | série **diária** — não serve o caminho de 1min |

`[MEDIDO 2026-09-10]` sob `backend/src/modules/sentimento/`: `coinalyze` citado em
**21** arquivos de `domain`, **9** de `infra`, **4** de `use_cases`.
⚠️ contagem de arquivos que citam o termo, **não** de funcionalidade pronta.

## 7. Como reproduzir

Scripts da medição (a chave vem de `.env`, nunca literal):
`/tmp/claude-1002/.../scratchpad/cz.py` (cliente) · `cz2.py` (frescura por série) ·
`cz3.py` (long/short por granularidade) · `cz4.py` (aritmética do CVD) ·
`cz5.py` (rampa até o 429) · `cz6.py`/`cz8.py` (lote de símbolos).

⚠️ São de scratchpad de sessão — **efêmeros**. Se o `/architect` for depender deles, promova
para `backend/src/modules/sentimento/infra/` como CLI de medição, ao lado de `quota_ramp_cli.py`.
