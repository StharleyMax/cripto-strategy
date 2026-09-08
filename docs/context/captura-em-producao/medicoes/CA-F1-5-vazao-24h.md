# `CA-F1-5` — Vazão do Stream: `!forceOrder@arr` + `premiumIndex`

**Task:** `T-01.8` · **Fase:** `01` · **Componente:** `sentimento` (`docs`) · **Insumo de:** `P5`/`M4`
(`ADR-032/D4`, teto `MAXLEN ~ 100000` + `maxmemory 64mb noeviction`) · **Fecha:** `[Q1]` (`SPEC-004`
§8, `Q3-run-definition.md` §6) · **Morde:** `ADR-032/F6` — enche `100 000` entradas em `< 1 h` de
escritor fora ⇒ **escalar, não ajustar** os dois números aqui.

## 0. O que este documento É e o que ele NÃO É — leia antes dos números

O item `1.8` do plano (`01_coletor_publica_e_se_registra.md`) e a `tasks.toml` (`T-01.8`) descrevem a
medição como `XLEN <stream>` e `count(*)` em `t` e `t+24h` de um **escritor fora, em produção real**.
Essa mesma task fixa a fronteira: **"NÃO implanta (Redis local)"** — isto é, esta task não sobe um
Redis para fabricar um `XLEN` artificial; a medição tem de vir do **produtor real** contra o **stream
real da Binance**, e nenhuma implantação de produção existe ainda neste repositório (`deploy/compose.yml`
com os 7 serviços é escopo da fase `03`, ainda não construída). Não há, portanto, um escritor de 24 h em
produção para observar hoje.

**O que este documento faz em vez disso, e por que isso ainda é medição e não estimativa às cegas:**
mede a vazão **na fonte** — a taxa real de chegada de mensagens em `!forceOrder@arr` (WebSocket público,
sem chave) e a taxa real de linhas por ciclo de `premiumIndex` (REST público) — com comandos reais
contra os endpoints reais da Binance, agora. Essa taxa na fonte **é** o insumo que `XLEN`/`t+24h`
mediria depois de decodificada pelo catálogo de `SeriesRow` (ainda não decidido, ver §3): o número de
entradas no Stream por dia não pode ser MENOR que o número de eventos brutos por dia (cada evento vira
no mínimo 1 linha). Este documento dá esse piso, com honestidade sobre o que falta.

**O que fica `[NÃO SEI]`, nomeado, não escondido:** o multiplicador linhas-por-evento bruto depende do
catálogo de `SeriesKey` (`infra/redis_stream_series_sink.py`'s próprio docstring recusa essa decisão
para os dois produtores — "no catalog for these two producers exists yet"). Este documento assume o
piso **1 linha por evento bruto** (o mínimo estrutural) e nomeia esse multiplicador como fonte de
incerteza, não como fato resolvido. E o `XLEN`/`count(*)` **contínuo, em produção real, por 24 h**
continua pendente do deploy (fase `03`) — a §5 deixa o comando exato pronto para quem rodar essa
confirmação depois.

## 1. `premiumIndex` — vazão exata, por cálculo sobre medição real (não extrapolação)

`premiumIndex` é um poll determinístico: `PREMIUM_INDEX_CYCLE_INTERVAL_S = 60` já é decisão fechada
(`[Q2]`, `gates/Q3-run-definition.md` §4, assinado `quant-architect`), e cada chamada devolve o array
completo de símbolos — não há variância de horário a considerar, ao contrário de `forceOrder@arr`.

```bash
$ curl -s https://fapi.binance.com/fapi/v1/premiumIndex -o /tmp/pi_now.json -D /tmp/pi_headers.txt
$ python3 -c "import json; print(len(json.load(open('/tmp/pi_now.json'))))"
900
$ grep -i 'x-mbx-used-weight\|^date:' /tmp/pi_headers.txt
date: Tue, 08 Sep 2026 01:35:21 GMT
x-mbx-used-weight-1m: 10
```

