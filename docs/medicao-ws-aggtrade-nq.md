# Medição — o WS `<symbol>@aggTrade` carrega `nq`?

**Task:** `T-03.1` (`CST-17`) · **DoD:** `D3.9` · **Plano:** `03` item 3.6 · **Dependência de:** [`ADR-001`](adr/ADR-001-quantity-field-na-identidade.md)
**Data:** 2026-08-29 · **Componente:** `sentimento` · **Precede:** `T-03.4` (`CST-20`)

---

## Veredito, em uma linha

**A pergunta de `D3.9` continua `[NÃO MEDIDO]` — e o motivo agora tem nome, número e comando.**

Do ponto de observação desta rodada, o stream de **futuros** `<symbol>@aggTrade` **aceita a
assinatura, mantém a conexão viva e não entrega evento nenhum**. Sem payload não há campo a
inspecionar. `D3.9` pede "1 símbolo, 1 mensagem"; **o universo obtido foi 0 mensagens.**

> ⚠️ **Isto NÃO é "o WS não tem `nq`".** Ausência de campo e ausência de mensagem são respostas
> diferentes, e a seção *Controles* mostra que o instrumento distingue as duas — porque foi
> exigido dele, em rodada própria, antes de a medição valer.

---

## Por que a pergunta tem mais de duas respostas

`ADR-001` fecha com a dependência: *"`[NÃO MEDIDO]`: se o WS `<symbol>@aggTrade` carrega `nq`"*.
Um "sim/não" esconde três desfechos com consequências **opostas** para `T-03.4`:

| desfecho | o que `T-03.4` teria de fazer |
|---|---|
| campo **ausente** | o agregador passa a depender de REST, com peso e janela de 48 h |
| campo presente e **sempre nulo** | o campo É entregue; cabe decidir o que um nulo significa por bucket |
| campo presente **com valor** | o agregado sai do stream, como `ADR-001`/6 desenha |
| **nenhuma mensagem** (o que ocorreu) | nada acima se aplica: não há observação |

O instrumento desta task separa `ABSENT` · `NULL` · `VALUED` · `NOT_MEASURED`, e a separação é
**estrutural**: leitura de campo só existe dentro de `ProbeMeasured`; `ProbeNotMeasured` não tem
onde guardá-la. Não é convenção que alguém precise lembrar — é um valor que não se consegue
construir.

---

## O que foi medido

Todos os comandos rodam de `backend/`, com `backend/.venv/bin/python`. `rc=3` significa
**"não mediu"**, distinto de `rc=1` "mediu e reprovou" — a mesma semântica dos portões deste
repositório.

### 1. O REST de futuros carrega `nq` — reprodução de `ADR-001` `[MEDIDO]`

```
curl -s 'https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=1' \
  | python -c "import json,sys; print(sorted(json.load(sys.stdin)[0].keys()))"
```

**Universo:** 1 símbolo, 1 trade. **Resultado:** `['T','a','f','l','m','nq','p','q']` — oito
campos, `nq` entre eles. Bate exatamente com a tabela de `ADR-001`. **O ponto de observação
desta rodada enxerga `nq`** — o que exclui "esta máquina não tem acesso ao campo" como
explicação do que vem a seguir.

### 2. O WS de futuros entregou ZERO eventos `aggTrade` `[MEDIDO]`

```
python -m src.modules.sentimento.infra.aggtrade_nq_probe_cli \
  --symbols BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT \
  --seconds 120 --max-messages 300 \
  --evidence data/binance/ws/aggtrade_nq.jsonl \
  --summary  data/binance/ws/aggtrade_nq.json
```

**Universo:** 5 símbolos, janela 120 s, teto 300 mensagens, 1 conexão.
**Resultado:** `NOT_MEASURED`, estágio `FRAME`, `rc=3`, arquivo de evidência **vazio**.

**Testemunha da mesma janela** — trades ocorreram, e não poucos:

```
REST /fapi/v1/aggTrades, janela [1788016790957, 1788016917197]:
  BTCUSDT  1000 aggTrade(s)   (teto do parâmetro limit; o número real é ≥ 1000)
  DOGEUSDT  121 aggTrade(s)
```

⇒ **≥ 1121 aggTrades aconteceram enquanto o WS entregava 0.** A janela não estava vazia; o
stream é que não falou.

### 3. A conexão estava viva o tempo todo `[MEDIDO]`

Numa janela **simultânea** de 60 s, com `/ws/btcusdt@aggTrade` aberto e o REST contando:

| | |
|---|---|
| WS `/ws/btcusdt@aggTrade` | **0** eventos `aggTrade`, **1** frame `PING` |
| REST `/fapi/v1/aggTrades` (mesma janela) | **698** aggTrades |

**Universo:** 1 símbolo, 60 s. O `PING` é a prova de que o socket estava aberto e o servidor
ativo: não foi queda de conexão.

