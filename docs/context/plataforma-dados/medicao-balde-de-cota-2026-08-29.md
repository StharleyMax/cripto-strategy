# Medição do balde de cota — `T-03.7` / `CA-F0-4` / DoD `D3.11` e `D3.12`

**Data:** 2026-08-29 · **Task:** `T-03.7` (`CST-23`) · **Componente:** `sentimento`
**Fecha:** `D3.11` (topologia do balde) e `D3.12` (dois dos três baldes são cegos)
**Precede:** `T-07.7` (broker de cota em regime) e `T-08.13` (S4 retrospectiva)

---

## 0. A validade destes números, ANTES dos números

**Todo número deste documento é de um momento, de um IP e de um endpoint.** Nenhum é constante do
sistema, e ler qualquer um deles como constante é o defeito que este cabeçalho existe para impedir —
`T-07.7` calibra em cima daqui.

| qualificador | valor | por que muda o número |
|---|---|---|
| **momento** | 2026-08-29, **14:42Z → 15:06Z** (24 min) | limite de taxa é por janela; carga do fornecedor varia por hora e por dia |
| **observador (IP)** | `177.220.181.61` · Curitiba/PR/BR · `AS14868 LIGGA` · **residencial, NÃO a VPS** | **limite da Binance é POR IP.** A VPS de produção é outro IP, e a `observer_region` dela **nem foi decidida** (`SPEC-001` §9.2 lista as três faltas de VPS como abertas) |
| **borda de rede** | `x-amz-cf-pop: GRU1-P6` (CloudFront São Paulo) | o caminho é visível na resposta — evidência direta a favor de `[GAP G7]` |
| **endpoint** | um por balde, nomeado em cada seção | peso e limite são por rota, não por host |
| **universo** | **uma passada por experimento** | janela rolante: uma segunda passada é uma segunda medição, não mais `n` da primeira |

Comando do observador: `curl -s https://ipinfo.io` `[MEDIDO 2026-08-29T14:42Z]`.

---

## 1. `D3.12` — os três baldes, e **dois são cegos**

**Comando:** `python -m src.modules.sentimento.infra.quota_ramp_cli headers`
**Universo:** 3 baldes × 1 requisição = **3 respostas**, todas `200` `[MEDIDO 2026-08-29T14:59:29Z]`.

| # | balde | endpoint medido | contador na resposta | veredito |
|---|---|---|---|---|
| 1 | `binance-fapi` | `GET /fapi/v1/depth?symbol=BTCUSDT&limit=5` | **`x-mbx-used-weight-1m: 2`** | **OBSERVED** |
| 2 | `binance-futures-data` | `GET /futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1` | **nenhum header `x-mbx-*`** | **CEGO** |
| 3 | `coinalyze` | `GET /v1/exchanges` | **nenhum header de cota** | **CEGO** |

### Por que cada um é cego — e "cego" aqui é **medido**, não suposto

**`/futures/data/*`** devolve `200` com **zero** headers `x-mbx-*`. O bloco completo que ele devolve
é: `content-type`, `content-length`, `date`, `server: nginx`, `vary`, os quatro `access-control-*`,
`content-security-policy`, `cache-control`, `expires`, `pragma`, `strict-transport-security`,
`x-content-type-options`, `x-frame-options`, `x-xss-protection`, `x-cache`, `via`, `x-amz-cf-pop`,
`x-amz-cf-id`. **Nginx, CORS, CSP, HSTS e CloudFront — e nada de cota.** Não existe numerador para a
razão *consumido / limite*: a contagem é local ou não existe.

**Coinalyze** devolve `200` com ~~**8 headers**~~ **10 headers** (⚠️ **corrigido 2026-08-29 pelo
`/review`, e a correção é a disciplina funcionando contra o próprio autor:** o parágrafo dizia `8` e
**enumerava 10 na mesma frase** — refutado pelo comando ao lado, sem precisar de fonte nova), e
nenhum é cota: `cf-cache-status`, `cf-ray`, `connection`, `content-length`, `content-type`, `date`,
`etag`, `nel`, `report-to`, `server: cloudflare`. Nem consumido, nem restante, nem janela.

