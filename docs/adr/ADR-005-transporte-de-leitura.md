# ADR-005 — Transporte de leitura

**Data:** 2026-08-25 · **Status:** proposto · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §4.3
**Fase/Epic:** F1 (mínimo) e F4 (completo) · `CST-3`, `CST-6` · **Componente alvo:** `web`
**Origem:** `faseamento:A3` — **qualificado de propósito.** Não confundir com `avaliacao:A3`, que é **telemetria de cota** e é outro item, também requisito

## Contexto

**Regra já fixa antes desta ADR: o browser NUNCA recebe tick.** Medido: **4.802.005 aggTrades/dia** num símbolo, pico de **3.468 msg/s** `[MEDIDO]`, e a vazão do mesmo símbolo variou **3,66×** entre dois dias da mesma semana.

E o direcionamento do owner restringe o problema: **não é HFT**, prazos **15m/1h/4h**, cadências **1m/5m/15m**, **decisão no fechamento do bucket** `[PREMISSA-OWNER: 2026-08-25]`. **Todos são múltiplos inteiros de 1 min** ⇒ a grade de 1 min é a mais fina que qualquer consumidor de decisão precisa.

Custo de envelope, medido: envelope completo por célula custa **519 B contra 54 B (9,6×)** ⇒ na tela de 570×6 células, **1.733 KB contra 180 KB** `[MEDIDO]`.

## Decisão

**A unidade de transporte é o ENVELOPE DE BUCKET. Nunca o tick, nunca a célula com envelope completo.**

### D1 · Duas rotas, por classe de tempo — e nenhuma delas é do fornecedor

| classe | transporte | por quê |
|---|---|---|
| **histórico** (viewport fechado, `COMO EM T`, replay) | **HTTP, resposta endereçável por conteúdo** — chave `(series_key_id, symbol, interval, janela, knowledge_time, bar_policy)` | é imutável por construção: `knowledge_time` fixo ⇒ a resposta é cacheável para sempre, e o cache **é** o `knowledge_time` |
| **borda direita do tempo** (`AO VIVO`) | **SSE**, um fluxo por sessão, carregando **envelope de bucket** | unidirecional, reconecta sozinho, atravessa proxy. **Não precisamos de canal do browser para o servidor** — a superfície não age (S4 não tem um botão com verbo por linha) |

**`nenhuma superfície chama endpoint de exchange direto`**, inclusive `OI (agora)`, que é série ingerida como qualquer outra — senão os quatro campos do selo ficam impreenchíveis.

### D2 · O envelope de bucket parcial, e a cláusula que o desambigua

```
( bucket_open_ts, cvd_delta_parcial, last_price, n_trades, seq )   a   max(1 Hz, 1/TF)
```

**E a resolução EXIBIDA da idade nunca é mais fina que `1/f`.** Sem essa cláusula, *"barra parcial a 40% de opacidade"* é ambíguo entre 1 msg/s e 3.468 msg/s de pico — e a tela estaria afirmando uma precisão que o transporte não entrega.

`seq` é **monotônico por fluxo** e existe para o cliente detectar lacuna de transporte **sem** inferir do relógio.

### D3 · O içamento é o mecanismo de custo, e ele é contratual

| nível | carrega | frequência |
|---|---|---|
| **sessão** | fuso, `agora`, modo `AO VIVO`/`COMO EM T`, versão do bundle, `env`, `principal_id` | 1× por tela |
| **painel** | `SeriesKey`, `source`, `unit`, `denom`, `provenance`, `label_shift`, universo, `n lido / n esperado` | 1× por painel |
| **célula** | `( valor \| ausência, event_time, available_at )` + referência à coluna | por ponto |

**O invariante de tipo se preserva porque a célula continua sem construtor a partir de `number`** — o barateamento não abre a porta única que `SPEC-001` §3.6 fechou.

### D4 · `bar_policy` é declarado pelo CONSUMIDOR, na requisição

O transporte **não escolhe**. Um cliente que peça `final_only` **não recebe** o bucket em formação; um que peça `intrabar` recebe com `is_final = false`. **`intrabar` nunca é default**, e o servidor **não** infere de "é a borda direita".

## Alternativas recusadas

| alternativa | por que |
|---|---|
| **WebSocket de tick para o browser** | 3.468 msg/s de pico num símbolo. Não é decisão de conforto: a tese declarada **não usa micro-tick**, logo o custo compraria uma capacidade que o produto não exerce |
| **WebSocket bidirecional em vez de SSE** | não há mensagem do browser para o servidor no escopo desta fase — as superfícies são de **leitura e marcação**, e marcação é HTTP com corpo. Um canal bidirecional é superfície de ataque e complexidade de reconexão sem consumidor |
| **Polling do gráfico** (o cliente pergunta a cada N s) | a cadência honesta é a do **fechamento do bucket**, que o servidor conhece e o cliente não. Polling faz o cliente **adivinhar** o instante em que o dado nasce, e adivinhar errado é exatamente `idade` errada |
| **Envelope completo por célula** | **9,6×** medido, 1.733 KB contra 180 KB numa tela. E o envelope repetido por célula é a forma de o mesmo `SeriesKey` ser afirmado 3.420 vezes por tela, o que não é informação |
| **Empurrar tick e agregar no cliente** | duas implementações da agregação (cliente e motor) ⇒ **tela e motor discordam sobre o que aconteceu**, que é o modo de falha que a grade compartilhada existe para impedir |

## Falsificador

**Se a taxa de mensagens que chega ao browser exceder `max(1 Hz, 1/TF)` por série, ou se qualquer payload de transporte contiver campo de nível de tick** (`agg_id`, `price` por trade, `quantity` por trade), **esta ADR está violada** — e a violação é observável no próprio browser, sem instrumentação especial.

**Segundo falsificador, e ele derruba D1 e não a ADR toda:** se o eixo do Lightweight Charts **não sustentar 288 pontos + 1.440 candles no mesmo eixo em tempo de parede** (`[NÃO MEDIDO]`, declarado o **maior risco técnico desta especificação**), o problema deixa de ser transporte e passa a ser **quanto o servidor tem de reduzir antes de enviar** — o que muda o contrato de D3, não a rota de D1. **Teste: as coordenadas X batem com os `event_time` originais com tolerância de 0,5 px.**

## Consequência

- Idade só na **borda direita do tempo**: se `viewport_fim < agora − cadência_nativa`, o chip de idade é substituído pelo rótulo absoluto da janela. **Um gráfico de 3 dias tem zero carimbos de idade, e isso está certo.**
- **`avaliacao:A3` continua requisito e é outro item:** `/futures/data/*` responde `200` com **zero headers `x-mbx-*`** e a Coinalyze **também não traz header de cota** ⇒ **dois dos três baldes são cegos**, e o cego que importa é o do screener. **Contagem local conservadora não é adaptação a um fornecedor pior — é o caso geral**, e a rampa até o primeiro 429 é a única forma de conhecer dois deles.
