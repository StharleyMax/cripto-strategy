# Julgamento `quant-architect` — `paineis-de-fluxo`, `[Q-STAMP-1]` (fase `03`, trilha `03a`)

**Entrada:** `T-03.2` (`CST-277`, commit `67d8c0e`) — `backend/src/modules/sentimento/domain/open_interest_grid_stamp.py`
e o relatório do builder `docs/context/paineis-de-fluxo/gates/T-03.2-build.md` (§*"Achado para `T-03.4`"*).
**Contra:** `SPEC-009` §6.1 (*"Carimbo"*, `[Q-STAMP-1]` em §11), `ADR-045/D1`, `series_key.py:107-108`
(`POINT_AT_BUCKET_END`), plano `03_oi_candle.md` (`DoD-1` de `03a`).
**Data:** 2026-09-25.

## Veredito: **NEEDS_FIX** — a janela está do lado errado do instante `T`

| # | pergunta | decisão | força |
|---|---|---|---|
| 1 | a janela `[T, T + 20 s]` vale? | **Não.** Todo ponto que ela admite tem `time ≥ T` e é carimbado em `T` ⇒ **lookahead de `time − T` ∈ `[0, 20 s]` por construção**, em 100% das linhas. A janela certa é **`[T − 20 s, T]`**: `T` = o instante de grade **no ou depois** de `time` (teto), nunca o piso | `[INFERRED: semântica de POINT_AT_BUCKET_END, ver §1]` + `[MEDIDO: ver §2]` |
| 2 | a largura de 20 s | **fica 20 s** — só a direção muda; com a chamada em `T − 5 s` a defasagem máxima medida é 14,75 s | `[MEDIDO: ver §2, n=4.546]` |
| 3 | "a primeira chamada" | vira **a leitura de maior `time` dentro da janela** (a mais fresca até `T`), independente da ordem de entrada | `[INFERRED: é o "as-of T"]` |
| 4 | offset de chamada da `T-03.4` | **chamar em `T − 5 s`** (segundo `:55` de cada minuto, no relógio local sincronizado por NTP) para carimbar em `T` | `[MEDIDO: envelope em §2]` + aritmética em §3 |

O achado do builder (as leituras reais caem 51–54 s dentro do minuto) é **correto como aritmética e se
resolve sozinho com a direção certa**: essas duas leituras são exatamente o ponto `as-of` do minuto
**seguinte**, com 6–9 s de defasagem. Elas não estão "fora de toda janela" — estão fora da janela invertida.

---

## §1 — Por que `[T, T + 20 s]` é lookahead, e `[T − 20 s, T]` não

**O que o carimbo afirma.** `StampedOpenInterest.grid_instant_ms = T` é catalogado por `T-03.3` como
`POINT_AT_BUCKET_END`, cuja definição no código é *"One reading, stamped at the close of the window"*
(`series_key.py:107-108`) `[DOC]`. `ADR-045/D1` usa `p(T1)` como `close` do bucket `(T0, T1]` e `p(T0)` — o
`close` do anterior — como `open` dele. Ou seja: **`p(T)` é lido como "o OI no instante em que o bucket `(T − 1 min, T]`
fecha"**.

**O que a origem entrega.** `time` é o instante do snapshot que a Binance serviu, e ele renova a cada
~4,5 s; é anterior ao envio registrado em **4.545 de 4.546** chamadas medidas (a exceção é envio travado do
lado do cliente, §2). Logo o valor descreve o OI **em `time`**, não no instante em que se pediu.

**As duas direções, lado a lado:**

| regra | `time` admitido | o que o candle que fecha em `T` passa a conter | erro de causalidade |
|---|---|---|---|
| **`[T, T + 20 s]`** (atual, piso) | `T ≤ time ≤ T + 20 s` | a variação de OI que aconteceu **depois** de `T`, até 20 s dentro do bucket seguinte | **lookahead** de `time − T`, sempre `≥ 0` |
| **`[T − 20 s, T]`** (proposta, teto) | `T − 20 s ≤ time ≤ T` | o último OI observado **até** `T` | **defasagem** (`staleness`) de `T − time`, sempre `≥ 0`; **nunca** informação posterior a `T` |

A magnitude do erro é da mesma ordem nas duas (≈ 5–13 s, §3). **O sinal não é.** Defasagem é o que todo
`close` de kline já faz — o `close` é o último trade **até** o fechamento, nunca o primeiro depois dele.
Lookahead é a classe que este componente existe para bloquear: um salto de OI em `T + 6 s` apareceria no
candle que fecha em `T`, **antes** do movimento de preço que o acompanha, e qualquer regra de
`convergencia` que junte `price_close(T)` com `p(T)` estaria lendo 6–13 s do futuro em cada decisão.