```bash
python3 -c "import json;[print(x['bucket'], len(x['headers'])) for x in \
  map(json.loads, open('medicoes/T-03.7-balde-de-cota/03_headers_dos_tres_baldes.jsonl'))]"
# binance-fapi 24 · binance-futures-data 22 · coinalyze 10        [MEDIDO 2026-08-29]
```

**A conclusão não muda** — nenhum dos 10 é de cota, e `D3.12` continua fechado. O que muda é que o
número publicado passa a ser o que o comando devolve. O `8` também foi para `docs/INDEX.md`, que é
**append-only**: lá a correção é **linha nova**, nunca edição. O limite de **40 chamadas/min** é `[DOC]` do
fornecedor — e a §3 abaixo é a primeira vez que ele foi **confirmado por medição**.

**O cego que importa é o do screener.** `/futures/data/*` é onde vive a varredura transversal, e
`openInterestHist` **não tem batch** (1 símbolo por chamada). É o balde mais caro do projeto e é o
que não se deixa ler. `PRD-001` `CA-F3-9` já dizia que contagem local conservadora **é o caso geral,
não adaptação a um fornecedor pior**; esta medição é a terceira reprodução independente disso.

**Onde isso vive no código:** [`domain/quota_bucket.py`](../../../backend/src/modules/sentimento/domain/quota_bucket.py)
declara os três com o motivo da cegueira **obrigatório por construção** — um balde `BLIND` sem
`blindness_reason` **não é construível**, e o teste que prova isso é
`test_a_bucket_cannot_be_declared_blind_without_saying_why`.

---

## 2. `D3.11` (parte 1) — a topologia, resolvida **sem provocar ninguém**

### A pergunta

`PRD-001` `CA-F4-17` / `R7`: *"2,85 min/varredura se por endpoint, 14,25 min se compartilhado —
**CONTESTADO e não testado**"*. Se `/futures/data/*` e `/fapi/v1/*` gastam o **mesmo** balde, uma
varredura transversal de 5 min chega com 15 min de defasagem e **o guard anti-lookahead escrito em
`bucket_end` vira lookahead real** em `scope: CrossSection`.

### O truque, e por que ele é mais barato que a rampa

`/futures/data/*` não publica contador — mas se ele **compartilhasse** o balde com `/fapi/v1/*`,
gastá-lo teria de **mover o contador do vizinho**. Lê-se o contador, gasta-se o balde cego, lê-se de
novo.

### ⚠️ O controle, e ele é o ponto — o reconhecimento SEM controle deu a resposta ERRADA

**Antes de escrever o controle eu medi por acaso e concluí o contrário.** Em 14:42:18Z uma chamada a
`/futures/data/openInterestHist`, em 14:42:19Z uma a `/fapi/v1/depth` → `x-mbx-used-weight-1m: 3`.
Como `depth?limit=5` pesa **2** `[MEDIDO 2026-08-29T14:42:36Z: três `depth` seguidas → 5, 7, 9]`,
o `3` parecia ser `2 + 1` e apontava para **COMPARTILHADO**. **Era confundimento:** um
`GET /fapi/v1/time` (peso 1) da checagem de conectividade caiu no mesmo minuto. A leitura de um par
sem base **não distingue "o vizinho gastou" de "eu já tinha gasto"**.

**Comparar o delta carregado contra ZERO teria "provado" compartilhamento todas as vezes** — as
próprias leituras observadas custam peso. Por isso a base é medida **do mesmo jeito, com a carga
removida**, e o veredito compara os **dois deltas entre si**.

### O experimento e o resultado

**Comando:** `python -m src.modules.sentimento.infra.quota_ramp_cli coupling 20`
**Janela:** 2026-08-29T**15:01:00Z → 15:01:12Z** (alinhada na borda do minuto de propósito: a janela
de `x-mbx-used-weight-1m` é de 1 min, e um par que a atravesse devolve delta negativo — que o
domínio recusa como `INCONCLUSIVE`, nunca como zero).
**Universo:** 4 leituras observadas + **20 chamadas ao balde cego**, `load_delivered: 20`, `0` falhas.