`[MEDIDO 2026-09-08T01:35:21Z]`: **900 símbolos** num único `GET /fapi/v1/premiumIndex` (peso `10`,
confirma `CA-F0-1b`). Assumindo **1 `SeriesRow` por símbolo por ciclo** (o piso estrutural — é o que o
gate `Q3` já registrou como efeito colateral conhecido: *"cada poll publica ~875–888 linhas (uma por
símbolo)"*, `Q3-run-definition.md:89`; o valor de hoje, 900, está no mesmo intervalo e um pouco acima):

```
linhas/ciclo        = 900
ciclos/dia          = 86400 / 60 = 1440
linhas/dia          = 900 × 1440 = 1 296 000
linhas/hora         = 1 296 000 / 24 = 54 000
linhas/segundo      = 900 / 60 = 15
horas p/ encher 100 000 entradas (só premiumIndex) = 100 000 / 15 / 3600 ≈ 1,85 h (1h51min)
```

`[INFERRED: cálculo determinístico sobre um valor medido e uma cadência já decidida — não é
extrapolação estatística, é aritmética sobre uma taxa constante]`. **Sozinho, `premiumIndex` NÃO
dispara `ADR-032/F6`** (o teto enche em ~1,85h, acima do limiar de `< 1h` do "morde") — mas fica a
**menos de 2× de distância** do limiar, e o multiplicador de linhas-por-símbolo (§0) é a maior fonte de
risco: se o catálogo decidir por mais de 1 linha por símbolo (ex.: linhas separadas para `markPrice`,
`indexPrice`, `lastFundingRate`), o tempo cai proporcionalmente.

## 2. `!forceOrder@arr` — captura real, ao vivo

`!forceOrder@arr` é o stream de liquidação de **mercado inteiro** (todos os símbolos), sem chave,
via WebSocket público (`fstream.binance.com`). Ao contrário de `premiumIndex`, sua chegada é um
processo estocástico (a atividade de liquidação varia com volatilidade) — por isso a medição aqui é
uma amostra real, não um cálculo fechado, e o documento diz isso às claras.

```bash
$ cd backend && .venv/bin/python -m src.modules.sentimento.infra.force_order_collector_cli \
    --seconds 240 --max-messages 100000 \
    --evidence /tmp/vazao/evidence.jsonl --summary /tmp/vazao/summary.json
```

`[MEDIDO 2026-09-08T01:40:23Z]` — `messages_captured=0`, `observed_seconds=256.339`,
`window_end=INTERRUPTED` (interrompida no estágio `FRAME` — o handshake e a leitura completaram; a
janela fechou sem nenhum frame de liquidação chegar antes do teto de tempo). O próprio CLI já declara
essa saída como válida, não como falha de transporte: *"0 mensagens NÃO é falha de conectividade —
`!forceOrder@arr` é mercado inteiro e ESPARSO"*.

### Segunda tentativa (`--seconds 540`) — abortada, e o motivo é um achado real de código, não ruído

Uma segunda captura (janela declarada de 540s) foi lançada para ampliar a amostra e **não terminou
sozinha**: `ps -o etimes` mostrou o processo real, conectado, ainda vivo em **628s** — 88s além do
tempo declarado mais a margem de handshake da janela 1 — e foi **encerrado manualmente** (`kill -9`)
sem nunca emitir veredito. Isto não é uma falha de rede: é um comportamento real do código desta task
que vale documentar, com o arquivo e a linha exatos, para quem for medir de novo ou operar o coletor:

