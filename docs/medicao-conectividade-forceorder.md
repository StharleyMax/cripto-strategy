# Medição — conectividade real de `!forceOrder@arr` (`T-03.2`)

**Task:** `T-03.2` (`CST-18`) · **DoD:** código do coletor + probe curto de conectividade real ·
**Plano:** `03` item 3.1 · **Refs:** `CA-F0-2`, `SPEC-001` §5.10, §8.5-A4
**Data:** 2026-09-01 · **Componente:** `sentimento` · **Depende de:** `T-01.1` · **Precede:** `T-03.3`

---

## Veredito, em uma linha

**A conexão fecha o handshake e fica CONECTADA; zero eventos `forceOrder` chegaram nas duas
janelas medidas — e o mesmo silêncio aparece num controle que deveria falar a CADA 1 segundo,
enquanto streams por-símbolo no MESMO host respondem imediatamente.** Isto reproduz, para o
stream de liquidação, o padrão que `T-03.1` já mediu para `aggTrade`/`markPrice`/`kline_1m`
(`docs/medicao-ws-aggtrade-nq.md`): streams de **array de mercado inteiro** (`!…@arr`) não
entregam dado a partir deste observador; streams **por símbolo** entregam.

> ⚠️ **Isto NÃO é "o mercado não liquidou".** `CONECTADO` e `NOT_CONECTADO` são respostas
> diferentes deste instrumento — a primeira nunca depende de uma mensagem ter chegado, a
> propriedade central que o desenho de `T-03.2` protege (ver `force_order_capture_outcome.py`).
> O que ficou `[NÃO MEDIDO]` é se `!forceOrder@arr` chega a este observador com dado nele.

---

## Por que a resposta não é um booleano

Um coletor de mercado inteiro pode legitimamente passar uma janela curta sem nenhuma
liquidação — `!forceOrder@arr` é esparso por natureza. Colapsar "a conexão caiu" e "a conexão
está de pé e nada aconteceu" na mesma resposta deixaria `T-03.3` (política de reconexão) incapaz
de separar um socket morto de um mercado calmo, contando reconexões falsas. Por isso
`ForceOrderCaptureOutcome` separa os dois em TIPOS: `ForceOrderConnected` (que pode carregar
`messages_captured == 0`) e `ForceOrderNotConnected` (que nomeia o estágio do RFC 6455 que
falhou). A pergunta respondida aqui é "o cano está aberto?", nunca "quanto passou por ele?".

---

## O que foi medido

Comandos rodados de `backend/`, com `backend/.venv/bin/python`.

### 1. `!forceOrder@arr`, 25 s, teto 20 — `[MEDIDO]`

```
python -m src.modules.sentimento.infra.force_order_collector_cli \
    --seconds 25 --max-messages 20 \
    --evidence data/binance/ws/force_order_arr_25s.jsonl \
    --summary  data/binance/ws/force_order_arr_25s.json
```

**Universo:** 1 stream (mercado inteiro), janela declarada 25 s, teto 20 mensagens, 1 conexão.
**Resultado:** `CONECTADO`, `n = 0`, `window_end = INTERRUPTED` em `FRAME` aos **25,023 s** — o
"estágio" aqui é o timeout do socket batendo exatamente no fim da janela declarada, não uma
queda real (ver seção seguinte). `rc = 0`.

### 2. `!forceOrder@arr`, 60 s, teto 20 — `[MEDIDO]`

```
python -m src.modules.sentimento.infra.force_order_collector_cli \
    --seconds 60 --max-messages 20 \
    --evidence data/binance/ws/force_order_arr_60s.jsonl \
    --summary  data/binance/ws/force_order_arr_60s.json
```

**Resultado:** `CONECTADO`, `n = 0`, interrompida em `FRAME` aos **60,057 s**. `rc = 0`.
Combinando as duas rodadas: **0 eventos em 85,08 s** de janela combinada.

### 3. Controle — um stream de array que EMPURRA a cada 1 s também silenciou `[MEDIDO]`

```
python -m src.modules.sentimento.infra.force_order_collector_cli \
    --stream '!markPrice@arr@1s' --seconds 5 --max-messages 1 \
    --evidence data/binance/ws/ctrl_markprice_arr.jsonl \
    --summary  data/binance/ws/ctrl_markprice_arr.json
```

`!markPrice@arr@1s` empurra, por definição da Binance, uma atualização por segundo para **todos
os símbolos**. **Resultado:** `CONECTADO`, `n = 0` em 5 s — o mesmo silêncio de `!forceOrder@arr`,
contra um stream que deveria ter entregue ao menos uma mensagem no primeiro segundo.