| leitura | `x-mbx-used-weight-1m` |
|---|---|
| base, antes | **2** |
| base, depois (nada entre as duas) | **4** |
| carregada, antes | **6** |
| carregada, depois (**20 chamadas a `/futures/data/*` entre as duas**) | **8** |

```
delta base      = 4 - 2 = 2      (custo da própria leitura: depth?limit=5 pesa 2)
delta carregado = 8 - 6 = 2      (idêntico)
atribuível às 20 chamadas cegas = 2 - 2 = 0
```

### **`SEPARATE`** `[MEDIDO 2026-08-29T15:01Z, n=20 chamadas cegas, 1 passada]`

Se os baldes fossem compartilhados a peso 1, o delta carregado teria sido **22**. Foi **2**. As duas
hipóteses divergem por **11×**, e o controle escolheu.

### ⚠️ O que este veredito **NÃO** diz, e a distinção é de domínio

`SEPARATE` significa **"gastar `/futures/data/*` não move `x-mbx-used-weight-1m`"**. Isso é
exatamente o que se precisa para orçar o balde **observado** — e **não** prova que `/futures/data/*`
não tenha limite próprio. Uma hipótese alternativa sobrevive à medição: os baldes serem os mesmos e
o peso de `openInterestHist` ser genuinamente **0**. As duas são indistinguíveis por este
experimento, e as duas dão a mesma consequência prática para o orçamento do balde observado.

**⇒ a cegueira de `/futures/data/*` NÃO é curável lendo o vizinho.** É por isso que a rampa continua
sendo necessária, e é o que a §3 tenta.

---

## 3. `D3.11` (parte 2) — a rampa até o primeiro `429`

Duas passadas, uma por balde cego. **Rampa e não martelo:** requisições **em série**, intervalo
partindo de **1,0 s** e encolhendo por fator **0,93** até o piso de **0,25 s**; para no **primeiro**
`429`; recua **uma vez**; **não sobe de novo para "confirmar"**.

### 3.1 `binance-futures-data` — **teto NÃO alcançado**, e o ledger recusa publicar um limite

**Comando:** `... quota_ramp_cli ramp binance-futures-data 150`
**Endpoint:** `GET /futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1`
**Janela:** 2026-08-29T**15:02:29Z → 15:03:57Z** (88 s) · **Universo: 150 requisições**

| | |
|---|---|
| despachadas / não despachadas | **150 / 0** |
| aceitas (`200`) / `429` / outros | **150 / 0 / 0** |
| pesos observados | **`None` nos 150 degraus** — a cegueira aparecendo **no dado**, não só na prosa |
| taxa sustentada | **≈ 102 req/min** (150 requisições em 88 s) |
| latência min/mediana/p95/máx | **0,269 / 0,276 / 0,365 / 0,469 s** |
| **conclusão** | **`CEILING_NOT_REACHED`** · `publishes_a_ceiling: false` |

> `150 requisicao(oes) ACEITA(s) de 150 despachada(s), nenhum 429: LIMITE INFERIOR de 150,`
> `nunca o limite. A rampa acabou, a cota nao`

⚠️ **A `reason` mudou de GRANDEZA em 2026-08-29 (conserto de `F2`, achado do `/qa`), e não de
valor.** Ela publicava `LIMITE INFERIOR de {despachadas}`, e despachadas **inclui as recusadas por
outro motivo que não `429`**. Nesta passada as duas contagens são 150, então **o número estava certo
por coincidência**; numa passada sem chave (150 × `401`) ela imprimia *"LIMITE INFERIOR de 150"* com
**zero sucessos** `[MEDIDO 2026-08-29 pelo `/qa`]`. Hoje o piso publicado é **ACEITAS**, e uma
passada sem nenhum sucesso cai em `INCONCLUSIVE`. Ver [`07_vereditos_recomputados.txt`](medicoes/T-03.7-balde-de-cota/07_vereditos_recomputados.txt),
recomputado dos mesmos 150 degraus crus.