**O argumento do builder, e onde ele inverte.** O comentário em `open_interest_grid_stamp.py:13-16` diz que
arredondar para o mais próximo *"would admit readings the source took BEFORE `T` as the value 'at `T`',
which is the look-ahead in reverse"*. Ler um valor tirado **antes** de `T` como o valor em `T` **não é
lookahead** — é defasagem, e é a direção segura. O mutante `M5` do builder mata o comportamento correto.
Não é defeito de implementação: o código implementa fielmente a frase de `SPEC-009` §6.1; **a frase é que
está invertida**. É a mesma classe do defeito que o `CLAUDE.md` registra (*"uma regra anti-lookahead que
estava invertida e propagada por dois documentos"*).

**Robustez de agendamento — a propriedade que decide.** Com o teto, **nenhum erro do coletor produz
lookahead**: uma chamada atrasada, um retry depois de `T`, um relógio local adiantado — o pior desfecho é
o `time` cair depois de `T` e a leitura ir para `T + 1 min` com ~55 s de defasagem, **fora da janela ⇒
ausente** (`RN-2`). O erro vira buraco, nunca valor. Com o piso, a propriedade é a inversa: **toda** linha
admitida carrega lookahead, e errar o agendamento só muda quanto.

**Verificação sem confiar em mim** (fixture de mercado conhecido, forma 1): pegue qualquer linha admitida e
confira `grid_instant_ms − event_time_ms`. Com o código atual ele é **sempre ≤ 0** (lookahead); com a
correção, **sempre ∈ `[0, 20 000]`**. É um `select` de uma coluna quando `T-03.4` escrever.

## §2 — O que foi medido nesta avaliação

O `n=30` de `SPEC-009` §6.1 é pequeno para fixar uma cauda. Refiz com `n` maior, contra a origem.

**Universo:** `GET https://fapi.binance.com/fapi/v1/openInterest`, `BTCUSDT` + `ETHUSDT`, chamada a cada
~2,2 s por 13 min (`t_send` de `1790333607679` a `1790334386624`, 2026-09-25), **`n = 724` chamadas, 0
erros**, de uma máquina de desenvolvimento sob NTP (`timedatectl`: *synchronized: yes*). Script:
`poll.py`/`analyze.py` no scratchpad da sessão — `urllib` puro, grava `t_send`, `t_recv`, `time`,
`openInterest` por chamada. Reproduza com qualquer laço que registre esses quatro campos.

| grandeza | valor | força |
|---|---|---|
| atraso `L = t_send − time` | **mín 0,149 s · p50 4,59 s · p95 7,64 s · p99 8,33 s · máx 8,94 s** | `[MEDIDO 2026-09-25, n=724]` |
| chamadas com `time > t_send` (a origem devolvendo o futuro) | **0 de 724** | `[MEDIDO, n=724]` |
| intervalo entre `time` distintos (cadência do snapshot da Binance) | BTC p50 4,53 s, máx 8,23 s (203 distintos) · ETH p50 4,48 s, máx 7,35 s (213) | `[MEDIDO]` |
| ida e volta HTTP (`t_recv − t_send`) | p50 0,307 s · máx 0,853 s | `[MEDIDO, n=724]` |
| `serverTime − ponto médio local` | ≈ +34 ms | `[MEDIDO, n=5, curl /fapi/v1/time]` |

**2ª coleta, mais larga** (para o sinal de §6 e para a cauda): mesmo endpoint, **6 símbolos** (`BTC`, `ETH`,
`SOL`, `XRP`, `BNB`, `DOGE` `USDT`), ~26 min (`t_send` de `1790334434634` a `1790335994683`), **`n = 3.822`
chamadas, 0 erros** (`poll2.py`/`analyze2.py`, mesmo scratchpad):

| grandeza | valor | força |
|---|---|---|
| atraso `L` | **p50 4,59 s · p95 7,54 s · p99 8,37 s · máx 9,75 s** | `[MEDIDO 2026-09-25, n=3.822]` |
| chamadas com `time > t_send` | **1 de 3.822**: `XRPUSDT`, `L = −2,24 s`, com **ida e volta de 5,31 s** — a conexão travou entre o registro de `t_send` e o envio real; `t_recv − time = +3,07 s`, ou seja, **a origem não devolveu o futuro**, o relógio do cliente é que registrou cedo | `[MEDIDO, n=1]` |
| `L > 11 s` | 0 de 3.822 | `[MEDIDO]` |

**A cauda cresceu com `n`: 7,6 s (`n=30`) → 8,94 s (`n=724`) → 9,75 s (`n=3.822`).** É por isso que o
offset abaixo carrega folga nos dois lados, e não fica colado no envelope. **E o caso `L < 0` refuta, do
lado do cliente, a frase de `open_interest_grid_stamp.py:23-24`** (*"a call made before `T` cannot return a
`time >= T`"*): uma chamada **agendada** antes de `T` pode, sim, devolver `time > T` se o envio atrasar. Com
o piso, esse caso é admitido como ponto de `T` sem nada acusar; com o teto, ele cai no minuto seguinte com
~57 s de defasagem ⇒ ausente. **É a propriedade de §1 medida, não só argumentada.**

**Simulação das duas regras sobre os 724 atrasos** `[INFERRED: desloca cada L medido pelo offset de chamada;
assume L independente da fase do minuto em que se chama — o snapshot da Binance renova a cada ~4,5 s sem
relação com a nossa grade]`:

| regra | offset de chamada | admitidos | o erro de cada admitido |
|---|---|---|---|
| piso `[T, T+20]` | `T + 0` | **0 / 724** | — (é o achado do builder, confirmado) |
| piso `[T, T+20]` | `T + 8 s` | 704 / 724 | **lookahead** 0,05–7,85 s |
| piso `[T, T+20]` | `T + 10 s` (sugestão do builder) | 724 / 724 | **lookahead** 1,06–9,85 s, em **todas** as linhas |
| **teto `[T−20, T]`** | **`T − 5 s`** | **724 / 724** | **defasagem** 5,15–13,94 s, **zero lookahead** |
| teto `[T−20, T]` | `T − 11 s` | 724 / 724 | defasagem 11,15–19,94 s |
| teto `[T−20, T]` | `T − 12 s` | 704 / 724 | — (começa a cair: é o limite superior de `d`) |

A mesma simulação sobre os **3.822** da 2ª coleta: teto com `d = 0` e `d = 2 s` ⇒ **3.821/3.822** (perde o
caso `L < 0`, como ausência); **`d = 5 s` ⇒ 3.822/3.822**; `d = 10 s` ⇒ 3.822/3.822; `d = 11 s` ⇒
**3.817/3.822** (a cauda de 9,75 s já morde) `[MEDIDO: mesma aritmética, n=3.822]`.

## §3 — O offset da `T-03.4`: chamar em `T − 5 s`

**A aritmética.** Chamada enviada em `T − d` (relógio local), atraso `L = t_send − time ∈ [L_min, L_max]`
⇒ `time ∈ [T − d − L_max, T − d − L_min]`. A janela `[T − 20 s, T]` exige:

- `T − d − L_min ≤ T` ⇔ `d ≥ −L_min` — para o caso normal (`L_min` = 0,149 s) vale todo `d ≥ 0`; o caso
  `L = −2,24 s` de §2 exige `d ≥ 2,24 s`;
- `T − d − L_max ≥ T − 20 s` ⇔ `d ≤ 20 s − L_max` = **10,25 s** com a cauda de 9,75 s.

Sobre os **4.546** atrasos das duas coletas, **`d ∈ [2,3 s; 10,2 s]` admite 100%**. Escolho **`d = 5 s`**:

| `d` | `time` cai em (`L` de −2,24 a 9,75 s) | folga do lado fresco (`T`) | folga do lado velho (`T − 20 s`) | defasagem mediana |
|---|---|---|---|---|
| 2 s | `[T − 11,8; T + 0,2]` | **−0,2 s** — o caso `L < 0` vira ausência | 8,2 s | ~6,6 s |
| **5 s** ⭐ | **`[T − 14,8; T − 2,8]`** | **2,8 s** (5,1 s sem o caso `L < 0`) | **5,2 s** | **~9,6 s** |
| 10 s | `[T − 19,8; T − 7,8]` | 7,8 s | **0,2 s** | ~14,6 s |

(é **envelope de n=4.546, não distribuição** — a cauda cresceu a cada aumento de `n` e pode crescer de novo)

**Por que 5** `[INFERRED: escolha entre valores válidos, é julgamento]`: a folga do lado fresco é a
tolerância a **envio atrasado** (o caso de §2), a **relógio local atrasado** em relação ao da Binance e a
**loop de eventos ocupado** com os outros coletores do mesmo processo; a folga do lado velho é a tolerância
à **cauda de `L`**. Estourar qualquer uma **não gera lookahead** — gera ausência (§1) —, mas custa `DoD-1`.
`d = 5 s` é o que deixa as duas folgas da mesma ordem (2,8–5,1 × 5,2). `d = 2 s` já perdeu 1 em 3.822;
`d = 10 s` fica a 0,2 s de uma cauda que subiu 2,15 s entre `n=30` e `n=4.546`.

**O que a `T-03.4` tem de fazer para isto valer — é contrato da task, não sugestão:**

1. **Agendar no relógio de parede**, recalculando o alvo a cada ciclo (`próximo T` − 5 s), nunca
   `sleep(60)` encadeado: `sleep` encadeado deriva a latência de cada ciclo e atravessa a janela em horas.
2. **Carimbar pelo `time` da resposta** (via `stamp_open_interest_readings`), **nunca** pelo alvo do agendador.
   O agendador só escolhe quando chamar; quem decide o `T` é o `time`.
3. **Logar por chamada** (eventos e chaves em inglês, linha 10 do `CLAUDE.md`): `lag_ms = t_send − time`,
   `staleness_ms = T − time` (quando admitido) e o destino (`admitted`/`out_of_window`/`superseded`).
   É o que permite ao owner conferir o envelope em produção sem confiar neste arquivo.
4. **Retry opcional, um só, antes de `T`** (ex.: em `T − 2 s` se a primeira falhar, timeout HTTP ≤ 3 s).
   Retry depois de `T` é inofensivo pela §1 (cai ausente ou admitido corretamente), mas quase sempre inútil.
5. **Relógio da VPS sob NTP.** Medido aqui: `serverTime` da Binance − ponto médio local ≈ **+34 ms**
   (`curl /fapi/v1/time`, n=5, máquina de desenvolvimento) `[MEDIDO 2026-09-25]` — **não é a VPS**
   `[NÃO MEDIDO na VPS]`. O `lag_ms` do item 3 mede o desvio da VPS de graça: um `lag_ms` negativo isolado é
   envio travado (§2, 1 em 3.822); **um `p5` de `lag_ms` negativo** é relógio local atrasado de forma
   sistemática, e o offset precisa de revisão.

**`DoD-1` sob esta regra** (`≥ 0,95 × 1.440` por símbolo em 24 h): com `d = 5 s`, a leitura é admitida
⇔ `L ∈ [−5 s; 15 s]`, e **4.546 de 4.546** atrasos medidos estão nesse intervalo. A fração admitida só cai por
chamada falhada ou por `L` fora dele. **Falsificador**: se depois de 24 h a contagem ficar abaixo de
1.368/símbolo, olhar `lag_ms` das linhas `out_of_window` — se elas têm `L > 15 s` ou `L < −5 s`, o offset está
errado e volta a este dono com o número; se não têm (ou não existem, e o que falta são chamadas), o defeito
é do coletor, não do carimbo.

## §4 — O que muda no código da `T-03.2` (NEEDS_FIX)

Custo baixo **agora**: `grep -rln open_interest_grid_stamp backend/src backend/tests --include='*.py'`
devolve **1 arquivo, o próprio teste** `[MEDIDO 2026-09-25 em 67d8c0e]` — nenhum consumidor, nenhuma linha
escrita em `md.series`. Depois da `T-03.4` ligar, cada dia gravado com o piso é um dia de pontos com lookahead no banco.

1. **`admitted_grid_instant` — teto, não piso.** `T` = o instante de grade **no ou depois** de `time`;
   admite se `T − time ≤ 20 000`:

   ```python
   grid_instant = event_time_ms + (-event_time_ms) % OPEN_INTEREST_GRID_MS   # ceil
   if grid_instant - event_time_ms <= OPEN_INTEREST_ADMISSION_WINDOW_MS:
       return grid_instant
   return None
   ```

   Fechada nas duas pontas como hoje: `time = T` ⇒ `T` (defasagem 0); `time = T − 20 000` ⇒ `T`;
   `time = T − 20 001` ⇒ ausente. **`time = T + 1 ms` ⇒ vai para `T + 1 min` com defasagem 59 999 ⇒ ausente,
   nunca puxado para trás até `T`** — é este caso que prende o lookahead.
2. **Desempate: a leitura de maior `time` vence**, não a primeira da entrada. Empate de `time` (o cache da
   Binance devolve o mesmo snapshot a chamadas seguidas, §2) ⇒ a primeira fica, as outras vão para
   `superseded`. A contabilidade de três destinos (`admitted + out_of_window + superseded == entrada`) fica.
3. **`StampedOpenInterest.__post_init__`** não muda de texto — ele chama `admitted_grid_instant`, então
   herda o teto. O teste de *"valor carregado não é representável"* continua valendo: um valor de um minuto
   anterior tem defasagem `> 20 s` no `T` seguinte.
4. **Comentários/docstrings** (`:1`, `:3-28`, `:51-56`, `:112`): reescrever para `[T − 20 s, T]`, teto, e
   *"a mais fresca até `T`"*. O parágrafo *"Rounding would admit readings the source took BEFORE T … the
   look-ahead in reverse"* sai — ele é o raciocínio invertido (§1).
5. **Testes** (`backend/tests/sentimento/test_open_interest_grid_stamp.py`):
   - bordas: `T`, `T − 20 000` admitidos em `T`; `T − 20 001` ausente;
   - **`T + 1 ms` não é puxado para `T`** (substitui `test_one_millisecond_before_the_grid_instant_is_not_pulled_forward`);
   - captura real de `T-03.1`: **as duas passam a ser admitidas** em `1_790_287_800_000`, com defasagem
     **6 297 ms** (BTC) e **8 965 ms** (ETH) — substitui `test_the_real_capture_of_t_03_1_lands_outside_every_window`
     `[MEDIDO: aritmética sobre os literais das linhas 26-27 do teste]`;
   - varredura: para `time = T0 + offset`, `offset ∈ [0, 60 000)`, admitidos exatamente `{0} ∪ [40 000, 59 999]`
     (`0` ⇒ `T0`; os demais ⇒ `T0 + 1 min`) — **20 001 offsets**, mesma contagem de hoje;
   - (as quatro linhas acima conferidas numa cópia da regra de teto no scratchpad: bordas, `T + 1 ms ⇒ None`,
     varredura `== [0] + range(40000, 60000)` e as defasagens 6 297/8 965 `[MEDIDO 2026-09-25]`);
   - **propriedade anti-lookahead** (a verificação de §1 como teste): para todo carimbo admitido,
     `0 ≤ grid_instant_ms − event_time_ms ≤ 20 000`;
   - desempate: duas leituras do mesmo `(symbol, T)` dadas **em ordem inversa** ⇒ vence a de maior `time`.
6. **Mutações que têm de morrer** (bateria do builder, reapontada): `M5'` **piso no lugar do teto** (a regra
   de hoje) — tem de reprovar ≥ 3 testes, incluindo a propriedade anti-lookahead e a captura real;
   `M6'` **primeira vence em vez da mais fresca**; `M3`/`M4`/`M7` como estão.

## §5 — O que isto não decide

- **Emenda de `SPEC-009` §6.1.** A frase *"a primeira chamada feita em `T` ou depois dele cujo `time` fique
  em `[T, T + 20 s]`"* precisa virar *"a leitura de maior `time` em `[T − 20 s, T]`"*. `[Q-STAMP-1]` é
  **inferível com dono de validação `quant-architect`** (`SPEC-009` §11) — mudar o default é o desfecho que
  a delegação previa —, mas a SPEC é artefato que o owner aprovou, então a emenda vai **por exceção** ao
  owner, com este arquivo como justificativa. Quem escreve a emenda: orquestrador/`/architect`.
- **Disponibilidade para `backtest`/`convergencia`.** Com o teto e o offset `T − 5 s`, a leitura de `T`
  chega **antes** de `T` na quase totalidade dos casos `[INFERRED: envio em T − 5 s + ida e volta p50 0,31 s /
  máx 0,85 s (n=724); a exceção é o envio travado de §2, ida e volta 5,31 s]`. Isso sugere que a disponibilidade modelada do polling pode ser
  `T`, e não `T + 1 min` como no `openInterestHist` (`LIQ-1` §fronteira). **Não decido isso aqui**
  `[NÃO MEDIDO em produção: medido de uma máquina de desenvolvimento, não da VPS]` — quem liga um consumidor
  que decide mede `t_recv − T` nas linhas reais antes de usar.
- **O falsificador de `SPEC-009` §6.2** (poll × hist ≤ 10 bp) continua com o dono dele (item `3.4` do plano);
  §6 só informa o que foi visto.

## §6 — Sinal lateral: o teto é também o que casa com o regime histórico

Pergunta testada, porque ela decidiria se o teto quebra `ADR-045/D2-bis` (*"dois regimes, uma função"*):
**o `hist(T)` do `openInterestHist` 5 min é o OI de ATÉ `T`, ou de DEPOIS de `T`?** Se fosse de depois, o
regime histórico teria a convenção do piso, e os dois regimes discordariam na direção.

**Método:** para cada `(símbolo, T)` de 5 min coberto pela 2ª coleta com folga de −120 s a +420 s, compara
`hist(T)` com o poll **as-of** `T + k` (a última leitura com `time ≤ T + k`), `k` de −120 s a +420 s em passos
de 30 s; mede `|poll − hist| / hist` em bp. Endpoint `GET /futures/data/openInterestHist?period=5m&limit=8`,
campo `sumOpenInterest`. **Universo: 6 símbolos × 4 instantes = 24 comparações** `[MEDIDO 2026-09-25, analyze2.py]`.

| `k` | −120 s | −60 s | **−30 s** | **0** | +30 s | +60 s | +120 s | +300 s | +420 s |
|---|---|---|---|---|---|---|---|---|---|
| mediana `|Δ|` (bp, n=24) | 9,49 | 5,00 | **3,58** | **3,72** | 4,88 | 5,78 | 6,79 | 11,77 | 18,74 |

**Leitura:** o mínimo fica em **`k ∈ [−30 s; 0]`** ⇒ `hist(T)` é **compatível** com o OI até `T`, a convenção
do teto, e **não** com um valor de minutos depois. **O limite da evidência, declarado:** a resolução é de 30 s,
e entre `k = 0` e `k = +30 s` a mediana sobe só 1,2 bp — **isto não distingue o teto do piso na escala de
10 s**. Não é o argumento do veredito; o argumento é §1 (causalidade), e este §6 só mostra que o teto **não
cria** discordância com o regime histórico. Uma 1ª leitura com `n=2` havia sugerido `hist(T)` ≈ valor de
~5 min depois; **com `n=24` isso é refutado** (a +300 s a mediana é 11,77 bp, 3× o mínimo) — fica registrado
para ninguém repetir a conclusão do `n` pequeno.

**O que sobra, e não é deste julgamento:** mesmo no mínimo, há um **deslocamento de nível por símbolo**,
estável nos 4 instantes: em `k = 0`, **ETH 7,6–8,5 bp**, BNB 4,5–4,9, DOGE 4,2–4,6, SOL 2,9–3,3, BTC 0,7–2,0,
XRP 0,6–1,6 `[MEDIDO, n=4 por símbolo]`. O limiar do falsificador de §6.2 é **10 bp na mediana**: o ETH passa,
mas **a ~1,5 bp da borda**, antes de a captura ligar. Se o falsificador reprovar só no ETH, a causa provável é
esse deslocamento de nível entre os dois endpoints `[INFERRED]`, não o carimbo — e a decisão é do
`/architect`, com este número.

## Apêndice — o coletor de medição, para reproduzir sem confiar neste arquivo

O scratchpad da sessão não sobrevive; o script sim, aqui. Peso: 1 por chamada (`SPEC-009` §6.1 `[DOC]`),
~120/min com 6 símbolos, 5% do teto de 2.400. Nenhuma chave, nenhuma escrita fora do arquivo local.

```python
import json, time, urllib.request
SYMS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT")
BASE = "https://fapi.binance.com"
out, end = open("poll2.ndjson", "w"), time.time() + 26 * 60
while time.time() < end:
    for sym in SYMS:
        t0 = int(time.time() * 1000)
        r = json.load(urllib.request.urlopen(f"{BASE}/fapi/v1/openInterest?symbol={sym}", timeout=5))
        r.update(t_send=t0, t_recv=int(time.time() * 1000)); out.write(json.dumps(r) + "\n")
    time.sleep(0.5)
for sym in SYMS:  # 5-min history for §6, fetched after the poll so every covered T is published
    h = urllib.request.urlopen(f"{BASE}/futures/data/openInterestHist?symbol={sym}&period=5m&limit=8").read()
    open(f"hist2_{sym}.json", "wb").write(h)
```

- §2: `L = t_send − time` por linha; quantis sobre todas as linhas.
- §3: para cada `d`, admitido ⇔ `0 ≤ d + L ≤ 20 s`.
- §6: para cada `hist(T)` coberto de `T − 120 s` a `T + 420 s`, a última leitura com `time ≤ T + k`, e
  `|poll − hist| / hist × 10⁴`; mediana por `k`.