### 4. Controle positivo — streams por-símbolo, MESMO host, entregam de imediato `[MEDIDO]`

Socket cru (mesma pilha RFC 6455 de `rfc6455_client.py`), 5 s de leitura cada:

| stream | bytes recebidos em ~5 s |
|---|---|
| `/ws/btcusdt@bookTicker` | **142.895** |
| `/ws/btcusdt@depth5` | **7.500** |

**Universo:** 2 streams, 1 conexão cada, ~5 s. Prova que o observador **recebe** bytes de stream
neste host, na mesma sessão — o silêncio de (1)–(3) não é "TLS não estabelece" nem "porta
bloqueada": é específico de streams de **array de mercado inteiro**, não de conectividade geral.

---

## O que ficou `[NÃO MEDIDO]`, nomeado

1. **Se `!forceOrder@arr` chega com dado a este observador em janela mais longa** — só 85 s
   combinados foram testados; `T-03.1` fixou o gatilho de parada em **≥ 2 tentativas
   independentes com 0 eventos em janela ≥ 120 s**, e este critério **ainda não foi atingido
   aqui** (as duas janelas medidas são 25 s e 60 s, abaixo de 120 s).
2. **Se o silêncio é global ou deste observador** — mesma ressalva de `docs/medicao-ws-aggtrade-nq.md`:
   uma única origem de rede, uma única janela de horário (2026-09-01, ~23h00–23h10 UTC).
3. **Se a causa é a mesma para `!forceOrder@arr`, `!markPrice@arr@1s`, `aggTrade` e
   `kline_1m`** — os quatro compartilham a forma "stream de array/agregado", mas isto é
   correlação observada, não uma causa isolada.

---

## O que `T-03.3` pode assumir a partir daqui

**Pode assumir:**

- **O coletor abre e mantém o handshake** — `CONECTADO` foi obtido nas duas rodadas, sem
  nenhuma falha de `DNS`/`TCP`/`TLS`/`HTTP_UPGRADE`.
- **O desenho de `ForceOrderCaptureOutcome` já separa "sem conexão" de "conectado e quieto"**,
  então a contagem de colisão de reconexão de `T-03.3` (`ADR-004`) não confunde as duas.
- **O envelope grava os 4 campos exigidos por `SPEC-001` §5.10/§8.5-A4 na saída de máquina**
  (`received_at`, `stream`, `doc_snapshot_date`, `subsampling_semantics_label`) — testado
  offline em `test_force_order_collector.py`, e reproduzido no `summary` de cada rodada real
  acima.

**NÃO pode assumir:**

- **Que `!forceOrder@arr` entrega liquidações para este observador.** Não foi observado dentro
  do gatilho de parada de `T-03.1` (≥120 s × 2). Repetir a medição com janela ≥120s, duas vezes,
  é a forma de fechar isto antes de `T-03.3` desenhar a política de reconexão sobre um stream
  cuja entrega real não foi provada.
- **Que o rótulo `latest|largest` pode ser resolvido por este instrumento.** `SPEC-001` §5.10 já
  declara que não se resolve lendo mais doc nem medindo — o rótulo existe para reinterpretar
  depois, não para decidir agora.

---

## Como reproduzir

```bash
make setup   # sem .venv os portões recusam com rc=3

cd backend
PY=.venv/bin/python
EV=../data/binance/ws

$PY -m src.modules.sentimento.infra.force_order_collector_cli \
    --seconds 60 --max-messages 20 \
    --evidence $EV/force_order_arr_60s.jsonl --summary $EV/force_order_arr_60s.json

$PY -m src.modules.sentimento.infra.force_order_collector_cli \
    --stream '!markPrice@arr@1s' --seconds 5 --max-messages 1 \
    --evidence $EV/ctrl_markprice_arr.jsonl --summary $EV/ctrl_markprice_arr.json
```

> ⚠️ **A evidência é LOCAL** — `data/` é gitignored (`.gitignore:47`), e `data/MANIFEST.md`
> também é, então nenhum dos dois viaja no repositório. Os comandos acima re-obtêm a evidência
> do zero, que é por isso que estão escritos por extenso.

**A suíte é offline** (`backend/scripts/test.sh`, ZERO REDE): nada acima roda em portão. O que
está em portão é o classificador de janela/estágio e o envelope, exercitados contra os bytes de
um frame `forceOrder` reproduzido em `backend/tests/sentimento/test_force_order_collector.py` —
o mesmo frame do payload documentado pela Binance, não uma captura ao vivo (o silêncio medido
acima não deixou nenhum frame real de `forceOrder` para reproduzir).