**`≥ 150 requisições em 88 s (≈102/min) sem throttle`, e NADA além disso.** O número não é um
limite; é um piso.

### ⚠️ E o instrumento tem teto próprio — **MEDIDO**, e ele é a razão de não haver `429` aqui

Requisições **em série** custam `piso do intervalo + latência`. Com piso **0,25 s** e latência
mediana **0,276 s**, a taxa máxima que esta bancada consegue produzir é

```
60 / (0,25 + 0,276) = 114 req/min
```

**`[MEDIDO 2026-08-29, n=150 latências]`. Um limite acima de ~114 req/min é INALCANÇÁVEL por rampa
serial a partir deste observador** — e alcançá-lo exigiria **concorrência**, que é rajada e não
rampa: com `n` requisições em voo o **ordinal do primeiro `429` deixa de ser definido**, e o ordinal
é o número que todo o exercício existe para produzir.

### A recusa da concorrência é uma DÍVIDA NOMEADA — com dono e gatilho, não só com argumento

⚠️ **Acrescentado em 2026-08-29 por achado do `/review` (`WARNING`):** o argumento acima foi
**aceito** por ele e está medido, mas tinha **1 de 3** da forma que as ADRs desta casa (`ADR-012`,
`ADR-013`) carregam. `grep -rn "reabertura|reabrir|dono|gatilho|falsificador"` neste documento →
**0 ocorrência** `[MEDIDO pelo `/review`]`. Faltavam **dono** e **gatilho de reabertura observável**
— e *"`T-07.7` ia herdar um `[NÃO MEDIDO]` sem saber que condição o reabriria"*.

| | |
|---|---|
| **o que fica recusado** | medir o limite de `/futures/data/*` por **rampa concorrente** |
| **por quê** | o produto do exercício é o **ordinal do primeiro `429`**; com `n` requisições em voo a ordem de chegada **no servidor** é desconhecida, então o ordinal **deixa de ter referente**. Concorrência não mede mais rápido — mede **outra coisa** |
| **o custo declarado** | o limite absoluto de `/futures/data/*` fica **`[NÃO MEDIDO]`** enquanto o teto do instrumento (**114 req/min**, `[MEDIDO n=150]`) estiver abaixo dele |
| **dono** | **`quant-architect`** — `harness policy --key agents.by_component` dá `sentimento` → `.claude/agents/quant-architect.md` `[MEDIDO 2026-08-29]`. **Não é decisão de builder**, e esta seção **registra** a dívida em vez de decidi-la |
| **gatilho de reabertura (observável, qualquer um dos três)** | **(G1)** existir observador em **VPS** com latência mediana medida **< 0,10 s** contra `fapi.binance.com` — o teto do instrumento passa a `60/(0,25+0,10) = 171 req/min` e a rampa serial volta a poder alcançar limites que hoje não alcança. Comando: `quota_ramp_cli ramp binance-futures-data <n>` da VPS, e `08_latencias_e_teto_do_instrumento.txt` recalculado · **(G2)** o screener de `F3` exigir taxa sustentada **> 102 req/min** em `/futures/data/*` — aí o piso medido deixa de cobrir o uso real e o limite vira parâmetro, não curiosidade · **(G3)** qualquer resposta `429` observada em `/futures/data/*` em operação normal — ela dá o ordinal de graça, sem rampa nenhuma |
| **falsificador desta recusa** | se alguém desenhar uma medição concorrente em que **o ordinal continue definido** (por exemplo: contagem por janela com `n=1` em voo por vez, `k` janelas em paralelo contra `k` IPs distintos), a recusa cai — ela é sobre **este** desenho de rampa, não sobre concorrência em geral |

**Nenhuma ADR foi aberta por este builder, e isso é deliberado:** emitir ADR é ato de owner
(`CLAUDE.md`, *"o ledger é a identidade do estado"*). O que está acima é a dívida **registrada com
dono e gatilho**, na forma que o `/review` pediu, para que `T-07.7` a herde sabendo o que a reabre.