`backend/src/modules/sentimento/infra/rfc6455_client.py:149-150` — `iter_text_messages` absorve
frames de controle `PING`/`PONG` com `continue`, sem nunca repassá-los ao chamador e **sem responder
com `PONG`**. A janela declarada só é reavaliada em `capture_force_order_stream.py:73` (`_collect`),
e essa linha só roda **depois de uma mensagem de texto ser entregue** — nunca depois de um `PING`. O
timeout que de fato limita o tempo de espera é o do socket TCP (`timeout=args.seconds` em
`connect_tls`, `force_order_collector_cli.py:157`), que é **por chamada de `recv()`**, não cumulativo:
se o servidor mandar um `PING` periódico, cada um reinicia o relógio do socket sem nunca satisfazer a
condição de saída do laço externo. `!forceOrder@arr` é justamente o cenário que expõe isto: zero
mensagens de texto por minutos, mas pings do servidor continuam chegando. **Não é escopo de `T-01.8`
corrigir isso** (esta task só mede); fica nomeado para quem tocar `force_order_collector_cli.py` depois.
A amostra da janela 1 (§2, acima) é limpa e não é descartada por este achado — apenas a segunda janela
é excluída do cálculo abaixo, por ter sido interrompida à força e não ter terminado por si.

### O que uma amostra de zero eventos diz sobre a taxa — limite superior, não zero

Zero eventos numa janela finita não prova taxa zero; prova um **limite superior** sobre a taxa real,
pela regra estatística padrão para processos de Poisson com `k=0` eventos observados em `T` segundos —
a "regra de três": o limite superior de 95% de confiança é `λ_sup ≈ 3 / T` eventos/segundo (de
`1 - e^(-λT) = 0,95 ⟹ λT = ln(20) ≈ 3`). Com `T = 256,339` s (a única janela válida, §2):

```bash
$ python3 -c "print(3/256.339, 3/256.339*86400)"
0.01170325233382357 1011.1610016423565
```

`[MEDIDO/INFERRED 2026-09-08]`: `λ_sup (95%) ≈ 0,01170 eventos/s ≈ 1011 eventos/dia` — **limite
superior**, não a taxa real (que pode ser muito menor; a amostra só permite afirmar que não é maior
que isto com 95% de confiança).

## 3. Combinação — o que isso diz sobre `ADR-032/F6`

```bash
$ python3 -c "
lam=3/256.339
rows_s=15.0+lam
print('linhas/s combinado (piso):', rows_s)
print('horas p/ encher 100000:', 100000/rows_s/3600)
"
linhas/s combinado (piso): 15.011703252333824
horas p/ encher 100000: 1.850408132298995
```

`[INFERRED 2026-09-08]`: somando o piso de `premiumIndex` (15 linhas/s, §1, medido/calculado) ao
**limite superior** de `forceOrder@arr` (0,0117 eventos/s, §2, estatístico sobre amostra real), o
tempo para encher `100 000` entradas cai de **1,851852h** (só `premiumIndex`) para **1,850408h**
(combinado) — diferença de **~5,2 segundos** em 1,85h. A contribuição de `forceOrder@arr`, mesmo no
seu teto estatístico de 95%, é **3 ordens de grandeza** menor que a de `premiumIndex` e não move o
resultado de forma perceptível. **`ADR-032/F6` NÃO dispara com esta evidência** (o teto enche em
≈1,85h, acima do limiar de `< 1h`).