> **Achado de método, e ele quase virou um falso positivo.** Numa rodada anterior o primeiro
> byte chegou aos 43,4 s e foi lido como "o stream entregou". Era **um frame `PING`**
> (`opcode 0x9`), não um evento. Ler ping como dado teria produzido a resposta errada com ar de
> medição.

### 4. É específico do `aggTrade`, não da conexão `[MEDIDO]`

Uma conexão por stream, 10 s de espera, mesmo host `fstream.binance.com`:

| stream | primeiro dado |
|---|---|
| `btcusdt@trade` | **0,1 s** |
| `btcusdt@bookTicker` | **0,07 s** |
| `btcusdt@depth5@100ms` | **0,06 s** |
| `btcusdt@aggTrade` | **silêncio** |
| `ethusdt@aggTrade` | **silêncio** |
| `dogeusdt@aggTrade` | **silêncio** |
| `btcusdt@markPrice` | **silêncio** |
| `btcusdt@kline_1m` | **silêncio** |

**Universo:** 8 streams, 1 conexão cada, 10 s. `@trade` dispara nos **mesmos** negócios que
`@aggTrade` agrega — e entrega em 0,1 s. **Inatividade de mercado está descartada.**

### 5. Não há interceptação de TLS no caminho `[MEDIDO]`

```
python -c "…ssl.getpeercert()…"   # fstream / stream / fapi .binance.com
```

Os três hosts apresentam certificado emitido por **DigiCert Inc**, CN `*.binance.com`, e o
ambiente **não** tem variável de proxy. ⇒ A conversa é com a Binance real, sem intermediário
que pudesse filtrar streams.

---

## Os controles — construídos ANTES da medição positiva

Um instrumento que devolve o mesmo valor dos dois lados não mede nada. Cada controle abaixo é
**o mesmo caminho de código**, com entradas diferentes e vereditos diferentes.

| # | controle | universo | resultado | `rc` |
|---|---|---|---|---|
| a | host que não resolve | 1 símbolo | `NOT_MEASURED` · estágio **`DNS`** | 3 |
| b | host real que recusa o upgrade (`fapi.binance.com`) | 1 símbolo | `NOT_MEASURED` · estágio **`HTTP_UPGRADE`** (403) | 3 |
| c | **conexão real, stream sem `nq`** (`bookTicker`) | 2 símbolos, 15 s | **`ABSENT_IN_ALL`**, n = **40** | 0 |
| d | **conexão real, `aggTrade` que entrega** (SPOT) | 2 símbolos, 25 s | **`ABSENT_IN_ALL`**, n = **60** | 0 |

**(a) e (b) contra (c)** é o par que importa: silêncio e ausência produzem vereditos
**diferentes**. **(d)** fecha a última saída: o instrumento **consegue** ler eventos `aggTrade`
reais e classificar `nq` neles — logo o resultado dos futuros não é artefato do instrumento.

> **O `nq` também não aparece no `aggTrade` de SPOT** (n = 60): campos
> `e,E,s,a,p,q,f,l,T,m,M`. Isso **não responde `D3.9`** — spot é outro produto, e `ADR-001`
> mede futuros. Fica registrado como contexto, com rótulo próprio.

### O controle que NÃO discrimina, e por isso não vale

O `SUBSCRIBE` explícito devolve `{"result":null,"id":99}` para um nome de stream **inventado**
(`btcusdt@naoExisteStream`) exatamente como para um válido. **Universo:** 3 streams, 1 conexão
cada.

⇒ **O ack de assinatura é inútil como evidência.** Quem escrever `T-03.4` não pode tratar
"assinatura aceita" como "stream existe e vai entregar". Está registrado aqui para que o
próximo não gaste a rodada que esta gastou.

---

## O que ficou `[NÃO MEDIDO]`, nomeado

1. **Se o WS de futuros `aggTrade` carrega `nq`** — a pergunta de `D3.9`. Não houve payload.
2. **Se o silêncio é global ou deste observador** — uma única origem de rede, uma única faixa de
   horário (≈ 14h50–15h15 UTC de 2026-08-29). **Não foi testado de outra região nem em outro
   horário**, e nada aqui autoriza dizer "a Binance parou de servir `aggTrade`".
3. **Se `nq` no WS teria a mesma semântica do REST/dump** — depende de (1). O instrumento já
   sabe comparar `nq` contra `q` por trade e contar violações de `nq > q` (o **segundo
   falsificador** de `ADR-001`), mas sem mensagem não há o que comparar.
4. **`markPrice` e `kline_1m` também silenciaram.** Fora do escopo desta task; anotado porque
   `T-03.5` (`premiumIndex`) pode encontrar o mesmo muro.

---

## O que `T-03.4` pode assumir a partir daqui

**Pode assumir:**

- **O contrato `QF-1..QF-6` de `ADR-001` sobrevive intacto.** O próprio `ADR-001` declara que os
  itens 1–5 sobrevivem às duas respostas; o plano `03` diz que, se o WS não trouxer `nq`,
  **muda o desenho do item 3.5, não o contrato**.