**⇒ `D3.11` fica PARCIALMENTE fechado para este balde.** A topologia está resolvida (§2); o **limite
absoluto** de `/futures/data/*` continua **`[NÃO MEDIDO]`**, com um piso medido de 102/min. Escrever
qualquer outro número seria inventá-lo.

### 3.2 `coinalyze` — **`429` alcançado**, e ele confirma o `[DOC]` pela primeira vez

**Comando:** `... quota_ramp_cli ramp coinalyze 70` (com `$COINALYZE_API_KEY` do `.env`)
**Endpoint:** `GET /v1/exchanges` · **Janela:** 2026-08-29T**15:04:17Z → 15:04:42Z** (25 s até o
`429`; o processo só terminou às 15:05:42Z porque **recuou 60 s**)
**Universo: 41 requisições despachadas**

| | |
|---|---|
| despachadas / não despachadas | **41 / 0** |
| aceitas (`200`) / `429` / outros | **40 / 1 / 0** |
| **`429` na requisição** | **41** |
| **ACEITAS antes do `429`** | **40** |
| `Retry-After` na resposta `429` | **AUSENTE** |
| recuo | **60 s**, fonte **`POLICY_NO_RETRY_AFTER`** |
| **conclusão** | **`THROTTLED`** · `publishes_a_ceiling: true` |

**`40 chamadas cabem; a 41ª é recusada`** `[MEDIDO 2026-08-29T15:04Z, IP residencial de Curitiba,
`/v1/exchanges`, 1 passada, n=41]`. O `[DOC]` do fornecedor (*"40 chamadas/min por key"*, `.env`)
**passou de documentação a fato datado.**

### ⚠️ `Retry-After` **NÃO veio** — e o registro disso é metade do resultado

`RFC 9110` §10.2.3 torna `Retry-After` **opcional**, e a Coinalyze não o manda. Um recuo que
devolvesse só um número tornaria *"o fornecedor mandou esperar 60 s"* indistinguível de *"chutei 60 s
porque ninguém disse nada"*. Por isso toda decisão de recuo carrega a **fonte**:
`POLICY_NO_RETRY_AFTER` é o que ficou registrado, e é o que `T-07.7` herda.

### ⚠️ 41 **não** é o número que cabe — e este defeito nasceu **nesta passada**

O veredito trazia um único campo `requests_before_throttle`, e ele saiu **`41`** ao lado de
`accepted: 40`. **São grandezas diferentes:** a 41ª foi **recusada**; o que cabe na janela é **40**.
Um broker calibrado em `41` mandaria **exatamente uma requisição a mais por janela, para sempre** —
e pareceria estar seguindo uma medição.

O campo foi **partido em dois** no mesmo ato — `throttled_at_request` e `accepted_before_throttle` —
com nomes que não se trocam, e a regressão está congelada em
`test_the_ordinal_of_the_429_is_not_the_number_that_fits_in_the_window`. **O registro cru das 41
observações foi preservado e o veredito foi RECOMPUTADO dele**, com o mesmo universo:

```
=== coinalyze  (universo: 41 degraus crus)
  429 na requisicao        : 41
  ACEITAS antes do 429     : 40
  motivo : 429 na requisicao 41 desta passada; 40 foram ACEITAS antes dela.
           O que cabe na janela e 40, nao 41
```

### O que esta passada **não** resolve

**A semântica da janela.** As 40 aceitas couberam em **25 s**, não em 60. Se o balde é
**minuto fixo** ou **janela rolante de 60 s** é indistinguível por **uma** passada, e a diferença
importa: sob janela rolante, 40 chamadas em 25 s deixam a key **muda pelos 35 s seguintes**.
`[NÃO MEDIDO]`, e é parâmetro de `T-07.7`.

---

## 4. O que `T-07.7` pode assumir — e o que ela **não** pode