⚠️ **Isto NÃO é a mesma coisa que "o teto está confirmado seguro".** Dois riscos ficam nomeados, não
escondidos, e nenhum dos dois é resolvido por este documento (nem deveria ser — `1.8` diz "não
dimensiona `M4` — só mede"):

1. **o multiplicador linhas-por-evento do catálogo (§0/§1) domina o resultado, não `forceOrder@arr`.**
   `premiumIndex` sozinho já fica a **menos de 2×** do limiar de 1h; se o catálogo decidir por mais de
   1 `SeriesRow` por símbolo por ciclo (ex.: linhas separadas para `markPrice`/`indexPrice`/
   `lastFundingRate`), o tempo cai proporcionalmente e pode cruzar o limiar sozinho;
2. **a amostra de `forceOrder@arr` é curta (256,339 s) e de um único período do dia** (madrugada UTC
   de terça-feira, mercado calmo) — não cobre os picos de volatilidade que dominam a cauda da
   distribuição de liquidações; um evento de mercado (ex.: um "flash crash") pode multiplicar a taxa
   real por ordens de grandeza em minutos, e isso não aparece numa amostra de calmaria. O limite
   superior de 95% (§2) é sobre ESTA amostra, não uma garantia sobre todo regime de mercado.

**Se qualquer um dos dois se confirmar acima do limiar em produção real, o "morde" do plano se aplica
literalmente: escalar (revisar `ADR-032/D4`), não ajustar os dois números aqui** — este documento não
é o lugar da decisão de `P5`/`M4`.

## 4. `[Q1]` — resposta parcial, e o que falta nomeado

`[Q1]` ("vazão real do `!forceOrder@arr`") estava `[NÃO MEDIDO]` (`SPEC-004` §8, `Q3-run-definition.md`
§6). Com este documento ele passa a **`[MEDIDO PARCIAL]`**: uma amostra real de 256,339 s existe, com
o limite superior de §2 (≈1011 eventos/dia, 95%) — mas a pergunta original ("eventos/min, bytes/evento",
`PRD-004` linha 343) **não fica totalmente respondida por uma janela de minutos**; ela pede uma série
contínua que alcance os regimes de alta volatilidade, que só uma janela de 24 h real em produção cobre.
`bytes/evento` fica `[NÃO SEI]` — a amostra não capturou nenhum evento para medir; o tamanho de um
`SeriesRow` codificado (`~200–500 B`, `SPEC-004` linha 21) é a única estimativa disponível, e é
`[INFERRED]` de outra fonte, não medida por este documento.

## 5. Confirmação pendente — o comando exato para quando a produção existir

Quando `deploy/compose.yml` (fase `03`) estiver de pé com `collector`/`writer`/`redis`/`postgres`
reais, a confirmação literal que `1.8` pede fica assim (nomear agora o comando evita que a fase `03`
precise redescobri-lo):

```bash
# t0 — no momento em que o escritor sobe:
redis-cli -h <REDIS_HOST> XLEN <REDIS_STREAM>                                    # n0
psql "$DATABASE_URL" -c "select count(*) from md.ingest_run"                     # c0

# t0 + 24h:
redis-cli -h <REDIS_HOST> XLEN <REDIS_STREAM>                                    # n1
psql "$DATABASE_URL" -c "select count(*) from md.ingest_run"                     # c1

# vazão real de 24h, com o comando que a produziu:
echo "entradas publicadas em 24h: $((n1 - n0))"
```

Este par de números — `n1 - n0` — é o **[MEDIDO]** que faltará, com rótulo próprio, quando alguém rodar
este comando contra produção real. Até lá, este documento é o melhor piso pré-deploy disponível, e o
diz explicitamente.

## Resumo executivo

| medição | valor | rótulo |
|---|---|---|
| `premiumIndex` símbolos/ciclo | 900 | `[MEDIDO 2026-09-08T01:35:21Z]` |
| `premiumIndex` linhas/dia (piso, 1 linha/símbolo) | 1 296 000 | `[INFERRED: cálculo sobre medição + cadência decidida]` |
| `premiumIndex` horas p/ encher 100 000 (isolado) | 1,851852h | `[INFERRED]` |
| `forceOrder@arr` mensagens, janela válida | 0 em 256,339s | `[MEDIDO 2026-09-08T01:40:23Z]` |
| `forceOrder@arr` 2ª janela (540s declarados) | abortada em 628s, 0 msgs — achado de código, não contada (§2) | `[MEDIDO 2026-09-08]` |
| `forceOrder@arr` λ superior (95%) | 0,01170 eventos/s (≈1011/dia) | `[INFERRED: regra de três sobre amostra real]` |
| combinado, horas p/ encher 100 000 | 1,850408h | `[INFERRED]` |
| `ADR-032/F6` dispara com esta evidência? | **NÃO** (com as duas ressalvas da §3) | `[INFERRED]` |
| `XLEN`/`count(*)` contínuo, 24h produção real | pendente do deploy (fase `03`) | `[NÃO SEI]` — comando pronto na §5 |