- **O REST de futuros carrega `nq` hoje** — reproduzido nesta rodada, 8 campos.
- **O instrumento e os controles estão prontos e em portão.** Refazer a medição é **um comando**,
  e ele já sabe distinguir os quatro desfechos.

**NÃO pode assumir:**

- **Que o WS entrega `aggTrade`.** Hoje, deste ponto, não entrega. Um coletor de `T-03.4`
  desenhado sobre `<symbol>@aggTrade` **não recebe nada** e — sem o veredito por estágio — pareceria
  estar funcionando, gravando buckets vazios. Esse é o modo de falha caro: `nq` é `CL-5`,
  **capture-or-lose**, e um coletor que grava zero em silêncio consome o relógio sem capturar.
- **Que o WS não tem `nq`.** Não foi observado. Desenhar a queda para REST como se fosse fato
  medido herda uma conclusão que esta rodada explicitamente **não** produziu.

**Recomendação operacional (rótulo `[INFERRED: dos itens 2–4 acima]`):** antes de `T-03.4`
escolher o desenho, **repetir esta medição de outra origem de rede e em outro horário**. É um
comando e uma janela de 2 min. Se `aggTrade` entregar de lá, a pergunta de `D3.9` fecha na hora
e o desenho de `T-03.4` deixa de ser escolhido no escuro.

---

## Decisões que NÃO são desta task

Vão para o `quant-architect`, nomeadas:

1. **Se um `nq` nulo por trade deve virar zero, ausência ou herdar `q` no bucket.** É semântica
   de série. O instrumento apenas separa os três estados.
2. **Se a série `nq` do WS, quando existir, é a MESMA série do REST** para efeito de
   `quantity_field` como termo de identidade — ou se observador/transporte a tornam outra.
3. **Se a queda para REST (peso, janela de 48 h) preserva `CL-5`** ou se aceita perda declarada.

---

## Como reproduzir

```bash
make setup                      # sem .venv os portões recusam com rc=3 ("não mediu")

cd backend
PY=.venv/bin/python
EV=../data/binance/ws

# a medição
$PY -m src.modules.sentimento.infra.aggtrade_nq_probe_cli \
    --symbols BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT \
    --seconds 120 --evidence $EV/aggtrade_nq.jsonl --summary $EV/aggtrade_nq.json

# o controle negativo de transporte  -> NOT_MEASURED / DNS, rc=3
$PY -m src.modules.sentimento.infra.aggtrade_nq_probe_cli \
    --symbols BTCUSDT --seconds 8 --host nao-existe.fstream.binance.invalid \
    --evidence $EV/ctrl_dns.jsonl --summary $EV/ctrl_dns.json

# o controle negativo de campo      -> ABSENT_IN_ALL, rc=0
$PY -m src.modules.sentimento.infra.aggtrade_nq_probe_cli \
    --symbols BTCUSDT,ETHUSDT --seconds 15 --max-messages 40 \
    --stream bookTicker --event-type bookTicker \
    --evidence $EV/ctrl_bookticker.jsonl --summary $EV/ctrl_bookticker.json
```

**Evidência crua** (JSONL, uma mensagem por linha, com carimbo UTC de captura):
`data/binance/ws/` — `data/` é gitignored (`data/MANIFEST.md` traduz o caminho).

**A suíte é offline** (`backend/scripts/test.sh`, ZERO REDE): nada acima roda em portão. O que
está em portão é o **classificador e o leitor de frames**, exercitados contra os bytes que a
Binance de fato enviou nesta rodada, reproduzidos literalmente em
`backend/tests/sentimento/test_aggtrade_nq_probe.py`.

---

## Defeitos que os controles pegaram, antes de contaminarem o número

Registrados porque são o argumento a favor de construir o controle primeiro:

| # | defeito | como apareceu |
|---|---|---|
| 1 | **GUID da RFC 6455 com o `C` transposto** (`…-95CA-5AB0DC85B11C` em vez de `…-95CA-C5AB0DC85B11`) | a verificação de `Sec-WebSocket-Accept` recusou um `101` legítimo da Binance. Hoje há teste com o vetor publicado da RFC |
| 2 | **canal vazava quando o handshake falhava** | o `finally` cobria só o segundo bloco |
| 3 | **primeira mensagem perdida** quando handshake e primeiro frame chegavam no mesmo pacote | `recv` não respeita fronteira de mensagem. As rodadas ao vivo nunca mostraram: a Binance mandava o cabeçalho sozinho |
| 4 | **`IndexError` em frame truncado** | travava a sonda sem veredito, pior que `NOT_MEASURED` |

As quatro proteções foram **falsificadas por mutação**: com cada uma revertida, a suíte
**reprova** (`rc=1`), e o arquivo volta com `sha256` conferido.