| pode assumir | força | de onde |
|---|---|---|
| `/fapi/v1/*` publica `x-mbx-used-weight-1m` em toda resposta; `depth?limit=5` pesa **2** | `[MEDIDO 2026-08-29, n=3 chamadas consecutivas: 5→7→9]` | §1, §2 |
| gastar `/futures/data/*` **não move** o contador de `/fapi/v1/*` ⇒ orçar o balde observado **sem** somar o screener | `[MEDIDO 2026-08-29, n=20, com base de controle]` | §2 |
| Coinalyze aceita **40** chamadas e recusa a 41ª | `[MEDIDO 2026-08-29, n=41, 1 passada, 1 IP]` | §3.2 |
| Coinalyze **não manda `Retry-After`** no `429` ⇒ o recuo é **nosso**, e conservador | `[MEDIDO 2026-08-29, n=1 resposta 429]` | §3.2 |
| `/futures/data/*` suporta **≥ 102 req/min** deste observador sem throttle | `[MEDIDO 2026-08-29, n=150]` — **piso, não teto** | §3.1 |
| contagem **local** é obrigatória em 2 dos 3 baldes | `[MEDIDO 2026-08-29]` | §1 |

| **NÃO** pode assumir | por quê |
|---|---|
| o limite absoluto de `/futures/data/*` | **`[NÃO MEDIDO]`** — a rampa serial teto em **114 req/min** e o limite está acima disso |
| que `40` vale para a VPS | **limite é por IP**, e este número é de um IP residencial em Curitiba (`AS14868`). A região da VPS **nem foi decidida** (`SPEC-001` §9.2) |
| que `40` vale a qualquer hora | **uma passada, um momento** (15:04Z de um sábado) |
| a semântica da janela (fixa × rolante) da Coinalyze | `[NÃO MEDIDO]` — §3.2 |
| que `/futures/data/*` não tem limite próprio | `SEPARATE` diz que ele não é **contabilizado** pelo contador do vizinho, não que não exista — §2 |

**A regra que sai daqui para `T-07.7`:** o broker conta **localmente** e **conservador**, porque em
dois dos três baldes não há o que ler; e o parâmetro de Coinalyze é **40 por janela com margem**,
nunca 41 — a medição diz onde o `429` **começa**, e o orçamento tem de ficar **abaixo** dele.

---

## 5. Reprodução

Os quatro comandos, na ordem em que foram rodados. **`coupling` antes de `ramp` é deliberado:** ele
responde a topologia **sem provocar ninguém**, e uma rampa só vale o custo depois disso.

```bash
cd backend && set -a && . ../.env && set +a
PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.quota_ramp_cli headers
PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.quota_ramp_cli coupling 20
PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.quota_ramp_cli ramp binance-futures-data 150
PYTHONPATH=. .venv/bin/python -m src.modules.sentimento.infra.quota_ramp_cli ramp coinalyze 70
```

### O registro CRU está versionado, para que este documento seja falsificável sem confiar nele

[`medicoes/T-03.7-balde-de-cota/`](medicoes/T-03.7-balde-de-cota/) — 9 arquivos: os headers dos três
baldes, as 4 leituras do acoplamento, **os 150 degraus crus** da rampa Binance e **os 41 degraus
crus** da rampa Coinalyze (incluindo o `429`). O [`README.md`](medicoes/T-03.7-balde-de-cota/README.md)
de lá traz o comando que produziu cada um e o script que **recomputa** o veredito a partir dos
degraus — que é o que se faz com registro cru, em vez de reescrevê-lo.

**Nenhuma chave neste documento** — a da Coinalyze vive em `.env` (perms 600, gitignored) e é
referenciada só como `$COINALYZE_API_KEY`.

**Nada disto roda na suíte, e nunca vai rodar.** `backend/scripts/test.sh` declara ZERO REDE, e isso
foi re-auditado nesta task **dos dois lados**: a suíte passa (**187 passed**) num interpretador com
a conexão amputada, e o mesmo interpretador **reprova** uma conexão real. Ver `backend/README.md`,
seção *"Zero rede, zero chave"* — cuja receita de amputação `T-03.7` teve de **corrigir**, porque
ela quebrava no `import ssl` desde que `src/` ganhou um módulo que fala HTTP.
